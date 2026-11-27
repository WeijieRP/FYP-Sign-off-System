// Owner: shared. Previous team: Nick (2).
// Part 18/30 of the admin page: page navigation and Bluetooth asset page (load order in admin.html).
// ==================== 17. NAVIGATION & PAGE MANAGEMENT ====================

let bluetoothAssetData = [];

function getAssetElements() {
    return {
        grid: document.getElementById('asset-grid'),
        totalCount: document.getElementById('asset-total-count'),
        detectedCount: document.getElementById('asset-detected-count'),
        offlineCount: document.getElementById('asset-offline-count')
    };
}

function escapeAssetHtml(value) {
    if (typeof window.escapeHtml === 'function') {
        return window.escapeHtml(value);
    }

    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatAssetDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
}

async function fetchAssetJson(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
}

function renderBluetoothAssets() {
    const { grid, totalCount, detectedCount, offlineCount } = getAssetElements();
    if (!grid) return;

    const total = bluetoothAssetData.length;
    const detected = bluetoothAssetData.filter((asset) => asset.isDetected).length;
    const offline = Math.max(total - detected, 0);

    if (totalCount) totalCount.textContent = String(total);
    if (detectedCount) detectedCount.textContent = String(detected);
    if (offlineCount) offlineCount.textContent = String(offline);

    if (!total) {
        grid.innerHTML = `
            <div class="asset-empty-state">
                <strong>No Bluetooth assets yet</strong>
                Add the first Bluetooth ID to start building your asset registry.
            </div>
        `;
        return;
    }

    grid.innerHTML = bluetoothAssetData.map((asset) => {
        const name = escapeAssetHtml(asset.name || asset.bluetoothId);
        const bluetoothId = escapeAssetHtml(asset.bluetoothId || '-');
        const category = escapeAssetHtml(asset.category || '-');
        const location = escapeAssetHtml(asset.location || '-');
        const notes = escapeAssetHtml(asset.notes || '-');
        const lastSeen = formatAssetDate(asset.lastSeen || asset.addedAt);
        const statusClass = asset.isDetected ? 'detected' : 'offline';
        const statusText = asset.isDetected ? 'Detected Nearby' : 'Not Detected';
        const safeBluetoothId = String(asset.bluetoothId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); // <Jun Kai/> the backslash first

        return `
            <article class="asset-card">
                <div class="asset-card-header">
                    <span class="asset-card-icon" aria-hidden="true">${uiIcon(/tablet/i.test(asset.category || '') ? 'tablet' : 'bluetooth', 18)}</span><!-- <Jun Kai/> -->
                    <div class="asset-card-heading">
                        <div class="asset-card-title">${name}</div>
                        <div class="asset-card-subtitle">Bluetooth ID: ${bluetoothId}</div>
                    </div>
                    <span class="asset-status-pill ${statusClass}">${statusText}</span>
                </div>

                <div class="asset-details">
                    <div class="asset-detail-row">
                        <span class="asset-detail-label">Category</span>
                        <span class="asset-detail-value">${category}</span>
                    </div>
                    <div class="asset-detail-row">
                        <span class="asset-detail-label">Location</span>
                        <span class="asset-detail-value">${location}</span>
                    </div>
                    <div class="asset-detail-row">
                        <span class="asset-detail-label">Notes</span>
                        <span class="asset-detail-value">${notes}</span>
                    </div>
                    <div class="asset-detail-row">
                        <span class="asset-detail-label">Last Seen</span>
                        <span class="asset-detail-value">${lastSeen}</span>
                    </div>
                </div>

                <div class="asset-card-actions">
                    <!-- <Jun Kai start> kit icon buttons; the name is in the label for screen readers -->
                    <button type="button" class="ui-btn ui-btn-icon" title="Edit" aria-label="Edit ${name}" onclick="showAddAssetModal('${safeBluetoothId}')">${uiIcon('edit', 16)}</button>
                    <button type="button" class="ui-btn ui-btn-icon ui-danger" title="Delete" aria-label="Delete ${name}" onclick="deleteAsset('${safeBluetoothId}')">${uiIcon('trash', 16)}</button>
                    <!-- <Jun Kai end> -->
                </div>
            </article>
        `;
    }).join('');
}

