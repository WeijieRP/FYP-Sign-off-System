// Owner: Role 2, Wei Jie. Previous team: XY (Xuanyang) (19), Caeden (5), Yu Kang (3).
// ============================================================
// XY CHANGE SUMMARY (DONE BY XY)
// ============================================================
//
// 1. DIGITAL TREE LEAF PLACEMENT
//    class TreeManager                - Stable leaf placement on tree canopy instead of flying/floating leaves (DONE BY XY)
//    badgeConfig mapping              - Badge-specific labels, short labels and preferred leaf sides (DONE BY XY)
//
// 2. ACTIVE BADGE CLEANUP
//    badgeConfig mapping              - Uses Feedback Contributor plus 6 pledge-topic badges only (DONE BY XY)
//    Removed inactive badges          - Eco Warrior and Commitment Champion removed from tree mapping (DONE BY XY)
//
// 3. YEAR REVIEW BOOK
//    yearReviewToggle                 - Opens/closes the yearly review book from a corner button (DONE BY XY)
//    fetchYearReviewData()            - Loads yearly tree summary data from /api/tree/years (DONE BY XY)
//    turnReviewPage()                 - Flips between yearly review pages with animation (DONE BY XY)
//    demoYearsEnabled                 - Supports ?demoYears=1 preview years without database edits (DONE BY XY)
//
// 4. LEAF FALL AND BADGE COLOR CONSISTENCY
//    leafFallThreshold                - Maximum live leaves before the oldest leaf falls away (DONE BY XY)
//    getLeafCycleState()              - Keep a persistent oldest-first rolling leaf queue (DONE BY XY)
//    badgeLeafColors                  - Keep every visible non-VIP leaf aligned with its assigned badge colour (DONE BY XY)
//
// 5. INTERACTIVE LEAF DETAILS
//    bindLeafDetailControls()         - Close leaf detail card with button or Escape key (DONE BY XY)
//    openLeafDetail()                 - Show visitor display name, badge, date and pledge snippet on leaf click (DONE BY XY)
//    createLeaf()                     - Add click and keyboard handlers to each visible leaf (DONE BY XY)
//
// 6. LEAF FALL DEMO MODE
//    demoFallEnabled                  - Supports ?demoFall=1 live tree demo without database records (DONE BY XY)
//    createDemoFallVisitors()         - Builds browser-only demo leaves for lecturer animation demos (DONE BY XY)
//    parseDemoLeafCount()             - Supports ?leaves= and ?duration= controls for demo fall playback (DONE BY XY)
//
// FIND COMMAND
//    rg -n "XY CHANGE SUMMARY|DONE BY XY" frontend backend
//
// CAEDEN CHANGE SUMMARY (DONE BY CAEDEN)
// ============================================================
//
// 1. ADMIN-CONFIGURABLE TREE PARAMETERS
//    function fetchParameterConfig    - Load tree and visual settings from /api/parameters (DONE BY CAEDEN)
//    TreeManager canopy fields        - Apply configurable canopy size, offset, refresh rate and leaf appearance (DONE BY CAEDEN)
//    refreshTreeFromServer            - Refresh tree using admin-configured interval (DONE BY CAEDEN)
//
// FIND COMMAND
//    rg -n "DONE BY CAEDEN|CAEDEN CHANGE SUMMARY" frontend backend
// ============================================================
// YU KANG CHANGE SUMMARY (DONE BY YU KANG)
// ============================================================
//
// - Tree now supports a custom leaf image uploaded via the admin panel
//   and an adjustable display scale controlled by admin parameters.
//   Uploaded leaf assets are saved to ./assets/Tree/leaf and applied to
//   the visual tree when configured. (Done by Yu Kang)
//
// FIND COMMAND
//    rg -n "YU KANG CHANGE SUMMARY|DONE BY YU KANG" frontend backend
// ============================================================


// TREE.JS - TABLE OF CONTENTS
// ============================================================
//
// CLASS: TreeManager
//   - constructor()                    - Initialize TreeManager instance
//
// INITIALIZATION & SETUP
//   - init()                           - Initialize tree and load data
//   - loadTreeImage()                  - Load tree images with promises
//   - normalizeName()                  - Normalize names for VIP matching
//   - fetchVipNames()                  - Fetch VIP names from API (/api/tree/vip-names)
//   - isVipName()                      - Check if a visitor name is VIP (using vipNames Set)
//   - fetchVisitorData()               - Fetch visitor data from API (/api/tree)
//
// TREE VISUALIZATION
//   - createLeaves()                   - Create leaf elements for visitors
//   - calculateOvalArea()              - Calculate oval area (fallback only)
//   - updateOvalOverlay()              - Update debug overlay (optional)
//   - buildMaskCanvas()                - Build offscreen canvas from stage4leaves.png
//   - findRandomPositionInLeavesMask() - Find random position inside mask
//   - createLeaf()                     - Create an individual leaf
//   - findRandomPositionInOval()       - Fallback placement
//
// VISUAL EFFECTS & UPDATES
//   - updateLeavesTransparency()        - Keep mask image ALWAYS hidden
//   - refreshTree()                    - Refresh tree visualization
//
// CONFIGURATION
//   - setOvalPosition()                - Set oval offset (fallback only)
//   - addVisitor()                     - Manual test add
//
// GLOBAL LISTENERS
//   - on load                          - Init
//   - setInterval refresh              - Refresh every 30s (VIP + visitors)
//   - resize                           - Refresh on resize
// ============================================================

// Leaf name font size at Leaf Display Scale 1; the same for every leaf.
const LEAF_GLOW_FADE_MS = 900; // how long a just-landed leaf takes to fade its neon glow in
const LANDING_STAGE_CLEAR_MS = 2500; // the next new leaf appears at the bottom middle this long after the one before takes off

// The landing flight's easing, cubic-bezier(0.4, 0, 0.3, 1): a slow start and a long, gentle arrival.
// Worked into the flight's keyframes (planLeafLandingFlight), so time at the bottom middle can come first.
function flightEase(time) {
    const x1 = 0.4, y1 = 0, x2 = 0.3, y2 = 1;
    const bezier = (a, b, s) => (3 * a * s * (1 - s) ** 2) + (3 * b * s * s * (1 - s)) + (s ** 3);
    let s = time;
    for (let i = 0; i < 8; i += 1) {
        const x = bezier(x1, x2, s) - time;
        const slope = (3 * x1 * (1 - s) ** 2) + (6 * (x2 - x1) * s * (1 - s)) + (3 * (1 - x2) * s * s);
        if (Math.abs(slope) < 1e-6) break;
        s = Math.min(1, Math.max(0, s - (x / slope)));
    }
    return bezier(y1, y2, s);
}
const LEAF_NAME_BASE_FONT_PX = 9;

// How wide a name box may be (% of the leaf box) at a given box height (%) and still stay on the
// leaf blade, centred in the middle of the leaf. Measured from the leaf photos (the narrowest of the
// left/right and new/old photos); a one-line name gets a long box, three lines a short one.
const LEAF_NAME_MIDRIB_WIDTHS = Object.freeze({
    green: [[8, 50.5], [10, 48.5], [12, 46.5], [14, 44.5], [16, 42.5], [18, 40], [20, 37.5], [22, 35.5], [24, 33.5], [26, 30.5], [28, 27.5], [30, 23.5]],
    gold: [[8, 46.5], [10, 43.5], [12, 40.5], [14, 37.5], [16, 34.5], [18, 31], [20, 28.5], [22, 25], [24, 22], [26, 18], [28, 14], [30, 10.5]]
});
// Custom uploaded leaf images of unknown shape: a level box of fixed size.
const LEAF_NAME_LEVEL_WIDTHS = Object.freeze({
    green: [[21, 31]],
    gold: [[20, 29]]
});

const DEFAULT_BADGE_LEAF_COLORS = Object.freeze({
    'feedback-completer': '#4a7c59',
    'climate-champion': '#0f766e',
    'renewable-innovator': '#f59e0b',
    'sustainable-living-advocate': '#16a34a',
    'ocean-guardian': '#0284c7',
    'governance-guardian': '#7c3aed',
    'social-champion': '#d97706'
});

class TreeManager {

    constructor() {
        // DOM Elements
        this.treeImage = document.getElementById('treeImage');
        this.treeImageLeaves = document.getElementById('treeImageLeaves');
        this.leavesContainer = document.getElementById('leavesContainer');
        this.loadingMessage = document.getElementById('loadingMessage');
        this.treeTitleBox = document.querySelector('.tree-title');
        this.treeTitle = document.getElementById('treeTitle');
        this.treeSubtitle = document.getElementById('treeSubtitle');
        this.yearReviewToggle = document.getElementById('yearReviewToggle');
        this.isDemoPage = /^\/tree-demo\/?$/i.test(window.location.pathname);
        this.mountDemoControls();
        this.treeDemoControls = document.getElementById('treeDemoControls');
        this.demoLandingButton = document.getElementById('demoLandingButton');
        this.demoFallingButton = document.getElementById('demoFallingButton');
        this.demoStatus = document.getElementById('demoStatus');
        this.yearReviewBook = document.getElementById('yearReviewBook');
        this.bookYear = document.getElementById('bookYear');
        this.bookCount = document.getElementById('bookCount');
        this.reviewTreePreview = document.getElementById('reviewTreePreview');
        this.bookPrevButton = document.getElementById('bookPrevButton');
        this.bookNextButton = document.getElementById('bookNextButton');
        this.bookViewButton = document.getElementById('bookViewButton');
        this.bookLiveButton = document.getElementById('bookLiveButton');
        this.bookCloseButton = document.getElementById('bookCloseButton');
        this.bookTurnSheet = document.getElementById('bookTurnSheet');
        this.bookTurnYear = document.getElementById('bookTurnYear');
        this.leafDetailCard = document.getElementById('leafDetailCard');
        this.leafDetailClose = document.getElementById('leafDetailClose');
        this.leafDetailPrivacy = document.getElementById('leafDetailPrivacy');
        this.leafDetailName = document.getElementById('leafDetailName');
        this.leafDetailBadge = document.getElementById('leafDetailBadge');
        this.leafDetailDate = document.getElementById('leafDetailDate');
        this.leafDetailSnippet = document.getElementById('leafDetailSnippet');

        // Data
        this.visitors = [];
        this.currentYear = new Date().getFullYear();
        this.selectedYear = this.currentYear;
        this.reviewYears = [];
        this.reviewIndex = 0;
        this.isReviewMode = false;
        this.isBookOpen = false;
        this.urlParams = new URLSearchParams(window.location.search);
        this.demoYearsEnabled = this.isDemoPage && this.urlParams.get('demoYears') === '1';
        this.demoFallEnabled = this.isDemoPage && this.urlParams.get('demoFall') === '1';
        this.demoFallLeafCount = this.parseDemoLeafCount(this.urlParams.get('leaves'));
        this.isBookFlipping = false;

        // VIP Names (for golden leaves)
        this.vipNames = new Set();

        this.badgeLeafProfiles = {
            'feedback-completer': {
                label: 'Feedback Contributor',
                shortLabel: 'Feedback',
                className: 'badge-feedback',
                preferredSide: null
            },
            'climate-champion': {
                label: 'Climate Champion',
                shortLabel: 'Climate',
                className: 'badge-climate',
                preferredSide: 'LeftLeaf.png'
            },
            'renewable-innovator': {
                label: 'Renewable Innovator',
                shortLabel: 'Energy',
                className: 'badge-renewable',
                preferredSide: 'RightLeaf.png'
            },
            'sustainable-living-advocate': {
                label: 'Sustainable Living Advocate',
                shortLabel: 'Living',
                className: 'badge-sustainable',
                preferredSide: 'LeftLeaf.png'
            },
            'ocean-guardian': {
                label: 'Ocean Guardian',
                shortLabel: 'Ocean',
                className: 'badge-ocean',
                preferredSide: 'RightLeaf.png'
            },
            'governance-guardian': {
                label: 'Governance Guardian',
                shortLabel: 'Ethics',
                className: 'badge-governance',
                preferredSide: 'LeftLeaf.png'
            },
            'social-champion': {
                label: 'Social Champion',
                shortLabel: 'Social',
                className: 'badge-social',
                preferredSide: 'RightLeaf.png'
            }
        };

        // ====================================================
        // CANOPY AREA (UPDATED: smaller + moved up)
        // ====================================================
        // These control where leaves are allowed to spawn.
        // Smaller area prevents leaves from appearing outside branches.
        this.ovalWidth = 850;
        this.ovalHeight = 300;
        this.ovalTopOffset = -100;
        this.leafRefreshInterval = 30000;
        this.leafOpacity = 0.9;
        this.leafAnimationDuration = 500;
        this.leafFallThreshold = 15;
        this.leafFallDuration = 4200;
        this.leafDisplayScale = 1;
        this.vipLeafDisplayScale = 1;
        this.badgeLeafColors = { ...DEFAULT_BADGE_LEAF_COLORS };
        this.badgeTintDurationMs = 24 * 60 * 60 * 1000; // 24 hours default for leaf tinting after badge color change
        this.treeStage = 0;
        this.showTitleBox = true;
        this.activeCampaign = null;
        this.leafFallStarted = false;
        this.leafGreenTimer = null;
        this.leafFallCycleNumber = 0;
        this.initialVisitorSnapshotReady = false;
        this.knownLeafKeys = new Set();
        this.pendingLandingLeafKeys = new Set();
        this.landingCleanupTimers = new Map();
        this.landingFlights = new Map();
        // A new feedback's leaf first shows at the bottom middle for this long, then flies to the tree
        // (treeParameters.leafShowcaseSeconds, "Time at the bottom middle"); new leaves take turns there.
        this.leafShowcaseMs = 12000;
        this.landingStageFreeAt = 0;
        this.leafGlowEpochs = new Map(); // leaf key -> when its glow pulse starts (animationClock() time)
        this.leafFalls = new Map(); // leaf key -> its fall (playLeafFall), kept so a refresh mid-fall carries on
        this.renderedLeafKeys = new Set();
        this.leafPositions = new Map();
        this.leafLayoutKey = '';
        this.titleKeepOut = null; // the title box's area, kept clear of leaves (getTitleKeepOut)
        this.placedLeafCircles = [];
        this.leafSpacingRadius = 0.5;
        this.recentLandingWindowMs = 2 * 60 * 1000;
        this.demoLandingEnabled = this.isDemoPage && this.urlParams.get('demoLanding') === '1';
        this.demoLandingRunNumber = 0;
        this.manualDemoFallActive = false;
        this.demoMotionTimer = null;
        this.demoControlsBound = false;
        this.demoPlaybackActive = false;
        this.liveTreeRefreshInterval = 5000;
        this.leafGlowDurationMs = 1 * 60 * 1000; //Timing for leaf glow effect (1 minute)
        this.leafGlowRefreshInterval = 1000;
        this.leafGlowTimer = null;
        this.activeLeafCycle = null;
        this.clearedLeafOverflowByKey = new Map();

        // Mask cache
        this.maskData = null;

        // Debug overlay toggle (set true if you want to see an oval)
        this.debugOval = false;

        this.bindDemoControls();
        this.initializationPromise = this.init();

    }

