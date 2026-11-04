import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getActiveTodayStr,
  setActiveTodayStr,
  getAppState,
  setAppState,
  renderApp,
  checkDate,
  performCloudSync,
  syncAppStateToCloud,
  saveAppState,
  saveAppStateLocally,
  getCurrentUser,
  setCurrentUser,
  getFirebaseAuth,
  setFirebaseAuth,
  getFirestoreDb,
  setFirestoreDb,
  setupWindowBindings,
  getLocalDateStr,
} from '../src/app.js';
import {
  createAccountSync,
  queuePendingAccountState,
  reconcileStudyPlan,
  sameStudyPlan,
} from '../src/auth/account-sync.js';
import {
  persistStudyBackup,
  loadStudyBackup,
} from '../src/utils/study-backup.js';
import { getDailyPlan } from '../src/ui/daily-plan.js';

// Hoist mocks for UI dialogs, audio, analytics and confetti
let confirmDialogResponse = true;
const confirmDialogArgsHistory = [];
const appAlertArgsHistory = [];
const appToastArgsHistory = [];

vi.mock('../src/ui/dialogs.js', () => ({
  showAppConfirm: vi.fn(async (args) => {
    confirmDialogArgsHistory.push(args);
    return typeof confirmDialogResponse === 'function'
      ? confirmDialogResponse(args)
      : confirmDialogResponse;
  }),
  showAppToast: vi.fn((msg, icon) => {
    appToastArgsHistory.push({ msg, icon });
    if (global.document && typeof global.document.getElementById === 'function') {
      const tc = global.document.getElementById('toast-content');
      if (tc) tc.innerHTML = msg;
    }
  }),
  showAppAlert: vi.fn((args) => {
    appAlertArgsHistory.push(args);
  }),
}));

vi.mock('../src/audio/chime.js', () => ({
  playTaskCompleteSound: vi.fn(),
  playMilestoneCelebrationSound: vi.fn(),
  playUntickSound: vi.fn(),
  playTapSound: vi.fn(),
}));

vi.mock('../src/utils/confetti.js', () => ({
  triggerStudyConfetti: vi.fn(),
}));

vi.mock('../src/analytics/tracker.js', () => ({
  trackEvent: vi.fn(),
  ensureFirebaseAnalytics: vi.fn(),
  trackTaskChecked: vi.fn(),
  getFunnelStats: vi.fn(),
}));

