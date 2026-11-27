// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The emails of a forgotten admin password: the code and link, "your password was changed", and "your email was
// changed" (sent to the old address). They go out through the email account set up on the Email page.
//
// PASSWORD_RESET_TEST_OUTBOX: only for tests on a test copy. When it names a file, these emails are written into that
// file (one JSON line each) instead of being sent, so a check can read the code without a real inbox. Leave it empty
// on the kiosk PC; the server prints a warning at the start when it is set.
const fs = require('fs');
const emailService = require('../email/service');

const outbox = () => process.env.PASSWORD_RESET_TEST_OUTBOX || '';

const escapeHtml = (value) => String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// "j***@gmail.com": enough to recognise an address without showing all of it
function maskEmail(email) {
    const [name, domain] = String(email || '').split('@');
    if (!name || !domain) return '';
    return `${name[0]}${'*'.repeat(Math.max(2, Math.min(name.length - 1, 6)))}@${domain}`;
}

function frame(title, body) {
    return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.55">
        <h2 style="margin:0 0 14px;font-size:20px;color:#0f172a">${escapeHtml(title)}</h2>${body}
        <p style="margin:22px 0 0;font-size:12px;color:#64748b">RP Xperience Centre Sign-Off · Republic Polytechnic. This email was sent by the admin page of the kiosk; replies are not read.</p>
    </div>`;
}

function resetMail({ username, code, link, minutes, ip, when }) {
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    const text = [
        `Hello ${username},`,
        '',
        'Someone asked to reset the password of your RP Xperience Centre admin account.',
        '',
        `Your code: ${spaced}`,
        `Or open this link on a computer on the centre's network: ${link}`,
        '',
        `The code and the link work once, for ${minutes} minutes. Asking again replaces them.`,
        'If you did not ask for this, ignore this email: your password stays the same.',
        '',
        `Asked from ${ip || 'an unknown address'} at ${when}.`
    ].join('\n');
    const html = frame('Reset your admin password', `
        <p style="margin:0 0 12px">Hello ${escapeHtml(username)},</p>
        <p style="margin:0 0 16px">Someone asked to reset the password of your RP Xperience Centre admin account. Use the code or the button. Either works once, for ${minutes} minutes.</p>
        <p style="margin:0 0 6px;font-size:13px;color:#475569">Your code</p>
        <p style="margin:0 0 18px;font-size:30px;font-weight:700;letter-spacing:6px;font-family:Consolas,monospace">${escapeHtml(spaced)}</p>
        <p style="margin:0 0 8px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 20px;border-radius:8px;background:#1d4ed8;color:#ffffff;font-weight:700;text-decoration:none">Reset my password</a></p>
        <p style="margin:0 0 16px;font-size:13px;color:#475569">The button opens the admin page on a computer on the centre's network. Anywhere else, type the code on the admin page instead.</p>
        <p style="margin:0 0 6px;font-size:13px;color:#475569">If you did not ask for this, ignore this email: your password stays the same.</p>
        <p style="margin:0;font-size:12px;color:#64748b">Asked from ${escapeHtml(ip || 'an unknown address')} at ${escapeHtml(when)}.</p>`);
    return { subject: 'Reset your RP Xperience Centre admin password', text, html };
}

function changedMail({ username, ip, when }) {
    const text = [
        `Hello ${username},`,
        '',
        'The password of your RP Xperience Centre admin account was just changed with a reset code or link.',
        'Every place where the account was signed in has been signed out.',
        '',
        `Changed from ${ip || 'an unknown address'} at ${when}.`,
        'If this was not you, ask a System Admin to set a new password for your account at once.'
    ].join('\n');
    const html = frame('Your admin password was changed', `
        <p style="margin:0 0 12px">Hello ${escapeHtml(username)},</p>
        <p style="margin:0 0 12px">The password of your RP Xperience Centre admin account was just changed with a reset code or link. Every place where the account was signed in has been signed out.</p>
        <p style="margin:0 0 12px;font-size:13px;color:#475569">Changed from ${escapeHtml(ip || 'an unknown address')} at ${escapeHtml(when)}.</p>
        <p style="margin:0;font-weight:700">If this was not you, ask a System Admin to set a new password for your account at once.</p>`);
    return { subject: 'Your RP Xperience Centre admin password was changed', text, html };
}

function emailChangedMail({ username, newEmail, by, when }) {
    const masked = maskEmail(newEmail);
    const text = [
        `Hello ${username},`,
        '',
        `The email of your RP Xperience Centre admin account was changed to ${masked} by ${by} at ${when}.`,
        'Password reset codes and links now go to the new address. This old address gets no more of them.',
        'If this was not expected, ask a System Admin to check your account.'
    ].join('\n');
    const html = frame('The email of your admin account was changed', `
        <p style="margin:0 0 12px">Hello ${escapeHtml(username)},</p>
        <p style="margin:0 0 12px">The email of your RP Xperience Centre admin account was changed to <b>${escapeHtml(masked)}</b> by ${escapeHtml(by)} at ${escapeHtml(when)}.</p>
        <p style="margin:0 0 12px">Password reset codes and links now go to the new address. This old address gets no more of them.</p>
        <p style="margin:0;font-weight:700">If this was not expected, ask a System Admin to check your account.</p>`);
    return { subject: 'The email of your RP Xperience Centre admin account was changed', text, html };
}

async function ready() {
    if (outbox()) return true;
    return emailService.emailReady();
}

async function send(to, mail, kind) {
    const file = outbox();
    if (file) {
        try {
            fs.appendFileSync(file, `${JSON.stringify({ kind, to, subject: mail.subject, text: mail.text, at: new Date().toISOString() })}\n`);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    return emailService.sendAdminMail({ to, ...mail });
}

module.exports = {
    ready,
    sendReset: (to, details) => send(to, resetMail(details), 'reset'),
    sendChanged: (to, details) => send(to, changedMail(details), 'changed'),
    sendEmailChanged: (to, details) => send(to, emailChangedMail(details), 'email-changed'),
    usingTestOutbox: () => !!outbox(),
    maskEmail,
    resetMail,
};
// <Jun Kai end>
