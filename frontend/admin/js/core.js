// Owner: shared. Previous team: Preti (289), Yu Kang (22), XY (Xuanyang) (20), Caeden (13), Nick (6), Bernissa (3), Nadhirah (2), Zah (1).
// Part 1/30 of the admin page: previous-team index, session timeout, 401 handling, login/logout, global state (load order in admin.html).
// ============================================================
// YU KANG — Feedback Analysis Options & LocalGPT (Done by Yu Kang)
// - Feedback analysis modes available in the admin UI:
//   * rule-based: server-side heuristic rules
//   * xenova: Xenova transformer integration (remote or local)
//   * localgpt: on-prem LocalGPT fallback for private/offline inference
// - LocalGPT note: LocalGPT runs models locally/offline to avoid external API calls
//   and preserve visitor data privacy when required.
//
// - Flagged feedback analysis:
//   * Added keyword-based flagging for potential issues (e.g. "bad", "worst", "disappointed") (Done by Yu Kang)
//   * Admin dashboard highlights flagged feedback for review (Done by Yu Kang)
//
// ============================================================
// XY CHANGE SUMMARY (DONE BY XY)
// ============================================================
//
// 1. LIVE PULSE ADMIN ACCESS
//    function openPulsePage()         - Open public Live Pulse dashboard from admin page (DONE BY XY)
//    showPage('pulse')                - Added admin Live Pulse launcher page navigation (DONE BY XY)
//
// 2. BADGE EMAIL TEMPLATE MANAGEMENT
//    const DEFAULT_BADGE_EMAIL_BADGES - Active badge fallback list for admin editor (DONE BY XY)
//    function loadBadgeEmailTemplates - Load editable badge email templates from admin API (DONE BY XY)
//    function saveBadgeEmailTemplates - Save per-badge subject, message and highlights (DONE BY XY)
//    function renderBadgeTemplateBadgeList - Render active badge picker cards (DONE BY XY)
//
// 3. ACTIVE BADGE CLEANUP
//    Badge editor list              - Shows Feedback Contributor plus 6 pledge-topic badges only (DONE BY XY)
//    Removed inactive badges         - Eco Warrior and Commitment Champion removed from editor fallback list (DONE BY XY)
//
// 4. TREE LEAF FALL PARAMETER ADMIN
//    populateParameterForm           - Load leaf fall threshold and duration into admin controls (DONE BY XY)
//    collectParameterForm            - Save leaf fall threshold and duration to tree parameters (DONE BY XY)
//
// 5. CONSENT AND PLEDGE TEXT PARAMETERS
//    populateParameterForm           - Load temporary retention days and editable pledge examples (DONE BY XY)
//    collectParameterForm            - Save contentSettings for retention duration and pledge example text (DONE BY XY)
//
// 6. DAILY LEAVES AND PLEDGES DASHBOARD
//    loadDailyLeafPledgeData          - Fetch last 6 days of leaf and pledge counts from admin API (DONE BY XY)
//    createDailyLeafPledgeChart       - Render bar/line chart comparing leaves and pledges per day (DONE BY XY)
//    setDailyLeafPledgeChartType      - Switch Daily Leaves & Pledges between bar and line chart (DONE BY XY)
//    updateDailyLeafPledgeSummary     - Render totals and daily handover summary cards (DONE BY XY)
//
// 7. PLEDGE MODERATION UI
//    renderPledgeModerationButtons    - Add Approve, Reject and Pending admin controls (DONE BY XY)
//    updatePledgeModerationStatus     - Save pledge moderation status from admin page (DONE BY XY)
//
//
// FIND COMMAND
//    rg -n "XY CHANGE SUMMARY|DONE BY XY" frontend backend
//
// CAEDEN CHANGE SUMMARY (DONE BY CAEDEN)
// ============================================================
//
// 1. PARAMETER ADJUSTMENT ADMIN BEHAVIOR
//    showPage('parameter-adjustment') - Load parameter settings when opening the admin section (DONE BY CAEDEN)
//    function loadParameters          - Fetch saved editable kiosk parameters from admin API (DONE BY CAEDEN)
//    function saveParameters          - Persist feature flags, validation rules, text, email, tree, photo and visual asset parameters (DONE BY CAEDEN)
//    function uploadParameterBackground - Upload and activate a feedback background image (DONE BY CAEDEN)
//    function resetParametersToDefaults - Restore parameter defaults from admin UI (DONE BY CAEDEN)
//    function translateAdminTextToEnglish - Translate visitor pledge and answer text to English in admin popups (Done by Caeden)
//    function runConfiguredArchiveNow - Run configurable feedback auto-archive update from admin UI (Done by Caeden)
//
// 2. DASHBOARD INTERVENTION ALERTS
//    function loadInterventionAlerts  - Fetch food waste, pledge, negative feedback and upload risk alerts for dashboard (DONE BY CAEDEN)
//    function renderInterventionAlerts - Render severity, metric and suggested staff action cards (DONE BY CAEDEN)
//    loadDashboardData                - Load chart data and intervention alerts together on dashboard refresh (DONE BY CAEDEN)
//
// FIND COMMAND
//    rg -n "DONE BY CAEDEN|CAEDEN CHANGE SUMMARY" frontend backend
// ============================================================
// NICK CHANGE SUMMARY (DONE BY NICK)
// ============================================================
//
// 1. RP XPERIENCE CENTRE JOURNEY PASSPORT
//    function loadJourneyPassport     - Fetch visitor milestone passports for repeat engagement tracking (DONE BY NICK)
//    function renderJourneyPassport   - Render passport summary, stamps, topic badges and top visitor journeys (DONE BY NICK)
//
// FIND COMMAND
//    rg -n "DONE BY NICK|NICK CHANGE SUMMARY" frontend backend
// ============================================================
// YU KANG CHANGE SUMMARY (DONE BY YU KANG)
// ============================================================
//
// 1. TREE BACKGROUND IMAGE SELECTION
//    loadAvailableTreeBackgrounds()   - Fetch and display all tree background images from ./assets/Tree/background (DONE BY YU KANG)
//    selectTreeBackground()           - Apply selected tree background and persist to visualAssets.treeBackground (DONE BY YU KANG)
//    window.selectedTreeBackground    - Global state for currently selected background image (DONE BY YU KANG)
//    param-treeBackgroundList         - UI grid picker for browsing available tree background images (DONE BY YU KANG)
//    treeBackgroundPreview            - Live preview display of selected/current tree background (DONE BY YU KANG)
//
// 2. TREE LEAF MANAGEMENT
//    uploadLeafImage()                - Upload custom leaf image to ./assets/Tree/leaf (DONE BY YU KANG)
//    adjustLeafScale()                - Adjust displayed leaf size on /tree page with scale slider (DONE BY YU KANG)
//    revertLeafImage()                - Restore previous leaf image with one-click revert button (DONE BY YU KANG)
//    loadAvailableLeafImages()        - Fetch existing leaf images from ./assets/Tree/leaf directory (DONE BY YU KANG)
//    selectExistingLeaf()             - Browse and apply existing leaf images without re-uploading (DONE BY YU KANG)
//
// 3. TREE STAGES
//    loadTreeStageSelection()          - Load tree stage dropdown for admin control (DONE BY YU KANG)
//    param-treeStage                  - UI selector for tree growth stage progression (DONE BY YU KANG)
//
// 4. AI FEEDBACK ANALYSIS
//    loadAIInsightSummary()            - Fetch AI-powered feedback analysis and insights (DONE BY YU KANG)
//    renderAIInsights()               - Display top concerns, compliments, weekly summary and admin actions (DONE BY YU KANG)
//
// 5. LOCAL AI PLEDGE SENTIMENT
//    pledge auto-approval             - Auto-approve positive and neutral pledges (DONE BY Yu Kang)
//    local transformer fallback       - Use local @xenova/transformers AI when rules are unclear (DONE BY Yu Kang)
//
//
// FIND COMMAND
//    rg -n "YU KANG CHANGE SUMMARY|DONE BY YU KANG" frontend backend
// ============================================================


