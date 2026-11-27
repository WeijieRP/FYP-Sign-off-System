// Owner: Role 3, Jun Kai.
// Unit tests for the offline package: which files the build packs (scripts/install/build-package.js), the DLL check
// (scripts/install/pe-imports.js, on small fake Windows binaries made here, so it runs on any system) and the
// pure parts of set-env and set-admin (scripts/install/setup.js). Only temp folders are written.
// Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const build = require('../../scripts/install/build-package');
const pe = require('../../scripts/install/pe-imports');
const setup = require('../../scripts/install/setup');

// A minimal 64 bit PE file: one section that holds the import table, the delay import table and the DLL names
function fakePe({ machine = pe.MACHINE_X64, imports = ['KERNEL32.dll'], delayed = [] } = {}) {
    const buf = Buffer.alloc(0x600);
    buf.writeUInt16LE(0x5a4d, 0);
    buf.writeUInt32LE(0x80, 0x3c);
    const coff = 0x84;
    buf.writeUInt32LE(0x4550, 0x80);
    buf.writeUInt16LE(machine, coff);
    buf.writeUInt16LE(1, coff + 2);
    buf.writeUInt16LE(240, coff + 16);
    const opt = coff + 20;
    buf.writeUInt16LE(0x20b, opt);
    buf.writeBigUInt64LE(0x140000000n, opt + 24);
    buf.writeUInt32LE(16, opt + 108);
    const dirs = opt + 112;
    const sec = opt + 240;
    buf.write('.idata', sec, 'latin1');
    buf.writeUInt32LE(0x200, sec + 8);
    buf.writeUInt32LE(0x1000, sec + 12);
    buf.writeUInt32LE(0x200, sec + 16);
    buf.writeUInt32LE(0x200, sec + 20);
    let nameRva = 0x1100;
    const name = (n) => {
        buf.write(`${n}\0`, nameRva - 0x1000 + 0x200, 'latin1');
        const at = nameRva;
        nameRva += n.length + 1;
        return at;
    };
    imports.forEach((n, i) => buf.writeUInt32LE(name(n), 0x200 + i * 20 + 12));
    buf.writeUInt32LE(0x1000, dirs + 8);
    delayed.forEach((n, i) => {
        buf.writeUInt32LE(1, 0x280 + i * 32);
        buf.writeUInt32LE(name(n), 0x280 + i * 32 + 4);
    });
    if (delayed.length) buf.writeUInt32LE(0x1080, dirs + 13 * 8);
    return buf;
}

