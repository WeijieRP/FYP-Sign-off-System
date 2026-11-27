// Owner: Role 2, Wei Jie.
// Settings for the 3D ESG Tree page (/3dTree), edited in Admin > Digital Tree Adjustment > 3D Tree Settings.
// Stored in parametersConfig.json as `tree3dParameters` and read by frontend/3dTree/tree3d-settings.js
// through the public /api/parameters. The defaults reproduce the 3D page as it looks without settings.
//
//   glowLook           the glowing look (the ESG Centre's glowing-tree concept): the scene at night, light
//                      streams in the tree, glowing leaves, rings of light and specks of light, with glowing
//                      feedback leaves and handwritten names (frontend/3dTree/glow-look.js); off shows the
//                      daylight river valley with natural leaves. The page reloads into the new look.
//   trunkGlow          in the glowing look, the green, blue and orange light streams on the trunk, branches and
//                      roots (on by default)
//   trunkGlowStrength  how thick and bright they are, 50 to 200 (percent; 100 by default)
//   weatherSource      'live' (Singapore weather feeds) or 'manual'
//   manualSky          time of day in manual weather: sunrise, day, sunset or night
//   manualRain         rain and thunder in manual weather
//   weatherSource      'live' is Automatic: the weather detected at Woodlands (WEATHER_AREA) as it is now
//   rainArea           always 'Woodlands' (WEATHER_AREA): the automatic weather is only ever Woodlands', so any
//                      other place sent (or saved before) is kept as Woodlands; no place outside it is offered
//   riverLevelMode     'auto' (follows the rain) or a fixed preview: normal, high or danger
//   autoOrbit          the automatic turn round the tree
//   orbitSeconds       how long one full turn takes, 30 seconds to 24 hours (86400, the default: 15 degrees an
//                      hour)
//   orbitDirection     which way the tree seems to turn: 'right' (the default) or 'left'
//   soundEnabled       river, wind, bird and weather sounds (the browser may need a first touch or
//                      Chrome's --autoplay-policy=no-user-gesture-required to start them)
//   soundVolume        0 to 100 (all the sound)
//   musicEnabled       a gentle background music with the river and bird sounds whenever the sound is on (on
//                      by default; original music composed by the 3D page itself: frontend/3dTree/background-music.js)
//   musicVolume        how loud that music is against the nature sounds, 0 to 100
//   musicStyle         the music's style (MUSIC_STYLES): 'kalimba' (Calm kalimba, the default), 'piano' (Soft
//                      piano), 'dreamy' (Dreamy pads) or 'musicbox' (Music box); all original, made by the page;
//                      or 'uploaded': the admin's own music (musicTrack), looped, instead of the page's music
//   musicTrack         the admin's uploaded music for 'uploaded' ('' for none yet): a file in
//                      assets/Tree/music (MUSIC_TRACK_FOLDER), uploaded in Admin > 3D Tree Settings > Sound
//                      (POST /api/admin/parameters/tree3d-music/upload); the ambient sounds still play with it
//   ambientRiver, ambientBirds, ambientWind, ambientRain, ambientInsects
//                      each ambient sound on or off (AMBIENT_SOUNDS): the flowing river, birds, the breeze, a
//                      gentle rain and night insects; the river, birds and breeze on by default
//   ambientRiverVolume and so on
//                      each one's volume, 0 to 100, within the Volume above
//   showSoilPanel      the 3D soil cutaway panel is open
//   savedViews         the admin's view snapshots (3D View & Zoom), up to MAX_SAVED_VIEWS: each { id, name, zoom
//                      (VIEW_ZOOM_MIN to VIEW_ZOOM_MAX: 1 is the standard framing, more is closer), azimuth (its
//                      angle round the tree, radians), polar (its height: 60 to 85 degrees from straight up, in
//                      radians), savedAt }
//   screenView         the snapshot every 3D screen shows (its id), or '' for the standard view
//   showWeatherPanel, showRiverPanel, showControlsBar, showYearReview
//                      which on-screen panels the page shows
//   gustRequestedAt, sunsetRequestedAt
//                      set by the admin's "Wind gust now" and "Play sunset now"; the page runs the
//                      action when the time changes
//   titleBox           the title card: the same settings as the 2D tree's title box, plus 'auto'
//                      position (the page's own layout: top centre, top left on a wall-shaped screen)
//   showFeedbackLeaves one leaf per feedback on the tree (the RainTree leaf model)
//   showLeafNames      the visitor's name on each leaf, as on the 2D tree
//   leafNameScroll     a name too long for its leaf shown in full, scrolling smoothly inside the leaf (on by
//                      default), instead of shortened with "…"; on the 2D and 3D trees
//   leafNameFont, leafNameWeight, leafNameColor, leafNameSize
//                      how the names are written: a font style (LEAF_NAME_FONTS; 'auto' is the look's own,
//                      handwriting when glowing, clean letters when natural), a weight (LEAF_NAME_WEIGHTS), any
//                      colour (white by default) and a size, 0.7 to 1.4 times the standard (larger names wrap
//                      onto more lines inside the leaf)
//   leafNewColor, leafOldColor
//                      leaf colours, greens only: a light green for new leaves and a dark green for older
//                      ones (LEAF_NEW_COLOURS / LEAF_OLD_COLOURS); a leaf counts as new for leafNewHours
//   leafSide           'both' (left and right leaves mixed, as on the 2D tree), 'left' or 'right'; a left
//                      leaf is the RainTree leaf model mirrored
//   leafNewHours       0 to 168 hours (to a few seconds, so minutes can be set): a leaf starts light (the
//                      new colour, or a light shade of its badge colour) and turns dark after this long
//   leafScale          size of the leaves on the tree, 0.4 to 2.5 times the standard size
//   (how many leaves: the same as the 2D tree, its treeParameters.leafFallThreshold "Maximum Visible Leaves")
//   vipLeafColor       VIP leaves' gold (VIP_LEAF_COLOURS); VIPs are the names in the admin's VIP Management
//   vipLeafScale       size of VIP leaves, 0.4 to 2.5 (2D: vipLeafDisplayScale)
//   vipLeafBrightness  how bright the gold VIP leaves are, with their gold pulse, glow and star, 30 to 120
//                      (percent; 70 by default, softer than at first (100), so the name reads on the gold)
//   vipGlow            the gold pulse around VIP leaves (2D: vipGoldPulse)
//   vipSparkle         the white star of light twinkling at a VIP leaf's tip (on by default)
//   vipTurn            VIP leaves turn gently from left to right and back on the tree (on by default)
//   vipNameOwnStyle    VIP names in their own style (off by default: written as the other names)
//   vipNameFont, vipNameWeight, vipNameColor, vipNameSize
//                      that style, with the same choices as the other names (leafNameFont and so on)
// 3D Tree Visualization Parameters (the 2D tree's Visualization Parameters, for the 3D tree):
//   leafAreaWidth, leafAreaHeight
//                      how much of the canopy new leaves may sit on, 30 to 100 (% of its width and height,
//                      around its middle; 2D: Leaf Canopy Width and Height)
//   leafAreaOffset     moves that area up (negative) or down, -40 to 40 (% of the canopy's height;
//                      2D: Canopy Top Offset)
//   leafRefreshMs      how often the 3D tree checks for new feedback, 5000 to 120000 ms (2D: Leaf Refresh
//                      Interval)
//   leafOpacity        0.1 to 1 (1 = fully opaque; 2D: Leaf Opacity)
//   leafAppearMs       how long a new leaf takes to fade in at the bottom middle, 100 to 5000 ms (2D: Leaf
//                      Animation Duration)
//   leafShowcaseSeconds how long a new leaf stays at the bottom middle before floating up, 0 to 30 seconds
//   leafFloatMs        how long it takes to float up to the tree, 2000 to 20000 ms
//   leafFallMs         how long the oldest leaf takes to fall, 500 to 10000 ms (2D: Leaf Fall Duration)
//   leafBatchMode      how new leaves arriving together are split into groups, shown one group after another
//                      side by side at the bottom of the screen, then joining the tree in no set order:
//                      'groups' (the default) into leafBatchCount groups, or 'size' into groups of up to
//                      leafBatchSize leaves; either way as evenly as they go (10 into 2 groups: 5 and 5)
//   leafBatchCount     how many groups, 1 to 10 (3 by default; fewer when fewer leaves arrive)
//   leafBatchSize      how many leaves in a group at most, 1 to 10 (3 by default)
//   badgeColours       leaves in their badge's colour instead of green (2D: Badge Leaf Styling), on by
//                      default: a light shade while new, then a dark shade of it after leafNewHours
//   badgeLeafColors    the colour for each badge (BADGE_KEYS), any colour as on the 2D tree; a badge left at
//                      its built-in colour here takes the 2D tree's colour (badgeLeafStyles.colors)
//   (Maximum Visible Leaves stays the 2D tree's treeParameters.leafFallThreshold, shared by both trees)

