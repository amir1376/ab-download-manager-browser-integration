import {describe, expect, it} from "vitest"
import capabilitiesFixture from "./fixtures/capabilities-v2.json"
import captureFixture from "./fixtures/capture-proposal-v2.json"
import mediaFixture from "./fixtures/media-group-v2.json"
import {
    BrowserIntegrationCapabilitiesV2Schema,
    BrowserMediaGroupV2Schema,
    CaptureProposalV2Schema,
} from "./BrowserIntegrationProtocolV2Schema"
import {BrowserProtocolLimitsV2} from "./generated/BrowserIntegrationProtocolV2"
import {browserParityFeatureFlagsV2} from "~/configs/FeatureFlags"

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

    it("keeps every downstream phase disabled before its gate", () => {
        expect(Object.values(browserParityFeatureFlagsV2).every(value => value === false)).toBe(true)
        expect(BrowserProtocolLimitsV2.maxFrameBytes).toBe(256 * 1024)
        expect(BrowserProtocolLimitsV2.maxBodyBytes).toBe(4 * 1024 * 1024)
        expect(BrowserProtocolLimitsV2.maxBatchCandidates).toBe(5_000)
    })
})
