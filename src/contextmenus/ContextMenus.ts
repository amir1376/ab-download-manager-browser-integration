import browser from "webextension-polyfill";
import * as  Configs from "~/configs/Config"
import {DownloadRequestItem,DownloadRequestHeaders} from "~/interfaces/DownloadRequestItem";
import {sendMessage} from "webext-bridge/background"
import {addDownload, getHeadersForUrl} from "~/background/actions";
import {DefinedCommands} from "~/message/Commands";
import {captureExplicitFtpV2, classifyFtpUrl} from "~/linkgrabber/v2/FtpCaptureV2";
import * as Backend from "~/backend/Backend";
import {getPermissionRuntimeStateV2} from "~/permissions/PermissionRuntimeStateV2";
import * as BackgroundSharedState from "~/background/BackgroundSharedState";
const optionIds = Object.freeze({
    downloadWithAbDm: "download-with-ab-dm",
    downloadSelectedWithAbDm: "download-selected-with-ab-dm",
    tabCaptureBypass: "tab-capture-bypass-v2",
})

async function createOptions() {
    await browser.contextMenus.removeAll()
    browser.contextMenus.create({
        id: optionIds.downloadSelectedWithAbDm,
        title: browser.i18n.getMessage("context_menu_download_selected_links_with_abdm"),
        contexts: [
            "selection"
        ]
    })
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
            case optionIds.downloadSelectedWithAbDm:
                const [tab] = (await browser.tabs.query({active: true}))
                const tabId = tab?.id
                if (tabId === undefined) {
                    break
                }
                await sendMessage(
                    DefinedCommands.CHECK_SELECTED_TEXT_FOR_LINKS,
                    null,
                    {
                        tabId:tabId,
                        context:"content-script",
                    }
                )
                break
        }

    })
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
    createOnCLickHandlers()
    createOnShownHandler()
}
