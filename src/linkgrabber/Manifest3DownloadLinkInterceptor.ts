import {DownloadLinkInterceptor} from "~/linkgrabber/DownloadLinkInterceptor";
import {getLatestConfig} from "~/configs/Config";
import browser, {Downloads, WebRequest} from "webextension-polyfill";
// import ChromeDownloadItem=chrome.downloads.DownloadItem
// import DownloadOptionsTypeHeadersItemType = Downloads.DownloadOptionsTypeHeadersItemType;

export class Manifest3DownloadLinkInterceptor extends DownloadLinkInterceptor {
    // protected readonly cancelledBrowserDownloads: Record<string, ChromeDownloadItem> = {}
    override redirectDownloadsToExtension() {
        super.redirectDownloadsToExtension();
        if (chrome.downloads && chrome.downloads.onCreated) {
            // chrome internal download manager starts download if we block the request in async
            // so, we have to cancel it manually
            chrome.downloads.onCreated.addListener(async (downloadItem) => {
                if (!getLatestConfig().autoCaptureLinks) {
                    return;
                }
                // response should last for a few seconds so here I can detect them
                // otherwise app will capture download and chrome also download it too
                const response = Object.values(this.responses).find(rq => {
                    return rq.url === downloadItem.finalUrl
                })
                if (!response) {
                    return
                }
                if (!this.shouldHandleRequest(response)) {
                    return
                }
                // this.cancelledBrowserDownloads[response.requestId] = downloadItem
                await browser.downloads.cancel(downloadItem.id)
                await browser.downloads.erase({id: downloadItem.id})
                return true
            })
        }
    }

    async onDownloadSendToAppFailed(request: WebRequest.OnSendHeadersDetailsType): Promise<void> {
        super.onDownloadSendToAppFailed(request);
        // we should start download by browser itself here
        // this.startDownloadUsingNativeBrowser(request)
    }

    cancelResponse(): any {
        // in manifest 3 we can't pass or block
        return;
    }

    passResponse(): any {
        // in manifest 3 we can't pass or block
        return;
    }

    canBlockResponse(): boolean {
        return false;
    }


    /*
    startDownloadUsingNativeBrowser(request: WebRequest.OnSendHeadersDetailsType) {
        const downloadItem = this.cancelledBrowserDownloads[request.requestId]
        if (!downloadItem) return;

        const headers: DownloadOptionsTypeHeadersItemType[] = (request.requestHeaders ?? [])
            .filter((h) => h.value !== undefined)
            .map((h) => {
                return {
                    name: h.name,
                    value: h.value!,
                }
            })
        browser.downloads.download(
            {
                url: request.url,
                headers: headers,
            }
        )
    }
    */
}

