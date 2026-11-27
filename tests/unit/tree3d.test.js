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
    assert.equal(saved.rainArea, 'Woodlands'); // the automatic weather is only ever at Woodlands
    assert.equal(saved.soundVolume, 40);
    assert.equal(saved.showWeatherPanel, false);
    assert.deepEqual(saved.titleBox, { showTitleBox: true, titleText: 'ESG Tree', subtitleText: 'Our living tree',
        opacity: 0.3, blur: 10, radius: 12, position: 'top-left', paddingX: 20, paddingY: 10 });
});

test('the automatic weather: at Woodlands only, whatever place is sent or was saved before', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.weatherSource, 'live');
    assert.equal(DEFAULT_TREE3D_PARAMETERS.rainArea, 'Woodlands');
    for (const place of ['all', 'Ang Mo Kio', 'Jurong West', 'woodlands', '', 'Johor Bahru']) {
        assert.equal(normalizeTree3dParameters({ rainArea: place }).rainArea, 'Woodlands', place);
    }
    assert.equal(mergeTree3dParameters({ rainArea: 'all' }, {}).rainArea, 'Woodlands');
    assert.equal(mergeTree3dParameters({ rainArea: 'Tampines' }, { manualSky: 'day' }).rainArea, 'Woodlands');
});

test('several pledge topics: one "Multiple pledges" leaf, brown by default, a colour the admin can change', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.badgeLeafColors['multi-pledge'], '#8b5a2b');
    const saved = normalizeTree3dParameters({ badgeLeafColors: { 'multi-pledge': '#123abc' } });
    assert.equal(saved.badgeLeafColors['multi-pledge'], '#123abc');
    assert.equal(mergeTree3dParameters({}, {}).badgeLeafColors['multi-pledge'], '#8b5a2b');
});

test('VIP leaf brightness: softer by default (70%), 30 to 120 percent', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.vipLeafBrightness, 70);
    assert.deepEqual(normalizeTree3dParameters({ vipLeafBrightness: 55.4 }), { vipLeafBrightness: 55 });
    assert.equal(normalizeTree3dParameters({ vipLeafBrightness: 5 }).vipLeafBrightness, 30);
    assert.equal(normalizeTree3dParameters({ vipLeafBrightness: 500 }).vipLeafBrightness, 120);
    assert.throws(() => normalizeTree3dParameters({ vipLeafBrightness: 'shiny' }), { statusCode: 400, message: /VIP leaf brightness/ });
});

test('long names scroll inside the leaf by default, and that can be turned off', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.leafNameScroll, true);
    assert.deepEqual(normalizeTree3dParameters({ leafNameScroll: false }), { leafNameScroll: false });
    assert.throws(() => normalizeTree3dParameters({ leafNameScroll: 'yes' }), { statusCode: 400, message: /Scroll long names/ });
});

test('the glowing look is on by default and can be turned off', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.glowLook, true);
    assert.equal(normalizeTree3dParameters({ glowLook: false }).glowLook, false);
    assert.equal(mergeTree3dParameters(DEFAULT_TREE3D_PARAMETERS, { glowLook: false }).glowLook, false);
    assert.throws(() => normalizeTree3dParameters({ glowLook: 'on' }), { statusCode: 400, message: /Glowing look/ });
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

