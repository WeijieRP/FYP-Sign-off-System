// Owner: Role 2, Wei Jie.
// Admin > Digital Tree Adjustment > 3D Tree Settings: the controls of the /3dTree page and its title box.
// Saves `tree3dParameters` through PUT /api/admin/parameters/tree3dParameters (checked by
// backend/features/parameters/tree3d.js); the 3D page reads them from /api/parameters every few seconds
// (frontend/3dTree/tree3d-settings.js). The defaults below match the 3D page with no settings saved.

const TREE3D_DEFAULTS = {
    weatherSource: 'live',
    manualSky: 'day',
    manualRain: false,
    rainArea: 'all',
    riverLevelMode: 'auto',
    autoOrbit: true,
    soundEnabled: false,
    soundVolume: 78,
    showSoilPanel: false,
    showWeatherPanel: true,
    showRiverPanel: true,
    showControlsBar: true,
    showYearReview: true
};

const TREE3D_TITLE_DEFAULTS = {
    showTitleBox: true,
    titleText: 'ESG Tree',
    subtitleText: 'Terminalia catappa · A living river valley',
    opacity: 0.54,
    blur: 18,
    radius: 20,
    position: 'auto',
    paddingX: 22,
    paddingY: 12
};

// 3D Leaf Adjustments: the feedback leaves on the 3D tree (frontend/3dTree/feedback-leaves.js).
const TREE3D_LEAF_DEFAULTS = {
    showFeedbackLeaves: true,
    showLeafNames: true,
    leafNewColor: '#7cb342',
    leafOldColor: '#1f5f2e',
    leafSide: 'both',
    leafNewHours: 24,
    leafScale: 1
};

// Greens only: light greens for new leaves, dark greens for older ones. The server accepts only these
// (LEAF_NEW_COLOURS / LEAF_OLD_COLOURS in backend/features/parameters/tree3d.js).
const TREE3D_LEAF_COLOURS = {
    New: [
        ['Light green', '#7cb342'],
        ['Fresh green', '#8bc34a'],
        ['Spring green', '#9ccc65'],
        ['Lime green', '#a4c639'],
        ['Leaf green', '#66bb6a']
    ],
    Old: [
        ['Dark green', '#1f5f2e'],
        ['Forest green', '#2e7d32'],
        ['Deep green', '#1b5e20'],
        ['Dark olive green', '#33691e'],
        ['Moss green', '#2d5a27']
    ],
    // Golds for VIP leaves (VIP_LEAF_COLOURS on the server).
    Vip: [
        ['Gold', '#d4af37'],
        ['Bright gold', '#ffd700'],
        ['Honey gold', '#e6b422'],
        ['Pale gold', '#f0c75e'],
        ['Dark gold', '#b8860b']
    ]
};

// 3D VIP Leaf Adjustments: VIP leaves (names in VIP Management) on the 3D tree.
const TREE3D_VIP_DEFAULTS = {
    vipLeafColor: '#d4af37',
    vipLeafScale: 1,
    vipGlow: true
};

// 3D Tree Visualization Parameters: the 2D tree's Visualization Parameters for the 3D tree
// (frontend/3dTree/feedback-leaves.js). Maximum Visible Leaves stays the 2D tree's, shared by both trees.
const TREE3D_VISUAL_DEFAULTS = {
    leafAreaWidth: 100,
    leafAreaHeight: 100,
    leafAreaOffset: 0,
    leafRefreshMs: 5000,
    leafOpacity: 1,
    leafAppearMs: 900,
    leafShowcaseSeconds: 12,
    leafFloatMs: 7200,
    leafFallMs: 4200,
    badgeColours: false
};
const TREE3D_VISUAL_NUMBERS = ['leafAreaWidth', 'leafAreaHeight', 'leafAreaOffset', 'leafRefreshMs', 'leafOpacity',
    'leafAppearMs', 'leafShowcaseSeconds', 'leafFloatMs', 'leafFallMs'];
// The badges, with the 2D tree's default colours (Badge Leaf Styling).
const TREE3D_BADGES = [
    ['feedback-completer', 'Feedback Contributor', '#4a7c59'],
    ['climate-champion', 'Climate Champion', '#0f766e'],
    ['renewable-innovator', 'Renewable Innovator', '#f59e0b'],
    ['sustainable-living-advocate', 'Sustainable Living Advocate', '#16a34a'],
    ['ocean-guardian', 'Ocean Guardian', '#0284c7'],
    ['governance-guardian', 'Governance Guardian', '#7c3aed'],
    ['social-champion', 'Social Champion', '#d97706']
];

