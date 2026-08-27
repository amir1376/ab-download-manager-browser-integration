import browser, {Downloads, WebRequest} from "webextension-polyfill"
import type {
    BrowserCookieSameSiteV2,
    BrowserCookieV2,
    BrowserRedirectHopV2,
    BrowserRequestBodyV2,
    BrowserRequestContextV2,
    OrderedHeaderV2,
} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import {BrowserProtocolLimitsV2} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import {getContentDisposition, getContentLength, getContentType} from "~/utils/HeaderUtils"
import {getFileNameFromHeader} from "~/utils/ExtractFileNameFromHeader"

interface RequestRecordV2 {
    requestId: string
    originalUrl: string
    finalUrl: string
    method: string
    tabId: number
    frameId: number
    parentFrameId: number | null
    documentUrl: string | null
    initiator: string | null
    createdAtEpochMs: number
    requestHeaders: OrderedHeaderV2[]
    responseHeaders: OrderedHeaderV2[]
    redirects: BrowserRedirectHopV2[]
    requestBodyBytes: Uint8Array | null
    requestBodyMediaType: string | null
    withheldFields: Set<string>
    incompleteFields: Set<string>
    statusCode: number | null
    remoteAddress: string | null
}

interface RequestRecordSnapshotV2 extends Omit<RequestRecordV2, "requestBodyBytes" | "withheldFields" | "incompleteFields"> {
    requestBodyBase64: string | null
    withheldFields: string[]
    incompleteFields: string[]
}

export interface RequestRegistrySnapshotV2 {
    schemaVersion: 2
    createdAtEpochMs: number
    records: RequestRecordSnapshotV2[]
}

export type DownloadRequestMatchV2 =
    | {kind: "MATCHED"; record: RequestRecordV2}
    | {kind: "AMBIGUOUS"}
    | {kind: "NONE"}

export class RequestContextRegistryV2 {
    private readonly byRequestId = new Map<string, RequestRecordV2>()
    private readonly byTab = new Map<number, RequestRecordV2[]>()

    constructor(private readonly now: () => number = Date.now) {}

    observeBeforeRequest(details: WebRequest.OnBeforeRequestDetailsType): void {
        if (details.tabId < 0 || !isHttpUrl(details.url)) return
        const body = captureRequestBody(details)
        const record: RequestRecordV2 = {
            requestId: details.requestId,
            originalUrl: details.url,
            finalUrl: details.url,
            method: details.method.toUpperCase(),
            tabId: details.tabId,
            frameId: details.frameId,
            parentFrameId: details.parentFrameId ?? null,
            documentUrl: details.documentUrl ?? null,
            initiator: details.originUrl ?? null,
            createdAtEpochMs: Math.trunc(details.timeStamp),
            requestHeaders: [],
            responseHeaders: [],
            redirects: [],
            requestBodyBytes: body.bytes,
            requestBodyMediaType: body.mediaType,
            withheldFields: new Set(body.withheld ? ["requestBody"] : []),
            incompleteFields: new Set(),
            statusCode: null,
            remoteAddress: null,
        }
        this.replace(record)
    }

    observeSendHeaders(details: WebRequest.OnSendHeadersDetailsType): void {
        const record = this.getOrCreate(details)
        record.finalUrl = details.url
        record.method = details.method.toUpperCase()
        record.requestHeaders = toOrderedHeaders(details.requestHeaders)
        if (headersWereLimited(details.requestHeaders, record.requestHeaders)) record.withheldFields.add("requestHeaders")
        record.documentUrl = details.documentUrl ?? record.documentUrl
        record.initiator = details.originUrl ?? record.initiator
        record.requestBodyMediaType = findHeader(record.requestHeaders, "content-type") ?? record.requestBodyMediaType
    }

    observeHeadersReceived(details: WebRequest.OnHeadersReceivedDetailsType | WebRequest.OnResponseStartedDetailsType): void {
        const record = this.byRequestId.get(details.requestId)
        if (!record) return
        record.finalUrl = details.url
        record.responseHeaders = toOrderedHeaders(details.responseHeaders)
        if (headersWereLimited(details.responseHeaders, record.responseHeaders)) record.withheldFields.add("responseHeaders")
        record.statusCode = details.statusCode
        record.remoteAddress = (details as unknown as {ip?: string}).ip ?? null
        if (!record.remoteAddress) record.incompleteFields.add("remoteAddress")
    }

