// Owner: Role 3, Jun Kai.
// Builds the offline package of the kiosk for 64 bit Windows: one zip that installs on a PC with nothing on it.
//   node scripts/install/build-package.js [--out C:\rpkb] [--build N] [--cache <dir>] [--no-ai-model]
// Runs on Windows with Node.js 22 and git (the GitHub Actions Windows runner, or a laptop). Steps: the project's
// files by an allow list (never backend\.env, certificates, runtime data, visitor photos or the email settings),
// npm ci --omit=dev for Windows x64 (bcrypt, sharp), Node.js and MySQL 8.4 downloaded and checked against their
// checksums, the Visual C++ runtime next to the programs that need it, a check that every DLL is there, then
// payload\app.zip + payload\mysql.zip, the install scripts, version.json and checksums.sha256, zipped as
// dist\rp-xperience-kiosk-windows-x64.zip (+ .sha256). The zip carries the sentiment model too, so the local AI check
// works on a PC without internet from the first start (the user's choice, 26 Nov 2026); --no-ai-model leaves it out
// for a quicker test build only.
// <Jun Kai start>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const { checkTree } = require('./pe-imports');

const REPO = path.resolve(__dirname, '..', '..');
const RUNTIME = require('./runtime');
// npm itself, started with node.exe (no cmd.exe in between); setup-node and the Node.js installer put it here
const NPM_CLI = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const NAME = 'rp-xperience-kiosk';
const ZIP = 'rp-xperience-kiosk-windows-x64';
const MODEL = 'Xenova/bert-base-multilingual-uncased-sentiment';
// Windows' own tar (bsdtar opens and makes zip files; GNU tar from Git's usr\bin cannot)
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

