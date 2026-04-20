async function handleReminderJadwalCommands(ctx) {
    const {
        cmd,
        msg,
        axios,
        groupReminders,
        saveReminders,
        groupJadwal,
        saveJadwalGroups,
        getTimeContextInZone,
        NAMA_HARI,
        JADWAL_KULIAH
    } = ctx;

    if (cmd.startsWith('!reminder on')) {
        if (!msg.from.includes('@g.us')) {
            await msg.reply('Fitur ini hanya bisa dipakai di grup 😹');
            return true;
        }

        const kotaNama = msg.body.trim().split(' ').slice(2).join(' ').trim();
        if (!kotaNama) {
            await msg.reply('Cara pakai: *!reminder on [kota]*\nContoh: !reminder on Palu');
            return true;
        }

        try {
            const chat = await msg.getChat();
            chat.sendStateTyping();
            const cariRes = await axios.get(`https://api.myquran.com/v2/sholat/kota/cari/${encodeURIComponent(kotaNama)}`);
            const kotaList = cariRes.data?.data;
            if (!kotaList || kotaList.length === 0) {
                await msg.reply(`Kota "${kotaNama}" tidak ditemukan 😹\nCoba nama kota lain jo`);
                return true;
            }

            const kotaData = kotaList[0];
            groupReminders.set(msg.from, {
                kota: kotaNama,
                kotaId: kotaData.id,
                lokasi: kotaData.lokasi
            });
            saveReminders();
            await msg.reply(`✅ *Reminder Sholat Aktif!*\n📍 Kota: *${kotaData.lokasi}*\n\nBot akan kirim reminder otomatis di grup ini setiap:\n🔔 Imsak, 🌅 Subuh, 🌞 Dzuhur, 🌇 Ashar, 🍽️ Buka Puasa, 🌙 Isya\n\nUntuk nonaktifkan: *!reminder off*`);
        } catch (err) {
            console.error('Error !reminder on:', err.message);
            await msg.reply('Aduh gagal aktifkan reminder sy 😹 coba lagi yaa');
        }

        return true;
    }

    if (cmd === '!reminder off') {
        if (!msg.from.includes('@g.us')) {
            await msg.reply('Fitur ini hanya bisa dipakai di grup 😹');
            return true;
        }

        if (!groupReminders.has(msg.from)) {
            await msg.reply('Reminder belum aktif di grup ini 😹');
            return true;
        }

        groupReminders.delete(msg.from);
        saveReminders();
        await msg.reply('❌ *Reminder sholat dinonaktifkan* di grup ini.');
        return true;
    }

    if (cmd === '!reminder') {
        const status = groupReminders.has(msg.from)
            ? `✅ Aktif - Kota: *${groupReminders.get(msg.from).lokasi}*`
            : '❌ Tidak aktif';
        await msg.reply(`🔔 *Status Reminder Sholat*\n${status}\n\nCara pakai:\n*!reminder on [kota]* → aktifkan\n*!reminder off* → nonaktifkan`);
        return true;
    }

    if (cmd === '!jadwal on') {
        if (!msg.from.includes('@g.us')) {
            await msg.reply('Fitur ini hanya bisa dipakai di grup 😹');
            return true;
        }

        groupJadwal.set(msg.from, true);
        saveJadwalGroups();
        await msg.reply(`✅ *Reminder Jadwal Kuliah Aktif!*\n\nBot akan kirim pengingat *1 jam sebelum* kuliah di grup ini setiap:\n\n📅 *Senin*\n• 08:10 → Jaringan Komputer (09:10)\n• 11:40 → Sistem Operasi (12:40)\n\n📅 *Selasa*\n• 06:30 → Keamanan Siber (07:30)\n• 13:20 → Keamanan Sistem Komputer (14:20)\n\n📅 *Rabu*\n• 11:30 → Pengembangan Aplikasi WEB (12:30)\n\n📅 *Kamis*\n• 09:55 → Pemodelan dan Simulasi (10:55)\n• 13:20 → Pengembangan Aplikasi Bergerak (14:20)\n\nUntuk nonaktifkan: *!jadwal off*`);
        return true;
    }

    if (cmd === '!jadwal off') {
        if (!msg.from.includes('@g.us')) {
            await msg.reply('Fitur ini hanya bisa dipakai di grup 😹');
            return true;
        }

        if (!groupJadwal.has(msg.from)) {
            await msg.reply('Reminder jadwal belum aktif di grup ini 😹');
            return true;
        }

        groupJadwal.delete(msg.from);
        saveJadwalGroups();
        await msg.reply('❌ *Reminder jadwal kuliah dinonaktifkan* di grup ini.');
        return true;
    }

    if (cmd === '!jadwal') {
        const { hariIdx } = getTimeContextInZone();
        const statusGrup = msg.from.includes('@g.us')
            ? groupJadwal.has(msg.from)
                ? '✅ Reminder aktif di grup ini'
                : '❌ Reminder belum aktif (ketik !jadwal on)'
            : '';

        let jadwalText = `📚 *Jadwal Kuliah EsarFauzan*\n${statusGrup}\n─────────────────────\n`;
        const hariList = [1, 2, 3, 4];
        for (const hari of hariList) {
            const matkuls = JADWAL_KULIAH.filter((j) => j.hari === hari);
            const marker = hari === hariIdx ? ' ⬅️ *hari ini*' : '';
            jadwalText += `\n📅 *${NAMA_HARI[hari]}*${marker}\n`;
            for (const mk of matkuls) {
                jadwalText += `• ${mk.mulai}–${mk.selesai} | ${mk.matkul}\n`;
            }
        }

        jadwalText += '─────────────────────\n🔔 Reminder 1 jam sebelum kuliah\n!jadwal on → aktifkan di grup\n!jadwal off → nonaktifkan';
        await msg.reply(jadwalText);
        return true;
    }

    return false;
}

module.exports = {
    handleReminderJadwalCommands
};
