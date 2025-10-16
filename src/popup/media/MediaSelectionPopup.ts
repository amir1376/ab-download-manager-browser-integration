import {DownloadableMedia} from "~/media/MediaOnTab"
import browser from "webextension-polyfill"

let popupEl: HTMLDivElement | null = null
let dismissed = false
let listVisible = false // start collapsed
let onItemClick: ((item: DownloadableMedia) => void) | undefined

/**
 * Create the main popup element
 */
function createPopup() {
    if (popupEl) return popupEl
    const downloadMediaTitle = browser.i18n.getMessage("download_media_title")
    const wrapper = document.createElement("div")
    wrapper.className = "abdm-extension"
    wrapper.style.position = "fixed"
    wrapper.style.top = "8px"
    wrapper.style.left = "8px"
    wrapper.style.zIndex = "999999"
    wrapper.style.display = "flex"
    wrapper.style.flexDirection = "column"
    wrapper.style.alignItems = "start"
    wrapper.style.gap = "2px"
    wrapper.style.direction = "ltr"

    // Create style element using textContent to avoid CSP violation
    const styleEl = document.createElement("style")
    styleEl.textContent = `
      .abdm-extension * {
        font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        box-sizing: border-box;
      }
      .abdm-media-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        border-radius: 16px;
        padding: 6px 12px;
        background: linear-gradient(to bottom right, #2E3038, #171820);
        border: rgba(255,255,255,0.25) solid 1px;
        box-shadow: rgba(0,0,0,0.07) 0px 1px 2px, rgba(0,0,0,0.07) 0px 2px 4px, rgba(0,0,0,0.07) 0px 4px 8px;
        cursor: pointer;
        color: #aaaaaa;
        font-size: 1rem;
      }
      .abdm-media-header .appIcon,
      .abdm-media-header .title-wrapper,
      .abdm-media-header .abdm-media-close-btn {
        display: flex;
        align-items: center;
      }
      .abdm-media-header .appIcon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }
      .abdm-media-header .title-wrapper {
        gap: 4px;
        user-select: none; /* header text not selectable */
      }
      .abdm-media-header .abdm-media-close-btn {
        cursor: pointer;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        color: #aaa;
      }
      .abdm-media-header .abdm-media-close-btn:hover {
        color: #fff;
      }
      .abdm-media-list {
        background: linear-gradient(to bottom right, #2E3038, #171820);
        border: rgba(255,255,255,0.25) solid 1px;
        border-radius: 16px;
        overflow: auto;
        color: #ccc;
        font-size: 0.9rem;
        box-shadow: rgba(0,0,0,0.15) 0px 4px 10px;
        margin-top: 4px;
        display: none; /* start hidden */
        max-height: 50vh; /* scroll if too long */
      }
      .abdm-media-item {
        padding: 8px 12px;
        border-bottom: rgba(255,255,255,0.1) solid 1px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: start;
        min-width: 160px;
      }
      .abdm-media-item:last-child {
        border-bottom: none;
      }
      .abdm-media-item:hover {
        background: rgba(255,255,255,0.08);
      }
      .abdm-item-title {
        font-weight: 500;
        color: #fff;
      }
      .abdm-item-details {
        font-size: 0.8rem;
        opacity: 0.7;
      }
    `
    wrapper.appendChild(styleEl)

    // Create HTML content without inline style
    const contentHTML = `
    <div class="abdm-media-header">
      <div class="appIcon">
        <svg width="100%" height="100%" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M17.9267 0.594672C17.9267 0.266244 17.673 0 17.36 0H14.64C14.327 0 14.0733 0.266244 14.0733 0.594672V11.8934C14.0733 12.2219 13.8196 12.4881 13.5066 12.4881H12.5677C12.1068 12.4881 11.8386 13.0348 12.1066 13.4284L15.5389 18.471C15.7649 18.803 16.2351 18.803 16.4611 18.471L19.8934 13.4284C20.1614 13.0348 19.8932 12.4881 19.4323 12.4881H18.4934C18.1804 12.4881 17.9267 12.2219 17.9267 11.8934V0.594672ZM1.21792 22.1229C0.413852 20.1817 0 18.1011 0 16H4.80088C6.53592 16 7.88743 17.4585 8.5514 19.0615C8.95343 20.0321 9.54272 20.914 10.2856 21.6569C11.0285 22.3997 11.9104 22.989 12.881 23.391C13.8516 23.7931 14.8919 24 15.9424 24C16.993 24 18.0333 23.7931 19.0039 23.391C19.9745 22.989 20.8564 22.3997 21.5993 21.6569C22.3422 20.914 22.9315 20.0321 23.3335 19.0615C23.9975 17.4585 25.349 16 27.084 16H32C32 18.1011 31.5861 20.1817 30.7821 22.1229C29.978 24.0642 28.7994 25.828 27.3137 27.3137C25.828 28.7995 24.0642 29.978 22.1229 30.7821C20.1817 31.5862 18.1011 32 16 32C13.8989 32 11.8183 31.5862 9.87708 30.7821C7.93587 29.978 6.17202 28.7995 4.68629 27.3137C3.20057 25.828 2.022 24.0642 1.21792 22.1229ZM7.84788 3.4742C7.41753 3.82071 7.34399 4.45754 7.68363 4.89659C8.02327 5.33565 8.64748 5.41067 9.07783 5.06416L10.5389 3.88776C10.9692 3.54125 11.0428 2.90443 10.7031 2.46537C10.3635 2.02631 9.73928 1.95129 9.30893 2.2978L7.84788 3.4742ZM24.3121 3.4742C24.7425 3.82071 24.816 4.45754 24.4764 4.89659C24.1367 5.33565 23.5125 5.41067 23.0822 5.06416L21.6211 3.88776C21.1908 3.54125 21.1172 2.90443 21.4569 2.46537C21.7965 2.02631 22.4207 1.95129 22.8511 2.2978L24.3121 3.4742ZM3.02879 11.7691C2.51877 11.5639 2.26836 10.9758 2.46947 10.4555L3.15224 8.68897C3.35335 8.16864 3.92983 7.91316 4.43985 8.11834C4.94986 8.32352 5.20028 8.91166 4.99917 9.43199L4.3164 11.1985C4.11528 11.7188 3.5388 11.9743 3.02879 11.7691ZM29.6905 10.4555C29.8916 10.9758 29.6412 11.5639 29.1312 11.7691C28.6212 11.9743 28.0447 11.7188 27.8436 11.1985L27.1608 9.43199C26.9597 8.91166 27.2101 8.32352 27.7202 8.11834C28.2302 7.91316 28.8067 8.16864 29.0078 8.68897L29.6905 10.4555Z" fill="url(#paint0_linear_526_2322)"/>
                <path d="M27.3137 27.3138C24.3131 30.3144 20.2434 32.0001 16 32.0001C11.7565 32.0001 7.68686 30.3144 4.68628 27.3138V27.3138C6.3723 25.6278 9.09946 25.724 11.2807 26.6871C12.7534 27.3375 14.3589 27.6828 16 27.6828C17.6411 27.6828 19.2466 27.3375 20.7193 26.6871C22.9005 25.724 25.6277 25.6278 27.3137 27.3138V27.3138Z" fill="black" fill-opacity="0.25"/>
                <defs>
                    <linearGradient id="paint0_linear_526_2322" x1="33.3743" y1="15.3424" x2="-1.12085" y2="15.3424" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#C631FF"/>
                        <stop offset="1" stop-color="#4DC4FE"/>
                    </linearGradient>
                </defs>
            </svg>
      </div>
      <div class="title-wrapper">
        <span>${downloadMediaTitle}</span>
        (<span class="count-text">0</span>)
      </div>
      <div class="abdm-media-close-btn">
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M5.29289 5.29289C5.68342 4.90237 6.31658 4.90237 6.70711 5.29289L12 10.5858L17.2929 5.29289C17.6834 4.90237 18.3166 4.90237 18.7071 5.29289C19.0976 5.68342 19.0976 6.31658 18.7071 6.70711L13.4142 12L18.7071 17.2929C19.0976 17.6834 19.0976 18.3166 18.7071 18.7071C18.3166 19.0976 17.6834 19.0976 17.2929 18.7071L12 13.4142L6.70711 18.7071C6.31658 19.0976 5.68342 19.0976 5.29289 18.7071C4.90237 18.3166 4.90237 17.6834 5.29289 17.2929L10.5858 12L5.29289 6.70711C4.90237 6.31658 4.90237 5.68342 5.29289 5.29289Z" fill="currentColor"/>
        </svg>
      </div>
    </div>
    <div class="abdm-media-list"></div>
    `
    
    const contentContainer = document.createElement("div")
    contentContainer.innerHTML = contentHTML
    while (contentContainer.firstChild) {
        wrapper.appendChild(contentContainer.firstChild)
    }

    const header = wrapper.querySelector<HTMLDivElement>(".abdm-media-header")!
    const listContainer = wrapper.querySelector<HTMLDivElement>(".abdm-media-list")!

    header.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).classList.contains("abdm-media-close-btn")) return
        listVisible = !listVisible
        listContainer.style.display = listVisible ? "block" : "none"
    })

    wrapper.querySelector<HTMLSpanElement>(".abdm-media-close-btn")!.onclick = () => {
        dismissed = true
        wrapper.remove()
        popupEl = null
    }

    document.body.appendChild(wrapper)
    popupEl = wrapper
    return wrapper
}

