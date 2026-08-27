import {describe, expect, it, vi} from "vitest"

vi.mock("~/backend/Backend", () => ({
    prepareCaptureV2: vi.fn(),
    markBrowserReleasedV2: vi.fn(),
}))
import {classifyFtpUrl} from "./FtpCaptureV2"

describe("FTP browser capture", () => {
    it("classifies FTP and both FTPS modes without retaining embedded credentials", () => {
        expect(classifyFtpUrl("ftp://user:secret@example.invalid/file.bin")).toEqual({
            url: "ftp://example.invalid/file.bin",
            mode: "FTP",
            fileName: "file.bin",
            credentialsWithheld: true,
        })
        expect(classifyFtpUrl("ftps://example.invalid:990/file.bin")?.mode).toBe("FTPS_IMPLICIT")
        expect(classifyFtpUrl("ftps://example.invalid:21/file.bin")?.mode).toBe("FTPS_EXPLICIT")
        expect(classifyFtpUrl("sftp://example.invalid/file.bin")).toBeNull()
    })
})
