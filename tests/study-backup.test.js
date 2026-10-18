import { describe, it, expect } from 'vitest';
import { createStudyBackup, parseStudyBackup, persistStudyBackup } from '../src/utils/study-backup.js';

const makePlan = () => ({
  engineVersion: 6, stream: 'cs', startDate: '2026-10-18', deadlineDate: '2026-11-18',
  plan: [{ date: '2026-10-18', dayNumber: 1, tasks: [
    { id: 'p2_Physics_1_P1', subject: 'Physics', chapterName: 'Electric Charges and Fields', topicTitle: "Coulomb's Law", completed: true, estimatedMinutes: 65 }
  ] }]
});

describe('Study backup validation and persistence', () => {
  it('round-trips dates, task IDs and completion while omitting account identity', () => {
    const state = { ...makePlan(), userEmail: 'private@example.invalid', uid: 'account-id', displayName: 'Private name' };
    const exported = createStudyBackup(state, '6.4.3');
    const restored = parseStudyBackup(JSON.stringify(exported));
    expect(restored.plan).toEqual(state.plan);
    expect(restored.appVersion).toBe('6.4.3');
    expect(restored).not.toHaveProperty('userEmail');
    expect(restored).not.toHaveProperty('uid');
    expect(restored).not.toHaveProperty('displayName');
    expect(state.userEmail).toBe('private@example.invalid');
  });

  it.each([null, {}, { plan: [] }, { plan: [null] }, { plan: [{ date: '2026-02-30', tasks: [] }] }])('rejects an unusable plan: %j', state => {
    expect(() => parseStudyBackup(JSON.stringify(state))).toThrow();
  });

  it.each([
    state => { state.plan[0].tasks[0].completed = 'false'; },
    state => { state.plan[0].tasks[0].id = '\" onclick=alert(1)'; },
    state => { state.plan[0].tasks[0].chapterName = '<img src=x onerror=alert(1)>'; },
    state => { state.plan[0].tasks[0].estimatedMinutes = -10; },
    state => { state.plan[0].tasks.push({ ...state.plan[0].tasks[0] }); },
    state => { state.plan.push({ ...state.plan[0], tasks: [] }); },
    state => { state.stream = {}; },
    state => { state.deadlineDate = 'tomorrow'; },
    state => { state.personalization = 'not settings'; },
    state => { state.improvementConfig = 'not subjects'; },
    state => { state.completedChaptersOnInit = [null]; },
    state => { state.targetTerm = 99; },
  ])('rejects malformed task data or duplicate identifiers', change => {
    const state = makePlan();
    change(state);
    expect(() => parseStudyBackup(JSON.stringify(state))).toThrow();
  });

  it('rejects prototype keys and oversized input', () => {
    expect(() => parseStudyBackup('{"__proto__":{"polluted":true}}')).toThrow();
    expect(() => parseStudyBackup(' '.repeat(2 * 1024 * 1024 + 1))).toThrow();
    expect({}.polluted).toBeUndefined();
  });

  it('normalizes missing legacy completion and day numbers without changing the input', () => {
    const state = makePlan();
    delete state.plan[0].dayNumber;
    delete state.plan[0].tasks[0].completed;
    const restored = parseStudyBackup(JSON.stringify(state));
    expect(restored.plan[0].dayNumber).toBe(1);
    expect(restored.plan[0].tasks[0].completed).toBe(false);
    expect(state.plan[0]).not.toHaveProperty('dayNumber');
  });

  it.each([null, 'previous legacy state'])('rolls both keys back when the second storage write fails (legacy: %s)', legacy => {
    const values = new Map([['plusTwoMissionState_v2', 'previous plan']]);
    if (legacy !== null) values.set('plusTwoPlanState', legacy);
    let writes = 0;
    const storage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => {
        if (++writes === 2) throw new Error('quota exceeded');
        values.set(key, value);
      },
      removeItem: key => values.delete(key),
    };
    expect(() => persistStudyBackup(makePlan(), storage)).toThrow('quota exceeded');
    expect(storage.getItem('plusTwoMissionState_v2')).toBe('previous plan');
    expect(storage.getItem('plusTwoPlanState')).toBe(legacy);
  });
});
