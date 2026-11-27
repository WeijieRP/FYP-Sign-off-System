// Owner: Role 3, Jun Kai.
// Install helper behind install.cmd / uninstall.cmd (task-sheet point 5). Fills the missing keys of backend/.env and
// sets up the database without ever dropping a table, so it is safe to run again on a working copy (it then only
// applies new migrations).
//   node scripts/install/setup.js check                                  what is set up, changes nothing (npm run doctor)
//   node scripts/install/setup.js install --role laptop|wallpc [--dry-run] [--non-interactive]
//   node scripts/install/setup.js remove-data --database <name> [--dry-run] [--non-interactive]
//   node scripts/install/setup.js set-env      KEY=value lines on stdin into backend/.env (the command line installer)
//   node scripts/install/setup.js set-admin    the first admin account from KIOSK_ADMIN_USER / KIOSK_ADMIN_PASSWORD
// The MySQL root password is only asked for when the app's database user cannot log in or create the database. It
// is typed hidden, or read from ESG_MYSQL_ROOT_PASSWORD (--root-password-empty for a root without one); never argv.
// Exit codes: 0 done, 1 failed, 2 the root password is needed but could not be asked for.
// <Jun Kai start>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const FILES = {
    env: path.join(ROOT, 'backend', '.env'),
    example: path.join(ROOT, 'backend', '.env.example'),
    schema: path.join(ROOT, 'database', 'schema.sql'),
    migrate: path.join(ROOT, 'database', 'migrate.js'),
    encryptContacts: path.join(ROOT, 'database', 'encrypt-lostfound-contacts.js'), // <Jun Kai/>
    migrations: path.join(ROOT, 'database', 'migrations')
};
const FOLDERS = ['uploads/photos', 'uploads/processed', 'logs', 'backend/cache', 'backend/data'];
const DATA_FOLDERS = ['backend/data', 'backend/cache', 'logs'];
// backend/data/archives is the default folder of the Visitor Data Archive zips: -RemoveData never deletes it
const KEEP_IN_DATA = ['archives'];
const AUTOMATION = { laptop: 'off', wallpc: 'on' };
const NEED_ROOT = 2;
const NO_PACKAGES = 'packages missing (node_modules): run install.cmd without -SkipNpm, or npm ci';

// mysql2 comes with the packages, so a fresh copy has none until npm ci has run: null then, not a crash
function loadMysql(load = require) {
    try {
        return load('mysql2/promise');
    } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') return null;
        throw e;
    }
}

const randomHex = () => crypto.randomBytes(32).toString('hex');
// package.json asks for Node.js 22.12 or newer ("engines")
function nodeOk(version = process.versions.node) {
    const [major, minor] = String(version).replace(/^v/, '').split('.').map(Number);
    return major > 22 || (major === 22 && minor >= 12);
}
const today = () => new Date().toISOString().slice(0, 10);

