#!/usr/bin/env node
// Smoke test: boots `node startAll.js`, checks the public endpoints, the admin login, one feedback
// submission, and that the server log holds no crash markers. Then stops the servers.
//
//   node tests/smoke.js              full run (submits one feedback; CI neutralises email first)
//   node tests/smoke.js --no-submit  skip the submission (safe on a machine with real email settings)
//   node tests/smoke.js --external   do not start the servers, test the ones already running
// <Jun Kai start>
//   node tests/smoke.js --archive    also archive and delete the records it seeds (a throwaway database with blank email
//                                    settings only, see archiveStep); it needs the submissions, so --no-submit skips it
// <Jun Kai end>
//
// It never calls /api/admin/server/* (stop hibernates the machine the server runs on).

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // self-signed certificate
const ROOT = path.resolve(__dirname, '..');
const ARGS = new Set(process.argv.slice(2));
const BASE = process.env.SMOKE_BASE_URL || 'https://localhost:3000';
const KIOSK = process.env.SMOKE_KIOSK_URL || 'http://localhost:3003';
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || 'systemadmin';
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || 'SystemAdmin123!';
const LOG_DIR = path.join(ROOT, 'logs');
const LOG = path.join(LOG_DIR, 'smoke-server.log');
const results = [];
const pass = (m) => results.push(`PASS ${m}`);
const fail = (m) => results.push(`FAIL ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let child = null;
function startServers() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const out = fs.openSync(LOG, 'w');
  child = spawn(process.execPath, ['startAll.js'], {
    cwd: ROOT, stdio: ['ignore', out, out], detached: process.platform !== 'win32',
    env: { PLEDGE_SENTIMENT_MODE: 'rules', KIOSK_AUTOMATION: 'off', ...process.env },
  });
}
function stopServers() {
  if (!child) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
  } catch {}
}
async function waitFor(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.status < 600) return; } catch {}
    if (child && child.exitCode !== null) throw new Error(`servers exited early with code ${child.exitCode}`);
    await sleep(1500);
  }
  throw new Error(`timeout waiting for ${url}`);
}
async function get(url, init) {
  const r = await fetch(url, { redirect: 'follow', ...init });
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch {}
  return { status: r.status, body, text, headers: r.headers };
}
async function expect(name, url, test, init) {
  try {
    const r = await get(url, init);
    const verdict = test(r);
    if (verdict === true) pass(`${name} (${r.status})`);
    else fail(`${name} (${r.status}): ${verdict || 'unexpected body ' + r.text.slice(0, 120)}`);
  } catch (e) { fail(`${name}: ${e.message}`); }
}

// 1x1 white PNG, built in code so the repo carries no binary fixture
function tinyPng() {
  const zlib = require('zlib');
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 255, 255]))), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

// <Jun Kai start>
// --archive: seeds one visitor and one lost & found report through the API, back-dates them 2 years with SQL, then
// archives and deletes exactly those records through /api/admin/visitor-archive and checks the zip, the database and
// the photo files. DB_* must point at the server's own database (it stops when /api/test-db names another one).
// The archive runs with "Leaves on the tree" on initials (the saved choice is put back afterwards): the seeded leaf
// must stay on GET /api/tree without the name or the pledge, and must not be counted as a deleted leaf.
let archiveDir = null;
async function archiveStep(cookie) {
  const crypto = require('crypto');
  const os = require('os');
  const mysql = require('mysql2/promise');
  const writer = require('../backend/features/archive/visitorWriter');
  const API = `${BASE}/api/admin/visitor-archive`;
  const dbName = process.env.DB_NAME || 'dp_kiosk_db';
  const send = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  const put = (body) => ({ ...send(body), method: 'PUT' });
  let savedLeaves = null; // the "Leaves on the tree" choice to put back
  let leafId = null;      // the seeded feedback id, whose kept leaf is removed at the end
  let vipName = null;     // the seeded VIP: its name on the VIP list and its visitor row are removed at the end
  let vipUserId = null;
  const plain = (text) => String(text).replace(/TypeError|ReferenceError/g, 'Error'); // those words fail the CI log check
  const check = (ok, name, detail) => (ok ? pass(name) : fail(detail ? `${name}: ${plain(detail)}` : name));

  await expect('GET /api/admin/visitor-archive/overview without a session is refused', `${API}/overview`, (r) => r.status === 401);
  await expect('POST /api/admin/visitor-archive/folder-check refuses a folder inside frontend/', `${API}/folder-check`, (r) => r.body && r.body.success === true && !!r.body.folder && typeof r.body.folder.problem === 'string' && r.body.folder.problem.length > 0 || r.text.slice(0, 160), send({ folder: path.join(ROOT, 'frontend', 'archives') }));
  const testDb = await get(`${BASE}/api/test-db`);
  const serverDb = testDb.body && testDb.body.database;
  if (serverDb !== dbName) return fail(`visitor archive step skipped: the server uses database ${serverDb} but DB_NAME here is ${dbName}`);

  const conn = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'kiosk_user', password: process.env.DB_PASSWORD || 'kiosk123', database: dbName, timezone: 'Z' });
  try {
    await conn.query("SET time_zone = '+00:00'");
    const stamp = Date.now();
    const name = 'Archive Smoke';
    const email = `archive+${stamp}@example.com`;
    const pledge = `I pledge to keep old visitor data safe ${stamp}`;
    const photo = await get(`${BASE}/api/feedback/save-photo`, send({ photo: tinyPng(), userName: name, device: 'kiosk' }));
    const processed = await get(`${BASE}/api/feedback/save-processed-photo`, send({ photo: tinyPng(), userName: name, device: 'kiosk', theme: 'nature' }));
    const photoId = photo.body && photo.body.photoId;
    const processedPhotoId = processed.body && processed.body.processedPhotoId;
    const [[question]] = await conn.query('SELECT id FROM questions WHERE is_active = 1 ORDER BY display_order, id LIMIT 1');
    const submitted = await get(`${BASE}/api/feedback/submit-feedback`, send({
      userData: { name, email, pledge, pledgeTopic: 'sustainable-living', photoId, processedPhotoId, answers: question ? { [question.id]: 'Yes' } : {} },
      device: 'kiosk', theme: 'nature',
    }));
    // the row is written after the reply, so wait for it and its answer
    let row = null;
    for (let i = 0; i < 20 && !row; i++) {
      const [rows] = await conn.query('SELECT f.id, f.user_id, f.data_retention, u.email_encrypted, (SELECT COUNT(*) FROM feedback_answers a WHERE a.feedback_id = f.id) AS answers FROM feedback f JOIN users u ON u.id = f.user_id WHERE f.comment = ?', [pledge]);
      if (rows[0] && Number(rows[0].answers) > 0) row = rows[0]; else await sleep(500);
    }
    const like = row ? await get(`${BASE}/api/pledgeboard/like/${row.id}`, send({ userIdentifier: `user_${stamp}_smoke` })) : null;
    const report = await get(`${BASE}/api/feedback/lost-found`, send({
      report: { type: 'lost', item: 'Smoke test umbrella', location: 'Entrance', contact: email, itemPhotoDataUrl: tinyPng(), itemPhotoName: 'umbrella.png' },
      feedbackProgress: { userData: { name, email } },
    }));
    const reportId = report.body && report.body.reportId;
    const seeded = !!(photoId && processedPhotoId && submitted.body && submitted.body.success && row && like && like.body && like.body.success && reportId);
    check(seeded, 'seed a visitor with 2 photos, an answer and a like, and a lost & found report with a photo', `photo ${photo.status}, processed ${processed.status}, submit ${submitted.status}, row ${row ? row.id : 'missing'}, like ${like ? like.status : '-'}, lost & found ${report.status}`);
    if (!seeded) return;
    // <Jun Kai start> the small photos of the Feedback list (GET /api/admin/feedback/:id/thumb/:kind): the record's own
    // photo comes back as a small webp, only to a signed-in admin, and a kind that does not exist is refused
    {
      const thumbUrl = `${BASE}/api/admin/feedback/${row.id}/thumb`;
      await expect('GET /api/admin/feedback/:id/thumb/raw sends a small webp picture', `${thumbUrl}/raw`, (r) => r.status === 200 && /image\/webp/.test(r.headers.get('content-type') || '') && r.text.length > 20 || `${r.status} ${r.headers.get('content-type')} ${r.text.slice(0, 80)}`, { headers: { cookie } });
      await expect('GET /api/admin/feedback/:id/thumb/processed sends the processed photo too', `${thumbUrl}/processed`, (r) => r.status === 200 && /image\/webp/.test(r.headers.get('content-type') || '') || `${r.status} ${r.text.slice(0, 80)}`, { headers: { cookie } });
      await expect('GET /api/admin/feedback/:id/thumb/raw without a sign-in is refused (401)', `${thumbUrl}/raw`, (r) => r.status === 401 || `${r.status}`);
      await expect('GET /api/admin/feedback/:id/thumb/<other> is refused (400)', `${thumbUrl}/other`, (r) => r.status === 400 || `${r.status}`, { headers: { cookie } });
      await expect('GET /api/admin/feedback/<unknown id>/thumb/raw answers 404', `${BASE}/api/admin/feedback/99999999/thumb/raw`, (r) => r.status === 404 || `${r.status}`, { headers: { cookie } });
    }
    // <Jun Kai end>

    // <Jun Kai start> the Lost & Found contact is stored encrypted: the admin list sends none, the password shows it
    {
      const list = await get(`${BASE}/api/admin/lost-found-reports`, { headers: { cookie } });
      const listed = list.body && Array.isArray(list.body.reports) ? list.body.reports.find((r) => Number(r.id) === Number(reportId)) : null;
      check(!!listed && listed.has_contact === true && !('contact_info' in listed) && !('contact_info_encrypted' in listed) && !('feedback_progress' in listed) && !JSON.stringify(listed).includes(email),
        'GET /api/admin/lost-found-reports sends has_contact, no contact and nothing with the visitor email', JSON.stringify(listed || {}).slice(0, 200));
      await expect('POST /api/admin/lost-found-reports/:id/contact with the admin password shows the contact', `${BASE}/api/admin/lost-found-reports/${reportId}/contact`,
        (r) => (r.body && r.body.contact === email) || `${r.status}`, send({ password: ADMIN_PASS }));
    }
    // <Jun Kai end>

    // 2 years old, past the default 12 months; last_visit and updated_at reset on every UPDATE unless they are set too
    const old = new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000);
    await conn.query('UPDATE feedback SET created_at = ? WHERE id = ?', [old, row.id]);
    await conn.query('UPDATE users SET created_at = ?, last_visit = ? WHERE id = ?', [old, old, row.user_id]);
    await conn.query('UPDATE lost_found_reports SET created_at = ?, updated_at = ? WHERE id = ?', [old, old, reportId]);
    const photoFiles = [path.join(ROOT, 'uploads', 'photos', photoId), path.join(ROOT, 'uploads', 'processed', processedPhotoId), path.join(ROOT, report.body.itemPhotoPath)];
    const onDisk = photoFiles.filter((f) => fs.existsSync(f)).length;
    check(onDisk === 3, `the 3 seeded photo files are in this checkout's uploads folder (${onDisk}/3)`);
    // a VIP leaf of the same age: a name on the VIP list with long-term consent, which the archive must leave alone
    vipName = `Vip Smoke ${stamp}`;
    await conn.query('INSERT INTO vip_management (name) VALUES (?)', [vipName]);
    const [vipUser] = await conn.query('INSERT INTO users (name, visit_count, created_at, last_visit) VALUES (?, 1, ?, ?)', [vipName, old, old]);
    vipUserId = vipUser.insertId;
    const [vipFeedback] = await conn.query("INSERT INTO feedback (user_id, comment, metadata, data_retention, created_at, is_active) VALUES (?, ?, '{}', 'longterm', ?, 1)", [vipUserId, `Vip smoke pledge ${stamp}`, old]);

    // running totals before the delete: the deleted rows go into deleted_record_counts, so the kiosk count must not drop
    const tallyOf = async () => Object.fromEntries((await conn.query('SELECT kind, SUM(record_count) AS n FROM deleted_record_counts GROUP BY kind'))[0].map((t) => [t.kind, Number(t.n)]));
    const visitorsShown = async () => { const r = await get(`${BASE}/api/feedback/visitor-count`); return r.body ? r.body.totalVisitors : null; };
    const pledgesShown = async () => { const r = await get(`${BASE}/api/feedback/visitor-count`); return r.body ? r.body.totalPledges : null; };
    const tallyBefore = await tallyOf();
    const visitorsBefore = await visitorsShown();
    const pledgesBefore = await pledgesShown();

    await expect('GET /api/admin/visitor-archive/overview with the session', `${API}/overview`, (r) => r.body && r.body.success === true && !!r.body.settings && !!r.body.due || r.text.slice(0, 160), { headers: { cookie } });

    // "Leaves on the tree": a wrong value is refused, a valid one is saved and read back; initials for this run
    const overview = await get(`${API}/overview`, { headers: { cookie } });
    const leavesBefore = overview.body && overview.body.settings ? overview.body.settings.leaves : null;
    check(['keep', 'initials', 'remove'].includes(leavesBefore), `the overview sends the "Leaves on the tree" setting (${leavesBefore})`);
    await expect('PUT /api/admin/visitor-archive/settings refuses an unknown "Leaves on the tree" value', `${API}/settings`, (r) => r.status === 400 && r.body && r.body.field === 'leaves' || r.text.slice(0, 160), put({ leaves: 'everything' }));
    if (['keep', 'initials', 'remove'].includes(leavesBefore)) savedLeaves = leavesBefore;
    for (const choice of ['remove', 'initials']) {
      await expect(`PUT /api/admin/visitor-archive/settings saves "Leaves on the tree" as ${choice}`, `${API}/settings`, (r) => r.body && r.body.success === true && r.body.settings && r.body.settings.leaves === choice || r.text.slice(0, 160), put({ leaves: choice }));
    }
    await expect('GET /api/admin/visitor-archive/overview reads the saved choice back', `${API}/overview`, (r) => r.body && r.body.settings && r.body.settings.leaves === 'initials' || r.text.slice(0, 160), { headers: { cookie } });
    // the tree shows a name only with long-term consent, and only such a leaf keeps initials
    const nameShown = ['longterm', 'indefinite'].includes(String(row.data_retention || '').toLowerCase());
    const leafLabel = nameShown ? 'A. S.' : 'Visitor';
    leafId = row.id;
    const before = new Date(Date.now() + 8 * 3600 * 1000 - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10); // a year ago, as a Singapore date
    const criteria = { types: ['feedback', 'lostFound'], feedbackBefore: before, lostFoundBefore: before, onlyResolved: false, includePhotos: true, only: { feedbackIds: [row.id, vipFeedback.insertId], lostFoundIds: [reportId] } };
    await expect('POST /api/admin/visitor-archive/preview counts the seeded records and leaves the VIP leaf out', `${API}/preview`, (r) => {
      const c = (r.body && r.body.counts) || {};
      return c.feedback === 1 && c.visitors === 1 && c.visitorsDeleted === 1 && c.answers === 1 && c.likes === 1 && c.lostFound === 1 && c.photos === 3 && c.missingPhotos === 0 && c.leaves === 1 && c.leavesNamed === (nameShown ? 1 : 0) && c.vipLeaves === 1 || r.text.slice(0, 200);
    }, send(criteria));
    await expect('POST /api/admin/visitor-archive/runs with only the VIP leaf says there is nothing to archive', `${API}/runs`, (r) => r.status === 400 && /VIP leaves stay on the tree/.test((r.body && r.body.error) || '') || r.text.slice(0, 200),
      send({ ...criteria, types: ['feedback'], only: { feedbackIds: [vipFeedback.insertId] }, password: ADMIN_PASS, deleteAfter: true }));

    archiveDir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'kiosk-archive-'));
    const started = await get(`${API}/runs`, send({ ...criteria, password: ADMIN_PASS, deleteAfter: true, folder: archiveDir }));
    const runId = started.body && started.body.runId;
    check(started.status === 202 && runId, `POST /api/admin/visitor-archive/runs starts the archive (${started.status})`, !runId && started.text.slice(0, 160));
    if (!runId) return;
    let run = null;
    for (let i = 0; i < 120; i++) {
      const r = await get(`${API}/runs/${runId}`, { headers: { cookie } });
      run = r.body && r.body.run;
      if (run && !['running', 'deleting', 'cleaning'].includes(run.status)) break;
      await sleep(500);
    }
    const c = (run && run.counts) || {};
    check(run && run.status === 'done' && !run.error && c.feedback === 1 && c.lostFound === 1 && c.visitorsDeleted === 1 && c.photos === 3, `the archive run ends as done (${run ? run.status : 'no answer'})`, run && run.error);
    check(c.leavesKept === 1 && c.leavesWithInitials === (nameShown ? 1 : 0), `the run says 1 leaf stays on the tree (${c.leavesKept} kept, ${c.leavesWithInitials} with initials)`);
    await expect('GET /api/admin/visitor-archive/runs lists the kept leaf with the run', `${API}/runs?limit=5`, (r) => {
      const listed = ((r.body && r.body.runs) || []).find((item) => item.id === runId);
      return listed && listed.counts && listed.counts.leavesKept === 1 || r.text.slice(0, 200);
    }, { headers: { cookie } });
    if (savedLeaves) {
      const restored = await get(`${API}/settings`, put({ leaves: savedLeaves }));
      check(restored.body && restored.body.success === true && restored.body.settings.leaves === savedLeaves, `the "Leaves on the tree" setting is put back (${savedLeaves})`, restored.text.slice(0, 160));
      if (restored.body && restored.body.success === true) savedLeaves = null;
    }

    const zips = fs.readdirSync(archiveDir).filter((f) => f.endsWith('.zip'));
    const file = run && run.file && run.file.name ? path.join(archiveDir, run.file.name) : null;
    const bytes = file && fs.existsSync(file) ? fs.readFileSync(file) : null;
    const sha = bytes ? crypto.createHash('sha256').update(bytes).digest('hex') : null;
    const sidecar = file && fs.existsSync(`${file}.sha256`) ? fs.readFileSync(`${file}.sha256`, 'utf8') : '';
    check(zips.length === 1 && bytes && bytes.subarray(0, 4).toString('latin1') === 'PK\x03\x04' && sha === run.file.sha256 && sidecar === `${sha}  ${run.file.name}\n`,
      `the archive is one zip that starts with PK and matches the run's SHA-256 and its .sha256 file (${zips.length} zip)`);
    if (bytes) {
      const data = await writer.readArchiveData(file);
      const zipFile = require('../backend/core/zip');
      const handle = await zipFile.openZip(file);
      let readme = '';
      try { readme = (await zipFile.readEntry(handle, (await zipFile.listEntries(handle)).get('README.txt'))).toString('utf8'); } finally { handle.close(); }
      check(readme.includes("Digital tree: 1 leaf was to stay on the tree, with the visitor's initials where the tree showed the name"), 'README.txt in the zip says that the leaf stays on the tree');
      const contact = (data.lostFound[0] && data.lostFound[0].contact_info_encrypted) || '';
      check(data.visitors[0] && data.visitors[0].email_encrypted === row.email_encrypted && /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(contact) && !JSON.stringify(data).includes(email),
        'the archive keeps the email as the same ciphertext and the lost & found contact encrypted');
      // the viewer needs the password again, and a photo it shows is never kept in the browser cache
      const photoEntry = Object.keys((data.manifest && data.manifest.entries) || {}).find((name) => name.startsWith('photos/')) || '';
      const photoUrl = `${API}/runs/${runId}/photo?entry=${encodeURIComponent(photoEntry)}`;
      await expect('GET /api/admin/visitor-archive/runs/:id/photo is refused until the password is entered again', photoUrl, (r) => r.status === 403 && r.body && r.body.locked === true || r.text.slice(0, 160), { headers: { cookie } });
      await expect('POST /api/admin/visitor-archive/unlock with the admin password', `${API}/unlock`, (r) => r.body && r.body.success === true && !!r.body.unlockedUntil || r.text.slice(0, 160), send({ password: ADMIN_PASS }));
      await expect('GET /api/admin/visitor-archive/runs/:id/photo sends the photo with Cache-Control: no-store', photoUrl, (r) => r.status === 200 && r.headers.get('cache-control') === 'no-store' && /^image\//.test(r.headers.get('content-type') || '') || `cache-control ${r.headers.get('cache-control')}, type ${r.headers.get('content-type')}: ${r.text.slice(0, 120)}`, { headers: { cookie } });
    }

    const left = [];
    for (const [table, column, id] of [['users', 'id', row.user_id], ['feedback', 'id', row.id], ['feedback_answers', 'feedback_id', row.id], ['pledge_likes', 'feedback_id', row.id], ['lost_found_reports', 'id', reportId]]) {
      const [[count]] = await conn.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`, [id]);
      if (Number(count.n)) left.push(`${table} ${count.n}`);
    }
    check(!left.length, 'the archived rows are gone from users, feedback, feedback_answers, pledge_likes and lost_found_reports', `still there: ${left.join(', ')}`);
    const [[vipLeft]] = await conn.query('SELECT COUNT(*) AS n FROM feedback f JOIN users u ON u.id = f.user_id WHERE f.id = ? AND u.id = ?', [vipFeedback.insertId, vipUserId]);
    const [[vipKept]] = await conn.query('SELECT COUNT(*) AS n FROM archived_leaves WHERE feedback_id = ?', [vipFeedback.insertId]);
    check(Number(vipLeft.n) === 1 && Number(vipKept.n) === 0, 'the VIP leaf of the same age was not archived: its submission and its visitor are still in the database');
    const tallyAfter = await tallyOf();
    const grew = (kind) => (tallyAfter[kind] || 0) - (tallyBefore[kind] || 0);
    check(['feedback', 'pledge', 'visitor', 'lost_found'].every((kind) => grew(kind) === 1) && grew('leaf') === 0, 'the deleted rows were added to deleted_record_counts (1 feedback, 1 pledge, 1 visitor, 1 lost & found) and the leaf that stays was not counted', JSON.stringify({ before: tallyBefore, after: tallyAfter }));
    const visitorsAfter = await visitorsShown();
    check(Number.isFinite(visitorsBefore) && visitorsAfter === visitorsBefore, `the kiosk visitor count does not drop after the delete (${visitorsBefore} before, ${visitorsAfter} after)`);
    const pledgesAfter = await pledgesShown();
    check(Number.isFinite(pledgesBefore) && pledgesAfter === pledgesBefore, `the all-time pledge total does not drop after the delete (${pledgesBefore} before, ${pledgesAfter} after)`);
    await expect('GET /api/pulse/summary shows the same all-time pledge total', `${BASE}/api/pulse/summary`, (r) => r.body && r.body.stats && r.body.stats.totalPledges === pledgesAfter || `pulse ${r.body && r.body.stats && r.body.stats.totalPledges} vs ${pledgesAfter}`);
    const seededYear = Number(new Date(old.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 4));
    const removedInYear = (await conn.query("SELECT COALESCE(SUM(record_count), 0) AS n FROM deleted_record_counts WHERE kind = 'leaf' AND YEAR(record_day) = ?", [seededYear]))[0][0];
    await expect(`GET /api/tree/years counts the kept leaf as a leaf of ${seededYear}, not as archived`, `${BASE}/api/tree/years`, (r) => {
      const year = ((r.body && r.body.years) || []).find((item) => Number(item.year) === seededYear);
      return year && year.keptLeafCount >= 1 && year.leafCount >= year.keptLeafCount + (year.archivedLeafCount || 0) && (year.archivedLeafCount || 0) === Number(removedInYear.n) || r.text.slice(0, 200);
    });
    // the leaf is still on that year's tree: its id, the label, no name, no pledge
    await expect(`GET /api/tree?year=${seededYear} still lists the archived visitor's leaf as "${leafLabel}"`, `${BASE}/api/tree?year=${seededYear}`, (r) => {
      const leaf = (Array.isArray(r.body) ? r.body : []).find((item) => item.id === row.id);
      if (!leaf) return `leaf ${row.id} is not in the answer: ${r.text.slice(0, 160)}`;
      const text = JSON.stringify(leaf);
      const empty = Object.entries(leaf).filter(([, value]) => value === undefined || value === 'undefined').map(([key]) => key);
      return leaf.archived === true && leaf.name === leafLabel && leaf.pledgeSnippet === '' && leaf.pledgeTopic === '' && leaf.badgeKey === 'sustainable-living-advocate'
        && !!leaf.badgeName && !!leaf.privacyLabel && !empty.length && !text.includes(name) && !r.text.includes(pledge) && !r.text.includes(email) || text.slice(0, 300);
    });
    await expect(`GET /api/tree?year=${seededYear} still shows the VIP leaf in gold with its name`, `${BASE}/api/tree?year=${seededYear}`, (r) => {
      const leaf = (Array.isArray(r.body) ? r.body : []).find((item) => item.id === vipFeedback.insertId);
      return leaf && leaf.isVip === true && leaf.name === vipName && !leaf.archived || `leaf ${vipFeedback.insertId}: ${JSON.stringify(leaf || null).slice(0, 200)}`;
    });
    const [[keptLeaf]] = await conn.query('SELECT * FROM archived_leaves WHERE feedback_id = ?', [row.id]);
    check(keptLeaf && keptLeaf.label === leafLabel && keptLeaf.badge_key === 'sustainable-living-advocate' && Number(keptLeaf.is_vip) === 0 && keptLeaf.archive_id === runId
      && Math.abs(new Date(keptLeaf.created_at).getTime() - old.getTime()) <= 1000
      && Object.keys(keptLeaf).sort().join() === 'archive_id,archived_at,badge_key,badge_keys,created_at,feedback_id,is_vip,label',
    'archived_leaves holds the leaf: its id, date, label, badge and run, and no other column', JSON.stringify(keptLeaf || null));
    const [[gate]] = await conn.query('SELECT COUNT(*) AS n FROM visitor_save_gate');
    check(Number(gate.n) === 0, `the visitor save gate is empty once the run is over (${gate.n} rows)`);

    // the old Permanent Data Deletion counts its deletes too: one archived 2-year-old visitor through delete-selected
    const [permUser] = await conn.query('INSERT INTO users (name, visit_count, created_at, last_visit) VALUES (?, 1, ?, ?)', [`Perm Smoke ${stamp}`, old, old]);
    const [permFeedback] = await conn.query("INSERT INTO feedback (user_id, comment, metadata, data_retention, created_at, is_active, archive_status) VALUES (?, ?, '{}', 'longterm', ?, 1, 'archived')", [permUser.insertId, `Perm smoke pledge ${stamp}`, old]);
    const tallyBeforePerm = await tallyOf();
    const visitorsBeforePerm = await visitorsShown();
    const pledgesBeforePerm = await pledgesShown();
    await expect('POST /api/admin/archive/delete-selected deletes the archived pledge', `${BASE}/api/admin/archive/delete-selected`, (r) => r.status === 200 && r.body && r.body.deletedCount === 1 || r.text.slice(0, 160), send({ feedbackIds: [permFeedback.insertId], password: ADMIN_PASS }));
    let permUserLeft = 1;
    for (let i = 0; i < 20 && permUserLeft; i++) { // the visitor row goes just after the reply
      const [[row]] = await conn.query('SELECT COUNT(*) AS n FROM users WHERE id = ?', [permUser.insertId]);
      permUserLeft = Number(row.n);
      if (permUserLeft) await sleep(250);
    }
    const tallyAfterPerm = await tallyOf();
    const grewPerm = (kind) => (tallyAfterPerm[kind] || 0) - (tallyBeforePerm[kind] || 0);
    check(['feedback', 'pledge', 'leaf', 'visitor'].every((kind) => grewPerm(kind) === 1) && permUserLeft === 0, 'Permanent Data Deletion adds its deletes to deleted_record_counts too (1 feedback, 1 pledge, 1 leaf, 1 visitor)', JSON.stringify({ before: tallyBeforePerm, after: tallyAfterPerm, visitorLeft: permUserLeft }));
    // Permanent Data Deletion keeps a VIP leaf: the seeded VIP's pledge is moved to Archived Feedback, then both delete ways are tried
    await conn.query("UPDATE feedback SET archive_status = 'archived' WHERE id = ?", [vipFeedback.insertId]);
    await expect('POST /api/admin/archive/preview-deletion leaves the VIP leaf out of the count', `${BASE}/api/admin/archive/preview-deletion`, (r) => r.body && r.body.success === true && r.body.count === 0 && r.body.vipKept === 1 || r.text.slice(0, 160), send({ feedbackIds: [vipFeedback.insertId] }));
    await expect('POST /api/admin/archive/delete-selected refuses to delete only a VIP leaf', `${BASE}/api/admin/archive/delete-selected`, (r) => r.status === 409 && r.body && r.body.vipKept === 1 && /VIP leaf was kept/.test(r.body.error || '') || r.text.slice(0, 200), send({ feedbackIds: [vipFeedback.insertId], password: ADMIN_PASS }));
    const [[vipStill]] = await conn.query('SELECT COUNT(*) AS n FROM feedback WHERE id = ?', [vipFeedback.insertId]);
    check(Number(vipStill.n) === 1, 'the VIP pledge is still in the database after Permanent Data Deletion was asked to delete it');
    const [[permLeaf]] = await conn.query('SELECT COUNT(*) AS n FROM archived_leaves WHERE feedback_id = ?', [permFeedback.insertId]);
    check(Number(permLeaf.n) === 0, 'Permanent Data Deletion leaves no leaf on the tree (a deliberate removal)');
    check((await visitorsShown()) === visitorsBeforePerm && (await pledgesShown()) === pledgesBeforePerm, 'the kiosk visitor count and the all-time pledge total do not drop after Permanent Data Deletion');
    const stillThere = photoFiles.filter((f) => fs.existsSync(f)).length;
    check(onDisk === 3 && stillThere === 0, `the archived photo files are gone (${stillThere} left)`);
  } catch (e) {
    fail(`visitor archive step: ${plain(e.message)}`);
  } finally {
    // a step that stopped early still puts the setting back, and the seeded leaf never stays on a developer's tree
    if (savedLeaves) await get(`${API}/settings`, put({ leaves: savedLeaves })).catch(() => {});
    if (leafId) await conn.query('DELETE FROM archived_leaves WHERE feedback_id = ?', [leafId]).catch(() => {});
    if (vipUserId) await conn.query('DELETE FROM feedback WHERE user_id = ?', [vipUserId]).then(() => conn.query('DELETE FROM users WHERE id = ?', [vipUserId])).catch(() => {});
    if (vipName) await conn.query('DELETE FROM vip_management WHERE name = ?', [vipName]).catch(() => {});
    await conn.end().catch(() => {});
  }
}
// <Jun Kai end>

