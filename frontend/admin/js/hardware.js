// Owner: Role 3, Jun Kai.
// Hardware page: a card per part from GET /api/admin/hardware/overview (the cards pick what the graph shows: every
// part together or one part with its own numbers), Chart.js line graphs from GET /api/admin/hardware/series with a
// Past / Forecast switch (Past: what was measured, 1 hour to 5 years; Forecast: a little history, then 1 hour up to
// 1 year ahead, marked as a rough guide when it reaches further than the stored history), the table view and the
// Settings drawer. Charts are created once and updated in place, so nothing on the page jumps while data arrives.
// <Jun Kai start>
let hardwareRange = '24h';
let hardwareTimer = null;
let hardwareLoading = false;
let hardwareDrawn = false;
let hardwareTableOpen = false;
let hardwarePendingReload = false;
let hardwareLastPoints = [];
const hardwareCharts = {};

const HARDWARE_METRICS = ['cpu', 'memory', 'gpu', 'disk'];
const HARDWARE_ACCENT = '#2a78d6';
// a colour per part, the same on its card and its line (checked for colour-blind readers)
const HARDWARE_COLORS = { cpu: '#1f6fd0', memory: '#14a88a', gpu: '#a0408f', disk: '#1e293b' };
// <Jun Kai start> dark mode: the dark-slate Disk line would vanish on a dark graph, so it turns light grey there
const hardwareDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
const hardwareColor = (key) => (key === 'disk' && hardwareDark() ? '#cbd5e1' : HARDWARE_COLORS[key] || HARDWARE_ACCENT);
// <Jun Kai end>
const HARDWARE_NAMES = { cpu: 'CPU', memory: 'Memory', gpu: 'GPU', disk: 'Disk' };
const HARDWARE_PART_TEXT = {
    all: 'Every part on one graph. Click a part on the left to see it on its own.',
    cpu: 'Average use.',
    memory: 'Share of the installed memory in use.',
    gpu: 'Busiest GPU engine, as Task Manager reports it.',
    disk: 'Used space on the project drive.'
};
let hardwarePart = 'all';
const HARDWARE_RANGES = {
    '1h': { seconds: 3600, tick: 10 * 60000, text: 'Averages per minute, last hour' },
    '6h': { seconds: 6 * 3600, tick: 3600000, text: 'Averages per 5 minutes, last 6 hours' },
    '24h': { seconds: 24 * 3600, tick: 4 * 3600000, text: 'Averages per 10 minutes, last 24 hours' },
    '7d': { seconds: 7 * 86400, tick: 86400000, text: 'Averages per hour, last 7 days' },
    '30d': { seconds: 30 * 86400, tick: 5 * 86400000, text: 'Averages per 4 hours, last 30 days' }
};
const HARDWARE_REDUCE_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const HARDWARE_GPU_SOURCE = { 'nvidia-smi': 'nvidia-smi', 'windows-counters': 'Windows performance counters', none: 'No GPU reading on this PC', detecting: 'Looking for a GPU' };
// Forecast sampling (Settings drawer): each select has presets plus Custom; the units turn the typed number into the
// stored one. How far ahead to forecast is picked on the graph (Forecast) since 17 Nov 2026, so it is not here.
const HARDWARE_SETTING_FIELDS = {
    interval: { key: 'intervalSeconds', words: [[60, 'minute'], [1, 'second']] },
    retention: { key: 'retentionDays', words: [[1, 'day']] }
};
let hardwareLimits = { intervalSeconds: [15, 600], retentionDays: [1, 365], forecastHours: [1, 8760] };
// Custom graph ranges such as "3mo" (the last 3 months): the server works out the exact seconds and the bucket size
const HARDWARE_RANGE_UNITS = { h: ['hour', 3600], d: ['day', 86400], w: ['week', 604800], mo: ['month', 2629800], y: ['year', 31557600] };
const HARDWARE_RANGE_MAX = { h: 43824, d: 1826, w: 260, mo: 60, y: 5 }; // 5 years in each unit
const HARDWARE_RANGE_SAME = { '1d': '24h', '1w': '7d' };
let hardwareRetentionDays = 30;
let hardwareIntervalSeconds = 60;
let hardwareSaved = null; // the settings as last loaded, to tell what a save changes
// <Jun Kai start> the graph's Past / Forecast switch (17 Nov 2026). Past shows what was measured over hardwareRange;
// Forecast shows half the forecast length before now, then hardwareHorizon hours ahead. The chips are the same buttons
// in both modes. The view is kept in this browser (localStorage) and starts as Past, 24 hours.
let hardwareMode = 'past';
let hardwareHorizon = null; // hours ahead; null until the first answer brings the saved forecast length
let hardwareViewLoaded = false;
let hardwareDiskForecastText = 'Used space on the project drive.';
const HARDWARE_VIEW_KEY = 'hardwareGraphView';
const HARDWARE_HORIZONS = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720 };
// a custom forecast in the units of the saved forecast length (a month is 30 days, a year 365 days), up to 1 year
const HARDWARE_HORIZON_UNITS = { h: 1, d: 24, w: 168, mo: 720, y: 8760 };
const HARDWARE_HORIZON_MAX = 8760;
// <Jun Kai end>
// <Jun Kai start> the alert lines of each part (amber, red), from the server; 85 / 95 until it answers
const HARDWARE_ALERT_DEFAULT = { warn: 85, critical: 95 };
let hardwareAlerts = Object.fromEntries(HARDWARE_METRICS.map((key) => [key, { ...HARDWARE_ALERT_DEFAULT }]));
let hardwareAlertDefaults = JSON.parse(JSON.stringify(hardwareAlerts));
let hardwareAlertLimits = { warn: [30, 99], critical: [31, 100] };
let hardwareLastOverview = null;
// <Jun Kai end>

// <Jun Kai start> the live reading of the part cards: asked every second while the page is open
// (GET /api/admin/hardware/live); the graphs, the forecast and the stored samples keep their own timers
const HARDWARE_LIVE_MS = 1000;
const HARDWARE_LIVE_FRESH_MS = 3000;
let hardwareLive = null;
let hardwareLiveTimer = null;
let hardwareLiveBusy = false;
let hardwareLastForecast = null;

// The newest reading for the cards: the live one while it keeps coming, else the last stored sample
function hardwareLatest(stored) {
    return hardwareLive && Date.now() - hardwareLive.receivedAt < HARDWARE_LIVE_FRESH_MS ? hardwareLive : stored;
}
// <Jun Kai end>

function hardwareTheme() {
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => (css.getPropertyValue(name) || '').trim() || fallback;
    return { text: v('--theme-text-color', '#1e293b'), muted: v('--color-dark-gray', '#64748b'), grid: v('--theme-border-color', '#e2e8f0'), card: v('--theme-card-bg', '#ffffff') };
}

function hardwareTimeLabel(ms, withDate) {
    const d = new Date(ms);
    const time = d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false });
    return withDate ? `${d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })} ${time}` : time;
}

