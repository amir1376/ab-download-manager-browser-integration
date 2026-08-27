import React, {useEffect, useMemo, useState} from "react"
import browser from "webextension-polyfill"
import {sendMessage} from "webext-bridge/options"
import {DefinedCommands} from "~/message/Commands"
import type {StagedBatchReviewV2} from "~/contextmenus/StagedBatchReviewV2"

const STAGED_BATCH_PREFIX = "staged-browser-batch-v2:"

export function BatchReviewV2({reviewId}: {reviewId: string}) {
    const [review, setReview] = useState<StagedBatchReviewV2 | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [filter, setFilter] = useState("")
    const [status, setStatus] = useState("Loading review…")
    useEffect(() => {
        const storage = (browser.storage as unknown as {session?: typeof browser.storage.local}).session
        if (!storage) { setStatus("Session review storage is unavailable."); return }
        void storage.get(STAGED_BATCH_PREFIX + reviewId).then(values => {
            const value = values[STAGED_BATCH_PREFIX + reviewId] as StagedBatchReviewV2 | undefined
            if (!value || value.expiresAtEpochMs <= Date.now()) { setStatus("This review expired."); return }
            setReview(value)
            setSelected(new Set(value.collected.candidates.map(candidate => candidate.candidateId)))
            setStatus("")
        })
    }, [reviewId])
    const visible = useMemo(() => review?.collected.candidates.filter(candidate => {
        const needle = filter.trim().toLowerCase()
        return !needle || candidate.url.toLowerCase().includes(needle) ||
            candidate.description?.toLowerCase().includes(needle) || candidate.sourceKind.toLowerCase().includes(needle)
    }) ?? [], [review, filter])
    if (!review) return <div data-theme="dark" className="p-6">{status}</div>
    const setVisible = (checked: boolean) => setSelected(previous => {
        const next = new Set(previous)
        visible.forEach(candidate => checked ? next.add(candidate.candidateId) : next.delete(candidate.candidateId))
        return next
    })
    return <main data-theme="dark" className="min-h-screen bg-base-200 p-6">
        <div className="max-w-5xl mx-auto space-y-4">
            <h1 className="text-xl font-semibold">Review browser links</h1>
            <p>{review.collected.scope.toLowerCase()} collection: {review.collected.candidates.length} unique candidates. No desktop task exists until this review is submitted and accepted.</p>
            <div className="flex gap-2">
                <input aria-label="Filter candidates" className="input input-bordered flex-1" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter URL, description, or type"/>
                <button className="btn" onClick={() => setVisible(true)}>Select shown</button>
                <button className="btn" onClick={() => setVisible(false)}>Clear shown</button>
            </div>
            <div className="max-h-[60vh] overflow-auto border border-base-content/20 rounded">
                {visible.map(candidate => <label key={candidate.candidateId} className="flex gap-3 p-3 border-b border-base-content/10 items-start">
                    <input aria-label={`Select ${candidate.url}`} type="checkbox" className="checkbox" checked={selected.has(candidate.candidateId)} onChange={event => setSelected(previous => {
                        const next = new Set(previous); event.target.checked ? next.add(candidate.candidateId) : next.delete(candidate.candidateId); return next
                    })}/>
                    <span className="min-w-0"><span className="badge mr-2">{candidate.sourceKind}</span><span className="break-all">{candidate.url}</span>{candidate.description && <span className="block opacity-70">{candidate.description}</span>}</span>
                </label>)}
            </div>
            <div className="flex gap-2 items-center">
                <button className="btn btn-primary" disabled={!selected.size} onClick={() => {
                    setStatus("Submitting encrypted desktop review…")
                    void sendMessage(DefinedCommands.SUBMIT_STAGED_BROWSER_BATCH_V2, {reviewId, candidateIds: [...selected]}, "background")
                        .then(() => { setStatus("Desktop review is ready."); setTimeout(() => window.close(), 750) })
                        .catch(error => setStatus(error instanceof Error ? error.message : "Submission failed"))
                }}>Submit {selected.size} for desktop review</button>
                <button className="btn" onClick={() => {
                    void sendMessage(DefinedCommands.CANCEL_STAGED_BROWSER_BATCH_V2, reviewId, "background").finally(() => window.close())
                }}>Cancel</button>
                <span role="status">{status}</span>
            </div>
        </div>
    </main>
}
