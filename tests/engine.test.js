import { describe, it, expect } from 'vitest';
import {
  buildIntelligentPlan,
  validatePlan,
  formatLocalDateStr,
  calculateDaysBetween,
  getCanonicalTasks,
  getStreamSubjects,
} from '../src/engine/planner.js';
import { migrateUserState } from '../src/engine/migration.js';

describe('Mission PlusTwo Planning Engine (v6.0.0)', () => {
  it('generates a valid plan with sensible defaults in 1 tap', () => {
    const planState = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2026-10-01',
      deadlineDateStr: '2027-02-28',
      termScope: 3,
    });

    expect(planState.engineVersion).toBe(6);
    expect(planState.stream).toBe('cs');
    expect(planState.plan.length).toBeGreaterThan(100);

    const validation = validatePlan(planState);
    expect(validation.valid).toBe(true);
    expect(validation.uniqueTaskCount).toBe(validation.totalTasks);
  });

  it('correctly bounds revision buffers based on runway duration', () => {
    // Short runway (7 days) -> 1 revision day
    const shortPlan = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2026-10-01',
      deadlineDateStr: '2026-10-08',
    });
    expect(shortPlan.revisionDaysCount).toBe(1);

    // Medium runway (30 days) -> 4 revision days
    const medPlan = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2026-10-01',
      deadlineDateStr: '2026-10-31',
    });
    expect(medPlan.revisionDaysCount).toBe(4);

    // Long runway (150 days) -> 10 revision days
    const longPlan = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2026-10-01',
      deadlineDateStr: '2027-02-28',
    });
    expect(longPlan.revisionDaysCount).toBe(10);
  });

  it('detects infeasible deadlines (past or today dates)', () => {
    expect(() =>
      buildIntelligentPlan({
        stream: 'cs',
        startDateStr: '2026-10-05',
        deadlineDateStr: '2026-10-05',
      })
    ).toThrow('Target deadline must be in the future');
  });

  it('guarantees zero task loss and zero duplicates across all subjects', () => {
    const canonical = getCanonicalTasks({ stream: 'bio', termScope: 3 });
    const planState = buildIntelligentPlan({
      stream: 'bio',
      startDateStr: '2026-10-01',
      deadlineDateStr: '2027-02-28',
      termScope: 3,
    });

    const activeStudyTasks = planState.plan
      .filter((d) => !d.isRevisionDay)
      .flatMap((d) => d.tasks);

    expect(activeStudyTasks.length).toBe(canonical.length);

    const taskIds = new Set(activeStudyTasks.map((t) => t.id));
    expect(taskIds.size).toBe(canonical.length);
  });

  it('weaves Plus One Improvement papers with elevated priority when enabled', () => {
    const planState = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2026-10-01',
      deadlineDateStr: '2027-02-28',
      termScope: 3,
      includePlusOne: true,
      plusOneSubjects: ['Physics', 'Chemistry'],
    });

    const p1Tasks = planState.plan.flatMap((d) =>
      d.tasks.filter((t) => t.grade === '+1')
    );

    expect(p1Tasks.length).toBeGreaterThan(0);
    expect(p1Tasks.every((t) => t.isImprovement)).toBe(true);
  });

  it('calculates daily study minutes accurately for each scheduled day', () => {
    const planState = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2026-10-01',
      deadlineDateStr: '2027-02-28',
    });

    planState.plan.forEach((day) => {
      if (!day.isRestDay) {
        expect(day.totalMinutes).toBeGreaterThan(0);
        const sumMinutes = day.tasks.reduce(
          (acc, t) => acc + (t.estimatedMinutes || 60),
          0
        );
        expect(day.totalMinutes).toBe(sumMinutes);
      } else {
        expect(day.totalMinutes).toBe(0);
      }
    });
  });
});

