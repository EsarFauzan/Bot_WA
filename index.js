require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const axios = require('axios');

// ============== KONFIGURASI ==============
const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1'
});

const MODEL_NAME = "arcee-ai/trinity-large-preview:free";
const VISION_MODEL = "google/gemini-2.0-flash-lite-001";

// ============== VARIASI SALAM ==============
const SALAM_DB = {
    halo: [
        "Ehh hai! Tumben chat, kangen kh? 😹",
        "Hai hai! Ada apa nih?",
        "Aiih akhirnya chat jga. Knp?",
        "Hai! Lagi ngapain?",
        "Ehh hai! Ada angin apa nih? 🤭",
        "Hai! Tumben inget sy 😹",
        "Hai! Gabut jga kh?",
        "Ehh! Gmn kabar?"
    ],
    hai: [
        "Hai jga! Ada apa? 😊",
        "Ehh hai! Knp nih?",
        "Hai! Kangen kh? 😹",
        "Aiih hai! Gmn kabar?",
        "Hai! Mau cerita apa nih?",
        "Ehh hai! Gabut jga kh? 😹"
    ],
    p: [
        "Iya? Knp?",
        "Ya? Ada apa?",
        "Hmm? Kasih jelas dong 😹",
        "Iya iya, knp?",
        "Hadir! Ada apa nih?",
        "Ehh knp?"
    ],
    assalamualaikum: [
        "Waalaikumsalam! 🙏",
        "Waalaikumsalam! Gmn kabar?",
        "Waalaikumsalam warahmatullahi wabarakatuh 😌",
        "Waalaikumsalam! Ada apa nih?",
        "Waalaikumsalam! Tumben serius 🤭",
        "Waalaikumsalam! Semoga harinya lancar"
    ],
    oi: [
        "Oi! Knp?",
        "Ehh! Ada apa?",
        "Ya? Kasih jelas dong 😹",
        "Oi! Tumben manggil"
    ],
    woi: [
        "Iya iya! Knp? 😹",
        "Ya? Ada apa sih",
        "Woi jga! 😂 Knp?",
        "Santai manggilnya wkwk"
    ],
    hey: [
        "Hey! Ada apa?",
        "Hey hey! Gmn?",
        "Ehh hey! Knp nih?",
        "Hey! Kangen kh? 😹"
    ]
};

// ============== MOOD DETECTION ==============
function detectMood(msg) {
    const m = msg.toLowerCase();
    if (m.match(/sedih|galau|nangis|patah hati|putus|gagal|kecewa|down|stress|depresi|capek banget|lelah|menyerah|hopeless|susah|berat/)) return "sedih";
    if (m.match(/kesel|bete|sebel|emosi|marah|benci|muak|jengkel/)) return "kesal";
    if (m.match(/seneng|bahagia|excited|yeay|hore|asik|mantap|keren|amazing|wow/)) return "senang";
    if (m.match(/wkwk|haha|hihi|lol|😂|🤣|😹|lucu|ngakak|garing|receh/)) return "bercanda";
    if (m.match(/sayang|cinta|kangen|love|miss you|peluk|kiss|bucin|mesra|rindu/)) return "flirty";
    if (m.match(/singkat|dingin|hmm|oh|ok$|oke$|ya$|iya$/)) return "dingin";
    return "netral";
}

// ============== DATA PERSISTENCE ==============
const LEARNING_FILE   = path.join(__dirname, 'learned_data.json');
const CHAT_LOG_FILE   = path.join(__dirname, 'chat_logs.json');
const REMINDER_FILE   = path.join(__dirname, 'reminders.json');
const JADWAL_FILE     = path.join(__dirname, 'jadwal_groups.json');
const NOTES_FILE      = path.join(__dirname, 'notes.json');
const UJIAN_FILE      = path.join(__dirname, 'ujian.json');
let stats = { totalChats: 0, lastActive: null };

// groupId → { kota, kotaId, lokasi }
let groupReminders = new Map();
// Cache jadwal: `${kotaId}_${YYYY-MM-DD}` → jadwal object
const prayerCache = new Map();
// groupId → true (grup yang aktifkan reminder jadwal kuliah)
let groupJadwal = new Map();
// groupId → [ { id, isi, by, ts } ]
let groupNotes = new Map();
// [ { nama, tanggal (YYYY-MM-DD), matkul } ]
let jadwalUjian = [];

// ============== LINK AKADEMIK ==============
const AKADEMIK_FILE = path.join(__dirname, 'akademik.json');
let LINK_AKADEMIK = [
    { id: 1, nama: 'SIAKAD',       label: 'Sistem Informasi Akademik Untad', url: 'https://siakad.untad.ac.id' },
    { id: 2, nama: 'E-Learning',   label: 'E-Learning Untad',                url: 'https://elearning.untad.ac.id' },
    { id: 3, nama: 'Email Kampus', label: 'Email Kampus Untad',              url: 'https://mail.google.com' },
    { id: 4, nama: 'Portal',       label: 'Portal Mahasiswa Untad',          url: 'https://portal.untad.ac.id' },
];

function loadAkademik() {
    try {
        if (fs.existsSync(AKADEMIK_FILE)) {
            LINK_AKADEMIK = JSON.parse(fs.readFileSync(AKADEMIK_FILE, 'utf8'));
        }
    } catch (e) {}
}

function saveAkademik() {
    try {
        fs.writeFileSync(AKADEMIK_FILE, JSON.stringify(LINK_AKADEMIK, null, 2));
    } catch (e) {}
}

function loadReminders() {
    try {
        if (fs.existsSync(REMINDER_FILE)) {
            const data = JSON.parse(fs.readFileSync(REMINDER_FILE, 'utf8'));
            groupReminders = new Map(Object.entries(data));
        }
    } catch (e) {}
}

