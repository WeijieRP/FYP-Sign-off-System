// Owner: Role 3, Jun Kai. Previous team: Caeden (1).
// Part 5/30 of the admin page: feedback data table and sorting (load order in admin.html).
// ==================== 5. FEEDBACK DATA MANAGEMENT (NOT_ARCHIVED) ====================


// Load ALL feedback data (archive_status = 'not_archived')
async function loadFeedbackData() {
    try {
        console.log('📊 Loading feedback data (not_archived)...');
        
        const response = await fetch('/api/admin/feedback', {
            headers: {
                'x-username': sessionStorage.getItem('loggedUser')
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            allFeedbackData = data.feedback || [];
            feedbackCurrentPage = 1;
            
            console.log(`✅ Loaded ${allFeedbackData.length} feedback records`);
            
            // Reset decryption
            decryptedEmailMap = {};
            isAnyEmailDecrypted = false;
            
            // Apply filters
            filterFeedbackData();
        } else {
            throw new Error(data.error || 'Failed to load feedback data');
        }
    } catch (error) {
        console.error('❌ Error loading feedback:', error);
        
        // Show error in table
        const tbody = document.getElementById('feedback-table-body');
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
        
        updateFeedbackPaginationControls(0, 0);
    }
}

// ── Singapore-time helpers ──────────────────────────────────────────────────
// SGT = UTC+8. All date-picker values are plain "YYYY-MM-DD" strings.
// These functions convert date-picker strings into UTC epoch timestamps
// corresponding to the START or END of that calendar day in Singapore.
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;   // 8 hours in ms

/**
 * Get current Singapore date components
 * @returns {Object} { year, month (0-based), day, dayOfWeek (0=Sun, 1=Mon...) }
 */
function getSGTDateComponents() {
    const sgt = new Date(Date.now() + SGT_OFFSET_MS);
    return {
        year: sgt.getUTCFullYear(),
        month: sgt.getUTCMonth(),      // 0-based
        day: sgt.getUTCDate(),
        dayOfWeek: sgt.getUTCDay()     // 0=Sunday, 1=Monday, etc.
    };
}

/**
 * Convert YYYY-MM-DD string to start of day in SGT (returned as UTC Date)
 * midnight SGT = previous-day 16:00 UTC
 */
function startOfDaySGT(dateStr) {
    return new Date(new Date(dateStr + 'T00:00:00Z').getTime() - SGT_OFFSET_MS);
}

/**
 * Convert YYYY-MM-DD string to end of day in SGT (returned as UTC Date)
 * 23:59:59.999 SGT = same-day 15:59:59.999 UTC
 */
function endOfDaySGT(dateStr) {
    return new Date(new Date(dateStr + 'T23:59:59.999Z').getTime() - SGT_OFFSET_MS);
}

/**
 * Format a shifted-SGT Date object to YYYY-MM-DD string
 */
function formatDateToSGTString(sgtDate) {
    return sgtDate.getUTCFullYear() + '-' +
           String(sgtDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
           String(sgtDate.getUTCDate()).padStart(2, '0');
}
// ────────────────────────────────────────────────────────────────────────────

// Filter feedback data based on all active filters
function filterFeedbackData() {
    const searchTerm = document.getElementById('feedback-search-input')?.value.toLowerCase() || '';
    const dateFrom = document.getElementById('feedback-filter-date-from')?.value || '';
    const dateTo = document.getElementById('feedback-filter-date-to')?.value || '';
    const emailFilter = document.getElementById('feedback-filter-email')?.value || '';
    const visitsFilter = document.getElementById('feedback-filter-visits')?.value || '';
    const retentionFilter = document.getElementById('feedback-filter-retention')?.value || '';
    
    // Count active filters
    let activeFiltersCount = 0;
    if (searchTerm) activeFiltersCount++;
    if (dateFrom || dateTo) activeFiltersCount++;
    if (emailFilter) activeFiltersCount++;
    if (visitsFilter) activeFiltersCount++;
    if (retentionFilter) activeFiltersCount++;
    
    // Filter ALL data
    filteredFeedbackData = allFeedbackData.filter(item => {
        let matches = true;
        
        // Global search filter
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
        
        // Date range filter — boundaries computed in Singapore time
        if (dateFrom || dateTo) {
            const itemDate = new Date(item.date);
            if (dateFrom) {
                matches = matches && itemDate >= startOfDaySGT(dateFrom);
            }
            if (dateTo) {
                matches = matches && itemDate <= endOfDaySGT(dateTo);
            }
        }
        
        // Email filter proper detection
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
        
        // Visits filter
        if (visitsFilter) {
            const visits = parseInt(item.visits) || 0;
            if (visitsFilter === '6+') {
                matches = matches && visits >= 6;
            } else {
                matches = matches && visits === parseInt(visitsFilter);
            }
        }
        
        // Data retention filter - Handle both formats
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
    updateFeedbackCounts(allFeedbackData.length, filteredFeedbackData.length, activeFiltersCount);

    // Keep the column sort the admin chose
    if (feedbackSortColumn) {
        filteredFeedbackData.sort((a, b) => compareValues(a[feedbackSortColumn], b[feedbackSortColumn], feedbackSortColumn));
        if (!feedbackSortAsc) filteredFeedbackData.reverse();
    }
    
    // Reset to page 1
    feedbackCurrentPage = 1;
    
    // Reset decryption when filters change
    decryptedEmailMap = {};
    isAnyEmailDecrypted = false;
    
    // Render filtered data
    renderFeedbackPage();
}

// <Jun Kai start>
// The Feedback page since the admin redesign (Feedback A). The rows, the pager and the side panel are drawn by
// submissionList.js, which the Archived Feedback page uses too; this file keeps loading, filtering and sorting.
const feedbackView = makeSubmissionList({
    key: 'feedback', name: 'feedbackView', pageId: 'feedback-data-page', columns: 8, perPage: feedbackItemsPerPage,
    all: () => allFeedbackData, setAll: (rows) => { allFeedbackData = rows; },
    list: () => filteredFeedbackData, setList: (rows) => { filteredFeedbackData = rows; },
    page: () => feedbackCurrentPage, setPage: (number) => { feedbackCurrentPage = number; },
    decrypted: () => decryptedEmailMap,
    resetDecrypted: () => { decryptedEmailMap = {}; isAnyEmailDecrypted = false; },
    markDecrypted: (id, email) => { decryptedEmailMap[id] = email; isAnyEmailDecrypted = true; },
    setEncryptedIds: (ids) => { encryptedFeedbackIds = ids; },
    updateButtons: () => updateEncryptionButtons(),
    remove: (id) => deleteFeedback(id),
    refilter: () => filterFeedbackData(),
    clearFilters: 'clearAllFeedbackFilters()',
    emptyText: 'No feedback yet. A submission shows here as soon as a visitor sends one.',
    filteredText: 'No submission matches these filters.',
});
function updateFeedbackCounts(total, filtered, activeFilters) { feedbackView.showFilterState(activeFilters); }
function clearFeedbackDateRange() { feedbackView.clearDates(); }
function renderFeedbackPage() { feedbackView.render(); }
function updateFeedbackPaginationControls(totalItems, totalPages) { feedbackView.pager(totalItems, totalPages); }
function feedbackDeleted(feedbackId) { feedbackView.deleted(feedbackId); } // called by feedbackDeletion.js after a delete
// <Jun Kai end>

// Show the user's typed feedback directly in the admin feedback table. (DONE BY CAEDEN)
function getFeedbackAnswerPreview(feedback) {
    const answers = Array.isArray(feedback.question_answers) ? feedback.question_answers : [];
    const textAnswers = answers
        .filter(answer => answer && String(answer.answer_value || '').trim() !== '')
        .filter(answer => String(answer.question_type || '').toLowerCase() === 'text')
        .map(answer => String(answer.answer_value).trim());

    const values = textAnswers.length > 0
        ? textAnswers
        : answers
            .filter(answer => answer && String(answer.answer_value || answer.option_label || '').trim() !== '')
            .map(answer => String(answer.option_label || answer.answer_value).trim());

    if (values.length === 0) {
        return null;
    }

    const preview = values.join(' | ');
    return preview.length > 120 ? `${preview.slice(0, 117)}...` : preview;
}

// Navigate to previous page
function prevFeedbackPage() {
    if (feedbackCurrentPage > 1) {
        feedbackView.close(false); // <Jun Kai/> the open submission is not on the next page
        feedbackCurrentPage--;
        decryptedEmailMap = {}; // Reset decryption
        isAnyEmailDecrypted = false;
        renderFeedbackPage();
    }
}

// Navigate to next page
function nextFeedbackPage() {
    const totalPages = Math.ceil(filteredFeedbackData.length / feedbackItemsPerPage);
    if (feedbackCurrentPage < totalPages) {
        feedbackView.close(false); // <Jun Kai/> the open submission is not on the next page
        feedbackCurrentPage++;
        decryptedEmailMap = {}; // Reset decryption
        isAnyEmailDecrypted = false;
        renderFeedbackPage();
    }
}

// Refresh feedback data
function refreshFeedbackData() {
    loadFeedbackData();
}

// ==================== 5b. SORTING (FEEDBACK & ARCHIVE) ====================

let feedbackSortColumn = null;
let feedbackSortAsc = true;
let archiveSortColumn = null;
let archiveSortAsc = true;

// Map HTML column keys to the actual data property names returned by the API
const sortKeyMap = {
    name: 'name',
    email: 'email_encrypted',
    total_visits: 'visits',
    data_retention: 'data_retention',
    data_retention_days: 'data_retention',
    created_at: 'date'
};

function sortFeedbackData(columnKey) {
    const field = sortKeyMap[columnKey] || columnKey;

    if (feedbackSortColumn === field) {
        feedbackSortAsc = !feedbackSortAsc;
    } else {
        feedbackSortColumn = field;
        feedbackSortAsc = true;
    }

    // Update sort indicator arrows
    document.querySelectorAll('[id^="feedback-sort-"]').forEach(el => el.textContent = '');
    const indicator = document.getElementById('feedback-sort-' + columnKey);
    if (indicator) indicator.textContent = feedbackSortAsc ? ' ▲' : ' ▼';

    filteredFeedbackData.sort((a, b) => compareValues(a[field], b[field], field));
    if (!feedbackSortAsc) filteredFeedbackData.reverse();

    feedbackCurrentPage = 1;
    renderFeedbackPage();
}

function sortArchiveData(columnKey) {
    const field = sortKeyMap[columnKey] || columnKey;

    if (archiveSortColumn === field) {
        archiveSortAsc = !archiveSortAsc;
    } else {
        archiveSortColumn = field;
        archiveSortAsc = true;
    }

    document.querySelectorAll('[id^="archive-sort-"]').forEach(el => el.textContent = '');
    const indicator = document.getElementById('archive-sort-' + columnKey);
    if (indicator) indicator.textContent = archiveSortAsc ? ' ▲' : ' ▼';

    filteredArchiveData.sort((a, b) => compareValues(a[field], b[field], field));
    if (!archiveSortAsc) filteredArchiveData.reverse();

    archiveCurrentPage = 1;
    renderArchivePage();
}

function compareValues(a, b, field) {
    // Nulls always sort to the end
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;

    // Date fields: compare as timestamps
    if (field === 'date') return new Date(a) - new Date(b);

    // Numeric fields: compare as numbers
    if (field === 'visits') return Number(a) - Number(b);

    // Everything else: case-insensitive string compare
    return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
}

