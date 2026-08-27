import browser, {WebRequest} from "webextension-polyfill";
import * as backend from "~/backend/Backend";
import {
    AddressRefreshCandidate,
    AddressRefreshCandidateResult,
    AddressRefreshCapabilities,
    AddressRefreshRequestBody,
    AddressRefreshSession,
} from "~/interfaces/AddressRefresh";
import {getContentDisposition, getContentLength, getContentType} from "~/utils/HeaderUtils";
import {getFileNameFromHeader} from "~/utils/ExtractFileNameFromHeader";

export interface ObservedRequest {
    requestId: string
    url: string
    method: string
    capturedAtEpochMs: number
    tabId: number
    frameId: number
    documentUrl?: string
    initiator?: string
    headers: Record<string, string>
    body?: AddressRefreshRequestBody
    redirectChain: string[]
}

const CONTROLLED_HEADERS = new Set([
    "accept-encoding", "connection", "content-length", "host", "keep-alive",
    "proxy-authorization", "range", "te", "trailer", "transfer-encoding", "upgrade",
])

export class AddressRefreshCaptureCoordinator {
    private requests = new Map<string, ObservedRequest>()
    private sessions: AddressRefreshSession[] = []
    private capabilities: AddressRefreshCapabilities | null = null
    private sessionsFetchedAt = 0
    private sessionFetch: Promise<AddressRefreshSession[]> | null = null
    private capturedDownloadUrls = new Map<string, number>()
    private backendUnavailableUntil = 0
    private readonly cleanupTimers = new Set<ReturnType<typeof setTimeout>>()

    async boot() {
        await this.refreshSessions(true).catch(() => [])
    }

    observeBeforeRequest(details: WebRequest.OnBeforeRequestDetailsType) {
        if (details.tabId < 0 || !details.url.startsWith("http")) return
        const observed: ObservedRequest = {
            requestId: details.requestId,
            url: details.url,
            method: details.method.toUpperCase(),
            capturedAtEpochMs: Math.trunc(details.timeStamp),
            tabId: details.tabId,
            frameId: details.frameId,
            documentUrl: details.documentUrl,
            initiator: details.originUrl,
            headers: {},
            body: this.captureBody(details),
            redirectChain: [],
        }
        this.requests.set(details.requestId, observed)
        this.trimRequests()
    }

    observeSendHeaders(details: WebRequest.OnSendHeadersDetailsType) {
        const observed = this.requests.get(details.requestId) ?? {
            requestId: details.requestId,
            url: details.url,
            method: details.method.toUpperCase(),
            capturedAtEpochMs: Math.trunc(details.timeStamp),
            tabId: details.tabId,
            frameId: details.frameId,
            documentUrl: details.documentUrl,
            initiator: details.originUrl,
            headers: {},
            redirectChain: [],
        }
        observed.url = details.url
        observed.headers = headersToRecord(details.requestHeaders)
        const bodyContentType = getHeader(observed.headers, "content-type")
        if (observed.body && bodyContentType?.toLowerCase().startsWith("multipart/")) {
            observed.body = undefined
        } else if (observed.body && bodyContentType) {
            observed.body.mediaType = bodyContentType
        }
        this.requests.set(details.requestId, observed)
    }

    observeRedirect(details: WebRequest.OnBeforeRedirectDetailsType) {
        const observed = this.requests.get(details.requestId)
        if (!observed) return
        if (observed.redirectChain.length < 16) observed.redirectChain.push(details.url)
        observed.url = details.redirectUrl
    }

    forget(requestId: string) {
        const timer = setTimeout(() => {
            this.cleanupTimers.delete(timer)
            this.requests.delete(requestId)
        }, 20_000)
        this.cleanupTimers.add(timer)
    }

    close() {
        for (const timer of this.cleanupTimers) clearTimeout(timer)
        this.cleanupTimers.clear()
        this.requests.clear()
        this.sessions = []
        this.capturedDownloadUrls.clear()
    }

    async observeResponse(
        details: WebRequest.OnHeadersReceivedDetailsType | WebRequest.OnResponseStartedDetailsType,
    ): Promise<boolean> {
        const observed = this.requests.get(details.requestId)
        if (!observed) return false
        const responseHeaders = toHeaders(details.responseHeaders)
        const sessions = await this.refreshSessions()
        if (!isPotentialDownload(responseHeaders, details.url) &&
            !sessions.some(session => isPotentialForSession(session, responseHeaders, details.url))
        ) return false
        const related = sessions.filter(session => this.matchesSession(session, observed, responseHeaders))
        if (related.length === 0) return false
        let accepted = false
        let submitted = false
        for (const session of related) {
            const candidate = await this.createCandidate(session, observed, details, responseHeaders)
            if (!candidate) continue
            submitted = true
            this.capturedDownloadUrls.set(details.url, Date.now() + 20_000)
            const result = await backend.submitAddressRefreshCandidate(candidate).catch(() => null)
            if (isAccepted(result)) {
                accepted = true
            }
        }
        if (submitted && !accepted) this.capturedDownloadUrls.delete(details.url)
        return accepted
    }

