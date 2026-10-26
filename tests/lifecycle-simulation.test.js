import { describe, expect, it } from 'vitest';
import {
  buildIntelligentPlan,
  validatePlan,
  getStreamSubjects,
  formatLocalDateStr,
  calculateDaysBetween,
} from '../src/engine/planner.js';
import { getRemainingPlanTasks } from '../src/utils/plan-scope.js';
import { PLUS_ONE_CHAPTERS } from '../src/data/syllabus-plus-one.js';
import { PLUS_TWO_CHAPTERS } from '../src/data/syllabus-plus-two.js';

/**
 * Helper to simulate student daily progression across an entire study plan.
 * Advances day-by-day from Day 1 to the final day, completing all assigned study blocks,
 * tracking chapter mastery transitions, revision buffers, and progress percentages.
 */
function simulateStudentLifecycle({
  grade = '+2',
  stream = 'cs',
  durationDays = 60,
  startDateStr = '2026-10-01',
  targetTerm = 3,
  intensity = 'balanced',
  personalization = {},
}) {
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(start.getTime() + durationDays * 86400000);
  const deadlineDateStr = formatLocalDateStr(end);

  const canonicalTasks = getRemainingPlanTasks({ grade, stream, targetTerm });
  const planResult = buildIntelligentPlan(
    deadlineDateStr,
    canonicalTasks,
    startDateStr,
    [],
    stream,
    { intensity, personalization }
  );

  const planDays = planResult.planDays;
  const completedTaskIds = new Set();
  const completedChapterIds = new Set();
  const dailyProgressHistory = [];
  const chapterPartCounts = new Map();

  // Pre-calculate total parts per chapter
  canonicalTasks.forEach(task => {
    if (!task.isRevision && task.chapId) {
      chapterPartCounts.set(task.chapId, (chapterPartCounts.get(task.chapId) || 0) + 1);
    }
  });

  const chapterCompletedParts = new Map();

  // Day-by-day progression
  for (let dayIndex = 0; dayIndex < planDays.length; dayIndex++) {
    const day = planDays[dayIndex];
    const studyTasks = (day.tasks || []).filter(t => !t.isRevision && !t.isExamEveTask);

    // Complete all tasks assigned for this day
    studyTasks.forEach(task => {
      task.completed = true;
      completedTaskIds.add(task.id);

      if (task.chapId) {
        const done = (chapterCompletedParts.get(task.chapId) || 0) + 1;
        chapterCompletedParts.set(task.chapId, done);
        const required = chapterPartCounts.get(task.chapId) || 1;
        if (done >= required) {
          completedChapterIds.add(task.chapId);
        }
      }
    });

    const completionPercentage = canonicalTasks.length > 0
      ? Math.round((completedTaskIds.size / canonicalTasks.length) * 100)
      : 100;

    dailyProgressHistory.push({
      dayNumber: day.dayNumber,
      date: day.date,
      isRevisionDay: day.isRevisionDay,
      isRestDay: day.isRestDay,
      tasksToday: day.tasks.length,
      studyTasksToday: studyTasks.length,
      totalCompletedTasks: completedTaskIds.size,
      masteredChaptersCount: completedChapterIds.size,
      completionPercentage,
    });
  }

  const validation = validatePlan(planDays, canonicalTasks, { stream });

  return {
    grade,
    stream,
    durationDays,
    planResult,
    planDays,
    canonicalTasks,
    completedTaskIds,
    completedChapterIds,
    totalChapters: chapterPartCounts.size,
    dailyProgressHistory,
    validation,
  };
}

