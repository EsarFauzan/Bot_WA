# AGENT.md — Bot WhatsApp (bot-wa)

Dokumen ringkasan untuk membantu agent AI (dan pengembang lain) memahami
project ini: **hasil analisis**, **perubahan yang sudah benar-benar dilakukan**,
dan **hal-hal yang masih bermasalah / belum dikerjakan**.

> Catatan jujur: dokumen ini mencatat kondisi kode saat ini apa adanya.
> Perubahan yang belum benar-benar diterapkan ke file TIDAK ditulis seolah sudah selesai.

---

## 1. Ringkasan Project

Bot WhatsApp berbasis **Node.js (CommonJS)** memakai `whatsapp-web.js` + Puppeteer.
Mode berjalan: **command-only** (hanya merespons pesan yang diawali `!`).

- Entry point: `index.js` (±1701 baris)
- Struktur folder: `src/commands`, `src/messages`, `src/monitoring`, `src/storage`, `src/utils`
- Persistensi: file JSON di root project (tanpa database)
- Test: `node:test`, saat ini **7 test lolos** (`npm test`)

---

## 2. Hasil Analisis

### 2.1 Struktur yang Ada
```
bot-wa/
├─ index.js                      # entry: client, router command, helper media (±660 baris)
├─ package.json                  # CommonJS, "type": "commonjs"
├─ .env                          # (ada di root; sudah masuk .gitignore)
├─ *.json                        # file data: reminders, jadwal, notes, dll.
└─ src/
   ├─ commands/
   │  ├─ basicCommands.js          # mode, stats, health, reset, help/menu
   │  ├─ mediaCommands.js          # stiker, storyin, download, kompres, dsb. (pakai jobQueue + rateLimiter)
   │  ├─ reminderJadwalCommands.js # reminder & jadwal grup
   │  ├─ utilityCommands.js        # cuaca, sholat, zikir, quran, dll.
   │  ├─ productivityCommands.js   # todo, notes, akademik, ujian
   │  └─ createCommandRouter.js    # orkestrator (chain handler)
   ├─ messages/
   │  ├─ helpMenu.js
   │  └─ itContent.js              # (BARU) quotes & fakta IT (tanpa openai)
   ├─ monitoring/health.js
   ├─ schedulers/                  # (BARU) dipindah dari index.js
   │  ├─ prayerScheduler.js        # reminder sholat per grup
   │  ├─ jadwalScheduler.js        # reminder jadwal kuliah + insight (fakta/quotes IT)
   │  ├─ zikirScheduler.js         # auto zikir (tetap + random pasca sholat)
   │  └─ prayerTimes.js            # fetch jadwal sholat + cache bersama
   ├─ storage/
   │  ├─ learningDataStore.js       # (lama) khusus data learning
   │  ├─ jsonStore.js               # load/save atomic + backup
   │  ├─ dataStore.js               # konsolidasi state & persistensi (persist per domain)
   │  └─ jadwalKuliahStore.js       # (BARU) jadwal_kuliah.json + normalisasi
   └─ utils/
      ├─ timeContext.js
      ├─ timeHelpers.js             # addMinutesToTime, pickRandom
      └─ jobQueue.js                # antrean job (enqueue → Promise) + rate limiter
```

### 2.2 Temuan Penting (dari analisis kode asli)
- **Dead code AI**: `openai`, `genAI`, `MODEL_NAME`, `VISION_MODEL` **tidak pernah
  didefinisikan**. Blok `client.on('message_disabled')` (handler lama berisi
  transkrip suara/analisis gambar AI) adalah **dead code** yang tidak pernah aktif
  karena handler aktif saat ini hanya me-route command `!...`.
- **Handler aktif sederhana**: `client.on('message')` di `index.js` hanya memproses
  command yang diawali `!`; caption media `stiker`/`sticker` dipetakan ke `!stiker`.
- **Persistensi terpecah**: ada ~15 fungsi `load*` / `save*` di `index.js` yang
  membaca-menulis file JSON satu per satu, memakai `fs` langsung **tanpa tulis
  atomic** (risiko file korup bila crash).
- **`index.js` terlalu besar** (±1701 baris): scheduler, stiker (ffmpeg/sharp),
  downloader (yt-dlp), dan salam dicampur di satu file.
- **Task berat tanpa antrean**: stiker video & download dijalankan langsung tanpa
  antrean/cooldown khusus → berisiko overload pada VPS RAM kecil.
- **Rate limit global**: satu `cooldowns` map dengan jeda 2 detik per user.

---

## 3. Perubahan yang Sudah Dilakukan (terverifikasi)

> Yang tercantum di bawah ini adalah file yang **benar-benar dibuat/diubah**
> dan sudah dicek bisa di-`require` / dijalankan.

### 3.1 File Baru

| File | Isi / Fungsi |
|------|--------------|
| `src/storage/jsonStore.js` | `loadJSON(file, opts)` & `saveJSON(file, data)`. Tulis **atomic**: `writeFileSync` → `.tmp` → `rename`; backup otomatis ke `.bak`; fallback baca dari `.bak` jika file utama korup. |
| `src/storage/dataStore.js` | Konsolidasi state in-memory untuk semua domain (`learning`, `chatLog`, `reminders`, `jadwal`, `jadwalInsight`, `sholatMode`, `zikirAuto`, `notes`, `todo`, `ujian`, `akademik`, `jadwalInsightState`, `zikirAutoState`) + fungsi `loadAll()` / `saveAll()`. Memakai `jsonStore` untuk semua tulis. |
| `src/utils/jobQueue.js` | `createJobQueue({ concurrency })` (antrean FIFO, error ditangkap, tidak menggagalkan proses) dan `createRateLimiter(cooldownMs)` (per-key, `check`/`hit`/`cleanup`). |
| `src/utils/timeHelpers.js` | `addMinutesToTime(hhmm, offset)` dan `pickRandom(items)` (dipindah dari helper inline di `index.js`). |

