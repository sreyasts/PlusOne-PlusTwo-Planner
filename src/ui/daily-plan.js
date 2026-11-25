import { getTaskChapterKey, getTaskPartNumber } from '../utils/study-progress.js';

function buildCompressedGroup(groupKey, chapterKey, tasks, dates = []) {
  const ordered = chapterKey
    ? [...tasks].sort((a, b) => getTaskPartNumber(a) - getTaskPartNumber(b))
    : [...tasks];

  const primaryTask = ordered[0];
  const actionTask = ordered[ordered.length - 1];
  const partNumbers = ordered.map(task => getTaskPartNumber(task));
  const partStart = Math.min(...partNumbers);
  const partEnd = Math.max(...partNumbers);
  const totalParts = Math.max(
    partEnd,
    ...ordered.map(task => {
      const n = Number(task?.totalParts);
      return Number.isFinite(n) && n > 0 ? n : 1;
    })
  );

  let isContiguous = true;
  for (let i = 1; i < partNumbers.length; i++) {
    if (partNumbers[i] > partNumbers[i - 1] + 1) {
      isContiguous = false;
      break;
    }
  }

  const isFullChapter = Boolean(
    chapterKey &&
    isContiguous &&
    partStart === 1 &&
    partEnd >= totalParts &&
    ordered.length >= totalParts
  );

  const hasEstimatedMinutes = ordered.some(
    task => typeof task?.estimatedMinutes === 'number' && Number.isFinite(task.estimatedMinutes) && task.estimatedMinutes > 0
  );
  const totalMinutes = hasEstimatedMinutes
    ? ordered.reduce((sum, task) => sum + (Number(task?.estimatedMinutes) || 60), 0)
    : 0;

  const uniqueDates = [...new Set(dates.filter(d => typeof d === 'string' && d.length > 0))].sort((a, b) => a.localeCompare(b));

  return {
    groupKey,
    chapterKey,
    primaryTask,
    actionTaskId: actionTask?.id,
    tasks: ordered,
    taskIds: ordered.map(task => task?.id).filter(Boolean),
    dates: uniqueDates,
    isMultiTask: ordered.length > 1,
    partNumbers,
    partStart,
    partEnd,
    totalParts,
    isContiguous,
    isFullChapter,
    totalMinutes,
    completed: ordered.every(task => Boolean(task?.completed)),
    isFocusSubject: ordered.some(task => Boolean(task?.isFocusSubject)),
  };
}

/**
 * Format a concise human-readable part scope label for a compressed chapter group.
 * Returns empty string for non-learning or trivial single-part items when appropriate.
 * @param {object} group
 * @param {boolean} isML
 * @returns {string}
 */
export function formatCompressedGroupScope(group, isML = false) {
  if (!group || !group.chapterKey) return '';
  const { partNumbers, partStart, partEnd, totalParts, isContiguous, isFullChapter, isMultiTask } = group;
  if (!isMultiTask) {
    if (totalParts <= 1) {
      return isML ? 'മുഴുവൻ അധ്യായം' : 'Full Chapter';
    }
    if (partStart === totalParts) {
      return isML ? `ഭാഗം ${partStart}/${totalParts} (മുഴുവൻ)` : `Part ${partStart}/${totalParts} (Full Chapter)`;
    }
    return isML ? `ഭാഗം ${partStart}/${totalParts}` : `Part ${partStart}/${totalParts}`;
  }

  if (isContiguous) {
    if (isFullChapter) {
      return isML
        ? `ഭാഗങ്ങൾ ${partStart}–${partEnd}/${totalParts} (മുഴുവൻ അധ്യായം)`
        : `Parts ${partStart}–${partEnd} of ${totalParts} (Full Chapter)`;
    }
    return isML
      ? `ഭാഗങ്ങൾ ${partStart}–${partEnd}/${totalParts}`
      : `Parts ${partStart}–${partEnd} of ${totalParts}`;
  }

  return isML
    ? `ഭാഗങ്ങൾ ${partNumbers.join(', ')}/${totalParts}`
    : `Parts ${partNumbers.join(', ')} of ${totalParts}`;
}

/**
 * Compress overdue days' unfinished tasks dynamically by canonical chapter key.
 * Multi-part chapters spread across previous days collapse into one continuous
 * chapter block, while non-learning tasks remain standalone items.
 * Preserves newest-first ordering based on most recent overdue occurrence.
 *
 * @param {Array<{date: string, tasks: Array<object>}>} overdueDays
 * @returns {Array<object>}
 */
