import pkg from "../../package.json";
import ManifestPermissions = chrome.runtime.ManifestPermissions;

export function getBaseManifest() {
    const icon48="icons/icon-48.png"
    const icon96="icons/icon-96.png"
    const icon128="icons/icon-128.png"
    return {
        name: pkg.displayName,
        description: pkg.description,
        version: pkg.version,
        homepage_url:pkg.homepage,
        author: pkg.author,
        default_locale: "en",
        icons: {
            48: icon48,
            96: icon96,
            128: icon128,
        },
        content_scripts: [{
            matches: ["*://*/*"],
            js: ["src/contentscripts/ContentScript.ts"],
        }],
        options_ui: {
            page: "src/optionsui/option-ui.html",
            open_in_tab: true,
        },
        web_accessible_resources:[
        ]
    }
}


export function getBrowserActionInfo(){
    return  {
        default_title: "AB Download Manager",
        default_popup: "src/browseractionpopup/browser-action.html"
    }
}
export function getBackgroundScript(){
    return  "src/background/background.ts"
}
export function getHostPermissions(){
    return [
        "*://*/*",
    ]
}
export function getCommonPermissions():ManifestPermissions[]{
    return [
        "contextMenus",
        "webRequest",
        "cookies",
        "storage",
        "tabs",
        "downloads",
        "notifications",
    ]
}