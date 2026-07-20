import {DownloadLinkInterceptor} from "~/linkgrabber/DownloadLinkInterceptor";

export class Manifest3DownloadLinkInterceptor extends DownloadLinkInterceptor {
    cancelResponse(): any {
        // in manifest 3 we can't pass or block
        return;
    }

    passResponse(): any {
        // in manifest 3 we can't pass or block
        return;
    }

    canBlockResponse(): boolean {
        return false;
    }
}

