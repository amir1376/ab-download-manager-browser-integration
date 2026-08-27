import React, {ReactNode, useEffect, useState} from "react";
import "~/assets/css/styles.css"
import {BaseViewModel, useViewModel} from "~/base/BaseViewModel";
import {action, makeObservable, observable} from "mobx";
import {observer} from "mobx-react-lite"
import {run} from "~/utils/ScopeFunctions";
import * as Configs from "~/configs/Config";
import browser from "webextension-polyfill";
import {AppIcon, SettingsIcon} from "~/components/ReactIcons";
import {sendMessage} from "webext-bridge/popup";
import {DefinedCommands} from "~/message/Commands";
import {defineExtensionEntry} from "~/utils/DefineExtensionEntry";
import {createRoot} from "react-dom/client";
import BrowserActionEntryType from "~/utils/EntryPointTypes/BrowserAction/BrowserActionEntryType";
import {t} from "~/i18n/t";
import type {BrowserIntegrationPolicyV2} from "~/protocol/generated/BrowserIntegrationProtocolV2";

interface IntegrationDiagnosticsV2 {
    nativeConnected: boolean
    compatibilityMode: "V2" | "LEGACY_EXPLICIT_ONLY" | "UNAVAILABLE"
    desktopVersion: string | null
    extensionVersion: string
    policyMode: "OFF" | "STANDARD" | "FULL" | "UNAVAILABLE"
    policy: BrowserIntegrationPolicyV2 | null
    fullAuthority: boolean
}

class BrowserActionViewModel extends BaseViewModel {
    private readonly keys: string[]

    constructor(initialStates: Configs.Config) {
        super();
        makeObservable(this)
        this.keys = Object.keys(initialStates)
        this.keys
            .forEach((k) => {
                // @ts-ignore
                this[k] = initialStates[k]
            })
    }

    protected setUp() {
        Configs.onChanged.addEventListener((config) => {
            this.popupEnabled = config.popupEnabled
            this.silentAddDownload = config.silentAddDownload
        })
        run(async () => {
            try {
                const isAppReachable = await sendMessage(
                    DefinedCommands.IS_APP_REACHABLE,
                    undefined,
                    "background",
                )
                this.setCanReachable(isAppReachable)
                this.setDiagnostics(await sendMessage(
                    DefinedCommands.GET_INTEGRATION_DIAGNOSTICS_V2,
                    null,
                    "background",
                ) as unknown as IntegrationDiagnosticsV2)
            } catch {
                this.setCanReachable(false)
                this.setDiagnostics({
                    nativeConnected: false,
                    compatibilityMode: "UNAVAILABLE",
                    desktopVersion: null,
                    extensionVersion: browser.runtime.getManifest().version,
                    policyMode: "UNAVAILABLE",
                    policy: null,
                    fullAuthority: false,
                })
            }
        })
    }

    @observable
    popupEnabled!: boolean
    @observable
    autoCaptureLinks!: boolean
    @observable
    silentAddDownload!: boolean

    @observable
    canReachable: boolean | null = null
    @observable
    diagnostics: IntegrationDiagnosticsV2 | null = null

    @action
    setCanReachable(value: boolean) {
        this.canReachable = value
    }

    @action
    setDiagnostics(value: IntegrationDiagnosticsV2) {
        this.diagnostics = value
        this.autoCaptureLinks = value.policy?.automaticInterception ?? false
    }

    setAutoCaptureLinks(value: boolean) {
        const policy = this.diagnostics?.policy
        if (policy?.mode === "FULL") {
            void sendMessage(
                DefinedCommands.UPDATE_BROWSER_POLICY_V2,
                {...policy, automaticInterception: value},
                "background",
            ).then(result => {
                const updated = result as unknown as {policy?: BrowserIntegrationPolicyV2}
                if (updated.policy && this.diagnostics) {
                    Configs.setConfigItem("autoCaptureLinks", updated.policy.automaticInterception)
                    this.setDiagnostics({...this.diagnostics, policy: updated.policy, policyMode: updated.policy.mode})
                }
            }).catch(() => this.setCanReachable(false))
        }
    }

    setPopupEnabled(value: boolean) {
        Configs.setConfigItem("popupEnabled", value)
    }

    setSilentAddDownload(value: boolean) {
        Configs.setConfigItem("silentAddDownload", value)
    }

}


function MoreSettings() {
    return <OptionItem
        ariaLabel={browser.i18n.getMessage("browser_action_more_settings")}
        onClick={() => browser.runtime.openOptionsPage()}
        left={
            browser.i18n.getMessage("browser_action_more_settings")
        }
        right={
            <SettingsIcon className="w-6 h-6"/>
        }
    />

}

function Header(
    props: {
        canReachable: boolean | null
    }
) {
    const reachable = props.canReachable
    let status = run(() => {
        const commonStyles = "text-sm "
        if (reachable === true) {
            return <div className={commonStyles + "text-green-500"}>
                {browser.i18n.getMessage("connection_connected")}
            </div>
        } else if (reachable === false) {
            return <div className={commonStyles + "text-red-500"}>
                {browser.i18n.getMessage("connection_not_connected")}
            </div>
        } else {
            return <div className={commonStyles + ""}>
                {browser.i18n.getMessage("connection_checking")}...
            </div>
        }
    })


    return <div className="p-4 bg-base-200 flex flex-row items-center">
        <AppIcon className="w-8 h-8"/>
        <div className="min-w-[1rem] flex-1"/>
        <div>
            <span>{browser.i18n.getMessage("browser_action_popup_title")}</span>
            {status}
        </div>
    </div>
}

