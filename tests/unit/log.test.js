// Owner: Role 3, Jun Kai.
// Unit tests for the terminal log level and the warning/error capture. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setupLogging, captureEvents, eventFile, forLog, emailForLog } = require('../../backend/core/log');

test('forLog takes the line breaks out of a request value, so it cannot start a fake log line', () => {
    assert.equal(forLog('bob\r\n✅ Admin signed in: systemadmin'), 'bob✅ Admin signed in: systemadmin');
    assert.equal(forLog('a\nb\rc'), 'abc');
    assert.equal(forLog(42), '42');
    assert.equal(forLog(undefined), 'undefined', 'the same text console.log printed before');
});

test('emailForLog shows only the first two letters and the domain of a visitor email', () => {
    assert.equal(emailForLog('john.tan@gmail.com'), 'jo***@gmail.com');
    assert.equal(emailForLog('a@rp.edu.sg'), 'a***@rp.edu.sg');
    assert.equal(emailForLog('evil@x.com\nfake line'), 'ev***@x.comfake line');
    assert.equal(emailForLog('not an email'), '***');
    assert.equal(emailForLog(''), '');
});

test('console.debug is silent unless LOG_LEVEL=debug', () => {
    const original = console.debug;
    try {
        assert.equal(setupLogging('debug'), false);
        assert.equal(console.debug, original, 'debug keeps every line');
        assert.equal(setupLogging(' DEBUG '), false, 'case and spaces do not matter');
        assert.equal(setupLogging(''), true);
        assert.notEqual(console.debug, original, 'the default hides the request chatter');
        assert.equal(console.debug('hidden'), undefined);
    } finally {
        console.debug = original;
    }
});

test('captureEvents keeps warnings and errors as JSON lines, skips [aiops] lines, cuts long ones and rotates', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-unit-'));
    const original = { warn: console.warn, error: console.error };
    const printed = [];
    // the capture wraps whatever console.warn is at the time, so a quiet one keeps the test output clean
    console.warn = (...args) => printed.push(['warn', ...args]);
    console.error = (...args) => printed.push(['error', ...args]);
    const capture = captureEvents('unit', { dir, maxBytes: 1000 });
    const lines = (file = capture.file) => fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    try {
        assert.equal(capture.file, eventFile('unit', dir));
        assert.equal(captureEvents('again', { dir }), capture, 'installed once per process');
        console.warn('disk %s at %d%%', 'C:', 91);
        console.error(new Error('boom'));
        console.warn('[aiops] the detection talking to itself');
        assert.equal(printed.length, 3, 'everything still prints');
        const kept = lines();
        assert.equal(kept.length, 2);
        assert.equal(kept[0].process, 'unit');
        assert.equal(kept[0].level, 'warn');
        assert.equal(kept[0].message, 'disk C: at 91%');
        assert.ok(!Number.isNaN(Date.parse(kept[0].at)));
        assert.equal(kept[1].level, 'error');
        assert.match(kept[1].message, /^Error: boom/);

        console.error('Thank-you email to jane.tan+rp@example.edu.sg failed');
        assert.equal(lines()[2].message, 'Thank-you email to <email> failed', 'a visitor address is never written to the file');
        assert.equal(printed.length, 4);

        console.warn('x'.repeat(390));
        assert.equal(fs.existsSync(`${capture.file}.1`), false, 'not rotated until the file passes maxBytes');
        console.warn('y'.repeat(500));
        assert.equal(lines(`${capture.file}.1`).length, 4, 'the full file moved to .1');
        const fresh = lines();
        assert.equal(fresh.length, 1);
        assert.equal(fresh[0].message.length, 400, 'messages are cut at 400 characters');
    } finally {
        capture.stop();
        console.warn = original.warn;
        console.error = original.error;
        fs.rmSync(dir, { recursive: true, force: true });
    }
    assert.equal(console.warn, original.warn, 'stop() puts the console back');
});

test('captureEvents never throws when the file cannot be written: one warning, then silence', () => {
    const original = { warn: console.warn, error: console.error };
    const printed = [];
    console.warn = (...args) => printed.push(args.join(' '));
    console.error = () => {};
    // a file where the folder should be, so mkdir and every append fail
    const blocker = path.join(os.tmpdir(), `log-unit-blocker-${process.pid}`);
    fs.writeFileSync(blocker, 'not a folder');
    const capture = captureEvents('unit', { dir: path.join(blocker, 'logs') });
    try {
        console.warn('first');
        console.warn('second');
        console.error('third');
        const complaints = printed.filter((line) => line.startsWith('[aiops] cannot write'));
        assert.equal(complaints.length, 1);
        assert.deepEqual(printed.filter((line) => !line.startsWith('[aiops]')), ['first', 'second']);
    } finally {
        capture.stop();
        console.warn = original.warn;
        console.error = original.error;
        fs.rmSync(blocker, { force: true });
    }
});
// <Jun Kai end>
