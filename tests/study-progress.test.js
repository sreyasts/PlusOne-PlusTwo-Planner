import { describe, expect, it } from 'vitest';
import {
  persistTaskCompletion,
  persistTaskGroupCompletion,
  getTaskChapterKey,
  getTaskPartNumber,
} from '../src/utils/study-progress.js';

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

describe('Universal Task Chapter & Part Dynamic Extraction', () => {
  it('extracts canonical chapter key from task.chapId', () => {
    const task = { id: '+2_Physics_1_P1', chapId: '+2_Physics_1', part: 1 };
    expect(getTaskChapterKey(task)).toBe('+2_Physics_1');
  });

  it('extracts chapter key from task.id matching _P\\d+$ as fallback', () => {
    const task = { id: 'CBSE_12_PHY_01_P2' };
    expect(getTaskChapterKey(task)).toBe('CBSE_12_PHY_01');
  });

  it('extracts chapter key from composite fields (grade, subject, chapNumber/chapterName)', () => {
    const taskWithNum = { id: 'custom_1', grade: '+1', subject: 'Mathematics', chapNumber: 3 };
    expect(getTaskChapterKey(taskWithNum)).toBe('+1_Mathematics_3');

    const taskWithName = { id: 'custom_2', grade: '+2', subject: 'Botany', chapterName: 'Respiration' };
    expect(getTaskChapterKey(taskWithName)).toBe('+2_Botany_Respiration');
  });

  it('isolates non-learning tasks and returns null for chapter key', () => {
    expect(getTaskChapterKey({ id: 't1', chapId: '+2_Physics_1', isRevision: true })).toBeNull();
    expect(getTaskChapterKey({ id: 't2', chapId: '+2_Physics_1', isExamEveTask: true })).toBeNull();
    expect(getTaskChapterKey({ id: 't3', chapId: '+2_Physics_1', isSpacedRetrieval: true })).toBeNull();
    expect(getTaskChapterKey({ id: 't4', chapId: '+2_Physics_1', isForgettingCurveReview: true })).toBeNull();
    expect(getTaskChapterKey({ id: 't5', chapId: '+2_Physics_1', isModelExam: true })).toBeNull();
  });

  it('extracts part numbers dynamically from numeric, string, id suffix, and topic titles', () => {
    expect(getTaskPartNumber({ part: 2 })).toBe(2);
    expect(getTaskPartNumber({ part: '3' })).toBe(3);
    expect(getTaskPartNumber({ id: 'CHEM_10_P4' })).toBe(4);
    expect(getTaskPartNumber({ topicTitle: 'Electromagnetic Waves Part 2' })).toBe(2);
    expect(getTaskPartNumber({ topicTitle: 'ചലനം ഭാഗം 3' })).toBe(3);
    expect(getTaskPartNumber({ id: 'generic_task' })).toBe(1);
    expect(getTaskPartNumber(null)).toBe(1);
  });
});

