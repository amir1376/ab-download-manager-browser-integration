import isNetworkError from "is-network-error";
import {HttpApiError, NetworkError} from "~/backend/BackendError";
import {AddDownloadRequest} from "~/interfaces/AddDownloadRequest";
import {IAppApi} from "~/backend/IAppApi";
import {getLatestConfig} from "~/configs/Config";
import {isNullOrBlank} from "~/utils/StringUtils";
import {head} from "lodash";
import Constants from "~/utils/Constants";

export function createHttpApiClient(
    port: number,
    basePath: string = "",
) {
    return new HttpApi(
        `http://localhost:${port}/${basePath}`
    )
}

export class HttpApi implements IAppApi {
    constructor(private apiUrl: string) {
    }

    private async request(
        path: string,
        payload: any,
    ) {
        const apiKey = getLatestConfig().apiKey
        const headers: HeadersInit = {}
        if (!isNullOrBlank(apiKey)) {
            headers[Constants.authHeaderName] = apiKey
        }
        const timeout = 500
        const controller = new AbortController()
        const id = setTimeout(() => controller.abort(), timeout)
        let response: Response
        try {
            response = await fetch(this.apiUrl + path, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payload),
                signal: controller.signal,
            })
        } catch (e) {
            if (isNetworkError(e) || controller.signal.aborted) {
                throw new NetworkError()
            } else {
                throw e
            }
        } finally {
            clearTimeout(id)
        }
        if (!response.ok) {
            throw new HttpApiError(response)
        }
        return response
    }

    async addDownload(request: AddDownloadRequest) {
        await this.request("add", request)
        return true
    }

    async ping(): Promise<boolean> {
        await this.request("ping", null)
        return true
    }
}
