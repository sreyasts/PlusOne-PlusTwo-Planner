import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccountSync, queuePendingAccountState, reconcileStudyPlan, sameStudyPlan } from '../src/auth/account-sync.js';

const clone = value => structuredClone(value);
const plan = (done = []) => ({
  grade: '+2', stream: 'cs', engineVersion: 3, startDate: '2026-11-01', deadlineDate: '2027-03-01',
  createdAt: '2026-11-01T00:00:00.000Z', lastModified: '2026-11-01T00:00:00.000Z', xp: done.length * 100,
  plan: [{ dayNumber: 1, date: '2026-11-01', tasks: ['a', 'b', 'c'].map(id => ({ id, completed: done.includes(id) })) }],
});
const completed = state => state.plan.flatMap(day => day.tasks).filter(task => task.completed).map(task => task.id);
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

function database(initial = null) {
  let data = clone(initial);
  let unavailable = false;
  let listener = null;
  let listenerError = null;
  let chain = Promise.resolve();
  const snapshot = () => ({ exists: !!data, data: () => clone(data), metadata: { fromCache: false, hasPendingWrites: false } });
  const ref = {
    get: vi.fn(async options => {
      expect(options).toEqual({ source: 'server' });
      if (unavailable) throw new Error('offline');
      return snapshot();
    }),
    onSnapshot: vi.fn((_options, next, error) => { listener = next; listenerError = error; return () => { listener = null; }; }),
  };
  const db = {
    collection: name => { expect(name).toBe('users'); return { doc: () => ref }; },
    runTransaction: vi.fn(update => {
      const next = chain.then(async () => {
        if (unavailable) throw new Error('offline');
        let write;
        const result = await update({ get: async () => snapshot(), set: (_ref, payload) => { write = clone(payload); } });
        if (write) data = write;
        return result;
      });
      chain = next.catch(() => {});
      return next;
    }),
  };
  return { db, ref, read: () => clone(data), offline: value => { unavailable = value; },
    emit: (state, metadata = {}) => {
      data = clone(state);
      listener?.({ ...snapshot(), metadata });
    }, failListener: error => listenerError(error),
  };
}

const sessions = [];
function device(server, initial = null, disk = storage(), uid = 'student') {
  let state = clone(initial);
  const apply = vi.fn(value => { state = value; });
  const status = vi.fn();
  const chooseLocal = vi.fn(async () => false);
  const sync = createAccountSync({ db: server.db, user: { uid, email: `${uid}@example.com` },
    storage: disk, sessionId: `session-${sessions.length}`, getLocal: () => state, apply, status, chooseLocal,
  });
  sessions.push(sync);
  return { sync, disk, apply, status, chooseLocal, read: () => clone(state) };
}
afterEach(() => { sessions.splice(0).forEach(sync => sync.stop()); vi.useRealTimers(); });

