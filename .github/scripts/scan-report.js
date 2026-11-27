// <Jun Kai start>
// Turns the raw output of the three vulnerability scans in ci.yml into a short list in the run summary.
//   node .github/scripts/scan-report.js audit  npm-audit.json   packages (npm audit): a high or critical finding fails
//   node .github/scripts/scan-report.js codeql <folder>         the project's code (CodeQL .sarif files): listed only
//   node .github/scripts/scan-report.js zap    <folder>         the running servers (OWASP ZAP .json reports): listed only
const fs = require('fs');
const path = require('path');

const [mode, target] = process.argv.slice(2);
const lines = [];
const say = (line = '') => { lines.push(line); console.log(line); };
const cell = (text) => String(text ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
function finish(code) {
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
    process.exit(code);
}

function audit(file) {
    let report;
    try { report = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { report = { error: { summary: e.message } }; }
    if (!report.metadata) {
        // no answer from the registry is not the same as "nothing found", so the job fails
        say('### Package scan (npm audit)');
        say(`npm audit gave no result: ${cell(report.error && (report.error.summary || report.error.code) || 'unknown error')}`);
        console.log('::error::npm audit gave no result, so the packages could not be checked');
        return finish(1);
    }
    const order = ['critical', 'high', 'moderate', 'low', 'info'];
    const found = Object.values(report.vulnerabilities || {}).sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || a.name.localeCompare(b.name));
    const count = report.metadata.vulnerabilities;
    const blocking = (count.critical || 0) + (count.high || 0);
    say('### Package scan (npm audit)');
    say(`${count.total} package(s) with a known vulnerability: ${count.critical || 0} critical, ${count.high || 0} high, ${count.moderate || 0} moderate, ${count.low || 0} low.`);
    if (found.length) {
        say();
        say('| Package | Severity | In package.json | Comes in through | Fix |');
        say('| --- | --- | --- | --- | --- |');
        for (const v of found) {
            const through = [...new Set((v.via || []).map((x) => (typeof x === 'string' ? x : x.title)))].slice(0, 3).join('; ');
            const fix = v.fixAvailable === true ? 'npm audit fix' : v.fixAvailable && v.fixAvailable.name ? `${v.fixAvailable.name}@${v.fixAvailable.version}${v.fixAvailable.isSemVerMajor ? ' (major version)' : ''}` : 'no fixed version yet';
            say(`| ${cell(v.name)} | ${v.severity} | ${v.isDirect ? 'yes' : 'no'} | ${cell(through)} | ${cell(fix)} |`);
            if (v.severity === 'critical' || v.severity === 'high') console.log(`::error::${v.name}: ${v.severity} severity vulnerability (${through}). Fix: ${fix}`);
            else console.log(`::warning::${v.name}: ${v.severity} severity vulnerability (${through}). Fix: ${fix}`);
        }
    }
    if (blocking) say('\nA high or critical finding fails this check. Run `npm audit fix` in the project folder, test, and commit package.json and package-lock.json.');
    finish(blocking ? 1 : 0);
}

function codeql(folder) {
    const files = fs.existsSync(folder) ? fs.readdirSync(folder).filter((f) => f.endsWith('.sarif')) : [];
    say('### Code scan (CodeQL)');
    if (!files.length) { say('No result file was found.'); return finish(1); }
    const rows = [];
    for (const file of files) {
        for (const run of JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')).runs || []) {
            const rules = new Map();
            for (const part of [run.tool.driver, ...(run.tool.extensions || [])]) for (const rule of part.rules || []) rules.set(rule.id, rule);
            for (const result of run.results || []) {
                const rule = rules.get(result.ruleId) || {};
                const where = ((result.locations || [])[0] || {}).physicalLocation || {};
                rows.push({
                    score: Number((rule.properties || {})['security-severity'] || 0), rule: result.ruleId,
                    title: (rule.shortDescription || {}).text || result.ruleId,
                    place: `${(where.artifactLocation || {}).uri || '?'}:${(where.region || {}).startLine || '?'}`,
                });
            }
        }
    }
    const level = (score) => (score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'medium' : score > 0 ? 'low' : 'note');
    const tally = {};
    for (const row of rows) tally[level(row.score)] = (tally[level(row.score)] || 0) + 1;
    say(`${rows.length} finding(s)${rows.length ? ': ' + ['critical', 'high', 'medium', 'low', 'note'].filter((k) => tally[k]).map((k) => `${tally[k]} ${k}`).join(', ') : ''}. The full list with the code path of each one is in the repository's Security tab, under Code scanning.`);
    if (rows.length) {
        const byRule = new Map();
        for (const row of rows) { if (!byRule.has(row.rule)) byRule.set(row.rule, { ...row, places: [] }); byRule.get(row.rule).places.push(row.place); }
        say();
        say('| Severity | Rule | What it means | Count | Where (first 4) |');
        say('| --- | --- | --- | --- | --- |');
        for (const r of [...byRule.values()].sort((a, b) => b.score - a.score || b.places.length - a.places.length)) {
            say(`| ${level(r.score)}${r.score ? ` (${r.score})` : ''} | ${cell(r.rule)} | ${cell(r.title)} | ${r.places.length} | ${cell(r.places.slice(0, 4).join(', '))} |`);
        }
    }
    finish(0);
}

function zap(folder) {
    const files = fs.existsSync(folder) ? fs.readdirSync(folder).filter((f) => f.endsWith('.json')) : [];
    say('### Scan of the running servers (OWASP ZAP baseline)');
    if (!files.length) { say('No report was written, so the servers were not scanned.'); console.log('::error::the ZAP scan wrote no report'); return finish(1); }
    const risk = ['info', 'low', 'medium', 'high'];
    const alerts = new Map();
    for (const file of files) {
        for (const site of JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')).site || []) {
            for (const alert of site.alerts || []) {
                const key = `${alert.pluginid}|${alert.name}`;
                if (!alerts.has(key)) alerts.set(key, { name: alert.name, risk: Number(alert.riskcode), cwe: alert.cweid, urls: new Set(), fix: alert.solution });
                for (const hit of alert.instances || []) alerts.get(key).urls.add(hit.uri);
            }
        }
    }
    const list = [...alerts.values()].sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name));
    const tally = list.reduce((t, a) => { t[risk[a.risk]] = (t[risk[a.risk]] || 0) + 1; return t; }, {});
    say(`${files.length} page(s) scanned, ${list.length} kind(s) of finding${list.length ? ': ' + ['high', 'medium', 'low', 'info'].filter((k) => tally[k]).map((k) => `${tally[k]} ${k}`).join(', ') : ''}. The full reports are in the run's "zap-reports" download.`);
    if (list.length) {
        say();
        say('| Risk | Finding | CWE | Addresses hit | Example |');
        say('| --- | --- | --- | --- | --- |');
        for (const a of list) say(`| ${risk[a.risk]} | ${cell(a.name)} | ${a.cwe && a.cwe !== '-1' ? a.cwe : ''} | ${a.urls.size} | ${cell([...a.urls][0] || '')} |`);
    }
    finish(0);
}

if (mode === 'audit') audit(target);
else if (mode === 'codeql') codeql(target);
else if (mode === 'zap') zap(target);
else { console.error('usage: scan-report.js audit|codeql|zap <file or folder>'); process.exit(2); }
// <Jun Kai end>
