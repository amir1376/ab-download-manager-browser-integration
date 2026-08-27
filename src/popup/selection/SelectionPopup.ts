import {PositionInPage} from "~/utils/MouseUtil"
import browser from "webextension-polyfill"

const AB_DM_POPUP_CLASSNAME = "ab_dm_popup_class"
let showingPopup = false
let onClickListener = () => {}

export function setOnPopupClicked(listener: () => void) {
    onClickListener = listener
}

export function showAddDownloadPopupUi(position: PositionInPage) {
    if (showingPopup) closeAddDownloadPopupUi()
    createUi(position, () => {
        try {
            onClickListener()
        } finally {
            closeAddDownloadPopupUi()
        }
    }, closeAddDownloadPopupUi)
    showingPopup = true
}

export function closeAddDownloadPopupUi() {
    document.removeEventListener("mousedown", closeAddDownloadPopupUi)
    document.body.querySelectorAll(`.${AB_DM_POPUP_CLASSNAME}`).forEach(element => element.remove())
    showingPopup = false
}

function createUi(position: PositionInPage, onAction: () => void, onCancel: () => void) {
    const host = document.createElement("div")
    const shadowRoot = host.attachShadow({mode: "closed"})
    const style = document.createElement("style")
    style.textContent = `
    .abdm {
        font: 12px system-ui, sans-serif;
        color: #e5e7eb;
        background: linear-gradient(to bottom right, #2e3038, #171820);
        display: flex;
        align-items: stretch;
        border-radius: 999px;
        border: rgba(255,255,255,25%) solid 1px;
        overflow: hidden;
        user-select: none;
        box-shadow: rgba(0,0,0,.07) 0 1px 2px, rgba(0,0,0,.07) 0 2px 4px,
            rgba(0,0,0,.07) 0 4px 8px, rgba(0,0,0,.07) 0 8px 16px;
    }
    .abdm button {
        appearance: none;
        background: transparent;
        border: 0;
        color: inherit;
        cursor: pointer;
        font: inherit;
        transition: background-color ease 150ms;
    }
    .abdm button:hover, .abdm button:focus-visible { background: rgba(255,255,255,20%); }
    .download-btn { display: flex; align-items: center; gap: 6px; padding: 5px 10px 5px 7px; }
    .download-btn img { width: 16px; height: 16px; }
    .close-btn { padding: 4px 9px; background: rgba(255,255,255,5%) !important; font-size: 17px !important; }
    .close-btn:hover, .close-btn:focus-visible { background: rgba(255,255,255,20%) !important; }
    `
    shadowRoot.appendChild(style)

    const popup = document.createElement("div")
    popup.className = "abdm"
    popup.dir = browser.i18n.getMessage("@@bidi_dir") || "ltr"

    const downloadButton = document.createElement("button")
    downloadButton.type = "button"
    downloadButton.className = "download-btn"
    const icon = document.createElement("img")
    icon.src = browser.runtime.getURL("icons/icon-48.png")
    icon.alt = ""
    const label = document.createElement("span")
    label.textContent = browser.i18n.getMessage("selection_popup_download_selected")
    downloadButton.append(icon, label)

    const closeButton = document.createElement("button")
    closeButton.type = "button"
    closeButton.className = "close-btn"
    closeButton.textContent = "×"
    closeButton.setAttribute("aria-label", browser.i18n.getMessage("close") || "Close")
    popup.append(downloadButton, closeButton)
    shadowRoot.appendChild(popup)

    downloadButton.addEventListener("click", event => {
        event.stopPropagation()
        onAction()
    })
    closeButton.addEventListener("click", event => {
        event.stopPropagation()
        onCancel()
    })

    host.classList.add(AB_DM_POPUP_CLASSNAME)
    host.style.position = "absolute"
    host.style.zIndex = "2147483647"
    document.body.append(host)
    const width = host.getBoundingClientRect().width
    const offsetX = position.x + width >= window.innerWidth
        ? window.innerWidth - (width + getScrollbarWidth())
        : position.x
    host.style.top = `${position.y}px`
    host.style.left = `${Math.max(0, offsetX)}px`
    return host
}

function getScrollbarWidth() {
    return window.innerWidth - document.body.clientWidth
}
