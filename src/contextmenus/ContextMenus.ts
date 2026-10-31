import browser from "webextension-polyfill";
import * as Configs from "~/configs/Config"
import {DownloadRequestItem, DownloadRequestHeaders} from "~/interfaces/DownloadRequestItem";
import {sendMessage} from "webext-bridge/background"
import {addDownload, getHeadersForUrl} from "~/background/actions";
import {DefinedCommands} from "~/message/Commands";
import {distinctUntilChanged, map} from "rxjs";
import {DisposablePossibleType} from "~/utils/disposable";

const optionIds = Object.freeze({
    downloadWithAbDm: "download-with-ab-dm",
    downloadSelectedWithAbDm: "download-selected-with-ab-dm",
})

async function recreateOptions(
    contextMenuEnabled: boolean
) {
    await browser.contextMenus.removeAll()
    if (contextMenuEnabled) {
        browser.contextMenus.create({
            id: optionIds.downloadSelectedWithAbDm,
            title: browser.i18n.getMessage("context_menu_download_selected_links_with_abdm"),
            contexts: [
                "selection"
            ]
        })
        browser.contextMenus.create({
            id: optionIds.downloadWithAbDm,
            title: browser.i18n.getMessage("context_menu_download_with_abdm"),
            contexts: [
                "link", "audio", "video", "image"
            ]
        })
    }
}

function createOnCLickHandlers() {
    browser.contextMenus.onClicked.addListener(async (args, clickedTab) => {
        switch (args.menuItemId) {
            case optionIds.downloadWithAbDm:
                const link = args.linkUrl || args.srcUrl
                if (!link) {
                    console.log("there is no valid link returning")
                    return
                }
                const downloadPage = args.pageUrl ?? null
                const description = args.linkText ?? null
                let headers: DownloadRequestHeaders | null = null
                if (Configs.getLatestConfig().sendHeaders) {
                    headers = await getHeadersForUrl(link)
                }
                const downloadRequest: DownloadRequestItem = {
                    link: link,
                    description: description,
                    downloadPage: downloadPage,
                    headers: headers,
                    suggestedName: null,
                    type: "http",
                }
                await addDownload([downloadRequest])
                // backgroundReceiveMessage(addDownloadCommand([downloadRequest]))
                break
            case optionIds.downloadSelectedWithAbDm:
                // the tab has to come from the click itself, tabs.query({active:true})
                // returns the active tab of every window and the first one is rarely ours
                const tabId = clickedTab?.id
                    ?? (await browser.tabs.query({active: true, currentWindow: true}))[0]?.id
                if (tabId === undefined) {
                    break
                }
                await sendMessage(
                    DefinedCommands.CHECK_SELECTED_TEXT_FOR_LINKS,
                    null,
                    {
                        tabId: tabId,
                        context: "content-script",
                    }
                )
                break
        }

    })
}

function updateOptionsOnConfigChanges() {
    return Configs.getOnChanged()
        .pipe(map(value => value.contextMenuEnabled))
        .pipe(distinctUntilChanged())
        .subscribe(async (enabled) => {
            await recreateOptions(enabled)
        })
}

export function initializeOptions(): DisposablePossibleType {
    const subscription = updateOptionsOnConfigChanges()
    createOnCLickHandlers()
    return () => {
        subscription.unsubscribe()
    }
}
