const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadJSON, saveJSON } = require('../src/storage/jsonStore');

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'bot-wa-jsonstore-'));
}

test('saveJSON then loadJSON round-trip', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'data.json');

    saveJSON(file, { hello: 'world', n: 42 });
    assert.deepEqual(loadJSON(file), { hello: 'world', n: 42 });

    fs.rmSync(dir, { recursive: true, force: true });
});

test('loadJSON returns fallback when file missing', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'missing.json');

    assert.equal(loadJSON(file), null);
    assert.deepEqual(loadJSON(file, { fallback: () => [] }), []);
    assert.equal(loadJSON(file, { fallback: 'x' }), 'x');

    fs.rmSync(dir, { recursive: true, force: true });
});

test('loadJSON falls back to .bak when main file is corrupt', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'data.json');

    saveJSON(file, { version: 1 });
    saveJSON(file, { version: 2 }); // .bak sekarang berisi { version: 1 }
    fs.writeFileSync(file, '{ not valid json'); // korup
    assert.deepEqual(loadJSON(file, { fallback: () => ({ version: 0 }) }), { version: 1 });

    fs.rmSync(dir, { recursive: true, force: true });
});

test('loadJSON returns fallback when both file and backup corrupt', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'data.json');

    fs.writeFileSync(file, '{ bad');
    fs.writeFileSync(`${file}.bak`, 'also bad');
    assert.deepEqual(loadJSON(file, { fallback: () => ({ ok: true }) }), { ok: true });

    fs.rmSync(dir, { recursive: true, force: true });
});

test('saveJSON keeps previous content as .bak', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'data.json');

    saveJSON(file, { v: 1 });
    saveJSON(file, { v: 2 });

    assert.deepEqual(loadJSON(file), { v: 2 });
    assert.deepEqual(loadJSON(`${file}.bak`), { v: 1 });

    fs.rmSync(dir, { recursive: true, force: true });
});

test('loadJSON applies normalize option', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'data.json');

    saveJSON(file, { totalChats: '5' });
    const out = loadJSON(file, { normalize: (raw) => ({ totalChats: Number(raw.totalChats) }) });
    assert.deepEqual(out, { totalChats: 5 });

    fs.rmSync(dir, { recursive: true, force: true });
});