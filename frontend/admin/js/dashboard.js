// Owner: Role 3, Jun Kai. Previous team: XY (Xuanyang) (2).
// Part 4/30 of the admin page: dashboard, charts, alerts, journey passport (load order in admin.html).
// ==================== 4. DASHBOARD MANAGEMENT ====================
// Global chart instances
let visitorTrendsChart = null;
let feedbackDistributionChart = null;
let dailyLeafPledgeChart = null;
let dailyLeafPledgeChartType = 'bar';
let dailyLeafPledgeChartData = { labels: [], leafData: [], pledgeData: [] };
let currentChartRange = 'week';

// <Jun Kai start> Dashboard C: tabs, the "Needs you" card, the kiosk tile and charts that follow light and dark
let dashboardPageReady = false;
let dashboardTrendsData = null;
let dashboardStatsData = null;

function prepareDashboardPage() {
    if (dashboardPageReady) return;
    dashboardPageReady = true;
    document.querySelectorAll('#dashboard-page [data-fb-icon]').forEach((slot) => {
        slot.innerHTML = uiIcon(slot.dataset.fbIcon, slot.closest('button') ? 15 : 18);
    });
    const tabs = [...document.querySelectorAll('#dashboard-page [data-db-tab]')];
    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => showDashboardTab(tab.dataset.dbTab));
        tab.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            const next = tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            showDashboardTab(next.dataset.dbTab);
            next.focus();
        });
    });
    // the charts are drawn again when the admin switches between light and dark
    new MutationObserver(() => {
        if (dashboardTrendsData && document.getElementById('visitorTrendsChart')) createVisitorTrendsChart(dashboardTrendsData.labels, dashboardTrendsData.data);
        if (dailyLeafPledgeChart) createDailyLeafPledgeChart(dailyLeafPledgeChartData.labels, dailyLeafPledgeChartData.leafData, dailyLeafPledgeChartData.pledgeData);
        if (dashboardStatsData) createFeedbackDistributionChart(dashboardStatsData);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

function showDashboardTab(name) {
    document.querySelectorAll('#dashboard-page [data-db-tab]').forEach((tab) => {
        const on = tab.dataset.dbTab === name;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
    });
}

function dashboardChartColors() {
    const dark = document.documentElement.dataset.theme === 'dark';
    return { text: dark ? '#cbd5e1' : '#475569', grid: dark ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.07)' };
}

function setDashboardPill(el, tone, text) {
    if (!el) return;
    el.className = `ui-pill ui-pill-${tone}`;
    el.innerHTML = `<span class="ui-dot"></span>${escapeHtmlSafe(text)}`;
}

function setDashboardCount(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count;
    el.hidden = !count;
}

// the three alerts that most need staff, on the Overview; the full list stays in the System tab
function renderDashboardNeeds(alerts) {
    const list = document.getElementById('db-needs-list');
    if (!list) return;
    const order = { high: 0, medium: 1, low: 2 };
    const needs = alerts.filter((a) => a.id !== 'monitoring-normal' && String(a.severity || 'low').toLowerCase() !== 'low')
        .sort((a, b) => order[String(a.severity).toLowerCase()] - order[String(b.severity).toLowerCase()]);
    setDashboardCount('db-needs-count', needs.length);
    setDashboardCount('db-system-count', needs.length + (dashboardSystemIssues || 0));
    if (!needs.length) {
        list.innerHTML = '<p class="db-empty"><span class="ui-pill ui-pill-ok"><span class="ui-dot"></span>Nothing needs you right now</span></p>';
        return;
    }
    list.innerHTML = needs.slice(0, 3).map((a) => {
        const high = String(a.severity).toLowerCase() === 'high';
        return `<div class="db-need">
            <div class="db-need-text"><strong>${escapeHtmlSafe(a.title || 'Alert')}</strong><span>${escapeHtmlSafe(a.message || '')}</span></div>
            <span class="ui-pill ui-pill-${high ? 'down' : 'warn'}">${high ? 'High' : 'Medium'}</span>
        </div>`;
    }).join('');
}
let dashboardSystemIssues = 0;
// <Jun Kai end>

// ==================== ENHANCED DASHBOARD DATA LOADING ====================
// Enhanced dashboard data loading with chart data
async function loadDashboardData() {
    prepareDashboardPage(); // <Jun Kai/>
    try {
        console.log('📊 [PRETI] Loading enhanced dashboard data...');
        const response = await fetch('/api/admin/dashboard');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[PRETI] Dashboard API response:', data);
        
        if (data.success) {
            updateEnhancedDashboardStats(data.stats);
            await updateSystemStatus(data.recentActivity); // Check all system statuses (System Status section)
            
            await Promise.all([
                loadChartData(), // Load chart data separately
                loadInterventionAlerts(),
                loadJourneyPassport()
            ]);
            updateLastUpdated();
        } else {
            console.error('[PRETI] Failed to load dashboard data:', data.error);
            showNotification('Error loading dashboard data', 'error');
        }
    } catch (error) {
        console.error('❌ [PRETI] Error loading dashboard data:', error);
        updateEnhancedDashboardStats(getDefaultStats());
        showNotification('Error connecting to server', 'error');
    }
}

// Update dashboard statistics with enhanced metrics
function updateEnhancedDashboardStats(stats) {
    console.log('📈 Updating dashboard stats (feedback only):', stats);
    
    // This Month's Feedback
    const feedbackMonthEl = document.getElementById('feedback-month-value');
    if (feedbackMonthEl) {
        const monthFeedback = stats.feedbackThisMonth ?? stats.feedbackSubmissions ?? 0;
        animateValue(feedbackMonthEl, 0, monthFeedback, 1000);
    }
    
    // Today's Feedback
    const feedbackTodayEl = document.getElementById('feedback-today-value');
    if (feedbackTodayEl) {
        const todayFeedback = stats.feedbackToday ?? 0;
        animateValue(feedbackTodayEl, 0, todayFeedback, 1000);
    }
}

// Update system status section - CHECK ALL SERVICES LIVE
async function updateSystemStatus(activity) {
    console.log('🔄 Checking all system statuses...');
    
    // Track overall system health
    let allSystemsOk = true;
    let statusMessages = [];
    
    // <Jun Kai start> the same two checks; the results are pills, and the kiosk also fills its tile on the Overview
    const kioskValue = document.getElementById('db-kiosk-value');
    const kioskNote = document.getElementById('db-kiosk-note');
    const kioskTile = document.getElementById('db-kiosk-tile');
    let issues = 0;
    try {
        const kioskResponse = await fetch('/api/admin/server/status');
        const kioskData = await kioskResponse.json();
        const running = Boolean(kioskData.success && kioskData.kiosk_running);
        setDashboardPill(document.getElementById('kiosk-server-status'), running ? 'ok' : 'down', running ? 'Online' : 'Offline');
        if (kioskValue) kioskValue.textContent = running ? 'Running' : 'Stopped';
        if (kioskNote) kioskNote.textContent = running ? 'the kiosk page is open' : 'the kiosk page is closed';
        if (kioskTile) kioskTile.dataset.state = running ? 'on' : 'off';
        statusMessages.push(`Kiosk Server: ${running ? 'Online' : 'Offline'}`);
        if (!running) { allSystemsOk = false; issues++; }
    } catch (error) {
        console.error('❌ Error checking kiosk status:', error);
        setDashboardPill(document.getElementById('kiosk-server-status'), 'down', 'Error');
        if (kioskValue) kioskValue.textContent = 'Unknown';
        if (kioskNote) kioskNote.textContent = 'the status could not be read';
        if (kioskTile) kioskTile.dataset.state = 'off';
        allSystemsOk = false;
        issues++;
    }

    try {
        const dbResponse = await fetch('/api/test-db');
        const dbData = await dbResponse.json();
        const ok = Boolean(dbData.message && dbData.message.includes('working'));
        setDashboardPill(document.getElementById('database-status'), ok ? 'ok' : 'down', ok ? 'Connected' : 'Error');
        statusMessages.push(`Database: ${ok ? 'Connected' : 'Error'}`);
        if (!ok) { allSystemsOk = false; issues++; }
    } catch (error) {
        console.error('❌ Error checking database status:', error);
        setDashboardPill(document.getElementById('database-status'), 'down', 'Disconnected');
        allSystemsOk = false;
        issues++;
    }

    setDashboardPill(document.getElementById('overall-system-status'), allSystemsOk ? 'ok' : 'warn', allSystemsOk ? 'All systems working' : 'Something needs a look');
    dashboardSystemIssues = issues;
    const needs = Number(document.getElementById('db-needs-count')?.textContent || 0);
    setDashboardCount('db-system-count', needs + issues);
    // <Jun Kai end>
    console.log('✅ System status check complete:', statusMessages);
}

function getInterventionAlertIcon(severity) {
    if (severity === 'high') return '!';
    if (severity === 'medium') return 'i';
    return 'OK';
}

function formatInterventionSeverity(severity) {
    const normalized = String(severity || 'low').toLowerCase();
    if (normalized === 'high') return 'High';
    if (normalized === 'medium') return 'Medium';
    return 'Low';
}

function renderInterventionAlerts(alerts) {
    const list = document.getElementById('intervention-alerts-list');
    const count = document.getElementById('intervention-alerts-count');
    if (!list) return;

    const safeAlerts = Array.isArray(alerts) ? alerts : [];
    const actionableAlerts = safeAlerts.filter(alert => alert.severity !== 'low' || alert.id !== 'monitoring-normal');
    renderDashboardNeeds(safeAlerts); // <Jun Kai/>

    if (count) {
        count.textContent = actionableAlerts.length > 0
            ? `${actionableAlerts.length} active`
            : 'No urgent alerts';
        count.className = actionableAlerts.some(alert => alert.severity === 'high')
            ? 'intervention-alerts-count severity-high'
            : (actionableAlerts.length > 0 ? 'intervention-alerts-count severity-medium' : 'intervention-alerts-count severity-low');
    }

    if (safeAlerts.length === 0) {
        list.innerHTML = '<p class="intervention-alert-empty">No intervention alerts available yet.</p>';
        return;
    }

    list.innerHTML = safeAlerts.map(alert => {
        const severity = String(alert.severity || 'low').toLowerCase();
        const severityLabel = formatInterventionSeverity(severity);
        return `
            <article class="intervention-alert intervention-alert--${escapeHtmlSafe(severity)}">
                <div class="intervention-alert-icon" aria-hidden="true">${escapeHtmlSafe(getInterventionAlertIcon(severity))}</div>
                <div class="intervention-alert-body">
                    <div class="intervention-alert-topline">
                        <h4>${escapeHtmlSafe(alert.title || 'Intervention alert')}</h4>
                        <span class="intervention-alert-severity">${severityLabel}</span>
                    </div>
                    <p class="intervention-alert-message">${escapeHtmlSafe(alert.message || '')}</p>
                    <p class="intervention-alert-action">${escapeHtmlSafe(alert.suggestedAction || '')}</p>
                </div>
                <div class="intervention-alert-metric">${escapeHtmlSafe(alert.metric || '')}</div>
            </article>
        `;
    }).join('');
}

async function loadInterventionAlerts() {
    const list = document.getElementById('intervention-alerts-list');
    const count = document.getElementById('intervention-alerts-count');

    try {
        if (count) {
            count.textContent = 'Checking...';
            count.className = 'intervention-alerts-count';
        }

        const response = await fetch('/api/admin/intervention-alerts', {
            credentials: 'include',
            cache: 'no-store'
        });
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : { success: false, error: 'Intervention alerts endpoint is not available. Restart the backend server to load the new route.' };

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to load intervention alerts');
        }

        renderInterventionAlerts(data.alerts || []);
    } catch (error) {
        console.error('Error loading intervention alerts:', error);
        if (count) {
            count.textContent = 'Unavailable';
            count.className = 'intervention-alerts-count severity-high';
        }
        if (list) {
            list.innerHTML = `<p class="intervention-alert-empty intervention-alert-error">${escapeHtmlSafe(error.message || 'Unable to load intervention alerts. Check server logs if this repeats.')}</p>`;
        }
        // <Jun Kai start>
        const needs = document.getElementById('db-needs-list');
        if (needs) needs.innerHTML = '<p class="db-empty"><span class="ui-pill ui-pill-down"><span class="ui-dot"></span>The alerts could not be loaded</span></p>';
        // <Jun Kai end>
    }
}

// <Jun Kai start> Visitors tab (26 Nov 2026): the Journey Passport as bars (how many visitors earned each stamp) and a
// table of the visitors with the most stamps. The stamp keys and topic keys come from buildJourneyPassport (admin routes).
const DB_STAMP_HINTS = {
    firstFeedback: 'sent feedback',
    firstPledge: 'made a pledge',
    photoKeepsake: 'took a photo or got the keepsake email',
    likedPledge: 'got a like on a pledge',
    repeatVisitor: 'came back again',
    topicExplorer: 'pledged on 2 or more topics'
};

function dbSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function dbBar(label, hint, count, total) {
    const share = total > 0 ? Math.round((count / total) * 100) : 0;
    return `<div class="db-bar">
        <div class="db-bar-top">
            <span class="db-bar-label">${escapeHtmlSafe(label)} <span class="db-bar-hint">${escapeHtmlSafe(hint)}</span></span>
            <span class="db-bar-count"><strong>${count.toLocaleString()}</strong> of ${total.toLocaleString()}</span>
        </div>
        <div class="db-bar-track" aria-hidden="true"><span style="width: ${share}%"></span></div>
    </div>`;
}

function dbTopicName(topic) {
    const words = String(topic || '').replace(/-/g, ' ');
    return words; // the group title already says these are pledge topics
}

function dbShortDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date';
}

