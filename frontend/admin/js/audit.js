// Owner: shared. Previous team: none marked.
// Part 2/30 of the admin page: audit logs (load order in admin.html).
// ==================== 3. AUDIT LOGS MANAGEMENT ====================

// Load all audit logs
async function loadAuditLogs() {
    prepareAuditFilterBar(); // <Jun Kai/>
    try {
        console.log('📋 Loading audit logs...');
        const response = await fetch(`/api/admin/audit-logs?limit=10000&offset=0`);
        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            throw new Error(response.ok
                ? 'Server returned an invalid upload response.'
                : `Server returned an HTML error page (${response.status}). Please check the backend console.`);
        }

        if (response.ok && data.success) {
            allAuditLogs = data.logs || [];
            console.log(`✅ Loaded ${allAuditLogs.length} audit logs`);

            // Populate filter dropdowns
            populateUserFilter();

            // Reset to first page
            currentAuditPage = 1;

            // Apply filters and display
            filterAuditLogs();
        } else {
            // <Jun Kai/> a refusal (for example a session that ran out) used to leave the list on "Loading"
            throw new Error(data.error || data.message || `the server answered ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Error loading audit logs:', error);
        allAuditLogs = [];
        filteredAuditLogs = [];
        showAuditLoadError(error.message); // <Jun Kai/> says the load failed, not "No audit logs have been recorded yet"
    }
}

// Populate user filter dropdown with unique users
function populateUserFilter() {
    const userFilter = document.getElementById('filter-user');
    if (!userFilter) return;

    // Get unique usernames
    const uniqueUsers = [...new Set(allAuditLogs.map(log => log.admin_username))].filter(Boolean).sort();

    // Clear existing options except the first one ("Admin: any" on the redesigned page)
    const chosen = userFilter.value; // <Jun Kai/> kept when the list is loaded again
    userFilter.innerHTML = '<option value="">Admin: any</option>';

    // Add user options
    uniqueUsers.forEach(username => {
        const option = document.createElement('option');
        option.value = username;
        option.textContent = username;
        userFilter.appendChild(option);
    });
    if (chosen && uniqueUsers.includes(chosen)) userFilter.value = chosen; // <Jun Kai/>
}

// Filter audit logs based on all criteria
function filterAuditLogs() {
    const searchTerm = document.getElementById('audit-search-input')?.value.toLowerCase() || '';
    const filterAction = document.getElementById('filter-action')?.value || '';
    const filterUser = document.getElementById('filter-user')?.value || '';
    const filterTargetType = document.getElementById('filter-target-type')?.value || '';
    const filterIp = document.getElementById('filter-ip')?.value.toLowerCase() || '';
    const filterDateFrom = document.getElementById('filter-date-from')?.value || '';
    const filterDateTo = document.getElementById('filter-date-to')?.value || '';

    filteredAuditLogs = allAuditLogs.filter(log => {
        // Global search filter - searches ALL columns
        const searchMatch = !searchTerm ||
            (log.admin_username && log.admin_username.toLowerCase().includes(searchTerm)) ||
            (log.action && log.action.toLowerCase().includes(searchTerm)) ||
            (log.target_type && log.target_type.toLowerCase().includes(searchTerm)) ||
            (log.target_id && log.target_id.toString().toLowerCase().includes(searchTerm)) ||
            (log.ip_address && log.ip_address.toLowerCase().includes(searchTerm)) ||
            (log.user_agent && log.user_agent.toLowerCase().includes(searchTerm)) ||
            (log.created_at && new Date(log.created_at).toLocaleString().toLowerCase().includes(searchTerm)) ||
            auditSentence(log).text.toLowerCase().includes(searchTerm); // <Jun Kai/> the sentence on the page, so "signed in" finds sign ins

        // Action filter
        const actionMatch = !filterAction || (log.action && log.action.includes(filterAction));

        // User filter
        const userMatch = !filterUser || (log.admin_username === filterUser);

        // Target Type filter
        // <Jun Kai start> text targets are saved as "type:name" (visitor_archive:settings), so they match their type too
        const targetMatch = !filterTargetType || log.target_type === filterTargetType || String(log.target_type || '').startsWith(`${filterTargetType}:`);
        // <Jun Kai end>

        // IP Address filter
        const ipMatch = !filterIp || (log.ip_address && log.ip_address.toLowerCase().includes(filterIp));

        // Date range filter
        let dateMatch = true;
        if (filterDateFrom || filterDateTo) {
            const logDate = new Date(log.created_at);
            logDate.setHours(0, 0, 0, 0); // Reset time for date comparison

            if (filterDateFrom) {
                const fromDate = new Date(filterDateFrom);
                fromDate.setHours(0, 0, 0, 0);
                dateMatch = dateMatch && logDate >= fromDate;
            }

            if (filterDateTo) {
                const toDate = new Date(filterDateTo);
                toDate.setHours(23, 59, 59, 999);
                dateMatch = dateMatch && logDate <= toDate;
            }
        }

        return searchMatch && actionMatch && userMatch && targetMatch && ipMatch && dateMatch;
    });

    // Apply sorting
    sortFilteredLogs();

    // Reset to first page when filtering
    currentAuditPage = 1;

    // Update UI
    showAuditFilterState(); // <Jun Kai/> the chips show what is set (the old counters and results bar are gone)
    displayAuditLogsPage();
    updateAuditPagination(filteredAuditLogs.length);
}

// Sort filtered logs
function sortFilteredLogs() {
    filteredAuditLogs.sort((a, b) => {
        let aVal = a[currentSortField];
        let bVal = b[currentSortField];

        // Handle dates
        if (currentSortField === 'created_at') {
            aVal = new Date(aVal);
            bVal = new Date(bVal);
        }

        // Handle nulls
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        // Compare
        if (aVal < bVal) return currentSortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

// Display current page of filtered audit logs
function displayAuditLogsPage() {
    const startIndex = (currentAuditPage - 1) * auditLogsPerPage;
    const endIndex = startIndex + auditLogsPerPage;
    const pageData = filteredAuditLogs.slice(startIndex, endIndex);

    updateAuditTable(pageData);
}

// <Jun Kai start> Audit Logs B (admin redesign): the events of each day under a day heading, one short sentence per
// event. The day, the heading and the time all use Singapore time, the same as the date presets.
const AUDIT_ZONE = 'Asia/Singapore';
const AUDIT_AVATAR_HUES = [220, 262, 330, 12, 28, 160, 190, 290];
// one formatter for every row: making a new one per row was slow on a list of thousands
const AUDIT_DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: AUDIT_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

// What each action the server writes means, said as the rest of a sentence after the username.
// {id} becomes "#" and the record number, {n} the number of records, {name} the setting the row is about.
// An action that is not in this list (an old row, or one from a newer branch) shows only its code and target.
const AUDIT_SENTENCES = {
    LOGIN: 'signed in',
    LOGOUT: 'signed out',
    LOGIN_FAILED: 'failed to sign in',
    LOGIN_LOCKED: 'was locked out after too many failed sign ins',
    PASSWORD_VERIFY_FAILED: 'typed a wrong password when asked to confirm an action',
    PASSWORD_RESET_REQUESTED: 'asked for a password reset code by email',
    PASSWORD_RESET_DONE: 'set a new password with a reset code or link',
    PASSWORD_RESET_CODE_WRONG: 'typed a wrong password reset code',
    PASSWORD_RESET_LIMITED: 'asked for too many password reset emails (none was sent)',
    PASSWORD_RESET_EMAIL_FAILED: 'asked for a password reset, but the email could not be sent',
    ADMIN_IDLE_SIGNOUT_UPDATE: 'changed the idle sign out setting',
    ADD_USER: 'added a user',
    EDIT_USER: 'edited user {id}',
    DELETE_USER: 'deleted user {id}',
    RESTORE_USER: 'restored user {id}',
    PERMANENT_DELETE_USER: 'permanently deleted user {id}',
    DELETE_FEEDBACK: 'deleted feedback {id}',
    DELETE_FEEDBACK_DENIED: 'was not allowed to delete feedback {id}',
    VIEW_ENCRYPTED_EMAIL: 'viewed the email of feedback {id}',
    DECRYPT_EMAIL_DENIED: 'was not allowed to view the email of feedback {id}',
    DOWNLOAD_EXCEL: 'downloaded the feedback as a spreadsheet',
    DOWNLOAD_ARCHIVE_EXCEL: 'downloaded the archived feedback as a spreadsheet',
    DOWNLOAD_PHOTOS: 'downloaded visitor photos',
    DELETE_ARCHIVE_SELECTED: 'deleted {n} selected archived records',
    DELETE_ARCHIVE_FAILED: 'tried to delete selected archived records, but it failed',
    DELETE_ARCHIVE_BY_DATE: 'deleted {n} archived records by date',
    DELETE_ARCHIVE_BY_DATE_FAILED: 'tried to delete archived records by date, but it failed',
    ARCHIVE_BULK_DECRYPT: 'decrypted {n} archived emails',
    ARCHIVE_BULK_DECRYPT_FAILED: 'tried to decrypt the archived emails, but it failed',
    ARCHIVE_PHOTOS_DOWNLOAD: 'downloaded {n} archived photos',
    EDIT_LOST_FOUND_REPORT: 'updated Lost & Found report {id}',
    VIEW_LOST_FOUND_CONTACT: 'decrypted the contact of Lost & Found report {id}',
    DOWNLOAD_LOST_FOUND_CSV: 'exported {n} Lost & Found reports with their contacts',
    ADD_OVERLAY: 'added an overlay',
    DELETE_OVERLAY: 'deleted overlay {id}',
    DELETE_QUESTION: 'deleted question {id}',
    SAVE_THEME: 'saved theme {id}',
    UPDATE_THEME: 'updated theme {id}',
    ACTIVATE_THEME: 'switched to theme {id}',
    DEACTIVATE_ALL_THEMES: 'went back to the default theme',
    DELETE_THEME: 'deleted theme {id}',
    FORM_UI_UPDATED: 'changed the kiosk form settings',
    PARAMETERS_UPDATED: 'changed the kiosk parameters',
    PARAMETERS_RESET: 'reset the kiosk parameters to the defaults',
    PARAMETER_TREE_UPDATED: 'changed the tree settings',
    PARAMETER_BACKGROUND_UPLOADED: 'uploaded a feedback page background',
    PARAMETER_LEAF_UPLOADED: 'uploaded a leaf picture',
    PARAMETER_LEAF_SELECTED: 'chose a leaf picture',
    PARAMETER_LEAF_REVERTED: 'went back to the default leaf picture',
    PARAMETER_VIP_LEAF_UPLOADED: 'uploaded a VIP leaf picture',
    PARAMETER_VIP_LEAF_SELECTED: 'chose a VIP leaf picture',
    PARAMETER_VIP_LEAF_REVERTED: 'went back to the default VIP leaf picture',
    PARAMETER_TREE_BACKGROUND_UPLOADED: 'uploaded a tree background',
    PARAMETER_TREE_BACKGROUND_SELECTED: 'chose a tree background',
    BADGE_EMAIL_TEMPLATES_UPDATED: 'updated the badge email templates',
    RETENTION_CLEANUP_RUN: 'ran the data retention clean up',
    AI_SETTING_ON: 'switched on {name}',
    AI_SETTING_OFF: 'switched off {name}',
    AIOPS_SETTINGS_UPDATE: 'changed the incident settings',
    AIOPS_FIXES_ON: 'switched on fix suggestions for incidents',
    AIOPS_FIXES_OFF: 'switched off fix suggestions for incidents',
    AIOPS_LOCAL_AI_ON: 'switched on the local AI for incidents',
    AIOPS_LOCAL_AI_OFF: 'switched off the local AI for incidents',
    AIOPS_FIX_MODE_ASK: 'set the {name} fix to ask first',
    AIOPS_FIX_MODE_DELAYED: 'set the {name} fix to ask first, then run by itself after a wait',
    AIOPS_FIX_MODE_AUTO: 'set the {name} fix to run automatically',
    AIOPS_INCIDENT_FIX: 'started a fix for incident {id}',
    AIOPS_INCIDENT_FIX_AUTO: 'started a fix for incident {id} by itself',
    AIOPS_INCIDENT_ACKNOWLEDGE: 'acknowledged incident {id}',
    AIOPS_INCIDENT_RESOLVE: 'resolved incident {id}',
    AIOPS_INCIDENT_VERDICT: 'gave a verdict on incident {id}',
    AIOPS_TEST_INCIDENT: 'made test incident {id}',
    HARDWARE_ALERT_LINES_UPDATE: 'changed the hardware alert lines',
    HEALTH_SETTINGS_UPDATE: 'changed the System Health settings',
    DATA_EXPORT_UNLOCKED: 'unlocked Data Export',
    DATA_EXPORT_UNLOCK_FAILED: 'typed a wrong password to unlock Data Export',
    DATA_EXPORT_UNLOCK_DENIED: 'was not allowed to unlock Data Export',
    DATA_EXPORT_FEEDBACK_FULL: 'exported all feedback',
    DATA_EXPORT_FEEDBACK_NOT_ARCHIVED: 'exported the feedback that is not archived',
    DATA_EXPORT_FEEDBACK_ARCHIVED: 'exported the archived feedback',
    DATA_EXPORT_PHOTOS_ALL: 'exported all photos',
    DATA_EXPORT_PHOTOS_NOT_ARCHIVED: 'exported the photos that are not archived',
    DATA_EXPORT_PHOTOS_ARCHIVED: 'exported the archived photos',
    DATA_EXPORT_AUDIT_LOG: 'exported the audit log',
    DATA_EXPORT_SCHOOL_IMPACT_CSV: 'exported the school impact report as CSV',
    DATA_EXPORT_SCHOOL_IMPACT_PDF: 'exported the school impact report as PDF',
    VISITOR_ARCHIVE_SETTINGS: 'changed the Visitor Data Archive settings',
    VISITOR_ARCHIVE_UNLOCK: 'unlocked the Visitor Data Archive',
    VISITOR_ARCHIVE_UNLOCK_FAILED: 'typed a wrong Visitor Data Archive password',
    VISITOR_ARCHIVE_RUN: 'made a visitor archive (run {id})',
    VISITOR_ARCHIVE_AUTO: 'made a visitor archive by itself (run {id})',
    VISITOR_ARCHIVE_DOWNLOAD: 'downloaded visitor archive {id}',
    VISITOR_ARCHIVE_DECRYPT: 'decrypted visitor archive {id}',
    VISITOR_ARCHIVE_DELETE_FILE: 'deleted the file of visitor archive {id}',
    VISITOR_ARCHIVE_EXPIRE: 'removed expired visitor archive {id}',
};
// names for the {name} part, taken from the end of the target ("ai_settings:translate")
const AUDIT_NAMES = { all: 'all AI features', reportModels: 'the Feedback Reports AI', pledgeCheck: 'the pledge check', translate: 'Translate', incidentAdvisor: 'the incident advisor', 'start-kiosk': 'Start kiosk' };

// the target as stored, made readable: "visitor_archive:settings" becomes "visitor archive: settings", an id adds "#12"
function auditTargetText(log) {
    const type = String(log.target_type || '').replace(/_/g, ' ').replace(/:/g, ': ');
    const id = log.target_id !== null && log.target_id !== undefined ? `#${log.target_id}` : '';
    return [type, id].filter(Boolean).join(' ');
}

// { text, known }: the sentence for a known action, or for an unknown one the target only. Plain text, not escaped.
function auditSentence(log) {
    const template = AUDIT_SENTENCES[log.action];
    if (!template) return { text: auditTargetText(log), known: false };
    const hasId = log.target_id !== null && log.target_id !== undefined;
    const name = String(log.target_type || '').split(':')[1] || '';
    const text = template
        .replace(/ \{id\}/g, hasId ? ` #${log.target_id}` : '')
        .replace(/\{n\} /g, hasId ? `${log.target_id} ` : '')
        .replace(/\{name\}/g, AUDIT_NAMES[name] || name.replace(/[-_.]/g, ' ') || 'a setting');
    return { text, known: true };
}

// tag colour: amber for refusals and failures, red for deletes, green for adds, purple for downloads, exports and
// decrypts, grey for sign in and out, blue for every other change
function auditTone(action) {
    const a = String(action || '');
    if (/FAILED|DENIED|_LOCKED$|_WRONG$|_LIMITED$/.test(a)) return 'amber'; // _LOCKED at the end only: DATA_EXPORT_UNLOCKED is not a refusal
    if (/DELETE|EXPIRE/.test(a)) return 'red';
    if (/^ADD_|^SAVE_|UPLOADED|^RESTORE_|^CREATE_/.test(a)) return 'green';
    if (/DOWNLOAD|EXPORT|DECRYPT|VIEW_|UNLOCK|ARCHIVE_RUN|ARCHIVE_AUTO/.test(a)) return 'purple';
    if (/^LOGIN$|^LOGOUT$/.test(a)) return 'grey';
    return 'blue';
}

function auditDate(log) {
    const date = new Date(log.created_at);
    return Number.isNaN(date.getTime()) ? null : date;
}

// "2026-11-26" for the Singapore calendar day of a date, "unknown" for a row without a usable time
function auditDayKey(date) {
    if (!date) return 'unknown';
    return AUDIT_DAY_FORMAT.format(date);
}

function auditDayLabel(key, count, continued) {
    const events = `${count} ${count === 1 ? 'event' : 'events'}${continued ? ', continued from the last page' : ''}`;
    if (key === 'unknown') return `Unknown date · ${events}`;
    const today = auditDayKey(new Date());
    const yesterday = auditDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const long = new Date(`${key}T12:00:00+08:00`).toLocaleDateString('en-SG', {
        timeZone: AUDIT_ZONE, weekday: 'long', day: 'numeric', month: 'long', ...(key.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
    });
    const name = key === today ? `Today · ${long}` : key === yesterday ? `Yesterday · ${long}` : long;
    return `${name} · ${events}`;
}

function auditInitials(name) {
    const parts = String(name).split(/[^A-Za-z0-9]+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || '?').slice(0, 2);
    return letters.toUpperCase();
}

function auditHue(name) {
    let hash = 7;
    for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return AUDIT_AVATAR_HUES[hash % AUDIT_AVATAR_HUES.length];
}

function auditRow(log) {
    const who = log.admin_username || 'unknown';
    const { text, known } = auditSentence(log);
    const date = auditDate(log);
    const time = date ? date.toLocaleTimeString('en-SG', { timeZone: AUDIT_ZONE, hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';
    const action = log.action || 'UNKNOWN';
    const target = !known && text ? ` <span class="audit-target">${escapeHtml(text)}</span>` : '';
    return `<li class="audit-row">
        <span class="ui-avatar" style="--ui-hue: ${auditHue(who)}" aria-hidden="true">${escapeHtml(auditInitials(who))}</span>
        <span class="audit-what"><b class="audit-who" title="${escapeHtml(who)}">${escapeHtml(who)}</b> ${known ? escapeHtml(text) + ' ' : ''}<span class="ui-tag is-${auditTone(action)}">${escapeHtml(action)}</span>${target}</span>
        <span class="audit-ip">${escapeHtml(log.ip_address || '')}</span>
        <time class="audit-time"${date ? ` datetime="${date.toISOString()}"` : ''}>${escapeHtml(time)}</time>
    </li>`;
}

// Draws one page of events (50) under day headings. A heading counts the events of that day in the whole filtered
// list, so a day that runs over two pages still shows its full count.
function updateAuditTable(logs) {
    const body = document.getElementById('audit-logs-body');
    if (!body) return;

    if (!logs || logs.length === 0) {
        body.innerHTML = allAuditLogs.length === 0
            ? '<p class="ui-empty audit-empty">No audit logs have been recorded yet.</p>'
            : '<p class="ui-empty audit-empty">No audit logs match these filters. <button type="button" class="ui-link" onclick="clearAllFilters()">Clear filters</button></p>';
        return;
    }

    const perDay = new Map();
    for (const log of filteredAuditLogs) {
        const key = auditDayKey(auditDate(log));
        perDay.set(key, (perDay.get(key) || 0) + 1);
    }
    const startIndex = (currentAuditPage - 1) * auditLogsPerPage;
    const dayBefore = startIndex > 0 && filteredAuditLogs[startIndex - 1] ? auditDayKey(auditDate(filteredAuditLogs[startIndex - 1])) : null;

    let html = '';
    let openDay = null;
    for (const log of logs) {
        const key = auditDayKey(auditDate(log));
        if (key !== openDay) {
            if (openDay !== null) html += '</ul>';
            html += `<h3 class="audit-day">${escapeHtml(auditDayLabel(key, perDay.get(key) || 0, openDay === null && key === dayBefore))}</h3><ul class="audit-list">`;
            openDay = key;
        }
        html += auditRow(log);
    }
    body.innerHTML = html + '</ul>';
}

// Shows which filters are set: a set filter is tinted, the date chip names its range, and Clear filters appears
function showAuditFilterState() {
    const value = (id) => document.getElementById(id)?.value || '';
    const anySet = ['audit-search-input', 'filter-action', 'filter-user', 'filter-target-type', 'filter-ip', 'filter-date-from', 'filter-date-to'].some((id) => value(id) !== '');
    const clear = document.getElementById('audit-clear-filters');
    if (clear) clear.hidden = !anySet;
    for (const id of ['filter-action', 'filter-user', 'filter-target-type', 'filter-ip']) {
        document.getElementById(id)?.classList.toggle('is-set', value(id) !== '');
    }
    const from = value('filter-date-from');
    const to = value('filter-date-to');
    const day = (text) => new Date(text + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
    const label = document.getElementById('audit-date-label');
    if (label) label.textContent = from && to ? (from === to ? day(from) : `${day(from)} to ${day(to)}`) : from ? `From ${day(from)}` : to ? `Until ${day(to)}` : 'Any date';
    document.getElementById('audit-date-button')?.classList.toggle('is-set', !!(from || to));
}

// the Order chip: the timeline has no columns to sort, so it sorts by time only, newest or oldest first
function setAuditOrder(direction) {
    currentSortField = 'created_at';
    currentSortDirection = direction === 'asc' ? 'asc' : 'desc';
    filterAuditLogs();
}

// a load that failed says so, with a button to try again, instead of an empty list
function showAuditLoadError(message) {
    const body = document.getElementById('audit-logs-body');
    if (body) body.innerHTML = `<p class="ui-empty audit-empty audit-error" role="alert">Could not load the audit log: ${escapeHtml(String(message || 'no answer').replace(/\.$/, ''))}. <button type="button" class="ui-link" onclick="loadAuditLogs()">Try again</button></p>`;
    const info = document.getElementById('audit-page-info');
    if (info) info.textContent = 'Nothing to show';
    for (const id of ['prev-audit-btn', 'next-audit-btn']) {
        const button = document.getElementById(id);
        if (button) button.disabled = true;
    }
}

// "Any date" in the date pop-up
function clearAuditDates() {
    for (const id of ['filter-date-from', 'filter-date-to']) {
        const input = document.getElementById(id);
        if (input) input.value = '';
    }
    filterAuditLogs();
}

// once, the first time the page loads: the search, calendar and refresh icons of the filter bar, and the date
// filter's small window opening under its chip (the same as on the Feedback list)
let auditFilterBarReady = false;
function prepareAuditFilterBar() {
    if (auditFilterBarReady) return;
    auditFilterBarReady = true;
    document.querySelectorAll('#audit-page [data-fb-icon]').forEach((slot) => {
        slot.innerHTML = uiIcon(slot.dataset.fbIcon, slot.tagName === 'BUTTON' ? 15 : 14);
    });
    const pop = document.getElementById('audit-date-pop');
    const chip = document.getElementById('audit-date-button');
    if (pop && chip) pop.addEventListener('toggle', (event) => {
        if (event.newState !== 'open') return;
        uiPlaceUnder(pop, chip);
    });
}
// <Jun Kai end>
