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

function receiveMessageFromContentScripts() {
    onMessage("add_download",async (msg)=>{
        return await addDownload(msg.data)
    })
    onMessage("test_port",async (msg)=>{
        return await backend.ping(msg.data)
    })
    onMessage("show_log",(msg)=>{
        console.log(...msg.data)
    })
    onMessage("get_headers",async (msg)=>{
        return await getHeadersForUrls(msg.data)
    })
}

run(async () => {
    const disposable= new Disposable()
    try {
        if (IS_MV3){
            disposable.add(keepListeningToEvents())
        }
        await Configs.boot()
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
