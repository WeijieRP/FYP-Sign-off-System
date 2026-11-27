// Owner: Role 3, Jun Kai (lives in the kiosk page so the admin Health page can see each tablet).
// 1. Once a minute: tell the server this screen is alive.
// 2. Every 10 seconds: ask the server how it is (GET /api/status), so that the screen looks after itself:
//    - the server has not answered for 30 seconds -> an "offline" screen. When the server answers again the kiosk
//      comes back by itself: the page is loaded again when the server was started in between (a power cut, a restart),
//      and only uncovered when just the network was away, so a visitor's answers stay;
//    - the policies have the kiosk closed (off hours in Automatic mode) -> a "closed" screen with the time it opens
//      again. It comes back by itself when the kiosk opens.
//    A visitor in the middle of the form is not cut off: the closed screen and a reload wait until nobody has used
//    the screen for 75 seconds (the page's own timer takes it back to the first page after 60) and no answers are
//    being sent.
// <Jun Kai start>
(function () {
    // ---------------------------------------------------------------- 1. the heartbeat
    const STORAGE_KEY = 'kioskDeviceId';
    let deviceId = null;
    try {
        deviceId = localStorage.getItem(STORAGE_KEY);
        if (!deviceId) {
            deviceId = 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
            localStorage.setItem(STORAGE_KEY, deviceId);
        }
    } catch {
        deviceId = 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    }

    async function heartbeat() {
        try {
            await fetch('/api/health/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, page: location.pathname.replace(/^\//, '').slice(0, 40) || 'feedback' }),
                keepalive: true
            });
        } catch { /* the server is away; try again next minute */ }
    }

    heartbeat();
    setInterval(heartbeat, 60000);

    // ---------------------------------------------------------------- 2. offline, closed, and back by itself
    const ASK_MS = 10000;      // how often the server is asked
    const ASK_FAST_MS = 3000;  // while something is waiting to happen
    const ANSWER_MS = 5000;    // how long one answer may take
    const AWAY_MS = 30000;     // silence before the offline screen (a slow moment of the server is not "offline")
    const IDLE_MS = 75000;     // nobody has touched the screen for this long

    let known = null;             // when the server started, from its first answer
    let restarted = false;        // the server was started again since this page was loaded
    let lastAnswer = Date.now();  // when the server last answered
    let goodInARow = 0;           // answers in a row: a reload waits for two, so it never lands on a server that is half up
    let closed = null;            // { opensAt } while the policies have the kiosk closed
    let lastTouch = 0;            // 0: not touched since the page was loaded
    let shown = null;             // 'offline' | 'closed' | null
    let cover = null;             // the screen that covers the page (kept here, never looked up)
    let scrollBefore = '';        // the page's own scroll setting, put back when the cover goes
    let timer = null;

    // everything the kiosk page's own timer counts as "someone is here" (events.js), and a few more
    ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'mousemove', 'click', 'keydown', 'keypress', 'input', 'change', 'wheel'].forEach((type) => {
        window.addEventListener(type, () => { lastTouch = Date.now(); }, { capture: true, passive: true });
    });
    // the page stops its own timer while a visit is being sent: that visitor is still here
    const sending = () => document.body.classList.contains('submitting-feedback');

    // "at 9:00 am", "tomorrow at 9:00 am", "on Mon 23 Nov at 9:00 am"
    function when(iso) {
        const at = new Date(iso);
        if (Number.isNaN(at.getTime())) return '';
        const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const days = Math.round((day(at) - day(new Date())) / 86400000);
        if (days <= 0) return `at ${time}`;
        if (days === 1) return `tomorrow at ${time}`;
        return `on ${at.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} at ${time}`;
    }

    function show(kind) {
        const title = kind === 'offline' ? 'The kiosk is offline' : 'The kiosk is closed';
        const opens = kind === 'closed' && closed && closed.opensAt ? when(closed.opensAt) : '';
        const line = kind === 'offline'
            ? 'This screen comes back by itself when the kiosk is on again.'
            : `${opens ? `It opens again ${opens}.` : 'It is not open right now.'} This screen comes back by itself.`;
        if (!cover) {
            cover = document.createElement('div');
            cover.setAttribute('role', 'status');
            cover.setAttribute('aria-live', 'polite');
            cover.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;'
                + 'gap:18px;padding:32px;text-align:center;background:#0f1b17;color:#ffffff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;';
            const heading = document.createElement('div');
            heading.style.cssText = 'font-size:clamp(28px,5vw,56px);font-weight:700;line-height:1.2;';
            const text = document.createElement('div');
            text.style.cssText = 'font-size:clamp(16px,2.4vw,26px);line-height:1.5;max-width:32em;opacity:0.85;';
            cover.append(heading, text);
            document.body.appendChild(cover);
            scrollBefore = document.documentElement.style.overflow;
            document.documentElement.style.overflow = 'hidden'; // no scroll bar next to the cover
        }
        cover.children[0].textContent = title;
        cover.children[1].textContent = line;
        cover.dataset.kind = kind;
        shown = kind;
    }

    function hide() {
        if (cover) {
            cover.remove();
            document.documentElement.style.overflow = scrollBefore;
        }
        cover = null;
        shown = null;
    }

    function decide() {
        const now = Date.now();
        const idle = now - lastTouch >= IDLE_MS && !sending();
        let next = ASK_MS;

        if (now - lastAnswer >= AWAY_MS) {
            show('offline');
            next = ASK_FAST_MS;
        } else if (goodInARow === 0) {
            next = ASK_FAST_MS; // one answer missed: ask again soon, the screen stays as it is
        } else {
            if (shown === 'offline') {
                if (goodInARow < 2) return again(ASK_FAST_MS);
                if (restarted) return location.reload();
                hide(); // only the network was away
            }
            // the server was started again and this screen did not see it go: load the page again once nobody uses it
            if (restarted) {
                if (goodInARow >= 2 && (idle || shown === 'closed')) return location.reload();
                next = ASK_FAST_MS;
            }
            if (closed) {
                if (shown === 'closed' || idle) show('closed');
                else next = ASK_FAST_MS; // someone is using the kiosk: wait
            } else if (shown === 'closed') {
                if (goodInARow >= 2) return location.reload(); // open again: start from a fresh page
                next = ASK_FAST_MS;
            }
        }
        again(next);
    }

    function again(ms) {
        clearTimeout(timer);
        timer = setTimeout(ask, ms);
    }

    async function ask() {
        clearTimeout(timer);
        let answer = null;
        const stop = new AbortController();
        const tooLong = setTimeout(() => stop.abort(), ANSWER_MS);
        try {
            const response = await fetch('/api/status', { cache: 'no-store', signal: stop.signal });
            if (response.ok) answer = await response.json();
        } catch { /* no answer */ }
        clearTimeout(tooLong);

        if (answer && answer.online) {
            lastAnswer = Date.now();
            goodInARow += 1;
            const started = answer.startedAt || '';
            if (known === null) known = started;
            else if (started && started !== known) restarted = true;
            closed = answer.open === false ? { opensAt: answer.opensAt || null } : null;
        } else {
            goodInARow = 0;
        }
        decide();
    }

    // a tablet that was asleep, or whose network just came back, asks at once
    window.addEventListener('online', ask);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) ask(); });
    ask();
})();
// <Jun Kai end>
