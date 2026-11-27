// Owner: Role 3, Jun Kai. Previous team: none marked.
// Part 12/30 of the admin page: decrypted email popup (load order in admin.html).
// ==================== 11. EMAIL MANAGEMENT ====================

// <Jun Kai start> The password window and the email window in the kit look (kit dialogs of uiKit.js, 26 Nov 2026).
// showPasswordPrompt(message) still resolves with the typed password, or null when it is cancelled (lostFound.js,
// submissionList.js and encryption.js call it). The first paragraph of the message is the title, the rest the text.
// Options: check(password) runs while the window stays open (an error text keeps it open for another try, nothing
// closes it), and title, label, confirmText, danger and rootClass. The window keeps the old class
// password-prompt-modal, so the Feedback and Archived Feedback pages leave their side panel open on Escape.
function showPasswordPrompt(message, options = {}) {
    const text = String(message || '');
    const cut = text.indexOf('\n\n');
    const head = cut >= 0 ? text.slice(0, cut) : text;
    // the last "Enter your ... password:" line becomes the field's label, so it is not said twice
    const rest = (cut >= 0 ? text.slice(cut + 2) : '').replace(/\s*Enter your[^.\n]*password:?\s*$/i, '').trim();
    const admin = /System Admin/i.test(text);
    const ask = uiPrompt({
        title: options.title || head.replace(/^[^\p{L}\p{N}]+/u, '').trim(),
        message: options.title ? text : rest,
        label: options.label || (admin ? 'System Admin password' : 'Your password'),
        type: 'password',
        confirmText: options.confirmText || 'Continue',
        danger: !!options.danger,
        emptyText: 'Type your password first.',
        check: options.check
    });
    markNewestDialog(`password-prompt-modal ${options.rootClass || ''}`);
    return ask;
}

// the kit dialog that just opened is the last one in the page; the old class names on it let other pages see it
function markNewestDialog(classNames) {
    const open = document.querySelectorAll('body > dialog.ui-dialog[open]');
    const dialog = open[open.length - 1];
    if (dialog) dialog.classList.add(...String(classNames).split(' ').filter(Boolean));
    return dialog;
}

// waits until a dialog has closed and left the page, so a page can move the focus after it
function dialogClosed(dialog) {
    return new Promise((resolve) => {
        if (!dialog || !dialog.isConnected) return resolve();
        dialog.addEventListener('close', () => setTimeout(resolve, 0), { once: true });
    });
}

// Show the decrypted email of one feedback (plain text only)
function showEmailPopup(feedbackId, decryptedEmail) {
    const who = sessionStorage.getItem('loggedUser') || 'you';
    uiAlert({
        title: 'Decrypted email',
        message: `Feedback ${feedbackId}\n\n${decryptedEmail}\n\nShown to ${who} at ${new Date().toLocaleTimeString()}`,
        confirmText: 'Close'
    });
    markNewestDialog('email-popup');
}
// <Jun Kai end>

// Close email modal
function closeEmailModal() {
    const modal = document.querySelector('.email-access-modal');
    if (modal) {
        modal.remove();
    }
    currentEmailViewingId = null;
}

// Close email popup
function closeEmailPopup() {
    const popup = document.querySelector('dialog.email-popup[open]'); // <Jun Kai/> its own button closes the kit dialog
    if (popup) popup.querySelector('[data-ui-ok]').click();
}
