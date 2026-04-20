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
const schedule = require('node-schedule');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getTimeContextInZone } = require('./src/utils/timeContext');
const { loadLearningData, saveLearningData } = require('./src/storage/learningDataStore');
const { buildHelpMenu } = require('./src/messages/helpMenu');
const { createCommandRouter } = require('./src/commands/createCommandRouter');
const { buildHealthReport, buildHealthLogLine } = require('./src/monitoring/health');

const REQUIRED_ENV = ['OPENROUTER_API_KEY'];
const OPTIONAL_ENV = {
    GEMINI_API_KEY: 'transkrip audio/voice',
    CLIPDROP_API_KEY: 'remove background & upscale image',
    IMGBB_API_KEY: 'fitur storyin (unggah video)'
};

function validateEnvironment() {
    const missingRequired = REQUIRED_ENV.filter((key) => !process.env[key]);
    if (missingRequired.length) {
        console.error('❌ Environment wajib belum diisi:', missingRequired.join(', '));
        console.error('Isi di file .env lalu jalankan ulang bot.');
        process.exit(1);
    }

    const missingOptional = Object.entries(OPTIONAL_ENV).filter(([key]) => !process.env[key]);
    if (missingOptional.length) {
        console.warn('⚠️ Environment opsional belum diisi:');
        for (const [key, feature] of missingOptional) {
            console.warn(`- ${key} (${feature})`);
        }
    }
}

validateEnvironment();

// ============== KONFIGURASI ==============
const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1'
});

const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

const MODEL_NAME = "arcee-ai/trinity-large-preview:free";
const VISION_MODEL = "google/gemini-2.0-flash-lite-001";
const BOT_TIMEZONE = process.env.BOT_TIMEZONE || 'Asia/Makassar';
const STARTED_AT = new Date();

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
const TODO_FILE       = path.join(__dirname, 'todos.json');
let stats = { totalChats: 0, lastActive: null };
let learningExpressions = [];

// groupId → { kota, kotaId, lokasi }
let groupReminders = new Map();
// Cache jadwal: `${kotaId}_${YYYY-MM-DD}` → jadwal object
const prayerCache = new Map();
// groupId → true (grup yang aktifkan reminder jadwal kuliah)
let groupJadwal = new Map();
// groupId → [ { id, isi, by, ts } ]
let groupNotes = new Map();
// userId/groupId → [ { task: string, done: boolean } ]
let userTodos = new Map();
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

function loadTodos() {
    try {
        if (fs.existsSync(TODO_FILE)) {
            const data = JSON.parse(fs.readFileSync(TODO_FILE, 'utf8'));
            userTodos = new Map(Object.entries(data));
        }
    } catch (e) {}
}

function saveTodos() {
    try {
        const obj = Object.fromEntries(userTodos);
        fs.writeFileSync(TODO_FILE, JSON.stringify(obj, null, 2));
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
        const learningData = loadLearningData(LEARNING_FILE);
        stats = learningData.stats;
        learningExpressions = learningData.expressions;
    } catch (e) { /* baru mulai */ }
}

