import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OPENAI_SPIKE_DEV_LEASE_REASONS,
  OPENAI_SPIKE_DEV_OWNER,
  OpenAISpikeDevBackgroundHook,
  installOpenAISpikeDevBackgroundHook,
} from './spikeDevBackground.js';
import { OPENAI_SPIKE_DEV_ACTIONS } from './spikeDevContract.js';

const BOOTSTRAP = {
  secret: 'ek_test_secret',
  targetLanguage: 'es',
  model: 'gpt-realtime-translate',
  expiresAt: 1750000000,
};

function createHook(overrides = {}) {
  const events = [];
  const logs = [];
  let txCounter = 0;
  const defaults = {
    getLastFocused: vi.fn(async () => {
      events.push('windows.getLastFocused');
      // Mirrors real Chrome from SW DevTools: the window reports
      // focused:false, yet still carries its active tab.
      return { id: 1, focused: false, tabs: [{ id: 7, active: true }] };
    }),
    getMediaStreamId: vi.fn(async () => {
      events.push('getMediaStreamId');
      return 'stream-secret-1';
    }),
    acquire: vi.fn(async () => {
      events.push('acquire');
      return true;
    }),
    release: vi.fn(async () => {
      events.push('release');
      return true;
    }),
    mintClientSecret: vi.fn(async () => {
      events.push('mint');
      return { ...BOOTSTRAP };
    }),
    sendMessage: vi.fn(async (message) => {
      events.push(`send:${message?.action}`);
      const transactionId = message?.data?.transactionId || 'tx-1';
      if (message?.action === OPENAI_SPIKE_DEV_ACTIONS.START) {
        return { success: true, transactionId, targetLanguage: 'es' };
      }
      if (message?.action === OPENAI_SPIKE_DEV_ACTIONS.STOP) {
        return { success: true, transactionId };
      }
      if (message?.action === OPENAI_SPIKE_DEV_ACTIONS.STATUS) {
        return {
          success: true,
          transactionId,
          active: true,
          targetLanguage: 'es',
          captureReady: true,
          telemetry: { transcriptEvents: 3 },
        };
      }
      return null;
    }),
  };
  const doubles = { ...defaults, ...overrides };
  const hook = new OpenAISpikeDevBackgroundHook({
    chromeAPI: { tabCapture: { getMediaStreamId: doubles.getMediaStreamId } },
    browserAPI: { windows: { getLastFocused: doubles.getLastFocused } },
    leaseManager: { acquire: doubles.acquire, release: doubles.release },
    mintService: { mintClientSecret: doubles.mintClientSecret },
    sendMessage: doubles.sendMessage,
    uuid: () => `tx-${(txCounter += 1)}`,
    ...(Number.isSafeInteger(overrides.ackTimeoutMs) ? { ackTimeoutMs: overrides.ackTimeoutMs } : {}),
    ...(Number.isSafeInteger(overrides.statusTimeoutMs) ? { statusTimeoutMs: overrides.statusTimeoutMs } : {}),
    ...(Number.isSafeInteger(overrides.stopTimeoutMs) ? { stopTimeoutMs: overrides.stopTimeoutMs } : {}),
    logger: {
      debug: vi.fn((...args) => { logs.push(args); }),
      warn: vi.fn((...args) => { logs.push(args); }),
      error: vi.fn((...args) => { logs.push(args); }),
    },
  });
  return { hook, doubles, events, logs };
}

