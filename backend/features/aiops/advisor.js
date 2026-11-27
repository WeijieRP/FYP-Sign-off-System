// Owner: Role 3, Jun Kai.
// AIOps part 2, the advisor. For an open incident it asks the local LLM (Ollama, JSON mode) for the likely causes and
// ONE next step from a fixed list, using only that incident's own evidence: its numbers, its timeline and up to three
// earlier incidents of the same kind that an admin marked "Correct" (how the advice learns from the verdicts). It
// never runs anything: the step is a suggestion for the admin. When Ollama is off, too slow or answers nonsense,
// rule-based advice is given instead. Each answer is kept as an 'advice' event on the incident's timeline.
// Its own switch (advisor.enabled) in the incident settings; Anomaly detection off does not touch it. With Local AI
// models off (localAi) it never asks Ollama and gives the rule-based advice.
// <Jun Kai start>
const ACTIONS = {
    none: 'Nothing to do yet: keep an eye on it',
    'close-heavy-apps': 'Close programs that use a lot of CPU or memory on the server PC',
    'restart-kiosk-server': 'Restart the kiosk server (Operating Hours page)',
    'check-mysql': 'Check that the MySQL service is running (Windows Services)',
    'free-disk-space': 'Free disk space on the server PC (old files, the recycle bin, other programs)',
    'run-archive-now': 'Archive old visitor records and their photos (Visitor Data Archive page)',
    'check-mail-login': 'Check the mail account (Mail Account page)',
    'check-tablet': 'Check the tablet: power, Wi-Fi and the kiosk page',
    'review-server-log': 'Read the server log lines around the error (logs folder)'
};
const LIKELIHOOD = ['high', 'medium', 'low'];
const MAX = { summary: 400, cause: 200, why: 300, causes: 3, examples: 3, points: 12, events: 12, text: 300 };
const TIMEOUT_MS = 120 * 1000;      // a 3B model on a CPU can take a minute
const AGAIN_AFTER_MS = 30 * 1000;   // "Ask again" for one incident at most this often
const ADVISED = new Set(['opened', 'reopened', 'severity']); // events after which an incident needs (new) advice
const LOCAL_AI_OFF = 'AI is switched off on the AI Settings page'; // <Jun Kai/>

const cut = (value, max) => String(value === null || value === undefined ? '' : value).slice(0, max);

// The incident's evidence without the long point list: numbers, short texts and the last values of the line
function evidenceOf(incident) {
    const evidence = incident && incident.evidence && typeof incident.evidence === 'object' ? incident.evidence : {};
    const out = {};
    for (const [key, value] of Object.entries(evidence)) {
        if (key === 'points') continue;
        if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
        else if (typeof value === 'string') out[key] = cut(value, MAX.text);
        else if (Array.isArray(value)) out[key] = value.slice(0, 10).map((v) => (v && typeof v === 'object' ? cut(JSON.stringify(v), MAX.text) : cut(v, MAX.text)));
    }
    if (Array.isArray(evidence.points)) {
        const values = evidence.points.map((p) => (p && typeof p.v === 'number' ? p.v : null)).filter((v) => v !== null);
        if (values.length) out.lastValues = values.slice(-MAX.points);
    }
    return out;
}

