// Owner: Role 3, Jun Kai. Previous team: none marked.
// Part 8/30 of the admin page: email decrypt / re-encrypt buttons (load order in admin.html).
// ==================== 8. ENCRYPTION MANAGEMENT (PAGE-SPECIFIC) ====================

// Update feedback encryption buttons
function updateEncryptionButtons() {
    const decryptBtn = document.getElementById('decrypt-emails-btn');
    const reEncryptBtn = document.getElementById('re-encrypt-btn');
    const userRole = sessionStorage.getItem('userRole');
    
    if (userRole !== 'system_admin') {
        if (decryptBtn) decryptBtn.style.display = 'none';
        if (reEncryptBtn) reEncryptBtn.style.display = 'none';
        return;
    }
    
    // Decrypt button
    if (encryptedFeedbackIds.length > 0 && !isAnyEmailDecrypted) {
        if (decryptBtn) {
            // <Jun Kai start> UI kit button with an icon (admin redesign)
            decryptBtn.style.display = 'inline-flex';
            decryptBtn.innerHTML = `${uiIcon('unlock', 15)}Decrypt emails (${encryptedFeedbackIds.length})`;
            // <Jun Kai end>
        }
    } else {
        if (decryptBtn) decryptBtn.style.display = 'none';
    }
    
    // Re-encrypt button
    if (isAnyEmailDecrypted) {
        if (reEncryptBtn) {
            // <Jun Kai start> UI kit button with an icon (admin redesign)
            reEncryptBtn.style.display = 'inline-flex';
            const count = Object.keys(decryptedEmailMap).length;
            reEncryptBtn.innerHTML = `${uiIcon('lock', 15)}Lock emails again (${count})`;
            // <Jun Kai end>
        }
    } else {
        if (reEncryptBtn) reEncryptBtn.style.display = 'none';
    }
}

// Update archive encryption buttons
function updateArchiveEncryptionButtons() {
    const decryptBtn = document.getElementById('decrypt-archive-emails-btn');
    const reEncryptBtn = document.getElementById('re-encrypt-archive-btn');
    const userRole = sessionStorage.getItem('userRole');
    
    if (userRole !== 'system_admin') {
        if (decryptBtn) decryptBtn.style.display = 'none';
        if (reEncryptBtn) reEncryptBtn.style.display = 'none';
        return;
    }
    
    // Decrypt button
    if (encryptedArchiveIds.length > 0 && !isAnyArchiveEmailDecrypted) {
        if (decryptBtn) {
            decryptBtn.style.display = 'inline-flex'; // <Jun Kai/> UI kit button with an icon
            decryptBtn.innerHTML = `${uiIcon('unlock', 15)}Decrypt emails (${encryptedArchiveIds.length})`;
        }
    } else {
        if (decryptBtn) decryptBtn.style.display = 'none';
    }
    
    // Re-encrypt button
    if (isAnyArchiveEmailDecrypted) {
        if (reEncryptBtn) {
            reEncryptBtn.style.display = 'inline-flex'; // <Jun Kai/> UI kit button with an icon
            const count = Object.keys(decryptedArchiveEmailMap).length;
            reEncryptBtn.innerHTML = `${uiIcon('lock', 15)}Lock emails again (${count})`;
        }
    } else {
        if (reEncryptBtn) reEncryptBtn.style.display = 'none';
    }
}

// <Jun Kai start> Decrypting the emails of one page, for Feedback and Archived Feedback (kit dialogs, 26 Nov 2026).
// The password window checks the first email while it stays open, so a wrong password shows under the field for
// another try; the other emails follow after it closed. Messages are notifications instead of browser boxes.
async function requestDecryptedEmail(feedbackId, password) {
    const username = sessionStorage.getItem('loggedUser');
    const response = await fetch('/api/admin/decrypt-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-username': username },
        body: JSON.stringify({ feedbackId, password, username })
    });
    return response.json().catch(() => ({ success: false }));
}

// ids: the encrypted ids on the page; store(id, email): puts a clear email in the page's current list (a filter
// change during the loop starts a new list). Resolves with how many were decrypted (0 when cancelled or nothing
// worked). Cancel and Escape wait while the first email is being checked (uiPrompt), so its answer always counts.
async function decryptEmailsOnPage(ids, store) {
    if (sessionStorage.getItem('userRole') !== 'system_admin') {
        showNotification('Only a System Admin can decrypt emails.', 'error');
        return 0;
    }
    const list = [...ids];
    if (list.length === 0) {
        showNotification('There are no encrypted emails on this page.', 'info');
        return 0;
    }
    let first = null;
    const password = await showPasswordPrompt(`Decrypt ${list.length} email${list.length === 1 ? '' : 's'} on this page?\n\nThis can take a few seconds or minutes.`, {
        label: 'System Admin password',
        confirmText: 'Decrypt',
        check: async (value) => {
            if (first) return null; // a second Enter while the window closes asks nothing again
            const data = await requestDecryptedEmail(list[0], value);
            if (!data.success) return data.error || 'That password is not right. Try again.';
            first = data;
            return null;
        }
    });
    if (!password || !first) return 0;
    store(list[0], first.decryptedEmail);
    let decrypted = 1;
    try {
        for (const feedbackId of list.slice(1)) {
            const data = await requestDecryptedEmail(feedbackId, password);
            if (data.success) {
                store(feedbackId, data.decryptedEmail);
                decrypted++;
            } else {
                console.warn(`⚠️ Failed to decrypt email for feedback ID: ${feedbackId}`);
            }
        }
    } catch (error) {
        console.error('❌ Decryption error:', error);
        showNotification(`The connection stopped after ${decrypted} of ${list.length} emails. Try again for the rest.`, 'error');
        return decrypted;
    }
    if (decrypted < list.length) {
        showNotification(`${decrypted} of ${list.length} emails were decrypted. Some could not be decrypted.`, 'error');
    } else {
        showNotification(`${decrypted} email${decrypted === 1 ? '' : 's'} decrypted.`, 'success');
    }
    return decrypted;
}

//Decrypt all emails on current feedback page (MAX 25)
async function decryptAllEmails() {
    if (await decryptEmailsOnPage(encryptedFeedbackIds, (id, email) => { decryptedEmailMap[id] = email; })) {
        isAnyEmailDecrypted = true;
        renderFeedbackPage();
    }
}

//Decrypt all emails on current archive page (MAX 25)
async function decryptAllArchiveEmails() {
    if (await decryptEmailsOnPage(encryptedArchiveIds, (id, email) => { decryptedArchiveEmailMap[id] = email; })) {
        isAnyArchiveEmailDecrypted = true;
        renderArchivePage();
    }
}
// <Jun Kai end>

//Re-encrypt feedback emails
function reEncryptAllEmails() {
    decryptedEmailMap = {};
    isAnyEmailDecrypted = false;
    renderFeedbackPage();
    console.log('🔒 All feedback emails re-encrypted');
}

//Re-encrypt archive emails
function reEncryptAllArchiveEmails() {
    decryptedArchiveEmailMap = {};
    isAnyArchiveEmailDecrypted = false;
    renderArchivePage();
    console.log('🔒 All archive emails re-encrypted');
}

