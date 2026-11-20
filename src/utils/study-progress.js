import { persistStudyBackup } from './study-backup.js';
import { studyBlockKey } from '../engine/chapter-blocks.js';

/** Save the next completion state before exposing it to the UI or cloud sync. */
export function persistTaskCompletion(state, taskId, storage, { today, yesterday, modifiedAt, wholeBlock = false }) {
  const day = state?.plan?.find(item => item.tasks.some(task => task.id === taskId));
  const task = day?.tasks.find(item => item.id === taskId);
  if (!task) return null;

  const key = studyBlockKey(task);
  const targets = new Set(wholeBlock ? day.tasks.filter(item => studyBlockKey(item) === key) : [task]);
  const completed = ![...targets].every(item => item.completed);
  const changedCount = [...targets].filter(item => Boolean(item.completed) !== completed).length;
  const next = {
    ...state,
    lastModified: modifiedAt,
    xp: Math.max(0, (state.xp || 0) + changedCount * (completed ? 100 : -100)),
    plan: state.plan.map(item => item === day ? {
      ...item,
      tasks: item.tasks.map(itemTask => targets.has(itemTask) ? { ...itemTask, completed } : itemTask),
    } : item),
  };
  if (completed && state.lastCompletedDate !== today) {
    next.streakCount = state.lastCompletedDate === yesterday ? (state.streakCount || 0) + 1 : 1;
    next.lastCompletedDate = today;
  }
  persistStudyBackup(next, storage);
  return next;
}
