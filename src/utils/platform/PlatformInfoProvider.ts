import type {Runtime} from "webextension-polyfill";


export interface PlatformInfoProvider {
    getPlatformInfo(): Promise<Runtime.PlatformInfo>
}
