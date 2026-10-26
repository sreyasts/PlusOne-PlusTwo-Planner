/**
 * HSS Planner Core Engine Entry Point
 * Framework-agnostic civic study scheduler and curriculum processor.
 */

export {
  CORE_ENGINE_VERSION,
  EFFORT_WEIGHTS,
  TODAY_STR,
  formatLocalDateStr,
  getLocalDateStr,
  calculateDaysBetween,
  getSmartStartDate,
  getStreamSubjects,
  getCanonicalTasks,
  allocateActiveRecall,
  validateSchedule,
  validatePlan,
  generateSchedule,
  buildIntelligentPlan,
} from './scheduler.js';
