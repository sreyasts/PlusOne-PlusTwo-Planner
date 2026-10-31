import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { resetApp, restorePreResetSnapshot } from '../src/main.js';

describe('Requirement R2: Non-Destructive Reset Plan with Hybrid Snapshot Restore', () => {
  const appJsPath = path.resolve(__dirname, '../src/app.js');
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  const indexPath = path.resolve(__dirname, '../index.html');
  const firestoreRulesPath = path.resolve(__dirname, '../firestore.rules');

  const appJsContent = fs.readFileSync(appJsPath, 'utf8');
  const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const rulesContent = fs.readFileSync(firestoreRulesPath, 'utf8');

  it('exposes restorePreResetSnapshot on window and in module exports', () => {
    expect(typeof restorePreResetSnapshot).toBe('function');
    expect(typeof resetApp).toBe('function');
    expect(appJsContent).toContain('restorePreResetSnapshot,');
    expect(appJsContent).toMatch(/export\s*\{\s*[\s\S]*restorePreResetSnapshot[\s\S]*\};/);
    expect(mainJsContent).toContain('restorePreResetSnapshot');
  });

  it('protects /user_archives/{userId} in Firestore security rules with authenticated owner check', () => {
    expect(rulesContent).toContain('match /user_archives/{userId}');
    expect(rulesContent).toMatch(/match\s+\/user_archives\/\{userId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isOwner\(userId\);/);
  });

  it('includes Undo Reset UI targets in index.html for Settings and Adjust modals', () => {
    expect(indexContent).toContain('id="settings-undo-reset-row"');
    expect(indexContent).toContain('id="btn-settings-undo-reset"');
    expect(indexContent).toContain('id="regenerate-undo-reset-box"');
    expect(indexContent).toContain('id="btn-regenerate-undo-reset"');
    expect(indexContent).toContain('restorePreResetSnapshot()');
  });

  describe('Behavioral & lifecycle sandbox execution', () => {
    function extractFunction(name) {
      const regex = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
      const match = regex.exec(appJsContent);
      if (!match) throw new Error(`Missing app function: ${name}`);
      const start = match.index;
      const next = /\n        (?:async\s+)?function\s+\w+\s*\(/g;
      next.lastIndex = start + 1;
      return appJsContent.slice(start, next.exec(appJsContent)?.index ?? appJsContent.length);
    }

    function createSandboxEnvironment(initialPlan = null) {
      const storage = new Map();
      if (initialPlan) {
        storage.set('plusTwoMissionState_v2', JSON.stringify(initialPlan));
      }

      const elements = new Map();
      function getOrCreateElement(id, initialClasses = []) {
        if (!elements.has(id)) {
          const classSet = new Set(initialClasses);
          elements.set(id, {
            id,
            innerText: '',
            textContent: '',
            value: '',
            innerHTML: '',
            classList: {
              add: (...c) => c.forEach(x => classSet.add(x)),
              remove: (...c) => c.forEach(x => classSet.delete(x)),
              contains: x => classSet.has(x),
              toggle: (x, force) => {
                if (force === undefined) {
                  if (classSet.has(x)) classSet.delete(x); else classSet.add(x);
                } else if (force) {
                  classSet.add(x);
                } else {
                  classSet.delete(x);
                }
              }
            },
            querySelectorAll: () => [],
            appendChild: vi.fn(),
            setAttribute: vi.fn()
          });
        }
        return elements.get(id);
      }

      // Pre-seed known modal & settings elements
      getOrCreateElement('app-container');
      getOrCreateElement('settings-modal', ['hidden']);
      getOrCreateElement('settings-restore-plan-row', ['hidden']);
      getOrCreateElement('settings-restore-plan-hint');
      getOrCreateElement('settings-undo-reset-row', ['hidden']);
      getOrCreateElement('settings-undo-reset-hint');
      getOrCreateElement('regenerate-modal', ['hidden']);
      getOrCreateElement('regenerate-restore-box', ['hidden']);
      getOrCreateElement('regenerate-restore-sub');
      getOrCreateElement('regenerate-undo-reset-box', ['hidden']);
      getOrCreateElement('regenerate-undo-reset-sub');
      getOrCreateElement('completed-day-select');

      const toastLog = [];
      const userArchivesDb = new Map();
      const usersDb = new Map();

      const sandbox = {
        appState: initialPlan ? JSON.parse(JSON.stringify(initialPlan)) : null,
        selectedStream: initialPlan?.stream || 'cs',
        selectedGrade: initialPlan?.grade || '+2',
        activeSyllabusStream: null,
        activeSyllabusGrade: null,
        selectedCompletedChapters: new Set(),
        activeSetupSubjectTab: 'Physics',
        activeSetupGradeTab: initialPlan?.grade || '+2',
        setupPersonalization: {
          subjectConfidence: {},
          weeklyRhythm: 'balanced',
          restDayOfWeek: 0,
          dailyHours: 3.5
        },
        escapeStudyText: value => String(value ?? '').replace(/[&<>"']/g, ''),
        renderPersonalizationSubjectRows: vi.fn(() => ''),
        setTimeout: vi.fn((fn) => { if (typeof fn === 'function') fn(); return 1; }),
        clearTimeout: vi.fn(),
        currentView: 'today',
        setupCurrentStep: 1,
        authModalTimer: null,
        currentUser: {
          uid: 'student_999',
          email: 'student999@kerala.edu',
          displayName: 'Arjun S'
        },
        db: {
          collection: vi.fn((colName) => ({
            doc: vi.fn((docId) => ({
              set: vi.fn(async (data) => {
                if (colName === 'user_archives') userArchivesDb.set(docId, data);
                if (colName === 'users') usersDb.set(docId, data);
              }),
              get: vi.fn(async () => {
                if (colName === 'user_archives') {
                  const data = userArchivesDb.get(docId);
                  return { exists: !!data, data: () => data };
                }
                const data = usersDb.get(docId);
                return { exists: !!data, data: () => data };
              }),
              delete: vi.fn(async () => {
                if (colName === 'users') usersDb.delete(docId);
                if (colName === 'user_archives') userArchivesDb.delete(docId);
              })
            }))
          }))
        },
        localStorage: {
          getItem: vi.fn((key) => storage.get(key) ?? null),
          setItem: vi.fn((key, val) => storage.set(key, String(val))),
          removeItem: vi.fn((key) => storage.delete(key)),
          clear: vi.fn(() => storage.clear())
        },
        sessionStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn()
        },
        document: {
          getElementById: (id) => getOrCreateElement(id),
          createElement: (tag) => ({ tagName: tag, innerHTML: '', appendChild: vi.fn() }),
          body: { classList: { toggle: vi.fn() } },
          documentElement: { lang: 'en' }
        },
        console: {
          warn: vi.fn(),
          error: vi.fn(),
          log: vi.fn()
        },
        window: {
          scrollTo: vi.fn()
        },
        showAppConfirm: vi.fn(async () => true),
        showAppToast: vi.fn((msg, icon) => {
          toastLog.push({ msg, icon });
        }),
        showAppAlert: vi.fn(),
        trackAnalyticsEvent: vi.fn(),
        getAppLanguage: () => 'en',
        getUserSetting: () => true,
        updateThemeUI: vi.fn(),
        getThemePreference: () => 'light',
        saveAppState: vi.fn(async () => {}),
        saveAppStateLocally: vi.fn(),
        updateAuthHeaderUI: vi.fn(),
        closeSettingsModal: vi.fn(),
        closeRegenerateModal: vi.fn(),
        savePreviousPlanSnapshot: vi.fn(),
        getFirestoreCleanData: (obj) => ({ ...obj, lastSynced: new Date().toISOString() }),
        goToSetupStep: vi.fn(),
        getLocalDateStr: vi.fn((date) => '2026-10-30'),
        getRelativePresetDate: vi.fn((days) => '2026-11-30'),
        getPresetDate: vi.fn(() => '2027-02-28'),
        renderSetupSubjectTabs: vi.fn(() => ''),
        renderSetupSubjectChapters: vi.fn(() => ''),
        TODAY_STR: '2026-10-30',
        toastLog,
        userArchivesDb,
        usersDb,
        storage
      };

      vm.createContext(sandbox);

      // Inject implementation functions from app.js
      vm.runInContext(extractFunction('resetApp'), sandbox);
      vm.runInContext(extractFunction('restorePreResetSnapshot'), sandbox);
      vm.runInContext(extractFunction('renderApp'), sandbox);
      vm.runInContext(extractFunction('updateSettingsUI'), sandbox);
      vm.runInContext(extractFunction('openRegenerateModal'), sandbox);
      vm.runInContext(extractFunction('applyAppLanguage'), sandbox);

      return sandbox;
    }

    const sampleStudyPlan = {
      engineVersion: 6,
      stream: 'cs',
      grade: '+2',
      startDate: '2026-10-01',
      deadlineDate: '2026-12-15',
      plan: [
        {
          date: '2026-10-01',
          dayNumber: 1,
          tasks: [
            { id: 'task_p2_phy_1', subject: 'Physics', chapterName: 'Electric Charges', completed: true, isRevision: false, isExamEveTask: false },
            { id: 'task_p2_chem_1', subject: 'Chemistry', chapterName: 'Solutions', completed: true, isRevision: false, isExamEveTask: false },
            { id: 'task_p2_cs_1', subject: 'Computer Science', chapterName: 'Structures', completed: false, isRevision: false, isExamEveTask: false }
          ]
        },
        {
          date: '2026-10-02',
          dayNumber: 2,
          tasks: [
            { id: 'task_p2_math_1', subject: 'Mathematics', chapterName: 'Relations', completed: false, isRevision: false, isExamEveTask: false },
            { id: 'task_rev_1', subject: 'Physics', chapterName: 'Quick Review', completed: false, isRevision: true, isExamEveTask: false }
          ]
        }
      ]
    };

    it('resetApp creates mpt_pre_reset_snapshot with accurate metrics and archives to Firestore', async () => {
      const sandbox = createSandboxEnvironment(sampleStudyPlan);
      expect(sandbox.appState).not.toBeNull();

      // Trigger reset
      await sandbox.resetApp();

      // In-memory appState must be wiped
      expect(sandbox.appState).toBeNull();
      expect(sandbox.storage.get('plusTwoMissionState_v2')).toBeUndefined();

      // mpt_pre_reset_snapshot MUST exist in storage
      const rawSnapshot = sandbox.storage.get('mpt_pre_reset_snapshot');
      expect(rawSnapshot).toBeDefined();

      const snapshot = JSON.parse(rawSnapshot);
      expect(snapshot.stream).toBe('cs');
      expect(snapshot.grade).toBe('+2');
      expect(snapshot.completedCount).toBe(2);
      expect(snapshot.totalCount).toBe(4); // 4 non-revision tasks
      expect(snapshot.userEmail).toBe('student999@kerala.edu');
      expect(snapshot.ownerUid).toBe('student_999');
      expect(snapshot.resetAt).toBeDefined();
      expect(snapshot.formattedDate).toBeDefined();
      expect(snapshot.formattedTime).toBeDefined();
      expect(snapshot.state.plan.length).toBe(2);

      // Firestore user_archives was written with clean pre-reset snapshot
      expect(sandbox.userArchivesDb.has('student_999')).toBe(true);
      const archivedData = sandbox.userArchivesDb.get('student_999');
      expect(archivedData.stream).toBe('cs');
      expect(archivedData.grade).toBe('+2');
      expect(archivedData.completedCount).toBe(2);

      // Reset toast notification
      expect(sandbox.toastLog.some(t => t.msg.includes('Study plan reset'))).toBe(true);
    });

    it('restorePreResetSnapshot restores the plan, checkmarks, stream and grade from localStorage', async () => {
      const sandbox = createSandboxEnvironment(sampleStudyPlan);
      await sandbox.resetApp();
      expect(sandbox.appState).toBeNull();

      sandbox.renderApp = vi.fn();

      // Restore from snapshot
      const success = await sandbox.restorePreResetSnapshot();
      expect(success).toBe(true);

      expect(sandbox.appState).not.toBeNull();
      expect(sandbox.appState.stream).toBe('cs');
      expect(sandbox.appState.grade).toBe('+2');
      expect(sandbox.selectedStream).toBe('cs');
      expect(sandbox.selectedGrade).toBe('+2');

      // Checkmarks preserved
      const day1Tasks = sandbox.appState.plan[0].tasks;
      expect(day1Tasks.find(t => t.id === 'task_p2_phy_1').completed).toBe(true);
      expect(day1Tasks.find(t => t.id === 'task_p2_chem_1').completed).toBe(true);
      expect(day1Tasks.find(t => t.id === 'task_p2_cs_1').completed).toBe(false);

      // Last modified updated
      expect(sandbox.appState.lastModified).toBeDefined();

      // Affirmative toast displayed
      expect(sandbox.toastLog.some(t => t.msg.includes('Previous study plan and progress successfully restored'))).toBe(true);
      expect(sandbox.saveAppState).toHaveBeenCalled();
      expect(sandbox.updateAuthHeaderUI).toHaveBeenCalled();
      expect(sandbox.renderApp).toHaveBeenCalled();
    });

    it('restorePreResetSnapshot falls back to Firestore user_archives when local storage is cleared', async () => {
      const sandbox = createSandboxEnvironment(sampleStudyPlan);
      await sandbox.resetApp();

      // Simulate student changing browser / clearing browser cache
      sandbox.storage.delete('mpt_pre_reset_snapshot');
      expect(sandbox.storage.get('mpt_pre_reset_snapshot')).toBeUndefined();
      expect(sandbox.userArchivesDb.has('student_999')).toBe(true);

      sandbox.renderApp = vi.fn();

      const success = await sandbox.restorePreResetSnapshot();
      expect(success).toBe(true);
      expect(sandbox.appState).not.toBeNull();
      expect(sandbox.appState.stream).toBe('cs');

      // Re-caches back to localStorage
      expect(sandbox.storage.get('mpt_pre_reset_snapshot')).toBeDefined();
      expect(sandbox.renderApp).toHaveBeenCalled();
    });

    it('restorePreResetSnapshot rejects corrupt or missing snapshots safely', async () => {
      const sandbox = createSandboxEnvironment(null);
      sandbox.storage.set('mpt_pre_reset_snapshot', 'invalid json string');

      const success = await sandbox.restorePreResetSnapshot();
      expect(success).toBe(false);
      expect(sandbox.appState).toBeNull();
      expect(sandbox.toastLog.some(t => t.msg.includes('No valid previous study plan found'))).toBe(true);
    });

    it('renders accessible recovery banner above setup wizard card when snapshot exists', () => {
      const sandbox = createSandboxEnvironment(sampleStudyPlan);
      const preResetSnapshot = {
        state: sampleStudyPlan,
        resetAt: new Date().toISOString(),
        formattedTime: '10:30 AM',
        formattedDate: 'Oct 30, 2026',
        stream: 'cs',
        grade: '+2',
        completedCount: 2,
        totalCount: 4
      };
      sandbox.storage.set('mpt_pre_reset_snapshot', JSON.stringify(preResetSnapshot));
      sandbox.appState = null;

      sandbox.renderApp();

      const container = sandbox.document.getElementById('app-container');
      expect(container.innerHTML).toContain('id="pre-reset-restore-banner"');
      expect(container.innerHTML).toContain('Accidentally reset your plan?');
      expect(container.innerHTML).toContain('Oct 30, 2026');
      expect(container.innerHTML).toContain('2/4 tasks completed');
      expect(container.innerHTML).toContain('id="btn-restore-pre-reset"');
      expect(container.innerHTML).toContain('onclick="restorePreResetSnapshot()"');

      // Banner is placed before setup-wizard-card
      const bannerIdx = container.innerHTML.indexOf('id="pre-reset-restore-banner"');
      const cardIdx = container.innerHTML.indexOf('id="setup-wizard-card"');
      expect(bannerIdx).toBeGreaterThan(-1);
      expect(cardIdx).toBeGreaterThan(bannerIdx);
    });

    it('omits recovery banner in setup screen when no pre-reset snapshot exists', () => {
      const sandbox = createSandboxEnvironment(null);
      sandbox.appState = null;
      sandbox.storage.delete('mpt_pre_reset_snapshot');

      sandbox.renderApp();

      const container = sandbox.document.getElementById('app-container');
      expect(container.innerHTML).not.toContain('id="pre-reset-restore-banner"');
      expect(container.innerHTML).toContain('id="setup-wizard-card"');
    });

    it('updates Settings Modal row when pre-reset snapshot exists', () => {
      const sandbox = createSandboxEnvironment(null);
      const preResetSnapshot = {
        state: sampleStudyPlan,
        resetAt: new Date().toISOString(),
        formattedTime: '09:15 AM',
        formattedDate: 'Oct 28, 2026',
        stream: 'cs',
        grade: '+2',
        completedCount: 2,
        totalCount: 4
      };
      sandbox.storage.set('mpt_pre_reset_snapshot', JSON.stringify(preResetSnapshot));

      sandbox.updateSettingsUI();

      const undoRow = sandbox.document.getElementById('settings-undo-reset-row');
      expect(undoRow.classList.contains('hidden')).toBe(false);
      const hint = sandbox.document.getElementById('settings-undo-reset-hint');
      expect(hint.textContent).toContain('Restore timetable from Oct 28, 2026');
    });

    it('updates Adjust / Rebalance Modal box when pre-reset snapshot exists', () => {
      const sandbox = createSandboxEnvironment(sampleStudyPlan);
      const preResetSnapshot = {
        state: sampleStudyPlan,
        resetAt: new Date().toISOString(),
        formattedTime: '08:45 AM',
        formattedDate: 'Oct 25, 2026',
        stream: 'cs',
        grade: '+2',
        completedCount: 2,
        totalCount: 4
      };
      sandbox.storage.set('mpt_pre_reset_snapshot', JSON.stringify(preResetSnapshot));

      sandbox.openRegenerateModal();

      const undoBox = sandbox.document.getElementById('regenerate-undo-reset-box');
      expect(undoBox.classList.contains('hidden')).toBe(false);
      const sub = sandbox.document.getElementById('regenerate-undo-reset-sub');
      expect(sub.textContent).toContain('Pre-reset timetable saved from Oct 25, 2026');
    });
  });
});
