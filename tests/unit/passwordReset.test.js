// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// A forgotten admin password (backend/features/passwordReset): the secrets and the whole flow, with an in-memory
// store and a fake mailer, so no database and no email are needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const tokens = require('../../backend/features/passwordReset/tokens');
const { createService, TEXT } = require('../../backend/features/passwordReset/service');
const { passwordProblem } = require('../../backend/core/accountEmail');

test('makeSecrets gives a 6 digit code and a 43 character link token, different each time', () => {
    const a = tokens.makeSecrets();
    const b = tokens.makeSecrets();
    assert.match(a.code, /^\d{6}$/);
    assert.match(a.link, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a.link, b.link);
});

test('hashSecret depends on the kind and the key, sameHash compares safely', () => {
    const key = Buffer.alloc(32, 1);
    const code = tokens.hashSecret('code', '123456', key);
    assert.match(code, /^[0-9a-f]{64}$/);
    assert.notEqual(code, tokens.hashSecret('link', '123456', key), 'a code never stands in for a link');
    assert.notEqual(code, tokens.hashSecret('code', '123456', Buffer.alloc(32, 2)), 'another server key, another hash');
    assert.equal(tokens.sameHash(code, tokens.hashSecret('code', '123456', key)), true);
    assert.equal(tokens.sameHash(code, tokens.hashSecret('code', '123457', key)), false);
    assert.equal(tokens.sameHash(code, 'short'), false);
});

test('cleanCode and cleanLink accept only what the page can send', () => {
    assert.equal(tokens.cleanCode(' 123 456 '), '123456');
    assert.equal(tokens.cleanCode('123-456'), '123456');
    assert.equal(tokens.cleanCode('12345'), null);
    assert.equal(tokens.cleanCode('12345a'), null);
    assert.equal(tokens.cleanLink('a'.repeat(43)), 'a'.repeat(43));
    assert.equal(tokens.cleanLink('a'.repeat(42)), null);
    assert.equal(tokens.cleanLink(`${'a'.repeat(42)}=`), null);
});

// an in-memory store with the same calls as backend/features/passwordReset/store.js
function fakeWorld({ mailReady = true, mailWorks = true } = {}) {
    const accounts = [
        { id: 1, username: 'itadmin', email: 'it@example.test', password: 'old' },
        { id: 2, username: 'noemail', email: null, password: 'old' },
    ];
    const resets = new Map(); // userId -> { id, link_hash, code_hash, code_attempts, expired }
    const requests = []; // { userId, secondsAgo }
    const wrongCodes = []; // userIds, one per wrong code today
    let nextId = 10;
    const mails = [];
    const audits = [];
    const deferred = [];
    const ended = [];
    const forgotten = [];
    const store = {
        ensureTables: async () => {},
        findAccount: async (identifier) => {
            const text = String(identifier).trim().toLowerCase();
            return accounts.find((a) => a.username === text) || accounts.find((a) => a.email === text) || null;
        },
        recentRequests: async (userId) => {
            const mine = requests.filter((r) => r.userId === userId && r.secondsAgo < 3600);
            return { count: mine.length, secondsSinceLast: mine.length ? Math.min(...mine.map((r) => r.secondsAgo)) : null };
        },
        replaceReset: async (userId, linkHash, codeHash) => {
            resets.set(userId, { id: nextId++, admin_user_id: userId, link_hash: linkHash, code_hash: codeHash, code_attempts: 0, expired: false });
            requests.push({ userId, secondsAgo: 0 });
        },
        useCodeTry: async (userId) => {
            const r = resets.get(userId);
            if (!r || r.expired || r.code_attempts >= 5) return null;
            r.code_attempts += 1;
            return { ...r };
        },
        findByLink: async (linkHash) => {
            for (const r of resets.values()) {
                if (r.link_hash === linkHash && !r.expired) {
                    const a = accounts.find((x) => x.id === r.admin_user_id);
                    return { id: r.id, admin_user_id: a.id, username: a.username, email: a.email };
                }
            }
            return null;
        },
        consume: async (resetId) => {
            for (const [userId, r] of resets) if (r.id === resetId && !r.expired) { resets.delete(userId); return true; }
            return false;
        },
        deleteForUser: async (userId) => { resets.delete(userId); },
        deleteReset: async (resetId) => { for (const [userId, r] of resets) if (r.id === resetId) resets.delete(userId); },
        setPassword: async (userId, hash) => { accounts.find((a) => a.id === userId).password = hash; return true; },
        wrongCodesToday: async (userId) => wrongCodes.filter((id) => id === userId).length,
        noteWrongCode: async (userId) => { wrongCodes.push(userId); },
    };
    const mailer = {
        ready: async () => mailReady,
        sendReset: async (to, details) => { mails.push({ kind: 'reset', to, ...details }); return { success: mailWorks }; },
        sendChanged: async (to, details) => { mails.push({ kind: 'changed', to, ...details }); return { success: true }; },
    };
    const service = createService({
        store,
        mailer,
        sessions: { end: (id) => ended.push(id) },
        loginLimit: { forgetName: (name) => forgotten.push(name) },
        audit: (action, username) => audits.push(`${action} ${username}`),
        hashPassword: async (p) => `hashed:${p}`,
        passwordProblem,
        linkBase: () => 'https://192.168.1.20:3000',
        defer: (fn) => deferred.push(fn),
        log: { error: () => {} },
    });
    const flush = async () => { while (deferred.length) await deferred.shift()(); };
    return { service, accounts, resets, requests, wrongCodes, mails, audits, ended, forgotten, flush };
}

