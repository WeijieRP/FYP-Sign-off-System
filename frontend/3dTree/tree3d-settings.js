// Admin settings for the 3D ESG Tree (Admin > Digital Tree Adjustment > 3D Tree Settings).
// Reads `tree3dParameters` from /api/parameters every few seconds and applies them to this page:
//   - the title card (text, look and position, the same settings as the 2D tree's title box),
//   - which on-screen panels are shown,
//   - the scene controls (weather, rain area, river level, orbit, sound, volume, soil cutaway), and
//   - the one-off actions "Wind gust now" and "Play sunset now".
// The controls are applied by operating the page's own buttons and menus, so they behave exactly as
// if pressed on screen, also when their panels are hidden. A setting is applied when it changes, so
// someone using the on-screen controls is not overruled every few seconds.
// Backend defaults and checks: backend/features/parameters/tree3d.js.

import { onLiveUpdate, liveConnected } from './live-updates.js';

const POLL_MS = 5000;
const DEFAULT_SUBTITLE = 'Terminalia catappa · A living river valley';
const DEFAULTS = {
  glowLook: true, // the glowing look (glow-look.js); scene.js reloads the page when it changes
  weatherSource: 'live', manualSky: 'day', manualRain: false, rainArea: 'Woodlands', riverLevelMode: 'auto',
  autoOrbit: true, soundEnabled: false, soundVolume: 78, showSoilPanel: false,
  musicEnabled: true, musicVolume: 45, musicStyle: 'kalimba', // the gentle background music with the nature sounds (background-music.js)
  musicTrack: '', // the admin's uploaded music, for musicStyle 'uploaded' (assets/Tree/music)
  // The ambient sounds (ambience.js): the river, birds and breeze on, a gentle rain and night insects off.
  ambientRiver: true, ambientRiverVolume: 100, ambientBirds: true, ambientBirdsVolume: 100, ambientWind: true, ambientWindVolume: 100,
  ambientRain: false, ambientRainVolume: 60, ambientInsects: false, ambientInsectsVolume: 60,
  orbitSeconds: 24 * 60 * 60, orbitDirection: 'right', // one full turn a day, to the right (scene.js, tree-view.js)
  showWeatherPanel: true, showRiverPanel: true, showControlsBar: true, showYearReview: true,
  gustRequestedAt: '', sunsetRequestedAt: '',
  showFeedbackLeaves: true, leafNewColor: '#7cb342', leafOldColor: '#1f5f2e', leafSide: 'both', leafNewHours: 24,
  vipLeafColor: '#d4af37', vipLeafScale: 1, vipLeafBrightness: 70, vipGlow: true, vipSparkle: true, vipTurn: true, trunkGlow: true, trunkGlowStrength: 100, leafScale: 1, showLeafNames: true, leafNameScroll: true,
  leafNameFont: 'auto', leafNameWeight: 700, leafNameColor: '#ffffff', leafNameSize: 1, // the names on the leaves (feedback-leaves.js)
  vipNameOwnStyle: false, vipNameFont: 'auto', vipNameWeight: 700, vipNameColor: '#ffffff', vipNameSize: 1, // VIP names, if their own
  titleBox: {
    showTitleBox: true, titleText: 'ESG Tree', subtitleText: DEFAULT_SUBTITLE,
    opacity: 0.54, blur: 18, radius: 20, position: 'auto', paddingX: 22, paddingY: 12,
  },
};

const root = document.querySelector('.reserve');
const masthead = document.querySelector('.masthead');
const heading = masthead?.querySelector('h1');
const subtitle = masthead?.querySelector('.species');
const builtInSubtitleHtml = subtitle?.innerHTML || '';
const controls = {
  live: document.getElementById('live-weather'),
  rain: document.getElementById('rain-weather'),
  sunset: document.getElementById('play-sunset'),
  area: document.getElementById('weather-area'),
  river: document.getElementById('river-level-mode'),
  orbit: document.getElementById('slow-orbit'),
  sound: document.getElementById('sound'),
  volume: document.getElementById('volume'),
  gust: document.getElementById('gust'),
  soil: document.getElementById('soil-life'),
};

