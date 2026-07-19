import {AddDownloadRequest} from "~/interfaces/AddDownloadRequest";

export interface IAppApi {
    addDownload(request: AddDownloadRequest): Promise<boolean>

    ping(): Promise<boolean>
}
