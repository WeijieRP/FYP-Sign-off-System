// Owner: Role 3, Jun Kai.
// Unit tests for the AI Settings page's switches (backend/features/aiSettings/store.js) and the pledge check gate.
// Every store here works on a file in the system's temp folder and a fake incident settings object, so the real
// backend/data files are never read or written. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const aiSettings = require('../../backend/features/aiSettings/store');

// a store on a temp file, with incident settings kept in memory
function setup(aiopsStart = { localAi: true, advisor: { enabled: true, model: 'qwen2.5:3b' } }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-settings-'));
    const file = path.join(dir, 'ai-settings.json');
    let aiops = JSON.parse(JSON.stringify(aiopsStart));
    const fake = { read: () => aiops, write: (next) => { aiops = JSON.parse(JSON.stringify(next)); } };
    const store = aiSettings.createStore({ file: () => file, aiops: fake });
    return { store, file, aiops: () => aiops, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('a fresh PC starts with every AI feature on and writes the file', () => {
    const t = setup();
    try {
        assert.deepEqual(t.store.saved(), { all: true, reportModels: true, pledgeCheck: true, translate: true, incidentAdvisor: true });
        assert.ok(fs.existsSync(t.file));
        for (const key of ['incidentAdvisor', 'reportModels', 'pledgeCheck', 'translate']) assert.equal(t.store.on(key), true);
    } finally { t.done(); }
});

test('the old "Local AI models" switch off is taken over: advisor and report modes start off, the rest stays on', () => {
    const t = setup({ localAi: false, advisor: { enabled: true, model: 'gemma2:2b' } });
    try {
        const saved = t.store.saved();
        assert.equal(saved.reportModels, false);
        assert.equal(saved.incidentAdvisor, false);
        assert.equal(saved.pledgeCheck, true);
        assert.equal(saved.translate, true);
        assert.equal(saved.all, true);
        // the old switch is cleared so it can never block the advisor again; the model choice is kept
        assert.equal(t.aiops().localAi, true);
        assert.deepEqual(t.aiops().advisor, { enabled: false, model: 'gemma2:2b' });
        assert.equal(t.store.ollamaInUse(), false);
    } finally { t.done(); }
});

test('the takeover happens once: a later read keeps what was saved', () => {
    const t = setup({ localAi: false, advisor: { enabled: true } });
    try {
        t.store.read();
        t.store.save({ reportModels: true, incidentAdvisor: true });
        assert.equal(t.store.on('reportModels'), true);
        assert.equal(t.store.on('incidentAdvisor'), true);
        assert.equal(t.aiops().advisor.enabled, true);
    } finally { t.done(); }
});

test('the switch for all AI features turns every feature off and keeps each row as it was', () => {
    const t = setup();
    try {
        t.store.save({ translate: false });
        const result = t.store.save({ all: false });
        assert.deepEqual(result.changed, [['all', false]]);
        for (const key of ['incidentAdvisor', 'reportModels', 'pledgeCheck', 'translate']) assert.equal(t.store.on(key), false, key);
        assert.equal(t.store.ollamaInUse(), false);
        t.store.save({ all: true });
        assert.equal(t.store.on('translate'), false, 'the row stays off');
        assert.equal(t.store.on('pledgeCheck'), true);
    } finally { t.done(); }
});

test('the advisor row is the advisor switch of the incident settings (one value, two pages)', () => {
    const t = setup();
    try {
        const result = t.store.save({ incidentAdvisor: false });
        assert.deepEqual(result.changed, [['incidentAdvisor', false]]);
        assert.equal(t.aiops().advisor.enabled, false);
        assert.equal(JSON.parse(fs.readFileSync(t.file, 'utf8')).incidentAdvisor, undefined, 'not stored twice');
        t.aiops().advisor.enabled = true; // changed on the Incidents page
        assert.equal(t.store.on('incidentAdvisor'), true);
        assert.equal(t.store.ollamaInUse(), true);
    } finally { t.done(); }
});

test('allOn never writes: a missing file counts as on, a saved file is read', () => {
    const t = setup({ localAi: false, advisor: { enabled: true } });
    try {
        assert.equal(t.store.allOn(), true);
        assert.equal(fs.existsSync(t.file), false, 'no takeover from allOn');
        assert.equal(t.aiops().advisor.enabled, true);
        t.store.save({ all: false });
        assert.equal(t.store.allOn(), false);
    } finally { t.done(); }
});

test('only true or false for known switches is saved', () => {
    const t = setup();
    try {
        assert.equal(t.store.save({ translate: 'no' }).field, 'translate');
        assert.equal(t.store.save({ faceCheck: false }).field, 'faceCheck');
        assert.ok(t.store.save(null).error);
        assert.ok(t.store.save([true]).error);
        assert.deepEqual(t.store.save({}).changed, []);
        assert.equal(t.store.on('translate'), true);
    } finally { t.done(); }
});

test('a damaged or partly written file falls back to "on" for what it does not say', () => {
    const t = setup();
    try {
        fs.writeFileSync(t.file, JSON.stringify({ all: true, translate: 'off', pledgeCheck: false }));
        assert.deepEqual(t.store.read(), { all: true, reportModels: true, pledgeCheck: false, translate: true });
    } finally { t.done(); }
});

test('pledgeEngine tells the mode and whether an online key is set, never the key', () => {
    assert.deepEqual(aiSettings.pledgeEngine({}), { mode: 'hybrid', provider: 'openai', onlineKey: false });
    const groq = aiSettings.pledgeEngine({ PLEDGE_SENTIMENT_MODE: 'Online', AI_SENTIMENT_PROVIDER: 'groq', GROQ_API_KEY: 'secret-value' });
    assert.deepEqual(groq, { mode: 'online', provider: 'groq', onlineKey: true });
    assert.ok(!JSON.stringify(groq).includes('secret-value'));
});

test('with the pledge check off, a pledge gets word rules only and nothing is sent online', async () => {
    const realOn = aiSettings.on;
    const realRequest = https.request;
    const saved = { mode: process.env.PLEDGE_SENTIMENT_MODE, key: process.env.OPENAI_API_KEY };
    let sent = 0;
    https.request = () => { sent++; throw new Error('no request may be made in this test'); };
    process.env.PLEDGE_SENTIMENT_MODE = 'online';
    process.env.OPENAI_API_KEY = 'test-only-not-a-key';
    try {
        const { analyzePledgeSentiment } = require('../../backend/features/feedback/pledgeSentiment');
        aiSettings.on = (feature) => feature !== 'pledgeCheck';
        const result = await analyzePledgeSentiment('I will try something this week');
        assert.equal(result.source, 'rules');
        assert.equal(sent, 0);
        // with the check on, the same pledge does go to the online service (the stub refuses it, so rules are the fallback)
        aiSettings.on = () => true;
        await analyzePledgeSentiment('I will try something this week');
        assert.equal(sent, 1);
    } finally {
        aiSettings.on = realOn;
        https.request = realRequest;
        if (saved.mode === undefined) delete process.env.PLEDGE_SENTIMENT_MODE; else process.env.PLEDGE_SENTIMENT_MODE = saved.mode;
        if (saved.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved.key;
    }
});
// <Jun Kai end>