test('3D leaf settings: colours and scale are checked; the leaf count is the 2D tree\'s', () => {
    const saved = normalizeTree3dParameters({ showFeedbackLeaves: false, leafNewColor: '#7CB342', leafOldColor: '#1f5f2e',
        leafNewHours: 12, leafScale: 1.5, maxLeaves: 20 });
    // maxLeaves is no longer a 3D setting: the 3D tree shows as many leaves as the 2D tree.
    assert.deepEqual(saved, { showFeedbackLeaves: false, leafNewColor: '#7cb342', leafOldColor: '#1f5f2e',
        leafNewHours: 12, leafScale: 1.5 });
    assert.throws(() => normalizeTree3dParameters({ leafNewColor: 'green' }), { statusCode: 400, message: /colour/ });
    // Greens only: light greens for new leaves, dark greens for older ones.
    assert.throws(() => normalizeTree3dParameters({ leafNewColor: '#e07b24' }), { statusCode: 400, message: /greens/ });
    assert.throws(() => normalizeTree3dParameters({ leafNewColor: '#1f5f2e' }), { statusCode: 400 });
    assert.throws(() => normalizeTree3dParameters({ leafOldColor: '#7cb342' }), { statusCode: 400 });
    assert.equal(normalizeTree3dParameters({ leafSide: 'LEFT' }).leafSide, 'left');
    assert.throws(() => normalizeTree3dParameters({ leafSide: 'up' }), { statusCode: 400 });
    assert.equal(DEFAULT_TREE3D_PARAMETERS.leafNewColor, '#7cb342');
    assert.equal(DEFAULT_TREE3D_PARAMETERS.leafSide, 'both');
    assert.throws(() => normalizeTree3dParameters({ leafOldColor: '#12345' }), { statusCode: 400 });
    assert.equal(normalizeTree3dParameters({ leafScale: 9 }).leafScale, 2.5);
    assert.equal('maxLeaves' in DEFAULT_TREE3D_PARAMETERS, false);
    assert.equal(normalizeTree3dParameters({ showLeafNames: false }).showLeafNames, false);
    assert.equal(DEFAULT_TREE3D_PARAMETERS.showLeafNames, true);
});

test('3D VIP leaf settings: golds only, a VIP scale and the gold glow', () => {
    assert.deepEqual(normalizeTree3dParameters({ vipLeafColor: '#FFD700', vipLeafScale: 1.4, vipGlow: false }),
        { vipLeafColor: '#ffd700', vipLeafScale: 1.4, vipGlow: false });
    assert.throws(() => normalizeTree3dParameters({ vipLeafColor: '#7cb342' }), { statusCode: 400, message: /VIP leaf colour/ });
    assert.equal(normalizeTree3dParameters({ vipLeafScale: 0.1 }).vipLeafScale, 0.4);
    assert.throws(() => normalizeTree3dParameters({ vipGlow: 'on' }), { statusCode: 400 });
    assert.equal(DEFAULT_TREE3D_PARAMETERS.vipLeafColor, '#d4af37');
});

test('3D VIP leaf tip star: on by default, and the admin can turn it off', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.vipSparkle, true);
    assert.deepEqual(normalizeTree3dParameters({ vipSparkle: false }), { vipSparkle: false });
    assert.deepEqual(normalizeTree3dParameters({ vipSparkle: true }), { vipSparkle: true });
    assert.throws(() => normalizeTree3dParameters({ vipSparkle: 'yes' }), { statusCode: 400, message: /VIP leaf tip star/ });
});

test('the trunk glow: on by default at 100%, can be turned off, strength 50 to 200', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.trunkGlow, true);
    assert.equal(DEFAULT_TREE3D_PARAMETERS.trunkGlowStrength, 100);
    assert.deepEqual(normalizeTree3dParameters({ trunkGlow: false, trunkGlowStrength: 152.6 }), { trunkGlow: false, trunkGlowStrength: 153 });
    assert.equal(normalizeTree3dParameters({ trunkGlowStrength: 20 }).trunkGlowStrength, 50);
    assert.equal(normalizeTree3dParameters({ trunkGlowStrength: 900 }).trunkGlowStrength, 200);
    assert.throws(() => normalizeTree3dParameters({ trunkGlow: 'bright' }), { statusCode: 400, message: /Trunk glow/ });
});

test('3D VIP leaf turning: on by default, and the admin can turn it off', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.vipTurn, true);
    assert.deepEqual(normalizeTree3dParameters({ vipTurn: false }), { vipTurn: false });
    assert.throws(() => normalizeTree3dParameters({ vipTurn: 'spin' }), { statusCode: 400, message: /VIP leaf turning/ });
});

