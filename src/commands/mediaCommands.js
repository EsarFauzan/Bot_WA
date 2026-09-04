const { safeTyping } = require('../utils/safeTyping');

function createMediaCommandsHandler(deps) {
    const {
        client,
        path,
        fs,
        sharp,
        axios,
        MessageMedia,
        buatStiker,
        kirimStiker,
        optimizeVideo,
        downloadIGVideo,
        downloadTikTokVideo,
        downloadYouTubeVideo,
        removeBackground,
        upscaleImage,
        jobQueue,
        rateLimiter
    } = deps;

    /**
     * Jalankan task berat lewat antrean + rate limiter per user.
     * @param {string} key kunci rate limit (mis. `stiker:${uid}`)
     * @param {() => Promise<any>} fn fungsi berat (ffmpeg/download/API)
     * @returns {Promise<{blocked: true, remain: number} | {blocked: false, result: any}>}
     */
    async function runHeavy(key, fn) {
        // Fallback bila jobQueue/rateLimiter belum di-inject (mis. deploy parsial):
        // jalankan langsung tanpa antrean, sama seperti perilaku sebelum refactor.
        if (!jobQueue || !rateLimiter) {
            return { blocked: false, result: await fn() };
        }
        const remain = rateLimiter.check(key);
        if (remain > 0) return { blocked: true, remain };
        rateLimiter.hit(key);
        return { blocked: false, result: await jobQueue.enqueue(fn) };
    }

    function heavyBlockedReply(remain) {
        return `Masih ada proses berat yang berjalan. Coba lagi dalam ${remain} detik.`;
    }

    return async function handleMediaCommands(ctx) {
        const { cmd, msg, uid } = ctx;

    if (cmd === '!stiker') {
        if (msg.hasMedia) {
            try {
                await safeTyping(msg);
                
                const stikerGate = await runHeavy(`stiker:${uid}`, () => buatStiker(msg));
                if (stikerGate.blocked) {
                    await msg.reply(heavyBlockedReply(stikerGate.remain));
                    return true;
                }
                const stikerMedia = stikerGate.result;
                if (stikerMedia?.error) {
                    msg.reply(`Gagal membuat stikernya.\n${stikerMedia.error}`);
                } else if (stikerMedia) {
                    await kirimStiker(client, msg.from, msg, stikerMedia);
                } else {
                    msg.reply('Aiih, gagal nih. Coba lagi yaa.');
                }
            } catch (e) {
                console.error('Error stiker:', e);
                msg.reply('Gagal membuat stikernya. Coba lagi yaa.');
            }
        } else if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted.hasMedia) {
                    await safeTyping(msg);
                    
                    const stikerGate = await runHeavy(`stiker:${uid}`, () => buatStiker(quoted));
                    if (stikerGate.blocked) {
                        await msg.reply(heavyBlockedReply(stikerGate.remain));
                        return true;
                    }
                    const stikerMedia = stikerGate.result;
                    if (stikerMedia?.error) {
                        msg.reply(`Gagal sy buat stikernya\n${stikerMedia.error}`);
                    } else if (stikerMedia) {
                        await kirimStiker(client, msg.from, msg, stikerMedia);
                    } else {
                        msg.reply('Aiih, gagal nih. Coba lagi yaa.');
                    }
                } else {
                    msg.reply('Reply-nya bukan foto/GIF/video. Coba reply media dulu yaa.');
                }
            } catch (e) {
                console.error('Error stiker:', e);
                msg.reply('Gagal membuat stikernya. Coba lagi yaa.');
            }
        } else {
            msg.reply('Cara pakai:\n1. Kirim foto/GIF/video + caption *!stiker*\n2. Atau reply foto/GIF/video dengan *!stiker*');
        }

        return true;
    }

    if (cmd === '!storyin') {
        let targetMsg = null;

        if (msg.hasMedia) {
            targetMsg = msg;
        } else if (msg.hasQuotedMsg) {
            const quoted = await msg.getQuotedMessage();
            if (quoted.hasMedia) targetMsg = quoted;
        }

        if (!targetMsg) {
            await msg.reply('Cara pakai: Reply ke video dokumen yang mau dijadikan story, atau kirim langsung video/dokumen dengan caption *!storyin*.');
            return true;
        }

        try {
            const tipe = targetMsg.type;
            const mime = targetMsg._data?.mimetype || '';
            const filename = targetMsg._data?.filename || '';
            const isVideoDoc = tipe === 'video' || tipe === 'document' ||
                mime.startsWith('video/') || /\.(mp4|mkv|mov|avi|3gp|webm)$/i.test(filename);

            if (!isVideoDoc) {
                await msg.reply('Nda bisa yaa, harus video atau dokumen video.');
                return true;
            }

            const fileSize = targetMsg._data?.size || targetMsg._data?.fileSizeBytes || 0;
            if (fileSize > 50 * 1024 * 1024) {
                await msg.reply('Maaf, videonya kegedean. Maks 50MB yaa.\nKalau mau, kompres dulu di aplikasi lain baru kirim lagi.');
                return true;
            }

            await safeTyping(msg);
            
            await msg.reply('Oke, bentar sy optimize videonya dulu. Sabar yaa...');

            const storyGate = await runHeavy(`storyin:${uid}`, async () => {
                const media = await targetMsg.downloadMedia();
                if (!media) return null;

                const os = require('os');
                const ts = Date.now();
                const tmpIn = path.join(os.tmpdir(), `sv_in_${ts}.mp4`);
                const tmpOut = path.join(os.tmpdir(), `sv_out_${ts}.mp4`);
                fs.writeFileSync(tmpIn, Buffer.from(media.data, 'base64'));

                try {
                    await optimizeVideo(tmpIn, tmpOut);
                    return fs.readFileSync(tmpOut);
                } finally {
                    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
                    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
                }
            });
            if (storyGate.blocked) {
                await msg.reply(heavyBlockedReply(storyGate.remain));
                return true;
            }

            const outputBuffer = storyGate.result;
            if (!outputBuffer) {
                await msg.reply('Gagal download videonya. Coba lagi yaa.');
                return true;
            }

            const optimizedMedia = new MessageMedia('video/mp4', outputBuffer.toString('base64'), 'video.mp4');
            await msg.reply('Nih videonya, kualitas tinggi. Tinggal download terus upload ke story!');
            await client.sendMessage(uid, optimizedMedia, {
                sendMediaAsDocument: false
            });
        } catch (err) {
            console.error('Error !storyin:', err);
            msg.reply('Aduh, error. Coba lagi yaa.');
        }

        return true;
    }

    if (cmd.startsWith('!ig ')) {
        const link = msg.body.trim().split(' ').slice(1).join('').trim();
        if (!link || !link.includes('instagram.com')) {
            await msg.reply('Format salah.\nCara pakai: *!ig [link reels/post IG]*\nContoh:\n!ig https://www.instagram.com/reels/xxxxx/');
            return true;
        }
        try {
            await safeTyping(msg);
            
            await msg.reply('Oke, bentar sy download dulu reelsnya. Sabar yaa...');

            const igGate = await runHeavy(`ig:${uid}`, async () => {
                const buffer = await downloadIGVideo(link);
                if (!buffer) return null;

                const ts = Date.now();
                const tmpIn = path.join(__dirname, `../../ig_in_${ts}.mp4`);
                const tmpOut = path.join(__dirname, `../../ig_out_${ts}.mp4`);
                fs.writeFileSync(tmpIn, buffer);

                try {
                    await optimizeVideo(tmpIn, tmpOut);
                    return fs.readFileSync(tmpOut);
                } finally {
                    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
                    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
                }
            });
            if (igGate.blocked) {
                await msg.reply(heavyBlockedReply(igGate.remain));
                return true;
            }

            const igOutput = igGate.result;
            if (!igOutput) {
                await msg.reply('Gagal download. Cek lagi linknya:\n1. Link bener & publik\n2. Akun IG tidak private\nCoba lagi yaa!');
                return true;
            }

            const videoMedia = new MessageMedia('video/mp4', igOutput.toString('base64'), 'reels.mp4');
            await client.sendMessage(uid, videoMedia, {
                sendMediaAsDocument: false,
                caption: 'Nih reelsnya, kualitas HD!'
            });
        } catch (err) {
            console.error('Error !ig:', err);
            msg.reply('Aduh, error. Coba lagi yaa.');
        }

        return true;
    }

    if (cmd === '!ig') {
        msg.reply('Cara pakai: *!ig [link]*\n\nContoh:\n!ig https://www.instagram.com/reels/xxxxx/');
        return true;
    }

    if (cmd.startsWith('!tiktok ')) {
        const link = msg.body.trim().split(' ').slice(1).join('').trim();
        if (!link || !link.includes('tiktok.com')) {
            await msg.reply('Format salah.\nCara pakai: *!tiktok [link TikTok]*\nContoh:\n!tiktok https://www.tiktok.com/@user/video/xxxx');
            return true;
        }
        try {
            await safeTyping(msg);
            
            await msg.reply('Oke, bentar sy download dulu TikToknya. Sabar yaa...');

            const ttGate = await runHeavy(`tiktok:${uid}`, async () => {
                const buffer = await downloadTikTokVideo(link);
                if (!buffer) return null;

                const ts = Date.now();
                const tmpIn = path.join(__dirname, `../../tt_in_${ts}.mp4`);
                const tmpOut = path.join(__dirname, `../../tt_out_${ts}.mp4`);
                fs.writeFileSync(tmpIn, buffer);

                try {
                    await optimizeVideo(tmpIn, tmpOut);
                    return fs.readFileSync(tmpOut);
                } finally {
                    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
                    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
                }
            });
            if (ttGate.blocked) {
                await msg.reply(heavyBlockedReply(ttGate.remain));
                return true;
            }

            const ttOutput = ttGate.result;
            if (!ttOutput) {
                await msg.reply('Gagal download. Cek lagi linknya:\n1. Link harus publik\n2. Bukan live\nCoba lagi yaa!');
                return true;
            }

            const videoMedia = new MessageMedia('video/mp4', ttOutput.toString('base64'), 'tiktok.mp4');
            await msg.reply('Nih videonya, kualitas HD!');
            await client.sendMessage(uid, videoMedia, {
                sendMediaAsDocument: false
            });
        } catch (err) {
            console.error('Error !tiktok:', err);
            msg.reply('Aduh, error. Coba lagi yaa.');
        }

        return true;
    }

    if (cmd === '!tiktok') {
        msg.reply('Cara pakai: *!tiktok [link]*\n\nContoh:\n!tiktok https://www.tiktok.com/@user/video/xxxx');
        return true;
    }

    if (cmd.startsWith('!yt ')) {
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
            await msg.reply('Format salah.\nCara pakai:\n*!yt [link]* → download video\n*!yt audio [link]* → download MP3\n\nContoh:\n!yt https://youtu.be/xxxxx\n!yt audio https://youtu.be/xxxxx');
            return true;
        }
        try {
            await safeTyping(msg);
            
            await msg.reply(`Oke, bentar sy download dulu ${audioOnly ? 'audionya' : 'videonya'}. Sabar yaa...`);

            const ytGate = await runHeavy(`yt:${uid}`, async () => {
                const buffer = await downloadYouTubeVideo(link, audioOnly);
                if (!buffer) return null;

                if (audioOnly) {
                    return { audio: true, buffer };
                }

                const ts = Date.now();
                const tmpIn = path.join(__dirname, `../../yt_in_${ts}.mp4`);
                const tmpOut = path.join(__dirname, `../../yt_out_${ts}.mp4`);
                fs.writeFileSync(tmpIn, buffer);

                try {
                    await optimizeVideo(tmpIn, tmpOut);
                    return { audio: false, buffer: fs.readFileSync(tmpOut) };
                } finally {
                    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
                    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
                }
            });
            if (ytGate.blocked) {
                await msg.reply(heavyBlockedReply(ytGate.remain));
                return true;
            }

            const ytResult = ytGate.result;
            if (!ytResult) {
                await msg.reply('Gagal download. Cek lagi:\n1. Link YouTube valid\n2. Video tidak private\n3. Coba link pendek (youtu.be)\nCoba lagi yaa!');
                return true;
            }

            if (ytResult.audio) {
                const audioMedia = new MessageMedia('audio/mpeg', ytResult.buffer.toString('base64'), 'audio.mp3');
                await client.sendMessage(uid, audioMedia, {
                    sendMediaAsDocument: true,
                    caption: 'Nih MP3nya.'
                });
            } else {
                const videoMedia = new MessageMedia('video/mp4', ytResult.buffer.toString('base64'), 'youtube.mp4');
                await msg.reply('Nih videonya, kualitas HD!');
                await client.sendMessage(uid, videoMedia, {
                    sendMediaAsDocument: false
                });
            }
        } catch (err) {
            console.error('Error !yt:', err);
            msg.reply('Aduh, error. Coba lagi yaa.');
        }

        return true;
    }

    if (cmd === '!yt') {
        msg.reply('Cara pakai:\n*!yt [link]* → download video\n*!yt audio [link]* → download MP3\n\nContoh:\n!yt https://youtu.be/xxxxx\n!yt audio https://youtu.be/xxxxx');
        return true;
    }

    if (cmd === '!rmbg') {
        const apiKey = process.env.CLIPDROP_API_KEY;
        if (!apiKey) {
            await msg.reply('API key Clipdrop belum diset.');
            return true;
        }

        let targetMsg = null;

        if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted.hasMedia && (quoted.type === 'image' || quoted.type === 'sticker')) {
                    targetMsg = quoted;
                } else {
                    await msg.reply('Reply-nya harus gambar atau stiker yaa.');
                    return true;
                }
            } catch (e) {
                await msg.reply('Gagal baca pesan yang di-reply.');
                return true;
            }
        } else if (msg.hasMedia && (msg.type === 'image' || msg.type === 'sticker')) {
            targetMsg = msg;
        } else {
            await msg.reply('Cara pakai:\n• Kirim foto + caption *!rmbg*\n• Atau *reply foto/stiker* dengan *!rmbg*\n\n_Hasil dikirim sebagai stiker transparan_\n_Gratis 100 gambar/bulan_');
            return true;
        }

        try {
            await safeTyping(msg);
            
            await msg.reply('Bentar, sy hapus backgroundnya dulu. Sabar yaa...');

            const media = await targetMsg.downloadMedia();
            if (!media) {
                await msg.reply('Gagal download gambarnya. Coba lagi nanti.');
                return true;
            }

            const imageBuffer = Buffer.from(media.data, 'base64');
            const pngInput = await sharp(imageBuffer)
                .ensureAlpha()
                .flatten({ background: { r: 255, g: 0, b: 255 } })
                .png()
                .toBuffer();

            const rmbgGate = await runHeavy(`rmbg:${uid}`, () => removeBackground(pngInput));
            if (rmbgGate.blocked) {
                await msg.reply(heavyBlockedReply(rmbgGate.remain));
                return true;
            }
            const resultBuffer = rmbgGate.result;
            const webpBuffer = await sharp(resultBuffer)
                .ensureAlpha()
                .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp({ quality: 90, alphaQuality: 100 })
                .toBuffer();

            const resultMedia = new MessageMedia('image/webp', webpBuffer.toString('base64'), 'result.webp');
            await client.sendMessage(uid, resultMedia, {
                sendMediaAsSticker: true,
                stickerName: 'BotBY.EF',
                stickerAuthor: 'GooodBooy'
            });
            await msg.reply('Background udah dihapus. Dikirim sebagai *stiker* biar transparan!');
        } catch (err) {
            const status = err.response?.status;
            const errBody = err.response?.data ? Buffer.from(err.response.data).toString() : '';
            console.error('Error !rmbg:', status, err, errBody);
            if (status === 402) {
                msg.reply('Kuota Clipdrop habis. Gratis hanya 100 gambar/bulan.');
            } else if (status === 400) {
                msg.reply('Gambarnya tidak bisa diproses. Coba gambar lain yaa.');
            } else if (status === 401) {
                msg.reply('API key Clipdrop tidak valid.');
            } else {
                msg.reply(`Aduh, error (${status || 'unknown'}). Coba lagi nanti.`);
            }
        }

        return true;
    }

    if (cmd === '!upscale') {
        const apiKey = process.env.CLIPDROP_API_KEY;
        if (!apiKey) {
            await msg.reply('API key Clipdrop belum diset.');
            return true;
        }

        let targetMsg = null;

        if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted.hasMedia && quoted.type === 'image') {
                    targetMsg = quoted;
                } else {
                    await msg.reply('Reply-nya harus gambar yaa.');
                    return true;
                }
            } catch (e) {
                await msg.reply('Gagal baca pesan yang di-reply.');
                return true;
            }
        } else if (msg.hasMedia && msg.type === 'image') {
            targetMsg = msg;
        } else {
            await msg.reply('Cara pakai:\n• Kirim foto + caption *!upscale*\n• Atau *reply foto* dengan *!upscale*\n\n_Foto akan diperbesar kualitasnya hingga 4x resolusi asli_');
            return true;
        }

        try {
            await safeTyping(msg);
            
            await msg.reply('Bentar, sy upscale dulu fotonya. Sabar yaa...');

            const media = await targetMsg.downloadMedia();
            if (!media) {
                await msg.reply('Gagal download gambarnya. Coba lagi yaa.');
                return true;
            }

            const imageBuffer = Buffer.from(media.data, 'base64');
            const pngBuffer = await sharp(imageBuffer).png().toBuffer();
            const upscaleGate = await runHeavy(`upscale:${uid}`, () => upscaleImage(pngBuffer));
            if (upscaleGate.blocked) {
                await msg.reply(heavyBlockedReply(upscaleGate.remain));
                return true;
            }
            const resultBuffer = upscaleGate.result;

            const resultMedia = new MessageMedia('image/png', resultBuffer.toString('base64'), 'upscaled.png');
            await msg.reply('Nih fotonya, kualitas udah ditingkatkan. Rasio tetap sama!');
            await client.sendMessage(uid, resultMedia);
        } catch (err) {
            const status = err.response?.status;
            const errBody = err.response?.data ? Buffer.from(err.response.data).toString() : '';
            console.error('Error !upscale:', status, err, errBody);
            if (status === 402) {
                msg.reply('Kuota Clipdrop habis. Gratis hanya 100 upscale/bulan.');
            } else if (status === 400) {
                msg.reply('Gambarnya tidak bisa diproses.\nPastikan:\n• Format JPG/PNG\n• Ukuran maks 16MB\nCoba gambar lain.');
            } else if (status === 401) {
                msg.reply('API key Clipdrop tidak valid.');
            } else {
                msg.reply(`Aduh, error (${status || 'unknown'}). Coba lagi yaa.`);
            }
        }

        return true;
    }

    if (cmd.startsWith('!qr ')) {
        const teks = msg.body.slice(4).trim();
        if (!teks) {
            await msg.reply('Cara pakai: *!qr [teks/link]*\nContoh: *!qr https://google.com*');
            return true;
        }

        try {
            const QRCode = require('qrcode');
            await safeTyping(msg);
            

            const qrBuffer = await QRCode.toBuffer(teks, {
                type: 'png',
                width: 512,
                margin: 2,
                color: { dark: '#000000', light: '#FFFFFF' }
            });

            const qrMedia = new MessageMedia('image/png', qrBuffer.toString('base64'), 'qrcode.png');
            await client.sendMessage(uid, qrMedia, {
                caption: `QR Code berhasil dibuat!\n\n_Isi: ${teks.length > 50 ? teks.slice(0, 50) + '...' : teks}_`
            });
        } catch (err) {
            console.error('Error !qr:', err);
            msg.reply('Aduh, gagal buat QR code. Coba lagi.');
        }

        return true;
    }

    if (cmd === '!qr') {
        let targetMsg = null;

        if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted.hasMedia && quoted.type === 'image') targetMsg = quoted;
            } catch (e) {}
        } else if (msg.hasMedia && msg.type === 'image') {
            targetMsg = msg;
        }

        if (targetMsg) {
            const imgbbKey = process.env.IMGBB_API_KEY;
            if (!imgbbKey) {
                await msg.reply('API key ImgBB belum diset.\nTambah IMGBB_API_KEY di file .env');
                return true;
            }

            try {
                const QRCode = require('qrcode');
                await safeTyping(msg);
                
                await msg.reply('Bentar, sy upload gambarnya dulu baru buat QR-nya. Sabar...');

                const media = await targetMsg.downloadMedia();
                if (!media) {
                    await msg.reply('Gagal download gambarnya. Coba lagi.');
                    return true;
                }

                const FormData = require('form-data');
                const form = new FormData();
                form.append('image', media.data);
                form.append('key', imgbbKey);

                const uploadRes = await axios.post('https://api.imgbb.com/1/upload', form, {
                    headers: form.getHeaders(),
                    timeout: 30000
                });

                const imageUrl = uploadRes.data?.data?.url;
                if (!imageUrl) {
                    await msg.reply('Gagal upload gambarnya. Coba lagi.');
                    return true;
                }

                const qrBuffer = await QRCode.toBuffer(imageUrl, {
                    type: 'png',
                    width: 512,
                    margin: 2,
                    color: { dark: '#000000', light: '#FFFFFF' }
                });

                const qrMedia = new MessageMedia('image/png', qrBuffer.toString('base64'), 'qrcode.png');
                await client.sendMessage(uid, qrMedia, {
                    caption: '*QR Code gambar berhasil dibuat!*\n\nScan QR-nya, gambar langsung muncul.'
                });
            } catch (err) {
                console.error('Error !qr gambar:', err);
                msg.reply('Aduh, gagal buat QR dari gambar. Coba lagi.');
            }
        } else {
            msg.reply('Cara pakai:\n• *!qr [teks/link]* → Buat QR dari teks/link\n• Kirim/reply foto + *!qr* → Buat QR dari gambar\n\nContoh:\n!qr https://google.com\n!qr Halo Dunia');
        }

        return true;
    }

    if (cmd === '!kompres') {
        let targetMsg = null;

        if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted.hasMedia && quoted.type === 'image') {
                    targetMsg = quoted;
                } else {
                    await msg.reply('Reply-nya harus gambar.');
                    return true;
                }
            } catch (e) {
                await msg.reply('Gagal baca pesan yang di-reply.');
                return true;
            }
        } else if (msg.hasMedia && msg.type === 'image') {
            targetMsg = msg;
        } else {
            await msg.reply('Cara pakai:\n• Kirim foto + caption *!kompres*\n• Atau *reply foto* dengan *!kompres*\n\n_Ukuran foto akan dikecilkan_');
            return true;
        }

        try {
            await safeTyping(msg);
            
            await msg.reply('Bentar, sy kompres dulu fotonya. Sabar...');

            const media = await targetMsg.downloadMedia();
            if (!media) {
                await msg.reply('Gagal download gambarnya. Coba lagi.');
                return true;
            }

            const inputBuffer = Buffer.from(media.data, 'base64');
            const inputSize = inputBuffer.length;

            const outputBuffer = await sharp(inputBuffer)
                .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 60, mozjpeg: true })
                .toBuffer();

            const outputSize = outputBuffer.length;
            const saved = (((inputSize - outputSize) / inputSize) * 100).toFixed(1);

            const resultMedia = new MessageMedia('image/jpeg', outputBuffer.toString('base64'), 'compressed.jpg');
            await client.sendMessage(uid, resultMedia, {
                caption: `*Foto berhasil dikompres!*\n\n` +
                         `Sebelum : ${(inputSize / 1024).toFixed(1)} KB\n` +
                         `Sesudah : ${(outputSize / 1024).toFixed(1)} KB\n` +
                         `Hemat   : *${saved}%*`
            });
        } catch (err) {
            console.error('Error !kompres:', err);
            msg.reply('Aduh, gagal kompres fotonya. Coba lagi.');
        }

        return true;
    }

        return false;
    };
}

module.exports = {
    createMediaCommandsHandler
};
