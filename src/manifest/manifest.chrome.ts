import {
    getBackgroundScript,
    getBaseManifest,
    getBrowserActionInfo,
    getCommonPermissions,
    getHostPermissions
} from "./shared";
import ManifestV3 = chrome.runtime.ManifestV3;
// import ManifestV2 = chrome.runtime.ManifestV2;

// Pinned public key so unpacked/dev installs get a STABLE extension id
// (ladgaglhedhmogholhjcllgodbanocpd). The desktop app whitelists this origin
// for native messaging. Private key is kept out of the repo.
const UNPACKED_EXTENSION_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkdZel59rJKH2OR15jNU6RaAjC8X9TSgbLTAKnFBHUF9erUHzV0kbRQOkPhj6xfMAXcC66N5AekcmgYOe4KIYFJQuY58K9CFFIqz+Q6t/lFyjlCFO8BSu5vjETKWQjvV7ul2SFcWecskfD9Nh79cE2mMNxEzl4aDULyw8mReVfNpdMY0kshnOrIE4sDAMg2wzjLnOfYqLdOAKh6UBdj/SMDQhv4GWsrk2/sHQkDu/UgudIyqRI7XLAVDaa22sKdyLThm9uPKWZ8rRYh2zuMGtGrDHKEFXo2GoFU4HXFQCd8DkXPkPka1FVxqJXaGOQoeLovKyxMstA/79xiZ3K5/IjQIDAQAB";

export function getManifestForChrome(): ManifestV3 {
    return {
        // as far as I know manifest version 3 does not allow request blocking
        manifest_version: 3,
        ...getBaseManifest(),
        // @ts-expect-error - 'key' is valid in Chrome but missing from the TS type
        key: UNPACKED_EXTENSION_KEY,
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