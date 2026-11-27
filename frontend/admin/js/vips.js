// Owner: shared. Previous team: Zah (1), Yu Kang (1).
// Part 29/30 of the admin page: VIP management (load order in admin.html).
// ==================== 31. VIP MANAGEMENT (DONE BY ZAH) ====================

// VIP Data (Active only)
let vipData = [];

// API base (same origin)
const VIP_API_BASE = "/api/admin";

/*
    Expected API (ACTIVE ONLY for this UI):
    GET  /api/admin/vips
    POST /api/admin/vips   { name }
*/
const VIP_API = {
    list: () => `${VIP_API_BASE}/vips`,
    create: () => `${VIP_API_BASE}/vips`,
    delete: (id) => `${VIP_API_BASE}/vips/${id}`
};

// DOM helpers (NEW VIP UI)
function getVipElements() {
    return {
        vipPage: document.getElementById("vip-page"),
        vipList: document.getElementById("vip-list"),
        vipCount: document.getElementById("vip-count")
    };
}

// Safe HTML escape (fallback if global helper not available)
function escapeHtmlSafe(value) {
    if (typeof window.escapeHtml === "function") {
        return window.escapeHtml(value);
    }

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// Date formatter
function formatVipDate(value) {
    if (!value) return "-";

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";

    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); // <Jun Kai/> date only, it fits the card
}

// Fetch helper
async function fetchVipJson(url, options = {}) {
    const res = await fetch(url, options);

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} - ${text}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        return {};
    }

    return res.json();
}

// <Jun Kai start> VIPs as a card on Tree Leaves (admin redesign, VIP B). No prompt, alert or confirm box: the name is
// typed in the card (or taken from a visitor row with Make VIP), each answer shows as a status line, and a removal
// is confirmed inside the row. Only a System Admin sees the card; the VIP routes refuse anyone else anyway.
function canManageVips() {
    return sessionStorage.getItem('userRole') === 'system_admin';
}

function setVipStatus(tone, message) {
    const el = document.getElementById('vip-status');
    if (el) el.innerHTML = message ? uiPill(tone, message) : '';
}

// tells an open tree screen in this browser (also the small copy on Tree Leaves) to read the VIP names again
function signalTreeVipRefresh(name) {
    const stamp = String(Date.now());
    try {
        localStorage.setItem('tree-vip-refresh', stamp);
    } catch (storageError) {
        console.warn('Could not write VIP refresh signal:', storageError);
    }
    window.dispatchEvent(new CustomEvent('tree-vip-refresh', { detail: { timestamp: stamp, name } }));
}

// POST /api/admin/vips; answers { ok, already, error } instead of throwing
async function saveVipName(name) {
    try {
        const res = await fetch(VIP_API.create(), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success !== false) return { ok: true };
        if (res.status === 409) return { already: true };
        return { error: data.error || `The server answered ${res.status}` };
    } catch (err) {
        return { error: 'The server could not be reached' };
    }
}

// Render VIP list (NEW UI)
function renderVipList() {
    const { vipList, vipCount } = getVipElements();
    if (!vipList || !vipCount) return;

    vipCount.textContent = vipData.length === 1 ? '1 VIP' : `${vipData.length} VIPs`;

    if (!vipData.length) {
        vipList.innerHTML = '<div class="ui-empty">No VIPs yet.</div>';
        return;
    }

    const star = uiIcon('star', 16);
    const bin = uiIcon('trash', 16);
    vipList.innerHTML = vipData.map((vip, index) => {
        const name = escapeHtmlSafe(vip.name ?? '');
        const added = formatVipDate(vip.created_at ?? vip.createdAt);
        return `<div class="dt-vip-row" data-vip-index="${index}">`
            + `<span class="dt-vip-star">${star}</span>`
            + `<span class="dt-vip-name"><b title="${name}">${name}</b><small>Added ${escapeHtmlSafe(added)}</small></span>`
            + `<button type="button" class="ui-btn ui-btn-icon ui-danger" data-vip-action="ask" aria-label="Remove ${name}" title="Remove">${bin}</button>`
            + '</div>';
    }).join('');
}

