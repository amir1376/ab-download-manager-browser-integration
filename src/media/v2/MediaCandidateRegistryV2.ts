import browser, {Runtime, WebRequest} from "webextension-polyfill"
import * as Backend from "~/backend/Backend"
import {installPageMediaInstrumentationV2} from "./PageMediaInstrumentationV2"
import {isChrome} from "~/utils/ExtensionInfo"

export type MediaTransportV2 = "PROGRESSIVE" | "HLS" | "DASH"
export type MediaDiscoverySourceV2 = "DOM" | "NETWORK" | "FETCH" | "XHR" | "PERFORMANCE" | "BLOB" | "ADAPTER"

export interface MediaDiscoveryEventV2 {
    generation: number
    source: MediaDiscoverySourceV2
    url: string
    networkSourceUrl?: string | null
    transport: MediaTransportV2
    elementKey?: string | null
    title?: string | null
    mimeType?: string | null
    width?: number | null
    height?: number | null
    duration?: number | null
    codecs?: string[]
    tracks?: Array<{role: "VIDEO" | "AUDIO" | "SUBTITLE"; language?: string | null; codec?: string | null}>
    protectedMedia?: boolean
}

export interface MediaPanelCandidateV2 extends MediaDiscoveryEventV2 {
    candidateId: string
    tabId: number
    frameId: number
    firstSeenEpochMs: number
    lastSeenEpochMs: number
}

interface TabMediaStateV2 {generation: number; candidates: Map<string, MediaPanelCandidateV2>}
interface StoredMediaSnapshotV2 {schemaVersion: 2; candidates: MediaPanelCandidateV2[]}

export class MediaCandidateRegistryV2 {
    private readonly tabs = new Map<number, TabMediaStateV2>()
    private readonly rates = new Map<string, {windowStart: number; count: number}>()
    private booted = false

