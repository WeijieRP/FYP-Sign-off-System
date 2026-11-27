// Owner: Role 3, Jun Kai. Previous team: none marked.
// Part 21/30 of the admin page: theme settings and saved themes (load order in admin.html).
// ==================== 20. THEME SETTINGS - HELPER FUNCTIONS ====================

// Expands pattern selectors into actual selector arrays
// Patterns support:
// - '*-page' → matches all elements with IDs ending in '-page'
// - 'page-*' → matches all elements with IDs starting with 'page-'
// - '*-page .class' → matches pattern IDs with descendant selectors

function expandSelectorPatterns(config) {
    if (!config) return [];
    
    // If it's already an array, return it
    if (Array.isArray(config)) {
        return config;
    }
    
    // If it's an object with pattern/explicit structure
    const result = [];
    
    // Add explicit selectors first
    if (config.explicit && Array.isArray(config.explicit)) {
        result.push(...config.explicit);
    }
    
    // Expand auto patterns
    if (config.auto && Array.isArray(config.auto)) {
        config.auto.forEach(pattern => {
            const expanded = expandPattern(pattern);
            result.push(...expanded);
        });
    }
    
    return result;
}

// Expands a single pattern into matching selectors
function expandPattern(pattern) {
    const pageIds = [
        'dashboard-page',
        'feedback-data-page',
        'digital-tree-page',
        'pulse-page',
        'overlay-page',
        'questions-page',
        'users-page',
        'badge-email-templates-page',
        'archive-page',
        'audit-page',
        'lost-found-page',
        'data-export-page',
        'theme-settings-page'
    ];
    
    // Handle '*-page' pattern
    if (pattern === '*-page') {
        return pageIds.map(id => `#${id}`);
    }
    
    // Handle '*-page descendant' pattern (e.g., '*-page .page-header h2')
    const descendantMatch = pattern.match(/^\*-page\s+(.+)$/);
    if (descendantMatch) {
        const descendant = descendantMatch[1];
        return pageIds.map(id => `#${id} ${descendant}`);
    }
    
    // Handle '*-page-specific' pattern (e.g., '*-page-specific .section-header h3')
    const specificMatch = pattern.match(/^\*-page-specific\s+(.+)$/);
    if (specificMatch) {
        const descendant = specificMatch[1];
        // Exclude login-page and admin-dashboard from page-specific patterns
        const specificPages = pageIds.filter(id => id !== 'login-page');
        return specificPages.map(id => `#${id} ${descendant}`);
    }
    
    // If no pattern matches, return the original
    return [pattern];
}

// Validates that selectors actually exist in the DOM
function validateSelectors(selectorMapping) {
    const results = {
        total: 0,
        found: 0,
        missing: [],
        suggestions: []
    };
    
    // Collect all selectors
    const allSelectors = new Set();
    
    Object.keys(selectorMapping).forEach(sectionId => {
        const section = selectorMapping[sectionId];
        Object.keys(section).forEach(category => {
            Object.keys(section[category]).forEach(optionId => {
                const config = section[category][optionId];
                const selectors = expandSelectorPatterns(config);
                selectors.forEach(sel => allSelectors.add(sel));
            });
        });
    });
    
    // Test each unique selector
    allSelectors.forEach(selector => {
        results.total++;
        
        try {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                results.found++;
            } else {
                results.missing.push(selector);
                
                // Try to suggest corrections for common typos
                const suggestion = suggestCorrection(selector, allSelectors);
                if (suggestion) {
                    results.suggestions.push({
                        selector: selector,
                        suggestion: suggestion
                    });
                }
            }
        } catch (e) {
            // Invalid selector syntax
            results.missing.push(selector);
            console.error(`Invalid selector syntax: ${selector}`, e);
        }
    });
    
    return results;
}

// Suggests corrections for typos in selectors
function suggestCorrection(selector, allSelectors) {
    // Simple Levenshtein distance for suggestions
    const candidates = Array.from(allSelectors).filter(s => s !== selector);
    
    let bestMatch = null;
    let bestDistance = Infinity;
    
    candidates.forEach(candidate => {
        const distance = levenshteinDistance(selector, candidate);
        if (distance < bestDistance && distance <= 3) {
            bestDistance = distance;
            bestMatch = candidate;
        }
    });
    
    return bestMatch;
}

// Simple Levenshtein distance algorithm
function levenshteinDistance(a, b) {
    const matrix = [];
    
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[b.length][a.length];
}

// ==================== 21. THEME CONFIGURATION ====================

