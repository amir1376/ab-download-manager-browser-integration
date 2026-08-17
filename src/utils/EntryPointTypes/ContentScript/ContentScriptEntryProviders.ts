import InitPlatformFromContentScript from "~/utils/platform/InitPlatformFromContentScript";
import {EntryProviders} from "~/utils/EntryPointTypes/EntryProviders";

export default {
    platformInfoProvider: InitPlatformFromContentScript
} satisfies EntryProviders