// KEY=value lines, read the way dotenv reads them: the last line of a key wins, quotes and a # note are dropped
function parseEnv(text) {
    const values = new Map();
    for (const line of String(text || '').split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        const raw = m[2].trim();
        const quoted = raw.match(/^(['"`])([\s\S]*)\1/);
        values.set(m[1], quoted ? quoted[2] : raw.split('#')[0].trim());
    }
    return values;
}

// What the servers will see: a variable already in the environment wins over backend/.env (dotenv never overrides
// it), and an empty value falls back to the default
function effective(values, key, fallback = '', env = process.env) {
    const raw = env[key] !== undefined ? env[key] : values.get(key);
    return raw || fallback;
}

function dbConfig(values, env = process.env) {
    return {
        host: effective(values, 'DB_HOST', 'localhost', env),
        // the kiosk's own MySQL (install.cmd) runs on another port; db.js falls back to 3306 the same way
        port: Number(effective(values, 'DB_PORT', '', env)) || 3306,
        user: effective(values, 'DB_USER', 'kiosk_user', env),
        password: effective(values, 'DB_PASSWORD', 'kiosk123', env),
        database: effective(values, 'DB_NAME', 'dp_kiosk_db', env)
    };
}

// A new ENCRYPTION_KEY is only safe once the database could be read and nothing in it was encrypted with the
// development key that an empty one means
function keySafe(stats) {
    // <Jun Kai/> encrypted Lost & Found contacts (migration 010) depend on the key in the same way as the emails
    return stats.appUser && (!stats.databaseExists || (stats.encryptedEmails === 0 && stats.archives === 0 && !stats.encryptedContacts));
}

// The keys install fills in, judged on the file (it is what every later start reads). A value that is already there
// is never replaced, except KIOSK_AUTOMATION, which follows the role: off on a laptop (nothing starts by itself
// there, no scheduled kiosk start and no automatic fix), on for the Wall PC.
function planEnv(values, { role, safeKey, random = randomHex }) {
    const changes = [];
    const kept = [];
    if (!values.get('SESSION_SECRET')) changes.push({ key: 'SESSION_SECRET', value: random(), why: 'new random value' });
    if (!values.get('ENCRYPTION_KEY')) {
        if (safeKey) changes.push({ key: 'ENCRYPTION_KEY', value: random(), why: 'new random key' });
        else kept.push('ENCRYPTION_KEY');
    }
    const automation = AUTOMATION[role];
    const current = values.get('KIOSK_AUTOMATION') || 'on';
    if (automation && current !== automation) changes.push({ key: 'KIOSK_AUTOMATION', value: automation, why: `was ${current}` });
    return { changes, kept };
}

// Writes the changes into the .env text: the last line of a key is replaced in place, a missing key is appended
function applyEnv(text, changes, date = today()) {
    const eol = String(text).includes('\r\n') ? '\r\n' : '\n';
    const lines = text ? String(text).split(/\r?\n/) : [];
    const added = [];
    for (const { key, value } of changes) {
        const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
        let at = -1;
        lines.forEach((line, i) => { if (pattern.test(line)) at = i; });
        if (at >= 0) lines[at] = `${key}=${value}`;
        else added.push(`${key}=${value}`);
    }
    if (added.length) {
        while (lines.length && lines[lines.length - 1] === '') lines.pop();
        lines.push('', `# Added by scripts/install on ${date}`, ...added, '');
    }
    return lines.join(eol);
}

function pendingMigrations(applied) {
    if (!fs.existsSync(FILES.migrations)) return [];
    return fs.readdirSync(FILES.migrations).filter((f) => /^\d{3}_[A-Za-z0-9_-]+\.sql$/.test(f)).sort().filter((f) => !applied.has(f));
}

function readEnvFile() {
    return fs.existsSync(FILES.env) ? fs.readFileSync(FILES.env, 'utf8') : null;
}

// Read-only look at the database: can the app user log in, does the database exist, what is in it
async function inspect(cfg, mysql) {
    const stats = { reachable: false, appUser: false, databaseExists: false, tables: 0, admins: 0, encryptedEmails: 0, archives: 0, encryptedContacts: 0, plainContacts: 0, pending: [], error: null };
    let conn;
    try {
        conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
    } catch (e) {
        if (e.code === 'ER_ACCESS_DENIED_ERROR') stats.reachable = true;
        else stats.error = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(e.code) ? `MySQL does not answer on ${cfg.host} (is the MySQL service running?)` : e.message;
        return stats;
    }
    stats.reachable = true;
    stats.appUser = true;
    try {
        const [dbs] = await conn.query('SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [cfg.database]);
        stats.databaseExists = dbs.length > 0;
        if (!stats.databaseExists) return stats;
        const [rows] = await conn.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [cfg.database]);
        const tables = new Set(rows.map((r) => r.name));
        stats.tables = tables.size;
        const count = async (table, where = '') => {
            if (!tables.has(table)) return 0;
            const [[r]] = await conn.query(`SELECT COUNT(*) AS n FROM ??.?? ${where}`, [cfg.database, table]);
            return Number(r.n);
        };
        stats.admins = await count('admin_users');
        stats.encryptedEmails = await count('users', "WHERE email_encrypted IS NOT NULL AND email_encrypted <> ''");
        stats.archives = await count('visitor_archives');
        // <Jun Kai start> Lost & Found contacts: encrypted ones (they need the key) and plain ones from before migration 010
        if (tables.has('lost_found_reports')) {
            const [[column]] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'lost_found_reports' AND COLUMN_NAME = 'contact_info_encrypted'", [cfg.database]);
            const hasColumn = Number(column.n) > 0;
            if (hasColumn) stats.encryptedContacts = await count('lost_found_reports', "WHERE contact_info_encrypted IS NOT NULL AND contact_info_encrypted <> ''");
            stats.plainContacts = await count('lost_found_reports', hasColumn ? "WHERE contact_info_encrypted IS NULL AND TRIM(contact_info) <> ''" : "WHERE TRIM(contact_info) <> ''");
        }
        // <Jun Kai end>
        let applied = new Set();
        if (tables.has('schema_migrations')) {
            const [names] = await conn.query('SELECT name FROM ??.schema_migrations', [cfg.database]);
            applied = new Set(names.map((r) => r.name));
        }
        stats.pending = stats.tables ? pendingMigrations(applied) : [];
    } finally {
        await conn.end();
    }
    return stats;
}

// Hidden typing in a real console; ESG_MYSQL_ROOT_PASSWORD otherwise; null when there is no way to get it
function rootPassword(opts) {
    if (opts.rootPasswordEmpty) return Promise.resolve('');
    if (process.env.ESG_MYSQL_ROOT_PASSWORD !== undefined) return Promise.resolve(process.env.ESG_MYSQL_ROOT_PASSWORD);
    if (opts.nonInteractive || !process.stdin.isTTY) return Promise.resolve(null);
    return new Promise((resolve) => {
        const stdin = process.stdin;
        let typed = '';
        process.stdout.write('   MySQL root password (typing is hidden): ');
        stdin.setRawMode(true);
        stdin.setEncoding('utf8');
        stdin.resume();
        const done = () => { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData); process.stdout.write('\n'); resolve(typed); };
        function onData(chunk) {
            for (const c of chunk) {
                if (c === '\r' || c === '\n') return done();
                if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); }
                if (c === '\b' || c === '\u007f') typed = typed.slice(0, -1);
                else typed += c;
            }
        }
        stdin.on('data', onData);
    });
}

