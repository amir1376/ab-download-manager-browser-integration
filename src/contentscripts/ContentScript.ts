import {getLinksFromSelection} from "~/utils/LinkExtractor";
import * as selectionPopup from "~/popup/selection/SelectionPopup";
import * as MediaPopup from "~/popup/media/MediaSelectionPopup";
import {debounce} from "~/utils/Debaunce";
import * as mousePosition from "~/utils/MouseUtil"
import * as Configs from "~/configs/Config"
import {run} from "~/utils/ScopeFunctions";
import {onMessage} from "webext-bridge/content-script"
import browser from "webextension-polyfill";
import {createAlertStringForMyExtension} from "~/utils/AlertMessageCreator";
import {addDownloads} from "~/contentscripts/AddDownloads";

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
    })
    onMessage("show_log", (msg) => {
        console.log(...msg.data)
    })
    onMessage("show_alert", (msg) => {
        alert(createAlertStringForMyExtension(msg.data))
    })
    onMessage("check_selected_text_for_links", (msg) => {
        checkAndReportLinks()
    })
    onMessage("downloadable_media_detected", (msg) => {
        MediaPopup.updatePopup(msg.data)
    })
}).catch(e => {
    console.log("failed to load ab-dm-extension", e)
})



