// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The routes of a forgotten admin password, under /api/admin/password-reset on the admin server only. They are open
// without a sign-in (that is the point), so every one has a limit per address, and the answers never show a code,
// a link or whether an account exists.
//   POST /request      { identifier }                         -> the same answer for every name
//   POST /verify-code  { identifier, code }                   -> is the code right (counts one try)
//   POST /check-link   { token }                              -> is the link still open, and for which account
//   POST /complete     { identifier, code | token, password, confirm }
// configure({ linkBase }) gives the start of the link ("https://<the PC's address>:<port>"), worked out by the server
// from its own network address, never from the Host header that a browser sends.
const express = require('express');
const db = require('../../core/db');
const auth = require('../../core/auth');
const accountEmail = require('../../core/accountEmail');
const adminSessions = require('../../core/adminSessions');
const loginLimit = require('../../core/loginLimit');
const requestLimit = require('../../core/requestLimit');
const { logAudit } = require('../../core/audit');
const { createStore } = require('./store');
const { createService } = require('./service');
const mailer = require('./mailer');

let linkBase = () => `https://localhost:${Number(process.env.PORT) || 3000}`;
function configure(options = {}) {
    if (typeof options.linkBase === 'function') linkBase = options.linkBase;
}

function create() {
    const router = express.Router();
    const store = createStore(db);
    const service = createService({
        store,
        mailer,
        sessions: adminSessions,
        loginLimit,
        audit: (action, username, userId, ip) => logAudit(action, username, 'user', userId, { ip, headers: {} }),
        hashPassword: auth.hashPassword,
        passwordProblem: accountEmail.passwordProblem,
        linkBase: () => linkBase(),
    });
    const answer = (res, result) => {
        if (result.ok) {
            const rest = { ...result };
            delete rest.ok;
            return res.json({ success: true, ...rest });
        }
        return res.status(result.status || 400).json({ success: false, error: result.error, ...(result.mailNotSetUp ? { mailNotSetUp: true } : {}) });
    };
    const handle = (work) => async (req, res) => {
        try {
            answer(res, await work(req.body || {}, req.ip));
        } catch (error) {
            console.error('Password reset route failed:', error.message);
            res.status(500).json({ success: false, error: 'Something went wrong on the server. Please try again in a moment.' });
        }
    };
    // nothing here is cached by a browser or a proxy
    router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    router.post('/request', requestLimit.resetRequests, handle((body, ip) => service.request({ identifier: body.identifier, ip })));
    router.post('/verify-code', requestLimit.resetChecks, handle((body, ip) => service.verifyCode({ identifier: body.identifier, code: body.code, ip })));
    router.post('/check-link', requestLimit.resetChecks, handle((body) => service.checkLink({ token: body.token })));
    router.post('/complete', requestLimit.resetChecks, handle((body, ip) => service.complete({ identifier: body.identifier, code: body.code, token: body.token, password: body.password, confirm: body.confirm, ip })));
    return router;
}

// used by the Users routes: an email change or a soft delete ends the open reset of that account
const sharedStore = createStore(db);

module.exports = { router: create(), configure, endResetsOf: (userId) => sharedStore.deleteForUser(userId), mailer };
// <Jun Kai end>
