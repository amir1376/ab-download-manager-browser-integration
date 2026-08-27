import * as backend from "~/backend/Backend"
import type {BrowserRequestContextV2, CaptureProposalV2} from "~/protocol/generated/BrowserIntegrationProtocolV2"

export type FtpCaptureModeV2 = "FTP" | "FTPS_EXPLICIT" | "FTPS_IMPLICIT"

export function classifyFtpUrl(url: string): {url: string; mode: FtpCaptureModeV2; fileName: string | null; credentialsWithheld: boolean} | null {
    try {
        const parsed = new URL(url)
        if (parsed.protocol !== "ftp:" && parsed.protocol !== "ftps:") return null
        const credentialsWithheld = Boolean(parsed.username || parsed.password)
        parsed.username = ""
        parsed.password = ""
        const mode: FtpCaptureModeV2 = parsed.protocol === "ftp:"
            ? "FTP"
            : parsed.port === "990" ? "FTPS_IMPLICIT" : "FTPS_EXPLICIT"
        const fileName = parsed.pathname.split('/').filter(Boolean).pop() ?? null
        return {url: parsed.toString(), mode, fileName, credentialsWithheld}
    } catch {
        return null
    }
}

export async function captureExplicitFtpV2(
    url: string,
    downloadPage: string | null,
): Promise<void> {
    const classified = classifyFtpUrl(url)
    if (!classified) throw new Error("Unsupported FTP URL")
    const captureId = crypto.randomUUID()
    const context: BrowserRequestContextV2 = {
        originalUrl: classified.url,
        finalUrl: classified.url,
        method: "GET",
        requestHeaders: [], responseHeaders: [], cookies: [], redirects: [],
        referrer: downloadPage,
        documentUrl: downloadPage,
        tabId: -1,
        frameId: -1,
        privateContext: false,
        fileName: classified.fileName,
        mimeType: `application/x-abdm-${classified.mode.toLowerCase()}`,
        proxy: null,
        withheldFields: classified.credentialsWithheld ? ["embeddedCredentials"] : [],
        incompleteFields: ["ftpAuthentication", "ftpRemoteMetadata"],
    }
    const proposal: CaptureProposalV2 = {
        captureId,
        idempotencyKey: captureId,
        browserFamily: "UNKNOWN",
        browserDownloadId: null,
        generation: Date.now(),
        requestContext: context,
        requestedDisposition: "REVIEW",
    }
    const prepared = await backend.prepareCaptureV2(proposal)
    if (prepared.state !== "PREPARED") throw new Error("FTP review was not prepared")
    const committed = await backend.markBrowserReleasedV2(captureId)
    if (committed?.state !== "COMMITTED_REVIEW") throw new Error("FTP review was not committed")
}
