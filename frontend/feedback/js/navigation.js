// Owner: Role 1, Zihan. Previous team: Nick (14), XY (Xuanyang) (1).
// Part 13/17 of the feedback page: page navigation, final submit, thank-you page, keepsake (load order in feedback.html).
// ==================== 8. PAGE NAVIGATION FUNCTIONS ====================

// Show consent page from landing page
function showConsentPage() {
    clearValidationMessages();
    selectedRetention = LONG_TERM_RETENTION;
    showFlowPage('details-page');
    resetInactivityTimer();
}

// Select retention option on consent page
function selectOption(option, element) {
    clearValidationMessages();
    document.querySelectorAll('.retention-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');
    selectedRetention = LONG_TERM_RETENTION;
    resetInactivityTimer();
}

// Show details page from consent page
function showDetailsPage() {
    selectedRetention = LONG_TERM_RETENTION;
    showFlowPage('details-page');
    resetInactivityTimer();
}

// Retake photo from style page
function retakePhotoFromStyle() {
    boomerangFrames = [];
    clearRestorableBoomerang();
    userData.processedBoomerangFrames = null; // Clear previous GIF payload when retaking from style page (DONE BY NICK)
    userData.boomerangFrameDelayMs = null; // Clear previous GIF timing when retaking from style page (DONE BY NICK)
    stopBoomerangPreview();

    // Show appropriate photo page based on device
    if (currentDevice === 'mobile') {
        // For mobile users, go to file upload page
        showFlowPage('file-upload-page');
    } else {
        // For desktop users, go to camera capture page
        showFlowPage('photo-page');
        // Reinitialize camera for desktop
        initializeCamera();
    }
    
    resetInactivityTimer();
}

// Confirm style and proceed to confirmation page
function confirmStyle() {
    // Process the final photo with overlay but doesnt save yet
    setRpBearMood('thinking');
    setRpBearSpeech(userData.captureMode === 'boomerang'
        ? 'Making your animated GIF keepsake now.'
        : 'Applying your selected frame now.', true);
    processFinalPhoto().then(() => {
        showFlowPage('confirmation-page');
        resetInactivityTimer();
        
        // Update confirmation page details
        updateConfirmationDetails();
        setRpBearMood(null);
        cheerRpBear('Style saved. One final check and you are done.');
    }).catch((error) => {
        console.error('Could not prepare final keepsake:', error);
        setRpBearMood(null);
        nudgeRpBear(userData.captureMode === 'boomerang'
            ? 'I could not make the GIF. Please retake the boomerang so it can email correctly.'
            : 'I could not apply the frame. Please try again.');
        showFormAlert('photo-form-alert', error.message || 'Could not prepare the final keepsake. Please try again.');
    });
}