// what goes into the app folder: the folders the servers use and the files at the top they run or read
const ALLOW_TOP = ['package.json', 'package-lock.json', '.nvmrc', 'startAll.js', 'restart-app.bat', 'startup-monitor.bat', 'hibernate.bat'];
const ALLOW_DIRS = ['assets/', 'backend/', 'database/', 'frontend/', 'scripts/install/'];
// never in the package, even inside an allowed folder (git tracks some of them from the previous team)
const DENY = [
    [/^backend\/\.env$/, 'the real .env'],
    [/^backend\/\.env\.(?!example$)/, 'a .env copy'],
    [/^backend\/(certs|data|cache)\//, 'certificates or runtime data'],
    [/^backend\/config\/defaults\/emailConfig\.json$/, 'the email settings'],
    [/^uploads\//, 'visitor photos'],
    [/\.(log|pem|key|pfx|p12|crt)$/i, 'keys, certificates or logs'],
];
const VC_DLLS = ['msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'concrt140.dll'];

function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : fallback;
}
// --out and --cache become arguments of tar and npm: a plain local folder only
function folderArg(name, fallback) {
    const value = path.resolve(arg(name, fallback));
    if (!/^[A-Za-z]:\\[A-Za-z0-9 ._\\-]*$/.test(value)) throw new Error(`${name} must be a plain local folder (letters, digits, spaces, dots, dashes): ${value}`);
    return value;
}
function checkRuntime() {
    if (!/^\d+\.\d+\.\d+$/.test(RUNTIME.node.version) || !/^8\.4\.\d+$/.test(RUNTIME.mysql.version)) throw new Error('scripts/install/runtime.js holds a version that is not x.y.z (MySQL must be 8.4.x)');
    if (RUNTIME.mysql.sha256 && !/^[0-9a-f]{64}$/.test(RUNTIME.mysql.sha256)) throw new Error('the MySQL sha256 in scripts/install/runtime.js is not 64 hex characters');
}
const say = (t) => console.log(`   ${t}`);
const step = (t) => console.log(`\n== ${t}`);

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true, ...opts });
    if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${args.join(' ')} failed (exit code ${r.status})`);
}
const git = (args) => execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();

function selectFiles(tracked) {
    const keep = [];
    for (const file of tracked) {
        const allowed = ALLOW_TOP.includes(file) || ALLOW_DIRS.some((d) => file.startsWith(d));
        if (!allowed) continue;
        if (DENY.some(([re]) => re.test(file))) continue;
        keep.push(file);
    }
    return keep;
}
// After copying: nothing that must stay private may be in the app folder, whatever the lists above say
function leakCheck(appDir) {
    const found = [];
    for (const rel of walkRel(appDir)) {
        const unix = rel.replace(/\\/g, '/');
        if (unix.startsWith('node_modules/')) continue;
        for (const [re, what] of DENY) if (re.test(unix)) found.push(`${unix} (${what})`);
    }
    return found;
}

function walkRel(dir, base = dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walkRel(full, base, out);
        else out.push(path.relative(base, full));
    }
    return out;
}
function dirSize(dir) {
    let total = 0;
    for (const rel of walkRel(dir)) total += fs.statSync(path.join(dir, rel)).size;
    return total;
}
function copyFile(from, to) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}
function copyDir(from, to) {
    for (const rel of walkRel(from)) copyFile(path.join(from, rel), path.join(to, rel));
}

async function sha256(file) {
    const hash = crypto.createHash('sha256');
    await finished(fs.createReadStream(file).on('data', (d) => hash.update(d)));
    return hash.digest('hex');
}
async function download(url, file) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const tmp = `${file}.part`;
    await finished(Readable.fromWeb(res.body).pipe(fs.createWriteStream(tmp)));
    fs.renameSync(tmp, file);
}

async function getNode(cache) {
    const v = RUNTIME.node.version;
    const nvmrc = fs.readFileSync(path.join(REPO, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
    if (v.split('.')[0] !== nvmrc.split('.')[0]) throw new Error(`runtime.js has Node.js ${v}, but .nvmrc asks for ${nvmrc}`);
    if (process.versions.node.split('.')[0] !== v.split('.')[0]) throw new Error(`build with Node.js ${v.split('.')[0]} (this is ${process.version}): the packages must match the Node.js inside`);
    const name = `node-v${v}-win-x64.zip`;
    const file = path.join(cache, name);
    const sums = await (await fetch(`https://nodejs.org/dist/v${v}/SHASUMS256.txt`)).text();
    const line = sums.split('\n').find((l) => l.trim().endsWith(`  ${name}`));
    if (!line) throw new Error(`${name} is not in the SHASUMS256.txt of Node.js ${v}`);
    const want = line.split(/\s+/)[0];
    if (!fs.existsSync(file) || (await sha256(file)) !== want) await download(`https://nodejs.org/dist/v${v}/${name}`, file);
    if ((await sha256(file)) !== want) throw new Error(`${name} does not match the checksum published by nodejs.org`);
    say(`Node.js ${v}: checksum matches nodejs.org`);
    return file;
}

async function getMySql(cache) {
    const v = RUNTIME.mysql.version;
    const name = `mysql-${v}-winx64.zip`;
    const file = path.join(cache, name);
    const want = (RUNTIME.mysql.sha256 || '').toLowerCase();
    // the newest 8.4 is on the CDN; an older one moves to the archive
    const urls = [`https://cdn.mysql.com/Downloads/MySQL-8.4/${name}`, `https://downloads.mysql.com/archives/get/p/23/file/${name}`];
    if (!fs.existsSync(file) || (want && (await sha256(file)) !== want)) {
        let last;
        for (const url of urls) {
            try { await download(url, file); last = null; break; } catch (e) { last = e; }
        }
        if (last) throw last;
    }
    const have = await sha256(file);
    if (!want) {
        // Oracle's download page shows the MD5 of each file (it refuses automated reading): compare it by eye, then pin
        const md5 = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
        if (!process.argv.includes('--allow-unpinned')) throw new Error(`runtime.js has no sha256 for MySQL ${v}; this download is sha256 ${have}, md5 ${md5}. Compare the md5 with Oracle's download page, then pin the sha256.`);
        say(`MySQL ${v}: NOT PINNED, sha256 ${have}, md5 ${md5} (compare the md5 with dev.mysql.com, then pin the sha256)`);
    } else if (have !== want) {
        throw new Error(`${name} does not match the sha256 pinned in runtime.js`);
    } else say(`MySQL ${v}: checksum matches the pinned one`);
    return file;
}

