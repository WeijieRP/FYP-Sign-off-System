// Owner: Role 2, Wei Jie.
// The 2D tree's picture style (checklist item 12), shared by the admin's 2D Tree Display panel and the 2D page.
// treeParameters.treeStyle is one of:
//   'painted' - the original painted stage pictures (assets/Tree/stage0.png to stage4.png), the default
//   'natural' - pictures captured from the 3D tree in its daylight look
//   'digital' - pictures captured from the 3D tree in its glowing look
// A captured style keeps, for each stage 0 to 4, in assets/Tree/2d-from-3d/<style>/:
//   stage<N>.jpg         - the 3D tree in its scene, 1920 x 1080 (the 2D page shows it full screen)
//   stage<N>-canopy.png  - opaque where the tree's foliage is: where the visitors' leaves may sit
//   stage<N>.json        - when it was captured, and the canopy's box and the tree's foot in the picture
// The pictures are made by the 3D page itself (frontend/3dTree/capture-2d.js), from the admin's "Capture from
// the 3D tree" (POST /api/admin/parameters/tree-style-capture) or scripts/tree/capture-2d-from-3d.js.

const fs = require('fs');
const path = require('path');

const TREE_STYLES = Object.freeze(['painted', 'natural', 'digital']);
const CAPTURED_STYLES = Object.freeze(['natural', 'digital']);
const CAPTURE_LOOKS = Object.freeze({ natural: 'natural', digital: 'glow' }); // the 3D page's ?look= for each style
const CAPTURE_FOLDER = '2d-from-3d';
const MAX_SCENE_BYTES = 8 * 1024 * 1024;
const MAX_CANOPY_BYTES = 6 * 1024 * 1024;
const PICTURE_TYPES = Object.freeze({
    jpeg: { prefix: 'data:image/jpeg;base64,', magic: Buffer.from([0xff, 0xd8, 0xff]) },
    png: { prefix: 'data:image/png;base64,', magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
});

function normalizeTreeStyle(style) {
    const value = String(style ?? '').trim().toLowerCase();
    return TREE_STYLES.includes(value) ? value : 'painted';
}

function normalizeCaptureStage(stage) {
    const value = Number(stage);
    return Number.isInteger(value) && value >= 0 && value <= 4 ? value : null;
}

// A data: URL of the given type ('jpeg' or 'png') as its bytes; throws a message for the admin if it is not one.
function decodePicture(dataUrl, type, maxBytes, label) {
    const { prefix, magic } = PICTURE_TYPES[type];
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) throw new Error(`${label} must be a ${type.toUpperCase()} picture`);
    const bytes = Buffer.from(dataUrl.slice(prefix.length), 'base64');
    if (bytes.length < magic.length || !bytes.subarray(0, magic.length).equals(magic)) throw new Error(`${label} is not a valid ${type.toUpperCase()} picture`);
    if (bytes.length > maxBytes) throw new Error(`${label} is too large`);
    return bytes;
}

const whole = (value, max) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(max, Math.max(-max, number)) : null;
};
const point = (value, max) => {
    const x = whole(value?.x, max), y = whole(value?.y, max);
    return x === null || y === null ? null : { x, y };
};
const box = (value, max) => {
    const x = whole(value?.x, max), y = whole(value?.y, max), width = whole(value?.width, max), height = whole(value?.height, max);
    return [x, y, width, height].some(n => n === null) || width <= 0 || height <= 0 ? null : { x, y, width, height };
};

// Only the numbers the 2D page uses are kept from the page's description of the picture.
function cleanCaptureMeta(meta, style, stage, capturedAt) {
    const width = whole(meta?.width, 10000), height = whole(meta?.height, 10000);
    if (!width || !height || width <= 0 || height <= 0) throw new Error('The picture size is missing');
    const coverage = Number(meta?.coverage);
    return {
        style,
        stage,
        capturedAt,
        width,
        height,
        canopy: box(meta?.canopy, 10000),
        coverage: Number.isFinite(coverage) ? Math.min(1, Math.max(0, Number(coverage.toFixed(4)))) : null,
        treeFoot: point(meta?.treeFoot, 10000),
        treeTop: point(meta?.treeTop, 10000),
    };
}

function captureFolder(assetsDir, style) {
    return path.join(assetsDir, 'Tree', CAPTURE_FOLDER, style);
}

function captureUrls(style, stage) {
    const base = `/assets/Tree/${CAPTURE_FOLDER}/${style}/stage${stage}`;
    return { scene: `${base}.jpg`, canopy: `${base}-canopy.png`, meta: `${base}.json` };
}

// Written beside the old file, then moved over it, so a 2D page never reads half a picture.
function writeWhole(file, contents) {
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, contents);
    fs.renameSync(temporary, file);
}

// Checks and saves one capture: { style: 'natural' | 'digital', stage: 0 to 4, scene: JPEG data URL,
// canopy: PNG data URL, meta }. Returns the saved description with the pictures' addresses.
function saveTreeCapture(assetsDir, capture, now = new Date()) {
    const style = String(capture?.style ?? '').trim().toLowerCase();
    if (!CAPTURED_STYLES.includes(style)) throw new Error('Style must be natural or digital');
    const stage = normalizeCaptureStage(capture?.stage);
    if (stage === null) throw new Error('Stage must be 0 to 4');
    const scene = decodePicture(capture?.scene, 'jpeg', MAX_SCENE_BYTES, 'The tree picture');
    const canopy = decodePicture(capture?.canopy, 'png', MAX_CANOPY_BYTES, 'The canopy picture');
    const meta = cleanCaptureMeta(capture?.meta, style, stage, now.toISOString());

    const folder = captureFolder(assetsDir, style);
    fs.mkdirSync(folder, { recursive: true });
    writeWhole(path.join(folder, `stage${stage}.jpg`), scene);
    writeWhole(path.join(folder, `stage${stage}-canopy.png`), canopy);
    writeWhole(path.join(folder, `stage${stage}.json`), `${JSON.stringify(meta, null, 2)}\n`);
    return { ...meta, urls: captureUrls(style, stage) };
}

module.exports = {
    TREE_STYLES,
    CAPTURED_STYLES,
    CAPTURE_LOOKS,
    normalizeTreeStyle,
    normalizeCaptureStage,
    cleanCaptureMeta,
    captureUrls,
    saveTreeCapture,
};
