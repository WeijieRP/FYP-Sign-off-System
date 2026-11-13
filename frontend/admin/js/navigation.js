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
        const safeBluetoothId = String(asset.bluetoothId || '').replace(/'/g, "\\'");

        return `
            <article class="asset-card">
                <div class="asset-card-header">
                    <div>
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
                    <button class="btn-secondary" onclick="showAddAssetModal('${safeBluetoothId}')">Edit</button>
                    <button class="btn-warning" onclick="deleteAsset('${safeBluetoothId}')">Delete</button>
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

function closeAssetModal() {
    const modal = document.getElementById('asset-modal');
    if (modal) modal.remove();
}

function showAddAssetModal(defaultBluetoothId = '') {
    closeAssetModal();

    const modal = document.createElement('div');
    modal.id = 'asset-modal';
    modal.className = 'asset-modal';
    modal.innerHTML = `
        <div class="asset-modal-panel">
            <div class="asset-modal-header">
                <div>
                    <h3>${defaultBluetoothId ? 'Edit Asset' : 'Add Bluetooth Asset'}</h3>
                    <p>${defaultBluetoothId ? 'Update the asset details for this Bluetooth ID.' : 'Enter the Bluetooth ID first so the kiosk can match the device when it appears nearby.'}</p>
                </div>
                <button type="button" class="asset-modal-close" onclick="closeAssetModal()">×</button>
            </div>

            <form id="asset-form">
                <div class="asset-form-grid">
                    <div class="full-span">
                        <label for="asset-bluetooth-id">Bluetooth ID</label>
                        <input id="asset-bluetooth-id" name="bluetoothId" type="text" placeholder="AA:BB:CC:DD:EE:FF" value="${escapeAssetHtml(defaultBluetoothId)}" required>
                    </div>
                    <div>
                        <label for="asset-name">Asset Name</label>
                        <input id="asset-name" name="name" type="text" placeholder="Main Kiosk Tablet">
                    </div>
                    <div>
                        <label for="asset-category">Category</label>
                        <input id="asset-category" name="category" type="text" placeholder="Tablet / Tag / Sensor">
                    </div>
                    <div>
                        <label for="asset-location">Location</label>
                        <input id="asset-location" name="location" type="text" placeholder="Level 3, ESG Centre">
                    </div>
                    <div class="full-span">
                        <label for="asset-notes">Notes</label>
                        <textarea id="asset-notes" name="notes" placeholder="Any extra info for the asset."></textarea>
                    </div>
                </div>

                <div class="asset-form-actions">
                    <button type="button" class="btn-secondary" onclick="closeAssetModal()">Cancel</button>
                    <button type="submit" class="btn-primary">Save Asset</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    if (defaultBluetoothId) {
        const current = bluetoothAssetData.find((asset) => asset.bluetoothId === defaultBluetoothId.toUpperCase());
        if (current) {
            document.getElementById('asset-name').value = current.name || '';
            document.getElementById('asset-category').value = current.category || '';
            document.getElementById('asset-location').value = current.location || '';
            document.getElementById('asset-notes').value = current.notes || '';
        }
    }

    document.getElementById('asset-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const payload = Object.fromEntries(formData.entries());

        try {
            await fetchAssetJson('/api/admin/assets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            closeAssetModal();
            await loadAssetData();
            showNotification('Asset saved successfully', 'success');
        } catch (error) {
            console.error('Asset save error:', error);
            showNotification(error.message || 'Failed to save asset', 'error');
        }
    });
}

async function deleteAsset(bluetoothId) {
    if (!bluetoothId) return;
    const confirmed = confirm(`Delete the asset with Bluetooth ID "${bluetoothId}"?`);
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
    if (adminPages.includes(pageName) && userRole !== 'system_admin') {
        alert('Access denied. System Administrator privileges required.');
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
    
    // Load data for specific pages
    if (pageName === 'dashboard') {
        loadDashboardData();
    } else if (pageName === 'feedback-data') {
        loadFeedbackData();
    } else if (pageName === 'feedback-report') {
        loadFlaggedFeedback();
        loadVisitorTrendsData();
        loadCacheStorageMode();
    } else if (pageName === 'digital-tree') {
        loadDigitalTreeData();
    } else if (pageName === 'health') {
        loadHealth();
        startHealthPolling();
    // <Jun Kai start>
    } else if (pageName === 'hardware') {
        loadHardware();
        startHardwarePolling();
    // <Jun Kai end>
    } else if (pageName === 'tree-adjustment') {
        initTreeStageMode();
        loadTreeStageSelection();
        loadTreeTitleSettings();
        updateAutoStagePreview();
        loadTree3dSettings();
    } else if (pageName === 'pledgeboard') {
        loadAdminPledgeboard();
    } else if (pageName === 'overlay') {
        loadOverlayData();
    } else if (pageName === 'asset') {
        loadAssetData();
    } else if (pageName === 'users') {
        loadUserManagementData();
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