function setConfirmationValue(id, value) { // changes made by nick
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

// Update confirmation page with user data
function updateConfirmationDetails() {
    // Update confirmation page with user data
    const focusList = formatPledgeTopicList(userData.pledgeTopics || (userData.pledgeTopic ? [userData.pledgeTopic] : []));
    const pledgeSummary = userData.pledgeSkipped
        ? 'Skipped - Feedback Contributor badge'
        : `${userData.pledge || 'Not provided'}${focusList ? ` | Focus: ${focusList}` : ''}`;
    setConfirmationValue('confirm-name', userData.name || 'Not provided');
    setConfirmationValue('confirm-email', userData.email || 'Not provided');
    setConfirmationValue('confirm-pledge', pledgeSummary);
    setConfirmationValue('confirm-theme', userData.photoSkipped ? 'Not selected' : selectedTheme);
    setConfirmationValue('confirm-retention', selectedRetention === 'longterm' ? 'Long-Term' : getTemporaryRetentionLabel());
    const photoReady = document.getElementById('confirm-photo-ready');
    const emailPhotoReady = document.getElementById('confirm-email-photo-ready');
    if (userData.photoSkipped) {
        if (photoReady) photoReady.textContent = 'Skipped by visitor';
        if (emailPhotoReady) emailPhotoReady.textContent = getFeatureFlags().thankYouEmailEnabled === false ? 'Disabled' : 'No photo to send';
    } else if (!photoData && !userData.processedPhoto) {
        if (photoReady) photoReady.textContent = 'Not required';
        if (emailPhotoReady) emailPhotoReady.textContent = getFeatureFlags().thankYouEmailEnabled === false ? 'Disabled' : 'No photo to send';
    } else {
        if (photoReady) photoReady.textContent = getDynamicLanguageText().confirmPhotoReady || 'Ready to be uploaded';
        if (emailPhotoReady) emailPhotoReady.textContent = getFeatureFlags().thankYouEmailEnabled === false
            ? 'Disabled'
            : (getDynamicLanguageText().confirmEmailPhotoReady || 'Will be sent to your email');
    }
    
    // Show how many questions were answered
    const answeredCount = Object.keys(userData.answers || {}).length;
    // in the confimration page, if the user skipped the feedback, show "Feedback skipped" instead of "0 answers recorded" (zihan)
    setConfirmationValue('confirm-questions', userData.feedbackSkipped
        ? getDynamicLanguageText().feedbackSkipped
        : getDynamicLanguageText().questionsAnswered(answeredCount));
    
}

// Go back from confirmation to style page
function goBackToStyle() {
    if (userData.photoSkipped || (!photoData && !userData.processedPhoto)) {
        showFlowPage('photo-choice-page');
    } else {
        showFlowPage('style-page');
    }
    setRpBearSpeech('No problem. Let us adjust that before submitting.', true);
    resetInactivityTimer();
}

// Final submission with photo saving
function finalSubmit() {
    const submitBtn = document.querySelector('#confirmation-page .consent-button');
    const originalText = submitBtn.innerHTML;
    document.body.classList.add('submitting-feedback');
    
    submitBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="8" stroke="white" stroke-width="1.5"/>
            <path d="M10 6V10L12 12" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Submitting...
    `;
    submitBtn.disabled = true;
    setRpBearMood('thinking');
    setRpBearSpeech('Submitting now. I am saving your visit and preparing the email.', true);
    
    // Clear inactivity timer since submission is in progress
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }
    
    // Save photos and submit data only when user confirms
    Promise.all([
        saveOriginalPhoto(),
        saveProcessedPhoto()
    ]).then(() => {
        // Send final submission to server
        return fetch('/api/feedback/submit-feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userData: userData,
                device: currentDevice,
                theme: selectedTheme,
                retention: LONG_TERM_RETENTION
            })
        });
    }).then(response => response.json())
    .then(data => {
        if (data.success === false) {
            const validationMessage = Array.isArray(data.errors)
                ? data.errors.map(error => error.message).join('\n')
                : (data.message || 'Submission validation failed.');
            throw new Error(validationMessage);
        }

        console.log('Feedback submitted successfully:', data);
        const submissionData = data.data || data;
        
        // Show thank you page
        showFlowPage('thankyou-page');
        cheerRpBear('All done. Your visit has been saved.');
        
        // Show the visitor which badge/leaf reward they unlocked.
        setupBadgeReward(submissionData);
        setupCelebrationMoment(submissionData);
        // Show visitor number and milestone confetti on thank-you page - changes made by nick
        setupVisitorMilestone(submissionData);
        setupJourneyPassport(submissionData);
        setupKeepsakeDownload(submissionData); // Downloadable visitor keepsake (DONE BY NICK)

        // Set up social share content for the thank-you page based on combined email queue status.
        setupSocialShare(submissionData);
        
        // Reset button
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        document.body.classList.remove('submitting-feedback');
        setRpBearMood(null);
    })
    .catch(error => {
        console.error('Error submitting feedback:', error);
        showVisitorNotice('confirmation-form-alert', error.message || 'Error submitting feedback. Please try again.', 'Submission did not go through. Check the message, then try again.');
        
        // Reset button on error
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        document.body.classList.remove('submitting-feedback');
        setRpBearMood(null);
        
        // Restart timer since submission failed
        startInactivityTimer();
    });
}

function setupKeepsakeDownload(data = {}) { // Thank-you page downloadable keepsake (DONE BY NICK)
    const button = document.getElementById('keepsake-download-btn');
    if (!button) return;

    const processedId = userData.processedPhotoId || data.processedPhotoId;
    const rawId = userData.photoId || data.photoId;
    const captureLabel = userData.captureMode === 'boomerang' ? 'boomerang' : 'photo';
    const downloadPath = processedId
        ? `/uploads/processed/${processedId}`
        : rawId
        ? `/uploads/photos/${rawId}`
        : '';

    if (!downloadPath) {
        button.hidden = true;
        button.dataset.downloadUrl = '';
        return;
    }

    button.hidden = false;
    button.dataset.downloadUrl = downloadPath;
    button.dataset.downloadName = `rp-esg-${captureLabel}-keepsake`;
}

function downloadVisitorKeepsake() { // Download saved keepsake from thank-you page (DONE BY NICK)
    const button = document.getElementById('keepsake-download-btn');
    const downloadUrl = button?.dataset.downloadUrl || '';
    if (!downloadUrl) return;

    const extension = downloadUrl.split('.').pop() || (userData.captureMode === 'boomerang' ? 'gif' : 'png');
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${button.dataset.downloadName || 'rp-esg-keepsake'}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    resetInactivityTimer();
}

// Build share text and social media links for the final thank-you page
// Added by XY: social media sharing implementation
function getShareText() {
    const pledgeText = (userData.pledge || '').trim();
    if (userData.pledgeSkipped) {
        return 'I shared feedback with the Republic Polytechnic sustainability initiative! #RPGreen #Sustainability #ESG';
    }
    const topicList = formatPledgeTopicList(userData.pledgeTopics || (userData.pledgeTopic ? [userData.pledgeTopic] : []));
    const topicText = topicList ? ` (${topicList})` : '';
    const pledgeMessage = pledgeText ? `I just pledged: "${pledgeText}"${topicText}.` : 'I just made a sustainability pledge.';
    return `${pledgeMessage} Join me in supporting the Republic Polytechnic sustainability initiative! #RPGreen #Sustainability #ESG`;
}

const BADGE_LEAF_REWARDS = {
    'climate-champion': {
        badgeName: 'Climate Champion',
        leaf: 'blue-green climate leaf'
    },
    'renewable-innovator': {
        badgeName: 'Renewable Innovator',
        leaf: 'bright energy leaf'
    },
    'sustainable-living-advocate': {
        badgeName: 'Sustainable Living Advocate',
        leaf: 'fresh green living leaf'
    },
    'ocean-guardian': {
        badgeName: 'Ocean Guardian',
        leaf: 'ocean-blue leaf'
    },
    'governance-guardian': {
        badgeName: 'Governance Guardian',
        leaf: 'purple ethics leaf'
    },
    'social-champion': {
        badgeName: 'Social Champion',
        leaf: 'warm community leaf'
    },
    'feedback-completer': {
        badgeName: 'Feedback Contributor',
        leaf: 'classic feedback leaf'
    }
};

function setupBadgeReward(data) {
    const message = document.getElementById('thankyou-message');
    if (!message) return;

    const badgeKey = data?.badgeKey || 'feedback-completer';
    const reward = BADGE_LEAF_REWARDS[badgeKey] || BADGE_LEAF_REWARDS['feedback-completer'];
    const badges = Array.isArray(data?.badges) && data.badges.length
        ? data.badges
        : [{ badgeKey, badgeName: data?.badgeName || reward.badgeName }];
    const badgeNames = badges.map(badge => badge.badgeName).filter(Boolean).join(', ');

    message.textContent = `Your feedback has been recorded. You earned ${badgeNames || reward.badgeName}, and your name will appear on the digital tree as a ${reward.leaf}.`;
}

function getCelebrationBadgeKey(data) {
    if (Array.isArray(data?.badgeKeys) && data.badgeKeys[0]) return data.badgeKeys[0];
    if (Array.isArray(data?.badges) && data.badges[0]?.badgeKey) return data.badges[0].badgeKey;
    return data?.badgeKey || 'feedback-completer';
}

function getConfiguredBadgeLeafStyles() {
    const fallbackColors = {
        'climate-champion': '#0f766e',
        'renewable-innovator': '#f59e0b',
        'sustainable-living-advocate': '#16a34a',
        'ocean-guardian': '#0284c7',
        'governance-guardian': '#7c3aed',
        'social-champion': '#d97706',
        'feedback-completer': '#4a7c59'
    };
    const styles = kioskParameters.badgeLeafStyles || {};
    const leafScale = Number(styles.leafScale);

    return {
        colors: {
            ...fallbackColors,
            ...(styles.colors || {})
        },
        leafScale: Number.isFinite(leafScale) ? Math.min(2, Math.max(0.4, leafScale)) : 1
    };
}

function getCelebrationBadgeColor(badgeKey, data) {
    const colorMap = getConfiguredBadgeLeafStyles().colors;

    return colorMap[badgeKey] || data?.badgeColor || colorMap['feedback-completer'];
}

const CELEBRATION_LEAF_IMAGES = {
    'climate-champion': '/assets/Tree/leaf/NewLeftLeaf.png',
    'renewable-innovator': '/assets/Tree/leaf/NewRightLeaf.png',
    'sustainable-living-advocate': '/assets/Tree/leaf/OldLeftLeaf.png',
    'ocean-guardian': '/assets/Tree/leaf/NewRightLeaf.png',
    'governance-guardian': '/assets/Tree/leaf/OldLeftLeaf.png',
    'social-champion': '/assets/Tree/leaf/OldRightLeaf.png',
    'feedback-completer': '/assets/Tree/leaf/NewLeftLeaf.png'
};

const CELEBRATION_FLIGHT_TARGETS = {
    'climate-champion': { x: 118, y: -116, arcX: 54, arcY: -86, left: '58%', top: '32%' },
    'renewable-innovator': { x: 142, y: -126, arcX: 76, arcY: -92, left: '66%', top: '28%' },
    'sustainable-living-advocate': { x: 128, y: -104, arcX: 68, arcY: -76, left: '62%', top: '38%' },
    'ocean-guardian': { x: 150, y: -98, arcX: 82, arcY: -72, left: '70%', top: '42%' },
    'governance-guardian': { x: 108, y: -98, arcX: 48, arcY: -72, left: '55%', top: '40%' },
    'social-champion': { x: 138, y: -108, arcX: 74, arcY: -78, left: '67%', top: '36%' },
    'feedback-completer': { x: 126, y: -112, arcX: 62, arcY: -78, left: '61%', top: '34%' }
};

function getCelebrationLeafImage(badgeKey) {
    return CELEBRATION_LEAF_IMAGES[badgeKey] || CELEBRATION_LEAF_IMAGES['feedback-completer'];
}

function getCelebrationFlightTarget(badgeKey) {
    const target = CELEBRATION_FLIGHT_TARGETS[badgeKey] || CELEBRATION_FLIGHT_TARGETS['feedback-completer'];

    return {
        ...target,
        swerveX: target.swerveX ?? target.arcX - 24,
        swerveY: target.swerveY ?? target.arcY - 22,
        settleX: target.settleX ?? target.x - 8,
        settleY: target.settleY ?? target.y + 8
    };
}

function renderCelebrationLeaves(color, flightTarget = getCelebrationFlightTarget('feedback-completer')) {
    const leaves = document.getElementById('celebration-tree-leaves');
    if (!leaves) return;

    const positions = [
        [44, 28], [54, 22], [61, 34], [36, 38], [48, 44],
        [58, 48], [69, 43], [31, 50], [43, 56], [55, 58],
        [65, 56], [49, 33]
    ];

    const backgroundLeaves = positions.map(([left, top], index) => `
        <span
            class="celebration-tree-dot"
            style="left:${left}%; top:${top}%; background:${color}; animation-delay:${200 + (index * 70)}ms;"
        ></span>
    `).join('');

    leaves.innerHTML = `${backgroundLeaves}
        <span
            class="celebration-tree-dot landing-leaf"
            style="--celebration-target-left:${flightTarget.left}; --celebration-target-top:${flightTarget.top}; background:${color};"
        ></span>
    `;
}

function setCelebrationCounter(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = Number.isFinite(Number(value))
        ? new Intl.NumberFormat('en-SG').format(Number(value))
        : '--';
}

function getCelebrationCounterValue(id) {
    const text = document.getElementById(id)?.textContent || '';
    const value = Number(text.replace(/,/g, ''));
    return Number.isFinite(value) ? value : 0;
}

// Visitor number and milestone celebration helpers - changes made by nick
const VISITOR_MILESTONE_INTERVAL = 50;

function formatVisitorCount(value) {
    const count = Number(value);
    return Number.isFinite(count) && count > 0
        ? new Intl.NumberFormat('en-SG').format(Math.round(count))
        : '--';
}

function getVisitorPledgeMilestone(totalPledges) {
    const total = Math.max(0, Number(totalPledges) || 0);
    return Math.floor(total / VISITOR_MILESTONE_INTERVAL) * VISITOR_MILESTONE_INTERVAL;
}

function ensureVisitorMilestonePanel() {
    let panel = document.getElementById('visitor-milestone-panel');
    if (panel) return panel;

    const thankyouMessage = document.getElementById('thankyou-message');
    const thankyouPage = document.getElementById('thankyou-page');
    if (!thankyouMessage || !thankyouPage) return null;

    panel = document.createElement('div');
    panel.id = 'visitor-milestone-panel';
    panel.className = 'visitor-milestone-panel';
    panel.setAttribute('aria-live', 'polite');

    thankyouMessage.insertAdjacentElement('afterend', panel);
    return panel;
}

function renderVisitorMilestoneMessage(visitorNumber, totalPledges) {
    const panel = ensureVisitorMilestonePanel();
    if (!panel) return;

    const pledgeMilestone = getVisitorPledgeMilestone(totalPledges);
    const pledgeCopy = pledgeMilestone > 0
        ? `Thanks to you, our school has now crossed ${formatVisitorCount(pledgeMilestone)} pledges.`
        : `Thanks to you, our school has now reached ${formatVisitorCount(totalPledges)} pledge${Number(totalPledges) === 1 ? '' : 's'}.`;

    panel.innerHTML = `
        <span class="visitor-milestone-kicker">Visitor milestone</span>
        <strong>You are visitor #${formatVisitorCount(visitorNumber)}!</strong>
        <span>${pledgeCopy}</span>
    `;
}

function launchVisitorMilestoneConfetti(visitorNumber) {
    if (!Number.isFinite(Number(visitorNumber)) || Number(visitorNumber) % VISITOR_MILESTONE_INTERVAL !== 0) return;
    if (document.body.dataset.visitorMilestoneShown === String(visitorNumber)) return;

    document.body.dataset.visitorMilestoneShown = String(visitorNumber);
    const popup = document.createElement('div');
    popup.className = 'visitor-milestone-popup';
    popup.setAttribute('role', 'status');
    popup.setAttribute('aria-live', 'polite');

    const colors = ['#10b981', '#34d399', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];
    const confetti = Array.from({ length: 48 }, (_, index) => {
        const left = 8 + ((index * 17) % 84);
        const drift = ((index % 9) - 4) * 18;
        const delay = (index % 12) * 70;
        const duration = 1900 + ((index % 8) * 120);
        const color = colors[index % colors.length];
        return `<span style="--confetti-left:${left}%; --confetti-drift:${drift}px; --confetti-delay:${delay}ms; --confetti-duration:${duration}ms; --confetti-color:${color};"></span>`;
    }).join('');

    popup.innerHTML = `
        <div class="visitor-confetti-burst" aria-hidden="true">${confetti}</div>
        <div class="visitor-milestone-card">
            <span>Milestone visitor</span>
            <strong>#${formatVisitorCount(visitorNumber)}</strong>
            <p>You helped us reach another ${VISITOR_MILESTONE_INTERVAL}-visitor milestone.</p>
        </div>
    `;

    document.body.appendChild(popup);
    window.setTimeout(() => popup.classList.add('is-visible'), 20);
    window.setTimeout(() => {
        popup.classList.remove('is-visible');
        window.setTimeout(() => popup.remove(), 420);
    }, 4200);
}

async function setupVisitorMilestone(data = {}) {
    let visitorNumber = Number(data.visitorNumber);
    const optimisticPledgeCount = userData.pledgeSkipped ? 0 : 1;

    renderVisitorMilestoneMessage(visitorNumber, optimisticPledgeCount);
    launchVisitorMilestoneConfetti(visitorNumber);

    try {
        const snapshot = await fetchCelebrationImpactSnapshot();
        if (!Number.isFinite(visitorNumber) || visitorNumber <= 0) {
            // Fall back to the refreshed tree count if the submit response has no visitor number - changes made by nick
            visitorNumber = Math.max(1, Number(snapshot.treeLeaves || 0));
        }
        const totalPledges = Math.max(optimisticPledgeCount, Number(snapshot.totalPledges || 0) + optimisticPledgeCount);
        renderVisitorMilestoneMessage(visitorNumber, totalPledges);
        launchVisitorMilestoneConfetti(visitorNumber);
    } catch (error) {
        console.warn('Visitor milestone pledge count unavailable:', error);
    }
}

async function fetchCelebrationImpactSnapshot() {
    // <Jun Kai start>
    // the third request is every pledge ever made (archived and deleted ones too); the pledgeboard list only has the ones on show
    const [pledgeResult, treeResult, countResult] = await Promise.allSettled([
        fetch('/api/pledgeboard/pledges', { headers: { 'Cache-Control': 'no-cache' } }).then(response => response.json()),
        fetch('/api/tree', { headers: { 'Cache-Control': 'no-cache' } }).then(response => response.json()),
        fetch('/api/feedback/visitor-count', { headers: { 'Cache-Control': 'no-cache' } }).then(response => response.json())
    ]);
    const reportedPledges = countResult.status === 'fulfilled' ? countResult.value?.totalPledges : null;
    const allTimePledges = typeof reportedPledges === 'number' && Number.isFinite(reportedPledges) ? reportedPledges : null;
    // <Jun Kai end>

    const pledges = pledgeResult.status === 'fulfilled' && Array.isArray(pledgeResult.value?.pledges)
        ? pledgeResult.value.pledges
        : [];
    const treeLeaves = treeResult.status === 'fulfilled' && Array.isArray(treeResult.value)
        ? treeResult.value.length
        : null;

    const now = new Date();
    const monthPledges = pledges.filter((pledge) => {
        const created = new Date(pledge.created_at);
        return !Number.isNaN(created.getTime()) &&
            created.getFullYear() === now.getFullYear() &&
            created.getMonth() === now.getMonth();
    }).length;

    return {
        monthPledges,
        // <Jun Kai start>
        totalPledges: allTimePledges ?? pledges.length,
        // <Jun Kai end>
        treeLeaves
    };
}

function renderCelebrationImpactCounters(snapshot = {}, optimistic = true) {
    const pledgeIncrement = optimistic && !userData.pledgeSkipped ? 1 : 0;
    const leafIncrement = optimistic ? 1 : 0;

    let monthPledges = Math.max(0, Number(snapshot.monthPledges || 0) + pledgeIncrement);
    let totalPledges = Math.max(0, Number(snapshot.totalPledges || 0) + pledgeIncrement);
    let treeLeaves = Math.max(1, Number(snapshot.treeLeaves || 0) + leafIncrement);

    if (!optimistic) {
        monthPledges = Math.max(monthPledges, getCelebrationCounterValue('celebration-month-pledges'));
        totalPledges = Math.max(totalPledges, getCelebrationCounterValue('celebration-total-pledges'));
        treeLeaves = Math.max(treeLeaves, getCelebrationCounterValue('celebration-tree-count'));
    }

    setCelebrationCounter('celebration-month-pledges', monthPledges);
    setCelebrationCounter('celebration-total-pledges', totalPledges);
    setCelebrationCounter('celebration-tree-count', treeLeaves);
}

async function loadCelebrationImpactCounters() {
    renderCelebrationImpactCounters({}, true);

    const firstSnapshot = await fetchCelebrationImpactSnapshot();
    renderCelebrationImpactCounters(firstSnapshot, true);

    window.setTimeout(async () => {
        try {
            const refreshedSnapshot = await fetchCelebrationImpactSnapshot();
            renderCelebrationImpactCounters(refreshedSnapshot, false);
        } catch (error) {
            console.warn('Celebration counter refresh unavailable:', error);
        }
    }, 1800);
}

function setupCelebrationMoment(data) {
    const celebration = document.getElementById('celebration-moment');
    if (!celebration) return;

    const badgeKey = getCelebrationBadgeKey(data);
    const reward = BADGE_LEAF_REWARDS[badgeKey] || BADGE_LEAF_REWARDS['feedback-completer'];
    const color = getCelebrationBadgeColor(badgeKey, data);
    const badgeLeafStyles = getConfiguredBadgeLeafStyles();
    const flightTarget = getCelebrationFlightTarget(badgeKey);

    celebration.style.setProperty('--celebration-badge-color', color);
    celebration.style.setProperty('--celebration-leaf-scale', badgeLeafStyles.leafScale);
    celebration.style.setProperty('--celebration-leaf-image', `url('${getCelebrationLeafImage(badgeKey)}')`);
    celebration.style.setProperty('--celebration-flight-x', `${flightTarget.x}px`);
    celebration.style.setProperty('--celebration-flight-y', `${flightTarget.y}px`);
    celebration.style.setProperty('--celebration-arc-x', `${flightTarget.arcX}px`);
    celebration.style.setProperty('--celebration-arc-y', `${flightTarget.arcY}px`);
    celebration.style.setProperty('--celebration-swerve-x', `${flightTarget.swerveX}px`);
    celebration.style.setProperty('--celebration-swerve-y', `${flightTarget.swerveY}px`);
    celebration.style.setProperty('--celebration-settle-x', `${flightTarget.settleX}px`);
    celebration.style.setProperty('--celebration-settle-y', `${flightTarget.settleY}px`);
    celebration.style.setProperty('--celebration-target-left', flightTarget.left);
    celebration.style.setProperty('--celebration-target-top', flightTarget.top);
    celebration.classList.remove('is-ready');

    const badgeName = document.getElementById('celebration-badge-name');
    const badgeCaption = document.getElementById('celebration-badge-caption');
    const photo = document.getElementById('celebration-photo');
    const title = document.getElementById('celebration-keepsake-title');
    const copy = document.getElementById('celebration-keepsake-copy');

    const badgeListText = Array.isArray(data?.badges) && data.badges.length
        ? data.badges.map(badge => badge.badgeName).filter(Boolean).join(', ')
        : reward.badgeName;
    if (badgeName) badgeName.textContent = badgeListText || reward.badgeName;
    if (badgeCaption) badgeCaption.textContent = userData.pledgeSkipped ? 'Feedback recorded' : (Array.isArray(data?.badges) && data.badges.length > 1 ? 'Badges unlocked' : 'Badge unlocked');

    if (photo) {
        const keepsakePhoto = userData.processedPhoto || photoData || '';
        if (keepsakePhoto) {
            photo.src = keepsakePhoto;
            photo.style.display = 'block';
        } else {
            photo.removeAttribute('src');
            photo.style.display = 'none';
        }
    }

    if (title) title.textContent = userData.pledgeSkipped ? 'Your feedback joined the tree' : 'Your pledge joined the tree';
    if (copy) {
        copy.textContent = userData.pledgeSkipped
            ? 'Your visit still grows the RP Xperience Centre digital tree as a feedback contribution.'
            : `Your ${reward.leaf} is now part of the RP Xperience Centre digital tree.`;
    }

    renderCelebrationLeaves(color, flightTarget);
    loadCelebrationImpactCounters().catch((error) => {
        console.warn('Celebration counters unavailable:', error);
        setCelebrationCounter('celebration-month-pledges', userData.pledgeSkipped ? 0 : 1);
        setCelebrationCounter('celebration-total-pledges', userData.pledgeSkipped ? 0 : 1);
        setCelebrationCounter('celebration-tree-count', 1);
    });

    window.setTimeout(() => {
        celebration.classList.add('is-ready');
    }, 80);
}

function setPassportStamp(stampId, status, titleId, title, detailId, detail) {
    const stamp = document.getElementById(stampId);
    const titleElement = titleId ? document.getElementById(titleId) : null;
    const detailElement = detailId ? document.getElementById(detailId) : null;

    if (!stamp) return;

    stamp.classList.remove('complete', 'optional', 'pending');
    stamp.classList.add(status);

    if (titleElement && title) titleElement.textContent = title;
    if (detailElement && detail) detailElement.textContent = detail;
}

function getPassportPhotoStatus(data) {
    const flags = getFeatureFlags();
    const hasPhoto = Boolean(userData.processedPhotoId || userData.photoId || userData.processedPhoto || photoData);
    const hasEmail = Boolean(userData.email && userData.email.includes('@'));
    const visitorEmailEnabled = flags.thankYouEmailEnabled !== false || flags.badgeEmailEnabled !== false;

    if (!visitorEmailEnabled) {
        return {
            status: 'optional',
            title: 'Visitor email disabled',
            detail: 'The admin setting has visitor emails turned off.'
        };
    }

    if (data?.emailQueued && hasEmail) {
        return {
            status: 'complete',
            title: hasPhoto ? 'Visitor email queued' : 'Badge email queued',
            detail: `Your visitor passport update is being sent to ${userData.email}.`
        };
    }

    if (!hasPhoto) {
        return {
            status: 'optional',
            title: 'No photo email needed',
            detail: hasEmail
                ? 'This visit was saved without a keepsake photo; your badge can still be emailed.'
                : 'This visit was saved without a keepsake photo.'
        };
    }

    if (!hasEmail) {
        return {
            status: 'optional',
            title: 'Photo kept local',
            detail: 'No email address was provided for this visit.'
        };
    }

    return {
        status: 'pending',
        title: 'Photo saved',
        detail: 'Your keepsake was prepared for this visit.'
    };
}

function getPassportLeafMessage(leafName) {
    const leafText = leafName || 'classic feedback leaf';
    const article = /^[aeiou]/i.test(leafText) ? 'An' : 'A';
    return `${article} ${leafText} was added to the RP Xperience Centre tree.`;
}

function escapePassportHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPassportDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return 'Today';
    return date.toLocaleDateString('en-SG', {
        day: '2-digit',
        month: 'short'
    });
}

