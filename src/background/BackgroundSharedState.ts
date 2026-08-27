import browser from "webextension-polyfill"

interface ModifierStateV2 {key: string; expiresAtEpochMs: number}
interface StoredSessionStateV2 {modifiers: Record<string, ModifierStateV2>; bypassTabs: number[]}

const STORAGE_KEY = "browser-session-policy-v2"
const MODIFIER_TTL_MS = 30_000
const modifiers = new Map<number, ModifierStateV2>()
const bypassTabs = new Set<number>()
let booted = false

export async function boot(): Promise<void> {
    if (booted) return
    booted = true
    const storage = sessionStorage()
    if (storage) {
        const value = (await storage.get(STORAGE_KEY))[STORAGE_KEY] as Partial<StoredSessionStateV2> | undefined
        const now = Date.now()
        for (const [tab, state] of Object.entries(value?.modifiers ?? {})) {
            if (state && typeof state.key === "string" && state.expiresAtEpochMs > now) modifiers.set(Number(tab), state)
        }
        for (const tabId of value?.bypassTabs ?? []) if (Number.isInteger(tabId)) bypassTabs.add(tabId)
    }
    browser.tabs.onRemoved.addListener(tabId => {
        modifiers.delete(tabId)
        bypassTabs.delete(tabId)
        void persist()
    })
}

export async function setHoldingKey(tabId: number, key: string, pressed: boolean): Promise<void> {
    if (tabId < 0) return
    if (pressed && key) modifiers.set(tabId, {key, expiresAtEpochMs: Date.now() + MODIFIER_TTL_MS})
    else modifiers.delete(tabId)
    await persist()
}

export function isShortcutPressed(tabId: number, shortcut: string | null | undefined): boolean {
    if (!shortcut) return false
    const state = modifiers.get(tabId)
    if (!state) return false
    if (state.expiresAtEpochMs <= Date.now()) {
        modifiers.delete(tabId)
        void persist()
        return false
    }
    return state.key === shortcut
}

export async function setTabBypass(tabId: number, bypassed: boolean): Promise<void> {
    if (bypassed) bypassTabs.add(tabId)
    else bypassTabs.delete(tabId)
    await persist()
}

export function isTabBypassed(tabId: number): boolean {
    return bypassTabs.has(tabId)
}

/** Legacy automatic interception is disabled in v2 compatibility mode. */
export function isBypassShortcutPressed(): boolean {
    return false
}

export function clear(): void {
    modifiers.clear()
}

async function persist(): Promise<void> {
    const storage = sessionStorage()
    if (!storage) return
    const state: StoredSessionStateV2 = {
        modifiers: Object.fromEntries(modifiers),
        bypassTabs: [...bypassTabs],
    }
    await storage.set({[STORAGE_KEY]: state})
}

function sessionStorage(): typeof browser.storage.local | null {
    return (browser.storage as unknown as {session?: typeof browser.storage.local}).session ?? null
}
