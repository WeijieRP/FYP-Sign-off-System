// Owner: shared. Previous team: none marked.
// Part 14/30 of the admin page: admin user management (load order in admin.html).
// ==================== 13. USER MANAGEMENT (UPDATED WITH SOFT DELETE 2026-01-09) ====================

// Track current user management tab
let currentUserTab = 'active'; // 'active' or 'deleted'
// <Jun Kai/> the number of the newest load of each list: an older answer that arrives after a newer one is not drawn
const usersLoadSeq = { active: 0, deleted: 0 };

// Switch between active and deleted users tabs
function switchUserTab(tab) {
    currentUserTab = tab;

    // <Jun Kai start> the redesigned tabs: each knows its tab by data-tab (the old code read the global "event")
    document.querySelectorAll('#users-page [role="tab"]').forEach((button) => {
        const on = button.dataset.tab === tab;
        button.setAttribute('aria-selected', String(on));
        button.tabIndex = on ? 0 : -1;
    });
    const activeSection = document.getElementById('active-users-section');
    const deletedSection = document.getElementById('deleted-users-section');
    if (activeSection) activeSection.hidden = tab !== 'active';
    if (deletedSection) deletedSection.hidden = tab === 'active';
    if (tab === 'active') loadActiveUsers();
    else loadDeletedUsers();
    // <Jun Kai end>
}

// Load user management data (wrapper function)
async function loadUserManagementData() {
    // <Jun Kai/> both lists, so both tab counts are right (the page shows the current tab)
    prepareUsersPage();
    await Promise.all([loadActiveUsers(), loadDeletedUsers()]);
}

// Load active users
async function loadActiveUsers() {
    try {
        console.log('👤 Loading active users...');
        const seq = ++usersLoadSeq.active; // <Jun Kai/> only the newest load of this list is drawn
        const response = await fetch('/api/admin/users');
        if (seq !== usersLoadSeq.active) return;

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Active users API response:', data);
        
        if (seq !== usersLoadSeq.active) return; // <Jun Kai/>
        if (data.success && data.users) {
            updateActiveUsersTable(data.users);
        } else {
            showUsersLoadError('active', data.error || 'the server answered without the list'); // <Jun Kai/>
        }
    } catch (error) {
        console.error('Error loading active users:', error);
        showUsersLoadError('active', error.message); // <Jun Kai/> in the table instead of an alert box
    }
}

// Load deleted users
async function loadDeletedUsers() {
    try {
        console.log('🗑️ Loading deleted users...');
        const seq = ++usersLoadSeq.deleted; // <Jun Kai/> only the newest load of this list is drawn
        const response = await fetch('/api/admin/users/deleted');
        if (seq !== usersLoadSeq.deleted) return;

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Deleted users API response:', data);
        
        if (seq !== usersLoadSeq.deleted) return; // <Jun Kai/>
        if (data.success && data.users) {
            updateDeletedUsersTable(data.users);
        } else {
            showUsersLoadError('deleted', data.error || 'the server answered without the list'); // <Jun Kai/>
        }
    } catch (error) {
        console.error('Error loading deleted users:', error);
        showUsersLoadError('deleted', error.message); // <Jun Kai/>
    }
}

// <Jun Kai start> Users A (admin redesign): the two tables. Every value is escaped, and the buttons carry the account in
// data attributes (read by prepareUsersPage), instead of inline onclick strings that a quote in a name would break.
// Who may do what is unchanged: a System Admin edits and deletes accounts, the root account "systemadmin" is edited only
// by itself and is never deleted, nobody deletes their own account.
function usersEmptyRow(text) {
    return `<tr><td colspan="5" class="ui-empty">${text}</td></tr>`;
}

