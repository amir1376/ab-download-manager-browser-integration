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
})
