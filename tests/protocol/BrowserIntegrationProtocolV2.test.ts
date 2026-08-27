import {describe, expect, it} from "vitest"
import capabilitiesFixture from "~/protocol/fixtures/capabilities-v2.json"
import captureFixture from "~/protocol/fixtures/capture-proposal-v2.json"
import mediaFixture from "~/protocol/fixtures/media-group-v2.json"
import {
    BrowserIntegrationCapabilitiesV2Schema,
    BrowserMediaGroupV2Schema,
    CaptureProposalV2Schema,
} from "~/protocol/BrowserIntegrationProtocolV2Schema"
import {BrowserProtocolLimitsV2} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import {browserParityFeatureFlagsV2} from "~/configs/FeatureFlags"
import {clearBrowserHelloV2, getBrowserHelloV2, PreparedCaptureV2Schema, setBrowserHelloV2} from "~/protocol/BrowserBridgeV2"

describe("browser integration protocol v2", () => {
    it("strictly parses shared fixtures without collapsing ordered headers", () => {
        const capabilities = BrowserIntegrationCapabilitiesV2Schema.parse(capabilitiesFixture)
        const capture = CaptureProposalV2Schema.parse(captureFixture)
        const media = BrowserMediaGroupV2Schema.parse(mediaFixture)

        expect(capabilities.protocolVersion.major).toBe(2)
        expect(capture.requestContext.requestHeaders).toHaveLength(2)
        expect(capture.requestContext.requestHeaders[0].name).toBe("Accept")
        expect(capture.requestContext.requestHeaders[1].name).toBe("Accept")
        expect(media.variants[0].tracks[0].selected).toBe(false)
    })

    it("enables only phases whose local implementation gates are complete", () => {
        expect(browserParityFeatureFlagsV2).toMatchObject({
            secureBridge: true,
            twoPhaseCapture: true,
            ftpCapture: true,
            permissionPolicy: true,
            reviewedBatches: true,
            advancedMediaDiscovery: true,
            adaptiveMediaTransfer: true,
            uxPolicy: true,
        })
        expect(BrowserProtocolLimitsV2.maxFrameBytes).toBe(256 * 1024)
        expect(BrowserProtocolLimitsV2.maxBodyBytes).toBe(4 * 1024 * 1024)
        expect(BrowserProtocolLimitsV2.maxBatchCandidates).toBe(5_000)
    })

    it("accepts only paired loopback HTTP bootstrap data and keeps it memory scoped", () => {
        const hello = setBrowserHelloV2({
            capabilities: capabilitiesFixture,
            httpFallback: {
                baseUrl: "http://127.0.0.1:15151/",
                apiKey: "phase-one-pairing-secret",
                headerName: "X-Api-Key",
            },
        })
        expect(getBrowserHelloV2()).toBe(hello)
        expect(() => setBrowserHelloV2({
            capabilities: capabilitiesFixture,
            httpFallback: {
                baseUrl: "http://192.0.2.1:15151/",
                apiKey: "phase-one-pairing-secret",
                headerName: "X-Api-Key",
            },
        })).toThrow()
        clearBrowserHelloV2()
        expect(getBrowserHelloV2()).toBeNull()
    })

    it("validates prepared capture recovery receipts", () => {
        expect(PreparedCaptureV2Schema.parse({
            captureId: "capture-1",
            contextRef: "context-1",
            state: "PREPARED",
            expiresAtEpochMs: 120_000,
        }).state).toBe("PREPARED")
        expect(() => PreparedCaptureV2Schema.parse({
            captureId: "capture-1",
            contextRef: "context-1",
            state: "RUNNING_WITH_BROWSER_OWNER",
            expiresAtEpochMs: 120_000,
        })).toThrow()
    })
})