    shouldCancelBrowserDownload(url: string): boolean {
        const now = Date.now()
        for (const [captured, expires] of this.capturedDownloadUrls) {
            if (expires <= now) this.capturedDownloadUrls.delete(captured)
        }
        return [...this.capturedDownloadUrls.keys()].some(captured => captured === url)
    }

    onTabClosed(tabId: number) {
        for (const [id, request] of this.requests) {
            if (request.tabId === tabId) this.requests.delete(id)
        }
    }

    private async refreshSessions(force = false): Promise<AddressRefreshSession[]> {
        const now = Date.now()
        if (!force && now < this.backendUnavailableUntil) return []
        if (!force && now - this.sessionsFetchedAt < 1_000) return this.sessions
        if (this.sessionFetch) return this.sessionFetch
        this.sessionFetch = (async () => {
            try {
                this.capabilities ??= await backend.addressRefreshCapabilities()
                if (this.capabilities.protocolVersion.major !== 1) return []
                this.sessions = (await backend.addressRefreshSessions())
                    .filter(session => session.protocolVersion.major === 1 &&
                        session.expiresAtEpochMs > Date.now() && !!session.sourceUrl && !!session.sourceHost)
                this.sessionsFetchedAt = Date.now()
                this.backendUnavailableUntil = 0
                return this.sessions
            } catch {
                this.sessions = []
                this.sessionsFetchedAt = Date.now()
                this.backendUnavailableUntil = Date.now() + 5_000
                return []
            }
        })().finally(() => this.sessionFetch = null)
        return this.sessionFetch
    }

    private matchesSession(session: AddressRefreshSession, request: ObservedRequest, responseHeaders: Headers) {
        return doesRequestMatchSession(session, request, getContentType(responseHeaders))
    }

    private async createCandidate(
        session: AddressRefreshSession,
        request: ObservedRequest,
        details: WebRequest.OnHeadersReceivedDetailsType | WebRequest.OnResponseStartedDetailsType,
        responseHeaders: Headers,
    ): Promise<AddressRefreshCandidate | null> {
        const headers = {...request.headers}
        let cookies = [] as AddressRefreshCandidate["cookies"]
        if (!Object.keys(headers).some(key => key.toLowerCase() === "cookie")) {
            cookies = await browser.cookies.getAll({url: details.url}).then(values => values.map(cookie => ({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
            }))).catch(() => [])
        }
        const referer = getHeader(headers, "referer")
        const origin = getHeader(headers, "origin")
        const userAgent = getHeader(headers, "user-agent") ?? navigator.userAgent
        removeControlledHeaders(headers)
        const disposition = getContentDisposition(responseHeaders)
        const candidate: AddressRefreshCandidate = {
            operationId: session.operationId,
            nonce: session.nonce,
            url: details.url,
            method: request.method,
            headers,
            cookies,
            referer,
            origin,
            userAgent,
            expectedSize: getContentLength(responseHeaders),
            mimeType: getContentType(responseHeaders),
            protocolVersion: {major: 1, minor: 0},
            candidateId: `${session.operationId}:${request.requestId}`,
            capturedAtEpochMs: request.capturedAtEpochMs,
            tabId: request.tabId,
            frameId: request.frameId,
            documentUrl: request.documentUrl,
            initiator: request.initiator,
            resourceRole: session.expectedResourceRole,
            requestBody: request.body,
            redirectChain: request.redirectChain,
            responseStatus: details.statusCode,
            contentDispositionFileName: disposition ? getFileNameFromHeader(disposition) : null,
            etag: responseHeaders.get("etag"),
            lastModified: responseHeaders.get("last-modified"),
        }
        const maxFrameBytes = this.capabilities?.maxFrameBytes ?? 256 * 1024
        return new TextEncoder().encode(JSON.stringify(candidate)).byteLength <= maxFrameBytes ? candidate : null
    }

