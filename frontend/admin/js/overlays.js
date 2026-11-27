// Owner: Role 1, Zihan. Previous team: Nick (7).
// Part 13/30 of the admin page: photo frame (overlay) management (load order in admin.html).
// ==================== 12. OVERLAY MANAGEMENT ====================

// Load overlay data
// <Jun Kai start> a failed load or a missing table is said on the page with Try again, not in an alert box
async function loadOverlayData() {
    try {
        const response = await fetch('/api/admin/overlays');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'the server did not send the overlays');
        if (data.message === 'Overlays table does not exist yet') {
            updateOverlayTable([]);
            showOverlayMessage('The overlays table is missing in the database. Run the database setup, then reload this page.');
        } else {
            updateOverlayTable(data.overlays);
        }
    } catch (error) {
        console.error('Error loading overlay data:', error);
        showOverlayMessage(`Could not load the overlays: ${error.message}.`, true);
    }
}

// a message in place of the gallery; retry adds a Try again button
function showOverlayMessage(message, retry = false) {
    const overlayGrid = document.querySelector('.overlay-grid');
    if (!overlayGrid) return;
    overlayGrid.innerHTML = `<p class="ui-empty ov-loading${retry ? ' ov-error' : ''}">${overlayEscape(message)}${retry ? ' <button type="button" class="ui-link" onclick="loadOverlayData()">Try again</button>' : ''}</p>`;
}
// <Jun Kai end>

// Update overlay table
// <Jun Kai start>
// Overlays A, the picture gallery: one card per overlay that leads with its desktop and mobile pictures, with the name,
// theme ID, order and file type under them. The ID, both file paths and the date it was added open in the details
// panel (click a card). The buttons call the same viewOverlay() and deleteOverlay() as before.
let overlayList = [];
let overlayOpenId = null;
let overlayAdding = false; // the side panel shows the Add overlay form

