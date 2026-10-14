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
const PANEL_WIDTH = 340;

let panel: HTMLDivElement | null = null;
let currentPageUrl: string | null = null;
let dragState: {offsetX: number; offsetY: number} | null = null;
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
        "font-size:13px",
        "line-height:1.4",
        "user-select:none",
    ].join(";");
}

function buildPanel(): HTMLDivElement {
    const el = document.createElement("div");
    el.id = PANEL_ID;
    el.setAttribute("data-abdm-ui", "1");
    el.style.cssText = baseStyle();

    // header (tabs + close; the header background is the drag handle)
    const header = document.createElement("div");
    header.style.cssText = [
        "display:flex",
        "align-items:center",
        "gap:6px",
        "padding:8px 10px",
        "border-bottom:1px solid rgba(255,255,255,0.12)",
        "cursor:grab",
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
    const closeBtn = document.createElement("span");
    closeBtn.id = "abdm-vp-close";
    closeBtn.textContent = "✕";
    closeBtn.title = t("video_panel_close", "Close");
    closeBtn.style.cssText = [
        "cursor:pointer",
        "padding:2px 6px",
        "border-radius:6px",
        "color:#aaa",
        "font-size:13px",
    ].join(";");
    closeBtn.addEventListener("mouseenter", () => {
        closeBtn.style.background = "rgba(255,255,255,0.12)";
        closeBtn.style.color = "#fff";
    });
    closeBtn.addEventListener("mouseleave", () => {
        closeBtn.style.background = "transparent";
        closeBtn.style.color = "#aaa";
    });
    closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closePanel();
    });
    header.appendChild(tabAll);
    header.appendChild(tabThis);
    header.appendChild(closeBtn);
    header.addEventListener("pointerdown", onDragStart);

    // body
    const body = document.createElement("div");
    body.style.cssText = "padding:10px;display:flex;flex-direction:column;gap:8px;";

    const status = document.createElement("div");
    status.id = "abdm-vp-status";
    status.style.cssText = "color:#9fb3c8;font-size:12px;";

    // "Download this video" tab content
    const thisWrap = document.createElement("div");
    thisWrap.id = "abdm-vp-this-wrap";
    thisWrap.style.cssText = "display:flex;flex-direction:column;gap:8px;";

    const videoTitle = document.createElement("div");
    videoTitle.id = "abdm-vp-title";
    videoTitle.style.cssText = [
        "font-weight:600",
        "display:none",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "white-space:nowrap",
    ].join(";");

    const formatList = document.createElement("div");
    formatList.id = "abdm-vp-format-list";
    formatList.style.cssText = [
        "display:none",
        "flex-direction:column",
        "gap:4px",
        "max-height:260px",
        "overflow-y:auto",
    ].join(";");

    const hint = document.createElement("div");
    hint.id = "abdm-vp-hint";
    hint.style.cssText = "display:none;color:#8a8f98;font-size:11px;";
    hint.textContent = t(
        "video_panel_hint",
        "File disimpan ke folder default di pengaturan aplikasi.",
    );

    thisWrap.appendChild(videoTitle);
    thisWrap.appendChild(formatList);
    thisWrap.appendChild(hint);

    // "Download all" tab content — built lazily on first open
    const allWrap = document.createElement("div");
    allWrap.id = "abdm-vp-all-wrap";
    allWrap.style.cssText = "display:none;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto;";

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
        "font-size:12px",
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
        "padding:7px 10px",
        "border-radius:8px",
        "background:rgba(255,255,255,0.06)",
        "cursor:pointer",
        "font-size:12px",
        "white-space:nowrap",
        "overflow:hidden",
        "text-overflow:ellipsis",
    ].join(";");
}

function onDragStart(e: PointerEvent) {
    // let the close button and the tabs handle their own events
    if ((e.target as HTMLElement).closest("#abdm-vp-close,[data-tab]")) {
        return;
    }
    if (!panel) {
        return;
    }
    e.preventDefault();
    const header = e.currentTarget as HTMLElement;
    try {
        header.setPointerCapture(e.pointerId);
    } catch {
        // not critical; drag still works via bubbled pointermove
    }
    const rect = panel.getBoundingClientRect();
    dragState = {
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
    };
    header.addEventListener("pointermove", onDragMove);
    header.addEventListener("pointerup", onDragEnd, {once: true});
    header.addEventListener("pointercancel", onDragEnd, {once: true});
}

function onDragMove(e: PointerEvent) {
    if (!panel || !dragState) {
        return;
    }
    const left = Math.max(
        8,
        Math.min(window.innerWidth - PANEL_WIDTH - 8, e.clientX - dragState.offsetX),
    );
    const top = Math.max(8, Math.min(window.innerHeight - 60, e.clientY - dragState.offsetY));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}

function onDragEnd(e: PointerEvent) {
    dragState = null;
    const header = e.currentTarget as HTMLElement | null;
    header?.removeEventListener("pointermove", onDragMove);
}

function setStatus(text: string, isError = false) {
    const status = document.getElementById("abdm-vp-status");
    if (status) {
        status.textContent = text;
        status.style.color = isError ? "#f87171" : "#9fb3c8";
    }
}

/**
 * One row of the format list, e.g. "MP4 file, quality 1080p HD • 42 MB".
 * Clicking it downloads that format immediately (IDM-style).
 */
function formatRowLabel(f: YtDlpPanelFormat, index: number): string {
    const ext = (f.ext || "?").toUpperCase();
    const parts = [`${index + 1}. ${ext} file, quality ${f.resolution}`];
    const size = formatSize(f.sizeBytes);
    if (size !== "?") {
        parts.push(size);
    }
    return parts.join(" • ");
}

async function onFormatClick(format: YtDlpPanelFormat, row: HTMLElement) {
    if (!currentPageUrl) {
        return;
    }
    row.style.opacity = "0.6";
    setStatus(t("video_panel_starting", "Memulai download…"));
    try {
        const titleEl = document.getElementById("abdm-vp-title");
        await sendMessage(
            DefinedCommands.YTDLP_PANEL_DOWNLOAD,
            {pageUrl: currentPageUrl, formatId: format.formatId, title: titleEl?.textContent ?? ""},
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
    const titleEl = document.getElementById("abdm-vp-title");
    const listEl = document.getElementById("abdm-vp-format-list");
    const hint = document.getElementById("abdm-vp-hint");
    if (titleEl) {
        titleEl.textContent = info.title;
        titleEl.style.display = "block";
        titleEl.title = info.title;
    }
    if (listEl) {
        listEl.innerHTML = "";
        info.formats.forEach((f, i) => {
            const row = document.createElement("div");
            row.textContent = formatRowLabel(f, i);
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
    switchTab("this");
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
    dragState = null;
    if (panel) {
        panel.remove();
        panel = null;
    }
}

export function isPanelOpenFor(pageUrl: string): boolean {
    return panel != null && currentPageUrl === pageUrl;
}
