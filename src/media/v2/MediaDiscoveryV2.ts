import browser from "webextension-polyfill"
import type {BrowserMediaSiteAdapterV2} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import type {MediaDiscoveryEventV2, MediaTransportV2} from "./MediaCandidateRegistryV2"
import {installPageMediaInstrumentationV2} from "./PageMediaInstrumentationV2"

export class MediaDiscoveryV2 {
    private generation = Math.max(0, Math.trunc(performance.timeOrigin || Date.now()))
    private readonly channel = crypto.randomUUID()
    private readonly elementIds = new WeakMap<Element, string>()
    private readonly observedMedia = new WeakSet<HTMLMediaElement>()
    private readonly cleanups: Array<() => void> = []
    private mutationObserver: MutationObserver | null = null
    private performanceObserver: PerformanceObserver | null = null
    private adapters: BrowserMediaSiteAdapterV2[] = []
    private emitted = 0
    private booted = false
    private lastUrl = location.href

    async boot(): Promise<boolean> {
        if (this.booted) return true
        const policy = await browser.runtime.sendMessage({action: "getMediaDiscoveryPolicyV2"}) as {
            enabled?: boolean; adapters?: BrowserMediaSiteAdapterV2[]
        }
        if (!policy?.enabled) return false
        this.emitted = 0
        this.adapters = policy.adapters?.slice(0, 32) ?? []
        this.booted = true
        this.scanRoot(document)
        this.scanPerformanceEntries(performance.getEntriesByType("resource") as PerformanceResourceTiming[])
        this.installMutationObserver()
        this.installPerformanceObserver()
        this.installPageBoundary()
        this.installNavigationWatcher()
        this.runAdapters()
        return true
    }

    private installNavigationWatcher(): void {
        const check = () => {
            if (location.href === this.lastUrl || !this.booted) return
            this.lastUrl = location.href
            this.generation++
            this.emitted = 0
            this.scanRoot(document)
            this.scanPerformanceEntries(performance.getEntriesByType("resource") as PerformanceResourceTiming[])
            this.runAdapters()
            void browser.runtime.sendMessage({
                action: "registerPageMediaInstrumentationV2",
                generation: this.generation,
                channel: this.channel,
            })
        }
        const timer = setInterval(check, 1_000)
        window.addEventListener("popstate", check)
        window.addEventListener("hashchange", check)
        this.cleanups.push(() => {
            clearInterval(timer)
            window.removeEventListener("popstate", check)
            window.removeEventListener("hashchange", check)
        })
    }

    close(): void {
        if (!this.booted) return
        this.booted = false
        this.mutationObserver?.disconnect(); this.mutationObserver = null
        this.performanceObserver?.disconnect(); this.performanceObserver = null
        while (this.cleanups.length) this.cleanups.pop()?.()
    }

    private installMutationObserver(): void {
        this.mutationObserver = new MutationObserver(records => {
            let inspected = 0
            for (const record of records) {
                if (record.type === "attributes" && record.target instanceof Element) this.scanElement(record.target)
                for (const node of record.addedNodes) {
                    if (node instanceof Element) this.scanRoot(node)
                    if (++inspected >= MAX_MUTATION_NODES) return
                }
            }
        })
        this.mutationObserver.observe(document.documentElement, {
            childList: true, subtree: true,
            attributes: true, attributeFilter: ["src", "href", "poster", "content"],
        })
    }

    private installPerformanceObserver(): void {
        if (!("PerformanceObserver" in window)) return
        this.performanceObserver = new PerformanceObserver(list => {
            this.scanPerformanceEntries(list.getEntries().filter(entry => entry.entryType === "resource") as PerformanceResourceTiming[])
        })
        this.performanceObserver.observe({type: "resource", buffered: true})
    }