// What the model is told: who it helps, the answer shape, the step list, and the incident as JSON. Only the
// incident's own data goes in (no visitor records); everything stays on this PC (Ollama runs locally).
function buildPrompt(incident, events = [], examples = []) {
    const steps = Object.entries(ACTIONS).map(([key, text]) => `- ${key}: ${text}`).join('\n');
    const system = [
        'You help the administrator of a visitor sign-off kiosk at a polytechnic: a Node.js server and a kiosk server on one',
        'Windows PC that hibernates at night, a MySQL database, and tablets that show the kiosk page. Statistical detectors',
        'found the incident below. Answer with JSON only, in exactly this shape:',
        '{"summary": "...", "causes": [{"cause": "...", "likelihood": "high|medium|low"}], "action": "...", "why": "..."}',
        'summary: one or two plain sentences on what is happening. causes: at most 3 likely reasons for the problem, the most',
        'likely first; a cause is never one of the steps below.',
        'action: exactly one key from this list:',
        steps,
        'why: one sentence on why that step comes first. Use only the facts given. Do not invent numbers, names or events.',
        'Plain English for a non-technical admin, no markdown.'
    ].join('\n');
    const facts = {
        incident: {
            detector: incident.detector, kind: incident.kind, subject: incident.subject, severity: incident.severity,
            status: incident.status, title: cut(incident.title, MAX.text), explanation: cut(incident.explanation, 600),
            openedAt: incident.opened_at, lastSeenAt: incident.last_seen_at, occurrences: incident.occurrences,
            evidence: evidenceOf(incident)
        },
        timeline: (Array.isArray(events) ? events : []).filter((e) => e && e.type !== 'advice').slice(-MAX.events)
            .map((e) => ({ at: e.at, type: e.type })),
        earlierConfirmedIncidents: (Array.isArray(examples) ? examples : []).slice(0, MAX.examples).map((e) => ({
            title: cut(e.title, MAX.text), resolvedAt: e.resolved_at, resolvedBy: e.resolved_by === 'auto' ? 'by itself' : 'by an admin',
            note: e.resolve_note ? cut(e.resolve_note, MAX.text) : null
        }))
    };
    return { system, user: JSON.stringify(facts) };
}

// small models sometimes copy a step from the list into the causes ("close-heavy-apps: Close programs ...")
const STEP_TEXTS = Object.values(ACTIONS).map((t) => t.toLowerCase());
function isStep(text) {
    const lower = String(text).trim().toLowerCase();
    return Object.keys(ACTIONS).some((key) => lower === key || lower.startsWith(`${key}:`) || lower.startsWith(`${key} `)) || STEP_TEXTS.some((t) => lower.endsWith(t));
}

