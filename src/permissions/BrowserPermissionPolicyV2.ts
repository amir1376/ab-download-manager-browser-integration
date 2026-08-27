import browser from "webextension-polyfill"
import * as Backend from "~/backend/Backend"
import {configureAutomaticTakeoverV2} from "~/linkgrabber/LinkGrabber"
import {isChrome} from "~/utils/ExtensionInfo"
import {setPermissionRuntimeStateV2} from "./PermissionRuntimeStateV2"

const CONTENT_SCRIPT_ID = "abdm-parity-v2-content"
const CONTENT_SCRIPT_FILE = "src/entrypoint/ContentScript.js"
const ALL_ORIGINS = ["http://*/*", "https://*/*"]
const FULL_PERMISSIONS = ["webRequest", "cookies", "tabs"]
const STATUS_KEY = "browser-permission-status-v2"

export interface BrowserPermissionStatusV2 {
    policyRevision: number | null
    mode: "OFF" | "STANDARD" | "FULL" | "UNAVAILABLE"
    fullAuthority: boolean
    privateAllowed: boolean
    grantedOrigins: string[]
    contentScriptOrigins: string[]
    automaticCaptureActive: boolean
    missingPermissions: string[]
}

let firefoxRegistration: {unregister(): Promise<void>} | null = null
let currentStatus: BrowserPermissionStatusV2 = unavailableStatus()
let reconcilePromise: Promise<BrowserPermissionStatusV2> | null = null
let currentContentOrigins: string[] = []

export async function bootBrowserPermissionPolicyV2(): Promise<BrowserPermissionStatusV2> {
    Backend.addBrowserPolicyListener(() => void reconcileBrowserPermissionPolicyV2())
    browser.permissions.onAdded.addListener(() => void reconcileBrowserPermissionPolicyV2())
    browser.permissions.onRemoved.addListener(() => void reconcileBrowserPermissionPolicyV2())
    return await reconcileBrowserPermissionPolicyV2()
}

export function getBrowserPermissionStatusV2(): BrowserPermissionStatusV2 {
    return currentStatus
}

export async function reconcileBrowserPermissionPolicyV2(): Promise<BrowserPermissionStatusV2> {
    if (reconcilePromise !== null) return reconcilePromise
    reconcilePromise = applyPolicy().finally(() => { reconcilePromise = null })
    return reconcilePromise
}

async function applyPolicy(): Promise<BrowserPermissionStatusV2> {
    const policy = Backend.getBrowserPolicyV2()
    const granted = await browser.permissions.getAll()
    const grantedOrigins = normalizeOrigins(granted.origins ?? [])
    const missingPermissions = requiredFullPermissions().filter(value => !(granted.permissions ?? []).includes(value))
    const fullOrigins = ALL_ORIGINS.every(origin => grantedOrigins.includes(origin))
    const fullAuthority = fullOrigins && missingPermissions.length === 0
    const privateAllowed = await isPrivateAllowed()
    const contentScriptOrigins = policy?.mode === "OFF" ? [] : policy?.mode === "FULL" && fullAuthority
        ? ALL_ORIGINS
        : grantedOrigins.filter(isHttpOrigin)
    await reconcileContentScripts(contentScriptOrigins)
    const automaticCaptureActive = Boolean(
        policy?.mode === "FULL" && fullAuthority &&
        (policy.automaticInterception || policy.forceShortcut),
    )
    configureAutomaticTakeoverV2(automaticCaptureActive)
    setPermissionRuntimeStateV2({fullAuthority, privateAllowed, grantedOrigins})
    currentStatus = {
        policyRevision: policy?.revision ?? null,
        mode: policy?.mode ?? "UNAVAILABLE",
        fullAuthority,
        privateAllowed,
        grantedOrigins,
        contentScriptOrigins,
        automaticCaptureActive,
        missingPermissions,
    }
    await browser.storage.local.set({[STATUS_KEY]: currentStatus})
    return currentStatus
}

export async function requestFullBrowserPermissionsV2(): Promise<boolean> {
    const granted = await browser.permissions.request({
        origins: ALL_ORIGINS,
        permissions: requiredFullPermissions() as never[],
    })
    return granted
}

export async function removeFullBrowserPermissionsV2(): Promise<boolean> {
    const removed = await browser.permissions.remove({
        origins: ALL_ORIGINS,
        permissions: requiredFullPermissions() as never[],
    })
    return removed
}

export async function requestSiteBrowserPermissionV2(value: string): Promise<boolean> {
    const origin = sitePattern(value)
    const granted = await browser.permissions.request({
        origins: [origin],
        permissions: isChrome() ? ["scripting"] as never[] : [],
    })
    return granted
}

export async function removeSiteBrowserPermissionV2(value: string): Promise<boolean> {
    const removed = await browser.permissions.remove({origins: [sitePattern(value)]})
    return removed
}

