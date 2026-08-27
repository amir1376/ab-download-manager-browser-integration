import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {describe, expect, it} from "vitest"
// @ts-expect-error The release helper is intentionally plain Node ESM.
import {createDeterministicZip} from "../../scripts/deterministic-zip.mjs"

describe("release-candidate archive", () => {
    it("is byte-for-byte reproducible and uses sorted fixed-time entries", async () => {
        const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "abdm-release-zip-"))
        try {
            const input = path.join(temporary, "input")
            fs.mkdirSync(path.join(input, "nested"), {recursive: true})
            fs.writeFileSync(path.join(input, "z.txt"), "last")
            fs.writeFileSync(path.join(input, "nested", "a.txt"), "first")
            const first = path.join(temporary, "first.zip")
            const second = path.join(temporary, "second.zip")
            createDeterministicZip(input, first, 1_700_000_000)
            fs.utimesSync(path.join(input, "z.txt"), new Date(), new Date())
            createDeterministicZip(input, second, 1_700_000_000)

            expect(sha256(first)).toBe(sha256(second))
            expect(fs.readFileSync(first, {encoding: null}).subarray(0, 4).toString("hex")).toBe("504b0304")
        } finally {
            fs.rmSync(temporary, {recursive: true, force: true})
        }
    })
})

function sha256(file: string): string {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}
