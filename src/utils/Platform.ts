import browser, {Runtime} from "webextension-polyfill";
import {Nullable} from "~/utils/Types";

let platform: Nullable<Runtime.PlatformInfo> = null

export async function boot() {
    platform = await browser.runtime.getPlatformInfo()
}

export function getPlatform() {
    if (!platform) {
        throw new Error("call the boot before calling getPlatformInfo")
    }
    return platform;
}

export function isMac() {
    return getPlatform().os === "mac"
}
