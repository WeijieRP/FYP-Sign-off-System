// Owner: Role 3, Jun Kai. Previous team: Bernissa (2), Caeden (1).
// Part 28/30 of the admin page: server schedules and server control (load order in admin.html).
// ==================== 30. SERVER SCHEDULE MANAGEMENT (DONE BY BERNISSA) ====================

// <Jun Kai start>
// Policies since supervisor meeting 03 (4 Nov 2026): each one is Active (the kiosk runs) or Stop (the kiosk is off).
// The list order is the priority. The server places new policies and checks every save
// (backend/features/serverControl/policies.js); this page shows them, lets you drag them and previews the week.
let schedulesData = [];
let currentScheduleId = null;
let policyDrag = null;
let policyOrderSaving = false;
let policyFormTried = false;
let policyFormTimes = { start: '08:00', end: '18:00' };
let policyPendingList = null;
let policyPreviewKey = null;
let policyPreviewStart = null; // the first day of the preview when it is not today
let policyPreviewShown = null;

const POLICY_DAYS = [[2, 'Mon'], [3, 'Tue'], [4, 'Wed'], [5, 'Thu'], [6, 'Fri'], [7, 'Sat'], [1, 'Sun']];
const POLICY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// <Jun Kai start>
// A colour per policy (12 Nov 2026 design): [name, solid for bars and dots, tint and text for calendar chips]. The same
// keys as COLORS in backend/features/serverControl/policies.js. Stop policies are always grey.
const POLICY_COLORS = {
    blue: ['Blue', '#1f6fd0', '#dbe9fd', '#1857a8'],
    green: ['Green', '#15803d', '#d6f1df', '#166534'],
    purple: ['Purple', '#8a3c8f', '#f2ddf2', '#7a2f7f'],
    orange: ['Orange', '#b45309', '#fde7d3', '#9a4a12'],
    teal: ['Teal', '#0f766e', '#d3f0ec', '#115e59'],
    rose: ['Rose', '#be3a5f', '#fbdde6', '#9f1d47'],
    indigo: ['Indigo', '#4f46e5', '#e2e1fc', '#3730a3'],
    amber: ['Amber', '#a16207', '#fbedc4', '#854d0e'],
    cyan: ['Cyan', '#0e7490', '#d2eef6', '#155e75'],
    brown: ['Brown', '#7c5a3c', '#efe6dd', '#5b4030']
};
const POLICY_COLOR_KEYS = Object.keys(POLICY_COLORS);
// a policy (or a preview segment, which carries id and color) without a saved colour gets one from its id
const policyColorKey = (p) => (POLICY_COLORS[p.color] ? p.color : POLICY_COLOR_KEYS[Math.abs(Number(p.id) || 0) % POLICY_COLOR_KEYS.length]);
const policyColor = (p) => POLICY_COLORS[policyColorKey(p)];
let policyView = policyStoredView(); // 'month' or 'week', remembered in this browser only
let policyMonth = null;              // 'YYYY-MM' when the month shown is not this month
let policyMonthKey = null;
// <Jun Kai end>

function startServerStatusPolling() {
    if (window.statusCheckInterval) clearInterval(window.statusCheckInterval);
    window.statusCheckInterval = setInterval(checkServerStatus, 10000);
    if (window.automationStatusInterval) clearInterval(window.automationStatusInterval);
    window.automationStatusInterval = setInterval(() => {
        loadAutomationStatus();
        loadPolicyPreview();
    }, 60000);
}

document.addEventListener('DOMContentLoaded', function() {
    // Only when a session was restored; a fresh login goes through showPage('server-schedule')
    if (document.getElementById('server-schedule-page') && sessionStorage.getItem('loggedUser')) {
        loadSchedules();
        loadServerMode();
        checkServerStatus();
        startServerStatusPolling();
    }
});

// ---------------------------------------------------------------- wording
function policyNumbers(value) {
    return String(value === null || value === undefined ? '' : value).split(',').map((v) => Number(v.trim())).filter((n) => Number.isInteger(n) && n > 0);
}

const policyIsStop = (p) => p.action === 'stop';
const policyIsAllDay = (p) => p.all_day === true || (p.start_time === '00:00' && p.end_time === '00:00');

// Every weekday on its own, Monday first (meeting 03: no "Weekdays" group)
function policyDaysText(value) {
    const picked = policyNumbers(value);
    return POLICY_DAYS.filter(([n]) => picked.includes(n)).map(([, name]) => name).join(', ');
}

function policyMonthsText(value) {
    return policyNumbers(value).filter((n) => n <= 12).map((n) => POLICY_MONTHS[n - 1]).join(', ');
}

