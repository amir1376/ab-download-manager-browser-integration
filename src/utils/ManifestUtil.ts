import browser from "webextension-polyfill";


const version= browser.runtime.getManifest().manifest_version
export const IS_MV2 = version==2
export const IS_MV3 = version==3