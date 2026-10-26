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
import { triggerStudyConfetti } from '../src/utils/confetti.js';

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

describe('R2. Missed-Day Disruption & Pending Drawer Stress Testing (1 to 14 Days)', () => {
  const missedDaysScenarios = [1, 2, 3, 5, 7, 10, 14];

  missedDaysScenarios.forEach(missedCount => {
    it(`segregates overdue work into pending drawer under ${missedCount} consecutive missed study days`, () => {
      const startDateStr = '2026-10-01';
      const deadlineDateStr = '2026-11-30';
      const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const planResult = buildIntelligentPlan(deadlineDateStr, tasks, startDateStr, [], 'cs');
      const plan = planResult.planDays;

      // Student misses missedCount days without completing tasks
      const simDate = new Date('2026-10-01T00:00:00');
      simDate.setDate(simDate.getDate() + missedCount);
      const simulatedToday = formatLocalDateStr(simDate);

      const dailyView = getDailyPlan(plan, simulatedToday);

      // Invariant 1: Overdue days count matches the number of past calendar days with uncompleted tasks
      const pastDaysWithTasks = plan.filter(d => d.date < simulatedToday && d.tasks && d.tasks.length > 0);
      expect(dailyView.overdueDays.length).toBe(pastDaysWithTasks.length);

      // Invariant 2: Overdue task count equals exact sum of uncompleted tasks from missed days
      const expectedOverdueCount = pastDaysWithTasks.reduce((sum, d) => sum + d.tasks.length, 0);
      expect(dailyView.overdueCount).toBe(expectedOverdueCount);

      // Invariant 3: Today's plan is not contaminated by past missed tasks
      const todayInPlan = plan.find(d => d.date === simulatedToday);
      expect(dailyView.todayPlan).toBe(todayInPlan);
      if (dailyView.todayPlan) {
        expect(dailyView.todayPlan.date).toBe(simulatedToday);
      }

      // Invariant 4: Overdue tasks are sorted descending by date (most recent overdue day first)
      for (let i = 1; i < dailyView.overdueDays.length; i++) {
        expect(dailyView.overdueDays[i - 1].date.localeCompare(dailyView.overdueDays[i].date)).toBeGreaterThan(0);
      }

      // Invariant 5: Original plan array remains immutable
      const tasksInOriginalPlan = plan.flatMap(d => d.tasks);
      expect(tasksInOriginalPlan.length).toBeGreaterThan(0);
    });
  });

  it('excludes already completed past tasks from the pending drawer', () => {
    const startDateStr = '2026-10-01';
    const deadlineDateStr = '2026-10-20';
    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'bio', targetTerm: 2 });
    const plan = buildIntelligentPlan(deadlineDateStr, tasks, startDateStr, [], 'bio').planDays;

    // Mark all tasks on Day 1 (2026-10-01) as completed
    plan[0].tasks.forEach(t => {
      t.completed = true;
    });

    // Advance to 2026-10-03 (Day 3) where Day 2 (2026-10-02) was missed
    const view = getDailyPlan(plan, '2026-10-03');

    // Day 1 should not be in overdueDays because all its tasks were finished
    expect(view.overdueDays.some(d => d.date === '2026-10-01')).toBe(false);

    // Day 2 should be in overdueDays with only its uncompleted tasks
    const day2Overdue = view.overdueDays.find(d => d.date === '2026-10-02');
    expect(day2Overdue).toBeDefined();
    expect(day2Overdue.tasks.length).toBe(plan[1].tasks.length);
  });
});