function getCurrentPassportBadge(data) {
    const badgeKey = getCelebrationBadgeKey(data);
    const reward = BADGE_LEAF_REWARDS[badgeKey] || BADGE_LEAF_REWARDS['feedback-completer'];
    return {
        key: badgeKey,
        name: reward.badgeName,
        color: getCelebrationBadgeColor(badgeKey, data),
        count: 1
    };
}

function getCurrentPassportBadges(data) {
    const responseBadges = Array.isArray(data?.badges) ? data.badges : [];
    if (responseBadges.length > 0) {
        return responseBadges.map((badge) => {
            const badgeKey = badge.badgeKey || 'feedback-completer';
            const reward = BADGE_LEAF_REWARDS[badgeKey] || BADGE_LEAF_REWARDS['feedback-completer'];
            return {
                key: badgeKey,
                name: badge.badgeName || reward.badgeName,
                color: badge.badgeColor || getCelebrationBadgeColor(badgeKey, data),
                count: 1
            };
        });
    }

    return [getCurrentPassportBadge(data)];
}

function formatPassportTopicLabel(topic) {
    return String(topic || '')
        .split('-')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function isCurrentPassportVisit(visit, data, currentBadge) {
    const submitted = data?.submittedAt ? new Date(data.submittedAt) : null;
    const created = visit?.createdAt ? new Date(visit.createdAt) : null;
    const sameBadge = !visit?.badgeKey ||
        visit.badgeKey === currentBadge.key ||
        visit.badgeName === currentBadge.name;

    if (!sameBadge || !submitted || !created || Number.isNaN(submitted.getTime()) || Number.isNaN(created.getTime())) {
        return false;
    }

    return Math.abs(created.getTime() - submitted.getTime()) <= 5 * 60 * 1000;
}

function renderVisitorPassportHistory(passportData, data) {
    const history = document.getElementById('passport-history');
    const summary = document.getElementById('passport-summary');
    const badgeGrid = document.getElementById('passport-collected-badges');
    const recentList = document.getElementById('passport-recent-visits');
    const title = document.getElementById('passport-title');
    if (!history || !summary || !badgeGrid || !recentList) return;

    const currentBadges = getCurrentPassportBadges(data);
    const currentBadge = currentBadges[0] || getCurrentPassportBadge(data);
    const passport = passportData || {};
    const backendBadges = Array.isArray(passport.badges) ? passport.badges : [];
    const backendVisits = Array.isArray(passport.recentVisits) ? passport.recentVisits : [];
    const currentVisit = {
        createdAt: data?.submittedAt || new Date().toISOString(),
        badgeKey: currentBadge.key,
        badgeName: currentBadges.map(badge => badge.name).join(', ') || currentBadge.name,
        badgeColor: currentBadge.color,
        badges: currentBadges,
        isCurrentVisit: true,
        topicLabel: formatPledgeTopicList(userData.pledgeTopics || (userData.pledgeTopic ? [userData.pledgeTopic] : [])) || 'Current feedback',
        pledgeSnippet: userData.pledgeSkipped ? 'Feedback-only visit.' : (userData.pledge || 'Feedback submitted.')
    };
    const backendCurrentIndex = backendVisits.findIndex(visit => currentBadges.some(badge => isCurrentPassportVisit(visit, data, badge)));
    const backendIncludesCurrent = backendCurrentIndex >= 0;
    const recentVisits = (backendIncludesCurrent
        ? backendVisits.map((visit, index) => index === backendCurrentIndex ? { ...visit, isCurrentVisit: true } : visit)
        : [currentVisit, ...backendVisits]
    ).slice(0, 5);
    const visibleBadges = backendBadges.length
        ? backendBadges.map((badge) => ({ ...badge }))
        : currentBadges.map((badge) => ({ ...badge }));

    if (!backendIncludesCurrent) {
        currentBadges.forEach((current) => {
            const matchingBadge = visibleBadges.find(badge => badge.key === current.key);
            if (matchingBadge && backendBadges.length) {
                matchingBadge.count = Number(matchingBadge.count || 0) + 1;
            } else if (!matchingBadge) {
                visibleBadges.unshift(current);
            }
        });
    }

    const backendVisitCount = Number(passport.visitCount || 0);
    const backendFeedbackCount = Number(passport.feedbackCount || 0);
    const visitCount = backendIncludesCurrent ? Math.max(backendVisitCount, 1) : Math.max(backendVisitCount + 1, 1);
    const feedbackCount = backendIncludesCurrent ? Math.max(backendFeedbackCount, 1) : Math.max(backendFeedbackCount + 1, 1);
    const stampCount = Array.isArray(passport.stamps) ? passport.stamps.length : 1;

    if (title) {
        const holder = passport.holderName || userData.name || 'Your';
        title.textContent = `${holder}'s RP Xperience Centre passport`;
    }

    summary.innerHTML = [
        ['Visits', visitCount || 1],
        ['Feedback stamps', feedbackCount || 1],
        ['Badges collected', visibleBadges.length],
        ['Milestones', Math.max(stampCount, 1)]
    ].map(([label, value]) => `
        <div class="passport-summary-item">
            <strong>${escapePassportHtml(value)}</strong>
            <span>${escapePassportHtml(label)}</span>
        </div>
    `).join('');

    badgeGrid.innerHTML = visibleBadges.map((badge) => `
        <article class="passport-badge-card" style="--passport-badge-color: ${escapePassportHtml(badge.color || currentBadge.color)};">
            <span class="passport-badge-seal"><i class="fa-solid fa-award"></i></span>
            <span>
                <strong>${escapePassportHtml(badge.name || currentBadge.name)}</strong>
                <small>${escapePassportHtml(Number(badge.count || 1))} stamp${Number(badge.count || 1) === 1 ? '' : 's'} collected</small>
            </span>
        </article>
    `).join('');

    recentList.innerHTML = recentVisits.map((visit, index) => `
        <article class="passport-visit-card">
            <span class="passport-visit-date">${visit.isCurrentVisit || index === 0 && !backendIncludesCurrent ? 'This visit' : escapePassportHtml(formatPassportDate(visit.createdAt))}</span>
            <span>
                <strong>${escapePassportHtml(visit.badgeName || currentBadge.name)}</strong>
                <small>${escapePassportHtml(visit.topicLabel || 'General ESG feedback')}</small>
                ${visit.pledgeSnippet ? `<small>${escapePassportHtml(visit.pledgeSnippet)}</small>` : ''}
            </span>
        </article>
    `).join('');

    history.hidden = false;
}

function refreshVisitorPassportHistory(data) {
    const email = (userData.email || '').trim();
    if (!email || !email.includes('@')) {
        renderVisitorPassportHistory(null, data);
        return;
    }

    window.setTimeout(async () => {
        try {
            const response = await fetch('/api/feedback/visitor-passport', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                },
                body: JSON.stringify({ email })
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Unable to load visitor passport');
            }
            renderVisitorPassportHistory(result.passport, data);
        } catch (error) {
            console.warn('Visitor passport history unavailable:', error);
        }
    }, 1800);
}