function usersSafe(user) {
    return {
        id: user.id || 0,
        username: user.username || 'Unknown',
        full_name: user.full_name || user.username || 'Unknown',
        role: user.role || 'IT_staff',
        department: user.department || 'IT',
        is_active: user.is_active !== undefined ? user.is_active : 1,
        deleted_at: user.deleted_at,
        deleted_by: user.deleted_by || 'Unknown',
        email: user.email || '' // <Jun Kai/>
    };
}

// data-* values for a button: the account the action is for
function usersButtonData(user) {
    return `data-id="${Number(user.id)}" data-username="${escapeHtml(user.username)}" data-role="${escapeHtml(user.role)}" data-full-name="${escapeHtml(user.full_name)}" data-email="${escapeHtml(user.email)}"`;
}

function usersNameCell(user) {
    const root = user.username === 'systemadmin' ? ' <span class="ui-tag is-green">Root</span>' : '';
    return `<b>${escapeHtml(user.username)}</b>${root}`;
}

// Update active users table
function updateActiveUsersTable(usersData) {
    const tbody = document.getElementById('active-users-tbody');
    if (!tbody) return;
    const list = Array.isArray(usersData) ? usersData : [];
    usersSetCount('active', list.length);
    if (!list.length) {
        tbody.innerHTML = usersEmptyRow('No active accounts. <button type="button" class="ui-link" onclick="loadActiveUsers()">Load again</button>');
        return;
    }
    const currentUser = sessionStorage.getItem('loggedUser');
    const isSystemAdmin = sessionStorage.getItem('userRole') === 'system_admin';
    usersShowEmailNote(list.map(usersSafe), currentUser); // <Jun Kai/>
    tbody.innerHTML = list.map((raw) => {
        const user = usersSafe(raw);
        const isCurrentUser = user.username === currentUser;
        const isRoot = user.username === 'systemadmin';
        const canEdit = isSystemAdmin && (!isRoot || isCurrentUser);
        const canDelete = isSystemAdmin && !isRoot && !isCurrentUser;
        const name = escapeHtml(user.username);
        let actions = '';
        if (canEdit && isRoot) actions += `<button type="button" class="ui-btn ui-btn-secondary users-btn" data-user-action="edit" ${usersButtonData(user)}>${uiIcon('lock', 14)}Edit my account</button>`;
        else if (canEdit) actions += `<button type="button" class="ui-btn ui-btn-icon" data-user-action="edit" ${usersButtonData(user)} aria-label="Edit ${name}" title="Edit">${uiIcon('edit', 16)}</button>`;
        if (canDelete) actions += `<button type="button" class="ui-btn ui-btn-icon ui-danger" data-user-action="delete" ${usersButtonData(user)} aria-label="Delete ${name}" title="Delete">${uiIcon('trash', 16)}</button>`;
        if (!actions) actions = `<span class="ui-muted">${isRoot ? 'Protected' : 'No actions'}</span>`;
        return `<tr>
            <td>${usersNameCell(user)}</td>
            <td>${escapeHtml(user.full_name)} ${user.email ? `<span class="users-sub">${escapeHtml(user.email)}</span>` : '<span class="users-sub users-no-email">No email yet</span>'}</td>
            <td class="users-role">${escapeHtml(formatRoleName(user.role))} <span class="users-sub">${escapeHtml(user.department)}</span></td>
            <td><span class="ui-tag is-${user.is_active ? 'green' : 'amber'}">${user.is_active ? 'Active' : 'Inactive'}</span></td>
            <td><span class="ui-actions">${actions}</span></td>
        </tr>`;
    }).join('');
}

