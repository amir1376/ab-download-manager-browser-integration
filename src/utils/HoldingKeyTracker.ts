import {Nullable} from "~/utils/Types";
import {isModifierKey, normalizeKey, normalizeShortcut} from "~/utils/Shortcut";

type ModifierState = Pick<MouseEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">

const heldKeys = new Set<string>()

export function clear() {
    heldKeys.clear()
}

/**
 * modifiers are read from the event being handled rather than from the keydown/keyup pair,
 * the os does not reliably deliver a keyup for them (on mac holding command swallows it)
 */
export function getHoldingShortcut(modifierState: Nullable<ModifierState> = null) {
    const keys: string[] = []
    if (modifierState) {
        if (modifierState.ctrlKey) keys.push("Control")
        if (modifierState.altKey) keys.push("Alt")
        if (modifierState.shiftKey) keys.push("Shift")
        if (modifierState.metaKey) keys.push("Meta")
    }
    heldKeys.forEach((key) => keys.push(key))
    return normalizeShortcut(keys)
}

export function boot() {
    document.addEventListener("keydown", (e) => {
        if (isModifierKey(e.key)) {
            return
        }
        heldKeys.add(normalizeKey(e.key))
    })

    document.addEventListener("keyup", (e) => {
        heldKeys.delete(normalizeKey(e.key))
    })

    window.addEventListener('blur', function () {
        clear()
    })
}