const SKIES = ['sunrise', 'day', 'sunset', 'night'];
// The background music's styles (frontend/3dTree/background-music.js MUSIC_STYLES) and the ambient sounds
// (frontend/3dTree/ambience.js AMBIENT_SOUNDS), each with its name for messages.
const MUSIC_STYLES = ['kalimba', 'piano', 'dreamy', 'musicbox', 'uploaded'];
// The automatic (live) weather's one place: Woodlands (frontend/3dTree/singapore-weather.js WEATHER_AREA).
const WEATHER_AREA = 'Woodlands';
// The admin's own background music: audio files uploaded to assets/Tree/music, served at /assets/Tree/music.
const MUSIC_TRACK_FOLDER = '/assets/Tree/music/';
const MUSIC_EXTENSIONS = ['.mp3', '.ogg', '.oga', '.wav', '.m4a', '.aac', '.webm', '.flac'];
const MUSIC_MAX_MB = 30;
const AMBIENT_SOUNDS = [['ambientRiver', 'River water'], ['ambientBirds', 'Birds'], ['ambientWind', 'Forest wind'],
  ['ambientRain', 'Gentle rain'], ['ambientInsects', 'Night insects']];
const { DEFAULT_SCREEN_SIZE, normalizeScreenSize } = require('./screenSize');
const MAX_SAVED_VIEWS = 12;
const VIEW_ZOOM_MIN = 0.5;
const VIEW_ZOOM_MAX = 2.5;
const VIEW_ID = /^[a-z0-9-]{4,40}$/;
const RIVER_MODES = ['auto', 'normal', 'high', 'danger'];
// The leaf colours the admin can choose: light greens for new leaves, dark greens for older leaves.
const LEAF_NEW_COLOURS = ['#7cb342', '#8bc34a', '#9ccc65', '#a4c639', '#66bb6a'];
const LEAF_OLD_COLOURS = ['#1f5f2e', '#2e7d32', '#1b5e20', '#33691e', '#2d5a27'];
const LEAF_SIDES = ['both', 'left', 'right'];
// The names' font styles and weights the admin can choose (frontend/3dTree/feedback-leaves.js NAME_FONTS).
const LEAF_NAME_FONTS = ['auto', 'elegant-script', 'handwriting', 'modern', 'rounded', 'classic-serif', 'typewriter'];
const LEAF_NAME_WEIGHTS = [400, 500, 600, 700, 800];
// Golds for VIP leaves.
const VIP_LEAF_COLOURS = ['#d4af37', '#ffd700', '#e6b422', '#f0c75e', '#b8860b'];
const TITLE_POSITIONS = ['auto', 'top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
// The badges a feedback leaf can carry (/api/tree badgeKey), with the 2D tree's default badge colours.
// A visitor who chose several pledge topics in the pledge form (so several badges) has one leaf, "Multiple
// pledges" (MULTI_PLEDGE_KEY: features/tree/routes.js), brown by default, a colour the admin can change.
const MULTI_PLEDGE_KEY = 'multi-pledge';
const MULTI_PLEDGE_COLOUR = '#8b5a2b';
const BADGE_KEYS = ['feedback-completer', 'climate-champion', 'renewable-innovator', 'sustainable-living-advocate',
  'ocean-guardian', 'governance-guardian', 'social-champion', MULTI_PLEDGE_KEY];
const DEFAULT_BADGE_LEAF_COLORS = Object.freeze({
  'feedback-completer': '#4a7c59',
  'climate-champion': '#0f766e',
  'renewable-innovator': '#f59e0b',
  'sustainable-living-advocate': '#16a34a',
  'ocean-guardian': '#0284c7',
  'governance-guardian': '#7c3aed',
  'social-champion': '#d97706',
  [MULTI_PLEDGE_KEY]: MULTI_PLEDGE_COLOUR
});

const DEFAULT_TITLE_BOX = Object.freeze({
  showTitleBox: true,
  titleText: 'ESG Tree',
  subtitleText: 'Terminalia catappa · A living river valley',
  opacity: 0.54,
  blur: 18,
  radius: 20,
  position: 'auto',
  paddingX: 22,
  paddingY: 12
});

const DEFAULT_TREE3D_PARAMETERS = Object.freeze({
  glowLook: true,
  trunkGlow: true,
  trunkGlowStrength: 100,
  weatherSource: 'live',
  manualSky: 'day',
  manualRain: false,
  rainArea: WEATHER_AREA,
  riverLevelMode: 'auto',
  autoOrbit: true,
  orbitSeconds: 86400,
  orbitDirection: 'right',
  soundEnabled: false,
  soundVolume: 78,
  musicEnabled: true,
  musicVolume: 45,
  musicStyle: 'kalimba',
  musicTrack: '',
  ambientRiver: true,
  ambientRiverVolume: 100,
  ambientBirds: true,
  ambientBirdsVolume: 100,
  ambientWind: true,
  ambientWindVolume: 100,
  ambientRain: false,
  ambientRainVolume: 60,
  ambientInsects: false,
  ambientInsectsVolume: 60,
  showSoilPanel: false,
  savedViews: [],
  screenView: '',
  screenSize: DEFAULT_SCREEN_SIZE, // the screen's shape (./screenSize.js): Auto fits the window
  showWeatherPanel: true,
  showRiverPanel: true,
  showControlsBar: true,
  showYearReview: true,
  gustRequestedAt: '',
  sunsetRequestedAt: '',
  showFeedbackLeaves: true,
  showLeafNames: true,
  leafNameScroll: true,
  leafNameFont: 'auto',
  leafNameWeight: 700,
  leafNameColor: '#ffffff',
  leafNameSize: 1,
  leafNewColor: '#7cb342',
  leafOldColor: '#1f5f2e',
  leafSide: 'both',
  leafNewHours: 24,
  leafScale: 1,
  vipLeafColor: '#d4af37',
  vipLeafScale: 1,
  vipLeafBrightness: 70,
  vipGlow: true,
  vipSparkle: true,
  vipTurn: true,
  vipNameOwnStyle: false,
  vipNameFont: 'auto',
  vipNameWeight: 700,
  vipNameColor: '#ffffff',
  vipNameSize: 1,
  leafAreaWidth: 100,
  leafAreaHeight: 100,
  leafAreaOffset: 0,
  leafRefreshMs: 5000,
  leafOpacity: 1,
  leafAppearMs: 900,
  leafShowcaseSeconds: 12,
  leafFloatMs: 7200,
  leafBatchMode: 'groups',
  leafBatchCount: 3,
  leafBatchSize: 3,
  leafFallMs: 4200,
  badgeColours: true,
  badgeLeafColors: DEFAULT_BADGE_LEAF_COLORS,
  titleBox: DEFAULT_TITLE_BOX
});

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function oneOf(value, allowed, name) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!allowed.includes(text)) throw badRequest(`${name} must be one of: ${allowed.join(', ')}`);
  return text;
}

