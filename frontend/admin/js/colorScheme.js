// Owner: Role 3, Jun Kai.
// Light / Dark mode for the whole admin page (supervisor meeting 04, admin UI review): one icon in the top bar, a moon in
// light mode and a sun in dark mode; the choice is kept per browser. Loaded in <head> right after admin.css, so a dark
// page never flashes white first.
// How dark mode is made: the theme variables get dark values in admin.css (html[data-theme="dark"]), and every rule of
// admin.css that sets a colour gets a twin under html[data-theme="dark"] with light surfaces turned dark and dark text
// turned light. Built from the stylesheet itself when the page loads, so pages added later follow without extra CSS
// and no text is left dark on a dark background. Inline colours set by page scripts keep their own colours.
// <Jun Kai start>
const ADMIN_SCHEME_KEY = 'adminColorScheme';
const ADMIN_SCHEME_STYLE_ID = 'admin-dark-styles';
const ADMIN_SCHEME_PREFIX = 'html[data-theme="dark"]';
const ADMIN_NAMED_COLORS = {
    white: [255, 255, 255], black: [0, 0, 0], whitesmoke: [245, 245, 245], ghostwhite: [248, 248, 255], snow: [255, 250, 250],
    gainsboro: [220, 220, 220], lightgray: [211, 211, 211], lightgrey: [211, 211, 211], silver: [192, 192, 192], gray: [128, 128, 128],
    grey: [128, 128, 128], darkgray: [169, 169, 169], darkgrey: [169, 169, 169], dimgray: [105, 105, 105], aliceblue: [240, 248, 255],
    ivory: [255, 255, 240], beige: [245, 245, 220], linen: [250, 240, 230], lavender: [230, 230, 250], azure: [240, 255, 255],
    honeydew: [240, 255, 240], mintcream: [245, 255, 250], seashell: [255, 245, 238], floralwhite: [255, 250, 240], oldlace: [253, 245, 230]
};
const ADMIN_VAR_SHORTHANDS = [['background', 'bg'], ['border', 'border'], ['border-color', 'border'], ['border-top', 'border'], ['border-right', 'border'], ['border-bottom', 'border'], ['border-left', 'border'], ['outline', 'border']];
// <Jun Kai/> Previews of screens that have no dark mode (the kiosk screens, the emails) keep their light look in dark mode,
// like the real screens (user, 26 Nov 2026: "if it does not have a dark mode like gmail, leave it"). They are left out of
// the dark twins, get the light theme variables back and their inline colours stay. A new preview of such a screen
// only needs the class ui-light-only.
const ADMIN_LIGHT_ONLY = ['.ui-light-only', '.pa-device', '.pa-landing-preview', '.feedback-style-preview', '#questions-preview-screen',
    '#fm-preview', '#qr-preview', '#pt-preview', '.pulse-launch-section', '#be-preview', '#email-preview-frame', '#dt-tree-frame'];
const ADMIN_LIGHT_ONLY_LIST = ADMIN_LIGHT_ONLY.join(', ');
// zero specificity (:where), so the twins keep the same order of strength among themselves
const ADMIN_LIGHT_ONLY_GUARD = `:not(:where(${ADMIN_LIGHT_ONLY.map((s) => `${s}, ${s} *`).join(', ')}))`;
const ADMIN_COLOR_TOKEN = new RegExp(`#[0-9a-fA-F]{3,8}\\b|rgba?\\([^)]*\\)|\\b(?:${Object.keys(ADMIN_NAMED_COLORS).join('|')})\\b`, 'g');

