/**
 * Mission PlusTwo (v6.1.0) - Core Application Logic
 * ESM Modular Architecture: Shipped code and tested engine are 100% unified.
 */

import {
  PLUS_TWO_SYLLABUS,
} from './data/syllabus-plus-two.js';
import {
  PLUS_ONE_SYLLABUS,
} from './data/syllabus-plus-one.js';
import {
  CHAPTER_RESOURCES,
} from './data/chapter-resources.js';
import {
  DHSE_EXAM_CYCLES,
  DHSE_ACADEMIC_MILESTONES,
  detectExamCycleForDeadline,
  getOfficialExamSchedule,
  getOfficialExamEventsForPlan,
  getOfficialExamPresets,
} from './data/dhse-exam-timetables.js';
import {
  PLANNER_ENGINE_VERSION,
  ENGINE_VERSION,
  getLocalDateStr,
  formatLocalDateStr,
  TODAY_STR,
  calculateDaysBetween,
  getSmartStartDate,
  buildIntelligentPlan,
  validatePlan,
  getStreamSubjects,
} from './engine/planner.js';
import {
  PLAN_MIGRATION_VERSION,
  migrateOldState,
  migrateLegacyUserPlan,
} from './engine/migration.js';
import {
  playTaskCompleteSound,
  playMilestoneCelebrationSound,
  playUntickSound,
  playTapSound,
} from './audio/chime.js';
import { triggerStudyConfetti } from './utils/confetti.js';
import {
  showAppToast,
  showAppAlert,
  showAppConfirm,
} from './ui/dialogs.js';
import {
  STREAM_ICONS,
  GRADE_ICONS,
  getSubjectBoxIcon,
} from './ui/illustrations.js';
import {
  trackEvent,
  ensureFirebaseAnalytics,
} from './analytics/tracker.js';
import {
  ML_STRINGS,
} from './i18n/ml.js';
import {
  getCurrentLanguage,
  STORAGE_KEY_LANG,
} from './i18n/detector.js';
import {
  loadFirebaseCompat,
} from './auth/firebase.js';
import {
  generateQrSvg,
} from './utils/qr.js';
import {
  downloadIcsCalendar,
} from './utils/calendar.js';
import {
  generateAiTutorPrompt,
} from './utils/ai_tutor.js';
import { getDailyPlan, compressSameDayTasks, compressPendingOverdueDays, formatCompressedGroupScope } from './ui/daily-plan.js';
import { MAX_BACKUP_BYTES, parseStudyBackup, validateStudyBackup, createStudyBackup, persistStudyBackup } from './utils/study-backup.js';
import { persistTaskCompletion, persistTaskGroupCompletion } from './utils/study-progress.js';
import { isCalendarDate, getRemainingPlanTasks, detectCompletedSyllabusProgress } from './utils/plan-scope.js';
import { getHandbookUrl } from './utils/handbook-lookup.js';
import { createAccountSync, queuePendingAccountState } from './auth/account-sync.js';
import appPackage from '../package.json' with { type: 'json' };
const APP_VERSION = appPackage.version;

const escapeStudyText = value => String(value ?? '').replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);


function getTaskResourceBadge(task) {
    if (!task) return '';
    const mins = task.estimatedMinutes || 60;
    return `<span class="inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-[#EDE8DC] text-[#474B45] dark:bg-[#181A17] dark:text-[#C4C0B6] border border-[#D9D2C3] dark:border-[#31342E]">⏱️ ${mins}m</span>`;
}

function getTaskDeepLinksHtml(task) {
    if (!task || (task.isRevision && !task.isSpacedRetrieval && !task.isExamEveTask)) return '';
    const handbookUrl = getHandbookUrl(task, appState);
    if (!handbookUrl) return '';
    const isMalayalam = getAppLanguage() === 'ml';
    return `
        <div class="daily-task-actions mt-1.5" onclick="event.stopPropagation()">
            <a href="${handbookUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="daily-notes-btn" title="${isMalayalam ? 'അധ്യായ നോട്ട്സും PYQ ചോദ്യങ്ങളും (PDF) കാണുക' : 'Open chapter study notes & PYQs (PDF)'}">📖 Notes</a>
        </div>
    `;
}


/* ==========================================================================
   2. STATE PERSISTENCE & INITIALIZATION (CROSS-DOMAIN BRIDGE AWARE)
   ========================================================================== */
function processDomainBridgePayload() {
    if (typeof window === 'undefined') return;
    try {
        const hash = window.location.hash;
        if (hash && hash.includes('mpt_sync=')) {
            const raw = hash.split('mpt_sync=')[1]?.split('&')[0];
            if (raw) {
                const data = JSON.parse(decodeURIComponent(raw));
                if (data) {
                    if (data.v2 && !localStorage.getItem('plusTwoMissionState_v2')) {
                        localStorage.setItem('plusTwoMissionState_v2', JSON.stringify(data.v2));
                    }
                    if (data.v1 && !localStorage.getItem('plusTwoPlanState')) {
                        localStorage.setItem('plusTwoPlanState', JSON.stringify(data.v1));
                    }
                    if (data.theme && !localStorage.getItem('plustwo_theme')) {
                        localStorage.setItem('plustwo_theme', data.theme);
                    }
                    if (data.lang && !localStorage.getItem('plustwo_lang')) {
                        localStorage.setItem('plustwo_lang', data.lang);
                    }
                    if (data.autoAuth) {
                        localStorage.setItem('mpt_was_logged_in', 'true');
                        sessionStorage.setItem('mpt_auto_auth_requested', 'true');
                    }
                }
            }
            const cleanUrl = window.location.pathname + window.location.search;
            window.history.replaceState(null, '', cleanUrl);
        }
    } catch(err) {
        console.warn('Domain bridge import note:', err);
    }
}
processDomainBridgePayload();

function loadInitialState() {
            if (typeof localStorage === 'undefined') return null;
            let loaded = null;
            // 1. Check v2 state
            try {
                const v2Raw = localStorage.getItem('plusTwoMissionState_v2');
                if (v2Raw) {
                    const parsed = JSON.parse(v2Raw);
                    if (parsed && Array.isArray(parsed.plan) && parsed.plan.length > 0) {
                        loaded = parsed;
                    }
                }
            } catch(e) { console.warn("V2 load error:", e); }

            // 2. Check and migrate v1 state from previous app version ('plusTwoPlanState')
            if (!loaded) {
                try {
                    const v1Raw = localStorage.getItem('plusTwoPlanState');
                    if (v1Raw) {
                        const oldState = JSON.parse(v1Raw);
                        if (oldState && Array.isArray(oldState.plan) && oldState.plan.length > 0) {
                            loaded = migrateOldState(oldState);
                        }
                    }
                } catch(e) { console.warn("V1 migration error:", e); }
            }

            // 3. One-Time Automatic Migration to Engine v3 (if loaded state has engineVersion < 3)
            if (loaded && (!loaded.engineVersion || loaded.engineVersion < PLANNER_ENGINE_VERSION)) {
                try {
                    const migratedV3 = migrateLegacyUserPlan(loaded);
                    if (migratedV3) {
                        loaded = migratedV3;
                        localStorage.setItem('plusTwoMissionState_v2', JSON.stringify(loaded));
                        localStorage.setItem('plusTwoPlanState', JSON.stringify(loaded));
                        console.log("One-time automatic upgrade to Planner Engine v3 completed.");
                        setTimeout(() => {
                            showToastMessage("✨ Your study plan was automatically upgraded to the intelligent v3 engine!", "fa-wand-magic-sparkles text-blue-400");
                        }, 700);
                    }
                } catch(err) {
                    console.error("V3 migration note:", err);
                }
            }

            return loaded;
        }

        let appState = loadInitialState();
        let currentView = 'today'; // 'today', 'plan', 'syllabus', 'setup'


        /* ==========================================================================
           2.5 FIREBASE AUTHENTICATION & REAL-TIME CLOUD SYNC
           ========================================================================== */
        const firebaseConfig = {
            apiKey: "AIzaSyDPcQQkOABPaZAv1lc9-u4Xm5UvMcI0g1A",
            authDomain: "mission-plustwo.firebaseapp.com",
            projectId: "mission-plustwo",
            storageBucket: "mission-plustwo.firebasestorage.app",
            messagingSenderId: "376961059569",
            appId: "1:376961059569:web:4519080be63d1069a57750",
            measurementId: "G-12KPP3ZZ80"
        };

        let auth = null;
        let db = null;
        let currentUser = null;
        let cloudSyncUnsubscribe = null;
        let authModalTimer = null;
        let authListenerAttached = false;

        const currentSessionId = (function() {
            if (typeof window === 'undefined') return 'server_' + Math.random().toString(36).substring(2, 9);
            let sid;
            try {
                sid = sessionStorage.getItem('mpt_client_session_id');
                if (!sid) {
                    sid = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
                    sessionStorage.setItem('mpt_client_session_id', sid);
                }
            } catch (_) {
                sid = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
            }
            return sid;
        })();

        let accountSync = null;
        let syncStatus = 'idle';

        function showSyncStatus(status, error) {
            const changed = syncStatus !== status;
            syncStatus = status;
            const label = document.getElementById('account-sync-status');
            if (label) label.textContent = status === 'synced' ? 'Saved to account' :
                status === 'pending' ? 'Saving to account…' : 'Saved on device · cloud sync needs retry';
            if (status === 'error' && changed) {
                console.error('Account sync failed:', error);
                showToastMessage('Progress is saved on this device. Cloud sync failed; retrying automatically.', 'fa-cloud text-amber-500');
            }
        }

        function getAccountSync(user) {
            if (!user || !db) return null;
            if (accountSync && accountSync.uid === user.uid) return accountSync;
            if (accountSync) accountSync.stop();
            accountSync = createAccountSync({
                db, user, storage: localStorage, sessionId: currentSessionId,
                getLocal: () => appState,
                apply: state => {
                    if (currentUser?.uid !== user.uid) return;
                    if (appState && Array.isArray(appState.plan) && appState.plan.length > 0 && typeof savePreviousPlanSnapshot === 'function') {
                        savePreviousPlanSnapshot();
                    }
                    appState = state;
                    if (appState && (!appState.engineVersion || appState.engineVersion < PLANNER_ENGINE_VERSION)) {
                        appState = migrateLegacyUserPlan(appState);
                    }
                    if (appState) saveAppStateLocally();
                    else {
                        localStorage.removeItem('plusTwoMissionState_v2');
                        localStorage.removeItem('plusTwoPlanState');
                    }
                    renderApp();
                    updateAuthHeaderUI();
                },
                status: showSyncStatus,
                chooseLocal: async (local, remote) => showAppConfirm({
                    title: 'Cloud Account Sync',
                    message: `Your account has a saved ${escapeStudyText(({ cs: 'Computer Science', bio: 'Biology Science', commerce: 'Commerce', humanities: 'Humanities' })[remote.stream] || remote.stream)} (${escapeStudyText(remote.grade || '+2')}) plan. This device has a different ${escapeStudyText(({ cs: 'Computer Science', bio: 'Biology Science', commerce: 'Commerce', humanities: 'Humanities' })[local.stream] || local.stream)} (${escapeStudyText(local.grade || '+2')}) plan. Choose the plan to use across your devices.`,
                    icon: 'fa-cloud-arrow-down text-blue-500',
                    confirmText: 'Use Device Plan & Update Account',
                    cancelText: 'Load Saved Cloud Plan'
                }),
            });
            const sync = accountSync;
            sync.listen();
            cloudSyncUnsubscribe = () => { sync.stop(); if (accountSync === sync) accountSync = null; };
            return accountSync;
        }

        function stopAccountSync() {
            if (accountSync) accountSync.stop();
            accountSync = null;
        }

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

        async function saveAppState() {
            if (!appState) return false;
            appState.lastModified = new Date().toISOString();
            saveAppStateLocally();
            return syncAppStateToCloud(appState);
        }

        async function syncAppStateToCloud(state) {
            const targetState = state || appState;
            if (!targetState) return false;
            if (!currentUser || !db) {
                try { queuePendingAccountState(localStorage, targetState); }
                catch (error) { showSyncStatus('error', error); }
                return false;
            }
            if (targetState.ownerUid && targetState.ownerUid !== currentUser.uid) return false;
            if (!targetState.lastModified) targetState.lastModified = new Date().toISOString();
            targetState.ownerUid = currentUser.uid;
            saveAppStateLocally();
            return getAccountSync(currentUser).save(targetState);
        }

        async function performCloudSync(user, explicitTrigger = false) {
            if (!user || !db || currentUser?.uid !== user.uid) return false;
            if (explicitTrigger) showToastMessage('Checking cloud sync…', 'fa-rotate text-blue-400');
            const synced = await getAccountSync(user).refresh();
            if (synced && explicitTrigger) showToastMessage('Your study plan is saved to your account.', 'fa-circle-check text-emerald-400');
            return synced;
        }

        // Attach user authentication listener and setup real-time Firestore synchronization
        function attachAuthListener() {
            if (!auth || authListenerAttached) return;
            authListenerAttached = true;

            // Handle redirect result if redirected on mobile
            if (typeof auth.getRedirectResult === 'function') {
                auth.getRedirectResult().then((result) => {
                    if (result && result.user) {
                        showToastMessage("Signed in with Google.", "fa-circle-check text-emerald-400");
                    }
                }).catch((err) => {
                    console.warn("Redirect auth note:", err);
                });
            }

            let isInitialAuthCheck = true;
            let previousUserUid = null;
            auth.onAuthStateChanged(async (user) => {
                const wasSignedIn = !!currentUser;
                const priorUid = previousUserUid || (currentUser ? currentUser.uid : null);
                if (priorUid !== user?.uid) {
                    if (cloudSyncUnsubscribe) cloudSyncUnsubscribe();
                    cloudSyncUnsubscribe = null;
                    stopAccountSync();
                }
                currentUser = user;
                previousUserUid = user ? user.uid : null;
                if (typeof window !== 'undefined') window.currentUser = user;
                updateAuthHeaderUI();

                if (user) {
                    closeAuthModal();
                    sessionStorage.setItem('auth_modal_dismissed', 'true');
                    localStorage.setItem('mpt_was_logged_in', 'true');
                    sessionStorage.removeItem('mpt_auto_auth_requested');

                    // Multi-account isolation: if switching between different accounts or prior owner mismatch
                    if (priorUid && priorUid !== user.uid) {
                        if (cloudSyncUnsubscribe) {
                            cloudSyncUnsubscribe();
                            cloudSyncUnsubscribe = null;
                        }
                        localStorage.removeItem('plusTwoMissionState_v2');
                        localStorage.removeItem('plusTwoPlanState');
                        appState = null;
                        selectedCompletedChapters.clear();
                    } else if (appState && appState.ownerUid && appState.ownerUid !== user.uid) {
                        if (cloudSyncUnsubscribe) {
                            cloudSyncUnsubscribe();
                            cloudSyncUnsubscribe = null;
                        }
                        localStorage.removeItem('plusTwoMissionState_v2');
                        localStorage.removeItem('plusTwoPlanState');
                        appState = null;
                        selectedCompletedChapters.clear();
                    }

                    // 1. Immediately perform initial cloud fetch/merge
                    await performCloudSync(user);

                    // Ignore completion of a previous account's asynchronous fetch.
                    if (currentUser?.uid !== user.uid) return;
                    const sync = getAccountSync(user);
                    sync.listen();
                    cloudSyncUnsubscribe = () => { sync.stop(); if (accountSync === sync) accountSync = null; };
                    if (typeof checkCloudArchiveForBanner === 'function') void checkCloudArchiveForBanner();
                } else {
                    // User is not signed in (Guest or signed out)
                    if (cloudSyncUnsubscribe) {
                        cloudSyncUnsubscribe();
                        cloudSyncUnsubscribe = null;
                    }
                    currentUser = null;
                    if (typeof window !== 'undefined') window.currentUser = null;
                    // If user was signed in and signed out externally (e.g. token revocation)
                    if (wasSignedIn && !isInitialAuthCheck) {
                        localStorage.removeItem('plusTwoMissionState_v2');
                        localStorage.removeItem('plusTwoPlanState');
                        localStorage.removeItem('mpt_was_logged_in');
                        appState = null;
                        selectedCompletedChapters.clear();
                        currentView = 'today';
                    }
                    renderApp();

                    // If cross-domain bridge requested auto authentication
                    if (sessionStorage.getItem('mpt_auto_auth_requested') === 'true') {
                        sessionStorage.removeItem('mpt_auto_auth_requested');
                        setTimeout(() => {
                            signInWithGoogle();
                        }, 500);
                    }
                }
                isInitialAuthCheck = false;
            });
        }

        async function initFirebaseAuth() {
            try {
                await loadFirebaseCompat();
                if (window.firebase) {
                    if (!window.firebase.apps || !window.firebase.apps.length) {
                        window.firebase.initializeApp(firebaseConfig);
                    }
                    auth = window.firebase.auth();
                    db = window.firebase.firestore();
                    db.enablePersistence({ synchronizeTabs: true }).catch(() => {
                        db.enablePersistence().catch(() => {});
                    });
                    attachAuthListener();
                }
            } catch(err) {
                console.warn("Firebase initialization note:", err);
            }
        }

        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('online', () => { if (currentUser) void performCloudSync(currentUser); });
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && currentUser) void performCloudSync(currentUser);
            });
        }

        // Initialize Firebase Auth on app start so existing sessions are detected immediately
        if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.createElement === 'function' && document.head && typeof document.head.appendChild === 'function') {
            initFirebaseAuth();
        }

        /* Post-Plan Generation Auth Modal Trigger (8 Seconds after plan generation) */
        function schedulePostPlanAuthModal(delayMs = 8000) {
            if (typeof window === 'undefined') return;
            if (currentUser) return;
            if (localStorage.getItem('mpt_was_logged_in') === 'true') return;
            if (sessionStorage.getItem('auth_modal_dismissed') === 'true' || localStorage.getItem('has_seen_auth_modal') === 'true') return;
            if (!appState || !Array.isArray(appState.plan) || appState.plan.length === 0) return;

            if (authModalTimer) clearTimeout(authModalTimer);
            authModalTimer = setTimeout(() => {
                authModalTimer = null;
                if (!currentUser && appState && sessionStorage.getItem('auth_modal_dismissed') !== 'true') {
                    openAuthModal();
                }
            }, delayMs);
            return authModalTimer;
        }

        const scheduleFirstTimeAuthModal = schedulePostPlanAuthModal;

        /* Milestone-Triggered Google Auth Modal (Zero Friction - Triggered only after first milestone) */
        function checkAndTriggerMilestoneAuth() {
            if (currentUser) return;
            if (localStorage.getItem('has_dismissed_milestone_auth')) return;
            if (!appState || !Array.isArray(appState.plan) || appState.plan.length === 0) return;

            const totalCompleted = appState.plan.reduce((sum, d) => sum + d.tasks.filter(t => t.completed).length, 0);
            if (totalCompleted >= 1) {
                openAuthModal();
            }
        }

        function openAuthModal() {
            if (currentUser) return;
            try {
                localStorage.setItem('has_seen_auth_modal', 'true');
            } catch (_) {}
            const modal = document.getElementById('auth-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        }

        function closeAuthModal() {
            if (authModalTimer) {
                clearTimeout(authModalTimer);
                authModalTimer = null;
            }
            sessionStorage.setItem('auth_modal_dismissed', 'true');
            localStorage.setItem('has_dismissed_milestone_auth', 'true');
            localStorage.setItem('has_seen_auth_modal', 'true');
            const modal = document.getElementById('auth-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        }

        function continueAsGuest() {
            closeAuthModal();
            showToastMessage("Continuing as Guest (Progress saved on this device)", "fa-circle-info text-blue-400");
        }

        async function signInWithGoogleFromModal() {
            const consentCheckbox = document.getElementById('auth-consent-checkbox');
            if (consentCheckbox && !consentCheckbox.checked) {
                showToastMessage("Please confirm parental/guardian consent if under 18 to enable cloud sync.", "fa-circle-exclamation text-amber-400");
                return;
            }
            await signInWithGoogle();
        }

        function triggerManualSync() {
            if (currentUser) {
                performCloudSync(currentUser, true);
            } else {
                signInWithGoogle();
            }
        }

        function updateAuthHeaderUI() {
            const userAvatarImg = document.getElementById('user-avatar-img');
            const guestAvatarIcon = document.getElementById('guest-avatar-icon');
            const userNameShort = document.getElementById('user-name-short');
            const dropdownSignedInBlock = document.getElementById('dropdown-signed-in-block');
            const dropdownGuestBlock = document.getElementById('dropdown-guest-block');
            const dropdownAvatarImg = document.getElementById('dropdown-avatar-img');
            const dropdownUserName = document.getElementById('dropdown-user-name');
            const dropdownUserEmail = document.getElementById('dropdown-user-email');
            const signoutBlock = document.getElementById('dropdown-signout-block');

            const activeUser = currentUser || (typeof window !== 'undefined' ? window.currentUser : null);

            if (activeUser) {
                userAvatarImg?.classList.remove('hidden');
                guestAvatarIcon?.classList.add('hidden');
                const photoUrl = activeUser.photoURL || 'icon.png';
                const displayName = activeUser.displayName || activeUser.email?.split('@')[0] || 'Student';

                if (userAvatarImg) {
                    userAvatarImg.src = photoUrl;
                    userAvatarImg.referrerPolicy = 'no-referrer';
                }
                if (dropdownAvatarImg) {
                    dropdownAvatarImg.src = photoUrl;
                    dropdownAvatarImg.referrerPolicy = 'no-referrer';
                }
                if (userNameShort) userNameShort.innerText = displayName;
                if (dropdownUserName) dropdownUserName.innerText = displayName;
                if (dropdownUserEmail) dropdownUserEmail.innerText = activeUser.email || '';

                dropdownSignedInBlock?.classList.remove('hidden');
                dropdownGuestBlock?.classList.add('hidden');
                signoutBlock?.classList.remove('hidden');
            } else {
                userAvatarImg?.classList.add('hidden');
                guestAvatarIcon?.classList.remove('hidden');
                if (userNameShort) userNameShort.innerText = 'Guest';

                dropdownSignedInBlock?.classList.add('hidden');
                dropdownGuestBlock?.classList.remove('hidden');
                signoutBlock?.classList.add('hidden');
            }
            if (typeof updateThemeUI === 'function') {
                updateThemeUI(getThemePreference ? getThemePreference() : 'system');
            }
        }

        function toggleUserDropdown() {
            const dropdown = document.getElementById('user-dropdown');
            dropdown?.classList.toggle('hidden');
        }

        function closeUserDropdown() {
            const dropdown = document.getElementById('user-dropdown');
            dropdown?.classList.add('hidden');
        }

        // Close dropdown when clicking outside
        if (typeof document !== 'undefined') {
            document.addEventListener('click', (e) => {
                const container = document.getElementById('auth-container');
                if (container && !container.contains(e.target)) {
                    closeUserDropdown();
                }
            });
        }

        async function signInWithGoogle() {
            const modalBtn = document.getElementById('auth-modal-google-btn');
            const headerBtn = document.getElementById('auth-signin-btn');
            const originalModalBtnHTML = modalBtn ? modalBtn.innerHTML : '';
            const originalHeaderBtnHTML = headerBtn ? headerBtn.innerHTML : '';

            if (!auth || !window.firebase) {
                try {
                    await initFirebaseAuth();
                } catch(err) {
                    console.warn("Lazy Firebase initialization note:", err);
                }
            }
            if (!auth) {
                showToastMessage("Firebase could not be loaded. Check internet connection.", "triangleExclamation");
                return;
            }

            try {
                if (modalBtn) {
                    modalBtn.disabled = true;
                    modalBtn.classList.add('opacity-75', 'cursor-wait');
                    modalBtn.innerHTML = `
                        <svg class="w-4 h-4 text-[#1B5E43] dark:text-[#52B788] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        <span>Connecting to Google...</span>
                    `;
                }
                if (headerBtn) {
                    headerBtn.disabled = true;
                    headerBtn.classList.add('opacity-75', 'cursor-wait');
                    headerBtn.innerHTML = `
                        <svg class="w-3.5 h-3.5 text-[#1B5E43] dark:text-[#52B788] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        <span>Signing in...</span>
                    `;
                }

                const provider = new window.firebase.auth.GoogleAuthProvider();
                // Omit prompt: 'select_account' so Android/Chrome automatically authenticates with the active Google account on the device

                if (authModalTimer) {
                    clearTimeout(authModalTimer);
                    authModalTimer = null;
                }
                localStorage.setItem('has_seen_auth_modal', 'true');
                localStorage.setItem('mpt_was_logged_in', 'true');

                // Trigger Google Sign-In Popup directly
                const result = await auth.signInWithPopup(provider);
                if (result && result.user) {
                    currentUser = result.user;
                    if (typeof window !== 'undefined') window.currentUser = result.user;
                    updateAuthHeaderUI();

                }

                closeAuthModal();
                showToastMessage("Signed in with Google.", "fa-circle-check text-emerald-400");
            } catch(err) {
                console.error("Sign-in error:", err);

                if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
                    try {
                        const provider = new firebase.auth.GoogleAuthProvider();
                        await auth.signInWithRedirect(provider);
                        return;
                    } catch(e) {
                        showAppAlert({
                            title: "Popup Blocked",
                            message: "Your browser blocked the Google sign-in window. Please allow popups for this site or open in Chrome.",
                            icon: "fa-shield-halved text-amber-500"
                        });
                    }
                } else if (err.code === 'auth/popup-closed-by-user') {
                    console.log("Sign-in popup closed by user.");
                } else if (err.code === 'auth/unauthorized-domain') {
                    showAppAlert({
                        title: "Authorized Domain Required",
                        message: "This domain is not yet added to your Firebase authorized domains list. Please add 'sreyasts.github.io' under Authentication ➔ Settings ➔ Authorized Domains in your Firebase console.",
                        icon: "fa-key text-rose-500"
                    });
                } else if (err.code === 'auth/network-request-failed') {
                    showAppAlert({
                        title: "Network Error",
                        message: "Network connection lost. Please check your internet connection and try again.",
                        icon: "fa-wifi text-rose-500"
                    });
                } else {
                    showAppAlert({
                        title: "Sign-In Error",
                        message: err.message || String(err),
                        icon: "fa-circle-exclamation text-rose-500"
                    });
                }
            } finally {
                if (modalBtn) {
                    modalBtn.disabled = false;
                    modalBtn.classList.remove('opacity-75', 'cursor-wait');
                    modalBtn.innerHTML = originalModalBtnHTML;
                }
                if (headerBtn) {
                    headerBtn.disabled = false;
                    headerBtn.classList.remove('opacity-75', 'cursor-wait');
                    headerBtn.innerHTML = originalHeaderBtnHTML;
                }
            }
        }

        async function signOutUser() {
            if (!auth) return;
            const confirmed = await showAppConfirm({
                title: "Sign Out?",
                message: "Sign out of your Google account? Your study progress is safely saved in your cloud account, and you will return to guest mode on this device.",
                icon: "fa-right-from-bracket text-rose-500",
                confirmText: "Sign Out",
                cancelText: "Stay Signed In",
                isDestructive: true
            });
            if (!confirmed) return;

            // 1. Immediately unsubscribe real-time listener so no incoming events trigger during sign-out
            if (cloudSyncUnsubscribe) {
                cloudSyncUnsubscribe();
                cloudSyncUnsubscribe = null;
            }

            // 2. Clear user session, local storage and auth tracking
            currentUser = null;
            if (typeof window !== 'undefined') window.currentUser = null;
            localStorage.removeItem('plusTwoMissionState_v2');
            localStorage.removeItem('plusTwoPlanState');
            localStorage.removeItem('mpt_was_logged_in');
            sessionStorage.removeItem('mpt_auto_auth_requested');

            // 3. Reset in-memory state variables to initial setup defaults
            appState = null;
            selectedCompletedChapters.clear();
            currentView = 'today';
            selectedStream = 'cs';
            activeSetupSubjectTab = 'Physics';
            activeSetupGradeTab = '+2';

            // 4. Sign out of Firebase Auth
            try {
                await auth.signOut();
            } catch(e) {
                console.warn("Sign-out note:", e);
            }

            // 5. Update UI, close dropdown, and render the fresh Setup view (View 0)
            closeUserDropdown();
            updateAuthHeaderUI();
            renderApp();
            showToastMessage("Signed out. Your progress is saved in your Google Account. Fresh start ready!", "fa-circle-check text-emerald-400");
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // getLocalDateStr & TODAY_STR imported from ./engine/planner.js

        // Refresh at local midnight and immediately on return, including short screen locks.
        let activeTodayStr = getLocalDateStr();

        function getActiveTodayStr() {
            return activeTodayStr;
        }

        function setActiveTodayStr(val) {
            activeTodayStr = val;
        }

        function getAppState() {
            return appState;
        }

        function setAppState(val) {
            appState = val;
            if (typeof window !== "undefined") {
                window.appState = val;
            }
        }

        function getCurrentView() {
            return currentView;
        }

        function setCurrentView(val) {
            currentView = val;
            if (typeof window !== "undefined") {
                window.currentView = val;
            }
        }

        function getCurrentUser() {
            return currentUser;
        }

        function setCurrentUser(val) {
            if (currentUser?.uid !== val?.uid) stopAccountSync();
            currentUser = val;
            if (typeof window !== "undefined") {
                window.currentUser = val;
            }
        }

        function getFirebaseAuth() {
            return auth;
        }

        function setFirebaseAuth(val) {
            auth = val;
        }

        function getFirestoreDb() {
            return db;
        }

        function setFirestoreDb(val) {
            if (db !== val) stopAccountSync();
            db = val;
        }

        function getCloudSyncUnsubscribe() {
            return cloudSyncUnsubscribe;
        }

        function setCloudSyncUnsubscribe(val) {
            cloudSyncUnsubscribe = val;
        }

        let refreshing = false;
        let midnightTimer = null;

        function checkDate() {
            const currentToday = getLocalDateStr();
            if (!refreshing && currentToday !== activeTodayStr) {
                activeTodayStr = currentToday;

                // Update date header
                const dateDisplay = (typeof document !== "undefined") ? document.getElementById("date-display") : null;
                if (dateDisplay) {
                    const isML = (typeof getAppLanguage === "function" && getAppLanguage() === "ml");
                    dateDisplay.innerText = new Date().toLocaleDateString(isML ? "ml-IN" : "en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                    });
                }

                // If appState exists, seamlessly re-render active view without hard reload
                if (appState) {
                    try {
                        renderApp();
                        const isML = (typeof getAppLanguage === "function" && getAppLanguage() === "ml");
                        const toastMsg = isML
                            ? "🌅 പുതിയ പഠനദിനം ആരംഭിച്ചു! ഇന്നത്തെ ടൈംടേബിൾ അപ്‌ഡേറ്റ് ചെയ്തു."
                            : "🌅 A new study day has begun! Today's timetable has updated.";
                        showToastMessage(toastMsg, "fa-sun text-amber-400");
                    } catch (renderError) {
                        console.error("Seamless date rollover failed, falling back to reload:", renderError);
                        if (typeof window !== "undefined" && window.location && typeof window.location.reload === "function") {
                            refreshing = true;
                            window.location.reload();
                        }
                    }
                }
            }
        }

        function scheduleMidnight() {
            if (midnightTimer) clearTimeout(midnightTimer);
            const now = new Date();
            const next = new Date(now);
            next.setHours(24, 0, 0, 250);
            const ms = Math.max(250, next.getTime() - now.getTime());
            midnightTimer = setTimeout(() => {
                checkDate();
                if (!refreshing) scheduleMidnight();
            }, ms);
        }

        function checkOnReturn() {
            if (typeof document !== "undefined" && document.hidden) return;
            checkDate();
            if (!refreshing) scheduleMidnight();
        }

        function handlePendingHash() {
            if (typeof window !== 'undefined' && window.location && window.location.hash === '#pending-work') {
                if (typeof openPendingWork === 'function') openPendingWork();
            }
        }

        function setupAutoRefresh() {
            refreshing = false;
            if (typeof window !== "undefined") setupWindowBindings();
            if (typeof window === "undefined" || typeof document === "undefined") return;
            document.removeEventListener("visibilitychange", checkOnReturn);
            document.addEventListener("visibilitychange", checkOnReturn);
            window.removeEventListener("focus", checkOnReturn);
            window.addEventListener("focus", checkOnReturn);
            window.removeEventListener("pageshow", checkOnReturn);
            window.addEventListener("pageshow", checkOnReturn);
            window.removeEventListener("hashchange", handlePendingHash);
            window.addEventListener("hashchange", handlePendingHash);
            scheduleMidnight();
        }

        // Initialize live lifecycle listeners
        setupAutoRefresh();

        const getYesterdayStr = (refDateStr = getActiveTodayStr()) => {
            const d = new Date(refDateStr + "T00:00:00");
            d.setDate(d.getDate() - 1);
            return getLocalDateStr(d);
        };

        function getActiveStreak() {
            if (!appState) return 0;
            const streak = appState.streakCount || 0;
            const lastDate = appState.lastCompletedDate;
            if (!streak || !lastDate) return 0;

            const today = getActiveTodayStr();
            const yesterday = getYesterdayStr(today);
            if (lastDate === today || lastDate === yesterday) {
                return streak;
            }
            return 0; // Streak reset due to 2+ days inactivity
        }

        function shareTodayCompletion(dayNumber) {
            const shareTitle = `HSS Planner — Day ${dayNumber} Cleared!`;
            const shareText = `🏆 Day ${dayNumber} study targets 100% completed on HSS Planner! Free adaptive daily study planner for Kerala DHSE Plus One & Plus Two — with guaranteed mock revision buffer. Try it:`;
            const shareUrl = 'https://hss-planner.web.app/';

            if (navigator.share) {
                navigator.share({
                    title: shareTitle,
                    text: shareText,
                    url: shareUrl
                }).then(() => {
                    showToastMessage("Achievement shared with classmates!", "fa-trophy text-amber-300");
                }).catch(() => {});
            } else {
                const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`;
                window.open(whatsappUrl, '_blank');
            }
        }

        function printSchedule() {
            const prevView = currentView;
            if (currentView !== 'plan') {
                currentView = 'plan';
                currentPlanSubjectFilter = 'All';
                renderApp();
            }
            setTimeout(() => {
                window.print();
                if (prevView !== 'plan') {
                    currentView = prevView;
                    renderApp();
                }
            }, 250);
        }

        let currentPlanSubjectFilter = 'All';
        function setPlanSubjectFilter(sub) {
            currentPlanSubjectFilter = sub;
            renderApp();
        }

        

/* ==========================================================================
   3. SETTINGS & USER PREFERENCES
   ========================================================================== */
function getUserSetting(key, defaultValue = true) {
    try {
        const val = localStorage.getItem('plustwo_' + key);
        if (val === null) return defaultValue;
        return val === 'true';
    } catch(e) {
        return defaultValue;
    }
}

function setUserSetting(key, value) {
    try {
        localStorage.setItem('plustwo_' + key, String(value));
    } catch(e) {}
}

function playCelebrationSound() {
    if (getUserSetting('sound', true)) {
        playMilestoneCelebrationSound();
    }
}

function playTaskTickSound() {
    if (getUserSetting('sound', true)) {
        playTaskCompleteSound();
    }
}

function showToastMessage(text, icon = 'checkCircle') {
    showAppToast(text, icon);
}

function fireStudyConfetti(opts = { particleCount: 70, spread: 60, origin: { y: 0.65 } }) {
    if (!getUserSetting('confetti', true)) return;
    let fired = false;
    if (typeof confetti === 'function') {
        try {
            confetti(opts);
            fired = true;
        } catch (_) {}
    }
    if (!fired) {
        try {
            triggerStudyConfetti();
        } catch (_) {}
    }
}

        function getActiveMissionDayNumber() {
            if (!appState || !appState.plan || appState.plan.length === 0) return 1;
            const calendarToday = appState.plan.find(day => day.date === getLocalDateStr());
            return calendarToday?.dayNumber ?? 0;
        }

        /* ==========================================================================
           5. TASK TOGGLE & COMPLETION ENGINE
           Synchronous across Today & Full Plan views
           ========================================================================== */

        function toggleTaskDirect(taskIdOrIds, groupIdsCsv = '') {
            if (!appState || !appState.plan) return;
            const rawIds = groupIdsCsv
                ? String(groupIdsCsv).split(',').map(s => s.trim()).filter(Boolean)
                : (Array.isArray(taskIdOrIds)
                    ? taskIdOrIds.map(s => String(s || '').trim()).filter(Boolean)
                    : String(taskIdOrIds || '').split(',').map(s => s.trim()).filter(Boolean));
            if (rawIds.length === 0) return;

            const primaryTaskId = rawIds[rawIds.length - 1];
            const prevPlan = appState.plan;
            let next;
            try {
                const progressOpts = {
                    today: getLocalDateStr(),
                    yesterday: getYesterdayStr(),
                    modifiedAt: new Date().toISOString(),
                };
                next = rawIds.length > 1
                    ? persistTaskGroupCompletion(appState, rawIds, localStorage, progressOpts)
                    : persistTaskCompletion(appState, primaryTaskId, localStorage, progressOpts);
                if (!next) return;
                appState = next;
            } catch (error) {
                console.warn('Study progress could not be saved:', error);
                const isML = getAppLanguage() === 'ml';
                showAppAlert({
                    title: isML ? 'മാറ്റം സേവ് ചെയ്തില്ല' : 'Progress not saved',
                    message: isML ? 'ഈ മാറ്റം സേവ് ചെയ്യാനായില്ല. പഴയ പഠന നില മാറ്റിയിട്ടില്ല. ഉപകരണത്തിൽ സ്ഥലം ലഭ്യമാക്കി വീണ്ടും ശ്രമിക്കുക. ക്രമീകരണങ്ങളിൽ നിന്ന് ബാക്കപ്പ് എടുക്കാം.' : 'This change could not be saved. Your previous progress is unchanged. Check available device storage and try again. You can export your current plan from Settings.',
                    icon: 'fa-triangle-exclamation text-amber-500',
                });
                return;
            }
            const targetDay = appState.plan.find(day => day.tasks.some(task => rawIds.includes(task.id)));
            const targetTask = targetDay?.tasks.find(task => task.id === primaryTaskId)
                || targetDay?.tasks.find(task => rawIds.includes(task.id));
            if (!targetDay || !targetTask) return;
            void syncAppStateToCloud(appState);

            // Determine all tasks whose completion status changed and all affected days across the plan
            const changedTasks = [];
            const affectedDays = new Set();
            const prevTaskMap = new Map();
            const currentTaskMap = new Map();
            prevPlan.forEach(d => {
                (d.tasks || []).forEach(t => {
                    if (t && t.id) prevTaskMap.set(t.id, Boolean(t.completed));
                });
            });

            appState.plan.forEach(day => {
                let dayHasChange = false;
                (day.tasks || []).forEach(task => {
                    if (task && task.id) {
                        currentTaskMap.set(task.id, Boolean(task.completed));
                        if (prevTaskMap.has(task.id) && prevTaskMap.get(task.id) !== Boolean(task.completed)) {
                            changedTasks.push(task);
                            dayHasChange = true;
                        }
                    }
                });
                if (dayHasChange) {
                    affectedDays.add(day);
                }
            });

            // Update UI elements in DOM safely for all changed tasks (including cascaded sibling parts and grouped blocks)
            try {
                const syncCheckboxState = (cb, isDone) => {
                    if (isDone) {
                        cb.classList.add('checked');
                        cb.setAttribute('aria-checked', 'true');
                        const textLabel = cb.closest('.task-item-container')?.querySelector('.task-text-content');
                        if (textLabel) textLabel.classList.add('line-through', 'opacity-50');
                    } else {
                        cb.classList.remove('checked');
                        cb.setAttribute('aria-checked', 'false');
                        const textLabel = cb.closest('.task-item-container')?.querySelector('.task-text-content');
                        if (textLabel) textLabel.classList.remove('line-through', 'opacity-50');
                    }
                };

                const changedIdSet = new Set(changedTasks.map(t => t.id));
                changedTasks.forEach(task => {
                    const escapedId = (typeof window !== 'undefined' && window.CSS?.escape)
                        ? window.CSS.escape(task.id)
                        : String(task.id).replace(/"/g, '\\"');
                    const checkboxElements = document.querySelectorAll(`[data-task-id="${escapedId}"]`);
                    checkboxElements.forEach(cb => syncCheckboxState(cb, task.completed));
                });

                document.querySelectorAll('[data-group-task-ids]').forEach(cb => {
                    const groupIds = String(cb.dataset.groupTaskIds || '').split(',').filter(Boolean);
                    if (groupIds.some(id => changedIdSet.has(id))) {
                        const allGroupDone = groupIds.length > 0 && groupIds.every(id => currentTaskMap.get(id));
                        syncCheckboxState(cb, allGroupDone);
                    }
                });
            } catch (e) {
                console.warn('DOM checkbox update note:', e);
            }

            // Dynamically update day card counter in Plan View across all affected days
            affectedDays.forEach(day => {
                const dayCard = document.querySelector(`[data-day-number="${day.dayNumber}"]`);
                if (dayCard) {
                    const counterSpan = dayCard.querySelector('.day-card-counter');
                    if (counterSpan) {
                        let displayedTasks = day.tasks || [];
                        if (typeof currentPlanSubjectFilter !== 'undefined' && currentPlanSubjectFilter !== 'All') {
                            displayedTasks = displayedTasks.filter(t => t.subject === currentPlanSubjectFilter);
                        }
                        const completedCount = displayedTasks.filter(t => t.completed).length;
                        const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                        counterSpan.textContent = `${completedCount}/${displayedTasks.length} ${isML ? ML_I18N.plan.done : 'Done'}`;
                    }
                }
            });

            // Synchronize Plan progress summary pill
            const planProgressSummary = document.getElementById('plan-progress-summary');
            if (planProgressSummary) {
                const stats = getOverallStats();
                const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                planProgressSummary.textContent = `${stats.percentage}% ${isML ? 'പൂർത്തിയായി' : 'Done'} (${stats.completedCount}/${stats.totalCount})`;
            }

            // Play celebratory feedback or untick sound
            if (targetTask.completed) {
                try {
                    const hasRecorded = localStorage.getItem('mpt_first_task_recorded');
                    if (!hasRecorded) {
                        localStorage.setItem('mpt_first_task_recorded', 'true');
                        trackAnalyticsEvent('first_task_checked', { taskId: String(targetTask.id || '') });
                    }
                } catch(e) {}

                // Quick dopamine particle burst
                try {
                    fireStudyConfetti({ particleCount: 70, spread: 60, origin: { y: 0.65 } });
                } catch(e) {}

                // 100% Full Syllabus Mastery Celebration Check
                const overallStats = getOverallStats();
                if (overallStats.percentage === 100 && overallStats.totalCount > 0) {
                    playCelebrationSound();
                    fireStudyConfetti({ particleCount: 200, spread: 120, origin: { y: 0.5 } });
                    const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                    showAppToast(isML ? '🎉 100% സിലബസും പൂർത്തിയായി!' : '🎉 100% Syllabus Mastery Achieved!', 'fa-trophy text-amber-400');
                    try {
                        if (!sessionStorage.getItem('mpt_mastery_celebrated')) {
                            sessionStorage.setItem('mpt_mastery_celebrated', 'true');
                            showAppAlert({
                                title: isML ? '🎉 100% സിലബസ് പൂർത്തിയായി!' : '🎉 100% Syllabus Mastery Achieved!',
                                message: isML 
                                    ? 'നിങ്ങൾ മുഴുവൻ സിലബസും വിജയകരമായി പൂർത്തിയാക്കി. മോഡൽ പരീക്ഷകൾക്കും പൊതുപരീക്ഷയ്ക്കും എല്ലാവിധ വിജയങ്ങളും നേരുന്നു!'
                                    : 'Outstanding accomplishment! You have successfully completed 100% of your Higher Secondary syllabus tasks across all subjects. Best of luck on your DHSE Board Examinations!',
                                icon: 'fa-trophy text-amber-500',
                                confirmText: isML ? 'തുടരുക' : 'Celebrate!'
                            });
                        }
                    } catch (_) {}
                }

                // Calculate today's status
                const activeDayNum = typeof getActiveMissionDayNumber === 'function' ? getActiveMissionDayNumber() : 1;
                const todayPlan = appState.plan.find(d => d.dayNumber === activeDayNum) || appState.plan.find(d => d.date === getLocalDateStr());
                if (todayPlan && targetDay?.date === getLocalDateStr()) {
                    const completedToday = todayPlan.tasks.filter(t => t.completed).length;
                    const totalToday = todayPlan.tasks.length;
                    if (completedToday === totalToday && totalToday > 0) {
                        try {
                            fireStudyConfetti({ particleCount: 140, spread: 90, origin: { y: 0.55 } });
                        } catch(e) {}
                        playCelebrationSound();
                        showAppToast(getAppLanguage() === 'ml' ? 'ഇന്നത്തെ പഠനം പൂർത്തിയായി.' : 'All tasks for today are complete.');
                    } else {
                        playTaskTickSound();
                        const remaining = totalToday - completedToday;
                        showAppToast(`${remaining} task${remaining === 1 ? '' : 's'} remaining today.`);
                    }
                } else {
                    playTaskTickSound();
                    const isML = getAppLanguage() === 'ml';
                    showAppToast(
                        rawIds.length > 1
                            ? (isML ? 'അധ്യായം പൂർത്തിയായി. ഇന്നത്തെ ടൈംടേബിളിൽ മാറ്റമില്ല.' : 'Pending chapter completed. Today’s timetable is unchanged.')
                            : (isML ? 'ബാക്കി പഠന ഭാഗം പൂർത്തിയായി.' : 'Pending task completed. Today’s timetable is unchanged.')
                    );
                }

                // If in today view, re-render to advance the hero focus card smoothly
                if (currentView === 'today') {
                    renderApp();
                    return;
                }

                // Milestone Auth Trigger: Gently prompt to backup upon first completed task
                if (!currentUser && !localStorage.getItem('has_dismissed_milestone_auth')) {
                    const allCompletedCount = appState.plan.reduce((sum, d) => sum + d.tasks.filter(t => t.completed).length, 0);
                    if (allCompletedCount === 1) {
                        setTimeout(() => {
                            if (!currentUser && !localStorage.getItem('has_dismissed_milestone_auth')) {
                                openAuthModal();
                            }
                        }, 1200);
                    }
                }
            } else {
                if (getUserSetting('sound', true)) {
                    playUntickSound();
                }
                try {
                    sessionStorage.removeItem('mpt_mastery_celebrated');
                } catch (_) {}
                if (currentView === 'today') {
                    renderApp();
                    return;
                }
            }

            updateProgressHeader();
            highlightNextUnfinishedTask();
        }

        function highlightNextUnfinishedTask() {
            // Remove previous pulse
            document.querySelectorAll('.next-suggested-task').forEach(el => el.classList.remove('next-suggested-task'));

            if (!getUserSetting('autofocus', true)) return;

            // Find first unchecked task in today's list
            const firstUnchecked = document.querySelector('.today-task-card:not(.task-done)');
            if (firstUnchecked) {
                firstUnchecked.classList.add('next-suggested-task');
            }
        }

        /* ==========================================================================
           6. VIEW CONTROLLERS & RENDERING
           ========================================================================== */

        function goToDashboard() {
            currentView = 'today';

            updateActiveNavButtons();
            renderApp();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function goToPlan() {
            currentView = 'plan';
            updateActiveNavButtons();
            renderApp();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        let activeSyllabusStream = null;
        let activeSyllabusGrade = null;
        let activeSyllabusExamCycle = 'christmas';
        function switchSyllabusExamCycle(cycleId) {
            try {
                if (typeof playTapSound === 'function' && (typeof getUserSetting !== 'function' || getUserSetting('sound', true))) {
                    playTapSound();
                }
            } catch (_) {}
            activeSyllabusExamCycle = DHSE_EXAM_CYCLES[cycleId] ? cycleId : 'public';
            renderApp();
        }
        function switchSyllabusStream(streamKey) {
            try {
                if (typeof playTapSound === 'function' && (typeof getUserSetting !== 'function' || getUserSetting('sound', true))) {
                    playTapSound();
                }
            } catch (_) {}
            activeSyllabusStream = streamKey;
            renderApp();
        }

        function switchSyllabusGrade(gradeKey) {
            try {
                if (typeof playTapSound === 'function' && (typeof getUserSetting !== 'function' || getUserSetting('sound', true))) {
                    playTapSound();
                }
            } catch (_) {}
            activeSyllabusGrade = gradeKey;
            renderApp();
        }

        function goToSyllabusView() {
            currentView = 'syllabus';
            updateActiveNavButtons();
            renderApp();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function getShareSummaryText() {
            const stats = (typeof getOverallStats === 'function' && appState?.plan?.length > 0) ? getOverallStats() : null;
            const streak = typeof getActiveStreak === 'function' ? getActiveStreak() : 0;
            if (stats && stats.totalCount > 0) {
                return `📚 HSS Planner — Kerala DHSE Study Planner\n🎯 My Progress: ${stats.percentage}% completed (${stats.completedCount}/${stats.totalCount} tasks)\n🔥 Study Streak: ${streak} days\nPlan your Plus One & Plus Two timetable with built-in revision buffer:`;
            }
            return 'HSS Planner: Free intelligent daily study planner for Kerala DHSE Plus One (+1) & Plus Two (+2) students with built-in revision buffer. Set your target date and generate your personalized daily study plan:';
        }

        function shareApp() {
            const shareTitle = 'HSS Planner — Kerala DHSE Study Planner';
            const shareText = getShareSummaryText();
            const shareUrl = 'https://hss-planner.web.app/';

            if (navigator.share) {
                navigator.share({
                    title: shareTitle,
                    text: shareText,
                    url: shareUrl
                }).then(() => {
                    trackEvent('plan_shared', { channel: 'web_share' });
                    showAppToast("Thanks for sharing!", "fa-circle-check text-emerald-400");
                }).catch(() => {});
            } else {
                shareOnWhatsApp();
            }
        }

        function shareOnWhatsApp() {
            const shareText = getShareSummaryText();
            const shareUrl = 'https://hss-planner.web.app/';
            trackEvent('plan_shared', { channel: 'whatsapp' });
            const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`;
            window.open(whatsappUrl, '_blank');
        }

        function shareOnTelegram() {
            const shareText = '🎓 ' + getShareSummaryText();
            const shareUrl = 'https://hss-planner.web.app/';
            trackEvent('plan_shared', { channel: 'telegram' });
            const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
            window.open(telegramUrl, '_blank');
        }

        function copyShareLink() {
            const shareUrl = 'https://hss-planner.web.app/';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(shareUrl).then(() => {
                    trackEvent('plan_shared', { channel: 'copy_link' });
                    showAppToast("Link copied to clipboard!", "fa-circle-check text-emerald-400");
                }).catch(() => {
                    shareApp();
                });
            } else {
                shareApp();
            }
        }

        function printTimetable() {
            trackEvent('plan_exported', { format: 'print' });
            window.print();
        }

        function exportTimetableCsv() {
            if (!appState?.plan || appState.plan.length === 0) {
                showAppToast("No active plan to export", "fa-circle-exclamation text-amber-500");
                return;
            }

            trackEvent('plan_exported', { format: 'csv' });
            const rows = [["Day", "Date", "Subject", "Grade", "Chapter", "Minutes", "Status"]];

            appState.plan.forEach(day => {
                if (day.tasks && day.tasks.length > 0) {
                    day.tasks.forEach(task => {
                        rows.push([
                            `Day ${day.dayNumber}`,
                            day.date,
                            `"${(task.subject || '').replace(/"/g, '""')}"`,
                            task.grade || '+2',
                            `"${(task.chapterTitle || task.title || '').replace(/"/g, '""')}"`,
                            task.estimatedMinutes || 60,
                            task.completed ? 'Completed' : 'Pending'
                        ]);
                    });
                } else {
                    rows.push([
                        `Day ${day.dayNumber}`,
                        day.date,
                        day.isRestDay ? 'Rest Day' : 'Buffer Day',
                        '-',
                        '-',
                        0,
                        'Completed'
                    ]);
                }
            });

            const csvContent = rows.map(r => r.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `plus-planner-schedule-${appState.grade || '+2'}-${appState.stream || 'plan'}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showAppToast("CSV timetable downloaded!", "fa-circle-check text-emerald-400");
        }

        function exportTimetableIcs() {
            if (!appState?.plan || appState.plan.length === 0) {
                showAppToast("No active plan to export", "fa-circle-exclamation text-amber-500");
                return;
            }
            trackEvent('plan_exported', { format: 'ics' });
            downloadIcsCalendar(appState.plan, appState.stream || 'science');
            const isML = (typeof getAppLanguage === 'function') ? (getAppLanguage() === 'ml') : false;
            showAppToast(
                isML ? "കലണ്ടർ (.ics) ഫയൽ ഡൗൺലോഡ് ചെയ്തു! Google/Apple കലണ്ടറിൽ ചേർക്കാം" : "Calendar (.ics) downloaded! Ready to import to Google/Apple Calendar",
                "fa-calendar-check text-emerald-400"
            );
        }

        let currentAiTutorPromptText = '';

        function openAiTutorModal(taskId) {
            const task = appState?.plan?.flatMap(day => day.tasks).find(item => item.id === taskId);
            if (!task) {
                showAppToast("Task details not found", "fa-circle-exclamation text-amber-500");
                return;
            }

            const isML = (typeof getAppLanguage === 'function') ? (getAppLanguage() === 'ml') : false;
            const tutorData = generateAiTutorPrompt(task, { language: isML ? 'ml' : 'en' });
            currentAiTutorPromptText = tutorData.promptText;

            const modal = document.getElementById('ai-tutor-modal');
            const titleEl = document.getElementById('ai-tutor-title');
            const subtitleEl = document.getElementById('ai-tutor-subtitle');
            const badgeEl = document.getElementById('ai-tutor-badge');
            const chapterEl = document.getElementById('ai-tutor-chapter');
            const tipEl = document.getElementById('ai-tutor-tip');
            const previewEl = document.getElementById('ai-tutor-prompt-preview');
            const chatGptLink = document.getElementById('ai-tutor-chatgpt-link');

            if (titleEl) titleEl.innerText = isML ? "സോക്രട്ടിക് AI സ്റ്റഡി ട്യൂട്ടർ" : "Socratic AI Study Tutor";
            if (subtitleEl) subtitleEl.innerText = isML ? "ChatGPT, Gemini എന്നിവയ്ക്കുള്ള ബോർഡ് പരീക്ഷ റിവിഷൻ പ്രോംപ്റ്റ്" : "Active Recall & PYQ Revision Prompt for ChatGPT & Gemini";
            if (badgeEl) badgeEl.innerText = `${tutorData.subject} • ${tutorData.grade || '+2'}`;
            if (chapterEl) chapterEl.innerText = `${tutorData.chapterTitle} (${tutorData.part})`;
            if (tipEl) tipEl.innerText = tutorData.examTip;
            if (previewEl) previewEl.innerText = tutorData.promptText;
            if (chatGptLink) chatGptLink.href = tutorData.chatGptUrl;

            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
            trackEvent('ai_tutor_opened', { subject: tutorData.subject, chapter: tutorData.chapterTitle });
        }

        function closeAiTutorModal() {
            const modal = document.getElementById('ai-tutor-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        }

        function copyAiTutorPrompt() {
            if (!currentAiTutorPromptText) return;
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(currentAiTutorPromptText).then(() => {
                    const isML = (typeof getAppLanguage === 'function') ? (getAppLanguage() === 'ml') : false;
                    showAppToast(isML ? "പ്രോംപ്റ്റ് കോപ്പി ചെയ്തു! ChatGPT-ൽ പേസ്റ്റ് ചെയ്യാം" : "Socratic prompt copied! Paste into ChatGPT or Gemini", "fa-clipboard-check text-emerald-400");
                }).catch(() => {
                    showAppToast("Copied to clipboard", "fa-clipboard-check text-emerald-400");
                });
            }
        }

        // Safe aliases in case any caller references them
        function openShareModal() { shareApp(); }
        function closeShareModal() {}
        function executeShare() { shareApp(); }

        let exportSheetEscHandler = null;
        let exportSheetCloseTimer = null;

        function openExportShareSheet() {
            if (typeof document === 'undefined') return false;
            const sheet = document.getElementById('export-share-sheet');
            const panel = document.getElementById('export-sheet-panel');
            if (!sheet || !panel) return false;

            if (typeof exportSheetCloseTimer !== 'undefined' && exportSheetCloseTimer) {
                clearTimeout(exportSheetCloseTimer);
                exportSheetCloseTimer = null;
            }
            if (sheet && sheet._closeTimer) {
                clearTimeout(sheet._closeTimer);
                sheet._closeTimer = null;
            }

            const isML = (typeof getAppLanguage === 'function') ? (getAppLanguage() === 'ml') : false;
            const setText = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.textContent = text;
            };
            setText('export-sheet-title', isML ? 'ടൈംടേബിൾ എക്സ്പോർട്ട് & ഷെയർ' : 'Export & Share Timetable');
            setText('export-sheet-subtitle', isML ? 'ഓഫ്‌ലൈനായി സൂക്ഷിക്കുക അല്ലെങ്കിൽ സുഹൃത്തുക്കളുമായി പങ്കുവെക്കുക' : 'Save offline or share your study pace with friends');
            setText('export-sheet-cal-title', isML ? 'കലണ്ടറിൽ ചേർക്കുക (.ics)' : 'Add to Calendar (.ics)');
            setText('export-sheet-cal-desc', isML ? 'Google, Apple, Outlook കലണ്ടറിലേക്ക് സ്റ്റഡി ബ്ലോക്കുകൾ ചേർക്കാം' : 'Sync study blocks into Google, Apple, or Outlook Calendar');
            setText('export-sheet-csv-title', isML ? 'CSV സ്പ്രെഡ്ഷീറ്റ് ഡൗൺലോഡ് ചെയ്യുക' : 'Export CSV Spreadsheet');
            setText('export-sheet-csv-desc', isML ? 'Excel അല്ലെങ്കിൽ Google Sheets-ൽ ഉപയോഗിക്കാൻ പൂർണ്ണ ഷെഡ്യൂൾ' : 'Download full schedule for Excel or Google Sheets');
            setText('export-sheet-share-title', isML ? 'കൂട്ടുകാരുമായി പങ്കുവെക്കുക' : 'Share with Classmates');
            setText('export-sheet-share-desc', isML ? 'WhatsApp, Telegram വഴി സുഹൃത്തുക്കൾക്ക് ഷെഡ്യൂൾ അയക്കാം' : 'Send timetable to friends via WhatsApp or Telegram');
            setText('export-sheet-copy-title', isML ? 'ടൈംടേബിൾ ലിങ്ക് കോപ്പി ചെയ്യുക' : 'Copy Timetable Link');
            setText('export-sheet-copy-desc', isML ? 'വെബ് ലിങ്ക് ക്ലിപ്പ്ബോർഡിലേക്ക് പകർത്തുക' : 'Copy direct web link to clipboard');
            setText('export-sheet-cancel-btn', isML ? 'റദ്ദാക്കുക' : 'Cancel');

            const triggerBtn = document.getElementById('plan-actions-overflow-btn');
            if (triggerBtn && typeof triggerBtn.setAttribute === 'function') {
                triggerBtn.setAttribute('aria-expanded', 'true');
            }

            sheet.classList.remove('hidden');
            if (typeof sheet.setAttribute === 'function') {
                sheet.setAttribute('aria-hidden', 'false');
            }
            // Force layout reflow for CSS transition
            if (sheet.offsetWidth !== undefined) {
                void sheet.offsetWidth;
            }

            sheet.classList.remove('opacity-0');
            sheet.classList.add('opacity-100');
            panel.classList.remove('translate-y-full');
            panel.classList.add('translate-y-0');

            if (document.body && document.body.style) {
                document.body.style.overflow = 'hidden';
            }

            if (exportSheetEscHandler) {
                document.removeEventListener('keydown', exportSheetEscHandler);
            }
            exportSheetEscHandler = (e) => {
                if (e.key === 'Escape') {
                    closeExportShareSheet();
                }
            };
            document.addEventListener('keydown', exportSheetEscHandler);
            return true;
        }

        function closeExportShareSheet() {
            if (typeof document === 'undefined') return false;
            const sheet = document.getElementById('export-share-sheet');
            const panel = document.getElementById('export-sheet-panel');
            if (!sheet || !panel) return false;

            if (typeof exportSheetCloseTimer !== 'undefined' && exportSheetCloseTimer) {
                clearTimeout(exportSheetCloseTimer);
                exportSheetCloseTimer = null;
            }
            if (sheet && sheet._closeTimer) {
                clearTimeout(sheet._closeTimer);
                sheet._closeTimer = null;
            }

            const triggerBtn = document.getElementById('plan-actions-overflow-btn');
            if (triggerBtn && typeof triggerBtn.setAttribute === 'function') {
                triggerBtn.setAttribute('aria-expanded', 'false');
            }

            if (exportSheetEscHandler) {
                document.removeEventListener('keydown', exportSheetEscHandler);
                exportSheetEscHandler = null;
            }

            sheet.classList.remove('opacity-100');
            sheet.classList.add('opacity-0');
            panel.classList.remove('translate-y-0');
            panel.classList.add('translate-y-full');
            if (typeof sheet.setAttribute === 'function') {
                sheet.setAttribute('aria-hidden', 'true');
            }

            if (document.body && document.body.style) {
                document.body.style.overflow = '';
            }

            const closeTimer = setTimeout(() => {
                sheet.classList.add('hidden');
                if (typeof exportSheetCloseTimer !== 'undefined') {
                    exportSheetCloseTimer = null;
                }
                sheet._closeTimer = null;
            }, 300);

            if (typeof exportSheetCloseTimer !== 'undefined') {
                exportSheetCloseTimer = closeTimer;
            }
            sheet._closeTimer = closeTimer;

            if (triggerBtn && typeof triggerBtn.focus === 'function') {
                triggerBtn.focus();
            }

            return true;
        }

        function updateActiveNavButtons() {
            const todayBtn = document.getElementById('nav-btn-today');
            const planBtn = document.getElementById('nav-btn-plan');
            const sylBtn = document.getElementById('nav-btn-syllabus');

            const mobToday = document.getElementById('mob-btn-today');
            const mobPlan = document.getElementById('mob-btn-plan');
            const mobSyl = document.getElementById('mob-btn-syllabus');

            [todayBtn, planBtn, sylBtn].forEach(b => {
                if (b) {
                    b.classList.remove('text-blue-600', 'text-[#1B5E43]', 'dark:text-[#52B788]', 'bg-white', 'bg-[#FFFFFF]', 'dark:bg-[#222521]', 'shadow-sm', 'shadow-xs', 'border', 'border-[#D9D2C3]', 'dark:border-[#31342E]');
                    b.classList.add('text-[#474B45]', 'dark:text-[#C4C0B6]');
                }
            });
            [mobToday, mobPlan, mobSyl].forEach(b => {
                if (b) {
                    b.classList.remove('text-blue-600', 'text-[#1B5E43]', 'dark:text-[#52B788]');
                    b.classList.add('text-[#6E726A]', 'dark:text-[#918D83]');
                }
            });

            if (currentView === 'today') {
                todayBtn?.classList.remove('text-[#474B45]', 'dark:text-[#C4C0B6]');
                todayBtn?.classList.add('text-[#1B5E43]', 'dark:text-[#52B788]', 'bg-[#FFFFFF]', 'dark:bg-[#222521]', 'shadow-xs');
                mobToday?.classList.remove('text-[#6E726A]', 'dark:text-[#918D83]');
                mobToday?.classList.add('text-[#1B5E43]', 'dark:text-[#52B788]');
            } else if (currentView === 'plan') {
                planBtn?.classList.remove('text-[#474B45]', 'dark:text-[#C4C0B6]');
                planBtn?.classList.add('text-[#1B5E43]', 'dark:text-[#52B788]', 'bg-[#FFFFFF]', 'dark:bg-[#222521]', 'shadow-xs');
                mobPlan?.classList.remove('text-[#6E726A]', 'dark:text-[#918D83]');
                mobPlan?.classList.add('text-[#1B5E43]', 'dark:text-[#52B788]');
            } else if (currentView === 'syllabus') {
                sylBtn?.classList.remove('text-[#474B45]', 'dark:text-[#C4C0B6]');
                sylBtn?.classList.add('text-[#1B5E43]', 'dark:text-[#52B788]', 'bg-[#FFFFFF]', 'dark:bg-[#222521]', 'shadow-xs');
                mobSyl?.classList.remove('text-[#6E726A]', 'dark:text-[#918D83]');
                mobSyl?.classList.add('text-[#1B5E43]', 'dark:text-[#52B788]');
            }
        }

        async function resetApp() {
            const confirmed = await showAppConfirm({
                title: "Reset Study Plan?",
                message: "Are you sure you want to reset your study plan and start fresh? All checkmarks and completed targets on this device will be cleared.",
                icon: "fa-triangle-exclamation text-rose-500",
                confirmText: "Reset Everything",
                cancelText: "Keep My Plan",
                isDestructive: true
            });
            if (!confirmed) return;

            // Generate immutable pre-reset archive before wiping appState & storage
            let preResetSnapshot = null;
            const hasPlanTasks = !!(
                appState &&
                Array.isArray(appState.plan) &&
                appState.plan.some(d => Array.isArray(d.tasks) && d.tasks.length > 0)
            );

            if (hasPlanTasks) {
                preResetSnapshot = {
                    state: JSON.parse(JSON.stringify(appState)),
                    resetAt: new Date().toISOString(),
                    formattedTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    formattedDate: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
                    stream: appState.stream,
                    grade: appState.grade,
                    completedCount: appState.plan.flatMap(d => d.tasks || []).filter(t => t.completed).length,
                    totalCount: appState.plan.flatMap(d => d.tasks || []).filter(t => !t.isRevision && !t.isExamEveTask).length,
                    userEmail: (typeof currentUser !== 'undefined' && currentUser?.email) || null,
                    ownerUid: (typeof currentUser !== 'undefined' && currentUser?.uid) || null
                };
                try {
                    localStorage.setItem('mpt_pre_reset_snapshot', JSON.stringify(preResetSnapshot));
                } catch (storageErr) {
                    console.warn("Could not write pre-reset snapshot to localStorage:", storageErr);
                }
            }

            try {
                if (accountSync) {
                    accountSync.stop();
                    accountSync.clear();
                    accountSync = null;
                }
                // 1. If signed in, archive to Firestore user_archives and clear active plan document
                if (typeof currentUser !== 'undefined' && currentUser && typeof db !== 'undefined' && db) {
                    if (preResetSnapshot) {
                        await db.collection('user_archives').doc(currentUser.uid).set(getFirestoreCleanData(preResetSnapshot));
                    }
                    await db.collection('users').doc(currentUser.uid).delete();
                }
            } catch(e) {
                console.warn("Cloud reset archive note:", e);
            }

            // 2. Clear local storage
            localStorage.removeItem('plusTwoMissionState_v2');
            localStorage.removeItem('plusTwoPlanState');
            localStorage.removeItem('has_seen_auth_modal');
            localStorage.removeItem('mpt_has_opened');
            if (authModalTimer) {
                clearTimeout(authModalTimer);
                authModalTimer = null;
            }

            // 3. Reset in-memory state and re-render setup screen
            appState = null;
            selectedStream = 'cs';
            activeSyllabusStream = null;
            activeSyllabusGrade = null;
            selectedCompletedChapters.clear();
            currentView = 'today';
            showAppToast("Study plan reset. Ready to start fresh!", "fa-rotate text-blue-400");
            renderApp();
            if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        let setupPersonalization = {
            subjectConfidence: {}, // e.g. { 'Physics': 'focus' }
            weeklyRhythm: 'balanced', // 'balanced' | 'weekend_booster' | 'rest_day'
            restDayOfWeek: 0, // 0 = Sunday, 5 = Friday
            dailyHours: 3.5
        };

        function setSubjectConfidence(sub, level) {
            setupPersonalization.subjectConfidence[sub] = level;
            const subSafe = sub.replace(/\s+/g, '-');
            ['focus', 'standard', 'strong'].forEach(lvl => {
                const btn = document.getElementById(`conf-btn-${subSafe}-${lvl}`);
                if (btn) {
                    if (lvl === level) {
                        if (lvl === 'focus') {
                            btn.className = 'py-1 px-2 text-xs font-bold rounded-lg bg-[#B8432E] dark:bg-[#E57A65] text-white dark:text-[#141513] transition';
                        } else if (lvl === 'strong') {
                            btn.className = 'py-1 px-2 text-xs font-bold rounded-lg bg-[#2F486D] dark:bg-[#8BA7CE] text-white dark:text-[#141513] transition';
                        } else {
                            btn.className = 'py-1 px-2 text-xs font-bold rounded-lg bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] transition';
                        }
                    } else {
                        btn.className = 'py-1 px-2 text-xs font-semibold rounded-lg bg-transparent text-[#474B45] dark:text-[#C4C0B6] hover:bg-[#FBF9F4] dark:hover:bg-[#222521] transition';
                    }
                }
            });
            // Also re-render rows to update priority tag
            const container = document.getElementById('personalization-subjects-container');
            if (container) {
                container.innerHTML = renderPersonalizationSubjectRows();
            }
        }

        function renderPersonalizationSubjectRows() {
            const isML = getAppLanguage() === 'ml';
            const subs = getStreamSubjects(selectedStream);
            const priorityText = isML ? 'പ്രധാനപ്പെട്ടത്' : 'High Priority';
            const fastText = isML ? 'വേഗത്തിൽ' : 'Fast Paced';
            return subs.map(sub => {
                const currentConf = setupPersonalization.subjectConfidence[sub] || 'standard';
                const subSafe = sub.replace(/\s+/g, '-');
                return `
                    <div class="flex flex-col xs:flex-row xs:items-center justify-between gap-1.5 p-2.5 bg-[#FFFFFF] dark:bg-[#222521] rounded-xl border border-[#D9D2C3] dark:border-[#31342E]">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-[#181B18] dark:text-[#EFECE4]">${sub}</span>
                            ${currentConf === 'focus' ? `<span class="text-xs font-mono font-bold uppercase tracking-wider text-[#B8432E] dark:text-[#E57A65] bg-[#F9E9E5] dark:bg-[rgba(229,122,101,0.14)] px-1.5 py-0.5 rounded border border-[#E8B4A9] dark:border-[rgba(229,122,101,0.3)]">${priorityText}</span>` : (currentConf === 'strong' ? `<span class="text-xs font-mono font-bold uppercase tracking-wider text-[#1B5E43] dark:text-[#52B788] bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] px-1.5 py-0.5 rounded border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)]">${fastText}</span>` : '')}
                        </div>
                        <div class="flex items-center gap-1 bg-[#EDE8DC] dark:bg-[#181A17] p-1 rounded-xl border border-[#D9D2C3] dark:border-[#31342E] self-start xs:self-auto">
                            <button type="button" id="conf-btn-${subSafe}-focus" onclick="setSubjectConfidence('${sub}', 'focus')" class="py-1 px-2 text-xs ${currentConf === 'focus' ? 'font-bold bg-[#B8432E] dark:bg-[#E57A65] text-white dark:text-[#141513]' : 'font-semibold bg-transparent text-[#474B45] dark:text-[#C4C0B6] hover:bg-[#FBF9F4] dark:hover:bg-[#222521]'} rounded-lg transition" title="Needs extra practice & prioritized in daily rotation">
                                Focus
                            </button>
                            <button type="button" id="conf-btn-${subSafe}-standard" onclick="setSubjectConfidence('${sub}', 'standard')" class="py-1 px-2 text-xs ${currentConf === 'standard' ? 'font-bold bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513]' : 'font-semibold bg-transparent text-[#474B45] dark:text-[#C4C0B6] hover:bg-[#FBF9F4] dark:hover:bg-[#222521]'} rounded-lg transition" title="Standard balanced study pace">
                                Normal
                            </button>
                            <button type="button" id="conf-btn-${subSafe}-strong" onclick="setSubjectConfidence('${sub}', 'strong')" class="py-1 px-2 text-xs ${currentConf === 'strong' ? 'font-bold bg-[#2F486D] dark:bg-[#8BA7CE] text-white dark:text-[#141513]' : 'font-semibold bg-transparent text-[#474B45] dark:text-[#C4C0B6] hover:bg-[#FBF9F4] dark:hover:bg-[#222521]'} rounded-lg transition" title="Confident in concepts & spaced out lighter frequency">
                                Strong
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function setWeeklyRhythmSelection(rhythm, restDay = null) {
            setupPersonalization.weeklyRhythm = rhythm;
            if (restDay !== null) setupPersonalization.restDayOfWeek = restDay;

            const cards = [
                { id: 'rhythm-card-balanced', match: rhythm === 'balanced' },
                { id: 'rhythm-card-weekend', match: rhythm === 'weekend_booster' },
                { id: 'rhythm-card-sunday', match: rhythm === 'rest_day' && setupPersonalization.restDayOfWeek === 0 },
                { id: 'rhythm-card-friday', match: rhythm === 'rest_day' && setupPersonalization.restDayOfWeek === 5 }
            ];

            cards.forEach(c => {
                const el = document.getElementById(c.id);
                if (el) {
                    if (c.match) {
                        el.className = 'cursor-pointer p-3 rounded-2xl border-2 border-[#1B5E43] dark:border-[#52B788] bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] ring-2 ring-[#1B5E43]/20 transition text-left flex flex-col justify-between relative shadow-xs';
                    } else {
                        el.className = 'cursor-pointer p-3 rounded-2xl border-2 border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] hover:border-[#B9B09E] dark:hover:border-[#454940] transition text-left flex flex-col justify-between';
                    }
                }
            });
        }

        function setDailyHoursSelection(hrs) {
            setupPersonalization.dailyHours = hrs;
            [2, 3.5, 5].forEach(h => {
                const btn = document.getElementById(`hours-chip-${String(h).replace('.', '_')}`);
                if (btn) {
                    if (h === hrs) {
                        btn.className = 'min-h-[44px] flex-1 py-2.5 px-3 text-xs font-black rounded-xl bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] shadow-xs transition flex flex-col items-center justify-center';
                    } else {
                        btn.className = 'min-h-[44px] flex-1 py-2.5 px-3 text-xs font-semibold rounded-xl bg-[#EDE8DC] dark:bg-[#181A17] text-[#474B45] dark:text-[#C4C0B6] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#E4EFE9] transition flex flex-col items-center justify-center';
                    }
                }
            });
        }

        function getPersonalizationConfig(activeImpSubjects = []) {
            const weights = {};
            const subs = getStreamSubjects(selectedStream);
            subs.forEach(s => {
                weights[s] = 1.0;
            });
            if (Array.isArray(activeImpSubjects) && activeImpSubjects.length > 0) {
                activeImpSubjects.forEach(s => {
                    weights[s] = 1.4;
                });
            }

            return {
                subjectWeights: weights,
                subjectConfidence: {},
                weeklyRhythm: setupPersonalization.weeklyRhythm || 'balanced',
                restDayOfWeek: (setupPersonalization.weeklyRhythm === 'rest_day') ? (setupPersonalization.restDayOfWeek ?? 0) : null,
                dailyHours: setupPersonalization.dailyHours || 3.5
            };
        }

        let selectedGrade = '+2'; // '+2' or '+1'
        let selectedStream = 'cs'; // default: 'cs', 'bio', 'commerce', 'humanities', or 'imp_only'
        let activeSetupSubjectTab = 'Physics';
        let activeSetupGradeTab = '+2'; // '+2' or '+1'
        const selectedCompletedChapters = new Set();
        function setGradeSelection(grade) {
            try {
                if (typeof playTapSound === 'function' && (typeof getUserSetting !== 'function' || getUserSetting('sound', true))) {
                    playTapSound();
                }
            } catch (_) {}
            selectedGrade = grade === '+1' ? '+1' : '+2';
            activeSetupGradeTab = selectedGrade;
            selectedCompletedChapters.clear();
            renderApp();
        }

        // getStreamSubjects imported from ./engine/planner.js

        function setStreamSelection(stream) {
            try {
                if (typeof playTapSound === 'function' && (typeof getUserSetting !== 'function' || getUserSetting('sound', true))) {
                    playTapSound();
                }
            } catch (_) {}
            selectedStream = stream;
            selectedCompletedChapters.clear();
            const subs = getStreamSubjects(stream);
            activeSetupGradeTab = selectedGrade || '+2';
            activeSetupSubjectTab = subs[0];
            renderApp();
            goToSetupStep(1);
            document.getElementById(`stream-card-${stream}`)?.focus();
        }

        function updateTermCardsDescriptions() {
            const desc1 = document.getElementById('term-desc-1');
            const desc2 = document.getElementById('term-desc-2');
            const desc3 = document.getElementById('term-desc-3');
            const isML = getAppLanguage() === 'ml';
            if (isML) {
                if (desc1) desc1.innerText = selectedStream === 'bio' ? ML_I18N.setup.term1DescBio : ML_I18N.setup.term1DescCs;
                if (desc2) desc2.innerText = selectedStream === 'bio' ? ML_I18N.setup.term2DescBio : ML_I18N.setup.term2DescCs;
                if (desc3) desc3.innerText = selectedStream === 'bio' ? ML_I18N.setup.term3DescBio : ML_I18N.setup.term3DescCs;
            } else {
                if (selectedStream === 'bio') {
                    if (desc1) desc1.innerText = 'Onam Exams (~18 chapters). Rapid short-term focus.';
                    if (desc2) desc2.innerText = 'Complete pre-Christmas portion (~35 chaps) before model exams.';
                    if (desc3) desc3.innerText = 'All 49 rationalized chapters (Term 1 + 2 + 3) for Public Exams.';
                } else if (selectedStream === 'commerce') {
                    if (desc1) desc1.innerText = 'Onam Exams (~15 chapters). Rapid short-term focus.';
                    if (desc2) desc2.innerText = 'Complete pre-Christmas portion (~29 chaps) before model exams.';
                    if (desc3) desc3.innerText = 'All 44 rationalized chapters (Term 1 + 2 + 3) for Public Exams.';
                } else if (selectedStream === 'humanities') {
                    if (desc1) desc1.innerText = 'Onam Exams (~18 chapters). Rapid short-term focus.';
                    if (desc2) desc2.innerText = 'Complete pre-Christmas portion (~34 chaps) before model exams.';
                    if (desc3) desc3.innerText = 'All 52 rationalized chapters (Term 1 + 2 + 3) for Public Exams.';
                } else {
                    if (desc1) desc1.innerText = 'Onam Exams (~17 chapters). Rapid short-term focus.';
                    if (desc2) desc2.innerText = 'Complete pre-Christmas portion (~31 chaps) before model exams.';
                    if (desc3) desc3.innerText = 'All 46 rationalized chapters (Term 1 + 2 + 3) for Public Exams.';
                }
            }
        }

        function renderSetupSubjectTabs() {
            let subs = getStreamSubjects(selectedStream);

            if (!subs.includes(activeSetupSubjectTab) && subs.length > 0) {
                activeSetupSubjectTab = subs[0];
            }
            return subs.map(sub => `
                <button type="button" id="setup-tab-${sub.replace(/\s+/g, '-')}" onclick="switchSetupSubject('${sub}')" class="min-h-[44px] py-2 px-3 text-xs font-bold rounded-xl ${sub === activeSetupSubjectTab ? 'bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] shadow-xs' : 'bg-[#EDE8DC] dark:bg-[#1B1D1A] text-[#474B45] dark:text-[#C4C0B6] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#E4EFE9]'} transition flex items-center justify-center">
                    ${sub}
                </button>
            `).join('');
        }

        function switchSetupGrade(grade) {
            activeSetupGradeTab = grade;
            updateSetupTabsUI();
            const container = document.getElementById('setup-subject-chapters-list');
            if (container) {
                container.innerHTML = renderSetupSubjectChapters(activeSetupSubjectTab, activeSetupGradeTab);
            }
        }

        function switchSetupSubject(sub) {
            activeSetupSubjectTab = sub;
            updateSetupTabsUI();
            const container = document.getElementById('setup-subject-chapters-list');
            if (container) {
                container.innerHTML = renderSetupSubjectChapters(activeSetupSubjectTab, activeSetupGradeTab);
            }
        }

        function updateSetupTabsUI() {
            const btnP2 = document.getElementById('grade-tab-p2');
            const btnP1 = document.getElementById('grade-tab-p1');
            if (btnP2 && btnP1) {
                if (activeSetupGradeTab === '+2') {
                    btnP2.className = 'min-h-[44px] flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] shadow-xs transition flex items-center justify-center gap-1.5';
                    btnP1.className = 'min-h-[44px] flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-[#EDE8DC] dark:bg-[#1B1D1A] text-[#474B45] dark:text-[#C4C0B6] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#E4EFE9] transition flex items-center justify-center gap-1.5';
                } else {
                    btnP1.className = 'min-h-[44px] flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-[#9C6418] dark:bg-[#DFAC54] text-white dark:text-[#141513] shadow-xs transition flex items-center justify-center gap-1.5';
                    btnP2.className = 'min-h-[44px] flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-[#EDE8DC] dark:bg-[#1B1D1A] text-[#474B45] dark:text-[#C4C0B6] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#F6EEDC] transition flex items-center justify-center gap-1.5';
                }
            }

            getStreamSubjects(selectedStream).forEach(s => {
                const btn = document.getElementById(`setup-tab-${s.replace(/\s+/g, '-')}`);
                if (btn) {
                    if (s === activeSetupSubjectTab) {
                        btn.className = 'min-h-[44px] py-2 px-3 text-xs font-bold rounded-xl bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] shadow-xs transition flex items-center justify-center';
                    } else {
                        btn.className = 'min-h-[44px] py-2 px-3 text-xs font-bold rounded-xl bg-[#EDE8DC] dark:bg-[#1B1D1A] text-[#474B45] dark:text-[#C4C0B6] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#E4EFE9] transition flex items-center justify-center';
                    }
                }
            });
        }

        function toggleChapterSelection(chapId, isChecked) {
            if (isChecked) {
                selectedCompletedChapters.add(chapId);
            } else {
                selectedCompletedChapters.delete(chapId);
            }
            updateCompletedChaptersCountBadge();
        }

        function toggleAllSubjectChapters(grade, sub, shouldCheck) {
            const sourceSyllabus = grade === '+1' ? PLUS_ONE_SYLLABUS : PLUS_TWO_SYLLABUS;
            const chaps = sourceSyllabus.filter(t => t.subject === sub);
            const uniqueChaps = [...new Map(chaps.map(item => [item.chapId, item])).values()];

            uniqueChaps.forEach(ch => {
                if (shouldCheck) {
                    selectedCompletedChapters.add(ch.chapId);
                } else {
                    selectedCompletedChapters.delete(ch.chapId);
                }
            });

            // Re-render current list so checked styling and state are updated
            const container = document.getElementById('setup-subject-chapters-list');
            if (container) {
                container.innerHTML = renderSetupSubjectChapters(activeSetupSubjectTab, activeSetupGradeTab);
            }
            updateCompletedChaptersCountBadge();
        }

        function updateCompletedChaptersCountBadge() {
            const badge = document.getElementById('completed-chaps-badge');
            if (!badge) return;
            const isML = getAppLanguage() === 'ml';
            const p2Count = Array.from(selectedCompletedChapters).filter(id => id.startsWith('+2_')).length;
            const p1Count = Array.from(selectedCompletedChapters).filter(id => id.startsWith('+1_')).length;
            const total = selectedCompletedChapters.size;
            if (total === 0) {
                badge.innerHTML = isML ? '0 പൂർത്തിയായി' : '0 completed';
                badge.className = 'text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#EDE8DC] dark:bg-[#181A17] text-[#6E726A] dark:text-[#918D83] border border-[#D9D2C3] dark:border-[#31342E]';
            } else {
                badge.innerHTML = isML
                    ? `<span class="inline-flex items-center gap-1"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>${total} പൂർത്തിയായി (${p2Count} +2, ${p1Count} +1)</span>`
                    : `<span class="inline-flex items-center gap-1"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>${total} completed (${p2Count} in +2, ${p1Count} in +1)</span>`;
                badge.className = 'text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] text-[#1B5E43] dark:text-[#52B788] border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)]';
            }
        }

        function renderSetupSubjectChapters(subject, grade = activeSetupGradeTab) {
            const isML = getAppLanguage() === 'ml';
            const sourceSyllabus = grade === '+1' ? PLUS_ONE_SYLLABUS : PLUS_TWO_SYLLABUS;
            const chaps = sourceSyllabus.filter(t => t.subject === subject);
            const uniqueChaps = [...new Map(chaps.map(item => [item.chapId, item])).values()];
            const markedCount = uniqueChaps.filter(c => selectedCompletedChapters.has(c.chapId)).length;
            const completedText = isML ? `(${markedCount}/${uniqueChaps.length} പൂർത്തിയായി)` : `(${markedCount}/${uniqueChaps.length} completed)`;
            const selectAllText = isML ? 'എല്ലാം തിരഞ്ഞെടുക്കുക' : 'Select All';
            const clearText = isML ? 'ഒഴിവാക്കുക' : 'Clear';
            const studyPartsLabel = isML ? 'പഠന ഭാഗങ്ങൾ' : 'study parts';

            let html = `
                <div class="flex items-center justify-between pb-2 mb-2.5 border-b border-[#D9D2C3] dark:border-[#31342E] flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-[#181B18] dark:text-[#EFECE4]">
                            ${grade === '+1' ? '<span class="text-[#9C6418] dark:text-[#DFAC54] font-mono font-bold bg-[#F6EEDC] dark:bg-[rgba(223,172,84,0.14)] px-2 py-0.5 rounded border border-[#DEC59A] dark:border-[rgba(223,172,84,0.3)]">Class 11 (+1)</span>' : '<span class="text-[#1B5E43] dark:text-[#52B788] font-mono font-bold bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] px-2 py-0.5 rounded border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)]">Class 12 (+2)</span>'} • ${subject}
                        </span>
                        <span class="text-xs font-mono text-[#6E726A] dark:text-[#918D83]">${completedText}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="toggleAllSubjectChapters('${grade}', '${subject}', true)" class="min-h-[44px] inline-flex items-center text-xs font-bold text-[#1B5E43] dark:text-[#52B788] hover:underline px-1.5 cursor-pointer">${selectAllText}</button>
                        <span class="text-[#D9D2C3] dark:text-[#31342E]">|</span>
                        <button type="button" onclick="toggleAllSubjectChapters('${grade}', '${subject}', false)" class="min-h-[44px] inline-flex items-center text-xs font-bold text-[#6E726A] dark:text-[#918D83] hover:underline px-1.5 cursor-pointer">${clearText}</button>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
            `;

            uniqueChaps.forEach(ch => {
                const isChecked = selectedCompletedChapters.has(ch.chapId);
                html += `
                    <label class="min-h-[44px] flex items-center gap-2.5 p-2.5 rounded-xl ${isChecked ? 'bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)]' : 'bg-[#FFFFFF] dark:bg-[#222521] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] border-[#D9D2C3] dark:border-[#31342E]'} border cursor-pointer transition text-xs select-none">
                        <input type="checkbox" data-grade="${grade}" data-subject="${subject}" value="${ch.chapId}" ${isChecked ? 'checked' : ''} onchange="toggleChapterSelection('${ch.chapId}', this.checked); this.closest('label').classList.toggle('bg-[#E4EFE9]', this.checked); this.closest('label').classList.toggle('border-[#9DC3B2]', this.checked); this.closest('label').classList.toggle('bg-[#FFFFFF]', !this.checked); this.closest('label').classList.toggle('border-[#D9D2C3]', !this.checked);" class="completed-chapter-cb mt-0.5 rounded border-[#B9B09E] dark:border-[#454940] text-[#1B5E43] dark:text-[#52B788] focus:ring-[#1B5E43] w-4 h-4 accent-[#1B5E43]">
                        <div class="flex-1 truncate">
                            <span class="font-bold text-[#181B18] dark:text-[#EFECE4] block truncate" title="${ch.chapterName}">Chapter ${ch.chapNumber}: ${ch.chapterName.replace(/^Chapter\s+\d+:\s*/i, '').replace(/^\d+\.\s*/, '')}</span>
                            <span class="text-[11px] font-mono text-[#6E726A] dark:text-[#918D83]">Term ${ch.term} • ${ch.totalParts} ${studyPartsLabel}</span>
                        </div>
                    </label>
                `;
            });

            html += `</div>`;
            return html;
        }

        function setTermSelection(termNum) {
            const input = document.getElementById('target-term');
            if (input) input.value = termNum;
            [1, 2, 3].forEach(n => {
                const card = document.getElementById(`term-card-${n}`);
                if (card) {
                    const checkIcon = card.querySelector('.check-indicator');
                    if (n === termNum) {
                        card.className = 'cursor-pointer p-3.5 sm:p-4 rounded-2xl border-2 border-[#1B5E43] dark:border-[#52B788] bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] ring-2 ring-[#1B5E43]/20 transition text-left flex flex-col justify-between relative shadow-xs';
                        if (checkIcon) {
                            checkIcon.className = 'w-4 h-4 rounded-full bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] flex items-center justify-center text-xs check-indicator';
                            checkIcon.innerHTML = '<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
                        }
                    } else {
                        card.className = 'cursor-pointer p-3.5 sm:p-4 rounded-2xl border-2 border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] hover:border-[#B9B09E] dark:hover:border-[#454940] transition text-left flex flex-col justify-between';
                        if (checkIcon) {
                            checkIcon.className = 'w-4 h-4 rounded-full border border-[#D9D2C3] dark:border-[#31342E] flex items-center justify-center check-indicator';
                            checkIcon.innerHTML = '';
                        }
                    }
                }
            });
        }

        function getPresetDate(month, day, nextYear = false) {
            let now = new Date();
            let year = now.getFullYear();
            if (nextYear) year += 1;
            const mStr = String(month).padStart(2, '0');
            const dStr = String(day).padStart(2, '0');
            return `${year}-${mStr}-${dStr}`;
        }

        function getRelativePresetDate(daysAhead = 30) {
            const now = new Date();
            now.setDate(now.getDate() + daysAhead);
            return formatLocalDateStr(now);
        }

        let selectedExamCycle = null;

        function renderOfficialSetupTimetablePreview(deadlineVal) {
            const box = document.getElementById('setup-official-timetable-preview');
            if (!box || typeof getOfficialExamSchedule !== 'function') return;
            const isML = getAppLanguage() === 'ml';
            const grade = typeof selectedGrade !== 'undefined' ? selectedGrade : '+2';
            const stream = typeof selectedStream !== 'undefined' ? selectedStream : 'cs';
            const cycle = selectedExamCycle && DHSE_EXAM_CYCLES[selectedExamCycle]
                ? selectedExamCycle
                : detectExamCycleForDeadline(deadlineVal);

            if (!cycle || cycle === 'custom' || !DHSE_EXAM_CYCLES[cycle]) {
                box.innerHTML = '';
                box.classList.add('hidden');
                return;
            }

            const cycleMeta = DHSE_EXAM_CYCLES[cycle];
            const events = getOfficialExamSchedule({ grade, stream, examCycle: cycle, includeLanguages: true });
            if (!events.length) {
                box.innerHTML = '';
                box.classList.add('hidden');
                return;
            }

            box.classList.remove('hidden');
            const rowsHtml = events.map(ev => `
                <div class="flex items-center justify-between gap-2 py-1.5 border-b border-[#D9D2C3]/70 dark:border-[#31342E] last:border-0 text-[11px]">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="font-mono font-bold text-[#1B5E43] dark:text-[#52B788] shrink-0">${ev.date.slice(5)} (${ev.dayName})</span>
                        <span class="font-bold text-[#181B18] dark:text-[#EFECE4] truncate">${escapeStudyText(ev.paperTitle)}</span>
                    </div>
                    <span class="px-1.5 py-0.5 rounded font-mono bg-[#EDE8DC] dark:bg-[#181A17] text-[#474B45] dark:text-[#C4C0B6] font-bold shrink-0">${ev.session} · ${ev.time}</span>
                </div>
            `).join('');

            box.innerHTML = `
                <div class="p-3 rounded-2xl bg-[#FFFFFF] dark:bg-[#181A17] border border-[#D9D2C3] dark:border-[#31342E] text-left">
                    <div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <span class="text-xs font-bold text-[#181B18] dark:text-[#EFECE4] flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
                            <span>${isML ? `${cycleMeta.mlName} (${grade})` : `Official DHSE ${cycleMeta.shortName} (${grade})`}</span>
                        </span>
                        <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] text-[#1B5E43] dark:text-[#52B788] border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)]">${cycleMeta.startDate.slice(5)} → ${cycleMeta.endDate.slice(5)}</span>
                    </div>
                    <div class="max-h-40 overflow-y-auto pr-1">${rowsHtml}</div>
                    ${cycleMeta.isTentativeSubjectOrder ? `<p class="text-[10px] text-[#9C6418] dark:text-[#DFAC54] mt-1.5 font-semibold">${isML ? 'ഔദ്യോഗിക വിൻഡോ Feb 11–24. വിഷയ ക്രമം സ്കൂൾ സർക്കുലർ അനുസരിച്ച് പരിശോധിക്കുക.' : 'Official window Feb 11–24, 2027 · Subject slots follow DHSE group order (verify school notice).'}</p>` : ''}
                </div>
            `;
        }

        function updatePresetButtonsUI(currentVal) {
            const input = document.getElementById('deadline-date');
            const val = currentVal || (input ? input.value : '');
            const officialPresets = typeof getOfficialExamPresets === 'function' ? getOfficialExamPresets() : null;
            const presets = [
                { id: 'preset-btn-xmas', date: officialPresets?.christmas?.date || DHSE_EXAM_CYCLES.christmas.endDate },
                { id: 'preset-btn-model', date: officialPresets?.model?.date || DHSE_EXAM_CYCLES.model.endDate },
                { id: 'preset-btn-board', date: officialPresets?.public?.date || DHSE_EXAM_CYCLES.public.endDate },
                { id: 'preset-btn-30', date: officialPresets?.sprint?.date || getRelativePresetDate(30) }
            ];

            presets.forEach(p => {
                const btn = document.getElementById(p.id);
                if (!btn) return;
                const isSelected = (val === p.date);
                btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
                if (isSelected) {
                    btn.className = 'preset-date-btn min-h-[44px] py-2.5 px-3 rounded-xl bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] font-bold border-2 border-[#1B5E43] dark:border-[#52B788] ring-2 ring-[#1B5E43]/20 transition-all duration-150 flex flex-col items-center justify-center text-center gap-1 active:scale-95 cursor-pointer';
                    const iconEl = btn.querySelector('svg');
                    if (iconEl) iconEl.style.color = 'currentColor';
                    const sub = btn.querySelector('.preset-sub');
                    if (sub) sub.className = 'preset-sub text-[10px] font-mono opacity-85 font-medium';
                } else {
                    btn.className = 'preset-date-btn min-h-[44px] py-2.5 px-3 rounded-xl bg-[#FFFFFF] dark:bg-[#222521] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] text-[#181B18] dark:text-[#EFECE4] text-xs font-bold border border-[#D9D2C3] dark:border-[#31342E] transition-all duration-150 flex flex-col items-center justify-center text-center gap-1 active:scale-95 cursor-pointer';
                    const iconEl = btn.querySelector('svg');
                    if (iconEl) iconEl.style.color = '';
                    const sub = btn.querySelector('.preset-sub');
                    if (sub) sub.className = 'preset-sub text-[10px] font-mono text-[#6E726A] dark:text-[#918D83] font-medium';
                }
            });
        }

        function setDeadlinePreset(dateStr, termScope = null, examCycle = null) {
            try {
                if (typeof playTapSound === 'function' && (typeof getUserSetting !== 'function' || getUserSetting('sound', true))) {
                    playTapSound();
                }
            } catch (_) {}
            selectedExamCycle = examCycle || (typeof detectExamCycleForDeadline === 'function' ? detectExamCycleForDeadline(dateStr) : null);
            if (termScope && typeof setTermSelection === 'function') {
                setTermSelection(termScope);
            }
            const input = document.getElementById('deadline-date');
            if (input) {
                input.value = dateStr;
                updateDeadlinePreview();
            }
            updatePresetButtonsUI(dateStr);
        }

        function updateDeadlinePreview() {
            const input = document.getElementById('deadline-date');
            const label = document.getElementById('deadline-calc-label');
            if (!input || !label) return;
            selectedExamCycle = typeof detectExamCycleForDeadline === 'function' ? detectExamCycleForDeadline(input.value) : null;
            updatePresetButtonsUI(input.value);
            renderOfficialSetupTimetablePreview(input.value);
            const isML = getAppLanguage() === 'ml';
            const smartStart = typeof getSmartStartDate === 'function' ? getSmartStartDate() : { startDate: TODAY_STR, isLateEvening: false };
            const effectiveStart = smartStart.startDate;
            const days = calculateDaysBetween(effectiveStart, input.value);
            if (!Number.isFinite(days) || days <= 0) {
                label.innerHTML = isML
                    ? '<span class="text-[#B8432E] dark:text-[#E57A65] font-bold flex items-center gap-1.5"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> തിരഞ്ഞെടുത്ത തീയതി കഴിഞ്ഞുപോയി! ഭാവിയിലെ തീയതി നൽകുക.</span>'
                    : '<span class="text-[#B8432E] dark:text-[#E57A65] font-bold flex items-center gap-1.5"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Selected date has passed! Please select a future target date.</span>';
            } else {
                let revDays = 0;
                if (days >= 75) revDays = 10;
                else if (days >= 45) revDays = 7;
                else if (days >= 25) revDays = 4;
                else if (days >= 14) revDays = 2;
                else if (days >= 7) revDays = 1;
                const cycleMeta = selectedExamCycle && DHSE_EXAM_CYCLES[selectedExamCycle] ? DHSE_EXAM_CYCLES[selectedExamCycle] : null;
                if (cycleMeta && effectiveStart < cycleMeta.startDate && input.value >= cycleMeta.startDate) {
                    const preExamDays = calculateDaysBetween(effectiveStart, cycleMeta.startDate);
                    const winDays = (days + 1) - preExamDays;
                    if (preExamDays >= 4 && winDays > revDays) revDays = winDays;
                }
                const studyDays = Math.max(1, days - revDays);
                const nightBadge = smartStart.isLateEvening ? `
                    <div class="mt-2 text-[11px] text-[#9C6418] dark:text-[#DFAC54] font-semibold bg-[#F6EEDC] dark:bg-[rgba(223,172,84,0.14)] p-2 rounded-xl border border-[#DEC59A] dark:border-[rgba(223,172,84,0.3)] flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                        <span>${isML ? 'രാത്രി വൈകി: ആദ്യ ദിന പഠനം നാളെ രാവിലെ മുതൽ ആരംഭിക്കുന്നു' : 'Late evening: Day 1 study runway starts fresh tomorrow morning'}</span>
                    </div>
                ` : '';
                label.innerHTML = isML ? `
                    <div class="flex flex-wrap items-center justify-between gap-1.5">
                        <span class="font-bold text-[#181B18] dark:text-[#EFECE4] flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/></svg>
                            <span><strong class="font-mono">${days}</strong> ദിവസങ്ങൾ ലഭ്യമാണ്</span>
                        </span>
                        <span class="text-[#2F486D] dark:text-[#8BA7CE] font-mono font-bold bg-[#E7ECF3] dark:bg-[rgba(139,167,206,0.14)] border border-[#A6B8CE] dark:border-[rgba(139,167,206,0.3)] px-2 py-0.5 rounded-md text-xs inline-flex items-center gap-1">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>${revDays} ദിവസങ്ങൾ റിവിഷൻ & പരീക്ഷാ തയ്യാറെടുപ്പിന്
                        </span>
                    </div>
                    <div class="text-xs text-[#474B45] dark:text-[#C4C0B6] mt-1.5">
                        ${studyDays} ദിവസത്തെ സിലബസ് പഠനം. ഔദ്യോഗിക DHSE പരീക്ഷാ തീയതികൾക്കനുസരിച്ച് അവസാന ${revDays} ദിവസങ്ങൾ റിവിഷനും പരീക്ഷത്തലേന്ന് പഠനവും ക്രമീകരിക്കും.
                    </div>
                    ${nightBadge}
                ` : `
                    <div class="flex flex-wrap items-center justify-between gap-1.5">
                        <span class="font-bold text-[#181B18] dark:text-[#EFECE4] flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/></svg>
                            <span><strong class="font-mono">${days}</strong> calendar days available</span>
                        </span>
                        <span class="text-[#2F486D] dark:text-[#8BA7CE] font-mono font-bold bg-[#E7ECF3] dark:bg-[rgba(139,167,206,0.14)] border border-[#A6B8CE] dark:border-[rgba(139,167,206,0.3)] px-2 py-0.5 rounded-md text-xs inline-flex items-center gap-1">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>${revDays} days reserved for Exam-Eve & Revision
                        </span>
                    </div>
                    <div class="text-xs text-[#474B45] dark:text-[#C4C0B6] mt-1.5">
                        ${studyDays} syllabus study days${cycleMeta ? ` before ${cycleMeta.shortName} begins (${cycleMeta.startDate})` : ''}. Official DHSE exam dates & exam-eve sprints are mapped automatically.
                    </div>
                    ${nightBadge}
                `;
            }
        }

        function animatePlanGeneration(options = {}, onComplete) {
            const overlay = document.getElementById('plan-generation-overlay');
            if (!overlay) {
                if (typeof onComplete === 'function') onComplete();
                return;
            }

            const isML = getAppLanguage() === 'ml';
            const isRebalance = options.mode === 'rebalance';
            const isLateEvening = Boolean(options.isLateEvening);

            const headingEl = document.getElementById('plan-gen-heading');
            const subheadingEl = document.getElementById('plan-gen-subheading');
            const progressBar = document.getElementById('plan-gen-progress-bar');
            const stageLabel = document.getElementById('plan-gen-stage-label');
            const percentageEl = document.getElementById('plan-gen-percentage');
            const iconEl = document.getElementById('plan-gen-icon');
            const nightNotice = document.getElementById('plan-gen-night-notice');
            const nightText = document.getElementById('plan-gen-night-notice-text');

            if (nightNotice && nightText) {
                if (isLateEvening) {
                    nightNotice.classList.remove('hidden');
                    nightText.innerText = isML
                        ? "🌙 രാത്രി വൈകിയതിനാൽ ആദ്യ ദിന പഠനം നാളെ രാവിലെ മുതൽ ചിട്ടപ്പെടുത്തുന്നു."
                        : "🌙 Late evening detected: Scheduling Day 1 starting fresh tomorrow morning.";
                } else {
                    nightNotice.classList.add('hidden');
                }
            }

            // Reset check items to default
            for (let i = 1; i <= 4; i++) {
                const checkEl = document.getElementById(`plan-gen-check-${i}`);
                if (checkEl) {
                    checkEl.className = "flex items-center gap-2.5 text-xs text-[#6E726A] dark:text-[#918D83] transition-colors duration-300";
                    const badge = (typeof checkEl.querySelector === 'function') ? checkEl.querySelector('span') : null;
                    if (badge) {
                        badge.className = "w-5 h-5 rounded-full flex items-center justify-center bg-[#EDE8DC] dark:bg-[#181A17] text-[#6E726A] dark:text-[#918D83] font-mono text-[10px] shrink-0 font-bold";
                        badge.innerHTML = `${i}`;
                    }
                }
            }

            const stages = isRebalance ? [
                {
                    pct: 28,
                    heading: isML ? "പൂർത്തിയായ ഭാഗങ്ങൾ പരിശോധിക്കുന്നു..." : "Auditing Completed Portions...",
                    subheading: isML ? "തീർത്ത അധ്യായങ്ങളും ബാക്കിയുള്ള ടാസ്കുകളും വേർതിരിക്കുന്നു" : "Separating completed checkmarks from pending chapters",
                    icon: "fa-list-check",
                    stageText: isML ? "ഘട്ടം 1 / 4" : "Phase 1 of 4",
                    checkIndex: 1
                },
                {
                    pct: 58,
                    heading: isML ? "ബാക്കിയുള്ള സമയം പുനഃക്രമീകരിക്കുന്നു..." : "Recalculating Remaining Runway...",
                    subheading: isML ? "പരീക്ഷാ തീയതി വരെയുള്ള ശേഷിക്കുന്ന ദിവസങ്ങൾ ക്രമീകരിക്കുന്നു" : "Pacing remaining workload across available study days",
                    icon: "fa-arrows-rotate",
                    stageText: isML ? "ഘട്ടം 2 / 4" : "Phase 2 of 4",
                    checkIndex: 2
                },
                {
                    pct: 85,
                    heading: isML ? "എബ്ബിംഗ്ഹോസ് സ്പേസ്ഡ് റിവിഷൻ ക്രമീകരിക്കുന്നു..." : "Recalibrating Ebbinghaus Spaced Intervals...",
                    subheading: isML ? "ബാക്ക്ലോഗ് ഒഴിവാക്കി മറവി തടയാൻ ഫോർഗെറ്റിംഗ് കർവ് പ്രകാരം റീകോൾ ഉറപ്പാക്കുന്നു" : "Recalculating spaced retrieval intervals to protect retention",
                    icon: "fa-brain",
                    stageText: isML ? "ഘട്ടം 3 / 4" : "Phase 3 of 4",
                    checkIndex: 3
                },
                {
                    pct: 100,
                    heading: isML ? "പുതുക്കിയ ടൈംടേബിൾ റെഡി!" : "Rebalanced Schedule Finalized!",
                    subheading: isML ? "നിങ്ങളുടെ പുതിയ പഠന ഷെഡ്യൂൾ സജ്ജമായി" : "Updated study timeline ready for tomorrow",
                    icon: "fa-circle-check",
                    stageText: isML ? "പൂർത്തിയായി" : "Completed",
                    checkIndex: 4
                }
            ] : [
                {
                    pct: 26,
                    heading: isML ? "സിലബസ് ഘടന പരിശോധിക്കുന്നു..." : "Verifying Syllabus Scope & Blueprints...",
                    subheading: isML ? "SCERT മാർക്ക് വെയിറ്റേജും പ്രധാന ഭാഗങ്ങളും ഉറപ്പുവരുത്തുന്നു" : "Checking chapter marks weightage and core subtopics",
                    icon: "fa-compass-drafting",
                    stageText: isML ? "ഘട്ടം 1 / 4" : "Phase 1 of 4",
                    checkIndex: 1
                },
                {
                    pct: 56,
                    heading: isML ? "പഠന സമയവും ഇടവേളകളും കണക്കാക്കുന്നു..." : "Calculating Study Runway & Capacity...",
                    subheading: isML ? "ദിവസേനയുള്ള പഠന ഭാരവും വിശ്രമ ദിനങ്ങളും ക്രമീകരിക്കുന്നു" : "Optimizing daily workload balance and rest rhythm",
                    icon: "fa-calculator",
                    stageText: isML ? "ഘട്ടം 2 / 4" : "Phase 2 of 4",
                    checkIndex: 2
                },
                {
                    pct: 86,
                    heading: isML ? "എബ്ബിംഗ്ഹോസ് സ്പേസ്ഡ് റിവിഷൻ ചിട്ടപ്പെടുത്തുന്നു..." : "Calibrating Ebbinghaus Spaced Intervals...",
                    subheading: isML ? "മറവി തടയാൻ ഫോർഗെറ്റിംഗ് കർവ് പ്രകാരം റീകോൾ ദിനങ്ങളും പരീക്ഷത്തലേന്നും ഉറപ്പാക്കുന്നു" : "Applying spacing effect to defeat the forgetting curve and lock in retention",
                    icon: "fa-brain",
                    stageText: isML ? "ഘട്ടം 3 / 4" : "Phase 3 of 4",
                    checkIndex: 3
                },
                {
                    pct: 100,
                    heading: isML ? "ടൈംടേബിൾ പൂർത്തിയാക്കുന്നു..." : "Finalizing Daily Study Timetable...",
                    subheading: isML ? "പഠന ഷെഡ്യൂൾ പരിശോധിച്ച് ഉറപ്പുവരുത്തി" : "Daily timeline verified with zero task conflicts",
                    icon: "fa-circle-check",
                    stageText: isML ? "പൂർത്തിയായി" : "Completed",
                    checkIndex: 4
                }
            ];

            // Show overlay
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');

            function applyStage(idx) {
                const s = stages[idx];
                if (!s) return;

                if (headingEl) headingEl.innerText = s.heading;
                if (subheadingEl) subheadingEl.innerText = s.subheading;
                if (progressBar) progressBar.style.width = `${s.pct}%`;
                if (percentageEl) percentageEl.innerText = `${s.pct}%`;
                if (stageLabel) stageLabel.innerHTML = `<span class="inline-flex items-center gap-1.5 font-mono"><svg class="w-3 h-3 text-[#1B5E43] dark:text-[#52B788] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> ${s.stageText}</span>`;
                if (iconEl) iconEl.innerHTML = s.icon === 'fa-circle-check'
                    ? '<svg class="w-6 h-6 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
                    : '<svg class="w-6 h-6 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/></svg>';

                for (let c = 1; c <= s.checkIndex; c++) {
                    const checkEl = document.getElementById(`plan-gen-check-${c}`);
                    if (checkEl) {
                        const isCurrent = c === s.checkIndex && idx < stages.length - 1;
                        checkEl.className = isCurrent
                            ? "flex items-center gap-2.5 text-xs text-[#1B5E43] dark:text-[#52B788] font-bold transition-colors duration-300"
                            : "flex items-center gap-2.5 text-xs text-[#1B5E43] dark:text-[#52B788] font-semibold transition-colors duration-300";
                        const badge = (typeof checkEl.querySelector === 'function') ? checkEl.querySelector('span') : null;
                        if (badge) {
                            if (isCurrent) {
                                badge.className = "w-5 h-5 rounded-full flex items-center justify-center bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] text-[#1B5E43] dark:text-[#52B788] text-[10px] shrink-0 font-bold";
                                badge.innerHTML = `<svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
                            } else {
                                badge.className = "w-5 h-5 rounded-full flex items-center justify-center bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] text-[#1B5E43] dark:text-[#52B788] text-[10px] shrink-0 font-bold";
                                badge.innerHTML = `<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
                            }
                        }
                    }
                }
            }

            applyStage(0);

            setTimeout(() => {
                applyStage(1);
            }, 550);

            setTimeout(() => {
                applyStage(2);
            }, 1150);

            setTimeout(() => {
                applyStage(3);
            }, 1750);

            setTimeout(() => {
                if (typeof onComplete === 'function') {
                    onComplete();
                }
                overlay.classList.add('opacity-0');
                setTimeout(() => {
                    overlay.classList.add('hidden');
                    overlay.classList.remove('flex');
                    overlay.classList.remove('opacity-0');
                }, 300);
            }, 2250);
        }

        function handleInitialSetup() {
            const isML = getAppLanguage() === 'ml';
            const deadlineInput = document.getElementById('deadline-date')?.value;
            const targetTerm = parseInt(document.getElementById('target-term')?.value || "2");
            const studyIntensity = document.getElementById('study-intensity')?.value || 'balanced';

            if (!deadlineInput) {
                showAppAlert({
                    title: "Deadline Required",
                    message: "Please choose your target examination deadline date.",
                    icon: "fa-calendar-days text-blue-500"
                });
                return;
            }

            const smartStart = typeof getSmartStartDate === 'function' ? getSmartStartDate() : { startDate: TODAY_STR, isLateEvening: false };
            const effectiveStartDate = smartStart.startDate;

            const days = calculateDaysBetween(effectiveStartDate, deadlineInput);
            if (days <= 0) {
                showAppAlert({
                    title: "Future Date Required",
                    message: "Please select a target deadline date in the future.",
                    icon: "fa-calendar-xmark text-amber-500"
                });
                return;
            }

            // Collect excluded / already completed chapters
            const checkedCompletedBoxes = Array.from(selectedCompletedChapters);
            const currentGrade = typeof selectedGrade !== 'undefined' ? selectedGrade : '+2';

            const tasksToPlan = getRemainingPlanTasks({
                grade: currentGrade,
                stream: selectedStream,
                targetTerm,
                completedChapterIds: new Set(checkedCompletedBoxes),
            });

            if (tasksToPlan.length === 0) {
                showAppAlert({
                    title: isML ? "എല്ലാ അധ്യായങ്ങളും പൂർത്തിയായി" : "All Chapters Marked Completed",
                    message: isML ? "എല്ലാ അധ്യായങ്ങളും പൂർത്തിയായി എന്ന് അടയാളപ്പെടുത്തിയിരിക്കുന്നു. ഷെഡ്യൂൾ ചെയ്യാൻ കുറഞ്ഞത് ഒരു അധ്യായമെങ്കിലും ടിക്ക് ഒഴിവാക്കുക." : "All chapters in the selected scope were marked completed. Please uncheck at least one chapter to schedule your daily timetable.",
                    icon: "fa-circle-info text-blue-500"
                });
                return;
            }

            animatePlanGeneration({ mode: 'create', isLateEvening: smartStart.isLateEvening }, () => {
                const personalization = getPersonalizationConfig();
                const detectedCycle = typeof detectExamCycleForDeadline === 'function'
                    ? detectExamCycleForDeadline(deadlineInput, typeof selectedExamCycle !== 'undefined' ? selectedExamCycle : null)
                    : 'custom';
                const planResult = buildIntelligentPlan(deadlineInput, tasksToPlan, effectiveStartDate, [], selectedStream, {
                    grade: currentGrade,
                    intensity: studyIntensity,
                    personalization: personalization,
                    examCycle: detectedCycle,
                    useOfficialTimetable: true,
                    alignToOfficialExamWindow: detectedCycle !== 'custom',
                    includeExamEveTasks: true,
                });

                if (planResult && planResult.planDays) {
                    appState = {
                        engineVersion: PLANNER_ENGINE_VERSION,
                        grade: currentGrade,
                        stream: selectedStream,
                        examCycle: planResult.examCycle || detectedCycle,
                        studyIntensity: studyIntensity,
                        personalization: personalization,
                        startDate: effectiveStartDate,
                        deadlineDate: deadlineInput,
                        targetTerm: targetTerm,
                        completedChaptersOnInit: checkedCompletedBoxes,
                        plan: planResult.planDays,
                        revisionDaysCount: planResult.revisionDaysCount,
                        totalConfiguredTasks: tasksToPlan.length,
                        diagnostics: planResult.diagnostics,
                        isLateEveningGenerated: smartStart.isLateEvening,
                        ownerUid: (typeof currentUser !== 'undefined' && currentUser ? currentUser.uid : null),
                        uid: (typeof currentUser !== 'undefined' && currentUser ? currentUser.uid : null),
                        createdAt: new Date().toISOString(),
                        lastModified: new Date().toISOString()
                    };
                    saveAppState();
                    trackAnalyticsEvent('plan_created', {
                        stream: selectedStream,
                        daysTotal: days,
                        tasksCount: tasksToPlan.length
                    });
                    goToDashboard();
                    const isML = getAppLanguage() === 'ml';
                    if (smartStart.isLateEvening) {
                        showAppToast(isML
                            ? "🌙 രാത്രി വൈകിയതിനാൽ ആദ്യ ദിന പഠനം നാളെ രാവിലെ മുതൽ ആരംഭിക്കുന്നു!"
                            : "🌙 Day 1 study begins fresh tomorrow morning! Get good rest tonight.",
                            "fa-moon text-amber-300");
                    } else {
                        showAppToast(isML
                            ? "🎉 നിങ്ങളുടെ വ്യക്തിഗത പഠന പ്ലാൻ തയ്യാറായി! ഒന്നാം ദിനം തുടങ്ങാം!"
                            : "🎉 Your study plan is ready! Let's conquer Day 1!",
                            "fa-rocket text-blue-400");
                    }

                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.removeItem('auth_modal_dismissed');
                    }
                    if (typeof localStorage !== 'undefined') {
                        localStorage.removeItem('has_seen_auth_modal');
                        localStorage.removeItem('has_dismissed_milestone_auth');
                    }
                    if (typeof schedulePostPlanAuthModal === 'function') {
                        schedulePostPlanAuthModal(8000);
                    }
                }
            });
        }

        /* ==========================================================================
           7. REGENERATION / SCHEDULE REBALANCING & DAY NAVIGATION
           ========================================================================== */

        function changeMissionDay(dayNum) {
            if (!appState || !appState.plan) return;
            const target = appState.plan.find(d => d.dayNumber === dayNum);
            if (target) {

                renderApp();
            }
        }

        /* ==========================================================================
           7. PLAN SNAPSHOT, RESTORE & COMPACT ENGINE
           Fast student acceleration & undo support
           ========================================================================== */

        function savePreviousPlanSnapshot() {
            if (!appState || !appState.plan || appState.plan.length === 0) return;
            try {
                const snapshot = {
                    state: JSON.parse(JSON.stringify(appState)),
                    savedAt: new Date().toISOString(),
                    formattedTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    formattedDate: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })
                };
                localStorage.setItem('mpt_previous_plan_snapshot', JSON.stringify(snapshot));
            } catch (e) {
                console.warn('Could not save plan snapshot:', e);
            }
        }

        function restorePreviousPlan() {
            try {
                let raw = (typeof localStorage !== 'undefined') ? localStorage.getItem('mpt_previous_plan_snapshot') : null;
                let snapshot = null;
                if (raw) {
                    try { snapshot = JSON.parse(raw); } catch (_) {}
                }
                // Fallback to pre-reset snapshot if previous plan snapshot is not present
                if (!snapshot || !snapshot.state) {
                    const preResetRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem('mpt_pre_reset_snapshot') : null;
                    if (preResetRaw) {
                        try { snapshot = JSON.parse(preResetRaw); } catch (_) {}
                    }
                }
                if (!snapshot || !snapshot.state || !Array.isArray(snapshot.state.plan)) {
                    // Try cloud archive
                    if (typeof currentUser !== 'undefined' && currentUser && typeof db !== 'undefined' && db) {
                        void restorePreResetSnapshot();
                        return true;
                    }
                    showAppToast("No previous plan snapshot found to restore.", "fa-info-circle text-blue-400");
                    return false;
                }

                // Save current state as new snapshot so user can toggle / undo restore!
                savePreviousPlanSnapshot();

                appState = snapshot.state;
                appState.lastModified = new Date().toISOString();
                if (typeof currentUser !== 'undefined' && currentUser) {
                    appState.ownerUid = currentUser.uid;
                    appState.uid = currentUser.uid;
                }
                if (snapshot.stream) selectedStream = snapshot.stream;
                if (snapshot.grade) selectedGrade = snapshot.grade;
                saveAppState();
                renderApp();

                const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                showAppToast(
                    isML ? "↺ മുൻപത്തെ ടൈംടേബിൾ തിരിച്ചെടുത്തു!" : "↺ Previous study plan successfully restored!",
                    "fa-rotate-left text-emerald-400"
                );
                closeRegenerateModal();
                closeSettingsModal();
                return true;
            } catch (err) {
                console.error('Error restoring previous plan:', err);
                showAppToast("Could not restore previous plan.", "fa-triangle-exclamation text-rose-400");
                return false;
            }
        }

        async function restorePreResetSnapshot() {
            try {
                let snapshot = null;
                const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem('mpt_pre_reset_snapshot') : null;
                if (raw) {
                    try {
                        snapshot = JSON.parse(raw);
                    } catch (e) {
                        console.warn("Corrupt local pre-reset snapshot:", e);
                    }
                }

                // Fallback to Firestore cloud archive if local snapshot is unavailable
                if ((!snapshot || !snapshot.state) && typeof currentUser !== 'undefined' && currentUser && typeof db !== 'undefined' && db) {
                    try {
                        const archiveDoc = await db.collection('user_archives').doc(currentUser.uid).get();
                        if (archiveDoc.exists) {
                            snapshot = archiveDoc.data();
                        }
                    } catch (cloudErr) {
                        console.warn("Cloud archive retrieval failed:", cloudErr);
                    }
                }

                // Fallback to previous plan snapshot if pre-reset was not found
                if (!snapshot || !snapshot.state) {
                    const prevRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem('mpt_previous_plan_snapshot') : null;
                    if (prevRaw) {
                        try {
                            const parsed = JSON.parse(prevRaw);
                            if (parsed && parsed.state) snapshot = parsed;
                        } catch (_) {}
                    }
                }

                // Fallback to sync conflict snapshot if available
                if ((!snapshot || !snapshot.state) && typeof currentUser !== 'undefined' && currentUser && typeof localStorage !== 'undefined') {
                    const conflictRaw = localStorage.getItem(`mpt_sync_conflict_${currentUser.uid}`);
                    if (conflictRaw) {
                        try {
                            const parsed = JSON.parse(conflictRaw);
                            if (parsed && Array.isArray(parsed.plan)) snapshot = { state: parsed };
                        } catch (_) {}
                    }
                }

                // Validate snapshot structure
                if (!snapshot || !snapshot.state || !Array.isArray(snapshot.state.plan) || snapshot.state.plan.length === 0) {
                    const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                    showAppToast(
                        isML ? "മുൻപത്തെ പ്ലാൻ വിവരങ്ങൾ കണ്ടെത്താനായില്ല." : "No valid previous study plan found to restore.",
                        "fa-triangle-exclamation text-amber-400"
                    );
                    return false;
                }

                // Back up current state if user had any active plan in memory before restoring
                if (appState && Array.isArray(appState.plan) && appState.plan.length > 0) {
                    savePreviousPlanSnapshot();
                }

                // Restore appState
                appState = snapshot.state;
                appState.lastModified = new Date().toISOString();
                if (typeof currentUser !== 'undefined' && currentUser) {
                    appState.ownerUid = currentUser.uid;
                    appState.uid = currentUser.uid;
                }
                if (snapshot.stream) {
                    selectedStream = snapshot.stream;
                }
                if (snapshot.grade) {
                    selectedGrade = snapshot.grade;
                }

                // Persist locally & sync to cloud
                if (typeof saveAppState === 'function') {
                    await saveAppState();
                } else if (typeof saveAppStateLocally === 'function') {
                    saveAppStateLocally();
                }

                // Cache snapshot back to localStorage
                try {
                    localStorage.setItem('mpt_pre_reset_snapshot', JSON.stringify(snapshot));
                } catch (e) {
                    // Ignore quota error
                }

                // Close modals if open
                if (typeof closeSettingsModal === 'function') closeSettingsModal();
                if (typeof closeRegenerateModal === 'function') closeRegenerateModal();

                // Re-render views & update header
                if (typeof renderApp === 'function') renderApp();
                if (typeof updateAuthHeaderUI === 'function') updateAuthHeaderUI();

                const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                showAppToast(
                    isML ? "↺ മുൻപത്തെ പഠന പ്ലാനും പുരോഗതിയും തിരിച്ചെടുത്തു!" : "↺ Previous study plan and progress successfully restored!",
                    "fa-rotate-left text-emerald-400"
                );
                return true;
            } catch (err) {
                console.error("Error restoring pre-reset snapshot:", err);
                showAppToast("Could not restore previous plan.", "fa-triangle-exclamation text-rose-400");
                return false;
            }
        }

        function dismissDashboardRestoreBanner() {
            try {
                if (typeof localStorage !== 'undefined') {
                    const preResetRaw = localStorage.getItem('mpt_pre_reset_snapshot');
                    const prevRaw = localStorage.getItem('mpt_previous_plan_snapshot');
                    let snapKey = 'general';
                    try {
                        const parsed = JSON.parse(preResetRaw || prevRaw || '{}');
                        snapKey = String(parsed.resetAt || parsed.timestamp || parsed.formattedDate || 'general');
                    } catch (_) {}
                    localStorage.setItem('mpt_restore_banner_dismissed_' + snapKey, 'true');
                    localStorage.setItem('mpt_restore_banner_dismissed', 'true');
                }
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem('mpt_dismissed_restore_banner', 'true');
                }
            } catch (_) {}
            const banner = (typeof document !== 'undefined') ? document.getElementById('dashboard-restore-banner') : null;
            if (banner && typeof banner.remove === 'function') banner.remove();
        }

        function renderDashboardRestoreBanner() {
            try {
                const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                let snap = null;
                let isReset = false;

                const preResetRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem('mpt_pre_reset_snapshot') : null;
                if (preResetRaw) {
                    try {
                        const parsed = JSON.parse(preResetRaw);
                        if (parsed && parsed.state && Array.isArray(parsed.state.plan) && parsed.state.plan.length > 0) {
                            snap = parsed;
                            isReset = true;
                        }
                    } catch (_) {}
                }

                if (!snap) {
                    const prevRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem('mpt_previous_plan_snapshot') : null;
                    if (prevRaw) {
                        try {
                            const parsed = JSON.parse(prevRaw);
                            if (parsed && parsed.state && Array.isArray(parsed.state.plan) && parsed.state.plan.length > 0) {
                                snap = parsed;
                                isReset = false;
                            }
                        } catch (_) {}
                    }
                }

                if (!snap) {
                    if (typeof checkCloudArchiveForBanner === 'function') {
                        setTimeout(checkCloudArchiveForBanner, 150);
                    }
                    return '';
                }

                const snapKey = String(snap.resetAt || snap.timestamp || snap.formattedDate || 'general');

                // Check persistent dismissal
                if (typeof localStorage !== 'undefined') {
                    if (localStorage.getItem('mpt_restore_banner_dismissed_' + snapKey) === 'true') {
                        return '';
                    }
                }
                if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('mpt_dismissed_restore_banner') === 'true') {
                    return '';
                }

                const streamMap = { cs: 'Computer Science', bio: 'Biology Science', commerce: 'Commerce', humanities: 'Humanities' };
                const streamLabel = snap.stream ? (streamMap[snap.stream] || snap.stream) : '';
                const dateStr = snap.formattedDate || (snap.resetAt ? new Date(snap.resetAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');
                const timeStr = snap.formattedTime || '';
                const details = [
                    dateStr ? `${dateStr}${timeStr ? ' at ' + timeStr : ''}` : '',
                    streamLabel,
                    snap.completedCount !== undefined ? `${snap.completedCount} completed` : ''
                ].filter(Boolean).join(' · ');

                // Check if this banner has already been shown for the first time
                const seenKey = 'mpt_restore_banner_seen_' + snapKey;
                const hasBeenSeenOnce = (typeof localStorage !== 'undefined' && localStorage.getItem(seenKey) === 'true');

                if (hasBeenSeenOnce) {
                    // Subsequent visits: Transition from intrusive reset pop-up to Settings button / quiet link
                    return `
                        <div id="dashboard-restore-banner" class="max-w-4xl mx-auto my-2.5 px-3.5 py-2 rounded-xl bg-[#EDE8DC] dark:bg-[#181A17] border border-[#D9D2C3] dark:border-[#31342E] text-left flex items-center justify-between gap-3 text-xs animate-fade-in">
                            <div class="flex items-center gap-2 text-[#474B45] dark:text-[#C4C0B6] min-w-0 flex-1">
                                <svg class="w-4 h-4 text-[#1B5E43] dark:text-[#52B788] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                <span class="min-w-0 break-words pr-2 text-[11px] sm:text-xs">${isML ? 'മുൻപത്തെ ടൈംടേബിൾ ക്രമീകരണങ്ങളിൽ (Settings) ലഭ്യമാണ്.' : 'Previous timetable is saved. View or restore anytime in Settings.'}</span>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <button type="button" onclick="openSettingsModal()" class="min-h-[44px] px-3.5 py-2.5 bg-[#FFFFFF] dark:bg-[#222521] hover:bg-[#FBF9F4] dark:hover:bg-[#1B1D1A] text-[#1B5E43] dark:text-[#52B788] font-bold rounded-lg border border-[#D9D2C3] dark:border-[#31342E] transition flex items-center gap-1 cursor-pointer">
                                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                    <span>${isML ? 'Settings' : 'Settings'}</span>
                                </button>
                                <button type="button" onclick="dismissDashboardRestoreBanner()" class="min-h-[44px] min-w-[44px] flex items-center justify-center p-1 text-[#6E726A] hover:text-[#181B18] dark:text-[#918D83] dark:hover:text-[#EFECE4]" title="Dismiss">
                                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>
                        </div>
                    `;
                }

                // First time display: Mark as seen in localStorage immediately so subsequent page opens switch to Settings
                if (typeof localStorage !== 'undefined') {
                    try { localStorage.setItem(seenKey, 'true'); } catch (_) {}
                }

                return `
                    <div id="dashboard-restore-banner" class="max-w-4xl mx-auto my-3 p-3.5 sm:p-4 rounded-2xl bg-[#F6EEDC] dark:bg-[rgba(223,172,84,0.14)] border border-[#DEC59A] dark:border-[rgba(223,172,84,0.32)] text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in-up">
                        <div class="flex items-start sm:items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-[#9C6418]/15 dark:bg-[rgba(223,172,84,0.2)] text-[#9C6418] dark:text-[#DFAC54] flex items-center justify-center shrink-0 border border-[#DEC59A] dark:border-[rgba(223,172,84,0.3)]">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            </div>
                            <div>
                                <h4 class="text-sm font-serif font-bold text-[#181B18] dark:text-[#EFECE4] flex items-center gap-2 flex-wrap">
                                    <span>${isML ? 'മുൻപത്തെ ടൈംടേബിൾ തിരിച്ചെടുക്കാം' : "Yesterday's Reset Timetable Available"}</span>
                                    <span class="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FFFFFF]/70 dark:bg-[#181A17] text-[#9C6418] dark:text-[#DFAC54] border border-[#DEC59A] dark:border-[rgba(223,172,84,0.3)]">${isML ? 'ലഭ്യം' : 'Ready to Restore'}</span>
                                </h4>
                                <p class="text-xs text-[#474B45] dark:text-[#C4C0B6] mt-0.5">
                                    ${escapeStudyText(details || (isML ? 'മുൻപ് സേവ് ചെയ്ത ടൈംടേബിൾ' : 'Saved study plan and completed tasks ready to restore'))}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 w-full sm:w-auto shrink-0">
                            <button type="button" onclick="${isReset ? 'restorePreResetSnapshot()' : 'restorePreviousPlan()'}" class="flex-1 sm:flex-none min-h-[44px] px-4 py-2 bg-[#9C6418] hover:bg-[#7E4F10] dark:bg-[#DFAC54] dark:hover:bg-[#E8BC6E] active:scale-95 text-white dark:text-[#141513] text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                                <span>${isML ? 'ടൈംടേബിൾ തിരിച്ചെടുക്കുക' : 'Restore Timetable'}</span>
                            </button>
                            <button type="button" onclick="openSettingsModal()" class="min-h-[44px] px-3 py-2 text-[#181B18] dark:text-[#EFECE4] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] text-xs font-bold rounded-xl border border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] transition flex items-center gap-1 cursor-pointer" title="Settings">
                                <span>Settings</span>
                            </button>
                            <button type="button" onclick="dismissDashboardRestoreBanner()" class="min-h-[44px] min-w-[44px] flex items-center justify-center px-2.5 py-2 text-[#6E726A] hover:text-[#181B18] dark:text-[#918D83] dark:hover:text-[#EFECE4] transition text-xs rounded-xl hover:bg-[#EDE8DC] dark:hover:bg-[#181A17]" title="Dismiss">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                    </div>
                `;
            } catch (_) {
                return '';
            }
        }

        async function checkCloudArchiveForBanner() {
            if (typeof currentUser === 'undefined' || !currentUser || typeof db === 'undefined' || !db) return;
            if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('mpt_dismissed_restore_banner') === 'true') return;
            if (typeof document === 'undefined') return;
            const existingBanner = document.getElementById('dashboard-restore-banner');
            if (existingBanner) return;
            try {
                const archiveDoc = await db.collection('user_archives').doc(currentUser.uid).get();
                if (archiveDoc.exists) {
                    const snap = archiveDoc.data();
                    if (snap && snap.state && Array.isArray(snap.state.plan) && snap.state.plan.length > 0) {
                        try {
                            localStorage.setItem('mpt_pre_reset_snapshot', JSON.stringify(snap));
                        } catch (_) {}
                        if (currentView === 'today' && typeof renderApp === 'function') {
                            renderApp();
                        }
                    }
                }
            } catch (err) {
                console.warn("Cloud archive banner note:", err);
            }
        }

        function compactPlanToToday() {
            if (!appState || !appState.plan || appState.plan.length === 0) return;

            // Check if there are any unfinished tasks
            const hasUnfinished = appState.plan.some(d => d.tasks.some(t => !t.completed));
            if (!hasUnfinished) {
                const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                showAppToast(
                    isML ? "🎉 നിങ്ങൾ മുഴുവൻ സിലബസും പൂർത്തിയാക്കി കഴിഞ്ഞു!" : "🎉 You have completed all scheduled tasks!",
                    "fa-trophy text-amber-400"
                );
                return;
            }

            // Save snapshot before compacting
            savePreviousPlanSnapshot();

            const todayStr = getLocalDateStr();
            const todayDate = new Date(todayStr + 'T00:00:00');

            // Find all days where all tasks are completed
            // Completed days remain as attended historical record (Day 1..k)
            const completedDays = [];
            const upcomingDays = [];

            appState.plan.forEach(day => {
                const hasTasks = day.tasks && day.tasks.length > 0;
                const allDone = hasTasks && day.tasks.every(t => t.completed);
                if (allDone) {
                    completedDays.push({ ...day });
                } else {
                    upcomingDays.push({ ...day });
                }
            });

            // Ensure attended completed days have sequential numbering 1..completedDays.length in chronological order
            completedDays.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
            completedDays.forEach((d, idx) => {
                d.dayNumber = idx + 1;
            });

            // Compact upcoming days starting consecutively from TODAY!
            const startDayNum = completedDays.length + 1;
            const compactedUpcoming = upcomingDays.map((d, idx) => {
                const dayDate = new Date(todayDate);
                dayDate.setDate(dayDate.getDate() + idx);
                const dateStr = formatLocalDateStr(dayDate);
                return {
                    ...d,
                    dayNumber: startDayNum + idx,
                    date: dateStr,
                    dayOfWeek: dayDate.getDay(),
                };
            });

            appState.plan = [...completedDays, ...compactedUpcoming];

            // Update deadline if shifted beyond
            const lastDay = appState.plan[appState.plan.length - 1];
            if (lastDay && lastDay.date > appState.deadlineDate) {
                appState.deadlineDate = lastDay.date;
            }

            appState.lastModified = new Date().toISOString();
            saveAppState();
            renderApp();

            const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
            showAppToast(
                isML
                    ? "🚀 ടൈംടേബിൾ ഇന്നത്തേക്ക് ക്രമീകരിച്ചു! അടുത്ത ഭാഗങ്ങൾ ഇന്ന് പഠിക്കാം."
                    : "🚀 Schedule fast-tracked to Today! Next chapters are ready now.",
                "fa-bolt text-amber-400"
            );
            closeRegenerateModal();
            closeSettingsModal();
        }

        function shiftPlanToToday() {
            if (!appState || !appState.plan || appState.plan.length === 0) return;
            savePreviousPlanSnapshot();
            shiftPlanToStartDate(getLocalDateStr());
        }

        function shiftPlanToStartDate(newStartDateStr = getLocalDateStr()) {
            if (!appState || !appState.plan || appState.plan.length === 0) return;
            savePreviousPlanSnapshot();
            const s = new Date(newStartDateStr + 'T00:00:00');
            appState.startDate = newStartDateStr;
            appState.plan.forEach((day, idx) => {
                const d = new Date(s);
                d.setDate(d.getDate() + idx);
                day.date = formatLocalDateStr(d);
                day.dayOfWeek = d.getDay();
            });
            const lastDay = appState.plan[appState.plan.length - 1];
            if (lastDay && lastDay.date > appState.deadlineDate) {
                appState.deadlineDate = lastDay.date;
            }

            appState.lastModified = new Date().toISOString();
            saveAppState();
            renderApp();
            showAppToast("📅 Schedule synchronized! Day 1 starts today.", "fa-calendar-check text-blue-400");
        }

        function openPendingWork(event) {
            if (event) {
                if (typeof event.preventDefault === 'function') event.preventDefault();
                if (typeof event.stopPropagation === 'function') event.stopPropagation();
            }

            if (currentView !== 'today') {
                goToDashboard();
            }

            const performOpenAndScroll = () => {
                const pendingDetails = document.getElementById('pending-work');
                if (!pendingDetails) return;

                // 1. Expand the details element immediately
                pendingDetails.open = true;

                // 2. Smoothly scroll down so the pending section is clearly visible
                const header = document.querySelector('header');
                const headerOffset = header ? header.offsetHeight : 70;
                const rect = pendingDetails.getBoundingClientRect();
                const currentY = (typeof window !== 'undefined' && (window.pageYOffset || window.scrollY)) || 0;
                const targetScrollY = currentY + rect.top - headerOffset - 16;

                if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
                    window.scrollTo({
                        top: Math.max(0, targetScrollY),
                        behavior: 'smooth'
                    });
                }

                // 3. Highlight / pulse effect for visual feedback
                pendingDetails.classList.remove('pending-highlight-pulse');
                void pendingDetails.offsetWidth; // Force DOM reflow
                pendingDetails.classList.add('pending-highlight-pulse');

                // Focus summary for keyboard accessibility
                const summary = pendingDetails.querySelector('summary');
                if (summary && typeof summary.focus === 'function') {
                    try {
                        summary.focus({ preventScroll: true });
                    } catch (_) {
                        summary.focus();
                    }
                }

                setTimeout(() => {
                    pendingDetails.classList.remove('pending-highlight-pulse');
                }, 2200);
            };

            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => performOpenAndScroll());
            } else {
                performOpenAndScroll();
            }
        }

        let adjustSelectedChapterIds = new Set();
        let adjustPreCheckedChapterIds = new Set();
        let adjustPartialChapterMap = new Map();
        let adjustSelectionDirty = false;
        let adjustModalControlsLoaded = false;
        let adjustActiveSubjectTab = 'All';
        let adjustChapterSearchQuery = '';

        function inferPlanStreamAndGrade(state) {
            let userStream = state?.stream;
            if (!userStream && state?.plan) {
                const subs = new Set(state.plan.flatMap(d => (d.tasks || []).map(t => t.subject)));
                if (subs.has('Accountancy') || subs.has('Business Studies')) userStream = 'commerce';
                else if (subs.has('History') || subs.has('Political Science') || subs.has('Sociology')) userStream = 'humanities';
                else if (subs.has('Botany') || subs.has('Zoology')) userStream = 'bio';
                else userStream = 'cs';
            }
            if (!userStream) userStream = 'cs';
            const targetTerm = state?.targetTerm || 3;
            const userGrade = state?.grade || (typeof selectedGrade !== 'undefined' ? selectedGrade : '+2');
            return { userStream, userGrade, targetTerm };
        }

        function getEditableScopeChapters(state, termOverride) {
            const { userStream, userGrade, targetTerm } = inferPlanStreamAndGrade(state);
            const effectiveTerm = Number(termOverride) || targetTerm;
            const scopeTasks = getRemainingPlanTasks({
                grade: userGrade,
                stream: userStream,
                targetTerm: effectiveTerm,
                completedChapterIds: new Set(),
                completedTaskIds: new Set(),
            });

            const chapterMap = new Map();
            const registerTask = (task) => {
                if (!task || !task.chapId) return;
                if (task.isRevision || task.isExamEveTask || task.isSpacedRetrieval || task.isForgettingCurveReview || task.isModelExam) return;
                if (!chapterMap.has(task.chapId)) {
                    chapterMap.set(task.chapId, {
                        chapId: task.chapId,
                        chapNumber: task.chapNumber || 1,
                        chapterName: task.chapterName || task.chapId,
                        subject: task.subject || 'General',
                        grade: task.grade || userGrade,
                        term: task.term || 1,
                        totalParts: task.totalParts || 1,
                    });
                } else {
                    const existing = chapterMap.get(task.chapId);
                    if ((task.totalParts || 1) > existing.totalParts) {
                        existing.totalParts = task.totalParts || 1;
                    }
                }
            };

            scopeTasks.forEach(registerTask);
            if (state && Array.isArray(state.plan)) {
                state.plan.forEach(day => (day.tasks || []).forEach(registerTask));
            }

            return Array.from(chapterMap.values()).sort((a, b) => {
                if (a.grade !== b.grade) return a.grade === '+2' ? -1 : 1;
                if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
                return (a.chapNumber || 0) - (b.chapNumber || 0);
            });
        }

        function updateAdjustChaptersBadges() {
            const termEl = document.getElementById('adjust-target-term');
            const activeTerm = termEl ? parseInt(termEl.value, 10) : (appState?.targetTerm || 3);
            const allChapters = getEditableScopeChapters(appState, activeTerm);
            const selectedInScope = allChapters.filter(ch => adjustSelectedChapterIds.has(ch.chapId)).length;
            const totalChapters = allChapters.length;
            const remainingChapters = Math.max(0, totalChapters - selectedInScope);
            const isML = typeof getAppLanguage === 'function' && getAppLanguage() === 'ml';

            const countBadge = document.getElementById('adjust-chapters-count-badge');
            if (countBadge) {
                countBadge.textContent = isML
                    ? `${selectedInScope} / ${totalChapters} അധ്യായങ്ങൾ`
                    : `${selectedInScope} / ${totalChapters} Chapters`;
            }

            const editorStats = document.getElementById('adjust-chapters-editor-stats');
            if (editorStats) {
                editorStats.textContent = isML
                    ? `${selectedInScope} പൂർത്തിയായി • ${remainingChapters} ബാക്കി`
                    : `${selectedInScope} done • ${remainingChapters} left`;
            }
        }

        function setAdjustPillGroup(buttonIds, activeId) {
            buttonIds.forEach(id => {
                const btn = document.getElementById(id);
                if (!btn) return;
                btn.classList.toggle('adjust-pill-active', id === activeId);
            });
        }

        function updateAdjustDeadlinePreview() {
            const deadlineInput = document.getElementById('adjust-deadline-date');
            const previewEl = document.getElementById('adjust-deadline-preview');
            const granularityPill = document.getElementById('adjust-granularity-pill');
            if (!deadlineInput) return;

            const todayStr = typeof getLocalDateStr === 'function' ? getLocalDateStr() : TODAY_STR;
            const days = typeof calculateDaysBetween === 'function' ? calculateDaysBetween(todayStr, deadlineInput.value) : NaN;
            const termEl = document.getElementById('adjust-target-term');
            const activeTerm = termEl ? parseInt(termEl.value, 10) : (appState?.targetTerm || 3);
            const scopeChapters = getEditableScopeChapters(appState, activeTerm);
            const remainingChaps = Math.max(1, scopeChapters.filter(ch => !adjustSelectedChapterIds.has(ch.chapId)).length);
            const isML = typeof getAppLanguage === 'function' && getAppLanguage() === 'ml';

            if (previewEl) {
                if (Number.isFinite(days) && days > 0) {
                    previewEl.textContent = isML ? `${days} ദിവസം ബാക്കി` : `${days} days left`;
                } else if (deadlineInput.value) {
                    previewEl.textContent = isML ? 'ഭാവി തീയതി തിരഞ്ഞെടുക്കുക' : 'Select a future date';
                } else {
                    previewEl.textContent = '';
                }
            }

            if (granularityPill && Number.isFinite(days) && days > 0) {
                const approxActiveDays = Math.max(1, Math.round(days * 0.8));
                const daysPerChap = approxActiveDays / remainingChaps;
                const isWholeBlock = daysPerChap <= 1.27;
                granularityPill.textContent = isWholeBlock
                    ? (isML ? 'മുഴുവൻ അധ്യായ രീതി' : 'Whole-Chapter Blocks')
                    : (isML ? 'ഭാഗങ്ങളായുള്ള പഠനരീതി' : 'Multi-Part Pacing');
            }
        }

        function onAdjustDeadlineChange(val) {
            if (!val) return;
            updateAdjustDeadlinePreview();
        }

        function setAdjustDeadlineOffset(days) {
            const input = document.getElementById('adjust-deadline-date');
            if (!input) return;
            const baseStr = typeof getLocalDateStr === 'function' ? getLocalDateStr() : TODAY_STR;
            const d = new Date(baseStr + 'T00:00:00');
            d.setDate(d.getDate() + Number(days || 30));
            input.value = formatLocalDateStr(d);
            updateAdjustDeadlinePreview();
        }

        function setAdjustOfficialExamPreset(cycleId) {
            const cycleMeta = typeof DHSE_EXAM_CYCLES !== 'undefined' ? DHSE_EXAM_CYCLES[cycleId] : null;
            if (!cycleMeta) return;
            const input = document.getElementById('adjust-deadline-date');
            if (input) {
                input.value = cycleMeta.endDate;
            }
            if (cycleMeta.defaultTerm && typeof setAdjustTerm === 'function') {
                setAdjustTerm(cycleMeta.defaultTerm);
            }
            updateAdjustDeadlinePreview();
        }

        function setAdjustIntensity(val) {
            const normalized = (val === 'light' || val === 'intense') ? val : 'balanced';
            const input = document.getElementById('adjust-study-intensity');
            if (input) input.value = normalized;
            setAdjustPillGroup(['adjust-pace-light', 'adjust-pace-balanced', 'adjust-pace-intense'], `adjust-pace-${normalized}`);
        }

        function setAdjustRhythm(val) {
            const normalized = (val === 'weekend_booster' || val === 'sunday_rest') ? val : 'balanced';
            const input = document.getElementById('adjust-weekly-rhythm');
            if (input) input.value = normalized;
            setAdjustPillGroup(['adjust-rhythm-balanced', 'adjust-rhythm-weekend_booster', 'adjust-rhythm-sunday_rest'], `adjust-rhythm-${normalized}`);
        }

        function setAdjustTerm(termVal) {
            const normalized = [1, 2, 3].includes(Number(termVal)) ? Number(termVal) : 3;
            const input = document.getElementById('adjust-target-term');
            if (input) input.value = String(normalized);
            setAdjustPillGroup(['adjust-term-1', 'adjust-term-2', 'adjust-term-3'], `adjust-term-${normalized}`);
            updateAdjustChaptersBadges();
            updateAdjustDeadlinePreview();
        }

        function initAdjustEditControls(detection) {
            const deadlineInput = document.getElementById('adjust-deadline-date');
            if (!deadlineInput) {
                adjustModalControlsLoaded = false;
                return;
            }

            adjustModalControlsLoaded = true;
            adjustSelectionDirty = false;
            adjustActiveSubjectTab = 'All';
            adjustChapterSearchQuery = '';

            const searchInput = document.getElementById('adjust-chapter-search');
            if (searchInput) searchInput.value = '';

            adjustPartialChapterMap = new Map();
            const fullDoneFromPlan = new Set();

            if (appState && Array.isArray(appState.plan)) {
                const statsMap = new Map();
                appState.plan.forEach(day => {
                    (day.tasks || []).forEach(task => {
                        if (!task || !task.chapId || task.isRevision || task.isExamEveTask || task.isSpacedRetrieval || task.isForgettingCurveReview || task.isModelExam) return;
                        if (!statsMap.has(task.chapId)) {
                            statsMap.set(task.chapId, { doneParts: 0, totalParts: task.totalParts || 1, seenTasks: 0, allDone: true });
                        }
                        const rec = statsMap.get(task.chapId);
                        rec.seenTasks++;
                        if ((task.totalParts || 1) > rec.totalParts) rec.totalParts = task.totalParts || 1;
                        if (task.completed) rec.doneParts++;
                        else rec.allDone = false;
                    });
                });
                statsMap.forEach((rec, chapId) => {
                    if (rec.doneParts >= rec.totalParts || (rec.seenTasks > 0 && rec.allDone)) {
                        fullDoneFromPlan.add(chapId);
                    } else if (rec.doneParts > 0) {
                        adjustPartialChapterMap.set(chapId, { doneParts: rec.doneParts, totalParts: rec.totalParts });
                    }
                });
            }

            adjustSelectedChapterIds = new Set([
                ...(appState?.completedChaptersOnInit || []),
                ...(detection?.completedChapterIds ? Array.from(detection.completedChapterIds) : []),
                ...Array.from(fullDoneFromPlan)
            ]);
            adjustPreCheckedChapterIds = new Set(adjustSelectedChapterIds);

            const todayStr = typeof getLocalDateStr === 'function' ? getLocalDateStr() : TODAY_STR;
            deadlineInput.min = todayStr;
            deadlineInput.value = appState?.deadlineDate || todayStr;

            setAdjustIntensity(appState?.studyIntensity || 'balanced');
            setAdjustRhythm(appState?.personalization?.weeklyRhythm || 'balanced');
            setAdjustTerm(appState?.targetTerm || 3);
            updateAdjustChaptersBadges();
            updateAdjustDeadlinePreview();
        }

        function openAdjustChaptersPage() {
            const mainView = document.getElementById('adjust-main-view');
            const chaptersView = document.getElementById('adjust-chapters-view');
            const mainFooter = document.getElementById('adjust-main-footer');
            const chaptersFooter = document.getElementById('adjust-chapters-footer');
            const backBtn = document.getElementById('adjust-header-back-btn');
            const iconBox = document.getElementById('adjust-header-icon');
            const titleEl = document.getElementById('regenerate-modal-title');
            const subEl = document.getElementById('regenerate-modal-subtitle');
            const isML = typeof getAppLanguage === 'function' && getAppLanguage() === 'ml';

            if (mainView) mainView.classList.add('hidden');
            if (mainFooter) mainFooter.classList.add('hidden');
            if (chaptersView) chaptersView.classList.remove('hidden');
            if (chaptersFooter) chaptersFooter.classList.remove('hidden');
            if (backBtn) {
                backBtn.classList.remove('hidden');
                backBtn.classList.add('inline-flex');
            }
            if (iconBox) iconBox.classList.add('hidden');
            if (titleEl) titleEl.textContent = isML ? 'പൂർത്തിയായ അധ്യായങ്ങൾ' : 'Mark Completed Chapters';
            if (subEl) subEl.textContent = isML ? 'പൂർത്തിയാക്കിയ അധ്യായങ്ങൾ തിരഞ്ഞെടുക്കുക' : 'Finished chapters from your plan are pre-checked';

            renderAdjustChaptersPage();
        }

        function closeAdjustChaptersPage(silent = false) {
            const mainView = document.getElementById('adjust-main-view');
            const chaptersView = document.getElementById('adjust-chapters-view');
            const mainFooter = document.getElementById('adjust-main-footer');
            const chaptersFooter = document.getElementById('adjust-chapters-footer');
            const backBtn = document.getElementById('adjust-header-back-btn');
            const iconBox = document.getElementById('adjust-header-icon');
            const titleEl = document.getElementById('regenerate-modal-title');
            const subEl = document.getElementById('regenerate-modal-subtitle');
            const isML = typeof getAppLanguage === 'function' && getAppLanguage() === 'ml';

            if (chaptersView) chaptersView.classList.add('hidden');
            if (chaptersFooter) chaptersFooter.classList.add('hidden');
            if (mainView) mainView.classList.remove('hidden');
            if (mainFooter) mainFooter.classList.remove('hidden');
            if (backBtn) {
                backBtn.classList.add('hidden');
                backBtn.classList.remove('inline-flex');
            }
            if (iconBox) iconBox.classList.remove('hidden');
            if (titleEl) titleEl.textContent = isML ? (ML_I18N.regenerateModal.title || 'പ്ലാൻ എഡിറ്റ് & പുനഃക്രമീകരണം') : 'Edit & Rebalance Plan';
            if (subEl) subEl.textContent = isML ? (ML_I18N.regenerateModal.subtitle || '') : 'Adjust your completed chapters, exam date, and study pace';

            if (!silent) {
                updateAdjustChaptersBadges();
                updateAdjustDeadlinePreview();
            }
        }

        function getAdjustFilteredChapters() {
            const termEl = document.getElementById('adjust-target-term');
            const activeTerm = termEl ? parseInt(termEl.value, 10) : (appState?.targetTerm || 3);
            const allChapters = getEditableScopeChapters(appState, activeTerm);
            const query = (adjustChapterSearchQuery || '').trim().toLowerCase();

            return allChapters.filter(ch => {
                if (adjustActiveSubjectTab !== 'All' && ch.subject !== adjustActiveSubjectTab) return false;
                if (query) {
                    const hay = `${ch.chapterName} chapter ${ch.chapNumber} ${ch.subject}`.toLowerCase();
                    if (!hay.includes(query)) return false;
                }
                return true;
            });
        }

        function renderAdjustChaptersPage() {
            const termEl = document.getElementById('adjust-target-term');
            const activeTerm = termEl ? parseInt(termEl.value, 10) : (appState?.targetTerm || 3);
            const allChapters = getEditableScopeChapters(appState, activeTerm);
            const isML = typeof getAppLanguage === 'function' && getAppLanguage() === 'ml';

            const uniqueSubjects = ['All', ...new Set(allChapters.map(ch => ch.subject))];
            if (!uniqueSubjects.includes(adjustActiveSubjectTab)) {
                adjustActiveSubjectTab = 'All';
            }

            const tabsContainer = document.getElementById('adjust-subject-tabs');
            if (tabsContainer) {
                tabsContainer.innerHTML = uniqueSubjects.map(sub => {
                    const active = sub === adjustActiveSubjectTab;
                    const label = sub === 'All' ? (isML ? 'എല്ലാ വിഷയങ്ങളും' : 'All Subjects') : escapeStudyText(sub);
                    return `<button type="button" onclick="switchAdjustSubject('${escapeStudyText(sub).replace(/'/g, "\\'")}')" class="min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${active ? 'bg-[#1B5E43] text-white dark:bg-[#52B788] dark:text-[#141513] shadow-xs' : 'bg-[#EDE8DC] dark:bg-[#181A17] text-[#474B45] dark:text-[#C4C0B6] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#E4EFE9]'}">${label}</button>`;
                }).join('');
            }

            const scopeLabel = document.getElementById('adjust-visible-scope-label');
            if (scopeLabel) {
                scopeLabel.textContent = adjustActiveSubjectTab === 'All'
                    ? (isML ? 'എല്ലാ വിഷയങ്ങളും' : 'All Subjects')
                    : adjustActiveSubjectTab;
            }

            const filtered = getAdjustFilteredChapters();
            const listContainer = document.getElementById('adjust-chapters-list');
            if (listContainer) {
                if (filtered.length === 0) {
                    listContainer.innerHTML = `<p class="text-xs text-[#6E726A] dark:text-[#918D83] text-center py-6">${isML ? 'അധ്യായങ്ങളൊന്നും കണ്ടെത്തിയില്ല.' : 'No matching chapters found.'}</p>`;
                } else {
                    const hasMixedGrades = new Set(allChapters.map(ch => ch.grade)).size > 1;
                    listContainer.innerHTML = filtered.map(ch => {
                        const isChecked = adjustSelectedChapterIds.has(ch.chapId);
                        const partialInfo = adjustPartialChapterMap.get(ch.chapId);
                        const cleanName = String(ch.chapterName || '').replace(/^Chapter\s+\d+:\s*/i, '').replace(/^\d+\.\s*/, '');
                        let statusBadge = '';
                        if (isChecked) {
                            const label = adjustPreCheckedChapterIds.has(ch.chapId)
                                ? (isML ? 'പ്ലാനിൽ പൂർത്തിയായി' : 'Done in plan')
                                : (isML ? 'പൂർത്തിയായി' : 'Marked done');
                            statusBadge = `<span class="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#E4EFE9] text-[#1B5E43] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)] shrink-0">${label}</span>`;
                        } else if (partialInfo) {
                            statusBadge = `<span class="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#F6EEDC] text-[#9C6418] dark:bg-[rgba(223,172,84,0.14)] dark:text-[#DFAC54] border border-[#DEC59A] dark:border-[rgba(223,172,84,0.3)] shrink-0">${partialInfo.doneParts}/${partialInfo.totalParts} ${isML ? 'ഭാഗം' : 'parts done'}</span>`;
                        }
                        const gradeTag = hasMixedGrades ? `<span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#E7ECF3] dark:bg-[rgba(139,167,206,0.14)] text-[#2F486D] dark:text-[#8BA7CE]">${escapeStudyText(ch.grade)}</span>` : '';

                        return `
                            <label class="min-h-[44px] flex items-center gap-3 p-3 rounded-xl border ${isChecked ? 'bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)]' : 'bg-[#FFFFFF] dark:bg-[#222521] border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17]'} cursor-pointer transition select-none">
                                <input type="checkbox" value="${escapeStudyText(ch.chapId)}" ${isChecked ? 'checked' : ''} onchange="toggleAdjustChapter('${escapeStudyText(ch.chapId).replace(/'/g, "\\'")}', this.checked)" class="w-5 h-5 rounded border-[#B9B09E] dark:border-[#454940] text-[#1B5E43] focus:ring-[#1B5E43] accent-[#1B5E43] shrink-0 cursor-pointer">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-1.5 flex-wrap mb-0.5">
                                        <span class="text-[11px] font-bold text-[#1B5E43] dark:text-[#52B788]">${escapeStudyText(ch.subject)}</span>
                                        ${gradeTag}
                                        <span class="text-[11px] font-mono text-[#6E726A] dark:text-[#918D83]">Term ${ch.term} • ${ch.totalParts} ${ch.totalParts === 1 ? 'part' : 'parts'}</span>
                                    </div>
                                    <p class="text-xs sm:text-sm font-bold text-[#181B18] dark:text-[#EFECE4] leading-snug">Chapter ${ch.chapNumber}: ${escapeStudyText(cleanName)}</p>
                                </div>
                                ${statusBadge}
                            </label>
                        `;
                    }).join('');
                }
            }

            updateAdjustChaptersBadges();
        }

        function toggleAdjustChapter(chapId, isChecked) {
            if (!chapId) return;
            adjustSelectionDirty = true;
            if (isChecked) adjustSelectedChapterIds.add(chapId);
            else adjustSelectedChapterIds.delete(chapId);
            renderAdjustChaptersPage();
        }

        function toggleAllAdjustChapters(shouldCheck) {
            const filtered = getAdjustFilteredChapters();
            adjustSelectionDirty = true;
            filtered.forEach(ch => {
                if (shouldCheck) adjustSelectedChapterIds.add(ch.chapId);
                else adjustSelectedChapterIds.delete(ch.chapId);
            });
            renderAdjustChaptersPage();
        }

        function switchAdjustSubject(subject) {
            adjustActiveSubjectTab = subject || 'All';
            renderAdjustChaptersPage();
        }

        function setAdjustChapterSearch(query) {
            adjustChapterSearchQuery = query || '';
            renderAdjustChaptersPage();
        }

        function openRegenerateModal() {
            if (!appState || !appState.plan) return;

            // Run intelligent completion scan
            const detection = (typeof detectCompletedSyllabusProgress === 'function')
                ? detectCompletedSyllabusProgress(appState)
                : { anchorDayNumber: 0, totalCompletedTasks: 0, totalCompletedChapters: 0, completedTaskIds: new Set(), completedChapterIds: new Set(), completedDayMarkers: [] };

            // Populate detected progress summary badge
            const summaryBadge = document.getElementById('auto-detect-summary-badge');
            if (summaryBadge) {
                const isML = typeof getAppLanguage === 'function' && getAppLanguage() === 'ml';
                summaryBadge.textContent = `${detection.totalCompletedTasks} ${isML ? 'പൂർത്തിയായി' : 'Done'}`;
            }

            const select = document.getElementById('completed-day-select');
            if (select) {
                select.innerHTML = '';

                const todayIdx = appState.plan.findIndex(d => d.date === getLocalDateStr());
                const currentDayNumber = todayIdx !== -1 ? appState.plan[todayIdx].dayNumber : appState.plan.length;
                const maxChoice = Math.max(0, currentDayNumber - 1);

                const opt0 = document.createElement('option');
                opt0.value = 0;
                opt0.text = "Day 0 (Start fresh from Day 1 today)";
                select.appendChild(opt0);

                for (let i = 1; i <= maxChoice; i++) {
                    const dayPlan = appState.plan.find(p => p.dayNumber === i);
                    const dateNote = dayPlan ? ` (${dayPlan.date})` : '';
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.text = `Day ${i}${dateNote}`;
                    select.appendChild(opt);
                }

                // Pre-select detected anchor day if valid, otherwise maxChoice
                const preferredSelection = (detection.anchorDayNumber > 0 && detection.anchorDayNumber <= maxChoice)
                    ? detection.anchorDayNumber
                    : maxChoice;
                select.value = preferredSelection;
            }

            if (typeof closeAdjustChaptersPage === 'function') closeAdjustChaptersPage(true);
            if (typeof initAdjustEditControls === 'function') initAdjustEditControls(detection);

            // Show restore snapshot box if available
            const restoreBox = document.getElementById('regenerate-restore-box');
            if (restoreBox) {
                const snapshotRaw = localStorage.getItem('mpt_previous_plan_snapshot');
                if (snapshotRaw) {
                    try {
                        const snap = JSON.parse(snapshotRaw);
                        restoreBox.classList.remove('hidden');
                        const sub = document.getElementById('regenerate-restore-sub');
                        if (sub) sub.textContent = `Previous plan saved ${snap.formattedDate || ''} ${snap.formattedTime || ''}`;
                    } catch (e) {
                        restoreBox.classList.add('hidden');
                    }
                } else {
                    restoreBox.classList.add('hidden');
                }
            }

            // Show pre-reset restore box if available
            const undoResetBox = document.getElementById('regenerate-undo-reset-box');
            if (undoResetBox) {
                let snap = null;
                const preResetRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem('mpt_pre_reset_snapshot') : null;
                if (preResetRaw) {
                    try {
                        snap = JSON.parse(preResetRaw);
                    } catch (e) {
                        snap = null;
                    }
                }
                if (snap && snap.state && Array.isArray(snap.state.plan)) {
                    undoResetBox.classList.remove('hidden');
                    const sub = document.getElementById('regenerate-undo-reset-sub');
                    const dateStr = snap.formattedDate || (snap.resetAt ? new Date(snap.resetAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');
                    if (sub) sub.textContent = `Pre-reset timetable saved from ${dateStr} at ${snap.formattedTime || ''}`;
                } else if (typeof currentUser !== 'undefined' && currentUser && typeof db !== 'undefined' && db) {
                    undoResetBox.classList.add('hidden');
                    db.collection('user_archives').doc(currentUser.uid).get().then(doc => {
                        if (doc && doc.exists) {
                            const cloudSnap = doc.data();
                            if (cloudSnap && cloudSnap.state && Array.isArray(cloudSnap.state.plan)) {
                                try { localStorage.setItem('mpt_pre_reset_snapshot', JSON.stringify(cloudSnap)); } catch(_) {}
                                undoResetBox.classList.remove('hidden');
                                const sub = document.getElementById('regenerate-undo-reset-sub');
                                const dateStr = cloudSnap.formattedDate || (cloudSnap.resetAt ? new Date(cloudSnap.resetAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');
                                if (sub) sub.textContent = `Cloud pre-reset timetable saved from ${dateStr} at ${cloudSnap.formattedTime || ''}`;
                            }
                        }
                    }).catch(() => {});
                } else {
                    undoResetBox.classList.add('hidden');
                }
            }

            document.getElementById('regenerate-modal').classList.remove('hidden');
            document.getElementById('regenerate-modal').classList.add('flex');
        }

        function closeRegenerateModal() {
            adjustSelectionDirty = false;
            adjustModalControlsLoaded = false;
            const modal = document.getElementById('regenerate-modal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        function executeRegeneration() {
            if (typeof savePreviousPlanSnapshot === 'function') savePreviousPlanSnapshot();
            const selectEl = document.getElementById('completed-day-select');
            const completedUpTo = selectEl ? (parseInt(selectEl.value, 10) || 0) : 0;

            let userStream = appState?.stream;
            if (!userStream && appState?.plan) {
                const subs = new Set(appState.plan.flatMap(d => (d.tasks || []).map(t => t.subject)));
                if (subs.has('Accountancy') || subs.has('Business Studies')) userStream = 'commerce';
                else if (subs.has('History') || subs.has('Political Science') || subs.has('Sociology')) userStream = 'humanities';
                else if (subs.has('Botany') || subs.has('Zoology')) userStream = 'bio';
                else userStream = 'cs';
            }
            if (!userStream) userStream = 'cs';
            const userGrade = appState?.grade || (typeof selectedGrade !== 'undefined' ? selectedGrade : '+2');

            // Apply editable schedule settings when invoked from the redesigned Adjust Plan UI
            const hasAdjustControls = (typeof adjustModalControlsLoaded !== 'undefined' && adjustModalControlsLoaded);
            if (hasAdjustControls) {
                const deadlineEl = document.getElementById('adjust-deadline-date');
                const isDateValid = deadlineEl && ((typeof isCalendarDate === 'function') ? isCalendarDate(deadlineEl.value) : /^\d{4}-\d{2}-\d{2}$/.test(deadlineEl.value || ''));
                if (isDateValid) {
                    appState.deadlineDate = deadlineEl.value;
                }
                const intensityEl = document.getElementById('adjust-study-intensity');
                if (intensityEl && ['light', 'balanced', 'intense'].includes(intensityEl.value)) {
                    appState.studyIntensity = intensityEl.value;
                }
                const rhythmEl = document.getElementById('adjust-weekly-rhythm');
                if (rhythmEl && ['balanced', 'weekend_booster', 'sunday_rest'].includes(rhythmEl.value)) {
                    appState.personalization = {
                        ...(appState.personalization || {}),
                        weeklyRhythm: rhythmEl.value,
                    };
                }
                const termEl = document.getElementById('adjust-target-term');
                if (termEl && [1, 2, 3].includes(Number(termEl.value))) {
                    appState.targetTerm = Number(termEl.value);
                }
            }

            const completedTaskIds = new Set(appState.completedTasks || []);
            const completedChapterIds = new Set(appState.completedChaptersOnInit || []);
            const uncheckedInEditor = new Set();
            const isChaptersDirty = (typeof adjustSelectionDirty !== 'undefined' && adjustSelectionDirty);

            if (isChaptersDirty) {
                if (typeof adjustPreCheckedChapterIds !== 'undefined') {
                    adjustPreCheckedChapterIds.forEach(chapId => {
                        if (typeof adjustSelectedChapterIds !== 'undefined' && !adjustSelectedChapterIds.has(chapId)) {
                            uncheckedInEditor.add(chapId);
                            completedChapterIds.delete(chapId);
                        }
                    });
                }
                if (typeof adjustSelectedChapterIds !== 'undefined') {
                    adjustSelectedChapterIds.forEach(chapId => {
                        completedChapterIds.add(chapId);
                    });
                }
                if (uncheckedInEditor.size > 0 && Array.isArray(appState.plan)) {
                    appState.plan.forEach(day => {
                        (day.tasks || []).forEach(t => {
                            if (t && uncheckedInEditor.has(t.chapId)) {
                                t.completed = false;
                                completedTaskIds.delete(t.id);
                            }
                        });
                    });
                }
            }

            let keptDays = [];

            if (completedUpTo > 0) {
                // Keep days 1..completedUpTo with tasks marked completed (unless explicitly unchecked in editor)
                appState.plan.forEach(day => {
                    if (day.dayNumber <= completedUpTo) {
                        const keptTasks = [];
                        (day.tasks || []).forEach(t => {
                            if (uncheckedInEditor.has(t.chapId)) return;
                            t.completed = true;
                            completedTaskIds.add(t.id);
                            keptTasks.push(t);
                        });
                        if (keptTasks.length > 0) {
                            keptDays.push({ ...day, tasks: keptTasks });
                        }
                    }
                });

                // Preserve tasks completed ahead of schedule in days beyond completedUpTo
                appState.plan.forEach(day => {
                    if (day.dayNumber > completedUpTo) {
                        const futureDone = (day.tasks || []).filter(t => t.completed && !uncheckedInEditor.has(t.chapId));
                        if (futureDone.length > 0) {
                            futureDone.forEach(t => completedTaskIds.add(t.id));
                            keptDays.push({
                                ...day,
                                isCompletedMarker: true,
                                tasks: futureDone.map(t => ({ ...t, completed: true }))
                            });
                        }
                    }
                });
            } else {
                // Fresh reset (completedUpTo === 0):
                // Preserve previously completed tasks as historical completed markers (Days 1..K)
                appState.plan.forEach(day => {
                    const doneTasks = (day.tasks || []).filter(t => t.completed && !uncheckedInEditor.has(t.chapId));
                    if (doneTasks.length > 0) {
                        doneTasks.forEach(t => completedTaskIds.add(t.id));
                        keptDays.push({
                            ...day,
                            isCompletedMarker: true,
                            tasks: doneTasks.map(t => ({ ...t, completed: true }))
                        });
                    }
                });
            }

            // Re-index keptDays sequentially 1..K
            keptDays.forEach((d, idx) => {
                d.dayNumber = idx + 1;
            });

            const smartStart = typeof getSmartStartDate === 'function' ? getSmartStartDate() : { startDate: TODAY_STR, isLateEvening: false };
            let rebuildStartDate = (completedUpTo === 0 && keptDays.length === 0) ? smartStart.startDate : getLocalDateStr();

            // If we kept days, ensure rebuildStartDate starts strictly after the last kept day if that date is on or after rebuildStartDate
            if (keptDays.length > 0) {
                const lastKeptDate = keptDays[keptDays.length - 1].date;
                if (lastKeptDate >= rebuildStartDate) {
                    const nextDate = new Date(lastKeptDate + 'T00:00:00');
                    nextDate.setDate(nextDate.getDate() + 1);
                    rebuildStartDate = formatLocalDateStr(nextDate);
                } else if (smartStart.isLateEvening && lastKeptDate < smartStart.startDate) {
                    // Late evening and last kept day was earlier than tomorrow
                    rebuildStartDate = smartStart.startDate;
                }
            }

            const targetTerm = appState.targetTerm || 3;
            const uncompletedTasks = getRemainingPlanTasks({
                grade: userGrade,
                stream: userStream,
                targetTerm,
                completedChapterIds,
                completedTaskIds,
            });

            if (isChaptersDirty && uncompletedTasks.length === 0) {
                const isML = typeof getAppLanguage === 'function' && getAppLanguage() === 'ml';
                showAppAlert({
                    title: isML ? 'എല്ലാ അധ്യായങ്ങളും പൂർത്തിയായി' : 'All Chapters Marked Completed',
                    message: isML
                        ? 'എല്ലാ അധ്യായങ്ങളും പൂർത്തിയായി എന്ന് അടയാളപ്പെടുത്തിയിരിക്കുന്നു. ഷെഡ്യൂൾ പുതുക്കാൻ കുറഞ്ഞത് ഒരു അധ്യായമെങ്കിലും ടിക്ക് ഒഴിവാക്കുക.'
                        : 'All chapters in the selected scope are marked completed. Uncheck at least one chapter to keep scheduling remaining study days.',
                    icon: 'fa-trophy text-amber-500'
                });
                return;
            }

            appState.completedChaptersOnInit = Array.from(completedChapterIds);
            appState.completedTasks = Array.from(completedTaskIds);

            closeRegenerateModal();

            animatePlanGeneration({ mode: 'rebalance', isLateEvening: (completedUpTo === 0 && smartStart.isLateEvening) }, () => {
                let result;
                try {
                    if (rebuildStartDate >= appState.deadlineDate) {
                        const [ry, rm, rd] = rebuildStartDate.split('-').map(Number);
                        const newDeadlineDate = new Date(ry, rm - 1, rd + 30);
                        appState.deadlineDate = formatLocalDateStr(newDeadlineDate);
                        const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                        showAppToast(
                            isML
                                ? "പഴയ പരീക്ഷാ തീയതി കഴിഞ്ഞതിനാൽ അവസാന തീയതി 30 ദിവസം നീട്ടി നൽകി."
                                : "Target deadline has elapsed. Deadline auto-extended by 30 days for remaining portions.",
                            "fa-clock-rotate-left text-amber-400"
                        );
                    }

                    const regenCycle = typeof detectExamCycleForDeadline === 'function'
                        ? detectExamCycleForDeadline(appState.deadlineDate)
                        : (appState.examCycle || 'custom');
                    result = buildIntelligentPlan(
                        appState.deadlineDate,
                        uncompletedTasks,
                        rebuildStartDate,
                        appState.improvementConfig || [],
                        userStream,
                        {
                            grade: userGrade,
                            intensity: appState.studyIntensity || 'balanced',
                            personalization: appState.personalization || {},
                            examCycle: regenCycle,
                            useOfficialTimetable: true,
                            alignToOfficialExamWindow: regenCycle !== 'custom',
                            includeExamEveTasks: true,
                        }
                    );
                } catch (err) {
                    console.error('Plan regeneration error:', err);
                    const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                    showAppAlert({
                        title: isML ? 'പ്ലാൻ ക്രമീകരണം' : 'Plan Adjustment Notice',
                        message: isML ? 'ടൈംടേബിൾ ക്രമീകരിക്കാനായില്ല. ക്രമീകരണങ്ങളിൽ അവസാന തീയതി പരിശോധിക്കുക.' : 'Could not rebalance remaining tasks. Please check your target deadline date.',
                        icon: 'fa-triangle-exclamation text-amber-500'
                    });
                    return;
                }

                if (result && result.planDays) {
                    // Adjust day numbering seamlessly following keptDays (Days K+1..N)
                    const keptCount = keptDays.length;
                    result.planDays.forEach((d, idx) => {
                        d.dayNumber = keptCount + idx + 1;
                    });

                    appState.plan = [...keptDays, ...result.planDays];
                    if (keptCount === 0) {
                        appState.startDate = rebuildStartDate;
                    }

                    const keptSyllabusCount = keptDays.reduce(
                        (acc, d) => acc + (d.tasks || []).filter(t => !t.isRevision && !t.isExamEveTask).length,
                        0
                    );
                    appState.totalConfiguredTasks = keptSyllabusCount + uncompletedTasks.length;
                    appState.revisionDaysCount = result.revisionDaysCount;
                    appState.diagnostics = result.diagnostics;
                    appState.engineVersion = PLANNER_ENGINE_VERSION;
                    appState.lastModified = new Date().toISOString();
                    saveAppState();

                    const isML = getAppLanguage() === 'ml';
                    if (completedUpTo === 0 && smartStart.isLateEvening) {
                        showAppToast(isML
                            ? "🌙 ടൈംടേബിൾ ക്രമീകരിച്ചു! പുതിയ ദിനം നാളെ രാവിലെ ആരംഭിക്കുന്നു."
                            : "🌙 Schedule rebalanced! Starting fresh tomorrow morning.",
                            "fa-moon text-amber-300");
                    } else {
                        showAppToast(isML
                            ? "✨ ടൈംടേബിൾ വീണ്ടും ക്രമീകരിച്ചു!"
                            : "Schedule updated & rebalanced intelligently!",
                            "fa-wand-magic-sparkles text-blue-400");
                    }
                    renderApp();

                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.removeItem('auth_modal_dismissed');
                    }
                    if (typeof localStorage !== 'undefined') {
                        localStorage.removeItem('has_seen_auth_modal');
                        localStorage.removeItem('has_dismissed_milestone_auth');
                    }
                    if (typeof schedulePostPlanAuthModal === 'function') {
                        schedulePostPlanAuthModal(8000);
                    }
                }
            });
        }

        function autoDetectAndRebalance() {
            if (!appState || !appState.plan || appState.plan.length === 0) return;

            // 1. Scan user's current progress
            const detection = (typeof detectCompletedSyllabusProgress === 'function')
                ? detectCompletedSyllabusProgress(appState)
                : { anchorDayNumber: 0, totalCompletedTasks: 0, totalCompletedChapters: 0, completedTaskIds: new Set(), completedChapterIds: new Set(), completedDayMarkers: [] };

            // Guard: If everything is completed, celebrate and stop
            const allDone = appState.plan.every(d => d.tasks && d.tasks.every(t => t.completed));
            if (allDone) {
                const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                showAppToast(
                    isML ? "🎉 നിങ്ങൾ മുഴുവൻ സിലബസും പൂർത്തിയാക്കി കഴിഞ്ഞു!" : "🎉 You have completed all scheduled tasks!",
                    "fa-trophy text-amber-400"
                );
                closeRegenerateModal();
                return;
            }

            // Save previous snapshot for undo/restore
            if (typeof savePreviousPlanSnapshot === 'function') savePreviousPlanSnapshot();

            const smartStart = typeof getSmartStartDate === 'function' ? getSmartStartDate() : { startDate: TODAY_STR, isLateEvening: false };
            let rebuildStartDate = (detection.anchorDayNumber === 0) ? smartStart.startDate : getLocalDateStr();

            // If completed markers exist, ensure rebuild starts strictly after the last marker
            if (detection.completedDayMarkers.length > 0) {
                const lastMarkerDate = detection.completedDayMarkers[detection.completedDayMarkers.length - 1].date;
                if (lastMarkerDate >= rebuildStartDate) {
                    const nextDate = new Date(lastMarkerDate + 'T00:00:00');
                    nextDate.setDate(nextDate.getDate() + 1);
                    rebuildStartDate = formatLocalDateStr(nextDate);
                } else if (smartStart.isLateEvening && lastMarkerDate < smartStart.startDate) {
                    rebuildStartDate = smartStart.startDate;
                }
            }

            // Infer user stream reliably across science (bio/cs), commerce, and humanities
            let userStream = appState.stream;
            if (!userStream && appState.plan) {
                const subs = new Set(appState.plan.flatMap(d => (d.tasks || []).map(t => t.subject)));
                if (subs.has('Accountancy') || subs.has('Business Studies')) userStream = 'commerce';
                else if (subs.has('History') || subs.has('Political Science') || subs.has('Sociology')) userStream = 'humanities';
                else if (subs.has('Botany') || subs.has('Zoology')) userStream = 'bio';
                else userStream = 'cs';
            }
            if (!userStream) userStream = 'cs';

            const targetTerm = appState.targetTerm || 3;
            const userGrade = appState.grade || (typeof selectedGrade !== 'undefined' ? selectedGrade : '+2');

            // Retrieve all remaining uncompleted tasks (excluding completed tasks and completed chapters)
            const uncompletedTasks = getRemainingPlanTasks({
                grade: userGrade,
                stream: userStream,
                targetTerm,
                completedChapterIds: detection.completedChapterIds,
                completedTaskIds: detection.completedTaskIds,
            });

            closeRegenerateModal();

            animatePlanGeneration({ mode: 'rebalance', isLateEvening: (detection.anchorDayNumber === 0 && smartStart.isLateEvening) }, () => {
                let result;
                try {
                    if (rebuildStartDate >= appState.deadlineDate) {
                        const [ry, rm, rd] = rebuildStartDate.split('-').map(Number);
                        const newDeadlineDate = new Date(ry, rm - 1, rd + 30);
                        appState.deadlineDate = formatLocalDateStr(newDeadlineDate);
                        const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                        showAppToast(
                            isML
                                ? "പഴയ പരീക്ഷാ തീയതി കഴിഞ്ഞതിനാൽ അവസാന തീയതി 30 ദിവസം നീട്ടി നൽകി."
                                : "Target deadline has elapsed. Deadline auto-extended by 30 days for remaining portions.",
                            "fa-clock-rotate-left text-amber-400"
                        );
                    }

                    const regenCycle = typeof detectExamCycleForDeadline === 'function'
                        ? detectExamCycleForDeadline(appState.deadlineDate)
                        : (appState.examCycle || 'custom');
                    result = buildIntelligentPlan(
                        appState.deadlineDate,
                        uncompletedTasks,
                        rebuildStartDate,
                        appState.improvementConfig || [],
                        userStream,
                        {
                            grade: userGrade,
                            intensity: appState.studyIntensity || 'balanced',
                            personalization: appState.personalization || {},
                            examCycle: regenCycle,
                            useOfficialTimetable: true,
                            alignToOfficialExamWindow: regenCycle !== 'custom',
                            includeExamEveTasks: true,
                        }
                    );
                } catch (err) {
                    console.error('Auto-detect plan regeneration error:', err);
                    const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');
                    showAppAlert({
                        title: isML ? 'പ്ലാൻ ക്രമീകരണം' : 'Plan Adjustment Notice',
                        message: isML ? 'ടൈംടേബിൾ ക്രമീകരിക്കാനായില്ല. ക്രമീകരണങ്ങളിൽ അവസാന തീയതി പരിശോധിക്കുക.' : 'Could not rebalance remaining tasks. Please check your target deadline date.',
                        icon: 'fa-triangle-exclamation text-amber-500'
                    });
                    return;
                }

                if (result && result.planDays) {
                    // Number new days consecutively starting after completed markers: (K + 1)..
                    const markerCount = detection.completedDayMarkers.length;
                    result.planDays.forEach((d, idx) => {
                        d.dayNumber = markerCount + idx + 1;
                    });

                    // Combine completed markers and newly rebalanced days
                    appState.plan = [...detection.completedDayMarkers, ...result.planDays];
                    if (markerCount === 0) {
                        appState.startDate = rebuildStartDate;
                    }

                    appState.revisionDaysCount = result.revisionDaysCount;
                    appState.diagnostics = result.diagnostics;
                    appState.engineVersion = PLANNER_ENGINE_VERSION;
                    appState.lastModified = new Date().toISOString();
                    saveAppState();

                    const isML = typeof getAppLanguage === 'function' && getAppLanguage() === 'ml';
                    const countMsg = `${detection.totalCompletedTasks} tasks locked as completed markers.`;
                    showAppToast(
                        isML
                            ? "⚡ പൂർത്തിയായവ ഓട്ടോ-ഡിറ്റക്റ്റ് ചെയ്ത് ടൈംടേബിൾ പുനഃക്രമീകരിച്ചു!"
                            : `⚡ Auto-detected and rebalanced! ${countMsg}`,
                        "fa-wand-magic-sparkles text-blue-400"
                    );
                    renderApp();

                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.removeItem('auth_modal_dismissed');
                    }
                    if (typeof localStorage !== 'undefined') {
                        localStorage.removeItem('has_seen_auth_modal');
                        localStorage.removeItem('has_dismissed_milestone_auth');
                    }
                    if (typeof schedulePostPlanAuthModal === 'function') {
                        schedulePostPlanAuthModal(8000);
                    }
                }
            });
        }

        /* ==========================================================================
           8. CORE APP VIEW RENDERER
           ========================================================================== */
        let setupCurrentStep = 1;

        function goToSetupStep(stepNum) {
            if (typeof document === "undefined") return;
            if (stepNum < 1 || stepNum > 4) return;
            setupCurrentStep = stepNum;

            for (let i = 1; i <= 4; i++) {
                const stepEl = document.getElementById(`setup-step-${i}`);
                if (stepEl) {
                    if (i === stepNum) {
                        stepEl.classList.remove('hidden');
                        stepEl.classList.add('animate-fade-in-up');
                    } else {
                        stepEl.classList.add('hidden');
                        stepEl.classList.remove('animate-fade-in-up');
                    }
                }
                const pill = document.getElementById(`setup-step-pill-${i}`);
                if (pill) {
                    if (i === stepNum) {
                        pill.className = 'touch-target-44 w-11 h-11 rounded-full bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] font-mono font-bold scale-105 shadow-xs text-xs flex items-center justify-center transition active:scale-95';
                        pill.innerHTML = `${i}`;
                    } else if (i < stepNum) {
                        pill.className = 'touch-target-44 w-11 h-11 rounded-full bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] text-[#1B5E43] dark:text-[#52B788] font-mono font-bold border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)] text-xs flex items-center justify-center transition active:scale-95';
                        pill.innerHTML = '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
                    } else {
                        pill.className = 'touch-target-44 w-11 h-11 rounded-full bg-[#EDE8DC] dark:bg-[#181A17] text-[#6E726A] dark:text-[#918D83] font-mono font-bold text-xs flex items-center justify-center transition active:scale-95';
                        pill.innerHTML = `${i}`;
                    }
                }
            }

            const progressBar = document.getElementById('setup-progress-bar');
            const stepBadge = document.getElementById('setup-step-badge');
            const isML = getAppLanguage() === 'ml';
            if (progressBar) {
                progressBar.style.width = `${stepNum * 25}%`;
            }
            if (stepBadge) {
                stepBadge.innerText = `${isML ? 'ഘട്ടം' : 'Step'} ${stepNum} / 4`;
            }

            if (stepNum === 2) {
                updateDeadlinePreview();
                updatePresetButtonsUI();
            }
            if (stepNum === 3) {
                updateCompletedChaptersCountBadge();
                const tabsContainer = document.getElementById('setup-subject-tabs-container');
                if (tabsContainer) tabsContainer.innerHTML = renderSetupSubjectTabs();
                const chapsContainer = document.getElementById('setup-subject-chapters-list');
                if (chapsContainer) chapsContainer.innerHTML = renderSetupSubjectChapters(activeSetupSubjectTab, activeSetupGradeTab);
            }
            if (stepNum === 4) {
                const streamBadge = document.getElementById('summary-stream-badge');
                if (streamBadge) {
                    const gradeLabel = selectedGrade === '+1' ? '+1' : '+2';
                    const streamNames = {
                        cs: `Computer Science (${gradeLabel})`,
                        bio: `Biology Science (${gradeLabel})`,
                        commerce: `Commerce (${gradeLabel})`,
                        humanities: `Humanities (${gradeLabel})`
                    };
                    streamBadge.innerText = streamNames[selectedStream] || selectedStream;
                }
                const dateBadge = document.getElementById('summary-date-badge');
                const dateInput = document.getElementById('deadline-date');
                if (dateBadge && dateInput && dateInput.value) {
                    dateBadge.innerText = dateInput.value;
                }
                const completedBadge = document.getElementById('summary-completed-badge');
                if (completedBadge) {
                    completedBadge.innerText = `${selectedCompletedChapters.size} ${isML ? 'പൂർത്തിയായി' : 'completed'}`;
                }
            }
        }

        function nextSetupStep() {
            goToSetupStep(Math.min(4, setupCurrentStep + 1));
        }

        function prevSetupStep() {
            goToSetupStep(Math.max(1, setupCurrentStep - 1));
        }

        function renderApp() {
            const container = document.getElementById('app-container');
            if (!container) return;
            const openSections = new Set([...(container.querySelectorAll?.('details[id][open]') ?? [])].map(section => section.id));
            document.body?.classList?.toggle('is-setting-up', !appState);
            const isML = getAppLanguage() === 'ml';
            const currentSelectedGrade = (typeof selectedGrade !== 'undefined' ? selectedGrade : '+2');
            const dateDisplay = document.getElementById('date-display');
            if (dateDisplay) {
                dateDisplay.innerText = new Date().toLocaleDateString(isML ? 'ml-IN' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            }

            // View 0: Initial Setup View (Instant 1-Screen Setup — Zero "Next... Next..." Fatigue)
            if (!appState) {
                trackAnalyticsEvent('setup_started');
                const officialPresets = typeof getOfficialExamPresets === 'function' ? getOfficialExamPresets() : null;
                let defaultTargetDateStr = officialPresets?.public?.date || '2027-03-30';
                if (officialPresets?.christmas?.isUpcoming) {
                    defaultTargetDateStr = officialPresets.christmas.date;
                } else if (officialPresets?.model?.isUpcoming) {
                    defaultTargetDateStr = officialPresets.model.date;
                }
                const defaultTarget = new Date(defaultTargetDateStr + 'T00:00:00');

                let preResetBannerHtml = '';
                try {
                    const rawSnapshot = localStorage.getItem('mpt_pre_reset_snapshot');
                    if (rawSnapshot) {
                        const snapshot = JSON.parse(rawSnapshot);
                        if (snapshot && snapshot.state && Array.isArray(snapshot.state.plan) && snapshot.state.plan.length > 0) {
                            const dateStr = snapshot.formattedDate || (snapshot.resetAt ? new Date(snapshot.resetAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'recently');
                            const completedCount = snapshot.completedCount ?? (snapshot.state.plan.flatMap(d => d.tasks || []).filter(t => t.completed).length);
                            const totalCount = snapshot.totalCount ?? (snapshot.state.plan.flatMap(d => d.tasks || []).filter(t => !t.isRevision && !t.isExamEveTask).length);
                            const title = isML ? 'പ്ലാൻ അബദ്ധത്തിൽ റീസെറ്റ് ചെയ്തോ?' : 'Accidentally reset your plan?';
                            const desc = isML
                                ? `${dateStr}-ലെ നിങ്ങളുടെ മുൻപത്തെ പഠന ടൈംടേബിൾ (${completedCount}/${totalCount} ടാസ്കുകൾ പൂർത്തിയായത്) സൂക്ഷിച്ചിട്ടുണ്ട്.`
                                : `Your previous study timetable from ${dateStr} (${completedCount}/${totalCount} tasks completed) is saved.`;
                            const btnText = isML ? '↺ മുൻപത്തെ പ്ലാൻ തിരിച്ചെടുക്കുക' : '↺ Restore Previous Plan';

                            preResetBannerHtml = `
                                <div id="pre-reset-restore-banner" class="max-w-2xl mx-auto mb-5 bg-[#F6EEDC] dark:bg-[rgba(223,172,84,0.14)] border border-[#DEC59A] dark:border-[rgba(223,172,84,0.32)] rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in-up" role="alert" aria-live="polite">
                                    <div class="flex items-start gap-3.5">
                                        <div class="w-10 h-10 rounded-2xl bg-[#9C6418] dark:bg-[#DFAC54] text-white dark:text-[#141513] flex items-center justify-center shrink-0">
                                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                                        </div>
                                        <div>
                                            <h4 class="text-sm font-serif font-bold text-[#181B18] dark:text-[#EFECE4] flex items-center gap-1.5">
                                                <span>${title}</span>
                                            </h4>
                                            <p class="text-xs font-medium text-[#474B45] dark:text-[#C4C0B6] mt-0.5">
                                                ${desc}
                                            </p>
                                        </div>
                                    </div>
                                    <button type="button" id="btn-restore-pre-reset" onclick="restorePreResetSnapshot()" class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-[#9C6418] hover:bg-[#7E4F10] dark:bg-[#DFAC54] dark:hover:bg-[#E8BC6E] active:scale-95 text-white dark:text-[#141513] text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                                        <span>${btnText}</span>
                                    </button>
                                </div>
                            `;
                        }
                    }
                } catch(e) {
                    console.warn("Pre-reset banner check note:", e);
                }

                container.innerHTML = `
                    ${preResetBannerHtml}
                    <div id="setup-wizard-card" class="max-w-2xl mx-auto bg-[#FBF9F4] dark:bg-[#1B1D1A] rounded-3xl p-5 sm:p-8 border border-[#D9D2C3] dark:border-[#31342E] shadow-xs animate-fade-in-up">
                        <!-- Stepper Indicator -->
                        <div class="mb-6">
                            <div class="flex items-center justify-between mb-2">
                                <span id="setup-step-badge" class="text-xs font-mono font-bold uppercase tracking-wider text-[#1B5E43] dark:text-[#52B788]">
                                    ${isML ? 'ഘട്ടം' : 'Step'} ${setupCurrentStep} / 4
                                </span>
                                <div class="flex items-center gap-1.5">
                                    ${[1, 2, 3, 4].map(step => `
                                        <button type="button" id="setup-step-pill-${step}" onclick="goToSetupStep(${step})" class="touch-target-44 w-11 h-11 rounded-full ${step === setupCurrentStep ? 'bg-[#1B5E43] text-white font-mono font-bold scale-105 shadow-xs dark:bg-[#52B788] dark:text-[#141513]' : (step < setupCurrentStep ? 'bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] text-[#1B5E43] dark:text-[#52B788] font-mono font-bold border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)]' : 'bg-[#EDE8DC] dark:bg-[#181A17] text-[#6E726A] dark:text-[#918D83] font-mono font-bold')} text-xs flex items-center justify-center transition active:scale-95">
                                            ${step < setupCurrentStep ? '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' : step}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                            <div class="w-full bg-[#EDE8DC] dark:bg-[#181A17] h-2 rounded-full overflow-hidden border border-[#D9D2C3]/60 dark:border-[#31342E]">
                                <div id="setup-progress-bar" class="bg-[#1B5E43] dark:bg-[#52B788] h-full rounded-full transition-all duration-300" style="width: ${setupCurrentStep * 25}%"></div>
                            </div>
                        </div>

                        <!-- Form state inputs preserved for engine compatibility -->
                        <input type="hidden" id="target-term" value="2">

                        <!-- STEP 1: Grade & Stream Selection -->
                        <div id="setup-step-1" class="${setupCurrentStep === 1 ? '' : 'hidden'} space-y-5 animate-fade-in-up">
                            <div class="text-left">
                                <h3 class="text-xl sm:text-2xl font-serif font-bold text-[#181B18] dark:text-[#EFECE4] tracking-tight">
                                    ${isML ? 'ക്ലാസും സ്ട്രീമും തിരഞ്ഞെടുക്കുക' : 'Select Your Class & Stream'}
                                </h3>
                                <p class="text-xs sm:text-sm text-[#474B45] dark:text-[#C4C0B6] mt-1">
                                    ${isML ? 'നിങ്ങളുടെ ക്ലാസും പഠിക്കുന്ന വിഷയങ്ങളും തിരഞ്ഞെടുക്കുക. സിലബസ് ഉടൻ തയ്യാറാകും.' : 'Choose whether you are studying Plus One (+1) or Plus Two (+2) and pick your stream.'}
                                </p>
                            </div>

                            <!-- Class / Grade Selection Tabs -->
                            <div>
                                <label class="block text-xs font-mono font-bold uppercase tracking-wider text-[#6E726A] dark:text-[#918D83] mb-2">
                                    ${isML ? 'ക്ലാസ് / ഗ്രേഡ്' : 'Class / Academic Year'}
                                </label>
                                <div class="grid grid-cols-2 gap-2 sm:gap-3">
                                    <button type="button" id="grade-btn-p2" onclick="setGradeSelection('+2')" class="cursor-pointer p-2.5 sm:p-3.5 rounded-2xl border-2 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${currentSelectedGrade === '+2' ? 'border-[#1B5E43] dark:border-[#52B788] bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] ring-2 ring-[#1B5E43]/20 shadow-xs' : 'border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] hover:border-[#B9B09E] dark:hover:border-[#454940]'} transition-transform duration-150 text-left flex flex-col justify-between min-w-0">
                                        <div class="flex items-center justify-between gap-1 w-full min-w-0">
                                            <div class="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                                                <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] text-[#1B5E43] dark:text-[#52B788] flex items-center justify-center shrink-0 p-1 sm:p-1.5 border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)]">
                                                    ${typeof GRADE_ICONS !== 'undefined' && GRADE_ICONS.plusTwo ? GRADE_ICONS.plusTwo : '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>'}
                                                </div>
                                                <span class="text-xs sm:text-sm font-serif font-bold text-[#181B18] dark:text-[#EFECE4] truncate">Plus Two (+2)</span>
                                            </div>
                                            <span class="w-4 h-4 sm:w-5 sm:h-5 rounded-full shrink-0 ${currentSelectedGrade === '+2' ? 'bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513]' : 'border border-[#D9D2C3] dark:border-[#31342E]'} flex items-center justify-center text-[10px]">
                                                ${currentSelectedGrade === '+2' ? '<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                                            </span>
                                        </div>
                                        <span class="text-[11px] sm:text-xs font-mono text-[#6E726A] dark:text-[#918D83] mt-2 truncate block w-full">Class 12 Board Syllabus</span>
                                    </button>

                                    <button type="button" id="grade-btn-p1" onclick="setGradeSelection('+1')" class="cursor-pointer p-2.5 sm:p-3.5 rounded-2xl border-2 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${currentSelectedGrade === '+1' ? 'border-[#9C6418] dark:border-[#DFAC54] bg-[#F6EEDC] dark:bg-[rgba(223,172,84,0.14)] ring-2 ring-[#9C6418]/20 shadow-xs' : 'border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] hover:border-[#B9B09E] dark:hover:border-[#454940]'} transition-transform duration-150 text-left flex flex-col justify-between min-w-0">
                                        <div class="flex items-center justify-between gap-1 w-full min-w-0">
                                            <div class="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                                                <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#F6EEDC] dark:bg-[rgba(223,172,84,0.14)] text-[#9C6418] dark:text-[#DFAC54] flex items-center justify-center shrink-0 p-1 sm:p-1.5 border border-[#DEC59A] dark:border-[rgba(223,172,84,0.3)]">
                                                    ${typeof GRADE_ICONS !== 'undefined' && GRADE_ICONS.plusOne ? GRADE_ICONS.plusOne : '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'}
                                                </div>
                                                <span class="text-xs sm:text-sm font-serif font-bold text-[#181B18] dark:text-[#EFECE4] truncate">Plus One (+1)</span>
                                            </div>
                                            <span class="w-4 h-4 sm:w-5 sm:h-5 rounded-full shrink-0 ${currentSelectedGrade === '+1' ? 'bg-[#9C6418] dark:bg-[#DFAC54] text-white dark:text-[#141513]' : 'border border-[#D9D2C3] dark:border-[#31342E]'} flex items-center justify-center text-[10px]">
                                                ${currentSelectedGrade === '+1' ? '<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                                            </span>
                                        </div>
                                        <span class="text-[11px] sm:text-xs font-mono text-[#6E726A] dark:text-[#918D83] mt-2 truncate block w-full">Class 11 Annual Syllabus</span>
                                    </button>
                                </div>
                            </div>

                            <label class="block text-xs font-mono font-bold uppercase tracking-wider text-[#6E726A] dark:text-[#918D83] pt-1">
                                ${isML ? 'സ്ട്രീം തിരഞ്ഞെടുക്കുക' : 'Select Stream'}
                            </label>

                            <div class="stream-options grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <!-- Option 1: Computer Science -->
                                <div id="stream-card-cs" aria-pressed="${selectedStream === 'cs'}" role="button" tabindex="0" onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" onclick="setStreamSelection('cs')" class="cursor-pointer p-3.5 rounded-2xl border-2 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${selectedStream === 'cs' ? 'border-[#1B5E43] dark:border-[#52B788] bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] ring-2 ring-[#1B5E43]/20 shadow-xs' : 'border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] hover:border-[#B9B09E] dark:hover:border-[#454940]'} transition-transform duration-150 text-left flex flex-col justify-between">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-xl bg-[#E7ECF3] dark:bg-[rgba(139,167,206,0.14)] text-[#2F486D] dark:text-[#8BA7CE] flex items-center justify-center shrink-0 p-2 border border-[#A6B8CE] dark:border-[rgba(139,167,206,0.3)]">
                                                ${typeof STREAM_ICONS !== 'undefined' && STREAM_ICONS.cs ? STREAM_ICONS.cs : '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'}
                                            </div>
                                            <div>
                                                <h4 class="font-serif font-bold text-[#181B18] dark:text-[#EFECE4] text-sm">${isML ? ML_I18N.setup.csTitle : 'Computer Science'} (${currentSelectedGrade})</h4>
                                                <span class="text-[11px] font-mono text-[#2F486D] dark:text-[#8BA7CE]">Physics • Chem • Maths • CS</span>
                                            </div>
                                        </div>
                                        <span class="w-5 h-5 rounded-full ${selectedStream === 'cs' ? 'bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513]' : 'border border-[#D9D2C3] dark:border-[#31342E]'} flex items-center justify-center text-xs">
                                            ${selectedStream === 'cs' ? '<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                                        </span>
                                    </div>
                                </div>

                                <!-- Option 2: Biology Science -->
                                <div id="stream-card-bio" aria-pressed="${selectedStream === 'bio'}" role="button" tabindex="0" onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" onclick="setStreamSelection('bio')" class="cursor-pointer p-3.5 rounded-2xl border-2 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${selectedStream === 'bio' ? 'border-[#1B5E43] dark:border-[#52B788] bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] ring-2 ring-[#1B5E43]/20 shadow-xs' : 'border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] hover:border-[#B9B09E] dark:hover:border-[#454940]'} transition-transform duration-150 text-left flex flex-col justify-between">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-xl bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] text-[#1B5E43] dark:text-[#52B788] flex items-center justify-center shrink-0 p-2 border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)]">
                                                ${typeof STREAM_ICONS !== 'undefined' && STREAM_ICONS.bio ? STREAM_ICONS.bio : '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'}
                                            </div>
                                            <div>
                                                <h4 class="font-serif font-bold text-[#181B18] dark:text-[#EFECE4] text-sm">${isML ? ML_I18N.setup.bioTitle : 'Biology Science'} (${currentSelectedGrade})</h4>
                                                <span class="text-[11px] font-mono text-[#1B5E43] dark:text-[#52B788]">Physics • Chem • Maths • Bio</span>
                                            </div>
                                        </div>
                                        <span class="w-5 h-5 rounded-full ${selectedStream === 'bio' ? 'bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513]' : 'border border-[#D9D2C3] dark:border-[#31342E]'} flex items-center justify-center text-xs">
                                            ${selectedStream === 'bio' ? '<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                                        </span>
                                    </div>
                                </div>

                                <!-- Option 3: Commerce -->
                                <div id="stream-card-commerce" aria-pressed="${selectedStream === 'commerce'}" role="button" tabindex="0" onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" onclick="setStreamSelection('commerce')" class="cursor-pointer p-3.5 rounded-2xl border-2 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${selectedStream === 'commerce' ? 'border-[#9C6418] dark:border-[#DFAC54] bg-[#F6EEDC] dark:bg-[rgba(223,172,84,0.14)] ring-2 ring-[#9C6418]/20 shadow-xs' : 'border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] hover:border-[#B9B09E] dark:hover:border-[#454940]'} transition-transform duration-150 text-left flex flex-col justify-between">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-xl bg-[#F6EEDC] dark:bg-[rgba(223,172,84,0.14)] text-[#9C6418] dark:text-[#DFAC54] flex items-center justify-center shrink-0 p-2 border border-[#DEC59A] dark:border-[rgba(223,172,84,0.3)]">
                                                ${typeof STREAM_ICONS !== 'undefined' && STREAM_ICONS.commerce ? STREAM_ICONS.commerce : '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'}
                                            </div>
                                            <div>
                                                <h4 class="font-serif font-bold text-[#181B18] dark:text-[#EFECE4] text-sm">${isML ? ML_I18N.setup.commerceTitle : 'Commerce'} (${currentSelectedGrade})</h4>
                                                <span class="text-[11px] font-mono text-[#9C6418] dark:text-[#DFAC54]">Accountancy • Business • Econ</span>
                                            </div>
                                        </div>
                                        <span class="w-5 h-5 rounded-full ${selectedStream === 'commerce' ? 'bg-[#9C6418] dark:bg-[#DFAC54] text-white dark:text-[#141513]' : 'border border-[#D9D2C3] dark:border-[#31342E]'} flex items-center justify-center text-xs">
                                            ${selectedStream === 'commerce' ? '<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                                        </span>
                                    </div>
                                </div>

                                <!-- Option 4: Humanities -->
                                <div id="stream-card-humanities" aria-pressed="${selectedStream === 'humanities'}" role="button" tabindex="0" onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" onclick="setStreamSelection('humanities')" class="cursor-pointer p-3.5 rounded-2xl border-2 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${selectedStream === 'humanities' ? 'border-[#B8432E] dark:border-[#E57A65] bg-[#F9E9E5] dark:bg-[rgba(229,122,101,0.14)] ring-2 ring-[#B8432E]/20 shadow-xs' : 'border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] hover:border-[#B9B09E] dark:hover:border-[#454940]'} transition-transform duration-150 text-left flex flex-col justify-between">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-xl bg-[#F9E9E5] dark:bg-[rgba(229,122,101,0.14)] text-[#B8432E] dark:text-[#E57A65] flex items-center justify-center shrink-0 p-2 border border-[#E8B4A9] dark:border-[rgba(229,122,101,0.3)]">
                                                ${typeof STREAM_ICONS !== 'undefined' && STREAM_ICONS.humanities ? STREAM_ICONS.humanities : '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'}
                                            </div>
                                            <div>
                                                <h4 class="font-serif font-bold text-[#181B18] dark:text-[#EFECE4] text-sm">${isML ? ML_I18N.setup.humanitiesTitle : 'Humanities'} (${currentSelectedGrade})</h4>
                                                <span class="text-[11px] font-mono text-[#B8432E] dark:text-[#E57A65]">History • Pol Science • Sociology</span>
                                            </div>
                                        </div>
                                        <span class="w-5 h-5 rounded-full ${selectedStream === 'humanities' ? 'bg-[#B8432E] dark:bg-[#E57A65] text-white dark:text-[#141513]' : 'border border-[#D9D2C3] dark:border-[#31342E]'} flex items-center justify-center text-xs">
                                            ${selectedStream === 'humanities' ? '<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                                        </span>
                                    </div>
                                </div>

                            </div>

                            

                            <!-- Step 1 Navigation (Strictly "Next", No extra clutter) -->
                            <div class="pt-5 flex justify-end">
                                <button type="button" onclick="nextSetupStep()" class="w-full sm:w-auto bg-[#1B5E43] hover:bg-[#144833] dark:bg-[#52B788] dark:hover:bg-[#67C79A] text-white dark:text-[#141513] font-bold text-sm py-3 px-8 rounded-xl shadow-xs transition flex items-center justify-center gap-2 active:scale-95">
                                    <span>${isML ? 'തുടരുക' : 'Next'}</span>
                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                </button>
                            </div>
                        </div>

                        <!-- STEP 2: Target Exam / Date -->
                        <div id="setup-step-2" class="${setupCurrentStep === 2 ? '' : 'hidden'} space-y-5 animate-fade-in-up">
                            <div class="text-left">
                                <h3 class="text-xl sm:text-2xl font-serif font-bold text-[#181B18] dark:text-[#EFECE4] tracking-tight">
                                    ${isML ? 'ലക്ഷ്യ പരീക്ഷ / തീയതി' : 'Target Exam & Date'}
                                </h3>
                                <p class="text-xs sm:text-sm text-[#474B45] dark:text-[#C4C0B6] mt-1">
                                    ${isML ? 'പരീക്ഷാ തീയതി തിരഞ്ഞെടുക്കുക. ദിവസങ്ങൾക്കനുസരിച്ച് ഷെഡ്യൂൾ ചെയ്യാം.' : 'Pick an exam preset or select your target completion date.'}
                                </p>
                            </div>

                            <!-- Fast Presets -->
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                ${(function() {
                                    const examCyclesSafe = typeof DHSE_EXAM_CYCLES !== 'undefined'
                                        ? DHSE_EXAM_CYCLES
                                        : { christmas: { endDate: '2026-12-17' }, model: { endDate: '2027-02-24' }, public: { endDate: '2027-03-30' } };
                                    return `
                                <button type="button" id="preset-btn-xmas" onclick="setDeadlinePreset('${examCyclesSafe.christmas.endDate}', 2, 'christmas')" class="preset-date-btn min-h-[44px] py-2.5 px-3 rounded-xl bg-[#FFFFFF] dark:bg-[#222521] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] text-[#181B18] dark:text-[#EFECE4] text-xs font-bold border border-[#D9D2C3] dark:border-[#31342E] transition-all duration-150 flex flex-col items-center justify-center text-center gap-1 active:scale-95 cursor-pointer">
                                    <svg class="w-4 h-4 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                    <span>${isML ? 'ക്രിസ്മസ് പരീക്ഷ' : 'Christmas Exam'}</span>
                                    <span class="preset-sub text-[10px] font-mono text-[#6E726A] dark:text-[#918D83] font-medium">Dec 8–17 • Term 1–2</span>
                                </button>
                                <button type="button" id="preset-btn-model" onclick="setDeadlinePreset('${examCyclesSafe.model.endDate}', 3, 'model')" class="preset-date-btn min-h-[44px] py-2.5 px-3 rounded-xl bg-[#FFFFFF] dark:bg-[#222521] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] text-[#181B18] dark:text-[#EFECE4] text-xs font-bold border border-[#D9D2C3] dark:border-[#31342E] transition-all duration-150 flex flex-col items-center justify-center text-center gap-1 active:scale-95 cursor-pointer">
                                    <svg class="w-4 h-4 text-[#2F486D] dark:text-[#8BA7CE]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>
                                    <span>${isML ? 'മോഡൽ പരീക്ഷ' : 'Model Exam'}</span>
                                    <span class="preset-sub text-[10px] font-mono text-[#6E726A] dark:text-[#918D83] font-medium">Feb 11–24 • Full</span>
                                </button>
                                <button type="button" id="preset-btn-board" onclick="setDeadlinePreset('${examCyclesSafe.public.endDate}', 3, 'public')" class="preset-date-btn min-h-[44px] py-2.5 px-3 rounded-xl bg-[#FFFFFF] dark:bg-[#222521] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] text-[#181B18] dark:text-[#EFECE4] text-xs font-bold border border-[#D9D2C3] dark:border-[#31342E] transition-all duration-150 flex flex-col items-center justify-center text-center gap-1 active:scale-95 cursor-pointer">
                                    <svg class="w-4 h-4 text-[#B8432E] dark:text-[#E57A65]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                                    <span>${isML ? 'പബ്ലിക് പരീക്ഷ' : 'Public Exam'}</span>
                                    <span class="preset-sub text-[10px] font-mono text-[#6E726A] dark:text-[#918D83] font-medium">Mar 2–30 • Full</span>
                                </button>
                                <button type="button" id="preset-btn-30" onclick="setDeadlinePreset('${getRelativePresetDate(30)}', null, 'custom')" class="preset-date-btn min-h-[44px] py-2.5 px-3 rounded-xl bg-[#FFFFFF] dark:bg-[#222521] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] text-[#181B18] dark:text-[#EFECE4] text-xs font-bold border border-[#D9D2C3] dark:border-[#31342E] transition-all duration-150 flex flex-col items-center justify-center text-center gap-1 active:scale-95 cursor-pointer">
                                    <svg class="w-4 h-4 text-[#9C6418] dark:text-[#DFAC54]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                                    <span>${isML ? '30 ദിവസത്തെ പ്ലാൻ' : '30-Day Sprint'}</span>
                                    <span class="preset-sub text-[10px] font-mono text-[#6E726A] dark:text-[#918D83] font-medium">Fast Crash</span>
                                </button>`;
                                })()}
                            </div>

                            <!-- Date Picker -->
                            <div class="relative">
                                <input type="date" id="deadline-date" value="${getLocalDateStr(defaultTarget)}" onchange="updateDeadlinePreview()" oninput="updateDeadlinePreview()" class="w-full border-2 border-[#D9D2C3] dark:border-[#31342E] rounded-xl p-3 text-sm font-mono font-bold text-[#181B18] dark:text-[#EFECE4] bg-[#FFFFFF] dark:bg-[#181A17] focus:border-[#1B5E43] dark:focus:border-[#52B788] outline-none transition">
                            </div>
                            <!-- Live Calculation Feedback Box -->
                            <div id="deadline-calc-label" class="p-3 rounded-2xl bg-[#E4EFE9]/60 dark:bg-[rgba(82,183,136,0.1)] border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.28)] text-xs text-[#181B18] dark:text-[#EFECE4]"></div>
                            <!-- Live Official DHSE Timetable Preview -->
                            <div id="setup-official-timetable-preview" class="hidden"></div>

                            

                            <!-- Step 2 Navigation -->
                            <div class="pt-5 flex items-center justify-between gap-3">
                                <button type="button" onclick="prevSetupStep()" class="min-h-[44px] py-2.5 px-5 rounded-xl border border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] text-[#474B45] dark:text-[#C4C0B6] font-bold text-xs hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] transition flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer">
                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                                    <span>${isML ? 'പിന്നോട്ട്' : 'Back'}</span>
                                </button>
                                <button type="button" onclick="nextSetupStep()" class="min-h-[44px] bg-[#1B5E43] hover:bg-[#144833] dark:bg-[#52B788] dark:hover:bg-[#67C79A] text-white dark:text-[#141513] font-bold text-sm py-2.5 px-8 rounded-xl shadow-xs transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer">
                                    <span>${isML ? 'തുടരുക' : 'Next'}</span>
                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                </button>
                            </div>
                        </div>

                        <!-- STEP 3: Completed Chapters -->
                        <div id="setup-step-3" class="${setupCurrentStep === 3 ? '' : 'hidden'} space-y-4 animate-fade-in-up">
                            <div class="flex items-center justify-between pb-1">
                                <div class="text-left">
                                    <h3 class="text-xl sm:text-2xl font-serif font-bold text-[#181B18] dark:text-[#EFECE4] tracking-tight">
                                        ${isML ? 'പൂർത്തിയാക്കിയ അധ്യായങ്ങൾ' : 'Completed Chapters'}
                                    </h3>
                                    <p class="text-xs text-[#474B45] dark:text-[#C4C0B6] mt-0.5">
                                        ${isML ? 'പഠിച്ചു കഴിഞ്ഞ അധ്യായങ്ങൾ ഇവിടെ ടിക്ക് ചെയ്യാം. അവ ഒഴിവാക്കി ബാക്കിയുള്ളവ ഷെഡ്യൂൾ ചെയ്യും.' : 'Mark chapters you already finished in school or tuition to skip them.'}
                                    </p>
                                </div>
                                <span id="completed-chaps-badge" class="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-[#EDE8DC] dark:bg-[#181A17] text-[#6E726A] dark:text-[#918D83] border border-[#D9D2C3] dark:border-[#31342E] shrink-0">0 completed</span>
                            </div>

                            <!-- Subject Tabs Switcher -->
                            <div id="setup-subject-tabs-container" class="flex flex-wrap gap-1.5 pt-1">
                                ${renderSetupSubjectTabs()}
                            </div>

                            <!-- Chapter List Container -->
                            <div id="setup-subject-chapters-list" class="bg-[#EDE8DC]/50 dark:bg-[#181A17] p-3 rounded-2xl border border-[#D9D2C3] dark:border-[#31342E]">
                                ${renderSetupSubjectChapters(activeSetupSubjectTab, activeSetupGradeTab)}
                            </div>

                            <!-- Step 3 Navigation -->
                            <div class="pt-5 flex items-center justify-between gap-3">
                                <button type="button" onclick="prevSetupStep()" class="min-h-[44px] py-2.5 px-5 rounded-xl border border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] text-[#474B45] dark:text-[#C4C0B6] font-bold text-xs hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] transition flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer">
                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                                    <span>${isML ? 'പിന്നോട്ട്' : 'Back'}</span>
                                </button>
                                <button type="button" onclick="nextSetupStep()" class="min-h-[44px] bg-[#1B5E43] hover:bg-[#144833] dark:bg-[#52B788] dark:hover:bg-[#67C79A] text-white dark:text-[#141513] font-bold text-sm py-2.5 px-8 rounded-xl shadow-xs transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer">
                                    <span>${isML ? 'തുടരുക' : 'Next'}</span>
                                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                </button>
                            </div>
                        </div>

                        <!-- STEP 4: Start Plan & Advanced Customization -->
                        <div id="setup-step-4" class="${setupCurrentStep === 4 ? '' : 'hidden'} space-y-5 animate-fade-in-up">
                            <div class="text-left">
                                <h3 class="text-xl sm:text-2xl font-serif font-bold text-[#181B18] dark:text-[#EFECE4] tracking-tight">
                                    ${isML ? 'പഠനം ആരംഭിക്കാം!' : 'Ready to Start!'}
                                </h3>
                                <p class="text-xs sm:text-sm text-[#474B45] dark:text-[#C4C0B6] mt-1">
                                    ${isML ? 'ഒരു ക്ലിക്കിൽ നിങ്ങളുടെ ഡെയ്‌ലി ടൈംടേബിൾ തയ്യാറാക്കാം.' : 'One click to generate your personalized daily timetable for Day 1.'}
                                </p>
                            </div>

                            <div class="study-capacity">
                                        <!-- Daily Hours -->
                                        <div>
                                            <span class="text-xs font-mono font-bold uppercase tracking-wider text-[#474B45] dark:text-[#C4C0B6] block mb-2">
                    ${isML ? ML_I18N.setup.hoursTitle : 'Daily Self-Study Hours'}
                                            </span>
                                            <div class="flex gap-2">
                                                <button type="button" id="hours-chip-2" onclick="setDailyHoursSelection(2)" class="min-h-[44px] flex-1 py-2.5 px-2 text-xs font-semibold rounded-xl bg-[#EDE8DC] dark:bg-[#181A17] text-[#474B45] dark:text-[#C4C0B6] border border-[#D9D2C3] dark:border-[#31342E] transition flex items-center justify-center active:scale-95 cursor-pointer">2 Hours</button>
                                                <button type="button" id="hours-chip-3_5" onclick="setDailyHoursSelection(3.5)" class="min-h-[44px] flex-1 py-2.5 px-2 text-xs font-black rounded-xl bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] shadow-xs transition flex items-center justify-center active:scale-95 cursor-pointer">3–4 Hours</button>
                                                <button type="button" id="hours-chip-5" onclick="setDailyHoursSelection(5)" class="min-h-[44px] flex-1 py-2.5 px-2 text-xs font-semibold rounded-xl bg-[#EDE8DC] dark:bg-[#181A17] text-[#474B45] dark:text-[#C4C0B6] border border-[#D9D2C3] dark:border-[#31342E] transition flex items-center justify-center active:scale-95 cursor-pointer">5+ Hours</button>
                                            </div>
                                        </div>


                                <p class="text-xs text-[#6E726A] dark:text-[#918D83] mt-2">${isML ? 'സ്കൂൾ, യാത്ര, വിശ്രമം എന്നിവയ്ക്ക് ശേഷം ലഭിക്കുന്ന സമയം തിരഞ്ഞെടുക്കുക.' : 'Choose time you can actually spare after school, travel and rest.'}</p>
                            </div>

                            <!-- Quick Summary Card -->
                            <div class="p-3.5 bg-[#EDE8DC]/60 dark:bg-[#181A17] rounded-2xl border border-[#D9D2C3] dark:border-[#31342E] space-y-2">
                                <div class="flex items-center justify-between text-xs">
                                    <span class="text-[#6E726A] dark:text-[#918D83] font-medium">${isML ? 'സ്ട്രീം' : 'Stream'}</span>
                                    <span id="summary-stream-badge" class="font-mono font-bold text-[#1B5E43] dark:text-[#52B788] bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] px-2 py-0.5 rounded-lg border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)]"></span>
                                </div>
                                <div class="flex items-center justify-between text-xs">
                                    <span class="text-[#6E726A] dark:text-[#918D83] font-medium">${isML ? 'പരീക്ഷാ തീയതി' : 'Target Date'}</span>
                                    <span id="summary-date-badge" class="font-mono font-bold text-[#181B18] dark:text-[#EFECE4]"></span>
                                </div>
                                <div class="flex items-center justify-between text-xs">
                                    <span class="text-[#6E726A] dark:text-[#918D83] font-medium">${isML ? 'പൂർത്തിയാക്കിയവ' : 'Completed Chapters'}</span>
                                    <div class="flex items-center gap-2">
                                        <span id="summary-completed-badge" class="font-mono font-bold text-[#1B5E43] dark:text-[#52B788]"></span>
                                        <button type="button" onclick="goToSetupStep(3)" class="min-h-[44px] inline-flex items-center text-xs text-[#1B5E43] dark:text-[#52B788] hover:underline font-bold px-2 cursor-pointer">${isML ? 'മാറ്റുക' : 'Edit'}</button>
                                    </div>
                                </div>
                            </div>

                            <!-- Primary Start Button -->
                            <button type="button" onclick="handleInitialSetup()" class="w-full bg-[#1B5E43] hover:bg-[#144833] dark:bg-[#52B788] dark:hover:bg-[#67C79A] text-white dark:text-[#141513] font-serif font-bold py-4 px-6 rounded-2xl shadow-sm transform active:scale-[0.98] transition-transform duration-150 flex items-center justify-center gap-2.5 text-base sm:text-lg cursor-pointer">
                                <span>${isML ? 'പ്ലാൻ തയ്യാറാക്കൂ (Day 1 ആരംഭിക്കാം)' : 'Start Day 1'}</span>
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                            </button>

                            <!-- Customize Study Hours & Routine Drawer (Clean Directory Style) -->
                            <details id="setup-advanced-accordion" class="group bg-[#FFFFFF] dark:bg-[#222521] hover:bg-[#EDE8DC]/60 dark:hover:bg-[#181A17] rounded-xl border border-[#D9D2C3] dark:border-[#31342E] p-2.5 transition text-left">
                                <summary class="font-bold text-[11px] sm:text-xs text-[#474B45] dark:text-[#C4C0B6] flex items-center justify-between select-none cursor-pointer">
                                    <span class="flex items-center gap-2">
                                        <svg class="w-3.5 h-3.5 inline-block text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                        <span>${isML ? 'കൂടുതൽ ക്രമീകരണങ്ങൾ (ഓപ്ഷണൽ)' : 'Personalize Schedule & Syllabus Scope (Optional)'}</span>
                                    </span>
                                    <span class="flex items-center gap-1.5 text-[10px] text-[#6E726A] dark:text-[#918D83] font-normal">
                                        <span class="group-open:hidden px-1.5 py-0.5 rounded bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] text-[#1B5E43] dark:text-[#52B788] font-mono font-semibold border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)]">${isML ? 'ഓപ്ഷണൽ' : 'Optional'}</span>
                                        <span class="group-open:hidden">${isML ? 'തുറക്കുക' : 'Tap to customize'}</span>
                                        <svg class="w-3.5 h-3.5 inline-block text-[#6E726A] group-open:rotate-180 transition" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                                    </span>
                                </summary>

                                <div class="mt-4 pt-4 border-t border-[#D9D2C3] dark:border-[#31342E] space-y-5 text-left">
                                    <!-- A. Target Term Scope (for +2 streams) -->
                                    ${selectedStream !== 'imp_only' ? `
                                        <div>
                                            <span class="text-xs font-mono font-bold text-[#6E726A] dark:text-[#918D83] uppercase tracking-wider block mb-2">
                                                ${isML ? 'സിലബസ് വ്യാപ്തി' : 'Syllabus Portion Scope'}
                                            </span>
                                            <div class="grid grid-cols-1 gap-2.5">
                                                <!-- Card 2: Term 1 & 2 -->
                                                <div id="term-card-2" onclick="setTermSelection(2)" class="cursor-pointer p-3.5 rounded-2xl border-2 border-[#1B5E43] dark:border-[#52B788] bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] ring-2 ring-[#1B5E43]/20 transition text-left flex items-start justify-between gap-3 shadow-xs">
                                                    <div>
                                                        <span class="text-xs font-mono font-bold text-[#1B5E43] dark:text-[#52B788] uppercase tracking-wider block mb-0.5">${isML ? ML_I18N.setup.term2Badge : 'Terms 1 & 2'}</span>
                                                        <h4 class="font-serif font-bold text-[#181B18] dark:text-[#EFECE4] text-sm">${isML ? ML_I18N.setup.term2Title : 'Term 1 & Term 2 Portions'}</h4>
                                                        <p id="term-desc-2" class="text-xs text-[#474B45] dark:text-[#C4C0B6] mt-0.5 font-medium">
                                                            ${selectedStream === 'bio' ? 'Christmas exam syllabus (~35 chapters).' : 'Christmas exam syllabus (~31 chapters).'}
                                                        </p>
                                                    </div>
                                                    <span class="w-5 h-5 rounded-full bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] flex items-center justify-center text-xs check-indicator shrink-0 mt-0.5">
                                                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                                                    </span>
                                                </div>

                                                <!-- Card 3: Full Year -->
                                                <div id="term-card-3" onclick="setTermSelection(3)" class="cursor-pointer p-3.5 rounded-2xl border-2 border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] hover:border-[#B9B09E] dark:hover:border-[#454940] transition text-left flex items-start justify-between gap-3">
                                                    <div>
                                                        <span class="text-xs font-mono font-bold text-[#2F486D] dark:text-[#8BA7CE] uppercase tracking-wider block mb-0.5">${isML ? ML_I18N.setup.term3Badge : 'Full Year'}</span>
                                                        <h4 class="font-serif font-bold text-[#181B18] dark:text-[#EFECE4] text-sm">${isML ? ML_I18N.setup.term3Title : 'Complete Public Exam Syllabus'}</h4>
                                                        <p id="term-desc-3" class="text-xs text-[#474B45] dark:text-[#C4C0B6] mt-0.5 font-medium">
                                                            ${selectedStream === 'bio' ? 'All 49 chapters for March Board Exams.' : 'All 46 chapters for March Board Exams.'}
                                                        </p>
                                                    </div>
                                                    <span class="w-5 h-5 rounded-full border border-[#D9D2C3] dark:border-[#31342E] flex items-center justify-center text-xs check-indicator shrink-0 mt-0.5"></span>
                                                </div>

                                                <!-- Card 1: Term 1 Only -->
                                                <div id="term-card-1" onclick="setTermSelection(1)" class="cursor-pointer p-3.5 rounded-2xl border-2 border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] hover:border-[#B9B09E] dark:hover:border-[#454940] transition text-left flex items-start justify-between gap-3">
                                                    <div>
                                                        <span class="text-xs font-mono font-bold text-[#6E726A] dark:text-[#918D83] uppercase tracking-wider block mb-0.5">${isML ? ML_I18N.setup.term1Badge : 'First Terminal'}</span>
                                                        <h4 class="font-serif font-bold text-[#181B18] dark:text-[#EFECE4] text-sm">${isML ? ML_I18N.setup.term1Title : 'Term 1 Only'}</h4>
                                                        <p id="term-desc-1" class="text-xs text-[#474B45] dark:text-[#C4C0B6] mt-0.5 font-medium">
                                                            ${selectedStream === 'bio' ? 'Onam exam portion (~18 chapters).' : 'Onam exam portion (~17 chapters).'}
                                                        </p>
                                                    </div>
                                                    <span class="w-5 h-5 rounded-full border border-[#D9D2C3] dark:border-[#31342E] flex items-center justify-center text-xs check-indicator shrink-0 mt-0.5"></span>
                                                </div>
                                            </div>
                                        </div>


                                    ` : ''}

                                    <!-- C. Weekly Rhythm & Hours -->
                                    <div class="pt-3 border-t border-[#D9D2C3] dark:border-[#31342E] space-y-3">
                                        <span class="text-xs font-mono font-bold text-[#6E726A] dark:text-[#918D83] uppercase tracking-wider block">
                                            ${isML ? ML_I18N.setup.rhythmTitle : 'Weekly Study Rhythm & Rest Day'}
                                        </span>
                                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            <div id="rhythm-card-balanced" onclick="setWeeklyRhythmSelection('balanced')" class="cursor-pointer p-2.5 rounded-xl border-2 border-[#1B5E43] dark:border-[#52B788] bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] text-left">
                                                <span class="font-bold text-[#181B18] dark:text-[#EFECE4] text-xs block">${isML ? ML_I18N.setup.rhythmBalancedTitle : 'Daily Balanced'}</span>
                                                <p class="text-[11px] text-[#474B45] dark:text-[#C4C0B6]">${isML ? ML_I18N.setup.rhythmBalancedDesc : 'Even daily pacing'}</p>
                                            </div>
                                            <div id="rhythm-card-weekend" onclick="setWeeklyRhythmSelection('weekend_booster')" class="cursor-pointer p-2.5 rounded-xl border-2 border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] text-left">
                                                <span class="font-bold text-[#181B18] dark:text-[#EFECE4] text-xs block">${isML ? ML_I18N.setup.rhythmWeekendTitle : 'Weekend Booster'}</span>
                                                <p class="text-[11px] text-[#474B45] dark:text-[#C4C0B6]">${isML ? ML_I18N.setup.rhythmWeekendDesc : 'Power study on Sat/Sun'}</p>
                                            </div>
                                            <div id="rhythm-card-sunday" onclick="setWeeklyRhythmSelection('rest_day', 0)" class="cursor-pointer p-2.5 rounded-xl border-2 border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] text-left">
                                                <span class="font-bold text-[#181B18] dark:text-[#EFECE4] text-xs block">${isML ? ML_I18N.setup.rhythmSundayTitle : 'Sunday Rest'}</span>
                                                <p class="text-[11px] text-[#474B45] dark:text-[#C4C0B6]">${isML ? ML_I18N.setup.rhythmSundayDesc : 'Zero new tasks on Sun'}</p>
                                            </div>
                                        </div>

                                        <!-- Intensity -->
                                        <div class="flex items-center justify-between gap-2 pt-1">
                                            <label for="study-intensity" class="text-xs font-bold text-[#181B18] dark:text-[#EFECE4]">${isML ? ML_I18N.setup.intensityLabel : 'Daily Study Pacing'}</label>
                                            <select id="study-intensity" class="min-h-[44px] text-xs font-bold bg-[#FFFFFF] dark:bg-[#181A17] border border-[#D9D2C3] dark:border-[#31342E] rounded-xl px-2.5 py-1 text-[#181B18] dark:text-[#EFECE4] outline-none">
                                                <option value="balanced" selected>${isML ? ML_I18N.setup.intensityBalanced : 'Standard (2-3 parts/day)'}</option>
                                                <option value="intense">${isML ? ML_I18N.setup.intensityIntense : 'Intensive (3-4+ parts/day)'}</option>
                                                <option value="light">${isML ? ML_I18N.setup.intensityLight : 'Relaxed (1-2 parts/day)'}</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </details>

                            <button type="button" onclick="prevSetupStep()" class="study-back">${isML ? 'പിന്നോട്ട്' : 'Back'}</button>
                        </div>
                    </div>
                `;

                setTimeout(() => {
                    goToSetupStep(setupCurrentStep || 1);
                }, 0);
                return;
            }

            // View 1: Today's Target View (Optimized for Short Attention Spans & Habit-Forming Daily Flow)
            if (currentView === 'today') {
                const localToday = getLocalDateStr();
                const daily = getDailyPlan(appState.plan, localToday);
                const { todayPlan, tomorrowPlan, yesterdayPlan } = daily;

                const tasks = todayPlan?.tasks ?? [];
                const completedCount = tasks.filter(task => task.completed).length;
                const orderedTasks = [...tasks.filter(task => !task.completed), ...tasks.filter(task => task.completed)];
                const todayGroups = compressSameDayTasks(orderedTasks, localToday);
                const overdueGroups = daily.overdueGroups || compressPendingOverdueDays(daily.overdueDays);
                const isPendingCompressed = overdueGroups.length < daily.overdueCount;
                const hasFutureTasks = appState.plan.some(d => d.date > localToday && d.tasks.some(t => !t.completed));
                const todayOfficialExams = Array.isArray(todayPlan?.officialExams) ? todayPlan.officialExams : [];
                const nextOfficialExam = !todayOfficialExams.length && typeof getOfficialExamEventsForPlan === 'function'
                    ? getOfficialExamEventsForPlan({
                        grade: appState.grade || '+2',
                        stream: appState.stream || 'cs',
                        startDate: localToday,
                        deadlineDate: appState.deadlineDate || '2027-03-30',
                        examCycle: appState.examCycle && appState.examCycle !== 'custom' ? appState.examCycle : null,
                    })[0] || null
                    : null;
                const officialExamBannerHTML = todayOfficialExams.length > 0
                    ? `<div class="p-3 rounded-2xl bg-[#F6EEDC] dark:bg-[rgba(223,172,84,0.14)] border border-[#DEC59A] dark:border-[rgba(223,172,84,0.32)] text-xs text-[#9C6418] dark:text-[#DFAC54] mb-3 flex items-center justify-between gap-2 flex-wrap" role="status">
                        <span class="font-bold flex items-center gap-1.5"><svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> ${isML ? 'ഇന്നത്തെ DHSE പരീക്ഷ' : 'Official DHSE Exam Today'}: ${escapeStudyText(todayOfficialExams.map(e => `${e.paperTitle} (${e.session} · ${e.time})`).join(' & '))}</span>
                        <span class="font-mono font-bold px-2 py-0.5 rounded-full bg-[#FFFFFF]/70 dark:bg-[#181A17] border border-[#DEC59A] dark:border-[rgba(223,172,84,0.3)] text-[11px]">${escapeStudyText(todayOfficialExams[0].examCycleShortName)}</span>
                    </div>`
                    : (nextOfficialExam
                        ? `<div class="p-2.5 rounded-xl bg-[#E7ECF3] dark:bg-[rgba(139,167,206,0.14)] border border-[#A6B8CE] dark:border-[rgba(139,167,206,0.32)] text-xs text-[#2F486D] dark:text-[#8BA7CE] mb-3 flex items-center justify-between gap-2 flex-wrap">
                            <span class="font-bold flex items-center gap-1.5"><svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg> ${isML ? 'അടുത്ത ഔദ്യോഗിക പരീക്ഷ' : 'Next Official Exam'}: ${escapeStudyText(nextOfficialExam.paperTitle)}</span>
                            <span class="font-mono font-bold text-[11px]">${escapeStudyText(nextOfficialExam.date)} (${escapeStudyText(nextOfficialExam.dayName)}) · ${escapeStudyText(nextOfficialExam.session)} ${escapeStudyText(nextOfficialExam.time)}</span>
                        </div>`
                        : '');

                const todayTasksHTML = tasks.length ? `
                    ${appState.diagnostics?.isInfeasible ? `<p class="daily-advisory">${escapeStudyText(appState.diagnostics.warningMessage || (isML ? 'പഠന സമയം അല്ലെങ്കിൽ അവസാന തീയതി ക്രമീകരിക്കുക.' : 'This plan needs more study time. Adjust your hours or target date.'))}</p>` : ''}
                    ${todayPlan.isExamEve ? `<p class="daily-advisory">${isML ? 'നാളത്തെ പരീക്ഷ' : 'Exam tomorrow'}: ${escapeStudyText(todayPlan.exclusiveSubject)}${todayPlan.upcomingOfficialExam ? ` (${escapeStudyText(todayPlan.upcomingOfficialExam.session)} · ${escapeStudyText(todayPlan.upcomingOfficialExam.time)})` : ''}</p>` : ''}
                    ${completedCount === tasks.length ? `
                        <div class="daily-finished" role="status">
                            <div class="flex items-center justify-between flex-wrap gap-2.5">
                                <div>
                                    <strong class="text-[#1B5E43] dark:text-[#52B788] font-serif font-bold text-base">${isML ? '🎉 ഇന്നത്തെ പഠനം പൂർത്തിയായി!' : '🎉 Today is complete! Great work!'}</strong>
                                    <p class="text-xs text-[#474B45] dark:text-[#C4C0B6] mt-0.5">${hasFutureTasks ? (isML ? 'മുൻകൂട്ടി പഠിക്കാൻ തയ്യാറാണോ? നാളത്തെ ഭാഗങ്ങൾ ഇന്നത്തേക്ക് കൊണ്ടുവരാം.' : 'Want to keep momentum going? Fast-forward next chapters to Today.') : (isML ? 'മുഴുവൻ സിലബസും പൂർത്തിയായി.' : 'All portions finished!')}</p>
                                </div>
                                ${hasFutureTasks ? `
                                    <button type="button" onclick="compactPlanToToday()" class="min-h-[44px] py-2 px-3.5 bg-[#9C6418] hover:bg-[#7E4F10] dark:bg-[#DFAC54] dark:hover:bg-[#E8BC6E] active:scale-95 text-white dark:text-[#141513] text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer">
                                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                        <span>${isML ? 'അടുത്ത ഭാഗങ്ങൾ ഇപ്പോൾ പഠിക്കാം' : 'Fast-Track Next Chapters to Today'}</span>
                                    </button>
                                ` : ''}
                            </div>
                        </div>` : ''}
                    <ol class="daily-tasks" aria-label="${isML ? 'ഇന്നത്തെ പഠനം' : 'Today’s timetable'}">
                        ${todayGroups.map(group => {
                            const task = group.primaryTask;
                            const key = encodeURIComponent(String(task.id));
                            const handbookUrl = getHandbookUrl(task, appState);
                            const scopeLabel = group.isMultiTask ? formatCompressedGroupScope(group, isML) : '';
                            const mins = group.totalMinutes || task.estimatedMinutes || 0;
                            const topicDisplay = group.isMultiTask ? formatGroupTopicSummary(group, isML) : formatTaskTopicTitle(task);
                            const groupIdsCsv = group.taskIds.join(',');
                            return `<li class="daily-task ${group.completed ? 'is-complete' : ''}">
                                <div class="daily-task-content">
                                    <div class="daily-task-meta"><span>${escapeStudyText(task.subject)}</span>${task.grade ? `<span>${escapeStudyText(task.grade)}${task.term ? ` · Term ${escapeStudyText(task.term)}` : ''}</span>` : ''}${scopeLabel ? `<span class="daily-scope-badge ${group.isFullChapter ? 'is-full' : ''}">${escapeStudyText(scopeLabel)}</span>` : ''}${mins ? `<span>${escapeStudyText(mins)} min</span>` : ''}${group.completed ? `<span class="daily-done-label">${isML ? 'പൂർത്തിയായി' : 'Completed'}</span>` : ''}</div>
                                    <h3 id="task-${key}">${escapeStudyText(getTaskChapterTitle(task))}</h3>
                                    <p class="daily-topic">${escapeStudyText(topicDisplay)}</p>
                                    ${handbookUrl ? `<div class="daily-task-actions"><a href="${handbookUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="daily-notes-btn" title="${isML ? 'ഹാൻഡ്ബുക്ക് / നോട്ട്സ് കാണുക' : 'Open chapter study notes (PDF)'}">📖 Notes</a></div>` : ''}
                                    <details id="resources-${key}" class="daily-resources" ${openSections.has('resources-' + key) ? 'open' : ''}>
                                        <summary>${isML ? 'പഠന സഹായികൾ' : 'Study resources'}</summary>
                                        <div><button type="button" data-study-tutor="${escapeStudyText(task.id)}">${isML ? 'AI പഠന സഹായി' : 'AI study tutor'}</button></div>
                                    </details>
                                </div>
                                <button type="button" class="daily-toggle" data-study-task="${escapeStudyText(group.actionTaskId)}" ${group.isMultiTask ? `data-study-tasks="${escapeStudyText(groupIdsCsv)}"` : ''} aria-pressed="${!!group.completed}" aria-describedby="task-${key}">${group.completed ? (isML ? 'തിരിച്ചെടുക്കുക' : 'Undo') : (isML ? 'പൂർത്തിയായി' : 'Mark done')}</button>
                            </li>`;
                        }).join('')}
                    </ol>
                ` : `<div class="daily-empty">
                    <h3>${isML ? 'ഇന്നത്തേക്ക് പഠന ഭാഗങ്ങളില്ല' : 'No tasks scheduled today'}</h3>
                    <p>${todayPlan ? (isML ? 'ഇന്ന് വിശ്രമിക്കാം. നാളത്തെ പ്ലാൻ താഴെ കാണാം.' : 'Take a rest day. Tomorrow’s timetable is below.') : (isML ? 'മുഴുവൻ പ്ലാനിൽ നിങ്ങളുടെ പഠന തീയതികൾ കാണാം.' : 'Check Full Plan for your scheduled dates. Earlier unfinished work stays under Pending.')}</p>
                    <div class="flex items-center justify-center gap-2 mt-3 flex-wrap">
                        <button type="button" onclick="goToPlan()">${isML ? 'മുഴുവൻ പ്ലാൻ' : 'View full plan'}</button>
                        ${appState.plan.some(d => d.tasks.some(t => !t.completed)) ? `
                            <button type="button" onclick="compactPlanToToday()" class="min-h-[44px] bg-[#9C6418] hover:bg-[#7E4F10] dark:bg-[#DFAC54] dark:hover:bg-[#E8BC6E] text-white dark:text-[#141513] font-bold py-2 px-3.5 rounded-xl text-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                <span>${isML ? 'അടുത്ത ഭാഗങ്ങൾ ഇന്നത്തേക്ക് കൊണ്ടുവരിക' : 'Pull Next Chapters to Today'}</span>
                            </button>
                        ` : ''}
                    </div>
                </div>`;

                container.innerHTML = `
                    <section id="today-overview" class="study-overview" aria-labelledby="today-heading">
                        <div>
                            <h2 id="today-heading" class="font-serif text-2xl sm:text-3xl font-bold text-[#181B18] dark:text-[#EFECE4] tracking-tight">${isML ? 'ഇന്നത്തെ പഠനം' : "Today's study"}</h2>
                            <p>${todayPlan ? todayPlan.tasks.filter(t => t.completed).length : 0} / ${todayPlan ? todayPlan.tasks.length : 0} ${isML ? 'പൂർത്തിയായി' : 'tasks complete'}</p>
                        </div>
                        <button type="button" onclick="openRegenerateModal()" class="study-adjust">${isML ? 'പ്ലാൻ ക്രമീകരിക്കുക' : 'Adjust plan'}</button>
                    </section>

                    ${typeof renderDashboardRestoreBanner === 'function' ? renderDashboardRestoreBanner() : ''}

                    <p class="study-date">${localToday}</p>
                    ${officialExamBannerHTML}
                    ${daily.overdueCount ? `
                        <p class="pending-notice" role="status" onclick="openPendingWork(event)">
                            <svg class="w-3.5 h-3.5 mr-1 inline-block opacity-85" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            <span>${daily.overdueCount} ${isML ? 'മുൻ ദിവസങ്ങളിൽ ബാക്കിയുണ്ട്.' : 'unfinished from previous days.'}${isPendingCompressed ? ` (${overdueGroups.length} ${isML ? 'അധ്യായങ്ങൾ' : (overdueGroups.length === 1 ? 'chapter' : 'chapters')})` : ''}</span>
                            <a href="#pending-work" onclick="openPendingWork(event)" class="pending-link font-bold underline ml-1" aria-label="${isML ? 'മുൻ ദിവസങ്ങളിലെ ബാക്കി പഠനം കാണുക' : 'View pending tasks from previous days'}">
                                ${isML ? 'കാണുക' : 'View pending'}
                            </a>
                        </p>` : ''}
                    ${yesterdayPlan?.tasks.length ? `<p class="study-history">${isML ? 'ഇന്നലെ' : 'Yesterday'}: ${yesterdayPlan.tasks.filter(task => task.completed).length} / ${yesterdayPlan.tasks.length} ${isML ? 'പൂർത്തിയായി' : 'completed'}</p>` : ''}

                    <!-- Main Section: Today's Targets -->
                    <div id="today-tasks" class="daily-board">
                        ${todayTasksHTML}
                    </div>

                    ${daily.overdueCount ? `
                        <details id="pending-work" class="study-pending" ${openSections.has('pending-work') || (typeof window !== 'undefined' && window.location && window.location.hash === '#pending-work') ? 'open' : ''}>
                            <summary>${isML ? 'മുൻ ദിവസങ്ങളിലെ ബാക്കി പഠനം' : 'Pending from previous days'} (${isPendingCompressed ? `${overdueGroups.length} ${isML ? 'അധ്യായങ്ങൾ' : (overdueGroups.length === 1 ? 'chapter' : 'chapters')} · ${daily.overdueCount} ${isML ? 'ഭാഗങ്ങൾ' : 'parts'}` : daily.overdueCount})</summary>
                            <div class="pending-list">
                                ${overdueGroups.map(group => {
                                    const task = group.primaryTask;
                                    const pendingHandbookUrl = getHandbookUrl(task, appState);
                                    const scopeLabel = group.chapterKey ? formatCompressedGroupScope(group, isML) : '';
                                    const dateSpan = formatPendingDateSpan(group.dates, daily.yesterdayDate, isML);
                                    const mins = group.totalMinutes || task.estimatedMinutes || 0;
                                    const topicDisplay = group.isMultiTask ? formatGroupTopicSummary(group, isML) : formatTaskTopicTitle(task);
                                    const btnLabel = group.isMultiTask
                                        ? (group.isFullChapter
                                            ? (isML ? 'അധ്യായം പൂർത്തിയാക്കുക' : 'Complete Chapter')
                                            : (isML ? `${group.tasks.length} ഭാഗങ്ങൾ പൂർത്തിയാക്കുക` : `Mark ${group.tasks.length} parts done`))
                                        : (isML ? 'പൂർത്തിയായി' : 'Mark done');
                                    const groupIdsCsv = group.taskIds.join(',');
                                    return `
                                        <div class="pending-task">
                                            <div class="pending-task-body">
                                                <div class="pending-task-badges">
                                                    <span class="pending-badge pending-badge-subject">${escapeStudyText(task.subject)}</span>
                                                    ${renderTaskGradeBadge(task)}
                                                    ${scopeLabel ? `<span class="pending-badge pending-badge-scope ${group.isFullChapter ? 'is-full' : ''}">${escapeStudyText(scopeLabel)}</span>` : ''}
                                                    ${mins ? `<span class="pending-badge pending-badge-duration">⏱️ ${escapeStudyText(mins)} min</span>` : ''}
                                                    ${dateSpan ? `<span class="pending-badge pending-badge-dates">${escapeStudyText(dateSpan)}</span>` : ''}
                                                </div>
                                                <p class="pending-chapter-title">${escapeStudyText(getTaskChapterTitle(task))}</p>
                                                <small class="pending-topic-summary">${escapeStudyText(topicDisplay)}</small>
                                                ${pendingHandbookUrl ? `<div><a href="${pendingHandbookUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="daily-notes-btn" style="margin-top: 6px; padding: 2px 10px; font-size: 11px;" title="${isML ? 'ഹാൻഡ്ബുക്ക് / നോട്ട്സ് കാണുക' : 'Open chapter study notes (PDF)'}">📖 Notes</a></div>` : ''}
                                            </div>
                                            <button type="button" data-pending-task="${escapeStudyText(group.actionTaskId)}" ${group.isMultiTask ? `data-pending-tasks="${escapeStudyText(groupIdsCsv)}"` : ''}>${escapeStudyText(btnLabel)}</button>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </details>
                    ` : ''}
                    ${tomorrowPlan ? `
                        <details id="tomorrow-preview" class="study-tomorrow" ${openSections.has('tomorrow-preview') ? 'open' : ''}>
                            <summary>${isML ? 'നാളെ' : 'Tomorrow'} · ${tomorrowPlan.date} · ${tomorrowPlan.tasks.length} ${isML ? 'പഠന ഭാഗങ്ങൾ' : 'tasks'}</summary>
                            ${tomorrowPlan.tasks.length ? `<ul>${tomorrowPlan.tasks.map(task => `<li><strong>${escapeStudyText(task.subject)}</strong> — ${escapeStudyText(getTaskChapterTitle(task))}<p>${escapeStudyText(formatTaskTopicTitle(task))}</p></li>`).join('')}</ul>` : `<p>${isML ? 'വിശ്രമ ദിവസം' : 'Rest day — no study tasks scheduled.'}</p>`}
                        </details>
                    ` : ''}

                    <details id="plan-tools" class="study-tools no-print" ${openSections.has('plan-tools') ? 'open' : ''}>
                        <summary>${isML ? 'പ്ലാൻ ഉപകരണങ്ങൾ' : 'Plan tools: print, share or reset'}</summary>
                        <!-- Quick Action Bar -->
                    <div class="study-tool-actions no-print">
                        <div class="flex items-center gap-2">
                            <button onclick="printSchedule()" class="min-h-[44px] flex items-center gap-1.5 bg-[#FFFFFF] dark:bg-[#222521] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] text-[#181B18] dark:text-[#EFECE4] border border-[#D9D2C3] dark:border-[#31342E] font-bold text-xs py-2 px-3 sm:px-3.5 rounded-xl transition active:scale-95 cursor-pointer" title="Print full schedule or save as PDF">
                                <svg class="w-3.5 h-3.5 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                                <span>${isML ? ML_I18N.dashboard.printSchedule : 'Print / PDF'}</span>
                            </button>
                            <button onclick="openRegenerateModal()" class="min-h-[44px] flex items-center gap-1.5 bg-[#FFFFFF] dark:bg-[#222521] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] text-[#181B18] dark:text-[#EFECE4] border border-[#D9D2C3] dark:border-[#31342E] font-semibold text-xs py-2 px-3 rounded-xl transition active:scale-95 cursor-pointer" title="Recalculate schedule if you missed days">
                                <svg class="w-3.5 h-3.5 text-[#6E726A] dark:text-[#918D83]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                                <span>${isML ? ML_I18N.dashboard.adjustPlan : 'Adjust Plan'}</span>
                            </button>
                        </div>
                        <button onclick="shareApp()" class="min-h-[44px] flex items-center gap-1.5 bg-[#FFFFFF] dark:bg-[#222521] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] text-[#181B18] dark:text-[#EFECE4] border border-[#D9D2C3] dark:border-[#31342E] font-semibold text-xs py-2 px-3 rounded-xl transition active:scale-95 cursor-pointer">
                            <svg class="w-3.5 h-3.5 text-[#6E726A] dark:text-[#918D83]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
                            <span>${isML ? ML_I18N.dashboard.share : 'Share'}</span>
                        </button>
                    </div>
                        <!-- Clean Bottom Controls -->
                    <div class="study-tool-recovery border-t border-[#D9D2C3] dark:border-[#31342E] text-xs text-[#6E726A] dark:text-[#918D83] no-print">
                        <button onclick="openRegenerateModal()" class="min-h-[44px] text-[#474B45] dark:text-[#C4C0B6] hover:text-[#181B18] dark:hover:text-[#EFECE4] font-medium transition inline-flex items-center gap-1.5 cursor-pointer">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><polyline points="21 3 21 8 16 8"/></svg>
                            <span>${isML ? ML_I18N.dashboard.fellBehind : 'Fell behind? Recalculate remaining portions'}</span>
                        </button>
                        <button onclick="resetApp()" class="min-h-[44px] text-[#6E726A] dark:text-[#918D83] hover:text-[#B8432E] dark:hover:text-[#E57A65] transition underline inline-flex items-center cursor-pointer">
                            ${isML ? ML_I18N.dashboard.resetPlan : 'Reset Plan'}
                        </button>
                    </div>
                    </details>
                `;

                (container.querySelectorAll?.('[data-pending-task]') ?? []).forEach(button => {
                    button.addEventListener('click', () => {
                        const groupIds = button.dataset.pendingTasks || button.dataset.pendingTask;
                        toggleTaskDirect(button.dataset.pendingTask, groupIds);
                    });
                });
                (container.querySelectorAll?.('[data-study-task]') ?? []).forEach(button => {
                    button.addEventListener('click', () => {
                        const groupIds = button.dataset.studyTasks || button.dataset.studyTask;
                        toggleTaskDirect(button.dataset.studyTask, groupIds);
                    });
                });
                (container.querySelectorAll?.('[data-study-tutor]') ?? []).forEach(button => {
                    button.addEventListener('click', () => openAiTutorModal(button.dataset.studyTutor));
                });
                return;
            }

            // View 2: Detailed Full Plan View (With subject filters & printable PDF export)
            if (currentView === 'plan') {
                let planDaysHTML = '';

                appState.plan.forEach(day => {
                    const isToday = (day.date === getLocalDateStr());

                    let displayedTasks = day.tasks;
                    if (currentPlanSubjectFilter !== 'All') {
                        displayedTasks = day.tasks.filter(t => t.subject === currentPlanSubjectFilter);
                    }

                    // If a specific subject is filtered and this day has none, don't clutter the view
                    if (currentPlanSubjectFilter !== 'All' && displayedTasks.length === 0) {
                        return;
                    }

                    planDaysHTML += `
                        <div class="bg-[#FBF9F4] dark:bg-[#1B1D1A] rounded-2xl border ${isToday ? 'border-[#1B5E43] dark:border-[#52B788] ring-2 ring-[#1B5E43]/20' : 'border-[#D9D2C3] dark:border-[#31342E]'} shadow-none overflow-hidden mb-4 transition-all print-avoid-break" data-day-number="${day.dayNumber}">
                            <div class="p-3.5 sm:p-4 bg-[#EDE8DC] dark:bg-[#181A17] border-b border-[#D9D2C3] dark:border-[#31342E] flex flex-wrap items-center justify-between gap-2">
                                <div class="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                                    <span class="text-xs font-mono font-bold text-[#181B18] dark:text-[#EFECE4]">${isML ? `${ML_I18N.plan.day} ${day.dayNumber}` : `Day ${day.dayNumber}`}</span>
                                    <span class="text-xs font-mono text-[#6E726A] dark:text-[#918D83]">(${day.date})</span>
                                    ${isToday ? `<span class="text-xs font-mono font-bold bg-[#1B5E43] text-white dark:bg-[#52B788] dark:text-[#141513] px-2 py-0.5 rounded-full no-print">${isML ? ML_I18N.plan.todayBadge : 'TODAY'}</span>` : ''}
                                    ${day.isCompletedMarker ? `<span class="text-xs font-bold bg-[#E4EFE9] text-[#1B5E43] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)] px-2 py-0.5 rounded-full flex items-center gap-1"><svg class="w-3 h-3 text-[#1B5E43] dark:text-[#52B788] inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>${isML ? 'പൂർത്തിയായി' : 'Completed'}</span>` : ''}
                                    ${day.isExamEve ? `<span class="text-xs font-black bg-[#F9E9E5] text-[#B8432E] border border-[#E8B4A9] dark:bg-[rgba(229,122,101,0.14)] dark:text-[#E57A65] dark:border-[rgba(229,122,101,0.3)] px-2 py-0.5 rounded-full flex items-center gap-1"><svg class="w-3 h-3 text-[#B8432E] dark:text-[#E57A65]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>${isML ? `പരീക്ഷത്തലേന്ന്: ${day.exclusiveSubject}` : `🔥 Exam Eve: ${day.exclusiveSubject} Only`}</span>` : ''}
                                    ${Array.isArray(day.officialExams) && day.officialExams.length > 0
                                        ? day.officialExams.map(ev => `<span class="text-xs font-bold bg-[#F6EEDC] text-[#9C6418] border border-[#DEC59A] dark:bg-[rgba(223,172,84,0.14)] dark:text-[#DFAC54] dark:border-[rgba(223,172,84,0.3)] px-2 py-0.5 rounded-full flex items-center gap-1"><svg class="w-3 h-3 text-[#9C6418] dark:text-[#DFAC54]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>${escapeStudyText(ev.examCycleShortName)}: ${escapeStudyText(ev.paperTitle)} (${escapeStudyText(ev.session)} ${escapeStudyText(ev.time)})</span>`).join('')
                                        : (day.isExamDay ? `<span class="text-xs font-bold bg-[#F6EEDC] text-[#9C6418] border border-[#DEC59A] dark:bg-[rgba(223,172,84,0.14)] dark:text-[#DFAC54] dark:border-[rgba(223,172,84,0.3)] px-2 py-0.5 rounded-full flex items-center gap-1"><svg class="w-3 h-3 text-[#9C6418] dark:text-[#DFAC54]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>${isML ? `പരീക്ഷാദിനം: ${day.examSubject}` : `🎯 Exam Day: ${day.examSubject}`}</span>` : '')}
                                    ${day.isPracticalMilestone ? `<span class="text-xs font-bold bg-[#E4EFE9] text-[#1B5E43] border border-[#9DC3B2] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] dark:border-[rgba(82,183,136,0.3)] px-2 py-0.5 rounded-full">🧪 ${isML ? 'പ്രാക്ടിക്കൽ പരീക്ഷകൾ ആരംഭിക്കുന്നു' : 'DHSE Practicals Begin'}</span>` : ''}
                                    ${day.isChristmasVacation ? `<span class="text-xs font-bold bg-[#E7ECF3] text-[#2F486D] border border-[#A6B8CE] dark:bg-[rgba(139,167,206,0.14)] dark:text-[#8BA7CE] dark:border-[rgba(139,167,206,0.3)] px-2 py-0.5 rounded-full">🎄 ${isML ? 'ക്രിസ്മസ് അവധി' : 'Xmas Break'}</span>` : ''}
                                    ${day.isRevisionDay ? `<span class="text-xs font-bold bg-[#E7ECF3] text-[#2F486D] border border-[#A6B8CE] dark:bg-[rgba(139,167,206,0.14)] dark:text-[#8BA7CE] dark:border-[rgba(139,167,206,0.3)] px-2 py-0.5 rounded-full">${isML ? ML_I18N.plan.revisionDay : 'Revision Day'}</span>` : ''}
                                    ${day.isRestDay ? `<span class="text-xs font-bold bg-[#E4EFE9] text-[#1B5E43] border border-[#9DC3B2] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] dark:border-[rgba(82,183,136,0.3)] px-2 py-0.5 rounded-full inline-flex items-center gap-1"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>${isML ? ML_I18N.plan.restDay : 'Rest Day'}</span>` : ''}
                                </div>
                                <span class="day-card-counter text-xs font-bold text-slate-600 dark:text-slate-400 font-mono">${displayedTasks.filter(t => t.completed).length}/${displayedTasks.length} ${isML ? ML_I18N.plan.done : 'Done'}</span>
                            </div>

                            <div class="p-3 sm:p-4 divide-y divide-[#D9D2C3]/60 dark:divide-[#31342E]">
                                ${displayedTasks.length === 0 ? (day.isRestDay ? `<p class="text-xs text-[#1B5E43] dark:text-[#52B788] font-semibold py-1.5 flex items-center gap-2"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg><span>${isML ? ML_I18N.plan.restDayNotice : 'Personalized Rest & Recharge Day (0 new chapters)'}</span></p>` : `<p class="text-xs text-[#6E726A] dark:text-[#918D83] italic py-1">${isML ? 'ഫ്രീ / ബഫർ ദിനം' : 'Free / Buffer Day'}</p>`) : ''}
                                ${compressSameDayTasks(displayedTasks, day.date).map((group, groupIdx, allDayGroups) => {
                                    const task = group.primaryTask;
                                    const badgeColor = getSubjectColorBadge(task.subject);
                                    const actionIdSafe = escapeStudyText(group.actionTaskId);
                                    const groupIdsSafe = escapeStudyText(group.taskIds.join(','));
                                    const toggleArgs = group.isMultiTask
                                        ? `'${actionIdSafe}', '${groupIdsSafe}'`
                                        : `'${actionIdSafe}'`;
                                    const combinedMinutes = group.totalMinutes || (group.tasks.length * 60);
                                    const topicDisplay = group.isMultiTask ? formatGroupTopicSummary(group, isML) : formatTaskTopicTitle(task);
                                    return `
                                        <div class="task-item-container py-2.5 first:pt-0 last:pb-0 flex items-start gap-3">
                                            <!-- Working Clickable Checkbox in Full Plan -->
                                            <div class="task-checkbox ${group.completed ? 'checked' : ''} mt-0.5" role="checkbox" tabindex="0" aria-checked="${!!group.completed}" aria-label="${escapeStudyText(task.subject + ' - ' + getTaskChapterTitle(task))}" data-task-id="${actionIdSafe}" ${group.isMultiTask ? `data-group-task-ids="${groupIdsSafe}"` : ''} onclick="event.stopPropagation(); toggleTaskDirect(${toggleArgs})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();toggleTaskDirect(${toggleArgs});}">
                                                <svg class="svg-check" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                            </div>
                                            <div class="flex-1 min-w-0 cursor-pointer" onclick="toggleTaskDirect(${toggleArgs})">
                                                <div class="flex flex-wrap items-center gap-1.5 mb-1">
                                                    <span class="text-xs font-bold px-1.5 py-0.5 rounded ${badgeColor}">${escapeStudyText(task.subject)}</span>
                                                    ${renderTaskDailySlotBadge(groupIdx, allDayGroups.length, isML)}
                                                    ${group.isFocusSubject ? '<span class="text-xs font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">🎯 FOCUS</span>' : ''}
                                                    ${renderTaskGradeBadge(task)}
                                                    ${renderGroupPartBadge(group, isML)}
                                                    ${getTaskResourceBadge({ ...task, estimatedMinutes: combinedMinutes })}
                                                </div>
                                                <div class="text-xs sm:text-sm font-bold text-[#181B18] dark:text-[#EFECE4] task-text-content ${group.completed ? 'line-through opacity-50' : ''}">
                                                    ${escapeStudyText(getTaskChapterTitle(task))} - <span class="font-normal text-[#474B45] dark:text-[#C4C0B6]">${escapeStudyText(topicDisplay)}</span>
                                                </div>
                                                ${getTaskDeepLinksHtml(task)}
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                });

                if (!planDaysHTML) {
                    planDaysHTML = `
                        <div class="bg-[#FBF9F4] dark:bg-[#1B1D1A] rounded-2xl border border-[#D9D2C3] dark:border-[#31342E] p-8 text-center text-[#6E726A] dark:text-[#918D83]">
                            <div class="flex justify-center mb-2 text-[#B9B09E] dark:text-[#454940]"><svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg></div>
                            <p class="text-xs font-semibold">${isML ? ML_I18N.plan.noTasks : `No scheduled tasks found under "${currentPlanSubjectFilter}".`}</p>
                            <button onclick="setPlanSubjectFilter('All')" class="mt-3 text-xs font-bold text-[#1B5E43] dark:text-[#52B788] hover:underline cursor-pointer">${isML ? ML_I18N.plan.showAll : 'Show All Subjects'}</button>
                        </div>
                    `;
                }

                container.innerHTML = `
                    <!-- Print-Only Page Header -->
                    <div class="print-only mb-6 border-b-2 border-[#181B18] pb-3">
                        <div class="flex justify-between items-start">
                            <div>
                                <h1 class="text-2xl font-serif font-bold text-[#181B18] tracking-tight">+1 +2 Planner — Malabar Study Ledger</h1>
                                <p class="text-xs text-[#474B45] font-semibold mt-0.5">Kerala Higher Secondary (HSS • Plus One & Plus Two) Scheme of Work</p>
                            </div>
                            <div class="text-right text-xs font-mono">
                                <span class="font-bold text-[#181B18] block">Deadline: ${new Date(appState.deadlineDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}</span>
                                <span class="text-[#6E726A]">Generated: ${new Date().toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Screen Header -->
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 no-print">
                        <div>
                            <h2 class="text-xl sm:text-2xl font-serif font-bold text-[#181B18] dark:text-[#EFECE4] tracking-tight">${isML ? ML_I18N.plan.title : 'Complete Study Schedule'}</h2>
                            <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                                <p class="text-xs text-[#474B45] dark:text-[#C4C0B6]">${isML ? ML_I18N.plan.subtitle : 'Every single day planned out until your deadline.'}</p>
                                <span id="plan-progress-summary" class="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#E4EFE9] text-[#1B5E43] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)]">${getOverallStats().percentage}% ${isML ? 'പൂർത്തിയായി' : 'Done'} (${getOverallStats().completedCount}/${getOverallStats().totalCount})</span>
                            </div>
                        </div>
                        <!-- Screen Header Action Bar (Clean Mobile Overflow Sheet < 640px, Full Controls >= 640px) -->
                        <div class="flex items-center flex-wrap gap-2">
                            <!-- MOBILE VIEW (< 640px): Grouped Share & Export Bottom Sheet Trigger -->
                            <div class="sm:hidden flex items-center gap-2">
                                <button id="plan-actions-overflow-btn" type="button" onclick="openExportShareSheet()" class="min-h-[44px] min-w-[44px] text-xs font-bold bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] px-3 py-2.5 rounded-xl text-[#181B18] dark:text-[#EFECE4] transition flex items-center gap-1.5 active:scale-95 cursor-pointer" title="Export & Share Options" aria-haspopup="dialog" aria-expanded="false">
                                    <svg class="w-3.5 h-3.5 text-[#2F486D] dark:text-[#8BA7CE] fa-solid fa-arrow-up-from-bracket" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
                                    <span>${isML ? 'ഷെയർ / എക്സ്പോർട്ട്' : 'Share / Export'}</span>
                                    <svg class="w-3.5 h-3.5 text-[#6E726A] dark:text-[#918D83] ml-0.5 fa-solid fa-ellipsis-vertical" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                                </button>
                            </div>

                            <!-- DESKTOP / TABLET VIEW (>= 640px): Full Accessible Inline Toolbar -->
                            <div class="hidden sm:flex items-center gap-2">
                                <button id="plan-desktop-ics-btn" type="button" onclick="exportTimetableIcs()" class="min-h-[44px] text-xs font-bold bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] px-3.5 py-2.5 rounded-xl text-[#181B18] dark:text-[#EFECE4] transition flex items-center gap-1.5 active:scale-95 cursor-pointer" title="Export to Google Calendar, Apple Calendar, or Outlook (.ics)">
                                    <svg class="w-3.5 h-3.5 text-[#9C6418] dark:text-[#DFAC54]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
                                    <span>${isML ? 'കലണ്ടർ (.ics)' : 'Add to Calendar'}</span>
                                </button>
                                <button id="plan-desktop-csv-btn" type="button" onclick="exportTimetableCsv()" class="min-h-[44px] text-xs font-bold bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] px-3.5 py-2.5 rounded-xl text-[#181B18] dark:text-[#EFECE4] transition flex items-center gap-1.5 active:scale-95 cursor-pointer" title="Export as CSV spreadsheet">
                                    <svg class="w-3.5 h-3.5 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>
                                    <span>${isML ? 'എക്സ്പോർട്ട് CSV' : 'Export CSV'}</span>
                                </button>
                                <button id="plan-desktop-share-btn" type="button" onclick="shareApp()" class="min-h-[44px] text-xs font-bold bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] px-3.5 py-2.5 rounded-xl text-[#181B18] dark:text-[#EFECE4] transition flex items-center gap-1.5 active:scale-95 cursor-pointer" title="Share plan with friends">
                                    <svg class="w-3.5 h-3.5 text-[#2F486D] dark:text-[#8BA7CE]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
                                    <span>${isML ? 'പങ്കുവെക്കുക' : 'Share'}</span>
                                </button>
                            </div>

                            <!-- ALWAYS VISIBLE: Print / PDF & Back to Today (Elevated to 44px) -->
                            <button id="plan-print-btn" type="button" onclick="printTimetable()" class="min-h-[44px] text-xs font-bold bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] px-3.5 py-2.5 rounded-xl text-[#181B18] dark:text-[#EFECE4] transition flex items-center gap-1.5 active:scale-95 cursor-pointer" title="Print schedule or save as PDF">
                                <svg class="w-3.5 h-3.5 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                                <span>${isML ? ML_I18N.plan.printPdf : 'Print / Save PDF'}</span>
                            </button>
                            <button id="plan-back-btn" type="button" onclick="goToDashboard()" class="min-h-[44px] text-xs font-bold bg-[#1B5E43] hover:bg-[#144833] dark:bg-[#52B788] dark:hover:bg-[#67C79A] px-3.5 py-2.5 rounded-xl text-white dark:text-[#141513] transition flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer">
                                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                                <span>${isML ? ML_I18N.plan.backToToday : 'Back to Today'}</span>
                            </button>
                        </div>
                    </div>

                    ${typeof renderDashboardRestoreBanner === 'function' ? renderDashboardRestoreBanner() : ''}

                    <!-- Subject Filter Tabs (Horizontal Scrollable Pills strictly stream-isolated) -->
                    <div class="no-print flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-none text-xs">
                        ${(function() {
                            const userStream = appState?.stream || (appState?.plan?.some(d => d.tasks.some(t => t.subject === 'Botany' || t.subject === 'Zoology')) ? 'bio' : 'cs');
                            const subjectIcons = {
                                'Physics': 'fa-atom',
                                'Chemistry': 'fa-flask',
                                'Mathematics': 'fa-calculator',
                                'Computer Science': 'fa-laptop-code',
                                'Botany': 'fa-seedling',
                                'Zoology': 'fa-dna',
                                'Accountancy': 'fa-calculator',
                                'Business Studies': 'fa-briefcase',
                                'Economics': 'fa-chart-line',
                                'Computer Applications': 'fa-desktop',
                                'History': 'fa-landmark',
                                'Political Science': 'fa-scale-balanced',
                                'Sociology': 'fa-users',
                            };
                            const streamSubs = getStreamSubjects(userStream);
                            const activeSubs = streamSubs;
                            const filters = [
                                { id: 'All', label: isML ? ML_I18N.plan.allSubjects : 'All Subjects', icon: 'fa-layer-group' },
                                ...activeSubs.map(s => ({
                                    id: s,
                                    label: s === 'Mathematics' ? 'Maths' : s === 'Computer Science' ? 'CS' : s === 'Business Studies' ? 'Business' : s === 'Computer Applications' ? 'CA' : s === 'Political Science' ? 'Pol Science' : s,
                                    icon: subjectIcons[s] || 'fa-book'
                                }))
                            ];

                            return filters.map(f => {
                                const isActive = (currentPlanSubjectFilter === f.id);
                                return `
                                    <button onclick="setPlanSubjectFilter('${f.id}')" class="min-h-[44px] py-2.5 px-3.5 rounded-xl font-bold transition-colors duration-150 active:scale-95 shrink-0 flex items-center gap-1.5 cursor-pointer ${isActive ? 'bg-[#1B5E43] text-white dark:bg-[#52B788] dark:text-[#141513] shadow-xs' : 'bg-[#FFFFFF] dark:bg-[#222521] text-[#474B45] dark:text-[#C4C0B6] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] border border-[#D9D2C3] dark:border-[#31342E]'}">
                                        <span>${f.label}</span>
                                    </button>
                                `;
                            }).join('');
                        })()}
                    </div>

                    <div class="space-y-4">
                        ${planDaysHTML}
                    </div>

                    <!-- Print-Only Viral Attribution Watermark Footer with Vector QR -->
                    <div class="print-only mt-8 pt-4 border-t-2 border-[#181B18] text-xs text-[#181B18]">
                        <div class="flex items-center justify-between gap-6">
                            <div>
                                <p class="font-serif font-bold text-[#181B18] text-sm">HSS Planner — Malabar Study Ledger</p>
                                <p class="text-xs text-[#474B45] mt-0.5">Kerala Higher Secondary (HSS • +1 & +2) • Verified SCERT Scheme of Work</p>
                                <p class="text-[11px] text-[#6E726A] font-mono mt-1">Scan the QR code to load or rebalance this timetable on any phone: <strong>https://hss-planner.web.app/</strong></p>
                            </div>
                            <div id="printQrCodeContainer" class="shrink-0 w-20 h-20 flex items-center justify-center border border-[#D9D2C3] rounded-lg p-1 bg-white"></div>
                        </div>
                    </div>

                    <!-- Subtle Bottom Rebalance -->
                    <div class="mt-8 pt-4 border-t border-[#D9D2C3] dark:border-[#31342E] flex justify-between items-center text-xs text-[#6E726A] dark:text-[#918D83] no-print">
                        <button onclick="openRegenerateModal()" class="min-h-[44px] py-2 px-3 bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] text-[#181B18] dark:text-[#EFECE4] font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer">
                            <svg class="w-3.5 h-3.5 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> ${isML ? ML_I18N.plan.adjustSchedule : 'Adjust Schedule'}
                        </button>
                        <button onclick="resetApp()" class="min-h-[44px] text-[#6E726A] dark:text-[#918D83] hover:text-[#B8432E] dark:hover:text-[#E57A65] underline inline-flex items-center cursor-pointer">${isML ? ML_I18N.plan.resetPlan : 'Reset Plan'}</button>
                    </div>
                `;

                const targetStream = appState?.stream || 'cs';
                const qrTarget = `https://hss-planner.web.app/?stream=${encodeURIComponent(targetStream)}`;
                generateQrSvg(qrTarget, { width: 72, margin: 0 })
                    .then((svg) => {
                        const el = document.getElementById('printQrCodeContainer');
                        if (el && svg) {
                            el.innerHTML = svg;
                        }
                    })
                    .catch(() => {});

                return;
            }

            // View 3: Official Syllabus Reference & Completed Chapters Overview (Interactive Stream Switcher)
            if (currentView === 'syllabus') {
                if (!activeSyllabusGrade) {
                    activeSyllabusGrade = appState?.grade || (typeof activeSetupGradeTab !== 'undefined' && activeSetupGradeTab === '+1' ? '+1' : '+2');
                }
                const userStream = activeSyllabusStream || appState?.stream || (appState?.plan?.some(d => d.tasks.some(t => t.subject === 'Botany' || t.subject === 'Zoology')) ? 'bio' : 'cs');
                const subjects = userStream === 'imp_only'
                    ? Array.from(new Set((appState?.plan || []).flatMap(d => (d.tasks || []).map(t => t.subject))))
                    : getStreamSubjects(userStream);

                let syllabusHTML = '';
                const sourceSyllabus = activeSyllabusGrade === '+1' ? PLUS_ONE_SYLLABUS : PLUS_TWO_SYLLABUS;
                subjects.forEach(sub => {
                    const subChaps = sourceSyllabus.filter(t => t.subject === sub);
                    const uniqueChaps = [...new Map(subChaps.map(item => [item.chapId, item])).values()];
                    const subRes = CHAPTER_RESOURCES?.subjects?.[sub] || CHAPTER_RESOURCES?.[sub];
                    const subPyq = subRes?.pyqUrl || subRes?.pyq;

                    syllabusHTML += `
                        <div class="bg-[#FBF9F4] dark:bg-[#1B1D1A] rounded-2xl border border-[#D9D2C3] dark:border-[#31342E] p-4 sm:p-5 mb-5">
                            <div class="border-b border-[#D9D2C3] dark:border-[#31342E] pb-3 mb-4 flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-xl bg-[#EDE8DC] dark:bg-[#181A17] flex items-center justify-center p-2 border border-[#D9D2C3] dark:border-[#31342E] shrink-0">
                                        ${typeof getSubjectBoxIcon === 'function' ? getSubjectBoxIcon(sub) : ''}
                                    </div>
                                    <div>
                                        <h3 class="font-serif font-bold text-[#181B18] dark:text-[#EFECE4] text-base sm:text-lg">${sub}</h3>
                                        <span class="text-xs font-mono text-[#6E726A] dark:text-[#918D83] font-semibold">${uniqueChaps.length} ${isML ? ML_I18N.syllabus.chaptersCount : 'Official Chapters'}</span>
                                    </div>
                                </div>
                                ${subRes && subPyq ? `
                                <div class="flex items-center gap-2 text-xs">
                                    <a href="${subPyq}" target="_blank" rel="noopener noreferrer" class="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#E7ECF3] dark:bg-[rgba(139,167,206,0.14)] text-[#2F486D] dark:text-[#8BA7CE] border border-[#A6B8CE] dark:border-[rgba(139,167,206,0.3)] hover:bg-[#D8E1EE] font-bold text-xs transition">
                                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>
                                        <span>Official PYQs</span>
                                    </a>
                                </div>` : ''}
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                ${uniqueChaps.map(ch => {
                                    // Check if all tasks of this chapter are completed
                                    let isAllDone = false;
                                    if (appState && appState.plan) {
                                        const chapterTasksInPlan = [];
                                        appState.plan.forEach(d => {
                                             d.tasks.forEach(t => {
                                                if (t.chapId === ch.chapId) chapterTasksInPlan.push(t);
                                            });
                                        });
                                        if (chapterTasksInPlan.length > 0 && chapterTasksInPlan.every(t => t.completed)) {
                                            isAllDone = true;
                                        }
                                    }

                                    const handbookUrl = getHandbookUrl(ch, { grade: activeSyllabusGrade, stream: userStream });

                                    return `
                                        <div class="p-3 rounded-xl border ${isAllDone ? 'bg-[#E4EFE9] border-[#9DC3B2] dark:bg-[rgba(82,183,136,0.14)] dark:border-[rgba(82,183,136,0.3)]' : 'bg-[#FFFFFF] border-[#D9D2C3] dark:bg-[#222521] dark:border-[#31342E]'} flex items-start gap-2.5 text-xs transition hover:border-[#1B5E43] dark:hover:border-[#52B788]">
                                            <div class="w-6 h-6 rounded-lg ${isAllDone ? 'bg-[#1B5E43] text-white dark:bg-[#52B788] dark:text-[#141513]' : 'bg-[#EDE8DC] dark:bg-[#181A17] text-[#1B5E43] dark:text-[#52B788]'} flex items-center justify-center shrink-0 mt-0.5 text-xs font-mono font-bold">
                                                ${isAllDone ? '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' : ch.chapNumber}
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <span class="font-serif font-bold text-[#181B18] dark:text-[#EFECE4] block text-[13px]">Chapter ${ch.chapNumber}: ${ch.chapterName.replace(/^Chapter\s+\d+:\s*/i, '').replace(/^\d+\.\s*/, '')}</span>
                                                <div class="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
                                                    <div class="flex items-center gap-2">
                                                        <span class="text-[10px] font-mono font-bold text-[#6E726A] dark:text-[#918D83] bg-[#EDE8DC] dark:bg-[#181A17] px-1.5 py-0.5 rounded">Term ${ch.term}</span>
                                                        ${isAllDone ? `<span class="text-[10px] font-mono font-bold text-[#1B5E43] dark:text-[#52B788]">${isML ? ML_I18N.syllabus.mastered : 'Mastered'}</span>` : ''}
                                                    </div>
                                                    ${handbookUrl ? `
                                                        <a href="${handbookUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="syllabus-notes-btn" title="${isML ? 'ഹാൻഡ്ബുക്ക് / നോട്ട്സ് കാണുക' : 'Open chapter study notes (PDF)'}">
                                                            📖 Notes
                                                        </a>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                });

                container.innerHTML = `
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <div>
                            <h2 class="text-xl sm:text-2xl font-serif font-bold text-[#181B18] dark:text-[#EFECE4] tracking-tight">${isML ? ML_I18N.syllabus.title : 'Official DHSE Scheme of Work'}</h2>
                            <p class="text-xs text-[#474B45] dark:text-[#C4C0B6]">${(function() {
                                const gradePrefix = activeSyllabusGrade === '+1' ? 'Plus One (+1) ' : 'Plus Two (+2) ';
                                if (isML) {
                                    if (userStream === 'bio') return ML_I18N.syllabus.subtitleBio;
                                    if (userStream === 'commerce') return ML_I18N.syllabus.subtitleCommerce;
                                    if (userStream === 'humanities') return ML_I18N.syllabus.subtitleHumanities;
                                    return ML_I18N.syllabus.subtitleCs;
                                }
                                if (userStream === 'bio') return `${gradePrefix}Biology Science Stream (Botany & Zoology) • Rationalized Kerala Higher Secondary curriculum.`;
                                if (userStream === 'commerce') return `${gradePrefix}Commerce Stream (Accountancy, Business Studies, Economics, Computer Applications) • Rationalized Kerala Higher Secondary curriculum.`;
                                if (userStream === 'humanities') return `${gradePrefix}Humanities Stream (History, Political Science, Sociology, Economics) • Rationalized Kerala Higher Secondary curriculum.`;
                                return `${gradePrefix}Computer Science Stream • Rationalized Kerala Higher Secondary curriculum.`;
                            })()}</p>
                        </div>
                        <button onclick="goToDashboard()" class="min-h-[44px] text-xs font-bold bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#EDE8DC] dark:hover:bg-[#181A17] px-3.5 py-2.5 rounded-xl text-[#181B18] dark:text-[#EFECE4] inline-flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> ${isML ? ML_I18N.syllabus.backToToday : 'Back to Today'}
                        </button>
                    </div>

                    <!-- Interactive Grade & Stream Switcher -->
                    <div class="space-y-3 mb-5">
                        <!-- Grade Switcher Pills Bar -->
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-mono font-bold text-[#6E726A] dark:text-[#918D83] mr-1">${isML ? 'ക്ലാസ്:' : 'Grade:'}</span>
                            <button type="button" onclick="switchSyllabusGrade('+2')" class="min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${activeSyllabusGrade === '+2' ? 'bg-[#1B5E43] text-white dark:bg-[#52B788] dark:text-[#141513] shadow-xs font-black ring-2 ring-[#1B5E43]/20 active-grade' : 'bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] text-[#181B18] dark:text-[#EFECE4] hover:bg-[#EDE8DC]'}">
                                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                                <span>Plus Two (+2)</span>
                            </button>
                            <button type="button" onclick="switchSyllabusGrade('+1')" class="min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${activeSyllabusGrade === '+1' ? 'bg-[#9C6418] text-white dark:bg-[#DFAC54] dark:text-[#141513] shadow-xs font-black ring-2 ring-[#9C6418]/20 active-grade' : 'bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] text-[#181B18] dark:text-[#EFECE4] hover:bg-[#EDE8DC]'}">
                                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                                <span>Plus One (+1)</span>
                            </button>
                        </div>

                        <!-- Interactive Stream Switcher Pills Bar -->
                        <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                            <button type="button" onclick="switchSyllabusStream('cs')" class="min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${userStream === 'cs' ? 'bg-[#1B5E43] text-white dark:bg-[#52B788] dark:text-[#141513] shadow-xs font-black ring-2 ring-[#1B5E43]/20 active-stream' : 'bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] text-[#181B18] dark:text-[#EFECE4] hover:bg-[#EDE8DC]'}">
                                <span>Computer Science</span>
                            </button>
                            <button type="button" onclick="switchSyllabusStream('bio')" class="min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${userStream === 'bio' ? 'bg-[#1B5E43] text-white dark:bg-[#52B788] dark:text-[#141513] shadow-xs font-black ring-2 ring-[#1B5E43]/20 active-stream' : 'bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] text-[#181B18] dark:text-[#EFECE4] hover:bg-[#EDE8DC]'}">
                                <span>Biology Science</span>
                            </button>
                            <button type="button" onclick="switchSyllabusStream('commerce')" class="min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${userStream === 'commerce' ? 'bg-[#9C6418] text-white dark:bg-[#DFAC54] dark:text-[#141513] shadow-xs font-black ring-2 ring-[#9C6418]/20 active-stream' : 'bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] text-[#181B18] dark:text-[#EFECE4] hover:bg-[#EDE8DC]'}">
                                <span>Commerce</span>
                            </button>
                            <button type="button" onclick="switchSyllabusStream('humanities')" class="min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${userStream === 'humanities' ? 'bg-[#B8432E] text-white dark:bg-[#E57A65] dark:text-[#141513] shadow-xs font-black ring-2 ring-[#B8432E]/20 active-stream' : 'bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] text-[#181B18] dark:text-[#EFECE4] hover:bg-[#EDE8DC]'}">
                                <span>Humanities</span>
                            </button>
                        </div>
                    </div>

                    ${(function() {
                        if (typeof getOfficialExamSchedule !== 'function') return '';
                        const activeCycleMeta = DHSE_EXAM_CYCLES[activeSyllabusExamCycle] || DHSE_EXAM_CYCLES.christmas;
                        const scheduleRows = getOfficialExamSchedule({
                            grade: activeSyllabusGrade,
                            stream: userStream === 'imp_only' ? 'cs' : userStream,
                            examCycle: activeSyllabusExamCycle,
                            includeLanguages: true,
                        });
                        return `
                            <div class="bg-[#FBF9F4] dark:bg-[#1B1D1A] rounded-2xl border border-[#D9D2C3] dark:border-[#31342E] p-4 sm:p-5 mb-5">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-[#D9D2C3] dark:border-[#31342E]">
                                    <div>
                                        <h3 class="font-serif font-bold text-[#181B18] dark:text-[#EFECE4] text-base sm:text-lg flex items-center gap-2">
                                            <svg class="w-4 h-4 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
                                            <span>${isML ? `ഔദ്യോഗിക DHSE പരീക്ഷാ ടൈംടേബിൾ (${activeSyllabusGrade})` : `Official DHSE Exam Timetable (${activeSyllabusGrade})`}</span>
                                        </h3>
                                        <p class="text-xs text-[#474B45] dark:text-[#C4C0B6] mt-0.5">${escapeStudyText(activeCycleMeta.note)}</p>
                                    </div>
                                    <div class="flex items-center gap-1.5 flex-wrap">
                                        ${['christmas', 'model', 'public'].map(cId => {
                                            const meta = DHSE_EXAM_CYCLES[cId];
                                            const active = cId === activeSyllabusExamCycle;
                                            return `<button type="button" onclick="switchSyllabusExamCycle('${cId}')" class="min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${active ? 'bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513]' : 'bg-[#EDE8DC] dark:bg-[#181A17] text-[#474B45] dark:text-[#C4C0B6] border border-[#D9D2C3] dark:border-[#31342E] hover:bg-[#E4EFE9]'}">${isML ? meta.mlName : meta.shortName}</button>`;
                                        }).join('')}
                                    </div>
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    ${scheduleRows.map(ev => `
                                        <div class="p-2.5 rounded-xl bg-[#FFFFFF] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] flex items-center justify-between gap-2 text-xs">
                                            <div class="min-w-0">
                                                <span class="font-mono font-bold text-[#1B5E43] dark:text-[#52B788] block">${escapeStudyText(ev.date)} (${escapeStudyText(ev.dayName)})</span>
                                                <span class="font-bold text-[#181B18] dark:text-[#EFECE4] block truncate" title="${escapeStudyText(ev.paperTitle)}">${escapeStudyText(ev.paperTitle)}</span>
                                            </div>
                                            <span class="px-2 py-1 rounded-lg font-mono bg-[#E7ECF3] dark:bg-[rgba(139,167,206,0.14)] text-[#2F486D] dark:text-[#8BA7CE] border border-[#A6B8CE] dark:border-[rgba(139,167,206,0.3)] font-bold text-[11px] shrink-0">${escapeStudyText(ev.session)} · ${escapeStudyText(ev.time)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    })()}

                    <div class="space-y-4">
                        ${syllabusHTML}
                    </div>
                `;
                return;
            }
        }

        function getSubjectColorBadge(subject) {
            switch(subject) {
                case 'Physics': return 'bg-[#E7ECF3] text-[#2F486D] border border-[#A6B8CE] dark:bg-[rgba(139,167,206,0.14)] dark:text-[#8BA7CE] dark:border-[rgba(139,167,206,0.32)]';
                case 'Chemistry': return 'bg-[#F6EEDC] text-[#9C6418] border border-[#DEC59A] dark:bg-[rgba(223,172,84,0.14)] dark:text-[#DFAC54] dark:border-[rgba(223,172,84,0.32)]';
                case 'Mathematics': return 'bg-[#F9E9E5] text-[#B8432E] border border-[#E8B4A9] dark:bg-[rgba(229,122,101,0.14)] dark:text-[#E57A65] dark:border-[rgba(229,122,101,0.32)]';
                case 'Computer Science': return 'bg-[#E4EFE9] text-[#1B5E43] border border-[#9DC3B2] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] dark:border-[rgba(82,183,136,0.32)]';
                case 'Botany': return 'bg-[#E4EFE9] text-[#1B5E43] border border-[#9DC3B2] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] dark:border-[rgba(82,183,136,0.32)]';
                case 'Zoology': return 'bg-[#E7ECF3] text-[#2F486D] border border-[#A6B8CE] dark:bg-[rgba(139,167,206,0.14)] dark:text-[#8BA7CE] dark:border-[rgba(139,167,206,0.32)]';
                case 'Accountancy': return 'bg-[#E4EFE9] text-[#1B5E43] border border-[#9DC3B2] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] dark:border-[rgba(82,183,136,0.32)]';
                case 'Business Studies': return 'bg-[#E7ECF3] text-[#2F486D] border border-[#A6B8CE] dark:bg-[rgba(139,167,206,0.14)] dark:text-[#8BA7CE] dark:border-[rgba(139,167,206,0.32)]';
                case 'Economics': return 'bg-[#F6EEDC] text-[#9C6418] border border-[#DEC59A] dark:bg-[rgba(223,172,84,0.14)] dark:text-[#DFAC54] dark:border-[rgba(223,172,84,0.32)]';
                case 'Computer Applications': return 'bg-[#E4EFE9] text-[#1B5E43] border border-[#9DC3B2] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] dark:border-[rgba(82,183,136,0.32)]';
                case 'History': return 'bg-[#F6EEDC] text-[#9C6418] border border-[#DEC59A] dark:bg-[rgba(223,172,84,0.14)] dark:text-[#DFAC54] dark:border-[rgba(223,172,84,0.32)]';
                case 'Political Science': return 'bg-[#E7ECF3] text-[#2F486D] border border-[#A6B8CE] dark:bg-[rgba(139,167,206,0.14)] dark:text-[#8BA7CE] dark:border-[rgba(139,167,206,0.32)]';
                case 'Sociology': return 'bg-[#F9E9E5] text-[#B8432E] border border-[#E8B4A9] dark:bg-[rgba(229,122,101,0.14)] dark:text-[#E57A65] dark:border-[rgba(229,122,101,0.32)]';
                default: return 'bg-[#E7ECF3] text-[#2F486D] border border-[#A6B8CE] dark:bg-[rgba(139,167,206,0.14)] dark:text-[#8BA7CE] dark:border-[rgba(139,167,206,0.32)]';
            }
        }

        function getTaskChapterTitle(task) {
            if (!task) return '';
            if (task.isRevision) return task.chapterName;
            let chapNum = task.chapNumber;
            if (!chapNum && task.id) {
                const m = task.id.match(/_(\d+)_P\d+$/);
                if (m) chapNum = parseInt(m[1]);
            }
            const rawName = task.chapterName || '';
            const cleanName = rawName.replace(/^Chapter\s+\d+:\s*/i, '').replace(/^\d+\.\s*/, '');
            if (chapNum) {
                return `Chapter ${chapNum}: ${cleanName}`;
            }
            return cleanName || rawName;
        }

        function formatTaskTopicTitle(task) {
            if (!task) return '';
            if (task.isRevision) return task.topicTitle || '';
            const p = task.part || 1;
            const total = task.totalParts || 1;
            
            // Extract the descriptive text after any "Part X of Y:" or "Part X/Y:"
            let desc = task.topicTitle || '';
            desc = desc.replace(/^Part\s+\d+\s*(?:of|\/)\s*\d+(?:\s*\([^)]*\))?:\s*/i, '');
            desc = desc.replace(/^Full\s+Chapter(?:\s*Concepts\s*&\s*Key\s*Problems)?:\s*/i, '');
            if (!desc) {
                desc = (p === total || p > 1) ? 'Exercise Problems & PYQs' : 'Core Concepts & Theory';
            }

            // Tight timetable: all parts on same day — show "Full:" prefix for both cards
            if (task.isFullOnDay) {
                return `Full: ${desc}`;
            }

            if (total === 1) {
                return `Part 1/1 (Full Chapter): ${desc}`;
            }
            if (p === total) {
                return `Part ${p}/${total} (Full Chapter): ${desc}`;
            }
            return `Part ${p}/${total}: ${desc}`;
        }

        function renderTaskGradeBadge(task) {
            if (!task) return '';
            if (task.isExamEveTask) {
                return `<span class="text-xs font-bold px-1.5 py-0.5 rounded-md bg-[#F9E9E5] text-[#B8432E] border border-[#E8B4A9] dark:bg-[rgba(229,122,101,0.14)] dark:text-[#E57A65] dark:border-[rgba(229,122,101,0.3)] flex items-center gap-1"><svg class="w-3 h-3 text-[#B8432E] dark:text-[#E57A65]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> 🔥 Exam Eve Focus</span>`;
            }
            if (task.isForgettingCurveReview || task.isSpacedRetrieval) {
                const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml') ||
                             (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang === 'ml');
                const intervalText = task.spacingInterval ? `Spaced Recall (${task.spacingInterval})` : 'Active Recall & PYQ';
                const mlIntervalText = task.spacingInterval ? `സ്പേസ്ഡ് റീകോൾ (${task.spacingInterval})` : 'സ്പേസ്ഡ് റീകോൾ & PYQ';
                return `<span class="text-xs font-bold px-1.5 py-0.5 rounded-md bg-[#E7ECF3] text-[#2F486D] border border-[#A6B8CE] dark:bg-[rgba(139,167,206,0.14)] dark:text-[#8BA7CE] dark:border-[rgba(139,167,206,0.3)] flex items-center gap-1" title="Ebbinghaus Forgetting Curve Spaced Retrieval"><svg class="w-3 h-3 text-[#2F486D] dark:text-[#8BA7CE]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg> 🧠 ${isML ? mlIntervalText : intervalText}</span>`;
            }
            if (task.isModelExam) {
                return `<span class="text-xs font-bold px-1.5 py-0.5 rounded-md bg-[#F6EEDC] text-[#9C6418] border border-[#DEC59A] dark:bg-[rgba(223,172,84,0.14)] dark:text-[#DFAC54] dark:border-[rgba(223,172,84,0.3)] flex items-center gap-1"><svg class="w-3 h-3 text-[#9C6418] dark:text-[#DFAC54]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg> 📝 Model Exam</span>`;
            }
            if (task.isRevision) {
                return `<span class="text-xs font-bold px-1.5 py-0.5 rounded-md bg-[#E7ECF3] text-[#2F486D] border border-[#A6B8CE] dark:bg-[rgba(139,167,206,0.14)] dark:text-[#8BA7CE] dark:border-[rgba(139,167,206,0.3)]">Revision</span>`;
            }
            if (task.grade === '+1') {
                return `<span class="text-xs font-mono font-bold px-1.5 py-0.5 rounded-md bg-[#F6EEDC] text-[#9C6418] border border-[#DEC59A] dark:bg-[rgba(223,172,84,0.14)] dark:text-[#DFAC54] dark:border-[rgba(223,172,84,0.3)] flex items-center gap-1"><svg class="w-3 h-3 text-[#9C6418] dark:text-[#DFAC54]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg> +1 Imp</span>`;
            }
            // Plus Two (+2)
            return `
                <span class="text-xs font-mono font-bold px-1.5 py-0.5 rounded-md bg-[#E4EFE9] text-[#1B5E43] border border-[#9DC3B2] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] dark:border-[rgba(82,183,136,0.3)] flex items-center gap-1"><svg class="w-3 h-3 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> +2</span>
                ${task.term ? `<span class="text-xs font-mono font-semibold px-1.5 py-0.5 rounded bg-[#EDE8DC] text-[#474B45] dark:bg-[#181A17] dark:text-[#C4C0B6] border border-[#D9D2C3] dark:border-[#31342E]">Term ${task.term}</span>` : ''}
            `;
        }

        function formatGroupTopicSummary(group, isML = false) {
            if (!group || !Array.isArray(group.tasks) || group.tasks.length === 0) return '';
            if (!group.isMultiTask) return formatTaskTopicTitle(group.primaryTask);

            const descriptions = [];
            const seen = new Set();
            group.tasks.forEach(task => {
                let desc = String(task?.topicTitle || '');
                desc = desc.replace(/^Part\s+\d+\s*(?:of|\/)\s*\d+(?:\s*\([^)]*\))?:\s*/i, '');
                desc = desc.replace(/^Full\s+Chapter(?:\s*Concepts\s*&\s*Key\s*Problems)?:\s*/i, '');
                desc = desc.trim();
                if (desc && !seen.has(desc)) {
                    seen.add(desc);
                    descriptions.push(desc);
                }
            });

            const scope = formatCompressedGroupScope(group, isML);
            if (descriptions.length === 0) return scope;
            return scope ? `${scope}: ${descriptions.join(' • ')}` : descriptions.join(' • ');
        }

        function formatPendingDateSpan(dates, yesterdayDate, isML = false) {
            if (!Array.isArray(dates) || dates.length === 0) return '';
            const fmt = d => (d === yesterdayDate ? (isML ? 'ഇന്നലെ' : 'Yesterday') : d);
            if (dates.length === 1) return fmt(dates[0]);
            return `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`;
        }

        function renderGroupPartBadge(group, isML = false) {
            if (!group) return '';
            if (!group.isMultiTask) return renderTaskPartBadge(group.primaryTask);
            if (!group.chapterKey) return '';
            const scope = escapeStudyText(formatCompressedGroupScope(group, isML));
            if (group.isFullChapter) {
                return `<span class="text-xs font-mono font-bold px-1.5 py-0.5 rounded-md bg-[#E4EFE9] text-[#1B5E43] border border-[#9DC3B2] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] dark:border-[rgba(82,183,136,0.3)] flex items-center gap-1"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ${scope}</span>`;
            }
            return `<span class="text-xs font-mono font-bold px-1.5 py-0.5 rounded-md bg-[#E7ECF3] text-[#2F486D] dark:bg-[rgba(139,167,206,0.14)] dark:text-[#8BA7CE] border border-[#A6B8CE] dark:border-[rgba(139,167,206,0.3)]">${scope}</span>`;
        }

        function renderTaskPartBadge(task) {
            if (!task || task.isRevision || task.isExamEveTask || task.isModelExam || task.isSpacedRetrieval || task.isForgettingCurveReview) return '';
            const p = task.part || 1;
            const total = task.totalParts || 1;
            // Tight timetable: all parts land on same day — show "Full" instead of confusing "1/2" + "2/2"
            if (task.isFullOnDay) {
                return `<span class="text-xs font-mono font-bold px-1.5 py-0.5 rounded-md bg-[#E4EFE9] text-[#1B5E43] border border-[#9DC3B2] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] dark:border-[rgba(82,183,136,0.3)] flex items-center gap-1"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Full</span>`;
            }
            if (p === total) {
                return `<span class="text-xs font-mono font-bold px-1.5 py-0.5 rounded-md bg-[#E4EFE9] text-[#1B5E43] border border-[#9DC3B2] dark:bg-[rgba(82,183,136,0.14)] dark:text-[#52B788] dark:border-[rgba(82,183,136,0.3)] flex items-center gap-1"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Full Chapter (${p}/${total})</span>`;
            }
            return `<span class="text-xs font-mono font-bold px-1.5 py-0.5 rounded-md bg-[#EDE8DC] text-[#474B45] dark:bg-[#181A17] dark:text-[#C4C0B6] border border-[#D9D2C3] dark:border-[#31342E]">Part ${p}/${total}</span>`;
        }

        function renderTaskDailySlotBadge(slotIndex, totalTasks, isML) {
            if (!totalTasks || totalTasks <= 0) return '';
            return `<span class="text-xs font-mono text-[#6E726A] dark:text-[#918D83]">${isML ? 'പഠന ഭാഗം' : 'Study block'} ${slotIndex + 1} / ${totalTasks}</span>`;
        }

        function getOverallStats() {
            if (!appState || !appState.plan) return { percentage: 0, completedCount: 0, totalCount: 0 };
            let total = 0;
            let done = 0;
            appState.plan.forEach(d => {
                d.tasks.forEach(t => {
                    total++;
                    if (t.completed) done++;
                });
            });
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return { percentage: pct, completedCount: done, totalCount: total };
        }

        function updateProgressHeader() {
            const stats = getOverallStats();
            const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml');

            const progressBar = document.getElementById('overall-progress-bar');
            if (progressBar) {
                progressBar.style.width = `${stats.percentage}%`;
            }
            const progressText = document.getElementById('overall-progress-text');
            if (progressText) {
                progressText.textContent = `${stats.percentage}%`;
            }
            const progressCount = document.getElementById('overall-progress-count');
            if (progressCount) {
                progressCount.textContent = `${stats.completedCount}/${stats.totalCount}`;
            }
            const planProgressSummary = document.getElementById('plan-progress-summary');
            if (planProgressSummary) {
                planProgressSummary.textContent = `${stats.percentage}% ${isML ? 'പൂർത്തിയായി' : 'Done'} (${stats.completedCount}/${stats.totalCount})`;
            }
            const todayOverviewP = document.querySelector('#today-overview div p');
            if (todayOverviewP && appState?.plan) {
                const localToday = getLocalDateStr();
                const activeDayNum = typeof getActiveMissionDayNumber === 'function' ? getActiveMissionDayNumber() : 1;
                const todayPlan = appState.plan.find(d => d.dayNumber === activeDayNum) || appState.plan.find(d => d.date === localToday);
                if (todayPlan) {
                    const doneToday = todayPlan.tasks.filter(t => t.completed).length;
                    const totalToday = todayPlan.tasks.length;
                    todayOverviewP.textContent = `${doneToday} / ${totalToday} ${isML ? 'പൂർത്തിയായി' : 'tasks complete'}`;
                }
            }
        }

        /* ==========================================================================
           10. SETTINGS, THEME ENGINE & CUSTOMIZATIONS
           ========================================================================== */
        function getThemePreference() {
            try {
                return localStorage.getItem('plustwo_theme') || 'system';
            } catch(e) {
                return 'system';
            }
        }

        function isDarkModeActive() {
            const pref = getThemePreference();
            if (pref === 'dark') return true;
            if (pref === 'light') return false;
            return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        }

        function applyTheme(pref) {
            if (!pref) pref = getThemePreference();
            const isDark = (pref === 'dark') || (pref === 'system' && typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
            if (typeof document !== 'undefined' && document.documentElement) {
                if (isDark) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
                const metaTheme = document.querySelector('meta[name="theme-color"]');
                if (metaTheme) metaTheme.setAttribute('content', isDark ? '#141513' : '#F6F3EC');
            }
            updateThemeUI(pref);
        }

        function setThemePreference(pref) {
            try {
                localStorage.setItem('plustwo_theme', pref);
            } catch(e) {}
            applyTheme(pref);
            if (typeof renderApp === 'function') {
                try { renderApp(); } catch(e) {}
            }
            if (typeof updateSettingsUI === 'function') {
                try { updateSettingsUI(); } catch(e) {}
            }
            const label = pref === 'dark' ? 'Dark mode enabled' : (pref === 'light' ? 'Light mode enabled' : 'System theme matched');
            const icon = pref === 'dark' ? 'fa-moon text-indigo-400' : (pref === 'light' ? 'fa-sun text-amber-400' : 'fa-desktop text-blue-400');
            showAppToast(label, icon);
        }

        function updateThemeUI(pref) {
            if (typeof document === 'undefined') return;
            if (!pref) pref = getThemePreference();

            const modes = ['light', 'dark', 'system'];
            modes.forEach(m => {
                // Modal buttons
                const btn = document.getElementById(`theme-btn-${m}`);
                if (btn) {
                    if (m === pref) {
                        btn.className = 'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] shadow-xs';
                    } else {
                        btn.className = 'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all text-[#474B45] dark:text-[#C4C0B6] hover:text-[#181B18] dark:hover:text-white';
                    }
                }
                // Dropdown menu buttons
                const menuBtn = document.getElementById(`menu-theme-btn-${m}`);
                if (menuBtn) {
                    if (m === pref) {
                        menuBtn.className = 'py-1.5 px-2 rounded-lg text-center font-black text-xs transition-all flex items-center justify-center gap-1 bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] shadow-xs';
                    } else {
                        menuBtn.className = 'py-1.5 px-2 rounded-lg text-center font-bold text-xs transition-all flex items-center justify-center gap-1 text-[#474B45] dark:text-[#C4C0B6] hover:text-[#181B18] dark:hover:text-[#EFECE4]';
                    }
                }
            });

            // Update badge in profile dropdown
            const dropdownBadge = document.getElementById('dropdown-theme-badge');
            if (dropdownBadge) {
                dropdownBadge.textContent = pref.toUpperCase();
            }
        }

        /* ==========================================================================
           INTERNATIONALIZATION (i18n) & BROWSER TRANSLATION AUTO-DETECTOR (v6.1)
           ========================================================================== */
        const ML_I18N = ML_STRINGS;
        function getAppLanguage() { return getCurrentLanguage(); }

        function setAppLanguage(lang) {
            try {
                localStorage.setItem(STORAGE_KEY_LANG, lang);
            } catch(e) {}
            applyAppLanguage(lang);
            if (typeof renderApp === 'function') {
                try { renderApp(); } catch(e) {}
            }
            const label = lang === 'ml' ? 'മലയാളം ഭാഷ സജ്ജമാക്കി' : 'English language enabled';
            showAppToast(label, 'fa-language text-blue-400');
        }

        function toggleLanguagePreference() {
            const current = getAppLanguage();
            const next = current === 'ml' ? 'en' : 'ml';
            setAppLanguage(next);
        }

        function applyAppLanguage(lang) {
            if (!lang) lang = getAppLanguage();
            const isML = lang === 'ml';

            // 1. Update Settings Modal Language Buttons & Badge
            const btnEn = document.getElementById('lang-btn-en');
            const btnMl = document.getElementById('lang-btn-ml');
            const langBadge = document.getElementById('settings-lang-badge');

            if (btnEn) {
                if (!isML) {
                    btnEn.className = 'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] shadow-xs';
                } else {
                    btnEn.className = 'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all text-[#474B45] dark:text-[#C4C0B6] hover:text-[#181B18] dark:hover:text-[#EFECE4]';
                }
            }
            if (btnMl) {
                if (isML) {
                    btnMl.className = 'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all bg-[#1B5E43] dark:bg-[#52B788] text-white dark:text-[#141513] shadow-xs';
                } else {
                    btnMl.className = 'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all text-[#474B45] dark:text-[#C4C0B6] hover:text-[#181B18] dark:hover:text-[#EFECE4]';
                }
            }
            if (langBadge) {
                langBadge.textContent = isML ? 'മലയാളം' : 'English';
                langBadge.className = 'text-xs font-mono bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] text-[#1B5E43] dark:text-[#52B788] border border-[#9DC3B2] dark:border-[rgba(82,183,136,0.3)] font-bold px-2 py-0.5 rounded-full';
            }

            // 2. Safe check for any legacy button
            const flag = document.getElementById('lang-btn-flag');
            const lbl = document.getElementById('lang-btn-label');
            const switchBtn = document.getElementById('lang-switch-btn');
            if (flag && lbl) {
                if (isML) {
                    flag.textContent = 'മല';
                    flag.className = 'text-xs font-black text-[#1B5E43] dark:text-[#52B788]';
                    lbl.textContent = '| EN';
                } else {
                    flag.textContent = 'EN';
                    flag.className = 'text-xs font-black text-[#1B5E43] dark:text-[#52B788]';
                    lbl.textContent = '| മ';
                }
            }
            if (switchBtn) {
                switchBtn.setAttribute('title', isML ? 'Switch to English' : 'മലയാളത്തിലേക്ക് മാറ്റുക');
                switchBtn.setAttribute('aria-label', isML ? 'Switch to English' : 'Switch to Malayalam');
            }

            // 3. Update Desktop Navigation Labels
            const navToday = document.getElementById('nav-text-today');
            const navPlan = document.getElementById('nav-text-plan');
            const navSyllabus = document.getElementById('nav-text-syllabus');
            if (navToday) navToday.textContent = isML ? ML_I18N.nav.today : 'Today';
            if (navPlan) navPlan.textContent = isML ? ML_I18N.nav.plan : 'Full Plan';
            if (navSyllabus) navSyllabus.textContent = isML ? ML_I18N.nav.syllabus : 'Syllabus';

            // 4. Update Mobile Navigation Labels
            const mobToday = document.getElementById('mob-text-today');
            const mobPlan = document.getElementById('mob-text-plan');
            const mobSyllabus = document.getElementById('mob-text-syllabus');
            const mobShare = document.getElementById('mob-text-share');
            if (mobToday) mobToday.textContent = isML ? ML_I18N.nav.today : 'Today';
            if (mobPlan) mobPlan.textContent = isML ? ML_I18N.nav.plan : 'Full Plan';
            if (mobSyllabus) mobSyllabus.textContent = isML ? ML_I18N.nav.syllabus : 'Syllabus';
            if (mobShare) mobShare.textContent = isML ? ML_I18N.nav.share : 'Share';

            const setText = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.textContent = text;
            };

            // 5. Auth Modal Localization
            setText('auth-modal-title', isML ? ML_I18N.authModal.title : 'Save Your Study Plan');
            setText('auth-modal-subtitle', isML ? ML_I18N.authModal.subtitle : 'Sign in with Google to sync between your phone and laptop so you never lose your progress.');
            setText('auth-chip-sync-title', isML ? ML_I18N.authModal.chipSyncTitle : 'Phone & PC');
            setText('auth-chip-sync-sub', isML ? ML_I18N.authModal.chipSyncSub : 'Auto-sync');
            setText('auth-chip-backup-title', isML ? ML_I18N.authModal.chipBackupTitle : 'Backup');
            setText('auth-chip-backup-sub', isML ? ML_I18N.authModal.chipBackupSub : 'Zero loss');
            setText('auth-chip-fast-title', isML ? ML_I18N.authModal.chipFastTitle : '1-Tap Fast');
            setText('auth-chip-fast-sub', isML ? ML_I18N.authModal.chipFastSub : 'Free forever');
            setText('auth-google-btn-text', isML ? ML_I18N.authModal.googleBtn : 'Continue with Google');
            setText('auth-guest-btn-text', isML ? ML_I18N.authModal.guestBtn : 'Maybe later (continue as guest)');

            // 6. Settings Modal Localization
            setText('settings-modal-title', isML ? ML_I18N.settingsModal.title : 'Settings & Customization');
            setText('settings-modal-subtitle', isML ? ML_I18N.settingsModal.subtitle : 'Personalize your HSS Planner workspace');
            setText('settings-theme-title-text', isML ? ML_I18N.settingsModal.themeTitle : 'Theme & Appearance');
            setText('settings-theme-hint', isML ? ML_I18N.settingsModal.themeHint : 'Dark mode features a high-contrast deep slate palette designed for long study sessions without eye strain.');
            setText('settings-lang-title-text', isML ? ML_I18N.settingsModal.langTitle : 'Language / ഭാഷ');
            setText('settings-lang-hint', isML ? ML_I18N.settingsModal.langHint : 'Auto-detects browser translation. Switch navigation, study actions, and guidance between English and Malayalam.');
            setText('settings-exp-title-text', isML ? ML_I18N.settingsModal.expTitle : 'Study Experience & Feedback');
            setText('settings-sound-label', isML ? ML_I18N.settingsModal.soundTitle : 'Sound Effects (Chimes)');
            setText('settings-sound-hint', isML ? ML_I18N.settingsModal.soundHint : 'Harmonic chimes when checking off completed chapters');
            setText('settings-confetti-label', isML ? ML_I18N.settingsModal.confettiTitle : 'Milestone Celebration Confetti');
            setText('settings-confetti-hint', isML ? ML_I18N.settingsModal.confettiHint : 'Particle bursts when completing targets and full days');
            setText('settings-autofocus-label', isML ? ML_I18N.settingsModal.autofocusTitle : 'Focus Target Highlighter');
            setText('settings-autofocus-hint', isML ? ML_I18N.settingsModal.autofocusHint : 'Soft animated glow guiding you to your next chapter');
            setText('settings-pace-title-text', isML ? ML_I18N.settingsModal.paceTitle : 'Daily Study Pace');
            setText('settings-pace-hint', isML ? ML_I18N.settingsModal.paceHint : 'Adjust your daily study workload intensity.');
            setText('pace-label-light', isML ? ML_I18N.settingsModal.paceLight : 'Relaxed');
            setText('pace-label-balanced', isML ? ML_I18N.settingsModal.paceBalanced : 'Standard');
            setText('pace-label-intense', isML ? ML_I18N.settingsModal.paceIntense : 'Intensive');
            setText('settings-backup-title-text', isML ? ML_I18N.settingsModal.backupTitle : 'Data Backup & Offline Sync');
            setText('settings-backup-hint', isML ? ML_I18N.settingsModal.backupHint : 'Export a backup JSON file or restore your study timetable on any device.');
            setText('settings-export-text', isML ? ML_I18N.settingsModal.exportBtn : 'Export Backup');
            setText('settings-restore-text', isML ? ML_I18N.settingsModal.restoreBtn : 'Restore Backup');
            setText('settings-reset-title', isML ? ML_I18N.settingsModal.resetTitle : 'Reset Plan');
            setText('settings-reset-hint', isML ? ML_I18N.settingsModal.resetHint : 'Clear current timetable to start fresh');
            setText('settings-reset-btn-text', isML ? ML_I18N.settingsModal.resetBtn : 'Reset');
            setText('settings-undo-reset-title', isML ? 'റീസെറ്റ് തിരിച്ചെടുക്കുക' : 'Undo Recent Reset');
            setText('settings-undo-reset-btn-text', isML ? 'തിരിച്ചെടുക്കുക' : 'Restore');
            setText('settings-done-btn', isML ? ML_I18N.settingsModal.doneBtn : 'Done');

            // 7. Regenerate / Edit Plan Modal Localization
            setText('auto-detect-card-title', isML ? (ML_I18N.regenerateModal.autoDetectTitle || 'പൂർത്തിയായ അധ്യായങ്ങൾ') : 'Completed Chapters');
            setText('auto-detect-card-sub', isML ? (ML_I18N.regenerateModal.autoDetectSub || '') : 'Open your chapter checklist to mark everything you have already finished — chapters completed in your plan are pre-checked automatically.');
            setText('btn-open-chapters-label', isML ? (ML_I18N.regenerateModal.openChaptersBtn || 'പൂർത്തിയായ അധ്യായങ്ങൾ അടയാളപ്പെടുത്തുക') : 'Mark Completed Chapters');
            setText('btn-auto-rebalance-label', isML ? (ML_I18N.regenerateModal.autoDetectBtn || 'പെട്ടെന്ന് ഓട്ടോ-റീബാലൻസ് ചെയ്യുക') : 'Quick Auto-Rebalance Current Progress');
            setText('regenerate-modal-title', isML ? ML_I18N.regenerateModal.title : 'Edit & Rebalance Plan');
            setText('regenerate-modal-subtitle', isML ? ML_I18N.regenerateModal.subtitle : 'Adjust your completed chapters, exam date, and study pace');
            setText('regenerate-completed-label', isML ? ML_I18N.regenerateModal.completedUpTo : 'Keep Schedule History Completed Up To:');
            setText('regenerate-revision-note', isML ? ML_I18N.regenerateModal.guaranteedRevision : 'Guaranteed Revision Days: Mock and spaced revision buffer days stay protected before your target date.');
            setText('regenerate-undo-reset-btn-text', isML ? '↺ റീസെറ്റ് ചെയ്ത പ്ലാൻ തിരിച്ചെടുക്കുക' : 'Undo Recent Reset & Restore');
            setText('regenerate-cancel-btn', isML ? ML_I18N.regenerateModal.cancelBtn : 'Cancel');
            setText('regenerate-confirm-btn', isML ? ML_I18N.regenerateModal.rebalanceBtn : 'Save & Rebuild Plan');
            setText('adjust-chapters-done-btn', isML ? 'തിരഞ്ഞെടുപ്പ് സൂക്ഷിക്കുക' : 'Done Selecting');
            setText('adjust-chapters-apply-btn', isML ? (ML_I18N.regenerateModal.rebalanceBtn || 'സേവ് & പ്ലാൻ പുതുക്കുക') : 'Apply & Rebuild Plan');

            // 8. Mobile Export & Share Sheet Localization
            setText('export-sheet-title', isML ? 'ടൈംടേബിൾ എക്സ്പോർട്ട് & ഷെയർ' : 'Export & Share Timetable');
            setText('export-sheet-subtitle', isML ? 'ഓഫ്‌ലൈനായി സൂക്ഷിക്കുക അല്ലെങ്കിൽ സുഹൃത്തുക്കളുമായി പങ്കുവെക്കുക' : 'Save offline or share your study pace with friends');
            setText('export-sheet-cal-title', isML ? 'കലണ്ടറിൽ ചേർക്കുക (.ics)' : 'Add to Calendar (.ics)');
            setText('export-sheet-cal-desc', isML ? 'Google, Apple, Outlook കലണ്ടറിലേക്ക് സ്റ്റഡി ബ്ലോക്കുകൾ ചേർക്കാം' : 'Sync study blocks into Google, Apple, or Outlook Calendar');
            setText('export-sheet-csv-title', isML ? 'CSV സ്പ്രെഡ്ഷീറ്റ് ഡൗൺലോഡ് ചെയ്യുക' : 'Export CSV Spreadsheet');
            setText('export-sheet-csv-desc', isML ? 'Excel അല്ലെങ്കിൽ Google Sheets-ൽ ഉപയോഗിക്കാൻ പൂർണ്ണ ഷെഡ്യൂൾ' : 'Download full schedule for Excel or Google Sheets');
            setText('export-sheet-share-title', isML ? 'കൂട്ടുകാരുമായി പങ്കുവെക്കുക' : 'Share with Classmates');
            setText('export-sheet-share-desc', isML ? 'WhatsApp, Telegram വഴി സുഹൃത്തുക്കൾക്ക് ഷെഡ്യൂൾ അയക്കാം' : 'Send timetable to friends via WhatsApp or Telegram');
            setText('export-sheet-copy-title', isML ? 'ടൈംടേബിൾ ലിങ്ക് കോപ്പി ചെയ്യുക' : 'Copy Timetable Link');
            setText('export-sheet-copy-desc', isML ? 'വെബ് ലിങ്ക് ക്ലിപ്പ്ബോർഡിലേക്ക് പകർത്തുക' : 'Copy direct web link to clipboard');
            setText('export-sheet-cancel-btn', isML ? 'റദ്ദാക്കുക' : 'Cancel');

            // Update html lang attribute
            document.documentElement.lang = isML ? 'ml' : 'en';
        }

        /* ==========================================================================
           PRIVACY-FIRST ANONYMOUS ANALYTICS (FIREBASE ANALYTICS G-12KPP3ZZ80)
           ========================================================================== */
        function trackAnalyticsEvent(name, params = {}) {
            trackEvent(name, params);
        }

        function initAppAnalytics() {
            try {
                const now = Date.now();
                let firstVisit = localStorage.getItem('mpt_first_visit_ts');
                if (!firstVisit) {
                    localStorage.setItem('mpt_first_visit_ts', String(now));
                    trackAnalyticsEvent('opened', { isFirstVisit: true });
                } else {
                    trackAnalyticsEvent('opened', { isFirstVisit: false });
                    const hoursSince = (now - Number(firstVisit)) / (1000 * 60 * 60);
                    const day3Logged = localStorage.getItem('mpt_day3_recorded');
                    if (!day3Logged && hoursSince >= 48 && hoursSince <= 144) {
                        localStorage.setItem('mpt_day3_recorded', 'true');
                        trackAnalyticsEvent('returned_day3', { days: Math.round(hoursSince / 24) });
                    }
                }

                // Lazy load Firebase Analytics in idle time
                if ('requestIdleCallback' in window) {
                    window.requestIdleCallback(() => ensureFirebaseAnalytics());
                } else {
                    setTimeout(() => ensureFirebaseAnalytics(), 1500);
                }
            } catch(e) {}
        }

        function toggleUserSetting(key) {
            const current = getUserSetting(key, true);
            const next = !current;
            setUserSetting(key, next);
            updateSettingsUI();

            const labels = {
                sound: next ? "Audio chimes enabled" : "Audio chimes muted",
                confetti: next ? "Celebration confetti enabled" : "Celebration confetti off",
                autofocus: next ? "Focus highlighter enabled" : "Focus highlighter off"
            };
            const icons = {
                sound: next ? "fa-volume-high text-blue-400" : "fa-volume-xmark text-slate-400",
                confetti: next ? "fa-wand-magic-sparkles text-amber-400" : "fa-ban text-slate-400",
                autofocus: next ? "fa-bullseye text-blue-400" : "fa-eye-slash text-slate-400"
            };
            showAppToast(labels[key] || "Setting updated", icons[key] || "fa-check text-emerald-400");

            if (key === 'autofocus') {
                highlightNextUnfinishedTask();
            }
        }

        function updateSettingsUI() {
            if (typeof document === 'undefined') return;
            const settings = ['sound', 'confetti', 'autofocus'];
            settings.forEach(k => {
                const isEnabled = getUserSetting(k, true);
                const toggle = document.getElementById(`setting-toggle-${k}`);
                const knob = document.getElementById(`setting-knob-${k}`);
                if (toggle && knob) {
                    if (isEnabled) {
                        toggle.classList.remove('bg-slate-300', 'bg-[#D9D2C3]');
                        toggle.classList.add('bg-[#1B5E43]', 'dark:bg-[#52B788]');
                        toggle.setAttribute('aria-checked', 'true');
                        knob.classList.remove('translate-x-0');
                        knob.classList.add('translate-x-5');
                    } else {
                        toggle.classList.remove('bg-blue-600', 'bg-[#1B5E43]', 'dark:bg-[#52B788]');
                        toggle.classList.add('bg-[#D9D2C3]');
                        toggle.setAttribute('aria-checked', 'false');
                        knob.classList.remove('translate-x-5');
                        knob.classList.add('translate-x-0');
                    }
                }
            });

            // Update pace buttons
            const currentPace = (appState && appState.studyIntensity) ? appState.studyIntensity : 'balanced';
            const paces = ['light', 'balanced', 'intense'];
            paces.forEach(p => {
                const btn = document.getElementById(`pace-btn-${p}`);
                if (btn) {
                    if (p === currentPace) {
                        btn.className = 'p-2 rounded-xl text-center border-2 border-[#1B5E43] dark:border-[#52B788] bg-[#E4EFE9] dark:bg-[rgba(82,183,136,0.14)] text-[#181B18] dark:text-[#EFECE4] transition';
                    } else {
                        btn.className = 'p-2 rounded-xl text-center border border-[#D9D2C3] dark:border-[#31342E] bg-[#FFFFFF] dark:bg-[#222521] text-[#474B45] dark:text-[#C4C0B6] hover:border-[#B9B09E] transition';
                    }
                }
            });

            const paceBadge = document.getElementById('settings-current-pace-badge');
            if (paceBadge) {
                const paceNames = { light: 'Relaxed', balanced: 'Standard', intense: 'Intensive' };
                paceBadge.textContent = paceNames[currentPace] || 'Standard';
            }

            // Snapshot restore row in Settings
            const restoreRow = document.getElementById('settings-restore-plan-row');
            if (restoreRow) {
                const snapshotRaw = localStorage.getItem('mpt_previous_plan_snapshot');
                if (snapshotRaw) {
                    try {
                        const snap = JSON.parse(snapshotRaw);
                        restoreRow.classList.remove('hidden');
                        const hint = document.getElementById('settings-restore-plan-hint');
                        if (hint) hint.textContent = `Saved from ${snap.formattedDate || ''} at ${snap.formattedTime || ''}`;
                    } catch (e) {
                        restoreRow.classList.add('hidden');
                    }
                } else {
                    restoreRow.classList.add('hidden');
                }
            }

            // Pre-reset undo row in Settings
            const undoResetRow = document.getElementById('settings-undo-reset-row');
            if (undoResetRow) {
                let snap = null;
                const preResetRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem('mpt_pre_reset_snapshot') : null;
                if (preResetRaw) {
                    try {
                        snap = JSON.parse(preResetRaw);
                    } catch (e) {
                        snap = null;
                    }
                }
                if (snap && snap.state && Array.isArray(snap.state.plan)) {
                    undoResetRow.classList.remove('hidden');
                    const hint = document.getElementById('settings-undo-reset-hint');
                    const dateStr = snap.formattedDate || (snap.resetAt ? new Date(snap.resetAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');
                    if (hint) {
                        hint.textContent = `Undo Recent Reset: Restore timetable from ${dateStr}`;
                    }
                } else if (typeof currentUser !== 'undefined' && currentUser && typeof db !== 'undefined' && db) {
                    undoResetRow.classList.add('hidden');
                    db.collection('user_archives').doc(currentUser.uid).get().then(doc => {
                        if (doc && doc.exists) {
                            const cloudSnap = doc.data();
                            if (cloudSnap && cloudSnap.state && Array.isArray(cloudSnap.state.plan)) {
                                try { localStorage.setItem('mpt_pre_reset_snapshot', JSON.stringify(cloudSnap)); } catch(_) {}
                                undoResetRow.classList.remove('hidden');
                                const hint = document.getElementById('settings-undo-reset-hint');
                                const dateStr = cloudSnap.formattedDate || (cloudSnap.resetAt ? new Date(cloudSnap.resetAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');
                                if (hint) {
                                    hint.textContent = `Undo Recent Reset: Restore timetable from ${dateStr}`;
                                }
                            }
                        }
                    }).catch(() => {});
                } else {
                    undoResetRow.classList.add('hidden');
                }
            }

            updateThemeUI(getThemePreference());
            applyAppLanguage(getAppLanguage());
        }

        function selectSettingsStudyPace(pace) {
            if (appState) {
                appState.studyIntensity = pace;
                saveAppState();
            }
            updateSettingsUI();
            const names = { light: 'Relaxed (1-2 chapters/day)', balanced: 'Standard (2-3 chapters/day)', intense: 'Intensive (3-4+ chapters/day)' };
            showAppToast(`Pace set to: ${names[pace]}`, "fa-gauge-high text-indigo-400");
        }

        function exportStudyPlanJSON() {
            if (!appState || !Array.isArray(appState.plan) || appState.plan.length === 0) {
                showAppToast("No study plan data to export yet!", "fa-circle-exclamation text-amber-400");
                return;
            }
            try {
                const exportData = createStudyBackup(appState, APP_VERSION);
                const jsonStr = JSON.stringify(exportData, null, 2);
                const blob = new Blob([jsonStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const dateStr = new Date().toISOString().split('T')[0];
                a.href = url;
                a.download = `hss-planner-backup-${dateStr}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showAppToast("Backup exported successfully!", "fa-file-circle-check text-emerald-400");
            } catch(err) {
                console.error("Export error:", err);
                showAppToast("Could not export backup.", "fa-triangle-exclamation text-rose-400");
            }
        }

        async function importStudyPlanJSON(event) {
            const input = event.target;
            const file = input?.files?.[0];
            if (!file) return;
            input.disabled = true;
            let restored = false;
            try {
                if (file.size > MAX_BACKUP_BYTES) throw new TypeError('Backup exceeds 2 MB.');
                let validPlan = parseStudyBackup(await file.text());
                if (validPlan.engineVersion > Math.max(PLANNER_ENGINE_VERSION, ENGINE_VERSION, 6)) throw new TypeError('Newer backup version.');
                if (!validPlan.engineVersion || validPlan.engineVersion < PLANNER_ENGINE_VERSION) {
                    validPlan = migrateLegacyUserPlan(validPlan);
                }
                validPlan = validateStudyBackup(validPlan);
                const count = validPlan.plan.reduce((total, day) => total + day.tasks.length, 0);
                const confirmed = await showAppConfirm({
                    title: 'Restore study backup?',
                    message: `Restore ${count} tasks? This replaces this device's plan and checkmarks. If signed in, the restored plan also syncs to your account. Export your current plan first if you want to keep it.`,
                    confirmText: 'Restore backup',
                    cancelText: 'Keep current plan'
                });
                if (!confirmed) return;
                validPlan.lastModified = new Date().toISOString();
                persistStudyBackup(validPlan, localStorage);
                appState = validPlan;
                restored = true;
                await saveAppState();
                closeSettingsModal();
                renderApp();
                showAppToast('Study plan restored successfully!', 'fa-circle-check text-emerald-400');
            } catch(err) {
                console.error('Import error:', err);
                showAppAlert({
                    title: restored ? 'Backup saved' : 'Backup not restored',
                    message: restored ? 'The backup was saved, but the app could not refresh. Reload to reopen your saved plan.' : 'The backup could not be read, validated or saved. Use a valid HSS Planner backup (up to 2 MB) from this app version or an older version. Check available device storage and try again.',
                    icon: 'fa-triangle-exclamation text-rose-500'
                });
            } finally {
                input.value = '';
                input.disabled = false;
            }
        }

        function openSettingsModal() {
            const modal = document.getElementById('settings-modal');
            if (!modal) return;
            updateSettingsUI();
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        function closeSettingsModal() {
            const modal = document.getElementById('settings-modal');
            if (!modal) return;
            modal.classList.remove('flex');
            modal.classList.add('hidden');
        }

        /* ==========================================================================
           11. 1-CLICK PWA INSTALL PROMPT
           Handles 'beforeinstallprompt' with 1-click automatic trigger
           ========================================================================== */
        let deferredPWAInstallPrompt = null;
        if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPWAInstallPrompt = e;
            const installBtn = document.getElementById('pwa-install-btn');
            if (installBtn) {
                installBtn.classList.remove('hidden');
                installBtn.classList.add('flex');
            }
        });

        function triggerPWAInstall() {
            if (deferredPWAInstallPrompt) {
                deferredPWAInstallPrompt.prompt();
                deferredPWAInstallPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        showAppToast("Thank you for installing HSS Planner!", "fa-circle-check text-emerald-400");
                        const installBtn = document.getElementById('pwa-install-btn');
                        if (installBtn) installBtn.classList.add('hidden');
                    }
                    deferredPWAInstallPrompt = null;
                });
            } else {
                // If browser already installed or iOS Safari
                showAppAlert({
                    title: "Install HSS Planner App",
                    message: "• <strong>On Android / Chrome:</strong> Tap menu (⋮) ➔ 'Install App'<br>• <strong>On iPhone / Safari:</strong> Tap Share (📤) ➔ 'Add to Home Screen'<br>• <strong>On Brave / Edge:</strong> Click the install icon in the URL address bar.",
                    icon: "fa-download text-emerald-500"
                });
            }
        }

        // Register Service Worker for PWA
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined') {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').then((reg) => {
                    if (reg && typeof reg.update === 'function') {
                        reg.update();
                    }
                }).catch((err) => {
                    console.log('SW registration note:', err);
                });
            });
        }

        // Initialize Theme, Language, Analytics & System Listener
        if (typeof document !== 'undefined') {
            applyTheme();
            applyAppLanguage();
            initAppAnalytics();
        }

        if (typeof window !== 'undefined' && window.matchMedia) {
            try {
                window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                    if (getThemePreference() === 'system') {
                        applyTheme('system');
                        if (typeof renderApp === 'function') {
                            try { renderApp(); } catch(e) {}
                        }
                    }
                });
            } catch(e) {}
        }

        // Process high-intent Google search landing parameters (e.g. ?days=30, ?stream=imp_only, ?view=syllabus)
        try {
            if (typeof window !== 'undefined' && window.location.search && window.URLSearchParams) {
                const urlParams = new window.URLSearchParams(window.location.search);
                if (urlParams.get('stream') === 'imp_only' && !appState) {
                    selectedStream = 'imp_only';
                    setupCurrentStep = 2;
                } else if (urlParams.get('view') === 'syllabus') {
                    currentView = 'syllabus';
                } else if ((urlParams.get('days') === '30' || urlParams.get('preset') === '30days') && !appState) {
                    setupCurrentStep = 4;
                    setTimeout(() => {
                        setDeadlinePreset(getRelativePresetDate(30));
                    }, 120);
                }
            }
        } catch(err) {
            console.warn('SEO query parameter processing note:', err);
        }

        // Initialize App on DOM Load
        if (typeof document !== 'undefined') {
            renderApp();
        }

        // If user already has a generated plan on this device and hasn't seen the sign-in modal, prompt after 8 seconds
        if (typeof window !== 'undefined' && appState && typeof localStorage !== 'undefined' && !localStorage.getItem('has_seen_auth_modal')) {
            schedulePostPlanAuthModal(8000);
        }
    

// Attach all controllers and API to window for inline HTML onclick handlers
if (typeof window !== 'undefined') {
    Object.assign(window, {
        appState,
        currentUser: typeof currentUser !== 'undefined' ? currentUser : null,
        currentSessionId: typeof currentSessionId !== 'undefined' ? currentSessionId : null,
        loadInitialState,
        saveAppStateLocally,
        saveAppState,
        syncAppStateToCloud,
        getFirestoreCleanData,
        performCloudSync,
        schedulePostPlanAuthModal,
        scheduleFirstTimeAuthModal,
        checkAndTriggerMilestoneAuth,
        openAuthModal,
        closeAuthModal,
        continueAsGuest,
        signInWithGoogleFromModal,
        triggerManualSync,
        updateAuthHeaderUI,
        toggleUserDropdown,
        closeUserDropdown,
        signInWithGoogle,
        signOutUser,
        shareTodayCompletion,
        printSchedule,
        setPlanSubjectFilter,
        showAppAlert,
        showAppConfirm,
        getUserSetting,
        setUserSetting,
        showToastMessage: showAppToast,
        showAppToast,
        toggleTaskDirect,
        toggleTask: toggleTaskDirect,
        highlightNextUnfinishedTask,
        getActiveMissionDayNumber,
        goToDashboard,
        goToPlan,
        goToSyllabusView,
        switchSyllabusStream,
        switchSyllabusGrade,
        switchSyllabusExamCycle,
        setAdjustOfficialExamPreset,
        getOfficialExamSchedule,
        switchView: (view) => {
            if (view === 'today') goToDashboard();
            else if (view === 'plan') goToPlan();
            else if (view === 'syllabus') goToSyllabusView();
        },
        shareApp,
        shareOnWhatsApp,
        shareOnTelegram,
        copyShareLink,
        printTimetable,
        exportTimetableCsv,
        exportTimetableIcs,
        openExportShareSheet,
        closeExportShareSheet,
        openAiTutorModal,
        closeAiTutorModal,
        copyAiTutorPrompt,
        openShareModal,
        closeShareModal,
        executeShare,
        resetApp,
        setSubjectConfidence,
        renderPersonalizationSubjectRows,
        setWeeklyRhythmSelection,
        setDailyHoursSelection,
        getPersonalizationConfig,
        getStreamSubjects,
        setGradeSelection,
        setStreamSelection,
        updateTermCardsDescriptions,
        renderSetupSubjectTabs,
        switchSetupGrade,
        switchSetupSubject,
        updateSetupTabsUI,
        toggleChapterSelection,
        toggleAllSubjectChapters,
        updateCompletedChaptersCountBadge,
        renderSetupSubjectChapters,
        setTermSelection,
        getPresetDate,
        getRelativePresetDate,
        setDeadlinePreset,
        updatePresetButtonsUI,
        updateDeadlinePreview,
        goToSetupStep,
        nextSetupStep,
        prevSetupStep,
        handleInitialSetup,
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
        onAdjustDeadlineChange,
        updateAdjustDeadlinePreview,
        getEditableScopeChapters,
        openPendingWork,
        closeRegenerateModal,
        openSettingsModal,
        closeSettingsModal,
        executeRegeneration,
        autoDetectAndRebalance,
        changeMissionDay,
        shiftPlanToToday,
        shiftPlanToStartDate,
        compactPlanToToday,
        restorePreviousPlan,
        restorePreResetSnapshot,
        dismissDashboardRestoreBanner,
        renderDashboardRestoreBanner,
        checkCloudArchiveForBanner,
        savePreviousPlanSnapshot,
        renderApp,
        getActiveTodayStr,
        setActiveTodayStr,
        getAppState,
        setAppState,
        getCurrentView,
        setCurrentView,
        setupWindowBindings,
        getActiveStreak,
        setupAutoRefresh,
        checkDate,
        checkDateRollover: checkDate,
        getSubjectColorBadge,
        getTaskChapterTitle,
        formatTaskTopicTitle,
        renderTaskGradeBadge,
        renderTaskPartBadge,
        getOverallStats,
        updateProgressHeader,
        getThemePreference,
        isDarkModeActive,
        applyTheme,
        setThemePreference,
        updateThemeUI,
        getAppLanguage,
        setAppLanguage,
        toggleLanguagePreference,
        applyAppLanguage,
        trackAnalyticsEvent,
        initAppAnalytics,
        toggleUserSetting,
        updateSettingsUI,
        selectSettingsStudyPace,
        exportStudyPlanJSON,
        importStudyPlanJSON,
        triggerPWAInstall,
        triggerPwaInstall: triggerPWAInstall,
        PLANNER_ENGINE_VERSION,
        ENGINE_VERSION,
        PLAN_MIGRATION_VERSION,
        PLUS_TWO_SYLLABUS,
        PLUS_ONE_SYLLABUS,
        buildIntelligentPlan,
        validatePlan,
        migrateLegacyUserPlan,
        getLocalDateStr,
        calculateDaysBetween,
        TODAY_STR,
    });

    setupWindowBindings();
}

function setupWindowBindings() {
    if (typeof window === "undefined") return;
    try {
        Object.defineProperty(window, "appState", {
            get: () => appState,
            set: (val) => { appState = val; },
            configurable: true
        });
    } catch(e) {
        window.appState = appState;
    }

    try {
        Object.defineProperty(window, "currentView", {
            get: () => currentView,
            set: (val) => { currentView = val; },
            configurable: true
        });
    } catch(e) {
        window.currentView = currentView;
    }
}

export {
    resetApp,
    restorePreResetSnapshot,
    restorePreviousPlan,
    dismissDashboardRestoreBanner,
    renderDashboardRestoreBanner,
    checkCloudArchiveForBanner,
    renderApp,
    saveAppState,
    saveAppStateLocally,
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
    signOutUser,
    performCloudSync,
    syncAppStateToCloud,
    toggleTaskDirect,
    getFirestoreCleanData,
    initFirebaseAuth,
    attachAuthListener,
    getCurrentUser,
    setCurrentUser,
    getFirebaseAuth,
    setFirebaseAuth,
    getFirestoreDb,
    setFirestoreDb,
    getCloudSyncUnsubscribe,
    setCloudSyncUnsubscribe,
    openExportShareSheet,
    closeExportShareSheet,
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
    onAdjustDeadlineChange,
    getEditableScopeChapters,
    openPendingWork,
    executeRegeneration,
    autoDetectAndRebalance,
};

