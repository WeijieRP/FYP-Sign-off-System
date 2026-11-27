// Owner: Role 3, Jun Kai.
// Unit tests for the step-by-step help on the incident panel (backend/features/aiops/playbooks.js) and the busiest
// programmes list (processes.js) that one of its steps shows. Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const playbooks = require('../../backend/features/aiops/playbooks');
const processes = require('../../backend/features/aiops/processes');

const incident = (detector, kind, subject = null, evidence = {}) => ({ detector, kind, subject, evidence });
const texts = (steps) => steps.map((s) => s.text).join('\n');

test('each detector only shows help that fits it; anything else from the advisor falls back to the default', () => {
    assert.deepEqual(playbooks.allowedFor(incident('spike', 'high', 'cpu')), ['close-heavy-apps', 'none']);
    assert.deepEqual(playbooks.allowedFor(incident('drift', 'rising', 'disk')), ['run-archive-now', 'free-disk-space', 'none']);
    assert.deepEqual(playbooks.allowedFor(incident('services', 'down', 'database')), ['check-mysql', 'none']);
    assert.equal(playbooks.chooseAction(incident('disk', 'filling'), { action: 'restart-kiosk-server' }), 'free-disk-space');
    assert.equal(playbooks.chooseAction(incident('disk', 'filling'), { action: 'run-archive-now' }), 'run-archive-now');
    assert.equal(playbooks.chooseAction(incident('tablets', 'offline', 't1'), null), 'check-tablet');
    assert.equal(playbooks.chooseAction(incident('test', 'sample'), { action: 'check-mysql' }), 'none');
});

test('a CPU spike says how to open Task Manager and leaves room for the busiest programmes', () => {
    const help = playbooks.helpFor(incident('spike', 'high', 'cpu'), { action: 'close-heavy-apps' });
    assert.equal(help.fix, null);
    assert.equal(help.fallback, null);
    assert.match(help.steps[0].text, /\[\[Ctrl\]\] \+ \[\[Shift\]\] \+ \[\[Esc\]\]/);
    assert.match(texts(help.steps), /\*\*CPU\*\* column/);
    const live = help.steps.find((s) => s.live);
    assert.equal(live.live, 'cpu');
    assert.match(live.text, /\{busiest\}/);
    const endTask = help.steps.find((s) => /End task/.test(s.text));
    assert.match(endTask.text, /Leave \*\*Node\.js\*\*, \*\*MySQL\*\* and \*\*Ollama\*\* running/, 'the warning sits in the End task step, so it stays when the live step is left out');
    assert.equal(endTask.live, undefined);
});

test('with the Local AI models switch off the steps no longer say to keep Ollama running', () => {
    const endTask = (help) => help.steps.find((s) => /End task/.test(s.text)).text;
    const off = playbooks.helpFor(incident('spike', 'high', 'cpu'), null, { localAi: false });
    assert.match(endTask(off), /Leave \*\*Node\.js\*\* and \*\*MySQL\*\* running: they are the kiosk and its database\./);
    assert.doesNotMatch(endTask(off), /Ollama/);
    const creep = playbooks.helpFor(incident('drift', 'rising', 'memory'), { action: 'restart-kiosk-server' }, { localAi: false });
    assert.doesNotMatch(texts(creep.steps), /Ollama/);
    assert.match(texts(playbooks.helpFor(incident('drift', 'rising', 'memory'), { action: 'restart-kiosk-server' }).steps), /\*\*MySQL\*\* and \*\*Ollama\*\* running/, 'on by default');
});

test('memory and GPU get their own column; the GPU has no live list', () => {
    const memory = playbooks.helpFor(incident('spike', 'high', 'memory'), null);
    assert.equal(memory.steps.find((s) => s.live).live, 'memory');
    const gpu = playbooks.helpFor(incident('spike', 'high', 'gpu'), null);
    assert.match(texts(gpu.steps), /\*\*GPU\*\* column/);
    assert.equal(gpu.steps.some((s) => s.live), false);
    const creep = playbooks.helpFor(incident('drift', 'rising', 'memory'), { action: 'restart-kiosk-server' });
    assert.equal(creep.steps.find((s) => s.live).live, 'memory');
    assert.match(texts(creep.steps), /Restart application/);
});