function adminSchemeSaved() {
    try { return localStorage.getItem(ADMIN_SCHEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

// '#fff', '#e2e8f0aa', 'rgb(1, 2, 3)', 'rgba(1 2 3 / 50%)', 'white' -> { r, g, b, a }, or null
function adminParseColor(token) {
    const t = String(token).trim().toLowerCase();
    if (ADMIN_NAMED_COLORS[t]) { const [r, g, b] = ADMIN_NAMED_COLORS[t]; return { r, g, b, a: 1 }; }
    if (t[0] === '#') {
        let hex = t.slice(1);
        if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
        if (hex.length !== 6 && hex.length !== 8) return null;
        const n = (i) => parseInt(hex.slice(i, i + 2), 16);
        return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
    }
    const m = t.match(/^rgba?\(([^)]*)\)$/);
    if (!m) return null;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channel = (v) => (v.endsWith('%') ? (parseFloat(v) * 255) / 100 : parseFloat(v));
    const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    const [r, g, b] = parts.slice(0, 3).map(channel);
    return [r, g, b, alpha].every(Number.isFinite) ? { r, g, b, a: alpha } : null;
}

function adminRgbToHsl({ r, g, b }) {
    const [R, G, B] = [r, g, b].map((v) => v / 255);
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    return { h: h / 6, s, l };
}

function adminHslToCss(h, s, l, a) {
    const hue = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    let r = l;
    let g = l;
    let b = l;
    if (s) {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3);
    }
    const [R, G, B] = [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
    return a < 1 ? `rgba(${R}, ${G}, ${B}, ${Math.round(a * 1000) / 1000})` : `rgb(${R}, ${G}, ${B})`;
}

// One colour for dark mode. kind: 'bg' (light surfaces become dark, keeping a hint of their hue), 'text' (dark text
// becomes light), 'border' (light lines become dim). Mid colours (a blue button, a red badge) stay as they are.
function adminDarkColor(token, kind) {
    const c = adminParseColor(token);
    if (!c) return token;
    const { h, s, l } = adminRgbToHsl(c);
    if (kind === 'bg' && l > 0.62) return adminHslToCss(h, s * 0.5, 0.075 + (1 - l) * 0.85, c.a);
    if (kind === 'text' && l < 0.6) return adminHslToCss(h, Math.min(s, 0.75), 0.93 - l * 0.5, c.a);
    if (kind === 'border' && l > 0.6) return adminHslToCss(h, s * 0.4, 0.2 + (1 - l) * 0.45, c.a);
    return token;
}

function adminColorKind(prop) {
    if (prop === 'background-color' || prop === 'background-image') return 'bg';
    if (prop === 'color' || prop === '-webkit-text-fill-color' || prop === 'caret-color' || prop === 'fill' || prop === 'stroke'
        || prop === 'text-decoration-color' || prop === 'column-rule-color' || prop === 'accent-color') return 'text';
    if ((prop.startsWith('border') && prop.endsWith('-color')) || prop === 'outline-color') return 'border';
    return null;
}

// "a, b:is(c, d)" -> the same selectors under html[data-theme="dark"]
function adminDarkSelector(selector) {
    const list = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < selector.length; i++) {
        const ch = selector[i];
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        else if (ch === ',' && depth === 0) { list.push(selector.slice(start, i)); start = i + 1; }
    }
    list.push(selector.slice(start));
    return list.map((s) => {
        const t = s.trim();
        if (/^:root\b/.test(t)) return t.replace(/^:root/, ':root[data-theme="dark"]');
        if (/^html\b/i.test(t)) return t.replace(/^html/i, ADMIN_SCHEME_PREFIX);
        return `${ADMIN_SCHEME_PREFIX} ${adminLightOnlyGuard(t)}`;
    }).join(', ');
}

// <Jun Kai/> "a .b::before" -> "a .b:not(:where(light only previews))::before": a pseudo-element has to stay last
function adminLightOnlyGuard(selector) {
    let depth = 0;
    for (let i = 0; i < selector.length - 1; i++) {
        const ch = selector[i];
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        else if (depth === 0 && ch === ':' && selector[i + 1] === ':') return selector.slice(0, i) + ADMIN_LIGHT_ONLY_GUARD + selector.slice(i);
    }
    return selector + ADMIN_LIGHT_ONLY_GUARD;
}

// <Jun Kai/> The light value of every theme variable that dark mode changes, for the light only previews: the variables
// of :root (light) and of html[data-theme="dark"] / :root[data-theme="dark"] (dark) in admin.css
function adminLightOnlyRule(rules) {
    const light = new Map();
    const darkened = new Set();
    for (const rule of rules) {
        if (rule.type !== 1) continue;
        const sel = rule.selectorText.trim();
        const isLight = sel === ':root' || sel === 'html';
        const isDark = sel === ADMIN_SCHEME_PREFIX || sel === ':root[data-theme="dark"]';
        if (!isLight && !isDark) continue;
        for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i];
            if (!prop.startsWith('--')) continue;
            if (isLight) light.set(prop, rule.style.getPropertyValue(prop).trim());
            else darkened.add(prop);
        }
    }
    const vars = [...darkened].filter((prop) => light.has(prop)).map((prop) => `${prop}: ${light.get(prop)}`);
    return `${ADMIN_SCHEME_PREFIX} :is(${ADMIN_LIGHT_ONLY_LIST}) { color-scheme: light; ${vars.map((v) => v + '; ').join('')}color: var(--theme-text-color); }`;
}

