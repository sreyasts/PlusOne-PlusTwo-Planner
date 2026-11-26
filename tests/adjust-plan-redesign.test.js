import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  openRegenerateModal,
  openAdjustChaptersPage,
  closeAdjustChaptersPage,
  toggleAdjustChapter,
  toggleAllAdjustChapters,
  switchAdjustSubject,
  setAdjustChapterSearch,
  setAdjustIntensity,
  setAdjustRhythm,
  setAdjustTerm,
  setAdjustDeadlineOffset,
  getEditableScopeChapters,
  executeRegeneration,
  setAppState,
  getAppState,
} from '../src/app.js';
import { buildIntelligentPlan } from '../src/engine/planner.js';
import { getRemainingPlanTasks } from '../src/utils/plan-scope.js';

function createMockElement(id, extra = {}) {
  const classes = new Set(extra.classes || []);
  const el = {
    id,
    value: extra.value ?? '',
    min: '',
    textContent: '',
    innerText: '',
    innerHTML: '',
    options: [],
    appendChild(opt) {
      this.options.push(opt);
      if (this.options.length === 1) this.value = String(opt.value);
    },
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) classes.delete(c);
          else classes.add(c);
        } else if (force) classes.add(c);
        else classes.delete(c);
      },
      contains: (c) => classes.has(c),
    },
    _classes: classes,
    ...extra,
  };
  return el;
}

function buildAdjustModalDom() {
  const elements = new Map();
  const ids = [
    ['regenerate-modal', { classes: ['hidden'] }],
    ['adjust-main-view', { classes: [] }],
    ['adjust-chapters-view', { classes: ['hidden'] }],
    ['adjust-main-footer', { classes: [] }],
    ['adjust-chapters-footer', { classes: ['hidden'] }],
    ['adjust-header-back-btn', { classes: ['hidden'] }],
    ['adjust-header-icon', { classes: [] }],
    ['regenerate-modal-title', {}],
    ['regenerate-modal-subtitle', {}],
    ['auto-detect-summary-badge', {}],
    ['adjust-chapters-count-badge', {}],
    ['adjust-chapters-editor-stats', {}],
    ['adjust-deadline-date', { value: '' }],
    ['adjust-deadline-preview', {}],
    ['adjust-granularity-pill', {}],
    ['adjust-study-intensity', { value: 'balanced' }],
    ['adjust-pace-light', { classes: [] }],
    ['adjust-pace-balanced', { classes: [] }],
    ['adjust-pace-intense', { classes: [] }],
    ['adjust-weekly-rhythm', { value: 'balanced' }],
    ['adjust-rhythm-balanced', { classes: [] }],
    ['adjust-rhythm-weekend_booster', { classes: [] }],
    ['adjust-rhythm-sunday_rest', { classes: [] }],
    ['adjust-target-term', { value: '3' }],
    ['adjust-term-1', { classes: [] }],
    ['adjust-term-2', { classes: [] }],
    ['adjust-term-3', { classes: [] }],
    ['adjust-chapter-search', { value: '' }],
    ['adjust-subject-tabs', {}],
    ['adjust-visible-scope-label', {}],
    ['adjust-chapters-list', {}],
    ['completed-day-select', {}],
    ['regenerate-restore-box', { classes: ['hidden'] }],
    ['regenerate-undo-reset-box', { classes: ['hidden'] }],
    ['app-toast', { classes: ['hidden'] }],
    ['app-toast-msg', {}],
    ['app-toast-icon', {}],
    ['app-dialog-modal', { classes: ['hidden'] }],
    ['app-dialog-title', {}],
    ['app-dialog-message', {}],
    ['app-dialog-confirm', {}],
    ['app-dialog-cancel', {}],
    ['plan-gen-overlay', { classes: ['hidden'] }],
  ];
  ids.forEach(([id, extra]) => elements.set(id, createMockElement(id, extra)));

  const store = new Map();
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  global.sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  global.document = {
    documentElement: { lang: 'en', classList: { contains: () => false } },
    body: { classList: { toggle: () => {} } },
    getElementById: (id) => elements.get(id) || null,
    createElement: () => ({ value: '', text: '' }),
    querySelectorAll: () => [],
  };
  return elements;
}

