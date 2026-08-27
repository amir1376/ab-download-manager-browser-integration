/** Runs in the page world. Every emitted value is treated as untrusted by the extension. */
export function installPageMediaInstrumentationV2(generation: number, channel: string): void {
    const marker = "__abdmMediaInstrumentationV2"
    const scope = window as typeof window & Record<string, unknown>
    const existing = scope[marker] as {generation?: number; channel?: string} | undefined
    if (existing) { existing.generation = generation; existing.channel = channel; return }
    const config = {generation, channel}
    scope[marker] = config
    const emit = (event: Record<string, unknown>) => window.postMessage({
        source: "abdm-media-v2",
        channel: config.channel,
        event: {generation: config.generation, ...(event.source === "ADAPTER" ? {groupKey: `adapter:${location.href}`} : {}), ...event},
    }, "*")
    const classify = (url: string, type = "") => {
        const value = `${url} ${type}`.toLowerCase()
        if (/\.m3u8(?:$|[?#])|mpegurl/.test(value)) return "HLS"
        if (/\.mpd(?:$|[?#])|dash\+xml/.test(value)) return "DASH"
        if (/^(blob:|https?:)/.test(url) && /(video|audio|\.mp4|\.m4[av]|\.webm|\.mp3|\.aac|\.ogg|\.mov|\.ts|\.m4s|\.cmf[av])/.test(value)) return "PROGRESSIVE"
        return null
    }
    const inspectResponse = async (response: Response, source: "FETCH" | "XHR") => {
        const type = response.headers.get("content-type") ?? ""
        const transport = classify(response.url, type)
        if (!transport) return
        emit({source, url: response.url, transport, mimeType: type})
        if (transport === "HLS" || transport === "DASH") {
            const length = Number(response.headers.get("content-length") ?? 0)
            if (length > MAX_BODY_BYTES) return
            try {
                const reader = response.clone().body?.getReader()
                if (!reader) return
                let total = 0
                const chunks: Uint8Array[] = []
                while (true) {
                    const part = await reader.read()
                    if (part.done) break
                    total += part.value.byteLength
                    if (total > MAX_BODY_BYTES) { await reader.cancel(); return }
                    chunks.push(part.value)
                }
                const bytes = new Uint8Array(total)
                let offset = 0
                for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
                emit({source, url: response.url, transport, mimeType: type, manifestText: new TextDecoder().decode(bytes)})
            } catch { /* response bodies are optional evidence */ }
        }
    }
    const originalFetch = window.fetch
    window.fetch = async function(...args: Parameters<typeof fetch>) {
        const response = await originalFetch.apply(this, args)
        void inspectResponse(response, "FETCH")
        return response
    }
    const blobSources = new WeakMap<Blob, string>()
    const responseBlob = Response.prototype.blob
    Response.prototype.blob = async function() {
        const blob = await responseBlob.call(this)
        if (this.url) blobSources.set(blob, this.url)
        return blob
    }
    const createObjectURL = URL.createObjectURL
    URL.createObjectURL = function(value: Blob | MediaSource) {
        const result = createObjectURL.call(URL, value)
        if (value instanceof Blob) {
            const networkSourceUrl = blobSources.get(value)
            if (networkSourceUrl) emit({source: "BLOB", url: result, networkSourceUrl, transport: classify(networkSourceUrl, value.type) ?? "PROGRESSIVE", mimeType: value.type})
        }
        return result
    }
    const open = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...rest: unknown[]) {
        ;(this as XMLHttpRequest & {__abdmUrl?: string}).__abdmUrl = String(url)
        return Reflect.apply(open, this, [method, url, ...rest])
    }
    const send = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
        this.addEventListener("load", () => {
            const url = this.responseURL || (this as XMLHttpRequest & {__abdmUrl?: string}).__abdmUrl || ""
            const type = this.getResponseHeader("content-type") ?? ""
            const transport = classify(url, type)
            if (transport) emit({source: "XHR", url, transport, mimeType: type})
        }, {once: true})
        return send.call(this, body)
    }
    const scanKnownPlayers = () => {
        try {
            const host = location.hostname.toLowerCase()
            const roots: unknown[] = []
            if (host.endsWith("youtube.com") || host.endsWith("youtu.be")) roots.push(scope.ytInitialPlayerResponse)
            if (host.endsWith("vimeo.com")) roots.push(scope.vimeo, scope.__PLAYER_CONFIG__)
            if (host.endsWith("instagram.com") || host.endsWith("facebook.com")) roots.push(scope.__additionalData, scope.__INITIAL_STATE__)
            const queue = roots.filter(Boolean)
            const seen = new WeakSet<object>()
            let inspected = 0
            while (queue.length && inspected++ < 2_000) {
                const value = queue.shift()
                if (!value || typeof value !== "object" || seen.has(value as object)) continue
                seen.add(value as object)
                for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 128)) {
                    if (typeof child === "string" && /(?:url|manifest|playback|progressive|hls|dash)/i.test(key)) {
                        try {
                            const url = new URL(child.replace(/\\u0026/g, "&"), location.href).href
                            const transport = classify(url, key)
                            const record = value as Record<string, unknown>
                            if (transport) emit({
                                source: "ADAPTER", url, transport,
                                variantId: String(record.id ?? record.itag ?? record.qualityLabel ?? url).slice(0, 256),
                                width: typeof record.width === "number" ? record.width : undefined,
                                height: typeof record.height === "number" ? record.height : undefined,
                                mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
                            })
                        } catch { /* cipher-only and malformed values are ignored, never deciphered */ }
                    } else if (child && typeof child === "object") queue.push(child)
                }
            }
        } catch { /* adapters are isolated */ }
    }
    scanKnownPlayers()
    setTimeout(scanKnownPlayers, 1_000)
    setTimeout(scanKnownPlayers, 3_000)

    const MAX_BODY_BYTES = 2 * 1024 * 1024
}
