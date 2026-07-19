import React, {ReactNode, useEffect, useMemo, useState} from "react";
import ReactDom from "react-dom";
import "~/assets/css/styles.css"
import {EventAwareViewModel, useViewModel} from "~/base/BaseViewModel";
import {makeObservable, observable} from "mobx";
import {observer} from "mobx-react-lite"
import {run} from "~/utils/ScopeFunctions";
import * as Configs from "~/configs/Config";
import {Config, configKeys, defaultConfig} from "~/configs/Config";
import {constraintIn} from "~/utils/NumberUtils";
import {AppIcon, SettingsIcon} from "~/components/ReactIcons";
import {sendMessage} from "webext-bridge/options"
import {arrayEquals} from "~/utils/ArrayUtils";
import browser from "webextension-polyfill";
import Constants from "~/utils/Constants";
import classNames from "classnames";
import {isBlank} from "~/utils/StringUtils";
import AutoGrowingTextarea from "~/optionsui/AutoGrowingTextarea";
import {DefinedCommands} from "~/message/Commands";
import {Nullable, WithSetters} from "~/utils/Types";

class ToolsViewModelEvent {
}

class PortTestResult extends ToolsViewModelEvent {
    constructor(
        public port: number,
        public isSuccess: boolean,
        public message: Nullable<string> = null
    ) {
        super();
    }
}

type ConfigsWithSomeSetters = Omit<WithSetters<Configs.Config>,
    | "setAllowPassDownloadIfAppNotRespond"
    | "setCloseNewTabIfItWasCaptured"
    | "setBypassShortcut"
>

class ToolsViewModel extends EventAwareViewModel<ToolsViewModelEvent> implements ConfigsWithSomeSetters {
    constructor(initialStates: Configs.Config) {
        super();
        makeObservable(this)
        configKeys.forEach((k) => {
            this.setConfigItem(k, initialStates[k])
        })
    }

    private setConfigItem<K extends keyof Config>(key: K, value: Config[K]) {
        (this as Config)[key] = value
    }

    protected setUp() {
        Configs.onChanged.addEventListener((config) => {
            configKeys.forEach((k) => {
                this.setConfigItem(k, config[k])
            })
        })
        this.testNativeMessaging()
    }

    @observable
    popupEnabled!: boolean
    @observable
    autoCaptureLinks!: boolean

    @observable
    silentAddDownload!: boolean
    @observable
    silentStartDownload!: boolean

    @observable
    port!: number
    @observable
    sendHeaders!: boolean

    @observable
    registeredFileTypes!: string[]

    @observable
    blacklistedUrls!: string[]

    @observable
    allowPassDownloadIfAppNotRespond!: boolean

    @observable
    closeNewTabIfItWasCaptured!: boolean

    @observable
    captureFileSizeMinimumKb!: number

    @observable
    bypassShortcut!: string

    setAutoCaptureLinks(value: boolean) {
        Configs.setConfigItem("autoCaptureLinks", value)
    }

    setRegisteredFileTypes(types: string[]) {
        Configs.setConfigItem("registeredFileTypes", [...new Set(types)])
    }

    setBlacklistedUrls(blacklistedUrls: string[]) {
        Configs.setConfigItem("blacklistedUrls", [...new Set(blacklistedUrls)])
    }

    setCaptureFileSizeMinimumKb(value: number) {
        Configs.setConfigItem("captureFileSizeMinimumKb", value)
    }

    setShortCut(value: string) {
        Configs.setConfigItem("bypassShortcut", value)
    }

    setPopupEnabled(value: boolean) {
        Configs.setConfigItem("popupEnabled", value)
    }

    setSilentAddDownload(value: boolean) {
        Configs.setConfigItem("silentAddDownload", value)
    }

    setSilentStartDownload(value: boolean) {
        Configs.setConfigItem("silentStartDownload", value)
    }

    setPort(value: number) {
        Configs.setConfigItem("port", value)
    }

