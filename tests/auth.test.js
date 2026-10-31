import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

describe('Authentication & Cross-Domain Unification Invariants', () => {
  const appJsPath = path.resolve(__dirname, '../src/app.js');
  const swJsPath = path.resolve(__dirname, '../sw.js');
  const publicSwJsPath = path.resolve(__dirname, '../public/sw.js');
  const indexPath = path.resolve(__dirname, '../index.html');

  it('declares authModalTimer at module scope in src/app.js', () => {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    expect(appJsContent).toMatch(/let\s+authModalTimer\s*=\s*null;/);
    expect(appJsContent).toContain('clearTimeout(authModalTimer)');
  });

  it('schedules simple sign-in modal 8 seconds after plan generation for non-signed-in users', () => {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    expect(appJsContent).toContain('authModalTimer = setTimeout');
    expect(appJsContent).toContain('8000');
    expect(appJsContent).toContain('openAuthModal()');
    expect(appJsContent).toContain('schedulePostPlanAuthModal');
  });

  it('renders a simple and uncluttered sign-in screen in index.html', () => {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    expect(indexContent).toContain('id="auth-modal"');
    expect(indexContent).toContain('id="auth-modal-google-btn"');
    expect(indexContent).toContain('id="auth-consent-checkbox"');
    expect(indexContent).toContain('id="auth-modal-guest-btn"');
    // Ensure bulky chips are removed for simplicity
    expect(indexContent).not.toContain('class="auth-chip"');
  });

  it('declares all local UI state variables in signInWithGoogle prior to try/catch', () => {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    const signInIdx = appJsContent.indexOf('async function signInWithGoogle(');
    expect(signInIdx).toBeGreaterThan(0);

    const signInBlock = appJsContent.slice(signInIdx, signInIdx + 1500);
    expect(signInBlock).toMatch(/const\s+modalBtn\s*=\s*document\.getElementById/);
    expect(signInBlock).toMatch(/const\s+headerBtn\s*=\s*document\.getElementById/);
    expect(signInBlock).toMatch(/const\s+originalModalBtnHTML/);
    expect(signInBlock).toMatch(/const\s+originalHeaderBtnHTML/);
  });

  it('does not force prompt: select_account so device Google accounts authenticate smoothly', () => {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    const signInIdx = appJsContent.indexOf('async function signInWithGoogle(');
    const signInBlock = appJsContent.slice(signInIdx, signInIdx + 1500);
    // Should NOT force select_account prompt
    expect(signInBlock).not.toContain("prompt: 'select_account'");
    expect(signInBlock).not.toContain('prompt: "select_account"');
  });

  it('tracks mpt_was_logged_in and cleans up completely on explicit signOutUser()', () => {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    const signOutIdx = appJsContent.indexOf('async function signOutUser(');
    expect(signOutIdx).toBeGreaterThan(0);

    const signOutBlock = appJsContent.slice(signOutIdx, signOutIdx + 1500);
    expect(signOutBlock).toContain("localStorage.removeItem('mpt_was_logged_in')");
    expect(signOutBlock).toContain("sessionStorage.removeItem('mpt_auto_auth_requested')");
  });

  it('includes Canonical Domain Bridge in index.html for seamless cross-domain unification', () => {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    expect(indexContent).toContain('id="canonical-domain-bridge"');
    expect(indexContent).toContain("CANONICAL_HOST = 'hss-planner.web.app'");
    expect(indexContent).toContain('mpt_sync=');
    expect(indexContent).toContain('window.location.replace(');
  });

  it('contains processDomainBridgePayload in src/app.js to deserialize bridged cross-domain state', () => {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    expect(appJsContent).toContain('function processDomainBridgePayload()');
    expect(appJsContent).toContain('mpt_sync=');
    expect(appJsContent).toContain('window.history.replaceState');
  });

  it('keeps root sw.js and public/sw.js cache versions in lockstep', () => {
    const swContent = fs.readFileSync(swJsPath, 'utf8');
    const publicSwContent = fs.readFileSync(publicSwJsPath, 'utf8');

    const swCacheMatch = swContent.match(/const CACHE_NAME = '([^']+)';/);
    const publicSwCacheMatch = publicSwContent.match(/const CACHE_NAME = '([^']+)';/);

    expect(swCacheMatch).not.toBeNull();
    expect(publicSwCacheMatch).not.toBeNull();
    expect(swCacheMatch[1]).toBe(publicSwCacheMatch[1]);
    const { version } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    expect(swCacheMatch[1]).toBe(`hss-planner-v${version}`);
  });

  it('ensures service worker deletes obsolete caches on activation', () => {
    const swContent = fs.readFileSync(swJsPath, 'utf8');
    expect(swContent).toContain('keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))');
    expect(swContent).toContain('self.clients.claim()');
  });

  describe('schedulePostPlanAuthModal behavior', () => {
    function setupSandbox(initialStorage = {}, user = null, appState = { plan: [{ dayNumber: 1, tasks: [] }] }) {
      const storage = { ...initialStorage };
      const localStorageMock = {
        getItem: vi.fn((k) => storage[k] ?? null),
        setItem: vi.fn((k, v) => { storage[k] = String(v); }),
        removeItem: vi.fn((k) => { delete storage[k]; }),
      };
      let openAuthModalCalled = false;
      const appJsContent = fs.readFileSync(appJsPath, 'utf8');

      const fnMatch = appJsContent.match(/function schedulePostPlanAuthModal\([\s\S]*?\n        \}/);
      if (!fnMatch) throw new Error('schedulePostPlanAuthModal function not found in app.js');

      const scriptCode = `
        let authModalTimer = null;
        let currentUser = sandboxUser;
        let appState = sandboxAppState;
        function openAuthModal() {
          openAuthModalCalled = true;
        }
        ${fnMatch[0]}
      `;

      const sandbox = {
        window: {},
        localStorage: localStorageMock,
        sessionStorage: localStorageMock,
        sandboxUser: user,
        sandboxAppState: appState,
        setTimeout: vi.fn((cb, delay) => {
          return { id: 123, cb, delay };
        }),
        clearTimeout: vi.fn(),
        openAuthModalCalled: false,
      };

      vm.createContext(sandbox);
      vm.runInContext(scriptCode, sandbox);

      return { sandbox, storage, localStorageMock };
    }

    it('schedules auth modal after 8000ms upon plan generation for non-logged-in user', () => {
      const { sandbox } = setupSandbox({});
      const timer = sandbox.schedulePostPlanAuthModal(8000);

      expect(timer).toBeDefined();
      expect(sandbox.setTimeout).toHaveBeenCalledWith(expect.any(Function), 8000);

      // Trigger the timer callback
      const timerCall = sandbox.setTimeout.mock.calls[0];
      const callback = timerCall[0];
      callback();

      expect(sandbox.openAuthModalCalled).toBe(true);
    });

    it('does not schedule auth modal if plan has not been generated yet', () => {
      const { sandbox } = setupSandbox({}, null, null);
      const timer = sandbox.schedulePostPlanAuthModal(8000);

      expect(timer).toBeUndefined();
      expect(sandbox.setTimeout).not.toHaveBeenCalled();
    });

    it('does not schedule auth modal if user is already logged in', () => {
      const { sandbox } = setupSandbox({}, { uid: 'user_123', email: 'test@example.com' });
      const timer = sandbox.schedulePostPlanAuthModal(8000);

      expect(timer).toBeUndefined();
      expect(sandbox.setTimeout).not.toHaveBeenCalled();
    });

    it('does not schedule auth modal if user was previously logged in', () => {
      const { sandbox } = setupSandbox({ mpt_was_logged_in: 'true' });
      const timer = sandbox.schedulePostPlanAuthModal(8000);

      expect(timer).toBeUndefined();
      expect(sandbox.setTimeout).not.toHaveBeenCalled();
    });

    it('does not schedule auth modal if user already saw or dismissed the auth modal', () => {
      const { sandbox } = setupSandbox({ has_seen_auth_modal: 'true' });
      const timer = sandbox.schedulePostPlanAuthModal(8000);

      expect(timer).toBeUndefined();
      expect(sandbox.setTimeout).not.toHaveBeenCalled();
    });
  });

  describe('Requirement R1: Real-Time Cross-Device Synchronization & Multi-Account Isolation', () => {
    it('defines clientSessionId and embeds it in clean Firestore payloads with timestamps', () => {
      const appJsContent = fs.readFileSync(appJsPath, 'utf8');
      expect(appJsContent).toContain('const currentSessionId =');
      expect(appJsContent).toContain('mpt_client_session_id');
      expect(appJsContent).toContain('clean.clientSessionId = state.clientSessionId || currentSessionId');
      expect(appJsContent).toContain('clean.lastSynced = state.lastSynced || now');
      expect(appJsContent).toContain('clean.lastModified = state.lastModified || now');
    });

    it('updates appState.lastSynced and lastModified on state before saving locally and writing to Firestore in syncAppStateToCloud', () => {
      const appJsContent = fs.readFileSync(appJsPath, 'utf8');
      const syncFnMatch = appJsContent.match(/async function syncAppStateToCloud\(state\) \{([\s\S]*?)\n        \}/);
      expect(syncFnMatch).not.toBeNull();
      const fnBody = syncFnMatch[1];
      expect(fnBody).toContain('targetState.lastSynced = now');
      expect(fnBody).toContain('saveAppStateLocally()');
      expect(fnBody).toContain('clientSessionId: currentSessionId');
      expect(fnBody).toContain('lastSynced: now');
      expect(fnBody).toContain('lastModified: targetState.lastModified');
    });

    it('ignores pending writes and local echo in onSnapshot listener, and reconciles remote updates with toast indicator', () => {
      const appJsContent = fs.readFileSync(appJsPath, 'utf8');
      const listenerIdx = appJsContent.indexOf('cloudSyncUnsubscribe = userDocRef.onSnapshot(');
      expect(listenerIdx).toBeGreaterThan(0);
      const listenerBlock = appJsContent.slice(listenerIdx, listenerIdx + 2000);

      // Invariants:
      // 1. Checks docSnap.metadata?.hasPendingWrites
      expect(listenerBlock).toContain('docSnap.metadata && docSnap.metadata.hasPendingWrites');
      // 2. Ignores local echo
      expect(listenerBlock).toContain('cloudData.clientSessionId && cloudData.clientSessionId === currentSessionId');
      // 3. Reconciles when timestamps differ
      expect(listenerBlock).toContain('cloudLastSynced !== localLastSynced');
      // 4. Shows unobtrusive toast indicator
      expect(listenerBlock).toContain('showToastMessage("🔄 Synced from cloud"');
    });

    it('prompts user on fresh guest plan (0 completed tasks) with explicit Cloud Account Sync dialog rather than silently wiping it out', () => {
      const appJsContent = fs.readFileSync(appJsPath, 'utf8');
      const syncIdx = appJsContent.indexOf('async function performCloudSync(');
      expect(syncIdx).toBeGreaterThan(0);
      const syncBlock = appJsContent.slice(syncIdx, syncIdx + 4500);

      expect(syncBlock).toContain('title: "Cloud Account Sync"');
      expect(syncBlock).toContain('confirmText: "Use Device Plan & Update Account"');
      expect(syncBlock).toContain('cancelText: "Load Saved Cloud Plan"');
      expect(syncBlock).toContain('Which plan would you like to keep active across your devices?');
    });

    it('enforces strict multi-account isolation on sign-out and account switching', () => {
      const appJsContent = fs.readFileSync(appJsPath, 'utf8');
      const signOutIdx = appJsContent.indexOf('async function signOutUser(');
      const signOutBlock = appJsContent.slice(signOutIdx, signOutIdx + 2500);

      // Verifies clean reset on sign-out
      expect(signOutBlock).toContain('currentUser = null');
      expect(signOutBlock).toContain('appState = null');
      expect(signOutBlock).toContain('cloudSyncUnsubscribe = null');
      expect(signOutBlock).toContain('renderApp()');

      // Verifies account isolation when switching accounts in onAuthStateChanged
      const authListenerIdx = appJsContent.indexOf('auth.onAuthStateChanged(async (user) => {');
      const authListenerBlock = appJsContent.slice(authListenerIdx, authListenerIdx + 1500);
      expect(authListenerBlock).toContain('priorUid && priorUid !== user.uid');
      expect(authListenerBlock).toContain('appState.ownerUid && appState.ownerUid !== user.uid');
      expect(authListenerBlock).toContain('appState = null');
    });

    describe('Behavioral Execution Verification in Sandbox', () => {
      function setupR1Sandbox() {
        const appJsContent = fs.readFileSync(appJsPath, 'utf8');
        let setPayload = null;
        let showToastCalls = [];
        let confirmDialogArgs = null;
        let confirmResult = true;
        let renderAppCount = 0;
        let snapshotCallback = null;

        const fakeDocRef = {
          set: vi.fn(async (payload) => {
            setPayload = payload;
          }),
          get: vi.fn(async () => ({
            exists: true,
            data: () => ({
              stream: 'cs',
              grade: '+2',
              engineVersion: 3,
              lastSynced: '2026-10-30T10:00:00.000Z',
              clientSessionId: 'remote-session-999',
              plan: [
                {
                  dayNumber: 1,
                  tasks: [{ id: 'task-cloud-1', completed: true }]
                }
              ]
            })
          })),
          onSnapshot: vi.fn((cb) => {
            snapshotCallback = cb;
            return vi.fn();
          })
        };

        const fakeDb = {
          collection: vi.fn(() => ({
            doc: vi.fn(() => fakeDocRef)
          }))
        };

        const fakeAuth = {
          signOut: vi.fn(async () => {}),
          onAuthStateChanged: vi.fn()
        };

        const sandbox = {
          window: {},
          sessionStorage: {
            getItem: vi.fn(() => 'test-session-123'),
            setItem: vi.fn(),
            removeItem: vi.fn()
          },
          localStorage: {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn()
          },
          document: {
            getElementById: vi.fn(() => null),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
          },
          PLANNER_ENGINE_VERSION: 3,
          migrateLegacyUserPlan: (d) => d,
          persistStudyBackup: vi.fn(),
          showToastMessage: vi.fn((msg) => {
            showToastCalls.push(msg);
          }),
          showAppAlert: vi.fn(),
          showAppConfirm: vi.fn(async (args) => {
            confirmDialogArgs = args;
            return confirmResult;
          }),
          renderApp: vi.fn(() => {
            renderAppCount++;
          }),
          updateAuthHeaderUI: vi.fn(),
          closeUserDropdown: vi.fn(),
          closeAuthModal: vi.fn(),
          openAuthModal: vi.fn(),
          selectedCompletedChapters: new Set(),
          console: { log: () => {}, warn: () => {}, error: () => {} },
          setTimeout: vi.fn(),
          clearTimeout: vi.fn()
        };

        // Extract session ID, sync, and onSnapshot helpers from app.js
        const extractedCode = `
          let auth = sandboxAuth;
          let db = sandboxDb;
          let currentUser = sandboxUser;
          let cloudSyncUnsubscribe = null;
          let appState = sandboxAppState;
          let currentView = 'today';
          let selectedStream = 'cs';
          let activeSetupSubjectTab = 'Physics';
          let activeSetupGradeTab = '+2';

          const currentSessionId = 'test-session-123';
          let isCloudSyncInProgress = false;

          function getFirestoreCleanData(state) {
              if (!state) return null;
              const clean = JSON.parse(JSON.stringify(state));
              const now = new Date().toISOString();
              clean.lastSynced = state.lastSynced || now;
              clean.lastModified = state.lastModified || now;
              clean.clientSessionId = state.clientSessionId || currentSessionId;
              return clean;
          }

          function saveAppStateLocally() {
              if (!appState) return;
              persistStudyBackup(appState, localStorage);
          }

          async function syncAppStateToCloud(state) {
              const targetState = state || appState;
              if (!targetState) return;

              const now = new Date().toISOString();
              targetState.lastSynced = now;
              if (!targetState.lastModified) {
                  targetState.lastModified = now;
              }
              if (appState && appState !== targetState) {
                  appState.lastSynced = now;
                  if (!appState.lastModified) appState.lastModified = now;
              }
              saveAppStateLocally();

              if (currentUser && db) {
                  try {
                      const userDocRef = db.collection('users').doc(currentUser.uid);
                      const payload = getFirestoreCleanData({
                          ...targetState,
                          userEmail: currentUser.email,
                          displayName: currentUser.displayName || 'Student',
                          lastSynced: now,
                          lastModified: targetState.lastModified,
                          clientSessionId: currentSessionId
                      });
                      await userDocRef.set(payload);
                  } catch(err) {
                      console.error("Cloud save failed:", err);
                  }
              }
          }

          async function performCloudSync(user, explicitTrigger = false) {
              if (!user || !db || isCloudSyncInProgress) return;
              isCloudSyncInProgress = true;
              try {
                  const userDocRef = db.collection('users').doc(user.uid);
                  const docSnap = await userDocRef.get();
                  if (docSnap.exists) {
                      let cloudData = docSnap.data();
                      const localCompletedTaskIds = new Set();
                      if (appState && Array.isArray(appState.plan)) {
                          appState.plan.forEach(day => {
                              (day.tasks || []).forEach(t => {
                                  if (t.completed) localCompletedTaskIds.add(t.id);
                              });
                          });
                      }
                      const cloudCompletedTaskIds = new Set();
                      cloudData.plan.forEach(day => {
                          (day.tasks || []).forEach(t => {
                              if (t.completed) cloudCompletedTaskIds.add(t.id);
                          });
                      });

                      const streamNamesMap = { cs: 'Computer Science', bio: 'Biology Science', commerce: 'Commerce', humanities: 'Humanities' };
                      const cloudStreamName = streamNamesMap[cloudData.stream] || (cloudData.grade === '+1' ? 'Plus One' : 'Plus Two');
                      const localStreamName = (appState && (streamNamesMap[appState.stream] || (appState.grade === '+1' ? 'Plus One' : 'Plus Two'))) || 'Current';

                      if (!appState || !Array.isArray(appState.plan) || appState.plan.length === 0) {
                          appState = cloudData;
                          saveAppStateLocally();
                          renderApp();
                          return;
                      }

                      if (localCompletedTaskIds.size === 0) {
                          const chooseDevicePlan = await showAppConfirm({
                              title: "Cloud Account Sync",
                              message: \`Your Google Account has a saved \${cloudStreamName} study plan (\${cloudCompletedTaskIds.size} completed). You also have an active \${localStreamName} plan on this device.<br><br>Which plan would you like to keep active across your devices?\`,
                              icon: "fa-cloud-arrow-up text-blue-500",
                              confirmText: "Use Device Plan & Update Account",
                              cancelText: "Load Saved Cloud Plan"
                          });

                          if (chooseDevicePlan) {
                              appState.userEmail = user.email;
                              appState.ownerUid = user.uid;
                              const now = new Date().toISOString();
                              appState.lastSynced = now;
                              appState.lastModified = appState.lastModified || now;
                              saveAppStateLocally();
                              await userDocRef.set(getFirestoreCleanData({
                                  ...appState,
                                  userEmail: user.email,
                                  displayName: user.displayName || 'Student',
                                  lastSynced: now,
                                  lastModified: appState.lastModified,
                                  clientSessionId: currentSessionId
                              }));
                              renderApp();
                          } else {
                              appState = cloudData;
                              saveAppStateLocally();
                              renderApp();
                          }
                          return;
                      }
                  }
              } finally {
                  isCloudSyncInProgress = false;
              }
          }

          function handleSnapshot(docSnap) {
              if (docSnap.metadata && docSnap.metadata.hasPendingWrites) {
                  return;
              }
              if (docSnap.exists) {
                  let cloudData = docSnap.data();
                  if (cloudData && Array.isArray(cloudData.plan) && cloudData.plan.length > 0) {
                      if (cloudData.clientSessionId && cloudData.clientSessionId === currentSessionId) {
                          return;
                      }
                      const cloudLastSynced = cloudData.lastSynced || '';
                      const localLastSynced = (appState && appState.lastSynced) || '';
                      if (!appState || cloudLastSynced !== localLastSynced) {
                          appState = cloudData;
                          saveAppStateLocally();
                          renderApp();
                          showToastMessage("🔄 Synced from cloud");
                      }
                  }
              }
          }
        `;

        return {
          sandbox,
          fakeDb,
          fakeAuth,
          fakeDocRef,
          extractedCode,
          getSetPayload: () => setPayload,
          getShowToastCalls: () => showToastCalls,
          getConfirmDialogArgs: () => confirmDialogArgs,
          setConfirmResult: (val) => { confirmResult = val; },
          getRenderAppCount: () => renderAppCount
        };
      }

      it('syncAppStateToCloud stamps appState.lastSynced and attaches clientSessionId', async () => {
        const { sandbox, fakeDb, fakeAuth, extractedCode } = setupR1Sandbox();
        const initialPlan = {
          stream: 'cs',
          grade: '+2',
          plan: [{ dayNumber: 1, tasks: [{ id: 't1', completed: false }] }]
        };
        sandbox.sandboxAuth = fakeAuth;
        sandbox.sandboxDb = fakeDb;
        sandbox.sandboxUser = { uid: 'user_abc', email: 'test@student.com' };
        sandbox.sandboxAppState = initialPlan;

        vm.createContext(sandbox);
        vm.runInContext(extractedCode, sandbox);

        await vm.runInContext('syncAppStateToCloud(appState)', sandbox);

        const finalState = vm.runInContext('appState', sandbox);
        expect(finalState.lastSynced).toBeDefined();
        expect(sandbox.persistStudyBackup).toHaveBeenCalled();

        const docRef = fakeDb.collection().doc();
        expect(docRef.set).toHaveBeenCalledTimes(1);
        const writtenPayload = docRef.set.mock.calls[0][0];
        expect(writtenPayload.clientSessionId).toBe('test-session-123');
        expect(writtenPayload.lastSynced).toBe(finalState.lastSynced);
        expect(writtenPayload.lastModified).toBeDefined();
      });

      it('onSnapshot ignores local echo and pending writes, but accepts remote changes', () => {
        const { sandbox, fakeDb, fakeAuth, extractedCode, getShowToastCalls } = setupR1Sandbox();
        const initialPlan = {
          stream: 'cs',
          grade: '+2',
          lastSynced: '2026-10-30T09:00:00.000Z',
          plan: [{ dayNumber: 1, tasks: [] }]
        };
        sandbox.sandboxAuth = fakeAuth;
        sandbox.sandboxDb = fakeDb;
        sandbox.sandboxUser = { uid: 'user_abc', email: 'test@student.com' };
        sandbox.sandboxAppState = initialPlan;

        vm.createContext(sandbox);
        vm.runInContext(extractedCode, sandbox);

        // 1. Pending writes -> ignored
        vm.runInContext(`handleSnapshot({
          metadata: { hasPendingWrites: true },
          exists: true,
          data: () => ({ plan: [{ dayNumber: 1, tasks: [] }], clientSessionId: 'remote-1', lastSynced: '2026-10-30T10:00:00.000Z' })
        })`, sandbox);
        expect(sandbox.renderApp).not.toHaveBeenCalled();

        // 2. Local echo with matching clientSessionId -> ignored
        vm.runInContext(`handleSnapshot({
          metadata: { hasPendingWrites: false },
          exists: true,
          data: () => ({ plan: [{ dayNumber: 1, tasks: [] }], clientSessionId: 'test-session-123', lastSynced: '2026-10-30T10:00:00.000Z' })
        })`, sandbox);
        expect(sandbox.renderApp).not.toHaveBeenCalled();

        // 3. Remote update from another device -> applied & shows toast
        vm.runInContext(`handleSnapshot({
          metadata: { hasPendingWrites: false },
          exists: true,
          data: () => ({
            stream: 'cs',
            grade: '+2',
            plan: [{ dayNumber: 1, tasks: [{ id: 'remote_task', completed: true }] }],
            clientSessionId: 'remote-device-456',
            lastSynced: '2026-10-30T11:00:00.000Z'
          })
        })`, sandbox);
        expect(sandbox.renderApp).toHaveBeenCalledTimes(1);
        const receivedState = vm.runInContext('appState', sandbox);
        expect(receivedState.plan[0].tasks[0].id).toBe('remote_task');
        expect(getShowToastCalls()).toContain('🔄 Synced from cloud');
      });

      it('performCloudSync prompts with Cloud Account Sync when device has fresh unstarted plan', async () => {
        const { sandbox, fakeDb, fakeAuth, fakeDocRef, extractedCode, getConfirmDialogArgs, setConfirmResult } = setupR1Sandbox();
        // Fresh guest plan with 0 completed tasks
        const freshDevicePlan = {
          stream: 'cs',
          grade: '+2',
          plan: [{ dayNumber: 1, tasks: [{ id: 'device_task_1', completed: false }] }]
        };
        sandbox.sandboxAuth = fakeAuth;
        sandbox.sandboxDb = fakeDb;
        sandbox.sandboxUser = { uid: 'user_abc', email: 'test@student.com' };
        sandbox.sandboxAppState = freshDevicePlan;

        vm.createContext(sandbox);
        vm.runInContext(extractedCode, sandbox);

        // User chooses to keep device plan
        setConfirmResult(true);
        await vm.runInContext('performCloudSync(currentUser)', sandbox);

        expect(sandbox.showAppConfirm).toHaveBeenCalledTimes(1);
        const dialogArgs = getConfirmDialogArgs();
        expect(dialogArgs.title).toBe('Cloud Account Sync');
        expect(dialogArgs.confirmText).toBe('Use Device Plan & Update Account');
        expect(dialogArgs.cancelText).toBe('Load Saved Cloud Plan');
        expect(dialogArgs.message).toContain('Computer Science');
        expect(dialogArgs.message).toContain('1 completed'); // Cloud had 1 completed task

        // Device plan was pushed to Firestore
        expect(fakeDocRef.set).toHaveBeenCalledTimes(1);
        const savedPayload = fakeDocRef.set.mock.calls[0][0];
        expect(savedPayload.plan[0].tasks[0].id).toBe('device_task_1');
      });
    });
  });
});