function policyDateText(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
    if (!m) return '';
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function policyRepeatText(p) {
    if (p.schedule_type === 'weekly') return policyDaysText(p.days_of_week) || 'No day picked';
    if (p.schedule_type === 'monthly') return `Every day in ${policyMonthsText(p.months) || 'no month'}`;
    if (p.schedule_type === 'specific_date') return policyDateText(p.specific_date) || 'No date picked';
    return 'Every day';
}

function policyHoursText(p) {
    if (policyIsAllDay(p)) return 'All day';
    return `${p.start_time}–${p.end_time}${String(p.end_time) <= String(p.start_time) ? ' next day' : ''}`;
}

// ---------------------------------------------------------------- list
function loadSchedules(highlightId) {
    return fetch('/api/admin/server-schedules', { cache: 'no-store' })
        .then((response) => response.json().then((data) => ({ response, data })))
        .then(({ response, data }) => {
            if (!response.ok || !data.success) throw new Error(data.error || 'Could not load the policies');
            schedulesData = data.schedules;
            renderPolicies(schedulesData);
            if (highlightId) flashPolicy(highlightId);
        })
        .catch((error) => {
            console.error('❌ Error loading policies:', error);
            const list = document.getElementById('policy-list');
            if (list) list.innerHTML = `<li class="policy-empty">${escapeHtmlSafe(error.message)}</li>`;
        })
        .finally(() => {
            loadAutomationStatus();
            loadPolicyPreview();
        });
}

function renderPolicies(list) {
    const ol = document.getElementById('policy-list');
    if (!ol) return;
    if (policyDrag) {
        policyPendingList = list;
        return;
    }
    initPolicyDrag(ol);
    // Default order, Enable all and Disable all have nothing to act on in an empty list
    document.querySelectorAll('#policies-card .ui-card-header .ui-btn').forEach((btn) => { btn.disabled = !list || !list.length; });
    if (!list || !list.length) {
        ol.innerHTML = '<li class="policy-empty"><p>No policies yet, so nothing switches the kiosk on or off by itself.</p><button type="button" class="ui-btn ui-btn-secondary" onclick="showAddScheduleModal()">New policy</button></li>';
        return;
    }
    ol.innerHTML = list.map((p, i) => policyRowHtml(p, i, list.length)).join('');
}

function policyRowHtml(p, index, total) {
    const id = Number(p.id);
    const name = escapeHtmlSafe(p.schedule_name);
    const enabled = p.is_active !== false;
    return `<li class="policy-row${enabled ? '' : ' is-disabled'}" data-id="${id}">
            <button type="button" class="policy-handle" aria-label="Move ${name}, priority ${index + 1} of ${total}. Use the up and down arrow keys." title="Drag to change the priority">${uiIcon('grip', 16)}</button>
            <span class="policy-rank">${index + 1}</span>
            <div><div class="policy-name"><span class="policy-dot" style="background:${policyIsStop(p) ? '#94a3b8' : policyColor(p)[1]}" aria-hidden="true"></span>${name}</div><div class="policy-meta">${escapeHtmlSafe(policyRepeatText(p))}</div></div>
            <div>${policyIsStop(p) ? uiPill('down', 'Stop') : uiPill('ok', 'Active')}</div>
            <div class="policy-hours">${escapeHtmlSafe(policyHoursText(p))}</div>
            <label class="ui-switch" title="${enabled ? 'Enabled' : 'Disabled'}"><input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleScheduleStatus(${id}, this.checked)" aria-label="${name} enabled"><span class="ui-switch-track"></span></label>
            <div class="policy-actions">
                <button type="button" class="ui-btn ui-btn-icon" onclick="editSchedule(${id})" title="Edit" aria-label="Edit ${name}">${uiIcon('edit')}</button>
                <button type="button" class="ui-btn ui-btn-icon ui-danger" onclick="deleteSchedule(${id})" title="Delete" aria-label="Delete ${name}">${uiIcon('trash')}</button>
            </div>
        </li>`;
}

function flashPolicy(id) {
    const row = document.querySelector(`#policy-list .policy-row[data-id="${Number(id)}"]`);
    if (!row) return;
    row.classList.remove('is-new');
    row.getBoundingClientRect();
    row.classList.add('is-new');
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function policyRows(ol) {
    return [...ol.querySelectorAll('.policy-row')];
}

function renumberPolicies(ol) {
    const rows = policyRows(ol);
    rows.forEach((row, i) => {
        const rank = row.querySelector('.policy-rank');
        if (rank) rank.textContent = String(i + 1);
        const handle = row.querySelector('.policy-handle');
        const name = row.querySelector('.policy-name');
        if (handle && name) handle.setAttribute('aria-label', `Move ${name.textContent}, priority ${i + 1} of ${rows.length}. Use the up and down arrow keys.`);
    });
}

// ---------------------------------------------------------------- form
function showAddScheduleModal() {
    currentScheduleId = null;
    fillPolicyForm({ schedule_name: '', action: 'active', schedule_type: 'daily', start_time: '08:00', end_time: '18:00', is_active: true, color: policyFreeColor() });
    openPolicyModal('New policy', 'Create policy');
}

function editSchedule(scheduleId) {
    const policy = schedulesData.find((s) => Number(s.id) === Number(scheduleId));
    if (!policy) return;
    currentScheduleId = policy.id;
    fillPolicyForm(policy);
    openPolicyModal('Edit policy', 'Save changes');
}

function openPolicyModal(title, submitText) {
    const modal = document.getElementById('schedule-modal');
    if (!modal) return;
    modal.querySelector('.modal-title').textContent = title;
    modal.querySelector('.modal-submit-btn').textContent = submitText;
    policyFormTried = false;
    updateFormFields();
    modal.style.display = 'block';
    setTimeout(() => {
        const name = document.getElementById('schedule-name');
        if (name) name.focus();
    }, 30);
}

function fillPolicyForm(p) {
    const allDay = policyIsAllDay(p);
    document.getElementById('schedule-name').value = p.schedule_name || '';
    document.querySelectorAll('#schedule-form input[name="policy-action"]').forEach((radio) => { radio.checked = radio.value === (policyIsStop(p) ? 'stop' : 'active'); });
    document.getElementById('schedule-type').value = p.schedule_type || 'daily';
    const days = policyNumbers(p.days_of_week);
    document.querySelectorAll('#schedule-form input[name="day"]').forEach((box) => { box.checked = days.includes(Number(box.value)); });
    const months = policyNumbers(p.months);
    document.querySelectorAll('#schedule-form input[name="month"]').forEach((box) => { box.checked = months.includes(Number(box.value)); });
    document.getElementById('specific-date').value = /^\d{4}-\d{2}-\d{2}/.test(String(p.specific_date || '')) ? String(p.specific_date).slice(0, 10) : '';
    const start = document.getElementById('start-time');
    const end = document.getElementById('end-time');
    start.disabled = false;
    end.disabled = false;
    start.value = allDay ? '08:00' : (p.start_time || '08:00');
    end.value = allDay ? '18:00' : (p.end_time || '18:00');
    policyFormTimes = { start: start.value, end: end.value };
    document.getElementById('policy-all-day').checked = allDay;
    document.getElementById('is-active').checked = p.is_active !== false;
    renderPolicyColorPicker();
    const color = policyColorKey(p);
    document.querySelectorAll('#schedule-form input[name="policy-color"]').forEach((radio) => { radio.checked = radio.value === color; });
}

// <Jun Kai start>
function renderPolicyColorPicker() {
    const box = document.getElementById('policy-colors');
    if (!box || box.children.length) return;
    box.innerHTML = POLICY_COLOR_KEYS.map((key) => {
        const [name, solid] = POLICY_COLORS[key];
        return `<label class="policy-color" title="${name}"><input type="radio" name="policy-color" value="${key}"><span style="background:${solid}"></span><span class="ui-sr-only">${name}</span></label>`;
    }).join('');
}

// a new policy takes the first colour no other Active policy has
function policyFreeColor() {
    const used = new Set(schedulesData.filter((s) => !policyIsStop(s)).map(policyColorKey));
    return POLICY_COLOR_KEYS.find((key) => !used.has(key)) || POLICY_COLOR_KEYS[schedulesData.length % POLICY_COLOR_KEYS.length];
}
// <Jun Kai end>

function readPolicyForm() {
    const type = document.getElementById('schedule-type').value;
    const ticked = (name) => [...document.querySelectorAll(`#schedule-form input[name="${name}"]:checked`)].map((box) => Number(box.value)).sort((a, b) => a - b);
    const action = document.querySelector('#schedule-form input[name="policy-action"]:checked');
    return {
        schedule_name: document.getElementById('schedule-name').value.trim(),
        action: action && action.value === 'stop' ? 'stop' : 'active',
        schedule_type: type,
        days_of_week: type === 'weekly' ? ticked('day').join(',') : '',
        months: type === 'monthly' ? ticked('month').join(',') : '',
        specific_date: type === 'specific_date' ? document.getElementById('specific-date').value : null,
        all_day: document.getElementById('policy-all-day').checked,
        start_time: document.getElementById('start-time').value,
        end_time: document.getElementById('end-time').value,
        is_active: document.getElementById('is-active').checked,
        color: (document.querySelector('#schedule-form input[name="policy-color"]:checked') || {}).value || null
    };
}

function policyFormProblem(p) {
    if (!p.schedule_name) return 'Give the policy a name.';
    if (p.schedule_type === 'weekly' && !p.days_of_week) return 'Pick at least one day.';
    if (p.schedule_type === 'monthly' && !p.months) return 'Pick at least one month.';
    if (p.schedule_type === 'specific_date' && !p.specific_date) return 'Pick the date.';
    if (!p.all_day && (!p.start_time || !p.end_time)) return 'Set both times, or tick All day.';
    if (!p.all_day && p.start_time === p.end_time) return 'Start and stop cannot be the same time. Tick All day for a whole day.';
    return null;
}

// Keeps the form in step with the choices and says in words what the policy will do
function updateFormFields() {
    const type = document.getElementById('schedule-type');
    if (!type) return;
    document.getElementById('weekly-days-section').hidden = type.value !== 'weekly';
    document.getElementById('monthly-section').hidden = type.value !== 'monthly';
    document.getElementById('specific-date-section').hidden = type.value !== 'specific_date';
    const colorSection = document.getElementById('policy-color-section');
    if (colorSection) colorSection.hidden = (document.querySelector('#schedule-form input[name="policy-action"]:checked') || {}).value === 'stop';
    const allDay = document.getElementById('policy-all-day').checked;
    const start = document.getElementById('start-time');
    const end = document.getElementById('end-time');
    if (allDay && !start.disabled) {
        policyFormTimes = { start: start.value, end: end.value };
        start.value = '00:00';
        end.value = '00:00';
    } else if (!allDay && start.disabled) {
        const keep = policyFormTimes.start && policyFormTimes.start !== policyFormTimes.end;
        start.value = keep ? policyFormTimes.start : '08:00';
        end.value = keep ? policyFormTimes.end : '18:00';
    }
    start.disabled = allDay;
    end.disabled = allDay;
    start.closest('.ui-field').hidden = allDay;
    end.closest('.ui-field').hidden = allDay;

    const box = document.getElementById('policy-summary');
    if (!box) return;
    const p = readPolicyForm();
    const problem = policyFormProblem(p);
    if (policyFormTried && problem) {
        box.textContent = problem;
        box.classList.add('is-error');
        return;
    }
    box.classList.remove('is-error');
    const when = {
        daily: 'every day',
        weekly: `on ${policyDaysText(p.days_of_week) || 'the days you pick'}`,
        monthly: `every day in ${policyMonthsText(p.months) || 'the months you pick'}`,
        specific_date: `on ${policyDateText(p.specific_date) || 'the date you pick'}`
    }[p.schedule_type];
    const hours = p.all_day ? 'all day' : `from ${p.start_time || '--:--'} to ${p.end_time || '--:--'}${p.end_time && p.start_time && p.end_time <= p.start_time ? ' the next day' : ''}`;
    let text = p.action === 'stop'
        ? `The kiosk stays off ${when}, ${hours}, unless an Active policy higher in the list covers that time.`
        : `The kiosk runs ${when}, ${hours}.`;
    if (!p.is_active) text += ' It is saved as disabled, so it does nothing until you enable it.';
    box.textContent = text;
}

function policyPlacementMessage(data, created) {
    const name = data.schedule ? `"${data.schedule.schedule_name}"` : 'The policy';
    const above = (data.beatenBy || []).map((n) => `"${n}"`);
    const one = above.length === 1;
    const listed = above.length > 3 ? `${above.slice(0, 3).join(', ')} and others` : above.length > 1 ? `${above.slice(0, -1).join(', ')} and ${above[above.length - 1]}` : above[0];
    const beaten = above.length ? ` ${listed} ${one ? 'is' : 'are'} higher and still win${one ? 's' : ''} where ${one ? 'both apply' : 'they overlap'}: drag ${name} above ${one ? 'it' : 'them'} if it should win.` : '';
    if (!created && !data.moved) return `${name} saved.${beaten}`;
    if (data.placedAbove) return `${name} is priority ${data.position} of ${data.total}, above "${data.placedAbove}": ${data.reason}.${beaten}`;
    return `${name} is priority ${data.position} of ${data.total}.${beaten}`;
}

function saveSchedule() {
    const policy = readPolicyForm();
    const problem = policyFormProblem(policy);
    if (problem) {
        policyFormTried = true;
        updateFormFields();
        showNotification(problem, 'error');
        return;
    }
    const created = !currentScheduleId;
    const button = document.querySelector('#schedule-modal .modal-submit-btn');
    if (button) button.disabled = true;
    fetch(created ? '/api/admin/server-schedules' : `/api/admin/server-schedules/${currentScheduleId}`, {
        method: created ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy)
    })
        .then((response) => response.json().then((data) => ({ response, data })))
        .then(({ response, data }) => {
            if (!response.ok || !data.success) throw new Error(data.error || 'Could not save the policy');
            closeModal('schedule-modal');
            showNotification(policyPlacementMessage(data, created), data.beatenBy && data.beatenBy.length ? 'warning' : 'success');
            return loadSchedules(data.schedule && data.schedule.id);
        })
        .catch((error) => {
            console.error('❌ Error saving policy:', error);
            showNotification(error.message, 'error');
        })
        .finally(() => {
            if (button) button.disabled = false;
        });
}

function policyRequest(url, options, failure) {
    return fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options })
        .then((response) => response.json().then((data) => ({ response, data })))
        .then(({ response, data }) => {
            if (!response.ok || !data.success) throw new Error(data.error || failure);
            return data;
        });
}

