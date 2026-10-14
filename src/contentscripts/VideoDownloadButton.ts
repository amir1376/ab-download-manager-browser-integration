import {sendMessage} from "webext-bridge/content-script";
import {DefinedCommands} from "~/message/Commands";
import * as Configs from "~/configs/Config";
import browser from "webextension-polyfill";
import {
    closePanel,
    isPanelOpenFor,
    openPanelWithError,
    openPanelWithInfo,
    panelErrorMessage,
} from "~/contentscripts/VideoDownloadPanel";
import type {YtDlpPanelInfo} from "~/backend/NativeMessagingApi";

/**
 * IDM-style floating "Download video" button.
 *
 * A single shared button is anchored (position:fixed) to the top-right corner
 * of the <video> element currently under the mouse cursor. Clicking it asks the
 * desktop app (via background -> native messaging) to open the yt-dlp dialog
 * with the page URL prefilled, letting yt-dlp extract the real media URL
 * (this is what makes it work on sites like YouTube where video.src is a
 * blob/MSE stream).
 */

const PROCESSED_ATTR = "data-abdm-vbtn";
const MIN_WIDTH = 240;
const MIN_HEIGHT = 140;
const HIDE_DELAY_MS = 350;

let btn: HTMLDivElement | null = null;
let buttonLabel: HTMLSpanElement | null = null;
let closeBadge: HTMLSpanElement | null = null;
let currentVideo: HTMLVideoElement | null = null;
let hideTimer: number | null = null;
let positionRaf: number | null = null;
/** Set when the user drags the button — auto-anchoring to the video pauses. */
let buttonPinned = false;
let buttonDrag: {
    startX: number;
    startY: number;
    baseLeft: number;
    baseTop: number;
    moved: boolean;
} | null = null;
/** Videos whose button was dismissed via ✕ — re-shown on next hover. */
const dismissedVideos = new WeakSet<HTMLVideoElement>();

/**
 * Prefetched video info per page URL. Fetching starts on hover (see showFor)
 * so that when the button is clicked the panel can open already populated —
 * no loading state inside the panel itself.
 */
const prefetchCache = new Map<string, Promise<YtDlpPanelInfo | null>>();

function prefetchInfo(pageUrl: string): Promise<YtDlpPanelInfo | null> {
    let pending = prefetchCache.get(pageUrl);
    if (!pending) {
        pending = sendMessage(
            DefinedCommands.YTDLP_PANEL_FETCH_INFO,
            {pageUrl},
            "background",
        );
        prefetchCache.set(pageUrl, pending);
        // a failed prefetch must not poison the cache — a later click retries
        pending.catch(() => prefetchCache.delete(pageUrl));
    }
    return pending;
}

function isEnabled(): boolean {
    try {
        return Configs.getLatestConfig().videoDownloadButtonEnabled;
    } catch {
        return true;
    }
}

function isSignificantVideo(v: HTMLVideoElement): boolean {
    let rect: DOMRect;
    try {
        rect = v.getBoundingClientRect();
    } catch {
        return false;
    }
    if (rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) {
        return false;
    }
    const style = window.getComputedStyle(v);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
    }
    // skip tiny clips/stingers when duration is known
    if (Number.isFinite(v.duration) && v.duration > 0 && v.duration < 3) {
        return false;
    }
    return true;
}

