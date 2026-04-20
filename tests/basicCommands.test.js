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

test('!mode gombal sets mode and replies', async () => {
    const userModes = new Map();
    const handler = createBasicCommandsHandler({
        userModes,
        stats: { totalChats: 0, lastActive: null },
        history: new Map(),
        buildHelpMenu: () => 'MENU',
        getHealthStatus: () => 'HEALTH'
    });

    const msg = createMockMsg();
    const handled = await handler({ cmd: '!mode gombal', msg, uid: 'u1' });

    assert.equal(handled, true);
    assert.equal(userModes.get('u1'), 'gombal');
    assert.equal(msg.replies.length, 1);
    assert.match(msg.replies[0], /Mode Gombal aktif/i);
});

test('!health uses injected health provider', async () => {
    const handler = createBasicCommandsHandler({
        userModes: new Map(),
        stats: { totalChats: 0, lastActive: null },
        history: new Map(),
        buildHelpMenu: () => 'MENU',
        getHealthStatus: () => 'HEALTH REPORT MOCK'
    });

    const msg = createMockMsg();
    const handled = await handler({ cmd: '!health', msg, uid: 'u1' });

    assert.equal(handled, true);
    assert.equal(msg.replies[0], 'HEALTH REPORT MOCK');
});

test('unknown command returns false', async () => {
    const handler = createBasicCommandsHandler({
        userModes: new Map(),
        stats: { totalChats: 0, lastActive: null },
        history: new Map(),
        buildHelpMenu: () => 'MENU',
        getHealthStatus: () => 'HEALTH'
    });

    const msg = createMockMsg();
    const handled = await handler({ cmd: '!unknown', msg, uid: 'u1' });

    assert.equal(handled, false);
    assert.equal(msg.replies.length, 0);
});
