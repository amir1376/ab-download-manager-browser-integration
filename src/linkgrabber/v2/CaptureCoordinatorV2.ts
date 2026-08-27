import browser, {Downloads, WebRequest} from "webextension-polyfill"
import urlMatch from "match-url-wildcard"
import * as backend from "~/backend/Backend"
import * as BackgroundSharedState from "~/background/BackgroundSharedState"
import {getLatestConfig} from "~/configs/Config"
import {BrowserTarget, getExtensionBrowserTarget, isChrome} from "~/utils/ExtensionInfo"
import {getFileExtension, getFileFromUrl} from "~/utils/URLUtils"
import type {CaptureProposalV2, PreparedCaptureV2} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import {RequestContextRegistryV2} from "./RequestContextRegistryV2"

interface CaptureBridgeV2 {
    prepare(proposal: CaptureProposalV2): Promise<PreparedCaptureV2>
    released(captureId: string): Promise<PreparedCaptureV2 | null>
    abort(captureId: string): Promise<PreparedCaptureV2 | null>
    list(): Promise<PreparedCaptureV2[]>
}

interface CaptureReceiptV2 {
    captureId: string
    browserDownloadId: number
    state: "PREPARED" | "BROWSER_RELEASED" | "COMMITTED_REVIEW" | "RECOVERY_REQUIRED"
    expiresAtEpochMs: number
}

const defaultBridge: CaptureBridgeV2 = {
    prepare: backend.prepareCaptureV2,
    released: backend.markBrowserReleasedV2,
    abort: backend.abortCaptureV2,
    list: backend.listPreparedCapturesV2,
}

export class CaptureCoordinatorV2 {
    private readonly registry: RequestContextRegistryV2

    constructor(
        registry: RequestContextRegistryV2 = new RequestContextRegistryV2(),
        private readonly bridge: CaptureBridgeV2 = defaultBridge,
    ) {
        this.registry = registry
    }

    boot(): void {
        const filter: WebRequest.RequestFilter = {urls: ["http://*/*", "https://*/*"]}
        browser.webRequest.onBeforeRequest.addListener(
            details => this.registry.observeBeforeRequest(details), filter, ["requestBody"],
        )
        browser.webRequest.onSendHeaders.addListener(
            details => this.registry.observeSendHeaders(details),
            filter,
            isChrome() ? ["requestHeaders", "extraHeaders"] : ["requestHeaders"],
        )
        browser.webRequest.onHeadersReceived.addListener(
            details => this.registry.observeHeadersReceived(details),
            filter,
            isChrome() ? ["responseHeaders", "extraHeaders"] : ["responseHeaders"],
        )
        browser.webRequest.onBeforeRedirect.addListener(
            details => this.registry.observeRedirect(details), filter, ["responseHeaders"],
        )
        browser.webRequest.onCompleted.addListener(
            details => this.forgetLater(details.requestId), filter,
        )
        browser.webRequest.onErrorOccurred.addListener(
            details => this.forgetLater(details.requestId), filter,
        )
        browser.tabs.onRemoved.addListener(tabId => this.registry.forgetTab(tabId))
        browser.downloads.onCreated.addListener(download => void this.capture(download))
        void this.reconcile()
    }

    async capture(download: Downloads.DownloadItem): Promise<void> {
        if (!this.isEligible(download)) return
        const match = this.registry.matchDownload(download)
        if (match.kind !== "MATCHED") return

        let paused = false
        let captureId: string | null = null
        try {
            await browser.downloads.pause(download.id)
            paused = true
            const context = await this.registry.createContext(match.record, download)
            captureId = crypto.randomUUID()
            const proposal: CaptureProposalV2 = {
                captureId,
                idempotencyKey: captureId,
                browserFamily: browserFamily(),
                browserDownloadId: download.id,
                generation: match.record.createdAtEpochMs,
                requestContext: context,
                requestedDisposition: "REVIEW",
            }
            const prepared = await this.bridge.prepare(proposal)
            if (prepared.state !== "PREPARED") throw new Error("Desktop did not durably prepare capture")
            await saveReceipt({
                captureId,
                browserDownloadId: download.id,
                state: "PREPARED",
                expiresAtEpochMs: prepared.expiresAtEpochMs,
            })

            await browser.downloads.cancel(download.id)
            paused = false
            await browser.downloads.erase({id: download.id})
            await browser.downloads.removeFile(download.id).catch(() => undefined)
            await saveReceipt({
                captureId,
                browserDownloadId: download.id,
                state: "BROWSER_RELEASED",
                expiresAtEpochMs: prepared.expiresAtEpochMs,
            })

            const committed = await this.bridge.released(captureId)
            if (committed?.state !== "COMMITTED_REVIEW") {
                await saveReceipt({
                    captureId,
                    browserDownloadId: download.id,
                    state: "RECOVERY_REQUIRED",
                    expiresAtEpochMs: prepared.expiresAtEpochMs,
                })
                return
            }
            await saveReceipt({
                captureId,
                browserDownloadId: download.id,
                state: "COMMITTED_REVIEW",
                expiresAtEpochMs: committed.expiresAtEpochMs,
            })
            await removeReceipt(captureId)
        } catch {
            if (captureId !== null) await this.bridge.abort(captureId).catch(() => null)
            if (paused) await browser.downloads.resume(download.id).catch(() => undefined)
        } finally {
            this.registry.forget(match.record.requestId)
        }
    }

