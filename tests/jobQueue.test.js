const test = require('node:test');
const assert = require('node:assert/strict');

const { createJobQueue, createRateLimiter } = require('../src/utils/jobQueue');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('enqueue resolves with job result', async () => {
    const queue = createJobQueue({ concurrency: 1 });
    const result = await queue.enqueue(async () => 42);
    assert.equal(result, 42);
});

test('enqueue rejects when job throws, but queue keeps running', async () => {
    const queue = createJobQueue({ concurrency: 1 });

    await assert.rejects(
        queue.enqueue(async () => { throw new Error('boom'); }),
        /boom/
    );

    const result = await queue.enqueue(async () => 'ok');
    assert.equal(result, 'ok');
});

test('concurrency 1 runs jobs serially', async () => {
    const queue = createJobQueue({ concurrency: 1 });
    const order = [];

    const p1 = queue.enqueue(async () => {
        order.push('start1');
        await sleep(30);
        order.push('end1');
        return 1;
    });
    const p2 = queue.enqueue(async () => {
        order.push('start2');
        return 2;
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1, 1);
    assert.equal(r2, 2);
    assert.deepEqual(order, ['start1', 'end1', 'start2']);
});

test('concurrency 2 runs two jobs at once but never more', async () => {
    const queue = createJobQueue({ concurrency: 2 });
    let active = 0;
    let maxActive = 0;

    const jobFn = async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await sleep(30);
        active--;
        return true;
    };

    await Promise.all([
        queue.enqueue(jobFn),
        queue.enqueue(jobFn),
        queue.enqueue(jobFn)
    ]);

    assert.equal(maxActive, 2); // dua job jalan paralel
    assert.ok(maxActive <= 2);  // tidak pernah lebih dari concurrency
});

test('queue reports size and running', async () => {
    const queue = createJobQueue({ concurrency: 1 });

    const p1 = queue.enqueue(async () => { await sleep(40); return 1; });
    const p2 = queue.enqueue(async () => 2);

    assert.ok(queue.running >= 1);
    assert.ok(queue.size >= 2);

    await Promise.all([p1, p2]);
    await sleep(10); // biarkan microtask cleanup (finally) selesai
    assert.equal(queue.size, 0);
});

test('rateLimiter enforces cooldown per key and cleanup', async () => {
    const limiter = createRateLimiter(1000);

    assert.equal(limiter.check('a'), 0);
    limiter.hit('a');
    assert.ok(limiter.check('a') > 0);
    assert.equal(limiter.check('b'), 0); // key lain tidak terpengaruh

    limiter.hit('old');
    await sleep(30);
    limiter.hit('a');
    limiter.cleanup(10);
    assert.ok(limiter.check('a') > 0); // baru dipakai, masih cooldown
    assert.equal(limiter.check('old'), 0); // idle > 10ms, sudah dihapus
});