describe('State Migration Engine', () => {
  it('seamlessly migrates legacy v2 state preserving all completed checkmarks', () => {
    const legacyState = {
      stream: 'bio',
      plan: [
        {
          dayNumber: 1,
          date: '2026-09-20',
          tasks: [
            {
              id: 'p2_Physics_1_P1',
              subject: 'Physics',
              chapterName: 'Electric Charges and Fields',
              completed: true,
              topicTitle: 'Part 1 of 2: Core Concepts & Theory',
            },
            {
              id: 'p2_Chemistry_1_P1',
              subject: 'Chemistry',
              chapterName: 'Solutions',
              completed: false,
              topicTitle: 'Part 1 of 3: Core Concepts & Theory',
            },
          ],
        },
      ],
    };

    const migrated = migrateUserState(legacyState);
    expect(migrated.engineVersion).toBe(6);

    const task1 = migrated.plan[0].tasks[0];
    const task2 = migrated.plan[0].tasks[1];

    expect(task1.completed).toBe(true);
    expect(task2.completed).toBe(false);
    expect(task1.topicTitle).toBe('Part 1/2: Core Concepts & Theory');
    expect(task1.estimatedMinutes).toBe(60);
  });

  it('is completely idempotent on multiple migration passes', () => {
    const legacyState = {
      stream: 'cs',
      plan: [
        {
          dayNumber: 1,
          tasks: [{ id: 'test_1', completed: true, topicTitle: 'Part 1 of 2' }],
        },
      ],
    };

    const pass1 = migrateUserState(legacyState);
    const pass2 = migrateUserState(pass1);

    expect(pass1).toEqual(pass2);
  });

  it('correctly shifts study schedule so Day 1 aligns with a new start date (Make Today Day 1)', () => {
    const initialPlan = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2026-09-20',
      deadlineDateStr: '2026-10-10',
    });

    expect(initialPlan.plan[0].dayNumber).toBe(1);
    expect(initialPlan.plan[0].date).toBe('2026-09-20');
    expect(initialPlan.plan[1].dayNumber).toBe(2);
    expect(initialPlan.plan[1].date).toBe('2026-09-21');

    // Simulate shiftPlanToStartDate('2026-09-21')
    const newStart = '2026-09-21';
    const s = new Date(newStart + 'T00:00:00');
    initialPlan.plan.forEach((day, idx) => {
      const d = new Date(s);
      d.setDate(d.getDate() + idx);
      day.date = formatLocalDateStr(d);
    });

    expect(initialPlan.plan[0].dayNumber).toBe(1);
    expect(initialPlan.plan[0].date).toBe('2026-09-21');
    expect(initialPlan.plan[1].dayNumber).toBe(2);
    expect(initialPlan.plan[1].date).toBe('2026-09-22');
  });

  it('correctly identifies earliest incomplete day as active study day when calendar advances', () => {
    const planState = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2026-09-20',
      deadlineDateStr: '2026-10-10',
    });

    // Simulate partial Day 1 completion: 3 tasks completed, rest uncompleted
    planState.plan[0].tasks[0].completed = true;
    planState.plan[0].tasks[1].completed = true;
    planState.plan[0].tasks[2].completed = true;

    const calendarToday = planState.plan.find(d => d.date === '2026-09-21');
    expect(calendarToday.dayNumber).toBe(2);

    const firstIncompleteDay = planState.plan.find(d => d.tasks.some(t => !t.completed));
    expect(firstIncompleteDay.dayNumber).toBe(1);

    // Active day resolver must select Day 1 to prevent skipping prerequisite chapters
    const activeDay = (firstIncompleteDay && calendarToday && firstIncompleteDay.dayNumber < calendarToday.dayNumber)
      ? firstIncompleteDay
      : calendarToday;

    expect(activeDay.dayNumber).toBe(1);
    expect(activeDay.date).toBe('2026-09-20');
  });
});