function hardwareAgo(iso) {
    if (!iso) return null;
    const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 90) return `${seconds} s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
    return `${Math.round(seconds / 3600)} h ago`;
}

// <Jun Kai start> by the part's own alert lines (Settings drawer, Alert lines)
function hardwareTone(percent, key) {
    const line = hardwareAlerts[key] || HARDWARE_ALERT_DEFAULT;
    return percent >= line.critical ? 'down' : percent >= line.warn ? 'warn' : 'ok';
}

// The lines a graph draws: a part's own two; on the graph with every part only a line all the parts on it share,
// so no line is ever drawn that is not every shown part's real limit
function hardwareLinesFor(chart) {
    const key = chart.$hardwareKey || 'all';
    let parts = key === 'all' ? HARDWARE_METRICS : [key];
    if (key === 'all') {
        const shown = HARDWARE_METRICS.filter((part, i) => {
            const measured = chart.data.datasets[i * 4];
            return measured && measured.data.some((point) => point && point.y !== null && point.y !== undefined);
        });
        if (shown.length) parts = shown;
    }
    const lines = [];
    for (const [kind, light, dark, word] of [['warn', '#b45309', '#fbbf24', 'amber'], ['critical', '#b91c1c', '#f87171', 'red']]) {
        const values = [...new Set(parts.map((part) => (hardwareAlerts[part] || HARDWARE_ALERT_DEFAULT)[kind]))];
        if (values.length === 1) lines.push([values[0], hardwareDark() ? dark : light, `${values[0]}% ${word}`, kind]);
    }
    return lines;
}

// The legend under the graph says the lines that graph draws
function hardwareLegendLimits() {
    const el = document.getElementById('hardware-legend-limit-text');
    if (!el) return;
    const lines = hardwareLinesFor(hardwareCharts[hardwarePart] || { $hardwareKey: hardwarePart, data: { datasets: [] } });
    const amber = lines.find((line) => line[3] === 'warn');
    const red = lines.find((line) => line[3] === 'critical');
    el.textContent = amber && red ? `Amber from ${amber[0]}%, red from ${red[0]}%`
        : red ? `Red from ${red[0]}%; amber differs by part` : amber ? `Amber from ${amber[0]}%; red differs by part` : 'The alert lines differ by part';
}

const hardwareLinesDiffer = () => HARDWARE_METRICS.some((part) => ['warn', 'critical'].some((kind) => (hardwareAlerts[part] || HARDWARE_ALERT_DEFAULT)[kind] !== (hardwareAlerts.cpu || HARDWARE_ALERT_DEFAULT)[kind]));
// <Jun Kai end>

// "3mo" -> { amount: 3, unit: 'mo' }, or null for a preset or anything else
function hardwareCustomRange(key) {
    const m = /^(\d{1,5})(h|d|w|mo|y)$/.exec(String(key || ''));
    return m && !HARDWARE_RANGES[key] ? { amount: Number(m[1]), unit: m[2] } : null;
}

// 3 months -> "3 months"; with short, 1 month -> "month" (for "last month")
function hardwareRangeWords(amount, unit, short) {
    const word = HARDWARE_RANGE_UNITS[unit][0];
    if (amount === 1) return short ? word : `1 ${word}`;
    return `${amount} ${word}s`;
}

// 43200 -> "12 hours", 86400 -> "day"
function hardwareBucketWords(seconds) {
    for (const [size, word] of [[604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']]) {
        if (seconds % size === 0) return seconds === size ? word : `${seconds / size} ${word}s`;
    }
    return `${seconds} seconds`;
}

// Ticks for a custom range: round steps up to two months, then the first day of every 1, 2, 3, 6 or 12 months
function hardwareTickPlan(seconds) {
    if (seconds >= 60 * 86400) {
        const months = seconds / HARDWARE_RANGE_UNITS.mo[1];
        return { months: [1, 2, 3, 6, 12].find((k) => months / k <= 8) || 12, label: 'month' };
    }
    const step = [600, 1800, 3600, 7200, 14400, 21600, 43200, 86400, 172800, 432000, 604800, 1209600].map((s) => s * 1000).find((s) => (seconds * 1000) / s <= 8) || 1209600000;
    return { step, label: step >= 86400000 ? 'date' : seconds > 86400 ? 'datetime' : 'time' };
}

// What the graphs need to know about a range: the preset values, or worked out for a custom one
function hardwareRangeInfo(key, data) {
    const preset = HARDWARE_RANGES[key];
    if (preset) return { ...preset, plan: { step: preset.tick, label: key === '7d' || key === '30d' ? 'datetime' : 'time' } };
    const custom = hardwareCustomRange(key) || { amount: 1, unit: 'd' };
    const seconds = (data && data.seconds) || custom.amount * HARDWARE_RANGE_UNITS[custom.unit][1];
    const bucket = data && data.bucketSeconds;
    return {
        seconds,
        text: `Averages per ${bucket ? hardwareBucketWords(bucket) : 'period'}, last ${hardwareRangeWords(custom.amount, custom.unit, true)}`,
        plan: hardwareTickPlan(seconds)
    };
}

function hardwareTickLabel(ms, label) {
    const d = new Date(ms);
    if (label === 'month') return d.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' });
    if (label === 'date') return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
    return hardwareTimeLabel(ms, label === 'datetime');
}

// <Jun Kai start>
// 24 -> "24 hours", 168 -> "7 days", 2160 -> "3 months", 8760 -> "1 year": a forecast length in the chips' words
function hardwareHorizonWords(hours) {
    const n = Number(hours) || 0;
    const plural = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;
    if (n >= 48) {
        if (n % 8760 === 0) return plural(n / 8760, 'year');
        if (n >= 1440 && n % 720 === 0) return plural(n / 720, 'month');
        if (n % 24 === 0) return plural(n / 24, 'day');
    }
    return plural(n, 'hour');
}

// The history the Forecast view shows before now (half the forecast length): 0.5 -> "30 minutes", 84 -> "3.5 days"
function hardwareBackWords(hours) {
    if (hours < 1) return `${Math.round(hours * 60)} minutes`;
    if (hours < 48) return hardwareHorizonWords(Math.round(hours));
    const days = Math.round((hours / 24) * 2) / 2;
    if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
    const months = Math.round(days / 30.4);
    return `${months} month${months === 1 ? '' : 's'}`;
}

function hardwareDaysWords(days) {
    return days > 3650 ? '10+ years' : `${days} day${days === 1 ? '' : 's'}`;
}

// The view as this admin left it; storage can be blocked (a private window), then the defaults stay
function hardwareLoadView() {
    try {
        const saved = JSON.parse(localStorage.getItem(HARDWARE_VIEW_KEY) || 'null');
        if (saved && typeof saved === 'object') {
            if (saved.mode === 'past' || saved.mode === 'forecast') hardwareMode = saved.mode;
            if (typeof saved.range === 'string' && (HARDWARE_RANGES[saved.range] || hardwareCustomRange(saved.range))) hardwareRange = saved.range;
            const hours = Number(saved.horizon);
            if (Number.isInteger(hours) && hours >= 1 && hours <= HARDWARE_HORIZON_MAX) hardwareHorizon = hours;
        }
    } catch {
        // the defaults
    }
    if (hardwareMode === 'forecast' && !hardwareHorizon) hardwareHorizon = 24;
}

function hardwareSaveView() {
    try {
        localStorage.setItem(HARDWARE_VIEW_KEY, JSON.stringify({ mode: hardwareMode, range: hardwareRange, horizon: hardwareHorizon }));
    } catch {
        // kept for this visit only
    }
}

// What the graph asks for. Past: the range picked. Forecast: half the forecast length back (the server's ranges start at
// 1 hour, the graph cuts the rest). The forecast length goes along in both modes for the cards' forecast line; before
// the first answer it is left out, and the server answers with the saved one.
function hardwareSeriesUrl() {
    const range = hardwareMode === 'forecast' ? `${Math.max(1, Math.ceil(hardwareHorizon / 2))}h` : hardwareRange;
    return `/api/admin/hardware/series?range=${encodeURIComponent(range)}${hardwareHorizon ? `&horizon=${hardwareHorizon}` : ''}`;
}

// A sentence cut into lines that fit a width on the canvas
function hardwareWrap(ctx, text, width) {
    const lines = [];
    let line = '';
    for (const word of String(text).split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > width) {
            lines.push(line);
            line = word;
        } else line = next;
    }
    if (line) lines.push(line);
    return lines;
}
// <Jun Kai end>

// Round ticks on the time axis, aligned to local time (month ticks on the 1st, counted from January)
function hardwareBuildTicks(scale) {
    const plan = (scale.chart && scale.chart.$hardwarePlan) || hardwareRangeInfo(hardwareRange).plan;
    const ticks = [];
    if (plan.months) {
        const d = new Date(scale.min);
        d.setHours(0, 0, 0, 0);
        d.setDate(1);
        if (d.getTime() < scale.min) d.setMonth(d.getMonth() + 1);
        while (d.getMonth() % plan.months !== 0) d.setMonth(d.getMonth() + 1);
        for (; d.getTime() <= scale.max; d.setMonth(d.getMonth() + plan.months)) ticks.push({ value: d.getTime() });
    } else {
        const offset = new Date(scale.min).getTimezoneOffset() * 60000;
        for (let t = Math.ceil((scale.min - offset) / plan.step) * plan.step + offset; t <= scale.max; t += plan.step) ticks.push({ value: t });
    }
    scale.ticks = ticks;
}

// Draws the "now" hairline that separates measured values from the forecast, and the hover crosshair
const hardwareGuidePlugin = {
    id: 'hardwareGuide',
    // under the lines: hatching where there were no samples, and the alert lines (85 % and 95 % unless changed)
    beforeDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.x || !scales.y) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
        ctx.clip();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
        ctx.lineWidth = 1;
        for (const [from, to] of chart.$hardwareSpans || []) {
            const x1 = Math.max(chartArea.left, scales.x.getPixelForValue(from));
            const x2 = Math.min(chartArea.right, scales.x.getPixelForValue(to));
            if (x2 - x1 < 3) continue;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x1, chartArea.top, x2 - x1, chartArea.bottom - chartArea.top);
            ctx.clip();
            const height = chartArea.bottom - chartArea.top;
            ctx.beginPath();
            for (let x = x1 - height; x < x2; x += 7) { ctx.moveTo(x, chartArea.bottom); ctx.lineTo(x + height, chartArea.top); }
            ctx.stroke();
            ctx.restore();
        }
        ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'right';
        ctx.setLineDash([3, 4]);
        // <Jun Kai/> lighter amber and red on a dark graph; each part's own lines (hardwareLinesFor)
        for (const [value, color, label] of hardwareLinesFor(chart)) {
            const y = scales.y.getPixelForValue(value);
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(chartArea.right, y);
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.fillText(label, chartArea.right - 6, y - 4);
        }
        ctx.restore();
    },
    afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.x) return;
        const theme = chart.$hardwareTheme || hardwareTheme();
        const line = (x, color, label) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
            if (label) {
                ctx.fillStyle = theme.muted;
                ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(label, x + 4, chartArea.top + 11);
            }
        };
        ctx.save();
        if (chart.$hardwareNow) {
            const x = scales.x.getPixelForValue(chart.$hardwareNow);
            if (x >= chartArea.left && x <= chartArea.right) line(x, theme.grid, 'now');
        }
        // <Jun Kai start> Forecast mode without a forecast line yet: why, in the empty space after "now"
        if (chart.$hardwareWaiting && chart.$hardwareNow) {
            const left = Math.max(chartArea.left, scales.x.getPixelForValue(chart.$hardwareNow)) + 16;
            const width = chartArea.right - left - 16;
            if (width > 80) {
                ctx.font = '12.5px system-ui, -apple-system, "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const lines = hardwareWrap(ctx, chart.$hardwareWaiting, Math.min(width - 24, 320));
                const top = (chartArea.top + chartArea.bottom) / 2 - ((lines.length - 1) * 17) / 2;
                const boxWidth = Math.max(...lines.map((text) => ctx.measureText(text).width)) + 24;
                // on the card's own colour, so a grid line or the disk's line never runs through the words
                ctx.fillStyle = theme.card;
                ctx.fillRect(left + width / 2 - boxWidth / 2, top - 15, boxWidth, (lines.length - 1) * 17 + 30);
                ctx.fillStyle = theme.muted;
                lines.forEach((text, i) => ctx.fillText(text, left + width / 2, top + i * 17));
            }
        }
        // <Jun Kai end>
        const active = chart.getActiveElements();
        if (active.length) line(active[0].element.x, theme.muted, null);
        ctx.restore();
    }
};

// <Jun Kai start>
// The graph with every part: each line's name at its right end (where its forecast or its last reading ends), so
// the lines can be told apart at a glance. The name is in the text colour with a dot in the part's colour; names
// that would overlap are spread apart.
const HARDWARE_END_LABEL_GAP = 16;
const hardwareEndLabelPlugin = {
    id: 'hardwareEndLabels',
    afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.x || !scales.y) return;
        const theme = chart.$hardwareTheme || hardwareTheme();
        const lastPoint = (dataset) => {
            const data = (dataset && dataset.data) || [];
            for (let i = data.length - 1; i >= 0; i--) if (data[i] && Number.isFinite(data[i].y)) return data[i];
            return null;
        };
        const top = chartArea.top + 6;
        const bottom = chartArea.bottom - 6;
        const labels = [];
        HARDWARE_METRICS.forEach((key, i) => {
            const [measured, projected] = chart.data.datasets.slice(i * 4, i * 4 + 2);
            const end = lastPoint(projected) || lastPoint(measured);
            if (!end) return;
            const y = Math.min(bottom, Math.max(top, scales.y.getPixelForValue(end.y)));
            labels.push({ key, y });
        });
        if (!labels.length) return;
        labels.sort((a, b) => a.y - b.y);
        for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + HARDWARE_END_LABEL_GAP);
        const overflow = labels[labels.length - 1].y - bottom;
        if (overflow > 0) {
            labels[labels.length - 1].y -= overflow;
            for (let i = labels.length - 2; i >= 0; i--) labels[i].y = Math.min(labels[i].y, labels[i + 1].y - HARDWARE_END_LABEL_GAP);
        }
        ctx.save();
        ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (const { key, y } of labels) {
            ctx.fillStyle = hardwareColor(key);
            ctx.beginPath();
            ctx.arc(chartArea.right + 12, y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = theme.text;
            ctx.fillText(HARDWARE_NAMES[key], chartArea.right + 21, y);
        }
        ctx.restore();
    }
};
// <Jun Kai end>

// <Jun Kai start> a part's four datasets (measured, forecast, band low, band high) in its colour for this mode
function hardwarePaint(datasets, key) {
    const color = hardwareColor(key);
    datasets.forEach((d, i) => {
        if (i < 2) { d.borderColor = color; d.pointHoverBackgroundColor = color; } else d.backgroundColor = `${color}1f`;
    });
}
// <Jun Kai end>

function hardwareChartConfig(key) {
    const theme = hardwareTheme();
    const color = HARDWARE_COLORS[key] || HARDWARE_ACCENT;
    const series = (label, dash) => ({
        label, data: [], borderColor: color, borderWidth: 2, borderDash: dash, borderCapStyle: 'round', borderJoinStyle: 'round',
        pointRadius: 0, pointHitRadius: 16, pointHoverRadius: 4, pointHoverBackgroundColor: color, pointHoverBorderColor: theme.card, pointHoverBorderWidth: 2,
        tension: 0.25, spanGaps: false, fill: false
    });
    const band = (fill) => ({ label: 'band', data: [], borderWidth: 0, pointRadius: 0, pointHitRadius: 0, pointHoverRadius: 0, backgroundColor: `${color}1f`, fill, isBand: true, tension: 0.25 });
    return {
        type: 'line',
        data: { datasets: [series('Measured', []), series('Forecast', [5, 4]), band(false), band('-1')] },
        options: {
            parsing: false,
            responsive: true,
            maintainAspectRatio: false,
            animation: HARDWARE_REDUCE_MOTION ? false : { duration: 300 },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            layout: { padding: { top: 6, right: 10 } },
            scales: {
                x: {
                    type: 'linear',
                    afterBuildTicks: hardwareBuildTicks,
                    ticks: { maxRotation: 0, autoSkip: true, color: theme.muted, font: { size: 11 }, padding: 6, callback(value) { const plan = (this.chart && this.chart.$hardwarePlan) || hardwareRangeInfo(hardwareRange).plan; return hardwareTickLabel(value, plan.label); } },
                    grid: { display: false },
                    border: { color: theme.grid }
                },
                y: {
                    min: 0, max: 100,
                    ticks: { stepSize: 25, color: theme.muted, font: { size: 11 }, padding: 6, callback: (value) => `${value}%` },
                    grid: { color: theme.grid, drawTicks: false },
                    border: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    filter: (item) => !item.dataset.isBand,
                    backgroundColor: '#0f172a', titleColor: '#cbd5e1', bodyColor: '#f8fafc', padding: 10, displayColors: false, titleFont: { size: 11, weight: '500' }, bodyFont: { size: 13, weight: '600' },
                    callbacks: {
                        title: (items) => (items.length ? hardwareTimeLabel(items[0].parsed.x, true) : ''),
                        label: (item) => `${item.parsed.y === null || item.parsed.y === undefined ? '–' : `${item.parsed.y.toFixed(1)}%`}  ${item.dataset.label.toLowerCase()}`
                    }
                }
            }
        },
        plugins: [hardwareGuidePlugin]
    };
}

function ensureHardwareCharts() {
    if (typeof Chart === 'undefined') return false;
    for (const key of HARDWARE_METRICS) {
        const canvas = document.getElementById(`hardware-${key}-chart`);
        if (!canvas) continue;
        if (!hardwareCharts[key]) {
            hardwareCharts[key] = new Chart(canvas, hardwareChartConfig(key));
            hardwareCharts[key].$hardwareKey = key; // <Jun Kai/> which part's alert lines it draws
        } else hardwareCharts[key].resize();
    }
    // the graph with every part: the four datasets of each part, one after the other
    const canvas = document.getElementById('hardware-all-chart');
    if (canvas && !hardwareCharts.all) {
        const config = hardwareChartConfig('cpu');
        config.data.datasets = HARDWARE_METRICS.flatMap((key) => hardwareChartConfig(key).data.datasets.map((d) => ({ ...d, label: d.isBand ? 'band' : `${HARDWARE_NAMES[key]} ${d.label.toLowerCase()}` })));
        // <Jun Kai start> room on the right for each line's name at its end
        config.options.layout.padding.right = 82;
        config.plugins = [hardwareGuidePlugin, hardwareEndLabelPlugin];
        // <Jun Kai end>
        hardwareCharts.all = new Chart(canvas, config);
        hardwareCharts.all.$hardwareKey = 'all'; // <Jun Kai/>
    } else if (hardwareCharts.all) hardwareCharts.all.resize();
    return true;
}

function renderHardwareSeries(data) {
    const points = data.points || [];
    const rangeKey = data.range || hardwareRange;
    const range = hardwareRangeInfo(rangeKey, data);
    const forecast = data.forecast || {};
    const theme = hardwareTheme();
    const now = Date.now();
    // <Jun Kai start> Past: the range picked, without a forecast. Forecast: half the forecast length before now (the history
    // the forecast carries on from), then the forecast up to its end, so a forecast a year ahead fills the graph.
    const forecastMode = hardwareMode === 'forecast';
    const horizonHours = forecast.horizonHours || hardwareHorizon || 24;
    const windowStart = forecastMode ? now - (horizonHours / 2) * 3600000 : now - range.seconds * 1000;
    const bucketMs = (data.bucketSeconds || 0) * 1000;
    const shown = points.filter((p) => p.t >= windowStart - bucketMs);
    hardwareLastPoints = shown;
    // <Jun Kai end>
    const lastT = shown.length ? shown[shown.length - 1].t : null;
    // a range longer than the samples are kept can never fill, so the graphs start at the oldest sample instead
    const firstT = shown.length ? shown[0].t : null;
    // <Jun Kai start> a range longer than the samples are kept comes from the daily summaries (one point per day or more)
    const fromDaily = data.source === 'daily';
    const beyondKept = !fromDaily && range.seconds > hardwareRetentionDays * 86400;
    const clipped = (beyondKept || fromDaily) && firstT !== null && firstT > windowStart;
    // <Jun Kai end>
    const xMin = clipped ? firstT : windowStart;
    const note = document.getElementById('hardware-series-note');
    if (note) {
        // <Jun Kai start>
        let text;
        if (forecastMode) {
            const ahead = hardwareHorizonWords(horizonHours);
            const back = clipped ? `Measured since ${hardwareTickLabel(firstT, 'date')}` : `Measured for the last ${hardwareBackWords(horizonHours / 2)}`;
            text = shown.length ? `${back}, then the forecast for the next ${ahead}` : `The forecast for the next ${ahead} (no samples yet)`;
        } else {
            const what = shown.length ? range.text : `${range.text} (no samples yet)`;
            const kept = `Samples are kept for ${hardwareSpell('retention', hardwareRetentionDays)}`;
            const fromSummaries = `${what}. From the daily summaries, which are kept for good${clipped ? ` and start on ${hardwareTickLabel(firstT, 'date')}` : ''}.`;
            text = fromDaily ? fromSummaries : !beyondKept ? what : clipped ? `${what}. ${kept}, so the graphs start on ${hardwareTickLabel(firstT, 'date')}.` : `${what}. ${kept}.`;
        }
        note.textContent = text;
        note.classList.remove('is-error');
        // <Jun Kai end>
    }
    if (typeof Chart === 'undefined') {
        for (const key of HARDWARE_METRICS) {
            const empty = document.getElementById(`hardware-${key}-empty`);
            if (empty) { empty.hidden = false; empty.textContent = 'The graph library did not load (no internet). Use Table view.'; }
        }
        return;
    }
    // the server sends only the periods that have samples: a hole longer than a few periods (the PC hibernating
    // overnight) gets an empty point, so the line breaks there instead of drawing straight across the night
    const gapMs = Math.max(data.bucketSeconds || 0, hardwareIntervalSeconds) * 3000;
    const gapAfter = new Set(shown.filter((p, i) => i + 1 < shown.length && shown[i + 1].t - p.t > gapMs).map((p) => p.t));
    // stretches of the range with no samples at all (the PC asleep or the server stopped): the graphs hatch them
    const spans = [];
    let seen = xMin;
    for (const p of shown) { if (p.t - seen > gapMs) spans.push([seen, p.t]); seen = Math.max(seen, p.t); }
    if (shown.length && now - seen > gapMs) spans.push([seen, now]);
    // <Jun Kai start> where the graph ends in Forecast mode: the last point of the CPU, memory and GPU forecast (it starts at
    // the newest 10-minute average, so it ends a little before now plus the length), or now plus the length while there
    // is none. A forecast whose end has already passed (no new samples since the server came back) is not drawn.
    const usable = (fc) => !!fc && Array.isArray(fc.points) && fc.points.length > 0 && fc.points[fc.points.length - 1].t > now;
    const ends = ['cpu', 'memory', 'gpu'].filter((key) => usable(forecast[key])).map((key) => forecast[key].points[forecast[key].points.length - 1].t);
    const forecastEnd = ends.length ? Math.max(...ends) : now + horizonHours * 3600000;
    const xMax = forecastMode ? forecastEnd : now;
    const span = (xMax - xMin) / 1000;
    // ticks follow the span actually drawn: Forecast mode or a clipped start changes it
    const plan = forecastMode || clipped || span > range.seconds * 1.25 ? hardwareTickPlan(span) : range.plan;
    const info = hardwareForecastInfo(forecast, hardwareLatest(hardwareLastOverview && hardwareLastOverview.latest));
    let drawn = 0;
    // <Jun Kai end>
    for (const key of HARDWARE_METRICS) {
        const chart = hardwareCharts[key];
        if (!chart) continue;
        const history = shown.flatMap((p) => (gapAfter.has(p.t) ? [{ x: p.t, y: p[key] }, { x: p.t + 1, y: null }] : [{ x: p.t, y: p[key] }]));
        const [measured, projected, low, high] = chart.data.datasets;
        hardwarePaint(chart.data.datasets, key); // <Jun Kai/> the part's colour for the current light / dark mode
        measured.data = history;
        const fc = forecast[key];
        const lastValue = history.length ? history[history.length - 1].y : null;
        // <Jun Kai start>
        const known = lastValue !== null && lastValue !== undefined;
        const disk = forecast.disk;
        if (forecastMode && key === 'disk' && known && disk && disk.gbPerDay !== null && disk.totalGb) {
            // a disk that is not growing stays level: space freed by a clean-up is not a trend to continue
            const perDay = disk.daysUntilFull === null ? 0 : disk.gbPerDay;
            const perMs = ((perDay / disk.totalGb) * 100) / 86400000;
            const endValue = Math.min(100, Math.max(0, lastValue + perMs * (forecastEnd - lastT)));
            // a full disk stays at 100 %: the line bends where it fills up instead of running on
            const fullAt = perMs > 0 ? lastT + (100 - lastValue) / perMs : null;
            projected.data = fullAt !== null && fullAt < forecastEnd
                ? [{ x: lastT, y: lastValue }, { x: fullAt, y: 100 }, { x: forecastEnd, y: 100 }]
                : [{ x: lastT, y: lastValue }, { x: forecastEnd, y: endValue }];
            low.data = []; high.data = [];
        } else if (forecastMode && key !== 'disk' && known && usable(fc)) {
            const ahead = fc.points.filter((p) => p.t > lastT);
            projected.data = [{ x: lastT, y: lastValue }, ...ahead.map((p) => ({ x: p.t, y: p.value }))];
            low.data = [{ x: lastT, y: lastValue }, ...ahead.map((p) => ({ x: p.t, y: p.low }))];
            high.data = [{ x: lastT, y: lastValue }, ...ahead.map((p) => ({ x: p.t, y: p.high }))];
        } else {
            projected.data = []; low.data = []; high.data = [];
        }
        if (projected.data.length && key !== 'disk') drawn++;
        chart.$hardwareNow = forecastMode ? now : null;
        chart.$hardwareWaiting = forecastMode && !projected.data.length ? hardwareWaitingText(key, info, known) : null;
        // <Jun Kai end>
        chart.$hardwareTheme = theme;
        chart.$hardwareSpans = spans;
        chart.$hardwareRange = rangeKey;
        chart.$hardwarePlan = plan;
        chart.options.scales.x.min = xMin;
        chart.options.scales.x.max = xMax;
        chart.options.scales.x.ticks.color = theme.muted;
        chart.options.scales.y.ticks.color = theme.muted;
        chart.options.scales.y.grid.color = theme.grid;
        chart.update(hardwareDrawn ? 'none' : undefined);
        const empty = document.getElementById(`hardware-${key}-empty`);
        if (empty) {
            const hasValue = history.some((p) => p.y !== null && p.y !== undefined);
            empty.hidden = hasValue;
            empty.textContent = key === 'gpu' && !hasValue && shown.length ? 'No GPU reading on this PC' : 'Waiting for samples';
        }
    }
    const together = hardwareCharts.all;
    if (together) {
        const parts = HARDWARE_METRICS.map((key) => hardwareCharts[key]).filter(Boolean);
        parts.forEach((chart, i) => chart.data.datasets.forEach((d, j) => { together.data.datasets[i * 4 + j].data = d.data; }));
        HARDWARE_METRICS.forEach((key, i) => hardwarePaint(together.data.datasets.slice(i * 4, i * 4 + 4), key)); // <Jun Kai/>
        // <Jun Kai start>
        together.$hardwareNow = forecastMode ? now : null;
        // CPU, memory and GPU wait for the same samples: one sentence for the three, even when the disk has its line
        const diskLine = !!(hardwareCharts.disk && hardwareCharts.disk.data.datasets[1].data.length);
        const waiting = forecastMode && !drawn ? hardwareWaitingText('cpu', info, shown.length > 0) : null;
        together.$hardwareWaiting = waiting && diskLine ? waiting.replace(/^No forecast yet/, 'No CPU, memory or GPU forecast yet') : waiting;
        // <Jun Kai end>
        together.$hardwareTheme = theme;
        together.$hardwareSpans = spans;
        together.$hardwareRange = rangeKey;
        together.$hardwarePlan = plan;
        together.options.scales.x.min = xMin;
        together.options.scales.x.max = xMax;
        together.options.scales.x.ticks.color = theme.muted;
        together.options.scales.y.ticks.color = theme.muted;
        together.options.scales.y.grid.color = theme.grid;
        together.update(hardwareDrawn ? 'none' : undefined);
        const empty = document.getElementById('hardware-all-empty');
        if (empty) {
            empty.hidden = shown.length > 0;
            empty.textContent = 'Waiting for samples'; // <Jun Kai/> also after an error said why the graph did not load
        }
    }
    hardwareDrawn = true;
}

// <Jun Kai start> why a part has no dashed line in Forecast mode, said in the empty space after "now"
function hardwareWaitingText(key, info, known) {
    if (!known) return key === 'gpu' ? 'No GPU reading on this PC, so no forecast' : 'No samples yet, so no forecast';
    const part = info.parts[key];
    return part && part.reason ? `No forecast yet. ${part.reason}.` : 'No forecast yet';
}
// <Jun Kai end>

// The card of each part: Normal, High or Critical, by the same limits as the lines on the graph
function renderHardwareKeys(overview) {
    const latest = overview.latest || {};
    const now = { cpu: latest.cpu, memory: latest.memory && latest.memory.percent, gpu: latest.gpu && latest.gpu.percent, disk: latest.disk && latest.disk.percent };
    for (const key of HARDWARE_METRICS) {
        const pill = document.getElementById(`hardware-${key}-pill`);
        if (!pill) continue;
        const value = now[key];
        const known = value !== null && value !== undefined;
        const tone = known ? hardwareTone(value, key) : 'muted';
        // <Jun Kai start> written only when it changes: the live reading arrives every second
        const className = `ui-pill ui-pill-${tone}`;
        const html = `<span class="ui-dot"></span>${known ? { ok: 'Normal', warn: 'High', down: 'Critical' }[tone] : 'No reading'}`;
        if (pill.className !== className) pill.className = className;
        if (pill.innerHTML !== html) pill.innerHTML = html;
        // <Jun Kai end>
    }
}

// Under the graph of one part. Past: now, average, peak and lowest of the range shown. Forecast (17 Nov 2026): now,
// where the forecast ends, its likely range and what it is based on; for the disk, where it will be, when it is full
// and how fast it grows.
function renderHardwareFacts(latest) {
    const percent = (v) => (v === null || v === undefined ? '–' : `${Number(v).toFixed(0)}%`);
    const now = { cpu: latest && latest.cpu, memory: latest && latest.memory && latest.memory.percent, gpu: latest && latest.gpu && latest.gpu.percent, disk: latest && latest.disk && latest.disk.percent };
    // <Jun Kai start>
    const forecastMode = hardwareMode === 'forecast';
    const info = hardwareForecastInfo(hardwareLastForecast, latest);
    // <Jun Kai end>
    for (const key of HARDWARE_METRICS) {
        const nowFact = ['Now', percent(now[key]), latest && latest.live ? 'live' : latest && latest.at ? `sampled ${hardwareAgo(latest.at)}` : '']; // <Jun Kai/>
        let facts;
        if (!forecastMode) {
            const rows = hardwareLastPoints.filter((p) => p[key] !== null && p[key] !== undefined);
            let low = null; let high = null; let sum = 0;
            for (const p of rows) { if (!low || p[key] < low[key]) low = p; if (!high || p[key] > high[key]) high = p; sum += p[key]; }
            facts = [
                nowFact,
                ['Average in this range', rows.length ? percent(sum / rows.length) : '–', `${rows.length} points`],
                ['Peak in this range', high ? percent(high[key]) : '–', high ? `at ${hardwareTimeLabel(high.t, true)}` : ''],
                ['Lowest in this range', low ? percent(low[key]) : '–', low ? `at ${hardwareTimeLabel(low.t, true)}` : '']
            ];
        } else facts = [nowFact, ...hardwareForecastFacts(key, info, now[key])]; // <Jun Kai/>
        const box = document.getElementById(`hardware-${key}-facts`);
        if (box) box.innerHTML = facts.map(([l, v, h], i) => `<div${i === 0 ? ' data-hw-now' : ''}><span class="ui-fact-label">${escapeHtmlSafe(l)}</span><span class="ui-fact-value">${escapeHtmlSafe(v)}</span><span class="ui-fact-hint">${escapeHtmlSafe(h)}</span></div>`).join(''); // <Jun Kai/> the "Now" row is marked for renderHardwareNow
    }
    hardwarePartWords();
}

// <Jun Kai start> the three forecast facts after "Now" for one part (Forecast mode)
function hardwareForecastFacts(key, info, current) {
    const ahead = `In ${info.words}`;
    if (key === 'disk') {
        const disk = info.parts.disk.disk;
        if (!disk) return [[ahead, '–', info.parts.disk.reason], ['Disk full in', '–', ''], ['Growth', '–', '']];
        const perDay = disk.daysUntilFull === null ? 0 : disk.gbPerDay;
        const at = current === null || current === undefined ? null : Math.min(100, Math.max(0, current + (perDay / disk.totalGb) * 100 * (info.hours / 24)));
        const free = Math.max(0, disk.totalGb - disk.lastUsedGb);
        return [
            [ahead, at === null ? '–' : `${at.toFixed(0)}%`, disk.daysUntilFull === null ? 'not growing, so it stays level' : 'if the growth carries on'],
            ['Disk full in', disk.daysUntilFull === null ? 'Not growing' : hardwareDaysWords(disk.daysUntilFull), `${free.toFixed(0)} of ${Number(disk.totalGb).toFixed(0)} GB free`],
            ['Growth', `${disk.gbPerDay} GB per day`, `over the last ${disk.spanDays} days`]
        ];
    }
    const part = info.parts[key];
    const basis = hardwareBasisWords(info);
    if (!part.ready) return [[ahead, '–', part.reason], ['Likely range', '–', ''], ['Based on', basis[0], basis[1]]];
    return [
        [ahead, `${part.end.value.toFixed(0)}%`, info.daily ? 'the usual daily average' : 'where the dashed line ends'],
        ['Likely range', `${part.end.low.toFixed(0)} to ${part.end.high.toFixed(0)}%`, 'the shaded band on the graph'],
        ['Based on', basis[0], basis[1]]
    ];
}

// What the forecast is worked out from: "26 hours" of samples without a break, or "45 days" with samples
function hardwareBasisWords(info) {
    const n = info.basedOn;
    if (!n) return ['–', 'no samples to go on yet'];
    if (info.daily) return [`${n} day${n === 1 ? '' : 's'}`, 'with at least an hour of samples'];
    return [n < 6 ? `${n * 10} minutes` : hardwareHistoryWords(n / 6), 'of samples without a break'];
}
// <Jun Kai end>

// <Jun Kai start> the "Now" line under each graph, every second, without redrawing the other facts
function renderHardwareNow(latest) {
    const now = { cpu: latest.cpu, memory: latest.memory && latest.memory.percent, gpu: latest.gpu && latest.gpu.percent, disk: latest.disk && latest.disk.percent };
    for (const key of HARDWARE_METRICS) {
        const row = document.querySelector(`#hardware-${key}-facts [data-hw-now]`);
        if (!row) continue;
        const text = now[key] === null || now[key] === undefined ? '–' : `${Number(now[key]).toFixed(0)}%`;
        const value = row.querySelector('.ui-fact-value');
        const hint = row.querySelector('.ui-fact-hint');
        if (value && value.textContent !== text) value.textContent = text;
        if (hint && hint.textContent !== 'live') hint.textContent = 'live';
    }
}
// <Jun Kai end>

