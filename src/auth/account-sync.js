const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
const hasPlan = state => Array.isArray(state?.plan) && state.plan.length > 0;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tasks = state => new Map((state?.plan || []).flatMap(day => day.tasks || []).map(task => [task.id, task]));

/** Capture edits made while Firebase is still restoring a remembered login. */
export function queuePendingAccountState(storage, state) {
  if (!hasPlan(state)) return;
  const key = state.ownerUid ? `mpt_account_sync_v1_${state.ownerUid}` : 'mpt_account_sync_pending_guest';
  let journal = {};
  try { journal = JSON.parse(storage.getItem(key) || '{}') || {}; } catch { /* Recover the device plan. */ }
  storage.setItem(key, JSON.stringify({ base: journal.base || null, pending: copy(state) }));
}

export function sameStudyPlan(a, b) {
  if (!hasPlan(a) || !hasPlan(b)) return false;
  return (a.grade || '+2') === (b.grade || '+2') && a.stream === b.stream &&
    a.startDate === b.startDate && a.deadlineDate === b.deadlineDate &&
    equal(a.plan.map(day => [day.date, (day.tasks || []).map(task => task.id)]),
      b.plan.map(day => [day.date, (day.tasks || []).map(task => task.id)]));
}

/** Apply only local changes since the acknowledged base, including intentional unticks. */
export function reconcileStudyPlan(base, local, remote) {
  if (!hasPlan(remote) || !sameStudyPlan(local, remote)) return copy(local);
  const result = copy(remote);
  const before = tasks(base);
  const edited = tasks(local);
  for (const day of result.plan) {
    for (const task of day.tasks || []) {
      const next = edited.get(task.id);
      const prior = before.get(task.id);
      if (prior ? !!next.completed !== !!prior.completed : next.completed) task.completed = !!next.completed;
    }
  }
  for (const [key, value] of Object.entries(local)) {
    if (!['plan', 'createdAt', 'ownerUid', 'uid', 'lastSynced', 'clientSessionId', 'xp'].includes(key) &&
        !equal(value, base?.[key])) result[key] = copy(value);
  }
  if (base && sameStudyPlan(base, local)) {
    const completedCount = state => [...tasks(state).values()].filter(task => task.completed).length;
    const localTaskDelta = (completedCount(local) - completedCount(base)) * 100;
    const mergedTaskDelta = (completedCount(result) - completedCount(remote)) * 100;
    result.xp = Math.max(0, (remote.xp || 0) + mergedTaskDelta +
      (local.xp || 0) - (base.xp || 0) - localTaskDelta);
  } else {
    result.xp = Math.max(remote.xp || 0, local.xp || 0);
  }
  return result;
}

