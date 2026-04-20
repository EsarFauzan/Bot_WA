const test = require('node:test');
const assert = require('node:assert/strict');

const { getTimeContextInZone } = require('../src/utils/timeContext');

test('getTimeContextInZone returns deterministic fields', () => {
    const d = new Date('2026-01-05T00:10:00.000Z');
    const result = getTimeContextInZone(d, 'Asia/Makassar');

    assert.equal(typeof result.hariIdx, 'number');
    assert.match(result.jamMenit, /^\d{2}:\d{2}$/);
    assert.match(result.tglKey, /^\d{4}-\d{2}-\d{2}$/);
});

test('getTimeContextInZone maps weekday index range', () => {
    const d = new Date('2026-01-11T00:00:00.000Z');
    const result = getTimeContextInZone(d, 'UTC');

    assert.ok(result.hariIdx >= 0 && result.hariIdx <= 6);
});
