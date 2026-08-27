// Generated contract surface for browser-integration-v2.schema.json.
// Update only through the canonical desktop schema and lock workflow.

export const BROWSER_INTEGRATION_PROTOCOL_MAJOR = 2 as const
export const BROWSER_INTEGRATION_PROTOCOL_MINOR = 4 as const

export const BrowserProtocolLimitsV2 = Object.freeze({
    maxFrameBytes: 256 * 1024,
    maxBodyBytes: 4 * 1024 * 1024,
    maxHeaderCount: 128,
    maxHeaderBytes: 64 * 1024,
    maxCookieCount: 256,
    maxCookieBytes: 64 * 1024,
    maxRedirectCount: 32,
    maxBatchCandidates: 5_000,
    maxBatchChunkCandidates: 100,
    maxRequestsPerTab: 512,
    preparedCaptureTtlMs: 2 * 60 * 1_000,
})

export interface BrowserProtocolVersionV2 {
    major: typeof BROWSER_INTEGRATION_PROTOCOL_MAJOR
    minor: number
}

export type BrowserMessageKindV2 = "REQUEST" | "RESPONSE" | "EVENT"
export type BrowserActionV2 =
    | "HELLO" | "GET_POLICY" | "UPDATE_POLICY" | "POLICY_CHANGED"
    | "PREPARE_CAPTURE" | "COMMIT_CAPTURE" | "ABORT_CAPTURE" | "LIST_PREPARED_CAPTURES"
    | "SUBMIT_BATCH" | "CANCEL_BATCH" | "QUERY_BROWSER_CONTEXT"
    | "ADDRESS_REFRESH_CAPABILITIES" | "ADDRESS_REFRESH_SESSIONS" | "ADDRESS_REFRESH_CANDIDATE"
    | "PING" | "DIAGNOSTICS"

export interface BrowserProtocolEnvelopeV2<TPayload extends Record<string, unknown> = Record<string, unknown>> {
    protocolVersion: BrowserProtocolVersionV2
    messageId: string
    kind: BrowserMessageKindV2
    action: BrowserActionV2
    deadlineEpochMs?: number | null
    idempotencyKey?: string | null
    payload: TPayload
}

export interface BrowserParityFeatureFlagsV2 {
    secureBridge: boolean
    twoPhaseCapture: boolean
    ftpCapture: boolean
    permissionPolicy: boolean
    reviewedBatches: boolean
    advancedMediaDiscovery: boolean
    adaptiveMediaTransfer: boolean
    uxPolicy: boolean
}

export type BrowserTransportV2 = "NATIVE_PORT" | "NATIVE_ONE_SHOT" | "AUTHENTICATED_HTTP"
export type BrowserTransferSchemeV2 = "HTTP" | "HTTPS" | "FTP" | "FTPS_EXPLICIT" | "FTPS_IMPLICIT" | "HLS" | "DASH"

export interface BrowserIntegrationCapabilitiesV2 {
    protocolVersion: BrowserProtocolVersionV2
    desktopVersion: string
    supportedActions: BrowserActionV2[]
    supportedTransports: BrowserTransportV2[]
    supportedSchemes: BrowserTransferSchemeV2[]
    maxFrameBytes: number
    maxBodyBytes: number
    featureFlags: BrowserParityFeatureFlagsV2
}

export type BrowserIntegrationModeV2 = "OFF" | "STANDARD" | "FULL"

export interface BrowserIntegrationPolicyV2 {
    schemaVersion: 2
    revision: number
    mode: BrowserIntegrationModeV2
    automaticInterception: boolean
    advancedMediaInspection: boolean
    privateBrowsing: boolean
    sendProtectedContext: boolean
    registeredFileTypes: string[]
    registeredMimeTypes: string[]
    excludedUrls: string[]
    forceShortcut?: string | null
    bypassShortcut?: string | null
    customMenuActions?: BrowserCustomMenuActionV2[]
    mediaSiteAdapters?: BrowserMediaSiteAdapterV2[]
}

export interface BrowserMediaSiteAdapterV2 {
    id: string
    hostPattern: string
    urlRegex?: string | null
    selectors: string[]
    attributes: string[]
}

export interface BrowserCustomMenuActionV2 {
    id: string
    title: string
    scope: BrowserBatchScopeV2
    sourceKinds: BrowserCandidateSourceV2[]
}

export interface OrderedHeaderV2 { name: string; value: string }
export type BrowserCookieSameSiteV2 = "NO_RESTRICTION" | "LAX" | "STRICT" | "UNSPECIFIED"

export interface BrowserCookieV2 {
    name: string
    value: string
    domain: string
    path: string
    secure: boolean
    httpOnly: boolean
    sameSite?: BrowserCookieSameSiteV2 | null
    expirationEpochSeconds?: number | null
    storeId?: string | null
    partitionKey?: string | null
    session: boolean
}

export interface BrowserRequestBodyV2 {
    mediaType?: string | null
    encoding: "BASE64"
    data: string
    sha256: string
    byteLength: number
}