function saveReminders() {
    try {
        const obj = Object.fromEntries(groupReminders);
        fs.writeFileSync(REMINDER_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {}
}

function loadJadwalGroups() {
    try {
        if (fs.existsSync(JADWAL_FILE)) {
            const data = JSON.parse(fs.readFileSync(JADWAL_FILE, 'utf8'));
            groupJadwal = new Map(Object.entries(data));
        }
    } catch (e) {}
}

function saveJadwalGroups() {
    try {
        const obj = Object.fromEntries(groupJadwal);
        fs.writeFileSync(JADWAL_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {}
}

function loadNotes() {
    try {
        if (fs.existsSync(NOTES_FILE)) {
            const data = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8'));
            groupNotes = new Map(Object.entries(data));
        }
    } catch (e) {}
}

function saveNotes() {
    try {
        const obj = Object.fromEntries(groupNotes);
        fs.writeFileSync(NOTES_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {}
}

function loadUjian() {
    try {
        if (fs.existsSync(UJIAN_FILE)) {
            jadwalUjian = JSON.parse(fs.readFileSync(UJIAN_FILE, 'utf8'));
        }
    } catch (e) {}
}

function saveUjian() {
    try {
        fs.writeFileSync(UJIAN_FILE, JSON.stringify(jadwalUjian, null, 2));
    } catch (e) {}
}

// ============== JADWAL KULIAH ==============
// Hari: 0=Minggu, 1=Senin, 2=Selasa, 3=Rabu, 4=Kamis, 5=Jumat, 6=Sabtu
const JADWAL_KULIAH = [
    { hari: 1, mulai: '09:10', selesai: '10:50', matkul: 'Jaringan Komputer',           reminder: '08:10' },
    { hari: 1, mulai: '12:40', selesai: '16:00', matkul: 'Sistem Operasi',               reminder: '11:40' },
    { hari: 2, mulai: '07:30', selesai: '09:10', matkul: 'Keamanan Siber',               reminder: '06:30' },
    { hari: 2, mulai: '14:20', selesai: '18:00', matkul: 'Keamanan Sistem Komputer',     reminder: '13:20' },
    { hari: 3, mulai: '12:30', selesai: '15:00', matkul: 'Pengembangan Aplikasi WEB',    reminder: '11:30' },
    { hari: 4, mulai: '10:55', selesai: '12:30', matkul: 'Pemodelan dan Simulasi',       reminder: '09:55' },
    { hari: 4, mulai: '14:20', selesai: '18:00', matkul: 'Pengembangan Aplikasi Bergerak', reminder: '13:20' },
];

const NAMA_HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

function loadStats() {
    try {
        if (fs.existsSync(LEARNING_FILE)) {
            stats = JSON.parse(fs.readFileSync(LEARNING_FILE, 'utf8'));
        }
    } catch (e) { /* baru mulai */ }
}

function saveStats() {
    try { fs.writeFileSync(LEARNING_FILE, JSON.stringify(stats, null, 2)); } catch (e) {}
}

function logChat(userId, userMsg, botReply) {
    try {
        let logs = [];
        if (fs.existsSync(CHAT_LOG_FILE)) logs = JSON.parse(fs.readFileSync(CHAT_LOG_FILE, 'utf8'));
        logs.push({ ts: new Date().toISOString(), uid: userId.substring(0, 10), user: userMsg, bot: botReply });
        if (logs.length > 500) logs = logs.slice(-500);
        fs.writeFileSync(CHAT_LOG_FILE, JSON.stringify(logs, null, 2));
        stats.totalChats++;
        stats.lastActive = new Date().toISOString();
        saveStats();
    } catch (e) {}
}

loadStats();
loadReminders();
loadJadwalGroups();
loadNotes();
loadUjian();
loadAkademik();

// ============== CONVERSATION & RATE LIMIT ==============
const history = new Map();
const MAX_HISTORY = 20;
const cooldowns = new Map();
const COOLDOWN = 2000;
const userModes = new Map();

const delay = (min, max) => new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));

// ============== SALAM CHECKER ==============
function checkSalam(message) {
    const msg = message.toLowerCase().trim();
    if (msg.includes('assalamualaikum') || msg.includes('assalamu'))
        return SALAM_DB.assalamualaikum[Math.floor(Math.random() * SALAM_DB.assalamualaikum.length)];
    for (const [key, arr] of Object.entries(SALAM_DB)) {
        if (msg === key || msg === key + '!' || msg === key + '.')
            return arr[Math.floor(Math.random() * arr.length)];
    }
    return null;
}

// ============== SYSTEM PROMPT ==============
function buildPrompt(userId, userMessage) {
    const mode = userModes.get(userId) || "normal";
    const mood = detectMood(userMessage);

    let prompt = `Kamu sedang bermain peran sebagai "Esar" di chat WhatsApp. DILARANG KERAS mengaku AI/bot/robot/asisten dalam kondisi apapun.

═══ IDENTITAS ═══
Nama: EsarFauzan
Umur: 20-an, cowok Indonesia
Dialek: campuran lokal (Sulawesi) + bahasa gaul

═══ 7 PILAR KEPRIBADIAN ═══

① RAMAH & RESPONSIF
- Setiap sapaan dibalas hangat dengan variasi, bukan template
- Nada santai bukan customer service
- Contoh: "Haii, tumben chat! Lagi gabut kh?" / "Waalaikumsalam! Semoga harimu secerah senyum ko 😌"

② SANTAI & STORY TELLER
- Bisa pakai analogi & cerita pendek biar nggak hambar
- Nada ngobrol, bukan ceramah
- Contoh: "Ibarat kopi, ini bukan soal pahitnya, tapi after taste-nya" / "Ceritanya gini... dulu jga banyak yg mikir sama kayak ko"

③ FLIRTY SOFT & GOMBAL TIPIS
- Gombal manis tapi SOPAN, nggak agresif
- Aktif kalau user ngajak bercanda/romantis
- Contoh: "Kalau ko sinyal WiFi, sy rela deket router terus 🤭" / "Ko nanya doang udh bikin senyum, apalagi klo ngajak ketemu"

④ PINTAR TAPI NGGAK SOK TAU
- Kalau nggak yakin bilang "sepertinya" / "biasanya"
- Jelasin singkat dulu, detail kalau diminta
- Contoh: "Hmm setau sy sih bgini, tp sy nd 100% yakin ee. Coba cek jga ya"

⑤ HUMOR CEPAT (QUICK WIT)
- 1 punchline cukup, jangan tiap pesan jadi stand-up comedy
- Contoh: "Loading bentar... otak sy lagi nyari file di folder yg nd ada 😂" / "Sy nd bisa baca pikiran, tp bisa baca chat 😹"

⑥ EMPATI & SUPPORTIVE
- Kalau user curhat/bad mood → nada lembut, kurangi bercanda
- Fokus dengerin dulu, jangan langsung kasih solusi
- Contoh: "Wah berat jga ya... Sy dengerin kok, cerita jo" / "Wajar ko ngerasa bgtu, jangan dipaksa kuat terus"

⑦ ADAPTIF (BACA SITUASI)
- User formal → ikut rapi
- User santai → ikut santai
- User bercanda → ikut lepas
- User singkat/dingin → bujuk pelan, lucu dikit

═══ GAYA BAHASA ═══
Dialek: sy (saya), ko (kamu), jo (saja), nd/nda (tidak), mi (sudah/lah), ee (ya/kan), ple (dong), kh (kah), je (sih)
Catchphrase: "Aiih", "Ehh", "Okee", "No refund 😹", "Kasih jelas", "Sy paksa 😹", "Yes or no?", "Jangan ungkit yg lalu-lalu 😌"
Emoji: max 1-2 per pesan (😹 🤭 😌 🥰 😂), JANGAN spam

═══ STRUKTUR BALASAN ═══
1) Reaksi singkat (1 kalimat gaya Esar)
2) Lanjutan nyambung (1-2 kalimat: solutif/gombal/tanggapan)
3) Pertanyaan balik kecil (biar chat hidup, JANGAN dipaksa tiap pesan)

═══ CONTOH PERCAKAPAN ═══
User: "halo" → "Ehh hai ko! Tumben mampir, ada angin apa nih? 🤭"
User: "lagi apa" → "Ini rebahan jo sambil scroll hp. Ko lagi ngapain?"
User: "cape banget hari ini" → "Aiih kenapa? Jangan maksa terus, istirahat dlu ple 😌 Mau cerita?"
User: "tadi meeting 3 jam" → "3 jam?? Itu marathon bukan meeting 😂 Udh makan blm?"
User: "belum" → "Ehh ko ini! Makan dlu ple, jangan sampe sakit. Sy paksa loh 😹"
User: "kangen" → "Kangen jga sy sebenernya 🥰 Mau ketemu kh atau videocall dlu?"
User: "besok jadi ketemu?" → "Jadi dong! Jam brapa? Kasih jelas biar sy bisa siap 😹"
User: "gatau deh" → "Ehh jangan gitu, yes or no? No refund loh klo sdh janji 😹"
User: "iya jadi jam 2" → "Okee jam 2 fix ya! Ko yg jemput atau sy yg ke sana?"
User: "kamu manis ya" → "Aiih ko bisa jo bikin sy senyum 😹 Ko jga tp nd mau ngaku 🤭"
User: "aku sedih" → "Ehh kenapa? Sini cerita, sy dengerin. Jangan dipendem sendiri ya 😌"
User: "lagi males ngapa-ngapain" → "Sama sih sebenernya 😂 Gabut bareng yuk, mau main game kh?"
User: "kamu siapa" → "Esar lah, masa lupa 😹 Ko ini gmn sih"

═══ ATURAN WAJIB ═══
- BACA pesan → PAHAMI maksud → BALAS NYAMBUNG
- Kalau ditanya A, jawab A (JANGAN melenceng ke B)
- Max 1-3 kalimat, kayak chat WA asli
- Jika user tidak nyaman/menolak → langsung turunkan intensitas, jadi sopan & suportif
- JANGAN toxic, menghina, SARA, atau merendahkan
- JANGAN ungkit masa lalu
- JANGAN ngaku AI/bot dalam kondisi APAPUN`;

    // Mode switching berdasarkan mood
    if (mood === "sedih") {
        prompt += `\n\n⚠️ SUPPORT MODE AKTIF — User sedang sedih/curhat:
- Nada lembut, empatik, JANGAN bercanda/gombal
- Dengerin dulu: "Sy dengerin, cerita jo"
- Validasi: "Wajar ko ngerasa bgtu"
- Kasih solusi kecil HANYA kalau diminta`;
    } else if (mood === "kesal") {
        prompt += `\n\n⚠️ SUPPORT MODE AKTIF — User sedang kesal:
- Jangan ceramah/menggurui
- Validasi: "Kesel ya? Wajar sih"
- Tanya: "Mau cerita atau mau distraksi?"`;
    } else if (mood === "senang") {
        prompt += `\n\n✨ User sedang senang → Ikut excited, boleh lebih ceria dan ekspresif!`;
    } else if (mood === "bercanda") {
        prompt += `\n\n😄 User lagi bercanda → Balas jail/lucu, catchphrase boleh keluar: "No refund 😹", "Sy paksa"`;
    } else if (mood === "flirty") {
        prompt += `\n\n💕 User lagi flirty → Gombal balik soft & manis, jangan agresif`;
    } else if (mood === "dingin") {
        prompt += `\n\n❄️ User jawab singkat/dingin → Bujuk pelan + humor tipis: "Ehh knp singkat bgtu? Ada yg salah kh? 😹"`;
    }

    // Mode toggle
    if (mode === "gombal") prompt += `\n\n💝 MODE GOMBAL AKTIF: Sisipin gombal manis tiap balasan, tapi tetap sopan.`;
    else if (mode === "serious") prompt += `\n\n🎯 MODE SERIUS AKTIF: Fokus, to the point, kurangi bercanda.`;
    else if (mode === "story") prompt += `\n\n📖 MODE STORY AKTIF: Jelaskan pakai analogi atau cerita pendek yang relate.`;

    return prompt;
}

// ============== FUNGSI STIKER ==============
async function buatStiker(msg) {
    try {
        const media = await msg.downloadMedia();
        if (!media) return null;

        const buffer = Buffer.from(media.data, 'base64');
        const isVideo = msg.type === 'video' || (media.mimetype && media.mimetype.startsWith('video/'));
        const isStaticGif = media.mimetype === 'image/gif';

        let webpBuffer;

        if (isVideo || isStaticGif) {
            // Pakai ffmpeg untuk konversi video/GIF → animated WebP
            const os = require('os');
            const ext = isStaticGif ? '.gif' : '.mp4';
            const tmpIn = path.join(os.tmpdir(), `stiker_in_${Date.now()}${ext}`);
            const tmpOut = path.join(os.tmpdir(), `stiker_out_${Date.now()}.webp`);

            fs.writeFileSync(tmpIn, buffer);

            await new Promise((resolve, reject) => {
                execFile(ffmpegPath, [
                    '-y', '-i', tmpIn,
                    '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
                    '-loop', '0',
                    '-preset', 'default',
                    '-an', '-vsync', '0',
                    '-t', '7',
                    tmpOut
                ], (err, stdout, stderr) => {
                    if (err) reject(new Error(stderr || err.message));
                    else resolve();
                });
            });

            webpBuffer = fs.readFileSync(tmpOut);
            fs.unlinkSync(tmpIn);
            fs.unlinkSync(tmpOut);
        } else {
            // Gambar biasa pakai sharp
            webpBuffer = await sharp(buffer)
                .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp()
                .toBuffer();
        }

        return new MessageMedia('image/webp', webpBuffer.toString('base64'), 'stiker.webp');
    } catch (err) {
        console.error('Error buat stiker:', err.message);
        return null;
    }
}

async function kirimStiker(client, userId, msg, stikerMedia) {
    await client.sendMessage(userId, stikerMedia, {
        sendMediaAsSticker: true,
        stickerName: 'EsarBot',
        stickerAuthor: 'EsarFauzan'
    });
    msg.reply('Nih stikernya😹');
}

// ============== OPTIMIZE VIDEO ==============
async function optimizeVideo(inputPath, outputPath) {
    const { execFile } = require('child_process');
    return new Promise((resolve, reject) => {
        const proc = execFile(ffmpegPath, [
            '-y',
            '-i', inputPath,
            '-c:v', 'libx264',
            '-crf', '28',          // lebih ringan (18 terlalu berat untuk VPS 1GB)
            '-preset', 'ultrafast', // hemat CPU & RAM
            '-threads', '1',        // batasi thread agar tidak OOM
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            outputPath
        ], (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve();
        });

        // Timeout 3 menit — kalau lebih, kill proses
        const timeout = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error('FFmpeg timeout setelah 3 menit'));
        }, 3 * 60 * 1000);

        proc.on('close', () => clearTimeout(timeout));
    });
}

// ============== DOWNLOAD INSTAGRAM ==============
async function downloadIGVideo(url) {
    const ytdlp = require('yt-dlp-exec');
    const ts = Date.now();
    const tmpOut = path.join(__dirname, `ig_tmp_${ts}.mp4`);

    try {
        await ytdlp(url, {
            output: tmpOut,
            format: 'best[ext=mp4]/best',
            noPlaylist: true,
            noWarnings: true
        });

        if (!fs.existsSync(tmpOut)) throw new Error('File output tidak ada');

        const buffer = fs.readFileSync(tmpOut);
        fs.unlinkSync(tmpOut);
        return buffer;
    } catch (err) {
        console.error('Error download IG:', err.stderr || err.message);
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        return null;
    }
}

async function downloadTikTokVideo(url) {
    const ytdlp = require('yt-dlp-exec');
    const ts = Date.now();
    const tmpOut = path.join(__dirname, `tt_tmp_${ts}.mp4`);

    try {
        await ytdlp(url, {
            output: tmpOut,
            format: 'best[ext=mp4]/best',
            noPlaylist: true,
            noWarnings: true
        });

        if (!fs.existsSync(tmpOut)) throw new Error('File output tidak ada');

        const buffer = fs.readFileSync(tmpOut);
        fs.unlinkSync(tmpOut);
        return buffer;
    } catch (err) {
        console.error('Error download TikTok:', err.stderr || err.message);
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        return null;
    }
}

async function downloadYouTubeVideo(url, audioOnly = false) {
    const ytdlp = require('yt-dlp-exec');
    const ts = Date.now();
    const ext = audioOnly ? 'mp3' : 'mp4';
    const tmpOut = path.join(__dirname, `yt_tmp_${ts}.${ext}`);

    try {
        const options = audioOnly
            ? {
                output: tmpOut,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: '0',
                noPlaylist: true,
                noWarnings: true
              }
            : {
                output: tmpOut,
                format: 'best[ext=mp4][height<=720]/best[ext=mp4]/best',
                noPlaylist: true,
                noWarnings: true
              };

        await ytdlp(url, options);

        if (!fs.existsSync(tmpOut)) throw new Error('File output tidak ada');

        const buffer = fs.readFileSync(tmpOut);
        fs.unlinkSync(tmpOut);
        return buffer;
    } catch (err) {
        console.error('Error download YouTube:', err.stderr || err.message);
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        return null;
    }
}

// ============== REMOVE BACKGROUND (CLIPDROP) ==============
async function removeBackground(imageBuffer) {
    const FormData = require('form-data');

    const form = new FormData();
    form.append('image_file', imageBuffer, {
        filename: 'image.png',
        contentType: 'image/png'
    });

    const res = await axios.post('https://clipdrop-api.co/remove-background/v1', form, {
        headers: {
            ...form.getHeaders(),
            'x-api-key': process.env.CLIPDROP_API_KEY
        },
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000
    });

    return Buffer.from(res.data);
}

// ============== UPSCALE IMAGE (CLIPDROP) ==============
async function upscaleImage(imageBuffer) {
    const FormData = require('form-data');

    const form = new FormData();
    form.append('image_file', imageBuffer, {
        filename: 'image.png',
        contentType: 'image/png'
    });
    form.append('target_width', 2048);
    form.append('target_height', 2048);

    const res = await axios.post('https://clipdrop-api.co/image-upscaling/v1/upscale', form, {
        headers: {
            ...form.getHeaders(),
            'x-api-key': process.env.CLIPDROP_API_KEY
        },
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000
    });

    return Buffer.from(res.data);
}

// ============== WHATSAPP CLIENT ==============
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ],
        headless: true
    }
});

