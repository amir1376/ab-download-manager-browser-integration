import {
    getBackgroundScript,
    getBaseManifest,
    getBrowserActionInfo,
    getCommonPermissions,
    getHostPermissions
} from "./shared";
import ManifestV3 = chrome.runtime.ManifestV3;
// import ManifestV2 = chrome.runtime.ManifestV2;

export function getManifestForChrome(): ManifestV3 {
    return {
        // as far as I know manifest version 3 does not allow request blocking
        manifest_version: 3,
        ...getBaseManifest(),
        background: {
            service_worker: getBackgroundScript(),
        },
        action: getBrowserActionInfo(),
        host_permissions: getHostPermissions(),
        permissions: getCommonPermissions(),
    }
    /*return {
        manifest_version: 2,
        ...getBaseManifest(),
        background: {
            scripts: [getBackgroundScript()],
        },
        browser_action: getBrowserActionInfo(),
        permissions: [
            ...getHostPermissions(),
            ...getCommonPermissions(),
        ],
    }*/
}