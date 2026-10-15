import {sendMessage} from "webext-bridge/content-script";
import {DefinedCommands} from "~/message/Commands";
import browser from "webextension-polyfill";
import type {YtDlpPanelFormat, YtDlpPanelInfo} from "~/backend/NativeMessagingApi";

/**
 * IDM-style floating download panel.
 *
 * Clicking the floating "Download video" button opens this panel (instead of
 * the desktop app dialog). The panel:
 *  - can be dragged around by its header and closed with the X button,
 *  - fetches the video info (title + formats) from the desktop app via
 *    native messaging,
 *  - shows a dropdown like "1080p • mp4 • 42 MB",
 *  - starts the download in the app background when "Download" is clicked.
 */

const PANEL_ID = "abdm-video-panel";
const PANEL_WIDTH = 640;

let panel: HTMLDivElement | null = null;
let currentPageUrl: string | null = null;
/** Title of the video shown in the "Download this video" tab. */
let currentTitle = "";
let activeTab: "this" | "all" = "this";
let allTabBuilt = false;

function t(key: string, fallback: string): string {
    try {
        return browser.i18n.getMessage(key) || fallback;
    } catch {
        return fallback;
    }
}

function formatSize(bytes: number | null): string {
    if (bytes == null || bytes <= 0) {
        return "?";
    }
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = units[0];
    for (const u of units) {
        unit = u;
        if (value < 1024 || u === "GB") {
            break;
        }
        value /= 1024;
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}

function baseStyle(): string {
    return [
        "position:fixed",
        `width:${PANEL_WIDTH}px`,
        "z-index:2147483647",
        "border-radius:12px",
        "background:linear-gradient(to bottom right,#2E3038,#171820)",
        "border:1px solid rgba(255,255,255,0.25)",
        "box-shadow:0 8px 28px rgba(0,0,0,0.5)",
        "color:#e8e8e8",
        "font-family:\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif",
        "font-size:16px",
        "line-height:1.4",
        "user-select:none",
    ].join(";");
}

function buildPanel(): HTMLDivElement {
    const el = document.createElement("div");
    el.id = PANEL_ID;
    el.setAttribute("data-abdm-ui", "1");
    el.style.cssText = baseStyle();

    // header: tabs only — the panel closes by clicking anywhere outside it
    const header = document.createElement("div");
    header.style.cssText = [
        "display:flex",
        "align-items:center",
        "gap:6px",
        "padding:10px 14px",
        "border-bottom:1px solid rgba(255,255,255,0.12)",
    ].join(";");
    const tabAll = document.createElement("button");
    tabAll.setAttribute("data-tab", "all");
    tabAll.textContent = t("video_panel_tab_all", "Download all");
    tabAll.style.cssText = tabStyle(false);
    tabAll.addEventListener("click", (e) => {
        e.stopPropagation();
        switchTab("all");
    });
    const tabThis = document.createElement("button");
    tabThis.setAttribute("data-tab", "this");
    tabThis.textContent = `▶ ${t("video_panel_tab_this", "Download this video")}`;
    tabThis.style.cssText = tabStyle(true);
    tabThis.addEventListener("click", (e) => {
        e.stopPropagation();
        switchTab("this");
    });
    header.appendChild(tabAll);
    header.appendChild(tabThis);

    // body
    const body = document.createElement("div");
    body.style.cssText = "padding:14px;display:flex;flex-direction:column;gap:10px;";

    const status = document.createElement("div");
    status.id = "abdm-vp-status";
    status.style.cssText = "color:#9fb3c8;font-size:14px;";

    // "Download this video" tab content
    const thisWrap = document.createElement("div");
    thisWrap.id = "abdm-vp-this-wrap";
    thisWrap.style.cssText = "display:flex;flex-direction:column;gap:10px;";

    const formatList = document.createElement("div");
    formatList.id = "abdm-vp-format-list";
    formatList.style.cssText = [
        "display:none",
        "flex-direction:column",
        "gap:4px",
        "max-height:360px",
        "overflow-y:auto",
    ].join(";");

    const hint = document.createElement("div");
    hint.id = "abdm-vp-hint";
    hint.style.cssText = "display:none;color:#8a8f98;font-size:13px;";
    hint.textContent = t(
        "video_panel_hint",
        "File disimpan ke folder default di pengaturan aplikasi.",
    );

    thisWrap.appendChild(formatList);
    thisWrap.appendChild(hint);

    // "Download all" tab content — built lazily on first open
    const allWrap = document.createElement("div");
    allWrap.id = "abdm-vp-all-wrap";
    allWrap.style.cssText = "display:none;flex-direction:column;gap:6px;max-height:360px;overflow-y:auto;";

    body.appendChild(status);
    body.appendChild(thisWrap);
    body.appendChild(allWrap);
    el.appendChild(header);
    el.appendChild(body);
    return el;
}

function tabStyle(active: boolean): string {
    return [
        `background:${active ? "rgba(59,130,246,0.35)" : "transparent"}`,
        "border:none",
        `color:${active ? "#fff" : "#9fb3c8"}`,
        "font-size:13px",
        `font-weight:${active ? "600" : "400"}`,
        "padding:4px 8px",
        "border-radius:6px",
        "cursor:pointer",
        "white-space:nowrap",
    ].join(";");
}

function switchTab(which: "this" | "all") {
    activeTab = which;
    if (!panel) {
        return;
    }
    const tabAll = panel.querySelector('[data-tab="all"]') as HTMLButtonElement | null;
    const tabThis = panel.querySelector('[data-tab="this"]') as HTMLButtonElement | null;
    const thisWrap = document.getElementById("abdm-vp-this-wrap");
    const allWrap = document.getElementById("abdm-vp-all-wrap");
    if (tabAll) {
        tabAll.style.cssText = tabStyle(which === "all");
    }
    if (tabThis) {
        tabThis.style.cssText = tabStyle(which === "this");
    }
    if (thisWrap) {
        thisWrap.style.display = which === "this" ? "flex" : "none";
    }
    if (allWrap) {
        allWrap.style.display = which === "all" ? "flex" : "none";
        if (which === "all" && !allTabBuilt) {
            buildAllVideosList();
            allTabBuilt = true;
        }
    }
}

interface PageVideoEntry {
    url: string;
    label: string;
}

/** Every <video> on the page, deduplicated by download URL. */
function pageVideoEntries(): PageVideoEntry[] {
    const seen = new Set<string>();
    const entries: PageVideoEntry[] = [];
    document.querySelectorAll("video").forEach((v) => {
        let url = v.currentSrc || v.src || "";
        if (!url) {
            const srcEl = v.querySelector("source[src]");
            if (srcEl) {
                url = srcEl.getAttribute("src") || "";
            }
        }
        if (!url || url.startsWith("blob:") || url.startsWith("data:")) {
            url = location.href;
        }
        if (seen.has(url)) {
            return;
        }
        seen.add(url);
        let host = "";
        try {
            host = new URL(url, location.href).hostname;
        } catch {
            // keep label without host
        }
        entries.push({
            url,
            label: `Video ${entries.length + 1}${host ? " • " + host : ""}`,
        });
    });
    return entries;
}

function buildAllVideosList() {
    const allWrap = document.getElementById("abdm-vp-all-wrap");
    if (!allWrap) {
        return;
    }
    allWrap.innerHTML = "";
    const entries = pageVideoEntries();
    entries.forEach((entry, i) => {
        const row = document.createElement("div");
        row.textContent = `${i + 1}. ${entry.label}`;
        row.title = entry.url;
        row.style.cssText = rowStyle();
        row.addEventListener("mouseenter", () => {
            row.style.background = "rgba(59,130,246,0.35)";
        });
        row.addEventListener("mouseleave", () => {
            row.style.background = "rgba(255,255,255,0.06)";
        });
        row.addEventListener("click", () => onAllVideoClick(entry, row));
        allWrap.appendChild(row);
    });
}

/** "Download all": clicking a video downloads its best quality immediately. */
async function onAllVideoClick(entry: PageVideoEntry, row: HTMLElement) {
    const original = row.textContent ?? "";
    row.style.opacity = "0.6";
    row.textContent = `⏳ ${original}`;
    try {
        const info = await sendMessage(
            DefinedCommands.YTDLP_PANEL_FETCH_INFO,
            {pageUrl: entry.url},
            "background",
        );
        const best = info?.formats?.[0];
        if (!best) {
            throw new Error(t("video_panel_no_formats", "Tidak ada format tersedia"));
        }
        await sendMessage(
            DefinedCommands.YTDLP_PANEL_DOWNLOAD,
            {pageUrl: entry.url, formatId: best.formatId, title: info.title},
            "background",
        );
        row.textContent = `✓ ${original}`;
        row.style.opacity = "1";
    } catch (err) {
        console.log("abdm: download-all failed", err);
        setStatus(panelErrorMessage(err), true);
        row.textContent = original;
        row.style.opacity = "1";
    }
}

function rowStyle(): string {
    return [
        "display:flex",
        "flex-direction:column",
        "gap:2px",
        "padding:10px 12px",
        "border-radius:8px",
        "background:rgba(255,255,255,0.06)",
        "cursor:pointer",
        "font-size:13px",
        "overflow:hidden",
    ].join(";");
}

function setStatus(text: string, isError = false) {
    const status = document.getElementById("abdm-vp-status");
    if (status) {
        status.textContent = text;
        status.style.color = isError ? "#f87171" : "#9fb3c8";
    }
}

/** "HD"/"4K" tag like the reference list ("1080p HD", "2160p 4K"). */
function qualityTag(resolution: string): string {
    const m = resolution.match(/(\d+)\s*p/i);
    if (m) {
        const h = parseInt(m[1], 10);
        if (h >= 2160) {
            return "4K";
        }
        if (h >= 720) {
            return "HD";
        }
    }
    return "";
}

/**
 * Parts of one format row, two lines (like before):
 *   1. SPEED GOES PRO, EPISODE 4_ KEVIN DURANT
 *   MP4 file • quality 1080p HD • 42 MB
 * Both lines are 13px like the "Download all" tab rows, so the detail
 * line is never smaller than the other tab's rows.
 * Clicking a row downloads that format immediately (IDM-style).
 */
function formatRowParts(title: string, f: YtDlpPanelFormat, index: number): {title: string; detail: string} {
    const ext = (f.ext || "?").toUpperCase();
    const tag = qualityTag(f.resolution);
    const quality = tag ? `${f.resolution} ${tag}` : f.resolution;
    const size = formatSize(f.sizeBytes);
    return {
        title: `${index + 1}. ${title.trim()}`,
        detail: `${ext} file • quality ${quality}${size !== "?" ? " • " + size : ""}`,
    };
}

async function onFormatClick(format: YtDlpPanelFormat, row: HTMLElement) {
    if (!currentPageUrl) {
        return;
    }
    row.style.opacity = "0.6";
    setStatus(t("video_panel_starting", "Memulai download…"));
    try {
        await sendMessage(
            DefinedCommands.YTDLP_PANEL_DOWNLOAD,
            {pageUrl: currentPageUrl, formatId: format.formatId, title: currentTitle},
            "background",
        );
        setStatus(t("video_panel_started", "Download dimulai ✓"));
        window.setTimeout(closePanel, 2500);
    } catch (err) {
        console.log("abdm: panel download failed", err);
        setStatus(panelErrorMessage(err), true);
        row.style.opacity = "1";
    }
}

/**
 * Translate technical failures into actionable messages.
 * "Extension context invalidated" is the classic symptom of a tab that still
 * runs the previous extension version after the extension was reloaded.
 */
export function panelErrorMessage(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes("Extension context invalidated")) {
        return t(
            "video_panel_context_invalidated",
            "Extension diperbarui — refresh halaman ini (F5) lalu coba lagi.",
        );
    }
    return `${t("video_panel_error", "Gagal")}: ${raw}`;
}