(async () => {
  try {
    if (!ARGS.has('--external')) startServers();
    await waitFor(`${BASE}/api/status`, 150000);
    await waitFor(`${KIOSK}/api/status`, 30000);

    // Public endpoints: status + shape pinned to today's behaviour
    await expect('GET /api/status', `${BASE}/api/status`, (r) => r.body && r.body.online === true);
    await expect('GET /api/parameters', `${BASE}/api/parameters`, (r) => r.body && r.body.success === true && typeof r.body.parameters === 'object');
    await expect('GET /api/generate-qr', `${BASE}/api/generate-qr`, (r) => r.body && r.body.success === true && /^https:\/\/[\d.]+:3000\/feedback$/.test(r.body.url) && /<svg/.test(r.body.qrSvg) || `url=${r.body && r.body.url}`);
    await expect('GET /api/generate-qr on the kiosk server points at :3000', `${KIOSK}/api/generate-qr`, (r) => r.body && r.body.success === true && /:3000\/feedback$/.test(r.body.url) || `url=${r.body && r.body.url}`);
    await expect('GET /api/feedback/questions', `${BASE}/api/feedback/questions`, (r) => r.status === 200 && r.body !== null);
    await expect('GET /api/feedback/form-ui', `${BASE}/api/feedback/form-ui`, (r) => r.status === 200 && r.body && typeof r.body.landingTitle === 'string');
    await expect('GET /api/feedback/overlays', `${BASE}/api/feedback/overlays`, (r) => r.status === 200 && r.body !== null);
    await expect('GET /api/feedback/countdown-timer', `${BASE}/api/feedback/countdown-timer`, (r) => r.status === 200 && r.body !== null);
    await expect('GET /api/tree', `${BASE}/api/tree`, (r) => r.status === 200 && r.body !== null);
    await expect('GET /api/tree/years', `${BASE}/api/tree/years`, (r) => r.body && r.body.success === true && Array.isArray(r.body.years));
    await expect('GET /api/tree/vip-names', `${BASE}/api/tree/vip-names`, (r) => r.body && r.body.success === true && Array.isArray(r.body.vipNames));
    await expect('GET /api/pulse/summary', `${BASE}/api/pulse/summary`, (r) => r.body && r.body.success === true);
    await expect('GET /api/pledgeboard/pledges', `${BASE}/api/pledgeboard/pledges`, (r) => r.body && r.body.success === true && Array.isArray(r.body.pledges));
    await expect('GET /api/pledgeboard/topics', `${BASE}/api/pledgeboard/topics`, (r) => r.status === 200 && r.body !== null);
    await expect('GET /api/test-db', `${BASE}/api/test-db`, (r) => r.status === 200 && r.body && Array.isArray(r.body.tables) || 'db test failed');

    // Pages
    await expect('GET /feedback', `${BASE}/feedback`, (r) => r.status === 200 && /\/feedback\/js\/core\.js/.test(r.text));
    await expect('GET /feedback/js/core.js is served', `${BASE}/feedback/js/core.js`, (r) => r.status === 200 && r.text.length > 1000);
    await expect('GET /admin', `${BASE}/admin`, (r) => r.status === 200 && /\/admin\/js\/core\.js/.test(r.text));
    await expect('GET /admin/js/core.js is served', `${BASE}/admin/js/core.js`, (r) => r.status === 200 && r.text.length > 1000);
    await expect('GET /tree', `${BASE}/tree`, (r) => r.status === 200);
    await expect('GET /pulse', `${BASE}/pulse`, (r) => r.status === 200);
    await expect('GET /feedback on the kiosk server', `${KIOSK}/feedback`, (r) => r.status === 200 && /\/feedback\/js\/core\.js/.test(r.text));
    await expect('GET /feedback/js/core.js on the kiosk server', `${KIOSK}/feedback/js/core.js`, (r) => r.status === 200 && r.text.length > 1000);

    // Admin auth
    const json = (b) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    await expect('POST /api/admin/login with a wrong password is refused', `${BASE}/api/admin/login`, (r) => r.status === 401, json({ username: ADMIN_USER, password: 'definitely-wrong' }));
    await expect('GET /api/admin/server-schedules without a session is refused', `${BASE}/api/admin/server-schedules`, (r) => r.status === 401);
    // <Jun Kai start>
    await expect('POST /api/admin/archive/update-status without a session is refused', `${BASE}/api/admin/archive/update-status`, (r) => r.status === 401, { method: 'POST' });
    await expect('GET /api/admin/aiops/status without a session is refused', `${BASE}/api/admin/aiops/status`, (r) => r.status === 401);
    await expect('POST /api/admin/aiops/test-incident without a session is refused', `${BASE}/api/admin/aiops/test-incident`, (r) => r.status === 401 || r.status === 403, { method: 'POST' });
    await expect('PUT /api/admin/hardware/alert-lines without a session is refused', `${BASE}/api/admin/hardware/alert-lines`, (r) => r.status === 401 || r.status === 403, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await expect('PUT /api/admin/health/settings without a session is refused', `${BASE}/api/admin/health/settings`, (r) => r.status === 401 || r.status === 403, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    // routes of the old admin router that answered without a sign-in until 19 Nov 2026 (all of them: the contract check "sign-in")
    await expect('GET /api/admin/feedback without a session is refused', `${BASE}/api/admin/feedback`, (r) => r.status === 401);
    await expect('GET /api/admin/users without a session is refused', `${BASE}/api/admin/users`, (r) => r.status === 401);
    await expect('GET /api/admin/audit-logs without a session is refused', `${BASE}/api/admin/audit-logs`, (r) => r.status === 401);
    // <Jun Kai start> a forgotten password (open without a session): the answer to a request is the same for a real
    // account and a made-up name, and a wrong code or link is refused without saying more
    {
      const ask = (identifier) => get(`${BASE}/api/admin/password-reset/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }) });
      // the made-up name first; the real account only when email is not set up here, so a PC with email never mails it
      const madeUp = await ask(`smoke_nobody_${Date.now()}`);
      const real = madeUp.status === 503 ? await ask(ADMIN_USER) : madeUp;
      const sameAnswer = [200, 503].includes(real.status) && real.status === madeUp.status && real.text === madeUp.text;
      if (sameAnswer) pass(`POST /api/admin/password-reset/request answers a real account and a made-up name the same (${real.status})`);
      else fail(`POST /api/admin/password-reset/request answers differently: ${real.status} ${real.text.slice(0, 120)} / ${madeUp.status} ${madeUp.text.slice(0, 120)}`);
      const post = (path, body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      await expect('POST /api/admin/password-reset/verify-code refuses a code that was never sent', `${BASE}/api/admin/password-reset/verify-code`, (r) => r.status === 400 || `${r.status}`, post('verify-code', { identifier: ADMIN_USER, code: '000000' }));
      await expect('POST /api/admin/password-reset/check-link refuses a link that was never sent', `${BASE}/api/admin/password-reset/check-link`, (r) => (r.status === 400 && /expired or was already used/.test(r.text)) || `${r.status}`, post('check-link', { token: 'A'.repeat(43) }));
      await expect('POST /api/admin/password-reset/complete refuses a link that was never sent', `${BASE}/api/admin/password-reset/complete`, (r) => r.status === 400 || `${r.status}`, post('complete', { token: 'B'.repeat(43), password: 'Smoke-Never-Used-1', confirm: 'Smoke-Never-Used-1' }));
    }
    // <Jun Kai end>
    // <Jun Kai start> the Lost & Found contact and the CSV export with the contacts need a session and the password
    await expect('POST /api/admin/lost-found-reports/:id/contact without a session is refused', `${BASE}/api/admin/lost-found-reports/1/contact`, (r) => r.status === 401,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x' }) });
    await expect('POST /api/admin/lost-found-reports/export.csv without a session is refused', `${BASE}/api/admin/lost-found-reports/export.csv`, (r) => r.status === 401,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x' }) });
    // <Jun Kai end>
    await expect('POST /api/admin/users without a session is refused, whatever the x-username header says', `${BASE}/api/admin/users`, (r) => r.status === 401,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-username': ADMIN_USER }, body: JSON.stringify({ username: 'smoke_nobody', full_name: 'Smoke Nobody', role: 'system_admin', password: 'SmokeNobody123!' }) });
    // the admin page's pledge routes: the same router is on the kiosk server, where nobody signs in
    await expect('GET /api/pledgeboard/admin/pledges without a session is refused', `${BASE}/api/pledgeboard/admin/pledges`, (r) => r.status === 401);
    await expect('PUT /api/pledgeboard/admin/topics without a session is refused', `${BASE}/api/pledgeboard/admin/topics`, (r) => r.status === 401,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topics: [] }) });
    await expect('GET /api/pledgeboard/admin/pledges on the kiosk server is refused (nobody signs in there)', `${KIOSK}/api/pledgeboard/admin/pledges`, (r) => r.status === 401);
    // 19 Nov 2026: visitor files ask for a sign-in or the visitor's own session on both servers, the tree page is not a plain
    // file, and the export unlock is not a password check for anyone
    await expect('GET /uploads/photos/<file> without a session is refused', `${BASE}/uploads/photos/smoke-nobody.png`, (r) => r.status === 401);
    await expect('GET /uploads/photos/<file> on the kiosk server without a session is refused', `${KIOSK}/uploads/photos/smoke-nobody.png`, (r) => r.status === 401);
    await expect('GET /tree/tree.html is sent to the gated /tree route', `${BASE}/tree/tree.html`, (r) => r.status === 302 && r.headers.get('location') === '/tree' || `location ${r.headers.get('location')}`, { redirect: 'manual' });
    await expect('POST /api/admin/data-export/unlock without a session is refused', `${BASE}/api/admin/data-export/unlock`, (r) => r.status === 401, json({ username: ADMIN_USER, password: ADMIN_PASS }));
    // the kiosk page asks this every 10 seconds: when the server started, and whether the policies have the kiosk open
    // (the automation is off here, so the kiosk is open)
    for (const [where, server] of [['', BASE], [' on the kiosk server', KIOSK]]) {
      await expect(`GET /api/status${where} says when the server started and that the kiosk is open`, `${server}/api/status`, (r) => r.body && r.body.online === true && r.body.open === true && !Number.isNaN(Date.parse(r.body.startedAt)) || r.text.slice(0, 160));
    }
    await expect('GET /api/test-db answers a request made on the PC itself', `${BASE}/api/test-db`, (r) => r.status === 200 && r.body && Array.isArray(r.body.tables) || 'db test failed');
    await expect('PUT /api/admin/sign-in-settings without a session is refused', `${BASE}/api/admin/sign-in-settings`, (r) => r.status === 401 || r.status === 403, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    // <Jun Kai end>
    let cookie = '';
    try {
      const r = await fetch(`${BASE}/api/admin/login`, json({ username: ADMIN_USER, password: ADMIN_PASS }));
      const setCookie = r.headers.get('set-cookie') || '';
      cookie = setCookie.split(';')[0];
      if (r.status === 200 && cookie) pass('POST /api/admin/login with the seeded admin (200, session cookie set)');
      else fail(`POST /api/admin/login with the seeded admin (${r.status}, cookie ${cookie ? 'set' : 'missing'})`);
    } catch (e) { fail(`POST /api/admin/login: ${e.message}`); }
    // <Jun Kai start> the AI Settings page: everyone signed in reads the switches, only a System Admin changes them, and
    // sending the same values back changes nothing (so this run leaves the settings as they were)
    await expect('GET /api/admin/ai-settings without a session is refused', `${BASE}/api/admin/ai-settings`, (r) => r.status === 401 || `${r.status}`);
    {
      const r = await get(`${BASE}/api/admin/ai-settings`, { headers: { cookie } });
      const s = r.body && r.body.settings;
      const ok = r.status === 200 && s && ['all', 'reportModels', 'pledgeCheck', 'translate', 'incidentAdvisor'].every((k) => typeof s[k] === 'boolean') && r.body.pledge && typeof r.body.pledge.onlineKey === 'boolean' && !/api[_-]?key|sk-/i.test(r.text);
      if (ok) pass('GET /api/admin/ai-settings lists the five switches and the pledge mode, with no key in the answer'); else fail(`GET /api/admin/ai-settings (${r.status}): ${r.text.slice(0, 160)}`);
      if (ok) {
        await expect('PUT /api/admin/ai-settings with the same values changes nothing', `${BASE}/api/admin/ai-settings`, (x) => x.status === 200 && x.body && Array.isArray(x.body.changed) && x.body.changed.length === 0 || `${x.status} ${x.text.slice(0, 120)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(s) });
        await expect('PUT /api/admin/ai-settings refuses a switch that does not exist', `${BASE}/api/admin/ai-settings`, (x) => x.status === 400 || `${x.status}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ faceCheck: false }) });
      }
    }
    // <Jun Kai end>
    // <Jun Kai start> "keep me signed in for 1 day": the token alone signs the admin back in, Logout ends it
    try {
      const r = await fetch(`${BASE}/api/admin/login`, json({ username: ADMIN_USER, password: ADMIN_PASS, remember: true }));
      const setCookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || ''];
      const token = setCookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('esg_admin_remember='));
      const flags = (setCookies.find((c) => c.startsWith('esg_admin_remember=')) || '').toLowerCase();
      const body = await r.json().catch(() => ({}));
      if (r.status === 200 && token && flags.includes('httponly') && body.rememberUntil) pass('POST /api/admin/login with remember sets an httpOnly token cookie for 1 day');
      else fail(`POST /api/admin/login with remember (${r.status}, token ${token ? 'set' : 'missing'}, httpOnly ${flags.includes('httponly')})`);
      if (token) {
        await expect('GET /api/admin/remember with only the token cookie signs the admin back in', `${BASE}/api/admin/remember`, (x) => x.body && x.body.success === true && x.body.user && x.body.user.username === ADMIN_USER || x.text.slice(0, 160), { headers: { cookie: token } });
        await expect('POST /api/admin/logout-audit ends the token', `${BASE}/api/admin/logout-audit`, (x) => x.status === 200, { method: 'POST', headers: { cookie: token, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USER }) });
        await expect('GET /api/admin/remember with the ended token is refused', `${BASE}/api/admin/remember`, (x) => x.status === 401, { headers: { cookie: token } });
      }
    } catch (e) { fail(`keep me signed in: ${e.message}`); }
    // <Jun Kai end>
    if (cookie) {
      await expect('GET /api/admin/server-schedules with the session', `${BASE}/api/admin/server-schedules`, (r) => r.body && r.body.success === true, { headers: { cookie } });
      await expect('GET /api/admin/dashboard with the session', `${BASE}/api/admin/dashboard`, (r) => r.body && r.body.success === true, { headers: { cookie } });
      await expect('GET /api/pledgeboard/admin/pledges with the session', `${BASE}/api/pledgeboard/admin/pledges`, (r) => r.body && r.body.success === true && Array.isArray(r.body.pledges) || r.text.slice(0, 160), { headers: { cookie } }); // <Jun Kai/>
      await expect('GET /api/admin/health with the session', `${BASE}/api/admin/health?all=1`, (r) => r.body && r.body.success === true && r.body.health && Array.isArray(r.body.health.checks) && r.body.health.checks.length >= 6 || r.text.slice(0, 160), { headers: { cookie } });
      // <Jun Kai start>
      await expect('GET /api/admin/health/history with the session', `${BASE}/api/admin/health/history`, (r) => r.body && r.body.success === true && (r.body.history === null || (r.body.history.slots === 48 && typeof r.body.history.checks === 'object')) || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/email/status with the session (no password in it)', `${BASE}/api/admin/email/status`, (r) => r.body && r.body.success === true && typeof r.body.status === 'object' && !/"pass"/.test(r.text) || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/email/preview builds the thank-you email without sending it', `${BASE}/api/admin/email/preview`, (r) => r.body && r.body.success === true && /<html|<div|<table/i.test(r.body.preview.html || '') || r.text.slice(0, 160), { headers: { cookie } });
      // <Jun Kai end>
      // <Jun Kai start>
      await expect('GET /api/admin/hardware/overview with the session', `${BASE}/api/admin/hardware/overview`, (r) => r.body && r.body.success === true && !!r.body.overview && typeof r.body.overview.settings === 'object' || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/hardware/series?range=1h with the session', `${BASE}/api/admin/hardware/series?range=1h`, (r) => r.body && r.body.success === true && Array.isArray(r.body.points) || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/hardware/series?range=3mo (a custom range, longer than the samples are kept: daily summaries)', `${BASE}/api/admin/hardware/series?range=3mo`, (r) => r.body && r.body.success === true && r.body.range === '3mo' && r.body.bucketSeconds === 86400 && r.body.source === 'daily' && Array.isArray(r.body.points) || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/hardware/series?range=6y is refused', `${BASE}/api/admin/hardware/series?range=6y`, (r) => r.status === 400 || `${r.status}: ${r.text.slice(0, 120)}`, { headers: { cookie } });
      await expect('GET /api/admin/hardware/series with horizon=8760: the forecast a year ahead, a rough guide until the daily summaries reach back a year', `${BASE}/api/admin/hardware/series?range=4380h&horizon=8760`, (r) => r.body && r.body.success === true && !!r.body.forecast && r.body.forecast.horizonHours === 8760 && r.body.forecast.basis === 'daily' && !!r.body.forecast.check && r.body.forecast.check.rough === true && r.body.forecast.check.reason === 'history' && r.body.forecast.check.keptForGood === true || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/hardware/series with horizon=1: the forecast an hour ahead, in steps of 10 minutes', `${BASE}/api/admin/hardware/series?range=1h&horizon=1`, (r) => r.body && r.body.success === true && !!r.body.forecast && r.body.forecast.horizonHours === 1 && r.body.forecast.basis === 'steps' || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/hardware/series with horizon=48: two days ahead still in steps of 10 minutes', `${BASE}/api/admin/hardware/series?range=24h&horizon=48`, (r) => r.body && r.body.success === true && !!r.body.forecast && r.body.forecast.horizonHours === 48 && r.body.forecast.basis === 'steps' || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/hardware/series with horizon=168: seven days ahead on the daily averages', `${BASE}/api/admin/hardware/series?range=84h&horizon=168`, (r) => r.body && r.body.success === true && !!r.body.forecast && r.body.forecast.horizonHours === 168 && r.body.forecast.basis === 'daily' || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/hardware/series refuses a forecast longer than a year', `${BASE}/api/admin/hardware/series?range=12h&horizon=9000`, (r) => r.status === 400 || `${r.status}: ${r.text.slice(0, 120)}`, { headers: { cookie } });
      await expect('GET /api/admin/hardware/forecast-check is gone (the rough guide comes with the forecast)', `${BASE}/api/admin/hardware/forecast-check?forecastHours=24`, (r) => r.status === 404 || `${r.status}: ${r.text.slice(0, 120)}`, { headers: { cookie } });
      await expect('GET /api/admin/server-schedules/preview with the session', `${BASE}/api/admin/server-schedules/preview?days=7`, (r) => r.body && r.body.success === true && !!r.body.preview && Array.isArray(r.body.preview.days) && r.body.preview.days.length === 7 || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/server-schedules/preview from a picked date', `${BASE}/api/admin/server-schedules/preview?days=7&from=2027-01-04`, (r) => r.body && r.body.success === true && r.body.preview.start === '2027-01-04' && r.body.preview.days.length === 7 && typeof r.body.preview.manual === 'boolean' || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/server-schedules/preview refuses a date that does not exist', `${BASE}/api/admin/server-schedules/preview?from=2026-02-30`, (r) => r.status === 400 || `${r.status}: ${r.text.slice(0, 120)}`, { headers: { cookie } });
      await expect('GET /api/admin/health/layout with the session', `${BASE}/api/admin/health/layout`, (r) => r.body && r.body.success === true && Array.isArray(r.body.options) && r.body.options.length === 9 && Array.isArray(r.body.hidden) || r.text.slice(0, 160), { headers: { cookie } });
      await expect('PUT /api/admin/health/tablets/x/name refuses a bad device id', `${BASE}/api/admin/health/tablets/x/name`, (r) => r.status === 400 || `${r.status}: ${r.text.slice(0, 120)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ name: 'Tablet 1' }) });
      // anomaly detection, read-only: the engine status, the settings and the incident list
      await expect('GET /api/admin/aiops/status with the session', `${BASE}/api/admin/aiops/status`, (r) => r.body && r.body.success === true && !!r.body.status && Array.isArray(r.body.status.detectors) && r.body.status.detectors.length === 7 && typeof r.body.status.enabled === 'boolean' || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/aiops/settings with the session', `${BASE}/api/admin/aiops/settings`, (r) => r.body && r.body.success === true && !!r.body.settings && !!r.body.settings.detectors && !!r.body.settings.detectors.spike && typeof r.body.settings.detectors.spike.sensitivity === 'number' && Array.isArray(r.body.detectors) && r.body.detectors.length === 7 || r.text.slice(0, 160), { headers: { cookie } });
      await expect('GET /api/admin/aiops/incidents?status=all with the session', `${BASE}/api/admin/aiops/incidents?status=all`, (r) => r.body && r.body.success === true && Array.isArray(r.body.incidents) || r.text.slice(0, 160), { headers: { cookie } });
      // <Jun Kai end>
      await expect('GET /api/admin/server/automation with the session', `${BASE}/api/admin/server/automation`, (r) => r.body && r.body.success === true && r.body.automation && r.body.automation.enabled === false || `automation=${JSON.stringify(r.body && r.body.automation).slice(0, 120)}`, { headers: { cookie } });
      // <Jun Kai start> the History list: this start is in it, newest first, and the list is only as long as asked for
      await expect('GET /api/admin/server/automation?limit=50 has this start in the History, newest first', `${BASE}/api/admin/server/automation?limit=50`, (r) => {
        const a = (r.body && r.body.automation) || {};
        const events = Array.isArray(a.events) ? a.events : [];
        const ordered = events.every((e, i) => i === 0 || new Date(e.at) <= new Date(events[i - 1].at));
        return events.some((e) => e.type === 'started' && !!e.detail) && ordered && a.eventsTotal >= events.length || `events=${JSON.stringify(events).slice(0, 200)}`;
      }, { headers: { cookie } });
      await expect('GET /api/admin/server/automation sends at most 10 History lines without a limit', `${BASE}/api/admin/server/automation`, (r) => r.body && r.body.automation && Array.isArray(r.body.automation.events) && r.body.automation.events.length <= 10 || r.text.slice(0, 160), { headers: { cookie } });
      // the page that opens after the PC was off: it is served without a sign-in, and its History lines need the link of that
      // start (none was made here: automation is off), which a signed-in admin does not replace
      await expect('GET /admin/recovery.html is served without a sign-in', `${BASE}/admin/recovery.html`, (r) => r.status === 200 && r.text.includes('id="recovery-story"') || r.text.slice(0, 120));
      await expect('GET /api/admin/recovery-view without a link is refused', `${BASE}/api/admin/recovery-view`, (r) => r.status === 401 && !(r.body && r.body.events) || r.text.slice(0, 160));
      await expect('GET /api/admin/recovery-view with a wrong link is refused, signed in or not', `${BASE}/api/admin/recovery-view`, (r) => r.status === 401 && !(r.body && r.body.events) || r.text.slice(0, 160), { headers: { cookie, 'X-Recovery-View': 'f'.repeat(48) } });
      // <Jun Kai end>
    }

    // These write rows, so not in --no-submit mode: one tablet heartbeat, then one visitor submission end to end
    if (!ARGS.has('--no-submit')) {
      // <Jun Kai start>
      await expect('POST /api/health/heartbeat from a kiosk', `${BASE}/api/health/heartbeat`, (r) => r.body && r.body.success === true || r.text.slice(0, 160), json({ deviceId: 'smoke-tablet-01', page: 'feedback' }));
      // a visitor's browser opens the photo it just saved (the download on the thank-you page); another browser does not
      try {
        // on both servers: the wall kiosk is on the kiosk server, tablets and phones on the main one
        for (const [where, server] of [['', BASE], [' on the kiosk server', KIOSK]]) {
          const saved = await fetch(`${server}/api/feedback/save-photo`, json({ photo: tinyPng(), userName: 'Smoke Visitor', device: 'kiosk' }));
          const visitor = (saved.headers.get('set-cookie') || '').split(';')[0];
          const photoId = ((await saved.json().catch(() => ({}))) || {}).photoId;
          if (!photoId || !visitor) { fail(`POST /api/feedback/save-photo${where} gives the visitor a session (${saved.status}, photo ${photoId ? 'saved' : 'missing'}, cookie ${visitor ? 'set' : 'missing'})`); continue; }
          await expect(`GET /uploads/photos/<own photo>${where} with the visitor session`, `${server}/uploads/photos/${photoId}`, (r) => r.status === 200, { headers: { cookie: visitor } });
          await expect(`GET /uploads/photos/<that photo>${where} from another browser is refused`, `${server}/uploads/photos/${photoId}`, (r) => r.status === 401);
          if (cookie && server === BASE) await expect('GET /uploads/photos/<that photo> with the admin session', `${BASE}/uploads/photos/${photoId}`, (r) => r.status === 200, { headers: { cookie } });
          try { fs.unlinkSync(path.join(ROOT, 'uploads', 'photos', photoId)); } catch { /* already gone */ }
        }
      } catch (e) { fail(`a visitor opens its own photo: ${e.message}`); }
      // a failing tablets query only turns the card to unknown, so check the row really comes back
      if (cookie) {
        await expect('GET /api/admin/health lists the smoke tablet', `${BASE}/api/admin/health?all=1`, (r) => {
          const tablets = r.body && r.body.health && (r.body.health.checks || []).find((c) => c.key === 'tablets');
          const devices = (tablets && tablets.detail && tablets.detail.devices) || [];
          return devices.some((d) => d.device_id === 'smoke-tablet-01') || `tablets: ${JSON.stringify(tablets && { status: tablets.status, summary: tablets.summary }).slice(0, 160)}`;
        }, { headers: { cookie } });
        const put = (b) => ({ method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(b) });
        await expect('PUT /api/admin/health/tablets/smoke-tablet-01/name names the smoke tablet', `${BASE}/api/admin/health/tablets/smoke-tablet-01/name`, (r) => r.body && r.body.success === true && r.body.name === 'Smoke tablet 1' || r.text.slice(0, 160), put({ name: '  Smoke   tablet 1 ' }));
        await expect('GET /api/admin/health shows the tablet name', `${BASE}/api/admin/health?all=1`, (r) => {
          const tablets = r.body && r.body.health && (r.body.health.checks || []).find((c) => c.key === 'tablets');
          const device = ((tablets && tablets.detail && tablets.detail.devices) || []).find((d) => d.device_id === 'smoke-tablet-01');
          return device && device.name === 'Smoke tablet 1' || `device: ${JSON.stringify(device || null).slice(0, 160)}`;
        }, { headers: { cookie } });
        await expect('PUT an empty name gives the smoke tablet its device name back', `${BASE}/api/admin/health/tablets/smoke-tablet-01/name`, (r) => r.body && r.body.success === true && r.body.name === null || r.text.slice(0, 160), put({ name: '' }));
        // <Jun Kai start> the alert lines and Offline after: a line per part, refused values, round trips put back as they were
        const hwSaved = (await get(`${BASE}/api/admin/hardware/settings`, { headers: { cookie } })).body;
        await expect('GET /api/admin/hardware/settings has an alert line for every part', `${BASE}/api/admin/hardware/settings`, (r) => r.body && r.body.alerts && ['cpu', 'memory', 'gpu', 'disk'].every((p) => r.body.alerts[p] && r.body.alerts[p].critical > r.body.alerts[p].warn) || r.text.slice(0, 160), { headers: { cookie } });
        await expect('PUT /api/admin/hardware/alert-lines refuses red at or below amber', `${BASE}/api/admin/hardware/alert-lines`, (r) => r.status === 400 && r.body && r.body.field === 'disk.critical' || `${r.status}: ${r.text.slice(0, 120)}`, put({ alerts: { disk: { warn: 90, critical: 90 } } }));
        if (hwSaved && hwSaved.alerts) {
          await expect('PUT /api/admin/hardware/alert-lines saves a CPU line', `${BASE}/api/admin/hardware/alert-lines`, (r) => r.body && r.body.success === true && r.body.alerts.cpu.warn === 70 && r.body.alerts.disk.warn === hwSaved.alerts.disk.warn || r.text.slice(0, 160), put({ alerts: { cpu: { warn: 70, critical: 90 } } }));
          await expect('PUT /api/admin/hardware/alert-lines puts the lines back', `${BASE}/api/admin/hardware/alert-lines`, (r) => r.body && r.body.success === true && r.body.alerts.cpu.warn === hwSaved.alerts.cpu.warn || r.text.slice(0, 160), put({ alerts: hwSaved.alerts }));
        } else fail('PUT /api/admin/hardware/alert-lines round trip skipped: GET /api/admin/hardware/settings gave no alert lines');
        const healthSaved = (await get(`${BASE}/api/admin/health/settings`, { headers: { cookie } })).body;
        await expect('GET /api/admin/health/settings has the tablet window', `${BASE}/api/admin/health/settings`, (r) => r.body && r.body.success === true && Number.isInteger(r.body.settings.tabletOfflineMinutes) || r.text.slice(0, 160), { headers: { cookie } });
        await expect('PUT /api/admin/health/settings refuses 1 minute', `${BASE}/api/admin/health/settings`, (r) => r.status === 400 && r.body && r.body.field === 'tabletOfflineMinutes' || `${r.status}: ${r.text.slice(0, 120)}`, put({ tabletOfflineMinutes: 1 }));
        if (healthSaved && healthSaved.settings) {
          await expect('PUT /api/admin/health/settings saves 10 minutes', `${BASE}/api/admin/health/settings`, (r) => r.body && r.body.success === true && r.body.settings.tabletOfflineMinutes === 10 || r.text.slice(0, 160), put({ tabletOfflineMinutes: 10 }));
          await expect('GET /api/admin/health uses the 10-minute window for the tablets', `${BASE}/api/admin/health?all=1`, (r) => {
            const tablets = r.body && r.body.health && (r.body.health.checks || []).find((c) => c.key === 'tablets');
            return tablets && tablets.detail && tablets.detail.onlineWindowSeconds === 600 || `window: ${JSON.stringify(tablets && tablets.detail ? tablets.detail.onlineWindowSeconds : null)}`;
          }, { headers: { cookie } });
          await expect('PUT /api/admin/health/settings puts the window back', `${BASE}/api/admin/health/settings`, (r) => r.body && r.body.success === true && r.body.settings.tabletOfflineMinutes === healthSaved.settings.tabletOfflineMinutes || r.text.slice(0, 160), put(healthSaved.settings));
        } else fail('PUT /api/admin/health/settings round trip skipped: GET /api/admin/health/settings gave no settings');
        // sign-out after no activity: the minutes, a refused value, a round trip put back as it was
        const idleSaved = (await get(`${BASE}/api/admin/sign-in-settings`, { headers: { cookie } })).body;
        await expect('GET /api/admin/sign-in-settings has the minutes', `${BASE}/api/admin/sign-in-settings`, (r) => r.body && r.body.success === true && Number.isInteger(r.body.settings.idleMinutes) && r.body.defaults.idleMinutes === 30 || r.text.slice(0, 160), { headers: { cookie } });
        await expect('PUT /api/admin/sign-in-settings refuses 4 minutes', `${BASE}/api/admin/sign-in-settings`, (r) => r.status === 400 && r.body && r.body.field === 'idleMinutes' || `${r.status}: ${r.text.slice(0, 120)}`, put({ idleMinutes: 4 }));
        if (idleSaved && idleSaved.settings) {
          await expect('PUT /api/admin/sign-in-settings saves never (0)', `${BASE}/api/admin/sign-in-settings`, (r) => r.body && r.body.success === true && r.body.settings.idleMinutes === 0 || r.text.slice(0, 160), put({ idleMinutes: 0 }));
          await expect('PUT /api/admin/sign-in-settings puts the minutes back', `${BASE}/api/admin/sign-in-settings`, (r) => r.body && r.body.success === true && r.body.settings.idleMinutes === idleSaved.settings.idleMinutes || r.text.slice(0, 160), put(idleSaved.settings));
        } else fail('PUT /api/admin/sign-in-settings round trip skipped: GET /api/admin/sign-in-settings gave no settings');
        // <Jun Kai end>
        // anomaly detection: the settings round trip, then one test incident through acknowledge, verdict and resolve
        const AIOPS = `${BASE}/api/admin/aiops`;
        const post = (b) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(b || {}) });
        const saved = (await get(`${AIOPS}/settings`, { headers: { cookie } })).body;
        const original = saved && saved.settings && saved.settings.detectors && saved.settings.detectors.spike ? saved.settings : null;
        if (original) {
          await expect('PUT /api/admin/aiops/settings sets the spike sensitivity to 4', `${AIOPS}/settings`, (r) => r.status === 200 && r.body && r.body.settings && r.body.settings.detectors.spike.sensitivity === 4 || r.text.slice(0, 160), put({ ...original, detectors: { ...original.detectors, spike: { ...original.detectors.spike, sensitivity: 4 } } }));
          await expect('PUT /api/admin/aiops/settings puts the saved settings back', `${AIOPS}/settings`, (r) => r.status === 200 && r.body && r.body.settings && r.body.settings.detectors.spike.sensitivity === original.detectors.spike.sensitivity || r.text.slice(0, 160), put(original));
        } else fail('PUT /api/admin/aiops/settings round trip skipped: GET /api/admin/aiops/settings gave no settings');
        await expect('PUT /api/admin/aiops/settings refuses a 5 second interval', `${AIOPS}/settings`, (r) => r.status === 400 && r.body && r.body.field === 'intervalSeconds' || `${r.status}: ${r.text.slice(0, 120)}`, put({ intervalSeconds: 5 }));
        // <Jun Kai start> the Advanced values: their defaults come with the settings, and a wait of 0 minutes is refused
        await expect('GET /api/admin/aiops/settings has the defaults of the Advanced values', `${AIOPS}/settings`, (r) => r.body && r.body.defaults && r.body.defaults.fixDelayMinutes === 5 && typeof r.body.settings.learnStreak === 'number' || r.text.slice(0, 160), { headers: { cookie } });
        await expect('PUT /api/admin/aiops/settings refuses a fix wait of 0 minutes', `${AIOPS}/settings`, (r) => r.status === 400 && r.body && r.body.field === 'fixDelayMinutes' || `${r.status}: ${r.text.slice(0, 120)}`, put({ fixDelayMinutes: 0 }));
        // <Jun Kai end>
        const made = await get(`${AIOPS}/test-incident`, post({}));
        const incidentId = made.body && made.body.incident && made.body.incident.id;
        (incidentId ? pass : fail)(`POST /api/admin/aiops/test-incident opens a test incident (${made.status})${incidentId ? '' : ': ' + made.text.slice(0, 120)}`);
        if (incidentId) {
          await expect('GET /api/admin/aiops/incidents?status=open lists the test incident', `${AIOPS}/incidents?status=open`, (r) => r.body && Array.isArray(r.body.incidents) && r.body.incidents.some((i) => i.id === incidentId) || r.text.slice(0, 160), { headers: { cookie } });
          await expect('POST acknowledge marks the test incident acknowledged', `${AIOPS}/incidents/${incidentId}/acknowledge`, (r) => r.body && r.body.incident && r.body.incident.status === 'acknowledged' || r.text.slice(0, 160), post({}));
          await expect('POST verdict correct is saved on the test incident', `${AIOPS}/incidents/${incidentId}/verdict`, (r) => r.body && r.body.incident && r.body.incident.verdict === 'correct' || r.text.slice(0, 160), post({ verdict: 'correct' }));
          // <Jun Kai start> AIOps part 2: the advisor (no Ollama on a runner: it answers with rule-based advice)
          await expect('POST /api/admin/aiops/incidents/:id/advice asks the advisor', `${AIOPS}/incidents/${incidentId}/advice`, (r) => r.body && r.body.success === true && r.body.queued === true || `${r.status}: ${r.text.slice(0, 120)}`, post({}));
          // <Jun Kai end>
          await expect('POST verdict maybe is refused', `${AIOPS}/incidents/${incidentId}/verdict`, (r) => r.status === 400 || `${r.status}: ${r.text.slice(0, 120)}`, post({ verdict: 'maybe' }));
          await expect('POST resolve closes the test incident as the admin', `${AIOPS}/incidents/${incidentId}/resolve`, (r) => r.body && r.body.incident && r.body.incident.status === 'resolved' && r.body.incident.resolved_by === ADMIN_USER || r.text.slice(0, 160), post({ note: 'Smoke test' }));
          await expect('GET /api/admin/aiops/incidents/:id has the whole timeline', `${AIOPS}/incidents/${incidentId}`, (r) => ['opened', 'acknowledged', 'verdict', 'resolved'].every((t) => ((r.body && r.body.events) || []).some((e) => e.type === t)) || r.text.slice(0, 160), { headers: { cookie } });
        }
        // <Jun Kai start>
        if (incidentId) await expect('POST advice on a resolved incident is refused', `${AIOPS}/incidents/${incidentId}/advice`, (r) => r.status === 400 || `${r.status}: ${r.text.slice(0, 120)}`, post({}));
        await expect('POST advice on an unknown incident is 404', `${AIOPS}/incidents/99999999/advice`, (r) => r.status === 404 || `${r.status}: ${r.text.slice(0, 120)}`, post({}));
        await expect('GET /api/admin/aiops/advisor has the step list', `${AIOPS}/advisor`, (r) => r.body && r.body.success === true && !!r.body.actions && typeof r.body.actions.none === 'string' && Array.isArray(r.body.models) || r.text.slice(0, 160), { headers: { cookie } });
        // the fixes, the busiest programmes and a test "Kiosk server down" (a test incident's fix is only recorded: nothing starts)
        await expect('GET /api/admin/aiops/settings has the level numbers, the fixes and the test kinds', `${AIOPS}/settings`, (r) => r.body && r.body.levels && r.body.levels.spike && r.body.levels.spike.short.length === 5 && Array.isArray(r.body.fixes) && r.body.fixes.some((f) => f.key === 'start-kiosk') && Array.isArray(r.body.testKinds) && r.body.testKinds.some((k) => k.key === 'kiosk') || r.text.slice(0, 160), { headers: { cookie } });
        await expect('GET /api/admin/aiops/processes answers a list', `${AIOPS}/processes?by=memory`, (r) => r.body && r.body.success === true && Array.isArray(r.body.programmes) || r.text.slice(0, 160), { headers: { cookie } });
        await expect('POST /api/admin/aiops/test-incident refuses a kind it does not know', `${AIOPS}/test-incident`, (r) => r.status === 400 || `${r.status}: ${r.text.slice(0, 120)}`, post({ kind: 'format-the-disk' }));
        const kioskMade = await get(`${AIOPS}/test-incident`, post({ kind: 'kiosk' }));
        const kioskId = kioskMade.body && kioskMade.body.incident && kioskMade.body.incident.id;
        (kioskId ? pass : fail)(`POST /api/admin/aiops/test-incident opens a test kiosk incident (${kioskMade.status})${kioskId ? '' : ': ' + kioskMade.text.slice(0, 120)}`);
        if (kioskId) {
          await expect('the test kiosk incident offers the start fix', `${AIOPS}/incidents?status=open`, (r) => r.body && Array.isArray(r.body.incidents) && r.body.incidents.some((i) => i.id === kioskId && i.test === true && i.fix && i.fix.key === 'start-kiosk') || r.text.slice(0, 160), { headers: { cookie } });
          await expect('POST /api/admin/aiops/incidents/:id/fix on the test incident only records it', `${AIOPS}/incidents/${kioskId}/fix`, (r) => r.body && r.body.success === true && r.body.test === true && r.body.done === true || `${r.status}: ${r.text.slice(0, 120)}`, post({ fix: 'start-kiosk' }));
          await expect('the test incident has fix and fix-done on its timeline', `${AIOPS}/incidents/${kioskId}`, (r) => ['fix', 'fix-done'].every((t) => ((r.body && r.body.events) || []).some((e) => e.type === t)) && !!r.body.help || r.text.slice(0, 160), { headers: { cookie } });
          await expect('POST resolve closes the test kiosk incident', `${AIOPS}/incidents/${kioskId}/resolve`, (r) => r.body && r.body.incident && r.body.incident.status === 'resolved' || r.text.slice(0, 160), post({ note: 'Smoke test' }));
        }
        // <Jun Kai end>
        await expect('POST /api/admin/aiops/run-now runs one check', `${AIOPS}/run-now`, (r) => r.body && r.body.success === true && !!r.body.result && (r.body.result.skipped === null || r.body.result.skipped === 'disabled') || r.text.slice(0, 160), post({}));
        await expect('POST acknowledge on an unknown incident is 404', `${AIOPS}/incidents/999999999/acknowledge`, (r) => r.status === 404 || `${r.status}: ${r.text.slice(0, 120)}`, post({}));
      }
      // <Jun Kai end>
      const stamp = Date.now();
      let photoId = null;
      try {
        const r = await get(`${BASE}/api/feedback/save-photo`, json({ photo: tinyPng(), userName: 'CI Smoke', device: 'kiosk' }));
        photoId = r.body && r.body.photoId;
        if (r.status === 200 && photoId) pass('POST /api/feedback/save-photo'); else fail(`POST /api/feedback/save-photo (${r.status}): ${r.text.slice(0, 120)}`);
      } catch (e) { fail(`POST /api/feedback/save-photo: ${e.message}`); }
      // <Jun Kai start> the device from the request is part of the file name: with "../" in it the photo must still
      // land in uploads/photos (it used to be written three folders up). Only when this run started the servers.
      if (!ARGS.has('--external')) {
        try {
          const before = new Set(fs.readdirSync(ROOT));
          const r = await get(`${BASE}/api/feedback/save-photo`, json({ photo: tinyPng(), userName: 'CI Escape', device: '../../../escape' }));
          const stray = fs.readdirSync(ROOT).filter((name) => !before.has(name));
          const kept = fs.readdirSync(path.join(ROOT, 'uploads', 'photos')).filter((name) => name.startsWith('CI_Escape_'));
          if (r.status === 200 && stray.length === 0 && kept.length > 0) pass('a photo whose device holds "../" stays inside uploads/photos');
          else fail(`a photo whose device holds "../" left its folder: status ${r.status}, new in the project folder: ${stray.join(', ') || 'none'}, in uploads/photos: ${kept.length}`);
          for (const name of [...kept.map((n) => path.join(ROOT, 'uploads', 'photos', n)), ...stray.map((n) => path.join(ROOT, n))]) fs.rmSync(name, { force: true });
        } catch (e) { fail(`photo file name check: ${e.message}`); }
      }
      // <Jun Kai end>
      if (photoId) {
        const payload = {
          userData: { name: 'CI Smoke', email: `smoke+${stamp}@example.com`, pledge: 'I pledge to recycle and save energy every day', pledgeTopic: 'sustainable-living', photoId },
          device: 'kiosk', theme: 'nature',
        };
        await expect('POST /api/feedback/submit-feedback', `${BASE}/api/feedback/submit-feedback`, (r) => r.body && r.body.success === true || r.text.slice(0, 160), json(payload));
        let found = false;
        for (let i = 0; i < 6 && !found; i++) {
          const r = await get(`${BASE}/api/pledgeboard/pledges`);
          found = /I pledge to recycle and save energy/.test(r.text);
          if (!found) await sleep(1000);
        }
        (found ? pass : fail)('the new pledge appears on /api/pledgeboard/pledges');
        const tree = await get(`${BASE}/api/tree`);
        (/CI Smoke/.test(tree.text) ? pass : fail)('the new visitor appears on /api/tree');
      }
      // <Jun Kai start>
      if (ARGS.has('--archive')) {
        if (cookie) await archiveStep(cookie);
        else fail('visitor archive step skipped: no admin session');
      }
      // <Jun Kai end>
    }

    // The previous team's pulse check, if present
    const pulseCheck = path.join(ROOT, 'tests', 'pulse-backend-check.js');
    if (fs.existsSync(pulseCheck)) {
      const r = spawnSync(process.execPath, [pulseCheck], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PULSE_TEST_BASE_URL: BASE, PULSE_TEST_USERNAME: ADMIN_USER, PULSE_TEST_PASSWORD: ADMIN_PASS } });
      if (r.status === 0) pass('tests/pulse-backend-check.js'); else fail(`tests/pulse-backend-check.js exited ${r.status}: ${(r.stdout + r.stderr).split('\n').filter((l) => /FAIL|Error/.test(l)).slice(0, 3).join(' | ')}`);
    }
  } catch (e) { fail(`boot: ${e.message}`); }

  stopServers();
  await sleep(1500);
  // <Jun Kai start>
  if (archiveDir) {
    try { fs.rmSync(archiveDir, { recursive: true, force: true, maxRetries: 5 }); } catch (e) { console.log(`Could not remove ${archiveDir}: ${e.message}`); }
  }
  // printed, not counted: the archive step never ran
  if (ARGS.has('--archive') && ARGS.has('--no-submit')) console.log('SKIP visitor archive step: it archives the records the submissions seed, so it does not run with --no-submit (npm run smoke adds it). Run node tests/smoke.js --archive instead.');
  // <Jun Kai end>
  if (!ARGS.has('--external') && fs.existsSync(LOG)) {
    const log = fs.readFileSync(LOG, 'utf8');
    const markers = ['ERR_HTTP_HEADERS_SENT', 'UnhandledPromiseRejection', 'ReferenceError', 'TypeError', 'Error connecting to MySQL database', 'Failed to start'];
    const hits = markers.filter((m) => log.includes(m));
    (hits.length ? fail : pass)(hits.length ? `server log contains ${hits.join(', ')} (see ${path.relative(ROOT, LOG)})` : 'server log has no crash markers');
  }
  console.log(results.join('\n'));
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} smoke checks passed`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Smoke (${process.platform})\n\`\`\`\n${results.join('\n')}\n\`\`\`\n`);
  process.exit(failed ? 1 : 0);
})();
