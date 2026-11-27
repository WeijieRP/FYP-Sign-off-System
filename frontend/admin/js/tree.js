// Owner: Role 2, Wei Jie. Previous team: Yu Kang (1).
// Part 19/30 of the admin page: digital tree management (load order in admin.html).
// ==================== 18. DIGITAL TREE MANAGEMENT ====================

// Load digital tree data
async function loadDigitalTreeData() {
    try {
        console.log('🌳 Loading digital tree data...');
        setTreeLeavesStatus('', ''); // <Jun Kai/> an old answer (Make VIP, a failed load) goes on every load
        loadTreePreview(); // <Jun Kai/> the small copy of the tree screen on Tree Leaves
        showTreeVipCard(); // <Jun Kai/> the VIP card, for a System Admin only
        await loadTreeStageSelection();
        await loadAvailableTreeBackgrounds();
        const response = await fetch('/api/tree');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Tree API response:', data);
        
        updateDigitalTreeTable(data);
        
    } catch (error) {
        console.error('Error loading tree data:', error);
        updateDigitalTreeTable([]);
        // <Jun Kai start> no alert box: a status line on Tree Leaves, and a notice when the load came from another page
        // (Refresh Data on Tree Settings), where that status line cannot be seen
        setTreeLeavesStatus('down', 'The tree could not be loaded: ' + error.message);
        if (!document.getElementById('digital-tree-page')?.classList.contains('active') && typeof showNotification === 'function') {
            showNotification('The tree could not be loaded: ' + error.message, 'error');
        }
        // <Jun Kai end>
    }
}


async function getCurrentLeafCount() {
    try {
        const res = await fetch('/api/tree', { credentials: 'include' });
        const data = await res.json();
        console.log('📡 /api/tree response:', data);  // debug

        // If the response is an array, the leaf count is its length
        if (Array.isArray(data)) {
            return data.length;
        }
        // If it's an object with a leafCount property (fallback for other endpoints)
        if (data && typeof data === 'object' && data.leafCount !== undefined) {
            return data.leafCount;
        }
        // If it's an object with a 'count' or 'total' property (just in case)
        if (data && data.count !== undefined) return data.count;
        if (data && data.total !== undefined) return data.total;

        // Otherwise, try to guess: if it's an object with a 'visitors' array
        if (data && Array.isArray(data.visitors)) {
            return data.visitors.length;
        }

        console.warn('⚠️ Unexpected response format from /api/tree:', data);
        return 0;
    } catch (e) {
        console.warn('Could not get leaf count, using 0', e);
        return 0;
    }
}

function getStageFromLeafCount(leafCount, thresholds) {
    // thresholds = { stage1: min, stage2: min, stage3: min, stage4: min }
    if (leafCount >= thresholds.stage4) return 4;
    if (leafCount >= thresholds.stage3) return 3;
    if (leafCount >= thresholds.stage2) return 2;
    if (leafCount >= thresholds.stage1) return 1;
    return 0;
}

