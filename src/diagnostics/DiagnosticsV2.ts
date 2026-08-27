import browser from "webextension-polyfill"

export interface SafeDiagnosticV2 {
    code: string
    severity: "INFO" | "WARNING" | "ERROR"
    recovery: "RETRY_CONNECTION" | "OPEN_SETTINGS" | "UPDATE_DESKTOP" | "GRANT_PERMISSIONS" | "NONE"
    createdAtEpochMs: number
}

const STORAGE_KEY = "safe-diagnostics-v2"
const SEVERITIES = new Set<SafeDiagnosticV2["severity"]>(["INFO", "WARNING", "ERROR"])
const RECOVERIES = new Set<SafeDiagnosticV2["recovery"]>([
    "RETRY_CONNECTION",
    "OPEN_SETTINGS",
    "UPDATE_DESKTOP",
    "GRANT_PERMISSIONS",
    "NONE",
])

export async function reportSafeDiagnosticV2(
    code: string,
    severity: SafeDiagnosticV2["severity"],
    recovery: SafeDiagnosticV2["recovery"],
): Promise<void> {
    if (!/^[A-Z0-9_]{1,64}$/.test(code)) return
    const current = await listSafeDiagnosticsV2()
    const entry: SafeDiagnosticV2 = {code, severity, recovery, createdAtEpochMs: Date.now()}
    const next = [entry, ...current.filter(value => value.code !== code)].slice(0, 50)
    await browser.storage.local.set({[STORAGE_KEY]: next})
}

export async function listSafeDiagnosticsV2(): Promise<SafeDiagnosticV2[]> {
    const value = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY]
    if (!Array.isArray(value)) return []
    return value.slice(0, 50).filter(isSafeDiagnosticV2)
}

export async function clearSafeDiagnosticsV2(): Promise<void> {
    await browser.storage.local.remove(STORAGE_KEY)
}

function isSafeDiagnosticV2(value: unknown): value is SafeDiagnosticV2 {
    if (typeof value !== "object" || value === null) return false
    const item = value as Partial<SafeDiagnosticV2>
    return typeof item.code === "string" && /^[A-Z0-9_]{1,64}$/.test(item.code) &&
        typeof item.createdAtEpochMs === "number" && Number.isFinite(item.createdAtEpochMs) &&
        SEVERITIES.has(item.severity as SafeDiagnosticV2["severity"]) &&
        RECOVERIES.has(item.recovery as SafeDiagnosticV2["recovery"])
}
