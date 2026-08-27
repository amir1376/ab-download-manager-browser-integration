import {describe, expect, it} from "vitest"
import capabilities from "~/protocol/fixtures/capabilities-v2.json"
import {canUseAutomaticTakeoverV2, classifyBrowserProtocolCompatibility} from "~/backend/ProtocolCompatibility"

describe("one-release protocol compatibility", () => {
    it("limits an old desktop to explicit-only compatibility", () => {
        expect(classifyBrowserProtocolCompatibility(true, null)).toBe("LEGACY_EXPLICIT_ONLY")
        expect(classifyBrowserProtocolCompatibility(false, null)).toBe("UNAVAILABLE")
    })

    it("requires the secure bridge and two-phase gate for automatic takeover", () => {
        const hello = {
            capabilities,
            httpFallback: {baseUrl: "http://127.0.0.1:15151/", apiKey: "test-pairing-key-value", headerName: "X-Api-Key" as const},
        }
        const flags = {
            secureBridge: true,
            twoPhaseCapture: true,
            ftpCapture: false,
            permissionPolicy: false,
            reviewedBatches: false,
            advancedMediaDiscovery: false,
            adaptiveMediaTransfer: false,
            uxPolicy: false,
        }
        const mode = classifyBrowserProtocolCompatibility(true, hello as any)
        expect(mode).toBe("V2")
        expect(canUseAutomaticTakeoverV2(mode, flags)).toBe(true)
        expect(canUseAutomaticTakeoverV2(mode, {...flags, twoPhaseCapture: false})).toBe(false)
    })
})
