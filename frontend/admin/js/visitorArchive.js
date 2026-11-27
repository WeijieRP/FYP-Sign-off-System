// Owner: Role 3, Jun Kai.
// Visitor Data Archive page: the archive settings, the Archive dialog with live progress, the history table and the record viewer.
// <Jun Kai start>
let vaData = null;            // the last GET /overview answer
let vaRuns = [];              // the last GET /runs list, newest first
let vaLoading = false;
let vaReloadQueued = false;
let vaPollTimer = null;
let vaHistoryLimit = 50;
let vaHistoryMarkup = [];     // each history row as last drawn, so a refresh swaps only the rows that changed
let vaFilledJson = '';        // the saved settings the form was last filled from
let vaFormSnapshot = '';      // the form values right after that fill; anything different is an unsaved change
let vaFolderCheck = null;     // { typed, folder } from the last Check folder
let vaLiveRunId = null;       // the run the Archive dialog follows
let vaRunTimer = null;
let vaWatchRunId = null;      // a run started here: a toast says how it ended if the dialog is closed by then
let vaPreviewTimer = null;
let vaPreviewSeq = 0;
let vaPreviewData = null;
let vaRunStarting = false;
let vaStagesMarkup = '';
let vaUnlockedUntil = 0;
let vaUnlockedAt = 0;         // when the last password was accepted; an overview asked for before that is out of date
let vaUnlockNext = null;      // { action: 'view' | 'download' | 'reload', runId } once the password is accepted
let vaDeleteRunId = null;
let vaSearchTimer = null;
let vaViewLockTimer = null;
let vaAnnounceTimer = null;
let vaSaveConfirm = null;     // { settings } while the save bar asks for the password before archive files are deleted
let vaResultRun = null;       // the finished run the result view shows
let vaFolderStatusKey = '';   // what the folder status shows now, so the live region is only rewritten on a change
const vaView = { runId: null, run: null, type: 'feedback', q: '', page: 1, total: 0, rows: [], decrypted: { feedback: {}, lostFound: {} }, keyMatches: null, seq: 0 };
const vaDialogOpeners = {};
const vaAfterClose = {};

const VA_PAGE_SIZE = 25;
const VA_HISTORY_STEP = 100;
// the history shows the 5 newest archives until Show all is clicked (12 Nov 2026 design)
const VA_HISTORY_FOLD = 5;
let vaHistoryFolded = true;
const VA_HISTORY_MAX = 1000;
const VA_AUTO_NEEDS_DELETE = 'Automatic archiving needs Delete the records from the database. With export only, every run would save the same records again.';
const VA_NETWORK_FOLDER = 'Choose a folder on this PC or on a drive plugged into it. Network folders are not supported.';
const VA_KEY_ALERT = 'This archive was made with a different encryption key, so emails and contact details cannot be shown. Names, pledges and photos are still readable. To read them, the original key must be put back on this server.';
const VA_REDUCE_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const VA_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VA_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const VA_END_STATES = ['done', 'saved', 'failed', 'interrupted'];
const VA_STATUS = {
    done: ['ok', 'Archived'], saved: ['info', 'Saved, records kept'], failed: ['down', 'Failed'], interrupted: ['warn', 'Interrupted'],
    running: ['info', 'Running'], deleting: ['info', 'Running'], cleaning: ['info', 'Running']
};
const VA_STAGES = [['collecting', 'Collecting'], ['writing', 'Writing'], ['verifying', 'Checking'], ['deleting', 'Deleting'], ['cleaning', 'Cleaning up']];
const VA_KEEP_FIELDS = { 'feedback-keep': 'keep', 'lostfound-keep': 'keep', 'keep-files': 'keepFiles' };
const VA_PASSWORD_HINTS = {
    'va-run-password': 'Needed to start an archive.', 'va-unlock-password': 'Archives stay unlocked for 10 minutes.',
    'va-delete-password': 'Needed to delete an archive file.', 'va-confirm-password': 'Needed to delete archive files.'
};
const VA_VIEW_COLUMNS = {
    feedback: ['Visitor', 'Pledge', 'Answers', 'Photos', 'Submitted'],
    lostFound: ['Report', 'Item', 'Contact', 'Status', 'Photo', 'Reported']
};
const VA_TICK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
const VA_EYE = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
// the numbers from the spec; the overview's own limits replace them when it sends them
const vaLimits = {
    keep: { days: [1, 3650], weeks: [1, 520], months: [1, 120], years: [1, 10] },
    keepFiles: { months: [1, 240], years: [1, 20] },
    everyDays: [1, 365],
    folderMax: 400
};

function vaTime(value) {
    if (value === null || value === undefined || value === '') return NaN;
    return typeof value === 'number' ? value : new Date(value).getTime();
}

// Singapore is UTC+8 all year, so shift the instant by 8 hours and read the UTC fields
function vaSgt(value) {
    const ms = vaTime(value);
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms + 8 * 3600000);
    const two = (n) => String(n).padStart(2, '0');
    return {
        year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(),
        time: `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`,
        iso: `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`
    };
}

// "9 Nov 2026, 14:32"
function vaDateTime(value) {
    const t = vaSgt(value);
    return t ? `${t.day} ${VA_MONTHS[t.month]} ${t.year}, ${t.time}` : '–';
}

// '2025-11-09' -> "9 Nov 2025"
function vaDayText(day) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
    return m ? `${Number(m[3])} ${VA_MONTHS[Number(m[2]) - 1]} ${m[1]}` : '–';
}

const vaToday = () => vaSgt(Date.now()).iso;
const vaNum = (n) => Number(n || 0).toLocaleString('en-SG');
const vaPlural = (n, one, many) => `${vaNum(n)} ${Number(n) === 1 ? one : many || `${one}s`}`;
const vaSentence = (text) => {
    const s = String(text || '').trim();
    return !s || /[.!?]$/.test(s) ? s : `${s}.`;
};

