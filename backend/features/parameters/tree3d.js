// Owner: Role 2, Wei Jie.
// Settings for the 3D ESG Tree page (/3dTree), edited in Admin > Digital Tree Adjustment > 3D Tree Settings.
// Stored in parametersConfig.json as `tree3dParameters` and read by frontend/3dTree/tree3d-settings.js
// through the public /api/parameters. The defaults reproduce the 3D page as it looks without settings.
//
//   weatherSource      'live' (Singapore weather feeds) or 'manual'
//   manualSky          time of day in manual weather: sunrise, day, sunset or night
//   manualRain         rain and thunder in manual weather
//   rainArea           live weather area: 'all' for all of Singapore, or an area name from the feed
//   riverLevelMode     'auto' (follows the rain) or a fixed preview: normal, high or danger
//   autoOrbit          the slow automatic orbit around the tree (15 degrees per hour)
//   soundEnabled       river, wind, bird and weather sounds (the browser may need a first touch or
//                      Chrome's --autoplay-policy=no-user-gesture-required to start them)
//   soundVolume        0 to 100
//   showSoilPanel      the 3D soil cutaway panel is open
//   showWeatherPanel, showRiverPanel, showControlsBar, showYearReview
//                      which on-screen panels the page shows
//   gustRequestedAt, sunsetRequestedAt
//                      set by the admin's "Wind gust now" and "Play sunset now"; the page runs the
//                      action when the time changes
//   titleBox           the title card: the same settings as the 2D tree's title box, plus 'auto'
//                      position (the page's own layout: top centre, top left on a wall-shaped screen)
//   showFeedbackLeaves one leaf per feedback on the tree (the RainTree leaf model)
//   showLeafNames      the visitor's name on each leaf, as on the 2D tree
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
//   vipGlow            the gold pulse around VIP leaves (2D: vipGoldPulse)
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
//   badgeColours       leaves in their badge's colour instead of green (2D: Badge Leaf Styling): a light
//                      shade while new, then a dark shade of it after leafNewHours
//   badgeLeafColors    the colour for each badge (BADGE_KEYS), any colour as on the 2D tree
//   (Maximum Visible Leaves stays the 2D tree's treeParameters.leafFallThreshold, shared by both trees)