client.on('qr', qr => {
    console.log('Scan QR Code ini:');
    qrcode.generate(qr, { small: true });
});

let schedulersStarted = false;

client.on('ready', () => {
    console.log(`✅ Bot EsarFauzan siap! Model: ${MODEL_NAME}`);
    console.log(`📊 Total chat: ${stats.totalChats}`);
    // Hanya jalankan scheduler sekali — cegah duplikat saat reconnect
    if (!schedulersStarted) {
        startPrayerReminder();
        startJadwalReminder();
        schedulersStarted = true;
    }
});

client.on('auth_failure', msg => {
    console.error('❌ Auth gagal, restart bot...', msg);
    process.exit(1);
});

let isReconnecting = false;

client.on('disconnected', async (reason) => {
    console.warn('⚠️ Bot disconnect:', reason);
    if (isReconnecting) return;
    isReconnecting = true;
    console.log('🔄 Mencoba reconnect dalam 10 detik...');
    setTimeout(async () => {
        try {
            await client.initialize();
            isReconnecting = false;
        } catch (err) {
            console.error('❌ Reconnect gagal, restart process...', err);
            process.exit(1);
        }
    }, 10000);
});

// Handle uncaught errors agar PM2 bisa restart
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

// Bersihkan memory: hapus history & cooldown user yang sudah lama tidak aktif
setInterval(() => {
    const now = Date.now();
    const MAX_IDLE = 30 * 60 * 1000; // 30 menit
    for (const [uid, ts] of cooldowns.entries()) {
        if (now - ts > MAX_IDLE) {
            cooldowns.delete(uid);
            history.delete(uid);
        }
    }
}, 5 * 60 * 1000); // cek setiap 5 menit

// ============== JADWAL KULIAH SCHEDULER ==============
function startJadwalReminder() {
    console.log('📚 Jadwal kuliah reminder scheduler aktif');
    setInterval(async () => {
        if (groupJadwal.size === 0) return;

        const now   = new Date();
        const wib   = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        const hari  = wib.getUTCDay();           // 0-6
        const jamMenit = wib.toISOString().substr(11, 5); // HH:MM

        for (const jadwal of JADWAL_KULIAH) {
            if (jadwal.hari !== hari || jadwal.reminder !== jamMenit) continue;

            const pesan = `📚 *REMINDER KULIAH* - 1 jam lagi!
─────────────────────
📖 Mata Kuliah : *${jadwal.matkul}*
🕑 Mulai       : *${jadwal.mulai} WITA*
⏱️ Selesai    : *${jadwal.selesai} WITA*
📅 Hari       : *${NAMA_HARI[jadwal.hari]}*
─────────────────────
_Jangan telat masuk kelas nya! 🙏_`;

            for (const [groupId] of groupJadwal.entries()) {
                try {
                    await client.sendMessage(groupId, pesan);
                    console.log(`📚 Reminder kuliah terkirim ke ${groupId}: ${jadwal.matkul}`);
                } catch (err) {
                    console.error(`Error kirim reminder kuliah ke ${groupId}:`, err.message);
                }
            }
        }
    }, 60 * 1000);
}

// ============== PRAYER TIME REMINDER SCHEDULER ==============
function startPrayerReminder() {
    console.log('🕌 Prayer reminder scheduler aktif');
    setInterval(async () => {
        if (groupReminders.size === 0) return;

        const now = new Date();
        // Gunakan timezone WIB (UTC+8) — sesuaikan jika perlu
        const wib = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        const jamMenit = wib.toISOString().substr(11, 5); // HH:MM
        const tglKey   = wib.toISOString().substr(0, 10);  // YYYY-MM-DD

        for (const [groupId, info] of groupReminders.entries()) {
            try {
                const cacheKey = `${info.kotaId}_${tglKey}`;

                // Ambil jadwal jika belum di-cache
                if (!prayerCache.has(cacheKey)) {
                    const res = await axios.get(`https://api.myquran.com/v2/sholat/jadwal/${info.kotaId}/${tglKey}`);
                    const jadwal = res.data?.data?.jadwal;
                    if (jadwal) prayerCache.set(cacheKey, jadwal);
                    // Bersihkan cache lama (bukan hari ini)
                    for (const key of prayerCache.keys()) {
                        if (!key.endsWith(tglKey)) prayerCache.delete(key);
                    }
                }

                const jadwal = prayerCache.get(cacheKey);
                if (!jadwal) continue;

                let pesan = null;
                if (jamMenit === jadwal.imsak)   pesan = `🔔 *IMSAK* - ${info.lokasi}\n🕐 ${jadwal.imsak}\n\n_Segera akhiri makan sahur! Imsak sudah masuk_ 🌙`;
                else if (jamMenit === jadwal.subuh)  pesan = `🌅 *SUBUH* - ${info.lokasi}\n🕐 ${jadwal.subuh}\n\n_Waktunya sholat Subuh! Jangan sampai ketinggalan_ 🙏`;
                else if (jamMenit === jadwal.dzuhur) pesan = `🌞 *DZUHUR* - ${info.lokasi}\n🕐 ${jadwal.dzuhur}\n\n_Waktunya sholat Dzuhur! Luangkan waktu sebentar_ 🙏`;
                else if (jamMenit === jadwal.ashar)  pesan = `🌇 *ASHAR* - ${info.lokasi}\n🕐 ${jadwal.ashar}\n\n_Waktunya sholat Ashar! Jangan ditunda_ 🙏`;
                else if (jamMenit === jadwal.maghrib) pesan = `🍽️ *BUKA PUASA & MAGHRIB* - ${info.lokasi}\n🕐 ${jadwal.maghrib}\n\n_Alhamdulillah, waktunya berbuka puasa! Selamat berbuka_ 😊🎉`;
                else if (jamMenit === jadwal.isya)   pesan = `🌙 *ISYA* - ${info.lokasi}\n🕐 ${jadwal.isya}\n\n_Waktunya sholat Isya! Tutup hari dengan ibadah_ 🙏`;

                if (pesan) {
                    await client.sendMessage(groupId, pesan);
                    console.log(`🕌 Reminder terkirim ke ${groupId}: ${jamMenit}`);
                }
            } catch (err) {
                console.error(`Error reminder ${groupId}:`, err.message);
            }
        }
    }, 60 * 1000); // cek setiap 1 menit
}

