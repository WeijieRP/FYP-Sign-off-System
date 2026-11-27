// Owner: Role 2, Wei Jie.
// Admin > Digital Tree Adjustment > 3D Tree Settings: the controls of the /3dTree page and its title box.
// Saves `tree3dParameters` through PUT /api/admin/parameters/tree3dParameters (checked by
// backend/features/parameters/tree3d.js); the 3D page reads them from /api/parameters every few seconds
// (frontend/3dTree/tree3d-settings.js). The defaults below match the 3D page with no settings saved.

const TREE3D_DEFAULTS = {
    glowLook: true,
    trunkGlow: true,          // the light streams on the trunk, branches and roots (glowing look)
    trunkGlowStrength: 100,   // how thick and bright, 50 to 200 percent
    weatherSource: 'live',
    manualSky: 'day',
    manualRain: false,
    rainArea: 'Woodlands',    // the automatic weather's one place (no other is offered)
    riverLevelMode: 'auto',
    autoOrbit: true,
    orbitSeconds: 86400, // one full turn a day
    orbitDirection: 'right',
    soundEnabled: false,
    soundVolume: 78,
    musicEnabled: true,
    musicVolume: 45,
    musicStyle: 'kalimba',
    musicTrack: '',           // the admin's uploaded music, for 'My uploaded music' (assets/Tree/music)
    // The ambient sounds: the river, birds and breeze on, a gentle rain and night insects off.
    ambientRiver: true, ambientRiverVolume: 100,
    ambientBirds: true, ambientBirdsVolume: 100,
    ambientWind: true, ambientWindVolume: 100,
    ambientRain: false, ambientRainVolume: 60,
    ambientInsects: false, ambientInsectsVolume: 60,
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
    leafNameScroll: true, // long names scroll inside the leaf (both trees)
    leafNewColor: '#7cb342',
    leafOldColor: '#1f5f2e',
    leafSide: 'both',
    leafNewHours: 24,
    leafScale: 1,
    // The names on the leaves: the look's own font, bold, white, standard size.
    leafNameFont: 'auto',
    leafNameWeight: 700,
    leafNameColor: '#ffffff',
    leafNameSize: 1
};

// The names' font styles (as frontend/3dTree/feedback-leaves.js NAME_FONTS, for the preview here); 'auto' is
// the look's own: the elegant script with the glowing look, the modern letters with the natural look.
const TREE3D_NAME_FONTS = {
    'elegant-script': '"Monotype Corsiva", "Segoe Script", "Lucida Handwriting", cursive',
    'handwriting': '"Segoe Print", "Segoe Script", "Comic Sans MS", cursive',
    'modern': 'Inter, "Segoe UI", Arial, sans-serif',
    'rounded': '"Trebuchet MS", Verdana, "Segoe UI", sans-serif',
    'classic-serif': 'Georgia, "Palatino Linotype", "Times New Roman", serif',
    'typewriter': '"Courier New", Consolas, monospace'
};
const TREE3D_NAME_COLOURS = [
    ['White', '#ffffff'],
    ['Warm gold', '#ffe08a'],
    ['Soft mint', '#c8ffd8'],
    ['Ice blue', '#d6ecff'],
    ['Charcoal', '#1f2937'],
    ['Deep brown', '#4a2c0a']
];

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
    vipLeafBrightness: 70, // how bright the gold VIP leaves are, 30 to 120 percent (soft, so the name reads)
    vipGlow: true,
    vipSparkle: true, // the white star at the leaf's tip
    vipTurn: true, // turning gently from left to right and back
    // The names on VIP leaves: the same as the other names unless given their own style.
    vipNameOwnStyle: false,
    vipNameFont: 'auto',
    vipNameWeight: 700,
    vipNameColor: '#ffffff',
    vipNameSize: 1
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
    leafBatchMode: 'groups',
    leafBatchCount: 3,
    leafBatchSize: 3,
    badgeColours: true
};
const TREE3D_VISUAL_NUMBERS = ['leafAreaWidth', 'leafAreaHeight', 'leafAreaOffset', 'leafRefreshMs', 'leafOpacity',
    'leafAppearMs', 'leafShowcaseSeconds', 'leafFloatMs', 'leafFallMs', 'leafBatchCount', 'leafBatchSize'];
// The 2D tree's saved badge colours (Badge Leaf Styling), used for any badge left at its built-in colour in 3D.
let tree3dBadgeColours2d = {};
// The badges, with the 2D tree's default colours (Badge Leaf Styling).
const TREE3D_BADGES = [
    ['feedback-completer', 'Feedback Contributor', '#4a7c59'],
    ['climate-champion', 'Climate Champion', '#0f766e'],
    ['renewable-innovator', 'Renewable Innovator', '#f59e0b'],
    ['sustainable-living-advocate', 'Sustainable Living Advocate', '#16a34a'],
    ['ocean-guardian', 'Ocean Guardian', '#0284c7'],
    ['governance-guardian', 'Governance Guardian', '#7c3aed'],
    ['social-champion', 'Social Champion', '#d97706'],
    ['multi-pledge', 'Multiple pledges (several topics chosen)', '#8b5a2b']
];

// The rain areas the 3D page lists come from the same public Singapore feed.

// Display 2D/3D Tree (top of Digital Tree Adjustment) picks which settings are shown below it:
// the 2D tabs for 2D, the 3D Tree Settings for 3D. Choosing only switches the view; Save Display makes it live.
function showTreeSettingsForMode(mode) {
    const page = document.getElementById('tree-adjustment-page');
    if (page) page.classList.toggle('tree-mode-3d', mode === '3d');
    if (mode === '3d' && typeof loadTree3dStage === 'function') loadTree3dStage(); // the stage may have changed in the 2D panel
}

// Look > Trunk glow: its strength shown as a percent, and greyed out while the glow is off.
function updateTree3dTrunkGlowFields() {
    const strength = tree3dField('trunkGlowStrength');
    if (!strength) return;
    tree3dField('trunkGlowStrengthValue').textContent = `${strength.value}%`;
    const on = tree3dField('trunkGlow')?.checked !== false;
    strength.disabled = !on;
    tree3dField('trunkGlowStrengthRow').style.opacity = on ? '1' : '0.45';
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
    const musicVolume = tree3dField('musicVolume');
    if (musicVolume) tree3dField('musicVolumeValue').textContent = musicVolume.value;
    for (const key of TREE3D_AMBIENT_SOUNDS) {
        const range = tree3dField(`${key}Volume`);
        if (range) tree3dField(`${key}VolumeValue`).textContent = range.value;
    }
    if (opacity) tree3dField('titleOpacityValue').textContent = Number(opacity.value).toFixed(2);
    if (blur) tree3dField('titleBlurValue').textContent = `${blur.value}px`;
    if (radius) tree3dField('titleRadiusValue').textContent = `${radius.value}px`;
    applyTree3dSoundPreview(); // Listen here follows the sliders
}

// Sound > Ambient sounds: each a tickbox (tree3d-ambientRiver and so on) and a volume (…Volume), as saved.
const TREE3D_AMBIENT_SOUNDS = ['ambientRiver', 'ambientBirds', 'ambientWind', 'ambientRain', 'ambientInsects'];