describe('R1. Full Student Lifecycle Multi-Day Simulation (Day 1 to 100% Completion)', () => {
  const combinations = [
    { grade: '+1', stream: 'cs', label: 'Plus One Computer Science' },
    { grade: '+1', stream: 'bio', label: 'Plus One Biology' },
    { grade: '+1', stream: 'commerce', label: 'Plus One Commerce' },
    { grade: '+1', stream: 'humanities', label: 'Plus One Humanities' },
    { grade: '+2', stream: 'cs', label: 'Plus Two Computer Science' },
    { grade: '+2', stream: 'bio', label: 'Plus Two Biology' },
    { grade: '+2', stream: 'commerce', label: 'Plus Two Commerce' },
    { grade: '+2', stream: 'humanities', label: 'Plus Two Humanities' },
  ];

  combinations.forEach(({ grade, stream, label }) => {
    it(`simulates day-by-day progression to 100% completion for ${label}`, () => {
      const sim = simulateStudentLifecycle({ grade, stream, durationDays: 60 });

      // Invariant 1: Plan duration matches requested runway (60 days + 1 = 61 days)
      expect(sim.planDays.length).toBe(61);

      // Invariant 2: Plan is strictly valid under the engine validator
      expect(sim.validation.isValid).toBe(true);
      expect(sim.validation.scorecard.omittedTasks).toBe(0);
      expect(sim.validation.scorecard.duplicateTasks).toBe(0);
      expect(sim.validation.scorecard.orderingViolations).toBe(0);

      // Invariant 3: Zero task loss — every canonical syllabus task was completed
      expect(sim.completedTaskIds.size).toBe(sim.canonicalTasks.length);

      // Invariant 4: Zero orphaned chapters — 100% of syllabus chapters reached mastery
      expect(sim.completedChapterIds.size).toBe(sim.totalChapters);
      expect(sim.totalChapters).toBeGreaterThan(0);

      // Invariant 5: Monotonic progression — progress percentage never decreases
      const history = sim.dailyProgressHistory;
      for (let i = 1; i < history.length; i++) {
        expect(history[i].completionPercentage).toBeGreaterThanOrEqual(history[i - 1].completionPercentage);
      }

      // Invariant 6: Final day reaches exactly 100% completion
      expect(history[history.length - 1].completionPercentage).toBe(100);

      // Invariant 7: Revision buffer preserved at end of plan
      expect(sim.planResult.revisionDaysCount).toBe(7);
      const revisionDays = sim.planDays.filter(d => d.isRevisionDay);
      expect(revisionDays.length).toBe(7);
      expect(revisionDays[revisionDays.length - 1].dayNumber).toBe(sim.planDays.length);

      // Invariant 8: Stream subject isolation — zero tasks from foreign streams
      const allowedSubjects = getStreamSubjects(stream);
      sim.planDays.forEach(day => {
        day.tasks.forEach(task => {
          if (!task.isRevision && task.subject) {
            expect(allowedSubjects).toContain(task.subject);
            expect(task.grade).toBe(grade);
          }
        });
      });
    });
  });

  it('verifies topic and chapter mastery transitions dynamically as parts are completed', () => {
    const sim = simulateStudentLifecycle({ grade: '+2', stream: 'cs', durationDays: 45 });
    const history = sim.dailyProgressHistory;

    // Initially at Day 1 start, 0 completed tasks
    expect(history[0].totalCompletedTasks).toBeGreaterThan(0); // day 1 completes its tasks

    // Mastered chapters count increases as chapters are finished
    const masteredProgression = history.map(h => h.masteredChaptersCount);
    const finalMastered = masteredProgression[masteredProgression.length - 1];
    expect(finalMastered).toBe(sim.totalChapters);

    // Ensure non-decreasing chapter mastery
    for (let i = 1; i < masteredProgression.length; i++) {
      expect(masteredProgression[i]).toBeGreaterThanOrEqual(masteredProgression[i - 1]);
    }
  });
});

