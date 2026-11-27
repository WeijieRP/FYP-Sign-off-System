// Owner: Role 2, Wei Jie.
// Unit tests for the 2D tree's picture style and the pictures captured from the 3D tree (checklist item 12).
// Run: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    TREE_STYLES,
    CAPTURE_LOOKS,
    normalizeTreeStyle,
    normalizeCaptureStage,
    cleanCaptureMeta,
    captureUrls,
    saveTreeCapture
} = require('../../backend/features/parameters/tree2dStyle');

const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64')}`;
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString('base64')}`;
const META = { width: 1920, height: 1080, canopy: { x: 230, y: 120, width: 1458, height: 585 }, coverage: 0.31234, treeFoot: { x: 951, y: 935 }, treeTop: { x: 951, y: 100 } };
const tempAssets = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tree2d-style-'));

test('the picture style is painted, natural or digital, painted otherwise', () => {
    assert.deepEqual([...TREE_STYLES], ['painted', 'natural', 'digital']);
    assert.equal(normalizeTreeStyle('Natural'), 'natural');
    assert.equal(normalizeTreeStyle(' digital '), 'digital');
    assert.equal(normalizeTreeStyle('watercolour'), 'painted');
    assert.equal(normalizeTreeStyle(undefined), 'painted');
});

test('each captured style comes from its own 3D look', () => {
    assert.deepEqual({ ...CAPTURE_LOOKS }, { natural: 'natural', digital: 'glow' });
});

test('a capture stage is a whole number from 0 to 4', () => {
    assert.equal(normalizeCaptureStage(0), 0);
    assert.equal(normalizeCaptureStage('4'), 4);
    assert.equal(normalizeCaptureStage(5), null);
    assert.equal(normalizeCaptureStage(1.5), null);
    assert.equal(normalizeCaptureStage('two'), null);
});

test('only the picture numbers are kept from the page description', () => {
    const meta = cleanCaptureMeta({ ...META, note: '<script>', canopy: { ...META.canopy, extra: 'x' } }, 'natural', 4, '2026-11-21T00:00:00.000Z');
    assert.deepEqual(meta, {
        style: 'natural', stage: 4, capturedAt: '2026-11-21T00:00:00.000Z', width: 1920, height: 1080,
        canopy: { x: 230, y: 120, width: 1458, height: 585 }, coverage: 0.3123, treeFoot: { x: 951, y: 935 }, treeTop: { x: 951, y: 100 }
    });
    assert.equal(cleanCaptureMeta({ ...META, canopy: null }, 'digital', 0, 'now').canopy, null); // the bare trunk has no canopy
    assert.throws(() => cleanCaptureMeta({ width: 0, height: 1080 }, 'natural', 1, 'now'), /size/);
});

test('a capture is saved as the picture, the canopy and its description', () => {
    const assets = tempAssets();
    try {
        const saved = saveTreeCapture(assets, { style: 'digital', stage: 2, scene: JPEG, canopy: PNG, meta: META }, new Date('2026-11-21T01:02:03Z'));
        const folder = path.join(assets, 'Tree', '2d-from-3d', 'digital');
        assert.deepEqual(fs.readdirSync(folder).sort(), ['stage2-canopy.png', 'stage2.jpg', 'stage2.json']);
        assert.equal(fs.readFileSync(path.join(folder, 'stage2.jpg'))[0], 0xff);
        const description = JSON.parse(fs.readFileSync(path.join(folder, 'stage2.json'), 'utf8'));
        assert.equal(description.capturedAt, '2026-11-21T01:02:03.000Z');
        assert.equal(description.stage, 2);
        assert.deepEqual(saved.urls, captureUrls('digital', 2));
        assert.equal(saved.urls.scene, '/assets/Tree/2d-from-3d/digital/stage2.jpg');
    } finally {
        fs.rmSync(assets, { recursive: true, force: true });
    }
});

test('a capture with a wrong style, stage or picture is refused and nothing is written', () => {
    const assets = tempAssets();
    try {
        const capture = { style: 'natural', stage: 1, scene: JPEG, canopy: PNG, meta: META };
        assert.throws(() => saveTreeCapture(assets, { ...capture, style: 'painted' }), /natural or digital/);
        assert.throws(() => saveTreeCapture(assets, { ...capture, style: '../../x' }), /natural or digital/);
        assert.throws(() => saveTreeCapture(assets, { ...capture, stage: 7 }), /0 to 4/);
        assert.throws(() => saveTreeCapture(assets, { ...capture, scene: PNG }), /JPEG/);
        assert.throws(() => saveTreeCapture(assets, { ...capture, canopy: JPEG }), /PNG/);
        assert.throws(() => saveTreeCapture(assets, { ...capture, scene: 'data:image/jpeg;base64,aGVsbG8=' }), /not a valid JPEG/);
        assert.equal(fs.existsSync(path.join(assets, 'Tree')), false);
    } finally {
        fs.rmSync(assets, { recursive: true, force: true });
    }
});
