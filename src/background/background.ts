import {initializeOptions} from "~/contextmenus/ContextMenus";
import * as backend from "~/backend/Backend"
import {run} from "~/utils/ScopeFunctions";
import {redirectDownloadLinksToMe} from "~/linkgrabber/LinkGrabber";
import * as Configs from "~/configs/Config";
import {onMessage} from "webext-bridge/background";
import {addDownload, getHeadersForUrls} from "~/background/actions";
import {Disposable} from "~/utils/disposable";
import {keepListeningToEvents} from "~/utils/extension-api";
import {IS_MV3} from "~/utils/ManifestUtil";
import {setHoldingKey} from "~/background/BackgroundSharedState";
import * as Backend from "~/backend/Backend";
import {DefinedCommands} from "~/message/Commands";

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
}

run(async () => {
    const disposable= new Disposable()
    try {
        if (IS_MV3){
            disposable.add(keepListeningToEvents())
        }
        await Configs.boot()
        await Backend.boot()
        await initializeOptions()
        redirectDownloadLinksToMe()
        receiveMessageFromContentScripts()
        console.log("ab dm extension loaded successfully")
    } catch (e) {
        console.log("extension loading fail", e)
        // dispose resources if we can't serve the user well
        disposable.dispose()
    }
})