describe('R1. Pacing Presets Verification (Zero Dropped, Skipped, Duplicated, or Orphaned Chapters)', () => {
  const presets = [
    { name: '30-day Sprint', days: 30, expectedRevisionDays: 4 },
    { name: '60-day Balanced Sprint', days: 60, expectedRevisionDays: 7 },
    { name: 'Term 2 Exam Preset', days: 45, expectedRevisionDays: 7, termScope: 2 },
    { name: 'Christmas Exam Preset', days: 50, expectedRevisionDays: 7, termScope: 2 },
    { name: 'Board Exam Comprehensive', days: 120, expectedRevisionDays: 10, termScope: 3 },
  ];

  const testStreams = ['cs', 'bio', 'commerce', 'humanities'];
  const grades = ['+1', '+2'];

  presets.forEach(preset => {
    describe(`Preset: ${preset.name} (${preset.days} days, revision: ${preset.expectedRevisionDays}d)`, () => {
      grades.forEach(grade => {
        testStreams.forEach(stream => {
          it(`guarantees complete chapter coverage and zero defects for ${grade} ${stream}`, () => {
            const startDate = '2026-10-01';
            const deadline = formatLocalDateStr(new Date(new Date(startDate + 'T00:00:00').getTime() + preset.days * 86400000));
            const tasks = getRemainingPlanTasks({ grade, stream, targetTerm: preset.termScope || 3 });

            const plan = buildIntelligentPlan(deadline, tasks, startDate, [], stream, {
              termScope: preset.termScope || 3,
              intensity: 'balanced',
            });

            // 1. Revision buffer matches formula
            expect(plan.revisionDaysCount).toBe(preset.expectedRevisionDays);

            // 2. Total plan days equals duration + 1 (inclusive)
            expect(plan.planDays.length).toBe(preset.days + 1);

            // 3. Chronological date sequence without gaps
            for (let i = 0; i < plan.planDays.length; i++) {
              expect(plan.planDays[i].dayNumber).toBe(i + 1);
              if (i > 0) {
                const prevDate = new Date(plan.planDays[i - 1].date + 'T00:00:00');
                const currDate = new Date(plan.planDays[i].date + 'T00:00:00');
                expect(currDate.getTime() - prevDate.getTime()).toBe(86400000);
              }
            }

            // 4. Zero omitted tasks
            const scheduledStudyTasks = plan.planDays
              .filter(d => !d.isRevisionDay)
              .flatMap(d => d.tasks)
              .filter(t => !t.isRevision && !t.isExamEveTask);

            expect(scheduledStudyTasks.length).toBe(tasks.length);

            // 5. Zero duplicate tasks
            const scheduledIds = new Set();
            scheduledStudyTasks.forEach(t => {
              expect(scheduledIds.has(t.id)).toBe(false);
              scheduledIds.add(t.id);
            });
            expect(scheduledIds.size).toBe(tasks.length);

            // 6. Strict pedagogical ordering: Part 1 before Part 2
            const partSchedule = new Map();
            scheduledStudyTasks.forEach(t => {
              if (t.chapId && t.part) {
                if (!partSchedule.has(t.chapId)) partSchedule.set(t.chapId, []);
                partSchedule.get(t.chapId).push({ part: t.part, dayIndex: t.dayIndex });
              }
            });

            partSchedule.forEach((parts, chapId) => {
              for (let i = 0; i < parts.length - 1; i++) {
                expect(parts[i].part).toBeLessThanOrEqual(parts[i + 1].part);
              }
            });

            // 7. validatePlan verification scorecard
            const val = validatePlan(plan.planDays, tasks, { stream });
            expect(val.isValid).toBe(true);
            expect(val.scorecard.omittedTasks).toBe(0);
            expect(val.scorecard.duplicateTasks).toBe(0);
            expect(val.scorecard.orderingViolations).toBe(0);
          });
        });
      });
    });
  });
});

describe('Tier 4 Real-World Application Scenario 1: +2 Bio Student 60-Day Sprint to Board Exams', () => {
  it('executes end-to-end 60-day study sprint across 5 core subjects to 100% board readiness', () => {
    const grade = '+2';
    const stream = 'bio';
    const durationDays = 60;
    const startDateStr = '2026-10-01';

    const sim = simulateStudentLifecycle({
      grade,
      stream,
      durationDays,
      startDateStr,
      targetTerm: 3,
      intensity: 'balanced',
    });

    // 1. Verify all 5 subjects are scheduled: Physics, Chemistry, Mathematics, Botany, Zoology
    const distinctSubjects = new Set(sim.canonicalTasks.map(t => t.subject));
    expect(distinctSubjects).toEqual(new Set(['Physics', 'Chemistry', 'Mathematics', 'Botany', 'Zoology']));

    // 2. Day 1 has study tasks
    const day1 = sim.dailyProgressHistory[0];
    expect(day1.studyTasksToday).toBeGreaterThanOrEqual(1);
    expect(day1.totalCompletedTasks).toBeGreaterThanOrEqual(1);

    // 3. Middle of sprint (Day 30) has steady progress ~50%
    const day30 = sim.dailyProgressHistory[29];
    expect(day30.completionPercentage).toBeGreaterThanOrEqual(45);
    expect(day30.completionPercentage).toBeLessThanOrEqual(70);

    // 4. Before revision buffer (Day 54), all syllabus tasks are completed
    const day54 = sim.dailyProgressHistory[53];
    expect(day54.totalCompletedTasks).toBe(sim.canonicalTasks.length);
    expect(day54.completionPercentage).toBe(100);

    // 5. Revision buffer (Days 55-61) preserves dedicated review runway
    const revisionDays = sim.planDays.filter(d => d.isRevisionDay);
    expect(revisionDays.length).toBe(7);
    revisionDays.forEach(rd => {
      expect(rd.isRevisionDay).toBe(true);
    });

    // 6. Complete syllabus chapter mastery achieved
    expect(sim.completedChapterIds.size).toBe(sim.totalChapters);
    expect(sim.validation.isValid).toBe(true);
  });
});