// a click on a bin asks inside the row first; Remove then deletes, Keep puts the row back
function vipListClick(event) {
    const button = event.target.closest('[data-vip-action]');
    const row = button && button.closest('.dt-vip-row');
    if (!row) return;
    const vip = vipData[Number(row.dataset.vipIndex)];
    if (!vip) return;
    const action = button.dataset.vipAction;
    if (action === 'keep') {
        renderVipList();
    } else if (action === 'remove') {
        deleteVip(vip.name);
    } else if (action === 'ask') {
        const name = escapeHtmlSafe(vip.name ?? '');
        row.classList.add('is-asking');
        row.innerHTML = `<span class="dt-vip-name"><b title="${name}">Remove ${name}?</b><small>The leaf turns green again.</small></span>`
            + '<button type="button" class="ui-btn ui-btn-danger" data-vip-action="remove">Remove</button>'
            + '<button type="button" class="ui-btn ui-btn-secondary" data-vip-action="keep">Keep</button>';
        row.querySelector('[data-vip-action="keep"]').focus();
    }
}

// Load VIPs
async function loadVipData() {
    const { vipList, vipCount } = getVipElements();
    if (!vipList || !vipCount || !canManageVips()) return;
    if (!vipList.dataset.ready) {
        vipList.dataset.ready = '1';
        vipList.addEventListener('click', vipListClick);
    }

    try {
        const res = await fetchVipJson(VIP_API.list(), { credentials: 'include' });
        // Support formats: [ ... ] OR { vips: [...] } OR { data: [...] }
        vipData = Array.isArray(res) ? res : (res.vips || res.data || []);
        renderVipList();
    } catch (err) {
        console.error('VIP load error:', err);
        vipCount.textContent = 'Error';
        vipList.innerHTML = '';
        setVipStatus('down', 'The VIPs could not be loaded.');
    }
}

// Loader used by showPage('vip'): VIPs have no page of their own any more, so the VIPs link and any old call land on
// Tree Leaves with the VIP card in view
function loadVipManagementData() {
    if (typeof showPage === 'function') showPage('digital-tree');
    if (typeof scrollTreeLeavesToVips === 'function') scrollTreeLeavesToVips();
}

window.loadVipManagementData = loadVipManagementData;

// Add VIP from the name box
async function addVip() {
    const input = document.getElementById('vip-name-input');
    const button = document.getElementById('vip-add-btn');
    const name = input ? input.value.trim() : '';
    if (name.length < 2) {
        setVipStatus('warn', 'Type a name of at least 2 letters.');
        if (input) input.focus();
        return;
    }
    if (button) button.disabled = true;
    const result = await saveVipName(name);
    if (button) button.disabled = false;
    if (result.ok) {
        if (input) input.value = '';
        setVipStatus('ok', `${name} is now a VIP.`);
        signalTreeVipRefresh(name);
        if (typeof markTreeVip === 'function') markTreeVip(name, true);
        loadVipData();
    } else if (result.already) {
        setVipStatus('info', `${name} is already a VIP.`);
    } else {
        setVipStatus('down', `${name} was not added: ${result.error}.`);
    }
}

// Make VIP on a visitor row of Tree Leaves: the name exactly as the tree has it
async function makeVip(name, button) {
    if (!canManageVips() || !name) return;
    if (button) button.disabled = true;
    const result = await saveVipName(name);
    if (result.ok) {
        setTreeLeavesStatus('ok', `${name} is now a VIP`);
        signalTreeVipRefresh(name);
        markTreeVip(name, true);
        loadVipData();
    } else if (result.already) {
        setTreeLeavesStatus('info', `${name} is already a VIP`);
        markTreeVip(name, true);
        loadVipData();
    } else {
        if (button) button.disabled = false;
        setTreeLeavesStatus('down', `${name} was not made a VIP: ${result.error}`);
    }
}

// Delete VIP (Done by Yu Kang); asked inside the row first since the redesign
async function deleteVip(vipName) {
    if (!vipName || typeof vipName !== 'string' || vipName.trim().length < 2) {
        setVipStatus('down', 'That VIP name is not valid.');
        return;
    }

    try {
        const response = await fetch(`/api/admin/vips/${encodeURIComponent(vipName.trim())}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to delete VIP');
        }
        setVipStatus('ok', `${vipName} is no longer a VIP.`);
        signalTreeVipRefresh(vipName);
        if (typeof markTreeVip === 'function') markTreeVip(vipName, false);
        await loadVipData();
    } catch (err) {
        console.error('Delete VIP error:', err);
        setVipStatus('down', `${vipName} was not removed: ${err.message || 'Failed to delete VIP'}.`);
        renderVipList();
    }
}

// Expose for HTML onclick
window.addVip = addVip;
window.deleteVip = deleteVip;
// <Jun Kai end>
