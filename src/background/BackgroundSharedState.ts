import {getLatestConfig} from "~/configs/Config";
import {shortcutMatches} from "~/utils/Shortcut";


let holdingShortcut = ""

export function setHoldingKey(shortcut: string) {
    holdingShortcut = shortcut
}

export function isBypassShortcutPressed() {
    // When auto-capture of download links is enabled, holding down the shortcut
    // and clicking on the download link uses the internal browser download method.
    return shortcutMatches(holdingShortcut, getLatestConfig().bypassShortcut)
}
