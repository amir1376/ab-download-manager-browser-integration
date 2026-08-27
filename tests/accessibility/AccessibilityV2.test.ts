import {describe, expect, it} from "vitest"
import {getManifestForChrome} from "~/manifest/manifest.chrome"
import {getManifestForFirefox} from "~/manifest/manifest.firefox"
import selectionPopupSource from "../../src/popup/selection/SelectionPopup.ts?raw"
import mediaPanelSource from "../../src/media/v2/MediaPanelV2.ts?raw"
import contentScriptSource from "../../src/contentscripts/ContentScript.ts?raw"

describe("browser integration accessibility and UI isolation", () => {
    it("publishes localized keyboard commands in both browser manifests", () => {
        for (const manifest of [getManifestForChrome(), getManifestForFirefox()] as any[]) {
            expect(manifest.commands).toMatchObject({
                "toggle-tab-bypass": {description: "__MSG_command_toggle_bypass__"},
                "review-current-page": {description: "__MSG_command_review_page__"},
            })
        }
    })

    it("uses closed shadow roots for injected selection and media controls", () => {
        expect(selectionPopupSource).toContain('attachShadow({mode: "closed"})')
        expect(selectionPopupSource).not.toContain("innerHTML")
        expect(mediaPanelSource).toContain("attachShadow({mode: \"closed\"})")
        expect(contentScriptSource).not.toContain("MediaSelectionPopup")
    })
})
