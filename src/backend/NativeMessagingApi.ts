import {IAppApi} from "~/backend/IAppApi";
import {AddDownloadRequest} from "~/interfaces/AddDownloadRequest";
import {NativeMessagingTransport} from "./nativemessaging/NativeMessagingTransport";


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
            this.transport.disconnect();
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
}
