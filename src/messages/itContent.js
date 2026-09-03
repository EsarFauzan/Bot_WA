/*
 * Konten "Fakta IT" & "Quotes IT" untuk reminder jadwal kuliah.
 * Dipindah dari index.js; blok openai (dead code) dibuang,
 * sehingga buildITQuoteMessage memakai fallback quotes saja.
 */
const axios = require('axios');
const { pickRandom } = require('../utils/timeHelpers');

const BOT_TIMEZONE = process.env.BOT_TIMEZONE || 'Asia/Makassar';

const FALLBACK_IT_QUOTES = [
    '"Code is like humor. When you have to explain it, it\'s bad." — Cory House',
    '"Programs must be written for people to read." — Harold Abelson',
    '"Simplicity is the soul of efficiency." — Austin Freeman',
    '"First, solve the problem. Then, write the code." — John Johnson'
];

const FALLBACK_IT_FACTS = [
    'Git dipakai di jutaan repo dan jadi fondasi kolaborasi software modern.',
    'Sebagian besar insiden keamanan berawal dari salah konfigurasi, bukan nol-day exploit.',
    'Observability (logs, metrics, traces) sering jadi pembeda utama antara cepat pulih dan downtime panjang.'
];

function buildITQuoteMessage() {
    return `✨ *QUOTES IT HARI INI*\n${pickRandom(FALLBACK_IT_QUOTES)}`;
}

async function buildLatestITFactMessage() {
    try {
        const topRes = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json', { timeout: 12000 });
        const ids = Array.isArray(topRes.data) ? topRes.data.slice(0, 20) : [];
        if (ids.length === 0) throw new Error('No top stories');

        const storyResults = await Promise.all(ids.map(async (id) => {
            try {
                const itemRes = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 12000 });
                return itemRes.data;
            } catch (e) {
                return null;
            }
        }));

        const stories = storyResults
            .filter((item) => item && item.type === 'story' && item.title)
            .sort((a, b) => (b.score || 0) - (a.score || 0));

        if (stories.length === 0) throw new Error('No story details');

        const candidates = stories.slice(0, Math.min(7, stories.length));
        const chosen = pickRandom(candidates);
        const link = chosen.url || `https://news.ycombinator.com/item?id=${chosen.id}`;
        const waktu = chosen.time
            ? new Date(chosen.time * 1000).toLocaleString('id-ID', { timeZone: BOT_TIMEZONE, hour12: false })
            : '-';

        return `💡 *FAKTA IT TERKINI*\n📰 ${chosen.title}\n⭐ Skor komunitas: ${chosen.score || 0} | 💬 Komentar: ${chosen.descendants || 0}\n🕒 Update: ${waktu}\n🔗 ${link}\n\n_Penting karena ini topik yang sedang hangat dibahas komunitas teknologi global._`;
    } catch (err) {
        console.error('Error fetch IT fact:', err.message);
        return `💡 *FAKTA IT TERKINI*\n${pickRandom(FALLBACK_IT_FACTS)}\n\n_Poin ini penting dan sering jadi faktor penentu kualitas sistem IT._`;
    }
}

module.exports = {
    buildITQuoteMessage,
    buildLatestITFactMessage
};