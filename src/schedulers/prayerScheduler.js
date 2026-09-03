/*
 * Scheduler reminder sholat per grup.
 * Dipindah dari index.js; data dibaca via dataStore,
 * jadwal sholat via prayerTimes (cache bersama).
 */
const { getTimeContextInZone } = require('../utils/timeContext');
const dataStore = require('../storage/dataStore');
const { getPrayerJadwal } = require('./prayerTimes');

function startPrayerReminder({ client }) {
    console.log('🕌 Prayer reminder scheduler aktif');
    setInterval(async () => {
        if (dataStore.reminders.size === 0) return;

        const { jamMenit, tglKey } = getTimeContextInZone();

        for (const [groupId, info] of dataStore.reminders.entries()) {
            try {
                const jadwal = await getPrayerJadwal(info.kotaId, tglKey);
                if (!jadwal) continue;

                const isPuasaMode = info?.puasaMode === true;

                let pesan = null;
                if (isPuasaMode && jamMenit === jadwal.imsak) pesan = `🔔 *IMSAK* - ${info.lokasi}\n🕐 ${jadwal.imsak}\n\n_Segera akhiri makan sahur! Imsak sudah masuk_ 🌙`;
                else if (jamMenit === jadwal.subuh)  pesan = `🌅 *SUBUH* - ${info.lokasi}\n🕐 ${jadwal.subuh}\n\n_Waktunya sholat Subuh! Jangan sampai ketinggalan_ 🙏`;
                else if (jamMenit === jadwal.dzuhur) pesan = `🌞 *DZUHUR* - ${info.lokasi}\n🕐 ${jadwal.dzuhur}\n\n_Waktunya sholat Dzuhur! Luangkan waktu sebentar_ 🙏`;
                else if (jamMenit === jadwal.ashar)  pesan = `🌇 *ASHAR* - ${info.lokasi}\n🕐 ${jadwal.ashar}\n\n_Waktunya sholat Ashar! Jangan ditunda_ 🙏`;
                else if (jamMenit === jadwal.maghrib) {
                    pesan = isPuasaMode
                        ? `🍽️ *BUKA PUASA & MAGHRIB* - ${info.lokasi}\n🕐 ${jadwal.maghrib}\n\n_Alhamdulillah, waktunya berbuka puasa! Selamat berbuka_ 😊🎉`
                        : `🌆 *MAGHRIB* - ${info.lokasi}\n🕐 ${jadwal.maghrib}\n\n_Waktunya sholat Maghrib_ 🙏`;
                }
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

module.exports = {
    startPrayerReminder
};