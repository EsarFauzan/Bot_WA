# AGENT.md — Bot WhatsApp (bot-wa)

Dokumen ini adalah **single source of truth** untuk project ini. Agent AI
maupun pengembang baru cukup membaca file ini untuk memahami arsitektur,
konvensi, riwayat perubahan, dan kondisi terkini — tanpa perlu analisis ulang.

> Aturan jujur: dokumen ini mencerminkan kondisi kode yang **benar-benar ada**
> sekarang. Fitur/modul yang sudah dihapus ditulis sebagai "sudah dihapus",
> bukan seolah masih ada.

---

## 1. Ringkasan Project

Bot WhatsApp pribadi (nama internal: **EsarFauzan**) berbasis
**Node.js (CommonJS)** + `whatsapp-web.js` + Puppeteer.

- **Mode berjalan: command-only** — bot hanya merespons pesan yang diawali `!`.
  Tidak ada percakapan AI bebas, tidak ada auto-reply selain command.
- Entry point: `index.js` (±577 baris) — client WhatsApp, helper media (stiker,
  ffmpeg, yt-dlp, clipdrop), router command, health monitor.
- Persistensi: file JSON di root project (tanpa database).
- Test: `node:test` — **29/29 lolos** (`npm test`).
- Target VPS RAM kecil (1GB) → banyak keputusan desain demi hemat CPU/RAM.

### Quickstart
```bash
npm install      # pasang dependensi
npm start        # jalankan bot (node index.js) — akan muncul QR untuk scan
npm test         # node --test tests/*.test.js (29 test)
```

### Cara update di VPS (ringkas)
```bash
cd ~/Bot_WA
git pull
npm install          # hanya jika package.json berubah
pm2 restart bot-wa
```
File `Cara Update Bot.md` / `Cara Update Bot.txt` di root memuat panduan VPS
yang lebih lengkap.

---

## 2. Arsitektur Saat Ini

```
bot-wa/
├─ index.js                        # entry: client, helper media, router, health
├─ package.json                    # CommonJS ("type": "commonjs")
├─ .env                            # di root, masuk .gitignore (lihat §7)
├─ AGENT.md                        # dokumen ini
├─ Cara Update Bot.md / .txt       # panduan deploy VPS
├─ src/
│  ├─ commands/
│  │  ├─ basicCommands.js          # !stats, !health, !reset, !menu/!help
│  │  ├─ mediaCommands.js          # stiker, storyin, download, rmbg, upscale, qr, kompres
│  │  └─ createCommandRouter.js    # orkestrator: panggil basic → media, return saat handled
│  ├─ messages/
│  │  └─ helpMenu.js               # teks menu !menu (tanpa emoji)
│  ├─ monitoring/
│  │  └─ health.js                 # buildHealthReport / buildHealthLogLine
│  ├─ storage/
│  │  ├─ dataStore.js              # state in-memory per domain + persist(domain) atomic
│  │  ├─ jsonStore.js              # loadJSON/saveJSON atomic (.tmp → rename, backup .bak)
│  │  └─ learningDataStore.js      # (modul lama, sudah tidak dipakai handler aktif)
│  └─ utils/
│     ├─ jobQueue.js               # antrean job + rate limiter (dipakai mediaCommands)
│     ├─ safeTyping.js             # indikator "typing" yang mengabaikan error (chat @lid)
│     ├─ timeContext.js            # helper zona waktu — TIDAK dipakai handler aktif
│     └─ timeHelpers.js            # addMinutesToTime, pickRandom — TIDAK dipakai handler aktif
└─ tests/
   ├─ basicCommands.test.js
   ├─ dataStore.test.js            # smoke read-only
   ├─ jobQueue.test.js
   ├─ jsonStore.test.js
   ├─ learningDataStore.test.js
   ├─ timeContext.test.js
   └─ timeHelpers.test.js
```

> Folder `src/schedulers/` **sudah dihapus** (lihat §6). Jangan membuat ulang
> scheduler kecuali diminta.

### Alur pesan (index.js `client.on('message')`)
1. Lewati jika `msg.type` bukan chat/image/video/document/sticker/ptt/audio.
2. `caption media` dibersihkan dari mention; bila caption = `stiker`/`sticker`
   (dan ada media), caption dipetakan ke `!stiker`.
3. Bila teks tidak diawali `!` → abaikan (command-only).
4. Rate limit global 2 detik per user (map `cooldowns`, kunci per pengirim).
5. Catat ke statistik (`stats.totalChats` / `lastActive`, tersimpan ke
   `learned_data.json`), lalu kirim ke `createCommandRouter`.
6. Error apa pun ditangkap: log stack + balas "Command gagal diproses." —
   tidak pernah mematikan proses.

