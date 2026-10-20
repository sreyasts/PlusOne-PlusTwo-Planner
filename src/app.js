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
  PLANNER_ENGINE_VERSION,
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
} from './audio/chime.js';
import {
  showAppToast,
  showAppAlert,
  showAppConfirm,
} from './ui/dialogs.js';
import {
  getSvgIcon,
} from './ui/icons.js';
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
import { getDailyPlan } from './ui/daily-plan.js';
import { MAX_BACKUP_BYTES, parseStudyBackup, validateStudyBackup, createStudyBackup, persistStudyBackup } from './utils/study-backup.js';
import { persistTaskCompletion } from './utils/study-progress.js';
import appPackage from '../package.json' with { type: 'json' };
const APP_VERSION = appPackage.version;

const escapeStudyText = value => String(value ?? '').replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);


function getTaskResourceBadge(task) {
    if (!task) return '';
    const mins = task.estimatedMinutes || 60;
    return `<span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">⏱️ ${mins}m</span>`;
}

function getTaskDeepLinksHtml(task) {
    if (!task || (task.isRevision && !task.isSpacedRetrieval && !task.isExamEveTask)) return '';
    const res = CHAPTER_RESOURCES?.subjects?.[task.subject] || CHAPTER_RESOURCES?.[task.subject];
    if (!res) return '';
    const pyq = res.pyqUrl || res.pyq;
    if (!pyq) return '';
    return `
        <div class="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <a href="${pyq}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:underline font-semibold" title="${res.pyqTitle || 'Previous Year Questions'}">${getSvgIcon('fileText', 'w-3.5 h-3.5')} PYQs</a>
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

        function getFirestoreCleanData(state) {
            if (!state) return null;
            const clean = JSON.parse(JSON.stringify(state));
            clean.lastSynced = new Date().toISOString();
            return clean;
        }

        function saveAppStateLocally() {
            if (!appState) return;
            persistStudyBackup(appState, localStorage);
        }

        // Save State helper - saves to local storage AND syncs to Firebase Cloud Firestore!
        async function saveAppState() {
            if (!appState) return;
            saveAppStateLocally();
            await syncAppStateToCloud(appState);
        }

        async function syncAppStateToCloud(state) {
            if (currentUser && db) {
                try {
                    const userDocRef = db.collection('users').doc(currentUser.uid);
                    const payload = getFirestoreCleanData({
                        ...state,
                        userEmail: currentUser.email,
                        displayName: currentUser.displayName || 'Student'
                    });
                    await userDocRef.set(payload);
                } catch(err) {
                    console.error("Cloud save failed:", err);
                    if (err.message && err.message.includes("database (default) does not exist")) {
                        showAppAlert({
                            title: "Cloud Sync Setup Needed",
                            message: "Cloud Firestore database is not yet enabled in the Firebase console. Please open Firebase Console ➔ Firestore Database ➔ 'Create database'.",
                            icon: "fa-cloud text-amber-500"
                        });
                    }
                }
            }
        }

        async function performCloudSync(user, explicitTrigger = false) {
            if (!user || !db) return;
            try {
                if (explicitTrigger) showToastMessage("Checking cloud sync...", "fa-rotate text-blue-400");
                const userDocRef = db.collection('users').doc(user.uid);
                const docSnap = await userDocRef.get();

                if (docSnap.exists) {
                    let cloudData = docSnap.data();
                    if (cloudData && Array.isArray(cloudData.plan) && cloudData.plan.length > 0) {
                        // Reconcile and upgrade cloud data to current engine version if needed
                        if (!cloudData.engineVersion || cloudData.engineVersion < PLANNER_ENGINE_VERSION) {
                            cloudData = migrateLegacyUserPlan(cloudData);
                        }

                        // Count completed tasks in local vs cloud
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

                        // Case A: Local device had no plan OR local has 0 completed tasks
                        // NEVER overwrite cloud data with an empty/unstarted guest plan!
                        if (!appState || !Array.isArray(appState.plan) || appState.plan.length === 0 || localCompletedTaskIds.size === 0) {
                            appState = cloudData;
                            saveAppStateLocally();
                            renderApp();
                            updateAuthHeaderUI();
                            showToastMessage("Welcome back! Your study progress has been restored from your Google Account.", "fa-circle-check text-emerald-400");
                            return;
                        }

                        // Case B: Both have completed tasks and the same stream
                        if (cloudData.stream === appState.stream) {
                            let targetPlan = (cloudCompletedTaskIds.size >= localCompletedTaskIds.size) ? cloudData : appState;

                            // Merge all completed tasks into targetPlan so no tick mark is ever lost
                            targetPlan.plan.forEach(day => {
                                (day.tasks || []).forEach(t => {
                                    if (localCompletedTaskIds.has(t.id) || cloudCompletedTaskIds.has(t.id)) {
                                        t.completed = true;
                                    }
                                });
                            });

                            appState = targetPlan;
                            appState.userEmail = user.email;
                            appState.ownerUid = user.uid;
                            saveAppStateLocally();
                            await userDocRef.set(getFirestoreCleanData(appState));
                            renderApp();
                            updateAuthHeaderUI();
                            showToastMessage("Signed in! Your progress has been synced to your Google Account.", "fa-circle-check text-emerald-400");
                        } else {
                            // Different streams between cloud and local session (e.g. Bio vs CS)
                            const cloudStreamName = cloudData.stream === 'bio' ? 'Biology Science' : (cloudData.stream === 'imp_only' ? '+1 Improvement Only' : 'Computer Science');
                            const localStreamName = appState.stream === 'bio' ? 'Biology Science' : (appState.stream === 'imp_only' ? '+1 Improvement Only' : 'Computer Science');
                            const restoreCloud = await showAppConfirm({
                                title: "Cloud Backup Found",
                                message: `We found a saved <strong>${cloudStreamName}</strong> study plan in your Google Account.<br><br>Your current unsaved guest plan is for <strong>${localStreamName}</strong>.<br><br>Do you want to load your saved ${cloudStreamName} plan, or keep your current ${localStreamName} plan?`,
                                icon: "fa-cloud-arrow-down text-blue-500",
                                confirmText: `Load Saved ${cloudStreamName}`,
                                cancelText: `Keep ${localStreamName}`
                            });

                            if (restoreCloud) {
                                appState = cloudData;
                                saveAppStateLocally();
                                showToastMessage(`Loaded saved ${cloudStreamName} plan from your account.`, "fa-cloud-arrow-down text-blue-400");
                            } else {
                                appState.userEmail = user.email;
                                appState.ownerUid = user.uid;
                                saveAppStateLocally();
                                await userDocRef.set(getFirestoreCleanData(appState));
                                showToastMessage(`Current ${localStreamName} plan saved to your Google Account!`, "fa-cloud-arrow-up text-emerald-400");
                            }
                            renderApp();
                            updateAuthHeaderUI();
                        }
                    } else {
                        // Cloud doc exists but has empty plan: upload local guest plan
                        if (appState && Array.isArray(appState.plan) && appState.plan.length > 0) {
                            appState.userEmail = user.email;
                            appState.ownerUid = user.uid;
                            await userDocRef.set(getFirestoreCleanData(appState));
                            saveAppStateLocally();
                            renderApp();
                            updateAuthHeaderUI();
                            showToastMessage("Signed in! Your progress has been saved to your Google Account.", "fa-cloud-arrow-up text-emerald-400");
                        }
                    }
                } else {
                    // Document doesn't exist on server yet!
                    // If local has progress (e.g. Guest who started without sign-in), upload it now!
                    if (appState && Array.isArray(appState.plan) && appState.plan.length > 0) {
                        appState.userEmail = user.email;
                        appState.ownerUid = user.uid;
                        const payload = getFirestoreCleanData({
                            ...appState,
                            userEmail: user.email,
                            displayName: user.displayName || 'Student'
                        });
                        await userDocRef.set(payload);
                        saveAppStateLocally();
                        renderApp();
                        updateAuthHeaderUI();
                        showToastMessage("Signed in with Google! Your progress has been saved to your account.", "fa-cloud-arrow-up text-emerald-400");
                    }
                }
            } catch(err) {
                console.error("Cloud sync error:", err);
                if (err.message && err.message.includes("database (default) does not exist")) {
                    showAppAlert({
                        title: "Cloud Sync Setup Needed",
                        message: "Cloud Firestore database is not yet enabled in your Firebase console. Please go to Firebase Console ➔ Firestore Database ➔ 'Create database'.",
                        icon: "fa-cloud text-amber-500"
                    });
                }
            }
        }

        // Attach user authentication listener and setup real-time Firestore synchronization
        function attachAuthListener() {
            if (!auth || authListenerAttached) return;
            authListenerAttached = true;

            // Handle redirect result if redirected on mobile
            if (typeof auth.getRedirectResult === 'function') {
                auth.getRedirectResult().then((result) => {
                    if (result && result.user) {
                        showToastMessage("Signed in with Google! Cloud sync active.", "fa-circle-check text-emerald-400");
                    }
                }).catch((err) => {
                    console.warn("Redirect auth note:", err);
                });
            }

            let isInitialAuthCheck = true;
            auth.onAuthStateChanged(async (user) => {
                const wasSignedIn = !!currentUser;
                currentUser = user;
                if (typeof window !== 'undefined') window.currentUser = user;
                updateAuthHeaderUI();

                if (user) {
                    closeAuthModal();
                    sessionStorage.setItem('auth_modal_dismissed', 'true');
                    localStorage.setItem('mpt_was_logged_in', 'true');
                    sessionStorage.removeItem('mpt_auto_auth_requested');

                    // 1. Immediately perform initial cloud fetch/merge
                    await performCloudSync(user);

                    // 2. Setup real-time listener for multi-device sync
                    if (cloudSyncUnsubscribe) cloudSyncUnsubscribe();
                    const userDocRef = db.collection('users').doc(user.uid);

                    cloudSyncUnsubscribe = userDocRef.onSnapshot((docSnap) => {
                        if (docSnap.exists) {
                            let cloudData = docSnap.data();
                            if (cloudData && Array.isArray(cloudData.plan) && cloudData.plan.length > 0) {
                                if (!cloudData.engineVersion || cloudData.engineVersion < PLANNER_ENGINE_VERSION) {
                                    cloudData = migrateLegacyUserPlan(cloudData);
                                }
                                const cloudLastSynced = cloudData.lastSynced || '';
                                const localLastSynced = (appState && appState.lastSynced) || '';
                                if (!appState || cloudLastSynced !== localLastSynced) {
                                    appState = cloudData;
                                    saveAppStateLocally();
                                    renderApp();
                                    updateAuthHeaderUI();
                                }
                            }
                        }
                    }, (err) => {
                        console.warn("Firestore listener note:", err);
                    });
                } else {
                    // User is not signed in (Guest or signed out)
                    if (cloudSyncUnsubscribe) {
                        cloudSyncUnsubscribe();
                        cloudSyncUnsubscribe = null;
                    }
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
                    db.enablePersistence().catch(() => {});
                    attachAuthListener();
                }
            } catch(err) {
                console.warn("Firebase initialization note:", err);
            }
        }

        // Initialize Firebase Auth on app start so existing sessions are detected immediately
        if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.createElement === 'function' && document.head && typeof document.head.appendChild === 'function') {
            initFirebaseAuth();
        }

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
            localStorage.setItem('has_dismissed_milestone_auth', 'true');
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
        document.addEventListener('click', (e) => {
            const container = document.getElementById('auth-container');
            if (container && !container.contains(e.target)) {
                closeUserDropdown();
            }
        });

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
                        <i class="fa-solid fa-circle-notch fa-spin text-blue-600 text-sm"></i>
                        <span>Connecting to Google...</span>
                    `;
                }
                if (headerBtn) {
                    headerBtn.disabled = true;
                    headerBtn.classList.add('opacity-75', 'cursor-wait');
                    headerBtn.innerHTML = `
                        <i class="fa-solid fa-circle-notch fa-spin text-blue-600 text-xs"></i>
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
                    await performCloudSync(currentUser, true);
                }

                closeAuthModal();
                showToastMessage("Signed in with Google! Cloud sync active.", "fa-circle-check text-emerald-400");
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

            // 2. Sign out of Firebase Auth
            try {
                await auth.signOut();
            } catch(e) {
                console.warn("Sign-out note:", e);
            }

            // 3. Clear local storage so this device starts completely fresh
            localStorage.removeItem('plusTwoMissionState_v2');
            localStorage.removeItem('plusTwoPlanState');
            localStorage.removeItem('mpt_was_logged_in');
            sessionStorage.removeItem('mpt_auto_auth_requested');

            // 4. Reset in-memory state variables to initial setup defaults
            currentUser = null;
            if (typeof window !== 'undefined') window.currentUser = null;
            appState = null;
            selectedCompletedChapters.clear();
            currentView = 'today';
            selectedStream = 'cs';
            activeSetupSubjectTab = 'Physics';
            activeSetupGradeTab = '+2';

            // 5. Update UI, close dropdown, and render the fresh Setup view (View 0)
            closeUserDropdown();
            updateAuthHeaderUI();
            renderApp();
            showToastMessage("Signed out. Your progress is saved in your Google Account. Fresh start ready!", "fa-circle-check text-emerald-400");
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // getLocalDateStr & TODAY_STR imported from ./engine/planner.js

        // Refresh at local midnight and immediately on return, including short screen locks.
        (function setupAutoRefresh() {
            let refreshing = false;
            let midnightTimer;
            const checkDate = () => {
                if (!refreshing && getLocalDateStr() !== TODAY_STR) {
                    refreshing = true;
                    window.location.reload();
                }
            };
            const scheduleMidnight = () => {
                clearTimeout(midnightTimer);
                const now = new Date();
                const next = new Date(now);
                next.setHours(24, 0, 0, 250);
                midnightTimer = setTimeout(() => { checkDate(); if (!refreshing) scheduleMidnight(); }, next - now);
            };
            const checkOnReturn = () => {
                if (document.hidden) return;
                checkDate();
                if (!refreshing) scheduleMidnight();
            };
            document.addEventListener('visibilitychange', checkOnReturn);
            window.addEventListener('focus', checkOnReturn);
            window.addEventListener('pageshow', checkOnReturn);
            scheduleMidnight();
        })();

        const getYesterdayStr = () => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            return getLocalDateStr(d);
        };

        function getActiveStreak() {
            if (!appState) return 0;
            const streak = appState.streakCount || 0;
            const lastDate = appState.lastCompletedDate;
            if (!streak || !lastDate) return 0;

            const today = TODAY_STR;
            const yesterday = getYesterdayStr();
            if (lastDate === today || lastDate === yesterday) {
                return streak;
            }
            return 0; // Streak reset due to 2+ days inactivity
        }

        function shareTodayCompletion(dayNumber) {
            const shareTitle = `Mission PlusTwo — Day ${dayNumber} Cleared!`;
            const shareText = `🏆 Day ${dayNumber} study targets 100% completed on Mission PlusTwo! Free adaptive daily study planner for Kerala DHSE Plus Two & Plus One Improvement — with guaranteed mock revision buffer. Try it:`;
            const shareUrl = 'https://mission-plustwo.web.app/';

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

        function getActiveMissionDayNumber() {
            if (!appState || !appState.plan || appState.plan.length === 0) return 1;
            const calendarToday = appState.plan.find(day => day.date === getLocalDateStr());
            return calendarToday?.dayNumber ?? 0;
        }

        /* ==========================================================================
           5. TASK TOGGLE & COMPLETION ENGINE
           Synchronous across Today & Full Plan views
           ========================================================================== */

        function toggleTaskDirect(taskId) {
            if (!appState || !appState.plan) return;
            try {
                const next = persistTaskCompletion(appState, taskId, localStorage, {
                    today: getLocalDateStr(), yesterday: getYesterdayStr(), modifiedAt: new Date().toISOString(),
                });
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
            const targetDay = appState.plan.find(day => day.tasks.some(task => task.id === taskId));
            const targetTask = targetDay.tasks.find(task => task.id === taskId);
            void syncAppStateToCloud(appState);

            // Update UI elements in DOM
            const checkboxElements = document.querySelectorAll(`[data-task-id="${taskId}"]`);
            checkboxElements.forEach(cb => {
                if (targetTask.completed) {
                    cb.classList.add('checked');
                    const textLabel = cb.closest('.task-item-container')?.querySelector('.task-text-content');
                    if (textLabel) textLabel.classList.add('line-through', 'opacity-50');
                } else {
                    cb.classList.remove('checked');
                    const textLabel = cb.closest('.task-item-container')?.querySelector('.task-text-content');
                    if (textLabel) textLabel.classList.remove('line-through', 'opacity-50');
                }
            });

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
                    if (typeof confetti === 'function' && getUserSetting('confetti', true)) {
                        confetti({ particleCount: 70, spread: 60, origin: { y: 0.65 } });
                    }
                } catch(e) {}

                // Calculate today's status
                const activeDayNum = typeof getActiveMissionDayNumber === 'function' ? getActiveMissionDayNumber() : 1;
                const todayPlan = appState.plan.find(d => d.dayNumber === activeDayNum) || appState.plan.find(d => d.date === TODAY_STR);
                if (todayPlan && targetDay?.date === getLocalDateStr()) {
                    const completedToday = todayPlan.tasks.filter(t => t.completed).length;
                    const totalToday = todayPlan.tasks.length;
                    if (completedToday === totalToday && totalToday > 0) {
                        try {
                            if (typeof confetti === 'function' && getUserSetting('confetti', true)) {
                                confetti({ particleCount: 140, spread: 90, origin: { y: 0.55 } });
                            }
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
                    showAppToast(getAppLanguage() === 'ml' ? 'ബാക്കി പഠന ഭാഗം പൂർത്തിയായി.' : 'Pending task completed. Today’s timetable is unchanged.');
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
                return `📚 Mission PlusTwo — Kerala DHSE Study Planner\n🎯 My Progress: ${stats.percentage}% completed (${stats.completedCount}/${stats.totalCount} tasks)\n🔥 Study Streak: ${streak} days\nPlan your Plus Two & +1 Improvement timetable with built-in revision buffer:`;
            }
            return 'Mission PlusTwo: Free intelligent daily study planner for Kerala DHSE Plus Two (+2) & Plus One Improvement students with built-in revision buffer. Set your target date and generate your personalized daily study plan:';
        }

        function shareApp() {
            const shareTitle = 'Mission PlusTwo — Kerala DHSE Study Planner';
            const shareText = getShareSummaryText();
            const shareUrl = 'https://mission-plustwo.web.app/';

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
            const shareUrl = 'https://mission-plustwo.web.app/';
            trackEvent('plan_shared', { channel: 'whatsapp' });
            const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`;
            window.open(whatsappUrl, '_blank');
        }

        function shareOnTelegram() {
            const shareText = '🎓 ' + getShareSummaryText();
            const shareUrl = 'https://mission-plustwo.web.app/';
            trackEvent('plan_shared', { channel: 'telegram' });
            const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
            window.open(telegramUrl, '_blank');
        }

        function copyShareLink() {
            const shareUrl = 'https://mission-plustwo.web.app/';
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
            link.setAttribute('download', `mission-plustwo-schedule-${appState.stream || 'plan'}.csv`);
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

        function updateActiveNavButtons() {
            const todayBtn = document.getElementById('nav-btn-today');
            const planBtn = document.getElementById('nav-btn-plan');
            const sylBtn = document.getElementById('nav-btn-syllabus');

            const mobToday = document.getElementById('mob-btn-today');
            const mobPlan = document.getElementById('mob-btn-plan');
            const mobSyl = document.getElementById('mob-btn-syllabus');

            [todayBtn, planBtn, sylBtn].forEach(b => {
                if (b) {
                    b.classList.remove('text-blue-600', 'bg-white', 'shadow-sm');
                    b.classList.add('text-slate-600');
                }
            });
            [mobToday, mobPlan, mobSyl].forEach(b => {
                if (b) {
                    b.classList.remove('text-blue-600');
                    b.classList.add('text-slate-400');
                }
            });

            if (currentView === 'today') {
                todayBtn?.classList.add('text-blue-600', 'bg-white', 'shadow-sm');
                mobToday?.classList.add('text-blue-600');
            } else if (currentView === 'plan') {
                planBtn?.classList.add('text-blue-600', 'bg-white', 'shadow-sm');
                mobPlan?.classList.add('text-blue-600');
            } else if (currentView === 'syllabus') {
                sylBtn?.classList.add('text-blue-600', 'bg-white', 'shadow-sm');
                mobSyl?.classList.add('text-blue-600');
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

            try {
                // 1. If signed in, delete the cloud document from Firestore so it doesn't restore!
                if (currentUser && db) {
                    await db.collection('users').doc(currentUser.uid).delete();
                }
            } catch(e) {
                console.warn("Cloud delete note:", e);
            }

            // 2. Clear local storage
            localStorage.removeItem('plusTwoMissionState_v2');
            localStorage.removeItem('plusTwoPlanState');
            localStorage.removeItem('has_seen_auth_modal');
            if (authModalTimer) {
                clearTimeout(authModalTimer);
                authModalTimer = null;
            }

            // 3. Reset in-memory state and re-render setup screen
            appState = null;
            selectedStream = 'cs';
            selectedCompletedChapters.clear();
            currentView = 'today';
            showAppToast("Study plan reset. Ready to start fresh!", "fa-rotate text-blue-400");
            renderApp();
            window.scrollTo({ top: 0, behavior: 'smooth' });
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
                            btn.className = 'py-1 px-2 text-xs font-black rounded-lg bg-rose-600 text-white shadow-xs transition';
                        } else if (lvl === 'strong') {
                            btn.className = 'py-1 px-2 text-xs font-black rounded-lg bg-emerald-600 text-white shadow-xs transition';
                        } else {
                            btn.className = 'py-1 px-2 text-xs font-black rounded-lg bg-blue-600 text-white shadow-xs transition';
                        }
                    } else {
                        btn.className = 'py-1 px-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-[#162137] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e2d4a] transition';
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
                    <div class="flex flex-col xs:flex-row xs:items-center justify-between gap-1.5 p-2.5 bg-white dark:bg-[#0e1526] rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-slate-800 dark:text-white">${sub}</span>
                            ${currentConf === 'focus' ? `<span class="text-xs font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-200/60 dark:border-rose-800/60">${priorityText}</span>` : (currentConf === 'strong' ? `<span class="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200/60 dark:border-emerald-800/60">${fastText}</span>` : '')}
                        </div>
                        <div class="flex items-center gap-1 bg-slate-50 dark:bg-[#141d30] p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60 self-start xs:self-auto">
                            <button type="button" id="conf-btn-${subSafe}-focus" onclick="setSubjectConfidence('${sub}', 'focus')" class="py-1 px-2 text-xs ${currentConf === 'focus' ? 'font-black bg-rose-600 text-white shadow-xs' : 'font-semibold bg-slate-100 dark:bg-[#162137] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e2d4a]'} rounded-lg transition" title="Needs extra practice & prioritized in daily rotation">
                                🎯 Focus
                            </button>
                            <button type="button" id="conf-btn-${subSafe}-standard" onclick="setSubjectConfidence('${sub}', 'standard')" class="py-1 px-2 text-xs ${currentConf === 'standard' ? 'font-black bg-blue-600 text-white shadow-xs' : 'font-semibold bg-slate-100 dark:bg-[#162137] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e2d4a]'} rounded-lg transition" title="Standard balanced study pace">
                                ⚡ Normal
                            </button>
                            <button type="button" id="conf-btn-${subSafe}-strong" onclick="setSubjectConfidence('${sub}', 'strong')" class="py-1 px-2 text-xs ${currentConf === 'strong' ? 'font-black bg-emerald-600 text-white shadow-xs' : 'font-semibold bg-slate-100 dark:bg-[#162137] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e2d4a]'} rounded-lg transition" title="Confident in concepts & spaced out lighter frequency">
                                🌟 Strong
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
                        el.className = 'cursor-pointer p-3 rounded-2xl border-2 border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/20 transition text-left flex flex-col justify-between relative shadow-xs';
                    } else {
                        el.className = 'cursor-pointer p-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0e1526] hover:border-slate-300 dark:hover:border-slate-600 transition text-left flex flex-col justify-between';
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
                        btn.className = 'flex-1 py-2 px-3 text-xs font-black rounded-xl bg-blue-600 text-white shadow-sm transition flex flex-col items-center';
                    } else {
                        btn.className = 'flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-[#141d30] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1a253c] transition flex flex-col items-center';
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

        let selectedStream = 'cs'; // default: 'cs' (Computer Science preset), 'bio', or 'imp_only'
        let activeSetupSubjectTab = 'Physics';
        let activeSetupGradeTab = '+2'; // '+2' or '+1'
        const selectedCompletedChapters = new Set();

        // getStreamSubjects imported from ./engine/planner.js

        function setStreamSelection(stream) {
            selectedStream = stream;
            selectedCompletedChapters.clear();
            const subs = getStreamSubjects(stream);
            if (stream === 'imp_only') {
                activeSetupGradeTab = '+1';
                activeSetupSubjectTab = 'Physics';
                const cb = document.getElementById('has-improvement');
                if (cb) cb.checked = true;
            } else {
                activeSetupGradeTab = '+2';
                activeSetupSubjectTab = subs[0];
            }
            renderApp();
            goToSetupStep(1);
            document.getElementById(`stream-card-${stream === 'imp_only' ? 'imp' : stream}`)?.focus();
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
            if (selectedStream === 'imp_only') {
                const checkedSubs = subs.filter(sub => {
                    const subId = sub.replace(/\s+/g, '-').toLowerCase();
                    const cb = document.getElementById(`imp-${subId}`);
                    return cb && cb.checked;
                });
                if (checkedSubs.length > 0) {
                    subs = checkedSubs;
                }
            }
            if (!subs.includes(activeSetupSubjectTab) && subs.length > 0) {
                activeSetupSubjectTab = subs[0];
            }
            return subs.map(sub => `
                <button type="button" id="setup-tab-${sub.replace(/\s+/g, '-')}" onclick="switchSetupSubject('${sub}')" class="py-1.5 px-3 text-xs font-bold rounded-xl ${sub === activeSetupSubjectTab ? 'bg-slate-800 dark:bg-slate-700 text-white shadow-sm' : 'bg-slate-100 dark:bg-[#162137] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e2d4a]'} transition">
                    ${sub}
                </button>
            `).join('');
        }

        function setImprovementToggle(enabled) {
            const cb = document.getElementById('has-improvement');
            if (cb) cb.checked = enabled;

            const noCard = document.getElementById('imp-choice-no');
            const yesCard = document.getElementById('imp-choice-yes');
            const optionsPanel = document.getElementById('improvement-options');

            if (enabled) {
                if (yesCard) {
                    yesCard.className = 'cursor-pointer p-3 sm:p-3.5 rounded-2xl border-2 border-amber-500 dark:border-amber-400 bg-amber-50/80 dark:bg-amber-950/40 ring-2 ring-amber-400/25 transition text-left flex items-center justify-between shadow-xs';
                    const check = yesCard.querySelector('.choice-check');
                    if (check) {
                        check.innerHTML = '<i class="fa-solid fa-check text-white"></i>';
                        check.className = 'w-5 h-5 rounded-full bg-amber-600 dark:bg-amber-500 flex items-center justify-center text-xs choice-check';
                    }
                }
                if (noCard) {
                    noCard.className = 'cursor-pointer p-3 sm:p-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0e1526] hover:border-slate-300 dark:hover:border-slate-600 transition text-left flex items-center justify-between';
                    const check = noCard.querySelector('.choice-check');
                    if (check) {
                        check.innerHTML = '';
                        check.className = 'w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-xs choice-check';
                    }
                }
                if (optionsPanel) {
                    optionsPanel.classList.remove('hidden');
                }
            } else {
                if (noCard) {
                    noCard.className = 'cursor-pointer p-3 sm:p-3.5 rounded-2xl border-2 border-slate-700 dark:border-slate-500 bg-slate-50 dark:bg-[#141d30] ring-2 ring-slate-400/20 transition text-left flex items-center justify-between shadow-xs';
                    const check = noCard.querySelector('.choice-check');
                    if (check) {
                        check.innerHTML = '<i class="fa-solid fa-check text-white"></i>';
                        check.className = 'w-5 h-5 rounded-full bg-slate-700 dark:bg-slate-500 flex items-center justify-center text-xs choice-check';
                    }
                }
                if (yesCard) {
                    yesCard.className = 'cursor-pointer p-3 sm:p-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0e1526] hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition text-left flex items-center justify-between';
                    const check = yesCard.querySelector('.choice-check');
                    if (check) {
                        check.innerHTML = '';
                        check.className = 'w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-xs choice-check';
                    }
                }
                if (optionsPanel) {
                    optionsPanel.classList.add('hidden');
                }
            }
        }

        function renderImprovementSubjectItems() {
            const defaultDates = {
                'Physics': '2026-10-12',
                'Mathematics': '2026-10-14',
                'Chemistry': '2026-10-16',
                'Botany': '2026-10-19',
                'Zoology': '2026-10-19',
                'Computer Science': '2026-10-19',
                'Accountancy': '2026-10-14',
                'Business Studies': '2026-10-16',
                'Economics': '2026-10-18',
                'Computer Applications': '2026-10-20',
                'History': '2026-10-14',
                'Political Science': '2026-10-16',
                'Sociology': '2026-10-18'
            };
            const subs = getStreamSubjects(selectedStream);
            return subs.map(sub => {
                const subId = sub.replace(/\s+/g, '-').toLowerCase();
                const defaultDate = defaultDates[sub] || '2026-10-19';
                return `
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white dark:bg-[#141d30] rounded-xl border border-amber-200/80 dark:border-amber-500/30 shadow-xs hover:border-amber-300 dark:hover:border-amber-400/50 transition">
                        <label class="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-100 select-none">
                            <input type="checkbox" id="imp-${subId}" class="rounded border-slate-300 dark:border-slate-600 text-amber-600 focus:ring-amber-500 w-4 h-4">
                            <span>${sub} (+1 Improvement)</span>
                        </label>
                        <div class="flex items-center gap-2 self-end sm:self-auto">
                            <span class="text-xs text-slate-500 dark:text-slate-300 font-medium">Exam Date:</span>
                            <input type="date" id="input-date-${subId}" value="${defaultDate}" class="border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-[#0e1526] focus:bg-white dark:focus:bg-[#141d30] focus:border-amber-600 outline-none transition">
                        </div>
                    </div>
                `;
            }).join('');
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
                    btnP2.className = 'flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-blue-600 dark:bg-blue-500 text-white shadow-sm transition flex items-center justify-center gap-1.5';
                    btnP1.className = 'flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-slate-100 dark:bg-[#162137] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e2d4a] transition flex items-center justify-center gap-1.5';
                } else {
                    btnP1.className = 'flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-amber-600 dark:bg-amber-500 text-white shadow-sm transition flex items-center justify-center gap-1.5';
                    btnP2.className = 'flex-1 py-2 px-3 text-xs font-bold rounded-xl bg-slate-100 dark:bg-[#162137] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e2d4a] transition flex items-center justify-center gap-1.5';
                }
            }

            getStreamSubjects(selectedStream).forEach(s => {
                const btn = document.getElementById(`setup-tab-${s.replace(/\s+/g, '-')}`);
                if (btn) {
                    if (s === activeSetupSubjectTab) {
                        btn.className = 'py-1.5 px-3 text-xs font-bold rounded-xl bg-slate-800 dark:bg-slate-700 text-white shadow-sm transition';
                    } else {
                        btn.className = 'py-1.5 px-3 text-xs font-bold rounded-xl bg-slate-100 dark:bg-[#162137] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e2d4a] transition';
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
                badge.className = 'text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#162137] text-slate-500 dark:text-slate-300';
            } else {
                badge.innerHTML = isML
                    ? `<i class="fa-solid fa-check mr-1"></i>${total} പൂർത്തിയായി (${p2Count} +2, ${p1Count} +1)`
                    : `<i class="fa-solid fa-check mr-1"></i>${total} completed (${p2Count} in +2, ${p1Count} in +1)`;
                badge.className = 'text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-600/50';
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
                <div class="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100 dark:border-slate-700/60">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-slate-700 dark:text-slate-200">
                            ${grade === '+1' ? '<span class="text-amber-700 dark:text-amber-300 font-extrabold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200/60 dark:border-amber-700/60">+1 Improvement</span>' : '<span class="text-blue-700 dark:text-blue-300 font-extrabold bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded border border-blue-200/60 dark:border-blue-700/60">+2 Regular</span>'} • ${subject}
                        </span>
                        <span class="text-xs text-slate-400 dark:text-slate-400 font-medium">${completedText}</span>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" onclick="toggleAllSubjectChapters('${grade}', '${subject}', true)" class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">${selectAllText}</button>
                        <span class="text-slate-300 dark:text-slate-600">|</span>
                        <button type="button" onclick="toggleAllSubjectChapters('${grade}', '${subject}', false)" class="text-xs font-bold text-slate-500 dark:text-slate-300 hover:underline">${clearText}</button>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
            `;

            uniqueChaps.forEach(ch => {
                const isChecked = selectedCompletedChapters.has(ch.chapId);
                html += `
                    <label class="flex items-start gap-2.5 p-2 rounded-xl ${isChecked ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-600/50' : 'hover:bg-slate-50 dark:hover:bg-[#141d30] border-slate-200/80 dark:border-slate-700/60'} border cursor-pointer transition text-xs select-none">
                        <input type="checkbox" data-grade="${grade}" data-subject="${subject}" value="${ch.chapId}" ${isChecked ? 'checked' : ''} onchange="toggleChapterSelection('${ch.chapId}', this.checked); this.closest('label').classList.toggle('bg-emerald-50/70', this.checked); this.closest('label').classList.toggle('dark:bg-emerald-950/40', this.checked); this.closest('label').classList.toggle('border-emerald-200', this.checked); this.closest('label').classList.toggle('dark:border-emerald-600/50', this.checked); this.closest('label').classList.toggle('border-slate-200/80', !this.checked); this.closest('label').classList.toggle('dark:border-slate-700/60', !this.checked);" class="completed-chapter-cb mt-0.5 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500 w-4 h-4">
                        <div class="flex-1 truncate">
                            <span class="font-bold text-slate-800 dark:text-white block truncate" title="${ch.chapterName}">Chapter ${ch.chapNumber}: ${ch.chapterName.replace(/^Chapter\s+\d+:\s*/i, '').replace(/^\d+\.\s*/, '')}</span>
                            <span class="text-xs ${grade === '+1' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400 dark:text-slate-400'} font-medium">${grade === '+1' ? '+1 Improvement Paper' : 'Term ' + ch.term} • ${ch.totalParts} ${studyPartsLabel}</span>
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
                        card.className = 'cursor-pointer p-3.5 sm:p-4 rounded-2xl border-2 border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20 transition text-left flex flex-col justify-between relative shadow-sm';
                        if (checkIcon) {
                            checkIcon.className = 'w-4 h-4 rounded-full bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center text-xs check-indicator';
                            checkIcon.innerHTML = '<i class="fa-solid fa-check"></i>';
                        }
                    } else {
                        card.className = 'cursor-pointer p-3.5 sm:p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0e1526] hover:border-slate-300 dark:hover:border-slate-600 transition text-left flex flex-col justify-between';
                        if (checkIcon) {
                            checkIcon.className = 'w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center check-indicator';
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

        function setDeadlinePreset(dateStr) {
            const input = document.getElementById('deadline-date');
            if (input) {
                input.value = dateStr;
                updateDeadlinePreview();
            }
        }

        function updateDeadlinePreview() {
            const input = document.getElementById('deadline-date');
            const label = document.getElementById('deadline-calc-label');
            if (!input || !label) return;
            const isML = getAppLanguage() === 'ml';
            const smartStart = typeof getSmartStartDate === 'function' ? getSmartStartDate() : { startDate: TODAY_STR, isLateEvening: false };
            const effectiveStart = smartStart.startDate;
            const days = calculateDaysBetween(effectiveStart, input.value);
            if (days <= 0) {
                label.innerHTML = isML
                    ? '<span class="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5"><i class="fa-solid fa-triangle-exclamation"></i> തിരഞ്ഞെടുത്ത തീയതി കഴിഞ്ഞുപോയി! ഭാവിയിലെ തീയതി നൽകുക.</span>'
                    : '<span class="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5"><i class="fa-solid fa-triangle-exclamation"></i> Selected date has passed! Please select a future target date.</span>';
            } else {
                let revDays = 0;
                if (days >= 75) revDays = 10;
                else if (days >= 45) revDays = 7;
                else if (days >= 25) revDays = 4;
                else if (days >= 14) revDays = 2;
                else if (days >= 7) revDays = 1;
                const studyDays = Math.max(1, days - revDays);
                const nightBadge = smartStart.isLateEvening ? `
                    <div class="mt-2 text-[11px] text-amber-700 dark:text-amber-300 font-semibold bg-amber-50 dark:bg-amber-950/40 p-2 rounded-xl border border-amber-200/60 dark:border-amber-800/40 flex items-center gap-1.5">
                        <i class="fa-solid fa-moon text-amber-500"></i>
                        <span>${isML ? 'രാത്രി വൈകി: ആദ്യ ദിന പഠനം നാളെ രാവിലെ മുതൽ ആരംഭിക്കുന്നു' : 'Late evening: Day 1 study runway starts fresh tomorrow morning'}</span>
                    </div>
                ` : '';
                label.innerHTML = isML ? `
                    <div class="flex flex-wrap items-center justify-between gap-1">
                        <span class="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                            <i class="fa-solid fa-calculator text-blue-600 dark:text-blue-400"></i>
                            <span><strong>${days}</strong> ദിവസങ്ങൾ ലഭ്യമാണ്</span>
                        </span>
                        <span class="text-purple-700 dark:text-purple-300 font-bold bg-purple-100/70 dark:bg-purple-950/40 px-2 py-0.5 rounded-md text-xs">
                            <i class="fa-solid fa-shield-check mr-1"></i>${revDays} ദിവസങ്ങൾ റിവിഷനായി മാറ്റി വെച്ചു
                        </span>
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-300 mt-1">
                        ${studyDays} ദിവസത്തെ പഠനം. അവസാന ${revDays} ദിവസങ്ങൾ മുൻവർഷ ചോദ്യങ്ങളും ഫോർമുലകളും പഠിക്കാൻ നീക്കിവെച്ചു.
                    </div>
                    ${nightBadge}
                ` : `
                    <div class="flex flex-wrap items-center justify-between gap-1">
                        <span class="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                            <i class="fa-solid fa-calculator text-blue-600 dark:text-blue-400"></i>
                            <span><strong>${days}</strong> calendar days available</span>
                        </span>
                        <span class="text-purple-700 dark:text-purple-300 font-bold bg-purple-100/70 dark:bg-purple-950/40 px-2 py-0.5 rounded-md text-xs">
                            <i class="fa-solid fa-shield-check mr-1"></i>${revDays} days reserved for Mock Revision
                        </span>
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-300 mt-1">
                        ${studyDays} active syllabus study days. Final ${revDays} days will strictly run PYQ sets and formula drills.
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
                    checkEl.className = "flex items-center gap-2.5 text-xs text-slate-400 dark:text-slate-500 transition-colors duration-300";
                    const badge = checkEl.querySelector('span');
                    if (badge) {
                        badge.className = "w-5 h-5 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 text-[10px] shrink-0 font-bold";
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
                if (stageLabel) stageLabel.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-blue-500 text-[10px]"></i> ${s.stageText}`;
                if (iconEl) iconEl.className = `fa-solid ${s.icon} text-xl transition-all duration-300`;

                for (let c = 1; c <= s.checkIndex; c++) {
                    const checkEl = document.getElementById(`plan-gen-check-${c}`);
                    if (checkEl) {
                        const isCurrent = c === s.checkIndex && idx < stages.length - 1;
                        checkEl.className = isCurrent 
                            ? "flex items-center gap-2.5 text-xs text-blue-600 dark:text-blue-400 font-bold transition-colors duration-300"
                            : "flex items-center gap-2.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold transition-colors duration-300";
                        const badge = checkEl.querySelector('span');
                        if (badge) {
                            if (isCurrent) {
                                badge.className = "w-5 h-5 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[10px] shrink-0 font-bold";
                                badge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
                            } else {
                                badge.className = "w-5 h-5 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 text-[10px] shrink-0 font-bold";
                                badge.innerHTML = `<i class="fa-solid fa-check"></i>`;
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

            // Collect excluded / already completed chapters (both +2 and +1)
            const checkedCompletedBoxes = Array.from(selectedCompletedChapters);

            const isImpOnly = selectedStream === 'imp_only';
            const allowedSubjects = getStreamSubjects(selectedStream);
            let tasksToPlan = [];

            if (!isImpOnly) {
                // Filter Plus Two tasks: only include tasks of the chosen stream, up to targetTerm, and not marked completed
                tasksToPlan = PLUS_TWO_SYLLABUS.filter(t => 
                    allowedSubjects.includes(t.subject) && 
                    t.term <= targetTerm && 
                    !checkedCompletedBoxes.includes(t.chapId)
                );
            }

            // Plus One Improvement Config (Strictly Stream Isolated)
            let improvementConfig = [];
            const hasImp = isImpOnly || document.getElementById('has-improvement')?.checked;

            if (hasImp) {
                let hasError = false;
                allowedSubjects.forEach(sub => {
                    const subId = sub.replace(/\s+/g, '-').toLowerCase();
                    const cb = document.getElementById(`imp-${subId}`);
                    if (cb && cb.checked) {
                        const examDate = document.getElementById(`input-date-${subId}`)?.value;
                        if (!examDate) {
                            showAppAlert({
                                title: "Exam Date Missing",
                                message: `Please choose an exam date for ${sub} improvement.`,
                                icon: "fa-calendar-day text-amber-500"
                            });
                            hasError = true;
                            return;
                        }
                        improvementConfig.push({ subject: sub, examDate: examDate });
                        // Exclude finished Plus One chapters!
                        const incompletePlusOne = PLUS_ONE_SYLLABUS.filter(t => t.subject === sub && !checkedCompletedBoxes.includes(t.chapId));
                        tasksToPlan.push(...incompletePlusOne);
                    }
                });
                if (hasError) return;

                if (isImpOnly && improvementConfig.length === 0) {
                    showAppAlert({
                        title: "Subjects Required",
                        message: "Please select at least one +1 Improvement subject to create your schedule.",
                        icon: "fa-list-check text-amber-500"
                    });
                    return;
                }
            }

            if (tasksToPlan.length === 0) {
                showAppAlert({
                    title: isML ? "എല്ലാ അധ്യായങ്ങളും പൂർത്തിയായി" : "All Chapters Marked Completed",
                    message: isML ? "എല്ലാ അധ്യായങ്ങളും പൂർത്തിയായി എന്ന് അടയാളപ്പെടുത്തിയിരിക്കുന്നു. ഷെഡ്യൂൾ ചെയ്യാൻ കുറഞ്ഞത് ഒരു അധ്യായമെങ്കിലും ടിക്ക് ഒഴിവാക്കുക." : "All chapters in the selected scope were marked completed. Please uncheck at least one chapter to schedule your daily timetable.",
                    icon: "fa-circle-info text-blue-500"
                });
                return;
            }

            animatePlanGeneration({ mode: 'create', isLateEvening: smartStart.isLateEvening }, () => {
                const impSubs = (improvementConfig || []).map(c => c.subject);
                const personalization = getPersonalizationConfig(impSubs);
                const planResult = buildIntelligentPlan(deadlineInput, tasksToPlan, effectiveStartDate, improvementConfig, selectedStream, {
                    intensity: studyIntensity,
                    personalization: personalization,
                    improvementOnly: isImpOnly
                });

                if (planResult && planResult.planDays) {
                    appState = {
                        engineVersion: PLANNER_ENGINE_VERSION,
                        stream: selectedStream,
                        improvementOnly: isImpOnly,
                        studyIntensity: studyIntensity,
                        personalization: personalization,
                        startDate: effectiveStartDate,
                        deadlineDate: deadlineInput,
                        targetTerm: isImpOnly ? 1 : targetTerm,
                        completedChaptersOnInit: checkedCompletedBoxes,
                        improvementConfig: improvementConfig,
                        plan: planResult.planDays,
                        revisionDaysCount: planResult.revisionDaysCount,
                        totalConfiguredTasks: tasksToPlan.length,
                        diagnostics: planResult.diagnostics,
                        isLateEveningGenerated: smartStart.isLateEvening,
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

        function shiftPlanToToday() {
            if (!appState || !appState.plan || appState.plan.length === 0) return;
            shiftPlanToStartDate(TODAY_STR);
        }

        function shiftPlanToStartDate(newStartDateStr = TODAY_STR) {
            if (!appState || !appState.plan || appState.plan.length === 0) return;
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

        function openRegenerateModal() {
            if (!appState || !appState.plan) return;
            const select = document.getElementById('completed-day-select');
            select.innerHTML = '';

            const todayIdx = appState.plan.findIndex(d => d.date === TODAY_STR);
            const currentDayNumber = todayIdx !== -1 ? appState.plan[todayIdx].dayNumber : appState.plan.length;
            const maxChoice = Math.max(0, currentDayNumber - 1);

            const opt0 = document.createElement('option');
            opt0.value = 0;
            opt0.text = "Day 0 (Start fresh from Day 1 today)";
            if (maxChoice === 0) opt0.selected = true;
            select.appendChild(opt0);

            for (let i = 1; i <= maxChoice; i++) {
                const dayPlan = appState.plan.find(p => p.dayNumber === i);
                const dateNote = dayPlan ? ` (${dayPlan.date})` : '';
                const opt = document.createElement('option');
                opt.value = i;
                opt.text = `Day ${i}${dateNote}`;
                if (i === maxChoice && maxChoice > 0) opt.selected = true;
                select.appendChild(opt);
            }

            document.getElementById('regenerate-modal').classList.remove('hidden');
            document.getElementById('regenerate-modal').classList.add('flex');
        }

        function closeRegenerateModal() {
            document.getElementById('regenerate-modal').classList.add('hidden');
            document.getElementById('regenerate-modal').classList.remove('flex');
        }

        function executeRegeneration() {
            const completedUpTo = parseInt(document.getElementById('completed-day-select').value);

            let keptDays = [];
            const completedTaskIds = new Set();
            const completedChapterIds = new Set(appState.completedChaptersOnInit || []);

            if (completedUpTo > 0) {
                appState.plan.forEach(day => {
                    if (day.dayNumber <= completedUpTo) {
                        day.tasks.forEach(t => {
                            t.completed = true;
                            completedTaskIds.add(t.id);
                        });
                        keptDays.push(day);
                    } else {
                        // Preserve tasks completed ahead of schedule in future days!
                        day.tasks.forEach(t => {
                            if (t.completed) {
                                completedTaskIds.add(t.id);
                            }
                        });
                    }
                });
            } else {
                // If starting fresh from Day 1 today, preserve checkmarks for previously completed tasks
                appState.plan.forEach(day => {
                    day.tasks.forEach(t => {
                        if (t.completed) completedTaskIds.add(t.id);
                    });
                });
            }

            const smartStart = typeof getSmartStartDate === 'function' ? getSmartStartDate() : { startDate: TODAY_STR, isLateEvening: false };
            let rebuildStartDate = (completedUpTo === 0) ? smartStart.startDate : getLocalDateStr();

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

            const userStream = appState.stream || (appState.plan.some(d => d.tasks.some(t => t.subject === 'Botany' || t.subject === 'Zoology')) ? 'bio' : 'cs');
            const targetTerm = appState.targetTerm || 3;
            const allowedSubjects = getStreamSubjects(userStream);

            // Reconstruct remaining Plus Two tasks in canonical prerequisite order
            let uncompletedTasks = PLUS_TWO_SYLLABUS.filter(t =>
                allowedSubjects.includes(t.subject) &&
                t.term <= targetTerm &&
                !completedChapterIds.has(t.chapId) &&
                !completedTaskIds.has(t.id)
            );

            // Reconstruct remaining Plus One Improvement tasks in canonical prerequisite order
            if (appState.improvementConfig && appState.improvementConfig.length > 0) {
                appState.improvementConfig.forEach(cfg => {
                    const incompleteP1 = PLUS_ONE_SYLLABUS.filter(t =>
                        t.subject === cfg.subject &&
                        !completedChapterIds.has(t.chapId) &&
                        !completedTaskIds.has(t.id)
                    );
                    uncompletedTasks.push(...incompleteP1);
                });
            }

            closeRegenerateModal();

            animatePlanGeneration({ mode: 'rebalance', isLateEvening: (completedUpTo === 0 && smartStart.isLateEvening) }, () => {
                const result = buildIntelligentPlan(appState.deadlineDate, uncompletedTasks, rebuildStartDate, appState.improvementConfig || [], userStream, {
                    intensity: appState.studyIntensity || 'balanced',
                    personalization: appState.personalization || {}
                });

                if (result && result.planDays) {
                    // Adjust day numbering seamlessly following keptDays
                    result.planDays.forEach((d, idx) => {
                        d.dayNumber = completedUpTo + idx + 1;
                    });

                    appState.plan = [...keptDays, ...result.planDays];
                    if (completedUpTo === 0) {
                        appState.startDate = rebuildStartDate;
                    }

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
                            : "Schedule rebalanced with dependency tracking!",
                            "fa-wand-magic-sparkles text-blue-400");
                    }
                    renderApp();

                }
            });
        }

        /* ==========================================================================
           8. CORE APP VIEW RENDERER
           ========================================================================== */
        let setupCurrentStep = 1;

        function goToSetupStep(stepNum) {
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
                        pill.className = 'w-7 h-7 rounded-full bg-blue-600 text-white font-black scale-110 shadow-sm shadow-blue-500/30 text-xs flex items-center justify-center transition';
                        pill.innerHTML = `${i}`;
                    } else if (i < stepNum) {
                        pill.className = 'w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-black border border-emerald-300/60 text-xs flex items-center justify-center transition';
                        pill.innerHTML = '<i class="fa-solid fa-check text-[10px]"></i>';
                    } else {
                        pill.className = 'w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold text-xs flex items-center justify-center transition';
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
                    const streamNames = {
                        cs: 'Computer Science (+2)',
                        bio: 'Biology Science (+2)',
                        commerce: 'Commerce (+2)',
                        humanities: 'Humanities (+2)',
                        imp_only: '+1 Improvement Only'
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

            const wizardCard = document.getElementById('setup-wizard-card');
            if (wizardCard) {
                wizardCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            const openSections = new Set([...container.querySelectorAll('details[id][open]')].map(section => section.id));
            document.body.classList.toggle('is-setting-up', !appState);
            const isML = getAppLanguage() === 'ml';
            const dateDisplay = document.getElementById('date-display');
            if (dateDisplay) {
                dateDisplay.innerText = new Date().toLocaleDateString(isML ? 'ml-IN' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            }

            // View 0: Initial Setup View (Instant 1-Screen Setup — Zero "Next... Next..." Fatigue)
            if (!appState) {
                trackAnalyticsEvent('setup_started');
                let defaultTarget = new Date();
                defaultTarget.setMonth(10); // November
                defaultTarget.setDate(30);
                if (new Date() > defaultTarget) defaultTarget.setFullYear(defaultTarget.getFullYear() + 1);

                container.innerHTML = `
                    <div id="setup-wizard-card" class="max-w-2xl mx-auto bg-white dark:bg-[#0e1422] rounded-3xl p-5 sm:p-8 shadow-xl border border-slate-100 dark:border-slate-800/80 animate-fade-in-up">
                        <!-- Stepper Indicator -->
                        <div class="mb-6">
                            <div class="flex items-center justify-between mb-2">
                                <span id="setup-step-badge" class="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                                    ${isML ? 'ഘട്ടം' : 'Step'} ${setupCurrentStep} / 4
                                </span>
                                <div class="flex items-center gap-1.5">
                                    ${[1, 2, 3, 4].map(step => `
                                        <button type="button" id="setup-step-pill-${step}" onclick="goToSetupStep(${step})" class="w-7 h-7 rounded-full ${step === setupCurrentStep ? 'bg-blue-600 text-white font-black scale-110 shadow-sm shadow-blue-500/30' : (step < setupCurrentStep ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-black border border-emerald-300/60' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold')} text-xs flex items-center justify-center transition">
                                            ${step < setupCurrentStep ? '<i class="fa-solid fa-check text-[10px]"></i>' : step}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                            <div class="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div id="setup-progress-bar" class="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-300" style="width: ${setupCurrentStep * 25}%"></div>
                            </div>
                        </div>

                        <!-- Form state inputs preserved for engine compatibility -->
                        <input type="hidden" id="target-term" value="2">
                        <input type="checkbox" id="has-improvement" class="hidden" ${selectedStream === 'imp_only' ? 'checked' : ''}>

                        <!-- STEP 1: Stream Selection -->
                        <div id="setup-step-1" class="${setupCurrentStep === 1 ? '' : 'hidden'} space-y-5 animate-fade-in-up">
                            <div class="text-left">
                                <h3 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                                    ${isML ? 'സ്ട്രീം തിരഞ്ഞെടുക്കുക' : 'Select Your Stream'}
                                </h3>
                                <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-300 mt-1">
                                    ${isML ? 'നിങ്ങൾ പഠിക്കുന്ന വിഷയം തിരഞ്ഞെടുക്കുക. സിലബസ് ഉടൻ തയ്യാറാകും.' : 'Choose your stream to load the bundled DHSE chapter list.'}
                                </p>
                            </div>

                            <div class="stream-options grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <!-- Option 1: Computer Science -->
                                <div id="stream-card-cs" aria-pressed="${selectedStream === 'cs'}" role="button" tabindex="0" onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" onclick="setStreamSelection('cs')" class="cursor-pointer p-3.5 rounded-2xl border-2 ${selectedStream === 'cs' ? 'border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/20 shadow-sm' : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0e1526] hover:border-slate-300 dark:hover:border-slate-600'} transition text-left flex flex-col justify-between">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2.5">
                                            <div class="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center justify-center text-base font-bold shrink-0">
                                                <i class="fa-solid fa-laptop-code"></i>
                                            </div>
                                            <div>
                                                <h4 class="font-black text-slate-900 dark:text-white text-sm">${isML ? ML_I18N.setup.csTitle : 'Computer Science (+2)'}</h4>
                                                <span class="text-[11px] font-semibold text-blue-700 dark:text-blue-300">Physics • Chem • Maths • CS</span>
                                            </div>
                                        </div>
                                        <span class="w-5 h-5 rounded-full ${selectedStream === 'cs' ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-600'} flex items-center justify-center text-xs">
                                            ${selectedStream === 'cs' ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
                                        </span>
                                    </div>
                                </div>

                                <!-- Option 2: Biology Science -->
                                <div id="stream-card-bio" aria-pressed="${selectedStream === 'bio'}" role="button" tabindex="0" onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" onclick="setStreamSelection('bio')" class="cursor-pointer p-3.5 rounded-2xl border-2 ${selectedStream === 'bio' ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20 shadow-sm' : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0e1526] hover:border-slate-300 dark:hover:border-slate-600'} transition text-left flex flex-col justify-between">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2.5">
                                            <div class="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-base font-bold shrink-0">
                                                <i class="fa-solid fa-seedling"></i>
                                            </div>
                                            <div>
                                                <h4 class="font-black text-slate-900 dark:text-white text-sm">${isML ? ML_I18N.setup.bioTitle : 'Biology Science (+2)'}</h4>
                                                <span class="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Physics • Chem • Maths • Bio</span>
                                            </div>
                                        </div>
                                        <span class="w-5 h-5 rounded-full ${selectedStream === 'bio' ? 'bg-emerald-600 text-white' : 'border border-slate-300 dark:border-slate-600'} flex items-center justify-center text-xs">
                                            ${selectedStream === 'bio' ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
                                        </span>
                                    </div>
                                </div>

                                <!-- Option 3: Commerce -->
                                <div id="stream-card-commerce" aria-pressed="${selectedStream === 'commerce'}" role="button" tabindex="0" onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" onclick="setStreamSelection('commerce')" class="cursor-pointer p-3.5 rounded-2xl border-2 ${selectedStream === 'commerce' ? 'border-purple-600 dark:border-purple-500 bg-purple-50/70 dark:bg-purple-950/40 ring-2 ring-purple-500/20 shadow-sm' : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0e1526] hover:border-slate-300 dark:hover:border-slate-600'} transition text-left flex flex-col justify-between">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2.5">
                                            <div class="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center text-base font-bold shrink-0">
                                                <i class="fa-solid fa-chart-line"></i>
                                            </div>
                                            <div>
                                                <h4 class="font-black text-slate-900 dark:text-white text-sm">${isML ? ML_I18N.setup.commerceTitle : 'Commerce (+2)'}</h4>
                                                <span class="text-[11px] font-semibold text-purple-700 dark:text-purple-300">Accountancy • Business • Econ</span>
                                            </div>
                                        </div>
                                        <span class="w-5 h-5 rounded-full ${selectedStream === 'commerce' ? 'bg-purple-600 text-white' : 'border border-slate-300 dark:border-slate-600'} flex items-center justify-center text-xs">
                                            ${selectedStream === 'commerce' ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
                                        </span>
                                    </div>
                                </div>

                                <!-- Option 4: Humanities -->
                                <div id="stream-card-humanities" aria-pressed="${selectedStream === 'humanities'}" role="button" tabindex="0" onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" onclick="setStreamSelection('humanities')" class="cursor-pointer p-3.5 rounded-2xl border-2 ${selectedStream === 'humanities' ? 'border-rose-600 dark:border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 ring-2 ring-rose-500/20 shadow-sm' : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0e1526] hover:border-slate-300 dark:hover:border-slate-600'} transition text-left flex flex-col justify-between">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2.5">
                                            <div class="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center text-base font-bold shrink-0">
                                                <i class="fa-solid fa-landmark"></i>
                                            </div>
                                            <div>
                                                <h4 class="font-black text-slate-900 dark:text-white text-sm">${isML ? ML_I18N.setup.humanitiesTitle : 'Humanities (+2)'}</h4>
                                                <span class="text-[11px] font-semibold text-rose-700 dark:text-rose-300">History • Pol Science • Sociology</span>
                                            </div>
                                        </div>
                                        <span class="w-5 h-5 rounded-full ${selectedStream === 'humanities' ? 'bg-rose-600 text-white' : 'border border-slate-300 dark:border-slate-600'} flex items-center justify-center text-xs">
                                            ${selectedStream === 'humanities' ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
                                        </span>
                                    </div>
                                </div>

                            </div>

                            <!-- Step 1 Navigation (Strictly "Next", No extra clutter) -->
                            <div class="pt-5 flex justify-end">
                                <button type="button" onclick="nextSetupStep()" class="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-3 px-8 rounded-2xl shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-2 active:scale-95">
                                    <span>${isML ? 'തുടരുക' : 'Next'}</span>
                                    <i class="fa-solid fa-arrow-right text-xs"></i>
                                </button>
                            </div>
                        </div>

                        <!-- STEP 2: Target Exam / Date -->
                        <div id="setup-step-2" class="${setupCurrentStep === 2 ? '' : 'hidden'} space-y-5 animate-fade-in-up">
                            <div class="text-left">
                                <h3 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                                    ${isML ? 'ലക്ഷ്യ പരീക്ഷ / തീയതി' : 'Target Exam & Date'}
                                </h3>
                                <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-300 mt-1">
                                    ${isML ? 'പരീക്ഷാ തീയതി തിരഞ്ഞെടുക്കുക. ദിവസങ്ങൾക്കനുസരിച്ച് ഷെഡ്യൂൾ ചെയ്യാം.' : 'Pick an exam preset or select your target completion date.'}
                                </p>
                            </div>

                            <!-- Fast Presets -->
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                <button type="button" onclick="setDeadlinePreset('${getRelativePresetDate(30)}')" class="py-2.5 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-200 dark:border-blue-700/80 transition flex flex-col items-center justify-center text-center gap-1 shadow-xs active:scale-95">
                                    <span class="text-amber-500 text-sm">⚡</span>
                                    <span>${isML ? '30 ദിവസത്തെ പ്ലാൻ' : '30-Day Sprint'}</span>
                                    <span class="text-[10px] text-slate-400">Fast Crash</span>
                                </button>
                                <button type="button" onclick="setDeadlinePreset('${getPresetDate(12, 20)}')" class="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-[#162137] hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-700 dark:hover:text-blue-300 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700/80 transition flex flex-col items-center justify-center text-center gap-1 active:scale-95">
                                    <span class="text-emerald-500 text-sm">🎄</span>
                                    <span>${isML ? 'ക്രിസ്മസ് പരീക്ഷ' : 'Dec 20 Xmas'}</span>
                                    <span class="text-[10px] text-slate-400">Term 1 & 2</span>
                                </button>
                                <button type="button" onclick="setDeadlinePreset('${getPresetDate(2, 28, true)}')" class="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-[#162137] hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-700 dark:hover:text-blue-300 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700/80 transition flex flex-col items-center justify-center text-center gap-1 active:scale-95">
                                    <span class="text-purple-500 text-sm">🎯</span>
                                    <span>${isML ? 'പബ്ലിക് പരീക്ഷ' : 'Feb 28 Board'}</span>
                                    <span class="text-[10px] text-slate-400">Full Syllabus</span>
                                </button>
                                <button type="button" onclick="setDeadlinePreset('${getPresetDate(11, 30)}')" class="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-[#162137] hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-700 dark:hover:text-blue-300 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700/80 transition flex flex-col items-center justify-center text-center gap-1 active:scale-95">
                                    <span class="text-blue-500 text-sm">📅</span>
                                    <span>${isML ? 'നവം 30' : 'Nov 30 Term 2'}</span>
                                    <span class="text-[10px] text-slate-400">Half-Yearly</span>
                                </button>
                            </div>

                            <!-- Date Picker -->
                            <div class="relative">
                                <input type="date" id="deadline-date" value="${getLocalDateStr(defaultTarget)}" onchange="updateDeadlinePreview()" oninput="updateDeadlinePreview()" class="w-full border-2 border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-sm font-bold text-slate-800 dark:text-white bg-slate-50 dark:bg-[#101726] focus:bg-white dark:focus:bg-[#141d30] focus:border-blue-600 outline-none transition">
                            </div>
                            <!-- Live Calculation Feedback Box -->
                            <div id="deadline-calc-label" class="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800/40 text-xs text-slate-600 dark:text-slate-200"></div>

                            <!-- Step 2 Navigation -->
                            <div class="pt-5 flex items-center justify-between gap-3">
                                <button type="button" onclick="prevSetupStep()" class="py-2.5 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 active:scale-95">
                                    <i class="fa-solid fa-arrow-left text-xs"></i>
                                    <span>${isML ? 'പിന്നോട്ട്' : 'Back'}</span>
                                </button>
                                <button type="button" onclick="nextSetupStep()" class="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-2.5 px-8 rounded-2xl shadow-md shadow-blue-500/20 transition flex items-center gap-2 active:scale-95">
                                    <span>${isML ? 'തുടരുക' : 'Next'}</span>
                                    <i class="fa-solid fa-arrow-right text-xs"></i>
                                </button>
                            </div>
                        </div>

                        <!-- STEP 3: Completed Chapters -->
                        <div id="setup-step-3" class="${setupCurrentStep === 3 ? '' : 'hidden'} space-y-4 animate-fade-in-up">
                            <div class="flex items-center justify-between pb-1">
                                <div class="text-left">
                                    <h3 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                                        ${isML ? 'പൂർത്തിയാക്കിയ അധ്യായങ്ങൾ' : 'Completed Chapters'}
                                    </h3>
                                    <p class="text-xs text-slate-500 dark:text-slate-300 mt-0.5">
                                        ${isML ? 'പഠിച്ചു കഴിഞ്ഞ അധ്യായങ്ങൾ ഇവിടെ ടിക്ക് ചെയ്യാം. അവ ഒഴിവാക്കി ബാക്കിയുള്ളവ ഷെഡ്യൂൾ ചെയ്യും.' : 'Mark chapters you already finished in school or tuition to skip them.'}
                                    </p>
                                </div>
                                <span id="completed-chaps-badge" class="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#162137] text-slate-500 dark:text-slate-300 shrink-0">0 completed</span>
                            </div>

                            <!-- Subject Tabs Switcher -->
                            <div id="setup-subject-tabs-container" class="flex flex-wrap gap-1.5 pt-1">
                                ${renderSetupSubjectTabs()}
                            </div>

                            <!-- Chapter List Container -->
                            <div id="setup-subject-chapters-list" class="bg-slate-50/70 dark:bg-[#101726] p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                                ${renderSetupSubjectChapters(activeSetupSubjectTab, activeSetupGradeTab)}
                            </div>

                            <!-- Step 3 Navigation -->
                            <div class="pt-5 flex items-center justify-between gap-3">
                                <button type="button" onclick="prevSetupStep()" class="py-2.5 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 active:scale-95">
                                    <i class="fa-solid fa-arrow-left text-xs"></i>
                                    <span>${isML ? 'പിന്നോട്ട്' : 'Back'}</span>
                                </button>
                                <button type="button" onclick="nextSetupStep()" class="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-2.5 px-8 rounded-2xl shadow-md shadow-blue-500/20 transition flex items-center gap-2 active:scale-95">
                                    <span>${isML ? 'തുടരുക' : 'Next'}</span>
                                    <i class="fa-solid fa-arrow-right text-xs"></i>
                                </button>
                            </div>
                        </div>

                        <!-- STEP 4: Start Plan & Advanced Customization -->
                        <div id="setup-step-4" class="${setupCurrentStep === 4 ? '' : 'hidden'} space-y-5 animate-fade-in-up">
                            <div class="text-left">
                                <h3 class="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                                    ${isML ? 'പഠനം ആരംഭിക്കാം!' : 'Ready to Start!'}
                                </h3>
                                <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-300 mt-1">
                                    ${isML ? 'ഒരു ക്ലിക്കിൽ നിങ്ങളുടെ ഡെയ്‌ലി ടൈംടേബിൾ തയ്യാറാക്കാം.' : 'One click to generate your personalized daily timetable for Day 1.'}
                                </p>
                            </div>

                            <div class="study-capacity">
                                        <!-- Daily Hours -->
                                        <div>
                                            <span class="text-xs font-extrabold text-slate-700 dark:text-slate-200 block mb-1.5">
                    ${isML ? ML_I18N.setup.hoursTitle : 'Daily Self-Study Hours'}
                                            </span>
                                            <div class="flex gap-2">
                                                <button type="button" id="hours-chip-2" onclick="setDailyHoursSelection(2)" class="flex-1 py-1.5 px-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-[#141d30] text-slate-600 dark:text-slate-300 transition">2 Hours</button>
                                                <button type="button" id="hours-chip-3_5" onclick="setDailyHoursSelection(3.5)" class="flex-1 py-1.5 px-2 text-xs font-black rounded-xl bg-blue-600 text-white shadow-sm transition">3–4 Hours</button>
                                                <button type="button" id="hours-chip-5" onclick="setDailyHoursSelection(5)" class="flex-1 py-1.5 px-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-[#141d30] text-slate-600 dark:text-slate-300 transition">5+ Hours</button>
                                            </div>
                                        </div>


                                <p class="text-xs text-slate-500 mt-2">${isML ? 'സ്കൂൾ, യാത്ര, വിശ്രമം എന്നിവയ്ക്ക് ശേഷം ലഭിക്കുന്ന സമയം തിരഞ്ഞെടുക്കുക.' : 'Choose time you can actually spare after school, travel and rest.'}</p>
                            </div>

                            <!-- Quick Summary Card -->
                            <div class="p-3.5 bg-slate-50 dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                                <div class="flex items-center justify-between text-xs">
                                    <span class="text-slate-500 dark:text-slate-400 font-medium">${isML ? 'സ്ട്രീം' : 'Stream'}</span>
                                    <span id="summary-stream-badge" class="font-extrabold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-lg border border-blue-200/60 dark:border-blue-800/60"></span>
                                </div>
                                <div class="flex items-center justify-between text-xs">
                                    <span class="text-slate-500 dark:text-slate-400 font-medium">${isML ? 'പരീക്ഷാ തീയതി' : 'Target Date'}</span>
                                    <span id="summary-date-badge" class="font-bold text-slate-700 dark:text-slate-200"></span>
                                </div>
                                <div class="flex items-center justify-between text-xs">
                                    <span class="text-slate-500 dark:text-slate-400 font-medium">${isML ? 'പൂർത്തിയാക്കിയവ' : 'Completed Chapters'}</span>
                                    <div class="flex items-center gap-2">
                                        <span id="summary-completed-badge" class="font-bold text-emerald-600 dark:text-emerald-400"></span>
                                        <button type="button" onclick="goToSetupStep(3)" class="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-bold">${isML ? 'മാറ്റുക' : 'Edit'}</button>
                                    </div>
                                </div>
                            </div>

                            <!-- Primary Start Button -->
                            <button type="button" onclick="handleInitialSetup()" class="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-black py-4 px-6 rounded-2xl shadow-xl shadow-blue-500/25 transform active:scale-[0.98] transition flex items-center justify-center gap-2.5 text-base sm:text-lg">
                                <span>${isML ? '🚀 പ്ലാൻ തയ്യാറാക്കൂ (Day 1 ആരംഭിക്കാം)' : '🚀 Start Day 1'}</span>
                                <i class="fa-solid fa-rocket"></i>
                            </button>

                            <!-- Customize Study Hours & Routine Accordion -->
                            <details id="setup-advanced-accordion" class="group bg-slate-50 dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 transition-all text-left">
                                <summary class="cursor-pointer font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-200 flex items-center justify-between select-none list-none">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm shrink-0">
                                            <i class="fa-solid fa-sliders"></i>
                                        </div>
                                        <div>
                                            <span class="block font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                                                ${isML ? 'പഠന സമയവും രീതിയും ക്രമീകരിക്കുക' : 'More plan options'}
                                            </span>
                                            <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                                ${isML ? 'ദിവസേനയുള്ള പഠന സമയം, വിശ്രമ ദിനം, സിലബസ് വ്യാപ്തി' : 'Weekly rhythm, rest day and syllabus scope'}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-lg border border-blue-200/50 dark:border-blue-800/50 hidden sm:inline-block">
                                            ${isML ? 'ക്രമീകരിക്കുക' : 'Customize'}
                                        </span>
                                        <i class="fa-solid fa-chevron-down text-xs text-slate-400 group-open:rotate-180 transition-transform"></i>
                                    </div>
                                </summary>

                                <div class="mt-4 pt-4 border-t border-slate-200/80 dark:border-slate-700/80 space-y-5 text-left">
                                    <!-- A. Target Term Scope (for +2 streams) -->
                                    ${selectedStream !== 'imp_only' ? `
                                        <div>
                                            <span class="text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider block mb-2">
                                                ${isML ? 'സിലബസ് വ്യാപ്തി' : 'Syllabus Portion Scope'}
                                            </span>
                                            <div class="grid grid-cols-1 gap-2.5">
                                                <!-- Card 2: Term 1 & 2 -->
                                                <div id="term-card-2" onclick="setTermSelection(2)" class="cursor-pointer p-3.5 rounded-2xl border-2 border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20 transition text-left flex items-start justify-between gap-3 shadow-xs">
                                                    <div>
                                                        <span class="text-xs font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-0.5">${isML ? ML_I18N.setup.term2Badge : 'Terms 1 & 2'}</span>
                                                        <h4 class="font-black text-slate-900 dark:text-white text-sm">${isML ? ML_I18N.setup.term2Title : 'Term 1 & Term 2 Portions'}</h4>
                                                        <p id="term-desc-2" class="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-medium">
                                                            ${selectedStream === 'bio' ? 'Christmas exam syllabus (~35 chapters).' : 'Christmas exam syllabus (~31 chapters).'}
                                                        </p>
                                                    </div>
                                                    <span class="w-5 h-5 rounded-full bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center text-xs check-indicator shrink-0 mt-0.5">
                                                        <i class="fa-solid fa-check"></i>
                                                    </span>
                                                </div>

                                                <!-- Card 3: Full Year -->
                                                <div id="term-card-3" onclick="setTermSelection(3)" class="cursor-pointer p-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0e1526] hover:border-slate-300 dark:hover:border-slate-600 transition text-left flex items-start justify-between gap-3">
                                                    <div>
                                                        <span class="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block mb-0.5">${isML ? ML_I18N.setup.term3Badge : 'Full Year'}</span>
                                                        <h4 class="font-black text-slate-900 dark:text-white text-sm">${isML ? ML_I18N.setup.term3Title : 'Complete Public Exam Syllabus'}</h4>
                                                        <p id="term-desc-3" class="text-xs text-slate-500 dark:text-slate-300 mt-0.5 font-medium">
                                                            ${selectedStream === 'bio' ? 'All 49 chapters for March Board Exams.' : 'All 46 chapters for March Board Exams.'}
                                                        </p>
                                                    </div>
                                                    <span class="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-xs check-indicator shrink-0 mt-0.5"></span>
                                                </div>

                                                <!-- Card 1: Term 1 Only -->
                                                <div id="term-card-1" onclick="setTermSelection(1)" class="cursor-pointer p-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0e1526] hover:border-slate-300 dark:hover:border-slate-600 transition text-left flex items-start justify-between gap-3">
                                                    <div>
                                                        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-0.5">${isML ? ML_I18N.setup.term1Badge : 'First Terminal'}</span>
                                                        <h4 class="font-black text-slate-900 dark:text-white text-sm">${isML ? ML_I18N.setup.term1Title : 'Term 1 Only'}</h4>
                                                        <p id="term-desc-1" class="text-xs text-slate-500 dark:text-slate-300 mt-0.5 font-medium">
                                                            ${selectedStream === 'bio' ? 'Onam exam portion (~18 chapters).' : 'Onam exam portion (~17 chapters).'}
                                                        </p>
                                                    </div>
                                                    <span class="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-xs check-indicator shrink-0 mt-0.5"></span>
                                                </div>
                                            </div>
                                        </div>


                                    ` : ''}

                                    <!-- C. Weekly Rhythm & Hours -->
                                    <div class="pt-3 border-t border-slate-200/80 dark:border-slate-700/80 space-y-3">
                                        <span class="text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider block">
                                            ${isML ? ML_I18N.setup.rhythmTitle : 'Weekly Study Rhythm & Rest Day'}
                                        </span>
                                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            <div id="rhythm-card-balanced" onclick="setWeeklyRhythmSelection('balanced')" class="cursor-pointer p-2.5 rounded-xl border-2 border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-left">
                                                <span class="font-bold text-slate-900 dark:text-white text-xs block">${isML ? ML_I18N.setup.rhythmBalancedTitle : 'Daily Balanced'}</span>
                                                <p class="text-[11px] text-slate-500 dark:text-slate-300">${isML ? ML_I18N.setup.rhythmBalancedDesc : 'Even daily pacing'}</p>
                                            </div>
                                            <div id="rhythm-card-weekend" onclick="setWeeklyRhythmSelection('weekend_booster')" class="cursor-pointer p-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0e1526] text-left">
                                                <span class="font-bold text-slate-900 dark:text-white text-xs block">${isML ? ML_I18N.setup.rhythmWeekendTitle : 'Weekend Booster'}</span>
                                                <p class="text-[11px] text-slate-500 dark:text-slate-300">${isML ? ML_I18N.setup.rhythmWeekendDesc : 'Power study on Sat/Sun'}</p>
                                            </div>
                                            <div id="rhythm-card-sunday" onclick="setWeeklyRhythmSelection('rest_day', 0)" class="cursor-pointer p-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0e1526] text-left">
                                                <span class="font-bold text-slate-900 dark:text-white text-xs block">${isML ? ML_I18N.setup.rhythmSundayTitle : 'Sunday Rest'}</span>
                                                <p class="text-[11px] text-slate-500 dark:text-slate-300">${isML ? ML_I18N.setup.rhythmSundayDesc : 'Zero new tasks on Sun'}</p>
                                            </div>
                                        </div>

                                        <!-- Intensity -->
                                        <div class="flex items-center justify-between gap-2 pt-1">
                                            <label for="study-intensity" class="text-xs font-bold text-slate-700 dark:text-slate-200">${isML ? ML_I18N.setup.intensityLabel : 'Daily Study Pacing'}</label>
                                            <select id="study-intensity" class="text-xs font-bold bg-white dark:bg-[#101726] border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1 text-slate-800 dark:text-white outline-none">
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
                const todayTasksHTML = tasks.length ? `
                    ${appState.diagnostics?.isInfeasible ? `<p class="daily-advisory">${escapeStudyText(appState.diagnostics.warningMessage || (isML ? 'പഠന സമയം അല്ലെങ്കിൽ അവസാന തീയതി ക്രമീകരിക്കുക.' : 'This plan needs more study time. Adjust your hours or target date.'))}</p>` : ''}
                    ${todayPlan.isExamEve ? `<p class="daily-advisory">${isML ? 'നാളത്തെ പരീക്ഷ' : 'Exam tomorrow'}: ${escapeStudyText(todayPlan.exclusiveSubject)}</p>` : ''}
                    ${completedCount === tasks.length ? `<div class="daily-finished" role="status"><strong>${isML ? 'ഇന്നത്തെ പഠനം പൂർത്തിയായി' : 'Today is complete'}</strong><p>${isML ? 'നാളത്തെ പ്ലാനും മുൻ ദിവസങ്ങളിലെ ബാക്കിയും താഴെയുണ്ട്.' : 'Tomorrow’s plan and any earlier pending work are below.'}</p></div>` : ''}
                    <ol class="daily-tasks" aria-label="${isML ? 'ഇന്നത്തെ പഠനം' : 'Today’s timetable'}">
                        ${orderedTasks.map(task => {
                            const key = encodeURIComponent(String(task.id));
                            return `<li class="daily-task ${task.completed ? 'is-complete' : ''}">
                                <div class="daily-task-content">
                                    <div class="daily-task-meta"><span>${escapeStudyText(task.subject)}</span>${task.estimatedMinutes ? `<span>${escapeStudyText(task.estimatedMinutes)} min</span>` : ''}${task.completed ? `<span class="daily-done-label">${isML ? 'പൂർത്തിയായി' : 'Completed'}</span>` : ''}</div>
                                    <h3 id="task-${key}">${escapeStudyText(getTaskChapterTitle(task))}</h3>
                                    <p class="daily-topic">${escapeStudyText(formatTaskTopicTitle(task))}</p>
                                    <details id="resources-${key}" class="daily-resources" ${openSections.has('resources-' + key) ? 'open' : ''}>
                                        <summary>${isML ? 'പഠന സഹായികൾ' : 'Study resources'}</summary>
                                        <div>${getTaskDeepLinksHtml(task)}<button type="button" data-study-tutor="${escapeStudyText(task.id)}">${isML ? 'AI പഠന സഹായി' : 'AI study tutor'}</button></div>
                                    </details>
                                </div>
                                <button type="button" class="daily-toggle" data-study-task="${escapeStudyText(task.id)}" aria-pressed="${!!task.completed}" aria-describedby="task-${key}">${task.completed ? (isML ? 'തിരിച്ചെടുക്കുക' : 'Undo') : (isML ? 'പൂർത്തിയായി' : 'Mark done')}</button>
                            </li>`;
                        }).join('')}
                    </ol>
                ` : `<div class="daily-empty"><h3>${isML ? 'ഇന്നത്തേക്ക് പഠന ഭാഗങ്ങളില്ല' : 'No tasks scheduled today'}</h3><p>${todayPlan ? (isML ? 'ഇന്ന് വിശ്രമിക്കാം. നാളത്തെ പ്ലാൻ താഴെ കാണാം.' : 'Take a rest day. Tomorrow’s timetable is below.') : (isML ? 'മുഴുവൻ പ്ലാനിൽ നിങ്ങളുടെ പഠന തീയതികൾ കാണാം.' : 'Check Full Plan for your scheduled dates. Earlier unfinished work stays under Pending.')}</p><button type="button" onclick="goToPlan()">${isML ? 'മുഴുവൻ പ്ലാൻ' : 'View full plan'}</button></div>`;

                container.innerHTML = `
                    <section id="today-overview" class="study-overview" aria-labelledby="today-heading">
                        <div>
                            <h2 id="today-heading">${isML ? 'ഇന്നത്തെ പഠനം' : "Today's study"}</h2>
                            <p>${todayPlan ? todayPlan.tasks.filter(t => t.completed).length : 0} / ${todayPlan ? todayPlan.tasks.length : 0} ${isML ? 'പൂർത്തിയായി' : 'tasks complete'}</p>
                        </div>
                        <button type="button" onclick="openRegenerateModal()" class="study-adjust">${isML ? 'പ്ലാൻ ക്രമീകരിക്കുക' : 'Adjust plan'}</button>
                    </section>

                    <p class="study-date">${localToday}</p>
                    ${daily.overdueCount ? `<p class="pending-notice" role="status">${daily.overdueCount} ${isML ? 'മുൻ ദിവസങ്ങളിൽ ബാക്കിയുണ്ട്.' : 'unfinished from previous days.'} <a href="#pending-work">${isML ? 'കാണുക' : 'View pending'}</a></p>` : ''}
                    ${yesterdayPlan?.tasks.length ? `<p class="study-history">${isML ? 'ഇന്നലെ' : 'Yesterday'}: ${yesterdayPlan.tasks.filter(task => task.completed).length} / ${yesterdayPlan.tasks.length} ${isML ? 'പൂർത്തിയായി' : 'completed'}</p>` : ''}

                    <!-- Main Section: Today's Targets -->
                    <div id="today-tasks" class="daily-board">
                        ${todayTasksHTML}
                    </div>

                    ${daily.overdueCount ? `
                        <details id="pending-work" class="study-pending" ${openSections.has('pending-work') ? 'open' : ''}>
                            <summary>${isML ? 'മുൻ ദിവസങ്ങളിലെ ബാക്കി പഠനം' : 'Pending from previous days'} (${daily.overdueCount})</summary>
                            ${daily.overdueDays.map(day => `
                                <section class="pending-day">
                                    <h3>${day.date === daily.yesterdayDate ? (isML ? 'ഇന്നലെ' : 'Yesterday') : escapeStudyText(day.date)} · ${day.tasks.length} ${isML ? 'ബാക്കി' : 'pending'}</h3>
                                    ${day.tasks.map(task => `
                                        <div class="pending-task">
                                            <div><strong>${escapeStudyText(task.subject)}</strong><p>${escapeStudyText(getTaskChapterTitle(task))}</p><small>${escapeStudyText(formatTaskTopicTitle(task))}</small></div>
                                            <button type="button" data-pending-task="${escapeStudyText(task.id)}">${isML ? 'പൂർത്തിയായി' : 'Mark done'}</button>
                                        </div>
                                    `).join('')}
                                </section>
                            `).join('')}
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
                            <button onclick="printSchedule()" class="flex items-center gap-1.5 bg-white dark:bg-[#101726] hover:bg-slate-50 dark:hover:bg-[#141d30] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xs py-2 px-3 sm:px-3.5 rounded-xl shadow-sm transition active:scale-95" title="Print full schedule or save as PDF">
                                <i class="fa-solid fa-print text-blue-600 dark:text-blue-400"></i>
                                <span>${isML ? ML_I18N.dashboard.printSchedule : 'Print / PDF'}</span>
                            </button>
                            <button onclick="openRegenerateModal()" class="flex items-center gap-1.5 bg-white dark:bg-[#101726] hover:bg-slate-50 dark:hover:bg-[#141d30] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs py-2 px-3 rounded-xl shadow-sm transition active:scale-95" title="Recalculate schedule if you missed days">
                                <i class="fa-solid fa-wrench text-slate-500 dark:text-slate-400"></i>
                                <span>${isML ? ML_I18N.dashboard.adjustPlan : 'Adjust Plan'}</span>
                            </button>
                        </div>
                        <button onclick="shareApp()" class="flex items-center gap-1.5 bg-white dark:bg-[#101726] hover:bg-slate-50 dark:hover:bg-[#141d30] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs py-2 px-3 rounded-xl shadow-sm transition active:scale-95">
                            <i class="fa-solid fa-arrow-up-from-bracket text-slate-500 dark:text-slate-400"></i>
                            <span>${isML ? ML_I18N.dashboard.share : 'Share'}</span>
                        </button>
                    </div>
                        <!-- Clean Bottom Controls -->
                    <div class="study-tool-recovery border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 no-print">
                        <button onclick="openRegenerateModal()" class="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-medium transition flex items-center gap-1.5">
                            <i class="fa-solid fa-rotate text-xs"></i>
                            <span>${isML ? ML_I18N.dashboard.fellBehind : 'Fell behind? Recalculate remaining portions'}</span>
                        </button>
                        <button onclick="resetApp()" class="text-slate-400 hover:text-red-600 transition underline">
                            ${isML ? ML_I18N.dashboard.resetPlan : 'Reset Plan'}
                        </button>
                    </div>
                    </details>
                `;

                container.querySelectorAll('[data-pending-task]').forEach(button => {
                    button.addEventListener('click', () => toggleTaskDirect(button.dataset.pendingTask));
                });
                container.querySelectorAll('[data-study-task]').forEach(button => {
                    button.addEventListener('click', () => toggleTaskDirect(button.dataset.studyTask));
                });
                container.querySelectorAll('[data-study-tutor]').forEach(button => {
                    button.addEventListener('click', () => openAiTutorModal(button.dataset.studyTutor));
                });
                return;
            }

            // View 2: Detailed Full Plan View (With subject filters & printable PDF export)
            if (currentView === 'plan') {
                let planDaysHTML = '';

                appState.plan.forEach(day => {
                    const isToday = (day.date === TODAY_STR);

                    let displayedTasks = day.tasks;
                    if (currentPlanSubjectFilter === '+1 Improvement') {
                        displayedTasks = day.tasks.filter(t => t.grade === '+1');
                    } else if (currentPlanSubjectFilter === '+2 Regular') {
                        displayedTasks = day.tasks.filter(t => t.grade === '+2');
                    } else if (currentPlanSubjectFilter !== 'All') {
                        displayedTasks = day.tasks.filter(t => t.subject === currentPlanSubjectFilter);
                    }

                    // If a specific subject is filtered and this day has none, don't clutter the view
                    if (currentPlanSubjectFilter !== 'All' && displayedTasks.length === 0) {
                        return;
                    }

                    planDaysHTML += `
                        <div class="bg-white rounded-2xl border ${isToday ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'} shadow-sm overflow-hidden mb-4 transition-all print-avoid-break">
                            <div class="p-3.5 sm:p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <span class="text-xs font-extrabold text-slate-900">${isML ? `${ML_I18N.plan.day} ${day.dayNumber}` : `Day ${day.dayNumber}`}</span>
                                    <span class="text-xs font-semibold text-slate-400">(${day.date})</span>
                                    ${isToday ? `<span class="text-xs font-extrabold bg-blue-600 text-white px-2 py-0.5 rounded-full no-print">${isML ? ML_I18N.plan.todayBadge : 'TODAY'}</span>` : ''}
                                    ${day.isExamEve ? `<span class="text-xs font-black bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-700 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse"><i class="fa-solid fa-bolt text-rose-600 dark:text-rose-400"></i>${isML ? `പരീക്ഷത്തലേന്ന്: ${day.exclusiveSubject}` : `🔥 Exam Eve: ${day.exclusiveSubject} Only`}</span>` : ''}
                                    ${day.isExamDay ? `<span class="text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1"><i class="fa-solid fa-graduation-cap text-amber-600 dark:text-amber-400"></i>${isML ? `പരീക്ഷാദിനം: ${day.examSubject}` : `🎯 Exam Day: ${day.examSubject}`}</span>` : ''}
                                    ${day.isRevisionDay ? `<span class="text-xs font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">${isML ? ML_I18N.plan.revisionDay : 'Revision Day'}</span>` : ''}
                                    ${day.isRestDay ? `<span class="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full"><i class="fa-solid fa-mug-hot mr-1"></i>${isML ? ML_I18N.plan.restDay : 'Rest Day'}</span>` : ''}
                                </div>
                                <span class="text-xs font-bold text-slate-500">${displayedTasks.filter(t => t.completed).length}/${displayedTasks.length} ${isML ? ML_I18N.plan.done : 'Done'}</span>
                            </div>

                            <div class="p-3 sm:p-4 divide-y divide-slate-100">
                                ${displayedTasks.length === 0 ? (day.isRestDay ? `<p class="text-xs text-emerald-700 font-semibold py-1.5 flex items-center gap-2"><i class="fa-solid fa-mug-hot text-emerald-600"></i><span>${isML ? ML_I18N.plan.restDayNotice : 'Personalized Rest & Recharge Day (0 new chapters)'}</span></p>` : `<p class="text-xs text-slate-400 italic py-1">${isML ? 'ഫ്രീ / ബഫർ ദിനം' : 'Free / Buffer Day'}</p>`) : ''}
                                ${displayedTasks.map((task, taskIdx) => {
                                    const badgeColor = getSubjectColorBadge(task.subject);
                                    return `
                                        <div class="task-item-container py-2.5 first:pt-0 last:pb-0 flex items-start gap-3">
                                            <!-- Working Clickable Checkbox in Full Plan -->
                                            <div class="task-checkbox ${task.completed ? 'checked' : ''} mt-0.5" data-task-id="${task.id}" onclick="toggleTaskDirect('${task.id}')">
                                                <svg class="svg-check" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                            </div>
                                            <div class="flex-1 cursor-pointer" onclick="toggleTaskDirect('${task.id}')">
                                                <div class="flex flex-wrap items-center gap-1.5 mb-1">
                                                    <span class="text-xs font-bold px-1.5 py-0.5 rounded ${badgeColor}">${task.subject}</span>
                                                    ${renderTaskDailySlotBadge(taskIdx, displayedTasks.length, isML)}
                                                    ${task.isFocusSubject ? '<span class="text-xs font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">🎯 FOCUS</span>' : ''}
                                                    ${renderTaskGradeBadge(task)}
                                                    ${renderTaskPartBadge(task)}
                                                    ${getTaskResourceBadge(task)}
                                                </div>
                                                <div class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 task-text-content ${task.completed ? 'line-through opacity-50' : ''}">
                                                    ${getTaskChapterTitle(task)} - <span class="font-normal text-slate-500 dark:text-slate-400">${formatTaskTopicTitle(task)}</span>
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
                        <div class="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400">
                            <i class="fa-solid fa-filter text-2xl mb-2 text-slate-300"></i>
                            <p class="text-xs font-semibold">${isML ? ML_I18N.plan.noTasks : `No scheduled tasks found under "${currentPlanSubjectFilter}".`}</p>
                            <button onclick="setPlanSubjectFilter('All')" class="mt-3 text-xs font-bold text-blue-600 hover:underline">${isML ? ML_I18N.plan.showAll : 'Show All Subjects'}</button>
                        </div>
                    `;
                }

                container.innerHTML = `
                    <!-- Print-Only Page Header -->
                    <div class="print-only mb-6 border-b-2 border-slate-900 pb-3">
                        <div class="flex justify-between items-start">
                            <div>
                                <h1 class="text-2xl font-black text-slate-900 tracking-tight">Mission PlusTwo — Daily Study Schedule</h1>
                                <p class="text-xs text-slate-600 font-semibold mt-0.5">Kerala DHSE Class 12 (+2) & +1 Improvement Scheme of Work</p>
                            </div>
                            <div class="text-right text-xs">
                                <span class="font-bold text-slate-900 block">Deadline: ${new Date(appState.deadlineDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}</span>
                                <span class="text-slate-500">Generated: ${new Date().toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Screen Header -->
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 no-print">
                        <div>
                            <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900">${isML ? ML_I18N.plan.title : 'Complete Study Schedule'}</h2>
                            <p class="text-xs text-slate-500">${isML ? ML_I18N.plan.subtitle : 'Every single day planned out until your deadline.'}</p>
                        </div>
                        <div class="flex items-center flex-wrap gap-2">
                            <button onclick="exportTimetableIcs()" class="text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-xl text-slate-700 transition flex items-center gap-1.5 shadow-sm active:scale-95" title="Export to Google Calendar, Apple Calendar, or Outlook (.ics)">
                                <i class="fa-regular fa-calendar-plus text-amber-500"></i>
                                <span class="hidden sm:inline">${isML ? 'കലണ്ടർ (.ics)' : 'Add to Calendar'}</span>
                            </button>
                            <button onclick="exportTimetableCsv()" class="text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-xl text-slate-700 transition flex items-center gap-1.5 shadow-sm active:scale-95" title="Export as CSV spreadsheet">
                                <i class="fa-solid fa-file-csv text-emerald-600"></i>
                                <span class="hidden sm:inline">Export CSV</span>
                            </button>
                            <button onclick="shareApp()" class="text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-xl text-slate-700 transition flex items-center gap-1.5 shadow-sm active:scale-95" title="Share plan with friends">
                                <i class="fa-solid fa-arrow-up-from-bracket text-indigo-600"></i>
                                <span class="hidden sm:inline">Share</span>
                            </button>
                            <button onclick="printTimetable()" class="text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 px-3 sm:px-3.5 py-2 rounded-xl text-slate-700 transition flex items-center gap-1.5 shadow-sm active:scale-95" title="Print schedule or save as PDF">
                                <i class="fa-solid fa-print text-blue-600"></i>
                                <span>${isML ? ML_I18N.plan.printPdf : 'Print / Save PDF'}</span>
                            </button>
                            <button onclick="goToDashboard()" class="text-xs font-bold bg-blue-600 hover:bg-blue-700 px-3.5 py-2 rounded-xl text-white transition flex items-center gap-1.5 shadow-sm active:scale-95">
                                <i class="fa-solid fa-arrow-left"></i>
                                <span>${isML ? ML_I18N.plan.backToToday : 'Back to Today'}</span>
                            </button>
                        </div>
                    </div>

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
                            const activeSubs = userStream === 'imp_only'
                                ? Array.from(new Set((appState?.plan || []).flatMap(d => (d.tasks || []).map(t => t.subject))))
                                : streamSubs;

                            const hasImprovementTasks = appState?.improvementConfig && appState.improvementConfig.length > 0;
                            const filters = [
                                { id: 'All', label: isML ? ML_I18N.plan.allSubjects : 'All Subjects', icon: 'fa-layer-group' },
                                ...activeSubs.map(s => ({
                                    id: s,
                                    label: s === 'Mathematics' ? 'Maths' : s === 'Computer Science' ? 'CS' : s === 'Business Studies' ? 'Business' : s === 'Computer Applications' ? 'CA' : s === 'Political Science' ? 'Pol Science' : s,
                                    icon: subjectIcons[s] || 'fa-book'
                                })),
                                ...(hasImprovementTasks ? [
                                    { id: '+2 Regular', label: '+2 Regular', icon: 'fa-graduation-cap' },
                                    { id: '+1 Improvement', label: '+1 Improvement', icon: 'fa-arrow-up-right-dots' }
                                ] : [])
                            ];

                            return filters.map(f => {
                                const isActive = (currentPlanSubjectFilter === f.id);
                                return `
                                    <button onclick="setPlanSubjectFilter('${f.id}')" class="py-1.5 px-3 rounded-xl font-bold transition-all shrink-0 flex items-center gap-1.5 ${isActive ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}">
                                        <i class="fa-solid ${f.icon} text-xs"></i>
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
                    <div class="print-only mt-8 pt-4 border-t-2 border-slate-900 text-xs text-slate-800">
                        <div class="flex items-center justify-between gap-6">
                            <div>
                                <p class="font-black text-slate-900 text-sm">Mission PlusTwo — Free Daily Study Planner</p>
                                <p class="text-xs text-slate-600 mt-0.5">Kerala DHSE Class 12 (+2) & +1 Improvement • Verified SCERT Scheme of Work</p>
                                <p class="text-[11px] text-slate-500 mt-1">Scan the QR code to load or rebalance this timetable on any phone: <strong>https://mission-plustwo.web.app/</strong></p>
                            </div>
                            <div id="printQrCodeContainer" class="shrink-0 w-20 h-20 flex items-center justify-center border border-slate-300 rounded-lg p-1 bg-white"></div>
                        </div>
                    </div>

                    <!-- Subtle Bottom Rebalance -->
                    <div class="mt-8 pt-4 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 no-print">
                        <button onclick="openRegenerateModal()" class="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition flex items-center gap-1.5">
                            <i class="fa-solid fa-wrench"></i> ${isML ? ML_I18N.plan.adjustSchedule : 'Adjust Schedule'}
                        </button>
                        <button onclick="resetApp()" class="text-slate-400 hover:text-red-600 underline">${isML ? ML_I18N.plan.resetPlan : 'Reset Plan'}</button>
                    </div>
                `;

                const targetStream = appState?.stream || 'cs';
                const qrTarget = `https://mission-plustwo.web.app/?stream=${encodeURIComponent(targetStream)}`;
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

            // View 3: Official Syllabus Reference & Completed Chapters Overview (Strictly Stream Isolated)
            if (currentView === 'syllabus') {
                const userStream = appState?.stream || (appState?.plan?.some(d => d.tasks.some(t => t.subject === 'Botany' || t.subject === 'Zoology')) ? 'bio' : 'cs');
                const subjects = userStream === 'imp_only'
                    ? Array.from(new Set((appState?.plan || []).flatMap(d => (d.tasks || []).map(t => t.subject))))
                    : getStreamSubjects(userStream);

                let syllabusHTML = '';
                subjects.forEach(sub => {
                    const p2Chaps = PLUS_TWO_SYLLABUS.filter(t => t.subject === sub);
                    const uniqueP2 = [...new Map(p2Chaps.map(item => [item.chapId, item])).values()];
                    const subRes = CHAPTER_RESOURCES?.subjects?.[sub] || CHAPTER_RESOURCES?.[sub];
                    const subPyq = subRes?.pyqUrl || subRes?.pyq;

                    syllabusHTML += `
                        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-4">
                            <div class="border-b pb-2 mb-3">
                                <h3 class="text-sm sm:text-base font-extrabold text-slate-900 mb-2 flex items-center justify-between">
                                    <span>${sub} <span class="text-xs text-slate-400 font-normal">(${uniqueP2.length} ${isML ? ML_I18N.syllabus.chaptersCount : 'Official Chapters'})</span></span>
                                    <span class="text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-200/60 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60 px-2.5 py-0.5 rounded-lg"><i class="fa-solid fa-graduation-cap mr-1"></i> ${isML ? ML_I18N.syllabus.plusTwoDhse : 'Plus Two (+2) DHSE'}</span>
                                </h3>
                                ${subRes && subPyq ? `
                                <div class="flex flex-wrap items-center gap-3 text-xs pt-1">
                                    <a href="${subPyq}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-purple-600 hover:underline font-semibold">${getSvgIcon('fileText', 'w-3.5 h-3.5')} PYQs</a>
                                </div>` : ''}
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                ${uniqueP2.map(ch => {
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

                                    return `
                                        <div class="p-2.5 rounded-xl border ${isAllDone ? 'bg-emerald-50/60 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800/60' : 'bg-slate-50/50 border-slate-100 dark:bg-slate-800/50 dark:border-slate-700/60'} flex items-start gap-2 text-xs">
                                            <div class="w-5 h-5 rounded-md ${isAllDone ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-400'} flex items-center justify-center shrink-0 mt-0.5 text-xs">
                                                <i class="fa-solid ${isAllDone ? 'fa-check' : 'fa-book'}"></i>
                                            </div>
                                            <div class="flex-1">
                                                <span class="font-bold text-slate-800 dark:text-slate-100 block">Chapter ${ch.chapNumber}: ${ch.chapterName.replace(/^Chapter\s+\d+:\s*/i, '').replace(/^\d+\.\s*/, '')}</span>
                                                <span class="text-xs text-slate-400">Term ${ch.term} ${isAllDone ? `• <strong class="text-emerald-700 dark:text-emerald-400">${isML ? ML_I18N.syllabus.mastered : 'Mastered'}</strong>` : ''}</span>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                });

                container.innerHTML = `
                    <div class="flex items-center justify-between mb-6">
                        <div>
                            <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900">${isML ? ML_I18N.syllabus.title : 'Official DHSE Scheme of Work'}</h2>
                            <p class="text-xs text-slate-500">${(function() {
                                if (isML) {
                                    if (userStream === 'bio') return ML_I18N.syllabus.subtitleBio;
                                    if (userStream === 'commerce') return ML_I18N.syllabus.subtitleCommerce;
                                    if (userStream === 'humanities') return ML_I18N.syllabus.subtitleHumanities;
                                    return ML_I18N.syllabus.subtitleCs;
                                }
                                if (userStream === 'bio') return 'Biology Science Stream (Botany & Zoology) • Rationalized Kerala Higher Secondary curriculum.';
                                if (userStream === 'commerce') return 'Commerce Stream (Accountancy, Business Studies, Economics, Computer Applications) • Rationalized Kerala Higher Secondary curriculum.';
                                if (userStream === 'humanities') return 'Humanities Stream (History, Political Science, Sociology, Economics) • Rationalized Kerala Higher Secondary curriculum.';
                                return 'Computer Science Stream • Rationalized Kerala Higher Secondary curriculum.';
                            })()}</p>
                        </div>
                        <button onclick="goToDashboard()" class="text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 px-3.5 py-2 rounded-xl text-slate-700 transition">
                            <i class="fa-solid fa-arrow-left mr-1"></i> ${isML ? ML_I18N.syllabus.backToToday : 'Back to Today'}
                        </button>
                    </div>

                    <div class="space-y-4">
                        ${syllabusHTML}
                    </div>
                `;
                return;
            }
        }

        function getSubjectColorBadge(subject) {
            switch(subject) {
                case 'Physics': return 'bg-indigo-50 text-indigo-700 border border-indigo-200/60 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/60';
                case 'Chemistry': return 'bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60';
                case 'Mathematics': return 'bg-rose-50 text-rose-700 border border-rose-200/60 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60';
                case 'Computer Science': return 'bg-cyan-50 text-cyan-700 border border-cyan-200/60 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800/60';
                case 'Botany': return 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60';
                case 'Zoology': return 'bg-teal-50 text-teal-700 border border-teal-200/60 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/60';
                case 'Accountancy': return 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60';
                case 'Business Studies': return 'bg-blue-50 text-blue-700 border border-blue-200/60 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60';
                case 'Economics': return 'bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60';
                case 'Computer Applications': return 'bg-cyan-50 text-cyan-700 border border-cyan-200/60 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800/60';
                case 'History': return 'bg-stone-50 text-stone-700 border border-stone-200/60 dark:bg-stone-950/60 dark:text-stone-300 dark:border-stone-800/60';
                case 'Political Science': return 'bg-violet-50 text-violet-700 border border-violet-200/60 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800/60';
                case 'Sociology': return 'bg-pink-50 text-pink-700 border border-pink-200/60 dark:bg-pink-950/60 dark:text-pink-300 dark:border-pink-800/60';
                default: return 'bg-purple-50 text-purple-700 border border-purple-200/60 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60';
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
                return `<span class="text-xs font-black px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-700 flex items-center gap-1 shadow-xs animate-pulse"><i class="fa-solid fa-bolt text-rose-600 dark:text-rose-400"></i> 🔥 Exam Eve Focus</span>`;
            }
            if (task.isForgettingCurveReview || task.isSpacedRetrieval) {
                const isML = (typeof getAppLanguage === 'function' && getAppLanguage() === 'ml') ||
                             (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang === 'ml');
                const intervalText = task.spacingInterval ? `Spaced Recall (${task.spacingInterval})` : 'Active Recall & PYQ';
                const mlIntervalText = task.spacingInterval ? `സ്പേസ്ഡ് റീകോൾ (${task.spacingInterval})` : 'സ്പേസ്ഡ് റീകോൾ & PYQ';
                return `<span class="text-xs font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-200 dark:border-indigo-700 flex items-center gap-1 shadow-xs" title="Ebbinghaus Forgetting Curve Spaced Retrieval"><i class="fa-solid fa-brain text-indigo-600 dark:text-indigo-400"></i> 🧠 ${isML ? mlIntervalText : intervalText}</span>`;
            }
            if (task.isModelExam) {
                return `<span class="text-xs font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700 flex items-center gap-1 shadow-xs"><i class="fa-solid fa-file-pen text-amber-600 dark:text-amber-400"></i> 📝 Model Exam</span>`;
            }
            if (task.isRevision) {
                return `<span class="text-xs font-bold px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200/70 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60">Revision</span>`;
            }
            if (task.grade === '+1') {
                return `<span class="text-xs font-extrabold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700/60 flex items-center gap-1 shadow-xs"><i class="fa-solid fa-fire text-amber-600 dark:text-amber-400"></i> +1 Imp (High Priority)</span>`;
            }
            // Plus Two (+2)
            return `
                <span class="text-xs font-extrabold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-300/80 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700/60 flex items-center gap-1 shadow-xs"><i class="fa-solid fa-graduation-cap text-xs text-blue-600"></i> +2</span>
                ${task.term ? `<span class="text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50">Term ${task.term}</span>` : ''}
            `;
        }

        function renderTaskPartBadge(task) {
            if (!task || task.isRevision || task.isExamEveTask || task.isModelExam || task.isSpacedRetrieval || task.isForgettingCurveReview) return '';
            const p = task.part || 1;
            const total = task.totalParts || 1;
            // Tight timetable: all parts land on same day — show "Full" instead of confusing "1/2" + "2/2"
            if (task.isFullOnDay) {
                return `<span class="text-xs font-black px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700/60 flex items-center gap-1 shadow-xs"><i class="fa-solid fa-circle-check text-xs text-emerald-600 dark:text-emerald-400"></i> Full</span>`;
            }
            if (p === total) {
                return `<span class="text-xs font-black px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700/60 flex items-center gap-1 shadow-xs"><i class="fa-solid fa-circle-check text-xs text-emerald-600"></i> Full Chapter (${p}/${total})</span>`;
            }
            return `<span class="text-xs font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">Part ${p}/${total}</span>`;
        }

        function renderTaskDailySlotBadge(slotIndex, totalTasks, isML) {
            if (!totalTasks || totalTasks <= 0) return '';
            return `<span class="text-xs text-slate-500 dark:text-slate-400">${isML ? 'പഠന ഭാഗം' : 'Study block'} ${slotIndex + 1} / ${totalTasks}</span>`;
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
            getOverallStats();
            // In case there are quick summary elements
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
                if (metaTheme) metaTheme.setAttribute('content', isDark ? '#080c14' : '#2563eb');
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
                        btn.className = 'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all bg-blue-600 text-white shadow-xs';
                    } else {
                        btn.className = 'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';
                    }
                }
                // Dropdown menu buttons
                const menuBtn = document.getElementById(`menu-theme-btn-${m}`);
                if (menuBtn) {
                    if (m === pref) {
                        menuBtn.className = 'py-1.5 px-2 rounded-lg text-center font-black text-xs transition-all flex items-center justify-center gap-1 bg-blue-600 text-white shadow-xs';
                    } else {
                        menuBtn.className = 'py-1.5 px-2 rounded-lg text-center font-bold text-xs transition-all flex items-center justify-center gap-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';
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
                    btnEn.className = 'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all bg-blue-600 text-white shadow-xs';
                } else {
                    btnEn.className = 'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';
                }
            }
            if (btnMl) {
                if (isML) {
                    btnMl.className = 'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all bg-blue-600 text-white shadow-xs';
                } else {
                    btnMl.className = 'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';
                }
            }
            if (langBadge) {
                langBadge.textContent = isML ? 'മലയാളം' : 'English';
                langBadge.className = isML
                    ? 'text-xs bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full'
                    : 'text-xs bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full uppercase';
            }

            // 2. Safe check for any legacy button
            const flag = document.getElementById('lang-btn-flag');
            const lbl = document.getElementById('lang-btn-label');
            const switchBtn = document.getElementById('lang-switch-btn');
            if (flag && lbl) {
                if (isML) {
                    flag.textContent = 'മല';
                    flag.className = 'text-xs font-black text-emerald-600 dark:text-emerald-400';
                    lbl.textContent = '| EN';
                } else {
                    flag.textContent = 'EN';
                    flag.className = 'text-xs font-black text-blue-600 dark:text-blue-400';
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
            setText('settings-modal-subtitle', isML ? ML_I18N.settingsModal.subtitle : 'Personalize your Mission PlusTwo workspace');
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
            setText('settings-done-btn', isML ? ML_I18N.settingsModal.doneBtn : 'Done');

            // 7. Regenerate Modal Localization
            setText('regenerate-modal-title', isML ? ML_I18N.regenerateModal.title : 'Adjust & Rebalance Plan');
            setText('regenerate-modal-subtitle', isML ? ML_I18N.regenerateModal.subtitle : "Missed some days or fell behind? Don't stress. Select the last day you fully finished, and our intelligent pacing algorithm will recalculate and redistribute only the remaining unfinished syllabus evenly across your available time.");
            setText('regenerate-completed-label', isML ? ML_I18N.regenerateModal.completedUpTo : 'I have completed up to:');
            setText('regenerate-revision-note', isML ? ML_I18N.regenerateModal.guaranteedRevision : 'Guaranteed Revision Days: Your target deadline will still maintain dedicated revision buffer days at the end!');
            setText('regenerate-cancel-btn', isML ? ML_I18N.regenerateModal.cancelBtn : 'Cancel');
            setText('regenerate-confirm-btn', isML ? ML_I18N.regenerateModal.rebalanceBtn : 'Rebalance Now');

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
                        toggle.classList.remove('bg-slate-300');
                        toggle.classList.add('bg-blue-600');
                        toggle.setAttribute('aria-checked', 'true');
                        knob.classList.remove('translate-x-0');
                        knob.classList.add('translate-x-5');
                    } else {
                        toggle.classList.remove('bg-blue-600');
                        toggle.classList.add('bg-slate-300');
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
                        btn.className = 'p-2 rounded-xl text-center border-2 border-blue-600 bg-blue-50/70 transition shadow-xs';
                    } else {
                        btn.className = 'p-2 rounded-xl text-center border border-slate-200 bg-white hover:border-slate-300 transition';
                    }
                }
            });

            const paceBadge = document.getElementById('settings-current-pace-badge');
            if (paceBadge) {
                const paceNames = { light: 'Relaxed', balanced: 'Standard', intense: 'Intensive' };
                paceBadge.textContent = paceNames[currentPace] || 'Standard';
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
                a.download = `mission-plustwo-backup-${dateStr}.json`;
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
                if (validPlan.engineVersion > PLANNER_ENGINE_VERSION) throw new TypeError('Newer backup version.');
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
                    message: restored ? 'The backup was saved, but the app could not refresh. Reload to reopen your saved plan.' : 'The backup could not be read, validated or saved. Use a valid Mission PlusTwo backup (up to 2 MB) from this app version or an older version. Check available device storage and try again.',
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
        window.addEventListener('beforeinstallprompt', (e) => {
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
                        showAppToast("Thank you for installing Mission PlusTwo!", "fa-circle-check text-emerald-400");
                        const installBtn = document.getElementById('pwa-install-btn');
                        if (installBtn) installBtn.classList.add('hidden');
                    }
                    deferredPWAInstallPrompt = null;
                });
            } else {
                // If browser already installed or iOS Safari
                showAppAlert({
                    title: "Install Mission PlusTwo App",
                    message: "• <strong>On Android / Chrome:</strong> Tap menu (⋮) ➔ 'Install App'<br>• <strong>On iPhone / Safari:</strong> Tap Share (📤) ➔ 'Add to Home Screen'<br>• <strong>On Brave / Edge:</strong> Click the install icon in the URL address bar.",
                    icon: "fa-download text-emerald-500"
                });
            }
        }

        // Register Service Worker for PWA
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').then((_reg) => {
                    // Service worker active
                }).catch((err) => {
                    console.log('SW registration note:', err);
                });
            });
        }

        // Initialize Theme, Language, Analytics & System Listener
        applyTheme();
        applyAppLanguage();
        initAppAnalytics();

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
        renderApp();
    

// Attach all controllers and API to window for inline HTML onclick handlers
if (typeof window !== 'undefined') {
    Object.assign(window, {
        appState,
        currentUser: typeof currentUser !== 'undefined' ? currentUser : null,
        loadInitialState,
        saveAppStateLocally,
        saveAppState,
        performCloudSync,
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
        setStreamSelection,
        updateTermCardsDescriptions,
        renderSetupSubjectTabs,
        setImprovementToggle,
        renderImprovementSubjectItems,
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
        updateDeadlinePreview,
        goToSetupStep,
        nextSetupStep,
        prevSetupStep,
        handleInitialSetup,
        openRegenerateModal,
        closeRegenerateModal,
        openSettingsModal,
        closeSettingsModal,
        executeRegeneration,
        changeMissionDay,
        shiftPlanToToday,
        shiftPlanToStartDate,
        renderApp,
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
}