function findVcRuntime() {
    const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
    if (!fs.existsSync(vswhere)) throw new Error('Visual Studio (its VC\\Redist folder) is needed for the Visual C++ runtime files; the GitHub Windows runner has it');
    const install = execFileSync(vswhere, ['-latest', '-products', '*', '-property', 'installationPath'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    const redist = path.join(install, 'VC', 'Redist', 'MSVC');
    const versions = fs.readdirSync(redist).filter((d) => /^\d+\./.test(d)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versions) {
        const x64 = path.join(redist, v, 'x64');
        if (!fs.existsSync(x64)) continue;
        const crt = fs.readdirSync(x64).find((d) => /^Microsoft\.VC\d+\.CRT$/.test(d));
        if (crt) return { dir: path.join(x64, crt), version: v };
    }
    throw new Error(`no x64 CRT folder in ${redist}`);
}
function copyVc(vc, toDir) {
    let n = 0;
    for (const dll of VC_DLLS) {
        const from = path.join(vc.dir, dll);
        if (fs.existsSync(from)) { copyFile(from, path.join(toDir, dll)); n++; }
    }
    return n;
}

function zipDir(dir, zipFile, store = false) {
    fs.mkdirSync(path.dirname(zipFile), { recursive: true });
    if (fs.existsSync(zipFile)) fs.rmSync(zipFile);
    const args = ['-a', '-c', '-f', zipFile];
    if (store) args.push('--options', 'zip:compression=store');
    args.push('-C', dir, '.');
    run(TAR, args);
}
// the folder name inside the outer zip, so unzipping gives one folder
function zipOuter(parent, folder, zipFile) {
    if (fs.existsSync(zipFile)) fs.rmSync(zipFile);
    run(TAR, ['-a', '-c', '-f', zipFile, '--options', 'zip:compression=store', '-C', parent, folder]);
}

async function writeChecksums(pkgDir) {
    const lines = [];
    for (const rel of walkRel(pkgDir).sort()) {
        if (rel === 'checksums.sha256') continue;
        lines.push(`${await sha256(path.join(pkgDir, rel))}  ${rel.replace(/\\/g, '/')}`);
    }
    fs.writeFileSync(path.join(pkgDir, 'checksums.sha256'), lines.join('\r\n') + '\r\n');
}

async function makePackage({ out, stageApp, stageMysql, info, zipName }) {
    const pkgParent = path.join(out, 'pkg');
    const pkgDir = path.join(pkgParent, NAME);
    if (fs.existsSync(pkgParent)) fs.rmSync(pkgParent, { recursive: true, force: true });
    fs.mkdirSync(path.join(pkgDir, 'payload'), { recursive: true });
    const versionText = JSON.stringify(info, null, 2);
    fs.writeFileSync(path.join(stageApp, 'version.json'), versionText);
    fs.writeFileSync(path.join(pkgDir, 'version.json'), versionText);
    copyDir(path.join(__dirname, 'package', 'root'), pkgDir);
    for (const f of fs.readdirSync(path.join(__dirname, 'package')).filter((f) => f.endsWith('.ps1'))) copyFile(path.join(__dirname, 'package', f), path.join(pkgDir, 'installer', f));
    copyFile(path.join(stageApp, '.shipped-assets.txt'), path.join(pkgDir, 'installer', 'shipped-assets.txt'));
    step(`payload for ${zipName}`);
    zipDir(stageApp, path.join(pkgDir, 'payload', 'app.zip'));
    zipDir(stageMysql, path.join(pkgDir, 'payload', 'mysql.zip'));
    await writeChecksums(pkgDir);
    const dist = path.join(out, 'dist');
    fs.mkdirSync(dist, { recursive: true });
    const zipFile = path.join(dist, `${zipName}.zip`);
    zipOuter(pkgParent, NAME, zipFile);
    fs.writeFileSync(`${zipFile}.sha256`, `${await sha256(zipFile)}  ${zipName}.zip\n`);
    say(`${zipFile}: ${(fs.statSync(zipFile).size / 1048576).toFixed(0)} MB`);
    return zipFile;
}

async function main() {
    if (process.platform !== 'win32') throw new Error('the package is built on Windows (its native modules are for Windows x64)');
    checkRuntime();
    const out = folderArg('--out', path.join(path.parse(REPO).root, 'rpkb'));
    const cache = folderArg('--cache', path.join(out, 'cache'));
    const commit = git(['rev-parse', 'HEAD']);
    const build = Number(arg('--build', 0)) || Number(git(['rev-list', '--count', 'HEAD']));
    const stage = path.join(out, 'stage');
    const stageApp = path.join(stage, 'app');
    const stageMysql = path.join(stage, 'mysql');
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stageApp, { recursive: true });
    fs.mkdirSync(cache, { recursive: true });
    console.log(`Building ${ZIP} build ${build} (commit ${commit.slice(0, 7)}) in ${out}`);

    step('kiosk files (allow list)');
    const files = selectFiles(git(['ls-files']).split(/\r?\n/).filter(Boolean));
    for (const f of files) copyFile(path.join(REPO, f), path.join(stageApp, f));
    for (const f of fs.readdirSync(path.join(__dirname, 'package', 'app'))) copyFile(path.join(__dirname, 'package', 'app', f), path.join(stageApp, f));
    const leaks = leakCheck(stageApp);
    if (leaks.length) throw new Error(`private files would be packed: ${leaks.join(', ')}`);
    say(`${files.length} files, no .env, certificates, runtime data, photos or email settings`);

    step('packages for Windows x64 (npm ci --omit=dev)');
    if (!fs.existsSync(NPM_CLI)) throw new Error(`npm was not found next to node.exe (${NPM_CLI})`);
    run(process.execPath, [NPM_CLI, 'ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: stageApp });
    // the AI runtime ships builds for every system; only Windows x64 is used here
    for (const other of ['darwin', 'linux', path.join('win32', 'arm64')]) {
        const p = path.join(stageApp, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v3', other);
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    }

    step('Node.js and MySQL');
    const tmp = path.join(out, 'tmp');
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const nodeZip = await getNode(cache);
    run(TAR, ['-xf', nodeZip, '-C', tmp]);
    const nodeDir = path.join(tmp, `node-v${RUNTIME.node.version}-win-x64`);
    copyFile(path.join(nodeDir, 'node.exe'), path.join(stageApp, 'runtime', 'node', 'node.exe'));
    copyFile(path.join(nodeDir, 'LICENSE'), path.join(stageApp, 'runtime', 'node', 'LICENSE'));
    const mysqlZip = await getMySql(cache);
    run(TAR, ['-xf', mysqlZip, '-C', tmp]);
    const mysqlDir = path.join(tmp, `mysql-${RUNTIME.mysql.version}-winx64`);
    // the server, the client tools the installer uses, their DLLs, plugins and messages; no headers, docs or .lib,
    // and not the debug builds of the libraries (they need Visual Studio's debug runtime and the server never loads them)
    for (const rel of walkRel(path.join(mysqlDir, 'bin'))) if (/\.(exe|dll)$/i.test(rel) && !/-debug\.dll$/i.test(rel)) copyFile(path.join(mysqlDir, 'bin', rel), path.join(stageMysql, 'bin', rel));
    copyDir(path.join(mysqlDir, 'share'), path.join(stageMysql, 'share'));
    if (fs.existsSync(path.join(mysqlDir, 'lib', 'plugin'))) {
        for (const rel of walkRel(path.join(mysqlDir, 'lib', 'plugin'))) if (!/\.(pdb|lib)$/i.test(rel) && !/^debug[\\/]/i.test(rel)) copyFile(path.join(mysqlDir, 'lib', 'plugin', rel), path.join(stageMysql, 'lib', 'plugin', rel));
    }
    for (const f of ['LICENSE', 'README']) if (fs.existsSync(path.join(mysqlDir, f))) copyFile(path.join(mysqlDir, f), path.join(stageMysql, f));
    const vc = findVcRuntime();
    const onnx = path.join(stageApp, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v3', 'win32', 'x64');
    say(`Visual C++ runtime ${vc.version}: ${copyVc(vc, path.join(stageMysql, 'bin'))} DLLs next to MySQL${fs.existsSync(onnx) ? `, ${copyVc(vc, onnx)} next to the AI runtime` : ''}`);
    fs.rmSync(tmp, { recursive: true, force: true });

    step('every program finds its DLLs on a fresh Windows');
    // MySQL's plugins (lib\plugin) and SASL modules (bin\sasl2) load into mysqld.exe or mysql.exe: their DLLs come from bin
    const hosts = [{ root: stageMysql, dir: path.join(stageMysql, 'bin'), programs: ['mysqld.exe', 'mysql.exe'] }];
    const check = checkTree([path.join(stageApp, 'runtime'), path.join(stageApp, 'node_modules'), stageMysql], { nodeDir: path.join(stageApp, 'runtime', 'node'), hosts });
    for (const w of check.warnings) say(`note: ${w}`);
    if (check.problems.length) throw new Error(`missing DLLs:\n  ${check.problems.join('\n  ')}`);
    say(`${check.checked} x64 programs and libraries checked, nothing missing`);

    const withModel = !process.argv.includes('--no-ai-model');
    if (withModel) {
        step(`the offline AI model (${MODEL})`);
        const fetchModel = `require('@xenova/transformers').pipeline('sentiment-analysis', '${MODEL}').then(() => console.log('   model ready'), (e) => { console.error(e.message); process.exit(1); })`;
        run(path.join(stageApp, 'runtime', 'node', 'node.exe'), ['-e', fetchModel], { cwd: stageApp });
    }

    step('records');
    const assets = walkRel(path.join(stageApp, 'assets')).map((r) => r.replace(/\\/g, '/')).sort();
    fs.writeFileSync(path.join(stageApp, '.shipped-assets.txt'), assets.join('\n') + '\n');
    const migrations = fs.readdirSync(path.join(stageApp, 'database', 'migrations')).filter((f) => /^\d{3}_[A-Za-z0-9_-]+\.sql$/.test(f)).sort();
    const longest = Math.max(...walkRel(stageApp).map((r) => r.length), ...walkRel(stageMysql).map((r) => r.length + 6));
    const info = {
        name: NAME,
        build,
        commit,
        date: new Date().toISOString().slice(0, 10),
        node: RUNTIME.node.version,
        mysql: RUNTIME.mysql.version,
        aiModel: withModel,
        migrations,
        longestPath: longest,
        unpackedMB: Math.ceil((dirSize(stageApp) + dirSize(stageMysql)) / 1048576),
    };
    say(`build ${build}, ${migrations.length} database changes, longest path ${longest} characters, ${info.unpackedMB} MB unpacked`);

    const made = await makePackage({ out, stageApp, stageMysql, info, zipName: ZIP });
    copyFile(path.join(__dirname, 'get-kiosk.ps1'), path.join(out, 'dist', 'get-kiosk.ps1'));
    console.log(`\nDone: ${made}${withModel ? ' (with the offline AI model)' : ' (WITHOUT the AI model: a test build)'}`);
}

if (require.main === module) {
    main().catch((e) => { console.error(`\nerror: ${e.message}`); process.exit(1); });
}
module.exports = { selectFiles, leakCheck, ALLOW_TOP, ALLOW_DIRS, DENY };
// <Jun Kai end>