// The rain areas the 3D page lists come from the same public Singapore feed.
const TREE3D_AREA_FEED = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast';

// Display 2D/3D Tree (top of Digital Tree Adjustment) picks which settings are shown below it:
// the 2D tabs for 2D, the 3D Tree Settings for 3D. Choosing only switches the view; Save Display makes it live.
function showTreeSettingsForMode(mode) {
    const page = document.getElementById('tree-adjustment-page');
    if (page) page.classList.toggle('tree-mode-3d', mode === '3d');
    if (mode === '3d' && typeof loadTree3dStage === 'function') loadTree3dStage(); // the stage may have changed in the 2D panel
}

function tree3dField(id) {
    return document.getElementById(`tree3d-${id}`);
}

function updateTree3dRangeLabels() {
    const volume = tree3dField('soundVolume');
    const opacity = tree3dField('titleOpacity');
    const blur = tree3dField('titleBlur');
    const radius = tree3dField('titleRadius');
    if (volume) tree3dField('soundVolumeValue').textContent = volume.value;
    if (opacity) tree3dField('titleOpacityValue').textContent = Number(opacity.value).toFixed(2);
    if (blur) tree3dField('titleBlurValue').textContent = `${blur.value}px`;
    if (radius) tree3dField('titleRadiusValue').textContent = `${radius.value}px`;
}

// Colour swatches: light greens for the new leaves, dark greens for the older ones, golds for VIP leaves.
function renderTree3dLeafSwatches() {
    for (const which of ['New', 'Old', 'Vip']) {
        const box = tree3dField(`leaf${which}Swatches`);
        if (!box || box.childElementCount) continue;
        for (const [name, hex] of TREE3D_LEAF_COLOURS[which]) {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'leaf3d-swatch';
            swatch.style.background = hex;
            swatch.dataset.colour = hex;
            swatch.title = name;
            swatch.setAttribute('aria-label', name);
            swatch.addEventListener('click', () => {
                tree3dField(`leaf${which}Color`).value = hex;
                updateTree3dLeafPreview();
            });
            box.appendChild(swatch);
        }
    }
}