describe('Durable account synchronization', () => {
  it('restores a phone plan and progress on an empty PC without uploading defaults', async () => {
    const server = database(plan(['a', 'b']));
    const pc = device(server);
    expect(await pc.sync.refresh()).toBe(true);
    expect(completed(pc.read())).toEqual(['a', 'b']);
    expect(server.db.runTransaction).not.toHaveBeenCalled();
  });

  it('reports a rejected save and retains it durably until the server acknowledges it', async () => {
    const server = database(plan());
    const phone = device(server);
    await phone.sync.refresh();
    server.offline(true);
    expect(await phone.sync.save(plan(['a']))).toBe(false);
    expect(phone.sync.hasPending()).toBe(true);
    expect(phone.status).toHaveBeenLastCalledWith('error', expect.any(Error));
    expect(completed(server.read())).toEqual([]);
    server.offline(false);
    expect(await phone.sync.refresh()).toBe(true);
    expect(phone.sync.hasPending()).toBe(false);
    expect(completed(server.read())).toEqual(['a']);
    expect(phone.status).toHaveBeenLastCalledWith('synced');
  });

  it('recovers an offline untick after reload while retaining another device completion', async () => {
    const server = database(plan(['a']));
    const phone = device(server);
    await phone.sync.refresh();
    server.offline(true);
    await phone.sync.save(plan());
    phone.sync.stop();
    server.offline(false);
    server.emit(plan(['a', 'b']));
    const reloaded = device(server, plan(), phone.disk);
    await reloaded.sync.refresh();
    expect(completed(server.read())).toEqual(['b']);
    expect(server.read().xp).toBe(100);
  });

  it('merges simultaneous edits transactionally without losing either device progress', async () => {
    const server = database(plan());
    const phone = device(server);
    const pc = device(server);
    await Promise.all([phone.sync.refresh(), pc.sync.refresh()]);
    await Promise.all([phone.sync.save(plan(['a'])), pc.sync.save(plan(['b']))]);
    expect(completed(server.read())).toEqual(['a', 'b']);
    expect(server.read().xp).toBe(200);
  });

  it('awards completion XP once when both devices tick the same task concurrently', async () => {
    const server = database(plan());
    const phone = device(server);
    const pc = device(server);
    await Promise.all([phone.sync.refresh(), pc.sync.refresh()]);
    await Promise.all([phone.sync.save(plan(['a'])), pc.sync.save(plan(['a']))]);
    expect(completed(server.read())).toEqual(['a']);
    expect(server.read().xp).toBe(100);
  });

  it('preserves edits made while an earlier write is in flight', async () => {
    const server = database(plan());
    const phone = device(server);
    await phone.sync.refresh();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const transaction = server.db.runTransaction.getMockImplementation();
    server.db.runTransaction.mockImplementationOnce(async update => { await gate; return transaction(update); });
    const first = phone.sync.save(plan(['a']));
    const second = phone.sync.save(plan(['a', 'b']));
    release();
    await Promise.all([first, second]);
    expect(completed(server.read())).toEqual(['a', 'b']);
    expect(phone.sync.hasPending()).toBe(false);
  });

  it('preserves immutable account fields when a new plan replaces an old one', async () => {
    const old = { ...plan(['a']), ownerUid: 'student', uid: 'student' };
    const server = database(old);
    const phone = device(server);
    await phone.sync.refresh();
    const replacement = { ...plan(), grade: '+1', createdAt: '2026-11-02T00:00:00.000Z' };
    await phone.sync.save(replacement);
    expect(server.read()).toMatchObject({ grade: '+1', createdAt: old.createdAt, ownerUid: 'student', uid: 'student' });
    expect(completed(server.read())).toEqual([]);
  });

  it('omits portable backup metadata from the strict Firestore payload', async () => {
    const server = database(plan());
    const phone = device(server);
    await phone.sync.refresh();
    await phone.sync.save({ ...plan(['a']), exportedAt: '2026-11-01T00:00:00.000Z', appVersion: '7.1.1' });
    expect(server.read()).not.toHaveProperty('exportedAt');
    expect(server.read()).not.toHaveProperty('appVersion');
    expect(completed(server.read())).toEqual(['a']);
  });

  it('does not silently replace a newly generated remote plan with offline edits to a retired plan', async () => {
    const server = database(plan());
    const phone = device(server);
    await phone.sync.refresh();
    server.offline(true);
    await phone.sync.save(plan(['a']));
    server.offline(false);
    server.emit({ ...plan(['b']), grade: '+1' });
    await phone.sync.refresh();
    expect(phone.chooseLocal).toHaveBeenCalledOnce();
    expect(server.read().grade).toBe('+1');
    expect(completed(server.read())).toEqual(['b']);
    expect(completed(JSON.parse(phone.disk.getItem('mpt_sync_conflict_student')))).toEqual(['a']);
  });

  it('preserves a changed calendar instead of merging task IDs onto the previous schedule', async () => {
    const server = database(plan());
    const phone = device(server);
    await phone.sync.refresh();
    const rescheduled = plan();
    rescheduled.plan[0].date = '2026-11-02';
    await phone.sync.save(rescheduled);
    expect(server.read().plan[0].date).toBe('2026-11-02');
  });

  it('never merges colliding task IDs across grades', () => {
    const local = { ...plan(), grade: '+1' };
    expect(sameStudyPlan(local, plan(['a']))).toBe(false);
    expect(completed(reconcileStudyPlan(null, local, plan(['a'])))).toEqual([]);
  });

  it('asks before replacing different guest and account plans', async () => {
    const server = database({ ...plan(['a']), grade: '+1' });
    const pc = device(server, plan());
    await pc.sync.refresh();
    expect(pc.chooseLocal).toHaveBeenCalledOnce();
    expect(pc.read().grade).toBe('+1');
    expect(server.db.runTransaction).not.toHaveBeenCalled();
  });

  it('does not mistake an offline read for an empty account or upload stale defaults', async () => {
    const server = database(plan(['a']));
    server.offline(true);
    const pc = device(server, plan());
    expect(await pc.sync.refresh()).toBe(false);
    expect(pc.apply).not.toHaveBeenCalled();
    expect(server.db.runTransaction).not.toHaveBeenCalled();
  });

  it('accepts server updates despite equal device clocks, and ignores cache/pending snapshots', async () => {
    const server = database(plan());
    const pc = device(server);
    await pc.sync.refresh();
    pc.sync.listen();
    server.emit(plan(['a']), { fromCache: true });
    server.emit(plan(['a']), { hasPendingWrites: true });
    expect(completed(pc.read())).toEqual([]);
    server.emit(plan(['b']));
    expect(completed(pc.read())).toEqual(['b']);
    server.emit(null);
    expect(pc.read()).toBeNull();
  });

  it('reattaches a failed listener after retrying the server', async () => {
    vi.useFakeTimers();
    const server = database(plan());
    const pc = device(server);
    await pc.sync.refresh();
    pc.sync.listen();
    server.failListener(new Error('permission-denied'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.ref.onSnapshot).toHaveBeenCalledTimes(2);
  });

  it('keeps pending edits isolated to their account and suppresses late account callbacks', async () => {
    const server = database(plan());
    const phone = device(server);
    await phone.sync.refresh();
    server.offline(true);
    await phone.sync.save(plan(['a']));
    phone.sync.stop();
    server.offline(false);
    const differentAccount = device(server, null, phone.disk, 'other-student');
    await differentAccount.sync.refresh();
    expect(completed(differentAccount.read())).toEqual([]);
    expect(await phone.sync.save(plan(['b']))).toBe(false);
    expect(completed(server.read())).toEqual([]);
  });

  it('recovers legacy blocked writes once without reviving acknowledged unticks', async () => {
    const server = database(plan(['a']));
    const pc = device(server, plan(['b']));
    await pc.sync.refresh();
    expect(completed(server.read())).toEqual(['a', 'b']);
    await pc.sync.save(plan(['b']));
    pc.sync.stop();
    const reload = device(server, plan(['a', 'b']), pc.disk);
    await reload.sync.refresh();
    expect(completed(reload.read())).toEqual(['b']);
  });

  it('retains edits made before Firebase finishes restoring the login', async () => {
    const server = database({ ...plan(['a']), ownerUid: 'student' });
    const phone = device(server);
    await phone.sync.refresh();
    phone.sync.stop();
    const earlyEdit = { ...plan(['a', 'b']), ownerUid: 'student' };
    queuePendingAccountState(phone.disk, earlyEdit);
    const restoredLogin = device(server, earlyEdit, phone.disk);
    await restoredLogin.sync.refresh();
    expect(completed(server.read())).toEqual(['a', 'b']);
  });

  it('retains a newly generated local plan created yesterday over a stale remote plan on next-day login', async () => {
    const oldRemote = {
      ...plan(['a']),
      grade: '+2',
      stream: 'cs',
      createdAt: '2026-10-20T00:00:00.000Z',
      lastModified: '2026-10-20T00:00:00.000Z',
    };
    const server = database(oldRemote);
    const disk = storage();
    disk.setItem('mpt_account_sync_v1_student', JSON.stringify({ base: oldRemote, pending: null }));
    const yesterdayNewPlan = {
      ...plan([]),
      grade: '+2',
      stream: 'bio',
      createdAt: '2026-11-03T10:00:00.000Z',
      lastModified: '2026-11-03T10:00:00.000Z',
    };
    const client = device(server, yesterdayNewPlan, disk);
    await client.sync.refresh();
    expect(client.read().stream).toBe('bio');
    expect(server.read().stream).toBe('bio');
  });

  it('adopts guest pending plan created before authentication and saves it to user account', async () => {
    const oldRemote = {
      ...plan(['a']),
      grade: '+2',
      stream: 'cs',
      createdAt: '2026-10-20T00:00:00.000Z',
      lastModified: '2026-10-20T00:00:00.000Z',
    };
    const server = database(oldRemote);
    const disk = storage();
    const guestPlan = {
      ...plan([]),
      grade: '+2',
      stream: 'commerce',
      createdAt: '2026-11-04T10:00:00.000Z',
      lastModified: '2026-11-04T10:00:00.000Z',
    };
    queuePendingAccountState(disk, guestPlan);
    const client = device(server, guestPlan, disk);
    await client.sync.refresh();
    expect(client.read().stream).toBe('commerce');
    expect(server.read().stream).toBe('commerce');
  });
});