test('the 3D Tree Visualization Parameters are kept within their ranges', () => {
    const saved = normalizeTree3dParameters({
        leafAreaWidth: 10, leafAreaHeight: 75.4, leafAreaOffset: -90, leafRefreshMs: 1000, leafOpacity: 0.456,
        leafAppearMs: 900, leafShowcaseSeconds: 12.34, leafFloatMs: 50000, leafFallMs: 4200, badgeColours: 'true'
    });
    assert.deepEqual(saved, {
        leafAreaWidth: 30, leafAreaHeight: 75, leafAreaOffset: -40, leafRefreshMs: 5000, leafOpacity: 0.46,
        leafAppearMs: 900, leafShowcaseSeconds: 12.3, leafFloatMs: 20000, leafFallMs: 4200, badgeColours: true
    });
    assert.throws(() => normalizeTree3dParameters({ leafFallMs: 'slow' }), /Leaf fall duration must be a number/);
});

test('badge leaf colours take any colour for the known badges and keep the rest', () => {
    const saved = normalizeTree3dParameters({ badgeLeafColors: { 'ocean-guardian': '#00AAFF', 'unknown-badge': '#123456' } });
    assert.deepEqual(saved.badgeLeafColors, { 'ocean-guardian': '#00aaff' });
    assert.throws(() => normalizeTree3dParameters({ badgeLeafColors: { 'ocean-guardian': 'blue' } }), /badge colour/);
    const merged = mergeTree3dParameters({ badgeLeafColors: { 'climate-champion': '#111111' } }, saved);
    assert.equal(merged.badgeLeafColors['ocean-guardian'], '#00aaff');
    assert.equal(merged.badgeLeafColors['climate-champion'], '#111111');
    assert.equal(merged.badgeLeafColors['feedback-completer'], DEFAULT_TREE3D_PARAMETERS.badgeLeafColors['feedback-completer']);
    assert.equal(merged.badgeColours, true, 'leaves are coloured by their badge by default');
    assert.equal(merged.leafShowcaseSeconds, 12);
});

test('the time a leaf stays light can be set in minutes', () => {
    assert.equal(normalizeTree3dParameters({ leafNewHours: 1 / 60 }).leafNewHours, 0.017);
    assert.equal(normalizeTree3dParameters({ leafNewHours: 0.5 }).leafNewHours, 0.5);
    assert.equal(normalizeTree3dParameters({ leafNewHours: 500 }).leafNewHours, 168);
});

test('the names on the 3D leaves: a font style, weight and colour, checked', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.leafNameFont, 'auto', "the look's own font by default");
    assert.equal(DEFAULT_TREE3D_PARAMETERS.leafNameWeight, 700);
    assert.equal(DEFAULT_TREE3D_PARAMETERS.leafNameColor, '#ffffff');
    assert.deepEqual(normalizeTree3dParameters({ leafNameFont: 'Classic-Serif', leafNameWeight: '500', leafNameColor: '#FFE08A' }),
        { leafNameFont: 'classic-serif', leafNameWeight: 500, leafNameColor: '#ffe08a' });
    assert.throws(() => normalizeTree3dParameters({ leafNameFont: 'comic' }), { statusCode: 400, message: /Name font style/ });
    assert.throws(() => normalizeTree3dParameters({ leafNameWeight: 650 }), { statusCode: 400, message: /weight/ });
    assert.throws(() => normalizeTree3dParameters({ leafNameColor: 'red' }), { statusCode: 400, message: /colour/ });
    const merged = mergeTree3dParameters({ leafNameColor: '#000000' }, normalizeTree3dParameters({ leafNameWeight: 400 }));
    assert.equal(merged.leafNameColor, '#000000', 'a weight change keeps the colour');
    assert.equal(merged.leafNameFont, 'auto');
    assert.equal(DEFAULT_TREE3D_PARAMETERS.leafNameSize, 1, 'the standard size');
    assert.equal(normalizeTree3dParameters({ leafNameSize: '1.234' }).leafNameSize, 1.23);
    assert.equal(normalizeTree3dParameters({ leafNameSize: 3 }).leafNameSize, 1.4, 'kept to what fits in the leaf');
    assert.equal(normalizeTree3dParameters({ leafNameSize: 0.2 }).leafNameSize, 0.7);
    assert.throws(() => normalizeTree3dParameters({ leafNameSize: 'big' }), { statusCode: 400, message: /size/ });
});