    mountDemoControls() {
        if (!this.isDemoPage || document.getElementById('treeDemoControls')) return;

        const treeContainer = document.getElementById('treeContainer');
        if (!treeContainer) return;

        const controls = document.createElement('div');
        controls.className = 'tree-demo-controls';
        controls.id = 'treeDemoControls';
        controls.setAttribute('aria-label', 'Tree animation demos');
        controls.innerHTML = `
            <button class="tree-demo-button" id="demoLandingButton" type="button">Demo Landing</button>
            <button class="tree-demo-button" id="demoFallingButton" type="button">Demo Falling</button>
            <span class="tree-demo-status" id="demoStatus" role="status" aria-live="polite">Ready</span>
        `;
        treeContainer.appendChild(controls);
        document.body.classList.add('tree-demo-page');
        document.title = 'ESG Digital Tree Animation Demo';
    }

    // ==================== TREE TITLE BOX ====================
    applyTreeTitleSettings() {
        if (!this.treeTitleBox) return;

        const settings = this.visualAssets?.treeTitleBox;
        // Respect the admin visibility toggle before applying any styling.
        if (!this.showTitleBox) {
            this.treeTitleBox.style.display = 'none';
            return;
        }

        this.treeTitleBox.style.display = 'block';

        // Update text content
        const titleEl = document.getElementById('treeTitle');
        const subtitleEl = document.getElementById('treeSubtitle');
        if (titleEl) titleEl.textContent = settings?.titleText || '🌳 ESG Digital Tree';
        if (subtitleEl) subtitleEl.textContent = settings?.subtitleText || 'Growing with every visitor\'s contribution this year';

        // Defaults
        const opacity = settings?.opacity ?? 0.25;
        const blur = settings?.blur ?? 6;
        const radius = settings?.radius ?? 25;
        const position = settings?.position ?? 'top-center';
        const padX = settings?.paddingX ?? 30;
        const padY = settings?.paddingY ?? 15;

        // --- Fixed positioning relative to viewport ---
        this.treeTitleBox.style.position = 'fixed';
        this.treeTitleBox.style.margin = '0';
        this.treeTitleBox.style.boxSizing = 'border-box';
        this.treeTitleBox.style.maxWidth = 'calc(100% - 40px)';   // always leaves 20px on each side
        this.treeTitleBox.style.wordBreak = 'break-word';         // prevent overflow from long words

        // Reset all positioning properties
        this.treeTitleBox.style.top = 'auto';
        this.treeTitleBox.style.bottom = 'auto';
        this.treeTitleBox.style.left = 'auto';
        this.treeTitleBox.style.right = 'auto';
        this.treeTitleBox.style.transform = 'none';

        const MARGIN = 20; // consistent gap from edges

        switch (position) {
            case 'top-left':
                this.treeTitleBox.style.top = MARGIN + 'px';
                this.treeTitleBox.style.left = MARGIN + 'px';
                break;
            case 'top-center':
                this.treeTitleBox.style.top = MARGIN + 'px';
                this.treeTitleBox.style.left = '50%';
                this.treeTitleBox.style.transform = 'translateX(-50%)';
                break;
            case 'top-right':
                this.treeTitleBox.style.top = MARGIN + 'px';
                this.treeTitleBox.style.right = MARGIN + 'px';
                break;
            case 'bottom-left':
                this.treeTitleBox.style.bottom = MARGIN + 'px';
                this.treeTitleBox.style.left = MARGIN + 'px';
                break;
            case 'bottom-center':
                this.treeTitleBox.style.bottom = MARGIN + 'px';
                this.treeTitleBox.style.left = '50%';
                this.treeTitleBox.style.transform = 'translateX(-50%)';
                break;
            case 'bottom-right':
                this.treeTitleBox.style.bottom = MARGIN + 'px';
                this.treeTitleBox.style.right = MARGIN + 'px';
                break;
            default:
                // fallback to top-center
                this.treeTitleBox.style.top = MARGIN + 'px';
                this.treeTitleBox.style.left = '50%';
                this.treeTitleBox.style.transform = 'translateX(-50%)';
        }

        // Apply other styles
        this.treeTitleBox.style.padding = `${padY}px ${padX}px`;
        this.treeTitleBox.style.borderRadius = `${radius}px`;
        this.treeTitleBox.style.background = `rgba(255,255,255,${opacity})`;
        this.treeTitleBox.style.backdropFilter = `blur(${blur}px)`;
        this.treeTitleBox.style.webkitBackdropFilter = `blur(${blur}px)`;
    }

    // ==================== INIT ====================

    async init() {
        try {
            await this.fetchParameterConfig();
            await this.loadTreeImage();

            // Force mask image hidden always
            this.updateLeavesTransparency();

            // Build mask from stage4leaves.png
            this.maskData = this.buildMaskCanvas();

            // Load VIP list first, then visitors
            this.bindYearReviewControls();
            this.bindLeafDetailControls();
            await this.fetchVipNames();
            await this.fetchYearReviewData();
            await this.fetchVisitorData(this.currentYear);
            this.updateTreeHeading();
            this.renderYearReviewBook();

            this.createLeaves();
            this.startLeafGlowMonitor();
        } catch (err) {
            console.error('Init error:', err);
        } finally {
            if (this.loadingMessage) {
                this.loadingMessage.style.display = 'none';
            }
            if (this.isDemoPage && !this.demoPlaybackActive) {
                this.setDemoStatus('Ready');
            }
        }
    }

    async fetchParameterConfig() {
        try {
            const response = await fetch('/api/parameters');
            const data = await response.json();
            if (!response.ok || !data.success) return;

            const tree = data.parameters?.treeParameters || {};
            // The admin chose the 3D tree for the wall: go straight to it (not from the admin's demo page).
            if (!this.isDemoPage && tree.treeDisplayMode === '3d') {
                window.location.replace(`/3dTree${window.location.search}`);
                return;
            }
            const assets = data.parameters?.visualAssets || {};
            const campaign = data.parameters?.campaignSettings || {};
            const badgeLeafStyles = data.parameters?.badgeLeafStyles || {};

            this.ovalWidth = Number(tree.ovalWidth) || this.ovalWidth;
            this.ovalHeight = Number(tree.ovalHeight) || this.ovalHeight;
            this.ovalTopOffset = Number(tree.ovalTopOffset) || this.ovalTopOffset;
            this.leafRefreshInterval = Number(tree.leafRefreshInterval) || this.leafRefreshInterval;
            this.leafOpacity = Number(tree.leafOpacity) || this.leafOpacity;
            this.leafAnimationDuration = Number(tree.leafAnimationDuration) || this.leafAnimationDuration;
            this.leafFallThreshold = Number(tree.leafFallThreshold) || this.leafFallThreshold;
            this.leafFallDuration = Number(tree.leafFallDuration) || this.leafFallDuration;
            const showcaseSeconds = Number(tree.leafShowcaseSeconds);
            if (tree.leafShowcaseSeconds !== undefined && tree.leafShowcaseSeconds !== '' && Number.isFinite(showcaseSeconds)) {
                this.leafShowcaseMs = Math.min(30, Math.max(0, showcaseSeconds)) * 1000;
            }
            this.treeStage = this.normalizeTreeStage(tree.treeStage);
            this.showTitleBox = tree.showTitleBox !== false;
            this.activeCampaign = campaign.enabled === true ? campaign : null;
            this.applyTitleBoxVisibility();

            this.applyTreeStageAssets(this.treeStage);

            // treeTitleBox is saved under treeParameters by admin.js
            this.visualAssets = assets || {};
            if (tree.treeTitleBox) {
                this.visualAssets.treeTitleBox = tree.treeTitleBox;
            }

            this.applyTreeTitleSettings();

            if (this.demoFallEnabled) {
                this.leafFallThreshold = this.demoFallLeafCount || this.leafFallThreshold;
                this.leafFallDuration = Math.min(Number(this.urlParams.get('duration')) || this.leafFallDuration, 10000);
            }

            // Use the admin-chosen background only once it has loaded, so a missing file
            // keeps the default background from tree.css instead of a blank screen.
            if (assets.treeBackground && assets.treeBackground !== this.appliedTreeBackground) {
                const backgroundUrl = assets.treeBackground;
                this.appliedTreeBackground = backgroundUrl;
                const probe = new Image();
                probe.onload = () => {
                    if (this.appliedTreeBackground === backgroundUrl) {
                        document.body.style.backgroundImage = `url('${backgroundUrl}')`;
                    }
                };
                probe.onerror = () => {
                    console.warn(`Tree background not found, using the default: ${backgroundUrl}`);
                    if (this.appliedTreeBackground === backgroundUrl) {
                        document.body.style.removeProperty('background-image');
                    }
                };
                probe.src = backgroundUrl;
            }
            // Leaf override image and shared display scale
            const configuredLeafScale = Number(tree.leafDisplayScale);
            const configuredVipLeafScale = Number(tree.vipLeafDisplayScale);
            const configuredBadgeLeafScale = Number(badgeLeafStyles.leafScale);
            this.leafDisplayScale = Number.isFinite(configuredLeafScale)
                ? configuredLeafScale
                : (Number.isFinite(configuredBadgeLeafScale) ? configuredBadgeLeafScale : 1);
            this.vipLeafDisplayScale = Number.isFinite(configuredVipLeafScale)
                ? configuredVipLeafScale
                : this.leafDisplayScale;
            this.badgeLeafColors = {
                ...DEFAULT_BADGE_LEAF_COLORS,
                ...(badgeLeafStyles.colors || {})
            };

            const configuredTintHours = Number(badgeLeafStyles.tintDurationHours);
            if (Number.isFinite(configuredTintHours) && configuredTintHours > 0) {
                this.badgeTintDurationMs = configuredTintHours * 60 * 60 * 1000;
            }

            this.leafOverrideImage = assets.leafImage
                ? (assets.leafImage.startsWith('/') ? assets.leafImage : `/assets/Tree/leaf/${assets.leafImage}`)
                : null;
            this.vipLeafOverrideImage = assets.vipLeafImage
                ? (assets.vipLeafImage.startsWith('/') ? assets.vipLeafImage : `/assets/Tree/vip-leaf/${assets.vipLeafImage}`)
                : null;
        } catch (error) {
            console.warn('Tree parameter config unavailable:', error);
        }
    }

    applyTitleBoxVisibility() {
        if (this.treeTitleBox) {
            this.treeTitleBox.style.display = this.showTitleBox ? 'block' : 'none';
        }
    }

    normalizeTreeStage(rawStage) {
        const parsed = Number(rawStage);
        if (!Number.isInteger(parsed)) {
            return 0;
        }
        return Math.max(0, Math.min(4, parsed));
    }

    stageHasLeaves() {
        return this.normalizeTreeStage(this.treeStage) > 0;
    }

    stageLeavesShouldShiftUp() {
        const stage = this.normalizeTreeStage(this.treeStage);
        return stage >= 1 && stage <= 3;
    }

    applyTreeStageAssets(stageNumber) {
        const stage = this.normalizeTreeStage(stageNumber);
        this.treeStage = stage;

        if (this.treeImage) {
            this.treeImage.src = `/assets/Tree/stage${stage}.png`;
        }

        if (this.treeImageLeaves) {
            this.treeImageLeaves.src = `/assets/Tree/stage${stage}leaves.png`;
        }

        this.updateStageLeavesVisibility();
    }

    loadTreeImage() {
        return new Promise((resolve) => {
            const stage = this.normalizeTreeStage(this.treeStage);
            const trunkSources = [
                `/assets/Tree/stage/stage${stage}.png`,
                `/assets/Tree/stage${stage}.png`,
                '/assets/Tree/stage0.png'
            ];
            const leavesSources = [
                `/assets/Tree/stage/stage${stage}leaves.png`,
                `/assets/Tree/stage${stage}leaves.png`,
                '/assets/Tree/stage/stage4leaves.png',
                '/assets/Tree/stage4leaves.png'
            ];

            const leavesPromise = this.stageHasLeaves()
                ? this.loadImageWithFallback(this.treeImageLeaves, leavesSources)
                : Promise.resolve(true);

            Promise.all([
                this.loadImageWithFallback(this.treeImage, trunkSources),
                leavesPromise
            ]).finally(resolve);
        });
    }

        loadImageWithFallback(imageEl, sourceCandidates) {
            return new Promise((resolve) => {
                if (!imageEl || !Array.isArray(sourceCandidates) || sourceCandidates.length === 0) {
                    resolve(false);
                    return;
                }

            let index = 0;
            const tryNext = () => {
                if (index >= sourceCandidates.length) {
                    imageEl.onload = null;
                    imageEl.onerror = null;
                    resolve(false);
                    return;
                }

                const source = sourceCandidates[index];
                index += 1;

                imageEl.onload = () => {
                    imageEl.onload = null;
                    imageEl.onerror = null;
                    resolve(true);
                };

                imageEl.onerror = () => {
                    tryNext();
                };

                imageEl.src = source;
            };

            tryNext();
        });
    }

