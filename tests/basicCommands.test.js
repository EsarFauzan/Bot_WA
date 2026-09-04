const test = require('node:test');
const assert = require('node:assert/strict');

const { createBasicCommandsHandler } = require('../src/commands/basicCommands');

function createMockMsg() {
    return {
        replies: [],
        reply(text) {
            this.replies.push(text);
        }
    };
}

function createHandler(overrides = {}) {
    return createBasicCommandsHandler({
        stats: { totalChats: 7, lastActive: '2026-01-01T00:00:00.000Z' },
        history: new Map(),
        buildHelpMenu: () => 'MENU',
        getHealthStatus: () => 'HEALTH REPORT MOCK',
        ...overrides
    });
}

test('!stats replies with total chat count', async () => {
    const handler = createHandler();
    const msg = createMockMsg();
    const handled = await handler({ cmd: '!stats', msg, uid: 'u1' });

    assert.equal(handled, true);
    assert.equal(msg.replies.length, 1);
    assert.match(msg.replies[0], /Total chat: 7/);
});

test('!health uses injected health provider', async () => {
    const handler = createHandler();
    const msg = createMockMsg();
    const handled = await handler({ cmd: '!health', msg, uid: 'u1' });

    assert.equal(handled, true);
    assert.equal(msg.replies[0], 'HEALTH REPORT MOCK');
});

test('!menu replies with buildHelpMenu output', async () => {
    const handler = createHandler();
    const msg = createMockMsg();
    const handled = await handler({ cmd: '!menu', msg, uid: 'u1' });

    assert.equal(handled, true);
    assert.equal(msg.replies[0], 'MENU');
});

test('!reset clears history for the user', async () => {
    const history = new Map([['u1', ['a']]]);
    const handler = createHandler({ history });
    const msg = createMockMsg();
    const handled = await handler({ cmd: '!reset', msg, uid: 'u1' });

    assert.equal(handled, true);
    assert.equal(history.has('u1'), false);
    assert.equal(msg.replies.length, 1);
});

test('unknown command returns false', async () => {
    const handler = createHandler();
    const msg = createMockMsg();
    const handled = await handler({ cmd: '!unknown', msg, uid: 'u1' });

    assert.equal(handled, false);
    assert.equal(msg.replies.length, 0);
});
