const test = require('node:test');
const assert = require('node:assert/strict');

const {
    JADWAL_KULIAH,
    DEFAULT_JADWAL_KULIAH,
    buildReminderTimeFromStart,
    normalizeKuliahSchedule
} = require('../src/storage/jadwalKuliahStore');

test('buildReminderTimeFromStart computes 1 hour before start', () => {
    assert.equal(buildReminderTimeFromStart('09:10'), '08:10');
    assert.equal(buildReminderTimeFromStart('00:30'), '23:30'); // wrap tengah malam
    assert.equal(buildReminderTimeFromStart('07:00'), '06:00');
});

test('buildReminderTimeFromStart returns empty for invalid input', () => {
    assert.equal(buildReminderTimeFromStart(''), '');
    assert.equal(buildReminderTimeFromStart('9:10'), '');
});

test('normalizeKuliahSchedule keeps valid items and computes reminder', () => {
    const raw = [
        { hari: 1, mulai: '09:10', selesai: '10:50', matkul: 'Jaringan Komputer' },
        { hari: 9, mulai: '09:10', selesai: '10:50', matkul: 'Hari tidak valid' },
        { hari: 2, mulai: 'not-a-time', selesai: '10:50', matkul: 'Jam tidak valid' },
        { hari: 3, mulai: '12:30', selesai: '15:00', matkul: '' }, // matkul kosong
        null,
        'bukan object'
    ];

    const out = normalizeKuliahSchedule(raw);
    assert.equal(out.length, 1);
    assert.equal(out[0].matkul, 'Jaringan Komputer');
    assert.equal(out[0].reminder, '08:10');
});

test('normalizeKuliahSchedule handles non-array input', () => {
    assert.deepEqual(normalizeKuliahSchedule(null), []);
    assert.deepEqual(normalizeKuliahSchedule({}), []);
});

test('JADWAL_KULIAH is loaded and sorted by hari then mulai', () => {
    assert.ok(JADWAL_KULIAH.length > 0);

    for (let i = 1; i < JADWAL_KULIAH.length; i++) {
        const prev = JADWAL_KULIAH[i - 1];
        const cur = JADWAL_KULIAH[i];
        if (prev.hari !== cur.hari) {
            assert.ok(prev.hari < cur.hari, 'hari harus urut naik');
        } else {
            assert.ok(prev.mulai <= cur.mulai, 'mulai harus urut naik dalam hari yang sama');
        }
    }
});

test('default schedule has 7 items', () => {
    assert.equal(DEFAULT_JADWAL_KULIAH.length, 7);
});