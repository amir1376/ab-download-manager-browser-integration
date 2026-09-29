import {isMac} from "~/utils/platform/Platform";

const MODIFIERS = ["Control", "Alt", "Shift", "Meta"] as const

export function isModifierKey(key: string) {
    return (MODIFIERS as readonly string[]).includes(key)
}

/**
 * a single character arrives in the case the keyboard produced it ("a" without shift, "A" with it)
 * a shortcut should not depend on that
 */
export function normalizeKey(key: string) {
    if (key === " ") {
        return "Space"
    }
    if (key.length === 1) {
        return key.toUpperCase()
    }
    return key
}

/**
 * modifiers first and always in the same order, so "Shift+Alt" and "Alt+Shift" are one shortcut
 */
export function normalizeShortcut(keys: string[]): string {
    const normalized = keys.map(normalizeKey)
    const modifiers = MODIFIERS.filter((modifier) => normalized.includes(modifier))
    const rest = normalized
        .filter((key) => !isModifierKey(key))
        .filter((key, index, all) => all.indexOf(key) === index)
        .sort()
    return [...modifiers, ...rest].join("+")
}

export function parseShortcut(shortcut: string): string[] {
    return shortcut.split("+").filter((key) => key.length > 0)
}

/**
 * the mac key labelled `delete` reports "Backspace", "Delete" is only produced by fn+delete.
 * users who picked "Delete" from the old two option list kept a shortcut they cannot press,
 * so on mac a configured "Delete" accepts "Backspace" as well
 */
function acceptedVariantsOf(shortcut: string): string[] {
    const keys = parseShortcut(shortcut)
    if (!isMac() || !keys.includes("Delete")) {
        return [shortcut]
    }
    const withBackspace = normalizeShortcut(
        keys.map((key) => key === "Delete" ? "Backspace" : key)
    )
    return [shortcut, withBackspace]
}

export function shortcutMatches(pressed: string, configured: string): boolean {
    if (pressed.length === 0 || configured.length === 0) {
        return false
    }
    return acceptedVariantsOf(normalizeShortcut(parseShortcut(configured)))
        .includes(normalizeShortcut(parseShortcut(pressed)))
}
