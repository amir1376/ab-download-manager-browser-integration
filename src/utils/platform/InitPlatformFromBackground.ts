import browser, {Runtime} from "webextension-polyfill";
import {PlatformInfoProvider} from "~/utils/platform/PlatformInfoProvider";

export default {
    async getPlatformInfo(): Promise<Runtime.PlatformInfo> {
        return await browser.runtime.getPlatformInfo();
    }
} satisfies PlatformInfoProvider