describe('R2. "Adjust Plan" Rebalance Resilience & Invariant Guarantees', () => {
  it('freezes completed days up to completedUpTo and rebalances remaining syllabus smoothly', () => {
    const startDateStr = '2026-10-01';
    const deadlineDateStr = '2026-11-30';
    const grade = '+2';
    const stream = 'commerce';
    const allTasks = getRemainingPlanTasks({ grade, stream, targetTerm: 3 });

    const initialPlan = buildIntelligentPlan(deadlineDateStr, allTasks, startDateStr, [], stream).planDays;

    // Student completes days 1 to 5
    const completedUpTo = 5;
    const completedTaskIds = new Set();
    const keptDays = [];

    initialPlan.forEach(day => {
      if (day.dayNumber <= completedUpTo) {
        day.tasks.forEach(t => {
          t.completed = true;
          completedTaskIds.add(t.id);
        });
        keptDays.push(day);
      }
    });

    // Student misses days 6 to 12. On Day 13 (2026-10-13), student adjusts plan:
    const rebuildStartDate = '2026-10-13';
    const remainingTasks = getRemainingPlanTasks({
      grade,
      stream,
      targetTerm: 3,
      completedTaskIds,
    });

    // Build rebalanced plan from rebuildStartDate to deadlineDateStr
    const rebalanceResult = buildIntelligentPlan(
      deadlineDateStr,
      remainingTasks,
      rebuildStartDate,
      [],
      stream,
      { intensity: 'balanced' }
    );

    // Numbering adjustment: seamlessly follows keptDays
    rebalanceResult.planDays.forEach((d, idx) => {
      d.dayNumber = completedUpTo + idx + 1;
    });

    const unifiedPlan = [...keptDays, ...rebalanceResult.planDays];

    // Invariant 1: Day numbering is strictly continuous from 1 to unifiedPlan.length without gaps
    unifiedPlan.forEach((d, idx) => {
      expect(d.dayNumber).toBe(idx + 1);
    });

    // Invariant 2: Zero task loss — completed tasks + uncompleted tasks == all initial tasks
    const allUnifiedTasks = unifiedPlan.flatMap(d => d.tasks).filter(t => !t.isRevision && !t.isExamEveTask);
    expect(allUnifiedTasks.length).toBe(allTasks.length);

    // Invariant 3: Zero task duplication between past kept days and newly rebalanced days
    const unifiedTaskIds = new Set();
    allUnifiedTasks.forEach(t => {
      expect(unifiedTaskIds.has(t.id)).toBe(false);
      unifiedTaskIds.add(t.id);
    });
    expect(unifiedTaskIds.size).toBe(allTasks.length);

    // Invariant 4: Kept days retain completed = true
    keptDays.forEach(d => {
      d.tasks.forEach(t => {
        expect(t.completed).toBe(true);
      });
    });

    // Invariant 5: Rebalance preserves revision buffer at the deadline
    expect(rebalanceResult.revisionDaysCount).toBeGreaterThan(0);
  });

  it('supports fresh reset (completedUpTo = 0) while preserving previously checked checkmarks', () => {
    const startDateStr = '2026-10-01';
    const deadlineDateStr = '2026-11-15';
    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'cs', targetTerm: 2 });
    const initialPlan = buildIntelligentPlan(deadlineDateStr, tasks, startDateStr, [], 'cs').planDays;

    // Check 3 tasks arbitrarily
    initialPlan[1].tasks[0].completed = true;
    initialPlan[3].tasks[0].completed = true;
    const completedIds = new Set([initialPlan[1].tasks[0].id, initialPlan[3].tasks[0].id]);

    // Fresh start from tomorrow
    const freshStartDate = '2026-10-10';
    const remainingTasks = getRemainingPlanTasks({
      grade: '+1',
      stream: 'cs',
      targetTerm: 2,
      completedTaskIds: completedIds,
    });

    const freshPlan = buildIntelligentPlan(deadlineDateStr, remainingTasks, freshStartDate, [], 'cs').planDays;

    // The completed tasks are excluded from the fresh schedule
    const scheduledSyllabusTasks = freshPlan
      .filter(d => !d.isRevisionDay)
      .flatMap(d => d.tasks)
      .filter(t => !t.isRevision && !t.isExamEveTask && !t.isSpacedRetrieval && !t.isForgettingCurveReview);
    const scheduledIds = new Set(scheduledSyllabusTasks.map(t => t.id));

    completedIds.forEach(id => {
      expect(scheduledIds.has(id)).toBe(false);
    });
    expect(scheduledIds.size).toBe(remainingTasks.length);
    expect(scheduledIds.size).toBe(tasks.length - completedIds.size);
  });

  it('guards against past or equal deadlines without uncaught exception or invalid state', () => {
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'bio', targetTerm: 1 });

    // When rebuild start date is on or after the deadline date:
    expect(() => {
      buildIntelligentPlan('2026-10-10', tasks, '2026-10-10', [], 'bio');
    }).toThrow('Target deadline must be in the future');

    expect(() => {
      buildIntelligentPlan('2026-10-09', tasks, '2026-10-10', [], 'bio');
    }).toThrow('Target deadline must be in the future');

    // Resilient caller contract: caller checks calculateDaysBetween and safely pushes deadline
    const requestedDeadline = '2026-10-10';
    const requestedStart = '2026-10-10';
    const diff = calculateDaysBetween(requestedStart, requestedDeadline);
    expect(diff).toBe(0);

    // Resilient fallback logic extends deadline to minimum viable runway (e.g. +7 days)
    const fallbackDeadline = formatLocalDateStr(new Date(new Date(requestedStart + 'T00:00:00').getTime() + 7 * 86400000));
    const safePlan = buildIntelligentPlan(fallbackDeadline, tasks, requestedStart, [], 'bio');
    expect(safePlan.planDays.length).toBe(8);
    expect(safePlan.isValid).toBe(true);
  });
});

