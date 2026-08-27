import {describe, expect, it, vi} from "vitest";
import {CompositeAppApi} from "~/backend/CompositeAppApi";
import type {IAppApi} from "~/backend/IAppApi";

function fakeApi(overrides: Partial<IAppApi> = {}): IAppApi {
    return {
        addDownload: vi.fn(async () => true),
        ping: vi.fn(async () => true),
        addressRefreshCapabilities: vi.fn(async () => ({
            protocolVersion: {major: 1, minor: 0},
            nativeMessaging: true,
            httpFallback: true,
            acceptedMethods: ["GET"],
            maxUrlBytes: 16_384,
            maxHeaderCount: 128,
            maxHeaderBytes: 65_536,
            maxCookieCount: 256,
            maxCookieBytes: 65_536,
            maxBodyBytes: 65_536,
            maxFrameBytes: 262_144,
            maxCandidatesPerSession: 50,
        })),
        addressRefreshSessions: vi.fn(async () => []),
        submitAddressRefreshCandidate: vi.fn(async () => ({status: "PENDING_CONFIRMATION" as const})),
        ...overrides,
    }
}

describe("refresh transport priority", () => {
    it("uses native messaging before HTTP", async () => {
        const native = fakeApi({addressRefreshSessions: vi.fn(async () => [])})
        const http = fakeApi()
        const api = new CompositeAppApi([native, http], native)

        await api.addressRefreshSessions()

        expect(native.addressRefreshSessions).toHaveBeenCalledOnce()
        expect(http.addressRefreshSessions).not.toHaveBeenCalled()
    })

    it("falls back to HTTP when native messaging is unavailable", async () => {
        const native = fakeApi({addressRefreshSessions: vi.fn(async () => { throw new Error("native unavailable") })})
        const http = fakeApi({addressRefreshSessions: vi.fn(async () => [])})
        const api = new CompositeAppApi([native, http], native)

        await expect(api.addressRefreshSessions()).resolves.toEqual([])
        expect(native.addressRefreshSessions).toHaveBeenCalledOnce()
        expect(http.addressRefreshSessions).toHaveBeenCalledOnce()
    })
})
