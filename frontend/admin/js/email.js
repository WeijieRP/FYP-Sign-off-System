// Owner: Role 3, Jun Kai. Previous team: none marked.
// Part 25/30 of the admin page: email settings and badge email templates (load order in admin.html).
// ==================== 28. EMAIL MANAGEMENT ====================
// Dynamic SMTP fields + load/save/test

// <Jun Kai start>
function setEmailStatus(type, message) {
  const el = document.getElementById('email-status');
  if (!el) return;
  const tone = type === 'success' ? 'ok' : type === 'error' ? 'down' : 'info';
  el.innerHTML = `<span class="ui-pill ui-pill-${tone}"><span class="ui-dot"></span>${escapeHtmlSafe(message)}</span>`;
}

function renderEmailFields() {
  const provider = document.getElementById('email-provider')?.value || 'gmail';
  const container = document.getElementById('email-fields');
  if (!container) return;

  if (provider === 'gmail') {
    container.innerHTML = `
      <div class="ui-form-grid">
        <div class="ui-field">
          <label class="ui-label" for="gmail-user">Gmail address</label>
          <input class="ui-input" id="gmail-user" type="email" placeholder="yourname@gmail.com" autocomplete="off">
        </div>
        <div class="ui-field">
          <label class="ui-label" for="gmail-pass">Gmail App Password</label>
          <input class="ui-input" id="gmail-pass" type="password" placeholder="16 letters, no spaces" autocomplete="off">
          <span class="ui-help">Made under Google Account, Security, App passwords. Gmail refuses the normal account password.</span>
        </div>
      </div>`;
  } else if (provider === 'outlook') {
    container.innerHTML = `
      <div class="ui-form-grid">
        <div class="ui-field">
          <label class="ui-label" for="outlook-user">Outlook address</label>
          <input class="ui-input" id="outlook-user" type="email" placeholder="yourname@company.com" autocomplete="off">
        </div>
        <div class="ui-field">
          <label class="ui-label" for="outlook-pass">Outlook password</label>
          <input class="ui-input" id="outlook-pass" type="password" placeholder="Account password" autocomplete="off">
        </div>
      </div>`;
  } else {
    container.innerHTML = `
      <div class="ui-form-grid">
        <div class="ui-field">
          <label class="ui-label" for="smtp-host">SMTP host</label>
          <input class="ui-input" id="smtp-host" type="text" placeholder="smtp.yourdomain.com" autocomplete="off">
        </div>
        <div class="ui-field">
          <label class="ui-label" for="smtp-port">SMTP port</label>
          <input class="ui-input" id="smtp-port" type="number" placeholder="587" autocomplete="off">
        </div>
        <div class="ui-field">
          <label class="ui-label" for="smtp-secure">Connection</label>
          <select class="ui-select" id="smtp-secure">
            <option value="false">STARTTLS (usually port 587)</option>
            <option value="true">SSL (usually port 465)</option>
          </select>
        </div>
        <div class="ui-field">
          <label class="ui-label" for="smtp-user">SMTP username</label>
          <input class="ui-input" id="smtp-user" type="text" placeholder="Username" autocomplete="off">
        </div>
        <div class="ui-field">
          <label class="ui-label" for="smtp-pass">SMTP password</label>
          <input class="ui-input" id="smtp-pass" type="password" placeholder="Password" autocomplete="off">
        </div>
      </div>`;
  }
}
// <Jun Kai end>

