// Owner: Role 3, Jun Kai.
// "What to do" on the Incidents panel: step-by-step help for each kind of incident, written here once so the wording is
// always right. The advisor only picks which help fits, from the ones allowed for that detector; it never writes steps.
// Markup for the page: **bold**, [[Key]] for a keyboard key, and {busiest}, which the page replaces with the busiest
// programmes right now (that step is left out when the list cannot be read). Pure functions.
// <Jun Kai start>
const key = (name) => `[[${name}]]`;
const step = (text, live = null) => (live ? { text, live } : { text });
const OPEN_TASK_MANAGER = `Press ${key('Ctrl')} + ${key('Shift')} + ${key('Esc')} to open Task Manager.`;
const RESTART_APP = 'restart the app at a quiet time: **Operating Hours** in the sidebar, switch to **Manual**, press **Restart application**, then switch back to **Automatic**';
// in the End task step itself, so the warning stays when the busiest list cannot be read and its step is left out.
// Ollama only while the Local AI models switch is on: off, nothing in the app uses it
const endTask = (localAi = true) => (localAi
    ? 'Right-click the programme you do not need and choose **End task**. Leave **Node.js**, **MySQL** and **Ollama** running: they are the kiosk, its database and the local AI.'
    : 'Right-click the programme you do not need and choose **End task**. Leave **Node.js** and **MySQL** running: they are the kiosk and its database.');

// the help each detector may show, its default first: an advisor answer outside this list falls back to the default
function allowedFor(incident) {
    const detector = incident && incident.detector;
    const subject = String((incident && incident.subject) || '');
    switch (detector) {
        case 'spike':
        case 'timeOfDay': return ['close-heavy-apps', 'none'];
        case 'drift': return subject === 'disk' ? ['run-archive-now', 'free-disk-space', 'none'] : ['restart-kiosk-server', 'close-heavy-apps', 'none'];
        case 'disk': return ['free-disk-space', 'run-archive-now', 'none'];
        case 'services':
            if (subject === 'database') return ['check-mysql', 'none'];
            if (subject === 'kiosk') return ['restart-kiosk-server', 'none'];
            if (subject === 'email') return ['check-mail-login', 'none'];
            return ['review-server-log', 'none'];
        case 'tablets': return ['check-tablet', 'none'];
        case 'logs': return ['review-server-log', 'none'];
        default: return ['none'];
    }
}

function chooseAction(incident, advice) {
    const allowed = allowedFor(incident);
    const wanted = advice && typeof advice.action === 'string' ? advice.action : '';
    return allowed.includes(wanted) ? wanted : allowed[0];
}

// CPU, memory or GPU: find the programme in Task Manager and end it
function busySteps(part, localAi = true) {
    const column = part === 'memory' ? 'Memory' : part === 'gpu' ? 'GPU' : 'CPU';
    const third = part === 'gpu'
        ? step('Look for video calls, games or a browser playing video.')
        : part === 'memory' ? step('Right now the most memory is used by {busiest}.', 'memory') : step('The busiest right now: {busiest}.', 'cpu');
    return [
        step(OPEN_TASK_MANAGER),
        step(`On the **Processes** tab, click the **${column}** column so the busiest programme is at the top.`),
        third,
        step(endTask(localAi)),
        step(`Nothing else to do: this incident closes by itself once ${part === 'memory' ? 'memory use' : column} is back to normal.`)
    ];
}

const KIOSK_LOG = [
    step('Open the **logs** folder in the project folder and open **app-events-kiosk.jsonl** with Notepad.'),
    step(`Press ${key('Ctrl')} + ${key('End')} to jump to the newest lines: they say why the kiosk server stopped.`),
    step('Send those lines to the team. This incident stays open until the kiosk answers again.')
];