    observeRedirect(details: WebRequest.OnBeforeRedirectDetailsType): void {
        const record = this.byRequestId.get(details.requestId)
        if (!record) return
        if (record.redirects.length >= BrowserProtocolLimitsV2.maxRedirectCount) {
            record.withheldFields.add("redirects")
            return
        }
        record.redirects.push({
            fromUrl: details.url,
            toUrl: details.redirectUrl,
            statusCode: details.statusCode,
            responseHeaders: toOrderedHeaders(details.responseHeaders),
        })
        if (headersWereLimited(details.responseHeaders, record.redirects.at(-1)!.responseHeaders)) {
            record.withheldFields.add("redirectResponseHeaders")
        }
        record.finalUrl = details.redirectUrl
    }

    forget(requestId: string): void {
        const record = this.byRequestId.get(requestId)
        if (!record) return
        this.remove(record)
    }

    forgetTab(tabId: number): void {
        for (const record of [...(this.byTab.get(tabId) ?? [])]) this.remove(record)
    }

    clear(): void {
        for (const record of [...this.byRequestId.values()]) this.remove(record)
    }

    canCapture(record: RequestRecordV2): boolean {
        return record.method === "GET" || record.method === "HEAD" ||
            (record.requestBodyBytes !== null && !record.withheldFields.has("requestBody"))
    }

    exportSnapshot(maxBytes = MAX_SESSION_SNAPSHOT_BYTES): RequestRegistrySnapshotV2 {
        this.cleanup()
        let retainedBytes = 0
        const records: RequestRecordSnapshotV2[] = []
        const newest = [...this.byRequestId.values()].sort((a, b) => b.createdAtEpochMs - a.createdAtEpochMs)
        for (const record of newest) {
            const {
                requestBodyBytes,
                withheldFields: _withheldFields,
                incompleteFields: _incompleteFields,
                ...safeRecord
            } = record
            const withheld = new Set(record.withheldFields)
            let body: string | null = null
            if (record.requestBodyBytes) {
                const estimated = Math.ceil(record.requestBodyBytes.byteLength / 3) * 4
                if (retainedBytes + estimated <= maxBytes) {
                    body = bytesToBase64(record.requestBodyBytes)
                    retainedBytes += estimated
                } else {
                    withheld.add("requestBody:workerSnapshot")
                }
            }
            records.push({
                ...safeRecord,
                requestBodyBase64: body,
                withheldFields: [...withheld],
                incompleteFields: [...record.incompleteFields],
            })
            if (records.length >= MAX_GLOBAL_REQUESTS) break
        }
        return {schemaVersion: 2, createdAtEpochMs: this.now(), records}
    }

    restoreSnapshot(value: unknown): number {
        if (!isSnapshot(value)) return 0
        let restored = 0
        for (const snapshot of value.records) {
            if (!isRecordSnapshot(snapshot)) continue
            if (this.byRequestId.has(snapshot.requestId) || snapshot.createdAtEpochMs < this.now() - REQUEST_TTL_MS) continue
            const {requestBodyBase64, withheldFields, incompleteFields, ...safe} = snapshot
            const record = runCatchingSnapshot((): RequestRecordV2 => ({
                ...safe,
                requestBodyBytes: requestBodyBase64 ? base64ToBytes(requestBodyBase64) : null,
                withheldFields: new Set(withheldFields),
                incompleteFields: new Set(incompleteFields),
            }))
            if (!record) continue
            this.replace(record)
            restored++
        }
        return restored
    }

    getByRequestId(requestId: string): RequestRecordV2 | null {
        this.cleanup()
        return this.byRequestId.get(requestId) ?? null
    }

    matchDownload(download: Downloads.DownloadItem): DownloadRequestMatchV2 {
        this.cleanup()
        const started = Date.parse(download.startTime)
        const candidates = [...this.byRequestId.values()].filter(record => {
            const urlMatches = record.finalUrl === download.url || record.originalUrl === download.url
            const timeMatches = Number.isNaN(started) || Math.abs(started - record.createdAtEpochMs) <= MATCH_WINDOW_MS
            return urlMatches && timeMatches
        })
        if (candidates.length === 0) return {kind: "NONE"}
        if (candidates.length !== 1) return {kind: "AMBIGUOUS"}
        return {kind: "MATCHED", record: candidates[0]}
    }

