import {z} from "~/utils/Zod"

const ProtocolVersion = z.object({major: z.literal(2), minor: z.int().min(0)})
const FeatureFlags = z.object({
    secureBridge: z.boolean(),
    twoPhaseCapture: z.boolean(),
    ftpCapture: z.boolean(),
    permissionPolicy: z.boolean(),
    reviewedBatches: z.boolean(),
    advancedMediaDiscovery: z.boolean(),
    adaptiveMediaTransfer: z.boolean(),
    uxPolicy: z.boolean(),
})
const OrderedHeader = z.object({name: z.string().min(1).max(256), value: z.string().max(65_536)})
const RequestBody = z.object({
    mediaType: z.string().max(256).nullable().optional(),
    encoding: z.literal("BASE64"),
    data: z.string().max(5_592_408),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z.int().min(0).max(4 * 1024 * 1024),
})
const Redirect = z.object({
    fromUrl: z.string().max(16_384),
    toUrl: z.string().max(16_384),
    statusCode: z.int().min(100).max(599),
    responseHeaders: z.array(OrderedHeader).max(128),
})
const Cookie = z.object({
    name: z.string().max(4096), value: z.string().max(65_536), domain: z.string().max(4096),
    path: z.string().max(4096), secure: z.boolean(), httpOnly: z.boolean(),
    sameSite: z.enum(["NO_RESTRICTION", "LAX", "STRICT", "UNSPECIFIED"]).nullable().optional(),
    expirationEpochSeconds: z.number().min(0).nullable().optional(),
    storeId: z.string().max(256).nullable().optional(), partitionKey: z.string().max(4096).nullable().optional(),
    session: z.boolean(),
})
const RequestContext = z.object({
    originalUrl: z.string().max(16_384), finalUrl: z.string().max(16_384),
    method: z.string().regex(/^[A-Z]{1,16}$/), requestBody: RequestBody.nullable().optional(),
    requestHeaders: z.array(OrderedHeader).max(128), responseHeaders: z.array(OrderedHeader).max(128),
    cookies: z.array(Cookie).max(256), redirects: z.array(Redirect).max(32),
    referrer: z.string().max(16_384).nullable().optional(), origin: z.string().max(16_384).nullable().optional(),
    initiator: z.string().max(16_384).nullable().optional(), documentUrl: z.string().max(16_384).nullable().optional(),
    tabId: z.int(), frameId: z.int(), parentFrameId: z.int().nullable().optional(), privateContext: z.boolean(),
    containerId: z.string().max(256).nullable().optional(), fileName: z.string().max(4096).nullable().optional(),
    mimeType: z.string().max(256).nullable().optional(), expectedSize: z.int().min(0).nullable().optional(),
    statusCode: z.int().min(100).max(599).nullable().optional(), remoteAddress: z.string().max(4096).nullable().optional(),
    proxy: z.object({type: z.enum(["DIRECT", "HTTP", "HTTPS", "SOCKS4", "SOCKS5", "SYSTEM", "UNKNOWN"]), endpoint: z.string().max(4096).nullable().optional(), usernameRef: z.string().max(256).nullable().optional()}).nullable().optional(),
    withheldFields: z.array(z.string().max(128)), incompleteFields: z.array(z.string().max(128)),
})

export const BrowserIntegrationCapabilitiesV2Schema = z.object({
    protocolVersion: ProtocolVersion,
    desktopVersion: z.string().min(1).max(128),
    supportedActions: z.array(z.string()),
    supportedTransports: z.array(z.enum(["NATIVE_PORT", "NATIVE_ONE_SHOT", "AUTHENTICATED_HTTP"])),
    supportedSchemes: z.array(z.enum(["HTTP", "HTTPS", "FTP", "FTPS_EXPLICIT", "FTPS_IMPLICIT", "HLS", "DASH"])),
    maxFrameBytes: z.int().min(1024).max(256 * 1024),
    maxBodyBytes: z.int().min(0).max(4 * 1024 * 1024),
    featureFlags: FeatureFlags,
})