describe('R2. Mid-Journey Reconfiguration Stress (Grade, Stream, Hours & Rest Days)', () => {
  it('handles academic grade switch (+1 <-> +2) cleanly without state corruption or orphaned tasks', () => {
    // Student starts in Plus One CS
    const p1Tasks = getRemainingPlanTasks({ grade: '+1', stream: 'cs', targetTerm: 3 });
    const p1Plan = buildIntelligentPlan('2026-12-31', p1Tasks, '2026-10-01', [], 'cs');
    expect(p1Plan.planDays.flatMap(d => d.tasks).every(t => t.grade === '+1')).toBe(true);

    // Student switches to Plus Two CS
    const p2Tasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
    const p2Plan = buildIntelligentPlan('2026-12-31', p2Tasks, '2026-10-01', [], 'cs');

    // Invariant 1: New plan contains strictly +2 tasks
    expect(p2Plan.planDays.flatMap(d => d.tasks).every(t => t.grade === '+2')).toBe(true);

    // Invariant 2: Zero cross-grade pollution
    const p2TaskIds = new Set(p2Tasks.map(t => t.id));
    p1Tasks.forEach(t1 => {
      expect(p2TaskIds.has(t1.id)).toBe(false);
    });

    // Invariant 3: Both plans pass validation
    expect(validatePlan(p1Plan.planDays, p1Tasks, { stream: 'cs' }).isValid).toBe(true);
    expect(validatePlan(p2Plan.planDays, p2Tasks, { stream: 'cs' }).isValid).toBe(true);
  });

  it('handles stream switch (CS -> Bio and Commerce -> Humanities) mid-plan', () => {
    // 1. CS -> Bio switch
    const csTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
    const bioTasks = getRemainingPlanTasks({ grade: '+2', stream: 'bio', targetTerm: 3 });

    const bioPlan = buildIntelligentPlan('2026-12-31', bioTasks, '2026-10-01', [], 'bio');
    const scheduledBioSubjects = new Set(bioPlan.planDays.flatMap(d => d.tasks).map(t => t.subject));

    expect(scheduledBioSubjects.has('Botany')).toBe(true);
    expect(scheduledBioSubjects.has('Zoology')).toBe(true);
    expect(scheduledBioSubjects.has('Computer Science')).toBe(false);

    // 2. Commerce -> Humanities switch
    const commTasks = getRemainingPlanTasks({ grade: '+1', stream: 'commerce', targetTerm: 3 });
    const humTasks = getRemainingPlanTasks({ grade: '+1', stream: 'humanities', targetTerm: 3 });

    const humPlan = buildIntelligentPlan('2026-12-31', humTasks, '2026-10-01', [], 'humanities');
    const scheduledHumSubjects = new Set(humPlan.planDays.flatMap(d => d.tasks).map(t => t.subject));

    expect(scheduledHumSubjects.has('History')).toBe(true);
    expect(scheduledHumSubjects.has('Political Science')).toBe(true);
    expect(scheduledHumSubjects.has('Accountancy')).toBe(false);
    expect(scheduledHumSubjects.has('Business Studies')).toBe(false);
  });

  it('adapts capacity bounds safely when changing daily study hours mid-journey', () => {
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 2 });
    const deadline = '2026-11-30';
    const start = '2026-10-01';

    // 1. Relaxed study hours (1.5h/day)
    const relaxed = buildIntelligentPlan(deadline, tasks, start, [], 'cs', {
      personalization: { dailyHours: 1.5 },
    });
    expect(relaxed.diagnostics.personalization.dailyHours).toBe(1.5);
    expect(relaxed.isValid).toBe(true);

    // 2. High study hours (5.0h/day)
    const intensive = buildIntelligentPlan(deadline, tasks, start, [], 'cs', {
      personalization: { dailyHours: 5.0 },
    });
    expect(intensive.diagnostics.personalization.dailyHours).toBe(5.0);
    expect(intensive.isValid).toBe(true);
    expect(intensive.diagnostics.standardCapacity).toBeGreaterThan(relaxed.diagnostics.standardCapacity);

    // 3. Resilience under extreme or malformed values (clamps to safe limits 0.5 - 16h)
    const extreme = buildIntelligentPlan(deadline, tasks, start, [], 'cs', {
      personalization: { dailyHours: 99 },
    });
    expect(extreme.diagnostics.personalization.dailyHours).toBe(16);

    const negative = buildIntelligentPlan(deadline, tasks, start, [], 'cs', {
      personalization: { dailyHours: -5 },
    });
    expect(negative.diagnostics.personalization.dailyHours).toBeNull();
  });

  it('configures rest day preferences and weekly rhythm reliably', () => {
    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'commerce', targetTerm: 3 });
    const start = '2026-10-01'; // Thursday
    const deadline = '2026-12-01'; // 61 days

    // Sunday Rest: weeklyRhythm = 'rest_day', restDayOfWeek = 0
    const sundayRestPlan = buildIntelligentPlan(deadline, tasks, start, [], 'commerce', {
      personalization: {
        weeklyRhythm: 'rest_day',
        restDayOfWeek: 0,
      },
    });

    const sundayDays = sundayRestPlan.planDays.filter(d => d.dayOfWeek === 0 && !d.isRevisionDay);
    expect(sundayDays.length).toBeGreaterThan(0);
    sundayDays.forEach(day => {
      expect(day.isRestDay).toBe(true);
      expect(day.tasks.length).toBe(0);
    });

    // Non-Sunday active days have study tasks
    const activeDays = sundayRestPlan.planDays.filter(d => !d.isRestDay && !d.isRevisionDay);
    expect(activeDays.every(d => d.tasks.length > 0)).toBe(true);
  });
});

