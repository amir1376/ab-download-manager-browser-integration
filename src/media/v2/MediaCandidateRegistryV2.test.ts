import {beforeEach, describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => ({
    runtimeListeners: [] as Array<(message: unknown, sender: any) => unknown>,
    published: [] as any[],
    storage: new Map<string, unknown>(),
}))
vi.mock("webextension-polyfill", () => ({default: {
    runtime: {onMessage: {addListener: (listener: any) => mocks.runtimeListeners.push(listener)}},
    tabs: {
        onRemoved: {addListener: vi.fn()}, onUpdated: {addListener: vi.fn()},
        sendMessage: vi.fn(async (_tabId: number, message: unknown) => { mocks.published.push(message) }),
    },
    alarms: {create: vi.fn(), onAlarm: {addListener: vi.fn()}},
    webRequest: {onHeadersReceived: {addListener: vi.fn()}},
    storage: {session: {
        get: vi.fn(async (key: string) => ({[key]: mocks.storage.get(key)})),
        set: vi.fn(async (items: Record<string, unknown>) => Object.entries(items).forEach(([key, value]) => mocks.storage.set(key, value))),
    }},
}}))
vi.mock("~/backend/Backend", () => ({
    getBrowserPolicyV2: () => ({mode: "FULL", advancedMediaInspection: true, mediaSiteAdapters: []}),
    isFeatureAvailableV2: () => true,
}))
vi.mock("~/utils/ExtensionInfo", () => ({isChrome: () => false}))

import {MediaCandidateRegistryV2} from "./MediaCandidateRegistryV2"

describe("media candidate registry v2", () => {
    beforeEach(() => {
        mocks.runtimeListeners.length = 0; mocks.published.length = 0; mocks.storage.clear()
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
})
