import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  getActiveTodayStr,
  setActiveTodayStr,
  getAppState,
  setAppState,
  getCurrentView,
  setCurrentView,
  setupAutoRefresh,
  setupWindowBindings,
  checkDate,
  compactPlanToToday,
  getActiveStreak,
  getYesterdayStr,
  renderApp,
} from '../src/app.js';
import { formatLocalDateStr, getLocalDateStr } from '../src/engine/planner.js';

describe('Requirement R3: Temporal Pacing, Midnight Rollover & Live Tab Lifecycle', () => {
  const appJsPath = path.resolve(__dirname, '../src/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  // Helper to create mock DOM elements
  function createMockElement(id = '', initialClasses = []) {
    const classSet = new Set(initialClasses);
    const element = {
      id,
      innerText: '',
      textContent: '',
      innerHTML: '',
      value: '',
      dataset: {},
      classList: {
        add: (...classes) => classes.forEach(c => classSet.add(c)),
        remove: (...classes) => classes.forEach(c => classSet.delete(c)),
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
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn(() => null),
      appendChild: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    return element;
  }

  // Setup common browser-like environment for Vitest Node runner
  let mockStorage;
  let mockReload;
  let mockDateDisplay;
  let mockToastBanner;
  let mockToastContent;
  let mockAppContainer;
  let eventListeners;

  function initTestEnvironment() {
    mockStorage = new Map();
    mockReload = vi.fn();
    mockDateDisplay = createMockElement('date-display');
    mockToastBanner = createMockElement('toast-banner', ['translate-y-24', 'opacity-0']);
    mockToastContent = createMockElement('toast-content');
    mockAppContainer = createMockElement('app-container');
    eventListeners = new Map();

    global.localStorage = {
      getItem: vi.fn(key => (mockStorage.has(key) ? mockStorage.get(key) : null)),
      setItem: vi.fn((key, val) => mockStorage.set(key, String(val))),
      removeItem: vi.fn(key => mockStorage.delete(key)),
      clear: vi.fn(() => mockStorage.clear()),
    };

    global.sessionStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    global.window = {
      location: { reload: mockReload },
      scrollTo: vi.fn(),
      addEventListener: vi.fn((event, handler) => {
        if (!eventListeners.has(event)) eventListeners.set(event, []);
        eventListeners.get(event).push(handler);
      }),
      removeEventListener: vi.fn((event, handler) => {
        if (eventListeners.has(event)) {
          const list = eventListeners.get(event).filter(h => h !== handler);
          eventListeners.set(event, list);
        }
      }),
    };

    global.document = {
      hidden: false,
      documentElement: {
        lang: 'en',
        classList: {
          contains: vi.fn(() => false),
        },
      },
      body: { classList: { toggle: vi.fn() } },
      getElementById: vi.fn((id) => {
        if (id === 'date-display') return mockDateDisplay;
        if (id === 'toast-banner') return mockToastBanner;
        if (id === 'toast-content') return mockToastContent;
        if (id === 'app-container') return mockAppContainer;
        return null;
      }),
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn(() => null),
      addEventListener: vi.fn((event, handler) => {
        if (!eventListeners.has(event)) eventListeners.set(event, []);
        eventListeners.get(event).push(handler);
      }),
      removeEventListener: vi.fn((event, handler) => {
        if (eventListeners.has(event)) {
          const list = eventListeners.get(event).filter(h => h !== handler);
          eventListeners.set(event, list);
        }
      }),
    };

    setupWindowBindings();
  }

  describe('1. Interface Surface & Module Exports', () => {
    it('exports getActiveTodayStr, setupAutoRefresh, checkDate, compactPlanToToday, getActiveStreak', () => {
      expect(typeof getActiveTodayStr).toBe('function');
      expect(typeof setActiveTodayStr).toBe('function');
      expect(typeof setupAutoRefresh).toBe('function');
      expect(typeof checkDate).toBe('function');
      expect(typeof compactPlanToToday).toBe('function');
      expect(typeof getActiveStreak).toBe('function');
      expect(typeof getYesterdayStr).toBe('function');
    });

    it('exposes getActiveTodayStr, getActiveStreak, checkDate on window in src/app.js', () => {
      expect(appJsContent).toContain('getActiveTodayStr,');
      expect(appJsContent).toContain('getActiveStreak,');
      expect(appJsContent).toContain('checkDate,');
      expect(appJsContent).toContain('checkDateRollover: checkDate,');
      expect(appJsContent).toMatch(/export\s*\{\s*[\s\S]*getActiveTodayStr[\s\S]*\};/);
    });

    it('returns the current local date from getActiveTodayStr()', () => {
      const today = getActiveTodayStr();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(today).toBe(getLocalDateStr());
    });
  });

  describe('2. Live Date Rollover & Tab Lifecycle (No Hard Reload)', () => {
    let originalDate;

    beforeEach(() => {
      originalDate = global.Date;
      initTestEnvironment();
    });

    afterEach(() => {
      global.Date = originalDate;
      setAppState(null);
      vi.restoreAllMocks();
    });

    it('detects date change, updates activeTodayStr, updates date-display, and triggers toast without reload', () => {
      const day1 = new Date('2026-10-31T23:59:50');
      const day2 = new Date('2026-11-01T00:00:05');

      let mockCurrentDate = day1;
      class MockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockCurrentDate.getTime());
        }
      }
      global.Date = MockDate;

      setActiveTodayStr('2026-10-31');
      setupAutoRefresh();
      expect(getActiveTodayStr()).toBe('2026-10-31');

      setAppState({
        grade: '+2',
        stream: 'cs',
        plan: [
          { dayNumber: 1, date: '2026-10-31', tasks: [{ id: 'task1', completed: false }] },
          { dayNumber: 2, date: '2026-11-01', tasks: [{ id: 'task2', completed: false }] },
        ],
      });
      setCurrentView('today');

      // Check date before rollover - nothing changes
      checkDate();
      expect(getActiveTodayStr()).toBe('2026-10-31');
      expect(mockReload).not.toHaveBeenCalled();

      // Advance time to Day 2 (midnight rollover)
      mockCurrentDate = day2;

      // checkDate() is executed (e.g. by midnight timer or visibility event)
      checkDate();

      // activeTodayStr should now be 2026-11-01
      expect(getActiveTodayStr()).toBe('2026-11-01');

      // Date header was updated
      expect(mockDateDisplay.innerText).toBeTruthy();

      // Toast notification was triggered with new day message
      expect(mockToastContent.innerHTML).toContain("A new study day has begun! Today's timetable has updated.");

      // CRITICAL: Window reload was NOT called - seamless in-place transition!
      expect(mockReload).not.toHaveBeenCalled();
    });

    it('falls back to window.location.reload() only if an unhandled error occurs during renderApp', () => {
      const day1 = new Date('2026-10-31T23:59:50');
      const day2 = new Date('2026-11-01T00:00:05');

      let mockCurrentDate = day1;
      class MockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockCurrentDate.getTime());
        }
      }
      global.Date = MockDate;

      setActiveTodayStr('2026-10-31');
      setupAutoRefresh();

      // Corrupt appState to trigger an unhandled error inside renderApp
      setAppState({
        get plan() {
          throw new Error('Fatal rendering corruption');
        },
      });

      // Advance time to Day 2
      mockCurrentDate = day2;

      // Run checkDate - renderApp throws, fallback to reload should be triggered
      checkDate();

      expect(mockReload).toHaveBeenCalled();
    });

    it('triggers rollover check on tab visibility change or focus when coming back to the tab', () => {
      const day1 = new Date('2026-10-31T23:50:00');
      const day2 = new Date('2026-11-01T07:30:00');

      let mockCurrentDate = day1;
      class MockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockCurrentDate.getTime());
        }
      }
      global.Date = MockDate;

      setActiveTodayStr('2026-10-31');
      setupAutoRefresh();
      expect(getActiveTodayStr()).toBe('2026-10-31');

      setAppState({
        grade: '+2',
        stream: 'cs',
        plan: [{ dayNumber: 1, date: '2026-10-31', tasks: [] }],
      });
      setCurrentView('today');

      // Advance to morning of next day while user is asleep
      mockCurrentDate = day2;

      // User opens the phone / brings tab to front: visibilitychange fires
      const visibilityHandlers = eventListeners.get('visibilitychange') || [];
      expect(visibilityHandlers.length).toBeGreaterThan(0);

      // Call visibility handler
      visibilityHandlers.forEach(h => h());

      // activeTodayStr should now be Day 2
      expect(getActiveTodayStr()).toBe('2026-11-01');
      expect(mockReload).not.toHaveBeenCalled();
    });

    it('supports Malayalam notification toast when language is ml', () => {
      const day1 = new Date('2026-10-31T23:50:00');
      const day2 = new Date('2026-11-01T00:01:00');

      let mockCurrentDate = day1;
      class MockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockCurrentDate.getTime());
        }
      }
      global.Date = MockDate;

      setActiveTodayStr('2026-10-31');
      setupAutoRefresh();

      setAppState({
        grade: '+2',
        stream: 'cs',
        plan: [{ dayNumber: 1, date: '2026-10-31', tasks: [] }],
      });
      setCurrentView('today');

      // Set Malayalam language in storage and document
      mockStorage.set('plustwo_lang', 'ml');
      global.document.documentElement.lang = 'ml';

      mockCurrentDate = day2;
      checkDate();

      // Malayalam toast message should be shown
      expect(mockToastContent.innerHTML).toContain('പുതിയ പഠനദിനം ആരംഭിച്ചു');
    });
  });

  describe('3. Plan View Dynamic "TODAY" Badge Progression', () => {
    let originalDate;

    beforeEach(() => {
      originalDate = global.Date;
      initTestEnvironment();
    });

    afterEach(() => {
      global.Date = originalDate;
      setAppState(null);
      vi.restoreAllMocks();
    });

    it('dynamically moves the TODAY badge to Day 2 in Plan View when date rolls over', () => {
      let mockCurrentDate = new Date('2026-10-31T12:00:00');
      class MockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockCurrentDate.getTime());
        }
      }
      global.Date = MockDate;

      const samplePlan = [
        {
          dayNumber: 1,
          date: '2026-10-31',
          tasks: [{ id: 't1', subject: 'Physics', completed: false }],
        },
        {
          dayNumber: 2,
          date: '2026-11-01',
          tasks: [{ id: 't2', subject: 'Chemistry', completed: false }],
        },
        {
          dayNumber: 3,
          date: '2026-11-02',
          tasks: [{ id: 't3', subject: 'Mathematics', completed: false }],
        },
      ];

      setAppState({
        grade: '+2',
        stream: 'cs',
        plan: samplePlan,
      });

      // Set view to 'plan'
      setCurrentView('plan');

      // Render Plan View on Day 1
      renderApp();

      // Verify that Day 1's card has the TODAY badge, and Day 2 does not
      expect(mockAppContainer.innerHTML).toContain('data-day-number="1"');
      expect(mockAppContainer.innerHTML).toContain('TODAY');

      const day1Index = mockAppContainer.innerHTML.indexOf('data-day-number="1"');
      const day2Index = mockAppContainer.innerHTML.indexOf('data-day-number="2"');
      const todayBadgeIndex = mockAppContainer.innerHTML.indexOf('TODAY');

      expect(todayBadgeIndex).toBeGreaterThan(day1Index);
      expect(todayBadgeIndex).toBeLessThan(day2Index);

      // Now date advances to Day 2
      mockCurrentDate = new Date('2026-11-01T08:00:00');

      // Trigger checkDate rollover & re-render
      checkDate();
      renderApp();

      // Now Day 2 must have the TODAY badge, and Day 1 must NOT have the TODAY badge!
      const updatedHTML = mockAppContainer.innerHTML;
      const newDay1Idx = updatedHTML.indexOf('data-day-number="1"');
      const newDay2Idx = updatedHTML.indexOf('data-day-number="2"');
      const newDay3Idx = updatedHTML.indexOf('data-day-number="3"');
      const newTodayIdx = updatedHTML.indexOf('TODAY');

      expect(newTodayIdx).toBeGreaterThan(newDay2Idx);
      expect(newTodayIdx).toBeLessThan(newDay3Idx);
    });
  });

  describe('4. Attended Day Numbering & Contiguous Pacing in compactPlanToToday()', () => {
    let originalDate;

    beforeEach(() => {
      originalDate = global.Date;
      initTestEnvironment();
    });

    afterEach(() => {
      global.Date = originalDate;
      setAppState(null);
      vi.restoreAllMocks();
    });

    it('ensures completed historical days are numbered 1..k in chronological order and upcoming days are (k+1)..N', () => {
      // Today is 2026-10-31
      let mockCurrentDate = new Date('2026-10-31T10:00:00');
      class MockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockCurrentDate.getTime());
        }
      }
      global.Date = MockDate;

      // Student has completed Day 1 (2026-10-28) and Day 2 (2026-10-29).
      // Day 3 (2026-10-30) had unfinished tasks.
      // Day 4 (2026-10-31) and Day 5 (2026-11-01) are ahead.
      setAppState({
        grade: '+2',
        stream: 'cs',
        startDate: '2026-10-28',
        deadlineDate: '2026-11-15',
        plan: [
          {
            dayNumber: 1,
            date: '2026-10-28',
            tasks: [{ id: 'p1', completed: true }, { id: 'p2', completed: true }],
          },
          {
            dayNumber: 2,
            date: '2026-10-29',
            tasks: [{ id: 'c1', completed: true }],
          },
          {
            dayNumber: 3,
            date: '2026-10-30',
            tasks: [{ id: 'm1', completed: false }],
          },
          {
            dayNumber: 4,
            date: '2026-10-31',
            tasks: [{ id: 'cs1', completed: false }],
          },
          {
            dayNumber: 5,
            date: '2026-11-01',
            tasks: [{ id: 'cs2', completed: false }],
          },
        ],
      });

      compactPlanToToday();

      const plan = getAppState().plan;
      expect(plan.length).toBe(5);

      // Attended completed days: strictly Day 1 and Day 2
      expect(plan[0].dayNumber).toBe(1);
      expect(plan[0].date).toBe('2026-10-28');
      expect(plan[0].tasks.every(t => t.completed)).toBe(true);

      expect(plan[1].dayNumber).toBe(2);
      expect(plan[1].date).toBe('2026-10-29');
      expect(plan[1].tasks.every(t => t.completed)).toBe(true);

      // Upcoming compacted days: strictly numbered Day 3..5 starting from TODAY (2026-10-31)
      expect(plan[2].dayNumber).toBe(3);
      expect(plan[2].date).toBe('2026-10-31'); // Compacted to Today!
      expect(plan[2].tasks[0].id).toBe('m1');

      expect(plan[3].dayNumber).toBe(4);
      expect(plan[3].date).toBe('2026-11-01'); // Tomorrow
      expect(plan[3].tasks[0].id).toBe('cs1');

      expect(plan[4].dayNumber).toBe(5);
      expect(plan[4].date).toBe('2026-11-02'); // Day after tomorrow
      expect(plan[4].tasks[0].id).toBe('cs2');

      // Verify that every dayNumber is contiguous 1..N
      plan.forEach((day, idx) => {
        expect(day.dayNumber).toBe(idx + 1);
      });
    });

    it('sorts attended days chronologically into Day 1..k even if previously out of order', () => {
      let mockCurrentDate = new Date('2026-10-31T10:00:00');
      class MockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockCurrentDate.getTime());
        }
      }
      global.Date = MockDate;

      // Plan has historical days shuffled in order
      setAppState({
        grade: '+2',
        stream: 'cs',
        startDate: '2026-10-27',
        deadlineDate: '2026-11-15',
        plan: [
          {
            dayNumber: 2,
            date: '2026-10-29',
            tasks: [{ id: 'b', completed: true }],
          },
          {
            dayNumber: 1,
            date: '2026-10-28',
            tasks: [{ id: 'a', completed: true }],
          },
          {
            dayNumber: 3,
            date: '2026-10-30',
            tasks: [{ id: 'c', completed: false }],
          },
        ],
      });

      compactPlanToToday();

      const plan = getAppState().plan;
      expect(plan.length).toBe(3);

      // Earliest date (2026-10-28) must be Day 1
      expect(plan[0].dayNumber).toBe(1);
      expect(plan[0].date).toBe('2026-10-28');

      // Next date (2026-10-29) must be Day 2
      expect(plan[1].dayNumber).toBe(2);
      expect(plan[1].date).toBe('2026-10-29');

      // Unfinished day compacted to today as Day 3
      expect(plan[2].dayNumber).toBe(3);
      expect(plan[2].date).toBe('2026-10-31');
    });

    it('shows all-complete toast if all tasks are already finished without corrupting plan', () => {
      let mockCurrentDate = new Date('2026-10-31T10:00:00');
      class MockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockCurrentDate.getTime());
        }
      }
      global.Date = MockDate;

      setAppState({
        grade: '+2',
        stream: 'cs',
        startDate: '2026-10-28',
        deadlineDate: '2026-11-15',
        plan: [
          { dayNumber: 1, date: '2026-10-28', tasks: [{ id: 'a', completed: true }] },
          { dayNumber: 2, date: '2026-10-29', tasks: [{ id: 'b', completed: true }] },
        ],
      });

      compactPlanToToday();

      // Plan should be completely untouched
      const plan = getAppState().plan;
      expect(plan.length).toBe(2);
      expect(plan[0].dayNumber).toBe(1);
      expect(plan[1].dayNumber).toBe(2);
    });
  });

  describe('5. Streak Calculation Seamless Inactivity Window (getActiveStreak)', () => {
    let originalDate;

    beforeEach(() => {
      originalDate = global.Date;
      initTestEnvironment();
    });

    afterEach(() => {
      global.Date = originalDate;
      setAppState(null);
      vi.restoreAllMocks();
    });

    it('returns streak count if lastCompletedDate was today', () => {
      let mockCurrentDate = new Date('2026-10-31T14:00:00');
      class MockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockCurrentDate.getTime());
        }
      }
      global.Date = MockDate;
      setActiveTodayStr('2026-10-31');

      setAppState({
        streakCount: 5,
        lastCompletedDate: '2026-10-31',
      });

      expect(getActiveStreak()).toBe(5);
    });

    it('returns streak count if lastCompletedDate was yesterday (today in progress)', () => {
      let mockCurrentDate = new Date('2026-10-31T14:00:00');
      class MockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockCurrentDate.getTime());
        }
      }
      global.Date = MockDate;
      setActiveTodayStr('2026-10-31');

      setAppState({
        streakCount: 7,
        lastCompletedDate: '2026-10-30', // yesterday
      });

      expect(getActiveStreak()).toBe(7);
    });

    it('resets streak to 0 if lastCompletedDate was 2 or more days ago', () => {
      let mockCurrentDate = new Date('2026-10-31T14:00:00');
      class MockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockCurrentDate.getTime());
        }
      }
      global.Date = MockDate;
      setActiveTodayStr('2026-10-31');

      setAppState({
        streakCount: 12,
        lastCompletedDate: '2026-10-29', // 2 days ago
      });

      expect(getActiveStreak()).toBe(0);
    });

    it('preserves streak across midnight boundary when day rolls over', () => {
      // 11:59 PM on 2026-10-31 - student finished targets today
      let mockCurrentDate = new Date('2026-10-31T23:59:00');
      class MockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockCurrentDate.getTime());
        }
      }
      global.Date = MockDate;

      setActiveTodayStr('2026-10-31');
      setupAutoRefresh();

      setAppState({
        streakCount: 10,
        lastCompletedDate: '2026-10-31',
        plan: [],
      });

      expect(getActiveStreak()).toBe(10);

      // Clock strikes midnight -> 2026-11-01T00:01:00
      mockCurrentDate = new Date('2026-11-01T00:01:00');
      checkDate(); // Rollover fires: activeTodayStr becomes 2026-11-01

      // Now 2026-10-31 is "yesterday", and student has not completed today's tasks yet.
      // Streak must NOT drop to 0!
      expect(getActiveStreak()).toBe(10);
    });

    it('returns 0 when appState is null or streakCount is zero or lastCompletedDate is missing', () => {
      setAppState(null);
      expect(getActiveStreak()).toBe(0);

      setAppState({ streakCount: 0, lastCompletedDate: '2026-10-31' });
      expect(getActiveStreak()).toBe(0);

      setAppState({ streakCount: 5, lastCompletedDate: null });
      expect(getActiveStreak()).toBe(0);
    });
  });
});
