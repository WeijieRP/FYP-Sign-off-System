// Owner: shared. Previous team: Nick (12).
// Part 3/30 of the admin page: lost and found reports (load order in admin.html).
// ==================== LOST AND FOUND REPORTS ====================
async function loadNickUsageAnalytics() { // Load Nick feature usage analytics (DONE BY NICK)
    try {
        const response = await fetch('/api/admin/nick-usage-analytics');
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Unable to load Nick usage analytics.');
        }
        nickUsageAnalytics = data.analytics || null;
        updateNickUsageAnalytics();
    } catch (error) {
        console.error('Error loading Nick usage analytics:', error);
        nickUsageAnalytics = null;
        updateNickUsageAnalytics();
    }
}

function countObjectValues(values = {}) { // Utility for Nick analytics totals (DONE BY NICK)
    return Object.values(values).reduce((sum, value) => sum + Number(value || 0), 0);
}

function updateNickUsageAnalytics() { // Render Nick usage analytics cards (DONE BY NICK)
    const analytics = nickUsageAnalytics || {};
    const captures = analytics.captures || {};
    const lostFound = analytics.lostFound || {};

    const captureTotal = Number(captures.photo || 0) + Number(captures.boomerang || 0);
    const filterTotal = countObjectValues(analytics.filterUses || {});

    const setMetric = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    };

    setMetric('nick-analytics-captures', captureTotal);
    setMetric('nick-analytics-boomerangs', captures.boomerang || 0);
    setMetric('nick-analytics-filters', filterTotal);
    setMetric('nick-analytics-lost-found-photos', `${lostFound.withPhotos || 0}/${lostFound.total || 0}`);
}

function downloadLostFoundCsv() { // Download Lost & Found CSV export (DONE BY NICK)
    exportLostFoundCsvWithPassword(); // <Jun Kai/> the file now holds the decrypted contacts, so it asks for the password
}

// Load Lost & Found reports for the Administration page - changes made by nick
async function loadLostFoundReports() {
    prepareLostFoundPage(); // <Jun Kai/>
    const tbody = document.getElementById('lost-found-reports-body');
    // <Jun Kai/> only the first load says "Loading": a reload after a status change keeps the rows in view
    if (tbody && !allLostFoundReports.length) tbody.innerHTML = '<tr><td colspan="9" class="ui-empty">Loading the reports</td></tr>';

    loadNickUsageAnalytics();

    try {
        const response = await fetch('/api/admin/lost-found-reports');
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Unable to load Lost & Found reports.');
        }

        allLostFoundReports = data.reports || [];
        lostFoundLoadError = ''; // <Jun Kai/>
        filterLostFoundReports();
    } catch (error) {
        console.error('Error loading Lost & Found reports:', error);
        allLostFoundReports = [];
        filteredLostFoundReports = [];
        lostFoundLoadError = error.message || 'no answer'; // <Jun Kai/> the table says the load failed instead of "no reports"
        updateLostFoundReportTable();
    }
}

function filterLostFoundReports() { // changes made by nick
    const searchTerm = document.getElementById('lost-found-search-input')?.value.toLowerCase() || '';
    const typeFilter = document.getElementById('lost-found-type-filter')?.value || '';
    const statusFilter = document.querySelector('input[name="lost-found-status"]:checked')?.value || ''; // <Jun Kai/> the status chips

    // <Jun Kai/> the search and the type are checked apart from the status, so each status chip can count its reports
    const matchesSearchAndType = (report) => {
        const haystack = [
            report.tracking_code,
            report.report_type,
            report.item_description,
            report.location_text,
            lostFoundContacts[report.id] || '', // <Jun Kai/> only a contact that was decrypted on this page can be searched
            report.details,
            report.current_page,
            report.status
        ].join(' ').toLowerCase();

        return (!searchTerm || haystack.includes(searchTerm)) &&
            (!typeFilter || report.report_type === typeFilter);
    };
    filteredLostFoundReports = allLostFoundReports.filter((report) => matchesSearchAndType(report) && (!statusFilter || report.status === statusFilter));
    // <Jun Kai/> newest first as the server sends them, or oldest first after a click on the Report heading
    if (lostFoundOldestFirst) filteredLostFoundReports.reverse();

    // <Jun Kai start> the number on each status chip
    const counts = { all: 0, new: 0, reviewed: 0, resolved: 0 };
    for (const report of allLostFoundReports) {
        if (!matchesSearchAndType(report)) continue;
        counts.all++;
        const status = String(report.status || 'new').toLowerCase();
        if (status in counts) counts[status]++;
    }
    for (const [key, value] of Object.entries(counts)) {
        const chip = document.getElementById(`lost-found-count-${key}`);
        if (chip) chip.textContent = String(value);
    }
    // <Jun Kai end>

    updateLostFoundReportTable();
}