function saveStats() {
    try {
        saveLearningData(LEARNING_FILE, {
            stats,
            expressions: learningExpressions
        });
    } catch (e) {}
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
loadTodos();
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
        const mime = media.mimetype || '';
        const isVideo = msg.type === 'video' || msg.type === 'document' || mime.startsWith('video/');
        const isGif = mime === 'image/gif';

        let webpBuffer;

        if (isVideo || isGif) {
            // Video / GIF → animated WebP via ffmpeg
            const os = require('os');
            const ts = Date.now();
            // Tulis file input dengan ekstensi asli agar ffmpeg bisa deteksi codec
            let ext = '.mp4';
            if (isGif) ext = '.gif';
            else if (mime.includes('webm')) ext = '.webm';
            else if (mime.includes('3gp')) ext = '.3gp';
            else if (mime.includes('mov') || mime.includes('quicktime')) ext = '.mov';

            const tmpIn  = path.join(os.tmpdir(), `stiker_in_${ts}${ext}`);
            const tmpOut = path.join(os.tmpdir(), `stiker_out_${ts}.webp`);

            fs.writeFileSync(tmpIn, buffer);

            try {
                // Coba beberapa level kualitas sampai file < 1MB
                const attempts = [
                    { fps: 30, q: 50, size: 512 },
                    { fps: 30, q: 35, size: 512 },
                    { fps: 30, q: 20, size: 512 }
                ];

                for (let a = 0; a < attempts.length; a++) {
                    const { fps, q, size } = attempts[a];
                    
                    await new Promise((resolve, reject) => {
                        const proc = execFile(ffmpegPath, [
                            '-y', '-i', tmpIn,
                            '-t', '5',
                            '-vf', [
                                `fps=${fps}`,
                                `scale=${size}:${size}:force_original_aspect_ratio=decrease`,
                                'format=rgba',
                                `pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`
                            ].join(','),
                            '-vcodec', 'libwebp',
                            '-pix_fmt', 'yuva420p',
                            '-lossless', '0',
                            '-compression_level', '6',
                            '-q:v', String(q),
                            '-loop', '0',
                            '-preset', 'picture',
                            '-an',
                            '-vsync', '0',
                            tmpOut
                        ], (err, stdout, stderr) => {
                            if (err) {
                                console.error('FFmpeg stiker stderr:', stderr);
                                reject(new Error(stderr || err.message));
                            } else resolve();
                        });

                        const timeout = setTimeout(() => {
                            proc.kill('SIGKILL');
                            reject(new Error('FFmpeg stiker timeout 60s'));
                        }, 60000);

                        proc.on('close', () => clearTimeout(timeout));
                    });

                    const fileSize = fs.statSync(tmpOut).size;
                    console.log(`Stiker attempt ${a+1}: ${fps}fps q${q} ${size}px → ${Math.round(fileSize/1024)}KB`);
                    
                    if (fileSize <= 1024 * 1024) break; // < 1MB → OK
                    if (a === attempts.length - 1) break; // terakhir → pakai apapun hasilnya
                }

                webpBuffer = fs.readFileSync(tmpOut);
            } finally {
                if (fs.existsSync(tmpIn))  fs.unlinkSync(tmpIn);
                if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
            }
        } else {
            // Gambar biasa → static WebP kotak 512x512 dengan padding transparan
            webpBuffer = await sharp(buffer)
                .ensureAlpha()
                .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp({ quality: 80 })
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
        stickerName: 'EFstiker',
        stickerAuthor: 'G00Dbooy'
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
    const sharp = require('sharp');

    // Baca dimensi asli agar rasio tidak berubah
    const meta = await sharp(imageBuffer).metadata();
    const origW = meta.width || 1024;
    const origH = meta.height || 1024;

    // Scale 4x, tapi batasi sisi terpanjang maks 2048
    const scale = Math.min(4, 2048 / Math.max(origW, origH));
    const targetW = Math.round(origW * scale);
    const targetH = Math.round(origH * scale);

    const form = new FormData();
    form.append('image_file', imageBuffer, {
        filename: 'image.png',
        contentType: 'image/png'
    });
    form.append('target_width', targetW);
    form.append('target_height', targetH);

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
let healthMonitorStarted = false;

function getHealthStatus() {
    return buildHealthReport({
        startedAt: STARTED_AT,
        stats,
        historySize: history.size,
        cooldownSize: cooldowns.size,
        groupRemindersSize: groupReminders.size,
        groupJadwalSize: groupJadwal.size,
        groupNotesSize: groupNotes.size,
        userTodosSize: userTodos.size,
        jadwalUjianSize: jadwalUjian.length,
        schedulersStarted,
        healthMonitorStarted,
        timezone: BOT_TIMEZONE
    });
}

function startHealthMonitor() {
    console.log('🩺 Health monitor aktif (interval 10 menit)');
    setInterval(() => {
        console.log(buildHealthLogLine({
            startedAt: STARTED_AT,
            stats,
            historySize: history.size,
            cooldownSize: cooldowns.size,
            groupRemindersSize: groupReminders.size,
            groupJadwalSize: groupJadwal.size,
            groupNotesSize: groupNotes.size,
            userTodosSize: userTodos.size,
            jadwalUjianSize: jadwalUjian.length,
            schedulersStarted,
            healthMonitorStarted,
            timezone: BOT_TIMEZONE
        }));
    }, 10 * 60 * 1000);
}

client.on('ready', () => {
    console.log(`✅ Bot EsarFauzan siap! Model: ${MODEL_NAME}`);
    console.log(`📊 Total chat: ${stats.totalChats}`);
    // Hanya jalankan scheduler sekali — cegah duplikat saat reconnect
    if (!schedulersStarted) {
        startPrayerReminder();
        startJadwalReminder();
        schedulersStarted = true;
    }
    if (!healthMonitorStarted) {
        startHealthMonitor();
        healthMonitorStarted = true;
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

        const { hariIdx: hari, jamMenit } = getTimeContextInZone();

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

        const { jamMenit, tglKey } = getTimeContextInZone();

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
    if (!['chat', 'image', 'video', 'document', 'sticker', 'ptt', 'audio'].includes(msg.type)) return;

    const isGroup = msg.from.includes('@g.us');
    const rawBody = (msg.body || '');
    const cleanBody = rawBody.replace(/@\d+/g, '').trim();
    const isCommand = cleanBody.startsWith('!');

    // Di grup: command (!) boleh langsung, chat biasa harus mention bot
    if (isGroup && !isCommand) {
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
    const senderId = isGroup ? (msg.author || userId) : userId;
    const cooldownKey = isGroup ? `${userId}:${senderId}` : userId;
    const isImage = msg.type === 'image';
    const isVideo = msg.type === 'video';
    const isDocument = msg.type === 'document';
    const isAudio = msg.type === 'ptt' || msg.type === 'audio';

    const caption = cleanBody.toLowerCase().trim();
    const isStikerRequest = caption === 'stiker' || caption === 'sticker';
    console.log(`📩 ${isGroup ? '[GRUP]' : ''} ${userId}: ${(isImage || isVideo || isDocument) ? `[${msg.type.toUpperCase()}]` : rawBody}`);

    // Cooldown
    const last = cooldowns.get(cooldownKey) || 0;
    if (Date.now() - last < COOLDOWN) return;
    cooldowns.set(cooldownKey, Date.now());

    // Commands — cek dari cleanBody
    if (cleanBody.startsWith('!')) {
        // Override msg.body sementara agar handleCommand baca command bersih
        const originalBody = msg.body;
        msg.body = cleanBody;
        await handleCommand(msg);
        msg.body = originalBody;
        return;
    }

    // ✅ DOKUMEN VIDEO → cek dulu apakah mau dijadikan stiker atau di-optimize
    if (isDocument && msg.hasMedia) {
        const mime = msg._data?.mimetype || '';
        const filename = msg._data?.filename || '';
        const isVideoDoc = mime.startsWith('video/') || mime === 'image/gif' ||
            /\.(mp4|mkv|mov|avi|3gp|webm|gif)$/i.test(filename);

        if (!isVideoDoc) return; // dokumen bukan video/gif → abaikan

        // Kalau caption "stiker" → jadikan stiker animated
        if (isStikerRequest) {
            try {
                const chat = await msg.getChat();
                chat.sendStateTyping();
                const stikerMedia = await buatStiker(msg);
                if (stikerMedia) {
                    await kirimStiker(client, userId, msg, stikerMedia);
                } else {
                    msg.reply('Aiih gagal buat stikernya 😹 coba lagi yaa');
                }
            } catch (e) {
                console.error('Error stiker dokumen:', e.message);
                msg.reply('Gagal sy buat stikernya 😹');
            }
            return;
        }

        // Kalau bukan request stiker, abaikan saja karena tidak ada command eksplisit
        return;
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

        // Handle Audio / Voice Note
        if (isAudio && msg.hasMedia) {
            try {
                if (!genAI) {
                    return msg.reply("API Key Gemini belum diatur untuk transkrip suara 😹");
                }
                const media = await msg.downloadMedia();
                if (media && media.data) {
                    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                    
                    const prompt = `Transkrip pesan suara ini ke teks. Ubah ke format perintah bot jika pengguna meminta hal berikut:
1. Mengatur alarm/pengingat -> "!ingatkan [waktu] | [pesan]" (Contoh: !ingatkan 15 menit | angkat jemuran). 
2. Menambah todo list -> "!todo tambah [tugas]" (Contoh: !todo tambah beli telur).
3. Menyelesaikan/mencoret todo -> "!todo coret [nomor]" (Contoh jika user bilang "coret todo nomor satu dan dua" -> !todo coret 1, 2).
4. Menghapus todo -> "!todo hapus [nomor]" (Contoh jika user bilang "hapus todo nomor satu dan dua" -> !todo hapus 1, 2).
5. Melihat todo list -> "!todo" (Contoh jika user bilang "lihat todo list").
Jika bukan perintah di atas, tulis teks aslinya saja. HANYA hasil teks, tanpa kata pengantar.`;

                    const result = await model.generateContent([
                        prompt,
                        { inlineData: { data: media.data, mimeType: media.mimetype } }
                    ]);

                    let text = result.response.text().trim();
                    text = text.replace(/^```|```$/g, "").trim();

                    if (text.startsWith('!ingatkan') || text.startsWith('!todo')) {
                        const originalBody = msg.body;
                        msg.body = text;
                        await handleCommand(msg);
                        msg.body = originalBody;
                        return; // Selesai diproses sebagai command
                    } else {
                        userMessage = text;
                    }
                }
            } catch (e) {
                console.error("Error transkrip audio:", e.message);
                return msg.reply("Aduh gagal dengerin suaranya 😹");
            }
        }
        // Handle image (analisis AI)
        else if (isImage && msg.hasMedia) {
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
const handleCommand = createCommandRouter({
    client,
    axios,
    path,
    fs,
    sharp,
    MessageMedia,
    schedule,
    userModes,
    stats,
    history,
    buildHelpMenu,
    getHealthStatus,
    groupReminders,
    saveReminders,
    groupJadwal,
    saveJadwalGroups,
    getTimeContextInZone,
    NAMA_HARI,
    JADWAL_KULIAH,
    userTodos,
    saveTodos,
    groupNotes,
    saveNotes,
    LINK_AKADEMIK,
    saveAkademik,
    jadwalUjian,
    saveUjian,
    buatStiker,
    kirimStiker,
    optimizeVideo,
    downloadIGVideo,
    downloadTikTokVideo,
    downloadYouTubeVideo,
    removeBackground,
    upscaleImage
});
client.initialize();