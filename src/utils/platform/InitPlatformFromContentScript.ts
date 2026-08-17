import {Runtime} from "webextension-polyfill";
import {sendMessage} from "webext-bridge/content-script";
import {PlatformInfoProvider} from "~/utils/platform/PlatformInfoProvider";


export default {
    async getPlatformInfo(): Promise<Runtime.PlatformInfo> {
        return await sendMessage("get_platform", undefined, "background")
    }
} satisfies PlatformInfoProvider
