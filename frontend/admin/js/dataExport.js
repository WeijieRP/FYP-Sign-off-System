// Owner: Role 3, Jun Kai. Previous team: none marked.
// Part 16/30 of the admin page: data export (load order in admin.html).
// ==================== 15. DATA EXPORT MANAGEMENT ====================

// <Jun Kai start>
// Data Export A: the nine downloads are always shown, greyed out until the password is typed in the bar on top.
// The server keeps the unlock for 30 minutes (backend/features/archive/exportRoutes.js); the page follows that time and
// locks itself again when it runs out or when the server answers that the unlock has ended.
let dataExportLockTimer = null;
let dataExportPageReady = false;

function prepareDataExportPage() {
    if (dataExportPageReady) return;
    dataExportPageReady = true;
    document.querySelectorAll('#data-export-page [data-fb-icon]').forEach((slot) => {
        slot.innerHTML = uiIcon(slot.dataset.fbIcon, slot.closest('button') ? 15 : 20);
    });
    document.getElementById('data-export-cards').addEventListener('click', (event) => {
        const button = event.target.closest('.dx-download');
        if (button && !button.disabled) downloadExport(button.dataset.export, button);
    });
}

function setDataExportStatus(tone, message) {
    const el = document.getElementById('dx-status');
    if (!el) return;
    el.innerHTML = message ? `<span class="ui-pill ui-pill-${tone}"><span class="ui-dot"></span>${escapeHtmlSafe(message)}</span>` : '';
}

// Shows the page locked or unlocked. `minutesLeft` is how long the server keeps the unlock.
function showDataExportLock(unlocked, minutesLeft) {
    const page = document.getElementById('data-export-page');
    const bar = document.getElementById('data-export-unlock-form');
    page.classList.toggle('is-locked', !unlocked);
    bar.classList.toggle('is-unlocked', unlocked);
    document.getElementById('dx-unlock-icon').innerHTML = uiIcon(unlocked ? 'unlock' : 'lock', 20);
    document.getElementById('dx-unlock-title').textContent = unlocked
        ? 'The downloads are unlocked'
        : 'Type your System Admin password to unlock the downloads';
    if (unlocked) {
        updateExportSessionInfo(minutesLeft);
    } else {
        document.getElementById('export-session-info').textContent = 'Exports hold personal data: names, encrypted emails, feedback, photos and admin activity. The unlock lasts 30 minutes.';
    }
    document.querySelectorAll('#data-export-cards .dx-download').forEach((button) => {
        button.disabled = !unlocked;
        button.innerHTML = unlocked
            ? `${uiIcon('download', 15)}<span>Download ${escapeHtmlSafe(button.dataset.format)}</span>`
            : `${uiIcon('lock', 14)}<span>Locked</span>`;
    });
    clearTimeout(dataExportLockTimer);
    if (unlocked) {
        dataExportLockTimer = setTimeout(() => {
            dataExportUnlocked = false;
            dataExportUnlockTime = null;
            showDataExportLock(false);
            setDataExportStatus('info', 'The 30 minutes are over, so the downloads are locked again.');
        }, Math.max(1, minutesLeft) * 60000);
    }
}
// <Jun Kai end>

// Initialize data export page when tab is clicked
function initDataExportPage() {
    const userRole = sessionStorage.getItem('userRole');

    // Check if user is system admin
    if (userRole !== 'system_admin') {
        showNotification('Access denied. System Administrator privileges required.', 'error'); // <Jun Kai/> a kit message instead of a browser box
        showPage('dashboard');
        return false;
    }

    // Pre-fill username
    const username = sessionStorage.getItem('loggedUser');
    document.getElementById('export-username').value = username;

    // <Jun Kai start> keep the page unlocked while the server-side unlock (30 minutes) is still valid
    prepareDataExportPage();
    const unlockAgeMinutes = dataExportUnlocked && dataExportUnlockTime
        ? (Date.now() - new Date(dataExportUnlockTime).getTime()) / 60000
        : Infinity;
    const stillUnlocked = unlockAgeMinutes < 30;
    showDataExportLock(stillUnlocked, Math.max(1, Math.round(30 - unlockAgeMinutes)));
    // <Jun Kai end>

    return true;
}

