// Owner: Role 3, Jun Kai. Previous team: none marked.
// Part 7/30 of the admin page: filter controls for the feedback and archive tabs (load order in admin.html).
// ==================== 7. FILTER CONTROLS (BOTH TABS) ====================

function setFeedbackDateRangePreset(preset) {
    const fromInput = document.getElementById('feedback-filter-date-from');
    const toInput = document.getElementById('feedback-filter-date-to');
    if (!fromInput || !toInput) return;

    // Get current SGT date components
    const { year: y, month: m, day: d, dayOfWeek: dow } = getSGTDateComponents();
    
    // Create a shifted-SGT Date for today
    const sgtToday = new Date(Date.now() + SGT_OFFSET_MS);
    const todayStr = formatDateToSGTString(sgtToday);

    let fromStr;
    
    if (preset === 'today') {
        // Today only
        fromStr = todayStr;
        
    } else if (preset === 'week') {
        // FIXED: Current calendar week (Monday to Sunday) in SGT
        // dow: 0=Sun, 1=Mon, 2=Tue, ... 6=Sat
        // Calculate days since Monday:
        // If today is Sunday (dow=0), days since Monday = 6
        // Otherwise, days since Monday = dow - 1
        const daysSinceMonday = dow === 0 ? 6 : dow - 1;
        
        // Go back to Monday of this week
        const mondayDate = new Date(Date.UTC(y, m, d - daysSinceMonday));
        fromStr = formatDateToSGTString(mondayDate);
        
    } else if (preset === 'month') {
        // From 1st of current month to today
        fromStr = y + '-' + String(m + 1).padStart(2, '0') + '-01';
    }

    fromInput.value = fromStr;
    toInput.value = todayStr;
    filterFeedbackData();
}

function setArchiveDateRangePreset(preset) {
    const fromInput = document.getElementById('archive-filter-date-from');
    const toInput = document.getElementById('archive-filter-date-to');
    if (!fromInput || !toInput) return;

    // Get current SGT date components
    const { year: y, month: m, day: d, dayOfWeek: dow } = getSGTDateComponents();
    
    // Create a shifted-SGT Date for today
    const sgtToday = new Date(Date.now() + SGT_OFFSET_MS);
    const todayStr = formatDateToSGTString(sgtToday);

    let fromStr;
    
    if (preset === 'today') {
        // Today only
        fromStr = todayStr;
        
    } else if (preset === 'week') {
        // FIXED: Current calendar week (Monday to Sunday) in SGT
        const daysSinceMonday = dow === 0 ? 6 : dow - 1;
        const mondayDate = new Date(Date.UTC(y, m, d - daysSinceMonday));
        fromStr = formatDateToSGTString(mondayDate);
        
    } else if (preset === 'month') {
        // From 1st of current month to today
        fromStr = y + '-' + String(m + 1).padStart(2, '0') + '-01';
    }

    fromInput.value = fromStr;
    toInput.value = todayStr;
    filterArchiveData();
}

function clearAllFeedbackFilters() {
    ['feedback-search-input', 'feedback-filter-date-from', 'feedback-filter-date-to',
     'feedback-filter-email', 'feedback-filter-visits', 'feedback-filter-retention'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    feedbackCurrentPage = 1;
    filterFeedbackData();
}

function clearAllArchiveFilters() {
    ['archive-search-input', 'archive-filter-date-from', 'archive-filter-date-to',
     'archive-filter-email', 'archive-filter-visits', 'archive-filter-retention'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    archiveCurrentPage = 1;
    filterArchiveData();
}

