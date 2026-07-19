import {NativeMessagingApiError, NetworkError} from "~/backend/BackendError";
import {z} from "~/utils/Zod";

const BROWSER_ID_PREFIX = "B_";
const NATIVE_ID_PREFIX = "N_";

const NativeMessagingMessageIdType = z.string()
export type NativeMessagingMessageId = z.infer<typeof NativeMessagingMessageIdType>

export function isMessageIdFromBrowser(id: NativeMessagingMessageId) {
    return id.startsWith(BROWSER_ID_PREFIX)
}

export function isMessageIdFromNative(id: NativeMessagingMessageId) {
    return id.startsWith(NATIVE_ID_PREFIX)
}

export function generateMessageId(): NativeMessagingMessageId {
    return BROWSER_ID_PREFIX + crypto.randomUUID();
}

const NativeMessagingMessageContentType = z.object({
    action: z.string().nullable(),
    isError: z.boolean(),
    payload: z.string(),
});
export type NativeMessagingMessageContent = z.infer<typeof NativeMessagingMessageContentType>;

const NativeMessagingMessageType = z.object({
    id: NativeMessagingMessageIdType,
    content: NativeMessagingMessageContentType,
});
export type NativeMessagingMessage = z.infer<typeof NativeMessagingMessageType>;

const NativeMessagingErrorPayloadType = z.object({
    errorType: z.string().nullable().catch(null),
    message: z.string().nullable().catch(null),
}).catch(() => ({
    errorType: null,
    message: null,
}))

export type NativeMessagingErrorPayload = z.infer<typeof NativeMessagingErrorPayloadType>;

export function isNativeMessagingMessage(
    value: unknown,
): value is NativeMessagingMessage {
    return NativeMessagingMessageType.safeParse(value).success;
}

export function processResponseOrThrow(
    message: NativeMessagingMessage,
): NativeMessagingMessageContent {
    if (message.content.isError) {
        throw decodeError(message);
    }
    return message.content;
}

export function decodeError(
    message: NativeMessagingMessage,
): NetworkError {
    let raw: unknown;
    try {
        raw = JSON.parse(message.content.payload);
    } catch {
        raw = {};
    }
    const payload = NativeMessagingErrorPayloadType.parse(raw);
    return new NativeMessagingApiError(payload);
}
