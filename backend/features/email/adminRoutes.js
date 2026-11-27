// Owner: Role 3, Jun Kai.
// The Email page's status line and preview, mounted at /api/admin/email (session required):
//   GET /status[?refresh=1]  the mail account (never its password), the login check, emails sent in 7 days, the last test
//   GET /preview             the thank-you email a visitor gets, built by the email service with sample visitor details
// <Jun Kai start>
const express = require('express');
const auth = require('../../core/auth');
const db = require('../../core/db');
const paths = require('../../core/paths');
const { readJson, writeJsonAtomic } = require('../../core/jsonFile');
const configStore = require('./configStore');

const router = express.Router();
const LAST_TEST_FILE = 'email-last-test.json';
const PROVIDERS = { gmail: 'Gmail', outlook: 'Outlook', custom: 'custom SMTP' };

// Called by POST /api/admin/email-config/test: when the last test ran and whether it went out (no address is kept)
function recordTest(ok, error) {
    try {
        writeJsonAtomic(paths.dataFile(LAST_TEST_FILE), { at: new Date().toISOString(), ok: !!ok, error: ok ? null : String(error || '').slice(0, 200) });
    } catch (err) {
        console.warn(`Could not keep the last email test: ${err.message}`);
    }
}

function lastTest() {
    const value = readJson(paths.dataFile(LAST_TEST_FILE), null);
    return value && value.at ? value : null;
}

const one = (sql) => new Promise((resolve, reject) => db.all(sql, [], (err, rows) => (err ? reject(err) : resolve(rows[0] || {}))));

router.get('/status', auth.requireAuth, async (req, res) => {
    try {
        const cfg = configStore.getSafeEmailConfig();
        const provider = cfg.provider || 'gmail';
        const account = (cfg[provider] && cfg[provider].user) || '';
        const configured = !!account && (provider !== 'custom' || !!cfg.custom.host);
        const login = configured ? await require('../health/checks').checkEmail(req.query.refresh === '1') : null;
        let sent = { n: null, last: null };
        try {
            sent = await one("SELECT COUNT(*) AS n, MAX(email_sent_at) AS last FROM feedback WHERE email_sent = 1 AND email_sent_at >= NOW() - INTERVAL 7 DAY");
        } catch (err) {
            console.warn(`Could not count the emails sent: ${err.message}`);
        }
        res.json({
            success: true,
            status: {
                provider,
                providerName: PROVIDERS[provider] || provider,
                sender: cfg.senderEmail || account,
                configured,
                login: login && { status: login.status, summary: login.summary, latencyMs: login.latencyMs, cached: !!login.cached },
                sent7d: sent.n === null || sent.n === undefined ? null : Number(sent.n),
                lastSentAt: sent.last ? new Date(sent.last).toISOString() : null,
                lastTest: lastTest()
            }
        });
    } catch (error) {
        console.error('❌ Email status failed:', error);
        res.status(500).json({ success: false, error: `Email status failed: ${error.message}` });
    }
});

// The real thank-you email, built by the email service with a sample visitor; a stand-in transporter keeps the message
// instead of sending it, so nothing leaves the PC
router.get('/preview', auth.requireAuth, async (req, res) => {
    try {
        let message = null;
        const keep = { sendMail: async (options) => { message = options; return { messageId: 'preview', accepted: [options.to] }; } };
        const emailService = require('./service');
        const result = await emailService.sendThankYouEmail('Alex', 'visitor@example.com', null, 'I pledge to bring my own bottle and refill it.', { pledgeTopics: ['climate-change'], previewTransport: keep });
        if (!message) return res.status(500).json({ success: false, error: (result && result.error) || 'The email could not be built' });
        const cfg = configStore.getSafeEmailConfig();
        const sender = cfg.senderEmail || (cfg[cfg.provider] && cfg[cfg.provider].user) || 'the sender address you save';
        res.json({ success: true, preview: { subject: message.subject, from: `RP Xperience Centre <${sender}>`, to: 'Alex <visitor@example.com>', html: message.html } });
    } catch (error) {
        console.error('❌ Email preview failed:', error);
        res.status(500).json({ success: false, error: `Email preview failed: ${error.message}` });
    }
});

module.exports = router;
module.exports.recordTest = recordTest;
// <Jun Kai end>