async function asRoot(cfg, mysql, password, work) {
    const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: process.env.ESG_MYSQL_ROOT_USER || 'root', password });
    try { return await work(conn); } finally { await conn.end(); }
}

// Root does the three things the app user may not: the database, the user, and the user's rights on the database
async function rootSetup(cfg, mysql, password, log) {
    await asRoot(cfg, mysql, password, async (conn) => {
        await conn.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [cfg.database]);
        await conn.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [cfg.user, 'localhost', cfg.password]);
        await conn.query('GRANT ALL PRIVILEGES ON ??.* TO ?@?', [cfg.database, cfg.user, 'localhost']);
        const [[ev]] = await conn.query('SELECT @@GLOBAL.event_scheduler AS v');
        if (String(ev.v).toUpperCase() !== 'ON') await conn.query('SET GLOBAL event_scheduler = ON');
    });
    log(`database ${cfg.database} and user ${cfg.user} are there, with the user's rights on the database`);
}

function runMigrations(cfg) {
    const env = { ...process.env, DB_HOST: cfg.host, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.database };
    delete env.ESG_MYSQL_ROOT_PASSWORD;
    const run = spawnSync(process.execPath, [FILES.migrate, 'up'], { cwd: ROOT, env, encoding: 'utf8' });
    for (const line of `${run.stdout || ''}${run.stderr || ''}`.split(/\r?\n/).filter(Boolean)) console.log(`         ${line}`);
    if (run.status !== 0) throw new Error('database/migrate.js up failed (see the lines above)');
}

// <Jun Kai start> Lost & Found reports saved before migration 010 keep their contact in plain text until this runs. It is
// safe to run twice and checks each value by decrypting it again before the plain one goes. A failure is only a
// warning: the admin page still shows old contacts through the password check, and the command can be run by hand.
function encryptOldContacts(cfg) {
    const env = { ...process.env, DB_HOST: cfg.host, DB_USER: cfg.user, DB_PASSWORD: cfg.password, DB_NAME: cfg.database };
    delete env.ESG_MYSQL_ROOT_PASSWORD;
    const run = spawnSync(process.execPath, [FILES.encryptContacts, '--apply'], { cwd: ROOT, env, encoding: 'utf8' });
    const lines = `${run.stdout || ''}${run.stderr || ''}`.split(/\r?\n/).filter((line) => line && !/Connected to MySQL/.test(line));
    for (const line of lines) console.log(`         ${line}`);
    if (run.status === 0) say.ok('Lost & Found contacts saved before migration 010 are now encrypted');
    else {
        say.note('the old Lost & Found contacts could not all be encrypted (see the lines above); nothing was lost.');
        say.info('Run it again later in the app folder: node database/encrypt-lostfound-contacts.js --apply');
    }
}
// <Jun Kai end>

