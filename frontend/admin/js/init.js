// Owner: shared. Previous team: none marked.
// Part 20/30 of the admin page: initialisation, event handlers, utilities (load order in admin.html).
// ==================== 25. INITIALIZATION & EVENT HANDLERS ====================

// Check if user is already logged in
window.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, checking login status...');
    // <Jun Kai start> a link from a password reset email ("#reset=<token>") opens the new password step before
    // anything else, also in a tab that is signed in: the reset is for the account in the email (passwordReset.js)
    if (typeof takePasswordResetToken === 'function') {
        const resetToken = takePasswordResetToken();
        if (resetToken !== null) { startPasswordResetFromLink(resetToken); return; }
    }
    // <Jun Kai end>
    const loggedUser = sessionStorage.getItem('loggedUser');
    if (loggedUser) {
        console.log('User already logged in:', loggedUser);
        const userRole = sessionStorage.getItem('userRole');
        updateUIForUser(loggedUser, userRole);
        
        // Load user's theme settings on page load
        console.log('🎨 Loading user theme settings...');
        
        // Load theme from localStorage
        if (typeof loadThemeSettings === 'function') {
            loadThemeSettings();
        }
        
        // Load individual page settings
        if (typeof loadIndividualPageSettings === 'function') {
            loadIndividualPageSettings();
        }
        
        // Apply the theme
        if (typeof applyThemeSettings === 'function') {
            applyThemeSettings();
            console.log('✅ User theme applied on page load');
        }
        
        // Load dashboard data
        loadDashboardData();

        // Initialize the tree stage preview so the current leaf count is shown
        // when the admin tree settings section is available on the page.
        if (document.getElementById('currentLeafCount')) {
            initTreeStageMode();
            updateAutoStagePreview();
        }
        
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('admin-dashboard').style.display = 'block';
        // <Jun Kai start> the count of incidents that need a look, next to Incidents in the sidebar
        if (typeof refreshIncidentsBadge === 'function') refreshIncidentsBadge(true);
        // a link that asks for the History of the Server Schedule (core.js)
        openAdminLinkTarget();
        // <Jun Kai end>
    } else {
        console.log('No user logged in');
        // <Jun Kai start> why the page signed out by itself, if it did (core.js), then a remembered sign-in
        showAdminSignOutNote();
        const loginNote = document.getElementById('login-note');
        if (location.hash === ADMIN_HISTORY_LINK && loginNote && loginNote.hidden) showLoginNote('Sign in to open the History of Operating Hours.');
        tryRememberedSignIn();
        // <Jun Kai end>
    }
});

// ==================== 19. UTILITY FUNCTIONS ====================

// Add spinner animation CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