// Update deleted users table
function updateDeletedUsersTable(usersData) {
    const tbody = document.getElementById('deleted-users-tbody');
    if (!tbody) return;
    const list = Array.isArray(usersData) ? usersData : [];
    usersSetCount('deleted', list.length);
    if (!list.length) {
        tbody.innerHTML = usersEmptyRow('No deleted accounts.');
        return;
    }
    const isSystemAdmin = sessionStorage.getItem('userRole') === 'system_admin';
    tbody.innerHTML = list.map((raw) => {
        const user = usersSafe(raw);
        const isRoot = user.username === 'systemadmin';
        const can = isSystemAdmin && !isRoot;
        const name = escapeHtml(user.username);
        const deletedDate = user.deleted_at ? new Date(user.deleted_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'an unknown date';
        const actions = can
            ? `<button type="button" class="ui-btn ui-btn-secondary users-btn" data-user-action="restore" ${usersButtonData(user)} aria-label="Restore ${name}">Restore</button><button type="button" class="ui-btn ui-btn-secondary users-btn ui-danger" data-user-action="purge" ${usersButtonData(user)} aria-label="Delete ${name} for good">Delete for good</button>`
            : '<span class="ui-muted">No actions</span>';
        return `<tr>
            <td>${usersNameCell(user)}</td>
            <td>${escapeHtml(user.full_name)} <span class="users-deleted-by">Deleted ${escapeHtml(deletedDate)} by ${escapeHtml(user.deleted_by)}</span></td>
            <td class="users-role">${escapeHtml(formatRoleName(user.role))} <span class="users-sub">${escapeHtml(user.department)}</span></td>
            <td><span class="ui-tag is-red">Deleted</span></td>
            <td><span class="ui-actions">${actions}</span></td>
        </tr>`;
    }).join('');
}

// <Jun Kai start> a quick look at an email address (the server checks again with the same rule)
function usersEmailLooksRight(email) {
    return email.length <= 254 && /^[^\s@<>"',;:()[\]\\]+@[^\s@<>"',;:()[\]\\]+\.[^\s@<>"',;:()[\]\\]{2,}$/.test(email);
}

// the note above the accounts: who cannot reset a forgotten password yet, the signed-in admin first
function usersShowEmailNote(users, currentUser) {
    const note = document.getElementById('users-email-note');
    if (!note) return;
    const missing = users.filter((user) => !user.email);
    const own = missing.find((user) => user.username === currentUser);
    if (!missing.length) { note.hidden = true; note.textContent = ''; return; }
    const others = missing.length - (own ? 1 : 0);
    const parts = [];
    if (own) parts.push(`Your account has no email yet: add one with ${own.username === 'systemadmin' ? 'Edit my account' : 'Edit'}, so you can reset a forgotten password.`);
    if (others) parts.push(`${others} other account${others === 1 ? ' has' : 's have'} no email and cannot reset a forgotten password until one is added.`);
    note.textContent = parts.join(' ');
    note.hidden = false;
}
// <Jun Kai end>

function usersSetCount(which, n) {
    const count = document.getElementById(`users-count-${which}`);
    if (count) count.textContent = String(n);
}

// a list that did not load says so in its table, with Try again
function showUsersLoadError(which, message) {
    const tbody = document.getElementById(`${which}-users-tbody`);
    const again = which === 'active' ? 'loadActiveUsers()' : 'loadDeletedUsers()';
    if (tbody) tbody.innerHTML = usersEmptyRow(`Could not load the accounts: ${escapeHtml(String(message || 'no answer').replace(/\.$/, ''))}. <button type="button" class="ui-link" onclick="${again}">Try again</button>`);
}

// once: the row buttons, and the arrow keys between the two tabs
let usersPageReady = false;
function prepareUsersPage() {
    if (usersPageReady) return;
    usersPageReady = true;
    document.querySelectorAll('#users-page [data-fb-icon]').forEach((slot) => { slot.innerHTML = uiIcon(slot.dataset.fbIcon, 15); });
    document.getElementById('users-page')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-user-action]');
        if (!button) return;
        const { id, username, role, fullName, email } = button.dataset;
        const action = button.dataset.userAction;
        if (action === 'edit') editUser(Number(id), username, role, fullName, email || '');
        if (action === 'delete') deleteUser(Number(id), username);
        if (action === 'restore') restoreUser(Number(id), username);
        if (action === 'purge') permanentDeleteUser(Number(id), username);
    });
    document.querySelector('#users-page [role="tablist"]')?.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const next = currentUserTab === 'active' ? 'deleted' : 'active';
        switchUserTab(next);
        document.querySelector(`#users-page [data-tab="${next}"]`)?.focus();
        event.preventDefault();
    });
}
// <Jun Kai end>

