import {describe, expect, it} from "vitest"

const catalogs = import.meta.glob("../../public/_locales/*/messages.json", {eager: true, import: "default"}) as Record<string, Record<string, {message: string}>>
const sourceFiles = import.meta.glob("../../src/**/*.{ts,tsx}", {eager: true, query: "?raw", import: "default"}) as Record<string, string>

describe("extension locale catalogs", () => {
    it("ships 17 complete locale catalogs with the same user-visible key surface", () => {
        expect(Object.keys(catalogs)).toHaveLength(17)
        const englishEntry = Object.entries(catalogs).find(([path]) => path.includes("/_locales/en/"))
        expect(englishEntry).toBeDefined()
        const englishKeys = Object.keys(englishEntry![1]).sort()
        for (const [path, catalog] of Object.entries(catalogs)) {
            expect(Object.keys(catalog).sort()).toEqual(englishKeys)
            expect(Object.values(catalog).every(value => typeof value.message === "string" && value.message.length > 0)).toBe(true)
            for (const key of englishKeys) {
                const tokens = (message: string) => [...message.matchAll(/\$[A-Za-z0-9_]+\$/g)].map(match => match[0]).sort()
                expect(tokens(catalog[key].message), `${path}/${key}`).toEqual(tokens(englishEntry![1][key].message))
            }
            if (!path.includes("/_locales/en/")) {
                const localized = englishKeys.filter(key => catalog[key].message !== englishEntry![1][key].message)
                expect(localized.length, `${path} localized coverage`).toBeGreaterThanOrEqual(Math.floor(englishKeys.length * .9))
            }
        }
    })

    it("defines every literal localization key referenced by production source", () => {
        const english = Object.entries(catalogs).find(([path]) => path.includes("/_locales/en/"))![1]
        const referenced = new Set<string>()
        const patterns = [/(?:browser\.i18n\.getMessage|\bt)\(\s*["']([^"']+)["']/g]
        for (const source of Object.values(sourceFiles)) {
            for (const pattern of patterns) {
                for (const match of source.matchAll(pattern)) referenced.add(match[1])
            }
        }
        expect([...referenced].filter(key => !key.startsWith("@@") && !(key in english))).toEqual([])
    })
})
