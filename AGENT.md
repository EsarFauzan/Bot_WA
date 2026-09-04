# AGENT.md — Bot WhatsApp (bot-wa)

Dokumen ringkasan untuk membantu agent AI (dan pengembang lain) memahami
project ini: **hasil analisis**, **perubahan yang sudah benar-benar dilakukan**,
dan **hal-hal yang masih bermasalah / belum dikerjakan**.

> Catatan jujur: dokumen ini mencatat kondisi kode saat ini apa adanya.
> Perubahan yang belum benar-benar diterapkan ke file TIDAK ditulis seolah sudah selesai.

---

## 1. Ringkasan Project

Bot WhatsApp berbasis **Node.js (CommonJS)** memakai `whatsapp-web.js` + Puppeteer.
Mode berjalan: **command-only** (hanya merespons pesan yang diawali `!`, plus
caption media `stiker`/`sticker` yang dipetakan ke `!stiker`).

- Entry point: `index.js` (client, router command, helper media)
- Struktur folder: `src/commands`, `src/messages`, `src/monitoring`, `src/storage`, `src/utils`
- Persistensi: file JSON di root project (tanpa database)
- Test: `node:test`, saat ini **29 test lolos** (`npm test`)
- Dependency `whatsapp-web.js` di-pin ke fork `lindionez` (fix bug `r: r`
  untuk chat `@lid`; PR resmi #201840 belum dirilis di npm).

---

## 2. Hasil Analisis

### 2.1 Struktur yang Ada
```
bot-wa/
├─ index.js                      # entry: client, router command, helper media
├─ package.json                  # CommonJS, "type": "commonjs"
├─ .env                          # (ada di root; sudah masuk .gitignore)
├─ *.json                        # file data lama: reminders, notes, dll. (sisa)
└─ src/
   ├─ commands/
   │  ├─ basicCommands.js          # stats, health, reset, help/menu
   │  ├─ mediaCommands.js          # stiker, storyin, download, kompres, rmbg, upscale, qr (pakai jobQueue + rateLimiter)
   │  └─ createCommandRouter.js    # orkestrator (chain handler)
   ├─ messages/
   │  └─ helpMenu.js               # daftar fitur yang dipertahankan
   ├─ monitoring/health.js
   ├─ storage/
   │  ├─ learningDataStore.js       # (lama) khusus data learning
   │  ├─ jsonStore.js               # load/save atomic + backup
   │  └─ dataStore.js               # konsolidasi state & persistensi (persist per domain)
   └─ utils/
      ├─ safeTyping.js              # indikator typing yang aman (abaikan error @lid)
      ├─ timeContext.js             # helper zona waktu (tidak dipakai handler aktif)
      ├─ timeHelpers.js             # addMinutesToTime, pickRandom (tidak dipakai handler aktif)
      └─ jobQueue.js                # antrean job (enqueue → Promise) + rate limiter
```

### 2.2 Fitur yang Dipertahankan
- 📥 **Download**: `!ig [link]`, `!tiktok [link]`, `!yt [link]`, `!yt audio [link]`
- 🎬 **Story**: `!storyin` (reply/send video dokumen → optimize HD)
- 🖼️ **Stiker & Edit Foto**: caption `stiker`/`sticker` → auto stiker; `!stiker`,
  `!rmbg`, `!upscale`, `!kompres`, `!qr [teks/link]`, foto + `!qr`
- ⚙️ **Lainnya**: `!stats`, `!health`, `!reset`, `!menu`

### 2.3 Fitur yang Sudah Dihapus (2026-09)
- Command & handler: `!mode*`, `!cuaca`, `!sholat`, `!quran`, `!reminder`,
  `!jadwal*`, `!catat`/`!notes`, `!todo`, `!ingatkan`, `!akademik`, `!ujian`,
  `!anime`, `!zikir`, `!github` → file `reminderJadwalCommands.js`,
  `utilityCommands.js`, `productivityCommands.js` dihapus.
- Scheduler otomatis (prayer reminder, jadwal kuliah + insight IT, auto zikir)
  dihapus → folder `src/schedulers/` tidak ada lagi.
- Modul pendukung yang hanya dipakai fitur di atas ikut dihapus: `itContent.js`,
  `jadwalKuliahStore.js`, test-nya, dan dependency `node-schedule`.
- `index.js` tidak lagi menjalankan scheduler maupun menyimpan state domain
  reminders/jadwal/sholat/zikir/notes/todo/ujian/akademik; dataStore tetap memuat
  file JSON lama namun hanya domain `learning` yang dipakai handler aktif.

### 2.4 Temuan Penting (dari analisis kode)
- **Handler aktif sederhana**: `client.on('message')` di `index.js` hanya memproses
  command yang diawali `!`; caption media `stiker`/`sticker` dipetakan ke `!stiker`.
- **Bug whatsapp-web.js untuk `@lid`**: error minified `r: r` pada `downloadMedia`,
  `getChat`, typing untuk nomor format baru. Diatasi dengan (1) helper
  `safeTyping()` yang mengabaikan error typing, dan (2) mem-pin dependency ke
  fork `lindionez/whatsapp-web.js#feat/fix-_serialized-id-fallback`.
- **Task berat memakai antrean**: stiker video & download lewat `mediaJobQueue`
  (concurrency 1) + `mediaRateLimiter` (cooldown 20 detik per user per command).
- **Rate limit global**: satu `cooldowns` map dengan jeda 2 detik per user.

---

## 3. Perubahan yang Sudah Dilakukan (terverifikasi)

> Yang tercantum di bawah ini adalah file yang **benar-benar dibuat/diubah**
> dan sudah dicek bisa di-`require` / dijalankan.

### 3.1 Perubahan Pemangkasan Fitur (terbaru)
- `src/commands/createCommandRouter.js`: hanya me-wire `basicCommands` + `mediaCommands`.
- `src/commands/basicCommands.js`: hapus `!mode*`, sisakan `!stats`, `!health`,
  `!reset`, `!menu`/`!help` (tanpa dependency `userModes`).
- `src/messages/helpMenu.js`: menu ramping hanya fitur yang dipertahankan.
- `src/monitoring/health.js`: baris reminder/jadwal/notes/todos/ujian/scheduler dihapus.
- `index.js`: hapus require & startup scheduler, alias state domain yang dihapus,
  wrapper `save*`, `userModes`, `schedule`, dan dependency `node-schedule`.
- File dihapus: `src/commands/{reminderJadwalCommands,utilityCommands,productivityCommands}.js`,
  `src/schedulers/*`, `src/messages/itContent.js`, `src/storage/jadwalKuliahStore.js`,
  `tests/{itContent,jadwalKuliahStore}.test.js`.
- `tests/basicCommands.test.js` ditulis ulang untuk `!stats`/`!health`/`!menu`/`!reset`.

### 3.2 Status Verifikasi
- `node --check` lolos untuk `index.js` dan semua file command/menu/health.
- `npm test` → **29/29 lolos**.

---

## 4. Yang Masih Bermasalah / Belum Dikerjakan

### 4.1 Catatan Berkas Data
- File `*.json` data milik fitur yang dihapus (reminders, jadwal, notes,
  akademik, ujian, sholat, zikir, dll.) sudah **dihapus dari repo** (git rm).
  `dataStore` masih mendefinisikan domain-nya dengan fallback kosong, jadi bot
  tetap bisa jalan tanpa file tersebut.
- `learned_data.json` (statistik `!stats`) dan `chat_logs.json` tetap ada di
  disk tapi masuk `.gitignore` (tidak di-commit).

### 4.2 Catatan Tes
- Test tersisa: `basicCommands`, `dataStore` (smoke read-only), `jobQueue`,
  `jsonStore`, `learningDataStore`, `timeContext`, `timeHelpers`.
- `dataStore` sengaja hanya di-smoke-test (read-only) karena menulis file data asli.

### 4.3 Masih Bisa Ditingkatkan (opsional)
- `!ig` anonim sering kena rate-limit Instagram (`login required`) — butuh cookie
  login via yt-dlp bila mau andal.
- `timeContext.js` / `timeHelpers.js` kini tidak dipakai handler aktif — bisa dihapus.
- Begitu `whatsapp-web.js` resmi merilis fix `@lid`, kembalikan dependency ke versi npm.

---

## 5. Cara Menjalankan
```bash
npm install      # pasang dependensi
npm start        # jalankan bot (node index.js)
npm test         # jalankan test (node --test tests/*.test.js)
```
