import browser from "webextension-polyfill";
import {run} from "~/utils/ScopeFunctions";
import {EventListener} from "~/base/EventListener";
import Constants from "~/utils/Constants";
import {z} from "~/utils/Zod";
import {lazy} from "~/utils/Lazy";
import {isMac} from "~/utils/platform/Platform";

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
    bypassShortcut: z.string().catch(() => {
        if (isMac()) {
            return "Backspace"
        }
        return "Delete"
    }),
    apiKey: z.string().catch(""),
})

export type Config = z.infer<typeof ConfigType>
export const configKeys: ReadonlyArray<keyof Config> = ConfigType.keyof().options
export const CONFIG_STORAGE_SCHEMA_VERSION = 2
export const CONFIG_STORAGE_SCHEMA_KEY = "__abdmConfigSchemaVersion"
export const CONFIG_MIGRATION_HISTORY_KEY = "__abdmConfigMigrationHistory"

export interface ConfigMigrationResult {
    records: Record<string, unknown>
    writes: Record<string, unknown>
    applied: string[]
}

export function migrateConfigRecords(input: Record<string, unknown>): ConfigMigrationResult {
    const records = {...input}
    const writes: Record<string, unknown> = {}
    const applied: string[] = []
    let version = typeof records[CONFIG_STORAGE_SCHEMA_KEY] === "number"
        ? Math.trunc(records[CONFIG_STORAGE_SCHEMA_KEY] as number)
        : 0
    if (version < 1) {
        if (records.sendHeaders === undefined && typeof records.sendCookies === "boolean") {
            records.sendHeaders = records.sendCookies
            writes.sendHeaders = records.sendCookies
        }
        if (typeof records.registeredFileTypes === "string") {
            const value = records.registeredFileTypes.split(/[\s,]+/).map(item => item.replace(/^\./, "").toLowerCase()).filter(Boolean)
            records.registeredFileTypes = value
            writes.registeredFileTypes = value
        }
        applied.push("v0-to-v1-normalize-legacy-keys")
        version = 1
    }
    if (version < 2) {
        // v2 keeps legacy transport settings for the one-release compatibility bridge;
        // authoritative capture behavior is negotiated from desktop policy.
        applied.push("v1-to-v2-authoritative-policy-bridge")
        version = 2
    }
    if (version !== CONFIG_STORAGE_SCHEMA_VERSION) {
        throw new Error(`Unsupported future config schema ${version}`)
    }
    records[CONFIG_STORAGE_SCHEMA_KEY] = version
    if (input[CONFIG_STORAGE_SCHEMA_KEY] !== version) writes[CONFIG_STORAGE_SCHEMA_KEY] = version
    if (applied.length) {
        const previous = Array.isArray(input[CONFIG_MIGRATION_HISTORY_KEY])
            ? (input[CONFIG_MIGRATION_HISTORY_KEY] as unknown[]).filter(value => typeof value === "string").slice(-30)
            : []
        writes[CONFIG_MIGRATION_HISTORY_KEY] = [...previous, ...applied].slice(-32)
    }
    return {records, writes, applied}
}

const _defaultConfig = lazy(() => {
    return ConfigType.parse({})
})

export function getDefaultConfig() {
    return _defaultConfig.get()
}

async function getConfigsFromStorageOrDefault(): Promise<Config> {
    try {
        const raw = await browser.storage.local.get([
            ...configKeys,
            CONFIG_STORAGE_SCHEMA_KEY,
            CONFIG_MIGRATION_HISTORY_KEY,
            "sendCookies",
        ]) as Record<string, unknown>
        const migration = migrateConfigRecords(raw)
        if (Object.keys(migration.writes).length) await browser.storage.local.set(migration.writes)
        return ConfigType.parse(migration.records);
    } catch (e) {
        console.error("fail to parse config from the browser storage", e)
        return getDefaultConfig();
    }
}
