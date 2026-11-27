// Owner: Role 3, Jun Kai.
// Unit tests for AIOps part 2, the advisor (backend/features/aiops/advisor.js). No Ollama: the model is a fake.
// Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const advisor = require('../../backend/features/aiops/advisor');
const { memoryStore } = require('../../backend/features/aiops/incidents');

const NOW = Date.UTC(2026, 10, 12, 6, 0);
const iso = (ms) => new Date(ms).toISOString();
const ON = () => ({ enabled: true, advisor: { enabled: true, model: 'qwen2.5:3b' } });
const GOOD = { summary: 'The disk is filling up.', causes: [{ cause: 'Photos piling up', likelihood: 'high' }], action: 'run-archive-now', why: 'It frees space.' };

async function openIncident(store, fields = {}) {
    const id = await store.insert({ fingerprint: 'disk:filling:-', detector: 'disk', kind: 'filling', severity: 'warn', status: 'open', title: 'Disk full in 9 days',
        explanation: 'Growing 2 GB a day.', evidence: { metric: 'disk', value: 91, unit: '%', points: [{ t: NOW - 60000, v: 90 }, { t: NOW, v: 91 }] },
        opened_at: iso(NOW - 600000), last_seen_at: iso(NOW), ...fields });
    await store.addEvent(id, 'opened', { severity: 'warn' }, iso(NOW - 600000));
    return id;
}

// waits until the advisor's queue is empty (it answers in the background)
async function idle(a) {
    for (let i = 0; i < 100; i++) {
        const s = a.getStatus();
        if (s.busy === null && s.queued === 0) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('the advisor did not finish');
}

test('the prompt holds only the incident: its numbers, the last values, its timeline and confirmed examples', () => {
    const incident = { detector: 'disk', kind: 'filling', subject: null, severity: 'warn', status: 'open', title: 'Disk full in 9 days', explanation: 'x',
        opened_at: iso(NOW), last_seen_at: iso(NOW), occurrences: 3,
        evidence: { metric: 'disk', value: 91, unit: '%', names: ['a', 'b'], points: Array.from({ length: 30 }, (_, i) => ({ t: i, v: i })) } };
    const events = [{ at: iso(NOW), type: 'opened' }, { at: iso(NOW), type: 'advice', detail: { summary: 'old' } }];
    const examples = [1, 2, 3, 4].map((n) => ({ title: `Earlier ${n}`, resolved_at: iso(NOW), resolved_by: 'auto', resolve_note: null }));
    const prompt = advisor.buildPrompt(incident, events, examples);
    const facts = JSON.parse(prompt.user);
    assert.equal(facts.incident.evidence.value, 91);
    assert.equal(facts.incident.evidence.points, undefined, 'the long point list stays out');
    assert.deepEqual(facts.incident.evidence.lastValues, [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
    assert.deepEqual(facts.timeline.map((e) => e.type), ['opened'], 'earlier advice is not fed back');
    assert.equal(facts.earlierConfirmedIncidents.length, 3);
    for (const key of Object.keys(advisor.ACTIONS)) assert.ok(prompt.system.includes(`- ${key}:`), `the step list names ${key}`);
});

test('the answer is checked: three causes at most, a known step, texts cut to size', () => {
    const advice = advisor.parseAdvice(JSON.stringify({
        summary: 'S'.repeat(500), causes: ['plain text cause', { cause: 'b', likelihood: 'HIGH' }, { cause: 'c', likelihood: 'certain' }, { cause: 'd' }],
        action: 'format-the-disk', why: 'because'
    }));
    assert.equal(advice.summary.length, 400);
    assert.deepEqual(advice.causes, [{ cause: 'plain text cause', likelihood: 'medium' }, { cause: 'b', likelihood: 'high' }, { cause: 'c', likelihood: 'medium' }]);
    assert.equal(advice.action, 'none', 'a step that is not on the list becomes none');
    assert.equal(advisor.parseAdvice(JSON.stringify(GOOD)).action, 'run-archive-now');
    const echoed = advisor.parseAdvice(JSON.stringify({ summary: 's', causes: ['Photos piling up', 'close-heavy-apps: Close programs that use a lot of CPU or memory on the server PC', 'review-server-log'] }));
    assert.deepEqual(echoed.causes.map((c) => c.cause), ['Photos piling up'], 'a step copied into the causes is dropped');
    assert.equal(advisor.parseAdvice('not json'), null);
    assert.equal(advisor.parseAdvice('[1, 2]'), null);
    assert.equal(advisor.parseAdvice(JSON.stringify({ action: 'none' })), null, 'no summary and no cause is no advice');
});

test('rule-based advice fits each detector, and every step it names is on the list', () => {
    const step = (detector, kind, subject = null) => advisor.ruleAdvice({ detector, kind, subject }).action;
    assert.equal(step('disk', 'full'), 'free-disk-space');
    assert.equal(step('disk', 'filling'), 'run-archive-now');
    assert.equal(step('services', 'down', 'database'), 'check-mysql');
    assert.equal(step('services', 'slow', 'database'), 'check-mysql');
    assert.equal(step('services', 'down', 'kiosk'), 'restart-kiosk-server');
    assert.equal(step('services', 'down', 'email'), 'check-mail-login');
    assert.equal(step('tablets', 'offline', 'tab-1'), 'check-tablet');
    assert.equal(step('tablets', 'all-offline'), 'check-tablet');
    assert.equal(step('logs', 'burst'), 'review-server-log');
    assert.equal(step('drift', 'rising', 'disk'), 'run-archive-now');
    assert.equal(step('drift', 'rising', 'memory'), 'restart-kiosk-server');
    assert.equal(step('spike', 'high', 'cpu'), 'close-heavy-apps');
    assert.equal(step('test', 'sample'), 'none');
    for (const detector of ['disk', 'services', 'tablets', 'logs', 'drift', 'spike', 'timeOfDay', 'test', 'other']) {
        const advice = advisor.ruleAdvice({ detector, kind: 'x', subject: 'kiosk' });
        assert.ok(Object.hasOwn(advisor.ACTIONS, advice.action), `${detector}: ${advice.action} is on the list`);
        assert.ok(advice.summary && advice.causes.length >= 1);
    }
});

test('Ollama is asked in JSON mode, and its failures come back as errors', async () => {
    let sent = null;
    const ok = async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ message: { content: JSON.stringify(GOOD) } }) }; };
    const advice = await advisor.askOllama({ url: 'http://ollama', model: 'qwen2.5:3b', prompt: { system: 's', user: 'u' }, fetchImpl: ok });
    assert.equal(advice.action, 'run-archive-now');
    assert.equal(sent.url, 'http://ollama/api/chat');
    assert.deepEqual([sent.body.format, sent.body.stream, sent.body.model, sent.body.messages.length], ['json', false, 'qwen2.5:3b', 2]);
    const missing = async () => ({ ok: false, status: 404, json: async () => ({}) });
    await assert.rejects(advisor.askOllama({ url: 'u', model: 'm', prompt: { system: '', user: '' }, fetchImpl: missing }), /404 \(is the model m pulled\?\)/);
    const nonsense = async () => ({ ok: true, json: async () => ({ message: { content: 'hello' } }) });
    await assert.rejects(advisor.askOllama({ url: 'u', model: 'm', prompt: { system: '', user: '' }, fetchImpl: nonsense }), /expected shape/);
    const slow = (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    await assert.rejects(advisor.askOllama({ url: 'u', model: 'm', prompt: { system: '', user: '' }, fetchImpl: slow, timeoutMs: 20 }), /no answer within/);
});