const say = {
    ok: (t) => console.log(`   ok    ${t}`),
    info: (t) => console.log(`         ${t}`),
    note: (t) => console.log(`   note  ${t}`),
    would: (t) => console.log(`   would ${t}`),
    bad: (t) => console.log(`   error ${t}`)
};

async function install(opts) {
    const mysql = loadMysql();
    const role = opts.role === 'wallpc' ? 'wallpc' : 'laptop';
    const dry = opts.dryRun;
    const act = (what, fn) => { if (dry) return say.would(what); fn(); say.ok(what); };

    for (const folder of FOLDERS) {
        if (!fs.existsSync(path.join(ROOT, folder))) act(`create the folder ${folder}`, () => fs.mkdirSync(path.join(ROOT, folder), { recursive: true }));
    }

    let text = readEnvFile();
    if (text === null) {
        act('create backend/.env from backend/.env.example', () => fs.copyFileSync(FILES.example, FILES.env));
        text = fs.readFileSync(dry ? FILES.example : FILES.env, 'utf8');
    }
    const values = parseEnv(text);
    const cfg = dbConfig(values);

    // a dry run on a fresh copy: npm ci would come first, so the database cannot be read yet
    if (!mysql) {
        if (!dry) { say.bad(NO_PACKAGES); return 1; }
        const plan = planEnv(values, { role, safeKey: false });
        for (const change of plan.changes) say.would(`set ${change.key} in backend/.env (${change.why})`);
        if (plan.kept.includes('ENCRYPTION_KEY')) say.would('set ENCRYPTION_KEY once the database shows that no stored email depends on the development key');
        say.would(`make the database ${cfg.database} and its user if needed (the MySQL root password is asked once), load database/schema.sql while it is empty and apply every migration`);
        say.note('npm ci has not run in this copy yet, so this dry run cannot read the database (the real install does, after npm ci)');
        return 0;
    }

    let stats = await inspect(cfg, mysql);
    if (stats.error) { say.bad(stats.error); return 1; }

    // the app user cannot log in, or cannot see or create the database: root has to make them
    let reachable = stats.appUser && stats.databaseExists;
    if (stats.appUser && !stats.databaseExists) {
        if (dry) {
            say.would(`create the database ${cfg.database} (asking for the MySQL root password if ${cfg.user} may not)`);
            reachable = true;
        } else {
            try {
                const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
                try { await conn.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [cfg.database]); } finally { await conn.end(); }
                reachable = true;
                say.ok(`create the database ${cfg.database}`);
            } catch (e) {
                if (!/denied/i.test(e.message)) throw e;
            }
        }
    }
    if (!reachable) {
        const reason = stats.appUser ? `${cfg.user} may not create the database ${cfg.database}` : `${cfg.user} cannot log in to MySQL yet`;
        if (dry) say.would(`ask for the MySQL root password (${reason}) and create the database and the user`);
        else {
            say.info(`${reason}: the MySQL root password is needed once.`);
            const password = await rootPassword(opts);
            if (password === null) {
                say.bad('no way to ask for the MySQL root password here. Run install.cmd in a normal window, or set ESG_MYSQL_ROOT_PASSWORD.');
                return NEED_ROOT;
            }
            await rootSetup(cfg, mysql, password, say.ok);
            stats = await inspect(cfg, mysql);
            if (!stats.appUser) {
                await asRoot(cfg, mysql, password, (conn) => conn.query('ALTER USER ?@? IDENTIFIED BY ?', [cfg.user, 'localhost', cfg.password]));
                say.ok(`${cfg.user} already existed with another password; it now uses DB_PASSWORD from backend/.env`);
                stats = await inspect(cfg, mysql);
            }
            if (!stats.appUser) { say.bad(`${cfg.user} still cannot log in to MySQL`); return 1; }
        }
    }
    if (!dry) stats = await inspect(cfg, mysql);

    // the key decision needs the database read first: an empty key may already protect stored emails
    const plan = planEnv(values, { role, safeKey: keySafe(stats) });
    if (plan.changes.length && !dry) fs.writeFileSync(FILES.env, applyEnv(text, plan.changes));
    for (const change of plan.changes) (dry ? say.would : say.ok)(`set ${change.key} in backend/.env (${change.why})`);
    if (!plan.changes.length && !plan.kept.length) say.ok('backend/.env already has SESSION_SECRET, ENCRYPTION_KEY and the right KIOSK_AUTOMATION');
    if (plan.kept.includes('ENCRYPTION_KEY')) {
        if (!stats.appUser) say.would('set ENCRYPTION_KEY once the database shows that no stored email depends on the development key');
        else {
            say.note(`ENCRYPTION_KEY is empty, but the database already holds ${stats.encryptedEmails} encrypted email(s), ${stats.encryptedContacts || 0} encrypted Lost & Found contact(s) and ${stats.archives} archive(s).`); // <Jun Kai/> contacts
            say.info('A new key is NOT set: it would make them unreadable. See docs/features/install.md, "Encryption key".');
        }
    }

    const fresh = !stats.databaseExists || stats.tables === 0;
    if (fresh && dry) say.would(`load database/schema.sql into the empty database ${cfg.database}`);
    else if (fresh) {
        const conn = await mysql.createConnection({ ...cfg, multipleStatements: true });
        try { await conn.query(fs.readFileSync(FILES.schema, 'utf8')); } finally { await conn.end(); }
        say.ok(`load database/schema.sql into the empty database ${cfg.database}`);
    } else {
        say.ok(`${cfg.database} has ${stats.tables} tables: kept as they are (nothing is dropped)`);
    }
    if (dry) {
        if (fresh) say.would('apply every migration in database/migrations');
        else if (stats.pending.length) say.would(`apply ${stats.pending.length} new migration(s): ${stats.pending.join(', ')}`);
        else say.ok('every migration is already applied');
        if (stats.plainContacts) say.would(`encrypt the contact of ${stats.plainContacts} Lost & Found report(s) saved before migration 010`); // <Jun Kai/>
        return 0;
    }
    runMigrations(cfg);

    stats = await inspect(cfg, mysql);
    if (stats.tables < 14 || stats.admins < 1 || stats.pending.length) {
        say.bad(`the database check failed: ${stats.tables} tables, ${stats.admins} admin(s), ${stats.pending.length} migration(s) pending`);
        return 1;
    }
    say.ok(`database ${cfg.database}: ${stats.tables} tables, ${stats.admins} admin account(s), every migration applied`);
    if (stats.plainContacts) encryptOldContacts(cfg); // <Jun Kai/> after the key in backend/.env is final and every migration is in
    // the command line installer sets the first admin account right after (set-admin), so the default is never shown there
    if (fresh && !opts.adminLater) say.note('first login on the admin page: systemadmin / SystemAdmin123! (change the password on the Users page)');
    return 0;
}