// Legacy function for backward compatibility
function updateUserManagementTable(usersData) {
    updateActiveUsersTable(usersData);
}

// Add new user
// <Jun Kai start> Add user and Edit user are kit dialogs. The role is picked from three cards that say what each role
// may open and do. The texts come from the real checks: the sidebar links marked data-admin-only, the routes behind
// auth.requireAdmin and the IT Staff check on deleting feedback. The page list of IT Admin is read from the sidebar, so it
// stays right when a page is added.
const USERS_ROLES = [
    { value: 'system_admin', name: 'System Admin', lead: () => 'Everything, including users and settings',
        points: () => ['Every page and every setting.', 'The only role that can add users, show visitors\' email addresses, export visitor data and delete archived records for good.'] },
    { value: 'IT_admin', name: 'IT Admin', lead: (pages) => `Daily work on ${pages.length} pages`,
        points: (pages) => [`Opens ${pages.join(', ')}.`, 'Can approve or reject pledges, acknowledge and resolve incidents, send a test incident and delete feedback.', 'Cannot change settings, apart from their own theme and the names of the tablets.'] },
    { value: 'IT_staff', name: 'IT Staff', lead: () => 'Same as IT Admin, without deleting',
        points: () => ['The same pages and work as IT Admin.', 'Cannot delete feedback.'] }
];

// the pages an IT Admin or IT Staff sees: the sidebar links that are not System Admin only (the tree demo opens a new tab)
function usersOpenPages() {
    return [...document.querySelectorAll('.sidebar .nav-item:not([data-admin-only]):not([target="_blank"]) .nav-label')]
        .map((label) => label.textContent.trim()).filter(Boolean);
}

function usersRoleCards(name, current) {
    const pages = usersOpenPages();
    return `<fieldset class="users-roles">
        <legend class="ui-label">Role</legend>
        ${USERS_ROLES.map((role) => `
        <label class="users-role">
            <input type="radio" name="${name}" value="${role.value}"${role.value === current ? ' checked' : ''}>
            <span class="users-role-text">
                <span class="users-role-name">${role.name}</span>
                <span class="users-role-lead">${role.lead(pages)}</span>
                <ul>${role.points(pages).map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>
            </span>
        </label>`).join('')}
    </fieldset>`;
}

// the role picked in a window: the ticked card, or the fixed role of the root account
function usersPickedRole(name) {
    const picked = document.querySelector(`input[name="${name}"]:checked`) || document.querySelector(`input[type="hidden"][name="${name}"]`);
    return picked ? picked.value : '';
}

function usersField(id, label, input, help) {
    return `<div class="ui-field">
        <label class="ui-label" for="${id}">${label}</label>
        ${input}
        ${help ? `<p class="ui-help" id="${id}-help">${help}</p>` : ''}
    </div>`;
}

const usersDialogOpeners = {};

// a native dialog: the browser keeps the focus inside and Escape closes it; it is removed again once closed
function usersOpenDialog(id, title, sub, body, submitLabel, onsubmit) {
    document.getElementById(id)?.remove();
    const dialog = document.createElement('dialog');
    dialog.className = 'va-dialog users-dialog';
    dialog.id = id;
    dialog.setAttribute('aria-labelledby', id + '-title');
    dialog.innerHTML = `<form class="va-dialog-inner" novalidate onsubmit="${onsubmit}">
        <div class="va-dialog-head">
            <div>
                <h3 id="${id}-title">${title}</h3>
                <div class="va-dialog-sub">${sub}</div>
            </div>
            <button type="button" class="ui-btn ui-btn-icon va-dialog-close" onclick="usersCloseDialog('${id}')" aria-label="Close" title="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        <div class="va-dialog-body">${body}</div>
        <div class="va-dialog-foot">
            <button type="button" class="ui-btn ui-btn-secondary" onclick="usersCloseDialog('${id}')">Cancel</button>
            <button type="submit" class="ui-btn ui-btn-primary">${submitLabel}</button>
        </div>
    </form>`;
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); usersCloseDialog(id); });
    dialog.addEventListener('close', () => {
        dialog.remove();
        const opener = usersDialogOpeners[id];
        delete usersDialogOpeners[id];
        if (opener && document.contains(opener)) opener.focus();
    });
    usersDialogOpeners[id] = document.activeElement;
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector('input:not([disabled]):not([type="hidden"])')?.focus();
}

function usersCloseDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog || !dialog.open) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { dialog.close(); return; }
    if (dialog.classList.contains('is-closing')) return;
    dialog.classList.add('is-closing');
    setTimeout(() => dialog.close(), 150);
}

function addUser() {
    if (sessionStorage.getItem('userRole') !== 'system_admin') {
        showNotification('Only a System Admin can add users.', 'error');
        return;
    }
    const body = `<div class="users-dialog-grid">
            ${usersField('add-full-name', 'Full name', '<input class="ui-input" type="text" id="add-full-name" autocomplete="off" maxlength="100" aria-describedby="add-full-name-help">', 'Shown in the admin page.')}
            ${usersField('add-username', 'Username', '<input class="ui-input" type="text" id="add-username" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="50" aria-describedby="add-username-help">', 'Lowercase letters, numbers and _ only.')}
            ${usersField('add-user-email', 'Email', '<input class="ui-input" type="email" id="add-user-email" autocomplete="off" maxlength="254" placeholder="name@example.com" aria-describedby="add-user-email-help">', 'Where a forgotten password is reset.')}
            ${usersField('add-user-password', 'Password', '<input class="ui-input" type="password" id="add-user-password" autocomplete="new-password" aria-describedby="add-user-password-help">', 'At least 8 characters.')}
        </div>
        ${usersRoleCards('add-user-role', 'IT_staff')}
        <p class="users-dialog-error" id="add-user-error" role="alert" style="display: none;"></p>`;
    usersOpenDialog('add-user-dialog', 'Add user', 'The new admin signs in with this username and password.', body, 'Add user', 'handleAddUser(event)');
}

// Handle add user form submission
async function handleAddUser(event) {
    event.preventDefault();
    
    const username = document.getElementById('add-username').value.trim();
    const fullName = document.getElementById('add-full-name').value.trim();
    const email = (document.getElementById('add-user-email')?.value || '').trim().toLowerCase(); // <Jun Kai/>
    const role = usersPickedRole('add-user-role'); // <Jun Kai/> the ticked role card
    const password = document.getElementById('add-user-password').value;
    const errorDiv = document.getElementById('add-user-error');
    
    // Validate inputs
    if (!username || !fullName || !email || !role || !password) { // <Jun Kai/> the email is required
        errorDiv.textContent = 'All fields are required';
        errorDiv.style.display = 'block';
        return;
    }
    
    // Validate username format
    if (!/^[a-z0-9_]+$/.test(username)) {
        errorDiv.textContent = 'Username must contain only lowercase letters, numbers, and underscores';
        errorDiv.style.display = 'block';
        return;
    }
    
    // Validate password length
    if (password.length < 8) {
        errorDiv.textContent = 'Password must be at least 8 characters long';
        errorDiv.style.display = 'block';
        return;
    }
    // <Jun Kai/> the same quick email check as the server (the server checks again)
    if (!usersEmailLooksRight(email)) {
        errorDiv.textContent = 'Enter a valid email address, like name@example.com.';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-username': sessionStorage.getItem('loggedUser')
            },
            body: JSON.stringify({
                username,
                full_name: fullName,
                email, // <Jun Kai/>
                role,
                password
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`User ${username} added.`, 'success'); // <Jun Kai/>
            closeAddUserModal();
            loadUserManagementData(); // <Jun Kai/> both lists, so both tab counts stay right
        } else {
            errorDiv.textContent = data.error || 'Failed to add user';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error adding user:', error);
        errorDiv.textContent = 'Error connecting to server: ' + error.message;
        errorDiv.style.display = 'block';
    }
}