    setSendHeaders(value: boolean) {
        Configs.setConfigItem("sendHeaders", value)
    }

    @observable
    nativeMessagingAvailable: boolean | null = null

    testNativeMessaging() {
        run(async () => {
            const result = await sendMessage(DefinedCommands.TEST_NATIVE_MESSAGING, undefined, "background")
            if (typeof result === "boolean") {
                this.nativeMessagingAvailable = result
            } else {
                console.log("there is no valid result for ping")
            }
        })
    }

    testHttpPort() {
        run(async () => {
            const port = this.port
            const result = await sendMessage(DefinedCommands.TEST_HTTP_PORT, port, "background")
            if (typeof result === "boolean") {
                this.onEvent(new PortTestResult(
                    port, result
                ))
            } else {
                console.log("there is no valid result for ping")
            }
        })
    }

}


const App: React.FC<{
    vm: ToolsViewModel
}> = observer((props) => {
    const vm = useViewModel(() => props.vm)
    useEffect(() => {
        const listener = (event: ToolsViewModelEvent) => {
            if (event instanceof PortTestResult) {
                let str = ""
                if (event.isSuccess) {
                    str += browser.i18n.getMessage(
                        "config_port_connection_success",
                        [`${event.port}`]
                    )
                } else {
                    str += browser.i18n.getMessage(
                        "config_port_connection_fail",
                        [`${event.port}`]
                    )
                    if (event.message) {
                        str += `\n${event.message}`
                    }
                }
                alert(str)
            }
        }
        vm.addEventListener(listener)
        return () => vm.removeEventListener(listener)
    });
    return <div data-theme="dark" className="w-96 m-auto">
        <Header/>
        <SettingsSection vm={vm}/>
        <Footer/>
    </div>
})

function Header() {
    return <div className="p-4 flex flex-col justify-center items-center space-y-4">
        <AppIcon className="w-16 h-16"/>
        <span>{browser.i18n.getMessage("option_ui_title")}</span>
    </div>
}

function Footer() {
    return <div className="p-4 flex flex-col justify-center items-center space-y-4">
        <span className="">
            {browser.i18n.getMessage("note_about_app_must_be_installed_first")}
            {" "}<a target="_blank"
                    className="link link-primary"
                    href={Constants.downloadAppUrl}>
            {<span>{browser.i18n.getMessage("download_abdm_app")
            }</span>}
            </a>
        </span>
        <Divider/>
        <div>
            <span>❤️ | </span>
            <span>{browser.i18n.getMessage("support_by_rating")}</span>
        </div>
        <Divider/>
        <div className="flex flex-row flex-wrap space-x-4">
            <a target="_blank" className="link link-primary"
               href={Constants.website}>{browser.i18n.getMessage("project_website")}</a>
            <a target="_blank" className="link link-primary"
               href={Constants.repository}>{browser.i18n.getMessage("project_source_code")}</a>
        </div>
    </div>
}