    async createContext(
        record: RequestRecordV2,
        download: Downloads.DownloadItem,
        sendProtectedContext = true,
    ): Promise<BrowserRequestContextV2> {
        const body = sendProtectedContext ? await encodeRequestBody(record) : null
        const cookies = sendProtectedContext
            ? await captureCookies(record.finalUrl)
            : {values: [], incomplete: false, storeId: null}
        const response = new Headers(record.responseHeaders.map<[string, string]>(header => [header.name, header.value]))
        const disposition = getContentDisposition(response)
        const fileName = disposition ? getFileNameFromHeader(disposition) : null
        const incomplete = new Set(record.incompleteFields)
        const proxy = sendProtectedContext ? await captureProxy(Boolean(download.incognito)) : null
        if (sendProtectedContext && proxy === null) incomplete.add("proxy")
        if (cookies.incomplete) incomplete.add("cookies")
        const withheld = new Set(record.withheldFields)
        if (!sendProtectedContext) {
            if (record.requestBodyBytes) withheld.add("requestBody:policy")
            if (record.requestHeaders.length) withheld.add("requestHeaders:policy")
            if (record.responseHeaders.length) withheld.add("responseHeaders:policy")
            withheld.add("cookies:policy")
            withheld.add("proxy:policy")
        }
        return {
            originalUrl: record.originalUrl,
            finalUrl: record.finalUrl,
            method: record.method,
            requestBody: body,
            requestHeaders: sendProtectedContext ? record.requestHeaders : [],
            responseHeaders: sendProtectedContext ? record.responseHeaders : [],
            cookies: cookies.values,
            redirects: sendProtectedContext ? record.redirects : [],
            referrer: sendProtectedContext ? download.referrer || findHeader(record.requestHeaders, "referer") : null,
            origin: sendProtectedContext ? findHeader(record.requestHeaders, "origin") : null,
            initiator: sendProtectedContext ? record.initiator : null,
            documentUrl: sendProtectedContext ? record.documentUrl : null,
            tabId: record.tabId,
            frameId: record.frameId,
            parentFrameId: record.parentFrameId,
            privateContext: Boolean(download.incognito),
            containerId: cookies.storeId,
            fileName: fileName || download.filename?.split(/[\\/]/).pop() || null,
            mimeType: getContentType(response),
            expectedSize: getContentLength(response) ?? (download.fileSize >= 0 ? download.fileSize : null),
            statusCode: record.statusCode,
            remoteAddress: record.remoteAddress,
            proxy,
            withheldFields: [...withheld],
            incompleteFields: [...incomplete],
        }
    }

    private getOrCreate(details: WebRequest.OnSendHeadersDetailsType): RequestRecordV2 {
        const existing = this.byRequestId.get(details.requestId)
        if (existing) return existing
        const record: RequestRecordV2 = {
            requestId: details.requestId,
            originalUrl: details.url,
            finalUrl: details.url,
            method: details.method.toUpperCase(),
            tabId: details.tabId,
            frameId: details.frameId,
            parentFrameId: details.parentFrameId ?? null,
            documentUrl: details.documentUrl ?? null,
            initiator: details.originUrl ?? null,
            createdAtEpochMs: Math.trunc(details.timeStamp),
            requestHeaders: [], responseHeaders: [], redirects: [],
            requestBodyBytes: null, requestBodyMediaType: null,
            withheldFields: new Set(["requestBody"]),
            incompleteFields: new Set(["beforeRequest"]),
            statusCode: null, remoteAddress: null,
        }
        this.replace(record)
        return record
    }

    private replace(record: RequestRecordV2): void {
        this.byRequestId.set(record.requestId, record)
        const tabRecords = this.byTab.get(record.tabId) ?? []
        tabRecords.push(record)
        this.byTab.set(record.tabId, tabRecords)
        while (tabRecords.length > BrowserProtocolLimitsV2.maxRequestsPerTab) {
            this.remove(tabRecords[0])
        }
        this.enforceGlobalLimits()
        this.cleanup()
    }

    private enforceGlobalLimits(): void {
        const oldest = () => [...this.byRequestId.values()].sort((a, b) => a.createdAtEpochMs - b.createdAtEpochMs)[0]
        while (this.byRequestId.size > MAX_GLOBAL_REQUESTS || this.totalBodyBytes() > MAX_TOTAL_BODY_BYTES) {
            const candidate = oldest()
            if (!candidate) break
            this.remove(candidate)
        }
    }

