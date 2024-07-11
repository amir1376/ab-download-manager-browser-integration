import {DownloadLinkInterceptor} from "~/linkgrabber/DownloadLinkInterceptor";
import type {WebRequest} from "webextension-polyfill";


export class Manifest2DownloadLinkInterceptor extends DownloadLinkInterceptor {
    cancelResponse(): WebRequest.BlockingResponse {
        return {
            cancel: true
        }
    }

    passResponse(): WebRequest.BlockingResponse {
        return {
            cancel: false
        }
    }

    canBlockResponse(): boolean {
        return true;
    }
}