const themeConfig = {
    sections: [
        { id: 'saved-themes', name: 'Saved Themes', icon: '💾', isSavedThemes: true }, 
        { id: 'global', name: 'Admin Overall Theme', icon: '🌐', isGlobal: true },
        { id: 'admin-dashboard', name: 'Admin Panel (Header + Sidebar)', icon: '⚙️' },
        { id: 'dashboard-page', name: 'Dashboard', icon: '📊' },
        { id: 'feedback-data-page', name: 'Feedback', icon: '💬' },
        { id: 'digital-tree-page', name: 'Tree Leaves', icon: '🌳' },
        { id: 'pledgeboard-page', name: 'Pledgeboard', icon: '🏆' },
        { id: 'pulse-page', name: 'Live Pulse', icon: 'LIVE' },
        { id: 'overlay-page', name: 'Photo Overlays', icon: '🎨', requiredRole: 'system_admin' },
        { id: 'questions-page', name: 'Questions', icon: '❓', requiredRole: 'system_admin' },
        { id: 'users-page', name: 'Users', icon: '👥', requiredRole: 'system_admin' },
        { id: 'vip-page', name: 'VIPs', icon: '👑', requiredRole: 'system_admin' },
        { id: 'email-management-page', name: 'Mail Account', icon: '📧', requiredRole: 'system_admin' },
        { id: 'badge-email-templates-page', name: 'Badge Emails', icon: 'Mail', requiredRole: 'system_admin' },
        { id: 'form-management-page', name: 'Start Screen Text', icon: '📝', requiredRole: 'system_admin' },
        // <Jun Kai start>
        { id: 'archive-page', name: 'Archived Feedback', icon: '📚', requiredRole: 'system_admin' },
        // <Jun Kai end>
        { id: 'audit-page', name: 'Audit Logs', icon: '📋', requiredRole: 'system_admin' },
        { id: 'data-export-page', name: 'Data Export', icon: '📦', requiredRole: 'system_admin' },
        { id: 'timer-countdown-page', name: 'Photo Timer', icon: '🕔', requiredRole: 'system_admin' },
        { id: 'server-schedule-page', name: 'Operating Hours', icon: '❗', requiredRole: 'system_admin' },
        { id: 'theme-settings-page', name: 'Style & Theme', icon: '🎨' }
    ],
    
    // Selector mapping grouped
    selectorMapping: {
        // GLOBAL THEME - Affects ALL pages and elements
        'global': {
            general: {
                'page-background': {
                    auto: ['*-page'],
                    explicit: [
                        'body',
                        '.page-content'
                    ]
                },
                'primary-text': {
                    auto: ['*-page .page-header h2'],
                    explicit: [
                        '.section-header h3',
                        '.page-header h2',
                        // <Jun Kai/> not inside the redesigned cards: they keep the kit colours until the theme maps onto them
                        ':is(h1, h2, h3):not(.ui-card *)',
                        '#admin-dashboard .header-left h1',
                        '#admin-dashboard .username'
                    ]
                },
                'secondary-text': {
                    auto: ['*-page .page-header p'],
                    explicit: [
                        '.page-header p',
                        'p:not(.ui-card *)', // <Jun Kai/> not inside the redesigned cards (see the headings above)
                        '.description',
                        '.subtitle',
                        '#admin-dashboard .header-left p',
                        '#admin-dashboard .user-role'
                    ]
                }
            },
            header: {
                'admin-header-bg': ['#admin-dashboard .admin-header'],
                'primary-header-text': ['#admin-dashboard .header-left h1', '#admin-dashboard .username', '#admin-dashboard .theme-toggle'], // <Jun Kai/> the Light / Dark button follows the header text
                'secondary-header-text': ['#admin-dashboard .header-left p', '#admin-dashboard .user-role']
            },
            navbar: {
                'navbar-background': ['#admin-dashboard .sidebar'],
                'navbar-primary-text': ['#admin-dashboard .sidebar-section h3'],
                'navbar-secondary-text': ['#admin-dashboard .nav-item'],
                'navbar-active-selection': ['#admin-dashboard .nav-item.active'],
                'navbar-hover': ['#admin-dashboard .nav-item:hover']
            },
            card: {
                'card-background': {
                    explicit: [
                        '#dashboard-page .stat-card',
                        '#dashboard-page .activity-section',
                        '#feedback-data-page .feedback-section',
                        '#digital-tree-page .tree-section',
                        '#overlay-page .overlay-section',
                        '#questions-page .user-section',
                        '#users-page .user-section',
                        '#archive-page .feedback-section',
                        '#audit-page .audit-section',
                        '#data-export-page .password-panel-card',
                        '#data-export-page .export-card',
                        '#theme-settings-page .theme-section-list',
                        '#theme-settings-page .preview-card',
                        '.card',
                        '.stat-card',
                        '.info-card',
                        '.data-card'
                    ]
                },
                'card-header-background': {
                    explicit: ['#theme-settings-page .theme-sidebar-header', '#theme-settings-page .theme-panel-header']
                },
                'card-border-color': {
                    explicit: [
                        '#dashboard-page .stat-card',
                        '#dashboard-page .activity-section',
                        '.card',
                        '.stat-card',
                        '.info-card'
                    ]
                },
                'card-primary-text': {
                    auto: ['*-page-specific .section-header h3'],
                    explicit: [
                        '#dashboard-page .stat-value',
                        '#dashboard-page .stat-label',
                        '#dashboard-page .last-updated',
                        '#data-export-page .password-panel-card h2',
                        '#data-export-page .form-group label',
                        '#data-export-page .export-card-title',
                        '#data-export-page .export-card-description',
                        '#data-export-page .export-card-meta',
                        '#theme-settings-page .theme-sidebar-header h3',
                        '#theme-settings-page .preview-card h5',
                        '.card h3',
                        '.card h4',
                        '.card h5',
                        '.section-header h3'
                    ]
                },
                'card-secondary-text': {
                    explicit: [
                        '#data-export-page .panel-subtitle',
                        '#theme-settings-page .preview-card p',
                        '#theme-settings-page .theme-section-item',
                        '.card p',
                        '.card-description',
                        '.card-meta'
                    ]
                },
                'card-item-hover-bg': {
                    explicit: ['#theme-settings-page .theme-section-item:hover']
                },
                'card-item-hover-text': {
                    explicit: ['#theme-settings-page .theme-section-item:hover']
                },
                'card-item-active-bg': {
                    explicit: ['#theme-settings-page .theme-section-item.active']
                },
                'card-item-active-text': {
                    explicit: ['#theme-settings-page .theme-section-item.active']
                }
            },
            buttons: {
                'button-color': {
                    auto: ['*-page .btn-primary', '*-page .btn-secondary'],
                    explicit: [
                        '#admin-dashboard .logout-btn',
                        '#dashboard-page .refresh-btn',
                        '#feedback-data-page .btn-warning',
                        '#feedback-data-page .btn-view',
                        '#overlay-page .btn-view-overlay',
                        '#questions-page .btn-edit',
                        '#users-page .btn-edit',
                        '#archive-page .btn-warning',
                        '#archive-page .btn-view',
                        '#data-export-page .export-btn',
                        '#theme-settings-page .preview-btn-primary',
                        '.btn-primary',
                        'button.btn-primary',
                        '.btn-secondary',
                        'button.btn-secondary',
                        '.btn-warning',
                        '.btn-view',
                        '.btn-edit',
                        '.btn-view-overlay',
                        '.login-btn',
                        '.logout-btn',
                        '.refresh-btn',
                        '.export-btn'
                    ]
                },
                'button-text-color': {
                    auto: ['*-page .btn-primary', '*-page .btn-secondary'],
                    explicit: [
                        '#admin-dashboard .logout-btn',
                        '#dashboard-page .refresh-btn',
                        '#feedback-data-page .btn-warning',
                        '#feedback-data-page .btn-view',
                        '#overlay-page .btn-view-overlay',
                        '#questions-page .btn-edit',
                        '#users-page .btn-edit',
                        '#archive-page .btn-warning',
                        '#archive-page .btn-view',
                        '#data-export-page .export-btn',
                        '#theme-settings-page .preview-btn-primary',
                        '.btn-primary',
                        'button.btn-primary',
                        '.btn-secondary',
                        'button.btn-secondary',
                        '.btn-warning',
                        '.btn-view',
                        '.btn-edit',
                        '.btn-view-overlay',
                        '.login-btn',
                        '.logout-btn',
                        '.refresh-btn',
                        '.export-btn'
                    ]
                }
            },
            badges: {
                'badge-7days-background': {
                    explicit: [
                        '#feedback-data-page .badge-warning',
                        '#archive-page .badge-warning',
                        '.badge-warning'
                    ]
                },
                'badge-7days-text': {
                    explicit: [
                        '#feedback-data-page .badge-warning',
                        '#archive-page .badge-warning',
                        '.badge-warning'
                    ]
                },
                'badge-longterm-background': {
                    explicit: [
                        '#feedback-data-page .badge-permanent',
                        '#archive-page .badge-permanent',
                        '.badge-permanent'
                    ]
                },
                'badge-longterm-text': {
                    explicit: [
                        '#feedback-data-page .badge-permanent',
                        '#archive-page .badge-permanent',
                        '.badge-permanent'
                    ]
                }
            },
        },
        'admin-dashboard': {
            header: {
                'admin-header-bg': ['#admin-dashboard .admin-header'],
                'primary-header-text': ['#admin-dashboard .header-left h1', '#admin-dashboard .username', '#admin-dashboard .theme-toggle'], // <Jun Kai/> the Light / Dark button follows the header text
                'secondary-header-text': ['#admin-dashboard .header-left p', '#admin-dashboard .user-role']
            },
            navbar: {
                'navbar-background': ['#admin-dashboard .sidebar'],
                'navbar-primary-text': ['#admin-dashboard .sidebar-section h3'],
                'navbar-secondary-text': ['#admin-dashboard .nav-item'],
                'navbar-active-selection': ['#admin-dashboard .nav-item.active'],
                'navbar-hover': ['#admin-dashboard .nav-item:hover']
            },
            buttons: {
                'button-color': ['#admin-dashboard .logout-btn'],
                'button-text-color': ['#admin-dashboard .logout-btn']
            }
        },
        
        'dashboard-page': {
            general: {
                'page-background': ['#dashboard-page'],
                'primary-text': ['#dashboard-page .page-header h2'],
                'secondary-text': ['#dashboard-page .page-header p']
            },
            card: {
                'card-background': [
                    '#dashboard-page .metric-card',
                    '#dashboard-page .chart-card',
                    '#dashboard-page .status-card',
                    '#dashboard-page .quick-actions-card'
                ],
                'card-primary-text': [
                    '#dashboard-page .metric-value',
                    '#dashboard-page .metric-label',
                    '#dashboard-page .chart-header h3',
                    '#dashboard-page .status-header h3',
                    '#dashboard-page .quick-actions-header h3'
                ],
                'card-secondary-text': [
                    '#dashboard-page .metric-subtitle',
                    '#dashboard-page .chart-subtitle',
                    '#dashboard-page .quick-actions-header p'
                ]
            },
            buttons: {
                'button-color': [
                    '#dashboard-page .btn-primary',
                    '#dashboard-page .refresh-btn',
                    '#dashboard-page .quick-action-btn'
                ],
                'button-text-color': [
                    '#dashboard-page .btn-primary',
                    '#dashboard-page .refresh-btn',
                    '#dashboard-page .quick-action-btn'
                ]
            }
        },
        
        'feedback-data-page': {
            general: {
                'page-background': ['#feedback-data-page'],
                'primary-text': ['#feedback-data-page .page-header h2'],
                'secondary-text': ['#feedback-data-page .page-header p']
            },
            card: {
                'card-background': ['#feedback-data-page .feedback-section'],
                'card-primary-text': ['#feedback-data-page .section-header h3']
            },
            buttons: {
                'button-color': [
                    '#feedback-data-page .btn-primary',
                    '#feedback-data-page .btn-secondary',
                    '#feedback-data-page .btn-warning',
                    '#feedback-data-page .btn-view'
                ],
                'button-text-color': [
                    '#feedback-data-page .btn-primary',
                    '#feedback-data-page .btn-secondary',
                    '#feedback-data-page .btn-warning',
                    '#feedback-data-page .btn-view'
                ]
            },
            badges: {
                'badge-7days-background': ['#feedback-data-page .badge-warning'],
                'badge-7days-text': ['#feedback-data-page .badge-warning'],
                'badge-longterm-background': ['#feedback-data-page .badge-permanent'],
                'badge-longterm-text': ['#feedback-data-page .badge-permanent']
            }
        },
        
        'digital-tree-page': {
            general: {
                'page-background': ['#digital-tree-page'],
                'primary-text': ['#digital-tree-page .page-header h2'],
                'secondary-text': ['#digital-tree-page .page-header p']
            },
            card: {
                'card-background': ['#digital-tree-page .tree-section'],
                'card-primary-text': ['#digital-tree-page .section-header h3']
            },
            buttons: {
                'button-color': ['#digital-tree-page .btn-primary'],
                'button-text-color': ['#digital-tree-page .btn-primary']
            }
        },
        
        'overlay-page': {
            general: {
                'page-background': ['#overlay-page'],
                'primary-text': ['#overlay-page .page-header h2'],
                'secondary-text': ['#overlay-page .page-header p']
            },
            card: {
                'card-background': ['#overlay-page .overlay-section'],
                'card-primary-text': ['#overlay-page .section-header h3']
            },
            buttons: {
                'button-color': ['#overlay-page .btn-primary', '#overlay-page .btn-view-overlay'],
                'button-text-color': ['#overlay-page .btn-primary', '#overlay-page .btn-view-overlay']
            }
        },
        
        'questions-page': {
            general: {
                'page-background': ['#questions-page'],
                'primary-text': ['#questions-page .page-header h2'],
                'secondary-text': ['#questions-page .page-header p']
            },
            card: {
                'card-background': ['#questions-page .user-section'],
                'card-primary-text': ['#questions-page .section-header h3']
            },
            buttons: {
                'button-color': ['#questions-page .btn-primary', '#questions-page .btn-edit'],
                'button-text-color': ['#questions-page .btn-primary', '#questions-page .btn-edit']
            }
        },
        
        'users-page': {
            general: {
                'page-background': ['#users-page'],
                'primary-text': ['#users-page .page-header h2'],
                'secondary-text': ['#users-page .page-header p']
            },
            card: {
                'card-background': ['#users-page .user-section'],
                'card-primary-text': ['#users-page .section-header h3']
            },
            buttons: {
                'button-color': ['#users-page .btn-primary', '#users-page .btn-edit'],
                'button-text-color': ['#users-page .btn-primary', '#users-page .btn-edit']
            }
        },
        
        'vip-page': {
            general: {
                'page-background': ['#vip-page'],
                'primary-text': ['#vip-page .page-header h2'],
                'secondary-text': ['#vip-page .page-header p']
            },
            card: {
                'card-background': ['#vip-page .vip-card'],
                'card-primary-text': ['#vip-page .vip-card-header h3'],
                'card-secondary-text': ['#vip-page .vip-subtext']
            },
            buttons: {
                'button-color': ['#vip-page .vip-add-btn', '#vip-page .btn-primary'],
                'button-text-color': ['#vip-page .vip-add-btn', '#vip-page .btn-primary']
            }
        },
        
        // <Jun Kai start>  (the page now uses the admin UI kit classes)
        'email-management-page': {
            // <Jun Kai/> the card keys are empty like the other rebuilt pages: the kit colours stay until the theme is mapped onto the new look
            general: {
                'page-background': ['#email-management-page'],
                'primary-text': ['#email-management-page .ui-page-header h2'],
                'secondary-text': ['#email-management-page .ui-page-header p']
            },
            card: {
                'card-background': [],
                'card-primary-text': [],
                'card-secondary-text': []
            },
            buttons: {
                // the page's own button colour is for the outlined buttons: Save keeps the primary colour of the whole admin
                'button-color': [],
                'button-text-color': []
            }
        },
        // <Jun Kai end>
        
        'form-management-page': {
            general: {
                'page-background': ['#form-management-page'],
                'primary-text': ['#form-management-page .page-header h2'],
                'secondary-text': ['#form-management-page .page-header p']
            },
            card: {
                'card-background': ['#form-management-page .overlay-section', '#form-management-page .user-section'],
                'card-primary-text': ['#form-management-page .section-header h3'],
                'card-secondary-text': []
            },
            buttons: {
                'button-color': ['#form-management-page .btn-primary', '#form-management-page .btn-secondary'],
                'button-text-color': ['#form-management-page .btn-primary', '#form-management-page .btn-secondary']
            }
        },
        
        'archive-page': {
            general: {
                'page-background': ['#archive-page'],
                'primary-text': ['#archive-page .page-header h2'],
                'secondary-text': ['#archive-page .page-header p']
            },
            card: {
                'card-background': ['#archive-page .feedback-section'],
                'card-primary-text': ['#archive-page .section-header h3']
            },
            buttons: {
                'button-color': [
                    '#archive-page .btn-secondary',
                    '#archive-page .btn-primary',
                    '#archive-page .btn-warning',
                    '#archive-page .btn-view'
                ],
                'button-text-color': [
                    '#archive-page .btn-secondary',
                    '#archive-page .btn-primary',
                    '#archive-page .btn-warning',
                    '#archive-page .btn-view'
                ]
            },
            badges: {
                'badge-7days-background': ['#archive-page .badge-warning'],
                'badge-7days-text': ['#archive-page .badge-warning'],
                'badge-longterm-background': ['#archive-page .badge-permanent'],
                'badge-longterm-text': ['#archive-page .badge-permanent']
            }
        },
        
        'audit-page': {
            general: {
                'page-background': ['#audit-page'],
                'primary-text': ['#audit-page .page-header h2'],
                'secondary-text': ['#audit-page .page-header p']
            },
            card: {
                'card-background': ['#audit-page .audit-section'],
                'card-primary-text': ['#audit-page .section-header h3']
            },
            buttons: {
                'button-color': ['#audit-page .btn-secondary', '#audit-page .btn-primary'],
                'button-text-color': ['#audit-page .btn-secondary', '#audit-page .btn-primary']
            }
        },
        
        'data-export-page': {
            login: {
                'data-export-login-background': ['#data-export-page'],
                'data-export-login-card-background': ['#data-export-page .password-panel-card'],
                'data-export-login-card-primary-text': ['#data-export-page .password-panel-card h2'],
                'data-export-login-card-secondary-text': ['#data-export-page .panel-subtitle'],
                'data-export-login-button-color': ['#data-export-page .password-panel-card .btn-primary'],
                'data-export-login-button-text-color': ['#data-export-page .password-panel-card .btn-primary']
            },
            general: {
                'page-background': ['#data-export-page'],
                'primary-text': ['#data-export-page .page-header h2'],
                'secondary-text': ['#data-export-page .page-header p', '#data-export-page .panel-subtitle']
            },
            card: {
                'card-background': [
                    '#data-export-page .export-card',
                    '.data-export-cards .export-card',
                    '.export-card'
                ],
                'card-primary-text': [
                    '#data-export-page .export-card-title',
                    '.data-export-cards .export-card-title',
                    '.export-card-title'
                ],
                'card-secondary-text': [
                    '#data-export-page .export-card-description',
                    '#data-export-page .export-card-meta',
                    '.data-export-cards .export-card-description',
                    '.data-export-cards .export-card-meta',
                    '.export-card-description',
                    '.export-card-meta'
                ]
            },
            buttons: {
                'button-color': ['#data-export-page .export-btn'],
                'button-text-color': ['#data-export-page .export-btn']
            }
        },
        
        'timer-countdown-page': {
            general: {
                'page-background': ['#timer-countdown-page'],
                'primary-text': ['#timer-countdown-page .page-header h2'],
                'secondary-text': ['#timer-countdown-page .page-header p']
            },
            card: {
                'card-background': ['#timer-countdown-page .timer-countdown-section'],
                'card-primary-text': ['#timer-countdown-page .section-header h3'],
                'card-secondary-text': ['#timer-countdown-page .filter-label', '#timer-countdown-page .text-muted']
            },
            buttons: {
                'button-color': ['#timer-countdown-page .btn-primary'],
                'button-text-color': ['#timer-countdown-page .btn-primary']
            }
        },
        
        'server-schedule-page': {
            general: {
                'page-background': ['#server-schedule-page'],
                'primary-text': ['#server-schedule-page .page-header h2'],
                'secondary-text': ['#server-schedule-page .page-header p']
            },
            card: {
                'card-background': ['#server-schedule-page .schedule-section'],
                'card-primary-text': ['#server-schedule-page .section-header h3'],
                'card-secondary-text': []
            },
            buttons: {
                'button-color': ['#server-schedule-page .btn-primary', '#server-schedule-page .btn-secondary'],
                'button-text-color': ['#server-schedule-page .btn-primary', '#server-schedule-page .btn-secondary']
            }
        },
        
        // <Jun Kai/> Style & Theme B: these keys still name the old classes, like the other redesigned pages, so they match
        // nothing and the new cards keep the kit colours (and dark mode) until the theme is mapped onto the kit. The three
        // old classes that the new page reuses (.theme-settings-form, .theme-group-title, .theme-preview) were taken out
        // here and in the overall lists, so a dark card colour never paints the editor behind its dark text
        'theme-settings-page': {
            general: {
                'page-background': ['#theme-settings-page'],
                'primary-text': ['#theme-settings-page .page-header h2'],
                'secondary-text': ['#theme-settings-page .page-header p']
            },
            card: {
                'card-header-background': ['#theme-settings-page .theme-sidebar-header', '#theme-settings-page .theme-panel-header'],
                'card-background': ['#theme-settings-page .theme-section-list', '#theme-settings-page .preview-card'],
                'card-item-hover-bg': ['#theme-settings-page .theme-section-item:hover'],
                'card-item-hover-text': ['#theme-settings-page .theme-section-item:hover'],
                'card-item-active-bg': ['#theme-settings-page .theme-section-item.active'],
                'card-item-active-text': ['#theme-settings-page .theme-section-item.active'],
                'card-item-active': ['#theme-settings-page .theme-section-item.active'],
                'card-primary-text': ['#theme-settings-page .theme-sidebar-header h3', '#theme-settings-page .preview-card h5', '#theme-settings-page .theme-panel-header h3'],
                'card-secondary-text': [
                    '#theme-settings-page .preview-card p',
                    '#theme-settings-page .theme-section-item'
                ],
            },
            buttons: {
                'button-color': [
                    '#theme-settings-page .btn-primary',
                    '#theme-settings-page .btn-secondary',
                    '#theme-settings-page .preview-btn-primary',
                    '#theme-settings-page .preview-btn-secondary'
                ],
                'button-text-color': [
                    '#theme-settings-page .btn-primary',
                    '#theme-settings-page .btn-secondary',
                    '#theme-settings-page .preview-btn-primary',
                    '#theme-settings-page .preview-btn-secondary'
                ]
            }
        },
        'saved-themes': {
            general: {
                'primary-text': ['#saved-themes-panel h3', '#saved-themes-panel h4'],
                'secondary-text': ['#saved-themes-panel p']
            },
            cards: {
                'card-header-background': ['.saved-theme-header']
            }
        }
    },
    
    // color options groupings
    colorOptions: {
        general: [
            { id: 'page-background', label: 'Page Background', default: '#f1f5f9', description: 'Main page background color' },
            { id: 'primary-text', label: 'Primary Text', default: '#1e293b', description: 'Main headings and important text' },
            { id: 'secondary-text', label: 'Secondary Text', default: '#64748b', description: 'Descriptions and secondary text' }
        ],
        header: [
            { id: 'admin-header-bg', label: 'Admin Header Background', default: '#ffffff', description: 'Background for admin panel header' },
            { id: 'primary-header-text', label: 'Header Primary Text', default: '#1e293b', description: 'Main text in admin header' },
            { id: 'secondary-header-text', label: 'Header Secondary Text', default: '#64748b', description: 'Secondary text in admin header' }
        ],
        navbar: [
            { id: 'navbar-background', label: 'Navbar Background', default: '#000738', description: 'Background color for sidebar navigation' },
            { id: 'navbar-primary-text', label: 'Navbar Section Headers', default: '#94a3b8', description: 'Color for navbar section headers' },
            { id: 'navbar-secondary-text', label: 'Navbar Items', default: '#475569', description: 'Color for navbar menu items' },
            { id: 'navbar-active-selection', label: 'Navbar Active Item', default: '#ede9fe', description: 'Background for active navbar item' },
            { id: 'navbar-hover', label: 'Navbar Hover', default: '#f1f5f9', description: 'Background for navbar item hover' }
        ],
        card: [
            { id: 'card-background', label: 'Card Background', default: '#ffffff', description: 'Background for cards and panels' },
            { id: 'card-header-background', label: 'Card Header Background', default: '#f8fafc', description: 'Background for card headers' },
            { id: 'card-border-color', label: 'Card Border', default: '#e2e8f0', description: 'Border color for cards' },
            { id: 'card-primary-text', label: 'Card Primary Text', default: '#1e293b', description: 'Card titles and headings' },
            { id: 'card-secondary-text', label: 'Card Body Text', default: '#64748b', description: 'Card descriptions and labels' },
            { id: 'card-third-text', label: 'Card Tertiary Text', default: '#94a3b8', description: 'Card hints and helper text' },
            { id: 'card-item-hover-bg', label: 'Card Item Hover Background', default: '#f1f5f9', description: 'Hover background for card items' },
            { id: 'card-item-hover-text', label: 'Card Item Hover Text', default: '#64748b', description: 'Hover text color for card items' },
            { id: 'card-item-active-bg', label: 'Card Item Active Background', default: '#ede9fe', description: 'Active state background for card items' },
            { id: 'card-item-active-text', label: 'Card Item Active Text', default: '#7c3aed', description: 'Active state text color for card items' }
        ],
            
        buttons: [
            { id: 'button-color', label: 'Button Background', default: '#0a1e81', description: 'Background color for buttons' },
            { id: 'button-text-color', label: 'Button Text', default: '#ffffff', description: 'Text color for buttons' }
        ],
        badges: [
            { id: 'badge-7days-background', label: '7-Day Retention Badge BG', default: '#9E0000', description: 'Background for 7-day retention badges' },
            { id: 'badge-7days-text', label: '7-Day Retention Badge Text', default: '#ffffffff', description: 'Text color for 7-day retention badges' },
            { id: 'badge-longterm-background', label: 'Long-Term Retention Badge BG', default: '#15803D', /* <Jun Kai/> was #2EAD00: white text on it read only 3:1 */ description: 'Background for long-term retention badges' },
            { id: 'badge-longterm-text', label: 'Long-Term Retention Badge Text', default: '#ffffffff', description: 'Text color for long-term retention badges' }
        ],
        // slider: [
        //     { id: 'card-slider-color', label: 'Toggle Slider Color', default: '#cbd5e1', description: 'Color for toggle switches' }
        // ],
        login: [
            { id: 'login-background', label: 'Login Panel Background', default: '#ffffffff', description: 'Background for the login/password panel' },
            { id: 'login-card-background', label: 'Login Card Background', default: '#ffffff', description: 'Background for the login card' },
            { id: 'login-card-primary-text', label: 'Login Card Text', default: '#1e293b', description: 'Text color for login card headings' },
            { id: 'login-card-secondary-text', label: 'Login Card Subtitle', default: '#64748b', description: 'Text color for login card subtitle' },
            { id: 'login-button-color', label: 'Login Button Color', default: '#0a1e81', description: 'Background color for login button' },
            { id: 'login-button-text-color', label: 'Login Button Text Color', default: '#ffffff', description: 'Text color for login button' }
        ]
    }
};

