import {beforeEach, describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => ({
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    erase: vi.fn(async () => []),
    removeFile: vi.fn(async () => undefined),
    storage: new Map<string, unknown>(),
    bypassed: false,
    pressedKey: null as string | null,
    privateAllowed: false,
    policy: {
        schemaVersion: 2, revision: 1, mode: "FULL", automaticInterception: true,
        advancedMediaInspection: false, privateBrowsing: false, sendProtectedContext: true,
        registeredFileTypes: ["bin"], registeredMimeTypes: [] as string[], excludedUrls: [] as string[],
        forceShortcut: "Insert", bypassShortcut: "Delete",
    },
}))

vi.mock("webextension-polyfill", () => ({
    default: {
        downloads: {
            pause: mocks.pause, resume: mocks.resume, cancel: mocks.cancel,
            erase: mocks.erase, removeFile: mocks.removeFile,
        },
        storage: {
            local: {
                get: vi.fn(async () => Object.fromEntries(mocks.storage)),
                set: vi.fn(async (items: Record<string, unknown>) => Object.entries(items).forEach(([key, value]) => mocks.storage.set(key, value))),
                remove: vi.fn(async (key: string) => mocks.storage.delete(key)),
            },
        },
    },
}))
vi.mock("~/configs/Config", () => ({
    getLatestConfig: () => ({
        autoCaptureLinks: true, blacklistedUrls: [], captureFileSizeMinimumKb: 0,
        registeredFileTypes: ["bin"],
    }),
}))
vi.mock("~/background/BackgroundSharedState", () => ({
    isTabBypassed: () => mocks.bypassed,
    isShortcutPressed: (_tabId: number, shortcut: string) => mocks.pressedKey === shortcut,
}))
vi.mock("~/backend/Backend", () => ({
    getBrowserPolicyV2: () => mocks.policy,
    registerNativeBrowserRequestHandler: () => () => undefined,
    prepareCaptureV2: vi.fn(),
    markBrowserReleasedV2: vi.fn(),
    abortCaptureV2: vi.fn(),
    listPreparedCapturesV2: vi.fn(),
}))
vi.mock("~/permissions/PermissionRuntimeStateV2", () => ({
    getPermissionRuntimeStateV2: () => ({fullAuthority: true, privateAllowed: mocks.privateAllowed, grantedOrigins: ["https://*/*"]}),
}))
vi.mock("~/utils/ExtensionInfo", () => ({
    BrowserTarget: {chrome: "chrome", firefox: "firefox"},
    getExtensionBrowserTarget: () => "chrome",
    isChrome: () => true,
}))

import {CaptureCoordinatorV2} from "~/linkgrabber/v2/CaptureCoordinatorV2"