function ensureButton(): HTMLDivElement {
    if (btn) {
        return btn;
    }
    const el = document.createElement("div");
    el.id = "abdm-video-download-btn";
    el.setAttribute("data-abdm-ui", "1");
    const label = browser.i18n.getMessage("video_download_button_label") || "Download video";
    const title = browser.i18n.getMessage("video_download_button_title") ||
        "Download this video with AB Download Manager";
    el.title = title;
    // inline styles only: avoids CSP issues with <style> on some pages
    el.style.cssText = [
        "position:fixed",
        "z-index:2147483647",
        "display:none",
        "align-items:center",
        "gap:6px",
        "padding:6px 12px",
        "border-radius:999px",
        "background:linear-gradient(to bottom right,#2E3038,#171820)",
        "border:1px solid rgba(255,255,255,0.25)",
        "box-shadow:0 2px 8px rgba(0,0,0,0.35)",
        "color:#e8e8e8",
        "font-family:\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif",
        "font-size:12px",
        "line-height:1",
        "cursor:move",
        "user-select:none",
        "white-space:nowrap",
        "touch-action:none",
    ].join(";");
    const icon = document.createElement("span");
    icon.textContent = "⬇";
    icon.style.cssText = "font-size:13px;line-height:1;pointer-events:none;";
    const text = document.createElement("span");
    text.textContent = label;
    text.style.cssText = "pointer-events:none;";
    const badge = document.createElement("span");
    badge.textContent = "✕";
    badge.title = browser.i18n.getMessage("video_download_button_dismiss") || "Sembunyikan tombol";
    badge.style.cssText = [
        "display:none",
        "position:absolute",
        "top:-9px",
        "right:-9px",
        "width:18px",
        "height:18px",
        "border-radius:50%",
        "background:#e11d48",
        "color:#fff",
        "font-size:10px",
        "line-height:18px",
        "text-align:center",
        "cursor:pointer",
        "box-shadow:0 1px 4px rgba(0,0,0,0.4)",
    ].join(";");
    badge.addEventListener("pointerdown", (e) => e.stopPropagation());
    badge.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentVideo) {
            dismissedVideos.add(currentVideo);
        }
        hideButton();
    });
    el.appendChild(icon);
    el.appendChild(text);
    el.appendChild(badge);
    buttonLabel = text;
    closeBadge = badge;
    el.addEventListener("mouseenter", () => {
        cancelHide();
        if (closeBadge) {
            closeBadge.style.display = "block";
        }
    });
    el.addEventListener("mouseleave", () => {
        if (closeBadge) {
            closeBadge.style.display = "none";
        }
        scheduleHide();
    });
    el.addEventListener("pointerdown", onBtnPointerDown);
    document.documentElement.appendChild(el);
    btn = el;
    return el;
}

function onBtnPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !btn) {
        return;
    }
    cancelHide();
    const left = parseFloat(btn.style.left || "0");
    const top = parseFloat(btn.style.top || "0");
    buttonDrag = {
        startX: e.clientX,
        startY: e.clientY,
        baseLeft: Number.isFinite(left) ? left : 0,
        baseTop: Number.isFinite(top) ? top : 0,
        moved: false,
    };
    try {
        btn.setPointerCapture(e.pointerId);
    } catch {
        // pointer capture is best-effort
    }
    btn.addEventListener("pointermove", onBtnPointerMove);
    btn.addEventListener("pointerup", onBtnPointerUp, {once: true});
    btn.addEventListener("pointercancel", onBtnPointerCancel, {once: true});
}

function onBtnPointerMove(e: PointerEvent) {
    if (!buttonDrag || !btn) {
        return;
    }
    const dx = e.clientX - buttonDrag.startX;
    const dy = e.clientY - buttonDrag.startY;
    if (!buttonDrag.moved && Math.hypot(dx, dy) > 6) {
        buttonDrag.moved = true;
        buttonPinned = true;
        btn.style.cursor = "grabbing";
    }
    if (buttonDrag.moved) {
        const left = Math.max(0, Math.min(window.innerWidth - btn.offsetWidth, buttonDrag.baseLeft + dx));
        const top = Math.max(0, Math.min(window.innerHeight - btn.offsetHeight, buttonDrag.baseTop + dy));
        btn.style.left = `${left}px`;
        btn.style.top = `${top}px`;
    }
}

function endBtnDrag() {
    if (btn) {
        btn.removeEventListener("pointermove", onBtnPointerMove);
        btn.style.cursor = "move";
    }
    buttonDrag = null;
}

function onBtnPointerUp(e: PointerEvent) {
    const wasDrag = buttonDrag?.moved ?? false;
    endBtnDrag();
    if (!wasDrag) {
        void onButtonClick(e);
    }
}

function onBtnPointerCancel() {
    endBtnDrag();
}

function placeButton() {
    if (!btn || !currentVideo || buttonPinned) {
        return;
    }
    const rect = currentVideo.getBoundingClientRect();
    // keep inside viewport
    const left = Math.max(8, Math.min(window.innerWidth - btn.offsetWidth - 8, rect.right - btn.offsetWidth - 8));
    const top = Math.max(8, rect.top + 8);
    btn.style.left = `${left}px`;
    btn.style.top = `${top}px`;
}

