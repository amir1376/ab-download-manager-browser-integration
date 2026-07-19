import browser from "webextension-polyfill";
import {sendMessage} from "webext-bridge/background"
import {DefinedCommands} from "~/message/Commands";
export async function showAlertInCurrentTab(message:string) {
    const [tab]=await browser.tabs.query({active:true})
    if (tab?.id===undefined){
        return
    }

    await sendMessage(
        DefinedCommands.SHOW_ALERT,
        message,
        {
            tabId:tab.id,
            context:"content-script"
        }
    )
}
