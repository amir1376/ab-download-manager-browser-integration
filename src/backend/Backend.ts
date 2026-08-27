import {createHttpApiClient, HttpApi} from "~/backend/HttpApi";
import {run} from "~/utils/ScopeFunctions";
import * as Configs from "~/configs/Config"
import {DownloadRequestItem} from "~/interfaces/DownloadRequestItem";
import {DownloadRequestOptions} from "~/interfaces/DownloadRequestOptions";
import Constants from "~/utils/Constants";
import {IAppApi} from "~/backend/IAppApi";
import {NativeMessagingApi} from "~/backend/NativeMessagingApi";
import {NativeMessagingTransport} from "~/backend/nativemessaging/NativeMessagingTransport";
import {CompositeAppApi} from "~/backend/CompositeAppApi";
import {AddressRefreshCandidate} from "~/interfaces/AddressRefresh";
import {clearBrowserHelloV2, getBrowserHelloV2, setBrowserHelloV2} from "~/protocol/BrowserBridgeV2";
import {browserParityFeatureFlagsV2} from "~/configs/FeatureFlags";
import {canUseAutomaticTakeoverV2, classifyBrowserProtocolCompatibility} from "~/backend/ProtocolCompatibility";
import {BrowserHttpBridgeV2} from "~/backend/BrowserHttpBridgeV2";
import type {CaptureProposalV2, PreparedCaptureV2} from "~/protocol/generated/BrowserIntegrationProtocolV2";
import type {BrowserBatchReceiptV2, BrowserBatchV2, BrowserIntegrationPolicyV2} from "~/protocol/generated/BrowserIntegrationProtocolV2";
import {BrowserIntegrationPolicyV2Schema} from "~/protocol/BrowserIntegrationProtocolV2Schema";
import browser from "webextension-polyfill";
import {reportSafeDiagnosticV2} from "~/diagnostics/DiagnosticsV2";

const nativeMessagingTransport = new NativeMessagingTransport(Constants.packageName)

let _isNativeMessagingSupported = false

// lazy init
let httpApi: HttpApi | null = null
// lazy init
let nativeMessaging: NativeMessagingApi | null = null
let helloRefresh: Promise<void> | null = null
let currentPolicyV2: BrowserIntegrationPolicyV2 | null = null
const policyListeners = new Set<(policy: BrowserIntegrationPolicyV2 | null) => void>()

nativeMessagingTransport.addConnectionListener((connected) => {
    _isNativeMessagingSupported = connected
    if (!connected) {
        clearBrowserHelloV2()
        currentPolicyV2 = null
        for (const listener of policyListeners) listener(null)
        void reportSafeDiagnosticV2("NATIVE_DISCONNECTED", "WARNING", "RETRY_CONNECTION")
        return
    }
    void refreshBrowserHelloV2()
})

nativeMessagingTransport.addNativeRequestHandler("policyChangedV2", async payload => {
    if (!browserParityFeatureFlagsV2.permissionPolicy) return {accepted: false, reason: "FEATURE_NOT_ENABLED"}
    try {
        setCurrentPolicyV2(BrowserIntegrationPolicyV2Schema.parse(payload) as BrowserIntegrationPolicyV2)
        return {accepted: true}
    } catch {
        return {accepted: false, reason: "INVALID_POLICY"}
    }
})

export function registerNativeBrowserRequestHandler(
    action: string,
    handler: (payload: unknown) => Promise<unknown> | unknown,
): () => void {
    return nativeMessagingTransport.addNativeRequestHandler(action, handler)
}

async function refreshBrowserHelloV2(): Promise<void> {
    if (helloRefresh !== null) return helloRefresh
    helloRefresh = (async () => {
        try {
            setBrowserHelloV2(await getOrInitNativeMessagingApi().helloV2())
        } catch {
            clearBrowserHelloV2()
        }
    })().finally(() => {
        helloRefresh = null
    })
    return helloRefresh
}

function setCurrentPolicyV2(policy: BrowserIntegrationPolicyV2): BrowserIntegrationPolicyV2 {
    if (currentPolicyV2 !== null && policy.revision < currentPolicyV2.revision) return currentPolicyV2
    currentPolicyV2 = policy
    for (const listener of policyListeners) listener(policy)
    return policy
}

function getHttpApi() {
    if (httpApi == null) {
        const config = Configs.getLatestConfig()
        httpApi = createHttpApiClient(config.port)
    }
    return httpApi
}

function getOrInitNativeMessagingApi() {
    if (nativeMessaging == null) {
        nativeMessaging = new NativeMessagingApi(nativeMessagingTransport)
    }
    return nativeMessaging
}