describe('Universal Multi-Part Chapter Cascading Completion', () => {
  it('cascades preceding parts to complete when later part is marked complete and scales XP', () => {
    const state = {
      xp: 0,
      streakCount: 0,
      lastCompletedDate: null,
      plan: [
        {
          dayNumber: 1,
          date: '2026-10-20',
          tasks: [
            { id: '+2_Physics_1_P1', chapId: '+2_Physics_1', part: 1, completed: false },
            { id: '+2_Physics_1_P2', chapId: '+2_Physics_1', part: 2, completed: false },
          ],
        },
      ],
    };
    const storage = makeStorage(state);

    // Marking Part 2 complete cascades Part 1 to complete (+200 XP)
    const next = persistTaskCompletion(state, '+2_Physics_1_P2', storage, options);
    expect(next.plan[0].tasks[0].completed).toBe(true);
    expect(next.plan[0].tasks[1].completed).toBe(true);
    expect(next.xp).toBe(200);
    expect(next.streakCount).toBe(1);
    expect(next.lastCompletedDate).toBe(options.today);
  });

  it('cascades subsequent parts to uncheck when an earlier part is unchecked', () => {
    const state = {
      xp: 200,
      streakCount: 1,
      lastCompletedDate: options.today,
      plan: [
        {
          dayNumber: 1,
          date: '2026-10-20',
          tasks: [
            { id: '+2_Physics_1_P1', chapId: '+2_Physics_1', part: 1, completed: true },
            { id: '+2_Physics_1_P2', chapId: '+2_Physics_1', part: 2, completed: true },
          ],
        },
      ],
    };
    const storage = makeStorage(state);

    // Unchecking Part 1 cascades Part 2 to uncheck (-200 XP)
    const next = persistTaskCompletion(state, '+2_Physics_1_P1', storage, options);
    expect(next.plan[0].tasks[0].completed).toBe(false);
    expect(next.plan[0].tasks[1].completed).toBe(false);
    expect(next.xp).toBe(0);
  });

  it('preserves completed state of preceding parts when a later part is unchecked', () => {
    const state = {
      xp: 200,
      streakCount: 1,
      lastCompletedDate: options.today,
      plan: [
        {
          dayNumber: 1,
          date: '2026-10-20',
          tasks: [
            { id: '+2_Physics_1_P1', chapId: '+2_Physics_1', part: 1, completed: true },
            { id: '+2_Physics_1_P2', chapId: '+2_Physics_1', part: 2, completed: true },
          ],
        },
      ],
    };
    const storage = makeStorage(state);

    // Unchecking Part 2 leaves Part 1 completed (-100 XP)
    const next = persistTaskCompletion(state, '+2_Physics_1_P2', storage, options);
    expect(next.plan[0].tasks[0].completed).toBe(true);
    expect(next.plan[0].tasks[1].completed).toBe(false);
    expect(next.xp).toBe(100);
  });

  it('handles 3-part chapter cascades cleanly and idempotently', () => {
    const state = {
      xp: 0,
      streakCount: 0,
      lastCompletedDate: null,
      plan: [
        {
          dayNumber: 1,
          date: '2026-10-20',
          tasks: [
            { id: '+2_Chem_1_P1', chapId: '+2_Chem_1', part: 1, completed: false },
            { id: '+2_Chem_1_P2', chapId: '+2_Chem_1', part: 2, completed: false },
            { id: '+2_Chem_1_P3', chapId: '+2_Chem_1', part: 3, completed: false },
          ],
        },
      ],
    };
    const storage = makeStorage(state);

    // Check Part 2 -> Parts 1 & 2 complete, Part 3 remains incomplete
    const step1 = persistTaskCompletion(state, '+2_Chem_1_P2', storage, options);
    expect(step1.plan[0].tasks[0].completed).toBe(true);
    expect(step1.plan[0].tasks[1].completed).toBe(true);
    expect(step1.plan[0].tasks[2].completed).toBe(false);
    expect(step1.xp).toBe(200);

    // Check Part 3 -> Part 1 & 2 already complete, Part 3 becomes complete (+100 XP)
    const step2 = persistTaskCompletion(step1, '+2_Chem_1_P3', storage, options);
    expect(step2.plan[0].tasks[0].completed).toBe(true);
    expect(step2.plan[0].tasks[1].completed).toBe(true);
    expect(step2.plan[0].tasks[2].completed).toBe(true);
    expect(step2.xp).toBe(300);

    // Uncheck Part 2 -> Part 1 remains complete, Parts 2 & 3 become incomplete (-200 XP)
    const step3 = persistTaskCompletion(step2, '+2_Chem_1_P2', storage, options);
    expect(step3.plan[0].tasks[0].completed).toBe(true);
    expect(step3.plan[0].tasks[1].completed).toBe(false);
    expect(step3.plan[0].tasks[2].completed).toBe(false);
    expect(step3.xp).toBe(100);
  });
});

describe('Multi-Day Plan Traversal: Coordination Compounds (+2 Chemistry Ch 5)', () => {
  it('cascades completion from Day 2 Part 2/2 to Day 1 Part 1/2 across multi-day boundary', () => {
    const multiDayState = {
      xp: 0,
      streakCount: 0,
      lastCompletedDate: null,
      grade: '+2',
      stream: 'science',
      plan: [
        {
          dayNumber: 1,
          date: '2026-10-20',
          tasks: [
            {
              id: '+2_Chemistry_5_P1',
              chapId: '+2_Chemistry_5',
              grade: '+2',
              subject: 'Chemistry',
              chapNumber: 5,
              chapterName: 'Coordination Compounds',
              part: 1,
              totalParts: 2,
              topicTitle: "Werner's Theory, Ligands, Coordination Number & IUPAC Nomenclature",
              completed: false,
            },
          ],
        },
        {
          dayNumber: 2,
          date: '2026-10-21',
          tasks: [
            {
              id: '+2_Chemistry_5_P2',
              chapId: '+2_Chemistry_5',
              grade: '+2',
              subject: 'Chemistry',
              chapNumber: 5,
              chapterName: 'Coordination Compounds',
              part: 2,
              totalParts: 2,
              topicTitle: 'Valence Bond Theory, Crystal Field Theory & Isomerism in Complexes',
              completed: false,
            },
          ],
        },
        {
          dayNumber: 5,
          date: '2026-10-24',
          tasks: [
            {
              id: '+2_Chemistry_5_REV',
              chapId: '+2_Chemistry_5',
              grade: '+2',
              subject: 'Chemistry',
              chapNumber: 5,
              chapterName: 'Coordination Compounds',
              isRevision: true,
              topicTitle: 'Coordination Compounds Spaced Review',
              completed: false,
            },
          ],
        },
      ],
    };
    const storage = makeStorage(multiDayState);

    // Marking Part 2/2 complete on Day 2 cascades Part 1/2 on Day 1 to complete
    const afterPart2 = persistTaskCompletion(multiDayState, '+2_Chemistry_5_P2', storage, options);
    expect(afterPart2.plan[0].tasks[0].completed).toBe(true); // Day 1 Part 1
    expect(afterPart2.plan[1].tasks[0].completed).toBe(true); // Day 2 Part 2
    expect(afterPart2.plan[2].tasks[0].completed).toBe(false); // Day 5 Revision task ISOLATED
    expect(afterPart2.xp).toBe(200);

    // Unchecking Part 1/2 on Day 1 cascades subsequent Part 2/2 on Day 2 to incomplete
    const afterUncheckPart1 = persistTaskCompletion(afterPart2, '+2_Chemistry_5_P1', storage, options);
    expect(afterUncheckPart1.plan[0].tasks[0].completed).toBe(false); // Day 1 Part 1 unchecked
    expect(afterUncheckPart1.plan[1].tasks[0].completed).toBe(false); // Day 2 Part 2 unchecked
    expect(afterUncheckPart1.plan[2].tasks[0].completed).toBe(false); // Day 5 Revision remains incomplete
    expect(afterUncheckPart1.xp).toBe(0);

    // Re-completing Part 1 and then Part 2, then unchecking Part 2 leaves Part 1 intact
    const completedBoth = persistTaskCompletion(multiDayState, '+2_Chemistry_5_P2', storage, options);
    const uncheckPart2Only = persistTaskCompletion(completedBoth, '+2_Chemistry_5_P2', storage, options);
    expect(uncheckPart2Only.plan[0].tasks[0].completed).toBe(true); // Day 1 Part 1 preserved
    expect(uncheckPart2Only.plan[1].tasks[0].completed).toBe(false); // Day 2 Part 2 unchecked
    expect(uncheckPart2Only.xp).toBe(100);
  });
});

