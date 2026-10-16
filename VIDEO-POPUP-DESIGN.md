# Desain: Tombol "Download Video" ala IDM di Browser

Tujuan: saat ada `<video>` yang diputar/ditampilkan di halaman web, muncul tombol
floating "Download video" di sudut video. Klik tombol → aplikasi desktop AB Download
Manager terbuka dengan dialog yt-dlp dan URL halaman sudah terisi.

## Arsitektur pesan (end-to-end)

```
[content script: VideoDownloadButton.ts]
   mouse hover / video playing
   → overlay button di sudut video
   → klik: webext-bridge sendMessage("ytdlp_video_download",
             {pageUrl, pageTitle, videoSrc}, "background")
        ↓
[background.ts] onMessage("ytdlp_video_download")
   → actions.requestYtDlpVideoDownload(data)
   → native messaging transport.requestTyped("ytdlp_video", {url: pageUrl})
        ↓  (bisa membangunkan / meluncurkan aplikasi desktop bila belum jalan)
[desktop: NativeMessagingHost → NativeMessagingRouter]
   → YtDlpVideoNativeRequestHandler (action == "ytdlp_video")
   → IPC (kotlinx.rpc): IDefaultAppIPCService.openYtDlpDialog(url)
        ↓
[desktop: AppComponent.openYtDlpDialog(prefillUrl)]
   → slot dialog yt-dlp aktif, YtDlpDownloadComponent.setUrl(prefillUrl)
   → user tinggal klik "Ambil info" → pilih format → download
```

## Keputusan desain penting

1. **Kirim page URL, bukan video.src.** Untuk YouTube/TikTok/dll, `video.src`
   adalah blob/MSE yang tidak bisa diunduh langsung. yt-dlp mengekstrak dari
   URL halaman. `videoSrc` tetap dikirim sebagai info tambahan (non-blob saja).
2. **Tidak pakai deteksi network yang sudah ada** (`MediaOnTab`/LinkGrabber).
   Itu untuk file media direct-download. Tombol ini DOM-based ala IDM:
   tampil di dekat elemen `<video>`.
3. **Izin manifest minimal.** Content script sudah `matches: ["*://*/*"]`,
   tidak perlu izin baru. Tidak perlu `webRequest`/`tabs`.
4. **Prefill URL saja, tanpa auto-fetch.** Dialog terbuka dengan URL terisi;
   user menekan "Ambil info" sendiri (menghindari yt-dlp berjalan otomatis,
   termasuk kemungkinan download binary dulu).
5. **Satu tombol shared, bukan satu per video.** Tombol fixed-position mengikuti
   video yang sedang di-hover / sedang diputar & terbesar. Lebih ringan dan
   tidak merusak layout halaman (tidak membungkus `<video>`).
6. **Heuristik anti-sampah:** video diabaikan bila ukuran render < 240×140 px,
   atau `duration` < 3 detik (bila diketahui), atau disembunyikan (display:none).
   Atribut `data-abdm-video-btn="done"` menandai video yang sudah diproses.

## File yang dibuat/diubah

### Ekstensi (`abdm-browser-integration`)
| File | Aksi |
|---|---|
| `src/contentscripts/VideoDownloadButton.ts` | BARU: deteksi `<video>`, overlay button, kirim pesan |
| `src/contentscripts/ContentScript.ts` | ubah: panggil `bootVideoDownloadButton()` di init |
| `src/message/Commands.ts` | ubah: tambah `YTDLP_VIDEO_DOWNLOAD: "ytdlp_video_download"` |
| `src/background/background.ts` | ubah: registrasi `onMessage` baru |
| `src/background/actions.ts` | ubah: tambah `requestYtDlpVideoDownload()` |
| `src/backend/NativeMessagingApi.ts` | ubah: tambah `ytdlpVideoDownload({url})` → action `"ytdlp_video"` |
| `public/_locales/en/messages.json` | ubah: string baru |
| `public/_locales/id/messages.json` | BARU: terjemahan Indonesia |

### Desktop (`ab-download-manager`, branch `feat/browser-video-popup`)
| File | Aksi |
|---|---|
| `shared/app/.../pagemanager/YtDlpDialogManager.kt` | ubah: `openYtDlpDialog(prefillUrl: String = "")` |
| `shared/app/.../pages/ytdlp/YtDlpDownloadComponent.kt` | ubah: `Config` jadi `data class Config(val prefillUrl: String = "")` |
| `desktop/app/.../desktop/AppComponent.kt` | ubah: childFactory pakai config + `openYtDlpDialog(prefillUrl)` isi URL bila dialog sudah terbuka |
| `desktop/app/.../utils/singleInstance/service/IDefaultAppIPCService.kt` | ubah: tambah `suspend fun openYtDlpDialog(url: String)` |
| `desktop/app/.../utils/singleInstance/service/DefaultAppIPCServiceImpl.kt` | ubah: implementasi → `appComponent.openYtDlpDialog(url)` |
| `desktop/app/.../nativemessaging/host/DefinedHandlers.kt` | ubah: tambah `YtDlpVideoNativeRequestHandler` + registrasi |

## Protokol pesan (ringkas)

- webext-bridge (content→background): command `"ytdlp_video_download"`,
  data `{pageUrl: string, pageTitle?: string, videoSrc?: string}`.
- native messaging (extension→desktop): `{id, content: {action: "ytdlp_video",
  isError: false, payload: "{\"url\":\"...\"}"}}`; respons `{..., payload: "true"}`.
- IPC kotlinx.rpc: `IDefaultAppIPCService.openYtDlpDialog(url: String)`.

## Keterbatasan v1 (jujur)

- Tombol hanya untuk `<video>` di DOM utama; video di dalam shadow DOM / iframe
  beda-origin tidak terdeteksi (content script tidak masuk cross-origin iframe).
- Situs dengan player kustom (YouTube) tetap mengandalkan page URL → yt-dlp.
- Tidak ada opsi "download langsung tanpa dialog" di v1 (selalu buka dialog).
- Belum ada toggle on/off khusus di halaman opsi ekstensi (mengikuti pola
  `popupEnabled`; mudah ditambah bila diminta).
- Kode Kotlin mengikuti pola existing dan API-nya diverifikasi ada, tetapi
  **belum dikompilasi** (VM ini tidak punya Android SDK/artefak Compose dan
  RAM terlalu kecil untuk Gradle daemon) — perlu `./gradlew :desktop:app:run`
  atau CI di mesin dev.
