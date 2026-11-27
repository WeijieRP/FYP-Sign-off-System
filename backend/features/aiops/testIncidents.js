// Owner: Role 3, Jun Kai.
// "Send test incident" in the incident settings: one incident with made up numbers, of the kind an admin picks, so they
// can see how the Incidents page handles it: the chart, the advisor's answer, the steps to follow, the fix to approve (Kiosk
// server down), Acknowledge, Resolve and the verdict. Its fingerprint starts with "test:" (fixes.TEST_PREFIX): it closes
// by itself 10 minutes after it opened, never teaches the advisor, never tunes a detector, and its fix only goes on its
// history. It replaced the seven Example incidents on 17 Nov 2026. Pure functions.
// <Jun Kai start>
const { TEST_PREFIX } = require('./fixes');

const MINUTE = 60 * 1000;

function sgtClock(ms) {
    const d = new Date(ms + 8 * 60 * MINUTE);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// n evenly spaced points ending now, stepMinutes apart, with values from f(i)
function points(nowMs, n, stepMinutes, f) {
    return Array.from({ length: n }, (_, i) => ({ t: nowMs - (n - 1 - i) * stepMinutes * MINUTE, v: Math.round(f(i) * 10) / 10 }));
}

// What the drawer lists and how each kind looks: numbers made up to look like the real incident of that detector
const TEST_KINDS = {
    cpu: {
        label: 'CPU much busier than usual',
        build: (nowMs) => ({
            detector: 'spike', kind: 'high', subject: 'cpu', severity: 'warn',
            title: 'CPU at 82 %, far above the usual 31 %',
            explanation: 'CPU use averaged 82 % over the last 5 minutes. Over the past 24 hours the typical level was 31 % (usual swing ± 4 %), so this is 13 times its usual swing above normal.',
            evidence: { metric: 'cpu', value: 82, baseline: 31, spread: 4, z: 12.7, unit: '%', windowSeconds: 300, samples: 5, above: 5, points: points(nowMs, 60, 2, (i) => (i < 48 ? 30 + (i % 4) : 34 + (i - 47) * 4)) }
        })
    },
    kiosk: {
        label: 'Kiosk server down',
        build: (nowMs) => {
            const since = nowMs - 4 * MINUTE;
            return {
                detector: 'services', kind: 'down', subject: 'kiosk', severity: 'critical',
                title: 'Kiosk server down (3 checks in a row)',
                explanation: `The health check could not reach the kiosk server in the last 3 runs, since ${sgtClock(since)} Singapore time. Last message: Not reachable`,
                evidence: { metric: 'kiosk', status: 'down', runs: 3, since: new Date(since).toISOString(), summary: 'Not reachable' }
            };
        }
    },
    disk: {
        label: 'Disk filling up',
        build: (nowMs) => ({
            detector: 'disk', kind: 'filling', subject: null, severity: 'warn',
            title: 'Disk full in about 6 days at 2.1 GB per day',
            explanation: 'Disk use grew by about 2.1 GB per day over the last 9 days. It is 93 % full now (443 of 476 GB), so at that rate it will be full in about 6 days.',
            evidence: { metric: 'disk', value: 443, unit: 'GB', percent: 93, totalGb: 476, gbPerDay: 2.1, daysUntilFull: 6, spanDays: 9, points: points(nowMs, 60, 216, (i) => 424 + i * 0.32) }
        })
    },
    tablet: {
        label: 'Tablet offline',
        build: () => ({
            detector: 'tablets', kind: 'offline', subject: 'test-tablet', severity: 'warn',
            title: 'Tablet Entrance offline for 25 minutes',
            explanation: 'The tablet Entrance last reported 25 minutes ago. A named tablet that is quiet for more than 10 minutes counts as offline at this sensitivity.',
            evidence: { metric: 'seconds_ago', value: 25, unit: 'min', limitMinutes: 10, name: 'Entrance', device_id: 'test-tablet' }
        })
    },
    errors: {
        label: 'Server errors',
        build: (nowMs) => ({
            detector: 'logs', kind: 'burst', subject: null, severity: 'warn',
            title: 'Burst of server errors: 14 in 5 minutes',
            explanation: 'The server logged 14 errors in the last 5 minutes; a usual 5 minutes has about 1.',
            evidence: { metric: 'errors', value: 14, baseline: 1, unit: '', windowSeconds: 300, process: 'server', template: 'Could not save the visitor photo: <path>', points: points(nowMs, 24, 5, (i) => (i === 23 ? 14 : i % 5 === 0 ? 1 : 0)) }
        })
    }
};
const TEST_KIND_DEFAULT = 'cpu';

// [{ key, label }] in the order of the drawer's list
const testKinds = () => Object.entries(TEST_KINDS).map(([key, kind]) => ({ key, label: kind.label }));

// The row for one test incident of that kind (the engine inserts it and adds the events), or null for an unknown kind
function testIncident(kindKey, nowMs, by) {
    const kind = Object.prototype.hasOwnProperty.call(TEST_KINDS, kindKey) ? TEST_KINDS[kindKey] : null;
    if (!kind) return null;
    const made = kind.build(nowMs);
    const name = by === null || by === undefined || by === '' ? 'an admin' : String(by);
    return {
        ...made,
        fingerprint: `${TEST_PREFIX}${kindKey}:${nowMs.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        explanation: `Test opened by ${name}: the numbers are made up, and it closes by itself after 10 minutes. ${made.explanation}`,
        evidence: { ...made.evidence, test: true }
    };
}

module.exports = { TEST_KINDS, TEST_KIND_DEFAULT, testKinds, testIncident };
// <Jun Kai end>