export function compressPendingOverdueDays(overdueDays) {
  if (!Array.isArray(overdueDays) || overdueDays.length === 0) return [];

  const groups = [];
  const chapterGroupMap = new Map();

  overdueDays.forEach((day, dayIdx) => {
    const dayDate = day?.date || '';
    const tasks = Array.isArray(day?.tasks) ? day.tasks : [];

    tasks.forEach((task, taskIdx) => {
      if (!task || task.completed) return;
      const chapterKey = getTaskChapterKey(task);
      const partNum = getTaskPartNumber(task);

      if (chapterKey) {
        const existing = chapterGroupMap.get(chapterKey);
        if (existing && !existing.partSet.has(partNum)) {
          existing.tasks.push(task);
          existing.partSet.add(partNum);
          if (dayDate) existing.dates.push(dayDate);
          return;
        }
        if (!existing) {
          const entry = {
            groupKey: chapterKey,
            chapterKey,
            tasks: [task],
            partSet: new Set([partNum]),
            dates: dayDate ? [dayDate] : [],
          };
          chapterGroupMap.set(chapterKey, entry);
          groups.push(entry);
          return;
        }
      }

      // Non-learning task, unkeyed task, or duplicate part number stays standalone
      groups.push({
        groupKey: task.id ? `standalone:${task.id}` : `standalone:${dayDate}:${dayIdx}:${taskIdx}`,
        chapterKey: null,
        tasks: [task],
        partSet: new Set([partNum]),
        dates: dayDate ? [dayDate] : [],
      });
    });
  });

  return groups.map(entry =>
    buildCompressedGroup(entry.groupKey, entry.chapterKey, entry.tasks, entry.dates)
  );
}

/**
 * Compress consecutive same-day parts of the same chapter into a single continuous
 * chapter block while keeping non-contiguous parts, single-part items, and
 * non-learning tasks cleanly separate.
 *
 * @param {Array<object>} tasks
 * @param {string} [date]
 * @returns {Array<object>}
 */
export function compressSameDayTasks(tasks, date = '') {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];

  const buckets = [];

  tasks.forEach((task, idx) => {
    if (!task) return;
    const chapterKey = getTaskChapterKey(task);
    const partNum = getTaskPartNumber(task);
    const completed = Boolean(task.completed);
    const prev = buckets[buckets.length - 1];

    if (
      chapterKey &&
      prev &&
      prev.chapterKey === chapterKey &&
      prev.completed === completed &&
      partNum > prev.maxPart &&
      !prev.partSet.has(partNum)
    ) {
      prev.tasks.push(task);
      prev.partSet.add(partNum);
      prev.maxPart = partNum;
      return;
    }

    buckets.push({
      groupKey: chapterKey ? `${chapterKey}:${idx}` : (task.id ? `standalone:${task.id}` : `standalone:${idx}`),
      chapterKey,
      completed,
      tasks: [task],
      partSet: new Set([partNum]),
      maxPart: partNum,
      dates: date ? [date] : [],
    });
  });

  return buckets.map(bucket =>
    buildCompressedGroup(bucket.groupKey, bucket.chapterKey, bucket.tasks, bucket.dates)
  );
}

/**
 * Select calendar days without moving unfinished work into today's timetable.
 * Returned tasks retain their original IDs and dates for completion updates.
 * @param {Array<{date: string, dayNumber: number, tasks: Array<object>}>} plan
 * @param {string} today Local calendar date in YYYY-MM-DD format.
 */
export function getDailyPlan(plan, today) {
  const localDate = new Date(`${today}T12:00:00`);
  const format = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(localDate.getTime()) || format(localDate) !== today) {
    throw new TypeError('Expected a valid local calendar date.');
  }
  const yesterday = new Date(localDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(localDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const days = Array.isArray(plan) ? plan.filter(day => day && typeof day.date === 'string' && Array.isArray(day.tasks)) : [];
  const overdueDays = days
    .filter(day => day.date < today)
    .map(day => ({ ...day, tasks: day.tasks.filter(task => !task.completed) }))
    .filter(day => day.tasks.length)
    .sort((a, b) => b.date.localeCompare(a.date));
  const yesterdayPlan = days.find(day => day.date === format(yesterday));
  return {
    todayPlan: days.find(day => day.date === today),
    tomorrowPlan: days.find(day => day.date === format(tomorrow)),
    yesterdayPlan,
    yesterdayDate: format(yesterday),
    overdueDays,
    overdueGroups: compressPendingOverdueDays(overdueDays),
    overdueCount: overdueDays.reduce((count, day) => count + day.tasks.length, 0),
  };
}
