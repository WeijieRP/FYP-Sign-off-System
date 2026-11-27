// Owner: Role 1, Zihan. Previous team: XY (Xuanyang) (2).
// Part 23/30 of the admin page: pledgeboard management (load order in admin.html).
// ==================== 26. PLEDGEBOARD MANAGEMENT ====================
// <Jun Kai start> Pledgeboard A (admin redesign, picked by the team): the pledges waiting for a decision get their own
// card on top with Approve and Reject, and the ranking table follows with status chips. The function names that the
// rest of the admin page calls (loadAdminPledgeboard, filterPledgeboardData, clearPledgeboardSearch, the pager) and the
// two API calls are the same as before.
const PLEDGE_STATUS_TEXT = { approved: 'Approved', pending: 'Waiting', rejected: 'Rejected' };
const PLEDGE_STATUS_TAG = { approved: 'is-green', pending: 'is-amber', rejected: 'is-red' };
const PLEDGE_TONE_TEXT = { negative: 'Negative tone', neutral: 'Neutral', positive: 'Positive', needs_review: 'Needs review' };
const PLEDGE_AVATAR_COLOURS = ['#db2777', '#d97706', '#7c3aed', '#0d9488', '#059669', '#4f46e5', '#b45309', '#2563eb', '#0891b2', '#be123c'];
const PLEDGE_HEART = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"></path></svg>';
let pledgeboardIconsReady = false;
const pledgeboardBusy = new Set(); // pledge ids with a decision on its way

// the public board shows only approved pledges, so any other state (an old "flagged" too) waits for a decision
const pledgeStatusOf = (pledge) => (pledge.moderation_status === 'approved' || pledge.moderation_status === 'rejected' ? pledge.moderation_status : 'pending');
const pledgeToneOf = (pledge) => (pledge.metadata && PLEDGE_TONE_TEXT[pledge.metadata.pledgeSentiment] ? pledge.metadata.pledgeSentiment : 'neutral');

function pledgeboardSay(text, kind = 'ok') {
    const box = document.getElementById('pledgeboard-status');
    if (!box) return;
    box.textContent = text || '';
    box.dataset.kind = kind;
    box.hidden = !text;
}

