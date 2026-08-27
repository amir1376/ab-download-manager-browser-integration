import browser from "webextension-polyfill"
import * as Backend from "~/backend/Backend"
import type {
    BrowserBatchReceiptV2,
    BrowserBatchScopeV2,
    BrowserBatchV2,
    BrowserCandidateSourceV2,
    BrowserCandidateV2,
} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import {BrowserProtocolLimitsV2} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import {BrowserTarget, getExtensionBrowserTarget, isChrome} from "~/utils/ExtensionInfo"

interface RawCandidate {url: string; sourceKind: BrowserCandidateSourceV2; description: string | null; suggestedName: string | null}

export interface CollectedBrowserBatchV2 {
    scope: BrowserBatchScopeV2
    privateContext: boolean
    candidates: BrowserCandidateV2[]
}

export async function collectAndSubmitBatchV2(
    tabId: number,
    scope: BrowserBatchScopeV2,
    privateContext: boolean,
    frameId?: number,
    sourceKinds: BrowserCandidateSourceV2[] = [],
): Promise<BrowserBatchReceiptV2> {
    return submitCollectedBatchV2(await collectBrowserBatchV2(tabId, scope, privateContext, frameId, sourceKinds))
}

export async function collectBrowserBatchV2(
    tabId: number,
    scope: BrowserBatchScopeV2,
    privateContext: boolean,
    frameId?: number,
    sourceKinds: BrowserCandidateSourceV2[] = [],
): Promise<CollectedBrowserBatchV2> {
    const raw = await executeCollector(tabId, scope, frameId)
    const allowed = new Set(sourceKinds)
    const deduped = new Map<string, BrowserCandidateV2>()
    for (const frame of raw) {
        for (const candidate of frame.candidates) {
            if (allowed.size && !allowed.has(candidate.sourceKind)) continue
            const url = normalizeCandidateUrl(candidate.url)
            if (!url || deduped.has(url)) continue
            deduped.set(url, {
                candidateId: crypto.randomUUID(),
                url,
                sourceKind: candidate.sourceKind,
                frameId: frame.frameId,
                description: candidate.description?.slice(0, 4096) ?? null,
                suggestedName: candidate.suggestedName?.slice(0, 4096) ?? null,
                contextRef: null,
            })
            if (deduped.size >= BrowserProtocolLimitsV2.maxBatchCandidates) break
        }
        if (deduped.size >= BrowserProtocolLimitsV2.maxBatchCandidates) break
    }
    if (!deduped.size) throw new Error("NO_LINKS_FOUND")
    return {scope, privateContext, candidates: [...deduped.values()]}
}

export async function submitCollectedBatchV2(collected: CollectedBrowserBatchV2): Promise<BrowserBatchReceiptV2> {
    const {scope, privateContext, candidates} = collected
    const operationId = crypto.randomUUID().replaceAll("-", "")
    const generation = Date.now()
    const chunks = chunkCandidates(candidates, {operationId, generation, scope, privateContext})
    if (chunks.length > 50) throw new Error("BROWSER_BATCH_TOO_LARGE")
    let receipt: BrowserBatchReceiptV2 | null = null
    try {
        for (let index = 0; index < chunks.length; index++) {
            const batch: BrowserBatchV2 = {
                operationId,
                generation,
                scope,
                browserFamily: browserFamily(),
                privateContext,
                chunkIndex: index,
                chunkCount: chunks.length,
                candidates: chunks[index],
            }
            receipt = await Backend.submitBrowserBatchV2(batch)
        }
    } catch (failure) {
        await Backend.cancelBrowserBatchV2(operationId).catch(() => null)
        throw failure
    }
    if (receipt?.state !== "READY_FOR_REVIEW") throw new Error("BROWSER_BATCH_REVIEW_NOT_READY")
    return receipt
}

async function executeCollector(
    tabId: number,
    scope: BrowserBatchScopeV2,
    frameId?: number,
): Promise<Array<{frameId: number; candidates: RawCandidate[]}>> {
    if (isChrome()) {
        const scripting = (browser as unknown as {scripting: {executeScript(options: unknown): Promise<Array<{frameId: number; result?: RawCandidate[]}>>}}).scripting
        const target = frameId === undefined
            ? {tabId, allFrames: scope === "ALL" || scope === "SELECTED" || scope === "CUSTOM"}
            : {tabId, frameIds: [frameId]}
        const results = await scripting.executeScript({target, func: collectDocumentCandidatesV2, args: [scope, MAX_PER_FRAME]})
        return results.map(value => ({frameId: value.frameId, candidates: value.result ?? []}))
    }
    const tabs = browser.tabs as unknown as {executeScript(tabId: number, details: {code: string; allFrames: boolean; frameId?: number}): Promise<RawCandidate[][]>}
    const code = `(${collectDocumentCandidatesV2.toString()})(${JSON.stringify(scope)},${MAX_PER_FRAME})`
    const results = await tabs.executeScript(tabId, {
        code,
        allFrames: frameId === undefined && (scope === "ALL" || scope === "SELECTED" || scope === "CUSTOM"),
        ...(frameId === undefined ? {} : {frameId}),
    })
    return results.map((candidates, index) => ({frameId: frameId ?? index, candidates: candidates ?? []}))
}

