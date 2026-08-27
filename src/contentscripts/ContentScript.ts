import {getLinksFromSelection} from "~/utils/LinkExtractor";
import * as selectionPopup from "~/popup/selection/SelectionPopup";
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
import {MediaDiscoveryV2} from "~/media/v2/MediaDiscoveryV2";
import {MediaPanelV2} from "~/media/v2/MediaPanelV2";
import type {MediaPanelCandidateV2} from "~/media/v2/MediaCandidateRegistryV2";

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
            let mediaDiscovery = new MediaDiscoveryV2()
            const mediaPanel = new MediaPanelV2()
            void mediaDiscovery.boot()
            disposable.add(() => mediaDiscovery.close())
            disposable.add(() => mediaPanel.close())
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
                scope.__abdmContentScriptV2 = false
            })

            const disableListener = (message: unknown) => {
                const value = message as {action?: unknown; message?: unknown}
                if (value.action === "disableBrowserIntegrationV2") disposable.dispose()
                if (value.action === "browserBatchFeedbackV2" && typeof value.message === "string") {
                    alert(createAlertStringForMyExtension(value.message))
                }
                if (value.action === "mediaCandidatesV2") {
                    const candidates = (message as {candidates?: unknown}).candidates
                    if (Array.isArray(candidates)) mediaPanel.update(candidates.slice(0, 512) as MediaPanelCandidateV2[])
                }
                if (value.action === "browserPolicyAppliedV2") {
                    if ((message as {advancedMediaInspection?: unknown}).advancedMediaInspection === true) void mediaDiscovery.boot()
                    else { mediaDiscovery.close(); mediaDiscovery = new MediaDiscoveryV2(); mediaPanel.update([]) }
                }
            }
            browser.runtime.onMessage.addListener(disableListener)
            disposable.add(() => browser.runtime.onMessage.removeListener(disableListener))

            disposable.add(onMessage(DefinedCommands.SHOW_LOG, (msg) => {
                console.log(`BACKGROUND_EVENT_${msg.data.length}`)
            }))
            disposable.add(onMessage(DefinedCommands.SHOW_ALERT, (msg) => {
                alert(createAlertStringForMyExtension(msg.data))
            }))
            disposable.add(onMessage(DefinedCommands.CHECK_SELECTED_TEXT_FOR_LINKS, () => {
                checkAndReportLinks()
            }))
        } catch (error) {
            console.warn("CONTENT_SCRIPT_BOOT_FAILED")
            throw error
        }
    })