function overlayEscape(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function overlayTypeText(overlay) {
    const desktop = getOverlayFileTypeLabel(overlay.desktop_filename);
    const mobile = getOverlayFileTypeLabel(overlay.mobile_filename);
    return desktop === mobile ? desktop : `Desktop ${desktop} / Mobile ${mobile}`;
}

// a picture of an overlay file; a video file plays muted, a missing file says so
function overlayPicture(src, kind, size) {
    const file = overlayEscape(src);
    const media = /\.(mp4|webm)$/i.test(String(src || '').split('?')[0])
        ? `<video src="${file}" muted loop autoplay playsinline onerror="this.parentElement.classList.add('is-missing')"></video>`
        : `<img src="${file}" alt="" loading="lazy" onerror="this.parentElement.classList.add('is-missing')">`;
    return `<span class="ov-pic ov-pic-${kind}${size ? ` ov-pic-${size}` : ''}" title="${kind === 'desktop' ? 'Desktop' : 'Mobile'} picture">${src ? media : ''}</span>`;
}

function overlayAddedText(overlay) {
    if (!overlay.created_at) return 'Not recorded';
    const date = new Date(overlay.created_at);
    return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString();
}

function fillOverlayIcons() {
    document.querySelectorAll('#overlay-page [data-fb-icon]').forEach((slot) => {
        slot.outerHTML = uiIcon(slot.getAttribute('data-fb-icon'), 16);
    });
}

function updateOverlayTable(overlays) {
    const overlayGrid = document.querySelector('.overlay-grid');
    if (!overlayGrid) {
        console.error('Overlay grid not found');
        return;
    }
    fillOverlayIcons();
    overlayList = Array.isArray(overlays) ? overlays : [];
    overlayGrid.innerHTML = '';

    if (overlayList.length === 0) {
        overlayGrid.innerHTML = '<p class="ui-empty ov-loading">No overlays yet. Add one with Add overlay.</p>';
        closeOverlayPanel(false);
        return;
    }

    overlayList.forEach((overlay) => {
        const name = overlay.display_name || overlay.theme_id || `Overlay ${overlay.id}`;
        const card = document.createElement('div');
        card.className = 'overlay-card ov-card ui-card';
        card.dataset.overlayId = overlay.id;
        card.innerHTML = `
            <div class="ov-pics">${overlayPicture(overlay.desktop_filename, 'desktop')}${overlayPicture(overlay.mobile_filename, 'mobile')}</div>
            <div class="ov-meta">
                <div class="ov-text">
                    <button type="button" class="ov-name" data-ov="open" title="Show the details">${overlayEscape(name)}</button>
                    <p class="ov-sub">Theme ID <code>${overlayEscape(overlay.theme_id)}</code> · order ${overlayEscape(overlay.display_order)} · ${overlayEscape(overlayTypeText(overlay))}</p>
                </div>
                <div class="ov-actions">
                    <button type="button" class="ui-btn ui-btn-icon" data-ov="preview" title="Preview both pictures" aria-label="Preview ${overlayEscape(name)}">${uiIcon('image', 16)}</button>
                    <button type="button" class="ui-btn ui-btn-icon ui-danger" data-ov="delete" title="Delete" aria-label="Delete ${overlayEscape(name)}">${uiIcon('trash', 16)}</button>
                </div>
            </div>`;
        // the values go to the old functions as they are, never through a built onclick string
        card.addEventListener('click', async (event) => {
            const action = event.target.closest('[data-ov]')?.dataset.ov || 'open';
            if (action === 'preview') viewOverlay(overlay.desktop_filename, overlay.mobile_filename, name, overlay.theme_id);
            else if (action === 'delete') deleteOverlay(overlay.id);
            else {
                // the add form asks before what was typed in it is dropped
                if (overlayAdding) { await closeAddOverlayModal(); if (overlayAdding) return; }
                openOverlayPanel(overlay.id);
            }
        });
        overlayGrid.appendChild(card);
    });

    // a panel that is open stays open on the same overlay, or closes when that overlay is gone
    if (overlayOpenId !== null) {
        if (overlayList.some((item) => Number(item.id) === overlayOpenId)) openOverlayPanel(overlayOpenId, false);
        else closeOverlayPanel(false);
    }
}

function openOverlayPanel(overlayId, focus = true) {
    const id = Number(overlayId);
    const overlay = overlayList.find((item) => Number(item.id) === id);
    const panel = document.getElementById('overlay-panel');
    if (!overlay || !panel) return;
    const name = overlay.display_name || overlay.theme_id || `Overlay ${overlay.id}`;
    overlayOpenId = id;
    overlayAdding = false;
    panel.innerHTML = `
        <header class="ui-sidepanel-head">
            <div>
                <h3 id="overlay-panel-title" tabindex="-1">${overlayEscape(name)}</h3>
                <p>Theme ID ${overlayEscape(overlay.theme_id)} · order ${overlayEscape(overlay.display_order)}</p>
            </div>
            <button type="button" class="ui-btn ui-btn-icon" data-ov="close" title="Close" aria-label="Close the details">${uiIcon('close', 16)}</button>
        </header>
        <div class="ui-sidepanel-body">
            <div class="ov-panel-pics">
                <figure>${overlayPicture(overlay.desktop_filename, 'desktop', 'large')}<figcaption>Desktop</figcaption></figure>
                <figure>${overlayPicture(overlay.mobile_filename, 'mobile', 'large')}<figcaption>Mobile</figcaption></figure>
            </div>
            <dl class="ui-kv ov-facts">
                <dt>ID</dt><dd>${overlayEscape(overlay.id)}</dd>
                <dt>Theme ID</dt><dd><code>${overlayEscape(overlay.theme_id)}</code></dd>
                <dt>Display order</dt><dd>${overlayEscape(overlay.display_order)}</dd>
                <dt>File type</dt><dd>${overlayEscape(overlayTypeText(overlay))}</dd>
                <dt>Desktop file</dt><dd class="ov-path">${overlayEscape(overlay.desktop_filename)}</dd>
                <dt>Mobile file</dt><dd class="ov-path">${overlayEscape(overlay.mobile_filename)}</dd>
                <dt>Added</dt><dd>${overlayEscape(overlayAddedText(overlay))}</dd>
            </dl>
        </div>
        <footer class="ui-sidepanel-foot">
            <button type="button" class="ui-btn ui-btn-danger" data-ov="delete">${uiIcon('trash', 15)}Delete this overlay</button>
            <span class="ui-spacer"></span>
            <button type="button" class="ui-btn ui-btn-secondary" data-ov="preview">${uiIcon('image', 15)}Preview both</button>
        </footer>`;
    panel.onclick = (event) => {
        const action = event.target.closest('[data-ov]')?.dataset.ov;
        if (action === 'close') closeOverlayPanel();
        else if (action === 'preview') viewOverlay(overlay.desktop_filename, overlay.mobile_filename, name, overlay.theme_id);
        else if (action === 'delete') deleteOverlay(overlay.id);
    };
    panel.hidden = false;
    document.getElementById('overlay-page')?.classList.add('ui-has-sidepanel');
    document.querySelectorAll('#overlay-page .ov-card.is-open').forEach((card) => card.classList.remove('is-open'));
    document.querySelector(`#overlay-page .ov-card[data-overlay-id="${id}"]`)?.classList.add('is-open');
    if (focus) document.getElementById('overlay-panel-title')?.focus({ preventScroll: true });
}

function closeOverlayPanel(refocus = true) {
    if (overlayAdding) return; // the panel holds the add form, which closes itself
    const panel = document.getElementById('overlay-panel');
    const id = overlayOpenId;
    overlayOpenId = null;
    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
    document.getElementById('overlay-page')?.classList.remove('ui-has-sidepanel');
    document.querySelectorAll('#overlay-page .ov-card.is-open').forEach((card) => card.classList.remove('is-open'));
    if (refocus && id !== null) document.querySelector(`#overlay-page .ov-card[data-overlay-id="${id}"] .ov-name`)?.focus({ preventScroll: true });
}

// Escape closes the details or the add form (a dialog open over them handles its own Escape)
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (!document.getElementById('overlay-page')?.classList.contains('active')) return;
    if (overlayAdding) { event.preventDefault(); closeAddOverlayModal(); return; }
    if (overlayOpenId === null) return;
    closeOverlayPanel();
});
// <Jun Kai end>

