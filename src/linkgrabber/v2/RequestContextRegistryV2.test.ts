import {beforeEach, describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => ({
    getAll: vi.fn(async () => [{
        name: "session", value: "secret", domain: ".example.invalid", path: "/",
        secure: true, httpOnly: true, sameSite: "lax", expirationDate: 10_000,
        storeId: "default", session: false,
    }]),
    getProxy: vi.fn(async () => ({value: {mode: "fixed_servers", rules: {singleProxy: {scheme: "https", host: "proxy.invalid", port: 8443}}}})),
}))

vi.mock("webextension-polyfill", () => ({default: {
    cookies: {getAll: mocks.getAll},
    proxy: {settings: {get: mocks.getProxy}},
}}))

import {RequestContextRegistryV2} from "./RequestContextRegistryV2"

describe("RequestContextRegistryV2", () => {
    beforeEach(() => {
        mocks.getAll.mockClear()
        mocks.getProxy.mockClear()
    })

    it("preserves POST bytes, duplicate headers, redirects, cookies, and response metadata", async () => {
        const registry = new RequestContextRegistryV2(() => 2_000)
        registry.observeBeforeRequest({
            requestId: "r1", url: "https://example.invalid/start", method: "POST", tabId: 1, frameId: 0,
            parentFrameId: -1, timeStamp: 1_000, documentUrl: "https://example.invalid/page",
            originUrl: "https://example.invalid", type: "main_frame",
            requestBody: {raw: [{bytes: new TextEncoder().encode("a=1").buffer}]},
        } as any)
        registry.observeSendHeaders({
            requestId: "r1", url: "https://example.invalid/start", method: "POST", tabId: 1, frameId: 0,
            parentFrameId: -1, timeStamp: 1_001, type: "main_frame",
            requestHeaders: [{name: "Accept", value: "application/octet-stream"}, {name: "Accept", value: "*/*"}],
        } as any)
        registry.observeRedirect({
            requestId: "r1", url: "https://example.invalid/start", redirectUrl: "https://cdn.example.invalid/file.bin",
            statusCode: 302, responseHeaders: [{name: "Location", value: "https://cdn.example.invalid/file.bin"}],
        } as any)
        registry.observeHeadersReceived({
            requestId: "r1", url: "https://cdn.example.invalid/file.bin", statusCode: 200, ip: "192.0.2.5",
            responseHeaders: [{name: "Content-Type", value: "application/octet-stream"}, {name: "Content-Length", value: "3"}],
        } as any)
        const download = {
            id: 4, url: "https://cdn.example.invalid/file.bin", startTime: new Date(1_005).toISOString(),
            referrer: "https://example.invalid/page", incognito: false, filename: "file.bin", fileSize: 3,
        } as any
        const match = registry.matchDownload(download)
        expect(match.kind).toBe("MATCHED")
        if (match.kind !== "MATCHED") throw new Error("Expected match")
        const context = await registry.createContext(match.record, download)

        expect(context.method).toBe("POST")
        expect(context.requestHeaders.map(value => value.name)).toEqual(["Accept", "Accept"])
        expect(context.redirects).toHaveLength(1)
        expect(context.requestBody?.byteLength).toBe(3)
        expect(context.cookies[0].sameSite).toBe("LAX")
        expect(context.remoteAddress).toBe("192.0.2.5")
        expect(context.proxy).toEqual({type: "HTTPS", endpoint: "proxy.invalid:8443", usernameRef: null})
    })

    it("fails ambiguous identical URL correlation open to the browser", () => {
        const registry = new RequestContextRegistryV2(() => 2_000)
        for (const requestId of ["r1", "r2"]) {
            registry.observeBeforeRequest({
                requestId, url: "https://example.invalid/file", method: "GET", tabId: 1, frameId: 0,
                parentFrameId: -1, timeStamp: 1_000, type: "main_frame",
            } as any)
        }
        expect(registry.matchDownload({
            url: "https://example.invalid/file", startTime: new Date(1_001).toISOString(),
        } as any).kind).toBe("AMBIGUOUS")
    })

    it("restores bounded worker state and fails POST capture open when its body cannot be retained", async () => {
        const first = new RequestContextRegistryV2(() => 2_000)
        first.observeBeforeRequest({
            requestId: "post", url: "https://example.invalid/export", method: "POST", tabId: 2, frameId: 0,
            timeStamp: 1_000, type: "xmlhttprequest",
            requestBody: {raw: [{bytes: new TextEncoder().encode("secret-body").buffer}]},
        } as any)
        const fullSnapshot = first.exportSnapshot()
        expect(JSON.stringify(fullSnapshot)).not.toContain("requestBodyBytes")
        expect(JSON.stringify(fullSnapshot)).not.toContain("secret-body")
        const restored = new RequestContextRegistryV2(() => 2_001)
        expect(restored.restoreSnapshot(fullSnapshot)).toBe(1)
        const matched = restored.matchDownload({url: "https://example.invalid/export", startTime: new Date(1_001).toISOString()} as any)
        expect(matched.kind).toBe("MATCHED")
        if (matched.kind !== "MATCHED") throw new Error("Expected match")
        expect(restored.canCapture(matched.record)).toBe(true)

        const bounded = new RequestContextRegistryV2(() => 2_001)
        bounded.restoreSnapshot(first.exportSnapshot(0))
        const omitted = bounded.matchDownload({url: "https://example.invalid/export", startTime: new Date(1_001).toISOString()} as any)
        expect(omitted.kind).toBe("MATCHED")
        if (omitted.kind !== "MATCHED") throw new Error("Expected match")
        expect(bounded.canCapture(omitted.record)).toBe(false)
    })

    it("withholds protected context when FULL consent did not authorize it", async () => {
        const registry = new RequestContextRegistryV2(() => 2_000)
        registry.observeBeforeRequest({
            requestId: "r-private", url: "https://example.invalid/file", method: "POST", tabId: 1, frameId: 0,
            timeStamp: 1_000, type: "main_frame",
            requestBody: {raw: [{bytes: new TextEncoder().encode("secret").buffer}]},
        } as any)
        registry.observeSendHeaders({
            requestId: "r-private", url: "https://example.invalid/file", method: "POST", tabId: 1, frameId: 0,
            timeStamp: 1_001, type: "main_frame", requestHeaders: [{name: "Authorization", value: "secret"}],
        } as any)
        const download = {url: "https://example.invalid/file", startTime: new Date(1_001).toISOString(), incognito: false} as any
        const match = registry.matchDownload(download)
        if (match.kind !== "MATCHED") throw new Error("Expected match")
        const context = await registry.createContext(match.record, download, false)

        expect(context.requestBody).toBeNull()
        expect(context.requestHeaders).toEqual([])
        expect(context.cookies).toEqual([])
        expect(context.proxy).toBeNull()
        expect(context.withheldFields).toContain("requestHeaders:policy")
        expect(mocks.getAll).not.toHaveBeenCalled()
    })
})
