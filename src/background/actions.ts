import {DownloadRequestHeaders, DownloadRequestItem} from "~/interfaces/DownloadRequestItem";
import * as backend from "~/backend/Backend";
import {AppApiError, NetworkError} from "~/backend/BackendError";
import * as DialogUtils from "~/utils/DialogUtil";
import browser from "webextension-polyfill";
import {defaultDownloadRequestOptions, DownloadRequestOptions} from "~/interfaces/DownloadRequestOptions";
import {getLatestConfig} from "~/configs/Config";
import {run} from "~/utils/ScopeFunctions";

export async function addDownload(
    data: DownloadRequestItem[],
) {
    const config = getLatestConfig()
    const options: DownloadRequestOptions = {...defaultDownloadRequestOptions}
    if (config.silentAddDownload) {
        options.silentAdd = true
        options.silentStart = config.silentStartDownload
    }
    const response = !!await usingBackend(async () => {
        return await backend.addDownload(data, options)
    });
    if (response && config.silentAddDownload && data.length == 1) {
        run(() => {
            try {
                browser.notifications?.create({
                    type: "basic",
                    iconUrl: browser.runtime.getURL("icons/icon-128.png"),
                    title: browser.i18n.getMessage("abdm_notification_title"),
                    message: browser.i18n.getMessage("abdm_notification_download_captured_silently")
                })
            } catch (e) {
                console.log("can't send notifications")
            }
        })
    }
    return response
}

export interface YtDlpVideoDownloadData {
    pageUrl: string
    pageTitle?: string
    videoSrc?: string
}

/**
 * Handles the IDM-style "Download video" button click from the content script:
 * opens the yt-dlp dialog in the desktop app with the page URL prefilled.
 */
export async function requestYtDlpVideoDownload(
    data: YtDlpVideoDownloadData,
): Promise<boolean> {
    return await usingBackend(async () => {
        return await backend.ytdlpVideoDownload(data.pageUrl)
    }) ?? false
}

export interface YtDlpPanelFetchInfoData {
    pageUrl: string
}

/**
 * IDM-style download panel: fetch video info (title + formats) from the
 * desktop app without opening any dialog.
 *
 * NOTE: intentionally NOT wrapped in usingBackend() — that helper swallows
 * errors and the panel needs the real failure reason to display it.
 */
export async function requestYtDlpPanelFetchInfo(
    data: YtDlpPanelFetchInfoData,
) {
    return await backend.ytdlpFetchInfo(data.pageUrl)
}

export interface YtDlpPanelDownloadData {
    pageUrl: string
    formatId: string
    title?: string
}

/**
 * IDM-style download panel: start the download in the app background
 * (no dialog opened).
 */
export async function requestYtDlpPanelDownload(
    data: YtDlpPanelDownloadData,
): Promise<boolean> {
    return await backend.ytdlpPanelDownload(data.pageUrl, data.formatId, data.title)
        .catch(() => false)
}

export async function getHeadersForUrls(urls: string[]) {
    return Promise.all(urls.map(async url => {
        return await getHeadersForUrl(url)
    }));
}

export async function getHeadersForUrl(
    url: string,
): Promise<DownloadRequestHeaders | null> {
    try {
        let headers: DownloadRequestHeaders = {}
        const cookie = (await browser.cookies.getAll({
            url: url,
        })).map((cookie) => {
            return `${cookie.name}=${cookie.value}`
        }).join("; ")
        headers["Cookie"] = cookie
        headers["Host"] = new URL(url).host
        headers["User-Agent"] = navigator.userAgent
        return headers
    } catch (e) {
        console.log(e)
        return null
    }
}

async function usingBackend<T>(block: () => T) {
    try {
        return await block()
    } catch (e) {
        if (e instanceof AppApiError) {
            const friendlyNote = browser.i18n.getMessage("connection_error_api_error")
            const loggableReason = e.toLoggableString()
            await DialogUtils.showAlertInCurrentTab(
                `${friendlyNote}\n${loggableReason}`
            )
        } else if (e instanceof NetworkError) {
            await DialogUtils.showAlertInCurrentTab(
                browser.i18n.getMessage("connection_error_network_error")
            )
        }
        console.log("Error when using backend api", e)
    }
}

