/**
 * Geser waktu "HH:MM" sejumlah offset menit (boleh negatif).
 * @param {string} hhmm waktu format "HH:MM"
 * @param {number} offset offset dalam menit
 * @returns {string|null} waktu hasil pergeseran, atau null jika input tidak valid
 */
function addMinutesToTime(hhmm, offset) {
    const match = String(hhmm || '').match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const total = (Number(match[1]) * 60) + Number(match[2]);
    const shifted = (total + offset + (24 * 60)) % (24 * 60);
    const outH = String(Math.floor(shifted / 60)).padStart(2, '0');
    const outM = String(shifted % 60).padStart(2, '0');
    return `${outH}:${outM}`;
}

/**
 * Acak 1 item dari array.
 * @param {Array} items
 * @returns {any}
 */
function pickRandom(items) {
    if (!Array.isArray(items) || items.length === 0) return '';
    return items[Math.floor(Math.random() * items.length)];
}

module.exports = {
    addMinutesToTime,
    pickRandom
};
