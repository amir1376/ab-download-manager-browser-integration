import {
    DownloadRequestBundleSource,
    DownloadRequestItem,
} from "~/interfaces/DownloadRequestItem";

export const GOOGLE_DRIVE_BATCH_DEBOUNCE_MS = 750
export const GOOGLE_DRIVE_BATCH_MAX_WAIT_MS = 2_500

export interface GoogleDriveCapturedDownload {
    item: DownloadRequestItem
    fileName: string | null
    contentLength: number | null
}

export function getGoogleDriveBatchKey(
    tabId: number | null | undefined,
    downloadPage: string | null,
): string {
    if (tabId !== null && tabId !== undefined && tabId >= 0) {
        return `tab:${tabId}`
    }
    if (!downloadPage) {
        return "page:unknown"
    }
    try {
        return `page:${new URL(downloadPage).origin}`
    } catch (_) {
        return "page:unknown"
    }
}

function normalizeFileName(value: string | null): string | null {
    const name = value?.split(/[\\/]/).pop()?.trim()
    return name || null
}

export function getGoogleDriveBundleName(fileNames: Array<string | null>): string {
    const normalized = fileNames.map(normalizeFileName).filter((name): name is string => name !== null)
    const numberedZip = normalized.find(name => /-\d{3}\.zip$/i.test(name))
    if (numberedZip) {
        return numberedZip.replace(/-\d{3}(\.zip)$/i, "$1")
    }
    const firstZip = normalized.find(name => name.toLowerCase().endsWith(".zip"))
    if (firstZip) {
        return firstZip
    }
    return "google-drive-download.zip"
}

export function createGoogleDriveDownloadRequest(
    captures: GoogleDriveCapturedDownload[],
): DownloadRequestItem[] {
    if (captures.length <= 1) {
        const capture = captures[0]
        if (!capture) {
            return []
        }
        return [{
            ...capture.item,
            suggestedName: normalizeFileName(capture.fileName) ?? capture.item.suggestedName,
        }]
    }

    if (captures.some(capture => capture.contentLength === null || capture.contentLength < 0)) {
        return captures.map(capture => ({
            ...capture.item,
            suggestedName: normalizeFileName(capture.fileName) ?? capture.item.suggestedName,
        }))
    }

    const sorted = [...captures].sort((left, right) => {
        return (normalizeFileName(left.fileName) ?? left.item.link).localeCompare(
            normalizeFileName(right.fileName) ?? right.item.link,
            undefined,
            {numeric: true, sensitivity: "base"},
        )
    })
    const sources: DownloadRequestBundleSource[] = sorted.map(capture => ({
        link: capture.item.link,
        headers: capture.item.headers,
        suggestedName: normalizeFileName(capture.fileName)
            ?? capture.item.suggestedName
            ?? "download",
        contentLength: capture.contentLength ?? -1,
    }))
    const first = sorted[0].item
    return [{
        link: first.link,
        downloadPage: first.downloadPage,
        headers: null,
        description: null,
        suggestedName: getGoogleDriveBundleName(sorted.map(it => it.fileName)),
        type: "http-bundle",
        sources,
    }]
}
