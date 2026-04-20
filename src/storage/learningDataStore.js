const fs = require('fs');

const DEFAULT_STATS = {
    totalChats: 0,
    lastActive: null
};

function toSafeInteger(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function toSafeIsoDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function extractStats(raw) {
    const topLevel = raw && typeof raw === 'object' ? raw : {};
    const nested = topLevel.stats && typeof topLevel.stats === 'object' ? topLevel.stats : {};

    const topHasStats = typeof topLevel.totalChats !== 'undefined' || typeof topLevel.lastActive !== 'undefined';
    const source = topHasStats ? topLevel : nested;

    return {
        totalChats: toSafeInteger(source.totalChats, DEFAULT_STATS.totalChats),
        lastActive: toSafeIsoDate(source.lastActive)
    };
}

function normalizeLearningData(raw) {
    const safeRaw = raw && typeof raw === 'object' ? raw : {};

    return {
        schemaVersion: 1,
        stats: extractStats(safeRaw),
        expressions: Array.isArray(safeRaw.expressions) ? safeRaw.expressions : []
    };
}

function loadLearningData(filePath) {
    let normalized = {
        schemaVersion: 1,
        stats: { ...DEFAULT_STATS },
        expressions: []
    };

    try {
        if (fs.existsSync(filePath)) {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            normalized = normalizeLearningData(raw);

            const current = JSON.stringify(raw);
            const canonical = JSON.stringify(normalized);
            if (current !== canonical) {
                fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
            }
        }
    } catch (e) {
        // Jika file rusak, fallback ke default agar bot tetap jalan.
    }

    return normalized;
}

function saveLearningData(filePath, data) {
    const normalized = normalizeLearningData(data);
    fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
}

module.exports = {
    loadLearningData,
    saveLearningData,
    normalizeLearningData
};
