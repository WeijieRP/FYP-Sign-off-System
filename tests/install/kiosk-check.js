// Owner: Role 3, Jun Kai.
// Helper of the package install test (tests/install/package-flow.ps1), run with the Node.js inside an installed copy:
//   node kiosk-check.js login <port> <user> <ENV_NAME>   prints the HTTP status of an admin sign in (password from ENV_NAME)
//   node kiosk-check.js marker add <appDir>              adds the visitor "CI marker" to the installed database
//   node kiosk-check.js marker has <appDir>              exit 0 when the visitor "CI marker" is in the database
// <Jun Kai start>
const https = require('https');
const path = require('path');
const fs = require('fs');

function login(port, username, envName) {
    const body = JSON.stringify({ username, password: process.env[envName] || '' });
    return new Promise((resolve) => {
        const req = https.request({ host: '127.0.0.1', port, path: '/api/admin/login', method: 'POST', rejectUnauthorized: false, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
            res.resume();
            resolve(res.statusCode);
        });
        req.on('error', (e) => resolve(`error ${e.message}`));
        req.end(body);
    });
}

async function marker(action, appDir) {
    const mysql = require(path.join(appDir, 'node_modules', 'mysql2', 'promise'));
    const env = {};
    for (const line of fs.readFileSync(path.join(appDir, 'backend', '.env'), 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m) env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
    const conn = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME });
    try {
        if (action === 'add') {
            await conn.query("INSERT INTO users (name, visit_count, last_visit) VALUES ('CI marker', 1, CURRENT_TIMESTAMP)");
            return 0;
        }
        const [[row]] = await conn.query("SELECT COUNT(*) AS n FROM users WHERE name = 'CI marker'");
        console.log(`CI marker rows: ${row.n}`);
        return Number(row.n) > 0 ? 0 : 1;
    } finally {
        await conn.end();
    }
}

(async () => {
    const [cmd, a, b, c] = process.argv.slice(2);
    if (cmd === 'login') { console.log(await login(Number(a), b, c)); process.exit(0); }
    if (cmd === 'marker') process.exit(await marker(a, b));
    console.log('usage: kiosk-check.js login <port> <user> <ENV_NAME> | marker add|has <appDir>');
    process.exit(2);
})().catch((e) => { console.error(e.message); process.exit(1); });
// <Jun Kai end>
