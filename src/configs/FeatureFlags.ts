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
 * Phase features remain disabled until their phase gate is complete.
 * Capability negotiation will replace these static defaults in Phase 1.
 */
export const browserParityFeatureFlagsV2: Readonly<BrowserParityFeatureFlagsV2> = Object.freeze({
    secureBridge: false,
    twoPhaseCapture: false,
    ftpCapture: false,
    permissionPolicy: false,
    reviewedBatches: false,
    advancedMediaDiscovery: false,
    adaptiveMediaTransfer: false,
    uxPolicy: false,
})
