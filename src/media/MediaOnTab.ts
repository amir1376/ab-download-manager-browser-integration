import browser from "webextension-polyfill";
import {InterceptedMediaResult, InterceptedMediaType} from "~/linkgrabber/LinkGrabberResponse";
import {inRange} from "~/utils/NumberUtils";
import {run} from "~/utils/ScopeFunctions";
import {Resolution, Variant} from "hls-parser/types";
import * as HLSUtils from "~/media/HLSUtils";
import * as MultiMediaUtils from "~/media/MultiMediaUtils"
import HLS from "hls-parser"
import {getContentDisposition, getContentLength, getContentType} from "~/utils/HeaderUtils";
import {getFileExtension, getFileFromUrl, getFileNameWithoutExtension} from "~/utils/URLUtils";
import {getFileNameFromHeader} from "~/utils/ExtractFileNameFromHeader";
import {MAX_HLS_PLAYLIST_SIZE} from "~/media/HLSUtils";

type MediaLinkToProcess = {
    pageIndex: number, // if this is not the same as current page index then we don't process it
    link: string,
    requestHeaders?: Record<string, string>,
    resolution?: Resolution,
    framerate?: number,
    bandwidth?: number,
    name?: string,
    fileExtension?: string,
    type?: InterceptedMediaType,
    isEncrypted?: boolean,
    duration?: number,
    size?: number,
    myVariant?: Variant,
    isProcessed: boolean, // when it is processed
}

export interface OnMedialListUpdated {
    onListUpdated(list: DownloadableMedia[]): void;
}

function applyHeadersToProcessingItem(mediaToProcess: MediaLinkToProcess, requestHeaders: Headers) {
    const headersRecord: Record<string, string> = {}
    requestHeaders.forEach((value, key) => {
        headersRecord[key] = value
    })
    mediaToProcess.requestHeaders = headersRecord
    return headersRecord
}

export class MediaOnTab {
    private currentMediaToProcess: Record<string, MediaLinkToProcess> = {}
    private isClosed = false
    private pageIndex = 0

    public constructor(
        public tabId: number,
        private onMediaListUpdated: OnMedialListUpdated
    ) {
    }

    close(): void {
        this.reset()
        this.isClosed = true;
    }

    private isCanceled(
        mediaLinkToProcess: MediaLinkToProcess,
    ) {
        if (this.isClosed) {
            return true
        }
        return this.pageIndex !== mediaLinkToProcess.pageIndex;
    }

    reset() {
        this.pageIndex++
        this.currentMediaToProcess = {}
    }

    getOrCreateProcessingMedia(uri: string) {
        const current = this.currentMediaToProcess[uri]
        if (typeof current === "object") {
            return current;
        }

        const newObject: MediaLinkToProcess = {
            link: uri,
            pageIndex: this.pageIndex,
            isProcessed: false,
        };
        this.currentMediaToProcess[uri] = newObject;
        return newObject
    }

    async process(
        mediaResult: InterceptedMediaResult
    ) {
        if (this.isAlreadyProcessed(mediaResult.url)) {
            return
        }

        switch (mediaResult.mediaType) {
            case "hls":
                await this.processHLS(
                    mediaResult.url,
                    mediaResult.requestHeaders
                )
                break
            case "http":
                await this.processHttp(
                    mediaResult.url,
                    mediaResult.requestHeaders,
                    mediaResult.responseHeaders,
                )
                break;
        }
    }

    private async processHttp(
        url: string, requestHeaders: Headers, responseHeaders: Headers,
    ) {
        const mediaToProcess = this.getOrCreateProcessingMedia(url);
        if (mediaToProcess.isProcessed) {
            return
        }
        mediaToProcess.isProcessed = true;
        mediaToProcess.type = "http"
        applyHeadersToProcessingItem(mediaToProcess, requestHeaders)
        let filenameWithExtension: string | null = null;
        let extension: string | null = null;
        const contentDisposition = getContentDisposition(responseHeaders);
        if (contentDisposition) {
            filenameWithExtension = getFileNameFromHeader(contentDisposition)
        }
        if (!filenameWithExtension) {
            filenameWithExtension = getFileFromUrl(url)
        }
        if (filenameWithExtension) {
            extension = getFileExtension(filenameWithExtension)
        }
        if (!extension) {
            const contentType = getContentType(responseHeaders)
            if (contentType) {
                extension = MultiMediaUtils.getExtensionFromContentType(contentType)
            }
        }
        if (!extension) {
            // no extension ignore it
            return
        }
        mediaToProcess.fileExtension = extension
        if (filenameWithExtension) {
            mediaToProcess.name = getFileNameWithoutExtension(filenameWithExtension)
        }
        mediaToProcess.size = getContentLength(responseHeaders) ?? undefined
        this.onMediaProcessed(mediaToProcess)
    }

