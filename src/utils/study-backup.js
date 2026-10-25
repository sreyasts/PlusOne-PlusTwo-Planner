/** Validate portable study plans before they can replace saved progress. */
import { isCalendarDate } from './improvement.js';
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
const STATE_KEYS = ['plusTwoMissionState_v2', 'plusTwoPlanState'];
const ACCOUNT_FIELDS = ['uid', 'userId', 'userEmail', 'email', 'displayName', 'photoURL'];
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function requireValid(condition) {
  if (!condition) throw new TypeError('Invalid study plan backup.');
}

function checkValues(value, depth = 0) {
  requireValid(depth <= 20);
  if (typeof value === 'string') {
    // Legacy plan views interpolate task text into markup. Backups are data only.
    requireValid(value.length <= 50000 && !/<\s*[a-z/!?]/i.test(value));
  } else if (typeof value === 'number') {
    requireValid(Number.isFinite(value));
  } else if (Array.isArray(value)) {
    requireValid(value.length <= 10000);
    value.forEach(item => checkValues(item, depth + 1));
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      requireValid(!['__proto__', 'constructor', 'prototype'].includes(key));
      checkValues(item, depth + 1);
    }
  }
}

export function validateStudyBackup(state) {
  requireValid(isRecord(state));
  checkValues(state);
  requireValid(Array.isArray(state.plan) && state.plan.length > 0 && state.plan.length <= 1500);
  if (state.stream !== undefined) requireValid(['cs', 'bio', 'commerce', 'humanities', 'imp_only'].includes(state.stream));
  if (state.grade !== undefined) requireValid(['+1', '+2', 'dual'].includes(state.grade));
  for (const key of ['startDate', 'deadlineDate']) {
    if (state[key] !== undefined) requireValid(isCalendarDate(state[key]));
  }
  if (state.engineVersion !== undefined) requireValid(Number.isInteger(state.engineVersion) && state.engineVersion > 0);
  if (state.personalization !== undefined) requireValid(isRecord(state.personalization));
  if (state.improvementConfig !== undefined) {
    const subjects = new Set();
    requireValid(Array.isArray(state.improvementConfig) && state.improvementConfig.every(item => {
      if (!isRecord(item) || typeof item.subject !== 'string' || !isCalendarDate(item.examDate) || subjects.has(item.subject)) return false;
      subjects.add(item.subject);
      return true;
    }));
  }
  if (state.completedChaptersOnInit !== undefined) {
    requireValid(Array.isArray(state.completedChaptersOnInit) && state.completedChaptersOnInit.every(item => typeof item === 'string'));
  }
  if (state.targetTerm !== undefined) requireValid([1, 2, 3].includes(state.targetTerm));

  const dates = new Set();
  const dayNumbers = new Set();
  const taskIds = new Set();
  let taskCount = 0;
  const plan = state.plan.map((day, index) => {
    requireValid(isRecord(day) && isCalendarDate(day.date) && !dates.has(day.date) && Array.isArray(day.tasks));
    dates.add(day.date);
    const dayNumber = day.dayNumber ?? index + 1;
    requireValid(Number.isInteger(dayNumber) && dayNumber > 0 && !dayNumbers.has(dayNumber));
    dayNumbers.add(dayNumber);
    const tasks = day.tasks.map(task => {
      requireValid(isRecord(task) && typeof task.id === 'string' && /^[\w:+./-]{1,180}$/.test(task.id) && !taskIds.has(task.id));
      taskIds.add(task.id);
      for (const key of ['subject', 'chapterName']) {
        requireValid(typeof task[key] === 'string' && task[key].trim().length > 0 && task[key].length <= 512);
      }
      if (task.topicTitle !== undefined) requireValid(typeof task.topicTitle === 'string');
      if (task.completed !== undefined) requireValid(typeof task.completed === 'boolean');
      if (task.estimatedMinutes !== undefined) requireValid(Number.isFinite(task.estimatedMinutes) && task.estimatedMinutes > 0 && task.estimatedMinutes <= 1440);
      requireValid(++taskCount <= 10000);
      return { ...task, completed: task.completed ?? false };
    });
    return { ...day, dayNumber, tasks };
  });
  requireValid(taskCount > 0);
  const portable = { ...state, plan };
  ACCOUNT_FIELDS.forEach(key => delete portable[key]);
  return portable;
}

export function parseStudyBackup(text) {
  requireValid(typeof text === 'string' && text.length <= MAX_BACKUP_BYTES);
  return validateStudyBackup(JSON.parse(text));
}

export function createStudyBackup(state, appVersion) {
  return { ...validateStudyBackup(state), exportedAt: new Date().toISOString(), appVersion };
}

/** Roll both local storage keys back if either write fails, leaving memory untouched. */
export function persistStudyBackup(state, storage) {
  const previous = STATE_KEYS.map(key => storage.getItem(key));
  const serialized = JSON.stringify(state);
  try {
    STATE_KEYS.forEach(key => storage.setItem(key, serialized));
  } catch (error) {
    STATE_KEYS.forEach((key, index) => {
      try {
        if (previous[index] === null) storage.removeItem(key);
        else storage.setItem(key, previous[index]);
      } catch { /* Storage may remain unavailable; retain the original failure. */ }
    });
    throw error;
  }
}
