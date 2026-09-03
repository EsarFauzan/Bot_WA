/*
 * Scheduler reminder jadwal kuliah + insight (fakta & quotes IT).
 * Dipindah dari index.js; data dibaca via dataStore,
 * jadwal kuliah via jadwalKuliahStore (array live yang sama dengan command !jadwal).
 */
const { getTimeContextInZone } = require('../utils/timeContext');
const dataStore = require('../storage/dataStore');
const { JADWAL_KULIAH, NAMA_HARI } = require('../storage/jadwalKuliahStore');
const { addMinutesToTime } = require('../utils/timeHelpers');
const { buildITQuoteMessage, buildLatestITFactMessage } = require('../messages/itContent');

function ensureJadwalInsightStateForDate(tglKey) {
    const state = dataStore.jadwalInsightState;
    if (state.tglKey === tglKey && Array.isArray(state.sentKeys)) {
        return;
    }

    state.tglKey = tglKey;
    state.sentKeys = [];
    dataStore.persist('jadwalInsightState');
}

function startJadwalReminder({ client }) {
    console.log('📚 Jadwal kuliah reminder scheduler aktif');
    setInterval(async () => {
        if (dataStore.jadwal.size === 0) return;

        const { hariIdx: hari, jamMenit, tglKey } = getTimeContextInZone();
        ensureJadwalInsightStateForDate(tglKey);
        let stateChanged = false;

        for (const jadwal of JADWAL_KULIAH) {
            if (jadwal.hari !== hari) continue;

            const reminderTime = jadwal.reminder;
            const factTime = addMinutesToTime(reminderTime, -2);
            const quoteTime = addMinutesToTime(reminderTime, 2);
            if (![factTime, reminderTime, quoteTime].includes(jamMenit)) continue;

            const eventBase = `${jadwal.hari}:${jadwal.reminder}:${jadwal.mulai}:${jadwal.matkul}`;
            const groupIds = Array.from(dataStore.jadwal.keys());
            const insightGroupIds = groupIds.filter((groupId) => dataStore.jadwalInsight.get(groupId) !== false);

            if (jamMenit === factTime) {
                const targetGroups = insightGroupIds.filter((groupId) => !dataStore.jadwalInsightState.sentKeys.includes(`fact:${groupId}:${eventBase}`));
                if (targetGroups.length > 0) {
                    const factText = await buildLatestITFactMessage();
                    const message = `🧠 *FAKTA IT - 2 MENIT SEBELUM REMINDER KULIAH*\n📚 Mata Kuliah: *${jadwal.matkul}*\n\n${factText}`;

                    for (const groupId of targetGroups) {
                        try {
                            await client.sendMessage(groupId, message);
                            dataStore.jadwalInsightState.sentKeys.push(`fact:${groupId}:${eventBase}`);
                            stateChanged = true;
                            console.log(`💡 Fakta IT terkirim ke ${groupId}: ${jadwal.matkul}`);
                        } catch (err) {
                            console.error(`Error kirim fakta IT ke ${groupId}:`, err.message);
                        }
                    }
                }
            }

            if (jamMenit === reminderTime) {
                const targetGroups = groupIds.filter((groupId) => !dataStore.jadwalInsightState.sentKeys.includes(`reminder:${groupId}:${eventBase}`));
                if (targetGroups.length > 0) {
                    const pesan = `📚 *REMINDER KULIAH* - 1 jam lagi!
─────────────────────
📖 Mata Kuliah : *${jadwal.matkul}*
🕑 Mulai       : *${jadwal.mulai} WITA*
⏱️ Selesai    : *${jadwal.selesai} WITA*
📅 Hari       : *${NAMA_HARI[jadwal.hari]}*
─────────────────────
_Jangan telat masuk kelas nya! 🙏_`;

                    for (const groupId of targetGroups) {
                        try {
                            await client.sendMessage(groupId, pesan);
                            dataStore.jadwalInsightState.sentKeys.push(`reminder:${groupId}:${eventBase}`);
                            stateChanged = true;
                            console.log(`📚 Reminder kuliah terkirim ke ${groupId}: ${jadwal.matkul}`);
                        } catch (err) {
                            console.error(`Error kirim reminder kuliah ke ${groupId}:`, err.message);
                        }
                    }
                }
            }

            if (jamMenit === quoteTime) {
                const targetGroups = insightGroupIds.filter((groupId) => !dataStore.jadwalInsightState.sentKeys.includes(`quote:${groupId}:${eventBase}`));
                if (targetGroups.length > 0) {
                    const quoteText = buildITQuoteMessage();
                    const message = `✨ *QUOTES IT - 2 MENIT SETELAH REMINDER KULIAH*\n📚 Mata Kuliah: *${jadwal.matkul}*\n\n${quoteText}`;

                    for (const groupId of targetGroups) {
                        try {
                            await client.sendMessage(groupId, message);
                            dataStore.jadwalInsightState.sentKeys.push(`quote:${groupId}:${eventBase}`);
                            stateChanged = true;
                            console.log(`✨ Quotes IT terkirim ke ${groupId}: ${jadwal.matkul}`);
                        } catch (err) {
                            console.error(`Error kirim quotes IT ke ${groupId}:`, err.message);
                        }
                    }
                }
            }
        }

        if (stateChanged) {
            dataStore.persist('jadwalInsightState');
        }
    }, 60 * 1000);
}

module.exports = {
    startJadwalReminder
};