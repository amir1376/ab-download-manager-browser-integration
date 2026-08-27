import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => {
    const disconnectListeners: Array<(port: any) => void> = []
    const messageListeners: Array<(message: unknown) => void> = []
    const port: any = {
        error: null,
        postMessage: vi.fn(),
        disconnect: vi.fn(),
        onDisconnect: {addListener: vi.fn((listener: (port: any) => void) => disconnectListeners.push(listener))},
        onMessage: {addListener: vi.fn((listener: (message: unknown) => void) => messageListeners.push(listener))},
    }
    return {
        disconnectListeners,
        messageListeners,
        port,
        connectNative: vi.fn(() => port),
    }
})

vi.mock("webextension-polyfill", () => ({
    default: {
        runtime: {
            connectNative: mocks.connectNative,
            sendNativeMessage: vi.fn(),
            lastError: null,
        },
    },
}))

import {NativeMessagingTransport} from "~/backend/nativemessaging/NativeMessagingTransport"

describe("NativeMessagingTransport reconnect policy", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        mocks.connectNative.mockClear()
        mocks.port.disconnect.mockClear()
        mocks.port.postMessage.mockClear()
        mocks.disconnectListeners.length = 0
        mocks.messageListeners.length = 0
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("reconnects after an unexpected disconnect with bounded backoff", async () => {
        const transport = new NativeMessagingTransport("com.abdownloadmanager")
        transport.connect()
        expect(mocks.connectNative).toHaveBeenCalledTimes(1)

        mocks.disconnectListeners[0](mocks.port)
        await vi.advanceTimersByTimeAsync(1_000)
        expect(mocks.connectNative).toHaveBeenCalledTimes(2)
    })

    it("does not reconnect after an intentional disconnect", async () => {
        const transport = new NativeMessagingTransport("com.abdownloadmanager")
        transport.connect()
        transport.disconnect()
        await vi.advanceTimersByTimeAsync(30_000)

        expect(mocks.connectNative).toHaveBeenCalledTimes(1)
    })

    it("dispatches a native-initiated request and replies on the persistent port", async () => {
        const transport = new NativeMessagingTransport("com.abdownloadmanager")
        transport.addNativeRequestHandler("queryBrowserContextV2", async payload => ({
            accepted: (payload as {tabId: number}).tabId === 7,
        }))
        transport.connect()

        mocks.messageListeners[0]({
            id: "N_request-1",
            content: {
                action: "queryBrowserContextV2",
                isError: false,
                payload: JSON.stringify({tabId: 7}),
            },
        })
        await vi.runAllTimersAsync()

        expect(mocks.port.postMessage).toHaveBeenCalledWith({
            id: "N_request-1",
            content: {
                action: null,
                isError: false,
                payload: JSON.stringify({accepted: true}),
            },
        })
    })
})
