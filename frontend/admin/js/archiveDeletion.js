// Owner: Role 3, Jun Kai. Previous team: none marked.
// Part 22/30 of the admin page: archive deletion (system admin only) (load order in admin.html).
// ==================== 24. ARCHIVE DELETION FUNCTIONS (System Admin Only) ====================

// Show/hide deletion controls based on user role
function initializeDeletionControls() {
    const userRole = sessionStorage.getItem('userRole');
    const deletionControls = document.getElementById('archive-deletion-controls');
    
    // <Jun Kai/> hidden instead of a display style: the control is a button in the filter bar now
    const selectAll = document.getElementById('select-all-archive');
    if (selectAll) selectAll.hidden = userRole !== 'system_admin';
    if (userRole === 'system_admin' && deletionControls) {
        deletionControls.hidden = false;
        console.log('✅ Deletion controls enabled for system_admin');
    } else if (deletionControls) {
        deletionControls.hidden = true;
    }
}

// Toggle select all checkboxes in archive
function toggleSelectAllArchive(checkbox) {
    const checkboxes = document.querySelectorAll('.archive-select-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
    });
    updateArchiveSelectionCount();
}

// Update selected count and enable/disable delete button
function updateArchiveSelectionCount() {
    const checkboxes = document.querySelectorAll('.archive-select-checkbox:checked');
    const count = checkboxes.length;
    
    const countDisplay = document.getElementById('selected-count');
    const deleteBtn = document.getElementById('delete-selected-btn');
    
    if (countDisplay) {
        countDisplay.textContent = `${count} selected`;
    }
    
    if (deleteBtn) {
        deleteBtn.disabled = count === 0;
    }
    // <Jun Kai/> the bar with Delete selected shows once a row is ticked
    const bar = document.getElementById('archive-selection-bar');
    if (bar) bar.hidden = count === 0;
    
    // Update select-all checkbox state
    const selectAllCheckbox = document.getElementById('select-all-archive');
    const allCheckboxes = document.querySelectorAll('.archive-select-checkbox');
    
    if (selectAllCheckbox && allCheckboxes.length > 0) {
        selectAllCheckbox.checked = checkboxes.length === allCheckboxes.length;
        selectAllCheckbox.indeterminate = checkboxes.length > 0 && checkboxes.length < allCheckboxes.length;
    }
}

// Set quick date for bulk deletion
function setQuickDeleteDate(value) {
    const dateInput = document.getElementById('bulk-delete-date');
    if (!dateInput || !value) return;
    
    const now = new Date();
    let targetDate = new Date();
    
    switch (value) {
        case '3months':
            targetDate.setMonth(now.getMonth() - 3);
            break;
        case '6months':
            targetDate.setMonth(now.getMonth() - 6);
            break;
        case '1year':
            targetDate.setFullYear(now.getFullYear() - 1);
            break;
        case '2years':
            targetDate.setFullYear(now.getFullYear() - 2);
            break;
        case '3years':
            targetDate.setFullYear(now.getFullYear() - 3);
            break;
        default:
            return;
    }
    
    // Format date as YYYY-MM-DD
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
    
    // Automatically preview
    previewBulkDelete();
}