function setupJourneyPassport(data) {
    const passport = document.getElementById('journey-passport');
    if (!passport) return;

    const flags = getFeatureFlags();
    const badgeKey = getCelebrationBadgeKey(data);
    const reward = BADGE_LEAF_REWARDS[badgeKey] || BADGE_LEAF_REWARDS['feedback-completer'];
    const currentBadges = getCurrentPassportBadges(data);
    const currentBadgeNames = currentBadges.map(badge => badge.name).filter(Boolean).join(', ') || reward.badgeName;
    const photoStatus = getPassportPhotoStatus(data);
    const pledgeEnabled = flags.pledgeEnabled !== false;
    const pledgeMade = pledgeEnabled && !userData.pledgeSkipped && Boolean((userData.pledge || '').trim());
    const pledgeTitle = !pledgeEnabled
        ? 'Pledge step disabled'
        : pledgeMade
            ? 'Pledge made'
            : 'Pledge skipped';
    const pledgeDetail = !pledgeEnabled
        ? 'The admin setting has pledge collection turned off.'
        : pledgeMade
            ? (formatPledgeTopicList(userData.pledgeTopics || (userData.pledgeTopic ? [userData.pledgeTopic] : []))
                ? `Added under ${formatPledgeTopicList(userData.pledgeTopics || (userData.pledgeTopic ? [userData.pledgeTopic] : []))}.`
                : 'Your action joined the pledgeboard.')
            : 'You chose to finish with feedback only.';

    setPassportStamp(
        'passport-feedback-stamp',
        'complete',
        null,
        '',
        'passport-feedback-detail',
        //updated text under the "Feedback" stamp on the thank-you page (zihan)
        userData.feedbackSkipped
            ? getDynamicLanguageText().feedbackSkipped
            : `${Object.keys(userData.answers || {}).length} feedback ${Object.keys(userData.answers || {}).length === 1 ? 'answer' : 'answers'} recorded.`
    );

    setPassportStamp(
        'passport-pledge-stamp',
        pledgeMade ? 'complete' : 'optional',
        'passport-pledge-title',
        pledgeTitle,
        'passport-pledge-detail',
        pledgeDetail
    );

    setPassportStamp(
        'passport-badge-stamp',
        'complete',
        'passport-badge-title',
        currentBadges.length > 1 ? 'Badges earned' : 'Badge earned',
        'passport-badge-detail',
        `${currentBadgeNames} unlocked for this visit.`
    );

    setPassportStamp(
        'passport-tree-stamp',
        'complete',
        null,
        '',
        'passport-tree-detail',
        getPassportLeafMessage(reward.leaf)
    );

    setPassportStamp(
        'passport-photo-stamp',
        photoStatus.status,
        'passport-photo-title',
        photoStatus.title,
        'passport-photo-detail',
        photoStatus.detail
    );

    renderVisitorPassportHistory(null, data);
    refreshVisitorPassportHistory(data);

    passport.classList.remove('is-ready');
    window.setTimeout(() => {
        passport.classList.add('is-ready');
    }, 160);
}

