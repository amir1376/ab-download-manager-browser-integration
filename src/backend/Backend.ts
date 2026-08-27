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

const nativeMessagingTransport = new NativeMessagingTransport(Constants.packageName)

let _isNativeMessagingSupported = false

// lazy init
let httpApi: HttpApi | null = null
// lazy init
let nativeMessaging: NativeMessagingApi | null = null
let helloRefresh: Promise<void> | null = null

nativeMessagingTransport.addConnectionListener((connected) => {
    _isNativeMessagingSupported = connected
    if (!connected) {
        clearBrowserHelloV2()
        return
    }
    void refreshBrowserHelloV2()
})

nativeMessagingTransport.addNativeRequestHandler("queryBrowserContextV2", () => ({
    status: "UNAVAILABLE",
    reason: browserParityFeatureFlagsV2.twoPhaseCapture ? "NO_MATCHING_CONTEXT" : "FEATURE_NOT_ENABLED",
}))

nativeMessagingTransport.addNativeRequestHandler("policyChangedV2", async () => ({
    accepted: false,
    reason: browserParityFeatureFlagsV2.permissionPolicy ? "POLICY_REFRESH_REQUIRED" : "FEATURE_NOT_ENABLED",
}))

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
        } catch {
            clearBrowserHelloV2()
            console.log("Browser integration protocol v2 is unavailable; legacy compatibility is active")
        }
    } else {
        console.log("Native messaging is not available!")
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

export function getBrowserProtocolCompatibilityMode() {
    return classifyBrowserProtocolCompatibility(isNativeMessagingSupported(), getBrowserHelloV2())
}

export function canUseAutomaticTakeover(): boolean {
    return canUseAutomaticTakeoverV2(
        getBrowserProtocolCompatibilityMode(),
        browserParityFeatureFlagsV2,
    )
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