describe('Empirical Adversarial Challenge: Date Rollover Continuity & Offline/Online Flapping', () => {
  // In-Memory Mock Firestore Document with listener & offline error support
  class MockFirestoreDoc {
    constructor(initialData = null) {
      this._data = initialData ? JSON.parse(JSON.stringify(initialData)) : null;
      this._listeners = new Set();
      this._unavailable = false;
    }

    async get(options) {
      if (this._unavailable) throw new Error('offline');
      return {
        exists: this._data !== null,
        data: () => (this._data ? JSON.parse(JSON.stringify(this._data)) : null),
        metadata: { fromCache: false, hasPendingWrites: false },
      };
    }

    async set(newData, options = {}) {
      if (this._unavailable) throw new Error('offline');
      if (options.merge && this._data) {
        this._data = { ...this._data, ...JSON.parse(JSON.stringify(newData)) };
      } else {
        this._data = JSON.parse(JSON.stringify(newData));
      }
      const snap = {
        exists: true,
        data: () => (this._data ? JSON.parse(JSON.stringify(this._data)) : null),
        metadata: { hasPendingWrites: false, fromCache: false },
      };
      for (const listener of this._listeners) {
        listener(snap);
      }
    }

    async delete() {
      if (this._unavailable) throw new Error('offline');
      this._data = null;
      const snap = {
        exists: false,
        data: () => null,
        metadata: { hasPendingWrites: false },
      };
      for (const listener of this._listeners) {
        listener(snap);
      }
    }

    onSnapshot(options, callback = options) {
      const cb = typeof options === 'function' ? options : callback;
      this._listeners.add(cb);
      return () => {
        this._listeners.delete(cb);
      };
    }

    emitSnapshot(data, metadata = { hasPendingWrites: false, fromCache: false }) {
      const snap = {
        exists: data !== null,
        data: () => (data ? JSON.parse(JSON.stringify(data)) : null),
        metadata,
      };
      for (const listener of this._listeners) {
        listener(snap);
      }
    }

    setUnavailable(val) {
      this._unavailable = val;
    }
  }

  // Mock Firestore Collection
  class MockFirestoreCollection {
    constructor() {
      this._docs = new Map();
      this._unavailable = false;
    }

    doc(id) {
      if (!this._docs.has(id)) {
        const doc = new MockFirestoreDoc();
        doc.setUnavailable(this._unavailable);
        this._docs.set(id, doc);
      }
      return this._docs.get(id);
    }

    setUnavailable(val) {
      this._unavailable = val;
      for (const doc of this._docs.values()) {
        doc.setUnavailable(val);
      }
    }
  }

  // Mock Firestore DB with transaction support
  class MockFirestoreDb {
    constructor() {
      this._collections = new Map();
      this._unavailable = false;
    }

    collection(name) {
      if (!this._collections.has(name)) {
        const col = new MockFirestoreCollection();
        col.setUnavailable(this._unavailable);
        this._collections.set(name, col);
      }
      return this._collections.get(name);
    }

    async runTransaction(update) {
      if (this._unavailable) throw new Error('offline');
      const writes = [];
      const result = await update({
        get: async (ref) => ref.get({ source: 'server' }),
        set: (ref, data) => writes.push([ref, data]),
      });
      for (const [ref, data] of writes) {
        await ref.set(data);
      }
      return result;
    }

    setUnavailable(val) {
      this._unavailable = val;
      for (const col of this._collections.values()) {
        col.setUnavailable(val);
      }
    }
  }

  // Mock Firebase Auth
  class MockFirebaseAuth {
    constructor() {
      this._currentUser = null;
      this._listeners = new Set();
    }

    get currentUser() {
      return this._currentUser;
    }

    onAuthStateChanged(listener) {
      this._listeners.add(listener);
      Promise.resolve().then(() => listener(this._currentUser));
      return () => {
        this._listeners.delete(listener);
      };
    }

    async signInWithUser(user) {
      this._currentUser = user;
      for (const listener of this._listeners) {
        await listener(user);
      }
    }

    async signOut() {
      this._currentUser = null;
      for (const listener of this._listeners) {
        await listener(null);
      }
    }
  }

  // Helper to build realistic study plans
  function buildTestStudyPlan({
    stream = 'cs',
    grade = '+2',
    daysCount = 5,
    tasksPerDay = 3,
    completedTaskCount = 0,
    ownerUid = null,
    userEmail = null,
    clientSessionId = 'adv_sess',
    startDate = '2026-11-01',
    deadlineDate = '2026-11-20',
    createdAt = '2026-11-01T00:00:00.000Z',
    lastModified = '2026-11-01T00:00:00.000Z',
    lastSynced = '2026-11-01T00:00:00.000Z',
    restDayNumbers = [],
  } = {}) {
    const subjects =
      stream === 'cs'
        ? ['Physics', 'Chemistry', 'Computer Science']
        : stream === 'commerce'
        ? ['Accountancy', 'Business Studies', 'Economics']
        : stream === 'humanities'
        ? ['History', 'Political Science', 'Sociology']
        : ['Physics', 'Chemistry', 'Biology'];

    const plan = [];
    let taskCounter = 0;

    for (let d = 1; d <= daysCount; d++) {
      const isRest = restDayNumbers.includes(d);
      const dayTasks = [];
      if (!isRest) {
        for (let t = 1; t <= tasksPerDay; t++) {
          taskCounter++;
          const isDone = taskCounter <= completedTaskCount;
          const subj = subjects[(t - 1) % subjects.length];
          dayTasks.push({
            id: `task_${stream}_d${d}_t${t}`,
            subject: subj,
            chapterName: `${subj} Chapter ${d}`,
            completed: isDone,
            isRevision: false,
            isExamEveTask: false,
            estimatedMinutes: 60,
          });
        }
      }
      const dayDate = new Date(startDate);
      dayDate.setDate(dayDate.getDate() + (d - 1));
      const dateStr = dayDate.toISOString().split('T')[0];
      plan.push({
        dayNumber: d,
        date: dateStr,
        dayOfWeek: dayDate.getDay(),
        isRestDay: isRest,
        tasks: dayTasks,
      });
    }

    return {
      engineVersion: 6,
      stream,
      grade,
      startDate,
      deadlineDate,
      ownerUid,
      userEmail,
      clientSessionId,
      createdAt,
      lastModified,
      lastSynced,
      plan,
    };
  }

  function setSystemDateString(dateStr) {
    const fakeTime = new Date(`${dateStr}T08:00:00.000Z`).getTime();
    class RolloverDate extends originalDate {
      constructor(...args) {
        if (args.length === 0) super(fakeTime);
        else super(...args);
      }
      static now() {
        return fakeTime;
      }
    }
    global.Date = RolloverDate;
  }

  let mockStorage;
  let mockSessionStorage;
  let elementMap;
  let mockReload;
  let eventListeners;
  let mockDb;
  let mockAuth;
  let originalDate;

  function createMockElement(id = '', initialClasses = []) {
    const classSet = new Set(initialClasses);
    return {
      id,
      innerText: '',
      textContent: '',
      innerHTML: '',
      value: '',
      dataset: {},
      style: {},
      classList: {
        add: (...classes) => classes.forEach((c) => classSet.add(c)),
        remove: (...classes) => classes.forEach((c) => classSet.delete(c)),
        contains: (c) => classSet.has(c),
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
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      closest: vi.fn(() => null),
    };
  }

  function getOrCreateElement(id, initialClasses = []) {
    if (!elementMap.has(id)) {
      elementMap.set(id, createMockElement(id, initialClasses));
    }
    return elementMap.get(id);
  }

  beforeEach(() => {
    originalDate = global.Date;
    mockStorage = new Map();
    mockSessionStorage = new Map();
    elementMap = new Map();
    mockReload = vi.fn();
    eventListeners = new Map();
    confirmDialogResponse = true;

    getOrCreateElement('app-container');
    getOrCreateElement('date-display');
    getOrCreateElement('toast-banner', ['translate-y-24', 'opacity-0']);
    getOrCreateElement('toast-content');
    getOrCreateElement('user-dropdown', ['hidden']);
    getOrCreateElement('auth-modal', ['hidden']);
    getOrCreateElement('settings-modal', ['hidden']);
    getOrCreateElement('settings-restore-plan-row', ['hidden']);
    getOrCreateElement('settings-undo-reset-row', ['hidden']);
    getOrCreateElement('regenerate-modal', ['hidden']);
    getOrCreateElement('regenerate-undo-reset-box', ['hidden']);
    getOrCreateElement('stat-tasks-done');
    getOrCreateElement('stat-completion-rate');

    global.localStorage = {
      getItem: vi.fn((key) => (mockStorage.has(key) ? mockStorage.get(key) : null)),
      setItem: vi.fn((key, val) => mockStorage.set(key, String(val))),
      removeItem: vi.fn((key) => mockStorage.delete(key)),
      clear: vi.fn(() => mockStorage.clear()),
    };

    global.sessionStorage = {
      getItem: vi.fn((key) => (mockSessionStorage.has(key) ? mockSessionStorage.get(key) : null)),
      setItem: vi.fn((key, val) => mockSessionStorage.set(key, String(val))),
      removeItem: vi.fn((key) => mockSessionStorage.delete(key)),
      clear: vi.fn(() => mockSessionStorage.clear()),
    };

    global.CSS = {
      escape: (str) => String(str).replace(/["\\]/g, '\\$&'),
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
          const list = eventListeners.get(event).filter((h) => h !== handler);
          eventListeners.set(event, list);
        }
      }),
      dispatchEvent: vi.fn((evt) => {
        const type = typeof evt === 'string' ? evt : evt.type;
        const handlers = eventListeners.get(type) || [];
        handlers.forEach((h) => h(evt));
      }),
    };

    global.document = {
      hidden: false,
      visibilityState: 'visible',
      documentElement: {
        lang: 'en',
        classList: {
          contains: vi.fn(() => false),
        },
      },
      body: { classList: { toggle: vi.fn() } },
      getElementById: vi.fn((id) => getOrCreateElement(id)),
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn(() => null),
      createElement: vi.fn((tag) => {
        const el = createMockElement();
        el.tagName = tag.toUpperCase();
        return el;
      }),
      addEventListener: vi.fn((event, handler) => {
        if (!eventListeners.has(event)) eventListeners.set(event, []);
        eventListeners.get(event).push(handler);
      }),
      removeEventListener: vi.fn((event, handler) => {
        if (eventListeners.has(event)) {
          const list = eventListeners.get(event).filter((h) => h !== handler);
          eventListeners.set(event, list);
        }
      }),
    };

    mockDb = new MockFirestoreDb();
    mockAuth = new MockFirebaseAuth();
    setFirestoreDb(mockDb);
    setFirebaseAuth(mockAuth);

    setupWindowBindings();
  });

  afterEach(() => {
    global.Date = originalDate;
    setAppState(null);
    setCurrentUser(null);
  });

  // =========================================================================
  // Challenge Area 1: Multi-Day Sequential Date Rollovers (Day 1 -> Day 2 -> Day 5)
  // With Overdue Tasks, Rest Days, and Mid-Journey Plan Creations
  // =========================================================================
  describe('Area 1: Multi-Day Sequential Date Rollovers & Overdue Continuity', () => {
    it('simulates multi-day progression: Day 1 (partial completion) -> Day 2 (rest day) -> Day 5 (multi-day gap jump) with accurate overdue retention', async () => {
      const user = { uid: 'user_multiday_1', email: 'multi1@test.com' };
      setCurrentUser(user);

      // Start on Day 1: 2026-11-01
      setSystemDateString('2026-11-01');
      setActiveTodayStr('2026-11-01');

      // 5-day plan with Day 2 as a rest day, 3 tasks/day
      const plan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 6,
        tasksPerDay: 3,
        completedTaskCount: 1, // Only Task 1 of Day 1 completed
        ownerUid: user.uid,
        startDate: '2026-11-01',
        deadlineDate: '2026-11-20',
        restDayNumbers: [2], // Day 2 is a rest day
      });
      setAppState(plan);
      saveAppStateLocally();
      await syncAppStateToCloud(plan);

      // Verify Day 1 state
      let daily = getDailyPlan(getAppState().plan, '2026-11-01');
      expect(daily.todayPlan.dayNumber).toBe(1);
      expect(daily.todayPlan.tasks[0].completed).toBe(true);
      expect(daily.todayPlan.tasks[1].completed).toBe(false);
      expect(daily.todayPlan.tasks[2].completed).toBe(false);
      expect(daily.overdueCount).toBe(0); // No overdue tasks on Day 1

      // -----------------------------------------------------------------
      // Step 1: Midnight rollover to Day 2 (2026-11-02, Rest Day)
      // -----------------------------------------------------------------
      setSystemDateString('2026-11-02');
      checkDate();

      expect(getActiveTodayStr()).toBe('2026-11-02');
      daily = getDailyPlan(getAppState().plan, '2026-11-02');
      expect(daily.todayPlan.isRestDay).toBe(true);
      expect(daily.todayPlan.tasks.length).toBe(0);
      // Tasks 2 & 3 from Day 1 must now be in overdueDays!
      expect(daily.overdueCount).toBe(2);
      expect(daily.overdueDays.length).toBe(1);
      expect(daily.overdueDays[0].date).toBe('2026-11-01');
      expect(daily.overdueDays[0].tasks.map((t) => t.id)).toEqual([
        'task_cs_d1_t2',
        'task_cs_d1_t3',
      ]);
      expect(mockReload).not.toHaveBeenCalled();

      // -----------------------------------------------------------------
      // Step 2: Multi-day gap jump: user is inactive on Day 3 & Day 4, opens on Day 5 (2026-11-05)
      // -----------------------------------------------------------------
      setSystemDateString('2026-11-05');
      checkDate();

      expect(getActiveTodayStr()).toBe('2026-11-05');
      daily = getDailyPlan(getAppState().plan, '2026-11-05');
      expect(daily.todayPlan.dayNumber).toBe(5);

      // Unfinished tasks:
      // Day 1: 2 tasks (task_cs_d1_t2, task_cs_d1_t3)
      // Day 2: 0 tasks (rest day)
      // Day 3: 3 tasks (task_cs_d3_t1, task_cs_d3_t2, task_cs_d3_t3)
      // Day 4: 3 tasks (task_cs_d4_t1, task_cs_d4_t2, task_cs_d4_t3)
      // Total overdueCount = 2 + 0 + 3 + 3 = 8 tasks
      expect(daily.overdueCount).toBe(8);
      expect(daily.overdueDays.length).toBe(3); // Day 4, Day 3, Day 1 (sorted newest to oldest)

      // -----------------------------------------------------------------
      // Step 3: Complete an overdue task from Day 1 while on Day 5
      // -----------------------------------------------------------------
      const currentPlan = getAppState();
      const day1Task2 = currentPlan.plan[0].tasks.find((t) => t.id === 'task_cs_d1_t2');
      expect(day1Task2).toBeDefined();
      expect(day1Task2.completed).toBe(false);

      day1Task2.completed = true;
      await saveAppState();

      // Verify that overdueCount immediately reflects the completion
      const updatedDaily = getDailyPlan(getAppState().plan, '2026-11-05');
      expect(updatedDaily.overdueCount).toBe(7);

      // Verify persistence in local storage
      const stored = JSON.parse(mockStorage.get('plusTwoMissionState_v2'));
      const storedDay1Task2 = stored.plan[0].tasks.find((t) => t.id === 'task_cs_d1_t2');
      expect(storedDay1Task2.completed).toBe(true);

      // Verify cloud persistence
      const cloudDoc = await mockDb.collection('users').doc(user.uid).get();
      const cloudDay1Task2 = cloudDoc.data().plan[0].tasks.find((t) => t.id === 'task_cs_d1_t2');
      expect(cloudDay1Task2.completed).toBe(true);
    });

    it('preserves a mid-journey study plan created on Day 5 across subsequent date rollovers and reloads without reverting to Day 1 plan', async () => {
      const user = { uid: 'user_midjourney_plan', email: 'mid@test.com' };
      setCurrentUser(user);

      // Start on Day 1 (2026-11-01) with CS plan
      setSystemDateString('2026-11-01');
      setActiveTodayStr('2026-11-01');

      const initialCsPlan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 10,
        ownerUid: user.uid,
        startDate: '2026-11-01',
        createdAt: '2026-11-01T08:00:00.000Z',
        lastModified: '2026-11-01T08:00:00.000Z',
      });
      setAppState(initialCsPlan);
      saveAppStateLocally();
      await syncAppStateToCloud(initialCsPlan);

      // Verify initial cloud state
      let cloudDoc = await mockDb.collection('users').doc(user.uid).get();
      expect(cloudDoc.data().stream).toBe('cs');

      // Date advances to Day 5 (2026-11-05)
      setSystemDateString('2026-11-05');
      checkDate();
      expect(getActiveTodayStr()).toBe('2026-11-05');

      // On Day 5, student reconfigures stream: generates a BRAND NEW Biology plan!
      const newBioPlan = buildTestStudyPlan({
        stream: 'bio',
        grade: '+2',
        daysCount: 8,
        tasksPerDay: 2,
        ownerUid: user.uid,
        startDate: '2026-11-05',
        deadlineDate: '2026-11-25',
        createdAt: '2026-11-05T12:00:00.000Z',
        lastModified: '2026-11-05T12:00:00.000Z',
      });
      setAppState(newBioPlan);
      await saveAppState();

      // Cloud must now have the Biology plan
      cloudDoc = await mockDb.collection('users').doc(user.uid).get();
      expect(cloudDoc.data().stream).toBe('bio');
      expect(cloudDoc.data().startDate).toBe('2026-11-05');

      // -----------------------------------------------------------------
      // Rollover to Day 6 (2026-11-06) + App Reload / Restart simulation
      // -----------------------------------------------------------------
      setSystemDateString('2026-11-06');
      checkDate();
      expect(getActiveTodayStr()).toBe('2026-11-06');

      // Simulate app restart / new session: performCloudSync
      await performCloudSync(user);

      // ADVERSARIAL INVARIANT: The active plan MUST remain the Biology plan!
      const activeState = getAppState();
      expect(activeState.stream).toBe('bio');
      expect(activeState.startDate).toBe('2026-11-05');
      expect(activeState.plan.length).toBe(8);

      // Local storage must still have the Biology plan
      const stored = JSON.parse(mockStorage.get('plusTwoMissionState_v2'));
      expect(stored.stream).toBe('bio');
    });
  });

  // =========================================================================
  // Challenge Area 2: Rapid Network Flapping & Offline-to-Online Transitions
  // Sequence: Online -> Offline -> Plan Edit -> Online -> Offline -> Guest Login -> Online
  // =========================================================================
  describe('Area 2: Adversarial Network Flapping: Online -> Offline -> Edit -> Online -> Offline -> Guest -> Online', () => {
    it('executes full flapping cycle without dropping offline edits, guest plans, or reverting to older state', async () => {
      const user = { uid: 'student_flapper_adversarial', email: 'flapper@kerala.edu' };

      // -----------------------------------------------------------------
      // Phase 1: Online initial state
      // -----------------------------------------------------------------
      mockDb.setUnavailable(false);
      setCurrentUser(user);
      setSystemDateString('2026-11-01');
      setActiveTodayStr('2026-11-01');

      const planA = buildTestStudyPlan({
        stream: 'commerce',
        grade: '+2',
        daysCount: 4,
        tasksPerDay: 3,
        completedTaskCount: 0,
        ownerUid: user.uid,
        createdAt: '2026-11-01T08:00:00.000Z',
        lastModified: '2026-11-01T08:00:00.000Z',
      });
      setAppState(planA);
      saveAppStateLocally();
      await syncAppStateToCloud(planA);

      let cloudData = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(cloudData.stream).toBe('commerce');
      expect(cloudData.plan[0].tasks[0].completed).toBe(false);

      // -----------------------------------------------------------------
      // Phase 2: Network Flaps to OFFLINE
      // -----------------------------------------------------------------
      mockDb.setUnavailable(true);

      // -----------------------------------------------------------------
      // Phase 3: Plan Edit while OFFLINE
      // Complete 2 tasks in Plan A
      // -----------------------------------------------------------------
      const offlineEditedPlan = JSON.parse(JSON.stringify(getAppState()));
      offlineEditedPlan.plan[0].tasks[0].completed = true;
      offlineEditedPlan.plan[0].tasks[1].completed = true;
      offlineEditedPlan.lastModified = '2026-11-01T10:00:00.000Z';
      setAppState(offlineEditedPlan);

      // Attempt save while offline
      await saveAppState();

      // Local storage must have the updated completed tasks
      const localOffline = JSON.parse(mockStorage.get('plusTwoMissionState_v2'));
      expect(localOffline.plan[0].tasks[0].completed).toBe(true);
      expect(localOffline.plan[0].tasks[1].completed).toBe(true);

      // Journal must hold the pending offline edits
      const pendingJournal = JSON.parse(mockStorage.get(`mpt_account_sync_v1_${user.uid}`));
      expect(pendingJournal.pending).not.toBeNull();
      expect(pendingJournal.pending.plan[0].tasks[0].completed).toBe(true);

      // -----------------------------------------------------------------
      // Phase 4: Network Flaps back to ONLINE
      // -----------------------------------------------------------------
      mockDb.setUnavailable(false);

      // Trigger sync upon reconnection
      const flushResult = await performCloudSync(user);
      expect(flushResult).toBe(true);

      // Cloud document must now reflect the completed tasks from offline edits!
      cloudData = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(cloudData.plan[0].tasks[0].completed).toBe(true);
      expect(cloudData.plan[0].tasks[1].completed).toBe(true);

      // Pending journal must be drained
      const drainedJournal = JSON.parse(mockStorage.get(`mpt_account_sync_v1_${user.uid}`));
      expect(drainedJournal.pending).toBeNull();
      expect(drainedJournal.base.plan[0].tasks[0].completed).toBe(true);

      // -----------------------------------------------------------------
      // Phase 5: Network Flaps to OFFLINE again
      // -----------------------------------------------------------------
      mockDb.setUnavailable(true);

      // -----------------------------------------------------------------
      // Phase 6: Guest Login / Sign Out while OFFLINE
      // User signs out to guest mode and creates a new guest plan
      // -----------------------------------------------------------------
      await mockAuth.signOut();
      setCurrentUser(null);

      // Guest creates Plan B (Humanities stream)
      const guestPlanB = buildTestStudyPlan({
        stream: 'humanities',
        grade: '+2',
        daysCount: 3,
        tasksPerDay: 2,
        completedTaskCount: 1, // 1 task completed in guest plan
        ownerUid: null,
        startDate: '2026-11-01',
        createdAt: '2026-11-01T14:00:00.000Z',
        lastModified: '2026-11-01T14:00:00.000Z',
      });
      setAppState(guestPlanB);
      saveAppStateLocally();
      queuePendingAccountState(global.localStorage, guestPlanB);

      // Guest storage checks
      const guestStored = JSON.parse(mockStorage.get('plusTwoMissionState_v2'));
      expect(guestStored.stream).toBe('humanities');
      const guestPendingRaw = mockStorage.get('mpt_account_sync_pending_guest');
      expect(guestPendingRaw).not.toBeNull();
      const guestPendingData = JSON.parse(guestPendingRaw);
      expect(guestPendingData.pending.stream).toBe('humanities');

      // -----------------------------------------------------------------
      // Phase 7: Network Flaps to ONLINE & User Signs Back In
      // -----------------------------------------------------------------
      mockDb.setUnavailable(false);

      // Student signs in with user account
      await mockAuth.signInWithUser(user);
      setCurrentUser(user);

      // Sync user account
      await performCloudSync(user);

      // VERIFICATION:
      // Since the guest created a newer plan (Humanities, 14:00:00Z) compared to the earlier
      // Commerce plan (10:00:00Z), the account reconciliation must adopt the newer plan!
      const finalState = getAppState();
      expect(finalState).not.toBeNull();
      expect(finalState.stream).toBe('humanities');
      expect(finalState.plan[0].tasks[0].completed).toBe(true);

      // Cloud document must now reflect the adopted Humanities plan
      cloudData = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(cloudData.stream).toBe('humanities');
      expect(cloudData.plan[0].tasks[0].completed).toBe(true);

      // Guest pending key must be cleaned up
      expect(mockStorage.get('mpt_account_sync_pending_guest')).toBeUndefined();
    });

    it('survives rapid oscillating network flapping (10 back-to-back online/offline transitions) with interleaved task ticks', async () => {
      const user = { uid: 'rapid_flapper', email: 'rapid@test.com' };
      setCurrentUser(user);
      mockDb.setUnavailable(false);

      const plan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 10,
        tasksPerDay: 2,
        completedTaskCount: 0,
        ownerUid: user.uid,
      });
      setAppState(plan);
      saveAppStateLocally();
      await syncAppStateToCloud(plan);

      // Perform 10 rapid flapping cycles
      let completedCount = 0;
      for (let cycle = 1; cycle <= 10; cycle++) {
        // Drop network
        mockDb.setUnavailable(true);

        // Modify local state while offline (tick next task)
        const dayIdx = Math.floor((cycle - 1) / 2);
        const taskIdx = (cycle - 1) % 2;
        const current = getAppState();
        current.plan[dayIdx].tasks[taskIdx].completed = true;
        completedCount++;
        current.lastModified = new Date(Date.now() + cycle * 1000).toISOString();
        setAppState(current);
        await saveAppState();

        // Restore network
        mockDb.setUnavailable(false);

        // Sync upon reconnect
        await performCloudSync(user);
      }

      // Verify final convergence
      const active = getAppState();
      const doneTasks = active.plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(doneTasks.length).toBe(10);

      // Verify Firestore convergence
      const cloudData = (await mockDb.collection('users').doc(user.uid).get()).data();
      const cloudDoneTasks = cloudData.plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(cloudDoneTasks.length).toBe(10);
    });
  });

  // =========================================================================
  // Challenge Area 3: State Reversion Invariants & Monotonic Progress
  // =========================================================================
  describe('Area 3: State Reversion Invariants (Never Revert Under Any Sequence)', () => {
    it('rejects stale cloud snapshots arriving from lagging listeners without overwriting newer local edits', async () => {
      const user = { uid: 'stale_snapshot_defense', email: 'stale@test.com' };
      setCurrentUser(user);

      // Current state: 4 tasks completed locally at 15:00
      const localPlan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        completedTaskCount: 4,
        ownerUid: user.uid,
        lastModified: '2026-11-01T15:00:00.000Z',
      });
      setAppState(localPlan);
      saveAppStateLocally();

      // Older base in journal (from 12:00)
      const basePlan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        completedTaskCount: 2,
        ownerUid: user.uid,
        lastModified: '2026-11-01T12:00:00.000Z',
      });
      mockStorage.set(
        `mpt_account_sync_v1_${user.uid}`,
        JSON.stringify({ base: basePlan, pending: null })
      );

      // Stale remote state in cloud (only 2 tasks completed, timestamp 12:00)
      const staleRemote = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        completedTaskCount: 2,
        ownerUid: user.uid,
        lastModified: '2026-11-01T12:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(staleRemote);

      // Sync triggered
      await performCloudSync(user);

      // INVARIANT: Completed tasks MUST NOT revert to 2! Local 4 completed tasks must win!
      const active = getAppState();
      const done = active.plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(done.length).toBe(4);

      // Cloud must be brought up to 4 completed tasks
      const cloudData = (await mockDb.collection('users').doc(user.uid).get()).data();
      const cloudDone = cloudData.plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(cloudDone.length).toBe(4);
    });

    it('maintains monotonic task progress across sequential 7-day rollover with interleaved rest days', () => {
      // 7-day plan, starting 2026-11-01
      const plan = buildTestStudyPlan({
        stream: 'bio',
        grade: '+2',
        daysCount: 7,
        tasksPerDay: 2,
        completedTaskCount: 0,
        startDate: '2026-11-01',
        restDayNumbers: [3, 6], // Day 3 and Day 6 are rest days
      });
      setAppState(plan);
      saveAppStateLocally();

      let cumulativeDone = 0;
      const history = [];

      for (let day = 1; day <= 7; day++) {
        const dateStr = `2026-11-0${day}`;
        setSystemDateString(dateStr);
        checkDate();

        const current = getAppState();
        const todayPlan = current.plan.find((d) => d.date === dateStr);

        // If not rest day, complete 1 task
        if (!todayPlan.isRestDay && todayPlan.tasks.length > 0) {
          todayPlan.tasks[0].completed = true;
          cumulativeDone++;
          saveAppStateLocally();
        }

        const totalCompleted = current.plan.flatMap((d) => d.tasks).filter((t) => t.completed).length;
        history.push(totalCompleted);

        // INVARIANT: Total completed tasks count must be monotonically non-decreasing
        expect(totalCompleted).toBe(cumulativeDone);
        if (history.length > 1) {
          expect(totalCompleted).toBeGreaterThanOrEqual(history[history.length - 2]);
        }
      }

      expect(cumulativeDone).toBe(5); // 7 days minus 2 rest days = 5 study days * 1 task = 5 tasks
    });

    it('survives clock jump backwards (time skew) without corrupting plan or wiping completions', () => {
      // User is on Day 5 (2026-11-05) with 6 tasks completed
      setSystemDateString('2026-11-05');
      setActiveTodayStr('2026-11-05');

      const plan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 8,
        tasksPerDay: 2,
        completedTaskCount: 6,
        startDate: '2026-11-01',
      });
      setAppState(plan);
      saveAppStateLocally();

      // Clock jumps BACKWARDS to Day 2 (2026-11-02) due to NTP error or timezone travel
      setSystemDateString('2026-11-02');
      checkDate();

      // INVARIANT: Date header updates, but completed tasks and plan are strictly intact
      expect(getActiveTodayStr()).toBe('2026-11-02');
      const current = getAppState();
      expect(current.stream).toBe('cs');
      const done = current.plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(done.length).toBe(6);
    });

    it('handles mid-journey offline plan creation on Day 5 after multi-day rollover (Day 1 -> Day 2 -> Day 5), reload while offline, Day 6 rollover, then online sync', async () => {
      const user = { uid: 'user_offline_midjourney', email: 'offmid@test.com' };
      setCurrentUser(user);

      // Day 1 (2026-11-01): Online, CS plan
      mockDb.setUnavailable(false);
      setSystemDateString('2026-11-01');
      setActiveTodayStr('2026-11-01');

      const initialPlan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 7,
        ownerUid: user.uid,
        startDate: '2026-11-01',
      });
      setAppState(initialPlan);
      saveAppStateLocally();
      await syncAppStateToCloud(initialPlan);

      // Rollover Day 1 -> Day 2 (Rest day)
      setSystemDateString('2026-11-02');
      checkDate();

      // Rollover Day 2 -> Day 5 (Gap jump)
      setSystemDateString('2026-11-05');
      checkDate();
      expect(getActiveTodayStr()).toBe('2026-11-05');

      // Network goes OFFLINE on Day 5
      mockDb.setUnavailable(true);

      // On Day 5 while OFFLINE, user creates a new Commerce plan!
      const newCommercePlan = buildTestStudyPlan({
        stream: 'commerce',
        grade: '+2',
        daysCount: 6,
        ownerUid: user.uid,
        startDate: '2026-11-05',
        createdAt: '2026-11-05T14:00:00.000Z',
        lastModified: '2026-11-05T14:00:00.000Z',
      });
      setAppState(newCommercePlan);
      // Save while offline: will fail network sync, but persist in localStorage and pending journal
      await saveAppState();

      // Simulate app restart / page reload while STILL offline:
      // In a real reload, appState initializes from localStorage
      const recoveredState = JSON.parse(mockStorage.get('plusTwoMissionState_v2'));
      expect(recoveredState.stream).toBe('commerce');
      setAppState(recoveredState);

      // Midnight strikes while STILL offline: rollover to Day 6 (2026-11-06)
      setSystemDateString('2026-11-06');
      checkDate();
      expect(getActiveTodayStr()).toBe('2026-11-06');
      expect(getAppState().stream).toBe('commerce');

      // Network returns ONLINE on Day 6
      mockDb.setUnavailable(false);

      // Cloud sync triggered
      await performCloudSync(user);

      // VERIFICATION:
      // 1. Local state must still be Commerce
      expect(getAppState().stream).toBe('commerce');
      expect(getAppState().startDate).toBe('2026-11-05');

      // 2. Cloud Firestore must now be updated with Commerce plan (not old CS plan)
      const cloudData = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(cloudData.stream).toBe('commerce');
      expect(cloudData.startDate).toBe('2026-11-05');
    });

    it('handles guest sign-out without creating a new plan: cleanly restores user cloud plan upon re-login', async () => {
      const user = { uid: 'user_guest_relogin', email: 'relogin@test.com' };

      // User has existing CS plan in cloud
      const cloudPlan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 5,
        completedTaskCount: 3,
        ownerUid: user.uid,
      });
      await mockDb.collection('users').doc(user.uid).set(cloudPlan);

      // User signs out to guest mode
      await mockAuth.signOut();
      setCurrentUser(null);
      setAppState(null);
      mockStorage.delete('plusTwoMissionState_v2');

      // Guest does NOT create a plan (appState remains null)
      expect(getAppState()).toBeNull();

      // User signs back in with Google
      await mockAuth.signInWithUser(user);
      setCurrentUser(user);
      await performCloudSync(user);

      // VERIFICATION: Cloud plan is cleanly restored
      const restored = getAppState();
      expect(restored).not.toBeNull();
      expect(restored.stream).toBe('cs');
      const done = restored.plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(done.length).toBe(3);
    });

    it('reconciles concurrent task completions from two independent sessions without reverting either session', () => {
      const basePlan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 3,
        tasksPerDay: 2,
        completedTaskCount: 0,
        ownerUid: 'dual_session_user',
      });

      // Session A (e.g. Phone) completes Task 1 of Day 1
      const sessionAPlan = JSON.parse(JSON.stringify(basePlan));
      sessionAPlan.plan[0].tasks[0].completed = true;

      // Session B (e.g. Laptop) completes Task 2 of Day 1
      const sessionBPlan = JSON.parse(JSON.stringify(basePlan));
      sessionBPlan.plan[0].tasks[1].completed = true;

      // Reconcile: Session A's changes merged against Session B on cloud
      const merged = reconcileStudyPlan(basePlan, sessionAPlan, sessionBPlan);

      // Both Task 1 and Task 2 must be marked completed in the merged result!
      expect(merged.plan[0].tasks[0].completed).toBe(true);
      expect(merged.plan[0].tasks[1].completed).toBe(true);

      // Tasks of Day 2 & Day 3 must remain untouched
      expect(merged.plan[1].tasks[0].completed).toBe(false);
      expect(merged.plan[2].tasks[0].completed).toBe(false);
    });
  });
});

