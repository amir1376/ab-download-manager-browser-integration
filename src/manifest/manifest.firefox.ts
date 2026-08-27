import {
    getBackgroundScript,
    getBaseManifest,
    getBrowserActionInfo,
    getCommonPermissions,
    getHostPermissions,
    getOptionalPermissions,
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
                strict_min_version: "140.0",
                data_collection_permissions: {
                    required: ["none"],
                    optional: ["browsingActivity", "websiteContent", "authenticationInfo"],
                },
            }
        },
        browser_action: getBrowserActionInfo(),
        permissions: [
            ...getCommonPermissions(),
        ],
        optional_permissions: [
            ...getHostPermissions(),
            ...getOptionalPermissions(),
        ],
        incognito: "spanning",
    } as unknown as ManifestV2
}
