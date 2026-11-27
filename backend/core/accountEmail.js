// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The email of an admin account (used to reset a forgotten password) and the password rule of every admin account.
// One place for both, so adding a user, editing one and resetting a password check the same way.
//  - normalizeEmail: trimmed and in lower case; empty becomes null (the unique index allows many NULLs, not two '').
//  - emailProblem / passwordProblem: the sentence to show, or null when the value is fine.
//  - ensureColumn(db): adds admin_users.email and its unique index when migration 011 has not run on this database
//    yet, so the Users page and the sign-in keep working right after an update. Runs once per server start.

const EMAIL_MAX = 254;
// a plain check that catches typing mistakes; the real test of an address is the email that reaches it
const EMAIL_PATTERN = /^[^\s@<>"',;:()[\]\\]+@[^\s@<>"',;:()[\]\\]+\.[^\s@<>"',;:()[\]\\]{2,}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt ignores everything after 72 bytes, so a longer password would not all count

function normalizeEmail(value) {
    const text = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
    return text || null;
}

function emailProblem(email, { required = false } = {}) {
    if (!email) return required ? 'An email is needed, so a forgotten password can be reset.' : null;
    if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) return 'Enter a valid email address, like name@example.com.';
    return null;
}

function passwordProblem(password, username = '') {
    const text = String(password === undefined || password === null ? '' : password);
    if (text.length < PASSWORD_MIN) return `The password needs at least ${PASSWORD_MIN} characters.`;
    if (Buffer.byteLength(text, 'utf8') > PASSWORD_MAX_BYTES) return `The password can have at most ${PASSWORD_MAX_BYTES} characters.`;
    if (username && text.toLowerCase() === String(username).toLowerCase()) return 'The password cannot be the same as the username.';
    return null;
}

// true for the MySQL error of a second account with the same email
function isDuplicateEmail(err) {
    return !!err && (err.code === 'ER_DUP_ENTRY' || /duplicate entry/i.test(err.message || '')) && /uq_admin_users_email|email/i.test(err.message || '');
}

let ensured = null;
function ensureColumn(db) {
    if (ensured) return ensured;
    const run = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
    ensured = (async () => {
        const [column] = await run("SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_users' AND COLUMN_NAME = 'email'");
        if (!Number(column.n)) await run('ALTER TABLE admin_users ADD COLUMN email VARCHAR(254) NULL AFTER full_name');
        const [index] = await run("SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_users' AND INDEX_NAME = 'uq_admin_users_email'");
        if (!Number(index.n)) await run('ALTER TABLE admin_users ADD UNIQUE INDEX uq_admin_users_email (email)');
    })().catch((err) => {
        ensured = null; // try again on the next request instead of remembering a failure
        throw err;
    });
    return ensured;
}

module.exports = { normalizeEmail, emailProblem, passwordProblem, isDuplicateEmail, ensureColumn, EMAIL_MAX, PASSWORD_MIN, PASSWORD_MAX_BYTES };
// <Jun Kai end>
