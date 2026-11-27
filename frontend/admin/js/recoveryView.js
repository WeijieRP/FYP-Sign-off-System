// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// recovery.html: the page the server opens by itself after the PC was off. It shows the History of the Server Schedule
// to read only, so an admin who comes to the PC later sees at once why the kiosk stopped and what was done, without a
// sign-in. The address the server opens ends with a link (#...) that the server made for this one start; the History
// lines are given only to that link and only on the PC itself (backend/features/serverControl/recoveryView.js).
// A browser that is still signed in ("Keep me signed in") goes to the real admin page with its History drawer open.
const RECOVERY_LINK_KEY = 'recoveryViewLink';
const RECOVERY_REFRESH_MS = 60 * 1000;
const RECOVERY_STEP = 10;
const recoveryView = { link: '', events: null, shown: RECOVERY_STEP };

// The link from the address. It is taken off the address at once, so it is not left on the screen or in the browser
// history, and kept for this tab only, so the page still works after a refresh.
function recoveryReadLink() {
    const fromAddress = location.hash.slice(1);
    if (/^[0-9a-f]{48}$/.test(fromAddress)) {
        try { sessionStorage.setItem(RECOVERY_LINK_KEY, fromAddress); } catch { /* storage switched off: this load still works */ }
        history.replaceState(null, '', location.pathname);
        return fromAddress;
    }
    try { return sessionStorage.getItem(RECOVERY_LINK_KEY) || ''; } catch { return ''; }
}

// True when this browser chose "Keep me signed in" and the server still accepts it
async function recoverySignedIn() {
    try {
        const hint = JSON.parse(localStorage.getItem('adminRememberHint') || 'null');
        if (!hint || !(Date.parse(hint.until) > Date.now())) return false;
        const response = await fetch('/api/admin/remember', { cache: 'no-store' });
        return response.ok;
    } catch {
        return false;
    }
}

// events: newest first. The newest "PC back on" line with the start and the stop right before it is what happened;
// the lines above it came after, the lines below it were there before.
function recoverySplit(events) {
    const at = events.findIndex((event) => event.type === 'recovery');
    if (at < 0) return { story: [], since: [], before: events };
    const story = [events[at]];
    let last = at;
    for (const type of ['started', 'stopped']) {
        if (events[last + 1] && events[last + 1].type === type) story.push(events[++last]);
    }
    return { story: story.reverse(), since: events.slice(0, at), before: events.slice(last + 1) };
}

function recoveryNote(text) {
    const note = document.getElementById('recovery-note');
    note.textContent = text || '';
    note.hidden = !text;
}

function recoveryRender() {
    const { story, since, before } = recoverySplit(recoveryView.events || []);
    const rows = (list) => list.map((event) => scheduleHistoryRow(event)).join('');
    document.getElementById('recovery-story').innerHTML = story.length ? rows(story) : '<li class="ui-empty">No start after the PC was off is on record.</li>';
    document.getElementById('recovery-since-card').hidden = !since.length;
    document.getElementById('recovery-since').innerHTML = rows(since);
    document.getElementById('recovery-before-card').hidden = !before.length;
    document.getElementById('recovery-before').innerHTML = rows(before.slice(0, recoveryView.shown));
    const shown = Math.min(recoveryView.shown, before.length);
    document.getElementById('recovery-more').hidden = before.length <= shown;
    document.getElementById('recovery-count').textContent = `Showing ${shown} of ${before.length}`;
}

function recoveryShowMore() {
    recoveryView.shown += RECOVERY_STEP;
    recoveryRender();
}

// One load of the lines. A load that fails later leaves the lines that are already on the page.
async function recoveryLoad() {
    try {
        const response = await fetch('/api/admin/recovery-view', { cache: 'no-store', headers: { 'X-Recovery-View': recoveryView.link } });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'The History could not be loaded.');
        recoveryView.events = Array.isArray(data.events) ? data.events : [];
        recoveryNote('');
        recoveryRender();
    } catch (error) {
        if (recoveryView.events) return recoveryNote('This view is no longer updated. Sign in to the admin page for the newest History lines.');
        recoveryNote(error instanceof TypeError ? 'The History could not be loaded: the server does not answer.' : error.message);
        document.getElementById('recovery-story').innerHTML = '<li class="ui-empty">Sign in to the admin page to see the History of Operating Hours.</li>';
    }
}

async function recoveryStart() {
    recoveryView.link = recoveryReadLink();
    if (await recoverySignedIn()) return location.replace('/admin#schedule-history');
    await recoveryLoad();
    setInterval(recoveryLoad, RECOVERY_REFRESH_MS);
}

document.addEventListener('DOMContentLoaded', recoveryStart);
// <Jun Kai end>
