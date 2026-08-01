
export interface DownloadRequestBundleSource {
    link: string
    headers: DownloadRequestHeaders | null
    suggestedName: string
    contentLength: number
}

export interface DownloadRequestItem {
    link: string
    downloadPage: string | null
    headers: DownloadRequestHeaders | null
    description: string | null,
    suggestedName: string | null,
    type: "hls" | "http" | "http-bundle"
    sources?: DownloadRequestBundleSource[]
}
export type DownloadRequestHeaders = Record<string, string>