function formatLostFoundStatus(status) { // changes made by nick
    const normalized = String(status || 'new').toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getLostFoundBadgeType(status) { // changes made by nick
    if (status === 'resolved') return 'active';
    if (status === 'reviewed') return 'security';
    return 'warning';
}

function getLostFoundPhotoPath(report) { // Robust admin photo path support for Lost & Found reports (DONE BY NICK)
    const rawPath = report?.item_photo_path
        || report?.itemPhotoPath
        || report?.item_photo_url
        || report?.photo_path
        || report?.photoPath
        || '';
    const photoPath = String(rawPath || '').trim();

    if (!photoPath) return '';
    if (/^(https?:)?\/\//i.test(photoPath) || photoPath.startsWith('data:image/')) return photoPath;

    const normalizedPath = photoPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalizedPath.startsWith('uploads/')) return `/${normalizedPath}`;
    if (normalizedPath.startsWith('lost-found/')) return `/uploads/${normalizedPath}`;
    return `/uploads/lost-found/${normalizedPath}`;
}

function renderLostFoundPhotoCell(report) { // Admin preview link for uploaded Lost & Found item photos (DONE BY NICK)
    const photoPath = getLostFoundPhotoPath(report);
    if (!photoPath) return '<span class="lf-muted">No photo</span>';

    const photoName = report?.item_photo_original_name
        || report?.itemPhotoOriginalName
        || 'Uploaded item photo';
    const escapedPath = escapeHtml(photoPath);
    const escapedName = escapeHtml(photoName);

    // <Jun Kai/> a small picture (the redesign); a file that does not load is swapped for "Photo unavailable" by prepareLostFoundPage()
    return `<a class="lf-photo" href="${escapedPath}" target="_blank" rel="noopener" title="Open ${escapedName}"><img class="ui-thumb" src="${escapedPath}" alt="${escapedName}" loading="lazy"></a>`;
}

function updateLostFoundReportTable() { // changes made by nick
    const tbody = document.getElementById('lost-found-reports-body');
    const summary = document.getElementById('lost-found-summary');
    if (!tbody) return;

    if (summary) {
        const total = allLostFoundReports.length;
        const shown = filteredLostFoundReports.length;
        summary.textContent = `${shown} of ${total} report${total === 1 ? '' : 's'} shown`;
    }

    // <Jun Kai start> one line in the redesign; a load that failed says so, with Try again
    if (!filteredLostFoundReports.length) {
        const text = lostFoundLoadError
            ? `Could not load the reports: ${escapeHtml(String(lostFoundLoadError).replace(/\.$/, ''))}. <button type="button" class="ui-link" onclick="loadLostFoundReports()">Try again</button>`
            : allLostFoundReports.length === 0
                ? 'Reports that visitors send from the feedback form will show here.'
                : 'No report matches the search and filters.';
        tbody.innerHTML = `<tr><td colspan="9" class="ui-empty">${text}</td></tr>`;
        return;
    }
    // <Jun Kai end>

    tbody.innerHTML = filteredLostFoundReports.map((report) => {
        const status = String(report.status || 'new').toLowerCase();
        // <Jun Kai/> a short date: the year only when it is not this year
        const when = report.created_at ? new Date(report.created_at) : null;
        const date = when && !Number.isNaN(when.getTime()) ? when.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...(when.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) }) : '-';
        const pageLabel = report.current_page ? `<span class="lf-page">Page: ${escapeHtml(report.current_page)}</span>` : ''; // <Jun Kai/>
        const trackingCode = report.tracking_code || `LF-${String(report.id || 0).padStart(5, '0')}`;
        const photoCell = renderLostFoundPhotoCell(report);

        // <Jun Kai start> the redesigned row: type and status as tags, and only the next step at the end
        return `
            <tr>
                <td class="lf-report"><b class="lf-code">${escapeHtml(trackingCode)}</b><span class="lf-date">${escapeHtml(date)}</span></td>
                <td>${lostFoundTypeTag(report.report_type)}</td>
                <td class="lf-wrap"><b>${escapeHtml(report.item_description || '-')}</b>${pageLabel}</td>
                <td>${photoCell}</td>
                <td class="lf-wrap">${escapeHtml(report.location_text || '-')}</td>
                <td class="lf-wrap">${lostFoundContactCell(report, trackingCode)}</td>
                <td class="lf-wrap lf-details">${escapeHtml(report.details || '-')}</td>
                <td>${lostFoundStatusTag(status)}</td>
                <td class="lf-actions">${lostFoundNextStep(report, status, trackingCode)}</td>
            </tr>
        `;
        // <Jun Kai end>
    }).join('');
}

