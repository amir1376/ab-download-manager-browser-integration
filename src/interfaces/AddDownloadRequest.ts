import {DownloadRequestItem} from "~/interfaces/DownloadRequestItem";
import {DownloadRequestOptions} from "~/interfaces/DownloadRequestOptions";

export interface AddDownloadRequest {
    items: DownloadRequestItem[],
    options: DownloadRequestOptions,
}