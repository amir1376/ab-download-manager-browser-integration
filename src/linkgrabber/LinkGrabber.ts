import {BrowserTarget, getExtensionBrowserTarget, isFirefox} from "~/utils/ExtensionInfo";
import {DownloadLinkInterceptor} from "~/linkgrabber/DownloadLinkInterceptor";
import {Manifest2DownloadLinkInterceptor} from "~/linkgrabber/Manifest2DownloadLinkInterceptor";
import {run} from "~/utils/ScopeFunctions";
import {Manifest3DownloadLinkInterceptor} from "~/linkgrabber/Manifest3DownloadLinkInterceptor";
import {MediaRegistry} from "~/media/MediaRegistry";
import {AddressRefreshCaptureCoordinator} from "~/addressrefresh/AddressRefreshCaptureCoordinator";
import {canUseAutomaticTakeover} from "~/backend/Backend";
import {CaptureCoordinatorV2} from "~/linkgrabber/v2/CaptureCoordinatorV2";

export function redirectDownloadLinksToMe() {
    if (canUseAutomaticTakeover()) {
        new CaptureCoordinatorV2().boot()
        return
    }
    const downloadMediaRegistry = new MediaRegistry()
    downloadMediaRegistry.boot()
    const addressRefreshCoordinator = new AddressRefreshCaptureCoordinator()
    addressRefreshCoordinator.boot().catch(() => undefined)
    const downloadLinkInterceptor: DownloadLinkInterceptor = run(() => {
        switch (getExtensionBrowserTarget()) {
            case BrowserTarget.chrome:
                return new Manifest3DownloadLinkInterceptor(addressRefreshCoordinator)
            case BrowserTarget.firefox:
                return new Manifest2DownloadLinkInterceptor(addressRefreshCoordinator)
        }
    })
    downloadLinkInterceptor.redirectDownloadsToExtension()
    downloadLinkInterceptor.setOnMediaDetectedListener(downloadMediaRegistry)
}