describe('OpenAISpikeDevBackgroundHook (SPIKE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.__translateItOpenAIRealtimeSpike;
  });

  it('orders lease → mint → stream-id → immediate START dispatch, then publishes on ack', async () => {
    const { hook, doubles, events, logs } = createHook();

    const result = await hook.start({ targetLanguage: 'es' });

    // Lease creates the document, mint is slow, the stream id is
    // perishable: this exact order is the contract.
    expect(events).toEqual([
      'windows.getLastFocused',
      'acquire',
      'mint',
      'getMediaStreamId',
      `send:${OPENAI_SPIKE_DEV_ACTIONS.START}`,
    ]);
    expect(result).toEqual({ success: true, targetLanguage: 'es' });

    const startMessage = doubles.sendMessage.mock.calls[0][0];
    expect(startMessage.action).toBe(OPENAI_SPIKE_DEV_ACTIONS.START);
    expect(startMessage.data).toMatchObject({
      transactionId: 'tx-1',
      targetLanguage: 'es',
      streamId: 'stream-secret-1',
    });
    expect(Object.keys(startMessage.data.bootstrap).sort())
      .toEqual(['expiresAt', 'model', 'secret', 'targetLanguage']);
    expect(JSON.stringify(startMessage)).not.toContain('OPENAI_API_KEY');

    expect(doubles.acquire).toHaveBeenCalledWith({
      owner: OPENAI_SPIKE_DEV_OWNER,
      leaseId: 'tx-1',
      requiredReasons: [...OPENAI_SPIKE_DEV_LEASE_REASONS],
    });
    await expect(hook.status()).resolves.toMatchObject({ active: true });
    const logText = JSON.stringify(logs);
    expect(logText).not.toContain('stream-secret-1');
    expect(logText).not.toContain('ek_test_secret');

    await hook.stop();
  });

  it('rejects invalid languages before any side effect', async () => {
    const { hook, events } = createHook();

    await expect(hook.start({ targetLanguage: '' }))
      .resolves.toEqual({ success: false, error: 'INVALID_TARGET_LANGUAGE' });
    expect(events).toEqual([]);
  });

  it('fails closed with no usable active tab and zero side effects', async () => {
    const cases = {
      'missing window': undefined,
      'null window': null,
      'window without tabs': { id: 1, focused: false },
      'no active tab': { id: 1, focused: false, tabs: [{ id: 7, active: false }] },
      'negative id': { id: 1, focused: false, tabs: [{ id: -1, active: true }] },
      'non-integer id': { id: 1, focused: false, tabs: [{ id: '7', active: true }] },
    };
    for (const [name, window] of Object.entries(cases)) {
      const { hook, doubles, events } = createHook({
        getLastFocused: vi.fn(async () => window),
      });

      await expect(hook.start({ targetLanguage: 'es' }), name)
        .resolves.toEqual({ success: false, error: 'TARGET_TAB_UNAVAILABLE' });
      expect(events, name).toEqual([]);
      expect(doubles.acquire, name).not.toHaveBeenCalled();
      expect(doubles.mintClientSecret, name).not.toHaveBeenCalled();
      expect(doubles.getMediaStreamId, name).not.toHaveBeenCalled();
      expect(doubles.sendMessage, name).not.toHaveBeenCalled();
    }
  });

  it('takes the active tab from a focused:false window, ignoring inactive tabs', async () => {
    const getLastFocused = vi.fn(async () => ({
      id: 1,
      focused: false,
      tabs: [
        { id: 5, active: false },
        { id: 7, active: true },
        { id: 9, active: false },
      ],
    }));
    const { hook, doubles } = createHook({ getLastFocused });

    await expect(hook.start({ targetLanguage: 'es' }))
      .resolves.toEqual({ success: true, targetLanguage: 'es' });
    expect(getLastFocused).toHaveBeenCalledWith({ populate: true, windowTypes: ['normal'] });
    expect(doubles.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 7 });

    await hook.stop();
  });

  it('fails closed on lease failure without minting or releasing', async () => {
    const { hook, doubles, events } = createHook({ acquire: vi.fn(async () => false) });

    await expect(hook.start({ targetLanguage: 'es' }))
      .resolves.toEqual({ success: false, error: 'LEASE_UNAVAILABLE' });
    expect(events).toEqual(['windows.getLastFocused']);
    expect(doubles.mintClientSecret).not.toHaveBeenCalled();
    expect(doubles.release).not.toHaveBeenCalled();
  });

  it('releases the lease when the Background-only mint fails', async () => {
    const { hook, doubles } = createHook({ mintClientSecret: vi.fn(async () => null) });

    await expect(hook.start({ targetLanguage: 'es' }))
      .resolves.toEqual({ success: false, error: 'BOOTSTRAP_UNAVAILABLE' });
    expect(doubles.release).toHaveBeenCalledTimes(1);
    expect(doubles.release).toHaveBeenCalledWith({ owner: OPENAI_SPIKE_DEV_OWNER, leaseId: 'tx-1' });
    expect(doubles.sendMessage).not.toHaveBeenCalled();
  });

  it('maps capture denial to CAPTURE_FAILED without raw errors and releases the lease', async () => {
    const denied = createHook({
      getMediaStreamId: vi.fn(async () => { throw new Error('denied by browser auth'); }),
    });
    await expect(denied.hook.start({ targetLanguage: 'es' }))
      .resolves.toMatchObject({ success: false, error: 'CAPTURE_FAILED' });
    const deniedResult = await denied.hook.status();
    expect(JSON.stringify(deniedResult)).not.toContain('denied by browser auth');
    expect(denied.doubles.release).toHaveBeenCalledTimes(1);

    const empty = createHook({ getMediaStreamId: vi.fn(async () => '') });
    await expect(empty.hook.start({ targetLanguage: 'es' }))
      .resolves.toMatchObject({ success: false, error: 'CAPTURE_FAILED' });

    const missing = new OpenAISpikeDevBackgroundHook({
      chromeAPI: {},
      browserAPI: { windows: { getLastFocused: vi.fn(async () => ({ id: 1, tabs: [{ id: 7, active: true }] })) } },
      leaseManager: { acquire: vi.fn(async () => true), release: vi.fn(async () => true) },
      mintService: { mintClientSecret: vi.fn(async () => ({ ...BOOTSTRAP })) },
      sendMessage: vi.fn(),
      uuid: () => 'tx-1',
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });
    await expect(missing.start({ targetLanguage: 'es' }))
      .resolves.toMatchObject({ success: false, error: 'CAPTURE_FAILED' });
  });

  it('fences a concurrent start with no extra side effects', async () => {
    let resolveAcquire;
    const { hook, doubles } = createHook({
      acquire: vi.fn(() => new Promise((resolve) => { resolveAcquire = resolve; })),
    });

    const startA = hook.start({ targetLanguage: 'es' });
    await vi.waitFor(() => expect(doubles.acquire).toHaveBeenCalledOnce());
    await expect(hook.start({ targetLanguage: 'es' }))
      .resolves.toEqual({ success: false, error: 'ALREADY_STARTED' });
    expect(doubles.getLastFocused).toHaveBeenCalledOnce();

    resolveAcquire(true);
    // Finish the run deterministically: mint/stream/ack use immediate doubles.
    await expect(startA).resolves.toEqual({ success: true, targetLanguage: 'es' });

    await hook.stop();
  });

  it('abandons a stop-during-lease start and releases exactly once', async () => {
    let resolveAcquire;
    const { hook, doubles } = createHook({
      acquire: vi.fn(() => new Promise((resolve) => { resolveAcquire = resolve; })),
    });

    const startA = hook.start({ targetLanguage: 'es' });
    await vi.waitFor(() => expect(doubles.acquire).toHaveBeenCalledOnce());
    await expect(hook.stop()).resolves.toEqual({ success: true });

    resolveAcquire(true);
    await expect(startA).resolves.toEqual({ success: false, error: 'START_CANCELLED' });
    expect(doubles.release).toHaveBeenCalledTimes(1);
    expect(doubles.release).toHaveBeenCalledWith({ owner: OPENAI_SPIKE_DEV_OWNER, leaseId: 'tx-1' });
    expect(doubles.mintClientSecret).not.toHaveBeenCalled();
    expect(doubles.sendMessage).not.toHaveBeenCalled();
  });

  it('abandons a stop-during-mint start without touching capture', async () => {
    let resolveMint;
    const { hook, doubles } = createHook({
      mintClientSecret: vi.fn(() => new Promise((resolve) => { resolveMint = resolve; })),
    });

    const startA = hook.start({ targetLanguage: 'es' });
    await vi.waitFor(() => expect(doubles.mintClientSecret).toHaveBeenCalledOnce());
    await expect(hook.stop()).resolves.toEqual({ success: true });

    resolveMint({ ...BOOTSTRAP });
    await expect(startA).resolves.toEqual({ success: false, error: 'START_CANCELLED' });
    expect(doubles.release).toHaveBeenCalledTimes(1);
    expect(doubles.getMediaStreamId).not.toHaveBeenCalled();
    expect(doubles.sendMessage).not.toHaveBeenCalled();
  });

  it('stops post-stream-ID by notifying Offscreen first, then releasing once', async () => {
    let resolveAck;
    const { hook, doubles } = createHook({
      sendMessage: vi.fn(async (message) => {
        if (message?.action === OPENAI_SPIKE_DEV_ACTIONS.START) {
          return new Promise((resolve) => { resolveAck = resolve; });
        }
        return { success: true, transactionId: message?.data?.transactionId };
      }),
    });

    const startA = hook.start({ targetLanguage: 'es' });
    await vi.waitFor(() => expect(doubles.sendMessage).toHaveBeenCalledOnce());
    await expect(hook.stop()).resolves.toEqual({ success: true });

    const stopCall = doubles.sendMessage.mock.calls
      .find(([message]) => message?.action === OPENAI_SPIKE_DEV_ACTIONS.STOP);
    expect(stopCall?.[0]?.data).toEqual({ transactionId: 'tx-1' });

    resolveAck({ success: true, transactionId: 'tx-1', targetLanguage: 'es' });
    await expect(startA).resolves.toEqual({ success: false, error: 'START_CANCELLED' });
    expect(doubles.release).toHaveBeenCalledTimes(1);
    expect((await hook.status()).active).toBe(false);
  });

  it('releases on malformed or missing acks without depending on an echo', async () => {
    const stale = createHook({
      sendMessage: vi.fn(async (message) => {
        if (message?.action === OPENAI_SPIKE_DEV_ACTIONS.STOP) {
          return { success: true, transactionId: message?.data?.transactionId };
        }
        return { success: true, transactionId: 'tx-STALE' };
      }),
    });
    await expect(stale.hook.start({ targetLanguage: 'es' }))
      .resolves.toEqual({ success: false, error: 'OFFSCREEN_START_FAILED' });
    expect(stale.doubles.release).toHaveBeenCalledTimes(1);
    expect(stale.doubles.release).toHaveBeenCalledWith({ owner: OPENAI_SPIKE_DEV_OWNER, leaseId: 'tx-1' });

    const silent = createHook({
      ackTimeoutMs: 15,
      sendMessage: vi.fn(async (message) => {
        if (message?.action === OPENAI_SPIKE_DEV_ACTIONS.STOP) {
          return { success: true, transactionId: message?.data?.transactionId };
        }
        return new Promise(() => {});
      }),
    });
    await expect(silent.hook.start({ targetLanguage: 'es' }))
      .resolves.toEqual({ success: false, error: 'OFFSCREEN_START_FAILED' });
    expect(silent.doubles.release).toHaveBeenCalledTimes(1);
    const stopCall = silent.doubles.sendMessage.mock.calls
      .find(([message]) => message?.action === OPENAI_SPIKE_DEV_ACTIONS.STOP);
    expect(stopCall?.[0]?.data).toEqual({ transactionId: 'tx-1' });
  });

  it('passes Offscreen failure codes through after cleanup', async () => {
    const { hook, doubles } = createHook({
      sendMessage: vi.fn(async (message) => {
        if (message?.action === OPENAI_SPIKE_DEV_ACTIONS.STOP) {
          return { success: true, transactionId: message?.data?.transactionId };
        }
        return { success: false, transactionId: message?.data?.transactionId, error: 'CONSUME_FAILED' };
      }),
    });

    await expect(hook.start({ targetLanguage: 'es' }))
      .resolves.toEqual({ success: false, error: 'CONSUME_FAILED' });
    expect(doubles.release).toHaveBeenCalledTimes(1);
  });

  it('reports scalar status, merging Offscreen telemetry best-effort', async () => {
    const { hook } = createHook();

    await expect(hook.status()).resolves.toEqual({
      success: true,
      active: false,
      starting: false,
      targetLanguage: null,
      captureReady: false,
      telemetry: null,
    });

    await hook.start({ targetLanguage: 'es' });
    await expect(hook.status()).resolves.toMatchObject({
      success: true,
      active: true,
      targetLanguage: 'es',
      captureReady: true,
      telemetry: { transcriptEvents: 3 },
    });

    await hook.stop();
  });

  it('degrades status when the Offscreen query fails', async () => {
    const { hook } = createHook({
      sendMessage: vi.fn(async (message) => {
        if (message?.action === OPENAI_SPIKE_DEV_ACTIONS.STATUS) return { garbage: true };
        if (message?.action === OPENAI_SPIKE_DEV_ACTIONS.STOP) {
          return { success: true, transactionId: message?.data?.transactionId };
        }
        return { success: true, transactionId: message?.data?.transactionId, targetLanguage: 'es' };
      }),
    });

    await hook.start({ targetLanguage: 'es' });
    await expect(hook.status()).resolves.toMatchObject({
      success: true,
      active: true,
      captureReady: false,
      telemetry: null,
    });

    await hook.stop();
  });

  it('sanitizes poisoned Offscreen telemetry in status', async () => {
    const { hook } = createHook({
      sendMessage: vi.fn(async (message) => {
        if (message?.action === OPENAI_SPIKE_DEV_ACTIONS.STATUS) {
          return {
            success: true,
            transactionId: message?.data?.transactionId,
            active: true,
            targetLanguage: 'es',
            captureReady: true,
            telemetry: {
              offerCreated: true,
              transcriptEvents: 5,
              transcript: 'hola mundo secreto',
              secret: 'ek_live_secret',
              sdp: 'v=0\r\no=evil',
              streamId: 'stream-secret-1',
              nested: { deep: ['x'] },
              milestones: { start: 100, firstTranscriptEvent: Number.NaN },
            },
          };
        }
        if (message?.action === OPENAI_SPIKE_DEV_ACTIONS.STOP) {
          return { success: true, transactionId: message?.data?.transactionId };
        }
        return { success: true, transactionId: message?.data?.transactionId, targetLanguage: 'es' };
      }),
    });

    await hook.start({ targetLanguage: 'es' });
    const status = await hook.status();
    expect(status.telemetry).toEqual({
      offerCreated: true,
      answerApplied: false,
      transcriptEvents: 5,
      remoteTracks: 0,
      milestones: {
        start: 100,
        offerCreated: null,
        answerApplied: null,
        firstRemoteAudio: null,
        firstTranscriptEvent: null,
        cleanup: null,
      },
    });
    const exposed = JSON.stringify(status);
    expect(exposed).not.toContain('hola mundo secreto');
    expect(exposed).not.toContain('ek_live_secret');
    expect(exposed).not.toContain('stream-secret-1');
    expect(exposed).not.toContain('v=0');

    await hook.stop();
  });

  it('stops idempotently and restarts with a fresh transaction', async () => {
    const { hook, doubles } = createHook();

    await expect(hook.stop()).resolves.toEqual({ success: true, idempotent: true });
    expect(doubles.sendMessage).not.toHaveBeenCalled();

    await expect(hook.start({ targetLanguage: 'es' })).resolves.toEqual({ success: true, targetLanguage: 'es' });
    await expect(hook.stop()).resolves.toEqual({ success: true });
    expect(doubles.release).toHaveBeenCalledWith({ owner: OPENAI_SPIKE_DEV_OWNER, leaseId: 'tx-1' });

    await expect(hook.start({ targetLanguage: 'es' })).resolves.toEqual({ success: true, targetLanguage: 'es' });
    expect(doubles.acquire).toHaveBeenCalledTimes(2);
    const secondStart = doubles.sendMessage.mock.calls
      .find(([message]) => message?.action === OPENAI_SPIKE_DEV_ACTIONS.START
        && message?.data?.transactionId === 'tx-2');
    expect(secondStart).toBeDefined();

    await hook.stop();
    expect(doubles.release).toHaveBeenCalledWith({ owner: OPENAI_SPIKE_DEV_OWNER, leaseId: 'tx-2' });
  });

  it('installs the tester hook on globalThis in Background', () => {
    const installed = installOpenAISpikeDevBackgroundHook({
      chromeAPI: {},
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });

    expect(globalThis.__translateItOpenAIRealtimeSpike).toBe(installed);
    expect(typeof installed.start).toBe('function');
    expect(typeof installed.stop).toBe('function');
    expect(typeof installed.status).toBe('function');
  });

  it('keeps raw key material out of the Background dev module', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const source = await readFile(join(
      process.cwd(),
      'src/features/live-dubbing/spikes/openai/spikeDevBackground.js',
    ), 'utf8');

    expect(source).toContain('OpenAIRealtimeBootstrapService');
    expect(source).toContain('__translateItOpenAIRealtimeSpike');
    expect(source).toContain('tabCapture');
    for (const forbidden of ['OPENAI_API_KEY', 'ApiKeyManager']) {
      expect(source).not.toContain(forbidden);
    }
  });
});
