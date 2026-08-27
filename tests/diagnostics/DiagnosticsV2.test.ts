import {beforeEach, describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => ({
    values: new Map<string, unknown>(),
}))

vi.mock("webextension-polyfill", () => ({default: {
    storage: {local: {
        get: vi.fn(async (key: string) => ({[key]: mocks.values.get(key)})),
        set: vi.fn(async (items: Record<string, unknown>) => Object.entries(items).forEach(([key, value]) => mocks.values.set(key, value))),
        remove: vi.fn(async (key: string) => mocks.values.delete(key)),
    }},
}}))

import {clearSafeDiagnosticsV2, listSafeDiagnosticsV2, reportSafeDiagnosticV2} from "~/diagnostics/DiagnosticsV2"

describe("privacy-safe integration diagnostics", () => {
    beforeEach(() => mocks.values.clear())

    it("stores only bounded code-only entries and deduplicates by code", async () => {
        vi.spyOn(Date, "now").mockReturnValueOnce(10).mockReturnValueOnce(20)
        await reportSafeDiagnosticV2("NATIVE_UNAVAILABLE", "ERROR", "RETRY_CONNECTION")
        await reportSafeDiagnosticV2("NATIVE_UNAVAILABLE", "WARNING", "UPDATE_DESKTOP")
        await reportSafeDiagnosticV2("https://private.example/secret", "ERROR", "NONE")

        expect(await listSafeDiagnosticsV2()).toEqual([{
            code: "NATIVE_UNAVAILABLE",
            severity: "WARNING",
            recovery: "UPDATE_DESKTOP",
            createdAtEpochMs: 20,
        }])
    })

    it("rejects malformed persisted values and clears the diagnostic store", async () => {
        mocks.values.set("safe-diagnostics-v2", [
            {code: "GOOD_CODE", severity: "INFO", recovery: "NONE", createdAtEpochMs: 1},
            {code: "contains a URL", severity: "ERROR", recovery: "NONE", createdAtEpochMs: 2},
            {code: "BAD_SEVERITY", severity: "fatal", recovery: "NONE", createdAtEpochMs: 3},
            {code: "BAD_RECOVERY", severity: "ERROR", recovery: "OPEN_URL", createdAtEpochMs: 4},
        ])

        expect(await listSafeDiagnosticsV2()).toEqual([
            {code: "GOOD_CODE", severity: "INFO", recovery: "NONE", createdAtEpochMs: 1},
        ])
        await clearSafeDiagnosticsV2()
        expect(await listSafeDiagnosticsV2()).toEqual([])
    })
})
