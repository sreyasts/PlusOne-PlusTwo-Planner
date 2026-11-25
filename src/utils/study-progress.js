import { persistStudyBackup } from './study-backup.js';

/**
 * Extract canonical chapter key dynamically from any task.
 * Returns null for non-learning tasks (revision, exam-eve, spaced retrieval,
 * forgetting curve, model exam) or if no chapter information can be identified.
 *
 * @param {object} task
 * @returns {string|null}
 */
export function getTaskChapterKey(task) {
  if (!task || typeof task !== 'object') return null;

  // Isolate non-learning tasks from syllabus chapter cascades
  if (
    task.isRevision ||
    task.isExamEveTask ||
    task.isSpacedRetrieval ||
    task.isForgettingCurveReview ||
    task.isModelExam
  ) {
    return null;
  }

  // 1. Explicit chapId (canonical across all syllabus tasks)
  if (typeof task.chapId === 'string' && task.chapId.trim().length > 0) {
    return task.chapId.trim();
  }

  // 2. Fallback: Prefix before _P\d+$ from task.id (e.g. "+2_Physics_1_P2" -> "+2_Physics_1")
  if (typeof task.id === 'string') {
    const idMatch = task.id.match(/^(.+)_P\d+$/i);
    if (idMatch && idMatch[1]) {
      return idMatch[1];
    }
  }

  // 3. Fallback: Composite key ${task.grade}_${task.subject}_${task.chapNumber || task.chapterName}
  if (task.grade && task.subject && (task.chapNumber !== undefined || task.chapterName)) {
    const chapterIdentifier = task.chapNumber !== undefined ? task.chapNumber : task.chapterName;
    return `${task.grade}_${task.subject}_${chapterIdentifier}`;
  }

  return null;
}

/**
 * Extract 1-indexed part number dynamically from any task.
 * Defaults to 1 if not a multi-part task or if part number cannot be determined.
 *
 * @param {object} task
 * @returns {number}
 */
export function getTaskPartNumber(task) {
  if (!task || typeof task !== 'object') return 1;

  // 1. Numeric part property
  if (typeof task.part === 'number' && Number.isFinite(task.part)) {
    return task.part;
  }
  if (typeof task.part === 'string') {
    const parsed = parseInt(task.part, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }

  // 2. Fallback: Regex _P(\d+)$ on task.id
  if (typeof task.id === 'string') {
    const idMatch = task.id.match(/_P(\d+)$/i);
    if (idMatch && idMatch[1]) {
      const parsed = parseInt(idMatch[1], 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  // 3. Fallback: Regex (?:Part|ഭാഗം)\s*(\d+) on topicTitle or chapterName or title
  const textFields = [task.topicTitle, task.chapterName, task.title];
  for (const field of textFields) {
    if (typeof field === 'string') {
      const match = field.match(/(?:Part|ഭാഗം)\s*(\d+)/i);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
  }

  return 1;
}

/**
 * Save the next completion state for one or more tasks with universal multi-part
 * chapter cascading completion logic in a single atomic storage write.
 *
 * @param {object} state - App state containing plan array
 * @param {string|Array<string>} taskIds - Target task ID or array of task IDs toggled together
 * @param {Storage} storage - Storage backend (e.g. localStorage)
 * @param {object} options - { today, yesterday, modifiedAt }
 * @returns {object|null} - Updated state or null if no target tasks found
 */
export function persistTaskGroupCompletion(state, taskIds, storage, { today, yesterday, modifiedAt } = {}) {
  if (!state || !Array.isArray(state.plan)) return null;

  const idList = Array.isArray(taskIds) ? taskIds : [taskIds];
  const requestedIds = new Set(idList.filter(id => typeof id === 'string' && id.length > 0));
  if (requestedIds.size === 0) return null;

  const targetTasks = [];
  for (const day of state.plan) {
    if (!Array.isArray(day?.tasks)) continue;
    for (const item of day.tasks) {
      if (item && requestedIds.has(item.id)) {
        targetTasks.push(item);
      }
    }
  }
  if (targetTasks.length === 0) return null;

  // Complete the group if any task in it is incomplete; otherwise undo all tasks in the group
  const targetCompleted = targetTasks.some(task => !task.completed);
  const foundIdSet = new Set(targetTasks.map(task => task.id));

  const chapterBounds = new Map();
  for (const task of targetTasks) {
    const chapterKey = getTaskChapterKey(task);
    if (chapterKey === null) continue;
    const partNum = getTaskPartNumber(task);
    const prevBound = chapterBounds.get(chapterKey);
    if (prevBound === undefined) {
      chapterBounds.set(chapterKey, partNum);
    } else {
      chapterBounds.set(
        chapterKey,
        targetCompleted ? Math.max(prevBound, partNum) : Math.min(prevBound, partNum)
      );
    }
  }

  let newlyCompletedCount = 0;
  let newlyUncompletedCount = 0;

  const nextPlan = state.plan.map(day => {
    if (!day || !Array.isArray(day.tasks)) return day;
    let dayChanged = false;
    const nextTasks = day.tasks.map(task => {
      if (!task) return task;
      let desiredCompleted = Boolean(task.completed);

      if (foundIdSet.has(task.id)) {
        desiredCompleted = targetCompleted;
      } else {
        const chapterKey = getTaskChapterKey(task);
        if (chapterKey !== null && chapterBounds.has(chapterKey)) {
          const boundPart = chapterBounds.get(chapterKey);
          const siblingPart = getTaskPartNumber(task);
          if (targetCompleted && siblingPart < boundPart) {
            // Marking Part K complete cascades all preceding parts (< K) to complete
            desiredCompleted = true;
          } else if (!targetCompleted && siblingPart > boundPart) {
            // Unchecking Part K cascades all subsequent parts (> K) to uncheck
            desiredCompleted = false;
          }
        }
      }

      if (desiredCompleted !== Boolean(task.completed)) {
        dayChanged = true;
        if (desiredCompleted) {
          newlyCompletedCount++;
        } else {
          newlyUncompletedCount++;
        }
        return { ...task, completed: desiredCompleted };
      }
      return task;
    });

    return dayChanged ? { ...day, tasks: nextTasks } : day;
  });

  const netDelta = newlyCompletedCount - newlyUncompletedCount;
  const next = {
    ...state,
    lastModified: modifiedAt || new Date().toISOString(),
    xp: Math.max(0, (state.xp || 0) + netDelta * 100),
    plan: nextPlan,
  };

  if (newlyCompletedCount > 0 && today && state.lastCompletedDate !== today) {
    next.streakCount = state.lastCompletedDate === yesterday ? (state.streakCount || 0) + 1 : 1;
    next.lastCompletedDate = today;
  }

  persistStudyBackup(next, storage);
  return next;
}

/**
 * Save the next completion state with universal multi-part chapter cascading completion logic
 * before exposing it to the UI or cloud sync.
 *
 * @param {object} state - App state containing plan array
 * @param {string} taskId - Target task ID toggled by user
 * @param {Storage} storage - Storage backend (e.g. localStorage)
 * @param {object} options - { today, yesterday, modifiedAt }
 * @returns {object|null} - Updated state or null if task not found
 */
export function persistTaskCompletion(state, taskId, storage, options = {}) {
  return persistTaskGroupCompletion(state, taskId, storage, options);
}