// ============================================================
// ADMIN.JS - TABLE OF CONTENTS (CTRL+F SEARCHABLE)
// ============================================================
// 
// 0. SESSION TIMEOUT & AUTO-LOGOUT ENHANCEMENT (DONE BY PRETI)
//    const SESSION_TIMEOUT_MS         - Session timeout duration (30 minutes) (DONE BY PRETI)
//    const WARNING_BEFORE_TIMEOUT_MS  - Warning time before timeout (2 minutes) (DONE BY PRETI)
//    const ACTIVITY_CHECK_INTERVAL_MS - Activity check interval (1 minute) (DONE BY PRETI)
//    let lastActivityTime             - Track last user activity timestamp (DONE BY PRETI)
//    let sessionWarningShown          - Flag for session warning modal state (DONE BY PRETI)
//    let activityCheckInterval        - Interval timer for activity checks (DONE BY PRETI)
//    let sessionTimeoutModal          - Reference to timeout warning modal (DONE BY PRETI)
//    function resetActivityTimer()    - Reset activity timer on user interaction (DONE BY PRETI)
//    function initActivityTracking()  - Initialize activity event listeners (DONE BY PRETI)
//    function checkSessionTimeout()   - Check if session has timed out (DONE BY PRETI)
//    function startSessionMonitoring() - Start session timeout monitoring (DONE BY PRETI)
//    function stopSessionMonitoring() - Stop session timeout monitoring (DONE BY PRETI)
//    function showSessionWarningModal() - Show session timeout warning modal (DONE BY PRETI)
//    function updateCountdown()       - Update countdown timer in warning modal (DONE BY PRETI)
//    function closeSessionWarningModal() - Close session warning modal (DONE BY PRETI)
//    function handleSessionTimeout()  - Handle session timeout and logout (DONE BY PRETI)
//    window.fetch                     - Global fetch interceptor for 401 detection (DONE BY PRETI)
//
// 1. GLOBAL VARIABLES & STATE MANAGEMENT (DONE BY PRETI)
//    let currentDownloadType          - Track current download operation type (DONE BY PRETI)
//    let currentDeleteFeedbackId      - Track feedback ID pending deletion (DONE BY PRETI)
//    let currentEmailViewingId        - Track email ID being viewed (DONE BY PRETI)
//    let currentAuditPage             - Current audit logs pagination page (DONE BY PRETI)
//    let auditLogsPerPage             - Items per page for audit logs (DONE BY PRETI)
//    let currentSortField             - Current audit sort column (DONE BY PRETI)
//    let currentSortDirection         - Audit sort direction (DONE BY PRETI)
//    let allAuditLogs                 - Store all loaded audit logs (DONE BY PRETI)
//    let filteredAuditLogs            - Store filtered audit logs (DONE BY PRETI)
//    let allFeedbackData              - ALL not_archived records (DONE BY PRETI)
//    let filteredFeedbackData         - Filtered feedback results (DONE BY PRETI)
//    let feedbackCurrentPage          - Current feedback page (DONE BY PRETI)
//    const feedbackItemsPerPage       - Items per page for feedback (25) (DONE BY PRETI)
//    let allArchiveData               - ALL archived records (DONE BY PRETI)
//    let filteredArchiveData          - Filtered archive results (DONE BY PRETI)
//    let archiveCurrentPage           - Current archive page (DONE BY PRETI)
//    const archiveItemsPerPage        - Items per page for archive (25) (DONE BY PRETI)
//    let allPledgeboardData           - ALL pledgeboard records (DONE BY PRETI)
//    let filteredPledgeboardData      - Filtered pledgeboard results (DONE BY PRETI)
//    let pledgeboardCurrentPage       - Current pledgeboard page (DONE BY PRETI)
//    const pledgeboardItemsPerPage    - Items per page for pledgeboard (25) (DONE BY PRETI)
//    let decryptedEmailMap            - Map of decrypted emails {feedbackId: email} (DONE BY PRETI)
//    let isAnyEmailDecrypted          - Flag for feedback decryption state (DONE BY PRETI)
//    let encryptedFeedbackIds         - Array of encrypted feedback IDs (current page) (DONE BY PRETI)
//    let decryptedArchiveEmailMap     - Map of decrypted archive emails (DONE BY PRETI)
//    let isAnyArchiveEmailDecrypted   - Flag for archive decryption state (DONE BY PRETI)
//    let encryptedArchiveIds          - Array of encrypted archive IDs (current page) (DONE BY PRETI)
//    let dataExportUnlocked           - Track data export session unlock status (DONE BY PRETI)
//    let dataExportUnlockTime         - Track data export unlock timestamp (DONE BY PRETI)
//    window.questionsDataMap          - Store question data for edit functions (DONE BY PRETI)
//    function showNotification()      - Show notification message to user (DONE BY PRETI)
//
// 2. AUTHENTICATION & SESSION MANAGEMENT (DONE BY PRETI)
//    async function handleLogin()     - Admin login with API authentication (DONE BY PRETI)
//    function handleLogout()          - Log out admin user with audit logging and cleanup (DONE BY PRETI)
//    function updateUIForUser()       - Update UI based on user role (DONE BY PRETI)
//    function formatRoleName()        - Format role names for display (DONE BY PRETI)
//
// 3. AUDIT LOGS MANAGEMENT (DONE BY PRETI)
//    async function loadAuditLogs()   - Load all audit log entries (DONE BY PRETI)
//    function populateUserFilter()    - Populate user filter dropdown (DONE BY PRETI)
//    function filterAuditLogs()       - Filter logs by search, action, user, target, IP, date (DONE BY PRETI)
//    function sortFilteredLogs()      - Sort filtered logs by current sort field (DONE BY PRETI)
//    function displayAuditLogsPage()  - Display current page of filtered logs (DONE BY PRETI)
//    function updateAuditTable()      - Update audit logs table display (DONE BY PRETI)
//    <Jun Kai/> admin redesign: the table is now a list of events under a heading per day, each written as a
//    sentence (AUDIT_SENTENCES, auditSentence, auditRow); the old column sort, badge colours, filter panel and counters went
//    function updateAuditPagination() - Update pagination controls (DONE BY PRETI)
//    function prevAuditPage()         - Navigate to previous audit page (DONE BY PRETI)
//    function nextAuditPage()         - Navigate to next audit page (DONE BY PRETI)
//    function clearAllFilters()       - Reset all filters to default (DONE BY PRETI)
//    function setDateRangePreset()    - Set date range (today/week/month) (DONE BY PRETI)
//    async function downloadAuditExcel() - Download filtered logs as CSV/Excel (DONE BY PRETI)
//
// 4. DASHBOARD MANAGEMENT (DONE BY PRETI)
//    let visitorTrendsChart           - Visitor trends chart instance (DONE BY PRETI)
//    let feedbackDistributionChart    - Feedback distribution chart instance (DONE BY PRETI)
//    let currentChartRange            - Current chart time range (DONE BY PRETI)
//    async function loadDashboardData() - Load dashboard statistics and start kiosk monitoring (DONE BY PRETI)
//    function updateEnhancedDashboardStats() - Update dashboard stat cards (DONE BY PRETI)
//    async function updateSystemStatus() - Check and update System Status section (Kiosk, DB) (DONE BY PRETI)
//    function animateValue()          - Animate number value changes (DONE BY PRETI)
//    function updateLastUpdated()     - Update last updated timestamp (DONE BY PRETI)
//    function getDefaultStats()       - Get fallback statistics for offline mode (DONE BY PRETI)
//    function refreshDashboard()      - Refresh dashboard data (DONE BY PRETI)
//    async function loadChartData()   - Load chart data for dashboard (DONE BY PRETI)
//    async function loadVisitorTrendsData() - Load visitor trends chart data (DONE BY PRETI)
//    async function loadFeedbackDistributionData() - Load feedback distribution data (DONE BY PRETI)
//    function createVisitorTrendsChart() - Create visitor trends chart (DONE BY PRETI)
//    function createEmptyVisitorTrendsChart() - Create empty placeholder chart (DONE BY PRETI)
//    function createVisitorTrendsChartWithSampleData() - Create chart with sample data (DONE BY PRETI)
//    function createFeedbackDistributionChart() - Create feedback distribution chart (DONE BY PRETI)

