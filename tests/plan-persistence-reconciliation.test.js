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

describe('Plan Persistence, Date Rollover & Cloud Reconciliation Harness', () => {
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

  // Helper to build realistic study plans for testing
  function buildTestStudyPlan({
    stream = 'cs',
    grade = '+2',
    daysCount = 3,
    tasksPerDay = 3,
    completedTaskCount = 0,
    ownerUid = null,
    userEmail = null,
    clientSessionId = 'test_sess',
    startDate = '2026-11-01',
    deadlineDate = '2026-11-20',
    createdAt = '2026-11-01T00:00:00.000Z',
    lastModified = '2026-11-01T00:00:00.000Z',
    lastSynced = '2026-11-01T00:00:00.000Z',
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
      const dayTasks = [];
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
      const dayDate = new Date(startDate);
      dayDate.setDate(dayDate.getDate() + (d - 1));
      const dateStr = dayDate.toISOString().split('T')[0];
      plan.push({
        dayNumber: d,
        date: dateStr,
        dayOfWeek: dayDate.getDay(),
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

    // Pre-seed common UI elements for DOM rendering
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

    // Instantiate mock Firebase
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
  // Suite 1: Failure Scenario Reproduction & Regression Defense
  // =========================================================================
  describe('Suite 1: Failure Scenario Reproduction & Regression Defense', () => {
    it('persists a newly created study plan across date rollover and next-day reload/sync when an older plan exists in Firestore', async () => {
      const user = { uid: 'student_rollover_repro', email: 'rollover@kerala.edu' };

      // 1. Seed Firestore with an older plan (Bio Science, created 2026-10-31)
      const oldBioPlan = buildTestStudyPlan({
        stream: 'bio',
        grade: '+2',
        daysCount: 3,
        completedTaskCount: 2,
        ownerUid: user.uid,
        lastModified: '2026-10-31T10:00:00.000Z',
        createdAt: '2026-10-31T10:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(oldBioPlan);

      // 2. Pre-seed journal.base in localStorage from prior session (yesterday's session)
      mockStorage.set(
        `mpt_account_sync_v1_${user.uid}`,
        JSON.stringify({ base: oldBioPlan, pending: null })
      );

      // 3. User creates a NEW study plan today (Computer Science, created 2026-11-01)
      const newCsPlan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 4,
        completedTaskCount: 0,
        ownerUid: user.uid,
        lastModified: '2026-11-01T09:00:00.000Z',
        createdAt: '2026-11-01T09:00:00.000Z',
      });
      setAppState(newCsPlan);
      saveAppStateLocally();

      // 4. Date rolls over to next day (2026-11-02), user opens/reloads the app
      setActiveTodayStr('2026-11-02');
      setCurrentUser(user);

      // In the unpatched architecture, this call to performCloudSync reverted newCsPlan to oldBioPlan!
      await performCloudSync(user);

      // VERIFICATION: Active plan MUST be the newly created Computer Science plan!
      const current = getAppState();
      expect(current).not.toBeNull();
      expect(current.stream).toBe('cs');
      expect(current.lastModified).toBe('2026-11-01T09:00:00.000Z');

      // Local storage must also retain the CS plan
      const stored = JSON.parse(mockStorage.get('plusTwoMissionState_v2'));
      expect(stored.stream).toBe('cs');

      // Cloud document must now be updated to the CS plan
      const cloudDoc = await mockDb.collection('users').doc(user.uid).get({ source: 'server' });
      expect(cloudDoc.exists).toBe(true);
      expect(cloudDoc.data().stream).toBe('cs');
    });

    it('retains new local plan when device journal.base exists from a prior session', async () => {
      const user = { uid: 'student_existing_journal', email: 'journal@kerala.edu' };

      const oldPlan = buildTestStudyPlan({
        stream: 'commerce',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: '2026-10-25T12:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(oldPlan);

      // Disk already has journal.base from last week
      mockStorage.set(
        `mpt_account_sync_v1_${user.uid}`,
        JSON.stringify({ base: oldPlan, pending: null })
      );

      // Local state is a new Biology plan
      const newBioPlan = buildTestStudyPlan({
        stream: 'bio',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: '2026-11-01T15:00:00.000Z',
      });
      setAppState(newBioPlan);
      saveAppStateLocally();

      setCurrentUser(user);
      await performCloudSync(user);

      expect(getAppState().stream).toBe('bio');
      const cloudData = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(cloudData.stream).toBe('bio');
    });

    it('advances study day across midnight rollover (checkDate) without corruption or reload', () => {
      const plan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 3,
        completedTaskCount: 2,
        startDate: '2026-11-01',
      });
      setAppState(plan);
      saveAppStateLocally();
      setActiveTodayStr('2026-11-01');

      // Midnight strikes: date changes to 2026-11-02
      // Mock global Date to return 2026-11-02
      const fakeTime = new Date('2026-11-02T00:00:05.000Z').getTime();
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

      // Invoke checkDate() as scheduled by midnight timer
      checkDate();

      expect(getActiveTodayStr()).toBe('2026-11-02');
      expect(getAppState().stream).toBe('cs');
      expect(mockReload).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Suite 2: Timestamp-Based Conflict Reconciliation Engine
  // =========================================================================
  describe('Suite 2: Timestamp-Based Conflict Reconciliation Engine', () => {
    it('resolves conflicts by timestamp: newer local plan overrides older remote record', async () => {
      const user = { uid: 'student_ts_local_wins', email: 'tslocal@kerala.edu' };
      const staleRemote = buildTestStudyPlan({
        stream: 'commerce',
        grade: '+2',
        lastModified: '2026-10-20T10:00:00.000Z',
        createdAt: '2026-10-20T10:00:00.000Z',
        ownerUid: user.uid,
      });
      await mockDb.collection('users').doc(user.uid).set(staleRemote);

      const newerLocal = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        lastModified: '2026-11-03T18:00:00.000Z',
        createdAt: '2026-11-03T18:00:00.000Z',
        ownerUid: user.uid,
      });
      setAppState(newerLocal);
      saveAppStateLocally();

      setCurrentUser(user);
      await performCloudSync(user);

      expect(getAppState().stream).toBe('cs');
      const cloudDoc = await mockDb.collection('users').doc(user.uid).get();
      expect(cloudDoc.data().stream).toBe('cs');
    });

    it('falls back to updatedAt, lastSynced, or createdAt when lastModified is missing on legacy records', async () => {
      const user = { uid: 'student_legacy_timestamps', email: 'legacy@kerala.edu' };
      const legacyRemoteWithoutLastModified = buildTestStudyPlan({
        stream: 'commerce',
        grade: '+2',
        ownerUid: user.uid,
      });
      delete legacyRemoteWithoutLastModified.lastModified;
      legacyRemoteWithoutLastModified.createdAt = '2026-10-15T08:00:00.000Z';
      legacyRemoteWithoutLastModified.lastSynced = '2026-10-15T08:00:00.000Z';
      await mockDb.collection('users').doc(user.uid).set(legacyRemoteWithoutLastModified);

      const newerLocal = buildTestStudyPlan({
        stream: 'bio',
        grade: '+2',
        lastModified: '2026-11-04T12:00:00.000Z',
        ownerUid: user.uid,
      });
      setAppState(newerLocal);
      saveAppStateLocally();

      setCurrentUser(user);
      await performCloudSync(user);

      expect(getAppState().stream).toBe('bio');
      const cloudDoc = await mockDb.collection('users').doc(user.uid).get();
      expect(cloudDoc.data().stream).toBe('bio');
    });

    it('adopts remote plan when cloud record has newer timestamp and user confirms cloud plan', async () => {
      const user = { uid: 'student_remote_wins', email: 'remotewins@kerala.edu' };
      // Another device (e.g. tablet) updated plan to Humanities on 2026-11-04T16:00:00Z
      const newerRemote = buildTestStudyPlan({
        stream: 'humanities',
        grade: '+2',
        lastModified: '2026-11-04T16:00:00.000Z',
        ownerUid: user.uid,
      });
      await mockDb.collection('users').doc(user.uid).set(newerRemote);

      // This device has older local plan from 2026-11-02
      const olderLocal = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        lastModified: '2026-11-02T10:00:00.000Z',
        ownerUid: user.uid,
      });
      setAppState(olderLocal);
      saveAppStateLocally();

      // Seed journal.base to match olderLocal
      mockStorage.set(
        `mpt_account_sync_v1_${user.uid}`,
        JSON.stringify({ base: olderLocal, pending: null })
      );

      confirmDialogResponse = false; // User cancels "Use Device Plan", choosing cloud plan
      setCurrentUser(user);
      await performCloudSync(user);

      // Cloud humanities plan should be loaded
      expect(getAppState().stream).toBe('humanities');
    });

    it('merges task completions for same study plan across multiple devices without losing progress', async () => {
      const user = { uid: 'student_concurrent_ticks', email: 'ticks@kerala.edu' };

      // Base plan where task 1 is done
      const basePlan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 1,
        tasksPerDay: 3,
        completedTaskCount: 1, // task 1 completed
        ownerUid: user.uid,
        lastModified: '2026-11-01T10:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(basePlan);
      mockStorage.set(
        `mpt_account_sync_v1_${user.uid}`,
        JSON.stringify({ base: basePlan, pending: null })
      );

      // Remote gets task 2 completed from phone
      const remoteFromPhone = JSON.parse(JSON.stringify(basePlan));
      remoteFromPhone.plan[0].tasks[1].completed = true;
      remoteFromPhone.lastModified = '2026-11-01T11:00:00.000Z';
      await mockDb.collection('users').doc(user.uid).set(remoteFromPhone);

      // Local PC gets task 3 completed
      const localFromPC = JSON.parse(JSON.stringify(basePlan));
      localFromPC.plan[0].tasks[2].completed = true;
      localFromPC.lastModified = '2026-11-01T11:30:00.000Z';
      setAppState(localFromPC);
      saveAppStateLocally();

      setCurrentUser(user);
      await performCloudSync(user);

      // All 3 tasks must now be completed in both local state and Firestore!
      const finalLocal = getAppState();
      const localTasks = finalLocal.plan[0].tasks;
      expect(localTasks[0].completed).toBe(true);
      expect(localTasks[1].completed).toBe(true);
      expect(localTasks[2].completed).toBe(true);

      const finalRemote = (await mockDb.collection('users').doc(user.uid).get()).data();
      const remoteTasks = finalRemote.plan[0].tasks;
      expect(remoteTasks[0].completed).toBe(true);
      expect(remoteTasks[1].completed).toBe(true);
      expect(remoteTasks[2].completed).toBe(true);
    });

    it('preserves intentional task unchecking (untick) on newer local plan without resurrecting completed state', async () => {
      const user = { uid: 'student_untick_test', email: 'untick@kerala.edu' };

      // Base plan where tasks 1 & 2 are done
      const basePlan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 1,
        tasksPerDay: 2,
        completedTaskCount: 2,
        ownerUid: user.uid,
        lastModified: '2026-11-01T10:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(basePlan);
      mockStorage.set(
        `mpt_account_sync_v1_${user.uid}`,
        JSON.stringify({ base: basePlan, pending: null })
      );

      // User unchecks task 1 locally (intentional untick)
      const localUnticked = JSON.parse(JSON.stringify(basePlan));
      localUnticked.plan[0].tasks[0].completed = false; // untick task 1
      localUnticked.lastModified = '2026-11-01T12:00:00.000Z';
      setAppState(localUnticked);
      saveAppStateLocally();

      setCurrentUser(user);
      await performCloudSync(user);

      const finalLocal = getAppState();
      expect(finalLocal.plan[0].tasks[0].completed).toBe(false);
      expect(finalLocal.plan[0].tasks[1].completed).toBe(true);

      const finalRemote = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(finalRemote.plan[0].tasks[0].completed).toBe(false);
      expect(finalRemote.plan[0].tasks[1].completed).toBe(true);
    });
  });

  // =========================================================================
  // Suite 3: Guest / Pre-Auth Plan Creation & Subsequent Sign-In Adoption
  // =========================================================================
  describe('Suite 3: Guest / Pre-Auth Plan Creation & Subsequent Sign-In Adoption', () => {
    it('queues guest plan in storage when saved before authentication', async () => {
      setCurrentUser(null);

      const guestPlan = buildTestStudyPlan({
        stream: 'humanities',
        grade: '+2',
        ownerUid: null,
        lastModified: '2026-11-04T10:00:00.000Z',
      });
      setAppState(guestPlan);

      // Save app state while guest
      await saveAppState();

      // Verify stored in guest queue key
      const guestRaw = mockStorage.get('mpt_account_sync_pending_guest');
      expect(guestRaw).not.toBeNull();
      const guestParsed = JSON.parse(guestRaw);
      const pendingPlan = guestParsed.pending || guestParsed;
      expect(pendingPlan.stream).toBe('humanities');
    });

    it('adopts guest plan upon sign-in, binds ownerUid, uploads to Firestore, and cleans guest key', async () => {
      const user = { uid: 'student_guest_adoption', email: 'guestadopt@kerala.edu' };
      setCurrentUser(null);

      // 1. Guest creates plan and saves it
      const guestPlan = buildTestStudyPlan({
        stream: 'commerce',
        grade: '+2',
        ownerUid: null,
        lastModified: '2026-11-04T11:00:00.000Z',
      });
      setAppState(guestPlan);
      await saveAppState();

      expect(mockStorage.get('mpt_account_sync_pending_guest')).not.toBeNull();

      // 2. User subsequently logs in
      setCurrentUser(user);
      await performCloudSync(user);

      // 3. Active plan is Commerce and now stamped with user.uid
      const current = getAppState();
      expect(current.stream).toBe('commerce');
      expect(current.ownerUid).toBe(user.uid);

      // 4. Firestore document has Commerce plan
      const cloudDoc = await mockDb.collection('users').doc(user.uid).get();
      expect(cloudDoc.exists).toBe(true);
      expect(cloudDoc.data().stream).toBe('commerce');
      expect(cloudDoc.data().ownerUid).toBe(user.uid);

      // 5. Guest key was cleaned up
      expect(mockStorage.get('mpt_account_sync_pending_guest')).toBeUndefined();
    });

    it('prefers newly created guest plan over an older cloud record upon sign-in', async () => {
      const user = { uid: 'student_guest_vs_old_cloud', email: 'guestvscloud@kerala.edu' };

      // Old plan in cloud from 2026-10-10 (Computer Science)
      const oldCloudPlan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        lastModified: '2026-10-10T10:00:00.000Z',
        createdAt: '2026-10-10T10:00:00.000Z',
        ownerUid: user.uid,
      });
      await mockDb.collection('users').doc(user.uid).set(oldCloudPlan);

      // Student starts as guest today and builds a Biology plan
      setCurrentUser(null);
      const guestBioPlan = buildTestStudyPlan({
        stream: 'bio',
        grade: '+2',
        lastModified: '2026-11-04T14:00:00.000Z',
        createdAt: '2026-11-04T14:00:00.000Z',
        ownerUid: null,
      });
      setAppState(guestBioPlan);
      await saveAppState();

      // User signs in with their Google account
      setCurrentUser(user);
      await performCloudSync(user);

      // Active plan must be the newly created Bio plan, not the old CS plan!
      expect(getAppState().stream).toBe('bio');
      const cloudDoc = await mockDb.collection('users').doc(user.uid).get();
      expect(cloudDoc.data().stream).toBe('bio');
    });

    it('preserves task completions made as a guest through sign-in transition', async () => {
      const user = { uid: 'student_guest_tasks', email: 'guesttasks@kerala.edu' };
      setCurrentUser(null);

      const guestPlan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 2,
        tasksPerDay: 2,
        completedTaskCount: 3, // 3 tasks done as guest
        ownerUid: null,
        lastModified: '2026-11-04T15:00:00.000Z',
      });
      setAppState(guestPlan);
      await saveAppState();

      setCurrentUser(user);
      await performCloudSync(user);

      const current = getAppState();
      const allTasks = current.plan.flatMap((d) => d.tasks);
      const completedCount = allTasks.filter((t) => t.completed).length;
      expect(completedCount).toBe(3);

      const cloudDoc = (await mockDb.collection('users').doc(user.uid).get()).data();
      const cloudCompleted = cloudDoc.plan.flatMap((d) => d.tasks).filter((t) => t.completed).length;
      expect(cloudCompleted).toBe(3);
    });
  });

  // =========================================================================
  // Suite 4: Offline-to-Online Resilience & Network Disruption
  // =========================================================================
  describe('Suite 4: Offline-to-Online Resilience & Network Disruption', () => {
    it('holds edits in local pending journal while offline and flushes upon reconnection', async () => {
      const user = { uid: 'student_offline_flow', email: 'offline@kerala.edu' };

      // Seed initial synced plan
      const initialPlan = buildTestStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 2,
        tasksPerDay: 2,
        completedTaskCount: 1,
        ownerUid: user.uid,
        lastModified: '2026-11-04T08:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(initialPlan);

      setCurrentUser(user);
      await performCloudSync(user);

      // Device goes OFFLINE
      mockDb.setUnavailable(true);

      // Student finishes tasks 2 and 3 while on the bus/offline
      const offlineModified = JSON.parse(JSON.stringify(getAppState()));
      offlineModified.plan[0].tasks[1].completed = true; // task 2 done
      offlineModified.plan[1].tasks[0].completed = true; // task 3 done
      offlineModified.lastModified = '2026-11-04T09:30:00.000Z';
      setAppState(offlineModified);
      await saveAppState(); // Attempt sync while offline

      // Storage has pending edits
      const journal = JSON.parse(mockStorage.get(`mpt_account_sync_v1_${user.uid}`));
      expect(journal.pending).not.toBeNull();

      // Cloud still has old data because device is offline
      mockDb.setUnavailable(false); // Temporarily check backend data
      const beforeReconnect = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(beforeReconnect.plan[0].tasks[1].completed).toBe(false);

      // Reconnect online event triggers performCloudSync
      await performCloudSync(user);

      // Verified: cloud now has tasks 2 and 3 completed!
      const afterReconnect = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(afterReconnect.plan[0].tasks[1].completed).toBe(true);
      expect(afterReconnect.plan[1].tasks[0].completed).toBe(true);

      // Local state is intact
      const local = getAppState();
      expect(local.plan[0].tasks[1].completed).toBe(true);
      expect(local.plan[1].tasks[0].completed).toBe(true);
    });

    it('preserves offline plan edits across page reload before reconnection', async () => {
      const user = { uid: 'student_offline_reload', email: 'offlinereload@kerala.edu' };
      const basePlan = buildTestStudyPlan({
        stream: 'bio',
        grade: '+2',
        completedTaskCount: 0,
        ownerUid: user.uid,
      });
      await mockDb.collection('users').doc(user.uid).set(basePlan);

      setCurrentUser(user);
      await performCloudSync(user);

      // Offline mode
      mockDb.setUnavailable(true);

      // Student edits plan offline
      const modifiedPlan = JSON.parse(JSON.stringify(basePlan));
      modifiedPlan.plan[0].tasks[0].completed = true;
      modifiedPlan.lastModified = '2026-11-04T13:00:00.000Z';
      setAppState(modifiedPlan);
      await saveAppState();

      // Simulate full page reload while still offline:
      // appState is re-loaded from localStorage
      const reloadedPlan = JSON.parse(mockStorage.get('plusTwoMissionState_v2'));
      setAppState(reloadedPlan);

      // performCloudSync runs upon startup, catches offline error gracefully
      await performCloudSync(user);

      // Active state must NOT revert to uncompleted task
      expect(getAppState().plan[0].tasks[0].completed).toBe(true);

      // Now come online
      mockDb.setUnavailable(false);
      await performCloudSync(user);

      // Cloud is synced
      const cloud = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(cloud.plan[0].tasks[0].completed).toBe(true);
    });

    it('handles intermittent connection timeouts during cloud sync without state corruption', async () => {
      const user = { uid: 'student_intermittent_net', email: 'net@kerala.edu' };
      const currentPlan = buildTestStudyPlan({
        stream: 'commerce',
        grade: '+2',
        completedTaskCount: 1,
        ownerUid: user.uid,
      });
      await mockDb.collection('users').doc(user.uid).set(currentPlan);

      setCurrentUser(user);
      await performCloudSync(user);

      // Network blip during next edit
      mockDb.setUnavailable(true);

      const nextEdit = JSON.parse(JSON.stringify(currentPlan));
      nextEdit.plan[0].tasks[1].completed = true;
      nextEdit.lastModified = '2026-11-04T17:00:00.000Z';
      setAppState(nextEdit);

      const syncResult = await syncAppStateToCloud(nextEdit);
      // Result is false due to offline
      expect(syncResult).toBe(false);

      // Local storage still safe
      expect(getAppState().plan[0].tasks[1].completed).toBe(true);

      // Network recovers
      mockDb.setUnavailable(false);
      const recoveredSync = await performCloudSync(user);
      expect(recoveredSync).toBe(true);

      const serverData = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(serverData.plan[0].tasks[1].completed).toBe(true);
    });
  });
});