async function deleteSchedule(scheduleId) {
    const policy = schedulesData.find((s) => Number(s.id) === Number(scheduleId));
    if (!(await uiConfirm({ title: `Delete "${policy ? policy.schedule_name : 'this policy'}"?`, message: 'This cannot be undone.', confirmText: 'Delete', danger: true }))) return; // <Jun Kai/> a kit window instead of the browser's box
    policyRequest(`/api/admin/server-schedules/${scheduleId}`, { method: 'DELETE' }, 'Could not delete the policy')
        .then(() => {
            showNotification('Policy deleted', 'success');
            loadSchedules();
        })
        .catch((error) => showNotification(error.message, 'error'));
}

function toggleScheduleStatus(scheduleId, newStatus) {
    const policy = schedulesData.find((s) => Number(s.id) === Number(scheduleId));
    policyRequest(`/api/admin/server-schedules/${scheduleId}/toggle`, { method: 'PUT', body: JSON.stringify({ is_active: !!newStatus }) }, 'Could not change the policy')
        .then(() => {
            showNotification(`"${policy ? policy.schedule_name : 'Policy'}" ${newStatus ? 'enabled' : 'disabled'}`, 'success');
            loadSchedules();
        })
        .catch((error) => {
            showNotification(error.message, 'error');
            loadSchedules();
        });
}

async function enableAllSchedules() {
    if (!(await uiConfirm({ title: 'Enable every policy?', confirmText: 'Enable all' }))) return; // <Jun Kai/> a kit window instead of the browser's box
    policyRequest('/api/admin/server-schedules/enable-all', { method: 'POST' }, 'Could not enable the policies')
        .then((data) => {
            showNotification(`${data.enabled_count} polic${data.enabled_count === 1 ? 'y' : 'ies'} enabled`, 'success');
            loadSchedules();
        })
        .catch((error) => showNotification(error.message, 'error'));
}

async function disableAllSchedules() {
    if (!(await uiConfirm({ title: 'Disable every policy?', message: 'The kiosk then has no hours in automatic mode.', confirmText: 'Disable all', danger: true }))) return; // <Jun Kai/> a kit window instead of the browser's box
    policyRequest('/api/admin/server-schedules/disable-all', { method: 'POST' }, 'Could not disable the policies')
        .then((data) => {
            showNotification(`${data.disabled_count} polic${data.disabled_count === 1 ? 'y' : 'ies'} disabled`, 'success');
            loadSchedules();
        })
        .catch((error) => showNotification(error.message, 'error'));
}

async function resetPolicyOrder() {
    if (!(await uiConfirm({ title: 'Put every policy back in the default order?', message: 'Single dates go first, then days of the week, months and every day, with Stop above Active. Orders you dragged by hand are lost.', confirmText: 'Use the default order' }))) return; // <Jun Kai/> a kit window instead of the browser's box
    policyRequest('/api/admin/server-schedules/reorder', { method: 'POST', body: JSON.stringify({ order: 'default' }) }, 'Could not reset the order')
        .then((data) => {
            schedulesData = data.schedules;
            renderPolicies(schedulesData);
            showNotification('Policies are back in the default order', 'success');
            loadAutomationStatus();
            loadPolicyPreview();
        })
        .catch((error) => showNotification(error.message, 'error'));
}

// ---------------------------------------------------------------- drag and keyboard reordering
function initPolicyDrag(ol) {
    if (ol.dataset.dragReady) return;
    ol.dataset.dragReady = '1';
    ol.addEventListener('pointerdown', policyPointerDown);
    ol.addEventListener('keydown', policyKeyDown);
}

// Moves rows with a short slide: measure, change the DOM, then animate each row from its old place
function policyFlip(ol, still, change) {
    const rows = policyRows(ol).filter((row) => row !== still);
    const before = new Map(rows.map((row) => [row, row.offsetTop]));
    change();
    for (const row of rows) {
        const delta = before.get(row) - row.offsetTop;
        if (!delta) continue;
        row.style.transition = 'none';
        row.style.transform = `translateY(${delta}px)`;
        row.getBoundingClientRect();
        row.style.transition = 'transform 160ms ease';
        row.style.transform = '';
    }
}