async function saveTreeParameters() {
    const setStatus = (msg, type) => {
        if (typeof setParameterStatus === 'function') setParameterStatus(msg, type);
        else console.log(`[${type}] ${msg}`);
    };
    try {
        setStatus('Saving tree parameters...', 'info');

        const showTitleBox = document.getElementById('param-showTitleBox').checked;
        const leafScaleSlider = document.getElementById('param-leafDisplayScale');
        const leafDisplayScale = leafScaleSlider ? parseFloat(leafScaleSlider.value) : 1.0;
        // The VIP leaves' own scale (VIP Leaf Adjustments), 0.4 to 2; without the slider, the saved one stays.
        const vipLeafScaleSlider = document.getElementById('param-vipLeafDisplayScale');
        const vipLeafDisplayScale = vipLeafScaleSlider
            ? Math.min(2, Math.max(0.4, parseFloat(vipLeafScaleSlider.value) || 1))
            : undefined;
        const treeDisplayMode = document.getElementById('param-treeDisplayMode')?.value === '3d' ? '3d' : '2d';
        const treeStyle = chosenTreeStyle();

        // Get thresholds
        const thresholds = {
            stage1: parseInt(document.getElementById('threshold-stage1').value) || 0,
            stage2: parseInt(document.getElementById('threshold-stage2').value) || 0,
            stage3: parseInt(document.getElementById('threshold-stage3').value) || 0,
            stage4: parseInt(document.getElementById('threshold-stage4').value) || 0
        };

        // Determine which stage is currently active (manual or auto)
        const mode = document.querySelector('input[name="stageMode"]:checked')?.value;
        let treeStage;
        if (mode === 'manual') {
            treeStage = parseInt(document.getElementById('param-treeStage').value) || 0;
        } else {
            // Auto: get leaf count and compute stage
            const leafCount = await getCurrentLeafCount();
            treeStage = getStageFromLeafCount(leafCount, thresholds);
            // Update dropdown to match computed stage (for UI consistency)
            document.getElementById('param-treeStage').value = treeStage;
        }

        const payload = {
            treeStage,
            // Auto: the tree grows by itself with the leaf count (backend/features/parameters/treeStage.js).
            treeStageMode: mode === 'manual' ? 'manual' : 'auto',
            showTitleBox,
            leafDisplayScale,
            vipLeafDisplayScale,
            treeDisplayMode,
            treeStyle,                    // the 2D tree's pictures: painted, natural or digital
            screenSize: readScreenSizeFields('param'), // the 2D tree's screen shape
            leafThresholds: thresholds,   // save thresholds for later
            treeTitleBox: collectTreeTitleSettings()  // collect title box settings if needed
        };

        const response = await fetch('/api/admin/parameters/treeParameters', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save tree parameters');

        setStatus('Tree parameters saved.', 'success');
        showNotification('Tree display, leaf scale, and thresholds saved.', 'success');
        // A captured style with stages not captured yet: those stages show the painted tree until captured.
        if (treeStyle !== 'painted') {
            const missing = (await treeStyleCaptures(treeStyle)).filter(capture => !capture.meta).map(capture => capture.stage);
            if (missing.length) showNotification(`Stage ${missing.join(', ')} has no ${treeStyle} picture yet and shows the painted tree. Press "Capture from the 3D tree".`, 'warning');
        }

        // Refresh the auto stage preview
        updateAutoStagePreview();
    } catch (error) {
        console.error('Error saving tree parameters:', error);
        setStatus(error.message || 'Failed to save tree parameters.', 'error');
        showNotification(error.message || 'Failed to save tree parameters.', 'error');
    }
}

// ---------- Screen size, for the 2D tree (2D Tree Display) and the 3D tree (3D Scene Controls) ----------
// Auto fits the tree to the screen; a preset or a custom width and height draws it in that shape (for a display fed
// a picture of another shape, as an LED wall's controller often is). The server checks it and fills in a preset's
// size: backend/features/parameters/screenSize.js (the same presets). Fields: <prefix>-screenPreset, -screenWidth,
// -screenHeight; prefix 'param' (2D) or 'tree3d' (3D).
const SCREEN_SIZE_PRESETS = [
    ['auto', 'Auto: fit the screen', null, null],
    ['led-wall-7x2', 'ESG Centre LED wall, 7 m × 2 m (7:2)', 7, 2],
    ['hd-16x9', 'Standard screen, 16:9 (1920 × 1080)', 1920, 1080],
    ['ultrawide-21x9', 'Ultra-wide screen, 21:9', 21, 9],
    ['super-ultrawide-32x9', 'Super ultra-wide screen, 32:9', 32, 9],
    ['classic-4x3', 'Classic screen, 4:3', 4, 3],
    ['upright-9x16', 'Upright screen, 9:16 (1080 × 1920)', 1080, 1920],
    ['custom', 'Custom width and height', null, null]
];

function screenSizeField(prefix, name) {
    return document.getElementById(`${prefix}-${name}`);
}

function fillScreenSizeOptions() {
    document.querySelectorAll('select[data-screen-size]').forEach(select => {
        if (select.options.length) return;
        SCREEN_SIZE_PRESETS.forEach(([value, label]) => select.add(new Option(label, value)));
    });
}

// Shows the width and height for Custom, and the shape chosen (e.g. "Shape 3.50 : 1, wider than 16:9").
function updateScreenSizeFields(prefix) {
    fillScreenSizeOptions();
    const select = screenSizeField(prefix, 'screenPreset');
    if (!select) return;
    const custom = select.value === 'custom';
    const customRow = screenSizeField(prefix, 'screenCustom');
    if (customRow) customRow.hidden = !custom;
    const note = screenSizeField(prefix, 'screenShape');
    if (!note) return;
    const preset = SCREEN_SIZE_PRESETS.find(([value]) => value === select.value);
    const width = custom ? Number(screenSizeField(prefix, 'screenWidth')?.value) : preset?.[2];
    const height = custom ? Number(screenSizeField(prefix, 'screenHeight')?.value) : preset?.[3];
    if (select.value === 'auto') note.textContent = 'The tree fills whatever screen it is shown on.';
    else if (!(width > 0 && height > 0)) note.textContent = 'Enter the screen\'s width and height (any unit).';
    else {
        const ratio = width / height;
        const compare = ratio > 1.8 ? 'wider than 16:9' : ratio < 1.75 ? (ratio < 1 ? 'taller than wide' : 'narrower than 16:9') : 'the same as 16:9';
        note.textContent = `Shape ${ratio >= 1 ? `${ratio.toFixed(2)} : 1` : `1 : ${(1 / ratio).toFixed(2)}`}, ${compare}.`;
    }
}

function setScreenSizeFields(prefix, value) {
    fillScreenSizeOptions();
    const select = screenSizeField(prefix, 'screenPreset');
    if (!select) return;
    const preset = SCREEN_SIZE_PRESETS.some(([key]) => key === value?.preset) ? value.preset : 'auto';
    select.value = preset;
    if (preset === 'custom') {
        screenSizeField(prefix, 'screenWidth').value = value.width ?? '';
        screenSizeField(prefix, 'screenHeight').value = value.height ?? '';
    }
    updateScreenSizeFields(prefix);
}

// The fields as the server takes them; undefined without the fields (an older page).
function readScreenSizeFields(prefix) {
    const select = screenSizeField(prefix, 'screenPreset');
    if (!select || !select.value) return undefined;
    if (select.value !== 'custom') return { preset: select.value };
    return {
        preset: 'custom',
        width: Number(screenSizeField(prefix, 'screenWidth').value),
        height: Number(screenSizeField(prefix, 'screenHeight').value)
    };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { updateScreenSizeFields('param'); updateScreenSizeFields('tree3d'); });
else { updateScreenSizeFields('param'); updateScreenSizeFields('tree3d'); }

// ---------- The 2D tree's picture style (checklist item 12) ----------
// Painted shows the original stage pictures; Natural and Digital show pictures of the 3D tree at each stage
// (assets/Tree/2d-from-3d/<style>/), so the 2D and 3D screens match. "Capture from the 3D tree" opens the 3D
// page in capture mode in a small frame, once for each style and stage, and saves each picture through
// POST /api/admin/parameters/tree-style-capture (backend/features/parameters/tree2dStyle.js); the 3D page draws
// the picture itself (frontend/3dTree/capture-2d.js). scripts/tree/capture-2d-from-3d.js does the same.
const TREE_STYLE_STAGES = [0, 1, 2, 3, 4];
const TREE_STYLE_LOOKS = { natural: 'natural', digital: 'glow' };
const TREE_STYLE_NAMES = { natural: 'Natural', digital: 'Digital' };
const TREE_STYLE_READY_MS = 120000;
let treeStyleCaptureRun = null; // the capture in progress: { stopped }

function chosenTreeStyle() {
    const value = document.getElementById('param-treeStyle')?.value;
    return ['natural', 'digital'].includes(value) ? value : 'painted';
}

// Each stage's saved picture description (stage<N>.json), or meta: null where none has been captured.
async function treeStyleCaptures(style) {
    return Promise.all(TREE_STYLE_STAGES.map(async stage => {
        const base = `/assets/Tree/2d-from-3d/${style}/stage${stage}`;
        try {
            const response = await fetch(`${base}.json`, { cache: 'no-store' });
            return { stage, base, meta: response.ok ? await response.json() : null };
        } catch {
            return { stage, base, meta: null };
        }
    }));
}

// The chosen style's pictures, stage by stage, with when each was captured.
async function loadTreeStylePreviews() {
    const box = document.getElementById('tree-style-previews');
    if (!box) return;
    const style = chosenTreeStyle();
    const figure = (src, caption, alt) => {
        const item = document.createElement('figure');
        item.className = 'tree-style-preview';
        if (src) {
            const img = document.createElement('img');
            img.src = src;
            img.alt = alt;
            img.loading = 'lazy';
            item.appendChild(img);
        } else {
            const missing = document.createElement('div');
            missing.className = 'tree-style-missing';
            missing.textContent = 'Not captured yet';
            item.appendChild(missing);
        }
        const text = document.createElement('figcaption');
        text.textContent = caption;
        item.appendChild(text);
        return item;
    };
    if (style === 'painted') {
        // The painted tree is two pictures, as on /tree: its canopy (stage<N>leaves.png, none at stage 0) under
        // its trunk and branches (stage<N>.png), on the default background.
        box.replaceChildren(...TREE_STYLE_STAGES.map(stage => {
            const item = figure(null, `Stage ${stage}`, '');
            const picture = document.createElement('div');
            picture.className = 'tree-style-painted';
            picture.setAttribute('role', 'img');
            picture.setAttribute('aria-label', `Painted tree, stage ${stage}`);
            const layers = stage > 0 ? [`/assets/Tree/stage${stage}leaves.png`, `/assets/Tree/stage${stage}.png`] : ['/assets/Tree/stage0.png'];
            layers.forEach(src => {
                const img = document.createElement('img');
                img.src = src;
                img.alt = '';
                picture.appendChild(img);
            });
            item.replaceChild(picture, item.firstChild);
            return item;
        }));
        return;
    }
    const captures = await treeStyleCaptures(style);
    if (chosenTreeStyle() !== style) return; // changed again meanwhile
    box.replaceChildren(...captures.map(({ stage, base, meta }) => {
        if (!meta) return figure(null, `Stage ${stage}`, '');
        const when = meta.capturedAt ? new Date(meta.capturedAt).toLocaleString() : '';
        return figure(`${base}.jpg?v=${encodeURIComponent(meta.capturedAt || '')}`, `Stage ${stage}${when ? ` · ${when}` : ''}`, `${TREE_STYLE_NAMES[style]} tree, stage ${stage}`);
    }));
}

function setTreeStyleStatus(text, isError = false) {
    const status = document.getElementById('tree-style-status');
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('error', isError);
}

// Opens the 3D page in capture mode in the frame and waits until it is ready to be captured.
function openTreeCapturePage(frame, style, stage, run) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const check = () => {
            if (run.stopped) return reject(new Error('Capture stopped.'));
            let ready = false;
            try { ready = frame.contentWindow?.tree2dCaptureReady === true; } catch { /* still loading */ }
            if (ready) return resolve(frame.contentWindow);
            if (Date.now() - started > TREE_STYLE_READY_MS) return reject(new Error(`The 3D tree (${TREE_STYLE_NAMES[style]}, stage ${stage}) did not finish loading.`));
            setTimeout(check, 500);
        };
        frame.src = `/3dTree/3dTree.html?capture2d=1&look=${TREE_STYLE_LOOKS[style]}&stage=${stage}&growth=1&orbit=off`;
        setTimeout(check, 1000);
    });
}

