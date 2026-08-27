import {canUseAutomaticTakeover} from "~/backend/Backend";
import {CaptureCoordinatorV2} from "~/linkgrabber/v2/CaptureCoordinatorV2";

let stopAutomaticCapture: (() => void) | null = null

export function redirectDownloadLinksToMe() {
    configureAutomaticTakeoverV2(canUseAutomaticTakeover())
}

export function configureAutomaticTakeoverV2(enabled: boolean): void {
    stopAutomaticCapture?.()
    stopAutomaticCapture = null
    if (enabled) stopAutomaticCapture = new CaptureCoordinatorV2().boot()
}
