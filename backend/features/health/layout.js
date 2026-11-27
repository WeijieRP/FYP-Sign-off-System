// Owner: Role 3, Jun Kai.
// Which checks each admin wants on the System Health page (supervisor meeting 03, 4 Nov 2026). Everything is shown
// by default; an admin removes what they do not need and adds it back later. Saved per admin id in
// backend/data/health-layout.json, seeded from backend/config/defaults/health-layout.json.
// <Jun Kai start>
const paths = require('../../core/paths');
const { readJson, writeJsonAtomic } = require('../../core/jsonFile');

const FILE = paths.dataFile('health-layout.json');

const OPTIONS = [
    { key: 'database', label: 'MySQL database', description: 'Answers, version and response time' },
    { key: 'kiosk', label: 'Kiosk server (:3003)', description: 'The tablet server is reachable' },
    { key: 'ollama', label: 'Ollama (local LLM)', description: 'The local language model and its models' },
    { key: 'email', label: 'Email (SMTP)', description: 'The saved mail account can log in' },
    { key: 'disk', label: 'Disk space', description: 'Free space on the project drive' },
    { key: 'server', label: 'Server PC', description: 'CPU and memory load, uptime, app memory' },
    { key: 'automation', label: 'Schedules', description: 'Policies and the next stop and start' },
    { key: 'tablets', label: 'Tablets', description: 'Which kiosk screens report in, and the tablets panel' },
    { key: 'incidents', label: 'Incidents summary', description: 'The open incidents in short, under the status line; the full list is on the Incidents page' }
];
const KEYS = OPTIONS.map((o) => o.key);

function read() {
    const data = readJson(FILE, null);
    return data && data.users && typeof data.users === 'object' ? data : { users: {} };
}

function hiddenFor(userId) {
    const entry = read().users[String(userId)];
    return entry && Array.isArray(entry.hidden) ? entry.hidden.filter((key) => KEYS.includes(key)) : [];
}

// Returns the saved list, or null when it holds something that is not a check
function setHidden(userId, hidden) {
    if (!Array.isArray(hidden) || hidden.some((key) => !KEYS.includes(key))) return null;
    const clean = KEYS.filter((key) => hidden.includes(key));
    const data = read();
    data.users[String(userId)] = { hidden: clean, updated_at: new Date().toISOString() };
    writeJsonAtomic(FILE, data);
    return clean;
}

module.exports = { OPTIONS, KEYS, hiddenFor, setHidden };
// <Jun Kai end>
