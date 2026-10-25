import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildIntelligentPlan, getStreamSubjects, PLANNER_ENGINE_VERSION, formatLocalDateStr } from '../src/engine/planner.js';
import { getRemainingPlanTasks } from '../src/utils/plan-scope.js';

// Exercise the real setup event/render functions without booting auth, analytics or a browser.
const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
function appFunction(name) {
  const start = source.indexOf(`        function ${name}(`);
  if (start < 0) throw new Error(`Missing app function: ${name}`);
  const next = /\n        (?:async )?function \w+\(/g;
  next.lastIndex = start + 1;
  return source.slice(start, next.exec(source)?.index ?? source.length);
}

function setup({ grade = '+2', stream = 'cs', step = 1 } = {}) {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const inputs = {
    'app-container': container,
    'deadline-date': { value: '2026-12-21' },
    'target-term': { value: '2' },
    'study-intensity': { value: 'balanced' },
    'completed-day-select': { value: '0' },
  };
  const context = vm.createContext({
    appState: null,
    selectedGrade: grade,
    selectedStream: stream,
    setupCurrentStep: step,
    selectedCompletedChapters: new Set(),
    activeSetupSubjectTab: 'Physics',
    activeSetupGradeTab: grade,
    document: {
      getElementById: id => inputs[id] ?? null,
      body: { classList: { toggle() {} } },
    },
    getAppLanguage: () => 'en',
    escapeStudyText: value => String(value ?? '').replace(/[&<>"']/g, ''),
    getRemainingPlanTasks,
    getStreamSubjects,
    getLocalDateStr: date => date ? formatLocalDateStr(date) : '2026-10-21',
    getSmartStartDate: () => ({ startDate: '2026-10-21', isLateEvening: false }),
    calculateDaysBetween: (start, end) => (new Date(end) - new Date(start)) / 86400000,
    getRelativePresetDate: () => '2026-11-21',
    getPresetDate: () => '2027-02-28',
    renderSetupSubjectTabs: () => '',
    renderSetupSubjectChapters: () => '',
    trackAnalyticsEvent: vi.fn(),
    setTimeout: vi.fn(),
    goToSetupStep: vi.fn(),
    showAppAlert: vi.fn(),
    showAppToast: vi.fn(),
    saveAppState: vi.fn(),
    playTapSound: vi.fn(),
    getUserSetting: vi.fn(() => true),
    getPersonalizationConfig: () => ({ dailyHours: 3.5 }),
    animatePlanGeneration: (_options, done) => done(),
    goToDashboard: vi.fn(),
    closeRegenerateModal: vi.fn(),
    buildIntelligentPlan,
    PLANNER_ENGINE_VERSION,
    TODAY_STR: '2026-10-21',
    formatLocalDateStr,
  });

  for (const name of [
    'setGradeSelection',
    'setStreamSelection',
    'setTermSelection',
    'renderApp',
    'handleInitialSetup',
    'executeRegeneration',
  ]) {
    vm.runInContext(appFunction(name), context);
  }
  return { context, container };
}

describe('Setup interface & grade selection (Plus One & Plus Two)', () => {
  it('renders clean dual-grade selector and stream cards without legacy improvement elements', () => {
    const { context, container } = setup({ step: 1 });
    context.renderApp();

    // Grade buttons present
    expect(container.innerHTML).toContain('id="grade-btn-p2"');
    expect(container.innerHTML).toContain('id="grade-btn-p1"');

    // 4 Canonical streams present
    expect(container.innerHTML).toContain('id="stream-card-cs"');
    expect(container.innerHTML).toContain('id="stream-card-bio"');
    expect(container.innerHTML).toContain('id="stream-card-commerce"');
    expect(container.innerHTML).toContain('id="stream-card-humanities"');

    // No obsolete improvement elements anywhere
    expect(container.innerHTML).not.toContain('id="stream-card-imp"');
    expect(container.innerHTML).not.toContain('id="improvement-options"');
    expect(container.innerHTML).not.toContain('id="has-improvement"');
  });

  it('updates selected grade when setGradeSelection is invoked', () => {
    const { context, container } = setup({ grade: '+2', step: 1 });
    context.setGradeSelection('+1');
    expect(context.selectedGrade).toBe('+1');
    context.renderApp();
    expect(container.innerHTML).toContain('id="grade-btn-p1"');
  });

  it('generates a pure Plus One (+1) study plan when +1 is chosen', () => {
    const { context } = setup({ grade: '+1', stream: 'bio' });
    context.handleInitialSetup();

    expect(context.saveAppState).toHaveBeenCalledTimes(1);
    expect(context.appState).not.toBeNull();
    expect(context.appState.grade).toBe('+1');
    expect(context.appState.stream).toBe('bio');

    const tasks = context.appState.plan
      .flatMap(day => day.tasks)
      .filter(task => !task.isRevision && !task.isExamEveTask);

    expect(tasks.length).toBeGreaterThan(0);
    // All non-revision tasks must be strictly Plus One (+1)
    expect(tasks.every(task => task.grade === '+1')).toBe(true);
    // Subjects must match bio stream
    const bioSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Botany', 'Zoology'];
    expect(tasks.every(task => bioSubjects.includes(task.subject))).toBe(true);
  });

  it('generates a pure Plus Two (+2) study plan when +2 is chosen', () => {
    const { context } = setup({ grade: '+2', stream: 'cs' });
    context.handleInitialSetup();

    expect(context.saveAppState).toHaveBeenCalledTimes(1);
    expect(context.appState).not.toBeNull();
    expect(context.appState.grade).toBe('+2');
    expect(context.appState.stream).toBe('cs');

    const tasks = context.appState.plan
      .flatMap(day => day.tasks)
      .filter(task => !task.isRevision && !task.isExamEveTask);

    expect(tasks.length).toBeGreaterThan(0);
    // All non-revision tasks must be strictly Plus Two (+2)
    expect(tasks.every(task => task.grade === '+2')).toBe(true);
    const csSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Computer Science'];
    expect(tasks.every(task => csSubjects.includes(task.subject))).toBe(true);
  });

  it('regenerates cleanly preserving grade and stream invariants', () => {
    const { context } = setup({ grade: '+1', stream: 'commerce' });
    context.handleInitialSetup();
    expect(context.saveAppState).toHaveBeenCalledTimes(1);

    context.renderApp = vi.fn();
    context.executeRegeneration();
    expect(context.saveAppState).toHaveBeenCalledTimes(2);
    expect(context.appState.grade).toBe('+1');
    expect(context.appState.stream).toBe('commerce');
  });
});