describe("CaptureCoordinatorV2", () => {
    beforeEach(() => {
        for (const mock of [mocks.pause, mocks.resume, mocks.cancel, mocks.erase, mocks.removeFile]) mock.mockClear()
        mocks.pause.mockResolvedValue(undefined)
        mocks.resume.mockResolvedValue(undefined)
        mocks.cancel.mockResolvedValue(undefined)
        mocks.storage.clear()
        mocks.bypassed = false
        mocks.pressedKey = null
        mocks.privateAllowed = false
        Object.assign(mocks.policy, {
            mode: "FULL", automaticInterception: true, privateBrowsing: false,
            registeredFileTypes: ["bin"], registeredMimeTypes: [], excludedUrls: [],
        })
    })

    it("cancels browser ownership only after durable preparation and commits a review", async () => {
        const calls: string[] = []
        const record = {requestId: "r1", createdAtEpochMs: 1_000, tabId: 1}
        const registry: any = {
            matchDownload: () => ({kind: "MATCHED", record}),
            canCapture: () => true,
            createContext: async () => context(),
            forget: vi.fn(),
        }
        const bridge: any = {
            prepare: vi.fn(async () => { calls.push("prepare"); return {captureId: "c1", contextRef: "x1", state: "PREPARED", expiresAtEpochMs: Date.now() + 60_000} }),
            released: vi.fn(async () => { calls.push("released"); return {captureId: "c1", contextRef: "x1", state: "COMMITTED_REVIEW", expiresAtEpochMs: Date.now() + 60_000} }),
            abort: vi.fn(), list: vi.fn(async () => []),
        }
        mocks.pause.mockImplementation(async () => { calls.push("pause") })
        mocks.cancel.mockImplementation(async () => { calls.push("cancel") })

        await new CaptureCoordinatorV2(registry, bridge).capture(download())

        expect(calls).toEqual(["pause", "prepare", "cancel", "released"])
        expect(mocks.resume).not.toHaveBeenCalled()
        expect(bridge.abort).not.toHaveBeenCalled()
        expect(registry.forget).toHaveBeenCalledWith("r1")
    })

    it("resumes the browser when durable preparation fails", async () => {
        const registry: any = {
            matchDownload: () => ({kind: "MATCHED", record: {requestId: "r1", createdAtEpochMs: 1_000, tabId: 1}}),
            canCapture: () => true,
            createContext: async () => context(), forget: vi.fn(),
        }
        const bridge: any = {
            prepare: vi.fn(async () => { throw new Error("offline") }),
            released: vi.fn(), abort: vi.fn(async () => null), list: vi.fn(async () => []),
        }

        await new CaptureCoordinatorV2(registry, bridge).capture(download())

        expect(mocks.resume).toHaveBeenCalledWith(4)
        expect(mocks.cancel).not.toHaveBeenCalled()
    })

    it("does nothing when request correlation is ambiguous", async () => {
        const registry: any = {matchDownload: () => ({kind: "AMBIGUOUS"})}
        const bridge: any = {}
        await new CaptureCoordinatorV2(registry, bridge).capture(download())
        expect(mocks.pause).not.toHaveBeenCalled()
    })

    it("fails open for tab bypass and private downloads without both consents", async () => {
        const registry: any = {
            matchDownload: () => ({kind: "MATCHED", record: {requestId: "r1", createdAtEpochMs: 1_000, tabId: 1}}),
            canCapture: () => true,
        }
        mocks.bypassed = true
        await new CaptureCoordinatorV2(registry, {} as any).capture(download())
        expect(mocks.pause).not.toHaveBeenCalled()

        mocks.bypassed = false
        await new CaptureCoordinatorV2(registry, {} as any).capture({...download(), incognito: true})
        expect(mocks.pause).not.toHaveBeenCalled()
    })

    it("uses immediate force and bypass keys with force overriding file and exclusion rules", async () => {
        const registry: any = {
            matchDownload: () => ({kind: "MATCHED", record: {requestId: "r1", createdAtEpochMs: 1_000, tabId: 1}}),
            canCapture: () => true,
            createContext: async () => context(), forget: vi.fn(),
        }
        const bridge: any = {
            prepare: async (proposal: any) => ({captureId: proposal.captureId, contextRef: "x", state: "PREPARED", expiresAtEpochMs: Date.now() + 1000}),
            released: async (captureId: string) => ({captureId, contextRef: "x", state: "COMMITTED_REVIEW", expiresAtEpochMs: Date.now() + 1000}),
            abort: vi.fn(), list: async () => [],
        }
        mocks.policy.automaticInterception = false
        mocks.policy.registeredFileTypes = []
        mocks.policy.excludedUrls = ["*://example.invalid/*"]
        mocks.pressedKey = "Insert"
        await new CaptureCoordinatorV2(registry, bridge).capture(download())
        expect(mocks.pause).toHaveBeenCalledWith(4)

        mocks.pause.mockClear()
        mocks.pressedKey = "Delete"
        await new CaptureCoordinatorV2(registry, bridge).capture(download())
        expect(mocks.pause).not.toHaveBeenCalled()
    })
})

function download(): any {
    return {
        id: 4, url: "https://example.invalid/file.bin", filename: "file.bin", startTime: new Date(1_001).toISOString(),
        fileSize: 10, referrer: "https://example.invalid/page", incognito: false,
    }
}

function context(): any {
    return {
        originalUrl: "https://example.invalid/file.bin", finalUrl: "https://example.invalid/file.bin", method: "GET",
        requestHeaders: [], responseHeaders: [], cookies: [], redirects: [], tabId: 1, frameId: 0,
        privateContext: false, withheldFields: [], incompleteFields: [],
    }
}