// 412 MB, 1.2 GB
function vaBytes(bytes) {
    let value = Number(bytes);
    if (bytes === null || bytes === undefined || !Number.isFinite(value) || value < 0) return '–';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    return `${i === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

function vaOrdinal(n) {
    const tens = n % 100;
    return `${n}${tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

// { amount: 12, unit: 'months' } -> "12 months"
function vaPeriodText(period) {
    if (!period) return '–';
    return vaPlural(period.amount, String(period.unit || '').replace(/s$/, ''));
}

// { amount: 12, unit: 'months' } -> "12-month"
function vaPeriodWord(period) {
    if (!period) return '';
    return `${vaNum(period.amount)}-${String(period.unit || '').replace(/s$/, '')}`;
}

function vaScheduleText(auto) {
    if (!auto || !auto.enabled) return 'Off';
    if (auto.frequency === 'daily') return 'Daily';
    if (auto.frequency === 'weekly') return `Weekly on ${VA_WEEKDAYS[auto.weekday] || 'Monday'}`;
    if (auto.frequency === 'monthly') return `Monthly on the ${vaOrdinal(Number(auto.dayOfMonth) || 1)}`;
    return `Every ${vaPlural(auto.everyDays, 'day')}`;
}

// a run that only removed visitors with no feedback left says "1 visitor", not "No records"
function vaRecordsText(c) {
    const parts = [];
    if (Number(c.feedback)) parts.push(`${vaNum(c.feedback)} feedback`);
    if (Number(c.lostFound)) parts.push(`${vaNum(c.lostFound)} lost & found`);
    if (!parts.length && Number(c.visitors)) parts.push(vaPlural(c.visitors, 'visitor'));
    return parts.join(', ') || 'No records';
}

// "11 records", or "1 visitor" for a run of visitors with no feedback left
function vaRecordTotal(c) {
    const records = Number(c.feedback || 0) + Number(c.lostFound || 0);
    if (!records && Number(c.visitors)) return { n: Number(c.visitors), text: vaPlural(c.visitors, 'visitor') };
    return { n: records, text: vaPlural(records, 'record') };
}

// "12 leaves stay on the tree without names", "... with initials" or "..., 5 with initials"; '' when none stays
function vaLeavesText(kept, initials) {
    const n = Number(kept) || 0;
    if (!n) return '';
    const start = `${vaNum(n)} ${n === 1 ? 'leaf stays' : 'leaves stay'} on the tree`;
    const named = Math.min(n, Number(initials) || 0);
    if (!named) return `${start} without ${n === 1 ? 'a name' : 'names'}`;
    return named === n ? `${start} with initials` : `${start}, ${vaNum(named)} with initials`;
}

// "1 VIP leaf is not archived and stays on the tree as it is"; '' when no VIP leaf matched
function vaVipText(n) {
    const count = Number(n || 0);
    return count ? `${vaNum(count)} VIP ${count === 1 ? 'leaf is' : 'leaves are'} not archived and ${count === 1 ? 'stays' : 'stay'} on the tree as ${count === 1 ? 'it is' : 'they are'}` : '';
}

// the leaves of the previewed submissions under the saved "Leaves on the tree" choice; '' when nothing changes on the tree
function vaLeavesPlan(c, mode, deleting) {
    const leaves = Number(c.leaves || 0);
    if (!deleting || !leaves) return '';
    if (mode === 'remove') return `${vaPlural(leaves, 'leaf leaves', 'leaves leave')} the tree; its year book still counts ${leaves === 1 ? 'it' : 'them'}`;
    return vaLeavesText(leaves, mode === 'initials' ? c.leavesNamed : 0);
}

function vaCountsText(c) {
    const visitors = `${vaPlural(c.feedback, 'feedback submission')} from ${vaPlural(c.visitors, 'visitor')}${Number(c.visitorsDeleted) ? ` (${vaNum(c.visitorsDeleted)} deleted)` : ''}`;
    const photos = `${vaPlural(c.photos, 'photo')}${Number(c.missingPhotos) ? ` (${vaNum(c.missingPhotos)} missing)` : ''}`;
    return [visitors, vaPlural(c.answers, 'answer'), vaPlural(c.likes, 'like'), photos, vaPlural(c.lostFound, 'lost & found report')].join(', ');
}

function vaIcon(name, size = 16) {
    if (name !== 'eye') return uiIcon(name, size);
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${VA_EYE}</svg>`;
}

function vaSetText(id, text, title) {
    const el = document.getElementById(id);
    if (!el) return;
    // a loading skeleton has no text of its own, so it is replaced even when the new text is empty
    if (el.textContent !== text || el.firstElementChild) el.textContent = text;
    if (title !== undefined) el.title = title;
}

// everything outside an open modal dialog is hidden from screen readers, so an open dialog's own live region is used
function vaAnnounce(text) {
    clearTimeout(vaAnnounceTimer);
    for (const region of document.querySelectorAll('#visitor-archive-page .va-announce, #va-live')) region.textContent = '';
    vaAnnounceTimer = setTimeout(() => {
        const region = document.querySelector('.va-dialog[open] .va-announce') || document.getElementById('va-live');
        if (region) region.textContent = text;
    }, 60);
}

// fetch with the page's error rules: a plain-English message, with the status and the field name attached
async function vaRequest(url, method = 'GET', body) {
    const options = { method, cache: 'no-store' };
    if (body !== undefined) {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(body);
    }
    let response;
    try {
        response = await fetch(url, options);
    } catch {
        throw new Error('The server did not answer. Check that it is running.');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.success === false) {
        const error = new Error((data && data.error) || `The server answered with status ${response.status}.`);
        error.status = response.status;
        error.field = data ? data.field : undefined;
        error.body = data;
        throw error;
    }
    return data;
}

// [min, max] or { min, max } from the server's limits, or null
function vaRange(value) {
    if (Array.isArray(value) && value.length === 2) return value.map(Number);
    if (value && typeof value === 'object' && 'min' in value && 'max' in value) return [Number(value.min), Number(value.max)];
    return null;
}

function vaApplyLimits(limits) {
    if (!limits || typeof limits !== 'object') return;
    for (const group of ['keep', 'keepFiles']) {
        if (!limits[group] || typeof limits[group] !== 'object') continue;
        for (const unit of Object.keys(vaLimits[group])) {
            const range = vaRange(limits[group][unit]);
            if (range) vaLimits[group][unit] = range;
        }
    }
    const every = vaRange(limits.everyDays || (limits.automatic && limits.automatic.everyDays));
    if (every) vaLimits.everyDays = every;
    const folderMax = Number(limits.folderMaxLength || (limits.folder && limits.folder.maxLength));
    if (folderMax > 0) vaLimits.folderMax = folderMax;
    document.getElementById('va-auto-every').max = String(vaLimits.everyDays[1]);
    document.getElementById('va-folder').maxLength = vaLimits.folderMax;
}

// manual: the Refresh button, which stays disabled until this load is done
async function vaLoad(manual) {
    if (!document.getElementById('visitor-archive-page')) return;
    if (vaLoading) {
        vaReloadQueued = true;
        return;
    }
    vaLoading = true;
    vaBind();
    // busy, not disabled, so a keyboard user keeps the focus on the button
    const refresh = document.getElementById('va-refresh-btn');
    if (manual === true) refresh.setAttribute('aria-busy', 'true');
    const startedAt = Date.now();
    try {
        const [overview, runs] = await Promise.allSettled([
            vaRequest('/api/admin/visitor-archive/overview'),
            vaRequest(`/api/admin/visitor-archive/runs?limit=${vaHistoryLimit}`)
        ]);
        if (overview.status === 'rejected') throw overview.reason;
        vaData = overview.value;
        vaApplyLimits(vaData.limits);
        if (startedAt >= vaUnlockedAt) vaUnlockedUntil = vaTime(vaData.unlockedUntil) || 0;
        vaArmViewLock();
        if (runs.status === 'fulfilled') vaRuns = Array.isArray(runs.value.runs) ? runs.value.runs : [];
        else console.debug('Visitor archive history failed:', runs.reason.message);
        document.getElementById('va-load-error').hidden = true;
        vaRenderSummary();
        vaSyncForm();
        vaRenderFormMeta();
        vaRenderHistory(runs.status === 'rejected' ? 'runs' : '');
        vaCheckWatched();
    } catch (error) {
        console.debug('Visitor archive overview failed:', error.message);
        vaShowLoadError(error);
    } finally {
        vaLoading = false;
        refresh.removeAttribute('aria-busy');
        if (vaReloadQueued) {
            vaReloadQueued = false;
            vaLoad();
        } else {
            vaStartPolling();
        }
    }
}

// every 30 seconds while the page is open, every 3 seconds while an archive runs; on another page the tick does nothing
function vaStartPolling() {
    clearTimeout(vaPollTimer);
    vaPollTimer = setTimeout(() => {
        const page = document.getElementById('visitor-archive-page');
        if (page && page.classList.contains('active') && sessionStorage.getItem('loggedUser')) vaLoad();
        else vaStartPolling();
    }, vaData && vaData.running ? 3000 : 30000);
}

// one plain sentence in the banner; the server's own words only when they tell IT what to run
function vaShowLoadError(error) {
    let text = 'The archive overview could not be loaded. The page tries again every 30 seconds; if it keeps failing, check System Health.';
    if (error.status === 403) text = 'Only a system administrator can use this page.';
    else if (error.status === 503 && /npm run/.test(error.message)) text = vaSentence(error.message);
    vaSetText('va-load-error-text', text);
    document.getElementById('va-load-error').hidden = false;
    if (vaData) return;
    for (const id of ['va-due-value', 'va-due-hint', 'va-auto-value', 'va-auto-hint', 'va-last-value', 'va-last-hint', 'va-folder-value', 'va-folder-hint']) vaSetText(id, id.endsWith('value') ? '–' : '');
    if (!vaRuns.length) vaRenderHistory('overview');
}

// "Older than 12 months (before 9 Nov 2025)", or one part per type when their keep periods differ
function vaDueAgeText(settings, fb, lf) {
    const fbKeep = vaPeriodText(settings.feedback && settings.feedback.keep);
    const lfKeep = vaPeriodText(settings.lostFound && settings.lostFound.keep);
    if (!lf.enabled || (fb.enabled && fb.beforeDay === lf.beforeDay)) return `Older than ${fbKeep} (before ${vaDayText(fb.beforeDay)})`;
    if (!fb.enabled) return `Older than ${lfKeep} (before ${vaDayText(lf.beforeDay)})`;
    return `Feedback older than ${fbKeep}, lost & found older than ${lfKeep}`;
}

function vaRenderSummary() {
    const d = vaData;
    const due = d.due || {};
    const fb = due.feedback || {};
    const lf = due.lostFound || {};
    const on = [fb, lf].filter((x) => x.enabled);
    const total = on.reduce((sum, x) => sum + Number(x.count || 0), 0);
    const orphans = fb.enabled ? Number(due.orphanVisitors || 0) : 0;
    const vip = fb.enabled ? vaVipText(fb.vipLeaves) : '';
    if (!on.length) {
        vaSetText('va-due-value', 'Off');
        vaSetText('va-due-hint', 'No record type is switched on', '');
    } else {
        let value = vaPlural(total, 'record');
        let hint = total ? vaDueAgeText(d.settings || {}, fb, lf) : 'Nothing is older than its keep period';
        if (!total && orphans) {
            value = vaPlural(orphans, 'visitor');
            hint = `With no feedback left, last visit before ${vaDayText(fb.beforeDay)}`;
        } else if (orphans) {
            hint += ` + ${vaPlural(orphans, 'visitor')} with no feedback left`;
        }
        const tip = [
            fb.enabled ? `${vaPlural(fb.count, 'feedback submission')} before ${vaDayText(fb.beforeDay)}` : '',
            lf.enabled ? `${vaPlural(lf.count, 'lost & found report')} before ${vaDayText(lf.beforeDay)}` : '',
            orphans ? `${vaPlural(orphans, 'visitor')} with no feedback left` : '',
            vip
        ].filter(Boolean).join(', ');
        if (vip && !total && !orphans) hint = vip;
        vaSetText('va-due-value', value);
        vaSetText('va-due-hint', hint, tip);
    }

    const auto = d.automatic || {};
    const schedule = (d.settings && d.settings.automatic) || {};
    vaSetText('va-auto-value', vaScheduleText({ ...schedule, enabled: !!auto.enabled }));
    vaSetText('va-auto-hint', !auto.enabled ? 'Switched off' : auto.nextDueAt ? `Next: ${vaDateTime(auto.nextDueAt)}` : 'Next run not planned yet');

    const last = d.lastRun;
    if (!last) {
        vaSetText('va-last-value', 'None yet');
        vaSetText('va-last-hint', 'No archive has been made');
    } else {
        const size = last.file && last.file.size ? `, ${vaBytes(last.file.size)}` : '';
        vaSetText('va-last-value', vaDateTime(last.finishedAt || last.startedAt));
        vaSetText('va-last-hint', `${vaRecordTotal(last.counts || {}).text}${size} · ${(VA_STATUS[last.status] || ['muted', last.status])[1]}`);
    }

    const folder = d.folder || {};
    document.getElementById('va-folder-fact').classList.toggle('is-problem', !!folder.problem);
    vaSetText('va-folder-value', folder.problem ? 'Not usable' : folder.freeBytes === null || folder.freeBytes === undefined ? '–' : `${vaBytes(folder.freeBytes)} free`);
    vaSetText('va-folder-hint', folder.problem || folder.path || '–', folder.path || '');

    const running = d.running;
    document.getElementById('va-run-strip').hidden = !running;
    if (running) {
        const run = vaRuns.find((r) => r.id === running.runId);
        vaSetText('va-run-strip-text', vaStageText(running.stage, running));
        vaSetBar('va-run-strip-bar', vaProgressFraction(running.stage, running, !run || run.deleteRecords !== false));
    }
    document.getElementById('va-archive-btn').disabled = false;
    vaSetText('va-archive-btn', running ? 'View progress' : 'Archive now');

    const soft = d.softArchive || {};
    const settings = d.settings || {};
    const fbSettings = settings.feedback || {};
    vaSetText('va-life-soft', soft.enabled ? `After ${vaPlural(soft.afterDays, 'day')}` : 'Not moved automatically');
    // nothing leaves the database on its own while automatic archiving is off
    let lifecycle = 'Switched off for feedback';
    if (fbSettings.enabled) {
        const how = settings.automatic && settings.automatic.enabled ? 'archived automatically' : 'when you archive';
        lifecycle = `After ${vaPeriodText(fbSettings.keep)}, ${how}${settings.deleteAfterArchive === false ? ' (records kept)' : ''}`;
    }
    vaSetText('va-life-archive', lifecycle);
}

// the Change links in the summary jump to the setting and mark it for a moment
function vaGoToSetting(id) {
    const input = document.getElementById(id);
    if (!input || input.matches(':disabled')) return;
    const row = input.closest('.va-option, .ui-field') || input;
    row.scrollIntoView({ block: 'center', behavior: VA_REDUCE_MOTION ? 'auto' : 'smooth' });
    input.focus({ preventScroll: true });
    row.classList.remove('va-flash');
    void row.offsetWidth;
    row.classList.add('va-flash');
    setTimeout(() => row.classList.remove('va-flash'), 1600);
}

function vaStageText(stage, progress) {
    const p = progress || {};
    if (stage === 'writing') {
        return Number(p.totalEntries)
            ? `Writing the zip file: ${vaNum(p.processedEntries)} of ${vaNum(p.totalEntries)} entries, ${vaBytes(p.processedBytes)} of ${vaBytes(p.totalBytes)}`
            : 'Writing the zip file';
    }
    return {
        collecting: 'Collecting the records', verifying: 'Checking the file', deleting: 'Deleting the records from the database',
        cleaning: 'Removing the photo files', finished: 'Finished'
    }[stage] || 'Working';
}

// one bar for the whole run: each stage owns a slice; only writing reports counters, so it moves inside its slice
function vaProgressFraction(stage, progress, deleting) {
    if (stage === 'finished') return 1;
    const slices = deleting
        ? { collecting: [0, 0.05], writing: [0.05, 0.75], verifying: [0.75, 0.9], deleting: [0.9, 0.96], cleaning: [0.96, 1] }
        : { collecting: [0, 0.05], writing: [0.05, 0.8], verifying: [0.8, 1] };
    const slice = slices[stage];
    if (!slice) return 0;
    const p = progress || {};
    let part = 0;
    if (stage === 'writing' && Number(p.totalBytes) > 0) part = p.processedBytes / p.totalBytes;
    else if (stage === 'writing' && Number(p.totalEntries) > 0) part = p.processedEntries / p.totalEntries;
    part = Math.min(1, Math.max(0, Number(part) || 0));
    return slice[0] + (slice[1] - slice[0]) * part;
}

function vaSetBar(id, fraction) {
    const fill = document.getElementById(id);
    if (!fill) return;
    const value = Math.min(1, Math.max(0, fraction));
    fill.style.transform = `scaleX(${value.toFixed(3)})`;
    fill.parentElement.setAttribute('aria-valuenow', String(Math.round(value * 100)));
}

// ---- settings form ----

function vaKeepParts(name) {
    const get = (suffix) => document.getElementById(`va-${name}${suffix}`);
    return { select: get(''), box: get('-custom'), amount: get('-amount'), unit: get('-unit'), hint: get('-hint') };
}

function vaKeepRange(name) {
    const { unit } = vaKeepParts(name);
    return vaLimits[VA_KEEP_FIELDS[name]][unit.value] || [1, 1];
}

function vaKeepRangeText(name) {
    const [min, max] = vaKeepRange(name);
    return `From ${vaNum(min)} to ${vaNum(max)} ${vaKeepParts(name).unit.value}.`;
}

// the preset option that means the same period (12 months and 1 year are the same), or ''
function vaKeepPreset(select, keep) {
    const months = (k) => (k.unit === 'years' ? k.amount * 12 : k.unit === 'months' ? k.amount : null);
    const wanted = { amount: Number(keep.amount), unit: keep.unit };
    for (const option of select.options) {
        if (option.value === 'custom') continue;
        const [amount, unit] = option.value.split(':');
        const preset = { amount: Number(amount), unit };
        if (preset.amount === 0 || wanted.amount === 0) {
            if (preset.amount === wanted.amount) return option.value;
            continue;
        }
        if ((preset.amount === wanted.amount && preset.unit === wanted.unit) || (months(preset) !== null && months(preset) === months(wanted))) return option.value;
    }
    return '';
}

function vaShowKeepCustom(name, show) {
    const { box, amount, select, hint } = vaKeepParts(name);
    box.hidden = !show;
    amount.removeAttribute('aria-invalid');
    select.removeAttribute('aria-invalid');
    hint.hidden = !show;
    hint.classList.remove('is-error');
    hint.textContent = vaKeepRangeText(name);
}

// a saved period goes back into its preset, or into Custom when no preset has it
function vaFillKeep(name, keep) {
    const { select, amount, unit } = vaKeepParts(name);
    if (!keep) return;
    const preset = vaKeepPreset(select, keep);
    select.value = preset || 'custom';
    select.dataset.last = preset || `${keep.amount}:${keep.unit}`;
    amount.value = String(keep.amount);
    unit.value = keep.unit;
    if (!unit.value) unit.value = unit.options[unit.options.length - 1].value;
    vaShowKeepCustom(name, !preset);
}

// Custom opens the number box with the period that was chosen before
function vaKeepChanged(name, source) {
    const { select, amount, unit, hint } = vaKeepParts(name);
    if (source === unit) {
        if (!hint.classList.contains('is-error')) hint.textContent = vaKeepRangeText(name);
        return;
    }
    if (source !== select) return;
    if (select.value !== 'custom') {
        select.dataset.last = select.value;
        vaShowKeepCustom(name, false);
        return;
    }
    const [lastAmount, lastUnit] = String(select.dataset.last || '12:months').split(':');
    amount.value = Number(lastAmount) > 0 ? lastAmount : '1';
    unit.value = Number(lastAmount) > 0 ? lastUnit : 'years';
    if (!unit.value) unit.value = unit.options[unit.options.length - 1].value;
    vaShowKeepCustom(name, true);
    amount.focus();
    amount.select();
}

// { value } or { error } for one period field
function vaReadKeep(name) {
    const { select, amount, unit } = vaKeepParts(name);
    if (select.value !== 'custom') {
        const [a, u] = select.value.split(':');
        return { value: { amount: Number(a), unit: u } };
    }
    const typed = Number(amount.value);
    if (!amount.value.trim() || !Number.isInteger(typed) || typed < 1) return { error: 'Enter a whole number.' };
    const [min, max] = vaKeepRange(name);
    if (typed < min || typed > max) return { error: `Choose from ${vaNum(min)} to ${vaNum(max)} ${unit.value}.` };
    return { value: { amount: typed, unit: unit.value } };
}

function vaFillForm(s) {
    const check = (id, on) => { document.getElementById(id).checked = !!on; };
    const auto = s.automatic || {};
    check('va-feedback-enabled', s.feedback && s.feedback.enabled);
    vaFillKeep('feedback-keep', s.feedback && s.feedback.keep);
    check('va-lostfound-enabled', s.lostFound && s.lostFound.enabled);
    vaFillKeep('lostfound-keep', s.lostFound && s.lostFound.keep);
    check('va-lostfound-resolved', s.lostFound && s.lostFound.onlyResolved);
    check('va-include-photos', s.includePhotos);
    check('va-after-delete', s.deleteAfterArchive !== false);
    check('va-after-keep', s.deleteAfterArchive === false);
    document.getElementById('va-leaves').value = ['initials', 'remove'].includes(s.leaves) ? s.leaves : 'keep';
    check('va-auto-enabled', auto.enabled);
    document.getElementById('va-auto-frequency').value = auto.frequency || 'monthly';
    document.getElementById('va-auto-weekday').value = String(auto.weekday ?? 1);
    document.getElementById('va-auto-day').value = String(auto.dayOfMonth || 1);
    document.getElementById('va-auto-every').value = String(auto.everyDays || 30);
    check('va-auto-anytime', !auto.time);
    document.getElementById('va-auto-time').value = auto.time || '';
    document.getElementById('va-folder').value = s.folder || '';
    vaFillKeep('keep-files', s.keepFiles);
    vaFilledJson = JSON.stringify(s);
    vaClearErrors();
    vaUpdateForm();
    vaFormSnapshot = vaSnapshot();
    vaFolderCheck = null;
    vaUpdateDirty();
}

// a refresh fills the form only when nobody is editing it, so a field being typed in is never overwritten
function vaSyncForm() {
    const s = vaData.settings;
    if (!s) return;
    const form = document.getElementById('va-settings-form');
    const editing = vaIsDirty() || form.contains(document.activeElement);
    if (!vaFormSnapshot || (JSON.stringify(s) !== vaFilledJson && !editing)) vaFillForm(s);
    document.getElementById('va-settings-fields').disabled = false;
}

// only the settings fields count: the password and user name boxes in the save bar are not settings
function vaSnapshot() {
    const fields = document.getElementById('va-settings-fields');
    return JSON.stringify([...fields.querySelectorAll('input, select')].map((el) => (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value)));
}

function vaIsDirty() {
    return !!vaFormSnapshot && vaSnapshot() !== vaFormSnapshot;
}

function vaUpdateDirty() {
    const bar = document.getElementById('va-savebar');
    const dirty = vaIsDirty();
    if (bar.hidden === dirty) {
        // the focused Save or Discard button is about to disappear, so the focus moves to a place that stays
        if (!dirty && bar.contains(document.activeElement)) document.getElementById('va-settings-title').focus({ preventScroll: true });
        bar.hidden = !dirty;
        if (dirty) vaAnnounce('Unsaved changes.');
    }
    if (!dirty && vaSaveConfirm) vaEndConfirm();
    vaRenderNextRun();
    vaRenderExpiring();
}

// switches grey out what they turn off; the schedule shows only the fields its Repeat choice uses
function vaUpdateForm() {
    const feedbackOn = document.getElementById('va-feedback-enabled').checked;
    const lostFoundOn = document.getElementById('va-lostfound-enabled').checked;
    for (const id of ['va-feedback-keep', 'va-feedback-keep-amount', 'va-feedback-keep-unit']) document.getElementById(id).disabled = !feedbackOn;
    for (const id of ['va-lostfound-keep', 'va-lostfound-keep-amount', 'va-lostfound-keep-unit', 'va-lostfound-resolved']) document.getElementById(id).disabled = !lostFoundOn;
    document.getElementById('va-feedback-type').classList.toggle('is-off', !feedbackOn);
    document.getElementById('va-lostfound-type').classList.toggle('is-off', !lostFoundOn);
    const frequency = document.getElementById('va-auto-frequency').value;
    document.getElementById('va-auto-weekday-field').hidden = frequency !== 'weekly';
    document.getElementById('va-auto-day-field').hidden = frequency !== 'monthly';
    document.getElementById('va-auto-every-field').hidden = frequency !== 'custom';
    document.getElementById('va-auto-time').disabled = document.getElementById('va-auto-anytime').checked;
}

function vaFormChanged(event) {
    const target = event.target;
    if (!document.getElementById('va-settings-fields').contains(target)) return;
    // the confirm was worked out for the settings as they were, so any change goes back to the normal save bar
    if (vaSaveConfirm) vaEndConfirm();
    if (event.type === 'change' && target.dataset.vaKeep) vaKeepChanged(target.dataset.vaKeep, target);
    if (event.type === 'change' && target.id === 'va-auto-anytime' && !target.checked) {
        const time = document.getElementById('va-auto-time');
        time.disabled = false;
        time.focus();
    }
    if (target.id === 'va-folder') vaFolderEdited();
    const errorName = vaErrorNameFor(target.id);
    if (errorName && errorName !== 'folder') vaClearError(errorName);
    vaUpdateForm();
    vaUpdateDirty();
}

function vaErrorNameFor(id) {
    for (const name of Object.keys(VA_KEEP_FIELDS)) if (id.startsWith(`va-${name}`)) return name;
    if (id === 'va-auto-every') return 'every';
    if (id === 'va-auto-time' || id === 'va-auto-anytime') return 'time';
    if (['va-auto-enabled', 'va-feedback-enabled', 'va-lostfound-enabled', 'va-after-delete', 'va-after-keep'].includes(id)) return 'auto';
    if (id === 'va-folder') return 'folder';
    return null;
}

// the server names the field it refused with a dotted key such as "feedback.keep.amount"
function vaFieldTarget(field) {
    const key = String(field || '');
    if (key.startsWith('feedback.keep')) return 'feedback-keep';
    if (key.startsWith('lostFound.keep')) return 'lostfound-keep';
    if (key.startsWith('keepFiles')) return 'keep-files';
    if (key === 'automatic.everyDays') return 'every';
    if (key === 'automatic.time') return 'time';
    if (key === 'automatic.enabled' || key === 'automatic') return 'auto';
    if (key.startsWith('folder')) return 'folder';
    return null;
}

function vaErrorParts(name) {
    if (VA_KEEP_FIELDS[name]) {
        const parts = vaKeepParts(name);
        return { input: parts.select.value === 'custom' ? parts.amount : parts.select, hint: parts.hint };
    }
    if (name === 'every') return { input: document.getElementById('va-auto-every'), hint: document.getElementById('va-auto-every-hint') };
    if (name === 'time') return { input: document.getElementById('va-auto-time'), hint: document.getElementById('va-auto-time-hint') };
    if (name === 'auto') return { input: document.getElementById('va-auto-enabled'), hint: document.getElementById('va-auto-error') };
    return null;
}

// the hint under the field turns into the error, the box is marked invalid and gets the focus
function vaShowError(name, message) {
    if (name === 'folder') {
        const input = document.getElementById('va-folder');
        vaRenderFolderStatus({ problem: message });
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
    }
    const parts = vaErrorParts(name);
    if (!parts) {
        showNotification(message, 'error');
        return;
    }
    parts.hint.hidden = false;
    parts.hint.textContent = message;
    parts.hint.classList.add('is-error');
    parts.input.setAttribute('aria-invalid', 'true');
    if (!parts.input.disabled) parts.input.focus();
}

function vaClearError(name) {
    if (VA_KEEP_FIELDS[name]) {
        const { select, amount, hint } = vaKeepParts(name);
        select.removeAttribute('aria-invalid');
        amount.removeAttribute('aria-invalid');
        hint.classList.remove('is-error');
        hint.textContent = vaKeepRangeText(name);
        hint.hidden = select.value !== 'custom';
        return;
    }
    const parts = vaErrorParts(name);
    if (!parts) return;
    parts.input.removeAttribute('aria-invalid');
    parts.hint.classList.remove('is-error');
    if (name === 'every') {
        parts.hint.textContent = `From ${vaLimits.everyDays[0]} to ${vaLimits.everyDays[1]} days.`;
    } else {
        parts.hint.hidden = true;
        parts.hint.textContent = '';
    }
}

function vaClearErrors() {
    for (const name of [...Object.keys(VA_KEEP_FIELDS), 'every', 'time', 'auto']) vaClearError(name);
    document.getElementById('va-folder').removeAttribute('aria-invalid');
}

// the whole settings object for PUT /settings, or { error, target } for the first field that is wrong
function vaReadForm() {
    const saved = vaData.settings || {};
    const savedAuto = saved.automatic || {};
    const feedbackOn = document.getElementById('va-feedback-enabled').checked;
    const lostFoundOn = document.getElementById('va-lostfound-enabled').checked;
    const periods = {};
    const fallbacks = { 'feedback-keep': saved.feedback && saved.feedback.keep, 'lostfound-keep': saved.lostFound && saved.lostFound.keep, 'keep-files': saved.keepFiles };
    for (const [name, on] of [['feedback-keep', feedbackOn], ['lostfound-keep', lostFoundOn], ['keep-files', true]]) {
        const result = vaReadKeep(name);
        // a switched-off type keeps its saved period when its box holds something unusable
        if (result.error && (on || !fallbacks[name])) return { error: result.error, target: name };
        periods[name] = result.error ? fallbacks[name] : result.value;
    }
    const frequency = document.getElementById('va-auto-frequency').value;
    const everyInput = document.getElementById('va-auto-every');
    const [minDays, maxDays] = vaLimits.everyDays;
    let everyDays = Number(everyInput.value);
    if (!everyInput.value.trim() || !Number.isInteger(everyDays) || everyDays < minDays || everyDays > maxDays) {
        if (frequency === 'custom') {
            const whole = everyInput.value.trim() && Number.isInteger(everyDays);
            return { error: whole ? `Choose from ${minDays} to ${maxDays} days.` : 'Enter a whole number.', target: 'every' };
        }
        everyDays = savedAuto.everyDays || 30;
    }
    // the server uses the time for every Repeat choice, Custom included
    const anyTime = document.getElementById('va-auto-anytime').checked;
    const typedTime = document.getElementById('va-auto-time').value;
    let time = '';
    if (!anyTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(typedTime)) time = typedTime;
    else if (!anyTime) return { error: 'Enter a time, or tick Any time.', target: 'time' };
    const autoOn = document.getElementById('va-auto-enabled').checked;
    const deleteAfter = document.getElementById('va-after-delete').checked;
    if (autoOn && !feedbackOn && !lostFoundOn) return { error: 'Switch on at least one record type first.', target: 'auto' };
    if (autoOn && !deleteAfter) return { error: VA_AUTO_NEEDS_DELETE, target: 'auto' };
    const folder = document.getElementById('va-folder').value.trim();
    if (folder.length > vaLimits.folderMax) return { error: `Use a path of up to ${vaLimits.folderMax} characters.`, target: 'folder' };
    if (/^(\\\\|\/\/)/.test(folder)) return { error: VA_NETWORK_FOLDER, target: 'folder' };
    if (folder && !/^([A-Za-z]:[\\/]|\/)/.test(folder)) return { error: 'Enter a full path such as D:\\KioskArchives, or leave the box empty for the default folder.', target: 'folder' };
    return {
        settings: {
            feedback: { enabled: feedbackOn, keep: periods['feedback-keep'] },
            lostFound: { enabled: lostFoundOn, keep: periods['lostfound-keep'], onlyResolved: document.getElementById('va-lostfound-resolved').checked },
            includePhotos: document.getElementById('va-include-photos').checked,
            deleteAfterArchive: deleteAfter,
            leaves: document.getElementById('va-leaves').value,
            automatic: {
                enabled: autoOn, frequency, dayOfMonth: Number(document.getElementById('va-auto-day').value),
                weekday: Number(document.getElementById('va-auto-weekday').value), everyDays, time, enabledAt: savedAuto.enabledAt ?? null
            },
            folder,
            keepFiles: periods['keep-files']
        }
    };
}

// Enter in the confirm password box also lands here, so the confirm resends with the password
async function vaSaveSettings(event) {
    if (event) event.preventDefault();
    if (!vaData) return;
    if (vaSaveConfirm) {
        const input = document.getElementById('va-confirm-password');
        if (!input.value) {
            vaPasswordError('va-confirm-password', 'Enter your password.');
            return;
        }
        await vaPutSettings(vaSaveConfirm.settings, input.value);
        return;
    }
    if (!vaIsDirty()) return;
    vaClearErrors();
    const result = vaReadForm();
    if (result.error) {
        vaShowError(result.target, result.error);
        return;
    }
    await vaPutSettings(result.settings, '');
}

// a save that would delete archive files answers 409 with the count; the save bar then asks for the password
async function vaPutSettings(settings, password) {
    const buttons = [document.getElementById('va-save-btn'), document.getElementById('va-confirm-btn')];
    for (const button of buttons) button.disabled = true;
    try {
        const data = await vaRequest('/api/admin/visitor-archive/settings', 'PUT', password ? { ...settings, password } : settings);
        const expired = data.expired ? Number(data.expired.count) || 0 : 0;
        if (vaSaveConfirm) vaEndConfirm();
        vaData.settings = data.settings || settings;
        vaFillForm(vaData.settings);
        const text = expired ? `Archive settings saved. ${vaPlural(expired, 'archive file')} deleted.` : 'Archive settings saved.';
        showNotification(text, 'success');
        vaAnnounce(text);
        vaLoad();
    } catch (error) {
        const target = vaFieldTarget(error.field);
        if (error.status === 409 && error.body && error.body.expiring) {
            vaStartConfirm(settings, error.body.expiring);
        } else if (vaSaveConfirm && (error.status === 403 || error.status === 429 || error.field === 'password')) {
            vaPasswordError('va-confirm-password', error.message);
        } else if (error.status === 400 && target) {
            if (vaSaveConfirm) vaEndConfirm();
            vaShowError(target, vaSentence(error.message));
        } else {
            showNotification(`Could not save the settings: ${error.message}`, 'error');
        }
    } finally {
        for (const button of buttons) button.disabled = false;
    }
}

function vaAddMonths(ms, months) {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + months;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

// the server's rule: a file expires once its finish time plus the keep time has passed
function vaFileExpired(keep, finishedAt, now) {
    const amount = Number(keep && keep.amount);
    const done = vaTime(finishedAt);
    if (!(amount > 0) || !Number.isFinite(done)) return false;
    return vaAddMonths(done, amount * (keep.unit === 'years' ? 12 : 1)) < now;
}

// archive files the chosen Keep archive files would delete that the saved choice keeps
function vaExpiringFiles(keep) {
    const saved = vaData && vaData.settings ? vaData.settings.keepFiles : null;
    const files = vaData && Array.isArray(vaData.presentFiles) ? vaData.presentFiles : [];
    const now = Date.now();
    return files.filter((f) => vaFileExpired(keep, f.finishedAt, now) && !vaFileExpired(saved, f.finishedAt, now));
}

function vaRenderExpiring() {
    const line = document.getElementById('va-keep-files-expiring');
    const keep = vaData ? vaReadKeep('keep-files').value : null;
    const files = keep && keep.amount > 0 ? vaExpiringFiles(keep) : [];
    const bytes = files.reduce((sum, f) => sum + Number(f.size || 0), 0);
    const one = files.length === 1;
    const text = files.length
        ? `${vaPlural(files.length, 'archive file')} ${one ? 'is' : 'are'} older than ${vaPeriodText(keep)} (${vaBytes(bytes)}). Saving deletes ${one ? 'it' : 'them'} for good.`
        : '';
    if (line.textContent !== text) line.textContent = text;
}

// "Their records are no longer in the database" is only said for files whose run deleted the records
function vaExpiringRecordsText(keep) {
    const files = vaExpiringFiles(keep);
    const kept = files.filter((f) => f.recordsDeleted === false).length;
    if (!files.length || kept === files.length) return '';
    return kept ? ' Some of their records are no longer in the database.' : ' Their records are no longer in the database.';
}

function vaStartConfirm(settings, expiring) {
    const count = Number(expiring.count) || 0;
    vaSaveConfirm = { settings };
    vaSetText('va-confirm-text', `Saving deletes ${vaPlural(count, 'archive file')} (${vaBytes(Number(expiring.bytes) || 0)}) for good.${vaExpiringRecordsText(settings.keepFiles)}`);
    vaSetText('va-confirm-btn', `Save and delete ${vaPlural(count, 'file')}`);
    document.getElementById('va-savebar-main').hidden = true;
    document.getElementById('va-savebar-confirm').hidden = false;
    const input = document.getElementById('va-confirm-password');
    input.value = '';
    vaPasswordReset('va-confirm-password');
    input.focus();
}

function vaEndConfirm() {
    const hadFocus = document.getElementById('va-savebar-confirm').contains(document.activeElement);
    vaSaveConfirm = null;
    document.getElementById('va-confirm-password').value = '';
    document.getElementById('va-savebar-confirm').hidden = true;
    document.getElementById('va-savebar-main').hidden = false;
    if (hadFocus && !document.getElementById('va-savebar').hidden) document.getElementById('va-save-btn').focus();
}

function vaCancelConfirm() {
    vaEndConfirm();
}

function vaDiscardSettings() {
    if (!vaData || !vaData.settings) return;
    vaFillForm(vaData.settings);
    vaRenderFormMeta();
}

function vaScheduleEdited() {
    const saved = (vaData && vaData.settings && vaData.settings.automatic) || {};
    const anyTime = document.getElementById('va-auto-anytime').checked;
    const now = [
        document.getElementById('va-auto-enabled').checked, document.getElementById('va-auto-frequency').value, document.getElementById('va-auto-weekday').value,
        document.getElementById('va-auto-day').value, document.getElementById('va-auto-every').value, anyTime ? '' : document.getElementById('va-auto-time').value
    ];
    const was = [!!saved.enabled, saved.frequency, String(saved.weekday), String(saved.dayOfMonth), String(saved.everyDays), saved.time || ''];
    return now.join('|') !== was.join('|');
}

function vaRenderNextRun() {
    if (!vaData) return;
    const auto = vaData.automatic || {};
    let next = 'Switched off';
    if (vaScheduleEdited()) next = document.getElementById('va-auto-enabled').checked ? 'Worked out when you save' : 'Switched off when you save';
    else if (auto.enabled) next = auto.nextDueAt ? vaDateTime(auto.nextDueAt) : 'Not planned yet';
    vaSetText('va-next-run', next);
    const result = auto.lastResult;
    let last = 'None yet';
    if (result && result.at) {
        const words = { 'nothing-due': 'nothing was due', done: 'archived', saved: 'saved, records kept', failed: 'failed, it tries again later', interrupted: 'interrupted' };
        last = `${vaDateTime(result.at)}, ${words[result.status] || result.status}`;
    } else if (auto.lastAt) {
        last = vaDateTime(auto.lastAt);
    }
    vaSetText('va-last-auto', last);
}

function vaRenderFormMeta() {
    const encryption = vaData.encryption || {};
    const key = document.getElementById('va-key-text');
    key.innerHTML = encryption.keyFingerprint ? `Key fingerprint <code class="va-code">${escapeHtmlSafe(encryption.keyFingerprint)}</code>` : '';
    document.getElementById('va-devkey-note').hidden = !encryption.developmentKey;
    document.getElementById('va-folder').placeholder = (vaData.defaults && vaData.defaults.folder) || 'Default folder';
    const typed = document.getElementById('va-folder').value.trim();
    if (typed === ((vaData.settings && vaData.settings.folder) || '') && !(vaFolderCheck && vaFolderCheck.typed === typed)) vaRenderFolderStatus(vaData.folder);
    const everyHint = document.getElementById('va-auto-every-hint');
    if (!everyHint.classList.contains('is-error')) everyHint.textContent = `From ${vaLimits.everyDays[0]} to ${vaLimits.everyDays[1]} days.`;
    vaRenderNextRun();
    vaRenderExpiring();
}

// ---- archive folder ----

function vaRenderFolderStatus(folder) {
    const pill = document.getElementById('va-folder-status-pill');
    const text = document.getElementById('va-folder-status-text');
    const free = folder && folder.freeBytes !== null && folder.freeBytes !== undefined ? vaBytes(folder.freeBytes) : '';
    let state = ['muted', 'Not checked', 'Press Check folder to test this folder.'];
    if (folder && folder.checking) state = ['muted', 'Checking', 'Testing the folder.'];
    else if (folder && folder.problem) state = ['down', 'Problem', vaSentence(folder.problem)];
    else if (folder && folder.exists && folder.writable) state = ['ok', 'Ready', `${folder.isDefault ? 'Default folder. ' : ''}Writable${free ? `, ${free} free of ${vaBytes(folder.totalBytes)}` : ''}.`];
    else if (folder && !folder.exists && folder.willCreate) state = ['info', 'Will be created', `The folder is created on the first archive.${free ? ` ${free} free.` : ''}`];
    else if (folder) state = ['down', 'Not writable', 'This PC cannot write to the folder. Choose another one.'];
    // the box is a live region: rewriting the same words on every refresh would read them out again
    const key = state.join('|');
    if (key === vaFolderStatusKey) return;
    vaFolderStatusKey = key;
    pill.innerHTML = uiPill(state[0], state[1]);
    text.textContent = state[2];
}

function vaFolderEdited() {
    const input = document.getElementById('va-folder');
    const typed = input.value.trim();
    input.removeAttribute('aria-invalid');
    if (vaFolderCheck && vaFolderCheck.typed === typed) vaRenderFolderStatus(vaFolderCheck.folder);
    else if (vaData && typed === ((vaData.settings && vaData.settings.folder) || '')) vaRenderFolderStatus(vaData.folder);
    else vaRenderFolderStatus(null);
}

async function vaCheckFolder() {
    const input = document.getElementById('va-folder');
    const button = document.getElementById('va-folder-check');
    const typed = input.value.trim();
    input.removeAttribute('aria-invalid');
    button.disabled = true;
    vaRenderFolderStatus({ checking: true });
    try {
        const data = await vaRequest('/api/admin/visitor-archive/folder-check', 'POST', { folder: typed });
        vaFolderCheck = { typed, folder: data.folder };
        if (input.value.trim() === typed) vaRenderFolderStatus(data.folder);
    } catch (error) {
        vaRenderFolderStatus({ problem: `Could not check the folder: ${error.message}` });
    } finally {
        button.disabled = false;
    }
}

function vaUseDefaultFolder() {
    const input = document.getElementById('va-folder');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vaCheckFolder();
}

// ---- history ----

function vaRunRow(run) {
    const c = run.counts || {};
    const file = run.file || {};
    const [tone, word] = VA_STATUS[run.status] || ['muted', run.status || 'Unknown'];
    const busy = !VA_END_STATES.includes(run.status);
    const present = !busy && file.state === 'present' && file.exists !== false;
    let fileNote = '';
    if (file.state === 'deleted') fileNote = 'File deleted';
    else if (file.state === 'expired') fileNote = 'Expired';
    else if (file.state === 'present' && file.exists === false) fileNote = 'File missing';
    // a run that left leaves on the digital tree says how many under its records
    const leaves = vaLeavesText(c.leavesKept, c.leavesWithInitials);
    let note = '';
    if (run.error) note = `<div class="va-row-note" title="${escapeHtmlSafe(run.error)}">${escapeHtmlSafe(run.status === 'done' ? `With a warning: ${run.error}` : run.error)}</div>`;
    const when = vaDateTime(run.startedAt);
    const action = (name, icon, label, danger) => `<button type="button" class="ui-btn ui-btn-icon${danger ? ' ui-danger' : ''}" data-va-action="${name}" data-run="${escapeHtmlSafe(run.id)}" aria-label="${escapeHtmlSafe(`${label}, archive of ${when}`)}" title="${label}"${present ? '' : ' disabled'}>${vaIcon(icon)}</button>`;
    return `<tr data-run="${escapeHtmlSafe(run.id)}">`
        + `<td class="ui-time va-nowrap">${escapeHtmlSafe(when)}</td>`
        + `<td>${escapeHtmlSafe(run.trigger === 'automatic' ? 'Automatic' : run.startedBy || '–')}</td>`
        + `<td class="va-nowrap" title="${escapeHtmlSafe(vaCountsText(c))}">${escapeHtmlSafe(vaRecordsText(c))}${leaves ? `<div class="ui-muted va-row-note">${escapeHtmlSafe(leaves)}</div>` : ''}</td>`
        + `<td class="va-num">${file.size ? escapeHtmlSafe(vaBytes(file.size)) : '<span class="ui-muted">–</span>'}</td>`
        + `<td>${uiPill(tone, word)}${fileNote ? `<div class="ui-muted va-row-note">${fileNote}</div>` : ''}${note}</td>`
        + `<td><div class="ui-actions">${action('view', 'eye', 'View records')}${action('download', 'download', 'Download')}${action('verify', 'search', 'Check file')}${action('delete', 'trash', 'Delete file', true)}</div></td>`
        + '</tr>';
}

// failed: 'overview' when the page itself did not load (the banner says why), 'runs' when only the history did not
function vaRenderHistory(failed) {
    const body = document.getElementById('va-history-rows');
    const foot = document.getElementById('va-history-foot');
    const totals = (vaData && vaData.totals) || {};
    const runs = Number(totals.runs || 0);
    const files = Number(totals.files || 0);
    vaSetText('va-history-totals', runs ? `${vaPlural(runs, 'archive')} · ${files ? `${vaPlural(files, 'file')} kept (${vaBytes(totals.bytes)})` : 'no files kept'}` : '');
    if (failed && !vaRuns.length) {
        const text = failed === 'overview' ? 'History not loaded yet.' : 'The history could not be loaded. The page tries again every 30 seconds.';
        body.innerHTML = `<tr><td colspan="6" class="ui-empty">${escapeHtmlSafe(text)}</td></tr>`;
        vaHistoryMarkup = [];
        foot.hidden = true;
        vaUpdateTableFade();
        return;
    }
    if (!vaRuns.length) {
        body.innerHTML = '<tr><td colspan="6" class="ui-empty"><span class="va-empty-title">No archives yet.</span><span class="va-empty-line">Use Archive now, or switch on automatic archiving, to make the first one.</span></td></tr>';
        vaHistoryMarkup = [];
        foot.hidden = true;
        vaUpdateTableFade();
        return;
    }
    const shown = vaHistoryFolded ? vaRuns.slice(0, VA_HISTORY_FOLD) : vaRuns;
    const markup = shown.map(vaRunRow);
    const sameRows = vaHistoryMarkup.length === markup.length && [...body.rows].every((row, i) => row.dataset.run === String(shown[i].id));
    if (sameRows) markup.forEach((html, i) => { if (vaHistoryMarkup[i] !== html) body.rows[i].outerHTML = html; });
    else body.innerHTML = markup.join('');
    vaHistoryMarkup = markup;
    // Show all opens the rest of the loaded rows, Show more fetches 100 more (up to the server's limit of 1,000), Show
    // fewer folds the list back to the 5 newest
    const folded = vaHistoryFolded && vaRuns.length > VA_HISTORY_FOLD;
    const more = !folded && runs > vaRuns.length && vaHistoryLimit < VA_HISTORY_MAX;
    const fewer = !folded && !more && vaRuns.length > VA_HISTORY_FOLD;
    foot.hidden = !(folded || more || fewer || runs > vaRuns.length);
    if (!foot.hidden) {
        vaSetText('va-history-more-text', folded ? `Showing the ${VA_HISTORY_FOLD} newest of ${vaNum(runs)} archives.`
            : runs > vaRuns.length ? `Showing the latest ${vaNum(vaRuns.length)} of ${vaNum(runs)} archives.` : `Showing all ${vaNum(runs)} archives.`);
        const button = document.getElementById('va-history-more');
        button.hidden = !(folded || more || fewer);
        button.textContent = folded ? `Show all ${vaNum(runs)} archives` : more ? 'Show more' : 'Show fewer';
    }
    vaUpdateTableFade();
}

function vaHistoryMoreClick() {
    if (vaHistoryFolded) {
        vaHistoryFolded = false;
        vaRenderHistory();
        return;
    }
    const runs = Number((vaData && vaData.totals && vaData.totals.runs) || 0);
    if (runs > vaRuns.length && vaHistoryLimit < VA_HISTORY_MAX) {
        vaShowMoreHistory();
        return;
    }
    vaHistoryFolded = true;
    vaRenderHistory();
    const title = document.getElementById('va-history-title');
    if (title) title.focus();
}

function vaShowMoreHistory() {
    vaHistoryLimit = Math.min(VA_HISTORY_MAX, vaHistoryLimit + VA_HISTORY_STEP);
    vaLoad();
}

// on a phone the table scrolls sideways; a fade on the right edge shows there is more
function vaUpdateTableFade() {
    const wrap = document.getElementById('va-history-wrap');
    wrap.classList.toggle('has-more', wrap.scrollWidth - wrap.clientWidth - wrap.scrollLeft > 2);
}

function vaReplaceRun(run) {
    if (!run) return;
    const i = vaRuns.findIndex((r) => r.id === run.id);
    if (i >= 0) vaRuns[i] = run;
    if (vaView.runId === run.id) vaView.run = run;
    vaRenderHistory();
}

// redraws one row (its buttons may have been disabled while busy) and gives the focus back to the same button
function vaRefreshRow(runId, action) {
    const focused = document.activeElement;
    const hadFocus = !focused || focused === document.body || (focused.dataset && focused.dataset.run === String(runId));
    const i = vaRuns.findIndex((r) => r.id === runId);
    if (i >= 0) vaHistoryMarkup[i] = '';
    vaRenderHistory();
    const button = document.querySelector(`#va-history-rows tr[data-run="${runId}"] [data-va-action="${action}"]`);
    if (hadFocus && button && !button.disabled) button.focus();
}

function vaHistoryClick(event) {
    const button = event.target.closest('[data-va-action]');
    if (!button || button.disabled) return;
    const runId = Number(button.dataset.run);
    const action = button.dataset.vaAction;
    if (action === 'view') vaOpenView(runId);
    else if (action === 'download') vaDownload(runId);
    else if (action === 'verify') vaVerify(runId, button);
    else if (action === 'delete') vaOpenDelete(runId);
}

async function vaVerify(runId, button) {
    button.disabled = true;
    button.classList.add('is-busy');
    button.setAttribute('aria-busy', 'true');
    try {
        const data = await vaRequest(`/api/admin/visitor-archive/runs/${runId}/verify`, 'POST', {});
        if (data.run) vaReplaceRun(data.run);
        const problems = Array.isArray(data.problems) ? data.problems : [];
        const first = problems.length ? (typeof problems[0] === 'string' ? problems[0] : problems[0].message || problems[0].problem || 'unknown problem') : '';
        // a damaged file may still hold records that exist nowhere else, so it must not be thrown away
        const missing = !!(data.run && data.run.file && data.run.file.exists === false);
        const text = data.ok
            ? `The file is complete and unchanged (${vaPlural(data.checkedEntries, 'item')} checked).`
            : `The file has a problem: ${vaSentence(first || 'it could not be checked')}${problems.length > 1 ? ` ${vaPlural(problems.length - 1, 'more problem')} found.` : ''}${missing ? '' : ' Keep this file and download a copy. Do not delete it.'}`;
        showNotification(text, data.ok ? 'success' : 'error');
        vaAnnounce(text);
    } catch (error) {
        showNotification(`Could not check the file: ${error.message}`, 'error');
    } finally {
        vaRefreshRow(runId, 'verify');
    }
}

function vaDownload(runId) {
    if (vaUnlockedUntil - Date.now() > 5000) vaStartDownload(runId);
    else vaAskUnlock('download', runId);
}

// a download link keeps this page open even if the server answers with an error instead of the file
function vaStartDownload(runId) {
    const link = document.createElement('a');
    link.href = `/api/admin/visitor-archive/runs/${runId}/download`;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    link.remove();
    showNotification('The download has started', 'info');
}

function vaCheckWatched() {
    if (!vaWatchRunId || (vaData.running && vaData.running.runId === vaWatchRunId)) return;
    const run = vaRuns.find((r) => r.id === vaWatchRunId);
    if (!run || !VA_END_STATES.includes(run.status)) return;
    vaWatchRunId = null;
    if (document.getElementById('va-archive-dialog').open && vaLiveRunId === run.id) return;
    const [kind, text] = { done: ['success', 'Archive complete'], saved: ['info', 'Archive saved, the records were kept'], failed: ['error', 'Archive failed'], interrupted: ['warning', 'Archive interrupted'] }[run.status];
    const message = run.error && run.status !== 'done' ? `${text}: ${run.error}` : text;
    showNotification(message, kind);
    vaAnnounce(vaSentence(message));
}

// ---- dialogs ----

function vaBindDialog(dialog) {
    if (dialog.dataset.bound) return;
    dialog.dataset.bound = '1';
    // Escape closes with the same short fade as the buttons
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        vaCloseDialog(dialog.id);
    });
    dialog.addEventListener('close', () => {
        dialog.classList.remove('is-closing');
        vaDialogClosed(dialog.id);
        const opener = vaDialogOpeners[dialog.id];
        delete vaDialogOpeners[dialog.id];
        // an opener that is gone, disabled or hidden by now cannot take the focus back
        const usable = opener && document.contains(opener) && !opener.disabled && opener.getClientRects().length > 0;
        if (usable) opener.focus();
        else if (opener) document.getElementById('va-history-title').focus();
        const after = vaAfterClose[dialog.id];
        delete vaAfterClose[dialog.id];
        if (after) after();
    });
}