// View overlay function shows both desktop and mobile
// <Jun Kai start> The preview is a kit dialog (va-dialog): both pictures as on the cards, the file of each with a Download
// button, and the theme ID. Escape and Close shut it; the values reach the buttons as data, never inside an onclick string.
function viewOverlay(desktopImagePath, mobileImagePath, title, themeId) {
    closeOverlayPreview(true);
    const name = String(title || themeId || 'Overlay');
    const safeTitle = name.replace(/[^a-zA-Z0-9]/g, '_');
    const files = [
        ['desktop', 'Desktop', desktopImagePath, `${safeTitle}_desktop${getOverlayFileExtension(desktopImagePath)}`],
        ['mobile', 'Mobile', mobileImagePath, `${safeTitle}_mobile${getOverlayFileExtension(mobileImagePath)}`]
    ];
    const dialog = document.createElement('dialog');
    dialog.className = 'va-dialog ov-preview-dialog';
    dialog.id = 'overlay-preview-dialog';
    dialog.setAttribute('aria-labelledby', 'overlay-preview-title');
    dialog.innerHTML = `<div class="va-dialog-inner">
        <div class="va-dialog-head">
            <div>
                <h3 id="overlay-preview-title">${overlayEscape(name)}</h3>
                <div class="va-dialog-sub">Theme ID <code>${overlayEscape(themeId)}</code>. How the overlay sits on a visitor's photo.</div>
            </div>
            <button type="button" class="ui-btn ui-btn-icon va-dialog-close" data-ov-close aria-label="Close" title="Close">${uiIcon('close', 18)}</button>
        </div>
        <div class="va-dialog-body">
            <div class="ov-preview-grid">
                ${files.map(([kind, label, src, download], index) => `
                <figure class="ov-preview-item">
                    <figcaption>${label}</figcaption>
                    <div class="ov-preview-frame">${overlayPicture(src, kind, 'large')}</div>
                    <p class="ov-path">${overlayEscape(src || 'No file')}</p>
                    <button type="button" class="ui-btn ui-btn-secondary" data-ov-download="${index}"${src ? '' : ' disabled'}>${uiIcon('download', 15)}Download ${label.toLowerCase()} picture</button>
                </figure>`).join('')}
            </div>
        </div>
        <div class="va-dialog-foot">
            <button type="button" class="ui-btn ui-btn-secondary" data-ov-close>Close</button>
        </div>
    </div>`;
    dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-ov-close]')) return closeOverlayPreview();
        const button = event.target.closest('[data-ov-download]');
        if (button) { const file = files[Number(button.dataset.ovDownload)]; downloadOverlay(file[2], file[3]); }
    });
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeOverlayPreview(); });
    const opener = document.activeElement;
    dialog.addEventListener('close', () => {
        dialog.remove();
        if (opener && document.contains(opener) && typeof opener.focus === 'function') opener.focus();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector('.va-dialog-close').focus();
}

// Close overlay preview (now: at once, without the short fade)
function closeOverlayPreview(now = false) {
    const dialog = document.getElementById('overlay-preview-dialog');
    if (!dialog || !dialog.open) return;
    if (now || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { dialog.close(); return; }
    if (dialog.classList.contains('is-closing')) return;
    dialog.classList.add('is-closing');
    setTimeout(() => { if (dialog.open) dialog.close(); }, 150);
}
// <Jun Kai end>

function getOverlayFileExtension(imagePath) {
    const cleanPath = String(imagePath || '').split('?')[0];
    const match = cleanPath.match(/\.[a-z0-9]+$/i);
    return match ? match[0].toLowerCase() : '.png';
}

// Convert overlay path extension into a readable file type label - changes made by nick
function getOverlayFileTypeLabel(imagePath) {
    const extension = getOverlayFileExtension(imagePath).replace('.', '');
    return extension ? extension.toUpperCase() : 'UNKNOWN';
}

// Download overlay
function downloadOverlay(imageUrl, filename) {
    fetch(imageUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Overlay image not found');
            }
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        })
        .catch(error => {
            console.error('Download error:', error);
            showNotification(`The picture could not be downloaded: ${error.message}.`, 'error'); // <Jun Kai/>
        });
}