    private captureBody(details: WebRequest.OnBeforeRequestDetailsType): AddressRefreshRequestBody | undefined {
        if (details.method === "GET" || details.method === "HEAD") return undefined
        const requestBody = details.requestBody
        if (!requestBody) return undefined
        if (requestBody.raw?.length === 1 && requestBody.raw[0].bytes) {
            const bytes = new Uint8Array(requestBody.raw[0].bytes as ArrayBuffer)
            if (bytes.byteLength > 64 * 1024) return undefined
            return {encoding: "BASE64", data: bytesToBase64(bytes)}
        }
        if (requestBody.formData) {
            const form = new URLSearchParams()
            for (const [name, values] of Object.entries(requestBody.formData)) {
                for (const value of values) form.append(name, value)
            }
            const bytes = new TextEncoder().encode(form.toString())
            if (bytes.byteLength > 64 * 1024) return undefined
            return {encoding: "BASE64", mediaType: "application/x-www-form-urlencoded", data: bytesToBase64(bytes)}
        }
        return undefined
    }

    private trimRequests() {
        const cutoff = Date.now() - 5 * 60_000
        for (const [id, request] of this.requests) {
            if (request.capturedAtEpochMs < cutoff) this.requests.delete(id)
        }
        while (this.requests.size > 512) this.requests.delete(this.requests.keys().next().value!)
    }
}

export function doesRequestMatchSession(
    session: AddressRefreshSession,
    request: ObservedRequest,
    responseContentType: string | null,
) {
        if (request.capturedAtEpochMs < session.createdAtEpochMs || request.capturedAtEpochMs >= session.expiresAtEpochMs) return false
        if (!session.acceptedMethods.includes(request.method)) return false
        if (request.method !== "GET" && request.method !== "HEAD" && request.body == null) return false
        const relatedUrls = [request.documentUrl, request.initiator, request.headers["referer"], request.headers["origin"]]
        const sourceRelated = session.sourceHost == null || relatedUrls.some(value => sameHost(value, session.sourceHost!))
        if (!sourceRelated) return false
        const contentType = responseContentType?.toLowerCase()
        if (contentType?.startsWith("text/html")) return false
        if (session.expectedMimeFamily && contentType && !contentType.startsWith(`${session.expectedMimeFamily}/`)) {
            const adaptive = isHlsOrDash(contentType, request.url)
            if (!adaptive) return false
        }
        return true
}

function headersToRecord(headers?: WebRequest.HttpHeaders): Record<string, string> {
    const result: Record<string, string> = {}
    headers?.forEach(header => {
        if (header.value !== undefined && Object.keys(result).length < 128) result[header.name.toLowerCase()] = header.value
    })
    return result
}

function toHeaders(headers?: WebRequest.HttpHeaders): Headers {
    const result = new Headers()
    headers?.forEach(header => header.value !== undefined && result.set(header.name, header.value))
    return result
}

export function removeControlledHeaders(headers: Record<string, string>) {
    for (const key of Object.keys(headers)) {
        if (CONTROLLED_HEADERS.has(key.toLowerCase()) || key.toLowerCase().startsWith("proxy-")) delete headers[key]
    }
}

function getHeader(headers: Record<string, string>, name: string) {
    const key = Object.keys(headers).find(key => key.toLowerCase() === name)
    return key ? headers[key] : null
}

function sameHost(value: string | undefined, expectedHost: string) {
    if (!value) return false
    try { return new URL(value).hostname.toLowerCase() === expectedHost.toLowerCase() } catch { return false }
}

export function isPotentialDownload(headers: Headers, url: string) {
    const type = getContentType(headers)?.toLowerCase()
    return getContentDisposition(headers) != null ||
        type?.startsWith("video/") || type?.startsWith("audio/") || type?.startsWith("image/") ||
        isHlsOrDash(type, url) || /\.(zip|rar|7z|pdf|epub)(?:$|\?)/i.test(url)
}

export function isPotentialForSession(session: AddressRefreshSession, headers: Headers, url: string) {
    const type = getContentType(headers)?.toLowerCase()
    if (type?.startsWith("text/html")) return false
    if (session.expectedMimeFamily && type?.startsWith(`${session.expectedMimeFamily}/`)) return true
    const disposition = getContentDisposition(headers)
    const fileName = disposition ? getFileNameFromHeader(disposition) : new URL(url).pathname.split('/').pop()
    return !!session.expectedExtension && !!fileName &&
        fileName.toLowerCase().endsWith(`.${session.expectedExtension.toLowerCase()}`)
}

function isHlsOrDash(contentType: string | null | undefined, url: string) {
    return /\.(m3u8|mpd)(?:$|\?)/i.test(url) ||
        contentType?.includes("mpegurl") || contentType?.includes("dash+xml")
}

export function bytesToBase64(bytes: Uint8Array) {
    let binary = ""
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
    }
    return btoa(binary)
}

function isAccepted(result: AddressRefreshCandidateResult | null): boolean {
    return result?.status === "APPLIED" || result?.status === "PENDING_CONFIRMATION"
}