    private installPageBoundary(): void {
        const listener = (message: MessageEvent) => {
            if (message.source !== window || message.data?.source !== "abdm-media-v2" || message.data.channel !== this.channel) return
            const event = message.data.event
            if (typeof event !== "object" || event === null) return
            this.forward(event as MediaDiscoveryEventV2)
            const manifestText = (event as {manifestText?: unknown}).manifestText
            if (typeof manifestText === "string" && manifestText.length <= 2 * 1024 * 1024) {
                this.inspectManifest((event as {url?: unknown}).url, (event as {transport?: unknown}).transport, manifestText)
            }
        }
        window.addEventListener("message", listener)
        this.cleanups.push(() => window.removeEventListener("message", listener))
        void browser.runtime.sendMessage({
            action: "registerPageMediaInstrumentationV2",
            generation: this.generation,
            channel: this.channel,
        })
        // Firefox MV2 has no MAIN-world scripting API; CSP may block this, in which case DOM/performance discovery remains active.
        if (typeof (browser as unknown as {scripting?: unknown}).scripting === "undefined") {
            try {
                const script = document.createElement("script")
                script.textContent = `(${installPageMediaInstrumentationV2.toString()})(${this.generation},${JSON.stringify(this.channel)})`
                document.documentElement.appendChild(script)
                script.remove()
            } catch { /* contained */ }
        }
    }

    private inspectManifest(rawUrl: unknown, transport: unknown, text: string): void {
        if (typeof rawUrl !== "string") return
        if (transport === "HLS") {
            for (const line of text.split(/\r?\n/).slice(0, 20_000)) {
                const value = line.trim()
                if (!value || value.startsWith("#")) continue
                try {
                    const url = new URL(value, rawUrl).href
                    this.forward({generation: this.generation, source: "FETCH", url, networkSourceUrl: rawUrl, transport: classifyMediaCandidateV2(url, "") ?? "HLS", title: document.title})
                } catch { /* malformed manifest entry */ }
            }
        }
        if (transport === "DASH") {
            try {
                const xml = new DOMParser().parseFromString(text, "application/xml")
                for (const node of Array.from(xml.querySelectorAll("BaseURL")).slice(0, 2_000)) {
                    if (!node.textContent) continue
                    const url = new URL(node.textContent.trim(), rawUrl).href
                    this.forward({generation: this.generation, source: "FETCH", url, networkSourceUrl: rawUrl, transport: "DASH", title: document.title})
                }
            } catch { /* malformed manifest */ }
        }
    }

    private scanRoot(root: ParentNode): void {
        if (root instanceof Element) this.scanElement(root)
        const elements = root.querySelectorAll?.("video,audio,source,track,meta[property='og:video'],meta[property='og:audio']") ?? []
        for (const element of Array.from(elements).slice(0, MAX_SCAN_ELEMENTS)) this.scanElement(element)
        let shadowCount = 0
        const all = root.querySelectorAll?.("*") ?? []
        for (const element of Array.from(all)) {
            if (!(element instanceof Element) || !element.shadowRoot) continue
            this.scanRoot(element.shadowRoot)
            if (++shadowCount >= MAX_SHADOW_ROOTS) break
        }
    }

    private scanElement(element: Element): void {
        if (element instanceof HTMLMediaElement) {
            const protectedMedia = Boolean((element as HTMLMediaElement & {mediaKeys?: unknown}).mediaKeys)
            const event = () => {
                const url = element.currentSrc || element.src
                if (url) this.emitDom(url, element, element.getAttribute("type"), protectedMedia)
                element.querySelectorAll<HTMLSourceElement>("source[src]").forEach(source =>
                    this.emitDom(source.src, element, source.type, protectedMedia)
                )
            }
            event()
            if (this.observedMedia.has(element)) return
            this.observedMedia.add(element)
            const encrypted = () => {
                const url = element.currentSrc || element.src
                if (url) this.emitDom(url, element, element.getAttribute("type"), true)
            }
            element.addEventListener("loadedmetadata", event)
            element.addEventListener("durationchange", event)
            element.addEventListener("encrypted", encrypted)
            this.cleanups.push(() => {
                element.removeEventListener("loadedmetadata", event)
                element.removeEventListener("durationchange", event)
                element.removeEventListener("encrypted", encrypted)
            })
            return
        }
        if (element instanceof HTMLSourceElement && element.src) {
            this.emitDom(element.src, element.parentElement ?? element, element.type, false)
            return
        }
        if (element instanceof HTMLMetaElement && element.content) {
            this.forward({generation: this.generation, source: "ADAPTER", url: element.content, transport: classifyMediaCandidateV2(element.content, element.getAttribute("content-type")) ?? "PROGRESSIVE", title: document.title})
        }
    }

