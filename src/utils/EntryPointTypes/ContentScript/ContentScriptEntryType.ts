import {EntryPointType} from "~/utils/EntryPointTypes/EntryPointType";
import ContentScriptEntryProviders from "~/utils/EntryPointTypes/ContentScript/ContentScriptEntryProviders";

export default {
    name: 'ContentScript',
    providers: ContentScriptEntryProviders,
} satisfies EntryPointType
