// Owner: Role 3, Jun Kai.
// The command line installer's last check: waits until the admin page of a freshly started kiosk answers.
//   node scripts/install/wait-ready.js <port> [seconds]     exit 0 when it answers, 1 when it did not in time
// The server makes its own certificate, so it is not checked here (this only asks the server on this PC).
// <Jun Kai start>
const https = require('https');
const http = require('http');

const port = Number(process.argv[2]) || 3000;
const until = Date.now() + (Number(process.argv[3]) || 120) * 1000;

function ask(lib) {
    return new Promise((resolve) => {
        const req = lib.get({ host: '127.0.0.1', port, path: '/admin', rejectUnauthorized: false, timeout: 4000 }, (res) => {
            res.resume();
            resolve(res.statusCode);
        });
        req.on('timeout', () => req.destroy());
        req.on('error', () => resolve(0));
    });
}

(async () => {
    while (Date.now() < until) {
        const status = (await ask(https)) || (await ask(http));
        if (status >= 200 && status < 500) {
            console.log(`the admin page answers on port ${port} (HTTP ${status})`);
            process.exit(0);
        }
        await new Promise((r) => setTimeout(r, 1500));
    }
    console.log(`the admin page did not answer on port ${port} in time`);
    process.exit(1);
})();
// <Jun Kai end>
