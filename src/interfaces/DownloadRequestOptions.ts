import _ from "lodash"

export interface DownloadRequestOptions {
    silentAdd: boolean
    silentStart: boolean
}

export const defaultDownloadRequestOptions: DownloadRequestOptions = {
    silentAdd: false,
    silentStart: false,
}

export function isDownloadRequestOptionsNecessary(options: DownloadRequestOptions) {
    return !_.isEqual(options, defaultDownloadRequestOptions)
}


