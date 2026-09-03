const fs = require('fs');

/**
 * Baca file JSON dengan aman.
 * - Jika file utama rusak/tidak bisa di-parse, coba fallback ke backup `<file>.bak`.
 * - Jika keduanya gagal, return nilai fallback.
 *
 * @param {string} filePath path file JSON
 * @param {{ fallback?: any, normalize?: (raw:any)=>any }} [options]
 * @returns {any} data yang sudah di-parse (dan dinormalisasi bila perlu)
 */
function loadJSON(filePath, options = {}) {
    const { fallback = null, normalize = null } = options;

    for (const candidate of [filePath, `${filePath}.bak`]) {
        try {
            if (!fs.existsSync(candidate)) continue;
            const raw = JSON.parse(fs.readFileSync(candidate, 'utf8'));
            return normalize ? normalize(raw) : raw;
        } catch (e) {
            // File korup — lanjut coba backup
        }
    }

    return typeof fallback === 'function' ? fallback() : fallback;
}

/**
 * Simpan data ke file JSON secara atomic + backup:
 * 1) tulis ke `<file>.tmp`
 * 2) backup file lama ke `<file>.bak`
 * 3) rename tmp → file (operasi atomic di OS level)
 *
 * Jika crash di tengah proses, file utama tidak akan setengah-tertulis.
 */
function saveJSON(filePath, data) {
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    try {
        if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, `${filePath}.bak`);
        }
    } catch (e) {
        // Backup gagal tidak fatal
    }
    fs.renameSync(tmpPath, filePath);
}

module.exports = {
    loadJSON,
    saveJSON
};