    async boot(): Promise<void> {
        if (this.booted) return
        this.booted = true
        await this.restore()
        browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
            const action = (message as {action?: unknown})?.action
            if (action === "getMediaDiscoveryPolicyV2") {
                const policy = Backend.getBrowserPolicyV2()
                return Promise.resolve({
                    enabled: policy?.mode === "FULL" && policy.advancedMediaInspection && Backend.isFeatureAvailableV2("advancedMediaDiscovery"),
                    adapters: policy?.mediaSiteAdapters ?? [],
                })
            }
            if (action === "registerPageMediaInstrumentationV2") {
                const tabId = sender.tab?.id ?? -1
                const frameId = sender.frameId ?? 0
                const data = message as {generation?: unknown; channel?: unknown}
                if (tabId >= 0 && typeof data.generation === "number" && typeof data.channel === "string") {
                    void this.injectPageWorld(tabId, frameId, data.generation, data.channel)
                }
                return
            }
            if (action !== "mediaDiscoveryEventV2") return
            const tabId = sender.tab?.id ?? -1
            const frameId = sender.frameId ?? 0
            if (tabId < 0 || !this.allowRate(tabId, frameId)) return
            const event = parseEvent((message as {event?: unknown}).event)
            if (event) void this.observe(tabId, frameId, event)
        })
        browser.tabs.onRemoved.addListener(tabId => { this.tabs.delete(tabId); void this.persist() })
        browser.tabs.onUpdated.addListener((tabId, change) => {
            if (change.status === "loading" || change.url) {
                this.tabs.delete(tabId)
                void this.publish(tabId, [])
                void this.persist()
            }
        })
        browser.alarms.create(ALARM_NAME, {periodInMinutes: 1})
        browser.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM_NAME) void this.expire() })
        const networkListener = (details: WebRequest.OnHeadersReceivedDetailsType) => {
            if (details.tabId < 0) return
            const mimeType = details.responseHeaders?.find(header => header.name.toLowerCase() === "content-type")?.value ?? null
            const transport = classifyNetworkMedia(details.url, mimeType)
            if (!transport) return
            const generation = this.tabs.get(details.tabId)?.generation ?? 0
            void this.observe(details.tabId, details.frameId, {
                generation, source: "NETWORK", url: details.url, transport, mimeType,
            })
        }
        runCatching(() => browser.webRequest.onHeadersReceived.addListener(
            networkListener,
            {urls: ["http://*/*", "https://*/*"]},
            ["responseHeaders"],
        ))
    }

    private async injectPageWorld(tabId: number, frameId: number, generation: number, channel: string): Promise<void> {
        if (!isChrome()) return
        const scripting = (browser as unknown as {scripting?: {executeScript(options: unknown): Promise<unknown>}}).scripting
        await scripting?.executeScript({
            target: {tabId, frameIds: [frameId]},
            world: "MAIN",
            func: installPageMediaInstrumentationV2,
            args: [generation, channel],
        }).catch(() => undefined)
    }

    async observe(tabId: number, frameId: number, event: MediaDiscoveryEventV2): Promise<void> {
        const policy = Backend.getBrowserPolicyV2()
        if (policy?.mode !== "FULL" || !policy.advancedMediaInspection || !Backend.isFeatureAvailableV2("advancedMediaDiscovery")) return
        let tab = this.tabs.get(tabId)
        if (!tab || event.generation > tab.generation) {
            tab = {generation: event.generation, candidates: new Map()}
            this.tabs.set(tabId, tab)
        }
        if (event.generation !== tab.generation) return
        const resolvedUrl = event.url.startsWith("blob:") ? event.networkSourceUrl : event.url
        if (!resolvedUrl) return
        const key = [frameId, event.elementKey ?? event.source, event.url, event.networkSourceUrl ?? ""].join("|")
        const now = Date.now()
        const existing = tab.candidates.get(key)
        tab.candidates.set(key, {
            ...event,
            candidateId: existing?.candidateId ?? crypto.randomUUID(),
            tabId,
            frameId,
            firstSeenEpochMs: existing?.firstSeenEpochMs ?? now,
            lastSeenEpochMs: now,
        })
        while (tab.candidates.size > MAX_CANDIDATES_PER_TAB) tab.candidates.delete(tab.candidates.keys().next().value!)
        const candidates = [...tab.candidates.values()].sort((a, b) => b.lastSeenEpochMs - a.lastSeenEpochMs)
        await Promise.all([this.publish(tabId, candidates), this.persist()])
    }

    private async expire(): Promise<void> {
        const cutoff = Date.now() - CANDIDATE_TTL_MS
        for (const [tabId, tab] of this.tabs) {
            for (const [key, candidate] of tab.candidates) if (candidate.lastSeenEpochMs < cutoff) tab.candidates.delete(key)
            if (!tab.candidates.size) this.tabs.delete(tabId)
            await this.publish(tabId, [...tab.candidates.values()])
        }
        await this.persist()
    }

    private allowRate(tabId: number, frameId: number): boolean {
        const key = `${tabId}:${frameId}`
        const now = Date.now()
        let rate = this.rates.get(key)
        if (!rate || now - rate.windowStart >= 60_000) rate = {windowStart: now, count: 0}
        rate.count++
        this.rates.set(key, rate)
        return rate.count <= MAX_EVENTS_PER_FRAME_MINUTE
    }

    private async publish(tabId: number, candidates: MediaPanelCandidateV2[]): Promise<void> {
        await browser.tabs.sendMessage(tabId, {action: "mediaCandidatesV2", candidates}, {frameId: 0}).catch(() => undefined)
    }

    private async persist(): Promise<void> {
        const storage = sessionStorage()
        if (!storage) return
        const candidates = [...this.tabs.values()].flatMap(tab => [...tab.candidates.values()])
            .sort((a, b) => b.lastSeenEpochMs - a.lastSeenEpochMs)
            .slice(0, MAX_PERSISTED_CANDIDATES)
        const snapshot: StoredMediaSnapshotV2 = {schemaVersion: 2, candidates}
        if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength <= MAX_SNAPSHOT_BYTES) {
            await storage.set({[STORAGE_KEY]: snapshot})
        }
    }

    private async restore(): Promise<void> {
        const storage = sessionStorage()
        if (!storage) return
        const value = (await storage.get(STORAGE_KEY))[STORAGE_KEY] as Partial<StoredMediaSnapshotV2> | undefined
        if (value?.schemaVersion !== 2 || !Array.isArray(value.candidates)) return
        for (const candidate of value.candidates.slice(0, MAX_PERSISTED_CANDIDATES)) {
            const event = parseEvent(candidate)
            if (!event || typeof candidate.tabId !== "number" || typeof candidate.frameId !== "number" ||
                typeof candidate.candidateId !== "string" || typeof candidate.lastSeenEpochMs !== "number") continue
            if (candidate.lastSeenEpochMs < Date.now() - CANDIDATE_TTL_MS) continue
            let tab = this.tabs.get(candidate.tabId)
            if (!tab || event.generation > tab.generation) {
                tab = {generation: event.generation, candidates: new Map()}
                this.tabs.set(candidate.tabId, tab)
            }
            if (event.generation !== tab.generation) continue
            const key = [candidate.frameId, event.elementKey ?? event.source, event.url, event.networkSourceUrl ?? ""].join("|")
            tab.candidates.set(key, {
                ...event,
                candidateId: candidate.candidateId,
                tabId: candidate.tabId,
                frameId: candidate.frameId,
                firstSeenEpochMs: typeof candidate.firstSeenEpochMs === "number" ? candidate.firstSeenEpochMs : candidate.lastSeenEpochMs,
                lastSeenEpochMs: candidate.lastSeenEpochMs,
            })
        }
        for (const [tabId, tab] of this.tabs) await this.publish(tabId, [...tab.candidates.values()])
    }
}

