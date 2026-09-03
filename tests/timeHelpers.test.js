const test = require('node:test');
const assert = require('node:assert/strict');

const { addMinutesToTime, pickRandom } = require('../src/utils/timeHelpers');

test('addMinutesToTime adds minutes normally', () => {
    assert.equal(addMinutesToTime('09:10', 0), '09:10');
    assert.equal(addMinutesToTime('09:10', 30), '09:40');
    assert.equal(addMinutesToTime('08:10', -2), '08:08');
});

test('addMinutesToTime wraps around midnight', () => {
    assert.equal(addMinutesToTime('23:50', 30), '00:20');
    assert.equal(addMinutesToTime('00:10', -15), '23:55');
});

test('addMinutesToTime returns null for invalid input', () => {
    assert.equal(addMinutesToTime('', 5), null);
    assert.equal(addMinutesToTime('9:10', 5), null);
    assert.equal(addMinutesToTime('abc', 5), null);
    assert.equal(addMinutesToTime(null, 5), null);
});

test('pickRandom returns a member of the array', () => {
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 30; i++) {
        assert.ok(items.includes(pickRandom(items)));
    }
});

test('pickRandom handles empty and non-array input', () => {
    assert.equal(pickRandom([]), '');
    assert.equal(pickRandom(null), '');
    assert.equal(pickRandom('abc'), '');
});