function hardwarePartWords() {
    const forecastMode = hardwareMode === 'forecast'; // <Jun Kai/>
    const title = document.getElementById('hardware-main-title');
    const words = document.getElementById('hardware-main-text');
    if (title) title.textContent = hardwareTableOpen ? 'Values' : hardwarePart === 'all' ? 'All parts' : HARDWARE_NAMES[hardwarePart];
    // <Jun Kai start> when the parts have different alert lines, the graph with every part draws only the shared ones; in
    // Forecast mode the words also say what the dashed line is, and the legend shows the forecast
    const allStart = forecastMode ? 'Every part on one graph: measured up to now, then the dashed forecast.' : 'Every part on one graph.';
    const allText = hardwareLinesDiffer() ? `${allStart} The alert lines differ by part: click a part on the left to see it with its own.` : `${allStart} Click a part on the left to see it on its own.`;
    const partText = hardwarePart === 'disk' ? (forecastMode ? hardwareDiskForecastText : HARDWARE_PART_TEXT.disk)
        : `${HARDWARE_PART_TEXT[hardwarePart]}${forecastMode ? ' The dashed line is the forecast, the shaded band its typical error.' : ''}`;
    const tableText = forecastMode ? 'The measured averages before now, every part, newest first. The forecast is only on the graph.' : 'The same averages as the graph, every part, newest first.';
    if (words) words.textContent = hardwareTableOpen ? tableText : hardwarePart === 'all' ? allText : partText;
    const legend = document.getElementById('hardware-legend-forecast');
    if (legend) legend.hidden = !forecastMode;
    hardwareLegendLimits();
    // <Jun Kai end>
}