function bool(value, name) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'false') return value === 'true';
  throw badRequest(`${name} must be true or false`);
}

function number(value, min, max, name) {
  const n = Number(value);
  if (value === '' || value === null || !Number.isFinite(n)) throw badRequest(`${name} must be a number`);
  return Math.min(max, Math.max(min, n));
}

function text(value, maxLength) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function colour(value, allowed, name) {
  const hex = String(value ?? '').trim().toLowerCase();
  if (!allowed.includes(hex)) throw badRequest(`${name} must be one of the offered greens: ${allowed.join(', ')}`);
  return hex;
}

function timestamp(value, name) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (Number.isNaN(Date.parse(raw))) throw badRequest(`${name} must be a date and time`);
  return new Date(raw).toISOString();
}

// Checks one save from the admin page and returns only the settings it contains, cleaned up.
// Unknown settings are dropped; a value of the wrong kind is a 400 error with a readable message.
function normalizeTree3dParameters(updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw badRequest('3D tree settings must be an object');
  }
  const has = key => Object.prototype.hasOwnProperty.call(updates, key);
  const out = {};

  if (has('glowLook')) out.glowLook = bool(updates.glowLook, 'Glowing look');
  if (has('trunkGlow')) out.trunkGlow = bool(updates.trunkGlow, 'Trunk glow');
  if (has('trunkGlowStrength')) out.trunkGlowStrength = Math.round(number(updates.trunkGlowStrength, 50, 200, 'Trunk glow strength'));
  if (has('weatherSource')) out.weatherSource = oneOf(updates.weatherSource, ['live', 'manual'], 'Weather source');
  if (has('manualSky')) out.manualSky = oneOf(updates.manualSky, SKIES, 'Time of day');
  if (has('manualRain')) out.manualRain = bool(updates.manualRain, 'Manual rain');
  if (has('rainArea')) out.rainArea = WEATHER_AREA; // only Woodlands: no place outside it
  if (has('riverLevelMode')) out.riverLevelMode = oneOf(updates.riverLevelMode, RIVER_MODES, 'River level');
  if (has('autoOrbit')) out.autoOrbit = bool(updates.autoOrbit, 'Auto orbit');
  if (has('orbitSeconds')) out.orbitSeconds = Math.round(number(updates.orbitSeconds, 30, 86400, 'Time for one full turn'));
  if (has('orbitDirection')) out.orbitDirection = oneOf(updates.orbitDirection, ['right', 'left'], 'Turn direction');
  if (has('soundEnabled')) out.soundEnabled = bool(updates.soundEnabled, 'Sound');
  if (has('soundVolume')) out.soundVolume = Math.round(number(updates.soundVolume, 0, 100, 'Volume'));
  if (has('musicEnabled')) out.musicEnabled = bool(updates.musicEnabled, 'Background music');
  if (has('musicVolume')) out.musicVolume = Math.round(number(updates.musicVolume, 0, 100, 'Music volume'));
  if (has('musicStyle')) out.musicStyle = oneOf(updates.musicStyle, MUSIC_STYLES, 'Music style');
  if (has('musicTrack')) out.musicTrack = musicTrackPath(updates.musicTrack);
  for (const [key, label] of AMBIENT_SOUNDS) {
    if (has(key)) out[key] = bool(updates[key], label);
    if (has(`${key}Volume`)) out[`${key}Volume`] = Math.round(number(updates[`${key}Volume`], 0, 100, `${label} volume`));
  }
  for (const key of ['showSoilPanel', 'showWeatherPanel', 'showRiverPanel', 'showControlsBar', 'showYearReview']) {
    if (has(key)) out[key] = bool(updates[key], key);
  }
  if (has('screenSize')) out.screenSize = normalizeScreenSize(updates.screenSize);
  if (has('savedViews')) {
    if (!Array.isArray(updates.savedViews)) throw badRequest('Saved views must be a list');
    if (updates.savedViews.length > MAX_SAVED_VIEWS) throw badRequest(`Up to ${MAX_SAVED_VIEWS} views can be saved`);
    const minPolar = (60 * Math.PI) / 180, maxPolar = (85 * Math.PI) / 180;
    out.savedViews = updates.savedViews.map((view, index) => {
      if (!view || typeof view !== 'object') throw badRequest(`Saved view ${index + 1} must be an object`);
      const id = String(view.id ?? '').trim().toLowerCase();
      if (!VIEW_ID.test(id)) throw badRequest(`Saved view ${index + 1} has no valid id`);
      const azimuth = number(view.azimuth, -1000, 1000, 'View angle');
      return {
        id,
        name: text(view.name, 60) || `View ${index + 1}`,
        zoom: Math.round(number(view.zoom, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX, 'View zoom') * 1000) / 1000,
        azimuth: Math.round(Math.atan2(Math.sin(azimuth), Math.cos(azimuth)) * 10000) / 10000, // -pi to pi
        polar: Math.round(number(view.polar, minPolar, maxPolar, 'View height') * 10000) / 10000,
        savedAt: timestamp(view.savedAt, 'View time') || new Date().toISOString(),
      };
    });
    if (new Set(out.savedViews.map(view => view.id)).size !== out.savedViews.length) throw badRequest('Each saved view needs its own id');
  }
  if (has('screenView')) {
    const id = String(updates.screenView ?? '').trim().toLowerCase();
    if (id && !VIEW_ID.test(id)) throw badRequest('The view in use must be a saved view or the standard view');
    out.screenView = id;
  }
  if (has('gustRequestedAt')) out.gustRequestedAt = timestamp(updates.gustRequestedAt, 'Wind gust time');
  if (has('sunsetRequestedAt')) out.sunsetRequestedAt = timestamp(updates.sunsetRequestedAt, 'Sunset time');
  if (has('showFeedbackLeaves')) out.showFeedbackLeaves = bool(updates.showFeedbackLeaves, 'Show leaves');
  if (has('showLeafNames')) out.showLeafNames = bool(updates.showLeafNames, 'Show names on leaves');
  if (has('leafNameScroll')) out.leafNameScroll = bool(updates.leafNameScroll, 'Scroll long names');
  // The names' style, and the VIP names' own (with the same choices).
  const nameStyle = (prefix, label) => {
    if (has(`${prefix}Font`)) out[`${prefix}Font`] = oneOf(updates[`${prefix}Font`], LEAF_NAME_FONTS, `${label} font style`);
    if (has(`${prefix}Weight`)) {
      const weight = Number(updates[`${prefix}Weight`]);
      if (!LEAF_NAME_WEIGHTS.includes(weight)) throw badRequest(`${label} font weight must be one of: ${LEAF_NAME_WEIGHTS.join(', ')}`);
      out[`${prefix}Weight`] = weight;
    }
    if (has(`${prefix}Color`)) {
      const hex = String(updates[`${prefix}Color`] ?? '').trim().toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(hex)) throw badRequest(`${label} colour must be a colour like #ffffff`);
      out[`${prefix}Color`] = hex;
    }
    if (has(`${prefix}Size`)) out[`${prefix}Size`] = Math.round(number(updates[`${prefix}Size`], 0.7, 1.4, `${label} font size`) * 100) / 100;
  };
  nameStyle('leafName', 'Name');
  if (has('vipNameOwnStyle')) out.vipNameOwnStyle = bool(updates.vipNameOwnStyle, 'VIP names in their own style');
  nameStyle('vipName', 'VIP name');
  if (has('leafNewColor')) out.leafNewColor = colour(updates.leafNewColor, LEAF_NEW_COLOURS, 'New leaf colour');
  if (has('leafOldColor')) out.leafOldColor = colour(updates.leafOldColor, LEAF_OLD_COLOURS, 'Older leaf colour');
  if (has('leafSide')) out.leafSide = oneOf(updates.leafSide, LEAF_SIDES, 'Leaf side');
  // Hours, to the minute or finer (the admin can enter minutes): 1 minute is about 0.017 hours.
  if (has('leafNewHours')) out.leafNewHours = Math.round(number(updates.leafNewHours, 0, 168, 'New leaf hours') * 1000) / 1000;
  if (has('leafScale')) out.leafScale = Math.round(number(updates.leafScale, 0.4, 2.5, 'Leaf scale') * 100) / 100;
  if (has('vipLeafColor')) out.vipLeafColor = colour(updates.vipLeafColor, VIP_LEAF_COLOURS, 'VIP leaf colour');
  if (has('vipLeafScale')) out.vipLeafScale = Math.round(number(updates.vipLeafScale, 0.4, 2.5, 'VIP leaf scale') * 100) / 100;
  if (has('vipLeafBrightness')) out.vipLeafBrightness = Math.round(number(updates.vipLeafBrightness, 30, 120, 'VIP leaf brightness'));
  if (has('vipGlow')) out.vipGlow = bool(updates.vipGlow, 'VIP gold glow');
  if (has('vipSparkle')) out.vipSparkle = bool(updates.vipSparkle, 'VIP leaf tip star');
  if (has('vipTurn')) out.vipTurn = bool(updates.vipTurn, 'VIP leaf turning');
  const whole = (key, min, max, name) => { if (has(key)) out[key] = Math.round(number(updates[key], min, max, name)); };
  whole('leafAreaWidth', 30, 100, 'Leaf area width');
  whole('leafAreaHeight', 30, 100, 'Leaf area height');
  whole('leafAreaOffset', -40, 40, 'Leaf area up/down');
  whole('leafRefreshMs', 5000, 120000, 'Leaf refresh interval');
  if (has('leafOpacity')) out.leafOpacity = Math.round(number(updates.leafOpacity, 0.1, 1, 'Leaf opacity') * 100) / 100;
  whole('leafAppearMs', 100, 5000, 'Leaf appear duration');
  if (has('leafShowcaseSeconds')) {
    out.leafShowcaseSeconds = Math.round(number(updates.leafShowcaseSeconds, 0, 30, 'Time at the bottom middle') * 10) / 10;
  }
  whole('leafFloatMs', 2000, 20000, 'Float-up duration');
  if (has('leafBatchMode')) out.leafBatchMode = oneOf(updates.leafBatchMode, ['groups', 'size'], 'Split new leaves');
  whole('leafBatchCount', 1, 10, 'Number of groups');
  whole('leafBatchSize', 1, 10, 'New leaves shown together');
  whole('leafFallMs', 500, 10000, 'Leaf fall duration');
  if (has('badgeColours')) out.badgeColours = bool(updates.badgeColours, 'Badge colours');
  if (has('badgeLeafColors')) {
    const given = updates.badgeLeafColors;
    if (!given || typeof given !== 'object' || Array.isArray(given)) throw badRequest('Badge leaf colours must be an object');
    out.badgeLeafColors = {};
    for (const key of BADGE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(given, key)) continue;
      const hex = String(given[key] ?? '').trim().toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(hex)) throw badRequest(`The ${key} badge colour must be a colour like #4a7c59`);
      out.badgeLeafColors[key] = hex;
    }
  }

  if (has('titleBox')) {
    const box = updates.titleBox;
    if (!box || typeof box !== 'object' || Array.isArray(box)) throw badRequest('Title box settings must be an object');
    const hasBox = key => Object.prototype.hasOwnProperty.call(box, key);
    const titleBox = {};
    if (hasBox('showTitleBox')) titleBox.showTitleBox = bool(box.showTitleBox, 'Display title box');
    if (hasBox('titleText')) titleBox.titleText = text(box.titleText, 80);
    if (hasBox('subtitleText')) titleBox.subtitleText = text(box.subtitleText, 160);
    if (hasBox('opacity')) titleBox.opacity = Math.round(number(box.opacity, 0, 1, 'Background opacity') * 100) / 100;
    if (hasBox('blur')) titleBox.blur = Math.round(number(box.blur, 0, 40, 'Blur'));
    if (hasBox('radius')) titleBox.radius = Math.round(number(box.radius, 0, 60, 'Border radius'));
    if (hasBox('position')) titleBox.position = oneOf(box.position, TITLE_POSITIONS, 'Position');
    if (hasBox('paddingX')) titleBox.paddingX = Math.round(number(box.paddingX, 0, 100, 'Horizontal padding'));
    if (hasBox('paddingY')) titleBox.paddingY = Math.round(number(box.paddingY, 0, 100, 'Vertical padding'));
    out.titleBox = titleBox;
  }
  return out;
}

