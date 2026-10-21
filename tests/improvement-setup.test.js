import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildIntelligentPlan, getStreamSubjects, PLANNER_ENGINE_VERSION, formatLocalDateStr } from '../src/engine/planner.js';
import { getImprovementSubjects, getRemainingPlanTasks, validateImprovementSelection } from '../src/utils/improvement.js';

// Exercise the real setup event/render functions without booting auth, analytics or a browser.
const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
function appFunction(name) {
  const start = source.indexOf(`        function ${name}(`);
  if (start < 0) throw new Error(`Missing app function: ${name}`);
  const next = /\n        (?:async )?function \w+\(/g;
  next.lastIndex = start + 1;
  return source.slice(start, next.exec(source)?.index ?? source.length);
}
function setup(stream = 'imp_only') {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const inputs = {
    'app-container': container, 'deadline-date': { value: '2026-12-21' },
    'has-improvement': { checked: true }, 'target-term': { value: '2' },
    'study-intensity': { value: 'balanced' }, 'completed-day-select': { value: '0' },
  };
  const context = vm.createContext({
    appState: null, selectedStream: stream, setupCurrentStep: 2, setupHasImprovement: stream === 'imp_only',
    selectedCompletedChapters: new Set(), setupImprovementSelection: new Map(), setupImprovementDates: new Map(),
    activeSetupSubjectTab: 'Physics', activeSetupGradeTab: '+1',
    document: { getElementById: id => inputs[id] ?? null, body: { classList: { toggle() {} } } },
    getAppLanguage: () => 'en', escapeStudyText: value => String(value ?? '').replace(/[&<>"']/g, ''),
    getImprovementSubjects, getRemainingPlanTasks, validateImprovementSelection, getStreamSubjects,
    getLocalDateStr: date => date ? formatLocalDateStr(date) : '2026-10-21',
    getSmartStartDate: () => ({ startDate: '2026-10-21', isLateEvening: false }),
    calculateDaysBetween: (start, end) => (new Date(end) - new Date(start)) / 86400000,
    getRelativePresetDate: () => '2026-11-21', getPresetDate: () => '2027-02-28',
    renderSetupSubjectTabs: () => '', renderSetupSubjectChapters: () => '',
    trackAnalyticsEvent: vi.fn(), setTimeout: vi.fn(), goToSetupStep: vi.fn(),
    showAppAlert: vi.fn(), showAppToast: vi.fn(), saveAppState: vi.fn(),
    getPersonalizationConfig: () => ({ dailyHours: 3.5 }),
    animatePlanGeneration: (_options, done) => done(), goToDashboard: vi.fn(), closeRegenerateModal: vi.fn(),
    buildIntelligentPlan, PLANNER_ENGINE_VERSION, TODAY_STR: '2026-10-21', formatLocalDateStr,
  });
  for (const name of ['setImprovementToggle', 'setImprovementSubjectSelection', 'setImprovementExamDate', 'renderImprovementSubjectItems', 'renderApp', 'handleInitialSetup', 'executeRegeneration']) {
    vm.runInContext(appFunction(name), context);
  }
  return { context, container };
}

describe('Improvement setup interface and event integration', () => {
  it('actually renders the chooser and preserves selection/date across redraws', () => {
    const { context, container } = setup();
    context.renderApp();
    expect(container.innerHTML).toContain('id="stream-card-imp"');
    expect(container.innerHTML).toContain('id="improvement-options"');
    expect(container.innerHTML).toContain('id="imp-physics"');
    expect(container.innerHTML).toContain('id="imp-history"');
    context.setImprovementSubjectSelection('Physics', true);
    context.setImprovementExamDate('Physics', '2026-12-20');
    context.renderApp();
    expect(container.innerHTML).toContain('id="imp-physics" checked');
    expect(container.innerHTML).toContain('id="input-date-physics" value="2026-12-20"');
    expect(container.innerHTML).not.toContain('2026-10-12');
  });

  it('blocks an empty selection, then creates, saves and regenerates the chosen +1 subject only', () => {
    const { context } = setup();
    context.handleInitialSetup();
    expect(context.showAppAlert).toHaveBeenCalled();
    expect(context.saveAppState).not.toHaveBeenCalled();
    context.setImprovementSubjectSelection('Physics', true);
    context.setImprovementExamDate('Physics', '2026-12-20');
    context.handleInitialSetup();
    expect(context.saveAppState).toHaveBeenCalledTimes(1);
    expect(context.appState.stream).toBe('imp_only');
    expect(context.appState.improvementConfig).toEqual([{ subject: 'Physics', examDate: '2026-12-20' }]);
    const checkScope = () => {
      const tasks = context.appState.plan.flatMap(day => day.tasks).filter(task => !task.isRevision && !task.isExamEveTask);
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.every(task => task.grade === '+1' && task.subject === 'Physics')).toBe(true);
    };
    checkScope();
    context.renderApp = vi.fn();
    context.executeRegeneration();
    checkScope();
    expect(context.saveAppState).toHaveBeenCalledTimes(2);
  });

  it('does not display foreign-stream subjects in optional +1 planning', () => {
    const { context, container } = setup('commerce');
    context.renderApp();
    expect(container.innerHTML).toContain('id="imp-accountancy"');
    expect(container.innerHTML).not.toContain('id="imp-physics"');
    context.setImprovementSubjectSelection('Physics', true);
    expect(context.setupImprovementSelection.has('Physics')).toBe(false);
  });
});
