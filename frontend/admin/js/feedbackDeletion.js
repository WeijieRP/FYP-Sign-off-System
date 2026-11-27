// Owner: Role 3, Jun Kai. Previous team: none marked.
// Part 17/30 of the admin page: feedback deletion (load order in admin.html).
// ==================== 16. FEEDBACK DELETION ====================

let currentDeleteSource = 'feedback';

// Delete feedback with password verification
async function deleteFeedback(feedbackId) {
    currentDeleteFeedbackId = feedbackId;
    currentDeleteSource = 'feedback';
    showDeletePasswordModal();
}

// Delete archived feedback (same modal, refreshes the archive table afterwards)
async function deleteArchiveFeedback(feedbackId) {
    currentDeleteFeedbackId = feedbackId;
    currentDeleteSource = 'archive';
    showDeletePasswordModal();
}

// <Jun Kai start> The delete check in the kit look (26 Nov 2026): one password field in a kit dialog. The password is
// checked and the feedback deleted while the window stays open, so a wrong password or a failed delete shows under
// the field for another try. The list moves on only after the window has closed, and it follows what the delete
// itself did (Cancel and Escape also wait for a running check in uiPrompt, so nothing is lost either way).
function showDeletePasswordModal() {
    const feedbackId = currentDeleteFeedbackId;
    const source = currentDeleteSource;
    let deleted = false;
    let running = Promise.resolve();
    const ask = showPasswordPrompt(`Delete feedback ${feedbackId}?\n\nIt is removed for good and cannot be undone. Enter your password to confirm.`, {
        label: 'Your password',
        confirmText: 'Delete feedback',
        danger: true,
        rootClass: 'delete-access-modal',
        check: (password) => {
            if (deleted) return null; // a second Enter while the window closes deletes nothing again
            running = verifyDeleteAccess(password, feedbackId).then((problem) => {
                if (!problem) deleted = true;
                return problem;
            });
            return running;
        }
    });
    const dialog = document.querySelector('dialog.delete-access-modal[open]');
    ask.then(() => dialogClosed(dialog)).then(() => running.catch(() => null)).then(() => {
        if (currentDeleteFeedbackId === feedbackId) currentDeleteFeedbackId = null;
        if (!deleted) return;
        if (source === 'archive') archiveDeleted(feedbackId); else feedbackDeleted(feedbackId);
    });
}

// Verify the password, then delete: resolves with nothing when the feedback is gone, or with the reason it is not
async function verifyDeleteAccess(password, feedbackId = currentDeleteFeedbackId) {
    if (!sessionStorage.getItem('loggedUser')) return 'Your session has ended. Sign in again.';
    const response = await fetch('/api/admin/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    const data = await response.json().catch(() => ({}));
    if (!data.success) return data.error || 'That password is not right. Try again.';
    return performFeedbackDeletion(feedbackId);
}

// Perform the actual feedback deletion: nothing when it worked, else the reason
async function performFeedbackDeletion(feedbackId) {
    console.log('🗑️ Deleting feedback ID:', feedbackId);
    try {
        const response = await fetch(`/api/admin/feedback/${feedbackId}`, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) return `The feedback could not be deleted: ${data.error || 'unknown error'}.`;
        return null;
    } catch (error) {
        console.error('Error deleting feedback:', error);
        return `The feedback could not be deleted: ${error.message}.`;
    }
}

// Close delete modal (its own Cancel button, so the kit dialog closes the usual way)
function closeDeleteModal() {
    const modal = document.querySelector('dialog.delete-access-modal[open]');
    if (modal) modal.querySelector('[data-ui-cancel]').click();
    currentDeleteFeedbackId = null;
}
// <Jun Kai end>
