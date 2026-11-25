import { describe, it, expect } from 'vitest';
import {
  buildIntelligentPlan,
  validatePlan,
  getCanonicalTasks,
  formatLocalDateStr,
} from '../src/engine/planner.js';
import {
  generateSchedule,
  validateSchedule,
} from '../src/core/scheduler.js';

function addDays(startDateStr, daysToAdd) {
  const d = new Date(startDateStr + 'T00:00:00');
  d.setDate(d.getDate() + daysToAdd);
  return formatLocalDateStr(d);
}

function analyzePlanGranularity(planDays) {
  const studyDays = planDays.filter((d) => !d.isRevisionDay && !d.isRestDay);
  const allLearningTasks = studyDays.flatMap((d) => d.tasks || []).filter((t) => !t.isRevision && !t.isExamEveTask);
  const multiPartChapIds = new Set(allLearningTasks.filter((t) => (t.totalParts || 1) > 1).map((t) => t.chapId));
  const fullOnDayChapIds = new Set(allLearningTasks.filter((t) => t.isFullOnDay).map((t) => t.chapId));

  // Count days where 2+ different multi-part chapters each only get a single fragment
  const scatteredFragmentDays = studyDays.filter((d) => {
    const tasks = (d.tasks || []).filter((t) => !t.isRevision && !t.isExamEveTask);
    if (tasks.length < 2) return false;
    const chaps = new Set(tasks.map((t) => t.chapId));
    return chaps.size === tasks.length && tasks.some((t) => (t.totalParts || 1) > 1);
  }).length;

  // Verify intra-day contiguity: parts of the same chapId on the same day must be adjacent and ascending
  let intraDayInterleavingViolations = 0;
  let intraDayPartOrderViolations = 0;

  studyDays.forEach((d) => {
    const tasks = (d.tasks || []).filter((t) => !t.isRevision && !t.isExamEveTask && t.chapId);
    const seenFinished = new Set();
    let activeChap = null;
    let lastPart = -Infinity;

    tasks.forEach((t) => {
      if (t.chapId !== activeChap) {
        if (seenFinished.has(t.chapId)) {
          intraDayInterleavingViolations++;
        }
        if (activeChap !== null) {
          seenFinished.add(activeChap);
        }
        activeChap = t.chapId;
        lastPart = t.part || 0;
      } else {
        if ((t.part || 0) < lastPart) {
          intraDayPartOrderViolations++;
        }
        lastPart = t.part || 0;
      }
    });
  });

  return {
    studyDaysCount: studyDays.length,
    multiPartChaptersCount: multiPartChapIds.size,
    fullOnDayChaptersCount: fullOnDayChapIds.size,
    fullOnDayRatio: multiPartChapIds.size > 0 ? fullOnDayChapIds.size / multiPartChapIds.size : 1,
    scatteredFragmentDays,
    intraDayInterleavingViolations,
    intraDayPartOrderViolations,
  };
}