function renderJourneyPassport(passport) {
    const bars = document.getElementById('journey-passport-breakdown');
    const list = document.getElementById('journey-passport-list');
    if (!bars || !list) return;
    const summary = passport?.summary || {};
    const holders = Number(summary.passportHolders || 0);
    const max = Number(summary.maxStamps || 12);
    const stamps = Array.isArray(passport?.stampBreakdown) ? passport.stampBreakdown : [];
    const topics = Array.isArray(passport?.topicBreakdown) ? passport.topicBreakdown : [];
    const top = Array.isArray(passport?.topPassports) ? passport.topPassports : [];

    dbSetText('db-visitor-count', holders.toLocaleString());
    dbSetText('db-passport-sub', holders
        ? `Visitors collect a stamp for each thing they do at the kiosk, up to ${max}. A visitor has ${Number(summary.averageStamps || 0).toLocaleString()} on average.`
        : `Visitors collect a stamp for each thing they do at the kiosk, up to ${max}.`);

    if (!holders) {
        bars.innerHTML = '<p class="db-empty">No visitor has a stamp yet. The first stamp comes with a visitor\'s first feedback.</p>';
        list.innerHTML = '<p class="db-empty">No visitors yet.</p>';
        return;
    }

    bars.innerHTML = `<div class="db-bars-group">
            <h4>Milestones</h4>
            ${stamps.map((stamp) => dbBar(stamp.label || 'Stamp', DB_STAMP_HINTS[stamp.key] || '', Number(stamp.count || 0), holders)).join('')}
        </div>
        <div class="db-bars-group">
            <h4>Pledge topics</h4>
            ${topics.map((topic) => dbBar(topic.label || 'Topic', dbTopicName(topic.topic), Number(topic.count || 0), holders)).join('')}
        </div>`;

    list.innerHTML = `<table class="ui-table db-top-table">
        <thead><tr><th scope="col">Visitor</th><th scope="col">Stamps</th><th scope="col" class="db-num">Feedback</th><th scope="col" class="db-num">Pledges</th><th scope="col" class="db-num">Likes</th><th scope="col">Last seen</th></tr></thead>
        <tbody>${top.map((visitor) => {
        const names = [...(visitor.stamps || []), ...(visitor.topicBadges || [])].map((stamp) => stamp.label).filter(Boolean);
        return `<tr>
            <td class="db-top-name">${escapeHtmlSafe(visitor.name || 'Anonymous visitor')}</td>
            <td><span class="db-top-stamps"><strong>${Number(visitor.stampCount || 0)}</strong> of ${max}</span><span class="db-top-names">${escapeHtmlSafe(names.join(', '))}</span></td>
            <td class="db-num" data-label="Feedback">${Number(visitor.feedbackCount || 0).toLocaleString()}</td>
            <td class="db-num" data-label="Pledges">${Number(visitor.pledgeCount || 0).toLocaleString()}</td>
            <td class="db-num" data-label="Likes">${Number(visitor.likedPledgeCount || 0).toLocaleString()}</td>
            <td class="db-top-date" data-label="Last seen">${escapeHtmlSafe(dbShortDate(visitor.lastSeen))}</td>
        </tr>`;
    }).join('')}</tbody>
    </table>`;
}