test('an open incident gets advice once after each new step; a failing model gives rule-based advice', async () => {
    const store = memoryStore();
    let now = NOW;
    let calls = 0;
    const a = advisor.createAdvisor({ store, settings: ON, now: () => now, ask: async () => { calls++; return { ...GOOD }; } });
    const id = await openIncident(store);
    assert.equal(await a.sweep(), 1);
    await idle(a);
    let advice = (await store.events(id)).filter((e) => e.type === 'advice');
    assert.equal(advice.length, 1);
    assert.deepEqual([advice[0].detail.source, advice[0].detail.model, advice[0].detail.action, advice[0].detail.actionText], ['llm', 'qwen2.5:3b', 'run-archive-now', advisor.ACTIONS['run-archive-now']]);
    now += 60000;
    assert.equal(await a.sweep(), 0, 'nothing new happened, so no second question');
    await store.addEvent(id, 'severity', { from: 'warn', to: 'critical' }, iso(now));
    now += 1000;
    assert.equal(await a.sweep(), 1, 'a raised severity asks again');
    await idle(a);
    assert.equal(calls, 2);

    const failing = advisor.createAdvisor({ store, settings: ON, now: () => now, ask: async () => { throw new Error('connect ECONNREFUSED'); } });
    const other = await openIncident(store, { fingerprint: 'services:down:database', detector: 'services', kind: 'down', subject: 'database', title: 'Database down' });
    failing.request(other);
    await idle(failing);
    advice = (await store.events(other)).filter((e) => e.type === 'advice');
    assert.deepEqual([advice[0].detail.source, advice[0].detail.model, advice[0].detail.action, advice[0].detail.fallbackReason], ['rules', null, 'check-mysql', 'connect ECONNREFUSED']);
    assert.equal(failing.getStatus().lastSource, 'rules');
});