// The cards on the left are the switch: every part on one graph, or one part with its own numbers
function setHardwarePart(part) {
    if (part !== 'all' && !HARDWARE_METRICS.includes(part)) return;
    hardwarePart = part;
    document.querySelectorAll('#hardware-page .hw-key').forEach((key) => key.setAttribute('aria-pressed', String(key.dataset.part === part)));
    document.querySelectorAll('#hardware-page .hw-plot').forEach((panel) => { panel.hidden = panel.dataset.partPanel !== part; });
    hardwarePartWords();
    ensureHardwareCharts();
}

// <Jun Kai start> the sampler pill has its own function: the live reading must not paint over an error the minute
// refresh shows there
function renderHardwareSamplerPill(sampler) {
    const pill = document.getElementById('hardware-sampler-pill');
    const pillState = sampler.lastError ? ['down', 'Sampler error'] : sampler.running ? ['ok', `Sampling every ${sampler.intervalSeconds} s`] : ['muted', 'Sampler off'];
    if (pill) { pill.className = `ui-pill ui-pill-${pillState[0]}`; pill.innerHTML = `<span class="ui-dot"></span>${escapeHtmlSafe(pillState[1])}`; }
}
// <Jun Kai end>

// <Jun Kai start>
// "11th Gen Intel Core i7-1165G7, 8 logical processors": the processor, from the overview (os.cpus() on the server)
function hardwareCpuText(machine) {
    const cpu = machine && machine.cpu;
    if (!cpu || !cpu.model) return '';
    const n = Number(cpu.logicalProcessors) || 0;
    return n ? `${cpu.model}, ${n} logical processor${n === 1 ? '' : 's'}` : cpu.model;
}

