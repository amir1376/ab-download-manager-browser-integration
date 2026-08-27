import browser from "webextension-polyfill"
import type {BrowserBatchScopeV2, BrowserCandidateSourceV2} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import {collectBrowserBatchV2, submitCollectedBatchV2, type CollectedBrowserBatchV2} from "./BatchCollectorV2"

export interface StagedBatchReviewV2 {
    schemaVersion: 2
    reviewId: string
    createdAtEpochMs: number
    expiresAtEpochMs: number
    collected: CollectedBrowserBatchV2
}

export const STAGED_BATCH_PREFIX = "staged-browser-batch-v2:"

export async function stageBatchReviewV2(
    tabId: number,
    scope: BrowserBatchScopeV2,
    privateContext: boolean,
    frameId?: number,
    sourceKinds: BrowserCandidateSourceV2[] = [],
): Promise<string> {
    const storage = sessionStorage()
    if (!storage) throw new Error("SESSION_REVIEW_STORAGE_UNAVAILABLE")
    const collected = await collectBrowserBatchV2(tabId, scope, privateContext, frameId, sourceKinds)
    const reviewId = crypto.randomUUID().replaceAll("-", "")
    const staged: StagedBatchReviewV2 = {
        schemaVersion: 2,
        reviewId,
        createdAtEpochMs: Date.now(),
        expiresAtEpochMs: Date.now() + REVIEW_TTL_MS,
        collected,
    }
    const encodedBytes = new TextEncoder().encode(JSON.stringify(staged)).byteLength
    if (encodedBytes > MAX_STAGED_BYTES) throw new Error("BROWSER_BATCH_REVIEW_TOO_LARGE")
    await storage.set({[STAGED_BATCH_PREFIX + reviewId]: staged})
    await browser.tabs.create({
        url: browser.runtime.getURL(`src/entrypoint/OptionUi/index.html?batchReview=${encodeURIComponent(reviewId)}`),
        active: true,
    })
    return reviewId
}

export async function submitStagedBatchReviewV2(reviewId: string, candidateIds: string[]) {
    const staged = await load(reviewId)
    const selected = new Set(candidateIds)
    const candidates = staged.collected.candidates.filter(candidate => selected.has(candidate.candidateId))
    if (!candidates.length || candidates.length !== selected.size) throw new Error("BROWSER_BATCH_SELECTION_INVALID")
    const receipt = await submitCollectedBatchV2({...staged.collected, candidates})
    await sessionStorage()?.remove(STAGED_BATCH_PREFIX + reviewId)
    return receipt
}

export async function cancelStagedBatchReviewV2(reviewId: string): Promise<void> {
    await sessionStorage()?.remove(STAGED_BATCH_PREFIX + reviewId)
}

async function load(reviewId: string): Promise<StagedBatchReviewV2> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(reviewId)) throw new Error("BROWSER_BATCH_REVIEW_INVALID")
    const storage = sessionStorage()
    if (!storage) throw new Error("SESSION_REVIEW_STORAGE_UNAVAILABLE")
    const value = (await storage.get(STAGED_BATCH_PREFIX + reviewId))[STAGED_BATCH_PREFIX + reviewId] as StagedBatchReviewV2 | undefined
    if (!value || value.schemaVersion !== 2 || value.reviewId !== reviewId || value.expiresAtEpochMs <= Date.now()) {
        await storage.remove(STAGED_BATCH_PREFIX + reviewId)
        throw new Error("BROWSER_BATCH_REVIEW_EXPIRED")
    }
    return value
}

function sessionStorage(): typeof browser.storage.local | null {
    return (browser.storage as unknown as {session?: typeof browser.storage.local}).session ?? null
}

const REVIEW_TTL_MS = 15 * 60_000
const MAX_STAGED_BYTES = 8 * 1024 * 1024