// The Sound card's choices as the 3D screen takes them (also what is saved).
function readTree3dSoundFields() {
    const percent = (id, fallback) => {
        const value = Number(tree3dField(id)?.value);
        return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : fallback;
    };
    const { style, track } = tree3dMusicChoice();
    const fields = {
        soundVolume: percent('soundVolume', TREE3D_DEFAULTS.soundVolume),
        musicEnabled: style !== 'none',
        musicVolume: percent('musicVolume', TREE3D_DEFAULTS.musicVolume),
        ...(style !== 'none' ? { musicStyle: style } : {}), // None keeps the style chosen before, for next time
        // My uploaded music: the file chosen (another style keeps it, for next time).
        ...(style === 'uploaded' ? { musicTrack: track } : {}), // an uploaded file (a built-in choice keeps the file, for next time)
    };
    for (const key of TREE3D_AMBIENT_SOUNDS) {
        if (!tree3dField(key)) continue;
        fields[key] = tree3dField(key).checked;
        fields[`${key}Volume`] = percent(`${key}Volume`, TREE3D_DEFAULTS[`${key}Volume`]);
    }
    return fields;
}

// Sound > Background music and My music (Owner: Role 2, Wei Jie). "Music to play" lists the built-in music
// (composed by the 3D screen; Calm kalimba is the default) and the admin's uploaded music together: an uploaded
// file's option is UPLOAD_PREFIX and its path (musicStyle 'uploaded' with musicTrack when saved). My music uploads
// files to assets/Tree/music (backend/features/admin/routes.js /parameters/tree3d-music/...) and lists them,
// each with Use (plays it on the 3D screen at once) and Delete. Uploading a file also plays it at once.
const TREE3D_UPLOAD_PREFIX = 'upload:';
let tree3dMusicTracks = [];     // the uploaded files, newest first
let tree3dMusicSaved = null;    // the music the 3D screen plays now: { musicEnabled, musicStyle, musicTrack }

// The choice in "Music to play" as settings: { style, track }.
function tree3dMusicChoice() {
    const value = tree3dField('musicStyle')?.value || TREE3D_DEFAULTS.musicStyle;
    if (value.startsWith(TREE3D_UPLOAD_PREFIX)) return { style: 'uploaded', track: value.slice(TREE3D_UPLOAD_PREFIX.length) };
    return { style: value, track: undefined };
}

function tree3dMusicName(track) {
    const known = tree3dMusicTracks.find(item => item.path === track);
    return known ? known.name : String(track || '').split('/').pop().replace(/-\d{10,}(\.[^.]+)$/, '$1');
}

// Shows settings' music in "Music to play" (an uploaded file not listed yet is added for now, so a Save
// before the list has loaded keeps it).
function setTree3dMusicChoice(settings) {
    const select = tree3dField('musicStyle');
    const group = tree3dField('musicUploadedGroup');
    if (!select) return;
    if (settings.musicEnabled === false) { select.value = 'none'; return; }
    if (settings.musicStyle === 'uploaded' && settings.musicTrack) {
        const value = TREE3D_UPLOAD_PREFIX + settings.musicTrack;
        if (group && ![...select.options].some(option => option.value === value)) group.append(new Option(tree3dMusicName(settings.musicTrack), value));
        select.value = value;
        return;
    }
    const builtIn = [...select.options].some(option => option.value === settings.musicStyle && !option.value.startsWith(TREE3D_UPLOAD_PREFIX));
    select.value = builtIn ? settings.musicStyle : TREE3D_DEFAULTS.musicStyle; // 'uploaded' with no file: the default
}

// My music: a note while "Sound on the 3D screen" is off, as then the screen plays no music at all.
function updateTree3dSoundOffNote() {
    const note = tree3dField('musicSoundOff');
    if (note) note.hidden = tree3dField('soundEnabled')?.checked !== false;
}

// The note's "Turn on sound": the sound on the 3D screen, saved at once.
async function turnOnTree3dSound() {
    try {
        await putTree3dSettings({ soundEnabled: true });
        if (tree3dField('soundEnabled')) tree3dField('soundEnabled').checked = true;
        updateTree3dSoundOffNote();
        setTree3dMusicStatus('✅ Sound is on. The 3D screen plays its sound and music now (a screen that has not been touched yet shows "Tap anywhere to turn on the sound").');
        showNotification('Sound turned on for the 3D screen.', 'success');
    } catch (error) {
        console.error('Error turning on the 3D tree sound:', error);
        showNotification(error.message || 'Failed to turn on the sound.', 'error');
    }
}

function setTree3dMusicStatus(message) {
    const status = tree3dField('musicStatus');
    if (status) status.textContent = message;
}

function tree3dMusicPlaying(track) {
    const saved = tree3dMusicSaved;
    return Boolean(saved && saved.musicEnabled !== false && saved.musicStyle === 'uploaded' && saved.musicTrack === track);
}

// The uploaded files: in "Music to play" (My uploaded music) and in My music, each with Use and Delete.
function showTree3dMusicTracks(tracks) {
    tree3dMusicTracks = tracks || [];
    const select = tree3dField('musicStyle');
    const group = tree3dField('musicUploadedGroup');
    if (select && group) {
        const chosen = select.value;
        group.replaceChildren(...tree3dMusicTracks.map(track => new Option(track.name, TREE3D_UPLOAD_PREFIX + track.path)));
        if (!tree3dMusicTracks.length) {
            const empty = new Option('(none uploaded yet)', '');
            empty.disabled = true;
            group.append(empty);
        }
        // A chosen file that was deleted: back to the default built-in music.
        select.value = [...select.options].some(option => option.value === chosen && !option.disabled) ? chosen : TREE3D_DEFAULTS.musicStyle;
    }
    const list = tree3dField('musicList');
    if (!list) return;
    list.replaceChildren();
    if (!tree3dMusicTracks.length) {
        const empty = document.createElement('p');
        empty.style.cssText = 'margin:0; color:#64748b; font-size:13px;';
        empty.textContent = 'No music uploaded yet. Choose a music file and press Upload Music; it plays on the 3D screen at once.';
        list.append(empty);
        return;
    }
    for (const track of tree3dMusicTracks) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:7px 10px; margin-top:6px; background:#fff; border:1px solid #e2e8f0; border-radius:6px;';
        const name = document.createElement('span');
        name.style.cssText = 'flex:1 1 240px; color:#1e293b; font-weight:500; overflow-wrap:anywhere;';
        name.textContent = `🎵 ${track.name}`;
        const details = document.createElement('span');
        details.style.cssText = 'color:#64748b; font-size:12px;';
        details.textContent = `${track.sizeMb} MB · uploaded ${new Date(track.uploadedAt).toLocaleDateString()}`;
        const actions = document.createElement('span'); // the badge and buttons kept together, at the right
        actions.style.cssText = 'display:flex; align-items:center; gap:8px; margin-left:auto;';
        row.append(name, details, actions);
        if (tree3dMusicPlaying(track.path)) {
            const badge = document.createElement('span');
            badge.style.cssText = 'font-size:12px; font-weight:600; color:#166534; background:#dcfce7; border-radius:999px; padding:2px 10px;';
            badge.textContent = '▶ Playing on the 3D screen';
            actions.append(badge);
        } else {
            const use = document.createElement('button');
            use.type = 'button';
            use.className = 'btn-secondary';
            use.textContent = 'Use';
            use.title = 'Play this music on the 3D screen now';
            use.addEventListener('click', () => useTree3dMusic(track));
            actions.append(use);
        }
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn-secondary';
        remove.textContent = 'Delete';
        remove.addEventListener('click', () => deleteTree3dMusic(track));
        actions.append(remove);
        list.append(row);
    }
}

