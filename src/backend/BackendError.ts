import {NativeMessagingErrorPayload} from "~/backend/nativemessaging/NativeMessagingProtocol";

export abstract class AppApiError extends Error {
    abstract getBackendErrorType(): string | null

    abstract getBackendErrorMessage(): string | null

    toLoggableString(): string {
        const type = this.getBackendErrorType() ?? "Error"
        const reason = this.getBackendErrorMessage() ?? "Not known"

        return `${type}: ${reason}`
    }
}

export class HttpApiError extends AppApiError {
    getBackendErrorType(): string | null {
        return `${this.response.status}`
    }

    getBackendErrorMessage(): string | null {
        return this.response.statusText
    }

    constructor(public response: Response) {
        super(
            `${response.status}: ${response.statusText}`
        );
    }
}

export class NativeMessagingApiError extends AppApiError {
    constructor(public response: NativeMessagingErrorPayload) {
        super(
            `${response.errorType}: ${response.message}`
        );
    }

    getBackendErrorMessage(): string | null {
        return this.response.message
    }

    getBackendErrorType(): string | null {
        return this.response.errorType
    }
}

export class NetworkError extends Error {
}
