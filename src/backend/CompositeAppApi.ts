import {IAppApi} from "~/backend/IAppApi";
import {AddDownloadRequest} from "~/interfaces/AddDownloadRequest";
import _ from "lodash";
import {AddressRefreshCandidate} from "~/interfaces/AddressRefresh";

export class CompositeAppApi implements IAppApi {
    constructor(
        private readonly allApis: IAppApi[],
        private exposeLogFrom: IAppApi,
    ) {
        if (allApis.length === 0) {
            throw new Error("at least one API is required")
        }
    }

    private shouldUseThisForLog(appApi: IAppApi) {
        return _.isEqual(appApi, this.exposeLogFrom)
    }

    private async action<R>(
        block: (api: IAppApi) => Promise<R>
    ): Promise<R> {
        let error: unknown = null

        for (const api of this.allApis) {
            try {
                return await block(api)
            } catch (e) {
                if (this.shouldUseThisForLog(api)) {
                    error = e
                }
            }
        }

        throw error
    }

    addDownload(request: AddDownloadRequest): Promise<boolean> {
        return this.action(api => api.addDownload(request))
    }

    ping(): Promise<boolean> {
        return this.action(api => api.ping())
    }

    addressRefreshCapabilities() {
        return this.action(api => api.addressRefreshCapabilities())
    }

    addressRefreshSessions() {
        return this.action(api => api.addressRefreshSessions())
    }

    submitAddressRefreshCandidate(candidate: AddressRefreshCandidate) {
        return this.action(api => api.submitAddressRefreshCandidate(candidate))
    }
}
