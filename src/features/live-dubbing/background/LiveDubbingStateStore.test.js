import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveDubbingStateStore, LIVE_DUBBING_CLEAR_OUTCOMES } from './LiveDubbingStateStore.js';
import {
  LIVE_DUBBING_OUTCOME_STORAGE_KEY,
  LIVE_DUBBING_OUTCOME_STORAGE_STATE,
  LIVE_DUBBING_STATUS,
  LIVE_DUBBING_STORAGE_KEY,
  LIVE_DUBBING_STORAGE_STATE,
} from '../constants.js';

// light browserAPI mock with storage.session.get/set/remove as in Coordinator tests
function createStorageMap(entries = {}) {
  const map = new Map();
  for (const [k, v] of Object.entries(entries)) map.set(k, v);
  return map;
}

function createBrowserAPI(storageMap, overrides = {}) {
  const get = overrides.get || vi.fn(async (key) => {
    if (Array.isArray(key)) {
      return Object.fromEntries(key.map((item) => [item, storageMap.get(item)]));
    }
    return { [key]: storageMap.get(key) };
  });
  const set = overrides.set || vi.fn(async (record) => {
    for (const [k, v] of Object.entries(record)) {
      if (v === null) storageMap.delete(k);
      else storageMap.set(k, v);
    }
  });
  const remove = overrides.remove || vi.fn(async (key) => {
    storageMap.delete(key);
  });
  return {
    storage: { session: { get, set, remove } },
    _storageMap: storageMap,
  };
}

function makeValidDescriptor(overrides = {}) {
  return {
    sessionId: 'session-1',
    tabId: 42,
    providerId: 'gemini',
    targetLanguage: 'en',
    status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
    startedAt: 123,
    lastError: null,
    eventSequence: 0,
    ...overrides,
  };
}

function makeValidOutcome(overrides = {}) {
  return {
    sourceSessionId: 'session-1',
    providerId: 'gemini',
    error: 'LIVE_DUBBING_PROVIDER_ERROR',
    occurredAt: 123,
    providerDiagnostic: null,
    ...overrides,
  };
}