    private async processHLS(url: string, requestHeaders: Headers) {
        const mediaToProcess = this.getOrCreateProcessingMedia(url);
        if (mediaToProcess.isProcessed) {
            return
        }
        mediaToProcess.isProcessed = true // even if it fails!
        const request = new Request(url, {
            headers: requestHeaders
        });
        const content = await fetchHSLText(request)
        if (content == null) {
            return
        }
        const playlist = this.parseHLS(content)
        if (playlist == null) {
            return
        }
        if (playlist.isMasterPlaylist) {
            const playListEncrypted = HLSUtils.isPlayListEncrypted(playlist);
            for (let variant of playlist.variants) {
                const processingMedia = this.getOrCreateProcessingMedia(variant.uri);

                if (playListEncrypted) {
                    processingMedia.isEncrypted = true
                    continue
                }
                processingMedia.myVariant = variant
            }
            if (playListEncrypted) {
                return
            }
            playlist.variants.forEach(variant => {
                    const newRequest = run(() =>
                        resolveVariantUrl(request, variant.uri)
                    )
                this.processHLS(newRequest.url, newRequest.headers)
                }
            )
        } else {
            if (playlist.segments.length == 0) {
                return // empty list?
            }
            const filename = getFileFromUrl(playlist.segments[0].uri)
            const extension = filename && getFileExtension(filename)
            if (extension !== "ts") {
                return // we only support ts files for now
            }
            mediaToProcess.fileExtension = extension
            mediaToProcess.type = "hls"
            mediaToProcess.link = request.url
            mediaToProcess.duration = playlist.segments.reduce(
                (total, value) => total + value.duration,
                0,
            )
            mediaToProcess.bandwidth = mediaToProcess.myVariant?.bandwidth
            mediaToProcess.resolution = mediaToProcess.myVariant?.resolution
            mediaToProcess.framerate = mediaToProcess.myVariant?.frameRate
            mediaToProcess.isEncrypted = mediaToProcess.isEncrypted || HLSUtils.isMediaPlayListEncrypted(playlist)
            // it only needed for media playlist
            applyHeadersToProcessingItem(mediaToProcess, requestHeaders)
            this.onMediaProcessed(mediaToProcess)
        }
    }


    parseHLS(
        hlsContent: string,
    ) {
        return run(() => {
            try {
                return HLS.parse(hlsContent)
            } catch (e) {
                return null
            }
        })
    }

    private isAlreadyProcessed(link: string) {
        return this.currentMediaToProcess[link]?.isProcessed ?? false
    }

    async getTab() {
        try {
            return (await browser.tabs.get(this.tabId))
        } catch (e) {
            return null
        }
    }

    private async onMediaProcessed(
        media: MediaLinkToProcess
    ) {
        if (this.isCanceled(media)) {
            return
        }
        await this.reloadList()
    }

    private async reloadList() {
        const tab = await this.getTab()
        if (!tab) {
            return
        }
        const tabTitle = tab.title
        const tabUrl = tab.url
        if (!tabTitle || !tabUrl) {
            return
            // tab title is not defined
        }

        const downloadableMediaList = Object
            .entries(this.currentMediaToProcess)
            .map(([_, value]) => {
                return createDownloadableMedia(
                    value,
                    {
                        pageTitle: tabTitle,
                        pageUrlHash: shortSafeHash(tabUrl, 6),
                    });
            })
            .filter(i => i != null)
        this.onMediaListUpdated.onListUpdated(downloadableMediaList)
    }


}

export type DownloadableMedia = {
    type: InterceptedMediaType,
    uri: string,
    requestHeaders?: Record<string, string>,
    displayName?: string
    suggestedFullName?: string,
    duration?: string,
    bandwidth?: string,
    resolution?: string,
    extension?: string,
    size?: string,
}

function createBandwidthString(bandwidth: number) {
    const kbps = Math.round(bandwidth / 1000); // 500 kbps
    return `${kbps}kbps`
}

