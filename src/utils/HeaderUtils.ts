export function getContentLength(headers: Headers): number | null {
    const x = headers.get("content-length")
    if (x == null) {
        return null
    }
    const parsed = Number.parseInt(x, 10)
    return Number.isFinite(parsed) ? parsed : null
}

export function getContentType(headers: Headers): string | null {
    return headers.get("content-type")
}

export function getContentDisposition(headers: Headers): string | null {
    return headers.get("content-disposition")
}
