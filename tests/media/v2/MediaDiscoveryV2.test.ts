import {describe, expect, it, vi} from "vitest"
vi.mock("webextension-polyfill", () => ({default: {}}))
import {classifyMediaCandidateV2, safeAdapterRegexV2} from "~/media/v2/MediaDiscoveryV2"

describe("generic media discovery classification", () => {
    it("recognizes progressive HLS DASH TS and fragmented MP4 without treating arbitrary pages as media", () => {
        expect(classifyMediaCandidateV2("https://cdn.invalid/master.m3u8", "application/vnd.apple.mpegurl")).toBe("HLS")
        expect(classifyMediaCandidateV2("https://cdn.invalid/manifest.mpd", "application/dash+xml")).toBe("DASH")
        expect(classifyMediaCandidateV2("https://cdn.invalid/segment.m4s", "video/iso.segment")).toBe("PROGRESSIVE")
        expect(classifyMediaCandidateV2("https://cdn.invalid/segment.ts", "video/mp2t")).toBe("PROGRESSIVE")
        expect(classifyMediaCandidateV2("https://example.invalid/watch", "text/html")).toBeNull()
    })

    it("contains invalid and obviously catastrophic native adapter regexes", () => {
        expect(safeAdapterRegexV2("[invalid")).toBeNull()
        expect(safeAdapterRegexV2("(a+)+$")).toBeNull()
        expect(safeAdapterRegexV2("https://cdn\\.invalid/.+\\.mp4")).not.toBeNull()
    })
})