function vaOpenDialog(id, focusId) {
    const dialog = document.getElementById(id);
    vaBindDialog(dialog);
    // a modal dialog on a page that is not shown would block every click on the page the admin moved to
    if (!document.getElementById('visitor-archive-page').classList.contains('active')) return dialog;
    if (dialog.open) {
        dialog.classList.remove('is-closing');
    } else {
        vaDialogOpeners[id] = document.activeElement;
        dialog.showModal();
    }
    const target = focusId && document.getElementById(focusId);
    if (target) target.focus();
    return dialog;
}

// after: runs once the dialog is fully closed (and the focus is back on its opener)
function vaCloseDialog(id, after) {
    const dialog = document.getElementById(id);
    if (!dialog || !dialog.open) return;
    if (after) vaAfterClose[id] = after;
    if (VA_REDUCE_MOTION) {
        dialog.close();
        return;
    }
    if (dialog.classList.contains('is-closing')) return;
    dialog.classList.add('is-closing');
    setTimeout(() => { if (dialog.classList.contains('is-closing')) dialog.close(); }, 150);
}

function vaDialogClosed(id) {
    if (id === 'va-archive-dialog') {
        clearTimeout(vaRunTimer);
        clearTimeout(vaPreviewTimer);
        vaPreviewSeq++;
        document.getElementById('va-run-password').value = '';
    } else if (id === 'va-view-dialog') {
        clearTimeout(vaViewLockTimer);
        vaView.seq++;
        vaView.runId = null;
        vaView.rows = [];
        vaView.decrypted = { feedback: {}, lostFound: {} };
        document.getElementById('va-view-rows').innerHTML = '';
        document.getElementById('va-view-key-alert').textContent = '';
        document.getElementById('va-view-note').textContent = '';
    } else if (id === 'va-unlock-dialog') {
        document.getElementById('va-unlock-password').value = '';
        vaUnlockNext = null;
    } else if (id === 'va-delete-dialog') {
        document.getElementById('va-delete-password').value = '';
        vaDeleteRunId = null;
    }
}