function sharePledge(platform) {
    const text = getShareText();
    const encodedText = encodeURIComponent(text);
    let shareUrl = '';

    // Instagram share handling and share text fallback - done by XY
    if (platform === 'twitter') {
        shareUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
    } else if (platform === 'whatsapp') {
        shareUrl = `https://wa.me/?text=${encodedText}`;
    } else if (platform === 'instagram') {
        if (navigator.share) {
            navigator.share({
                title: 'My RP Xperience Centre Pledge',
                text: text,
                url: window.location.href
            }).catch(() => {
                copyShareText();
                showShareStatus('Instagram share is available by copying text and pasting it into your Instagram story or post.');
            });
            return;
        }
        copyShareText();
        showShareStatus('Instagram cannot open directly. The share text has been copied so you can paste it into Instagram.');
        return;
    } else {
        return;
    }

    window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

function showShareStatus(message) { // Inline social share notice instead of browser alert - changes made by nick
    const shareStatus = document.getElementById('thankyou-share-status');
    if (!shareStatus) return;
    shareStatus.textContent = message;
    shareStatus.style.display = 'block';
}

function copyShareText() {
    const text = getShareText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showShareStatus('Share text copied to clipboard. Paste it into any social app!');
        }).catch(() => {
            showShareStatus('Unable to copy automatically. Please use manual share.');
        });
    } else {
        showShareStatus('Clipboard not available. Please copy the text manually.');
    }
}

