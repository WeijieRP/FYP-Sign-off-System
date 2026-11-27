// Owner: Role 3, Jun Kai.
// Part of the admin page: the AI Settings page (Monitoring group) and the AI state the other pages read.
// <Jun Kai start>
// One switch for every AI feature, and one switch per feature. The server keeps them (backend/features/aiSettings)
// and refuses a feature that is off; this page shows and changes them. A switch saves as soon as it is flipped.

// what the other pages ask: may this feature use AI now? (unknown, e.g. before the first answer: yes, the server
// still refuses a feature that is off)
let adminAiState = null;
function adminAiAllows(feature) {
    return !adminAiState || adminAiState[feature] !== false;
}
async function refreshAdminAiState() {
    try {
        const response = await fetch('/api/admin/ai-settings', { cache: 'no-store' });
        const data = await response.json();
        if (response.ok && data.success) adminAiState = data.effective;
        return data;
    } catch {
        return null;
    }
}

const AI_FEATURES = [
    { key: 'incidentAdvisor', name: 'Incident advisor', detail: 'Explains each incident and suggests one step', runs: () => 'Ollama on this PC', off: 'Each incident gets rule based advice instead.' },
    { key: 'reportModels', name: 'Feedback Reports AI modes', detail: 'Xenova AI, Qwen AI, Gemma AI and LocalGPT', runs: () => 'This PC (Xenova, and Ollama for the other three)', off: 'Only Rule-Based Analysis can be picked.' },
    { key: 'pledgeCheck', name: 'Pledge check at submission', detail: 'Decides if a pledge goes on the pledgeboard or to the review queue', runs: aiPledgeRuns, off: 'Only the word list checks each pledge, so a negative pledge without a listed word is not caught.' },
    { key: 'translate', name: 'Translate to English', detail: 'The Translate button on pledges and typed answers', runs: () => 'Google Translate (online)', off: 'The Translate buttons are left out.' },
];

// what the pledge check really uses, from backend/.env (the page is only told the mode and whether a key is set)
function aiPledgeRuns(pledge) {
    const p = pledge || {};
    const online = p.onlineKey ? `an online AI service (${p.provider === 'groq' ? 'Groq' : 'OpenAI'})` : null;
    if (p.mode === 'rules') return 'Word rules only: PLEDGE_SENTIMENT_MODE is rules in backend\\.env, so this switch changes nothing now.';
    if (p.mode === 'online') return online ? `Word rules, then ${online}` : 'Word rules: online mode is set but no online key is, so nothing is sent.';
    if (p.mode === 'local') return 'Word rules, then Xenova on this PC';
    return `Word rules first; an unclear pledge goes to ${online ? `${online}, then ` : ''}Xenova on this PC`;
}

let aiSettingsData = null;
let aiSettingsBusy = false;

function aiSettingsCanChange() {
    return sessionStorage.getItem('userRole') === 'system_admin';
}

function aiSettingsSay(text, tone) {
    const status = document.getElementById('ai-settings-status');
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('is-error', tone === 'error');
}

function renderAiSettings() {
    const data = aiSettingsData;
    const rows = document.getElementById('ai-settings-rows');
    const master = document.getElementById('ai-settings-all');
    if (!data || !rows || !master) return;
    const all = data.settings.all !== false;
    const can = aiSettingsCanChange() && !aiSettingsBusy;
    master.checked = all;
    master.disabled = !can;
    document.getElementById('ai-settings-all-state').innerHTML = all ? uiPill('ok', 'On') : uiPill('muted', 'Off');
    document.getElementById('ai-settings-page').classList.toggle('ai-all-off', !all);
    rows.innerHTML = AI_FEATURES.map((feature) => {
        const saved = data.settings[feature.key] !== false;
        const working = data.effective[feature.key] !== false;
        const pill = working ? uiPill('ok', 'On') : saved ? uiPill('muted', 'Off, all AI is off') : uiPill('muted', 'Off');
        return `<div class="ai-row${working ? '' : ' is-off'}">
            <div class="ai-row-text">
                <b>${escapeHtmlSafe(feature.name)}</b>
                <small>${escapeHtmlSafe(feature.detail)}</small>
                <dl class="ai-row-facts"><dt>Runs on</dt><dd>${escapeHtmlSafe(feature.runs(data.pledge))}</dd><dt>When off</dt><dd>${escapeHtmlSafe(feature.off)}</dd></dl>
            </div>
            <div class="ai-row-state">${pill}</div>
            <label class="ui-switch ai-row-switch" title="${saved ? 'Switch off' : 'Switch on'}: ${escapeHtmlSafe(feature.name)}">
                <input type="checkbox" data-ai-key="${feature.key}"${saved ? ' checked' : ''}${can && all ? '' : ' disabled'} aria-label="${escapeHtmlSafe(feature.name)}">
                <span class="ui-switch-track"></span>
            </label>
        </div>`;
    }).join('');
    const who = document.getElementById('ai-settings-who');
    if (who) who.hidden = aiSettingsCanChange();
}

async function loadAiSettingsPage() {
    const rows = document.getElementById('ai-settings-rows');
    if (rows && !aiSettingsData) rows.innerHTML = '<p class="ui-empty">Loading the AI settings</p>';
    const data = await refreshAdminAiState();
    if (!data || !data.success) {
        if (rows) rows.innerHTML = `<p class="ui-empty">Could not read the AI settings${data && data.error ? `: ${escapeHtmlSafe(data.error)}` : ''}.</p>`;
        return;
    }
    aiSettingsData = data;
    renderAiSettings();
}

// one switch flipped: saved at once; on a failure the switch goes back and the reason is shown
async function saveAiSetting(key, value) {
    const label = key === 'all' ? 'All AI features' : (AI_FEATURES.find((f) => f.key === key) || {}).name || key;
    aiSettingsBusy = true;
    renderAiSettings();
    aiSettingsSay(`Saving: ${label} ${value ? 'on' : 'off'}`);
    try {
        const response = await fetch('/api/admin/ai-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: value })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || `The server answered ${response.status}`);
        aiSettingsData = data;
        adminAiState = data.effective;
        aiSettingsSay(`Saved: ${label} is ${value ? 'on' : 'off'}.`);
    } catch (error) {
        aiSettingsSay(`Not saved: ${error.message}`, 'error');
    } finally {
        aiSettingsBusy = false;
        renderAiSettings();
    }
}

document.addEventListener('change', (event) => {
    const input = event.target;
    if (input.id === 'ai-settings-all') return saveAiSetting('all', input.checked);
    if (input.dataset && input.dataset.aiKey && input.closest('#ai-settings-page')) saveAiSetting(input.dataset.aiKey, input.checked);
});
// <Jun Kai end>