async function loadAssetData() {
    const { grid } = getAssetElements();
    if (!grid) return;

    grid.innerHTML = '<div class="asset-empty-state">Loading assets...</div>';

    try {
        const data = await fetchAssetJson('/api/admin/assets');
        bluetoothAssetData = Array.isArray(data.assets) ? data.assets : [];
        renderBluetoothAssets();
    } catch (error) {
        console.error('Asset load error:', error);
        grid.innerHTML = `
            <div class="asset-empty-state" style="color:#b91c1c;">
                <strong>Failed to load assets</strong>
                Please try again after checking the admin API.
            </div>
        `;
    }
}

function refreshAssetData() {
    loadAssetData();
}

// <Jun Kai start> The asset window in the kit look (a native dialog, 26 Nov 2026: every pop-up of the admin page in the
// kit look). Same fields, names and route as before; a problem shows inside the window, because a toast would sit under it.
const assetDialogOpener = { element: null };

function closeAssetModal() {
    const modal = document.getElementById('asset-modal');
    if (!modal) return;
    if (!modal.open) { modal.remove(); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { modal.close(); return; }
    if (modal.classList.contains('is-closing')) return;
    modal.classList.add('is-closing');
    setTimeout(() => modal.close(), 150);
}

function showAddAssetModal(defaultBluetoothId = '') {
    document.getElementById('asset-modal')?.remove();

    const modal = document.createElement('dialog');
    modal.id = 'asset-modal';
    modal.className = 'va-dialog asset-dialog';
    modal.setAttribute('aria-labelledby', 'asset-modal-title');
    modal.setAttribute('aria-describedby', 'asset-modal-sub');
    modal.innerHTML = `
        <form id="asset-form" class="va-dialog-inner" novalidate>
            <div class="va-dialog-head">
                <div>
                    <h3 id="asset-modal-title">${defaultBluetoothId ? 'Edit asset' : 'Add Bluetooth asset'}</h3>
                    <div class="va-dialog-sub" id="asset-modal-sub">${defaultBluetoothId ? 'Update the asset details for this Bluetooth ID.' : 'Enter the Bluetooth ID first so the kiosk can match the device when it appears nearby.'}</div>
                </div>
                <button type="button" class="ui-btn ui-btn-icon va-dialog-close" onclick="closeAssetModal()" aria-label="Close" title="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div class="va-dialog-body">
                <div class="asset-dialog-grid">
                    <div class="ui-field ui-field-wide">
                        <label class="ui-label" for="asset-bluetooth-id">Bluetooth ID</label>
                        <input class="ui-input" id="asset-bluetooth-id" name="bluetoothId" type="text" placeholder="AA:BB:CC:DD:EE:FF" value="${escapeAssetHtml(defaultBluetoothId)}" autocomplete="off" required>
                    </div>
                    <div class="ui-field">
                        <label class="ui-label" for="asset-name">Asset name</label>
                        <input class="ui-input" id="asset-name" name="name" type="text" placeholder="Main Kiosk Tablet">
                    </div>
                    <div class="ui-field">
                        <label class="ui-label" for="asset-category">Category</label>
                        <input class="ui-input" id="asset-category" name="category" type="text" placeholder="Tablet / Tag / Sensor">
                    </div>
                    <div class="ui-field ui-field-wide">
                        <label class="ui-label" for="asset-location">Location</label>
                        <input class="ui-input" id="asset-location" name="location" type="text" placeholder="Level 3, RP Xperience Centre">
                    </div>
                    <div class="ui-field ui-field-wide">
                        <label class="ui-label" for="asset-notes">Notes</label>
                        <textarea class="ui-input" id="asset-notes" name="notes" rows="3" placeholder="Any extra info for the asset."></textarea>
                    </div>
                </div>
                <div class="va-form-error" id="asset-form-error" role="alert" hidden></div>
            </div>
            <div class="va-dialog-foot">
                <button type="button" class="ui-btn ui-btn-secondary" onclick="closeAssetModal()">Cancel</button>
                <button type="submit" class="ui-btn ui-btn-primary" id="asset-save-btn">Save asset</button>
            </div>
        </form>
    `;

    if (defaultBluetoothId) {
        const current = bluetoothAssetData.find((asset) => asset.bluetoothId === defaultBluetoothId.toUpperCase());
        if (current) {
            modal.querySelector('#asset-name').value = current.name || '';
            modal.querySelector('#asset-category').value = current.category || '';
            modal.querySelector('#asset-location').value = current.location || '';
            modal.querySelector('#asset-notes').value = current.notes || '';
        }
    }

    const errorBox = modal.querySelector('#asset-form-error');
    const saveButton = modal.querySelector('#asset-save-btn');
    let saving = false;
    modal.querySelector('#asset-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        if (saving) return;
        errorBox.hidden = true;
        const idField = modal.querySelector('#asset-bluetooth-id');
        if (!idField.value.trim()) {
            errorBox.textContent = 'Type the Bluetooth ID first.';
            errorBox.hidden = false;
            idField.focus();
            return;
        }
        const formData = new FormData(event.currentTarget);
        const payload = Object.fromEntries(formData.entries());

        saving = true;
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';
        try {
            await fetchAssetJson('/api/admin/assets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            saving = false;
            closeAssetModal();
            await loadAssetData();
            showNotification('Asset saved successfully', 'success');
        } catch (error) {
            console.error('Asset save error:', error);
            saving = false;
            saveButton.disabled = false;
            saveButton.textContent = 'Save asset';
            errorBox.textContent = error.message || 'Failed to save asset';
            errorBox.hidden = false;
        }
    });
    modal.addEventListener('cancel', (event) => { event.preventDefault(); if (!saving) closeAssetModal(); });
    modal.addEventListener('close', () => {
        modal.remove();
        const opener = assetDialogOpener.element;
        assetDialogOpener.element = null;
        if (opener && document.contains(opener) && opener.getClientRects().length) opener.focus({ preventScroll: true });
    });
    assetDialogOpener.element = document.activeElement;
    document.body.appendChild(modal);
    modal.showModal();
    modal.querySelector(defaultBluetoothId ? '#asset-name' : '#asset-bluetooth-id').focus();
}
// <Jun Kai end>

async function deleteAsset(bluetoothId) {
    if (!bluetoothId) return;
    // <Jun Kai/> a kit window instead of the browser's box
    const confirmed = await uiConfirm({ title: 'Delete this asset?', message: `The saved details of Bluetooth ID ${bluetoothId} are deleted.`, confirmText: 'Delete', danger: true });
    if (!confirmed) return;

    try {
        await fetchAssetJson(`/api/admin/assets/${encodeURIComponent(bluetoothId)}`, {
            method: 'DELETE'
        });
        await loadAssetData();
        showNotification('Asset deleted successfully', 'success');
    } catch (error) {
        console.error('Asset delete error:', error);
        showNotification(error.message || 'Failed to delete asset', 'error');
    }
}

// Show page with role-based access control
function showPage(pageName) {

    const userRole = sessionStorage.getItem('userRole');
    
    // Check if user is trying to access admin pages without system_admin role
    const adminPages = ['overlay', 'users', 'audit', 'questions', 'archive', 'lost-found', 'data-export', 'badge-email-templates', 'parameter-adjustment', 'asset']; // changes made by nick
    // <Jun Kai start>
    adminPages.push('visitor-archive');
    // <Jun Kai end>
    if (adminPages.includes(pageName) && userRole !== 'system_admin') {
        showNotification('Access denied. System Administrator privileges required.', 'error'); // <Jun Kai/> a kit message instead of a browser box
        return;
    }
    
    // Special handling for data export page
    if (pageName === 'data-export') {
        if (!initDataExportPage()) {
            return;
        }
    }
    
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(pageName + '-page').classList.add('active');
    
    // Highlight the sidebar item (dashboard quick actions are not inside a .nav-item)
    const clickedNav = event && event.target && event.target.closest ? event.target.closest('.nav-item') : null;
    const navItem = clickedNav || document.querySelector(`.nav-item[onclick*="showPage('${pageName}')"]`);
    if (navItem) navItem.classList.add('active');
    // <Jun Kai start> the count of incidents that need a look, next to Incidents in the sidebar, stays current on every page
    if (typeof refreshIncidentsBadge === 'function') refreshIncidentsBadge();
    // <Jun Kai end>

    // Load data for specific pages
    if (pageName === 'dashboard') {
        loadDashboardData();
    } else if (pageName === 'feedback-data') {
        loadFeedbackData();
    } else if (pageName === 'feedback-report') {
        loadFlaggedFeedback();
        loadVisitorTrendsData();
        loadCacheStorageMode();
        // <Jun Kai start> the AI analysis modes follow the Local AI models switch
        if (typeof refreshAnalysisModes === 'function') refreshAnalysisModes();
        // <Jun Kai end>
    } else if (pageName === 'digital-tree') {
        loadDigitalTreeData();
    } else if (pageName === 'health') {
        loadHealth();
        startHealthPolling();
    // <Jun Kai start>
    } else if (pageName === 'incidents') {
        loadIncidentsPage();
        startIncidentsPolling();
    } else if (pageName === 'hardware') {
        loadHardware();
        startHardwarePolling();
    } else if (pageName === 'visitor-archive') {
        vaLoad();
        vaStartPolling();
    // <Jun Kai end>
    } else if (pageName === 'tree-adjustment') {
        initTreeStageMode();
        loadTreeStageSelection();
        loadTreeTitleSettings();
        updateAutoStagePreview();
        loadTree3dSettings();
        // The 2D Tree Background, Leaf and VIP Leaf pickers with their previews and the leaf sizes (as Refresh
        // Data loads them): before, they only filled after visiting Digital Tree or Parameter Adjustment first.
        loadParameters();
        loadAvailableTreeBackgrounds();
    } else if (pageName === 'pledgeboard') {
        loadAdminPledgeboard();
    } else if (pageName === 'overlay') {
        loadOverlayData();
    } else if (pageName === 'asset') {
        loadAssetData();
    } else if (pageName === 'users') {
        loadUserManagementData();
        loadIdleSignOutCard(); // <Jun Kai/> the Sign-in card (core.js)
    } else if (pageName === 'questions') {
        loadQuestionManagementData();
    } else if (pageName === 'audit') {
        loadAuditLogs();
    // changes made by nick
    } else if (pageName === 'lost-found') {
        loadLostFoundReports();
    } else if (pageName === 'archive') {
        loadArchiveData();
        initializeDeletionControls();
    } else if (pageName === 'theme-settings') {
        initThemeSettings();
    } else if (pageName === 'timer-countdown') {
        loadTimerCountdownSetting();
    } else if (pageName === 'server-schedule') {
        loadSchedules();
        loadServerMode();
        checkServerStatus();
        loadAutomationStatus();
        startServerStatusPolling();
    } else if (pageName === 'form-management') {
    loadFormUISettings();
    } else if (pageName === 'Feedback-page-QR') {
    loadLandingPageQR();
    } else if (pageName === 'email-management') {
    loadEmailConfig();
    } else if (pageName === 'badge-email-templates') {
    loadBadgeEmailTemplates();
    } else if (pageName === 'parameter-adjustment') {
    loadParameters();
    } else if (pageName === 'vip') {
    loadVipManagementData();
    }
    
    
}

function openPulsePage() {
    window.location.href = '/pulse';
}

// Initialize archive page
function initializeArchivePage() {
    loadArchiveData();
    initializeDeletionControls();
}