/** Fill the open panel's format list. The panel must already be in the DOM. */
function populatePanel(info: YtDlpPanelInfo) {
    currentTitle = info.title;
    const listEl = document.getElementById("abdm-vp-format-list");
    const hint = document.getElementById("abdm-vp-hint");
    if (listEl) {
        listEl.innerHTML = "";
        info.formats.forEach((f, i) => {
            const row = document.createElement("div");
            const parts = formatRowParts(info.title, f, i);
            const line1 = document.createElement("div");
            line1.textContent = parts.title;
            line1.style.cssText = [
                "font-weight:600",
                "white-space:nowrap",
                "overflow:hidden",
                "text-overflow:ellipsis",
            ].join(";");
            const line2 = document.createElement("div");
            line2.textContent = parts.detail;
            line2.style.cssText = "font-size:13px;";
            row.appendChild(line1);
            row.appendChild(line2);
            row.title = t("video_panel_download_now", "Download Now");
            row.style.cssText = rowStyle();
            row.addEventListener("mouseenter", () => {
                row.style.background = "rgba(59,130,246,0.35)";
            });
            row.addEventListener("mouseleave", () => {
                row.style.background = "rgba(255,255,255,0.06)";
            });
            row.addEventListener("click", () => onFormatClick(f, row));
            listEl.appendChild(row);
        });
        (listEl.style as CSSStyleDeclaration).display = "flex";
    }
    if (hint) {
        hint.style.display = "block";
    }
    setStatus("");
}

