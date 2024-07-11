import {
    getBackgroundScript,
    getBaseManifest,
    getBrowserActionInfo,
    getCommonPermissions,
    getHostPermissions
} from "./shared";
import ManifestV2 = chrome.runtime.ManifestV2;

export function getManifestForFirefox(): ManifestV2 {
    return {
        manifest_version: 2,
        ...getBaseManifest(),
        background: {
            scripts: [getBackgroundScript()],
        },
        browser_specific_settings: {
            gecko: {
                id: "firefox-integration@abdownloadmanager.com",
            }
        },
        browser_action: getBrowserActionInfo(),
        permissions: [
            ...getHostPermissions(),
            ...getCommonPermissions(),
        ],
    }
}