const BrowserActionUi: React.FC<{
    vm: BrowserActionViewModel
}> = observer((props) => {
    const vm = useViewModel(() => props.vm)
    return <div data-theme="dark" className="m-auto w-max">
        <Header canReachable={vm.canReachable}/>
        <div className="bg-base-200 shadow">
            <AutoCaptureSection enabled={vm.autoCaptureLinks} available={vm.diagnostics?.policyMode === "FULL"} toggle={(v) => vm.setAutoCaptureLinks(v)}/>
            <EnableSection enabled={vm.popupEnabled} toggle={(v) => vm.setPopupEnabled(v)}/>
            <SilentAddDownload enabled={vm.silentAddDownload} toggle={(v) => vm.setSilentAddDownload(v)}/>
            <RecoveryGuidance diagnostics={vm.diagnostics}/>
            <RecentBrowserDownloads/>
            <MoreSettings/>
        </div>
    </div>
})

function RecoveryGuidance({diagnostics}: {diagnostics: IntegrationDiagnosticsV2 | null}) {
    if (!diagnostics) return null
    let message: string | null = null
    if (diagnostics.compatibilityMode === "UNAVAILABLE") {
        message = t("guidance_native_missing", "Native integration is unavailable. Install or start the desktop app, then use More settings to retest the connection.")
    } else if (diagnostics.compatibilityMode === "LEGACY_EXPLICIT_ONLY") {
        message = t("guidance_native_old", "The desktop app is older than this extension. Explicit downloads remain available; update the desktop app to enable secure automatic integration.")
    } else if (diagnostics.policyMode === "OFF") {
        message = t("guidance_policy_off", "Browser integration is Off. Open More settings to choose Standard or Full mode.")
    } else if (diagnostics.policyMode === "FULL" && !diagnostics.fullAuthority) {
        message = t("guidance_permission_missing", "Full mode is selected but browser authority is incomplete. Open More settings and grant the requested permissions.")
    }
    if (!message) return <div role="status" className="px-4 py-2 text-xs text-success">{t("guidance_ready", "Secure browser integration is ready.")} {diagnostics.desktopVersion && t("guidance_desktop_version", "Desktop $1", diagnostics.desktopVersion)}</div>
    return <div role="alert" className="px-4 py-2 text-xs text-warning">{message}</div>
}

function RecentBrowserDownloads() {
    const [items, setItems] = useState<Array<{id: number; name: string}>>([])
    const [result, setResult] = useState<string | null>(null)
    useEffect(() => {
        void browser.downloads.search({limit: 5, orderBy: ["-startTime"]}).then(downloads => {
            setItems(downloads.filter(item => !item.byExtensionId && /^(https?|ftps?):/i.test(item.url)).map(item => ({
                id: item.id,
                name: item.filename?.split(/[\\/]/).pop() || item.url,
            })))
        })
    }, [])
    if (!items.length) return null
    return <div className="px-4 py-3 border-t border-base-content/20 max-w-96">
        <div className="text-sm mb-2">{t("recent_downloads_title", "Recapture a browser download")}</div>
        {items.map(item => <button key={item.id} className="btn btn-ghost btn-xs block max-w-full truncate" title={item.name} onClick={() => {
            void sendMessage(DefinedCommands.RECAPTURE_BROWSER_DOWNLOAD_V2, item.id, "background")
                .then(ok => setResult(ok ? t("recent_downloads_added", "Added to desktop review") : t("recent_downloads_failed", "Could not recapture")))
        }}>{item.name}</button>)}
        {result && <div className="text-xs mt-1">{result}</div>}
    </div>
}

function Divider() {
    return <div className="w-full bg-base-content/20 h-px"/>
}

function OptionItem(
    props: {
        left: ReactNode,
        right: ReactNode,
        onClick: () => void,
        ariaLabel: string,
    }
) {
    return <button type="button" onClick={props.onClick} aria-label={props.ariaLabel}
                className="flex w-full flex-col space-y-4 hover:bg-primary/10 transition-colors select-none px-4 py-4 text-left">
        <div className="flex flex-row items-center">
            {props.left}
            <div className="flex-grow min-w-[1rem]"></div>
            {props.right}
        </div>
    </button>
}

function ToggleOptionItem(props: {label: string; enabled: boolean; disabled?: boolean; toggle(value: boolean): void}) {
    return <label aria-disabled={props.disabled === true}
                  className="flex w-full items-center hover:bg-primary/10 transition-colors select-none px-4 py-4">
        <span>{props.label}</span>
        <span className="flex-grow min-w-[1rem]"/>
        <input checked={props.enabled} disabled={props.disabled} onChange={event => props.toggle(event.target.checked)}
               aria-label={props.label} type="checkbox" className="checkbox"/>
    </label>
}

function EnableSection(
    props: {
        enabled: boolean,
        toggle: (v: boolean) => void
    }
) {
    const label = browser.i18n.getMessage("config_show_popups")
    return <ToggleOptionItem label={label} enabled={props.enabled} toggle={props.toggle}/>
}

function SilentAddDownload(
    props: {
        enabled: boolean,
        toggle: (v: boolean) => void
    }
) {
    const label = browser.i18n.getMessage("config_silent_add_download")
    return <ToggleOptionItem label={label} enabled={props.enabled} toggle={props.toggle}/>
}

function AutoCaptureSection(
    props: {
        enabled: boolean,
        available: boolean,
        toggle: (v: boolean) => void
    }
) {
    const label = browser.i18n.getMessage("config_auto_capture_links")
    return <ToggleOptionItem label={label} enabled={props.enabled} disabled={!props.available} toggle={props.toggle}/>
}


export default defineExtensionEntry()
    .withType(BrowserActionEntryType)
    .withInit(async (context) => {
        const vm = new BrowserActionViewModel(context.getLatestConfig())
        const container = document.getElementById("app")!
        createRoot(container).render(
            <BrowserActionUi vm={vm}/>,
        )
    })
