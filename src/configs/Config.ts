import browser from "webextension-polyfill";
import {run} from "~/utils/ScopeFunctions";
import {EventListener} from "~/base/EventListener";
import Constants from "~/utils/Constants";
import {Key} from "react";

let _currentConfig: Config | null = null

export const onChanged = new EventListener<Config>()

function setCurrentConfig(config: Config) {
    _currentConfig = config
    onChanged.onEvent(config)
}

export async function setConfigItem<K extends keyof Config>(key: K, value: Config[K]) {
    await browser.storage.local.set({[key]: value})
}


export async function boot() {
    if (_currentConfig === null) {
        setCurrentConfig(await getConfigsFromStorageOrDefault())
        browser.storage.local.onChanged.addListener((changes) => {
            run(async () => {
                setCurrentConfig(await getConfigsFromStorageOrDefault())
            })
        })
        return true
    }
    return false
}

export function getLatestConfig() {
    if (_currentConfig == null) {
        throw new Error("Please first call boot config")
    }
    return _currentConfig
}

export const defaultConfig: Config = {
    autoCaptureLinks: true,
    popupEnabled: true,
    sendHeaders: true,
    port: Constants.defaultPort,
    registeredFileTypes: [
        "zip", "rar", "7z", "iso", "tar", "gz",
        "exe", "msi", "deb", "jar", "apk", "bin",
        "mp3", "aac",
        "pdf",
        "mp4", "3gp", "avi", "mkv", "wav", "mpeg",
        "srt",
    ],
    blacklistedUrls: [],
    allowPassDownloadIfAppNotRespond: true,
    closeNewTabIfItWasCaptured: true,
    silentAddDownload: false,
    silentStartDownload: false,
}

export const configKeys: ReadonlyArray<keyof Config> = Object.keys(defaultConfig) as any


export async function getConfigsFromStorageOrDefault(): Promise<Config> {
    const records = await browser.storage.local.get(
        [...configKeys]
    );
    return {
        ...defaultConfig,
        ...records,
    }
}


export interface Config {
    autoCaptureLinks: boolean,
    popupEnabled: boolean
    port: number
    sendHeaders: boolean
    registeredFileTypes: string[]
    allowPassDownloadIfAppNotRespond: boolean
    closeNewTabIfItWasCaptured: boolean
    silentAddDownload: boolean
    silentStartDownload: boolean
    blacklistedUrls: string[]
}

export const MIN_ALLOWED_PORT = 1024
export const MAX_ALLOWED_PORT = 65535
