// Owner: Role 3, Jun Kai.
// Unit tests for the install helper (scripts/install/setup.js, the pure parts) and the install files. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const setup = require('../../scripts/install/setup');

const ROOT = path.join(__dirname, '..', '..');
let counter = 0;
const random = () => `random${++counter}`;

test('a .env is read the way dotenv reads it', () => {
    const values = setup.parseEnv([
        '# comment line',
        'DB_HOST=localhost',
        'DB_NAME = spaced ',
        'SESSION_SECRET="quoted value" # note',
        "PORT='3100'",
        'LOG_LEVEL=debug # note after an unquoted value',
        'export SERVER_IP=10.0.0.5',
        'EMPTY=',
        'DB_HOST=second-wins',
        'not a setting'
    ].join('\r\n'));
    assert.equal(values.get('DB_HOST'), 'second-wins');
    assert.equal(values.get('DB_NAME'), 'spaced');
    assert.equal(values.get('SESSION_SECRET'), 'quoted value');
    assert.equal(values.get('PORT'), '3100');
    assert.equal(values.get('LOG_LEVEL'), 'debug');
    assert.equal(values.get('SERVER_IP'), '10.0.0.5');
    assert.equal(values.get('EMPTY'), '');
    assert.equal(values.has('not'), false);
    assert.equal(setup.parseEnv(null).size, 0);
});

test('the database settings follow the servers: environment first, then the file, then the default', () => {
    const values = setup.parseEnv('DB_NAME=from_file\nDB_USER=\n');
    const cfg = setup.dbConfig(values, { DB_HOST: '127.0.0.1' });
    assert.deepEqual(cfg, { host: '127.0.0.1', port: 3306, user: 'kiosk_user', password: 'kiosk123', database: 'from_file' });
    assert.equal(setup.dbConfig(values, { DB_NAME: '' }).database, 'dp_kiosk_db', 'an empty variable falls back to the default, as db.js does');
});

test('the MySQL port comes from DB_PORT, and an empty or wrong value means 3306', () => {
    assert.equal(setup.dbConfig(setup.parseEnv('DB_PORT=3307\n'), {}).port, 3307);
    assert.equal(setup.dbConfig(setup.parseEnv('DB_PORT=3307\n'), { DB_PORT: '3310' }).port, 3310, 'the environment wins, as dotenv does');
    assert.equal(setup.dbConfig(setup.parseEnv('DB_PORT=\n'), {}).port, 3306);
    assert.equal(setup.dbConfig(setup.parseEnv('DB_PORT=abc\n'), {}).port, 3306);
});

test('a new encryption key only when nothing stored depends on the current one', () => {
    assert.equal(setup.keySafe({ appUser: false, databaseExists: false }), false, 'the database could not be read yet');
    assert.equal(setup.keySafe({ appUser: true, databaseExists: false }), true);
    assert.equal(setup.keySafe({ appUser: true, databaseExists: true, encryptedEmails: 0, archives: 0 }), true);
    assert.equal(setup.keySafe({ appUser: true, databaseExists: true, encryptedEmails: 3, archives: 0 }), false);
    assert.equal(setup.keySafe({ appUser: true, databaseExists: true, encryptedEmails: 0, archives: 1 }), false);
    // <Jun Kai/> encrypted Lost & Found contacts (migration 010) need the key too
    assert.equal(setup.keySafe({ appUser: true, databaseExists: true, encryptedEmails: 0, archives: 0, encryptedContacts: 2 }), false);
    assert.equal(setup.keySafe({ appUser: true, databaseExists: true, encryptedEmails: 0, archives: 0, encryptedContacts: 0 }), true);
});

test('install fills only empty keys and sets automation by role', () => {
    const empty = setup.parseEnv('SESSION_SECRET=\nENCRYPTION_KEY=\nKIOSK_AUTOMATION=on\n');
    const laptop = setup.planEnv(empty, { role: 'laptop', safeKey: true, random });
    assert.deepEqual(laptop.changes.map((c) => c.key), ['SESSION_SECRET', 'ENCRYPTION_KEY', 'KIOSK_AUTOMATION']);
    assert.equal(laptop.changes.find((c) => c.key === 'KIOSK_AUTOMATION').value, 'off');
    assert.deepEqual(laptop.kept, []);

    const unsafe = setup.planEnv(empty, { role: 'wallpc', safeKey: false, random });
    assert.deepEqual(unsafe.changes.map((c) => c.key), ['SESSION_SECRET'], 'Wall PC keeps automation on; the key waits');
    assert.deepEqual(unsafe.kept, ['ENCRYPTION_KEY']);

    const filled = setup.parseEnv('SESSION_SECRET=mine\nENCRYPTION_KEY=abc\nKIOSK_AUTOMATION=off\n');
    assert.deepEqual(setup.planEnv(filled, { role: 'laptop', safeKey: true, random }).changes, [], 'a filled value is never replaced');
    assert.equal(setup.planEnv(setup.parseEnv(''), { role: 'wallpc', safeKey: true, random }).changes.some((c) => c.key === 'KIOSK_AUTOMATION'), false, 'a missing value means on already');
});