// Get color options available for a section
function getColorOptionsForSection(sectionId) {
    const options = [];
    const mapping = themeConfig.selectorMapping[sectionId];
    
    if (!mapping) return options;
    
    // Extract unique option IDs from the mapping
    Object.keys(mapping).forEach(category => {
        Object.keys(mapping[category]).forEach(optionId => {
            // Find the option definition
            let optionDef = null;
            
            // Search in all color option categories
            Object.keys(themeConfig.colorOptions).forEach(categoryKey => {
                const found = themeConfig.colorOptions[categoryKey].find(opt => opt.id === optionId);
                if (found) {
                    optionDef = { ...found, category: categoryKey };
                }
            });
            
            if (optionDef && !options.find(o => o.id === optionId)) {
                options.push(optionDef);
            }
        });
    });
    
    return options;
}

// Get expanded selectors for a specific color option in a section
function getSelectorsForOption(sectionId, optionId) {
    const mapping = themeConfig.selectorMapping[sectionId];
    if (!mapping) return [];
    
    // Search through all categories
    for (const category of Object.keys(mapping)) {
        if (mapping[category][optionId]) {
            return expandSelectorPatterns(mapping[category][optionId]);
        }
    }
    
    return [];
}

// ==================== 22. THEME MANAGEMENT FUNCTIONS ====================

// Store theme settings (loads from localStorage)
let themeSettings = {};
let currentSection = 'global';

// Initialize theme settings page
function initThemeSettings() {
    loadThemeSettings();
    // <Jun Kai/> the stored colours are loaded again, so changes that were not saved are gone and so is their mark
    themeMarkUnsaved(false);
    themeSay('');
    renderSectionList();
    selectSection('global');
    applyThemeSettings();
    initSavedThemesSection();
    
    // Run validation after a short delay to ensure DOM is ready
    setTimeout(() => {
        const validationResults = validateSelectors(themeConfig.selectorMapping);
        console.log('🎨 Theme Validation Results:');
        console.log(`   ✅ ${validationResults.found}/${validationResults.total} selectors found in DOM`);
        
        if (validationResults.missing.length > 0) {
            console.warn(`   ⚠️  ${validationResults.missing.length} selectors not found:`);
            validationResults.missing.forEach(sel => console.warn(`      - ${sel}`));
        }
        
        if (validationResults.suggestions.length > 0) {
            console.log('   💡 Suggestions:');
            validationResults.suggestions.forEach(s => {
                console.log(`      "${s.selector}" → Did you mean "${s.suggestion}"?`);
            });
        }
        
        if (validationResults.missing.length === 0) {
            console.log('   ✨ All selectors validated successfully!');
        }
    }, 1000);
}

// Load theme settings from localStorage (USER-SPECIFIC)
function loadThemeSettings() {
    // Get current user ID from session
    const currentUserId = sessionStorage.getItem('userId') || 
                         sessionStorage.getItem('loggedUser');
    
    if (!currentUserId) {
        console.log('⚠️ No user logged in - using default theme');
        themeSettings = getDefaultThemeSettings();
        return;
    }
    
    // Create user-specific localStorage key
    const storageKey = `adminThemeSettings_user_${currentUserId}`;
    const saved = localStorage.getItem(storageKey);
    
    if (saved) {
        try {
            themeSettings = JSON.parse(saved);
            migrateOldColors();
            console.log(`✅ Loaded theme settings for user ${currentUserId}`);
        } catch (e) {
            console.error('Failed to parse theme settings:', e);
            themeSettings = getDefaultThemeSettings();
        }
    } else {
        console.log(`ℹ️ No saved settings for user ${currentUserId} - using defaults`);
        themeSettings = getDefaultThemeSettings();
    }
}

// Migrate old color values to new defaults
function migrateOldColors() {
    const colorMigrations = {
        '#7c3aed': '#0a1e81',
        '#0A1E81': '#0a1e81'
    };
    
    Object.keys(themeSettings).forEach(sectionId => {
        if (themeSettings[sectionId] && themeSettings[sectionId].colors) {
            const colors = themeSettings[sectionId].colors;
            
            Object.keys(colors).forEach(optionId => {
                const currentColor = colors[optionId];
                
                if (colorMigrations[currentColor]) {
                    colors[optionId] = colorMigrations[currentColor];
                    console.log(`Migrated ${sectionId}.${optionId}: ${currentColor} → ${colorMigrations[currentColor]}`);
                }
            });
        }
    });
    
    // Save with user-specific key
    const currentUserId = sessionStorage.getItem('userId') || 
                         sessionStorage.getItem('loggedUser');
    if (currentUserId) {
        const storageKey = `adminThemeSettings_user_${currentUserId}`;
        localStorage.setItem(storageKey, JSON.stringify(themeSettings));
    }
}

// <Jun Kai start>
// The frame of the admin page (top bar and sidebar) is frosted glass since the redesign. The frame colours of a theme
// tint that glass: admin.css mixes the two background colours with the page behind them, and the rest are used as
// they are. THEME_GLASS_FRAME is the default set (light glass, dark text).
const THEME_GLASS_FRAME = {
    'admin-header-bg': '#ffffff',
    'primary-header-text': '#0f172a',
    'secondary-header-text': '#64748b',
    'navbar-background': '#ffffff',
    'navbar-primary-text': '#64748b',
    'navbar-secondary-text': '#334155',
    'navbar-active-selection': '#fffffff2',
    'navbar-hover': '#ffffff99'
};
// The default frame before the redesign (dark bar, dark sidebar, light text)
const THEME_OLD_FRAME = {
    'admin-header-bg': '#262626',
    'primary-header-text': '#ffffff',
    'secondary-header-text': '#b0b0b0',
    'navbar-background': '#16181d',
    'navbar-primary-text': '#808080',
    'navbar-secondary-text': '#a0a0a0',
    'navbar-active-selection': '#2a2d3a',
    'navbar-hover': '#1f2229'
};
// the colour of the page under the colour wash: pale grey now, plain white before
const THEME_GLASS_PAGE = '#f3f6fa';
const THEME_OLD_PAGE = '#ffffff';
// the options that only set a variable for the glass (admin.css reads them)
const THEME_GLASS_VARIABLES = { 'admin-header-bg': '--l3-header-tint', 'navbar-background': '--l3-nav-tint' };

