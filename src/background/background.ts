import {initializeOptions} from "~/contextmenus/ContextMenus";
import * as backend from "~/backend/Backend"
import * as Backend from "~/backend/Backend"
import {onMessage} from "webext-bridge/background";
import {addDownload, getHeadersForUrls} from "~/background/actions";
import {keepListeningToEvents} from "~/utils/extension-api";
import {IS_MV3} from "~/utils/ManifestUtil";
import * as BackgroundSharedState from "~/background/BackgroundSharedState";
import {DefinedCommands} from "~/message/Commands";
import {defineExtensionEntry} from "~/utils/DefineExtensionEntry";
import platformInfoProvider from "~/utils/platform/InitPlatformFromBackground";
import BackgroundEntryType from "~/utils/EntryPointTypes/background/BackgroundEntryType";
import {
    bootBrowserPermissionPolicyV2,
    getBrowserPermissionStatusV2,
    reconcileBrowserPermissionPolicyV2,
} from "~/permissions/BrowserPermissionPolicyV2";
import type {BrowserIntegrationPolicyV2} from "~/protocol/generated/BrowserIntegrationProtocolV2";
import {recaptureBrowserDownloadV2} from "~/linkgrabber/v2/HistoricalDownloadCaptureV2";
import {cancelStagedBatchReviewV2, submitStagedBatchReviewV2} from "~/contextmenus/StagedBatchReviewV2";
import {MediaCandidateRegistryV2} from "~/media/v2/MediaCandidateRegistryV2";
import {bootAddressRefreshObserverV2} from "~/addressrefresh/AddressRefreshObserverV2";

function receiveMessageFromContentScripts() {
    onMessage(DefinedCommands.ADD_DOWNLOAD, async (msg) => {
        return await addDownload(msg.data)
    })
    onMessage(DefinedCommands.TEST_HTTP_PORT, async (msg) => {
        return await backend.httpPing(msg.data)
    })
    onMessage(DefinedCommands.TEST_NATIVE_MESSAGING, async (msg) => {
        return await backend.nativeMessagingPing()
    })
    onMessage(DefinedCommands.IS_APP_REACHABLE, async (msg) => {
        return await backend.isAppReachable()
    })
    onMessage(DefinedCommands.SHOW_LOG, (msg) => {
        console.log(...msg.data)
    })
    onMessage(DefinedCommands.GET_HEADERS, async (msg) => {
        return await getHeadersForUrls(msg.data)
    })
    onMessage(DefinedCommands.SET_HOLDING_KEY, async (msg) => {
        const data = msg.data as {key?: unknown; pressed?: unknown}
        const tabId = (msg.sender as unknown as {tabId?: number}).tabId ?? -1
        await BackgroundSharedState.setHoldingKey(
            tabId,
            typeof data.key === "string" ? data.key : "",
            data.pressed === true,
        )
    })
    onMessage(DefinedCommands.GET_PLATFORM, async () => {
        return await platformInfoProvider.getPlatformInfo()
    })
    onMessage(DefinedCommands.GET_BROWSER_POLICY_STATUS_V2, async () => ({
        policy: Backend.getBrowserPolicyV2(),
        permissions: getBrowserPermissionStatusV2(),
    }))
    onMessage(DefinedCommands.UPDATE_BROWSER_POLICY_V2, async msg => {
        const policy = await Backend.updateBrowserPolicyV2(msg.data as unknown as BrowserIntegrationPolicyV2)
        const permissions = await reconcileBrowserPermissionPolicyV2()
        return {policy, permissions}
    })
    onMessage(DefinedCommands.RECONCILE_BROWSER_PERMISSIONS_V2, async () => ({
        policy: Backend.getBrowserPolicyV2(),
        permissions: await reconcileBrowserPermissionPolicyV2(),
    }))
    onMessage(DefinedCommands.SET_TAB_CAPTURE_BYPASS_V2, async msg => {
        const data = msg.data as {tabId?: unknown; bypassed?: unknown}
        if (typeof data.tabId !== "number") return false
        await BackgroundSharedState.setTabBypass(data.tabId, data.bypassed === true)
        return true
    })
    onMessage(DefinedCommands.RECAPTURE_BROWSER_DOWNLOAD_V2, async msg => {
        return typeof msg.data === "number" && await recaptureBrowserDownloadV2(msg.data)
    })
    onMessage(DefinedCommands.SUBMIT_STAGED_BROWSER_BATCH_V2, async msg => {
        const data = msg.data as unknown as {reviewId?: unknown; candidateIds?: unknown}
        if (typeof data.reviewId !== "string" || !Array.isArray(data.candidateIds)) throw new Error("INVALID_BATCH_REVIEW")
        return await submitStagedBatchReviewV2(data.reviewId, data.candidateIds.filter((value): value is string => typeof value === "string"))
    })
    onMessage(DefinedCommands.CANCEL_STAGED_BROWSER_BATCH_V2, async msg => {
        if (typeof msg.data !== "string") return false
        await cancelStagedBatchReviewV2(msg.data)
        return true
    })
}

export default defineExtensionEntry()
    .withType(BackgroundEntryType)
    .withInit(async (ctx) => {
        const disposable = ctx.getDisposable()
        try {
            if (IS_MV3) {
                disposable.add(keepListeningToEvents())
            }
            await Backend.boot()
            await BackgroundSharedState.boot()
            await bootBrowserPermissionPolicyV2()
            await new MediaCandidateRegistryV2().boot()
            let stopAddressRefresh: (() => void) | null = null
            let addressRefreshGeneration = 0
            const configureAddressRefresh = async () => {
                const generation = ++addressRefreshGeneration
                const policy = Backend.getBrowserPolicyV2()
                stopAddressRefresh?.(); stopAddressRefresh = null
                if (policy?.mode === "FULL" && policy.sendProtectedContext) {
                    const stop = await bootAddressRefreshObserverV2()
                    if (generation === addressRefreshGeneration) stopAddressRefresh = stop
                    else stop()
                }
            }
            await configureAddressRefresh()
            Backend.addBrowserPolicyListener(() => void configureAddressRefresh())
            await initializeOptions()
            receiveMessageFromContentScripts()
            console.log("ab dm extension loaded successfully")
        } catch (e) {
            console.log("extension loading fail", e)
            throw e
        }
    })