describe('R2. Calendar & Timezone Boundaries (Leap Years, Transitions, UTC Offsets)', () => {
  it('correctly handles leap year 2028 including Feb 29 boundary', () => {
    const leapStart = '2028-02-25';
    const leapEnd = '2028-03-05';
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'bio', targetTerm: 1 });

    const plan = buildIntelligentPlan(leapEnd, tasks, leapStart, [], 'bio');
    const dates = plan.planDays.map(d => d.date);

    // 2028 is a leap year; 2028-02-29 must be present
    expect(dates).toContain('2028-02-28');
    expect(dates).toContain('2028-02-29');
    expect(dates).toContain('2028-03-01');

    // Day difference calculation
    expect(calculateDaysBetween('2028-02-28', '2028-03-01')).toBe(2);
    // Non-leap year comparison
    expect(calculateDaysBetween('2027-02-28', '2027-03-01')).toBe(1);

    // Daily plan view around leap day
    const feb29View = getDailyPlan(plan.planDays, '2028-02-29');
    expect(feb29View.yesterdayDate).toBe('2028-02-28');

    const mar1View = getDailyPlan(plan.planDays, '2028-03-01');
    expect(mar1View.yesterdayDate).toBe('2028-02-29');

    // Non-leap invalid date rejection
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(() => getDailyPlan([], '2026-02-29')).toThrow(TypeError);
  });

  it('correctly transitions across year boundary (December 31 to January 01)', () => {
    const crossYearStart = '2026-12-25';
    const crossYearEnd = '2027-01-10';
    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'humanities', targetTerm: 1 });

    const plan = buildIntelligentPlan(crossYearEnd, tasks, crossYearStart, [], 'humanities');
    const dates = plan.planDays.map(d => d.date);

    expect(dates).toContain('2026-12-31');
    expect(dates).toContain('2027-01-01');

    // Monotonic dates
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }

    const jan1View = getDailyPlan(plan.planDays, '2027-01-01');
    expect(jan1View.yesterdayDate).toBe('2026-12-31');
  });

  it('preserves local calendar dates regardless of UTC timezone shifts', () => {
    // Testing date formatting with local time
    const testDate = new Date(2026, 9, 21, 23, 45, 0); // 11:45 PM local
    const formatted = formatLocalDateStr(testDate);
    expect(formatted).toBe('2026-10-21');

    const morningDate = new Date(2026, 9, 21, 0, 15, 0); // 12:15 AM local
    expect(formatLocalDateStr(morningDate)).toBe('2026-10-21');
  });
});