const SettingsSection: React.FC<{ vm: ToolsViewModel }> = observer((props) => {
    const vm = props.vm
    return <div className="bg-base-200">
        <div className="p-4 flex flex-row flex-nowrap items-center space-x-4">
            <SettingsIcon className="w-8 h-8"/>
            <span>{browser.i18n.getMessage("settings")}</span>
        </div>

        <div className="p-4 bg-base-200 shadow">
            <AutoCaptureSection
                value={vm.autoCaptureLinks}
                toggle={(v) => vm.setAutoCaptureLinks(v)}
                fileTypes={vm.registeredFileTypes}
                defaultFileTypes={defaultConfig.registeredFileTypes}
                blacklistedUrls={vm.blacklistedUrls}
                defaultBlacklistedUrls={defaultConfig.blacklistedUrls}
                setFileTypes={types => vm.setRegisteredFileTypes(types)}
                setBlacklistedUrls={urls => vm.setBlacklistedUrls(urls)}
                captureFileSizeMinimumKb={vm.captureFileSizeMinimumKb}
                setCaptureFileSizeMinimumKb={(v) => vm.setCaptureFileSizeMinimumKb(v)}
                bypassShortcut={vm.bypassShortcut}
                setBypassShortcut={(v) => vm.setShortCut(v)}
            />
            <Divider/>
            <ShowPopupSection value={vm.popupEnabled} toggle={(v) => vm.setPopupEnabled(v)}/>
            <Divider/>
            <SilentDownloadSection
                silentAddEnabled={vm.silentAddDownload}
                setSilentAddEnabled={(v) => vm.setSilentAddDownload(v)}
                silentStartEnabled={vm.silentStartDownload}
                setSilentStartEnabled={(v) => vm.setSilentStartDownload(v)}
            />
            <Divider/>
            <NativeMessagingSection
                isNativeMessagingAvailable={vm.nativeMessagingAvailable}
            />
            <Divider/>
            <PortSection
                port={vm.port}
                setPort={(p) => vm.setPort(p)}
                onRequestTestPort={() => vm.testHttpPort()}
            />
            <Divider/>
            <SendCookiesSection enabled={vm.sendHeaders} toggle={(v) => vm.setSendHeaders(v)}/>
        </div>
    </div>
})

function Divider() {
    return <div className="w-full bg-base-content/20 h-px my-4"/>
}

function OptionItem(
    props: {
        title: ReactNode,
        toggle: ReactNode,
        description: ReactNode,
        enabled?: boolean,
        className?: string,
    }
) {
    const enabled = props.enabled ?? true
    const className = props.className ?? ""
    return <div className={className}>
        <div className={
            classNames(
                "flex flex-col space-y-4",
                enabled ? "" : "cursor-not-allowed opacity-50",
            )
        }>
            <div className="flex flex-row items-center">
                {props.title}
                <div className="flex-grow"></div>
                {props.toggle}
            </div>
            <div className="opacity-80">
                {props.description}
            </div>
        </div>
    </div>
}

function ShowPopupSection(
    props: {
        value: boolean,
        toggle: (v: boolean) => void
    }
) {
    return <OptionItem
        title={
            <div>{browser.i18n.getMessage("config_show_popups")}</div>
        }
        toggle={
            <input checked={props.value} onChange={event => props.toggle(event.target.checked)} type="checkbox"
                   className="checkbox"/>
        }
        description={
            <div>{browser.i18n.getMessage("config_show_popups_description")}</div>
        }
    />
}

function SilentDownloadSection(
    props: {
        silentAddEnabled: boolean,
        silentStartEnabled: boolean,
        setSilentAddEnabled: (v: boolean) => void,
        setSilentStartEnabled: (v: boolean) => void,
    }
) {
    return <div>
        <OptionItem
            title={
                <div>{browser.i18n.getMessage("config_silent_add_download")}</div>
            }
            toggle={
                <input checked={props.silentAddEnabled}
                       onChange={event => props.setSilentAddEnabled(event.target.checked)} type="checkbox"
                       className="checkbox"/>
            }
            description={
                <div>{browser.i18n.getMessage("config_silent_add_download_description")}</div>
            }
        />
        <OptionItem
            className="px-4 pt-4"
            enabled={props.silentAddEnabled}
            title={
                <div>{browser.i18n.getMessage("config_silent_start_download")}</div>
            }
            toggle={
                <input
                    checked={props.silentStartEnabled}
                    onChange={event => {
                        if (!props.silentAddEnabled) {
                            return
                        }
                        props.setSilentStartEnabled(event.target.checked)
                    }}
                    type="checkbox"
                    className={classNames(
                        "checkbox",
                        !props.silentAddEnabled && "input-disabled"
                    )}
                />
            }
            description={
                <div>{browser.i18n.getMessage("config_silent_start_download_description")}</div>
            }
        />
    </div>
}