export const BrowserIntegrationPolicyV2Schema = z.object({
    schemaVersion: z.literal(2),
    revision: z.int().min(0),
    mode: z.enum(["OFF", "STANDARD", "FULL"]),
    automaticInterception: z.boolean(),
    advancedMediaInspection: z.boolean(),
    privateBrowsing: z.boolean(),
    sendProtectedContext: z.boolean(),
    registeredFileTypes: z.array(z.string().regex(/^[A-Za-z0-9]{1,16}$/)).max(512),
    registeredMimeTypes: z.array(z.string().min(1).max(128)).max(512),
    excludedUrls: z.array(z.string().max(16_384)).max(2048),
    forceShortcut: z.string().max(128).nullable().optional(),
    bypassShortcut: z.string().max(128).nullable().optional(),
    customMenuActions: z.array(z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
        title: z.string().min(1).max(128),
        scope: z.enum(["SELECTED", "ALL", "PAGE", "FRAME", "CUSTOM"]),
        sourceKinds: z.array(z.enum(["LINK", "IMAGE", "AUDIO", "VIDEO", "TEXT", "INPUT", "SCRIPT", "FRAME", "PAGE", "MEDIA"])).max(10),
    })).max(32).optional(),
    mediaSiteAdapters: z.array(z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
        hostPattern: z.string().min(1).max(256),
        urlRegex: z.string().max(256).nullable().optional(),
        selectors: z.array(z.string().min(1).max(512)).max(32),
        attributes: z.array(z.string().regex(/^[A-Za-z_:][-A-Za-z0-9_:.]{0,63}$/)).max(16),
    })).max(32).optional(),
})

const BrowserCandidateV2Schema = z.object({
    candidateId: z.string().min(1).max(128),
    url: z.string().max(16_384),
    sourceKind: z.enum(["LINK", "IMAGE", "AUDIO", "VIDEO", "TEXT", "INPUT", "SCRIPT", "FRAME", "PAGE", "MEDIA"]),
    frameId: z.int(),
    description: z.string().max(4096).nullable().optional(),
    suggestedName: z.string().max(4096).nullable().optional(),
    contextRef: z.string().max(256).nullable().optional(),
})

export const BrowserBatchV2Schema = z.object({
    operationId: z.string().min(1).max(128), generation: z.int().min(0),
    scope: z.enum(["SELECTED", "ALL", "PAGE", "FRAME", "CUSTOM"]),
    browserFamily: z.enum(["CHROME", "EDGE", "FIREFOX", "OPERA", "CHROMIUM", "BRAVE", "VIVALDI", "UNKNOWN"]),
    privateContext: z.boolean(), chunkIndex: z.int().min(0), chunkCount: z.int().min(1).max(50),
    candidates: z.array(BrowserCandidateV2Schema).max(100),
})

export const BrowserBatchReceiptV2Schema = z.object({
    operationId: z.string().min(1).max(128),
    state: z.enum(["RECEIVING", "READY_FOR_REVIEW", "REVIEW_ACCEPTED", "REVIEW_REJECTED", "REJECTED", "CANCELLED"]),
    receivedChunks: z.int().min(0).max(50), chunkCount: z.int().min(1).max(50),
    acceptedCandidates: z.int().min(0).max(5_000), rejectedCandidates: z.int().min(0).max(5_000),
    duplicateCandidates: z.int().min(0).max(5_000),
})

export const CaptureProposalV2Schema = z.object({
    captureId: z.string().min(1).max(128), idempotencyKey: z.string().min(1).max(128),
    browserFamily: z.enum(["CHROME", "EDGE", "FIREFOX", "OPERA", "CHROMIUM", "BRAVE", "VIVALDI", "UNKNOWN"]),
    browserDownloadId: z.int().nullable().optional(), generation: z.int().min(0),
    requestContext: RequestContext, requestedDisposition: z.enum(["TASK", "REVIEW"]),
})

export const BrowserMediaGroupV2Schema = z.object({
    groupId: z.string().max(256), pageGeneration: z.int().min(0), title: z.string().max(4096),
    live: z.boolean(), protectedMedia: z.boolean(),
    variants: z.array(z.object({
        variantId: z.string().max(256), url: z.string().max(16_384),
        transport: z.enum(["PROGRESSIVE", "HLS", "DASH"]), width: z.int().min(0).nullable().optional(),
        height: z.int().min(0).nullable().optional(), frameRate: z.number().min(0).nullable().optional(),
        bandwidth: z.int().min(0).nullable().optional(), container: z.string().max(64).nullable().optional(),
        tracks: z.array(z.object({trackId: z.string().max(256), role: z.enum(["VIDEO", "AUDIO", "SUBTITLE"]), language: z.string().max(64).nullable().optional(), codec: z.string().max(256).nullable().optional(), selected: z.boolean()})).max(64),
        contextRef: z.string().max(256).nullable().optional(),
    })).min(1).max(256),
})
