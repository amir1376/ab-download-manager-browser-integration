const GOOGLE_DRIVE_PAGE_HOST = "drive.google.com"
const GOOGLE_DRIVE_DOWNLOAD_HOST = "drive.usercontent.google.com"

function hasHost(url: string | null, expectedHost: string): boolean {
    if (!url) {
        return false
    }
    try {
        return new URL(url).hostname === expectedHost
    } catch (_) {
        return false
    }
}

/**
 * Google Drive may issue several downloadable responses while preparing an
 * archive. Let the browser finish that workflow and capture its final download
 * through browser.downloads.onCreated instead.
 */
export function shouldDeferGoogleDriveDownloadToBrowser(
    downloadPage: string | null,
    downloadUrl: string,
): boolean {
    return hasHost(downloadPage, GOOGLE_DRIVE_PAGE_HOST)
        || hasHost(downloadUrl, GOOGLE_DRIVE_PAGE_HOST)
        || hasHost(downloadUrl, GOOGLE_DRIVE_DOWNLOAD_HOST)
}
