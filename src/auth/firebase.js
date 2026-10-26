/**
 * Lazy-Loaded Firebase Authentication & Cloud Firestore Synchronization
 * Eager compat scripts are eliminated from index.html.
 * Firebase is loaded strictly on demand when user clicks sign-in.
 */

export const firebaseConfig = {
  apiKey: "AIzaSyDPcQQkOABPaZAv1lc9-u4Xm5UvMcI0g1A",
  authDomain: "mission-plustwo.firebaseapp.com",
  projectId: "mission-plustwo",
  storageBucket: "mission-plustwo.firebasestorage.app",
  messagingSenderId: "376961059569",
  appId: "1:376961059569:web:4519080be63d1069a57750",
  measurementId: "G-12KPP3ZZ80"
};

let firebaseLoadedPromise = null;
let firebaseInitialized = false;
let authInstance = null;
let firestoreInstance = null;

export function loadFirebaseCompat() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.firebase && window.firebase.auth && window.firebase.firestore) {
    return Promise.resolve(window.firebase);
  }
  if (firebaseLoadedPromise) return firebaseLoadedPromise;

  firebaseLoadedPromise = new Promise((resolve, reject) => {
    const loadScript = (src) => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });

    loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
      .then(() => Promise.all([
        loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js'),
        loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js')
      ]))
      .then(() => {
        resolve(window.firebase);
      })
      .catch((err) => {
        console.error('Failed to load Firebase SDK:', err);
        firebaseLoadedPromise = null;
        reject(err);
      });
  });

  return firebaseLoadedPromise;
}

export async function getFirebaseAuth() {
  await loadFirebaseCompat();
  if (!firebaseInitialized && window.firebase) {
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      window.firebase.initializeApp(firebaseConfig);
    }
    authInstance = window.firebase.auth();
    firestoreInstance = window.firebase.firestore();
    firebaseInitialized = true;
  }
  return { auth: authInstance, db: firestoreInstance };
}

export async function signInUserWithGoogle() {
  const { auth } = await getFirebaseAuth();
  if (!auth) throw new Error('Firebase Auth not available');
  const provider = new window.firebase.auth.GoogleAuthProvider();
  return auth.signInWithPopup(provider);
}

export async function signOutUser() {
  const { auth } = await getFirebaseAuth();
  if (auth) {
    await auth.signOut();
  }
}

export async function syncPlanToCloud(userId, planData) {
  if (!userId || !planData) return;
  try {
    const { db } = await getFirebaseAuth();
    if (!db) return;
    await db.collection('user_plans').doc(userId).set({
      ...planData,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error('Error syncing plan to Firestore:', err);
  }
}

export async function loadPlanFromCloud(userId) {
  if (!userId) return null;
  try {
    const { db } = await getFirebaseAuth();
    if (!db) return null;
    const doc = await db.collection('user_plans').doc(userId).get();
    if (doc.exists) {
      return doc.data();
    }
  } catch (err) {
    console.error('Error loading plan from Firestore:', err);
  }
  return null;
}
