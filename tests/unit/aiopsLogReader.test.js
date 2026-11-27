// Owner: Role 3, Jun Kai.
// Unit tests for the log reader behind the log detectors: the tail at the start, new lines, rotation, the 7-day cut
// and the known templates. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLogReader, KEEP_MS } = require('../../backend/features/aiops/logReader');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aiops-log-'));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5 }));

const NOW = Date.parse('2026-11-11T06:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const line = (agoMs, message, { process = 'server', level = 'warn' } = {}) => `${JSON.stringify({ at: new Date(NOW - agoMs).toISOString(), process, level, message })}\n`;
let count = 0;
const fileWith = (name, text) => {
    const file = path.join(TMP, `${name}-${count++}.jsonl`);
    fs.writeFileSync(file, text);
    return file;
};
const messages = (reader, hours) => reader.events(hours).map((e) => e.message);

test('the reader loads without the database', () => {
    const loaded = Object.keys(require.cache).map((file) => file.replace(/\\/g, '/'));
    assert.deepEqual(loaded.filter((file) => /backend\/(core\/db|features\/health\/checks)\.js$/.test(file)), []);
});

test('load reads the tail of each file, skips bad lines and anything older than 7 days, newest last', () => {
    const server = fileWith('server', line(8 * 24 * HOUR, 'too old') + line(6 * 24 * HOUR, 'disk 91% full') + 'not json\n' + '\n'
        + '{"at":"never","process":"server","level":"warn","message":"bad time"}\n' + '{"at":"2026-11-11T05:00:00.000Z","level":"warn"}\n'
        + line(2 * HOUR, 'kiosk timed out after 5000 ms'));
    const kiosk = fileWith('kiosk', line(1 * HOUR, 'photo upload failed', { process: 'kiosk', level: 'error' }));
    const reader = createLogReader([server, kiosk, path.join(TMP, 'missing.jsonl')], { now: () => new Date(NOW) });
    reader.load();
    assert.deepEqual(messages(reader, 24), ['kiosk timed out after 5000 ms', 'photo upload failed']);
    assert.deepEqual(messages(reader, 24 * 7), ['disk 91% full', 'kiosk timed out after 5000 ms', 'photo upload failed']);
    assert.deepEqual(messages(reader, 0.5), [], 'nothing in the last half hour');
    const [first, second] = reader.events(24);
    assert.deepEqual(Object.keys(first), ['at', 'process', 'level', 'message']);
    assert.deepEqual(second, { at: new Date(NOW - HOUR).toISOString(), process: 'kiosk', level: 'error', message: 'photo upload failed' });
    assert.equal(Math.round(reader.historyHours()), 6 * 24);
});

test('readNew picks up only whole new lines, follows a file that appears later and drops old lines', () => {
    const server = fileWith('server', line(3 * HOUR, 'first'));
    const later = path.join(TMP, 'later.jsonl');
    const reader = createLogReader([server, later], { now: () => NOW });
    reader.load();
    reader.readNew();
    assert.deepEqual(messages(reader, 24), ['first']);
    const second = line(2 * HOUR, 'second');
    fs.appendFileSync(server, second.slice(0, 25)); // a line still being written
    reader.readNew();
    assert.deepEqual(messages(reader, 24), ['first'], 'a half line waits');
    fs.appendFileSync(server, second.slice(25));
    fs.writeFileSync(later, line(1 * HOUR, 'third', { process: 'kiosk' }));
    reader.readNew();
    assert.deepEqual(messages(reader, 24), ['first', 'second', 'third']);
    reader.readNew();
    assert.deepEqual(messages(reader, 24), ['first', 'second', 'third'], 'nothing is read twice');
    fs.appendFileSync(server, line(KEEP_MS + HOUR, 'ancient') + line(0.5 * HOUR, 'fourth'));
    reader.readNew();
    assert.deepEqual(messages(reader, 24 * 7), ['first', 'second', 'third', 'fourth'], 'the 7-day cut applies to new lines too');
});

test('a rotated file is followed: the lines written before the rotation come from the .1 file', () => {
    const server = fileWith('server', line(5 * HOUR, 'a'));
    const reader = createLogReader([server], { now: () => NOW });
    reader.load();
    fs.appendFileSync(server, line(4 * HOUR, 'b, written after the last read and before the rotation'));
    fs.renameSync(server, `${server}.1`);
    fs.writeFileSync(server, line(3 * HOUR, 'c'));
    reader.readNew();
    assert.deepEqual(messages(reader, 24), ['a', 'b, written after the last read and before the rotation', 'c']);
    fs.appendFileSync(server, line(2 * HOUR, 'd'));
    reader.readNew();
    assert.deepEqual(messages(reader, 24), ['a', 'b, written after the last read and before the rotation', 'c', 'd']);
    const again = createLogReader([server], { now: () => NOW });
    again.load();
    assert.deepEqual(messages(again, 24), messages(reader, 24), 'a .1 file that is there at the start is read too');

    // a rotation where the fresh file happens to be exactly as big as what was read of the old one: the file identity
    // tells them apart (where the file system has one)
    if (fs.statSync(server, { bigint: true }).ino) {
        fs.renameSync(server, `${server}.1`);
        fs.writeFileSync(server, line(1 * HOUR, 'e') + line(1 * HOUR, 'f'));
        reader.readNew();
        assert.deepEqual(messages(reader, 24).slice(-3), ['d', 'e', 'f']);
    }
});

test('load reads only the last 2 MB of a big file and starts at a whole line', () => {
    const big = fileWith('big', line(23 * HOUR, 'start'.padEnd(3 * 1024 * 1024, '.')) + line(22 * HOUR, 'after'));
    const reader = createLogReader([big], { now: () => NOW });
    reader.load();
    assert.deepEqual(messages(reader, 24), ['after']);
    fs.appendFileSync(big, line(21 * HOUR, 'later'));
    reader.readNew();
    assert.deepEqual(messages(reader, 24), ['after', 'later']);
});

test('known() holds the templates seen before a moment, with the numbers masked', () => {
    const server = fileWith('server', line(30 * HOUR, 'disk 91% full') + line(29 * HOUR, 'disk 85% full') + line(1 * HOUR, 'kiosk timed out after 5000 ms'));
    const reader = createLogReader([server], { now: () => NOW });
    reader.load();
    const before = reader.known(NOW - 24 * HOUR);
    assert.equal(before.size, 1, 'two messages that differ only in their numbers are one template');
    const [template] = before;
    assert.doesNotMatch(template, /91|85/);
    assert.equal(reader.known(new Date(NOW)).size, 2);
    assert.equal(reader.known(NOW - 31 * HOUR).size, 0);
    assert.equal(createLogReader([], { now: () => NOW }).historyHours(), 0);
});
// <Jun Kai end>