// Unlock data export with password
async function unlockDataExport(event) {
    event.preventDefault();

    const username = sessionStorage.getItem('loggedUser');
    const userRole = sessionStorage.getItem('userRole');
    const password = document.getElementById('export-password').value;
    const errorDiv = document.getElementById('export-unlock-error');
    // <Jun Kai start> the error line uses `hidden`, and the button waits while the password is checked
    const showError = (text) => { errorDiv.textContent = text; errorDiv.hidden = false; };
    const button = document.getElementById('export-unlock-btn');
    // <Jun Kai end>

    // Check if user is system admin
    if (userRole !== 'system_admin') {
        showError('Access denied. System Administrator privileges required.');
        return;
    }

    if (!password) {
        showError('Please enter your password');
        return;
    }

    try {
        button.disabled = true; // <Jun Kai/>
        const response = await fetch('/api/admin/data-export/unlock', {
            method: 'POST',
            credentials: 'same-origin', // Include session cookie
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            // Store unlock status
            dataExportUnlocked = true;
            dataExportUnlockTime = new Date();

            // <Jun Kai start> the same page unlocks: the bar turns green and the downloads can be pressed
            showDataExportLock(true, 30);
            setDataExportStatus('', '');
            // <Jun Kai end>

            // Clear password field
            document.getElementById('export-password').value = '';
            errorDiv.hidden = true; // <Jun Kai/>

            console.log('✅ Data export unlocked for 30 minutes');
        } else {
            showError(data.error || 'Invalid password'); // <Jun Kai/>
        }
    } catch (error) {
        console.error('Error unlocking data export:', error);
        showError('Error connecting to server'); // <Jun Kai/>
    } finally {
        button.disabled = false; // <Jun Kai/>
    }
}

// Update session info display
function updateExportSessionInfo(expiresInMinutes) {
    const infoElement = document.getElementById('export-session-info');
    if (infoElement) {
        const expiryTime = new Date(Date.now() + expiresInMinutes * 60000);
        // <Jun Kai/> one sentence in the green bar
        infoElement.textContent = `They stay open until ${expiryTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. After that the password is asked again.`;
    }
}

// Download export file (CSV or ZIP)
async function downloadExport(exportType, button) {
    // <Jun Kai start> the pressed card says it is working, and the result is a status line instead of an alert box
    const label = button ? button.innerHTML : '';
    if (button) {
        button.disabled = true;
        button.innerHTML = `${uiIcon('clock', 15)}<span>Preparing...</span>`;
    }
    setDataExportStatus('info', 'Preparing the download. Photo downloads can take a minute.');
    // <Jun Kai end>
    try {
        const username = sessionStorage.getItem('loggedUser');
        const userRole = sessionStorage.getItem('userRole');

        if (!username || userRole !== 'system_admin') {
            throw new Error('System Administrator privileges required'); // <Jun Kai/>
        }

        console.log(`🔥 Downloading export: ${exportType}`);

        const response = await fetch(`/api/admin/data-export/${exportType}`, {
            method: 'GET',
            credentials: 'same-origin'
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({})); // <Jun Kai/>
            // <Jun Kai start> the server ended the unlock (30 minutes or a restart): lock the page again
            if (response.status === 401) {
                dataExportUnlocked = false;
                dataExportUnlockTime = null;
                showDataExportLock(false);
                setDataExportStatus('down', 'The unlock has ended. Type the password again to download.');
                return;
            }
            // <Jun Kai end>
            throw new Error(errorData.error || 'Download failed');
        }

        // Get filename from Content-Disposition header or create default
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'export.csv';

        if (contentDisposition) {
            const match = contentDisposition.match(/filename=(.+)/);
            if (match) {
                filename = match[1].replace(/['"]/g, '');
            }
        }

        // Download file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        console.log(`✅ Download complete: ${filename}`);
        setDataExportStatus('ok', `Downloaded ${filename}`); // <Jun Kai/>

    } catch (error) {
        console.error('❌ Download error:', error);
        setDataExportStatus('down', `Could not download: ${error.message}`); // <Jun Kai/>
    } finally {
        // <Jun Kai start>
        if (button && dataExportUnlocked) {
            button.disabled = false;
            button.innerHTML = label;
        }
        // <Jun Kai end>
    }
}