    private isEligible(download: Downloads.DownloadItem): boolean {
        const config = getLatestConfig()
        if (!config.autoCaptureLinks || !download.url.startsWith("http") || download.byExtensionId) return false
        if (BackgroundSharedState.isBypassShortcutPressed()) return false
        if (config.blacklistedUrls.length && urlMatch(download.url, config.blacklistedUrls)) return false
        if (download.referrer && config.blacklistedUrls.length && urlMatch(download.referrer, config.blacklistedUrls)) return false
        if (config.captureFileSizeMinimumKb > 0 && download.fileSize >= 0 &&
            download.fileSize < config.captureFileSizeMinimumKb * 1024) return false
        const fileName = download.filename?.split(/[\\/]/).pop() || getFileFromUrl(download.url)
        if (!fileName) return false
        return config.registeredFileTypes.includes(getFileExtension(fileName).toLowerCase())
    }

    private async reconcile(): Promise<void> {
        const [receipts, prepared] = await Promise.all([loadReceipts(), this.bridge.list().catch(() => [])])
        const byId = new Map(prepared.map(value => [value.captureId, value]))
        for (const receipt of receipts) {
            const desktop = byId.get(receipt.captureId)
            if (!desktop || desktop.state === "ABORTED") {
                await removeReceipt(receipt.captureId)
                continue
            }
            if (receipt.state === "BROWSER_RELEASED" || receipt.state === "RECOVERY_REQUIRED") {
                const result = await this.bridge.released(receipt.captureId).catch(() => null)
                if (result?.state === "COMMITTED_REVIEW") await removeReceipt(receipt.captureId)
            }
        }
    }

    private forgetLater(requestId: string): void {
        setTimeout(() => this.registry.forget(requestId), 20_000)
    }
}

function browserFamily(): "CHROME" | "FIREFOX" {
    return getExtensionBrowserTarget() === BrowserTarget.firefox ? "FIREFOX" : "CHROME"
}

const RECEIPT_PREFIX = "browser-capture-v2:"

async function receiptStorage(): Promise<{get(keys?: string[] | null): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void>; remove(keys: string | string[]): Promise<void>}> {
    const candidate = (browser.storage as unknown as {session?: typeof browser.storage.local}).session
    return candidate ?? browser.storage.local
}

async function saveReceipt(receipt: CaptureReceiptV2): Promise<void> {
    const storage = await receiptStorage()
    await storage.set({[RECEIPT_PREFIX + receipt.captureId]: receipt})
}

async function removeReceipt(captureId: string): Promise<void> {
    const storage = await receiptStorage()
    await storage.remove(RECEIPT_PREFIX + captureId)
}

async function loadReceipts(): Promise<CaptureReceiptV2[]> {
    const storage = await receiptStorage()
    const values = await storage.get(null)
    const now = Date.now()
    const receipts: CaptureReceiptV2[] = []
    for (const [key, value] of Object.entries(values)) {
        if (!key.startsWith(RECEIPT_PREFIX) || typeof value !== "object" || value === null) continue
        const receipt = value as Partial<CaptureReceiptV2>
        if (typeof receipt.captureId !== "string" || typeof receipt.browserDownloadId !== "number" ||
            typeof receipt.expiresAtEpochMs !== "number" || typeof receipt.state !== "string") continue
        if (receipt.expiresAtEpochMs <= now) {
            await storage.remove(key)
            continue
        }
        receipts.push(receipt as CaptureReceiptV2)
    }
    return receipts
}
