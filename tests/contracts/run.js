#!/usr/bin/env node
// Contract checks: things that are wrong in this codebase even though the files parse.
// Run: node tests/contracts/run.js            (fails on any violation)
//      node tests/contracts/run.js --update-snapshot   (rewrites tests/contracts/routes.snapshot.txt)
// Every check prints its violations with file:line so the fix is obvious.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'legacy', 'uploads', 'assets', 'logs', 'docs', 'Team_Documentation']);
const UPDATE_SNAPSHOT = process.argv.includes('--update-snapshot');
const SNAPSHOT_FILE = path.join(__dirname, 'routes.snapshot.txt');

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); } else out.push(rel(path.join(dir, e.name)));
  }
  return out;
}
const ALL = walk(ROOT);
const JS = ALL.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
const BACKEND_JS = JS.filter((f) => f.startsWith('backend/'));
const FRONTEND_JS = JS.filter((f) => f.startsWith('frontend/'));
const HTML = ALL.filter((f) => f.startsWith('frontend/') && f.endsWith('.html'));

const checks = [];
function check(name, fn) { checks.push({ name, fn }); }

// ---------------------------------------------------------------- 1. syntax
check('syntax: every JS file and inline <script> parses', () => {
  const problems = [];
  for (const f of JS) {
    const r = spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
    if (r.status !== 0) problems.push(`${f}: ${(r.stderr || '').split('\n').find((l) => l.trim()) || 'syntax error'}`);
  }
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kiosk-inline-'));
  for (const h of HTML) {
    const text = read(h);
    let i = 0;
    for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/.test(m[1]) || !m[2].trim() || /type\s*=\s*["'](?!text\/javascript|module)/.test(m[1])) continue;
      const file = path.join(tmp, `${h.replace(/[\\/.]/g, '_')}_${++i}.${/type\s*=\s*["']module/.test(m[1]) ? 'mjs' : 'js'}`);
      fs.writeFileSync(file, m[2]);
      const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (r.status !== 0) problems.push(`${h}:${lineOf(text, m.index)} inline script: ${(r.stderr || '').split('\n').find((l) => l.trim())}`);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return problems;
});

// ---------------------------------------------------------------- route table
function buildRouteTable() {
  const routes = [];
  const serverFiles = ['backend/server.js', 'backend/kioskServer.js'].filter((f) => fs.existsSync(path.join(ROOT, f)));
  const mounts = new Map(); // router file -> Set(prefix)
  for (const sf of serverFiles) {
    const text = read(sf);
    const reqs = {};
    const resolveReq = (spec) => path.posix.normalize(path.posix.join(path.posix.dirname(sf), spec)).replace(/(\.js)?$/, '.js');
    for (const m of text.matchAll(/const\s+(\w+)\s*=\s*require\(['"](\.\.?\/[\w/.-]+)['"]\)/g)) reqs[m[1]] = resolveReq(m[2]);
    for (const m of text.matchAll(/const\s*\{[^}]*\brouter\s*:\s*(\w+)[^}]*\}\s*=\s*require\(['"](\.\.?\/[\w/.-]+)['"]\)/g)) reqs[m[1]] = resolveReq(m[2]);
    for (const m of text.matchAll(/app\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)/g)) {
      if (!reqs[m[2]]) continue;
      if (!mounts.has(reqs[m[2]])) mounts.set(reqs[m[2]], new Set());
      mounts.get(reqs[m[2]]).add(m[1]);
    }
    for (const m of text.matchAll(/app\.(get|post|put|delete|patch|all)\(\s*(\[[^\]]*\]|['"`][^'"`]+['"`])/g)) {
      const paths = m[2].startsWith('[') ? [...m[2].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]) : [m[2].slice(1, -1)];
      for (const p of paths) routes.push({ method: m[1].toUpperCase(), path: p, file: sf, line: lineOf(text, m.index) });
    }
  }
  for (const [file, prefixes] of [...mounts.entries()].sort()) {
    if (!fs.existsSync(path.join(ROOT, file))) continue;
    const text = read(file);
    for (const m of text.matchAll(/router\.(get|post|put|delete|patch|all)\(\s*(\[[^\]]*\]|['"`][^'"`]+['"`])/g)) {
      const paths = m[2].startsWith('[') ? [...m[2].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]) : [m[2].slice(1, -1)];
      for (const prefix of [...prefixes].sort()) for (const p of paths)
        routes.push({ method: m[1].toUpperCase(), path: (prefix + (p === '/' ? '' : p)).replace(/\/+/g, '/'), file, line: lineOf(text, m.index) });
    }
  }
  for (const f of BACKEND_JS) {
    if (serverFiles.includes(f) || mounts.has(f)) continue;
    const text = read(f);
    for (const m of text.matchAll(/\bapp\.(get|post|put|delete|patch|all)\(\s*['"`]([^'"`]+)['"`]/g))
      routes.push({ method: m[1].toUpperCase(), path: m[2], file: f, line: lineOf(text, m.index) });
  }
  return routes;
}
const routeRegex = (p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:\w+\??/g, '[^/]+') + '/?$');
const ROUTES = buildRouteTable();

// ---------------------------------------------------------------- 1b. relative requires resolve
check('requires: every relative require() points at a file that exists', () => {
  const problems = [];
  const files = JS.filter((f) => !f.startsWith('frontend/'));
  for (const f of files) {
    const text = read(f);
    for (const m of text.matchAll(/require\((['"])(\.\.?\/[^'"]+)\1\)/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[2]));
      const candidates = [target, `${target}.js`, `${target}.json`, `${target}/index.js`];
      if (!candidates.some((c) => fs.existsSync(path.join(ROOT, c)))) problems.push(`${f}:${lineOf(text, m.index)} require('${m[2]}') does not resolve`);
    }
  }
  return problems;
});

// ---------------------------------------------------------------- 2. frontend /api paths exist
check('routes: every /api path the frontend calls is registered', () => {
  const matchers = ROUTES.map((r) => ({ ...r, re: routeRegex(r.path) }));
  const problems = [];
  const seen = new Map();
  for (const f of [...FRONTEND_JS, ...HTML]) {
    const text = read(f);
    const consts = {};
    for (const m of text.matchAll(/(?:const|let|var)\s+([A-Z_][A-Z0-9_]*)\s*=\s*['"](\/api\/[^'"]*)['"]/g)) consts[m[1]] = m[2];
    for (const m of text.matchAll(/(\/api\/(?:[A-Za-z0-9_\-.\/:]|\$\{[^}]*\})*)/g)) {
      // Part of a full URL to another site (e.g. https://api-open.data.gov.sg/v2/real-time/api/rainfall), not our /api.
      const literalStart = Math.max(text.lastIndexOf("'", m.index), text.lastIndexOf('"', m.index), text.lastIndexOf('`', m.index));
      if (text.slice(literalStart + 1, m.index).includes('://')) continue;
      let p = m[1].replace(/\$\{[^}]*\}/g, '__X__').replace(/[.:]+$/, '').replace(/\/+$/, '') || m[1];
      const key = p;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(`${f}:${lineOf(text, m.index)}`);
    }
    for (const m of text.matchAll(/`\$\{([A-Z_][A-Z0-9_]*)\}(\/[^`]*)`/g)) {
      if (!consts[m[1]]) continue;
      const p = (consts[m[1]] + m[2]).replace(/\$\{[^}]*\}/g, '__X__').replace(/\/+$/, '');
      if (!seen.has(p)) seen.set(p, []);
      seen.get(p).push(`${f}:${lineOf(text, m.index)}`);
    }
  }
  for (const [p, locs] of [...seen.entries()].sort()) {
    if (/^\/api\/(admin|feedback|tree|pulse|pledgeboard)$/.test(p)) continue; // base-url constants
    const probe = p.replace(/__X__/g, 'x');
    const dynTail = p.endsWith('__X__');
    const prefix = p.replace(/__X__$/, '');
    const ok = matchers.some((r) => r.re.test(probe)) || (dynTail && matchers.some((r) => r.path.startsWith(prefix) || r.re.test(probe + '/x')));
    if (!ok) problems.push(`${p}  <- ${locs.slice(0, 3).join(', ')}${locs.length > 3 ? ` (+${locs.length - 3} more)` : ''}`);
  }
  return problems;
});

// ---------------------------------------------------------------- 3. inline handlers are defined
const BUILTIN = new Set(['event', 'this', 'confirm', 'alert', 'prompt', 'console', 'window', 'document', 'location', 'history', 'encodeURIComponent',
  'decodeURIComponent', 'parseInt', 'parseFloat', 'String', 'Number', 'Boolean', 'setTimeout', 'clearTimeout', 'open', 'close', 'print', 'Math', 'JSON',
  'Array', 'Object', 'Date', 'requestAnimationFrame', 'scrollTo', 'if', 'for', 'while', 'return', 'function', 'typeof', 'void', 'new', 'Promise',
  'fetch', 'Error', 'arguments', 'switch', 'catch', 'else', 'isNaN']);
function pageScripts(h) {
  const text = read(h); const scripts = [];
  for (const m of text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const src = m[1].replace(/[?#].*$/, ''); if (/^https?:/.test(src)) continue;
    const candidate = src.startsWith('/') ? `frontend${src}` : `${path.posix.dirname(h)}/${src}`;
    if (fs.existsSync(path.join(ROOT, candidate))) scripts.push(candidate);
  }
  return scripts;
}
function definitionsIn(texts) {
  const defs = new Set();
  for (const t of texts) {
    for (const m of t.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defs.add(m[1]);
    for (const m of t.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) defs.add(m[1]);
    for (const m of t.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) defs.add(m[1]);
  }
  return defs;
}
check('handlers: every inline on*="..." names a function the page defines', () => {
  const problems = [];
  for (const h of HTML) {
    const text = read(h);
    const inline = [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter((m) => !/\bsrc=/.test(m[1])).map((m) => m[2]);
    const defs = definitionsIn([...pageScripts(h).map(read), ...inline]);
    const live = text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
    for (const m of live.matchAll(/\son[a-z]+\s*=\s*(["'])([\s\S]*?)\1/gi)) {
      for (const c of m[2].matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
        if (BUILTIN.has(c[2]) || defs.has(c[2])) continue;
        problems.push(`${h}:${lineOf(text, m.index)} calls ${c[2]}() which is not defined`);
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------- 4. element ids exist
check('ids: every element id a page script looks up exists in that page', () => {
  const problems = [];
  for (const h of HTML) {
    const html = read(h);
    const htmlIds = new Set([...html.matchAll(/\bid\s*=\s*["']([^"'\s]+)["']/g)].map((m) => m[1]));
    const scripts = pageScripts(h);
    const created = new Set(); // ids any script of the page builds at runtime
    for (const s of scripts) {
      const js = read(s);
      for (const m of js.matchAll(/\bid\s*=\s*\\?["']([A-Za-z0-9_-]+)\\?["']/g)) created.add(m[1]);
      for (const m of js.matchAll(/\.id\s*=\s*["'`]([A-Za-z0-9_-]+)["'`]/g)) created.add(m[1]);
      for (const m of js.matchAll(/\bid:\s*["'`]([A-Za-z0-9_-]+)["'`]/g)) created.add(m[1]);
    }
    for (const s of scripts) {
      const js = read(s);
      const used = new Map();
      for (const m of js.matchAll(/getElementById\(\s*["']([^"'`]+)["']\s*\)/g)) used.set(m[1], lineOf(js, m.index));
      for (const m of js.matchAll(/querySelector(?:All)?\(\s*["']#([A-Za-z0-9_-]+)["']\s*\)/g)) used.set(m[1], lineOf(js, m.index));
      for (const [id, line] of used) {
        if (htmlIds.has(id) || created.has(id)) continue;
        const stem = id.split(/\d+/)[0];
        if (/\d/.test(id) && /\$\{/.test(js) && new RegExp(`["'\`]${stem.replace(/-/g, '\\-')}`).test(js)) continue; // built from a template
        problems.push(`${s}:${line} looks up #${id}, which ${path.basename(h)} does not contain`);
      }
    }
  }
  return problems;
});

// ---------------------------------------------------------------- 5. duplicate functions
check('duplicates: no top-level function is declared twice in a file or across one page\'s scripts', () => {
  const problems = [];
  const groups = [...[...FRONTEND_JS, ...BACKEND_JS].map((f) => [f]), ...HTML.map((h) => pageScripts(h)).filter((s) => s.length > 1)];
  for (const group of groups) {
    const seen = new Map();
    for (const f of group) {
      const text = read(f);
      for (const m of text.matchAll(/(?:^|\n)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
        if (!seen.has(m[1])) seen.set(m[1], []);
        seen.get(m[1]).push(`${f}:${lineOf(text, m.index + 1)}`);
      }
    }
    for (const [name, where] of seen) if (where.length > 1) problems.push(`${name} declared at ${where.join(' and ')} (only the last one runs)`);
  }
  return [...new Set(problems)];
});

// ---------------------------------------------------------------- 6. env contract
check('env: process.env names and backend/.env.example agree', () => {
  const problems = [];
  const used = new Map();
  for (const f of [...BACKEND_JS, 'startAll.js'].filter((f) => fs.existsSync(path.join(ROOT, f)))) {
    const text = read(f);
    for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) if (!used.has(m[1])) used.set(m[1], `${f}:${lineOf(text, m.index)}`);
  }
  const examplePath = path.join(ROOT, 'backend/.env.example');
  if (!fs.existsSync(examplePath)) return ['backend/.env.example is missing'];
  const example = new Set([...fs.readFileSync(examplePath, 'utf8').matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]));
  for (const [k, loc] of used) if (!example.has(k)) problems.push(`${k} is read at ${loc} but not listed in backend/.env.example`);
  for (const k of example) if (!used.has(k)) problems.push(`${k} is in backend/.env.example but nothing reads it`);
  return problems;
});

// ---------------------------------------------------------------- 7. SQL tables exist
check('sql: every table name in backend SQL exists in database/schema.sql or a migration', () => {
  const migrationFiles = fs.readdirSync(path.join(ROOT, 'database/migrations')).filter((f) => f.endsWith('.sql')).sort();
  const schema = read('database/schema.sql') + String.fromCharCode(10) + migrationFiles.map((f) => read('database/migrations/' + f)).join(String.fromCharCode(10));
  const tables = new Set([...schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/gi)].map((m) => m[1].toLowerCase()));
  const KW = new Set(['select', 'dual', 'information_schema', 'current_timestamp', 'where', 'set', 'values', 'and', 'or', 'on', 'as', 'the', 'a', 'to', 'new', 'if', 'is']);
  const problems = []; const seen = new Set();
  for (const f of BACKEND_JS) {
    const text = read(f);
    for (const m of text.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+`?([A-Za-z_][\w]*)`?/g)) {
      const t = m[1].toLowerCase();
      if (KW.has(t) || tables.has(t)) continue;
      const lineText = text.split('\n')[lineOf(text, m.index) - 1];
      const before = lineText.slice(0, lineText.indexOf(m[0]) + 1);
      if (!/['"`]/.test(before) && !/^\s*(SELECT|FROM|JOIN|INSERT|UPDATE|DELETE|WHERE|LEFT|INNER|RIGHT)/i.test(lineText)) continue;
      const key = `${t}@${f}`; if (seen.has(key)) continue; seen.add(key);
      problems.push(`${f}:${lineOf(text, m.index)} refers to table "${m[1]}" which schema.sql does not create`);
    }
  }
  return problems;
});

// ---------------------------------------------------------------- 8. CDN pins
check('cdn: every CDN script/model URL is pinned to a version', () => {
  const problems = [];
  for (const f of [...FRONTEND_JS, ...HTML]) {
    const text = read(f);
    for (const m of text.matchAll(/https?:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|ajax\.googleapis\.com|storage\.googleapis\.com|cdn\.tailwindcss\.com)[^'"`\s)<>]*/g)) {
      const url = m[0];
      const pinned = /@\d+\.\d+\.\d+/.test(url) || /\/\d+\.\d+(\.\d+)?\//.test(url) || /storage\.googleapis\.com\/mediapipe-models\/.*\/\d+\//.test(url);
      if (!pinned || /@latest|\/latest\//.test(url)) problems.push(`${f}:${lineOf(text, m.index)} ${url}`);
    }
  }
  return problems;
});

// ---------------------------------------------------------------- 9. secrets never printed
check('secrets: no console output of keys or passwords', () => {
  const problems = [];
  for (const f of [...BACKEND_JS, 'startAll.js'].filter((f) => fs.existsSync(path.join(ROOT, f)))) {
    const text = read(f);
    for (const m of text.matchAll(/console\.(?:log|info|warn|error|debug)\(([^\n]*)\)/g)) {
      if (/(ENCRYPTION_KEY\s*=|process\.env\.(ENCRYPTION_KEY|SMTP_PASS|DB_PASSWORD|SESSION_SECRET|[A-Z_]*API_KEY)\b|password_hash\b|\bpass(word)?\s*[:=]\s*['"`]?\$\{)/.test(m[1]))
        problems.push(`${f}:${lineOf(text, m.index)} ${m[0].slice(0, 100)}`);
    }
  }
  return problems;
});

// ---------------------------------------------------------------- 10. database baseline is frozen
check('schema: database/schema.sql is unchanged and migrations are well formed', () => {
  const problems = [];
  const baselinePath = path.join(ROOT, 'database/migrations/baseline.json');
  if (!fs.existsSync(baselinePath)) return ['database/migrations/baseline.json is missing'];
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const hash = require('crypto').createHash('sha256').update(read('database/schema.sql')).digest('hex');
  if (hash !== baseline.sha256) problems.push(`database/schema.sql changed. It is the frozen baseline: add a migration with "npm run db:new -- <what-changed>" instead. If the baseline itself must change, update database/migrations/baseline.json in the same change and say why.`);
  const dir = path.join(ROOT, 'database/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
  const numbers = new Map();
  for (const f of files) {
    const m = f.match(/^(\d{3})_[A-Za-z0-9_-]+\.sql$/);
    if (!m) { problems.push(`database/migrations/${f}: name must look like 001_short_description.sql`); continue; }
    if (numbers.has(m[1])) problems.push(`database/migrations/${f} and ${numbers.get(m[1])} share the number ${m[1]}`);
    numbers.set(m[1], f);
  }
  if (!fs.existsSync(path.join(ROOT, 'database/schema.snapshot.sql'))) problems.push('database/schema.snapshot.sql is missing: run `npm run db:snapshot` and commit it');
  return problems;
});

// ---------------------------------------------------------------- 11. route snapshot
check('snapshot: the route table matches tests/contracts/routes.snapshot.txt', () => {
  const table = ROUTES.map((r) => `${r.method.padEnd(6)} ${r.path}  (${r.file})`).join('\n') + '\n';
  if (UPDATE_SNAPSHOT) { fs.writeFileSync(SNAPSHOT_FILE, table); return []; }
  if (!fs.existsSync(SNAPSHOT_FILE)) return ['routes.snapshot.txt is missing: run `npm run routes:update` and commit it'];
  const old = fs.readFileSync(SNAPSHOT_FILE, 'utf8').replace(/\r\n/g, '\n');
  if (old === table) return [];
  const a = new Set(old.split('\n')), b = new Set(table.split('\n'));
  const added = [...b].filter((l) => l && !a.has(l)), removed = [...a].filter((l) => l && !b.has(l));
  return [...added.map((l) => `added:   ${l}`), ...removed.map((l) => `removed: ${l}`), 'If this change is intended, run `npm run routes:update` and commit the snapshot in the same change.'];
});

// ---------------------------------------------------------------- run
const summary = [];
let failed = 0;
for (const c of checks) {
  let problems;
  try { problems = c.fn(); } catch (e) { problems = [`check crashed: ${e.message}`]; }
  const ok = problems.length === 0;
  if (!ok) failed++;
  summary.push(`${ok ? 'PASS' : 'FAIL'}  ${c.name}${ok ? '' : ` (${problems.length})`}`);
  if (!ok) for (const p of problems) summary.push(`        ${p}`);
}
summary.push(`\n${checks.length - failed}/${checks.length} contract checks passed; ${ROUTES.length} routes in the table`);
console.log(summary.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Contract checks\n```\n' + summary.join('\n') + '\n```\n');
}
process.exit(failed ? 1 : 0);
