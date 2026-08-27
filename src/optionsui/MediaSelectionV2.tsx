import React, {useEffect, useMemo, useState} from "react"
import browser from "webextension-polyfill"
import type {MediaPanelCandidateV2, StagedMediaSelectionV2} from "~/media/v2/MediaCandidateRegistryV2"
import {t} from "~/i18n/t"

const PREFIX = "media-selection-v2:"

export function MediaSelectionV2({selectionId}: {selectionId: string}) {
    const [stage, setStage] = useState<StagedMediaSelectionV2 | null>(null)
    const [candidateId, setCandidateId] = useState("")
    const [trackIds, setTrackIds] = useState<Set<string>>(new Set())
    const [container, setContainer] = useState("")
    const [liveDuration, setLiveDuration] = useState(0)
    const [status, setStatus] = useState(t("media_selection_loading", "Loading media choices…"))
    useEffect(() => {
        const storage = (browser.storage as unknown as {session?: typeof browser.storage.local}).session
        if (!storage) { setStatus(t("media_selection_storage_unavailable", "Secure session selection storage is unavailable.")); return }
        void storage.get(PREFIX + selectionId).then(values => {
            const value = values[PREFIX + selectionId] as StagedMediaSelectionV2 | undefined
            if (!value || value.expiresAtEpochMs <= Date.now()) { setStatus(t("media_selection_expired", "This media selection expired.")); return }
            setStage(value); setStatus("")
        })
    }, [selectionId])
    const selected = useMemo(() => stage?.candidates.find(candidate => candidate.candidateId === candidateId) ?? null, [stage, candidateId])
    const audioTracks = selected?.tracks?.filter(track => track.role === "AUDIO") ?? []
    const audioSelected = audioTracks.length === 0 || audioTracks.some(track => trackIds.has(trackKey(track)))
    const valid = Boolean(selected && container && audioSelected && (!selected.live || liveDuration > 0))
    if (!stage) return <main data-theme="dark" className="p-6">{status}</main>
    return <main data-theme="dark" className="min-h-screen bg-base-200 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
            <h1 className="text-xl font-semibold">{t("media_selection_title", "Choose media quality and tracks")}</h1>
            <p>{t("media_selection_no_defaults", "No quality, track, live duration, or container is preselected. Protected/DRM media is unavailable.")}</p>
            <fieldset className="space-y-2"><legend className="font-semibold">{t("media_selection_variant", "Variant or quality")}</legend>
                {stage.candidates.map(candidate => <label key={candidate.candidateId} className="flex gap-3 p-3 border border-base-content/20 rounded">
                    <input type="radio" name="variant" checked={candidateId === candidate.candidateId} onChange={() => {setCandidateId(candidate.candidateId); setTrackIds(new Set())}}/>
                    <span><span className="font-medium">{candidate.title || fileName(candidate)}</span><span className="block text-sm opacity-75">{[candidate.transport, dimensions(candidate), candidate.mimeType, candidate.codecs?.join(', ')].filter(Boolean).join(' · ')}</span></span>
                </label>)}
            </fieldset>
            {selected && <>
                <fieldset className="space-y-2"><legend className="font-semibold">{t("media_selection_tracks", "Audio and subtitle tracks")}</legend>
                    {(selected.tracks ?? []).length === 0 && <div>{t("media_selection_no_tracks", "No separate tracks were advertised.")}</div>}
                    {(selected.tracks ?? []).map(track => {
                        const id = trackKey(track); const isAudio = track.role === "AUDIO"
                        return <label key={id} className="flex gap-2"><input type={isAudio ? "radio" : "checkbox"} name={isAudio ? "audio-track" : undefined} checked={trackIds.has(id)} onChange={event => setTrackIds(previous => {
                            const next = new Set(previous)
                            if (isAudio) audioTracks.forEach(audio => next.delete(trackKey(audio)))
                            event.target.checked ? next.add(id) : next.delete(id)
                            return next
                        })}/>{track.role} {track.language || t("undetermined", "undetermined")} {track.codec || ""}</label>
                    })}
                    {!audioSelected && <div className="text-warning">{t("media_selection_choose_audio", "Choose one audio track.")}</div>}
                </fieldset>
                <label className="block">{t("media_selection_container", "Output container")}
                    <select className="select select-bordered ml-2" value={container} onChange={event => setContainer(event.target.value)}>
                        <option value="">{t("choose", "Choose…")}</option><option value="native">{t("media_selection_native_container", "Keep native container")}</option><option value="mp4">MP4</option><option value="mkv">Matroska</option><option value="webm">WebM</option>
                    </select>
                </label>
                {selected.live && <label className="block">{t("media_selection_live_duration", "Live recording duration (seconds)")}<input className="input input-bordered ml-2" type="number" min={1} max={604800} value={liveDuration || ""} onChange={event => setLiveDuration(Number(event.target.value))}/></label>}
            </>}
            <button className="btn btn-primary" disabled={!valid} onClick={() => {
                setStatus(t("media_selection_submitting", "Creating encrypted desktop media review…"))
                void browser.runtime.sendMessage({
                    action: "submitMediaSelectionV2",
                    selectionId,
                    candidateId,
                    trackIds: [...trackIds],
                    outputContainer: container === "native" ? null : container,
                    liveDurationSeconds: selected?.live ? liveDuration : null,
                }).then(() => {setStatus(t("batch_review_ready", "Desktop review is ready.")); setTimeout(() => window.close(), 750)})
                    .catch(error => setStatus(error instanceof Error ? error.message : t("media_selection_failed", "Media selection failed")))
            }}>{t("media_selection_continue", "Continue to desktop routing")}</button>
            <span role="status" className="ml-3">{status}</span>
        </div>
    </main>
}

function trackKey(track: {trackId?: string; role: string; language?: string | null; codec?: string | null}) { return `${track.role}|${track.trackId ?? `${track.language ?? ''}:${track.codec ?? ''}`}` }
function dimensions(candidate: MediaPanelCandidateV2) { return candidate.width && candidate.height ? `${Math.round(candidate.width)}×${Math.round(candidate.height)}` : null }
function fileName(candidate: MediaPanelCandidateV2) { try { return decodeURIComponent(new URL(candidate.networkSourceUrl || candidate.url).pathname.split('/').pop() || '') || t("media", "Media") } catch { return t("media", "Media") } }