async function check() {
    const mysql = loadMysql();
    let problems = 0;
    if (nodeOk()) say.ok(`Node.js ${process.version}`);
    else { say.bad(`Node.js ${process.version} is too old: install Node.js 22 LTS (22.12 or newer)`); problems++; }
    if (mysql) say.ok('packages installed (node_modules)');
    else { say.bad('packages missing: run install.cmd (or npm ci)'); problems++; }

    const text = readEnvFile();
    const values = parseEnv(text || '');
    if (text === null) { say.bad('backend/.env is missing: run install.cmd'); problems++; }
    else {
        const state = (key) => (effective(values, key) ? 'set' : 'EMPTY');
        say.ok(`backend/.env: SESSION_SECRET ${state('SESSION_SECRET')}, ENCRYPTION_KEY ${state('ENCRYPTION_KEY')}, KIOSK_AUTOMATION=${effective(values, 'KIOSK_AUTOMATION', 'on')}`);
        if (!effective(values, 'ENCRYPTION_KEY')) say.note('ENCRYPTION_KEY is empty: the public development key encrypts visitor emails');
    }
    const missingFolders = FOLDERS.filter((f) => !fs.existsSync(path.join(ROOT, f)));
    if (missingFolders.length) say.note(`folders the servers write to are missing: ${missingFolders.join(', ')} (install.cmd makes them)`);

    const cfg = dbConfig(values);
    if (!mysql) { say.note('the database is checked once the packages are installed'); return 1; }
    const stats = await inspect(cfg, mysql);
    if (stats.error) { say.bad(stats.error); return 1; }
    if (!stats.appUser) { say.bad(`MySQL answers, but ${cfg.user} cannot log in: run install.cmd`); return 1; }
    if (!stats.databaseExists || !stats.tables) { say.bad(`the database ${cfg.database} is missing or empty: run install.cmd`); return 1; }
    say.ok(`database ${cfg.database}: ${stats.tables} tables, ${stats.admins} admin account(s)`);
    if (stats.pending.length) { say.bad(`${stats.pending.length} migration(s) not applied yet: npm run db:migrate`); problems++; }
    else say.ok('every migration applied');
    return problems ? 1 : 0;
}

