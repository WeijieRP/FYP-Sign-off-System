// Owner: Role 3, Jun Kai.
// Small UI helpers shared by the admin page scripts: monochrome SVG icons and status pills (no emoji in the UI).
const UI_ICON_PATHS = {
    grid: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
    tree: '<path d="M12 2 5 11h3.5L5 17h5v5h4v-5h5l-3.5-6H19z"></path>',
    clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>',
    droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
    search: '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>',
    play: '<polygon points="5 3 19 12 5 21 5 3"></polygon>',
    playCircle: '<circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon>',
    pause: '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
    bluetooth: '<polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"></polyline>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>',
    help: '<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>',
    archive: '<polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',
    clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
    power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line>',
    qr: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><path d="M14 14h3v3h-3z"></path><path d="M20 14h1v1M14 20h1v1M20 20h1v1M17 20h1v1M20 17h1v1"></path>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline>',
    award: '<circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>',
    disk: '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle>',
    server: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line>',
    brain: '<path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7z"></path><line x1="9" y1="22" x2="15" y2="22"></line>',
    tablet: '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>',
    edit: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"></path>',
    trash: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
    refresh: '<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
    alert: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',
    cross: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
    info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>',
    // <Jun Kai start>
    grip: '<circle cx="9" cy="6" r="1"></circle><circle cx="15" cy="6" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="9" cy="18" r="1"></circle><circle cx="15" cy="18" r="1"></circle>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
    unlock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>',
    close: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
    more: '<circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle>',
    // <Jun Kai end>
};

// <Jun Kai start> a small window (popover attribute) opens under the element that opened it and stays inside the
// window: align "end" lines up the right edges (a menu under a ... button); with no room below it opens above
function uiPlaceUnder(pop, anchor, align = 'start') {
    const at = anchor.getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const left = align === 'end' ? at.right - width : at.left;
    const below = at.bottom + 6 + height <= window.innerHeight - 8;
    pop.style.top = `${Math.round(below ? at.bottom + 6 : Math.max(8, at.top - 6 - height))}px`;
    pop.style.left = `${Math.round(Math.max(8, Math.min(left, window.innerWidth - width - 8)))}px`;
}
// <Jun Kai end>

function uiIcon(name, size = 16) {
    const paths = UI_ICON_PATHS[name] || UI_ICON_PATHS.info;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// tone: ok | warn | down | muted | info
function uiPill(tone, text) {
    return `<span class="ui-pill ui-pill-${tone}"><span class="ui-dot"></span>${escapeHtmlSafe(text)}</span>`;
}

// <Jun Kai start>
// The "i" button (admin redesign): a small round button beside a card title or a control. A click opens a short note
// about that card, right beside the button; Esc, a click anywhere else or another "i" closes it. The long explaining
// text that used to sit under titles lives in these notes.
// In admin.html an "i" is written as:
//   <span class="ui-info"><button type="button" class="ui-info-btn" aria-expanded="false" aria-label="About: TITLE">ICON</button>
//   <template class="ui-info-body" data-title="TITLE">the note as HTML</template></span>
// A page script that draws its own cards gets the same markup from uiInfo(). The note text is fixed text written
// in the code, never something a visitor or an admin typed.
// (uiInfo is also called while the scripts load, before escapeHtmlSafe of vips.js exists, so it escapes its title itself)
function uiInfo(title, html) {
    const safeTitle = String(title).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
    return `<span class="ui-info"><button type="button" class="ui-info-btn" aria-expanded="false" aria-label="About: ${safeTitle}" title="How this works">${uiIcon('info', 15)}</button><template class="ui-info-body" data-title="${safeTitle}">${html}</template></span>`;
}

let uiInfoOpenButton = null;
// closes the note when its button leaves the screen: another page was opened, or it was scrolled away
const uiInfoWatcher = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => { if (entries.some((entry) => entry.target === uiInfoOpenButton && !entry.isIntersecting)) closeUiInfo(); })
    : null;

// one note box for the whole page, made on first use
function uiInfoBox() {
    let box = document.getElementById('ui-info-pop');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'ui-info-pop';
    box.className = 'ui-info-pop';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'false');
    box.setAttribute('aria-labelledby', 'ui-info-title');
    // a "manual" popover is drawn above everything, also above an open side panel or pop-up window
    if (typeof box.showPopover === 'function') box.setAttribute('popover', 'manual');
    else box.hidden = true;
    box.innerHTML = '<div class="ui-info-head"><h5 id="ui-info-title"></h5><kbd>Esc</kbd></div><div class="ui-info-text"></div>';
    document.body.appendChild(box);
    return box;
}