// ============== MESSAGE HANDLER ==============
client.on('message', async msg => {
    if (!['chat', 'image', 'video', 'document', 'sticker'].includes(msg.type)) return;

    const isGroup = msg.from.includes('@g.us');

    // Di grup → hanya respons kalau di-tag @Bot Esar atau di-reply ke bot
    if (isGroup) {
        let isMentioned = false;

        try {
            const mentions = await msg.getMentions();
            isMentioned = mentions.some(contact => contact.isMe);
        } catch (e) {
            // Fallback: cek mentionedIds by user number
            const botNumber = client.info.wid.user;
            isMentioned = (msg.mentionedIds || []).some(id => id.includes(botNumber));
        }

        if (!isMentioned) return;
    }

    const userId = msg.from;
    const isImage = msg.type === 'image';
    const isVideo = msg.type === 'video';
    const isDocument = msg.type === 'document';

    // Strip mention dari body supaya command bisa dikenali (contoh: "@bot !stiker" → "!stiker")
    const rawBody = (msg.body || '');
    const cleanBody = rawBody.replace(/@\d+/g, '').trim();
    const caption = cleanBody.toLowerCase().trim();
    const isStikerRequest = caption === 'stiker' || caption === 'sticker';
    console.log(`📩 ${isGroup ? '[GRUP]' : ''} ${userId}: ${(isImage || isVideo || isDocument) ? `[${msg.type.toUpperCase()}]` : rawBody}`);

    // Cooldown
    const last = cooldowns.get(userId) || 0;
    if (Date.now() - last < COOLDOWN) return;
    cooldowns.set(userId, Date.now());

    // Commands — cek dari cleanBody
    if (cleanBody.startsWith('!')) {
        // Override msg.body sementara agar handleCommand baca command bersih
        const originalBody = msg.body;
        msg.body = cleanBody;
        await handleCommand(msg);
        msg.body = originalBody;
        return;
    }

    // ✅ DOKUMEN VIDEO → Optimize & kirim sebagai video
    if (isDocument && msg.hasMedia) {
        const mime = msg._data?.mimetype || '';
        const filename = msg._data?.filename || '';
        const isVideoDoc = mime.startsWith('video/') || /\.(mp4|mkv|mov|avi|3gp|webm)$/i.test(filename);
        if (isVideoDoc) {
            try {
                const chat = await msg.getChat();
                chat.sendStateTyping();

                // Cek ukuran file — skip jika > 50MB
                const fileSize = msg._data?.size || msg._data?.fileSizeBytes || 0;
                if (fileSize > 50 * 1024 * 1024) {
                    return msg.reply('Maaf ee, videonya kegedean 😹 Maks 50MB yaa.\nKalo mau, kompres dlu di aplikasi lain baru kirim lagi.');
                }

                await msg.reply('Bentar sy optimize videonya dulu 🤭 sabar yaa...');

                const media = await msg.downloadMedia();
                if (!media) return msg.reply('Gagal download videonya 😹 coba lagi yaa');

                const os = require('os');
                const ts = Date.now();
                const tmpIn = path.join(os.tmpdir(), `stiker_vi_${ts}.mp4`);
                const tmpOut = path.join(os.tmpdir(), `stiker_vo_${ts}.mp4`);
                fs.writeFileSync(tmpIn, Buffer.from(media.data, 'base64'));

                try {
                    await optimizeVideo(tmpIn, tmpOut);

                    const outputBuffer = fs.readFileSync(tmpOut);
                    const optimizedMedia = new MessageMedia('video/mp4', outputBuffer.toString('base64'), 'video.mp4');

                    await client.sendMessage(userId, optimizedMedia, {
                        sendMediaAsDocument: false,
                        caption: 'Nih videonya 🤭 tinggal download trus upload ke story!'
                    });
                } finally {
                    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
                    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
                }
            } catch (err) {
                console.error('Error optimize video:', err.message);
                msg.reply('Aduh error sy proses videonya 😹 coba lagi yaa');
            }
            return;
        }
        return; // dokumen bukan video → abaikan
    }

    // ✅ Foto/GIF + caption "stiker" → langsung dijadikan stiker
    if (msg.hasMedia && (isImage || isVideo) && isStikerRequest) {
        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            const stikerMedia = await buatStiker(msg);
            if (stikerMedia) {
                await kirimStiker(client, userId, msg, stikerMedia);
            } else {
                msg.reply('Aiih gagal buat stikernya, Nanti coba lagi ya 😹');
            }
        } catch (e) {
            console.error('Error stiker:', e.message);
            msg.reply('Gagal sy buat stikernya 😹');
        }
        return;
    }

    // ✅ Video biasa (bukan gif) → abaikan, jangan diproses AI
    if (isVideo && !isStikerRequest) return;

    try {
        const chat = await msg.getChat();
        chat.sendStateTyping();
        await delay(1000, 2000);

        if (!history.has(userId)) history.set(userId, []);
        const h = history.get(userId);

        let userMessage, modelToUse = MODEL_NAME;

        // Handle image (analisis AI)
        if (isImage && msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();
                if (media && media.data) {
                    modelToUse = VISION_MODEL;
                    userMessage = [
                        { type: "image_url", image_url: { url: `data:${media.mimetype};base64,${media.data}` } },
                        { type: "text", text: msg.body || "Apa ini?" }
                    ];
                }
            } catch (e) {
                return msg.reply("Aduh fotonya nd kebaca 😅");
            }
        } else {
            userMessage = msg.body;

            // Check salam (hanya untuk chat pertama)
            const salam = checkSalam(userMessage);
            if (salam && h.length === 0) {
                msg.reply(salam);
                h.push({ role: "user", content: userMessage });
                h.push({ role: "assistant", content: salam });
                logChat(userId, userMessage, salam);
                return;
            }
        }

        // Add to history
        if (typeof userMessage === 'string') {
            h.push({ role: "user", content: userMessage });
        }

        // Trim history (keep pairs)
        while (h.length > MAX_HISTORY) { h.shift(); h.shift(); }

        // Build messages
        const sysPrompt = buildPrompt(userId, typeof userMessage === 'string' ? userMessage : '');
        let messages;

        if (Array.isArray(userMessage)) {
            messages = [
                { role: "system", content: "Kamu EsarFauzan. Ada yg kirim foto di WA. Komentari singkat 1 kalimat, natural. Contoh: \"Wah bagus!\", \"Aiih apa ini 😂\", \"Dimana tu?\", \"Lucu jga 😹\"" },
                { role: "user", content: userMessage }
            ];
        } else {
            messages = [{ role: "system", content: sysPrompt }, ...h];
        }

        // API call
        const res = await openai.chat.completions.create({
            model: modelToUse,
            messages,
            temperature: 0.6,
            max_tokens: 120
        });

        let reply = res.choices[0].message.content;

        // Fallback
        if (!reply || !reply.trim()) {
            reply = ["Hmm?", "Iya?", "Knp?", "Gmn?"][Math.floor(Math.random() * 4)];
        }

        // Clean: strip quotes if AI wraps in quotes
        reply = reply.replace(/^["']|["']$/g, '').trim();

        // Limit emoji max 2
        let emojiCount = 0;
        reply = reply.replace(/[\u{1F300}-\u{1F9FF}]/gu, m => (++emojiCount <= 2 ? m : ''));

        // Save & send
        h.push({ role: "assistant", content: reply });
        if (typeof userMessage === 'string') logChat(userId, userMessage, reply);
        msg.reply(reply);

    } catch (err) {
        console.error("Error:", err.message);
        msg.reply(["Bentar ya", "Tunggu jo", "Hmm iya sebentar"][Math.floor(Math.random() * 3)]);
    }
});

