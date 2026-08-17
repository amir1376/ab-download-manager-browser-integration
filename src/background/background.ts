import {initializeOptions} from "~/contextmenus/ContextMenus";
import * as backend from "~/backend/Backend"
import * as Backend from "~/backend/Backend"
import {redirectDownloadLinksToMe} from "~/linkgrabber/LinkGrabber";
import {onMessage} from "webext-bridge/background";
import {addDownload, getHeadersForUrls} from "~/background/actions";
import {keepListeningToEvents} from "~/utils/extension-api";
import {IS_MV3} from "~/utils/ManifestUtil";
import {setHoldingKey} from "~/background/BackgroundSharedState";
import {DefinedCommands} from "~/message/Commands";
import {defineExtensionEntry} from "~/utils/DefineExtensionEntry";
import platformInfoProvider from "~/utils/platform/InitPlatformFromBackground";
import BackgroundEntryType from "~/utils/EntryPointTypes/background/BackgroundEntryType";

function receiveMessageFromContentScripts() {
    onMessage(DefinedCommands.ADD_DOWNLOAD, async (msg) => {
        return await addDownload(msg.data)
    })
    onMessage(DefinedCommands.TEST_HTTP_PORT, async (msg) => {
        return await backend.httpPing(msg.data)
    })
    onMessage(DefinedCommands.TEST_NATIVE_MESSAGING, async (msg) => {
        return await backend.nativeMessagingPing()
    })
    onMessage(DefinedCommands.IS_APP_REACHABLE, async (msg) => {
        return await backend.isAppReachable()
    })
    onMessage(DefinedCommands.SHOW_LOG, (msg) => {
        console.log(...msg.data)
    })
    onMessage(DefinedCommands.GET_HEADERS, async (msg) => {
        return await getHeadersForUrls(msg.data)
    })
    onMessage(DefinedCommands.SET_HOLDING_KEY, async (msg) => {
        setHoldingKey(msg.data)
    })
    onMessage(DefinedCommands.GET_PLATFORM, async () => {
        return await platformInfoProvider.getPlatformInfo()
    })
}

export default defineExtensionEntry()
    .withType(BackgroundEntryType)
    .withInit(async (ctx) => {
        const disposable = ctx.getDisposable()
        try {
            if (IS_MV3) {
                disposable.add(keepListeningToEvents())
            }
            await Backend.boot()
            await initializeOptions()
            redirectDownloadLinksToMe()
            receiveMessageFromContentScripts()
            console.log("ab dm extension loaded successfully")
        } catch (e) {
            console.log("extension loading fail", e)
            throw e
        }
    })