    // ==================== VIP HELPERS ====================

    normalizeName(name) {
        return String(name || '').trim().toLowerCase();
    }

    async fetchVipNames() {
        try {
            const response = await fetch('/api/tree/vip-names');
            const data = await response.json();

            const list = Array.isArray(data.vipNames) ? data.vipNames : [];
            this.vipNames = new Set(list.map(n => this.normalizeName(n)));

            console.log(`✅ Loaded ${this.vipNames.size} VIP names`);
        } catch (error) {
            console.error('❌ Error fetching VIP names:', error);
            this.vipNames = new Set();
        }
    }

    isVipName(name) {
        return this.vipNames.has(this.normalizeName(name));
    }

    getBadgeLeafProfile(visitor) {
        const badgeKey = visitor && visitor.badgeKey ? visitor.badgeKey : 'feedback-completer';
        return this.badgeLeafProfiles[badgeKey] || this.badgeLeafProfiles['feedback-completer'];
    }

    getBadgeLeafColor(visitor) {
        const badgeKey = visitor && visitor.badgeKey ? visitor.badgeKey : 'feedback-completer';
        return this.badgeLeafColors[badgeKey]
            || visitor?.badgeColor
            || DEFAULT_BADGE_LEAF_COLORS[badgeKey]
            || DEFAULT_BADGE_LEAF_COLORS['feedback-completer'];
    }

    getLeafGlowTimestamp(visitor) {
        const sourceValue = visitor?.user_created_at;
        const createdAt = new Date(sourceValue);
        return Number.isNaN(createdAt.getTime()) ? null : createdAt;
    }

    shouldLeafGlow(visitor) {
        const createdAt = this.getLeafGlowTimestamp(visitor);
        if (!createdAt) return false;

        const ageMs = Date.now() - createdAt.getTime();
        return ageMs >= 0 && ageMs <= this.leafGlowDurationMs;
    }

    syncLeafGlowStates() {
        if (!this.leavesContainer) return;

        const now = Date.now();
        const leaves = Array.from(this.leavesContainer.querySelectorAll('.leaf'));
        leaves.forEach((leaf) => {
            const glowTimestamp = new Date(leaf.dataset.leafGlowTimestamp || '');
            const isGlowing = !Number.isNaN(glowTimestamp.getTime())
                && (now - glowTimestamp.getTime()) >= 0
                && (now - glowTimestamp.getTime()) <= this.leafGlowDurationMs;

            leaf.classList.toggle('leaf-neon-glow', isGlowing);
        });
    }

    startLeafGlowMonitor() {
        if (this.leafGlowTimer) {
            window.clearInterval(this.leafGlowTimer);
        }

        this.syncLeafGlowStates();
        this.leafGlowTimer = window.setInterval(() => {
            this.syncLeafGlowStates();
        }, this.leafGlowRefreshInterval);
    }

    getVisitorSeed(visitor, index) {
        return [
            this.getLeafKey(visitor, index),
            visitor.name || 'visitor',
            visitor.created_at || '',
            visitor.badgeKey || ''
        ].join('|');
    }

    getLeafKey(visitor, index = 0) {
        const id = visitor?.feedback_id || visitor?.id;
        if (id !== undefined && id !== null && String(id).trim() !== '') {
            return `feedback:${String(id).trim()}`;
        }

        return [
            'leaf',
            visitor?.created_at || '',
            visitor?.name || 'visitor',
            visitor?.badgeKey || ''
        ].join('|');
    }

    isRecentLandingCandidate(visitor) {
        const createdAt = new Date(visitor?.created_at);
        if (Number.isNaN(createdAt.getTime())) return false;

        const age = Date.now() - createdAt.getTime();
        return age >= 0 && age <= this.recentLandingWindowMs;
    }

    updateLandingLeafState(nextVisitors) {
        const visitors = Array.isArray(nextVisitors) ? nextVisitors : [];
        const nextKeys = new Set(visitors.map((visitor, index) => this.getLeafKey(visitor, index)));

        if (this.isReviewMode || this.demoFallEnabled) {
            this.knownLeafKeys = nextKeys;
            this.initialVisitorSnapshotReady = true;
            return;
        }

        if (!this.initialVisitorSnapshotReady) {
            const recentVisitors = visitors.filter(visitor => this.isRecentLandingCandidate(visitor));
            const landingVisitors = this.demoLandingEnabled && visitors.length
                ? [visitors[visitors.length - 1]]
                : recentVisitors.slice(-3);

            landingVisitors.forEach((visitor) => {
                const index = visitors.findIndex(candidate => candidate === visitor);
                this.pendingLandingLeafKeys.add(this.getLeafKey(visitor, Math.max(0, index)));
            });

            this.knownLeafKeys = nextKeys;
            this.initialVisitorSnapshotReady = true;
            return;
        }

        visitors.forEach((visitor, index) => {
            const key = this.getLeafKey(visitor, index);
            if (!this.knownLeafKeys.has(key)) {
                this.pendingLandingLeafKeys.add(key);
            }
        });

        this.knownLeafKeys = nextKeys;
    }

    hashString(value) {
        let hash = 2166136261;
        const text = String(value || '');

        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }

        return hash >>> 0;
    }

    createSeededRandom(seed) {
        let state = this.hashString(seed) || 1;

        return () => {
            state = Math.imul(1664525, state) + 1013904223;
            return (state >>> 0) / 4294967296;
        };
    }

    parseDemoLeafCount(value) {
        const count = Number(value);
        if (!Number.isInteger(count) || count < 1 || count > 80) return null;
        return count;
    }

    // ==================== DATA ====================

    async fetchVisitorData(year = this.selectedYear) {
        if (this.demoFallEnabled && !this.isReviewMode) {
            const count = this.demoFallLeafCount || Math.max(1, Number(this.leafFallThreshold) || 15);
            this.leafFallThreshold = count;
            this.visitors = this.createDemoFallVisitors(count);
            console.log(`Loaded ${this.visitors.length} demo fall visitors`);
            return;
        }

        try {
            const query = year ? `?year=${encodeURIComponent(year)}` : '';
            const response = await fetch(`/api/tree${query}`);
            const data = await response.json();

            this.visitors = Array.isArray(data) ? data : [];
            if (this.demoLandingEnabled && !this.isReviewMode && !this.visitors.length) {
                this.visitors = [this.createDemoLandingVisitor()];
            }
            this.updateLandingLeafState(this.visitors);
            console.log(`Loaded ${this.visitors.length} visitors`);
        } catch (error) {
            console.error('Error fetching visitor data:', error);
            this.visitors = this.demoLandingEnabled && !this.isReviewMode
                ? [this.createDemoLandingVisitor()]
                : [];
            this.updateLandingLeafState(this.visitors);
        }
    }

    async fetchYearReviewData() {
        try {
            const response = await fetch('/api/tree/years');
            const data = await response.json();

            this.currentYear = Number(data.currentYear) || new Date().getFullYear();
            this.selectedYear = this.isReviewMode ? this.selectedYear : this.currentYear;
            this.reviewYears = Array.isArray(data.years) ? data.years : [];
            this.addDemoYearsIfNeeded();

            if (!this.reviewYears.some(item => Number(item.year) === this.currentYear)) {
                this.reviewYears.unshift({
                    year: this.currentYear,
                    leafCount: 0,
                    isCurrentYear: true
                });
            }

            if (!this.reviewYears.length) {
                this.reviewYears = [{
                    year: this.currentYear,
                    leafCount: 0,
                    isCurrentYear: true
                }];
            }

            const activeIndex = this.reviewYears.findIndex(item => Number(item.year) === this.selectedYear);
            this.reviewIndex = activeIndex >= 0 ? activeIndex : 0;
        } catch (error) {
            console.error('Error fetching tree year review data:', error);
            this.reviewYears = [{
                year: this.currentYear,
                leafCount: this.visitors.length,
                isCurrentYear: true
            }];
            this.addDemoYearsIfNeeded();
            this.reviewIndex = 0;
        }
    }

    addDemoYearsIfNeeded() {
        if (!this.demoYearsEnabled) return;

        const demoYears = [
            { year: this.currentYear - 1, leafCount: 48 },
            { year: this.currentYear - 2, leafCount: 72 },
            { year: this.currentYear - 3, leafCount: 35 }
        ];

        demoYears.forEach((demoYear) => {
            const hasYear = this.reviewYears.some(item => Number(item.year) === demoYear.year);
            if (!hasYear) {
                this.reviewYears.push({
                    ...demoYear,
                    firstSubmission: `${demoYear.year}-01-12T09:00:00.000Z`,
                    lastSubmission: `${demoYear.year}-12-18T17:30:00.000Z`,
                    isCurrentYear: false,
                    isDemo: true
                });
            }
        });

        this.reviewYears.sort((a, b) => Number(b.year) - Number(a.year));
    }

    bindYearReviewControls() {
        if (this.yearReviewToggle) {
            this.yearReviewToggle.addEventListener('click', () => this.toggleYearReviewBook());
        }

        if (this.bookCloseButton) {
            this.bookCloseButton.addEventListener('click', () => this.closeYearReviewBook());
        }

        if (this.bookPrevButton) {
            this.bookPrevButton.addEventListener('click', () => this.turnReviewPage(-1));
        }

        if (this.bookNextButton) {
            this.bookNextButton.addEventListener('click', () => this.turnReviewPage(1));
        }

        if (this.bookViewButton) {
            this.bookViewButton.addEventListener('click', () => this.viewReviewYear());
        }

        if (this.bookLiveButton) {
            this.bookLiveButton.addEventListener('click', () => this.viewLiveYear());
        }
    }

    bindLeafDetailControls() {
        if (this.leafDetailClose) {
            this.leafDetailClose.addEventListener('click', () => this.closeLeafDetail());
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') this.closeLeafDetail();
        });

        // A click away from the leaves and the card closes it (a leaf's own click opens its card instead).
        document.addEventListener('click', (event) => {
            if (!this.leafDetailCard?.classList.contains('active')) return;
            if (this.leafDetailCard.contains(event.target) || event.target.closest?.('.leaf')) return;
            this.closeLeafDetail();
        });
    }

    bindDemoControls() {
        if (this.demoControlsBound) return;

        if (this.demoLandingButton) {
            this.demoLandingButton.addEventListener('click', () => {
                this.playDemoLanding().catch(error => this.handleDemoPlaybackError(error));
            });
        }

        if (this.demoFallingButton) {
            this.demoFallingButton.addEventListener('click', () => {
                this.playDemoFalling().catch(error => this.handleDemoPlaybackError(error));
            });
        }

        this.demoControlsBound = Boolean(this.demoLandingButton || this.demoFallingButton);
    }

    setDemoStatus(message) {
        if (this.demoStatus) {
            this.demoStatus.textContent = message;
        }
    }

    setDemoControlsDisabled(disabled) {
        [this.demoLandingButton, this.demoFallingButton].forEach(button => {
            if (button) button.disabled = disabled;
        });
    }

    async prepareDemoPlayback(label) {
        if (!this.isDemoPage) return false;

        this.demoPlaybackActive = true;
        this.setDemoControlsDisabled(true);
        this.setDemoStatus('Preparing demo...');

        if (this.initializationPromise) {
            await this.initializationPromise;
        }

        if (this.normalizeTreeStage(this.treeStage) !== 4) {
            this.applyTreeStageAssets(4);
            await this.loadTreeImage();
        }

        this.updateLeavesTransparency();
        this.maskData = this.buildMaskCanvas();
        this.setDemoStatus(`Playing ${label}...`);
        return true;
    }

    handleDemoPlaybackError(error) {
        console.error('Tree demo playback failed:', error);
        this.demoPlaybackActive = false;
        this.setDemoControlsDisabled(false);
        this.setDemoStatus('Demo failed - try again');
    }

    async playDemoLanding() {
        if (!await this.prepareDemoPlayback('landing')) return;

        this.manualDemoFallActive = false;
        this.enableDemoMotion(8600);
        this.closeYearReviewBook();
        this.isReviewMode = false;
        this.selectedYear = this.currentYear;

        const threshold = Math.max(3, Number(this.leafFallThreshold) || 15);
        this.leafFallThreshold = threshold;
        const baseVisitors = (Array.isArray(this.visitors) ? this.visitors : [])
            .filter(visitor => !String(visitor?.id || '').startsWith('demo-'))
            .slice(-(threshold - 2));
        const demoVisitor = this.createDemoLandingVisitor();

        this.visitors = [...baseVisitors, demoVisitor];
        this.pendingLandingLeafKeys.clear();
        this.pendingLandingLeafKeys.add(this.getLeafKey(demoVisitor, this.visitors.length - 1));
        this.knownLeafKeys = new Set(this.visitors.map((visitor, index) => this.getLeafKey(visitor, index)));
        this.initialVisitorSnapshotReady = true;
        this.leafFallStarted = false;
        this.activeLeafCycle = null;

        this.updateTreeHeading();
        this.renderYearReviewBook();
        this.refreshTree();
        this.resumeLiveRefreshAfter(8600);
    }

    async playDemoFalling() {
        if (!await this.prepareDemoPlayback('falling')) return;

        this.closeYearReviewBook();
        this.isReviewMode = false;
        this.selectedYear = this.currentYear;
        this.manualDemoFallActive = true;

        const count = this.demoFallLeafCount || Math.max(3, Number(this.leafFallThreshold) || 15);
        const fallPlaybackMs = Math.min(1600, count * 105 + 1070) + Math.max(1200, Number(this.leafFallDuration) || 4200) + 1400;
        this.enableDemoMotion(fallPlaybackMs);
        this.leafFallThreshold = count;
        this.leafFallDuration = Math.max(1200, Number(this.leafFallDuration) || 4200);
        this.visitors = this.createDemoFallVisitors(count);
        this.pendingLandingLeafKeys.clear();
        this.knownLeafKeys = new Set(this.visitors.map((visitor, index) => this.getLeafKey(visitor, index)));
        this.initialVisitorSnapshotReady = true;
        this.leafFallStarted = false;
        this.leafFallCycleNumber = 0;
        this.activeLeafCycle = null;

        this.updateTreeHeading();
        this.renderYearReviewBook();
        this.refreshTree();

        this.resumeLiveRefreshAfter(fallPlaybackMs);
    }

    enableDemoMotion(durationMs) {
        document.body.classList.add('tree-demo-motion-active');

        if (this.demoMotionTimer) {
            window.clearTimeout(this.demoMotionTimer);
        }

        this.demoMotionTimer = window.setTimeout(() => {
            document.body.classList.remove('tree-demo-motion-active');
            this.demoMotionTimer = null;
        }, Math.max(1000, Number(durationMs) || 5000));
    }

    resumeLiveRefreshAfter(delayMs) {
        if (typeof treeRefreshTimer !== 'undefined') {
            window.clearTimeout(treeRefreshTimer);
            treeRefreshTimer = window.setTimeout(() => {
                this.manualDemoFallActive = false;
                document.body.classList.remove('tree-demo-motion-active');
                if (this.demoMotionTimer) {
                    window.clearTimeout(this.demoMotionTimer);
                    this.demoMotionTimer = null;
                }
                this.demoPlaybackActive = false;
                this.setDemoControlsDisabled(false);
                this.setDemoStatus('Ready');
                refreshTreeFromServer();
            }, Math.max(1000, Number(delayMs) || 5000));
        }
    }

    formatLeafDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Date unavailable';
        return date.toLocaleDateString('en-SG', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    // Opens the clicked leaf's details card beside the leaf (to its right when the leaf is on the left half
    // of the tree, otherwise to its left), kept on screen. As on the 3D tree (frontend/3dTree/leaf-detail.js).
    openLeafDetail(visitor, badgeProfile, leafElement) {
        if (!this.leafDetailCard) return;
        this.selectedLeafKey = leafElement?.dataset?.leafKey || null;

        const badgeName = visitor.badgeName || badgeProfile.label || 'Feedback Contributor';
        const snippet = visitor.pledgeSnippet || 'No pledge snippet was shared for this leaf.';

        if (this.leafDetailPrivacy) {
            this.leafDetailPrivacy.textContent = visitor.privacyLabel || 'Leaf details';
        }
        if (this.leafDetailName) {
            this.leafDetailName.textContent = visitor.name || 'Anonymous visitor';
        }
        if (this.leafDetailBadge) {
            this.leafDetailBadge.textContent = badgeName;
            this.leafDetailBadge.style.setProperty('--leaf-detail-badge-color', this.getBadgeLeafColor(visitor));
        }
        if (this.leafDetailDate) {
            this.leafDetailDate.textContent = this.formatLeafDate(visitor.created_at);
        }
        if (this.leafDetailSnippet) {
            this.leafDetailSnippet.textContent = snippet;
        }

        if (leafElement) this.placeLeafDetail(leafElement.getBoundingClientRect());
        this.leafDetailCard.classList.add('active');
        this.leafDetailCard.setAttribute('aria-hidden', 'false');
    }

    placeLeafDetail(leafRect) {
        const card = this.leafDetailCard;
        const room = (card.offsetParent || document.body).getBoundingClientRect();
        const width = card.offsetWidth;
        const height = card.offsetHeight;
        const gap = 18;
        const margin = 16;
        const leafX = leafRect.left + (leafRect.width / 2) - room.left;
        const leafY = leafRect.top + (leafRect.height / 2) - room.top;
        let left = leafX < room.width / 2
            ? leafRect.right - room.left + gap
            : leafRect.left - room.left - gap - width;
        left = Math.min(room.width - width - margin, Math.max(margin, left));
        const top = Math.min(room.height - height - margin, Math.max(margin, leafY - (height / 2)));
        card.style.right = 'auto';
        card.style.left = `${Math.round(left)}px`;
        card.style.top = `${Math.round(top)}px`;
    }

    closeLeafDetail() {
        if (!this.leafDetailCard) return;
        this.selectedLeafKey = null;
        this.leafDetailCard.classList.remove('active');
        this.leafDetailCard.setAttribute('aria-hidden', 'true');
    }

    toggleYearReviewBook() {
        if (this.isBookOpen) {
            this.closeYearReviewBook();
        } else {
            this.openYearReviewBook();
        }
    }

    openYearReviewBook() {
        this.isBookOpen = true;
        if (this.yearReviewBook) {
            this.yearReviewBook.classList.add('open');
            this.yearReviewBook.setAttribute('aria-hidden', 'false');
        }
        if (this.yearReviewToggle) {
            this.yearReviewToggle.classList.add('active');
            this.yearReviewToggle.setAttribute('aria-expanded', 'true');
        }
    }

    closeYearReviewBook() {
        this.isBookOpen = false;
        if (this.yearReviewBook) {
            this.yearReviewBook.classList.remove('open');
            this.yearReviewBook.setAttribute('aria-hidden', 'true');
        }
        if (this.yearReviewToggle) {
            this.yearReviewToggle.classList.remove('active');
            this.yearReviewToggle.setAttribute('aria-expanded', 'false');
        }
    }

    turnReviewPage(direction) {
        if (!this.reviewYears.length || this.isBookFlipping) return;

        const nextIndex = (this.reviewIndex + direction + this.reviewYears.length) % this.reviewYears.length;
        const nextPage = this.reviewYears[nextIndex];

        this.animateBookFlip(direction, nextPage);

        window.setTimeout(() => {
            this.reviewIndex = nextIndex;
            this.renderYearReviewBook();
        }, 260);
    }

    animateBookFlip(direction, nextPage) {
        if (!this.yearReviewBook) return;

        this.yearReviewBook.classList.remove('flip-forward', 'flip-back');
        this.isBookFlipping = true;

        if (this.bookTurnYear && nextPage) {
            this.bookTurnYear.textContent = nextPage.year;
        }

        void this.yearReviewBook.offsetWidth;
        this.yearReviewBook.classList.add(direction > 0 ? 'flip-forward' : 'flip-back');

        window.setTimeout(() => {
            if (this.yearReviewBook) {
                this.yearReviewBook.classList.remove('flip-forward', 'flip-back');
            }
            this.isBookFlipping = false;
        }, 720);
    }

    async viewReviewYear() {
        const page = this.reviewYears[this.reviewIndex];
        if (!page) return;

        this.selectedYear = Number(page.year) || this.currentYear;
        this.isReviewMode = this.selectedYear !== this.currentYear;
        await this.fetchVisitorData(this.selectedYear);
        if (this.demoYearsEnabled && !this.visitors.length && page.isDemo) {
            this.visitors = this.createDemoVisitors(this.selectedYear, Number(page.leafCount) || 36);
        }
        this.updateTreeHeading();
        this.renderYearReviewBook();
        this.refreshTree();
    }

    async viewLiveYear() {
        this.selectedYear = this.currentYear;
        this.isReviewMode = false;
        await this.fetchVisitorData(this.currentYear);
        this.updateTreeHeading();
        this.refreshTree();
        this.renderYearReviewBook();
    }

    updateTreeHeading() {
        if ((this.demoFallEnabled || this.manualDemoFallActive) && !this.isReviewMode) {
            if (this.treeTitle) {
                this.treeTitle.textContent = 'ESG Digital Tree - Leaf Fall Demo';
            }
            if (this.treeSubtitle) {
                this.treeSubtitle.textContent = `${this.visitors.length} demo leaves will fall. No live feedback data is changed.`;
            }
            return;
        }

        const settings = this.visualAssets?.treeTitleBox;
        const configTitle = settings?.titleText || '🌳 ESG Digital Tree';
        const configSubtitle = settings?.subtitleText || `Growing with every visitor's contribution in ${this.currentYear}`;

        if (this.treeTitle) {
            this.treeTitle.textContent = this.isReviewMode
                ? `${this.selectedYear} ESG Tree Review`
                : configTitle;
        }

        if (this.treeSubtitle) {
            this.treeSubtitle.textContent = this.isReviewMode
                ? `Completed yearly tree with ${this.visitors.length} contribution${this.visitors.length === 1 ? '' : 's'}`
                : (this.activeCampaign?.treeSubtitle || configSubtitle);
        }
    }

    renderYearReviewBook() {
        if (!this.yearReviewBook || !this.bookYear || !this.bookCount || !this.reviewTreePreview) return;

        const page = this.reviewYears[this.reviewIndex] || {
            year: this.currentYear,
            leafCount: this.visitors.length,
            isCurrentYear: true
        };
        const leafCount = Number(page.leafCount) || 0;

        this.bookYear.textContent = page.year;
        this.bookCount.textContent = `${leafCount} ${leafCount === 1 ? 'leaf' : 'leaves'}`;
        this.reviewTreePreview.innerHTML = '';

        const dotCount = Math.min(leafCount, 90);
        for (let i = 0; i < dotCount; i++) {
            const dot = document.createElement('span');
            dot.className = 'review-leaf-dot';
            const random = this.createSeededRandom(`${page.year}|review-dot|${i}`);
            const angle = random() * Math.PI * 2;
            const radius = Math.sqrt(random());
            const x = 50 + Math.cos(angle) * radius * 33;
            const y = 35 + Math.sin(angle) * radius * 22;

            dot.style.left = `${x}%`;
            dot.style.top = `${y}%`;
            this.reviewTreePreview.appendChild(dot);
        }

        if (this.bookViewButton) {
            this.bookViewButton.textContent = Number(page.year) === this.currentYear ? 'View Live' : 'View Tree';
        }

        if (this.bookLiveButton) {
            this.bookLiveButton.classList.toggle('active', !this.isReviewMode);
        }
    }

    createDemoVisitors(year, count) {
        const badgeKeys = Object.keys(this.badgeLeafProfiles);
        return Array.from({ length: count }, (_, index) => {
            const badgeKey = badgeKeys[index % badgeKeys.length];
            const month = String((index % 12) + 1).padStart(2, '0');
            const day = String((index % 26) + 1).padStart(2, '0');

            return {
                id: `demo-${year}-${index + 1}`,
                name: `Visitor ${index + 1}`,
                visit_count: 1 + (index % 4),
                created_at: `${year}-${month}-${day}T10:00:00.000Z`,
                isVip: false,
                badgeKey,
                badgeName: this.badgeLeafProfiles[badgeKey].label,
                badgeColor: '',
                pledgeTopic: '',
                pledgeSnippet: 'Demo pledge snippet for the yearly review tree.',
                hasPublicName: false,
                privacyLabel: 'Demo visitor'
            };
        });
    }

    createDemoLandingVisitor() {
        this.demoLandingRunNumber += 1;
        const badgeKey = 'sustainable-living-advocate';
        const badgeProfile = this.badgeLeafProfiles[badgeKey];

        return {
            id: `demo-landing-${Date.now()}-${this.demoLandingRunNumber}`,
            name: 'Demo Landing',
            visit_count: 1,
            created_at: new Date().toISOString(),
            isVip: false,
            badgeKey,
            badgeName: badgeProfile.label,
            badgeColor: '',
            pledgeTopic: badgeKey,
            pledgeSnippet: 'Demo leaf for showing the kiosk landing animation.',
            hasPublicName: false,
            privacyLabel: 'Demo mode - no database record',
            isDemoLanding: true
        };
    }

    createDemoFallVisitors(count) {
        const badgeKeys = Object.keys(this.badgeLeafProfiles);
        const now = Date.now();

        return Array.from({ length: count }, (_, index) => {
            const badgeKey = badgeKeys[index % badgeKeys.length];
            const badgeProfile = this.badgeLeafProfiles[badgeKey];

            return {
                id: `demo-fall-${index + 1}`,
                name: `Demo Visitor ${index + 1}`,
                visit_count: 1 + (index % 3),
                created_at: new Date(now - ((count - index) * 1800)).toISOString(),
                isVip: false,
                badgeKey,
                badgeName: badgeProfile.label,
                badgeColor: '',
                pledgeTopic: badgeKey,
                pledgeSnippet: 'Demo leaf for showing the kiosk leaf falling animation.',
                hasPublicName: false,
                privacyLabel: 'Demo mode - no database record'
            };
        });
    }

    // ==================== VISUALIZATION ====================

    createLeaves() {
        this.leavesContainer.innerHTML = '';
        this.closeLeafDetail();
        if (!this.stageHasLeaves()) {
            return;
        }
        const leafCycle = this.getLeafCycleState();
        this.activeLeafCycle = leafCycle;

        const treeRect = this.treeImage.getBoundingClientRect();
        const containerRect = this.leavesContainer.getBoundingClientRect();
        const ovalArea = this.calculateOvalArea(treeRect, containerRect);

        // Leaves keep their spot across refreshes; a new layout (resize, growth stage) places them again.
        const layoutKey = [
            Math.round(containerRect.width),
            Math.round(containerRect.height),
            Math.round(treeRect.width),
            this.treeImageLeaves?.src || ''
        ].join('|');
        if (layoutKey !== this.leafLayoutKey) {
            this.leafPositions.clear();
            this.leafLayoutKey = layoutKey;
        }
        // Leaves stay clear of the title box: a leaf the title box now covers (the admin moved or resized
        // it) gets a new spot, and new leaves are never placed under it (leafTouchesTitle).
        this.titleKeepOut = this.getTitleKeepOut();
        for (const [key, spot] of this.leafPositions) {
            if (this.leafTouchesTitle(spot.x, spot.y, spot.size)) this.leafPositions.delete(key);
        }
        // Leaves that already have a spot are registered first, so a new leaf avoids all of them.
        this.placedLeafCircles = leafCycle.visibleVisitors
            .map((visitor, index) => this.leafPositions.get(this.getLeafKey(visitor, index)))
            .filter(Boolean)
            .map(spot => ({
                cx: spot.x + (spot.size / 2),
                cy: spot.y + (spot.size / 2),
                r: spot.size * this.leafSpacingRadius
            }));

        if (this.debugOval) {
            this.updateOvalOverlay(ovalArea);
        } else {
            const overlay = document.getElementById('ovalOverlay');
            if (overlay) {
                overlay.style.borderColor = 'rgba(255, 0, 0, 0)';
                overlay.style.background = 'transparent';
            }
        }

        leafCycle.visibleVisitors.forEach((visitor, index) => {
            this.createLeaf(visitor, index, ovalArea);
        });

        this.applyLeafThresholdEffect(leafCycle);
    }

    getLeafCycleState() {
        const threshold = Math.max(1, Number(this.leafFallThreshold) || 15);
        const visitors = this.sortVisitorsOldestFirst(this.visitors);

        if ((this.demoFallEnabled || this.manualDemoFallActive) && !this.isReviewMode) {
            const visibleVisitors = visitors.slice(0, threshold);
            const fallingLeafKeys = new Set(
                visibleVisitors.map((visitor, index) => this.getLeafKey(visitor, index))
            );
            return {
                visibleVisitors,
                shouldFallAway: visitors.length > 0,
                cycleNumber: Date.now(),
                threshold,
                fallingLeafKeys,
                fallingLeafOrder: this.createFallingLeafOrder(visibleVisitors),
                fallingLeafCount: visibleVisitors.length,
                isDemoCycle: true
            };
        }

        if (this.isReviewMode) {
            return {
                visibleVisitors: visitors,
                shouldFallAway: false,
                cycleNumber: 0,
                threshold,
                fallingLeafKeys: new Set(),
                fallingLeafOrder: new Map(),
                fallingLeafCount: 0
            };
        }

        const overflowCount = Math.max(0, visitors.length - threshold);
        let clearedOverflow = this.getClearedLeafOverflow(threshold);

        // A fresh browser starts from the current live tree instead of replaying historical falls.
        if (clearedOverflow === null) {
            clearedOverflow = overflowCount;
            this.setClearedLeafOverflow(threshold, clearedOverflow);
        }

        if (clearedOverflow > overflowCount) {
            clearedOverflow = overflowCount;
            this.setClearedLeafOverflow(threshold, clearedOverflow);
        }

        const fallingVisitors = visitors.slice(clearedOverflow, overflowCount);
        const retainedVisitors = visitors.slice(overflowCount);
        const visibleVisitors = [...fallingVisitors, ...retainedVisitors];

        return {
            visibleVisitors,
            shouldFallAway: fallingVisitors.length > 0,
            cycleNumber: overflowCount,
            threshold,
            overflowCount,
            fallingLeafKeys: new Set(
                fallingVisitors.map((visitor, index) => this.getLeafKey(visitor, clearedOverflow + index))
            ),
            fallingLeafOrder: this.createFallingLeafOrder(fallingVisitors, clearedOverflow),
            fallingLeafCount: fallingVisitors.length,
            isDemoCycle: false
        };
    }

    sortVisitorsOldestFirst(visitors) {
        return [...(Array.isArray(visitors) ? visitors : [])].sort((first, second) => {
            const firstTime = new Date(first?.created_at).getTime();
            const secondTime = new Date(second?.created_at).getTime();
            const safeFirstTime = Number.isFinite(firstTime) ? firstTime : Number.MAX_SAFE_INTEGER;
            const safeSecondTime = Number.isFinite(secondTime) ? secondTime : Number.MAX_SAFE_INTEGER;

            if (safeFirstTime !== safeSecondTime) return safeFirstTime - safeSecondTime;

            return String(first?.feedback_id || first?.id || '')
                .localeCompare(String(second?.feedback_id || second?.id || ''), undefined, { numeric: true });
        });
    }

    createFallingLeafOrder(visitors, startIndex = 0) {
        return new Map((visitors || []).map((visitor, index) => [
            this.getLeafKey(visitor, startIndex + index),
            index
        ]));
    }

    getClearedLeafOverflowKey(threshold) {
        return `rp-tree-cleared-overflow:${this.selectedYear}:${threshold}`;
    }

    getClearedLeafOverflow(threshold) {
        const key = this.getClearedLeafOverflowKey(threshold);
        if (this.clearedLeafOverflowByKey.has(key)) {
            return this.clearedLeafOverflowByKey.get(key);
        }

        try {
            const storedValue = localStorage.getItem(key);
            if (storedValue === null) return null;

            const value = Number(storedValue);
            if (!Number.isInteger(value) || value < 0) return null;
            this.clearedLeafOverflowByKey.set(key, value);
            return value;
        } catch (error) {
            return null;
        }
    }

    setClearedLeafOverflow(threshold, overflowCount) {
        const key = this.getClearedLeafOverflowKey(threshold);
        const value = Math.max(0, Number(overflowCount) || 0);
        this.clearedLeafOverflowByKey.set(key, value);

        try {
            localStorage.setItem(key, String(value));
        } catch (error) {
            console.warn('Leaf queue state could not be saved:', error);
        }
    }

    calculateOvalArea(treeRect, containerRect) {
        const centerX =
            treeRect.left - containerRect.left + (treeRect.width / 2);

        // UPDATED: move canopy center slightly higher
        const centerY =
            treeRect.top - containerRect.top + (treeRect.height * 0.32);

        return {
            x: centerX - (this.ovalWidth / 2),
            y: centerY - (this.ovalHeight / 2) + this.ovalTopOffset,
            width: this.ovalWidth,
            height: this.ovalHeight
        };
    }

    updateOvalOverlay(ovalArea) {
        let ovalOverlay = document.getElementById('ovalOverlay');

        if (!ovalOverlay) {
            ovalOverlay = document.createElement('div');
            ovalOverlay.id = 'ovalOverlay';
            document.getElementById('treeContainer').appendChild(ovalOverlay);
        }

        ovalOverlay.style.position = 'absolute';
        ovalOverlay.style.width = `${ovalArea.width}px`;
        ovalOverlay.style.height = `${ovalArea.height}px`;
        ovalOverlay.style.left = `${ovalArea.x}px`;
        ovalOverlay.style.top = `${ovalArea.y}px`;
        ovalOverlay.style.transform = 'none';
    }

    // ==================== MASK ====================

    buildMaskCanvas() {
        if (!this.stageHasLeaves()) {
            return null;
        }

        if (!this.treeImageLeaves) {
            console.warn('treeImageLeaves not found - mask disabled');
            return null;
        }

        const img = this.treeImageLeaves;
        const w = img.naturalWidth;
        const h = img.naturalHeight;

        if (!w || !h) {
            console.warn('stage4leaves image not ready - mask disabled');
            return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        return { canvas, ctx, w, h };
    }

    maskPixelHasLeafSupport(ctx, x, y, w, h, leafSize, scaleX, scaleY) {
        const radiusX = Math.max(8, leafSize * 0.18 * scaleX);
        const radiusY = Math.max(8, leafSize * 0.18 * scaleY);
        const samples = [
            [x, y],
            [x - radiusX, y],
            [x + radiusX, y],
            [x, y - radiusY],
            [x, y + radiusY]
        ];

        let supportedSamples = 0;

        for (const [sampleX, sampleY] of samples) {
            const px = Math.max(0, Math.min(w - 1, Math.floor(sampleX)));
            const py = Math.max(0, Math.min(h - 1, Math.floor(sampleY)));
            const alpha = ctx.getImageData(px, py, 1, 1).data[3];

            if (alpha > 45) {
                supportedSamples += 1;
            }
        }

        return supportedSamples >= 4;
    }

    findRandomPositionInLeavesMask(leafSize, seed) {
        if (!this.maskData || !this.treeImageLeaves) {
            return null;
        }

        const { ctx, w, h } = this.maskData;
        const random = this.createSeededRandom(seed);

        const rect = this.treeImageLeaves.getBoundingClientRect();
        const containerRect = this.leavesContainer.getBoundingClientRect();

        const left = rect.left - containerRect.left;
        const top = rect.top - containerRect.top;

        const displayW = rect.width;
        const displayH = rect.height;

        if (!displayW || !displayH) {
            return null;
        }

        const scaleX = w / displayW;
        const scaleY = h / displayH;
        const radius = leafSize * this.leafSpacingRadius;
        let best = null;

        for (let i = 0; i < 900; i++) {
            const rx = random() * displayW;
            const ry = random() * displayH;

            // Never under the title box.
            if (this.leafTouchesTitle(left + rx - leafSize / 2, top + ry - leafSize / 2, leafSize)) continue;

            // Cheap overlap test first; only read mask pixels for a spot that beats the best so far.
            const overlap = this.leafOverlapAt(left + rx, top + ry, radius);
            if (best && overlap >= best.overlap) continue;

            const nx = Math.floor(rx * scaleX);
            const ny = Math.floor(ry * scaleY);

            const pixel = ctx.getImageData(nx, ny, 1, 1).data;
            const alpha = pixel[3];

            // Alpha plus neighbour checks keep leaves anchored in the canopy, away from loose edges.
            if (alpha > 55 && this.maskPixelHasLeafSupport(ctx, nx, ny, w, h, leafSize, scaleX, scaleY)) {
                best = {
                    x: left + rx - leafSize / 2,
                    y: top + ry - leafSize / 2,
                    overlap
                };
                if (overlap === 0) break;
            }
        }

        // A full canopy has no clear spot left; the least crowded one is used instead.
        return best ? { x: best.x, y: best.y } : null;
    }

    // The title box's area on the leaves' layer, with a margin: no leaf sits there, wherever the admin puts
    // the title box (Tree Title Box position) or however big it is. Null when the title box is hidden.
    getTitleKeepOut() {
        const title = this.treeTitleBox;
        if (!title || !this.leavesContainer) return null;
        const style = getComputedStyle(title);
        if (style.display === 'none' || style.visibility === 'hidden') return null;
        const rect = title.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const container = this.leavesContainer.getBoundingClientRect();
        const margin = 14;
        return {
            left: rect.left - container.left - margin,
            top: rect.top - container.top - margin,
            right: rect.right - container.left + margin,
            bottom: rect.bottom - container.top + margin
        };
    }

    // Whether a leaf with its top-left corner at (x, y) on the leaves' layer would touch the title box.
    leafTouchesTitle(x, y, leafSize, keepOut = this.titleKeepOut) {
        if (!keepOut) return false;
        return x < keepOut.right && x + leafSize > keepOut.left && y < keepOut.bottom && y + leafSize > keepOut.top;
    }

    // How deep a leaf centred at (cx, cy) would overlap the leaves already placed; 0 means clear.
    leafOverlapAt(cx, cy, radius) {
        let overlap = 0;
        for (const other of this.placedLeafCircles) {
            const gap = Math.hypot(cx - other.cx, cy - other.cy) - (radius + other.r);
            if (gap < 0) overlap = Math.max(overlap, -gap);
        }
        return overlap;
    }

    // A leaf keeps the spot it was first given, so refreshes never move it.
    getLeafPosition(leafKey, leafSize, visitorSeed, ovalArea) {
        const saved = this.leafPositions.get(leafKey);
        if (saved) {
            const shift = (saved.size - leafSize) / 2;
            return { x: saved.x + shift, y: saved.y + shift };
        }

        const position = this.findRandomPositionInLeavesMask(leafSize, `${visitorSeed}|position`)
            || this.findRandomPositionInOval(ovalArea, leafSize, `${visitorSeed}|fallback`);

        this.leafPositions.set(leafKey, { x: position.x, y: position.y, size: leafSize });
        this.placedLeafCircles.push({
            cx: position.x + (leafSize / 2),
            cy: position.y + (leafSize / 2),
            r: leafSize * this.leafSpacingRadius
        });
        return position;
    }

    // ==================== LEAF CREATION ====================

    createLeaf(visitor, index, ovalArea) {
        const leaf = document.createElement('div');
        leaf.className = 'leaf';
        const visitorSeed = this.getVisitorSeed(visitor, index);
        const leafKey = this.getLeafKey(visitor, index);
        const seededRandom = this.createSeededRandom(`${visitorSeed}|leaf`);

        const isVip = Boolean(visitor.isVip) || this.isVipName(visitor.name);
        if (isVip) {
            leaf.classList.add('vip');
        }
        const isNeonGlowing = this.shouldLeafGlow(visitor);
        if (isNeonGlowing) {
            leaf.classList.add('leaf-neon-glow');
        }

        const badgeProfile = this.getBadgeLeafProfile(visitor);
        leaf.classList.add(badgeProfile.className);
        const badgeLeafColor = this.getBadgeLeafColor(visitor);
        leaf.dataset.badgeColor = badgeLeafColor;
        
        const visitTime = new Date(visitor.created_at);
        const now = new Date();
        const diffInMinutes = (now - visitTime) / 60000;

        const isWithinTintWindow = !Number.isNaN(visitTime.getTime())
            && (Date.now() - visitTime.getTime()) >= 0
            && (Date.now() - visitTime.getTime()) <= this.badgeTintDurationMs;

        if (!isVip && isWithinTintWindow) {
            leaf.classList.add('leaf-tinted');
            leaf.style.setProperty('--leaf-badge-color', badgeLeafColor);
        }
        
        leaf.dataset.badge = visitor.badgeKey || 'feedback-completer';
        leaf.dataset.leafKey = leafKey;
        leaf.title = `${visitor.name || 'Anonymous visitor'} - ${visitor.badgeName || badgeProfile.label}`;
        leaf.setAttribute('role', 'button');
        leaf.setAttribute('tabindex', '0');
        leaf.setAttribute('aria-label', `View ${visitor.name || 'anonymous visitor'} leaf details`);

        const side = badgeProfile.preferredSide || (seededRandom() > 0.5
            ? 'LeftLeaf.png'
            : 'RightLeaf.png');

        let finalLeafImage;

        if (isVip) {
            finalLeafImage = 'Gold' + side;
        } else {
            finalLeafImage =
                diffInMinutes >= 0 && diffInMinutes <= 2
                    ? 'New' + side
                    : 'Old' + side;
        }

        const leafBasePath = isVip ? '/assets/Tree/vip-leaf' : '/assets/Tree/leaf';

        if (isVip) {
            if (this.vipLeafOverrideImage) {
                leaf.style.backgroundImage = `url('${this.vipLeafOverrideImage}')`;
            } else {
                leaf.style.backgroundImage = `url('${leafBasePath}/${finalLeafImage}')`;
            }
        } else if (this.leafOverrideImage) {
            leaf.style.backgroundImage = `url('${this.leafOverrideImage}')`;
        } else {
            leaf.style.backgroundImage = `url('${leafBasePath}/${finalLeafImage}')`;
        }
        leaf.style.opacity = String(this.leafOpacity);
        leaf.style.setProperty('--leaf-visible-opacity', String(this.leafOpacity));
        leaf.style.setProperty('--leaf-appear-duration', `${this.leafAnimationDuration}ms`);
        // The tree is rebuilt on every refresh; only leaves new to this page should pop in.
        if (this.renderedLeafKeys.has(leafKey)) {
            leaf.style.setProperty('--leaf-appear-duration', '0ms');
        }
        this.renderedLeafKeys.add(leafKey);
        leaf.style.setProperty('--leaf-fall-duration', `${this.leafFallDuration}ms`);
        const windDirection = seededRandom() > 0.5 ? 1 : -1;
        const fallOrder = this.activeLeafCycle?.fallingLeafOrder?.get(leafKey);
        const fallingLeafCount = Math.max(1, Number(this.activeLeafCycle?.fallingLeafCount) || 1);
        const fallStep = Math.min(120, 1600 / Math.max(1, fallingLeafCount - 1));
        let fallDelay = Number.isInteger(fallOrder) ? Math.round(fallOrder * fallStep) : 0;
        if (Number.isInteger(fallOrder) && this.manualDemoFallActive && !this.isReviewMode) {
            fallDelay += 900;
        }
        const fallDistance = Math.round(Math.max(360, Math.min(window.innerHeight * (0.5 + seededRandom() * 0.32), 760)));
        const finalDrift = Math.round(windDirection * (90 + seededRandom() * 230));
        const swayA = Math.round(windDirection * (28 + seededRandom() * 68));
        const swayB = Math.round(windDirection * -(44 + seededRandom() * 96));
        const swayC = Math.round(windDirection * (24 + seededRandom() * 88));
        const swayD = Math.round(windDirection * (10 + seededRandom() * 46));
        const fallRotation = Math.round(windDirection * (140 + seededRandom() * 340));
        const fallTilt = Math.round((seededRandom() - 0.5) * 64);
        const fallYaw = Math.round(windDirection * (22 + seededRandom() * 34));
        const flutterDuration = Math.round(620 + seededRandom() * 520);
        const endScale = (0.72 + seededRandom() * 0.1).toFixed(2);
        const preEndScale = Math.min(0.88, Number(endScale) + 0.04).toFixed(2);
        const endBlur = (0.12 + seededRandom() * 0.28).toFixed(2);
        const appearDrift = Math.round((seededRandom() - 0.5) * 28);
        const appearRotation = Math.round((seededRandom() - 0.5) * 26);

        leaf.dataset.fallDelay = String(fallDelay);
        leaf.style.setProperty('--leaf-fall-delay', `${fallDelay}ms`);
        leaf.style.setProperty('--leaf-fall-distance', `${fallDistance}px`);
        leaf.style.setProperty('--leaf-fall-drift', `${finalDrift}px`);
        leaf.style.setProperty('--leaf-fall-sway-a', `${swayA}px`);
        leaf.style.setProperty('--leaf-fall-sway-b', `${swayB}px`);
        leaf.style.setProperty('--leaf-fall-sway-c', `${swayC}px`);
        leaf.style.setProperty('--leaf-fall-sway-d', `${swayD}px`);
        leaf.style.setProperty('--leaf-fall-rotation', `${fallRotation}deg`);
        leaf.style.setProperty('--leaf-fall-tilt', `${fallTilt}deg`);
        leaf.style.setProperty('--leaf-fall-yaw', `${fallYaw}deg`);
        leaf.style.setProperty('--leaf-fall-end-tilt', `${Math.round(fallTilt * 0.18)}deg`);
        leaf.style.setProperty('--leaf-fall-end-scale', endScale);
        leaf.style.setProperty('--leaf-fall-pre-end-scale', preEndScale);
        leaf.style.setProperty('--leaf-fall-end-blur', `${endBlur}px`);
        leaf.style.setProperty('--leaf-flutter-duration', `${flutterDuration}ms`);
        leaf.style.setProperty('--leaf-appear-drift', `${appearDrift}px`);
        leaf.style.setProperty('--leaf-appear-rotation', `${appearRotation}deg`);

        const baseLeafSize = 80 + ((visitor.visit_count || 1) * 5);
        const scale = isVip
            ? (typeof this.vipLeafDisplayScale === 'number' ? this.vipLeafDisplayScale : this.leafDisplayScale)
            : (typeof this.leafDisplayScale === 'number' ? this.leafDisplayScale : 1);
        const leafSize = Math.max(8, Math.round(baseLeafSize * scale));
        leaf.style.width = `${leafSize}px`;
        leaf.style.height = `${leafSize}px`;
        leaf.style.setProperty('--leaf-size', `${leafSize}px`);
        const glowTimestamp = this.getLeafGlowTimestamp(visitor);
        if (glowTimestamp) {
            leaf.dataset.leafGlowTimestamp = glowTimestamp.toISOString();
        }

        // Inside the canopy mask (oval as fallback), clear of the other leaves.
        const position = this.getLeafPosition(leafKey, leafSize, visitorSeed, ovalArea);

        leaf.style.left = `${position.x}px`;
        leaf.style.top = `${position.y}px`;

        const leafOverrideUrl = isVip
            ? this.vipLeafOverrideImage
            : this.leafOverrideImage;
        const useFlippedOverride = Boolean(leafOverrideUrl) && seededRandom() > 0.5;
        const leafImageUrl = leafOverrideUrl || `${leafBasePath}/${finalLeafImage}`;

        leaf.classList.toggle('leaf-image-flipped', useFlippedOverride);
        leaf.style.setProperty('--leaf-image-url', `url('${leafImageUrl}')`);
        leaf.style.setProperty('--leaf-image-scale-x', useFlippedOverride ? '-1' : '1');
        leaf.style.backgroundImage = 'none';

        // Every leaf joins the tree at its own angle: upright, sideways, upside down or anything between.
        // Seeded from the feedback, so a leaf keeps its angle across refreshes.
        const leafAngle = Math.round(this.createSeededRandom(`${visitorSeed}|angle`)() * 360) - 180;
        leaf.style.setProperty('--leaf-angle', `${leafAngle}deg`);

        const isFallingLeaf = this.activeLeafCycle?.fallingLeafKeys?.has(leafKey) === true;
        const isLanding = this.pendingLandingLeafKeys.has(leafKey) && !isFallingLeaf;
        // Each leaf keeps one glow rhythm, so the pulse carries on smoothly through a refresh.
        // A leaf still in flight gets its rhythm when it lands.
        if (!isLanding && !this.leafGlowEpochs.has(leafKey)) {
            this.leafGlowEpochs.set(leafKey, this.animationClock());
        }
        if (this.leafGlowEpochs.has(leafKey)) {
            leaf.style.setProperty('--leaf-glow-delay', `${Math.round(this.leafGlowEpochs.get(leafKey) - this.animationClock())}ms`);
        }
        if (isLanding) {
            this.configureLeafLandingAnimation(leaf, leafKey, position, leafSize, seededRandom, index, visitor);
        }

        const nameElement = document.createElement('div');
        nameElement.className = 'leaf-name';
        // The name follows the leaf photo actually shown (the admin-chosen image too) and its mirroring.
        let shownSide = null;
        if (/LeftLeaf/i.test(leafImageUrl)) shownSide = 'LeftLeaf.png';
        if (/RightLeaf/i.test(leafImageUrl)) shownSide = 'RightLeaf.png';
        if (shownSide && useFlippedOverride) {
            shownSide = shownSide === 'LeftLeaf.png' ? 'RightLeaf.png' : 'LeftLeaf.png';
        }
        const nameLayout = this.getLeafNameLayout(visitor.name || 'Anonymous', leafSize, isVip, shownSide);
        nameElement.textContent = nameLayout.text;
        // The name turns with the leaf so it stays along the midrib, flipped half a turn when it would
        // otherwise read upside down (the text box is centred, so it still fits the blade).
        let nameAngle = (((nameLayout.angle + leafAngle) % 360) + 360) % 360;
        if (nameAngle > 180) nameAngle -= 360;
        if (nameAngle > 90) nameAngle -= 180;
        if (nameAngle <= -90) nameAngle += 180;
        nameElement.style.setProperty('--leaf-name-angle', `${nameAngle.toFixed(1)}deg`);
        nameElement.style.setProperty('--leaf-name-left', `${nameLayout.left}%`);
        nameElement.style.setProperty('--leaf-name-top', `${nameLayout.top}%`);
        nameElement.style.setProperty('--leaf-name-width', `${nameLayout.width}px`);
        nameElement.style.setProperty('--leaf-name-height', `${nameLayout.height}px`);
        nameElement.style.setProperty('--leaf-name-lines', String(nameLayout.lines));
        nameElement.style.setProperty('--leaf-name-font-size', `${nameLayout.fontSize}px`);
        nameElement.style.fontSize = `${nameLayout.fontSize}px`;
        leaf.appendChild(nameElement);

        leaf.addEventListener('click', (event) => {
            event.stopPropagation();
            this.openLeafDetail(visitor, badgeProfile, leaf);
        });
        leaf.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.openLeafDetail(visitor, badgeProfile, leaf);
            }
        });

        this.leavesContainer.appendChild(leaf);
        // A refresh right after a landing carries on the glow fade-in where it was.
        if (!isLanding) this.playLeafGlowFadeIn(leaf, leafKey);
    }

    // Plans the arrival of a new leaf. It first appears at the bottom middle of the wall at twice its
    // size and stays there for "Time at the bottom middle" (leafShowcaseMs, 12 seconds by default),
    // drifting gently so the visitor can find it; then it flies to its spot on the canopy. Several new
    // leaves take turns at the bottom middle: each appears once the one before has flown clear. The
    // flight starts fully on screen and weaves left and right in a zigzag that narrows as it rises,
    // leaning into each turn. The path is sampled by distance travelled and played with one easing over
    // the whole flight, so the speed changes smoothly from start to landing. (The demo page's landing
    // flies at once.)
    planLeafLandingFlight(position, leafSize, random, index, visitor) {
        const windDirection = random() > 0.5 ? 1 : -1;
        const isDemo = visitor?.isDemoLanding === true;
        const duration = isDemo
            ? Math.round(6600 + random() * 500)
            : Math.round(5600 + random() * 900);
        const hold = isDemo ? 0 : Math.max(0, Number(this.leafShowcaseMs) || 0);
        let delay = isDemo
            ? 80
            : Math.min(index * 70 + Math.round(random() * 120), 640);
        if (hold > 0) {
            // Waits its turn at the bottom middle.
            const now = this.animationClock();
            delay = Math.max(delay, Math.round((this.landingStageFreeAt || 0) - now));
            this.landingStageFreeAt = now + delay + hold + LANDING_STAGE_CLEAR_MS;
        }
        const containerRect = this.leavesContainer?.getBoundingClientRect();
        const width = containerRect?.width || window.innerWidth || 1920;
        const height = containerRect?.height || window.innerHeight || 1080;
        const finalCenterX = (position?.x || 0) + (leafSize / 2);
        const finalCenterY = (position?.y || 0) + (leafSize / 2);

        // Every new leaf rises from the bottom middle at twice its size and shrinks to its real size on the tree.
        const startScale = 2;
        const halfSizeAt = (scale) => ((leafSize * scale) / 2) + 16;
        // Exactly the bottom middle when it waits there; a little to either side when it flies at once.
        const startJitter = (random() - 0.5) * 0.2;
        const startCenterX = width * (0.5 + (hold > 0 ? 0 : startJitter));
        let startCenterY = height - halfSizeAt(startScale) - (height * 0.04);
        // With the title box at the bottom of the screen, the new leaf shows just above it, not under it.
        const keepOut = this.getTitleKeepOut();
        const startHalf = halfSizeAt(startScale);
        if (keepOut && startCenterX + startHalf > keepOut.left && startCenterX - startHalf < keepOut.right
            && startCenterY + startHalf > keepOut.top && startCenterY - startHalf < keepOut.bottom) {
            startCenterY = Math.max(startHalf, keepOut.top - startHalf - 8);
        }
        const swings = 2.2 + random() * 1.3;
        const amplitude = Math.min(Math.max(width * 0.16, 180), 460) * (0.75 + random() * 0.5);
        const bank = 12 + random() * 12;
        const yaw = windDirection * (24 + random() * 26);
        const opacityValue = Number(this.leafOpacity);
        const visibleOpacity = Number.isFinite(opacityValue) ? opacityValue : 0.9;
        const smoothstep = (edge0, edge1, value) => {
            const k = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
            return k * k * (3 - (2 * k));
        };
        // Shrinks gradually across the whole flight: holds 2x for a moment at the start,
        // then eases down and settles softly at 1x as it reaches its spot.
        const scaleAt = (s) => 1 + ((startScale - 1) * (1 - smoothstep(0, 1, s)));

        // Offset from the leaf's final spot at progress s (0 = start, 1 = landed).
        const pathAt = (s) => {
            const envelope = (1 - s) ** 1.1;
            const weave = windDirection * amplitude * Math.sin(Math.PI * swings * s) * envelope;
            let centerX = startCenterX + ((finalCenterX - startCenterX) * s) + weave;
            // No overshoot: the leaf glides straight into its spot and slows to a stop there.
            let centerY = startCenterY + ((finalCenterY - startCenterY) * s);

            // Keep the leaf inside the screen; release the clamp at the very end so it lands exactly.
            const margin = halfSizeAt(scaleAt(s));
            const release = smoothstep(0.85, 1, s);
            const clampedX = Math.min(width - margin, Math.max(margin, centerX));
            const clampedY = Math.min(height - margin, centerY);
            centerX = clampedX + ((centerX - clampedX) * release);
            centerY = clampedY + ((centerY - clampedY) * release);
            return [centerX - finalCenterX, centerY - finalCenterY];
        };

        const tableSize = 400;
        const arcLengths = [0];
        let previousPoint = pathAt(0);
        for (let i = 1; i <= tableSize; i += 1) {
            const point = pathAt(i / tableSize);
            arcLengths.push(arcLengths[i - 1] + Math.hypot(point[0] - previousPoint[0], point[1] - previousPoint[1]));
            previousPoint = point;
        }
        const totalLength = arcLengths[tableSize] || 1;
        const progressAtDistance = (fraction) => {
            const target = fraction * totalLength;
            let i = 1;
            while (i < tableSize && arcLengths[i] < target) i += 1;
            const segment = arcLengths[i] - arcLengths[i - 1];
            return (i - 1 + (segment > 0 ? (target - arcLengths[i - 1]) / segment : 0)) / tableSize;
        };

        // One animation plays the time at the bottom middle and then the flight, so the flight's easing
        // (FLIGHT_EASING) is worked into its keyframes and the animation itself runs evenly.
        const total = hold + duration;
        const holdShare = hold / total;
        const keyframes = [];

        if (hold > 0) {
            // At the bottom middle: fading in as it rises a little into place, then drifting gently. The
            // drift calms to nothing before take-off, so the flight starts from exactly here.
            const [startX, startY] = pathAt(0);
            const holdSteps = Math.max(24, Math.round(hold / 120));
            const appearMs = Math.min(900, hold / 2);
            const settleMs = Math.max(1, Math.min(1200, hold / 2));
            const drift = random() * Math.PI * 2;
            for (let step = 0; step < holdSteps; step += 1) {
                const ms = (step / holdSteps) * hold;
                const appear = smoothstep(0, appearMs, ms);
                const idle = smoothstep(0, settleMs, ms) * (1 - smoothstep(hold - settleMs, hold, ms));
                const seconds = ms / 1000;
                const x = startX + (5 * Math.sin((seconds * 1.1) + (drift * 2)) * idle);
                const y = startY + (7 * Math.sin((seconds * 1.9) + drift) * idle) + (18 * (1 - appear));
                const rotate = 3 * Math.sin((seconds * 1.5) + drift) * idle;
                keyframes.push({
                    offset: Number((ms / total).toFixed(5)),
                    opacity: Number((visibleOpacity * appear).toFixed(3)),
                    transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0px) rotate(${rotate.toFixed(2)}deg) rotateY(0deg) scale(${(startScale * (0.9 + (0.1 * appear))).toFixed(4)})`
                });
            }
        }

        const steps = 120;
        for (let step = 0; step <= steps; step += 1) {
            const time = step / steps;
            const t = flightEase(time);
            const s = progressAtDistance(t);
            const [x, y] = pathAt(s);
            const envelope = (1 - s) ** 1.1;
            // Lean into the direction of travel, and turn the leaf face as it swings. After the time at
            // the bottom middle the leaf takes off level and leans in gently.
            const lean = hold > 0 ? smoothstep(0, 0.06, t) : 1;
            const rotate = windDirection * bank * Math.cos(Math.PI * swings * s) * envelope * lean;
            const rotateY = yaw * Math.sin(Math.PI * swings * s) * envelope;
            const opacity = hold > 0 ? visibleOpacity : visibleOpacity * smoothstep(0, 0.05, t);

            keyframes.push({
                offset: Number((holdShare + (time * (1 - holdShare))).toFixed(5)),
                opacity: Number(opacity.toFixed(3)),
                transform: step === steps
                    ? 'translate3d(0px, 0px, 0px) rotate(0deg) rotateY(0deg) scale(1)'
                    : `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0px) rotate(${rotate.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(${scaleAt(s).toFixed(4)})`
            });
        }
        keyframes[keyframes.length - 1].offset = 1;

        return {
            isDemo,
            duration: total,         // the time at the bottom middle and the flight
            flightDuration: duration,
            hold,
            delay,
            keyframes,
            yaw: Math.round(yaw),
            flutterDuration: Math.round(700 + random() * 400)
        };
    }

    // The page's animation clock (the time the browser plays animations by), so flights and glow
    // fades can be pinned to fixed start times and carry on unchanged when the tree is rebuilt.
    animationClock() {
        const now = document.timeline?.currentTime;
        return typeof now === 'number' ? now : performance.now();
    }

    // The leaf photo's flutter during a flight: a gentle sway that eases in after take-off and
    // calms to exactly nothing at the landing, so the leaf comes to rest without a snap.
    planLeafFlutterKeyframes(flight, flip) {
        const flightDuration = flight.flightDuration ?? flight.duration; // the flight only, not the time before it
        const steps = Math.max(60, Math.round(flightDuration / 33));
        const period = Math.max(600, flight.flutterDuration * 2);
        const swayY = Math.min(Math.abs(flight.yaw) * 0.45, 22) * Math.sign(flight.yaw || 1);
        const keyframes = [];
        for (let step = 0; step <= steps; step += 1) {
            const t = step / steps;
            const easeIn = Math.min(1, t / 0.08);
            const envelope = (easeIn * easeIn * (3 - (2 * easeIn))) * ((1 - t) ** 1.6);
            const phase = (2 * Math.PI * t * flightDuration) / period;
            const rotateY = swayY * Math.sin(phase) * envelope;
            const rotateZ = 4 * Math.sin((phase * 0.5) + 0.8) * envelope;
            keyframes.push({
                offset: t,
                transform: `scaleX(${flip}) rotateY(${rotateY.toFixed(2)}deg) rotateZ(${rotateZ.toFixed(2)}deg)`
            });
        }
        return keyframes;
    }

    // Fades a just-landed leaf's neon glow in, ending exactly where the glow pulse begins.
    // Resumed part-way when the tree refreshes during the fade.
    playLeafGlowFadeIn(leaf, leafKey) {
        const pulseStartsAt = this.leafGlowEpochs.get(leafKey);
        if (pulseStartsAt === undefined || typeof leaf.animate !== 'function') return;
        const fadeStartsAt = pulseStartsAt - LEAF_GLOW_FADE_MS;
        const elapsed = this.animationClock() - fadeStartsAt;
        if (elapsed < 0 || elapsed >= LEAF_GLOW_FADE_MS || !leaf.classList.contains('leaf-neon-glow')) return;

        const opacityValue = Number(this.leafOpacity);
        const visibleOpacity = Number.isFinite(opacityValue) ? opacityValue : 0.9;
        // The first frame of the leafNeonPulse keyframes in tree.css.
        const glow = 'drop-shadow(0 0 6px rgba(57, 255, 20, 0.85)) drop-shadow(0 0 18px rgba(57, 255, 20, 0.58))';
        const timing = { duration: LEAF_GLOW_FADE_MS, easing: 'ease-in-out' };
        const fade = leaf.animate([
            { filter: 'drop-shadow(0 8px 12px rgba(12, 50, 27, 0.28)) drop-shadow(0 0 0 rgba(57, 255, 20, 0))', opacity: visibleOpacity },
            { filter: glow, opacity: 0.82 }
        ], timing);
        fade.startTime = fadeStartsAt;
        try {
            const halo = leaf.animate([
                { filter: glow, opacity: 0 },
                { filter: glow, opacity: 0.82 }
            ], { ...timing, pseudoElement: '::after' });
            halo.startTime = fadeStartsAt;
        } catch {
            // No pseudo-element animation support: the halo simply appears with the pulse.
        }
    }

    configureLeafLandingAnimation(leaf, leafKey, position, leafSize, random, index, visitor) {
        // Refreshes rebuild every leaf, so a flight in progress is resumed from where it was.
        let flight = this.landingFlights.get(leafKey);
        if (!flight) {
            flight = this.planLeafLandingFlight(position, leafSize, random, index, visitor);
            flight.startedAt = this.animationClock();
            this.landingFlights.set(leafKey, flight);
        }

        const elapsed = this.animationClock() - flight.startedAt;
        const remaining = flight.delay + flight.duration - elapsed;
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            && !document.body.classList.contains('tree-demo-motion-active');

        if (this.landingCleanupTimers.has(leafKey)) {
            window.clearTimeout(this.landingCleanupTimers.get(leafKey));
            this.landingCleanupTimers.delete(leafKey);
        }

        let flutter = null;
        const settleLeaf = (animation) => {
            this.pendingLandingLeafKeys.delete(leafKey);
            this.landingFlights.delete(leafKey);
            if (this.landingCleanupTimers.has(leafKey)) {
                window.clearTimeout(this.landingCleanupTimers.get(leafKey));
                this.landingCleanupTimers.delete(leafKey);
            }
            if (!leaf.isConnected && animation) return;
            // A just-landed leaf fades its glow in; its pulse starts once the fade is done.
            const glowFadeMs = animation ? LEAF_GLOW_FADE_MS : 0;
            this.leafGlowEpochs.set(leafKey, this.animationClock() + glowFadeMs);
            leaf.style.setProperty('--leaf-glow-delay', `${glowFadeMs}ms`);
            leaf.classList.remove('leaf-landing');
            leaf.classList.add('leaf-landed');
            // Both flight animations end exactly at the leaf's resting state, so removing them changes nothing on screen.
            animation?.cancel();
            flutter?.cancel();
            if (animation) this.playLeafGlowFadeIn(leaf, leafKey);
        };

        if (reduceMotion || remaining <= 0 || typeof leaf.animate !== 'function') {
            settleLeaf(null);
            return;
        }

        leaf.classList.add('leaf-landing');
        leaf.classList.toggle('leaf-demo-landing', flight.isDemo);
        // The flight's shadow and flutter start at take-off, after the time at the bottom middle.
        const flightDuration = flight.flightDuration ?? flight.duration;
        const takeOff = flight.delay + (flight.hold || 0);
        leaf.style.setProperty('--leaf-land-duration', `${flightDuration}ms`);
        leaf.style.setProperty('--leaf-land-delay', `${Math.round(takeOff - elapsed)}ms`);

        // Even timing: the flight's easing is already in its keyframes (planLeafLandingFlight).
        const animation = leaf.animate(flight.keyframes, {
            duration: flight.duration,
            delay: flight.delay,
            easing: 'linear',
            fill: 'both'
        });
        // Pinned to the flight's own start on the page clock: a leaf rebuilt by a refresh mid-flight
        // carries on from exactly the same point, with no jump.
        animation.startTime = flight.startedAt;

        // The photo flutters as it flies, calming to nothing by the landing.
        try {
            const flip = leaf.style.getPropertyValue('--leaf-image-scale-x').trim() === '-1' ? -1 : 1;
            flutter = leaf.animate(this.planLeafFlutterKeyframes(flight, flip), {
                duration: flightDuration,
                delay: takeOff,
                easing: 'linear',
                fill: 'both',
                pseudoElement: '::before'
            });
            flutter.startTime = flight.startedAt;
        } catch {
            flutter = null;
        }

        animation.finished
            .then(() => {
                if (leaf.isConnected) settleLeaf(animation);
            })
            .catch(() => {});

        const timer = window.setTimeout(() => settleLeaf(animation), remaining + 350);
        this.landingCleanupTimers.set(leafKey, timer);
    }

    // Where the name sits, its angle and its text box: centred in the middle of the leaf and turned to
    // run along the midrib, inside the leaf blade. The built-in leaf photos lie diagonally with the
    // midrib about 27.5 degrees from horizontal: rising to the right on the left-hand leaf, falling to
    // the right on the right-hand one. `side` is the photo as shown, mirroring included. A custom
    // uploaded leaf image of unknown shape keeps the name level. Every name uses the same font size
    // (getLeafNameFontSize); the box grows or narrows with the number of lines the name needs.
    getLeafNameLayout(name, leafSize, isVip, side) {
        const size = Number(leafSize) || 80;
        const fontSize = this.getLeafNameFontSize();
        let angle = 0;
        if (side === 'LeftLeaf.png') angle = -27.5;
        if (side === 'RightLeaf.png') angle = 27.5;

        let widthTable = isVip ? LEAF_NAME_LEVEL_WIDTHS.gold : LEAF_NAME_LEVEL_WIDTHS.green;
        if (angle !== 0) {
            widthTable = isVip ? LEAF_NAME_MIDRIB_WIDTHS.gold : LEAF_NAME_MIDRIB_WIDTHS.green;
        }
        return { left: 50, top: 50, angle, ...this.fitLeafName(name, size, fontSize, widthTable) };
    }

    // One font size for every leaf name, so names look the same whatever the leaf's size. It grows
    // with the admin's Leaf Display Scale. Bigger leaves fit more words at this size, smaller ones fewer.
    getLeafNameFontSize() {
        const scale = Number(this.leafDisplayScale);
        const fontSize = LEAF_NAME_BASE_FONT_PX * (Number.isFinite(scale) && scale > 0 ? scale : 1);
        return Math.max(7, Math.min(18, Math.round(fontSize * 2) / 2));
    }

    // Fits the name on the leaf at the given font size, wrapping only between words, never inside one.
    // It tries one line, then two, then three; each gets the widest box that stays on the blade at that
    // height (widthTable). Measured by the browser itself in a hidden copy of .leaf-name, so the line
    // breaks match the real ones exactly. A name that does not fit is shortened at a word boundary with
    // "..." (the full name stays in the leaf's title and detail card).
    fitLeafName(name, leafSize, fontSize, widthTable) {
        const fullText = String(name || '').trim().replace(/\s+/g, ' ') || 'Anonymous';
        const cacheKey = `${fullText}|${leafSize}|${fontSize}|${widthTable === LEAF_NAME_MIDRIB_WIDTHS.green ? 'mg' : ''}${widthTable === LEAF_NAME_MIDRIB_WIDTHS.gold ? 'mv' : ''}${widthTable === LEAF_NAME_LEVEL_WIDTHS.green ? 'lg' : ''}${widthTable === LEAF_NAME_LEVEL_WIDTHS.gold ? 'lv' : ''}`;
        if (!this.leafNameFitCache) this.leafNameFitCache = new Map();
        if (this.leafNameFitCache.has(cacheKey)) return this.leafNameFitCache.get(cacheKey);

        if (!this.leafNameMeasurer || !this.leafNameMeasurer.isConnected) {
            this.leafNameMeasurer = document.createElement('div');
            this.leafNameMeasurer.className = 'leaf-name leaf-name-measure';
            this.leafNameMeasurer.setAttribute('aria-hidden', 'true');
            document.body.appendChild(this.leafNameMeasurer);
        }
        const measurer = this.leafNameMeasurer;
        measurer.style.fontSize = `${fontSize}px`;
        const lineHeight = 1.05;

        // Widest box (% of the leaf) that stays on the blade at a given height (% of the leaf).
        const widthPercentAt = (heightPercent) => {
            if (heightPercent <= widthTable[0][0]) return widthTable[0][1];
            for (let i = 1; i < widthTable.length; i += 1) {
                const [h1, w1] = widthTable[i];
                if (heightPercent <= h1) {
                    const [h0, w0] = widthTable[i - 1];
                    return w0 + ((w1 - w0) * (heightPercent - h0)) / (h1 - h0);
                }
            }
            return 0;
        };

        const fit = (text) => {
            measurer.textContent = text;
            for (let lines = 1; lines <= 3; lines += 1) {
                const boxHeight = lines * fontSize * lineHeight;
                const widthPercent = widthPercentAt((100 * boxHeight) / leafSize);
                if (widthPercent <= 0) return null;
                const boxWidth = Math.floor((leafSize * widthPercent) / 100);
                measurer.style.width = `${boxWidth}px`;
                if (measurer.scrollHeight <= boxHeight + 0.5 && measurer.scrollWidth <= boxWidth + 0.5) {
                    return { text, fontSize, lines, width: boxWidth, height: Math.ceil(boxHeight) };
                }
            }
            return null;
        };

        let result = fit(fullText);

        // Too long: keep as many whole words as fit, then "...".
        const words = fullText.split(' ');
        for (let count = words.length - 1; count >= 1 && !result; count -= 1) {
            result = fit(`${words.slice(0, count).join(' ')}…`);
        }

        // Even the first word alone is too long: cut it.
        for (let chars = words[0].length - 1; chars >= 1 && !result; chars -= 1) {
            result = fit(`${words[0].slice(0, chars)}…`);
        }

        if (!result) {
            const height = Math.ceil(fontSize * lineHeight);
            result = { text: `${fullText.slice(0, 1)}…`, fontSize, lines: 1, width: Math.floor(leafSize * 0.3), height };
        }
        this.leafNameFitCache.set(cacheKey, result);
        return result;
    }

    applyLeafThresholdEffect(leafCycle) {
        if (!leafCycle.shouldFallAway) {
            this.leafFallStarted = false;
            this.leafFallCycleNumber = leafCycle.cycleNumber || 0;
            if (this.leafGreenTimer) {
                window.clearTimeout(this.leafGreenTimer);
                this.leafGreenTimer = null;
            }
            return;
        }

        const fallingLeafKeys = leafCycle.fallingLeafKeys || new Set();
        const leaves = Array.from(this.leavesContainer.querySelectorAll('.leaf'))
            .filter(leaf => fallingLeafKeys.has(leaf.dataset.leafKey));

        leaves.forEach(leaf => {
            leaf.classList.add('leaf-falling');
            this.playLeafFall(leaf);
            if (leaf.dataset.leafKey === this.selectedLeafKey) this.closeLeafDetail(); // its card goes with it
        });

        if (this.leafFallStarted && this.leafFallCycleNumber === leafCycle.cycleNumber) return;
        if (this.leafGreenTimer) {
            window.clearTimeout(this.leafGreenTimer);
            this.leafGreenTimer = null;
        }
        this.leafFallStarted = true;
        this.leafFallCycleNumber = leafCycle.cycleNumber;

        const maxFallDelay = leaves.reduce((maxDelay, leaf) => {
            const delay = Number(leaf.dataset.fallDelay || 0);
            return Number.isFinite(delay) ? Math.max(maxDelay, delay) : maxDelay;
        }, 0);
        const clearDelay = maxFallDelay + Math.max(500, Number(this.leafFallDuration) || 4200);
        this.leafGreenTimer = window.setTimeout(() => {
            if (!leafCycle.isDemoCycle) {
                this.setClearedLeafOverflow(leafCycle.threshold, leafCycle.overflowCount);
            }
            leaves.forEach(leaf => {
                leaf.classList.remove('leaf-falling');
                leaf.classList.add('leaf-fallen', 'leaf-cleared');
                this.leafFalls.delete(leaf.dataset.leafKey);
            });
            this.leafFallStarted = false;
            this.leafGreenTimer = null;
        }, clearDelay);
    }

    // The oldest leaf drops off the tree smoothly, like a real leaf flowing down: it lets go gently,
    // drifts out to its own side of the tree first and then mostly down in one smooth curve (never back,
    // no zigzag), gliding fastest in the middle and settling softly, while it turns slowly, rocks softly,
    // shrinks a little and fades away near the ground. Every movement starts and ends at rest, and the
    // whole fall is one animation pinned to its start time, so a refresh mid-fall carries on unchanged.
    // It takes the admin's Leaf Fall Duration (leafFallDuration).
    playLeafFall(leaf) {
        const leafKey = leaf.dataset.leafKey;
        if (!leafKey || typeof leaf.animate !== 'function' || leaf.dataset.fallPlaying === '1') return;
        leaf.dataset.fallPlaying = '1'; // this element already falls (a rebuilt one carries on from the same start)
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            && !document.body.classList.contains('tree-demo-motion-active');
        if (reduceMotion) return;

        let fall = this.leafFalls.get(leafKey);
        if (!fall) {
            fall = this.planLeafFall(leaf, leafKey);
            fall.startedAt = this.animationClock() + (Number(leaf.dataset.fallDelay) || 0);
            this.leafFalls.set(leafKey, fall);
        }
        const animation = leaf.animate(fall.keyframes, { duration: fall.duration, easing: 'linear', fill: 'forwards' });
        animation.startTime = fall.startedAt;
    }

    planLeafFall(leaf, leafKey) {
        const random = this.createSeededRandom(`${leafKey}|fall`);
        const duration = Math.max(1200, Number(this.leafFallDuration) || 4200);
        const containerWidth = this.leavesContainer?.clientWidth || window.innerWidth || 1920;
        const leafCentre = (parseFloat(leaf.style.left) || 0) + ((leaf.offsetWidth || 80) / 2);
        const side = leafCentre >= containerWidth / 2 ? 1 : -1; // drifts out, away from the trunk
        const distance = Math.round(Math.max(360, Math.min(window.innerHeight * (0.5 + (random() * 0.32)), 760)));
        const drift = side * (80 + (random() * 150));
        const turn = side * (20 + (random() * 30));   // degrees, a slow turn over the whole fall
        const rock = 5 + (random() * 5);              // degrees, a soft rock about once on the way down
        const tilt = (random() - 0.5) * 24;           // degrees, tipping back a little
        const endScale = 0.76 + (random() * 0.1);
        const phase = random() * Math.PI * 2;
        const opacityValue = Number(this.leafOpacity);
        const visibleOpacity = Number.isFinite(opacityValue) ? opacityValue : 0.9;
        const smoothstep = (edge0, edge1, value) => {
            const k = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
            return k * k * (3 - (2 * k));
        };

        const steps = Math.max(60, Math.round(duration / 50));
        const keyframes = [];
        for (let step = 0; step <= steps; step += 1) {
            const t = step / steps;
            const down = (1 - Math.cos(Math.PI * t)) / 2; // from rest, fastest in the middle, to rest
            const out = smoothstep(0, 0.8, t);            // out first, then mostly down
            const x = drift * out;
            const y = distance * down;
            const rotate = (turn * down) + (rock * Math.sin((Math.PI * 1.6 * t) + phase) * Math.sin(Math.PI * t));
            const rotateX = tilt * Math.sin(Math.PI * t);
            const scale = 1 + ((endScale - 1) * down);
            const opacity = visibleOpacity * (1 - smoothstep(0.68, 1, t));
            keyframes.push({
                offset: t,
                opacity: Number(opacity.toFixed(3)),
                transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0px) rotate(${rotate.toFixed(2)}deg) rotateX(${rotateX.toFixed(2)}deg) scale(${scale.toFixed(4)})`
            });
        }
        return { duration, keyframes };
    }

    findRandomPositionInOval(ovalArea, leafSize, seed) {
        const random = this.createSeededRandom(seed);

        const cx = ovalArea.x + ovalArea.width / 2;
        const cy = ovalArea.y + ovalArea.height / 2;

        const a = ovalArea.width / 2;
        const b = ovalArea.height / 2;
        const radius = leafSize * this.leafSpacingRadius;
        let best = null;

        for (let tries = 0; a > 0 && b > 0 && tries < 500; tries++) {
            const x = (random() * 2 - 1) * a;
            const y = (random() * 2 - 1) * b;
            if ((x * x) / (a * a) + (y * y) / (b * b) > 1) continue;
            if (this.leafTouchesTitle(cx + x - leafSize / 2, cy + y - leafSize / 2, leafSize)) continue; // never under the title box

            const overlap = this.leafOverlapAt(cx + x, cy + y, radius);
            if (!best || overlap < best.overlap) {
                best = { x: cx + x - leafSize / 2, y: cy + y - leafSize / 2, overlap };
            }
            if (overlap === 0) break;
        }

        return best
            ? { x: best.x, y: best.y }
            : { x: cx - leafSize / 2, y: cy - leafSize / 2 };
    }

    // ==================== FIX: KEEP MASK ALWAYS HIDDEN ====================

    updateLeavesTransparency() {
        if (this.treeImageLeaves) {
            /*this.treeImageLeaves.style.display = 'block';
            this.treeImageLeaves.style.opacity = '0';*/
            this.treeImageLeaves.style.pointerEvents = 'none';
        }

        this.updateStageLeavesVisibility();
    }

    updateStageLeavesVisibility() {
        if (!this.treeImageLeaves) {
            return;
        }

        this.treeImageLeaves.classList.toggle('stage-leaves-upward', this.stageLeavesShouldShiftUp());

        if (!this.stageHasLeaves()) {
            this.treeImageLeaves.style.display = 'none';
            return;
        }

        this.treeImageLeaves.style.display = 'block';
    }

    refreshTree() {
        this.updateLeavesTransparency();

        // rebuild mask (helps after resize)
        this.maskData = this.buildMaskCanvas();

        this.createLeaves();
        this.syncLeafGlowStates();
    }

    // ==================== CONFIG ====================

    setOvalPosition(topOffset) {
        this.ovalTopOffset = topOffset;
        this.refreshTree();
    }

    addVisitor(name, visitCount = 1) {
        this.visitors.push({
            name,
            visit_count: visitCount,
            created_at: new Date().toISOString()
        });

        this.refreshTree();
    }
}