function createPanelAt(pageUrl: string, x: number, y: number) {
    closePanel();
    currentPageUrl = pageUrl;
    allTabBuilt = false;
    panel = buildPanel();
    // anchor below the click point, clamped to viewport
    const left = Math.max(8, Math.min(window.innerWidth - PANEL_WIDTH - 8, x - PANEL_WIDTH / 2));
    const top = Math.max(8, Math.min(window.innerHeight - 120, y + 12));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    document.documentElement.appendChild(panel);
    // clicking anywhere outside the panel (or the floating button) closes it
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    switchTab("this");
}

/**
 * Close the panel when the user clicks anywhere that is not the panel
 * itself or the floating download button (capture phase, so pages
 * cannot swallow it).
 */
function onDocumentPointerDown(e: PointerEvent) {
    if (!panel) {
        return;
    }
    const target = e.target as HTMLElement | null;
    if (!target || typeof target.closest !== "function") {
        closePanel();
        return;
    }
    if (target.closest(`#${PANEL_ID}`) || target.closest("#abdm-video-download-btn")) {
        return;
    }
    closePanel();
}

/**
 * Open the panel with the video info already fetched — no loading state.
 */
export function openPanelWithInfo(pageUrl: string, x: number, y: number, info: YtDlpPanelInfo) {
    createPanelAt(pageUrl, x, y);
    populatePanel(info);
}

/**
 * Open the panel showing an error (e.g. the fetch failed).
 */
export function openPanelWithError(pageUrl: string, x: number, y: number, message: string) {
    createPanelAt(pageUrl, x, y);
    setStatus(message, true);
}

export function closePanel() {
    currentPageUrl = null;
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    if (panel) {
        panel.remove();
        panel = null;
    }
}

export function isPanelOpenFor(pageUrl: string): boolean {
    return panel != null && currentPageUrl === pageUrl;
}