test('the changes are written in place, missing keys at the end, line endings kept', () => {
    const text = '# Security\r\nSESSION_SECRET=\r\nKIOSK_AUTOMATION=on\r\n# later\r\nKIOSK_AUTOMATION=dry-run\r\n';
    const out = setup.applyEnv(text, [
        { key: 'SESSION_SECRET', value: 's3' },
        { key: 'KIOSK_AUTOMATION', value: 'off' },
        { key: 'ENCRYPTION_KEY', value: 'k1' }
    ], '2026-11-12');
    assert.equal(out, '# Security\r\nSESSION_SECRET=s3\r\nKIOSK_AUTOMATION=on\r\n# later\r\nKIOSK_AUTOMATION=off\r\n\r\n# Added by scripts/install on 2026-11-12\r\nENCRYPTION_KEY=k1\r\n');
    assert.equal(setup.parseEnv(out).get('KIOSK_AUTOMATION'), 'off', 'the last line of a key is the one that counts');
    assert.equal(setup.applyEnv('A=1\n', []), 'A=1\n', 'no changes, same text');
    assert.equal(setup.applyEnv('', [{ key: 'A', value: '1' }], '2026-11-12'), '\n# Added by scripts/install on 2026-11-12\nA=1\n');
});

test('the command line options are read', () => {
    assert.deepEqual(setup.parseArgs(['install', '--role', 'WallPC', '--dry-run']), { command: 'install', dryRun: true, nonInteractive: false, rootPasswordEmpty: false, adminLater: false, role: 'wallpc', database: undefined });
    assert.equal(setup.parseArgs(['install', '--admin-later']).adminLater, true, 'the command line installer sets the admin account itself');
    assert.equal(setup.parseArgs(['remove-data', '--database', 'dp_kiosk_db', '--non-interactive']).database, 'dp_kiosk_db');
});

test('removing the data never deletes the archive zips in backend/data/archives', () => {
    const steps = setup.dataRemoval(['backend/data', 'logs']);
    assert.deepEqual(steps.map((x) => x.folder), ['backend/data', 'logs'], 'only folders that exist');
    assert.deepEqual(steps[0].keep, ['archives']);
    assert.deepEqual(steps[1].keep, []);
    assert.deepEqual(setup.dataRemoval([]), []);
});

test('a fresh copy without packages gets null for mysql2, any other loading error is passed on', () => {
    const missing = () => { const e = new Error("Cannot find module 'mysql2/promise'"); e.code = 'MODULE_NOT_FOUND'; throw e; };
    assert.equal(setup.loadMysql(missing), null);
    assert.equal(setup.loadMysql(() => 'the module'), 'the module');
    assert.throws(() => setup.loadMysql(() => { throw new Error('broken file'); }), /broken file/);
});

test('Node.js 22.12 or newer is asked for, like package.json', () => {
    assert.equal(require('../../package.json').engines.node, '>=22.12.0');
    for (const version of ['22.12.0', '22.17.0', 'v22.12.1', '24.1.0']) assert.equal(setup.nodeOk(version), true, version);
    for (const version of ['22.11.9', '22.0.0', '20.18.0', '18.20.4']) assert.equal(setup.nodeOk(version), false, version);
});

test('the firewall rule opens the main server port only: the kiosk server on 3003 listens on this PC only', () => {
    const install = fs.readFileSync(path.join(ROOT, 'scripts/install/install.ps1'), 'utf8');
    const common = fs.readFileSync(path.join(ROOT, 'scripts/install/common.ps1'), 'utf8');
    assert.match(install, /New-NetFirewallRule [^\n]*-LocalPort \$Port /);
    assert.equal(/LocalPort[^\n]*3003|KioskPorts/.test(install + common), false, 'no rule for 3003');
    const kiosk = fs.readFileSync(path.join(ROOT, 'backend/kioskServer.js'), 'utf8');
    assert.match(kiosk, /\['127\.0\.0\.1', '::1'\]\.forEach\(\(host\) =>/, 'the kiosk server still listens on this PC only');
});

test('the Windows files are plain ASCII, and the .cmd files keep CRLF endings', () => {
    const files = ['scripts/install/install.ps1', 'scripts/install/uninstall.ps1', 'scripts/install/common.ps1', 'install.cmd', 'uninstall.cmd'];
    for (const file of files) {
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.equal(/[^\x09\x0a\x0d\x20-\x7e]/.test(text), false, `${file}: Windows PowerShell 5.1 reads a file without a BOM as ANSI, so it must stay ASCII`);
        if (file.endsWith('.cmd')) assert.equal(text.replace(/\r\n/g, '').includes('\n'), false, `${file} must use CRLF`);
    }
});
// <Jun Kai end>