function vaPasswordError(inputId, message) {
    const input = document.getElementById(inputId);
    const hint = document.getElementById(`${inputId}-hint`);
    hint.textContent = vaSentence(message);
    hint.classList.add('is-error');
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    input.select();
}

function vaPasswordReset(inputId) {
    const hint = document.getElementById(`${inputId}-hint`);
    document.getElementById(inputId).removeAttribute('aria-invalid');
    hint.classList.remove('is-error');
    hint.textContent = VA_PASSWORD_HINTS[inputId];
}

// ---- Archive dialog ----

function vaOpenArchive() {
    if (!vaData) return;
    if (vaData.running) {
        vaShowLive(vaData.running.runId);
        return;
    }
    const s = vaData.settings || {};
    const due = vaData.due || {};
    const feedback = s.feedback || {};
    const lostFound = s.lostFound || {};
    const today = vaToday();
    document.getElementById('va-run-feedback').checked = !!feedback.enabled || !lostFound.enabled;
    document.getElementById('va-run-lostfound').checked = !!lostFound.enabled;
    // the dates start at the keep-period cut-off; with no cut-off the admin picks one (never "everything up to today")
    for (const [id, key] of [['va-run-feedback-before', 'feedback'], ['va-run-lostfound-before', 'lostFound']]) {
        const input = document.getElementById(id);
        input.max = today;
        input.value = (due[key] && due[key].beforeDay) || '';
    }
    document.getElementById('va-run-resolved').checked = !!lostFound.onlyResolved;
    document.getElementById('va-run-photos').checked = s.includePhotos !== false;
    document.getElementById('va-run-delete').checked = s.deleteAfterArchive !== false;
    document.getElementById('va-run-keep').checked = s.deleteAfterArchive === false;
    document.getElementById('va-run-password').value = '';
    vaPasswordReset('va-run-password');
    document.getElementById('va-run-error').hidden = true;
    const folder = vaData.folder || {};
    vaSetText('va-run-folder', folder.path || '', folder.path || '');
    // the choices stay folded away unless the settings switch every record type off
    document.getElementById('va-run-change').open = !feedback.enabled && !lostFound.enabled;
    const preview = document.getElementById('va-run-preview');
    delete preview.dataset.drawn;
    preview.classList.remove('is-error');
    vaSetText('va-run-preview-text', 'Counting the records');
    document.getElementById('va-run-summary').hidden = true;
    vaPreviewData = null;
    vaResultRun = null;
    vaSetArchiveMode('setup');
    vaRunUpdateForm();
    vaRenderPhotosNote();
    vaOpenDialog('va-archive-dialog', 'va-run-password');
    vaQueuePreview(0);
}

