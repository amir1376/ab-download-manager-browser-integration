import {EntryPointType} from "~/utils/EntryPointTypes/EntryPointType";
import BackgroundEntryProviders from "~/utils/EntryPointTypes/background/BackgroundEntryProviders";

export default {
    name: 'Background',
    providers: BackgroundEntryProviders,
} satisfies EntryPointType
