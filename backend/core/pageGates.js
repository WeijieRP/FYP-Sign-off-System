// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The two tree pages have a gate each: GET /tree and GET /3dTree answer only for the display mode chosen in the admin
// page. The same pages are also plain files under frontend/, and the static file server stands before the routes, so
// /tree/tree.html opened either page with no gate. A request for one of those two files is sent to its gated route.
// (The pledgeboard page is left out on purpose: its phone gate bounces every phone today, see docs/review-status.md.)
const fs = require('fs');
const path = require('path');

const PAGES = [
    { folder: 'tree', file: 'tree.html', route: '/tree' },
    { folder: '3dTree', file: '3dTree.html', route: '/3dTree' },
];

// The route a request has to go through, or null. Windows opens the same file under more than one spelling (another
// case, a trailing dot, a short 8.3 name), so the file is looked up the way the disk names it, not by its text.
function gatedRoute(reqPath, frontendRoot) {
    let decoded;
    try { decoded = decodeURIComponent(String(reqPath || '')); } catch { return null; }
    const clean = path.posix.normalize('/' + decoded.replace(/\\/g, '/'));
    const first = clean.split('/')[1] || '';
    if (!PAGES.some((page) => page.folder.toLowerCase() === first.toLowerCase())) return null;
    const asked = path.resolve(frontendRoot, '.' + clean);
    let onDisk = asked;
    try { onDisk = fs.realpathSync.native(asked); } catch { /* no such file: compare the text */ }
    const name = onDisk.toLowerCase().replace(/[. ]+$/, '');
    for (const page of PAGES) {
        const gated = path.resolve(frontendRoot, page.folder, page.file).toLowerCase();
        if (name === gated || name.startsWith(gated + ':')) return page.route;
    }
    return null;
}

function middleware(frontendRoot) {
    return (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const route = gatedRoute(req.path, frontendRoot);
        if (route) return res.redirect(route);
        next();
    };
}

module.exports = { gatedRoute, middleware, PAGES };
// <Jun Kai end>
