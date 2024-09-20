import {getLatestConfig} from "~/configs/Config";
import {isNullOrBlank} from "~/utils/StringUtils";
import * as Configs from "~/configs/Config";
import {inRange} from "~/utils/NumberUtils";
import {DownloadRequestItem} from "~/interfaces/DownloadRequestItem";
import {addDownload} from "~/background/actions";
import {run} from "~/utils/ScopeFunctions";
import browser from "webextension-polyfill";
import type {WebRequest} from "webextension-polyfill";
import {getFileNameFromHeader} from "~/utils/ExtractFileNameFromHeader";
import {isChrome} from "~/utils/ExtensionInfo";
import urlMatch from "match-url-wildcard"

// import OnHeadersReceivedOptions = WebRequest.OnHeadersReceivedOptions;


export abstract class DownloadLinkInterceptor {
    protected readonly pendingRequests: Record<string, WebRequest.OnSendHeadersDetailsType | undefined> = {}
    protected readonly responses: Record<string, WebRequest.OnHeadersReceivedDetailsType> = {}


    protected setPendingRequest(id: string, requestHeaders: WebRequest.OnSendHeadersDetailsType) {
        this.pendingRequests[id] = requestHeaders
    }

    removePendingRequest(id: string) {
        delete this.pendingRequests[id]
    }

    protected readonly newTabs: Record<number, string> = {}

    protected addItemToNewTabs(tabId: number, link: string) {
        this.newTabs[tabId] = link
    }

    protected removeItemInNewTabs(tabId: number) {
        delete this.newTabs[tabId]
    }

    //utils

    protected isBlacklist(details: WebRequest.OnHeadersReceivedDetailsType) {
        const blackList = Configs.getLatestConfig().blacklistedUrls
        if (blackList.length == 0) {
            return false
        }
        const requestedUrl = details.originUrl || details.url
        return urlMatch(requestedUrl, blackList)
    }

    protected isWebPageComponents(details: WebRequest.OnHeadersReceivedDetailsType) {
        const contentType = details.responseHeaders?.find((header) => {
            return header.name.toLowerCase() === "content-type"
        })?.value
        if (contentType?.toLowerCase().startsWith("text/")) {
            return true
        }
        return false
    }

    protected getFileExtension(name: string): string {
        return name
            .split(".")
            .pop() ?? name
    }

    protected getFileFromUrl(url: string): string | null {
        return new URL(url).pathname.split("/").pop() ?? null
    }

    protected getFileFromHeaders(responseHeaders: WebRequest.HttpHeaders | undefined) {
        if (!responseHeaders) return null
        const foundValues = responseHeaders.filter((header) => {
            return header.name.toLowerCase() == "content-disposition" && !isNullOrBlank(header.value)
        }).map((value) => {
            return value.value as string
        })
        if (foundValues.length == 0) {
            return null
        }
        const extractedNames = foundValues.map((value) => {
            return getFileNameFromHeader(value)
        }).filter((value) => {
            return value !== null
        }) as string[]
        if (extractedNames.length == 0) {
            return null
        }
        return extractedNames[0]
    }

    protected isInRegisteredFileFormats(fileExtension: string) {
        const extension = fileExtension.toLowerCase()
        if (!Configs.getLatestConfig().registeredFileTypes.includes(extension)) {
            return false
        }
        return true
    }

    protected shouldHandleRequest(details: WebRequest.OnHeadersReceivedDetailsType) {
        if (!(details.type === "main_frame" || details.type === "sub_frame")) {
            // console.log("capture_error","frame type is not captured",details.type)
            return false
        }
        if (details.method !== "GET") {
            // console.log("capture_error","method not supported",details.method)
            // we only handle GET method
            return false
        }
        if (!Configs.getLatestConfig().autoCaptureLinks) {
            // console.log("capture_error","auto capture disabled")
            return false
        }
        if (!inRange(details.statusCode, 200, 299)) {
            // console.log("capture_error","not success",details.statusCode)
            return false
        }
        if (this.isWebPageComponents(details)) {
            // console.log("capture_error","is Web component")
            return false
        }
        if (this.isBlacklist(details)) {
            return false
        }
        let fileName = this.getFileFromHeaders(details.responseHeaders)
        if (fileName === null) {
            fileName = this.getFileFromUrl(details.url)
        }
        if (fileName == null) {
            // console.log("capture_error","filename isNull")
            return false
        }
        const ext = this.getFileExtension(fileName)
        if (!this.isInRegisteredFileFormats(ext)) {
            // console.log("capture_error",`extension is not registered`,ext)
            return false
        }
        return {
            fileName: fileName
        }
    }

