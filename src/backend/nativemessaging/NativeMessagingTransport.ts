import browser, {Runtime} from "webextension-polyfill";
import {AppApiError, NetworkError} from "~/backend/BackendError";
import {
    generateMessageId,
    isNativeMessagingMessage,
    NativeMessagingMessage,
    NativeMessagingMessageContent,
    isMessageIdFromNative,
    processResponseOrThrow,
} from "./NativeMessagingProtocol";


interface PendingRequest {
    readonly resolve: (response: NativeMessagingMessageContent) => void;
    readonly reject: (error: Error) => void;
    readonly timeout: ReturnType<typeof setTimeout>;
}


export class NativeMessagingTransport {

    private port: Runtime.Port | null = null;

    private readonly pendingRequests =
        new Map<string, PendingRequest>();

    private connecting = false;
    private reconnectEnabled = false;
    private reconnectAttempt = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly connectionListeners = new Set<(connected: boolean) => void>();
    private readonly nativeRequestHandlers = new Map<string, (payload: unknown) => Promise<unknown> | unknown>();

    constructor(
        private readonly packageName: string,
        private readonly requestTimeout = 10_000,
    ) {
    }


    connect(): void {
        this.reconnectEnabled = true;
        if (this.port !== null || this.connecting) {
            return;
        }

        this.connecting = true;

        try {
            const port = browser.runtime.connectNative(
                this.packageName
            );
            this.port = port;
            this.reconnectAttempt = 0;
            this.clearReconnectTimer();

            port.onMessage.addListener(this.handleMessage);
            port.onDisconnect.addListener(this.handleDisconnect);
            this.notifyConnection(true);
        } catch (e) {
            this.port = null;
            this.scheduleReconnect();
            throw e;
        } finally {
            this.connecting = false;
        }
    }

    disconnect(): void {
        this.reconnectEnabled = false;
        this.clearReconnectTimer();
        const port = this.port;

        this.port = null;

        port?.disconnect();
        this.notifyConnection(false);
    }

    addConnectionListener(listener: (connected: boolean) => void): () => void {
        this.connectionListeners.add(listener)
        return () => this.connectionListeners.delete(listener)
    }

    addNativeRequestHandler(
        action: string,
        handler: (payload: unknown) => Promise<unknown> | unknown,
    ): () => void {
        if (this.nativeRequestHandlers.has(action)) throw new Error(`Native request handler already exists: ${action}`)
        this.nativeRequestHandlers.set(action, handler)
        return () => this.nativeRequestHandlers.delete(action)
    }

    isConnected(): boolean {
        return this.port !== null;
    }

    async requestTyped<T>(
        action: string,
        payload: unknown,
    ): Promise<T> {

        const response = await this.requestRaw(
            action,
            JSON.stringify(payload),
        );

        try {
            return JSON.parse(response.payload) as T;
        } catch (e) {
            throw new NetworkError(
                `Invalid JSON response for "${action}".`, {
                    cause: e
                }
            );
        }
    }


    private async requestRaw(
        action: string,
        payload: string,
    ): Promise<NativeMessagingMessageContent> {

        const message = this.createMessage(
            action,
            payload,
        );

        const port = this.port;

        if (port == null) {
            return await this.sendOneShot(message);
        }

        return await this.sendUsingConnectedPort(port, message);
    }


    private createMessage(
        action: string,
        payload: string,
    ): NativeMessagingMessage {

        return {
            id: generateMessageId(),

            content: {
                action,
                payload,
                isError: false,
            },
        };
    }


    private sendUsingConnectedPort(
        port: Runtime.Port,
        message: NativeMessagingMessage,
    ): Promise<NativeMessagingMessageContent> {

        return new Promise(
            (resolve, reject) => {
                const timeout = setTimeout(
                    () => {
                        this.pendingRequests.delete(message.id);
                        reject(
                            new NetworkError(
                                `Native request timed out: ${message.content.action}`
                            )
                        );
                    },
                    this.requestTimeout,
                );

                this.pendingRequests.set(
                    message.id,
                    {
                        resolve,
                        reject,
                        timeout,
                    }
                );

                try {
                    port.postMessage(message);
                } catch (e) {
                    clearTimeout(timeout);
                    this.pendingRequests.delete(message.id);
                    reject(
                        new NetworkError(
                            "Failed to send native message",
                            {
                                cause: e
                            }
                        )
                    );
                }
            }
        );
    }