function vaSetArchiveMode(mode) {
    document.getElementById('va-archive-setup').hidden = mode !== 'setup';
    document.getElementById('va-archive-live').hidden = mode === 'setup';
    document.getElementById('va-run-progress').hidden = mode !== 'live';
    document.getElementById('va-run-result').hidden = mode !== 'result';
    document.getElementById('va-run-submit').hidden = mode !== 'setup';
    document.getElementById('va-run-view').hidden = mode !== 'result' || !vaResultRun;
    vaSetText('va-run-cancel', mode === 'setup' ? 'Cancel' : 'Close');
    if (mode === 'setup') vaSetText('va-archive-title', 'Archive visitor records');
    if (mode === 'live') {
        vaSetText('va-archive-title', 'Archiving');
        vaSetText('va-archive-sub', 'The archive runs on the server. A large archive with many photos can take a few minutes.');
    }
}

function vaRunCriteria() {
    const feedback = document.getElementById('va-run-feedback').checked;
    const lostFound = document.getElementById('va-run-lostfound').checked;
    return {
        types: [feedback && 'feedback', lostFound && 'lostFound'].filter(Boolean),
        feedbackBefore: feedback ? document.getElementById('va-run-feedback-before').value : null,
        lostFoundBefore: lostFound ? document.getElementById('va-run-lostfound-before').value : null,
        onlyResolved: lostFound && document.getElementById('va-run-resolved').checked,
        includePhotos: document.getElementById('va-run-photos').checked
    };
}

