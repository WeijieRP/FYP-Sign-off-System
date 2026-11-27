// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// Limits on how many requests one address can send, so one PC or tablet cannot flood the server, guess passwords on
// the routes that ask for one, or use the kiosk forms to send mail from the centre's account again and again.
// Uses the express-rate-limit package: the code scan in CI only counts limits made with a known package.
// Every tablet reaches the servers with its own address, so one busy tablet never uses up the count of another.
// Kept in memory: a restart of a server clears the counts.
//
// Measured on the test copy (25 Nov 2026): an admin who opens every page and then leaves Hardware open sends at most
// 175 requests in a minute, and one load of the kiosk page sends 34. The limits leave room for several of those at once.
const { rateLimit } = require('express-rate-limit');

const answer = (text) => ({ success: false, error: text });
const common = { standardHeaders: 'draft-7', legacyHeaders: false };

// Static files (pictures, photos, scripts, styles, fonts, models) are only read from disk and grow with the data, for
// example the small photos of a list page, so they are not counted. Pages and API routes always are.
const STATIC_FILE = /\.(js|mjs|css|map|png|jpe?g|gif|webp|svg|ico|bmp|woff2?|ttf|otf|mp3|mp4|webm|wav|glb|gltf|bin|task|tflite|wasm)$/i;
const isStaticFile = (req) => (req.method === 'GET' || req.method === 'HEAD') && STATIC_FILE.test(req.path);

// Every request of one address except static files. Each server makes its own limiter from these settings with
// rateLimit(EVERY_REQUEST) next to its app.use, so the code scan sees the limit in front of the routes.
const EVERY_REQUEST = {
    ...common,
    windowMs: 60 * 1000,
    limit: 1000,
    skip: isStaticFile,
    message: answer('Too many requests from this address. Wait a minute and try again.')
};

// Routes that check the admin password: 20 wrong passwords per 15 minutes. Every one of these routes answers a wrong
// password with "Invalid password" (as a 401, a 403 or a 200 with success false), so only answers with that text
// count. The right password, a missing field, a row that cannot be decrypted or a server error never use up the 20,
// so decrypting 25 emails in a row never locks anyone out.
function markWrongPassword(req, res, next) {
    const json = res.json.bind(res);
    res.json = (body) => {
        const text = body && typeof body === 'object' ? `${body.error || ''} ${body.message || ''}` : '';
        if (/invalid password/i.test(text)) res.locals.wrongPassword = true;
        return json(body);
    };
    next();
}

const passwordLimiter = rateLimit({
    ...common,
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => !res.locals.wrongPassword,
    message: answer('Too many wrong passwords from this address. Wait 15 minutes and try again.')
});

// used as one middleware in a route: router.post('/x', auth.requireAuth, requestLimit.passwordChecks, handler)
const passwordChecks = [markWrongPassword, passwordLimiter];

// Downloads that build a file (Excel, ZIP of photos, exports)
const heavyWork = rateLimit({
    ...common,
    windowMs: 10 * 60 * 1000,
    limit: 30,
    message: answer('Too many downloads from this address. Wait a few minutes and try again.')
});

// The kiosk forms that save something or send mail (photos, the submission, a lost & found report)
const kioskForms = rateLimit({
    ...common,
    windowMs: 10 * 60 * 1000,
    limit: 120,
    message: answer('Too many submissions from this device. Wait a few minutes and try again.')
});

// The visitor passport looks a visitor up by email, so it is kept slow for anyone trying many addresses
const visitorLookup = rateLimit({
    ...common,
    windowMs: 10 * 60 * 1000,
    limit: 30,
    message: answer('Too many lookups from this device. Wait a few minutes and try again.')
});

// <Jun Kai start> a forgotten admin password (backend/features/passwordReset): asking for a code by email, and the
// checks of a code or link. The per-account limits (5 emails an hour, 5 tries of a code) are in the reset itself.
const resetRequests = rateLimit({
    ...common,
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: answer('Too many reset requests from this address. Wait 15 minutes and try again.')
});
const resetChecks = rateLimit({
    ...common,
    windowMs: 15 * 60 * 1000,
    limit: 40,
    message: answer('Too many tries from this address. Wait 15 minutes and try again.')
});
// <Jun Kai end>

module.exports = { EVERY_REQUEST, passwordChecks, heavyWork, kioskForms, visitorLookup, resetRequests, resetChecks };
// <Jun Kai end>