// The line above the cards says how fresh their numbers are: live (the reading every second), the stored sample with
// its age, or why there is no number yet
function renderHardwareLiveNote(latest, sampler) {
    const note = document.getElementById('hardware-live-note');
    const text = document.getElementById('hardware-live-text');
    if (!note || !text) return;
    let words = 'Live, updates every second';
    let tone = 'live';
    if (latest && !latest.live) {
        words = latest.at ? `From the last sample, ${hardwareAgo(latest.at)}` : 'From the last sample';
        tone = 'stored';
    } else if (!latest) {
        words = sampler && sampler.lastError ? sampler.lastError : 'Waiting for the first sample (about 10 seconds after the server starts)';
        tone = sampler && sampler.lastError ? 'error' : 'stored';
    }
    if (text.textContent !== words) text.textContent = words;
    const className = `hw-live is-${tone}`;
    if (note.className !== className) note.className = className;
}
// <Jun Kai end>

// The number and the line under it on each part card
function renderHardwareCards(overview) {
    const latest = overview.latest;
    const sampler = overview.sampler || {};
    const set = (id, text) => { const el = document.getElementById(id); if (el && el.textContent !== text) el.textContent = text; }; // <Jun Kai/> written only when it changes
    const gb = (mb) => (mb / 1024).toFixed(1);
    // <Jun Kai start> the CPU card names the processor, like the other cards describe their part; how fresh the numbers
    // are is the line above the cards
    set('hardware-cpu-hint', hardwareCpuText(overview.machine));
    renderHardwareLiveNote(latest, sampler);
    // <Jun Kai end>
    if (!latest) {
        for (const key of HARDWARE_METRICS) set(`hardware-${key}-value`, '–');
        set('hardware-memory-hint', '');
        set('hardware-disk-hint', '');
        set('hardware-gpu-hint', HARDWARE_GPU_SOURCE[sampler.gpu && sampler.gpu.source] || '');
        return;
    }
    set('hardware-cpu-value', latest.cpu === null || latest.cpu === undefined ? '–' : latest.cpu.toFixed(0));
    set('hardware-memory-value', latest.memory ? latest.memory.percent.toFixed(0) : '–');
    set('hardware-memory-hint', latest.memory ? `${gb(latest.memory.usedMb)} of ${gb(latest.memory.totalMb)} GB in use` : '');
    set('hardware-disk-value', latest.disk ? latest.disk.percent.toFixed(0) : '–');
    set('hardware-disk-hint', latest.disk ? `${latest.disk.usedGb} of ${latest.disk.totalGb} GB used on the project drive` : '');
    if (latest.gpu && latest.gpu.percent !== null && latest.gpu.percent !== undefined) {
        set('hardware-gpu-value', latest.gpu.percent.toFixed(0));
        const memoryText = latest.gpu.memoryUsedMb ? `${gb(latest.gpu.memoryUsedMb)} GB${latest.gpu.memoryTotalMb ? ` of ${gb(latest.gpu.memoryTotalMb)} GB` : ''} memory in use` : '';
        // <Jun Kai/> without the trade marks, like the processor's name on the CPU card
        const name = sampler.gpu && sampler.gpu.name ? sampler.gpu.name.replace(/\((R|TM)\)/gi, '').replace(/\s+/g, ' ').trim() : '';
        set('hardware-gpu-hint', [name, memoryText].filter(Boolean).join(', '));
    } else {
        set('hardware-gpu-value', '–');
        set('hardware-gpu-hint', HARDWARE_GPU_SOURCE[sampler.gpu && sampler.gpu.source] || 'No GPU reading on this PC');
    }
}

// <Jun Kai start>
// What the forecast says for each part, from the last GET /series answer: for CPU, memory and GPU the point where the
// forecast ends (or why there is none), the disk's growth, and the forecast length in words. A forecast whose end has
// already passed (no new samples since the server came back) counts as not ready.
function hardwareForecastInfo(forecast, latest) {
    const f = forecast || {};
    const hours = f.horizonHours || hardwareHorizon || 24;
    const daily = f.basis === 'daily';
    const now = Date.now();
    const parts = {};
    for (const key of ['cpu', 'memory', 'gpu']) {
        const fc = f[key];
        const end = fc && Array.isArray(fc.points) && fc.points.length ? fc.points[fc.points.length - 1] : null;
        let reason = '';
        if (key === 'gpu' && latest && !latest.gpu) reason = 'No GPU reading on this PC';
        else if (!end) reason = daily ? `Needs 6 days with samples (${f.basedOnPoints || 0} so far)` : 'Needs an hour of samples without a break, and the count restarts when the PC wakes';
        else if (end.t <= now) reason = 'Waiting for new samples';
        parts[key] = { ready: !reason, end: reason ? null : end, reason };
    }
    // the disk fits a line through hourly averages (up to 2 days ahead) or daily ones (further ahead): it needs two of them
    parts.disk = { ready: !!f.disk, disk: f.disk || null, reason: f.disk ? '' : daily ? 'Needs 2 days with samples' : 'Needs a few hours of samples' };
    return { hours, words: hardwareHorizonWords(hours), daily, parts, basedOn: f.basedOnPoints || 0, method: f.method || '', check: f.check || null };
}

// The cards' forecast line (in both modes), and in Forecast mode the forecast of every part under the graph with every
// part, why it is a rough guide when it is one, and how it is worked out. The Forecast card under the graph used to say
// this; it was removed on 17 Nov 2026 because the graph and the card showed the same thing.
function renderHardwareForecast(forecast, latest) {
    const info = hardwareForecastInfo(forecast, latest);
    const forecastMode = hardwareMode === 'forecast';
    const set = (id, text) => { const el = document.getElementById(id); if (el && el.textContent !== text) el.textContent = text; };
    for (const key of ['cpu', 'memory', 'gpu']) {
        const part = info.parts[key];
        set(`hardware-${key}-next`, part.ready ? `${part.end.value.toFixed(0)}% in ${info.words}` : 'forecast not ready');
    }
    const disk = info.parts.disk.disk;
    set('hardware-disk-next', !disk ? 'forecast not ready' : disk.daysUntilFull === null ? 'not growing' : `full in ${hardwareDaysWords(disk.daysUntilFull)}`);
    const fitDays = disk ? Math.round(disk.spanDays) : 0;
    const fitWords = fitDays >= 1 ? `of the last ${fitDays === 1 ? 'day' : `${fitDays} days`}` : 'measured so far';
    hardwareDiskForecastText = disk && disk.daysUntilFull === null ? 'Used space on the project drive. It is not growing, so the dashed line stays level.' : `Used space on the project drive. The dashed line continues the growth ${fitWords}.`;
    const box = document.getElementById('hardware-forecast-facts');
    if (box) {
        box.hidden = !forecastMode;
        const cells = ['cpu', 'memory', 'gpu'].map((key) => {
            const part = info.parts[key];
            const label = `${HARDWARE_NAMES[key]} in ${info.words}`;
            if (!part.ready) return [label, '–', part.reason];
            const likely = `likely ${part.end.low.toFixed(0)} to ${part.end.high.toFixed(0)}%`;
            return [label, `${part.end.value.toFixed(0)}%`, info.daily ? `usual daily average, ${likely}` : likely];
        });
        if (!disk) cells.push(['Disk full in', '–', info.parts.disk.reason]);
        else if (disk.daysUntilFull === null) cells.push(['Disk full in', 'Not growing', `${disk.gbPerDay} GB per day over the last ${disk.spanDays} days`]);
        else cells.push(['Disk full in', hardwareDaysWords(disk.daysUntilFull), `growing ${disk.gbPerDay} GB per day over the last ${disk.spanDays} days`]);
        box.innerHTML = cells.map(([l, v, h]) => `<div><span class="ui-fact-label">${escapeHtmlSafe(l)}</span><span class="ui-fact-value">${escapeHtmlSafe(v)}</span><span class="ui-fact-hint">${escapeHtmlSafe(h)}</span></div>`).join('');
    }
    const rough = document.getElementById('hardware-forecast-rough');
    if (rough) {
        const show = forecastMode && !!(info.check && info.check.rough);
        rough.hidden = !show;
        const text = show ? `Rough guide. ${hardwareRoughLines(info.check).join(' ')}` : '';
        if (rough.textContent !== text) rough.textContent = text;
    }
    set('hardware-forecast-method', forecastMode && info.method ? `Method: ${info.method}` : '');
}
// <Jun Kai end>