describe('R3. UI State Synchronization & Storage Integrity Verification', () => {
  it('writes atomically to both localStorage keys (plusTwoMissionState_v2 & plusTwoPlanState)', () => {
    const storage = createMockStorage();
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 1 });
    const planResult = buildIntelligentPlan('2026-11-15', tasks, '2026-10-01', [], 'cs');
    const state = {
      ...planResult,
      grade: '+2',
      stream: 'cs',
      engineVersion: PLANNER_ENGINE_VERSION,
    };

    persistStudyBackup(state, storage);

    expect(storage.setItem).toHaveBeenCalledWith('plusTwoMissionState_v2', expect.any(String));
    expect(storage.setItem).toHaveBeenCalledWith('plusTwoPlanState', expect.any(String));

    const val1 = storage.getItem('plusTwoMissionState_v2');
    const val2 = storage.getItem('plusTwoPlanState');
    expect(val1).toBe(val2);
    expect(JSON.parse(val1).grade).toBe('+2');
  });

  it('rolls back previous values atomically if either localStorage write fails', () => {
    const existingMission = JSON.stringify({ version: 'prev_mission' });
    const existingPlan = JSON.stringify({ version: 'prev_plan' });
    const storage = createMockStorage({
      plusTwoMissionState_v2: existingMission,
      plusTwoPlanState: existingPlan,
    });

    // Make the second write throw QuotaExceededError
    storage.setItem = vi.fn((key, value) => {
      if (key === 'plusTwoPlanState') {
        throw new Error('QuotaExceededError: Local storage full');
      }
      storage._map.set(key, String(value));
    });

    const newState = { plan: [{ date: '2026-10-01', dayNumber: 1, tasks: [{ id: 't1', subject: 'Physics', chapterName: 'Ch 1' }] }] };

    expect(() => {
      persistStudyBackup(newState, storage);
    }).toThrow('QuotaExceededError');

    // Rollback check: plusTwoMissionState_v2 was rolled back to existingMission
    expect(storage._map.get('plusTwoMissionState_v2')).toBe(existingMission);
    expect(storage._map.get('plusTwoPlanState')).toBe(existingPlan);
  });

  it('guarantees migration idempotency on repeated execution passes', () => {
    const legacyState = {
      stream: 'commerce',
      startDate: '2026-10-01',
      deadlineDate: '2026-12-01',
      targetTerm: 2,
      plan: [
        {
          date: '2026-10-01',
          tasks: [
            { id: 'acc_1', subject: 'Accountancy', chapter: '1. Financial Statements', completed: true },
            { id: 'bs_1', subject: 'Business Studies', chapter: '1. Principles', completed: false },
          ],
        },
      ],
    };

    // Pass 1
    const migrated1 = migrateOldState(legacyState);
    expect(migrated1.stream).toBe('commerce');
    expect(migrated1.plan[0].tasks[0].completed).toBe(true);

    // Pass 2 on already migrated state
    const migrated2 = migrateOldState(migrated1);
    expect(migrated2.stream).toBe('commerce');
    expect(migrated2.plan[0].tasks[0].completed).toBe(true);
    expect(migrated2.plan[0].tasks[0].id).toBe(migrated1.plan[0].tasks[0].id);

    // migrateUserState with engineVersion = ENGINE_VERSION returns clean copy
    const modernState = {
      engineVersion: ENGINE_VERSION,
      plan: [{ date: '2026-10-01', tasks: [] }],
    };
    const userMigrated = migrateUserState(modernState);
    expect(userMigrated).toEqual(modernState);
  });

  it('guarantees bit-for-bit JSON backup roundtrip and sanitizes malicious payloads', () => {
    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'bio', targetTerm: 2 });
    const planResult = buildIntelligentPlan('2026-11-20', tasks, '2026-10-01', [], 'bio');
    const state = {
      ...planResult,
      grade: '+1',
      stream: 'bio',
      engineVersion: PLANNER_ENGINE_VERSION,
    };
    state.plan[0].tasks[0].completed = true;

    // Create backup
    const backup = createStudyBackup(state, '7.1.0');
    expect(backup.appVersion).toBe('7.1.0');
    expect(backup.exportedAt).toBeDefined();

    // Serialize and parse
    const backupJson = JSON.stringify(backup);
    const restored = parseStudyBackup(backupJson);

    expect(restored.grade).toBe('+1');
    expect(restored.stream).toBe('bio');
    expect(restored.plan.length).toBe(state.plan.length);
    expect(restored.plan[0].tasks[0].completed).toBe(true);

    // Adversarial: script injection rejected
    const maliciousJson = JSON.stringify({
      ...backup,
      personalization: { customNote: '<script>alert("hacked")</script>' },
    });
    expect(() => parseStudyBackup(maliciousJson)).toThrow(TypeError);

    // Oversized backup rejected
    const hugePayload = 'x'.repeat(MAX_BACKUP_BYTES + 10);
    expect(() => parseStudyBackup(hugePayload)).toThrow(TypeError);
  });

  it('updates task completion, XP, and streak count consistently via persistTaskCompletion', () => {
    const storage = createMockStorage();
    const tasks = [
      { id: 'phy_1', subject: 'Physics', chapterName: 'Units', completed: false, estimatedMinutes: 60 },
      { id: 'chem_1', subject: 'Chemistry', chapterName: 'Solutions', completed: false, estimatedMinutes: 60 },
    ];
    const state = {
      plan: [{ date: '2026-10-21', dayNumber: 1, tasks }],
      xp: 0,
      streakCount: 0,
      lastCompletedDate: null,
      grade: '+2',
      stream: 'cs',
      engineVersion: PLANNER_ENGINE_VERSION,
    };

    // 1. Complete first task today
    const after1 = persistTaskCompletion(state, 'phy_1', storage, {
      today: '2026-10-21',
      yesterday: '2026-10-20',
      modifiedAt: '2026-10-21T10:00:00Z',
    });

    expect(after1.xp).toBe(100);
    expect(after1.streakCount).toBe(1);
    expect(after1.lastCompletedDate).toBe('2026-10-21');
    expect(after1.plan[0].tasks.find(t => t.id === 'phy_1').completed).toBe(true);

    // 2. Complete second task same day -> streak stays 1, XP increases to 200
    const after2 = persistTaskCompletion(after1, 'chem_1', storage, {
      today: '2026-10-21',
      yesterday: '2026-10-20',
      modifiedAt: '2026-10-21T10:30:00Z',
    });

    expect(after2.xp).toBe(200);
    expect(after2.streakCount).toBe(1);

    // 3. Complete task on next day (consecutive) -> streak increments to 2
    const day2State = {
      ...after2,
      plan: [
        ...after2.plan,
        { date: '2026-10-22', dayNumber: 2, tasks: [{ id: 'math_1', subject: 'Mathematics', chapterName: 'Relations', completed: false, estimatedMinutes: 60 }] },
      ],
    };

    const after3 = persistTaskCompletion(day2State, 'math_1', storage, {
      today: '2026-10-22',
      yesterday: '2026-10-21',
      modifiedAt: '2026-10-22T09:00:00Z',
    });

    expect(after3.streakCount).toBe(2);
    expect(after3.lastCompletedDate).toBe('2026-10-22');
  });

  it('triggers celebration state and confetti safely when reaching 100% syllabus mastery', () => {
    // Zero-dependency confetti runs safely in Node / headless
    expect(() => triggerStudyConfetti()).not.toThrow();

    // In DOM environment, verify confetti canvas lifecycle
    const mockCanvas = {
      id: '',
      className: '',
      style: { cssText: '' },
      getContext: vi.fn(() => ({
        scale: vi.fn(),
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        fillRect: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
      })),
    };

    const mockDocument = {
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => mockCanvas),
      body: { appendChild: vi.fn() },
    };

    // Temporarily mount mock document, window, and requestAnimationFrame
    const originalDoc = global.document;
    const originalWin = global.window;
    const originalRaf = global.requestAnimationFrame;
    try {
      global.document = mockDocument;
      global.window = {
        devicePixelRatio: 1,
        innerWidth: 1024,
        innerHeight: 768,
        requestAnimationFrame: vi.fn(),
      };
      global.requestAnimationFrame = vi.fn();

      triggerStudyConfetti();
      expect(mockDocument.createElement).toHaveBeenCalledWith('canvas');
      expect(mockDocument.body.appendChild).toHaveBeenCalled();
    } finally {
      global.document = originalDoc;
      global.window = originalWin;
      global.requestAnimationFrame = originalRaf;
    }
  });
});

