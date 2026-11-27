// Owner: Role 2, Wei Jie.
// Unit tests for the tree screens' screen shape (backend/features/parameters/screenSize.js). Run: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const { SCREEN_PRESETS, normalizeScreenSize, safeScreenSize } = require('../../backend/features/parameters/screenSize');
const { normalizeTree3dParameters, DEFAULT_TREE3D_PARAMETERS } = require('../../backend/features/parameters/tree3d');

test('nothing chosen is Auto: the tree fits the screen', () => {
    assert.deepEqual(normalizeScreenSize(undefined), { preset: 'auto', width: null, height: null });
    assert.deepEqual(normalizeScreenSize({ preset: 'auto', width: 5, height: 5 }), { preset: 'auto', width: null, height: null });
});

test('a preset gets its own shape, whatever width and height come with it', () => {
    assert.deepEqual(normalizeScreenSize({ preset: 'led-wall-7x2' }), { preset: 'led-wall-7x2', width: 7, height: 2 });
    assert.deepEqual(normalizeScreenSize({ preset: 'upright-9x16', width: 1, height: 1 }), { preset: 'upright-9x16', width: 1080, height: 1920 });
    assert.ok(Object.keys(SCREEN_PRESETS).includes('custom'));
});

test('a custom width and height is kept, in any unit', () => {
    assert.deepEqual(normalizeScreenSize({ preset: 'custom', width: '7', height: '2' }), { preset: 'custom', width: 7, height: 2 });
    assert.deepEqual(normalizeScreenSize({ preset: 'custom', width: 3840, height: 1080.12345 }), { preset: 'custom', width: 3840, height: 1080.123 });
});

test('a custom size that cannot be a screen is refused with a message', () => {
    assert.throws(() => normalizeScreenSize({ preset: 'custom', width: 0, height: 2 }), /above 0/);
    assert.throws(() => normalizeScreenSize({ preset: 'custom', width: 'wide', height: 2 }), /above 0/);
    assert.throws(() => normalizeScreenSize({ preset: 'custom', width: -7, height: 2 }), /above 0/);
    assert.throws(() => normalizeScreenSize({ preset: 'custom', width: 11, height: 1 }), /10 times/);
    assert.throws(() => normalizeScreenSize({ preset: 'custom', width: 200000, height: 50000 }), /at most/);
    assert.throws(() => normalizeScreenSize({ preset: 'giant' }), /Unknown/);
    assert.throws(() => normalizeScreenSize('7x2'), /preset/);
});

test('a wrong value read back becomes Auto instead of an error', () => {
    assert.deepEqual(safeScreenSize({ preset: 'custom', width: 0, height: 0 }), { preset: 'auto', width: null, height: null });
});

test('the 3D tree has its own screen size, Auto by default, checked the same way', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.screenSize.preset, 'auto');
    assert.deepEqual(normalizeTree3dParameters({ screenSize: { preset: 'custom', width: 7, height: 2 } }).screenSize, { preset: 'custom', width: 7, height: 2 });
    assert.throws(() => normalizeTree3dParameters({ screenSize: { preset: 'custom', width: 1, height: 50 } }), /10 times/);
});
