/*
 * Penyimpanan jadwal kuliah (jadwal_kuliah.json).
 * Dipindah dari index.js; sekarang memakai jsonStore (tulis atomic + backup).
 * Modul ini self-load saat di-require, seperti dataStore.
 */
const path = require('path');
const { loadJSON, saveJSON } = require('./jsonStore');

const BASE_DIR = path.join(__dirname, '..', '..'); // root project
const JADWAL_KULIAH_FILE = path.join(BASE_DIR, 'jadwal_kuliah.json');

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Hari: 0=Minggu, 1=Senin, 2=Selasa, 3=Rabu, 4=Kamis, 5=Jumat, 6=Sabtu
const DEFAULT_JADWAL_KULIAH = [
    { hari: 1, mulai: '09:10', selesai: '10:50', matkul: 'Jaringan Komputer',           reminder: '08:10' },
    { hari: 1, mulai: '12:40', selesai: '16:00', matkul: 'Sistem Operasi',               reminder: '11:40' },
    { hari: 2, mulai: '07:30', selesai: '09:10', matkul: 'Keamanan Siber',               reminder: '06:30' },
    { hari: 2, mulai: '14:20', selesai: '18:00', matkul: 'Keamanan Sistem Komputer',     reminder: '13:20' },
    { hari: 3, mulai: '12:30', selesai: '15:00', matkul: 'Pengembangan Aplikasi WEB',    reminder: '11:30' },
    { hari: 4, mulai: '10:55', selesai: '12:30', matkul: 'Pemodelan dan Simulasi',       reminder: '09:55' },
    { hari: 4, mulai: '14:20', selesai: '18:00', matkul: 'Pengembangan Aplikasi Bergerak', reminder: '13:20' },
];

function buildReminderTimeFromStart(mulai) {
    const match = String(mulai).match(/^(\d{2}):(\d{2})$/);
    if (!match) return '';
    const jam = Number(match[1]);
    const menit = Number(match[2]);
    const total = ((jam * 60 + menit) - 60 + 1440) % 1440;
    const outJam = String(Math.floor(total / 60)).padStart(2, '0');
    const outMenit = String(total % 60).padStart(2, '0');
    return `${outJam}:${outMenit}`;
}

function sortKuliahSchedule() {
    JADWAL_KULIAH.sort((a, b) => {
        if (a.hari !== b.hari) return a.hari - b.hari;
        return a.mulai.localeCompare(b.mulai);
    });
}

function normalizeKuliahSchedule(rawData) {
    if (!Array.isArray(rawData)) return [];

    const valid = [];
    for (const item of rawData) {
        if (!item || typeof item !== 'object') continue;
        const hari = Number(item.hari);
        const mulai = String(item.mulai || '').trim();
        const selesai = String(item.selesai || '').trim();
        const matkul = String(item.matkul || '').trim();
        const isTime = /^([01]\d|2[0-3]):[0-5]\d$/;

        if (!Number.isInteger(hari) || hari < 0 || hari > 6) continue;
        if (!isTime.test(mulai) || !isTime.test(selesai)) continue;
        if (!matkul) continue;

        valid.push({
            hari,
            mulai,
            selesai,
            reminder: buildReminderTimeFromStart(mulai),
            matkul
        });
    }

    return valid;
}

// Array live: dipakai bersama oleh command (!jadwal) dan scheduler reminder.
let JADWAL_KULIAH = [];

function loadKuliahSchedule() {
    const parsed = loadJSON(JADWAL_KULIAH_FILE, { fallback: () => [] });
    const normalized = normalizeKuliahSchedule(parsed);

    JADWAL_KULIAH.length = 0;
    if (normalized.length > 0) {
        JADWAL_KULIAH.push(...normalized);
    } else {
        JADWAL_KULIAH.push(...DEFAULT_JADWAL_KULIAH.map((item) => ({ ...item })));
        saveJSON(JADWAL_KULIAH_FILE, JADWAL_KULIAH);
    }
    sortKuliahSchedule();
}

function saveKuliahSchedule() {
    sortKuliahSchedule();
    saveJSON(JADWAL_KULIAH_FILE, JADWAL_KULIAH);
}

loadKuliahSchedule(); // self-load saat require

module.exports = {
    JADWAL_KULIAH,
    NAMA_HARI,
    DEFAULT_JADWAL_KULIAH,
    buildReminderTimeFromStart,
    normalizeKuliahSchedule,
    sortKuliahSchedule,
    loadKuliahSchedule,
    saveKuliahSchedule
};