function tickPosition() {
    positionRaf = null;
    if (!btn || btn.style.display === "none" || !currentVideo || !currentVideo.isConnected) {
        hideButton();
        return;
    }
    placeButton();
    positionRaf = requestAnimationFrame(tickPosition);
}

function showFor(video: HTMLVideoElement) {
    if (!isEnabled() || !isSignificantVideo(video) || dismissedVideos.has(video)) {
        return;
    }
    cancelHide();
    if (video !== currentVideo) {
        // a newly hovered video gets the button anchored to it again
        buttonPinned = false;
    }
    currentVideo = video;
    const el = ensureButton();
    el.style.display = "flex";
    placeButton();
    if (positionRaf == null) {
        positionRaf = requestAnimationFrame(tickPosition);
    }
    // start fetching in the background so the panel opens already populated
    try {
        void prefetchInfo(location.href);
    } catch {
        // fetch errors are reported when the button is clicked
    }
}

function hideButton() {
    if (hideTimer != null) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
    if (positionRaf != null) {
        cancelAnimationFrame(positionRaf);
        positionRaf = null;
    }
    currentVideo = null;
    buttonPinned = false;
    if (btn) {
        btn.style.display = "none";
    }
}

function scheduleHide() {
    cancelHide();
    hideTimer = window.setTimeout(hideButton, HIDE_DELAY_MS);
}

function cancelHide() {
    if (hideTimer != null) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
}

async function onButtonClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const pageUrl = location.href;
    // toggle: clicking while the panel is open closes it
    if (isPanelOpenFor(pageUrl)) {
        closePanel();
        return;
    }
    // anchor the panel near the button
    const rect = btn?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : e.clientX;
    const y = rect ? rect.bottom : e.clientY;
    // the panel only opens once the info is fetched — show progress on the button
    const originalLabel = buttonLabel?.textContent ?? "";
    const loadingLabel = "⏳ " + (
        browser.i18n.getMessage("video_panel_loading") || "Mengambil info video…"
    );
    if (buttonLabel) {
        buttonLabel.textContent = loadingLabel;
    }
    try {
        const info = await prefetchInfo(pageUrl);
        hideButton();
        if (buttonLabel) {
            buttonLabel.textContent = originalLabel;
        }
        if (info && info.formats && info.formats.length > 0) {
            openPanelWithInfo(pageUrl, x, y, info);
        } else {
            openPanelWithError(
                pageUrl,
                x,
                y,
                browser.i18n.getMessage("video_panel_no_formats") || "Tidak ada format tersedia",
            );
        }
    } catch (err) {
        console.log("abdm: panel fetch info failed", err);
        hideButton();
        if (buttonLabel) {
            buttonLabel.textContent = originalLabel;
        }
        openPanelWithError(pageUrl, x, y, panelErrorMessage(err));
    }
}

function attachVideo(v: HTMLVideoElement) {
    if (!(v instanceof HTMLVideoElement) || v.hasAttribute(PROCESSED_ATTR)) {
        return;
    }
    v.setAttribute(PROCESSED_ATTR, "1");
    v.addEventListener("mouseenter", () => showFor(v));
    v.addEventListener("mouseleave", () => {
        // a dismissed button comes back on the next hover
        dismissedVideos.delete(v);
        scheduleHide();
    });
}

function scan(root: ParentNode) {
    if (root instanceof HTMLVideoElement) {
        attachVideo(root);
        return;
    }
    if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
        root.querySelectorAll("video").forEach((v) => attachVideo(v));
    }
}

/**
 * Start watching for <video> elements. Safe to call once per content-script
 * instance ( guarded against double-boot).
 */
let booted = false;
export function bootVideoDownloadButton() {
    if (booted) {
        return;
    }
    booted = true;
    try {
        scan(document);
    } catch (e) {
        console.log("abdm: initial video scan failed", e);
    }
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            m.addedNodes.forEach((node) => {
                if (node instanceof Element || node instanceof DocumentFragment) {
                    try {
                        scan(node as unknown as ParentNode);
                    } catch (e) {
                        console.log("abdm: video scan failed", e);
                    }
                }
                if (node instanceof HTMLVideoElement) {
                    attachVideo(node);
                }
            });
            m.removedNodes.forEach((node) => {
                if (node === currentVideo) {
                    hideButton();
                }
            });
        }
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});
}