async function loadEmailConfig() {
  try {
    setEmailStatus('info', 'Loading email settings...');

    const res = await fetch('/api/admin/email-config', {
        credentials: 'include'
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      setEmailStatus('error', data.error || 'Failed to load email config.');
      return;
    }

    const cfg = data.config || {};

    // set base fields
    document.getElementById('email-provider').value = cfg.provider || 'gmail';
    document.getElementById('sender-email').value = cfg.senderEmail || '';

    // render fields first (so inputs exist)
    renderEmailFields();

    // fill provider-specific fields
    if (cfg.provider === 'gmail' && cfg.gmail) {
      document.getElementById('gmail-user').value = cfg.gmail.user || '';
      document.getElementById('gmail-pass').value = cfg.gmail.pass || '';
    }

    if (cfg.provider === 'outlook' && cfg.outlook) {
      document.getElementById('outlook-user').value = cfg.outlook.user || '';
      document.getElementById('outlook-pass').value = cfg.outlook.pass || '';
    }

    if (cfg.provider === 'custom' && cfg.custom) {
      document.getElementById('smtp-host').value = cfg.custom.host || '';
      document.getElementById('smtp-port').value = cfg.custom.port ?? 587;
      document.getElementById('smtp-secure').value = String(!!cfg.custom.secure);
      document.getElementById('smtp-user').value = cfg.custom.user || '';
      document.getElementById('smtp-pass').value = cfg.custom.pass || '';
    }

    setEmailStatus('success', 'Settings loaded');
    loadEmailHealth();
    loadEmailPreview();
  } catch (err) {
    console.error(err);
    setEmailStatus('error', 'Failed to load email config.');
  }
}

// The status line at the top (12 Nov 2026 design): can the kiosk send email, how many went out, the last test
function emailAgo(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

function setEmailHealth(tone, line, sub, counts, time) {
  const card = document.getElementById('email-health');
  if (!card) return;
  card.className = `ui-card health-status health-status-${tone}`;
  const mark = document.getElementById('email-health-mark');
  if (mark) mark.innerHTML = uiIcon({ ok: 'check', warn: 'alert', down: 'cross', muted: 'mail' }[tone] || 'mail', 22);
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('email-health-line', line);
  set('email-health-sub', sub);
  set('email-health-time', time || '');
  const box = document.getElementById('email-health-counts');
  if (box) box.innerHTML = (counts || []).map(([n, word]) => `<span><b>${escapeHtmlSafe(String(n))}</b>${escapeHtmlSafe(word)}</span>`).join('');
}

async function loadEmailHealth(refresh) {
  const button = document.getElementById('email-health-check');
  if (button) button.disabled = true;
  if (refresh) setEmailHealth('muted', 'Checking the mail account', 'Logging in to the mail server, this can take a few seconds.');
  try {
    const res = await fetch(`/api/admin/email/status${refresh ? '?refresh=1' : ''}`, { credentials: 'include', cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Status failed');
    const s = data.status;
    const counts = [];
    if (s.sent7d !== null && s.sent7d !== undefined) counts.push([s.sent7d, 'sent in 7 days']);
    if (s.lastSentAt) counts.push([emailAgo(s.lastSentAt), 'last sent']);
    const time = s.lastTest ? `Last test ${emailAgo(s.lastTest.at)}: ${s.lastTest.ok ? 'sent' : 'failed'}` : 'No test sent yet';
    if (!s.configured) {
      setEmailHealth('warn', 'No mail account set up', 'Pick a provider, enter the account and save, then send yourself a test.', counts, time);
    } else if (!s.login || s.login.status === 'unknown') {
      setEmailHealth('muted', 'Mail account not checked', (s.login && s.login.summary) || 'Click Check again to log in to the mail server.', counts, time);
    } else if (s.login.status === 'ok') {
      const checked = s.login.cached ? 'Login checked in the last 5 minutes' : `Login checked just now (${Number(s.login.latencyMs || 0).toLocaleString('en-SG')} ms)`;
      setEmailHealth('ok', 'Connected: the kiosk can send email', `Sending as ${s.sender} through ${s.providerName}. ${checked}.`, counts, time);
    } else {
      setEmailHealth('down', 'The kiosk cannot send email', `${s.login.summary || 'The mail server refused the login.'} Check the account below, save, then Check again.`, counts, time);
    }
  } catch (err) {
    console.error(err);
    setEmailHealth('down', 'Status not available', `Could not check the mail account: ${err.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadEmailPreview() {
  const frame = document.getElementById('email-preview-frame');
  const empty = document.getElementById('email-preview-empty');
  const meta = document.getElementById('email-preview-meta');
  if (!frame) return;
  try {
    const res = await fetch('/api/admin/email/preview', { credentials: 'include', cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Preview failed');
    const p = data.preview;
    if (meta) meta.innerHTML = [['From', p.from], ['To', p.to], ['Subject', p.subject]].map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtmlSafe(v || '')}</dd></div>`).join('');
    frame.srcdoc = p.html || '';
    frame.hidden = false;
    if (empty) empty.hidden = true;
  } catch (err) {
    console.error(err);
    frame.hidden = true;
    if (empty) { empty.hidden = false; empty.textContent = `The preview could not be built: ${err.message}`; }
  }
}

async function saveEmailConfig() {
  try {
    setEmailStatus('info', 'Saving email settings...');

    const provider = document.getElementById('email-provider').value;
    const senderEmail = document.getElementById('sender-email').value.trim();

    const payload = { provider, senderEmail, gmail: {}, outlook: {}, custom: {} };

    if (provider === 'gmail') {
      payload.gmail.user = document.getElementById('gmail-user')?.value.trim() || '';
      payload.gmail.pass = document.getElementById('gmail-pass')?.value || '';
    } else if (provider === 'outlook') {
      payload.outlook.user = document.getElementById('outlook-user')?.value.trim() || '';
      payload.outlook.pass = document.getElementById('outlook-pass')?.value || '';
    } else {
      payload.custom.host = document.getElementById('smtp-host')?.value.trim() || '';
      payload.custom.port = Number(document.getElementById('smtp-port')?.value || 587);
      payload.custom.secure = document.getElementById('smtp-secure')?.value === 'true';
      payload.custom.user = document.getElementById('smtp-user')?.value.trim() || '';
      payload.custom.pass = document.getElementById('smtp-pass')?.value || '';
    }

    const res = await fetch('/api/admin/email-config', {
      method: 'PUT',
      credentials: 'include', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      setEmailStatus('error', data.error || 'Save failed.');
      return;
    }

    setEmailStatus('success', data.message || 'Saved successfully.');
    loadEmailHealth(true);
    loadEmailPreview();
  } catch (err) {
    console.error(err);
    setEmailStatus('error', 'Save failed.');
  }
}

async function sendTestEmail() {
  try {
    const to = document.getElementById('email-test-to')?.value.trim();
    if (!to) {
      setEmailStatus('error', 'Please enter a test email address.');
      return;
    }

    setEmailStatus('info', 'Sending test email...');

    const res = await fetch('/api/admin/email-config/test', {
      method: 'POST',
      credentials: 'include', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      setEmailStatus('error', data.error || 'Test email failed.');
      loadEmailHealth();
      return;
    }

    setEmailStatus('success', 'Test email sent successfully.');
    loadEmailHealth();
  } catch (err) {
    console.error(err);
    setEmailStatus('error', 'Test email failed.');
    loadEmailHealth();
  }
}

// ==================== BADGE EMAIL TEMPLATE MANAGEMENT ====================

let badgeTemplateState = {
    badges: [],
    templates: {},
    selectedKey: ''
};

const DEFAULT_BADGE_EMAIL_BADGES = [
    { key: 'feedback-completer', name: 'Feedback Contributor', description: 'For completing the feedback form', color: '#10b981' },
    { key: 'climate-champion', name: 'Climate Champion', description: 'For pledges focused on climate action and lowering emissions', color: '#0ea5e9' },
    { key: 'renewable-innovator', name: 'Renewable Innovator', description: 'For clean energy and renewable pledges', color: '#f59e0b' },
    { key: 'sustainable-living-advocate', name: 'Sustainable Living Advocate', description: 'For sustainable lifestyle pledges', color: '#16a34a' },
    { key: 'ocean-guardian', name: 'Ocean Guardian', description: 'For ocean conservation pledges', color: '#0284c7' },
    { key: 'social-champion', name: 'Social Champion', description: 'For community and social impact pledges', color: '#ec4899' },
    { key: 'governance-guardian', name: 'Governance Guardian', description: 'For ethics and governance pledges', color: '#6366f1' }
];

const DEFAULT_BADGE_LEAF_COLORS = {
    'feedback-completer': '#4a7c59',
    'climate-champion': '#0f766e',
    'renewable-innovator': '#f59e0b',
    'sustainable-living-advocate': '#16a34a',
    'ocean-guardian': '#0284c7',
    'governance-guardian': '#7c3aed',
    'social-champion': '#d97706',
    'multi-pledge': '#8b5a2b' // a leaf colour only (no badge email): several pledge topics chosen
};

function escapeBadgeTemplateHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// <Jun Kai start> Badge Emails A: the status is a pill like on the other new pages, and a quiet "loaded" is not shown
function setBadgeTemplateStatus(type, message) {
    const el = document.getElementById('badge-template-status');
    if (!el) return;
    if (type === 'info' || (type === 'success' && /loaded/i.test(message))) { el.innerHTML = ''; return; }
    const tone = type === 'success' ? 'ok' : type === 'error' ? 'down' : 'info';
    el.innerHTML = `<span class="ui-pill ui-pill-${tone}"><span class="ui-dot"></span>${escapeBadgeTemplateHtml(message)}</span>`;
}

// the live email preview on the right, from what is in the fields now
function renderBadgeEmailPreview() {
    const subject = document.getElementById('badge-template-subject');
    if (!subject || !document.getElementById('be-preview')) return;
    const message = document.getElementById('badge-template-message').value.trim();
    const highlights = document.getElementById('badge-template-highlights').value.split('\n').map(line => line.trim()).filter(Boolean);
    document.getElementById('be-preview-subject').textContent = subject.value.trim() || 'No subject yet';
    document.getElementById('be-preview-message').textContent = message || 'No message yet.';
    document.getElementById('be-preview-highlights').innerHTML = highlights.map(line => `<li>${escapeBadgeTemplateHtml(line)}</li>`).join('');
    document.getElementById('be-preview-takeaways').hidden = highlights.length === 0;
}

let badgeEmailPageReady = false;
function prepareBadgeEmailPage() {
    if (badgeEmailPageReady) return;
    badgeEmailPageReady = true;
    ['badge-template-subject', 'badge-template-message', 'badge-template-highlights'].forEach((id) => {
        const field = document.getElementById(id);
        if (field) field.addEventListener('input', renderBadgeEmailPreview);
    });
    const list = document.getElementById('badge-template-badge-list');
    if (list) list.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-badge-key]');
        if (button) chooseBadgeEmailTemplate(button.dataset.badgeKey);
    });
}
// <Jun Kai end>

function readCurrentBadgeTemplateForm() {
    const key = badgeTemplateState.selectedKey;
    if (!key) return;

    badgeTemplateState.templates[key] = {
        subject: document.getElementById('badge-template-subject')?.value.trim() || '',
        message: document.getElementById('badge-template-message')?.value.trim() || '',
        highlights: (document.getElementById('badge-template-highlights')?.value || '')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
    };
}

function renderBadgeTemplateForm(key) {
    const template = badgeTemplateState.templates[key] || {};
    document.getElementById('badge-template-subject').value = template.subject || '';
    document.getElementById('badge-template-message').value = template.message || '';
    document.getElementById('badge-template-highlights').value = (template.highlights || []).join('\n');
    renderBadgeTemplateBadgeList();
    // <Jun Kai start> the editor names the chosen badge, and the preview follows
    const badge = badgeTemplateState.badges.find(item => item.key === key) || {};
    const title = document.getElementById('be-editor-title');
    if (title) title.textContent = badge.name || 'Badge';
    const desc = document.getElementById('be-editor-desc');
    if (desc) desc.textContent = badge.description || '';
    renderBadgeEmailPreview();
    // <Jun Kai end>
}

function selectBadgeEmailTemplate() {
    readCurrentBadgeTemplateForm();
    const select = document.getElementById('badge-template-select');
    badgeTemplateState.selectedKey = select?.value || '';
    if (badgeTemplateState.selectedKey) {
        renderBadgeTemplateForm(badgeTemplateState.selectedKey);
    }
}

function renderBadgeTemplateBadgeList() {
    const list = document.getElementById('badge-template-badge-list');
    if (!list) return;

    // <Jun Kai start> one row per badge (colour dot, name, what it is for); the click is handled once in prepareBadgeEmailPage
    list.innerHTML = badgeTemplateState.badges.map(badge => {
        const isActive = badge.key === badgeTemplateState.selectedKey;
        return `
            <button type="button" role="listitem" class="be-badge${isActive ? ' is-active' : ''}" data-badge-key="${escapeBadgeTemplateHtml(badge.key)}"
                aria-current="${isActive ? 'true' : 'false'}" style="--badge-color:${escapeBadgeTemplateHtml(badge.color || '#10b981')}">
                <span class="be-badge-dot"></span>
                <span class="be-badge-text"><strong>${escapeBadgeTemplateHtml(badge.name)}</strong><small>${escapeBadgeTemplateHtml(badge.description || 'Badge reward')}</small></span>
            </button>
        `;
    }).join('');
    // <Jun Kai end>
}

function chooseBadgeEmailTemplate(key) {
    readCurrentBadgeTemplateForm();
    badgeTemplateState.selectedKey = key;
    const select = document.getElementById('badge-template-select');
    if (select) select.value = key;
    renderBadgeTemplateForm(key);
}

function populateBadgeTemplatePicker() {
    if (!badgeTemplateState.badges.length) {
        badgeTemplateState.badges = DEFAULT_BADGE_EMAIL_BADGES;
    }

    badgeTemplateState.selectedKey = badgeTemplateState.badges.some(badge => badge.key === badgeTemplateState.selectedKey)
        ? badgeTemplateState.selectedKey
        : badgeTemplateState.badges[0]?.key || '';

    const select = document.getElementById('badge-template-select');
    if (select) {
        select.innerHTML = badgeTemplateState.badges.map(badge => (
            `<option value="${escapeBadgeTemplateHtml(badge.key)}">${escapeBadgeTemplateHtml(badge.name)}</option>`
        )).join('');
        select.value = badgeTemplateState.selectedKey;
    }

    renderBadgeTemplateBadgeList();
}

async function loadBadgeEmailTemplates() {
    prepareBadgeEmailPage(); // <Jun Kai/>
    try {
        setBadgeTemplateStatus('info', 'Loading badge email templates...');
        const res = await fetch('/api/admin/badge-email-templates', { credentials: 'include' });
        const data = await res.json();

        if (!res.ok || !data.success) {
            badgeTemplateState.badges = DEFAULT_BADGE_EMAIL_BADGES;
            populateBadgeTemplatePicker();
            setBadgeTemplateStatus('error', data.error || 'Failed to load badge email templates.');
            return;
        }

        badgeTemplateState.badges = (data.badges && data.badges.length) ? data.badges : DEFAULT_BADGE_EMAIL_BADGES;
        badgeTemplateState.templates = data.templates || {};
        populateBadgeTemplatePicker();

        if (badgeTemplateState.selectedKey) {
            renderBadgeTemplateForm(badgeTemplateState.selectedKey);
        }

        setBadgeTemplateStatus('success', 'Badge email templates loaded.');
    } catch (err) {
        console.error(err);
        badgeTemplateState.badges = DEFAULT_BADGE_EMAIL_BADGES;
        populateBadgeTemplatePicker();
        setBadgeTemplateStatus('error', 'Failed to load badge email templates.');
    }
}

async function saveBadgeEmailTemplates() {
    try {
        readCurrentBadgeTemplateForm();
        setBadgeTemplateStatus('info', 'Saving badge email templates...');

        const res = await fetch('/api/admin/badge-email-templates', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templates: badgeTemplateState.templates })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            setBadgeTemplateStatus('error', data.error || 'Failed to save badge email templates.');
            return;
        }

        badgeTemplateState.templates = data.templates || badgeTemplateState.templates;
        setBadgeTemplateStatus('success', data.message || 'Badge email templates saved.');
    } catch (err) {
        console.error(err);
        setBadgeTemplateStatus('error', 'Failed to save badge email templates.');
    }
}