export interface BrowserRedirectHopV2 {
    fromUrl: string
    toUrl: string
    statusCode: number
    responseHeaders: OrderedHeaderV2[]
}

export type BrowserProxyTypeV2 = "DIRECT" | "HTTP" | "HTTPS" | "SOCKS4" | "SOCKS5" | "SYSTEM" | "UNKNOWN"
export interface BrowserProxyContextV2 { type: BrowserProxyTypeV2; endpoint?: string | null; usernameRef?: string | null }

export interface BrowserRequestContextV2 {
    originalUrl: string
    finalUrl: string
    method: string
    requestBody?: BrowserRequestBodyV2 | null
    requestHeaders: OrderedHeaderV2[]
    responseHeaders: OrderedHeaderV2[]
    cookies: BrowserCookieV2[]
    redirects: BrowserRedirectHopV2[]
    referrer?: string | null
    origin?: string | null
    initiator?: string | null
    documentUrl?: string | null
    tabId: number
    frameId: number
    parentFrameId?: number | null
    privateContext: boolean
    containerId?: string | null
    fileName?: string | null
    mimeType?: string | null
    expectedSize?: number | null
    statusCode?: number | null
    remoteAddress?: string | null
    proxy?: BrowserProxyContextV2 | null
    withheldFields: string[]
    incompleteFields: string[]
}

export type BrowserFamilyV2 = "CHROME" | "EDGE" | "FIREFOX" | "OPERA" | "CHROMIUM" | "BRAVE" | "VIVALDI" | "UNKNOWN"
export type CaptureDispositionV2 = "TASK" | "REVIEW"

export interface CaptureProposalV2 {
    captureId: string
    idempotencyKey: string
    browserFamily: BrowserFamilyV2
    browserDownloadId?: number | null
    generation: number
    requestContext: BrowserRequestContextV2
    requestedDisposition: CaptureDispositionV2
}

export type PreparedCaptureStateV2 = "PREPARED" | "BROWSER_RELEASED" | "COMMITTED_TASK" | "COMMITTED_REVIEW" | "ABORTED" | "RECOVERY_REQUIRED"
export interface PreparedCaptureV2 { captureId: string; contextRef: string; state: PreparedCaptureStateV2; expiresAtEpochMs: number }

export type BrowserCandidateSourceV2 = "LINK" | "IMAGE" | "AUDIO" | "VIDEO" | "TEXT" | "INPUT" | "SCRIPT" | "FRAME" | "PAGE" | "MEDIA"
export type BrowserBatchScopeV2 = "SELECTED" | "ALL" | "PAGE" | "FRAME" | "CUSTOM"
export interface BrowserCandidateV2 {
    candidateId: string
    url: string
    sourceKind: BrowserCandidateSourceV2
    frameId: number
    description?: string | null
    suggestedName?: string | null
    contextRef?: string | null
    requestContext?: BrowserRequestContextV2 | null
    mediaTransport?: BrowserMediaTransportV2 | null
    variantId?: string | null
    trackIds?: string[]
    outputContainer?: string | null
    liveDurationSeconds?: number | null
}

export interface BrowserBatchV2 {
    operationId: string
    generation: number
    scope: BrowserBatchScopeV2
    browserFamily: BrowserFamilyV2
    privateContext: boolean
    chunkIndex: number
    chunkCount: number
    candidates: BrowserCandidateV2[]
}

export type BrowserBatchReceiptStateV2 = "RECEIVING" | "READY_FOR_REVIEW" | "REVIEW_ACCEPTED" | "REVIEW_REJECTED" | "REJECTED" | "CANCELLED"
export interface BrowserBatchReceiptV2 {
    operationId: string
    state: BrowserBatchReceiptStateV2
    receivedChunks: number
    chunkCount: number
    acceptedCandidates: number
    rejectedCandidates: number
    duplicateCandidates: number
}

export type BrowserMediaTrackRoleV2 = "VIDEO" | "AUDIO" | "SUBTITLE"
export interface BrowserMediaTrackV2 { trackId: string; role: BrowserMediaTrackRoleV2; language?: string | null; codec?: string | null; selected: boolean }
export type BrowserMediaTransportV2 = "PROGRESSIVE" | "HLS" | "DASH"
export interface BrowserMediaVariantV2 {
    variantId: string
    url: string
    transport: BrowserMediaTransportV2
    width?: number | null
    height?: number | null
    frameRate?: number | null
    bandwidth?: number | null
    container?: string | null
    tracks: BrowserMediaTrackV2[]
    contextRef?: string | null
}

export interface BrowserMediaGroupV2 {
    groupId: string
    pageGeneration: number
    title: string
    live: boolean
    protectedMedia: boolean
    variants: BrowserMediaVariantV2[]
}

export type FtpModeV2 = "FTP" | "FTPS_EXPLICIT" | "FTPS_IMPLICIT"
export interface FtpDownloadCredentialsV2 {
    mode: FtpModeV2
    host: string
    port: number
    path: string
    credentialRef?: string | null
    passive: boolean
    binary: true
    proxyRef?: string | null
}
