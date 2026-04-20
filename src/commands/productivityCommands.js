async function handleProductivityCommands(ctx) {
    const {
        cmd,
        msg,
        uid,
        userTodos,
        saveTodos,
        groupNotes,
        saveNotes,
        LINK_AKADEMIK,
        saveAkademik,
        jadwalUjian,
        saveUjian,
        schedule,
        client
    } = ctx;

    if (cmd === '!todo' || cmd === '!todo list') {
        const list = userTodos.get(uid) || [];
        if (list.length === 0) {
            await msg.reply('📝 To-Do List masih kosong!\n\nTambah tugas dengan:\n*!todo tambah [nama tugas]*\n\nContoh: !todo tambah Beli buku');
            return true;
        }

        let teks = '📝 *TO-DO LIST PRIBADI*\n─────────────────────\n\n';
        list.forEach((t, i) => {
            const status = t.done ? '✅' : '⬜';
            const dicoret = t.done ? '~' : '';
            teks += `${status} *${i + 1}.* ${dicoret}${t.task}${dicoret}\n`;
        });
        teks += '\n─────────────────────\n';
        teks += '_Tambah: !todo tambah [tugas]_\n';
        teks += '_Selesai: !todo coret [nomor]_\n';
        teks += '_Hapus: !todo hapus [nomor]_';
        await msg.reply(teks);
        return true;
    }

    if (cmd.startsWith('!todo tambah ')) {
        const task = msg.body.trim().slice(13).trim();
        if (!task) {
            await msg.reply('Cara pakai: *!todo tambah [nama tugas]*\nContoh: !todo tambah Beli buku');
            return true;
        }

        const list = userTodos.get(uid) || [];
        list.push({ task, done: false });
        userTodos.set(uid, list);
        saveTodos();
        await msg.reply(`✅ Tugas ditambahkan ke To-Do List:\n_"${task}"_`);
        return true;
    }

    if (cmd.startsWith('!todo coret ') || cmd.startsWith('!todo selesai ')) {
        const arg = msg.body.trim().replace(/^!todo (coret|selesai) /i, '').trim();
        if (!arg) {
            await msg.reply('Cara pakai: *!todo coret [nomor]*\nPisahkan dengan koma atau spasi untuk banyak nomor.');
            return true;
        }

        const list = userTodos.get(uid) || [];
        const nosMatch = arg.match(/\d+/g);
        if (!nosMatch || nosMatch.length === 0) {
            await msg.reply('Masukkan minimal satu nomor tugas.');
            return true;
        }

        let doneTasks = [];
        let notFound = [];
        let alreadyDone = [];
        const nos = [...new Set(nosMatch.map(Number))];

        nos.forEach((no) => {
            if (no < 1 || no > list.length) {
                notFound.push(no);
            } else {
                const target = list[no - 1];
                if (target.done) {
                    alreadyDone.push(no);
                } else {
                    target.done = true;
                    doneTasks.push(target.task);
                }
            }
        });

        userTodos.set(uid, list);
        saveTodos();

        let reply = '';
        if (doneTasks.length > 0) reply += `🎉 Mantap! Tugas selesai:\n${doneTasks.map((t) => `~_${t}_~`).join('\n')}\n\n`;
        if (alreadyDone.length > 0) reply += `✅ Tugas ini sudah diselesaikan sebelumnya: ${alreadyDone.join(', ')}\n`;
        if (notFound.length > 0) reply += `😹 Tugas ini tidak ditemukan: ${notFound.join(', ')}`;

        await msg.reply(reply.trim());
        return true;
    }

    if (cmd.startsWith('!todo hapus ')) {
        const arg = msg.body.trim().replace(/^!todo hapus /i, '').trim();
        if (!arg) {
            await msg.reply('Cara pakai: *!todo hapus [nomor]*\nPisahkan dengan koma atau spasi untuk banyak nomor.');
            return true;
        }

        const list = userTodos.get(uid) || [];
        const nosMatch = arg.match(/\d+/g);
        if (!nosMatch || nosMatch.length === 0) {
            await msg.reply('Masukkan minimal satu nomor tugas.');
            return true;
        }

        const nos = [...new Set(nosMatch.map(Number))];
        let deletedTasks = [];
        let notFound = [];

        nos.forEach((no) => {
            if (no < 1 || no > list.length) notFound.push(no);
        });

        const validNos = nos.filter((no) => no >= 1 && no <= list.length).sort((a, b) => b - a);
        validNos.forEach((no) => {
            const target = list[no - 1];
            deletedTasks.push(target.task);
            list.splice(no - 1, 1);
        });
        deletedTasks.reverse();

        userTodos.set(uid, list);
        saveTodos();

        let reply = '';
        if (deletedTasks.length > 0) reply += `🗑️ Tugas dihapus:\n${deletedTasks.map((t) => `_"${t}"_`).join('\n')}\n\n`;
        if (notFound.length > 0) reply += `😹 Tugas ini tidak ditemukan: ${notFound.join(', ')}`;

        await msg.reply(reply.trim());
        return true;
    }

    if (cmd.startsWith('!catat ')) {
        const isi = msg.body.trim().slice(7).trim();
        if (!isi) {
            await msg.reply('Cara pakai: *!catat [isi catatan]*\nContoh: !catat Kumpul tugas PAW hari Jumat');
            return true;
        }
        const contact = await msg.getContact();
        const by = contact.pushname || contact.number;
        const notes = groupNotes.get(uid) || [];
        const id = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
        notes.push({ id, isi, by, ts: new Date().toISOString() });
        groupNotes.set(uid, notes);
        saveNotes();
        await msg.reply(`✅ Catatan *#${id}* tersimpan 📝`);
        return true;
    }

    if (cmd === '!notes' || cmd === '!catatan') {
        const notes = groupNotes.get(uid) || [];
        if (notes.length === 0) {
            await msg.reply('Belum ada catatan 😹\nTambah pakai: *!catat [isi]*');
            return true;
        }
        let teks = '📝 *Catatan*\n─────────────────────\n';
        for (const n of notes) {
            const tgl = new Date(n.ts).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            teks += `*${n.id}.* ${n.isi}\n_oleh ${n.by} • ${tgl}_\n\n`;
        }
        teks += '_Hapus: *!hapus note [nomor]*_';
        await msg.reply(teks.trim());
        return true;
    }

    if (cmd.startsWith('!hapus note ')) {
        const noStr = msg.body.trim().split(' ').pop();
        const no = parseInt(noStr);
        if (isNaN(no)) {
            await msg.reply('Cara pakai: *!hapus note [nomor]*\nContoh: !hapus note 1');
            return true;
        }
        const notes = groupNotes.get(uid) || [];
        const idx = notes.findIndex((n) => n.id === no);
        if (idx === -1) {
            await msg.reply(`Catatan #${no} tidak ditemukan 😹`);
            return true;
        }
        notes.splice(idx, 1);
        groupNotes.set(uid, notes);
        saveNotes();
        await msg.reply(`❌ Catatan *#${no}* dihapus.`);
        return true;
    }

    if (cmd.startsWith('!akademik tambah ')) {
        const raw = msg.body.trim().slice(17).trim();
        const parts = raw.split('|').map((s) => s.trim());
        if (parts.length < 3) {
            await msg.reply('Format salah 😹\nCara pakai: *!akademik tambah [nama] | [deskripsi] | [url]*\nContoh:\n!akademik tambah SIGA | Link SIGA Untad | https://siga.com');
            return true;
        }
        const [nama, label, url] = parts;
        if (!url.startsWith('http')) {
            await msg.reply('URL harus diawali http:// atau https:// 😹');
            return true;
        }
        const id = LINK_AKADEMIK.length > 0 ? Math.max(...LINK_AKADEMIK.map((l) => l.id)) + 1 : 1;
        LINK_AKADEMIK.push({ id, nama, label, url });
        saveAkademik();
        await msg.reply(`✅ Link *${nama}* berhasil ditambahkan!\n🔗 ${url}`);
        return true;
    }

    if (cmd === '!akademik tambah') {
        await msg.reply('Cara pakai: *!akademik tambah [nama] | [deskripsi] | [url]*\nContoh:\n!akademik tambah SIGA | Link SIGA Untad | https://siga.com');
        return true;
    }

    if (cmd.startsWith('!akademik hapus ')) {
        const query = msg.body.trim().slice(16).trim();
        const no = parseInt(query);
        let idx = -1;
        if (!isNaN(no)) {
            idx = LINK_AKADEMIK.findIndex((l) => l.id === no);
        } else {
            idx = LINK_AKADEMIK.findIndex((l) => l.nama.toLowerCase().includes(query.toLowerCase()));
        }
        if (idx === -1) {
            await msg.reply(`Link "${query}" tidak ditemukan 😹\nLihat nomor di *!akademik*`);
            return true;
        }
        const nama = LINK_AKADEMIK[idx].nama;
        LINK_AKADEMIK.splice(idx, 1);
        saveAkademik();
        await msg.reply(`❌ Link *${nama}* dihapus.`);
        return true;
    }

    if (cmd.startsWith('!akademik')) {
        const keyword = msg.body.trim().slice(9).trim().toLowerCase();
        if (!keyword) {
            let teks = '🎓 *Link Akademik*\n─────────────────────\n';
            for (const l of LINK_AKADEMIK) {
                teks += `*${l.id || ''}* 🔗 *${l.nama}*\n${l.label}\n${l.url}\n\n`;
            }
            teks += '_Tambah: !akademik tambah [nama] | [desk] | [url]_\n_Hapus: !akademik hapus [no/nama]_';
            await msg.reply(teks.trim());
            return true;
        }
        const found = LINK_AKADEMIK.find((l) => l.nama.toLowerCase().includes(keyword) || l.label.toLowerCase().includes(keyword));
        if (!found) {
            await msg.reply(`Link "${keyword}" tidak ditemukan 😹\nKetik *!akademik* untuk lihat semua link`);
            return true;
        }
        await msg.reply(`🔗 *${found.nama}*\n${found.label}\n\n${found.url}`);
        return true;
    }

    if (cmd === '!ujian') {
        if (jadwalUjian.length === 0) {
            await msg.reply('Belum ada jadwal ujian 😹\nTambah pakai:\n*!ujian tambah [nama matkul] | [DD-MM-YYYY]*\nContoh: !ujian tambah UTS Jaringan Komputer | 10-03-2026');
            return true;
        }
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        let teks = '📝 *Jadwal Ujian*\n─────────────────────\n';
        const sorted = [...jadwalUjian].sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
        for (const u of sorted) {
            const tgl = new Date(u.tanggal);
            tgl.setHours(0, 0, 0, 0);
            const selisih = Math.round((tgl - now) / (1000 * 60 * 60 * 24));
            let countdown;
            if (selisih < 0) countdown = '_sudah lewat_';
            else if (selisih === 0) countdown = '🔴 *HARI INI!*';
            else if (selisih === 1) countdown = '🟠 *Besok!*';
            else if (selisih <= 7) countdown = `⚠️ ${selisih} hari lagi`;
            else countdown = `${selisih} hari lagi`;
            const tglStr = tgl.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
            teks += `📖 *${u.nama}*\n📅 ${tglStr}\n⏳ ${countdown}\n\n`;
        }
        teks += '_Tambah: !ujian tambah [nama] | [DD-MM-YYYY]_\n_Hapus: !ujian hapus [nomor]_';
        await msg.reply(teks.trim());
        return true;
    }

    if (cmd.startsWith('!ingatkan ')) {
        const input = msg.body.trim().slice(10).trim();
        if (!input.includes('|')) {
            await msg.reply('Gunakan format yang benar:\n*!ingatkan [waktu] | [pesan]*\n\nContoh:\n*!ingatkan 15 menit | Buka puasa*\n*!ingatkan 2 jam | Minum obat*\n*!ingatkan besok 08:00 | Meeting dengan tim IT*');
            return true;
        }

        const parts = input.split('|');
        const waktuStr = parts[0].trim().toLowerCase();
        const pesanIsi = parts[1].trim();

        let targetTime = new Date();

        try {
            if (waktuStr.includes('menit')) {
                const menit = parseInt(waktuStr.replace(/[^0-9]/g, ''));
                if (isNaN(menit)) throw new Error('Waktu tidak valid');
                targetTime.setMinutes(targetTime.getMinutes() + menit);
            } else if (waktuStr.includes('detik')) {
                const detik = parseInt(waktuStr.replace(/[^0-9]/g, ''));
                if (isNaN(detik)) throw new Error('Waktu tidak valid');
                targetTime.setSeconds(targetTime.getSeconds() + detik);
            } else if (waktuStr.includes('jam') && !waktuStr.includes('besok')) {
                const jam = parseInt(waktuStr.replace(/[^0-9]/g, ''));
                if (isNaN(jam)) throw new Error('Waktu tidak valid');
                targetTime.setHours(targetTime.getHours() + jam);
            } else if (waktuStr.includes('besok')) {
                const clockPattern = waktuStr.match(/(\d{1,2})[.:](\d{2})/);
                if (clockPattern) {
                    targetTime.setDate(targetTime.getDate() + 1);
                    targetTime.setHours(parseInt(clockPattern[1]), parseInt(clockPattern[2]), 0);
                } else {
                    targetTime.setDate(targetTime.getDate() + 1);
                }
            } else {
                await msg.reply('Format waktu belum didukung.\nGunakan kata *"menit"*, *"jam"*, atau *"besok 08:00"*');
                return true;
            }

            const formatter = new Intl.DateTimeFormat('id-ID', {
                dateStyle: 'full',
                timeStyle: 'medium'
            });

            schedule.scheduleJob(targetTime, async function () {
                try {
                    await client.sendMessage(msg.from, `⏰ *PENGINGAT / ALARM* ⏰\n\nHalo!\nKamu memintaku untuk mengingatkan pesan ini:\n\n💬 _"${pesanIsi}"_`);
                } catch (e) {}
            });

            await msg.reply(`✅ *Alarm disetel!*\n\nBot akan mengingatkanmu:\n_"${pesanIsi}"_\n\nPada: *${formatter.format(targetTime)}*`);
        } catch (e) {
            await msg.reply('Gagal mengatur alarm, pastikan format waktunya ada angkanya ya. 😹');
        }

        return true;
    }

    if (cmd.startsWith('!ujian tambah ')) {
        const raw = msg.body.trim().slice(14).trim();
        const parts = raw.split('|');
        if (parts.length < 2) {
            await msg.reply('Format salah 😹\nCara pakai: *!ujian tambah [nama] | [DD-MM-YYYY]*\nContoh: !ujian tambah UTS Jaringan Komputer | 10-03-2026');
            return true;
        }
        const nama = parts[0].trim();
        const tglRaw = parts[1].trim();
        const [d, m, y] = tglRaw.split('-');
        const tanggal = `${y}-${m}-${d}`;
        if (isNaN(new Date(tanggal).getTime())) {
            await msg.reply('Format tanggal salah! Gunakan DD-MM-YYYY\nContoh: 10-03-2026');
            return true;
        }
        const id = jadwalUjian.length > 0 ? Math.max(...jadwalUjian.map((u) => u.id)) + 1 : 1;
        jadwalUjian.push({ id, nama, tanggal });
        saveUjian();
        const tglFmt = new Date(tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        await msg.reply(`✅ Jadwal ujian *${nama}* ditambahkan!\n📅 ${tglFmt}`);
        return true;
    }

    if (cmd.startsWith('!ujian hapus ')) {
        const noStr = msg.body.trim().split(' ').pop();
        const no = parseInt(noStr);
        if (isNaN(no)) {
            await msg.reply('Cara pakai: *!ujian hapus [nomor]*\nLihat nomor di *!ujian*');
            return true;
        }
        const idx = jadwalUjian.findIndex((u) => u.id === no);
        if (idx === -1) {
            await msg.reply(`Ujian #${no} tidak ditemukan 😹`);
            return true;
        }
        const nama = jadwalUjian[idx].nama;
        jadwalUjian.splice(idx, 1);
        saveUjian();
        await msg.reply(`❌ Jadwal ujian *${nama}* dihapus.`);
        return true;
    }

    return false;
}

module.exports = {
    handleProductivityCommands
};
