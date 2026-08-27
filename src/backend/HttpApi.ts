import isNetworkError from "is-network-error";
import {HttpApiError, NetworkError} from "~/backend/BackendError";
import {AddDownloadRequest} from "~/interfaces/AddDownloadRequest";
import {IAppApi} from "~/backend/IAppApi";
import {getLatestConfig} from "~/configs/Config";
import {isNullOrBlank} from "~/utils/StringUtils";
import {head} from "lodash";
import Constants from "~/utils/Constants";
import {
    AddressRefreshCandidate,
    AddressRefreshCandidateResult,
    AddressRefreshCapabilities,
    AddressRefreshSession
} from "~/interfaces/AddressRefresh";

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
        payload: any = null,
        method: "GET" | "POST" = "POST",
        timeout: number = 500,
    ) {
        const apiKey = getLatestConfig().apiKey
        const headers: HeadersInit = {}
        if (!isNullOrBlank(apiKey)) {
            headers[Constants.authHeaderName] = apiKey
        }
        const controller = new AbortController()
        const id = setTimeout(() => controller.abort(), timeout)
        let response: Response
        try {
            response = await fetch(this.apiUrl + path, {
                method: method,
                headers: headers,
                body: method === "POST" ? JSON.stringify(payload) : undefined,
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

    async addressRefreshCapabilities(): Promise<AddressRefreshCapabilities> {
        return await (await this.request("address-refresh/capabilities", null, "GET", 2_000)).json()
    }

    async addressRefreshSessions(): Promise<AddressRefreshSession[]> {
        return await (await this.request("address-refresh/sessions", null, "GET", 2_000)).json()
    }

    async submitAddressRefreshCandidate(candidate: AddressRefreshCandidate): Promise<AddressRefreshCandidateResult> {
        return await (await this.request("address-refresh/candidate", candidate, "POST", 5_000)).json()
    }
}