    private emitDom(url: string, element: Element, mimeType: string | null, protectedMedia: boolean): void {
        const media = element as HTMLMediaElement
        const tracks = media.textTracks ? Array.from(media.textTracks).slice(0, 64).map(track => ({
            role: "SUBTITLE" as const, language: track.language || null, codec: null,
        })) : []
        this.forward({
            generation: this.generation,
            source: "DOM",
            url,
            transport: classifyMediaCandidateV2(url, mimeType) ?? "PROGRESSIVE",
            elementKey: this.elementKey(element),
            title: element.getAttribute("title") || document.title,
            mimeType,
            width: (element instanceof HTMLVideoElement ? element.videoWidth : 0) || element.getBoundingClientRect().width || null,
            height: (element instanceof HTMLVideoElement ? element.videoHeight : 0) || element.getBoundingClientRect().height || null,
            duration: Number.isFinite(media.duration) ? media.duration : null,
            codecs: parseCodecs(mimeType),
            tracks,
            protectedMedia,
        })
    }

    private scanPerformanceEntries(entries: PerformanceResourceTiming[]): void {
        for (const entry of entries.slice(-MAX_PERFORMANCE_ENTRIES)) {
        const transport = classifyMediaCandidateV2(entry.name, "")
            if (transport) this.forward({
                generation: this.generation, source: "PERFORMANCE", url: entry.name, transport,
                title: document.title,
            })
        }
    }

    private runAdapters(): void {
        for (const adapter of this.adapters) {
            try {
                if (!hostMatches(location.hostname, adapter.hostPattern)) continue
                const regex = adapter.urlRegex && safeAdapterRegexV2(adapter.urlRegex)
                for (const selector of adapter.selectors.slice(0, 32)) {
                    let nodes: NodeListOf<Element>
                    try { nodes = document.querySelectorAll(selector) } catch { continue }
                    for (const node of Array.from(nodes).slice(0, 256)) {
                        for (const attribute of adapter.attributes.slice(0, 16)) {
                            const raw = node.getAttribute(attribute)
                            if (!raw) continue
                            const url = new URL(raw, document.baseURI).href
                            if (regex && !regex.test(url)) continue
                            this.forward({generation: this.generation, source: "ADAPTER", url, transport: classifyMediaCandidateV2(url, "") ?? "PROGRESSIVE", elementKey: `${adapter.id}:${this.elementKey(node)}`, title: document.title})
                        }
                    }
                }
            } catch { /* one bad adapter never stops generic discovery */ }
        }
    }

    private elementKey(element: Element): string {
        let value = this.elementIds.get(element)
        if (!value) {
            value = `${element.tagName.toLowerCase()}-${crypto.randomUUID()}`
            this.elementIds.set(element, value)
        }
        return value
    }

    private forward(event: MediaDiscoveryEventV2): void {
        if (!this.booted || this.emitted++ >= MAX_EVENTS_PER_DOCUMENT) return
        void browser.runtime.sendMessage({action: "mediaDiscoveryEventV2", event}).catch(() => undefined)
    }
}

export function classifyMediaCandidateV2(url: string, mime: string | null): MediaTransportV2 | null {
    const value = `${url} ${mime ?? ""}`.toLowerCase()
    if (/\.m3u8(?:$|[?#])|mpegurl/.test(value)) return "HLS"
    if (/\.mpd(?:$|[?#])|dash\+xml/.test(value)) return "DASH"
    if (/(^blob:|video\/|audio\/|\.mp4|\.m4[av]|\.m4s|\.cmf[av]|\.webm|\.mp3|\.aac|\.ogg|\.mov|\.ts)(?:$|[?#;\s])/.test(value)) return "PROGRESSIVE"
    return null
}

function parseCodecs(mime: string | null): string[] {
    return mime?.match(/codecs\s*=\s*["']?([^"';]+)/i)?.[1]?.split(',').map(value => value.trim()).filter(Boolean).slice(0, 16) ?? []
}

function hostMatches(host: string, pattern: string): boolean {
    const normalized = pattern.toLowerCase().replace(/^\*\./, "")
    return host.toLowerCase() === normalized || host.toLowerCase().endsWith(`.${normalized}`)
}

export function safeAdapterRegexV2(pattern: string): RegExp | null {
    if (pattern.length > 256 || /\([^)]*[+*][^)]*\)[+*]/.test(pattern)) return null
    try { return new RegExp(pattern, "i") } catch { return null }
}

const MAX_SCAN_ELEMENTS = 5_000
const MAX_MUTATION_NODES = 500
const MAX_SHADOW_ROOTS = 64
const MAX_PERFORMANCE_ENTRIES = 1_000
const MAX_EVENTS_PER_DOCUMENT = 2_000