function renderJourneyPassportError(message) {
    const text = `Could not load the Journey Passport: ${escapeHtmlSafe(message)}.`;
    const retry = '<button type="button" class="ui-link" onclick="loadJourneyPassport()">Try again</button>';
    const bars = document.getElementById('journey-passport-breakdown');
    const list = document.getElementById('journey-passport-list');
    if (bars) bars.innerHTML = `<p class="db-empty is-error">${text} ${retry}</p>`;
    if (list) list.innerHTML = `<p class="db-empty is-error">${text}</p>`;
    dbSetText('db-visitor-count', '-');
}
// <Jun Kai end>

async function loadJourneyPassport() {
    try {
        const response = await fetch('/api/admin/journey-passport', {
            credentials: 'include',
            cache: 'no-store'
        });
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : { success: false, error: 'the server did not answer with data' };

        if (!response.ok || !data.success) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        renderJourneyPassport(data.passport || {});
    } catch (error) {
        console.error('Error loading journey passport:', error);
        renderJourneyPassportError(error.message || 'unknown error'); // <Jun Kai/>
    }
}





// Animate number counting
function animateValue(element, start, end, duration) {
    const range = end - start;
    if (range === 0) {
        element.textContent = end.toLocaleString();
        return;
    }
    const increment = range / (duration / 16); // 60 FPS
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
            current = end;
            clearInterval(timer);
        }
        element.textContent = Math.round(current).toLocaleString();
    }, 16);
}