// A leaf colour as the 3D tree shows it: at least this light (HSL), so a dark green leaf stands out on the
// canopy (MIN_LIGHTNESS in frontend/3dTree/feedback-leaves.js).
function tree3dShownColour(hex) {
    const value = parseInt(String(hex).slice(1), 16);
    if (!Number.isFinite(value)) return hex;
    let r = ((value >> 16) & 255) / 255, g = ((value >> 8) & 255) / 255, b = (value & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
    }
    l = Math.max(l, 0.38);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const channel = t => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    [r, g, b] = s === 0 ? [l, l, l] : [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
    return `#${[r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

// The preview shows the RainTree leaf in the chosen colours and sides, sized with the leaf scale.
// A left leaf is the leaf mirrored; with left and right mixed, the new leaf shows right and the older left.
function updateTree3dLeafPreview() {
    const scale = Number(tree3dField('leafScale')?.value) || 1;
    if (tree3dField('leafScaleValue')) tree3dField('leafScaleValue').textContent = String(Number(scale.toFixed(2)));
    const side = tree3dField('leafSide')?.value || 'both';
    for (const which of ['New', 'Old']) {
        const colour = (tree3dField(`leaf${which}Color`)?.value || '').toLowerCase();
        const preview = tree3dField(`leaf${which}Preview`);
        const shownSide = side === 'both' ? (which === 'New' ? 'right' : 'left') : side;
        if (preview) {
            preview.style.setProperty('--leaf-colour', tree3dShownColour(colour));
            const size = (0.5 + scale * 0.3).toFixed(2);
            preview.style.transform = `scale(${shownSide === 'left' ? -size : size}, ${size})`;
        }
        const caption = tree3dField(`leaf${which}Caption`);
        if (caption) caption.textContent = `${which === 'New' ? 'New' : 'Older'} leaf, ${shownSide}`;
        for (const swatch of tree3dField(`leaf${which}Swatches`)?.children || []) {
            swatch.setAttribute('aria-pressed', String(swatch.dataset.colour === colour));
        }
    }

    // The VIP leaf: gold, its own scale, the side as the new leaf, and the gold glow when on.
    const vipScale = Number(tree3dField('vipLeafScale')?.value) || 1;
    if (tree3dField('vipLeafScaleValue')) tree3dField('vipLeafScaleValue').textContent = String(Number(vipScale.toFixed(2)));
    const vipColour = (tree3dField('leafVipColor')?.value || '').toLowerCase();
    const vipSide = side === 'both' ? 'right' : side;
    const vipPreview = tree3dField('leafVipPreview');
    if (vipPreview) {
        const size = (0.5 + vipScale * 0.3).toFixed(2);
        vipPreview.style.setProperty('--leaf-colour', vipColour);
        vipPreview.style.transform = `scale(${vipSide === 'left' ? -size : size}, ${size})`;
    }
    tree3dField('leafVipGlowBox')?.classList.toggle('glowing', tree3dField('vipGlow')?.checked === true);
    if (tree3dField('leafVipCaption')) tree3dField('leafVipCaption').textContent = `VIP leaf, ${vipSide}`;
    for (const swatch of tree3dField('leafVipSwatches')?.children || []) {
        swatch.setAttribute('aria-pressed', String(swatch.dataset.colour === vipColour));
    }
}

// Rain area only applies to live weather; time of day and rain only to manual weather.
function updateTree3dWeatherFields() {
    const live = tree3dField('weatherSource')?.value !== 'manual';
    tree3dField('rainArea').disabled = !live;
    tree3dField('manualSky').disabled = live;
    tree3dField('manualRain').disabled = live;
}

function setTree3dRainArea(area) {
    const select = tree3dField('rainArea');
    if (!select) return;
    const value = area || 'all';
    // Keep a saved area even when the area list could not be loaded.
    if (![...select.options].some(option => option.value === value)) {
        select.add(new Option(value, value));
    }
    select.value = value;
}

async function loadTree3dRainAreas() {
    const select = tree3dField('rainArea');
    if (!select || select.dataset.loaded === 'true') return;
    try {
        const response = await fetch(TREE3D_AREA_FEED);
        const data = await response.json();
        const names = (data?.data?.area_metadata || [])
            .map(area => area?.name)
            .filter(name => typeof name === 'string' && name.trim())
            .sort((a, b) => a.localeCompare(b));
        const current = select.value;
        select.replaceChildren(new Option('All Singapore', 'all'), ...names.map(name => new Option(name, name)));
        select.dataset.loaded = 'true';
        setTree3dRainArea(current);
    } catch (error) {
        console.warn('Rain areas could not be loaded; All Singapore and the saved area stay available.', error);
    }
}

function fillTree3dForm(settings) {
    const s = { ...TREE3D_DEFAULTS, ...(settings || {}) };
    const box = { ...TREE3D_TITLE_DEFAULTS, ...(settings?.titleBox || {}) };
    const leaves = { ...TREE3D_LEAF_DEFAULTS, ...(settings || {}) };

    tree3dField('weatherSource').value = s.weatherSource;
    tree3dField('manualSky').value = s.manualSky;
    tree3dField('manualRain').checked = s.manualRain === true;
    setTree3dRainArea(s.rainArea);
    tree3dField('riverLevelMode').value = s.riverLevelMode;
    tree3dField('autoOrbit').checked = s.autoOrbit !== false;
    tree3dField('showSoilPanel').checked = s.showSoilPanel === true;
    tree3dField('soundEnabled').checked = s.soundEnabled === true;
    tree3dField('soundVolume').value = s.soundVolume;
    tree3dField('showWeatherPanel').checked = s.showWeatherPanel !== false;
    tree3dField('showRiverPanel').checked = s.showRiverPanel !== false;
    tree3dField('showControlsBar').checked = s.showControlsBar !== false;
    tree3dField('showYearReview').checked = s.showYearReview !== false;

    tree3dField('showFeedbackLeaves').checked = leaves.showFeedbackLeaves !== false;
    tree3dField('showLeafNames').checked = leaves.showLeafNames !== false;
    // A colour saved before the greens-only choice falls back to the default green.
    const offered = (which, hex) => TREE3D_LEAF_COLOURS[which].some(([, value]) => value === String(hex).toLowerCase());
    tree3dField('leafNewColor').value = offered('New', leaves.leafNewColor) ? leaves.leafNewColor.toLowerCase() : TREE3D_LEAF_DEFAULTS.leafNewColor;
    tree3dField('leafOldColor').value = offered('Old', leaves.leafOldColor) ? leaves.leafOldColor.toLowerCase() : TREE3D_LEAF_DEFAULTS.leafOldColor;
    tree3dField('leafSide').value = ['both', 'left', 'right'].includes(leaves.leafSide) ? leaves.leafSide : 'both';
    tree3dField('leafNewHours').value = leaves.leafNewHours;
    tree3dField('leafScale').value = leaves.leafScale;
    const vip = { ...TREE3D_VIP_DEFAULTS, ...(settings || {}) };
    tree3dField('leafVipColor').value = offered('Vip', vip.vipLeafColor) ? vip.vipLeafColor.toLowerCase() : TREE3D_VIP_DEFAULTS.vipLeafColor;
    tree3dField('vipLeafScale').value = vip.vipLeafScale;
    tree3dField('vipGlow').checked = vip.vipGlow !== false;

    const visual = { ...TREE3D_VISUAL_DEFAULTS, ...(settings || {}) };
    renderTree3dBadgeColours();
    if (tree3dField('leafAreaWidth')) {
        TREE3D_VISUAL_NUMBERS.forEach(key => { tree3dField(key).value = visual[key]; });
        tree3dField('badgeColours').checked = visual.badgeColours === true;
        const colours = settings?.badgeLeafColors || {};
        TREE3D_BADGES.forEach(([key, , fallback]) => { tree3dField(`badgeColour-${key}`).value = colours[key] || fallback; });
        updateTree3dVisualLabels();
    }

    tree3dField('showTitleBox').checked = box.showTitleBox !== false;
    tree3dField('titleText').value = box.titleText;
    tree3dField('subtitleText').value = box.subtitleText;
    tree3dField('titleOpacity').value = box.opacity;
    tree3dField('titleBlur').value = box.blur;
    tree3dField('titleRadius').value = box.radius;
    tree3dField('titlePosition').value = box.position;
    tree3dField('titlePaddingX').value = box.paddingX;
    tree3dField('titlePaddingY').value = box.paddingY;

    updateTree3dRangeLabels();
    updateTree3dWeatherFields();
    renderTree3dLeafSwatches();
    updateTree3dLeafPreview();
}

function collectTree3dSettings() {
    const whole = (id, fallback) => {
        const value = parseInt(tree3dField(id).value, 10);
        return Number.isFinite(value) ? value : fallback;
    };
    return {
        weatherSource: tree3dField('weatherSource').value,
        manualSky: tree3dField('manualSky').value,
        manualRain: tree3dField('manualRain').checked,
        rainArea: tree3dField('rainArea').value || 'all',
        riverLevelMode: tree3dField('riverLevelMode').value,
        autoOrbit: tree3dField('autoOrbit').checked,
        showSoilPanel: tree3dField('showSoilPanel').checked,
        soundEnabled: tree3dField('soundEnabled').checked,
        soundVolume: whole('soundVolume', TREE3D_DEFAULTS.soundVolume),
        showWeatherPanel: tree3dField('showWeatherPanel').checked,
        showRiverPanel: tree3dField('showRiverPanel').checked,
        showControlsBar: tree3dField('showControlsBar').checked,
        showYearReview: tree3dField('showYearReview').checked,
        showFeedbackLeaves: tree3dField('showFeedbackLeaves').checked,
        showLeafNames: tree3dField('showLeafNames').checked,
        leafNewColor: tree3dField('leafNewColor').value,
        leafOldColor: tree3dField('leafOldColor').value,
        leafSide: tree3dField('leafSide').value,
        leafNewHours: Number(tree3dField('leafNewHours').value) || 0,
        leafScale: Number(tree3dField('leafScale').value) || TREE3D_LEAF_DEFAULTS.leafScale,
        vipLeafColor: tree3dField('leafVipColor').value,
        vipLeafScale: Number(tree3dField('vipLeafScale').value) || TREE3D_VIP_DEFAULTS.vipLeafScale,
        vipGlow: tree3dField('vipGlow').checked,
        ...collectTree3dVisual(),
        titleBox: {
            showTitleBox: tree3dField('showTitleBox').checked,
            titleText: tree3dField('titleText').value,
            subtitleText: tree3dField('subtitleText').value,
            opacity: parseFloat(tree3dField('titleOpacity').value),
            blur: whole('titleBlur', TREE3D_TITLE_DEFAULTS.blur),
            radius: whole('titleRadius', TREE3D_TITLE_DEFAULTS.radius),
            position: tree3dField('titlePosition').value,
            paddingX: whole('titlePaddingX', TREE3D_TITLE_DEFAULTS.paddingX),
            paddingY: whole('titlePaddingY', TREE3D_TITLE_DEFAULTS.paddingY)
        }
    };
}

async function putTree3dSettings(changes) {
    const response = await fetch('/api/admin/parameters/tree3dParameters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(changes)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save 3D tree settings');
    return data.parameters?.tree3dParameters;
}

async function saveTree3dSettings() {
    try {
        const saved = await putTree3dSettings(collectTree3dSettings());
        if (saved) fillTree3dForm(saved);
        showNotification('3D tree settings saved. The 3D screen updates within a few seconds.', 'success');
    } catch (error) {
        console.error('Error saving 3D tree settings:', error);
        showNotification(error.message || 'Failed to save 3D tree settings.', 'error');
    }
}

// Each section's Reset only resets that section.
function tree3dLeafValues(settings) {
    const keys = [...Object.keys(TREE3D_LEAF_DEFAULTS), ...Object.keys(TREE3D_VIP_DEFAULTS),
        ...Object.keys(TREE3D_VISUAL_DEFAULTS), 'badgeLeafColors'];
    return Object.fromEntries(keys.map(key => [key, settings[key]]));
}

// ---------- 3D Tree Visualization Parameters ----------

// One colour box per badge, built once from TREE3D_BADGES.
function renderTree3dBadgeColours() {
    const list = tree3dField('badgeColours-list');
    if (!list || list.childElementCount) return;
    for (const [key, name, colour] of TREE3D_BADGES) {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex; align-items:center; gap:10px; color:#334155;';
        const input = document.createElement('input');
        input.type = 'color';
        input.id = `tree3d-badgeColour-${key}`;
        input.value = colour;
        input.style.cssText = 'width:42px; height:32px; padding:0; border:1px solid #d1d5db; border-radius:6px; background:#fff;';
        const text = document.createElement('span');
        text.textContent = name;
        row.append(input, text);
        list.append(row);
    }
}

function updateTree3dVisualLabels() {
    const show = (id, text) => { const output = tree3dField(`${id}Value`); if (output) output.textContent = text; };
    const value = id => Number(tree3dField(id)?.value);
    if (!tree3dField('leafAreaWidth')) return;
    show('leafAreaWidth', `${value('leafAreaWidth')}%`);
    show('leafAreaHeight', `${value('leafAreaHeight')}%`);
    const offset = value('leafAreaOffset');
    show('leafAreaOffset', offset === 0 ? '0%' : `${Math.abs(offset)}% ${offset < 0 ? 'up' : 'down'}`);
    show('leafOpacity', value('leafOpacity').toFixed(2));
}

function collectTree3dVisual() {
    if (!tree3dField('leafAreaWidth')) return {};
    const values = Object.fromEntries(TREE3D_VISUAL_NUMBERS.map(key => {
        const number = Number(tree3dField(key).value);
        return [key, Number.isFinite(number) && tree3dField(key).value !== '' ? number : TREE3D_VISUAL_DEFAULTS[key]];
    }));
    return {
        ...values,
        badgeColours: tree3dField('badgeColours').checked,
        badgeLeafColors: Object.fromEntries(TREE3D_BADGES.map(([key, , fallback]) =>
            [key, tree3dField(`badgeColour-${key}`)?.value || fallback]))
    };
}

// Maximum Visible Leaves is the 2D tree's (treeParameters.leafFallThreshold), shared by both trees.
function showTree3dMaxLeaves(count) {
    const value = Math.min(500, Math.max(1, Math.round(Number(count)) || 15));
    if (tree3dField('maxVisibleLeaves')) tree3dField('maxVisibleLeaves').value = value;
    if (tree3dField('leafCount2d')) tree3dField('leafCount2d').textContent = String(value);
    const field2d = document.getElementById('param-leafFallThreshold');
    if (field2d) field2d.value = value;
    return value;
}

async function saveTree3dVisualization() {
    try {
        const saved = await putTree3dSettings(collectTree3dSettings());
        if (saved) fillTree3dForm(saved);
        const leafFallThreshold = showTree3dMaxLeaves(tree3dField('maxVisibleLeaves')?.value);
        const response = await fetch('/api/admin/parameters/treeParameters', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ leafFallThreshold })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save Maximum Visible Leaves');
        showNotification('3D tree visualization saved. The 3D screen updates within a few seconds.', 'success');
    } catch (error) {
        console.error('Error saving the 3D tree visualization:', error);
        showNotification(error.message || 'Failed to save the 3D tree visualization.', 'error');
    }
}

// Resets this section's 3D settings; Maximum Visible Leaves stays, as the 2D tree shares it.
async function resetTree3dVisualization() {
    const defaults = { ...TREE3D_VISUAL_DEFAULTS, badgeLeafColors: Object.fromEntries(TREE3D_BADGES.map(([key, , colour]) => [key, colour])) };
    fillTree3dForm({ ...collectTree3dSettings(), ...defaults });
    await saveTree3dVisualization();
}

async function resetTree3dSettings() {
    const current = collectTree3dSettings();
    fillTree3dForm({ ...TREE3D_DEFAULTS, ...tree3dLeafValues(current), titleBox: current.titleBox });
    await saveTree3dSettings();
}

async function resetTree3dVipSettings() {
    fillTree3dForm({ ...collectTree3dSettings(), ...TREE3D_VIP_DEFAULTS });
    await saveTree3dSettings();
}

async function resetTree3dLeafSettings() {
    fillTree3dForm({ ...collectTree3dSettings(), ...TREE3D_LEAF_DEFAULTS });
    await saveTree3dSettings();
}

async function resetTree3dTitleSettings() {
    const current = collectTree3dSettings();
    fillTree3dForm({ ...current, titleBox: TREE3D_TITLE_DEFAULTS });
    await saveTree3dSettings();
}

// "Wind gust now" and "Play sunset now": the 3D screen runs the action when this time changes.
async function triggerTree3dAction(action) {
    const key = action === 'sunset' ? 'sunsetRequestedAt' : 'gustRequestedAt';
    try {
        await putTree3dSettings({ [key]: new Date().toISOString() });
        showNotification(action === 'sunset' ? 'Sunset sent to the 3D screen.' : 'Wind gust sent to the 3D screen.', 'success');
    } catch (error) {
        console.error('Error sending 3D tree action:', error);
        showNotification(error.message || 'Failed to send the action to the 3D screen.', 'error');
    }
}

// ---------- 3D Tree Growth Stage ----------
// The same growth stage as the 2D tree (treeParameters.treeStage, treeStageMode and leafThresholds), set
// the same way. Manual: the chosen stage. Auto: the tree grows by itself, the stage following the leaf count
// and the thresholds (worked out by the server for /api/parameters, backend/features/parameters/
// treeStage.js; previewed here with getCurrentLeafCount and getStageFromLeafCount from tree.js). The
// /3dTree screen shows the Ketapang Stage 0 to 4 model for it (frontend/3dTree/tree-stage.js).
const TREE3D_STAGE_NAMES = ['Bare Trunk', 'Early Growth', 'Young Canopy', 'Mature Canopy', 'Full Canopy'];

function tree3dStageThresholds() {
    const value = key => parseInt(tree3dField(`thresholdStage${key}`)?.value, 10) || 0;
    return { stage1: value(1), stage2: value(2), stage3: value(3), stage4: value(4) };
}

function tree3dStageIsAuto() {
    return document.querySelector('input[name="tree3dStageMode"]:checked')?.value !== 'manual';
}

async function updateTree3dAutoStage() {
    const countLabel = tree3dField('currentLeafCount');
    const preview = tree3dField('autoStagePreview');
    if (!countLabel || !preview) return null;
    const leafCount = await getCurrentLeafCount();
    const stage = getStageFromLeafCount(leafCount, tree3dStageThresholds());
    countLabel.textContent = String(leafCount);
    preview.textContent = `${stage} (${TREE3D_STAGE_NAMES[stage]})`;
    if (tree3dStageIsAuto()) tree3dField('treeStage').value = String(stage);
    return stage;
}

function updateTree3dStageMode() {
    const select = tree3dField('treeStage');
    const manual = tree3dField('manualStage');
    if (!select || !manual) return;
    const auto = tree3dStageIsAuto();
    select.disabled = auto;
    manual.style.opacity = auto ? '0.6' : '1';
    if (auto) updateTree3dAutoStage();
}

// Shows a saved stage, mode and thresholds in this panel and in the 2D tree's panel, so both always agree.
function showTree3dStage(treeParameters) {
    const raw = Number(treeParameters?.treeStage);
    const stage = Number.isInteger(raw) ? Math.max(0, Math.min(4, raw)) : 0;
    const mode = treeParameters?.treeStageMode === 'auto' ? 'auto' : 'manual';
    const thresholds = treeParameters?.leafThresholds || {};
    for (const [select, prefix] of [[tree3dField('treeStage'), 'tree3d-thresholdStage'], [document.getElementById('param-treeStage'), 'threshold-stage']]) {
        if (select) select.value = String(stage);
        [1, 2, 3, 4].forEach(key => {
            const input = document.getElementById(`${prefix}${key}`);
            const saved = thresholds[`stage${key}`];
            if (input && saved !== undefined && saved !== null) input.value = saved;
        });
    }
    const radio3d = document.querySelector(`input[name="tree3dStageMode"][value="${mode}"]`);
    if (radio3d) radio3d.checked = true;
    const radio2d = document.querySelector(`input[name="stageMode"][value="${mode}"]`);
    if (radio2d && !radio2d.checked) {
        radio2d.checked = true;
        radio2d.dispatchEvent(new Event('change')); // the 2D panel's own handler updates its stage list
    }
    const text = mode === 'auto'
        ? 'Auto: the tree grows by itself as leaves are added.'
        : `Manual: stage ${stage} (${TREE3D_STAGE_NAMES[stage]}).`;
    const status = tree3dField('stageStatus');
    if (status) status.textContent = text;
    const status2d = document.getElementById('tree-stage-status');
    if (status2d) status2d.textContent = mode === 'auto' ? text : `Current: stage ${stage}. Shown on /tree after apply.`;
    return stage;
}

async function loadTree3dStage() {
    if (!tree3dField('treeStage')) return;
    try {
        const response = await fetch('/api/admin/parameters/treeParameters', { credentials: 'include' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load the tree stage');
        showTree3dStage(data.parameters);
    } catch (error) {
        console.error('Error loading the 3D tree stage:', error);
        const status = tree3dField('stageStatus');
        if (status) status.textContent = 'Unable to load the saved stage.';
    }
    updateTree3dStageMode();
}

async function saveTree3dStage() {
    const status = tree3dField('stageStatus');
    try {
        const leafThresholds = tree3dStageThresholds();
        const auto = tree3dStageIsAuto();
        const treeStageMode = auto ? 'auto' : 'manual';
        const treeStage = auto
            ? await updateTree3dAutoStage()
            : Math.max(0, Math.min(4, Number(tree3dField('treeStage').value) || 0));
        if (status) status.textContent = `Saving stage ${treeStage}...`;
        const response = await fetch('/api/admin/parameters/treeParameters', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ treeStage, treeStageMode, leafThresholds })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save the tree stage');
        showTree3dStage(data.parameters?.treeParameters || { treeStage, treeStageMode, leafThresholds });
        if (status) {
            status.textContent = auto
                ? `Saved: Auto. Stage ${treeStage} (${TREE3D_STAGE_NAMES[treeStage]}) now; the tree grows by itself as leaves are added.`
                : `Saved: stage ${treeStage} (${TREE3D_STAGE_NAMES[treeStage]}). /3dTree shows it within about 5 seconds.`;
        }
        showNotification(auto
            ? `Automatic growth on: the tree is at stage ${treeStage} now and grows by itself as leaves are added.`
            : `Tree growth stage set to stage ${treeStage}. The 3D screen changes within a few seconds.`, 'success');
    } catch (error) {
        console.error('Error saving the 3D tree stage:', error);
        if (status) status.textContent = 'Failed to save the stage. Please try again.';
        showNotification(error.message || 'Failed to save the tree stage.', 'error');
    }
}

async function loadTree3dSettings() {
    loadTree3dStage();
    if (!tree3dField('weatherSource')) return;
    try {
        const response = await fetch('/api/parameters');
        const data = await response.json();
        fillTree3dForm(data.parameters?.tree3dParameters);
        // The 3D tree shows as many leaves as the 2D tree's Maximum Visible Leaves.
        showTree3dMaxLeaves(data.parameters?.treeParameters?.leafFallThreshold);
    } catch (error) {
        console.error('Error loading 3D tree settings:', error);
        fillTree3dForm(null);
    }
    loadTree3dRainAreas();
}

document.addEventListener('DOMContentLoaded', () => {
    showTreeSettingsForMode(document.getElementById('param-treeDisplayMode')?.value);
    loadTree3dSettings();
});