test('a request answers the same for an account, an unknown name and an account without email', async () => {
    const w = fakeWorld();
    const answers = [];
    for (const identifier of ['itadmin', 'nobody', 'noemail']) answers.push(await w.service.request({ identifier, ip: '1.2.3.4' }));
    assert.deepEqual(answers.map((a) => a.message), [TEXT.sent, TEXT.sent, TEXT.sent]);
    assert.equal(w.mails.length, 0, 'nothing is sent before the answer');
    await w.flush();
    assert.equal(w.mails.length, 1);
    assert.equal(w.mails[0].to, 'it@example.test');
    assert.match(w.mails[0].code, /^\d{6}$/);
    assert.match(w.mails[0].link, /^https:\/\/192\.168\.1\.20:3000\/admin#reset=[A-Za-z0-9_-]{43}$/);
    const stored = w.resets.get(1);
    assert.notEqual(stored.code_hash, w.mails[0].code, 'only hashes are stored');
    assert.equal(stored.code_hash, tokens.hashSecret('code', w.mails[0].code));
    assert.deepEqual(w.audits, ['PASSWORD_RESET_REQUESTED itadmin']);
});

test('with email not set up, every name gets the same "not set up" answer', async () => {
    const w = fakeWorld({ mailReady: false });
    const a = await w.service.request({ identifier: 'itadmin' });
    const b = await w.service.request({ identifier: 'nobody' });
    assert.equal(a.status, 503);
    assert.deepEqual(a, b);
    assert.equal(a.error, TEXT.noMail);
});

test('45 s between requests and at most 5 an hour per account', async () => {
    const w = fakeWorld();
    w.requests.push({ userId: 1, secondsAgo: 30 });
    await w.service.request({ identifier: 'itadmin' });
    await w.flush();
    assert.equal(w.mails.length, 0);
    assert.deepEqual(w.audits, ['PASSWORD_RESET_LIMITED itadmin']);
    const v = fakeWorld();
    for (let i = 0; i < 5; i++) v.requests.push({ userId: 1, secondsAgo: 600 + i * 60 });
    await v.service.request({ identifier: 'itadmin' });
    await v.flush();
    assert.equal(v.mails.length, 0, 'the sixth in an hour is not sent');
});

test('an email that cannot be sent leaves no open reset behind', async () => {
    const w = fakeWorld({ mailWorks: false });
    await w.service.request({ identifier: 'itadmin' });
    await w.flush();
    assert.equal(w.resets.size, 0);
    assert.deepEqual(w.audits, ['PASSWORD_RESET_EMAIL_FAILED itadmin']);
});

async function opened(w) {
    await w.service.request({ identifier: 'it@example.test' });
    await w.flush();
    return [...w.mails].reverse().find((m) => m.kind === 'reset'); // the newest
}

test('every wrong code gets the same answer as an unknown name, so a code check gives no account away', async () => {
    const w = fakeWorld();
    const mail = await opened(w);
    const wrong = mail.code === '000000' ? '000001' : '000000';
    const real = await w.service.verifyCode({ identifier: 'itadmin', code: wrong });
    const unknown = await w.service.verifyCode({ identifier: 'nobody', code: wrong });
    const noReset = await w.service.verifyCode({ identifier: 'noemail', code: wrong });
    assert.deepEqual(real, unknown);
    assert.deepEqual(real, noReset);
    assert.equal(real.error, TEXT.codeWrongOrOld);
    // the rule about the username is only checked after the code, so it cannot tell a real name either
    const sameAsName = await w.service.complete({ identifier: 'itadmin', code: wrong, password: 'itadmin1', confirm: 'itadmin1' });
    const sameAsMadeUp = await w.service.complete({ identifier: 'nobody12', code: wrong, password: 'nobody12', confirm: 'nobody12' });
    assert.deepEqual(sameAsName, sameAsMadeUp);
});

test('with the right code, a password equal to the username is still refused and the reset stays usable', async () => {
    const w = fakeWorld();
    w.accounts[0].username = 'itadmin_01'; // long enough for the length rule, so the username rule is what answers
    const mail = await opened(w);
    const refused = await w.service.complete({ identifier: 'it@example.test', code: mail.code, password: 'ITADMIN_01', confirm: 'ITADMIN_01' });
    assert.equal(refused.error, 'The password cannot be the same as the username.');
    assert.equal(w.resets.size, 1, 'the reset is not used up');
    assert.deepEqual(await w.service.complete({ identifier: 'it@example.test', code: mail.code, password: 'Another one 9', confirm: 'Another one 9' }), { ok: true, username: 'itadmin_01' });
});

test('after 5 wrong codes the code stops working but the link still does', async () => {
    const w = fakeWorld();
    const mail = await opened(w);
    const wrong = mail.code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) assert.equal((await w.service.verifyCode({ identifier: 'itadmin', code: wrong })).error, TEXT.codeWrongOrOld);
    assert.equal((await w.service.verifyCode({ identifier: 'itadmin', code: mail.code })).error, TEXT.codeWrongOrOld, 'the right code no longer helps');
    assert.equal(w.resets.size, 1, 'the reset stays, so the owner can still use the link');
    const token = mail.link.split('#reset=')[1];
    assert.deepEqual(await w.service.complete({ token, password: 'Link after typos 1', confirm: 'Link after typos 1' }), { ok: true, username: 'itadmin' });
});