// Show add overlay modal (System Admin only)
// <Jun Kai start> Add overlay opens in the page's side panel, where the details of an overlay show too, so adding and looking
// feel the same. The server rules are checked here first, each under its own field: a name, a theme ID of lowercase
// letters and numbers that no other overlay uses, and a desktop and a mobile picture (PNG or GIF, at most 10 MB each).
// The server gives a new overlay the next place in the list itself, so the form says where it goes instead of asking.
const OVERLAY_MAX_BYTES = 10 * 1024 * 1024;
const OVERLAY_TYPES = ['image/png', 'image/gif'];
let overlayAddOpener = null;
let overlayThemeTouched = false;

function showAddOverlayModal() {
    if (sessionStorage.getItem('userRole') !== 'system_admin') {
        showNotification('Only a System Admin can add overlays.', 'error');
        return;
    }
    const panel = document.getElementById('overlay-panel');
    if (!panel) return;
    if (!overlayAdding) overlayAddOpener = document.activeElement;
    if (overlayOpenId !== null) closeOverlayPanel(false);
    overlayAdding = true;
    overlayThemeTouched = false;
    const nextPlace = overlayList.reduce((max, item) => Math.max(max, Number(item.display_order) || 0), 0) + 1;
    const picker = (kind, label, size, input) => `
        <div class="ui-field ov-add-file">
            <span class="ui-label" id="ov-add-${kind}-label">${label} picture</span>
            <div class="ov-add-drop ov-add-drop-${kind}" id="ov-add-${kind}-box">
                <span class="ov-add-empty">No picture chosen</span>
            </div>
            <div class="ov-add-file-row">
                ${input}
            </div>
            <p class="ui-help" id="ov-add-${kind}-help">PNG or animated GIF, at most 10 MB. Best at ${size}. An animated GIF shows only its first frame here; the kiosk plays all of it.</p>
            <p class="ui-help is-error ov-add-error" id="ov-add-${kind}-error" hidden></p>
        </div>`;
    panel.innerHTML = `
        <form class="ov-add-form" id="ov-add-form" novalidate>
            <header class="ui-sidepanel-head">
                <div>
                    <h3 id="overlay-panel-title" tabindex="-1">Add an overlay</h3>
                    <p>Visitors can put it on their photo at the kiosk.</p>
                </div>
                <button type="button" class="ui-btn ui-btn-icon" data-ov-add="close" title="Close" aria-label="Close the add form">${uiIcon('close', 16)}</button>
            </header>
            <div class="ui-sidepanel-body">
                <p class="ov-add-alert" id="ov-add-alert" role="alert" hidden></p>
                <div class="ui-field">
                    <label class="ui-label" for="ov-add-name">Name</label>
                    <input type="text" class="ui-input" id="ov-add-name" maxlength="100" autocomplete="off" aria-describedby="ov-add-name-help">
                    <p class="ui-help" id="ov-add-name-help">Shown to visitors in the list of overlays.</p>
                    <p class="ui-help is-error ov-add-error" id="ov-add-name-error" hidden></p>
                </div>
                <div class="ui-field">
                    <label class="ui-label" for="ov-add-theme">Theme ID</label>
                    <input type="text" class="ui-input" id="ov-add-theme" maxlength="50" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="ov-add-theme-help">
                    <p class="ui-help" id="ov-add-theme-help">Lowercase letters and numbers only. It names the picture files. Filled in from the name until you change it.</p>
                    <p class="ui-help is-error ov-add-error" id="ov-add-theme-error" hidden></p>
                </div>
                ${picker('desktop', 'Desktop', '1920 × 1080', '<input type="file" class="pa-file" id="ov-add-desktop" accept=".png,.gif,image/png,image/gif" aria-labelledby="ov-add-desktop-label" aria-describedby="ov-add-desktop-help">')}
                ${picker('mobile', 'Mobile', '1080 × 1920', '<input type="file" class="pa-file" id="ov-add-mobile" accept=".png,.gif,image/png,image/gif" aria-labelledby="ov-add-mobile-label" aria-describedby="ov-add-mobile-help">')}
                <p class="ui-note ov-add-place">It goes at the end of the list, as number ${nextPlace}.</p>
            </div>
            <footer class="ui-sidepanel-foot">
                <button type="button" class="ui-btn ui-btn-secondary" data-ov-add="close">Cancel</button>
                <span class="ui-spacer"></span>
                <button type="submit" class="ui-btn ui-btn-primary" id="ov-add-submit">${uiIcon('plus', 15)}Add overlay</button>
            </footer>
        </form>`;
    panel.onclick = (event) => { if (event.target.closest('[data-ov-add="close"]')) closeAddOverlayModal(); };
    const form = panel.querySelector('#ov-add-form');
    form.addEventListener('submit', handleAddOverlay);
    const nameInput = panel.querySelector('#ov-add-name');
    const themeInput = panel.querySelector('#ov-add-theme');
    nameInput.addEventListener('input', () => {
        overlayAddFieldError('name', '');
        if (!overlayThemeTouched) { themeInput.value = nameInput.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50); overlayAddFieldError('theme', ''); }
    });
    themeInput.addEventListener('input', () => { overlayThemeTouched = true; overlayAddFieldError('theme', ''); });
    ['desktop', 'mobile'].forEach((kind) => panel.querySelector(`#ov-add-${kind}`).addEventListener('change', () => showOverlayUploadPreview(kind)));
    panel.hidden = false;
    document.getElementById('overlay-page')?.classList.add('ui-has-sidepanel');
    nameInput.focus({ preventScroll: true });
}

