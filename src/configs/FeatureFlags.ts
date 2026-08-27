export interface BrowserParityFeatureFlagsV2 {
    secureBridge: boolean
    twoPhaseCapture: boolean
    ftpCapture: boolean
    permissionPolicy: boolean
    reviewedBatches: boolean
    advancedMediaDiscovery: boolean
    adaptiveMediaTransfer: boolean
    uxPolicy: boolean
}

/**
 * Compile-time rollout gates are combined with desktop capability negotiation
 * and the authoritative privacy policy. A true value never grants permission by itself.
 */
export const browserParityFeatureFlagsV2: Readonly<BrowserParityFeatureFlagsV2> = Object.freeze({
    secureBridge: true,
    twoPhaseCapture: true,
    ftpCapture: true,
    permissionPolicy: true,
    reviewedBatches: true,
    advancedMediaDiscovery: true,
    adaptiveMediaTransfer: false,
    uxPolicy: false,
})
