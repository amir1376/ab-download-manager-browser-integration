import {describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => ({
    prepare: vi.fn(async (proposal: any) => ({captureId: proposal.captureId, contextRef: "ctx", state: "PREPARED", expiresAtEpochMs: Date.now() + 1000})),
    released: vi.fn(async (captureId: string) => ({captureId, contextRef: "ctx", state: "COMMITTED_REVIEW", expiresAtEpochMs: Date.now() + 1000})),
    search: vi.fn(async () => [{
        id: 12, url: "https://example.invalid/file.bin", finalUrl: "https://cdn.invalid/file.bin",
        filename: "C:/Downloads/file.bin", fileSize: 10, startTime: new Date(1000).toISOString(),
        referrer: "https://example.invalid/page", incognito: false,
    }]),
}))

vi.mock("webextension-polyfill", () => ({default: {downloads: {search: mocks.search}}}))
vi.mock("~/backend/Backend", () => ({
    getBrowserPolicyV2: () => ({mode: "STANDARD", sendProtectedContext: false}),
    prepareCaptureV2: mocks.prepare,
    markBrowserReleasedV2: mocks.released,
}))
vi.mock("~/permissions/PermissionRuntimeStateV2", () => ({
    getPermissionRuntimeStateV2: () => ({privateAllowed: false}),
}))
vi.mock("./FtpCaptureV2", () => ({classifyFtpUrl: () => null, captureExplicitFtpV2: vi.fn()}))

import {recaptureBrowserDownloadV2} from "./HistoricalDownloadCaptureV2"

describe("historical browser download recapture", () => {
    it("creates a review without claiming or deleting the browser-owned item", async () => {
        expect(await recaptureBrowserDownloadV2(12)).toBe(true)
        const proposal = mocks.prepare.mock.calls[0][0]
        expect(proposal.requestContext.finalUrl).toBe("https://cdn.invalid/file.bin")
        expect(proposal.requestContext.referrer).toBeNull()
        expect(proposal.requestContext.incompleteFields).toContain("historicalRequestContext")
        expect(mocks.released).toHaveBeenCalledWith(proposal.captureId)
    })
})