function parseEvent(value: unknown): MediaDiscoveryEventV2 | null {
    if (typeof value !== "object" || value === null) return null
    const event = value as Partial<MediaDiscoveryEventV2>
    if (typeof event.generation !== "number" || !Number.isSafeInteger(event.generation) ||
        typeof event.url !== "string" || event.url.length > 16_384 ||
        !["DOM", "NETWORK", "FETCH", "XHR", "PERFORMANCE", "BLOB", "ADAPTER"].includes(event.source ?? "") ||
        !["PROGRESSIVE", "HLS", "DASH"].includes(event.transport ?? "")) return null
    const resolved = event.url.startsWith("blob:") ? event.networkSourceUrl : event.url
    if (!resolved || !isNetworkMediaUrl(resolved)) return null
    const boundedNumber = (number: number | null | undefined, max: number) => number == null ||
        (Number.isFinite(number) && number >= 0 && number <= max)
    if (!boundedNumber(event.width, 32_768) || !boundedNumber(event.height, 32_768) ||
        !boundedNumber(event.duration, 31_536_000)) return null
    return {
        generation: event.generation,
        source: event.source!,
        url: event.url,
        networkSourceUrl: event.networkSourceUrl?.slice(0, 16_384) ?? null,
        transport: event.transport!,
        elementKey: event.elementKey?.slice(0, 256) ?? null,
        title: event.title?.slice(0, 4096) ?? null,
        mimeType: event.mimeType?.slice(0, 256) ?? null,
        width: event.width ?? null,
        height: event.height ?? null,
        duration: event.duration ?? null,
        codecs: event.codecs?.filter(value => typeof value === "string").slice(0, 16).map(value => value.slice(0, 256)) ?? [],
        tracks: event.tracks?.slice(0, 64).filter(track => ["VIDEO", "AUDIO", "SUBTITLE"].includes(track.role)) ?? [],
        protectedMedia: event.protectedMedia === true,
    }
}

function isNetworkMediaUrl(value: string): boolean {
    try { return ["http:", "https:"].includes(new URL(value).protocol) } catch { return false }
}

function classifyNetworkMedia(url: string, mimeType: string | null): MediaTransportV2 | null {
    const value = `${url} ${mimeType ?? ""}`.toLowerCase()
    if (/\.m3u8(?:$|[?#])|mpegurl/.test(value)) return "HLS"
    if (/\.mpd(?:$|[?#])|dash\+xml/.test(value)) return "DASH"
    if (/(video\/|audio\/|\.mp4|\.m4[av]|\.m4s|\.cmf[av]|\.webm|\.mp3|\.aac|\.ogg|\.mov|\.ts)(?:$|[?#;\s])/.test(value)) return "PROGRESSIVE"
    return null
}

function runCatching(block: () => void): void { try { block() } catch { /* optional authority is not active */ } }

function sessionStorage(): typeof browser.storage.local | null {
    return (browser.storage as unknown as {session?: typeof browser.storage.local}).session ?? null
}

const STORAGE_KEY = "media-candidate-registry-v2"
const ALARM_NAME = "media-candidate-expiry-v2"
const CANDIDATE_TTL_MS = 15 * 60_000
const MAX_CANDIDATES_PER_TAB = 512
const MAX_PERSISTED_CANDIDATES = 2_048
const MAX_EVENTS_PER_FRAME_MINUTE = 200
const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024