### 3.2 Perbaikan Bug Selama Pembuatan
1. **Bug path `BASE_DIR`** di `dataStore.js`:
   - Semula: `__dirname.replace(/storage$/,'')` → salah, menunjuk ke `src/`.
   - Diperbaiki: `path.join(__dirname, '..', '..')` → root project.
2. **Bug `new Map(obj)`** di `dataStore.js`:
   - Semula memakai `new Map(...)` pada objek plain → `TypeError: object is not iterable`.
   - Diperbaiki: helper `toMap()` memakai `Object.entries(...)`.

### 3.3 Status Verifikasi
- `node --check` lolos untuk semua file baru/berubah.
- `dataStore.js` berhasil di-`require` dan memuat data nyata
  (contoh hasil: `reminders=1, jadwal=1, sholatMode=0, notes=2, ujian=0, akademik=2`).
- `npm test` → **35/35 lolos** (7 lama + 28 test baru untuk modul refactor).

### 3.4 Refactor Besar (selesai)
1. **`index.js` ditulis ulang** (±1701 → ±660 baris):
   - Semua `load*/save*` lama (pakai `fs` langsung) dihapus → semua state lewat `dataStore`
     (alias ke Map/array yang sama; `save*` sekarang wrapper `dataStore.persist('<domain>')`).
   - Dead code AI dihapus: blok `client.on('message_disabled')`, `openai`, `genAI`,
     `MODEL_NAME`, `VISION_MODEL`, `buildPrompt`, `detectMood`, `checkSalam`/`SALAM_DB`,
     `logChat`, `delay`, `MAX_HISTORY` sudah tidak ada.
   - Scheduler dipindah ke `src/schedulers/`; `buildITQuoteMessage`/`buildLatestITFactMessage`
     ke `src/messages/itContent.js`; jadwal kuliah ke `src/storage/jadwalKuliahStore.js`.
2. **`dataStore.js`**: tambah `persist(domain)` (simpan 1 domain saja, atomic via jsonStore);
   `saveAll()` di-refactor memakai map yang sama.
3. **`jobQueue.js`**: `enqueue()` sekarang return `Promise` (resolve hasil job / reject error),
   sehingga pemanggil bisa `await` job yang sedang antre.
4. **`mediaCommands.js`**: task berat (`!stiker`, `!storyin`, `!ig`, `!tiktok`, `!yt`,
   `!rmbg`, `!upscale`) sekarang lewat `mediaJobQueue` (concurrency 1) + `mediaRateLimiter`
   (cooldown 20 detik per user per command). Kalau kena cooldown, user diberi tahu
   "coba lagi dalam N detik". Ada fallback: bila `jobQueue`/`rateLimiter` tidak di-inject
   (mis. deploy parsial), command dijalankan langsung seperti perilaku lama.
5. **`jadwalKuliahStore.js`** (BARU): pemilik `jadwal_kuliah.json`, tulis atomic (jsonStore),
   self-load saat require, ekspor `JADWAL_KULIAH` live yang sama untuk command & scheduler.
6. **`.gitignore`**: tambah `*.tmp`, `*.bak`, `ig_tmp_*.mp4`, `tt_tmp_*.mp4`, `yt_tmp_*.mp4`.

---

## 4. Yang Masih Bermasalah / Belum Dikerjakan

### 4.1–4.4 ✅ SUDAH SELESAI
- `dataStore` sudah terintegrasi penuh ke `index.js` (4.1).
- `jobQueue` + `rateLimiter` sudah dipakai di `mediaCommands.js` (4.2).
- Scheduler sudah dipindah ke `src/schedulers/*` (4.3).
- Dead code AI (`message_disabled`, `openai`, `genAI`) sudah dihapus (4.4).

### 4.5 Catatan Berkas Data
- `.gitignore` sudah mencakup `.env`, semua file `*.json` data, plus `*.tmp`/`*.bak`
  dan file download sementara. Pastikan file `*.json` data tidak di-commit.

### 4.6 Catatan Tes
- Test untuk `jsonStore`, `jobQueue`, `timeHelpers`, `dataStore` (smoke read-only),
  `jadwalKuliahStore`, dan `itContent` sudah ada (`npm test` → 35/35).
- `dataStore` sengaja hanya di-smoke-test (read-only) karena menulis file data asli.

### 4.7 Masih Bisa Ditingkatkan (opsional)
- Duplikasi helper kecil di `reminderJadwalCommands.js` (`buildReminderTimeFromStart`,
  `sortJadwalKuliah`) vs `jadwalKuliahStore.js` — bisa diimpor dari store.
- `chatLog` domain di `dataStore` belum dipakai handler aktif (sisa dari handler lama).
- `learningDataStore.js` bisa disatukan ke `dataStore` (normalisasi learning).

---

## 5. Prioritas Tindak Lanjut (jika diminta)
1. ✅ Integrasikan `dataStore` ke `index.js` — selesai.
2. ✅ Terapkan `jobQueue` + `rateLimiter` di `mediaCommands.js` — selesai.
3. ✅ Pindahkan scheduler ke `src/schedulers/*` — selesai.
4. ✅ Hapus dead code AI (`message_disabled`, `openai`, `genAI`) — selesai.
5. ✅ Tambah test untuk modul baru; rapikan `.gitignore` — selesai.
6. (Opsional) Rapikan duplikasi helper jadwal kuliah di `reminderJadwalCommands.js`.

---

## 6. Cara Menjalankan
```bash
npm install      # pasang dependensi
npm start        # jalankan bot (node index.js)
npm test         # jalankan test (node --test tests/*.test.js)
```