### Handler yang aktif
- **createCommandRouter** memanggil berurutan: `basicCommands` lalu
  `mediaCommands`. Handler pertama yang `return true` menghentikan rantai.
- **basicCommands**: `!stats`, `!health`, `!reset`, `!menu`/`!help`.
- **mediaCommands**: seluruh command media, task berat lewat
  `runHeavy(key, fn)` → antrean `jobQueue` (concurrency 1) + rate limiter
  (cooldown 20 detik per user per command). Bila kena cooldown, user diberi
  tahu menunggu N detik.

---

## 3. Daftar Command (yang ADA sekarang)

| Command | Fungsi | Catatan |
|---|---|---|
| `!menu` / `!help` | Tampilkan menu | teks sama |
| `!stats` | Statistik chat | baca `learned_data.json` |
| `!health` | Status bot (uptime, memori, dst.) | dari `src/monitoring/health.js` |
| `!reset` | Reset riwayat per user | hapus `history[uid]` |
| `!stiker` | Reply/kirim foto-GIF-video → stiker | caption `stiker` juga auto-maps ke sini |
| `!storyin` | Reply video dokumen → video HD untuk story | max 50MB |
| `!ig [link]` | Download reels/post IG | anonim, sering kena rate-limit IG |
| `!tiktok [link]` | Download video TikTok | |
| `!yt [link]` | Download video YouTube | |
| `!yt audio [link]` | Download MP3 YouTube | |
| `!rmbg` | Hapus background foto → stiker transparan | butuh `CLIPDROP_API_KEY` |
| `!upscale` | Perbesar kualitas foto (maks 4x / 2048px) | butuh `CLIPDROP_API_KEY` |
| `!qr [teks/link]` | Buat QR dari teks/link | |
| `!qr` (kirim/reply foto) | Buat QR dari gambar | butuh `IMGBB_API_KEY` |
| `!kompres` | Kompres ukuran foto | sharp |

### Konvensi penting (JANGAN dilanggar)
- **Semua teks balasan bot — termasuk menu, caption media, dan console log —
  bebas emoji.** Ini keputusan user (commit 6638164 & 3123608). Console log
  memakai label `ERROR:` / `WARNING:` sebagai pengganti emoji. Jangan
  menambahkan emoji ke string apa pun yang dikirim bot atau dicetak ke log.