function vaCriteriaProblem(criteria) {
    if (!criteria.types.length) return 'Choose at least one record type.';
    const today = vaToday();
    for (const day of [criteria.feedbackBefore, criteria.lostFoundBefore]) {
        if (day === null) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'Choose a "Submitted before" date for each record type.';
        if (day > today) return 'Choose a date up to today.';
    }
    return '';
}

function vaRunUpdateForm() {
    const feedback = document.getElementById('va-run-feedback').checked;
    const lostFound = document.getElementById('va-run-lostfound').checked;
    const deleting = document.getElementById('va-run-delete').checked;
    document.getElementById('va-run-feedback-before').disabled = !feedback;
    document.getElementById('va-run-lostfound-before').disabled = !lostFound;
    document.getElementById('va-run-resolved').disabled = !lostFound;
    vaSetText('va-archive-sub', deleting
        ? 'The records below are saved to a zip file and checked, then deleted from the database. This cannot be undone.'
        : 'The records below are saved to a zip file and checked. They stay in the database.');
    vaSetText('va-run-safety', deleting
        ? 'Nothing is deleted unless the zip file passes its check. Deleted records can be opened later from History, but not restored.'
        : 'Nothing is deleted unless the zip file passes its check.');
    vaRenderDateHints();
    vaRunUpdateSubmit();
}

// under each date: the date in words when it is not the keep-period cut-off, and a warning when it is later
function vaRenderDateHints() {
    const due = (vaData && vaData.due) || {};
    const s = (vaData && vaData.settings) || {};
    for (const [key, id] of [['feedback', 'feedback'], ['lostFound', 'lostfound']]) {
        const input = document.getElementById(`va-run-${id}-before`);
        const cutoff = due[key] && due[key].beforeDay;
        const keep = s[key] && s[key].keep;
        let html = '';
        if (!input.disabled && /^\d{4}-\d{2}-\d{2}$/.test(input.value)) {
            html = escapeHtmlSafe(input.value === cutoff ? `Older than ${vaPeriodText(keep)} (the keep period)` : `Before ${vaDayText(input.value)}`);
            if (cutoff && input.value > cutoff) html += ` <span class="va-warn-text">This includes records newer than the ${escapeHtmlSafe(vaPeriodWord(keep))} keep period.</span>`;
        }
        document.getElementById(`va-run-${id}-hint`).innerHTML = html;
    }
}

// records = submissions + lost & found reports; visitors with no feedback left can also be archived on their own
function vaPreviewNumbers() {
    if (!vaPreviewData) return null;
    const c = vaPreviewData.counts || {};
    const types = vaPreviewData.criteria.types;
    const records = (types.includes('feedback') ? Number(c.feedback || 0) : 0) + (types.includes('lostFound') ? Number(c.lostFound || 0) : 0);
    const visitors = types.includes('feedback') ? Number(c.visitors || 0) : 0;
    const free = Number(vaPreviewData.freeBytes);
    const tooBig = vaPreviewData.freeBytes !== null && vaPreviewData.freeBytes !== undefined && Number.isFinite(free) && Number(vaPreviewData.estimatedBytes || 0) * 1.1 + 50 * 1024 * 1024 > free;
    return { records, visitors, any: records > 0 || visitors > 0, tooBig };
}

function vaRunUpdateSubmit() {
    const button = document.getElementById('va-run-submit');
    const deleting = document.getElementById('va-run-delete').checked;
    const numbers = vaPreviewNumbers();
    let label = deleting ? 'Archive and delete' : 'Archive';
    if (numbers && numbers.records) label = `${label} ${vaPlural(numbers.records, 'record')}`;
    else if (numbers && numbers.visitors) label = `${label} ${vaPlural(numbers.visitors, 'visitor')}`;
    vaSetText('va-run-submit', label);
    button.className = `ui-btn ${deleting ? 'ui-btn-danger' : 'ui-btn-primary'}`;
    button.disabled = !numbers || !numbers.any || numbers.tooBig || vaRunStarting;
}

function vaArchiveFormChanged(event) {
    const id = event.target.id;
    if (id === 'va-run-password') return;
    vaRunUpdateForm();
    if (id === 'va-run-delete' || id === 'va-run-keep') {
        if (vaPreviewData) vaRenderPreview();
        return;
    }
    vaQueuePreview();
}

function vaQueuePreview(delay = 350) {
    clearTimeout(vaPreviewTimer);
    vaPreviewSeq++;
    vaPreviewData = null;
    vaRunUpdateSubmit();
    document.getElementById('va-run-preview').classList.add('is-loading');
    vaPreviewTimer = setTimeout(vaRunPreview, delay);
}

function vaPreviewMessage(text, isError) {
    const box = document.getElementById('va-run-preview');
    box.classList.remove('is-loading');
    box.classList.toggle('is-error', !!isError);
    vaSetText('va-run-preview-text', text);
    document.getElementById('va-run-summary').hidden = true;
    vaRenderPhotosNote();
}

async function vaRunPreview() {
    const criteria = vaRunCriteria();
    const problem = vaCriteriaProblem(criteria);
    if (problem) {
        vaPreviewMessage(problem);
        // the message points at the record types and dates, so they are shown
        document.getElementById('va-run-change').open = true;
        return;
    }
    const seq = ++vaPreviewSeq;
    const box = document.getElementById('va-run-preview');
    box.classList.add('is-loading');
    if (!box.dataset.drawn) vaSetText('va-run-preview-text', 'Counting the records');
    try {
        const data = await vaRequest('/api/admin/visitor-archive/preview', 'POST', criteria);
        if (seq !== vaPreviewSeq) return;
        vaPreviewData = { ...data, criteria };
        vaRenderPreview();
    } catch (error) {
        if (seq !== vaPreviewSeq) return;
        vaPreviewMessage(`Could not count the records: ${vaSentence(error.message)}`, true);
    } finally {
        if (seq === vaPreviewSeq) vaRunUpdateSubmit();
    }
}

// a bold lead sentence, then one short row per record type, the photos and the file
function vaRenderPreview() {
    const box = document.getElementById('va-run-preview');
    const d = vaPreviewData;
    const c = d.counts || {};
    const types = d.criteria.types;
    const deleting = document.getElementById('va-run-delete').checked;
    const numbers = vaPreviewNumbers();
    box.classList.remove('is-loading', 'is-error');
    box.dataset.drawn = '1';
    vaRenderPhotosNote();
    if (!numbers.any) {
        vaSetText('va-run-preview-text', 'Nothing to archive: no record was submitted before these dates.');
        document.getElementById('va-run-summary').hidden = true;
        return;
    }
    const count = numbers.records || numbers.visitors;
    const what = numbers.records ? vaPlural(numbers.records, 'record') : `${vaPlural(numbers.visitors, 'visitor')} with no feedback left`;
    vaSetText('va-run-preview-text', deleting
        ? `${what} will be saved to a zip file, checked, then deleted from the database.`
        : `${what} will be saved to a zip file and checked. ${count === 1 ? 'It stays' : 'They stay'} in the database.`);

    const s = vaData.settings || {};
    const due = vaData.due || {};
    const fbDay = d.criteria.feedbackBefore;
    const lfDay = d.criteria.lostFoundBefore;
    // "older than 12 months" only when the date is the keep-period cut-off
    const age = (key, day) => (due[key] && due[key].beforeDay === day ? `older than ${vaPeriodText(s[key] && s[key].keep)}` : '');
    let feedback = `No submissions before ${vaDayText(fbDay)}`;
    if (Number(c.feedback)) {
        const older = age('feedback', fbDay);
        feedback = `${vaPlural(c.feedback, 'submission')} before ${vaDayText(fbDay)}${older ? ` (${older})` : ''} from ${vaPlural(c.visitors, 'visitor')}`;
        if (deleting && Number(c.visitorsKept)) feedback += `; ${vaNum(c.visitorsKept)} ${Number(c.visitorsKept) === 1 ? 'stays' : 'stay'} because they have newer feedback`;
    } else if (Number(c.visitors)) {
        feedback = `${vaPlural(c.visitors, 'visitor')} with no feedback left, last visit before ${vaDayText(fbDay)}`;
    }
    const lfNotes = [age('lostFound', lfDay), d.criteria.onlyResolved ? 'only resolved' : ''].filter(Boolean).join(', ');
    vaSetText('va-sum-feedback', feedback);
    vaSetText('va-sum-lostfound', `${Number(c.lostFound) ? vaPlural(c.lostFound, 'report') : 'No reports'} before ${vaDayText(lfDay)}${lfNotes ? ` (${lfNotes})` : ''}`);
    document.getElementById('va-sum-feedback-row').hidden = !types.includes('feedback');
    document.getElementById('va-sum-lostfound-row').hidden = !types.includes('lostFound');
    const photos = vaPhotoParts(c, d, deleting);
    document.getElementById('va-sum-photos').innerHTML = photos.join(', ');
    document.getElementById('va-sum-photos-row').hidden = !photos.length;
    const leaves = types.includes('feedback') ? [vaLeavesPlan(c, s.leaves, deleting), vaVipText(c.vipLeaves)].filter(Boolean).join('. ') : '';
    vaSetText('va-sum-leaves', leaves);
    document.getElementById('va-sum-leaves-row').hidden = !leaves;
    document.getElementById('va-sum-file').innerHTML = escapeHtmlSafe(`About ${vaBytes(d.estimatedBytes)}, ${vaBytes(d.freeBytes)} free`)
        + (numbers.tooBig ? ' <span class="va-warn-text">Not enough free space in the archive folder.</span>' : '');
    document.getElementById('va-run-summary').hidden = false;
}

// photos as HTML parts: what goes into the zip, what is deleted or left out, and what is already missing
function vaPhotoParts(c, d, deleting) {
    const onDisk = Number(c.photos || 0);
    const kept = c.photosArchived === undefined ? (d.criteria.includePhotos ? onDisk : 0) : Number(c.photosArchived || 0);
    const missing = Number(c.missingPhotos || 0);
    const parts = [];
    if (d.criteria.includePhotos) {
        // the size is the photos on disk, so it is only shown when every one of them goes into the zip
        if (kept) parts.push(escapeHtmlSafe(`${vaNum(kept)} kept in the zip${kept === onDisk ? ` (${vaBytes(d.photoBytes)})` : ''}`));
        if (onDisk > kept) parts.push(escapeHtmlSafe(`${vaNum(onDisk - kept)} ${deleting ? 'deleted without a copy' : 'left out of the zip'} (temporary consent)`));
    } else if (onDisk) {
        parts.push(deleting ? `<span class="va-warn-text">${vaNum(onDisk)} deleted, not kept</span>` : escapeHtmlSafe(`${vaNum(onDisk)} left out of the zip, they stay on the server`));
    }
    if (missing) parts.push(escapeHtmlSafe(`${vaNum(missing)} already missing`));
    return parts;
}

// with photos switched off, a run that deletes the records also deletes their photo files without a copy
function vaRenderPhotosNote() {
    const note = document.getElementById('va-run-photos-note');
    const d = vaPreviewData;
    const onDisk = d ? Number((d.counts || {}).photos || 0) : 0;
    const show = !!d && !d.criteria.includePhotos && onDisk > 0 && document.getElementById('va-run-delete').checked;
    note.hidden = !show;
    if (show) note.textContent = `Photos are switched off: ${vaPlural(onDisk, 'photo file')} ${onDisk === 1 ? 'is' : 'are'} deleted and not kept.`;
}

