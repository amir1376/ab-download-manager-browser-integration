import browser, {Downloads, WebRequest} from "webextension-polyfill"
import urlMatch from "match-url-wildcard"
import * as backend from "~/backend/Backend"
import * as BackgroundSharedState from "~/background/BackgroundSharedState"
import {getLatestConfig} from "~/configs/Config"
import {BrowserTarget, getExtensionBrowserTarget, isChrome} from "~/utils/ExtensionInfo"
import {getFileExtension, getFileFromUrl} from "~/utils/URLUtils"
import type {CaptureProposalV2, PreparedCaptureV2} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import {RequestContextRegistryV2} from "./RequestContextRegistryV2"
import {getPermissionRuntimeStateV2} from "~/permissions/PermissionRuntimeStateV2"

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
    private readonly disposers: Array<() => void> = []
    private readonly cleanupTimers = new Set<ReturnType<typeof setTimeout>>()
    private booted = false
    private snapshotQueued = false

    constructor(
        registry: RequestContextRegistryV2 = new RequestContextRegistryV2(),
        private readonly bridge: CaptureBridgeV2 = defaultBridge,
    ) {
        this.registry = registry
    }

    boot(): () => void {
        if (this.booted) return () => this.close()
        this.booted = true
        const filter: WebRequest.RequestFilter = {urls: ["http://*/*", "https://*/*"]}
        const beforeRequest = (details: WebRequest.OnBeforeRequestDetailsType) => {
            this.registry.observeBeforeRequest(details); this.queueSnapshot()
        }
        browser.webRequest.onBeforeRequest.addListener(
            beforeRequest, filter, ["requestBody"],
        )
        this.disposers.push(() => browser.webRequest.onBeforeRequest.removeListener(beforeRequest))
        const sendHeaders = (details: WebRequest.OnSendHeadersDetailsType) => {
            this.registry.observeSendHeaders(details); this.queueSnapshot()
        }
        browser.webRequest.onSendHeaders.addListener(
            sendHeaders,
            filter,
            isChrome() ? ["requestHeaders", "extraHeaders"] : ["requestHeaders"],
        )
        this.disposers.push(() => browser.webRequest.onSendHeaders.removeListener(sendHeaders))
        const headersReceived = (details: WebRequest.OnHeadersReceivedDetailsType) => {
            this.registry.observeHeadersReceived(details); this.queueSnapshot()
        }
        browser.webRequest.onHeadersReceived.addListener(
            headersReceived,
            filter,
            isChrome() ? ["responseHeaders", "extraHeaders"] : ["responseHeaders"],
        )
        this.disposers.push(() => browser.webRequest.onHeadersReceived.removeListener(headersReceived))
        const beforeRedirect = (details: WebRequest.OnBeforeRedirectDetailsType) => {
            this.registry.observeRedirect(details); this.queueSnapshot()
        }
        browser.webRequest.onBeforeRedirect.addListener(
            beforeRedirect, filter, ["responseHeaders"],
        )
        this.disposers.push(() => browser.webRequest.onBeforeRedirect.removeListener(beforeRedirect))
        const completed = (details: WebRequest.OnCompletedDetailsType) => this.forgetLater(details.requestId)
        browser.webRequest.onCompleted.addListener(
            completed, filter,
        )
        this.disposers.push(() => browser.webRequest.onCompleted.removeListener(completed))
        const failed = (details: WebRequest.OnErrorOccurredDetailsType) => this.forgetLater(details.requestId)
        browser.webRequest.onErrorOccurred.addListener(
            failed, filter,
        )
        this.disposers.push(() => browser.webRequest.onErrorOccurred.removeListener(failed))
        const removed = (tabId: number) => { this.registry.forgetTab(tabId); this.queueSnapshot() }
        browser.tabs.onRemoved.addListener(removed)
        this.disposers.push(() => browser.tabs.onRemoved.removeListener(removed))
        const created = (download: Downloads.DownloadItem) => void this.capture(download)
        browser.downloads.onCreated.addListener(created)
        this.disposers.push(() => browser.downloads.onCreated.removeListener(created))
        this.disposers.push(backend.registerNativeBrowserRequestHandler(
            "queryBrowserContextV2",
            payload => this.queryBrowserContext(payload),
        ))
        void this.restoreSnapshot().then(() => this.reconcile())
        return () => this.close()
    }

    close(): void {
        if (!this.booted) return
        this.booted = false
        while (this.disposers.length) this.disposers.pop()?.()
        for (const timer of this.cleanupTimers) clearTimeout(timer)
        this.cleanupTimers.clear()
        this.registry.clear()
        void removeRegistrySnapshot()
    }

    async capture(download: Downloads.DownloadItem): Promise<void> {
        const match = this.registry.matchDownload(download)
        if (match.kind !== "MATCHED") return
        if (!this.registry.canCapture(match.record)) return
        if (!this.isEligible(download, match.record.tabId)) return

        let paused = false
        let captureId: string | null = null
        let shelfSuppressed = false
        try {
            await browser.downloads.pause(download.id)
            paused = true
            const policy = backend.getBrowserPolicyV2()
            if (!policy) throw new Error("Browser policy is unavailable")
            const context = await this.registry.createContext(match.record, download, policy.sendProtectedContext)
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

            shelfSuppressed = await setDownloadShelfEnabled(false)
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
            if (shelfSuppressed) await setDownloadShelfEnabled(true)
            this.registry.forget(match.record.requestId)
            this.queueSnapshot()
        }
    }

    private isEligible(download: Downloads.DownloadItem, tabId: number): boolean {
        const policy = backend.getBrowserPolicyV2()
        const permission = getPermissionRuntimeStateV2()
        if (!policy || policy.mode !== "FULL" || !permission.fullAuthority || !download.url.startsWith("http") || download.byExtensionId) return false
        if (download.incognito && (!policy.privateBrowsing || !permission.privateAllowed)) return false
        if (BackgroundSharedState.isTabBypassed(tabId)) return false
        if (BackgroundSharedState.isShortcutPressed(tabId, policy.bypassShortcut)) return false
        const forced = BackgroundSharedState.isShortcutPressed(tabId, policy.forceShortcut)
        if (!forced && !policy.automaticInterception) return false
        if (!forced && policy.excludedUrls.length && urlMatch(download.url, policy.excludedUrls)) return false
        if (!forced && download.referrer && policy.excludedUrls.length && urlMatch(download.referrer, policy.excludedUrls)) return false
        const config = getLatestConfig()
        if (config.captureFileSizeMinimumKb > 0 && download.fileSize >= 0 &&
            download.fileSize < config.captureFileSizeMinimumKb * 1024) return false
        const fileName = download.filename?.split(/[\\/]/).pop() || getFileFromUrl(download.url)
        if (!fileName) return false
        if (forced) return true
        const extensionEligible = policy.registeredFileTypes.includes(getFileExtension(fileName).toLowerCase())
        const mime = (download as Downloads.DownloadItem & {mime?: string}).mime?.split(';')[0].trim().toLowerCase()
        const mimeEligible = Boolean(mime && policy.registeredMimeTypes.some(value =>
            value.endsWith("/*") ? mime.startsWith(value.slice(0, -1)) : mime === value,
        ))
        return extensionEligible || mimeEligible
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

    private async queryBrowserContext(payload: unknown): Promise<unknown> {
        if (typeof payload !== "object" || payload === null) return {status: "INVALID_REQUEST"}
        const request = payload as {requestId?: unknown; download?: unknown}
        if (typeof request.requestId !== "string" || typeof request.download !== "object" || request.download === null) {
            return {status: "INVALID_REQUEST"}
        }
        const record = this.registry.getByRequestId(request.requestId)
        if (!record) return {status: "NOT_FOUND"}
        try {
            return {
                status: "FOUND",
                context: await this.registry.createContext(
                    record,
                    request.download as Downloads.DownloadItem,
                    backend.getBrowserPolicyV2()?.sendProtectedContext === true,
                ),
            }
        } catch {
            return {status: "UNAVAILABLE"}
        }
    }

    private forgetLater(requestId: string): void {
        const timer = setTimeout(() => {
            this.cleanupTimers.delete(timer)
            this.registry.forget(requestId)
            this.queueSnapshot()
        }, 20_000)
        this.cleanupTimers.add(timer)
    }

    private queueSnapshot(): void {
        if (this.snapshotQueued || !this.booted) return
        this.snapshotQueued = true
        queueMicrotask(() => {
            this.snapshotQueued = false
            if (this.booted) void saveRegistrySnapshot(this.registry.exportSnapshot())
        })
    }

    private async restoreSnapshot(): Promise<void> {
        this.registry.restoreSnapshot(await loadRegistrySnapshot())
    }
}

