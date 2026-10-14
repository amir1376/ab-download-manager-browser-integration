# Laporan: Tombol "Download Video" ala IDM (Browser Extension + Desktop)

Tanggal: 2026-10-14. Desain: [VIDEO-POPUP-DESIGN.md](./VIDEO-POPUP-DESIGN.md).

## Ringkasan

Fitur pop-up download video ala IDM selesai diimplementasikan di dua repo:

1. **Ekstensi** (`~/workspace/abdm-browser-integration`, belum di-push):
   tombol floating "Download video" muncul di sudut elemen `<video>` saat
   di-hover; klik → aplikasi desktop membuka dialog yt-dlp dengan URL halaman
   sudah terisi.
2. **Desktop** (`~/workspace/ab-download-manager`, branch baru
   `feat/browser-video-popup` dari `feat/ytdlp`, belum di-push): handler pesan
   native messaging baru + dialog yt-dlp mendukung prefill URL.

## File yang dibuat/diubah — ekstensi

| File | Perubahan |
|---|---|
| `src/contentscripts/VideoDownloadButton.ts` | BARU: deteksi `<video>` (MutationObserver), tombol overlay ala IDM, kirim pesan ke background |
| `src/contentscripts/ContentScript.ts` | panggil `bootVideoDownloadButton()` saat init |
| `src/message/Commands.ts` | `YTDLP_VIDEO_DOWNLOAD: "ytdlp_video_download"` |
| `src/shim.d.ts` | daftarkan command baru di webext-bridge `ProtocolMap` |
| `src/background/background.ts` | registrasi `onMessage` baru |
| `src/background/actions.ts` | `requestYtDlpVideoDownload()` + interface `YtDlpVideoDownloadData` |
| `src/backend/Backend.ts` | `ytdlpVideoDownload(url)` via native messaging langsung (bisa meluncurkan aplikasi) |
| `src/backend/NativeMessagingApi.ts` | `ytdlpVideoDownload({url})` → action `"ytdlp_video"` |
| `src/configs/Config.ts` | `videoDownloadButtonEnabled` (default true) |
| `src/optionsui/OptionUi.tsx` | toggle on/off di halaman opsi + section UI baru |
| `public/_locales/en/messages.json` | 4 string baru |
| `public/_locales/id/messages.json` | BARU: terjemahan Indonesia |

## File yang diubah — desktop (branch `feat/browser-video-popup`)

| File | Perubahan |
|---|---|
| `.../nativemessaging/host/DefinedHandlers.kt` | `YtDlpVideoNativeRequestHandler` (action `"ytdlp_video"`) + registrasi |
| `.../utils/singleInstance/service/IDefaultAppIPCService.kt` | `suspend fun openYtDlpDialog(url: String)` (antarmuka kotlinx.rpc) |
| `.../utils/singleInstance/service/DefaultAppIPCServiceImpl.kt` | implementasi → `appComponent.openYtDlpDialog(url)` |
| `.../desktop/AppComponent.kt` | `openYtDlpDialog(prefillUrl)`; `Config` dipakai untuk prefill; bila dialog sudah terbuka, URL di-update |
| `shared/.../pagemanager/YtDlpDialogManager.kt` | `openYtDlpDialog(prefillUrl: String = "")` (default → pemanggil lama tidak pecah) |
| `shared/.../pages/ytdlp/YtDlpDownloadComponent.kt` | `Config`: `data object` → `data class Config(val prefillUrl: String = "")` |

## Protokol pesan

1. Content script → background (webext-bridge): command `"ytdlp_video_download"`,
   data `{pageUrl, pageTitle?, videoSrc?}`.
2. Background → desktop (native messaging): `{id, content: {action: "ytdlp_video",
   isError: false, payload: "{\"url\":\"<pageUrl>\"}"}}`; balasan `payload: "true"`.
3. Native host → aplikasi (IPC kotlinx.rpc, single-instance):
   `IDefaultAppIPCService.openYtDlpDialog(url)`.

Catatan: selalu kirim **page URL** (bukan `video.src`) karena situs seperti
YouTube memakai blob/MSE — yt-dlp yang mengekstrak URL media aslinya.

## Verifikasi yang sudah dilakukan

- ✅ `npx tsc --noEmit`: tidak ada error baru (error yang tersisa —
  `BackendProvider.ts`, `manifest.chrome.ts`, `manifest.firefox.ts`, dan
  type internal `webext-bridge` — sudah ada di tree pristine).
- ✅ `npm run build:chrome` sukses; bundle memuat registrasi
  `onMessage(YTDLP_VIDEO_DOWNLOAD)` dan pemanggilan native messaging
  `ytdlp_video`; `_locales/id` ikut ter-copy ke `dist/`.
- ✅ Sisi Kotlin: semua API yang dipakai diverifikasi ada
  (`setUrl`, `childSlot(...).value.child?.instance`, `appIPC.getService().useService`,
  pola `context(json)`, `NativeMessagingMessage.Content.boolean`).
- ⚠️ **Kode Kotlin belum dikompilasi** — VM ini tidak punya Android SDK/artefak
  Compose dan RAM terlalu kecil untuk Gradle daemon. Perlu
  `./gradlew :desktop:app:run` atau CI di mesin dev.

## Cara tes manual ekstensi

**Chrome/Edge:**
1. `npm run build:chrome` (hasil di `dist/chrome/`).
2. Buka `chrome://extensions` → aktifkan Developer mode → Load unpacked →
   pilih `dist/chrome`.
3. Buka halaman dengan video (mis. halaman biasa dengan tag `<video>`),
   arahkan mouse ke video → tombol "⬇ Download video" muncul di kanan atas video.
4. Klik → aplikasi AB Download Manager harus terbuka dengan dialog yt-dlp dan
   URL halaman terisi. (Aplikasi harus sudah di-install agar native messaging
   host terdaftar; klik juga berfungsi meluncurkan aplikasi bila belum jalan.)

**Firefox:**
1. `npm run build:firefox` → `about:debugging#/runtime/this-firefox` →
   Load Temporary Add-on → pilih `dist/firefox/manifest.json`.

## Keterbatasan v1

- Tombol hanya mendeteksi `<video>` di DOM utama; tidak masuk shadow DOM atau
  iframe cross-origin.
- Heuristik ukuran (min 240×140 px, durasi ≥ 3 dtk bila diketahui) — video kecil
  / iklan pendek diabaikan; bisa disetel di `VideoDownloadButton.ts`.
- Selalu buka dialog (prefill URL saja, tanpa auto-fetch info).
- Belum ada aksi di HTTP integration server (hanya native messaging).
- Perlu build ulang + uji end-to-end di mesin dev untuk sisi Kotlin.

## Langkah tersisa (untuk parent agent / user)

1. Push branch `feat/browser-video-popup` ke fork dan (opsional) push repo
   ekstensi / buat PR ke upstream.
2. Di mesin dev: `./gradlew :desktop:app:run`, uji klik tombol dari browser →
   dialog yt-dlp terbuka dengan URL terisi → "Ambil info" → download.
3. Pertimbangkan menambah `openYtDlpDialog` ke HTTP API (`integration/server`)
   bila ingin dukungan tanpa native messaging.
