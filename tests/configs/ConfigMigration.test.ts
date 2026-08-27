import {describe, expect, it, vi} from "vitest"
vi.mock("webextension-polyfill", () => ({default: {storage: {local: {get: vi.fn(), set: vi.fn()}, onChanged: {addListener: vi.fn()}}}}))
vi.mock("~/utils/platform/Platform", () => ({isMac: () => false}))

import {
    CONFIG_MIGRATION_HISTORY_KEY,
    CONFIG_STORAGE_SCHEMA_KEY,
    migrateConfigRecords,
} from "~/configs/Config"

describe("extension config migration ledger", () => {
    it("normalizes legacy keys without deleting one-release compatibility settings", () => {
        const result = migrateConfigRecords({
            sendCookies: true,
            registeredFileTypes: ".ZIP, mp4 rar",
            apiKey: "legacy-bridge-key",
            port: 15151,
        })

        expect(result.records.sendHeaders).toBe(true)
        expect(result.records.registeredFileTypes).toEqual(["zip", "mp4", "rar"])
        expect(result.records.apiKey).toBe("legacy-bridge-key")
        expect(result.records.port).toBe(15151)
        expect(result.writes[CONFIG_STORAGE_SCHEMA_KEY]).toBe(2)
        expect(result.writes[CONFIG_MIGRATION_HISTORY_KEY]).toEqual([
            "v0-to-v1-normalize-legacy-keys",
            "v1-to-v2-authoritative-policy-bridge",
        ])
    })

    it("rejects an unknown future schema instead of resetting user settings", () => {
        expect(() => migrateConfigRecords({[CONFIG_STORAGE_SCHEMA_KEY]: 99, port: 15151})).toThrow("Unsupported future")
    })
})
