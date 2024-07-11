// shim.d.ts

import { ProtocolWithReturn } from "webext-bridge";
import {DownloadRequestHeaders, DownloadRequestItem} from "~/interfaces/DownloadRequestItem";

declare module "webext-bridge" {
    export interface ProtocolMap {
        add_download: ProtocolWithReturn<DownloadRequestItem[],boolean>;
        show_alert: string;
        show_log:string[];
        check_selected_text_for_links:null;
        test_port:ProtocolWithReturn<number,boolean>;
        get_headers:ProtocolWithReturn<string[],(DownloadRequestHeaders | null)[]>
    }
}