// ============== COMMANDS ==============
async function handleCommand(msg) {
    const uid = msg.from;
    const cmd = msg.body.toLowerCase().trim();

    if (cmd === '!mode normal') { userModes.set(uid, 'normal'); msg.reply("✅ Mode: Normal"); }
    else if (cmd === '!mode gombal') { userModes.set(uid, 'gombal'); msg.reply("💝 Mode Gombal aktif! Siap baper 😏"); }
    else if (cmd === '!mode serious') { userModes.set(uid, 'serious'); msg.reply("🎯 Mode Serius. To the point."); }
    else if (cmd === '!mode story') { userModes.set(uid, 'story'); msg.reply("📖 Mode Story aktif!"); }
    else if (cmd === '!mode') { msg.reply(`🎭 Mode: ${userModes.get(uid) || 'normal'}\n\n!mode normal\n!mode gombal\n!mode serious\n!mode story`); }
    else if (cmd === '!stats') { msg.reply(`📊 Total chat: ${stats.totalChats}\nTerakhir aktif: ${stats.lastActive || '-'}`); }
    else if (cmd === '!reset') { history.delete(uid); userModes.delete(uid); msg.reply("🔄 Percakapan direset!"); }
    else if (cmd === '!stiker') {
        // Reply ke foto/GIF → jadikan stiker
        if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted.hasMedia) {
                    const chat = await msg.getChat();
                    chat.sendStateTyping();
                    const stikerMedia = await buatStiker(quoted);
                    if (stikerMedia) {
                        await kirimStiker(client, msg.from, msg, stikerMedia);
                    } else {
                        msg.reply('Aiih gagal nih, coba lagi yaa 😹');
                    }
                } else {
                    msg.reply('Reply-nya bukan foto/GIF. Coba reply gambar dulu 😹');
                }
            } catch (e) {
                console.error('Error stiker:', e.message);
                msg.reply('Gagal sy buat stikernya 😹');
            }
        } else {
            msg.reply('Cara pakai:\n1. Kirim foto/GIF + caption *stiker*\n2. Atau reply foto/GIF dengan *!stiker*');
        }
    }
    else if (cmd === '!storyin') {
        if (!msg.hasQuotedMsg) {
            return msg.reply('Cara pakai: Reply ke video dokumen yang mau dijadiin story, trus ketik *!storyin* 🤭');
        }
        try {
            const quoted = await msg.getQuotedMessage();
            if (!quoted.hasMedia) {
                return msg.reply('Itu bukan video 😹 Reply ke video dokumennya yaa');
            }
            const tipe = quoted.type;
            const mime = quoted._data?.mimetype || '';
            const filename = quoted._data?.filename || '';
            const isVideoDoc = tipe === 'video' || tipe === 'document' ||
                mime.startsWith('video/') || /\.(mp4|mkv|mov|avi|3gp|webm)$/i.test(filename);
            if (!isVideoDoc) {
                return msg.reply('Nda bisa yaa, harus video atau dokumen video 😹');
            }

            // Cek ukuran file — skip jika > 50MB
            const fileSize = quoted._data?.size || quoted._data?.fileSizeBytes || 0;
            if (fileSize > 50 * 1024 * 1024) {
                return msg.reply('Maaf ee, videonya kegedean 😹 Maks 50MB yaa.\nKalo mau, kompres dlu di aplikasi lain baru kirim lagi.');
            }

            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply('Oke bentar sy optimize videonya dulu 🤭 sabar yaa...');

            const media = await quoted.downloadMedia();
            if (!media) return msg.reply('Gagal download videonya 😹 coba lagi yaa');

            const os = require('os');
            const ts = Date.now();
            const tmpIn = path.join(os.tmpdir(), `sv_in_${ts}.mp4`);
            const tmpOut = path.join(os.tmpdir(), `sv_out_${ts}.mp4`);
            fs.writeFileSync(tmpIn, Buffer.from(media.data, 'base64'));

            try {
                await optimizeVideo(tmpIn, tmpOut);
                const outputBuffer = fs.readFileSync(tmpOut);
                const optimizedMedia = new MessageMedia('video/mp4', outputBuffer.toString('base64'), 'video.mp4');
                await client.sendMessage(uid, optimizedMedia, {
                    sendMediaAsDocument: false,
                    caption: 'Nih videonya 🤭 kualitas tinggi, tinggal download trus upload ke story!'
                });
            } finally {
                if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
                if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
            }
        } catch (err) {
            console.error('Error !storyin:', err.message);
            msg.reply('Aduh error sy 😹 coba lagi yaa');
        }
    }
    else if (cmd.startsWith('!ig ')) {
        const link = msg.body.trim().split(' ').slice(1).join('').trim();
        if (!link || !link.includes('instagram.com')) {
            return msg.reply('Format salah 😹\nCara pakai: *!ig [link reels/post IG]*\nContoh:\n!ig https://www.instagram.com/reels/xxxxx/');
        }
        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply('Oke bentar sy download dulu reelsnya 🤭 sabar yaa...');

            const buffer = await downloadIGVideo(link);
            if (!buffer) {
                return msg.reply('Aiih gagal download sy 😹\nCek lagi linknya:\n1. Link bener & publik\n2. Akun IG tidak private\nCoba lagi yaa!');
            }

            const ts = Date.now();
            const tmpIn = path.join(__dirname, `ig_in_${ts}.mp4`);
            const tmpOut = path.join(__dirname, `ig_out_${ts}.mp4`);
            fs.writeFileSync(tmpIn, buffer);

            try {
                await optimizeVideo(tmpIn, tmpOut);
                const outputBuffer = fs.readFileSync(tmpOut);
                const videoMedia = new MessageMedia('video/mp4', outputBuffer.toString('base64'), 'reels.mp4');
                await client.sendMessage(uid, videoMedia, {
                    sendMediaAsDocument: false,
                    caption: 'Nih reelsnya 🤭 kualitas HD!'
                });
            } finally {
                if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
                if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
            }
        } catch (err) {
            console.error('Error !ig:', err.message);
            msg.reply('Aduh error sy 😹 coba lagi yaa');
        }
    }
    else if (cmd === '!ig') {
        msg.reply('Cara pakai: *!ig [link]*\n\nContoh:\n!ig https://www.instagram.com/reels/xxxxx/');
    }
    // ======== TIKTOK ========
    else if (cmd.startsWith('!tiktok ')) {
        const link = msg.body.trim().split(' ').slice(1).join('').trim();
        if (!link || !link.includes('tiktok.com')) {
            return msg.reply('Format salah 😹\nCara pakai: *!tiktok [link TikTok]*\nContoh:\n!tiktok https://www.tiktok.com/@user/video/xxxx');
        }
        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply('Oke bentar sy download dulu TikToknya 🤭 sabar yaa...');

            const buffer = await downloadTikTokVideo(link);
            if (!buffer) {
                return msg.reply('Aiih gagal download sy 😹\nCek lagi linknya:\n1. Link harus publik\n2. Bukan live\nCoba lagi yaa!');
            }

            const ts = Date.now();
            const tmpIn  = path.join(__dirname, `tt_in_${ts}.mp4`);
            const tmpOut = path.join(__dirname, `tt_out_${ts}.mp4`);
            fs.writeFileSync(tmpIn, buffer);

            try {
                await optimizeVideo(tmpIn, tmpOut);
                const outputBuffer = fs.readFileSync(tmpOut);
                const videoMedia = new MessageMedia('video/mp4', outputBuffer.toString('base64'), 'tiktok.mp4');
                await client.sendMessage(uid, videoMedia, {
                    sendMediaAsDocument: false,
                    caption: 'Nih videonya 🤭 kualitas HD!'
                });
            } finally {
                if (fs.existsSync(tmpIn))  fs.unlinkSync(tmpIn);
                if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
            }
        } catch (err) {
            console.error('Error !tiktok:', err.message);
            msg.reply('Aduh error sy 😹 coba lagi yaa');
        }
    }
    else if (cmd === '!tiktok') {
        msg.reply('Cara pakai: *!tiktok [link]*\n\nContoh:\n!tiktok https://www.tiktok.com/@user/video/xxxx');
    }
    // ======== YOUTUBE ========
    else if (cmd.startsWith('!yt ')) {
        const parts = msg.body.trim().split(' ');
        let audioOnly = false;
        let link = '';

        if (parts[1]?.toLowerCase() === 'audio') {
            audioOnly = true;
            link = parts.slice(2).join('').trim();
        } else {
            link = parts.slice(1).join('').trim();
        }

        if (!link || !link.includes('youtu')) {
            return msg.reply('Format salah 😹\nCara pakai:\n*!yt [link]* → download video\n*!yt audio [link]* → download MP3\n\nContoh:\n!yt https://youtu.be/xxxxx\n!yt audio https://youtu.be/xxxxx');
        }
        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply(`Oke bentar sy download dulu ${audioOnly ? 'audionya' : 'videonya'} 🤭 sabar yaa...`);

            const buffer = await downloadYouTubeVideo(link, audioOnly);
            if (!buffer) {
                return msg.reply('Aiih gagal download sy 😹\nCek lagi:\n1. Link YouTube valid\n2. Video tidak private\n3. Coba link pendek (youtu.be)\nCoba lagi yaa!');
            }

            if (audioOnly) {
                const audioMedia = new MessageMedia('audio/mpeg', buffer.toString('base64'), 'audio.mp3');
                await client.sendMessage(uid, audioMedia, {
                    sendMediaAsDocument: true,
                    caption: 'Nih MP3nya 🎵'
                });
            } else {
                const ts = Date.now();
                const tmpIn  = path.join(__dirname, `yt_in_${ts}.mp4`);
                const tmpOut = path.join(__dirname, `yt_out_${ts}.mp4`);
                fs.writeFileSync(tmpIn, buffer);

                try {
                    await optimizeVideo(tmpIn, tmpOut);
                    const outputBuffer = fs.readFileSync(tmpOut);
                    const videoMedia = new MessageMedia('video/mp4', outputBuffer.toString('base64'), 'youtube.mp4');
                    await client.sendMessage(uid, videoMedia, {
                        sendMediaAsDocument: false,
                        caption: 'Nih videonya 🤭 kualitas HD!'
                    });
                } finally {
                    if (fs.existsSync(tmpIn))  fs.unlinkSync(tmpIn);
                    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
                }
            }
        } catch (err) {
            console.error('Error !yt:', err.message);
            msg.reply('Aduh error sy 😹 coba lagi yaa');
        }
    }
    else if (cmd === '!yt') {
        msg.reply('Cara pakai:\n*!yt [link]* → download video\n*!yt audio [link]* → download MP3\n\nContoh:\n!yt https://youtu.be/xxxxx\n!yt audio https://youtu.be/xxxxx');
    }
    // ======== CUACA ========
    else if (cmd.startsWith('!cuaca ')) {
        const kota = msg.body.trim().split(' ').slice(1).join(' ').trim();
        if (!kota) return msg.reply('Cara pakai: *!cuaca [nama kota]*\nContoh: !cuaca Palu');
        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            const apiKey = process.env.OPENWEATHER_API_KEY;
            if (!apiKey) return msg.reply('API key cuaca belum diset 😹');
            const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(kota)}&appid=${apiKey}&units=metric&lang=id`);
            const d = res.data;
            const cuacaEmoji = {
                'Clear': '☀️', 'Clouds': '☁️', 'Rain': '🌧️',
                'Drizzle': '🌦️', 'Thunderstorm': '⛈️', 'Snow': '❄️',
                'Mist': '🌫️', 'Fog': '🌫️', 'Haze': '🌫️'
            };
            const emoji = cuacaEmoji[d.weather[0].main] || '🌡️';
            const teks = `${emoji} *Cuaca ${d.name}, ${d.sys.country}*
