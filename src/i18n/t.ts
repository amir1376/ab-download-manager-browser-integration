import browser from "webextension-polyfill"

export function t(key: string, fallback: string, substitutions?: string | string[]): string {
    const translated = browser.i18n.getMessage(key, substitutions)
    return translated || fallback
}