function createSizeString(size: number): string {
    if (size < 1024) return `${size} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let unitIndex = -1;
    do {
        size /= 1024;
        unitIndex++;
    } while (size >= 1024 && unitIndex < units.length - 1);
    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function createDownloadableMedia(
    mediaLinkToProcess: MediaLinkToProcess,
    pageInfo: {
        pageTitle: string
        pageUrlHash: string
    },
): DownloadableMedia | null {
    if (!mediaLinkToProcess.type) {
        // console.log("media doesn't have type", {mediaLinkToProcess})
        return null
    }
    if (mediaLinkToProcess.isEncrypted) {
        // console.log("media is encrypted", {mediaLinkToProcess})
        return null
    }
    if (!mediaLinkToProcess.fileExtension) {
        // console.log("media has no file extension", {mediaLinkToProcess})
        return null
    }

    const mediaProps = []
    let name: string
    if (mediaLinkToProcess.name) {
        name = mediaLinkToProcess.name
        mediaProps.push(name)
    } else {
        name = pageInfo.pageTitle
        mediaProps.push(pageInfo.pageTitle)
        mediaProps.push(pageInfo.pageUrlHash)
    }

    let resolutionString: string | undefined
    if (mediaLinkToProcess.resolution) {
        resolutionString = createResolutionString(mediaLinkToProcess.resolution);
        mediaProps.push(
            resolutionString
        )
    }
    if (mediaLinkToProcess.framerate) {
        mediaProps.push(
            `${mediaLinkToProcess.framerate}fps`
        )
    }

    let durationString: string | undefined = undefined
    if (typeof mediaLinkToProcess.duration == "number") {
        durationString = createDurationString(mediaLinkToProcess.duration)
    }
    let bandwidthString: string | undefined = undefined
    if (typeof mediaLinkToProcess.bandwidth == "number") {
        bandwidthString = createBandwidthString(mediaLinkToProcess.bandwidth)
    }
    let sizeString: string | undefined = undefined
    if (typeof mediaLinkToProcess.size == "number") {
        sizeString = createSizeString(mediaLinkToProcess.size)
    }
    return {
        uri: mediaLinkToProcess.link,
        requestHeaders: mediaLinkToProcess.requestHeaders,
        displayName: name,
        suggestedFullName: mediaProps.join("-") + "." + mediaLinkToProcess.fileExtension,
        type: mediaLinkToProcess.type,
        duration: durationString,
        extension: mediaLinkToProcess.fileExtension,
        size: sizeString,
        resolution: resolutionString,
        bandwidth: bandwidthString,
    }
}

function createResolutionString(resolution: Resolution) {
    return `${resolution.width}p`
}


function createDurationString(duration: number) {
    const seconds = Math.floor(duration % 60)
    const minutes = Math.floor((duration / 60) % 60)
    const hours = Math.floor(duration / 3600)
    const m = minutes.toString().padStart(2, "0");
    const s = seconds.toString().padStart(2, "0");
    if (hours == 0) {
        return `${m}:${s}`
    } else {
        const h = hours.toString().padStart(2, "0");
        return `${h}:${m}:${s}`
    }
}


async function fetchHSLText(
    request: Request
) {
    const acceptedContentTypes = HLSUtils.HLS_CONTENT_TYPES
    const maxHLSPlaylistSize = HLSUtils.MAX_HLS_PLAYLIST_SIZE

    const response = await run(async () => {
        try {
            return await fetch(request);
        } catch (e) {
            return null
        }
    })
    if (!response) {
        return null
    }
    if (!inRange(response.status, 200, 299)) {
        return null;
    }
    const contentType = response
        .headers
        .get("Content-Type")
        ?.toLowerCase()
    if (!contentType) {
        return null
    }
    const contentTypeMatch = acceptedContentTypes.some(
        item => contentType.startsWith(item)
    )
    const length = getContentLength(response.headers)
    let largeOrUnknownSize = true
    if (length !== null && length < maxHLSPlaylistSize) {
        largeOrUnknownSize = false
    }
    // some servers don't send proper content-type (@see HLSUtils.HLS_CONTENT_TYPES)
    // however we parse the data as the request contains m3u8 in its url (we've already filtered the requests that matching m3u8 in [browder.webRequest])
    // which probably contains playlist
    // we first check content type if its valid we don't care about the size
    // if the content type is not available we only proceed
    // if the content-length exists and is smaller than max allowed size
    if (contentTypeMatch || !largeOrUnknownSize) {
        return await response.text();
    }
    return null
}


function resolveVariantUrl(
    request: Request, // manifest request
    variantUrl: string,
) {
    try {
        const parsed = new URL(variantUrl, request.url);
        const o: Request = new Request(parsed.toString())
        request.headers.forEach((value, key, _) => {
            o.headers.set(key, value);
        })
        return o
    } catch (e) {
        return new Request(variantUrl)
    }
}

/**
 * Generates a short unique string based on a URL.
 * This helps when a user downloads multiple videos from the same website,
 * as the default file names might be identical. The generated string
 * serves as a postfix to differentiate the files.
 */
function shortSafeHash(url: string, length = 6): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
        // mix character codes with a prime to reduce collisions
        hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
    }
    let str = '';
    for (let i = 0; i < length; i++) {
        str = String.fromCharCode(97 + (hash % 26)) + str;
        hash = Math.floor(hash / 26);
    }
    return str;
}
