import browser from "webextension-polyfill";
import * as  Configs from "~/configs/Config"
import {DownloadRequestItem,DownloadRequestHeaders} from "~/interfaces/DownloadRequestItem";
import {addDownload, getHeadersForUrl} from "~/background/actions";
import {captureExplicitFtpV2, classifyFtpUrl} from "~/linkgrabber/v2/FtpCaptureV2";
import * as Backend from "~/backend/Backend";
import {getPermissionRuntimeStateV2} from "~/permissions/PermissionRuntimeStateV2";
import * as BackgroundSharedState from "~/background/BackgroundSharedState";
import {stageBatchReviewV2} from "~/contextmenus/StagedBatchReviewV2";
import type {BrowserBatchScopeV2, BrowserCandidateSourceV2} from "~/protocol/generated/BrowserIntegrationProtocolV2";
const optionIds = Object.freeze({
    downloadWithAbDm: "download-with-ab-dm",
    downloadSelectedWithAbDm: "download-selected-with-ab-dm",
    tabCaptureBypass: "tab-capture-bypass-v2",
    downloadAllWithAbDm: "download-all-with-ab-dm-v2",
    downloadPageWithAbDm: "download-page-with-ab-dm-v2",
    downloadFrameWithAbDm: "download-frame-with-ab-dm-v2",
})
const CUSTOM_PREFIX = "custom-batch-v2:"
let initialized = false

async function createOptions() {
    await browser.contextMenus.removeAll()
    const policy = Backend.getBrowserPolicyV2()
    if (!policy || policy.mode === "OFF") return
    browser.contextMenus.create({
        id: optionIds.downloadSelectedWithAbDm,
        title: browser.i18n.getMessage("context_menu_download_selected_links_with_abdm"),
        contexts: [
            "selection"
        ]
    })
    browser.contextMenus.create({
        id: optionIds.downloadAllWithAbDm,
        title: "Download all links with AB Download Manager",
        contexts: ["page", "frame", "editable"],
    })
    browser.contextMenus.create({
        id: optionIds.downloadPageWithAbDm,
        title: "Download current page with AB Download Manager",
        contexts: ["page", "editable"],
    })
    browser.contextMenus.create({
        id: optionIds.downloadFrameWithAbDm,
        title: "Download current frame with AB Download Manager",
        contexts: ["frame", "editable"],
    })
    for (const action of policy.customMenuActions ?? []) {
        browser.contextMenus.create({
            id: CUSTOM_PREFIX + action.id,
            title: action.title,
            contexts: action.scope === "SELECTED" ? ["selection"] : ["page", "frame", "editable"],
        })
    }
    browser.contextMenus.create({
        id: optionIds.tabCaptureBypass,
        title: "Bypass automatic capture in this tab",
        contexts: ["page", "link", "audio", "video", "image", "selection"],
        type: "checkbox",
        checked: false,
    })
    browser.contextMenus.create({
        id: optionIds.downloadWithAbDm,
        title: browser.i18n.getMessage("context_menu_download_with_abdm"),
        contexts: [
            "link", "audio", "video", "image"
        ]
    })
}