async function vaStartRun(event) {
    event.preventDefault();
    if (document.getElementById('va-archive-setup').hidden || vaRunStarting) return;
    const password = document.getElementById('va-run-password');
    const errorBox = document.getElementById('va-run-error');
    vaPasswordReset('va-run-password');
    errorBox.hidden = true;
    const numbers = vaPreviewNumbers();
    if (!numbers || !numbers.any || numbers.tooBig) return;
    if (!password.value) {
        vaPasswordError('va-run-password', 'Enter your password.');
        return;
    }
    const body = { password: password.value, ...vaPreviewData.criteria, deleteAfter: document.getElementById('va-run-delete').checked };
    vaRunStarting = true;
    vaRunUpdateSubmit();
    try {
        const data = await vaRequest('/api/admin/visitor-archive/runs', 'POST', body);
        password.value = '';
        vaWatchRunId = data.runId;
        // closed with Cancel or Escape, or another page opened, while the request was on its way: the strip and a toast take over
        // (with the dialog open, its stage announcement speaks instead)
        if (!vaArchiveDialogShown()) {
            vaAnnounce('The archive has started.');
            showNotification('The archive has started.', 'info');
            vaLoad();
            return;
        }
        vaShowLive(data.runId);
        vaLoad();
    } catch (error) {
        if (!vaArchiveDialogShown()) {
            showNotification(error.status === 409 ? 'An archive is already running.' : `The archive did not start: ${vaSentence(error.message)}`, error.status === 409 ? 'info' : 'error');
            if (error.status === 409) vaLoad();
        } else if (error.status === 403 || error.status === 429 || error.field === 'password') {
            vaPasswordError('va-run-password', error.message);
        } else if (error.status === 409) {
            errorBox.textContent = 'An archive is already running. Showing its progress.';
            errorBox.hidden = false;
            await vaLoad();
            if (vaData && vaData.running && vaArchiveDialogShown()) vaShowLive(vaData.running.runId);
        } else {
            errorBox.textContent = vaSentence(error.message);
            errorBox.hidden = false;
        }
    } finally {
        vaRunStarting = false;
        vaRunUpdateSubmit();
    }
}

function vaArchiveDialogShown() {
    const dialog = document.getElementById('va-archive-dialog');
    return dialog.open && !dialog.classList.contains('is-closing') && document.getElementById('visitor-archive-page').classList.contains('active');
}

function vaShowLive(runId) {
    vaLiveRunId = runId;
    vaStagesMarkup = '';
    vaSetArchiveMode('live');
    const run = vaRuns.find((r) => r.id === runId);
    const running = vaData && vaData.running && vaData.running.runId === runId ? vaData.running : null;
    vaRenderLive(run || null, running);
    vaOpenDialog('va-archive-dialog', 'va-run-cancel');
    vaPollRun();
}

// GET /runs/:id once a second while the dialog shows a live run
async function vaPollRun() {
    clearTimeout(vaRunTimer);
    const dialog = document.getElementById('va-archive-dialog');
    const runId = vaLiveRunId;
    if (!runId || !dialog.open || !sessionStorage.getItem('loggedUser')) return;
    try {
        const data = await vaRequest(`/api/admin/visitor-archive/runs/${runId}`);
        if (runId !== vaLiveRunId || !dialog.open) return;
        if (data.run && VA_END_STATES.includes(data.run.status)) {
            vaReplaceRun(data.run);
            vaShowResult(data.run);
            vaLoad();
            return;
        }
        vaRenderLive(data.run, data.progress);
    } catch (error) {
        if (runId !== vaLiveRunId || !dialog.open) return;
        vaSetText('va-run-detail', `Lost contact with the server (${error.message}). Trying again.`);
    }
    if (dialog.open && runId === vaLiveRunId) vaRunTimer = setTimeout(vaPollRun, 1000);
}

function vaRenderLive(run, progress) {
    const stage = (progress && progress.stage) || (run && run.stage) || 'collecting';
    const deleting = !run || run.deleteRecords !== false;
    const index = stage === 'finished' ? VA_STAGES.length : Math.max(0, VA_STAGES.findIndex(([key]) => key === stage));
    const markup = VA_STAGES.map(([key, label], i) => {
        const skipped = !deleting && (key === 'deleting' || key === 'cleaning');
        const state = skipped ? 'skipped' : i < index ? 'done' : i === index ? 'active' : 'pending';
        return `<li class="va-stage is-${state}"${state === 'active' ? ' aria-current="step"' : ''}>`
            + `<span class="va-stage-mark" aria-hidden="true">${state === 'done' ? VA_TICK : ''}</span>`
            + `<span class="va-stage-label">${label}</span>`
            + (skipped ? '<span class="va-stage-note">Not needed, the records are kept</span>' : '')
            + '</li>';
    }).join('');
    // the list is redrawn only when a stage changes, so the spinner never restarts
    if (markup !== vaStagesMarkup) {
        document.getElementById('va-stages').innerHTML = markup;
        vaStagesMarkup = markup;
        vaAnnounce(vaStageText(stage, null));
    }
    vaSetBar('va-run-bar', vaProgressFraction(stage, progress, deleting));
    vaSetText('va-run-detail', vaStageText(stage, progress));
}

function vaShowResult(run) {
    clearTimeout(vaRunTimer);
    vaLiveRunId = null;
    if (vaWatchRunId === run.id) vaWatchRunId = null;
    const c = run.counts || {};
    const file = run.file || {};
    const total = vaRecordTotal(c);
    const [tone, word] = VA_STATUS[run.status] || ['muted', run.status];
    const titles = { done: 'Archive complete', saved: 'Archive saved', failed: 'Archive failed', interrupted: 'Archive interrupted' };
    let lead = 'The server stopped before the file was checked. Nothing was deleted. You can start the archive again.';
    if (run.status === 'done') lead = `${total.text} ${total.n === 1 ? 'was' : 'were'} saved to the zip file, checked, and deleted from the database.`;
    else if (run.status === 'saved') lead = run.deleteRecords === false ? 'The archive was saved and checked. The records are still in the database, as chosen.' : 'The archive was saved and checked, but the records are still in the database.';
    else if (run.status === 'failed') lead = 'The archive could not be made. Nothing was deleted.';
    const rows = [];
    if (file.name) rows.push(['File', file.name]);
    if (file.folder) rows.push(['Folder', file.folder]);
    if (file.size) rows.push(['Size', vaBytes(file.size)]);
    if (run.status === 'done' || run.status === 'saved') rows.push(['Records', vaCountsText(c)]);
    if (run.status === 'done' && Number(c.leavesKept)) rows.push(['Tree', vaLeavesText(c.leavesKept, c.leavesWithInitials)]);
    const note = run.error ? `<div class="ui-note ${run.status === 'failed' ? 'va-note-error' : 'ui-note-warn'}">${escapeHtmlSafe(vaSentence(run.error))}</div>` : '';
    document.getElementById('va-run-result').innerHTML = `<div class="va-result-head">${uiPill(tone, word)}<span class="va-result-lead">${escapeHtmlSafe(lead)}</span></div>`
        + (rows.length ? `<dl class="ui-kv va-result-kv">${rows.map(([k, v]) => `<dt>${escapeHtmlSafe(k)}</dt><dd>${escapeHtmlSafe(v)}</dd>`).join('')}</dl>` : '')
        + note;
    // a checked file can be opened straight away, to see that the records are safe
    vaResultRun = (run.status === 'done' || run.status === 'saved') && file.state === 'present' && file.exists !== false ? run : null;
    vaSetArchiveMode('result');
    vaSetText('va-archive-title', titles[run.status] || 'Archive finished');
    vaSetText('va-archive-sub', run.finishedAt ? `Finished ${vaDateTime(run.finishedAt)}.` : 'Finished.');
    vaAnnounce(`${titles[run.status] || 'Archive finished'}. ${lead}`);
}

function vaViewResult() {
    const run = vaResultRun;
    if (!run) return;
    vaCloseDialog('va-archive-dialog', () => vaOpenView(run.id));
}

// ---- unlock, View and Delete dialogs ----

function vaAskUnlock(action, runId) {
    const download = action === 'download';
    vaUnlockNext = { action, runId };
    vaSetText('va-unlock-title', download ? 'Download the archive' : 'Open archived records');
    vaSetText('va-unlock-text', download ? 'Enter your password to download this zip file.' : 'Enter your password to see the records in this archive.');
    vaSetText('va-unlock-submit', download ? 'Unlock and download' : 'Unlock');
    document.getElementById('va-unlock-password').value = '';
    vaPasswordReset('va-unlock-password');
    vaOpenDialog('va-unlock-dialog', 'va-unlock-password');
}

async function vaSubmitUnlock(event) {
    event.preventDefault();
    const input = document.getElementById('va-unlock-password');
    if (!input.value) {
        vaPasswordError('va-unlock-password', 'Enter your password.');
        return;
    }
    const button = document.getElementById('va-unlock-submit');
    button.disabled = true;
    try {
        const data = await vaRequest('/api/admin/visitor-archive/unlock', 'POST', { password: input.value });
        vaUnlockedUntil = vaTime(data.unlockedUntil) || Date.now() + 10 * 60000;
        vaUnlockedAt = Date.now();
        input.value = '';
        const next = vaUnlockNext || {};
        vaUnlockNext = null;
        vaCloseDialog('va-unlock-dialog', () => {
            if (next.action === 'download') vaStartDownload(next.runId);
            else if (next.action === 'view') vaShowView(next.runId);
            else if (next.action === 'reload' && vaView.runId === next.runId) {
                document.getElementById('va-view-locked').hidden = true;
                document.getElementById('va-view-search').focus();
                vaArmViewLock();
                vaLoadRecords();
            }
        });
    } catch (error) {
        vaPasswordError('va-unlock-password', error.status === 403 || error.status === 429 || error.field === 'password' ? error.message : `Could not unlock: ${error.message}`);
    } finally {
        button.disabled = false;
    }
}

function vaOpenView(runId) {
    if (vaUnlockedUntil - Date.now() > 5000) vaShowView(runId);
    else vaAskUnlock('view', runId);
}

function vaShowView(runId) {
    // the run that just finished may not be in the history list yet
    const run = vaRuns.find((r) => r.id === runId) || (vaResultRun && vaResultRun.id === runId ? vaResultRun : null);
    Object.assign(vaView, { runId, run, type: 'feedback', q: '', page: 1, total: 0, rows: [], decrypted: { feedback: {}, lostFound: {} }, keyMatches: run ? run.keyMatches : null });
    document.getElementById('va-view-search').value = '';
    document.getElementById('va-view-locked').hidden = true;
    document.getElementById('va-view-note').textContent = '';
    document.getElementById('va-view-key-alert').textContent = '';
    vaRenderViewHeader();
    vaOpenDialog('va-view-dialog', 'va-view-search');
    vaArmViewLock();
    vaLoadRecords();
}

function vaRenderViewHeader() {
    const run = vaView.run || {};
    const file = run.file || {};
    const c = run.counts || {};
    vaSetText('va-view-title', run.startedAt ? `Archive of ${vaDateTime(run.startedAt)}` : 'Archived records');
    vaSetText('va-view-meta', [file.name, vaRecordsText(c), file.size ? vaBytes(file.size) : ''].filter(Boolean).join(' · '));
    // only a different key is worth a pill; the alert row says what it means
    document.getElementById('va-view-key').innerHTML = vaView.keyMatches === false ? uiPill('warn', 'Different encryption key') : '';
    vaRenderKeyAlert();
    for (const [type, id, label, count] of [['feedback', 'va-tab-feedback', 'Feedback', c.feedback], ['lostFound', 'va-tab-lostfound', 'Lost & found', c.lostFound]]) {
        const tab = document.getElementById(id);
        tab.classList.toggle('active', vaView.type === type);
        tab.setAttribute('aria-pressed', String(vaView.type === type));
        tab.innerHTML = `${escapeHtmlSafe(label)}<span class="va-tab-count">${vaNum(count)}</span>`;
    }
}

// a status region that stays in the page while empty, so the sentence is read out when it is filled in
function vaRenderKeyAlert() {
    const alert = document.getElementById('va-view-key-alert');
    if (vaView.keyMatches !== false) {
        alert.textContent = '';
        return;
    }
    if (alert.textContent) return;
    setTimeout(() => { if (vaView.runId && vaView.keyMatches === false) alert.textContent = VA_KEY_ALERT; }, 60);
}

// when the 10-minute unlock ends, the viewer forgets the decrypted values and shows the locked note
function vaArmViewLock() {
    clearTimeout(vaViewLockTimer);
    if (!document.getElementById('va-view-dialog').open || !vaView.runId) return;
    const left = vaUnlockedUntil - Date.now();
    if (left <= 0) vaLockView();
    else vaViewLockTimer = setTimeout(vaLockView, Math.min(left, 2147483000));
}

function vaLockView() {
    clearTimeout(vaViewLockTimer);
    vaUnlockedUntil = 0;
    vaView.decrypted = { feedback: {}, lostFound: {} };
    if (vaView.rows.length) vaRenderRecords();
    document.getElementById('va-view-locked').hidden = false;
}

function vaSetViewType(type) {
    if (!vaView.runId || vaView.type === type) return;
    vaView.type = type;
    vaView.page = 1;
    vaView.rows = [];
    vaRenderViewHeader();
    vaLoadRecords();
}

function vaSearchChanged() {
    clearTimeout(vaSearchTimer);
    vaSearchTimer = setTimeout(() => {
        const q = document.getElementById('va-view-search').value.trim();
        if (!vaView.runId || q === vaView.q) return;
        vaView.q = q;
        vaView.page = 1;
        vaLoadRecords();
    }, 300);
}

function vaViewPage(step) {
    const pages = Math.max(1, Math.ceil(vaView.total / VA_PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, vaView.page + step));
    if (page === vaView.page) return;
    vaView.page = page;
    vaLoadRecords();
}

function vaViewSkeleton(columns) {
    const row = `<tr class="va-skel-row">${columns.map((_, i) => `<td><span class="va-skel" style="width: ${i === 1 ? 80 : 55}%"></span></td>`).join('')}</tr>`;
    return row.repeat(4);
}