function setupSocialShare(data) {
    const shareSection = document.getElementById('thankyou-share-section');
    const shareStatus = document.getElementById('thankyou-share-status');
    if (!shareSection || !shareStatus) return;

    if (getFeatureFlags().socialSharingEnabled === false) {
        shareSection.style.display = 'none';
        return;
    }

    const emailStatusText = data?.emailQueued
        ? 'Your combined thank-you email is being queued and will be sent shortly. You can still share your pledge now.'
        : 'Share your pledge with others and help grow the sustainability movement.';

    shareStatus.textContent = emailStatusText;
    shareSection.style.display = 'block';
}

function isCelebrationDemoMode() {
    return new URLSearchParams(window.location.search).get('celebrationDemo') === '1';
}

function normalizeCelebrationDemoBadge(rawBadge) {
    const badgeKey = String(rawBadge || '').trim();
    return BADGE_LEAF_REWARDS[badgeKey] ? badgeKey : 'climate-champion';
}

function getCelebrationDemoTopic(badgeKey) {
    const topicByBadge = {
        'climate-champion': 'climate-change',
        'renewable-innovator': 'renewable-energy',
        'sustainable-living-advocate': 'sustainable-living',
        'ocean-guardian': 'ocean-conservation',
        'governance-guardian': 'ethical-governance',
        'social-champion': 'community-impact'
    };

    return topicByBadge[badgeKey] || '';
}