async function captureTreeStylesFrom3d() {
    if (treeStyleCaptureRun) return;
    const modal = document.getElementById('tree-style-capture-modal');
    const frame = document.getElementById('tree-style-capture-frame');
    const progress = document.getElementById('tree-style-capture-progress');
    const button = document.getElementById('tree-style-capture');
    if (!modal || !frame || !progress) return;
    const run = { stopped: false };
    treeStyleCaptureRun = run;
    if (button) button.disabled = true;
    modal.classList.add('open');
    setTreeStyleStatus('Capturing…');
    const jobs = Object.keys(TREE_STYLE_LOOKS).flatMap(style => TREE_STYLE_STAGES.map(stage => ({ style, stage })));
    let saved = 0;
    try {
        for (const [index, { style, stage }] of jobs.entries()) {
            progress.textContent = `${TREE_STYLE_NAMES[style]}, stage ${stage} (${index + 1} of ${jobs.length}): loading the 3D tree…`;
            const page = await openTreeCapturePage(frame, style, stage, run);
            progress.textContent = `${TREE_STYLE_NAMES[style]}, stage ${stage} (${index + 1} of ${jobs.length}): saving the picture…`;
            const capture = await page.tree2dCapture();
            const response = await fetch('/api/admin/parameters/tree-style-capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ style, stage, ...capture })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.error || `The picture could not be saved (HTTP ${response.status}).`);
            saved += 1;
        }
        setTreeStyleStatus(`Captured all ${saved} pictures, ${new Date().toLocaleString()}.`);
        showNotification('The 2D tree pictures were captured from the 3D tree.', 'success');
    } catch (error) {
        const message = run.stopped ? `Stopped after ${saved} of ${jobs.length} pictures.` : (error.message || 'The capture failed.');
        setTreeStyleStatus(message, !run.stopped);
        if (!run.stopped) showNotification(message, 'error');
    } finally {
        frame.removeAttribute('src');
        frame.src = 'about:blank';
        modal.classList.remove('open');
        if (button) button.disabled = false;
        treeStyleCaptureRun = null;
        loadTreeStylePreviews();
    }
}

function cancelTreeStyleCapture() {
    if (treeStyleCaptureRun) treeStyleCaptureRun.stopped = true;
}

// The previews show from the start (the saved style is set again when the settings load, js/parameters.js).
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => loadTreeStylePreviews());
else loadTreeStylePreviews();

let treeStageModeInitialized = false;
function initTreeStageMode() {
    const radioAuto = document.querySelector('input[value="auto"]');
    const radioManual = document.querySelector('input[value="manual"]');
    const manualSelect = document.getElementById('param-treeStage');
    const manualContainer = document.getElementById('manualStageContainer');
    if (treeStageModeInitialized || !radioAuto || !radioManual || !manualSelect || !manualContainer) return;
    treeStageModeInitialized = true;

    function updateMode() {
        const isAuto = radioAuto.checked;
        if (isAuto) {
            manualSelect.disabled = true;
            manualContainer.style.opacity = '0.6';
            // Automatically recompute stage from leaf count and thresholds
            updateAutoStagePreview();
        } else {
            manualSelect.disabled = false;
            manualContainer.style.opacity = '1';
        }
    }

    radioAuto.addEventListener('change', updateMode);
    radioManual.addEventListener('change', updateMode);
    updateMode();
}

async function updateAutoStagePreview() {
    const leafCountSpan = document.getElementById('currentLeafCount');
    const autoStageSpan = document.getElementById('autoStagePreview');
    if (!leafCountSpan || !autoStageSpan) return;

    const leafCount = await getCurrentLeafCount();
    leafCountSpan.textContent = leafCount;

    const thresholds = {
        stage1: parseInt(document.getElementById('threshold-stage1').value) || 0,
        stage2: parseInt(document.getElementById('threshold-stage2').value) || 0,
        stage3: parseInt(document.getElementById('threshold-stage3').value) || 0,
        stage4: parseInt(document.getElementById('threshold-stage4').value) || 0
    };
    const stage = getStageFromLeafCount(leafCount, thresholds);
    autoStageSpan.textContent = stage;

    // If in auto mode, also update the manual dropdown selection (for consistency)
    const isAuto = document.querySelector('input[name="stageMode"]:checked')?.value === 'auto';
    if (isAuto) {
        document.getElementById('param-treeStage').value = stage;
    }
}

// Add event listeners to threshold inputs
document.getElementById('threshold-stage1')?.addEventListener('input', updateAutoStagePreview);
document.getElementById('threshold-stage2')?.addEventListener('input', updateAutoStagePreview);
document.getElementById('threshold-stage3')?.addEventListener('input', updateAutoStagePreview);
document.getElementById('threshold-stage4')?.addEventListener('input', updateAutoStagePreview);



// Save tree parameters (stage, title box, leaf scale) - Done by Yu Kang
/*async function saveTreeParameters() {
    // Helper to show status messages (uses your existing setParameterStatus if available,
    // otherwise a fallback)
    const setStatus = (msg, type) => {
        if (typeof setParameterStatus === 'function') {
            setParameterStatus(msg, type);
        } else {
            console.log(`[${type}] ${msg}`);
            const statusEl = document.getElementById('tree-stage-status');
            if (statusEl) statusEl.textContent = msg;
        }
    };

    try {
        setStatus('Saving tree parameters...', 'info');

        // 1. Collect values from the UI
        const treeStageSelect = document.getElementById('param-treeStage');
        const showTitleBoxCheck = document.getElementById('param-showTitleBox');
        const leafScaleSlider = document.getElementById('param-leafDisplayScale');

        if (!treeStageSelect || !showTitleBoxCheck || !leafScaleSlider) {
            throw new Error('Required form elements not found on the page.');
        }

        const treeStage = Math.max(0, Math.min(4, Number(treeStageSelect.value) || 0));
        const showTitleBox = showTitleBoxCheck.checked;
        const leafDisplayScale = parseFloat(leafScaleSlider.value) || 1.0;
        const vipLeafScaleSlider = document.getElementById('param-vipLeafDisplayScale');
        const vipLeafDisplayScale = vipLeafScaleSlider ? parseFloat(vipLeafScaleSlider.value) || 1.0 : leafDisplayScale;

        // 2. Build payload (adjust field names to match your backend expectations)
        const payload = {
            treeStage: treeStage,
            showTitleBox: showTitleBox,
            leafDisplayScale: leafDisplayScale,
            vipLeafDisplayScale: vipLeafDisplayScale
        };

        // 3. Send to backend – use the same endpoint as saveTreeStageSelection
        //    but now with extra fields. Your backend should handle the extended payload.
        const response = await fetch('/api/admin/parameters/treeParameters', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to save tree parameters');
        }

        // 4. Update UI feedback
        setStatus('Tree parameters saved successfully.', 'success');
        showNotification('Tree display and leaf settings saved.', 'success');

        // 5. Optionally refresh any live preview on the page
        //    (e.g., update leaf scale preview if it wasn't already using live input)
        const previewBox = document.getElementById('previewLeafBox');
        if (previewBox) {
            previewBox.style.transform = `scale(${leafDisplayScale})`;
        }
        const vipPreviewBox = document.getElementById('previewVipLeafBox');
        if (vipPreviewBox) {
            vipPreviewBox.style.transform = `scale(${vipLeafDisplayScale})`;
        }

    } catch (error) {
        console.error('Error saving tree parameters:', error);
        setStatus(error.message || 'Failed to save tree parameters.', 'error');
        showNotification(error.message || 'Failed to save tree parameters.', 'error');
    }
}*/