// 5. FEEDBACK DATA MANAGEMENT (NOT_ARCHIVED) (DONE BY PRETI)
//    async function loadFeedbackData() - Load ALL feedback data (not_archived) (DONE BY PRETI)
//    function filterFeedbackData()    - Filter feedback based on all active filters (DONE BY PRETI)
//    function updateFeedbackCounts()  - Update feedback count displays (DONE BY PRETI)
//    function renderFeedbackPage()    - Render current page of feedback (25 records) (DONE BY PRETI)
//    function updateFeedbackPaginationControls() - Update feedback pagination controls (DONE BY PRETI)
//    function prevFeedbackPage()      - Navigate to previous feedback page (DONE BY PRETI)
//    function nextFeedbackPage()      - Navigate to next feedback page (DONE BY PRETI)
//    function refreshFeedbackData()   - Refresh feedback data (DONE BY PRETI)
//
// 6. ARCHIVE DATA MANAGEMENT (ARCHIVED) (DONE BY PRETI)
//    async function loadArchiveData() - Load ALL archive data (archived) (DONE BY PRETI)
//    function filterArchiveData()     - Filter archive data (DONE BY PRETI)
//    function updateArchiveCounts()   - Update archive count displays (DONE BY PRETI)
//    function renderArchivePage()     - Render current page of archive (25 records) (DONE BY PRETI)
//    function updateArchivePaginationControls() - Update archive pagination controls (DONE BY PRETI)
//    function prevArchivePage()       - Navigate to previous archive page (DONE BY PRETI)
//    function nextArchivePage()       - Navigate to next archive page (DONE BY PRETI)
//    function refreshArchiveData()    - Refresh archive data (DONE BY PRETI)
//
// 7. FILTER CONTROLS (BOTH TABS) (DONE BY PRETI)
//    function toggleFeedbackAdvancedFilters() - Toggle feedback advanced filters panel (DONE BY PRETI)
//    function setFeedbackDateRangePreset() - Set feedback date range preset (DONE BY PRETI)
//    function setArchiveDateRangePreset() - Set archive date range preset (DONE BY PRETI)
//    function clearAllFeedbackFilters() - Clear all feedback filters (DONE BY PRETI)
//    function clearAllArchiveFilters() - Clear all archive filters (DONE BY PRETI)
//
// 8. ENCRYPTION MANAGEMENT (PAGE-SPECIFIC) (DONE BY PRETI)
//    function updateEncryptionButtons() - Update feedback encryption buttons (DONE BY PRETI)
//    function updateArchiveEncryptionButtons() - Update archive encryption buttons (DONE BY PRETI)
//    async function decryptAllEmails() - Decrypt emails on current feedback page (DONE BY PRETI)
//    async function decryptAllArchiveEmails() - Decrypt emails on current archive page (DONE BY PRETI)
//    function reEncryptAllEmails()    - Re-encrypt feedback emails (DONE BY PRETI)
//    function reEncryptAllArchiveEmails() - Re-encrypt archive emails (DONE BY PRETI)
//
// 9. PLEDGE & CONTENT VIEWING (DONE BY PRETI)
//    function viewPledge()            - Display pledge content in popup (DONE BY PRETI)
//    function closePledgePopup()      - Close pledge popup (DONE BY PRETI)
//    async function viewQuestionAnswers() - Load and display question answers (DONE BY PRETI)
//    function createQuestionAnswersPopup() - Create Q&A popup interface (DONE BY PRETI)
//    function formatAnswer()          - Format answer based on question type (DONE BY PRETI)
//    function closeQAPopup()          - Close Q&A popup (DONE BY PRETI)
//
// 10. PHOTO MANAGEMENT (DONE BY PRETI)
//     async function viewRawPhoto()   - View raw photo without password (DONE BY PRETI)
//     async function viewProcessedPhoto() - View processed photo without password (DONE BY PRETI)
//     function showRawPhotoPopup()    - Show raw photo popup (DONE BY PRETI)
//     function showProcessedPhotoPopup() - Show processed photo popup (DONE BY PRETI)
//     function createPhotoPopup()     - Create photo viewing popup (DONE BY PRETI)
//     function handlePhotoError()     - Handle photo loading errors (DONE BY PRETI)
//     function downloadPhoto()        - Download photo file (DONE BY PRETI)
//     function closePhotoPopup()      - Close photo popup (DONE BY PRETI)
//
// 11. EMAIL MANAGEMENT (DONE BY PRETI)
//     function showPasswordPrompt()   - Custom password prompt with hidden input (DONE BY PRETI)
//     function showEmailPopup()       - Display decrypted email in popup (DONE BY PRETI)
//     function closeEmailModal()      - Close email modal (DONE BY PRETI)
//     function closeEmailPopup()      - Close email display popup (DONE BY PRETI)
//
// 12. OVERLAY MANAGEMENT (DONE BY PRETI)
//     async function loadOverlayData() - Load overlay themes from API (DONE BY PRETI)
//     function showOverlayMessage()   - Display overlay status message (DONE BY PRETI)
//     function createOverlaysTable()  - Placeholder for creating overlays table (DONE BY PRETI)
//     function updateOverlayTable()   - Update overlay grid display (DONE BY PRETI)
//     function viewOverlay()          - View overlay image in popup (DONE BY PRETI)
//     function closeOverlayPreview()  - Close overlay preview (DONE BY PRETI)
//     function handleOverlayImageError() - Handle overlay image loading errors (DONE BY PRETI)
//     function downloadOverlay()      - Download overlay image (DONE BY PRETI)
//     function showAddOverlayModal()  - Show add overlay modal (System Admin only) (DONE BY PRETI)
//     function closeAddOverlayModal() - Close add overlay modal (DONE BY PRETI)
//     async function handleAddOverlay() - Handle overlay creation with file upload (DONE BY PRETI)
//     async function deleteOverlay()  - Request overlay deletion (System Admin only) (DONE BY PRETI)
//     async function performOverlayDeletion() - Execute overlay deletion (DONE BY PRETI)
// 
// 13. USER MANAGEMENT (DONE BY PRETI)
//     let currentUserTab              - Track current tab ('active' or 'deleted') (DONE BY PRETI)
//     function switchUserTab()        - Switch between Active/Deleted users tabs (DONE BY PRETI)
//     async function loadUserManagementData() - Load users based on current tab (DONE BY PRETI)
//     async function loadActiveUsers() - Load active admin users (DONE BY PRETI)
//     async function loadDeletedUsers() - Load deleted admin users (DONE BY PRETI)
//     function updateActiveUsersTable() - Update active users table (DONE BY PRETI)
//     function updateDeletedUsersTable() - Update deleted users table (DONE BY PRETI)
//     function updateUserManagementTable() - Legacy wrapper for backward compatibility (DONE BY PRETI)
//     function addUser()              - Open add user modal (System Admin only) (DONE BY PRETI)
//     async function handleAddUser()  - Submit new user creation (DONE BY PRETI)
//     function closeAddUserModal()    - Close add user modal (DONE BY PRETI)
//     function editUser()             - Edit user details (System Admin only) (DONE BY PRETI)
//     async function handleEditUser() - Submit user edit changes (DONE BY PRETI)
//     function closeEditUserModal()   - Close edit user modal (DONE BY PRETI)
//     async function deleteUser()     - Request user deletion (System Admin only) (DONE BY PRETI)
//     async function performUserDeletion() - Execute user soft deletion (DONE BY PRETI)
//     async function restoreUser()    - Recover a deleted user (DONE BY PRETI)
//     async function permanentDeleteUser() - Permanently delete user (DONE BY PRETI)
//
// 14. QUESTION MANAGEMENT (DONE BY PRETI)
//     async function loadQuestionManagementData() - Load all questions from API (DONE BY PRETI)
//     function updateQuestionManagementTable() - Render question table with data (DONE BY PRETI)
//     function formatQuestionType()   - Format question type for display (DONE BY PRETI)
//     function showAddQuestionModal() - Show add question modal (DONE BY PRETI)
//     function closeAddQuestionModal() - Close add question modal (DONE BY PRETI)
//     function toggleOptionsField()   - Toggle options field visibility (DONE BY PRETI)
//     function addOptionField()       - Add option input field for multichoice/dropdown (DONE BY PRETI)
//     function removeOptionField()    - Remove option input field (DONE BY PRETI)
//     async function handleAddQuestion() - Submit new question creation (DONE BY PRETI)
//     function editQuestionById()     - Edit question by ID (DONE BY PRETI)
//     function editQuestion()         - Show edit question modal (DONE BY PRETI)
//     async function handleEditQuestion() - Submit question edit changes (DONE BY PRETI)
//     function closeEditQuestionModal() - Close edit question modal (DONE BY PRETI)
//     async function deleteQuestion() - Request question deletion (DONE BY PRETI)
//
// 15. DATA EXPORT MANAGEMENT (DONE BY PRETI)
//     function initDataExportPage()   - Initialize data export page (DONE BY PRETI)
//     async function unlockDataExport() - Verify admin password and unlock data export session (DONE BY PRETI)
//     function updateExportSessionInfo() - Update export session info display (DONE BY PRETI)
//     async function downloadExport() - Execute file download (DONE BY PRETI)
//
// 16. FEEDBACK DELETION (DONE BY PRETI)
//     async function deleteFeedback() - Delete feedback item (DONE BY PRETI)
//     async function deleteArchiveFeedback() - Delete archive feedback item (DONE BY PRETI)
//     function showDeletePasswordModal() - Show password verification modal (DONE BY PRETI)
//     async function verifyDeleteAccess() - Verify delete access with password (DONE BY PRETI)
//     async function performFeedbackDeletion() - Execute feedback deletion (DONE BY PRETI)
//     function closeDeleteModal()     - Close delete modal (DONE BY PRETI)
//
// 17. NAVIGATION & PAGE MANAGEMENT (DONE BY PRETI)
//     function showPage()             - Show selected page and hide others (DONE BY PRETI)
//     function initializeArchivePage() - Initialize archive page (DONE BY PRETI)
//
// 18. DIGITAL TREE MANAGEMENT (DONE BY PRETI)
//     async function loadDigitalTreeData() - Load digital tree data from API (DONE BY PRETI)
//     function updateDigitalTreeTable() - Update digital tree table display (DONE BY PRETI)
//     function refreshTreeData()      - Refresh tree data (DONE BY PRETI)
//     function escapeHtml()           - Escape HTML for safe display (DONE BY PRETI)
//     function saveTreeParameters()     - Save tree parameters (stage and background) (DONE BY Yu Kang)
//
// 19. UTILITY FUNCTIONS (DONE BY PRETI)
//     const style                     - Style element for dynamic CSS (DONE BY PRETI)
//
// 20. THEME SETTINGS - HELPER FUNCTIONS (DONE BY PRETI)
//     function expandSelectorPatterns() - Expand CSS selector patterns (DONE BY PRETI)
//     function expandPattern()        - Expand individual selector pattern (DONE BY PRETI)
//     function validateSelectors()    - Validate CSS selectors exist (DONE BY PRETI)
//     function suggestCorrection()    - Suggest selector correction (DONE BY PRETI)
//     function levenshteinDistance()  - Calculate string similarity (DONE BY PRETI)
//
// 21. THEME CONFIGURATION (DONE BY PRETI)
//     const themeConfig               - Theme configuration object (DONE BY PRETI)
//     function getColorOptionsForSection() - Get color options for section (DONE BY PRETI)
//     function getSelectorsForOption() - Get selectors for color option (DONE BY PRETI)
//
// 22. THEME MANAGEMENT FUNCTIONS (DONE BY PRETI)
//     let themeSettings               - Store theme settings (DONE BY PRETI)
//     let currentSection              - Track current theme section (DONE BY PRETI)
//     function initThemeSettings()    - Initialize theme settings (DONE BY PRETI)
//     function loadThemeSettings()    - Load theme settings from localStorage (DONE BY PRETI)
//     function migrateOldColors()     - Migrate old color scheme (DONE BY PRETI)
//     function getCustomDefaultColors() - Get custom default colors (DONE BY PRETI)
//     function getDefaultThemeSettings() - Get default theme settings (DONE BY PRETI)
//     function saveIndividualPageSettings() - Save individual page settings (DONE BY PRETI)
//     function loadIndividualPageSettings() - Load individual page settings (DONE BY PRETI)
//     function saveThemeSettings()    - Save theme settings to localStorage (DONE BY PRETI)
//     function showSaveMessage()      - Show save confirmation message (DONE BY PRETI)
//     function renderSectionList()    - Render theme section list (DONE BY PRETI))
//     function selectSection()        - Select theme section (DONE BY PRETI)
//     function updateSectionTitle()   - Update section title display ( DONE BY PRETI)
//     function renderThemeControls()  - Render theme control UI (DONE BY PRETI)
//     function createColorGroup()     - Create color control group (DONE BY PRETI)
//     function createColorControl()   - Create individual color control (DONE BY PRETI)
//     function updateColor()          - Update color value (DONE BY PRETI)
//     function updateColorFromHex()   - Update color from hex input (DONE BY PRETI)
//     function toggleGlobalThemeOverride() - Toggle global theme override (DONE BY PRETI)
//     function resetSectionToGlobal() - Reset section to global theme (DONE BY PRETI)
//     async function resetAllToDefaults() - Reset all settings to defaults (DONE BY PRETI)
//     function updatePreview()        - Update theme preview ((DONE BY PRETI)
//     function applyThemeSettings()   - Apply theme settings to DOM (DONE BY PRETI)
//
// 23. SAVED THEMES MANAGEMENT (DONE BY PRETI)
//     let savedThemesCache            - Cache of user's saved themes (DONE BY PRETI)
//     let currentThemeData            - Store current theme data for saving (DONE BY PRETI)
//     async function loadSavedThemes() - Load user's saved themes (DONE BY PRETI)
//     function updateSavedThemesUI()  - Update saved themes UI (DONE BY PRETI)
//     function createSavedThemeCard() - Create saved theme card element (DONE BY PRETI)
//     function extractPreviewColors() - Extract preview colors from theme (DONE BY PRETI)
//     function captureCurrentThemeData() - Capture current theme data (DONE BY PRETI)
//     async function saveCurrentTheme() - Save current theme (DONE BY PRETI)
//     function clearSaveThemeForm()   - Clear save theme form (DONE BY PRETI)
//     function applyThemeData()       - Apply theme data to settings (DONE BY PRETI)
//     async function activateSavedTheme() - Activate saved theme (DONE BY PRETI)
//     async function renameSavedTheme() - Rename saved theme (DONE BY PRETI)
//     function createRenameModal()    - Create rename modal (DONE BY PRETI)
//     async function performRename()  - Perform theme rename (DONE BY PRETI)
//     function closeRenameModal()     - Close rename modal (DONE BY PRETI)
//     async function deleteSavedTheme() - Delete saved theme (DONE BY PRETI)
//     async function refreshSavedThemes() - Refresh saved themes list (DONE BY PRETI)
//     async function loadActiveThemeOnLogin() - Load active theme on login (DONE BY PRETI)
//     function applyDefaultTheme()    - Apply default theme (DONE BY PRETI)
//     function initSavedThemesSection() - Initialize saved themes section (DONE BY PRETI)
//     function showConfirmDialog()    - Show confirmation dialog (DONE BY PRETI)
//
// 24. ARCHIVE DELETION FUNCTIONS (System Admin Only) (DONE BY PRETI)
//     function initializeDeletionControls() - Initialize deletion controls (DONE BY PRETI)
//     function toggleSelectAllArchive() - Toggle select all checkboxes (DONE BY PRETI)
//     function updateArchiveSelectionCount() - Update selection count display (DONE BY PRETI)
//     function setQuickDeleteDate()   - Set quick delete date (DONE BY PRETI)
//     async function previewBulkDelete() - Preview bulk delete operation (DONE BY PRETI)
//     async function deleteSelectedArchive() - Delete selected archive items (DONE BY PRETI)
//     async function bulkDeleteByDate() - Bulk delete by date (DONE BY PRETI)
//     function showDeletionConfirmationModal() - Show deletion confirmation modal (DONE BY PRETI)
//     function refreshArchiveData()   - Refresh archive data (DONE BY PRETI)
//
// 25. INITIALIZATION & EVENT HANDLERS
//     (Window onload and initialization code)
//
// 26. PLEDGEBOARD MANAGEMENT (DONE BY PRETI)
//     async function loadAdminPledgeboard() - Load pledgeboard data (DONE BY PRETI)
//     function filterPledgeboardData() - Filter pledgeboard data (DONE BY PRETI)
//     function clearPledgeboardSearch() - Clear pledgeboard search (DONE BY PRETI)
//     function renderPledgeboardPage() - Render pledgeboard page (DONE BY PRETI)
//     function updatePledgeboardPaginationControls() - Update pledgeboard pagination (DONE BY PRETI)
//     function prevPledgeboardPage()  - Navigate to previous pledgeboard page (DONE BY PRETI)
//     function nextPledgeboardPage()  - Navigate to next pledgeboard page (DONE BY PRETI)
//
// 27. FORM MANAGEMENT (DONE BY NADH)
//     function setFormStatus()        - Set form status message 
//     async function loadFormUISettings() - Load form UI settings 
//     async function saveFormUISettings() - Save form UI settings 
//
// 28. EMAIL MANAGEMENT (DONE BY NADH)
//     function setEmailStatus()       - Set email status message 
//     function renderEmailFields()    - Render email configuration fields 
//     async function loadEmailConfig() - Load email configuration 
//     async function saveEmailConfig() - Save email configuration 
//     async function sendTestEmail()  - Send test email 
//
// 29. TIMER COUNTDOWN MANAGEMENT (DONE BY BERNISSA)
//     const TIMER_API_URL             - Timer API endpoint 
//     function getTimerCountdownEls() - Get timer countdown UI elements 
//     async function loadTimerCountdownSetting() - Load timer countdown setting 
//     async function saveTimerCountdownSetting() - Save timer countdown setting 
//     function validateTimerCountdown() - Validate timer countdown input 
//
// 30. SERVER SCHEDULE MANAGEMENT (DONE BY BERNISSA)
//     let schedulesData               - Store schedules data 
//     let currentScheduleId           - Track current schedule ID 
//     function loadSchedules()        - Load server schedules 
//     function renderSchedulesTable() - Render schedules table 
//     function showAddScheduleModal() - Show add schedule modal 
//     function editSchedule()         - Edit schedule 
//     function validateTimes()        - Validate schedule times 
//     function saveSchedule()         - Save schedule 
//     function deleteSchedule()       - Delete schedule 
//     function toggleScheduleStatus() - Toggle schedule active status 
//     function enableAllSchedules()   - Enable all schedules 
//     function disableAllSchedules()  - Disable all schedules 
//     async function loadServerMode() - Load server control mode 
//     async function toggleServerMode() - Toggle server control mode 
//     function updateModeUI()         - Update mode UI display 
//     async function checkServerStatus() - Check server status 
//     function startServer()          - Start kiosk server 
//     function stopServer()           - Stop kiosk server 
//     function getScheduleTypeBadge() - Get schedule type badge HTML 
//     function formatDaysDisplay()    - Format days display string 
//     function updateFormFields()     - Update form fields 
//     function showNotification()     - Show notification message (duplicate) 
//     function showLoading()          - Show loading indicator 
//     function hideLoading()          - Hide loading indicator 
//     function closeModal()           - Close modal by ID 
//
// 31. VIP MANAGEMENT (DONE BY ZAH)
//     let vipData                     - Array storing VIP names 
//     const VIP_API_BASE              - VIP API base URL 
//     const VIP_API                   - API endpoint helpers for VIP operations 
//     function getVipElements()       - Get VIP UI elements 
//     function escapeHtmlSafe()       - Escape HTML for safe rendering 
//     function formatVipDate()        - Format VIP date for display 
//     async function fetchVipJson()   - Fetch helper for VIP API calls 
//     function renderVipList()        - Render VIP list UI 
//     async function loadVipData()    - Load VIPs from API 
//     function loadVipManagementData() - Loader used by showPage('vip') 
//     async function addVip()         - Add VIP name 
//
// 32. KIOSK AUTO-RELOAD ON START/STOP (DONE BY BERNISSA)
//     let lastKioskActive             - Track last kiosk active state 
//     async function watchKioskService() - Watch kiosk service and reload on state change 