// Update last updated timestamp
function updateLastUpdated() {
    // <Jun Kai start> one line under the title: today's date and the time of the last refresh
    const now = new Date();
    const day = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const lastUpdatedElement = document.getElementById('dashboard-updated') || document.querySelector('.last-updated');
    if (lastUpdatedElement) {
        lastUpdatedElement.textContent = `${day} · updated ${time}`;
    }
    // <Jun Kai end>
}

// Get default statistics for offline mode
function getDefaultStats() {
    return {
        feedbackToday: 0,
        feedbackThisMonth: 0,
        feedbackSubmissions: 0
    };
}

// Refresh dashboard
function refreshDashboard() {
    // <Jun Kai start> the icon turns once while the numbers load again
    const btn = document.getElementById('dashboard-refresh-btn');
    if (btn) {
        btn.classList.add('is-spinning');
        setTimeout(() => btn.classList.remove('is-spinning'), 900);
    }
    // <Jun Kai end>
    loadDashboardData();
    showNotification('Dashboard refreshed', 'success');
}

// ==================== CHART FUNCTIONALITY ====================

// Load chart data from API
// ==================== CHART FUNCTIONALITY (UPDATED FOR REAL DATA) ====================

// Load chart data from REAL database
async function loadChartData() {
    try {
        console.log('📊 Loading REAL chart data from database...');
        await loadVisitorTrendsData();
        await loadFeedbackDistributionData();
        await loadDailyLeafPledgeData();
    } catch (error) {
        console.error('❌ Error loading chart data:', error);
        showNotification('Failed to load chart data', 'error');
    }
}

