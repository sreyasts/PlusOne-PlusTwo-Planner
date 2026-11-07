import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSchedule, getStreamSubjects } from '../src/core/scheduler.js';
import { buildIntelligentPlan } from '../src/engine/planner.js';
import { getRemainingPlanTasks, detectCompletedSyllabusProgress } from '../src/utils/plan-scope.js';
import {
  openRegenerateModal,
  executeRegeneration,
  autoDetectAndRebalance,
  setAppState,
  getAppState
} from '../src/app.js';

describe('Requirement R1, R2 & R3: Rebalancing Reliability, Auto-Detect & Curriculum Invariants', () => {
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

  // --------------------------------------------------------------------------
  // Requirement R1: Rebalancing Reliability & Task Preservation
  // --------------------------------------------------------------------------
  describe('Requirement R1: Rebalancing Reliability & Task Preservation', () => {
    it('preserves tasks completed on days beyond completedUpTo without dropping them from the plan', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;
      const initialTotal = allTasks.length;

      // Mark Day 1 complete, and Day 4 Task 0 complete ahead of schedule
      initialPlan[0].tasks.forEach(t => { t.completed = true; });
      initialPlan[3].tasks[0].completed = true;
      const futureTask = initialPlan[3].tasks[0];

      const state = {
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      };
      setAppState(state);

      const select = document.getElementById('completed-day-select');
      select.value = '1';

      executeRegeneration();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      const allNewTasks = newPlan.flatMap(d => d.tasks).filter(t => !t.isRevision);
      const futureTaskInNewPlan = allNewTasks.find(t => t.id === futureTask.id);

      expect(futureTaskInNewPlan).toBeDefined();
      expect(futureTaskInNewPlan.completed).toBe(true);
      // Zero task vanishing: total syllabus tasks must be preserved
      expect(allNewTasks.length).toBe(initialTotal);
    });

    it('preserves previously completed tasks as historical completed markers on fresh reset (Day 0)', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;
      const initialTotal = allTasks.length;

      // Mark 3 tasks as completed on Days 1 and 2
      initialPlan[0].tasks.forEach(t => { t.completed = true; });
      initialPlan[1].tasks[0].completed = true;
      const doneCount = initialPlan[0].tasks.length + 1;

      const state = {
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      };
      setAppState(state);

      const select = document.getElementById('completed-day-select');
      select.value = '0';

      executeRegeneration();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      const completedMarkers = newPlan.filter(d => d.isCompletedMarker);
      expect(completedMarkers.length).toBeGreaterThan(0);

      const allNewTasks = newPlan.flatMap(d => d.tasks).filter(t => !t.isRevision);
      const totalCompletedInPlan = allNewTasks.filter(t => t.completed).length;

      expect(totalCompletedInPlan).toBe(doneCount);
      expect(allNewTasks.length).toBe(initialTotal);
    });

    it('retains appState.improvementConfig during executeRegeneration', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'bio', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'bio').planDays;

      const impConfig = [{ subject: 'Botany', examDate: '2026-12-15' }];
      const state = {
        grade: '+2',
        stream: 'bio',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: impConfig
      };
      setAppState(state);

      const select = document.getElementById('completed-day-select');
      select.value = '1';

      executeRegeneration();
      vi.runAllTimers();

      const current = getAppState();
      expect(current.improvementConfig).toEqual(impConfig);
    });

    it('infers commerce and humanities streams in generateSchedule when stream parameter is omitted', () => {
      const commTasks = getRemainingPlanTasks({ grade: '+2', stream: 'commerce', targetTerm: 3 });
      const humTasks = getRemainingPlanTasks({ grade: '+2', stream: 'humanities', targetTerm: 3 });

      const resComm = generateSchedule({
        examDate: '2026-12-31',
        startDate: '2026-11-01',
        tasks: commTasks,
      });

      const resHum = generateSchedule({
        examDate: '2026-12-31',
        startDate: '2026-11-01',
        tasks: humTasks,
      });

      const commScheduled = resComm.planDays.flatMap(d => d.tasks).filter(t => !t.isRevision);
      const humScheduled = resHum.planDays.flatMap(d => d.tasks).filter(t => !t.isRevision);

      expect(commScheduled.length).toBe(commTasks.length);
      expect(humScheduled.length).toBe(humTasks.length);
    });

    it('preserves multi-part chapter sequential ordering and parts integrity across plan generation', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const mathP1 = allTasks.find(t => t.chapId === '+2_Mathematics_1' && t.part === 1);
      const mathP2 = allTasks.find(t => t.chapId === '+2_Mathematics_1' && t.part === 2);
      expect(mathP1).toBeDefined();
      expect(mathP2).toBeDefined();

      const res = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs');
      const scheduledTasks = res.planDays.flatMap(d => d.tasks);
      const p1Idx = scheduledTasks.findIndex(t => t.id === mathP1.id);
      const p2Idx = scheduledTasks.findIndex(t => t.id === mathP2.id);

      expect(p1Idx).toBeGreaterThanOrEqual(0);
      expect(p2Idx).toBeGreaterThanOrEqual(0);
      expect(p1Idx).toBeLessThan(p2Idx);
    });
  });

  // --------------------------------------------------------------------------
  // Requirement R2: Auto-Detect and Rebalance Schedule Workflow
  // --------------------------------------------------------------------------
  describe('Requirement R2: Auto-Detect and Rebalance Schedule Workflow', () => {
    it('detectCompletedSyllabusProgress identifies completed task IDs, chapter IDs, and day markers', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const plan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;

      // Day 1: mark all tasks complete
      plan[0].tasks.forEach(t => { t.completed = true; });
      // Day 3: mark 1 task complete
      plan[2].tasks[0].completed = true;

      const detection = detectCompletedSyllabusProgress({ plan, completedChaptersOnInit: [] });
      expect(detection.totalCompletedTasks).toBe(plan[0].tasks.length + 1);
      expect(detection.completedDayMarkers.length).toBe(2);
      expect(detection.anchorDayNumber).toBe(2);
      expect(detection.completedDayMarkers[0].dayNumber).toBe(1);
      expect(detection.completedDayMarkers[1].dayNumber).toBe(2);
    });

    it('autoDetectAndRebalance preserves completed markers and recalculates remaining tasks starting today', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;
      const initialTotal = allTasks.length;

      // Complete Day 1
      initialPlan[0].tasks.forEach(t => { t.completed = true; });
      const completedCount = initialPlan[0].tasks.length;

      const state = {
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        startDate: '2026-11-01',
        plan: initialPlan,
        improvementConfig: []
      };
      setAppState(state);

      autoDetectAndRebalance();
      vi.runAllTimers();

      const newPlan = getAppState().plan;
      expect(newPlan[0].isCompletedMarker).toBe(true);
      expect(newPlan[0].dayNumber).toBe(1);

      // Remaining days start from dayNumber 2
      expect(newPlan[1].dayNumber).toBe(2);

      const allNewTasks = newPlan.flatMap(d => d.tasks).filter(t => !t.isRevision);
      expect(allNewTasks.length).toBe(initialTotal);
      expect(allNewTasks.filter(t => t.completed).length).toBe(completedCount);
    });

    it('openRegenerateModal updates auto-detect summary badge and selects detected progress', () => {
      const allTasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 3 });
      const initialPlan = buildIntelligentPlan('2026-12-31', allTasks, '2026-11-01', [], 'cs').planDays;
      initialPlan[0].tasks.forEach(t => { t.completed = true; });

      setAppState({
        grade: '+2',
        stream: 'cs',
        targetTerm: 3,
        deadlineDate: '2026-12-31',
        plan: initialPlan,
      });

      openRegenerateModal();

      const badge = document.getElementById('auto-detect-summary-badge');
      expect(badge.textContent).toContain(`${initialPlan[0].tasks.length} Done`);

      const select = document.getElementById('completed-day-select');
      expect(select.options.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Requirement R3: Comprehensive Syllabus Audit and Updates
  // --------------------------------------------------------------------------
  describe('Requirement R3: Comprehensive Syllabus Audit and Updates', () => {
    it('verifies Commerce getStreamSubjects includes Computer Applications', () => {
      const commSubs = getStreamSubjects('commerce');
      expect(commSubs).toContain('Accountancy');
      expect(commSubs).toContain('Business Studies');
      expect(commSubs).toContain('Economics');
      expect(commSubs).toContain('Computer Applications');
    });

    it('verifies Humanities getStreamSubjects includes History, Political Science, Sociology, Economics', () => {
      const humSubs = getStreamSubjects('humanities');
      expect(humSubs).toContain('History');
      expect(humSubs).toContain('Political Science');
      expect(humSubs).toContain('Sociology');
      expect(humSubs).toContain('Economics');
    });
  });
});