// The dark twin of one style rule: every colour declaration, changed or not, and the background's repeat, position
// and size, so the cascade between rules stays the same as in light mode (a later, more specific rule still wins).
// '' when the rule sets none of them.
function adminDarkRule(rule) {
    if (!rule.selectorText || rule.selectorText.includes('data-theme')) return '';
    // the Style & Theme Settings preview shows the light theme being edited, so it keeps its colours
    if (/\.preview-(card|content|btn-primary|btn-secondary)\b/.test(rule.selectorText)) return '';
    const parts = [];
    for (let i = 0; i < rule.style.length; i++) {
        const prop = rule.style[i];
        const kind = adminColorKind(prop);
        if (!kind) continue;
        const value = rule.style.getPropertyValue(prop);
        if (!value) continue;
        const dark = value.replace(ADMIN_COLOR_TOKEN, (token) => adminDarkColor(token, kind));
        parts.push(`${prop}: ${dark}${rule.style.getPropertyPriority(prop) ? ' !important' : ''}`);
    }
    // a shorthand written with var() ("background: var(--accent)") leaves its longhands empty in the stylesheet
    // object, so it is copied whole; without it an older rule's twin would win over it
    for (const [shorthand, kind] of ADMIN_VAR_SHORTHANDS) {
        const value = rule.style.getPropertyValue(shorthand);
        if (!value || !value.includes('var(')) continue;
        const dark = value.replace(ADMIN_COLOR_TOKEN, (token) => adminDarkColor(token, kind));
        parts.push(`${shorthand}: ${dark}${rule.style.getPropertyPriority(shorthand) ? ' !important' : ''}`);
    }
    // the background's repeat, position and size come after the shorthand, as in the rule: a twin's "background:"
    // resets them, so every rule that sets them gets a twin too (the arrow of every list was tiled across the field)
    for (let i = 0; i < rule.style.length; i++) {
        const prop = rule.style[i];
        if (!prop.startsWith('background-') || adminColorKind(prop)) continue;
        const value = rule.style.getPropertyValue(prop);
        if (value) parts.push(`${prop}: ${value}${rule.style.getPropertyPriority(prop) ? ' !important' : ''}`);
    }
    return parts.length ? `${adminDarkSelector(rule.selectorText)} { ${parts.join('; ')}; }` : '';
}

function adminDarkRules(rules) {
    const out = [];
    for (const rule of rules) {
        if (rule.type === 1) {
            const css = adminDarkRule(rule);
            if (css) out.push(css);
        } else if (rule.type === 4 || rule.type === 12) {
            const inner = adminDarkRules(rule.cssRules);
            if (inner.length) out.push(`@${rule.type === 4 ? 'media' : 'supports'} ${rule.type === 4 ? rule.media.mediaText : rule.conditionText} { ${inner.join(' ')} }`);
        }
    }
    return out;
}

// Built once per page load from admin.css (other stylesheets, such as the CDN ones, cannot be read and are left out)
function adminBuildDarkStyles() {
    if (document.getElementById(ADMIN_SCHEME_STYLE_ID)) return;
    const css = [];
    for (const sheet of document.styleSheets) {
        if (!sheet.href || !/\/admin\/admin\.css(\?|$)/.test(sheet.href)) continue;
        try {
            css.push(...adminDarkRules(sheet.cssRules));
            css.push(adminLightOnlyRule(sheet.cssRules)); // <Jun Kai/> last, so the light only previews keep the light variables
        } catch (error) { console.warn('[dark mode] admin.css could not be read:', error.message); }
    }
    const style = document.createElement('style');
    style.id = ADMIN_SCHEME_STYLE_ID;
    style.textContent = css.join('\n');
    document.head.appendChild(style);
}

// Colours that page scripts write into style="" get the same treatment while dark mode is on. The light value is kept
// for each element and put back when light mode returns; a script that writes a new colour later is followed too.
const adminInlineLight = new WeakMap(); // element -> { property: { light, dark, priority } }
const adminInlineTouched = new Set();
let adminInlineObserver = null;

