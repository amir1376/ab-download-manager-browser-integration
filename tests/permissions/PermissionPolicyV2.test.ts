// Test-only permission fixtures are kept outside the production source tree.
import {beforeEach, describe, expect, it, vi} from "vitest"
import crypto from "node:crypto"

const mocks = vi.hoisted(() => ({
    storage: new Map<string, unknown>(),
    removedListeners: [] as Array<(tabId: number) => void>,
}))

vi.mock("webextension-polyfill", () => ({default: {
    storage: {session: {
        get: vi.fn(async (key: string) => key ? {[key]: mocks.storage.get(key)} : Object.fromEntries(mocks.storage)),
        set: vi.fn(async (items: Record<string, unknown>) => Object.entries(items).forEach(([key, value]) => mocks.storage.set(key, value))),
        remove: vi.fn(async (key: string) => mocks.storage.delete(key)),
    }, local: {}},
    tabs: {onRemoved: {addListener: (listener: (tabId: number) => void) => mocks.removedListeners.push(listener)}},
}}))

import {CHROME_WEB_STORE_PUBLIC_KEY, getManifestForChrome} from "~/manifest/manifest.chrome"
import {getManifestForFirefox} from "~/manifest/manifest.firefox"

describe("privacy-first permission policy", () => {
    beforeEach(() => {
        mocks.storage.clear()
        mocks.removedListeners.length = 0
        vi.restoreAllMocks()
        vi.resetModules()
    })

    it("keeps all-host cookies webRequest tabs and notifications out of required install authority", () => {
        const chrome = getManifestForChrome() as any
        const firefox = getManifestForFirefox() as any
        for (const manifest of [chrome, firefox]) {
            expect(manifest.content_scripts).toBeUndefined()
            expect(manifest.permissions).not.toContain("cookies")
            expect(manifest.permissions).not.toContain("webRequest")
            expect(manifest.permissions).not.toContain("tabs")
            expect(manifest.permissions).not.toContain("notifications")
        }
        expect(chrome.host_permissions).toBeUndefined()
        expect(chrome.optional_host_permissions).toEqual(["http://*/*", "https://*/*"])
        expect(firefox.permissions).not.toContain("http://*/*")
        expect(firefox.optional_permissions).toContain("https://*/*")
        expect(firefox.browser_specific_settings.gecko.strict_min_version).toBe("140.0")
        expect(firefox.browser_specific_settings.gecko.data_collection_permissions).toEqual({
            required: ["none"],
            optional: ["browsingActivity", "websiteContent", "authenticationInfo"],
        })
    })

    it("keeps unpacked Chromium validation on the native-host-authorized store identity", () => {
        const digest = crypto.createHash("sha256").update(Buffer.from(CHROME_WEB_STORE_PUBLIC_KEY, "base64")).digest().subarray(0, 16)
        const extensionId = [...digest].flatMap(value => [value >> 4, value & 0x0f])
            .map(value => String.fromCharCode("a".charCodeAt(0) + value)).join("")

        expect(extensionId).toBe("bbobopahenonfdgjgaleledndnnfhooj")
        expect((getManifestForChrome() as any).key).toBe(CHROME_WEB_STORE_PUBLIC_KEY)
    })

    it("restores modifier and per-tab bypass state after an MV3 worker restart", async () => {
        vi.spyOn(Date, "now").mockReturnValue(1_000)
        let state = await import("~/background/BackgroundSharedState")
        await state.boot()
        await state.setHoldingKey(7, "Delete", true)
        await state.setTabBypass(7, true)
        expect(state.isShortcutPressed(7, "Delete")).toBe(true)
        expect(state.isTabBypassed(7)).toBe(true)

        vi.resetModules()
        state = await import("~/background/BackgroundSharedState")
        await state.boot()
        expect(state.isShortcutPressed(7, "Delete")).toBe(true)
        expect(state.isTabBypassed(7)).toBe(true)

        mocks.removedListeners.at(-1)?.(7)
        expect(state.isTabBypassed(7)).toBe(false)
    })
})