function tempDir(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpk-unit-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

test('the build packs the app folders and the files the servers run, never private or runtime files', () => {
    const tracked = [
        'backend/server.js', 'backend/.env', 'backend/.env.example', 'backend/.env.local', 'backend/certs/selfsigned.pem',
        'backend/data/emailConfig.json', 'backend/config/defaults/emailConfig.json', 'backend/config/defaults/form-ui.json',
        'uploads/photos/a.jpg', 'frontend/admin/index.html', 'assets/static/logo.png', 'database/schema.sql',
        'scripts/install/setup.js', 'scripts/setup/Purge_Actuator.js', 'scripts/aiops-replay.js', 'tests/smoke.js',
        'docs/features/install.md', 'legacy/old.js', 'install.cmd', 'package.json', 'startAll.js', 'restart-app.bat',
        'hibernate.bat', '.github/workflows/ci.yml', 'backend/features/x/debug.log',
    ];
    assert.deepEqual(build.selectFiles(tracked), [
        'backend/server.js', 'backend/.env.example', 'backend/config/defaults/form-ui.json', 'frontend/admin/index.html',
        'assets/static/logo.png', 'database/schema.sql', 'scripts/install/setup.js', 'package.json', 'startAll.js',
        'restart-app.bat', 'hibernate.bat',
    ]);
});

test('the leak check finds private files in a packed folder, whatever put them there', (t) => {
    const dir = tempDir(t);
    for (const f of ['backend/.env', 'backend/certs/selfsigned.key', 'uploads/photos/v.jpg', 'node_modules/x/test.pem', 'backend/server.js']) {
        fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
        fs.writeFileSync(path.join(dir, f), 'x');
    }
    const found = [...new Set(build.leakCheck(dir).map((l) => l.split(' ')[0]))].sort();
    assert.deepEqual(found, ['backend/.env', 'backend/certs/selfsigned.key', 'uploads/photos/v.jpg']);
    // packages are not checked: some ship their own test keys
});

test('the import table of a Windows binary is read: normal and delay loaded DLLs, and the machine type', () => {
    const info = pe.readImports(fakePe({ imports: ['KERNEL32.dll', 'VCRUNTIME140.dll'], delayed: ['USER32.dll'] }));
    assert.equal(info.machine, pe.MACHINE_X64);
    assert.deepEqual(info.imports, ['KERNEL32.dll', 'VCRUNTIME140.dll']);
    assert.deepEqual(info.delayed, ['USER32.dll']);
    assert.equal(pe.readImports(Buffer.from('#!/bin/sh\necho not a program\n')), null);
    assert.equal(pe.readImports(Buffer.alloc(10)), null);
});

test('the Visual C++ runtime never counts as part of Windows, API sets always do', (t) => {
    const sys = tempDir(t);
    for (const f of ['kernel32.dll', 'vcruntime140.dll', 'msvcp140.dll']) fs.writeFileSync(path.join(sys, f), '');
    assert.equal(pe.isWindowsDll('KERNEL32.dll', sys), true);
    assert.equal(pe.isWindowsDll('VCRUNTIME140.dll', sys), false, 'the build PC has it, a fresh PC may not');
    assert.equal(pe.isWindowsDll('MSVCP140_1.dll', sys), false);
    assert.equal(pe.isWindowsDll('api-ms-win-crt-runtime-l1-1-0.dll', sys), true);
    assert.equal(pe.isWindowsDll('libssl-3-x64.dll', sys), false);
});

test('a missing DLL is reported, and a copy next to the file fixes it', (t) => {
    const sys = tempDir(t);
    fs.writeFileSync(path.join(sys, 'kernel32.dll'), '');
    const pkg = tempDir(t);
    fs.mkdirSync(path.join(pkg, 'bin'));
    fs.writeFileSync(path.join(pkg, 'bin', 'mysqld.exe'), fakePe({ imports: ['KERNEL32.dll', 'VCRUNTIME140.dll', 'libssl-3-x64.dll'] }));
    fs.writeFileSync(path.join(pkg, 'bin', 'arm.dll'), fakePe({ machine: 0xaa64, imports: ['missing.dll'] }));
    let r = pe.checkTree([pkg], { system32: sys });
    assert.equal(r.checked, 1, 'only x64 files are checked');
    assert.equal(r.problems.length, 2);
    assert.match(r.problems.join('\n'), /VCRUNTIME140\.dll/);
    assert.match(r.problems.join('\n'), /libssl-3-x64\.dll/);
    fs.writeFileSync(path.join(pkg, 'bin', 'vcruntime140.dll'), '');
    fs.writeFileSync(path.join(pkg, 'bin', 'libssl-3-x64.dll'), '');
    r = pe.checkTree([pkg], { system32: sys });
    assert.deepEqual(r.problems, []);
});

test('a Node.js addon may use node.exe and the DLLs next to node.exe; a delay loaded DLL is only a note', (t) => {
    const sys = tempDir(t);
    const root = tempDir(t);
    const nodeDir = path.join(root, 'runtime', 'node');
    const addonDir = path.join(root, 'node_modules', 'x', 'build');
    fs.mkdirSync(nodeDir, { recursive: true });
    fs.mkdirSync(addonDir, { recursive: true });
    fs.writeFileSync(path.join(nodeDir, 'helper.dll'), '');
    fs.writeFileSync(path.join(addonDir, 'x.node'), fakePe({ imports: ['node.exe', 'helper.dll'], delayed: ['later.dll'] }));
    const r = pe.checkTree([root], { system32: sys, nodeDir });
    assert.deepEqual(r.problems, []);
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /later\.dll/);
});

