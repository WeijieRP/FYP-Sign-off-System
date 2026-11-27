// Owner: Role 1, Zihan and Role 3, Jun Kai. Previous team: Nick (6), Caeden (5), Yu Kang (4).
// Part 26/30 of the admin page: parameter adjustment (load order in admin.html).
// ==================== PARAMETER ADJUSTMENT MANAGEMENT ====================

const DEFAULT_LANDING_LAYOUT_SETTINGS = {
    landingTextScale: 1,
    landingPanelWidth: 600,
    landingPanelMinHeight: 0,
    landingPanelPadding: 60,
    landingPanelOffsetX: 0,
    landingPanelOffsetY: 0,
    startButtonOffsetX: 0,
    startButtonOffsetY: 0,
    startButtonWidth: 280,
    startButtonHeight: 64,
    pledgeboardButtonOffsetX: 0,
    pledgeboardButtonOffsetY: 0,
    pledgeboardButtonWidth: 600,
    pledgeboardButtonHeight: 64
};

// <Jun Kai start>
// The page is grouped by kiosk screen now. Each old tab opens the step that holds most of its settings.
const PARAMETER_TAB_STEPS = {
    'feedback-tab': 'thanks',
    'landing-layout-tab': 'start',
    'content-tab': 'pledge',
    'email-tab': 'email',
    'features-tab': 'photo',
    'validation-tab': 'details',
    'photo-tab': 'photo',
    'assets-tab': 'look',
    'archive-tab': 'archive'
};

// shows one step (or one "Behind the scenes" group); jump scrolls to it, for the buttons below the steps
function showParameterStep(step, jump = false) {
    const page = document.getElementById('parameter-adjustment-page');
    const target = page?.querySelector(`[data-pa-group="${step}"]`);
    if (!target) return;
    page.querySelectorAll('[data-pa-group]').forEach((group) => { group.hidden = group !== target; });
    page.querySelectorAll('button[data-pa-step]').forEach((button) => {
        const on = button.dataset.paStep === step;
        button.classList.toggle('is-active', on);
        if (on) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
    });
    page.dataset.paCurrent = step;
    updateParameterPreview();
    if (jump) target.scrollIntoView({ block: 'start' });
}

function switchParameterTab(tabId) {
    showParameterStep(PARAMETER_TAB_STEPS[tabId] || 'start');
}

// Unsaved changes: the values right after a load or a save are kept, and every edit is compared with them, so the
// save bar can say how many settings changed and in which steps, and those steps get a small dot.
let parameterSnapshot = new Map();

function parameterControls() {
    return [...document.querySelectorAll('#parameter-adjustment-page [data-pa-group] :is(input, select, textarea)')]
        .filter((control) => control.type !== 'file');
}

function parameterControlKey(control) {
    return control.id || `${control.name}:${control.value}`;
}

function parameterControlValue(control) {
    return control.type === 'checkbox' || control.type === 'radio' ? control.checked : control.value;
}

function takeParameterSnapshot() {
    parameterSnapshot = new Map(parameterControls().map((control) => [parameterControlKey(control), parameterControlValue(control)]));
    updateParameterChanges();
}

function updateParameterChanges() {
    const page = document.getElementById('parameter-adjustment-page');
    const text = document.getElementById('pa-changes');
    if (!page || !text) return;
    const changed = new Map();
    parameterControls().forEach((control) => {
        const key = parameterControlKey(control);
        if (!parameterSnapshot.has(key) || parameterSnapshot.get(key) === parameterControlValue(control)) return;
        if (control.type === 'radio' && !control.checked) return; // a radio pair counts once
        const group = control.closest('[data-pa-group]');
        changed.set(group, (changed.get(group) || 0) + 1);
    });
    page.querySelectorAll('button[data-pa-step]').forEach((button) => {
        const has = [...changed.keys()].some((group) => group.dataset.paGroup === button.dataset.paStep);
        button.classList.toggle('has-changes', has);
        const flag = button.querySelector('.pa-step-flag');
        if (flag) flag.hidden = !has;
    });
    const count = [...changed.values()].reduce((sum, n) => sum + n, 0);
    const wasEmpty = text.hidden;
    text.hidden = count === 0;
    if (!count) return;
    // groups in page order, so the steps read the way a visitor meets them
    const names = [...page.querySelectorAll('[data-pa-group]')].filter((group) => changed.has(group)).map((group) => group.dataset.paName);
    const where = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    text.textContent = `${count} ${count === 1 ? 'change' : 'changes'} not saved yet, in ${where}`;
    // the first edit after a load or save makes the old "loaded" or "saved" message out of date
    if (wasEmpty) {
        const status = document.getElementById('parameter-status');
        if (status) status.innerHTML = '';
    }
}

function bindParameterChanges() {
    const page = document.getElementById('parameter-adjustment-page');
    if (!page || page.dataset.changesBound) return;
    page.addEventListener('input', updateParameterChanges);
    page.addEventListener('change', updateParameterChanges);
    page.dataset.changesBound = 'true';
}

// Live preview: a sketch of the chosen kiosk screen, built from the values on the page, saved or not. It follows
// the kiosk's own rules: the thank you screen shows the subtitle only when the message is empty, the pledge coach
// title carries the campaign title while Smart campaign is on, the beauty filter needs both of its switches, and the
// email uses the same default texts as backend/features/email/service.js when a box is empty.
const PARAMETER_EMAIL_DEFAULTS = {
    subject: 'Thank you for visiting RP Xperience Centre, {name}!',
    intro: 'Thank you for taking the time to visit our RP Xperience Centre and sharing your feedback. Attached below is your commemorative photo from your visit.',
    closing: 'We hope your experience has inspired you to take meaningful steps towards sustainability. Your feedback helps us improve and create better experiences for future visitors.',
    sender: 'RP Xperience Centre Team',
    footer: 'This is an automated email sent from the RP Xperience Centre kiosk system. Please do not reply to this message.'
};

function setPreviewText(preview, key, text) {
    preview.querySelectorAll(`[data-pa-text="${key}"]`).forEach((el) => { el.textContent = text; });
}

function showPreviewPart(preview, key, on) {
    preview.querySelectorAll(`[data-pa-show="${key}"]`).forEach((el) => { el.hidden = !on; });
}

