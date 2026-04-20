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
        upscaleImage
    } = deps;

    return async function handleMediaCommands(ctx) {
        const { cmd, msg, uid } = ctx;

    if (cmd === '!stiker') {
        if (msg.hasMedia) {
            try {
                const chat = await msg.getChat();
                chat.sendStateTyping();
                const stikerMedia = await buatStiker(msg);
                if (stikerMedia) {
                    await kirimStiker(client, msg.from, msg, stikerMedia);
                } else {
                    msg.reply('Aiih gagal nih, coba lagi yaa 😹');
                }
            } catch (e) {
                console.error('Error stiker:', e.message);
                msg.reply('Gagal sy buat stikernya 😹');
            }
        } else if (msg.hasQuotedMsg) {
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
                    msg.reply('Reply-nya bukan foto/GIF/video. Coba reply media dulu 😹');
                }
            } catch (e) {
                console.error('Error stiker:', e.message);
                msg.reply('Gagal sy buat stikernya 😹');
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
            await msg.reply('Cara pakai: Reply ke video dokumen yang mau dijadiin story, atau kirim langsung video/dokumen dgn caption *!storyin* 🤭');
            return true;
        }

        try {
            const tipe = targetMsg.type;
            const mime = targetMsg._data?.mimetype || '';
            const filename = targetMsg._data?.filename || '';
            const isVideoDoc = tipe === 'video' || tipe === 'document' ||
                mime.startsWith('video/') || /\.(mp4|mkv|mov|avi|3gp|webm)$/i.test(filename);

            if (!isVideoDoc) {
                await msg.reply('Nda bisa yaa, harus video atau dokumen video 😹');
                return true;
            }

            const fileSize = targetMsg._data?.size || targetMsg._data?.fileSizeBytes || 0;
            if (fileSize > 50 * 1024 * 1024) {
                await msg.reply('Maaf ee, videonya kegedean 😹 Maks 50MB yaa.\nKalo mau, kompres dlu di aplikasi lain baru kirim lagi.');
                return true;
            }

            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply('Oke bentar sy optimize videonya dulu 🤭 sabar yaa...');

            const media = await targetMsg.downloadMedia();
            if (!media) {
                await msg.reply('Gagal download videonya 😹 coba lagi yaa');
                return true;
            }

            const os = require('os');
            const ts = Date.now();
            const tmpIn = path.join(os.tmpdir(), `sv_in_${ts}.mp4`);
            const tmpOut = path.join(os.tmpdir(), `sv_out_${ts}.mp4`);
            fs.writeFileSync(tmpIn, Buffer.from(media.data, 'base64'));

            try {
                await optimizeVideo(tmpIn, tmpOut);
                const outputBuffer = fs.readFileSync(tmpOut);
                const optimizedMedia = new MessageMedia('video/mp4', outputBuffer.toString('base64'), 'video.mp4');

                await msg.reply('Nih videonya 🤭 kualitas tinggi, tinggal download trus upload ke story!');
                await client.sendMessage(uid, optimizedMedia, {
                    sendMediaAsDocument: false
                });
            } finally {
                if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
                if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
            }
        } catch (err) {
            console.error('Error !storyin:', err.message);
            msg.reply('Aduh error sy 😹 coba lagi yaa');
        }

        return true;
    }

    if (cmd.startsWith('!ig ')) {
        const link = msg.body.trim().split(' ').slice(1).join('').trim();
        if (!link || !link.includes('instagram.com')) {
            await msg.reply('Format salah 😹\nCara pakai: *!ig [link reels/post IG]*\nContoh:\n!ig https://www.instagram.com/reels/xxxxx/');
            return true;
        }
        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply('Oke bentar sy download dulu reelsnya 🤭 sabar yaa...');

            const buffer = await downloadIGVideo(link);
            if (!buffer) {
                await msg.reply('Aiih gagal download sy 😹\nCek lagi linknya:\n1. Link bener & publik\n2. Akun IG tidak private\nCoba lagi yaa!');
                return true;
            }

            const ts = Date.now();
            const tmpIn = path.join(__dirname, `../../ig_in_${ts}.mp4`);
            const tmpOut = path.join(__dirname, `../../ig_out_${ts}.mp4`);
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

        return true;
    }

    if (cmd === '!ig') {
        msg.reply('Cara pakai: *!ig [link]*\n\nContoh:\n!ig https://www.instagram.com/reels/xxxxx/');
        return true;
    }

    if (cmd.startsWith('!tiktok ')) {
        const link = msg.body.trim().split(' ').slice(1).join('').trim();
        if (!link || !link.includes('tiktok.com')) {
            await msg.reply('Format salah 😹\nCara pakai: *!tiktok [link TikTok]*\nContoh:\n!tiktok https://www.tiktok.com/@user/video/xxxx');
            return true;
        }
        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply('Oke bentar sy download dulu TikToknya 🤭 sabar yaa...');

            const buffer = await downloadTikTokVideo(link);
            if (!buffer) {
                await msg.reply('Aiih gagal download sy 😹\nCek lagi linknya:\n1. Link harus publik\n2. Bukan live\nCoba lagi yaa!');
                return true;
            }

            const ts = Date.now();
            const tmpIn = path.join(__dirname, `../../tt_in_${ts}.mp4`);
            const tmpOut = path.join(__dirname, `../../tt_out_${ts}.mp4`);
            fs.writeFileSync(tmpIn, buffer);

            try {
                await optimizeVideo(tmpIn, tmpOut);
                const outputBuffer = fs.readFileSync(tmpOut);
                const videoMedia = new MessageMedia('video/mp4', outputBuffer.toString('base64'), 'tiktok.mp4');
                await msg.reply('Nih videonya 🤭 kualitas HD!');
                await client.sendMessage(uid, videoMedia, {
                    sendMediaAsDocument: false
                });
            } finally {
                if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
                if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
            }
        } catch (err) {
            console.error('Error !tiktok:', err.message);
            msg.reply('Aduh error sy 😹 coba lagi yaa');
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
            await msg.reply('Format salah 😹\nCara pakai:\n*!yt [link]* → download video\n*!yt audio [link]* → download MP3\n\nContoh:\n!yt https://youtu.be/xxxxx\n!yt audio https://youtu.be/xxxxx');
            return true;
        }
        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply(`Oke bentar sy download dulu ${audioOnly ? 'audionya' : 'videonya'} 🤭 sabar yaa...`);

            const buffer = await downloadYouTubeVideo(link, audioOnly);
            if (!buffer) {
                await msg.reply('Aiih gagal download sy 😹\nCek lagi:\n1. Link YouTube valid\n2. Video tidak private\n3. Coba link pendek (youtu.be)\nCoba lagi yaa!');
                return true;
            }

            if (audioOnly) {
                const audioMedia = new MessageMedia('audio/mpeg', buffer.toString('base64'), 'audio.mp3');
                await client.sendMessage(uid, audioMedia, {
                    sendMediaAsDocument: true,
                    caption: 'Nih MP3nya 🎵'
                });
            } else {
                const ts = Date.now();
                const tmpIn = path.join(__dirname, `../../yt_in_${ts}.mp4`);
                const tmpOut = path.join(__dirname, `../../yt_out_${ts}.mp4`);
                fs.writeFileSync(tmpIn, buffer);

                try {
                    await optimizeVideo(tmpIn, tmpOut);
                    const outputBuffer = fs.readFileSync(tmpOut);
                    const videoMedia = new MessageMedia('video/mp4', outputBuffer.toString('base64'), 'youtube.mp4');

                    await msg.reply('Nih videonya 🤭 kualitas HD!');
                    await client.sendMessage(uid, videoMedia, {
                        sendMediaAsDocument: false
                    });
                } finally {
                    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
                    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
                }
            }
        } catch (err) {
            console.error('Error !yt:', err.message);
            msg.reply('Aduh error sy 😹 coba lagi yaa');
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
            await msg.reply('API key Clipdrop belum diset 😹');
            return true;
        }

        let targetMsg = null;

        if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted.hasMedia && (quoted.type === 'image' || quoted.type === 'sticker')) {
                    targetMsg = quoted;
                } else {
                    await msg.reply('Reply-nya harus gambar atau stiker yaa 😹');
                    return true;
                }
            } catch (e) {
                await msg.reply('Gagal baca pesan yang di-reply 😹');
                return true;
            }
        } else if (msg.hasMedia && (msg.type === 'image' || msg.type === 'sticker')) {
            targetMsg = msg;
        } else {
            await msg.reply('Cara pakai:\n• Kirim foto + caption *!rmbg*\n• Atau *reply foto/stiker* dengan *!rmbg*\n\n_Hasil dikirim sebagai stiker transparan_ 🎨\n_Gratis 100 gambar/bulan_');
            return true;
        }

        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply('Bentar sy hapus backgroundnya dulu 🤭 sabar yaa...');

            const media = await targetMsg.downloadMedia();
            if (!media) {
                await msg.reply('Gagal download gambarnya 😹 coba jo lagi nanti');
                return true;
            }

            const imageBuffer = Buffer.from(media.data, 'base64');
            const pngInput = await sharp(imageBuffer)
                .ensureAlpha()
                .flatten({ background: { r: 255, g: 0, b: 255 } })
                .png()
                .toBuffer();

            const resultBuffer = await removeBackground(pngInput);
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
            await msg.reply('Background udah dihapus 🎨 dikirim sebagai *stiker* biar transparan!');
        } catch (err) {
            const status = err.response?.status;
            const errBody = err.response?.data ? Buffer.from(err.response.data).toString() : '';
            console.error('Error !rmbg:', status, err.message, errBody);
            if (status === 402) {
                msg.reply('Kuota Clipdrop habis 😹 Gratis hanya 100 gambar/bulan');
            } else if (status === 400) {
                msg.reply('Gambarnya tidak bisa diproses 😹 Coba gambar lain yaa');
            } else if (status === 401) {
                msg.reply('API key Clipdrop tidak valid 😹');
            } else {
                msg.reply(`Aduh error sy 😹 (${status || 'unknown'}) coba lagi nanti`);
            }
        }

        return true;
    }

    if (cmd === '!upscale') {
        const apiKey = process.env.CLIPDROP_API_KEY;
        if (!apiKey) {
            await msg.reply('API key Clipdrop belum diset 😹');
            return true;
        }

        let targetMsg = null;

        if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted.hasMedia && quoted.type === 'image') {
                    targetMsg = quoted;
                } else {
                    await msg.reply('Reply-nya harus gambar yaa 😹');
                    return true;
                }
            } catch (e) {
                await msg.reply('Gagal baca pesan yang di-reply 😹');
                return true;
            }
        } else if (msg.hasMedia && msg.type === 'image') {
            targetMsg = msg;
        } else {
            await msg.reply('Cara pakai:\n• Kirim foto + caption *!upscale*\n• Atau *reply foto* dengan *!upscale*\n\n_Foto akan diperbesar kualitasnya hingga 4x resolusi asli_ 🔍');
            return true;
        }

        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply('Bentar sy upscale dulu fotonya 🤭 sabar yaa...');

            const media = await targetMsg.downloadMedia();
            if (!media) {
                await msg.reply('Gagal download gambarnya 😹 coba lagi yaa');
                return true;
            }

            const imageBuffer = Buffer.from(media.data, 'base64');
            const pngBuffer = await sharp(imageBuffer).png().toBuffer();
            const resultBuffer = await upscaleImage(pngBuffer);

            const resultMedia = new MessageMedia('image/png', resultBuffer.toString('base64'), 'upscaled.png');
            await msg.reply('Nih fotonya 🔍 kualitas udah ditingkatkan, rasio tetap sama!');
            await client.sendMessage(uid, resultMedia);
        } catch (err) {
            const status = err.response?.status;
            const errBody = err.response?.data ? Buffer.from(err.response.data).toString() : '';
            console.error('Error !upscale:', status, err.message, errBody);
            if (status === 402) {
                msg.reply('Kuota Clipdrop habis 😹 Gratis hanya 100 upscale/bulan');
            } else if (status === 400) {
                msg.reply('Gambarnya tidak bisa diproses 😹\nPastikan:\n• Format JPG/PNG\n• Ukuran maks 16MB\nCoba gambar lain jo');
            } else if (status === 401) {
                msg.reply('API key Clipdrop tidak valid 😹');
            } else {
                msg.reply(`Aduh error sy 😹 (${status || 'unknown'}) coba lagi yaa`);
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
                await msg.reply('API key ImgBB belum diset 😹\nTambah IMGBB_API_KEY di file .env');
                return true;
            }

            try {
                const QRCode = require('qrcode');
                const chat = await msg.getChat();
                chat.sendStateTyping();
                await msg.reply('Bentar sy upload gambarnya dulu baru buat QR-nya 🤭 sabar jo...');

                const media = await targetMsg.downloadMedia();
                if (!media) {
                    await msg.reply('Gagal download gambarnya 😹 coba lagi jo');
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
                    await msg.reply('Gagal upload gambarnya 😹 coba lagi jo');
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
                    caption: '✅ *QR Code gambar berhasil dibuat!*\n\nScan QR-nya → gambar langsung muncul 🖼️'
                });
            } catch (err) {
                console.error('Error !qr gambar:', err.message);
                msg.reply('Aduh gagal buat QR dari gambar ee 😹 coba lagi jo');
            }
        } else {
            msg.reply('Cara pakai:\n• *!qr [teks/link]* → Buat QR dari teks/link\n• Kirim/reply foto + *!qr* → Buat QR dari gambar 🖼️\n\nContoh:\n!qr https://google.com\n!qr Halo Dunia');
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
                    await msg.reply('Reply-nya harus gambar ee 😹');
                    return true;
                }
            } catch (e) {
                await msg.reply('Gagal baca pesan yang di-reply 😹');
                return true;
            }
        } else if (msg.hasMedia && msg.type === 'image') {
            targetMsg = msg;
        } else {
            await msg.reply('Cara pakai:\n• Kirim foto + caption *!kompres*\n• Atau *reply foto* dengan *!kompres*\n\n_Ukuran foto akan dikecilkan_ 📦');
            return true;
        }

        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            await msg.reply('Bentar sy kompres dulu fotonya ee 🤭 sabar jo...');

            const media = await targetMsg.downloadMedia();
            if (!media) {
                await msg.reply('Gagal download gambarnya 😹 coba lagi jo');
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
                caption: `📦 *Foto berhasil dikompres!*\n\n` +
                         `Sebelum : ${(inputSize / 1024).toFixed(1)} KB\n` +
                         `Sesudah : ${(outputSize / 1024).toFixed(1)} KB\n` +
                         `Hemat   : *${saved}%* 🎉`
            });
        } catch (err) {
            console.error('Error !kompres:', err.message);
            msg.reply('Aduh gagal kompres fotonya ee 😹 coba lagi jo');
        }

        return true;
    }

        return false;
    };
}

module.exports = {
    createMediaCommandsHandler
};