// Close add user modal
function closeAddUserModal() {
    usersCloseDialog('add-user-dialog'); // <Jun Kai/>
}

// This is the MODIFIED VERSION that allows systemadmin to edit their own password
function editUser(userId, username, currentRole, fullName, email = '') { // <Jun Kai/> email
    const currentUserRole = sessionStorage.getItem('userRole');
    if (currentUserRole !== 'system_admin') {
        showNotification('Only a System Admin can change accounts.', 'error'); // <Jun Kai/> a short note, no browser box
        return;
    }
    
    const currentUsername = sessionStorage.getItem('loggedUser');
    
    // MODIFIED: Check if systemadmin is editing themselves
    const isSystemAdminSelf = (username === 'systemadmin' && currentUsername === 'systemadmin');
    
    // Check if trying to edit protected root account (but allow self-edit)
    if (username === 'systemadmin' && !isSystemAdminSelf) {
        showNotification('Only the root account itself can change it. Sign in as systemadmin to do that.', 'error'); // <Jun Kai/>
        return;
    }
    
    // <Jun Kai/> escaped copies for the window's HTML: a full name is free text
    const usernameHtml = escapeHtml(username);
    const fullNameHtml = escapeHtml(fullName || '');
    const emailHtml = escapeHtml(email || ''); // <Jun Kai/>
    // <Jun Kai start> the same kit dialog as Add user; the root account keeps its username and role
    const fields = (usernameInput, passwordHelp) => `<div class="users-dialog-grid">
            ${usersField('edit-full-name', 'Full name', `<input class="ui-input" type="text" id="edit-full-name" value="${fullNameHtml || (isSystemAdminSelf ? 'System Administrator' : '')}" autocomplete="off" maxlength="100">`, 'Shown in the admin page.')}
            ${usersField('edit-username', 'Username', usernameInput.input, usernameInput.help)}
            ${usersField('edit-email', 'Email', `<input class="ui-input" type="email" id="edit-email" value="${emailHtml}" autocomplete="off" maxlength="254" placeholder="name@example.com">`, isSystemAdminSelf ? 'Where your forgotten password is reset. Only you can change it.' : 'Where a forgotten password is reset.')}
            ${usersField('edit-user-password', 'New password', '<input class="ui-input" type="password" id="edit-user-password" autocomplete="new-password">', passwordHelp)}
        </div>`;
    if (isSystemAdminSelf) {
        const body = `${fields({ input: `<input class="ui-input" type="text" id="edit-username" value="${usernameHtml}" disabled>`, help: 'The root username cannot change.' }, 'Leave empty to keep your password. At least 8 characters.')}
            <div class="users-root-role">
                <input type="hidden" name="edit-user-role" value="system_admin">
                <span class="ui-label">Role</span>
                <p><strong>System Admin</strong> (root account). The root account always keeps every right, so its role cannot change.</p>
            </div>
            <p class="users-dialog-error" id="edit-user-error" role="alert" style="display: none;"></p>`;
        usersOpenDialog('edit-user-dialog', 'Edit my account', 'Your name, email and password. The username and role of the root account stay as they are.', body, 'Save changes', `handleEditUser(event, ${Number(userId)})`);
    } else {
        const body = `${fields({ input: `<input class="ui-input" type="text" id="edit-username" value="${usernameHtml}" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="50">`, help: 'Lowercase letters, numbers and _ only.' }, 'Leave empty to keep the current password.')}
            ${usersRoleCards('edit-user-role', currentRole)}
            <p class="users-dialog-error" id="edit-user-error" role="alert" style="display: none;"></p>`;
        usersOpenDialog('edit-user-dialog', `Edit ${usernameHtml}`, 'Change the details, the role or the password of this account.', body, 'Save changes', `handleEditUser(event, ${Number(userId)})`);
    }
    // <Jun Kai end>
}