// What -RemoveData deletes: whole folders, except that backend/data loses everything but its archives folder
function dataRemoval(existing) {
    return DATA_FOLDERS.filter((folder) => existing.includes(folder)).map((folder) => (folder === 'backend/data'
        ? { folder, keep: KEEP_IN_DATA, text: 'delete the files in backend/data, keeping backend/data/archives (the archive zips)' }
        : { folder, keep: [], text: `delete the folder ${folder}` }));
}

// Uninstall -RemoveData: the database (its name typed again) and the runtime folders. backend/.env and the archive
// zips stay: an archive can only be opened with the ENCRYPTION_KEY that wrote it.
async function removeData(opts) {
    const cfg = dbConfig(parseEnv(readEnvFile() || ''));
    if (opts.database !== cfg.database) {
        say.bad(`the name typed (${opts.database || 'nothing'}) is not the database of this copy (${cfg.database}): nothing removed`);
        return 1;
    }
    if (opts.dryRun) {
        say.would(`drop the database ${cfg.database}`);
        for (const step of dataRemoval(DATA_FOLDERS.filter((f) => fs.existsSync(path.join(ROOT, f))))) say.would(step.text);
        return 0;
    }
    const mysql = loadMysql();
    if (!mysql) { say.bad(`${NO_PACKAGES}; nothing removed`); return 1; }
    try {
        const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
        try { await conn.query('DROP DATABASE IF EXISTS ??', [cfg.database]); } finally { await conn.end(); }
    } catch (e) {
        if (!/denied/i.test(e.message)) { say.bad(e.message); return 1; }
        const password = await rootPassword(opts);
        if (password === null) { say.bad('the MySQL root password is needed to drop the database'); return NEED_ROOT; }
        await asRoot(cfg, mysql, password, (conn) => conn.query('DROP DATABASE IF EXISTS ??', [cfg.database]));
    }
    say.ok(`dropped the database ${cfg.database}`);
    for (const step of dataRemoval(DATA_FOLDERS.filter((f) => fs.existsSync(path.join(ROOT, f))))) {
        const target = path.join(ROOT, step.folder);
        if (!target.startsWith(ROOT + path.sep)) continue;
        if (step.keep.length) {
            for (const name of fs.readdirSync(target)) if (!step.keep.includes(name)) fs.rmSync(path.join(target, name), { recursive: true, force: true });
        } else {
            fs.rmSync(target, { recursive: true, force: true });
        }
        say.ok(step.text);
    }
    return 0;
}

// KEY=value lines with the value kept exactly as written (quotes too), so a key copied from an old PC's .env keeps
// its meaning; the last line of a key wins
function rawEnvLines(text) {
    const values = new Map();
    for (const line of String(text || '').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (m) values.set(m[1], m[2].trim());
    }
    return values;
}

function readStdin() {
    return new Promise((resolve) => {
        let text = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => { text += chunk; });
        process.stdin.on('end', () => resolve(text));
    });
}

