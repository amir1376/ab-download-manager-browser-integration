import browser from "webextension-polyfill";
import {run} from "~/utils/ScopeFunctions";
import {EventListener} from "~/base/EventListener";
import Constants from "~/utils/Constants";
import {z} from "~/utils/Zod";

let _currentConfig: Config | null = null

export const onChanged = new EventListener<Config>()

function setCurrentConfig(config: Config) {
    const parsedConfig: Config = ConfigType.parse(config);
    _currentConfig = parsedConfig
    onChanged.onEvent(parsedConfig)
}

export async function setConfigItem<K extends keyof Config>(key: K, value: Config[K]) {
    await browser.storage.local.set({[key]: value})
}


export async function boot() {
    if (_currentConfig === null) {
        setCurrentConfig(await getConfigsFromStorageOrDefault())
        browser.storage.local.onChanged.addListener(() => {
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

export const MIN_ALLOWED_PORT = 1024
export const MAX_ALLOWED_PORT = 65535

/**
 * ensure all keys have a catch block
 * otherwise the parse may fail!
 */
const ConfigType = z.object({
    autoCaptureLinks: z.boolean().catch(true),
    popupEnabled: z.boolean().catch(true),
    port: z.int()
        .min(MIN_ALLOWED_PORT)
        .max(MAX_ALLOWED_PORT)
        .catch(Constants.defaultPort),
    sendHeaders: z.boolean().catch(true),
    registeredFileTypes: z.array(z.string()).catch(
        [
            "zip", "rar", "7z", "iso", "tar", "gz",
            "exe", "msi", "deb", "jar", "apk", "bin",
            "mp3", "aac",
            "pdf",
            "mp4", "3gp", "avi", "mkv", "wav", "mpeg",
            "srt",
        ]
    ),
    allowPassDownloadIfAppNotRespond: z.boolean().catch(true),
    closeNewTabIfItWasCaptured: z.boolean().catch(true),
    silentAddDownload: z.boolean().catch(false),
    silentStartDownload: z.boolean().catch(false),
    blacklistedUrls: z.array(z.string()).catch([]),
    // minimum file size to capture in kilobytes. 0 = no minimum (capture all sizes)
    captureFileSizeMinimumKb: z.int().catch(0),
    bypassShortcut: z.string().catch("Delete"),
    apiKey: z.string().catch(""),
})

export type Config = z.infer<typeof ConfigType>
export const configKeys: ReadonlyArray<keyof Config> = ConfigType.keyof().options
export const defaultConfig: Config = ConfigType.parse({})

async function getConfigsFromStorageOrDefault(): Promise<Config> {
    try {
        const records = await browser.storage.local.get([...configKeys]);
        return ConfigType.parse(records);
    } catch (e) {
        console.error("fail to parse config from the browser storage", e)
        return ConfigType.parse({});
    }
}