// Under the button, opening towards the side of the screen with more room; above the button when there is no room below
function placeUiInfo() {
    const button = uiInfoOpenButton;
    const box = document.getElementById('ui-info-pop');
    if (!button || !box) return;
    const at = button.getBoundingClientRect();
    if (!button.isConnected || (at.width === 0 && at.height === 0)) { closeUiInfo(); return; } // its page or panel was closed
    const gap = 10;
    const edge = 12;
    const width = Math.min(380, window.innerWidth - edge * 2);
    box.style.width = `${width}px`;
    box.style.maxHeight = `${Math.max(160, window.innerHeight - edge * 2)}px`;
    const height = box.offsetHeight;
    // towards the side with more room: a button on the left half of the screen gets its note to the right of it
    const middle = at.left + at.width / 2;
    let left = middle < window.innerWidth / 2 ? at.left - 6 : at.right + 6 - width;
    left = Math.min(Math.max(edge, left), window.innerWidth - edge - width);
    let top = at.bottom + gap;
    const above = top + height > window.innerHeight - edge && at.top - gap - height >= edge;
    if (above) top = at.top - gap - height;
    else top = Math.max(edge, Math.min(top, window.innerHeight - edge - height));
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
    box.classList.toggle('is-above', above);
    // the little pointer sits under (or over) the middle of the button
    box.style.setProperty('--ui-info-pointer', `${Math.round(Math.min(Math.max(at.left + at.width / 2 - left, 18), width - 18))}px`);
}

function closeUiInfo() {
    const box = document.getElementById('ui-info-pop');
    if (uiInfoOpenButton) uiInfoOpenButton.setAttribute('aria-expanded', 'false');
    if (uiInfoWatcher) uiInfoWatcher.disconnect();
    uiInfoOpenButton = null;
    if (!box) return;
    if (box.hasAttribute('popover')) { if (box.matches(':popover-open')) box.hidePopover(); } else box.hidden = true;
}

function openUiInfo(button) {
    const body = button.parentElement && button.parentElement.querySelector('.ui-info-body');
    if (!body) return;
    closeUiInfo();
    const box = uiInfoBox();
    // inside an open side panel the note has to be part of that panel, or the panel would treat it as outside
    const home = button.closest('dialog[open]') || document.body;
    if (box.parentElement !== home) home.appendChild(box);
    box.querySelector('#ui-info-title').textContent = body.dataset.title || '';
    box.querySelector('.ui-info-text').innerHTML = body.innerHTML;
    uiInfoOpenButton = button;
    button.setAttribute('aria-expanded', 'true');
    if (box.hasAttribute('popover')) box.showPopover(); else box.hidden = false;
    box.scrollTop = 0;
    placeUiInfo();
    if (uiInfoWatcher) uiInfoWatcher.observe(button);
}

document.addEventListener('click', (event) => {
    const button = event.target.closest ? event.target.closest('.ui-info-btn') : null;
    if (button) {
        event.preventDefault();
        if (uiInfoOpenButton === button) closeUiInfo(); else openUiInfo(button);
        return;
    }
    if (uiInfoOpenButton && !(event.target.closest && event.target.closest('#ui-info-pop'))) closeUiInfo();
});
// Esc closes the note first; the side panel or window it sits in stays open
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !uiInfoOpenButton) return;
    const button = uiInfoOpenButton;
    event.preventDefault();
    event.stopPropagation();
    closeUiInfo();
    button.focus();
}, true);
document.addEventListener('cancel', (event) => {
    if (!uiInfoOpenButton) return;
    event.preventDefault();
    closeUiInfo();
}, true);
window.addEventListener('scroll', () => { if (uiInfoOpenButton) placeUiInfo(); }, { capture: true, passive: true });
window.addEventListener('resize', () => { if (uiInfoOpenButton) placeUiInfo(); });
// <Jun Kai end>

