export interface DownloadRequestOptions {
    silentAdd: boolean
    silentStart: boolean
}

export const defaultDownloadRequestOptions: DownloadRequestOptions = {
    silentAdd: false,
    silentStart: false,
}

export function isDownloadRequestOptionsNecessary(options: DownloadRequestOptions) {
    return options.silentAdd !== defaultDownloadRequestOptions.silentAdd ||
        options.silentStart !== defaultDownloadRequestOptions.silentStart
}


