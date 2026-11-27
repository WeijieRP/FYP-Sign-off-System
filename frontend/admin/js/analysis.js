// Owner: Role 3, Jun Kai. Previous team: Yu Kang (12).
// Part 10/30 of the admin page: feedback sentiment analysis (load order in admin.html).
// ==================== Feedback Sentiment Analysis ====================

// Switch between feedback report tabs
function switchFeedbackTab(tabId) {

    // Hide all contents
    document.querySelectorAll('.feedback-tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Remove active from buttons
    document.querySelectorAll('.feedback-tab').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabId).classList.add('active');

    // Activate clicked button
    event.currentTarget.classList.add('active');
}


// Escape HTML to prevent XSS
function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


async function loadFlaggedFeedback() {
    const tbody = document.getElementById('flagged-feedback-table-body');
    const summary = document.getElementById('flagged-feedback-summary');

    if (!tbody) return;
    prepareFeedbackReportsPage(); // <Jun Kai/>

    tbody.innerHTML = '<tr><td colspan="6" class="fr-empty">Loading flagged feedback...</td></tr>'; // <Jun Kai/>

    try {
        const response = await fetch('/api/admin/flagged-feedback', {
            credentials: 'include',
            headers: {
                'x-username': sessionStorage.getItem('loggedUser')
            }
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to load flagged feedback');
        }

        renderFlaggedFeedback(data.flagged || [], data.feedbackCount || 0); // <Jun Kai/> it also writes the summary and the count
    } catch (error) {
        console.error('Error loading flagged feedback:', error);
        // <Jun Kai start>
        tbody.innerHTML = `<tr><td colspan="6" class="fr-empty is-error">Unable to load flagged feedback<br><small>${escapeHtmlSafe(error.message)}</small></td></tr>`;
        const count = document.getElementById('flagged-count');
        if (count) count.hidden = true;
        // <Jun Kai end>

        if (summary) {
            summary.textContent = 'Flagged feedback could not be loaded. Check the server logs if this repeats.';
        }
    }
}

function renderFlaggedFeedback(items, feedbackCount) {
    const tbody = document.getElementById('flagged-feedback-table-body');
    if (!tbody) return;

    // <Jun Kai start> the red count next to the title and one sentence under it
    const count = document.getElementById('flagged-count');
    const summary = document.getElementById('flagged-feedback-summary');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="fr-empty">No flagged feedback. Nothing is hidden from the tree page.</td></tr>';
        if (count) count.hidden = true;
        if (summary) summary.textContent = 'Keyword analysis checks feedback answers and visitor comments. Flagged submissions are hidden from the tree page.';
        return;
    }
    // <Jun Kai end>

    // Aggregate items by feedback_id so we display one row per feedback entry.
    const grouped = {};
    items.forEach(item => {
        const id = item.feedback_id || 'unknown';
        if (!grouped[id]) {
            grouped[id] = {
                feedback_id: id,
                name: item.name || 'Anonymous',
                date: item.date || '-',
                matchedKeywords: [],
                answers: [],
                comment: ''
            };
        }

        // collect keywords
        if (Array.isArray(item.matchedKeywords)) {
            grouped[id].matchedKeywords.push(...item.matchedKeywords);
        }

        // distinguish answer vs comment
        if ((item.source || '').toLowerCase() === 'answer') {
            if (item.text) grouped[id].answers.push(item.text);
        } else {
            // treat other sources (including Comment) as pledge/comment text
            if (item.text) grouped[id].comment = grouped[id].comment ? grouped[id].comment + ' ' + item.text : item.text;
        }
    });

    // <Jun Kai start> one row per submission: where the flagged words were (feedback, pledge or both), the words as tags,
    // and "none" for a text that was not flagged
    const none = '<span class="fr-none">none</span>';
    const rows = Object.values(grouped).map(entry => {
        const uniqueKeywords = Array.from(new Set(entry.matchedKeywords || []));
        const keywordBadges = uniqueKeywords.map(k => `<span class="ui-tag is-amber">${escapeHtmlSafe(k)}</span>`).join('');
        const feedbackText = (entry.answers || []).join('; ');
        const pledgeText = entry.comment || '';
        const source = feedbackText && pledgeText ? 'Feedback and pledge' : pledgeText ? 'Pledge' : 'Feedback';

        return `
            <tr data-feedback-id="${escapeHtmlSafe(entry.feedback_id)}">
                <td class="fr-date">${escapeHtmlSafe(formatFlaggedDate(entry.date))}</td>
                <td>${escapeHtmlSafe(entry.name)}</td>
                <td>${source}</td>
                <td><div class="flagged-keyword-list">${keywordBadges}</div></td>
                <td class="flagged-feedback-text">${feedbackText ? escapeHtmlSafe(feedbackText) : none}</td>
                <td class="flagged-pledge-text">${pledgeText ? escapeHtmlSafe(pledgeText) : none}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rows;

    const submissions = Object.keys(grouped).length;
    if (count) {
        count.textContent = String(submissions);
        count.hidden = false;
    }
    if (summary) {
        const texts = items.length;
        summary.textContent = `${texts} flagged text${texts === 1 ? '' : 's'} in ${submissions} submission${submissions === 1 ? '' : 's'}. These submissions are hidden from the tree page.`;
    }
    // <Jun Kai end>
}

// <Jun Kai start>
// The modes that run an AI model (Xenova on this server, Qwen, Gemma and LocalGPT through Ollama) follow the Local AI
// models switch of the incident settings: off, they cannot be chosen (the server refuses them too). Run when Feedback
// Reports opens (navigation.js).
const ANALYSIS_MODEL_MODES = ['xenova', 'qwen', 'gemma', 'localgpt'];
async function refreshAnalysisModes() {
    const select = document.getElementById('analysis-mode');
    if (!select) return;
    let localAi = true;
    try {
        const response = await fetch('/api/admin/ai-settings', { cache: 'no-store' }); // <Jun Kai/> the AI Settings page
        const data = await response.json();
        if (response.ok && data.success && data.effective) localAi = data.effective.reportModels !== false;
    } catch {
        // the server refuses those modes anyway while they are off
    }
    for (const option of select.options) {
        if (!ANALYSIS_MODEL_MODES.includes(option.value)) continue;
        if (!option.dataset.label) option.dataset.label = option.textContent;
        option.disabled = !localAi;
        option.textContent = localAi ? option.dataset.label : `${option.dataset.label} (off)`;
    }
    if (!localAi && ANALYSIS_MODEL_MODES.includes(select.value)) {
        select.value = 'rule-based';
        updateAnalysisTitle();
    }
    const note = document.getElementById('analysis-mode-note');
    if (note) note.hidden = localAi;
    renderAnalysisModes();
}

// Feedback Reports A: the five modes as one switch. The hidden select stays the source of truth, so the analysis and
// refreshAnalysisModes (which turns the AI modes off) work as before; the switch only mirrors it.
function renderAnalysisModes() {
    const select = document.getElementById('analysis-mode');
    const box = document.getElementById('fr-modes');
    if (!select || !box) return;
    box.innerHTML = [...select.options].map((option) => `
        <button type="button" role="radio" data-mode="${escapeHtmlSafe(option.value)}" aria-checked="${option.value === select.value}"
            ${option.disabled ? 'disabled title="Switched off on the AI Settings page"' : ''}>${escapeHtmlSafe(option.textContent)}</button>`).join('');
}

let feedbackReportsReady = false;
function prepareFeedbackReportsPage() {
    if (feedbackReportsReady) return;
    feedbackReportsReady = true;
    document.querySelectorAll('#feedback-report-page [data-fb-icon]').forEach((slot) => {
        slot.innerHTML = uiIcon(slot.dataset.fbIcon, slot.tagName === 'BUTTON' ? 18 : 15);
    });
    renderAnalysisModes();
    document.getElementById('fr-modes').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-mode]');
        if (!button || button.disabled) return;
        document.getElementById('analysis-mode').value = button.dataset.mode;
        updateAnalysisTitle();
        renderAnalysisModes();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || document.getElementById('ai-cache-panel').hidden) return;
        if (document.querySelector('dialog[open]')) return; // <Jun Kai/> a kit window above the panel closes first
        closeAiCachePanel();
    });
}

function openAiCachePanel() {
    const panel = document.getElementById('ai-cache-panel');
    panel.hidden = false;
    document.getElementById('feedback-report-page').classList.add('ui-has-sidepanel');
    document.getElementById('ai-cache-title').focus({ preventScroll: true });
    loadCacheStorageMode();
}

function closeAiCachePanel() {
    const panel = document.getElementById('ai-cache-panel');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.getElementById('feedback-report-page').classList.remove('ui-has-sidepanel');
    document.getElementById('ai-cache-open').focus({ preventScroll: true });
}

// "21 Nov, 09:58" for a date the browser can read; anything else is shown as it came
function formatFlaggedDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return value || '-';
    return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
// <Jun Kai end>

// Update feedback analysis title based on selected mode (Done by Yu Kang)
function updateAnalysisTitle() {
    const select = document.getElementById('analysis-mode');
    const title = document.getElementById('feedback-analysis-header');

    if (!select || !title) return;

    const selectedText =
        select.options[select.selectedIndex].text;

    title.textContent =
        `Feedback analysis (${selectedText})`; // <Jun Kai/> the new page's sentence case
}

// Done by Yu Kang
// Analyze and display all feedback answer values
async function analyzeFeedbackDataLegacy() {
    const resultsContainer = document.getElementById('feedback-analysis-results');
    const output = document.getElementById('feedback-analysis-output');

    if (!resultsContainer || !output) {
        return;
    }

    resultsContainer.style.display = 'block';
    output.innerHTML = `
        <div style="padding: 20px; color: #64748b; text-align: center;">
            Analyzing feedback sentiment...
        </div>
    `;

    try {
        const response = await fetch('/api/admin/feedback-insight-summary', {
            headers: {
                'x-username': sessionStorage.getItem('loggedUser')
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to analyze feedback');
        }

        const { positive, neutral, negative, total } = data.sentiment;
        
        output.innerHTML = `
            <div style="display: flex; gap: 30px; align-items: center;">
                <div style="flex: 1; position: relative; height: 300px;">
                    <canvas id="sentimentChart"></canvas>
                </div>
                <div style="flex: 0.6; padding: 20px; background: #f8fafc; border-radius: 8px;">
                    <div style="margin-bottom: 15px; font-size: 14px;">
                        <div style="color: #475569; margin-bottom: 12px;">
                            <strong style="color: #10b981;">✓ Positive:</strong> ${positive} (${total > 0 ? ((positive/total)*100).toFixed(1) : 0}%)
                        </div>
                        <div style="color: #475569; margin-bottom: 12px;">
                            <strong style="color: #f59e0b;">◆ Neutral:</strong> ${neutral} (${total > 0 ? ((neutral/total)*100).toFixed(1) : 0}%)
                        </div>
                        <div style="color: #475569;">
                            <strong style="color: #ef4444;">✗ Negative:</strong> ${negative} (${total > 0 ? ((negative/total)*100).toFixed(1) : 0}%)
                        </div>
                    </div>
                    <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 13px; color: #64748b;">
                        <strong>Total answers analyzed:</strong> ${total}
                    </div>
                </div>
            </div>
        `;

        // Create sentiment chart
        //setTimeout(() => createSentimentChart(positive, neutral, negative), 100);
        requestAnimationFrame(() => {
            createSentimentChart(positive, neutral, negative);
        });
        
    } catch (error) {
        console.error('Error analyzing feedback sentiment:', error);
        output.innerHTML = `
            <div style="padding: 20px; color: #ef4444; text-align: center;">
                Error analyzing feedback sentiment<br>
                <small>${escapeHtml(error.message)}</small>
            </div>
        `;
    }
}

// Render AI Insight Summary category cards (Done by Yu Kang)
// <Jun Kai start> tone is a class of the page ("is-negative", "is-positive") instead of an inline colour
function renderInsightPanel(title, items, tone, emptyText) {
    const content = items.length
        ? items.map(item => `
            <div class="fr-panel-item">
                <div class="fr-panel-row">
                    <strong>${escapeHtml(item.label)}</strong>
                    <span class="fr-panel-count">${Number(item.count || 0)}</span>
                </div>
                ${(item.examples || []).map(example => `<blockquote>${escapeHtml(example.text)}</blockquote>`).join('')}
            </div>
        `).join('')
        : `<p class="fr-panel-empty">${escapeHtml(emptyText)}</p>`;

    return `
        <section class="fr-panel ${tone}">
            <h4>${escapeHtml(title)}</h4>
            ${content}
        </section>
    `;
}
// <Jun Kai end>

// Render AI Insight Summary suggested admin action cards (Done by Yu Kang)
function renderActionPanel(title, items) {
    // <Jun Kai start> styled by the page's classes
    const content = items.length
        ? items.map(item => `
            <div class="fr-panel-item">
                <div class="fr-panel-row">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span class="ui-tag is-blue">${escapeHtml(item.priority || 'Medium')}</span>
                </div>
                <p>${escapeHtml(item.action)}</p>
            </div>
        `).join('')
        : '<p class="fr-panel-empty">No action needed yet.</p>';

    return `
        <section class="fr-panel is-action">
            <h4>${escapeHtml(title)}</h4>
            ${content}
        </section>
    `;
    // <Jun Kai end>
}

function getFeedbackInsightsBySentiment(sentiment) {
    const items = Array.isArray(window.latestFeedbackInsightItems) ? window.latestFeedbackInsightItems : [];
    return items.filter(item => String(item.sentiment || '').toLowerCase() === sentiment);
}

// <Jun Kai start> closes the insights window; now=true removes it at once (a new one is about to open)
function closeFeedbackInsightsModal(now = false) {
    const modal = document.getElementById('feedback-insights-modal');
    if (!modal) return;
    if (now) modal.remove();
    else closeKitViewer(modal);
}
// <Jun Kai end>

// Filter feedback items by date range (Done by Yu Kang)
function filterFeedbackItemsByDate(items, fromDate, toDate) {
    return items.filter(item => {
        if (!item.date) return false;

        const itemDate = new Date(item.date);

        if (fromDate) {
            const start = new Date(fromDate);
            start.setHours(0, 0, 0, 0);

            if (itemDate < start) return false;
        }

        if (toDate) {
            const end = new Date(toDate);
            end.setHours(23, 59, 59, 999);

            if (itemDate > end) return false;
        }

        return true;
    });
}

// Open modal to view feedback insights by sentiment (Done by Yu Kang)
// <Jun Kai start> rebuilt as a kit window: the date filter on top, each item as plain text (visitor words never become
// HTML), the count in a status pill under the title; Escape or Close closes it
function openFeedbackInsightsModal(sentiment) {
    const normalizedSentiment = String(sentiment || '').toLowerCase();
    const items = getFeedbackInsightsBySentiment(normalizedSentiment);
    const titleMap = { positive: 'Positive feedback', neutral: 'Neutral feedback', negative: 'Negative feedback' };
    const toneMap = { positive: 'ok', neutral: 'warn', negative: 'down' };

    closeFeedbackInsightsModal(true);
    const { dialog, body } = openKitViewer({ className: 'insights-popup', title: titleMap[normalizedSentiment] || 'Feedback', wide: true });
    dialog.id = 'feedback-insights-modal';
    const head = dialog.querySelector('.va-dialog-head > div');
    const count = document.createElement('div');
    count.className = 'va-dialog-sub kit-insight-count';
    head.appendChild(count);
    const showCount = (n) => { count.innerHTML = uiPill(toneMap[normalizedSentiment] || 'muted', `${n} ${n === 1 ? 'item' : 'items'}`); };

    const filter = document.createElement('div');
    filter.className = 'kit-insight-filter';
    filter.innerHTML = `
        <div class="ui-field"><label class="ui-label" for="feedbackDateFrom">From</label><input type="date" id="feedbackDateFrom" class="ui-input"></div>
        <div class="ui-field"><label class="ui-label" for="feedbackDateTo">To</label><input type="date" id="feedbackDateTo" class="ui-input"></div>
        <button type="button" id="applyFeedbackDateFilter" class="ui-btn ui-btn-primary">Apply</button>
        <button type="button" id="clearFeedbackDateFilter" class="ui-btn ui-btn-secondary">Clear</button>`;
    const list = document.createElement('div');
    list.id = 'feedbackModalContent';
    list.className = 'kit-insight-list';
    body.append(filter, list);

    const renderItems = (shown) => {
        list.replaceChildren();
        if (!shown.length) {
            const empty = document.createElement('p');
            empty.className = 'kit-viewer-empty';
            empty.textContent = items.length ? 'No feedback in these dates.' : `No ${normalizedSentiment} feedback was found for the selected analysis window.`;
            list.appendChild(empty);
        }
        shown.forEach((item) => {
            const row = document.createElement('article');
            row.className = 'kit-insight';
            const top = document.createElement('div');
            top.className = 'kit-insight-head';
            const source = document.createElement('strong');
            source.textContent = item.source || 'Feedback';
            const date = document.createElement('span');
            date.className = 'kit-insight-date';
            date.textContent = item.date || '';
            top.append(source, date);
            row.appendChild(top);
            if (item.question) {
                const question = document.createElement('p');
                question.className = 'kit-insight-q';
                question.textContent = item.question;
                row.appendChild(question);
            }
            const text = document.createElement('p');
            text.className = 'kit-insight-text';
            text.textContent = item.text || '';
            row.appendChild(text);
            list.appendChild(row);
        });
        showCount(shown.length);
    };

    filter.querySelector('#applyFeedbackDateFilter').addEventListener('click', () => {
        renderItems(filterFeedbackItemsByDate(items, filter.querySelector('#feedbackDateFrom').value, filter.querySelector('#feedbackDateTo').value));
    });
    filter.querySelector('#clearFeedbackDateFilter').addEventListener('click', () => {
        filter.querySelector('#feedbackDateFrom').value = '';
        filter.querySelector('#feedbackDateTo').value = '';
        renderItems(items);
    });
    renderItems(items);
}
// <Jun Kai end>

// Analyze feedback into AI Insight Summary (Done by Yu Kang)
let feedbackAnalysisAbortController = null;
let feedbackAnalysisRunId = 0;

async function analyzeFeedbackData() {
     updateAnalysisTitle();

    const resultsContainer = document.getElementById('feedback-analysis-results');
    const output = document.getElementById('feedback-analysis-output');
    const analyzeButton = document.getElementById('analyze-feedback-btn');

    if (!resultsContainer || !output) return;

    if (feedbackAnalysisAbortController) {
        feedbackAnalysisAbortController.abort();
    }

    const runId = ++feedbackAnalysisRunId;
    const controller = new AbortController();
    feedbackAnalysisAbortController = controller;

    resultsContainer.style.display = 'block';
    output.innerHTML = '<div class="fr-wait">Analyzing feedback insights...</div>'; // <Jun Kai/>
    if (analyzeButton) {
        analyzeButton.disabled = true;
        analyzeButton.dataset.originalText = analyzeButton.dataset.originalText || analyzeButton.textContent;
        analyzeButton.textContent = 'Analyzing...';
    }

    try {
        const analysisMode = document.getElementById('analysis-mode')?.value || 'rule-based';

        const response = await fetch(`/api/admin/feedback-insight-summary?mode=${encodeURIComponent(analysisMode)}`, {
            signal: controller.signal,
            credentials: 'include',
            headers: {
                'x-username': sessionStorage.getItem('loggedUser')
            }
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            // <Jun Kai start> the AI modes were switched off since the page opened: the list catches up
            if (data.localAiOff) refreshAnalysisModes();
            // <Jun Kai end>
            throw new Error(data.error || 'Failed to analyze feedback');
        }

        const { positive = 0, neutral = 0, negative = 0, total = 0 } = data.sentiment || {};
        const insights = data.insights || {};
        const weeklySummary = insights.weeklySummary || {};
        const analyzedItems = Array.isArray(data.analyzedItems) ? data.analyzedItems : [];

        const totalResponses = total;
        const dominantSentiment = (positive > negative) ? 'positive' : (negative > positive) ? 'negative' : 'neutral';

        // Get the actual top concern/compliment from the arrays
        const topConcern = (insights.topConcerns && insights.topConcerns.length > 0) 
            ? insights.topConcerns[0].label : 'No repeated concern detected';
        const topCompliment = (insights.topCompliments && insights.topCompliments.length > 0) 
            ? insights.topCompliments[0].label : 'No repeated compliment detected';

        const customSummaryText = totalResponses === 0
            ? 'No visitor comments were available for analysis.' : `Overall, ${totalResponses} visitor text response(s) were analyzed. The overall tone is ${dominantSentiment}. The most repeated concern is ${topConcern.toLowerCase()}, while the strongest positive signal is ${topCompliment.toLowerCase()}.`;


        // Extract timeline data (expects data.timeline = array of { date, positive, neutral, negative })
        let timeline = Array.isArray(data.timeline) ? data.timeline : [];
        if (timeline.length === 0 && analyzedItems.length > 0) {
            timeline = buildTimelineFromItems(analyzedItems);
        }
        console.log('📊 Timeline for line chart:', timeline);

        // <Jun Kai start> the same parts as before, styled by the page's classes (light and dark) instead of inline colours
        const modeLabel = document.getElementById('analysis-mode')?.selectedOptions[0]?.textContent || 'Rule-based';
        const sub = document.getElementById('fr-analysis-sub');
        if (sub) sub.textContent = `${modeLabel} result, ${total} text response${total === 1 ? '' : 's'} analysed`;
        output.innerHTML = `
            <div class="fr-result-top">
                <div class="fr-chart">
                    <canvas id="sentimentChart"></canvas>
                </div>

                <div class="fr-summary">
                    <h4>AI insight summary</h4>
                    <div class="fr-sentiments">
                        <button type="button" class="is-positive" onclick="openFeedbackInsightsModal('positive')">Positive ${positive}</button>
                        <button type="button" class="is-neutral" onclick="openFeedbackInsightsModal('neutral')">Neutral ${neutral}</button>
                        <button type="button" class="is-negative" onclick="openFeedbackInsightsModal('negative')">Negative ${negative}</button>
                    </div>
                    <!--<div style=" 
                        display: inline-block;
                        margin-bottom: 12px;
                        padding: 6px 10px;
                        background: #e2e8f0;
                        border-radius: 999px;
                        font-size: 12px;
                        font-weight: 600;
                        color: #334155;
                    ">
                        Analysis Engine: ${escapeHtml((data.mode || 'rule-based').toUpperCase())}
                    </div> -->

                    <p class="fr-summary-text">${escapeHtml(customSummaryText)}</p>
                    <div class="fr-shares">
                        <div><strong class="is-positive">Positive</strong> ${positive} (${total > 0 ? ((positive / total) * 100).toFixed(1) : 0}%)</div>
                        <div><strong class="is-neutral">Neutral</strong> ${neutral} (${total > 0 ? ((neutral / total) * 100).toFixed(1) : 0}%)</div>
                        <div><strong class="is-negative">Negative</strong> ${negative} (${total > 0 ? ((negative / total) * 100).toFixed(1) : 0}%)</div>
                    </div>
                    <div class="fr-facts">
                        <span><strong>Text responses analysed:</strong> ${total}</span>
                        <span><strong>Window:</strong> All time</span>
                        <span><strong>Pledge mentions:</strong> ${Number(weeklySummary.pledgeMentions || 0)}</span>
                    </div>
                </div>
            </div>

            <div class="fr-panels">
                ${renderInsightPanel('Top concerns', insights.topConcerns || [], 'is-negative', 'No repeated concern detected.')}
                ${renderInsightPanel('Top compliments', insights.topCompliments || [], 'is-positive', 'No repeated compliment detected.')}
                ${renderActionPanel('Suggested admin actions', insights.suggestedActions || [])}
            </div>

            <div class="fr-trend">
                <div class="fr-trend-head">
                    <h4 id="feedbackDemographicsHeading">Feedback over time (all time)</h4>
                    <div class="fr-ranges" id="timeRangeButtons" role="group" aria-label="Range">
                        <button type="button" class="btn-range" data-range="weekly">Weekly</button>
                        <button type="button" class="btn-range" data-range="monthly">Monthly</button>
                        <button type="button" class="btn-range" data-range="yearly">Yearly</button>
                        <button type="button" class="btn-range active" data-range="all">All time</button>
                    </div>
                </div>
                <div class="fr-trend-chart">
                    <canvas id="sentimentLineChart"></canvas>
                </div>
            </div>
        `;
        // <Jun Kai end>

        setTimeout(() => {
            createSentimentChart(positive, neutral, negative); 
            window.latestFeedbackInsightItems = analyzedItems;

            // --- Handle range button --- 
            const buttons = document.querySelectorAll('.btn-range');
            const defaultRange = 'all';

            // Function to update chart and active state
            function setRange(range) {
                window.currentTimeRange = range;
                updateLineChartForRange(range);
            }

            buttons.forEach(btn => {
                btn.addEventListener('click', function() {
                    // Remove all active class
                    buttons.forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    setRange(this.dataset.range);
                })
            });

            const defaultBtn = document.querySelector(`.btn-range[data-range="all"]`);
            if (defaultBtn) defaultBtn.classList.add('active');
            setRange(defaultRange);
        }, 100);

    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }

        console.error('Error analyzing feedback insights:', error);
        output.innerHTML = `<div class="fr-wait is-error">Error analyzing feedback insights<br><small>${escapeHtml(error.message)}</small></div>`; // <Jun Kai/>
    } finally {
        if (feedbackAnalysisAbortController === controller) {
            feedbackAnalysisAbortController = null;
        }

        if (analyzeButton && feedbackAnalysisRunId === runId) {
            analyzeButton.disabled = false;
            analyzeButton.textContent = analyzeButton.dataset.originalText || 'Analyze Feedback';
        }
    }
}

// Create sentiment analysis line chart (added by Yu Kang)
function createSentimentLineChart(timelineData) {
    const canvas = document.getElementById('sentimentLineChart');
    if (!canvas) {
        console.warn('Line chart canvas not found');
        return;
    }
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded');
        return;
    }

    // Destroy existing instance
    if (window.sentimentLineChartInstance) {
        window.sentimentLineChartInstance.destroy();
    }

    // If no timeline data, show a placeholder
    if (!timelineData || timelineData.length === 0) {
        const ctx = canvas.getContext('2d');
        window.sentimentLineChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['No data'],
                datasets: [
                    { label: 'Positive', data: [0], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)' },
                    { label: 'Neutral', data: [0], borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)' },
                    { label: 'Negative', data: [0], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' }
                }
            }
        });
        return;
    }

    // Extract labels (dates) and data series
    const labels = timelineData.map(item => item.date);
    const positiveData = timelineData.map(item => item.positive || 0);
    const neutralData = timelineData.map(item => item.neutral || 0);
    const negativeData = timelineData.map(item => item.negative || 0);

    const ctx = canvas.getContext('2d');
    window.sentimentLineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Positive',
                    data: positiveData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Neutral',
                    data: neutralData,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.05)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Negative',
                    data: negativeData,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.05)',
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    display: true,
                    title: { display: true, text: 'Date' },
                    ticks: { maxTicksLimit: 15 }
                },
                y: {
                    display: true,
                    title: { display: true, text: 'Count' },
                    beginAtZero: true
                }
            }
        }
    });
}

// Build timeline data from analyzed items if timeline is not provided (Done by Yu Kang)
function buildTimelineFromItems(items) {
    const dateMap = {};

    items.forEach(item => {
        // Use item.date (from backend) or fallback to item.created_at
        const dateStr = item.date || item.created_at || '';
        if (!dateStr) return;

        // Extract date part (YYYY-MM-DD)
        const parsed = new Date(dateStr);
        const date = Number.isNaN(parsed.getTime())
            ? (dateStr.split('T')[0] || dateStr.split(' ')[0])
            : parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
        if (!date) return;

        if (!dateMap[date]) {
            dateMap[date] = { positive: 0, neutral: 0, negative: 0 };
        }

        const sentiment = (item.sentiment || '').toLowerCase();
        if (sentiment === 'positive') dateMap[date].positive += 1;
        else if (sentiment === 'neutral') dateMap[date].neutral += 1;
        else if (sentiment === 'negative') dateMap[date].negative += 1;
    });

    // Convert to array and sort by date
    return Object.entries(dateMap)
        .map(([date, counts]) => ({ date, ...counts }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

// Filter feedback items based on selected time range (Done by Yu Kang)
function filterItemsByRange(items, range) {
    const now = new Date();
    let cutoffDate = new Date(0); // default: all time

    switch (range) {
        case 'weekly':
            cutoffDate = new Date(now);
            cutoffDate.setDate(now.getDate() - 7);
            break;
        case 'monthly':
            cutoffDate = new Date(now);
            cutoffDate.setMonth(now.getMonth() - 1);
            break;
        case 'yearly':
            cutoffDate = new Date(now);
            cutoffDate.setFullYear(now.getFullYear() - 1);
            break;
        case 'all':
        default:
            return items; // no filter
    }

    return items.filter(item => {
        const dateStr = item.date || item.created_at || '';
        if (!dateStr) return false;
        const itemDate = new Date(dateStr);
        return itemDate >= cutoffDate;
    });
}

// Update line chart based on selected time range (Done by Yu Kang)
function updateLineChartForRange(range) {
    const items = window.latestFeedbackInsightItems || [];
    if (items.length === 0) {
        createSentimentLineChart([]);
        return;
    }

    const filteredItems = filterItemsByRange(items, range);
    const timeline = buildTimelineFromItems(filteredItems);
    createSentimentLineChart(timeline);

    // Update the heading to show the current range
    const heading = document.getElementById('feedbackDemographicsHeading');
    if (heading) {
        // <Jun Kai/> the new page's wording: "Feedback over time (weekly)", "(all time)"
        heading.textContent = `Feedback over time (${range === 'all' ? 'all time' : range})`;
    }
}


// Create sentiment analysis doughnut chart (added by Yu Kang)
function createSentimentChart(positive, neutral, negative) {
    const canvas = document.getElementById('sentimentChart');
    if (!canvas) {
        console.error('❌ Sentiment chart canvas not found');
        return;
    }

    if (typeof Chart === 'undefined') {
        console.error('❌ Chart.js library is not loaded');
        return;
    }

    const ctx = canvas.getContext('2d');

    positive = Number(positive) || 0;
    neutral = Number(neutral) || 0;
    negative = Number(negative) || 0;

    console.log('📊 Creating chart:', {
        positive,
        neutral,
        negative
    });


    // Destroy existing chart if any
    if (window.sentimentChartInstance) {
        window.sentimentChartInstance.destroy();
    }

    window.sentimentChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Positive', 'Neutral', 'Negative'],
            datasets: [{
                data: [positive, neutral, negative],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(239, 68, 68, 0.8)'
                ],
                borderColor: [
                    'rgb(16, 185, 129)',
                    'rgb(245, 158, 11)',
                    'rgb(239, 68, 68)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 12,
                            weight: '500'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleColor: '#fff',
                    titleFont: {
                        size: 13,
                        weight: 'bold'
                    },
                    bodyColor: '#fff',
                    bodyFont: {
                        size: 12
                    },
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const value = context.parsed || 0;
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return context.label + ': ' + value + ' (' + percentage + ')%';
                        }
                    }
                }
            }
        }
    });

    console.log('✅ Sentiment chart created successfully');
}