// ==================== GLOBAL ====================

let treeManager;

// ==================== EVENT LISTENERS ====================

window.addEventListener('load', () => {
    treeManager = new TreeManager();
});

let treeRefreshTimer;

function triggerTreeVipRefresh() {
    if (!treeManager) return;

    Promise.all([
        treeManager.fetchVipNames(),
        treeManager.fetchYearReviewData(),
        treeManager.fetchVisitorData(treeManager.isReviewMode ? treeManager.selectedYear : treeManager.currentYear)
    ]).then(() => {
        treeManager.updateTreeHeading();
        treeManager.renderYearReviewBook();
        treeManager.refreshTree();
    }).catch((error) => {
        console.warn('VIP refresh failed:', error);
    });
}

function refreshTreeFromServer() {
    if (treeManager) {
        const yearToRefresh = treeManager.isReviewMode ? treeManager.selectedYear : treeManager.currentYear;

        Promise.all([
            treeManager.fetchParameterConfig(),
            treeManager.fetchVipNames(),
            treeManager.fetchYearReviewData(),
            treeManager.fetchVisitorData(yearToRefresh)
        ]).then(() => {
            treeManager.updateTreeHeading();
            treeManager.renderYearReviewBook();
            treeManager.refreshTree();
        }).catch((error) => {
            console.warn('Tree refresh failed:', error);
        }).finally(() => {
            scheduleTreeRefresh();
        });
    } else {
        scheduleTreeRefresh();
    }
}

function scheduleTreeRefresh() {
    window.clearTimeout(treeRefreshTimer);
    const configuredInterval = Math.max(5000, Number(treeManager?.leafRefreshInterval) || 30000);
    // The live tree checks every 5 seconds, from the first check after the page opens (before the tree
    // has started, the first check used to wait the full 30 seconds, so a new leaf could take that long).
    const interval = !treeManager || !treeManager.isReviewMode
        ? Math.min(configuredInterval, treeManager?.liveTreeRefreshInterval || 5000)
        : configuredInterval;
    treeRefreshTimer = window.setTimeout(refreshTreeFromServer, interval);
}

scheduleTreeRefresh();

window.addEventListener('tree-vip-refresh', triggerTreeVipRefresh);
window.addEventListener('storage', (event) => {
    if (event.key === 'tree-vip-refresh') {
        triggerTreeVipRefresh();
    }
});

window.addEventListener('resize', () => {
    if (treeManager) {
        setTimeout(() => {
            treeManager.refreshTree();
        }, 150);
    }
});