function overlayAddFieldError(field, message) {
    const error = document.getElementById(`ov-add-${field}-error`);
    const input = document.getElementById(`ov-add-${field}`);
    if (error) { error.textContent = message; error.hidden = !message; }
    if (input) {
        if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
        const help = `ov-add-${field}-help`;
        input.setAttribute('aria-describedby', message ? `${help} ov-add-${field}-error` : help);
    }
    return !message;
}

// what is wrong with a chosen picture, or '' when it is fine (the same rules as the server)
function overlayFileProblem(file, label) {
    if (!file) return `Choose a ${label} picture.`;
    const extension = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    if (!OVERLAY_TYPES.includes(file.type) || !['.png', '.gif'].includes(extension)) return 'This file is not a PNG or GIF picture.';
    if (file.size > OVERLAY_MAX_BYTES) return `This picture is ${(file.size / 1024 / 1024).toFixed(1)} MB. The most is 10 MB.`;
    return '';
}

// the chosen picture shows in its box, with its name and a Remove button. It is drawn into a canvas, so no address of the
// file goes into the page; an animated GIF shows its first frame.
async function showOverlayUploadPreview(kind) {
    const input = document.getElementById(`ov-add-${kind}`);
    const box = document.getElementById(`ov-add-${kind}-box`);
    if (!input || !box) return;
    clearOverlayUploadPreview(kind, false);
    const file = input.files && input.files[0];
    if (!file) return;
    const problem = overlayFileProblem(file, kind);
    overlayAddFieldError(kind, problem);
    if (problem) return;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    try {
        const bitmap = await createImageBitmap(file);
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        bitmap.close();
    } catch (error) {
        overlayAddFieldError(kind, 'This picture could not be read. Choose another file.');
        return;
    }
    if (input.files[0] !== file) return; // another file was chosen while this one was read
    box.classList.add('has-picture');
    // built from elements, so the file name is never read as HTML
    const fileName = document.createElement('span');
    fileName.className = 'ov-add-file-name';
    fileName.textContent = file.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ui-btn ui-btn-icon ov-add-remove';
    remove.setAttribute('aria-label', `Remove the ${kind} picture`);
    remove.title = 'Remove';
    remove.innerHTML = uiIcon('close', 14);
    remove.addEventListener('click', () => clearOverlayUploadPreview(kind));
    box.replaceChildren(canvas, fileName, remove);
}

