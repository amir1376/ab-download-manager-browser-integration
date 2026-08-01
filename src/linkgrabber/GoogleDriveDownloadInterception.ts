const GOOGLE_DRIVE_PAGE_HOST = "drive.google.com"
const GOOGLE_DRIVE_DOWNLOAD_HOST = "drive.usercontent.google.com"

function hasHost(url: string | null, expectedHost: string, includeSubdomains = false): boolean {
    if (!url) {
        return false
    }
    try {
        const host = new URL(url).hostname
        return host === expectedHost || (includeSubdomains && host.endsWith(`.${expectedHost}`))
    } catch (_) {
        return false
    }
}

/**
 * Google Drive may issue several browser downloads for one generated archive.
 * Let those responses reach browser.downloads.onCreated so they can be grouped.
 */
export function shouldDeferGoogleDriveDownloadToBrowser(
    downloadPage: string | null,
    downloadUrl: string,
): boolean {
    return hasHost(downloadPage, GOOGLE_DRIVE_PAGE_HOST)
        || hasHost(downloadUrl, GOOGLE_DRIVE_PAGE_HOST)
        || hasHost(downloadUrl, GOOGLE_DRIVE_DOWNLOAD_HOST, true)
}
