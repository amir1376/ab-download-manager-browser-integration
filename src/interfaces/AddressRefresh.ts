export interface AddressRefreshProtocolVersion {
    major: number
    minor: number
}

export interface AddressRefreshCapabilities {
    protocolVersion: AddressRefreshProtocolVersion
    nativeMessaging: boolean
    httpFallback: boolean
    acceptedMethods: string[]
    maxUrlBytes: number
    maxHeaderCount: number
    maxHeaderBytes: number
    maxCookieCount: number
    maxCookieBytes: number
    maxBodyBytes: number
    maxFrameBytes: number
    maxCandidatesPerSession: number
}

export interface AddressRefreshCandidateSummary {
    candidateId: string
    host: string
    fileName?: string | null
    mimeType?: string | null
    expectedSize?: number | null
    method: string
    resourceRole: string
    score: number
    confidence: string
    conflicts: string[]
    requiresConfirmation: boolean
}

export interface AddressRefreshSession {
    operationId: string
    nonce: string
    sourceHost?: string | null
    expiresAtEpochMs: number
    protocolVersion: AddressRefreshProtocolVersion
    createdAtEpochMs: number
    sourceUrl?: string | null
    expectedResourceRole: string
    downloaderType: string
    expectedFileName?: string | null
    expectedExtension?: string | null
    expectedMimeFamily?: string | null
    expectedSize?: number | null
    previousHostPathHash?: string | null
    expectedEtagHash?: string | null
    expectedLastModified?: string | null
    acceptedMethods: string[]
    maxBodyBytes: number
    extensionConnected: boolean
    candidates: AddressRefreshCandidateSummary[]
}

export interface AddressRefreshCookie {
    name: string
    value: string
    domain: string
    path: string
    secure: boolean
    httpOnly: boolean
}

export interface AddressRefreshRequestBody {
    mediaType?: string | null
    encoding: "BASE64"
    data: string
}

export interface AddressRefreshCandidate {
    operationId: string
    nonce: string
    url: string
    method: string
    headers: Record<string, string>
    cookies: AddressRefreshCookie[]
    referer?: string | null
    origin?: string | null
    userAgent?: string | null
    expectedSize?: number | null
    mimeType?: string | null
    protocolVersion: AddressRefreshProtocolVersion
    candidateId: string
    capturedAtEpochMs: number
    tabId?: number | null
    frameId?: number | null
    documentUrl?: string | null
    initiator?: string | null
    resourceRole: string
    requestBody?: AddressRefreshRequestBody | null
    redirectChain: string[]
    responseStatus?: number | null
    contentDispositionFileName?: string | null
    etag?: string | null
    lastModified?: string | null
}

export interface AddressRefreshCandidateResult {
    status: "APPLIED" | "PENDING_CONFIRMATION" | "REJECTED" | "EXPIRED" | "UNSUPPORTED_VERSION"
    safeCode?: string | null
    candidateId?: string | null
    summary?: AddressRefreshCandidateSummary | null
}
