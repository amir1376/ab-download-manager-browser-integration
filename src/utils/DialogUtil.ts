import browser from "webextension-polyfill";
import {sendMessage} from "webext-bridge/background"
export async function showAlertInCurrentTab(message:string) {
    const [tab]=await browser.tabs.query({active:true})
    if (tab?.id===undefined){
        return
    }

    await sendMessage(
        "show_alert",
        message,
        {
            tabId:tab.id,
            context:"content-script"
        }
    )
}