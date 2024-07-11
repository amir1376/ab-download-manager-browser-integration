import * as process from "process";

export enum BrowserTarget{
    chrome = "chrome",
    firefox = "firefox",
}
//lazy init
let target:BrowserTarget
function detectTarget() {
    const extensionTarget = process.env.EXTENSION_TARGET;
    if (!extensionTarget){
        throw new Error("Extension target is not defined in process.env with key of EXTENSION_TARGET");
    }
    const isValidTarget = (Object.values(BrowserTarget) as string[]).includes(extensionTarget)
    if (!isValidTarget){
        throw new Error(`Extension target ${extensionTarget} is not available in defined BrowserTargets did you forget to update BrowserTarget?`);
    }
    return extensionTarget as BrowserTarget
}

export function getExtensionBrowserTarget():BrowserTarget  {
    if (!target){
        target = detectTarget()
    }
    return target
}

export function isFirefox() {
    return getExtensionBrowserTarget() === "firefox"
}
export function isChrome() {
    return getExtensionBrowserTarget() === "chrome"
}