function updateParameterPreview() {
    const page = document.getElementById('parameter-adjustment-page');
    const preview = document.getElementById('pa-preview');
    if (!page || !preview) return;
    const block = preview.querySelector(`[data-pa-preview="${page.dataset.paCurrent || 'start'}"]`);
    preview.querySelectorAll('[data-pa-preview]').forEach((part) => { part.hidden = part !== block; });
    preview.hidden = !block;
    page.querySelector('.pa-work')?.classList.toggle('has-preview', Boolean(block));
    if (!block) return;

    // the look every feedback screen shares
    preview.style.setProperty('--pa-accent', normalizeHexColor(getInputValue('param-feedbackAccentColor'), '#4a7c59'));
    preview.style.setProperty('--pa-card-alpha', String(clampNumber(getInputValue('param-feedbackCardOpacity'), 0.55, 1, 0.9)));
    const background = getInputValue('param-feedbackBackground');
    // a custom property, so dark mode leaves the typed background as it is
    preview.querySelectorAll('.pa-screen').forEach((screen) => {
        if (background) screen.style.setProperty('--pa-screen-bg', background);
        else screen.style.removeProperty('--pa-screen-bg');
    });
    showPreviewPart(preview, 'languages', getCheckedValue('flag-floatingLanguageSelectorEnabled'));

    const nameMin = getInputValue('rule-nameMinLength') || '0';
    const nameMax = getInputValue('rule-nameMaxLength') || '80';
    setPreviewText(preview, 'details', getInputValue('param-detailsPrompt'));
    setPreviewText(preview, 'name-need', getCheckedValue('rule-nameRequired') ? '(required)' : '(optional)');
    setPreviewText(preview, 'name-rule', `${nameMin} to ${nameMax} letters`);
    setPreviewText(preview, 'email-need', getCheckedValue('rule-emailRequired') ? '(required)' : '(optional)');

    setPreviewText(preview, 'questions', getInputValue('param-feedbackPrompt'));
    showPreviewPart(preview, 'questions-required', getCheckedValue('rule-requiredQuestionsEnabled'));

    const campaignTitle = getInputValue('campaign-title');
    // a missing switch counts as on, like the kiosk (flags.pledgeEnabled !== false)
    const pledgeOn = document.getElementById('flag-pledgeEnabled')?.checked ?? true;
    setPreviewText(preview, 'pledge', getInputValue('param-pledgePrompt'));
    setPreviewText(preview, 'coach', getCheckedValue('campaign-enabled') && campaignTitle ? `${campaignTitle}: Smart Pledge Coach` : 'Smart Pledge Coach');
    setPreviewText(preview, 'pledge-need', getCheckedValue('rule-pledgeRequired') ? '(required)' : '(optional)');
    setPreviewText(preview, 'pledge-rule', `${getInputValue('rule-pledgeMinLength') || '0'} to ${getInputValue('rule-pledgeMaxLength') || '500'} characters`);
    showPreviewPart(preview, 'pledge-topic', getCheckedValue('rule-pledgeTopicRequired'));
    showPreviewPart(preview, 'pledge-off', !pledgeOn);
    preview.querySelector('[data-pa-preview="pledge"] .pa-device')?.classList.toggle('is-off', !pledgeOn);

    const camera = getCheckedValue('flag-cameraCaptureEnabled');
    const upload = getCheckedValue('flag-photoUploadEnabled');
    const beauty = getCheckedValue('flag-beautyFilterEnabled') && getRadioBoolean('beauty-filter');
    const overlay = getInputValue('param-defaultOverlayTheme');
    showPreviewPart(preview, 'camera', camera);
    showPreviewPart(preview, 'upload', upload);
    showPreviewPart(preview, 'photo-none', !camera && !upload);
    showPreviewPart(preview, 'photo-skip', !getCheckedValue('rule-photoRequired'));
    showPreviewPart(preview, 'beauty', beauty);
    setPreviewText(preview, 'beauty', `Beauty filter: ${getInputValue('param-beautyFilterStrength') || 'medium'}`);
    setPreviewText(preview, 'overlay', overlay ? `Overlay picked first: ${overlay}` : 'No overlay picked first');

    const message = getInputValue('param-thankYouMessage');
    const subtitle = getInputValue('param-thankYouSubtitle');
    setPreviewText(preview, 'thanks-title', getInputValue('param-thankYouTitle'));
    setPreviewText(preview, 'thanks-message', message || subtitle);
    setPreviewText(preview, 'thanks-footer', getInputValue('param-thankYouFooter'));
    showPreviewPart(preview, 'thanks-subtitle', !message && Boolean(subtitle));
    showPreviewPart(preview, 'social', getCheckedValue('flag-socialSharingEnabled'));

    const name = 'Alex';
    const personal = (value, fallback) => (value || fallback).replace(/\{name\}/g, name);
    const mailOn = getCheckedValue('flag-thankYouEmailEnabled');
    setPreviewText(preview, 'mail-subject', personal(getInputValue('param-thankYouSubject'), PARAMETER_EMAIL_DEFAULTS.subject));
    setPreviewText(preview, 'mail-from', personal(getInputValue('param-senderName'), PARAMETER_EMAIL_DEFAULTS.sender));
    setPreviewText(preview, 'mail-greeting', `Dear ${name},`);
    setPreviewText(preview, 'mail-intro', personal(getInputValue('param-thankYouIntro'), PARAMETER_EMAIL_DEFAULTS.intro));
    setPreviewText(preview, 'mail-closing', personal(getInputValue('param-thankYouClosing'), PARAMETER_EMAIL_DEFAULTS.closing));
    setPreviewText(preview, 'mail-footer', personal(getInputValue('param-footerNote'), PARAMETER_EMAIL_DEFAULTS.footer));
    showPreviewPart(preview, 'mail-badge', getCheckedValue('flag-badgeEmailEnabled'));
    showPreviewPart(preview, 'mail-off', !mailOn);
    showPreviewPart(preview, 'mail-on', mailOn);
    preview.querySelector('[data-pa-preview="email"] .pa-device')?.classList.toggle('is-off', !mailOn);
}

// The start screen preview is drawn 600 px wide (its sizes are the kiosk's at 0.45) and shrunk to fit the card
function fitLandingPreview() {
    const box = document.querySelector('#pa-preview .landing-layout-preview');
    if (box && box.clientWidth) box.style.setProperty('--pa-landing-scale', String(Math.min(1, box.clientWidth / 600)));
}

function bindParameterPreview() {
    const page = document.getElementById('parameter-adjustment-page');
    if (!page || page.dataset.previewBound) return;
    page.addEventListener('input', updateParameterPreview);
    page.addEventListener('change', updateParameterPreview);
    const box = document.querySelector('#pa-preview .landing-layout-preview');
    if (box && 'ResizeObserver' in window) new ResizeObserver(fitLandingPreview).observe(box);
    page.dataset.previewBound = 'true';
}
// <Jun Kai end>

// <Jun Kai start>
// the page's icons are drawn once, the first time it opens
function fillParameterIcons() {
    document.querySelectorAll('#parameter-adjustment-page [data-fb-icon]').forEach((slot) => {
        if (!slot.firstChild) slot.innerHTML = uiIcon(slot.dataset.fbIcon, slot.closest('button') ? 15 : 16);
    });
}

// the status sits in the save bar as a small coloured pill
function setParameterStatus(message, type = 'info') {
    const status = document.getElementById('parameter-status');
    if (!status) return;
    const tone = type === 'success' ? 'ok' : type === 'error' ? 'down' : 'info';
    status.innerHTML = `<span class="ui-pill ui-pill-${tone}"><span class="ui-dot"></span>${escapeHtmlSafe(message)}</span>`;
}
// <Jun Kai end>