function policyPointerDown(event) {
    const handle = event.target.closest('.policy-handle');
    if (!handle || event.button !== 0 || policyOrderSaving || policyDrag) return;
    const row = handle.closest('.policy-row');
    const ol = row.parentElement;
    event.preventDefault();
    policyDrag = {
        row,
        ol,
        handle,
        pointerId: event.pointerId,
        grabOffset: event.clientY - row.getBoundingClientRect().top,
        before: policyRows(ol).map((r) => r.dataset.id),
        drop: document.createElement('li')
    };
    row.classList.add('is-dragging');
    ol.classList.add('is-sorting');
    // a grey slot shows where the row lands when it is let go
    policyDrag.drop.className = 'policy-drop';
    policyDrag.drop.setAttribute('aria-hidden', 'true');
    ol.insertBefore(policyDrag.drop, ol.firstChild);
    policyPlaceDrop(policyDrag);
    requestAnimationFrame(() => { if (policyDrag) policyDrag.drop.classList.add('is-live'); });
    // window listeners: moving the dragged row in the page would drop pointer capture on the handle
    window.addEventListener('pointermove', policyPointerMove);
    window.addEventListener('pointerup', policyPointerUp);
    window.addEventListener('pointercancel', policyPointerUp);
}

function policyPointerMove(event) {
    const drag = policyDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const y = event.clientY - drag.ol.getBoundingClientRect().top;
    const middle = y - drag.grabOffset + drag.row.offsetHeight / 2;
    const target = policyRows(drag.ol).find((r) => r !== drag.row && r.offsetTop + r.offsetHeight / 2 > middle) || null;
    let next = drag.row.nextElementSibling;
    while (next && !next.classList.contains('policy-row')) next = next.nextElementSibling;
    if (target !== next) policyFlip(drag.ol, drag.row, () => drag.ol.insertBefore(drag.row, target));
    policyPlaceDrop(drag);
    drag.row.style.transform = `translateY(${y - drag.grabOffset - drag.row.offsetTop}px)`;
}

// the slot is where the row sits in the list; the row itself follows the pointer
function policyPlaceDrop(drag) {
    drag.drop.style.top = `${drag.row.offsetTop + 4}px`;
    drag.drop.style.height = `${Math.max(0, drag.row.offsetHeight - 8)}px`;
}

function policyPointerUp(event) {
    const drag = policyDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    policyDrag = null;
    window.removeEventListener('pointermove', policyPointerMove);
    window.removeEventListener('pointerup', policyPointerUp);
    window.removeEventListener('pointercancel', policyPointerUp);
    drag.row.style.transition = 'transform 160ms ease';
    drag.row.style.transform = '';
    setTimeout(() => {
        drag.drop.remove();
        drag.row.style.transition = '';
        drag.row.classList.remove('is-dragging');
        drag.ol.classList.remove('is-sorting');
        policyRows(drag.ol).forEach((row) => { row.style.transition = ''; });
    }, 170);
    const after = policyRows(drag.ol).map((r) => r.dataset.id);
    const pending = policyPendingList;
    policyPendingList = null;
    if (event.type === 'pointercancel') {
        if (after.join(',') !== drag.before.join(',')) restorePolicyOrder(drag.ol, drag.before);
        if (pending) loadSchedules();
        return;
    }
    if (after.join(',') !== drag.before.join(',')) {
        savePolicyOrder(after, drag.before, drag.row).then(() => { if (pending) loadSchedules(); });
    } else if (pending) {
        renderPolicies(pending);
    }
}

function restorePolicyOrder(ol, ids) {
    const byId = new Map(policyRows(ol).map((row) => [row.dataset.id, row]));
    ids.forEach((id) => { if (byId.has(id)) ol.appendChild(byId.get(id)); });
    renumberPolicies(ol);
}