function themeSameColor(a, b) {
    const plain = (value) => String(value || '').trim().toLowerCase().replace(/^(#[0-9a-f]{6})ff$/, '$1');
    return plain(a) === plain(b);
}

// A saved theme or a browser's saved settings from before the redesign still hold the old dark frame. When every one
// of its eight frame colours is still the old default, nobody chose them, so the whole set moves to the glass
// defaults. A frame somebody changed (even one colour) is left alone: its backgrounds and its text were picked to be
// read together, and it then shows as tinted glass.
function themeAdoptGlassFrame(colors) {
    if (!colors) return;
    const keys = Object.keys(THEME_OLD_FRAME);
    if (!keys.every((key) => themeSameColor(colors[key], THEME_OLD_FRAME[key]))) return;
    for (const key of keys) colors[key] = THEME_GLASS_FRAME[key];
    // the page colour under the wash moves with it, when it is still the old white
    if (themeSameColor(colors['page-background'], THEME_OLD_PAGE)) colors['page-background'] = THEME_GLASS_PAGE;
}
// <Jun Kai end>

// Custom default theme - modify these colors to your preference
function getCustomDefaultColors() {
    return {
        // ==================== GENERAL COLORS ====================
        'page-background': THEME_GLASS_PAGE,       // <Jun Kai/> pale grey under the colour wash (was white)
        'primary-text': '#000000ff',               // Black primary text
        'secondary-text': '#959595ff',             // Gray secondary text
        
        // <Jun Kai start> the header and the sidebar are glass panels since the redesign: these colours tint the glass
        // (THEME_GLASS_FRAME below), with dark text on it. The dark frame they replace is THEME_OLD_FRAME.
        ...THEME_GLASS_FRAME,
        // <Jun Kai end>

        // ==================== CARD COLORS ====================
        'card-background': '#f7f7f7ff',            // Light gray card background
        'card-header-background': '#ffffffff',     // White card header background
        'card-border-color': '#eeeeeeff',          // Light gray card border
        'card-primary-text': '#000000ff',          // Black card primary text
        'card-secondary-text': '#000000ff',        // Black card secondary text
        'card-third-text': '#808080',              // Gray card tertiary text
        'card-item-hover-bg': '#f1f5f9',           // Light blue-gray hover background
        'card-item-hover-text': '#64748b',         // Gray hover text
        'card-item-active-bg': '#ede9fe',          // Light purple active background
        'card-item-active-text': '#7c3aed',        // Purple active text
        
        // ==================== BUTTON COLORS ====================
        'button-color': '#ffffffff',               // White button background
        'button-text-color': '#000000ff',          // Black button text
        
        // ==================== BADGE COLORS ====================
        'badge-7days-background': '#9E0000',       // Red badge background (7-day retention)
        'badge-7days-text': '#ffffffff',           // White badge text (7-day retention)
        'badge-longterm-background': '#15803D',  // Green badge background (long-term); <Jun Kai/> darker than #2EAD00 so its white text reads (5:1)
        'badge-longterm-text': '#ffffffff',      // White badge text (long-term)
        
        // ==================== LOGIN PAGE COLORS ====================
        'login-background': '#ffffffff',           // White login page background
        'login-card-background': '#000000ff',      // Black login card background
        'login-card-primary-text': '#ffffff',      // White login card primary text
        'login-card-secondary-text': '#64748b',    // Gray login card subtitle
        'login-button-color': '#000000ff',         // Black login button background
        'login-button-text-color': '#ffffff',      // White login button text
    };
}

// Get default theme settings
function getDefaultThemeSettings() {
    const defaults = {};
    const customColors = getCustomDefaultColors(); // Get your custom colors
    
    themeConfig.sections.forEach(section => {
        defaults[section.id] = {
            useGlobal: section.id !== 'global',
            colors: {}
        };
        
        const options = getColorOptionsForSection(section.id);
        
        options.forEach(option => {
            // Use custom color if available, otherwise fall back to original default
            defaults[section.id].colors[option.id] = customColors[option.id] || option.default;
        });
    });
    
    return defaults;
}

// Save individual page overrides separately from global theme
// This ensures individual page settings don't get mixed between users
function saveIndividualPageSettings() {
    const currentUserId = sessionStorage.getItem('userId') || 
                         sessionStorage.getItem('loggedUser');
    
    if (!currentUserId) {
        console.error('Cannot save individual page settings: No user logged in');
        return;
    }
    
    // Extract ONLY individual page settings (not global)
    const individualSettings = {};
    
    Object.keys(themeSettings).forEach(sectionId => {
        if (sectionId !== 'global' && themeSettings[sectionId]) {
            // Only save if user has set individual colors (useGlobal = false)
            if (themeSettings[sectionId].useGlobal === false) {
                individualSettings[sectionId] = {
                    useGlobal: false,
                    colors: themeSettings[sectionId].colors || {}
                };
            } else if (themeSettings[sectionId].useGlobal === true) {
                // Save toggle state even if using global
                individualSettings[sectionId] = {
                    useGlobal: true,
                    colors: {}
                };
            }
        }
    });
    
    // Save to user-specific key
    const storageKey = `individualPageSettings_user_${currentUserId}`;
    localStorage.setItem(storageKey, JSON.stringify(individualSettings));
    console.log(`💾 Saved individual page settings for user ${currentUserId}`, individualSettings);
}

// Load individual page overrides
function loadIndividualPageSettings() {
    const currentUserId = sessionStorage.getItem('userId') || 
                         sessionStorage.getItem('loggedUser');
    
    if (!currentUserId) {
        return;
    }
    
    const storageKey = `individualPageSettings_user_${currentUserId}`;
    const saved = localStorage.getItem(storageKey);
    
    if (saved) {
        try {
            const individualSettings = JSON.parse(saved);
            
            // Merge individual settings into themeSettings
            Object.keys(individualSettings).forEach(sectionId => {
                if (!themeSettings[sectionId]) {
                    themeSettings[sectionId] = { useGlobal: true, colors: {} };
                }
                
                // Apply individual settings
                themeSettings[sectionId].useGlobal = individualSettings[sectionId].useGlobal;
                themeSettings[sectionId].colors = individualSettings[sectionId].colors || {};
            });
            
            console.log(`✅ Loaded individual page settings for user ${currentUserId}`, individualSettings);
        } catch (e) {
            console.error('Failed to parse individual page settings:', e);
        }
    }
}

// Save theme settings to localStorage (USER-SPECIFIC)
function saveThemeSettings() {
    try {
        // Get current user ID
        const currentUserId = sessionStorage.getItem('userId') || 
                             sessionStorage.getItem('loggedUser');
        
        if (!currentUserId) {
            console.error('Cannot save theme: No user logged in');
            themeSay('Sign in again to save your colours.', 'error'); // <Jun Kai/> the page's status line, no browser box
            return;
        }
        
        // Save global theme settings
        const storageKey = `adminThemeSettings_user_${currentUserId}`;
        localStorage.setItem(storageKey, JSON.stringify(themeSettings));
        
        // ALSO save individual page settings separately
        saveIndividualPageSettings();
        
        applyThemeSettings();
        // <Jun Kai start>
        themeMarkUnsaved(false);
        themeSay('Your colour changes are saved.', 'ok');
        renderSectionList();
        // <Jun Kai end>

        console.log(`✅ Saved theme settings for user ${currentUserId}`);
    } catch (e) {
        console.error('Failed to save theme settings:', e);
        themeSay('Your colours could not be saved. Try again.', 'error'); // <Jun Kai/>
    }
}

// Show save success message
function showSaveMessage() {
    let message = document.querySelector('.theme-save-message');
    if (!message) {
        message = document.createElement('div');
        message.className = 'theme-save-message';
        message.textContent = '✓ Theme settings saved successfully!';
        document.body.appendChild(message);
    }
    
    message.classList.add('show');
    setTimeout(() => {
        message.classList.remove('show');
    }, 3000);
}

// <Jun Kai start> Style & Theme B: every page's colours are a row that folds open. Only one row is open at a time;
// the editor (override switch, colour groups) waits in .theme-editor-home and moves into the open row, so the
// functions that fill it (renderThemeControls, updateSectionTitle) work as before.
let themeRowOpen = true;
let themeUnsaved = false;

// a colour from storage or a saved theme goes into style="" and onclick="" text, so only plain colour values pass
function themeSafeColor(value, fallback = '#E2E8F0') {
    const text = String(value || '').trim();
    return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text) ? text : fallback;
}

function themeSay(text, kind = 'ok') {
    const box = document.getElementById('theme-status');
    if (!box) return;
    box.textContent = text || '';
    box.dataset.kind = kind;
    box.hidden = !text;
}

function themeMarkUnsaved(on) {
    themeUnsaved = !!on;
    const button = document.getElementById('theme-save-btn');
    if (button) button.classList.toggle('has-changes', themeUnsaved);
    if (themeUnsaved) themeSay('You have colour changes that are not saved yet. Save colour changes keeps them.', 'warn');
}

// the colours a page really shows: its own, or the overall ones while it follows the overall theme
function themeEffectiveColors(sectionId) {
    const section = themeConfig.sections.find(s => s.id === sectionId);
    const own = themeSettings[sectionId] || { useGlobal: true, colors: {} };
    const global = (themeSettings.global && themeSettings.global.colors) || {};
    if (!section || section.isGlobal) return { ...global };
    return own.useGlobal ? { ...global } : { ...global, ...(own.colors || {}) };
}

const THEME_CHEVRON = '<svg class="theme-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

function renderSectionList() {
    const container = document.getElementById('theme-section-list');
    const editor = document.getElementById('theme-editor');
    const home = document.querySelector('#theme-settings-page .theme-editor-home');
    // the editor goes back to its holder first, so rebuilding the rows never removes it
    if (editor && home && editor.parentElement !== home) home.appendChild(editor);
    if (!container) return;
    container.innerHTML = '';

    const userRole = sessionStorage.getItem('userRole');
    const visibleSections = themeConfig.sections.filter(section =>
        !section.isSavedThemes && (!section.requiredRole || userRole === 'system_admin'));

    visibleSections.forEach(section => {
        const open = themeRowOpen && section.id === currentSection;
        const own = themeSettings[section.id];
        const tag = section.isGlobal
            ? '<span class="ui-tag is-purple">Global</span>'
            : (own && own.useGlobal === false ? '<span class="ui-tag is-blue">Own colours</span>' : '<span class="ui-tag">Overall theme</span>');
        const colors = themeEffectiveColors(section.id);
        const dots = ['page-background', 'card-background', 'primary-text', 'button-color']
            .map(key => `<span style="--theme-dot: ${themeSafeColor(colors[key])};"></span>`).join(''); // a custom property: dark mode leaves it as it is

        const row = document.createElement('div');
        row.className = 'ui-card theme-row' + (open ? ' open' : '');
        row.dataset.section = section.id;
        row.innerHTML = `
            <button type="button" class="theme-row-head" id="theme-row-${section.id}" aria-expanded="${open}" aria-controls="theme-row-body-${section.id}">
                <span class="theme-row-name"></span>
                <span class="theme-row-dots" aria-hidden="true">${dots}</span>
                ${tag}
                ${THEME_CHEVRON}
            </button>
            <div class="theme-row-body" id="theme-row-body-${section.id}" role="region" aria-labelledby="theme-row-${section.id}"${open ? '' : ' hidden'}></div>`;
        row.querySelector('.theme-row-name').textContent = section.name;
        row.querySelector('.theme-row-head').addEventListener('click', () => themeToggleRow(section.id));
        container.appendChild(row);
        if (open && editor) row.querySelector('.theme-row-body').appendChild(editor);
    });
}

// a click on a row: opens it, or closes it when it is the open one
function themeToggleRow(sectionId) {
    if (themeRowOpen && sectionId === currentSection) {
        themeRowOpen = false;
        renderSectionList();
        return;
    }
    selectSection(sectionId);
}

function selectSection(sectionId) {
    const section = themeConfig.sections.find(s => s.id === sectionId);
    if (!section || section.isSavedThemes) {
        // the saved themes are the strip on top now
        document.getElementById('theme-saved-title')?.scrollIntoView({ block: 'start' });
        return;
    }
    currentSection = sectionId;
    themeRowOpen = true;
    renderSectionList();
    renderThemeControls(sectionId);
    updateSectionTitle(sectionId);
}

function updateSectionTitle(sectionId) {
    const section = themeConfig.sections.find(s => s.id === sectionId);
    if (!section) return;
    const title = document.getElementById('current-section-title');
    if (title) title.textContent = section.name;
    const previewFor = document.getElementById('theme-preview-for');
    if (previewFor) previewFor.textContent = themePreviewCaption(section.name); // <Jun Kai/> says when dark mode shows only the button colour

    const overrideContainer = document.getElementById('override-toggle-container');
    const resetBtn = document.getElementById('reset-to-global-btn');
    const toggle = document.getElementById('use-global-theme');
    if (section.isGlobal) {
        if (overrideContainer) overrideContainer.style.display = 'none';
        if (resetBtn) resetBtn.style.display = 'none';
        return;
    }
    const useGlobal = themeSettings[sectionId]?.useGlobal ?? true;
    if (overrideContainer) overrideContainer.style.display = 'flex';
    if (resetBtn) resetBtn.style.display = useGlobal ? 'none' : 'inline-block';
    if (toggle) toggle.checked = useGlobal;
}
// <Jun Kai end>

// Render theme controls for a section
function renderThemeControls(sectionId) {
    const container = document.getElementById('theme-settings-form');
    if (!container) return; // <Jun Kai/> the saved themes have their own strip on top now
    container.innerHTML = '';

    const section = themeConfig.sections.find(s => s.id === sectionId);
    const sectionSettings = themeSettings[sectionId] || { useGlobal: !section.isGlobal, colors: {} };
    const isDisabled = sectionSettings.useGlobal && !section.isGlobal;
    
    const options = getColorOptionsForSection(sectionId);
    
    const groupedOptions = {};
    options.forEach(option => {
        const category = option.category || 'general';
        if (!groupedOptions[category]) {
            groupedOptions[category] = [];
        }
        groupedOptions[category].push(option);
    });
    
    const categoryNames = {
        general: 'General',
        card: 'Card',
        buttons: 'Buttons',
        navbar: 'Navigation',
        adminHeader: 'Header',
        login: 'Login',
        badges: 'Badges',
        sections: 'Sections'
    };
    
    Object.keys(groupedOptions).forEach(category => {
        const groupTitle = categoryNames[category] || category;
        const group = createColorGroup(groupTitle, groupedOptions[category], sectionId, isDisabled);
        container.appendChild(group);
    });
    
    updatePreview(sectionId);
}

// Create a color group
function createColorGroup(title, options, sectionId, isDisabled) {
    const group = document.createElement('div');
    group.className = 'theme-group';
    
    const groupTitle = document.createElement('div');
    groupTitle.className = 'theme-group-title';
    groupTitle.textContent = title;
    group.appendChild(groupTitle);
    
    options.forEach(option => {
        const control = createColorControl(option, sectionId, isDisabled);
        group.appendChild(control);
    });
    
    return group;
}

const THEME_COLOR_PRESETS = {
    lightBackgrounds: [
        { label: 'White', value: '#FFFFFF' },
        { label: 'Mist', value: '#F8FAFC' },
        { label: 'Soft Green', value: '#F0FDF4' },
        { label: 'Soft Blue', value: '#EFF6FF' }
    ],
    darkBackgrounds: [
        { label: 'Forest', value: '#052E1B' },
        { label: 'Deep Teal', value: '#083B3A' },
        { label: 'Navy', value: '#0F172A' },
        { label: 'Charcoal', value: '#1F2937' }
    ],
    textOnLight: [
        { label: 'Black', value: '#000000' },
        { label: 'Slate', value: '#1E293B' },
        { label: 'Gray', value: '#64748B' },
        { label: 'Green', value: '#166534' }
    ],
    textOnDark: [
        { label: 'White', value: '#FFFFFF' },
        { label: 'Mint', value: '#D1FAE5' },
        { label: 'Light Gray', value: '#CBD5E1' },
        { label: 'Soft Yellow', value: '#FEF3C7' }
    ],
    accents: [
        { label: 'RP Green', value: '#047857' },
        { label: 'Leaf', value: '#16A34A' },
        { label: 'Teal', value: '#0F766E' },
        { label: 'Blue', value: '#2563EB' },
        { label: 'Amber', value: '#D97706' },
        { label: 'Red', value: '#B91C1C' }
    ],
    borders: [
        { label: 'Pale', value: '#E2E8F0' },
        { label: 'Soft Gray', value: '#CBD5E1' },
        { label: 'Mint Line', value: '#A7F3D0' },
        { label: 'Dark Line', value: '#334155' }
    ]
};

function normalizeThemeColor(value) {
    const color = String(value || '').trim().toUpperCase();
    return /^#[0-9A-F]{8}$/.test(color) && color.endsWith('FF') ? color.substring(0, 7) : color;
}

function getThemeColorPresets(option) {
    const id = option.id || '';

    if (id.includes('border')) {
        return THEME_COLOR_PRESETS.borders;
    }

    if (id.includes('text') || id.includes('primary') || id.includes('secondary') || id.includes('third')) {
        if (id.includes('button-text') || id.includes('badge') || id.includes('login-card')) {
            return THEME_COLOR_PRESETS.textOnDark;
        }
        return THEME_COLOR_PRESETS.textOnLight;
    }

    if (id.includes('navbar') || id.includes('header') || id.includes('login') || id.includes('button') || id.includes('badge')) {
        return THEME_COLOR_PRESETS.darkBackgrounds.concat(THEME_COLOR_PRESETS.accents);
    }

    if (id.includes('card') || id === 'page-background') {
        return THEME_COLOR_PRESETS.lightBackgrounds.concat(THEME_COLOR_PRESETS.darkBackgrounds);
    }

    return THEME_COLOR_PRESETS.lightBackgrounds.concat(THEME_COLOR_PRESETS.accents);
}

function getPresetOptionsForColor(option, currentColor) {
    const normalizedCurrent = normalizeThemeColor(currentColor);
    const presets = getThemeColorPresets(option).map(preset => ({
        ...preset,
        value: normalizeThemeColor(preset.value)
    }));

    if (normalizedCurrent && !presets.some(preset => preset.value === normalizedCurrent)) {
        presets.unshift({ label: 'Current', value: normalizedCurrent });
    }

    return presets;
}

function hexToRgb(color) {
    const normalized = normalizeThemeColor(color);
    const match = normalized.match(/^#([0-9A-F]{6})$/);
    if (!match) return null;

    const value = match[1];
    return {
        r: parseInt(value.substring(0, 2), 16),
        g: parseInt(value.substring(2, 4), 16),
        b: parseInt(value.substring(4, 6), 16)
    };
}

// <Jun Kai start> contrast of two theme colours (1 to 21); a colour it cannot read counts as readable
function themeContrast(a, b) {
    const one = hexToRgb(a);
    const two = hexToRgb(b);
    if (!one || !two) return 21;
    const lum = ({ r, g, b: blue }) => [r, g, blue].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const [hi, lo] = [lum(one), lum(two)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}
// <Jun Kai end>

function isDarkThemeColor(color) {
    const rgb = hexToRgb(color);
    if (!rgb) return false;
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance < 0.45;
}

// <Jun Kai start> Option A, "tinted glass" (picked 26 Nov 2026): a theme's colours reach the cards and the accent of the
// rebuilt pages through the kit's colour variables instead of old selector lists, with these rules:
//   - a colour that is still the built-in default was not chosen, so it changes nothing: an untouched account looks
//     exactly like the kit;
//   - the card colour tints the glass only when every text that will sit on it can still be read (4.5:1): the theme's
//     own text colours when they are readable there, otherwise the kit's, and the kit's red warnings;
//   - the button colour becomes the accent (buttons, links, focus rings, the open sidebar item, chips), darkened only as
//     far as needed for white text and for links on the card (4.5:1);
//   - dark mode (its own small stylesheet, the light one is switched off there) takes only the accent: buttons keep the
//     same filled colour when white text reads on it and it stands out from the dark card (3:1), links and focus rings
//     get a lighter shade that reads on the dark card (4.5:1).
// A page with its own colours gets the same, limited to that page. Status tags, danger buttons, notices, table heads
// and charts keep their own colours.
const THEME_KIT = { card: '#FFFFFF', darkCard: '#111A2B', text: '#1E293B', muted: '#64748B', red: '#B91C1C' };

function themeHex(value) {
    const color = normalizeThemeColor(value);
    if (/^#[0-9A-F]{6}$/.test(color)) return color;
    return /^#[0-9A-F]{8}$/.test(color) ? color.slice(0, 7) : null;
}

// a colour that differs from the built-in default, or null when it was never chosen
function themeChosen(colors, key) {
    const value = colors && colors[key];
    if (!value || themeSameColor(value, getCustomDefaultColors()[key])) return null;
    return themeHex(value);
}

function themeMixHex(from, to, share) {
    const a = parseInt(from.slice(1), 16);
    const b = parseInt(to.slice(1), 16);
    const channel = (shift) => Math.round(((a >> shift) & 255) * (1 - share) + ((b >> shift) & 255) * share);
    return '#' + [16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// the colour itself when it reaches the contrast on every background, otherwise mixed step by step toward black (or
// white) until it does; null when even that is not enough
function themeReadable(color, backgrounds, min, toward) {
    for (let step = 0; step <= 20; step++) {
        const candidate = step ? themeMixHex(color, toward, step / 20) : color;
        if (backgrounds.every((bg) => themeContrast(candidate, bg) >= min)) return candidate;
    }
    return null;
}

// what the rules above make of one set of colours in light mode; null fields mean "the kit's own"
function themeKitColours(colors) {
    const card = themeChosen(colors, 'card-background');
    const text = themeChosen(colors, 'card-primary-text');
    const sub = themeChosen(colors, 'card-secondary-text');
    const button = themeChosen(colors, 'button-color');
    const buttonText = themeChosen(colors, 'button-text-color');
    const readableOn = (color, bg) => (color && themeContrast(color, bg) >= 4.5 ? color : null);
    let surface = THEME_KIT.card;
    let tinted = null;
    if (card) {
        const willSit = [readableOn(text, card) || THEME_KIT.text, readableOn(sub, card) || THEME_KIT.muted, THEME_KIT.red];
        if (willSit.every((color) => themeContrast(color, card) >= 4.5)) { surface = card; tinted = card; }
    }
    const accent = button ? themeReadable(button, ['#FFFFFF', surface], 4.5, '#000000') : null;
    return {
        card: tinted,
        text: readableOn(text, surface),
        sub: readableOn(sub, surface),
        border: themeChosen(colors, 'card-border-color'),
        accent,
        onAccent: accent ? (buttonText && themeContrast(buttonText, accent) >= 4.5 ? buttonText : '#FFFFFF') : null
    };
}

// light mode: the card tint, the card texts and the accent of one scope (the whole page or one page)
function themeKitLight(colors, scope) {
    const kit = themeKitColours(colors);
    const cardVars = [];
    const scopeVars = [];
    if (kit.card) cardVars.push(`--l3-card: color-mix(in srgb, ${kit.card} 82%, transparent)`, `--theme-card-bg: ${kit.card}`, `--l3-field: color-mix(in srgb, ${kit.card} 70%, transparent)`);
    if (kit.text) cardVars.push(`--theme-text-color: ${kit.text}`);
    if (kit.sub) cardVars.push(`--color-dark-gray: ${kit.sub}`, `--color-muted: ${kit.sub}`);
    if (kit.border) cardVars.push(`--l3-card-edge: color-mix(in srgb, ${kit.border} 80%, transparent)`, `--theme-border-color: ${kit.border}`);
    if (kit.accent) {
        scopeVars.push(`--theme-btn-primary-bg: ${kit.accent}`, `--theme-btn-primary-text: ${kit.onAccent}`, `--l3-focus: ${kit.accent}`, `--l3-link: ${kit.accent}`);
    }
    let css = '';
    if (scopeVars.length) css += `${scope} { ${scopeVars.join('; ')}; }\n`;
    if (cardVars.length) css += `${scope === ':root' ? '.ui-card' : scope + ' .ui-card'} { ${cardVars.join('; ')}; }\n`;
    return css;
}

// dark mode: only the accent
function themeKitDark(colors, scope) {
    const button = themeChosen(colors, 'button-color');
    if (!button) return '';
    const vars = [];
    const fill = themeReadable(button, ['#FFFFFF'], 4.5, '#000000');
    if (fill && themeContrast(fill, THEME_KIT.darkCard) >= 3) vars.push(`--theme-btn-primary-bg: ${fill}`, '--theme-btn-primary-text: #FFFFFF');
    const link = themeReadable(button, [THEME_KIT.darkCard], 4.5, '#FFFFFF');
    if (link) {
        vars.push(`--l3-link: ${link}`, `--l3-focus: ${link}`);
    }
    if (!vars.length) return '';
    return `${scope === ':root' ? ':root[data-theme="dark"]' : ':root[data-theme="dark"] ' + scope} { ${vars.join('; ')}; }\n`;
}
// <Jun Kai end>

function applyBackgroundCompanionColors(sectionId, backgroundColor) {
    if (!themeSettings[sectionId]?.colors) return;

    const colors = themeSettings[sectionId].colors;
    const companion = isDarkThemeColor(backgroundColor) ? {
        'primary-text': '#FFFFFF',
        'secondary-text': '#D1FAE5',
        'card-background': '#083B3A',
        'card-header-background': '#052E1B',
        'card-border-color': '#0F766E',
        'card-primary-text': '#FFFFFF',
        'card-secondary-text': '#D1FAE5',
        'card-third-text': '#A7F3D0',
        'button-color': '#FFFFFF',
        'button-text-color': '#052E1B'
    } : {
        'primary-text': '#000000',
        'secondary-text': '#64748B',
        'card-background': '#FFFFFF',
        'card-header-background': '#F8FAFC',
        'card-border-color': '#E2E8F0',
        'card-primary-text': '#000000',
        'card-secondary-text': '#334155',
        'card-third-text': '#64748B',
        'button-color': '#0F766E',
        'button-text-color': '#FFFFFF'
    };

    Object.assign(colors, companion);
}

// Create a color control
function createColorControl(option, sectionId, isDisabled) {
    const control = document.createElement('div');
    control.className = 'theme-control' + (isDisabled ? ' disabled' : '');
    control.dataset.option = option.id; // <Jun Kai/> so the chosen swatch gets the focus back after a redraw

    const currentColor = themeSafeColor(normalizeThemeColor(themeSettings[sectionId]?.colors[option.id] || option.default), normalizeThemeColor(option.default)); // <Jun Kai/>
    
    const selectors = getSelectorsForOption(sectionId, option.id);
    const selectorCount = selectors.length;
    
    const presets = getPresetOptionsForColor(option, currentColor);
    const swatches = presets.map(preset => {
        const isSelected = normalizeThemeColor(preset.value) === currentColor;
        return `
            <button
                type="button"
                class="theme-swatch-button ${isSelected ? 'selected' : ''}"
                style="--swatch-color: ${preset.value};"
                title="${preset.label}: ${preset.value}"
                aria-label="${preset.label} ${preset.value}"
                onclick="updateColor('${sectionId}', '${option.id}', '${preset.value}')"
                ${isDisabled ? 'disabled' : ''}>
                <span></span>
            </button>
        `;
    }).join('');

    control.innerHTML = `
        <div class="theme-control-label">
            <span>${option.label}</span>
            ${selectorCount > 1 ? `<span class="selector-count">(${selectorCount} elements)</span>` : ''}
        </div>
        <div class="theme-control-description">${option.description || ''}</div>
        <div class="theme-control-input">
            <div class="theme-swatch-list" role="list" aria-label="${option.label} color presets">
                ${swatches}
            </div>
            <span class="theme-current-color">${currentColor}</span>
        </div>
    `;
    
    return control;
}

// Update color from picker
function updateColor(sectionId, colorId, value) {
    if (!themeSettings[sectionId]) {
        themeSettings[sectionId] = { useGlobal: false, colors: {} };
    }
    themeSettings[sectionId].colors[colorId] = normalizeThemeColor(value);

    if (colorId === 'page-background') {
        applyBackgroundCompanionColors(sectionId, value);
    }
    
    const hexInput = document.getElementById(`hex-${sectionId}-${colorId}`);
    if (hexInput) {
        hexInput.value = normalizeThemeColor(value);
    }
    
    renderThemeControls(sectionId);
    updatePreview(sectionId);
    // <Jun Kai start>
    themeMarkUnsaved(true);
    renderSectionList();
    document.querySelector(`#theme-settings-form [data-option="${colorId}"] .theme-swatch-button.selected`)?.focus();
    // <Jun Kai end>
}

// Update color from hex input
function updateColorFromHex(sectionId, colorId, value) {
    const hexRegex = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
    if (!hexRegex.test(value)) {
        const currentColor = themeSettings[sectionId]?.colors[colorId];
        const hexInput = document.getElementById(`hex-${sectionId}-${colorId}`);
        if (hexInput && currentColor) {
            hexInput.value = currentColor.toUpperCase();
        }
        return;
    }
    
    if (!themeSettings[sectionId]) {
        themeSettings[sectionId] = { useGlobal: false, colors: {} };
    }
    themeSettings[sectionId].colors[colorId] = value.toUpperCase();
    themeMarkUnsaved(true); // <Jun Kai/>
    
    const colorPicker = document.getElementById(`color-${sectionId}-${colorId}`);
    if (colorPicker) {
        colorPicker.value = value;
    }
    
    updatePreview(sectionId);
}

// Toggle global theme override for a section
function toggleGlobalThemeOverride() {
    const useGlobal = document.getElementById('use-global-theme').checked;
    
    if (!themeSettings[currentSection]) {
        themeSettings[currentSection] = { useGlobal: true, colors: {} };
    }
    
    themeSettings[currentSection].useGlobal = useGlobal;
    renderThemeControls(currentSection);
    // <Jun Kai start>
    updateSectionTitle(currentSection);
    themeMarkUnsaved(true);
    renderSectionList();
    // <Jun Kai end>
}

// Reset section to global theme
async function resetSectionToGlobal() { // <Jun Kai/> async: it waits for the kit dialog
    if (currentSection === 'global') return;
    const pageName = themeConfig.sections.find(s => s.id === currentSection).name;
    if (await uiConfirm({ title: `Use the overall colours on ${pageName}?`, message: 'Its own colours are replaced by the Admin Overall Theme. Save colour changes keeps it.', confirmText: 'Use the overall colours' })) {
        themeSettings[currentSection].useGlobal = true;
        themeSettings[currentSection].colors = { ...themeSettings.global.colors };
        renderThemeControls(currentSection);
        // <Jun Kai start>
        updateSectionTitle(currentSection);
        themeMarkUnsaved(true);
        renderSectionList();
        // <Jun Kai end>
    }
}

// Reset all to defaults
async function resetAllToDefaults() {
    // <Jun Kai/> the kit dialog instead of the browser box
    if (!(await uiConfirm({ title: 'Reset all colours to the defaults?', message: 'Every page goes back to the default colours and no saved theme is in use. Your saved themes stay in the list.', confirmText: 'Reset all', danger: true }))) {
        return;
    }
    
    try {
        // Step 1: Deactivate active theme in database
        console.log('🔄 Deactivating active theme...');
        
        const response = await fetch('/api/admin/saved-themes/deactivate-all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        
        if (response.ok) {
            console.log('✅ Active theme deactivated');
        } else {
            console.warn('⚠️ Failed to deactivate theme in database');
        }
        
        // Step 2: Reset themeSettings to defaults
        themeSettings = getDefaultThemeSettings();
        
        // Step 3: Clear individual page settings
        const currentUserId = sessionStorage.getItem('userId') || 
                             sessionStorage.getItem('loggedUser');
        if (currentUserId) {
            localStorage.removeItem(`individualPageSettings_user_${currentUserId}`);
            console.log('🗑️ Cleared individual page settings');
        }
        
        // Step 4: Save the reset state
        saveThemeSettings();
        
        // Step 5: Re-render UI
        renderThemeControls(currentSection);
        applyThemeSettings();
        
        // Step 6: Reload saved themes UI to remove "Active" badge
        if (typeof loadSavedThemes === 'function') {
            await loadSavedThemes();
        }
        
        // <Jun Kai start>
        renderSectionList();
        updatePreview(currentSection);
        themeMarkUnsaved(false);
        themeSay('All colours are back to the defaults, and no saved theme is in use.', 'ok');
        // <Jun Kai end>
        
    } catch (error) {
        console.error('❌ Error resetting to defaults:', error);
        themeSay('The colours could not be reset. Try again.', 'error'); // <Jun Kai/>
    }
}

// Update preview
function updatePreview(sectionId) {
    // <Jun Kai start> a small page: header, sidebar and a card, in the colours this page shows
    const preview = document.getElementById('theme-preview');
    if (!preview) return;
    const colors = themeEffectiveColors(sectionId);
    const frame = themeEffectiveColors('admin-dashboard');
    const set = (name, value, fallback) => preview.style.setProperty(name, themeSafeColor(value, fallback));
    set('--preview-bg', colors['page-background'], '#F3F6FA');
    // the card and its texts and the buttons as the pages will really show them (option A: a colour that would not read
    // is left out, the accent is darkened until white text reads on it)
    const kit = themeKitColours(colors);
    set('--preview-card-bg', kit.card, THEME_KIT.card);
    set('--preview-border', kit.border, '#E2E8F0');
    set('--preview-heading', kit.text, THEME_KIT.text);
    set('--preview-text', kit.sub, THEME_KIT.muted);
    set('--preview-btn-bg', kit.accent, '#2563EB');
    set('--preview-btn-text', kit.onAccent, '#FFFFFF');
    // the page title outside the card: the main text colour when it reads on the page colour, as on the real pages
    const title = themeChosen(colors, 'primary-text');
    const pageColour = themeHex(colors['page-background']) || '#F3F6FA';
    set('--preview-title', title && themeContrast(title, pageColour) >= 4.5 ? title : null, THEME_KIT.text);
    set('--preview-header-bg', frame['admin-header-bg'], '#FFFFFF');
    set('--preview-header-text', frame['primary-header-text'], '#1E293B');
    set('--preview-nav-bg', frame['navbar-background'], '#FFFFFF');
    set('--preview-nav-text', frame['navbar-text'] || frame['nav-text-color'], '#334155');
    // in dark mode the preview is a dark admin page with only the theme's accent, as the real pages show it (themeKitDark)
    if (document.documentElement.dataset.theme === 'dark') {
        const dark = { '--preview-bg': '#0B1120', '--preview-header-bg': '#0F172A', '--preview-header-text': '#F1F5F9', '--preview-nav-bg': '#0F172A',
            '--preview-nav-text': '#CBD5E1', '--preview-card-bg': THEME_KIT.darkCard, '--preview-border': '#263244', '--preview-heading': '#E5E7EB',
            '--preview-text': '#A7B4C4', '--preview-title': '#F1F5F9', '--preview-btn-bg': '#2563EB', '--preview-btn-text': '#FFFFFF' };
        const button = themeChosen(colors, 'button-color');
        const fill = button ? themeReadable(button, ['#FFFFFF'], 4.5, '#000000') : null;
        if (fill && themeContrast(fill, THEME_KIT.darkCard) >= 3) dark['--preview-btn-bg'] = fill;
        Object.entries(dark).forEach(([name, value]) => preview.style.setProperty(name, value));
    }
    // <Jun Kai end>
}

// <Jun Kai/> the preview follows a Light / Dark switch right away (colorScheme.js sends admin-color-scheme)
window.addEventListener('admin-color-scheme', () => {
    if (document.getElementById('theme-preview') && typeof currentSection !== 'undefined') updatePreview(currentSection);
    const previewFor = document.getElementById('theme-preview-for');
    const section = typeof currentSection !== 'undefined' && themeConfig.sections.find((s) => s.id === currentSection);
    if (previewFor && section) previewFor.textContent = themePreviewCaption(section.name);
});

// <Jun Kai/> in dark mode a theme shows only its button colour (option A), so the preview says so instead of promising every change
function themePreviewCaption(name) {
    return document.documentElement.dataset.theme === 'dark'
        ? `${name}. In dark mode only the button colour shows here. Switch to light mode to see the other colours.`
        : `${name}. Changes show here before you save.`;
}

// Apply theme settings to the actual page using CSS selectors
function applyThemeSettings() {
    let styleEl = document.getElementById('dynamic-theme-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamic-theme-styles';
        document.head.appendChild(styleEl);
    }
    
    let css = '';

    // <Jun Kai start> a frame nobody changed since before the redesign becomes the glass frame
    themeAdoptGlassFrame(themeSettings.global && themeSettings.global.colors);
    themeAdoptGlassFrame(themeSettings['admin-dashboard'] && themeSettings['admin-dashboard'].colors);
    // <Jun Kai end>

    themeConfig.sections.forEach(section => {
        const sectionSettings = themeSettings[section.id];
        if (!sectionSettings) return;

        const useGlobal = section.isGlobal ? false : (sectionSettings.useGlobal ?? true);
        const colors = useGlobal && themeSettings.global ? themeSettings.global.colors : sectionSettings.colors;

        if (!colors) return;
        
        const mapping = themeConfig.selectorMapping[section.id];
        if (!mapping) return;
        
        Object.keys(mapping).forEach(category => {
            Object.keys(mapping[category]).forEach(optionId => {
                const config = mapping[category][optionId];
                const selectors = expandSelectorPatterns(config);
                const color = colors[optionId];
                
                if (!color || !selectors || selectors.length === 0) return;

                let cssProperty = 'color';
                let cssValue = color;

                // <Jun Kai start> glass frame (redesign): the header and sidebar colours tint the frosted panels,
                // and the overall page colour sits under the colour wash, so none of them is painted solid. A page
                // with its own colours switched on is still painted in its own page colour.
                if (THEME_GLASS_VARIABLES[optionId]) {
                    // a dark colour stays nearly solid: mixed with the pale page it would turn pale, and the
                    // light text picked for it could no longer be read
                    const solid = isDarkThemeColor(cssValue) ? ` ${THEME_GLASS_VARIABLES[optionId]}-share: 92%;` : '';
                    css += `:root { ${THEME_GLASS_VARIABLES[optionId]}: ${cssValue};${solid} }\n`;
                    return;
                }
                // a page text colour that cannot be read on the page colour (below 4.5:1, like the old default grey
                // #959595 on white) is left out, so the page keeps its own readable colour
                if ((optionId === 'primary-text' || optionId === 'secondary-text') && colors['page-background'] && themeContrast(cssValue, colors['page-background']) < 4.5) return;
                if (optionId === 'page-background') {
                    if (section.isGlobal) {
                        css += `:root { --l3-page-tint: ${cssValue}; }\n`; // <Jun Kai/> the preview takes its colours from updatePreview
                        return;
                    }
                    if (useGlobal) return;
                }
                // <Jun Kai end>

                if (optionId.includes('background') || optionId.includes('-bg') || optionId === 'page-background' || 
                    optionId === 'card-background' || optionId === 'navbar-background' || 
                    optionId === 'navbar-hover' ||
                    optionId === 'admin-header-bg' || optionId === 'button-color') {
                    cssProperty = 'background-color';
                    
                    if (optionId === 'button-color') {
                        const selectorList = selectors.join(', ');
                        css += `
                            ${selectorList} {
                                background: ${cssValue} !important;
                                background-color: ${cssValue} !important;
                            }
                        `;
                        return;
                    }
                    
                    if (optionId === 'card-background' && selectors.some(s => s.includes('export-card'))) {
                        const exportCardSelectors = selectors.filter(s => s.includes('export-card')).join(', ');
                        if (exportCardSelectors) {
                            css += `
                                ${exportCardSelectors} {
                                    background: ${cssValue} !important;
                                    background-color: ${cssValue} !important;
                                }
                            `;
                        }
                        const nonExportSelectors = selectors.filter(s => !s.includes('export-card'));
                        if (nonExportSelectors.length === 0) return;
                        const remainingSelectorList = nonExportSelectors.join(', ');
                        css += `
                            ${remainingSelectorList} {
                                ${cssProperty}: ${cssValue} !important;
                            }
                        `;
                        return;
                    }
                } else if (optionId === 'navbar-active-selection') {
                    const selectorList = selectors.join(', ');
                    css += `
                        ${selectorList} {
                            background-color: ${cssValue} !important;
                            border-left-color: ${cssValue} !important;
                        }
                    `;
                    return;
                } else if (optionId.includes('border')) {
                    cssProperty = 'border-color';
                } else if (optionId.includes('text') || optionId.includes('primary') || 
                          optionId.includes('secondary') || optionId === 'button-text-color') {
                    cssProperty = 'color';
                }
                
                const selectorList = selectors.join(', ');
                css += `
                    ${selectorList} {
                        ${cssProperty}: ${cssValue} !important;
                    }
                `;
            });
        });
    });
    
    // <Jun Kai start> Option A: the overall colours, then every rebuilt page that has its own colours switched on (an
    // old-style page keeps its selector lists above); dark mode's accent goes into its own stylesheet, cleared when empty
    let dark = '';
    const globalColors = themeSettings.global && themeSettings.global.colors;
    css += themeKitLight(globalColors, ':root');
    dark += themeKitDark(globalColors, ':root');
    themeConfig.sections.forEach((section) => {
        if (section.isGlobal || section.isSavedThemes || section.id === 'admin-dashboard') return;
        const own = themeSettings[section.id];
        if (!own || own.useGlobal !== false) return;
        const page = document.getElementById(section.id);
        if (!page || !page.querySelector('.ui-card')) return;
        css += themeKitLight(own.colors, '#' + section.id);
        dark += themeKitDark(own.colors, '#' + section.id);
    });
    let darkEl = document.getElementById('dynamic-theme-dark-accent');
    if (!darkEl) {
        darkEl = document.createElement('style');
        darkEl.id = 'dynamic-theme-dark-accent';
        document.head.appendChild(darkEl);
    }
    darkEl.textContent = dark;
    // <Jun Kai end>
    styleEl.textContent = css;
}

// Helper function to adjust color brightness

// Initialize theme on page load (WAIT FOR LOGIN)
document.addEventListener('DOMContentLoaded', () => {
    // Don't load from localStorage yet - wait for login to determine user
    // Just apply defaults for now
    themeSettings = getDefaultThemeSettings();
    applyThemeSettings();
    console.log('🎨 Applied default theme on page load (waiting for login)');
}); 

// ==================== 23. SAVED THEMES MANAGEMENT ====================
let savedThemesCache = []; // Cache of user's saved themes
let currentThemeData = null; // Store current theme data for saving

// Load all saved themes for the current user
async function loadSavedThemes() {
    try {
        console.log('📚 Loading saved themes...');
        
        const response = await fetch('/api/admin/saved-themes', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            // Check if it's an authentication error
            if (response.status === 401) {
                console.warn('⚠️ Not authenticated yet. Saved themes will load after login.');
                return [];
            }
            throw new Error(data.error || 'Failed to load saved themes');
        }
        
        savedThemesCache = data.themes || [];
        
        console.log(`✅ Loaded ${savedThemesCache.length} saved themes`);
        
        // Update UI
        updateSavedThemesUI();
        
        return savedThemesCache;
        
    } catch (error) {
        console.error('❌ Error loading saved themes:', error);
        
        // Only show notification if not an auth error
        if (error.message !== 'Authentication required') {
            if (typeof showNotification === 'function') {
                showNotification('Failed to load saved themes: ' + error.message, 'error');
            } else {
                console.error('showNotification function not found');
            }
        }
        
        return [];
    }
}

// <Jun Kai start> Style & Theme B: the saved themes are picture cards on top, with Apply. The card that saves the
// current colours sits next to them, outside #saved-themes-list, so a reload of the list keeps what was typed.
const THEME_MAX_SAVED = 6;

function updateSavedThemesUI() {
    const countElement = document.getElementById('saved-themes-count');
    const listElement = document.getElementById('saved-themes-list');
    if (!countElement || !listElement) return;

    countElement.textContent = savedThemesCache.length;
    listElement.innerHTML = '';
    savedThemesCache.forEach(theme => listElement.appendChild(createSavedThemeCard(theme)));
    themeUpdateSaveCard();
    renderStarterThemes(); // <Jun Kai/> a starter card says whether it is already one of the saved themes
}

// <Jun Kai start> Starter themes (26 Nov 2026): the user asked for a better looking green than the dark green header and
// strong light green of the mock-ups. Emerald keeps the header and sidebar white, the page a very light mint and the
// buttons a deep emerald that white text reads on (5.5:1). Taking one saves it as one of the admin's own themes and uses it.
const THEME_STARTERS = [
    {
        name: 'Emerald',
        about: 'Light mint page, white header and sidebar, emerald buttons',
        colors: {
            'page-background': '#ecfdf5', 'primary-text': '#064e3b', 'secondary-text': '#3f6b5a',
            'admin-header-bg': '#ffffff', 'primary-header-text': '#064e3b', 'secondary-header-text': '#3f6b5a',
            'navbar-background': '#ffffff', 'navbar-primary-text': '#064e3b', 'navbar-secondary-text': '#3f6b5a',
            'navbar-active-selection': '#d1fae5', 'navbar-hover': '#d1fae5',
            'card-background': '#ffffff', 'card-border-color': '#bbf0d6', 'card-primary-text': '#064e3b', 'card-secondary-text': '#3f6b5a',
            'button-color': '#047857', 'button-text-color': '#ffffff'
        }
    }
];

// the saved theme with the same name, if the admin already took this starter
function themeStarterSaved(starter) {
    return savedThemesCache.find(theme => String(theme.theme_name || '').trim().toLowerCase() === starter.name.toLowerCase()) || null;
}

function renderStarterThemes() {
    const list = document.getElementById('starter-themes-list');
    if (!list) return;
    list.innerHTML = '';
    THEME_STARTERS.forEach((starter, index) => {
        const saved = themeStarterSaved(starter);
        const full = !saved && savedThemesCache.length >= THEME_MAX_SAVED;
        const card = document.createElement('div');
        card.className = 'ui-card theme-saved-card theme-starter-card' + (saved && saved.is_active ? ' active' : '');
        const strip = extractPreviewColors({ global: { colors: starter.colors } })
            .map(color => `<span style="--theme-dot: ${themeSafeColor(color)};"></span>`).join('');
        let action = '';
        if (saved && saved.is_active) action = '<span class="ui-tag is-green">In use</span>';
        else action = `<button type="button" class="ui-btn ui-btn-secondary theme-saved-apply" data-starter="${index}"${full ? ' disabled' : ''}>${saved ? 'Apply' : 'Use this theme'}</button>`;
        const note = saved
            ? 'In your saved themes'
            : (full ? 'All 6 places are used. Delete a saved theme first.' : 'Saved into your themes when you use it');
        card.innerHTML = `
            <div class="theme-saved-strip" aria-hidden="true">${strip}</div>
            <div class="theme-saved-foot">
                <div class="theme-saved-name"></div>
                ${action}
            </div>
            <div class="theme-starter-about"></div>
            <div class="theme-saved-sub"><span class="theme-starter-note"></span></div>`;
        card.querySelector('.theme-saved-name').textContent = starter.name;
        card.querySelector('.theme-starter-about').textContent = starter.about;
        card.querySelector('.theme-starter-note').textContent = note;
        const button = card.querySelector('[data-starter]');
        if (button) {
            button.setAttribute('aria-label', `${saved ? 'Apply' : 'Use'} the starter theme ${starter.name}`);
            button.addEventListener('click', () => useStarterTheme(index));
        }
        list.appendChild(card);
    });
}

async function useStarterTheme(index) {
    const starter = THEME_STARTERS[index];
    if (!starter) return;
    const saved = themeStarterSaved(starter);
    if (saved) return activateSavedTheme(saved.id);
    if (savedThemesCache.length >= THEME_MAX_SAVED) {
        themeSay('All 6 places are used. Delete a saved theme first, then use the starter theme.', 'error');
        return;
    }
    const button = document.querySelector(`#starter-themes-list [data-starter="${index}"]`);
    if (button) button.disabled = true;
    const themeData = { global: { useGlobal: false, colors: { ...starter.colors } } };
    try {
        const response = await fetch('/api/admin/saved-themes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ theme_name: starter.name, theme_data: themeData, is_active: true })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        applyThemeData(themeData);
        themeMarkUnsaved(false);
        renderSectionList();
        renderThemeControls(currentSection);
        updatePreview(currentSection);
        themeSay(`${starter.name} is saved in your themes and in use.`, 'ok');
        await loadSavedThemes();
    } catch (error) {
        console.error('Error using the starter theme:', error);
        themeSay(`${starter.name} could not be saved: ${error.message}. Try again.`, 'error');
        if (button) button.disabled = false;
    }
}
// <Jun Kai end>

// the save card says when the six places are used
function themeUpdateSaveCard() {
    const full = savedThemesCache.length >= THEME_MAX_SAVED;
    const open = document.getElementById('theme-save-open');
    const text = document.getElementById('theme-save-open-text');
    if (open) open.disabled = full;
    if (text) {
        text.textContent = full
            ? 'All 6 places are used. Delete a theme to save another one.'
            : (savedThemesCache.length ? 'Save the current colours as a theme' : 'No saved themes yet. Save the current colours as your first theme');
    }
    if (full) closeSaveThemeForm();
}

function openSaveThemeForm() {
    const form = document.getElementById('theme-save-form');
    const open = document.getElementById('theme-save-open');
    if (!form || !open || open.disabled) return;
    form.hidden = false;
    open.hidden = true;
    open.setAttribute('aria-expanded', 'true');
    document.getElementById('new-theme-name')?.focus();
}

function closeSaveThemeForm() {
    const form = document.getElementById('theme-save-form');
    const open = document.getElementById('theme-save-open');
    if (form) form.hidden = true;
    if (open) {
        open.hidden = false;
        open.setAttribute('aria-expanded', 'false');
    }
    clearSaveThemeForm();
}

function createSavedThemeCard(theme) {
    const card = document.createElement('div');
    card.className = 'ui-card theme-saved-card' + (theme.is_active ? ' active' : '');
    card.dataset.themeId = theme.id;

    const created = new Date(theme.created_at);
    const createdText = isNaN(created) ? '' : created.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
    const strip = extractPreviewColors(theme.theme_data)
        .map(color => `<span style="--theme-dot: ${themeSafeColor(color)};"></span>`).join('');

    card.innerHTML = `
        <div class="theme-saved-strip" aria-hidden="true">${strip}</div>
        <div class="theme-saved-foot">
            <div class="theme-saved-name"></div>
            ${theme.is_active
                ? '<span class="ui-tag is-green">In use</span>'
                : '<button type="button" class="ui-btn ui-btn-secondary theme-saved-apply" data-theme-action="apply">Apply</button>'}
        </div>
        <div class="theme-saved-sub">
            <span>${createdText ? 'Saved ' + escapeHtml(createdText) : ''}</span>
            <span class="theme-saved-links">
                <button type="button" class="ui-link" data-theme-action="rename">Rename</button>
                <button type="button" class="ui-link theme-link-danger" data-theme-action="delete">Delete</button>
            </span>
        </div>`;
    const name = card.querySelector('.theme-saved-name');
    name.textContent = theme.theme_name;
    name.title = theme.theme_name;
    card.querySelectorAll('[data-theme-action]').forEach(button => {
        const label = { apply: 'Apply', rename: 'Rename', delete: 'Delete' }[button.dataset.themeAction];
        button.setAttribute('aria-label', `${label} the theme ${theme.theme_name}`);
        button.addEventListener('click', () => {
            if (button.dataset.themeAction === 'apply') activateSavedTheme(theme.id);
            else if (button.dataset.themeAction === 'rename') renameSavedTheme(theme.id);
            else deleteSavedTheme(theme.id);
        });
    });
    return card;
}

// up to five different colours of a saved theme, for its strip
function extractPreviewColors(themeData) {
    const colors = [];
    try {
        const global = themeData && themeData.global ? (themeData.global.colors || themeData.global) : {};
        ['page-background', 'card-background', 'primary-text', 'secondary-text', 'button-color', 'card-border-color'].forEach(key => {
            const value = normalizeThemeColor(global[key]);
            if (value && themeSafeColor(value, '') && !colors.includes(value)) colors.push(value);
        });
    } catch (error) {
        console.error('Error extracting preview colors:', error);
    }
    while (colors.length < 4) colors.push(['#E2E8F0', '#CBD5E1', '#94A3B8', '#64748B'][colors.length]);
    return colors.slice(0, 5);
}
// <Jun Kai end>

// Capture current theme data from all sections
function captureCurrentThemeData() {
    const themeData = {};
    
    try {
        console.log('📸 Capturing theme data (Global Only)...');
        
        // Check if themeConfig exists
        if (typeof themeConfig === 'undefined' || !themeConfig.selectorMapping) {
            console.error('themeConfig or selectorMapping not defined');
            themeSay('The colour settings did not load. Reload the page and try again.', 'error'); // <Jun Kai/>
            return null;
        }
        
        // ONLY capture global section
        const sectionId = 'global';
        const sectionColors = {};
        const selectorMapping = themeConfig.selectorMapping[sectionId];
        
        if (!selectorMapping) {
            console.error('Global section not found in selectorMapping');
            return null;
        }
        
        // <Jun Kai start> The colours come from themeSettings, where the swatches put them (updateColor). This used to
        // read the hex-<section>-<colour> text boxes, which the page no longer has, so Save Theme always failed.
        // A colour that was never changed is saved with its default.
        const chosen = (themeSettings[sectionId] && themeSettings[sectionId].colors) || {};
        getColorOptionsForSection(sectionId).forEach(option => {
            const value = normalizeThemeColor(chosen[option.id] || option.default);
            if (value) sectionColors[option.id] = value;
        });
        // <Jun Kai end>
        
        // Save ONLY global colors
        if (Object.keys(sectionColors).length > 0) {
            themeData.global = {
                colors: sectionColors
            };
            console.log(`✅ Captured ${Object.keys(sectionColors).length} global colors`);
        } else {
            console.warn('⚠️ No global colors captured');
            return null;
        }
        
        console.log('✅ Captured theme data (Global Only):', themeData);
        
        // Check if we captured anything
        if (Object.keys(themeData).length === 0) {
            console.warn('⚠️ No theme data captured - no color inputs found or all empty');
            return null;
        }
        
        return themeData;
        
    } catch (error) {
        console.error('❌ Error capturing theme data:', error);
        themeSay('The current colours could not be read: ' + error.message, 'error'); // <Jun Kai/>
        return null;
    }
}

// Save current theme with user-provided name
async function saveCurrentTheme() {
    try {
        // Get theme name from input
        const themeNameInput = document.getElementById('new-theme-name');
        
        if (!themeNameInput) return;
        
        const themeName = themeNameInput.value.trim();
        
        if (!themeName) {
            themeSay('Type a name for the theme first.', 'error'); // <Jun Kai/>
            themeNameInput.focus();
            return;
        }
        
        // Check if name already exists
        const nameExists = savedThemesCache.some(theme => 
            theme.theme_name.toLowerCase() === themeName.toLowerCase()
        );
        
        if (nameExists) {
            // <Jun Kai/> the kit dialog instead of the browser box
            const saveAnyway = await uiConfirm({ title: `There is already a theme called ${themeName}`, message: 'Save this one with the same name as well?', confirmText: 'Save anyway' });
            if (!saveAnyway) return;
        }
        
        // Capture current theme data
        const themeData = captureCurrentThemeData();
        
        if (!themeData) {
            themeSay('The current colours could not be read. Reload the page and try again.', 'error'); // <Jun Kai/>
            return;
        }
        
        // Check if should set as active
        const setActive = document.getElementById('set-active-on-save');
        const isActive = setActive ? setActive.checked : false;
        
        // Show loading message
        console.log('💾 Saving theme...');
        
        // Send to server
        const response = await fetch('/api/admin/saved-themes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                theme_name: themeName,
                theme_data: themeData,
                is_active: isActive
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to save theme');
        }
        
        console.log('✅ Theme saved successfully:', data);
        // <Jun Kai start>
        if (isActive) {
            applyThemeData(themeData); // stores and applies the colours the theme was made from
            themeMarkUnsaved(false);
            renderSectionList();
            renderThemeControls(currentSection);
            updatePreview(currentSection);
        }
        themeSay(`The theme "${themeName}" is saved${isActive ? ' and in use' : ''}.`, 'ok');
        closeSaveThemeForm();
        // <Jun Kai end>
        
        // Reload saved themes
        await loadSavedThemes();
        
    } catch (error) {
        console.error('❌ Error saving theme:', error);
        themeSay('The theme was not saved: ' + error.message, 'error'); // <Jun Kai/>
    }
}

// Clear the save theme form
function clearSaveThemeForm() {
    const themeNameInput = document.getElementById('new-theme-name');
    const setActiveCheckbox = document.getElementById('set-active-on-save');
    
    if (themeNameInput) themeNameInput.value = '';
    if (setActiveCheckbox) setActiveCheckbox.checked = true;
}


// Apply theme data to color inputs
// APPLIES: ONLY Admin Overall (global) colors
// Individual page overrides remain untouched and apply automatically
function applyThemeData(themeData) {
    try {
        console.log('🎨 Applying theme data (Global Only)...', themeData);
        
        if (!themeData || typeof themeData !== 'object') {
            console.error('Invalid theme data:', themeData);
            return;
        }
        
        // Only process global section
        if (!themeData.global || !themeData.global.colors) {
            console.error('No global colors in theme data');
            return;
        }
        
        const globalColors = themeData.global.colors;
        let appliedCount = 0;
        
        console.log('  📂 Applying global colors...');
        
        // Make sure themeSettings has global section
        if (!themeSettings.global) {
            themeSettings.global = { useGlobal: false, colors: {} };
        }
        
        // Apply each color
        Object.keys(globalColors).forEach(colorKey => {
            const colorValue = globalColors[colorKey];
            
            // Update themeSettings (the actual data store)
            themeSettings.global.colors[colorKey] = colorValue;
            
            // Update both the color picker and hex input
            const colorPickerId = `color-global-${colorKey}`;
            const hexInputId = `hex-global-${colorKey}`;
            
            const colorPicker = document.getElementById(colorPickerId);
            const hexInput = document.getElementById(hexInputId);
            
            appliedCount++; // <Jun Kai/> a colour was applied to themeSettings above, with or without the old text boxes
            if (colorPicker && hexInput) {
                // Extract 6-digit hex for color picker (it doesn't support alpha)
                const sixDigitHex = colorValue.length === 9 ? colorValue.substring(0, 7) : colorValue;
                
                // Set both inputs
                colorPicker.value = sixDigitHex;
                hexInput.value = colorValue.toUpperCase();
                
                console.log(`    ✓ ${colorKey} = ${colorValue}`);
            }
        });
        
        // Save to user-specific localStorage so it persists
        const currentUserId = sessionStorage.getItem('userId') || 
                             sessionStorage.getItem('loggedUser');
        if (currentUserId) {
            const storageKey = `adminThemeSettings_user_${currentUserId}`;
            localStorage.setItem(storageKey, JSON.stringify(themeSettings));
            console.log('💾 Saved applied theme to localStorage');
        } else {
            console.warn('⚠️ No user ID found - cannot save to localStorage');
        }
        
        // Apply the theme to the actual page elements
        // This respects individual page toggles automatically
        if (typeof applyThemeSettings === 'function') {
            console.log('🔧 Applying theme to page elements...');
            applyThemeSettings();
            console.log('ℹ️  Individual page overrides will apply on top if toggles are OFF');
        } else {
            console.error('applyThemeSettings function not found!');
        }
        
        console.log(`✅ Theme applied successfully (${appliedCount} global colors)`);
        
        if (appliedCount === 0) {
            console.warn('⚠️ No colors were applied - check if color input IDs match');
        }
        
    } catch (error) {
        console.error('❌ Error applying theme data:', error);
        throw error;
    }
}

// Set a saved theme as the active theme
// This is now the ONLY way to apply a saved theme (Load button removed)
async function activateSavedTheme(themeId) {
    try {
        const theme = savedThemesCache.find(t => t.id === themeId);
        
        if (!theme) {
            showNotification('Theme not found', 'error');
            return;
        }
        
        // <Jun Kai start> Apply replaces the overall colours and saves them, so unsaved changes would be lost
        if (themeUnsaved && !(await uiConfirm({ title: `Apply ${theme.theme_name}?`, message: 'You have colour changes that are not saved. They are lost when another theme is applied.', confirmText: 'Apply anyway', danger: true }))) return;
        // <Jun Kai end>
        // Step 1: Show user what's about to happen
        console.log('🔄 Activating theme:', theme.theme_name);
        showNotification(`Applying "${theme.theme_name}"...`, 'info');
        
        // Step 2: Mark as active in database
        const response = await fetch(`/api/admin/saved-themes/${themeId}/activate`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to activate theme');
        }
        
        console.log('✅ Database updated - theme is now active');
        
        // Step 3: Apply the theme immediately to current page
        console.log('🎨 Applying theme to page...');
        applyThemeData(theme.theme_data);
        
        // Step 4: Reload saved themes UI to show new active state
        await loadSavedThemes();
        // <Jun Kai start>
        themeMarkUnsaved(false);
        renderSectionList();
        renderThemeControls(currentSection);
        updatePreview(currentSection);
        themeSay(`"${theme.theme_name}" is in use now.`, 'ok');
        // <Jun Kai end>
        
        // Step 5: Success
        console.log('✅ Theme activation complete!');
        showNotification(`"${theme.theme_name}" is now your active theme!`, 'success');
        
    } catch (error) {
        console.error('❌ Error activating theme:', error);
        showNotification('Failed to activate theme: ' + error.message, 'error');
    }
}

// Rename a saved theme
async function renameSavedTheme(themeId) {
    try {
        const theme = savedThemesCache.find(t => t.id === themeId);
        
        if (!theme) {
            showNotification('Theme not found', 'error');
            return;
        }
        
        // <Jun Kai start> the name on the card becomes a box with Save and Cancel
        updateSavedThemesUI(); // closes another rename that was open
        const card = document.querySelector(`#saved-themes-list .theme-saved-card[data-theme-id="${Number(themeId)}"]`);
        const foot = card && card.querySelector('.theme-saved-foot');
        if (!foot) return;
        foot.innerHTML = `
            <form class="theme-rename-form" novalidate>
                <label class="ui-sr-only" for="rename-theme-input">New name for the theme</label>
                <input type="text" id="rename-theme-input" class="ui-input" maxlength="100" autocomplete="off">
                <button type="submit" class="ui-btn ui-btn-primary">Save</button>
                <button type="button" class="ui-btn ui-btn-secondary" data-rename="cancel">Cancel</button>
            </form>`;
        const input = foot.querySelector('#rename-theme-input');
        input.value = theme.theme_name;
        foot.querySelector('form').addEventListener('submit', (event) => { event.preventDefault(); performRename(theme.id); });
        foot.querySelector('[data-rename="cancel"]').addEventListener('click', () => updateSavedThemesUI());
        input.addEventListener('keydown', (event) => { if (event.key === 'Escape') updateSavedThemesUI(); });
        input.focus();
        input.select();
        // <Jun Kai end>

    } catch (error) {
        console.error('❌ Error renaming theme:', error);
        showNotification('Failed to rename theme: ' + error.message, 'error');
    }
}

// Perform the rename operation
async function performRename(themeId) {
    try {
        const input = document.getElementById('rename-theme-input');
        const newName = input.value.trim();
        
        if (!newName) {
            showNotification('Please enter a theme name', 'error');
            input.focus();
            return;
        }
        
        // Check if name already exists (excluding current theme)
        const nameExists = savedThemesCache.some(theme => 
            theme.id !== themeId && theme.theme_name.toLowerCase() === newName.toLowerCase()
        );
        
        if (nameExists) {
            showNotification('A theme with this name already exists', 'error');
            input.focus();
            return;
        }
        
        const response = await fetch(`/api/admin/saved-themes/${themeId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                theme_name: newName
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to rename theme');
        }
        
        console.log('✅ Theme renamed successfully');
        showNotification('Theme renamed successfully!', 'success');
        
        // Close modal
        closeRenameModal();
        
        // Reload saved themes
        await loadSavedThemes();
        
    } catch (error) {
        console.error('❌ Error renaming theme:', error);
        showNotification('Failed to rename theme: ' + error.message, 'error');
    }
}

// Close rename modal
function closeRenameModal() {
    const modal = document.querySelector('.rename-theme-modal');
    if (modal) {
        modal.remove();
    }
}

// Delete a saved theme
async function deleteSavedTheme(themeId) {
    try {
        const theme = savedThemesCache.find(t => t.id === themeId);
        
        if (!theme) {
            showNotification('Theme not found', 'error');
            return;
        }
        
        // <Jun Kai/> a clearer question; showConfirmDialog is the kit dialog now
        const sure = await showConfirmDialog(
            `Delete ${theme.theme_name}?`,
            'The theme leaves your saved themes. It cannot be undone.',
            'Delete',
            'danger'
        );

        if (!sure) return;
        
        console.log('🗑️ Deleting theme:', theme.theme_name);
        
        const response = await fetch(`/api/admin/saved-themes/${themeId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete theme');
        }
        
        console.log('✅ Theme deleted successfully');
        showNotification(`Theme "${theme.theme_name}" deleted successfully!`, 'success');
        
        // Reload saved themes
        await loadSavedThemes();
        
    } catch (error) {
        console.error('❌ Error deleting theme:', error);
        showNotification('Failed to delete theme: ' + error.message, 'error');
    }
}

// Refresh saved themes list
async function refreshSavedThemes() {
    showNotification('Refreshing saved themes...', 'info');
    await loadSavedThemes();
    showNotification('Saved themes refreshed!', 'success');
}

// Load and apply the user's active theme on page load
// Call this function after successful login
async function loadActiveThemeOnLogin() {
    try {
        console.log('🔍 Checking for active theme...');
        
        const response = await fetch('/api/admin/saved-themes/active', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            console.warn('⚠️ Failed to load active theme:', data.error);
            applyDefaultTheme();
            // Still load individual page settings
            loadIndividualPageSettings();
            return;
        }
        
        if (data.theme) {
            console.log('✅ Active theme found:', data.theme.theme_name);
            
            // Apply theme data (global only)
            applyThemeData(data.theme.theme_data);
            
            // Load individual page settings after theme
            loadIndividualPageSettings();
            
            // Re-apply to ensure individual pages override
            if (typeof applyThemeSettings === 'function') {
                applyThemeSettings();
            }
            
            console.log('🎨 Active theme applied with individual page overrides');
        } else {
            console.log('ℹ️ No active theme set - applying default colors');
            applyDefaultTheme();
            // Still load individual page settings
            loadIndividualPageSettings();
        }
        
    } catch (error) {
        console.error('❌ Error loading active theme:', error);
        applyDefaultTheme();
        // Still load individual page settings
        loadIndividualPageSettings();
    }
}

function applyDefaultTheme() {
    try {
        console.log('🎨 Applying default theme colors...');
        
        // Check if getDefaultThemeSettings exists
        if (typeof getDefaultThemeSettings !== 'function') {
            console.error('getDefaultThemeSettings function not found');
            return;
        }
        
        // Get default theme settings
        themeSettings = getDefaultThemeSettings();
        
        // Apply the default theme to the page
        if (typeof applyThemeSettings === 'function') {
            applyThemeSettings();
            console.log('✅ Default theme colors applied');
        } else {
            console.error('applyThemeSettings function not found');
        }
        
    } catch (error) {
        console.error('❌ Error applying default theme:', error);
    }
}

// Initialize saved themes section when theme settings page loads
function initSavedThemesSection() {
    console.log('🎨 Initializing saved themes section...');
    
    // Check if user is logged in
    const loggedUser = sessionStorage.getItem('loggedUser');
    
    if (!loggedUser) {
        console.warn('⚠️ User not logged in. Skipping saved themes load.');
        return;
    }
    
    // Load saved themes
    loadSavedThemes();
}

// Show confirmation dialog
// <Jun Kai/> the kit dialog (uiKit.js) instead of the browser box; same answer: a Promise of true or false
function showConfirmDialog(title, message, confirmText = 'Confirm', type = 'primary') {
    return uiConfirm({ title, message, confirmText, danger: type === 'danger' });
}