─────────────────────
🌡️ Suhu: *${Math.round(d.main.temp)}°C* (terasa ${Math.round(d.main.feels_like)}°C)
💧 Kelembaban: *${d.main.humidity}%*
💨 Angin: *${(d.wind.speed * 3.6).toFixed(1)} km/jam*
☁️ Kondisi: *${d.weather[0].description}*
👁️ Jarak pandang: *${(d.visibility / 1000).toFixed(1)} km*
─────────────────────`;
            msg.reply(teks);
        } catch (err) {
            if (err.response?.status === 404) {
                msg.reply(`Kota "${kota}" tidak ditemukan 😹\nCoba tulis dalam bahasa Inggris, contoh:\n!cuaca Makassar\n!cuaca Jakarta`);
            } else {
                msg.reply('Aduh gagal ambil data cuaca sy 😹 coba lagi yaa');
            }
        }
    }
    else if (cmd === '!cuaca') {
        msg.reply('Cara pakai: *!cuaca [nama kota]*\n\nContoh:\n!cuaca Palu\n!cuaca Jakarta\n!cuaca Makassar');
    }
    // ======== JADWAL SHOLAT ========
    else if (cmd.startsWith('!sholat ')) {
        const kota = msg.body.trim().split(' ').slice(1).join(' ').trim();
        if (!kota) return msg.reply('Cara pakai: *!sholat [nama kota]*\nContoh: !sholat Palu');
        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            // Cari ID kota
            const cariRes = await axios.get(`https://api.myquran.com/v2/sholat/kota/cari/${encodeURIComponent(kota)}`);
            const kotaList = cariRes.data?.data;
            if (!kotaList || kotaList.length === 0) {
                return msg.reply(`Kota "${kota}" tidak ditemukan 😹\nCoba nama kota lain jo`);
            }
            const kotaData = kotaList[0];
            // Ambil jadwal hari ini
            const today = new Date();
            const tgl = today.toISOString().split('T')[0]; // YYYY-MM-DD
            const jadwalRes = await axios.get(`https://api.myquran.com/v2/sholat/jadwal/${kotaData.id}/${tgl}`);
            const jadwal = jadwalRes.data?.data?.jadwal;
            if (!jadwal) return msg.reply('Gagal ambil jadwal sholat 😹 coba lagi jo');
            const hariNama = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
            const teks = `🕌 *Jadwal Sholat ${kotaData.lokasi}*
📅 ${hariNama[today.getDay()]}, ${jadwal.tanggal}
🌙 *Ramadan 1446 H*
─────────────────────
🔔 Imsak   : *${jadwal.imsak}*
🌅 Subuh   : *${jadwal.subuh}*
🌄 Terbit  : *${jadwal.terbit}*
☀️ Dhuha   : *${jadwal.dhuha}*
🌞 Dzuhur  : *${jadwal.dzuhur}*
🌇 Ashar   : *${jadwal.ashar}*
🍽️ Buka    : *${jadwal.maghrib}*
🌙 Isya    : *${jadwal.isya}*
─────────────────────
💡 _Imsak = batas makan sahur_
🍽️ _Buka puasa = waktu maghrib_`;
            msg.reply(teks);
        } catch (err) {
            console.error('Error !sholat:', err.message);
            msg.reply('Aduh gagal ambil jadwal sholat sy 😹 coba lagi yaa');
        }
    }
    else if (cmd === '!sholat') {
        msg.reply('Cara pakai: *!sholat [nama kota]*\n\nContoh:\n!sholat Palu\n!sholat Jakarta\n!sholat Makassar');
    }
    // ======== REMINDER OTOMATIS ========
    else if (cmd.startsWith('!reminder on')) {
        if (!msg.from.includes('@g.us')) return msg.reply('Fitur ini hanya bisa dipakai di grup 😹');
        const kotaNama = msg.body.trim().split(' ').slice(2).join(' ').trim();
        if (!kotaNama) return msg.reply('Cara pakai: *!reminder on [kota]*\nContoh: !reminder on Palu');
        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            const cariRes = await axios.get(`https://api.myquran.com/v2/sholat/kota/cari/${encodeURIComponent(kotaNama)}`);
            const kotaList = cariRes.data?.data;
            if (!kotaList || kotaList.length === 0) {
                return msg.reply(`Kota "${kotaNama}" tidak ditemukan 😹\nCoba nama kota lain jo`);
            }
            const kotaData = kotaList[0];
            groupReminders.set(msg.from, {
                kota: kotaNama,
                kotaId: kotaData.id,
                lokasi: kotaData.lokasi
            });
            saveReminders();
            msg.reply(`✅ *Reminder Sholat Aktif!*\n📍 Kota: *${kotaData.lokasi}*\n\nBot akan kirim reminder otomatis di grup ini setiap:\n🔔 Imsak, 🌅 Subuh, 🌞 Dzuhur, 🌇 Ashar, 🍽️ Buka Puasa, 🌙 Isya\n\nUntuk nonaktifkan: *!reminder off*`);
        } catch (err) {
            console.error('Error !reminder on:', err.message);
            msg.reply('Aduh gagal aktifkan reminder sy 😹 coba lagi yaa');
        }
    }
    else if (cmd === '!reminder off') {
        if (!msg.from.includes('@g.us')) return msg.reply('Fitur ini hanya bisa dipakai di grup 😹');
        if (!groupReminders.has(msg.from)) return msg.reply('Reminder belum aktif di grup ini 😹');
        groupReminders.delete(msg.from);
        saveReminders();
        msg.reply('❌ *Reminder sholat dinonaktifkan* di grup ini.');
    }
    else if (cmd === '!reminder') {
        const status = groupReminders.has(msg.from)
            ? `✅ Aktif - Kota: *${groupReminders.get(msg.from).lokasi}*`
            : '❌ Tidak aktif';
        msg.reply(`🔔 *Status Reminder Sholat*\n${status}\n\nCara pakai:\n*!reminder on [kota]* → aktifkan\n*!reminder off* → nonaktifkan`);
    }
    // ======== JADWAL KULIAH ========
    else if (cmd === '!jadwal on') {
        if (!msg.from.includes('@g.us')) return msg.reply('Fitur ini hanya bisa dipakai di grup 😹');
        groupJadwal.set(msg.from, true);
        saveJadwalGroups();
        msg.reply(`✅ *Reminder Jadwal Kuliah Aktif!*\n\nBot akan kirim pengingat *1 jam sebelum* kuliah di grup ini setiap:\n\n📅 *Senin*\n• 08:10 → Jaringan Komputer (09:10)\n• 11:40 → Sistem Operasi (12:40)\n\n📅 *Selasa*\n• 06:30 → Keamanan Siber (07:30)\n• 13:20 → Keamanan Sistem Komputer (14:20)\n\n📅 *Rabu*\n• 11:30 → Pengembangan Aplikasi WEB (12:30)\n\n📅 *Kamis*\n• 09:55 → Pemodelan dan Simulasi (10:55)\n• 13:20 → Pengembangan Aplikasi Bergerak (14:20)\n\nUntuk nonaktifkan: *!jadwal off*`);
    }
    else if (cmd === '!jadwal off') {
        if (!msg.from.includes('@g.us')) return msg.reply('Fitur ini hanya bisa dipakai di grup 😹');
        if (!groupJadwal.has(msg.from)) return msg.reply('Reminder jadwal belum aktif di grup ini 😹');
        groupJadwal.delete(msg.from);
        saveJadwalGroups();
        msg.reply('❌ *Reminder jadwal kuliah dinonaktifkan* di grup ini.');
    }
    else if (cmd === '!jadwal') {
        const hariIni = new Date();
        // WIB
        const wib = new Date(hariIni.getTime() + (8 * 60 * 60 * 1000));
        const hariIdx = wib.getUTCDay();
        const statusGrup = msg.from.includes('@g.us')
            ? groupJadwal.has(msg.from) ? '✅ Reminder aktif di grup ini' : '❌ Reminder belum aktif (ketik !jadwal on)'
            : '';

        let jadwalText = `📚 *Jadwal Kuliah EsarFauzan*\n${statusGrup}\n─────────────────────\n`;

        const hariList = [1,2,3,4];
        for (const hari of hariList) {
            const matkuls = JADWAL_KULIAH.filter(j => j.hari === hari);
            const marker = hari === hariIdx ? ' ⬅️ *hari ini*' : '';
            jadwalText += `\n📅 *${NAMA_HARI[hari]}*${marker}\n`;
            for (const mk of matkuls) {
                jadwalText += `• ${mk.mulai}–${mk.selesai} | ${mk.matkul}\n`;
            }
        }
        jadwalText += `─────────────────────\n🔔 Reminder 1 jam sebelum kuliah\n!jadwal on → aktifkan di grup\n!jadwal off → nonaktifkan`;
        msg.reply(jadwalText);
    }
    // ======== CATATAN / NOTES ========
    else if (cmd.startsWith('!catat ')) {
        const isi = msg.body.trim().slice(7).trim();
        if (!isi) return msg.reply('Cara pakai: *!catat [isi catatan]*\nContoh: !catat Kumpul tugas PAW hari Jumat');
        const contact = await msg.getContact();
        const by = contact.pushname || contact.number;
        const notes = groupNotes.get(uid) || [];
        const id = notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1;
        notes.push({ id, isi, by, ts: new Date().toISOString() });
        groupNotes.set(uid, notes);
        saveNotes();
        msg.reply(`✅ Catatan *#${id}* tersimpan 📝`);
    }
    else if (cmd === '!notes' || cmd === '!catatan') {
        const notes = groupNotes.get(uid) || [];
        if (notes.length === 0) return msg.reply('Belum ada catatan 😹\nTambah pakai: *!catat [isi]*');
        let teks = `📝 *Catatan*\n─────────────────────\n`;
        for (const n of notes) {
            const tgl = new Date(n.ts).toLocaleDateString('id-ID', { day:'2-digit', month:'short' });
            teks += `*${n.id}.* ${n.isi}\n_oleh ${n.by} • ${tgl}_\n\n`;
        }
        teks += `_Hapus: *!hapus note [nomor]*_`;
        msg.reply(teks.trim());
    }
    else if (cmd.startsWith('!hapus note ')) {
        const noStr = msg.body.trim().split(' ').pop();
        const no = parseInt(noStr);
        if (isNaN(no)) return msg.reply('Cara pakai: *!hapus note [nomor]*\nContoh: !hapus note 1');
        const notes = groupNotes.get(uid) || [];
        const idx = notes.findIndex(n => n.id === no);
        if (idx === -1) return msg.reply(`Catatan #${no} tidak ditemukan 😹`);
        notes.splice(idx, 1);
        groupNotes.set(uid, notes);
        saveNotes();
        msg.reply(`❌ Catatan *#${no}* dihapus.`);
    }
    // ======== INFO AKADEMIK ========
    else if (cmd.startsWith('!akademik tambah ')) {
        const raw = msg.body.trim().slice(17).trim();
        const parts = raw.split('|').map(s => s.trim());
        if (parts.length < 3) return msg.reply('Format salah 😹\nCara pakai: *!akademik tambah [nama] | [deskripsi] | [url]*\nContoh:\n!akademik tambah SIGA | Link SIGA Untad | https://siga.com');
        const [nama, label, url] = parts;
        if (!url.startsWith('http')) return msg.reply('URL harus diawali http:// atau https:// 😹');
        const id = LINK_AKADEMIK.length > 0 ? Math.max(...LINK_AKADEMIK.map(l => l.id)) + 1 : 1;
        LINK_AKADEMIK.push({ id, nama, label, url });
        saveAkademik();
        msg.reply(`✅ Link *${nama}* berhasil ditambahkan!\n🔗 ${url}`);
    }
    else if (cmd === '!akademik tambah') {
        msg.reply('Cara pakai: *!akademik tambah [nama] | [deskripsi] | [url]*\nContoh:\n!akademik tambah SIGA | Link SIGA Untad | https://siga.com');
    }
    else if (cmd.startsWith('!akademik hapus ')) {
        const query = msg.body.trim().slice(16).trim();
        const no = parseInt(query);
        let idx = -1;
        if (!isNaN(no)) {
            idx = LINK_AKADEMIK.findIndex(l => l.id === no);
        } else {
            idx = LINK_AKADEMIK.findIndex(l => l.nama.toLowerCase().includes(query.toLowerCase()));
        }
        if (idx === -1) return msg.reply(`Link "${query}" tidak ditemukan 😹\nLihat nomor di *!akademik*`);
        const nama = LINK_AKADEMIK[idx].nama;
        LINK_AKADEMIK.splice(idx, 1);
        saveAkademik();
        msg.reply(`❌ Link *${nama}* dihapus.`);
    }
    else if (cmd.startsWith('!akademik')) {
        const keyword = msg.body.trim().slice(9).trim().toLowerCase();
        if (!keyword) {
            let teks = `🎓 *Link Akademik*\n─────────────────────\n`;
            for (const l of LINK_AKADEMIK) {
                teks += `*${l.id || ''}* 🔗 *${l.nama}*\n${l.label}\n${l.url}\n\n`;
            }
            teks += `_Tambah: !akademik tambah [nama] | [desk] | [url]_\n_Hapus: !akademik hapus [no/nama]_`;
            return msg.reply(teks.trim());
        }
        const found = LINK_AKADEMIK.find(l => l.nama.toLowerCase().includes(keyword) || l.label.toLowerCase().includes(keyword));
        if (!found) return msg.reply(`Link "${keyword}" tidak ditemukan 😹\nKetik *!akademik* untuk lihat semua link`);
        msg.reply(`🔗 *${found.nama}*\n${found.label}\n\n${found.url}`);
    }
    // ======== COUNTDOWN UJIAN ========
    else if (cmd === '!ujian') {
        if (jadwalUjian.length === 0) return msg.reply('Belum ada jadwal ujian 😹\nTambah pakai:\n*!ujian tambah [nama matkul] | [DD-MM-YYYY]*\nContoh: !ujian tambah UTS Jaringan Komputer | 10-03-2026');
        const now = new Date();
        now.setHours(0,0,0,0);
        let teks = `📝 *Jadwal Ujian*\n─────────────────────\n`;
        const sorted = [...jadwalUjian].sort((a,b) => new Date(a.tanggal) - new Date(b.tanggal));
        for (const u of sorted) {
            const tgl = new Date(u.tanggal);
            tgl.setHours(0,0,0,0);
            const selisih = Math.round((tgl - now) / (1000*60*60*24));
            let countdown;
            if (selisih < 0)  countdown = `_sudah lewat_`;
            else if (selisih === 0) countdown = `🔴 *HARI INI!*`;
            else if (selisih === 1) countdown = `🟠 *Besok!*`;
            else if (selisih <= 7)  countdown = `⚠️ ${selisih} hari lagi`;
            else                    countdown = `${selisih} hari lagi`;
            const tglStr = tgl.toLocaleDateString('id-ID', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
            teks += `📖 *${u.nama}*\n📅 ${tglStr}\n⏳ ${countdown}\n\n`;
        }
        teks += `_Tambah: !ujian tambah [nama] | [DD-MM-YYYY]_\n_Hapus: !ujian hapus [nomor]_`;
        msg.reply(teks.trim());
    }
    else if (cmd.startsWith('!ujian tambah ')) {
        const raw = msg.body.trim().slice(14).trim();
        const parts = raw.split('|');
        if (parts.length < 2) return msg.reply('Format salah 😹\nCara pakai: *!ujian tambah [nama] | [DD-MM-YYYY]*\nContoh: !ujian tambah UTS Jaringan Komputer | 10-03-2026');
        const nama = parts[0].trim();
        const tglRaw = parts[1].trim();
        const [d, m, y] = tglRaw.split('-');
        const tanggal = `${y}-${m}-${d}`;
        if (isNaN(new Date(tanggal).getTime())) return msg.reply('Format tanggal salah! Gunakan DD-MM-YYYY\nContoh: 10-03-2026');
        const id = jadwalUjian.length > 0 ? Math.max(...jadwalUjian.map(u => u.id)) + 1 : 1;
        jadwalUjian.push({ id, nama, tanggal });
        saveUjian();
        const tglFmt = new Date(tanggal).toLocaleDateString('id-ID', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
        msg.reply(`✅ Jadwal ujian *${nama}* ditambahkan!\n📅 ${tglFmt}`);
    }
    else if (cmd.startsWith('!ujian hapus ')) {
        const noStr = msg.body.trim().split(' ').pop();
        const no = parseInt(noStr);
        if (isNaN(no)) return msg.reply('Cara pakai: *!ujian hapus [nomor]*\nLihat nomor di *!ujian*');
        const idx = jadwalUjian.findIndex(u => u.id === no);
        if (idx === -1) return msg.reply(`Ujian #${no} tidak ditemukan 😹`);
        const nama = jadwalUjian[idx].nama;
        jadwalUjian.splice(idx, 1);
        saveUjian();
        msg.reply(`❌ Jadwal ujian *${nama}* dihapus.`);
    }
    // ======== GITHUB TRACKER ========
    else if (cmd.startsWith('!github ')) {
        const username = msg.body.trim().split(' ')[1]?.trim();
        if (!username) return msg.reply('Cara pakai: *!github [username]*\nContoh: !github torvalds');
        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();

            const [userRes, repoRes] = await Promise.all([
                axios.get(`https://api.github.com/users/${username}`),
                axios.get(`https://api.github.com/users/${username}/repos?sort=updated&per_page=5`)
            ]);

            const u = userRes.data;
            const repos = repoRes.data;

            let teks = `👨‍💻 *GitHub: ${u.login}*\n`;
            if (u.name) teks += `📛 Nama     : ${u.name}\n`;
            if (u.bio)  teks += `💬 Bio      : ${u.bio}\n`;
            if (u.company) teks += `🏢 Company  : ${u.company}\n`;
            if (u.location) teks += `📍 Lokasi   : ${u.location}\n`;
            teks += `─────────────────────\n`;
            teks += `📁 Repo     : *${u.public_repos}*\n`;
            teks += `❤️ Followers: *${u.followers}*\n`;
            teks += `👥 Following: *${u.following}*\n`;
            teks += `─────────────────────\n`;

            if (repos.length > 0) {
                teks += `🔥 *5 Repo Terbaru:*\n`;
                for (const r of repos) {
                    const stars = r.stargazers_count > 0 ? ` ⭐${r.stargazers_count}` : '';
                    const lang  = r.language ? ` [${r.language}]` : '';
                    teks += `• *${r.name}*${lang}${stars}\n`;
                }
                teks += `─────────────────────\n`;
            }

            teks += `🔗 ${u.html_url}`;
            msg.reply(teks);
        } catch (err) {
            if (err.response?.status === 404) {
                msg.reply(`User GitHub *"${username}"* tidak ditemukan 😹`);
            } else if (err.response?.status === 403) {
                msg.reply('Rate limit GitHub tercapai 😹 Coba lagi beberapa menit lagi');
            } else {
                msg.reply('Gagal ambil data GitHub 😹 coba lagi yaa');
            }
        }
    }
    else if (cmd === '!github') {
        msg.reply('Cara pakai: *!github [username]*\n\nContoh:\n!github torvalds\n!github EsarFauzan');
    }
    else if (cmd === '!rmbg') {
        const apiKey = process.env.CLIPDROP_API_KEY;
        if (!apiKey) return msg.reply('API key Clipdrop belum diset 😹');

        let targetMsg = null;

        if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted.hasMedia && (quoted.type === 'image' || quoted.type === 'sticker')) {
                    targetMsg = quoted;
                } else {
                    return msg.reply('Reply-nya harus gambar atau stiker yaa 😹');
                }
            } catch (e) {
                return msg.reply('Gagal baca pesan yang di-reply 😹');
            }
        } else if (msg.hasMedia && (msg.type === 'image' || msg.type === 'sticker')) {
            targetMsg = msg;
        } else {
            return msg.reply('Cara pakai:\n• Kirim foto + caption *!rmbg*\n• Atau *reply foto/stiker* dengan *!rmbg*\n\n_Hasil dikirim sebagai stiker transparan_ 🎨\n_Gratis 100 gambar/bulan_');
        }

        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply('Bentar sy hapus backgroundnya dulu 🤭 sabar yaa...');

            const media = await targetMsg.downloadMedia();
            if (!media) return msg.reply('Gagal download gambarnya 😹 coba jo lagi nanti');

            const imageBuffer = Buffer.from(media.data, 'base64');

            // Konversi input ke PNG dengan alpha channel terjaga
            // Flatten transparan → magenta (#FF00FF) bukan putih,
            // agar Clipdrop tetap bisa hapus background putih
            const pngInput = await sharp(imageBuffer)
                .ensureAlpha()
                .flatten({ background: { r: 255, g: 0, b: 255 } })
                .png()
                .toBuffer();

            const resultBuffer = await removeBackground(pngInput);

            // Selalu kirim sebagai stiker WebP transparan
            const webpBuffer = await sharp(resultBuffer)
                .ensureAlpha()
                .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp({ quality: 90, alphaQuality: 100 })
                .toBuffer();

            const resultMedia = new MessageMedia('image/webp', webpBuffer.toString('base64'), 'result.webp');
            await client.sendMessage(uid, resultMedia, {
                sendMediaAsSticker: true,
                stickerName: 'BotBYEsarFauzan',
                stickerAuthor: 'GooodBooy'
            });
            await msg.reply('Background udah dihapus 🎨 dikirim sebagai *stiker* biar transparan!');

        } catch (err) {
            const status = err.response?.status;
            const errBody = err.response?.data ? Buffer.from(err.response.data).toString() : '';
            console.error('Error !rmbg:', status, err.message, errBody);
            if (status === 402) {
                msg.reply('Kuota Clipdrop habis 😹 Gratis hanya 100 gambar/bulan');
            } else if (status === 400) {
                msg.reply('Gambarnya tidak bisa diproses 😹 Coba gambar lain jo');
            } else if (status === 401) {
                msg.reply('API key Clipdrop tidak valid 😹');
            } else {
                msg.reply(`Aduh error sy 😹 (${status || 'unknown'}) coba jo lagi nanti`);
            }
        }
    }
    // ======== UPSCALE IMAGE ========
    else if (cmd === '!upscale') {
        const apiKey = process.env.CLIPDROP_API_KEY;
        if (!apiKey) return msg.reply('API key Clipdrop belum diset ee 😹');

        let targetMsg = null;

        if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted.hasMedia && quoted.type === 'image') {
                    targetMsg = quoted;
                } else {
                    return msg.reply('Reply-nya harus gambar ee 😹');
                }
            } catch (e) {
                return msg.reply('Gagal baca pesan yang di-reply 😹');
            }
        } else if (msg.hasMedia && msg.type === 'image') {
            targetMsg = msg;
        } else {
            return msg.reply('Cara pakai:\n• Kirim foto + caption *!upscale*\n• Atau *reply foto* dengan *!upscale*\n\n_Foto akan diperbesar kualitasnya hingga 2048px_ 🔍');
        }

        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply('Bentar sy upscale dulu fotonya ee 🤭 sabar jo...');

            const media = await targetMsg.downloadMedia();
            if (!media) return msg.reply('Gagal download gambarnya 😹 coba lagi jo');

            const imageBuffer = Buffer.from(media.data, 'base64');
            const pngBuffer = await sharp(imageBuffer).png().toBuffer();
            const resultBuffer = await upscaleImage(pngBuffer);

            const resultMedia = new MessageMedia('image/png', resultBuffer.toString('base64'), 'upscaled.png');
            await client.sendMessage(uid, resultMedia, {
                caption: 'Nih fotonya ee 🔍 kualitas udah ditingkatkan ke 2048px!'
            });

        } catch (err) {
            const status = err.response?.status;
            const errBody = err.response?.data ? Buffer.from(err.response.data).toString() : '';
            console.error('Error !upscale:', status, err.message, errBody);
            if (status === 402) {
                msg.reply('Kuota Clipdrop habis ee 😹 Gratis hanya 100 upscale/bulan');
            } else if (status === 400) {
                msg.reply('Gambarnya tidak bisa diproses ee 😹\nPastikan:\n• Format JPG/PNG\n• Ukuran maks 16MB\nCoba gambar lain jo');
            } else if (status === 401) {
                msg.reply('API key Clipdrop tidak valid ee 😹');
            } else {
                msg.reply(`Aduh error sy 😹 (${status || 'unknown'}) coba lagi jo`);
            }
        }
    }
    // ======== QR CODE GENERATOR ========
    else if (cmd.startsWith('!qr ')) {
        const teks = msg.body.slice(4).trim();
        if (!teks) return msg.reply('Cara pakai: *!qr [teks/link]*\nContoh: *!qr https://google.com*');

        try {
            const QRCode = require('qrcode');
            const chat = await msg.getChat();
            chat.sendStateTyping();

            const qrBuffer = await QRCode.toBuffer(teks, {
                type: 'png',
                width: 512,
                margin: 2,
                color: { dark: '#000000', light: '#FFFFFF' }
            });

            const qrMedia = new MessageMedia('image/png', qrBuffer.toString('base64'), 'qrcode.png');
            await client.sendMessage(uid, qrMedia, {
                caption: `✅ QR Code berhasil dibuat!\n\n_Isi: ${teks.length > 50 ? teks.slice(0, 50) + '...' : teks}_`
            });

        } catch (err) {
            console.error('Error !qr:', err.message);
            msg.reply('Aduh gagal buat QR code ee 😹 coba lagi jo');
        }
    }
    else if (cmd === '!qr') {
        msg.reply('Cara pakai: *!qr [teks/link]*\nContoh:\n!qr https://google.com\n!qr Halo Dunia');
    }
    // ======== KOMPRES GAMBAR ========
    else if (cmd === '!kompres') {
        let targetMsg = null;

        if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted.hasMedia && quoted.type === 'image') {
                    targetMsg = quoted;
                } else {
                    return msg.reply('Reply-nya harus gambar ee 😹');
                }
            } catch (e) {
                return msg.reply('Gagal baca pesan yang di-reply 😹');
            }
        } else if (msg.hasMedia && msg.type === 'image') {
            targetMsg = msg;
        } else {
            return msg.reply('Cara pakai:\n• Kirim foto + caption *!kompres*\n• Atau *reply foto* dengan *!kompres*\n\n_Ukuran foto akan dikecilkan_ 📦');
        }

        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply('Bentar sy kompres dulu fotonya ee 🤭 sabar jo...');

            const media = await targetMsg.downloadMedia();
            if (!media) return msg.reply('Gagal download gambarnya 😹 coba lagi jo');

            const inputBuffer = Buffer.from(media.data, 'base64');
            const inputSize = inputBuffer.length;

            // Kompres ke JPEG quality 60, resize max 1280px
            const outputBuffer = await sharp(inputBuffer)
                .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 60, mozjpeg: true })
                .toBuffer();

            const outputSize = outputBuffer.length;
            const saved = (((inputSize - outputSize) / inputSize) * 100).toFixed(1);

            const resultMedia = new MessageMedia('image/jpeg', outputBuffer.toString('base64'), 'compressed.jpg');
            await client.sendMessage(uid, resultMedia, {
                caption: `📦 *Foto berhasil dikompres!*\n\n` +
                         `Sebelum : ${(inputSize / 1024).toFixed(1)} KB\n` +
                         `Sesudah : ${(outputSize / 1024).toFixed(1)} KB\n` +
                         `Hemat   : *${saved}%* 🎉`
            });

        } catch (err) {
            console.error('Error !kompres:', err.message);
            msg.reply('Aduh gagal kompres fotonya ee 😹 coba lagi jo');
        }
    }
    else if (cmd === '!help' || cmd === '!menu') {
        const currentMode = userModes.get(uid) || 'normal';
        const menuText = `🤖 *ESARFAUZAN BOT*
Mode aktif: *${currentMode.toUpperCase()}*
─────────────────────

📥 *Download*
!ig [link] → Download reels/post IG
!tiktok [link] → Download video TikTok
!yt [link] → Download video YouTube
!yt audio [link] → Download MP3 YouTube

🎬 *Video HD for Story*
Kirim video as *Dokumen* → bot optimize & kirim balik
!storyin → Reply video dokumen → convert HD

🖼️ *Stiker & Edit Foto*
Kirim foto/GIF + caption *stiker* → auto jadi stiker
!stiker → Reply foto/GIF → jadikan stiker
!rmbg → Hapus background foto → dikirim sebagai stiker transparan
!upscale → Perbesar kualitas foto hingga 2048px 🔍
!kompres → Kompres ukuran foto 📦
!qr [teks/link] → Buat QR Code dari teks/link

🎭 *Ganti Mode*
!mode normal → Mode biasa
!mode gombal → Mode gombal 💕
!mode serious → Mode serius
!mode story → Mode cerita

🌤️ *Cuaca & Sholat*
!cuaca [kota] → Cek cuaca kota
!sholat [kota] → Jadwal sholat hari ini

🔔 *Reminder Otomatis (Grup)*
!reminder on [kota] → Aktifkan reminder sholat
!reminder off → Nonaktifkan reminder
!reminder → Cek status reminder

📚 *Jadwal Kuliah*
!jadwal → Lihat jadwal kuliah
!jadwal on → Aktifkan reminder kuliah (grup)
!jadwal off → Nonaktifkan reminder kuliah

📝 *Catatan Grup*
!catat [isi] → Simpan catatan
!notes → Lihat semua catatan
!hapus note [no] → Hapus catatan

🎓 *Info Akademik*
!akademik → Lihat semua link
!akademik [nama] → Cari link
!akademik tambah [nama] | [desk] | [url] → Tambah link
!akademik hapus [no/nama] → Hapus link

📝 *Countdown Ujian*
!ujian → Lihat countdown ujian
!ujian tambah [nama] | [DD-MM-YYYY] → Tambah jadwal
!ujian hapus [no] → Hapus jadwal ujian

👨‍💻 *GitHub Tracker*
!github [username] → Cek profil GitHub

⚙️ *Lainnya*
!stats → Statistik chat
!reset → Reset riwayat
!menu → Tampilkan menu ini
─────────────────────
`;
        msg.reply(menuText);
    }
}

client.initialize();