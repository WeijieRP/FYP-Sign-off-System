#!/usr/bin/env node
// Owner: Role 3, Jun Kai.
// Replay evaluation of the anomaly detection: plays a synthetic week with seven planted faults through the real
// detectors and incident engine and prints what was caught, how fast, and any false alarm.
//   npm run aiops:replay                     seed 1, 7 days, a check every minute
//   npm run aiops:replay -- --seed=5         another week of noise (same faults)
//   npm run aiops:replay -- --step=5         a check every 5 minutes (faster)
// Needs no database and no running server. Exit code 1 when precision is under 0.8 or recall under 0.85.
// <Jun Kai start>
const replay = require('../backend/features/aiops/replay');

const flag = (name, fallback) => {
    const found = process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`));
    const value = found ? Number(found.split('=')[1]) : NaN;
    return Number.isFinite(value) ? value : fallback;
};
const pad = (text, width) => String(text).padEnd(width);
// Singapore time, written out by hand so every machine prints the same
const sgt = (iso) => {
    const d = new Date(Date.parse(iso) + 8 * 60 * 60 * 1000);
    const two = (n) => String(n).padStart(2, '0');
    return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
};
const span = (minutes) => (minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} h`);

(async () => {
    const options = { seed: flag('seed', 1), days: flag('days', 7), stepMinutes: flag('step', 1) };
    process.stdout.write(`Replaying ${options.days} days (seed ${options.seed}, a check every ${options.stepMinutes} min) `);
    const result = await replay.run({ ...options, onProgress: () => process.stdout.write('.') });
    console.log(' done\n');

    console.log(`${pad('Fault', 22)}${pad('Planted (Singapore)', 22)}${pad('Detected', 10)}${pad('Time to detect', 16)}Caught by`);
    console.log('-'.repeat(88));
    for (const fault of result.faults) {
        console.log(`${pad(`${fault.key} ${fault.title}`, 22)}${pad(sgt(fault.startAt), 22)}${pad(fault.detected ? 'yes' : 'NO', 10)}${pad(fault.detected ? span(fault.minutesToDetect) : '-', 16)}${fault.caughtBy.join(', ') || '-'}`);
    }

    console.log(`\nIncidents opened: ${result.incidents.length} (${result.truePositives} caused by a planted fault, ${result.falsePositives} false alarm${result.falsePositives === 1 ? '' : 's'})`);
    for (const alarm of result.falsePositiveList) console.log(`  false alarm: ${alarm.title} (${alarm.detector}), ${sgt(alarm.opened_at)}`);

    console.log(`\nPrecision ${result.precision.toFixed(2)}   (incidents that were real: 1.00 means no false alarm)`);
    console.log(`Recall    ${result.recall.toFixed(2)}   (planted faults that were caught: 1.00 means none missed)`);
    console.log(`Mean time to detect ${result.meanMinutesToDetect === null ? '-' : span(Math.round(result.meanMinutesToDetect))}   (the slow creeps set this: a leak is only an incident once memory passes 80 %)`);
    const sudden = result.faults.filter((fault) => fault.detected && fault.minutesToDetect <= 60).map((fault) => fault.minutesToDetect);
    if (sudden.length) console.log(`Sudden faults (spike, service, tablet, errors): caught within ${Math.max(...sudden)} min`);
    console.log(`${result.ticks} checks in ${(result.ms / 1000).toFixed(1)} s`);

    if (result.precision < 0.8 || result.recall < 0.85) {
        console.error('\nBelow the bar (precision 0.80, recall 0.85).');
        process.exit(1);
    }
})().catch((error) => { console.error(`aiops-replay failed: ${error.message}`); process.exit(1); });
// <Jun Kai end>
