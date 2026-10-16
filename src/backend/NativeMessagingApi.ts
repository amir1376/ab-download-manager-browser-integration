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

    async ytdlpVideoDownload(
        request: { url: string },
    ): Promise<boolean> {
        return await this.transport.requestTyped<boolean>(
            "ytdlp_video",
            request,
        );
    }

    /**
     * IDM-style panel: fetch video info (title + formats) without opening
     * the app dialog. May take a while (yt-dlp network fetch), so this
     * uses a generous timeout.
     */
    async ytdlpFetchInfo(
        request: { url: string },
    ): Promise<YtDlpPanelInfo> {
        return await this.transport.requestTyped<YtDlpPanelInfo>(
            "ytdlp_fetch_info",
            request,
            120_000,
        );
    }

    /**
     * IDM-style panel: start the download in the app background
     * (no dialog opened).
     */
    async ytdlpPanelDownload(
        request: { url: string; formatId: string; title?: string },
    ): Promise<boolean> {
        return await this.transport.requestTyped<boolean>(
            "ytdlp_download",
            request,
        );
    }
}

export interface YtDlpPanelFormat {
    formatId: string;
    resolution: string;
    ext: string | null;
    sizeBytes: number | null;
}

export interface YtDlpPanelInfo {
    title: string;
    durationSeconds: number | null;
    formats: YtDlpPanelFormat[];
}
