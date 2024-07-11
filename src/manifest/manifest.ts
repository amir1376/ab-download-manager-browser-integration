import {isFirefox} from "../utils/ExtensionInfo";
import ManifestV3 = chrome.runtime.ManifestV3;
import ManifestV2 = chrome.runtime.ManifestV2;
import {getManifestForChrome} from "./manifest.chrome";
import {getManifestForFirefox} from "./manifest.firefox";

export function getManifest(): ManifestV2 | ManifestV3 {
    if (isFirefox()) {
        return getManifestForFirefox()
    } else {
        return getManifestForChrome()
    }
}