function policyKeyDown(event) {
    const handle = event.target.closest('.policy-handle');
    if (!handle || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    if (policyOrderSaving) return;
    const row = handle.closest('.policy-row');
    const ol = row.parentElement;
    const rows = policyRows(ol);
    const index = rows.indexOf(row);
    const swapWith = rows[event.key === 'ArrowUp' ? index - 1 : index + 1];
    if (!swapWith) return;
    const before = rows.map((r) => r.dataset.id);
    policyFlip(ol, null, () => ol.insertBefore(row, event.key === 'ArrowUp' ? swapWith : swapWith.nextElementSibling));
    handle.focus();
    savePolicyOrder(policyRows(ol).map((r) => r.dataset.id), before, row);
}

function savePolicyOrder(ids, previous, movedRow) {
    const ol = document.getElementById('policy-list');
    policyOrderSaving = true;
    renumberPolicies(ol);
    return policyRequest('/api/admin/server-schedules/reorder', { method: 'POST', body: JSON.stringify({ ids: ids.map(Number) }) }, 'Could not save the order')
        .then((data) => {
            schedulesData = data.schedules;
            const live = document.getElementById('policy-live');
            const name = movedRow && movedRow.querySelector('.policy-name');
            if (live && name) live.textContent = `${name.textContent} is now priority ${ids.indexOf(movedRow.dataset.id) + 1} of ${ids.length}.`;
            loadAutomationStatus();
            loadPolicyPreview();
        })
        .catch((error) => {
            showNotification(error.message, 'error');
            const handle = movedRow && movedRow.querySelector('.policy-handle');
            const hadFocus = handle && document.activeElement === handle;
            restorePolicyOrder(ol, previous);
            if (hadFocus) handle.focus();
            const live = document.getElementById('policy-live');
            if (live) live.textContent = `The order was not saved: ${error.message}`;
        })
        .finally(() => {
            policyOrderSaving = false;
        });
}

// ---------------------------------------------------------------- next 7 days
// <Jun Kai start>
function policyStoredView() {
    try { return localStorage.getItem('policyView') === 'week' ? 'week' : 'month'; } catch { return 'month'; }
}

function setPolicyView(view) {
    policyView = view === 'week' ? 'week' : 'month';
    try { localStorage.setItem('policyView', policyView); } catch { /* private window: fine */ }
    loadPolicyPreview();
}

// a day clicked on the month calendar opens its week
function openPolicyWeek(ymd) {
    policyView = 'week';
    policyPreviewStart = ymd === policyYmd(new Date()) ? null : ymd;
    loadPolicyPreview();
}

function shiftPolicyView(step) {
    if (policyView === 'week') {
        shiftPolicyPreview(step * 7);
        return;
    }
    const first = policyMonthStart();
    setPolicyPreviewStart(policyYmd(new Date(first.getFullYear(), first.getMonth() + step, 1)));
}

function policyMonthStart() {
    const now = new Date();
    if (!policyMonth) return new Date(now.getFullYear(), now.getMonth(), 1);
    const [y, m] = policyMonth.split('-').map(Number);
    return new Date(y, m - 1, 1);
}

function renderPolicyViewButtons() {
    const month = policyView === 'month';
    for (const [id, on] of [['policy-view-month', month], ['policy-view-week', !month]]) {
        const btn = document.getElementById(id);
        if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', String(on)); }
    }
    const calendar = document.getElementById('policy-calendar');
    const week = document.getElementById('policy-preview');
    if (calendar) calendar.hidden = !month;
    if (week) week.hidden = month;
    const unit = month ? 'month' : '7 days';
    for (const [id, word] of [['policy-prev', 'Previous'], ['policy-next', 'Next']]) {
        const btn = document.getElementById(id);
        if (btn) { btn.setAttribute('aria-label', `${word} ${unit}`); btn.title = `${word} ${unit}`; }
    }
    const text = document.getElementById('policy-preview-text');
    if (text) text.textContent = month ? 'The policy that decides each day. Click a day to see its hours.' : 'What the policies add up to. Point at a bar to see which policy decides it.';
}

function loadPolicyPreview() {
    renderPolicyViewButtons();
    return policyView === 'month' ? loadPolicyMonth() : loadPolicyWeek();
}

function loadPolicyMonth() {
    const box = document.getElementById('policy-calendar');
    if (!box) return Promise.resolve();
    const first = policyMonthStart();
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return policyRequest(`/api/admin/server-schedules/preview?days=${days}&from=${policyYmd(first)}`, { method: 'GET', cache: 'no-store' }, 'The calendar is not available')
        .then((data) => renderPolicyMonth(data.preview, first))
        .catch((error) => {
            console.error('❌ Error loading the policy calendar:', error);
            if (policyMonth) showNotification(error.message, 'error');
            if (!box.children.length) box.innerHTML = `<p class="policy-empty">${escapeHtmlSafe(error.message)}</p>`;
        });
}

// Each policy that decides part of a day, in the order it first does, as a chip; the hours the kiosk runs under them
function policyCalendarDay(day, preview) {
    const [y, m, d] = day.date.split('-').map(Number);
    const isToday = day.date === preview.today;
    const segments = preview.manual ? [] : day.segments;
    const deciding = [...new Map(segments.map((s) => [s.id, s])).values()].reverse();
    const firstSeen = [...new Map(segments.map((s) => [s.id, s])).keys()];
    deciding.sort((a, b) => firstSeen.indexOf(a.id) - firstSeen.indexOf(b.id));
    const chip = (s) => (s.on
        ? `<span class="policy-chip" style="background:${policyColor(s)[2]};color:${policyColor(s)[3]}">${escapeHtmlSafe(s.name)}</span>`
        : `<span class="policy-chip policy-chip-stop">${escapeHtmlSafe(s.name)}</span>`);
    const periods = [];
    for (const s of segments.filter((x) => x.on)) {
        const last = periods[periods.length - 1];
        if (last && last.endMin === s.startMin) { last.endMin = s.endMin; last.to = s.to; } else periods.push({ ...s });
    }
    let hours = '';
    if (periods.length === 1) hours = `${periods[0].from} to ${periods[0].to}`;
    else if (periods.length === 2) hours = `${periods[0].from} to ${periods[0].to}, ${periods[1].from} to ${periods[1].to}`;
    else if (periods.length > 2) hours = `${periods.length} periods from ${periods[0].from}`;
    else if (segments.length) hours = segments.reduce((sum, s) => sum + s.endMin - s.startMin, 0) >= 1440 ? 'Off hours all day' : 'Off hours'; // <Jun Kai/> a Stop time is only recorded for now
    const long = new Date(y, m - 1, d).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' });
    const words = deciding.length ? `${deciding.map((s) => s.name).join(', ')}. ${hours}.` : 'No policy decides this day.';
    const more = deciding.length > 2 ? `<span class="policy-cal-more">+${deciding.length - 2} more</span>` : '';
    return `<button type="button" class="policy-cal-day${isToday ? ' is-today' : ''}${day.date < preview.today ? ' is-past' : ''}" onclick="openPolicyWeek('${day.date}')" aria-label="${escapeHtmlSafe(`${long}: ${words} Open this week.`)}">
            <span class="policy-cal-n">${d}</span>${deciding.slice(0, 2).map(chip).join('')}${more}${hours ? `<span class="policy-cal-hours">${escapeHtmlSafe(hours)}</span>` : ''}
        </button>`;
}

function renderPolicyMonth(preview, first) {
    const box = document.getElementById('policy-calendar');
    if (!box || !preview) return;
    const title = document.getElementById('policy-preview-title');
    if (title) title.textContent = first.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });
    const input = document.getElementById('policy-preview-date');
    if (input) {
        [input.min, input.max] = policyPreviewLimits();
        if (document.activeElement !== input) input.value = preview.today.slice(0, 7) === preview.start.slice(0, 7) ? preview.today : preview.start;
    }
    const today = document.getElementById('policy-preview-today');
    if (today) today.disabled = !policyMonth;
    renderPolicyLegend(preview);
    // the 60 s refresh redraws only when a day changed
    const key = JSON.stringify([preview.start, preview.today, preview.manual, preview.days]);
    if (key === policyMonthKey && box.children.length) return;
    policyMonthKey = key;
    const blank = '<div class="policy-cal-day is-out" aria-hidden="true"></div>';
    const cells = [...Array(first.getDay()).fill(blank), ...preview.days.map((day) => policyCalendarDay(day, preview))];
    while (cells.length % 7) cells.push(blank);
    const head = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name) => `<span>${name}</span>`).join('');
    const note = preview.manual ? '<p class="policy-preview-note">Manual mode is on, so the policies are paused and nothing runs on its own. Switch back to automatic mode under Controls to see their plan.</p>' : '';
    box.innerHTML = `${note}<div class="policy-cal-head" aria-hidden="true">${head}</div><div class="policy-cal-grid">${cells.join('')}</div>`;
}

// Month: the policies on the calendar with their colours. 7 days: what the bars mean.
function renderPolicyLegend(preview) {
    const legend = document.getElementById('policy-legend');
    if (!legend) return;
    if (policyView === 'week') {
        legend.hidden = false;
        legend.innerHTML = '<span><i class="policy-swatch policy-swatch-on"></i>Kiosk runs, in the colour of its policy</span><span><i class="policy-swatch policy-swatch-stop"></i>Off hours (Stop policy)</span>';
        return;
    }
    const seen = new Map();
    if (!preview.manual) for (const day of preview.days) for (const s of day.segments) if (!seen.has(s.id)) seen.set(s.id, s);
    legend.innerHTML = [...seen.values()].map((s) => (s.on
        ? `<span><i class="policy-swatch" style="background:${policyColor(s)[1]}"></i>${escapeHtmlSafe(s.name)}</span>`
        : `<span><i class="policy-swatch policy-swatch-grey"></i>${escapeHtmlSafe(s.name)} (off hours)</span>`)).join('');
    legend.hidden = !seen.size;
}
// <Jun Kai end>

function loadPolicyWeek() {
    const box = document.getElementById('policy-preview');
    if (!box) return Promise.resolve();
    const from = policyPreviewStart ? `&from=${policyPreviewStart}` : '';
    return policyRequest(`/api/admin/server-schedules/preview?days=7${from}`, { method: 'GET', cache: 'no-store' }, 'The preview is not available')
        .then((data) => renderPolicyPreview(data.preview))
        .catch((error) => {
            console.error('❌ Error loading the policy preview:', error);
            if (policyPreviewStart) showNotification(error.message, 'error');
            if (!box.children.length) box.innerHTML = `<p class="policy-empty">${escapeHtmlSafe(error.message)}</p>`;
        });
}

const policyYmd = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// the calendar goes from 2 years back to 5 years ahead
function policyPreviewLimits() {
    const now = new Date();
    return [policyYmd(new Date(now.getFullYear() - 2, now.getMonth(), now.getDate())), policyYmd(new Date(now.getFullYear() + 5, now.getMonth(), now.getDate()))];
}

// '' or today goes back to "Next 7 days"
function setPolicyPreviewStart(value) {
    const today = policyYmd(new Date());
    const [min, max] = policyPreviewLimits();
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < min || value > max)) {
        showNotification(`Pick a date from ${policyDateText(min)} to ${policyDateText(max)}.`, 'error');
        const input = document.getElementById('policy-preview-date');
        if (input) input.value = policyPreviewShown || today;
        return;
    }
    // <Jun Kai start>
    if (policyView === 'month') policyMonth = value && value.slice(0, 7) !== today.slice(0, 7) ? value.slice(0, 7) : null;
    else policyPreviewStart = value && value !== today ? value : null;
    // <Jun Kai end>
    loadPolicyPreview();
}

function shiftPolicyPreview(days) {
    const [y, m, d] = (policyPreviewShown || policyYmd(new Date())).split('-').map(Number);
    setPolicyPreviewStart(policyYmd(new Date(y, m - 1, d + days)));
}

