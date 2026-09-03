/*
 * Scheduler auto zikir (jadwal tetap + random pasca sholat).
 * Dipindah dari index.js; data dibaca via dataStore,
 * jadwal sholat via prayerTimes (cache bersama).
 */
const { getTimeContextInZone } = require('../utils/timeContext');
const dataStore = require('../storage/dataStore');
const { getPrayerJadwal } = require('./prayerTimes');
const { addMinutesToTime } = require('../utils/timeHelpers');
const { buildZikirMessageByType, buildRandomZikirMessage } = require('../commands/utilityCommands');

function ensureZikirStateForDate(tglKey) {
    const state = dataStore.zikirAutoState;
    if (state.tglKey === tglKey && Array.isArray(state.sentKeys)) {
        return;
    }

    state.tglKey = tglKey;
    state.sentKeys = [];
    dataStore.persist('zikirAutoState');
}

function startZikirAutoReminder({ client }) {
    console.log('📿 Auto zikir scheduler aktif');
    setInterval(async () => {
        if (dataStore.zikirAuto.size === 0) return;

        const { jamMenit, tglKey } = getTimeContextInZone();
        ensureZikirStateForDate(tglKey);

        const fixedTimes = {
            '05:00': 'pagi',
            '16:00': 'sore',
            '23:00': 'tidur'
        };

        const pending = [];
        const fixedType = fixedTimes[jamMenit];
        if (fixedType) {
            const key = `fixed:${fixedType}`;
            if (!dataStore.zikirAutoState.sentKeys.includes(key)) {
                const text = buildZikirMessageByType(fixedType);
                if (text) {
                    pending.push({
                        key,
                        text: `⏰ *REMINDER ZIKIR ${fixedType.toUpperCase()}*\n\n${text}`
                    });
                }
            }
        }

        for (const item of pending) {
            for (const [chatId] of dataStore.zikirAuto.entries()) {
                try {
                    await client.sendMessage(chatId, item.text);
                    console.log(`📿 Auto zikir terkirim ke ${chatId}: ${item.key}`);
                } catch (err) {
                    console.error(`Error auto zikir ke ${chatId}:`, err.message);
                }
            }
            dataStore.zikirAutoState.sentKeys.push(item.key);
        }

        for (const [chatId] of dataStore.zikirAuto.entries()) {
            try {
                const info = dataStore.reminders.get(chatId);
                if (!info?.kotaId) continue;

                const jadwal = await getPrayerJadwal(info.kotaId, tglKey);
                if (!jadwal) continue;

                const triggerTimes = [
                    { name: 'subuh', time: addMinutesToTime(jadwal.subuh, 5) },
                    { name: 'dzuhur', time: addMinutesToTime(jadwal.dzuhur, 5) },
                    { name: 'ashar', time: addMinutesToTime(jadwal.ashar, 5) },
                    { name: 'maghrib', time: addMinutesToTime(jadwal.maghrib, 5) },
                    { name: 'isya', time: addMinutesToTime(jadwal.isya, 5) }
                ];

                const hit = triggerTimes.find((t) => t.time === jamMenit);
                if (!hit) continue;

                const key = `${chatId}:post-${hit.name}`;
                if (dataStore.zikirAutoState.sentKeys.includes(key)) continue;

                await client.sendMessage(chatId, `🎲 *ZIKIR RANDOM +5 MENIT SETELAH ${hit.name.toUpperCase()}*\n\n${buildRandomZikirMessage({ includeHint: false })}`);
                console.log(`📿 Zikir random pasca sholat terkirim ke ${chatId}: ${hit.name}`);
                dataStore.zikirAutoState.sentKeys.push(key);
            } catch (err) {
                console.error(`Error auto zikir pasca sholat ke ${chatId}:`, err.message);
            }
        }

        dataStore.persist('zikirAutoState');
    }, 60 * 1000);
}

module.exports = {
    startZikirAutoReminder
};