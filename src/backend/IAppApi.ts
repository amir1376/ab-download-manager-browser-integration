import {AddDownloadRequest} from "~/interfaces/AddDownloadRequest";
import {
    AddressRefreshCandidate,
    AddressRefreshCandidateResult,
    AddressRefreshCapabilities,
    AddressRefreshSession
} from "~/interfaces/AddressRefresh";

export interface IAppApi {
    addDownload(request: AddDownloadRequest): Promise<boolean>

    ping(): Promise<boolean>

    addressRefreshCapabilities(): Promise<AddressRefreshCapabilities>
    addressRefreshSessions(): Promise<AddressRefreshSession[]>
    submitAddressRefreshCandidate(candidate: AddressRefreshCandidate): Promise<AddressRefreshCandidateResult>
}
