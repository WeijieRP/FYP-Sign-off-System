// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The list of visitor submissions with its side panel, as drawn since the admin redesign (list style A). The Feedback
// page and the Archived Feedback page show the same kind of record, so both use this one file:
//   const feedbackView = makeSubmissionList({ ... });   (feedback.js)
//   const archiveView = makeSubmissionList({ ... });    (archive.js)
// Loading, filtering, sorting and the email buttons stay in each page's own script; this file only draws the rows, the
// pager and the panel, and keeps the panel in step with the list. A page tells it where its data lives through `cfg`:
//   key        'feedback' | 'archive': the ids are `${key}-table-body`, `${key}-panel`, `${key}-page-info`,
//              `prev-${key}-btn`, `next-${key}-btn`, `${key}-status`, `${key}-clear-filters`, `${key}-date-button`,
//              `${key}-date-label`, `${key}-date-pop`, `${key}-filter-date-from|to|email|visits|retention`, `${key}-search-input`
//   name       the name of the global variable that holds the view (used by the buttons this file writes)
//   pageId     the id of the page's <div class="page">
//   all/setAll, list/setList, page/setPage, perPage     the page's own state (all records, filtered records, page number)
//   decrypted, resetDecrypted, markDecrypted, setEncryptedIds, updateButtons     the email state kept by encryption.js
//   remove(id) asks for the password and deletes one record (feedbackDeletion.js)
//   clearFilters, refilter     the page's own functions
//   tickColumn true: the table starts with a tick column; canTick() decides if the role gets the boxes (class
//              cfg.tickClass) and onTick() runs after a change
//   columns    how many columns the table has; emptyText / filteredText for an empty list
const SUBMISSION_AVATAR_HUES = [262, 168, 334, 28, 214, 150, 12, 232];

function submissionHasEmail(feedback) {
    const text = String(feedback.email_encrypted || '').trim();
    return text !== '' && text.toLowerCase() !== 'no email provided';
}