// Load feedback trends data from REAL database
async function loadVisitorTrendsData() {
    try {
        console.log('📈 Fetching REAL feedback trends from database...');
        
        const response = await fetch('/api/admin/visitor-trends?range=' + currentChartRange);
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.data) {
                console.log('✅ Got REAL feedback trends data');
                
                const hasData = data.data.feedbackData.some(f => f > 0);
                
                if (!hasData) {
                    console.log('ℹ️  No feedback data yet - showing empty chart');
                }
                
                // Only pass feedback data (no visitor data)
                createVisitorTrendsChart(
                    data.data.labels, 
                    data.data.feedbackData
                );
                return;
            }
        }
        
        console.log('⚠️  Feedback trends API not available - showing empty chart');
        createEmptyVisitorTrendsChart();
        
    } catch (error) {
        console.error('❌ Error loading feedback trends:', error);
        createEmptyVisitorTrendsChart();
    }
}

// Load feedback distribution data from REAL database
async function loadFeedbackDistributionData() {
    try {
        console.log('🍩 Fetching REAL feedback distribution from database...');
        
        const response = await fetch('/api/admin/feedback-stats');
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.stats) {
                console.log('✅ Got REAL feedback stats');
                
                const hasData = Object.values(data.stats).some(v => v > 0);
                
                if (!hasData) {
                    console.log('ℹ️  No feedback data yet - showing empty chart');
                }
                
                createFeedbackDistributionChart(data.stats);
                return;
            }
        }
        
        console.log('⚠️  Feedback stats API not available - showing empty chart');
        createEmptyFeedbackDistributionChart();
        
    } catch (error) {
        console.error('❌ Error loading feedback distribution:', error);
        createEmptyFeedbackDistributionChart();
    }
}