// The model's answer, checked: at most 3 causes, an action from the list (anything else becomes "none"), texts cut
// to size. null when it is not usable advice.
function parseAdvice(raw) {
    let data = raw;
    if (typeof raw === 'string') {
        try { data = JSON.parse(raw); } catch { return null; }
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const summary = typeof data.summary === 'string' ? data.summary.trim().slice(0, MAX.summary) : '';
    const causes = (Array.isArray(data.causes) ? data.causes : []).map((c) => {
        const text = typeof c === 'string' ? c : c && typeof c.cause === 'string' ? c.cause : '';
        const level = c && typeof c.likelihood === 'string' ? c.likelihood.trim().toLowerCase() : '';
        return text.trim() ? { cause: text.trim().slice(0, MAX.cause), likelihood: LIKELIHOOD.includes(level) ? level : 'medium' } : null;
    }).filter(Boolean).filter((c) => !isStep(c.cause)).slice(0, MAX.causes);
    if (!summary && !causes.length) return null;
    const key = typeof data.action === 'string' ? data.action.trim() : '';
    const action = Object.hasOwn(ACTIONS, key) ? key : 'none';
    return { summary, causes, action, why: typeof data.why === 'string' ? data.why.trim().slice(0, MAX.why) : '' };
}

// Advice without the model, from the detector and kind
function ruleAdvice(incident) {
    const detector = incident && incident.detector;
    const kind = String((incident && incident.kind) || '');
    const subject = String((incident && incident.subject) || '');
    const advice = (action, summary, causes, why) => ({ summary, causes: causes.map(([cause, likelihood]) => ({ cause, likelihood })), action, why });
    if (detector === 'disk') {
        return kind === 'full'
            ? advice('free-disk-space', 'The disk of the server PC is almost full.', [['Visitor photos and old files have piled up', 'high'], ['Other programs or downloads on the same drive', 'medium']], 'With a full disk the database and the photo uploads start to fail.')
            : advice('run-archive-now', 'The disk is filling up at a steady rate.', [['Visitor photos are added every day', 'high'], ['Log or temporary files growing', 'low']], 'An archive moves old visitor records and their photos off the server.');
    }
    if (detector === 'services') {
        if (subject === 'database') return advice('check-mysql', kind === 'slow' ? 'The database answers slowly.' : 'The database does not answer.', [['The MySQL service stopped or is starting up', 'high'], ['The PC is short of memory or disk', 'medium']], 'Nothing on the kiosk works without the database.');
        if (subject === 'kiosk') return advice('restart-kiosk-server', 'The kiosk server does not answer.', [['The kiosk server process stopped or hung', 'high'], ['Another program took its port', 'low']], 'The tablets cannot load the kiosk page while it is down.');
        if (subject === 'email') return advice('check-mail-login', 'The mail account cannot log in.', [['The password or app password changed', 'high'], ['No internet connection', 'medium']], 'Thank-you emails are not sent while the login fails.');
        return advice('review-server-log', 'A service check keeps failing.', [['The service stopped', 'medium']], 'The log shows what failed.');
    }
    if (detector === 'tablets') return advice('check-tablet', kind === 'all-offline' ? 'None of the named tablets is reporting.' : 'A named tablet stopped reporting.', kind === 'all-offline' ? [['The Wi-Fi or the network is down', 'high'], ['The server PC changed its address', 'medium']] : [['The tablet is off, asleep or out of battery', 'high'], ['It lost the Wi-Fi', 'medium'], ['The kiosk page was closed', 'medium']], 'A tablet that does not report cannot take sign-offs.');
    if (detector === 'logs') return advice('review-server-log', kind === 'burst' ? 'The server is writing many errors at once.' : 'The server wrote a kind of error it never wrote before.', [['A feature failing again and again', 'high'], ['The database or a file was not reachable for a moment', 'medium']], 'The log lines say which part failed.');
    if (detector === 'drift' && subject === 'disk') return advice('run-archive-now', 'Disk use has been creeping up for hours.', [['Visitor photos and records piling up', 'high']], 'An archive frees space without losing records.');
    if (detector === 'drift') return advice('restart-kiosk-server', 'Memory use has been creeping up for hours.', [['A program slowly holding more memory', 'high'], ['Many browser tabs or apps left open', 'medium']], 'A restart gives the memory back if the kiosk server is the one holding it.');
    if (detector === 'spike' || detector === 'timeOfDay') return advice('close-heavy-apps', 'The PC is much busier than usual.', [['Another program running on the server PC', 'high'], ['Windows updates or a virus scan', 'medium'], ['Many visitors at once', 'low']], 'A busy PC makes the kiosk slow for visitors.');
    return advice('none', 'This incident needs no action yet.', [['A short-lived change', 'medium']], 'Keep an eye on it; it resolves itself when the readings are normal again.');
}

// One question to Ollama's /api/chat in JSON mode; resolves to the parsed advice or throws
async function askOllama({ url, model, prompt, timeoutMs = TIMEOUT_MS, fetchImpl = fetch }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(`${url}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, stream: false, format: 'json', options: { temperature: 0.2 }, messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }] }),
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`Ollama answered HTTP ${response.status}${response.status === 404 ? ` (is the model ${model} pulled?)` : ''}`);
        const body = await response.json();
        const advice = parseAdvice(body && body.message ? body.message.content : null);
        if (!advice) throw new Error('the model did not answer in the expected shape');
        return advice;
    } catch (error) {
        throw error.name === 'AbortError' ? new Error(`no answer within ${Math.round(timeoutMs / 1000)} s`) : error;
    } finally {
        clearTimeout(timer);
    }
}

// The queue around it: one incident at a time (Ollama is slow on a CPU), never the same incident twice at once.
// store: the incident store; settings(): the aiops settings; ask(): askOllama (a fake in the tests).
function createAdvisor({ store, settings, url = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''), ask = askOllama, now = () => Date.now(), aiAllOn = () => require('../aiSettings/store').allOn() }) {
    const queue = [];
    const askedAt = new Map(); // incident id -> ms of the last question, for "Ask again"
    const state = { busy: null, lastError: null, lastAt: null, lastSource: null, done: 0 };
    const conf = () => {
        const current = settings() || {};
        const advisor = current.advisor || {};
        // <Jun Kai/> localAi: the old switch (kept for old settings files) and the AI Settings switch for all AI features
        return { on: advisor.enabled !== false, localAi: current.localAi !== false && aiAllOn(), model: advisor.model || 'qwen2.5:3b' };
    };

    async function adviseOne(id) {
        const incident = await store.get(id);
        if (!incident || incident.status === 'resolved') return null;
        const events = await store.events(id);
        const examples = await store.examples(incident.detector, MAX.examples, incident.id);
        const { model, localAi } = conf();
        const started = now();
        let advice;
        let source = 'llm';
        let error = null;
        try {
            // Local AI models off: Ollama is not asked at all
            if (!localAi) throw new Error(LOCAL_AI_OFF);
            advice = await ask({ url, model, prompt: buildPrompt(incident, events, examples) });
        } catch (failure) {
            error = failure.message;
            advice = ruleAdvice(incident);
            source = 'rules';
        }
        const detail = { source, model: source === 'llm' ? model : null, ...advice, actionText: ACTIONS[advice.action] || ACTIONS.none, seconds: Math.round((now() - started) / 100) / 10, ...(error ? { fallbackReason: cut(error, 200) } : {}), ...(localAi ? {} : { localAiOff: true }) };
        await store.addEvent(id, 'advice', detail, new Date(now()).toISOString());
        state.lastAt = new Date(now()).toISOString();
        state.lastSource = source;
        state.lastError = error;
        state.done++;
        return detail;
    }

    async function drain() {
        if (state.busy !== null) return;
        while (queue.length) {
            const id = queue.shift();
            state.busy = id;
            try { await adviseOne(id); }
            catch (error) { state.lastError = error.message; console.warn(`[aiops] advice for incident ${id} failed: ${error.message}`); }
            finally { state.busy = null; }
        }
    }

    // queue one incident; force: the admin pressed "Ask again" (at most every 30 s per incident)
    function request(id, { force = false } = {}) {
        if (!conf().on) return { queued: false, reason: 'off' };
        const key = Number(id);
        if (queue.includes(key) || state.busy === key) return { queued: true, reason: 'already' };
        const last = askedAt.get(key) || 0;
        if (force && now() - last < AGAIN_AFTER_MS) return { queued: false, reason: 'soon' };
        askedAt.set(key, now());
        queue.push(key);
        drain();
        return { queued: true };
    }

    // after every check: an open incident whose newest open / reopen / severity step has no advice after it gets one
    async function sweep() {
        if (!conf().on) return 0;
        let added = 0;
        for (const incident of await store.listOpen()) {
            const events = await store.events(incident.id);
            const lastStep = events.reduce((at, e) => (ADVISED.has(e.type) ? Math.max(at, Date.parse(e.at) || 0) : at), 0);
            const lastAdvice = events.reduce((at, e) => (e.type === 'advice' ? Math.max(at, Date.parse(e.at) || 0) : at), 0);
            if (lastStep && lastAdvice < lastStep && request(incident.id).queued) added++;
        }
        return added;
    }

    const isBusy = (id) => state.busy === Number(id) || queue.includes(Number(id));
    const getStatus = () => ({ ...conf(), url, busy: state.busy, queued: queue.length, lastAt: state.lastAt, lastSource: state.lastSource, lastError: state.lastError, done: state.done });

    return { request, sweep, isBusy, getStatus, drain };
}

module.exports = { ACTIONS, LIKELIHOOD, TIMEOUT_MS, AGAIN_AFTER_MS, LOCAL_AI_OFF, evidenceOf, buildPrompt, parseAdvice, ruleAdvice, askOllama, createAdvisor };
// <Jun Kai end>
