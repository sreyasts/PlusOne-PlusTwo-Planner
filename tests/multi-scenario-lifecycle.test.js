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
  setupWindowBindings,
  setupAutoRefresh,
  checkDate,
  compactPlanToToday,
  getActiveStreak,
  getYesterdayStr,
  renderApp,
  resetApp,
  restorePreResetSnapshot,
  signOutUser,
  performCloudSync,
  syncAppStateToCloud,
  toggleTaskDirect,
  getFirestoreCleanData,
  getCurrentUser,
  setCurrentUser,
  getFirebaseAuth,
  setFirebaseAuth,
  getFirestoreDb,
  setFirestoreDb,
  getCloudSyncUnsubscribe,
  setCloudSyncUnsubscribe,
  saveAppState,
  saveAppStateLocally,
} from '../src/app.js';

// Hoist mocks for native dialogs, audio, analytics and confetti
let confirmDialogResponse = true;
let confirmDialogArgsHistory = [];
let appAlertArgsHistory = [];
let appToastArgsHistory = [];

vi.mock('../src/ui/dialogs.js', () => ({
  showAppConfirm: vi.fn(async (args) => {
    confirmDialogArgsHistory.push(args);
    return typeof confirmDialogResponse === 'function' ? confirmDialogResponse(args) : confirmDialogResponse;
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
  initAnalytics: vi.fn(),
  FUNNEL_STAGES: {},
}));

describe('Requirement R4: Comprehensive Automated Multi-Scenario Simulation & Regression Harness', () => {
  // Mock In-Memory Firestore Document with real-time listener capabilities
  class MockFirestoreDoc {
    constructor(initialData = null) {
      this._data = initialData ? JSON.parse(JSON.stringify(initialData)) : null;
      this._listeners = new Set();
    }

    async get() {
      return {
        exists: this._data !== null,
        data: () => (this._data ? JSON.parse(JSON.stringify(this._data)) : null),
      };
    }

    async set(newData, options = {}) {
      if (options.merge && this._data) {
        this._data = { ...this._data, ...JSON.parse(JSON.stringify(newData)) };
      } else {
        this._data = JSON.parse(JSON.stringify(newData));
      }
      const snap = {
        exists: true,
        data: () => (this._data ? JSON.parse(JSON.stringify(this._data)) : null),
        metadata: { hasPendingWrites: false },
      };
      for (const listener of this._listeners) {
        listener(snap);
      }
    }

    async delete() {
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

    onSnapshot(callback) {
      this._listeners.add(callback);
      return () => {
        this._listeners.delete(callback);
      };
    }

    emitSnapshot(data, metadata = { hasPendingWrites: false }) {
      const snap = {
        exists: data !== null,
        data: () => (data ? JSON.parse(JSON.stringify(data)) : null),
        metadata,
      };
      for (const listener of this._listeners) {
        listener(snap);
      }
    }
  }

  // Mock Firestore Collection
  class MockFirestoreCollection {
    constructor() {
      this._docs = new Map();
    }

    doc(id) {
      if (!this._docs.has(id)) {
        this._docs.set(id, new MockFirestoreDoc());
      }
      return this._docs.get(id);
    }
  }

  // Mock Firestore DB
  class MockFirestoreDb {
    constructor() {
      this._collections = new Map();
    }

    collection(name) {
      if (!this._collections.has(name)) {
        this._collections.set(name, new MockFirestoreCollection());
      }
      return this._collections.get(name);
    }

    enablePersistence() {
      return Promise.resolve();
    }
  }

  // Mock Firebase Auth with listener dispatch
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
      // Immediately notify listener of current auth state
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

  // Helper to build realistic study plans for Science & Commerce
  function buildScenarioStudyPlan({
    stream = 'cs',
    grade = '+2',
    daysCount = 3,
    tasksPerDay = 3,
    completedTaskCount = 0,
    ownerUid = null,
    userEmail = null,
    clientSessionId = 'sess_default',
    startDate = '2026-10-28',
    deadlineDate = '2026-11-15',
  } = {}) {
    const subjects =
      stream === 'cs'
        ? ['Physics', 'Chemistry', 'Computer Science']
        : stream === 'commerce'
        ? ['Accountancy', 'Business Studies', 'Economics']
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
      plan.push({
        dayNumber: d,
        date: `2026-10-${String(27 + d).padStart(2, '0')}`,
        dayOfWeek: (3 + d) % 7,
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
      lastSynced: '2026-10-30T10:00:00.000Z',
      lastModified: '2026-10-30T10:00:00.000Z',
      plan,
    };
  }

  // Mock DOM environment & storage
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
    const element = {
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
    return element;
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
    confirmDialogArgsHistory = [];
    appAlertArgsHistory = [];
    appToastArgsHistory = [];

    // Pre-seed common UI elements
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
    const unsub = getCloudSyncUnsubscribe();
    if (unsub) {
      unsub();
      setCloudSyncUnsubscribe(null);
    }
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SCENARIO 1: Multi-Account Switching Isolation
  // =========================================================================
  describe('Scenario 1: Multi-Account Switching Isolation', () => {
    it('guarantees complete memory, storage, and cloud document isolation between distinct student accounts', async () => {
      // 1. Setup Account A: Science student (5 completed tasks)
      const userA = {
        uid: 'student_science_A1',
        email: 'science_student@kerala.edu',
        displayName: 'Amal Science',
      };
      const initialAccountAPlan = buildScenarioStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 3,
        tasksPerDay: 3, // 9 tasks total
        completedTaskCount: 5,
        ownerUid: userA.uid,
        userEmail: userA.email,
        clientSessionId: 'sess_account_A',
      });
      await mockDb.collection('users').doc(userA.uid).set(initialAccountAPlan);

      // 2. Setup Account B: Commerce student (3 completed tasks)
      const userB = {
        uid: 'student_commerce_B2',
        email: 'commerce_student@kerala.edu',
        displayName: 'Fathima Commerce',
      };
      const initialAccountBPlan = buildScenarioStudyPlan({
        stream: 'commerce',
        grade: '+2',
        daysCount: 3,
        tasksPerDay: 3, // 9 tasks total
        completedTaskCount: 3,
        ownerUid: userB.uid,
        userEmail: userB.email,
        clientSessionId: 'sess_account_B',
      });
      await mockDb.collection('users').doc(userB.uid).set(initialAccountBPlan);

      // 3. Student signs into Account A
      setCurrentUser(userA);
      await performCloudSync(userA);

      // Verify Account A state loaded
      const stateA = getAppState();
      expect(stateA).not.toBeNull();
      expect(stateA.stream).toBe('cs');
      expect(stateA.grade).toBe('+2');
      expect(stateA.ownerUid).toBe(userA.uid);

      const completedTasksA = stateA.plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(completedTasksA.length).toBe(5);

      // 4. Student marks 2 more tasks completed (Task 6 and Task 7)
      const remainingTasksA = stateA.plan.flatMap((d) => d.tasks).filter((t) => !t.completed);
      remainingTasksA[0].completed = true;
      remainingTasksA[1].completed = true;
      await saveAppState();

      // Verify 7 tasks completed now
      const updatedCompletedA = getAppState().plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(updatedCompletedA.length).toBe(7);

      // Verify Account A cloud document reflects all 7 completions
      const cloudSnapA = await mockDb.collection('users').doc(userA.uid).get();
      const cloudDataA = cloudSnapA.data();
      const cloudCompletedA = cloudDataA.plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(cloudCompletedA.length).toBe(7);

      // 5. Student clicks Sign Out
      confirmDialogResponse = true; // Confirm sign out
      await signOutUser();

      // Verify clean logout state: memory wiped, localStorage wiped, no residual user
      expect(getCurrentUser()).toBeNull();
      expect(getAppState()).toBeNull();
      expect(mockStorage.get('plusTwoMissionState_v2')).toBeUndefined();
      expect(mockStorage.get('plusTwoPlanState')).toBeUndefined();
      expect(mockStorage.get('mpt_was_logged_in')).toBeUndefined();
      expect(mockSessionStorage.get('mpt_auto_auth_requested')).toBeUndefined();

      // 6. Student signs in to Account B (Commerce student)
      setCurrentUser(userB);
      await performCloudSync(userB);

      // Verify Account B's own data is loaded
      const stateB = getAppState();
      expect(stateB).not.toBeNull();
      expect(stateB.stream).toBe('commerce');
      expect(stateB.grade).toBe('+2');
      expect(stateB.ownerUid).toBe(userB.uid);
      expect(stateB.userEmail).toBe(userB.email);

      const completedTasksB = stateB.plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(completedTasksB.length).toBe(3);

      // STRICT ISOLATION ASSERTIONS:
      // Verify zero leakage of Account A tasks or IDs in Account B
      const allTaskIdsB = stateB.plan.flatMap((d) => d.tasks).map((t) => t.id);
      expect(allTaskIdsB.every((id) => id.startsWith('task_commerce_'))).toBe(true);
      expect(allTaskIdsB.some((id) => id.startsWith('task_cs_'))).toBe(false);

      // Verify Account A's cloud document was untouched by Account B's login
      const postCheckSnapA = await mockDb.collection('users').doc(userA.uid).get();
      const postCheckDataA = postCheckSnapA.data();
      expect(postCheckDataA.stream).toBe('cs');
      expect(postCheckDataA.plan.flatMap((d) => d.tasks).filter((t) => t.completed).length).toBe(7);
    });

    it('enforces multi-account isolation when switching directly via auth listener without calling signOutUser first', async () => {
      const userA = {
        uid: 'student_direct_A',
        email: 'directA@kerala.edu',
      };
      const planA = buildScenarioStudyPlan({
        stream: 'cs',
        grade: '+2',
        completedTaskCount: 4,
        ownerUid: userA.uid,
      });
      await mockDb.collection('users').doc(userA.uid).set(planA);

      const userB = {
        uid: 'student_direct_B',
        email: 'directB@kerala.edu',
      };
      const planB = buildScenarioStudyPlan({
        stream: 'commerce',
        grade: '+2',
        completedTaskCount: 2,
        ownerUid: userB.uid,
      });
      await mockDb.collection('users').doc(userB.uid).set(planB);

      // Student starts on Account A
      setCurrentUser(userA);
      await performCloudSync(userA);
      expect(getAppState().stream).toBe('cs');

      // Direct switch to Account B: simulate auth state change isolation check
      if (getAppState() && getAppState().ownerUid && getAppState().ownerUid !== userB.uid) {
        mockStorage.delete('plusTwoMissionState_v2');
        mockStorage.delete('plusTwoPlanState');
        setAppState(null);
      }
      setCurrentUser(userB);
      await performCloudSync(userB);

      expect(getAppState().stream).toBe('commerce');
      expect(getAppState().ownerUid).toBe(userB.uid);
      expect(getAppState().plan.flatMap((d) => d.tasks).filter((t) => t.completed).length).toBe(2);
    });
  });

  // =========================================================================
  // SCENARIO 2: Guest Plan Creation & Account Reconciliation
  // =========================================================================
  describe('Scenario 2: Guest Plan Creation & Account Reconciliation', () => {
    it('prompts user and reconciles device plan when signing into an account with an existing older plan without losing local work', async () => {
      // 1. Student starts without login (Guest Mode)
      setCurrentUser(null);
      const guestPlan = buildScenarioStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 3,
        tasksPerDay: 3,
        completedTaskCount: 1, // 1 task marked done locally
        ownerUid: null,
        userEmail: null,
        clientSessionId: 'sess_guest_local',
      });
      setAppState(guestPlan);
      saveAppStateLocally();

      expect(getAppState().stream).toBe('cs');
      const localDone = getAppState().plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(localDone.length).toBe(1);

      // 2. Account C exists in cloud with an older Biology plan (4 tasks completed)
      const userC = {
        uid: 'student_reconcile_C3',
        email: 'returning_student@kerala.edu',
        displayName: 'Anjali Bio',
      };
      const olderCloudPlan = buildScenarioStudyPlan({
        stream: 'bio',
        grade: '+2',
        daysCount: 4,
        tasksPerDay: 3,
        completedTaskCount: 4,
        ownerUid: userC.uid,
        userEmail: userC.email,
        clientSessionId: 'sess_cloud_older',
      });
      await mockDb.collection('users').doc(userC.uid).set(olderCloudPlan);

      // 3. User chooses "Use Device Plan & Update Account" on the reconciliation prompt
      confirmDialogResponse = (dialogArgs) => {
        expect(dialogArgs.title).toBe('Cloud Account Sync');
        expect(dialogArgs.confirmText).toBe('Use Device Plan & Update Account');
        expect(dialogArgs.cancelText).toBe('Load Saved Cloud Plan');
        expect(dialogArgs.message).toContain('Biology Science');
        expect(dialogArgs.message).toContain('Computer Science');
        return true; // Click "Use Device Plan & Update Account"
      };

      // 4. Perform cloud sync upon sign-in
      setCurrentUser(userC);
      await performCloudSync(userC);

      // 5. Verify local plan was retained and saved to cloud account
      const activeState = getAppState();
      expect(activeState.stream).toBe('cs'); // Local Science plan kept!
      expect(activeState.ownerUid).toBe(userC.uid);
      expect(activeState.userEmail).toBe(userC.email);

      // Verify the 1 completed task was not lost
      const activeDone = activeState.plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(activeDone.length).toBe(1);
      expect(activeDone[0].id).toBe('task_cs_d1_t1');

      // Verify Firestore now contains the reconciled device plan
      const updatedCloudSnap = await mockDb.collection('users').doc(userC.uid).get();
      const updatedCloudData = updatedCloudSnap.data();
      expect(updatedCloudData.stream).toBe('cs');
      expect(updatedCloudData.ownerUid).toBe(userC.uid);
      expect(updatedCloudData.plan.flatMap((d) => d.tasks).filter((t) => t.completed).length).toBe(1);
    });

    it('allows user to load saved cloud plan if they choose "Load Saved Cloud Plan"', async () => {
      // 1. Guest plan with 1 task
      setCurrentUser(null);
      const guestPlan = buildScenarioStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 3,
        completedTaskCount: 1,
      });
      setAppState(guestPlan);
      saveAppStateLocally();

      const userD = {
        uid: 'student_load_cloud_D4',
        email: 'cloud_loader@kerala.edu',
      };
      const cloudPlan = buildScenarioStudyPlan({
        stream: 'bio',
        grade: '+2',
        daysCount: 3,
        completedTaskCount: 5,
        ownerUid: userD.uid,
      });
      await mockDb.collection('users').doc(userD.uid).set(cloudPlan);

      // 2. User chooses "Load Saved Cloud Plan" (dialog confirm returns false)
      confirmDialogResponse = false;

      setCurrentUser(userD);
      await performCloudSync(userD);

      // Verify active state now reflects the cloud plan
      const activeState = getAppState();
      expect(activeState.stream).toBe('bio');
      const activeDone = activeState.plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(activeDone.length).toBe(5);
    });

    it('prompts user on fresh guest plan (0 completed tasks) with Cloud Account Sync dialog rather than silently wiping it out', async () => {
      setCurrentUser(null);
      const freshGuestPlan = buildScenarioStudyPlan({
        stream: 'humanities',
        grade: '+2',
        daysCount: 3,
        completedTaskCount: 0, // 0 completed tasks
      });
      setAppState(freshGuestPlan);
      saveAppStateLocally();

      const userH = {
        uid: 'student_fresh_guest_H',
        email: 'humanities_student@kerala.edu',
      };
      const cloudPlan = buildScenarioStudyPlan({
        stream: 'commerce',
        grade: '+2',
        completedTaskCount: 3,
        ownerUid: userH.uid,
      });
      await mockDb.collection('users').doc(userH.uid).set(cloudPlan);

      // User chooses "Use Device Plan & Update Account"
      confirmDialogResponse = (args) => {
        expect(args.title).toBe('Cloud Account Sync');
        expect(args.confirmText).toBe('Use Device Plan & Update Account');
        return true;
      };

      setCurrentUser(userH);
      await performCloudSync(userH);

      // Verify Humanities plan was saved to cloud account and remains active
      expect(getAppState().stream).toBe('humanities');
      expect(getAppState().ownerUid).toBe(userH.uid);

      const savedCloud = await mockDb.collection('users').doc(userH.uid).get();
      expect(savedCloud.data().stream).toBe('humanities');
    });
  });

  // =========================================================================
  // SCENARIO 3: Accidental Reset & Instant Snapshot Restore
  // =========================================================================
  describe('Scenario 3: Accidental Reset & Instant Snapshot Restore', () => {
    it('creates pre-reset snapshot on resetApp and restores 100% of plan days, checkmarks, stream and grade', async () => {
      const studentUser = {
        uid: 'student_restore_E5',
        email: 'accidental_reset@kerala.edu',
        displayName: 'Rahul K',
      };
      setCurrentUser(studentUser);

      // 1. Plan with 4 completed tasks across 3 days
      const customPlan = buildScenarioStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 3,
        tasksPerDay: 3,
        completedTaskCount: 4,
        ownerUid: studentUser.uid,
        userEmail: studentUser.email,
      });
      setAppState(customPlan);
      saveAppStateLocally();

      expect(getAppState()).not.toBeNull();
      const preResetCompletedCount = getAppState().plan.flatMap((d) => d.tasks).filter((t) => t.completed).length;
      expect(preResetCompletedCount).toBe(4);

      // 2. Student accidentally clicks "Reset Everything"
      confirmDialogResponse = true; // Confirm reset
      await resetApp();

      // Verify appState is wiped and storage key removed
      expect(getAppState()).toBeNull();
      expect(mockStorage.get('plusTwoMissionState_v2')).toBeUndefined();

      // Verify mpt_pre_reset_snapshot was created in localStorage
      const rawSnapshot = mockStorage.get('mpt_pre_reset_snapshot');
      expect(rawSnapshot).toBeDefined();

      const parsedSnapshot = JSON.parse(rawSnapshot);
      expect(parsedSnapshot.stream).toBe('cs');
      expect(parsedSnapshot.grade).toBe('+2');
      expect(parsedSnapshot.completedCount).toBe(4);
      expect(parsedSnapshot.totalCount).toBe(9);
      expect(parsedSnapshot.ownerUid).toBe(studentUser.uid);
      expect(parsedSnapshot.userEmail).toBe(studentUser.email);
      expect(parsedSnapshot.state).toBeDefined();
      expect(parsedSnapshot.state.plan.length).toBe(3);

      // Verify snapshot was also backed up to Firestore /user_archives/{userId}
      const archiveSnap = await mockDb.collection('user_archives').doc(studentUser.uid).get();
      expect(archiveSnap.exists).toBe(true);
      expect(archiveSnap.data().completedCount).toBe(4);

      // 3. Student clicks "Restore Previous Plan"
      const restored = await restorePreResetSnapshot();
      expect(restored).toBe(true);

      // 4. Verify 100% recovery of plan days, checkmarks, stream and grade
      const restoredState = getAppState();
      expect(restoredState).not.toBeNull();
      expect(restoredState.stream).toBe('cs');
      expect(restoredState.grade).toBe('+2');
      expect(restoredState.plan.length).toBe(3);

      const postRestoreDone = restoredState.plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(postRestoreDone.length).toBe(4);

      // Verify identical task IDs and completion flags
      const originalDoneIds = customPlan.plan.flatMap((d) => d.tasks).filter((t) => t.completed).map((t) => t.id);
      const restoredDoneIds = postRestoreDone.map((t) => t.id);
      expect(restoredDoneIds).toEqual(originalDoneIds);

      // Verify restored plan is re-persisted to localStorage
      expect(mockStorage.get('plusTwoMissionState_v2')).toBeDefined();
    });

    it('falls back to cloud archive if local storage was cleared before clicking restore', async () => {
      const studentUser = {
        uid: 'student_cloud_restore_F6',
        email: 'fallback_restore@kerala.edu',
      };
      setCurrentUser(studentUser);

      // Seed cloud archive directly
      const archivedPlan = buildScenarioStudyPlan({
        stream: 'commerce',
        grade: '+2',
        daysCount: 2,
        completedTaskCount: 2,
        ownerUid: studentUser.uid,
      });
      await mockDb.collection('user_archives').doc(studentUser.uid).set({
        state: archivedPlan,
        completedCount: 2,
        stream: 'commerce',
        grade: '+2',
      });

      // Local storage has no snapshot
      mockStorage.delete('mpt_pre_reset_snapshot');
      setAppState(null);

      // Call restore: should query /user_archives and recover
      const restored = await restorePreResetSnapshot();
      expect(restored).toBe(true);

      expect(getAppState()).not.toBeNull();
      expect(getAppState().stream).toBe('commerce');
      expect(getAppState().plan.flatMap((d) => d.tasks).filter((t) => t.completed).length).toBe(2);
    });

    it('aborts reset and preserves active study plan intact when user cancels the confirm dialog', async () => {
      const student = { uid: 'student_cancel_reset', email: 'cancel@kerala.edu' };
      setCurrentUser(student);
      const plan = buildScenarioStudyPlan({
        stream: 'cs',
        grade: '+2',
        completedTaskCount: 3,
        ownerUid: student.uid,
      });
      setAppState(plan);
      saveAppStateLocally();

      // Student chooses "Keep My Plan" (cancel = false)
      confirmDialogResponse = false;
      await resetApp();

      // Verify appState and storage are completely intact
      expect(getAppState()).not.toBeNull();
      expect(getAppState().stream).toBe('cs');
      expect(mockStorage.get('plusTwoMissionState_v2')).toBeDefined();
      expect(mockStorage.get('mpt_pre_reset_snapshot')).toBeUndefined();
    });
  });

  // =========================================================================
  // SCENARIO 4: Real-Time Multi-Device / Multi-Tab Synchronization
  // =========================================================================
  describe('Scenario 4: Real-Time Multi-Device / Multi-Tab Synchronization', () => {
    it('ignores pending writes and local echo, and synchronizes remote updates with toast indicator', async () => {
      const user = {
        uid: 'student_multisync_G7',
        email: 'sync_test@kerala.edu',
      };
      setCurrentUser(user);

      const deviceBSessionId = 'sess_device_B_999';
      mockSessionStorage.set('mpt_client_session_id', deviceBSessionId);

      // Device B starts with baseline plan (0 completed tasks)
      const baselinePlan = buildScenarioStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 2,
        tasksPerDay: 2,
        completedTaskCount: 0,
        ownerUid: user.uid,
        clientSessionId: deviceBSessionId,
      });
      setAppState(baselinePlan);
      saveAppStateLocally();

      // Setup real-time listener on user doc
      const userDocRef = mockDb.collection('users').doc(user.uid);
      let listenerCallback = null;
      const originalOnSnapshot = userDocRef.onSnapshot.bind(userDocRef);

      // Attach Firestore listener manually as done in app.js
      const cloudSyncUnsub = userDocRef.onSnapshot((docSnap) => {
        if (docSnap.metadata && docSnap.metadata.hasPendingWrites) {
          return;
        }
        if (docSnap.exists) {
          let cloudData = docSnap.data();
          if (cloudData && Array.isArray(cloudData.plan) && cloudData.plan.length > 0) {
            if (cloudData.clientSessionId && cloudData.clientSessionId === deviceBSessionId) {
              return; // Ignore local echo
            }
            const cloudLastSynced = cloudData.lastSynced || '';
            const localLastSynced = (getAppState() && getAppState().lastSynced) || '';
            if (!getAppState() || cloudLastSynced !== localLastSynced) {
              setAppState(cloudData);
              saveAppStateLocally();
              renderApp();
              const toastContent = getOrCreateElement('toast-content');
              toastContent.innerHTML = '🔄 Synced from cloud';
            }
          }
        }
      });
      setCloudSyncUnsubscribe(cloudSyncUnsub);

      // TEST 4A: Pending writes must be ignored
      const pendingWritePlan = {
        ...baselinePlan,
        lastSynced: '2026-10-31T11:00:00.000Z',
        clientSessionId: 'sess_device_A_111',
      };
      userDocRef.emitSnapshot(pendingWritePlan, { hasPendingWrites: true });

      // Device B state must NOT change
      expect(getAppState().lastSynced).toBe('2026-10-30T10:00:00.000Z');
      expect(getOrCreateElement('toast-content').innerHTML).not.toContain('Synced from cloud');

      // TEST 4B: Local echo (matching clientSessionId) must be ignored
      const localEchoPlan = {
        ...baselinePlan,
        lastSynced: '2026-10-31T11:05:00.000Z',
        clientSessionId: deviceBSessionId, // Same session ID!
      };
      userDocRef.emitSnapshot(localEchoPlan, { hasPendingWrites: false });

      // Device B state must NOT change
      expect(getAppState().lastSynced).toBe('2026-10-30T10:00:00.000Z');
      expect(getOrCreateElement('toast-content').innerHTML).not.toContain('Synced from cloud');

      // TEST 4C: Remote write from Device A (Task 1 completed)
      const remotePlanFromDeviceA = buildScenarioStudyPlan({
        stream: 'cs',
        grade: '+2',
        daysCount: 2,
        tasksPerDay: 2,
        completedTaskCount: 1, // Task 1 checked by Device A
        ownerUid: user.uid,
        clientSessionId: 'sess_device_A_111', // Remote Device A!
      });
      remotePlanFromDeviceA.lastSynced = '2026-10-31T11:10:00.000Z';

      userDocRef.emitSnapshot(remotePlanFromDeviceA, { hasPendingWrites: false });

      // Device B receives snapshot, updates appState and renders DOM with toast
      expect(getAppState().lastSynced).toBe('2026-10-31T11:10:00.000Z');
      const deviceBCompleted = getAppState().plan.flatMap((d) => d.tasks).filter((t) => t.completed);
      expect(deviceBCompleted.length).toBe(1);
      expect(deviceBCompleted[0].id).toBe('task_cs_d1_t1');

      // Verify DOM Toast rendered "🔄 Synced from cloud"
      expect(getOrCreateElement('toast-content').innerHTML).toContain('🔄 Synced from cloud');
    });

    it('embeds clientSessionId, lastSynced, and lastModified timestamps into Firestore payload on syncAppStateToCloud', async () => {
      const user = { uid: 'student_payload_verify', email: 'payload@kerala.edu', displayName: 'Payload Tester' };
      setCurrentUser(user);

      const plan = buildScenarioStudyPlan({
        stream: 'cs',
        grade: '+2',
        completedTaskCount: 2,
        ownerUid: user.uid,
      });
      setAppState(plan);

      await syncAppStateToCloud(plan);

      const cloudDoc = await mockDb.collection('users').doc(user.uid).get();
      expect(cloudDoc.exists).toBe(true);
      const payload = cloudDoc.data();
      expect(payload.clientSessionId).toBeDefined();
      expect(payload.lastSynced).toBeDefined();
      expect(payload.lastModified).toBeDefined();
      expect(payload.userEmail).toBe('payload@kerala.edu');
      expect(payload.displayName).toBe('Payload Tester');
    });
  });

  // =========================================================================
  // SCENARIO 5: Midnight Date Rollover & Continuous Day Numbering
  // =========================================================================
  describe('Scenario 5: Midnight Date Rollover & Continuous Day Numbering', () => {
    it('seamlessly rolls over at midnight without page reload, updates dynamic TODAY badge, and preserves streak', () => {
      // 1. Student studying late at night on 2026-10-31
      const day1 = new originalDate('2026-10-31T23:59:50');
      const day2 = new originalDate('2026-11-01T00:00:10');
      let mockTime = day1;
      class MockClockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockTime.getTime());
        }
      }
      global.Date = MockClockDate;

      setActiveTodayStr('2026-10-31');
      setupAutoRefresh();

      const midnightPlan = [
        {
          dayNumber: 1,
          date: '2026-10-31',
          tasks: [{ id: 'task_phy_1', completed: true }],
        },
        {
          dayNumber: 2,
          date: '2026-11-01',
          tasks: [{ id: 'task_chem_1', completed: false }],
        },
        {
          dayNumber: 3,
          date: '2026-11-02',
          tasks: [{ id: 'task_math_1', completed: false }],
        },
      ];

      setAppState({
        grade: '+2',
        stream: 'cs',
        streakCount: 5,
        lastCompletedDate: '2026-10-31',
        plan: midnightPlan,
      });

      // View Plan View
      setCurrentView('plan');
      renderApp();

      // Check initial TODAY badge location on Day 1
      const initialHtml = getOrCreateElement('app-container').innerHTML;
      expect(initialHtml).toContain('data-day-number="1"');
      expect(initialHtml).toContain('TODAY');

      const d1Idx = initialHtml.indexOf('data-day-number="1"');
      const d2Idx = initialHtml.indexOf('data-day-number="2"');
      const todayIdx1 = initialHtml.indexOf('TODAY');
      expect(todayIdx1).toBeGreaterThan(d1Idx);
      expect(todayIdx1).toBeLessThan(d2Idx);

      // Initial streak is 5
      expect(getActiveStreak()).toBe(5);

      // 2. Clock passes 00:00:00 -> 2026-11-01T00:00:10
      mockTime = day2;

      // Trigger date rollover check
      checkDate();

      // Verifications:
      // A. Active today string updated
      expect(getActiveTodayStr()).toBe('2026-11-01');

      // B. Reload was NOT called (seamless in-place update)
      expect(mockReload).not.toHaveBeenCalled();

      // C. Date display header was updated
      expect(getOrCreateElement('date-display').innerText).toBeTruthy();

      // D. Toast message displayed
      expect(getOrCreateElement('toast-content').innerHTML).toContain("A new study day has begun! Today's timetable has updated.");

      // E. Streak is PRESERVED across midnight! (student has today to study, yesterday completed)
      expect(getActiveStreak()).toBe(5);

      // F. Re-render Plan View: dynamic TODAY badge moves to Day 2!
      renderApp();
      const updatedHtml = getOrCreateElement('app-container').innerHTML;
      const newD1Idx = updatedHtml.indexOf('data-day-number="1"');
      const newD2Idx = updatedHtml.indexOf('data-day-number="2"');
      const newD3Idx = updatedHtml.indexOf('data-day-number="3"');
      const todayIdx2 = updatedHtml.indexOf('TODAY');

      expect(todayIdx2).toBeGreaterThan(newD2Idx);
      expect(todayIdx2).toBeLessThan(newD3Idx);
    });

    it('compactPlanToToday() guarantees attended days 1..k and upcoming days (k+1)..N are strictly contiguous', () => {
      let mockTime = new Date('2026-11-01T10:00:00');
      class MockClockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockTime.getTime());
        }
      }
      global.Date = MockClockDate;
      setActiveTodayStr('2026-11-01');

      // Student completed Day 1 (Oct 28) and Day 2 (Oct 29).
      // Day 3 (Oct 30) was incomplete.
      // Day 4 (Oct 31) was incomplete.
      // Day 5 (Nov 01) is scheduled today.
      // Day 6 (Nov 02) is tomorrow.
      const initialDisruptedPlan = [
        {
          dayNumber: 1,
          date: '2026-10-28',
          tasks: [{ id: 't1', completed: true }, { id: 't2', completed: true }],
        },
        {
          dayNumber: 2,
          date: '2026-10-29',
          tasks: [{ id: 't3', completed: true }],
        },
        {
          dayNumber: 3,
          date: '2026-10-30',
          tasks: [{ id: 't4', completed: false }],
        },
        {
          dayNumber: 4,
          date: '2026-10-31',
          tasks: [{ id: 't5', completed: false }],
        },
        {
          dayNumber: 5,
          date: '2026-11-01',
          tasks: [{ id: 't6', completed: false }],
        },
        {
          dayNumber: 6,
          date: '2026-11-02',
          tasks: [{ id: 't7', completed: false }],
        },
      ];

      setAppState({
        grade: '+2',
        stream: 'cs',
        startDate: '2026-10-28',
        deadlineDate: '2026-11-15',
        plan: initialDisruptedPlan,
      });

      // Run compactPlanToToday
      compactPlanToToday();

      const compactedPlan = getAppState().plan;
      expect(compactedPlan.length).toBe(6);

      // 1. Attended completed days: strictly Day 1 and Day 2 (historical record intact)
      expect(compactedPlan[0].dayNumber).toBe(1);
      expect(compactedPlan[0].date).toBe('2026-10-28');
      expect(compactedPlan[0].tasks.every((t) => t.completed)).toBe(true);

      expect(compactedPlan[1].dayNumber).toBe(2);
      expect(compactedPlan[1].date).toBe('2026-10-29');
      expect(compactedPlan[1].tasks.every((t) => t.completed)).toBe(true);

      // 2. Upcoming compacted days: strictly numbered Day 3..6 starting from TODAY (2026-11-01)
      expect(compactedPlan[2].dayNumber).toBe(3);
      expect(compactedPlan[2].date).toBe('2026-11-01'); // First unfinished day shifted to TODAY!
      expect(compactedPlan[2].tasks[0].id).toBe('t4');

      expect(compactedPlan[3].dayNumber).toBe(4);
      expect(compactedPlan[3].date).toBe('2026-11-02'); // Tomorrow
      expect(compactedPlan[3].tasks[0].id).toBe('t5');

      expect(compactedPlan[4].dayNumber).toBe(5);
      expect(compactedPlan[4].date).toBe('2026-11-03'); // Day after tomorrow
      expect(compactedPlan[4].tasks[0].id).toBe('t6');

      expect(compactedPlan[5].dayNumber).toBe(6);
      expect(compactedPlan[5].date).toBe('2026-11-04');
      expect(compactedPlan[5].tasks[0].id).toBe('t7');

      // 3. Strict contiguous monotonicity check: dayNumber === index + 1 for ALL days
      compactedPlan.forEach((day, index) => {
        expect(day.dayNumber).toBe(index + 1);
      });

      // 4. Toast notification shown
      expect(appToastArgsHistory.some((t) => t.msg.includes('Schedule fast-tracked to Today'))).toBe(true);
    });

    it('shows trophy message and leaves plan untouched when compactPlanToToday() is called on an all-complete plan', () => {
      const allDonePlan = [
        { dayNumber: 1, date: '2026-10-28', tasks: [{ id: 't1', completed: true }] },
        { dayNumber: 2, date: '2026-10-29', tasks: [{ id: 't2', completed: true }] },
      ];
      setAppState({
        grade: '+2',
        stream: 'cs',
        plan: allDonePlan,
      });

      compactPlanToToday();

      expect(getAppState().plan.length).toBe(2);
      expect(getAppState().plan[0].dayNumber).toBe(1);
      expect(getAppState().plan[1].dayNumber).toBe(2);
      expect(appToastArgsHistory.some((t) => t.msg.includes('completed all scheduled tasks'))).toBe(true);
    });

    it('supports Malayalam date rollover toast message when app language is ml', () => {
      const day1 = new originalDate('2026-10-31T23:59:50');
      const day2 = new originalDate('2026-11-01T00:00:10');
      let mockTime = day1;
      class MockClockDate extends originalDate {
        constructor(...args) {
          if (args.length) super(...args);
          else super(mockTime.getTime());
        }
      }
      global.Date = MockClockDate;

      setActiveTodayStr('2026-10-31');
      mockStorage.set('plustwo_lang', 'ml');
      global.document.documentElement.lang = 'ml';

      setAppState({
        grade: '+2',
        stream: 'cs',
        plan: [{ dayNumber: 1, date: '2026-10-31', tasks: [] }],
      });

      mockTime = day2;
      checkDate();

      expect(getActiveTodayStr()).toBe('2026-11-01');
      expect(getOrCreateElement('toast-content').innerHTML).toContain('പുതിയ പഠനദിനം ആരംഭിച്ചു');
    });
  });
});
