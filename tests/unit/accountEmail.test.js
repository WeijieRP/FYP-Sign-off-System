// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// Account emails and the password rule (backend/core/accountEmail.js). ensureColumn gets a fake database, so no
// MySQL is needed.
const test = require('node:test');
const assert = require('node:assert/strict');

function fresh() {
    delete require.cache[require.resolve('../../backend/core/accountEmail')];
    return require('../../backend/core/accountEmail');
}

test('normalizeEmail trims, lowercases and turns empty into null', () => {
    const { normalizeEmail } = fresh();
    assert.equal(normalizeEmail('  Admin@Example.COM '), 'admin@example.com');
    assert.equal(normalizeEmail(''), null);
    assert.equal(normalizeEmail('   '), null);
    assert.equal(normalizeEmail(null), null);
    assert.equal(normalizeEmail(undefined), null);
});

test('emailProblem accepts a normal address and refuses typing mistakes', () => {
    const { emailProblem } = fresh();
    assert.equal(emailProblem('name@example.com'), null);
    assert.equal(emailProblem('first.last+tag@sub.example.edu.sg'), null);
    assert.equal(emailProblem(null), null, 'optional by default');
    assert.match(emailProblem(null, { required: true }), /email is needed/);
    for (const bad of ['name', 'name@', '@example.com', 'name@example', 'na me@example.com', 'name@example.c', 'a<b>@example.com', `${'a'.repeat(250)}@example.com`]) {
        assert.match(emailProblem(bad), /valid email/, bad);
    }
});

test('passwordProblem: at least 8 characters, at most 72 bytes, not the username', () => {
    const { passwordProblem } = fresh();
    assert.equal(passwordProblem('long enough 1'), null);
    assert.match(passwordProblem('short'), /at least 8/);
    assert.match(passwordProblem(''), /at least 8/);
    assert.match(passwordProblem('x'.repeat(73)), /at most 72/);
    assert.match(passwordProblem('é'.repeat(40)), /at most 72/, '80 bytes in UTF-8');
    assert.match(passwordProblem('ItAdmin2026', 'itadmin2026'), /same as the username/);
});

test('isDuplicateEmail spots the unique index error only', () => {
    const { isDuplicateEmail } = fresh();
    assert.equal(isDuplicateEmail({ code: 'ER_DUP_ENTRY', message: "Duplicate entry 'a@b.co' for key 'admin_users.uq_admin_users_email'" }), true);
    assert.equal(isDuplicateEmail({ code: 'ER_DUP_ENTRY', message: "Duplicate entry 'bob' for key 'admin_users.username'" }), false);
    assert.equal(isDuplicateEmail(null), false);
});

function fakeDb({ column, index }) {
    const ran = [];
    return {
        ran,
        all(sql, params, callback) {
            ran.push(sql);
            if (/COLUMNS/.test(sql)) return callback(null, [{ n: column ? 1 : 0 }]);
            if (/STATISTICS/.test(sql)) return callback(null, [{ n: index ? 1 : 0 }]);
            return callback(null, []);
        }
    };
}

test('ensureColumn adds the column and the index only when they are missing, once per start', async () => {
    let mod = fresh();
    const missing = fakeDb({ column: false, index: false });
    await mod.ensureColumn(missing);
    await mod.ensureColumn(missing);
    assert.equal(missing.ran.filter((s) => /ADD COLUMN email/.test(s)).length, 1);
    assert.equal(missing.ran.filter((s) => /ADD UNIQUE INDEX uq_admin_users_email/.test(s)).length, 1);
    assert.equal(missing.ran.length, 4, 'the second call reuses the first one');

    mod = fresh();
    const there = fakeDb({ column: true, index: true });
    await mod.ensureColumn(there);
    assert.equal(there.ran.some((s) => /ALTER TABLE/.test(s)), false);
});

test('ensureColumn tries again after a failure instead of remembering it', async () => {
    const mod = fresh();
    let fail = true;
    const db = { all(sql, params, callback) { if (fail) return callback(new Error('MySQL down')); return callback(null, [{ n: 1 }]); } };
    await assert.rejects(mod.ensureColumn(db), /MySQL down/);
    fail = false;
    await mod.ensureColumn(db);
});
// <Jun Kai end>
