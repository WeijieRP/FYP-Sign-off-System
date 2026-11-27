// Owner: Role 3, Jun Kai.
// AIOps part 2, learning from the verdicts. A detector whose incidents the admins keep marking "False alarm" or "Not
// useful" turns itself one step less sensitive; once its incidents are marked "Correct" again it goes back a step
// towards the level the admin chose. The numbers come from the settings (Advanced): by default three verdicts in a row
// (given after the last step, within 30 days) make a step; never above the admin's level, at most two steps below it,
// never below Very low. Saving a level in Settings resets what was learned for that detector. Kept in
// backend/data/aiops-learning.json; switched off with learnFromVerdicts.
// <Jun Kai start>
const paths = require('../../core/paths');
const { readJson, writeJsonAtomic } = require('../../core/jsonFile');

const FILE_NAME = 'aiops-learning.json';
const STREAK = 3;
const MAX_DOWN = 2;
const WINDOW_DAYS = 30;
const WRONG = new Set(['false-alarm', 'not-useful']);

// { streak, maxDown, windowDays } from the settings; a missing or odd value falls back to the numbers above
function ruleOf(settings) {
    const s = settings || {};
    const pick = (value, fallback) => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback);
    return { streak: pick(s.learnStreak, STREAK), maxDown: pick(s.learnMaxSteps, MAX_DOWN), windowDays: pick(s.learnWindowDays, WINDOW_DAYS) };
}

// what was learned, never more steps down than the settings now allow (a lower limit also caps older steps)
const clampOffset = (offset, rule = ruleOf()) => Math.max(-rule.maxDown, Math.min(0, Number(offset) || 0));

// verdicts: [{ verdict, at (ms) }] of one detector; entry: what was learned so far ({ offset, countedAt }) or nothing.
// Returns the entry after these verdicts, with changed: true when a step was taken.
function learnStep(verdicts, entry = {}, now = Date.now(), rule = ruleOf()) {
    const offset = clampOffset(entry && entry.offset, rule);
    const countedAt = Number(entry && entry.countedAt) || 0;
    const since = Math.max(countedAt, now - rule.windowDays * 86400000);
    const fresh = (Array.isArray(verdicts) ? verdicts : []).filter((v) => v && Number.isFinite(v.at) && v.at > since).sort((a, b) => b.at - a.at).slice(0, rule.streak);
    const same = { offset, countedAt, reason: (entry && entry.reason) || null, changed: false };
    if (fresh.length < rule.streak) return same;
    const newest = fresh[0].at;
    if (fresh.every((v) => WRONG.has(v.verdict)) && offset > -rule.maxDown) {
        return { offset: offset - 1, countedAt: newest, reason: `${rule.streak} incidents in a row were marked False alarm or Not useful`, changed: true };
    }
    if (fresh.every((v) => v.verdict === 'correct') && offset < 0) {
        return { offset: offset + 1, countedAt: newest, reason: `${rule.streak} incidents in a row were marked Correct`, changed: true };
    }
    return same;
}

const effectiveSensitivity = (level, offset) => Math.max(1, Math.min(5, (Number(level) || 3) + (Number(offset) || 0)));

// The settings the detectors run with: the admin's levels with the learned steps applied (the saved file is untouched)
function apply(settings, state) {
    if (!settings || settings.learnFromVerdicts === false || !settings.detectors || !state) return settings;
    const rule = ruleOf(settings);
    const detectors = {};
    for (const [key, detector] of Object.entries(settings.detectors)) {
        const offset = state[key] ? clampOffset(state[key].offset, rule) : 0;
        detectors[key] = offset ? { ...detector, sensitivity: effectiveSensitivity(detector.sensitivity, offset) } : detector;
    }
    return { ...settings, detectors };
}

function read() {
    const data = readJson(paths.dataFile(FILE_NAME), {});
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function write(state) {
    writeJsonAtomic(paths.dataFile(FILE_NAME), state);
}

// A level the admin saves wins: what was learned for those detectors is forgotten
function resetFor(keys) {
    const state = read();
    const gone = keys.filter((key) => state[key]);
    if (!gone.length) return state;
    for (const key of gone) delete state[key];
    write(state);
    return state;
}

module.exports = { learnStep, ruleOf, clampOffset, effectiveSensitivity, apply, read, write, resetFor, STREAK, MAX_DOWN, WINDOW_DAYS, FILE_NAME };
// <Jun Kai end>
