import type {BrowserBatchReceiptV2, BrowserBatchV2, BrowserIntegrationPolicyV2, CaptureProposalV2, PreparedCaptureV2} from "~/protocol/generated/BrowserIntegrationProtocolV2"
import {PreparedCaptureListV2Schema, PreparedCaptureV2Schema} from "~/protocol/BrowserBridgeV2"
import {BrowserBatchReceiptV2Schema, BrowserIntegrationPolicyV2Schema} from "~/protocol/BrowserIntegrationProtocolV2Schema"

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

    async getPolicy(): Promise<BrowserIntegrationPolicyV2> {
        return BrowserIntegrationPolicyV2Schema.parse(
            await this.request("browser/v2/policy", null, "GET")
        ) as BrowserIntegrationPolicyV2
    }

    async updatePolicy(policy: BrowserIntegrationPolicyV2): Promise<BrowserIntegrationPolicyV2> {
        return BrowserIntegrationPolicyV2Schema.parse(
            await this.request("browser/v2/policy", policy)
        ) as BrowserIntegrationPolicyV2
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

    async submitBatch(batch: BrowserBatchV2): Promise<BrowserBatchReceiptV2> {
        return BrowserBatchReceiptV2Schema.parse(
            await this.request("browser/v2/batches/chunk", batch)
        ) as BrowserBatchReceiptV2
    }

    async cancelBatch(operationId: string): Promise<BrowserBatchReceiptV2 | null> {
        const value = await this.request("browser/v2/batches/cancel", {operationId})
        return value === null ? null : BrowserBatchReceiptV2Schema.parse(value) as BrowserBatchReceiptV2
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
