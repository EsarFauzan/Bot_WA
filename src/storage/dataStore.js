/*
 * Centralised persistence layer.
 * Exposes get/set for each domain (reminders, jadwal, etc.).
 * Uses jsonStore atomically + backup.
 */
const path = require('path');
const { loadJSON, saveJSON } = require('./jsonStore');

const BASE_DIR = path.join(__dirname, '..', '..'); // root project
const FILES = {
    learning:          path.join(BASE_DIR, 'learned_data.json'),
    chatLog:           path.join(BASE_DIR, 'chat_logs.json'),
    reminders:         path.join(BASE_DIR, 'reminders.json'),
    jadwal:            path.join(BASE_DIR, 'jadwal_groups.json'),
    jadwalInsight:     path.join(BASE_DIR, 'jadwal_insight_groups.json'),
    sholatMode:        path.join(BASE_DIR, 'sholat_modes.json'),
    zikirAuto:         path.join(BASE_DIR, 'zikir_auto_targets.json'),
    notes:             path.join(BASE_DIR, 'notes.json'),
    todo:              path.join(BASE_DIR, 'todos.json'),
    ujian:             path.join(BASE_DIR, 'ujian.json'),
    akademik:          path.join(BASE_DIR, 'akademik.json'),
    jadwalInsightState: path.join(BASE_DIR, 'jadwal_insight_state.json'),
    zikirAutoState:    path.join(BASE_DIR, 'zikir_auto_state.json'),
};

// in-memory state
const state = {
    learning:      { stats:{}, expressions:[] },
    chatLog:      [],
    reminders:     new Map(),
    jadwal:        new Map(),
    jadwalInsight: new Map(),
    sholatMode:    new Map(),
    zikirAuto:     new Map(),
    notes:        new Map(),
    todo:         new Map(),
    ujian: [],
    akademik: [],
    jadwalInsightState: {},
    zikirAutoState: {},
}

function toMap(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return new Map(Object.entries(value));
    }
    return new Map();
}

// ---- Load init ------------
function loadAll() {
    state.learning = loadJSON(FILES.learning, {
        fallback: () => ({ stats:{ totalChats:0,lastActive:null }, expressions:[] })
    });
    state.chatLog = loadJSON(FILES.chatLog, { fallback: () => [] });
    state.reminders = toMap(loadJSON(FILES.reminders, { fallback: () => ({}) }));
    state.jadwal = toMap(loadJSON(FILES.jadwal, { fallback: () => ({}) }));
    state.jadwalInsight = toMap(loadJSON(FILES.jadwalInsight, { fallback: () => ({}) }));
    state.sholatMode = toMap(loadJSON(FILES.sholatMode, { fallback: () => ({}) }));
    state.zikirAuto = toMap(loadJSON(FILES.zikirAuto, { fallback: () => ({}) }));
    state.notes = toMap(loadJSON(FILES.notes, { fallback: () => ({}) }));
    state.todo = toMap(loadJSON(FILES.todo, { fallback: () => ({}) }));
    state.ujian = loadJSON(FILES.ujian, { fallback: () => [] });
    state.akademik = loadJSON(FILES.akademik, { fallback: () => [] });
    state.jadwalInsightState = loadJSON(FILES.jadwalInsightState, { fallback: () => ({ tglKey:'', sentKeys:[]}) });
    state.zikirAutoState = loadJSON(FILES.zikirAutoState, { fallback: () => ({ tglKey:'', sentKeys:[]}) });
}

// ---- SAVE per domain ----
const SAVE_FNS = {
    learning:          () => saveJSON(FILES.learning, state.learning),
    chatLog:           () => saveJSON(FILES.chatLog, state.chatLog),
    reminders:         () => saveJSON(FILES.reminders, Object.fromEntries(state.reminders)),
    jadwal:            () => saveJSON(FILES.jadwal, Object.fromEntries(state.jadwal)),
    jadwalInsight:     () => saveJSON(FILES.jadwalInsight, Object.fromEntries(state.jadwalInsight)),
    sholatMode:        () => saveJSON(FILES.sholatMode, Object.fromEntries(state.sholatMode)),
    zikirAuto:         () => saveJSON(FILES.zikirAuto, Object.fromEntries(state.zikirAuto)),
    notes:             () => saveJSON(FILES.notes, Object.fromEntries(state.notes)),
    todo:              () => saveJSON(FILES.todo, Object.fromEntries(state.todo)),
    ujian:             () => saveJSON(FILES.ujian, state.ujian),
    akademik:          () => saveJSON(FILES.akademik, state.akademik),
    jadwalInsightState: () => saveJSON(FILES.jadwalInsightState, state.jadwalInsightState),
    zikirAutoState:    () => saveJSON(FILES.zikirAutoState, state.zikirAutoState),
};

/**
 * Simpan satu domain saja (lebih ringan daripada saveAll).
 * @param {string} domain nama domain, contoh 'todo', 'reminders', 'learning'
 */
function persist(domain) {
    const fn = SAVE_FNS[domain];
    if (!fn) throw new Error(`dataStore: domain tidak dikenal: ${domain}`);
    fn();
}

function saveAll() {
    Object.keys(SAVE_FNS).forEach(persist);
}

// ---- Exports for domains ----
const dataStore = {
    // learning
    get learning() { return state.learning; },
    set learning(v){ state.learning=v; saveJSON(FILES.learning, v); },
    // chatLog
    get chatLog(){ return state.chatLog; },
    // reminders
    get reminders(){ return state.reminders; },
    // others simply expose map references; caller mutates then call saveAll()
    get jadwal(){ return state.jadwal; },
    get jadwalInsight(){ return state.jadwalInsight; },
    get sholatMode(){ return state.sholatMode; },
    get zikirAuto(){ return state.zikirAuto; },
    get notes(){ return state.notes; },
    get todo(){ return state.todo; },
    get ujian(){ return state.ujian; },
    get akademik(){ return state.akademik; },
    get jadwalInsightState(){ return state.jadwalInsightState; },
    get zikirAutoState(){ return state.zikirAutoState; },
    loadAll,
    saveAll,
    persist,
};

module.exports = dataStore;

// load at start
loadAll();