test('the automatic turn: one turn a day to the right by default; any time from 30 seconds to 24 hours', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.orbitSeconds, 86400);
    assert.equal(DEFAULT_TREE3D_PARAMETERS.orbitDirection, 'right');
    assert.deepEqual(normalizeTree3dParameters({ orbitSeconds: '300', orbitDirection: 'LEFT' }), { orbitSeconds: 300, orbitDirection: 'left' });
    assert.equal(normalizeTree3dParameters({ orbitSeconds: 5 }).orbitSeconds, 30, 'never faster than a turn in 30 seconds');
    assert.equal(normalizeTree3dParameters({ orbitSeconds: 999999 }).orbitSeconds, 86400);
    assert.equal(normalizeTree3dParameters({ orbitSeconds: 90.4 }).orbitSeconds, 90);
    assert.throws(() => normalizeTree3dParameters({ orbitSeconds: 'fast' }), { statusCode: 400, message: /full turn/ });
    assert.throws(() => normalizeTree3dParameters({ orbitDirection: 'up' }), { statusCode: 400, message: /Turn direction/ });
});

test('VIP names: written as the other names unless given their own style, with the same choices', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.vipNameOwnStyle, false);
    assert.deepEqual(
        [DEFAULT_TREE3D_PARAMETERS.vipNameFont, DEFAULT_TREE3D_PARAMETERS.vipNameWeight, DEFAULT_TREE3D_PARAMETERS.vipNameColor, DEFAULT_TREE3D_PARAMETERS.vipNameSize],
        ['auto', 700, '#ffffff', 1]);
    const saved = normalizeTree3dParameters({
        vipNameOwnStyle: true, vipNameFont: 'classic-serif', vipNameWeight: 800, vipNameColor: '#5A3A00', vipNameSize: 1.25
    });
    assert.deepEqual(saved, { vipNameOwnStyle: true, vipNameFont: 'classic-serif', vipNameWeight: 800, vipNameColor: '#5a3a00', vipNameSize: 1.25 });
    assert.equal(normalizeTree3dParameters({ vipNameSize: 3 }).vipNameSize, 1.4);
    assert.throws(() => normalizeTree3dParameters({ vipNameFont: 'comic' }), { statusCode: 400, message: /VIP name font style/ });
    assert.throws(() => normalizeTree3dParameters({ vipNameWeight: 900 }), { statusCode: 400, message: /VIP name font weight/ });
    assert.throws(() => normalizeTree3dParameters({ vipNameColor: 'gold' }), { statusCode: 400, message: /VIP name colour/ });
    assert.throws(() => normalizeTree3dParameters({ vipNameOwnStyle: 'yes' }), { statusCode: 400, message: /own style/ });
    // Saving the VIP names' style leaves the other names' as they were.
    const merged = mergeTree3dParameters({ leafNameColor: '#ffe082' }, saved);
    assert.equal(merged.leafNameColor, '#ffe082');
    assert.equal(merged.vipNameColor, '#5a3a00');
});

