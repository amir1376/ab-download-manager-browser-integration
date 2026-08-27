import type {BrowserHelloResponseV2} from "~/protocol/BrowserBridgeV2"
import type {BrowserParityFeatureFlagsV2} from "~/configs/FeatureFlags"

export type BrowserProtocolCompatibilityMode = "V2" | "LEGACY_EXPLICIT_ONLY" | "UNAVAILABLE"

export function classifyBrowserProtocolCompatibility(
    nativeConnected: boolean,
    hello: BrowserHelloResponseV2 | null,
): BrowserProtocolCompatibilityMode {
    if (hello !== null && hello.capabilities.protocolVersion.major === 2) return "V2"
    if (nativeConnected) return "LEGACY_EXPLICIT_ONLY"
    return "UNAVAILABLE"
}

export function canUseAutomaticTakeoverV2(
    mode: BrowserProtocolCompatibilityMode,
    flags: BrowserParityFeatureFlagsV2,
): boolean {
    return mode === "V2" && flags.secureBridge && flags.twoPhaseCapture
}
