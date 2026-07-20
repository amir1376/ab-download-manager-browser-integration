const FORBIDDEN_HEADERS = new Set([
    "accept-charset",
    "accept-encoding",
    "access-control-request-headers",
    "access-control-request-method",
    "connection",
    "content-length",
    "cookie",
    "cookie2",
    "date",
    "dnt",
    "expect",
    "host",
    "keep-alive",
    "origin",
    "referer",
    "set-cookie",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "user-agent",
    "via",
]);

const FORBIDDEN_METHODS = new Set([
    "connect",
    "trace",
    "track",
]);

/**
 * some headers are not allowed to pass to the browser.download.create
 *
 * @param name header name
 * @param value header value
 */

export function isForbiddenHeader(
    name: string,
    value?: string,
): boolean {
    const lowerName = name.toLowerCase();

    if (FORBIDDEN_HEADERS.has(lowerName)) {
        return true;
    }

    if (lowerName.startsWith("proxy-")) {
        return true;
    }

    if (lowerName.startsWith("sec-")) {
        return true;
    }

    if (
        lowerName === "x-http-method" ||
        lowerName === "x-http-method-override" ||
        lowerName === "x-method-override"
    ) {
        return value !== undefined &&
            FORBIDDEN_METHODS.has(value.trim().toLowerCase());
    }

    return false;
}
