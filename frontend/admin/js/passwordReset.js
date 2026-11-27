// Owner: Role 3, Jun Kai.
// Part of the admin page: a forgotten password (the login card). Load order in admin.html: before init.js.
// <Jun Kai start>
// Three steps in the same glass card as the sign-in:
//   ask       the username or the email of the account; the server sends a 6 digit code and a link to its email
//   code      the code from the email (checked by the server, 5 tries)
//   password  the new password twice; saved, the code and the link stop working, the sign-in comes back
// The link in the email opens the admin page with "#reset=<token>": init.js hands the token here before anything else,
// the token leaves the address bar at once, and the card goes straight to the password step.
const PASSWORD_RESET_RESEND_SECONDS = 60;
const passwordReset = { step: 'ask', identifier: '', code: '', token: '', username: '', busy: false, timer: null, wait: 0, fromLink: false };

function passwordResetEl(id) {
    return document.getElementById(id);
}

// the note at the top of the card (information) or under the fields (a problem), like the sign-in note
function passwordResetSay(text, kind) {
    const note = passwordResetEl('reset-note');
    if (!note) return;
    note.textContent = text || '';
    note.hidden = !text;
    note.classList.toggle('login-note-error', kind === 'error');
    note.setAttribute('role', kind === 'error' ? 'alert' : 'status');
}

function showPasswordResetStep(step, lead) {
    passwordReset.step = step;
    document.querySelectorAll('#reset-form [data-reset-step]').forEach((part) => { part.hidden = part.dataset.resetStep !== step; });
    const titles = { ask: 'Reset your password', code: 'Check your email', password: 'Choose a new password' };
    passwordResetEl('reset-title').textContent = titles[step];
    if (lead) passwordResetEl('reset-lead').textContent = lead;
    const first = { ask: 'reset-identifier', code: 'reset-code', password: 'reset-password' }[step];
    setTimeout(() => passwordResetEl(first)?.focus(), 0);
}

function passwordResetBusy(on) {
    passwordReset.busy = on;
    passwordResetEl('reset-form')?.setAttribute('aria-busy', on ? 'true' : 'false');
    for (const id of ['reset-send', 'reset-check', 'reset-save']) {
        const button = passwordResetEl(id);
        if (button) button.disabled = on;
    }
}

// url is one of the four full addresses below, written out so the contract check can match them to the routes
async function passwordResetPost(url, body) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok && data.success, status: response.status, data };
    } catch (error) {
        return { ok: false, status: 0, data: { error: 'The server could not be reached. Check the connection and try again.' } };
    }
}

// the card swaps with the sign-in card; the username typed there is taken along
function openPasswordReset() {
    const login = passwordResetEl('login-form');
    const card = passwordResetEl('reset-form');
    if (!login || !card) return;
    clearInterval(passwordReset.timer);
    Object.assign(passwordReset, { identifier: '', code: '', token: '', username: '', wait: 0 });
    for (const id of ['reset-code', 'reset-password', 'reset-confirm']) { const input = passwordResetEl(id); if (input) input.value = ''; }
    passwordResetEl('reset-identifier').value = (passwordResetEl('username')?.value || '').trim();
    login.hidden = true;
    card.hidden = false;
    passwordResetSay('');
    showPasswordResetStep('ask', 'Enter your username or the email of your account. A 6 digit code and a link are sent to that email.');
}

// back to the sign-in card; after a reset the username is filled in and a note says what happened
function closePasswordReset(message, username) {
    clearInterval(passwordReset.timer);
    // Back after a link: a fresh load of the admin page shows the dashboard again when this browser is still signed in
    const fromLink = passwordReset.fromLink;
    passwordReset.fromLink = false;
    if (fromLink && !message) { location.replace(location.pathname + location.search); return; }
    Object.assign(passwordReset, { code: '', token: '' });
    for (const id of ['reset-code', 'reset-password', 'reset-confirm']) { const input = passwordResetEl(id); if (input) input.value = ''; }
    passwordResetEl('reset-form').hidden = true;
    passwordResetEl('login-form').hidden = false;
    const password = passwordResetEl('password');
    if (password) password.value = '';
    if (username && passwordResetEl('username')) passwordResetEl('username').value = username;
    if (message && typeof showLoginNote === 'function') showLoginNote(message);
    setTimeout(() => (username ? password : passwordResetEl('username'))?.focus(), 0);
}

function startPasswordResetCountdown() {
    const button = passwordResetEl('reset-resend');
    clearInterval(passwordReset.timer);
    passwordReset.wait = PASSWORD_RESET_RESEND_SECONDS;
    const tick = () => {
        if (!button) return;
        button.disabled = passwordReset.wait > 0;
        button.textContent = passwordReset.wait > 0 ? `Send a new code (${passwordReset.wait} s)` : 'Send a new code';
        if (passwordReset.wait <= 0) clearInterval(passwordReset.timer);
        passwordReset.wait -= 1;
    };
    tick();
    passwordReset.timer = setInterval(tick, 1000);
}

