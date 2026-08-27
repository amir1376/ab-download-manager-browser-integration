import {describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => ({
    storage: new Map<string, unknown>(),
    createTab: vi.fn(async () => ({})),
    submit: vi.fn(async (collected: any) => ({state: "READY_FOR_REVIEW", acceptedCandidates: collected.candidates.length})),
}))
vi.mock("webextension-polyfill", () => ({default: {
    storage: {session: {
        set: vi.fn(async (items: Record<string, unknown>) => Object.entries(items).forEach(([key, value]) => mocks.storage.set(key, value))),
        get: vi.fn(async (key: string) => ({[key]: mocks.storage.get(key)})),
        remove: vi.fn(async (key: string) => mocks.storage.delete(key)),
    }},
    tabs: {create: mocks.createTab},
    runtime: {getURL: (path: string) => `chrome-extension://id/${path}`},
}}))
vi.mock("~/contextmenus/BatchCollectorV2", () => ({
    collectBrowserBatchV2: vi.fn(async () => ({scope: "SELECTED", privateContext: false, candidates: [
        {candidateId: "a", url: "https://example.invalid/a", sourceKind: "LINK", frameId: 0},
        {candidateId: "b", url: "https://example.invalid/b", sourceKind: "TEXT", frameId: 1},
    ]})),
    submitCollectedBatchV2: mocks.submit,
}))

import {stageBatchReviewV2, submitStagedBatchReviewV2} from "~/contextmenus/StagedBatchReviewV2"

describe("staged browser batch review", () => {
    it("opens a review without submission and transports only the user selection", async () => {
        mocks.storage.clear(); mocks.submit.mockClear(); mocks.createTab.mockClear()
        const reviewId = await stageBatchReviewV2(7, "SELECTED", false)
        expect(mocks.submit).not.toHaveBeenCalled()
        expect(mocks.createTab).toHaveBeenCalledOnce()

        const receipt = await submitStagedBatchReviewV2(reviewId, ["b"])
        expect(receipt.acceptedCandidates).toBe(1)
        expect(mocks.submit.mock.calls[0][0].candidates.map((value: any) => value.candidateId)).toEqual(["b"])
        expect(mocks.storage.size).toBe(0)
    })
})
