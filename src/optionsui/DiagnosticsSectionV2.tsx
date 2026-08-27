import React, {useEffect, useState} from "react"
import {sendMessage} from "webext-bridge/options"
import {DefinedCommands} from "~/message/Commands"
import type {SafeDiagnosticV2} from "~/diagnostics/DiagnosticsV2"
import {t} from "~/i18n/t"

export function DiagnosticsSectionV2() {
    const [entries, setEntries] = useState<SafeDiagnosticV2[]>([])
    const refresh = () => sendMessage(DefinedCommands.GET_SAFE_DIAGNOSTICS_V2, null, "background")
        .then(value => setEntries(value as unknown as SafeDiagnosticV2[]))
    useEffect(() => { void refresh() }, [])
    return <section aria-labelledby="diagnostics-title" className="space-y-2">
        <h2 id="diagnostics-title" className="font-semibold">{t("diagnostics_title", "Integration diagnostics")}</h2>
        {entries.length === 0 ? <div className="text-sm opacity-75">{t("diagnostics_empty", "No recent integration problems.")}</div> :
            <ul className="space-y-1">{entries.map(entry => <li key={entry.code} className="text-sm">
                <span className={entry.severity === "ERROR" ? "text-error" : "text-warning"}>{diagnosticMessage(entry.code)}</span>
                <span className="block text-xs opacity-75">{recoveryMessage(entry.recovery)}</span>
            </li>)}</ul>}
        <div className="flex gap-2">
            <button className="btn btn-sm" onClick={() => void sendMessage(DefinedCommands.TEST_NATIVE_MESSAGING, undefined, "background").then(refresh)}>{t("diagnostics_retry", "Retry connection")}</button>
            <button className="btn btn-sm" disabled={!entries.length} onClick={() => void sendMessage(DefinedCommands.CLEAR_SAFE_DIAGNOSTICS_V2, null, "background").then(refresh)}>{t("diagnostics_clear", "Clear")}</button>
        </div>
    </section>
}

function diagnosticMessage(code: string): string {
    const known: Record<string, string> = {
        NATIVE_DISCONNECTED: t("diagnostic_native_disconnected", "The native connection was interrupted."),
        DESKTOP_PROTOCOL_LEGACY: t("diagnostic_desktop_legacy", "The desktop integration protocol is older than the extension."),
        NATIVE_UNAVAILABLE: t("diagnostic_native_unavailable", "The native desktop host is unavailable."),
        BATCH_REVIEW_PREPARE_FAILED: t("diagnostic_batch_failed", "A browser link review could not be prepared."),
    }
    return known[code] ?? t("diagnostic_unknown", "Integration problem: $1", code)
}

function recoveryMessage(recovery: SafeDiagnosticV2["recovery"]): string {
    const values: Record<SafeDiagnosticV2["recovery"], string> = {
        RETRY_CONNECTION: t("recovery_retry", "Retry the connection; if it still fails, restart or reinstall the desktop integration."),
        OPEN_SETTINGS: t("recovery_open_settings", "Review browser-integration settings and permissions."),
        UPDATE_DESKTOP: t("recovery_update_desktop", "Update AB Download Manager and reinstall its browser integration."),
        GRANT_PERMISSIONS: t("recovery_grant_permissions", "Grant the requested browser permissions."),
        NONE: "",
    }
    return values[recovery]
}