test('a kiosk that is down leads with the fix when one is on offer, and the log steps come after', () => {
    const down = incident('services', 'down', 'kiosk');
    const withFix = playbooks.helpFor(down, null, { fixKey: 'start-kiosk' });
    assert.equal(withFix.fix, 'start-kiosk');
    assert.deepEqual(withFix.steps, []);
    assert.equal(withFix.fallback.title, 'If it does not come back');
    assert.match(texts(withFix.fallback.steps), /app-events-kiosk\.jsonl/);

    const noFix = playbooks.helpFor(down, null, { fixKey: null });
    assert.equal(noFix.fix, null);
    assert.match(texts(noFix.steps), /\*\*Start kiosk\*\*/);
    assert.match(texts(noFix.fallback.steps), /app-events-kiosk\.jsonl/);

    const fixesOff = playbooks.helpFor(down, null, { fixKey: 'start-kiosk', fixesOn: false });
    assert.equal(fixesOff.fix, null);
});

test('the steps name the real things: the tablet, the log file, MySQL', () => {
    assert.match(texts(playbooks.helpFor(incident('tablets', 'offline', 't1', { name: 'Entrance' }), null).steps), /tablet \*\*Entrance\*\*/);
    assert.match(texts(playbooks.helpFor(incident('tablets', 'all-offline'), null).steps), /Wi-Fi router/);
    assert.match(texts(playbooks.helpFor(incident('logs', 'burst', null, { process: 'kiosk' }), null).steps), /app-events-kiosk\.jsonl/);
    assert.match(texts(playbooks.helpFor(incident('logs', 'burst', null, { process: 'server' }), null).steps), /app-events-server\.jsonl/);
    assert.match(texts(playbooks.helpFor(incident('services', 'down', 'database'), null).steps), /MySQL84/);
    assert.match(texts(playbooks.helpFor(incident('services', 'slow', 'database'), null).steps), /mysqld/);
});

test('every step of every help is well formed: text, even bold marks, closed keys, no unknown placeholders', () => {
    const cases = [
        incident('spike', 'high', 'cpu'), incident('spike', 'high', 'memory'), incident('spike', 'high', 'gpu'), incident('timeOfDay', 'high', 'cpu'),
        incident('drift', 'rising', 'memory'), incident('drift', 'rising', 'disk'), incident('disk', 'filling'), incident('disk', 'full'),
        incident('services', 'down', 'kiosk'), incident('services', 'down', 'database'), incident('services', 'slow', 'database'),
        incident('services', 'down', 'email'), incident('services', 'down', 'other'), incident('tablets', 'offline', 't1'),
        incident('tablets', 'all-offline'), incident('logs', 'burst'), incident('logs', 'new'), incident('test', 'sample')
    ];
    for (const one of cases) {
        for (const action of playbooks.allowedFor(one)) {
            const help = playbooks.helpFor(one, { action });
            const all = help.steps.concat(help.fallback ? help.fallback.steps : []);
            assert.ok(all.length > 0, `${one.detector}/${action} has steps`);
            for (const s of all) {
                assert.ok(typeof s.text === 'string' && s.text.trim(), 'a step has text');
                assert.equal((s.text.match(/\*\*/g) || []).length % 2, 0, `bold marks pair up: ${s.text}`);
                assert.equal((s.text.match(/\[\[/g) || []).length, (s.text.match(/\]\]/g) || []).length, `keys close: ${s.text}`);
                assert.equal(s.text.replace('{busiest}', '').includes('{'), false, `no unknown placeholder: ${s.text}`);
                if (s.text.includes('{busiest}')) assert.ok(['cpu', 'memory'].includes(s.live), 'a live step says which list it needs');
            }
        }
    }
});

