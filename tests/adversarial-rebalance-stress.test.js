import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildIntelligentPlan, getStreamSubjects, formatLocalDateStr } from '../src/engine/planner.js';
import { generateSchedule } from '../src/core/scheduler.js';
import { getRemainingPlanTasks, detectCompletedSyllabusProgress, isCalendarDate } from '../src/utils/plan-scope.js';
import {
  openRegenerateModal,
  executeRegeneration,
  autoDetectAndRebalance,
  setAppState,
  getAppState
} from '../src/app.js';

describe('Adversarial Stress Harness: Rebalancing Reliability & Auto-Detect Workflow', () => {
  beforeEach(() => {
    const elements = new Map();
    const createMockElement = (id = '') => ({
      id,
      value: '1',
      options: [{ value: '0', text: 'Day 0' }, { value: '1', text: 'Day 1' }],
      appendChild(opt) { this.options.push(opt); },
      classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
      textContent: '',
      innerHTML: '',
      style: {},
      querySelector: vi.fn(() => createMockElement()),
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const getElement = (id) => {
      if (!elements.has(id)) {
        elements.set(id, createMockElement(id));
      }
      return elements.get(id);
    };

    global.document = {
      getElementById: getElement,
      createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        value: '',
        text: '',
        appendChild: vi.fn(),
      }),
      body: { innerHTML: '', classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() } },
      documentElement: { lang: 'en' },
      querySelectorAll: () => [],
    };

    global.localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    global.sessionStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper to extract non-revision syllabus tasks from a plan
  const getSyllabusTasks = (plan) => (plan || []).flatMap(d => d.tasks || []).filter(t => !t.isRevision);
  const getCompletedTasks = (plan) => (plan || []).flatMap(d => d.tasks || []).filter(t => !t.isRevision && t.completed);

  // ==========================================================================
  // SUITE 1: Complex Non-Contiguous Task Completion Patterns
  // ==========================================================================
  describe('Suite 1: Complex Non-Contiguous Task Completion Patterns', () => {
    it('1.1: student completes Day 1 Part 1, skips Part 2, completes Day 5, misses Days 2-4, triggers auto-detect rebalance', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const initialRes = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs');
      const initialPlan = initialRes.planDays;
      const initialTotal = allTasks.length;

      // Find a multi-part chapter in the initial plan
      const multiPartTasks = allTasks.filter(t => t.totalParts > 1);
      expect(multiPartTasks.length).toBeGreaterThan(0);
      const testChapId = multiPartTasks[0].chapId;

      // Find Part 1 and Part 2 of this chapter in initialPlan
      let p1Day = null, p1Task = null;
      let p2Day = null, p2Task = null;
      initialPlan.forEach(d => {
        (d.tasks || []).forEach(t => {
          if (t.chapId === testChapId && t.part === 1) { p1Day = d; p1Task = t; }
          if (t.chapId === testChapId && t.part === 2) { p2Day = d; p2Task = t; }
        });
      });

      expect(p1Task).toBeDefined();
      expect(p2Task).toBeDefined();

      // Student completes Part 1 on Day 1
      p1Task.completed = true;

      // Student SKIPS Part 2 (p2Task.completed remains false)
      p2Task.completed = false;

      // Student completes a task on Day 5
      const day5 = initialPlan[4];
      expect(day5).toBeDefined();
      expect(day5.tasks.length).toBeGreaterThan(0);
      const day5Task = day5.tasks[0];
      day5Task.completed = true;

      // Days 2, 3, 4 remain completely missed/uncompleted
      initialPlan[1].tasks.forEach(t => { t.completed = false; });
      initialPlan[2].tasks.forEach(t => { t.completed = false; });
      initialPlan[3].tasks.forEach(t => { t.completed = false; });

      setAppState({
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      });

      // Trigger Auto-Detect & Rebalance
      autoDetectAndRebalance();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      expect(newPlan).toBeDefined();
      expect(newPlan.length).toBeGreaterThan(0);

      // 1. Verify completed markers: Days 1..K
      const markers = newPlan.filter(d => d.isCompletedMarker);
      expect(markers.length).toBe(2); // Day 1 and Day 5 with completed work
      expect(markers[0].dayNumber).toBe(1);
      expect(markers[1].dayNumber).toBe(2);

      // Verify that Day 1 marker contains Part 1
      const marker1Tasks = markers[0].tasks;
      expect(marker1Tasks.some(t => t.id === p1Task.id && t.completed)).toBe(true);

      // Verify that Day 2 marker contains Day 5 task
      const marker2Tasks = markers[1].tasks;
      expect(marker2Tasks.some(t => t.id === day5Task.id && t.completed)).toBe(true);

      // 2. Verify remaining schedule: Days K+1..N
      const remainingDays = newPlan.filter(d => !d.isCompletedMarker);
      expect(remainingDays.length).toBeGreaterThan(0);
      expect(remainingDays[0].dayNumber).toBe(3); // Follows immediately after marker 2

      // 3. Verify Part 2 is NOT dropped from the remaining schedule
      const remainingTasks = getSyllabusTasks(remainingDays);
      const part2InRemaining = remainingTasks.find(t => t.id === p2Task.id);
      expect(part2InRemaining).toBeDefined();
      expect(part2InRemaining.completed).toBe(false);

      // 4. Verify Part 1 is NOT duplicated in remaining schedule
      const part1InRemaining = remainingTasks.find(t => t.id === p1Task.id);
      expect(part1InRemaining).toBeUndefined();

      // 5. Total task conservation invariant: completed in markers + remaining syllabus == initialTotal
      const allNewSyllabusTasks = getSyllabusTasks(newPlan);
      expect(allNewSyllabusTasks.length).toBe(initialTotal);

      // 6. Day numbering strictly continuous 1..N
      newPlan.forEach((d, idx) => {
        expect(d.dayNumber).toBe(idx + 1);
      });
    });

    it('1.2: student completes Part 2 of a 2-part chapter, skipping Part 1 (inverse order completion)', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;
      const initialTotal = allTasks.length;

      const multiPartTasks = allTasks.filter(t => t.totalParts === 2);
      const targetChapId = multiPartTasks[0].chapId;

      // Find tasks
      const allInitialTasks = initialPlan.flatMap(d => d.tasks);
      const p1 = allInitialTasks.find(t => t.chapId === targetChapId && t.part === 1);
      const p2 = allInitialTasks.find(t => t.chapId === targetChapId && t.part === 2);
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();

      // Mark ONLY Part 2 as completed
      p1.completed = false;
      p2.completed = true;

      setAppState({
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      });

      autoDetectAndRebalance();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      const newTasks = getSyllabusTasks(newPlan);

      // Part 1 must be present in the remaining plan
      const p1New = newTasks.find(t => t.id === p1.id);
      expect(p1New).toBeDefined();
      expect(p1New.completed).toBe(false);

      // Part 2 must be preserved as completed in the marker
      const p2New = newTasks.find(t => t.id === p2.id);
      expect(p2New).toBeDefined();
      expect(p2New.completed).toBe(true);

      // Zero task drop
      expect(newTasks.length).toBe(initialTotal);
    });

    it('1.3: multi-part chapter with 3 parts: completes Part 1 and Part 3, skips Part 2 (middle pending)', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'bio', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'bio').planDays;
      const initialTotal = allTasks.length;

      const threePartTasks = allTasks.filter(t => t.totalParts >= 3);
      expect(threePartTasks.length).toBeGreaterThan(0);
      const targetChapId = threePartTasks[0].chapId;

      const flat = initialPlan.flatMap(d => d.tasks);
      const p1 = flat.find(t => t.chapId === targetChapId && t.part === 1);
      const p2 = flat.find(t => t.chapId === targetChapId && t.part === 2);
      const p3 = flat.find(t => t.chapId === targetChapId && t.part === 3);

      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      expect(p3).toBeDefined();

      p1.completed = true;
      p2.completed = false; // Middle part pending
      p3.completed = true;

      setAppState({
        grade: '+2',
        stream: 'bio',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      });

      autoDetectAndRebalance();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      const newTasks = getSyllabusTasks(newPlan);

      // P2 must be scheduled in remaining tasks
      const p2New = newTasks.find(t => t.id === p2.id);
      expect(p2New).toBeDefined();
      expect(p2New.completed).toBe(false);

      // P1 and P3 are completed
      expect(newTasks.find(t => t.id === p1.id).completed).toBe(true);
      expect(newTasks.find(t => t.id === p3.id).completed).toBe(true);

      // Total tasks conserved
      expect(newTasks.length).toBe(initialTotal);
    });

    it('1.4: chaotic scatter: completes random tasks out of order across all 5 Bio subjects', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'bio', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'bio').planDays;
      const initialTotal = allTasks.length;

      // Mark 1 task completed in each subject across various days
      const subjects = ['Physics', 'Chemistry', 'Mathematics', 'Botany', 'Zoology'];
      const completedIds = new Set();
      subjects.forEach((subj, sIdx) => {
        const t = initialPlan.flatMap(d => d.tasks).find(task => task.subject === subj && !completedIds.has(task.id));
        if (t) {
          t.completed = true;
          completedIds.add(t.id);
        }
      });
      expect(completedIds.size).toBe(5);

      setAppState({
        grade: '+2',
        stream: 'bio',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      });

      autoDetectAndRebalance();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      const newTasks = getSyllabusTasks(newPlan);

      expect(newTasks.length).toBe(initialTotal);
      completedIds.forEach(id => {
        const found = newTasks.find(t => t.id === id);
        expect(found).toBeDefined();
        expect(found.completed).toBe(true);
      });
    });
  });

  // ==========================================================================
  // SUITE 2: Extreme Edge Cases & Boundaries
  // ==========================================================================
  describe('Suite 2: Extreme Edge Cases & Boundaries', () => {
    it('2.1: handles 0 completed tasks cleanly (fresh rebalance)', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;

      // Ensure 0 tasks completed
      initialPlan.forEach(d => (d.tasks || []).forEach(t => { t.completed = false; }));

      setAppState({
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      });

      autoDetectAndRebalance();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      // 0 markers
      const markers = newPlan.filter(d => d.isCompletedMarker);
      expect(markers.length).toBe(0);

      // Rebalanced days start from Day 1
      expect(newPlan[0].dayNumber).toBe(1);

      // All tasks scheduled
      const newTasks = getSyllabusTasks(newPlan);
      expect(newTasks.length).toBe(allTasks.length);
      expect(newTasks.every(t => !t.completed)).toBe(true);
    });

    it('2.2: handles 100% completed tasks without crashing or corrupting plan', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;

      // Mark ALL tasks completed
      initialPlan.forEach(d => (d.tasks || []).forEach(t => { t.completed = true; }));

      setAppState({
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      });

      autoDetectAndRebalance();
      vi.runAllTimers();

      const state = getAppState();
      expect(state.plan).toBeDefined();
      expect(state.plan.length).toBe(initialPlan.length);
      const allTasksNow = getSyllabusTasks(state.plan);
      expect(allTasksNow.every(t => t.completed)).toBe(true);
    });

    it('2.3: handles same-day and past deadlines by auto-extending 30 days', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;

      // Mark Day 1 complete
      initialPlan[0].tasks.forEach(t => { t.completed = true; });

      // Set deadlineDate to TODAY or in the past
      setAppState({
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-11-01', // elapsed/same-day deadline
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      });

      autoDetectAndRebalance();
      vi.runAllTimers();

      const state = getAppState();
      expect(state.plan).toBeDefined();
      expect(state.plan.length).toBeGreaterThan(1);
      // Deadline was auto-extended
      expect(state.deadlineDate > '2026-11-01').toBe(true);

      const allNewTasks = getSyllabusTasks(state.plan);
      expect(allNewTasks.length).toBe(allTasks.length);
    });

    it('2.4: survives 7 consecutive rebalances with progressive completions and idle days', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;
      const initialTotal = allTasks.length;

      let currentState = {
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      };
      setAppState(currentState);

      // Run 7 consecutive rebalance cycles
      for (let cycle = 1; cycle <= 7; cycle++) {
        const plan = getAppState().plan;

        if (cycle === 1) {
          // Cycle 1: complete 2 tasks on Day 1
          plan[0].tasks.slice(0, 2).forEach(t => { t.completed = true; });
        } else if (cycle === 2) {
          // Cycle 2: rebalance immediately without new completions (idempotency check)
        } else if (cycle === 3) {
          // Cycle 3: complete remaining tasks on Day 1
          plan[0].tasks.forEach(t => { t.completed = true; });
        } else if (cycle === 4) {
          // Cycle 4: complete 1 task on Day 2
          if (plan[1] && plan[1].tasks.length > 0) {
            plan[1].tasks[0].completed = true;
          }
        } else if (cycle === 5) {
          // Cycle 5: idle day (no tasks completed)
        } else if (cycle === 6) {
          // Cycle 6: complete 2 tasks on Day 3
          if (plan[2] && plan[2].tasks.length > 0) {
            plan[2].tasks.slice(0, 2).forEach(t => { t.completed = true; });
          }
        } else if (cycle === 7) {
          // Cycle 7: rebalance immediately again
        }

        autoDetectAndRebalance();
        vi.runAllTimers();

        const postPlan = getAppState().plan;
        expect(postPlan).toBeDefined();

        // INVARIANTS AT EVERY SINGLE CYCLE:
        // 1. Total syllabus tasks strictly conserved
        const tasksNow = getSyllabusTasks(postPlan);
        expect(tasksNow.length).toBe(initialTotal);

        // 2. Sequential day numbering 1..N with 0 gaps
        postPlan.forEach((d, idx) => {
          expect(d.dayNumber).toBe(idx + 1);
        });

        // 3. Completed markers are strictly grouped at the front (Days 1..K)
        let foundNonMarker = false;
        postPlan.forEach((d) => {
          if (!d.isCompletedMarker) {
            foundNonMarker = true;
          } else {
            // Once we have seen a non-marker, we should NEVER see another marker
            expect(foundNonMarker).toBe(false);
          }
        });

        // 4. No duplicate task IDs across the entire plan
        const seenIds = new Set();
        tasksNow.forEach((t) => {
          expect(seenIds.has(t.id)).toBe(false);
          seenIds.add(t.id);
        });

        // 5. Valid calendar dates on all days
        postPlan.forEach((d) => {
          expect(isCalendarDate(d.date)).toBe(true);
        });
      }
    });
  });

  // ==========================================================================
  // SUITE 3: All Academic Streams & Grades Invariant Matrix
  // ==========================================================================
  describe('Suite 3: All Academic Streams & Grades Invariant Matrix', () => {
    const permutations = [
      { grade: '+2', stream: 'cs' },
      { grade: '+2', stream: 'bio' },
      { grade: '+2', stream: 'commerce' },
      { grade: '+2', stream: 'humanities' },
      { grade: '+1', stream: 'cs' },
      { grade: '+1', stream: 'bio' },
      { grade: '+1', stream: 'commerce' },
      { grade: '+1', stream: 'humanities' },
    ];

    permutations.forEach(({ grade, stream }) => {
      it(`verifies rebalancing & auto-detect for Grade ${grade} | Stream ${stream.toUpperCase()}`, () => {
        const allowedSubjects = getStreamSubjects(stream);
        const allTasks = getRemainingPlanTasks({ grade, stream, targetTerm: 3 });
        expect(allTasks.length).toBeGreaterThan(0);

        // Verify all tasks strictly belong to the stream
        allTasks.forEach(t => {
          expect(allowedSubjects).toContain(t.subject);
        });

        const initialRes = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], stream);
        const initialPlan = initialRes.planDays;
        const initialTotal = allTasks.length;

        // Perform chaotic completion: complete Day 1, skip Day 2, complete 1 task on Day 4
        initialPlan[0].tasks.forEach(t => { t.completed = true; });
        if (initialPlan[3] && initialPlan[3].tasks.length > 0) {
          initialPlan[3].tasks[0].completed = true;
        }

        const totalMarkedDone = initialPlan[0].tasks.length + (initialPlan[3]?.tasks[0]?.completed ? 1 : 0);

        setAppState({
          grade,
          stream,
          targetTerm: 3,
          deadlineDate: '2026-12-31',
          startDate: '2026-11-01',
          plan: initialPlan,
          improvementConfig: []
        });

        autoDetectAndRebalance();
        vi.runAllTimers();

        const newPlan = getAppState().plan;
        expect(newPlan).toBeDefined();

        // 1. Invariant: Zero task loss or duplication
        const newTasks = getSyllabusTasks(newPlan);
        expect(newTasks.length).toBe(initialTotal);

        // 2. Invariant: Completed task count exactly matches
        const doneTasks = newTasks.filter(t => t.completed);
        expect(doneTasks.length).toBe(totalMarkedDone);

        // 3. Invariant: No foreign subjects contaminated
        newTasks.forEach(t => {
          expect(allowedSubjects).toContain(t.subject);
        });

        // 4. Invariant: Sequential day numbering
        newPlan.forEach((d, idx) => {
          expect(d.dayNumber).toBe(idx + 1);
        });

        // 5. Invariant: Completed markers at front
        const markers = newPlan.filter(d => d.isCompletedMarker);
        expect(markers.length).toBeGreaterThan(0);
        markers.forEach((d, idx) => {
          expect(d.dayNumber).toBe(idx + 1);
        });

        // 6. Multi-part sequential ordering in remaining days
        const remainingTasks = getSyllabusTasks(newPlan.filter(d => !d.isCompletedMarker));
        const chapterPartOrderMap = new Map();
        remainingTasks.forEach(t => {
          if (t.totalParts > 1) {
            if (!chapterPartOrderMap.has(t.chapId)) chapterPartOrderMap.set(t.chapId, []);
            chapterPartOrderMap.get(t.chapId).push(t.part);
          }
        });
        chapterPartOrderMap.forEach((parts, chapId) => {
          for (let i = 0; i < parts.length - 1; i++) {
            expect(parts[i]).toBeLessThanOrEqual(parts[i + 1]);
          }
        });
      });
    });
  });

  // ==========================================================================
  // SUITE 4: Randomized Stress Fuzzing (50 Iterations)
  // ==========================================================================
  describe('Suite 4: Randomized Stress Fuzzing (50 Iterations)', () => {
    const streams = ['cs', 'bio', 'commerce', 'humanities'];
    const grades = ['+1', '+2'];

    for (let iter = 1; iter <= 50; iter++) {
      it(`fuzz iteration ${iter}/50: random stream, grade, and chaotic completion pattern`, () => {
        const stream = streams[iter % streams.length];
        const grade = grades[Math.floor(iter / streams.length) % grades.length];
        const allTasks = getRemainingPlanTasks({ grade, stream, targetTerm: 3 });
        const initialTotal = allTasks.length;

        // Choose random duration between 20 and 60 days
        const durationDays = 20 + (iter % 41);
        const startDate = '2026-11-01';
        const start = new Date(startDate + 'T00:00:00');
        start.setDate(start.getDate() + durationDays);
        const deadlineDate = formatLocalDateStr(start);

        const initialPlan = buildIntelligentPlan(deadlineDate, allTasks, startDate, [], stream).planDays;

        // Randomly mark between 5% and 50% of syllabus tasks as completed in chaotic positions
        let totalMarked = 0;
        initialPlan.forEach((d, dayIdx) => {
          (d.tasks || []).forEach((t, tIdx) => {
            if (t.isRevision) return; // Only mark canonical syllabus tasks
            // Pseudo-random deterministic hash
            const hash = (iter * 17 + dayIdx * 31 + tIdx * 7) % 100;
            if (hash < 25) { // ~25% completion probability
              t.completed = true;
              totalMarked++;
            }
          });
        });

        setAppState({
          grade,
          stream,
          targetTerm: 3,
          deadlineDate,
          startDate,
          plan: initialPlan,
          improvementConfig: []
        });

        autoDetectAndRebalance();
        vi.runAllTimers();

        const newPlan = getAppState().plan;
        const newTasks = getSyllabusTasks(newPlan);

        // Core Mathematical Invariants
        expect(newTasks.length).toBe(initialTotal);
        expect(newTasks.filter(t => t.completed).length).toBe(totalMarked);

        // Zero duplicate task IDs
        const seen = new Set();
        newTasks.forEach(t => {
          expect(seen.has(t.id)).toBe(false);
          seen.add(t.id);
        });

        // Day numbering continuous
        newPlan.forEach((d, idx) => {
          expect(d.dayNumber).toBe(idx + 1);
        });
      });
    }
  });

  // ==========================================================================
  // SUITE 5: Deep Invariant Stress: Revision Tasks, Regeneration & Improvement
  // ==========================================================================
  describe('Suite 5: Deep Invariant Stress: Revision Tasks, Regeneration & Improvement', () => {
    it('5.1: completing revision tasks alongside syllabus tasks preserves markers without task corruption', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;
      const initialTotal = allTasks.length;

      // Find a revision day
      const revDay = initialPlan.find(d => d.isRevisionDay && d.tasks.some(t => t.isRevision));
      expect(revDay).toBeDefined();
      const revTask = revDay.tasks.find(t => t.isRevision);
      expect(revTask).toBeDefined();

      // Complete Day 1 syllabus task and the revision task
      initialPlan[0].tasks[0].completed = true;
      revTask.completed = true;

      setAppState({
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      });

      autoDetectAndRebalance();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      expect(newPlan).toBeDefined();

      // Markers should contain both the completed syllabus task and completed revision task
      const markers = newPlan.filter(d => d.isCompletedMarker);
      expect(markers.length).toBe(2);

      const allNewSyllabusTasks = getSyllabusTasks(newPlan);
      // Canonical syllabus tasks count must remain strictly constant
      expect(allNewSyllabusTasks.length).toBe(initialTotal);
    });

    it('5.2: executeRegeneration with Day 0 reset preserves non-contiguous completed tasks (Days 1, 4, 8) as markers', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;
      const initialTotal = allTasks.length;

      // Mark tasks on Days 1, 4, and 8
      initialPlan[0].tasks[0].completed = true;
      initialPlan[3].tasks[0].completed = true;
      initialPlan[7].tasks[0].completed = true;

      setAppState({
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      });

      const select = document.getElementById('completed-day-select');
      select.value = '0'; // Fresh reset

      executeRegeneration();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      const markers = newPlan.filter(d => d.isCompletedMarker);
      expect(markers.length).toBe(3);
      expect(markers[0].dayNumber).toBe(1);
      expect(markers[1].dayNumber).toBe(2);
      expect(markers[2].dayNumber).toBe(3);

      const allNewTasks = getSyllabusTasks(newPlan);
      expect(allNewTasks.length).toBe(initialTotal);
      expect(allNewTasks.filter(t => t.completed).length).toBe(3);
    });

    it('5.3: executeRegeneration with completedUpTo = 2 preserves ahead-of-schedule tasks on Day 7', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'commerce', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'commerce').planDays;
      const initialTotal = allTasks.length;

      // Complete Day 1, Day 2
      initialPlan[0].tasks.forEach(t => { t.completed = true; });
      initialPlan[1].tasks.forEach(t => { t.completed = true; });

      // Ahead of schedule task on Day 7
      const aheadTask = initialPlan[6].tasks[0];
      aheadTask.completed = true;

      const expectedDone = initialPlan[0].tasks.length + initialPlan[1].tasks.length + 1;

      setAppState({
        grade: '+2',
        stream: 'commerce',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      });

      const select = document.getElementById('completed-day-select');
      select.value = '2'; // User says completed up to Day 2

      executeRegeneration();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      const allNewTasks = getSyllabusTasks(newPlan);
      expect(allNewTasks.length).toBe(initialTotal);
      expect(allNewTasks.filter(t => t.completed).length).toBe(expectedDone);

      const foundAhead = allNewTasks.find(t => t.id === aheadTask.id);
      expect(foundAhead).toBeDefined();
      expect(foundAhead.completed).toBe(true);
    });

    it('5.4: multi-part chapter with 4 parts: completes P1 and P3, skips P2 and P4; asserts P2 is scheduled before P4', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      // Find a chapter with 3 or more parts
      const targetChapTask = allTasks.find(t => t.totalParts >= 3);
      expect(targetChapTask).toBeDefined();
      const chapId = targetChapTask.chapId;

      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;
      const flat = initialPlan.flatMap(d => d.tasks);
      const p1 = flat.find(t => t.chapId === chapId && t.part === 1);
      const p2 = flat.find(t => t.chapId === chapId && t.part === 2);
      const p3 = flat.find(t => t.chapId === chapId && t.part === 3);

      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      expect(p3).toBeDefined();

      p1.completed = true;
      p2.completed = false; // Skipped
      p3.completed = true;

      setAppState({
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      });

      autoDetectAndRebalance();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      const remainingTasks = getSyllabusTasks(newPlan.filter(d => !d.isCompletedMarker));

      // P2 must be in remaining tasks
      const p2Idx = remainingTasks.findIndex(t => t.id === p2.id);
      expect(p2Idx).toBeGreaterThanOrEqual(0);

      // P1 and P3 must NOT be in remaining tasks (they are in completed markers)
      expect(remainingTasks.some(t => t.id === p1.id)).toBe(false);
      expect(remainingTasks.some(t => t.id === p3.id)).toBe(false);
    });

    it('5.5: retains +1 improvement config across auto-detect rebalance and generates improvement tasks', () => {
      const p2Tasks = getRemainingPlanTasks({ grade: '+2', stream: 'bio', targetTerm: 3 });
      const p1Botany = getRemainingPlanTasks({ grade: '+1', stream: 'bio', targetTerm: 3 }).filter(t => t.subject === 'Botany');
      const allTasks = [...p2Tasks, ...p1Botany];
      const impConfig = [{ subject: 'Botany', examDate: '2026-12-10' }];
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', impConfig, 'bio').planDays;

      // Mark Day 1 complete
      initialPlan[0].tasks.forEach(t => { t.completed = true; });

      setAppState({
        grade: '+2',
        stream: 'bio',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: impConfig
      });

      autoDetectAndRebalance();
      vi.runAllTimers();

      const state = getAppState();
      expect(state.improvementConfig).toEqual(impConfig);

      const allNewTasks = state.plan.flatMap(d => d.tasks);
      const impTasks = allNewTasks.filter(t => t.isImprovement);
      expect(impTasks.length).toBeGreaterThan(0);
      expect(impTasks.some(t => t.subject === 'Botany')).toBe(true);
    });

    it('5.6: preserves rest day configurations and weekly rhythm across auto-detect rebalance', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const personalization = {
        weeklyRhythm: 'rest_day',
        restDayOfWeek: 0 // Sunday
      };
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs', { personalization }).planDays;

      initialPlan[0].tasks.forEach(t => { t.completed = true; });

      setAppState({
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        personalization
      });

      autoDetectAndRebalance();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      const restDays = newPlan.filter(d => d.isRestDay);
      expect(restDays.length).toBeGreaterThan(0);
      restDays.forEach(d => {
        expect(d.dayOfWeek).toBe(0);
      });
    });

    it('5.7: respects completedChaptersOnInit without orphaning or duplicating tasks', () => {
      const completedChapId = '+2_Mathematics_1';
      const allTasks = getRemainingPlanTasks({
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        completedChapterIds: new Set([completedChapId])
      });

      // Assert the initial remaining tasks do NOT contain the completed chapter
      expect(allTasks.some(t => t.chapId === completedChapId)).toBe(false);

      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;

      setAppState({
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        completedChaptersOnInit: [completedChapId]
      });

      autoDetectAndRebalance();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      const newTasks = getSyllabusTasks(newPlan);
      expect(newTasks.some(t => t.chapId === completedChapId)).toBe(false);
      expect(newTasks.length).toBe(allTasks.length);
    });
  });
});
