import { describe, expect, it } from 'vitest';
import { persistTaskCompletion } from '../src/utils/study-progress.js';

const options = { today: '2026-10-20', yesterday: '2026-10-19', modifiedAt: '2026-10-20T06:30:00Z' };
const makeState = (completed = false) => ({
  xp: 300, streakCount: 5, lastCompletedDate: options.yesterday, lastModified: 'previous',
  plan: [{ date: options.today, tasks: [{ id: 'task-1', completed }, { id: 'task-2', completed: false }] }],
});
function makeStorage(state, failedWrite) {
  const values = new Map(['plusTwoMissionState_v2', 'plusTwoPlanState'].map(key => [key, JSON.stringify(state)]));
  let writes = 0;
  return {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      if (++writes === failedWrite) throw new Error('QuotaExceededError');
      values.set(key, value);
    },
    removeItem: key => values.delete(key),
  };
}

describe('Transactional study completion', () => {
  it.each([1, 2])('keeps progress and both stored plans on write %i failure', failedWrite => {
    for (const completed of [false, true]) {
      const state = makeState(completed);
      const before = JSON.stringify(state);
      const storage = makeStorage(state, failedWrite);
      expect(() => persistTaskCompletion(state, 'task-1', storage, options)).toThrow('QuotaExceededError');
      expect(JSON.stringify(state)).toBe(before);
      expect(storage.getItem('plusTwoMissionState_v2')).toBe(before);
      expect(storage.getItem('plusTwoPlanState')).toBe(before);
    }
  });

  it('persists completion, XP and a new daily streak together without mutating the previous state', () => {
    const state = makeState();
    const storage = makeStorage(state);
    const next = persistTaskCompletion(state, 'task-1', storage, options);
    expect(state).toEqual(makeState());
    expect(next.plan[0].tasks[0].completed).toBe(true);
    expect(next.xp).toBe(400);
    expect(next.streakCount).toBe(6);
    expect(next.lastCompletedDate).toBe(options.today);
    expect(next.lastModified).toBe(options.modifiedAt);
    expect(JSON.parse(storage.getItem('plusTwoMissionState_v2'))).toEqual(next);
    expect(storage.getItem('plusTwoPlanState')).toBe(storage.getItem('plusTwoMissionState_v2'));
    const second = persistTaskCompletion(next, 'task-2', storage, options);
    expect(second.streakCount).toBe(6);
  });

  it('persists undo without advancing the streak or allowing negative XP', () => {
    const state = { ...makeState(true), xp: 0 };
    const next = persistTaskCompletion(state, 'task-1', makeStorage(state), options);
    expect(next.plan[0].tasks[0].completed).toBe(false);
    expect(next.xp).toBe(0);
    expect(next.streakCount).toBe(state.streakCount);
    expect(next.lastCompletedDate).toBe(state.lastCompletedDate);
  });

  it('ignores a missing task without touching storage', () => {
    const storage = { getItem() { throw new Error('Unexpected read'); } };
    expect(persistTaskCompletion(makeState(), 'missing', storage, options)).toBeNull();
  });
});