// Switch between tree management tabs
function switchTreeTab(tabId) {

    // Hide all contents
    document.querySelectorAll('.tree-tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Remove active from buttons
    document.querySelectorAll('.tree-tab').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabId).classList.add('active');

    // Activate clicked button
    event.currentTarget.classList.add('active');
}


async function loadTreeStageSelection() {
    const stageSelect = document.getElementById('param-treeStage');
    const stageStatus = document.getElementById('tree-stage-status');
    if (!stageSelect) return;

    try {
        const response = await fetch('/api/admin/parameters/treeParameters', {
            credentials: 'include'
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to load tree stage');
        }

        const treeParameters = data.parameters || {};
        const rawStage = Number(treeParameters.treeStage);
        const normalizedStage = Number.isInteger(rawStage) ? Math.max(0, Math.min(4, rawStage)) : 0;
        stageSelect.value = String(normalizedStage);
        const savedThresholds = treeParameters.leafThresholds || {};
        ['stage1', 'stage2', 'stage3', 'stage4'].forEach(key => {
            const input = document.getElementById('threshold-' + key);
            if (input && savedThresholds[key] !== undefined && savedThresholds[key] !== null) input.value = savedThresholds[key];
        });
        // The saved Auto/Manual choice (Auto: the tree grows by itself with the leaf count).
        const savedMode = treeParameters.treeStageMode === 'auto' ? 'auto' : 'manual';
        const modeRadio = document.querySelector(`input[name="stageMode"][value="${savedMode}"]`);
        if (modeRadio && !modeRadio.checked) {
            modeRadio.checked = true;
            modeRadio.dispatchEvent(new Event('change'));
        }
        if (stageStatus) {
            stageStatus.textContent = savedMode === 'auto'
                ? 'Auto: the tree grows by itself as leaves are added.'
                : `Current: stage ${normalizedStage}. Shown on /tree after apply.`;
        }
    } catch (error) {
        console.error('Error loading tree stage selection:', error);
        stageSelect.value = '0';
        if (stageStatus) {
            stageStatus.textContent = 'Unable to load saved stage. Using stage 0.';
        }
    }
}

async function saveTreeStageSelection() {
    const stageSelect = document.getElementById('param-treeStage');
    const stageStatus = document.getElementById('tree-stage-status');
    if (!stageSelect) return;

    const selectedStage = Math.max(0, Math.min(4, Number(stageSelect.value) || 0));

    try {
        if (stageStatus) {
            stageStatus.textContent = `Applying stage ${selectedStage}...`;
        }
        const response = await fetch('/api/admin/parameters/treeParameters', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ treeStage: selectedStage })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to save tree stage');
        }

        if (stageStatus) {
            stageStatus.textContent = `Saved: stage ${selectedStage}. /tree now uses this stage.`;
        }
        showNotification(`Tree stage updated to stage ${selectedStage}.`, 'success');
    } catch (error) {
        console.error('Error saving tree stage selection:', error);
        if (stageStatus) {
            stageStatus.textContent = 'Failed to apply stage. Please try again.';
        }
        showNotification(error.message || 'Failed to save tree stage.', 'error');
    }
}


// The 2D tree's own background when none is chosen (frontend/tree/tree.css body background).
const DEFAULT_TREE_BACKGROUND = '/assets/Tree/background/2dTreeBackground.jpeg';

async function loadAvailableTreeBackgrounds() {
    try {
        const response = await fetch('/api/admin/parameters/tree-background/list', {
            credentials: 'include'
        });
        const data = await response.json();

        console.log('🎨 Tree backgrounds API response:', { response: { ok: response.ok, status: response.status }, data });

        const picker = document.getElementById('param-treeBackgroundList');
        const preview = document.getElementById('treeBackgroundPreview');
        const status = document.getElementById('tree-background-status');
        if (!picker) return;

        picker.innerHTML = '';
        window.selectedTreeBackground = '';

        if (!response.ok || !data.success) {
            const errorMsg = data.error || 'Failed to load tree backgrounds';
            console.error('❌ Tree backgrounds load failed:', errorMsg);
            throw new Error(errorMsg);
        }

        // With no background chosen, the 2D tree shows its default (DEFAULT_TREE_BACKGROUND, from tree.css):
        // the preview shows it and its tile is marked, so the admin sees what the tree shows.
        const currentTreeBackground = data.currentTreeBackground || '';
        const shownTreeBackground = currentTreeBackground || DEFAULT_TREE_BACKGROUND;
        if (preview) {
            preview.style.backgroundImage = `url('${shownTreeBackground}')`;
        }

        const backgrounds = Array.isArray(data.backgroundImages) ? data.backgroundImages : [];
        console.log(`📂 Available tree backgrounds: ${backgrounds.length} images found`);
        
        if (backgrounds.length === 0) {
            picker.innerHTML = '<div style="grid-column:1 / -1;padding:16px;text-align:center;color:#64748b;">No background images found in /assets/Tree/background. Please add .png, .jpg, or .webp files to that directory.</div>';
            if (status) {
                status.textContent = 'No selectable tree backgrounds found. Add images to /assets/Tree/background/';
            }
            return;
        }

        backgrounds.forEach((background) => {
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.dataset.backgroundFilename = background.filename;
            tile.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px;border:1px solid #d7dbe3;border-radius:8px;background:#f8fafc;cursor:pointer;transition:all 0.15s ease;text-align:center;';

            const thumb = document.createElement('div');
            thumb.style.cssText = `width:100%;height:84px;border-radius:6px;background:url('${background.path}') center/cover no-repeat;border:1px solid #e2e8f0;`;

            const label = document.createElement('span');
            const isDefaultBackground = DEFAULT_TREE_BACKGROUND.endsWith('/' + background.filename);
            label.textContent = isDefaultBackground ? `${background.name} (default)` : background.name;
            label.style.cssText = 'font-size:12px;color:#1f2937;word-break:break-word;';

            tile.appendChild(thumb);
            tile.appendChild(label);

            tile.onclick = () => {
                picker.querySelectorAll('[data-selected="true"]').forEach((el) => {
                    el.dataset.selected = 'false';
                    el.style.borderColor = '#d7dbe3';
                    el.style.background = '#f8fafc';
                    el.style.boxShadow = 'none';
                });

                tile.dataset.selected = 'true';
                tile.style.borderColor = '#2563eb';
                tile.style.background = '#eff6ff';
                tile.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
                window.selectedTreeBackground = background.filename;

                if (preview) {
                    preview.style.backgroundImage = `url('${background.path}')`;
                }
                if (status) {
                    status.textContent = `Selected: ${background.name}. Click Apply Background to save.`;
                }
                console.log('🎯 Selected background:', background.filename);
            };

            if (shownTreeBackground.endsWith('/' + background.filename)) {
                tile.dataset.selected = 'true';
                tile.style.borderColor = '#2563eb';
                tile.style.background = '#eff6ff';
                tile.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
                window.selectedTreeBackground = background.filename;
                if (status) {
                    status.textContent = currentTreeBackground
                        ? `Current: ${background.name}.`
                        : `Current: ${background.name}, the default background.`;
                }
            }

            picker.appendChild(tile);
        });
    } catch (error) {
        console.error('❌ Error loading available tree backgrounds:', error);
        const status = document.getElementById('tree-background-status');
        if (status) {
            status.textContent = `Error: ${error.message || 'Failed to load tree backgrounds.'}`;
        }
    }
}