async function loadDailyLeafPledgeData() {
    try {
        console.log('Fetching daily leaf and pledge counts...');

        const response = await fetch('/api/admin/leaf-pledge-trends?days=6');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        if (data.success && data.data) {
            dailyLeafPledgeChartData = {
                labels: data.data.labels || [],
                leafData: data.data.leafData || [],
                pledgeData: data.data.pledgeData || []
            };
            createDailyLeafPledgeChart(data.data.labels, data.data.leafData, data.data.pledgeData);
            updateDailyLeafPledgeSummary(data.data);
            return;
        }

        throw new Error(data.error || 'Invalid daily leaf and pledge data');
    } catch (error) {
        console.error('Error loading daily leaf and pledge counts:', error);
        dailyLeafPledgeChartData = { labels: [], leafData: [], pledgeData: [] };
        createDailyLeafPledgeChart([], [], []);
        updateDailyLeafPledgeSummary({ labels: [], leafData: [], pledgeData: [], totalLeaves: 0, totalPledges: 0 });
    }
}

function getVisitorTrendsCanvas() {
    const activePage = document.querySelector('.page.active');
    const activePageId = activePage ? activePage.id : '';

    if (activePageId === 'feedback-report-page') {
        return document.getElementById('feedbackTrendChart') || document.getElementById('visitorTrendsChart');
    }

    if (activePageId === 'dashboard-page') {
        return document.getElementById('visitorTrendsChart') || document.getElementById('feedbackTrendChart');
    }

    return document.getElementById('visitorTrendsChart') || document.getElementById('feedbackTrendChart');
}

// Create feedback trends chart (feedback only - no visitor data)
function createVisitorTrendsChart(labels, feedbackData) {
    const ctx = getVisitorTrendsCanvas();
    if (!ctx) {
        console.warn('visitorTrendsChart canvas not found');
        return;
    }
    
    if (visitorTrendsChart) {
        visitorTrendsChart.destroy();
    }
    // <Jun Kai start> kept for a redraw when light or dark changes; the dashboard's graph needs no legend
    const onDashboard = ctx.id === 'visitorTrendsChart';
    if (onDashboard) dashboardTrendsData = { labels, data: feedbackData };
    const colors = dashboardChartColors();
    // <Jun Kai end>

    visitorTrendsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Feedback',
                    data: feedbackData,
                    borderColor: 'rgb(37, 99, 235)',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3.5,
                    pointBackgroundColor: 'rgb(37, 99, 235)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: !onDashboard, // <Jun Kai/>
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
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return ' ' + context.dataset.label + ': ' + context.parsed.y;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grace: '10%', // <Jun Kai/> room above the highest point, so the smooth line is not cut off
                    grid: {
                        color: colors.grid, // <Jun Kai/>
                        drawBorder: false
                    },
                    ticks: {
                        precision: 0,
                        color: colors.text, // <Jun Kai/>
                        font: {
                            size: 11
                        }
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: colors.text, // <Jun Kai/>
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });

    console.log('✅ Visitor trends chart created with REAL data');
}

// Fallback for empty visitor trends
function createEmptyVisitorTrendsChart() {
    const labels = [];
    const emptyData = [];
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        labels.push(`${dayName}\n${dateLabel}`);
        emptyData.push(0);
    }
    
    createVisitorTrendsChart(labels, emptyData, emptyData);
}

// Fallback to sample data (only if API completely fails)
function createVisitorTrendsChartWithSampleData() {
    const labels = [];
    const visitorData = [];
    const feedbackData = [];
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
        visitorData.push(Math.floor(Math.random() * 50) + 30);
        feedbackData.push(Math.floor(Math.random() * 30) + 10);
    }
    
    createVisitorTrendsChart(labels, visitorData, feedbackData);
}

