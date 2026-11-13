// Owner: Role 1, Zihan and Role 3, Jun Kai. Previous team: XY (Xuanyang) (10), Caeden (6), Yu Kang (4), Nick (3).
// ============================================================
// PARAMETERCONFIGSTORE.JS - System Parameters Management
// ============================================================
// Helper module for reading and writing system parameters config
// Provides consistent interface for parameter configuration
//
// CAEDEN CHANGE SUMMARY (DONE BY CAEDEN)
// ============================================================
// - Added shared JSON-backed storage for editable feedback messages, thank-you email text,
//   feature flags, validation rules, digital tree parameters, photo settings, overlay settings and visual assets. (DONE BY CAEDEN)
// - Added default merging so older config files receive newly introduced parameter categories. (DONE BY CAEDEN)
//
// FIND COMMAND
//   rg -n "DONE BY CAEDEN|CAEDEN CHANGE SUMMARY" frontend backend
// ============================================================
//
// XY CHANGE SUMMARY (DONE BY XY)
// ============================================================
//
// 1. TREE LEAF FALL PARAMETER DEFAULTS
//    leafFallThreshold               - Maximum visible leaves before the oldest leaf falls from the tree (DONE BY XY)
//    leafFallDuration                - Default smooth falling animation duration for tree leaves (DONE BY XY)
//
// 2. CONSENT AND PLEDGE CONTENT DEFAULTS
//    contentSettings                 - Stores admin-editable retention duration and pledge examples (DONE BY XY)
//    temporaryRetentionDays          - Default temporary retention duration used by consent text and cleanup (DONE BY XY)
//    pledgeExamples                  - Default visitor-facing pledge example lines (DONE BY XY)
//
// 3. THANK-YOU EMAIL VISIT SUMMARY DEFAULTS
//    visitSummaryTitle               - Default title for the keepsake email visit summary card (DONE BY XY)
//    visitSummary labels             - Default editable row labels for date, topic, badge, retention and tree message (DONE BY XY)
//    visitSummaryTreeMessage         - Default digital tree message shown in thank-you email summary (DONE BY XY)
//
// FIND COMMAND
//   rg -n "XY CHANGE SUMMARY|DONE BY XY" frontend backend
// ============================================================
//
// YU KANG CHANGE SUMMARY (DONE BY YU KANG)
// ============================================================
// - Added admin-configurable leaf upload and leaf display scale.
//   Uploaded leaf is saved to ./assets/Tree and applied to the /tree page when active.
//   (Done by Yu Kang)
// - Added leaf image revert functionality: stores previous leaf image and allows reverting
//   to the prior image with one click. (Done by Yu Kang)
//
// FIND COMMAND
//   rg -n "YU KANG CHANGE SUMMARY|DONE BY YU KANG" frontend backend
// ============================================================
//

const fs = require('fs');
const path = require('path');
const paths = require('../../core/paths');
const { DEFAULT_TREE3D_PARAMETERS, mergeTree3dParameters } = require('./tree3d');

const CONFIG_FILE = paths.dataFile('parametersConfig.json');

