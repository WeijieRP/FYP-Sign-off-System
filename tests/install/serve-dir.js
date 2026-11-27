// Owner: Role 3, Jun Kai.
// A tiny web server for the package install test: serves one folder on 127.0.0.1, so the one command install
// (get-kiosk.ps1 -From http://...) is tested with a real download. Run: node serve-dir.js <folder> <port>
// <Jun Kai start>
const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3]) || 8099;
http.createServer((req, res) => {
    const name = path.basename(decodeURIComponent(req.url.split('?')[0]));
    const file = path.join(dir, name);
    if (!name || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`serving ${dir} on http://127.0.0.1:${port}/`));
// <Jun Kai end>
