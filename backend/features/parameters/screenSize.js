// Owner: Role 2, Wei Jie.
// The shape of the screen a tree is shown on, set by the admin for each tree (2D: treeParameters.screenSize in
// 2D Tree Display; 3D: tree3dParameters.screenSize in 3D Scene Controls):
//   { preset, width, height }
//   preset 'auto'   - the tree fits whatever screen it is on (the browser window), the default
//   a named preset  - that shape, e.g. the ESG Centre's 7 m x 2 m LED wall
//   'custom'        - the admin's own width and height, in any unit (7 and 2 metres, or 3840 and 1080 pixels)
// Only the shape (width : height) matters: the tree page draws in that shape as large as the window allows,
// centred, black outside it (frontend/tree/tree.js applyScreenShape, frontend/3dTree/screen-shape.js). This is
// for a display that is fed a picture of another shape, as an LED wall's controller often is.

const SCREEN_PRESETS = Object.freeze({
    auto: { label: 'Auto: fit the screen', width: null, height: null },
    'led-wall-7x2': { label: 'ESG Centre LED wall, 7 m × 2 m (7:2)', width: 7, height: 2 },
    'hd-16x9': { label: 'Standard screen, 16:9 (1920 × 1080)', width: 1920, height: 1080 },
    'ultrawide-21x9': { label: 'Ultra-wide screen, 21:9', width: 21, height: 9 },
    'super-ultrawide-32x9': { label: 'Super ultra-wide screen, 32:9', width: 32, height: 9 },
    'classic-4x3': { label: 'Classic screen, 4:3', width: 4, height: 3 },
    'upright-9x16': { label: 'Upright screen, 9:16 (1080 × 1920)', width: 1080, height: 1920 },
    custom: { label: 'Custom width and height', width: null, height: null },
});
const DEFAULT_SCREEN_SIZE = Object.freeze({ preset: 'auto', width: null, height: null });
const MAX_SIDE = 100000;
const MAX_ASPECT = 10; // no thinner than 1:10 or 10:1

function screenSizeError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

// The admin's choice, checked: a preset gets its own width and height; a custom size needs both, positive,
// at most MAX_SIDE and no more than MAX_ASPECT times wider than tall or taller than wide. Throws a message for
// the admin otherwise.
function normalizeScreenSize(value) {
    if (value === undefined || value === null || value === '') return { ...DEFAULT_SCREEN_SIZE };
    if (typeof value !== 'object') throw screenSizeError('Screen size must be a preset or a width and height');
    const preset = String(value.preset ?? 'auto').trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(SCREEN_PRESETS, preset)) throw screenSizeError('Unknown screen size preset');
    if (preset === 'auto') return { ...DEFAULT_SCREEN_SIZE };
    if (preset !== 'custom') return { preset, width: SCREEN_PRESETS[preset].width, height: SCREEN_PRESETS[preset].height };
    const width = Number(value.width), height = Number(value.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw screenSizeError('Screen width and height must be numbers above 0');
    }
    if (width > MAX_SIDE || height > MAX_SIDE) throw screenSizeError(`Screen width and height must be at most ${MAX_SIDE}`);
    if (width / height > MAX_ASPECT || height / width > MAX_ASPECT) {
        throw screenSizeError(`The screen must be no more than ${MAX_ASPECT} times wider than tall, or taller than wide`);
    }
    const round = n => Math.round(n * 1000) / 1000;
    return { preset, width: round(width), height: round(height) };
}

// The same, but a wrong value becomes Auto instead of an error (for settings read back from the file).
function safeScreenSize(value) {
    try { return normalizeScreenSize(value); } catch { return { ...DEFAULT_SCREEN_SIZE }; }
}

module.exports = { SCREEN_PRESETS, DEFAULT_SCREEN_SIZE, normalizeScreenSize, safeScreenSize };