test('the background music: on by default at 45, and can be turned off or set from 0 to 100', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.musicEnabled, true);
    assert.equal(DEFAULT_TREE3D_PARAMETERS.musicVolume, 45);
    assert.deepEqual(normalizeTree3dParameters({ musicEnabled: false, musicVolume: 62.4 }), { musicEnabled: false, musicVolume: 62 });
    assert.equal(normalizeTree3dParameters({ musicVolume: 150 }).musicVolume, 100);
    assert.throws(() => normalizeTree3dParameters({ musicEnabled: 'loud' }), { statusCode: 400, message: /Background music/ });
    assert.throws(() => normalizeTree3dParameters({ musicVolume: 'high' }), { statusCode: 400, message: /Music volume/ });
});

test('the music style: Calm kalimba by default, one of the four built-in styles', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.musicStyle, 'kalimba');
    for (const style of ['kalimba', 'piano', 'dreamy', 'musicbox']) {
        assert.deepEqual(normalizeTree3dParameters({ musicStyle: style }), { musicStyle: style });
    }
    assert.throws(() => normalizeTree3dParameters({ musicStyle: 'rock' }), { statusCode: 400, message: /Music style/ });
});

test('my uploaded music: its own style, played from a file in assets/Tree/music, none by default', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.musicTrack, '');
    assert.deepEqual(normalizeTree3dParameters({ musicStyle: 'uploaded', musicTrack: '/assets/Tree/music/calm-forest-1764000000000.mp3' }),
        { musicStyle: 'uploaded', musicTrack: '/assets/Tree/music/calm-forest-1764000000000.mp3' });
    for (const extension of ['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.webm', '.flac']) {
        assert.equal(normalizeTree3dParameters({ musicTrack: `/assets/Tree/music/song${extension}` }).musicTrack, `/assets/Tree/music/song${extension}`);
    }
    assert.equal(normalizeTree3dParameters({ musicTrack: '' }).musicTrack, '');
    // Only an audio file in that folder: no other folder, no going up, no other kind of file.
    for (const bad of ['/assets/Tree/background/song.mp3', '/assets/Tree/music/../../../backend/server.js', '/assets/Tree/music/song.exe',
        '/assets/Tree/music/sub/song.mp3', 'https://example.com/song.mp3', '/assets/Tree/music/.mp3']) {
        assert.throws(() => normalizeTree3dParameters({ musicTrack: bad }), { statusCode: 400, message: /Uploaded music/ }, bad);
    }
    // Saving another style keeps the uploaded file chosen, for next time.
    const merged = mergeTree3dParameters({ musicStyle: 'uploaded', musicTrack: '/assets/Tree/music/song.mp3' }, normalizeTree3dParameters({ musicStyle: 'piano' }));
    assert.equal(merged.musicStyle, 'piano');
    assert.equal(merged.musicTrack, '/assets/Tree/music/song.mp3');
});

test('the ambient sounds: the river, birds and wind on, rain and insects off, each with its own volume', () => {
    const on = { ambientRiver: true, ambientBirds: true, ambientWind: true, ambientRain: false, ambientInsects: false };
    for (const [key, value] of Object.entries(on)) assert.equal(DEFAULT_TREE3D_PARAMETERS[key], value, key);
    assert.equal(DEFAULT_TREE3D_PARAMETERS.ambientRiverVolume, 100);
    assert.equal(DEFAULT_TREE3D_PARAMETERS.ambientInsectsVolume, 60);
    assert.deepEqual(normalizeTree3dParameters({ ambientRiver: false, ambientInsects: true, ambientInsectsVolume: 72.4 }),
        { ambientRiver: false, ambientInsects: true, ambientInsectsVolume: 72 });
    assert.equal(normalizeTree3dParameters({ ambientRainVolume: 140 }).ambientRainVolume, 100);
    assert.throws(() => normalizeTree3dParameters({ ambientBirds: 'yes' }), { statusCode: 400, message: /Birds/ });
    assert.throws(() => normalizeTree3dParameters({ ambientWindVolume: 'loud' }), { statusCode: 400, message: /Forest wind volume/ });
});

