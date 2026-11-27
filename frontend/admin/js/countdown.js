// Owner: Role 3, Jun Kai. Previous team: Bernissa (1).
// Part 27/30 of the admin page: countdown timer (load order in admin.html).
// ==================== 29. TIMER COUNTDOWN MANAGEMENT (DONE BY BERNISSA) ====================

const TIMER_API_URL = "/api/admin/countdown-management";

// Get timer countdown DOM elements
function getTimerCountdownEls() {
    return {
        input: document.getElementById("timer-countdown-seconds"),
        saveBtn: document.getElementById("save-timer-countdown-btn"),
        refreshBtn: document.getElementById("refresh-timer-btn")
    };
}

// <Jun Kai start> the redesigned page: a pill under the title for saved or failed, and button text without wiping the icon
function setTimerStatus(type, message) {
    const status = document.getElementById('timer-countdown-status');
    if (!status) return;
    status.innerHTML = type ? uiPill(type === 'success' ? 'ok' : 'down', message) : '';
}

function setTimerButtonText(btn, text) {
    const label = btn.querySelector('.pt-btn-text');
    if (label) label.textContent = text;
}

// a quick pick fills the field; Save still stores it
function pickTimerCountdown(seconds) {
    const { input } = getTimerCountdownEls();
    if (!input) return;
    input.value = String(seconds);
    validateTimerCountdown();
}

// the quick pick that matches the field is marked
function markTimerQuickPick() {
    const input = document.getElementById('timer-countdown-seconds');
    document.querySelectorAll('#timer-quick button').forEach((btn) => {
        const on = Boolean(input && input.value !== '' && Number(btn.dataset.seconds) === Number(input.value));
        btn.classList.toggle('is-set', on);
        btn.setAttribute('aria-pressed', String(on));
    });
}

// the preview: the kiosk shows the number in a round badge on the camera view and counts down to 1 (feedback photo.js).
// An empty field saves as 0, so it shows as no countdown too.
function renderTimerPreview() {
    const input = document.getElementById('timer-countdown-seconds');
    const badge = document.getElementById('pt-preview-badge');
    const caption = document.getElementById('pt-preview-caption');
    if (!input || !badge || !caption) return;
    const seconds = Number(input.value) || 0;
    badge.hidden = seconds === 0;
    badge.textContent = String(seconds);
    caption.textContent = seconds === 0
        ? 'No countdown: the kiosk takes the photo as soon as the visitor presses Capture Photo.'
        : `The kiosk counts down from ${seconds} to 1 on the camera view, then takes the photo.`;
}
// <Jun Kai end>

// Load timer countdown setting from server
async function loadTimerCountdownSetting() {
    console.log('⏱️ Loading timer countdown setting...');
    
    const { input, saveBtn, refreshBtn } = getTimerCountdownEls();
    
    if (!input || !saveBtn || !refreshBtn) {
        console.error('❌ Timer elements not found');
        return;
    }

    // Handle REFRESH button state
    refreshBtn.disabled = true;
    setTimerButtonText(refreshBtn, 'Loading'); // <Jun Kai/>
    setTimerStatus('', ''); // <Jun Kai/>

    // Keep save button disabled during load (but don't change its text)
    saveBtn.disabled = true;

    try {
        console.log('📡 Fetching from:', TIMER_API_URL);
        const res = await fetch(TIMER_API_URL, { 
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        
        console.log('📥 Response status:', res.status, res.statusText);
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const data = await res.json();
        console.log('📥 Received data:', data);

        if (!data.success) {
            throw new Error(data.error || 'API returned unsuccessful');
        }

        const seconds = Number(data?.countdown_seconds);
        const finalValue = Number.isInteger(seconds) && seconds >= 0 ? seconds : 3;
        
        console.log('⚙️ Setting input value to:', finalValue);
        input.value = finalValue;
        input.dataset.originalValue = String(finalValue);
        
        validateTimerCountdown();
        console.log('✅ Timer countdown loaded successfully');
        
    } catch (err) {
        console.error("❌ Failed to load countdown:", err);
        setTimerStatus('error', 'Failed to load the countdown: ' + err.message); // <Jun Kai/>
        
        // Set default values
        input.value = 3;
        input.dataset.originalValue = "3";
        validateTimerCountdown();
    } finally {
        // Restore REFRESH button to normal
        refreshBtn.disabled = false;
        setTimerButtonText(refreshBtn, 'Refresh'); // <Jun Kai/>
        
        // Re-validate save button state
        validateTimerCountdown();
    }
}

// Save timer countdown setting to server
async function saveTimerCountdownSetting() {
    const { input, saveBtn } = getTimerCountdownEls();
    if (!input || !saveBtn) return;

    const value = Number(input.value);
    
    // Validate input
    if (!Number.isInteger(value) || value < 0) {
        setTimerStatus('error', 'Please enter a whole number 0 or higher.'); // <Jun Kai/>
        return;
    }

    saveBtn.disabled = true;
    setTimerButtonText(saveBtn, 'Saving'); // <Jun Kai/>

    try {
        console.log('💾 Attempting to save countdown:', value);
        console.log('📤 Sending PUT request to:', TIMER_API_URL);
        console.log('Request body:', { countdown_seconds: value });

        const res = await fetch(TIMER_API_URL, {
            method: "PUT",
            headers: { 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({ countdown_seconds: value })
        });

        console.log('📥 Response status:', res.status, res.statusText);
        
        const data = await res.json();
        console.log('📥 Response data:', data);

        // Check for HTTP errors
        if (!res.ok) {
            throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
        }
        
        // Check for API success
        if (!data.success) {
            throw new Error(data.error || 'Failed to save');
        }

        console.log('✅ Successfully saved countdown:', data);
        
        // Update original value in dataset
        input.dataset.originalValue = String(value);
        
        // Re-validate (will disable save button since values now match)
        validateTimerCountdown();
        
        // Show success message
        setTimerStatus('success', value === 0 ? 'Saved: no countdown, the photo is taken at once' : `Saved: a ${value} second countdown`); // <Jun Kai/>
        
        // Log server response
        console.log('Server confirmed countdown_seconds:', data.countdown_seconds);
        
    } catch (err) {
        console.error('❌ Error saving timer countdown:', err);
        
        // Show detailed error message
        let errorMessage = 'Failed to save countdown: ' + err.message;

        setTimerStatus('error', errorMessage); // <Jun Kai/>

        // Re-enable save button on error
        saveBtn.disabled = false;
    } finally {
        setTimerButtonText(saveBtn, 'Save'); // <Jun Kai/>
    }
}

// Validate timer countdown input
function validateTimerCountdown() {
    const { input, saveBtn } = getTimerCountdownEls();
    if (!input || !saveBtn) return;

    input.value = input.value.replace(/[^0-9]/g, '');
    markTimerQuickPick(); // <Jun Kai/>
    renderTimerPreview(); // <Jun Kai/>

    const value = Number(input.value);
    const originalValue = Number(input.dataset.originalValue || 0);
    const isValid = Number.isInteger(value) && value >= 0;

    if (!isValid) {
        input.classList.add("input-error");
        saveBtn.disabled = true;
        return;
    }

    input.classList.remove("input-error");
    
    // Enable save button only if value has changed
    saveBtn.disabled = (value === originalValue);
}