test("a MySQL plugin finds its DLLs in MySQL's bin folder and may use mysqld.exe itself", (t) => {
    const sys = tempDir(t);
    const mysql = tempDir(t);
    fs.mkdirSync(path.join(mysql, 'bin'));
    fs.mkdirSync(path.join(mysql, 'lib', 'plugin'), { recursive: true });
    fs.writeFileSync(path.join(mysql, 'bin', 'libssl-3-x64.dll'), '');
    fs.writeFileSync(path.join(mysql, 'lib', 'plugin', 'auth.dll'), fakePe({ imports: ['mysqld.exe', 'libssl-3-x64.dll'] }));
    assert.equal(pe.checkTree([mysql], { system32: sys }).problems.length, 2, 'without the rule both are missing');
    const hosts = [{ root: mysql, dir: path.join(mysql, 'bin'), programs: ['mysqld.exe'] }];
    assert.deepEqual(pe.checkTree([mysql], { system32: sys, hosts }).problems, []);
});

test('set-env keeps a moved value exactly as written, and the last line of a key wins', () => {
    const values = setup.rawEnvLines('DB_PORT=3307\nSMTP_PASS="has # and spaces"\n# note\nNOT A LINE\nDB_PORT=3310\r\n');
    assert.deepEqual([...values], [['DB_PORT', '3310'], ['SMTP_PASS', '"has # and spaces"']]);
    const text = setup.applyEnv('DB_HOST=localhost\nDB_PORT=\nPORT=\n', [...values].map(([key, value]) => ({ key, value })), '2026-11-26');
    assert.match(text, /^DB_PORT=3310$/m);
    assert.match(text, /^SMTP_PASS="has # and spaces"$/m);
    assert.equal(setup.parseEnv(text).get('SMTP_PASS'), 'has # and spaces', 'dotenv still reads it the same');
});

test('the first admin account: 8 characters at least, never the public default password', () => {
    assert.equal(setup.adminProblem('systemadmin', 'a-good-long-one'), null);
    assert.match(setup.adminProblem('systemadmin', 'short'), /8 characters/);
    assert.match(setup.adminProblem('systemadmin', 'SystemAdmin123!'), /default password/);
    assert.match(setup.adminProblem('Jamie', 'jamie'), /8 characters|user name/);
    assert.match(setup.adminProblem('Jamie.Lee', 'jamie.lee'), /user name/);
    assert.match(setup.adminProblem('a b', 'whatever-long'), /user name/);
    assert.match(setup.adminProblem('systemadmin', 'x'.repeat(73)), /72 bytes/);
});

test('the package files the build adds exist and the install command files keep Windows line endings', () => {
    const pkg = path.join(__dirname, '..', '..', 'scripts', 'install', 'package');
    for (const f of ['root/install.cmd', 'root/update.cmd', 'root/uninstall.cmd', 'root/export-data.cmd', 'root/README.txt', 'app/start-kiosk.cmd', 'app/uninstall.cmd', 'app/update.cmd', 'app/kiosk-status.cmd', 'app/export-data.cmd', 'Install-Kiosk.ps1', 'Uninstall-Kiosk.ps1', 'KioskCommon.ps1', 'KioskMachine.ps1', 'KioskData.ps1']) {
        assert.ok(fs.existsSync(path.join(pkg, f)), f);
    }
    const attributes = fs.readFileSync(path.join(__dirname, '..', '..', '.gitattributes'), 'utf8');
    assert.match(attributes, /^\*\.cmd text eol=crlf/m);
    assert.match(attributes, /^\*\.bat text eol=crlf/m);
    const runtime = require('../../scripts/install/runtime');
    const nvmrc = fs.readFileSync(path.join(__dirname, '..', '..', '.nvmrc'), 'utf8').trim();
    assert.equal(runtime.node.version.split('.')[0], nvmrc.split('.')[0], 'the packed Node.js is the version in .nvmrc');
    assert.match(runtime.mysql.version, /^8\.4\.\d+$/);
});
// <Jun Kai end>