- Bahasa balasan: Indonesia informal (mis. "Bentar, sy optimize videonya
  dulu. Sabar yaa..."). Pertahankan gaya itu saat mengedit teks.
- Semua balasan/state lewat objek `ctx = { cmd, msg, uid }`; `cmd` sudah
  di-`toLowerCase().trim()`.
- Task berat (ffmpeg/download/API) **wajib** lewat `runHeavy`, jangan langsung.

---

## 4. Dependency & Environment

Dependencies aktif (`package.json`):
`axios, dotenv, ffmpeg-static, form-data, qrcode, qrcode-terminal, sharp,
whatsapp-web.js, yt-dlp-exec`.

> `whatsapp-web.js` di-pin ke fork GitHub
> `lindionez/whatsapp-web.js#feat/fix-_serialized-id-fallback` (bukan versi npm).
> Alasan: bug wwebjs resmi — lihat §6 commit `bed4ac0`.

Tidak ada env wajib (`REQUIRED_ENV = []`). Env opsional (dicek saat start,
hanya warning bila kosong):

| Key | Dipakai untuk |
|---|---|
| `CLIPDROP_API_KEY` | `!rmbg` & `!upscale` |
| `IMGBB_API_KEY` | `!qr` dari gambar (unggah foto) |
| `BOT_TIMEZONE` | default `Asia/Makassar` (health report) |

Catatan: file `.env` di root (sudah masuk `.gitignore`).

---

## 5. Persistensi Data

- `dataStore.js` = satu lapis state in-memory + persist per domain (atomic
  via `jsonStore`). Domain yang **masih dipakai**: `learning`
  (`learned_data.json`, untuk `!stats` & health).
- **Domain mati masih didefinisikan di `dataStore.js`** (reminders, jadwal,
  jadwalInsight, sholatMode, zikirAuto, notes, todo, ujian, akademik,
  jadwalInsightState, zikirAutoState, chatLog) beserta path filenya. File JSON
  untuk domain tersebut **sudah dihapus dari repo** (git rm, commit 6638164)
  dan tidak dipakai handler apa pun. `loadJSON` punya fallback, jadi bot tetap
  aman. **Cleanup opsional**: hapus domain mati + FILES + save-fn-nya dari
  `dataStore.js`, lalu sesuaikan `tests/dataStore.test.js`.
- `.gitignore` mencakup `.env`, `learned_data.json`, `chat_logs.json`, dan
  file data fitur lama + `*.tmp`/`*.bak` + file download sementara
  (`ig_tmp_*.mp4`, `tt_tmp_*.mp4`, `yt_tmp_*.mp4`). Jangan commit file data.

---

## 6. Riwayat Perubahan (commit → efek)

Urutan commit terbaru di `main`:

1. **91f33ca** — Logging error penuh (stack trace) di handler command, untuk
   debug error `r` misterius.
2. **0104146** — Fix: semua pemanggilan indikator typing diganti `safeTyping()`
   (mengabaikan error `getChat`/`sendStateTyping` pada chat format `@lid`).
   Sebelumnya error kosmetik ini menggagalkan seluruh command media.
3. **bed4ac0** — Fix akar masalah `r: r`: `downloadMedia`/typing gagal untuk
   chat `@lid` karena update WhatsApp Web mengganti nama properti internal
   message-id. Solusi: pin `whatsapp-web.js` ke fork `lindionez` yang memuat
   backport fix `_normalizeId` + fallback. **Kembalikan ke npm bila fix resmi
   dirilis** (PR wwebjs #201840 masih open saat commit ini dibuat).
4. **44d99ca** — **Pemangkasan fitur besar-besaran** (atas permintaan user):
   bot hanya menyisakan Download (`!ig`/`!tiktok`/`!yt`), Story (`!storyin`),
   Stiker & Edit Foto (`!stiker`/`!rmbg`/`!upscale`/`!kompres`/`!qr`), dan
   `!stats`/`!health`/`!reset`/`!menu`.
   - Dihapus file handler: `reminderJadwalCommands.js`, `utilityCommands.js`,
     `productivityCommands.js`.
   - Dihapus semua scheduler: folder `src/schedulers/` (prayer reminder,
     jadwal kuliah + insight IT, auto zikir).
   - Dihapus modul pendukung: `src/messages/itContent.js`,
     `src/storage/jadwalKuliahStore.js`, beserta test-nya.
   - Dihapus dependency `node-schedule` (hanya dipakai scheduler & `!ingatkan`).
   - `index.js` tidak lagi memuat scheduler, alias state domain mati, wrapper
     `save*`, `userModes`, `!mode*`; `basicCommands` tanpa mode;
     `helpMenu` ramping; `health.js` tanpa baris reminder/jadwal/notes/todos.
5. **6638164** — Semua emoji dihapus dari **balasan bot** (msg.reply, caption,
   menu) + kalimat dirapikan; **git rm** 11 file JSON data fitur lama
   (reminders, jadwal_groups, jadwal_insight_groups/state, jadwal_kuliah,
   notes, akademik, ujian, sholat_modes, zikir_auto_targets/state).
6. **3123608** — Emoji dihapus dari **console log** `index.js`, diganti label
   `ERROR:`/`WARNING:`.

Fitur yang sudah dihapus (jangan dihidupkan tanpa permintaan eksplisit):
`!mode*`, `!cuaca`, `!sholat*`, `!quran`, `!reminder*`, `!jadwal*`,
`!catat`/`!notes`, `!todo*`, `!ingatkan`, `!akademik*`, `!ujian*`, `!anime`,
`!zikir*`, `!github`, dan semua kiriman otomatis terjadwal.

---

## 7. Yang Masih Bermasalah / Dapat Ditingkatkan

1. **`!ig` anonim tidak andal** — Instagram sering memblokir unduhan anonim
   yt-dlp (`rate-limit reached or login required`). Perbaikan membutuhkan
   cookie login (via yt-dlp `--cookies`). Bukan bug kode.
2. **Data JSON lama** — file data fitur yang dihapus sudah tidak ada di repo,
   tapi `dataStore.js` masih mendefinisikan domain + path-nya (dead code).
   Bersihkan bila sempat (lihat §5).
3. **Modul yatim**: `src/utils/timeContext.js` & `src/utils/timeHelpers.js`
   (plus test-nya) tidak dipakai handler aktif sejak scheduler dihapus — bisa
   dihapus; begitu juga `src/storage/learningDataStore.js` (modul lama).
   Pengecualian: pertahankan bila akan dipakai lagi.
4. **`chatLog`** domain tidak pernah ditulis handler aktif (sisa lama).
5. **whatsapp-web.js fork** — bersifat sementara sampai fix `@lid` dirilis di
   npm resmi.

---

## 8. Cek Sebelum Menganggap Selesai

- `node --check index.js` dan semua file yang diubah.
- `npm test` → harap **29/29 lolos**.
- Pastikan tidak ada emoji di string yang dikirim bot / dicetak ke log.
- Jangan menambah command/feature di luar daftar §3 tanpa konfirmasi user.
