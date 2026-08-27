import {IAppApi} from "~/backend/IAppApi";
import {AddDownloadRequest} from "~/interfaces/AddDownloadRequest";
import {NativeMessagingTransport} from "./nativemessaging/NativeMessagingTransport";
import {
    AddressRefreshCandidate,
    AddressRefreshCandidateResult,
    AddressRefreshCapabilities,
    AddressRefreshSession
} from "~/interfaces/AddressRefresh";
import {BrowserHelloResponseV2, BrowserHelloResponseV2Schema} from "~/protocol/BrowserBridgeV2";
import {PreparedCaptureListV2Schema, PreparedCaptureV2Schema} from "~/protocol/BrowserBridgeV2";
import type {CaptureProposalV2, PreparedCaptureV2} from "~/protocol/generated/BrowserIntegrationProtocolV2";


export class NativeMessagingApi implements IAppApi {

    constructor(
        private readonly transport: NativeMessagingTransport,
    ) {
    }

    async test() {
        try {
            await this.ping()
            return true
        } catch (e) {
            return false
        }
    }

    connect(): void {
        this.transport.connect();
    }

    disconnect(): void {
        this.transport.disconnect();
    }

    isConnected(): boolean {
        return this.transport.isConnected();
    }

    async connectAndTest(): Promise<boolean> {
        try {
            this.transport.connect();
            await this.ping();
            return true;
        } catch (e) {
            console.error(
                "Cannot connect to native messaging host",
                e,
            );
            return false;
        }
    }

    async addDownload(
        request: AddDownloadRequest,
    ): Promise<boolean> {
        return await this.transport.requestTyped<boolean>(
            "add",
            request,
        );
    }

    async ping(): Promise<boolean> {
        await this.transport.requestTyped<void>(
            "ping",
            null,
        );
        return true;
    }

    addressRefreshCapabilities(): Promise<AddressRefreshCapabilities> {
        return this.transport.requestTyped("addressRefreshCapabilities", null)
    }

    addressRefreshSessions(): Promise<AddressRefreshSession[]> {
        return this.transport.requestTyped("addressRefreshSessions", null)
    }

    submitAddressRefreshCandidate(candidate: AddressRefreshCandidate): Promise<AddressRefreshCandidateResult> {
        return this.transport.requestTyped("addressRefreshCandidate", candidate)
    }

    async helloV2(): Promise<BrowserHelloResponseV2> {
        return BrowserHelloResponseV2Schema.parse(
            await this.transport.requestTyped<unknown>("helloV2", null)
        ) as BrowserHelloResponseV2
    }

    async prepareCaptureV2(proposal: CaptureProposalV2): Promise<PreparedCaptureV2> {
        return PreparedCaptureV2Schema.parse(
            await this.transport.requestTyped<unknown>("prepareCaptureV2", proposal)
        ) as PreparedCaptureV2
    }

    async markBrowserReleasedV2(captureId: string): Promise<PreparedCaptureV2 | null> {
        const value = await this.transport.requestTyped<unknown>("browserReleasedV2", {captureId})
        return value === null ? null : PreparedCaptureV2Schema.parse(value) as PreparedCaptureV2
    }

    async listPreparedCapturesV2(): Promise<PreparedCaptureV2[]> {
        return PreparedCaptureListV2Schema.parse(
            await this.transport.requestTyped<unknown>("listPreparedCapturesV2", null)
        ) as PreparedCaptureV2[]
    }

    async abortCaptureV2(captureId: string): Promise<PreparedCaptureV2 | null> {
        const value = await this.transport.requestTyped<unknown>("abortCaptureV2", {captureId})
        return value === null ? null : PreparedCaptureV2Schema.parse(value) as PreparedCaptureV2
    }
}
