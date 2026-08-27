import {
    getBackgroundScript,
    getBaseManifest,
    getBrowserActionInfo,
    getCommonPermissions,
    getHostPermissions,
    getOptionalPermissions,
} from "./shared";
import ManifestV3 = chrome.runtime.ManifestV3;
// import ManifestV2 = chrome.runtime.ManifestV2;

// Public SPKI from the official Chrome Web Store CRX. Keeping it in development
// builds preserves the store ID authorized by the packaged native-host manifest.
export const CHROME_WEB_STORE_PUBLIC_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7sRkZXuf6fZf/yv1C88bk1iwWy5dCY83bdqjAE3nmhxOh2nQhHA9QkVOaZWV2C9FejqCMnFuvaem/J2B2uq3MsNrxRDRmCBJKBI6G9OCvTFynMu+OX5VjecV9DuBFOnz5qouSnuzuSbADkklxR4ZShtQ6emaAoWb0nznfZwxwsb3GYL2cEwLxLRCArjGoY7gdqU3Btpr9P2AeCqywSMiM8xesITisPfi+jydA/Be0c2chKIqEDszmyhlPzHJlAYbl23wA65Fd6/JtDo4NKUeQ9SnM01EVTLTRS6WjGOYumOf0T3b+g9vDUz+hR/y6zE9DSI+FDwieqRt2SzhQZ44ywIDAQAB"

export function getManifestForChrome(): ManifestV3 {
    return {
        // as far as I know manifest version 3 does not allow request blocking
        manifest_version: 3,
        ...getBaseManifest(),
        key: CHROME_WEB_STORE_PUBLIC_KEY,
        background: {
            service_worker: getBackgroundScript(),
        },
        action: getBrowserActionInfo(),
        optional_host_permissions: getHostPermissions(),
        permissions: getCommonPermissions(),
        optional_permissions: [...getOptionalPermissions(), "scripting"],
        incognito: "split",
    } as unknown as ManifestV3
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