function clearOverlayUploadPreview(kind, clearInput = true) {
    const input = document.getElementById(`ov-add-${kind}`);
    const box = document.getElementById(`ov-add-${kind}-box`);
    if (input && clearInput) { input.value = ''; overlayAddFieldError(kind, ''); input.focus(); }
    if (!box) return;
    box.classList.remove('has-picture');
    box.innerHTML = '<span class="ov-add-empty">No picture chosen</span>';
}

// a kit dialog gives the focus back to where it was once it has closed, so the focus is moved after that
function overlayAfterDialog() {
    return new Promise((resolve) => {
        const wait = () => (document.querySelector('dialog.ui-dialog') ? setTimeout(wait, 20) : resolve());
        wait();
    });
}

// typed values are asked about before they are dropped
async function closeAddOverlayModal(force = false) {
    if (!overlayAdding) return;
    const typed = ['ov-add-name', 'ov-add-theme'].some((id) => (document.getElementById(id)?.value || '').trim())
        || ['ov-add-desktop', 'ov-add-mobile'].some((id) => document.getElementById(id)?.files?.length);
    if (!force && typed && !(await uiConfirm({ title: 'Drop this overlay?', message: 'What you typed and the pictures you chose are not kept.', confirmText: 'Drop it', cancelText: 'Keep editing', danger: true }))) return;
    ['desktop', 'mobile'].forEach((kind) => clearOverlayUploadPreview(kind, false));
    overlayAdding = false;
    const panel = document.getElementById('overlay-panel');
    if (panel) { panel.hidden = true; panel.innerHTML = ''; panel.onclick = null; }
    document.getElementById('overlay-page')?.classList.remove('ui-has-sidepanel');
    const opener = overlayAddOpener;
    overlayAddOpener = null;
    await overlayAfterDialog();
    const back = opener && document.contains(opener) ? opener : document.querySelector('#overlay-page .ui-page-header .ui-btn-primary');
    back?.focus({ preventScroll: true });
}