async function selectTreeBackground() {
    const selectedBackground = window.selectedTreeBackground;
    const status = document.getElementById('tree-background-status');

    if (!selectedBackground) {
        if (status) {
            status.textContent = 'Choose a background tile first.';
        }
        showNotification('Choose a tree background before applying.', 'error');
        console.warn('⚠️  No background selected');
        return;
    }

    try {
        if (status) {
            status.textContent = `Applying ${selectedBackground}...`;
        }
        console.log('🎨 Applying tree background:', selectedBackground);

        const response = await fetch('/api/admin/parameters/tree-background/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ treeBackground: selectedBackground })
        });

        const data = await response.json();
        console.log('📡 Tree background response:', { ok: response.ok, status: response.status, data });

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to apply tree background');
        }

        const applied = data.assetPath || '';
        const preview = document.getElementById('treeBackgroundPreview');
        if (preview && applied) {
            preview.style.backgroundImage = `url('${applied}')`;
        }
        if (status) {
            status.textContent = `✅ Applied: ${selectedBackground}. /tree now uses this background.`;
        }

        console.log('✅ Tree background applied successfully:', applied);
        showNotification('Tree background updated successfully.', 'success');
    } catch (error) {
        console.error('❌ Error applying tree background:', error);
        if (status) {
            status.textContent = `Error: ${error.message || 'Failed to apply tree background.'}`;
        }
        showNotification(error.message || 'Failed to apply tree background.', 'error');
    }
}

async function uploadTreeBackground() {
    const fileInput = document.getElementById('param-treeBackgroundUpload');
    const file = fileInput?.files?.[0];
    const status = document.getElementById('tree-background-status');
    
    if (!file) {
        if (status) status.textContent = 'Choose a background image first.';
        showNotification('Choose a background image first.', 'error');
        return;
    }

    try {
        if (status) status.textContent = 'Uploading background image...';
        const formData = new FormData();
        formData.append('background', file);

        const response = await fetch('/api/admin/parameters/tree-background/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to upload background image');
        }

        if (fileInput) fileInput.value = '';
        if (status) status.textContent = '✅ Background uploaded and applied.';
        showNotification('Tree background uploaded and applied successfully.', 'success');

        // Update the manual path field input under Visual Assets settings if it exists
        const manualInput = document.getElementById('param-treeBackground');
        if (manualInput && data.assetPath) {
            setInputValue('param-treeBackground', data.assetPath);
        }

        // Reload the backgrounds list to reflect the new background
        await loadAvailableTreeBackgrounds();
    } catch (error) {
        console.error('Error uploading tree background:', error);
        if (status) status.textContent = `Error: ${error.message || 'Failed to upload background image.'}`;
        showNotification(error.message || 'Failed to upload background image.', 'error');
    }
}

// <Jun Kai start> Tree Leaves (admin redesign, Digital Tree B). /api/tree answers one row per leaf, so a visitor who came
// twice has two rows. The search and the pages work on that answer in the browser; the numbers on the left come
// from it too. Newest leaves first.
let treeVisitorRows = [];
let treeVisitorPage = 1;
let treeLeavesReady = false;
let treeScrollToVips = false;
const TREE_VISITORS_PER_PAGE = 10;
const TREE_AVATAR_HUES = [262, 172, 330, 28, 245, 152, 18, 218];

function prepareTreeLeavesPage() {
    if (treeLeavesReady) return;
    treeLeavesReady = true;
    document.querySelectorAll('#digital-tree-page [data-fb-icon]').forEach((slot) => {
        slot.innerHTML = uiIcon(slot.dataset.fbIcon, slot.closest('button, a') ? 15 : 16);
    });
    const tbody = document.querySelector('#digital-tree-page table tbody');
    if (tbody) tbody.addEventListener('click', treeListClick);
}

// Make VIP on a row: the name exactly as the tree has it (vips.js makeVip)
function treeListClick(event) {
    const button = event.target.closest('[data-make-vip]');
    const row = button && treeVisitorRows[Number(button.dataset.makeVip)];
    if (row && typeof makeVip === 'function') makeVip(String(row.name || '').trim(), button);
}

function showTreeVipCard() {
    const card = document.getElementById('dt-vip-card');
    if (!card) return;
    const admin = typeof canManageVips === 'function' && canManageVips();
    card.hidden = !admin;
    if (admin) loadVipData();
}

// the VIPs link and old showPage('vip') calls: once the list has its rows the card is scrolled into view again,
// because on a narrow screen the list above it grows
function scrollTreeLeavesToVips() {
    const card = document.getElementById('dt-vip-card');
    if (!card || card.hidden) return;
    treeScrollToVips = true;
    card.scrollIntoView({ block: 'start' });
}

// a VIP was added or removed: the rows with that name change at once, without loading the tree again
function markTreeVip(name, isVip) {
    const target = String(name || '').trim().toLowerCase();
    treeVisitorRows.forEach((row) => {
        if (row.hasPublicName && !row.archived && String(row.name || '').trim().toLowerCase() === target) row.isVip = isVip;
    });
    const golden = document.getElementById('dt-vip-leaves');
    if (golden) golden.textContent = treeVisitorRows.filter((row) => row.isVip).length;
    if (!isVip) setTreeLeavesStatus('', ''); // a "now a VIP" line would be wrong after a removal
    renderTreeVisitors();
}

function setTreeLeavesStatus(tone, message) {
    const el = document.getElementById('dt-status');
    if (el) el.innerHTML = message ? uiPill(tone, message) : '';
}

function treeInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function treeLeafDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function treeVisitorRowHtml(row, index) {
    const name = String(row.name || 'Anonymous visitor');
    const named = Boolean(row.hasPublicName) && !row.archived;
    const hue = TREE_AVATAR_HUES[Math.abs(Number(row.id) || 0) % TREE_AVATAR_HUES.length];
    let tag = '';
    if (row.isVip) tag = '<span class="ui-tag is-amber">VIP</span>';
    else if (row.archived) tag = '<span class="ui-tag">Archived</span>';
    else if (!named) tag = '<span class="ui-tag">Name hidden</span>';
    else if (typeof canManageVips === 'function' && canManageVips()) tag = `<button type="button" class="ui-link" data-make-vip="${index}">Make VIP</button>`;
    const avatar = named
        ? `<span class="ui-avatar" style="--ui-hue: ${hue}" aria-hidden="true">${escapeHtmlSafe(treeInitials(name))}</span>`
        : '<span class="ui-avatar dt-avatar-none" aria-hidden="true">?</span>';
    return `<tr><td><span class="ui-who">${avatar}<span class="ui-who-text"><b title="${escapeHtmlSafe(name)}">${escapeHtmlSafe(name)}</b></span></span></td>`
        + `<td class="dt-num">${Number(row.visit_count) || 1}</td><td>${escapeHtmlSafe(treeLeafDate(row.created_at))}</td><td class="dt-tag-col">${tag}</td></tr>`;
}

