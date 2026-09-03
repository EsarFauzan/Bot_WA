const test = require('node:test');
const assert = require('node:assert/strict');

// Loads real project JSON files (read-only) at require time.
const dataStore = require('../src/storage/dataStore');

test('dataStore exposes map-based domains', () => {
    assert.ok(dataStore.reminders instanceof Map);
    assert.ok(dataStore.jadwal instanceof Map);
    assert.ok(dataStore.jadwalInsight instanceof Map);
    assert.ok(dataStore.sholatMode instanceof Map);
    assert.ok(dataStore.zikirAuto instanceof Map);
    assert.ok(dataStore.notes instanceof Map);
    assert.ok(dataStore.todo instanceof Map);
});

test('dataStore exposes array/object domains', () => {
    assert.ok(Array.isArray(dataStore.chatLog));
    assert.ok(Array.isArray(dataStore.ujian));
    assert.ok(Array.isArray(dataStore.akademik));
    assert.ok(dataStore.learning && typeof dataStore.learning === 'object');
    assert.ok(typeof dataStore.learning.stats === 'object');
    assert.ok(dataStore.jadwalInsightState && typeof dataStore.jadwalInsightState === 'object');
    assert.ok(dataStore.zikirAutoState && typeof dataStore.zikirAutoState === 'object');
});

test('persist rejects unknown domain without touching files', () => {
    assert.throws(() => dataStore.persist('tidak-ada'), /domain tidak dikenal/);
});