function requiredFullPermissions(): string[] {
    return isChrome() ? [...FULL_PERMISSIONS, "scripting"] : FULL_PERMISSIONS
}

async function reconcileContentScripts(origins: string[]): Promise<void> {
    if (isChrome()) {
        const scripting = (browser as unknown as {
            scripting?: {
                getRegisteredContentScripts(filter?: {ids?: string[]}): Promise<Array<{id: string; matches?: string[]}>>
                unregisterContentScripts(filter?: {ids?: string[]}): Promise<void>
                registerContentScripts(scripts: Array<{id: string; matches: string[]; js: string[]; persistAcrossSessions: boolean; runAt: string; allFrames: boolean}>): Promise<void>
            }
        }).scripting
        if (!scripting) return
        const existing = await scripting.getRegisteredContentScripts({ids: [CONTENT_SCRIPT_ID]})
        const existingOrigins = normalizeOrigins(existing[0]?.matches ?? [])
        if (arraysEqual(existingOrigins, origins)) {
            currentContentOrigins = [...origins]
            return
        }
        await disableExistingContentScripts()
        if (existing.length) await scripting.unregisterContentScripts({ids: [CONTENT_SCRIPT_ID]})
        if (origins.length) await scripting.registerContentScripts([{
            id: CONTENT_SCRIPT_ID,
            matches: origins,
            js: [CONTENT_SCRIPT_FILE],
            persistAcrossSessions: true,
            runAt: "document_idle",
            allFrames: true,
        }])
        currentContentOrigins = [...origins]
        await replayOpenTabs()
        return
    }
    if (arraysEqual(currentContentOrigins, origins)) return
    await disableExistingContentScripts()
    await firefoxRegistration?.unregister().catch(() => undefined)
    firefoxRegistration = null
    if (!origins.length) {
        currentContentOrigins = []
        return
    }
    const contentScripts = (browser as unknown as {
        contentScripts?: {register(options: {matches: string[]; js: Array<{file: string}>; allFrames: boolean; runAt: string}): Promise<{unregister(): Promise<void>}>}
    }).contentScripts
    if (contentScripts) firefoxRegistration = await contentScripts.register({
        matches: origins,
        js: [{file: CONTENT_SCRIPT_FILE}],
        allFrames: true,
        runAt: "document_idle",
    })
    currentContentOrigins = [...origins]
    await replayOpenTabs()
}

async function isPrivateAllowed(): Promise<boolean> {
    try {
        const extension = browser.extension as unknown as {isAllowedIncognitoAccess?: () => Promise<boolean>}
        return extension.isAllowedIncognitoAccess ? await extension.isAllowedIncognitoAccess() : false
    } catch {
        return false
    }
}

async function replayOpenTabs(): Promise<void> {
    const tabs = await browser.tabs.query({})
    const tabIds = tabs.filter(tab => tab.id !== undefined).map(tab => tab.id!)
    if (isChrome()) {
        const scripting = (browser as unknown as {
            scripting?: {executeScript(options: {target: {tabId: number; allFrames: boolean}; files: string[]}): Promise<unknown>}
        }).scripting
        if (!scripting) return
        for (const tabId of tabIds) {
            await scripting.executeScript({target: {tabId, allFrames: true}, files: [CONTENT_SCRIPT_FILE]}).catch(() => undefined)
        }
        return
    }
    const tabsApi = browser.tabs as unknown as {executeScript?: (tabId: number, details: {file: string; allFrames: boolean; runAt: string}) => Promise<unknown>}
    if (!tabsApi.executeScript) return
    for (const tabId of tabIds) {
        await tabsApi.executeScript(tabId, {file: CONTENT_SCRIPT_FILE, allFrames: true, runAt: "document_idle"}).catch(() => undefined)
    }
}

async function disableExistingContentScripts(): Promise<void> {
    const tabs = await browser.tabs.query({})
    await Promise.all(tabs.filter(tab => tab.id !== undefined).map(tab =>
        browser.tabs.sendMessage(tab.id!, {action: "disableBrowserIntegrationV2"}).catch(() => undefined)
    ))
}

function sitePattern(value: string): string {
    const url = new URL(value.includes("://") ? value : `https://${value}`)
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS sites are supported")
    return `${url.protocol}//${url.host}/*`
}

function normalizeOrigins(values: string[]): string[] {
    return [...new Set(values.filter(isHttpOrigin))].sort()
}

function isHttpOrigin(value: string): boolean {
    return value.startsWith("http://") || value.startsWith("https://")
}

function arraysEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index])
}

function unavailableStatus(): BrowserPermissionStatusV2 {
    return {
        policyRevision: null,
        mode: "UNAVAILABLE",
        fullAuthority: false,
        privateAllowed: false,
        grantedOrigins: [],
        contentScriptOrigins: [],
        automaticCaptureActive: false,
        missingPermissions: requiredFullPermissions(),
    }
}