function renderTreeVisitors() {
    const tbody = document.querySelector('#digital-tree-page table tbody');
    if (!tbody) return;
    const query = (document.getElementById('dt-search')?.value || '').trim().toLowerCase();
    const list = treeVisitorRows.map((row, index) => ({ row, index })).filter(({ row }) => !query || String(row.name || '').toLowerCase().includes(query));
    const pages = Math.max(1, Math.ceil(list.length / TREE_VISITORS_PER_PAGE));
    treeVisitorPage = Math.min(Math.max(1, treeVisitorPage), pages);
    const first = (treeVisitorPage - 1) * TREE_VISITORS_PER_PAGE;
    const shown = list.slice(first, first + TREE_VISITORS_PER_PAGE);

    if (shown.length) {
        tbody.innerHTML = shown.map(({ row, index }) => treeVisitorRowHtml(row, index)).join('');
    } else {
        const year = new Date().getFullYear();
        const text = treeVisitorRows.length ? 'No visitor matches the search.' : `No visitors on the ${year} tree yet.`;
        tbody.innerHTML = `<tr><td colspan="4" class="ui-empty dt-empty">${text}</td></tr>`;
    }
    const info = document.getElementById('dt-page-info');
    if (info) info.textContent = list.length ? `Showing ${first + 1} to ${first + shown.length} of ${list.length}` : 'No visitors';
    const prev = document.getElementById('dt-prev');
    const next = document.getElementById('dt-next');
    if (prev) prev.disabled = treeVisitorPage <= 1;
    if (next) next.disabled = treeVisitorPage >= pages;
}

function filterTreeVisitors() {
    treeVisitorPage = 1;
    renderTreeVisitors();
}

function changeTreeVisitorPage(step) {
    treeVisitorPage += step;
    renderTreeVisitors();
}

// Update the digital tree table (the list and the numbers beside it)
function updateDigitalTreeTable(treeData) {
    prepareTreeLeavesPage();
    const rows = Array.isArray(treeData) ? treeData : [];
    const yearSpan = document.getElementById('current-year');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
    const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    setCount('tree-count', rows.length);
    setCount('dt-vip-leaves', rows.filter((row) => row.isVip).length);
    setCount('dt-hidden-names', rows.filter((row) => !row.hasPublicName && !row.archived).length);

    treeVisitorRows = rows.slice().sort((a, b) => (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0));
    treeVisitorPage = 1;
    renderTreeVisitors();
    if (treeScrollToVips) {
        treeScrollToVips = false;
        const card = document.getElementById('dt-vip-card');
        if (card && !card.hidden) card.scrollIntoView({ block: 'start' });
    }
}

// The small copy of the tree screen: the real /tree (or /3dtree in 3D mode) page in a frame, drawn at 1600 x 900 and
// scaled down to the card. It can only be looked at (no clicks), and it is emptied when another page opens, so a
// 3D tree does not keep running in the background.
const TREE_FRAME_WIDTH = 1600;
let treeFrameWatch = null;

function fitTreeFrame() {
    const screen = document.getElementById('dt-screen');
    const frame = document.getElementById('dt-tree-frame');
    if (screen && frame) frame.style.transform = `scale(${screen.clientWidth / TREE_FRAME_WIDTH})`;
}

function watchTreeFrame() {
    if (treeFrameWatch) return;
    const page = document.getElementById('digital-tree-page');
    const screen = document.getElementById('dt-screen');
    if (!page || !screen) return;
    treeFrameWatch = new MutationObserver(() => {
        if (page.classList.contains('active')) return;
        const frame = document.getElementById('dt-tree-frame');
        if (frame && frame.getAttribute('src') !== 'about:blank') frame.setAttribute('src', 'about:blank');
        screen.dataset.state = 'idle';
    });
    treeFrameWatch.observe(page, { attributes: true, attributeFilter: ['class'] });
    if (typeof ResizeObserver === 'function') new ResizeObserver(fitTreeFrame).observe(screen);
    window.addEventListener('resize', fitTreeFrame);
}

async function loadTreePreview() {
    const frame = document.getElementById('dt-tree-frame');
    const screen = document.getElementById('dt-screen');
    const note = document.getElementById('dt-screen-note');
    if (!frame || !screen) return;
    watchTreeFrame();
    let mode = '2d';
    try {
        const response = await fetch('/api/admin/parameters/treeParameters', { credentials: 'include' });
        const data = await response.json();
        if (response.ok && data.success && String(data.parameters?.treeDisplayMode || '').toLowerCase() === '3d') mode = '3d';
    } catch (error) {
        console.warn('Tree display mode not read, showing the 2D tree:', error);
    }
    const address = mode === '3d' ? '/3dtree' : '/tree';
    const open = document.getElementById('dt-open-tree');
    if (open) open.setAttribute('href', address);
    const label = document.getElementById('dt-preview-mode');
    if (label) label.textContent = mode === '3d' ? 'A small copy of the 3D tree screen' : 'A small copy of the tree screen';
    if (!document.getElementById('digital-tree-page')?.classList.contains('active')) return;
    screen.dataset.state = 'loading';
    if (note) note.textContent = 'Loading the tree';
    frame.onload = () => {
        if (frame.getAttribute('src') === 'about:blank') return;
        screen.dataset.state = 'ready';
        fitTreeFrame();
    };
    frame.setAttribute('src', address);
    fitTreeFrame();
}
// <Jun Kai end>

// Leaf image management for digital tree parameters
async function uploadParameterLeaf() {
    const fileInput = document.getElementById('param-leafUpload');
    const file = fileInput?.files?.[0];
    if (!file) {
        setParameterStatus('Choose a leaf image first.', 'error');
        return;
    }

    try {
        setParameterStatus('Uploading leaf image...', 'info');
        const formData = new FormData();
        formData.append('leaf', file);

        const response = await fetch('/api/admin/parameters/leaf', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to upload leaf image');
        }

        // Update preview and parameter form
        populateParameterForm(data.parameters || {});
        if (fileInput) fileInput.value = '';
        setParameterStatus(data.message || 'Leaf image uploaded.', 'success');
    } catch (error) {
        console.error('Error uploading parameter leaf image:', error);
        setParameterStatus(error.message || 'Failed to upload leaf image.', 'error');
    }
}

async function uploadParameterVipLeaf() {
    const fileInput = document.getElementById('param-vipLeafUpload');
    const file = fileInput?.files?.[0];
    if (!file) {
        setParameterStatus('Choose a VIP leaf image first.', 'error');
        return;
    }

    try {
        setParameterStatus('Uploading VIP leaf image...', 'info');
        const formData = new FormData();
        formData.append('vipLeaf', file);

        const response = await fetch('/api/admin/parameters/vip-leaf', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to upload VIP leaf image');
        }

        populateParameterForm(data.parameters || {});
        if (fileInput) fileInput.value = '';
        setParameterStatus(data.message || 'VIP leaf image uploaded.', 'success');
    } catch (error) {
        console.error('Error uploading VIP leaf image:', error);
        setParameterStatus(error.message || 'Failed to upload VIP leaf image.', 'error');
    }
}