// the title, the date box and the Today button follow the days shown
function renderPolicyPreviewNav(preview) {
    policyPreviewShown = preview.start;
    const isToday = preview.start === preview.today;
    const title = document.getElementById('policy-preview-title');
    if (title) title.textContent = isToday ? 'Next 7 days' : `7 days from ${policyDateText(preview.start)}`;
    const input = document.getElementById('policy-preview-date');
    if (input) {
        [input.min, input.max] = policyPreviewLimits();
        if (document.activeElement !== input) input.value = preview.start;
    }
    const today = document.getElementById('policy-preview-today');
    if (today) today.disabled = isToday;
}

function renderPolicyPreview(preview) {
    const box = document.getElementById('policy-preview');
    if (!box || !preview) return;
    renderPolicyPreviewNav(preview);
    // the 60 s refresh only moves the "now" line when the bars did not change, so keyboard focus stays put
    const key = JSON.stringify([preview.start, preview.manual, preview.days]);
    const nowLine = box.querySelector('.policy-now');
    if (key === policyPreviewKey && nowLine) {
        nowLine.style.left = `${(preview.nowMin / 14.4).toFixed(3)}%`;
        return;
    }
    policyPreviewKey = key;
    renderPolicyLegend(preview);
    const focused = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.slot : null;
    const axis = ['00:00', '06:00', '12:00', '18:00', '24:00'].map((t, i) => `<span style="left:${i * 25}%">${t}</span>`).join('');
    const rows = preview.days.map((day) => {
        const [y, m, d] = day.date.split('-').map(Number);
        const isToday = day.date === preview.today;
        const label = isToday ? 'Today' : new Date(y, m - 1, d).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
        // manual mode pauses the policies, so nothing is drawn
        const segments = preview.manual ? '' : day.segments.map((s) => {
            const what = s.on ? 'Active: the kiosk runs' : 'Stop: off hours'; // <Jun Kai/> a Stop time is only recorded for now
            const when = `${s.from} to ${s.to}, priority ${s.position}`;
            const words = `${label}, ${s.from} to ${s.to}: ${s.name}, ${s.on ? 'kiosk runs' : 'off hours'}, priority ${s.position}`;
            return `<span class="policy-seg policy-seg-${s.on ? 'on' : 'stop'}" role="img" style="left:${(s.startMin / 14.4).toFixed(3)}%;width:${((s.endMin - s.startMin) / 14.4).toFixed(3)}%${s.on ? `;background:${policyColor(s)[1]}` : ''}" tabindex="0" data-slot="${day.date}-${s.startMin}" data-name="${escapeHtmlSafe(s.name)}" data-what="${escapeHtmlSafe(what)}" data-when="${escapeHtmlSafe(when)}" aria-label="${escapeHtmlSafe(words)}"><span class="policy-seg-label">${escapeHtmlSafe(s.name)}</span></span>`;
        }).join('');
        const now = isToday ? `<span class="policy-now" style="left:${(preview.nowMin / 14.4).toFixed(3)}%"></span>` : '';
        return `<div class="policy-day"><span class="policy-day-label${isToday ? ' is-today' : ''}">${escapeHtmlSafe(label)}</span><div class="policy-track">${segments}${now}</div></div>`;
    }).join('');
    const note = preview.manual ? '<p class="policy-preview-note">Manual mode is on, so the policies are paused and nothing runs on its own. Switch back to automatic mode under Controls to see their plan.</p>' : '';
    box.innerHTML = `${note}<div class="policy-axis"><span></span><div class="policy-axis-track">${axis}</div></div>${rows}`;
    bindPolicyTips(box);
    if (focused) {
        const again = box.querySelector(`[data-slot="${focused}"]`);
        if (again) again.focus();
    }
}

function bindPolicyTips(box) {
    if (box.dataset.tipsReady) return;
    box.dataset.tipsReady = '1';
    const tip = document.getElementById('policy-tip');
    if (!tip) return;
    const show = (event) => {
        const seg = event.target.closest('.policy-seg');
        if (!seg) return;
        tip.innerHTML = `<strong>${escapeHtmlSafe(seg.dataset.name)}</strong>${escapeHtmlSafe(seg.dataset.what)}<br>${escapeHtmlSafe(seg.dataset.when)}`;
        tip.hidden = false;
        const r = seg.getBoundingClientRect();
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
        const top = r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8;
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
    };
    const hide = (event) => {
        const seg = event.target.closest('.policy-seg');
        if (seg && event.relatedTarget && seg.contains(event.relatedTarget)) return;
        tip.hidden = true;
    };
    box.addEventListener('pointerover', show);
    box.addEventListener('focusin', show);
    box.addEventListener('pointerout', hide);
    box.addEventListener('focusout', hide);
}
// <Jun Kai end>

// ==================== SERVER CONTROL MODE FUNCTIONS (BERNISSA) ====================

// Load current server control mode on page load
async function loadServerMode() {
    try {
        const response = await fetch('/api/admin/server/mode');
        const data = await response.json();
        
        if (data.success) {
            const isAuto = data.mode === 'auto';
            const toggle = document.getElementById('auto-mode-toggle');
            if (toggle) {
                toggle.checked = isAuto;
                updateModeUI(isAuto);
            }
            
            console.log(`✅ Loaded server mode: ${data.mode.toUpperCase()}`);
        }
        
    } catch (error) {
        console.error('❌ Error loading server mode:', error);
        showNotification('Failed to load server mode', 'error');
    }
}

// Toggle between auto and manual mode
async function toggleServerMode() {
    const toggle = document.getElementById('auto-mode-toggle');
    if (!toggle) return;
    
    const isAuto = toggle.checked;
    const newMode = isAuto ? 'auto' : 'manual';
    // <Jun Kai start>
    // automatic mode hands the kiosk to the policies within a minute, so it is confirmed first
    if (isAuto && !(await uiConfirm({ title: 'Switch to automatic mode?', message: 'The policies take over within a minute: they decide when the kiosk runs, and start the kiosk server when one of them needs it.', confirmText: 'Switch to automatic' }))) { // <Jun Kai/> a kit window instead of the browser's box
        toggle.checked = false;
        return;
    }
    // <Jun Kai end>

    console.log(`🔄 Switching to ${newMode.toUpperCase()} mode...`);
    
    try {
        const response = await fetch('/api/admin/server/mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: newMode })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Switched to ${newMode} mode`, 'success');
            updateModeUI(isAuto);
            
            // Refresh server status
            checkServerStatus();
            loadAutomationStatus();
            // <Jun Kai start>
            loadPolicyPreview();
            // <Jun Kai end>
            
        } else {
            showNotification(data.error || 'Failed to change mode', 'error');
            // Revert toggle
            toggle.checked = !isAuto;
        }
        
    } catch (error) {
        console.error('❌ Error changing mode:', error);
        showNotification('Error changing mode', 'error');
        // Revert toggle
        toggle.checked = !isAuto;
    }
}

// Update UI based on current mode
function updateModeUI(isAuto) {
    const modeStatus = document.getElementById('mode-status');
    const modeDesc = document.getElementById('mode-description');
    const modeHint = document.getElementById('mode-hint');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');
    const stopBtn = document.getElementById('stop-btn');
    if (!modeStatus || !modeDesc) return;

    modeStatus.textContent = isAuto ? 'Automatic mode' : 'Manual mode';
    // <Jun Kai start>
    modeDesc.textContent = isAuto
        ? 'Policies decide when the kiosk runs'
        : 'Policies are paused; use the controls to start or stop the kiosk';
    if (modeHint) {
        modeHint.textContent = isAuto
            ? 'Switch to manual mode to use the start and stop controls.'
            : 'Manual mode: the policies stay paused until automatic mode is switched back on.';
        // <Jun Kai end>
        modeHint.classList.toggle('ui-note-warn', !isAuto);
    }
    [startBtn, restartBtn, stopBtn].forEach((btn) => { if (btn) btn.disabled = isAuto; });
    // <Jun Kai start>
    // the manual buttons only show in manual mode, where they work
    const manualControls = document.getElementById('manual-controls');
    if (manualControls) manualControls.hidden = isAuto;
    // in manual mode the line under the switch already says the policies are paused
    if (modeHint) modeHint.hidden = !isAuto;
    // <Jun Kai end>
}

