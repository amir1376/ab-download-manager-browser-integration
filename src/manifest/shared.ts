import pkg from "../../package.json";
import ManifestPermissions = chrome.runtime.ManifestPermissions;

export function getBaseManifest() {
    const icon48="icons/icon-48.png"
    const icon96="icons/icon-96.png"
    const icon128="icons/icon-128.png"
    return {
        name: "__MSG_extension_name__",
        description: "__MSG_extension_description__",
        version: pkg.version,
        homepage_url:pkg.homepage,
        author: pkg.author,
        default_locale: "en",
        icons: {
            48: icon48,
            96: icon96,
            128: icon128,
        },
        options_ui: {
            page: "src/entrypoint/OptionUi/index.html",
            open_in_tab: true,
        },
        commands: {
            "toggle-tab-bypass": {
                suggested_key: {default: "Alt+Shift+B"},
                description: "__MSG_command_toggle_bypass__",
            },
            "review-current-page": {
                suggested_key: {default: "Alt+Shift+D"},
                description: "__MSG_command_review_page__",
            },
        },
        web_accessible_resources:[
        ]
    }
}


export function getBrowserActionInfo(){
    return  {
        default_title: "__MSG_extension_name__",
        default_popup: "src/entrypoint/BrowserAction/index.html",
    }
}
export function getBackgroundScript(){
    return "src/entrypoint/Background.ts"
}
export function getHostPermissions(){
    return [
        "http://*/*",
        "https://*/*",
    ]
}
export function getCommonPermissions():ManifestPermissions[]{
    return [
        "activeTab",
        "alarms",
        "contextMenus",
        "storage",
        "downloads",
        "nativeMessaging",
    ]
}

export function getOptionalPermissions(): ManifestPermissions[] {
    return ["webRequest", "cookies", "tabs"]
}
