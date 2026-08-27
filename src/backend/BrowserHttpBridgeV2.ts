import type {CaptureProposalV2, PreparedCaptureV2} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import {PreparedCaptureListV2Schema, PreparedCaptureV2Schema} from "~/protocol/BrowserBridgeV2"

export class BrowserHttpBridgeV2 {
    constructor(
        private readonly baseUrl: string,
        private readonly apiKey: string,
        private readonly requestTimeout = 10_000,
    ) {
        const parsed = new URL(baseUrl)
        if (parsed.protocol !== "http:" || (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "[::1]" && parsed.hostname !== "::1")) {
            throw new Error("Browser bridge HTTP endpoint must be loopback")
        }
    }

    async prepareCapture(proposal: CaptureProposalV2): Promise<PreparedCaptureV2> {
        return PreparedCaptureV2Schema.parse(
            await this.request("browser/v2/captures/prepare", proposal)
        ) as PreparedCaptureV2
    }

    async markBrowserReleased(captureId: string): Promise<PreparedCaptureV2 | null> {
        const value = await this.request("browser/v2/captures/released", {captureId})
        return value === null ? null : PreparedCaptureV2Schema.parse(value) as PreparedCaptureV2
    }

    async listPreparedCaptures(): Promise<PreparedCaptureV2[]> {
        return PreparedCaptureListV2Schema.parse(
            await this.request("browser/v2/captures/prepared", null, "GET")
        ) as PreparedCaptureV2[]
    }

    async abortCapture(captureId: string): Promise<PreparedCaptureV2 | null> {
        const value = await this.request("browser/v2/captures/abort", {captureId})
        return value === null ? null : PreparedCaptureV2Schema.parse(value) as PreparedCaptureV2
    }

    private async request(path: string, payload: unknown, method: "GET" | "POST" = "POST"): Promise<unknown> {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.requestTimeout)
        try {
            const response = await fetch(new URL(path, this.baseUrl), {
                method,
                headers: {
                    "X-Api-Key": this.apiKey,
                    ...(method === "POST" ? {"Content-Type": "application/json"} : {}),
                },
                body: method === "POST" ? JSON.stringify(payload) : undefined,
                signal: controller.signal,
            })
            if (!response.ok) throw new Error(`Browser bridge request failed: ${response.status}`)
            return await response.json()
        } finally {
            clearTimeout(timeout)
        }
    }
}