// Default parameters if file doesn't exist
const DEFAULT_CONFIG = {
  feedbackMessages: {
    thankYouTitle: "Thank You! ☀️",
    thankYouMessage: "Your feedback has been recorded and a new leaf has been added to our digital tree!",
    thankYouSubtitle: "Your feedback makes a difference",
    thankYouFooter: "Thank you for contributing to our sustainability journey at Republic Polytechnic!",
    consentPrompt: "Your feedback helps us create a more sustainable future. Your responses will be kept confidential.",
    detailsPrompt: "Please provide your details so we can track your contributions.",
    feedbackPrompt: "Share your thoughts on our sustainability initiatives.",
    pledgePrompt: "Would you like to make a pledge to support sustainability?"
  },
  contentSettings: {
    temporaryRetentionDays: 7,
    pledgeExamples: [
      "Carry a reusable bottle and cutlery every day",
      "Sort waste properly and recycle whenever possible",
      "Reduce food waste by taking only what I can finish"
    ]
  },
  campaignSettings: {
    enabled: false,
    title: "Food Waste Week",
    cadence: "weekly",
    treeSubtitle: "This week's focus: reduce food waste through mindful choices.",
    pulseGoal: 100,
    badgeEmphasis: "sustainable-living",
    focusKeywords: ["food waste", "leftovers", "canteen", "meal"],
    pledgeExamples: [
      "Take only what I can finish during meals",
      "Share food waste tips with one friend this week",
      "Choose reusable containers for takeaway food"
    ]
  },
  emailContent: {
    thankYouSubject: "Thank you for visiting RP ESG Centre, {name}!",
    thankYouIntro: "Thank you for taking the time to visit our ESG Experience Centre and sharing your feedback. Attached below is your commemorative photo from your visit.",
    thankYouClosing: "We hope your experience has inspired you to take meaningful steps towards sustainability. Your feedback helps us improve and create better experiences for future visitors.",
    senderName: "ESG Centre Team",
    footerNote: "This is an automated email sent from the RP ESG kiosk system. Please do not reply to this message.",
    visitSummaryTitle: "Your Visit Summary",
    visitSummaryDateLabel: "Visit date",
    visitSummaryTopicLabel: "Pledge topic",
    visitSummaryBadgeLabel: "Badge earned",
    visitSummaryRetentionLabel: "Data retention",
    visitSummaryTreeLabel: "Digital tree",
    visitSummaryTreeMessage: "Your virtual leaf has been added to the RP ESG digital tree."
  },
  // Feature toggles configurable from the admin panel (DONE BY CAEDEN)
  featureFlags: {
    cameraCaptureEnabled: true,
    photoUploadEnabled: true,
    beautyFilterEnabled: true,
    pledgeEnabled: true,
    badgeEmailEnabled: true,
    thankYouEmailEnabled: true,
    socialSharingEnabled: true,
    floatingLanguageSelectorEnabled: false
  },
  // Centralized validation rules configurable from the admin panel (DONE BY CAEDEN)
  validationRules: {
    nameRequired: true,
    nameMinLength: 2,
    nameMaxLength: 80,
    emailRequired: true,
    emailPattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
    requiredQuestionsEnabled: true,
    pledgeRequired: true,
    pledgeMinLength: 5,
    pledgeMaxLength: 500,
    pledgeTopicRequired: true,
    photoRequired: true,
    dailySubmissionLimitPerEmail: 1,
    maxPhotoFileSizeMb: 5,
    allowedPhotoFormats: ["jpeg", "jpg", "png", "webp"]
  },
  treeParameters: {
    treeStage: 0,
    treeDisplayMode: "2d",
    ovalWidth: 850,
    ovalHeight: 300,
    ovalTopOffset: -100,
    leafRefreshInterval: 30000,
    leafOpacity: 0.9,
    leafAnimationDuration: 500,
    leafFallThreshold: 15,
    leafFallDuration: 4200,
    leafDisplayScale: 1,
    vipLeafDisplayScale: 1,
    showTitleBox: true
  },
  // 3D ESG Tree page settings (Admin > Digital Tree Adjustment > 3D Tree Settings); see ./tree3d.js
  tree3dParameters: DEFAULT_TREE3D_PARAMETERS,
  feedbackPageStyle: {
    backgroundCss: "",
    cardOpacity: 0.9,
    accentColor: "#4a7c59"
  },
  badgeLeafStyles: {
    leafScale: 1,
    colors: {
      "feedback-completer": "#4a7c59",
      "climate-champion": "#0f766e",
      "renewable-innovator": "#f59e0b",
      "sustainable-living-advocate": "#16a34a",
      "ocean-guardian": "#0284c7",
      "governance-guardian": "#7c3aed",
      "social-champion": "#d97706"
    }
  },
  photoSettings: {
    beautyFilterEnabled: true,
    beautyFilterStrength: "medium",
    boomerangFrameDelayMs: 90, // changes made by nick
    boomerangQuality: "medium", // Boomerang GIF quality preset (DONE BY NICK)
    maxPhotoFileSize: 5242880,
    supportedFormats: ["jpeg", "png", "webp"]
  },
  overlaySettings: {
    enableOverlayUpload: true,
    maxOverlayFileSize: 10485760,
    gifOverlaySpeed: 1, // GIF overlay playback speed multiplier - changes made by nick
    supportedFormats: ["png", "jpg", "jpeg"]
  },
  archiveSettings: {
    autoArchiveEnabled: false,
    archiveAfterDays: 90,
    keepRecentFeedbackCount: 0
  },
  visualAssets: {
    feedbackBackground: "",
    treeBackground: "/assets/Tree/BackGround.png",
    leafImage: "",
    previousLeafImage: "",
    vipLeafImage: "",
    previousVipLeafImage: "",
    defaultOverlayTheme: ""
  },
  layoutSettings: {
    landingTextScale: 1,
    landingPanelWidth: 600,
    landingPanelMinHeight: 0,
    landingPanelPadding: 60,
    landingPanelOffsetX: 0,
    landingPanelOffsetY: 0,
    startButtonOffsetX: 0,
    startButtonOffsetY: 0,
    startButtonWidth: 280,
    startButtonHeight: 64,
    pledgeboardButtonOffsetX: 0,
    pledgeboardButtonOffsetY: 0,
    pledgeboardButtonWidth: 600,
    pledgeboardButtonHeight: 64
  }
};

