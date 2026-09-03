/*
 * Helper ambil jadwal sholat dari API myquran dengan cache per (kotaId, tglKey).
 * Dipakai bersama oleh prayerScheduler dan zikirScheduler agar tidak
 * dobel-fetch ke API untuk kota yang sama di hari yang sama.
 */
const axios = require('axios');

const cache = new Map();

async function getPrayerJadwal(kotaId, tglKey) {
    const cacheKey = `${kotaId}_${tglKey}`;

    if (!cache.has(cacheKey)) {
        try {
            const res = await axios.get(`https://api.myquran.com/v2/sholat/jadwal/${kotaId}/${tglKey}`);
            const jadwal = res.data?.data?.jadwal;
            if (jadwal) {
                cache.set(cacheKey, jadwal);
                // Bersihkan cache hari lain agar tidak menumpuk
                for (const key of cache.keys()) {
                    if (!key.endsWith(tglKey)) cache.delete(key);
                }
            }
        } catch (err) {
            console.error('Error fetch jadwal sholat:', err.message);
        }
    }

    return cache.get(cacheKey) || null;
}

module.exports = {
    getPrayerJadwal
};