// Owner: Role 3, Jun Kai. Previous team: XY (Xuanyang) (11).
// ============================================================
// XY CHANGE SUMMARY (DONE BY XY)
// ============================================================
//
// 1. DEPENDENCIES & CONFIGURATION
//    const fs                         - File system operations for JSON config storage (DONE BY XY)
//    const path                       - Path utilities for config file location (DONE BY XY)
//    const CONFIG_PATH                - Path to backend/data/badgeEmailTemplates.json (DONE BY XY)
//
// 2. DEFAULT BADGE EMAIL TEMPLATES
//    const DEFAULT_TEMPLATES          - Default templates for Feedback Contributor plus 6 topic badges (DONE BY XY)
//    const ACTIVE_TEMPLATE_KEYS       - Allowed template keys for active badge flow (DONE BY XY)
//
// 3. TEMPLATE STORE FUNCTIONS
//    function ensureConfigFile()      - Create config directory/file when missing (DONE BY XY)
//    function normalizeTemplate()     - Sanitize subject, message and highlights input (DONE BY XY)
//    function getBadgeEmailTemplates() - Load templates and filter inactive badge keys (DONE BY XY)
//    function saveBadgeEmailTemplates() - Save active badge templates only (DONE BY XY)
//
// FIND COMMAND
//    rg -n "XY CHANGE SUMMARY|DONE BY XY" frontend backend
// ============================================================

const fs = require('fs');
const path = require('path');
const paths = require('../../core/paths');

const CONFIG_PATH = paths.dataFile('badgeEmailTemplates.json');

const DEFAULT_TEMPLATES = {
  'feedback-completer': {
    subject: 'Congratulations on Earning Your Feedback Contributor Badge!',
    message: 'Thank you for sharing your feedback with the RP Xperience Centre. Your comments help us improve the visitor experience.',
    highlights: [
      'Your feedback supports better ESG learning experiences for future visitors.',
      'Look out for the growing digital tree, where every contribution adds momentum.'
    ]
  },
  'climate-champion': {
    subject: 'Congratulations on Earning Your Climate Champion Badge!',
    message: 'Your pledge shows commitment to climate action and a lower-carbon future.',
    highlights: [
      'Climate action starts with daily choices that reduce carbon impact.',
      'Your digital tree leaf represents your support for a more resilient planet.'
    ]
  },
  'renewable-innovator': {
    subject: 'Congratulations on Earning Your Renewable Innovator Badge!',
    message: 'Your pledge supports cleaner energy choices and innovation for a more sustainable future.',
    highlights: [
      'Renewable energy helps reduce reliance on carbon-heavy power sources.',
      'Small energy-saving habits can build long-term impact across campus and home.'
    ]
  },
  'sustainable-living-advocate': {
    subject: 'Congratulations on Earning Your Sustainable Living Advocate Badge!',
    message: 'Your pledge reflects practical everyday action for greener living.',
    highlights: [
      'Sustainable living can begin with waste reduction, reuse, and mindful consumption.',
      'Your green leaf on the digital tree marks your commitment to everyday ESG habits.'
    ]
  },
  'ocean-guardian': {
    subject: 'Congratulations on Earning Your Ocean Guardian Badge!',
    message: 'Your pledge supports cleaner waterways, healthier oceans, and marine conservation.',
    highlights: [
      'Reducing waste and plastic pollution protects marine ecosystems.',
      'Every ocean-friendly action contributes to cleaner shared environments.'
    ]
  },
  'governance-guardian': {
    subject: 'Congratulations on Earning Your Governance Guardian Badge!',
    message: 'Your pledge highlights the importance of ethics, transparency, and responsible decision-making.',
    highlights: [
      'Strong governance builds trust through accountability and integrity.',
      'Responsible choices help communities and organisations create lasting impact.'
    ]
  },
  'social-champion': {
    subject: 'Congratulations on Earning Your Social Champion Badge!',
    message: 'Your pledge supports community care, inclusion, and positive social impact.',
    highlights: [
      'Social responsibility grows through respect, inclusion, and support for others.',
      'Your badge recognises action that helps build stronger communities.'
    ]
  }
};

const ACTIVE_TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES);
const OLD_CENTRE_NAME_MESSAGE = 'Thank you for sharing your feedback with the RP ESG Centre. Your comments help us improve the visitor experience.'; // <Jun Kai/>

function ensureConfigFile() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_TEMPLATES, null, 2), 'utf8');
  }
}

function normalizeTemplate(template = {}) {
  const highlights = Array.isArray(template.highlights)
    ? template.highlights
    : String(template.highlights || '').split('\n');

  return {
    subject: String(template.subject || '').trim().slice(0, 180),
    message: String(template.message || '').trim().slice(0, 1200),
    highlights: highlights
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 6)
  };
}

function getBadgeEmailTemplates() {
  ensureConfigFile();
  try {
    const stored = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const normalizedStored = {};
    ACTIVE_TEMPLATE_KEYS.forEach((key) => {
      if (stored && stored[key]) normalizedStored[key] = normalizeTemplate(stored[key]);
    });
    // <Jun Kai start> the centre was renamed (18 Nov 2026): a saved message that is still exactly the old default is
    // shown as the new default, a message an admin wrote is never changed
    const feedbackBadge = normalizedStored['feedback-completer'];
    if (feedbackBadge && feedbackBadge.message === OLD_CENTRE_NAME_MESSAGE) feedbackBadge.message = DEFAULT_TEMPLATES['feedback-completer'].message;
    // <Jun Kai end>

    return {
      ...DEFAULT_TEMPLATES,
      ...normalizedStored
    };
  } catch (error) {
    console.error('Failed to read badge email templates:', error);
    return DEFAULT_TEMPLATES;
  }
}

function saveBadgeEmailTemplates(templates) {
  ensureConfigFile();
  const normalized = {};
  Object.entries(templates || {}).forEach(([key, value]) => {
    if (ACTIVE_TEMPLATE_KEYS.includes(key)) {
      normalized[key] = normalizeTemplate(value);
    }
  });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...DEFAULT_TEMPLATES, ...normalized }, null, 2), 'utf8');
  return getBadgeEmailTemplates();
}

module.exports = {
  DEFAULT_TEMPLATES,
  getBadgeEmailTemplates,
  saveBadgeEmailTemplates
};
