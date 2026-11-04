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

// In-Memory Mock Firestore Document with transaction and listener support
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

// Helper to construct realistic test study plans
function buildTestPlan({
  stream = 'cs',
  grade = '+2',
  daysCount = 2,
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
  hours = 3,
  targetTerm = 1,
  restDay = 'Sunday',
  pacePreference = 'balanced',
  dailyCapacityMinutes = 180,
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
    hours,
    targetTerm,
    restDay,
    pacePreference,
    dailyCapacityMinutes,
    plan,
  };
}

describe('Adversarial Verification Suite: Plan Persistence, Timestamp Stress & Cloud Reconciliation', () => {
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
    confirmDialogArgsHistory.length = 0;
    appAlertArgsHistory.length = 0;
    appToastArgsHistory.length = 0;

    // Seed mock DOM
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
        classList: { contains: vi.fn(() => false) },
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
    setCurrentUser(null);
    setAppState(null);
  });

  afterEach(() => {
    global.Date = originalDate;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Challenge 1: Timestamp Edge Cases & parseTimestamp Adversarial Vectors
  // =========================================================================
  describe('Challenge 1: Timestamp Edge Cases & parseTimestamp Robustness', () => {
    // Mirror of internal parseTimestamp logic for isolated unit stress testing
    const parseTimestamp = (value) => {
      if (!value) return 0;
      const parsed = typeof value === 'number' ? value : Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    it('1.1 parses valid ISO timestamps, numeric epochs, and date strings accurately', () => {
      const iso = '2026-11-04T12:00:00.000Z';
      const expected = Date.parse(iso);
      expect(parseTimestamp(iso)).toBe(expected);
      expect(parseTimestamp(expected)).toBe(expected);
      expect(parseTimestamp('2026-11-04')).toBe(Date.parse('2026-11-04'));
    });

    it('1.2 returns 0 gracefully for missing, empty, or whitespace values without throwing', () => {
      expect(parseTimestamp(null)).toBe(0);
      expect(parseTimestamp(undefined)).toBe(0);
      expect(parseTimestamp('')).toBe(0);
      expect(parseTimestamp('   ')).toBe(0);
    });

    it('1.3 returns 0 for corrupt, malformed, or nonsensical string inputs', () => {
      expect(parseTimestamp('INVALID_DATE_STRING')).toBe(0);
      expect(parseTimestamp('2026-99-99T99:99:99.999Z')).toBe(0);
      expect(parseTimestamp('NaN')).toBe(0);
      expect(parseTimestamp('[object Object]')).toBe(0);
      expect(parseTimestamp('undefined')).toBe(0);
      expect(parseTimestamp('null')).toBe(0);
      expect(parseTimestamp('{ "date": 12345 }')).toBe(0);
    });

    it('1.4 returns 0 for non-date non-string non-finite values (objects, arrays, booleans, Infinity)', () => {
      expect(parseTimestamp({})).toBe(0);
      expect(parseTimestamp([])).toBe(0);
      expect(parseTimestamp(true)).toBe(0);
      expect(parseTimestamp(false)).toBe(0);
      expect(parseTimestamp(NaN)).toBe(0);
      expect(parseTimestamp(Infinity)).toBe(0);
      expect(parseTimestamp(-Infinity)).toBe(0);
    });

    it('1.5 handles zero and negative numbers without NaN or throwing', () => {
      expect(parseTimestamp(0)).toBe(0);
      expect(parseTimestamp(-1)).toBe(-1);
      expect(parseTimestamp(-1000000)).toBe(-1000000);
      // In createAccountSync, localTime > 0 correctly rejects non-positive timestamps
      expect(parseTimestamp(0) > 0).toBe(false);
      expect(parseTimestamp(-1) > 0).toBe(false);
    });
  });

  // =========================================================================
  // Challenge 2: createAccountSync.refresh() Under Adversarial Timestamps
  // =========================================================================
  describe('Challenge 2: createAccountSync.refresh() Timestamp Edge Cases', () => {
    it('2.1 handles EXACT TIMESTAMP COLLISION when study plans match (merging concurrent ticks)', async () => {
      const user = { uid: 'adv_ts_collision_same', email: 'collision@kerala.edu' };
      const collisionTs = '2026-11-04T12:00:00.000Z';

      const basePlan = buildTestPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 1,
        tasksPerDay: 3,
        completedTaskCount: 1, // task 1 done in base
        ownerUid: user.uid,
        lastModified: '2026-11-04T10:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(basePlan);
      mockStorage.set(
        `mpt_account_sync_v1_${user.uid}`,
        JSON.stringify({ base: basePlan, pending: null })
      );

      // Remote has task 2 checked at collisionTs
      const remotePlan = JSON.parse(JSON.stringify(basePlan));
      remotePlan.plan[0].tasks[1].completed = true;
      remotePlan.lastModified = collisionTs;
      await mockDb.collection('users').doc(user.uid).set(remotePlan);

      // Local has task 3 checked at the exact same collisionTs
      const localPlan = JSON.parse(JSON.stringify(basePlan));
      localPlan.plan[0].tasks[2].completed = true;
      localPlan.lastModified = collisionTs;
      setAppState(localPlan);
      saveAppStateLocally();

      setCurrentUser(user);
      const syncResult = await performCloudSync(user);
      expect(syncResult).toBe(true);

      // Both task 2 (from remote) and task 3 (from local) must be merged and completed!
      const finalLocal = getAppState();
      expect(finalLocal.plan[0].tasks[0].completed).toBe(true);
      expect(finalLocal.plan[0].tasks[1].completed).toBe(true);
      expect(finalLocal.plan[0].tasks[2].completed).toBe(true);

      const finalRemote = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(finalRemote.plan[0].tasks[0].completed).toBe(true);
      expect(finalRemote.plan[0].tasks[1].completed).toBe(true);
      expect(finalRemote.plan[0].tasks[2].completed).toBe(true);
    });

    it('2.2 handles EXACT TIMESTAMP COLLISION with conflicting plans via chooseLocal prompt', async () => {
      const user = { uid: 'adv_ts_collision_diff', email: 'collision_diff@kerala.edu' };
      const collisionTs = '2026-11-04T12:00:00.000Z';

      // Remote has Commerce
      const remotePlan = buildTestPlan({
        stream: 'commerce',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: collisionTs,
      });
      await mockDb.collection('users').doc(user.uid).set(remotePlan);

      // Local has CS created at exact same timestamp
      const localPlan = buildTestPlan({
        stream: 'cs',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: collisionTs,
      });
      setAppState(localPlan);
      saveAppStateLocally();

      // Case A: User confirms "Use Device Plan"
      confirmDialogResponse = true;
      setCurrentUser(user);
      await performCloudSync(user);

      expect(getAppState().stream).toBe('cs');
      const cloudDocA = await mockDb.collection('users').doc(user.uid).get();
      expect(cloudDocA.data().stream).toBe('cs');

      // Case B: If user rejects device plan on collision, loads cloud plan
      confirmDialogResponse = false;
      const remotePlanB = buildTestPlan({
        stream: 'humanities',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: collisionTs,
      });
      await mockDb.collection('users').doc(user.uid).set(remotePlanB);

      const sync = createAccountSync({
        db: mockDb,
        user,
        storage: global.localStorage,
        sessionId: 'adv_collision_b',
        getLocal: () => localPlan,
        apply: (state) => setAppState(state),
        status: vi.fn(),
        chooseLocal: async () => false, // choose remote
      });
      await sync.refresh();

      expect(getAppState().stream).toBe('humanities');
    });

    it('2.3 handles INVERTED TIMESTAMPS gracefully (remote timestamp is newer, local has offline ticks)', async () => {
      const user = { uid: 'adv_ts_inverted', email: 'inverted@kerala.edu' };

      const basePlan = buildTestPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 1,
        tasksPerDay: 3,
        completedTaskCount: 0,
        ownerUid: user.uid,
        lastModified: '2026-11-04T08:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(basePlan);
      mockStorage.set(
        `mpt_account_sync_v1_${user.uid}`,
        JSON.stringify({ base: basePlan, pending: null })
      );

      // Remote was modified at 14:00 (newer timestamp) with task 1 checked
      const remotePlan = JSON.parse(JSON.stringify(basePlan));
      remotePlan.plan[0].tasks[0].completed = true;
      remotePlan.lastModified = '2026-11-04T14:00:00.000Z';
      await mockDb.collection('users').doc(user.uid).set(remotePlan);

      // Local was modified at 10:00 (older timestamp than remote) with task 2 checked
      const localPlan = JSON.parse(JSON.stringify(basePlan));
      localPlan.plan[0].tasks[1].completed = true;
      localPlan.lastModified = '2026-11-04T10:00:00.000Z';
      setAppState(localPlan);
      saveAppStateLocally();

      setCurrentUser(user);
      await performCloudSync(user);

      // Because sameStudyPlan is true and local was modified after base (10:00 > 08:00),
      // local tick on task 2 is reconciled with remote tick on task 1!
      const finalLocal = getAppState();
      expect(finalLocal.plan[0].tasks[0].completed).toBe(true);
      expect(finalLocal.plan[0].tasks[1].completed).toBe(true);
      expect(finalLocal.plan[0].tasks[2].completed).toBe(false);
    });

    it('2.4 handles CORRUPT or INVALID timestamps in local and remote without throwing', async () => {
      const user = { uid: 'adv_ts_corrupt', email: 'corrupt@kerala.edu' };

      const corruptRemote = buildTestPlan({
        stream: 'commerce',
        grade: '+2',
        ownerUid: user.uid,
      });
      corruptRemote.lastModified = 'INVALID_ISO_9999_GARBAGE';
      corruptRemote.createdAt = 'CORRUPT_CREATED_AT';
      delete corruptRemote.lastSynced;
      await mockDb.collection('users').doc(user.uid).set(corruptRemote);

      const corruptLocal = buildTestPlan({
        stream: 'bio',
        grade: '+2',
        ownerUid: user.uid,
      });
      corruptLocal.lastModified = 'ANOTHER_CORRUPT_STRING';
      corruptLocal.createdAt = 'NOT_A_DATE';
      delete corruptLocal.lastSynced;
      setAppState(corruptLocal);
      saveAppStateLocally();

      setCurrentUser(user);
      confirmDialogResponse = true;

      // refresh() must not throw TypeError or unhandled exception
      await expect(performCloudSync(user)).resolves.not.toThrow();
      expect(getAppState()).not.toBeNull();
    });

    it('2.5 handles ZERO and NEGATIVE epoch timestamps safely without reverting', async () => {
      const user = { uid: 'adv_ts_zero_negative', email: 'zero@kerala.edu' };

      const zeroRemote = buildTestPlan({
        stream: 'humanities',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: 0,
        createdAt: 0,
      });
      delete zeroRemote.lastSynced;
      await mockDb.collection('users').doc(user.uid).set(zeroRemote);

      // Local has negative timestamp (e.g. pre-1970 clock glitch)
      const negLocal = buildTestPlan({
        stream: 'cs',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: -5000,
        createdAt: -5000,
      });
      delete negLocal.lastSynced;
      setAppState(negLocal);
      saveAppStateLocally();

      confirmDialogResponse = true; // choose local
      setCurrentUser(user);

      await expect(performCloudSync(user)).resolves.not.toThrow();
      expect(getAppState().stream).toBe('cs');
    });

    it('2.6 handles COMPLETELY MISSING timestamp fields on both local and remote', async () => {
      const user = { uid: 'adv_ts_missing_all', email: 'missing@kerala.edu' };

      const noTsRemote = buildTestPlan({
        stream: 'commerce',
        grade: '+2',
        ownerUid: user.uid,
      });
      delete noTsRemote.lastModified;
      delete noTsRemote.createdAt;
      delete noTsRemote.lastSynced;
      delete noTsRemote.updatedAt;
      await mockDb.collection('users').doc(user.uid).set(noTsRemote);

      const noTsLocal = buildTestPlan({
        stream: 'cs',
        grade: '+2',
        ownerUid: user.uid,
      });
      delete noTsLocal.lastModified;
      delete noTsLocal.createdAt;
      delete noTsLocal.lastSynced;
      delete noTsLocal.updatedAt;
      setAppState(noTsLocal);
      saveAppStateLocally();

      confirmDialogResponse = true;
      setCurrentUser(user);

      await expect(performCloudSync(user)).resolves.not.toThrow();
      expect(getAppState()).not.toBeNull();
    });

    it('2.7 handles TIMEZONE OFFSETS in ISO strings correctly (UTC vs +05:30 equivalent normalization)', async () => {
      const user = { uid: 'adv_ts_timezone', email: 'tz@kerala.edu' };
      // Local is in IST (+05:30): 2026-11-04T17:30:00+05:30 (which is 12:00:00Z)
      // Remote is in UTC (Z): 2026-11-04T11:00:00.000Z (which is 1 hour earlier)
      const istLocalTime = '2026-11-04T17:30:00+05:30';
      const utcRemoteTime = '2026-11-04T11:00:00.000Z';

      const remotePlan = buildTestPlan({
        stream: 'commerce',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: utcRemoteTime,
      });
      await mockDb.collection('users').doc(user.uid).set(remotePlan);

      const localPlan = buildTestPlan({
        stream: 'cs',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: istLocalTime,
      });
      setAppState(localPlan);
      saveAppStateLocally();

      setCurrentUser(user);
      await performCloudSync(user);

      // Local (12:00:00Z) is newer than Remote (11:00:00Z), so Local CS plan must win!
      expect(getAppState().stream).toBe('cs');
      const cloudDoc = await mockDb.collection('users').doc(user.uid).get();
      expect(cloudDoc.data().stream).toBe('cs');
    });

    it('2.8 handles chooseLocal throwing an unexpected exception without crashing or corrupting', async () => {
      const user = { uid: 'adv_chooselocal_throw', email: 'throw@kerala.edu' };
      const remotePlan = buildTestPlan({
        stream: 'commerce',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: '2026-11-04T12:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(remotePlan);

      const localPlan = buildTestPlan({
        stream: 'cs',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: '2026-11-04T12:00:00.000Z', // Collision triggers chooseLocal
      });

      const sync = createAccountSync({
        db: mockDb,
        user,
        storage: global.localStorage,
        sessionId: 'adv_throw_sess',
        getLocal: () => localPlan,
        apply: vi.fn(),
        status: vi.fn(),
        chooseLocal: async () => {
          throw new Error('Fatal UI Dialog Failure');
        },
      });

      // Must catch the error gracefully and return false without unhandled rejection
      const result = await sync.refresh();
      expect(result).toBe(false);
    });

    it('2.9 protects local unsaved edits when an external onSnapshot arrives from remote', async () => {
      const user = { uid: 'adv_snapshot_race', email: 'race@kerala.edu' };
      const basePlan = buildTestPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 1,
        tasksPerDay: 2,
        completedTaskCount: 0,
        ownerUid: user.uid,
        lastModified: '2026-11-04T10:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(basePlan);
      mockStorage.set(
        `mpt_account_sync_v1_${user.uid}`,
        JSON.stringify({ base: basePlan, pending: null })
      );

      // Local user ticks task 1 locally (now different from base)
      const localEdited = JSON.parse(JSON.stringify(basePlan));
      localEdited.plan[0].tasks[0].completed = true;
      localEdited.lastModified = '2026-11-04T10:15:00.000Z';
      setAppState(localEdited);

      let appliedState = null;
      const sync = createAccountSync({
        db: mockDb,
        user,
        storage: global.localStorage,
        sessionId: 'adv_snap_sess',
        getLocal: () => getAppState(),
        apply: (state) => {
          appliedState = state;
          setAppState(state);
        },
        status: vi.fn(),
      });

      sync.listen();

      // Another device updates Firestore to have task 2 completed
      const remoteFromOther = JSON.parse(JSON.stringify(basePlan));
      remoteFromOther.plan[0].tasks[1].completed = true;
      remoteFromOther.lastModified = '2026-11-04T10:20:00.000Z';

      // Emit onSnapshot
      mockDb.collection('users').doc(user.uid).emitSnapshot(remoteFromOther);

      // Wait a microtask tick for async handlers
      await new Promise((r) => setTimeout(r, 50));

      // Local task 1 completion MUST NOT be lost!
      const current = getAppState();
      expect(current.plan[0].tasks[0].completed).toBe(true);
      sync.stop();
    });
  });

  // =========================================================================
  // Challenge 3: Simultaneous Multi-Field Plan Edits Concurrently
  // =========================================================================
  describe('Challenge 3: Simultaneous Multi-Field Plan Edits Concurrently', () => {
    it('3.1 simultaneously mutates hours, targetTerm, pace, restDay, dailyCapacity, and task checkboxes', async () => {
      const user = { uid: 'adv_multifield_same_plan', email: 'multifield@kerala.edu' };

      // Base plan on server
      const basePlan = buildTestPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 1,
        tasksPerDay: 4,
        completedTaskCount: 1, // task 1 completed
        hours: 2,
        targetTerm: 1,
        pacePreference: 'balanced',
        restDay: 'Sunday',
        dailyCapacityMinutes: 120,
        ownerUid: user.uid,
        lastModified: '2026-11-04T10:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(basePlan);
      mockStorage.set(
        `mpt_account_sync_v1_${user.uid}`,
        JSON.stringify({ base: basePlan, pending: null })
      );

      // Student edits MULTIPLE FIELDS SIMULTANEOUSLY in the plan:
      // - checks task 2 and task 3
      // - unchecks task 1 (intentional untick)
      // - increases daily hours from 2 to 4
      // - changes targetTerm from 1 to 2
      // - changes pacePreference to 'aggressive'
      // - changes restDay to 'Friday'
      // - updates dailyCapacityMinutes to 240
      const localEdited = JSON.parse(JSON.stringify(basePlan));
      localEdited.plan[0].tasks[0].completed = false; // untick
      localEdited.plan[0].tasks[1].completed = true;  // tick
      localEdited.plan[0].tasks[2].completed = true;  // tick
      localEdited.hours = 4;
      localEdited.targetTerm = 2;
      localEdited.pacePreference = 'aggressive';
      localEdited.restDay = 'Friday';
      localEdited.dailyCapacityMinutes = 240;
      localEdited.lastModified = '2026-11-04T11:00:00.000Z';

      setAppState(localEdited);
      saveAppStateLocally();

      setCurrentUser(user);
      const syncResult = await performCloudSync(user);
      expect(syncResult).toBe(true);

      // Verify local state reflects all edited fields
      const finalLocal = getAppState();
      expect(finalLocal.hours).toBe(4);
      expect(finalLocal.targetTerm).toBe(2);
      expect(finalLocal.pacePreference).toBe('aggressive');
      expect(finalLocal.restDay).toBe('Friday');
      expect(finalLocal.dailyCapacityMinutes).toBe(240);
      expect(finalLocal.plan[0].tasks[0].completed).toBe(false);
      expect(finalLocal.plan[0].tasks[1].completed).toBe(true);
      expect(finalLocal.plan[0].tasks[2].completed).toBe(true);

      // Verify Firestore received all multi-field mutations accurately
      const finalCloud = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(finalCloud.hours).toBe(4);
      expect(finalCloud.targetTerm).toBe(2);
      expect(finalCloud.pacePreference).toBe('aggressive');
      expect(finalCloud.restDay).toBe('Friday');
      expect(finalCloud.dailyCapacityMinutes).toBe(240);
      expect(finalCloud.plan[0].tasks[0].completed).toBe(false);
      expect(finalCloud.plan[0].tasks[1].completed).toBe(true);
      expect(finalCloud.plan[0].tasks[2].completed).toBe(true);
    });

    it('3.2 simultaneously mutates structural fields (stream, grade, schedule) + non-structural fields + checkboxes', async () => {
      const user = { uid: 'adv_structural_multifield', email: 'structural@kerala.edu' };

      // Stale plan in cloud: Bio +1
      const staleBioPlan = buildTestPlan({
        stream: 'bio',
        grade: '+1',
        daysCount: 2,
        tasksPerDay: 2,
        hours: 2,
        targetTerm: 1,
        ownerUid: user.uid,
        lastModified: '2026-10-25T08:00:00.000Z',
        createdAt: '2026-10-25T08:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(staleBioPlan);

      // Newly configured plan locally: Humanities +2, 5 hours, targetTerm 2, tasks checked
      const newHumanitiesPlan = buildTestPlan({
        stream: 'humanities',
        grade: '+2',
        daysCount: 2,
        tasksPerDay: 3,
        completedTaskCount: 2,
        hours: 5,
        targetTerm: 2,
        restDay: 'Saturday',
        pacePreference: 'speedrun',
        dailyCapacityMinutes: 300,
        ownerUid: user.uid,
        lastModified: '2026-11-04T12:00:00.000Z',
        createdAt: '2026-11-04T12:00:00.000Z',
      });
      setAppState(newHumanitiesPlan);
      saveAppStateLocally();

      setCurrentUser(user);
      await performCloudSync(user);

      // Local is newer: must automatically win without reverting or throwing
      const finalLocal = getAppState();
      expect(finalLocal.stream).toBe('humanities');
      expect(finalLocal.grade).toBe('+2');
      expect(finalLocal.hours).toBe(5);
      expect(finalLocal.targetTerm).toBe(2);
      expect(finalLocal.restDay).toBe('Saturday');
      expect(finalLocal.pacePreference).toBe('speedrun');
      expect(finalLocal.plan[0].tasks[0].completed).toBe(true);
      expect(finalLocal.plan[0].tasks[1].completed).toBe(true);

      const finalCloud = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(finalCloud.stream).toBe('humanities');
      expect(finalCloud.grade).toBe('+2');
      expect(finalCloud.hours).toBe(5);
      expect(finalCloud.targetTerm).toBe(2);
    });

    it('3.3 handles transaction conflict when plan structure changes on remote while local is flushing', async () => {
      const user = { uid: 'adv_tx_conflict', email: 'txconflict@kerala.edu' };

      const basePlan = buildTestPlan({
        stream: 'cs',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: '2026-11-04T08:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(basePlan);

      // Local creates edit on basePlan
      const localPlan = JSON.parse(JSON.stringify(basePlan));
      localPlan.plan[0].tasks[0].completed = true;
      localPlan.lastModified = '2026-11-04T09:00:00.000Z';

      // Remote switches to Commerce in the meantime
      const remoteCommerce = buildTestPlan({
        stream: 'commerce',
        grade: '+2',
        ownerUid: user.uid,
        lastModified: '2026-11-04T09:30:00.000Z',
      });

      // Seed journal.base and pending BEFORE initializing account sync
      mockStorage.set(
        `mpt_account_sync_v1_${user.uid}`,
        JSON.stringify({ base: basePlan, pending: localPlan })
      );
      // Simulate remote having switched plan to Commerce
      await mockDb.collection('users').doc(user.uid).set(remoteCommerce);

      let chosenPlan = true;
      const sync = createAccountSync({
        db: mockDb,
        user,
        storage: global.localStorage,
        sessionId: 'adv_tx_sess',
        getLocal: () => localPlan,
        apply: (state) => setAppState(state),
        status: vi.fn(),
        chooseLocal: async () => chosenPlan,
      });

      // refresh() triggers flush() -> detects sync/plan-conflict -> backs up pending to storage and calls chooseLocal
      await sync.refresh();

      // Conflicted pending plan was safely backed up to conflict recovery key
      const conflictBackup = mockStorage.get(`mpt_sync_conflict_${user.uid}`);
      expect(conflictBackup).not.toBeNull();
      expect(JSON.parse(conflictBackup).stream).toBe('cs');
    });

    it('3.4 handles MASSIVE MULTI-DAY MULTI-TASK simultaneous edit across 10 days and 40 tasks', async () => {
      const user = { uid: 'adv_massive_multifield', email: 'massive@kerala.edu' };

      const largeBase = buildTestPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 10,
        tasksPerDay: 4,
        completedTaskCount: 5,
        hours: 3,
        ownerUid: user.uid,
        lastModified: '2026-11-04T08:00:00.000Z',
      });
      await mockDb.collection('users').doc(user.uid).set(largeBase);
      mockStorage.set(
        `mpt_account_sync_v1_${user.uid}`,
        JSON.stringify({ base: largeBase, pending: null })
      );

      // Modify 20 tasks across all 10 days, change hours to 6, pace to aggressive
      const largeLocal = JSON.parse(JSON.stringify(largeBase));
      largeLocal.hours = 6;
      largeLocal.pacePreference = 'aggressive';
      largeLocal.lastModified = '2026-11-04T12:00:00.000Z';

      for (let d = 0; d < 10; d++) {
        // Toggle tasks
        largeLocal.plan[d].tasks[0].completed = true;
        largeLocal.plan[d].tasks[1].completed = (d % 2 === 0);
        largeLocal.plan[d].tasks[2].completed = true;
      }

      setAppState(largeLocal);
      saveAppStateLocally();

      setCurrentUser(user);
      const res = await performCloudSync(user);
      expect(res).toBe(true);

      const finalCloud = (await mockDb.collection('users').doc(user.uid).get()).data();
      expect(finalCloud.hours).toBe(6);
      expect(finalCloud.pacePreference).toBe('aggressive');
      for (let d = 0; d < 10; d++) {
        expect(finalCloud.plan[d].tasks[0].completed).toBe(true);
        expect(finalCloud.plan[d].tasks[1].completed).toBe(d % 2 === 0);
        expect(finalCloud.plan[d].tasks[2].completed).toBe(true);
      }
    });
  });

  // =========================================================================
  // Challenge 4: Date Rollover & Storage Continuity Under Stress
  // =========================================================================
  describe('Challenge 4: Date Rollover & Multi-Day Persistence Under Stress', () => {
    it('4.1 seamlessly triggers checkDate() rollover when local plan has corrupt timestamps', () => {
      const plan = buildTestPlan({
        stream: 'cs',
        grade: '+2',
        lastModified: 'CORRUPT_TIMESTAMP_DATA',
      });
      setAppState(plan);
      saveAppStateLocally();

      // Midnight rollover should execute without crash or reload
      expect(() => checkDate()).not.toThrow();
      expect(mockReload).not.toHaveBeenCalled();
      expect(getAppState().stream).toBe('cs');
    });

    it('4.2 preserves all multi-field plan changes across localStorage serialization round-trip', () => {
      const plan = buildTestPlan({
        stream: 'humanities',
        grade: '+1',
        hours: 4.5,
        targetTerm: 2,
        restDay: 'Sunday',
        pacePreference: 'thorough',
        dailyCapacityMinutes: 270,
        completedTaskCount: 3,
      });

      setAppState(plan);
      saveAppStateLocally();

      // Simulate browser restart / fresh state load from localStorage
      setAppState(null);
      const raw = global.localStorage.getItem('plusTwoMissionState_v2');
      expect(raw).not.toBeNull();
      const restored = JSON.parse(raw);
      expect(restored).not.toBeNull();
      expect(restored.stream).toBe('humanities');
      expect(restored.grade).toBe('+1');
      expect(restored.hours).toBe(4.5);
      expect(restored.targetTerm).toBe(2);
      expect(restored.restDay).toBe('Sunday');
      expect(restored.pacePreference).toBe('thorough');
      expect(restored.dailyCapacityMinutes).toBe(270);
      expect(restored.plan[0].tasks[0].completed).toBe(true);
      expect(restored.plan[0].tasks[1].completed).toBe(true);
      expect(restored.plan[0].tasks[2].completed).toBe(true);
    });

    it('4.3 verifies guest pre-auth queue handles multi-field mutations before sign-in', async () => {
      const guestPlan = buildTestPlan({
        stream: 'commerce',
        grade: '+2',
        hours: 3.5,
        targetTerm: 2,
        completedTaskCount: 2,
        ownerUid: null,
      });

      // Save while guest (no auth, no db)
      setAppState(guestPlan);
      await saveAppState();

      // Guest pending state was queued
      const guestRaw = mockStorage.get('mpt_account_sync_pending_guest');
      expect(guestRaw).not.toBeNull();
      const guestJournal = JSON.parse(guestRaw);
      expect(guestJournal.pending.stream).toBe('commerce');
      expect(guestJournal.pending.hours).toBe(3.5);

      // Student signs in with Google
      const user = { uid: 'adv_guest_multifield_user', email: 'guestmulti@kerala.edu' };
      setCurrentUser(user);
      await performCloudSync(user);

      // Cloud document now has the student's plan adopted with ownerUid
      const cloudDoc = await mockDb.collection('users').doc(user.uid).get();
      expect(cloudDoc.exists).toBe(true);
      expect(cloudDoc.data().stream).toBe('commerce');
      expect(cloudDoc.data().hours).toBe(3.5);
      expect(cloudDoc.data().ownerUid).toBe(user.uid);
      expect(mockStorage.get('mpt_account_sync_pending_guest')).toBeUndefined();
    });
  });
});