// Create feedback distribution chart
function createFeedbackDistributionChart(stats) {
    const ctx = document.getElementById('feedbackDistributionChart');
    if (!ctx) {
        console.warn('feedbackDistributionChart canvas not found');
        return;
    }
    
    if (feedbackDistributionChart) {
        feedbackDistributionChart.destroy();
    }
    // <Jun Kai start> the ring shows the two parts that add up (with and without an email) and the total in the middle;
    // photo and storage numbers overlap with those two, so they are listed in the Visitors tab instead
    dashboardStatsData = stats;
    const withEmail = Number(stats.withEmail || 0);
    const withoutEmail = Number(stats.withoutEmail || 0);
    const totalEl = document.getElementById('db-donut-total');
    if (totalEl) totalEl.textContent = (withEmail + withoutEmail).toLocaleString();
    const legend = document.getElementById('db-donut-legend');
    if (legend) {
        legend.innerHTML = `<span><i class="db-key db-key-green"></i>With email ${withEmail.toLocaleString()}</span>
            <span><i class="db-key db-key-grey"></i>Without email ${withoutEmail.toLocaleString()}</span>`;
    }
    // the Visitors tab: how much of all the feedback left an email, a photo or a long term yes
    const allFeedback = withEmail + withoutEmail;
    [['db-email', withEmail], ['db-photo', Number(stats.withPhoto || 0)], ['db-longterm', Number(stats.longterm || 0)]].forEach(([id, value]) => {
        dbSetText(`${id}-count`, value.toLocaleString());
        dbSetText(`${id}-note`, `of ${allFeedback.toLocaleString()} feedback`);
    });
    const dark = document.documentElement.dataset.theme === 'dark';
    // <Jun Kai end>

    feedbackDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [
                'With email',
                'Without email'
            ],
            datasets: [{
                data: [
                    withEmail,
                    withoutEmail
                ],
                backgroundColor: [
                    'rgb(22, 163, 74)',
                    dark ? 'rgb(100, 116, 139)' : 'rgb(148, 163, 184)'
                ],
                borderColor: dark ? 'rgb(17, 26, 43)' : '#fff',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%', // <Jun Kai/>
            plugins: {
                legend: {
                    display: false, // <Jun Kai/> the legend is the line under the ring
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
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return ` ${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
    
    console.log('✅ Feedback distribution chart created with REAL data');
}

// Switch Daily Leaves & Pledges between bar and line chart (DONE BY XY)
function setDailyLeafPledgeChartType(type) {
    if (!['bar', 'line'].includes(type)) return;

    dailyLeafPledgeChartType = type;

    document.getElementById('daily-leaf-bar-btn')?.classList.toggle('active', type === 'bar');
    document.getElementById('daily-leaf-line-btn')?.classList.toggle('active', type === 'line');
    // <Jun Kai start>
    document.getElementById('daily-leaf-bar-btn')?.setAttribute('aria-pressed', type === 'bar' ? 'true' : 'false');
    document.getElementById('daily-leaf-line-btn')?.setAttribute('aria-pressed', type === 'line' ? 'true' : 'false');
    // <Jun Kai end>

    createDailyLeafPledgeChart(
        dailyLeafPledgeChartData.labels,
        dailyLeafPledgeChartData.leafData,
        dailyLeafPledgeChartData.pledgeData
    );
}

// Build the correct dataset style for bar or line chart display (DONE BY XY)
function createDailyLeafPledgeDataset(label, data, color, fillColor) {
    if (dailyLeafPledgeChartType === 'line') {
        return {
            label,
            data,
            borderColor: color,
            backgroundColor: fillColor,
            borderWidth: 3,
            fill: false,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: color,
            pointBorderColor: '#fff',
            pointBorderWidth: 2
        };
    }

    return {
        label,
        data,
        backgroundColor: fillColor,
        borderColor: color,
        borderWidth: 1,
        borderRadius: 8
    };
}

function createDailyLeafPledgeChart(labels, leafData, pledgeData) {
    const ctx = document.getElementById('dailyLeafPledgeChart');
    if (!ctx) {
        console.warn('dailyLeafPledgeChart canvas not found');
        return;
    }

    if (dailyLeafPledgeChart) {
        dailyLeafPledgeChart.destroy();
    }
    const colors = dashboardChartColors(); // <Jun Kai/>

    dailyLeafPledgeChart = new Chart(ctx, {
        type: dailyLeafPledgeChartType,
        data: {
            labels,
            datasets: [
                createDailyLeafPledgeDataset('Leaves', leafData, 'rgb(22, 163, 74)', 'rgba(22, 163, 74, 0.85)'),
                createDailyLeafPledgeDataset('Pledges', pledgeData, 'rgb(37, 99, 235)', 'rgba(37, 99, 235, 0.85)')
            ]
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
                        color: colors.text, // <Jun Kai/>
                        font: {
                            size: 12,
                            weight: '500'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            return ` ${context.dataset.label}: ${context.parsed.y}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: colors.grid }, // <Jun Kai/>
                    ticks: {
                        precision: 0,
                        color: colors.text // <Jun Kai/>
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: { color: colors.text } // <Jun Kai/>
                }
            }
        }
    });
}

