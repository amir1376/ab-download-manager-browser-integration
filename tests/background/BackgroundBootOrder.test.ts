import {describe, expect, it} from "vitest"
import backgroundSource from "../../src/background/background.ts?raw"

describe("MV3 background startup order", () => {
    it("registers extension-page message handlers before native startup can block", () => {
        const handlerRegistration = backgroundSource.indexOf("receiveMessageFromContentScripts()", backgroundSource.indexOf(".withInit"))
        const nativeBoot = backgroundSource.indexOf("await Backend.boot()", backgroundSource.indexOf(".withInit"))

        expect(handlerRegistration).toBeGreaterThan(0)
        expect(nativeBoot).toBeGreaterThan(handlerRegistration)
    })
})
