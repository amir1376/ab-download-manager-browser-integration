import {describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => ({
    events: [] as Array<{addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn>}>,
    close: vi.fn(),
}))
function event() { const value = {addListener: vi.fn(), removeListener: vi.fn()}; mocks.events.push(value); return value }
vi.mock("webextension-polyfill", () => ({default: {
    webRequest: {
        onBeforeRequest: event(), onSendHeaders: event(), onBeforeRedirect: event(),
        onHeadersReceived: event(), onCompleted: event(), onErrorOccurred: event(),
    },
    tabs: {onRemoved: event()},
    downloads: {onCreated: event(), pause: vi.fn(), cancel: vi.fn(), erase: vi.fn(), resume: vi.fn()},
}}))
vi.mock("~/utils/ExtensionInfo", () => ({isChrome: () => true}))
vi.mock("./AddressRefreshCaptureCoordinator", () => ({AddressRefreshCaptureCoordinator: class {
    boot = vi.fn(async () => undefined); close = mocks.close
    observeBeforeRequest = vi.fn(); observeSendHeaders = vi.fn(); observeRedirect = vi.fn(); observeResponse = vi.fn()
    forget = vi.fn(); onTabClosed = vi.fn(); shouldCancelBrowserDownload = vi.fn(() => false)
}}))

import {bootAddressRefreshObserverV2} from "./AddressRefreshObserverV2"

describe("address refresh observer lifecycle", () => {
    it("removes every browser listener and clears coordinator timers on policy teardown", async () => {
        const stop = await bootAddressRefreshObserverV2()
        expect(mocks.events.every(value => value.addListener.mock.calls.length === 1)).toBe(true)
        stop()
        expect(mocks.events.every(value => value.removeListener.mock.calls.length === 1)).toBe(true)
        expect(mocks.close).toHaveBeenCalledOnce()
    })
})