function submissionInitials(name) {
    // letters and digits only, so a name with quotes or brackets still gets readable initials
    const words = String(name || '').split(/\s+/).map((word) => word.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
    if (!words.length) return '?';
    return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

function submissionDateText(feedback) {
    const date = new Date(feedback.date);
    if (Number.isNaN(date.getTime())) return 'Date unknown';
    return date.toLocaleString('en-SG', { timeZone: 'Asia/Singapore', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function submissionKeptBadge(feedback) {
    const retention = feedback.data_retention || 'longterm';
    return retention === '7days' || retention === '7day'
        ? '<span class="badge badge-warning">7 days</span>'
        : '<span class="badge badge-permanent">Long-term</span>';
}

// a small picture made by the server (GET /api/admin/feedback/:id/thumb/:kind), so a page of 25 rows does not load 50 full photos
function submissionThumb(feedback, kind) {
    const has = kind === 'raw' ? feedback.photo_path : feedback.processed_photo_path;
    const what = kind === 'raw' ? 'Raw photo' : 'Processed photo';
    if (!has) return `<span class="ui-thumb ui-thumb-none" title="No ${what.toLowerCase()}">${uiIcon('image', 14)}</span>`;
    return `<img class="ui-thumb" loading="lazy" decoding="async" width="40" height="40" src="/api/admin/feedback/${Number(feedback.id)}/thumb/${kind}" alt="${what} of ${escapeHtmlSafe(feedback.name || 'Anonymous')}" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'ui-thumb ui-thumb-none', title: 'The photo file is missing' }))">`;
}

function makeSubmissionList(cfg) {
    const el = (suffix) => document.getElementById(suffix);
    const tbody = () => el(`${cfg.key}-table-body`);
    const panel = () => el(`${cfg.key}-panel`);
    const pageEl = () => el(cfg.pageId);
    const rowOf = (id) => document.querySelector(`#${cfg.key}-table-body tr[data-feedback-id="${id}"]`);
    const canDelete = () => (cfg.canDelete ? cfg.canDelete() : ['IT_admin', 'system_admin'].includes(sessionStorage.getItem('userRole')));
    const view = { openId: null }; // openId: the submission the side panel shows, null while it is closed

    // the line under a visitor's name: the email once it is decrypted, "Encrypted" while it is locked, or "No email"
    function emailLine(feedback) {
        const open = cfg.decrypted()[feedback.id];
        if (open) return `<span class="fb-email fb-email-open">${uiIcon('unlock', 12)}${escapeHtmlSafe(open)}</span>`;
        if (submissionHasEmail(feedback)) return `<span class="fb-email">${uiIcon('lock', 12)}Encrypted</span>`;
        return '<span class="fb-email fb-email-none">No email</span>';
    }

    // Shows which filters are set: a set filter is tinted, the date filter names its range, and Clear filters appears
    view.showFilterState = (activeFilters) => {
        const clear = el(`${cfg.key}-clear-filters`);
        if (clear) clear.hidden = activeFilters === 0;
        for (const name of ['email', 'visits', 'retention']) {
            const select = el(`${cfg.key}-filter-${name}`);
            if (select) select.classList.toggle('is-set', select.value !== '');
        }
        const from = el(`${cfg.key}-filter-date-from`)?.value || '';
        const to = el(`${cfg.key}-filter-date-to`)?.value || '';
        const label = el(`${cfg.key}-date-label`);
        const day = (text) => new Date(text + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
        if (label) label.textContent = from && to ? (from === to ? day(from) : `${day(from)} to ${day(to)}`) : from ? `From ${day(from)}` : to ? `Until ${day(to)}` : 'Any date';
        el(`${cfg.key}-date-button`)?.classList.toggle('is-set', !!(from || to));
    };

    view.clearDates = () => {
        for (const name of ['from', 'to']) {
            const input = el(`${cfg.key}-filter-date-${name}`);
            if (input) input.value = '';
        }
        cfg.refilter();
    };

    view.pager = (totalItems, totalPages) => {
        const prevBtn = el(`prev-${cfg.key}-btn`);
        const nextBtn = el(`next-${cfg.key}-btn`);
        const pageInfo = el(`${cfg.key}-page-info`);
        if (prevBtn) prevBtn.disabled = cfg.page() <= 1;
        if (nextBtn) nextBtn.disabled = cfg.page() >= totalPages || totalPages === 0;
        if (pageInfo) {
            const first = (cfg.page() - 1) * cfg.perPage + 1;
            const last = Math.min(totalItems, cfg.page() * cfg.perPage);
            const filtered = totalItems !== cfg.all().length ? ` (${cfg.all().length} in total)` : '';
            pageInfo.textContent = totalItems > 0 ? `Showing ${first} to ${last} of ${totalItems}${filtered}` : 'Nothing to show';
        }
    };

    // Draws the current page of the list (25 records)
    view.render = () => {
        const body = tbody();
        if (!body) return;
        const list = cfg.list();

        // while a submission is open, the table shows the page that submission is on
        const openAt = view.openId === null ? -1 : list.findIndex((item) => Number(item.id) === view.openId);
        if (openAt >= 0) cfg.setPage(Math.floor(openAt / cfg.perPage) + 1);

        const totalPages = Math.ceil(list.length / cfg.perPage);
        const startIndex = (cfg.page() - 1) * cfg.perPage;
        const pageData = list.slice(startIndex, startIndex + cfg.perPage);

        // the encrypted emails of this page only: Decrypt works page by page
        cfg.setEncryptedIds(pageData.filter(submissionHasEmail).map((item) => item.id));

        if (list.length === 0) {
            const none = cfg.all().length === 0;
            body.innerHTML = `<tr><td colspan="${cfg.columns}" class="ui-empty">${none ? cfg.emptyText : `${cfg.filteredText} <button type="button" class="ui-link" onclick="${cfg.clearFilters}">Clear filters</button>`}</td></tr>`;
            view.pager(0, 0);
            cfg.updateButtons();
            view.sync();
            if (cfg.onTick) cfg.onTick();
            return;
        }

        const mayDelete = canDelete();
        const mayTick = cfg.tickColumn && cfg.canTick ? cfg.canTick() : false;
        body.innerHTML = pageData.map((feedback) => {
            const id = Number(feedback.id);
            const name = feedback.name || 'Anonymous';
            const pledge = String(feedback.pledge || '').trim();
            const typed = getFeedbackAnswerPreview(feedback);
            const answers = Array.isArray(feedback.question_answers) ? feedback.question_answers.length : 0;
            const tick = !cfg.tickColumn ? '' : `<td class="col-tick">${mayTick ? `<input type="checkbox" class="${cfg.tickClass}" value="${id}" aria-label="Select the submission of ${escapeHtmlSafe(name)}">` : ''}</td>`;
            return `<tr data-feedback-id="${id}" data-retention="${escapeHtmlSafe(feedback.data_retention || 'longterm')}" tabindex="0" aria-label="Open the submission of ${escapeHtmlSafe(name)}"${id === view.openId ? ' class="is-open"' : ''}>
            ${tick}<td class="col-visitor"><span class="ui-who"><span class="ui-avatar" style="--ui-hue: ${SUBMISSION_AVATAR_HUES[id % SUBMISSION_AVATAR_HUES.length]}" aria-hidden="true">${escapeHtmlSafe(submissionInitials(name))}</span><span class="ui-who-text"><b title="${escapeHtmlSafe(name)}">${escapeHtmlSafe(name)}</b>${emailLine(feedback)}</span></span></td>
            <td class="ui-num col-visits">${Number(feedback.visits) || 1}</td>
            <td class="fb-wrap col-pledge">${pledge ? `<span class="ui-clamp">${escapeHtmlSafe(pledge)}</span>` : '<span class="ui-muted">No pledge</span>'}</td>
            <td class="fb-wrap col-typed">${typed ? `<span class="ui-clamp">${escapeHtmlSafe(typed)}</span>` : '<span class="ui-muted">No typed feedback</span>'}${answers ? `<button type="button" class="ui-link" data-fb-answers>${answers} ${answers === 1 ? 'answer' : 'answers'}</button>` : ''}</td>
            <td class="col-kept">${submissionKeptBadge(feedback)}</td>
            <td class="col-photos"><span class="ui-thumbs">${submissionThumb(feedback, 'raw')}${submissionThumb(feedback, 'processed')}</span></td>
            <td class="ui-time fb-date-cell col-date">${escapeHtmlSafe(submissionDateText(feedback))}</td>
            <td class="col-bin"><span class="ui-actions">${mayDelete ? `<button type="button" class="ui-btn ui-btn-icon ui-danger" data-fb-delete title="Delete this submission" aria-label="Delete the submission of ${escapeHtmlSafe(name)}">${uiIcon('trash', 15)}</button>` : ''}</span></td>
        </tr>`;
        }).join('');

        view.pager(list.length, totalPages);
        cfg.updateButtons();
        view.sync();
        if (cfg.onTick) cfg.onTick();
    };

    // one listener for the whole list: a click or Enter on a row opens its panel, the bin deletes, "3 answers" opens the panel at the answers
    function rowAction(event) {
        const row = event.target.closest('tr[data-feedback-id]');
        if (!row) return;
        const id = Number(row.dataset.feedbackId);
        if (event.type === 'keydown') {
            if ((event.key !== 'Enter' && event.key !== ' ') || event.target !== row) return;
            event.preventDefault();
            return view.open(id);
        }
        if (event.target.closest('[data-fb-delete]')) return cfg.remove(id);
        if (event.target.closest('a, input, select, label, .col-tick')) return;
        if (String(window.getSelection ? window.getSelection() : '').trim()) return; // text was selected by dragging: not a click on the row
        view.open(id, event.target.closest('[data-fb-answers]') ? 'answers' : undefined);
    }

    // ---- the side panel: one submission in full

    function panelPhoto(feedback, kind) {
        const rel = kind === 'raw' ? feedback.photo_path : feedback.processed_photo_path;
        const what = kind === 'raw' ? 'Raw photo' : 'Processed photo';
        if (!rel) return `<figure class="fb-photo-box"><div class="fb-photo fb-photo-none">${uiIcon('image', 22)}<span>No ${what.toLowerCase()}</span></div><figcaption><span>${what}</span></figcaption></figure>`;
        const url = '/uploads/' + String(rel).split('/').map(encodeURIComponent).join('/');
        const ext = (String(rel).match(/\.[a-z0-9]+$/i) || ['.png'])[0];
        const open = kind === 'raw' ? 'viewRawPhoto' : 'viewProcessedPhoto';
        return `<figure class="fb-photo-box">
        <button type="button" class="fb-photo" onclick="${open}(${Number(feedback.id)})" title="Open the full photo"><img src="${escapeHtmlSafe(url)}" loading="lazy" decoding="async" alt="${what} of ${escapeHtmlSafe(feedback.name || 'Anonymous')}" onerror="this.closest('.fb-photo').classList.add('fb-photo-missing')"></button>
        <figcaption><span>${what}</span><button type="button" class="ui-link" data-fb-download="${escapeHtmlSafe(url)}" data-fb-file="feedback_${Number(feedback.id)}_${kind}_photo${escapeHtmlSafe(ext)}">Download</button></figcaption>
    </figure>`;
    }

    function panelHtml(feedback) {
        const id = Number(feedback.id);
        const list = cfg.list();
        const name = feedback.name || 'Anonymous';
        const pledge = String(feedback.pledge || '').trim();
        const typed = getFeedbackAnswerPreview(feedback);
        const answers = Array.isArray(feedback.question_answers) ? feedback.question_answers : [];
        const index = list.findIndex((item) => Number(item.id) === id);
        const retention = feedback.data_retention || 'longterm';
        const admin = sessionStorage.getItem('userRole') === 'system_admin';
        const p = `${cfg.key}-panel`;
        const open = cfg.decrypted()[feedback.id];
        const email = open
            ? `<span class="fb-email fb-email-open">${uiIcon('unlock', 12)}${escapeHtmlSafe(open)}</span>`
            : submissionHasEmail(feedback)
                ? `<span class="fb-email">${uiIcon('lock', 12)}Encrypted</span>${admin ? ` <button type="button" class="ui-link" onclick="${cfg.name}.decryptOne(${id})">Decrypt</button>` : ''}`
                : 'No email provided';
        const answerRows = answers.map((answer, n) => {
            const value = answer && (answer.option_label || answer.answer_value);
            const type = String((answer && answer.question_type) || '').toLowerCase();
            const translate = value && type === 'text' && adminAiAllows('translate')
                ? `<button type="button" class="ui-link" onclick="translateAdminTextToEnglish('${p}-answer-${n}', '${p}-answer-english-${n}', this)">Translate to English</button><div class="ui-text fb-translated" id="${p}-answer-english-${n}" aria-live="polite"></div>`
                : '';
            return `<li><small>${escapeHtmlSafe((answer && answer.question_text) || `Question ${n + 1}`)}</small><span id="${p}-answer-${n}">${value ? formatAnswer(String(value), type) : '<em>No answer</em>'}</span>${translate}</li>`;
        }).join('');
        return `
        <header class="ui-sidepanel-head">
            <div>
                <h3 id="${p}-title" tabindex="-1">${escapeHtmlSafe(name)}</h3>
                <p>Submitted ${escapeHtmlSafe(submissionDateText(feedback))}</p>
            </div>
            <button type="button" class="ui-btn ui-btn-icon" onclick="${cfg.name}.close()" title="Close" aria-label="Close this submission">${uiIcon('close', 16)}</button>
        </header>
        <div class="ui-sidepanel-body">
            <div class="fb-photos">${panelPhoto(feedback, 'raw')}${panelPhoto(feedback, 'processed')}</div>
            <section>
                <h4>Pledge</h4>
                ${pledge
                    ? `<div class="ui-text fb-quote" id="${p}-pledge">${escapeHtmlSafe(pledge)}</div>${adminAiAllows('translate') ? `
                       <button type="button" class="ui-link" onclick="translateAdminTextToEnglish('${p}-pledge', '${p}-pledge-english', this)">Translate to English</button>
                       <div class="ui-text fb-translated" id="${p}-pledge-english" aria-live="polite"></div>` : ''}`
                    : '<div class="ui-text ui-muted">No pledge</div>'}
            </section>
            <section>
                <h4>Typed feedback</h4>
                <div class="ui-text${typed ? '' : ' ui-muted'}">${typed ? escapeHtmlSafe(typed) : 'No typed feedback'}</div>
            </section>
            <section id="${p}-answers">
                <h4>Questions and answers</h4>
                ${answerRows ? `<ul class="fb-answers">${answerRows}</ul>` : '<div class="ui-text ui-muted">No answers</div>'}
            </section>
            <dl class="ui-kv fb-facts">
                <dt>Email</dt><dd>${email}</dd>
                <dt>Visits</dt><dd>${Number(feedback.visits) || 1}</dd>
                <dt>Data retention</dt><dd>${retention === '7days' || retention === '7day' ? '7 days' : 'Long-term use'}</dd>
                <dt>Submitted</dt><dd>${escapeHtmlSafe(submissionDateText(feedback))}</dd>
            </dl>
        </div>
        <footer class="ui-sidepanel-foot">
            ${canDelete() ? `<button type="button" class="ui-btn ui-btn-danger" onclick="${cfg.name}.removeOpen()">${uiIcon('trash', 15)}Delete this submission</button>` : '<span class="ui-muted">View only</span>'}
            <span class="ui-spacer"></span>
            <button type="button" class="ui-btn ui-btn-secondary" onclick="${cfg.name}.step(-1)"${index <= 0 ? ' disabled' : ''}>Previous</button>
            <button type="button" class="ui-btn ui-btn-secondary" onclick="${cfg.name}.step(1)"${index < 0 || index >= list.length - 1 ? ' disabled' : ''}>Next</button>
        </footer>`;
    }

    // part: 'answers' scrolls the panel to the questions and answers
    view.open = (feedbackId, part) => {
        const id = Number(feedbackId);
        const feedback = cfg.list().find((item) => Number(item.id) === id);
        const side = panel();
        if (!feedback || !side) return;
        if (cfg.beforeOpen) cfg.beforeOpen(); // a page with a second panel closes that one first
        view.openId = id;
        side.innerHTML = panelHtml(feedback);
        side.hidden = false;
        document.querySelectorAll(`#${cfg.key}-table-body tr.is-open`).forEach((row) => row.classList.remove('is-open'));
        pageEl()?.classList.add('ui-has-sidepanel');
        const openRow = rowOf(id);
        if (openRow) { openRow.classList.add('is-open'); openRow.scrollIntoView({ block: 'nearest' }); }
        if (part === 'answers') el(`${cfg.key}-panel-answers`)?.scrollIntoView({ block: 'start' });
        else side.querySelector('.ui-sidepanel-body').scrollTop = 0;
        el(`${cfg.key}-panel-title`)?.focus({ preventScroll: true });
    };

    // refocus: false when the list is about to be drawn again (a page turn), so the keyboard is not sent to a row that is going away
    view.close = (refocus = true) => {
        const side = panel();
        const id = view.openId;
        view.openId = null;
        if (side) { side.hidden = true; side.innerHTML = ''; }
        if (!cfg.keepRoom || !cfg.keepRoom()) pageEl()?.classList.remove('ui-has-sidepanel');
        if (!refocus) return;
        const row = id === null ? null : rowOf(id);
        document.querySelectorAll(`#${cfg.key}-table-body tr.is-open`).forEach((open) => open.classList.remove('is-open'));
        if (row) row.focus({ preventScroll: true }); // back to where the reader was in the list
    };

    // Previous / Next walk the filtered list in its current order, turning the page of the table when needed
    view.step = (step) => {
        const list = cfg.list();
        const index = list.findIndex((item) => Number(item.id) === view.openId);
        const next = list[index + step];
        if (index < 0 || !next) return;
        const page = Math.floor((index + step) / cfg.perPage) + 1;
        if (page !== cfg.page()) {
            cfg.setPage(page);
            view.openId = Number(next.id);
            cfg.resetDecrypted(); // a new page: its emails are locked, exactly as when the pager turns the page
            view.render();
        }
        view.open(next.id);
    };

    // after the list was drawn again (a filter, a sort, emails decrypted, a delete): the open panel follows, or closes when its submission is gone
    view.sync = () => {
        if (view.openId === null) return;
        const side = panel();
        const feedback = cfg.list().find((item) => Number(item.id) === view.openId);
        if (!feedback) return view.close();
        if (!side || side.hidden) return;
        const scroll = side.querySelector('.ui-sidepanel-body')?.scrollTop || 0;
        side.innerHTML = panelHtml(feedback);
        const body = side.querySelector('.ui-sidepanel-body');
        if (body) body.scrollTop = scroll;
    };

    view.removeOpen = () => { if (view.openId !== null) cfg.remove(view.openId); };

    // Decrypt the email of one visitor, from the panel (the toolbar button does the whole page)
    view.decryptOne = async (feedbackId) => {
        if (sessionStorage.getItem('userRole') !== 'system_admin') return;
        // the password window decrypts while it stays open, so a wrong password shows under the field (encryption.js)
        let email = null;
        const password = await showPasswordPrompt('Decrypt the email of this visitor?\n\nEnter your System Admin password:', {
            confirmText: 'Decrypt',
            check: async (value) => {
                if (email) return null; // a second Enter while the window closes asks nothing again
                const data = await requestDecryptedEmail(feedbackId, value);
                if (!data.success || !data.decryptedEmail) return data.error || 'The email could not be decrypted. Check the password and try again.';
                email = data.decryptedEmail;
                return null;
            }
        });
        if (!password || !email) return;
        cfg.markDecrypted(feedbackId, email);
        view.render();
    };

    // After a delete (feedbackDeletion.js): the list stays on its page, and an open panel moves on to the next submission
    view.deleted = (feedbackId) => {
        const id = Number(feedbackId);
        const list = cfg.list();
        const index = list.findIndex((item) => Number(item.id) === id);
        const gone = cfg.all().find((item) => Number(item.id) === id);
        const neighbour = index >= 0 ? (list[index + 1] || list[index - 1] || null) : null;
        cfg.setAll(cfg.all().filter((item) => Number(item.id) !== id));
        cfg.setList(list.filter((item) => Number(item.id) !== id));
        const pages = Math.max(1, Math.ceil(cfg.list().length / cfg.perPage));
        if (cfg.page() > pages) cfg.setPage(pages);
        const panelWasOnIt = view.openId === id;
        if (panelWasOnIt && !neighbour) view.close(false);
        if (panelWasOnIt && neighbour) view.openId = Number(neighbour.id);
        view.render();
        view.say(`Deleted the submission of ${gone && gone.name ? gone.name : 'the visitor'}.`);
        // the keyboard lands on the panel that moved on, or on the row that took the deleted row's place
        if (view.openId !== null) return el(`${cfg.key}-panel-title`)?.focus({ preventScroll: true });
        const rows = document.querySelectorAll(`#${cfg.key}-table-body tr[data-feedback-id]`);
        const at = index >= 0 ? index - (cfg.page() - 1) * cfg.perPage : 0;
        (rows[Math.max(0, Math.min(rows.length - 1, at))] || el(`${cfg.key}-search-input`))?.focus({ preventScroll: true });
    };

    // a short line beside the pager, read out by a screen reader, gone after a few seconds
    view.say = (text) => {
        const status = el(`${cfg.key}-status`);
        if (!status) return;
        status.textContent = text;
        clearTimeout(view.sayTimer);
        view.sayTimer = setTimeout(() => { status.textContent = ''; }, 6000);
    };

    document.addEventListener('DOMContentLoaded', () => {
        const body = tbody();
        if (body) { body.addEventListener('click', rowAction); body.addEventListener('keydown', rowAction); }
        if (body && cfg.tickColumn) body.addEventListener('change', (event) => { if (event.target.classList.contains(cfg.tickClass) && cfg.onTick) cfg.onTick(); });
        const side = panel();
        if (side) side.addEventListener('click', (event) => {
            const download = event.target.closest('[data-fb-download]');
            if (download) downloadPhoto(download.dataset.fbDownload, download.dataset.fbFile);
        });
        // icons of the fixed markup (uiKit.js is loaded before this file)
        document.querySelectorAll(`#${cfg.pageId} [data-fb-icon]`).forEach((slot) => { slot.innerHTML = uiIcon(slot.dataset.fbIcon, slot.tagName === 'BUTTON' ? 15 : 14); });
        // the date filter's small window opens under its button
        const pop = el(`${cfg.key}-date-pop`);
        const chip = el(`${cfg.key}-date-button`);
        if (pop && chip) pop.addEventListener('toggle', (event) => {
            if (event.newState !== 'open') return;
            uiPlaceUnder(pop, chip);
        });
    });
    // Esc closes the panel, unless a window above it (photo viewer, password, email, delete check) is open: that one closes first.
    // The key is looked at on its way down (capture), before such a window removes itself, so one Esc never closes both.
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || view.openId === null) return;
        if (document.querySelector(`dialog[open], .photo-popup, .pledge-popup, .qa-popup, .email-popup, .delete-access-modal, .password-prompt-modal, #ui-info-pop:popover-open, #${cfg.key}-date-pop:popover-open`)) return;
        view.close();
    }, true);

    return view;
}
// <Jun Kai end>
