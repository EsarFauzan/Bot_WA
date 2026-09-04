const { safeTyping } = require('../utils/safeTyping');

function dayToIndex(value) {
    const raw = String(value || '').trim().toLowerCase();
    const mapping = {
        minggu: 0,
        senin: 1,
        selasa: 2,
        rabu: 3,
        kamis: 4,
        jumat: 5,
        "jum'at": 5,
        sabtu: 6
    };

    if (/^[0-6]$/.test(raw)) return Number(raw);
    return Object.prototype.hasOwnProperty.call(mapping, raw) ? mapping[raw] : null;
}

function isValidTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());
}

function timeToMinutes(value) {
    const [h, m] = String(value).split(':').map(Number);
    return (h * 60) + m;
}

function buildReminderTimeFromStart(mulai) {
    const total = (timeToMinutes(mulai) - 60 + 1440) % 1440;
    const h = String(Math.floor(total / 60)).padStart(2, '0');
    const m = String(total % 60).padStart(2, '0');
    return `${h}:${m}`;
}

function sortJadwalKuliah(jadwalList) {
    jadwalList.sort((a, b) => {
        if (a.hari !== b.hari) return a.hari - b.hari;
        return a.mulai.localeCompare(b.mulai);
    });
}

function buildJadwalText({ JADWAL_KULIAH, NAMA_HARI, hariIdx, statusGrup, includeGuide }) {
    let text = `JADWAL KULIAH ESARFAUZAN\n${statusGrup || ''}\n---------------------\n`;
    let nomor = 1;

    for (let hari = 1; hari <= 6; hari++) {
        const items = JADWAL_KULIAH.filter((j) => j.hari === hari);
        if (items.length === 0) continue;

        const marker = hari === hariIdx ? ' [hari ini]' : '';
        text += `\n${NAMA_HARI[hari]}${marker}\n`;

        for (const item of items) {
            text += `${nomor}. ${item.mulai}-${item.selesai} | ${item.matkul} (reminder ${item.reminder})\n`;
            nomor += 1;
        }
    }

    if (nomor === 1) {
        text += '\nBelum ada jadwal kuliah tersimpan.\n';
    }

    text += '---------------------\nReminder 1 jam sebelum kuliah\n!jadwal on -> aktifkan di grup\n!jadwal off -> nonaktifkan';

    if (includeGuide) {
        text += '\n\nKelola jadwal:\n!jadwal tambah [hari] | [mulai] | [selesai] | [matkul]\n!jadwal ubah [no] | [hari] | [mulai] | [selesai] | [matkul]\n!jadwal hapus [no]\n\nInsight fakta/quotes:\n!jadwal insight on\n!jadwal insight off\n!jadwal insight';
    }

    return text;
}