// ==================== SESSION TIMEOUT & AUTO-LOGOUT ENHANCEMENT ====================
// This code adds automatic logout when session expires

// Session timeout configuration
// <Jun Kai/> the default only: the setting on User Management changes it (adminIdleMs, below). The page's own requests
// keep the server session alive, so this timer is what signs an idle admin out.
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes warning before timeout
const ACTIVITY_CHECK_INTERVAL_MS = 60 * 1000; // Check activity every minute

let lastActivityTime = Date.now();
let sessionWarningShown = false;
let activityCheckInterval = null;
let sessionTimeoutModal = null;
// <Jun Kai start> minutes without activity before signing out, from GET /api/admin/sign-in-settings (0 = never);
// the latest activity of any admin tab of this browser counts (localStorage)
let adminIdleMs = SESSION_TIMEOUT_MS;
let adminIdleCountdown = null;
let adminIdleLoadedAt = 0;
const ADMIN_ACTIVITY_KEY = 'adminLastActivity';
const ADMIN_SIGNOUT_NOTE_KEY = 'adminSignOutNote';
// <Jun Kai end>

// ==================== ACTIVITY TRACKING ====================

/**
 * Reset activity timer on user interaction
 */
function resetActivityTimer(event) {
    // <Jun Kai start> inside the notice only its buttons and Esc decide: a press on Sign out now must reach it, and
    // Tab must be able to move between the two buttons
    if (event && event.target && typeof event.target.closest === 'function' && event.target.closest('#idle-dialog')) return;
    // <Jun Kai end>
    lastActivityTime = Date.now();
    sessionWarningShown = false;
    // <Jun Kai start> other admin tabs of this browser see the activity too (written at most every 5 seconds)
    try {
        if (lastActivityTime - Number(localStorage.getItem(ADMIN_ACTIVITY_KEY) || 0) > 5000) localStorage.setItem(ADMIN_ACTIVITY_KEY, String(lastActivityTime));
    } catch { /* storage switched off: this tab counts alone */ }
    // the notice is a dialog now (it used to be the sessionTimeoutModal popup)
    closeSessionWarningModal();
    // <Jun Kai end>
}