async function askForPasswordResetCode(identifier, again) {
    passwordResetBusy(true);
    const answer = await passwordResetPost('/api/admin/password-reset/request', { identifier });
    passwordResetBusy(false);
    if (!answer.ok) {
        passwordResetSay(answer.data.error || 'The code could not be sent. Try again in a moment.', 'error');
        return false;
    }
    passwordReset.identifier = identifier;
    passwordResetEl('reset-code').value = '';
    showPasswordResetStep('code', answer.data.message);
    passwordResetSay(again ? 'A new code is on its way. The code and link sent before no longer work.' : '');
    startPasswordResetCountdown();
    return true;
}

function resendPasswordResetCode() {
    if (passwordReset.busy || passwordReset.wait > 0 || !passwordReset.identifier) return;
    askForPasswordResetCode(passwordReset.identifier, true);
}

async function submitPasswordReset(event) {
    event.preventDefault();
    if (passwordReset.busy) return;
    if (passwordReset.step === 'ask') {
        const identifier = passwordResetEl('reset-identifier').value.trim();
        if (!identifier) return passwordResetSay('Enter your username or the email of your account.', 'error');
        return askForPasswordResetCode(identifier, false);
    }
    if (passwordReset.step === 'code') {
        const code = passwordResetEl('reset-code').value.replace(/[\s-]/g, '');
        if (!/^\d{6}$/.test(code)) return passwordResetSay('Enter the 6 digit code from the email.', 'error');
        passwordResetBusy(true);
        const answer = await passwordResetPost('/api/admin/password-reset/verify-code', { identifier: passwordReset.identifier, code });
        passwordResetBusy(false);
        if (!answer.ok) return passwordResetSay(answer.data.error || 'The code could not be checked. Try again.', 'error');
        passwordReset.code = code;
        passwordReset.username = answer.data.username || '';
        passwordResetSay('');
        return showPasswordResetStep('password', `Choose a new password for ${passwordReset.username}. It replaces the old one at once.`);
    }
    // the new password
    const password = passwordResetEl('reset-password').value;
    const confirm = passwordResetEl('reset-confirm').value;
    if (password.length < 8) return passwordResetSay('The password needs at least 8 characters.', 'error');
    if (new TextEncoder().encode(password).length > 72) return passwordResetSay('The password can have at most 72 characters.', 'error');
    if (passwordReset.username && password.toLowerCase() === passwordReset.username.toLowerCase()) return passwordResetSay('The password cannot be the same as the username.', 'error');
    if (password !== confirm) return passwordResetSay('The two passwords are not the same.', 'error');
    passwordResetBusy(true);
    const body = passwordReset.token
        ? { token: passwordReset.token, password, confirm }
        : { identifier: passwordReset.identifier, code: passwordReset.code, password, confirm };
    const answer = await passwordResetPost('/api/admin/password-reset/complete', body);
    passwordResetBusy(false);
    if (!answer.ok) {
        const text = answer.data.error || 'The new password could not be saved. Try again.';
        // a code or link that is used up or expired: start again from the username
        if (/expired|already used|Ask for a new code/i.test(text)) {
            Object.assign(passwordReset, { code: '', token: '' });
            showPasswordResetStep('ask', 'Enter your username or the email of your account. A 6 digit code and a link are sent to that email.');
        }
        return passwordResetSay(text, 'error');
    }
    closePasswordReset('Your password was changed and every other sign-in of the account has ended. Sign in with the new password.', answer.data.username);
}

function togglePasswordResetShow() {
    const show = passwordResetEl('reset-show')?.checked;
    for (const id of ['reset-password', 'reset-confirm']) { const input = passwordResetEl(id); if (input) input.type = show ? 'text' : 'password'; }
}

// "#reset=<token>" from the email: taken out of the address bar at once (it must not stay in the history or a
// bookmark), then null when there is none
function takePasswordResetToken() {
    const match = /^#reset=([A-Za-z0-9_-]{20,100})$/.exec(location.hash || '');
    if (!/^#reset=/.test(location.hash || '')) return null;
    history.replaceState(null, '', location.pathname + location.search);
    return match ? match[1] : '';
}

async function startPasswordResetFromLink(token) {
    // the reset card is on the login page: shown also in a tab where the dashboard was open
    const loginPage = passwordResetEl('login-page');
    const dashboard = passwordResetEl('admin-dashboard');
    if (loginPage) loginPage.style.display = '';
    if (dashboard) dashboard.style.display = 'none';
    openPasswordReset();
    passwordReset.fromLink = true;
    if (!token) return passwordResetSay('This link is not complete. Ask for a new code.', 'error');
    passwordResetBusy(true);
    const answer = await passwordResetPost('/api/admin/password-reset/check-link', { token });
    passwordResetBusy(false);
    if (!answer.ok) return passwordResetSay(answer.data.error || 'This link has expired or was already used. Ask for a new code.', 'error');
    passwordReset.token = token;
    passwordReset.username = answer.data.username || '';
    showPasswordResetStep('password', `Choose a new password for ${passwordReset.username}. It replaces the old one at once.`);
}

document.addEventListener('DOMContentLoaded', () => {
    passwordResetEl('reset-form')?.addEventListener('submit', submitPasswordReset);
});
// the link opened in a tab that already shows the admin page only changes the part after "#": no new page load
window.addEventListener('hashchange', () => {
    const token = takePasswordResetToken();
    if (token !== null) startPasswordResetFromLink(token);
});
// <Jun Kai end>
