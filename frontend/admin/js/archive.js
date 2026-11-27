// Owner: Role 3, Jun Kai. Previous team: none marked.
// Part 6/30 of the admin page: archive data table (load order in admin.html).
// ==================== 6. ARCHIVE DATA MANAGEMENT (ARCHIVED) ====================


// Load ALL archive data (archive_status = 'archived')
async function loadArchiveData() {
    try {
        console.log('📚 Loading archive data (archived)...');
        
        const response = await fetch('/api/admin/archive', {
            headers: {
                'x-username': sessionStorage.getItem('loggedUser')
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            allArchiveData = data.feedback || [];
            archiveCurrentPage = 1;
            
            console.log(`✅ Loaded ${allArchiveData.length} archive records`);
            
            // Reset decryption
            decryptedArchiveEmailMap = {};
            isAnyArchiveEmailDecrypted = false;
            
            // Apply filters
            filterArchiveData();
        } else {
            throw new Error(data.error || 'Failed to load archive data');
        }
    } catch (error) {
        console.error('❌ Error loading archive:', error);
        
        // Show error in table
        const tbody = document.getElementById('archive-table-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 40px; color: #ef4444;">
                        ❌ Error connecting to server<br>
                        <small class="text-muted">${error.message}</small>
                    </td>
                </tr>
            `;
        }
        
        updateArchivePaginationControls(0, 0);
    }
}

// Filter archive data (same logic as feedback)
function filterArchiveData() {
    const searchTerm = document.getElementById('archive-search-input')?.value.toLowerCase() || '';
    const dateFrom = document.getElementById('archive-filter-date-from')?.value || '';
    const dateTo = document.getElementById('archive-filter-date-to')?.value || '';
    const emailFilter = document.getElementById('archive-filter-email')?.value || '';
    const visitsFilter = document.getElementById('archive-filter-visits')?.value || '';
    const retentionFilter = document.getElementById('archive-filter-retention')?.value || '';
    
    // Count active filters
    let activeFiltersCount = 0;
    if (searchTerm) activeFiltersCount++;
    if (dateFrom || dateTo) activeFiltersCount++;
    if (emailFilter) activeFiltersCount++;
    if (visitsFilter) activeFiltersCount++;
    if (retentionFilter) activeFiltersCount++;
    
    // Filter ALL data
    filteredArchiveData = allArchiveData.filter(item => {
        let matches = true;
        
        // Global search
        if (searchTerm) {
            const searchableText = [
                item.name || '',
                String(item.visits || ''),
                item.pledge || '',
                // <Jun Kai/> the answers too: typed feedback and the labels of chosen options
                (Array.isArray(item.question_answers) ? item.question_answers.map((a) => `${(a && a.answer_value) || ''} ${(a && a.option_label) || ''}`).join(' ') : ''),
                item.date ? new Date(item.date).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) : ''
            ].join(' ').toLowerCase();
            
            matches = matches && searchableText.includes(searchTerm);
        }
        
        // Date range — boundaries computed in Singapore time
        if (dateFrom || dateTo) {
            const itemDate = new Date(item.date);
            if (dateFrom) {
                matches = matches && itemDate >= startOfDaySGT(dateFrom);
            }
            if (dateTo) {
                matches = matches && itemDate <= endOfDaySGT(dateTo);
            }
        }
        
        // Email filter
        if (emailFilter) {
            const hasEmail = item.email_encrypted && 
                            item.email_encrypted.trim() !== '' && 
                            item.email_encrypted.toLowerCase() !== 'no email provided';
            
            if (emailFilter === 'has_email') {
                matches = matches && hasEmail;
            } else if (emailFilter === 'no_email') {
                matches = matches && !hasEmail;
            }
        }
        
        // Visits
        if (visitsFilter) {
            const visits = parseInt(item.visits) || 0;
            if (visitsFilter === '6+') {
                matches = matches && visits >= 6;
            } else {
                matches = matches && visits === parseInt(visitsFilter);
            }
        }
        
        // Retention
        if (retentionFilter) {
            const itemRetention = (item.data_retention || '').toLowerCase();
            const filterValue = retentionFilter.toLowerCase();
            
            if (filterValue === '7days' || filterValue === '7day') {
                matches = matches && (itemRetention === '7days' || itemRetention === '7day');
            } else if (filterValue === 'longterm') {
                matches = matches && itemRetention === 'longterm';
            }
        }
        
        return matches;
    });
    
    // Update UI counts
    updateArchiveCounts(allArchiveData.length, filteredArchiveData.length, activeFiltersCount);

    // Keep the column sort the admin chose
    if (archiveSortColumn) {
        filteredArchiveData.sort((a, b) => compareValues(a[archiveSortColumn], b[archiveSortColumn], archiveSortColumn));
        if (!archiveSortAsc) filteredArchiveData.reverse();
    }
    
    // Reset to page 1
    archiveCurrentPage = 1;
    
    // Reset decryption
    decryptedArchiveEmailMap = {};
    isAnyArchiveEmailDecrypted = false;
    
    // Render
    renderArchivePage();
}

// <Jun Kai start>
// Archived Feedback since the admin redesign (list style A, like Feedback). The rows, the pager and the side panel come
// from submissionList.js; this file keeps loading, filtering and the Delete by date panel.
const archiveView = makeSubmissionList({
    key: 'archive', name: 'archiveView', pageId: 'archive-page', columns: 9, perPage: archiveItemsPerPage,
    all: () => allArchiveData, setAll: (rows) => { allArchiveData = rows; },
    list: () => filteredArchiveData, setList: (rows) => { filteredArchiveData = rows; },
    page: () => archiveCurrentPage, setPage: (number) => { archiveCurrentPage = number; },
    decrypted: () => decryptedArchiveEmailMap,
    resetDecrypted: () => { decryptedArchiveEmailMap = {}; isAnyArchiveEmailDecrypted = false; },
    markDecrypted: (id, email) => { decryptedArchiveEmailMap[id] = email; isAnyArchiveEmailDecrypted = true; },
    setEncryptedIds: (ids) => { encryptedArchiveIds = ids; },
    updateButtons: () => updateArchiveEncryptionButtons(),
    remove: (id) => deleteArchiveFeedback(id),
    refilter: () => filterArchiveData(),
    clearFilters: 'clearAllArchiveFilters()',
    // tick boxes for System Admins (Delete selected); a single delete stays with IT admins too, as before
    tickColumn: true, canTick: () => sessionStorage.getItem('userRole') === 'system_admin', tickClass: 'archive-select-checkbox',
    onTick: () => updateArchiveSelectionCount(),
    beforeOpen: () => closeArchiveDeletePanel(false),
    keepRoom: () => !document.getElementById('archive-delete-panel').hidden,
    emptyText: 'Nothing is archived yet. Feedback moves here once it is older than the auto-archive period.',
    filteredText: 'No archived submission matches these filters.',
});
function updateArchiveCounts(total, filtered, activeFilters) { archiveView.showFilterState(activeFilters); }
function renderArchivePage() { archiveView.render(); }
function updateArchivePaginationControls(totalItems, totalPages) { archiveView.pager(totalItems, totalPages); }
function archiveDeleted(feedbackId) { archiveView.deleted(feedbackId); } // called by feedbackDeletion.js after a delete

function clearArchiveSelection() {
    document.querySelectorAll('.archive-select-checkbox').forEach((box) => { box.checked = false; });
    updateArchiveSelectionCount();
}

// ---- Delete by date: a side panel (System Admins); the record panel closes while it is open
function openArchiveDeletePanel() {
    archiveView.close(false);
    const panel = document.getElementById('archive-delete-panel');
    panel.hidden = false;
    document.getElementById('archive-page').classList.add('ui-has-sidepanel');
    document.getElementById('archive-delete-title').focus({ preventScroll: true });
}

function closeArchiveDeletePanel(refocus = true) {
    const panel = document.getElementById('archive-delete-panel');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    if (archiveView.openId === null) document.getElementById('archive-page').classList.remove('ui-has-sidepanel');
    if (refocus) document.querySelector('#archive-deletion-controls button')?.focus({ preventScroll: true });
}

// a date typed by hand: the count shown before belongs to another date, so Preview has to run again
function archiveDeleteDateChanged() {
    document.getElementById('preview-count').hidden = true;
    document.getElementById('bulk-delete-btn').disabled = true;
    document.querySelectorAll('#bulk-delete-quick button').forEach((b) => b.classList.remove('is-set'));
}

document.addEventListener('DOMContentLoaded', () => {
    const quick = document.getElementById('bulk-delete-quick');
    if (quick) quick.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-quick]');
        if (!button) return;
        quick.querySelectorAll('button').forEach((b) => b.classList.toggle('is-set', b === button));
        setQuickDeleteDate(button.dataset.quick);
    });
});
// Esc closes Delete by date, unless the confirmation window above it is open
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const panel = document.getElementById('archive-delete-panel');
    if (!panel || panel.hidden || document.querySelector('.modal-overlay, .password-prompt-modal, dialog[open]')) return; // <Jun Kai/> a kit window (native dialog) counts too
    closeArchiveDeletePanel();
}, true);
// <Jun Kai end>

// Navigate archive pages
function prevArchivePage() {
    if (archiveCurrentPage > 1) {
        archiveView.close(false); // <Jun Kai/> the open submission is not on the next page
        archiveCurrentPage--;
        decryptedArchiveEmailMap = {};
        isAnyArchiveEmailDecrypted = false;
        renderArchivePage();
    }
}

function nextArchivePage() {
    const totalPages = Math.ceil(filteredArchiveData.length / archiveItemsPerPage);
    if (archiveCurrentPage < totalPages) {
        archiveView.close(false); // <Jun Kai/> the open submission is not on the next page
        archiveCurrentPage++;
        decryptedArchiveEmailMap = {};
        isAnyArchiveEmailDecrypted = false;
        renderArchivePage();
    }
}