function AutoCaptureSection(
    props: {
        value: boolean,
        toggle: (v: boolean) => void,
        fileTypes: string[]
        setFileTypes: (fileTypes: string[]) => void,
        defaultFileTypes: string[],

        blacklistedUrls: string[]
        setBlacklistedUrls: (urls: string[]) => void,
        defaultBlacklistedUrls: string[],
        captureFileSizeMinimumKb: number,
        setCaptureFileSizeMinimumKb: (n: number) => void,
        bypassShortcut: string,
        setBypassShortcut: (s: string) => void,
    }
) {
    const [fileTypesString, setFileTypesString] = useState<string>(() => {
        return props.fileTypes.join(" ")
    })
    const canBeResetTypes = useMemo(() => {
        return !arrayEquals(props.defaultFileTypes, props.fileTypes)
    }, [props.fileTypes])
    useEffect(() => {
        props.setFileTypes(
            fileTypesString
                .split(" ")
                .filter(l => !isBlank(l))
        )
    }, [fileTypesString]);
    useEffect(() => {
        setFileTypesString(props.fileTypes.join(" "))
    }, [canBeResetTypes]);

    const [urlsString, setUrlsString] = useState<string>("")
    const canBeResetBlacklistedUrls = useMemo(() => {
        return !arrayEquals(props.defaultBlacklistedUrls, props.blacklistedUrls)
    }, [props.blacklistedUrls])
    useEffect(() => {
        props.setBlacklistedUrls(
            urlsString
                .split("\n")
                .filter(l => !isBlank(l))
        )
    }, [urlsString]);
    useEffect(() => {
        setUrlsString(props.blacklistedUrls.join("\n"))
    }, [canBeResetBlacklistedUrls]);

    return <OptionItem
        title={
            <div>{browser.i18n.getMessage("config_auto_capture_links")}</div>
        }
        toggle={
            <input checked={props.value} onChange={event => props.toggle(event.target.checked)} type="checkbox"
                   className="checkbox"/>
        }
        description={
            <div className="flex flex-col">
                <div>{browser.i18n.getMessage("config_auto_capture_links_description")}</div>
                <div className="mt-2"/>
                <AutoGrowingTextarea
                    className="textarea"
                    value={fileTypesString}
                    onChange={(event) => {
                        setFileTypesString(event.target.value.toLowerCase())
                    }}
                />
                {
                    canBeResetTypes && (
                        <div
                            onClick={() => props.setFileTypes(props.defaultFileTypes)}
                            className="link">
                            {browser.i18n.getMessage("reset_to_default")}
                        </div>
                    )
                }
                <div className="mt-2"/>
                <div>{browser.i18n.getMessage("config_auto_capture_links_file_extensions_description")}</div>
                <div className="mt-3"/>
                <div>Ignored Url patterns</div>
                <div className="mt-2"/>
                <AutoGrowingTextarea
                    className="textarea"
                    value={urlsString}
                    onChange={(event) => {
                        setUrlsString(event.target.value)
                    }}
                />
                {
                    canBeResetBlacklistedUrls && (
                        <div
                            onClick={() => props.setBlacklistedUrls(props.defaultBlacklistedUrls)}
                            className="link">
                            {browser.i18n.getMessage("reset_to_default")}
                        </div>
                    )
                }
                <div className="mt-2"/>
                <div>{browser.i18n.getMessage("config_blacklisted_urls_description")}</div>
                <div className="mt-3"/>
                <div className="flex flex-col space-y-2">
                    <label>{browser.i18n.getMessage("config_capture_file_size_limit_kb")}</label>
                    <div className="flex items-center space-x-2">
                        <select
                            value={props.captureFileSizeMinimumKb}
                            onChange={(e) => props.setCaptureFileSizeMinimumKb(Number(e.target.value))}
                            className="select select-sm flex-1"
                        >
                            <option value={0}>Custom / No limit</option>
                            <option value={102400}>100 MB</option>
                            <option value={512000}>500 MB</option>
                            <option value={1048576}>1 GB</option>
                        </select>
                    </div>
                    <div className="flex items-center space-x-2">
                        <label className="text-sm">Custom value:</label>
                        <input
                            type="number"
                            min={0}
                            placeholder="Enter KB"
                            value={props.captureFileSizeMinimumKb}
                            onChange={(e) => props.setCaptureFileSizeMinimumKb(Number(e.target.value || 0))}
                            className="input input-sm w-40"
                        />
                        <span className="text-xs text-muted">KB</span>
                    </div>
                </div>
                <div className="mt-2"/>
                <div className="flex flex-col space-y-2">
                    <label>{browser.i18n.getMessage("config_bypass_shortcut")}</label>
                    <div className="flex items-center space-x-2">
                        <select
                            value={props.bypassShortcut}
                            onChange={(e) => props.setBypassShortcut(e.target.value)}
                            className="select select-sm flex-1"
                        >
                            <option value={"Control"}>Control</option>
                            <option value={"Delete"}>Delete</option>
                        </select>
                    </div>
                </div>
                <div>{browser.i18n.getMessage("config_bypass_shortcut_description")}</div>
            </div>
        }
    />
}