function setInputValue(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value ?? '';
}

function getInputValue(id) {
    return document.getElementById(id)?.value.trim() || '';
}

function setCheckedValue(id, value) {
    const input = document.getElementById(id);
    if (input) input.checked = value !== false;
}

function getCheckedValue(id) {
    return Boolean(document.getElementById(id)?.checked);
}

function setRadioValue(name, value) {
    const selected = document.querySelector(`input[name="${name}"][value="${String(Boolean(value))}"]`);
    if (selected) selected.checked = true;
}

function getRadioBoolean(name) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value === 'true' : false;
}

function setCheckboxValues(name, values = []) {
    const valueSet = new Set(values);
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
        input.checked = valueSet.has(input.value);
    });
}

function getCheckboxValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(input => input.value);
}

function bytesToMegabytes(bytes, fallback) {
    const number = Number(bytes);
    return Number.isFinite(number) ? Math.round(number / 1024 / 1024) : fallback;
}

function megabytesToBytes(value, fallbackMb) {
    const number = Number(value);
    return Math.max(1, Number.isFinite(number) ? number : fallbackMb) * 1024 * 1024;
}

// An empty box gives the fallback (the default), not 0: an empty "Time at the Bottom Middle" used to save 0 and
// make new leaves skip the bottom middle.
function getNumberValue(id, fallback) {
    const raw = getInputValue(id);
    if (raw === '') return fallback;
    const number = Number(raw);
    return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    const safeNumber = Number.isFinite(number) ? number : fallback;
    return Math.min(max, Math.max(min, safeNumber));
}

function getDefaultBadgeLeafColors() {
    return { ...DEFAULT_BADGE_LEAF_COLORS };
}

// The leaf colours under Badge Leaf Styling: every badge (as the badge emails), and Multiple pledges, for a
// visitor who chose several pledge topics (a leaf colour only, no email of its own; Owner: Role 2, Wei Jie).
const BADGE_LEAF_STYLE_BADGES = [...DEFAULT_BADGE_EMAIL_BADGES, { key: 'multi-pledge', name: 'Multiple pledges' }];

