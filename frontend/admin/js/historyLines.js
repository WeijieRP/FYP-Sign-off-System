// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// One line of the Server Schedule History: what an event the server recorded is called, the colour of its dot and its
// list row. Used by the History drawer (serverControl.js) and by the page that opens after the PC was off
// (recoveryView.js), so both say the same thing. Dots: green = running again, amber = stopped in a normal way,
// red = stopped in a way nobody asked for.
const HISTORY_STOPPED = {
    'power-lost': ['Stopped: power lost', 'down'], 'windows-crash': ['Stopped: Windows error', 'down'], crash: ['Stopped: error', 'down'],
    'child-exit': ['Stopped: a server ended', 'down'], ended: ['Stopped: program ended', 'down'], exit: ['Stopped: ended by itself', 'down'],
    'pc-off': ['Stopped: PC went off', 'down'], 'pc-restart': ['Stopped: PC restarted', 'warn'], 'pc-shutdown': ['Stopped: PC shut down', 'warn'],
    'window-closed': ['Stopped: window closed', 'warn'], 'ctrl-c': ['Stopped: Ctrl+C', 'warn'], terminated: ['Stopped: ended by a program', 'warn'],
    'restart-request': ['Stopped: Restart application', 'warn'], unknown: ['Stopped: cause not known', 'down']
};
const HISTORY_STARTED = { 'pc-start': 'Started: PC switched on', restart: 'Started: after a restart', logon: 'Started: Windows sign-in' };
// type -> [label, dot, group]; group 'power' = starts and stops of the programs and the PC, 'schedule' = policies and mode
const HISTORY_TYPES = {
    sleep: ['PC went to sleep', 'warn', 'power'], wake: ['PC woke up', 'ok', 'power'], pause: ['Programs paused', 'warn', 'power'],
    'kiosk-down': ['Kiosk server not answering', 'down', 'power'], 'kiosk-up': ['Kiosk server answers again', 'ok', 'power'],
    hibernate: ['Hibernated the PC (Stop button)', 'warn', 'power'],
    off: ['Off hours started (recorded)', 'warn', 'schedule'], on: ['On hours started', 'ok', 'schedule'],
    start: ['Starting the kiosk', 'muted', 'schedule'], 'start-ok': ['Kiosk started', 'ok', 'schedule'], 'start-failed': ['Kiosk start failed', 'down', 'schedule'],
    mode: ['Mode changed', 'muted', 'schedule']
};

// { label, tone, group } of one History line
function scheduleHistoryLine(event) {
    if (event.type === 'stopped') {
        const [label, tone] = HISTORY_STOPPED[event.cause] || ['Stopped: cause not known', 'down'];
        return { label, tone, group: 'power' };
    }
    if (event.type === 'started') return { label: HISTORY_STARTED[event.cause] || 'Started', tone: 'ok', group: 'power' };
    if (event.type === 'recovery') {
        return event.cause === 'left' ? { label: 'PC back on: nothing started', tone: 'muted', group: 'power' } : { label: 'PC back on: kiosk checked', tone: 'ok', group: 'power' };
    }
    const [label, tone, group] = HISTORY_TYPES[event.type] || [event.type, 'muted', 'schedule'];
    return { label, tone, group };
}

function scheduleHistoryEscape(text) {
    return String(text === null || text === undefined ? '' : text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// The <li> of one event: the time, what happened with its dot, and the sentence the server wrote
function scheduleHistoryRow(event, year = new Date().getFullYear()) {
    const { label, tone } = scheduleHistoryLine(event);
    const date = new Date(event.at);
    const when = date.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, ...(date.getFullYear() === year ? {} : { year: 'numeric' }) });
    return `<li>
                    <span class="ui-time">${scheduleHistoryEscape(when)}</span>
                    <span class="ui-type"><span class="history-dot is-${tone}" aria-hidden="true"></span>${scheduleHistoryEscape(label)}${event.dryRun ? ' (dry run)' : ''}</span>
                    <span class="ui-detail">${scheduleHistoryEscape(event.detail || '')}</span>
                </li>`;
}
// <Jun Kai end>