test('new leaves shown together: 3 by default, a whole number from 1 to 10', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.leafBatchSize, 3);
    assert.equal(normalizeTree3dParameters({ leafBatchSize: 5 }).leafBatchSize, 5);
    assert.equal(normalizeTree3dParameters({ leafBatchSize: 4.6 }).leafBatchSize, 5);
    assert.equal(normalizeTree3dParameters({ leafBatchSize: 0 }).leafBatchSize, 1);
    assert.equal(normalizeTree3dParameters({ leafBatchSize: 25 }).leafBatchSize, 10);
    assert.throws(() => normalizeTree3dParameters({ leafBatchSize: 'many' }), { statusCode: 400, message: /New leaves shown together/ });
});

test('new leaves arriving together: split into a number of groups (3 by default) or into groups of a number of leaves', () => {
    assert.equal(DEFAULT_TREE3D_PARAMETERS.leafBatchMode, 'groups');
    assert.equal(DEFAULT_TREE3D_PARAMETERS.leafBatchCount, 3);
    assert.deepEqual(normalizeTree3dParameters({ leafBatchMode: 'size', leafBatchCount: 2 }), { leafBatchMode: 'size', leafBatchCount: 2 });
    assert.equal(normalizeTree3dParameters({ leafBatchCount: 40 }).leafBatchCount, 10);
    assert.throws(() => normalizeTree3dParameters({ leafBatchMode: 'random' }), { statusCode: 400, message: /Split new leaves/ });
    assert.throws(() => normalizeTree3dParameters({ leafBatchCount: 'two' }), { statusCode: 400, message: /Number of groups/ });
});

test('saved views: up to 12 snapshots of a zoom, angle and height, and the one the screens use', () => {
    assert.deepEqual(DEFAULT_TREE3D_PARAMETERS.savedViews, []);
    assert.equal(DEFAULT_TREE3D_PARAMETERS.screenView, '');
    const saved = normalizeTree3dParameters({
        savedViews: [{ id: 'close-up', name: '  Close up  ', zoom: 1.8, azimuth: 7, polar: 1.3, savedAt: '2026-11-20T08:00:00Z' }],
        screenView: 'close-up'
    });
    assert.equal(saved.screenView, 'close-up');
    assert.equal(saved.savedViews[0].name, 'Close up');
    assert.equal(saved.savedViews[0].zoom, 1.8);
    assert.ok(Math.abs(saved.savedViews[0].azimuth - Math.atan2(Math.sin(7), Math.cos(7))) < 1e-3); // kept within -pi to pi
    assert.equal(normalizeTree3dParameters({ savedViews: [{ id: 'far-away', zoom: 9, azimuth: 0, polar: 3 }] }).savedViews[0].zoom, 2.5);
    assert.ok(normalizeTree3dParameters({ savedViews: [{ id: 'far-away', zoom: 0.1, azimuth: 0, polar: 0 }] }).savedViews[0].polar >= 1.04);
    assert.equal(normalizeTree3dParameters({ screenView: '' }).screenView, '');
    assert.throws(() => normalizeTree3dParameters({ savedViews: 'all' }), /list/);
    assert.throws(() => normalizeTree3dParameters({ savedViews: [{ id: '../x', zoom: 1, azimuth: 0, polar: 1.2 }] }), /id/);
    assert.throws(() => normalizeTree3dParameters({ savedViews: [{ id: 'aaaa', zoom: 1, azimuth: 0, polar: 1.2 }, { id: 'aaaa', zoom: 1, azimuth: 0, polar: 1.2 }] }), /own id/);
    assert.throws(() => normalizeTree3dParameters({ savedViews: Array.from({ length: 13 }, (_, i) => ({ id: `view-${i}`, zoom: 1, azimuth: 0, polar: 1.2 })) }), /Up to 12/);
    assert.throws(() => normalizeTree3dParameters({ screenView: 'bad id!' }), /saved view/);
});