const applied = {};          // the last value of each setting that was applied
let latest = null;           // the latest settings from the server
const listeners = new Set(); // other parts of the page that use the settings (feedback-leaves.js)

// Calls `listener` with the settings now (when loaded) and after every check. Returns an unsubscribe.
export function onTree3dSettings(listener) {
  listeners.add(listener);
  if (latest) listener(latest);
  return () => listeners.delete(listener);
}
let lastActions = null;      // action times seen so far; the first ones only set the starting point
let soundRetryArmed = false;

const isReady = () => root?.dataset.ready === 'true';
// The admin's view editor (?viewEditor=1): the view holds still for framing, and plays no sound.
const viewEditor = new URLSearchParams(window.location.search).get('viewEditor') === '1';
// The pictures for the 2D tree's Natural and Digital styles (?capture2d=1, capture-2d.js): the tree in clear
// weather with the river at its normal level, no sound and no admin actions, and the page stays on the 3D tree
// even while the wall shows the 2D tree.
const capture2d = new URLSearchParams(window.location.search).get('capture2d') === '1';
const pressed = (button, attribute = 'aria-pressed') => button?.getAttribute(attribute) === 'true';

function withDefaults(saved) {
  const settings = { ...DEFAULTS, ...(saved || {}) };
  settings.titleBox = { ...DEFAULTS.titleBox, ...(saved?.titleBox || {}) };
  return settings;
}

// ---------- Title card ----------

function applyTitleBox(box) {
  if (!masthead || !heading) return;
  masthead.style.display = box.showTitleBox ? '' : 'none';

  const title = box.titleText || DEFAULTS.titleBox.titleText;
  const customSubtitle = box.subtitleText && box.subtitleText !== DEFAULT_SUBTITLE;
  const live = {
    title,
    subtitleHtml: customSubtitle ? escapeHtml(box.subtitleText) : builtInSubtitleHtml,
    label: `ESG Centre, ${title}`,
  };
  // While a year review is shown, the heading belongs to it; Year Review restores this one on Live.
  if (!document.body.classList.contains('year-review-mode')) {
    heading.textContent = live.title;
    if (subtitle) subtitle.innerHTML = live.subtitleHtml;
    masthead.setAttribute('aria-label', live.label);
  }
  document.dispatchEvent(new CustomEvent('esg-tree-title', { detail: live }));

  // The same look settings as the 2D title box, applied to this page's glass card.
  const opacity = Number(box.opacity);
  masthead.style.background = `linear-gradient(135deg,rgba(232,255,239,${(opacity * 0.3).toFixed(3)}),rgba(20,46,40,${opacity}) 68%)`;
  masthead.style.backdropFilter = `blur(${box.blur}px) saturate(150%)`;
  masthead.style.webkitBackdropFilter = `blur(${box.blur}px) saturate(150%)`;
  masthead.style.borderRadius = `${box.radius}px`;
  masthead.style.padding = `${box.paddingY}px ${box.paddingX}px`;
  placeTitleBox(box.position);
}

