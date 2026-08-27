import {describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => ({
    submitted: [] as any[],
    execute: vi.fn(async () => [
        {frameId: 0, result: [
            {url: "https://example.invalid/a#one", sourceKind: "LINK", description: "A", suggestedName: "a"},
            {url: "javascript:alert(1)", sourceKind: "TEXT", description: null, suggestedName: null},
        ]},
        {frameId: 2, result: [
            {url: "https://example.invalid/a#two", sourceKind: "LINK", description: "duplicate", suggestedName: "a"},
            {url: "https://example.invalid/image.jpg", sourceKind: "IMAGE", description: "image", suggestedName: "image.jpg"},
        ]},
    ]),
}))

vi.mock("webextension-polyfill", () => ({default: {scripting: {executeScript: mocks.execute}}}))
vi.mock("~/utils/ExtensionInfo", () => ({
    isChrome: () => true,
    BrowserTarget: {chrome: "chrome", firefox: "firefox"},
    getExtensionBrowserTarget: () => "chrome",
}))
vi.mock("~/backend/Backend", () => ({
    submitBrowserBatchV2: vi.fn(async (batch: any) => {
        mocks.submitted.push(batch)
        return {
            operationId: batch.operationId, state: batch.chunkIndex === batch.chunkCount - 1 ? "READY_FOR_REVIEW" : "RECEIVING",
            receivedChunks: batch.chunkIndex + 1, chunkCount: batch.chunkCount,
            acceptedCandidates: batch.candidates.length, rejectedCandidates: 0, duplicateCandidates: 0,
        }
    }),
    cancelBrowserBatchV2: vi.fn(async () => null),
}))

import {collectAndSubmitBatchV2} from "~/contextmenus/BatchCollectorV2"

describe("bounded cross-frame batch collection", () => {
    it("rejects malformed candidates deduplicates fragments and waits for desktop review", async () => {
        mocks.submitted.length = 0
        const receipt = await collectAndSubmitBatchV2(7, "ALL", false)

        expect(receipt.state).toBe("READY_FOR_REVIEW")
        const candidates = mocks.submitted.flatMap(batch => batch.candidates)
        expect(candidates.map(candidate => candidate.url)).toEqual([
            "https://example.invalid/a",
            "https://example.invalid/image.jpg",
        ])
        expect(candidates.map(candidate => candidate.frameId)).toEqual([0, 2])
        expect(mocks.submitted.every(batch => JSON.stringify(batch).length < 256 * 1024)).toBe(true)
    })
})
