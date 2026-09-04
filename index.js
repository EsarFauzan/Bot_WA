require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const axios = require('axios');
const schedule = require('node-schedule');
const dataStore = require('./src/storage/dataStore');
const { getTimeContextInZone } = require('./src/utils/timeContext');
const { createJobQueue, createRateLimiter } = require('./src/utils/jobQueue');
const { JADWAL_KULIAH, NAMA_HARI, saveKuliahSchedule } = require('./src/storage/jadwalKuliahStore');
const { buildHelpMenu } = require('./src/messages/helpMenu');
const { createCommandRouter } = require('./src/commands/createCommandRouter');
const { buildHealthReport, buildHealthLogLine } = require('./src/monitoring/health');
const { startPrayerReminder } = require('./src/schedulers/prayerScheduler');
const { startJadwalReminder } = require('./src/schedulers/jadwalScheduler');
const { startZikirAutoReminder } = require('./src/schedulers/zikirScheduler');

const REQUIRED_ENV = [];
const OPTIONAL_ENV = {
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
const BOT_TIMEZONE = process.env.BOT_TIMEZONE || 'Asia/Makassar';
const BOT_MODE = 'command-only';
const STARTED_AT = new Date();

// ============== VALIDASI FFMPEG ==============
let ffmpegAvailable = false;
if (ffmpegPath) {
    try {
        fs.accessSync(ffmpegPath);
        ffmpegAvailable = true;
        console.log('✅ FFmpeg ditemukan:', ffmpegPath);
    } catch (e) {
        console.warn('⚠️ FFmpeg tidak ditemukan di path:', ffmpegPath);
    }
} else {
    console.warn('⚠️ FFmpeg-static tidak ter-load. Fitur stiker video akan gagal.');
}

// ============== ANTREAN TASK BERAT ==============
// Dipakai mediaCommands (stiker, storyin, download, clipdrop) agar tidak
// membebani CPU/RAM VPS secara bersamaan.
const HEAVY_COOLDOWN_MS = 20000; // jeda antar task berat per user per command
const mediaJobQueue = createJobQueue({ concurrency: 1 });
const mediaRateLimiter = createRateLimiter(HEAVY_COOLDOWN_MS);

// ============== DATA (via dataStore) ==============
// Semua state dipersist atomic oleh dataStore. Handler command memanggil
// save* (wrapper persist per domain) setelah mutasi map/array di atas.
const groupReminders = dataStore.reminders;
const groupJadwal = dataStore.jadwal;
const groupJadwalInsights = dataStore.jadwalInsight;
const sholatModes = dataStore.sholatMode;
const zikirAutoTargets = dataStore.zikirAuto;
const groupNotes = dataStore.notes;
const userTodos = dataStore.todo;
const jadwalUjian = dataStore.ujian;
const LINK_AKADEMIK = dataStore.akademik;
const jadwalInsightState = dataStore.jadwalInsightState;
const zikirAutoState = dataStore.zikirAutoState;

// Statistik chat (learning). Jaga bentuk agar kompatibel dengan format lama.
if (!dataStore.learning.stats) dataStore.learning.stats = { totalChats: 0, lastActive: null };
if (!Array.isArray(dataStore.learning.expressions)) dataStore.learning.expressions = [];
const stats = dataStore.learning.stats;

const saveReminders = () => dataStore.persist('reminders');
const saveJadwalGroups = () => dataStore.persist('jadwal');
const saveJadwalInsightGroups = () => dataStore.persist('jadwalInsight');
const saveSholatModes = () => dataStore.persist('sholatMode');
const saveZikirAutoTargets = () => dataStore.persist('zikirAuto');
const saveNotes = () => dataStore.persist('notes');
const saveTodos = () => dataStore.persist('todo');
const saveUjian = () => dataStore.persist('ujian');
const saveAkademik = () => dataStore.persist('akademik');

function recordCommandActivity() {
    dataStore.learning.stats.totalChats++;
    dataStore.learning.stats.lastActive = new Date().toISOString();
    dataStore.persist('learning');
}

// ============== CONVERSATION & RATE LIMIT ==============
const history = new Map();
const cooldowns = new Map();
const COOLDOWN = 2000;
const userModes = new Map();

// ============== FUNGSI STIKER ==============
async function buatStiker(msg) {
    try {
        // Cek FFmpeg tersedia
        if (!ffmpegAvailable) {
            console.error('[STIKER] FFmpeg tidak tersedia');
            throw new Error('FFmpeg tidak ter-install. Hubungi admin untuk setup ffmpeg-static.');
        }

        console.log('[STIKER] Mulai download media...');
        const media = await msg.downloadMedia();
        if (!media) {
            console.error('[STIKER] Download media failed - returned null');
            throw new Error('Gagal download media dari WhatsApp. Coba lagi.');
        }

        console.log('[STIKER] Media downloaded, processing...');
        const buffer = Buffer.from(media.data, 'base64');
        if (!buffer || buffer.length === 0) {
            console.error('[STIKER] Buffer kosong setelah decode');
            throw new Error('Buffer media kosong. Video mungkin corrupt.');
        }

        const mime = media.mimetype || '';
        const isVideo = msg.type === 'video' || msg.type === 'document' || mime.startsWith('video/');
        const isGif = mime === 'image/gif';

        console.log(`[STIKER] Type: ${msg.type}, Mime: ${mime}, Size: ${Math.round(buffer.length/1024)}KB, IsVideo: ${isVideo}, IsGif: ${isGif}`);

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
                // Coba beberapa level kualitas sampai file < 1.5MB
                const attempts = [
                    { fps: 30, q: 50, size: 512 },
                    { fps: 30, q: 35, size: 512 },
                    { fps: 30, q: 20, size: 512 },
                    { fps: 20, q: 20, size: 400 }  // Fallback: lower fps & size
                ];

                for (let a = 0; a < attempts.length; a++) {
                    const { fps, q, size } = attempts[a];

                    await new Promise((resolve, reject) => {
                        // Use simplified command untuk attempt 4 (fallback)
                        let args = a === 3 ? [
                            '-y', '-i', tmpIn,
                            '-t', '10',
                            '-vf', `fps=${fps},scale=${size}:${size}:force_original_aspect_ratio=decrease`,
                            '-c:v', 'libwebp',
                            '-q:v', String(q),
                            '-loop', '0',
                            '-an',
                            tmpOut
                        ] : [
                            '-y', '-i', tmpIn,
                            '-t', '10',
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
                        ];

                        const proc = execFile(ffmpegPath, args, (err, stdout, stderr) => {
                            if (err) {
                                const errMsg = stderr || err.message;
                                console.error(`[STIKER] FFmpeg attempt ${a+1} error:`, errMsg.substring(0, 500));
                                reject(new Error(`FFmpeg error: ${errMsg.substring(0, 200)}`));
                            } else resolve();
                        });

                        const timeout = setTimeout(() => {
                            proc.kill('SIGKILL');
                            reject(new Error('FFmpeg timeout 60s - video terlalu besar atau codec tidak compatible'));
                        }, 60000);

                        proc.on('close', () => clearTimeout(timeout));
                    });

                    // Cek apakah file output berhasil dibuat
                    if (!fs.existsSync(tmpOut)) {
                        throw new Error(`FFmpeg attempt ${a+1} tidak menghasilkan output file`);
                    }

                    const fileSize = fs.statSync(tmpOut).size;
                    console.log(`[STIKER] Attempt ${a+1} (${a === 3 ? 'simplified' : 'normal'}): ${fps}fps q${q} ${size}px → ${Math.round(fileSize/1024)}KB`);

                    if (fileSize <= 1024 * 1024 * 1.5) break; // < 1.5MB → OK
                    if (a === attempts.length - 1) break; // terakhir → pakai apapun hasilnya
                }

                webpBuffer = fs.readFileSync(tmpOut);
                console.log(`[STIKER] Sukses convert ke WebP: ${Math.round(webpBuffer.length/1024)}KB`);
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
            console.log(`[STIKER] Sukses convert image ke WebP: ${Math.round(webpBuffer.length/1024)}KB`);
        }

        return new MessageMedia('image/webp', webpBuffer.toString('base64'), 'stiker.webp');
    } catch (err) {
        console.error('Error buat stiker:', err.stack || err.message || err);
        // Return object dengan error message untuk ditampilkan ke user
        return { error: err.message };
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
    console.log(`✅ Bot EsarFauzan siap! Mode: ${BOT_MODE}`);
    console.log(`📊 Total chat: ${dataStore.learning.stats.totalChats}`);
    // Hanya jalankan scheduler sekali — cegah duplikat saat reconnect
    if (!schedulersStarted) {
        startPrayerReminder({ client });
        startJadwalReminder({ client });
        startZikirAutoReminder({ client });
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
    console.error('❌ Unhandled Rejection:', reason instanceof Error ? reason.stack : reason);
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

// ============== MESSAGE HANDLER ==============
client.on('message', async msg => {
    if (!['chat', 'image', 'video', 'document', 'sticker', 'ptt', 'audio'].includes(msg.type)) return;

    const isGroup = msg.from.includes('@g.us');
    const rawBody = msg.body || '';
    const mediaCaption = rawBody.replace(/@\d+/g, '').trim();
    const legacyStickerCaption = msg.hasMedia && /^(stiker|sticker)$/i.test(mediaCaption);
    const cleanBody = legacyStickerCaption ? '!stiker' : mediaCaption;
    if (!cleanBody.startsWith('!')) return;

    const senderId = isGroup ? (msg.author || msg.from) : msg.from;
    const cooldownKey = isGroup ? `${msg.from}:${senderId}` : msg.from;
    const last = cooldowns.get(cooldownKey) || 0;
    if (Date.now() - last < COOLDOWN) return;
    cooldowns.set(cooldownKey, Date.now());

    try {
        console.log(`[COMMAND] ${isGroup ? '[GRUP]' : ''} ${msg.from}: ${cleanBody}`);
        const commandMsg = Object.create(msg);
        commandMsg.body = cleanBody;
        recordCommandActivity();
        await handleCommand(commandMsg);
    } catch (err) {
        console.error('Error command:', err.stack || err);
        msg.reply('Command gagal diproses. Coba lagi sebentar.');
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
    sholatModes,
    saveSholatModes,
    groupJadwalInsights,
    saveJadwalInsightGroups,
    groupJadwal,
    saveJadwalGroups,
    saveKuliahSchedule,
    zikirAutoTargets,
    saveZikirAutoTargets,
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
    upscaleImage,
    jobQueue: mediaJobQueue,
    rateLimiter: mediaRateLimiter
});
client.initialize();