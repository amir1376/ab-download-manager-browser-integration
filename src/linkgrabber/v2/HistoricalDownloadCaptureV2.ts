import browser from "webextension-polyfill"
import * as Backend from "~/backend/Backend"
import type {BrowserRequestContextV2, CaptureProposalV2} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import {captureExplicitFtpV2, classifyFtpUrl} from "./FtpCaptureV2"
import {getPermissionRuntimeStateV2} from "~/permissions/PermissionRuntimeStateV2"

export async function recaptureBrowserDownloadV2(downloadId: number): Promise<boolean> {
    const [download] = await browser.downloads.search({id: downloadId})
    if (!download || download.byExtensionId) return false
    const policy = Backend.getBrowserPolicyV2()
    if (!policy || policy.mode === "OFF") return false
    if (download.incognito && (!policy.privateBrowsing || !getPermissionRuntimeStateV2().privateAllowed)) return false
    if (classifyFtpUrl(download.url)) {
        await captureExplicitFtpV2(
            download.url,
            policy.sendProtectedContext ? download.referrer ?? null : null,
            Boolean(download.incognito),
        )
        return true
    }
    if (!download.url.startsWith("http://") && !download.url.startsWith("https://")) return false
    const captureId = crypto.randomUUID()
    const context: BrowserRequestContextV2 = {
        originalUrl: download.url,
        finalUrl: (download as unknown as {finalUrl?: string}).finalUrl ?? download.url,
        method: "GET",
        requestHeaders: [], responseHeaders: [], cookies: [], redirects: [],
        referrer: policy.sendProtectedContext ? download.referrer ?? null : null,
        tabId: -1,
        frameId: -1,
        privateContext: Boolean(download.incognito),
        fileName: download.filename?.split(/[\\/]/).pop() ?? null,
        expectedSize: download.fileSize >= 0 ? download.fileSize : null,
        withheldFields: [],
        incompleteFields: ["historicalRequestContext", "requestHeaders", "cookies", "redirects", "proxy"],
    }
    const proposal: CaptureProposalV2 = {
        captureId,
        idempotencyKey: `historical-${download.id}-${download.startTime}`.slice(0, 128),
        browserFamily: "UNKNOWN",
        browserDownloadId: download.id,
        generation: Date.parse(download.startTime) || Date.now(),
        requestContext: context,
        requestedDisposition: "REVIEW",
    }
    const prepared = await Backend.prepareCaptureV2(proposal)
    if (prepared.state !== "PREPARED") return false
    const committed = await Backend.markBrowserReleasedV2(captureId)
    return committed?.state === "COMMITTED_REVIEW"
}