function placeTitleBox(position) {
  const style = masthead.style;
  for (const property of ['top', 'bottom', 'left', 'right', 'translate', 'transformOrigin']) style[property] = '';
  document.body.classList.remove('title-at-top-left', 'title-at-top-right', 'title-at-bottom');
  if (position === 'auto') return; // the page's own layout

  const [vertical, horizontal] = position.split('-');
  const edge = '22px';
  // At the bottom it sits above the controls bar and the Year Review button.
  style.top = vertical === 'top' ? '14px' : 'auto';
  style.bottom = vertical === 'top' ? 'auto' : '84px';
  if (horizontal === 'center') {
    style.left = '50%';
    style.right = 'auto';
    style.translate = '-50% 0';
  } else {
    style.left = horizontal === 'left' ? edge : 'auto';
    style.right = horizontal === 'right' ? edge : 'auto';
    style.translate = 'none';
  }
  style.transformOrigin = `${vertical} ${horizontal === 'center' ? 'center' : horizontal}`;

  // The river level and weather panels sit in the top corners: move the one in the way below the title.
  if (masthead.style.display === 'none') return;
  if (vertical === 'top' && horizontal !== 'center') {
    document.body.classList.add(`title-at-top-${horizontal}`);
    const bottom = masthead.getBoundingClientRect().bottom;
    document.body.style.setProperty('--title-clearance', `${Math.round(bottom + 12)}px`);
  } else if (vertical === 'bottom') {
    document.body.classList.add('title-at-bottom');
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// ---------- Panels ----------

function applyPanels(settings) {
  const body = document.body.classList;
  body.toggle('hide-weather-panel', !settings.showWeatherPanel);
  body.toggle('hide-river-panel', !settings.showRiverPanel);
  body.toggle('hide-controls-bar', !settings.showControlsBar);
  body.toggle('hide-year-review', !settings.showYearReview);
}

// ---------- Scene controls (once the scene is running and its controls are enabled) ----------

function applyWeather(settings) {
  const weather = [settings.weatherSource, settings.manualSky, settings.manualRain].join('|');
  if (applied.weather !== weather) {
    if (settings.weatherSource === 'live') {
      if (!pressed(controls.live)) controls.live?.click();
    } else {
      document.querySelector(`.weather-options [data-sky="${settings.manualSky}"]`)?.click();
      if (pressed(controls.rain) !== settings.manualRain) controls.rain?.click();
    }
    applied.weather = weather;
  }
  // The automatic weather's place is always Woodlands (singapore-weather.js WEATHER_AREA): rainArea is not used.
}

function applyRiver(settings) {
  if (applied.river === settings.riverLevelMode || !controls.river) return;
  controls.river.value = settings.riverLevelMode;
  controls.river.dispatchEvent(new Event('change'));
  applied.river = settings.riverLevelMode;
}

function applyToggle(name, button, wanted, attribute) {
  if (applied[name] === wanted || !button) return;
  if (pressed(button, attribute) !== wanted) button.click();
  applied[name] = wanted;
}

function applySound(settings) {
  if (applied.volume !== settings.soundVolume && controls.volume) {
    controls.volume.value = String(settings.soundVolume);
    controls.volume.dispatchEvent(new Event('input'));
    applied.volume = settings.soundVolume;
  }
  if (applied.sound === settings.soundEnabled || !controls.sound) return;
  applied.sound = settings.soundEnabled;
  if (pressed(controls.sound) !== settings.soundEnabled) controls.sound.click();
  if (settings.soundEnabled) armSoundRetry();
}

// Browsers start sound only after someone touches the page (unless the kiosk browser allows it: Chrome's
// --autoplay-policy=no-user-gesture-required). While the admin wants sound and it has not started, every touch,
// click or key press anywhere on the page tries again (it counts as the touch the browser waits for), also with
// the controls bar hidden, and a small note says so (#sound-hint). Once the sound has started this stops, so
// someone muting it on screen is not overruled.
const soundHint = document.getElementById('sound-hint');
const RETRY_EVENTS = ['pointerdown', 'keydown', 'touchend'];
function armSoundRetry() {
  if (soundRetryArmed || !controls.sound) return;
  soundRetryArmed = true;
  const done = () => !latest?.soundEnabled || pressed(controls.sound);
  const stop = () => {
    RETRY_EVENTS.forEach(type => window.removeEventListener(type, retry, true));
    soundRetryArmed = false;
    if (soundHint) soundHint.hidden = true;
  };
  function retry() {
    if (done()) { stop(); return; }
    if (!controls.sound.disabled) controls.sound.click();
  }
  RETRY_EVENTS.forEach(type => window.addEventListener(type, retry, true));
  const check = () => {
    if (!soundRetryArmed) return;
    if (done()) { stop(); return; }
    if (soundHint && !controls.sound.disabled) soundHint.hidden = false; // tried, and waiting for a touch
    window.setTimeout(check, 1000);
  };
  window.setTimeout(check, 2500);
}

function runActions(settings) {
  const actions = { gust: settings.gustRequestedAt, sunset: settings.sunsetRequestedAt };
  if (lastActions === null) { lastActions = actions; return; }
  if (actions.gust && actions.gust !== lastActions.gust) controls.gust?.click();
  if (actions.sunset && actions.sunset !== lastActions.sunset) controls.sunset?.click();
  lastActions = actions;
}

function applyControls(settings) {
  if (!isReady() || capture2d) return;
  applyWeather(settings);
  applyRiver(settings);
  if (!viewEditor) {
    applyToggle('orbit', controls.orbit, settings.autoOrbit);
    applySound(settings);
  }
  applyToggle('soil', controls.soil, settings.showSoilPanel, 'aria-expanded');
  runActions(settings);
}

// ---------- Loading ----------

async function refresh() {
  try {
    const response = await fetch('/api/parameters', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.success) return;
    // The admin chose the 2D tree for the wall: go straight to it.
    if (data.parameters?.treeParameters?.treeDisplayMode === '2d' && !viewEditor && !capture2d) {
      window.location.replace(`/tree${window.location.search}`);
      return;
    }
    latest = withDefaults(data.parameters?.tree3dParameters);
    // The 3D tree shows the same leaves as the 2D tree (feedback-leaves.js): its "Maximum Visible Leaves"
    // and growth stage come from the 2D tree's settings.
    const tree2d = data.parameters?.treeParameters || {};
    const progress = Number(tree2d.treeStageAuto?.progress);
    latest.tree2d = {
      leafFallThreshold: Math.max(1, Number(tree2d.leafFallThreshold) || 15),
      treeStage: Math.round(Number(tree2d.treeStage) || 0),
      // Time at the bottom middle, shared with the 2D tree (12 seconds when unset): how long a new feedback's
      // leaf stays at the bottom middle of the screen before it floats up (feedback-leaves.js).
      leafShowcaseSeconds: tree2d.leafShowcaseSeconds === undefined || tree2d.leafShowcaseSeconds === null
        || tree2d.leafShowcaseSeconds === '' || !Number.isFinite(Number(tree2d.leafShowcaseSeconds))
        ? 12 : Math.min(30, Math.max(0, Number(tree2d.leafShowcaseSeconds))),
      // In Auto, how far the tree has grown through its stage (0 to 1), so it grows a little with every leaf
      // (tree-growth.js); null in Manual (the stage's tree shows full). As tree-stage.js growthProgress.
      growth: tree2d.treeStageMode === 'auto' && tree2d.treeStageAuto && Number.isFinite(progress)
        ? Math.max(0, Math.min(1, progress)) : null,
      // The 2D tree's badge colours (Badge Leaf Styling), for any badge the 3D settings leave as built in.
      badgeColors: { ...(data.parameters?.badgeLeafStyles?.colors || {}) },
    };
    applyTitleBox(latest.titleBox);
    applyPanels(latest);
    applyControls(latest);
    for (const listener of listeners) {
      try { listener(latest); } catch (error) { console.warn('A 3D settings listener failed.', error); }
    }
  } catch (error) {
    console.warn('3D tree settings could not be loaded; the page keeps its current settings.', error);
  }
}

refresh();
// The admin's settings, and in Auto the growth stage that new leaves move on, come at once: the server tells the
// page when settings are saved or the tree's data changes (live-updates.js). The check every POLL_MS stays,
// every SETTINGS_FALLBACK_MS while the live connection is open.
const SETTINGS_FALLBACK_MS = 30000;
let lastSettingsCheck = Date.now();
const checkSettings = () => { lastSettingsCheck = Date.now(); refresh(); };
window.setInterval(() => {
  if (!liveConnected() || Date.now() - lastSettingsCheck >= SETTINGS_FALLBACK_MS) checkSettings();
}, POLL_MS);
onLiveUpdate('settings', checkSettings);
onLiveUpdate('tree', checkSettings);
onLiveUpdate('ready', checkSettings);
// Apply the scene settings as soon as the scene is running, without waiting for the next check.
if (root) {
  new MutationObserver(() => { if (latest && isReady()) applyControls(latest); })
    .observe(root, { attributes: true, attributeFilter: ['data-ready'] });
}
window.addEventListener('resize', () => { if (latest) placeTitleBox(latest.titleBox.position); });