/**
 * Track user activity events
 */
function initActivityTracking() {
    // Track various user interactions
    const events = ['mousedown', 'keypress', 'touchstart', 'click']; // not mousemove/scroll: they closed the warning modal
    events.push('keydown'); // <Jun Kai/> Tab and the arrow keys count too (keypress misses them)
    
    events.forEach(event => {
        document.addEventListener(event, resetActivityTimer, { passive: true });
    });
    
    console.log('✅ Activity tracking initialized');
}

/**
 * Check session timeout and show warning
 */
function checkSessionTimeout() {
    // Only check if user is logged in
    const loggedUser = sessionStorage.getItem('loggedUser');
    if (!loggedUser) {
        return;
    }
    // <Jun Kai start> signed in for 1 day: no idle logout, the server renews the session from the token
    if (adminRememberedUntil()) return;
    // a time a System Admin changed meanwhile reaches open pages within 5 minutes
    if (Date.now() - adminIdleLoadedAt > 5 * 60000) loadAdminIdleSetting();
    // never, when the setting is 0; another tab's activity counts; a short time gets a 1-minute notice
    if (!adminIdleMs) return;
    lastActivityTime = adminLatestActivity();
    const warnBefore = adminIdleWarnMs();
    // <Jun Kai end>

    const timeSinceLastActivity = Date.now() - lastActivityTime;
    const timeUntilTimeout = adminIdleMs - timeSinceLastActivity; // <Jun Kai/> was SESSION_TIMEOUT_MS

    // Show warning if approaching timeout
    if (timeUntilTimeout <= warnBefore && timeUntilTimeout > 0 && !sessionWarningShown) {
        showSessionWarningModal(timeUntilTimeout);
        sessionWarningShown = true;
    }
    // <Jun Kai start> activity in another tab meanwhile: the notice goes away
    if (timeUntilTimeout > warnBefore && sessionWarningShown) {
        sessionWarningShown = false;
        closeSessionWarningModal();
    }
    // <Jun Kai end>
    
    // Auto-logout if timed out
    if (timeUntilTimeout <= 0) {
        handleSessionTimeout();
    }
}

