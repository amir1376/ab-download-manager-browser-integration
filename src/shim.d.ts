// shim.d.ts

import { ProtocolWithReturn } from "webext-bridge";
import {DownloadRequestHeaders, DownloadRequestItem} from "~/interfaces/DownloadRequestItem";
import {DownloadableMedia} from "~/media/MediaOnTab";
import type {Runtime} from "webextension-polyfill";
import type {YtDlpPanelDownloadData, YtDlpPanelFetchInfoData, YtDlpVideoDownloadData} from "~/background/actions";
import type {YtDlpPanelInfo} from "~/backend/NativeMessagingApi";

declare module "webext-bridge" {
    export interface ProtocolMap {
        add_download: ProtocolWithReturn<DownloadRequestItem[],boolean>;
        ytdlp_video_download: ProtocolWithReturn<YtDlpVideoDownloadData,boolean>;
        ytdlp_panel_fetch_info: ProtocolWithReturn<YtDlpPanelFetchInfoData,YtDlpPanelInfo | null>;
        ytdlp_panel_download: ProtocolWithReturn<YtDlpPanelDownloadData,boolean>;
        downloadable_media_detected: DownloadableMedia[],
        show_alert: string;
        show_log:string[];
        check_selected_text_for_links:null;
        test_http_port: ProtocolWithReturn<number, boolean>;
        test_native_messaging: ProtocolWithReturn<undefined, boolean>;
        is_app_reachable: ProtocolWithReturn<undefined, boolean>;
        get_headers:ProtocolWithReturn<string[],(DownloadRequestHeaders | null)[]>;
        set_holding_key: string;
        get_platform: ProtocolWithReturn<undefined, Runtime.PlatformInfo>,
    }
}