// Handle edit user form submission
async function handleEditUser(event, userId) {
    event.preventDefault();
    
    const username = document.getElementById('edit-username').value.trim();
    const fullName = document.getElementById('edit-full-name').value.trim();
    const editEmail = (document.getElementById('edit-email')?.value || '').trim().toLowerCase(); // <Jun Kai/>
    const role = usersPickedRole('edit-user-role'); // <Jun Kai/> the ticked role card (the root keeps its own)
    const password = document.getElementById('edit-user-password').value;
    const errorDiv = document.getElementById('edit-user-error');
    
    // Validate inputs
    if (!username || !fullName || !role) {
        errorDiv.textContent = 'Username, display name, and role are required';
        errorDiv.style.display = 'block';
        return;
    }
    
    // Validate username format
    if (!/^[a-z0-9_]+$/.test(username)) {
        errorDiv.textContent = 'Username must contain only lowercase letters, numbers, and underscores';
        errorDiv.style.display = 'block';
        return;
    }
    
    // <Jun Kai/> an email that was typed must look right (the server also refuses to clear one that was set)
    if (editEmail && !usersEmailLooksRight(editEmail)) {
        errorDiv.textContent = 'Enter a valid email address, like name@example.com.';
        errorDiv.style.display = 'block';
        return;
    }

    // Validate password if provided
    if (password && password.length < 8) {
        errorDiv.textContent = 'Password must be at least 8 characters long';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        const updateData = {
            username,
            full_name: fullName,
            email: editEmail, // <Jun Kai/>
            role
        };
        
        // Only include password if provided
        if (password) {
            updateData.password = password;
        }
        
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-username': sessionStorage.getItem('loggedUser')
            },
            body: JSON.stringify(updateData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Account ${username} saved.`, 'success'); // <Jun Kai/>
            closeEditUserModal();
            loadUserManagementData(); // <Jun Kai/> both lists, so both tab counts stay right
        } else {
            errorDiv.textContent = data.error || 'Failed to update user';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error updating user:', error);
        errorDiv.textContent = 'Error connecting to server: ' + error.message;
        errorDiv.style.display = 'block';
    }
}

// Close edit user modal
function closeEditUserModal() {
    usersCloseDialog('edit-user-dialog'); // <Jun Kai/>
}

// Delete user (soft delete)
async function deleteUser(userId, username) {
    const currentUserRole = sessionStorage.getItem('userRole');
    if (currentUserRole !== 'system_admin') {
        showNotification('Only a System Admin can change accounts.', 'error'); // <Jun Kai/> a short note, no browser box
        return;
    }
    
    const currentUser = sessionStorage.getItem('loggedUser');
    
    // Check if trying to delete protected root account
    if (username === 'systemadmin') {
        showNotification('The root account cannot be deleted.', 'error'); // <Jun Kai/>
        return;
    }
    
    // Check if trying to delete own account
    if (username === currentUser) {
        showNotification('You cannot delete your own account.', 'error'); // <Jun Kai/>
        return;
    }
    
    // <Jun Kai start> the kit dialog says what happens: the account moves to Deleted and can come back
    const sure = await uiConfirm({
        title: `Delete ${username}?`,
        message: 'The account moves to the Deleted tab and can no longer sign in. You can restore it from there.',
        confirmText: 'Delete',
        danger: true
    });
    if (sure) await performUserDeletion(userId, username);
    // <Jun Kai end>
}

// Perform user deletion (soft delete)
async function performUserDeletion(userId, username) {
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'x-username': sessionStorage.getItem('loggedUser')
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`${username} is in the Deleted tab. You can restore it from there.`, 'success'); // <Jun Kai/>
            loadUserManagementData(); // <Jun Kai/> both lists, so both tab counts stay right
        } else {
            await uiAlert({ title: `Could not delete ${username}`, message: data.error || 'The server did not say why.' }); // <Jun Kai/>
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        await uiAlert({ title: `Could not delete ${username}`, message: `The server could not be reached: ${error.message}` }); // <Jun Kai/>
    }
}

// Restore deleted user
async function restoreUser(userId, username) {
    const currentUserRole = sessionStorage.getItem('userRole');
    if (currentUserRole !== 'system_admin') {
        showNotification('Only a System Admin can change accounts.', 'error'); // <Jun Kai/> a short note, no browser box
        return;
    }
    
    // <Jun Kai/> the kit dialog instead of the browser box
    if (await uiConfirm({ title: `Restore ${username}?`, message: 'The account goes back to the Active tab and can sign in again.', confirmText: 'Restore' })) {
        try {
            const response = await fetch(`/api/admin/users/${userId}/restore`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-username': sessionStorage.getItem('loggedUser')
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification(`${username} is back in the Active tab.`, 'success'); // <Jun Kai/>
                loadUserManagementData(); // <Jun Kai/> both lists, so both tab counts stay right
            } else {
                await uiAlert({ title: `Could not restore ${username}`, message: data.error || 'The server did not say why.' }); // <Jun Kai/>
            }
        } catch (error) {
            console.error('Error restoring user:', error);
            await uiAlert({ title: `Could not restore ${username}`, message: `The server could not be reached: ${error.message}` }); // <Jun Kai/>
        }
    }
}

// Permanently delete user (hard delete - cannot be undone)
async function permanentDeleteUser(userId, username) {
    const currentUserRole = sessionStorage.getItem('userRole');
    if (currentUserRole !== 'system_admin') {
        showNotification('Only a System Admin can change accounts.', 'error'); // <Jun Kai/> a short note, no browser box
        return;
    }
    
    // <Jun Kai start> One kit dialog where the admin types the username (two OK boxes in a row were easy to click
    // through). A name that does not match is pointed out in the same dialog, so nothing is deleted by mistake.
    const typed = await uiPrompt({
        title: `Delete ${username} for good?`,
        message: 'This removes the account from the database. It cannot be undone.',
        label: `Type ${username} to confirm`,
        emptyText: 'Type the username first.',
        confirmText: 'Delete for good',
        danger: true,
        check: (value) => (value.trim() === username ? null : `That is not ${username}. Type the username exactly as shown.`)
    });
    if (typed === null || typed.trim() !== username) return;
    // <Jun Kai end>
    try {
        const response = await fetch(`/api/admin/users/${userId}/permanent`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'x-username': sessionStorage.getItem('loggedUser')
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`${username} is deleted for good.`, 'success'); // <Jun Kai/>
            loadUserManagementData(); // <Jun Kai/> both lists, so both tab counts stay right
        } else {
            await uiAlert({ title: `Could not delete ${username}`, message: data.error || 'The server did not say why.' }); // <Jun Kai/>
        }
    } catch (error) {
        console.error('Error permanently deleting user:', error);
        await uiAlert({ title: `Could not delete ${username}`, message: `The server could not be reached: ${error.message}` }); // <Jun Kai/>
    }
}

// Helper function for fallback data (development only)
function getFallbackUsers() {
    return [
        {
            id: 1,
            username: 'systemadmin',
            full_name: 'System Administrator',
            role: 'system_admin',
            department: 'IT',
            is_active: 1
        }
    ];
}

// Helper function to format role names
function formatRoleName(role) {
    const roleMap = {
        'system_admin': 'System Admin',
        'IT_admin': 'IT Admin',
        'IT_staff': 'IT Staff'
    };
    return roleMap[role] || role;
}