// set-env: the command line installer hands over the database login, ports and moved keys on stdin, never as
// arguments (a process list would show them). A missing backend/.env starts from backend/.env.example.
async function setEnv(opts, input) {
    const changes = [...rawEnvLines(input === undefined ? await readStdin() : input)].map(([key, value]) => ({ key, value }));
    let text = readEnvFile();
    if (text === null) {
        fs.copyFileSync(FILES.example, FILES.env);
        text = fs.readFileSync(FILES.env, 'utf8');
    }
    if (changes.length) fs.writeFileSync(FILES.env, applyEnv(text, changes));
    say.ok(`backend/.env: ${changes.length ? changes.map((c) => c.key).join(', ') : 'nothing'} set`);
    return 0;
}

// The rules for the first admin account: the app's own minimum of 8 characters, bcrypt's limit of 72 bytes, and
// never the public default password
function adminProblem(username, password) {
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(username || '')) return 'the user name needs 3 to 50 letters, digits, dots, dashes or underscores';
    if (!password || password.length < 8) return 'the admin password needs at least 8 characters';
    if (Buffer.byteLength(password, 'utf8') > 72) return 'the admin password is too long (72 bytes at most)';
    if (password === 'SystemAdmin123!') return 'that is the public default password; choose another';
    if (password.toLowerCase() === username.toLowerCase()) return 'the password cannot be the user name';
    return null;
}

// set-admin: systemadmin gets the typed password. Another user name becomes a System Admin of its own and
// systemadmin gets a long random password nobody knows, so the default password never works on an installed PC.
async function setAdmin() {
    const username = String(process.env.KIOSK_ADMIN_USER || 'systemadmin').trim();
    const password = String(process.env.KIOSK_ADMIN_PASSWORD || '');
    const problem = adminProblem(username, password);
    if (problem) { say.bad(problem); return 1; }
    const mysql = loadMysql();
    if (!mysql) { say.bad(NO_PACKAGES); return 1; }
    const bcrypt = require('bcrypt');
    const cfg = dbConfig(parseEnv(readEnvFile() || ''));
    const conn = await mysql.createConnection(cfg);
    try {
        const hash = await bcrypt.hash(password, 12);
        if (username === 'systemadmin') {
            const [r] = await conn.query("UPDATE admin_users SET password_hash = ?, is_active = 1 WHERE username = 'systemadmin'", [hash]);
            if (!r.affectedRows) await conn.query("INSERT INTO admin_users (username, full_name, password_hash, role) VALUES ('systemadmin', 'System Administrator', ?, 'system_admin')", [hash]);
        } else {
            await conn.query("INSERT INTO admin_users (username, full_name, password_hash, role) VALUES (?, ?, ?, 'system_admin') ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'system_admin', is_active = 1, is_deleted = 0", [username, username, hash]);
            const unknown = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
            await conn.query("UPDATE admin_users SET password_hash = ? WHERE username = 'systemadmin'", [unknown]);
        }
    } finally {
        await conn.end();
    }
    say.ok(`first admin account: ${username} (System Admin), with the password that was typed`);
    if (username !== 'systemadmin') say.info('systemadmin has a long random password now, so the public default password does not work');
    return 0;
}

function parseArgs(argv) {
    const opts = { command: argv[0], dryRun: argv.includes('--dry-run'), nonInteractive: argv.includes('--non-interactive'), rootPasswordEmpty: argv.includes('--root-password-empty'), adminLater: argv.includes('--admin-later') };
    const value = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
    opts.role = (value('--role') || '').toLowerCase();
    opts.database = value('--database');
    return opts;
}

if (require.main === module) {
    const opts = parseArgs(process.argv.slice(2));
    const commands = { install, check, 'remove-data': removeData, 'set-env': setEnv, 'set-admin': setAdmin };
    const run = commands[opts.command];
    if (!run) {
        console.log('usage: node scripts/install/setup.js check | install --role laptop|wallpc [--dry-run] | remove-data --database <name> | set-env | set-admin');
        process.exit(1);
    }
    run(opts).then((code) => process.exit(code), (e) => { say.bad(e.message); process.exit(1); });
}

module.exports = { parseEnv, effective, dbConfig, keySafe, encryptOldContacts, planEnv, applyEnv, parseArgs, pendingMigrations, dataRemoval, loadMysql, nodeOk, rawEnvLines, adminProblem, AUTOMATION, FOLDERS, DATA_FOLDERS, KEEP_IN_DATA };
// <Jun Kai end>
