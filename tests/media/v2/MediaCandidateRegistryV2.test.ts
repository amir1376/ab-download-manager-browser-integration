import {beforeEach, describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => ({
    runtimeListeners: [] as Array<(message: unknown, sender: any) => unknown>,
    published: [] as any[],
    storage: new Map<string, unknown>(),
    createdTabs: [] as any[],
    submittedBatches: [] as any[],
}))
vi.mock("webextension-polyfill", () => ({default: {
    tabs: {
        onRemoved: {addListener: vi.fn()}, onUpdated: {addListener: vi.fn()},
        sendMessage: vi.fn(async (_tabId: number, message: unknown) => { mocks.published.push(message) }),
        create: vi.fn(async (details: unknown) => { mocks.createdTabs.push(details); return {} }),
        get: vi.fn(async () => ({incognito: false, url: "https://example.invalid/watch"})),
    },
    runtime: {
        onMessage: {addListener: (listener: any) => mocks.runtimeListeners.push(listener)},
        getURL: (path: string) => `chrome-extension://id/${path}`,
    },
    alarms: {create: vi.fn(), onAlarm: {addListener: vi.fn()}},
    webRequest: {onHeadersReceived: {addListener: vi.fn()}},
    storage: {session: {
        get: vi.fn(async (key: string) => ({[key]: mocks.storage.get(key)})),
        set: vi.fn(async (items: Record<string, unknown>) => Object.entries(items).forEach(([key, value]) => mocks.storage.set(key, value))),
        remove: vi.fn(async (key: string) => mocks.storage.delete(key)),
    }},
}}))
vi.mock("~/backend/Backend", () => ({
    getBrowserPolicyV2: () => ({mode: "FULL", advancedMediaInspection: true, mediaSiteAdapters: []}),
    isFeatureAvailableV2: () => true,
    addBrowserPolicyListener: () => () => undefined,
    submitBrowserBatchV2: vi.fn(async (batch: any) => {
        mocks.submittedBatches.push(batch)
        return {operationId: batch.operationId, state: "READY_FOR_REVIEW", receivedChunks: 1, chunkCount: 1, acceptedCandidates: 1, rejectedCandidates: 0, duplicateCandidates: 0}
    }),
    cancelBrowserBatchV2: vi.fn(async () => null),
}))
vi.mock("~/utils/ExtensionInfo", () => ({
    isChrome: () => false,
    BrowserTarget: {chrome: "chrome", firefox: "firefox"},
    getExtensionBrowserTarget: () => "firefox",
}))

import {MediaCandidateRegistryV2} from "~/media/v2/MediaCandidateRegistryV2"

describe("media candidate registry v2", () => {
    beforeEach(() => {
        mocks.runtimeListeners.length = 0; mocks.published.length = 0; mocks.storage.clear()
        mocks.createdTabs.length = 0; mocks.submittedBatches.length = 0
    })

    it("validates the untrusted boundary and preserves distinct frame and element identities", async () => {
        const registry = new MediaCandidateRegistryV2()
        await registry.boot()
        const listener = mocks.runtimeListeners[0]
        listener({action: "mediaDiscoveryEventV2", event: {
            generation: 1, source: "DOM", url: "javascript:alert(1)", transport: "PROGRESSIVE",
        }}, {tab: {id: 7}, frameId: 0})
        listener({action: "mediaDiscoveryEventV2", event: {
            generation: 1, source: "DOM", url: "https://media.invalid/video.mp4", transport: "PROGRESSIVE", elementKey: "video-a",
        }}, {tab: {id: 7}, frameId: 0})
        listener({action: "mediaDiscoveryEventV2", event: {
            generation: 1, source: "DOM", url: "https://media.invalid/video.mp4", transport: "PROGRESSIVE", elementKey: "video-b",
        }}, {tab: {id: 7}, frameId: 2})
        await new Promise(resolve => setTimeout(resolve, 0))

        const candidates = mocks.published.at(-1).candidates
        expect(candidates).toHaveLength(2)
        expect(candidates.map((candidate: any) => candidate.frameId).sort()).toEqual([0, 2])
        expect(candidates[0].candidateId).not.toBe(candidates[1].candidateId)
        expect(JSON.stringify(candidates)).not.toContain("javascript:")
    })

    it("stages choices with no implicit quality and submits only an explicit variant", async () => {
        const registry = new MediaCandidateRegistryV2(); await registry.boot()
        const listener = mocks.runtimeListeners[0]
        listener({action: "mediaDiscoveryEventV2", event: {
            generation: 2, source: "FETCH", url: "https://media.invalid/master.m3u8", transport: "HLS",
            elementKey: "player", variantId: "720p", tracks: [{trackId: "en", role: "AUDIO", language: "en"}],
        }}, {tab: {id: 9}, frameId: 0})
        await new Promise(resolve => setTimeout(resolve, 0))
        const candidate = mocks.published.at(-1).candidates[0]
        listener({action: "openMediaSelectionV2", candidateId: candidate.candidateId}, {tab: {id: 9}, frameId: 0})
        await new Promise(resolve => setTimeout(resolve, 0))
        const stage = [...mocks.storage.values()].find((value: any) => value?.selectionId) as any
        expect(stage.candidates).toHaveLength(1)
        expect(stage).not.toHaveProperty("selectedCandidateId")

        await listener({
            action: "submitMediaSelectionV2", selectionId: stage.selectionId,
            candidateId: candidate.candidateId, trackIds: ["AUDIO|en"], outputContainer: "mkv", liveDurationSeconds: null,
        }, {})
        const submitted = mocks.submittedBatches[0].candidates[0]
        expect(submitted.mediaTransport).toBe("HLS")
        expect(submitted.variantId).toBe("720p")
        expect(submitted.trackIds).toEqual(["AUDIO|en"])
        expect(submitted.outputContainer).toBe("mkv")
    })
})
