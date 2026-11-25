import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDailyPlan,
  compressPendingOverdueDays,
  compressSameDayTasks,
  formatCompressedGroupScope,
} from '../src/ui/daily-plan.js';
import {
  renderApp,
  setAppState,
  getAppState,
  setCurrentView,
  setActiveTodayStr,
  toggleTaskDirect,
} from '../src/app.js';

function createDomHarness() {
  const storage = new Map();
  const elements = new Map();

  const makeElement = (id = '') => {
    const classSet = new Set();
    const attrs = new Map();
    const listeners = new Map();
    return {
      id,
      innerHTML: '',
      innerText: '',
      textContent: '',
      value: '',
      open: false,
      dataset: {},
      style: {},
      classList: {
        add: (...cls) => cls.forEach(c => classSet.add(c)),
        remove: (...cls) => cls.forEach(c => classSet.delete(c)),
        contains: c => classSet.has(c),
        toggle: (c, force) => {
          if (force === undefined) {
            if (classSet.has(c)) classSet.delete(c);
            else classSet.add(c);
          } else if (force) {
            classSet.add(c);
          } else {
            classSet.delete(c);
          }
        },
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: k => attrs.get(k) ?? null,
      addEventListener: (ev, fn) => {
        if (!listeners.has(ev)) listeners.set(ev, []);
        listeners.get(ev).push(fn);
      },
      removeEventListener: vi.fn(),
      querySelectorAll: () => [],
      querySelector: () => null,
      appendChild: vi.fn(),
      focus: vi.fn(),
      remove: vi.fn(),
      closest: () => null,
    };
  };

  const getOrCreate = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };

  const container = makeElement('app-container');
  let cachedHtml = null;
  let cachedPendingButtons = [];
  let cachedStudyButtons = [];

  const syncParsedButtons = () => {
    const html = container.innerHTML;
    if (html === cachedHtml) return;
    cachedHtml = html;

    cachedPendingButtons = [];
    const pendingRe = /<button[^>]*data-pending-task="([^"]+)"(?:\s+data-pending-tasks="([^"]+)")?[^>]*>([\s\S]*?)<\/button>/g;
    let m;
    while ((m = pendingRe.exec(html)) !== null) {
      const btn = makeElement();
      btn.dataset = { pendingTask: m[1] };
      if (m[2]) btn.dataset.pendingTasks = m[2];
      btn.textContent = m[3];
      btn._listeners = {};
      btn.addEventListener = (ev, fn) => {
        if (!btn._listeners[ev]) btn._listeners[ev] = [];
        btn._listeners[ev].push(fn);
      };
      btn.click = () => {
        (btn._listeners.click || []).forEach(fn => fn());
      };
      cachedPendingButtons.push(btn);
    }

    cachedStudyButtons = [];
    const studyRe = /<button[^>]*data-study-task="([^"]+)"(?:\s+data-study-tasks="([^"]+)")?[^>]*>/g;
    while ((m = studyRe.exec(html)) !== null) {
      const btn = makeElement();
      btn.dataset = { studyTask: m[1] };
      if (m[2]) btn.dataset.studyTasks = m[2];
      btn._listeners = {};
      btn.addEventListener = (ev, fn) => {
        if (!btn._listeners[ev]) btn._listeners[ev] = [];
        btn._listeners[ev].push(fn);
      };
      btn.click = () => {
        (btn._listeners.click || []).forEach(fn => fn());
      };
      cachedStudyButtons.push(btn);
    }
  };

  container.querySelectorAll = selector => {
    syncParsedButtons();
    if (selector === '[data-pending-task]') return cachedPendingButtons;
    if (selector === '[data-study-task]') return cachedStudyButtons;
    return [];
  };

  elements.set('app-container', container);

  global.localStorage = {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
    clear: () => storage.clear(),
  };

  global.sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };

  global.CSS = {
    escape: s => String(s).replace(/["\\]/g, '\\$&'),
  };

  global.document = {
    hidden: false,
    visibilityState: 'visible',
    documentElement: {
      lang: 'en',
      classList: { contains: () => false, add: () => {}, remove: () => {} },
    },
    body: {
      classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
      appendChild: vi.fn(),
    },
    createElement: vi.fn(() => makeElement()),
    getElementById: id => getOrCreate(id),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  global.window = {
    location: { hash: '' },
    scrollTo: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    CSS: global.CSS,
  };

  return { container, storage, getOrCreate };
}

describe('Pending Compression & Continuous Same-Day Chapter Display', () => {
  let originalWindow;
  let originalDocument;
  let originalLocalStorage;
  let originalSessionStorage;
  let originalDate;

  beforeEach(() => {
    originalWindow = global.window;
    originalDocument = global.document;
    originalLocalStorage = global.localStorage;
    originalSessionStorage = global.sessionStorage;
    originalDate = global.Date;
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
    global.localStorage = originalLocalStorage;
    global.sessionStorage = originalSessionStorage;
    global.Date = originalDate;
    setAppState(null);
    vi.restoreAllMocks();
  });

  describe('compressPendingOverdueDays & getDailyPlan', () => {
    it('groups multi-part chapter across multiple overdue days into one continuous block while preserving overdueCount', () => {
      const plan = [
        {
          dayNumber: 1,
          date: '2026-10-14',
          tasks: [
            {
              id: '+2_Physics_1_P1',
              chapId: '+2_Physics_1',
              grade: '+2',
              term: 1,
              subject: 'Physics',
              chapNumber: 1,
              chapterName: 'Electric Charges and Fields',
              part: 1,
              totalParts: 3,
              estimatedMinutes: 60,
              topicTitle: 'Part 1/3: Core Concepts & Theory',
              completed: false,
            },
          ],
        },
        {
          dayNumber: 2,
          date: '2026-10-15',
          tasks: [
            {
              id: '+2_Physics_1_P2',
              chapId: '+2_Physics_1',
              grade: '+2',
              term: 1,
              subject: 'Physics',
              chapNumber: 1,
              chapterName: 'Electric Charges and Fields',
              part: 2,
              totalParts: 3,
              estimatedMinutes: 60,
              topicTitle: 'Part 2/3: Gauss Law & Applications',
              completed: false,
            },
          ],
        },
        {
          dayNumber: 3,
          date: '2026-10-16',
          tasks: [
            {
              id: '+2_Physics_1_P3',
              chapId: '+2_Physics_1',
              grade: '+2',
              term: 1,
              subject: 'Physics',
              chapNumber: 1,
              chapterName: 'Electric Charges and Fields',
              part: 3,
              totalParts: 3,
              estimatedMinutes: 60,
              topicTitle: 'Part 3/3 (Full Chapter): Exercise Problems & PYQs',
              completed: false,
            },
            {
              id: '+2_Physics_1_REV',
              chapId: '+2_Physics_1',
              grade: '+2',
              subject: 'Physics',
              chapNumber: 1,
              chapterName: 'Electric Charges and Fields',
              isRevision: true,
              estimatedMinutes: 30,
              topicTitle: 'Active Recall Revision',
              completed: false,
            },
          ],
        },
        {
          dayNumber: 4,
          date: '2026-10-17',
          tasks: [
            {
              id: '+2_Chemistry_2_P1',
              chapId: '+2_Chemistry_2',
              grade: '+2',
              subject: 'Chemistry',
              chapNumber: 2,
              chapterName: 'Electrochemistry',
              part: 1,
              totalParts: 2,
              estimatedMinutes: 60,
              completed: false,
            },
          ],
        },
      ];

      const daily = getDailyPlan(plan, '2026-10-17');

      // Backward-compatible counts & overdueDays remain intact
      expect(daily.overdueCount).toBe(4);
      expect(daily.overdueDays).toHaveLength(3);

      // Compressed overdueGroups collapses the 3 Physics parts into 1 chapter + keeps revision standalone
      expect(daily.overdueGroups).toHaveLength(2);
      const chapterGroup = daily.overdueGroups.find(g => g.chapterKey === '+2_Physics_1');
      expect(chapterGroup).toBeDefined();
      expect(chapterGroup.taskIds).toEqual(['+2_Physics_1_P1', '+2_Physics_1_P2', '+2_Physics_1_P3']);
      expect(chapterGroup.isFullChapter).toBe(true);
      expect(chapterGroup.totalMinutes).toBe(180);
      expect(chapterGroup.dates).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
      expect(formatCompressedGroupScope(chapterGroup)).toBe('Parts 1–3 of 3 (Full Chapter)');

      const revGroup = daily.overdueGroups.find(g => g.chapterKey === null);
      expect(revGroup).toBeDefined();
      expect(revGroup.tasks[0].id).toBe('+2_Physics_1_REV');
    });

    it('works generically across Commerce (+2) and Humanities (+1) partial pending parts', () => {
      const overdueDays = [
        {
          date: '2026-10-16',
          tasks: [
            {
              id: '+2_Accountancy_2_P3',
              chapId: '+2_Accountancy_2',
              grade: '+2',
              subject: 'Accountancy',
              chapNumber: 2,
              chapterName: 'Reconstitution of Partnership',
              part: 3,
              totalParts: 3,
              estimatedMinutes: 55,
              completed: false,
            },
            {
              id: '+1_History_1_P2',
              chapId: '+1_History_1',
              grade: '+1',
              subject: 'History',
              chapNumber: 1,
              chapterName: 'Writing and City Life',
              part: 2,
              totalParts: 2,
              estimatedMinutes: 45,
              completed: false,
            },
          ],
        },
        {
          date: '2026-10-15',
          tasks: [
            {
              id: '+2_Accountancy_2_P2',
              chapId: '+2_Accountancy_2',
              grade: '+2',
              subject: 'Accountancy',
              chapNumber: 2,
              chapterName: 'Reconstitution of Partnership',
              part: 2,
              totalParts: 3,
              estimatedMinutes: 55,
              completed: false,
            },
            {
              id: '+1_History_1_P1',
              chapId: '+1_History_1',
              grade: '+1',
              subject: 'History',
              chapNumber: 1,
              chapterName: 'Writing and City Life',
              part: 1,
              totalParts: 2,
              estimatedMinutes: 45,
              completed: false,
            },
          ],
        },
      ];

      const groups = compressPendingOverdueDays(overdueDays);
      expect(groups).toHaveLength(2);

      const acc = groups.find(g => g.chapterKey === '+2_Accountancy_2');
      expect(acc.isFullChapter).toBe(false);
      expect(acc.partStart).toBe(2);
      expect(acc.partEnd).toBe(3);
      expect(acc.totalMinutes).toBe(110);
      expect(formatCompressedGroupScope(acc)).toBe('Parts 2–3 of 3');

      const hist = groups.find(g => g.chapterKey === '+1_History_1');
      expect(hist.isFullChapter).toBe(true);
      expect(hist.totalMinutes).toBe(90);
      expect(formatCompressedGroupScope(hist)).toBe('Parts 1–2 of 2 (Full Chapter)');
    });
  });

  describe('compressSameDayTasks', () => {
    it('merges consecutive parts of the same chapter, preserves non-contiguous parts and duplicate-part clones', () => {
      const consecutive = [
        { id: '+2_Botany_1_P1', chapId: '+2_Botany_1', part: 1, totalParts: 3, estimatedMinutes: 50, completed: false },
        { id: '+2_Botany_1_P2', chapId: '+2_Botany_1', part: 2, totalParts: 3, estimatedMinutes: 50, completed: false },
        { id: '+2_Botany_1_P3', chapId: '+2_Botany_1', part: 3, totalParts: 3, estimatedMinutes: 50, completed: false },
      ];
      const merged = compressSameDayTasks(consecutive, '2026-10-17');
      expect(merged).toHaveLength(1);
      expect(merged[0].isFullChapter).toBe(true);
      expect(merged[0].totalMinutes).toBe(150);

      const nonContiguous = [
        { id: '+2_Physics_1_P1', chapId: '+2_Physics_1', part: 1, totalParts: 2, completed: false },
        { id: '+2_Chemistry_1_P1', chapId: '+2_Chemistry_1', part: 1, totalParts: 2, completed: false },
        { id: '+2_Physics_1_P2', chapId: '+2_Physics_1', part: 2, totalParts: 2, completed: false },
      ];
      expect(compressSameDayTasks(nonContiguous)).toHaveLength(3);

      const duplicateClones = [
        { id: 'storage-probe', chapId: '+2_Physics_1', part: 1, totalParts: 2, completed: false },
        { id: 'storage-other', chapId: '+2_Physics_1', part: 1, totalParts: 2, completed: false },
      ];
      expect(compressSameDayTasks(duplicateClones)).toHaveLength(2);
    });
  });

  describe('UI Rendering & One-Click Compressed Completion (Today, Pending & Full Plan)', () => {
    it('renders compressed pending block in #pending-work and completes all parts in one click', () => {
      const harness = createDomHarness();
      const fakeTime = new Date('2026-10-17T09:00:00Z').getTime();
      global.Date = class extends originalDate {
        constructor(...args) {
          super(...(args.length ? args : [fakeTime]));
        }
        static now() {
          return fakeTime;
        }
      };

      setActiveTodayStr('2026-10-17');
      setAppState({
        grade: '+2',
        stream: 'cs',
        xp: 0,
        streakCount: 0,
        deadlineDate: '2026-11-20',
        plan: [
          {
            dayNumber: 1,
            date: '2026-10-15',
            tasks: [
              {
                id: '+2_Physics_1_P1',
                chapId: '+2_Physics_1',
                grade: '+2',
                term: 1,
                subject: 'Physics',
                chapNumber: 1,
                chapterName: 'Electric Charges and Fields',
                part: 1,
                totalParts: 3,
                estimatedMinutes: 60,
                topicTitle: 'Part 1/3: Electric Charge & Coulomb Law',
                completed: false,
              },
            ],
          },
          {
            dayNumber: 2,
            date: '2026-10-16',
            tasks: [
              {
                id: '+2_Physics_1_P2',
                chapId: '+2_Physics_1',
                grade: '+2',
                term: 1,
                subject: 'Physics',
                chapNumber: 1,
                chapterName: 'Electric Charges and Fields',
                part: 2,
                totalParts: 3,
                estimatedMinutes: 60,
                topicTitle: 'Part 2/3: Electric Field & Flux',
                completed: false,
              },
              {
                id: '+2_Physics_1_P3',
                chapId: '+2_Physics_1',
                grade: '+2',
                term: 1,
                subject: 'Physics',
                chapNumber: 1,
                chapterName: 'Electric Charges and Fields',
                part: 3,
                totalParts: 3,
                estimatedMinutes: 60,
                topicTitle: 'Part 3/3 (Full Chapter): Gauss Law & PYQs',
                completed: false,
              },
            ],
          },
          {
            dayNumber: 3,
            date: '2026-10-17',
            tasks: [
              {
                id: '+2_Chemistry_1_P1',
                chapId: '+2_Chemistry_1',
                grade: '+2',
                term: 1,
                subject: 'Chemistry',
                chapNumber: 1,
                chapterName: 'Solutions',
                part: 1,
                totalParts: 2,
                estimatedMinutes: 60,
                topicTitle: 'Part 1/2: Concentration Terms',
                completed: false,
              },
            ],
          },
        ],
      });
      setCurrentView('today');
      renderApp();

      const html = harness.container.innerHTML;
      expect(html).toContain('3 unfinished from previous days. (1 chapter)');
      expect(html).toContain('Parts 1–3 of 3 (Full Chapter)');
      expect(html).toContain('180 min');
      expect(html).toContain('2026-10-15 – Yesterday');
      expect(html).toContain('Complete Chapter');

      const pendingBtns = harness.container.querySelectorAll('[data-pending-task]');
      expect(pendingBtns).toHaveLength(1);
      expect(pendingBtns[0].dataset.pendingTasks).toBe('+2_Physics_1_P1,+2_Physics_1_P2,+2_Physics_1_P3');

      // One-click complete pending chapter
      pendingBtns[0].click();

      const updated = getAppState();
      expect(updated.xp).toBe(300);
      expect(updated.plan[0].tasks[0].completed).toBe(true);
      expect(updated.plan[1].tasks[0].completed).toBe(true);
      expect(updated.plan[1].tasks[1].completed).toBe(true);
      // Today's Chemistry task remains untouched
      expect(updated.plan[2].tasks[0].completed).toBe(false);
      expect(harness.container.innerHTML).not.toContain('id="pending-work"');
    });

    it('renders continuous same-day chapter card in Today and Full Plan views and toggles cleanly', () => {
      const harness = createDomHarness();
      const fakeTime = new Date('2026-10-17T09:00:00Z').getTime();
      global.Date = class extends originalDate {
        constructor(...args) {
          super(...(args.length ? args : [fakeTime]));
        }
        static now() {
          return fakeTime;
        }
      };

      setActiveTodayStr('2026-10-17');
      setAppState({
        grade: '+2',
        stream: 'commerce',
        xp: 0,
        streakCount: 0,
        deadlineDate: '2026-11-01',
        plan: [
          {
            dayNumber: 1,
            date: '2026-10-17',
            tasks: [
              {
                id: '+2_Accountancy_1_P1',
                chapId: '+2_Accountancy_1',
                grade: '+2',
                term: 1,
                subject: 'Accountancy',
                chapNumber: 1,
                chapterName: 'Accounting for NPO',
                part: 1,
                totalParts: 3,
                estimatedMinutes: 60,
                topicTitle: 'Part 1/3: Receipts and Payments Account',
                completed: false,
              },
              {
                id: '+2_Accountancy_1_P2',
                chapId: '+2_Accountancy_1',
                grade: '+2',
                term: 1,
                subject: 'Accountancy',
                chapNumber: 1,
                chapterName: 'Accounting for NPO',
                part: 2,
                totalParts: 3,
                estimatedMinutes: 60,
                topicTitle: 'Part 2/3: Income and Expenditure Account',
                completed: false,
              },
              {
                id: '+2_Accountancy_1_P3',
                chapId: '+2_Accountancy_1',
                grade: '+2',
                term: 1,
                subject: 'Accountancy',
                chapNumber: 1,
                chapterName: 'Accounting for NPO',
                part: 3,
                totalParts: 3,
                estimatedMinutes: 60,
                topicTitle: 'Part 3/3 (Full Chapter): Balance Sheet & PYQs',
                completed: false,
              },
            ],
          },
        ],
      });

      // 1. Today View
      setCurrentView('today');
      renderApp();
      const todayHtml = harness.container.innerHTML;
      expect(todayHtml).toContain('Parts 1–3 of 3 (Full Chapter)');
      expect(todayHtml).toContain('180 min');
      expect(todayHtml).toContain('0 / 3 tasks complete');

      const studyBtns = harness.container.querySelectorAll('[data-study-task]');
      expect(studyBtns).toHaveLength(1);
      studyBtns[0].click();

      expect(getAppState().xp).toBe(300);
      expect(getAppState().plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(harness.container.innerHTML).toContain('3 / 3 tasks complete');

      // Undo restores all 3 parts
      harness.container.querySelectorAll('[data-study-task]')[0].click();
      expect(getAppState().xp).toBe(0);
      expect(getAppState().plan[0].tasks.every(t => !t.completed)).toBe(true);

      // 2. Full Plan View
      setCurrentView('plan');
      renderApp();
      const planHtml = harness.container.innerHTML;
      expect(planHtml).toContain('Parts 1–3 of 3 (Full Chapter)');
      expect(planHtml).toContain('⏱️ 180m');
      expect(planHtml).toContain('Study block 1 / 1');
      expect(planHtml).toContain('data-group-task-ids="+2_Accountancy_1_P1,+2_Accountancy_1_P2,+2_Accountancy_1_P3"');

      // Toggle directly via toggleTaskDirect with group CSV
      toggleTaskDirect('+2_Accountancy_1_P3', '+2_Accountancy_1_P1,+2_Accountancy_1_P2,+2_Accountancy_1_P3');
      expect(getAppState().plan[0].tasks.every(t => t.completed)).toBe(true);
      expect(getAppState().xp).toBe(300);
    });

    it('renders bilingual Malayalam scope and compressed button labels when language is ml', () => {
      const harness = createDomHarness();
      harness.storage.set('plustwo_lang', 'ml');
      global.document.documentElement.lang = 'ml';

      const fakeTime = new Date('2026-10-17T09:00:00Z').getTime();
      global.Date = class extends originalDate {
        constructor(...args) {
          super(...(args.length ? args : [fakeTime]));
        }
        static now() {
          return fakeTime;
        }
      };

      setActiveTodayStr('2026-10-17');
      setAppState({
        grade: '+1',
        stream: 'humanities',
        xp: 0,
        streakCount: 0,
        deadlineDate: '2026-11-10',
        plan: [
          {
            dayNumber: 1,
            date: '2026-10-15',
            tasks: [
              {
                id: '+1_History_1_P1',
                chapId: '+1_History_1',
                grade: '+1',
                subject: 'History',
                chapNumber: 1,
                chapterName: 'Writing and City Life',
                part: 1,
                totalParts: 2,
                estimatedMinutes: 45,
                completed: false,
              },
              {
                id: '+1_History_1_P2',
                chapId: '+1_History_1',
                grade: '+1',
                subject: 'History',
                chapNumber: 1,
                chapterName: 'Writing and City Life',
                part: 2,
                totalParts: 2,
                estimatedMinutes: 45,
                completed: false,
              },
            ],
          },
        ],
      });
      setCurrentView('today');
      renderApp();

      const html = harness.container.innerHTML;
      expect(html).toContain('ഭാഗങ്ങൾ 1–2/2 (മുഴുവൻ അധ്യായം)');
      expect(html).toContain('അധ്യായം പൂർത്തിയാക്കുക');
      expect(html).toContain('90 min');
    });
  });
});