// Check current kiosk service status
async function checkServerStatus() {
    if (!sessionStorage.getItem('loggedUser')) return;
    try {
        const response = await fetch('/api/admin/server/status');
        const data = await response.json();
        
        const statusIndicator = document.getElementById('server-status-indicator');
        
        if (!statusIndicator) return;
        
        if (data.success) {
            if (data.kiosk_running) {
                statusIndicator.innerHTML = uiPill('ok', 'Kiosk running');
            } else {
                statusIndicator.innerHTML = uiPill('down', 'Kiosk stopped');
            }
            // <Jun Kai start>
            setAutomationText('policy-now', data.kiosk_running ? 'Kiosk running' : 'Kiosk stopped');
            // <Jun Kai end>
            // <Jun Kai start>
            // in manual mode Start kiosk only works while the kiosk is stopped
            const toggle = document.getElementById('auto-mode-toggle');
            const startBtn = document.getElementById('start-btn');
            if (startBtn && toggle && !toggle.checked) startBtn.disabled = !!data.kiosk_running;
            // <Jun Kai end>
        } else {
            statusIndicator.innerHTML = uiPill('warn', 'Status unknown');
        }
        
    } catch (error) {
        console.error('❌ Error checking status:', error);
        const statusIndicator = document.getElementById('server-status-indicator');
        if (statusIndicator) {
            statusIndicator.innerHTML = uiPill('warn', 'Cannot check status');
        }
    }
}

// Start/stop server functions with manual mode check
function startServer() {
    // Check if in manual mode
    const toggle = document.getElementById('auto-mode-toggle');
    const isAuto = toggle ? toggle.checked : true;
    
    if (isAuto) {
        showNotification('Switch to manual mode first to control the kiosk by hand', 'warning');
        return;
    }
    
    console.log('▶️ Starting server manually...');
    
    fetch('/api/admin/server/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Server started successfully', 'success');
            // Wait a moment then check status
            setTimeout(() => checkServerStatus(), 2000);
        } else {
            showNotification(data.error || 'Failed to start server', 'error');
        }
    })
    .catch(error => {
        console.error('❌ Error starting server:', error);
        showNotification('Error starting server', 'error');
    });
}

async function restartServer() {
    const toggle = document.getElementById('auto-mode-toggle');
    const isAuto = toggle ? toggle.checked : true;

    if (isAuto) {
        showNotification('Switch to manual mode first to restart the application', 'warning');
        return;
    }

    if (!(await uiConfirm({ title: 'Restart the kiosk application now?', confirmText: 'Restart' }))) return; // <Jun Kai/> a kit window instead of the browser's box

    console.log('🔄 Restarting server manually...');

    fetch('/api/admin/server/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Restart initiated. The application will relaunch shortly.', 'success');
        } else {
            showNotification(data.error || 'Failed to restart server', 'error');
        }
    })
    .catch(error => {
        console.error('❌ Error restarting server:', error);
        showNotification('Error restarting server', 'error');
    });
}

async function stopServer() {
    // Check if in manual mode
    const toggle = document.getElementById('auto-mode-toggle');
    const isAuto = toggle ? toggle.checked : true;
    
    if (isAuto) {
        showNotification('Switch to manual mode first to control the kiosk by hand', 'warning');
        return;
    }
    
    if (!(await uiConfirm({ title: 'Stop the kiosk server?', message: 'This PC hibernates right after, so the wall and tablets go dark until it is woken up.', confirmText: 'Stop and hibernate', danger: true }))) return; // <Jun Kai/> a kit window instead of the browser's box
    
    console.log('⏹️ Stopping server manually...');
    
    fetch('/api/admin/server/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification(data.message || 'Server stopped successfully', 'success');
            // Wait a moment then check status
            setTimeout(() => checkServerStatus(), 2000);
        } else {
            showNotification(data.error || 'Failed to stop server', 'error');
        }
    })
    .catch(error => {
        console.error('❌ Error stopping server:', error);
        showNotification('Error stopping server', 'error');
    });
}

// Helper functions