describe('Redesigned Adjust & Rebalance Plan Page', () => {
  let origDocument;
  let origLocalStorage;
  let origSessionStorage;

  beforeEach(() => {
    vi.useFakeTimers();
    origDocument = global.document;
    origLocalStorage = global.localStorage;
    origSessionStorage = global.sessionStorage;
  });

  afterEach(() => {
    vi.useRealTimers();
    global.document = origDocument;
    global.localStorage = origLocalStorage;
    global.sessionStorage = origSessionStorage;
  });

  it('index.html exposes one primary Mark Completed Chapters button and full editable controls', () => {
    const html = fs.readFileSync(path.resolve('index.html'), 'utf8');
    expect(html).toContain('id="btn-open-chapters-editor"');
    expect(html).toContain('Mark Completed Chapters');
    expect(html).toContain('id="adjust-chapters-view"');
    expect(html).toContain('id="adjust-deadline-date"');
    expect(html).toContain('id="adjust-study-intensity"');
    expect(html).toContain('id="adjust-weekly-rhythm"');
    expect(html).toContain('id="adjust-target-term"');
    expect(html).toContain('id="adjust-chapter-search"');
    expect(html).toContain('id="adjust-subject-tabs"');
    expect(html).toContain('id="adjust-chapters-list"');
    expect(html).toContain('Save &amp; Rebuild Plan');
  });

  it('pre-checks chapters already finished in plan and setup, and shows partial chapter badges', () => {
    const dom = buildAdjustModalDom();
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'cs', targetTerm: 1 });
    const planDays = buildIntelligentPlan('2026-12-30', tasks, '2026-11-25', [], 'cs').planDays;

    // Pick a single-part chapter or full chapter from plan and complete all parts of it, plus 1 part of a multi-part chapter
    const chapGroups = new Map();
    planDays.forEach(d => d.tasks.forEach(t => {
      if (!t.chapId || t.isRevision) return;
      if (!chapGroups.has(t.chapId)) chapGroups.set(t.chapId, []);
      chapGroups.get(t.chapId).push(t);
    }));
    const entries = [...chapGroups.entries()];
    const [fullChapId, fullChapTasks] = entries.find(([, arr]) => arr.length >= 1);
    fullChapTasks.forEach(t => { t.completed = true; });
    const [partialChapId, partialChapTasks] = entries.find(([cid, arr]) => cid !== fullChapId && arr.length >= 2);
    partialChapTasks[0].completed = true;

    setAppState({
      grade: '+2',
      stream: 'cs',
      targetTerm: 1,
      deadlineDate: '2026-12-30',
      startDate: '2026-11-25',
      studyIntensity: 'balanced',
      completedChaptersOnInit: [],
      plan: planDays,
    });

    openRegenerateModal();
    openAdjustChaptersPage();

    const listHtml = dom.get('adjust-chapters-list').innerHTML;
    expect(dom.get('adjust-chapters-view').classList.contains('hidden')).toBe(false);
    expect(dom.get('adjust-main-view').classList.contains('hidden')).toBe(true);
    expect(listHtml).toContain(`value="${fullChapId}" checked`);
    expect(listHtml).toContain('Done in plan');
    expect(listHtml).toContain('parts done');
    expect(listHtml).not.toContain(`value="${partialChapId}" checked`);
  });

  it('allows checking new chapters, unchecking completed chapters, and editing deadline/pace/rhythm/term cleanly', () => {
    const dom = buildAdjustModalDom();
    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'commerce', targetTerm: 2 });
    const planDays = buildIntelligentPlan('2026-12-31', tasks, '2026-11-25', [], 'commerce').planDays;

    // Complete first chapter fully in plan
    const chapGroups = new Map();
    planDays.forEach(d => d.tasks.forEach(t => {
      if (!t.chapId || t.isRevision) return;
      if (!chapGroups.has(t.chapId)) chapGroups.set(t.chapId, []);
      chapGroups.get(t.chapId).push(t);
    }));
    const [firstChapId, firstTasks] = [...chapGroups.entries()][0];
    const [secondChapId] = [...chapGroups.entries()][1];
    firstTasks.forEach(t => { t.completed = true; });

    setAppState({
      grade: '+1',
      stream: 'commerce',
      targetTerm: 2,
      deadlineDate: '2026-12-31',
      startDate: '2026-11-25',
      studyIntensity: 'balanced',
      personalization: { weeklyRhythm: 'balanced' },
      completedChaptersOnInit: [],
      plan: planDays,
    });

    openRegenerateModal();
    openAdjustChaptersPage();

    // Uncheck previously completed chapter 1 & mark chapter 2 completed
    toggleAdjustChapter(firstChapId, false);
    toggleAdjustChapter(secondChapId, true);
    closeAdjustChaptersPage();

    // Edit deadline, pace, rhythm, and term
    setAdjustDeadlineOffset(14);
    setAdjustIntensity('intense');
    setAdjustRhythm('sunday_rest');
    setAdjustTerm(1);

    const updatedDeadline = dom.get('adjust-deadline-date').value;
    expect(dom.get('adjust-study-intensity').value).toBe('intense');
    expect(dom.get('adjust-weekly-rhythm').value).toBe('sunday_rest');
    expect(dom.get('adjust-target-term').value).toBe('1');
    expect(dom.get('adjust-chapters-count-badge').textContent).toContain('Chapters');

    dom.get('completed-day-select').value = '0';
    executeRegeneration();
    vi.runAllTimers();

    const nextState = getAppState();
    expect(nextState.deadlineDate).toBe(updatedDeadline);
    expect(nextState.studyIntensity).toBe('intense');
    expect(nextState.personalization.weeklyRhythm).toBe('sunday_rest');
    expect(nextState.targetTerm).toBe(1);
    expect(nextState.completedChaptersOnInit).toContain(secondChapId);
    expect(nextState.completedChaptersOnInit).not.toContain(firstChapId);

    const scheduledChapIds = new Set(nextState.plan.flatMap(d => (d.tasks || []).map(t => t.chapId)));
    // Unchecked first chapter must return to the active schedule (within Term 1), while second chapter is excluded
    expect(scheduledChapIds.has(firstChapId)).toBe(true);
    expect(scheduledChapIds.has(secondChapId)).toBe(false);
  });

  it('supports dynamic subject tabs, search filter, and bulk toggle across Humanities & Bio streams', () => {
    const dom = buildAdjustModalDom();
    const bioChapters = getEditableScopeChapters({ grade: '+2', stream: 'bio', targetTerm: 3, plan: [] });
    const humChapters = getEditableScopeChapters({ grade: '+1', stream: 'humanities', targetTerm: 3, plan: [] });

    expect(new Set(bioChapters.map(c => c.subject)).has('Botany')).toBe(true);
    expect(new Set(bioChapters.map(c => c.subject)).has('Zoology')).toBe(true);
    expect(new Set(humChapters.map(c => c.subject)).has('History')).toBe(true);
    expect(new Set(humChapters.map(c => c.subject)).has('Political Science')).toBe(true);

    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'humanities', targetTerm: 3 });
    const planDays = buildIntelligentPlan('2027-02-28', tasks, '2026-11-25', [], 'humanities').planDays;
    setAppState({
      grade: '+2',
      stream: 'humanities',
      targetTerm: 3,
      deadlineDate: '2027-02-28',
      startDate: '2026-11-25',
      plan: planDays,
    });

    openRegenerateModal();
    openAdjustChaptersPage();
    switchAdjustSubject('History');
    expect(dom.get('adjust-visible-scope-label').textContent).toBe('History');

    toggleAllAdjustChapters(true);
    expect(dom.get('adjust-chapters-editor-stats').textContent).toContain('done');

    setAdjustChapterSearch('Harappan');
    expect(dom.get('adjust-chapters-list').innerHTML.toLowerCase()).toContain('chapter');
  });
});
