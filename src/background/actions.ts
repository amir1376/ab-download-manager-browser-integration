import {DownloadRequestHeaders, DownloadRequestItem} from "~/interfaces/DownloadRequestItem";
import * as backend from "~/backend/Backend";
import {ApiError, NetworkError} from "~/backend/ApiError";
import * as DialogUtils from "~/utils/DialogUtil";
import browser from "webextension-polyfill";

export async function addDownload(data: DownloadRequestItem[]) {
    return !!(await usingBackend(async () => {
        return await backend.addDownload(data)
    }))
}

export async function getHeadersForUrls(urls:string[]){
    return Promise.all(urls.map(async url => {
        return await getHeadersForUrl(url)
    }));
}
export async function getHeadersForUrl(
    url: string,
): Promise<DownloadRequestHeaders | null> {
    try {
        let headers:DownloadRequestHeaders={}
        const cookie = (await browser.cookies.getAll({
            url: url,
        })).map((cookie) => {
            return `${cookie.name}=${cookie.value}`
        }).join("; ")
        headers["Cookie"]=cookie
        headers["Host"]=new URL(url).host
        headers["User-Agent"]=navigator.userAgent
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
        if (e instanceof ApiError) {
            DialogUtils.showAlertInCurrentTab(
                browser.i18n.getMessage("connection_error_api_error")
            )
        } else if (e instanceof NetworkError) {
            DialogUtils.showAlertInCurrentTab(
                browser.i18n.getMessage("connection_error_network_error")
            )
        } else {
            console.log("unknown error", e)
        }
    }
}