/** A per-account durable outbox. Only server acknowledgements advance its base. */
export function createAccountSync({ db, user, storage, sessionId, getLocal, apply, status,
  chooseLocal = async () => false, now = () => new Date().toISOString() }) {
  const key = `mpt_account_sync_v1_${user.uid}`;
  const ref = db.collection('users').doc(user.uid);
  let journal = { base: null, pending: null };
  try {
    const saved = JSON.parse(storage.getItem(key) || 'null');
    if (saved && typeof saved === 'object') journal = { base: saved.base || null, pending: saved.pending || null };
  } catch { /* The device plan remains available if an old journal is corrupt. */ }
  try {
    const guestKey = 'mpt_account_sync_pending_guest';
    const guestRaw = storage.getItem(guestKey);
    if (guestRaw) {
      const guestJournal = JSON.parse(guestRaw);
      const guestPending = guestJournal?.pending || guestJournal;
      if (hasPlan(guestPending) && !journal.pending) {
        journal.pending = copy({ ...guestPending, ownerUid: user.uid });
        persist();
      }
      storage.removeItem(guestKey);
    }
  } catch { /* Recover device plan */ }
  let stopped = false;
  let initialized = false;
  let refreshing = null;
  let running = null;
  let retryTimer = null;
  let retryDelay = 1000;
  let unsubscribe = null;
  let listening = false;
  let receivedDuringWrite = false;

  function persist() {
    storage.setItem(key, JSON.stringify(journal));
  }

  function failed(error) {
    if (stopped) return false;
    status('error', error);
    if (!retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void refresh();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60000);
    }
    return false;
  }

  function accepted(state) {
    const changed = !equal(journal.base, state);
    journal.base = copy(state);
    persist();
    if (changed || !equal(getLocal(), state)) apply(copy(state));
    retryDelay = 1000;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    status('synced');
  }

  function flush() {
    if (running) return running;
    running = (async () => {
      try {
        while (!stopped && journal.pending) {
          const pending = journal.pending;
          const base = copy(journal.base);
          let committed;
          try {
            committed = await db.runTransaction(async transaction => {
              const snapshot = await transaction.get(ref);
              if (stopped) throw new Error('Sync session ended');
              const remote = snapshot.exists ? snapshot.data() : null;
              if (hasPlan(remote) && base && sameStudyPlan(base, pending) && !sameStudyPlan(pending, remote)) {
                const error = new Error('The account plan changed on another device');
                error.code = 'sync/plan-conflict';
                error.remote = remote;
                throw error;
              }
              const merged = reconcileStudyPlan(base, pending, remote);
              const payload = {
                ...merged, ownerUid: user.uid, userEmail: user.email || null,
                displayName: user.displayName || 'Student', clientSessionId: sessionId,
                lastSynced: now(),
              };
              // Portable file metadata is not part of the account document schema.
              delete payload.exportedAt;
              delete payload.appVersion;
              // These fields belong to the account document, even when replacing its plan.
              for (const field of ['createdAt', 'uid', 'ownerUid']) {
                if (remote && Object.hasOwn(remote, field)) payload[field] = remote[field];
              }
              transaction.set(ref, payload);
              return payload;
            });
          } catch (error) {
            if (error.code !== 'sync/plan-conflict') throw error;
            // Retain the retired plan's offline edits before resolving the conflict.
            storage.setItem(`mpt_sync_conflict_${user.uid}`, JSON.stringify(pending));
            const useLocal = await chooseLocal(pending, error.remote);
            if (stopped) return false;
            if (journal.pending !== pending) continue;
            if (useLocal) journal.base = null;
            else { journal.pending = null; accepted(error.remote); }
            persist();
            continue;
          }
          if (stopped) return false;
          if (journal.pending === pending) {
            journal.pending = null;
            accepted(committed);
          } else {
            // Edits made during the request must retain the server's other changes.
            journal.pending = reconcileStudyPlan(pending, journal.pending, committed);
            journal.base = copy(committed);
            persist();
          }
        }
        return !stopped;
      } catch (error) {
        return failed(error);
      } finally {
        running = null;
        if (receivedDuringWrite && !stopped) {
          receivedDuringWrite = false;
          setTimeout(() => { void refresh(); }, 0);
        }
      }
    })();
    return running;
  }

  function refresh() {
    if (stopped) return Promise.resolve(false);
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        // A cached absence is never evidence that an account has no saved plan.
        const snapshot = await ref.get({ source: 'server' });
        if (stopped) return false;
        const remote = snapshot.exists ? snapshot.data() : null;
        if (!initialized && !journal.pending) {
          const local = getLocal();
          if (hasPlan(local) && (!local.ownerUid || local.ownerUid === user.uid)) {
            const localHasChanges = !journal.base || !equal(local, journal.base);
            if (localHasChanges) {
              const localTime = Date.parse(local.lastModified || local.updatedAt || local.lastSynced || local.createdAt || 0);
              const remoteTime = Date.parse(remote?.lastModified || remote?.updatedAt || remote?.lastSynced || remote?.createdAt || 0);
              const baseTime = Date.parse(journal.base?.lastModified || journal.base?.lastSynced || journal.base?.createdAt || 0);
              const isNewerThanBase = !journal.base || (localTime > 0 && baseTime > 0 && localTime > baseTime) || !sameStudyPlan(local, journal.base);
              const localIsNewerThanRemote = hasPlan(remote) && localTime > 0 && remoteTime > 0 && localTime > remoteTime;

              if (!hasPlan(remote)) {
                journal.pending = reconcileStudyPlan(journal.base, local, remote);
                journal.base = copy(remote);
                persist();
              } else if (sameStudyPlan(local, remote)) {
                if (isNewerThanBase || !journal.base) {
                  journal.pending = reconcileStudyPlan(journal.base, local, remote);
                  journal.base = copy(remote);
                  persist();
                }
              } else if (localIsNewerThanRemote || await chooseLocal(local, remote)) {
                if (stopped) return false;
                journal.pending = reconcileStudyPlan(journal.base, local, remote);
                journal.base = copy(remote);
                persist();
              }
            }
          }
        }
        initialized = true;
        if (journal.pending) return await flush();
        accepted(remote);
        return true;
      } catch (error) {
        return failed(error);
      } finally {
        refreshing = null;
        if (listening && !unsubscribe && !stopped) listen();
      }
    })();
    return refreshing;
  }

  function save(state) {
    if (stopped || !hasPlan(state) || (state.ownerUid && state.ownerUid !== user.uid)) return Promise.resolve(false);
    try {
      journal.pending = copy({ ...state, ownerUid: user.uid });
      persist();
      status('pending');
    } catch (error) {
      return Promise.resolve(failed(error));
    }
    return initialized ? flush() : refresh();
  }

  function listen() {
    listening = true;
    if (unsubscribe) return;
    unsubscribe = ref.onSnapshot({ includeMetadataChanges: true }, snapshot => {
      if (stopped || snapshot.metadata?.hasPendingWrites || snapshot.metadata?.fromCache) return;
      if (running) { receivedDuringWrite = true; return; }
      if (refreshing) return;
      if (!initialized || journal.pending) {
        void refresh();
        return;
      }
      try { accepted(snapshot.exists ? snapshot.data() : null); }
      catch (error) { failed(error); }
    }, error => { unsubscribe = null; failed(error); });
  }

  function stop() {
    stopped = true;
    if (unsubscribe) unsubscribe();
    if (retryTimer) clearTimeout(retryTimer);
  }

  return { uid: user.uid, refresh, save, listen, stop,
    hasPending: () => !!journal.pending,
    clear: () => { journal = { base: null, pending: null }; storage.removeItem(key); },
  };
}