export async function boot() {
    const nativeMessagingApi = getOrInitNativeMessagingApi()

    _isNativeMessagingSupported = await nativeMessagingApi.connectAndTest()
    if (isNativeMessagingSupported()) {
        console.log("Native messaging is available")
        try {
            await refreshBrowserHelloV2()
            if (getBrowserHelloV2() === null) throw new Error("Protocol v2 unavailable")
            await refreshBrowserPolicyV2()
            await migrateLegacyCaptureSettingsToPolicyV2().catch(() => {
                console.warn("LEGACY_POLICY_MIGRATION_DEFERRED")
            })
        } catch {
            clearBrowserHelloV2()
            console.log("Browser integration protocol v2 is unavailable; legacy compatibility is active")
            void reportSafeDiagnosticV2("DESKTOP_PROTOCOL_LEGACY", "WARNING", "UPDATE_DESKTOP")
        }
    } else {
        console.log("Native messaging is not available!")
        void reportSafeDiagnosticV2("NATIVE_UNAVAILABLE", "ERROR", "RETRY_CONNECTION")
    }

    Configs.onChanged.addEventListener((event) => {
        run(async () => {
            const port = (event.port)
            httpApi = createHttpApiClient(port)
        })
    })
}

export function isNativeMessagingSupported(): boolean {
    return _isNativeMessagingSupported
}


function getApi(): IAppApi {
    const nativeMessagingApi = getOrInitNativeMessagingApi();
    if (nativeMessagingApi.isConnected()) {
        return nativeMessagingApi
    }
    const httpApi = getHttpApi();

    const priority: IAppApi[] = []
    // first try http which does not require initiating native messaging
    priority.push(httpApi)
    // otherwise try native messaging which can also open the app
    priority.push(nativeMessagingApi)

    let reportErrorFrom: IAppApi
    if (isNativeMessagingSupported()) {
        // we are interested on native messaging api error in case its supported
        reportErrorFrom = nativeMessagingApi
    } else {
        reportErrorFrom = httpApi
    }

    return new CompositeAppApi(
        priority,
        reportErrorFrom,
    )
}

async function migrateLegacyCaptureSettingsToPolicyV2(): Promise<void> {
    const marker = "__abdmPolicyMigrationVersion"
    const stored = await browser.storage.local.get(marker)
    if (stored[marker] === 1) return
    const policy = currentPolicyV2
    if (policy?.revision === 0 && policy.mode === "STANDARD") {
        const legacy = Configs.getLatestConfig()
        await updateBrowserPolicyV2({
            ...policy,
            registeredFileTypes: legacy.registeredFileTypes,
            excludedUrls: legacy.blacklistedUrls,
            bypassShortcut: legacy.bypassShortcut,
            // Privacy-sensitive legacy toggles are never promoted to FULL automatically.
            automaticInterception: false,
            advancedMediaInspection: false,
            privateBrowsing: false,
            sendProtectedContext: false,
        })
    }
    await browser.storage.local.set({[marker]: 1})
}

export function getBrowserProtocolCompatibilityMode() {
    return classifyBrowserProtocolCompatibility(isNativeMessagingSupported(), getBrowserHelloV2())
}

export function canUseAutomaticTakeover(): boolean {
    const hello = getBrowserHelloV2()
    const policy = currentPolicyV2
    return canUseAutomaticTakeoverV2(
        getBrowserProtocolCompatibilityMode(),
        hello?.capabilities.featureFlags ?? browserParityFeatureFlagsV2,
    ) && browserParityFeatureFlagsV2.secureBridge && browserParityFeatureFlagsV2.twoPhaseCapture &&
        policy?.mode === "FULL" && policy.automaticInterception
}

export function getBrowserPolicyV2(): BrowserIntegrationPolicyV2 | null {
    return currentPolicyV2
}

export function getBrowserDesktopVersionV2(): string | null {
    return getBrowserHelloV2()?.capabilities.desktopVersion ?? null
}

export function addBrowserPolicyListener(listener: (policy: BrowserIntegrationPolicyV2 | null) => void): () => void {
    policyListeners.add(listener)
    return () => policyListeners.delete(listener)
}

export function isFeatureAvailableV2(feature: keyof typeof browserParityFeatureFlagsV2): boolean {
    const hello = getBrowserHelloV2()
    return Boolean(browserParityFeatureFlagsV2[feature] && hello?.capabilities.featureFlags[feature])
}