function normalizeHexColor(value, fallback = '#4a7c59') {
    const color = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function getBadgeLeafColorInputId(key) {
    return `badge-leaf-color-${key}`;
}

function getBadgeLeafStyleColors(configColors = {}) {
    return {
        ...getDefaultBadgeLeafColors(),
        ...(configColors || {})
    };
}

function collectSharedLeafScale() {
    const rawValue = getInputValue('param-sharedLeafScale') || getInputValue('param-leafDisplayScale');
    return clampNumber(rawValue, 0.4, 2, 1);
}

function setSharedLeafScale(value) {
    const scale = clampNumber(value, 0.4, 2, 1);
    const normalized = Number(scale.toFixed(2));
    setInputValue('param-sharedLeafScale', normalized);
    setInputValue('param-leafDisplayScale', normalized);

    const sharedOutput = document.getElementById('param-sharedLeafScaleValue');
    if (sharedOutput) sharedOutput.textContent = `${normalized.toFixed(2)}x`;

    const oldOutput = document.getElementById('param-leafDisplayScaleValue');
    if (oldOutput) oldOutput.textContent = String(normalized);

    document.querySelectorAll('.badge-leaf-preview').forEach(preview => {
        preview.style.setProperty('--badge-preview-scale', normalized);
    });

    const previewBox = document.getElementById('previewLeafBox');
    if (previewBox) {
        previewBox.style.transform = `scale(${normalized})`;
    }
}

function collectBadgeLeafStyleColors() {
    const defaults = getDefaultBadgeLeafColors();
    return BADGE_LEAF_STYLE_BADGES.reduce((colors, badge) => {
        colors[badge.key] = normalizeHexColor(getInputValue(getBadgeLeafColorInputId(badge.key)), defaults[badge.key]);
        return colors;
    }, {});
}

function updateBadgeLeafPreviews() {
    const colors = collectBadgeLeafStyleColors();
    BADGE_LEAF_STYLE_BADGES.forEach((badge) => {
        const preview = document.querySelector(`[data-preview-badge-leaf="${badge.key}"]`);
        if (preview) {
            preview.style.setProperty('--badge-preview-color', colors[badge.key]);
        }
    });
    setSharedLeafScale(collectSharedLeafScale());
}

function updateFeedbackStylePreview() {
    const opacity = clampNumber(getInputValue('param-feedbackCardOpacity'), 0.55, 1, 0.9);
    const accentColor = normalizeHexColor(getInputValue('param-feedbackAccentColor'), '#4a7c59');

    const opacityOutput = document.getElementById('param-feedbackCardOpacityValue');
    if (opacityOutput) opacityOutput.textContent = opacity.toFixed(2);

    const preview = document.getElementById('feedback-style-preview');
    if (preview) {
        preview.style.setProperty('--feedback-preview-color', accentColor);
        preview.textContent = `Card opacity ${opacity.toFixed(2)}`;
    }
}

function bindFeedbackAndLeafStyleControls() {
    [
        'param-feedbackCardOpacity',
        'param-feedbackAccentColor'
    ].forEach((id) => {
        const input = document.getElementById(id);
        if (input && !input.dataset.feedbackStyleBound) {
            input.addEventListener('input', updateFeedbackStylePreview);
            input.dataset.feedbackStyleBound = 'true';
        }
    });

    [
        'param-sharedLeafScale',
        'param-leafDisplayScale'
    ].forEach((id) => {
        const input = document.getElementById(id);
        if (input && !input.dataset.sharedLeafBound) {
            input.addEventListener('input', () => {
                setSharedLeafScale(input.value);
                updateBadgeLeafPreviews();
            });
            input.dataset.sharedLeafBound = 'true';
        }
    });

    BADGE_LEAF_STYLE_BADGES.forEach((badge) => {
        const input = document.getElementById(getBadgeLeafColorInputId(badge.key));
        if (input && !input.dataset.badgeLeafBound) {
            input.addEventListener('input', updateBadgeLeafPreviews);
            input.dataset.badgeLeafBound = 'true';
        }
    });
}

function getLandingLayoutValues() {
    return {
        landingTextScale: clampNumber(getInputValue('layout-landingTextScale'), 0.75, 1.4, 1),
        landingPanelWidth: clampNumber(getInputValue('layout-landingPanelWidth'), 360, 1000, 600),
        landingPanelMinHeight: clampNumber(getInputValue('layout-landingPanelMinHeight'), 0, 900, 0),
        landingPanelPadding: clampNumber(getInputValue('layout-landingPanelPadding'), 20, 120, 60),
        landingPanelOffsetX: clampNumber(getInputValue('layout-landingPanelOffsetX'), -360, 360, 0),
        landingPanelOffsetY: clampNumber(getInputValue('layout-landingPanelOffsetY'), -220, 220, 0),
        startButtonOffsetX: clampNumber(getInputValue('layout-startButtonOffsetX'), -220, 220, 0),
        startButtonOffsetY: clampNumber(getInputValue('layout-startButtonOffsetY'), -160, 160, 0),
        startButtonWidth: clampNumber(getInputValue('layout-startButtonWidth'), 180, 600, 280),
        startButtonHeight: clampNumber(getInputValue('layout-startButtonHeight'), 44, 120, 64),
        pledgeboardButtonOffsetX: clampNumber(getInputValue('layout-pledgeboardButtonOffsetX'), -220, 220, 0),
        pledgeboardButtonOffsetY: clampNumber(getInputValue('layout-pledgeboardButtonOffsetY'), -160, 160, 0),
        pledgeboardButtonWidth: clampNumber(getInputValue('layout-pledgeboardButtonWidth'), 180, 900, 600),
        pledgeboardButtonHeight: clampNumber(getInputValue('layout-pledgeboardButtonHeight'), 44, 140, 64)
    };
}

function withLandingLayoutDefaults(config = {}) {
    return {
        ...config,
        layoutSettings: {
            ...DEFAULT_LANDING_LAYOUT_SETTINGS,
            ...(config.layoutSettings || {})
        }
    };
}

function updateLandingLayoutPreview() {
    const layout = getLandingLayoutValues();
    const scaleOutput = document.getElementById('layout-landingTextScaleValue');
    const previewStage = document.querySelector('.landing-preview-stage');

    if (scaleOutput) {
        scaleOutput.textContent = `${layout.landingTextScale.toFixed(2)}x`;
    }

    if (previewStage) {
        previewStage.style.setProperty('--preview-text-scale', layout.landingTextScale);
        previewStage.style.setProperty('--preview-brand-size', `${Math.round(14 * layout.landingTextScale)}px`);
        previewStage.style.setProperty('--preview-language-size', `${Math.round(11 * layout.landingTextScale)}px`);
        previewStage.style.setProperty('--preview-title-size', `${Math.round(30 * layout.landingTextScale)}px`);
        previewStage.style.setProperty('--preview-subtitle-size', `${Math.round(14 * layout.landingTextScale)}px`);
        previewStage.style.setProperty('--preview-button-size', `${Math.round(13 * layout.landingTextScale)}px`);
        previewStage.style.setProperty('--preview-panel-x', `${Math.round(layout.landingPanelOffsetX * 0.45)}px`);
        previewStage.style.setProperty('--preview-panel-y', `${Math.round(layout.landingPanelOffsetY * 0.45)}px`);
        previewStage.style.setProperty('--preview-button-x', `${Math.round(layout.startButtonOffsetX * 0.45)}px`);
        previewStage.style.setProperty('--preview-button-y', `${Math.round(layout.startButtonOffsetY * 0.45)}px`);
        previewStage.style.setProperty('--preview-button-width', `${Math.round(layout.startButtonWidth * 0.45)}px`);
        previewStage.style.setProperty('--preview-button-height', `${Math.round(layout.startButtonHeight * 0.45)}px`);
        previewStage.style.setProperty('--preview-panel-width', `${Math.round(layout.landingPanelWidth * 0.45)}px`);
        previewStage.style.setProperty('--preview-panel-min-height', `${Math.round(layout.landingPanelMinHeight * 0.45)}px`);
        previewStage.style.setProperty('--preview-panel-padding', `${Math.round(layout.landingPanelPadding * 0.45)}px`);
        previewStage.style.setProperty('--preview-pledge-button-x', `${Math.round(layout.pledgeboardButtonOffsetX * 0.45)}px`);
        previewStage.style.setProperty('--preview-pledge-button-y', `${Math.round(layout.pledgeboardButtonOffsetY * 0.45)}px`);
        previewStage.style.setProperty('--preview-pledge-button-width', `${Math.round(layout.pledgeboardButtonWidth * 0.45)}px`);
        previewStage.style.setProperty('--preview-pledge-button-height', `${Math.round(layout.pledgeboardButtonHeight * 0.45)}px`);
    }
}

function resetLandingLayoutPreview() {
    setInputValue('layout-landingTextScale', 1);
    setInputValue('layout-landingPanelWidth', 600);
    setInputValue('layout-landingPanelMinHeight', 0);
    setInputValue('layout-landingPanelPadding', 60);
    setInputValue('layout-landingPanelOffsetX', 0);
    setInputValue('layout-landingPanelOffsetY', 0);
    setInputValue('layout-startButtonOffsetX', 0);
    setInputValue('layout-startButtonOffsetY', 0);
    setInputValue('layout-startButtonWidth', 280);
    setInputValue('layout-startButtonHeight', 64);
    setInputValue('layout-pledgeboardButtonOffsetX', 0);
    setInputValue('layout-pledgeboardButtonOffsetY', 0);
    setInputValue('layout-pledgeboardButtonWidth', 600);
    setInputValue('layout-pledgeboardButtonHeight', 64);
    updateLandingLayoutPreview();
    // <Jun Kai start>
    updateParameterChanges();
    updateParameterPreview();
    // <Jun Kai end>
}

function bindLandingLayoutPreview() {
    [
        'layout-landingTextScale',
        'layout-landingPanelWidth',
        'layout-landingPanelMinHeight',
        'layout-landingPanelPadding',
        'layout-landingPanelOffsetX',
        'layout-landingPanelOffsetY',
        'layout-startButtonOffsetX',
        'layout-startButtonOffsetY',
        'layout-startButtonWidth',
        'layout-startButtonHeight',
        'layout-pledgeboardButtonOffsetX',
        'layout-pledgeboardButtonOffsetY',
        'layout-pledgeboardButtonWidth',
        'layout-pledgeboardButtonHeight'
    ].forEach(id => {
        const input = document.getElementById(id);
        if (input && !input.dataset.previewBound) {
            input.addEventListener('input', updateLandingLayoutPreview);
            input.dataset.previewBound = 'true';
        }
    });
}

function populateParameterForm(config) {
    const feedback = config.feedbackMessages || {};
    const content = config.contentSettings || {};
    const campaign = config.campaignSettings || {};
    const email = config.emailContent || {};
    // Feature flags and centralized validation rules loaded into admin controls (DONE BY CAEDEN)
    const flags = config.featureFlags || {};
    const rules = config.validationRules || {};
    const tree = config.treeParameters || {};
    const feedbackStyle = config.feedbackPageStyle || {};
    const badgeLeafStyles = config.badgeLeafStyles || {};
    const photo = config.photoSettings || {};
    const overlay = config.overlaySettings || {};
    const assets = config.visualAssets || {};
    const layout = { ...DEFAULT_LANDING_LAYOUT_SETTINGS, ...(config.layoutSettings || {}) };
    const archive = config.archiveSettings || {}; // Auto-archive settings loaded into admin controls (Done by Caeden)

    setInputValue('param-thankYouTitle', feedback.thankYouTitle);
    setInputValue('param-thankYouSubtitle', feedback.thankYouSubtitle);
    setInputValue('param-thankYouMessage', feedback.thankYouMessage);
    setInputValue('param-thankYouFooter', feedback.thankYouFooter);
    setInputValue('param-consentPrompt', feedback.consentPrompt);
    setInputValue('param-detailsPrompt', feedback.detailsPrompt);
    setInputValue('param-feedbackPrompt', feedback.feedbackPrompt);
    setInputValue('param-pledgePrompt', feedback.pledgePrompt);

    const pledgeExamples = Array.isArray(content.pledgeExamples) ? content.pledgeExamples : [];
    setInputValue('param-temporaryRetentionDays', content.temporaryRetentionDays || 7);
    setInputValue('param-pledgeExample1', pledgeExamples[0] || 'Carry a reusable bottle and cutlery every day');
    setInputValue('param-pledgeExample2', pledgeExamples[1] || 'Sort waste properly and recycle whenever possible');
    setInputValue('param-pledgeExample3', pledgeExamples[2] || 'Reduce food waste by taking only what I can finish');

    const campaignExamples = Array.isArray(campaign.pledgeExamples) ? campaign.pledgeExamples : [];
    setCheckedValue('campaign-enabled', campaign.enabled === true);
    setInputValue('campaign-title', campaign.title || 'Food Waste Week');
    setInputValue('campaign-cadence', campaign.cadence || 'weekly');
    setInputValue('campaign-treeSubtitle', campaign.treeSubtitle || "This week's focus: reduce food waste through mindful choices.");
    setInputValue('campaign-pulseGoal', campaign.pulseGoal || 100);
    setInputValue('campaign-badgeEmphasis', campaign.badgeEmphasis || 'sustainable-living');
    setInputValue('campaign-focusKeywords', (campaign.focusKeywords || []).join(','));
    setInputValue('campaign-pledgeExample1', campaignExamples[0] || 'Take only what I can finish during meals');
    setInputValue('campaign-pledgeExample2', campaignExamples[1] || 'Share food waste tips with one friend this week');
    setInputValue('campaign-pledgeExample3', campaignExamples[2] || 'Choose reusable containers for takeaway food');

    setInputValue('param-thankYouSubject', email.thankYouSubject);
    setInputValue('param-thankYouIntro', email.thankYouIntro);
    setInputValue('param-thankYouClosing', email.thankYouClosing);
    setInputValue('param-senderName', email.senderName);
    setInputValue('param-footerNote', email.footerNote);

    setCheckedValue('flag-cameraCaptureEnabled', flags.cameraCaptureEnabled);
    setCheckedValue('flag-photoUploadEnabled', flags.photoUploadEnabled);
    setCheckedValue('flag-beautyFilterEnabled', flags.beautyFilterEnabled);
    setCheckedValue('flag-pledgeEnabled', flags.pledgeEnabled);
    setCheckedValue('flag-badgeEmailEnabled', flags.badgeEmailEnabled);
    setCheckedValue('flag-thankYouEmailEnabled', flags.thankYouEmailEnabled);
    setCheckedValue('flag-socialSharingEnabled', flags.socialSharingEnabled);
    setCheckedValue('flag-floatingLanguageSelectorEnabled', flags.floatingLanguageSelectorEnabled === true);

    setCheckedValue('rule-nameRequired', rules.nameRequired);
    setInputValue('rule-nameMinLength', rules.nameMinLength);
    setInputValue('rule-nameMaxLength', rules.nameMaxLength);
    setCheckedValue('rule-emailRequired', rules.emailRequired);
    setInputValue('rule-dailySubmissionLimitPerEmail', typeof rules.dailySubmissionLimitPerEmail === 'undefined' ? 1 : rules.dailySubmissionLimitPerEmail);
    setCheckedValue('rule-requiredQuestionsEnabled', rules.requiredQuestionsEnabled);
    setCheckedValue('rule-pledgeRequired', rules.pledgeRequired);
    setInputValue('rule-pledgeMinLength', rules.pledgeMinLength);
    setInputValue('rule-pledgeMaxLength', rules.pledgeMaxLength);
    setCheckedValue('rule-pledgeTopicRequired', rules.pledgeTopicRequired);
    setCheckedValue('rule-photoRequired', rules.photoRequired);
    setInputValue('rule-maxPhotoFileSizeMb', rules.maxPhotoFileSizeMb);
    setInputValue('rule-allowedPhotoFormats', (rules.allowedPhotoFormats || []).join(','));
    setInputValue('param-ovalWidth', tree.ovalWidth);
    setInputValue('param-ovalHeight', tree.ovalHeight);
    setInputValue('param-ovalTopOffset', tree.ovalTopOffset);
    setInputValue('param-leafRefreshInterval', tree.leafRefreshInterval);
    setInputValue('param-leafOpacity', tree.leafOpacity);
    setInputValue('param-leafAnimationDuration', tree.leafAnimationDuration);
    setInputValue('param-leafShowcaseSeconds', tree.leafShowcaseSeconds ?? 12);
    setInputValue('tree3d-leafShowcaseSeconds', tree.leafShowcaseSeconds ?? 12); // the same setting in the 3D panel
    setInputValue('param-leafFallThreshold', tree.leafFallThreshold);
    setInputValue('param-leafFallDuration', tree.leafFallDuration);
    const normalizedTreeStage = Number.isInteger(Number(tree.treeStage))
        ? Math.max(0, Math.min(4, Number(tree.treeStage)))
        : 0;
    setInputValue('param-treeStage', normalizedTreeStage);
    const treeStageStatus = document.getElementById('tree-stage-status');
    if (treeStageStatus) {
        treeStageStatus.textContent = `Current: stage ${normalizedTreeStage}. Shown on /tree after apply.`;
    }
    setInputValue('param-treeDisplayMode', tree.treeDisplayMode || '2d');
    // The 2D tree's picture style (js/tree.js): painted, or captured from the 3D tree.
    setInputValue('param-treeStyle', ['natural', 'digital'].includes(tree.treeStyle) ? tree.treeStyle : 'painted');
    if (typeof setScreenSizeFields === 'function') setScreenSizeFields('param', tree.screenSize); // js/tree.js
    if (typeof loadTreeStylePreviews === 'function') loadTreeStylePreviews();
    setCheckedValue('param-showTitleBox', tree.showTitleBox !== false);
    // Leaf display scale (new) - Done by Yu Kang
    const badgeLeafScale = Number(badgeLeafStyles.leafScale);
    const leafScale = typeof tree.leafDisplayScale !== 'undefined'
        ? tree.leafDisplayScale
        : (Number.isFinite(badgeLeafScale) ? badgeLeafScale : 1);
    const vipLeafScale = typeof tree.vipLeafDisplayScale !== 'undefined'
        ? tree.vipLeafDisplayScale
        : leafScale;
    const leafScaleEl = document.getElementById('param-leafDisplayScale');
    if (leafScaleEl) {
        leafScaleEl.value = leafScale;
        const valEl = document.getElementById('param-leafDisplayScaleValue');
        if (valEl) valEl.textContent = String(leafScale);
    }
    const vipLeafScaleEl = document.getElementById('param-vipLeafDisplayScale');
    if (vipLeafScaleEl) {
        vipLeafScaleEl.value = vipLeafScale;
        const vipValEl = document.getElementById('param-vipLeafDisplayScaleValue');
        if (vipValEl) vipValEl.textContent = String(vipLeafScale);
    }
    setSharedLeafScale(leafScale);
    // "A leaf stays light for", in hours (24 when unset or 0, as the 2D tree takes it), shown in minutes when it
    // is not a whole number of hours (so 1 minute shows as 1 minute).
    const tintHours = Number(badgeLeafStyles.tintDurationHours) > 0 ? Number(badgeLeafStyles.tintDurationHours) : 24;
    const tintInHours = Number.isInteger(tintHours);
    setInputValue('param-tintDurationHours', tintInHours ? tintHours : Math.max(1, Math.round(tintHours * 60)));
    setInputValue('param-tintDurationUnit', tintInHours ? 'hours' : 'minutes');

    const badgeLeafColors = getBadgeLeafStyleColors(badgeLeafStyles.colors);
    const defaultBadgeLeafColors = getDefaultBadgeLeafColors();
    BADGE_LEAF_STYLE_BADGES.forEach((badge) => {
        setInputValue(
            getBadgeLeafColorInputId(badge.key),
            normalizeHexColor(badgeLeafColors[badge.key], defaultBadgeLeafColors[badge.key])
        );
    });
    setRadioValue('beauty-filter', photo.beautyFilterEnabled);
    setInputValue('param-beautyFilterStrength', photo.beautyFilterStrength || 'medium');
    setInputValue('param-boomerangFrameDelayMs', photo.boomerangFrameDelayMs || 90); // changes made by nick
    setInputValue('param-boomerangQuality', photo.boomerangQuality || 'medium'); // Boomerang quality preset (DONE BY NICK)
    setInputValue('param-maxPhotoFileSize', bytesToMegabytes(photo.maxPhotoFileSize, 5));
    setCheckboxValues('photo-format', photo.supportedFormats || ['jpeg', 'png']);
    setRadioValue('overlay-upload', overlay.enableOverlayUpload);
    setInputValue('param-maxOverlayFileSize', bytesToMegabytes(overlay.maxOverlayFileSize, 10));
    setInputValue('param-gifOverlaySpeed', overlay.gifOverlaySpeed || 1); // changes made by nick
    setInputValue('param-feedbackBackground', feedbackStyle.backgroundCss || assets.feedbackBackground);
    setInputValue('param-feedbackCardOpacity', clampNumber(feedbackStyle.cardOpacity, 0.55, 1, 0.9).toFixed(2));
    setInputValue('param-feedbackAccentColor', normalizeHexColor(feedbackStyle.accentColor, '#4a7c59'));
    setInputValue('param-treeBackground', assets.treeBackground);
    setInputValue('param-defaultOverlayTheme', assets.defaultOverlayTheme);
    setInputValue('layout-landingTextScale', layout.landingTextScale ?? 1);
    setInputValue('layout-landingPanelWidth', layout.landingPanelWidth ?? 600);
    setInputValue('layout-landingPanelMinHeight', layout.landingPanelMinHeight ?? 0);
    setInputValue('layout-landingPanelPadding', layout.landingPanelPadding ?? 60);
    setInputValue('layout-landingPanelOffsetX', layout.landingPanelOffsetX ?? 0);
    setInputValue('layout-landingPanelOffsetY', layout.landingPanelOffsetY ?? 0);
    setInputValue('layout-startButtonOffsetX', layout.startButtonOffsetX ?? 0);
    setInputValue('layout-startButtonOffsetY', layout.startButtonOffsetY ?? 0);
    setInputValue('layout-startButtonWidth', layout.startButtonWidth ?? 280);
    setInputValue('layout-startButtonHeight', layout.startButtonHeight ?? 64);
    setInputValue('layout-pledgeboardButtonOffsetX', layout.pledgeboardButtonOffsetX ?? 0);
    setInputValue('layout-pledgeboardButtonOffsetY', layout.pledgeboardButtonOffsetY ?? 0);
    setInputValue('layout-pledgeboardButtonWidth', layout.pledgeboardButtonWidth ?? 600);
    setInputValue('layout-pledgeboardButtonHeight', layout.pledgeboardButtonHeight ?? 64);
    bindLandingLayoutPreview();
    updateLandingLayoutPreview();
    bindFeedbackAndLeafStyleControls();
    updateFeedbackStylePreview();
    updateBadgeLeafPreviews();
    // Leaf image preview - Done by Yu Kang
    const previewBox = document.getElementById('previewLeafBox');
    if (previewBox) {
        if (assets.leafImage) {
            const leafPreviewPath = assets.leafImage.startsWith('/')
                ? assets.leafImage
                : `/assets/Tree/leaf/${assets.leafImage}`;
            previewBox.style.backgroundImage = `url('${leafPreviewPath}')`;
        } else {
            // None chosen: the 2D tree's own leaf pictures from /assets/Tree/leaf (New/Old Left/Right Leaf).
            previewBox.style.backgroundImage = "url('/assets/Tree/leaf/NewLeftLeaf.png')";
        }
        // apply scale to preview
        previewBox.style.transform = `scale(${leafScale})`;
    }
    const vipPreviewBox = document.getElementById('previewVipLeafBox');
    if (vipPreviewBox) {
        if (assets.vipLeafImage) {
            const vipLeafPreviewPath = assets.vipLeafImage.startsWith('/')
                ? assets.vipLeafImage
                : `/assets/Tree/vip-leaf/${assets.vipLeafImage}`;
            vipPreviewBox.style.backgroundImage = `url('${vipLeafPreviewPath}')`;
        } else {
            // None chosen: the 2D tree's own VIP leaf pictures from /assets/Tree/vip-leaf (Gold Left/Right Leaf).
            vipPreviewBox.style.backgroundImage = "url('/assets/Tree/vip-leaf/GoldLeftLeaf.png')";
        }
        vipPreviewBox.style.transform = `scale(${vipLeafScale})`;
    }
    // Show/hide revert button based on previous leaf image - Done by Yu Kang
    const revertBtn = document.getElementById('revert-leaf-btn');
    if (revertBtn) {
        revertBtn.style.display = assets.previousLeafImage ? 'block' : 'none';
    }
    const revertVipBtn = document.getElementById('revert-vip-leaf-btn');
    if (revertVipBtn) {
        revertVipBtn.style.display = assets.previousVipLeafImage ? 'block' : 'none';
    }
    // The pickers hide Revert again if that previous picture has since been deleted (loadAvailableLeafImages).
    window.previousLeafImagePath = assets.previousLeafImage || '';
    window.previousVipLeafImagePath = assets.previousVipLeafImage || '';
    // Load available leaf images from server - Done by Yu Kang
    window.currentLeafImagePath = assets.leafImage || '';
    loadAvailableLeafImages(window.currentLeafImagePath);
    window.currentVipLeafImagePath = assets.vipLeafImage || '';
    loadAvailableVipLeafImages(window.currentVipLeafImagePath);
    setCheckedValue('archive-autoArchiveEnabled', archive.autoArchiveEnabled);
    setInputValue('archive-archiveAfterDays', archive.archiveAfterDays || 90);
    setInputValue('archive-keepRecentFeedbackCount', archive.keepRecentFeedbackCount || 0);
    // <Jun Kai start>
    takeParameterSnapshot();
    updateParameterPreview();
    // <Jun Kai end>
}

function collectParameterForm() {
    const sharedLeafScale = collectSharedLeafScale();
    const feedbackBackground = getInputValue('param-feedbackBackground');

    return {
        feedbackMessages: {
            thankYouTitle: getInputValue('param-thankYouTitle'),
            thankYouSubtitle: getInputValue('param-thankYouSubtitle'),
            thankYouMessage: getInputValue('param-thankYouMessage'),
            thankYouFooter: getInputValue('param-thankYouFooter'),
            consentPrompt: getInputValue('param-consentPrompt'),
            detailsPrompt: getInputValue('param-detailsPrompt'),
            feedbackPrompt: getInputValue('param-feedbackPrompt'),
            pledgePrompt: getInputValue('param-pledgePrompt')
        },
        contentSettings: {
            temporaryRetentionDays: Math.min(365, Math.max(1, Number(getInputValue('param-temporaryRetentionDays')) || 7)),
            pledgeExamples: [
                getInputValue('param-pledgeExample1'),
                getInputValue('param-pledgeExample2'),
                getInputValue('param-pledgeExample3')
            ].filter(Boolean)
        },
        campaignSettings: {
            enabled: getCheckedValue('campaign-enabled'),
            title: getInputValue('campaign-title') || 'RP Xperience Centre Campaign',
            cadence: getInputValue('campaign-cadence') || 'weekly',
            treeSubtitle: getInputValue('campaign-treeSubtitle'),
            pulseGoal: Number(getInputValue('campaign-pulseGoal')) || 100,
            badgeEmphasis: getInputValue('campaign-badgeEmphasis') || 'sustainable-living',
            focusKeywords: getInputValue('campaign-focusKeywords').split(',').map(keyword => keyword.trim()).filter(Boolean),
            pledgeExamples: [
                getInputValue('campaign-pledgeExample1'),
                getInputValue('campaign-pledgeExample2'),
                getInputValue('campaign-pledgeExample3')
            ].filter(Boolean)
        },
        emailContent: {
            thankYouSubject: getInputValue('param-thankYouSubject'),
            thankYouIntro: getInputValue('param-thankYouIntro'),
            thankYouClosing: getInputValue('param-thankYouClosing'),
            senderName: getInputValue('param-senderName'),
            footerNote: getInputValue('param-footerNote')
        },
        // Feature toggles controlled by admin configuration (DONE BY CAEDEN)
        featureFlags: {
            cameraCaptureEnabled: getCheckedValue('flag-cameraCaptureEnabled'),
            photoUploadEnabled: getCheckedValue('flag-photoUploadEnabled'),
            beautyFilterEnabled: getCheckedValue('flag-beautyFilterEnabled'),
            pledgeEnabled: getCheckedValue('flag-pledgeEnabled'),
            badgeEmailEnabled: getCheckedValue('flag-badgeEmailEnabled'),
            thankYouEmailEnabled: getCheckedValue('flag-thankYouEmailEnabled'),
            socialSharingEnabled: getCheckedValue('flag-socialSharingEnabled'),
            floatingLanguageSelectorEnabled: getCheckedValue('flag-floatingLanguageSelectorEnabled')
        },
        // Centralized validation rules controlled by admin configuration (DONE BY CAEDEN)
        validationRules: {
            nameRequired: getCheckedValue('rule-nameRequired'),
            nameMinLength: Number(getInputValue('rule-nameMinLength')) || 0,
            nameMaxLength: Number(getInputValue('rule-nameMaxLength')) || 80,
            emailRequired: getCheckedValue('rule-emailRequired'),
            dailySubmissionLimitPerEmail: Math.max(0, Number(getInputValue('rule-dailySubmissionLimitPerEmail')) || 0),
            requiredQuestionsEnabled: getCheckedValue('rule-requiredQuestionsEnabled'),
            pledgeRequired: getCheckedValue('rule-pledgeRequired'),
            pledgeMinLength: Number(getInputValue('rule-pledgeMinLength')) || 0,
            pledgeMaxLength: Number(getInputValue('rule-pledgeMaxLength')) || 500,
            pledgeTopicRequired: getCheckedValue('rule-pledgeTopicRequired'),
            photoRequired: getCheckedValue('rule-photoRequired'),
            maxPhotoFileSizeMb: Number(getInputValue('rule-maxPhotoFileSizeMb')) || 5,
            allowedPhotoFormats: getInputValue('rule-allowedPhotoFormats').split(',').map(format => format.trim().toLowerCase()).filter(Boolean)
        },
        treeParameters: {
            ovalWidth: Number(getInputValue('param-ovalWidth')) || 850,
            ovalHeight: Number(getInputValue('param-ovalHeight')) || 300,
            ovalTopOffset: getNumberValue('param-ovalTopOffset', -100),
            leafRefreshInterval: getNumberValue('param-leafRefreshInterval', 30000),
            leafOpacity: getNumberValue('param-leafOpacity', 0.9),
            leafAnimationDuration: getNumberValue('param-leafAnimationDuration', 500),
            // A new leaf's time at the bottom middle before it flies to the 2D tree (frontend/tree/tree.js).
            leafShowcaseSeconds: Math.min(30, Math.max(0, getNumberValue('param-leafShowcaseSeconds', 12))),
            leafFallThreshold: getNumberValue('param-leafFallThreshold', 15),
            leafFallDuration: getNumberValue('param-leafFallDuration', 4200),
            treeStage: Math.max(0, Math.min(4, Number(getInputValue('param-treeStage')) || 0)),
            treeDisplayMode: getInputValue('param-treeDisplayMode') === '3d' ? '3d' : '2d',
            treeStyle: ['natural', 'digital'].includes(getInputValue('param-treeStyle')) ? getInputValue('param-treeStyle') : 'painted',
            screenSize: typeof readScreenSizeFields === 'function' ? readScreenSizeFields('param') : undefined,
            leafDisplayScale: sharedLeafScale,
            vipLeafDisplayScale: clampNumber(getInputValue('param-vipLeafDisplayScale') || 1, 0.4, 2, 1), // VIP Leaf Adjustments
            showTitleBox: getCheckedValue('param-showTitleBox')
        },
        feedbackPageStyle: {
            backgroundCss: feedbackBackground,
            cardOpacity: clampNumber(getInputValue('param-feedbackCardOpacity'), 0.55, 1, 0.9),
            accentColor: normalizeHexColor(getInputValue('param-feedbackAccentColor'), '#4a7c59')
        },
        badgeLeafStyles: {
            leafScale: sharedLeafScale,
            tintDurationHours: Math.round(clampNumber(
                (Number(getInputValue('param-tintDurationHours')) || 24) / (getInputValue('param-tintDurationUnit') === 'minutes' ? 60 : 1),
                0, 168, 24) * 1000) / 1000,
            colors: collectBadgeLeafStyleColors()
        },
        photoSettings: {
            beautyFilterEnabled: getRadioBoolean('beauty-filter'),
            beautyFilterStrength: getInputValue('param-beautyFilterStrength') || 'medium',
            boomerangFrameDelayMs: Math.max(40, Math.min(300, Number(getInputValue('param-boomerangFrameDelayMs')) || 90)), // changes made by nick
            boomerangQuality: ['compact', 'medium', 'high'].includes(getInputValue('param-boomerangQuality')) ? getInputValue('param-boomerangQuality') : 'medium', // Boomerang quality preset (DONE BY NICK)
            maxPhotoFileSize: megabytesToBytes(getInputValue('param-maxPhotoFileSize'), 5),
            supportedFormats: getCheckboxValues('photo-format')
        },
        overlaySettings: {
            enableOverlayUpload: getRadioBoolean('overlay-upload'),
            maxOverlayFileSize: megabytesToBytes(getInputValue('param-maxOverlayFileSize'), 10),
            gifOverlaySpeed: Math.max(0.25, Math.min(4, Number(getInputValue('param-gifOverlaySpeed')) || 1)), // changes made by nick
            supportedFormats: ['png', 'jpg', 'jpeg']
        },
        visualAssets: {
            feedbackBackground: feedbackBackground,
            treeBackground: getInputValue('param-treeBackground'),
            defaultOverlayTheme: getInputValue('param-defaultOverlayTheme')
        },
        layoutSettings: getLandingLayoutValues(),
        archiveSettings: {
            autoArchiveEnabled: getCheckedValue('archive-autoArchiveEnabled'),
            archiveAfterDays: Number(getInputValue('archive-archiveAfterDays')) || 90,
            keepRecentFeedbackCount: Number(getInputValue('archive-keepRecentFeedbackCount')) || 0
        }
    };
}

async function loadParameters() {
    try {
        // <Jun Kai start>
        fillParameterIcons();
        bindParameterChanges();
        bindParameterPreview();
        // <Jun Kai end>
        setParameterStatus('Loading parameters...', 'info');
        loadParameterOverlayOptions();
        const response = await fetch('/api/admin/parameters', { credentials: 'include' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load parameters');
        populateParameterForm(data.parameters || {});
        setParameterStatus('Parameters loaded.', 'success');
    } catch (error) {
        console.error('Error loading parameters:', error);
        setParameterStatus(error.message || 'Failed to load parameters.', 'error');
    }
}

async function loadParameterOverlayOptions() {
    const list = document.getElementById('param-overlay-options');
    if (!list) return;

    try {
        const response = await fetch('/api/admin/overlays', { credentials: 'include' });
        const data = await response.json();
        const overlays = data.overlays || data.data || [];
        list.innerHTML = overlays.map(overlay => {
            const id = escapeHtmlSafe(overlay.theme_id || '');
            const label = escapeHtmlSafe(overlay.display_name || overlay.theme_id || '');
            return `<option value="${id}" label="${label}"></option>`;
        }).join('');
    } catch (error) {
        console.warn('Unable to load overlay choices:', error);
    }
}

async function uploadParameterBackground() {
    const fileInput = document.getElementById('param-backgroundUpload');
    const file = fileInput?.files?.[0];
    if (!file) {
        setParameterStatus('Choose a background image first.', 'error');
        return;
    }

    try {
        setParameterStatus('Uploading background...', 'info');
        const formData = new FormData();
        formData.append('background', file);

        const response = await fetch('/api/admin/parameters/background', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to upload background');
        }

        setInputValue('param-feedbackBackground', data.backgroundCss);
        populateParameterForm(data.parameters || {});
        if (fileInput) fileInput.value = '';
        setParameterStatus(data.message || 'Background uploaded.', 'success');
    } catch (error) {
        console.error('Error uploading parameter background:', error);
        setParameterStatus(error.message || 'Failed to upload background.', 'error');
    }
}

async function saveParameters() {
    try {
        setParameterStatus('Saving parameters...', 'info');
        const payload = collectParameterForm();
        const response = await fetch('/api/admin/parameters', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save parameters');

        // Save the layout category explicitly so newer layout controls persist even
        // if the running main save endpoint has not been restarted yet.
        const layoutResponse = await fetch('/api/admin/parameters/layoutSettings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload.layoutSettings)
        });
        const layoutData = await layoutResponse.json();
        if (!layoutResponse.ok || !layoutData.success) {
            if (layoutResponse.status === 404 && String(layoutData.error || '').includes('layoutSettings')) {
                populateParameterForm(withLandingLayoutDefaults({
                    ...(data.parameters || {}),
                    layoutSettings: payload.layoutSettings
                }));
                setParameterStatus('Parameters saved. Restart the Node server once so start screen layout can persist after resets.', 'info');
                return;
            }
            throw new Error(layoutData.error || 'Failed to save start screen layout');
        }

        populateParameterForm(withLandingLayoutDefaults(layoutData.parameters || data.parameters || {}));
        setParameterStatus('Parameters and start screen layout saved successfully.', 'success');
    } catch (error) {
        console.error('Error saving parameters:', error);
        setParameterStatus(error.message || 'Failed to save parameters.', 'error');
    }
}

/*async function resetParametersToDefaults() {
    if (!confirm('Reset all parameter adjustments to their default values?')) return;
    try {
        setParameterStatus('Resetting parameters...', 'info');
        const response = await fetch('/api/admin/parameters/reset', { method: 'POST', credentials: 'include' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to reset parameters');
        populateParameterForm(withLandingLayoutDefaults(data.parameters || {}));
        setParameterStatus(data.message || 'Parameters reset to defaults.', 'success');
    } catch (error) {
        console.error('Error resetting parameters:', error);
        setParameterStatus(error.message || 'Failed to reset parameters.', 'error');
    }
}*/

// Run configured archive update from the admin panel (Done by Caeden)
async function runConfiguredArchiveNow() {
    if (!(await uiConfirm({ title: 'Run the archive update now?', message: 'It uses the archive timing saved on this page. Save your changes first if you changed the timing.', confirmText: 'Run now' }))) return; // <Jun Kai/> a kit window instead of the browser's box

    try {
        setParameterStatus('Running archive update...', 'info');
        const response = await fetch('/api/admin/archive/update-status', {
            method: 'POST',
            credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to run archive update');
        }

        setParameterStatus(`Archive update complete. ${data.archivedNow || 0} feedback record(s) moved after ${data.archiveAfterDays || 90} days.`, 'success');
    } catch (error) {
        console.error('Error running archive update:', error);
        setParameterStatus(error.message || 'Failed to run archive update.', 'error');
    }
}

function updateBeautyFilterOption() {}
function updateOverlayUploadOption() {}