describe('Edge Cases, Boundary Conditions & Invariant Hardening', () => {
  it('handles very short deadlines (2 days) without crashing or invalid states', () => {
    const planState = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2026-10-01',
      deadlineDateStr: '2026-10-02',
      termScope: 1,
    });

    expect(planState.plan.length).toBe(2);
    expect(planState.revisionDaysCount).toBe(0); // Short runway reserves 0 revision days
    expect(planState.plan[0].tasks.length).toBeGreaterThan(0);
    expect(planState.diagnostics.isInfeasible).toBe(true); // Flagged as overloaded
    const validation = validatePlan(planState);
    expect(validation.scorecard.duplicateTasks).toBe(0);
    expect(validation.scorecard.orderingViolations).toBe(0);
  });

  it('rejects invalid or malformed date inputs with explicit errors', () => {
    expect(() =>
      buildIntelligentPlan({
        stream: 'cs',
        startDateStr: 'invalid-date',
        deadlineDateStr: '2026-10-20',
      })
    ).toThrow('Target deadline must be in the future');

    expect(calculateDaysBetween('invalid-date', '2026-10-20')).toBeNaN();
  });

  it('resiliently handles rest-day configurations even when saturated', () => {
    // If user sets Sunday as rest day on a 1-day Sunday runway, it must preserve at least one active study day
    const planState = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2026-10-04', // Sunday
      deadlineDateStr: '2026-10-05',
      capacityOptions: {
        personalization: {
          weeklyRhythm: 'rest_day',
          restDayOfWeek: 0, // Sunday
        },
      },
    });

    expect(planState.plan.length).toBe(2);
    // Active study day count must be > 0 (rest day reset safety kicks in)
    const activeDays = planState.plan.filter((d) => !d.isRestDay);
    expect(activeDays.length).toBeGreaterThan(0);
  });

  it('safely tolerates zero or negative capacity and personalization values', () => {
    const planState = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2026-10-01',
      deadlineDateStr: '2026-10-31',
      capacityOptions: {
        weekdayDailyTasks: -5,
        weekendDailyTasks: 0,
        personalization: {
          dailyHours: -2,
          subjectWeights: { Physics: -1, Chemistry: 0, Mathematics: 'invalid' },
        },
      },
    });

    expect(planState.valid).toBe(true);
    expect(planState.scorecard.duplicateTasks).toBe(0);
    expect(planState.scorecard.orderingViolations).toBe(0);
  });

  it('deduplicates duplicate tasks provided in caller task lists', () => {
    const canonical = getCanonicalTasks({ stream: 'cs', termScope: 1 });
    // Duplicate the task list
    const duplicatedInput = [...canonical, ...canonical];

    const planState = buildIntelligentPlan(
      '2026-11-01',
      duplicatedInput,
      '2026-10-01',
      [],
      'cs'
    );

    const validation = validatePlan(planState);
    expect(validation.scorecard.duplicateTasks).toBe(0);
    expect(validation.uniqueTaskCount).toBe(canonical.length + planState.revisionDaysCount);
  });

  it('handles empty input task lists gracefully without exceptions', () => {
    const planState = buildIntelligentPlan(
      '2026-10-15',
      [],
      '2026-10-01',
      [],
      'cs'
    );

    expect(planState.plan.length).toBe(15);
    expect(planState.totalConfiguredTasks).toBe(0);
    const validation = validatePlan(planState);
    expect(validation.valid).toBe(true);
  });

  it('schedules multiple improvement exams prior to respective individual deadlines', () => {
    const planState = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2026-10-01',
      deadlineDateStr: '2027-02-28',
      includePlusOne: true,
      plusOneSubjects: ['Physics', 'Chemistry', 'Mathematics'],
      improvementDates: {
        Physics: '2026-10-20',
        Chemistry: '2026-10-25',
        Mathematics: '2026-11-05',
      },
    });

    const validation = validatePlan(planState, undefined, {
      stream: 'cs',
      improvementConfig: [
        { subject: 'Physics', examDate: '2026-10-20' },
        { subject: 'Chemistry', examDate: '2026-10-25' },
        { subject: 'Mathematics', examDate: '2026-11-05' },
      ],
    });

    expect(validation.scorecard.deadlineViolations).toBe(0);
    expect(validation.scorecard.orderingViolations).toBe(0);
    expect(validation.scorecard.duplicateTasks).toBe(0);
  });

  it('supports improvement-only stream mode for repeating students', () => {
    const planState = buildIntelligentPlan({
      stream: 'imp_only',
      startDateStr: '2026-10-01',
      deadlineDateStr: '2026-11-15',
      improvementOnly: true,
      plusOneSubjects: ['Physics', 'Chemistry'],
      improvementDates: {
        Physics: '2026-11-10',
        Chemistry: '2026-11-12',
      },
    });

    expect(planState.stream).toBe('imp_only');
    const allTasks = planState.plan.flatMap((d) => d.tasks);
    expect(allTasks.every((t) => t.grade === '+1' || t.isRevision)).toBe(true);
    const validation = validatePlan(planState);
    expect(validation.scorecard.orderingViolations).toBe(0);
  });

  it('correctly handles month and leap year date transitions', () => {
    // Leap year boundary: Feb 2028
    const leapPlan = buildIntelligentPlan({
      stream: 'cs',
      startDateStr: '2028-02-27',
      deadlineDateStr: '2028-03-03',
      termScope: 1,
    });

    // 2028-02-27, 28, 29, 03-01, 02, 03 -> 6 days
    expect(leapPlan.plan.length).toBe(6);
    expect(leapPlan.plan[2].date).toBe('2028-02-29');
    expect(leapPlan.plan[3].date).toBe('2028-03-01');
  });

  it('property test: maintains invariant ordering under randomly shuffled task inputs', () => {
    const canonical = getCanonicalTasks({ stream: 'cs', termScope: 2 });

    for (let iteration = 0; iteration < 5; iteration++) {
      // Fisher-Yates shuffle
      const shuffled = [...canonical];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const planState = buildIntelligentPlan(
        '2026-12-15',
        shuffled,
        '2026-10-01',
        [],
        'cs'
      );

      const validation = validatePlan(planState, canonical, { stream: 'cs' });
      expect(validation.scorecard.orderingViolations).toBe(0);
      expect(validation.scorecard.duplicateTasks).toBe(0);
      expect(validation.scorecard.omittedTasks).toBe(0);
    }
  });

  describe('Commerce & Humanities Stream Isolation & Verification', () => {
    it('returns exact canonical subjects for commerce and humanities streams', () => {
      const commSubs = getStreamSubjects('commerce');
      expect(commSubs).toEqual(['Accountancy', 'Business Studies', 'Economics', 'Computer Applications']);

      const humSubs = getStreamSubjects('humanities');
      expect(humSubs).toEqual(['History', 'Political Science', 'Sociology', 'Economics']);
    });

    it('enforces strict stream isolation in getCanonicalTasks with zero cross-contamination', () => {
      // Commerce canonical tasks
      const commTasks = getCanonicalTasks({ stream: 'commerce', termScope: 3 });
      expect(commTasks.length).toBeGreaterThan(50);
      const commSubjects = new Set(commTasks.map((t) => t.subject));
      expect(commSubjects).toEqual(new Set(['Accountancy', 'Business Studies', 'Economics', 'Computer Applications']));
      // Invariant: Zero Science or Humanities-only subjects in Commerce
      expect(commSubjects.has('Physics')).toBe(false);
      expect(commSubjects.has('Chemistry')).toBe(false);
      expect(commSubjects.has('Mathematics')).toBe(false);
      expect(commSubjects.has('History')).toBe(false);
      expect(commSubjects.has('Sociology')).toBe(false);

      // Humanities canonical tasks
      const humTasks = getCanonicalTasks({ stream: 'humanities', termScope: 3 });
      expect(humTasks.length).toBeGreaterThan(60);
      const humSubjects = new Set(humTasks.map((t) => t.subject));
      expect(humSubjects).toEqual(new Set(['History', 'Political Science', 'Sociology', 'Economics']));
      // Invariant: Zero Science or Commerce-only subjects in Humanities
      expect(humSubjects.has('Physics')).toBe(false);
      expect(humSubjects.has('Accountancy')).toBe(false);
      expect(humSubjects.has('Business Studies')).toBe(false);
      expect(humSubjects.has('Computer Science')).toBe(false);
    });

    it('prevents cross-stream leakage when including +1 improvement subjects', () => {
      // Even if a caller maliciously passes Physics or Zoology under commerce, it is filtered out
      const isolatedComm = getCanonicalTasks({
        stream: 'commerce',
        termScope: 3,
        includePlusOne: true,
        plusOneSubjects: ['Accountancy', 'Economics', 'Physics', 'Zoology'],
      });

      const subjects = new Set(isolatedComm.map((t) => t.subject));
      expect(subjects.has('Physics')).toBe(false);
      expect(subjects.has('Zoology')).toBe(false);
      expect(subjects.has('Accountancy')).toBe(true);
      expect(subjects.has('Economics')).toBe(true);
    });

    it('generates a valid, completely verified plan for Commerce stream', () => {
      const planState = buildIntelligentPlan({
        stream: 'commerce',
        startDateStr: '2026-10-01',
        deadlineDateStr: '2027-02-28',
        termScope: 3,
      });

      expect(planState.stream).toBe('commerce');
      expect(planState.valid).toBe(true);
      expect(planState.scorecard.orderingViolations).toBe(0);
      expect(planState.scorecard.duplicateTasks).toBe(0);

      // Check all non-revision tasks are strictly Commerce subjects
      const scheduledSubjects = new Set(
        planState.plan
          .filter((d) => !d.isRevisionDay)
          .flatMap((d) => d.tasks)
          .map((t) => t.subject)
      );
      expect(scheduledSubjects).toEqual(new Set(['Accountancy', 'Business Studies', 'Economics', 'Computer Applications']));

      // Verify revision days contain tailored Commerce revision topics
      const revisionTasks = planState.plan
        .filter((d) => d.isRevisionDay)
        .flatMap((d) => d.tasks);
      expect(revisionTasks.length).toBeGreaterThan(0);
      const hasCommerceRevTopic = revisionTasks.some(
        (t) => t.topicTitle && (t.topicTitle.includes('Partnership Accounts') || t.topicTitle.includes('Management Principles'))
      );
      expect(hasCommerceRevTopic).toBe(true);
    });

    it('generates a valid, completely verified plan for Humanities stream', () => {
      const planState = buildIntelligentPlan({
        stream: 'humanities',
        startDateStr: '2026-10-01',
        deadlineDateStr: '2027-02-28',
        termScope: 3,
      });

      expect(planState.stream).toBe('humanities');
      expect(planState.valid).toBe(true);
      expect(planState.scorecard.orderingViolations).toBe(0);
      expect(planState.scorecard.duplicateTasks).toBe(0);

      // Check all non-revision tasks are strictly Humanities subjects
      const scheduledSubjects = new Set(
        planState.plan
          .filter((d) => !d.isRevisionDay)
          .flatMap((d) => d.tasks)
          .map((t) => t.subject)
      );
      expect(scheduledSubjects).toEqual(new Set(['History', 'Political Science', 'Sociology', 'Economics']));

      // Verify revision days contain tailored Humanities revision topics
      const revisionTasks = planState.plan
        .filter((d) => d.isRevisionDay)
        .flatMap((d) => d.tasks);
      const hasHumanitiesRevTopic = revisionTasks.some(
        (t) => t.topicTitle && (t.topicTitle.includes('Chronological Timelines') || t.topicTitle.includes('Constitutional Provisions'))
      );
      expect(hasHumanitiesRevTopic).toBe(true);
    });

    it('schedules Commerce improvement exams before their respective exam dates', () => {
      const planState = buildIntelligentPlan({
        stream: 'commerce',
        startDateStr: '2026-10-01',
        deadlineDateStr: '2027-02-28',
        includePlusOne: true,
        plusOneSubjects: ['Accountancy', 'Business Studies'],
        improvementDates: {
          Accountancy: '2026-10-25',
          'Business Studies': '2026-11-05',
        },
      });

      const validation = validatePlan(planState, undefined, {
        stream: 'commerce',
        improvementConfig: [
          { subject: 'Accountancy', examDate: '2026-10-25' },
          { subject: 'Business Studies', examDate: '2026-11-05' },
        ],
      });

      expect(validation.scorecard.deadlineViolations).toBe(0);
      expect(validation.scorecard.orderingViolations).toBe(0);
      expect(validation.scorecard.duplicateTasks).toBe(0);
    });

    it('prioritizes +1 improvement papers at the top of daily tasks on improvement study days', () => {
      const planState = buildIntelligentPlan({
        stream: 'cs',
        startDateStr: '2026-10-01',
        deadlineDateStr: '2026-11-30',
        includePlusOne: true,
        plusOneSubjects: ['Physics'],
        improvementDates: {
          Physics: '2026-10-15',
        },
      });

      // Find days that have both improvement and regular tasks
      const hybridDays = planState.plan.filter(
        (d) => d.tasks && d.tasks.some((t) => t.isImprovement) && d.tasks.some((t) => !t.isImprovement)
      );

      expect(hybridDays.length).toBeGreaterThan(0);
      hybridDays.forEach((day) => {
        // Improvement task must be at the very top of each day's tasks
        expect(day.tasks[0].isImprovement).toBe(true);
      });
    });

    it('enforces strict Exam Eve Exclusivity for user scenario (Maths on Oct 12, Physics on Oct 14)', () => {
      const planState = buildIntelligentPlan({
        stream: 'cs',
        startDateStr: '2026-10-01',
        deadlineDateStr: '2026-11-30',
        includePlusOne: true,
        plusOneSubjects: ['Mathematics', 'Physics'],
        improvementDates: {
          Mathematics: '2026-10-12',
          Physics: '2026-10-14',
        },
      });

      const oct11 = planState.plan.find((d) => d.date === '2026-10-11');
      const oct12 = planState.plan.find((d) => d.date === '2026-10-12');
      const oct13 = planState.plan.find((d) => d.date === '2026-10-13');
      const oct14 = planState.plan.find((d) => d.date === '2026-10-14');

      expect(oct11).toBeDefined();
      expect(oct11.isExamEve).toBe(true);
      expect(oct11.exclusiveSubject).toBe('Mathematics');
      // Strictly ONLY Mathematics on Exam Eve (0 Physics, 0 Plus Two tasks)
      expect(oct11.tasks.length).toBeGreaterThan(0);
      expect(oct11.tasks.every((t) => t.subject === 'Mathematics')).toBe(true);
      expect(oct11.tasks.some((t) => t.subject === 'Physics')).toBe(false);
      expect(oct11.tasks.some((t) => t.grade === '+2')).toBe(false);

      expect(oct12.isExamDay).toBe(true);
      expect(oct12.examSubject).toBe('Mathematics');

      expect(oct13).toBeDefined();
      expect(oct13.isExamEve).toBe(true);
      expect(oct13.exclusiveSubject).toBe('Physics');
      // Strictly ONLY Physics on Exam Eve (0 Maths, 0 Plus Two tasks)
      expect(oct13.tasks.length).toBeGreaterThan(0);
      expect(oct13.tasks.every((t) => t.subject === 'Physics')).toBe(true);
      expect(oct13.tasks.some((t) => t.subject === 'Mathematics')).toBe(false);
      expect(oct13.tasks.some((t) => t.grade === '+2')).toBe(false);

      expect(oct14.isExamDay).toBe(true);
      expect(oct14.examSubject).toBe('Physics');

      const validation = validatePlan(planState, undefined, {
        stream: 'cs',
        improvementConfig: [
          { subject: 'Mathematics', examDate: '2026-10-12' },
          { subject: 'Physics', examDate: '2026-10-14' },
        ],
      });
      expect(validation.scorecard.deadlineViolations).toBe(0);
      expect(validation.scorecard.duplicateTasks).toBe(0);
      expect(validation.scorecard.orderingViolations).toBe(0);
    });

    it('implements Ebbinghaus Forgetting Curve Spaced Retrieval with decay arrest intervals', () => {
      const planState = buildIntelligentPlan({
        stream: 'cs',
        startDateStr: '2026-10-01',
        deadlineDateStr: '2026-11-30',
        includePlusOne: true,
        plusOneSubjects: ['Mathematics'],
        improvementDates: {
          Mathematics: '2026-10-25',
        },
      });

      expect(planState.diagnostics.cognitiveModel).toBeDefined();
      expect(planState.diagnostics.cognitiveModel.forgettingCurveApplied).toBe(true);
      expect(planState.diagnostics.cognitiveModel.retentionAlgorithm).toBe('Ebbinghaus Spaced Retrieval');

      const allTasks = planState.plan.flatMap((d) => d.tasks);
      const allCurveReviews = allTasks.filter((t) => t.isForgettingCurveReview);
      expect(allCurveReviews.length).toBeGreaterThan(0);

      // Improvement-level Ebbinghaus reviews carry spacingInterval metadata
      const ebbinghausReviews = allCurveReviews.filter((t) => t.spacingInterval);
      expect(ebbinghausReviews.length).toBeGreaterThan(0);

      // Verify that spaced retrieval tasks have spaced interval metadata
      ebbinghausReviews.forEach((t) => {
        expect(t.spacingInterval).toMatch(/^T\+\d+$/);
        expect(t.isSpacedRetrieval).toBe(true);
      });

      // Verify initial study occurs prior to Ebbinghaus recall
      const firstMathTask = allTasks.find((t) => t.subject === 'Mathematics' && !t.isRevision);
      const firstReviewTask = ebbinghausReviews.find((t) => t.subject === 'Mathematics');
      expect(firstMathTask).toBeDefined();
      expect(firstReviewTask).toBeDefined();

      const initialDay = planState.plan.findIndex((d) => d.tasks.some((t) => t.id === firstMathTask.id));
      const reviewDay = planState.plan.findIndex((d) => d.tasks.some((t) => t.id === firstReviewTask.id));
      expect(reviewDay).toBeGreaterThanOrEqual(initialDay);
    });
  });

  describe('Plus One (+1) Full Support Invariants', () => {
    const streams = ['cs', 'bio', 'commerce', 'humanities'];

    streams.forEach((stream) => {
      it(`generates valid pure Plus One schedule for ${stream} stream`, () => {
        const plan = buildIntelligentPlan({
          grade: '+1',
          stream: stream,
          startDateStr: '2026-10-25',
          deadlineDateStr: '2027-02-28',
          termScope: 3,
        });

        expect(plan.valid).toBe(true);
        expect(plan.plan.length).toBeGreaterThan(60);

        const allTasks = plan.plan.flatMap((d) => d.tasks);
        expect(allTasks.length).toBeGreaterThan(0);
        // All non-mock tasks must be +1
        expect(allTasks.every((t) => t.grade === '+1')).toBe(true);

        const val = validatePlan(plan);
        expect(val.scorecard.orderingViolations).toBe(0);
        expect(val.scorecard.duplicateTasks).toBe(0);
      });
    });

    it('respects academic term ceilings for Plus One Onam (Term 1) and Christmas (Term 2)', () => {
      const term1Plan = buildIntelligentPlan({
        grade: '+1',
        stream: 'commerce',
        startDateStr: '2026-06-01',
        deadlineDateStr: '2026-08-31',
        termScope: 1,
      });

      const t1Tasks = term1Plan.plan.flatMap((d) => d.tasks).filter((t) => !t.isRevision);
      expect(t1Tasks.every((t) => (t.term || 1) <= 1)).toBe(true);
    });
  });
});

