// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The files under /uploads are visitor photos and lost-and-found pictures. They used to be handed to anyone who knew
// a file name. Now they go to a signed-in admin, and to the browser that just made the file: the kiosk page offers
// "download your photo" right after a visit, with no sign-in.
//  - remember(req, 'photos/<file>') is called when a photo was saved for a browser. The name goes into that browser's
//    session (this is what gives a visitor a session at all);
//  - gate stands in front of the static files of /uploads on both servers.
const path = require('path');

const OWN_MAX = 8; // the newest files one visitor session may open: a raw and a framed photo per visit

function remember(req, relPath) {
    if (!req || !req.session) return;
    const own = Array.isArray(req.session.ownUploads) ? req.session.ownUploads : [];
    own.push(String(relPath));
    req.session.ownUploads = own.slice(-OWN_MAX);
}

// '/photos/a%20b.png' -> 'photos/a b.png'; null for an address that cannot be read
function wanted(reqPath) {
    try {
        return path.posix.normalize('/' + decodeURIComponent(String(reqPath || ''))).replace(/^\/+/, '');
    } catch {
        return null;
    }
}

function gate(req, res, next) {
    if (req.session && req.session.user) return next();
    const file = wanted(req.path);
    const own = (req.session && Array.isArray(req.session.ownUploads)) ? req.session.ownUploads : [];
    if (file && own.includes(file)) return next();
    res.status(401).json({ error: 'Sign in to see this file' });
}

module.exports = { remember, gate, wanted, OWN_MAX };
// <Jun Kai end>