/**
 * Start session timeout monitoring
 */
function startSessionMonitoring() {
    // Reset timer
    lastActivityTime = Date.now();
    sessionWarningShown = false;
    // <Jun Kai start> a fresh page starts the count again; the minutes come from the setting on User Management
    try { localStorage.setItem(ADMIN_ACTIVITY_KEY, String(lastActivityTime)); } catch { /* storage switched off */ }
    loadAdminIdleSetting();
    // <Jun Kai end>
    
    // Clear existing interval if any
    if (activityCheckInterval) {
        clearInterval(activityCheckInterval);
    }
    
    // Start checking session timeout
    activityCheckInterval = setInterval(checkSessionTimeout, ACTIVITY_CHECK_INTERVAL_MS);
    
    console.log('✅ Session monitoring started');
}

/**
 * Stop session timeout monitoring
 */
function stopSessionMonitoring() {
    if (activityCheckInterval) {
        clearInterval(activityCheckInterval);
        activityCheckInterval = null;
    }
    
    console.log('🛑 Session monitoring stopped');
}

// ==================== SESSION TIMEOUT WARNING MODAL ====================

/**
 * Show session timeout warning modal
 */
function showSessionWarningModal(timeRemaining) {
    // <Jun Kai start> a calm dialog with a countdown in mm:ss (it replaced a popup with an emoji and the browser's
    // alert box); its buttons are Stay signed in and Sign out now (admin.html, #idle-dialog)
    const dialog = document.getElementById('idle-dialog');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    const text = document.getElementById('idle-dialog-text');
    if (text) text.textContent = `Nothing has been clicked or typed here for a while. The admin page signs out after ${adminIdleWords()} without activity.`;
    if (!dialog.dataset.bound) {
        dialog.dataset.bound = '1';
        // Esc means "I am here"
        dialog.addEventListener('cancel', (event) => { event.preventDefault(); stayAdminSignedIn(); });
    }
    if (!dialog.open) dialog.showModal();
    updateCountdown(timeRemaining);
    clearInterval(adminIdleCountdown);
    adminIdleCountdown = setInterval(() => {
        lastActivityTime = adminLatestActivity();
        const left = adminIdleMs - (Date.now() - lastActivityTime);
        if (!adminIdleMs || left > adminIdleWarnMs()) { sessionWarningShown = false; closeSessionWarningModal(); return; }
        updateCountdown(left);
        if (left <= 0) handleSessionTimeout();
    }, 1000);
    const stay = document.getElementById('idle-stay-btn');
    if (stay) stay.focus();
    // <Jun Kai end>
}

/**
 * Update countdown timer in warning modal
 */
