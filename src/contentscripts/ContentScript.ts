import {getLinksFromSelection} from "~/utils/LinkExtractor";
import * as selectionPopup from "~/popup/selection/SelectionPopup";
import * as MediaPopup from "~/popup/media/MediaSelectionPopup";
import {debounce} from "~/utils/Debaunce";
import * as mousePosition from "~/utils/MouseUtil"
import * as HoldingKeyTracker from "~/utils/HoldingKeyTracker"
import * as Configs from "~/configs/Config"
import {run} from "~/utils/ScopeFunctions";
import {onMessage} from "webext-bridge/content-script"
import browser from "webextension-polyfill";
import {createAlertStringForMyExtension} from "~/utils/AlertMessageCreator";
import {addDownloads} from "~/contentscripts/AddDownloads";
import {sendMessage} from "webext-bridge/options";
import {DefinedCommands} from "~/message/Commands";

const showPopupDelayed = debounce(500)

async function checkAndReportLinks() {
    const selection = window.getSelection();
    if (selection == null) {
        alert(createAlertStringForMyExtension(browser.i18n.getMessage("popup_alert_nothing_selected")))
        return
    }
    let downloadItems = getLinksFromSelection(selection)
    if (downloadItems.length == 0) {
        alert(createAlertStringForMyExtension(browser.i18n.getMessage("popup_alert_no_link_detected")))
        return
    }
    await addDownloads(downloadItems)
}

let lastSelectionConsumed = true

function shouldCreatePopup() {
    return lastSelectionConsumed && Configs.getLatestConfig().popupEnabled
}

run(async () => {
    await Configs.boot()
    mousePosition.boot()
    HoldingKeyTracker.boot()
    selectionPopup.setOnPopupClicked(async () => {
        checkAndReportLinks()
    })
    MediaPopup.setItemClickListener((media) => {
        const addDownloadType = media.type
        addDownloads([
            {
                link: media.uri,
                suggestedName: media.suggestedFullName ?? "",
                type: addDownloadType,
                downloadPage: location.href,
                headers: media.requestHeaders ?? null,
                description: null
            }
        ])
        MediaPopup.toggleList(false)
    })

    document.addEventListener("selectionchange", () => {
        lastSelectionConsumed = true
        const selection = window.getSelection();
        if (!selection || selection.type !== "Range") {
            selectionPopup.closeAddDownloadPopupUi();
        }
    })

    document.addEventListener("mousedown", () => {
        showPopupDelayed.cancel()
    })

    document.addEventListener("mouseup", () => {
        showPopupDelayed(() => {
            const mousePositionInPage = mousePosition.getMousePositionInPage();
            if (!shouldCreatePopup() || mousePositionInPage === null) {
                return;
            }
            const selection = window.getSelection();
            if (selection == null) {
                return;
            }
            if (selection.type !== "Range") {
                return;
            }
            const linksFromSelection = getLinksFromSelection(selection);
            if (linksFromSelection.length == 0) {
                return
            }
            lastSelectionConsumed = false
            selectionPopup.showAddDownloadPopupUi(mousePositionInPage)
        })
        run(async () => {
            try {
                await sendMessage(
                    DefinedCommands.SET_HOLDING_KEY,
                    HoldingKeyTracker.getHoldingKey(),
                    "background"
                )
            } catch (e) {
                // ignored
            } finally {
                HoldingKeyTracker.clear()
            }
        })
    })

    onMessage(DefinedCommands.SHOW_LOG, (msg) => {
        console.log(...msg.data)
    })
    onMessage(DefinedCommands.SHOW_ALERT, (msg) => {
        alert(createAlertStringForMyExtension(msg.data))
    })
    onMessage(DefinedCommands.CHECK_SELECTED_TEXT_FOR_LINKS, (msg) => {
        checkAndReportLinks()
    })
    onMessage(DefinedCommands.DOWNLOADABLE_MEDIA_DETECTED, (msg) => {
        MediaPopup.updatePopup(msg.data)
    })
}).catch(e => {
    console.log("failed to load ab-dm-extension", e)
})



