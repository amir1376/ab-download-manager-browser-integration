import React, {useEffect, useState} from "react"
import browser from "webextension-polyfill"
import {sendMessage} from "webext-bridge/options"
import {DefinedCommands} from "~/message/Commands"
import type {BrowserIntegrationPolicyV2} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import {isChrome} from "~/utils/ExtensionInfo"

interface PermissionStatus {
    mode: "OFF" | "STANDARD" | "FULL" | "UNAVAILABLE"
    fullAuthority: boolean
    privateAllowed: boolean
    grantedOrigins: string[]
    automaticCaptureActive: boolean
    missingPermissions: string[]
}

interface PolicyStatus {policy: BrowserIntegrationPolicyV2 | null; permissions: PermissionStatus}

const ALL_ORIGINS = ["http://*/*", "https://*/*"]

export function BrowserIntegrationPolicySectionV2() {
    const [status, setStatus] = useState<PolicyStatus | null>(null)
    const [site, setSite] = useState("")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const refresh = async () => {
        setStatus(await sendMessage(DefinedCommands.GET_BROWSER_POLICY_STATUS_V2, null, "background") as unknown as PolicyStatus)
    }
    useEffect(() => { void refresh() }, [])

    const update = async (change: Partial<BrowserIntegrationPolicyV2>) => {
        if (!status?.policy) return
        setBusy(true); setError(null)
        try {
            const next = {...status.policy, ...change}
            setStatus(await sendMessage(DefinedCommands.UPDATE_BROWSER_POLICY_V2, next, "background") as unknown as PolicyStatus)
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Policy update failed")
            await refresh()
        } finally { setBusy(false) }
    }

    const changeMode = async (mode: BrowserIntegrationPolicyV2["mode"]) => {
        if (!status?.policy) return
        if (mode === "FULL" && !status.permissions.fullAuthority) {
            const granted = await browser.permissions.request({
                origins: ALL_ORIGINS,
                permissions: isChrome()
                    ? ["webRequest", "cookies", "tabs", "scripting"] as never[]
                    : ["webRequest", "cookies", "tabs"] as never[],
            })
            if (!granted) { setError("Full browser authority was not granted; STANDARD mode remains active."); return }
            await sendMessage(DefinedCommands.RECONCILE_BROWSER_PERMISSIONS_V2, null, "background")
        }
        await update(mode === "FULL" ? {mode, automaticInterception: true} : {
            mode,
            automaticInterception: false,
            advancedMediaInspection: false,
            privateBrowsing: false,
            sendProtectedContext: false,
        })
    }

    const requestSite = async () => {
        try {
            const url = new URL(site.includes("://") ? site : `https://${site}`)
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP and HTTPS sites are supported")
            await browser.permissions.request({
                origins: [`${url.protocol}//${url.host}/*`],
                permissions: isChrome() ? ["scripting"] as never[] : [],
            })
            setStatus(await sendMessage(DefinedCommands.RECONCILE_BROWSER_PERMISSIONS_V2, null, "background") as unknown as PolicyStatus)
            setSite("")
        } catch (failure) { setError(failure instanceof Error ? failure.message : "Site permission failed") }
    }

    if (!status?.policy) return <div className="p-4">Desktop browser policy is unavailable; capture remains disabled.</div>
    const policy = status.policy
    const full = policy.mode === "FULL"
    return <div className="p-4 flex flex-col space-y-3 border-b border-base-content/20">
        <div className="font-semibold">Browser integration privacy and permissions</div>
        <div className="text-sm opacity-80">STANDARD grants only explicit, per-site actions. FULL is required for automatic interception, protected request context, advanced inspection, or private windows.</div>
        <label className="flex items-center justify-between gap-2">
            <span>Integration mode</span>
            <select disabled={busy} value={policy.mode} onChange={event => void changeMode(event.target.value as BrowserIntegrationPolicyV2["mode"])} className="select select-sm">
                <option value="OFF">Off</option><option value="STANDARD">Standard</option><option value="FULL">Full</option>
            </select>
        </label>
        {full && <>
            <PolicyToggle label="Automatic interception" value={policy.automaticInterception} set={value => void update({automaticInterception: value})}/>
            <PolicyToggle label="Send protected headers, cookies, bodies, referrers, and proxy context" value={policy.sendProtectedContext} set={value => void update({sendProtectedContext: value})}/>
            <PolicyToggle label="Advanced media inspection" value={policy.advancedMediaInspection} set={value => void update({advancedMediaInspection: value})}/>
            <PolicyToggle label="Private/incognito capture" value={policy.privateBrowsing} set={value => void update({privateBrowsing: value})}/>
            <div className="text-xs opacity-80">Browser private access: {status.permissions.privateAllowed ? "allowed" : "not allowed; enable it on the browser extension details page"}</div>
        </>}
        <div className="text-xs">Full authority: {status.permissions.fullAuthority ? "granted" : `not granted (${status.permissions.missingPermissions.join(", ") || "site access missing"})`}; automatic capture: {status.permissions.automaticCaptureActive ? "active" : "inactive"}</div>
        <div className="flex gap-2">
            <input className="input input-sm flex-1" value={site} onChange={event => setSite(event.target.value)} placeholder="example.com"/>
            <button className="btn btn-sm" disabled={!site || busy} onClick={() => void requestSite()}>Grant site</button>
        </div>
        <div className="text-xs break-all">Granted sites: {status.permissions.grantedOrigins.join(", ") || "none"}</div>
        <TextPolicyField label="Captured extensions" value={policy.registeredFileTypes.join(" ")} commit={value => void update({registeredFileTypes: value.toLowerCase().split(/\s+/).filter(Boolean)})}/>
        <TextPolicyField label="Captured MIME types" value={policy.registeredMimeTypes.join("\n")} commit={value => void update({registeredMimeTypes: value.toLowerCase().split(/\s+/).filter(Boolean)})}/>
        <TextPolicyField label="Excluded full-address patterns" value={policy.excludedUrls.join("\n")} commit={value => void update({excludedUrls: value.split("\n").map(item => item.trim()).filter(Boolean)})}/>
        <TextPolicyField
            label="Custom menu actions (id | title | scope | source kinds)"
            value={(policy.customMenuActions ?? []).map(action => `${action.id} | ${action.title} | ${action.scope} | ${action.sourceKinds.join(',')}`).join('\n')}
            commit={value => void update({customMenuActions: value.split('\n').map(line => line.split('|').map(part => part.trim())).filter(parts => parts.length >= 3 && parts[0] && parts[1]).map(parts => ({
                id: parts[0], title: parts[1], scope: parts[2].toUpperCase() as "SELECTED" | "ALL" | "PAGE" | "FRAME" | "CUSTOM",
                sourceKinds: (parts[3] ?? '').split(',').map(kind => kind.trim().toUpperCase()).filter(Boolean) as never[],
            }))})}
        />
        <TextPolicyField
            label="Media site adapters (id | host | URL regex | selectors ; separated | attributes)"
            value={(policy.mediaSiteAdapters ?? []).map(adapter => `${adapter.id} | ${adapter.hostPattern} | ${adapter.urlRegex ?? ''} | ${adapter.selectors.join(';')} | ${adapter.attributes.join(',')}`).join('\n')}
            commit={value => void update({mediaSiteAdapters: value.split('\n').map(line => line.split('|').map(part => part.trim())).filter(parts => parts.length >= 4 && parts[0] && parts[1]).map(parts => ({
                id: parts[0], hostPattern: parts[1], urlRegex: parts[2] || null,
                selectors: parts[3].split(';').map(selector => selector.trim()).filter(Boolean),
                attributes: (parts[4] || 'src,href,content').split(',').map(attribute => attribute.trim()).filter(Boolean),
            }))})}
        />
        <div className="grid grid-cols-2 gap-2">
            <ShortcutPolicyField label="Force key" value={policy.forceShortcut ?? ""} commit={value => void update({forceShortcut: value || null})}/>
            <ShortcutPolicyField label="Bypass key" value={policy.bypassShortcut ?? ""} commit={value => void update({bypassShortcut: value || null})}/>
        </div>
        {error && <div role="alert" className="text-error text-sm">{error}</div>}
    </div>
}

function PolicyToggle(props: {label: string; value: boolean; set(value: boolean): void}) {
    return <label className="flex items-center justify-between gap-2"><span>{props.label}</span><input type="checkbox" className="checkbox" checked={props.value} onChange={event => props.set(event.target.checked)}/></label>
}

function TextPolicyField(props: {label: string; value: string; commit(value: string): void}) {
    const [value, setValue] = useState(props.value)
    useEffect(() => setValue(props.value), [props.value])
    return <label className="text-sm">{props.label}<textarea className="textarea w-full" value={value} onChange={event => setValue(event.target.value)} onBlur={() => props.commit(value)}/></label>
}

function ShortcutPolicyField(props: {label: string; value: string; commit(value: string): void}) {
    const [value, setValue] = useState(props.value)
    useEffect(() => setValue(props.value), [props.value])
    return <label className="text-sm">{props.label}<input className="input input-sm w-full" value={value} onChange={event => setValue(event.target.value)} onBlur={() => props.commit(value)}/></label>
}