function updateDailyLeafPledgeSummary(data) {
    const totalLeavesEl = document.getElementById('daily-leaf-total');
    const totalPledgesEl = document.getElementById('daily-pledge-total');
    const listEl = document.getElementById('daily-leaf-list');

    if (totalLeavesEl) totalLeavesEl.textContent = Number(data.totalLeaves || 0).toLocaleString();
    if (totalPledgesEl) totalPledgesEl.textContent = Number(data.totalPledges || 0).toLocaleString();
    if (!listEl) return;

    const labels = data.labels || [];
    const leafData = data.leafData || [];
    const pledgeData = data.pledgeData || [];

    if (!labels.length) {
        listEl.innerHTML = '<p class="db-empty">No leaves or pledges in the last 6 days.</p>'; // <Jun Kai/>
        return;
    }

    // <Jun Kai/> a small table with a total row (the Visitors tab)
    const rows = labels.map((label, index) => ({ day: String(label).replace(/\n/g, ' '), leaves: Number(leafData[index] || 0), pledges: Number(pledgeData[index] || 0) }));
    const total = rows.reduce((sum, row) => ({ leaves: sum.leaves + row.leaves, pledges: sum.pledges + row.pledges }), { leaves: 0, pledges: 0 });
    listEl.innerHTML = `<table class="ui-table db-days-table">
        <thead><tr><th scope="col">Day</th><th scope="col" class="db-num">Leaves</th><th scope="col" class="db-num">Pledges</th></tr></thead>
        <tbody>${rows.map((row) => `<tr><td>${escapeHtmlSafe(row.day)}</td><td class="db-num">${row.leaves.toLocaleString()}</td><td class="db-num">${row.pledges.toLocaleString()}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">Total</th><td class="db-num">${total.leaves.toLocaleString()}</td><td class="db-num">${total.pledges.toLocaleString()}</td></tr></tfoot>
    </table>`;
}

// Fallback for empty feedback distribution
function createEmptyFeedbackDistributionChart() {
    const stats = {
        withEmail: 0,
        withoutEmail: 0,
        withPhoto: 0,
        longterm: 0
    };
    createFeedbackDistributionChart(stats);
}

// Fallback to sample data (only if API completely fails)
function createFeedbackDistributionChartWithSampleData() {
    const stats = {
        withEmail: 45,
        withoutEmail: 15,
        withPhoto: 50,
        longterm: 55
    };
    createFeedbackDistributionChart(stats);
}

// Update chart range
function updateChartRange(range, button) {
    currentChartRange = range;
    // <Jun Kai start> only the buttons next to the pressed one change: before, every chart button on the page lost its
    // active look (also Bar and Line). The old buttons pass no button, so the click event finds it.
    const pressed = button || (typeof event !== 'undefined' && event && event.target ? event.target.closest('button') : null);
    if (pressed && pressed.parentElement) {
        pressed.parentElement.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', btn === pressed);
            if (btn.hasAttribute('aria-pressed')) btn.setAttribute('aria-pressed', btn === pressed ? 'true' : 'false');
        });
    }
    // <Jun Kai end>

    loadVisitorTrendsData(); // <Jun Kai/> the graph itself shows the change, no extra message
}


// ==================== INITIALIZATION ====================

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        console.warn('⚠️ Chart.js not loaded. Please add it to your HTML.');
        console.warn('Add this line to your admin.html <head>:');
        console.warn('<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>');
    } else {
        console.log('✅ Chart.js is loaded and ready');
    }
});

/* ==================== HELPER FUNCTIONS ====================
 * These can be used throughout the admin panel
 */

// Format number with commas
function formatNumber(num) {
    return num.toLocaleString();
}

// Calculate percentage
function calculatePercentage(value, total) {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
}

// Format date for display
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format time for display
function formatTime(date) {
    return new Date(date).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

console.log('✅ Enhanced dashboard JavaScript loaded - Updated version with working charts');

