/**
 * @file tests/cascading-completion.test.js
 * Comprehensive 4-Tier E2E Test Suite for Universal Multi-Part Chapter Cascading Completion
 *
 * Requirements Covered:
 * - R1: Universal Multi-Part Chapter Cascading Completion Logic (ORIGINAL_REQUEST §R1)
 * - Dynamic & Universal Resolution across Science, Commerce, Humanities, Class 11 & Class 12
 * - Exact XP Delta Scaling & Daily Streak Counting Invariant Protection
 * - Non-Learning Task Isolation (Revision, Exam-Eve, Spaced Retrieval, Forgetting Curve)
 *
 * 4-Tier Architecture:
 * - Tier 1: Feature Coverage (>=5 tests per feature: marking part 2 completes part 1;
 *            marking part 3 completes parts 1 & 2; unchecking part 1 unchecks parts 2 & 3;
 *            unchecking part 2 unchecks part 3 while keeping part 1 complete; dynamic chapter keys;
 *            dynamic part number extraction)
 * - Tier 2: Boundary & Corner Cases (single-part chapter isolation, 4-part chapters,
 *            non-learning task isolation, missing part property fallbacks, idempotency,
 *            zero XP floor, state immutability)
 * - Tier 3: Cross-Feature Combinations (multi-day plan distribution, streak counting with cascades,
 *            exact XP delta accounting, multi-subject multi-stream day plans, bidirectional roundtrips,
 *            Malayalam topicTitle part regex extraction)
 * - Tier 4: Real-World Application Scenarios (Mandatory Coordination Compounds Part 1 on Day 1 &
 *            Part 2 on Day 2, Science 30-Day plan simulation, Commerce student multi-part workflow,
 *            Humanities curriculum cascade, Overdue task backlog cascade, Fast-track rebalance validation)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  persistTaskCompletion,
  getTaskChapterKey,
  getTaskPartNumber,
} from '../src/utils/study-progress.js';
import { PLUS_TWO_CHAPTERS } from '../src/data/syllabus-plus-two.js';
import { validatePlan } from '../src/engine/planner.js';

function createMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: vi.fn(key => (map.has(key) ? map.get(key) : null)),
    setItem: vi.fn((key, value) => map.set(key, String(value))),
    removeItem: vi.fn(key => map.delete(key)),
    _getMap: () => map,
  };
}

const defaultOptions = {
  today: '2026-10-21',
  yesterday: '2026-10-20',
  modifiedAt: '2026-10-21T09:00:00.000Z',
};

function makePlanState(days = [], overrides = {}) {
  return {
    xp: overrides.xp ?? 0,
    streakCount: overrides.streakCount ?? 0,
    lastCompletedDate: overrides.lastCompletedDate ?? null,
    lastModified: overrides.lastModified ?? '2026-10-20T00:00:00.000Z',
    plan: days.map((day, idx) => ({
      date: day.date || ('2026-10-' + String(21 + idx).padStart(2, '0')),
      dayNumber: day.dayNumber || idx + 1,
      tasks: day.tasks || [],
    })),
  };
}

describe('Tier 1: Feature Coverage — Universal Multi-Part Cascading Completion', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe('Feature 1: Marking Part 2 completes Part 1 automatically', () => {
    it('1.1 +2 Physics: marking Part 2/2 complete automatically completes Part 1/2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Physics_1_P1', chapId: '+2_Physics_1', grade: '+2', subject: 'Physics', chapNumber: 1, chapterName: 'Electric Charges and Fields', part: 1, totalParts: 2, completed: false },
            { id: '+2_Physics_1_P2', chapId: '+2_Physics_1', grade: '+2', subject: 'Physics', chapNumber: 1, chapterName: 'Electric Charges and Fields', part: 2, totalParts: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Physics_1_P2', storage, defaultOptions);

      expect(next).not.toBeNull();
      const tasks = next.plan[0].tasks;
      expect(tasks.find(t => t.id === '+2_Physics_1_P2').completed).toBe(true);
      expect(tasks.find(t => t.id === '+2_Physics_1_P1').completed).toBe(true);
      expect(next.xp).toBe(200);
    });

    it('1.2 +2 Chemistry: marking Part 2/2 complete automatically completes Part 1/2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Chemistry_5_P1', chapId: '+2_Chemistry_5', grade: '+2', subject: 'Chemistry', chapNumber: 5, chapterName: 'Coordination Compounds', part: 1, totalParts: 2, completed: false },
            { id: '+2_Chemistry_5_P2', chapId: '+2_Chemistry_5', grade: '+2', subject: 'Chemistry', chapNumber: 5, chapterName: 'Coordination Compounds', part: 2, totalParts: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Chemistry_5_P2', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(200);
    });

    it('1.3 +1 Mathematics: marking Part 2/2 complete automatically completes Part 1/2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+1_Mathematics_1_P1', chapId: '+1_Mathematics_1', grade: '+1', subject: 'Mathematics', chapNumber: 1, chapterName: 'Sets', part: 1, totalParts: 2, completed: false },
            { id: '+1_Mathematics_1_P2', chapId: '+1_Mathematics_1', grade: '+1', subject: 'Mathematics', chapNumber: 1, chapterName: 'Sets', part: 2, totalParts: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+1_Mathematics_1_P2', storage, defaultOptions);

      expect(next.plan[0].tasks.find(t => t.id === '+1_Mathematics_1_P1').completed).toBe(true);
      expect(next.plan[0].tasks.find(t => t.id === '+1_Mathematics_1_P2').completed).toBe(true);
    });

    it('1.4 +2 Accountancy: marking Part 2/3 complete automatically completes Part 1/3', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Accountancy_1_P1', chapId: '+2_Accountancy_1', grade: '+2', subject: 'Accountancy', chapNumber: 1, chapterName: 'Accounting for Not-for-Profit Organisation', part: 1, totalParts: 3, completed: false },
            { id: '+2_Accountancy_1_P2', chapId: '+2_Accountancy_1', grade: '+2', subject: 'Accountancy', chapNumber: 1, chapterName: 'Accounting for Not-for-Profit Organisation', part: 2, totalParts: 3, completed: false },
            { id: '+2_Accountancy_1_P3', chapId: '+2_Accountancy_1', grade: '+2', subject: 'Accountancy', chapNumber: 1, chapterName: 'Accounting for Not-for-Profit Organisation', part: 3, totalParts: 3, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Accountancy_1_P2', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks.find(t => t.id === '+2_Accountancy_1_P1').completed).toBe(true);
      expect(tasks.find(t => t.id === '+2_Accountancy_1_P2').completed).toBe(true);
      expect(tasks.find(t => t.id === '+2_Accountancy_1_P3').completed).toBe(false);
      expect(next.xp).toBe(200);
    });

    it('1.5 +1 History: marking Part 2/2 complete automatically completes Part 1/2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+1_History_1_P1', chapId: '+1_History_1', grade: '+1', subject: 'History', chapNumber: 1, chapterName: 'Writing and City Life', part: 1, totalParts: 2, completed: false },
            { id: '+1_History_1_P2', chapId: '+1_History_1', grade: '+1', subject: 'History', chapNumber: 1, chapterName: 'Writing and City Life', part: 2, totalParts: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+1_History_1_P2', storage, defaultOptions);

      expect(next.plan[0].tasks.find(t => t.id === '+1_History_1_P1').completed).toBe(true);
      expect(next.plan[0].tasks.find(t => t.id === '+1_History_1_P2').completed).toBe(true);
    });

    it('1.6 +2 Computer Science: marking Part 2/2 complete automatically completes Part 1/2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Computer_Science_1_P1', chapId: '+2_Computer_Science_1', grade: '+2', subject: 'Computer Science', chapNumber: 1, chapterName: 'Structures and Pointers', part: 1, totalParts: 2, completed: false },
            { id: '+2_Computer_Science_1_P2', chapId: '+2_Computer_Science_1', grade: '+2', subject: 'Computer Science', chapNumber: 1, chapterName: 'Structures and Pointers', part: 2, totalParts: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Computer_Science_1_P2', storage, defaultOptions);

      expect(next.plan[0].tasks.find(t => t.id === '+2_Computer_Science_1_P1').completed).toBe(true);
      expect(next.plan[0].tasks.find(t => t.id === '+2_Computer_Science_1_P2').completed).toBe(true);
    });

    it('1.7 +1 Political Science: marking Part 2/2 complete automatically completes Part 1/2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+1_Political_Science_1_P1', chapId: '+1_Political_Science_1', grade: '+1', subject: 'Political Science', chapNumber: 1, chapterName: 'Constitution: Why and How?', part: 1, totalParts: 2, completed: false },
            { id: '+1_Political_Science_1_P2', chapId: '+1_Political_Science_1', grade: '+1', subject: 'Political Science', chapNumber: 1, chapterName: 'Constitution: Why and How?', part: 2, totalParts: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+1_Political_Science_1_P2', storage, defaultOptions);

      expect(next.plan[0].tasks.find(t => t.id === '+1_Political_Science_1_P1').completed).toBe(true);
      expect(next.plan[0].tasks.find(t => t.id === '+1_Political_Science_1_P2').completed).toBe(true);
    });
  });

  describe('Feature 2: Marking Part 3 completes Parts 1 and 2 automatically', () => {
    it('2.1 +2 Physics Current Electricity (3 parts): marking Part 3 completes Parts 1 and 2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Physics_3_P1', chapId: '+2_Physics_3', grade: '+2', subject: 'Physics', chapNumber: 3, chapterName: 'Current Electricity', part: 1, totalParts: 3, completed: false },
            { id: '+2_Physics_3_P2', chapId: '+2_Physics_3', grade: '+2', subject: 'Physics', chapNumber: 3, chapterName: 'Current Electricity', part: 2, totalParts: 3, completed: false },
            { id: '+2_Physics_3_P3', chapId: '+2_Physics_3', grade: '+2', subject: 'Physics', chapNumber: 3, chapterName: 'Current Electricity', part: 3, totalParts: 3, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Physics_3_P3', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(300);
    });

    it('2.2 +2 Mathematics Matrices (3 parts): marking Part 3 completes Parts 1 and 2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Mathematics_3_P1', chapId: '+2_Mathematics_3', grade: '+2', subject: 'Mathematics', chapNumber: 3, chapterName: 'Matrices', part: 1, totalParts: 3, completed: false },
            { id: '+2_Mathematics_3_P2', chapId: '+2_Mathematics_3', grade: '+2', subject: 'Mathematics', chapNumber: 3, chapterName: 'Matrices', part: 2, totalParts: 3, completed: false },
            { id: '+2_Mathematics_3_P3', chapId: '+2_Mathematics_3', grade: '+2', subject: 'Mathematics', chapNumber: 3, chapterName: 'Matrices', part: 3, totalParts: 3, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Mathematics_3_P3', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(300);
    });

    it('2.3 +1 Chemistry Classification of Elements (3 parts): marking Part 3 completes Parts 1 and 2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+1_Chemistry_3_P1', chapId: '+1_Chemistry_3', grade: '+1', subject: 'Chemistry', chapNumber: 3, chapterName: 'Classification of Elements', part: 1, totalParts: 3, completed: false },
            { id: '+1_Chemistry_3_P2', chapId: '+1_Chemistry_3', grade: '+1', subject: 'Chemistry', chapNumber: 3, chapterName: 'Classification of Elements', part: 2, totalParts: 3, completed: false },
            { id: '+1_Chemistry_3_P3', chapId: '+1_Chemistry_3', grade: '+1', subject: 'Chemistry', chapNumber: 3, chapterName: 'Classification of Elements', part: 3, totalParts: 3, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+1_Chemistry_3_P3', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(300);
    });

    it('2.4 +2 Accountancy Reconstitution of Partnership (3 parts): marking Part 3 completes Parts 1 and 2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Accountancy_2_P1', chapId: '+2_Accountancy_2', grade: '+2', subject: 'Accountancy', chapNumber: 2, chapterName: 'Reconstitution of a Partnership Firm', part: 1, totalParts: 3, completed: false },
            { id: '+2_Accountancy_2_P2', chapId: '+2_Accountancy_2', grade: '+2', subject: 'Accountancy', chapNumber: 2, chapterName: 'Reconstitution of a Partnership Firm', part: 2, totalParts: 3, completed: false },
            { id: '+2_Accountancy_2_P3', chapId: '+2_Accountancy_2', grade: '+2', subject: 'Accountancy', chapNumber: 2, chapterName: 'Reconstitution of a Partnership Firm', part: 3, totalParts: 3, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Accountancy_2_P3', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(300);
    });

    it('2.5 +1 Economics Indian Economy (3 parts): marking Part 3 completes Parts 1 and 2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+1_Economics_1_P1', chapId: '+1_Economics_1', grade: '+1', subject: 'Economics', chapNumber: 1, chapterName: 'Indian Economy on Eve of Independence', part: 1, totalParts: 3, completed: false },
            { id: '+1_Economics_1_P2', chapId: '+1_Economics_1', grade: '+1', subject: 'Economics', chapNumber: 1, chapterName: 'Indian Economy on Eve of Independence', part: 2, totalParts: 3, completed: false },
            { id: '+1_Economics_1_P3', chapId: '+1_Economics_1', grade: '+1', subject: 'Economics', chapNumber: 1, chapterName: 'Indian Economy on Eve of Independence', part: 3, totalParts: 3, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+1_Economics_1_P3', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(300);
    });

    it('2.6 +2 Zoology Human Reproduction (3 parts): marking Part 3 completes Parts 1 and 2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Zoology_2_P1', chapId: '+2_Zoology_2', grade: '+2', subject: 'Zoology', chapNumber: 2, chapterName: 'Human Reproduction', part: 1, totalParts: 3, completed: false },
            { id: '+2_Zoology_2_P2', chapId: '+2_Zoology_2', grade: '+2', subject: 'Zoology', chapNumber: 2, chapterName: 'Human Reproduction', part: 2, totalParts: 3, completed: false },
            { id: '+2_Zoology_2_P3', chapId: '+2_Zoology_2', grade: '+2', subject: 'Zoology', chapNumber: 2, chapterName: 'Human Reproduction', part: 3, totalParts: 3, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Zoology_2_P3', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(300);
    });
  });

  describe('Feature 3: Unchecking Part 1 unchecks subsequent parts automatically', () => {
    it('3.1 3-part chapter with all complete: unchecking Part 1 unchecks Parts 2 and 3', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'CHP_1_P1', chapId: 'CHP_1', part: 1, totalParts: 3, completed: true },
              { id: 'CHP_1_P2', chapId: 'CHP_1', part: 2, totalParts: 3, completed: true },
              { id: 'CHP_1_P3', chapId: 'CHP_1', part: 3, totalParts: 3, completed: true },
            ],
          },
        ],
        { xp: 300 }
      );

      const next = persistTaskCompletion(state, 'CHP_1_P1', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => !t.completed)).toBe(true);
      expect(next.xp).toBe(0);
    });

    it('3.2 2-part chapter with all complete: unchecking Part 1 unchecks Part 2', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: '+2_Physics_1_P1', chapId: '+2_Physics_1', part: 1, completed: true },
              { id: '+2_Physics_1_P2', chapId: '+2_Physics_1', part: 2, completed: true },
            ],
          },
        ],
        { xp: 200 }
      );

      const next = persistTaskCompletion(state, '+2_Physics_1_P1', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => !t.completed)).toBe(true);
      expect(next.xp).toBe(0);
    });

    it('3.3 +2 Chemistry Coordination Compounds: unchecking Part 1 unchecks Part 2', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: '+2_Chemistry_5_P1', chapId: '+2_Chemistry_5', part: 1, completed: true },
              { id: '+2_Chemistry_5_P2', chapId: '+2_Chemistry_5', part: 2, completed: true },
            ],
          },
        ],
        { xp: 500 }
      );

      const next = persistTaskCompletion(state, '+2_Chemistry_5_P1', storage, defaultOptions);

      expect(next.plan[0].tasks.find(t => t.id === '+2_Chemistry_5_P1').completed).toBe(false);
      expect(next.plan[0].tasks.find(t => t.id === '+2_Chemistry_5_P2').completed).toBe(false);
      expect(next.xp).toBe(300);
    });

    it('3.4 +1 Physics Units and Measurements: unchecking Part 1 unchecks Part 2', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: '+1_Physics_1_P1', chapId: '+1_Physics_1', part: 1, completed: true },
              { id: '+1_Physics_1_P2', chapId: '+1_Physics_1', part: 2, completed: true },
            ],
          },
        ],
        { xp: 200 }
      );

      const next = persistTaskCompletion(state, '+1_Physics_1_P1', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => !t.completed)).toBe(true);
      expect(next.xp).toBe(0);
    });

    it('3.5 +2 Business Studies Principles of Management: unchecking Part 1 unchecks Part 2', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: '+2_Business_Studies_2_P1', chapId: '+2_Business_Studies_2', part: 1, completed: true },
              { id: '+2_Business_Studies_2_P2', chapId: '+2_Business_Studies_2', part: 2, completed: true },
            ],
          },
        ],
        { xp: 400 }
      );

      const next = persistTaskCompletion(state, '+2_Business_Studies_2_P1', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => !t.completed)).toBe(true);
      expect(next.xp).toBe(200);
    });

    it('3.6 +2 Mathematics 4-part chapter: unchecking Part 1 unchecks Parts 2, 3, and 4', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: '+2_Mathematics_7_P1', chapId: '+2_Mathematics_7', part: 1, completed: true },
              { id: '+2_Mathematics_7_P2', chapId: '+2_Mathematics_7', part: 2, completed: true },
              { id: '+2_Mathematics_7_P3', chapId: '+2_Mathematics_7', part: 3, completed: true },
              { id: '+2_Mathematics_7_P4', chapId: '+2_Mathematics_7', part: 4, completed: true },
            ],
          },
        ],
        { xp: 800 }
      );

      const next = persistTaskCompletion(state, '+2_Mathematics_7_P1', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => !t.completed)).toBe(true);
      expect(next.xp).toBe(400);
    });
  });

  describe('Feature 4: Unchecking Part 2 unchecks subsequent parts while preserving Part 1', () => {
    it('4.1 3-part chapter with all complete: unchecking Part 2 unchecks Part 3 but keeps Part 1 complete', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'CHP_P1', chapId: 'CHP', part: 1, completed: true },
              { id: 'CHP_P2', chapId: 'CHP', part: 2, completed: true },
              { id: 'CHP_P3', chapId: 'CHP', part: 3, completed: true },
            ],
          },
        ],
        { xp: 500 }
      );

      const next = persistTaskCompletion(state, 'CHP_P2', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks.find(t => t.id === 'CHP_P1').completed).toBe(true);
      expect(tasks.find(t => t.id === 'CHP_P2').completed).toBe(false);
      expect(tasks.find(t => t.id === 'CHP_P3').completed).toBe(false);
      expect(next.xp).toBe(300);
    });

    it('4.2 4-part chapter with all complete: unchecking Part 2 unchecks Parts 3 and 4, keeps Part 1 complete', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'M4_P1', chapId: 'M4', part: 1, completed: true },
              { id: 'M4_P2', chapId: 'M4', part: 2, completed: true },
              { id: 'M4_P3', chapId: 'M4', part: 3, completed: true },
              { id: 'M4_P4', chapId: 'M4', part: 4, completed: true },
            ],
          },
        ],
        { xp: 600 }
      );

      const next = persistTaskCompletion(state, 'M4_P2', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks.find(t => t.id === 'M4_P1').completed).toBe(true);
      expect(tasks.find(t => t.id === 'M4_P2').completed).toBe(false);
      expect(tasks.find(t => t.id === 'M4_P3').completed).toBe(false);
      expect(tasks.find(t => t.id === 'M4_P4').completed).toBe(false);
      expect(next.xp).toBe(300);
    });

    it('4.3 4-part chapter with all complete: unchecking Part 3 unchecks Part 4, keeps Parts 1 and 2 complete', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'M4_P1', chapId: 'M4', part: 1, completed: true },
              { id: 'M4_P2', chapId: 'M4', part: 2, completed: true },
              { id: 'M4_P3', chapId: 'M4', part: 3, completed: true },
              { id: 'M4_P4', chapId: 'M4', part: 4, completed: true },
            ],
          },
        ],
        { xp: 700 }
      );

      const next = persistTaskCompletion(state, 'M4_P3', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks.find(t => t.id === 'M4_P1').completed).toBe(true);
      expect(tasks.find(t => t.id === 'M4_P2').completed).toBe(true);
      expect(tasks.find(t => t.id === 'M4_P3').completed).toBe(false);
      expect(tasks.find(t => t.id === 'M4_P4').completed).toBe(false);
      expect(next.xp).toBe(500);
    });

    it('4.4 3-part chapter with Parts 1 and 2 complete, Part 3 incomplete: unchecking Part 2 preserves Part 1', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'C_P1', chapId: 'C', part: 1, completed: true },
              { id: 'C_P2', chapId: 'C', part: 2, completed: true },
              { id: 'C_P3', chapId: 'C', part: 3, completed: false },
            ],
          },
        ],
        { xp: 200 }
      );

      const next = persistTaskCompletion(state, 'C_P2', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks.find(t => t.id === 'C_P1').completed).toBe(true);
      expect(tasks.find(t => t.id === 'C_P2').completed).toBe(false);
      expect(tasks.find(t => t.id === 'C_P3').completed).toBe(false);
      expect(next.xp).toBe(100);
    });

    it('4.5 +2 Accountancy: unchecking Part 2 preserves Part 1 and unchecks Part 3', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: '+2_Accountancy_1_P1', chapId: '+2_Accountancy_1', part: 1, completed: true },
              { id: '+2_Accountancy_1_P2', chapId: '+2_Accountancy_1', part: 2, completed: true },
              { id: '+2_Accountancy_1_P3', chapId: '+2_Accountancy_1', part: 3, completed: true },
            ],
          },
        ],
        { xp: 300 }
      );

      const next = persistTaskCompletion(state, '+2_Accountancy_1_P2', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks.find(t => t.id === '+2_Accountancy_1_P1').completed).toBe(true);
      expect(tasks.find(t => t.id === '+2_Accountancy_1_P2').completed).toBe(false);
      expect(tasks.find(t => t.id === '+2_Accountancy_1_P3').completed).toBe(false);
      expect(next.xp).toBe(100);
    });

    it('4.6 +1 History 3-part chapter: unchecking Part 2 preserves Part 1 and unchecks Part 3', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: '+1_History_2_P1', chapId: '+1_History_2', part: 1, completed: true },
              { id: '+1_History_2_P2', chapId: '+1_History_2', part: 2, completed: true },
              { id: '+1_History_2_P3', chapId: '+1_History_2', part: 3, completed: true },
            ],
          },
        ],
        { xp: 400 }
      );

      const next = persistTaskCompletion(state, '+1_History_2_P2', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks.find(t => t.id === '+1_History_2_P1').completed).toBe(true);
      expect(tasks.find(t => t.id === '+1_History_2_P2').completed).toBe(false);
      expect(tasks.find(t => t.id === '+1_History_2_P3').completed).toBe(false);
      expect(next.xp).toBe(200);
    });
  });

  describe('Feature 5: Dynamic Chapter Key Extraction (getTaskChapterKey)', () => {
    it('5.1 extracts canonical chapId directly when present', () => {
      expect(getTaskChapterKey({ chapId: '+2_Physics_1', id: 'some_id' })).toBe('+2_Physics_1');
      expect(getTaskChapterKey({ chapId: '+1_Chemistry_5' })).toBe('+1_Chemistry_5');
    });

    it('5.2 fallback extracts prefix before _P\\d+$ from task.id', () => {
      expect(getTaskChapterKey({ id: '+2_Physics_1_P2' })).toBe('+2_Physics_1');
      expect(getTaskChapterKey({ id: 'TASK_COMMERCE_ACC_CH2_P3' })).toBe('TASK_COMMERCE_ACC_CH2');
    });

    it('5.3 fallback generates composite key ___', () => {
      expect(getTaskChapterKey({ grade: '+2', subject: 'Physics', chapNumber: 4 })).toBe('+2_Physics_4');
      expect(getTaskChapterKey({ grade: '+1', subject: 'History', chapNumber: 2 })).toBe('+1_History_2');
    });

    it('5.4 fallback generates composite key with chapterName if chapNumber is absent', () => {
      expect(getTaskChapterKey({ grade: '+2', subject: 'Chemistry', chapterName: 'Solutions' })).toBe('+2_Chemistry_Solutions');
    });

    it('5.5 isolates revision tasks by returning null', () => {
      expect(getTaskChapterKey({ isRevision: true, chapId: '+2_Physics_1', id: 'REV_1' })).toBeNull();
    });

    it('5.6 isolates exam eve tasks by returning null', () => {
      expect(getTaskChapterKey({ isExamEveTask: true, chapId: '+2_Physics_1', id: 'EXAM_EVE_1' })).toBeNull();
    });

    it('5.7 isolates spaced retrieval tasks by returning null', () => {
      expect(getTaskChapterKey({ isSpacedRetrieval: true, chapId: '+2_Physics_1' })).toBeNull();
    });

    it('5.8 isolates forgetting curve reviews by returning null', () => {
      expect(getTaskChapterKey({ isForgettingCurveReview: true, chapId: '+2_Physics_1' })).toBeNull();
    });

    it('5.9 isolates model exam tasks by returning null', () => {
      expect(getTaskChapterKey({ isModelExam: true, chapId: '+2_Physics_1' })).toBeNull();
    });

    it('5.10 returns null safely for null, undefined, empty, or non-object task', () => {
      expect(getTaskChapterKey(null)).toBeNull();
      expect(getTaskChapterKey(undefined)).toBeNull();
      expect(getTaskChapterKey({})).toBeNull();
      expect(getTaskChapterKey('string_task')).toBeNull();
    });
  });

  describe('Feature 6: Dynamic Part Number Extraction (getTaskPartNumber)', () => {
    it('6.1 extracts exact numeric part property', () => {
      expect(getTaskPartNumber({ part: 1 })).toBe(1);
      expect(getTaskPartNumber({ part: 2 })).toBe(2);
      expect(getTaskPartNumber({ part: 3 })).toBe(3);
    });

    it('6.2 parses numeric string part property to integer', () => {
      expect(getTaskPartNumber({ part: '2' })).toBe(2);
      expect(getTaskPartNumber({ part: '4' })).toBe(4);
    });

    it('6.3 fallback extracts part from task.id with _P(\\d+) pattern', () => {
      expect(getTaskPartNumber({ id: '+2_Physics_1_P2' })).toBe(2);
      expect(getTaskPartNumber({ id: 'TASK_CH5_P3' })).toBe(3);
    });

    it('6.4 fallback extracts part from English topicTitle pattern Part (\\d+)', () => {
      expect(getTaskPartNumber({ topicTitle: 'Part 2: Gauss Law Applications' })).toBe(2);
      expect(getTaskPartNumber({ topicTitle: 'Part 3/3 (Full Chapter): PYQs' })).toBe(3);
    });

    it('6.5 fallback extracts part from Malayalam topicTitle pattern ഭാഗം (\\d+)', () => {
      expect(getTaskPartNumber({ topicTitle: 'ഭാഗം 1: അടിസ്ഥാന ആശയങ്ങൾ' })).toBe(1);
      expect(getTaskPartNumber({ topicTitle: 'ഭാഗം 2: മുൻവർഷ ചോദ്യങ്ങൾ' })).toBe(2);
    });

    it('6.6 fallback extracts part from chapterName when present', () => {
      expect(getTaskPartNumber({ chapterName: 'Integrals Part 4' })).toBe(4);
    });

    it('6.7 fallback extracts part from title property when present', () => {
      expect(getTaskPartNumber({ title: 'ഭാഗം 3: അദ്ധ്യായം സംഗ്രഹം' })).toBe(3);
    });

    it('6.8 handles case-insensitive part patterns (part 2, PART 3)', () => {
      expect(getTaskPartNumber({ topicTitle: 'part 2: practice' })).toBe(2);
      expect(getTaskPartNumber({ topicTitle: 'PART 3: ADVANCED' })).toBe(3);
    });

    it('6.9 defaults safely to 1 when no part identifier exists', () => {
      expect(getTaskPartNumber({ id: 'generic_task', topicTitle: 'Full Chapter Review' })).toBe(1);
    });

    it('6.10 defaults safely to 1 for null, undefined, or empty task', () => {
      expect(getTaskPartNumber(null)).toBe(1);
      expect(getTaskPartNumber(undefined)).toBe(1);
      expect(getTaskPartNumber({})).toBe(1);
    });
  });
});

describe('Tier 2: Boundary & Corner Cases', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe('Boundary 1: Single-Part Chapter Isolation', () => {
    it('B1.1 single-part chapter checked completes independently with +100 XP', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Physics_12_P1', chapId: '+2_Physics_12', part: 1, totalParts: 1, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Physics_12_P1', storage, defaultOptions);

      expect(next.plan[0].tasks[0].completed).toBe(true);
      expect(next.xp).toBe(100);
    });

    it('B1.2 single-part chapter unchecked uncompletes independently with -100 XP', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: '+2_Physics_12_P1', chapId: '+2_Physics_12', part: 1, totalParts: 1, completed: true },
            ],
          },
        ],
        { xp: 200 }
      );

      const next = persistTaskCompletion(state, '+2_Physics_12_P1', storage, defaultOptions);

      expect(next.plan[0].tasks[0].completed).toBe(false);
      expect(next.xp).toBe(100);
    });

    it('B1.3 two different single-part chapters on same day: checking one does not touch the other', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Physics_12_P1', chapId: '+2_Physics_12', part: 1, totalParts: 1, completed: false },
            { id: '+2_Chemistry_10_P1', chapId: '+2_Chemistry_10', part: 1, totalParts: 1, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Physics_12_P1', storage, defaultOptions);

      expect(next.plan[0].tasks[0].completed).toBe(true);
      expect(next.plan[0].tasks[1].completed).toBe(false);
      expect(next.xp).toBe(100);
    });

    it('B1.4 single-part chapter on Day 1 does not affect single-part chapter on Day 2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [{ id: 'CH1_P1', chapId: 'CH1', part: 1, completed: false }],
        },
        {
          date: '2026-10-22',
          tasks: [{ id: 'CH2_P1', chapId: 'CH2', part: 1, completed: false }],
        },
      ]);

      const next = persistTaskCompletion(state, 'CH1_P1', storage, defaultOptions);

      expect(next.plan[0].tasks[0].completed).toBe(true);
      expect(next.plan[1].tasks[0].completed).toBe(false);
      expect(next.xp).toBe(100);
    });

    it('B1.5 single-part task without explicit part property defaults to part 1 without error', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [{ id: 'TASK_STANDALONE', chapId: 'CH_STANDALONE', completed: false }],
        },
      ]);

      const next = persistTaskCompletion(state, 'TASK_STANDALONE', storage, defaultOptions);

      expect(next.plan[0].tasks[0].completed).toBe(true);
      expect(next.xp).toBe(100);
    });
  });

  describe('Boundary 2: 4-Part Chapter Handling', () => {
    const make4PartPlan = (initialCompleted = [false, false, false, false], xp = 0) =>
      makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'MATH_INT_P1', chapId: 'MATH_INT', part: 1, totalParts: 4, completed: initialCompleted[0] },
              { id: 'MATH_INT_P2', chapId: 'MATH_INT', part: 2, totalParts: 4, completed: initialCompleted[1] },
              { id: 'MATH_INT_P3', chapId: 'MATH_INT', part: 3, totalParts: 4, completed: initialCompleted[2] },
              { id: 'MATH_INT_P4', chapId: 'MATH_INT', part: 4, totalParts: 4, completed: initialCompleted[3] },
            ],
          },
        ],
        { xp }
      );

    it('B2.1 checking Part 4 marks Parts 1, 2, and 3 complete in a single atomic transaction', () => {
      const state = make4PartPlan([false, false, false, false], 0);
      const next = persistTaskCompletion(state, 'MATH_INT_P4', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(400);
    });

    it('B2.2 checking Part 3 marks Parts 1 and 2 complete, leaves Part 4 incomplete', () => {
      const state = make4PartPlan([false, false, false, false], 0);
      const next = persistTaskCompletion(state, 'MATH_INT_P3', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks[0].completed).toBe(true);
      expect(tasks[1].completed).toBe(true);
      expect(tasks[2].completed).toBe(true);
      expect(tasks[3].completed).toBe(false);
      expect(next.xp).toBe(300);
    });

    it('B2.3 checking Part 2 marks Part 1 complete, leaves Parts 3 and 4 incomplete', () => {
      const state = make4PartPlan([false, false, false, false], 0);
      const next = persistTaskCompletion(state, 'MATH_INT_P2', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks[0].completed).toBe(true);
      expect(tasks[1].completed).toBe(true);
      expect(tasks[2].completed).toBe(false);
      expect(tasks[3].completed).toBe(false);
      expect(next.xp).toBe(200);
    });

    it('B2.4 unchecking Part 1 from all complete unchecks Parts 2, 3, and 4', () => {
      const state = make4PartPlan([true, true, true, true], 400);
      const next = persistTaskCompletion(state, 'MATH_INT_P1', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => !t.completed)).toBe(true);
      expect(next.xp).toBe(0);
    });

    it('B2.5 unchecking Part 2 from all complete preserves Part 1 complete and unchecks Parts 3 and 4', () => {
      const state = make4PartPlan([true, true, true, true], 400);
      const next = persistTaskCompletion(state, 'MATH_INT_P2', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks[0].completed).toBe(true);
      expect(tasks[1].completed).toBe(false);
      expect(tasks[2].completed).toBe(false);
      expect(tasks[3].completed).toBe(false);
      expect(next.xp).toBe(100);
    });

    it('B2.6 unchecking Part 3 from all complete preserves Parts 1 and 2 complete and unchecks Part 4', () => {
      const state = make4PartPlan([true, true, true, true], 400);
      const next = persistTaskCompletion(state, 'MATH_INT_P3', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks[0].completed).toBe(true);
      expect(tasks[1].completed).toBe(true);
      expect(tasks[2].completed).toBe(false);
      expect(tasks[3].completed).toBe(false);
      expect(next.xp).toBe(200);
    });
  });

  describe('Boundary 3: Non-Learning Task Isolation', () => {
    it('B3.1 revision day task (isRevision: true) does not cascade to syllabus parts', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Physics_1_P1', chapId: '+2_Physics_1', part: 1, completed: false },
            { id: '+2_Physics_1_P2', chapId: '+2_Physics_1', part: 2, completed: false },
            { id: 'REV_DAY_1_PHY', subject: 'Physics', isRevision: true, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, 'REV_DAY_1_PHY', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks.find(t => t.id === 'REV_DAY_1_PHY').completed).toBe(true);
      expect(tasks.find(t => t.id === '+2_Physics_1_P1').completed).toBe(false);
      expect(tasks.find(t => t.id === '+2_Physics_1_P2').completed).toBe(false);
      expect(next.xp).toBe(100);
    });

    it('B3.2 exam eve task (isExamEveTask: true) does not cascade to syllabus parts', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Chemistry_1_P1', chapId: '+2_Chemistry_1', part: 1, completed: false },
            { id: 'EXAM_EVE_CHEM', subject: 'Chemistry', isExamEveTask: true, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, 'EXAM_EVE_CHEM', storage, defaultOptions);

      expect(next.plan[0].tasks.find(t => t.id === 'EXAM_EVE_CHEM').completed).toBe(true);
      expect(next.plan[0].tasks.find(t => t.id === '+2_Chemistry_1_P1').completed).toBe(false);
      expect(next.xp).toBe(100);
    });

    it('B3.3 spaced retrieval task (isSpacedRetrieval: true) is quarantined from cascades', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+1_Biology_1_P1', chapId: '+1_Biology_1', part: 1, completed: false },
            { id: 'SPACED_RET_BIO', subject: 'Biology', isSpacedRetrieval: true, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, 'SPACED_RET_BIO', storage, defaultOptions);

      expect(next.plan[0].tasks.find(t => t.id === 'SPACED_RET_BIO').completed).toBe(true);
      expect(next.plan[0].tasks.find(t => t.id === '+1_Biology_1_P1').completed).toBe(false);
    });

    it('B3.4 forgetting curve review task (isForgettingCurveReview: true) is quarantined', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Math_2_P1', chapId: '+2_Math_2', part: 1, completed: false },
            { id: 'FC_REVIEW_MATH', isForgettingCurveReview: true, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, 'FC_REVIEW_MATH', storage, defaultOptions);

      expect(next.plan[0].tasks.find(t => t.id === 'FC_REVIEW_MATH').completed).toBe(true);
      expect(next.plan[0].tasks.find(t => t.id === '+2_Math_2_P1').completed).toBe(false);
    });

    it('B3.5 model exam task (isModelExam: true) is quarantined', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Acc_1_P1', chapId: '+2_Acc_1', part: 1, completed: false },
            { id: 'MODEL_EXAM_ACC', isModelExam: true, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, 'MODEL_EXAM_ACC', storage, defaultOptions);

      expect(next.plan[0].tasks.find(t => t.id === 'MODEL_EXAM_ACC').completed).toBe(true);
      expect(next.plan[0].tasks.find(t => t.id === '+2_Acc_1_P1').completed).toBe(false);
    });

    it('B3.6 non-learning task with chapId property still returns null from getTaskChapterKey', () => {
      const revTask = { id: 'REV_PHY', chapId: '+2_Physics_1', isRevision: true };
      expect(getTaskChapterKey(revTask)).toBeNull();
    });
  });

  describe('Boundary 4: Missing Part Property Fallback', () => {
    it('B4.1 task without part property but with _P2 in id is treated as part 2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: 'CHP_X_P1', chapId: 'CHP_X', completed: false },
            { id: 'CHP_X_P2', chapId: 'CHP_X', completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, 'CHP_X_P2', storage, defaultOptions);

      expect(next.plan[0].tasks[0].completed).toBe(true);
      expect(next.plan[0].tasks[1].completed).toBe(true);
      expect(next.xp).toBe(200);
    });

    it('B4.2 task with part: undefined and topicTitle Part 3 is treated as part 3', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: 'TASK_A', chapId: 'CHP_Y', part: 1, completed: false },
            { id: 'TASK_B', chapId: 'CHP_Y', part: 2, completed: false },
            { id: 'TASK_C', chapId: 'CHP_Y', topicTitle: 'Part 3: PYQ Sprint', completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, 'TASK_C', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(300);
    });

    it('B4.3 task with Malayalam ഭാഗം 2 in topicTitle correctly cascades Part 1', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: 'ML_T1', chapId: 'CHP_ML', topicTitle: 'ഭാഗം 1: സിദ്ധാന്തങ്ങൾ', completed: false },
            { id: 'ML_T2', chapId: 'CHP_ML', topicTitle: 'ഭാഗം 2: പ്രശ്നങ്ങൾ', completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, 'ML_T2', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(200);
    });

    it('B4.4 string part property 3 is parsed and correctly cascades parts 1 and 2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: 'STR_P1', chapId: 'CHP_S', part: '1', completed: false },
            { id: 'STR_P2', chapId: 'CHP_S', part: '2', completed: false },
            { id: 'STR_P3', chapId: 'CHP_S', part: '3', completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, 'STR_P3', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(300);
    });

    it('B4.5 task with zero part metadata defaults to part 1 without throwing', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [{ id: 'BARE_TASK', chapId: 'BARE_CHAP', completed: false }],
        },
      ]);

      expect(() => persistTaskCompletion(state, 'BARE_TASK', storage, defaultOptions)).not.toThrow();
    });
  });

  describe('Boundary 5: Idempotency & Partial Completion', () => {
    it('B5.1 Part 1 already complete: checking Part 2 keeps Part 1 complete and awards +100 XP (netDelta = 1)', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'IDEMP_P1', chapId: 'IDEMP', part: 1, completed: true },
              { id: 'IDEMP_P2', chapId: 'IDEMP', part: 2, completed: false },
            ],
          },
        ],
        { xp: 100 }
      );

      const next = persistTaskCompletion(state, 'IDEMP_P2', storage, defaultOptions);

      expect(next.plan[0].tasks[0].completed).toBe(true);
      expect(next.plan[0].tasks[1].completed).toBe(true);
      expect(next.xp).toBe(200);
    });

    it('B5.2 Parts 1 & 2 already complete: checking Part 3 keeps them complete and awards +100 XP', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'IDEMP3_P1', chapId: 'IDEMP3', part: 1, completed: true },
              { id: 'IDEMP3_P2', chapId: 'IDEMP3', part: 2, completed: true },
              { id: 'IDEMP3_P3', chapId: 'IDEMP3', part: 3, completed: false },
            ],
          },
        ],
        { xp: 200 }
      );

      const next = persistTaskCompletion(state, 'IDEMP3_P3', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(300);
    });

    it('B5.3 out-of-order partial: Part 1 and Part 3 complete, Part 2 toggled complete adds exactly +100 XP', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'OO_P1', chapId: 'OO', part: 1, completed: true },
              { id: 'OO_P2', chapId: 'OO', part: 2, completed: false },
              { id: 'OO_P3', chapId: 'OO', part: 3, completed: true },
            ],
          },
        ],
        { xp: 200 }
      );

      const next = persistTaskCompletion(state, 'OO_P2', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(next.xp).toBe(300);
    });

    it('B5.4 toggling Part 1 on and off returns exactly to initial state', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'TOG_P1', chapId: 'TOG', part: 1, completed: false },
              { id: 'TOG_P2', chapId: 'TOG', part: 2, completed: false },
            ],
          },
        ],
        { xp: 0 }
      );

      const step1 = persistTaskCompletion(state, 'TOG_P2', storage, defaultOptions);
      expect(step1.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(step1.xp).toBe(200);

      const step2 = persistTaskCompletion(step1, 'TOG_P1', storage, defaultOptions);
      expect(step2.plan[0].tasks.every(t => !t.completed)).toBe(true);
      expect(step2.xp).toBe(0);
    });

    it('B5.5 double toggle on single part maintains correct completed state', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [{ id: 'DBL_P1', chapId: 'DBL', part: 1, completed: false }],
          },
        ],
        { xp: 100 }
      );

      const afterCheck = persistTaskCompletion(state, 'DBL_P1', storage, defaultOptions);
      expect(afterCheck.plan[0].tasks[0].completed).toBe(true);
      expect(afterCheck.xp).toBe(200);

      const afterUncheck = persistTaskCompletion(afterCheck, 'DBL_P1', storage, defaultOptions);
      expect(afterUncheck.plan[0].tasks[0].completed).toBe(false);
      expect(afterUncheck.xp).toBe(100);
    });
  });

  describe('Boundary 6: Zero XP Floor on Uncheck', () => {
    it('B6.1 initial XP = 0: unchecking completed task keeps XP floored at 0', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [{ id: 'FLOOR_P1', chapId: 'FLOOR', part: 1, completed: true }],
          },
        ],
        { xp: 0 }
      );

      const next = persistTaskCompletion(state, 'FLOOR_P1', storage, defaultOptions);

      expect(next.plan[0].tasks[0].completed).toBe(false);
      expect(next.xp).toBe(0);
    });

    it('B6.2 initial XP = 50: unchecking 2 parts floors XP at exactly 0', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'FL2_P1', chapId: 'FL2', part: 1, completed: true },
              { id: 'FL2_P2', chapId: 'FL2', part: 2, completed: true },
            ],
          },
        ],
        { xp: 50 }
      );

      const next = persistTaskCompletion(state, 'FL2_P1', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => !t.completed)).toBe(true);
      expect(next.xp).toBe(0);
    });

    it('B6.3 initial XP = 100: unchecking 3 parts floors XP at exactly 0', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'FL3_P1', chapId: 'FL3', part: 1, completed: true },
              { id: 'FL3_P2', chapId: 'FL3', part: 2, completed: true },
              { id: 'FL3_P3', chapId: 'FL3', part: 3, completed: true },
            ],
          },
        ],
        { xp: 100 }
      );

      const next = persistTaskCompletion(state, 'FL3_P1', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => !t.completed)).toBe(true);
      expect(next.xp).toBe(0);
    });

    it('B6.4 initial XP = 1000: unchecking 3 parts drops XP to exactly 700', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'FL4_P1', chapId: 'FL4', part: 1, completed: true },
              { id: 'FL4_P2', chapId: 'FL4', part: 2, completed: true },
              { id: 'FL4_P3', chapId: 'FL4', part: 3, completed: true },
            ],
          },
        ],
        { xp: 1000 }
      );

      const next = persistTaskCompletion(state, 'FL4_P1', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => !t.completed)).toBe(true);
      expect(next.xp).toBe(700);
    });
  });

  describe('Boundary 7: Non-Existent Tasks & State Immutability', () => {
    it('B7.1 non-existent taskId returns null and does not touch storage', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [{ id: 'VALID_1', completed: false }],
        },
      ]);

      const result = persistTaskCompletion(state, 'NON_EXISTENT_ID', storage, defaultOptions);

      expect(result).toBeNull();
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it('B7.2 null or undefined state returns null safely', () => {
      expect(persistTaskCompletion(null, 'ID', storage, defaultOptions)).toBeNull();
      expect(persistTaskCompletion(undefined, 'ID', storage, defaultOptions)).toBeNull();
      expect(persistTaskCompletion({}, 'ID', storage, defaultOptions)).toBeNull();
    });

    it('B7.3 state with empty plan array returns null safely', () => {
      expect(persistTaskCompletion({ plan: [] }, 'ID', storage, defaultOptions)).toBeNull();
    });

    it('B7.4 corrupt day or null task in plan does not throw', () => {
      const state = {
        xp: 0,
        plan: [
          null,
          { tasks: [null, { id: 'SURVIVING_TASK', chapId: 'C1', part: 1, completed: false }] },
        ],
      };

      expect(() => persistTaskCompletion(state, 'SURVIVING_TASK', storage, defaultOptions)).not.toThrow();
    });

    it('B7.5 state is never mutated in-place (strict immutability)', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: 'IMM_P1', chapId: 'IMM', part: 1, completed: false },
            { id: 'IMM_P2', chapId: 'IMM', part: 2, completed: false },
          ],
        },
      ]);

      const stateSnapshot = JSON.parse(JSON.stringify(state));
      const next = persistTaskCompletion(state, 'IMM_P2', storage, defaultOptions);

      expect(state).toEqual(stateSnapshot);
      expect(state).not.toBe(next);
      expect(state.plan).not.toBe(next.plan);
      expect(state.plan[0].tasks).not.toBe(next.plan[0].tasks);
    });
  });
});

describe('Tier 3: Cross-Feature Combinations', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe('Combination 1: Multi-Day Plan Traversal', () => {
    it('C1.1 parts distributed across Day 1, Day 3, and Day 5: checking Part 3 completes Parts 1 & 2', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          dayNumber: 1,
          tasks: [{ id: '+2_Physics_3_P1', chapId: '+2_Physics_3', part: 1, completed: false }],
        },
        {
          date: '2026-10-22',
          dayNumber: 2,
          tasks: [{ id: '+2_Chemistry_1_P1', chapId: '+2_Chemistry_1', part: 1, completed: false }],
        },
        {
          date: '2026-10-23',
          dayNumber: 3,
          tasks: [{ id: '+2_Physics_3_P2', chapId: '+2_Physics_3', part: 2, completed: false }],
        },
        {
          date: '2026-10-24',
          dayNumber: 4,
          tasks: [{ id: '+2_Chemistry_1_P2', chapId: '+2_Chemistry_1', part: 2, completed: false }],
        },
        {
          date: '2026-10-25',
          dayNumber: 5,
          tasks: [{ id: '+2_Physics_3_P3', chapId: '+2_Physics_3', part: 3, completed: false }],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Physics_3_P3', storage, defaultOptions);

      expect(next.plan[0].tasks[0].completed).toBe(true);
      expect(next.plan[2].tasks[0].completed).toBe(true);
      expect(next.plan[4].tasks[0].completed).toBe(true);

      expect(next.plan[1].tasks[0].completed).toBe(false);
      expect(next.plan[3].tasks[0].completed).toBe(false);
      expect(next.xp).toBe(300);
    });

    it('C1.2 unchecking Part 1 on Day 1 unchecks Part 2 on Day 3 across separate days', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            dayNumber: 1,
            tasks: [{ id: 'SEP_P1', chapId: 'SEP', part: 1, completed: true }],
          },
          {
            date: '2026-10-23',
            dayNumber: 3,
            tasks: [{ id: 'SEP_P2', chapId: 'SEP', part: 2, completed: true }],
          },
        ],
        { xp: 200 }
      );

      const next = persistTaskCompletion(state, 'SEP_P1', storage, defaultOptions);

      expect(next.plan[0].tasks[0].completed).toBe(false);
      expect(next.plan[1].tasks[0].completed).toBe(false);
      expect(next.xp).toBe(0);
    });

    it('C1.3 sibling parts separated by 10 days in a long schedule cascade identically', () => {
      const state = makePlanState([
        {
          date: '2026-10-01',
          dayNumber: 1,
          tasks: [{ id: 'LONG_P1', chapId: 'LONG', part: 1, completed: false }],
        },
        {
          date: '2026-10-11',
          dayNumber: 11,
          tasks: [{ id: 'LONG_P2', chapId: 'LONG', part: 2, completed: false }],
        },
      ]);

      const next = persistTaskCompletion(state, 'LONG_P2', storage, defaultOptions);

      expect(next.plan[0].tasks[0].completed).toBe(true);
      expect(next.plan[1].tasks[0].completed).toBe(true);
      expect(next.xp).toBe(200);
    });
  });

  describe('Combination 2: Streak Counting with Cascades', () => {
    it('C2.1 first task completed today advances streak from 5 to 6 even when 3 tasks complete in one click', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'STRK_P1', chapId: 'STRK', part: 1, completed: false },
              { id: 'STRK_P2', chapId: 'STRK', part: 2, completed: false },
              { id: 'STRK_P3', chapId: 'STRK', part: 3, completed: false },
            ],
          },
        ],
        { streakCount: 5, lastCompletedDate: '2026-10-20' }
      );

      const next = persistTaskCompletion(state, 'STRK_P3', storage, defaultOptions);

      expect(next.streakCount).toBe(6);
      expect(next.lastCompletedDate).toBe(defaultOptions.today);
    });

    it('C2.2 second task completion on same day preserves existing streak count', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'STRK_P1', chapId: 'STRK', part: 1, completed: true },
              { id: 'STRK_P2', chapId: 'STRK', part: 2, completed: false },
            ],
          },
        ],
        { streakCount: 6, lastCompletedDate: '2026-10-21' }
      );

      const next = persistTaskCompletion(state, 'STRK_P2', storage, defaultOptions);

      expect(next.streakCount).toBe(6);
      expect(next.lastCompletedDate).toBe('2026-10-21');
    });

    it('C2.3 task completion after a broken streak (gap day) resets streak to 1', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [{ id: 'GAP_P1', chapId: 'GAP', part: 1, completed: false }],
          },
        ],
        { streakCount: 14, lastCompletedDate: '2026-10-15' }
      );

      const next = persistTaskCompletion(state, 'GAP_P1', storage, defaultOptions);

      expect(next.streakCount).toBe(1);
      expect(next.lastCompletedDate).toBe(defaultOptions.today);
    });

    it('C2.4 unchecking tasks never decrements streak count or modifies lastCompletedDate', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'UNCH_P1', chapId: 'UNCH', part: 1, completed: true },
              { id: 'UNCH_P2', chapId: 'UNCH', part: 2, completed: true },
            ],
          },
        ],
        { streakCount: 7, lastCompletedDate: '2026-10-21', xp: 500 }
      );

      const next = persistTaskCompletion(state, 'UNCH_P1', storage, defaultOptions);

      expect(next.streakCount).toBe(7);
      expect(next.lastCompletedDate).toBe('2026-10-21');
      expect(next.xp).toBe(300);
    });
  });

  describe('Combination 3: Exact XP Delta Accounting', () => {
    it('C3.1 checking Part 3 when 1 & 2 are incomplete awards exactly +300 XP (netDelta = +3)', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'XPD_P1', chapId: 'XPD', part: 1, completed: false },
              { id: 'XPD_P2', chapId: 'XPD', part: 2, completed: false },
              { id: 'XPD_P3', chapId: 'XPD', part: 3, completed: false },
            ],
          },
        ],
        { xp: 50 }
      );

      const next = persistTaskCompletion(state, 'XPD_P3', storage, defaultOptions);
      expect(next.xp).toBe(350);
    });

    it('C3.2 checking Part 3 when Part 1 is already complete awards exactly +200 XP (netDelta = +2)', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'XPD2_P1', chapId: 'XPD2', part: 1, completed: true },
              { id: 'XPD2_P2', chapId: 'XPD2', part: 2, completed: false },
              { id: 'XPD2_P3', chapId: 'XPD2', part: 3, completed: false },
            ],
          },
        ],
        { xp: 150 }
      );

      const next = persistTaskCompletion(state, 'XPD2_P3', storage, defaultOptions);
      expect(next.xp).toBe(350);
    });

    it('C3.3 unchecking Part 1 when 1, 2, and 3 are complete deducts exactly -300 XP (netDelta = -3)', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'XPD3_P1', chapId: 'XPD3', part: 1, completed: true },
              { id: 'XPD3_P2', chapId: 'XPD3', part: 2, completed: true },
              { id: 'XPD3_P3', chapId: 'XPD3', part: 3, completed: true },
            ],
          },
        ],
        { xp: 600 }
      );

      const next = persistTaskCompletion(state, 'XPD3_P1', storage, defaultOptions);
      expect(next.xp).toBe(300);
    });

    it('C3.4 unchecking Part 2 when 1, 2, and 3 are complete deducts exactly -200 XP (netDelta = -2)', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            tasks: [
              { id: 'XPD4_P1', chapId: 'XPD4', part: 1, completed: true },
              { id: 'XPD4_P2', chapId: 'XPD4', part: 2, completed: true },
              { id: 'XPD4_P3', chapId: 'XPD4', part: 3, completed: true },
            ],
          },
        ],
        { xp: 600 }
      );

      const next = persistTaskCompletion(state, 'XPD4_P2', storage, defaultOptions);
      expect(next.xp).toBe(400);
    });
  });

  describe('Combination 4: Multi-Stream Multi-Subject Day Isolation', () => {
    it('C4.1 day containing Physics, Accountancy, and History parts: checking Physics Part 2 isolates to Physics', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+2_Physics_1_P1', chapId: '+2_Physics_1', part: 1, completed: false },
            { id: '+2_Physics_1_P2', chapId: '+2_Physics_1', part: 2, completed: false },
            { id: '+2_Accountancy_1_P1', chapId: '+2_Accountancy_1', part: 1, completed: false },
            { id: '+2_Accountancy_1_P2', chapId: '+2_Accountancy_1', part: 2, completed: false },
            { id: '+1_History_1_P1', chapId: '+1_History_1', part: 1, completed: false },
            { id: '+1_History_1_P2', chapId: '+1_History_1', part: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Physics_1_P2', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks.find(t => t.id === '+2_Physics_1_P1').completed).toBe(true);
      expect(tasks.find(t => t.id === '+2_Physics_1_P2').completed).toBe(true);
      expect(tasks.find(t => t.id === '+2_Accountancy_1_P1').completed).toBe(false);
      expect(tasks.find(t => t.id === '+2_Accountancy_1_P2').completed).toBe(false);
      expect(tasks.find(t => t.id === '+1_History_1_P1').completed).toBe(false);
      expect(tasks.find(t => t.id === '+1_History_1_P2').completed).toBe(false);
      expect(next.xp).toBe(200);
    });

    it('C4.2 mixed +1 and +2 plan with same subject name does not cross-contaminate grades', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: '+1_Chemistry_1_P1', chapId: '+1_Chemistry_1', grade: '+1', subject: 'Chemistry', part: 1, completed: false },
            { id: '+1_Chemistry_1_P2', chapId: '+1_Chemistry_1', grade: '+1', subject: 'Chemistry', part: 2, completed: false },
            { id: '+2_Chemistry_1_P1', chapId: '+2_Chemistry_1', grade: '+2', subject: 'Chemistry', part: 1, completed: false },
            { id: '+2_Chemistry_1_P2', chapId: '+2_Chemistry_1', grade: '+2', subject: 'Chemistry', part: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Chemistry_1_P2', storage, defaultOptions);

      const tasks = next.plan[0].tasks;
      expect(tasks.find(t => t.id === '+2_Chemistry_1_P1').completed).toBe(true);
      expect(tasks.find(t => t.id === '+2_Chemistry_1_P2').completed).toBe(true);
      expect(tasks.find(t => t.id === '+1_Chemistry_1_P1').completed).toBe(false);
      expect(tasks.find(t => t.id === '+1_Chemistry_1_P2').completed).toBe(false);
      expect(next.xp).toBe(200);
    });
  });

  describe('Combination 5: Bidirectional Roundtrip Consistency', () => {
    it('C5.1 complete Part 3 -> uncheck Part 2 -> complete Part 2 -> uncheck Part 1 -> check Part 1', () => {
      let state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: 'RT_P1', chapId: 'RT', part: 1, completed: false },
            { id: 'RT_P2', chapId: 'RT', part: 2, completed: false },
            { id: 'RT_P3', chapId: 'RT', part: 3, completed: false },
          ],
        },
      ]);

      state = persistTaskCompletion(state, 'RT_P3', storage, defaultOptions);
      expect(state.plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(state.xp).toBe(300);

      state = persistTaskCompletion(state, 'RT_P2', storage, defaultOptions);
      expect(state.plan[0].tasks[0].completed).toBe(true);
      expect(state.plan[0].tasks[1].completed).toBe(false);
      expect(state.plan[0].tasks[2].completed).toBe(false);
      expect(state.xp).toBe(100);

      state = persistTaskCompletion(state, 'RT_P2', storage, defaultOptions);
      expect(state.plan[0].tasks[0].completed).toBe(true);
      expect(state.plan[0].tasks[1].completed).toBe(true);
      expect(state.plan[0].tasks[2].completed).toBe(false);
      expect(state.xp).toBe(200);

      state = persistTaskCompletion(state, 'RT_P1', storage, defaultOptions);
      expect(state.plan[0].tasks.every(t => !t.completed)).toBe(true);
      expect(state.xp).toBe(0);

      state = persistTaskCompletion(state, 'RT_P1', storage, defaultOptions);
      expect(state.plan[0].tasks[0].completed).toBe(true);
      expect(state.plan[0].tasks[1].completed).toBe(false);
      expect(state.plan[0].tasks[2].completed).toBe(false);
      expect(state.xp).toBe(100);
    });
  });

  describe('Combination 6: Malayalam Localization & Dual-Key Storage Synchronization', () => {
    it('C6.1 tasks with Malayalam topicTitle synchronize dual storage keys', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          tasks: [
            { id: 'ML_KEY_P1', chapId: 'ML_KEY', topicTitle: 'ഭാഗം 1: സിദ്ധാന്തങ്ങൾ', completed: false },
            { id: 'ML_KEY_P2', chapId: 'ML_KEY', topicTitle: 'ഭാഗം 2: മുൻവർഷ ചോദ്യങ്ങൾ', completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, 'ML_KEY_P2', storage, defaultOptions);

      expect(next.plan[0].tasks.every(t => t.completed)).toBe(true);
      const v2Saved = storage.getItem('plusTwoMissionState_v2');
      const planSaved = storage.getItem('plusTwoPlanState');
      expect(v2Saved).not.toBeNull();
      expect(planSaved).not.toBeNull();
      expect(v2Saved).toBe(planSaved);
      expect(JSON.parse(v2Saved).xp).toBe(200);
    });
  });
});

describe('Tier 4: Real-World Application Scenarios', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe('Scenario 1: Class 12 Chemistry Chapter 5 Coordination Compounds (Day 1 Part 1, Day 2 Part 2)', () => {
    it('S1.1 User Scenario: Marking Part 2/2 done on Day 2 automatically marks Part 1/2 complete on Day 1', () => {
      const chemChaps = PLUS_TWO_CHAPTERS.Chemistry;
      const coordComp = chemChaps.find(c => c.num === 5 || c.name === 'Coordination Compounds');
      expect(coordComp).toBeDefined();
      expect(coordComp.parts.length).toBe(2);

      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            dayNumber: 1,
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
                topicTitle: coordComp.parts[0].title,
                completed: false,
              },
            ],
          },
          {
            date: '2026-10-22',
            dayNumber: 2,
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
                topicTitle: coordComp.parts[1].title,
                completed: false,
              },
            ],
          },
        ],
        { xp: 0, streakCount: 3, lastCompletedDate: '2026-10-20' }
      );

      const next = persistTaskCompletion(state, '+2_Chemistry_5_P2', storage, {
        today: '2026-10-22',
        yesterday: '2026-10-21',
        modifiedAt: '2026-10-22T10:00:00.000Z',
      });

      expect(next.plan[0].tasks[0].completed).toBe(true);
      expect(next.plan[1].tasks[0].completed).toBe(true);
      expect(next.xp).toBe(200);
      expect(next.streakCount).toBe(1);
      expect(next.lastCompletedDate).toBe('2026-10-22');
    });

    it('S1.2 User Scenario: Unchecking Part 1/2 on Day 1 automatically unchecks Part 2/2 on Day 2', () => {
      const state = makePlanState(
        [
          {
            date: '2026-10-21',
            dayNumber: 1,
            tasks: [
              { id: '+2_Chemistry_5_P1', chapId: '+2_Chemistry_5', grade: '+2', subject: 'Chemistry', chapNumber: 5, chapterName: 'Coordination Compounds', part: 1, totalParts: 2, completed: true },
            ],
          },
          {
            date: '2026-10-22',
            dayNumber: 2,
            tasks: [
              { id: '+2_Chemistry_5_P2', chapId: '+2_Chemistry_5', grade: '+2', subject: 'Chemistry', chapNumber: 5, chapterName: 'Coordination Compounds', part: 2, totalParts: 2, completed: true },
            ],
          },
        ],
        { xp: 400, streakCount: 4, lastCompletedDate: '2026-10-22' }
      );

      const next = persistTaskCompletion(state, '+2_Chemistry_5_P1', storage, {
        today: '2026-10-22',
        yesterday: '2026-10-21',
        modifiedAt: '2026-10-22T11:00:00.000Z',
      });

      expect(next.plan[0].tasks[0].completed).toBe(false);
      expect(next.plan[1].tasks[0].completed).toBe(false);
      expect(next.xp).toBe(200);
      expect(next.streakCount).toBe(4);
    });

    it('S1.3 User Scenario: Marking Part 1/2 done on Day 1 does NOT mark Part 2/2 complete prematurely', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          dayNumber: 1,
          tasks: [
            { id: '+2_Chemistry_5_P1', chapId: '+2_Chemistry_5', grade: '+2', subject: 'Chemistry', chapNumber: 5, chapterName: 'Coordination Compounds', part: 1, totalParts: 2, completed: false },
          ],
        },
        {
          date: '2026-10-22',
          dayNumber: 2,
          tasks: [
            { id: '+2_Chemistry_5_P2', chapId: '+2_Chemistry_5', grade: '+2', subject: 'Chemistry', chapNumber: 5, chapterName: 'Coordination Compounds', part: 2, totalParts: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Chemistry_5_P1', storage, {
        today: '2026-10-21',
        yesterday: '2026-10-20',
        modifiedAt: '2026-10-21T18:00:00.000Z',
      });

      expect(next.plan[0].tasks[0].completed).toBe(true);
      expect(next.plan[1].tasks[0].completed).toBe(false);
      expect(next.xp).toBe(100);
    });
  });

  describe('Scenario 2: Full +2 Science Student 30-Day Plan Simulation', () => {
    it('S2.1 simulates student completing mid-plan modules with multi-part cascades', () => {
      const planSlice = [
        {
          date: '2026-11-01',
          dayNumber: 1,
          tasks: [
            { id: '+2_Physics_1_P1', chapId: '+2_Physics_1', grade: '+2', subject: 'Physics', part: 1, completed: false },
            { id: '+2_Chemistry_1_P1', chapId: '+2_Chemistry_1', grade: '+2', subject: 'Chemistry', part: 1, completed: false },
          ],
        },
        {
          date: '2026-11-02',
          dayNumber: 2,
          tasks: [
            { id: '+2_Mathematics_1_P1', chapId: '+2_Mathematics_1', grade: '+2', subject: 'Mathematics', part: 1, completed: false },
            { id: '+2_Physics_1_P2', chapId: '+2_Physics_1', grade: '+2', subject: 'Physics', part: 2, completed: false },
          ],
        },
        {
          date: '2026-11-03',
          dayNumber: 3,
          tasks: [
            { id: '+2_Chemistry_1_P2', chapId: '+2_Chemistry_1', grade: '+2', subject: 'Chemistry', part: 2, completed: false },
            { id: '+2_Mathematics_1_P2', chapId: '+2_Mathematics_1', grade: '+2', subject: 'Mathematics', part: 2, completed: false },
          ],
        },
      ];

      let state = makePlanState(planSlice, { xp: 0, streakCount: 0 });

      state = persistTaskCompletion(state, '+2_Physics_1_P2', storage, {
        today: '2026-11-02',
        yesterday: '2026-11-01',
        modifiedAt: '2026-11-02T10:00:00.000Z',
      });

      expect(state.plan[0].tasks.find(t => t.id === '+2_Physics_1_P1').completed).toBe(true);
      expect(state.plan[1].tasks.find(t => t.id === '+2_Physics_1_P2').completed).toBe(true);
      expect(state.xp).toBe(200);

      state = persistTaskCompletion(state, '+2_Chemistry_1_P2', storage, {
        today: '2026-11-03',
        yesterday: '2026-11-02',
        modifiedAt: '2026-11-03T10:00:00.000Z',
      });

      expect(state.plan[0].tasks.find(t => t.id === '+2_Chemistry_1_P1').completed).toBe(true);
      expect(state.plan[2].tasks.find(t => t.id === '+2_Chemistry_1_P2').completed).toBe(true);
      expect(state.xp).toBe(400);
      expect(state.streakCount).toBe(2);
    });
  });

  describe('Scenario 3: Commerce Student Multi-Part Workflow', () => {
    it('S3.1 +2 Accountancy Chapter 2 (3 parts) and Business Studies (2 parts)', () => {
      const state = makePlanState([
        {
          date: '2026-11-01',
          dayNumber: 1,
          tasks: [
            { id: '+2_Accountancy_2_P1', chapId: '+2_Accountancy_2', grade: '+2', subject: 'Accountancy', part: 1, completed: false },
            { id: '+2_Business_Studies_1_P1', chapId: '+2_Business_Studies_1', grade: '+2', subject: 'Business Studies', part: 1, completed: false },
          ],
        },
        {
          date: '2026-11-02',
          dayNumber: 2,
          tasks: [
            { id: '+2_Accountancy_2_P2', chapId: '+2_Accountancy_2', grade: '+2', subject: 'Accountancy', part: 2, completed: false },
          ],
        },
        {
          date: '2026-11-03',
          dayNumber: 3,
          tasks: [
            { id: '+2_Accountancy_2_P3', chapId: '+2_Accountancy_2', grade: '+2', subject: 'Accountancy', part: 3, completed: false },
            { id: '+2_Business_Studies_1_P2', chapId: '+2_Business_Studies_1', grade: '+2', subject: 'Business Studies', part: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Accountancy_2_P3', storage, defaultOptions);

      expect(next.plan[0].tasks.find(t => t.id === '+2_Accountancy_2_P1').completed).toBe(true);
      expect(next.plan[1].tasks.find(t => t.id === '+2_Accountancy_2_P2').completed).toBe(true);
      expect(next.plan[2].tasks.find(t => t.id === '+2_Accountancy_2_P3').completed).toBe(true);

      expect(next.plan[0].tasks.find(t => t.id === '+2_Business_Studies_1_P1').completed).toBe(false);
      expect(next.plan[2].tasks.find(t => t.id === '+2_Business_Studies_1_P2').completed).toBe(false);
      expect(next.xp).toBe(300);
    });
  });

  describe('Scenario 4: Humanities Curriculum Cascade', () => {
    it('S4.1 +1 History and Political Science multi-part tasks cascade independently', () => {
      const state = makePlanState([
        {
          date: '2026-11-01',
          dayNumber: 1,
          tasks: [
            { id: '+1_History_1_P1', chapId: '+1_History_1', grade: '+1', subject: 'History', part: 1, completed: false },
            { id: '+1_Political_Science_1_P1', chapId: '+1_Political_Science_1', grade: '+1', subject: 'Political Science', part: 1, completed: false },
          ],
        },
        {
          date: '2026-11-02',
          dayNumber: 2,
          tasks: [
            { id: '+1_History_1_P2', chapId: '+1_History_1', grade: '+1', subject: 'History', part: 2, completed: false },
            { id: '+1_Political_Science_1_P2', chapId: '+1_Political_Science_1', grade: '+1', subject: 'Political Science', part: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+1_History_1_P2', storage, defaultOptions);

      expect(next.plan[0].tasks.find(t => t.id === '+1_History_1_P1').completed).toBe(true);
      expect(next.plan[1].tasks.find(t => t.id === '+1_History_1_P2').completed).toBe(true);
      expect(next.plan[0].tasks.find(t => t.id === '+1_Political_Science_1_P1').completed).toBe(false);
      expect(next.plan[1].tasks.find(t => t.id === '+1_Political_Science_1_P2').completed).toBe(false);
      expect(next.xp).toBe(200);
    });
  });

  describe('Scenario 5: Overdue Backlog Task Completion', () => {
    it('S5.1 student completing Part 2 in today view automatically completes overdue Part 1 from yesterday', () => {
      const state = makePlanState([
        {
          date: '2026-10-20',
          dayNumber: 1,
          tasks: [
            { id: '+2_Physics_2_P1', chapId: '+2_Physics_2', grade: '+2', subject: 'Physics', part: 1, completed: false },
          ],
        },
        {
          date: '2026-10-21',
          dayNumber: 2,
          tasks: [
            { id: '+2_Physics_2_P2', chapId: '+2_Physics_2', grade: '+2', subject: 'Physics', part: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Physics_2_P2', storage, defaultOptions);

      expect(next.plan[0].tasks[0].completed).toBe(true);
      expect(next.plan[1].tasks[0].completed).toBe(true);
      expect(next.xp).toBe(200);
    });
  });

  describe('Scenario 6: Fast-Track / Rebalance Plan Validation', () => {
    it('S6.1 plan resulting from cascading completion validates cleanly with validatePlan without ordering issues', () => {
      const state = makePlanState([
        {
          date: '2026-10-21',
          dayNumber: 1,
          tasks: [
            { id: '+2_Physics_1_P1', chapId: '+2_Physics_1', grade: '+2', subject: 'Physics', part: 1, completed: false },
          ],
        },
        {
          date: '2026-10-22',
          dayNumber: 2,
          tasks: [
            { id: '+2_Physics_1_P2', chapId: '+2_Physics_1', grade: '+2', subject: 'Physics', part: 2, completed: false },
          ],
        },
      ]);

      const next = persistTaskCompletion(state, '+2_Physics_1_P2', storage, defaultOptions);

      const validation = validatePlan(next.plan, []);
      expect(validation.scorecard.duplicateTasks).toBe(0);
      expect(validation.scorecard.orderingViolations).toBe(0);
    });
  });
});
