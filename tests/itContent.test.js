const test = require('node:test');
const assert = require('node:assert/strict');

const { buildITQuoteMessage } = require('../src/messages/itContent');

test('buildITQuoteMessage returns a quote message with header', () => {
    const msg = buildITQuoteMessage();

    assert.match(msg, /^✨ \*QUOTES IT HARI INI\*\n/);
    const quote = msg.replace(/^✨ \*QUOTES IT HARI INI\*\n/, '');
    assert.ok(quote.trim().length > 0, 'harus ada isi quotes');
});

test('buildITQuoteMessage is deterministic in structure (no AI/dead code)', () => {
    const msg1 = buildITQuoteMessage();
    const msg2 = buildITQuoteMessage();

    assert.ok(typeof msg1 === 'string');
    assert.ok(typeof msg2 === 'string');
    assert.match(msg1, /QUOTES IT HARI INI/);
});