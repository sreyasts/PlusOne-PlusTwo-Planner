/**
 * Mission PlusTwo v6.0 - Main Application Entrypoint
 * Unifies planning engine, canonical syllabus data, cookieless analytics,
 * native WebAudio synthesizer, and accessible dialogs into a cohesive ESM module.
 */

import './style.css';
import './app.js';

export {
  resetApp,
  restorePreResetSnapshot,
  getActiveTodayStr,
  compactPlanToToday,
  getActiveStreak,
} from './app.js';

// Planning Engine & Migration
export {
  PLANNER_ENGINE_VERSION,
  buildIntelligentPlan,
  validatePlan,
  getStreamSubjects,
  calculateDaysBetween,
} from './engine/planner.js';

export {
  migrateOldState,
  migrateLegacyUserPlan,
} from './engine/migration.js';

// Canonical Syllabus Data
export {
  PLUS_TWO_SYLLABUS,
  PLUS_TWO_CHAPTERS,
} from './data/syllabus-plus-two.js';

export {
  PLUS_ONE_SYLLABUS,
  PLUS_ONE_CHAPTERS,
} from './data/syllabus-plus-one.js';

export {
  CHAPTER_RESOURCES,
} from './data/chapter-resources.js';

// Audio & Accessible UI
export {
  playTaskCompleteSound,
  playMilestoneCelebrationSound,
  playUntickSound,
} from './audio/chime.js';

export {
  showAppToast,
  showAppAlert,
  showAppConfirm,
} from './ui/dialogs.js';

export {
  ICONS,
  getSvgIcon,
} from './ui/icons.js';

// Cookieless & DPDP-Compliant Analytics
export {
  initAnalytics,
  trackEvent,
  trackTaskChecked,
  getFunnelStats,
  ensureFirebaseAnalytics,
  FUNNEL_STAGES,
} from './analytics/tracker.js';

// Internationalization & Auto-Detection
export { ML_STRINGS } from './i18n/ml.js';
export {
  detectMalayalamEnvironment,
  getCurrentLanguage,
  setLanguagePreference,
  STORAGE_KEY_LANG,
} from './i18n/detector.js';