function pledgeDate(value) {
    const date = new Date(value);
    return isNaN(date) ? '' : date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// a round badge with the visitor's initials; the colour is a custom property, so dark mode leaves it as it is
function pledgeAvatar(name) {
    const text = String(name || '').trim();
    const initials = text.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
    let hash = 0;
    for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return `<span class="pb-avatar" style="--pb-avatar: ${PLEDGE_AVATAR_COLOURS[hash % PLEDGE_AVATAR_COLOURS.length]};" aria-hidden="true">${escapeHtml(initials)}</span>`;
}

function preparePledgeboardIcons() {
    if (pledgeboardIconsReady || typeof uiIcon !== 'function') return;
    pledgeboardIconsReady = true;
    document.querySelectorAll('#pledgeboard-page [data-fb-icon]').forEach((slot) => {
        slot.innerHTML = uiIcon(slot.dataset.fbIcon, slot.tagName === 'BUTTON' ? 15 : 14);
    });
}
// <Jun Kai end>

// Load pledgeboard data from API
async function loadAdminPledgeboard() {
    preparePledgeboardIcons(); // <Jun Kai/>
    try {
        const response = await fetch('/api/pledgeboard/admin/pledges?status=all');
        const data = await response.json();

        if (data.success) {
            allPledgeboardData = data.pledges;
            filteredPledgeboardData = data.pledges;
            pledgeboardCurrentPage = 1;
            pledgeboardSay(''); // <Jun Kai/>
            filterPledgeboardData(); // <Jun Kai/> keeps the search and the status chip that were chosen
        } else {
            console.error('Failed to load pledgeboard:', data.message || data.error); // <Jun Kai/> the route answers with "error"
            pledgeboardLoadFailed(data.message || data.error); // <Jun Kai/>
        }
    } catch (error) {
        console.error('Error loading pledgeboard:', error);
        pledgeboardLoadFailed(error.message); // <Jun Kai/>
    }
}

// <Jun Kai start> the page says so instead of staying on "Loading"
function pledgeboardLoadFailed(reason) {
    const body = document.getElementById('pledgeboard-table-body');
    const list = document.getElementById('pledgeboard-waiting-list');
    if (body) body.innerHTML = '<tr><td colspan="7" class="ui-empty">The pledges could not be loaded.</td></tr>';
    if (list) list.innerHTML = '<div class="ui-empty pb-decide-empty">The pledges could not be loaded.</div>';
    pledgeboardSay(`The pledges could not be loaded${reason ? ': ' + reason : ''}. Use Refresh to try again.`, 'error');
}
// <Jun Kai end>

// Filter pledgeboard data by search term
function filterPledgeboardData() {
    // <Jun Kai start> the search box and the status chip together
    const searchInput = document.getElementById('pledgeboard-search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const chosen = document.querySelector('#pledgeboard-page input[name="pledgeboard-status"]:checked');
    const status = chosen ? chosen.value : '';
    filteredPledgeboardData = allPledgeboardData.filter((pledge) =>
        (!status || pledgeStatusOf(pledge) === status) &&
        (!searchTerm || String(pledge.name || '').toLowerCase().includes(searchTerm) || String(pledge.pledge || '').toLowerCase().includes(searchTerm)));
    const clear = document.getElementById('pledgeboard-clear-btn');
    if (clear) clear.hidden = !searchTerm && !status;
    // after a decision the same page stays (unless it is empty now); a new search starts at page 1
    const keepPage = filterPledgeboardData.keepPage === true;
    filterPledgeboardData.keepPage = false;
    const pages = Math.max(1, Math.ceil(filteredPledgeboardData.length / pledgeboardItemsPerPage));
    pledgeboardCurrentPage = keepPage ? Math.min(pledgeboardCurrentPage, pages) : 1;
    // <Jun Kai end>
    renderPledgeboardPage();
}

// Clear pledgeboard search
function clearPledgeboardSearch() {
    const searchInput = document.getElementById('pledgeboard-search-input');
    if (searchInput) {
        searchInput.value = '';
    }
    // <Jun Kai start> back to All as well
    const all = document.querySelector('#pledgeboard-page input[name="pledgeboard-status"][value=""]');
    if (all) all.checked = true;
    // <Jun Kai end>
    filterPledgeboardData();
}

// Render current page of pledgeboard
function renderPledgeboardPage() {
    // <Jun Kai start> the counts, the waiting card and the ranking table
    const tableBody = document.getElementById('pledgeboard-table-body');
    if (!tableBody) return;

    const counts = { approved: 0, pending: 0, rejected: 0 };
    allPledgeboardData.forEach((pledge) => { counts[pledgeStatusOf(pledge)]++; });
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText('pledgeboard-count', allPledgeboardData.length);
    setText('pledgeboard-count-all', allPledgeboardData.length);
    setText('pledgeboard-count-approved', counts.approved);
    setText('pledgeboard-count-pending', counts.pending);
    setText('pledgeboard-count-rejected', counts.rejected);
    renderPledgeWaitingList();

    if (filteredPledgeboardData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="ui-empty">${allPledgeboardData.length ? 'No pledge matches the search or the chosen status.' : 'No pledges yet.'}</td></tr>`;
        updatePledgeboardPaginationControls();
        return;
    }

    const startIndex = (pledgeboardCurrentPage - 1) * pledgeboardItemsPerPage;
    const pageData = filteredPledgeboardData.slice(startIndex, startIndex + pledgeboardItemsPerPage);
    const rankOf = new Map(allPledgeboardData.map((row, index) => [Number(row.id), index + 1]));
    tableBody.innerHTML = pageData.map((pledge) => {
        const status = pledgeStatusOf(pledge);
        const tone = pledgeToneOf(pledge);
        // the rank is the place among all pledges (most liked first), also when the list is filtered
        const rank = rankOf.get(Number(pledge.id)) || '';
        return `
            <tr>
                <td class="pb-rank">#${rank}</td>
                <td><span class="pb-person">${pledgeAvatar(pledge.name)}<b>${escapeHtml(pledge.name)}</b></span></td>
                <td class="pb-pledge">${escapeHtml(pledge.pledge)}</td>
                <td class="pb-likes"><span class="pb-heart">${PLEDGE_HEART}</span>${Number(pledge.like_count) || 0}</td>
                <td><span class="ui-tag ${PLEDGE_STATUS_TAG[status]}">${PLEDGE_STATUS_TEXT[status]}</span><span class="pb-tone">${PLEDGE_TONE_TEXT[tone]}</span></td>
                <td class="pb-date">${escapeHtml(pledgeDate(pledge.created_at))}</td>
                <td class="pb-col-actions">${renderPledgeModerationButtons(pledge.id, status, tone)}</td>
            </tr>`;
    }).join('');
    // <Jun Kai end>

    updatePledgeboardPaginationControls();
}

// <Jun Kai start> the card on top: every pledge that waits for a decision, most liked first
function renderPledgeWaitingList() {
    const list = document.getElementById('pledgeboard-waiting-list');
    const count = document.getElementById('pledgeboard-waiting-count');
    if (!list) return;
    const waiting = allPledgeboardData.filter((pledge) => pledgeStatusOf(pledge) === 'pending');
    if (count) {
        count.textContent = waiting.length;
        count.classList.toggle('is-zero', waiting.length === 0);
    }
    if (!waiting.length) {
        list.innerHTML = '<div class="ui-empty pb-decide-empty">Nothing is waiting. A pledge with a negative tone shows up here before it can go on the public board.</div>';
        return;
    }
    list.innerHTML = waiting.map((pledge) => {
        const likes = Number(pledge.like_count) || 0;
        const busy = pledgeboardBusy.has(Number(pledge.id));
        const name = escapeHtml(pledge.name);
        return `
            <div class="pb-decide-row">
                ${pledgeAvatar(pledge.name)}
                <div class="pb-decide-text">
                    <div class="pb-decide-meta"><b>${name}</b> · ${escapeHtml(pledgeDate(pledge.created_at))} · ${PLEDGE_TONE_TEXT[pledgeToneOf(pledge)]} · ${likes} ${likes === 1 ? 'like' : 'likes'}</div>
                    <div class="pb-decide-quote">${escapeHtml(pledge.pledge)}</div>
                </div>
                <div class="pb-decide-actions">
                    <button type="button" class="ui-btn ui-btn-primary" onclick="updatePledgeModerationStatus(${Number(pledge.id)}, 'approved')" ${busy ? 'disabled' : ''} aria-label="Approve the pledge of ${name}">Approve</button>
                    <button type="button" class="ui-btn ui-btn-secondary pb-reject" onclick="updatePledgeModerationStatus(${Number(pledge.id)}, 'rejected')" ${busy ? 'disabled' : ''} aria-label="Reject the pledge of ${name}">Reject</button>
                </div>
            </div>`;
    }).join('');
}
// <Jun Kai end>

// Pledge moderation controls for negative/admin-reviewed pledges (DONE BY XY)
function renderPledgeModerationButtons(feedbackId, currentStatus, sentiment) {
    if (sentiment !== 'negative' && currentStatus === 'approved') {
        return '<span class="pledge-auto-approved">Auto-approved</span>';
    }

    // <Jun Kai start> only the choices that change something: the two other states of this pledge
    const choices = [
        { value: 'approved', label: 'Approve' },
        { value: 'rejected', label: 'Reject' },
        { value: 'pending', label: 'Back to waiting' }
    ].filter((choice) => choice.value !== currentStatus);
    const busy = pledgeboardBusy.has(Number(feedbackId));
    return `
        <div class="pb-actions">
            ${choices.map((choice) => `
                <button type="button" class="ui-btn ui-btn-secondary pb-small${choice.value === 'rejected' ? ' pb-reject' : ''}"
                    onclick="updatePledgeModerationStatus(${Number(feedbackId)}, '${choice.value}')" ${busy ? 'disabled' : ''}>${choice.label}</button>`).join('')}
        </div>`;
    // <Jun Kai end>
}

// Save pledge moderation status from admin page (DONE BY XY)
async function updatePledgeModerationStatus(feedbackId, status) {
    // <Jun Kai start> one decision at a time per pledge, its buttons switched off meanwhile
    const id = Number(feedbackId);
    if (pledgeboardBusy.has(id)) return;
    pledgeboardBusy.add(id);
    renderPledgeboardPage();
    // <Jun Kai end>
    try {
        const response = await fetch(`/api/pledgeboard/admin/pledges/${feedbackId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status,
                username: sessionStorage.getItem('loggedUser') || 'admin'
            })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to update pledge status');
        }

        const updateRow = pledge => (
            Number(pledge.id) === Number(feedbackId)
                ? {
                    ...pledge,
                    moderation_status: status,
                    metadata: {
                        ...(pledge.metadata || {}),
                        pledgeStatus: status
                    }
                }
                : pledge
        );

        allPledgeboardData = allPledgeboardData.map(updateRow);
        filteredPledgeboardData = filteredPledgeboardData.map(updateRow);
        // <Jun Kai start>
        const pledge = allPledgeboardData.find((row) => Number(row.id) === id);
        const who = pledge ? `The pledge of ${pledge.name}` : 'The pledge';
        pledgeboardSay(status === 'approved' ? `${who} is approved and shows on the public board.`
            : status === 'rejected' ? `${who} is rejected and stays off the public board.`
                : `${who} is waiting for a decision again.`, 'ok');
        // <Jun Kai end>
    } catch (error) {
        console.error('Error updating pledge moderation status:', error);
        pledgeboardSay('The decision was not saved: ' + error.message, 'error'); // <Jun Kai/> a line on the page instead of a popup
    } finally {
        // <Jun Kai start>
        pledgeboardBusy.delete(id);
        filterPledgeboardData.keepPage = true; // a decided pledge leaves a filtered view, the page stays
        filterPledgeboardData();
        // <Jun Kai end>
    }
}