async function updateLostFoundReportStatus(reportId, status, button) { // changes made by nick
    // <Jun Kai start> the button waits while it saves, and the line under the table says what happened
    const report = allLostFoundReports.find((item) => Number(item.id) === Number(reportId));
    const code = report?.tracking_code || `LF-${String(reportId || 0).padStart(5, '0')}`;
    if (button) button.disabled = true;
    // <Jun Kai end>
    try {
        const response = await fetch(`/api/admin/lost-found-reports/${encodeURIComponent(reportId)}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Unable to update report status.');
        }

        await loadLostFoundReports();
        lostFoundSay(`Marked ${code} as ${status}.`); // <Jun Kai/>
    } catch (error) {
        console.error('Error updating Lost & Found report:', error);
        lostFoundSay(`Could not mark ${code} as ${status}: ${error.message || 'no answer'}`, true); // <Jun Kai/>
        if (button) button.disabled = false; // <Jun Kai/>
    }
}

// <Jun Kai start> the encrypted contact (like visitor emails): "Encrypted" until a System Admin decrypts it with their
// password; a decrypted contact stays visible by report id until Hide or a reload of the page, also when the list
// reloads after a status change
const lostFoundContacts = {};

function lostFoundContactCell(report, code) {
    const id = Number(report.id);
    const open = lostFoundContacts[id];
    if (open) return `<span class="lf-contact">${escapeHtml(open)}</span> <button type="button" class="ui-link lf-contact-btn" data-lf-contact-hide="${id}" aria-label="Hide the contact of ${escapeHtml(code)}">Hide</button>`;
    if (!report.has_contact) return '<span class="lf-muted">None</span>';
    const canDecrypt = sessionStorage.getItem('userRole') === 'system_admin';
    return `<span class="lf-locked">${uiIcon('lock', 12)}Encrypted</span>${canDecrypt ? ` <button type="button" class="ui-link lf-contact-btn" data-lf-contact="${id}" aria-label="Decrypt the contact of ${escapeHtml(code)}">Decrypt</button>` : ''}`;
}

async function decryptLostFoundContact(id) {
    const report = allLostFoundReports.find((item) => Number(item.id) === Number(id));
    const code = report?.tracking_code || `LF-${String(id).padStart(5, '0')}`;
    const password = await showPasswordPrompt(`Show the contact of ${code}?\n\nEnter your System Admin password:`);
    if (!password) return;
    try {
        const response = await fetch(`/api/admin/lost-found-reports/${encodeURIComponent(id)}/contact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || `the server answered ${response.status}`);
        lostFoundContacts[Number(id)] = data.contact;
        filterLostFoundReports();
        lostFoundSay(`Decrypted the contact of ${code}.`);
    } catch (error) {
        lostFoundSay(`Could not decrypt the contact of ${code}: ${error.message}`, true);
    }
}