function mergeWithDefaults(config) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    feedbackMessages: { ...DEFAULT_CONFIG.feedbackMessages, ...(config.feedbackMessages || {}) },
    contentSettings: { ...DEFAULT_CONFIG.contentSettings, ...(config.contentSettings || {}) },
    campaignSettings: { ...DEFAULT_CONFIG.campaignSettings, ...(config.campaignSettings || {}) },
    emailContent: { ...DEFAULT_CONFIG.emailContent, ...(config.emailContent || {}) },
    featureFlags: { ...DEFAULT_CONFIG.featureFlags, ...(config.featureFlags || {}) },
    validationRules: { ...DEFAULT_CONFIG.validationRules, ...(config.validationRules || {}) },
    treeParameters: { ...DEFAULT_CONFIG.treeParameters, ...(config.treeParameters || {}) },
    tree3dParameters: mergeTree3dParameters(config.tree3dParameters, {}),
    feedbackPageStyle: { ...DEFAULT_CONFIG.feedbackPageStyle, ...(config.feedbackPageStyle || {}) },
    badgeLeafStyles: {
      ...DEFAULT_CONFIG.badgeLeafStyles,
      ...(config.badgeLeafStyles || {}),
      colors: {
        ...DEFAULT_CONFIG.badgeLeafStyles.colors,
        ...((config.badgeLeafStyles || {}).colors || {})
      }
    },
    photoSettings: { ...DEFAULT_CONFIG.photoSettings, ...(config.photoSettings || {}) },
    overlaySettings: { ...DEFAULT_CONFIG.overlaySettings, ...(config.overlaySettings || {}) },
    visualAssets: { ...DEFAULT_CONFIG.visualAssets, ...(config.visualAssets || {}) },
    layoutSettings: { ...DEFAULT_CONFIG.layoutSettings, ...(config.layoutSettings || {}) }
  };
}

/**
 * Read parameters configuration from JSON file
 * @returns {Object} Parameters configuration object
 */
function readParametersConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const fileContent = fs.readFileSync(CONFIG_FILE, 'utf8');
      return mergeWithDefaults(JSON.parse(fileContent));
    }
  } catch (error) {
    console.error('❌ Error reading parameters config:', error.message);
  }
  return mergeWithDefaults({});
}

/**
 * Write parameters configuration to JSON file
 * @param {Object} config - Parameters configuration object
 * @returns {boolean} Success status
 */
function writeParametersConfig(config) {
  try {
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(mergeWithDefaults(config), null, 2), 'utf8');
    console.log('✅ Parameters config saved successfully');
    return true;
  } catch (error) {
    console.error('❌ Error writing parameters config:', error.message);
    return false;
  }
}

/**
 * Update specific parameter value
 * @param {string} category - Parameter category (feedbackMessages, treeParameters, etc.)
 * @param {string} key - Parameter key
 * @param {any} value - New parameter value
 * @returns {boolean} Success status
 */
function updateParameter(category, key, value) {
  try {
    const config = readParametersConfig();
    
    if (!config[category]) {
      config[category] = {};
    }
    
    config[category][key] = value;
    return writeParametersConfig(config);
  } catch (error) {
    console.error('❌ Error updating parameter:', error.message);
    return false;
  }
}

/**
 * Get specific parameter value
 * @param {string} category - Parameter category
 * @param {string} key - Parameter key
 * @returns {any} Parameter value or null
 */
function getParameter(category, key) {
  try {
    const config = readParametersConfig();
    return config[category]?.[key] ?? null;
  } catch (error) {
    console.error('❌ Error getting parameter:', error.message);
    return null;
  }
}

/**
 * Get all parameters for a category
 * @param {string} category - Parameter category
 * @returns {Object} Category parameters object
 */
function getCategory(category) {
  try {
    const config = readParametersConfig();
    return config[category] || {};
  } catch (error) {
    console.error('❌ Error getting category:', error.message);
    return {};
  }
}

/**
 * Update entire category
 * @param {string} category - Parameter category
 * @param {Object} updates - Updated category parameters
 * @returns {boolean} Success status
 */
function updateCategory(category, updates) {
  try {
    const config = readParametersConfig();
    config[category] = { ...config[category], ...updates };
    return writeParametersConfig(config);
  } catch (error) {
    console.error('❌ Error updating category:', error.message);
    return false;
  }
}

/**
 * Reset parameters to defaults
 * @returns {boolean} Success status
 */
function resetToDefaults() {
  try {
    return writeParametersConfig(DEFAULT_CONFIG);
  } catch (error) {
    console.error('❌ Error resetting to defaults:', error.message);
    return false;
  }
}

module.exports = {
  readParametersConfig,
  writeParametersConfig,
  updateParameter,
  getParameter,
  getCategory,
  updateCategory,
  resetToDefaults
};