function createOnCLickHandlers() {
    browser.contextMenus.onClicked.addListener(async (args, clickedTab) => {
        const policy = Backend.getBrowserPolicyV2()
        if (!policy || policy.mode === "OFF") return
        if (clickedTab?.incognito && (!policy.privateBrowsing || !getPermissionRuntimeStateV2().privateAllowed)) return
        switch (args.menuItemId) {
            case optionIds.tabCaptureBypass:
                if (clickedTab?.id !== undefined) {
                    await BackgroundSharedState.setTabBypass(clickedTab.id, args.checked === true)
                }
                break
            case optionIds.downloadSelectedWithAbDm:
                if (clickedTab?.id !== undefined) await submitBatch(clickedTab.id, "SELECTED", clickedTab.incognito, args.frameId)
                break
            case optionIds.downloadAllWithAbDm:
                if (clickedTab?.id !== undefined) await submitBatch(clickedTab.id, "ALL", clickedTab.incognito)
                break
            case optionIds.downloadPageWithAbDm:
                if (clickedTab?.id !== undefined) await submitBatch(clickedTab.id, "PAGE", clickedTab.incognito, 0)
                break
            case optionIds.downloadFrameWithAbDm:
                if (clickedTab?.id !== undefined) await submitBatch(clickedTab.id, "FRAME", clickedTab.incognito, args.frameId)
                break
            case optionIds.downloadWithAbDm:
                const link = args.linkUrl || args.srcUrl
                if (!link) {
                    console.log("there is no valid link returning")
                    return
                }
                const downloadPage = args.pageUrl ?? null
                if (classifyFtpUrl(link)) {
                    if (!Backend.isFeatureAvailableV2("ftpCapture")) {
                        console.log("FTP capture v2 is not enabled")
                        return
                    }
                    await captureExplicitFtpV2(
                        link,
                        policy.sendProtectedContext ? downloadPage : null,
                        Boolean(clickedTab?.incognito),
                    )
                    break
                }
                const description = args.linkText ?? null
                let headers: DownloadRequestHeaders | null = null
                if (policy.sendProtectedContext && Configs.getLatestConfig().sendHeaders) {
                    headers = await getHeadersForUrl(link)
                }
                const downloadRequest: DownloadRequestItem = {
                    link: link,
                    description: description,
                    downloadPage: policy.sendProtectedContext ? downloadPage : null,
                    headers: headers,
                    suggestedName: null,
                    type: "http",
                }
                await addDownload([downloadRequest])
                // backgroundReceiveMessage(addDownloadCommand([downloadRequest]))
                break
            default:
                if (typeof args.menuItemId === "string" && args.menuItemId.startsWith(CUSTOM_PREFIX) && clickedTab?.id !== undefined) {
                    const action = policy.customMenuActions?.find(value => CUSTOM_PREFIX + value.id === args.menuItemId)
                    if (action) await submitBatch(clickedTab.id, action.scope, clickedTab.incognito, args.frameId, action.sourceKinds)
                }
        }

    })
}

async function submitBatch(
    tabId: number,
    scope: BrowserBatchScopeV2,
    privateContext = false,
    frameId?: number,
    sourceKinds: BrowserCandidateSourceV2[] = [],
): Promise<void> {
    try {
        await stageBatchReviewV2(tabId, scope, privateContext, frameId, sourceKinds)
    } catch (failure) {
        console.warn("Browser batch collection failed", failure)
        const code = failure instanceof Error ? failure.message : "BROWSER_BATCH_FAILED"
        const message = code === "NO_LINKS_FOUND" ? "No downloadable links were found in this selection or page." :
            code === "SESSION_REVIEW_STORAGE_UNAVAILABLE" ? "This browser cannot safely retain a private batch review." :
                "The link review could not be prepared. Browser-owned downloads were not changed."
        await browser.tabs.sendMessage(tabId, {action: "browserBatchFeedbackV2", message}).catch(async () => {
            const action = (browser as unknown as {action?: {setBadgeText(details: {text: string}): Promise<void>; setTitle(details: {title: string}): Promise<void>}}).action
            await action?.setBadgeText({text: "!"})
            await action?.setTitle({title: message})
        })
    }
}

function createOnShownHandler() {
    const onShown = (browser.contextMenus as unknown as {
        onShown?: {addListener(listener: (info: unknown, tab?: {id?: number}) => void): void}
        refresh?: () => Promise<void>
    }).onShown
    if (!onShown) return
    onShown.addListener((_info, tab) => {
        if (tab?.id === undefined) return
        void browser.contextMenus.update(optionIds.tabCaptureBypass, {
            checked: BackgroundSharedState.isTabBypassed(tab.id),
        }).then(() => (browser.contextMenus as unknown as {refresh?: () => Promise<void>}).refresh?.())
    })
}

export async function initializeOptions() {
    await createOptions()
    if (!initialized) {
        initialized = true
        createOnCLickHandlers()
        createOnShownHandler()
        Backend.addBrowserPolicyListener(() => void createOptions())
    }
}