describe('Universal Cross-Stream Support (Commerce, Humanities, Malayalam)', () => {
  it('cascades Commerce Accountancy multi-part chapters dynamically', () => {
    const state = {
      xp: 0,
      streakCount: 0,
      lastCompletedDate: null,
      plan: [
        {
          dayNumber: 3,
          date: '2026-10-22',
          tasks: [
            { id: '+2_Accountancy_3_P1', chapId: '+2_Accountancy_3', part: 1, completed: false },
            { id: '+2_Accountancy_3_P2', chapId: '+2_Accountancy_3', part: 2, completed: false },
          ],
        },
      ],
    };
    const storage = makeStorage(state);
    const next = persistTaskCompletion(state, '+2_Accountancy_3_P2', storage, options);
    expect(next.plan[0].tasks[0].completed).toBe(true);
    expect(next.plan[0].tasks[1].completed).toBe(true);
    expect(next.xp).toBe(200);
  });

  it('cascades Humanities History chapters with fallback regex and Malayalam titles', () => {
    const state = {
      xp: 0,
      streakCount: 0,
      lastCompletedDate: null,
      plan: [
        {
          dayNumber: 1,
          date: '2026-10-20',
          tasks: [
            { id: 'HIST_11_01_P1', topicTitle: 'ആദ്യകാല മാനവ സംസ്കാരം ഭാഗം 1', completed: false },
          ],
        },
        {
          dayNumber: 2,
          date: '2026-10-21',
          tasks: [
            { id: 'HIST_11_01_P2', topicTitle: 'ആദ്യകാല മാനവ സംസ്കാരം ഭാഗം 2', completed: false },
          ],
        },
      ],
    };
    const storage = makeStorage(state);
    const next = persistTaskCompletion(state, 'HIST_11_01_P2', storage, options);
    expect(next.plan[0].tasks[0].completed).toBe(true);
    expect(next.plan[1].tasks[0].completed).toBe(true);
    expect(next.xp).toBe(200);
  });

  it('completes and undoes multi-part chapter groups atomically via persistTaskGroupCompletion', () => {
    const state = {
      xp: 0,
      streakCount: 0,
      lastCompletedDate: null,
      plan: [
        {
          dayNumber: 1,
          date: '2026-10-19',
          tasks: [
            { id: '+2_Phy_1_P1', chapId: '+2_Phy_1', part: 1, totalParts: 3, completed: true },
          ],
        },
        {
          dayNumber: 2,
          date: '2026-10-20',
          tasks: [
            { id: '+2_Phy_1_P2', chapId: '+2_Phy_1', part: 2, totalParts: 3, completed: false },
            { id: '+2_Phy_1_P3', chapId: '+2_Phy_1', part: 3, totalParts: 3, completed: false },
          ],
        },
      ],
    };
    const storage = makeStorage(state);

    const completed = persistTaskGroupCompletion(state, ['+2_Phy_1_P2', '+2_Phy_1_P3'], storage, options);
    expect(completed.plan[0].tasks[0].completed).toBe(true);
    expect(completed.plan[1].tasks[0].completed).toBe(true);
    expect(completed.plan[1].tasks[1].completed).toBe(true);
    expect(completed.xp).toBe(200);

    // Undoing Parts 2 & 3 preserves Part 1 from Day 1
    const undone = persistTaskGroupCompletion(completed, ['+2_Phy_1_P2', '+2_Phy_1_P3'], storage, options);
    expect(undone.plan[0].tasks[0].completed).toBe(true);
    expect(undone.plan[1].tasks[0].completed).toBe(false);
    expect(undone.plan[1].tasks[1].completed).toBe(false);
    expect(undone.xp).toBe(0);
  });
});