// Preview bulk deletion count
async function previewBulkDelete() {
    const dateInput = document.getElementById('bulk-delete-date');
    const previewDiv = document.getElementById('preview-count');
    const previewNumber = document.getElementById('preview-number');
    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    
    if (!dateInput || !dateInput.value) {
        showNotification('Please select a date first', 'error'); // <Jun Kai/> a kit message instead of a browser box
        return;
    }
    
    try {
        const response = await fetch('/api/admin/archive/preview-deletion', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-username': sessionStorage.getItem('loggedUser')
            },
            body: JSON.stringify({
                dateRange: {
                    before: dateInput.value
                }
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (previewNumber) previewNumber.textContent = data.count;
            if (previewDiv) previewDiv.hidden = false; // <Jun Kai/> shown and hidden by the hidden attribute (redesigned panel)
            if (bulkDeleteBtn) bulkDeleteBtn.disabled = data.count === 0;
            
            console.log(`📊 Preview: ${data.count} records will be deleted${data.vipKept ? `, ${data.vipKept} VIP leaf/leaves kept` : ''}`); // <Jun Kai/> VIP leaves are not counted
        } else {
            throw new Error(data.error || 'Failed to preview deletion');
        }
    } catch (error) {
        console.error('❌ Error previewing deletion:', error);
        showNotification('Could not count the records: ' + error.message, 'error'); // <Jun Kai/>
    }
}

// Delete selected archived feedback
async function deleteSelectedArchive() {
    const checkboxes = document.querySelectorAll('.archive-select-checkbox:checked');
    const feedbackIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (feedbackIds.length === 0) {
        showNotification('Please select at least one record to delete', 'error'); // <Jun Kai/>
        return;
    }
    
    // Show confirmation modal
    const modal = showDeletionConfirmationModal(feedbackIds.length, 'selected');
    
    // <Jun Kai/> a refusal (a wrong password) is thrown, so the window shows it and stays open for another try
    modal.onconfirm = async (password) => {
        const response = await fetch('/api/admin/archive/delete-selected', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-username': sessionStorage.getItem('loggedUser')
            },
            body: JSON.stringify({
                feedbackIds: feedbackIds,
                password: password
            })
        });

        const data = await response.json().catch(() => ({})); // <Jun Kai/>

        if (!data.success) {
            console.error('❌ Error deleting selected:', data.error);
            throw new Error(data.error || `The records were not deleted (server answer ${response.status})`); // <Jun Kai/>
        }
        // <Jun Kai start> the server's sentence when a VIP leaf was kept
        archiveView.say(`Deleted ${data.deletedCount} record(s)${data.vipNote ? `. ${data.vipNote}` : ''}.`); // <Jun Kai/> a status line, not an alert box
        // <Jun Kai end>

        // Uncheck select-all
        const selectAllCheckbox = document.getElementById('select-all-archive');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;

        // Reload archive data
        await loadArchiveData();
    };
}

// Bulk delete by date
async function bulkDeleteByDate() {
    const dateInput = document.getElementById('bulk-delete-date');
    const previewNumber = document.getElementById('preview-number');
    
    if (!dateInput || !dateInput.value) {
        showNotification('Please select a date first', 'error'); // <Jun Kai/>
        return;
    }
    
    const count = previewNumber ? parseInt(previewNumber.textContent) : 0;
    
    if (count === 0) {
        showNotification('No records found before the selected date', 'error'); // <Jun Kai/>
        return;
    }
    
    // Show confirmation modal
    const modal = showDeletionConfirmationModal(count, 'date', dateInput.value);
    
    // <Jun Kai/> a refusal (a wrong password) is thrown, so the window shows it and stays open for another try
    modal.onconfirm = async (password) => {
        const response = await fetch('/api/admin/archive/delete-by-date', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-username': sessionStorage.getItem('loggedUser')
            },
            body: JSON.stringify({
                beforeDate: dateInput.value,
                password: password
            })
        });

        const data = await response.json().catch(() => ({})); // <Jun Kai/>

        if (!data.success) {
            console.error('❌ Error bulk deleting:', data.error);
            throw new Error(data.error || `The records were not deleted (server answer ${response.status})`); // <Jun Kai/>
        }
        // <Jun Kai start> with the server's sentence when a VIP leaf was kept
        archiveView.say(`Deleted ${data.deletedCount} record(s) and ${data.photosDeleted} photo(s)${data.vipNote ? `. ${data.vipNote}` : ''}.`); // <Jun Kai/>
        closeArchiveDeletePanel(false); // <Jun Kai/> the window gives the focus back itself
        // <Jun Kai end>

        // Reset inputs
        dateInput.value = '';
        const quickSelect = document.getElementById('bulk-delete-quick');
        if (quickSelect) quickSelect.value = '';

        // Hide preview
        const previewDiv = document.getElementById('preview-count');
        if (previewDiv) previewDiv.hidden = true; // <Jun Kai/>

        // Disable delete button
        const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
        if (bulkDeleteBtn) bulkDeleteBtn.disabled = true;

        // Reload archive data
        await loadArchiveData();
    };
}