async function exportLostFoundCsvWithPassword() {
    const password = await showPasswordPrompt('Export every report with its contact as a CSV file?\n\nThe file holds the decrypted contacts. Enter your System Admin password:');
    if (!password) return;
    try {
        const response = await fetch('/api/admin/lost-found-reports/export.csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `the server answered ${response.status}`);
        }
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `lost_found_reports_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        lostFoundSay('Exported the reports as a CSV file.');
    } catch (error) {
        lostFoundSay(`Could not export the reports: ${error.message}`, true);
    }
}
// <Jun Kai end>

// <Jun Kai start> Lost & Found A (admin redesign)
let lostFoundLoadError = ''; // the reason the last load failed, empty after a good load
let lostFoundPageReady = false;
let lostFoundSayTimer = null;
let lostFoundOldestFirst = false;

// the Report heading: newest first (the server's order) or oldest first
function sortLostFoundByDate() {
    lostFoundOldestFirst = !lostFoundOldestFirst;
    const indicator = document.getElementById('lost-found-sort-date');
    if (indicator) indicator.className = `sort-indicator ${lostFoundOldestFirst ? 'asc' : 'desc'}`;
    indicator?.closest('th')?.setAttribute('aria-sort', lostFoundOldestFirst ? 'ascending' : 'descending');
    filterLostFoundReports();
}
const LOST_FOUND_STATUS_TONES = { new: 'red', reviewed: 'amber', resolved: 'green' };

// once: the icons of the filter bar, the clicks on the next step and ... buttons, broken photos, and the menu
function prepareLostFoundPage() {
    if (lostFoundPageReady) return;
    lostFoundPageReady = true;
    document.querySelectorAll('#lost-found-page [data-fb-icon]').forEach((slot) => {
        slot.innerHTML = uiIcon(slot.dataset.fbIcon, slot.tagName === 'BUTTON' ? 15 : 14);
    });
    const body = document.getElementById('lost-found-reports-body');
    const menu = document.getElementById('lost-found-menu');
    if (body) {
        body.addEventListener('click', (event) => {
            const decrypt = event.target.closest('[data-lf-contact]');
            if (decrypt) return decryptLostFoundContact(Number(decrypt.dataset.lfContact));
            const hide = event.target.closest('[data-lf-contact-hide]');
            if (hide) { delete lostFoundContacts[Number(hide.dataset.lfContactHide)]; filterLostFoundReports(); return; }
            const step = event.target.closest('[data-lf-status]');
            if (step) updateLostFoundReportStatus(Number(step.dataset.lfId), step.dataset.lfStatus, step);
            // a ... button opens the shared menu by itself (popovertarget); this only notes which report it is for
            const more = event.target.closest('[data-lf-menu]');
            if (more && menu) { menu.dataset.lfId = more.dataset.lfMenu; lostFoundMenuButton = more; }
        });
        // a photo file that does not load: the small picture becomes a short note
        body.addEventListener('error', (event) => {
            const img = event.target;
            if (!(img instanceof HTMLImageElement) || !img.classList.contains('ui-thumb')) return;
            const note = document.createElement('span');
            note.className = 'lf-muted';
            note.textContent = 'Photo unavailable';
            (img.closest('a') || img).replaceWith(note);
        }, true);
    }
    if (menu) {
        menu.addEventListener('toggle', (event) => {
            if (event.newState !== 'open' || !lostFoundMenuButton) return;
            uiPlaceUnder(menu, lostFoundMenuButton, 'end');
            menu.querySelector('button')?.focus();
        });
        menu.addEventListener('click', (event) => {
            const item = event.target.closest('[data-lf-menu-status]');
            if (!item) return;
            menu.hidePopover();
            updateLostFoundReportStatus(Number(menu.dataset.lfId), item.dataset.lfMenuStatus);
        });
    }
}
let lostFoundMenuButton = null;

function lostFoundSay(text, isError = false) {
    const line = document.getElementById('lost-found-status');
    if (!line) return;
    line.textContent = text;
    line.classList.toggle('is-error', isError);
    clearTimeout(lostFoundSayTimer);
    lostFoundSayTimer = setTimeout(() => { line.textContent = ''; }, isError ? 12000 : 6000);
}

function lostFoundTypeTag(type) {
    const value = String(type || '').toLowerCase();
    const tone = value === 'lost' ? 'red' : value === 'found' ? 'blue' : 'grey';
    const label = value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown';
    return `<span class="ui-tag is-${tone}">${escapeHtml(label)}</span>`;
}

function lostFoundStatusTag(status) {
    return `<span class="ui-tag is-${LOST_FOUND_STATUS_TONES[status] || 'grey'}">${escapeHtml(formatLostFoundStatus(status))}</span>`;
}

// a new report: Mark reviewed, and Mark resolved now in its ... menu; a reviewed one: Mark resolved; a resolved one: Done
function lostFoundNextStep(report, status, code) {
    const id = Number(report.id);
    if (status === 'new') {
        return `<span class="lf-next"><button type="button" class="ui-btn ui-btn-secondary lf-step" data-lf-id="${id}" data-lf-status="reviewed">Mark reviewed</button><button type="button" class="ui-btn ui-btn-icon" popovertarget="lost-found-menu" data-lf-menu="${id}" aria-label="More for ${escapeHtml(code)}" title="More">${uiIcon('more', 16)}</button></span>`;
    }
    if (status === 'reviewed') {
        return `<span class="lf-next"><button type="button" class="ui-btn ui-btn-secondary lf-step" data-lf-id="${id}" data-lf-status="resolved">Mark resolved</button></span>`;
    }
    return '<span class="lf-done">Done</span>';
}
// <Jun Kai end>

// Update pagination
function updateAuditPagination(total) {
    const totalPages = Math.ceil(total / auditLogsPerPage);
    // <Jun Kai start> the redesigned page says which events it shows, like the Feedback list
    const first = (currentAuditPage - 1) * auditLogsPerPage + 1;
    const last = Math.min(total, currentAuditPage * auditLogsPerPage);
    const filtered = total !== allAuditLogs.length ? ` (${allAuditLogs.length} in total)` : '';
    document.getElementById('audit-page-info').textContent = total > 0 ? `Showing ${first} to ${last} of ${total}${filtered}` : 'Nothing to show';
    // <Jun Kai end>
    document.getElementById('prev-audit-btn').disabled = currentAuditPage <= 1;
    document.getElementById('next-audit-btn').disabled = currentAuditPage >= totalPages;
}

// Previous page
function prevAuditPage() {
    if (currentAuditPage > 1) {
        currentAuditPage--;
        displayAuditLogsPage();
        updateAuditPagination(filteredAuditLogs.length);
    }
}

// Next page
function nextAuditPage() {
    const totalPages = Math.ceil(filteredAuditLogs.length / auditLogsPerPage);
    if (currentAuditPage < totalPages) {
        currentAuditPage++;
        displayAuditLogsPage();
        updateAuditPagination(filteredAuditLogs.length);
    }
}

// Clear all filters
function clearAllFilters() {
    // Clear search
    const searchInput = document.getElementById('audit-search-input');
    if (searchInput) searchInput.value = '';
    
    // Clear all filter dropdowns
    const filterAction = document.getElementById('filter-action');
    if (filterAction) filterAction.value = '';
    
    const filterUser = document.getElementById('filter-user');
    if (filterUser) filterUser.value = '';
    
    const filterTargetType = document.getElementById('filter-target-type');
    if (filterTargetType) filterTargetType.value = '';
    
    const filterIp = document.getElementById('filter-ip');
    if (filterIp) filterIp.value = '';
    
    // Clear date filters
    const filterDateFrom = document.getElementById('filter-date-from');
    if (filterDateFrom) filterDateFrom.value = '';
    
    const filterDateTo = document.getElementById('filter-date-to');
    if (filterDateTo) filterDateTo.value = '';
    
    // Re-filter
    filterAuditLogs();
}

// Set date range preset
function setDateRangePreset(preset) {
    const filterDateFrom = document.getElementById('filter-date-from');
    const filterDateTo = document.getElementById('filter-date-to');
    if (!filterDateFrom || !filterDateTo) return;

    // Singapore calendar days, same helpers as the feedback presets
    const sgt = getSGTDateComponents();
    const todaySGT = new Date(Date.UTC(sgt.year, sgt.month, sgt.day));
    const startDate = new Date(todaySGT);
    if (preset === 'week') startDate.setUTCDate(startDate.getUTCDate() - 7);
    if (preset === 'month') startDate.setUTCMonth(startDate.getUTCMonth() - 1);

    filterDateTo.value = formatDateToSGTString(todaySGT);
    filterDateFrom.value = formatDateToSGTString(startDate);
    filterAuditLogs();
}

// Download audit logs as Excel
async function downloadAuditExcel() {
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'system_admin') {
        showNotification('Only a System Admin can download the audit logs.', 'error'); // <Jun Kai/>
        return;
    }
    
    try {
        // Prepare data for Excel (use filtered results)
        const excelData = filteredAuditLogs.map(log => ({
            'Time': new Date(log.created_at).toLocaleString(),
            'User': log.admin_username,
            'Action': log.action,
            'Target Type': log.target_type || '',
            'Target ID': log.target_id || '',
            'IP Address': log.ip_address || '',
            'User Agent': log.user_agent || ''
        }));
        
        if (excelData.length === 0) {
            showNotification('No audit logs to download. Try other filters.', 'info'); // <Jun Kai/>
            return;
        }
        
        // Convert to CSV
        const headers = Object.keys(excelData[0]);
        const csvContent = [
            headers.join(','),
            ...excelData.map(row => 
                headers.map(header => {
                    // <Jun Kai start> every cell in quotes, 0 kept, and text a spreadsheet would run as a formula gets a '
                    // in front: a username typed at the login and a browser's user agent both land in this file
                    const raw = row[header];
                    let value = raw === null || raw === undefined ? '' : String(raw);
                    if (/^[=+\-@\t\r]/.test(value) && !/^[+-]?\d+(\.\d+)?$/.test(value)) value = `'${value}`;
                    return `"${value.replace(/"/g, '""')}"`;
                    // <Jun Kai end>
                }).join(',')
            )
        ].join('\n');
        
        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`✅ Downloaded ${excelData.length} audit logs`);
        
        // <Jun Kai start> A call to /api/admin/logout-audit stood here "to log the download". That route is the Logout:
        // it wrote a LOGOUT line and ended the session, so the admin was signed out right after every download.
        // <Jun Kai end>
        
    } catch (error) {
        console.error('❌ Error downloading audit logs:', error);
        showNotification('Could not download the audit logs: ' + error.message, 'error'); // <Jun Kai/>
    }
}