// <Jun Kai start> Kit dialogs instead of the browser's alert, confirm and prompt boxes (26 Nov 2026: every pop-up of the
// admin page in the kit look). A native <dialog> with the va-dialog styles: the browser keeps the focus inside, Escape
// cancels, and the focus goes back to where it was. Each one returns a Promise, so a caller awaits it:
//   if (!(await uiConfirm({ title: 'Delete this overlay?', message: 'It cannot be undone.', confirmText: 'Delete', danger: true }))) return;
//   const password = await uiPrompt({ title: 'Confirm it is you', label: 'Your password', type: 'password' }); // null when cancelled
//   // "wrong password, try again" in the same dialog: check returns an error text to stay open, or nothing to close
//   const ok = await uiPrompt({ title: 'Confirm it is you', label: 'Your password', type: 'password',
//       check: async (value) => (await passwordIsRight(value)) ? null : 'That password is not right. Try again.' });
//   await uiAlert({ title: 'Could not save', message: 'The server did not answer.' }); // only when it must be read; else showNotification
// Texts are set as plain text (line breaks kept), never as HTML.
function uiDialog(options, input) {
    const { title = '', message = '', confirmText = 'OK', cancelText = 'Cancel', danger = false, cancel = true } = options || {};
    return new Promise((resolve) => {
        const opener = document.activeElement;
        const id = `ui-dialog-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const dialog = document.createElement('dialog');
        dialog.className = 'va-dialog va-dialog-small ui-dialog';
        dialog.setAttribute('aria-labelledby', `${id}-title`);
        if (message) dialog.setAttribute('aria-describedby', `${id}-text`);
        dialog.innerHTML = `<form class="va-dialog-inner" novalidate>
            <div class="va-dialog-head"><div><h3 id="${id}-title"></h3>${message ? `<div class="va-dialog-sub ui-dialog-text" id="${id}-text"></div>` : ''}</div></div>
            ${input ? `<div class="va-dialog-body"><div class="ui-field"><label class="ui-label" for="${id}-input"></label><input class="ui-input" id="${id}-input"></div><p class="ui-help is-error ui-dialog-error" hidden></p></div>` : ''}
            <div class="va-dialog-foot">
                ${cancel ? '<button type="button" class="ui-btn ui-btn-secondary" data-ui-cancel></button>' : ''}
                <button type="submit" class="ui-btn ${danger ? 'ui-btn-danger' : 'ui-btn-primary'}" data-ui-ok></button>
            </div>
        </form>`;
        dialog.querySelector('h3').textContent = title;
        if (message) dialog.querySelector('.ui-dialog-text').textContent = message;
        dialog.querySelector('[data-ui-ok]').textContent = confirmText;
        const cancelButton = dialog.querySelector('[data-ui-cancel]');
        if (cancelButton) cancelButton.textContent = cancelText;
        const field = input ? dialog.querySelector('input') : null;
        if (field) {
            dialog.querySelector('label').textContent = input.label || 'Answer';
            field.type = input.type === 'password' ? 'password' : 'text';
            field.value = input.value || '';
            if (input.placeholder) field.placeholder = input.placeholder;
            field.autocomplete = input.type === 'password' ? 'current-password' : 'off';
        }
        const cancelled = input ? null : (cancel ? false : undefined);
        let done = false;
        let answer;
        const finish = (value) => {
            if (done) return;
            done = true;
            answer = value; // given back once the dialog is closed and the focus is back, so a caller's own focus move wins
            const close = () => { if (dialog.open) dialog.close(); };
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) close();
            else { dialog.classList.add('is-closing'); setTimeout(close, 150); }
        };
        let busy = false;
        const showError = (text) => {
            const error = dialog.querySelector('.ui-dialog-error');
            error.textContent = text;
            error.hidden = false;
            field.setAttribute('aria-invalid', 'true');
            field.focus();
            field.select();
        };
        dialog.querySelector('form').addEventListener('submit', async (event) => {
            event.preventDefault();
            if (busy || done) return; // no second run while it checks or while it closes
            if (!field) return finish(cancel ? true : undefined);
            const value = field.value;
            if (input.required !== false && !value.trim()) {
                showError(input.emptyText || `Type ${(input.label || 'an answer').toLowerCase()} first.`);
                return;
            }
            if (typeof input.check === 'function') {
                // the answer is checked while the dialog stays open; an error text keeps it open for another try
                busy = true;
                const okButton = dialog.querySelector('[data-ui-ok]');
                const label = okButton.textContent;
                okButton.disabled = true;
                if (cancelButton) cancelButton.disabled = true; // the step may already be running on the server
                okButton.textContent = input.checkingText || 'Checking...';
                let problem = null;
                try {
                    problem = await input.check(value);
                } catch (error) {
                    problem = `Could not check it: ${error && error.message ? error.message : 'unknown error'}. Try again.`;
                }
                busy = false;
                okButton.disabled = false;
                if (cancelButton) cancelButton.disabled = false;
                okButton.textContent = label;
                if (done) return;
                if (problem) { showError(String(problem)); return; }
            }
            finish(value);
        });
        // while a check runs, Cancel and Escape wait for it: the caller must hear what really happened on the server
        if (cancelButton) cancelButton.addEventListener('click', () => { if (!busy) finish(cancelled); });
        dialog.addEventListener('cancel', (event) => { event.preventDefault(); if (!busy) finish(cancelled); });
        dialog.addEventListener('close', () => {
            dialog.remove();
            if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
            resolve(answer);
        });
        document.body.appendChild(dialog);
        dialog.showModal();
        // a safe default: a dangerous step starts on Cancel, a question on its answer field, anything else on OK
        (field || (danger && cancelButton) || dialog.querySelector('[data-ui-ok]')).focus();
    });
}

function uiConfirm(options) {
    return uiDialog({ confirmText: 'OK', ...options, cancel: true });
}

function uiAlert(options) {
    return uiDialog({ confirmText: 'OK', ...(typeof options === 'string' ? { message: options } : options), cancel: false });
}

function uiPrompt(options) {
    const { label, type, value, placeholder, required, emptyText, check, checkingText, ...rest } = options || {};
    return uiDialog({ confirmText: 'OK', ...rest, cancel: true }, { label, type, value, placeholder, required, emptyText, check, checkingText });
}
// <Jun Kai end>