test('10 wrong codes in a day switch the code off for the account, also across new resets', async () => {
    const w = fakeWorld();
    for (let i = 0; i < 10; i++) w.wrongCodes.push(1);
    const mail = await opened(w);
    assert.equal((await w.service.verifyCode({ identifier: 'itadmin', code: mail.code })).error, TEXT.codeWrongOrOld);
    assert.equal(w.resets.get(1).code_attempts, 0, 'no try was even counted');
    assert.equal((await w.service.checkLink({ token: mail.link.split('#reset=')[1] })).ok, true, 'the link still works');
});

test('the code path: check, then save; the code and the link stop working at once', async () => {
    const w = fakeWorld();
    const mail = await opened(w);
    assert.deepEqual(await w.service.verifyCode({ identifier: 'itadmin', code: mail.code }), { ok: true, username: 'itadmin' });
    const short = await w.service.complete({ identifier: 'itadmin', code: mail.code, password: 'short', confirm: 'short' });
    assert.match(short.error, /at least 8/);
    assert.equal(w.resets.get(1).code_attempts, 1, 'a too short password costs no try');
    const done = await w.service.complete({ identifier: 'itadmin', code: mail.code, password: 'A new password 1', confirm: 'A new password 1' });
    assert.deepEqual(done, { ok: true, username: 'itadmin' });
    assert.equal(w.accounts[0].password, 'hashed:A new password 1');
    assert.deepEqual(w.ended, [1]);
    assert.deepEqual(w.forgotten, ['itadmin']);
    assert.ok(w.audits.includes('PASSWORD_RESET_DONE itadmin'));
    await w.flush();
    assert.ok(w.mails.some((m) => m.kind === 'changed' && m.to === 'it@example.test'));
    const token = mail.link.split('#reset=')[1];
    assert.equal((await w.service.checkLink({ token })).error, TEXT.linkOld, 'the link died with the code');
    assert.equal((await w.service.complete({ identifier: 'itadmin', code: mail.code, password: 'Another one 22', confirm: 'Another one 22' })).error, TEXT.codeWrongOrOld);
});

test('the link path: check, then save once; a second use is refused', async () => {
    const w = fakeWorld();
    const mail = await opened(w);
    const token = mail.link.split('#reset=')[1];
    assert.deepEqual(await w.service.checkLink({ token }), { ok: true, username: 'itadmin' });
    assert.equal((await w.service.complete({ token, password: 'Link password 1', confirm: 'Other password 1' })).error, TEXT.mismatch);
    assert.deepEqual(await w.service.complete({ token, password: 'Link password 1', confirm: 'Link password 1' }), { ok: true, username: 'itadmin' });
    assert.equal((await w.service.complete({ token, password: 'Link password 2', confirm: 'Link password 2' })).error, TEXT.linkOld);
    assert.equal((await w.service.verifyCode({ identifier: 'itadmin', code: mail.code })).error, TEXT.codeWrongOrOld, 'the code died with the link');
});

test('a new request replaces the open reset: the first code and link stop working', async () => {
    const w = fakeWorld();
    const first = await opened(w);
    w.requests.forEach((r) => { r.secondsAgo = 120; });
    const second = await opened(w);
    assert.notEqual(first.link, second.link);
    assert.equal((await w.service.checkLink({ token: first.link.split('#reset=')[1] })).error, TEXT.linkOld);
    assert.equal((await w.service.checkLink({ token: second.link.split('#reset=')[1] })).ok, true);
});
// <Jun Kai end>
