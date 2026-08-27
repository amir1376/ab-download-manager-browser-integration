import browser, {Downloads, WebRequest} from "webextension-polyfill"
import {AddressRefreshCaptureCoordinator} from "./AddressRefreshCaptureCoordinator"
import {isChrome} from "~/utils/ExtensionInfo"

export async function bootAddressRefreshObserverV2(): Promise<() => void> {
    const coordinator = new AddressRefreshCaptureCoordinator()
    await coordinator.boot()
    const dispose: Array<() => void> = []
    const filter: WebRequest.RequestFilter = {urls: ["http://*/*", "https://*/*"]}
    const before = (details: WebRequest.OnBeforeRequestDetailsType) => coordinator.observeBeforeRequest(details)
    browser.webRequest.onBeforeRequest.addListener(before, filter, ["requestBody"])
    dispose.push(() => browser.webRequest.onBeforeRequest.removeListener(before))
    const sent = (details: WebRequest.OnSendHeadersDetailsType) => coordinator.observeSendHeaders(details)
    browser.webRequest.onSendHeaders.addListener(sent, filter, isChrome() ? ["requestHeaders", "extraHeaders"] : ["requestHeaders"])
    dispose.push(() => browser.webRequest.onSendHeaders.removeListener(sent))
    const redirect = (details: WebRequest.OnBeforeRedirectDetailsType) => coordinator.observeRedirect(details)
    browser.webRequest.onBeforeRedirect.addListener(redirect, filter, ["responseHeaders"])
    dispose.push(() => browser.webRequest.onBeforeRedirect.removeListener(redirect))
    const response = (details: WebRequest.OnHeadersReceivedDetailsType) => { void coordinator.observeResponse(details) }
    browser.webRequest.onHeadersReceived.addListener(response, filter, isChrome() ? ["responseHeaders", "extraHeaders"] : ["responseHeaders"])
    dispose.push(() => browser.webRequest.onHeadersReceived.removeListener(response))
    const completed = (details: WebRequest.OnCompletedDetailsType) => coordinator.forget(details.requestId)
    const failed = (details: WebRequest.OnErrorOccurredDetailsType) => coordinator.forget(details.requestId)
    browser.webRequest.onCompleted.addListener(completed, filter); browser.webRequest.onErrorOccurred.addListener(failed, filter)
    dispose.push(() => browser.webRequest.onCompleted.removeListener(completed))
    dispose.push(() => browser.webRequest.onErrorOccurred.removeListener(failed))
    const removed = (tabId: number) => coordinator.onTabClosed(tabId)
    browser.tabs.onRemoved.addListener(removed); dispose.push(() => browser.tabs.onRemoved.removeListener(removed))
    const created = (download: Downloads.DownloadItem) => {
        if (!coordinator.shouldCancelBrowserDownload(download.url)) return
        void browser.downloads.pause(download.id)
            .then(() => browser.downloads.cancel(download.id))
            .then(() => browser.downloads.erase({id: download.id}))
            .catch(() => browser.downloads.resume(download.id).catch(() => undefined))
    }
    browser.downloads.onCreated.addListener(created); dispose.push(() => browser.downloads.onCreated.removeListener(created))
    return () => { while (dispose.length) dispose.pop()?.(); coordinator.close() }
}