function PortSection(
    props: {
        port: number,
        setPort: (number: number) => void,
        onRequestTestPort: () => void,
    }
) {
    const [value, setValue] = useState(props.port)
    useEffect(() => {
        setValue(props.port)
    }, [props.port])

    function emitData() {
        const newPort = constraintIn(value, Configs.MIN_ALLOWED_PORT, Configs.MAX_ALLOWED_PORT)
        setValue(newPort)
        props.setPort(newPort)
    }

    return <OptionItem
        title={
            <div>{browser.i18n.getMessage("config_port")}</div>
        }
        toggle={
            <>
                <input
                    value={value}
                    onBlur={() => emitData()}
                    onChange={(event) => {
                        const v = event.target.value
                        const n = Number.parseInt(v)
                        if (Number.isNaN(n)) {
                            return
                        }
                        setValue(n)
                    }}
                    type="number" className="w-32 input"/>
                <button onClick={() => props.onRequestTestPort()} className="btn btn-primary normal-case">
                    {browser.i18n.getMessage("test")}
                </button>
            </>
        }
        description={
            <div>
                {browser.i18n.getMessage("config_port_description")}
            </div>
        }
    />
}

function NativeMessagingSection(
    props: {
        isNativeMessagingAvailable: boolean | null
    }
) {
    let reachableContent
    if (props.isNativeMessagingAvailable === true) {
        reachableContent = <div className="text-success font-bold">
            {browser.i18n.getMessage("config_native_messaging_host_reachable")}
        </div>
    }
    if (props.isNativeMessagingAvailable === false) {
        reachableContent = <div className="text-warning font-bold">
            {browser.i18n.getMessage("config_native_messaging_host_not_reachable")}
        </div>
    }

    return <div>
        <OptionItem
            title={
                <div>{browser.i18n.getMessage("config_native_messaging_host")}</div>
            }
            toggle={reachableContent}
            description={
                <div>
                    {browser.i18n.getMessage("config_native_messaging_host_description")}
                </div>
            }
        />
    </div>
}

function SendCookiesSection(
    props: {
        enabled: boolean,
        toggle: (v: boolean) => void
    }
) {
    return <OptionItem
        title={
            <div>{browser.i18n.getMessage("config_send_cookies")}</div>
        }
        toggle={
            <input checked={props.enabled} onChange={e => props.toggle(e.target.checked)} type="checkbox"
                   className="checkbox"/>
        }
        description={
            <div>
                {browser.i18n.getMessage("config_send_cookies_descrption")}
            </div>
        }
    />
}

run(async () => {
    await Configs.boot()
    const vm = new ToolsViewModel(Configs.getLatestConfig())
    const container = document.getElementById("app")!
    ReactDom.render(
        <App vm={vm}/>,
        container,
    )
})
