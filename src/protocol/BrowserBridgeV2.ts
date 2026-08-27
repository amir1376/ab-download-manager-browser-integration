import {z} from "~/utils/Zod"
import {BrowserIntegrationCapabilitiesV2Schema} from "./BrowserIntegrationProtocolV2Schema"
import type {BrowserIntegrationCapabilitiesV2} from "./generated/BrowserIntegrationProtocolV2"

export interface BrowserHttpFallbackV2 {
    baseUrl: string
    apiKey: string
    headerName: string
}

export interface BrowserHelloResponseV2 {
    capabilities: BrowserIntegrationCapabilitiesV2
    httpFallback: BrowserHttpFallbackV2
}

export const BrowserHelloResponseV2Schema = z.object({
    capabilities: BrowserIntegrationCapabilitiesV2Schema,
    httpFallback: z.object({
        baseUrl: z.string().url().refine(value => {
            const url = new URL(value)
            return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1")
        }, "browser HTTP fallback must be loopback"),
        apiKey: z.string().min(16).max(4096),
        headerName: z.literal("X-Api-Key"),
    }),
})

let currentHello: BrowserHelloResponseV2 | null = null

export function setBrowserHelloV2(value: unknown): BrowserHelloResponseV2 {
    currentHello = BrowserHelloResponseV2Schema.parse(value) as BrowserHelloResponseV2
    return currentHello
}

export function getBrowserHelloV2(): BrowserHelloResponseV2 | null {
    return currentHello
}

export function clearBrowserHelloV2(): void {
    currentHello = null
}
