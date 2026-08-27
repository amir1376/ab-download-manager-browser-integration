import browser from "webextension-polyfill"
import type {MediaPanelCandidateV2} from "./MediaCandidateRegistryV2"

export class MediaPanelV2 {
    private host: HTMLDivElement | null = null
    private shadowRoot: ShadowRoot | null = null
    private candidates: MediaPanelCandidateV2[] = []
    private generation: number | null = null
    private dismissedGeneration: number | null = null
    private readonly cleanups: Array<() => void> = []
    private resizeObserver: ResizeObserver | null = null
    private intersectionObserver: IntersectionObserver | null = null

    constructor() {
        const reposition = () => this.position()
        for (const event of ["scroll", "resize", "fullscreenchange", "popstate", "hashchange"] as const) {
            window.addEventListener(event, reposition, {passive: true})
            this.cleanups.push(() => window.removeEventListener(event, reposition))
        }
        if ("ResizeObserver" in window) this.resizeObserver = new ResizeObserver(reposition)
        if ("IntersectionObserver" in window) this.intersectionObserver = new IntersectionObserver(reposition)
    }

    update(candidates: MediaPanelCandidateV2[]): void {
        const nextGeneration = candidates[0]?.generation ?? null
        if (nextGeneration !== this.generation) {
            this.generation = nextGeneration
            this.dismissedGeneration = null
        }
        this.candidates = candidates.slice(0, 512)
        if (!this.candidates.length || this.dismissedGeneration === this.generation) {
            this.removeHost()
            return
        }
        this.render()
        this.position()
    }

    close(): void {
        this.removeHost()
        this.resizeObserver?.disconnect()
        this.intersectionObserver?.disconnect()
        while (this.cleanups.length) this.cleanups.pop()?.()
    }

    private render(): void {
        if (!this.host) {
            this.host = document.createElement("div")
            this.host.dataset.abdmMediaPanelV2 = "true"
            this.host.style.cssText = "position:fixed;z-index:2147483646;max-width:360px;direction:ltr"
            this.shadowRoot = this.host.attachShadow({mode: "closed"})
            document.documentElement.appendChild(this.host)
        }
        const root = this.shadowRoot
        if (!root) return
        root.replaceChildren()
        const style = document.createElement("style")
        style.textContent = `:host{all:initial}.panel{font:13px system-ui;color:#eee;background:#1c1d24;border:1px solid #666;border-radius:10px;box-shadow:0 6px 24px #0008;overflow:hidden}.head{display:flex;gap:8px;align-items:center;padding:8px}.title{flex:1;font-weight:600}.list{max-height:45vh;overflow:auto}button{font:inherit;color:inherit;background:transparent;border:0;text-align:left}.item{display:block;width:100%;padding:8px;border-top:1px solid #444;cursor:pointer}.item:hover{background:#ffffff12}.item:disabled{opacity:.55;cursor:not-allowed}.meta{display:block;font-size:11px;color:#bbb;margin-top:2px}.close{cursor:pointer;font-size:18px}`
        const panel = document.createElement("section")
        panel.className = "panel"
        panel.setAttribute("role", "dialog")
        panel.setAttribute("aria-label", "Detected downloadable media")
        const head = document.createElement("div"); head.className = "head"
        const title = document.createElement("span"); title.className = "title"; title.textContent = `Download media (${this.candidates.length})`
        const close = document.createElement("button"); close.className = "close"; close.textContent = "×"; close.setAttribute("aria-label", "Dismiss media panel")
        close.onclick = () => { this.dismissedGeneration = this.generation; this.removeHost() }
        head.append(title, close); panel.appendChild(head)
        const list = document.createElement("div"); list.className = "list"
        for (const candidate of this.candidates) {
            const button = document.createElement("button"); button.className = "item"
            button.disabled = candidate.protectedMedia === true
            button.textContent = candidate.title || fileName(candidate.networkSourceUrl || candidate.url) || "Detected media"
            const meta = document.createElement("span"); meta.className = "meta"
            meta.textContent = [candidate.transport, dimensions(candidate), candidate.mimeType, candidate.codecs?.join(", "), candidate.protectedMedia ? "Protected media is unavailable" : null].filter(Boolean).join(" · ")
            button.appendChild(meta)
            button.onclick = () => {
                if (!button.disabled) void browser.runtime.sendMessage({action: "openMediaSelectionV2", candidateId: candidate.candidateId})
            }
            list.appendChild(button)
        }
        panel.appendChild(list); root.append(style, panel)
    }

    private position(): void {
        if (!this.host) return
        const media = visibleMediaElements().sort((left, right) => area(right) - area(left))[0]
        this.resizeObserver?.disconnect(); this.intersectionObserver?.disconnect()
        if (!media) {
            this.host.style.top = "8px"; this.host.style.left = "8px"; return
        }
        this.resizeObserver?.observe(media); this.intersectionObserver?.observe(media)
        const rect = media.getBoundingClientRect()
        const width = Math.min(360, Math.max(220, rect.width))
        this.host.style.width = `${width}px`
        this.host.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))}px`
        this.host.style.top = `${Math.max(8, rect.top + 8)}px`
    }

    private removeHost(): void {
        this.host?.remove(); this.host = null; this.shadowRoot = null
    }
}

function visibleMediaElements(): HTMLMediaElement[] {
    return Array.from(document.querySelectorAll<HTMLMediaElement>("video,audio")).filter(element => {
        const rect = element.getBoundingClientRect()
        if (rect.width <= 1 || rect.height <= 1 || rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) return false
        const style = getComputedStyle(element)
        if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false
        const top = document.elementFromPoint(Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2)), Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2)))
        return top === element || Boolean(top && element.contains(top)) || Boolean(top && top.contains(element))
    })
}

function area(element: Element): number { const rect = element.getBoundingClientRect(); return rect.width * rect.height }
function dimensions(candidate: MediaPanelCandidateV2): string | null { return candidate.width && candidate.height ? `${Math.round(candidate.width)}×${Math.round(candidate.height)}` : null }
function fileName(value: string): string | null { try { return decodeURIComponent(new URL(value).pathname.split('/').pop() || '') || null } catch { return null } }