test('the busiest programmes: grouped, named plainly, the kiosk\'s own marked keep, the idle counters never listed', () => {
    const rows = [
        { name: '_Total', cpu: 800, memoryBytes: 0 }, { name: 'Idle', cpu: 500, memoryBytes: 0 },
        { name: 'node', cpu: 300, memoryBytes: 900 * 1024 * 1024 }, { name: 'node#1', cpu: 100, memoryBytes: 0 },
        { name: 'chrome', cpu: 200, memoryBytes: 600 * 1024 * 1024 }, { name: 'chrome#1', cpu: 120, memoryBytes: 400 * 1024 * 1024 },
        { name: 'Teams', cpu: 80, memoryBytes: 700 * 1024 * 1024 }, { name: 'mysqld', cpu: 40, memoryBytes: 300 * 1024 * 1024 },
        { name: 'notepad', cpu: 2, memoryBytes: 20 * 1024 * 1024 }, { name: 'svchost#3', cpu: 1, memoryBytes: 30 * 1024 * 1024 }
    ];
    const cpu = processes.summarise(rows, 'cpu', 8);
    assert.deepEqual(cpu.map((p) => p.name), ['Node.js', 'Google Chrome', 'Microsoft Teams'], 'percent of the whole PC, busiest first, at most 3');
    assert.equal(cpu[0].cpu, 50, '(300 + 100) / 8 cores');
    assert.equal(cpu[0].keep, 'the kiosk', 'listed, so the page can say to leave it running');
    assert.equal(cpu[1].cpu, 40);
    assert.equal(cpu[1].keep, undefined);
    const memory = processes.summarise(rows, 'memory', 8);
    assert.deepEqual(memory.map((p) => p.name), ['Google Chrome', 'Node.js', 'Microsoft Teams']);
    assert.equal(memory[0].memoryMb, 1000);
    const ollama = processes.summarise([{ name: 'ollama', cpu: 0, memoryBytes: 200 * 1024 * 1024 }, { name: 'ollama_llama_server', cpu: 0, memoryBytes: 1800 * 1024 * 1024 }, { name: 'mysqld', cpu: 0, memoryBytes: 400 * 1024 * 1024 }], 'memory', 8);
    assert.deepEqual(ollama, [{ name: 'Ollama', cpu: 0, memoryMb: 2000, keep: 'the local AI' }, { name: 'MySQL', cpu: 0, memoryMb: 400, keep: "the kiosk's database" }], 'Ollama and its runner are one programme');
    assert.deepEqual(processes.withoutAiKeep(ollama), [{ name: 'Ollama', cpu: 0, memoryMb: 2000 }, { name: 'MySQL', cpu: 0, memoryMb: 400, keep: "the kiosk's database" }], 'Local AI models off: Ollama is a programme like any other');
    assert.deepEqual(processes.summarise([{ name: 'notepad', cpu: 4, memoryBytes: 10 }], 'cpu', 8), [], 'under 1 % is left out');
    assert.deepEqual(processes.summarise(null, 'cpu', 8), []);
    const windows = processes.summarise([{ name: 'svchost#4', cpu: 300, memoryBytes: 0 }, { name: 'WmiPrvSE', cpu: 200, memoryBytes: 0 }, { name: 'powershell', cpu: 150, memoryBytes: 0 }, { name: 'MsMpEng', cpu: 120, memoryBytes: 0 }, { name: 'zoom', cpu: 80, memoryBytes: 0 }], 'cpu', 8);
    assert.deepEqual(windows.map((p) => p.name), ['Zoom'], "Windows' own processes, the antivirus and this reading's own PowerShell are never listed");
    assert.equal(processes.friendly('msedge.exe'), 'Microsoft Edge');
    assert.equal(processes.friendly('SomeTool#2'), 'SomeTool');
});

test('top() reads through the given reader and never throws on an empty answer', async () => {
    const list = await processes.top('memory', { reader: async () => [{ name: 'Code', cpu: 0, memoryBytes: 2048 * 1024 * 1024 }] });
    assert.deepEqual(list, [{ name: 'Visual Studio Code', cpu: 0, memoryMb: 2048 }]);
    assert.deepEqual(await processes.top('cpu', { reader: async () => [] }), []);
});
// <Jun Kai end>
