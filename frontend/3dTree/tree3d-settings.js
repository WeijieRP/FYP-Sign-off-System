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

const POLL_MS = 5000;
const DEFAULT_SUBTITLE = 'Terminalia catappa · A living river valley';
const DEFAULTS = {
  weatherSource: 'live', manualSky: 'day', manualRain: false, rainArea: 'all', riverLevelMode: 'auto',
  autoOrbit: true, soundEnabled: false, soundVolume: 78, showSoilPanel: false,
  showWeatherPanel: true, showRiverPanel: true, showControlsBar: true, showYearReview: true,
  gustRequestedAt: '', sunsetRequestedAt: '',
  showFeedbackLeaves: true, leafNewColor: '#7cb342', leafOldColor: '#1f5f2e', leafSide: 'both', leafNewHours: 24, leafScale: 1, maxLeaves: 15,
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
    applied.area = undefined; // choose the area again in live weather
  }

  // The area list arrives with the live weather feed, so this waits until the area is listed.
  if (settings.weatherSource === 'live' && applied.area !== settings.rainArea && controls.area) {
    const value = settings.rainArea === 'all' ? 'all' : `area:${settings.rainArea}`;
    if ([...controls.area.options].some(option => option.value === value)) {
      if (controls.area.value !== value) {
        controls.area.value = value;
        controls.area.dispatchEvent(new Event('change'));
      }
      applied.area = settings.rainArea;
    }
  }
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

// Browsers start sound only after someone touches the page (unless the kiosk browser allows it).
// If it did not start, the first touch or key press starts it.
function armSoundRetry() {
  if (soundRetryArmed) return;
  soundRetryArmed = true;
  const retry = () => {
    if (latest?.soundEnabled && !pressed(controls.sound) && !controls.sound.disabled) controls.sound.click();
    soundRetryArmed = false;
  };
  window.setTimeout(() => {
    if (!latest?.soundEnabled || pressed(controls.sound)) { soundRetryArmed = false; return; }
    window.addEventListener('pointerdown', retry, { once: true, capture: true });
    window.addEventListener('keydown', retry, { once: true, capture: true });
  }, 1500);
}

function runActions(settings) {
  const actions = { gust: settings.gustRequestedAt, sunset: settings.sunsetRequestedAt };
  if (lastActions === null) { lastActions = actions; return; }
  if (actions.gust && actions.gust !== lastActions.gust) controls.gust?.click();
  if (actions.sunset && actions.sunset !== lastActions.sunset) controls.sunset?.click();
  lastActions = actions;
}

function applyControls(settings) {
  if (!isReady()) return;
  applyWeather(settings);
  applyRiver(settings);
  applyToggle('orbit', controls.orbit, settings.autoOrbit);
  applySound(settings);
  applyToggle('soil', controls.soil, settings.showSoilPanel, 'aria-expanded');
  runActions(settings);
}

// ---------- Loading ----------

async function refresh() {
  try {
    const response = await fetch('/api/parameters', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.success) return;
    latest = withDefaults(data.parameters?.tree3dParameters);
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
window.setInterval(refresh, POLL_MS);
// Apply the scene settings as soon as the scene is running, without waiting for the next check.
if (root) {
  new MutationObserver(() => { if (latest && isReady()) applyControls(latest); })
    .observe(root, { attributes: true, attributeFilter: ['data-ready'] });
}
window.addEventListener('resize', () => { if (latest) placeTitleBox(latest.titleBox.position); });
