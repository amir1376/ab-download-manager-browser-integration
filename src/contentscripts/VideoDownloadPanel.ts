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

function formatLabel(f: YtDlpPanelFormat): string {
    const parts = [f.resolution];
    if (f.ext) {
        parts.push(f.ext);
    }
    parts.push(formatSize(f.sizeBytes));
    return parts.join(" • ");
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

    // header (drag handle + close)
    const header = document.createElement("div");
    header.style.cssText = [
        "display:flex",
        "align-items:center",
        "gap:8px",
        "padding:8px 10px",
        "border-bottom:1px solid rgba(255,255,255,0.12)",
        "cursor:grab",
    ].join(";");
    const title = document.createElement("span");
    title.textContent = `⬇ ${t("video_panel_title", "Download video")}`;
    title.style.cssText = "font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
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
    header.appendChild(title);
    header.appendChild(closeBtn);
    header.addEventListener("pointerdown", onDragStart);

    // body
    const body = document.createElement("div");
    body.style.cssText = "padding:10px;display:flex;flex-direction:column;gap:8px;";

    const status = document.createElement("div");
    status.id = "abdm-vp-status";
    status.style.cssText = "color:#9fb3c8;font-size:12px;";

    const videoTitle = document.createElement("div");
    videoTitle.id = "abdm-vp-title";
    videoTitle.style.cssText = [
        "font-weight:600",
        "display:none",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "white-space:nowrap",
    ].join(";");

    const select = document.createElement("select");
    select.id = "abdm-vp-format";
    select.style.cssText = [
        "display:none",
        "width:100%",
        "padding:7px 8px",
        "border-radius:8px",
        "border:1px solid rgba(255,255,255,0.2)",
        "background:#1e2027",
        "color:#e8e8e8",
        "font-size:13px",
        "outline:none",
    ].join(";");

    const downloadBtn = document.createElement("button");
    downloadBtn.id = "abdm-vp-download";
    downloadBtn.textContent = t("video_panel_download", "Download");
    downloadBtn.style.cssText = [
        "display:none",
        "width:100%",
        "padding:8px",
        "border:none",
        "border-radius:8px",
        "background:#3b82f6",
        "color:#fff",
        "font-size:13px",
        "font-weight:600",
        "cursor:pointer",
    ].join(";");
    downloadBtn.addEventListener("mouseenter", () => {
        downloadBtn.style.background = "#2563eb";
    });
    downloadBtn.addEventListener("mouseleave", () => {
        downloadBtn.style.background = "#3b82f6";
    });
    downloadBtn.addEventListener("click", onDownloadClick);

    const hint = document.createElement("div");
    hint.id = "abdm-vp-hint";
    hint.style.cssText = "display:none;color:#8a8f98;font-size:11px;";
    hint.textContent = t(
        "video_panel_hint",
        "File disimpan ke folder default di pengaturan aplikasi.",
    );

    body.appendChild(status);
    body.appendChild(videoTitle);
    body.appendChild(select);
    body.appendChild(downloadBtn);
    body.appendChild(hint);
    el.appendChild(header);
    el.appendChild(body);
    return el;
}

function onDragStart(e: PointerEvent) {
    // let the close button handle its own events
    if ((e.target as HTMLElement).closest("#abdm-vp-close")) {
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

async function onDownloadClick() {
    const select = document.getElementById("abdm-vp-format") as HTMLSelectElement | null;
    const downloadBtn = document.getElementById("abdm-vp-download") as HTMLButtonElement | null;
    const titleEl = document.getElementById("abdm-vp-title");
    if (!select || !currentPageUrl) {
        return;
    }
    const formatId = select.value;
    const title = titleEl?.textContent ?? "";
    if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.style.opacity = "0.6";
        downloadBtn.style.cursor = "default";
    }
    setStatus(t("video_panel_starting", "Memulai download…"));
    try {
        await sendMessage(
            DefinedCommands.YTDLP_PANEL_DOWNLOAD,
            {pageUrl: currentPageUrl, formatId, title},
            "background",
        );
        setStatus(t("video_panel_started", "Download dimulai ✓"));
        window.setTimeout(closePanel, 2500);
    } catch (err) {
        console.log("abdm: panel download failed", err);
        setStatus(friendlyError(err), true);
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.style.opacity = "1";
            downloadBtn.style.cursor = "pointer";
        }
    }
}

/**
 * Translate technical failures into actionable messages.
 * "Extension context invalidated" is the classic symptom of a tab that still
 * runs the previous extension version after the extension was reloaded.
 */
function friendlyError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes("Extension context invalidated")) {
        return t(
            "video_panel_context_invalidated",
            "Extension diperbarui — refresh halaman ini (F5) lalu coba lagi.",
        );
    }
    return `${t("video_panel_error", "Gagal")}: ${raw}`;
}

async function fetchAndPopulate(pageUrl: string) {
    setStatus(t("video_panel_loading", "Mengambil info video…"));
    let info: YtDlpPanelInfo | null = null;
    try {
        info = await sendMessage(
            DefinedCommands.YTDLP_PANEL_FETCH_INFO,
            {pageUrl},
            "background",
        );
    } catch (err) {
        console.log("abdm: panel fetch info failed", err);
        setStatus(friendlyError(err), true);
        return;
    }
    if (!info || !info.formats || info.formats.length === 0) {
        setStatus(t("video_panel_no_formats", "Tidak ada format tersedia"), true);
        return;
    }
    const titleEl = document.getElementById("abdm-vp-title");
    const select = document.getElementById("abdm-vp-format") as HTMLSelectElement | null;
    const downloadBtn = document.getElementById("abdm-vp-download") as HTMLButtonElement | null;
    const hint = document.getElementById("abdm-vp-hint");
    if (titleEl) {
        titleEl.textContent = info.title;
        titleEl.style.display = "block";
        titleEl.title = info.title;
    }
    if (select) {
        select.innerHTML = "";
        for (const f of info.formats) {
            const opt = document.createElement("option");
            opt.value = f.formatId;
            opt.textContent = formatLabel(f);
            select.appendChild(opt);
        }
        select.style.display = "block";
    }
    if (downloadBtn) {
        downloadBtn.style.display = "block";
    }
    if (hint) {
        hint.style.display = "block";
    }
    setStatus("");
}

/**
 * Toggle the panel for the given page URL, anchored near (x, y).
 * Clicking the floating button while the panel is open closes it.
 */
export function toggleVideoDownloadPanel(pageUrl: string, x: number, y: number) {
    if (panel && currentPageUrl === pageUrl) {
        closePanel();
        return;
    }
    closePanel();
    currentPageUrl = pageUrl;
    panel = buildPanel();
    // anchor below the click point, clamped to viewport
    const left = Math.max(8, Math.min(window.innerWidth - PANEL_WIDTH - 8, x - PANEL_WIDTH / 2));
    const top = Math.max(8, Math.min(window.innerHeight - 120, y + 12));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    document.documentElement.appendChild(panel);
    void fetchAndPopulate(pageUrl);
}

export function closePanel() {
    currentPageUrl = null;
    dragState = null;
    if (panel) {
        panel.remove();
        panel = null;
    }
}

export function isPanelOpen(): boolean {
    return panel != null;
}