function updateCountdown(timeRemaining) {
    // <Jun Kai start> minutes and seconds, every second
    const countdownElement = document.getElementById('idle-dialog-countdown');
    if (countdownElement) {
        const seconds = Math.max(0, Math.ceil(timeRemaining / 1000));
        countdownElement.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    // <Jun Kai end>
}

/**
 * Close session timeout warning modal
 */
function closeSessionWarningModal() {
    // <Jun Kai start>
    clearInterval(adminIdleCountdown);
    adminIdleCountdown = null;
    const dialog = document.getElementById('idle-dialog');
    if (dialog && dialog.open) dialog.close();
    // <Jun Kai end>
}

/**
 * Handle session timeout - auto logout
 */
function handleSessionTimeout() {
    console.log('⏰ Session timeout - auto logout');

    // Clear session monitoring
    stopSessionMonitoring();

    // <Jun Kai start> the login page says why, instead of a browser alert box
    closeSessionWarningModal();
    adminSignOutNote(`You were signed out after ${adminIdleWords()} without activity.`);
    // <Jun Kai end>

    // Perform logout
    handleLogout();
}

// <Jun Kai start>
// The latest activity of this tab or another admin tab of this browser
function adminLatestActivity() {
    try { return Math.max(lastActivityTime, Number(localStorage.getItem(ADMIN_ACTIVITY_KEY) || 0)); } catch { return lastActivityTime; }
}

// 2 minutes of notice, 1 minute when the time is under 10 minutes
const adminIdleWarnMs = () => (adminIdleMs >= 10 * 60000 ? WARNING_BEFORE_TIMEOUT_MS : 60000);

// "30 minutes", "1 hour", "8 hours"
function adminIdleWords() {
    const minutes = Math.round(adminIdleMs / 60000);
    if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

// Stay signed in: counts as activity, and the server session is renewed at once
function stayAdminSignedIn() {
    resetActivityTimer();
    fetch('/api/admin/keep-alive', { method: 'POST' }).catch(() => {});
}

async function loadAdminIdleSetting() {
    adminIdleLoadedAt = Date.now();
    try {
        const response = await fetch('/api/admin/sign-in-settings', { cache: 'no-store' });
        const data = await response.json();
        if (response.ok && data.success && data.settings && Number.isFinite(Number(data.settings.idleMinutes))) adminIdleMs = Number(data.settings.idleMinutes) * 60000;
    } catch { /* keeps the default 30 minutes */ }
}

// A line for the login page after the page signed out by itself; the page reloads on logout, so it waits in localStorage
function adminSignOutNote(text) {
    try { localStorage.setItem(ADMIN_SIGNOUT_NOTE_KEY, text); } catch { /* storage switched off: no line */ }
}

function showAdminSignOutNote() {
    let text = '';
    try {
        text = localStorage.getItem(ADMIN_SIGNOUT_NOTE_KEY) || '';
        localStorage.removeItem(ADMIN_SIGNOUT_NOTE_KEY);
    } catch { /* storage switched off */ }
    if (text) showLoginNote(text);
}

// The Sign-in card on User Management: the minutes for every admin (a System Admin changes them)
async function loadIdleSignOutCard() {
    const select = document.getElementById('idle-minutes');
    if (!select) return;
    select.disabled = true;
    try {
        const response = await fetch('/api/admin/sign-in-settings', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Could not load');
        const minutes = String(data.settings.idleMinutes);
        if (![...select.options].some((option) => option.value === minutes)) select.add(new Option(`${minutes} min`, minutes));
        select.value = minutes;
        select.dataset.saved = minutes;
        select.disabled = sessionStorage.getItem('userRole') !== 'system_admin';
    } catch (error) {
        showNotification(`Could not load the sign-in setting: ${error.message}`, 'error');
    }
}

async function saveIdleSignOut() {
    const select = document.getElementById('idle-minutes');
    if (!select || sessionStorage.getItem('userRole') !== 'system_admin') return;
    const minutes = Number(select.value);
    select.disabled = true;
    try {
        const response = await fetch('/api/admin/sign-in-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idleMinutes: minutes }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || 'Save failed');
        select.dataset.saved = String(minutes);
        adminIdleMs = minutes * 60000;
        showNotification(minutes ? `Admins are now signed out after ${adminIdleWords()} without activity` : 'Admins are no longer signed out for no activity', 'success');
    } catch (error) {
        if (select.dataset.saved) select.value = select.dataset.saved;
        showNotification(`Could not save: ${error.message}`, 'error');
    } finally {
        select.disabled = false;
    }
}
// <Jun Kai end>

// ==================== GLOBAL FETCH INTERCEPTOR FOR 401 DETECTION ====================

/**
 * Wrap the original fetch to detect 401 errors and auto-logout
 */
const originalFetch = window.fetch;
let sessionExpiredHandled = false;
window.fetch = function(...args) {
    return originalFetch.apply(this, args)
        .then(response => {
            // Only the auth middleware's 401 means the session is gone. Password checks (decrypt,
            // data export, archive delete) also answer 401 and must not log the admin out.
            if (response.status === 401 && sessionStorage.getItem('loggedUser') && !sessionExpiredHandled) {
                response.clone().json().catch(() => null).then(body => {
                    if (!body || body.error !== 'Authentication required' || sessionExpiredHandled) return;
                    sessionExpiredHandled = true;
                    console.log('🔒 401 Unauthorized detected - session expired');
                    setTimeout(() => {
                        // <Jun Kai start> the login page says it, instead of a browser alert box
                        adminSignOutNote('Your session ended. Please sign in again.');
                        // <Jun Kai end>
                        handleLogout();
                    }, 100);
                });
            }
            return response;
        });
};

// ==================== ENHANCED LOGIN/LOGOUT FUNCTIONS ====================

/**
 * Enhanced handleLogin - start session monitoring after successful login
 * This wraps around the existing handleLogin function
 */
const originalHandleLogin = window.handleLogin;
if (originalHandleLogin) {
    window.handleLogin = async function(event) {
        const result = await originalHandleLogin.call(this, event);
        
        // If login was successful, start session monitoring
        if (sessionStorage.getItem('loggedUser')) {
            initActivityTracking();
            startSessionMonitoring();
        }
        
        return result;
    };
} else {
    console.warn('⚠️ Original handleLogin not found - session monitoring may not start automatically');
}

/**
 * Enhanced handleLogout - stop session monitoring on logout
 * This wraps around the existing handleLogout function
 */
const originalHandleLogout = window.handleLogout;
if (originalHandleLogout) {
    window.handleLogout = function() {
        stopSessionMonitoring();
        closeSessionWarningModal();
        originalHandleLogout.call(this);
    };
} else {
    console.warn('⚠️ Original handleLogout not found');
}

// ==================== SESSION TIMEOUT INITIALIZATION ====================

/**
 * Initialize session timeout on page load if user is already logged in
 */
window.addEventListener('DOMContentLoaded', () => {
    const loggedUser = sessionStorage.getItem('loggedUser');
    if (loggedUser) {
        console.log('🔐 User already logged in, starting session monitoring...');
        initActivityTracking();
        startSessionMonitoring();
    }
});

console.log('✅ Session timeout & auto-logout enhancement loaded');

// ==================== 1. GLOBAL VARIABLES & STATE MANAGEMENT ====================

// Download modals
let currentDownloadType = null;

// Feedback deletion tracking
let currentDeleteFeedbackId = null;

// Email viewing
let currentEmailViewingId = null;

// Audit logs pagination and filtering
let currentAuditPage = 1;
let auditLogsPerPage = 50;
let currentSortField = 'created_at';
let currentSortDirection = 'desc';
let allAuditLogs = [];
let filteredAuditLogs = [];

// Lost and found reports - changes made by nick
let allLostFoundReports = [];
let filteredLostFoundReports = [];
let nickUsageAnalytics = null; // Nick feature usage analytics cache (DONE BY NICK)

// Global variables for feedback (not_archived)
let allFeedbackData = []; // ALL not_archived records
let filteredFeedbackData = []; // Filtered results
let feedbackCurrentPage = 1;
const feedbackItemsPerPage = 25;

// Global variables for archive (archived)
let allArchiveData = []; // ALL archived records
let filteredArchiveData = []; // Filtered results
let archiveCurrentPage = 1;
const archiveItemsPerPage = 25;

// Decryption state (per-page only)

// Global variables for pledgeboard
let allPledgeboardData = []; // ALL pledgeboard records
let filteredPledgeboardData = []; // Filtered results
let pledgeboardCurrentPage = 1;
const pledgeboardItemsPerPage = 25;
let decryptedEmailMap = {}; // {feedbackId: decryptedEmail}
let isAnyEmailDecrypted = false;
let encryptedFeedbackIds = [];

// Archive decryption state (separate)
let decryptedArchiveEmailMap = {};
let isAnyArchiveEmailDecrypted = false;
let encryptedArchiveIds = [];

// Data export session
let dataExportUnlocked = false;
let dataExportUnlockTime = null;


// Question management - store question data to avoid JSON.stringify issues in onclick
window.questionsDataMap = new Map();


// ==================== 2. AUTHENTICATION & SESSION MANAGEMENT ====================

// Handle login
async function handleLogin(event) {
    console.log('Login function called');
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    console.log('Username:', username, 'Password:', password ? '***' : 'empty');
    
    if (!username || !password) {
        // <Jun Kai start> on the card instead of a browser popup
        showLoginNote('Enter your username and password.', 'error');
        document.getElementById(username ? 'password' : 'username').focus();
        // <Jun Kai end>
        return;
    }
    
    // <Jun Kai start> one sign-in at a time; an old message goes away
    showLoginNote('');
    const submitButton = document.querySelector('#login-form button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    // <Jun Kai end>
    try {
        console.log('Attempting API login...');
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // <Jun Kai start>
            body: JSON.stringify({ username, password, remember: !!(document.getElementById('remember-me') || {}).checked })
            // <Jun Kai end>
        });
        
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success) {
            console.log('✅ Login successful');
            // <Jun Kai start> the same steps as a remembered sign-in (finishAdminSignIn, below)
            await finishAdminSignIn(data.user, data.rememberUntil || null);
            // <Jun Kai end>
        } else {
            console.log('❌ Login failed:', data.error);
            // <Jun Kai start> on the card instead of a browser popup; the password is cleared, ready to type again
            showLoginNote(data.error || 'Invalid username or password', 'error');
            const passwordField = document.getElementById('password');
            passwordField.value = '';
            passwordField.focus();
            // <Jun Kai end>
        }
    } catch (error) {
        console.error('❌ Login error:', error);
        // <Jun Kai start>
        showLoginNote('Could not reach the server. Check the connection and try again.', 'error');
        // <Jun Kai end>
    }
    // <Jun Kai start>
    finally {
        if (submitButton) submitButton.disabled = false;
    }
    // <Jun Kai end>
}

// <Jun Kai start>
// After a good login or a remembered sign-in: the user, the theme, the dashboard. rememberUntil: ISO time or null.
async function finishAdminSignIn(user, rememberUntil) {
    sessionStorage.setItem('loggedUser', user.username);
    sessionStorage.setItem('userRole', user.role);
    if (rememberUntil) {
        sessionStorage.setItem('rememberedUntil', rememberUntil);
        try { localStorage.setItem('adminRememberHint', JSON.stringify({ username: user.username, until: rememberUntil })); } catch { /* private window: fine */ }
    } else {
        sessionStorage.removeItem('rememberedUntil');
        clearAdminRememberHint();
    }
    await loadActiveThemeOnLogin();
    setTimeout(() => { loadActiveThemeOnLogin(); }, 500);
    updateUIForUser(user.username, user.role);
    await loadDashboardData();
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    // the count of incidents that need a look, next to Incidents in the sidebar (incidents.js)
    if (typeof refreshIncidentsBadge === 'function') refreshIncidentsBadge(true);
    openAdminLinkTarget();
}

// A link to the admin page that ends with #schedule-history (the page that opens after the PC was off has one) goes
// to the History of the Server Schedule page once the admin is signed in. The mark is taken off the address after.
const ADMIN_HISTORY_LINK = '#schedule-history';
function openAdminLinkTarget() {
    if (location.hash !== ADMIN_HISTORY_LINK) return;
    history.replaceState(null, '', location.pathname + location.search);
    if (typeof showPage !== 'function' || typeof openScheduleHistory !== 'function') return;
    showPage('server-schedule');
    openScheduleHistory();
}

// the time "keep me signed in" ends in this tab, or null
function adminRememberedUntil() {
    const until = Date.parse(sessionStorage.getItem('rememberedUntil') || '');
    return Number.isFinite(until) && until > Date.now() ? until : null;
}

// This browser asked to stay signed in: { username, until } (no password, the token itself is an httpOnly cookie)
function adminRememberHint() {
    try {
        const hint = JSON.parse(localStorage.getItem('adminRememberHint') || 'null');
        return hint && hint.username && Date.parse(hint.until) > Date.now() ? hint : null;
    } catch {
        return null;
    }
}

function clearAdminRememberHint() {
    try { localStorage.removeItem('adminRememberHint'); } catch { /* private window: fine */ }
}

// kind 'error': a failed sign-in, in a red box; it goes away as soon as a field is typed in
function showLoginNote(text, kind) {
    const note = document.getElementById('login-note');
    if (!note) return;
    note.textContent = text || '';
    note.hidden = !text;
    note.classList.toggle('login-note-error', kind === 'error');
    note.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const form = document.getElementById('login-form');
    if (kind === 'error' && form && !form.dataset.noteClears) {
        form.dataset.noteClears = '1';
        form.addEventListener('input', () => { if (note.classList.contains('login-note-error')) showLoginNote(''); });
    }
}

// On page load without a signed-in tab: when this browser chose "keep me signed in", the server's token decides
async function tryRememberedSignIn() {
    const hint = adminRememberHint();
    if (!hint) return;
    showLoginNote(`Signing you in as ${hint.username}`);
    try {
        const response = await fetch('/api/admin/remember', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Not signed in');
        await finishAdminSignIn(data.user, data.rememberUntil || hint.until);
        showLoginNote('');
        initActivityTracking();
        startSessionMonitoring();
    } catch (error) {
        clearAdminRememberHint();
        const username = document.getElementById('username');
        if (username && !username.value) username.value = hint.username;
        showLoginNote('Your 1-day sign-in has ended. Enter your password to sign in again.');
        const password = document.getElementById('password');
        if (password) password.focus();
    }
}

function toggleLoginPassword() {
    const input = document.getElementById('password');
    const button = document.getElementById('login-eye');
    if (!input || !button) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(show));
    button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    button.title = show ? 'Hide password' : 'Show password';
    input.focus();
}
// <Jun Kai end>

// Handle logout
function handleLogout() {
    const username = sessionStorage.getItem('loggedUser');
    
    // Log the logout
    fetch('/api/admin/logout-audit', {
        method: 'POST',
        keepalive: true,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username: username })
    }).catch(() => {});
    
    sessionStorage.clear();
    // <Jun Kai start> signing out also forgets "keep me signed in" here (the server deletes the token)
    clearAdminRememberHint();
    // <Jun Kai end>

    // Reload page to ensure clean state for next login
    window.location.reload();
}