    private totalBodyBytes(): number {
        let total = 0
        for (const record of this.byRequestId.values()) total += record.requestBodyBytes?.byteLength ?? 0
        return total
    }

    private cleanup(): void {
        const cutoff = this.now() - REQUEST_TTL_MS
        for (const record of this.byRequestId.values()) {
            if (record.createdAtEpochMs < cutoff) this.remove(record)
        }
    }

    private remove(record: RequestRecordV2): void {
        this.byRequestId.delete(record.requestId)
        const tabRecords = this.byTab.get(record.tabId)
        if (tabRecords) {
            const index = tabRecords.indexOf(record)
            if (index >= 0) tabRecords.splice(index, 1)
            if (tabRecords.length === 0) this.byTab.delete(record.tabId)
        }
        record.requestBodyBytes?.fill(0)
        record.requestBodyBytes = null
    }
}

function isSnapshot(value: unknown): value is RequestRegistrySnapshotV2 {
    if (typeof value !== "object" || value === null) return false
    const snapshot = value as Partial<RequestRegistrySnapshotV2>
    return snapshot.schemaVersion === 2 && Array.isArray(snapshot.records) && snapshot.records.length <= MAX_GLOBAL_REQUESTS
}

function isRecordSnapshot(value: unknown): value is RequestRecordSnapshotV2 {
    if (typeof value !== "object" || value === null) return false
    const record = value as Partial<RequestRecordSnapshotV2>
    return typeof record.requestId === "string" && record.requestId.length <= 256 &&
        typeof record.originalUrl === "string" && typeof record.finalUrl === "string" &&
        typeof record.method === "string" && typeof record.tabId === "number" &&
        typeof record.frameId === "number" && typeof record.createdAtEpochMs === "number" &&
        (record.requestBodyBase64 === null ||
            (typeof record.requestBodyBase64 === "string" && record.requestBodyBase64.length <= 5_592_408)) &&
        Array.isArray(record.requestHeaders) && Array.isArray(record.responseHeaders) &&
        Array.isArray(record.redirects) && Array.isArray(record.withheldFields) &&
        Array.isArray(record.incompleteFields)
}

function runCatchingSnapshot<T>(block: () => T): T | null {
    try { return block() } catch { return null }
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = ""
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
    }
    return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
    const binary = atob(value)
    return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function captureRequestBody(details: WebRequest.OnBeforeRequestDetailsType): {bytes: Uint8Array | null; mediaType: string | null; withheld: boolean} {
    if (details.method === "GET" || details.method === "HEAD") return {bytes: null, mediaType: null, withheld: false}
    const body = details.requestBody
    if (!body) return {bytes: null, mediaType: null, withheld: true}
    if (body.raw?.length) {
        const parts = body.raw.flatMap(part => part.bytes ? [new Uint8Array(part.bytes as ArrayBuffer)] : [])
        const length = parts.reduce((total, part) => total + part.byteLength, 0)
        if (length > BrowserProtocolLimitsV2.maxBodyBytes) return {bytes: null, mediaType: null, withheld: true}
        const combined = new Uint8Array(length)
        let offset = 0
        for (const part of parts) {
            combined.set(part, offset)
            offset += part.byteLength
        }
        return {bytes: combined, mediaType: null, withheld: parts.length !== body.raw.length}
    }
    if (body.formData) {
        const form = new URLSearchParams()
        for (const [name, values] of Object.entries(body.formData)) {
            for (const value of values) form.append(name, value)
        }
        const bytes = new TextEncoder().encode(form.toString())
        if (bytes.byteLength > BrowserProtocolLimitsV2.maxBodyBytes) return {bytes: null, mediaType: null, withheld: true}
        return {bytes, mediaType: "application/x-www-form-urlencoded", withheld: false}
    }
    return {bytes: null, mediaType: null, withheld: true}
}

async function encodeRequestBody(record: RequestRecordV2): Promise<BrowserRequestBodyV2 | null> {
    const bytes = record.requestBodyBytes
    if (!bytes) return null
    const digestInput = bytes.slice().buffer as ArrayBuffer
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", digestInput))
    const sha256 = [...digest].map(value => value.toString(16).padStart(2, "0")).join("")
    let binary = ""
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
    }
    return {mediaType: record.requestBodyMediaType, encoding: "BASE64", data: btoa(binary), sha256, byteLength: bytes.byteLength}
}

