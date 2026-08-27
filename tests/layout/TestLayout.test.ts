import {describe, expect, it} from "vitest"

describe("test source layout", () => {
    it("keeps all extension tests out of the production src tree", () => {
        const misplaced = import.meta.glob("../../src/**/*.test.{ts,tsx}")
        expect(Object.keys(misplaced)).toEqual([])
    })
})
