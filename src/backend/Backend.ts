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

const nativeMessagingTransport = new NativeMessagingTransport(Constants.packageName)

let _isNativeMessagingSupported = false

// lazy init
let httpApi: HttpApi | null = null
// lazy init
let nativeMessaging: NativeMessagingApi | null = null

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

    _isNativeMessagingSupported = await nativeMessagingApi.test()
    if (isNativeMessagingSupported()) {
        console.log("Native messaging is available")
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