// Update UI for user role
function updateUIForUser(username, role) {
    // Update user info in header
    document.getElementById('logged-username').textContent = username;
    document.getElementById('logged-role').textContent = formatRoleName(role);
    document.querySelector('.user-avatar').textContent = username[0].toUpperCase();
    
    // Dashboard: always visible for ALL roles
    const mainSection = document.getElementById('main-section');
    if (mainSection) {
        mainSection.style.display = 'block';
    }

    // <Jun Kai start> The sidebar is grouped by task since the redesign, so there is no ADMINISTRATION section to
    // hide any more. Each link that only a System Admin may open is marked data-admin-only in admin.html, and
    // sidebar.js takes those links out of the groups and out of the page search for IT staff and IT admins.
    if (typeof applySidebarRole === 'function') applySidebarRole(role);
    // <Jun Kai end>

    // Show/hide ONLY decrypt/download buttons based on role
    // Filter buttons should be visible for ALL roles
    const decryptButtons = document.querySelectorAll('#decrypt-emails-btn, #re-encrypt-btn, #decrypt-archive-emails-btn, #re-encrypt-archive-btn');
    if (role === 'system_admin') {
        decryptButtons.forEach(btn => btn.style.display = 'inline-block');
    } else {
        decryptButtons.forEach(btn => btn.style.display = 'none');
    }

    // If current page is an admin page and user is not system admin, redirect to dashboard
    const currentPage = document.querySelector('.page.active');
    if (currentPage && !currentPage.id.includes('dashboard') && role !== 'system_admin') {
        showPage('dashboard');
    }
}

// Format role name for display
