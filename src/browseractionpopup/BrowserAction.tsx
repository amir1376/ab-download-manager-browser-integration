import React, {ReactNode} from "react";
import ReactDom from "react-dom";
import "~/assets/css/styles.css"
import {BaseViewModel, useViewModel} from "~/base/BaseViewModel";
import {action, makeObservable, observable} from "mobx";
import {observer} from "mobx-react-lite"
import {run} from "~/utils/ScopeFunctions";
import * as Configs from "~/configs/Config";
import browser from "webextension-polyfill";
import * as backend from "~/backend/Backend"
import {AppIcon, SettingsIcon} from "~/components/ReactIcons";

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
            this.autoCaptureLinks = config.autoCaptureLinks
            this.popupEnabled = config.popupEnabled
            this.silentAddDownload = config.silentAddDownload
        })
        run(async () => {
            this.setCanReachable(await backend.ping())
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

    @action
    setCanReachable(value: boolean) {
        this.canReachable = value
    }

    setAutoCaptureLinks(value: boolean) {
        Configs.setConfigItem("autoCaptureLinks", value)
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
    let status =run(()=>{
        const commonStyles="text-sm "
        if (reachable === true) {
            return <div className={commonStyles+"text-green-500"}>
                {browser.i18n.getMessage("connection_connected")}
            </div>
        } else if (reachable === false) {
            return <div className={commonStyles+"text-red-500"}>
                {browser.i18n.getMessage("connection_not_connected")}
            </div>
        } else {
            return <div className={commonStyles+""}>
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
            <AutoCaptureSection enabled={vm.autoCaptureLinks} toggle={(v) => vm.setAutoCaptureLinks(v)}/>
            <EnableSection enabled={vm.popupEnabled} toggle={(v) => vm.setPopupEnabled(v)}/>
            <SilentAddDownload enabled={vm.silentAddDownload} toggle={(v) => vm.setSilentAddDownload(v)}/>
            <MoreSettings/>
        </div>
    </div>
})

function Divider() {
    return <div className="w-full bg-base-content/20 h-px"/>
}

function OptionItem(
    props: {
        left: ReactNode,
        right: ReactNode,
        onClick: () => void,
    }
) {
    return <div onClick={props.onClick}
                className="flex flex-col space-y-4 hover:bg-primary/10 transition-colors select-none px-4 py-4">
        <div className="flex flex-row items-center">
            {props.left}
            <div className="flex-grow min-w-[1rem]"></div>
            {props.right}
        </div>
    </div>
}

function EnableSection(
    props: {
        enabled: boolean,
        toggle: (v: boolean) => void
    }
) {
    return <OptionItem
        left={
            <div>{browser.i18n.getMessage("config_show_popups")}</div>
        }
        onClick={
            () => props.toggle(!props.enabled)
        }
        right={
            <input
                checked={props.enabled}
                type="checkbox"
                className="checkbox"/>
        }
    />
}

function SilentAddDownload(
    props: {
        enabled: boolean,
        toggle: (v: boolean) => void
    }
) {
    return <OptionItem
        left={
            <div>{browser.i18n.getMessage("config_silent_add_download")}</div>
        }
        onClick={
            () => props.toggle(!props.enabled)
        }
        right={
            <input
                checked={props.enabled}
                type="checkbox"
                className="checkbox"/>
        }
    />
}

function AutoCaptureSection(
    props: {
        enabled: boolean,
        toggle: (v: boolean) => void
    }
) {
    return <OptionItem
        onClick={
            () => props.toggle(!props.enabled)
        }
        left={
            <div>{browser.i18n.getMessage("config_auto_capture_links")}</div>
        }
        right={
            <input checked={props.enabled} type="checkbox"
                   className="checkbox"/>
        }
    />
}


run(async () => {
    await Configs.boot()
    const vm = new BrowserActionViewModel(Configs.getLatestConfig())
    const container = document.getElementById("app")!
    ReactDom.render(
        <BrowserActionUi vm={vm}/>,
        container,
    )
})