/** Self-contained because Chrome serializes this function into each target frame. */
export function collectDocumentCandidatesV2(scope: string, limit: number): RawCandidate[] {
    type Kind = RawCandidate["sourceKind"]
    const output = new Map<string, RawCandidate>()
    const add = (raw: string | null | undefined, sourceKind: Kind, description?: string | null) => {
        if (!raw || output.size >= limit) return
        try {
            const url = new URL(raw, document.baseURI)
            if (!['http:', 'https:', 'ftp:', 'ftps:'].includes(url.protocol)) return
            url.hash = ''
            if (output.has(url.href)) return
            const file = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '')
            output.set(url.href, {url: url.href, sourceKind, description: description?.trim().slice(0, 4096) || null, suggestedName: file || null})
        } catch { /* malformed candidates are rejected */ }
    }
    const addTextUrls = (text: string | null | undefined, kind: Kind) => {
        const bounded = (text ?? '').slice(0, 1_048_576)
        for (const match of bounded.matchAll(/(?:https?|ftps?):\/\/[^\s<>"'`]+/gi)) add(match[0].replace(/[),.;\]]+$/, ''), kind)
    }
    const scan = (root: ParentNode, range?: Range) => {
        const included = (node: Node) => !range || range.intersectsNode(node)
        root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(node => { if (included(node)) add(node.href, 'LINK', node.textContent) })
        root.querySelectorAll<HTMLImageElement>('img[src]').forEach(node => {
            if (!included(node)) return
            add(node.currentSrc || node.src, 'IMAGE', node.alt)
            for (const entry of node.srcset.split(',')) add(entry.trim().split(/\s+/)[0], 'IMAGE', node.alt)
        })
        root.querySelectorAll<HTMLMediaElement>('audio[src],video[src]').forEach(node => { if (included(node)) add(node.currentSrc || node.src, node.tagName === 'AUDIO' ? 'AUDIO' : 'VIDEO') })
        root.querySelectorAll<HTMLSourceElement>('source[src]').forEach(node => { if (included(node)) add(node.src, node.parentElement?.tagName === 'AUDIO' ? 'AUDIO' : 'VIDEO') })
        root.querySelectorAll<HTMLIFrameElement>('iframe[src],frame[src]').forEach(node => { if (included(node)) add(node.src, 'FRAME', node.title) })
        root.querySelectorAll<HTMLScriptElement>('script[src]').forEach(node => { if (included(node)) add(node.src, 'SCRIPT') })
    }
    if (scope === 'PAGE' || scope === 'FRAME') add(location.href, scope === 'PAGE' ? 'PAGE' : 'FRAME', document.title)
    if (scope === 'SELECTED') {
        const selection = window.getSelection()
        if (selection && selection.rangeCount) {
            for (let index = 0; index < selection.rangeCount; index++) {
                const range = selection.getRangeAt(index)
                const root = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
                    ? range.commonAncestorContainer as Element
                    : range.commonAncestorContainer.parentElement
                if (root) scan(root, range)
            }
            addTextUrls(selection.toString(), 'TEXT')
        }
        const active = document.activeElement
        if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
            addTextUrls(active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? active.value.length), 'INPUT')
        }
    } else if (scope === 'ALL' || scope === 'CUSTOM') {
        scan(document)
        addTextUrls(document.body?.innerText, 'TEXT')
    }
    return [...output.values()].slice(0, limit)
}

function normalizeCandidateUrl(value: string): string | null {
    try {
        const url = new URL(value)
        if (!['http:', 'https:', 'ftp:', 'ftps:'].includes(url.protocol) || url.username || url.password) return null
        url.hash = ''
        return url.href
    } catch { return null }
}

function chunkCandidates(
    candidates: BrowserCandidateV2[],
    base: {operationId: string; generation: number; scope: BrowserBatchScopeV2; privateContext: boolean},
): BrowserCandidateV2[][] {
    const chunks: BrowserCandidateV2[][] = []
    let current: BrowserCandidateV2[] = []
    for (const candidate of candidates) {
        const proposed = [...current, candidate]
        const bytes = new TextEncoder().encode(JSON.stringify({...base, candidates: proposed})).byteLength
        if (current.length && (current.length >= BrowserProtocolLimitsV2.maxBatchChunkCandidates || bytes > MAX_CHUNK_BYTES)) {
            chunks.push(current); current = [candidate]
        } else current = proposed
        if (new TextEncoder().encode(JSON.stringify({...base, candidates: current})).byteLength > MAX_CHUNK_BYTES) {
            throw new Error("BROWSER_CANDIDATE_TOO_LARGE")
        }
    }
    if (current.length) chunks.push(current)
    return chunks
}

function browserFamily(): "CHROME" | "FIREFOX" {
    return getExtensionBrowserTarget() === BrowserTarget.firefox ? "FIREFOX" : "CHROME"
}

const MAX_PER_FRAME = 1_000
const MAX_CHUNK_BYTES = 220 * 1024