async function vaLoadRecords() {
    const seq = ++vaView.seq;
    const { runId, type, q, page } = vaView;
    const columns = VA_VIEW_COLUMNS[type];
    const head = document.getElementById('va-view-head');
    const body = document.getElementById('va-view-rows');
    const headMarkup = `<tr>${columns.map((name) => `<th>${name}</th>`).join('')}</tr>`;
    if (head.innerHTML !== headMarkup) head.innerHTML = headMarkup;
    if (!vaView.rows.length) body.innerHTML = vaViewSkeleton(columns);
    else body.classList.add('is-loading');
    try {
        const data = await vaRequest(`/api/admin/visitor-archive/runs/${runId}/records?type=${type}&q=${encodeURIComponent(q)}&page=${page}&size=${VA_PAGE_SIZE}`);
        if (seq !== vaView.seq) return;
        vaView.total = Number(data.total || 0);
        vaView.rows = Array.isArray(data.rows) ? data.rows : [];
        vaView.page = Number(data.page) || page;
        if (data.keyMatches !== undefined) vaView.keyMatches = data.keyMatches;
        vaRenderViewHeader();
        vaRenderRecords();
        document.getElementById('va-view-scroll').scrollTop = 0;
    } catch (error) {
        if (seq !== vaView.seq) return;
        vaView.rows = [];
        vaView.total = 0;
        if (error.status === 403) {
            vaLockView();
            body.innerHTML = `<tr><td colspan="${columns.length}" class="ui-empty">The records are locked again.</td></tr>`;
        } else {
            body.innerHTML = `<tr><td colspan="${columns.length}" class="ui-empty">Could not open the archive: ${escapeHtmlSafe(error.message)}</td></tr>`;
        }
        vaRenderPager();
        vaRenderDecryptButton();
    } finally {
        if (seq === vaView.seq) body.classList.remove('is-loading');
    }
}

function vaThumbs(entries) {
    const shown = entries.filter(([, entry]) => entry);
    if (!shown.length) return '<span class="ui-muted">None</span>';
    return `<div class="va-thumbs">${shown.map(([label, entry]) => {
        const url = escapeHtmlSafe(`/api/admin/visitor-archive/runs/${vaView.runId}/photo?entry=${encodeURIComponent(entry)}`);
        return `<a class="va-thumb" href="${url}" target="_blank" rel="noopener" title="Open the ${label} photo"><img src="${url}" alt="${label} photo" loading="lazy" width="44" height="44"></a>`;
    }).join('')}</div>`;
}

// the decrypted value once Show emails ran, otherwise a quiet "Encrypted" tag
function vaSecretCell(type, row, has, key) {
    const secret = vaView.decrypted[type][row.id];
    if (secret) return secret[key] ? `<span class="va-secret">${escapeHtmlSafe(secret[key])}</span>` : '<span class="ui-muted">Not readable</span>';
    return has ? '<span class="va-encrypted">Encrypted</span>' : `<span class="ui-muted">${key === 'email' ? 'No email' : 'None'}</span>`;
}

function vaFeedbackRow(row) {
    const topics = Array.isArray(row.topics) ? row.topics.join(', ') : row.topics || '';
    const answers = Array.isArray(row.answers) ? row.answers : [];
    const photos = row.photos || {};
    const answerCell = answers.length
        ? `<details class="va-answers"><summary>${vaPlural(answers.length, 'answer')}</summary><dl>${answers.map((a) => `<dt>${escapeHtmlSafe(a.question || 'Question')}</dt><dd>${escapeHtmlSafe(a.answer === null || a.answer === undefined || a.answer === '' ? '–' : a.answer)}</dd>`).join('')}</dl></details>`
        : '<span class="ui-muted">None</span>';
    return '<tr>'
        + `<td><div class="va-cell-main">${escapeHtmlSafe(row.name || 'No name')}</div><div class="va-cell-sub">${vaSecretCell('feedback', row, row.hasEmail, 'email')}${row.keptVisitor ? ' · still in the database' : ''}</div></td>`
        + `<td><div class="va-pledge" title="${escapeHtmlSafe(row.pledge || '')}">${row.pledge ? escapeHtmlSafe(row.pledge) : '<span class="ui-muted">No pledge</span>'}</div>${topics ? `<div class="va-cell-sub">${escapeHtmlSafe(topics)}</div>` : ''}</td>`
        + `<td>${answerCell}</td>`
        + `<td>${vaThumbs([['raw', photos.raw], ['processed', photos.processed]])}</td>`
        + `<td class="ui-time va-nowrap">${escapeHtmlSafe(vaDateTime(row.createdAt))}</td>`
        + '</tr>';
}

function vaLostFoundRow(row) {
    const status = { new: ['info', 'New'], reviewed: ['muted', 'Reviewed'], resolved: ['ok', 'Resolved'] }[row.status] || ['muted', row.status || 'Unknown'];
    const type = String(row.type || '');
    return '<tr>'
        + `<td><div class="va-cell-main ui-time">${escapeHtmlSafe(row.trackingCode || `Report ${row.id}`)}</div><div class="va-cell-sub">${escapeHtmlSafe(type.charAt(0).toUpperCase() + type.slice(1))}</div></td>`
        + `<td><div class="va-cell-main">${escapeHtmlSafe(row.item || 'No item name')}</div><div class="va-cell-sub">${escapeHtmlSafe([row.location, row.details].filter(Boolean).join(' · '))}</div></td>`
        + `<td>${vaSecretCell('lostFound', row, row.hasContact, 'contact')}</td>`
        + `<td>${uiPill(status[0], status[1])}</td>`
        + `<td>${vaThumbs([['item', row.photo]])}</td>`
        + `<td class="ui-time va-nowrap">${escapeHtmlSafe(vaDateTime(row.createdAt))}</td>`
        + '</tr>';
}

function vaRenderRecords() {
    const body = document.getElementById('va-view-rows');
    const type = vaView.type;
    if (!vaView.rows.length) {
        let empty = type === 'feedback' ? 'This archive holds no feedback.' : 'This archive holds no lost & found reports.';
        if (vaView.q) empty = `No records match "${vaView.q}".`;
        body.innerHTML = `<tr><td colspan="${VA_VIEW_COLUMNS[type].length}" class="ui-empty">${escapeHtmlSafe(empty)}</td></tr>`;
    } else {
        body.innerHTML = vaView.rows.map(type === 'feedback' ? vaFeedbackRow : vaLostFoundRow).join('');
    }
    vaRenderPager();
    vaRenderDecryptButton();
}

function vaRenderPager() {
    const { page, total } = vaView;
    const first = total ? (page - 1) * VA_PAGE_SIZE + 1 : 0;
    const last = Math.min(total, page * VA_PAGE_SIZE);
    vaSetText('va-view-count', total ? `${vaNum(first)}–${vaNum(last)} of ${vaNum(total)}` : '');
    document.getElementById('va-view-prev').disabled = page <= 1;
    document.getElementById('va-view-next').disabled = last >= total;
}

function vaRenderDecryptButton() {
    const button = document.getElementById('va-view-decrypt');
    const type = vaView.type;
    const key = type === 'feedback' ? 'hasEmail' : 'hasContact';
    const secret = vaView.rows.filter((r) => r[key]);
    const show = secret.some((r) => !vaView.decrypted[type][r.id]) || !secret.length;
    const what = type === 'feedback' ? 'emails' : 'contact details';
    vaSetText('va-view-decrypt', `${show ? 'Show' : 'Hide'} ${what}`);
    button.disabled = !secret.length || vaView.keyMatches === false;
    button.title = vaView.keyMatches === false ? 'This archive was encrypted with a different key.' : !secret.length ? 'Nothing on this page is encrypted.' : '';
}

// decrypts the visible rows only; pressed again it hides them
async function vaToggleDecrypt() {
    const type = vaView.type;
    const key = type === 'feedback' ? 'hasEmail' : 'hasContact';
    const store = vaView.decrypted[type];
    const ids = vaView.rows.filter((r) => r[key] && !store[r.id]).map((r) => r.id).slice(0, 100);
    if (!ids.length) {
        vaView.decrypted[type] = {};
        vaRenderRecords();
        return;
    }
    const button = document.getElementById('va-view-decrypt');
    const runId = vaView.runId;
    button.disabled = true;
    try {
        const data = await vaRequest(`/api/admin/visitor-archive/runs/${runId}/decrypt`, 'POST', { type, ids });
        if (runId !== vaView.runId) return;
        Object.assign(vaView.decrypted[type], data.values || {});
        document.getElementById('va-view-note').textContent = '';
        vaRenderRecords();
        vaAnnounce(type === 'feedback' ? 'The emails on this page are shown.' : 'The contact details on this page are shown.');
    } catch (error) {
        if (error.status === 403) {
            vaLockView();
        } else if (error.status === 409 && error.body && error.body.keyMismatch) {
            // the key alert row explains a different key better than the server's short sentence
            vaView.keyMatches = false;
            vaRenderViewHeader();
        } else {
            vaSetText('va-view-note', vaSentence(error.message));
        }
    } finally {
        if (runId === vaView.runId) vaRenderDecryptButton();
    }
}

function vaRelockView() {
    if (vaView.runId) vaAskUnlock('reload', vaView.runId);
}

function vaOpenDelete(runId) {
    const run = vaRuns.find((r) => r.id === runId);
    if (!run) return;
    const file = run.file || {};
    vaDeleteRunId = runId;
    vaSetText('va-delete-name', file.name || 'Archive file');
    vaSetText('va-delete-detail', [file.size ? vaBytes(file.size) : '', file.folder || ''].filter(Boolean).join(' · '));
    document.getElementById('va-delete-warn').hidden = !(run.status === 'done' && run.deleteRecords !== false);
    document.getElementById('va-delete-password').value = '';
    vaPasswordReset('va-delete-password');
    document.getElementById('va-delete-error').hidden = true;
    vaOpenDialog('va-delete-dialog', 'va-delete-password');
}

async function vaSubmitDelete(event) {
    event.preventDefault();
    const input = document.getElementById('va-delete-password');
    const errorBox = document.getElementById('va-delete-error');
    errorBox.hidden = true;
    if (!input.value) {
        vaPasswordError('va-delete-password', 'Enter your password.');
        return;
    }
    const button = document.getElementById('va-delete-submit');
    const runId = vaDeleteRunId;
    button.disabled = true;
    try {
        const data = await vaRequest(`/api/admin/visitor-archive/runs/${runId}/file`, 'DELETE', { password: input.value });
        input.value = '';
        // the row is redrawn first, so the focus lands on the history heading instead of a button that is gone
        vaReplaceRun(data.run);
        vaCloseDialog('va-delete-dialog', () => {
            showNotification('The archive file was deleted', 'success');
            vaAnnounce('The archive file was deleted.');
            vaLoad();
        });
    } catch (error) {
        if (error.status === 403 || error.status === 429 || error.field === 'password') vaPasswordError('va-delete-password', error.message);
        else {
            errorBox.textContent = vaSentence(error.message);
            errorBox.hidden = false;
        }
    } finally {
        button.disabled = false;
    }
}

// listeners are delegated and bound once
function vaBind() {
    const form = document.getElementById('va-settings-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';
    const day = document.getElementById('va-auto-day');
    for (let d = 1; d <= 28; d++) day.add(new Option(vaOrdinal(d), String(d)));
    form.addEventListener('input', vaFormChanged);
    form.addEventListener('change', vaFormChanged);
    document.getElementById('va-folder').addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        vaCheckFolder();
    });
    document.getElementById('va-history-rows').addEventListener('click', vaHistoryClick);
    document.getElementById('va-history-wrap').addEventListener('scroll', vaUpdateTableFade, { passive: true });
    window.addEventListener('resize', vaUpdateTableFade);
    document.getElementById('va-archive-form').addEventListener('change', vaArchiveFormChanged);
    for (const id of ['va-run-password', 'va-unlock-password', 'va-delete-password', 'va-confirm-password']) {
        document.getElementById(id).addEventListener('input', () => vaPasswordReset(id));
    }
    // each password form names its account, so password managers fill the right one
    for (const input of document.querySelectorAll('#visitor-archive-page .va-username')) input.value = sessionStorage.getItem('loggedUser') || '';
    // a logout clears the session storage before it reloads, so it never stops at this question
    window.addEventListener('beforeunload', (event) => {
        if (!sessionStorage.getItem('loggedUser') || !vaIsDirty()) return;
        event.preventDefault();
        event.returnValue = '';
    });
    document.getElementById('va-view-search').addEventListener('input', vaSearchChanged);
    // a photo that cannot load (the unlock ran out, or the entry is gone) becomes a quiet placeholder
    document.getElementById('va-view-rows').addEventListener('error', (event) => {
        const link = event.target && event.target.tagName === 'IMG' ? event.target.closest('.va-thumb') : null;
        if (!link) return;
        const placeholder = document.createElement('span');
        placeholder.className = 'va-thumb is-missing';
        placeholder.title = 'Photo not available';
        placeholder.innerHTML = uiIcon('image', 16);
        link.replaceWith(placeholder);
    }, true);
}
// <Jun Kai end>
