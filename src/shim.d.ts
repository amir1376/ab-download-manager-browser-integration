// shim.d.ts

import { ProtocolWithReturn } from "webext-bridge";
import {DownloadRequestHeaders, DownloadRequestItem} from "~/interfaces/DownloadRequestItem";
import {DownloadableMedia} from "~/media/MediaOnTab";
import type {Runtime} from "webextension-polyfill";

declare module "webext-bridge" {
    export interface ProtocolMap {
        add_download: ProtocolWithReturn<DownloadRequestItem[],boolean>;
        downloadable_media_detected: DownloadableMedia[],
        show_alert: string;
        show_log:string[];
        check_selected_text_for_links:null;
        test_http_port: ProtocolWithReturn<number, boolean>;
        test_native_messaging: ProtocolWithReturn<undefined, boolean>;
        is_app_reachable: ProtocolWithReturn<undefined, boolean>;
        get_headers:ProtocolWithReturn<string[],(DownloadRequestHeaders | null)[]>;
        set_holding_key: {key: string; pressed: boolean};
        get_platform: ProtocolWithReturn<undefined, Runtime.PlatformInfo>,
        get_browser_policy_status_v2: ProtocolWithReturn<null, unknown>;
        update_browser_policy_v2: ProtocolWithReturn<unknown, unknown>;
        reconcile_browser_permissions_v2: ProtocolWithReturn<null, unknown>;
        set_tab_capture_bypass_v2: ProtocolWithReturn<{tabId: number; bypassed: boolean}, boolean>;
        recapture_browser_download_v2: ProtocolWithReturn<number, boolean>;
    }
}
