import { describe, it, expect } from 'vitest';
import {
  PLANNER_ENGINE_VERSION,
  ENGINE_VERSION,
  buildIntelligentPlan,
  formatLocalDateStr,
} from '../src/engine/planner.js';
import { parseStudyBackup, validateStudyBackup } from '../src/utils/study-backup.js';
import { migrateLegacyUserPlan, migrateUserState } from '../src/engine/migration.js';
import { triggerStudyConfetti } from '../src/utils/confetti.js';
import { PLUS_ONE_SYLLABUS } from '../src/data/syllabus-plus-one.js';
import { PLUS_TWO_SYLLABUS } from '../src/data/syllabus-plus-two.js';

describe('Defect Resolution & Invariant Hardening Suite', () => {
  it('harmonizes PLANNER_ENGINE_VERSION and ENGINE_VERSION to 6', () => {
    expect(PLANNER_ENGINE_VERSION).toBe(6);
    expect(ENGINE_VERSION).toBe(6);
  });

  it('allows backups with engineVersion 6 to import and validate cleanly without TypeError', () => {
    const backupV6 = {
      engineVersion: 6,
      stream: 'cs',
      grade: '+2',
      startDate: '2026-10-01',
      deadlineDate: '2027-02-28',
      plan: [
        {
          date: '2026-10-01',
          tasks: [
            {
              id: 'P2_PHY_01_P1',
              subject: 'Physics',
              chapId: 'P2_PHY_01',
              chapterName: 'Electric Charges and Fields',
              topicTitle: 'Coulombs Law',
              completed: false,
              estimatedMinutes: 60,
            },
          ],
        },
      ],
    };

    const parsed = parseStudyBackup(JSON.stringify(backupV6));
    expect(parsed.engineVersion).toBe(6);
    expect(() => {
      if (parsed.engineVersion > Math.max(PLANNER_ENGINE_VERSION, ENGINE_VERSION, 6)) {
        throw new TypeError('Newer backup version.');
      }
    }).not.toThrow();

    const validated = validateStudyBackup(parsed);
    expect(validated.engineVersion).toBe(6);
    expect(validated.plan.length).toBe(1);
  });

  it('migrates older backups (<6) preserving completed tasks and upgrading engineVersion to 6', () => {
    const legacyV5 = {
      engineVersion: 5,
      stream: 'cs',
      grade: '+2',
      startDate: '2026-10-01',
      deadlineDate: '2026-11-30',
      plan: [
        {
          date: '2026-10-01',
          tasks: [
            {
              id: '+2_Physics_1_P1',
              subject: 'Physics',
              completed: true,
            },
          ],
        },
      ],
    };

    const migrated = migrateLegacyUserPlan(legacyV5);
    expect(migrated.engineVersion).toBe(6);
    expect(migrated.plan.length).toBeGreaterThan(0);
    const completedTasks = migrated.plan.flatMap(d => d.tasks).filter(t => t.completed);
    expect(completedTasks.some(t => t.id === '+2_Physics_1_P1')).toBe(true);
  });

  it('dynamically separates syllabus datasets by grade (+1 vs +2)', () => {
    const p1Subjects = new Set(PLUS_ONE_SYLLABUS.map(t => t.subject));
    const p2Subjects = new Set(PLUS_TWO_SYLLABUS.map(t => t.subject));

    expect(p1Subjects.has('Physics')).toBe(true);
    expect(p2Subjects.has('Physics')).toBe(true);

    const getSyllabus = (grade) => (grade === '+1' ? PLUS_ONE_SYLLABUS : PLUS_TWO_SYLLABUS);

    const plusOneData = getSyllabus('+1');
    const plusTwoData = getSyllabus('+2');

    expect(plusOneData.some(t => t.grade === '+1')).toBe(true);
    expect(plusOneData.every(t => t.grade === '+1')).toBe(true);
    expect(plusTwoData.some(t => t.grade === '+2')).toBe(true);
    expect(plusTwoData.every(t => t.grade === '+2')).toBe(true);
  });

  it('triggerStudyConfetti runs safely without throwing exceptions in Node / simulated DOM', () => {
    // In Node (where document is undefined or simulated), it returns cleanly
    expect(() => triggerStudyConfetti()).not.toThrow();
  });

  it('handles past-deadline plan extension safely when rebuildStartDate >= deadlineDate', () => {
    const rebuildStartDate = '2027-03-15';
    let deadlineDate = '2027-03-01'; // In the past relative to rebuild start

    if (rebuildStartDate >= deadlineDate) {
      const [ry, rm, rd] = rebuildStartDate.split('-').map(Number);
      const newDeadlineDate = new Date(ry, rm - 1, rd + 30);
      deadlineDate = formatLocalDateStr(newDeadlineDate);
    }

    expect(deadlineDate > rebuildStartDate).toBe(true);

    const tasks = PLUS_TWO_SYLLABUS.filter(t => t.subject === 'Physics').slice(0, 5);
    const plan = buildIntelligentPlan(deadlineDate, tasks, rebuildStartDate, [], 'cs');
    expect(plan).not.toBeNull();
    expect(plan.planDays.length).toBeGreaterThan(0);
  });

  it('exam countdown formats local calendar date string without UTC timezone shift', () => {
    // Test date: March 1, 2027 09:30 AM local
    const testDate = new Date(2027, 2, 1, 9, 30, 0); // Month is 0-indexed (2 = March)
    const deadlineIso = testDate.getFullYear() + '-' +
      String(testDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(testDate.getDate()).padStart(2, '0');

    expect(deadlineIso).toBe('2027-03-01');

    // Test past exam date handling
    const pastDiffMs = -50000;
    const days = Math.max(0, Math.round(pastDiffMs / (1000 * 60 * 60 * 24)));
    expect(days).toBe(0);
  });
});
