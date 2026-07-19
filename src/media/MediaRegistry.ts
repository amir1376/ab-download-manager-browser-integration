import browser from "webextension-polyfill";
import {InterceptedMediaResult} from "~/linkgrabber/LinkGrabberResponse";
import {OnMediaInterceptedFromRequestListener} from "~/media/OnMediaInterceptedFromRequestListener";
import {DownloadableMedia, MediaOnTab} from "~/media/MediaOnTab";
import {sendMessage} from "webext-bridge/background";
import * as HLSUtils from "~/media/HLSUtils"
import {DefinedCommands} from "~/message/Commands";

export class MediaRegistry implements OnMediaInterceptedFromRequestListener {
    private readonly tabsMap: Record<number, MediaOnTab | undefined> = {}

    constructor() {
        HLSUtils.parseHLSSilently()
    }

    private getOrCreateMediaInPage(
        tabId: number
    ): MediaOnTab {
        let result = this.tabsMap[tabId]

        if (!result) {
            result = new MediaOnTab(tabId, {
                onListUpdated(list: DownloadableMedia[]) {
                    onDownloadableMediaProcessed(tabId, list)
                }
            })
            this.tabsMap[tabId] = result
        }
        return result
    }

    boot() {
        browser.tabs.onRemoved.addListener(
            (tabId, _) => {
                const page = this.tabsMap[tabId]
                if (!page) {
                    return
                }
                page.close()
                delete this.tabsMap[tabId]
            }
        )
        browser.tabs.onUpdated.addListener(
            (tabId, changeInfo, _) => {
                const mediaOnTab = this.tabsMap[tabId]
                if (!mediaOnTab) {
                    return
                }
                if (changeInfo.status === "loading" || changeInfo.url) {
                    mediaOnTab.reset()
                }
            }
        )
    }


    async onMediaDetected(tabId: number, mediaResult: InterceptedMediaResult) {
        if (tabId < 0) {
            return
        }
        await (
            this
                .getOrCreateMediaInPage(tabId)
                .process(mediaResult)
        )
    }
}

async function onDownloadableMediaProcessed(
    tabId: number,
    downloadableMedia: DownloadableMedia[],
) {
    await sendMessage(
        DefinedCommands.DOWNLOADABLE_MEDIA_DETECTED,
        downloadableMedia,
        {
            tabId: tabId,
            context: "content-script"
        }
    )
}