    protected async requestAddDownload(item: DownloadRequestItem) {
        const result = await addDownload([item])
        if (getLatestConfig().allowPassDownloadIfAppNotRespond) {
            return result
        }
        return true
    }

    protected createItemFromWebRequest(
        request: WebRequest.OnSendHeadersDetailsType,
    ): DownloadRequestItem {
        let headers: Record<string, string> | null = null
        if (request?.requestHeaders) {
            headers = {}
            request.requestHeaders.forEach((header) => {
                if (header.value) {
                    headers![header.name] = header.value
                }
            })
        }
        return {
            link: request.url,
            headers: headers,
            downloadPage: request.originUrl ?? null,
            description: null
        }
    }

    protected isItNewTab(tabId: number) {
        const link = this.newTabs[tabId]
        return link !== undefined
    }


    protected async closeIfItWasNewTab(request: WebRequest.OnSendHeadersDetailsType) {
        if (!getLatestConfig().closeNewTabIfItWasCaptured) {
            return
        }
        const tabId = request.tabId
        if (this.isItNewTab(tabId)) {
            await browser.tabs.remove(tabId)
        }
    }

    // end of helper functions

    redirectDownloadsToExtension() {
        const filter: WebRequest.RequestFilter = {
            urls: ["*://*/*"],
        }
        browser.tabs.onCreated.addListener((tab) => {
            if (tab.id && tab.url) {
                this.addItemToNewTabs(tab.id, tab.url)
            }
        })
        browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.url) {
                this.removeItemInNewTabs(tabId)
            }
        })
        browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
            this.removeItemInNewTabs(tabId)
        })
        browser.webRequest.onSendHeaders.addListener(
            (details) => {
                this.setPendingRequest(details.requestId, details)
            },
            filter,
            run(() => {
                const extra: WebRequest.OnSendHeadersOptions[] = ["requestHeaders"]
                if (isChrome()) {
                    // chrome does not give us all headers unless we ask it
                    extra.push("extraHeaders")
                }
                return extra
            })
        )
        browser.webRequest.onErrorOccurred.addListener(
            (details) => {
                this.removePendingRequest(details.requestId)
            },
            filter,
        )
        browser.webRequest.onCompleted.addListener(
            (details) => {
                this.removePendingRequest(details.requestId)
            },
            filter
        )
        browser.webRequest.onHeadersReceived.addListener(
            async (details) => {
                let shouldRemoveResponseInFinallyImmediately: boolean = true
                try {
                    const result = this.shouldHandleRequest(details);
                    this.responses[details.requestId] = details
                    if (result === false) {
                        return this.passResponse()
                    }
                    const request = this.pendingRequests[details.requestId]
                    if (request === undefined) {
                        return this.passResponse()
                    }
                    const downloadRequestItem = this.createItemFromWebRequest(request)
                    const requestAccepted = await this.requestAddDownload(downloadRequestItem);
                    if (requestAccepted) {
                        if (!this.canBlockResponse()) {
                            // in chrome, we must cancel download using downloads api
                            // so, we must let this response be available a little
                            // then removing it
                            shouldRemoveResponseInFinallyImmediately = false
                        }
                        await this.onDownloadSendToAppSuccess(request)
                        // if (!isBrowserHonorRequestBlocking()){
                        //     delete cancelledBrowserDownloads[details.requestId]
                        // }
                        //cancel browser request
                        return this.cancelResponse()
                    } else {
                        await this.onDownloadSendToAppFailed(request)
                        // if (!isBrowserHonorRequestBlocking()){
                        //     startDownloadUsingNativeBrowser(request)
                        // }
                    }
                    return this.passResponse()
                } finally {
                    if (shouldRemoveResponseInFinallyImmediately) {
                        // we not accept this url or does not need to delay its removal
                        delete this.responses[details.requestId]
                    } else {
                        // we buy some time for this response
                        // to cancel browser download in somewhere else
                        // I think 5 sec is enough
                        setTimeout(() => {
                            delete this.responses[details.requestId]
                        }, 5_000)
                    }
                }
            },
            filter,
            run(() => {
                const extra: WebRequest.OnHeadersReceivedOptions[] = ["responseHeaders"]
                if (this.canBlockResponse()) {
                    extra.push("blocking")
                }
                return extra
            })
        )
    }

    async onDownloadSendToAppSuccess(request: WebRequest.OnSendHeadersDetailsType) {
        await this.closeIfItWasNewTab(request)
    }

    async onDownloadSendToAppFailed(request: WebRequest.OnSendHeadersDetailsType) {
        // nothing
    }

    abstract passResponse(): any

    abstract cancelResponse(): any

    abstract canBlockResponse(): boolean
}
