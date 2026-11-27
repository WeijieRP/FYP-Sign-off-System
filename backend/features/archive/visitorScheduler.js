// Owner: Role 3, Jun Kai.
// Visitor Data Archive timer, started by backend/server.js only: finishes interrupted runs at boot, then every 15 minutes deletes expired archive files and starts the automatic archive when it is due.
// <Jun Kai start>
const settingsStore = require('./visitorSettings');
const schedule = require('./visitorSchedule');
const runner = require('./visitorRunner');
const saveGate = require('./saveGate');

const FIRST_TICK_MS = 2 * 60 * 1000;
const TICK_MS = 15 * 60 * 1000;
const state = { started: false, ticking: false };

async function automaticArchive(settings, now) {
    const auto = settings.automatic;
    if (!auto.enabled || runner.isBusy()) return;
    const saved = runner.readAutomationState();
    if (!schedule.isDue(auto, saved, now)) return;
    const key = schedule.periodKey(auto, saved, now);
    const at = now.toISOString();
    const criteria = runner.criteriaFromSettings(settings, now);
    if (!criteria.types.length) return;
    // validate() refuses this; a hand-edited settings file could still hold it (each run would save the same records)
    if (!settings.deleteAfterArchive) {
        const next = schedule.afterFailure(saved, key, now);
        runner.writeAutomationState({ ...next, lastAutomaticResult: { at, status: 'failed', runId: null, error: settingsStore.EXPORT_ONLY_AUTOMATIC } });
        return;
    }
    try {
        const { counts } = await runner.preview(criteria);
        if (!counts.feedback && !counts.lostFound && !counts.visitors) {
            runner.writeAutomationState({ ...saved, lastAutomaticAt: at, lastAutomaticResult: { at, status: 'nothing-due' }, failures: null });
            return;
        }
        await runner.startRun({
            trigger: 'automatic',
            criteria,
            deleteAfter: settings.deleteAfterArchive,
            folder: settings.folder,
            onFinish: ({ runId, status, error }) => {
                // 'saved' means the records are still there (the delete failed or they changed): try again later
                const ok = status === 'done';
                const current = runner.readAutomationState();
                const next = ok ? { ...current, lastAutomaticAt: at, failures: null } : schedule.afterFailure(current, key, new Date());
                runner.writeAutomationState({ ...next, lastAutomaticResult: { at, status, runId, error: error || null } });
            }
        });
    } catch (error) {
        if (error.status === 409) return; // an admin started one: try again at the next tick
        const next = schedule.afterFailure(runner.readAutomationState(), key, now);
        runner.writeAutomationState({ ...next, lastAutomaticResult: { at, status: 'failed', runId: null, error: error.message } });
        console.log(`Automatic visitor archive did not start: ${error.message}`);
    }
}

async function tick(now = new Date()) {
    if (state.ticking) return;
    state.ticking = true;
    try {
        await runner.ensureRecovered(); // tried again here when the database was not reachable at boot
        const settings = settingsStore.read();
        try {
            await runner.expireFiles(settings.keepFiles, now);
        } catch (error) {
            console.debug(`Visitor archive: file expiry skipped (${error.message})`);
        }
        await automaticArchive(settings, now);
    } catch (error) {
        console.debug(`Visitor archive: tick failed (${error.message})`);
    } finally {
        state.ticking = false;
    }
}

function start() {
    if (state.started) return;
    state.started = true;
    saveGate.clearStaleDeletes(); // a delete step cut off by a stop would otherwise make kiosk saves wait
    runner.ensureRecovered()
        .catch((error) => {
            if (error.code === 'ER_NO_SUCH_TABLE') console.warn('Visitor Data Archive: table visitor_archives is missing, run npm run db:migrate');
            else console.debug(`Visitor archive: recovery skipped (${error.message})`);
        })
        .finally(() => {
            const first = setTimeout(() => {
                tick().catch(() => {});
                setInterval(() => tick().catch(() => {}), TICK_MS).unref();
            }, FIRST_TICK_MS);
            first.unref();
        });
}

module.exports = { start, tick };
// <Jun Kai end>