function getBiggestMediaPlayer() {
    return Array.from(document.querySelectorAll<HTMLMediaElement>("video, audio"))
        .filter(el => el instanceof HTMLVideoElement || el instanceof HTMLAudioElement)
        .sort((a, b) => {
            const areaA = a.clientWidth * a.clientHeight
            const areaB = b.clientWidth * b.clientHeight
            return areaB - areaA
        })[0] || null
}

/**
 * Set the click listener for media items
 */
export function setItemClickListener(callback: (item: DownloadableMedia) => void) {
    onItemClick = callback
}

/**
 * Update the popup with a list of media items
 */
export function updatePopup(items: DownloadableMedia[]) {
    if (dismissed) return

    if (!items || items.length === 0) {
        popupEl?.remove()
        popupEl = null
        return
    }

    const popup = createPopup()

    const countEl = popup.querySelector<HTMLSpanElement>(".count-text")!
    countEl.textContent = String(items.length)

    const listContainer = popup.querySelector<HTMLDivElement>(".abdm-media-list")!
    listContainer.innerHTML = ""

    for (const item of items) {
        const el = document.createElement("div")
        el.className = "abdm-media-item"

        const title = item.displayName ?? "Unnamed media"
        const details = [
            item.duration,
            item.size,
            item.resolution,
            item.bandwidth,
            item.extension,
        ].filter(Boolean).join(" · ")

        el.innerHTML = `
          <div class="abdm-item-title">${title}</div>
          <div class="abdm-item-details">${details}</div>
        `

        el.onclick = () => {
            onItemClick?.(item)
        }

        listContainer.appendChild(el)
    }

    // Position near video/audio or fallback top-left
    const media = getBiggestMediaPlayer()
    if (media) {
        const rect = media.getBoundingClientRect()
        popup.style.position = "absolute" // near media
        popup.style.top = `${Math.max(rect.top - popup.offsetHeight - 2 + window.scrollY, 2)}px`
        popup.style.left = `${rect.left + window.scrollX}px`
    } else {
        popup.style.position = "fixed"
        popup.style.top = "8px"
        popup.style.left = "8px"
    }
}

/**
 * Toggle the visibility of the list manually
 */
export function toggleList(
    visible?: boolean,
) {
    if (!popupEl) return
    const listContainer = popupEl.querySelector<HTMLDivElement>(".abdm-media-list");
    if (!listContainer) return
    switch (visible) {
        case undefined:
            listVisible = !listVisible
            break
        default:
            listVisible = visible
    }
    listContainer.style.display = listVisible ? "block" : "none"
}
