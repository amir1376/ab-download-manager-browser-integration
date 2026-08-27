import {getLinksFromSelection} from "~/utils/LinkExtractor";
import * as selectionPopup from "~/popup/selection/SelectionPopup";
import * as MediaPopup from "~/popup/media/MediaSelectionPopup";
import {debounce} from "~/utils/Debaunce";
import * as mousePosition from "~/utils/MouseUtil"
import * as HoldingKeyTracker from "~/utils/HoldingKeyTracker"
import * as Configs from "~/configs/Config"
import {onMessage} from "webext-bridge/content-script"
import browser from "webextension-polyfill";
import {createAlertStringForMyExtension} from "~/utils/AlertMessageCreator";
import {addDownloads} from "~/contentscripts/AddDownloads";
import {sendMessage} from "webext-bridge/options";
import {DefinedCommands} from "~/message/Commands";
import {defineExtensionEntry} from "~/utils/DefineExtensionEntry";
import ContentScriptEntryType from "~/utils/EntryPointTypes/ContentScript/ContentScriptEntryType";

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

export default defineExtensionEntry()
    .withType(ContentScriptEntryType)
    .withInit(async (context) => {
        const scope = globalThis as typeof globalThis & {__abdmContentScriptV2?: boolean}
        if (scope.__abdmContentScriptV2) return
        scope.__abdmContentScriptV2 = true
        const disposable = context.getDisposable()
        try {
            mousePosition.boot()
            disposable.add(mousePosition.dispose)
            disposable.add(HoldingKeyTracker.boot((key, pressed) => {
                void sendMessage(
                    DefinedCommands.SET_HOLDING_KEY,
                    {key, pressed},
                    "background",
                ).catch(() => undefined)
            }))
            selectionPopup.setOnPopupClicked(async () => {
                checkAndReportLinks()
            })
            disposable.add(() => selectionPopup.setOnPopupClicked(async () => undefined))
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

            const selectionChanged = () => {
                lastSelectionConsumed = true
                const selection = window.getSelection();
                if (!selection || selection.type !== "Range") {
                    selectionPopup.closeAddDownloadPopupUi();
                }
            }
            document.addEventListener("selectionchange", selectionChanged)
            disposable.add(() => document.removeEventListener("selectionchange", selectionChanged))

            const mouseDown = () => {
                showPopupDelayed.cancel()
            }
            document.addEventListener("mousedown", mouseDown)
            disposable.add(() => document.removeEventListener("mousedown", mouseDown))

            const mouseUp = () => {
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
            }
            document.addEventListener("mouseup", mouseUp)
            disposable.add(() => document.removeEventListener("mouseup", mouseUp))
            disposable.add(() => showPopupDelayed.cancel())
            disposable.add(() => {
                selectionPopup.closeAddDownloadPopupUi()
                MediaPopup.toggleList(false)
                scope.__abdmContentScriptV2 = false
            })
            disposable.add(() => MediaPopup.setItemClickListener(() => undefined))

            const disableListener = (message: unknown) => {
                if ((message as {action?: unknown})?.action !== "disableBrowserIntegrationV2") return
                disposable.dispose()
            }
            browser.runtime.onMessage.addListener(disableListener)
            disposable.add(() => browser.runtime.onMessage.removeListener(disableListener))

            disposable.add(onMessage(DefinedCommands.SHOW_LOG, (msg) => {
                console.log(...msg.data)
            }))
            disposable.add(onMessage(DefinedCommands.SHOW_ALERT, (msg) => {
                alert(createAlertStringForMyExtension(msg.data))
            }))
            disposable.add(onMessage(DefinedCommands.CHECK_SELECTED_TEXT_FOR_LINKS, () => {
                checkAndReportLinks()
            }))
            disposable.add(onMessage(DefinedCommands.DOWNLOADABLE_MEDIA_DETECTED, (msg) => {
                MediaPopup.updatePopup(msg.data)
            }))
        } catch (e) {
            console.log("failed to load ab-dm-extension", e)
            throw e
        }
    })