describe('LiveDubbingStateStore - storage mechanics', () => {
  beforeEach(() => vi.restoreAllMocks());

  // 1. descriptor read: absent
  it('reads absent descriptor as null with ABSENT state', async () => {
    const storage = createStorageMap();
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });

    const result = await store.readDescriptor();

    expect(result).toBeNull();
    expect(store.descriptor).toBeNull();
    expect(store.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.ABSENT);
    expect(browserAPI.storage.session.get).toHaveBeenCalledWith(LIVE_DUBBING_STORAGE_KEY);
  });

  // 2. descriptor read: valid
  it('reads valid descriptor and tracks PRESENT state', async () => {
    const descriptor = makeValidDescriptor({ status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: 3 });
    const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: descriptor });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });

    const result = await store.readDescriptor();

    expect(result).toEqual(descriptor);
    expect(store.descriptor).toEqual(descriptor);
    expect(store.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.PRESENT);
    // delegate sanitization - ensures sanitized clone
    expect(store.descriptor).not.toBe(descriptor);
  });

  // 3. descriptor read: malformed (fails closed, returns null, storageState tracking)
  it('fails closed on malformed descriptor: PRESENT but null descriptor', async () => {
    const malformed = {
      sessionId: 'session-1',
      tabId: 'not-a-number',
      providerId: 'gemini',
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 123,
      lastError: null,
      eventSequence: 0,
    };
    const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: malformed });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });

    const result = await store.readDescriptor();

    expect(result).toBeNull();
    expect(store.descriptor).toBeNull();
    expect(store.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.PRESENT);
    expect(store.isStorageDescriptorInvalid()).toBe(true);
    expect(store.isStorageReadFailed()).toBe(false);
  });

  // 4. storage read failure (storage.get throws or unavailable)
  it('tracks UNREADABLE when storage.get throws', async () => {
    const browserAPI = createBrowserAPI(createStorageMap(), {
      get: vi.fn(async () => { throw new Error('storage unavailable'); }),
    });
    const store = new LiveDubbingStateStore({ browserAPI });
    store.descriptor = makeValidDescriptor();
    store.storageState = LIVE_DUBBING_STORAGE_STATE.PRESENT;

    const result = await store.readDescriptor();

    expect(store.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.UNREADABLE);
    expect(store.isStorageReadFailed()).toBe(true);
    // retains previous descriptor on failure per implementation
    expect(store.descriptor).toEqual(makeValidDescriptor());
    expect(result).toEqual(makeValidDescriptor());
  });

  it('tracks UNREADABLE when storage.session unavailable', async () => {
    const store = new LiveDubbingStateStore({ browserAPI: {} });
    const result = await store.readDescriptor();
    expect(store.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.UNREADABLE);
    expect(result).toBeNull();

    const store2 = new LiveDubbingStateStore({ browserAPI: { storage: { session: {} } } });
    const result2 = await store2.readDescriptor();
    expect(store2.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.UNREADABLE);
    expect(result2).toBeNull();
  });

  // 5. descriptor write success
  it('writes valid descriptor successfully', async () => {
    const storage = createStorageMap();
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });
    const descriptor = makeValidDescriptor({ status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER, eventSequence: 1 });

    const ok = await store.writeDescriptor(descriptor);

    expect(ok).toBe(true);
    expect(store.descriptor).toEqual(descriptor);
    expect(store.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.PRESENT);
    expect(browserAPI.storage.session.set).toHaveBeenCalledWith({
      [LIVE_DUBBING_STORAGE_KEY]: expect.objectContaining({ sessionId: 'session-1' }),
    });
    expect(storage.get(LIVE_DUBBING_STORAGE_KEY)).toEqual(descriptor);
  });

  // 6. fenced descriptor write rejection (stale eventSequence/status or session mismatch)
  it('rejects fenced descriptor writes: stale eventSequence and session mismatch', async () => {
    // stale eventSequence: trying to write 1 over 2 with expectedSessionId fence
    {
      const base = makeValidDescriptor({ sessionId: 'session-1', eventSequence: 2, status: LIVE_DUBBING_STATUS.RUNNING });
      const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: base });
      const browserAPI = createBrowserAPI(storage);
      const store = new LiveDubbingStateStore({ browserAPI });
      await store.readDescriptor();
      expect(store.descriptor.eventSequence).toBe(2);

      const stale = makeValidDescriptor({ sessionId: 'session-1', eventSequence: 1, status: LIVE_DUBBING_STATUS.RUNNING });
      const rejectedStale = await store.writeDescriptor(stale, 'session-1');
      expect(rejectedStale).toBe(false);
      expect(browserAPI.storage.session.set).not.toHaveBeenCalled();
      expect(storage.get(LIVE_DUBBING_STORAGE_KEY).eventSequence).toBe(2);
    }

    // session mismatch via expectedSessionId: external change to different session
    {
      const base = makeValidDescriptor({ sessionId: 'session-1', eventSequence: 2, status: LIVE_DUBBING_STATUS.RUNNING });
      const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: base });
      const browserAPI = createBrowserAPI(storage);
      const store = new LiveDubbingStateStore({ browserAPI });
      await store.readDescriptor();
      // externally swap to other session
      storage.set(LIVE_DUBBING_STORAGE_KEY, makeValidDescriptor({ sessionId: 'session-2', eventSequence: 2 }));
      const attempt = makeValidDescriptor({ sessionId: 'session-1', eventSequence: 3, status: LIVE_DUBBING_STATUS.RUNNING });
      const rejectedSession = await store.writeDescriptor(attempt, 'session-1');
      expect(rejectedSession).toBe(false);
      expect(storage.get(LIVE_DUBBING_STORAGE_KEY).sessionId).toBe('session-2');
    }

    // expectedDescriptor mismatch fence
    {
      const base = makeValidDescriptor({ sessionId: 'session-1', eventSequence: 2, status: LIVE_DUBBING_STATUS.RUNNING });
      const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: base });
      const browserAPI = createBrowserAPI(storage);
      const store = new LiveDubbingStateStore({ browserAPI });
      await store.readDescriptor();
      const newer = makeValidDescriptor({ sessionId: 'session-1', eventSequence: 3, status: LIVE_DUBBING_STATUS.RUNNING });
      const rejectedExpected = await store.writeDescriptor(newer, null, { sessionId: 'session-1', providerId: 'gemini', eventSequence: 99, status: LIVE_DUBBING_STATUS.RUNNING });
      expect(rejectedExpected).toBe(false);
      expect(browserAPI.storage.session.set).not.toHaveBeenCalled();
    }

    // stale status with same sequence: existing RUNNING vs new CONNECTING_PROVIDER should not regress when fenced
    // fenced via expectedDescriptor status equality check
    const storage2 = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: makeValidDescriptor({ sessionId: 's1', eventSequence: 1, status: LIVE_DUBBING_STATUS.RUNNING }) });
    const api2 = createBrowserAPI(storage2);
    const store2 = new LiveDubbingStateStore({ browserAPI: api2 });
    await store2.readDescriptor();
    const regress = makeValidDescriptor({ sessionId: 's1', eventSequence: 1, status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER });
    const rejectedStatus = await store2.writeDescriptor(regress, 's1', makeValidDescriptor({ sessionId: 's1', eventSequence: 1, status: LIVE_DUBBING_STATUS.RUNNING }));
    expect(rejectedStatus).toBe(false);
  });

  it('allows write after STOPPING when only persistence fences apply (lifecycle is Coordinator-owned)', async () => {
    const stopping = makeValidDescriptor({ sessionId: 'session-1', eventSequence: 2, status: LIVE_DUBBING_STATUS.STOPPING });
    const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: stopping });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });
    await store.readDescriptor();

    const attempt = makeValidDescriptor({ sessionId: 'session-1', eventSequence: 3, status: LIVE_DUBBING_STATUS.RUNNING });
    const ok = await store.writeDescriptor(attempt, 'session-1');
    // Store no longer enforces STOPPING lifecycle; Coordinator owns that guard.
    expect(ok).toBe(true);
    expect(browserAPI.storage.session.set).toHaveBeenCalledWith({
      [LIVE_DUBBING_STORAGE_KEY]: expect.objectContaining({ status: LIVE_DUBBING_STATUS.RUNNING }),
    });
  });

  // 7. descriptor clear success (session-fenced)
  it('clears descriptor when session matches', async () => {
    const descriptor = makeValidDescriptor();
    const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: descriptor });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });
    await store.readDescriptor();

    const result = await store.clearDescriptor('session-1');

    expect(result).toEqual({ outcome: LIVE_DUBBING_CLEAR_OUTCOMES.CLEARED });
    expect(store.descriptor).toBeNull();
    expect(store.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.ABSENT);
    expect(storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
    expect(browserAPI.storage.session.remove).toHaveBeenCalledWith(LIVE_DUBBING_STORAGE_KEY);
  });

  // 8. descriptor clear session mismatch (does not clear)
  it('does not clear when session mismatches', async () => {
    const descriptor = makeValidDescriptor({ sessionId: 'session-1' });
    const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: descriptor });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });
    await store.readDescriptor();

    const result = await store.clearDescriptor('other-session');

    expect(result).toEqual({ outcome: LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH });
    expect(store.descriptor).toEqual(descriptor);
    expect(storage.get(LIVE_DUBBING_STORAGE_KEY)).toEqual(descriptor);
    expect(browserAPI.storage.session.remove).not.toHaveBeenCalled();
  });

  // 9. descriptor clear storage failure (retains)
  it('retains descriptor when storage remove fails', async () => {
    const descriptor = makeValidDescriptor();
    const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: descriptor });
    const browserAPI = createBrowserAPI(storage, {
      remove: vi.fn(async () => { throw new Error('remove failed'); }),
      get: vi.fn(async (key) => {
        if (Array.isArray(key)) return Object.fromEntries(key.map((k) => [k, storage.get(k)]));
        return { [key]: storage.get(key) };
      }),
      set: vi.fn(async (rec) => { for (const [k,v] of Object.entries(rec)) storage.set(k,v); }),
    });
    const store = new LiveDubbingStateStore({ browserAPI });
    await store.readDescriptor();

    const result = await store.clearDescriptor('session-1');

    expect(result).toEqual({ outcome: LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE });
    expect(store.descriptor).toEqual(descriptor);
    expect(storage.get(LIVE_DUBBING_STORAGE_KEY)).toEqual(descriptor);
    expect(store.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.UNREADABLE);
  });

  // 10. combined status snapshot reads descriptor + outcome together (single get)
  it('readStatusSnapshot fetches descriptor and outcome in a single storage.get', async () => {
    const descriptor = makeValidDescriptor({ status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: 2 });
    const outcome = makeValidOutcome();
    const storage = createStorageMap({
      [LIVE_DUBBING_STORAGE_KEY]: descriptor,
      [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: outcome,
    });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });

    await store.readStatusSnapshot();

    expect(browserAPI.storage.session.get).toHaveBeenCalledTimes(1);
    expect(browserAPI.storage.session.get).toHaveBeenCalledWith([
      LIVE_DUBBING_STORAGE_KEY,
      LIVE_DUBBING_OUTCOME_STORAGE_KEY,
    ]);
    expect(store.descriptor).toEqual(descriptor);
    expect(store.terminalOutcome).toEqual(outcome);
    expect(store.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.PRESENT);
    expect(store.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.PRESENT);
  });

  it('readStatusSnapshot handles absent keys correctly', async () => {
    const storage = createStorageMap();
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });
    await store.readStatusSnapshot();
    expect(store.descriptor).toBeNull();
    expect(store.terminalOutcome).toBeNull();
    expect(store.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.ABSENT);
    expect(store.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.ABSENT);
  });

  // 11. terminal outcome persistence (valid outcome writes)
  it('persists valid terminal outcome', async () => {
    const descriptor = makeValidDescriptor({ status: LIVE_DUBBING_STATUS.ERROR });
    const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: descriptor });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });
    await store.readDescriptor();

    const outcome = makeValidOutcome();
    const ok = await store.writeTerminalOutcome(outcome);

    expect(ok).toBe(true);
    expect(store.terminalOutcome).toEqual(outcome);
    expect(store.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.PRESENT);
    expect(storage.get(LIVE_DUBBING_OUTCOME_STORAGE_KEY)).toEqual(outcome);
  });

  // 12. malformed stored terminal outcome fails closed
  it('fails closed on malformed stored terminal outcome', async () => {
    const descriptor = makeValidDescriptor();
    const malformedOutcome = {
      sourceSessionId: 'session-1',
      providerId: 'gemini',
      // missing error / occurredAt, extra field
      error: '',
      occurredAt: 'not-a-number',
      extraSecret: 'leak',
    };
    const storage = createStorageMap({
      [LIVE_DUBBING_STORAGE_KEY]: descriptor,
      [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: malformedOutcome,
    });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });

    await store.readStatusSnapshot();

    expect(store.descriptor).toEqual(descriptor);
    expect(store.terminalOutcome).toBeNull();
    expect(store.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.READ_FAILED);
    expect(store.getStatusTerminalOutcome()).toBeNull();
  });

  it('writeTerminalOutcome rejects malformed outcome without writing', async () => {
    const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: makeValidDescriptor() });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });

    const malformed = { sourceSessionId: 'session-1', providerId: 'gemini', error: 'bad error with spaces', occurredAt: 123 };
    const ok = await store.writeTerminalOutcome(malformed);
    expect(ok).toBe(false);
    expect(store.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.WRITE_FAILED);
    expect(browserAPI.storage.session.set).not.toHaveBeenCalled();
  });

  // 13. stale terminal outcome hidden behind newer active descriptor (getStatusTerminalOutcome returns null when sourceSessionId/providerId mismatch)
  it('hides stale outcome behind newer active descriptor', async () => {
    const newDescriptor = makeValidDescriptor({ sessionId: 'new-session', providerId: 'gemini', status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: 1 });
    const oldOutcome = makeValidOutcome({ sourceSessionId: 'old-session', providerId: 'gemini', occurredAt: 999 });
    const storage = createStorageMap({
      [LIVE_DUBBING_STORAGE_KEY]: newDescriptor,
      [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: oldOutcome,
    });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });
    await store.readStatusSnapshot();

    // stored outcome exists but is stale vs descriptor
    expect(store.terminalOutcome).toEqual(oldOutcome);
    expect(store.getStatusTerminalOutcome()).toBeNull();

    // provider mismatch also hidden
    const mismatchOutcome = makeValidOutcome({ sourceSessionId: 'new-session', providerId: 'openai' });
    const storage2 = createStorageMap({
      [LIVE_DUBBING_STORAGE_KEY]: newDescriptor,
      [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: mismatchOutcome,
    });
    const api2 = createBrowserAPI(storage2);
    const store2 = new LiveDubbingStateStore({ browserAPI: api2 });
    await store2.readStatusSnapshot();
    expect(store2.getStatusTerminalOutcome()).toBeNull();
  });

  // 14. serialized outcome mutations (queue ensures sequential writes, second sees first's result)
  it('serializes outcome mutations: second sees first result via queue', async () => {
    const descriptor = makeValidDescriptor();
    const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: descriptor });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });

    // first outcome write delayed via storage.set delay
    const firstOutcome = makeValidOutcome({ sourceSessionId: 'session-1', occurredAt: 100 });
    const secondOutcome = makeValidOutcome({ sourceSessionId: 'session-1', occurredAt: 200 });

    // make set have variable delay to expose concurrency
    let setCalls = 0;
    browserAPI.storage.session.set.mockImplementation(async (record) => {
      setCalls += 1;
      // first call delays
      if (setCalls === 1) await new Promise((r) => setTimeout(r, 20));
      for (const [k, v] of Object.entries(record)) {
        if (v === null) storage.delete(k);
        else storage.set(k, v);
      }
    });

    const p1 = store.queueOutcomeMutation(() => store.writeTerminalOutcome(firstOutcome));
    const p2 = store.queueOutcomeMutation(() => store.writeTerminalOutcome(secondOutcome));

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(true);
    expect(r2).toBe(true);
    // second should hit existing path and not create second set call beyond first's
    // writeTerminalOutcome does: if stored exists with same sourceSessionId, returns true without set
    // So only first should have done set
    expect(browserAPI.storage.session.set).toHaveBeenCalledTimes(1);
    expect(storage.get(LIVE_DUBBING_OUTCOME_STORAGE_KEY).occurredAt).toBe(100);

    // generic serialization check: order preserved
    const order = [];
    const a = store.queueOutcomeMutation(async () => { order.push('a-start'); await new Promise((r)=>setTimeout(r,15)); order.push('a-end'); return 1; });
    const b = store.queueOutcomeMutation(async () => { order.push('b-start'); order.push('b-end'); return 2; });
    await Promise.all([a,b]);
    expect(order).toEqual(['a-start','a-end','b-start','b-end']);
  });

  // 15. successful RUNNING write atomically clears previous terminal outcome (one set with descriptor+null)
  it('successful RUNNING write atomically clears previous outcome in one set', async () => {
    const initialDescriptor = makeValidDescriptor({ status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER, eventSequence: 2 });
    const outcome = makeValidOutcome();
    const storage = createStorageMap({
      [LIVE_DUBBING_STORAGE_KEY]: initialDescriptor,
      [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: outcome,
    });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });
    await store.readStatusSnapshot();
    expect(store.terminalOutcome).toEqual(outcome);
    expect(store.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.PRESENT);

    const running = makeValidDescriptor({ status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: 3 });
    const ok = await store.writeDescriptor(running, null, null, { clearOutcome: true });

    expect(ok).toBe(true);
    expect(store.terminalOutcome).toBeNull();
    expect(store.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.ABSENT);
    expect(store.descriptor).toEqual(running);
    // one atomic set with both keys
    expect(browserAPI.storage.session.set).toHaveBeenCalledTimes(1);
    const setArg = browserAPI.storage.session.set.mock.calls[0][0];
    expect(setArg[LIVE_DUBBING_STORAGE_KEY]).toEqual(running);
    expect(setArg[LIVE_DUBBING_OUTCOME_STORAGE_KEY]).toBeNull();
    expect(storage.has(LIVE_DUBBING_OUTCOME_STORAGE_KEY)).toBe(false);
    expect(storage.get(LIVE_DUBBING_STORAGE_KEY)).toEqual(running);
  });

  // 16. failed RUNNING write does not clear cached/persisted previous outcome
  it('failed RUNNING write retains previous outcome', async () => {
    const initialDescriptor = makeValidDescriptor({ status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER, eventSequence: 2 });
    const outcome = makeValidOutcome();
    const storage = createStorageMap({
      [LIVE_DUBBING_STORAGE_KEY]: initialDescriptor,
      [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: outcome,
    });
    const browserAPI = createBrowserAPI(storage, {
      get: vi.fn(async (key) => {
        if (Array.isArray(key)) return Object.fromEntries(key.map((k) => [k, storage.get(k)]));
        return { [key]: storage.get(key) };
      }),
      set: vi.fn(async () => { throw new Error('write failed'); }),
      remove: vi.fn(async (k) => storage.delete(k)),
    });
    const store = new LiveDubbingStateStore({ browserAPI });
    await store.readStatusSnapshot();
    expect(store.terminalOutcome).toEqual(outcome);

    const running = makeValidDescriptor({ status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: 3 });
    const ok = await store.writeDescriptor(running, null, null, { clearOutcome: true });

    expect(ok).toBe(false);
    expect(store.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.UNREADABLE);
    // outcome retained both in memory and storage
    expect(store.terminalOutcome).toEqual(outcome);
    expect(store.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.PRESENT);
    expect(storage.get(LIVE_DUBBING_OUTCOME_STORAGE_KEY)).toEqual(outcome);
    expect(storage.get(LIVE_DUBBING_STORAGE_KEY)).toEqual(initialDescriptor);
  });

  // 17. deferred terminal outcome ordering semantics remain compatible (queue persists even if read pending)
  it('deferred outcome queue persists even when a status read is pending', async () => {
    const descriptor = makeValidDescriptor();
    const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: descriptor });
    // delayed get to simulate pending read
    let resolveGet;
    const delayedGet = vi.fn((key) => new Promise((resolve) => {
      resolveGet = () => resolve(Array.isArray(key)
        ? Object.fromEntries(key.map((k) => [k, storage.get(k)]))
        : { [key]: storage.get(key) });
    }));
    const browserAPI = createBrowserAPI(storage, {
      get: delayedGet,
      set: vi.fn(async (rec) => { for (const [k,v] of Object.entries(rec)) { if (v===null) storage.delete(k); else storage.set(k,v); } }),
    });
    const store = new LiveDubbingStateStore({ browserAPI });

    // queue first mutation with delay
    const order = [];
    const first = store.queueOutcomeMutation(async () => {
      order.push('first-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('first-end');
      return 'first';
    });

    // start a snapshot read that stays pending (uses same delayed get)
    const snapshotPromise = store.readStatusSnapshot();
    expect(delayedGet).toHaveBeenCalled();

    // queue second while read is pending
    const second = store.queueOutcomeMutation(async () => {
      order.push('second-start');
      // should see first already finished
      expect(order).toContain('first-end');
      order.push('second-end');
      return 'second';
    });

    // resolve the storage read
    resolveGet();
    await snapshotPromise;
    // snapshot should not have cleared the mutation chain
    expect(store.outcomeMutation).toBeDefined();

    const r1 = await first;
    const r2 = await second;
    expect(r1).toBe('first');
    expect(r2).toBe('second');
    expect(order).toEqual(['first-start','first-end','second-start','second-end']);
  });

  // 18. SW reconstruction can recover descriptor/outcome from storage (store initialized empty then readStatusSnapshot hydrates)
  it('recovers descriptor and outcome after SW reconstruction via readStatusSnapshot', async () => {
    const persistedDescriptor = makeValidDescriptor({ status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: 5 });
    const persistedOutcome = makeValidOutcome({ sourceSessionId: 'old-session', providerId: 'gemini', error: 'LIVE_DUBBING_PROVIDER_ERROR' });
    // even when outcome session differs from descriptor, both are hydrated raw; getStatusTerminalOutcome will hide if mismatched, but raw is present
    const matchingDescriptor = makeValidDescriptor({ sessionId: 'old-session', status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: 5 });
    const storage = createStorageMap({
      [LIVE_DUBBING_STORAGE_KEY]: matchingDescriptor,
      [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: persistedOutcome,
    });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });

    expect(store.descriptor).toBeNull();
    expect(store.terminalOutcome).toBeNull();

    await store.readStatusSnapshot();

    expect(store.descriptor).toEqual(matchingDescriptor);
    expect(store.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.PRESENT);
    expect(store.terminalOutcome).toEqual(persistedOutcome);
    expect(store.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.PRESENT);
    // public view exposes sanitized outcome without sourceSessionId
    expect(store.getStatusTerminalOutcome()).toEqual({
      providerId: 'gemini',
      error: 'LIVE_DUBBING_PROVIDER_ERROR',
      occurredAt: 123,
      providerDiagnostic: null,
    });

    // also test recovery when only descriptor present
    const storage2 = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: persistedDescriptor });
    const api2 = createBrowserAPI(storage2);
    const store2 = new LiveDubbingStateStore({ browserAPI: api2 });
    await store2.readStatusSnapshot();
    expect(store2.descriptor).toEqual(persistedDescriptor);
    expect(store2.terminalOutcome).toBeNull();
    expect(store2.getStatusTerminalOutcome()).toBeNull();
  });

  it('writeTerminalOutcome fences against active descriptor mismatch', async () => {
    const active = makeValidDescriptor({ sessionId: 'new-session', providerId: 'gemini' });
    const storage = createStorageMap({ [LIVE_DUBBING_STORAGE_KEY]: active });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });
    await store.readDescriptor();

    const staleOutcome = makeValidOutcome({ sourceSessionId: 'old-session', providerId: 'gemini' });
    const ok = await store.writeTerminalOutcome(staleOutcome);
    expect(ok).toBe(false);
    expect(store.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.WRITE_FAILED);
    expect(storage.has(LIVE_DUBBING_OUTCOME_STORAGE_KEY)).toBe(false);
  });

  it('writeTerminalOutcome is idempotent when same session already persisted', async () => {
    const descriptor = makeValidDescriptor();
    const existing = makeValidOutcome();
    const storage = createStorageMap({
      [LIVE_DUBBING_STORAGE_KEY]: descriptor,
      [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: existing,
    });
    const browserAPI = createBrowserAPI(storage);
    const store = new LiveDubbingStateStore({ browserAPI });
    // hydrate outcome via snapshot to set cache
    await store.readStatusSnapshot();

    const duplicate = makeValidOutcome({ occurredAt: 999 });
    const ok = await store.writeTerminalOutcome(duplicate);
    expect(ok).toBe(true);
    expect(store.terminalOutcome).toEqual(existing);
    expect(browserAPI.storage.session.set).not.toHaveBeenCalled();
  });
});