function createReminderJadwalCommandsHandler(deps) {
    const {
        axios,
        groupReminders,
        saveReminders,
        sholatModes = new Map(),
        groupJadwalInsights = new Map(),
        saveJadwalInsightGroups = () => {},
        groupJadwal,
        saveJadwalGroups,
        saveKuliahSchedule,
        getTimeContextInZone,
        NAMA_HARI,
        JADWAL_KULIAH
    } = deps;

    return async function handleReminderJadwalCommands(ctx) {
        const { cmd, msg } = ctx;

        if (cmd.startsWith('!reminder on')) {
            if (!msg.from.includes('@g.us')) {
                await msg.reply('Fitur ini hanya bisa dipakai di grup');
                return true;
            }

            const kotaNama = msg.body.trim().split(' ').slice(2).join(' ').trim();
            if (!kotaNama) {
                await msg.reply('Cara pakai: *!reminder on [kota]*\nContoh: !reminder on Palu');
                return true;
            }

            try {
                await safeTyping(msg);
                
                const cariRes = await axios.get(`https://api.myquran.com/v2/sholat/kota/cari/${encodeURIComponent(kotaNama)}`);
                const kotaList = cariRes.data?.data;
                if (!kotaList || kotaList.length === 0) {
                    await msg.reply(`Kota "${kotaNama}" tidak ditemukan\nCoba nama kota lain`);
                    return true;
                }

                const kotaData = kotaList[0];
                const isPuasaMode = sholatModes.get(msg.from) === 'puasa';
                groupReminders.set(msg.from, {
                    kota: kotaNama,
                    kotaId: kotaData.id,
                    lokasi: kotaData.lokasi,
                    puasaMode: isPuasaMode
                });
                saveReminders();
                const modeLabel = isPuasaMode ? 'puasa' : 'normal';
                const listJadwal = isPuasaMode
                    ? 'Imsak, Subuh, Dzuhur, Ashar, Buka Puasa, Isya'
                    : 'Subuh, Dzuhur, Ashar, Maghrib, Isya';
                await msg.reply(`Reminder sholat aktif.\nKota: *${kotaData.lokasi}*\nMode: *${modeLabel}*\n\nBot akan kirim reminder otomatis:\n${listJadwal}\n\nNonaktifkan: *!reminder off*\nUbah mode: *!sholat mode puasa* / *!sholat mode normal*`);
            } catch (err) {
                console.error('Error !reminder on:', err.message);
                await msg.reply('Gagal aktifkan reminder, coba lagi.');
            }

            return true;
        }

        if (cmd === '!reminder off') {
            if (!msg.from.includes('@g.us')) {
                await msg.reply('Fitur ini hanya bisa dipakai di grup');
                return true;
            }

            if (!groupReminders.has(msg.from)) {
                await msg.reply('Reminder belum aktif di grup ini');
                return true;
            }

            groupReminders.delete(msg.from);
            saveReminders();
            await msg.reply('Reminder sholat dinonaktifkan di grup ini.');
            return true;
        }

        if (cmd === '!reminder') {
            let status = 'Tidak aktif';
            if (groupReminders.has(msg.from)) {
                const info = groupReminders.get(msg.from);
                const modeLabel = info?.puasaMode === true ? 'puasa' : 'normal';
                status = `Aktif - Kota: *${info.lokasi}*\nMode: *${modeLabel}*`;
            }
            await msg.reply(`Status reminder sholat\n${status}\n\nCara pakai:\n*!reminder on [kota]*\n*!reminder off*`);
            return true;
        }

        if (cmd === '!jadwal on') {
            if (!msg.from.includes('@g.us')) {
                await msg.reply('Fitur ini hanya bisa dipakai di grup');
                return true;
            }

            groupJadwal.set(msg.from, true);
            if (!groupJadwalInsights.has(msg.from)) {
                groupJadwalInsights.set(msg.from, true);
                saveJadwalInsightGroups();
            }
            saveJadwalGroups();
            const jadwalRingkas = buildJadwalText({
                JADWAL_KULIAH,
                NAMA_HARI,
                hariIdx: -1,
                statusGrup: 'Reminder aktif di grup ini\nInsight fakta/quotes: ON',
                includeGuide: false
            });
            await msg.reply(`Reminder jadwal kuliah aktif.\n\n${jadwalRingkas}`);
            return true;
        }

        if (cmd === '!jadwal off') {
            if (!msg.from.includes('@g.us')) {
                await msg.reply('Fitur ini hanya bisa dipakai di grup');
                return true;
            }

            if (!groupJadwal.has(msg.from)) {
                await msg.reply('Reminder jadwal belum aktif di grup ini');
                return true;
            }

            groupJadwal.delete(msg.from);
            saveJadwalGroups();
            await msg.reply('Reminder jadwal kuliah dinonaktifkan di grup ini.');
            return true;
        }

        if (cmd === '!jadwal insight on') {
            if (!msg.from.includes('@g.us')) {
                await msg.reply('Fitur ini hanya bisa dipakai di grup');
                return true;
            }

            groupJadwalInsights.set(msg.from, true);
            saveJadwalInsightGroups();
            await msg.reply('Insight jadwal aktif. Fakta IT dikirim 2 menit sebelum reminder kuliah dan Quotes IT 2 menit setelah reminder.');
            return true;
        }

        if (cmd === '!jadwal insight off') {
            if (!msg.from.includes('@g.us')) {
                await msg.reply('Fitur ini hanya bisa dipakai di grup');
                return true;
            }

            groupJadwalInsights.set(msg.from, false);
            saveJadwalInsightGroups();
            await msg.reply('Insight jadwal dimatikan. Reminder kuliah utama tetap jalan.');
            return true;
        }

        if (cmd === '!jadwal insight' || cmd === '!jadwal insight status') {
            if (!msg.from.includes('@g.us')) {
                await msg.reply('Fitur ini hanya bisa dipakai di grup');
                return true;
            }

            const mode = groupJadwalInsights.get(msg.from) === false ? 'OFF' : 'ON';
            const jadwalStatus = groupJadwal.has(msg.from) ? 'ON' : 'OFF';
            await msg.reply(`Status insight jadwal\nReminder jadwal: ${jadwalStatus}\nInsight fakta/quotes: *${mode}*\n\nPerintah:\n!jadwal insight on\n!jadwal insight off`);
            return true;
        }

        if (cmd.startsWith('!jadwal tambah')) {
            const raw = msg.body.replace(/^!jadwal tambah\s*/i, '').trim();
            const parts = raw.split('|').map((part) => part.trim());

            if (parts.length !== 4 || parts.some((part) => !part)) {
                await msg.reply('Format salah\nContoh: !jadwal tambah Senin | 09:10 | 10:50 | Jaringan Komputer');
                return true;
            }

            const [hariRaw, mulai, selesai, matkul] = parts;
            const hari = dayToIndex(hariRaw);

            if (hari === null) {
                await msg.reply('Hari tidak valid. Pakai nama hari (Senin-Sabtu) atau angka 1-6.');
                return true;
            }
            if (!isValidTime(mulai) || !isValidTime(selesai)) {
                await msg.reply('Format jam tidak valid. Gunakan HH:MM, contoh 09:10');
                return true;
            }
            if (timeToMinutes(selesai) <= timeToMinutes(mulai)) {
                await msg.reply('Jam selesai harus lebih besar dari jam mulai.');
                return true;
            }

            JADWAL_KULIAH.push({
                hari,
                mulai,
                selesai,
                reminder: buildReminderTimeFromStart(mulai),
                matkul
            });
            sortJadwalKuliah(JADWAL_KULIAH);
            saveKuliahSchedule();

            await msg.reply(`Jadwal berhasil ditambah:\n${NAMA_HARI[hari]} ${mulai}-${selesai} | ${matkul}`);
            return true;
        }

        if (cmd.startsWith('!jadwal ubah')) {
            const raw = msg.body.replace(/^!jadwal ubah\s*/i, '').trim();
            const parts = raw.split('|').map((part) => part.trim());

            if (parts.length !== 5 || parts.some((part) => !part)) {
                await msg.reply('Format salah\nContoh: !jadwal ubah 1 | Senin | 09:10 | 10:50 | Jaringan Komputer');
                return true;
            }

            sortJadwalKuliah(JADWAL_KULIAH);
            const nomor = Number(parts[0]);
            if (!Number.isInteger(nomor) || nomor < 1 || nomor > JADWAL_KULIAH.length) {
                await msg.reply(`Nomor jadwal tidak valid. Pilih 1 sampai ${JADWAL_KULIAH.length || 1}.`);
                return true;
            }

            const [_, hariRaw, mulai, selesai, matkul] = parts;
            const hari = dayToIndex(hariRaw);

            if (hari === null) {
                await msg.reply('Hari tidak valid. Pakai nama hari (Senin-Sabtu) atau angka 1-6.');
                return true;
            }
            if (!isValidTime(mulai) || !isValidTime(selesai)) {
                await msg.reply('Format jam tidak valid. Gunakan HH:MM, contoh 09:10');
                return true;
            }
            if (timeToMinutes(selesai) <= timeToMinutes(mulai)) {
                await msg.reply('Jam selesai harus lebih besar dari jam mulai.');
                return true;
            }

            JADWAL_KULIAH[nomor - 1] = {
                hari,
                mulai,
                selesai,
                reminder: buildReminderTimeFromStart(mulai),
                matkul
            };
            sortJadwalKuliah(JADWAL_KULIAH);
            saveKuliahSchedule();

            await msg.reply(`Jadwal nomor ${nomor} berhasil diubah:\n${NAMA_HARI[hari]} ${mulai}-${selesai} | ${matkul}`);
            return true;
        }

        if (cmd.startsWith('!jadwal hapus')) {
            sortJadwalKuliah(JADWAL_KULIAH);
            const match = msg.body.trim().match(/^!jadwal hapus\s+(\d+)$/i);
            if (!match) {
                await msg.reply('Format salah\nContoh: !jadwal hapus 1');
                return true;
            }

            const nomor = Number(match[1]);
            if (!Number.isInteger(nomor) || nomor < 1 || nomor > JADWAL_KULIAH.length) {
                await msg.reply(`Nomor jadwal tidak valid. Pilih 1 sampai ${JADWAL_KULIAH.length || 1}.`);
                return true;
            }

            const removed = JADWAL_KULIAH.splice(nomor - 1, 1)[0];
            saveKuliahSchedule();
            await msg.reply(`Jadwal dihapus:\n${NAMA_HARI[removed.hari]} ${removed.mulai}-${removed.selesai} | ${removed.matkul}`);
            return true;
        }

        if (cmd === '!jadwal') {
            sortJadwalKuliah(JADWAL_KULIAH);
            const { hariIdx } = getTimeContextInZone();
            const insightStatus = msg.from.includes('@g.us')
                ? groupJadwalInsights.get(msg.from) === false
                    ? 'Insight fakta/quotes: OFF (ketik !jadwal insight on)'
                    : 'Insight fakta/quotes: ON'
                : '';
            const statusGrup = msg.from.includes('@g.us')
                ? groupJadwal.has(msg.from)
                    ? 'Reminder aktif di grup ini'
                    : 'Reminder belum aktif (ketik !jadwal on)'
                : '';
            const statusGabung = [statusGrup, insightStatus].filter(Boolean).join('\n');
            const jadwalText = buildJadwalText({
                JADWAL_KULIAH,
                NAMA_HARI,
                hariIdx,
                statusGrup: statusGabung,
                includeGuide: true
            });
            await msg.reply(jadwalText);
            return true;
        }

        return false;
    };
}

module.exports = {
    createReminderJadwalCommandsHandler
};