// Update pledgeboard pagination controls
function updatePledgeboardPaginationControls() {
    const totalPages = Math.ceil(filteredPledgeboardData.length / pledgeboardItemsPerPage);
    const pageInfo = document.getElementById('pledgeboard-page-info');
    const prevBtn = document.getElementById('prev-pledgeboard-btn');
    const nextBtn = document.getElementById('next-pledgeboard-btn');

    if (pageInfo) {
        // <Jun Kai start>
        const total = filteredPledgeboardData.length;
        const first = total ? (pledgeboardCurrentPage - 1) * pledgeboardItemsPerPage + 1 : 0;
        const last = Math.min(total, pledgeboardCurrentPage * pledgeboardItemsPerPage);
        pageInfo.textContent = total ? `Showing ${first} to ${last} of ${total}` : 'Nothing to show';
        // <Jun Kai end>
    }

    if (prevBtn) {
        prevBtn.disabled = pledgeboardCurrentPage === 1;
    }

    if (nextBtn) {
        nextBtn.disabled = pledgeboardCurrentPage >= totalPages;
    }
}

// Navigate to previous pledgeboard page
function prevPledgeboardPage() {
    if (pledgeboardCurrentPage > 1) {
        pledgeboardCurrentPage--;
        renderPledgeboardPage();
    }
}

// Navigate to next pledgeboard page
function nextPledgeboardPage() {
    const totalPages = Math.ceil(filteredPledgeboardData.length / pledgeboardItemsPerPage);
    if (pledgeboardCurrentPage < totalPages) {
        pledgeboardCurrentPage++;
        renderPledgeboardPage();
    }
}