function adminDarkInline(el) {
    const style = el && el.style;
    if (!style || !style.length || el.closest(`.preview-content, ${ADMIN_LIGHT_ONLY_LIST}`)) return; // <Jun Kai/> light only previews too
    let saved = adminInlineLight.get(el);
    for (let i = 0; i < style.length; i++) {
        const prop = style[i];
        const kind = adminColorKind(prop);
        if (!kind) continue;
        const value = style.getPropertyValue(prop);
        if (saved && saved[prop] && saved[prop].dark === value) continue;
        const dark = value.replace(ADMIN_COLOR_TOKEN, (token) => adminDarkColor(token, kind));
        if (dark === value) continue;
        if (!saved) { saved = {}; adminInlineLight.set(el, saved); adminInlineTouched.add(el); }
        saved[prop] = { light: value, dark, priority: style.getPropertyPriority(prop) };
        style.setProperty(prop, dark, saved[prop].priority);
    }
}

function adminDarkInlineTree(node) {
    if (!node || node.nodeType !== 1) return;
    adminDarkInline(node);
    node.querySelectorAll('[style]').forEach(adminDarkInline);
}

function adminWatchInline(dark) {
    if (!document.body) return;
    if (dark) {
        adminDarkInlineTree(document.body);
        if (!adminInlineObserver) {
            adminInlineObserver = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    if (m.type === 'attributes') adminDarkInline(m.target);
                    else m.addedNodes.forEach(adminDarkInlineTree);
                }
            });
        }
        adminInlineObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
        return;
    }
    if (adminInlineObserver) adminInlineObserver.disconnect();
    for (const el of adminInlineTouched) {
        const saved = adminInlineLight.get(el);
        if (saved && el.isConnected) {
            for (const [prop, v] of Object.entries(saved)) if (el.style.getPropertyValue(prop) === v.dark) el.style.setProperty(prop, v.light, v.priority);
        }
        adminInlineLight.delete(el);
    }
    adminInlineTouched.clear();
}

// The Style & Theme Settings colours are made for light mode: they rest while dark mode is on
function adminSchemeThemeStyles() {
    const custom = document.getElementById('dynamic-theme-styles');
    if (!custom) return;
    if (document.documentElement.getAttribute('data-theme') === 'dark') custom.setAttribute('media', 'not all');
    else custom.removeAttribute('media');
}

// Chart.js graphs drawn before the switch get the new text and line colours
function adminSchemeCharts(dark) {
    if (typeof Chart === 'undefined') return;
    const text = dark ? '#cbd5e1' : '#666666';
    const line = dark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(0, 0, 0, 0.1)';
    const before = { text: Chart.defaults.color, line: Chart.defaults.borderColor };
    Chart.defaults.color = text;
    Chart.defaults.borderColor = line;
    const swap = (value, from, to) => (value === undefined || value === from ? to : value);
    for (const chart of Object.values(Chart.instances || {})) {
        for (const scale of Object.values((chart.options && chart.options.scales) || {})) {
            if (scale.ticks) scale.ticks.color = swap(scale.ticks.color, before.text, text);
            if (scale.grid) scale.grid.color = swap(scale.grid.color, before.line, line);
        }
        const legend = chart.options && chart.options.plugins && chart.options.plugins.legend;
        if (legend && legend.labels) legend.labels.color = swap(legend.labels.color, before.text, text);
        chart.update('none');
    }
}

function adminApplyScheme(scheme) {
    const dark = scheme === 'dark';
    if (dark) adminBuildDarkStyles();
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    adminSchemeThemeStyles();
    adminWatchInline(dark);
    const button = document.getElementById('theme-toggle');
    if (button) {
        const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.setAttribute('aria-pressed', dark ? 'true' : 'false');
    }
    adminSchemeCharts(dark);
    window.dispatchEvent(new CustomEvent('admin-color-scheme', { detail: { scheme: dark ? 'dark' : 'light' } }));
}

// The moon / sun button in the top bar
function toggleColorScheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(ADMIN_SCHEME_KEY, next); } catch { /* private window: the choice lasts until the page closes */ }
    adminApplyScheme(next);
}

// Right away in <head>: the saved choice, before the page is drawn
adminApplyScheme(adminSchemeSaved());
document.addEventListener('DOMContentLoaded', () => {
    adminApplyScheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    // themes.js adds its Style & Theme Settings styles later: they follow the current mode too
    new MutationObserver(adminSchemeThemeStyles).observe(document.head, { childList: true });
});
// <Jun Kai end>
