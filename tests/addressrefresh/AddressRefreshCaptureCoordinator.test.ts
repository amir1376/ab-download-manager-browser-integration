import {beforeAll, describe, expect, it, vi} from "vitest";
import type {AddressRefreshSession} from "~/interfaces/AddressRefresh";
import type {ObservedRequest} from "~/addressrefresh/AddressRefreshCaptureCoordinator";
import fixture from "~/addressrefresh/fixtures/address-refresh-v1-candidate.json";

vi.mock("webextension-polyfill", () => ({
    default: {cookies: {getAll: vi.fn(async () => [])}},
}))
vi.mock("~/backend/Backend", () => ({
    addressRefreshCapabilities: vi.fn(),
    addressRefreshSessions: vi.fn(),
    submitAddressRefreshCandidate: vi.fn(),
}))

let policy: typeof import("~/addressrefresh/AddressRefreshCaptureCoordinator")

beforeAll(async () => {
    policy = await import("~/addressrefresh/AddressRefreshCaptureCoordinator")
})

const session: AddressRefreshSession = {
    operationId: "operation",
    nonce: "nonce",
    sourceHost: "source.invalid",
    sourceUrl: "https://source.invalid/watch/1",
    createdAtEpochMs: 1_000,
    expiresAtEpochMs: 10_000,
    protocolVersion: {major: 1, minor: 0},
    expectedResourceRole: "primary",
    downloaderType: "HTTP",
    expectedFileName: "video.mp4",
    expectedExtension: "mp4",
    expectedMimeFamily: "video",
    acceptedMethods: ["GET", "HEAD", "POST", "PUT"],
    maxBodyBytes: 64 * 1024,
    extensionConnected: false,
    candidates: [],
}

function request(overrides: Partial<ObservedRequest> = {}): ObservedRequest {
    return {
        requestId: "request",
        url: "https://media.invalid/video.mp4?token=secret",
        method: "GET",
        capturedAtEpochMs: 2_000,
        tabId: 4,
        frameId: 0,
        documentUrl: "https://source.invalid/watch/1",
        headers: {},
        redirectChain: [],
        ...overrides,
    }
}

describe("address refresh capture policy", () => {
    it("shares the v1 golden candidate shape with the desktop app", () => {
        expect(fixture.protocolVersion.major).toBe(1)
        expect(fixture.candidateId).toBe("candidate-1")
        expect(fixture.mimeType).toBe("video/mp4")
        expect(fixture.resourceRole).toBe("primary")
    })
    it("matches only requests from the active source session", () => {
        expect(policy.doesRequestMatchSession(session, request(), "video/mp4")).toBe(true)
        expect(policy.doesRequestMatchSession(session, request({capturedAtEpochMs: 999}), "video/mp4")).toBe(false)
        expect(policy.doesRequestMatchSession(session, request({documentUrl: "https://other.invalid/"}), "video/mp4")).toBe(false)
        expect(policy.doesRequestMatchSession(session, request(), "text/html")).toBe(false)
    })

    it("requires a captured body for non-GET requests", () => {
        expect(policy.doesRequestMatchSession(session, request({method: "POST"}), "video/mp4")).toBe(false)
        expect(policy.doesRequestMatchSession(session, request({
            method: "POST",
            body: {encoding: "BASE64", data: "YQ=="},
        }), "video/mp4")).toBe(true)
    })

    it("recognizes direct and adaptive resources but rejects page assets", () => {
        expect(policy.isPotentialDownload(new Headers({"content-type": "video/mp4"}), "https://x/v")).toBe(true)
        expect(policy.isPotentialDownload(new Headers({"content-type": "application/vnd.apple.mpegurl"}), "https://x/v")).toBe(true)
        expect(policy.isPotentialDownload(new Headers({"content-type": "application/dash+xml"}), "https://x/v")).toBe(true)
        expect(policy.isPotentialDownload(new Headers({"content-type": "text/css"}), "https://x/site.css")).toBe(false)
        expect(policy.isPotentialForSession(
            session,
            new Headers({"content-type": "application/octet-stream"}),
            "https://media.invalid/video.mp4?token=secret",
        )).toBe(true)
    })

    it("removes transport-controlled headers without dropping authentication context", () => {
        const headers = {
            host: "media.invalid",
            range: "bytes=10-",
            authorization: "Bearer secret",
            cookie: "session=secret",
            referer: "https://source.invalid/",
        }
        policy.removeControlledHeaders(headers)
        expect(headers).not.toHaveProperty("host")
        expect(headers).not.toHaveProperty("range")
        expect(headers.authorization).toBe("Bearer secret")
        expect(headers.cookie).toBe("session=secret")
    })

    it("encodes bounded raw request bodies without text conversion", () => {
        expect(policy.bytesToBase64(new Uint8Array([0, 1, 2, 255]))).toBe("AAEC/w==")
    })
})