function stopCelebrationDemoTimers() {
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }
    if (idleWarningTimer) {
        clearTimeout(idleWarningTimer);
        idleWarningTimer = null;
    }
    if (idleWarningInterval) {
        clearInterval(idleWarningInterval);
        idleWarningInterval = null;
    }
    if (qrRefreshTimer) {
        clearInterval(qrRefreshTimer);
        qrRefreshTimer = null;
    }
    hideIdleWarning();
}

function showCelebrationDemoIfRequested() {
    if (!isCelebrationDemoMode()) return;

    const params = new URLSearchParams(window.location.search);
    const badgeKey = normalizeCelebrationDemoBadge(params.get('badge'));
    const pledgeTopic = getCelebrationDemoTopic(badgeKey);
    const isFeedbackOnly = badgeKey === 'feedback-completer';
    const submittedAt = new Date().toISOString();

    userData = {
        name: 'Demo Visitor',
        email: '',
        answers: {
            demoExperience: 5,
            demoLearning: 5,
            demoUsability: 4
        },
        pledgeSkipped: isFeedbackOnly,
        pledgeTopic,
        pledgeTopics: pledgeTopic ? [pledgeTopic] : [],
        pledge: isFeedbackOnly ? '' : 'I pledge to bring a reusable bottle for three school days this week.',
        submittedAt
    };

    const submissionData = {
        badgeKey,
        badgeKeys: [badgeKey],
        badgeName: (BADGE_LEAF_REWARDS[badgeKey] || BADGE_LEAF_REWARDS['feedback-completer']).badgeName,
        badgeColor: getCelebrationBadgeColor(badgeKey, null),
        badges: [{
            badgeKey,
            badgeName: (BADGE_LEAF_REWARDS[badgeKey] || BADGE_LEAF_REWARDS['feedback-completer']).badgeName,
            badgeColor: getCelebrationBadgeColor(badgeKey, null)
        }],
        emailQueued: false,
        submittedAt
    };

    stopCelebrationDemoTimers();
    document.body.classList.add('celebration-demo-mode');
    showFlowPage('thankyou-page');
    setupBadgeReward(submissionData);
    setupCelebrationMoment(submissionData);
    setupJourneyPassport(submissionData);
    setupSocialShare(submissionData);
}

// Reset everything and return to landing page for new submission
function submitAnother() {
    // Clear boomerang state before starting another submission - changes made by nick
    stopBoomerangPreview();
    // Stop camera stream if still active
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    
    // Reset all data
    selectedRetention = LONG_TERM_RETENTION;
    selectedTheme = 'nature';
    userData = {};
    photoData = null;
    captureMode = 'photo';
    boomerangFrames = [];
    clearRestorableBoomerang();
    selectedFaceAccessory = 'none'; // Reset face filter between visitors (DONE BY NICK)
    userData.selectedFaceAccessory = 'none'; // Reset filter analytics state (DONE BY NICK)
    updateCaptureModeButtons();
    updateFaceAccessoryButtons();
    setupKeepsakeDownload({}); // Clear previous visitor download state (DONE BY NICK)
    
    // Reset forms
    document.querySelectorAll('form').forEach(form => form.reset());
    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    document.getElementById('char-count').textContent = '0';
    clearValidationMessages();
    
    // Go back to landing page
    showLandingPages();
    
    // Restart inactivity timer
    startInactivityTimer();
}


