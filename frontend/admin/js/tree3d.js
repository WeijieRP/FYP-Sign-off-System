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

// The rain areas the 3D page lists come from the same public Singapore feed.
const TREE3D_AREA_FEED = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast';

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

async function resetTree3dSettings() {
    const current = collectTree3dSettings();
    fillTree3dForm({ ...TREE3D_DEFAULTS, titleBox: current.titleBox });
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

async function loadTree3dSettings() {
    if (!tree3dField('weatherSource')) return;
    try {
        const response = await fetch('/api/parameters');
        const data = await response.json();
        fillTree3dForm(data.parameters?.tree3dParameters);
    } catch (error) {
        console.error('Error loading 3D tree settings:', error);
        fillTree3dForm(null);
    }
    loadTree3dRainAreas();
}

document.addEventListener('DOMContentLoaded', loadTree3dSettings);