async function handleAddOverlay(event) {
    event.preventDefault();
    const alertBox = document.getElementById('ov-add-alert');
    alertBox.hidden = true;
    const displayName = document.getElementById('ov-add-name').value.trim();
    const themeId = document.getElementById('ov-add-theme').value.trim();
    const desktop = document.getElementById('ov-add-desktop').files[0];
    const mobile = document.getElementById('ov-add-mobile').files[0];
    const checks = [
        overlayAddFieldError('name', displayName ? '' : 'Type a name.'),
        overlayAddFieldError('theme', !themeId ? 'Type a theme ID.'
            : !/^[a-z0-9]+$/.test(themeId) ? 'Use lowercase letters and numbers only, no spaces.'
                : overlayList.some((item) => String(item.theme_id) === themeId) ? 'Another overlay already uses this theme ID.' : ''),
        overlayAddFieldError('desktop', overlayFileProblem(desktop, 'desktop')),
        overlayAddFieldError('mobile', overlayFileProblem(mobile, 'mobile'))
    ];
    if (checks.includes(false)) {
        document.querySelector('#ov-add-form [aria-invalid="true"]')?.focus();
        return;
    }
    const submit = document.getElementById('ov-add-submit');
    submit.disabled = true;
    submit.lastChild.textContent = 'Adding...';
    const username = sessionStorage.getItem('loggedUser');
    try {
        // the theme ID goes before the files: the server names the files after it while they arrive
        const formData = new FormData();
        formData.append('display_name', displayName);
        formData.append('theme_id', themeId);
        formData.append('desktop_file', desktop);
        formData.append('mobile_file', mobile);
        formData.append('username', username);
        const response = await fetch('/api/admin/overlays', { method: 'POST', headers: { 'x-username': username }, body: formData });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`);
        await closeAddOverlayModal(true);
        showNotification(`Overlay "${displayName}" added.`, 'success');
        await loadOverlayData();
        if (data.overlay && data.overlay.id) openOverlayPanel(data.overlay.id);
    } catch (error) {
        console.error('Error adding overlay:', error);
        alertBox.textContent = `The overlay was not added: ${error.message}`;
        alertBox.hidden = false;
        submit.disabled = false;
        submit.lastChild.textContent = 'Add overlay';
    }
}
// <Jun Kai end>

// Delete overlay (System Admin only)
// <Jun Kai start> the kit confirm names the overlay; a dangerous step starts on Cancel
async function deleteOverlay(overlayId) {
    if (sessionStorage.getItem('userRole') !== 'system_admin') {
        showNotification('Only a System Admin can delete overlays.', 'error');
        return;
    }
    const overlay = overlayList.find((item) => Number(item.id) === Number(overlayId));
    const name = overlay ? (overlay.display_name || overlay.theme_id) : 'this overlay';
    const sure = await uiConfirm({
        title: `Delete ${overlay ? `"${name}"` : name}?`,
        message: 'Visitors can no longer pick it at the kiosk. This cannot be undone.',
        confirmText: 'Delete overlay',
        danger: true
    });
    if (sure) await performOverlayDeletion(overlayId, name);
}
// <Jun Kai end>

// Execute overlay deletion
async function performOverlayDeletion(overlayId, name = 'The overlay') {
    const username = sessionStorage.getItem('loggedUser');
    
    try {
        const response = await fetch(`/api/admin/overlays/${overlayId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'x-username': username
            }
        });
        
        const data = await response.json();
        
        // <Jun Kai start> a short note instead of an alert box; the details of a deleted overlay close
        if (data.success) {
            if (overlayOpenId === Number(overlayId)) closeOverlayPanel(false);
            showNotification(`${name === 'this overlay' ? 'The overlay' : `"${name}"`} was deleted.`, 'success');
            await loadOverlayData();
            // the button that asked is gone with the overlay: the focus goes to the first card, or to Add overlay
            await overlayAfterDialog();
            (document.querySelector('#overlay-page .ov-card .ov-name') || document.querySelector('#overlay-page .ui-page-header .ui-btn-primary'))?.focus({ preventScroll: true });
        } else {
            showNotification(`The overlay was not deleted: ${data.error || 'unknown error'}.`, 'error');
        }
    } catch (error) {
        console.error('Error deleting overlay:', error);
        showNotification(`The overlay was not deleted: ${error.message}.`, 'error');
    }
    // <Jun Kai end>
}

