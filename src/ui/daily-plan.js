import { groupStudyBlocks, studyMinutes } from '../engine/chapter-blocks.js';

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
    overdueCount: overdueDays.reduce((count, day) => count + day.tasks.length, 0),
  };
}
export function displayStudyBlocks(tasks) {
  return groupStudyBlocks(tasks).map(parts => {
    const first = parts[0];
    if (!first.chapId || first.isRevision || first.isExamEveTask || first.isSpacedRetrieval || first.isForgettingCurveReview) return first;
    const ordered = [...parts].sort((a, b) => (a.part || 1) - (b.part || 1));
    const total = first.totalParts || 1;
    const partNumbers = ordered.map(task => task.part || 1);
    const completeParts = parts.filter(task => task.completed).length;
    return {
      ...first,
      totalParts: total,
      blockParts: ordered,
      completeParts,
      partNumbers,
      isFullOnDay: partNumbers.length === total && partNumbers.every((part, index) => part === index + 1),
      completed: completeParts === parts.length,
      estimatedMinutes: parts.reduce((sum, task) => sum + studyMinutes(task), 0),
    };
  });
}