function getBrowserHttpBridgeV2(): BrowserHttpBridgeV2 | null {
    const hello = getBrowserHelloV2()
    return hello ? new BrowserHttpBridgeV2(hello.httpFallback.baseUrl, hello.httpFallback.apiKey) : null
}

async function useCaptureBridgeV2<T>(
    nativeAction: (api: NativeMessagingApi) => Promise<T>,
    httpAction: (api: BrowserHttpBridgeV2) => Promise<T>,
): Promise<T> {
    const nativeApi = getOrInitNativeMessagingApi()
    if (nativeApi.isConnected()) {
        try {
            return await nativeAction(nativeApi)
        } catch {
            // Authenticated HTTP is the bounded fallback negotiated by helloV2.
        }
    }
    const http = getBrowserHttpBridgeV2()
    if (http === null) throw new Error("Browser integration protocol v2 is unavailable")
    return await httpAction(http)
}

export async function refreshBrowserPolicyV2(): Promise<BrowserIntegrationPolicyV2> {
    const policy = await useCaptureBridgeV2(
        api => api.getPolicyV2(),
        api => api.getPolicy(),
    )
    return setCurrentPolicyV2(policy)
}

export async function updateBrowserPolicyV2(policy: BrowserIntegrationPolicyV2): Promise<BrowserIntegrationPolicyV2> {
    const updated = await useCaptureBridgeV2(
        api => api.updatePolicyV2(policy),
        api => api.updatePolicy(policy),
    )
    return setCurrentPolicyV2(updated)
}

export async function prepareCaptureV2(proposal: CaptureProposalV2): Promise<PreparedCaptureV2> {
    return useCaptureBridgeV2(
        api => api.prepareCaptureV2(proposal),
        api => api.prepareCapture(proposal),
    )
}

export async function markBrowserReleasedV2(captureId: string): Promise<PreparedCaptureV2 | null> {
    return useCaptureBridgeV2(
        api => api.markBrowserReleasedV2(captureId),
        api => api.markBrowserReleased(captureId),
    )
}

export async function abortCaptureV2(captureId: string): Promise<PreparedCaptureV2 | null> {
    return useCaptureBridgeV2(
        api => api.abortCaptureV2(captureId),
        api => api.abortCapture(captureId),
    )
}

export async function listPreparedCapturesV2(): Promise<PreparedCaptureV2[]> {
    return useCaptureBridgeV2(
        api => api.listPreparedCapturesV2(),
        api => api.listPreparedCaptures(),
    )
}

export async function submitBrowserBatchV2(batch: BrowserBatchV2): Promise<BrowserBatchReceiptV2> {
    return useCaptureBridgeV2(api => api.submitBatchV2(batch), api => api.submitBatch(batch))
}

export async function cancelBrowserBatchV2(operationId: string): Promise<BrowserBatchReceiptV2 | null> {
    return useCaptureBridgeV2(api => api.cancelBatchV2(operationId), api => api.cancelBatch(operationId))
}

function getRefreshApi(): IAppApi {
    const nativeMessagingApi = getOrInitNativeMessagingApi()
    const hello = getBrowserHelloV2()
    const httpFallback = hello
        ? new HttpApi(hello.httpFallback.baseUrl, () => hello.httpFallback.apiKey)
        : getHttpApi()
    return new CompositeAppApi(
        [nativeMessagingApi, httpFallback],
        nativeMessagingApi,
    )
}


export async function addDownload(
    downloadRequestItems: DownloadRequestItem[],
    downloadRequestOptions: DownloadRequestOptions,
) {
    const api = getApi();
    return await api.addDownload({
        items: downloadRequestItems,
        options: downloadRequestOptions,
    })
}

export async function isAppReachable() {
    const api = getApi();
    try {
        return await api.ping()
    } catch (e) {
        return false
    }
}

export async function httpPing(port: number | null = null) {
    let api: HttpApi
    if (port !== null) {
        api = createHttpApiClient(port)
    } else {
        api = getHttpApi()
    }
    try {
        await api.ping()
        return true
    } catch (e) {
        return false
    }
}

export async function nativeMessagingPing() {
    let api = getOrInitNativeMessagingApi()
    try {
        await api.ping()
        return true
    } catch (e) {
        return false
    }
}

export async function addressRefreshCapabilities() {
    return await getRefreshApi().addressRefreshCapabilities()
}

export async function addressRefreshSessions() {
    return await getRefreshApi().addressRefreshSessions()
}

export async function submitAddressRefreshCandidate(candidate: AddressRefreshCandidate) {
    return await getRefreshApi().submitAddressRefreshCandidate(candidate)
}


