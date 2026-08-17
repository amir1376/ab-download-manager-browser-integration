import type {Runtime} from "webextension-polyfill";
import {Nullable} from "~/utils/Types";
import {PlatformInfoProvider} from "~/utils/platform/PlatformInfoProvider";
let platform: Nullable<Runtime.PlatformInfo> = null


export async function boot(platformInfoProvider: PlatformInfoProvider) {
    platform = await platformInfoProvider.getPlatformInfo()
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
