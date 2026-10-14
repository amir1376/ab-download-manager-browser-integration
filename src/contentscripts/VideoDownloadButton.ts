import {sendMessage} from "webext-bridge/content-script";
import {DefinedCommands} from "~/message/Commands";
import * as Configs from "~/configs/Config";
import browser from "webextension-polyfill";

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
let currentVideo: HTMLVideoElement | null = null;
let hideTimer: number | null = null;
let positionRaf: number | null = null;

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
        "cursor:pointer",
        "user-select:none",
        "white-space:nowrap",
    ].join(";");
    const icon = document.createElement("span");
    icon.textContent = "⬇";
    icon.style.cssText = "font-size:13px;line-height:1;";
    const text = document.createElement("span");
    text.textContent = label;
    el.appendChild(icon);
    el.appendChild(text);
    el.addEventListener("mouseenter", cancelHide);
    el.addEventListener("mouseleave", scheduleHide);
    el.addEventListener("click", onButtonClick);
    document.documentElement.appendChild(el);
    btn = el;
    return el;
}

function placeButton() {
    if (!btn || !currentVideo) {
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
    if (!isEnabled() || !isSignificantVideo(video)) {
        return;
    }
    cancelHide();
    currentVideo = video;
    const el = ensureButton();
    el.style.display = "flex";
    placeButton();
    if (positionRaf == null) {
        positionRaf = requestAnimationFrame(tickPosition);
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
    const video = currentVideo;
    let videoSrc: string | undefined;
    try {
        const src = video?.currentSrc || video?.src || "";
        if (src && !src.startsWith("blob:")) {
            videoSrc = src;
        }
    } catch {
        videoSrc = undefined;
    }
    hideButton();
    try {
        await sendMessage(
            DefinedCommands.YTDLP_VIDEO_DOWNLOAD,
            {
                pageUrl: location.href,
                pageTitle: document.title || "",
                videoSrc,
            },
            "background",
        );
    } catch (err) {
        console.log("abdm: failed to request video download", err);
    }
}

function attachVideo(v: HTMLVideoElement) {
    if (!(v instanceof HTMLVideoElement) || v.hasAttribute(PROCESSED_ATTR)) {
        return;
    }
    v.setAttribute(PROCESSED_ATTR, "1");
    v.addEventListener("mouseenter", () => showFor(v));
    v.addEventListener("mouseleave", scheduleHide);
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
