// Owner: Role 2, Wei Jie.
// Unit tests for the 3D ESG Tree settings saved from the admin page. Run: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DEFAULT_TREE3D_PARAMETERS,
    normalizeTree3dParameters,
    mergeTree3dParameters
} = require('../../backend/features/parameters/tree3d');

test('a full save from the admin form is kept as sent', () => {
    const saved = normalizeTree3dParameters({
        weatherSource: 'manual', manualSky: 'night', manualRain: true, rainArea: 'Ang Mo Kio',
        riverLevelMode: 'high', autoOrbit: false, soundEnabled: true, soundVolume: 40,
        showSoilPanel: true, showWeatherPanel: false, showRiverPanel: true, showControlsBar: false, showYearReview: true,
        titleBox: { showTitleBox: true, titleText: 'ESG Tree', subtitleText: 'Our living tree', opacity: 0.3, blur: 10,
            radius: 12, position: 'top-left', paddingX: 20, paddingY: 10 }
    });
    assert.equal(saved.weatherSource, 'manual');
    assert.equal(saved.manualSky, 'night');
    assert.equal(saved.rainArea, 'Ang Mo Kio');
    assert.equal(saved.soundVolume, 40);
    assert.equal(saved.showWeatherPanel, false);
    assert.deepEqual(saved.titleBox, { showTitleBox: true, titleText: 'ESG Tree', subtitleText: 'Our living tree',
        opacity: 0.3, blur: 10, radius: 12, position: 'top-left', paddingX: 20, paddingY: 10 });
});

test('wrong values are refused with a readable message, out-of-range numbers are clamped', () => {
    assert.throws(() => normalizeTree3dParameters({ weatherSource: 'cloudy' }), { statusCode: 400, message: /Weather source/ });
    assert.throws(() => normalizeTree3dParameters({ manualSky: 'noon' }), { statusCode: 400 });
    assert.throws(() => normalizeTree3dParameters({ autoOrbit: 'yes' }), { statusCode: 400 });
    assert.throws(() => normalizeTree3dParameters({ titleBox: { position: 'middle' } }), { statusCode: 400 });
    assert.throws(() => normalizeTree3dParameters({ gustRequestedAt: 'not a time' }), { statusCode: 400 });
    assert.throws(() => normalizeTree3dParameters([]), { statusCode: 400 });
    assert.equal(normalizeTree3dParameters({ soundVolume: 250 }).soundVolume, 100);
    assert.equal(normalizeTree3dParameters({ titleBox: { opacity: -1 } }).titleBox.opacity, 0);
});

test('unknown settings are dropped and text is trimmed to a safe length', () => {
    const saved = normalizeTree3dParameters({ hacked: true, titleBox: { titleText: `  ${'x'.repeat(200)}  `, extra: 1 } });
    assert.equal('hacked' in saved, false);
    assert.equal('extra' in saved.titleBox, false);
    assert.equal(saved.titleBox.titleText.length, 80);
});

test('a partial save keeps the other stored settings, including the rest of the title box', () => {
    const stored = mergeTree3dParameters({ weatherSource: 'manual', titleBox: { titleText: 'Old title', blur: 9 } }, {});
    const merged = mergeTree3dParameters(stored, normalizeTree3dParameters({ titleBox: { titleText: 'New title' } }));
    assert.equal(merged.weatherSource, 'manual');
    assert.equal(merged.titleBox.titleText, 'New title');
    assert.equal(merged.titleBox.blur, 9);
    assert.equal(merged.titleBox.radius, DEFAULT_TREE3D_PARAMETERS.titleBox.radius);
});

test('an action time is stored as ISO time, and empty clears it', () => {
    assert.equal(normalizeTree3dParameters({ gustRequestedAt: '2026-11-13T10:00:00Z' }).gustRequestedAt, '2026-11-13T10:00:00.000Z');
    assert.equal(normalizeTree3dParameters({ sunsetRequestedAt: '' }).sunsetRequestedAt, '');
});