async function setDownloadShelfEnabled(enabled: boolean): Promise<boolean> {
    const downloads = browser.downloads as unknown as {setShelfEnabled?: (enabled: boolean) => Promise<void>}
    if (!downloads.setShelfEnabled) return false
    try {
        await downloads.setShelfEnabled(enabled)
        return true
    } catch {
        return false
    }
}

function browserFamily(): "CHROME" | "FIREFOX" {
    return getExtensionBrowserTarget() === BrowserTarget.firefox ? "FIREFOX" : "CHROME"
}

const RECEIPT_PREFIX = "browser-capture-v2:"
const REGISTRY_SNAPSHOT_KEY = "browser-request-registry-v2"

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

async function saveRegistrySnapshot(snapshot: unknown): Promise<void> {
    const storage = await sessionStorageOnly()
    if (storage) await storage.set({[REGISTRY_SNAPSHOT_KEY]: snapshot})
}

async function loadRegistrySnapshot(): Promise<unknown> {
    const storage = await sessionStorageOnly()
    return storage ? (await storage.get(REGISTRY_SNAPSHOT_KEY))[REGISTRY_SNAPSHOT_KEY] : null
}

async function removeRegistrySnapshot(): Promise<void> {
    const storage = await sessionStorageOnly()
    if (storage) await storage.remove(REGISTRY_SNAPSHOT_KEY)
}

async function sessionStorageOnly(): Promise<typeof browser.storage.local | null> {
    return (browser.storage as unknown as {session?: typeof browser.storage.local}).session ?? null
}