describe('Runway-Adaptive Chapter Granularity Engine', () => {
  const streams = ['cs', 'bio', 'commerce', 'humanities'];
  const grades = ['+1', '+2'];
  const startDate = '2026-10-01';

  describe('1. Short/Tight vs Long/Abundant Runway Adaptation across All Streams & Grades', () => {
    grades.forEach((grade) => {
      streams.forEach((stream) => {
        it(`adapts granularity for ${grade} ${stream}: coalesces whole chapters on 30d/45d and spreads parts on 135d`, () => {
          const shortDeadline = addDays(startDate, 29); // 30 days
          const medDeadline = addDays(startDate, 44);   // 45 days
          const longDeadline = addDays(startDate, 134); // 135 days

          const canonical = getCanonicalTasks({ grade, stream, termScope: 3 });

          const shortPlan = buildIntelligentPlan({
            grade,
            stream,
            startDateStr: startDate,
            deadlineDateStr: shortDeadline,
            termScope: 3,
          });
          const medPlan = buildIntelligentPlan({
            grade,
            stream,
            startDateStr: startDate,
            deadlineDateStr: medDeadline,
            termScope: 3,
          });
          const longPlan = buildIntelligentPlan({
            grade,
            stream,
            startDateStr: startDate,
            deadlineDateStr: longDeadline,
            termScope: 3,
          });

          expect(shortPlan.diagnostics.granularity.mode).toBe('chapter_block');
          expect(medPlan.diagnostics.granularity.mode).toBe('chapter_block');
          expect(longPlan.diagnostics.granularity.mode).toBe('multi_part');

          const shortStats = analyzePlanGranularity(shortPlan.planDays);
          const medStats = analyzePlanGranularity(medPlan.planDays);
          const longStats = analyzePlanGranularity(longPlan.planDays);

          // Tight & moderate runways coalesce nearly all multi-part chapters onto single days
          expect(shortStats.fullOnDayRatio).toBeGreaterThanOrEqual(0.9);
          expect(medStats.fullOnDayRatio).toBeGreaterThanOrEqual(0.85);
          expect(shortStats.scatteredFragmentDays).toBe(0);
          expect(medStats.scatteredFragmentDays).toBe(0);

          // Long runway preserves smooth part-by-part pacing
          expect(longStats.fullOnDayChaptersCount).toBe(0);

          // Contiguity & validation invariants hold everywhere
          [shortPlan, medPlan, longPlan].forEach((plan) => {
            const stats = analyzePlanGranularity(plan.planDays);
            expect(stats.intraDayInterleavingViolations).toBe(0);
            expect(stats.intraDayPartOrderViolations).toBe(0);
            const val = validatePlan(plan.planDays, canonical, { stream });
            expect(val.isValid).toBe(true);
            expect(val.scorecard.omittedTasks).toBe(0);
            expect(val.scorecard.duplicateTasks).toBe(0);
            expect(val.scorecard.orderingViolations).toBe(0);
          });
        });
      });
    });
  });

  describe('2. Parity between buildIntelligentPlan (planner.js) and generateSchedule (scheduler.js)', () => {
    it('produces chapter_block plans on 14d, 30d, 60d and multi_part on 120d via generateSchedule', () => {
      streams.forEach((stream) => {
        const shortSched = generateSchedule({
          stream,
          startDate,
          examDate: addDays(startDate, 29),
        });
        const modSched = generateSchedule({
          stream,
          startDate,
          examDate: addDays(startDate, 59),
        });
        const longSched = generateSchedule({
          stream,
          startDate,
          examDate: addDays(startDate, 119),
        });

        expect(shortSched.diagnostics.granularity.mode).toBe('chapter_block');
        expect(modSched.diagnostics.granularity.mode).toBe('chapter_block');
        expect(longSched.diagnostics.granularity.mode).toBe('multi_part');

        const shortStats = analyzePlanGranularity(shortSched.planDays);
        const modStats = analyzePlanGranularity(modSched.planDays);
        expect(shortStats.fullOnDayRatio).toBeGreaterThanOrEqual(0.9);
        expect(modStats.fullOnDayRatio).toBeGreaterThanOrEqual(0.75);
        expect(shortStats.scatteredFragmentDays).toBe(0);
        expect(modStats.scatteredFragmentDays).toBe(0);

        [shortSched, modSched, longSched].forEach((sched) => {
          const val = validateSchedule(sched);
          expect(val.isValid).toBe(true);
          expect(val.scorecard.orderingViolations).toBe(0);
          expect(val.scorecard.duplicateTasks).toBe(0);
        });
      });
    });
  });

  describe('3. Dynamic Density Adaptation (90-day High-Density, Rest Days, & Partial Rebalancing)', () => {
    it('switches a 90-day runway to chapter_block automatically when combined +1/+2 tasks create high chapter density', () => {
      const p2 = getCanonicalTasks({ grade: '+2', stream: 'bio', termScope: 3 });
      const p1 = getCanonicalTasks({ grade: '+1', stream: 'bio', termScope: 3 });
      const combinedTasks = [...p2, ...p1]; // ~106 chapters in 90 days -> < 1 day/chapter

      const plan = buildIntelligentPlan(addDays(startDate, 89), combinedTasks, startDate, [], 'bio');

      expect(plan.diagnostics.granularity.mode).toBe('chapter_block');
      const stats = analyzePlanGranularity(plan.planDays);
      expect(stats.fullOnDayRatio).toBeGreaterThanOrEqual(0.8);
      expect(stats.intraDayInterleavingViolations).toBe(0);

      const val = validatePlan(plan.planDays, combinedTasks, { stream: 'bio' });
      expect(val.isValid).toBe(true);
    });

    it('switches a 75-day runway to chapter_block when weekly rest days tighten effective active study days', () => {
      const plan = buildIntelligentPlan({
        grade: '+2',
        stream: 'bio',
        startDateStr: startDate,
        deadlineDateStr: addDays(startDate, 74),
        personalization: {
          weeklyRhythm: 'rest_day',
          restDayOfWeek: 0, // Sundays off reduces active study days below chapter threshold
        },
      });

      expect(plan.diagnostics.granularity.mode).toBe('chapter_block');
      const stats = analyzePlanGranularity(plan.planDays);
      expect(stats.fullOnDayRatio).toBeGreaterThanOrEqual(0.65);
      expect(plan.isValid).toBe(true);
    });

    it('adapts back to multi_part when only a small subset of chapters remains during rebalancing', () => {
      const allTasks = getCanonicalTasks({ grade: '+2', stream: 'cs', termScope: 3 });
      // Only 4 chapters left (~9 tasks) across 21 days -> plenty of runway per chapter
      const remainingFew = allTasks.filter((t) => t.chapNumber === 1);

      const rebalanced = buildIntelligentPlan(
        addDays(startDate, 20),
        remainingFew,
        startDate,
        [],
        'cs'
      );

      expect(rebalanced.diagnostics.granularity.mode).toBe('multi_part');
      const stats = analyzePlanGranularity(rebalanced.planDays);
      expect(stats.fullOnDayChaptersCount).toBe(0);
      expect(validatePlan(rebalanced.planDays, remainingFew, { stream: 'cs' }).isValid).toBe(true);
    });
  });

  describe('4. Generic Custom Syllabi & Tight Improvement Runways', () => {
    it('handles arbitrary custom subject/chapter names generically without hardcoding', () => {
      const customTasks = [];
      const customSubjects = ['Astrophysics', 'World History', 'Linear Algebra', 'Microeconomics'];
      customSubjects.forEach((subject, sIdx) => {
        for (let ch = 1; ch <= 6; ch++) {
          const totalParts = ch % 2 === 0 ? 3 : 2;
          for (let part = 1; part <= totalParts; part++) {
            customTasks.push({
              id: `CUSTOM_${sIdx}_${ch}_P${part}`,
              grade: '+2',
              subject,
              chapNumber: ch,
              chapId: `CUSTOM_${sIdx}_${ch}`,
              chapterName: `${subject} Unit ${ch}`,
              part,
              totalParts,
              term: 1,
              topicTitle: `Part ${part}/${totalParts}`,
              estimatedMinutes: 50,
            });
          }
        }
      });

      // Tight 14-day runway for 24 multi-part chapters -> chapter_block
      const tightCustom = generateSchedule({
        stream: 'custom',
        subjects: customSubjects,
        tasks: customTasks,
        startDate,
        examDate: addDays(startDate, 13),
      });

      expect(tightCustom.diagnostics.granularity.mode).toBe('chapter_block');
      const tightStats = analyzePlanGranularity(tightCustom.planDays);
      expect(tightStats.fullOnDayRatio).toBeGreaterThanOrEqual(0.9);
      expect(tightStats.intraDayInterleavingViolations).toBe(0);
      expect(tightStats.intraDayPartOrderViolations).toBe(0);

      // Abundant 60-day runway for 24 chapters -> multi_part
      const looseCustom = generateSchedule({
        stream: 'custom',
        subjects: customSubjects,
        tasks: customTasks,
        startDate,
        examDate: addDays(startDate, 59),
      });

      expect(looseCustom.diagnostics.granularity.mode).toBe('multi_part');
      const looseStats = analyzePlanGranularity(looseCustom.planDays);
      expect(looseStats.fullOnDayChaptersCount).toBe(0);
    });

    it('coalesces +1 improvement chapters on tight pre-exam windows while keeping Exam Eve exclusive', () => {
      const impPlan = buildIntelligentPlan({
        stream: 'cs',
        startDateStr: '2026-10-01',
        deadlineDateStr: '2026-11-30',
        includePlusOne: true,
        plusOneSubjects: ['Physics'],
        improvementDates: {
          Physics: '2026-10-12', // 11-day tight window for 14 Physics +1 chapters
        },
      });

      const oct11 = impPlan.planDays.find((d) => d.date === '2026-10-11');
      expect(oct11.isExamEve).toBe(true);
      expect(oct11.tasks.every((t) => t.subject === 'Physics')).toBe(true);

      const p1MultiFull = impPlan.planDays
        .flatMap((d) => d.tasks)
        .filter((t) => t.isImprovement && !t.isRevision && t.isFullOnDay);
      expect(p1MultiFull.length).toBeGreaterThan(0);

      const val = validatePlan(impPlan.planDays, undefined, {
        stream: 'cs',
        improvementConfig: [{ subject: 'Physics', examDate: '2026-10-12' }],
      });
      expect(val.isValid).toBe(true);
      expect(val.scorecard.deadlineViolations).toBe(0);
    });
  });
});
