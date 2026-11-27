// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The database side of a password reset (tables of migration 012). Every time is set and compared with MySQL's NOW(),
// so the clock of this program never decides whether a reset is still valid. createStore(db) takes the database, so
// the unit tests can give it a fake one.
const TTL_MINUTES = 15;
const MAX_CODE_TRIES = 5; // wrong codes per reset
const MAX_WRONG_CODES_PER_DAY = 10; // wrong codes per account in 24 hours, across resets
const accountEmail = require('../../core/accountEmail');

const TABLES = [
    `CREATE TABLE IF NOT EXISTS admin_password_resets (
      id INT NOT NULL AUTO_INCREMENT,
      admin_user_id INT NOT NULL,
      link_hash CHAR(64) NOT NULL,
      code_hash CHAR(64) NOT NULL,
      code_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      requested_ip VARCHAR(64) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_password_reset_user (admin_user_id),
      UNIQUE KEY uq_password_reset_link (link_hash),
      CONSTRAINT fk_password_reset_user FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS admin_password_reset_requests (
      id INT NOT NULL AUTO_INCREMENT,
      admin_user_id INT NOT NULL,
      requested_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      requested_ip VARCHAR(64) NULL,
      PRIMARY KEY (id),
      KEY idx_password_reset_requests_user (admin_user_id, requested_at),
      CONSTRAINT fk_password_reset_request_user FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS admin_password_reset_failures (
      id INT NOT NULL AUTO_INCREMENT,
      admin_user_id INT NOT NULL,
      failed_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_password_reset_failures_user (admin_user_id, failed_at),
      CONSTRAINT fk_password_reset_failure_user FOREIGN KEY (admin_user_id) REFERENCES admin_users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

function createStore(db) {
    const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
    const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(err) { if (err) reject(err); else resolve(this.changes || 0); }));
    const one = async (sql, params) => (await all(sql, params))[0] || null;
    const tx = (work) => new Promise((resolve, reject) => db.withTransaction(work, (err, result) => (err ? reject(err) : resolve(result))));

    let ready = null;
    function ensureTables() {
        if (!ready) {
            // the email column of migration 011 first: the reset reads admin_users.email
            ready = (async () => { await accountEmail.ensureColumn(db); for (const sql of TABLES) await all(sql); })().catch((err) => { ready = null; throw err; });
        }
        return ready;
    }

    // an active account by its username (any case) or its email; the username wins when both could match
    async function findAccount(identifier) {
        const text = String(identifier || '').trim().toLowerCase();
        if (!text) return null;
        const fields = 'id, username, email';
        const where = 'is_active = 1 AND is_deleted = 0';
        return await one(`SELECT ${fields} FROM admin_users WHERE ${where} AND LOWER(username) = ? LIMIT 1`, [text])
            || await one(`SELECT ${fields} FROM admin_users WHERE ${where} AND email = ? LIMIT 1`, [text]);
    }

    // how many resets this account asked for in the last hour, and how many seconds ago the last one was
    async function recentRequests(userId) {
        const row = await one(`SELECT COUNT(*) AS n, TIMESTAMPDIFF(SECOND, MAX(requested_at), NOW()) AS since
            FROM admin_password_reset_requests WHERE admin_user_id = ? AND requested_at > NOW() - INTERVAL 1 HOUR`, [userId]);
        return { count: Number(row && row.n) || 0, secondsSinceLast: row && row.since !== null ? Number(row.since) : null };
    }

    // a new reset replaces the open one (one per account), in one transaction with the note of the request
    function replaceReset(userId, linkHash, codeHash, ip) {
        return tx((t, finish) => {
            t.run('DELETE FROM admin_password_resets WHERE admin_user_id = ?', [userId], (delErr) => {
                if (delErr) return finish(delErr);
                t.run(`INSERT INTO admin_password_resets (admin_user_id, link_hash, code_hash, expires_at, requested_ip)
                       VALUES (?, ?, ?, NOW() + INTERVAL ${TTL_MINUTES} MINUTE, ?)`, [userId, linkHash, codeHash, ip || null], (insErr) => {
                    if (insErr) return finish(insErr);
                    t.run('INSERT INTO admin_password_reset_requests (admin_user_id, requested_ip) VALUES (?, ?)', [userId, ip || null], (logErr) => {
                        if (logErr) return finish(logErr);
                        t.run('DELETE FROM admin_password_reset_requests WHERE requested_at < NOW() - INTERVAL 1 DAY', [], (pruneErr) => finish(pruneErr || null));
                    });
                });
            });
        });
    }

    // Counts one try of a code before the code is compared, in one UPDATE, so two requests at the same moment cannot
    // both get a free try. Returns the reset (with the new count) while it is open and has tries left, else null.
    async function useCodeTry(userId) {
        const changed = await run(`UPDATE admin_password_resets SET code_attempts = code_attempts + 1
            WHERE admin_user_id = ? AND expires_at > NOW() AND code_attempts < ${MAX_CODE_TRIES}`, [userId]);
        if (!changed) return null;
        return await one('SELECT id, admin_user_id, code_hash, code_attempts FROM admin_password_resets WHERE admin_user_id = ? AND expires_at > NOW()', [userId]);
    }

    // the open reset of a link token (by its hash), with the account it belongs to
    async function findByLink(linkHash) {
        return await one(`SELECT r.id, r.admin_user_id, u.username, u.email FROM admin_password_resets r
            JOIN admin_users u ON u.id = r.admin_user_id
            WHERE r.link_hash = ? AND r.expires_at > NOW() AND u.is_active = 1 AND u.is_deleted = 0`, [linkHash]);
    }

    // uses up a reset: true only for the request whose DELETE removed it, so a code or link works once
    async function consume(resetId) {
        return (await run('DELETE FROM admin_password_resets WHERE id = ? AND expires_at > NOW()', [resetId])) === 1;
    }

    // wrong codes of an account in the last 24 hours, and noting one more
    async function wrongCodesToday(userId) {
        const row = await one('SELECT COUNT(*) AS n FROM admin_password_reset_failures WHERE admin_user_id = ? AND failed_at > NOW() - INTERVAL 1 DAY', [userId]);
        return Number(row && row.n) || 0;
    }
    async function noteWrongCode(userId) {
        await run('INSERT INTO admin_password_reset_failures (admin_user_id) VALUES (?)', [userId]);
        await run('DELETE FROM admin_password_reset_failures WHERE failed_at < NOW() - INTERVAL 2 DAY');
    }

    async function deleteForUser(userId) {
        await ensureTables();
        return run('DELETE FROM admin_password_resets WHERE admin_user_id = ?', [userId]);
    }

    async function deleteReset(resetId) {
        return run('DELETE FROM admin_password_resets WHERE id = ?', [resetId]);
    }

    async function setPassword(userId, passwordHash) {
        return (await run('UPDATE admin_users SET password_hash = ? WHERE id = ? AND is_active = 1 AND is_deleted = 0', [passwordHash, userId])) === 1;
    }

    async function accountById(userId) {
        return one('SELECT id, username, email FROM admin_users WHERE id = ? AND is_active = 1 AND is_deleted = 0', [userId]);
    }

    return { ensureTables, findAccount, recentRequests, replaceReset, useCodeTry, findByLink, consume, deleteForUser, deleteReset, setPassword, accountById, wrongCodesToday, noteWrongCode };
}

module.exports = { createStore, TTL_MINUTES, MAX_CODE_TRIES, MAX_WRONG_CODES_PER_DAY, TABLES };
// <Jun Kai end>