// Applies cleaned-up changes to the stored settings, keeping everything the save did not mention.
// An uploaded music file's place, as saved in musicTrack: '' (none), or /assets/Tree/music/<file> with one of
// MUSIC_EXTENSIONS; nothing outside that folder.
function musicTrackPath(value) {
  const saved = String(value ?? '').trim();
  if (!saved) return '';
  const file = saved.startsWith(MUSIC_TRACK_FOLDER) ? saved.slice(MUSIC_TRACK_FOLDER.length) : '';
  const extension = (file.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(file) || file.includes('..') || !MUSIC_EXTENSIONS.includes(extension)) {
    throw badRequest(`Uploaded music must be a file in ${MUSIC_TRACK_FOLDER} (${MUSIC_EXTENSIONS.join(', ')})`);
  }
  return MUSIC_TRACK_FOLDER + file;
}

function mergeTree3dParameters(current, changes) {
  const base = { ...DEFAULT_TREE3D_PARAMETERS, ...(current || {}) };
  return {
    ...base,
    ...changes,
    badgeLeafColors: { ...DEFAULT_BADGE_LEAF_COLORS, ...(base.badgeLeafColors || {}), ...(changes.badgeLeafColors || {}) },
    titleBox: { ...DEFAULT_TITLE_BOX, ...(base.titleBox || {}), ...(changes.titleBox || {}) },
    rainArea: WEATHER_AREA // an older saved place (All Singapore, another area) becomes Woodlands
  };
}

module.exports = {
  LEAF_NEW_COLOURS,
  LEAF_OLD_COLOURS,
  VIP_LEAF_COLOURS,
  BADGE_KEYS,
  LEAF_NAME_FONTS,
  LEAF_NAME_WEIGHTS,
  DEFAULT_BADGE_LEAF_COLORS,
  DEFAULT_TREE3D_PARAMETERS,
  DEFAULT_TITLE_BOX,
  WEATHER_AREA,
  MULTI_PLEDGE_KEY,
  MULTI_PLEDGE_COLOUR,
  MUSIC_TRACK_FOLDER,
  MUSIC_EXTENSIONS,
  MUSIC_MAX_MB,
  musicTrackPath,
  normalizeTree3dParameters,
  mergeTree3dParameters
};
