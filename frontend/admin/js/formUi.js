// Owner: Role 1, Zihan. Previous team: none marked.
// Part 24/30 of the admin page: feedback form text and layout (load order in admin.html).
// ===================== 27. FORM MANAGEMENT =====================
// Configure feedback form UI (background, landing title, subtitle)

// <Jun Kai start> a status pill under the page title; loading messages show nothing
function setFormPill(id, message, type) {
  const status = document.getElementById(id);
  if (!status) return;
  if (type === 'info' || /loaded/i.test(message)) { status.innerHTML = ''; return; }
  status.innerHTML = uiPill(type === 'success' ? 'ok' : 'down', message);
}

function setFormStatus(message, type = 'info') {
  setFormPill('fm-status', message, type);
}

// the kiosk keeps its own text when the saved title or subtitle is empty (feedback.html, config.js)
const START_SCREEN_DEFAULT_TITLE = "Let's turn your ideas into reality";
const START_SCREEN_DEFAULT_SUBTITLE = 'Share your thoughts and help us improve our services. Your feedback matters.';

function renderStartScreenPreview(prefix, title, subtitle) {
  const heading = document.getElementById(prefix + '-preview-heading');
  const sub = document.getElementById(prefix + '-preview-subtitle');
  if (!heading || !sub) return;
  heading.textContent = String(title || '').trim() || START_SCREEN_DEFAULT_TITLE;
  sub.textContent = String(subtitle || '').trim() || START_SCREEN_DEFAULT_SUBTITLE;
}

function renderFormUiPreview() {
  const title = document.getElementById('fm-title');
  const subtitle = document.getElementById('fm-subtitle');
  if (title && subtitle) renderStartScreenPreview('fm', title.value, subtitle.value);
}

// the Feedback QR Code preview follows the switch before it is saved
function renderLandingQrPreview() {
  const toggle = document.getElementById('qr-code-toggle');
  const screen = document.getElementById('qr-preview');
  const caption = document.getElementById('qr-preview-caption');
  if (!toggle || !screen) return;
  screen.classList.toggle('has-qr', toggle.checked);
  if (caption) {
    caption.textContent = toggle.checked
      ? 'The QR code shows beside the text. A visitor scans it to fill in the form on their own phone.'
      : 'No QR code. Visitors fill in the form on the kiosk itself.';
  }
}
// <Jun Kai end>

async function loadFormUISettings() {
  try {
    setFormStatus('Loading form settings…', 'info');

    const res = await fetch('/api/admin/form-ui');
    const cfg = await res.json();

    document.getElementById('fm-bg').value = cfg.background || '';
    document.getElementById('fm-title').value = cfg.landingTitle || '';
    document.getElementById('fm-subtitle').value = cfg.landingSubtitle || '';
    renderFormUiPreview(); // <Jun Kai/> setting .value fires no input event

    setFormStatus('Settings loaded', 'success'); // <Jun Kai/> clears the pill
  } catch (err) {
    console.error(err);
    setFormStatus('Failed to load settings', 'error');
  }
}

async function saveFormUISettings() {
  try {
    setFormStatus('Saving changes…', 'info');

    const currentRes = await fetch('/api/admin/form-ui');
    const currentCfg = await currentRes.json();

    const payload = {
      background: document.getElementById('fm-bg').value,
      landingTitle: document.getElementById('fm-title').value,
      landingSubtitle: document.getElementById('fm-subtitle').value,
      showLandingPageQRCode: Boolean(currentCfg.showLandingPageQRCode)
    };

    const res = await fetch('/api/admin/form-ui', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Save failed');
    }

    setFormStatus('Changes saved', 'success'); // <Jun Kai/>
  } catch (err) {
    console.error(err);
    setFormStatus('Failed to save changes', 'error');
  }
}

async function loadLandingPageQR() {
  try {
    const res = await fetch('/api/admin/form-ui');
    const cfg = await res.json();
    const toggle = document.getElementById('qr-code-toggle');

    if (toggle) {
      toggle.checked = Boolean(cfg.showLandingPageQRCode);
    }
    // <Jun Kai start> the preview, as setting .checked fires no change event
    renderStartScreenPreview('qr', cfg.landingTitle, cfg.landingSubtitle);
    renderLandingQrPreview();
    // <Jun Kai end>

    setFormPill('landing-qr-status', 'QR setting loaded', 'success'); // <Jun Kai/> clears the pill
  } catch (error) {
    console.error('Failed to load landing page QR setting:', error);
    setFormPill('landing-qr-status', 'Failed to load the QR setting', 'error'); // <Jun Kai/>
    renderStartScreenPreview('qr', '', ''); // <Jun Kai/>
    renderLandingQrPreview(); // <Jun Kai/>
  }
}

async function saveLandingPageQR() {
  try {
    const res = await fetch('/api/admin/form-ui');
    const cfg = await res.json();
    const toggle = document.getElementById('qr-code-toggle');
    const showLandingPageQRCode = Boolean(toggle && toggle.checked);

    const payload = {
      background: typeof cfg.background === 'string' ? cfg.background : '',
      landingTitle: typeof cfg.landingTitle === 'string' ? cfg.landingTitle : '',
      landingSubtitle: typeof cfg.landingSubtitle === 'string' ? cfg.landingSubtitle : '',
      showLandingPageQRCode
    };

    const saveRes = await fetch('/api/admin/form-ui', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await saveRes.json();
    if (!saveRes.ok || !data.success) {
      throw new Error(data.error || 'Save failed');
    }

    // <Jun Kai/> pills instead of the old status line
    setFormPill('landing-qr-status', showLandingPageQRCode ? 'Saved: the QR code shows on the start screen' : 'Saved: the QR code is hidden', 'success');
  } catch (error) {
    console.error('Failed to save landing page QR setting:', error);
    setFormPill('landing-qr-status', 'Failed to save the QR setting', 'error'); // <Jun Kai/>
  }
}

function setCacheStorageStatus(type, message) {
  const el = document.getElementById('ai-cache-storage-status');
  if (!el) return;

  el.textContent = message;
  el.className = 'fm-status';
  if (type === 'success') {
    el.classList.add('fm-status--success');
  } else if (type === 'error') {
    el.classList.add('fm-status--error');
  } else {
    el.classList.add('fm-status--info');
  }
}

async function loadCacheStorageMode() {
  try {
    const res = await fetch('/api/admin/feedback-analysis-cache-storage');
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to load cache storage mode');
    }

    const select = document.getElementById('ai-cache-storage-mode');
    if (select) {
      select.value = data.storageMode || 'both';
    }

    setCacheStorageStatus('info', `Current storage mode: ${data.storageMode || 'both'}`);
  } catch (error) {
    console.error('Failed to load cache storage mode:', error);
    setCacheStorageStatus('error', 'Failed to load cache storage mode');
  }
}

async function saveCacheStorageMode() {
  try {
    const select = document.getElementById('ai-cache-storage-mode');
    const storageMode = select ? select.value : 'both';

    const res = await fetch('/api/admin/feedback-analysis-cache-storage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageMode })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to save cache storage mode');
    }

    setCacheStorageStatus('success', `Cache storage updated to ${data.storageMode}`);
  } catch (error) {
    console.error('Failed to save cache storage mode:', error);
    setCacheStorageStatus('error', 'Failed to save cache storage mode');
  }
}


