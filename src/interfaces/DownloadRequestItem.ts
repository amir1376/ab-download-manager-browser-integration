
export interface DownloadRequestItem {
    link: string
    downloadPage: string | null
    headers: DownloadRequestHeaders | null
    description: string | null
}
export type DownloadRequestHeaders = Record<string, string>