function tree3dMusicChanged() {
    applyTree3dSoundPreview();
}

async function loadTree3dMusicTracks() {
    try {
        const response = await fetch('/api/admin/parameters/tree3d-music/list', { credentials: 'include', cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to list the uploaded music');
        tree3dMusicSaved = data.current || tree3dMusicSaved;
        showTree3dMusicTracks(data.tracks || []);
        setTree3dMusicStatus('');
        updateTree3dSoundOffNote();
    } catch (error) {
        console.error('Error listing the 3D tree music:', error);
        setTree3dMusicStatus(`Error: ${error.message}`);
    }
}

// The 3D screen's music as the server now has it (after an upload, Use or a delete), shown in the form.
function useTree3dMusicNow(current, tracks) {
    if (current) tree3dMusicSaved = current;
    showTree3dMusicTracks(tracks || tree3dMusicTracks);
    if (current) setTree3dMusicChoice(current);
    updateTree3dSoundOffNote();
    applyTree3dSoundPreview();
}

async function uploadTree3dMusic() {
    const input = tree3dField('musicFile');
    const file = input?.files?.[0];
    if (!file) {
        setTree3dMusicStatus('Choose a music file first.');
        showNotification('Choose a music file first.', 'error');
        return;
    }
    if (file.size > 30 * 1024 * 1024) {
        setTree3dMusicStatus('That file is larger than 30 MB. Choose a smaller music file.');
        showNotification('The music file is larger than 30 MB.', 'error');
        return;
    }
    const button = tree3dField('musicUpload');
    try {
        if (button) button.disabled = true;
        setTree3dMusicStatus(`Uploading ${file.name}…`);
        const formData = new FormData();
        formData.append('music', file);
        const response = await fetch('/api/admin/parameters/tree3d-music/upload', { method: 'POST', credentials: 'include', body: formData });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to upload the music');
        if (input) input.value = '';
        useTree3dMusicNow(data.current, data.tracks);
        setTree3dMusicStatus(`✅ ${file.name} uploaded and playing on the 3D screen now.`);
        showNotification('Music uploaded and playing on the 3D tree.', 'success');
    } catch (error) {
        console.error('Error uploading the 3D tree music:', error);
        setTree3dMusicStatus(`Error: ${error.message}`);
        showNotification(error.message || 'Failed to upload the music.', 'error');
    } finally {
        if (button) button.disabled = false;
    }
}

// Use: this uploaded file plays on the 3D screen now (saved at once, as an upload is).
async function useTree3dMusic(track) {
    try {
        const saved = await putTree3dSettings({ musicEnabled: true, musicStyle: 'uploaded', musicTrack: track.path });
        useTree3dMusicNow({ musicEnabled: saved?.musicEnabled, musicStyle: saved?.musicStyle, musicTrack: saved?.musicTrack });
        setTree3dMusicStatus(`✅ Playing on the 3D screen now: ${track.name}.`);
        showNotification(`Playing ${track.name} on the 3D tree.`, 'success');
    } catch (error) {
        console.error('Error choosing the 3D tree music:', error);
        setTree3dMusicStatus(`Error: ${error.message}`);
        showNotification(error.message || 'Failed to choose the music.', 'error');
    }
}

async function deleteTree3dMusic(track) {
    const playing = tree3dMusicPlaying(track.path);
    if (!confirm(`Delete "${track.name}"?${playing ? ' The 3D screen plays it now, so it goes back to the built-in Calm kalimba music.' : ''}`)) return;
    try {
        const response = await fetch(`/api/admin/parameters/tree3d-music/${encodeURIComponent(track.filename)}`, { method: 'DELETE', credentials: 'include' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to delete the music');
        useTree3dMusicNow(data.current, data.tracks);
        setTree3dMusicStatus(`Deleted ${track.name}.`);
        showNotification('Music deleted.', 'success');
    } catch (error) {
        console.error('Error deleting the 3D tree music:', error);
        setTree3dMusicStatus(`Error: ${error.message}`);
        showNotification(error.message || 'Failed to delete the music.', 'error');
    }
}

// Sound > Listen here: the 3D screen's own sound (frontend/3dTree/ambience.js, with its background music,
// background-music.js) played in this browser with the choices above, so the admin hears exactly what the
// screen plays; it follows every change while it plays. One player, turned on and off.
let tree3dSoundPreview = null;   // { ambient, mixFromSettings, timer } while it plays
let tree3dSoundEngine = null;    // the player, kept for the next Listen here

function applyTree3dSoundPreview() {
    const preview = tree3dSoundPreview;
    if (!preview) return;
    const fields = readTree3dSoundFields();
    preview.ambient.setLevel(fields.soundVolume / 100);
    preview.ambient.setMusic(fields.musicEnabled, fields.musicVolume / 100, fields.musicStyle, fields.musicTrack);
    preview.ambient.setMix(preview.mixFromSettings(fields));
}

function stopTree3dSoundPreview() {
    const preview = tree3dSoundPreview;
    if (!preview) return;
    tree3dSoundPreview = null;
    window.clearInterval(preview.timer);
    if (preview.ambient.enabled) preview.ambient.toggle().catch(() => {}); // fades everything out
    const button = tree3dField('soundPreview');
    if (button) button.textContent = '▶ Listen here';
}

async function toggleTree3dSoundPreview() {
    if (tree3dSoundPreview) { stopTree3dSoundPreview(); return; }
    const button = tree3dField('soundPreview');
    try {
        if (button) button.textContent = 'Loading sound…';
        const sound = await import('/3dTree/ambience.js');
        tree3dSoundEngine ??= sound.createAmbience();
        const ambient = tree3dSoundEngine;
        // The scene's sound changes with it (the view, gusts, night); here a still view by day with a light breeze.
        const timer = window.setInterval(() => ambient.update(0, 12, 0.15, 0, 0), 120);
        tree3dSoundPreview = { ambient, mixFromSettings: sound.mixFromSettings, timer };
        applyTree3dSoundPreview();
        if (!ambient.enabled) await ambient.toggle();
        if (button) button.textContent = '■ Stop listening';
    } catch (error) {
        console.error('Sound preview failed:', error);
        stopTree3dSoundPreview();
        showNotification('The 3D screen\'s sound could not play in this browser.', 'error');
    }
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

// Names on the leaves: a sample name on a leaf in the chosen font, weight and colour, as the 3D screen writes
// it (frontend/3dTree/feedback-leaves.js nameLabel): with the glowing look on the night sky, glowing in its own
// colour; with the natural look on a daylight leaf, with an edge. A dark colour gets a light edge or glow.
// A name style as the fields with this prefix set it: 'leafName' (the names) or 'vipName' (the VIP names).
function tree3dNameStyle(prefix) {
    return {
        fontKey: tree3dField(`${prefix}Font`)?.value || 'auto',
        weight: Number(tree3dField(`${prefix}Weight`)?.value) || 700,
        colour: (tree3dField(`${prefix}Color`)?.value || '#ffffff').toLowerCase(),
        size: Math.min(1.4, Math.max(0.7, Number(tree3dField(`${prefix}Size`)?.value) || 1))
    };
}

// The two name previews: the names on a leaf in the chosen look (3D Leaf Adjustments), and the VIP names on
// the gold leaf (3D VIP Leaf Adjustments), in their own style or, when that is off, the same as the others.
// Look > VIP leaf brightness as a share (0.3 to 1.2), and a colour dimmed by it, as the 3D tree shows it.
function tree3dVipBrightness() {
    const value = Number(tree3dField('vipLeafBrightness')?.value);
    return (Number.isFinite(value) ? Math.min(120, Math.max(30, value)) : TREE3D_VIP_DEFAULTS.vipLeafBrightness) / 100;
}
function tree3dDimColour(hex, share) {
    const value = parseInt(String(hex || '#d4af37').slice(1), 16);
    if (!Number.isFinite(value)) return hex;
    const part = shift => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * share))).toString(16).padStart(2, '0');
    return `#${part(16)}${part(8)}${part(0)}`;
}

// Scroll long names: the example leaf scrolls its long name when on, shows it shortened with "…" when off; its
// scroll at the trees' pace (half its width each second, after a pause of a fifth of the round).
function updateTree3dNameScrollDemo() {
    const demo = tree3dField('nameScrollDemo');
    if (!demo) return;
    demo.classList.toggle('is-off', tree3dField('leafNameScroll')?.checked === false);
    const first = demo.querySelector('.name-scroll-track > span');
    if (!first) return;
    const context = (updateTree3dNameScrollDemo.context ||= document.createElement('canvas').getContext('2d'));
    context.font = `700 13px ${getComputedStyle(demo).fontFamily}`;
    const distance = Math.ceil(context.measureText(first.textContent).width) + 60; // the name and its gap
    demo.style.setProperty('--demo-distance', `${distance}px`);
    demo.style.setProperty('--demo-duration', `${(distance / (170 * 0.5) / 0.8).toFixed(2)}s`);
}

function updateTree3dNamePreview() {
    const glowing = tree3dField('glowLook')?.checked !== false;
    const look = glowing ? 'glowing look' : 'natural look';
    const names = tree3dNameStyle('leafName');
    if (tree3dField('leafNameSizeValue')) tree3dField('leafNameSizeValue').textContent = `${Math.round(names.size * 100)}%`;
    paintTree3dNameSample('leafName', names, glowing,
        glowing ? '#2ee05a' : tree3dShownColour(tree3dField('leafNewColor')?.value || '#7cb342'), `Name preview, ${look}`);

    const own = tree3dField('vipNameOwnStyle')?.checked === true;
    const fields = tree3dField('vipNameFields');
    if (fields) {
        fields.classList.toggle('is-off', !own);
        fields.querySelectorAll('input, select, button').forEach(control => { control.disabled = !own; });
    }
    const vipSize = tree3dNameStyle('vipName').size;
    if (tree3dField('vipNameSizeValue')) tree3dField('vipNameSizeValue').textContent = `${Math.round(vipSize * 100)}%`;
    paintTree3dNameSample('vipName', own ? tree3dNameStyle('vipName') : names, glowing,
        tree3dDimColour(glowing ? '#ffd23f' : tree3dShownColour(tree3dField('leafVipColor')?.value || '#d4af37'), tree3dVipBrightness()),
        `VIP name preview, ${own ? 'own style' : 'same as the other names'}, ${look}`, true);
}

// onGold: a VIP name, written as on the 3D tree with a strong dark edge on the gold.
function paintTree3dNameSample(prefix, style, glowing, leafColour, caption, onGold = false) {
    const sample = tree3dField(`${prefix}Sample`);
    if (!sample) return;
    const { fontKey, weight, colour, size } = style;
    const family = TREE3D_NAME_FONTS[fontKey] || TREE3D_NAME_FONTS[glowing ? 'elegant-script' : 'modern'];
    const value = parseInt(colour.slice(1), 16);
    const linear = c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const dark = 0.2126 * linear((value >> 16) & 255) + 0.7152 * linear((value >> 8) & 255) + 0.0722 * linear(value & 255) < 0.25;
    const behind = dark ? 'rgba(255,255,255,0.85)' : onGold ? 'rgba(46,26,0,0.92)' : 'rgba(8,28,14,0.85)';
    sample.style.fontFamily = family;
    sample.style.fontWeight = String(weight);
    sample.style.color = colour;
    const handwritten = (fontKey === 'auto' && glowing) || fontKey === 'elegant-script';
    sample.style.fontSize = `${((handwritten ? 18 : 15) * size).toFixed(1)}px`;
    sample.style.textShadow = glowing && !dark && !onGold
        ? `0 0 3px ${behind}, 0 0 8px ${colour}`
        : `-1px -1px 0 ${behind}, 1px -1px 0 ${behind}, -1px 1px 0 ${behind}, 1px 1px 0 ${behind}`;
    tree3dField(`${prefix}Frame`)?.classList.toggle('glowing', glowing);
    const leaf = tree3dField(`${prefix}PreviewLeaf`);
    if (leaf) leaf.style.setProperty('--leaf-colour', leafColour);
    if (tree3dField(`${prefix}Caption`)) tree3dField(`${prefix}Caption`).textContent = caption;
    // The swatch for the field's own colour (the VIP swatches follow the VIP colour field, even while off).
    const own = (tree3dField(`${prefix}Color`)?.value || '').toLowerCase();
    for (const swatch of tree3dField(`${prefix}Swatches`)?.children || []) {
        swatch.setAttribute('aria-pressed', String(swatch.dataset.colour === own));
    }
}

function renderTree3dNameSwatches() {
    for (const prefix of ['leafName', 'vipName']) {
        const box = tree3dField(`${prefix}Swatches`);
        if (!box || box.childElementCount) continue;
        for (const [name, hex] of TREE3D_NAME_COLOURS) {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'leaf3d-swatch';
            swatch.style.background = hex;
            swatch.dataset.colour = hex;
            swatch.title = name;
            swatch.setAttribute('aria-label', `${prefix === 'vipName' ? 'VIP name' : 'Name'} colour: ${name}`);
            swatch.addEventListener('click', () => {
                tree3dField(`${prefix}Color`).value = hex;
                updateTree3dNamePreview();
            });
            box.appendChild(swatch);
        }
    }
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
    const vipBright = tree3dVipBrightness();
    if (tree3dField('vipLeafBrightnessValue')) tree3dField('vipLeafBrightnessValue').textContent = `${Math.round(vipBright * 100)}%`;
    tree3dField('leafVipGlowBox')?.style.setProperty('--vip-glow', String(Math.min(1, vipBright))); // the preview's gold glow
    if (vipPreview) {
        const size = (0.5 + vipScale * 0.3).toFixed(2);
        vipPreview.style.setProperty('--leaf-colour', tree3dDimColour(vipColour, vipBright));
        vipPreview.style.transform = `scale(${vipSide === 'left' ? -size : size}, ${size})`;
    }
    tree3dField('leafVipGlowBox')?.classList.toggle('glowing', tree3dField('vipGlow')?.checked === true);
    tree3dField('leafVipSparkle')?.classList.toggle('is-off', tree3dField('vipSparkle')?.checked !== true);
    tree3dField('leafVipTurn')?.classList.toggle('turning', tree3dField('vipTurn')?.checked === true);
    tree3dField('leafVipSparkle')?.classList.toggle('tip-left', vipSide === 'left');
    if (tree3dField('leafVipCaption')) tree3dField('leafVipCaption').textContent = `VIP leaf, ${vipSide}`;
    if (tree3dField('vipNameSample')) updateTree3dNamePreview();
    for (const swatch of tree3dField('leafVipSwatches')?.children || []) {
        swatch.setAttribute('aria-pressed', String(swatch.dataset.colour === vipColour));
    }
}

// Rain area only applies to live weather; time of day and rain only to manual weather.
// The automatic turn (Motion): one full turn every so many seconds, minutes or hours (30 seconds to 24 hours,
// tree3dParameters.orbitSeconds), and which way (orbitDirection). frontend/3dTree/tree-view.js setOrbit.
const TREE3D_TURN_UNITS = { seconds: 1, minutes: 60, hours: 3600 };

function tree3dTurnSeconds() {
    const amount = Number(tree3dField('orbitTime')?.value) || 0;
    const unit = TREE3D_TURN_UNITS[tree3dField('orbitUnit')?.value] || 3600;
    return Math.round(Math.min(86400, Math.max(30, amount * unit || TREE3D_DEFAULTS.orbitSeconds)));
}

function setTree3dTurnTime(amount, unit) {
    tree3dField('orbitTime').value = amount;
    tree3dField('orbitUnit').value = unit;
    updateTree3dTurnFields();
}

// The turn fields show only with the automatic turn on; the help says how fast it is.
function updateTree3dTurnFields() {
    const fields = tree3dField('turnFields');
    if (fields) fields.style.display = tree3dField('autoOrbit')?.checked ? '' : 'none';
    const help = tree3dField('turnHelp');
    if (!help) return;
    const seconds = tree3dTurnSeconds();
    const degreesPerSecond = 360 / seconds;
    const pace = degreesPerSecond >= 1 ? `about ${Math.round(degreesPerSecond)}° a second`
        : degreesPerSecond * 60 >= 1 ? `about ${Math.round(degreesPerSecond * 60)}° a minute`
            : `about ${Math.round(degreesPerSecond * 3600)}° an hour`;
    const asked = (Number(tree3dField('orbitTime')?.value) || 0) * (TREE3D_TURN_UNITS[tree3dField('orbitUnit')?.value] || 3600);
    const kept = asked < 30 ? ' (30 seconds is the fastest)' : asked > 86400 ? ' (24 hours is the slowest)' : '';
    help.textContent = `The tree turns ${pace}, to the ${tree3dField('orbitDirection')?.value === 'left' ? 'left' : 'right'}${kept}. Any time from 30 seconds to 24 hours a turn. Dragging the tree pauses the turn for a few seconds.`;
}

function updateTree3dWeatherFields() {
    const live = tree3dField('weatherSource')?.value !== 'manual';
    tree3dField('rainArea').disabled = !live;
    tree3dField('manualSky').disabled = live;
    tree3dField('manualRain').disabled = live;
}

// Weather location: the automatic weather is always at Woodlands, the one place listed (an older saved place,
// such as All Singapore, is shown and saved as Woodlands).
function setTree3dRainArea() {
    const select = tree3dField('rainArea');
    if (!select) return;
    if (![...select.options].some(option => option.value === 'Woodlands')) select.replaceChildren(new Option('Woodlands', 'Woodlands'));
    select.value = 'Woodlands';
}

// Only Woodlands is listed (the automatic weather is detected there); no list of other places is fetched.
function loadTree3dRainAreas() {
    setTree3dRainArea();
}

function fillTree3dForm(settings) {
    const s = { ...TREE3D_DEFAULTS, ...(settings || {}) };
    const box = { ...TREE3D_TITLE_DEFAULTS, ...(settings?.titleBox || {}) };
    const leaves = { ...TREE3D_LEAF_DEFAULTS, ...(settings || {}) };

    tree3dField('glowLook').checked = s.glowLook !== false;
    if (tree3dField('trunkGlow')) {
        tree3dField('trunkGlow').checked = s.trunkGlow !== false;
        const strength = Number(s.trunkGlowStrength);
        tree3dField('trunkGlowStrength').value = Number.isFinite(strength) ? Math.min(200, Math.max(50, strength)) : TREE3D_DEFAULTS.trunkGlowStrength;
        updateTree3dTrunkGlowFields();
    }
    if (typeof setScreenSizeFields === 'function') setScreenSizeFields('tree3d', s.screenSize); // js/tree.js
    tree3dField('weatherSource').value = s.weatherSource;
    tree3dField('manualSky').value = s.manualSky;
    tree3dField('manualRain').checked = s.manualRain === true;
    setTree3dRainArea(s.rainArea);
    tree3dField('riverLevelMode').value = s.riverLevelMode;
    tree3dField('autoOrbit').checked = s.autoOrbit !== false;
    if (tree3dField('orbitTime')) {
        // Shown in the largest whole unit: 86400 as 24 hours, 300 as 5 minutes, 45 as 45 seconds.
        const seconds = Math.min(86400, Math.max(30, Math.round(Number(s.orbitSeconds) || TREE3D_DEFAULTS.orbitSeconds)));
        const unit = seconds % 3600 === 0 ? 'hours' : seconds % 60 === 0 ? 'minutes' : 'seconds';
        tree3dField('orbitTime').value = seconds / TREE3D_TURN_UNITS[unit];
        tree3dField('orbitUnit').value = unit;
        tree3dField('orbitDirection').value = s.orbitDirection === 'left' ? 'left' : 'right';
        updateTree3dTurnFields();
    }
    tree3dField('showSoilPanel').checked = s.showSoilPanel === true;
    useTree3dViews(s);
    tree3dField('soundEnabled').checked = s.soundEnabled === true;
    updateTree3dSoundOffNote();
    tree3dField('soundVolume').value = s.soundVolume;
    if (tree3dField('musicStyle')) {
        tree3dMusicSaved = { musicEnabled: s.musicEnabled, musicStyle: s.musicStyle, musicTrack: s.musicTrack };
        setTree3dMusicChoice(s);
        tree3dField('musicVolume').value = s.musicVolume;
        loadTree3dMusicTracks(); // the uploaded music, in Music to play and in My music
    }
    for (const key of TREE3D_AMBIENT_SOUNDS) {
        if (!tree3dField(key)) continue;
        tree3dField(key).checked = s[key] === undefined ? TREE3D_DEFAULTS[key] : s[key] !== false;
        tree3dField(`${key}Volume`).value = Number.isFinite(Number(s[`${key}Volume`])) ? s[`${key}Volume`] : TREE3D_DEFAULTS[`${key}Volume`];
    }
    tree3dField('showWeatherPanel').checked = s.showWeatherPanel !== false;
    tree3dField('showRiverPanel').checked = s.showRiverPanel !== false;
    tree3dField('showControlsBar').checked = s.showControlsBar !== false;
    tree3dField('showYearReview').checked = s.showYearReview !== false;

    tree3dField('showFeedbackLeaves').checked = leaves.showFeedbackLeaves !== false;
    tree3dField('showLeafNames').checked = leaves.showLeafNames !== false;
    if (tree3dField('leafNameScroll')) {
        tree3dField('leafNameScroll').checked = leaves.leafNameScroll !== false;
        updateTree3dNameScrollDemo();
    }
    // A colour saved before the greens-only choice falls back to the default green.
    const offered = (which, hex) => TREE3D_LEAF_COLOURS[which].some(([, value]) => value === String(hex).toLowerCase());
    tree3dField('leafNewColor').value = offered('New', leaves.leafNewColor) ? leaves.leafNewColor.toLowerCase() : TREE3D_LEAF_DEFAULTS.leafNewColor;
    tree3dField('leafOldColor').value = offered('Old', leaves.leafOldColor) ? leaves.leafOldColor.toLowerCase() : TREE3D_LEAF_DEFAULTS.leafOldColor;
    tree3dField('leafSide').value = ['both', 'left', 'right'].includes(leaves.leafSide) ? leaves.leafSide : 'both';
    // "A leaf stays light for": whole hours as hours, anything shorter or in between as minutes.
    const lightHours = Math.max(0, Number(leaves.leafNewHours) || 0);
    const inHours = lightHours >= 1 && Number.isInteger(lightHours);
    tree3dField('leafNewHours').value = inHours ? lightHours : Math.round(lightHours * 60);
    if (tree3dField('leafNewUnit')) tree3dField('leafNewUnit').value = inHours ? 'hours' : 'minutes';
    tree3dField('leafScale').value = leaves.leafScale;
    if (tree3dField('leafNameFont')) {
        tree3dField('leafNameFont').value = Object.hasOwn(TREE3D_NAME_FONTS, leaves.leafNameFont) ? leaves.leafNameFont : 'auto';
        tree3dField('leafNameWeight').value = String([400, 500, 600, 700, 800].includes(Number(leaves.leafNameWeight)) ? Number(leaves.leafNameWeight) : 700);
        tree3dField('leafNameColor').value = /^#[0-9a-f]{6}$/i.test(String(leaves.leafNameColor || '')) ? leaves.leafNameColor.toLowerCase() : '#ffffff';
        if (tree3dField('leafNameSize')) tree3dField('leafNameSize').value = String(Math.min(1.4, Math.max(0.7, Number(leaves.leafNameSize) || 1)));
    }
    const vip = { ...TREE3D_VIP_DEFAULTS, ...(settings || {}) };
    tree3dField('leafVipColor').value = offered('Vip', vip.vipLeafColor) ? vip.vipLeafColor.toLowerCase() : TREE3D_VIP_DEFAULTS.vipLeafColor;
    tree3dField('vipLeafScale').value = vip.vipLeafScale;
    if (tree3dField('vipLeafBrightness')) {
        const bright = Number(vip.vipLeafBrightness);
        tree3dField('vipLeafBrightness').value = Number.isFinite(bright) ? Math.min(120, Math.max(30, bright)) : TREE3D_VIP_DEFAULTS.vipLeafBrightness;
    }
    tree3dField('vipGlow').checked = vip.vipGlow !== false;
    if (tree3dField('vipSparkle')) tree3dField('vipSparkle').checked = vip.vipSparkle !== false;
    if (tree3dField('vipTurn')) tree3dField('vipTurn').checked = vip.vipTurn !== false;
    if (tree3dField('vipNameFont')) {
        tree3dField('vipNameOwnStyle').checked = vip.vipNameOwnStyle === true;
        tree3dField('vipNameFont').value = Object.hasOwn(TREE3D_NAME_FONTS, vip.vipNameFont) || vip.vipNameFont === 'auto' ? vip.vipNameFont : 'auto';
        tree3dField('vipNameWeight').value = String([400, 500, 600, 700, 800].includes(Number(vip.vipNameWeight)) ? Number(vip.vipNameWeight) : 700);
        tree3dField('vipNameColor').value = /^#[0-9a-f]{6}$/i.test(String(vip.vipNameColor || '')) ? vip.vipNameColor.toLowerCase() : '#ffffff';
        tree3dField('vipNameSize').value = String(Math.min(1.4, Math.max(0.7, Number(vip.vipNameSize) || 1)));
    }

    const visual = { ...TREE3D_VISUAL_DEFAULTS, ...(settings || {}) };
    renderTree3dBadgeColours();
    if (tree3dField('leafAreaWidth')) {
        TREE3D_VISUAL_NUMBERS.forEach(key => { if (tree3dField(key)) tree3dField(key).value = visual[key]; });
        if (tree3dField('leafBatchMode')) tree3dField('leafBatchMode').value = visual.leafBatchMode === 'size' ? 'size' : 'groups';
        updateTree3dBatchFields();
        tree3dField('badgeColours').checked = visual.badgeColours === true;
        // The colour each badge shows on the 3D tree: its 3D colour once changed here, otherwise the 2D tree's
        // (Badge Leaf Styling), as frontend/3dTree/feedback-leaves.js badgeColour.
        const colours = settings?.badgeLeafColors || {};
        TREE3D_BADGES.forEach(([key, , builtIn]) => {
            const own = String(colours[key] || '').toLowerCase();
            const shown = own && own !== builtIn ? own : (tree3dBadgeColours2d[key] || own || builtIn);
            tree3dField(`badgeColour-${key}`).value = shown;
        });
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
    renderTree3dNameSwatches();
    updateTree3dNamePreview();
}

function collectTree3dSettings() {
    const whole = (id, fallback) => {
        const value = parseInt(tree3dField(id).value, 10);
        return Number.isFinite(value) ? value : fallback;
    };
    return {
        glowLook: tree3dField('glowLook').checked,
        ...(tree3dField('trunkGlow') ? {
            trunkGlow: tree3dField('trunkGlow').checked,
            trunkGlowStrength: Math.round(Math.min(200, Math.max(50, Number(tree3dField('trunkGlowStrength').value) || 100)))
        } : {}),
        ...(typeof readScreenSizeFields === 'function' && readScreenSizeFields('tree3d') ? { screenSize: readScreenSizeFields('tree3d') } : {}),
        weatherSource: tree3dField('weatherSource').value,
        manualSky: tree3dField('manualSky').value,
        manualRain: tree3dField('manualRain').checked,
        rainArea: 'Woodlands', // the automatic weather's one place
        riverLevelMode: tree3dField('riverLevelMode').value,
        autoOrbit: tree3dField('autoOrbit').checked,
        ...(tree3dField('orbitTime') ? {
            orbitSeconds: tree3dTurnSeconds(),
            orbitDirection: tree3dField('orbitDirection').value === 'left' ? 'left' : 'right'
        } : {}),
        showSoilPanel: tree3dField('showSoilPanel').checked,
        soundEnabled: tree3dField('soundEnabled').checked,
        soundVolume: whole('soundVolume', TREE3D_DEFAULTS.soundVolume),
        ...(tree3dField('musicStyle') ? (({ soundVolume, ...sound }) => sound)(readTree3dSoundFields()) : {}), // music and ambient sounds
        showWeatherPanel: tree3dField('showWeatherPanel').checked,
        showRiverPanel: tree3dField('showRiverPanel').checked,
        showControlsBar: tree3dField('showControlsBar').checked,
        showYearReview: tree3dField('showYearReview').checked,
        showFeedbackLeaves: tree3dField('showFeedbackLeaves').checked,
        showLeafNames: tree3dField('showLeafNames').checked,
        ...(tree3dField('leafNameScroll') ? { leafNameScroll: tree3dField('leafNameScroll').checked } : {}),
        leafNewColor: tree3dField('leafNewColor').value,
        leafOldColor: tree3dField('leafOldColor').value,
        leafSide: tree3dField('leafSide').value,
        leafNewHours: (Number(tree3dField('leafNewHours').value) || 0) / (tree3dField('leafNewUnit')?.value === 'minutes' ? 60 : 1),
        leafScale: Number(tree3dField('leafScale').value) || TREE3D_LEAF_DEFAULTS.leafScale,
        ...(tree3dField('leafNameFont') ? {
            leafNameFont: tree3dField('leafNameFont').value,
            leafNameWeight: Number(tree3dField('leafNameWeight').value) || TREE3D_LEAF_DEFAULTS.leafNameWeight,
            leafNameColor: tree3dField('leafNameColor').value,
            leafNameSize: Number(tree3dField('leafNameSize')?.value) || TREE3D_LEAF_DEFAULTS.leafNameSize
        } : {}),
        vipLeafColor: tree3dField('leafVipColor').value,
        vipLeafScale: Number(tree3dField('vipLeafScale').value) || TREE3D_VIP_DEFAULTS.vipLeafScale,
        ...(tree3dField('vipLeafBrightness') ? { vipLeafBrightness: Math.round(tree3dVipBrightness() * 100) } : {}),
        vipGlow: tree3dField('vipGlow').checked,
        ...(tree3dField('vipSparkle') ? { vipSparkle: tree3dField('vipSparkle').checked } : {}),
        ...(tree3dField('vipTurn') ? { vipTurn: tree3dField('vipTurn').checked } : {}),
        ...(tree3dField('vipNameFont') ? {
            vipNameOwnStyle: tree3dField('vipNameOwnStyle').checked,
            vipNameFont: tree3dField('vipNameFont').value,
            vipNameWeight: Number(tree3dField('vipNameWeight').value) || TREE3D_VIP_DEFAULTS.vipNameWeight,
            vipNameColor: tree3dField('vipNameColor').value,
            vipNameSize: Number(tree3dField('vipNameSize').value) || TREE3D_VIP_DEFAULTS.vipNameSize
        } : {}),
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

// New leaves shown together: split into a number of groups, or into groups of a number of leaves. Shows the
// field for the chosen way and an example of how new leaves would be split (as frontend/3dTree/feedback-leaves.js
// startFlights).
function tree3dBatchSplit(total, mode, number) {
    const groups = mode === 'size' ? Math.ceil(total / number) : Math.min(number, total);
    return Array.from({ length: groups }, (_, g) => Math.floor(total / groups) + (g < total % groups ? 1 : 0));
}

function updateTree3dBatchFields() {
    const mode = tree3dField('leafBatchMode')?.value === 'size' ? 'size' : 'groups';
    const countBox = tree3dField('leafBatchCountBox');
    const sizeBox = tree3dField('leafBatchSizeBox');
    if (countBox) countBox.style.display = mode === 'groups' ? '' : 'none';
    if (sizeBox) sizeBox.style.display = mode === 'size' ? '' : 'none';
    const number = Math.min(10, Math.max(1, Math.round(Number(tree3dField(mode === 'size' ? 'leafBatchSize' : 'leafBatchCount')?.value) || 3)));
    const example = tree3dField('leafBatchExample');
    if (!example) return;
    const say = parts => (parts.length === 1 ? `${parts[0]}` : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
    example.textContent = [10, 7, 4].map(total => `${total} new leaves: ${say(tree3dBatchSplit(total, mode, number))}`).join(' · ');
}

function collectTree3dVisual() {
    if (!tree3dField('leafAreaWidth')) return {};
    const values = Object.fromEntries(TREE3D_VISUAL_NUMBERS.filter(key => tree3dField(key)).map(key => {
        const number = Number(tree3dField(key).value);
        return [key, Number.isFinite(number) && tree3dField(key).value !== '' ? number : TREE3D_VISUAL_DEFAULTS[key]];
    }));
    return {
        ...values,
        ...(tree3dField('leafBatchMode') ? { leafBatchMode: tree3dField('leafBatchMode').value === 'size' ? 'size' : 'groups' } : {}),
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
    showTree3dMaxLeavesExample();
    return value;
}

// The help under Maximum Visible Leaves, with the number set (as typed): "at 21, the 22nd leaf makes the oldest fall".
function showTree3dMaxLeavesExample() {
    const value = Math.min(500, Math.max(1, Math.round(Number(tree3dField('maxVisibleLeaves')?.value)) || 15));
    const tens = (value + 1) % 100;
    const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[(value + 1) % 10] || 'th';
    if (tree3dField('maxLeavesExample')) tree3dField('maxLeavesExample').textContent = String(value);
    if (tree3dField('maxLeavesNext')) tree3dField('maxLeavesNext').textContent = `${value + 1}${suffix}`;
}

// Time at the bottom middle is the 2D tree's (treeParameters.leafShowcaseSeconds), shared by both trees: 12 seconds
// when unset, 0 to 30.
function showTree3dShowcase(seconds) {
    const raw = Number(seconds);
    const value = seconds === undefined || seconds === null || seconds === '' || !Number.isFinite(raw) ? 12 : Math.min(30, Math.max(0, Math.round(raw)));
    if (tree3dField('leafShowcaseSeconds')) tree3dField('leafShowcaseSeconds').value = value;
    const field2d = document.getElementById('param-leafShowcaseSeconds');
    if (field2d) field2d.value = value;
    return value;
}

async function saveTree3dVisualization() {
    try {
        const showcase = tree3dField('leafShowcaseSeconds')?.value;
        const saved = await putTree3dSettings(collectTree3dSettings());
        if (saved) fillTree3dForm(saved);
        const leafFallThreshold = showTree3dMaxLeaves(tree3dField('maxVisibleLeaves')?.value);
        const leafShowcaseSeconds = showTree3dShowcase(showcase);
        const response = await fetch('/api/admin/parameters/treeParameters', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ leafFallThreshold, leafShowcaseSeconds })
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
// /3dTree screen shows the Ketapang Stage 0 to 4 model for it (frontend/3dTree/tree-stage.js), and in Auto
// grows it a little with every leaf until the next stage (frontend/3dTree/tree-growth.js; the growth line).
const TREE3D_STAGE_NAMES = ['Bare Trunk', 'Early Growth', 'Young Canopy', 'Mature Canopy', 'Full Canopy'];

function tree3dStageThresholds() {
    const value = key => parseInt(tree3dField(`thresholdStage${key}`)?.value, 10) || 0;
    return { stage1: value(1), stage2: value(2), stage3: value(3), stage4: value(4) };
}

function tree3dStageIsAuto() {
    return document.querySelector('input[name="tree3dStageMode"]:checked')?.value !== 'manual';
}

// How far the 3D tree has grown through its stage, as the server works it out for the 3D tree's growth
// (backend/features/parameters/treeStage.js stageProgress): "60% grown towards Stage 3 (6 more leaves)".
function tree3dGrowthText(leafCount, thresholds, stage) {
    if (stage >= 4) return 'fully grown';
    const from = stage === 0 ? 0 : Number(thresholds[`stage${stage}`]) || 0;
    const to = Number(thresholds[`stage${stage + 1}`]) || 0;
    const share = to > from ? Math.min(1, Math.max(0, (leafCount - from) / (to - from))) : 1;
    const more = Math.max(0, to - leafCount);
    return `${Math.round(share * 100)}% grown towards Stage ${stage + 1} (${more} more ${more === 1 ? 'leaf' : 'leaves'})`;
}

async function updateTree3dAutoStage() {
    const countLabel = tree3dField('currentLeafCount');
    const preview = tree3dField('autoStagePreview');
    if (!countLabel || !preview) return null;
    const leafCount = await getCurrentLeafCount();
    const thresholds = tree3dStageThresholds();
    const stage = getStageFromLeafCount(leafCount, thresholds);
    countLabel.textContent = String(leafCount);
    preview.textContent = `${stage} (${TREE3D_STAGE_NAMES[stage]})`;
    const growth = tree3dField('growthPreview');
    if (growth) growth.textContent = tree3dGrowthText(leafCount, thresholds, stage);
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

// ---------- 3D View & Zoom ----------
// A live preview of the 3D tree (the page with ?viewEditor=1: no automatic turn, no sound, zoom on) the admin
// turns and zooms; its view (window.esgTree3dView in the preview: zoom, azimuth, polar) is saved as a snapshot
// in tree3dParameters.savedViews, and the one chosen for the 3D screens is screenView ('' = the standard view).
// frontend/3dTree/view-settings.js shows it on the screens.

let tree3dViews = { saved: [], inUse: '' };
let tree3dViewTimer = null;

function useTree3dViews(settings) {
    tree3dViews = {
        saved: Array.isArray(settings?.savedViews) ? settings.savedViews : [],
        inUse: String(settings?.screenView || '')
    };
    renderTree3dViews();
}

function tree3dViewEditor() {
    try { return tree3dField('viewFrame')?.contentWindow?.esgTree3dView || null; } catch { return null; }
}

function describeTree3dView(view) {
    const degrees = Math.round(((Number(view.azimuth) * 180 / Math.PI) % 360 + 360) % 360);
    const height = Math.round(90 - Number(view.polar) * 180 / Math.PI);
    return `Zoom ${Math.round(Number(view.zoom) * 100)}% · ${degrees}° round · ${height}° up`;
}

function openTree3dViewEditor() {
    const frame = tree3dField('viewFrame');
    if (!frame) return;
    if (!frame.src) frame.src = '/3dTree/3dTree.html?viewEditor=1&clean=1';
    frame.hidden = false;
    tree3dField('viewOpen').hidden = true;
    window.clearInterval(tree3dViewTimer);
    tree3dViewTimer = window.setInterval(() => {
        const editor = tree3dViewEditor();
        const readout = tree3dField('viewReadout');
        if (editor && readout) readout.textContent = describeTree3dView(editor.get());
    }, 400);
}

function zoomTree3dView(factor) {
    const editor = tree3dViewEditor();
    if (editor) editor.zoomBy(factor);
    else showNotification('Show the 3D preview first.', 'info');
}

function standardTree3dView() {
    tree3dViewEditor()?.standard();
}

async function putTree3dViews(changes, message) {
    try {
        const saved = await putTree3dSettings(changes);
        if (saved) useTree3dViews(saved);
        if (message) showNotification(message, 'success');
    } catch (error) {
        showNotification(error.message || 'The views could not be saved.', 'error');
    }
}

async function saveTree3dSnapshot() {
    const editor = tree3dViewEditor();
    if (!editor) { showNotification('Show the 3D preview first, then frame the view and save it.', 'info'); return; }
    if (tree3dViews.saved.length >= 12) { showNotification('Up to 12 views can be saved: delete one first.', 'error'); return; }
    const view = editor.get();
    const nameField = tree3dField('viewName');
    const name = (nameField?.value || '').trim() || `View ${tree3dViews.saved.length + 1}`;
    const snapshot = {
        id: `view-${Date.now().toString(36)}`, name,
        zoom: Math.round(view.zoom * 1000) / 1000, azimuth: view.azimuth, polar: view.polar, savedAt: new Date().toISOString()
    };
    await putTree3dViews({ savedViews: [...tree3dViews.saved, snapshot] }, `"${name}" saved. Choose "Use on 3D screen" to show it on the screens.`);
    if (nameField) nameField.value = '';
}

function useTree3dView(id) {
    const view = tree3dViews.saved.find(item => item.id === id);
    putTree3dViews({ screenView: id }, id ? `The 3D screens now show "${view?.name || 'the view'}".` : 'The 3D screens now show the standard view.');
}

function loadTree3dView(id) {
    const view = tree3dViews.saved.find(item => item.id === id);
    const editor = tree3dViewEditor();
    if (!view) return;
    if (!editor) { openTree3dViewEditor(); showNotification('The preview is opening: press "Load in preview" again once it shows the tree.', 'info'); return; }
    editor.set(view);
}

function deleteTree3dView(id) {
    const view = tree3dViews.saved.find(item => item.id === id);
    if (!view || !window.confirm(`Delete the view "${view.name}"?${tree3dViews.inUse === id ? ' The 3D screens go back to the standard view.' : ''}`)) return;
    putTree3dViews({ savedViews: tree3dViews.saved.filter(item => item.id !== id), ...(tree3dViews.inUse === id ? { screenView: '' } : {}) }, `"${view.name}" deleted.`);
}

function renderTree3dViews() {
    const list = tree3dField('viewList');
    if (!list) return;
    list.replaceChildren();
    if (!tree3dViews.saved.length) {
        const empty = document.createElement('li');
        empty.className = 'view3d-empty';
        empty.textContent = 'No views saved yet: the 3D screens show the standard view.';
        list.appendChild(empty);
        return;
    }
    for (const view of tree3dViews.saved) {
        const item = document.createElement('li');
        item.className = `view3d-item${tree3dViews.inUse === view.id ? ' view3d-in-use' : ''}`;
        const head = document.createElement('div');
        head.className = 'view3d-item-head';
        const name = document.createElement('strong');
        name.textContent = view.name;
        head.appendChild(name);
        if (tree3dViews.inUse === view.id) {
            const badge = document.createElement('span');
            badge.className = 'view3d-badge';
            badge.textContent = 'On the 3D screens';
            head.appendChild(badge);
        }
        const meta = document.createElement('div');
        meta.className = 'view3d-meta';
        meta.textContent = describeTree3dView(view);
        const actions = document.createElement('div');
        actions.className = 'view3d-actions';
        const buttons = [
            ['Use on 3D screen', () => useTree3dView(view.id), tree3dViews.inUse === view.id],
            ['Load in preview', () => loadTree3dView(view.id), false],
            ['Delete', () => deleteTree3dView(view.id), false]
        ];
        for (const [label, action, disabled] of buttons) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `turn-preset${label === 'Delete' ? ' view3d-delete' : ''}`;
            button.textContent = label;
            button.disabled = disabled;
            button.addEventListener('click', action);
            actions.appendChild(button);
        }
        item.append(head, meta, actions);
        list.appendChild(item);
    }
}

async function loadTree3dSettings() {
    loadTree3dStage();
    if (!tree3dField('weatherSource')) return;
    try {
        const response = await fetch('/api/parameters');
        const data = await response.json();
        tree3dBadgeColours2d = { ...(data.parameters?.badgeLeafStyles?.colors || {}) };
        fillTree3dForm(data.parameters?.tree3dParameters);
        // The 3D tree shows as many leaves as the 2D tree's Maximum Visible Leaves.
        showTree3dMaxLeaves(data.parameters?.treeParameters?.leafFallThreshold);
        showTree3dShowcase(data.parameters?.treeParameters?.leafShowcaseSeconds);
    } catch (error) {
        console.error('Error loading 3D tree settings:', error);
        fillTree3dForm(null);
    }
    loadTree3dRainAreas();
}

document.addEventListener('DOMContentLoaded', () => {
    showTreeSettingsForMode(document.getElementById('param-treeDisplayMode')?.value);
    loadTree3dSettings();
    // The names' preview follows the look ("Match the look" writes by hand when glowing) and the new leaf colour.
    tree3dField('glowLook')?.addEventListener('change', updateTree3dNamePreview);
    tree3dField('leafNewSwatches')?.addEventListener('click', () => setTimeout(updateTree3dNamePreview));
});