test('switched off it asks nothing; "Ask again" waits 30 s; a resolved incident gets no advice', async () => {
    const store = memoryStore();
    let now = NOW;
    const id = await openIncident(store);
    const off = advisor.createAdvisor({ store, settings: () => ({ enabled: true, advisor: { enabled: false } }), now: () => now, ask: async () => GOOD });
    assert.equal(await off.sweep(), 0);
    assert.deepEqual(off.request(id, { force: true }), { queued: false, reason: 'off' });
    const masterOff = advisor.createAdvisor({ store, settings: () => ({ enabled: false, advisor: { enabled: true } }), now: () => now, ask: async () => GOOD });
    assert.equal(masterOff.request(id).queued, true, 'Anomaly detection off leaves the advisor on: it has its own switch');
    await idle(masterOff);

    const a = advisor.createAdvisor({ store, settings: ON, now: () => now, ask: async () => GOOD });
    assert.equal(a.request(id, { force: true }).queued, true);
    await idle(a);
    now += 5000;
    assert.deepEqual(a.request(id, { force: true }), { queued: false, reason: 'soon' });
    now += 30000;
    assert.equal(a.request(id, { force: true }).queued, true);
    await idle(a);

    await store.update(id, { status: 'resolved', resolved_at: iso(now), resolved_by: 'auto' });
    const before = (await store.events(id)).length;
    now += 60000;
    a.request(id, { force: true });
    await idle(a);
    assert.equal((await store.events(id)).length, before, 'nothing added to a resolved incident');
});

test('with Local AI models off Ollama is never asked: the advice is rule-based and says why', async () => {
    const store = memoryStore();
    let asked = 0;
    const a = advisor.createAdvisor({ store, settings: () => ({ enabled: true, localAi: false, advisor: { enabled: true, model: 'qwen2.5:3b' } }), now: () => NOW, ask: async () => { asked++; return GOOD; } });
    assert.equal(a.getStatus().localAi, false);
    assert.equal(a.getStatus().on, true, 'the advisor itself stays on');
    const id = await openIncident(store);
    assert.equal(await a.sweep(), 1);
    await idle(a);
    const advice = (await store.events(id)).filter((e) => e.type === 'advice');
    assert.equal(asked, 0, 'the model was not asked');
    assert.deepEqual([advice[0].detail.source, advice[0].detail.model, advice[0].detail.localAiOff, advice[0].detail.fallbackReason], ['rules', null, true, advisor.LOCAL_AI_OFF]);
    assert.equal(advice[0].detail.action, 'run-archive-now', 'the rule-based step for a filling disk');
    assert.equal(advisor.createAdvisor({ store, settings: ON, ask: async () => GOOD }).getStatus().localAi, true, 'on unless exactly false');
});

test('the stores hand the advisor confirmed examples and the newest advice per incident', async () => {
    const store = memoryStore();
    const a = await store.insert({ fingerprint: 'disk:full:-', detector: 'disk', kind: 'full', title: 'A', status: 'resolved', resolved_at: iso(NOW - 2000), verdict: 'correct' });
    const b = await store.insert({ fingerprint: 'disk:full:-', detector: 'disk', kind: 'full', title: 'B', status: 'resolved', resolved_at: iso(NOW - 1000), verdict: 'correct' });
    await store.insert({ fingerprint: 'disk:full:-', detector: 'disk', kind: 'full', title: 'C', status: 'resolved', resolved_at: iso(NOW), verdict: 'false-alarm' });
    await store.insert({ fingerprint: 'logs:burst:-', detector: 'logs', kind: 'burst', title: 'D', status: 'resolved', resolved_at: iso(NOW), verdict: 'correct' });
    assert.deepEqual((await store.examples('disk', 3)).map((i) => i.title), ['B', 'A'], 'only correct ones of that detector, newest first');
    assert.deepEqual((await store.examples('disk', 3, b)).map((i) => i.title), ['A']);
    await store.addEvent(a, 'advice', { summary: 'first' }, iso(NOW - 500));
    await store.addEvent(a, 'advice', { summary: 'second' }, iso(NOW));
    await store.addEvent(b, 'opened', {}, iso(NOW));
    const latest = await store.latestEvents([a, b, 999], 'advice');
    assert.deepEqual(Object.keys(latest).map(Number), [a]);
    assert.equal(latest[a].detail.summary, 'second');
    assert.deepEqual(await store.latestEvents([], 'advice'), {});
});
// <Jun Kai end>
