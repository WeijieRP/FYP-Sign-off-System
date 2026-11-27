// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The AI Settings page: one switch for every AI feature of the kiosk, and one switch per feature.
//   all            off: no AI model runs and nothing is sent to an online AI service, whatever the rows say
//   incidentAdvisor  the local AI that explains each incident (Ollama). Its switch is advisor.enabled in the incident
//                  settings (aiops-settings.json), so the Incidents page and this page change the same value
//   reportModels   the AI modes of Feedback Reports: Xenova on this PC, and Qwen, Gemma and LocalGPT through Ollama
//   pledgeCheck    the check of each pledge when a visitor submits it (word rules first, then an online service or
//                  Xenova, as PLEDGE_SENTIMENT_MODE in backend/.env says). Off: word rules only
//   translate      Translate to English on the admin page (Google Translate, online)
// Forecasts and anomaly detection are statistics, not AI, so they are not here.
// The file is read on every call: the kiosk server (port 3003) runs the pledge check too, and it must see a change
// made on the admin page without a restart.
const fs = require('fs');
const { readJson, writeJsonAtomic } = require('../../core/jsonFile');
const paths = require('../../core/paths');
const aiopsSettings = require('../aiops/settings');

const FILE_NAME = 'ai-settings.json';
const OWN = ['all', 'reportModels', 'pledgeCheck', 'translate'];
const KEYS = [...OWN, 'incidentAdvisor'];
const DEFAULTS = { all: true, reportModels: true, pledgeCheck: true, translate: true };

function createStore({ file = () => paths.dataFile(FILE_NAME), aiops = aiopsSettings } = {}) {
    // The first read takes over the old "Local AI models" switch of the incident settings, so an installed PC keeps
    // what it had: with that switch off, the advisor and the Feedback Reports AI modes start switched off here.
    function takeOver(target) {
        const settings = { ...DEFAULTS };
        const current = aiops.read();
        if (current && current.localAi === false) {
            settings.reportModels = false;
            // the old switch is no longer read; the advisor's own switch carries its "off" from now on
            aiops.write({ ...current, localAi: true, advisor: { ...current.advisor, enabled: false } });
        }
        writeJsonAtomic(target, settings);
        return settings;
    }

    function read() {
        const target = file();
        if (!fs.existsSync(target)) return takeOver(target);
        const stored = readJson(target, {}) || {};
        const settings = {};
        for (const key of OWN) settings[key] = typeof stored[key] === 'boolean' ? stored[key] : DEFAULTS[key];
        return settings;
    }

    // every switch as saved, the advisor's included
    function saved() {
        const settings = read();
        const current = aiops.read() || {};
        return { ...settings, incidentAdvisor: !current.advisor || current.advisor.enabled !== false };
    }

    // whether a feature may use AI right now: its own switch and the switch for all of them
    function on(feature) {
        const settings = saved();
        if (!settings.all) return false;
        return settings[feature] !== false;
    }

    // the switch for all AI features, read without the takeover (never writes): before the first takeover the old switch
    // still decides, and the advisor checks it itself, so a missing file counts as on
    function allOn() {
        const target = file();
        if (!fs.existsSync(target)) return true;
        const stored = readJson(target, {}) || {};
        return stored.all !== false;
    }

    // Ollama is needed by the advisor and by three of the Feedback Reports modes
    const ollamaInUse = () => on('incidentAdvisor') || on('reportModels');

    // { settings } or { error, field }; only true or false, only known switches
    function validate(changes) {
        if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return { error: 'Send the switches to change.', field: null };
        const unknown = Object.keys(changes).find((key) => !KEYS.includes(key));
        if (unknown) return { error: `Unknown switch: ${unknown}`, field: unknown };
        const wrong = Object.keys(changes).find((key) => typeof changes[key] !== 'boolean');
        if (wrong) return { error: `${wrong} must be true or false.`, field: wrong };
        return { settings: { ...saved(), ...changes } };
    }

    // saves what changed; returns the switches that changed, for the audit log
    function save(changes) {
        const result = validate(changes);
        if (result.error) return result;
        const before = saved();
        const next = result.settings;
        const own = {};
        for (const key of OWN) own[key] = next[key];
        writeJsonAtomic(file(), own);
        if (next.incidentAdvisor !== before.incidentAdvisor) {
            const current = aiops.read() || {};
            aiops.write({ ...current, advisor: { ...current.advisor, enabled: next.incidentAdvisor } });
        }
        const changed = KEYS.filter((key) => next[key] !== before[key]).map((key) => [key, next[key]]);
        return { settings: saved(), changed };
    }

    return { read, saved, on, allOn, ollamaInUse, validate, save };
}

// what the pledge check really does with the switch on: the mode from backend/.env and whether an online key is set
// (only true or false is told, never the key)
function pledgeEngine(env = process.env) {
    const mode = String(env.PLEDGE_SENTIMENT_MODE || 'hybrid').toLowerCase();
    const provider = String(env.AI_SENTIMENT_PROVIDER || 'openai').toLowerCase();
    const key = provider === 'groq' ? (env.GROQ_API_KEY || env.AI_SENTIMENT_API_KEY) : (env.OPENAI_API_KEY || env.AI_SENTIMENT_API_KEY);
    return { mode, provider, onlineKey: Boolean(key) };
}

const store = createStore();

// what the page and the other admin pages read
function status() {
    const settings = store.saved();
    const effective = {};
    for (const key of KEYS.filter((k) => k !== 'all')) effective[key] = store.on(key);
    return { settings, effective, pledge: pledgeEngine() };
}

module.exports = { ...store, status, pledgeEngine, createStore, FILE_NAME, KEYS, DEFAULTS };
// <Jun Kai end>
