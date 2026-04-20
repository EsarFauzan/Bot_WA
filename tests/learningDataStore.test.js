const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadLearningData, normalizeLearningData } = require('../src/storage/learningDataStore');

test('normalizeLearningData prefers top-level stats from legacy file', () => {
    const input = {
        stats: { totalChats: 1, lastActive: '2026-01-01T00:00:00.000Z' },
        totalChats: 9,
        lastActive: '2026-01-10T00:00:00.000Z',
        expressions: ['x']
    };

    const out = normalizeLearningData(input);
    assert.equal(out.schemaVersion, 1);
    assert.equal(out.stats.totalChats, 9);
    assert.equal(out.expressions.length, 1);
});

test('loadLearningData rewrites malformed file into canonical schema', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-wa-test-'));
    const file = path.join(dir, 'learned_data.json');

    fs.writeFileSync(file, JSON.stringify({ totalChats: 3, lastActive: null }));
    const data = loadLearningData(file);

    assert.equal(data.schemaVersion, 1);
    assert.equal(data.stats.totalChats, 3);

    const rewritten = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(rewritten.schemaVersion, 1);
    assert.ok(rewritten.stats);

    fs.rmSync(dir, { recursive: true, force: true });
});