// each takes the incident and { localAi }: whether the Local AI models switch is on
const STEPS = {
    'close-heavy-apps': (incident, { localAi = true } = {}) => busySteps(['memory', 'gpu'].includes(String(incident.subject)) ? String(incident.subject) : 'cpu', localAi),
    'restart-kiosk-server': (incident, { localAi = true } = {}) => {
        if (incident.detector === 'drift') {
            return [
                step(`${OPEN_TASK_MANAGER} Click the **Memory** column.`),
                step('Right now the most memory is used by {busiest}.', 'memory'),
                step(`If **Node.js** is at the top and keeps growing, ${RESTART_APP}.`),
                step(`If another programme keeps growing, right-click it and choose **End task** (leave **MySQL**${localAi ? ' and **Ollama**' : ''} running).`),
                step('If memory climbs again day after day, tell the team: the app may be holding on to memory.')
            ];
        }
        return [
            step('Open **Operating Hours** in the sidebar.'),
            step('In **Manual** mode, press **Start kiosk**. In **Automatic** mode it starts by itself within 5 minutes while a policy keeps the kiosk on.'),
            step('Wait half a minute: this incident closes once the kiosk answers again.')
        ];
    },
    'check-mysql': (incident) => (incident.kind === 'slow'
        ? [
            step(`${OPEN_TASK_MANAGER} Click the **CPU** column, then the **Disk** column.`),
            step('If **mysqld** is at the top, give it a few minutes: a backup or a large archive slows it for a while.'),
            step('If another programme is using the disk heavily, right-click it and choose **End task**.'),
            step('If it stays slow for an hour, restart MySQL at a quiet time: **Services**, right-click **MySQL84**, **Restart**.')
        ]
        : [
            step(`Press the ${key('Windows')} key, type **Services** and open it.`),
            step('Find **MySQL84** (or **MySQL**) in the list.'),
            step('If its status is not **Running**, right-click it and choose **Start**.'),
            step('Wait a minute: this incident closes once the database answers.'),
            step('If it will not start, open **Event Viewer**, **Windows Logs**, **Application**, look for MySQL errors and tell the team.')
        ]),
    'free-disk-space': () => [
        step('Open **This PC** and look at how much space is free on drive **C:**.'),
        step('Empty the Recycle Bin: right-click it on the desktop and choose **Empty Recycle Bin**.'),
        step(`Run Disk Cleanup: press the ${key('Windows')} key, type **Disk Cleanup**, choose drive **C:**, tick **Temporary files** and **Recycle Bin**, then **OK**.`),
        step('Archive old visitor records on the **Visitor Data Archive** page: their photos take the most space.'),
        step('Check the **Downloads** folder for large files nobody needs.')
    ],
    'run-archive-now': () => [
        step('Open **Visitor Data Archive** in the sidebar.'),
        step('Press **Archive now** and choose which records to take: their photos take the most space.'),
        step('Copy the finished zip to a safe place (a USB drive or the shared drive).'),
        step('Check **This PC** again in a day: this incident closes once the disk stops filling this fast.')
    ],
    'check-mail-login': () => [
        step('Open **Mail Account** in the sidebar and press **Check again**.'),
        step('For Gmail, make a new **App Password** (Google Account, **Security**, **2-Step Verification**, **App passwords**).'),
        step('Paste it into the password box and press **Save**.'),
        step('This incident closes once the login works again.')
    ],
    'check-tablet': (incident) => {
        const evidence = incident.evidence && typeof incident.evidence === 'object' ? incident.evidence : {};
        if (incident.kind === 'all-offline') {
            return [
                step('Check the kiosk PC is on the network: the network icon at the bottom right of the screen.'),
                step('Check the Wi-Fi router is on: the tablets reach the kiosk PC through it.'),
                step('On **System Health**, check the **Kiosk server** card: if it is down, start it first (**Operating Hours**).'),
                step('Reopen the kiosk page on one tablet to see if it comes back.')
            ];
        }
        const name = typeof evidence.name === 'string' && evidence.name.trim() ? evidence.name.trim() : 'the tablet';
        return [
            step(`Go to the tablet **${name}** and check the screen is on and it is charging.`),
            step('Check it is on the same Wi-Fi as the kiosk PC (**Settings**, **Wi-Fi**).'),
            step('Reopen the kiosk page: scan the QR code on the **Feedback QR Code** page, or pull down to refresh.'),
            step('Within a minute it reports again and this incident closes by itself.')
        ];
    },
    'review-server-log': (incident) => {
        const evidence = incident.evidence && typeof incident.evidence === 'object' ? incident.evidence : {};
        const file = evidence.process === 'kiosk' ? 'app-events-kiosk.jsonl' : 'app-events-server.jsonl';
        return [
            step('Open the **logs** folder in the project folder.'),
            step(`Open **${file}** with Notepad and press ${key('Ctrl')} + ${key('End')} to jump to the newest lines.`),
            step('Find the lines with the error shown under **What happened** and note which part failed.'),
            step(`If the errors keep coming, ${RESTART_APP}, and send the lines to the team.`)
        ];
    },
    none: () => [
        step('Nothing to do yet: keep an eye on it.'),
        step('This incident closes by itself once the readings are normal again.')
    ]
};

// The help for one incident: the steps, and the fix the app can do itself when one applies (fixKey from fixes.js).
// With a fix on offer, its card leads and the steps become what to try if it does not come back. localAi: the Local
// AI models switch (the steps say to keep Ollama running only while it is on).
function helpFor(incident, advice, { fixKey = null, fixesOn = true, localAi = true } = {}) {
    if (!incident) return null;
    const action = chooseAction(incident, advice);
    const steps = (STEPS[action] || STEPS.none)(incident, { localAi });
    if (fixKey && fixesOn) {
        const fallback = action === 'restart-kiosk-server' && incident.detector === 'services' ? KIOSK_LOG : steps;
        return { action, fix: fixKey, steps: [], fallback: { title: 'If it does not come back', steps: fallback } };
    }
    const withLog = action === 'restart-kiosk-server' && incident.detector === 'services';
    return { action, fix: null, steps, fallback: withLog ? { title: 'If it does not come back', steps: KIOSK_LOG } : null };
}

module.exports = { allowedFor, chooseAction, helpFor, STEPS };
// <Jun Kai end>