// 300 hours -> "13 days": how far back the samples go
function hardwareHistoryWords(hours) {
    if (!hours || hours < 1) return 'less than an hour';
    if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`;
    return `${Math.round(hours / 24)} days`;
}

function hardwareDateWords(iso) {
    return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Why a forecast is only a rough guide, in plain sentences, for the note under the graph in Forecast mode. check comes
// from the server (forecast.check).
function hardwareRoughLines(check) {
    const horizon = hardwareHorizonWords(check.horizonHours);
    // <Jun Kai start> a long forecast also counts the daily summaries, which are kept for good
    const history = check.keptForGood ? 'The hardware history on this PC (the samples and the daily summaries)' : 'The samples on this PC';
    const lines = [`${history} go${check.keptForGood ? 'es' : ''} back ${hardwareHistoryWords(check.historyHours)} and the forecast looks ${horizon} ahead. A forecast is dependable for about as far ahead as the history goes back.`];
    // <Jun Kai end>
    if (check.reason === 'retention') lines.push(`Samples are kept for ${hardwareSpell('retention', check.retentionDays)}, so the history can never reach ${horizon}. Set "Keep samples for" in Settings to at least ${hardwareSpell('retention', check.neededRetentionDays)} to let it get there.`);
    else if (check.dependableAt) lines.push(`While the sampler keeps running it becomes dependable around ${hardwareDateWords(check.dependableAt)}.`);
    return lines;
}

function renderHardwareSettings(overview) {
    const settings = overview.settings || {};
    const sampler = overview.sampler || {};
    const stored = overview.stored || {};
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    if (overview.limits) hardwareLimits = { ...hardwareLimits, ...overview.limits };
    hardwareRetentionDays = settings.retentionDays || 30;
    hardwareIntervalSeconds = settings.intervalSeconds || 60;
    hardwareSaved = { ...settings };
    set('hardware-interval-text', hardwareSpell('interval', settings.intervalSeconds || 60));
    set('hardware-retention-text', hardwareSpell('retention', settings.retentionDays || 30));
    // <Jun Kai/> the fields are filled when the Settings drawer opens (openHardwareSettings), never under someone's typing
    const details = document.getElementById('hardware-sampler-details');
    if (!details) return;
    const rows = [
        ['GPU reading', `${HARDWARE_GPU_SOURCE[sampler.gpu && sampler.gpu.source] || '–'}${sampler.gpu && sampler.gpu.name ? ` (${sampler.gpu.name})` : ''}`],
        ['Samples stored', `${(stored.total || 0).toLocaleString('en-SG')} in total, ${(stored.last24h || 0).toLocaleString('en-SG')} in the last 24 hours`],
        // <Jun Kai start>
        ['Daily summaries', stored.daily && stored.daily.days ? `${stored.daily.days.toLocaleString('en-SG')} day(s) since ${hardwareDateWords(`${stored.daily.oldest}T00:00:00Z`)}, kept for good` : stored.daily && stored.daily.missing ? 'table missing: run npm run db:migrate' : 'none yet (one is added for each finished day)'],
        // <Jun Kai end>
        ['Oldest sample', stored.oldestAt ? `${hardwareDateWords(stored.oldestAt)} (${hardwareHistoryWords((Date.now() - new Date(stored.oldestAt).getTime()) / 3600000)} ago)` : 'none yet'],
        ['Last sample', sampler.lastSampledAt ? `${hardwareTimeLabel(new Date(sampler.lastSampledAt).getTime(), true)} (${hardwareAgo(sampler.lastSampledAt)})` : 'none yet'],
        ['Last error', sampler.lastError || 'none']
    ];
    details.innerHTML = rows.map(([k, v]) => `<dt>${escapeHtmlSafe(k)}</dt><dd>${escapeHtmlSafe(v)}</dd>`).join('');
}

function renderHardwareTable() {
    const body = document.getElementById('hardware-table-body');
    if (!body) return;
    const cell = (v) => (v === null || v === undefined ? '<td class="ui-muted">–</td>' : `<td>${Number(v).toFixed(1)}</td>`);
    const rows = hardwareLastPoints.slice(-200).reverse();
    body.innerHTML = rows.length
        ? rows.map((p) => `<tr><td class="hw-table-time">${escapeHtmlSafe(hardwareTimeLabel(p.t, true))}</td>${cell(p.cpu)}${cell(p.memory)}${cell(p.gpu)}${cell(p.disk)}<td class="ui-muted">${p.n}</td></tr>`).join('')
        : '<tr><td colspan="6" class="ui-empty">No samples in this range yet</td></tr>';
}

function hardwareShowError(message) {
    const pill = document.getElementById('hardware-sampler-pill');
    if (pill) { pill.className = 'ui-pill ui-pill-down'; pill.innerHTML = `<span class="ui-dot"></span>${escapeHtmlSafe(`Could not load: ${message}`)}`; }
}

// <Jun Kai start> a graph the server refused (a forecast length it does not accept, for example) says why on the graph
function hardwareSeriesError(message) {
    const note = document.getElementById('hardware-series-note');
    if (note) {
        note.textContent = `Could not load the graph: ${message}`;
        note.classList.add('is-error');
    }
    if (hardwareDrawn) return;
    for (const key of ['all', ...HARDWARE_METRICS]) {
        const empty = document.getElementById(`hardware-${key}-empty`);
        if (empty) { empty.hidden = false; empty.textContent = `Could not load the graph: ${message}`; }
    }
}
// <Jun Kai end>

async function loadHardware() {
    const page = document.getElementById('hardware-page');
    if (!page) return;
    // <Jun Kai start> the view this admin left (Past or Forecast, with their ranges), read once per visit of the admin page
    if (!hardwareViewLoaded) {
        hardwareViewLoaded = true;
        hardwareLoadView();
        hardwareRangeButtons();
        hardwarePartWords();
    }
    // <Jun Kai end>
    // <Jun Kai start> the open CPU, memory, GPU or disk incident above the graphs (incidents.js), with every refresh
    if (typeof loadHardwareIncidentNote === 'function') loadHardwareIncidentNote();
    // <Jun Kai end>
    if (hardwareLoading) { hardwarePendingReload = true; return; }
    hardwareLoading = true;
    ensureHardwareCharts();
    const grid = document.getElementById('hardware-charts');
    const button = document.getElementById('hardware-refresh-btn');
    if (grid && hardwareDrawn) grid.classList.add('is-loading');
    if (button) button.disabled = true;
    let stage = 'overview'; // <Jun Kai/> which answer failed, so a refused graph says why on the graph
    try {
        const asked = hardwareSeriesUrl(); // <Jun Kai/>
        const [overviewResponse, seriesResponse] = await Promise.all([
            fetch('/api/admin/hardware/overview', { cache: 'no-store' }),
            fetch(asked, { cache: 'no-store' })
        ]);
        const overview = await overviewResponse.json();
        if (!overviewResponse.ok || !overview.success) throw new Error(overview.error || 'Overview failed');
        // <Jun Kai start> while the live reading keeps coming the cards keep it, instead of jumping back to the stored sample
        const latest = hardwareLatest(overview.overview.latest);
        renderHardwareSamplerPill(overview.overview.sampler || {});
        renderHardwareCards({ ...overview.overview, latest });
        // <Jun Kai end>
        // <Jun Kai start> the alert lines first, so the part cards are judged by them
        hardwareLastOverview = overview.overview;
        renderHardwareSettings(overview.overview);
        renderHardwareAlerts(overview.overview);
        if (hardwareDrawerWaiting) fillHardwareDrawer(); // the drawer was opened before the first load
        renderHardwareKeys({ latest }); // <Jun Kai/> the live reading when there is one
        // <Jun Kai end>
        stage = 'series'; // <Jun Kai/>
        const series = await seriesResponse.json();
        if (!seriesResponse.ok || !series.success) throw new Error(series.error || 'Series failed');
        // <Jun Kai start> the view changed while this was on its way: the load that follows draws the new one
        if (asked !== hardwareSeriesUrl()) return;
        // the first answer brings the saved forecast length; from then on this browser keeps its own
        if (!hardwareHorizon && series.forecast && series.forecast.horizonHours) {
            hardwareHorizon = series.forecast.horizonHours;
            hardwareSaveView();
            hardwareRangeButtons();
        }
        // <Jun Kai end>
        renderHardwareSeries(series);
        // <Jun Kai start> kept for the facts, the cards' forecast line and the Past / Forecast switch
        hardwareLastForecast = series.forecast;
        renderHardwareForecast(series.forecast, latest);
        renderHardwareFacts(latest);
        // <Jun Kai end>
        if (hardwareTableOpen) renderHardwareTable();
    } catch (error) {
        console.error('❌ Error loading hardware:', error);
        hardwareShowError(error.message);
        if (stage === 'series') hardwareSeriesError(error.message); // <Jun Kai/>
    } finally {
        hardwareLoading = false;
        if (grid) grid.classList.remove('is-loading');
        if (button) button.disabled = false;
        if (hardwarePendingReload) { hardwarePendingReload = false; loadHardware(); }
    }
}

// <Jun Kai start> the chips are the same buttons in both modes: the last ... (Past) or the next ... (Forecast)
const hardwareHorizonChip = (hours) => Object.keys(HARDWARE_HORIZONS).find((key) => HARDWARE_HORIZONS[key] === hours) || null;

function hardwareRangeButtons() {
    const forecastMode = hardwareMode === 'forecast';
    const customRange = forecastMode ? null : hardwareCustomRange(hardwareRange);
    const chip = forecastMode ? hardwareHorizonChip(hardwareHorizon) : customRange ? null : hardwareRange;
    document.querySelectorAll('#hardware-range .hw-seg-btn').forEach((btn) => {
        const on = btn.dataset.range === (chip || 'custom');
        btn.classList.toggle('active', on);
        if (btn.dataset.range !== 'custom') btn.setAttribute('aria-pressed', String(on));
    });
    const button = document.getElementById('hardware-range-custom-btn');
    if (button) button.textContent = chip ? 'Custom' : forecastMode ? hardwareHorizonWords(hardwareHorizon) : hardwareRangeWords(customRange.amount, customRange.unit);
    document.querySelectorAll('#hardware-mode .hw-seg-btn').forEach((btn) => {
        const on = btn.dataset.mode === hardwareMode;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
    const word = document.getElementById('hardware-range-word');
    if (word) word.textContent = forecastMode ? 'Next' : 'Last';
    const group = document.getElementById('hardware-range');
    if (group) group.setAttribute('aria-label', forecastMode ? 'Forecast the next' : 'Show the last');
}

// Past or Forecast: each keeps its own choice of chip
function setHardwareMode(mode) {
    if (mode !== 'past' && mode !== 'forecast') return;
    closeHardwareRangeForm(false);
    if (mode === hardwareMode) return;
    hardwareMode = mode;
    if (mode === 'forecast' && !hardwareHorizon) hardwareHorizon = 24;
    hardwareRangeButtons();
    hardwareSaveView();
    if (hardwareLastForecast) renderHardwareForecast(hardwareLastForecast, hardwareLatest(hardwareLastOverview && hardwareLastOverview.latest));
    hardwarePartWords();
    loadHardware();
}

// How far ahead in Forecast mode, in hours (1 hour to 1 year)
function setHardwareHorizon(hours) {
    if (!Number.isInteger(hours) || hours < 1 || hours > HARDWARE_HORIZON_MAX) return;
    const changed = hours !== hardwareHorizon;
    hardwareHorizon = hours;
    hardwareRangeButtons();
    if (!changed) return;
    hardwareSaveView();
    loadHardware();
}
// <Jun Kai end>

// A chip: a preset range ("7d") in Past mode, a forecast length in Forecast mode; a custom range that equals a preset
// uses the preset button
function setHardwareRange(range) {
    closeHardwareRangeForm(false);
    // <Jun Kai start>
    if (hardwareMode === 'forecast') {
        if (HARDWARE_HORIZONS[range]) setHardwareHorizon(HARDWARE_HORIZONS[range]);
        return;
    }
    // <Jun Kai end>
    const key = HARDWARE_RANGE_SAME[range] || range;
    if (!HARDWARE_RANGES[key] && !hardwareCustomRange(key)) return;
    const changed = key !== hardwareRange;
    hardwareRange = key;
    hardwareRangeButtons();
    if (!changed) return;
    hardwareSaveView(); // <Jun Kai/>
    loadHardware();
}

function toggleHardwareRangeForm() {
    const form = document.getElementById('hardware-range-form');
    if (!form) return;
    if (!form.hidden) {
        closeHardwareRangeForm(true);
        return;
    }
    bindHardwareRangeForm();
    const amount = document.getElementById('hardware-range-amount');
    const unit = document.getElementById('hardware-range-unit');
    // <Jun Kai start> Forecast: the next ... up to 1 year, in the units of the saved forecast length
    const label = document.getElementById('hardware-range-label');
    if (label) label.textContent = hardwareMode === 'forecast' ? 'Forecast the next' : 'Show the last';
    if (hardwareMode === 'forecast') {
        const hours = hardwareHorizonChip(hardwareHorizon) ? 2160 : hardwareHorizon;
        const [key, size] = Object.entries(HARDWARE_HORIZON_UNITS).sort((a, b) => b[1] - a[1]).find(([, step]) => hours % step === 0);
        unit.value = key;
        amount.value = String(hours / size);
    } else {
        const current = hardwareCustomRange(hardwareRange);
        unit.value = current ? current.unit : 'mo';
        amount.value = String(current ? current.amount : 3);
    }
    // <Jun Kai end>
    hardwareRangeHint('');
    form.hidden = false;
    document.getElementById('hardware-range-custom-btn').setAttribute('aria-expanded', 'true');
    amount.focus();
    amount.select();
}

function closeHardwareRangeForm(focusButton) {
    const form = document.getElementById('hardware-range-form');
    if (!form || form.hidden) return;
    form.hidden = true;
    const button = document.getElementById('hardware-range-custom-btn');
    if (!button) return;
    button.setAttribute('aria-expanded', 'false');
    if (focusButton) button.focus();
}

function hardwareRangeHint(error) {
    const hint = document.getElementById('hardware-range-hint');
    const amount = document.getElementById('hardware-range-amount');
    if (hint) {
        hint.textContent = error || (hardwareMode === 'forecast' ? 'From 1 hour to 1 year.' : 'From 1 hour to 5 years.'); // <Jun Kai/>
        hint.classList.toggle('is-error', !!error);
    }
    if (amount && error) amount.setAttribute('aria-invalid', 'true');
    else if (amount) amount.removeAttribute('aria-invalid');
}

function applyHardwareCustomRange(event) {
    if (event) event.preventDefault();
    const amountInput = document.getElementById('hardware-range-amount');
    const unit = document.getElementById('hardware-range-unit').value;
    const amount = Number(amountInput.value);
    const forecastMode = hardwareMode === 'forecast'; // <Jun Kai/>
    let error = '';
    if (!amountInput.value.trim() || !Number.isInteger(amount) || amount < 1) error = 'Enter a whole number.';
    else if (forecastMode && amount * HARDWARE_HORIZON_UNITS[unit] > HARDWARE_HORIZON_MAX) error = 'Choose up to 1 year.'; // <Jun Kai/>
    else if (!forecastMode && amount > HARDWARE_RANGE_MAX[unit]) error = 'Choose up to 5 years.';
    if (error) {
        hardwareRangeHint(error);
        amountInput.focus();
        return;
    }
    // <Jun Kai start>
    if (forecastMode) {
        closeHardwareRangeForm(false);
        setHardwareHorizon(amount * HARDWARE_HORIZON_UNITS[unit]);
    } else setHardwareRange(`${amount}${unit}`);
    // <Jun Kai end>
    const button = document.getElementById('hardware-range-custom-btn');
    if (button) button.focus();
}

// Escape and a click outside close the custom range form
function bindHardwareRangeForm() {
    const form = document.getElementById('hardware-range-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';
    form.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closeHardwareRangeForm(true);
    });
    document.addEventListener('mousedown', (event) => {
        const wrap = document.getElementById('hardware-range-wrap');
        if (!form.hidden && wrap && !wrap.contains(event.target)) closeHardwareRangeForm(false);
    });
}

function toggleHardwareTable() {
    hardwareTableOpen = !hardwareTableOpen;
    const table = document.getElementById('hardware-table-card');
    const charts = document.getElementById('hardware-charts');
    const button = document.getElementById('hardware-table-btn');
    if (table) table.hidden = !hardwareTableOpen;
    if (charts) charts.hidden = hardwareTableOpen;
    if (button) button.textContent = hardwareTableOpen ? 'Graph view' : 'Table view';
    hardwarePartWords();
    if (hardwareTableOpen) renderHardwareTable();
    else ensureHardwareCharts();
}

// 90 -> "90 seconds", 600 -> "10 minutes", 48 hours -> "2 days"
function hardwareSpell(name, value) {
    for (const [factor, word] of HARDWARE_SETTING_FIELDS[name].words) {
        if (value % factor === 0) {
            const n = value / factor;
            return `${n} ${word}${n === 1 ? '' : 's'}`;
        }
    }
    return String(value);
}

function hardwareFieldParts(name) {
    const get = (suffix) => document.getElementById(`hardware-${name}${suffix}`);
    return { select: get(''), box: get('-custom'), amount: get('-amount'), unit: get('-unit'), hint: get('-hint') };
}

function hardwareShowCustom(name, show) {
    const { box, amount, hint } = hardwareFieldParts(name);
    const [min, max] = hardwareLimits[HARDWARE_SETTING_FIELDS[name].key];
    if (box) box.hidden = !show;
    if (amount) amount.removeAttribute('aria-invalid');
    if (hint) {
        hint.hidden = !show;
        hint.classList.remove('is-error');
        hint.textContent = `From ${hardwareSpell(name, min)} to ${hardwareSpell(name, max)}.`;
    }
}

// the largest unit that divides the value: 180 seconds -> 3 minutes, 36 hours -> 36 hours
function hardwareSetAmount(name, value) {
    const { amount, unit } = hardwareFieldParts(name);
    if (!amount) return;
    let factor = 1;
    if (unit) {
        factor = [...unit.options].map((o) => Number(o.value)).sort((a, b) => b - a).find((f) => value % f === 0) || 1;
        unit.value = String(factor);
    }
    amount.value = String(value / factor);
}

// A saved value goes back into its preset, or into Custom when no preset has it
function fillHardwareField(name, value) {
    const { select } = hardwareFieldParts(name);
    if (!select) return;
    const preset = [...select.options].some((o) => o.value === String(value));
    select.value = preset ? String(value) : 'custom';
    select.dataset.last = String(value);
    if (!preset) hardwareSetAmount(name, value);
    hardwareShowCustom(name, !preset);
}

// onchange of a select: Custom opens the number box with the value that was chosen before
function hardwareSettingChanged(name) {
    const { select, amount } = hardwareFieldParts(name);
    if (!select) return;
    if (select.value !== 'custom') {
        select.dataset.last = select.value;
        hardwareShowCustom(name, false);
        return;
    }
    hardwareSetAmount(name, Number(select.dataset.last) || hardwareLimits[HARDWARE_SETTING_FIELDS[name].key][0]);
    hardwareShowCustom(name, true);
    if (amount) amount.focus();
}

// { value } or { error } for one setting
function readHardwareField(name) {
    const { select, amount, unit } = hardwareFieldParts(name);
    if (select.value !== 'custom') return { value: Number(select.value) };
    const typed = Number(amount.value);
    if (!amount.value.trim() || !Number.isInteger(typed) || typed < 1) return { error: 'Enter a whole number.' };
    const value = typed * (unit ? Number(unit.value) : 1);
    const [min, max] = hardwareLimits[HARDWARE_SETTING_FIELDS[name].key];
    if (value < min || value > max) return { error: `Choose from ${hardwareSpell(name, min)} to ${hardwareSpell(name, max)}.` };
    return { value };
}

function hardwareFieldError(name, message) {
    const { amount, hint } = hardwareFieldParts(name);
    if (hint) {
        hint.hidden = false;
        hint.textContent = message;
        hint.classList.add('is-error');
    }
    if (amount) {
        amount.setAttribute('aria-invalid', 'true');
        amount.focus();
    }
}

// <Jun Kai start>
// ---- the Settings drawer (17 Nov 2026): Forecast sampling, Alert lines and the sampler's details, one Save ----
// Sampling can be saved by any signed-in admin (PUT /settings); the alert lines by a System Admin only (PUT /alert-lines).
// Save sends only the part that changed; Esc, Cancel or a click beside the drawer drop what was typed.
const hardwareIsSystemAdmin = () => { try { return sessionStorage.getItem('userRole') === 'system_admin'; } catch { return false; } };
let hardwareDrawerBusy = false;
let hardwareDrawerWaiting = false; // opened before the first load: filled as soon as the saved settings arrive

function hardwareDrawerStatus(text, tone) {
    const status = document.getElementById('hardware-drawer-status');
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('is-dirty', tone === 'dirty');
    status.classList.toggle('is-error', tone === 'error');
}

// a sampling field that differs from the saved value, or a Custom box that cannot be read yet
function hardwareSamplingDirty() {
    if (!hardwareSaved) return false;
    return Object.entries(HARDWARE_SETTING_FIELDS).some(([name, field]) => {
        const read = readHardwareField(name);
        return !!read.error || read.value !== hardwareSaved[field.key];
    });
}

// after every change in the drawer: "Unsaved changes", and the defaults link greys out at the defaults
function hardwareDrawerChanged() {
    if (hardwareDrawerBusy) return;
    const status = document.getElementById('hardware-drawer-status');
    if (hardwareSamplingDirty() || hardwareAlertsDirty()) hardwareDrawerStatus('Unsaved changes', 'dirty');
    else if (status && (status.classList.contains('is-dirty') || status.classList.contains('is-error'))) hardwareDrawerStatus('', '');
    const atDefaults = HARDWARE_METRICS.every((key) => ['warn', 'critical'].every((kind) => {
        const input = document.getElementById(`hardware-alert-${key}-${kind}`);
        return input && input.value.trim() === String(hardwareAlertDefaults[key][kind]);
    }));
    const reset = document.getElementById('hardware-alerts-defaults');
    if (reset) reset.disabled = !hardwareIsSystemAdmin() || atDefaults;
}

// the saved values, every time the drawer opens
function fillHardwareDrawer() {
    const save = document.getElementById('hardware-settings-save');
    hardwareDrawerWaiting = !hardwareSaved;
    if (save) save.disabled = hardwareDrawerWaiting;
    if (hardwareDrawerWaiting) {
        hardwareDrawerStatus('Loading the saved settings', '');
        return;
    }
    for (const [name, field] of Object.entries(HARDWARE_SETTING_FIELDS)) {
        if (hardwareSaved[field.key] !== undefined) fillHardwareField(name, hardwareSaved[field.key]);
    }
    fillHardwareAlertRows(hardwareAlerts);
    const admin = hardwareIsSystemAdmin();
    document.querySelectorAll('#hardware-alerts-rows input').forEach((input) => { input.disabled = !admin; });
    const note = document.getElementById('hardware-alerts-admin');
    if (note) note.hidden = admin;
    hardwareDrawerStatus('', '');
    hardwareDrawerChanged();
}

function bindHardwareDrawer(drawer) {
    if (drawer.dataset.bound) return;
    drawer.dataset.bound = '1';
    drawer.addEventListener('cancel', (event) => { event.preventDefault(); closeHardwareSettings(); });
    drawer.addEventListener('click', (event) => { if (event.target === drawer) closeHardwareSettings(); });
    drawer.addEventListener('close', () => { drawer.classList.remove('is-closing'); });
    drawer.addEventListener('input', hardwareDrawerChanged);
    drawer.addEventListener('change', hardwareDrawerChanged);
}

function openHardwareSettings() {
    const drawer = document.getElementById('hardware-drawer');
    if (!drawer || typeof drawer.showModal !== 'function') return;
    bindHardwareDrawer(drawer);
    fillHardwareDrawer();
    drawer.classList.remove('is-closing');
    if (!drawer.open) drawer.showModal();
}

function closeHardwareSettings() {
    const drawer = document.getElementById('hardware-drawer');
    if (!drawer || !drawer.open || drawer.classList.contains('is-closing')) return;
    hardwareDrawerWaiting = false;
    if (HARDWARE_REDUCE_MOTION) {
        drawer.close();
        return;
    }
    drawer.classList.add('is-closing');
    setTimeout(() => { if (drawer.open) drawer.close(); }, 180);
}

async function saveHardwareSettings() {
    if (hardwareDrawerBusy || hardwareDrawerWaiting) return;
    // the forecast length is picked on the graph now (17 Nov 2026): the saved one goes back unchanged
    const sampling = { forecastHours: hardwareSaved.forecastHours };
    for (const [name, field] of Object.entries(HARDWARE_SETTING_FIELDS)) {
        const result = readHardwareField(name);
        if (result.error) {
            hardwareFieldError(name, result.error);
            hardwareDrawerStatus(result.error, 'error');
            return;
        }
        sampling[field.key] = result.value;
    }
    let alerts = null;
    if (hardwareIsSystemAdmin() && hardwareAlertsDirty()) {
        const read = readHardwareAlerts();
        if (read.error) {
            hardwareDrawerStatus(read.error, 'error');
            if (read.input) { read.input.setAttribute('aria-invalid', 'true'); read.input.focus(); }
            return;
        }
        alerts = read.alerts;
    }
    const samplingChanged = Object.values(HARDWARE_SETTING_FIELDS).some((field) => sampling[field.key] !== hardwareSaved[field.key]);
    if (!samplingChanged && !alerts) {
        closeHardwareSettings();
        return;
    }
    await hardwareSaveAll({ sampling: samplingChanged ? sampling : null, alerts });
}

// PUT one part; a refused alert line is marked in the drawer
async function hardwarePut(url, body) {
    const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
        const failed = data.field ? document.getElementById(`hardware-alert-${String(data.field).replace('.', '-')}`) : null;
        if (failed) { failed.setAttribute('aria-invalid', 'true'); failed.focus(); }
        throw new Error(data.error || 'Save failed');
    }
    return data;
}

// The changed parts, sampling first; on a failure the drawer stays open and says which part was saved
async function hardwareSaveAll(pending) {
    const buttons = ['hardware-settings-save', 'hardware-settings-cancel'].map((id) => document.getElementById(id)).filter(Boolean);
    hardwareDrawerBusy = true;
    buttons.forEach((button) => { button.disabled = true; });
    hardwareDrawerStatus('Saving', '');
    const saved = [];
    try {
        if (pending.sampling) {
            await hardwarePut('/api/admin/hardware/settings', pending.sampling);
            hardwareSaved = { ...hardwareSaved, ...pending.sampling };
            saved.push('sampling');
        }
        if (pending.alerts) {
            const data = await hardwarePut('/api/admin/hardware/alert-lines', { alerts: pending.alerts });
            hardwareAlerts = data.alerts;
            fillHardwareAlertRows(hardwareAlerts);
            saved.push('alerts');
        }
        closeHardwareSettings();
        showNotification('Hardware settings saved', 'success');
    } catch (error) {
        hardwareDrawerStatus(saved.includes('sampling') ? `The sampling settings were saved, but the alert lines were not: ${error.message}` : `Could not save: ${error.message}`, 'error');
    } finally {
        hardwareDrawerBusy = false;
        buttons.forEach((button) => { button.disabled = false; });
        if (saved.includes('alerts')) {
            if (hardwareLastOverview) renderHardwareKeys({ latest: hardwareLatest(hardwareLastOverview.latest) });
            Object.values(hardwareCharts).forEach((chart) => chart.update('none'));
            hardwarePartWords();
        }
        if (saved.length) loadHardware();
    }
}
// <Jun Kai end>

// <Jun Kai start>
// ---- the alert lines: amber and red per part, in the Settings drawer (a System Admin saves them; others see them) ----
function hardwareAlertRows(values) {
    const [warnMin, warnMax] = hardwareAlertLimits.warn;
    const [critMin, critMax] = hardwareAlertLimits.critical;
    const field = (key, kind, min, max, word) => `<span class="hw-alerts-field"><input class="ui-input" type="number" id="hardware-alert-${key}-${kind}" min="${min}" max="${max}" step="1" inputmode="numeric" value="${values[key][kind]}" aria-label="${HARDWARE_NAMES[key]}, ${word} from, in percent" oninput="hardwareAlertsChanged()"><span aria-hidden="true">%</span></span>`;
    return HARDWARE_METRICS.map((key) => `<tr>
                    <th scope="row"><span class="hw-alerts-dot hw-c-${key}" aria-hidden="true"></span>${HARDWARE_NAMES[key]}</th>
                    <td>${field(key, 'warn', warnMin, warnMax, 'amber')}</td>
                    <td>${field(key, 'critical', critMin, critMax, 'red')}</td>
                </tr>`).join('');
}

// The lines on screen, or { error, input } for the first one that cannot be saved
function readHardwareAlerts() {
    const alerts = {};
    for (const key of HARDWARE_METRICS) {
        alerts[key] = {};
        for (const kind of ['warn', 'critical']) {
            const input = document.getElementById(`hardware-alert-${key}-${kind}`);
            const n = input && input.value.trim() !== '' ? Number(input.value) : NaN;
            const [min, max] = hardwareAlertLimits[kind];
            if (!Number.isInteger(n) || n < min || n > max) return { error: `${HARDWARE_NAMES[key]} ${kind === 'warn' ? 'amber' : 'red'}: enter a whole number from ${min} to ${max}.`, input };
            alerts[key][kind] = n;
        }
        if (alerts[key].critical <= alerts[key].warn) return { error: `${HARDWARE_NAMES[key]}: red must be higher than amber.`, input: document.getElementById(`hardware-alert-${key}-critical`) };
    }
    return { alerts };
}

// the inputs against some lines: the saved ones ("Unsaved changes") or the ones last filled in (has someone typed?)
const hardwareAlertsDiffer = (lines) => HARDWARE_METRICS.some((key) => ['warn', 'critical'].some((kind) => {
    const input = document.getElementById(`hardware-alert-${key}-${kind}`);
    return input && String(lines[key][kind]) !== input.value.trim();
}));
const hardwareAlertsDirty = () => hardwareAlertsDiffer(hardwareAlerts);
function fillHardwareAlertRows(lines) {
    const rows = document.getElementById('hardware-alerts-rows');
    if (!rows) return;
    rows.innerHTML = hardwareAlertRows(lines);
}

// While typing in a line: the red mark of a refused value goes, and the drawer says whether anything changed
function hardwareAlertsChanged() {
    document.querySelectorAll('#hardware-alerts-rows [aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    hardwareDrawerChanged();
}

// From the overview: the saved lines, their defaults and limits (the drawer shows them when it opens; lines saved
// meanwhile by another admin come in with the next refresh)
function renderHardwareAlerts(overview) {
    if (overview.alerts) hardwareAlerts = overview.alerts;
    if (overview.alertDefaults) hardwareAlertDefaults = overview.alertDefaults;
    if (overview.alertLimits) hardwareAlertLimits = overview.alertLimits;
    hardwarePartWords();
}

function useHardwareAlertDefaults() {
    if (!hardwareIsSystemAdmin()) return;
    for (const key of HARDWARE_METRICS) {
        for (const kind of ['warn', 'critical']) {
            const input = document.getElementById(`hardware-alert-${key}-${kind}`);
            if (input) input.value = String(hardwareAlertDefaults[key][kind]);
        }
    }
    hardwareAlertsChanged();
    // the link greys out now, so the focus goes to the first value
    const first = document.querySelector('#hardware-alerts-rows input');
    if (first) first.focus();
}
// <Jun Kai end>

function startHardwarePolling() {
    if (hardwareTimer) clearInterval(hardwareTimer);
    hardwareTimer = setInterval(() => {
        const page = document.getElementById('hardware-page');
        if (page && page.classList.contains('active') && sessionStorage.getItem('loggedUser')) loadHardware();
    }, 60000);
    // <Jun Kai start> the part cards every second; the timer stops by itself when the page closes
    if (hardwareLiveTimer) clearInterval(hardwareLiveTimer);
    hardwareLiveTimer = setInterval(tickHardwareLive, HARDWARE_LIVE_MS);
    // <Jun Kai end>
}
// <Jun Kai end>

// <Jun Kai start> one live reading: skipped while the tab is hidden, before the first full load, or while the last
// one is still on its way, so a slow answer never piles requests up
async function tickHardwareLive() {
    const page = document.getElementById('hardware-page');
    if (!page || !page.classList.contains('active') || !sessionStorage.getItem('loggedUser')) {
        clearInterval(hardwareLiveTimer);
        hardwareLiveTimer = null;
        hardwareLive = null;
        return;
    }
    if (document.hidden || hardwareLiveBusy || !hardwareLastOverview) return;
    hardwareLiveBusy = true;
    try {
        const response = await fetch('/api/admin/hardware/live', { cache: 'no-store' });
        const body = await response.json();
        if (!response.ok || !body.success) return;
        hardwareLive = { ...body.live, live: true, receivedAt: Date.now() };
        renderHardwareCards({ ...hardwareLastOverview, latest: hardwareLive });
        renderHardwareKeys({ latest: hardwareLive });
        renderHardwareNow(hardwareLive);
    } catch {
        // a missed reading: the next tick asks again; if the answers stop, the minute refresh puts the stored sample back
    } finally {
        hardwareLiveBusy = false;
    }
}
// <Jun Kai end>

// <Jun Kai start> Light / Dark mode: the graphs take the new colours at once (frontend/admin/js/colorScheme.js sends the event)
window.addEventListener('admin-color-scheme', () => {
    const page = document.getElementById('hardware-page');
    if (page && page.classList.contains('active')) loadHardware();
});
// <Jun Kai end>