async function captureCookies(url: string): Promise<{values: BrowserCookieV2[]; incomplete: boolean; storeId: string | null}> {
    try {
        const raw = await browser.cookies.getAll({url})
        const limited = raw.slice(0, BrowserProtocolLimitsV2.maxCookieCount)
        return {
            values: limited.map(cookie => ({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
                sameSite: normalizeSameSite(cookie.sameSite),
                expirationEpochSeconds: cookie.expirationDate ?? null,
                storeId: cookie.storeId,
                partitionKey: (cookie as unknown as {partitionKey?: string | {topLevelSite?: string}}).partitionKey
                    ? JSON.stringify((cookie as unknown as {partitionKey: unknown}).partitionKey)
                    : null,
                session: cookie.session,
            })),
            incomplete: raw.length > limited.length,
            storeId: limited[0]?.storeId ?? null,
        }
    } catch {
        return {values: [], incomplete: true, storeId: null}
    }
}

function normalizeSameSite(value: string | undefined): BrowserCookieSameSiteV2 | null {
    switch (value) {
        case "no_restriction": return "NO_RESTRICTION"
        case "lax": return "LAX"
        case "strict": return "STRICT"
        case "unspecified": return "UNSPECIFIED"
        default: return null
    }
}

function toOrderedHeaders(headers?: WebRequest.HttpHeaders): OrderedHeaderV2[] {
    const output: OrderedHeaderV2[] = []
    let bytes = 0
    for (const header of headers ?? []) {
        if (header.value === undefined) continue
        const nextBytes = new TextEncoder().encode(`${header.name}:${header.value}`).byteLength
        if (output.length >= BrowserProtocolLimitsV2.maxHeaderCount ||
            bytes + nextBytes > BrowserProtocolLimitsV2.maxHeaderBytes) break
        output.push({name: header.name, value: header.value})
        bytes += nextBytes
    }
    return output
}

function headersWereLimited(raw: WebRequest.HttpHeaders | undefined, captured: OrderedHeaderV2[]): boolean {
    return (raw ?? []).filter(header => header.value !== undefined).length > captured.length
}

async function captureProxy(privateContext: boolean): Promise<BrowserRequestContextV2["proxy"]> {
    try {
        const settings = await browser.proxy.settings.get({incognito: privateContext})
        const value = settings.value as Record<string, unknown> | undefined
        const mode = value?.mode
        if (mode === "direct") return {type: "DIRECT", endpoint: null, usernameRef: null}
        if (mode === "system" || mode === "auto_detect" || mode === "pac_script") {
            return {type: "SYSTEM", endpoint: null, usernameRef: null}
        }
        if (mode === "fixed_servers") {
            const rules = value?.rules as Record<string, unknown> | undefined
            const candidate = (rules?.singleProxy ?? rules?.proxyForHttps ?? rules?.proxyForHttp) as Record<string, unknown> | undefined
            if (candidate && typeof candidate.host === "string") {
                const scheme = String(candidate.scheme ?? "http").toLowerCase()
                const type = scheme.startsWith("socks5") ? "SOCKS5" : scheme.startsWith("socks") ? "SOCKS4" : scheme === "https" ? "HTTPS" : "HTTP"
                const port = typeof candidate.port === "number" ? `:${candidate.port}` : ""
                return {type, endpoint: `${candidate.host}${port}`, usernameRef: null}
            }
        }
        return {type: "UNKNOWN", endpoint: null, usernameRef: null}
    } catch {
        return null
    }
}

function findHeader(headers: OrderedHeaderV2[], name: string): string | null {
    return headers.find(header => header.name.toLowerCase() === name.toLowerCase())?.value ?? null
}

function isHttpUrl(url: string): boolean {
    return url.startsWith("http://") || url.startsWith("https://")
}

const REQUEST_TTL_MS = 5 * 60_000
const MATCH_WINDOW_MS = 15_000
const MAX_GLOBAL_REQUESTS = 2_048
const MAX_TOTAL_BODY_BYTES = 16 * 1024 * 1024
const MAX_SESSION_SNAPSHOT_BYTES = 8 * 1024 * 1024