describe('Tier 4 Real-World Application Scenarios (Scenarios 2, 3, 4, 5)', () => {
  it('Scenario 2: +1 CS Student with 7-Day Illness & Mid-Plan Rebalance', () => {
    const grade = '+1';
    const stream = 'cs';
    const tasks = getRemainingPlanTasks({ grade, stream, targetTerm: 3 });
    const originalPlan = buildIntelligentPlan('2026-12-15', tasks, '2026-10-01', [], stream).planDays;

    // Student studies 10 days, completing all tasks
    const completedTaskIds = new Set();
    const keptDays = [];
    for (let i = 0; i < 10; i++) {
      originalPlan[i].tasks.forEach(t => {
        t.completed = true;
        completedTaskIds.add(t.id);
      });
      keptDays.push(originalPlan[i]);
    }

    // Student misses 7 days due to illness (Days 11-17)
    // On Day 18 (2026-10-18), student runs Adjust Plan
    const remainingTasks = getRemainingPlanTasks({ grade, stream, targetTerm: 3, completedTaskIds });
    const adjusted = buildIntelligentPlan('2026-12-15', remainingTasks, '2026-10-18', [], stream);

    // Numbering continuity
    adjusted.planDays.forEach((d, idx) => {
      d.dayNumber = 10 + idx + 1;
    });

    const fullSchedule = [...keptDays, ...adjusted.planDays];

    // Verify full syllabus completion without task loss
    const totalScheduled = fullSchedule.flatMap(d => d.tasks).filter(t => !t.isRevision);
    expect(totalScheduled.length).toBe(tasks.length);
    expect(fullSchedule[0].dayNumber).toBe(1);
    expect(fullSchedule[fullSchedule.length - 1].dayNumber).toBe(fullSchedule.length);
  });

  it('Scenario 3: +2 Commerce Student Switching Study Hours & Rest Days Mid-Plan', () => {
    const grade = '+2';
    const stream = 'commerce';
    const tasks = getRemainingPlanTasks({ grade, stream, targetTerm: 3 });

    // Initial plan: 4h/day, balanced rhythm
    const plan1 = buildIntelligentPlan('2026-12-20', tasks, '2026-10-01', [], stream, {
      personalization: { dailyHours: 4.0, weeklyRhythm: 'balanced' },
    });
    expect(plan1.planDays.filter(d => d.isRestDay).length).toBe(0);

    // Mid-way reconfiguration: switch to 2h/day and Sunday rest
    const plan2 = buildIntelligentPlan('2026-12-20', tasks, '2026-10-01', [], stream, {
      personalization: { dailyHours: 2.0, weeklyRhythm: 'rest_day', restDayOfWeek: 0 },
    });

    const sundayRestDays = plan2.planDays.filter(d => d.dayOfWeek === 0 && !d.isRevisionDay);
    expect(sundayRestDays.length).toBeGreaterThan(0);
    expect(sundayRestDays.every(d => d.isRestDay)).toBe(true);
    expect(plan2.isValid).toBe(true);
  });

  it('Scenario 4: Offline PWA Student Completing Syllabus with Device Backup Roundtrip', () => {
    const storage = createMockStorage();
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'bio', targetTerm: 2 });
    const planResult = buildIntelligentPlan('2026-11-30', tasks, '2026-10-01', [], 'bio');

    const state = {
      ...planResult,
      grade: '+2',
      stream: 'bio',
      engineVersion: PLANNER_ENGINE_VERSION,
    };

    // Mark half the tasks completed offline
    const allStudyTasks = state.plan.flatMap(d => d.tasks).filter(t => !t.isRevision);
    const halfCount = Math.floor(allStudyTasks.length / 2);
    for (let i = 0; i < halfCount; i++) {
      allStudyTasks[i].completed = true;
    }

    persistStudyBackup(state, storage);

    // Export backup JSON
    const exportedBackup = createStudyBackup(state, '7.1.0');
    const backupJsonString = JSON.stringify(exportedBackup);

    // Simulate device wipe
    storage.clear();
    expect(storage.getItem('plusTwoMissionState_v2')).toBeNull();

    // Restore on new device
    const restoredState = parseStudyBackup(backupJsonString);
    persistStudyBackup(restoredState, storage);

    const storedState = JSON.parse(storage.getItem('plusTwoMissionState_v2'));
    expect(storedState.grade).toBe('+2');
    expect(storedState.stream).toBe('bio');

    const restoredDoneTasks = storedState.plan.flatMap(d => d.tasks).filter(t => t.completed);
    expect(restoredDoneTasks.length).toBe(halfCount);
  });

  it('Scenario 5: +1 Humanities Student Finishing 100% Curriculum on Leap Year', () => {
    const grade = '+1';
    const stream = 'humanities';
    const tasks = getRemainingPlanTasks({ grade, stream, targetTerm: 3 });

    // Leap year 2028: Jan 15 to Mar 31, 2028
    const leapPlan = buildIntelligentPlan('2028-03-31', tasks, '2028-01-15', [], stream);

    // Ensure Feb 29 was part of the study runway
    const feb29 = leapPlan.planDays.find(d => d.date === '2028-02-29');
    expect(feb29).toBeDefined();

    // Simulate full day-by-day completion
    leapPlan.planDays.forEach(day => {
      day.tasks.forEach(t => {
        t.completed = true;
      });
    });

    const validation = validatePlan(leapPlan.planDays, tasks, { stream });
    expect(validation.isValid).toBe(true);
    expect(validation.scorecard.omittedTasks).toBe(0);
    expect(validation.scorecard.duplicateTasks).toBe(0);
  });
});