    private async sendOneShot(
        message: NativeMessagingMessage,
    ): Promise<NativeMessagingMessageContent> {
        try {
            const response = await browser.runtime.sendNativeMessage(
                this.packageName,
                message,
            );
            if (!isNativeMessagingMessage(response)) {
                throw new NetworkError(
                    "Invalid response from native messaging host"
                );
            }
            return processResponseOrThrow(response)
        } catch (e) {
            if (e instanceof AppApiError) {
                throw e;
            }
            if (e instanceof NetworkError) {
                throw e
            }
            throw new NetworkError(
                "Failed to send native message", {
                    cause: e
                }
            )
        }
    }

    private handleMessage = (
        message: unknown,
    ): void => {

        if (!isNativeMessagingMessage(message)) {
            console.warn(
                "Received invalid native message",
                message,
            );
            return;
        }

        const pendingRequest = this.pendingRequests.get(message.id);
        if (pendingRequest === undefined) {
            if (isMessageIdFromNative(message.id) && message.content.action) {
                void this.handleNativeRequest(message)
                return
            }
            console.log("Unhandled native message", message,);
            return;
        }

        clearTimeout(pendingRequest.timeout);
        this.pendingRequests.delete(message.id);

        try {
            pendingRequest.resolve(processResponseOrThrow(message))
        } catch (e) {
            let err: Error
            if (e instanceof AppApiError) {
                err = e
            } else if (e instanceof NetworkError) {
                err = e
            } else {
                err = new NetworkError(
                    "Failed to handle native response",
                    {
                        cause: e
                    }
                )
            }
            pendingRequest.reject(err)
        }
    };

    private handleDisconnect = (
        port: Runtime.Port,
    ): void => {

        if (this.port === port) {
            this.port = null;
        }
        this.notifyConnection(false);

        const message =
            port.error?.message ??
            browser.runtime.lastError?.message ??
            "Native messaging was disconnected";

        const error = new NetworkError(message);

        for (const pending of this.pendingRequests.values()) {
            clearTimeout(pending.timeout);
            pending.reject(error);
        }
        this.pendingRequests.clear();
        console.log(
            "Native messaging disconnected:",
            message,
        );
        this.scheduleReconnect();
    };

    private async handleNativeRequest(message: NativeMessagingMessage): Promise<void> {
        const port = this.port
        if (port === null || !message.content.action) return
        const handler = this.nativeRequestHandlers.get(message.content.action)
        if (!handler) {
            port.postMessage(this.createNativeReply(message, true, {
                errorType: "UNSUPPORTED_NATIVE_ACTION",
                message: `Unsupported native action: ${message.content.action}`,
            }))
            return
        }
        try {
            const payload = JSON.parse(message.content.payload)
            const result = await handler(payload)
            port.postMessage(this.createNativeReply(message, false, result))
        } catch {
            port.postMessage(this.createNativeReply(message, true, {
                errorType: "NATIVE_REQUEST_FAILED",
                message: "Native browser request failed",
            }))
        }
    }

    private createNativeReply(
        request: NativeMessagingMessage,
        isError: boolean,
        payload: unknown,
    ): NativeMessagingMessage {
        return {
            id: request.id,
            content: {
                action: null,
                isError,
                payload: JSON.stringify(payload),
            },
        }
    }

    private scheduleReconnect(): void {
        if (!this.reconnectEnabled || this.reconnectTimer !== null || this.port !== null) return
        const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
        this.reconnectAttempt++
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            try {
                this.connect()
            } catch {
                this.scheduleReconnect()
            }
        }, delay)
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
    }

    private notifyConnection(connected: boolean): void {
        for (const listener of this.connectionListeners) {
            try {
                listener(connected)
            } catch (error) {
                console.warn("Native connection listener failed", error)
            }
        }
    }
}

const RECONNECT_DELAYS = [1_000, 2_000, 5_000, 10_000, 30_000] as const
