import { persistStudyBackup } from './study-backup.js';

/** Save the next completion state before exposing it to the UI or cloud sync. */
export function persistTaskCompletion(state, taskId, storage, { today, yesterday, modifiedAt }) {
  const day = state?.plan?.find(item => item.tasks.some(task => task.id === taskId));
  const task = day?.tasks.find(item => item.id === taskId);
  if (!task) return null;

  const completed = !task.completed;
  const next = {
    ...state,
    lastModified: modifiedAt,
    xp: completed ? (state.xp || 0) + 100 : Math.max(0, (state.xp || 0) - 100),
    plan: state.plan.map(item => item === day ? {
      ...item,
      tasks: item.tasks.map(itemTask => itemTask === task ? { ...itemTask, completed } : itemTask),
    } : item),
  };
  if (completed && state.lastCompletedDate !== today) {
    next.streakCount = state.lastCompletedDate === yesterday ? (state.streakCount || 0) + 1 : 1;
    next.lastCompletedDate = today;
  }
  persistStudyBackup(next, storage);
  return next;
}