// <Jun Kai start> The permanent deletion window in the kit look (a native dialog, 26 Nov 2026: every pop-up of the admin
// page in the kit look). The same two safety steps as before: the backup tick and the password. A problem shows inside the
// window (a toast would sit under it), and a refusal from the server, such as a wrong password, leaves the window open
// for another try. While the deletion runs, Cancel, Escape and a second click do nothing. It returns { onconfirm } as
// before: the caller sets onconfirm to an async function that throws when the records were not deleted.
function showDeletionConfirmationModal(count, type, date = null) {
    document.getElementById('archive-delete-dialog')?.remove();
    const plural = count !== 1;
    const when = type === 'date' ? new Date(date).toLocaleDateString() : '';
    const dialog = document.createElement('dialog');
    dialog.className = 'va-dialog archive-delete-dialog';
    dialog.id = 'archive-delete-dialog';
    dialog.setAttribute('aria-labelledby', 'archive-delete-dialog-title');
    dialog.setAttribute('aria-describedby', 'archive-delete-dialog-sub');
    dialog.innerHTML = `<form class="va-dialog-inner" novalidate>
        <div class="va-dialog-head">
            <div>
                <h3 id="archive-delete-dialog-title"></h3>
                <div class="va-dialog-sub" id="archive-delete-dialog-sub">This cannot be undone. Export a backup first if the data may be needed again.</div>
            </div>
            <button type="button" class="ui-btn ui-btn-icon va-dialog-close" data-close aria-label="Close" title="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        <div class="va-dialog-body">
            <div class="ui-note ui-note-warn archive-delete-note">
                <p>These are deleted for good:</p>
                <ul>
                    <li><strong>${count}</strong> archived feedback ${plural ? 'entries' : 'entry'}${type === 'date' ? `, everything archived before ${when}` : ''}</li>
                    <li>Their answers and other data</li>
                    <li>Their photos on this PC</li>
                    <li>Visitor records that no other feedback uses</li>
                </ul>
            </div>
            <label class="ui-check archive-delete-backup"><input type="checkbox" id="backup-confirm"><span>I have exported a backup of this data</span></label>
            <input type="text" class="va-username" autocomplete="username" tabindex="-1" aria-hidden="true" hidden>
            <div class="ui-field va-password-field">
                <label class="ui-label" for="delete-password">Your password</label>
                <input class="ui-input" type="password" id="delete-password" autocomplete="current-password">
            </div>
            <div class="va-form-error" id="archive-delete-error" role="alert" hidden></div>
        </div>
        <div class="va-dialog-foot">
            <button type="button" class="ui-btn ui-btn-secondary" data-close>Cancel</button>
            <button type="submit" class="ui-btn ui-btn-danger" id="confirm-delete-btn">Delete permanently</button>
        </div>
    </form>`;
    dialog.querySelector('h3').textContent = type === 'date'
        ? `Delete ${count} record${plural ? 's' : ''} archived before ${when}?`
        : `Delete ${count} selected record${plural ? 's' : ''}?`;

    const form = dialog.querySelector('form');
    const passwordInput = dialog.querySelector('#delete-password');
    const backupCheckbox = dialog.querySelector('#backup-confirm');
    const confirmBtn = dialog.querySelector('#confirm-delete-btn');
    const errorBox = dialog.querySelector('#archive-delete-error');
    const opener = document.activeElement;
    const callbackObj = { onconfirm: null };
    let busy = false;

    const showProblem = (text, field) => {
        errorBox.textContent = text;
        errorBox.hidden = false;
        if (field) field.focus();
    };
    const closeWindow = () => {
        if (busy || !dialog.open) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { dialog.close(); return; }
        if (dialog.classList.contains('is-closing')) return;
        dialog.classList.add('is-closing');
        setTimeout(() => dialog.close(), 150);
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (busy) return;
        errorBox.hidden = true;
        if (!backupCheckbox.checked) return showProblem('Tick the box to confirm that you have exported a backup.', backupCheckbox);
        const password = passwordInput.value;
        if (!password) return showProblem('Type your password to confirm.', passwordInput);
        busy = true;
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deleting...';
        try {
            if (callbackObj.onconfirm) await callbackObj.onconfirm(password);
            busy = false;
            closeWindow();
        } catch (error) {
            busy = false;
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Delete permanently';
            passwordInput.select();
            showProblem(error.message || 'The records were not deleted.', passwordInput);
        }
    });
    dialog.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closeWindow));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeWindow(); });
    dialog.addEventListener('close', () => {
        dialog.remove();
        // the button that opened the window may be gone with the Delete by date panel: then the Delete by date button
        const back = opener && document.contains(opener) && opener.getClientRects().length ? opener : document.querySelector('#archive-deletion-controls button');
        if (back && typeof back.focus === 'function') back.focus({ preventScroll: true });
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    backupCheckbox.focus();
    return callbackObj;
}
// <Jun Kai end>

// Initialize deletion controls when archive page loads
function refreshArchiveData() {
    console.log('🔄 Refreshing archive data...');
    loadArchiveData();
}

