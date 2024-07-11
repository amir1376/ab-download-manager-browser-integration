import isNetworkError from "is-network-error";
import {ApiError, NetworkError} from "~/backend/ApiError";
import {DownloadRequestItem} from "~/interfaces/DownloadRequestItem";

export function createBackendApi(
    port:number,
    basePath:string="",
){
    return new BackendApi(
        `http://localhost:${port}/${basePath}`
    )
}
export class BackendApi {
    constructor(private apiUrl: string) {
    }

    private async request(
        path: string,
        payload: any,
    ) {
        const timeout=2000
        const controller=new AbortController()
        const id=setTimeout(()=>controller.abort(),timeout)
        let response: Response
        try {
            response = await fetch(this.apiUrl + path, {
                method: "POST",
                body: JSON.stringify(payload),
                signal:controller.signal
            })
            clearTimeout(id)
        } catch (e) {
            if (isNetworkError(e) || controller.signal.aborted) {
                throw new NetworkError()
            } else {
                throw e
            }
        }
        if (!response.ok) {
            throw new ApiError(response)
        }
        return response
    }


    async addDownload(items: DownloadRequestItem[]) {
        return this.request("add", items)
    }

    async ping() {
        return this.request("ping", null)
    }
}