const SKIES = ['sunrise', 'day', 'sunset', 'night'];
const RIVER_MODES = ['auto', 'normal', 'high', 'danger'];
// The leaf colours the admin can choose: light greens for new leaves, dark greens for older leaves.
const LEAF_NEW_COLOURS = ['#7cb342', '#8bc34a', '#9ccc65', '#a4c639', '#66bb6a'];
const LEAF_OLD_COLOURS = ['#1f5f2e', '#2e7d32', '#1b5e20', '#33691e', '#2d5a27'];
const LEAF_SIDES = ['both', 'left', 'right'];
// Golds for VIP leaves.
const VIP_LEAF_COLOURS = ['#d4af37', '#ffd700', '#e6b422', '#f0c75e', '#b8860b'];
const TITLE_POSITIONS = ['auto', 'top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
// The badges a feedback leaf can carry (/api/tree badgeKey), with the 2D tree's default badge colours.
const BADGE_KEYS = ['feedback-completer', 'climate-champion', 'renewable-innovator', 'sustainable-living-advocate',
  'ocean-guardian', 'governance-guardian', 'social-champion'];
const DEFAULT_BADGE_LEAF_COLORS = Object.freeze({
  'feedback-completer': '#4a7c59',
  'climate-champion': '#0f766e',
  'renewable-innovator': '#f59e0b',
  'sustainable-living-advocate': '#16a34a',
  'ocean-guardian': '#0284c7',
  'governance-guardian': '#7c3aed',
  'social-champion': '#d97706'
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
  showYearReview: true,
  gustRequestedAt: '',
  sunsetRequestedAt: '',
  showFeedbackLeaves: true,
  showLeafNames: true,
  leafNewColor: '#7cb342',
  leafOldColor: '#1f5f2e',
  leafSide: 'both',
  leafNewHours: 24,
  leafScale: 1,
  vipLeafColor: '#d4af37',
  vipLeafScale: 1,
  vipGlow: true,
  leafAreaWidth: 100,
  leafAreaHeight: 100,
  leafAreaOffset: 0,
  leafRefreshMs: 5000,
  leafOpacity: 1,
  leafAppearMs: 900,
  leafShowcaseSeconds: 12,
  leafFloatMs: 7200,
  leafFallMs: 4200,
  badgeColours: false,
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

  if (has('weatherSource')) out.weatherSource = oneOf(updates.weatherSource, ['live', 'manual'], 'Weather source');
  if (has('manualSky')) out.manualSky = oneOf(updates.manualSky, SKIES, 'Time of day');
  if (has('manualRain')) out.manualRain = bool(updates.manualRain, 'Manual rain');
  if (has('rainArea')) out.rainArea = text(updates.rainArea, 80) || 'all';
  if (has('riverLevelMode')) out.riverLevelMode = oneOf(updates.riverLevelMode, RIVER_MODES, 'River level');
  if (has('autoOrbit')) out.autoOrbit = bool(updates.autoOrbit, 'Auto orbit');
  if (has('soundEnabled')) out.soundEnabled = bool(updates.soundEnabled, 'Sound');
  if (has('soundVolume')) out.soundVolume = Math.round(number(updates.soundVolume, 0, 100, 'Volume'));
  for (const key of ['showSoilPanel', 'showWeatherPanel', 'showRiverPanel', 'showControlsBar', 'showYearReview']) {
    if (has(key)) out[key] = bool(updates[key], key);
  }
  if (has('gustRequestedAt')) out.gustRequestedAt = timestamp(updates.gustRequestedAt, 'Wind gust time');
  if (has('sunsetRequestedAt')) out.sunsetRequestedAt = timestamp(updates.sunsetRequestedAt, 'Sunset time');
  if (has('showFeedbackLeaves')) out.showFeedbackLeaves = bool(updates.showFeedbackLeaves, 'Show leaves');
  if (has('showLeafNames')) out.showLeafNames = bool(updates.showLeafNames, 'Show names on leaves');
  if (has('leafNewColor')) out.leafNewColor = colour(updates.leafNewColor, LEAF_NEW_COLOURS, 'New leaf colour');
  if (has('leafOldColor')) out.leafOldColor = colour(updates.leafOldColor, LEAF_OLD_COLOURS, 'Older leaf colour');
  if (has('leafSide')) out.leafSide = oneOf(updates.leafSide, LEAF_SIDES, 'Leaf side');
  // Hours, to the minute or finer (the admin can enter minutes): 1 minute is about 0.017 hours.
  if (has('leafNewHours')) out.leafNewHours = Math.round(number(updates.leafNewHours, 0, 168, 'New leaf hours') * 1000) / 1000;
  if (has('leafScale')) out.leafScale = Math.round(number(updates.leafScale, 0.4, 2.5, 'Leaf scale') * 100) / 100;
  if (has('vipLeafColor')) out.vipLeafColor = colour(updates.vipLeafColor, VIP_LEAF_COLOURS, 'VIP leaf colour');
  if (has('vipLeafScale')) out.vipLeafScale = Math.round(number(updates.vipLeafScale, 0.4, 2.5, 'VIP leaf scale') * 100) / 100;
  if (has('vipGlow')) out.vipGlow = bool(updates.vipGlow, 'VIP gold glow');
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
function mergeTree3dParameters(current, changes) {
  const base = { ...DEFAULT_TREE3D_PARAMETERS, ...(current || {}) };
  return {
    ...base,
    ...changes,
    badgeLeafColors: { ...DEFAULT_BADGE_LEAF_COLORS, ...(base.badgeLeafColors || {}), ...(changes.badgeLeafColors || {}) },
    titleBox: { ...DEFAULT_TITLE_BOX, ...(base.titleBox || {}), ...(changes.titleBox || {}) }
  };
}

module.exports = {
  LEAF_NEW_COLOURS,
  LEAF_OLD_COLOURS,
  VIP_LEAF_COLOURS,
  BADGE_KEYS,
  DEFAULT_BADGE_LEAF_COLORS,
  DEFAULT_TREE3D_PARAMETERS,
  DEFAULT_TITLE_BOX,
  normalizeTree3dParameters,
  mergeTree3dParameters
};
