import {beforeEach, describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => ({
    policy: {
        schemaVersion: 2, revision: 1, mode: "FULL", automaticInterception: true,
        advancedMediaInspection: false, privateBrowsing: false, sendProtectedContext: false,
        registeredFileTypes: ["zip"], registeredMimeTypes: [], excludedUrls: [],
        forceShortcut: "Insert", bypassShortcut: "Delete",
    },
    origins: ["http://*/*", "https://*/*"],
    permissions: ["webRequest", "cookies", "tabs", "scripting"],
    registered: [] as Array<{id: string; matches: string[]}>,
    configure: vi.fn(),
    register: vi.fn(async (scripts: Array<{id: string; matches: string[]}>) => { mocks.registered = scripts }),
    unregister: vi.fn(async () => { mocks.registered = [] }),
}))

vi.mock("webextension-polyfill", () => ({default: {
    permissions: {
        getAll: vi.fn(async () => ({origins: mocks.origins, permissions: mocks.permissions})),
        request: vi.fn(async () => true), remove: vi.fn(async () => true),
        onAdded: {addListener: vi.fn()}, onRemoved: {addListener: vi.fn()},
    },
    scripting: {
        getRegisteredContentScripts: vi.fn(async () => mocks.registered),
        registerContentScripts: mocks.register,
        unregisterContentScripts: mocks.unregister,
        executeScript: vi.fn(async () => undefined),
    },
    extension: {isAllowedIncognitoAccess: vi.fn(async () => false)},
    tabs: {query: vi.fn(async () => []), sendMessage: vi.fn(async () => undefined)},
    storage: {local: {set: vi.fn(async () => undefined)}},
}}))
vi.mock("~/backend/Backend", () => ({
    getBrowserPolicyV2: () => mocks.policy,
    addBrowserPolicyListener: () => () => undefined,
}))
vi.mock("~/linkgrabber/LinkGrabber", () => ({configureAutomaticTakeoverV2: mocks.configure}))
vi.mock("~/utils/ExtensionInfo", () => ({isChrome: () => true}))

import {reconcileBrowserPermissionPolicyV2} from "~/permissions/BrowserPermissionPolicyV2"

describe("permission reconciliation", () => {
    beforeEach(() => {
        mocks.origins = ["http://*/*", "https://*/*"]
        mocks.permissions = ["webRequest", "cookies", "tabs", "scripting"]
        mocks.registered = []
        mocks.configure.mockClear()
        mocks.register.mockClear()
        mocks.unregister.mockClear()
        Object.assign(mocks.policy, {mode: "FULL", automaticInterception: true})
    })

    it("activates FULL only with complete authority and immediately stops after revocation", async () => {
        const full = await reconcileBrowserPermissionPolicyV2()
        expect(full.fullAuthority).toBe(true)
        expect(full.automaticCaptureActive).toBe(true)
        expect(mocks.configure).toHaveBeenLastCalledWith(true)
        expect(mocks.registered[0].matches).toEqual(["http://*/*", "https://*/*"])

        mocks.permissions = ["webRequest", "tabs", "scripting"]
        const revoked = await reconcileBrowserPermissionPolicyV2()
        expect(revoked.fullAuthority).toBe(false)
        expect(revoked.missingPermissions).toContain("cookies")
        expect(mocks.configure).toHaveBeenLastCalledWith(false)
    })
})