function showNotification(message, type = 'info') {
    // Remove any existing notification
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${uiIcon(type === 'success' ? 'check' : type === 'error' ? 'cross' : type === 'warning' ? 'alert' : 'info', 18)}</span>
            <span>${escapeHtmlSafe(message)}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function showLoading(selector, message = 'Loading...') {
    const element = document.querySelector(selector);
    if (element) {
        element.classList.add('loading');
        element.setAttribute('data-loading-text', message);
    }
}

function hideLoading() {
    const loadingElements = document.querySelectorAll('.loading');
    loadingElements.forEach(element => {
        element.classList.remove('loading');
    });
}

function showError(selector, message) {
    const element = document.querySelector(selector);
    if (element) {
        element.classList.remove('loading');
        const safeMessage = escapeHtml(message);
        element.innerHTML = element.tagName === 'TBODY'
            ? `<tr><td colspan="10" class="table-error">${safeMessage}</td></tr>`
            : `<p class="table-error">${safeMessage}</p>`;
    }
    showNotification(message, 'error');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Initialisation

// Export functions for use in other modules
window.serverScheduleManager = {
    loadSchedules,
    showAddScheduleModal,
    editSchedule,
    saveSchedule,
    deleteSchedule,
    toggleScheduleStatus,
    enableAllSchedules,
    disableAllSchedules,
    resetPolicyOrder,
    loadPolicyPreview,
    startServer,
    stopServer,
    restartServer,
    loadServerMode,
    toggleServerMode,
    checkServerStatus
};



// ==================== AUTOMATION OVERVIEW (Role 3) ====================
// What the scheduler will do next, from GET /api/admin/server/automation

function formatPlannedTime(iso) {
    if (!iso) return '–';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '–';
    const now = new Date();
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
    const time = date.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (dayDiff === 0) return `Today ${time}`;
    if (dayDiff === 1) return `Tomorrow ${time}`;
    return `${date.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

// <Jun Kai start>
// "In 5 h 12 min", "In 3 days"
function policyIn(iso) {
    const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
    if (!Number.isFinite(minutes) || minutes < 1) return 'Now';
    if (minutes < 60) return `In ${minutes} min`;
    if (minutes < 48 * 60) return `In ${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
    return `In ${Math.round(minutes / 1440)} days`;
}
// <Jun Kai end>

function setAutomationText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setAutomationState(label, tone) {
    const pill = document.getElementById('automation-state');
    if (!pill) return;
    pill.className = `ui-pill ui-pill-${tone}`;
    pill.innerHTML = `<span class="ui-dot"></span>${escapeHtmlSafe(label)}`;
}

// <Jun Kai start>
let lastAutomationStatus = null;
// <Jun Kai end>
async function loadAutomationStatus() {
    if (!document.getElementById('automation-card')) return;
    try {
        // <Jun Kai start> the whole History list only while its drawer is open; the tiles need none of it
        const drawer = document.getElementById('schedule-history-drawer');
        const response = await fetch(`/api/admin/server/automation?limit=${drawer && drawer.open ? 500 : 1}`);
        // <Jun Kai end>
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load automation status');
        // <Jun Kai start>
        const a = data.automation;
        const acting = a.enabled && !a.dryRun && a.mode === 'auto';
        if (acting && lastAutomationStatus && lastAutomationStatus.currentWindow && !a.currentWindow) {
            showNotification('Off hours have started. The kiosk page shows the closed screen; the kiosk server keeps running.', 'info');
        }
        lastAutomationStatus = a;
        // <Jun Kai end>
        renderAutomationStatus(data.automation);
    } catch (error) {
        console.error('❌ Error loading automation status:', error);
        setAutomationText('automation-summary', 'Automation status is not available right now.');
        setAutomationState('Unavailable', 'down');
        // <Jun Kai start> on the page too: the History drawer is closed most of the time
        setAutomationText('policy-mode-hint', 'Automation status is not available right now.');
        // <Jun Kai end>
    }
}

function renderAutomationStatus(a) {
    const isAuto = a.mode === 'auto';
    if (!a.enabled) {
        setAutomationState('Off on this machine', 'muted');
        // <Jun Kai start>
        setAutomationText('automation-summary', 'Automation is switched off here (KIOSK_AUTOMATION=off). Policies are saved but nothing runs them.');
        // <Jun Kai end>
    } else if (!isAuto) {
        setAutomationState('Paused', 'warn');
        // <Jun Kai start>
        setAutomationText('automation-summary', 'Manual mode. Switch to automatic mode below and the policies decide when the kiosk runs.');
        // <Jun Kai end>
    // <Jun Kai start>
    } else if (!a.activeSchedules) {
        setAutomationState('No policies', 'warn');
        setAutomationText('automation-summary', 'Automatic mode is on but no policy is enabled. Add or enable one to automate the day.');
    } else if (a.dryRun) {
        setAutomationState('Dry run', 'warn');
        setAutomationText('automation-summary', 'Dry run: actions are only logged (KIOSK_AUTOMATION=dry-run).');
    } else {
        setAutomationState('On', 'ok');
        let summary = `${a.activeSchedules} enabled polic${a.activeSchedules === 1 ? 'y' : 'ies'} decide when the kiosk runs.`;
        if (a.currentWindow) {
            summary = a.currentWindow.until
                ? `The kiosk runs until ${formatPlannedTime(a.currentWindow.until)}. "${a.currentWindow.schedule}" is in force now.`
                : `The kiosk runs and no policy stops it within a year. "${a.currentWindow.schedule}" is in force now.`;
        } else if (a.stoppedBy) {
            summary = a.stoppedBy.until
                ? `Off hours until ${formatPlannedTime(a.stoppedBy.until)} (Stop policy "${a.stoppedBy.schedule}"). The kiosk page shows the closed screen; the kiosk server keeps running.`
                : `Off hours (Stop policy "${a.stoppedBy.schedule}"), and no policy starts the kiosk within a year. The kiosk page shows the closed screen; the kiosk server keeps running.`;
        }
        setAutomationText('automation-summary', summary);
    }
    // <Jun Kai end>

    setAutomationText('automation-next-stop', isAuto && a.enabled ? formatPlannedTime(a.nextStop) : '–');
    setAutomationText('automation-next-start', isAuto && a.enabled ? formatPlannedTime(a.nextStart) : '–');
    // <Jun Kai start>
    const planned = isAuto && a.enabled;
    const off = !a.enabled ? 'Automation is off on this machine' : !isAuto ? 'Manual mode: the policies are paused' : null;
    setAutomationText('automation-next-stop-hint', off || (a.nextStop ? `Off hours begin. ${policyIn(a.nextStop)}.` : 'No policy stops the kiosk soon'));
    setAutomationText('automation-next-start-hint', off || (a.nextStart ? 'The kiosk server starts if needed.' : 'No policy starts the kiosk soon'));
    setAutomationText('policy-mode', isAuto ? 'Automatic' : 'Manual');
    // a dry run is said here as well, since the History drawer that also says it is closed most of the time
    setAutomationText('policy-mode-hint', !a.enabled ? 'Automation is switched off on this machine, so nothing runs the policies.' : !isAuto ? 'Policies are paused. Switch back under Controls.' : a.dryRun ? 'Dry run: the policies are followed, but their actions are only logged.' : 'Policies are followed.');
    setAutomationText('policy-now-hint', !planned ? (!a.enabled ? 'Automation is off on this machine' : 'You start and stop it under Controls')
        : a.currentWindow ? `By the policy "${a.currentWindow.schedule}"` : a.stoppedBy ? `Off hours: "${a.stoppedBy.schedule}"` : 'No policy covers this moment');
    // <Jun Kai end>

    setAutomationText('automation-last-tick', a.lastTick ? `Checked ${formatPlannedTime(a.lastTick)}` : (a.enabled ? 'Starting' : 'Off'));
    // <Jun Kai start>
    setAutomationText('automation-mode-hint', isAuto ? 'Automatic mode: policies apply' : 'Manual mode: policies paused');
    // <Jun Kai end>

    // <Jun Kai start>
    scheduleHistory.events = Array.isArray(a.events) ? a.events : [];
    scheduleHistory.total = Number(a.eventsTotal) || scheduleHistory.events.length;
    renderScheduleHistory();
    // <Jun Kai end>
}

// <Jun Kai start>
// History list (18 Nov 2026): when the kiosk stopped and started and why, beside what the schedule did.
// One line: the time, what happened (with a dot: green = running again, amber = stopped in a normal way, red = stopped
// in a way nobody asked for) and the sentence the server wrote. The filter and "Show more" work on the lines already here.
const scheduleHistory = { events: [], total: 0, filter: 'all', shown: 30 };
const HISTORY_STEP = 30;
// What a line is called, its dot and its row: historyLines.js (shared with the page that opens after the PC was off)

function renderScheduleHistory() {
    const list = document.getElementById('automation-events');
    if (!list) return;
    const lines = scheduleHistory.events.map((event) => ({ event, ...scheduleHistoryLine(event) }))
        .filter((line) => scheduleHistory.filter === 'all' || line.group === scheduleHistory.filter);
    const more = document.getElementById('schedule-history-more');
    if (!lines.length) {
        const none = { all: 'Nothing recorded yet', power: 'No start or stop recorded yet', schedule: 'Nothing recorded for the schedule yet' };
        list.innerHTML = `<li class="ui-empty">${none[scheduleHistory.filter]}</li>`;
        if (more) more.hidden = true;
        return;
    }
    list.innerHTML = lines.slice(0, scheduleHistory.shown).map(({ event }) => scheduleHistoryRow(event)).join('');
    if (more) {
        const shown = Math.min(scheduleHistory.shown, lines.length);
        more.hidden = lines.length <= shown;
        setAutomationText('schedule-history-count', `Showing ${shown} of ${lines.length}`);
    }
}

function setScheduleHistoryFilter(filter) {
    scheduleHistory.filter = ['power', 'schedule'].includes(filter) ? filter : 'all';
    scheduleHistory.shown = HISTORY_STEP;
    document.querySelectorAll('#schedule-history-filter .hw-seg-btn').forEach((button) => {
        const active = button.dataset.filter === scheduleHistory.filter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    renderScheduleHistory();
}

function showMoreScheduleHistory() {
    scheduleHistory.shown += HISTORY_STEP;
    renderScheduleHistory();
}
// <Jun Kai end>

// <Jun Kai start>
// History (17 Nov 2026): the automation state and its recent actions in a drawer from the right, opened from the button
// at the top of the page (the same drawer as the incident and hardware settings). It is refreshed when it opens.
function bindScheduleHistory(drawer) {
    if (drawer.dataset.bound) return;
    drawer.dataset.bound = '1';
    drawer.addEventListener('cancel', (event) => { event.preventDefault(); closeScheduleHistory(); });
    drawer.addEventListener('click', (event) => { if (event.target === drawer) closeScheduleHistory(); });
    drawer.addEventListener('close', () => { drawer.classList.remove('is-closing'); });
}

function openScheduleHistory() {
    const drawer = document.getElementById('schedule-history-drawer');
    if (!drawer || typeof drawer.showModal !== 'function') return;
    bindScheduleHistory(drawer);
    drawer.classList.remove('is-closing');
    if (!drawer.open) drawer.showModal();
    scheduleHistory.shown = HISTORY_STEP;
    loadAutomationStatus();
}

function closeScheduleHistory() {
    const drawer = document.getElementById('schedule-history-drawer');
    if (!drawer || !drawer.open || drawer.classList.contains('is-closing')) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        drawer.close();
        return;
    }
    drawer.classList.add('is-closing');
    setTimeout(() => { if (drawer.open) drawer.close(); }, 180);
}
// <Jun Kai end>
