import {describe, expect, it} from "vitest"

const sensitiveSources = import.meta.glob([
    "../../src/backend/**/*.{ts,tsx}",
    "../../src/background/**/*.{ts,tsx}",
    "../../src/contentscripts/**/*.{ts,tsx}",
    "../../src/contextmenus/**/*.{ts,tsx}",
], {eager: true, query: "?raw", import: "default"}) as Record<string, string>

describe("protected browser context logging policy", () => {
    it("never passes native frames, batch failures, or exception objects to console methods", () => {
        const forbidden = [
            /console\.(?:log|warn|error)\([^\n]*\bmessage\b\s*[,)]/,
            /console\.(?:log|warn|error)\([^\n]*\bfailure\b\s*[,)]/,
            /console\.(?:log|warn|error)\([^\n]*\berror\b\s*[,)]/,
            /console\.log\(\.\.\./,
            /Unhandled native message/,
            /Received invalid native message/,
        ]
        const findings = Object.entries(sensitiveSources).flatMap(([file, source]) =>
            forbidden.filter(pattern => pattern.test(source)).map(pattern => `${file}: ${pattern}`)
        )
        expect(findings).toEqual([])
    })
})
