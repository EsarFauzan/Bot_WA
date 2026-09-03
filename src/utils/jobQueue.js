/**
 * Antrean job sederhana dengan batas concurrency.
 * Dipakai untuk task berat (ffmpeg, download video, dsb) agar tidak
 * membebani CPU/RAM secara bersamaan (mis. di VPS 1GB).
 *
 * @param {{ concurrency?: number }} options jumlah job yang jalan bersamaan
 */
function createJobQueue({ concurrency = 1 } = {}) {
    const pending = [];
    let running = 0;

    function pump() {
        while (running < concurrency && pending.length > 0) {
            const job = pending.shift();
            running++;
            Promise.resolve()
                .then(job.fn)
                .then(job.resolve, job.reject)
                .catch((err) => console.error('[JOB-QUEUE] Job gagal:', err?.message || err))
                .finally(() => {
                    running--;
                    pump();
                });
        }
    }

    return {
        /**
         * Tambah job ke antrean. Job langsung jalan bila ada slot kosong.
         * @param {() => Promise<any>} fn fungsi yang dijalankan (boleh async)
         * @returns {Promise<any>} promise hasil job (resolve dengan nilai balik fn, reject bila fn error)
         */
        enqueue(fn) {
            return new Promise((resolve, reject) => {
                pending.push({ fn, resolve, reject });
                pump();
            });
        },
        /** Total job yang sedang menunggu + berjalan */
        get size() {
            return pending.length + running;
        },
        get running() {
            return running;
        }
    };
}

/**
 * Rate limiter sederhana per-key dengan cooldown milidetik.
 *
 * @param {number} cooldownMs jarak minimum antar pemakaian
 */
function createRateLimiter(cooldownMs) {
    const lastUsed = new Map();

    return {
        /**
         * @param {string} key
         * @returns {number} sisa detik cooldown (0 = boleh dipakai)
         */
        check(key) {
            const last = lastUsed.get(key) || 0;
            const remain = cooldownMs - (Date.now() - last);
            return remain > 0 ? Math.ceil(remain / 1000) : 0;
        },
        /** Tandai key baru saja dipakai (mulai hitung cooldown). Panggil saat job masuk antrean. */
        hit(key) {
            lastUsed.set(key, Date.now());
        },
        /**
         * Bersihkan entri yang sudah idle lebih lama dari maxIdleMs.
         * @param {number} maxIdleMs
         */
        cleanup(maxIdleMs) {
            const now = Date.now();
            for (const [key, ts] of lastUsed.entries()) {
                if (now - ts > maxIdleMs) lastUsed.delete(key);
            }
        }
    };
}

module.exports = {
    createJobQueue,
    createRateLimiter
};