async function revertParameterLeaf() {
    try {
        setParameterStatus('Reverting to previous leaf image...', 'info');
        const response = await fetch('/api/admin/parameters/leaf/revert', {
            method: 'POST',
            credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to revert leaf image');
        }

        // Update preview and parameter form
        populateParameterForm(data.parameters || {});
        setParameterStatus(data.message || 'Leaf image reverted.', 'success');
    } catch (error) {
        console.error('Error reverting parameter leaf image:', error);
        setParameterStatus(error.message || 'Failed to revert leaf image.', 'error');
    }
}

async function revertParameterVipLeaf() {
    try {
        setParameterStatus('Reverting to previous VIP leaf image...', 'info');
        const response = await fetch('/api/admin/parameters/vip-leaf/revert', {
            method: 'POST',
            credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to revert VIP leaf image');
        }

        populateParameterForm(data.parameters || {});
        setParameterStatus(data.message || 'VIP leaf image reverted.', 'success');
    } catch (error) {
        console.error('Error reverting VIP leaf image:', error);
        setParameterStatus(error.message || 'Failed to revert VIP leaf image.', 'error');
    }
}

async function loadAvailableLeafImages(currentLeafImagePath = '') {
    try {
        console.log('📂 Loading available leaf images...');
        const response = await fetch('/api/admin/parameters/leaf/list', {
            credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('Failed to load leaf images:', data.error);
            return;
        }

        const picker = document.getElementById('param-existingLeafList');
        const previewBox = document.getElementById('previewLeafBox');
        if (!picker) return;

        picker.innerHTML = '';
        window.selectedLeafImage = '';

        // Add leaf images as thumbnail tiles
        if (data.leafImages && data.leafImages.length > 0) {
            console.log(`✅ Found ${data.leafImages.length} leaf images`);
            data.leafImages.forEach(leaf => {
                const tile = document.createElement('button');
                tile.type = 'button';
                tile.dataset.leafFilename = leaf.filename;
                tile.dataset.leafPath = leaf.path;
                tile.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px;border:1px solid #d7dbe3;border-radius:8px;background:#f8fafc;cursor:pointer;transition:all 0.15s ease;text-align:center;';

                const img = document.createElement('img');
                img.src = leaf.path;
                img.alt = leaf.name;
                img.style.cssText = 'width:64px;height:64px;object-fit:contain;display:block;';

                const label = document.createElement('span');
                label.textContent = leaf.name;
                label.style.cssText = 'font-size:12px;color:#1f2937;word-break:break-word;';

                tile.appendChild(img);
                tile.appendChild(label);

                tile.onclick = () => {
                    picker.querySelectorAll('[data-selected="true"]').forEach(el => {
                        el.dataset.selected = 'false';
                        el.style.borderColor = '#d7dbe3';
                        el.style.background = '#f8fafc';
                        el.style.boxShadow = 'none';
                    });
                    tile.dataset.selected = 'true';
                    tile.style.borderColor = '#2563eb';
                    tile.style.background = '#eff6ff';
                    tile.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
                    window.selectedLeafImage = leaf.filename;
                    if (previewBox) {
                        previewBox.style.backgroundImage = `url('${leaf.path}')`;
                    }
                };

                if (currentLeafImagePath && (currentLeafImagePath.endsWith('/' + leaf.filename) || currentLeafImagePath.endsWith(leaf.filename))) {
                    tile.dataset.selected = 'true';
                    tile.style.borderColor = '#2563eb';
                    tile.style.background = '#eff6ff';
                    tile.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
                    window.selectedLeafImage = leaf.filename;
                }

                picker.appendChild(tile);
            });
        } else {
            picker.innerHTML = '<div style="grid-column:1 / -1;padding:16px;text-align:center;color:#64748b;">No existing leaf images found.</div>';
        }
        hideRevertIfPictureGone('revert-leaf-btn', window.previousLeafImagePath, data.leafImages || []);
    } catch (error) {
        console.error('Error loading available leaf images:', error);
    }
}

// Revert goes back to the previous leaf picture: hidden when that picture has since been deleted from its folder
// (it is not in the list), as reverting to it would leave the 2D tree's leaves without a picture.
function hideRevertIfPictureGone(buttonId, previousPath, pictures) {
    const button = document.getElementById(buttonId);
    if (!button || !previousPath) return;
    const fileName = String(previousPath).split('/').pop();
    if (!pictures.some(picture => picture.filename === fileName)) button.style.display = 'none';
}

async function loadAvailableVipLeafImages(currentVipLeafImagePath = '') {
    try {
        console.log('📂 Loading available VIP leaf images...');
        const response = await fetch('/api/admin/parameters/vip-leaf/list', {
            credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('Failed to load VIP leaf images:', data.error);
            return;
        }

        const picker = document.getElementById('param-existingVipLeafList');
        const previewBox = document.getElementById('previewVipLeafBox');
        if (!picker) return;

        picker.innerHTML = '';
        window.selectedVipLeafImage = '';

        const renderVipLeafTiles = (vipLeafImages) => {
            if (!Array.isArray(vipLeafImages) || vipLeafImages.length === 0) {
                picker.innerHTML = '<div style="grid-column:1 / -1;padding:16px;text-align:center;color:#64748b;">No existing VIP leaf images found.</div>';
                return;
            }

            vipLeafImages.forEach(leaf => {
                const tile = document.createElement('button');
                tile.type = 'button';
                tile.dataset.leafFilename = leaf.filename;
                tile.dataset.leafPath = leaf.path;
                tile.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px;border:1px solid #d7dbe3;border-radius:8px;background:#f8fafc;cursor:pointer;transition:all 0.15s ease;text-align:center;';

                const img = document.createElement('img');
                img.src = leaf.path;
                img.alt = leaf.name;
                img.style.cssText = 'width:64px;height:64px;object-fit:contain;display:block;';

                const label = document.createElement('span');
                label.textContent = leaf.name;
                label.style.cssText = 'font-size:12px;color:#1f2937;word-break:break-word;';

                tile.appendChild(img);
                tile.appendChild(label);

                tile.onclick = () => {
                    picker.querySelectorAll('[data-selected="true"]').forEach(el => {
                        el.dataset.selected = 'false';
                        el.style.borderColor = '#d7dbe3';
                        el.style.background = '#f8fafc';
                        el.style.boxShadow = 'none';
                    });
                    tile.dataset.selected = 'true';
                    tile.style.borderColor = '#2563eb';
                    tile.style.background = '#eff6ff';
                    tile.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
                    window.selectedVipLeafImage = leaf.filename;
                    if (previewBox) {
                        previewBox.style.backgroundImage = `url('${leaf.path}')`;
                    }
                };

                if (currentVipLeafImagePath && (currentVipLeafImagePath.endsWith('/' + leaf.filename) || currentVipLeafImagePath.endsWith(leaf.filename))) {
                    tile.dataset.selected = 'true';
                    tile.style.borderColor = '#2563eb';
                    tile.style.background = '#eff6ff';
                    tile.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
                    window.selectedVipLeafImage = leaf.filename;
                }

                picker.appendChild(tile);
            });
        };

        if (data.vipLeafImages && data.vipLeafImages.length > 0) {
            renderVipLeafTiles(data.vipLeafImages);
        } else {
            renderVipLeafTiles([
                { filename: 'GoldLeftLeaf.png', path: '/assets/Tree/vip-leaf/GoldLeftLeaf.png', name: 'GoldLeftLeaf' },
                { filename: 'GoldRightLeaf.png', path: '/assets/Tree/vip-leaf/GoldRightLeaf.png', name: 'GoldRightLeaf' }
            ]);
        }
        hideRevertIfPictureGone('revert-vip-leaf-btn', window.previousVipLeafImagePath, data.vipLeafImages || []);
    } catch (error) {
        console.error('Error loading available VIP leaf images:', error);
    }
}

async function selectParameterLeaf() {
    const leafImage = window.selectedLeafImage;

    if (!leafImage) {
        setParameterStatus('Choose a leaf image tile to apply.', 'error');
        return;
    }

    try {
        setParameterStatus('Applying leaf image...', 'info');
        const response = await fetch('/api/admin/parameters/leaf/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ leafImage })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to apply leaf image');
        }

        // Update preview and parameter form
        populateParameterForm(data.parameters || {});
        setParameterStatus(data.message || 'Leaf image applied.', 'success');
    } catch (error) {
        console.error('Error selecting parameter leaf image:', error);
        setParameterStatus(error.message || 'Failed to apply leaf image.', 'error');
    }
}

async function selectParameterVipLeaf() {
    const vipLeafImage = window.selectedVipLeafImage;

    if (!vipLeafImage) {
        setParameterStatus('Choose a VIP leaf image tile to apply.', 'error');
        return;
    }

    try {
        setParameterStatus('Applying VIP leaf image...', 'info');
        const response = await fetch('/api/admin/parameters/vip-leaf/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ vipLeafImage })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to apply VIP leaf image');
        }

        populateParameterForm(data.parameters || {});
        setParameterStatus(data.message || 'VIP leaf image applied.', 'success');
    } catch (error) {
        console.error('Error selecting VIP leaf image:', error);
        setParameterStatus(error.message || 'Failed to apply VIP leaf image.', 'error');
    }
}

// Refresh tree data
async function refreshTreeData() {
    await loadParameters();
    await loadDigitalTreeData();

    // Reload existing leaf images from the latest saved config
    await loadAvailableLeafImages(window.currentLeafImagePath || '');
    await loadAvailableVipLeafImages(window.currentVipLeafImagePath || '');
}


// Default values for tree title box settings
const TITLE_DEFAULTS = {
    showTitleBox: true,
    titleText: '🌳 RP Xperience Centre Digital Tree',
    subtitleText: 'Growing with every visitor\'s contribution this year',
    opacity: 0.25,
    blur: 6,
    radius: 25,
    position: 'top-center',
    paddingX: 30,
    paddingY: 15
};

function resetTreeTitleSettings(autoSave = true) {
    // Reset all input fields to default values
    document.getElementById('param-showTitleBox').checked = TITLE_DEFAULTS.showTitleBox;
    document.getElementById('param-titleText').value = TITLE_DEFAULTS.titleText;
    document.getElementById('param-subtitleText').value = TITLE_DEFAULTS.subtitleText;
    document.getElementById('param-titleOpacity').value = TITLE_DEFAULTS.opacity;
    document.getElementById('param-titleOpacityValue').textContent = TITLE_DEFAULTS.opacity;
    document.getElementById('param-titleBlur').value = TITLE_DEFAULTS.blur;
    document.getElementById('param-titleBlurValue').textContent = TITLE_DEFAULTS.blur + 'px';
    document.getElementById('param-titleRadius').value = TITLE_DEFAULTS.radius;
    document.getElementById('param-titleRadiusValue').textContent = TITLE_DEFAULTS.radius + 'px';
    document.getElementById('param-titlePosition').value = TITLE_DEFAULTS.position;
    document.getElementById('param-titlePaddingX').value = TITLE_DEFAULTS.paddingX;
    document.getElementById('param-titlePaddingY').value = TITLE_DEFAULTS.paddingY;

    // The live preview updates automatically via oninput events.

    // Optionally save immediately to persist the defaults on the server
    if (autoSave) {
        saveTreeTitleSettings();  // calls the existing save function
        showNotification('Title box settings reset to defaults and saved.', 'success');
    } else {
        showNotification('Title box settings reset to defaults. Click Save to persist.', 'info');
    }
}

// Collect tree title settings from the form
function collectTreeTitleSettings() {
    return {
        showTitleBox: document.getElementById('param-showTitleBox').checked,
        titleText: document.getElementById('param-titleText').value,
        subtitleText: document.getElementById('param-subtitleText').value,
        opacity: parseFloat(document.getElementById('param-titleOpacity').value),
        blur: parseInt(document.getElementById('param-titleBlur').value),
        radius: parseInt(document.getElementById('param-titleRadius').value),
        position: document.getElementById('param-titlePosition').value,
        paddingX: parseInt(document.getElementById('param-titlePaddingX').value),
        paddingY: parseInt(document.getElementById('param-titlePaddingY').value)
    };
}

// Save tree title settings
async function saveTreeTitleSettings() {
    await saveTreeParameters();
}

// Load tree title settings from the backend and populate the form
async function loadTreeTitleSettings() {
    const response = await fetch('/api/parameters');
    const data = await response.json();
    const tree = data.parameters?.treeParameters || {};
    const settings = tree.treeTitleBox;
    // treeDisplayMode is saved on treeParameters itself; reading it from the title box reset the select to 2D
    const displayModeSelect = document.getElementById('param-treeDisplayMode');
    if (displayModeSelect) displayModeSelect.value = (tree.treeDisplayMode || settings?.treeDisplayMode) === '3d' ? '3d' : '2d';
    // Show the settings of the tree that is live (admin/js/tree3d.js).
    if (displayModeSelect && typeof showTreeSettingsForMode === 'function') showTreeSettingsForMode(displayModeSelect.value);
    if (settings) {
        document.getElementById('param-showTitleBox').checked = settings.showTitleBox ?? true;
        document.getElementById('param-titleText').value = settings.titleText || '🌳 RP Xperience Centre Digital Tree';
        document.getElementById('param-subtitleText').value = settings.subtitleText || 'Growing with every visitor\'s contribution this year';
        document.getElementById('param-titleOpacity').value = settings.opacity ?? 0.25;
        document.getElementById('param-titleOpacityValue').textContent = settings.opacity ?? 0.25;
        document.getElementById('param-titleBlur').value = settings.blur ?? 6;
        document.getElementById('param-titleBlurValue').textContent = (settings.blur ?? 6) + 'px';
        document.getElementById('param-titleRadius').value = settings.radius ?? 25;
        document.getElementById('param-titleRadiusValue').textContent = (settings.radius ?? 25) + 'px';
        document.getElementById('param-titlePosition').value = settings.position || 'top-center';
        document.getElementById('param-titlePaddingX').value = settings.paddingX ?? 30;
        document.getElementById('param-titlePaddingY').value = settings.paddingY ?? 15;
    }
}
// Call when DOM is ready
document.addEventListener('DOMContentLoaded', loadTreeTitleSettings);

