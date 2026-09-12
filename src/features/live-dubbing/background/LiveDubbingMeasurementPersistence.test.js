import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveDubbingCoordinator } from './LiveDubbingCoordinator.js';
import {
  LIVE_DUBBING_MEASUREMENT_HISTORY_KEY,
  LIVE_DUBBING_MEASUREMENT_HISTORY_LIMIT,
  LIVE_DUBBING_OWNER,
  LIVE_DUBBING_STATUS,
} from '../constants.js';
import {
  createLiveDubbingMeasurementSummary,
  sanitizeLiveDubbingMeasurementSummary,
} from '../contracts.js';

const EXPECTED_MEASUREMENT_KEYS = [
  'variant',
  'runDurationMs',
  'inputFrameSamples',
  'inputFrameDurationMs',
  'inputFrames',
  'inputSentFrames',
  'inputPendingFrames',
  'inputQueuePeakFrames',
  'inputQueuePeakMs',
  'inputDroppedDurationMs',
  'inputBackpressureEvents',
  'sendFailures',
  'wsBufferedAmountPeak',
  'translatedAudioChunks',
  'outputQueuePeakMs',
  'outputSafetyDrops',
  'underruns',
  'underrunSamples',
  'underrunDurationMs',
  'interruptions',
  'firstInputToFirstTranslatedAudioMs',
  'firstInputToPlaybackAcceptedMs',
  'terminalCategory',
  'playbackAccepted',
];

const MEASUREMENT_PREFIX = 'LIVE_DUBBING_MEASUREMENT ';
const MEASUREMENTS_PREFIX = 'LIVE_DUBBING_MEASUREMENTS ';

function baseSummary(overrides = {}) {
  return {
    variant: '100ms',
    runDurationMs: 120_000,
    inputFrameSamples: 1_600,
    inputFrameDurationMs: 100,
    inputFrames: 1_200,
    inputSentFrames: 1_190,
    inputPendingFrames: 2,
    inputQueuePeakFrames: 5,
    inputQueuePeakMs: 500,
    inputDroppedDurationMs: 0,
    inputBackpressureEvents: 1,
    sendFailures: 0,
    wsBufferedAmountPeak: 4_096,
    translatedAudioChunks: 37,
    outputQueuePeakMs: 400,
    outputSafetyDrops: 0,
    underruns: 2,
    underrunSamples: 4_800,
    underrunDurationMs: 200,
    interruptions: 1,
    firstInputToFirstTranslatedAudioMs: 250,
    firstInputToPlaybackAcceptedMs: 280,
    terminalCategory: 'PROVIDER_CLOSED',
    playbackAccepted: true,
    ...overrides,
  };
}

function createStorageBackend(preset = {}) {
  const store = new Map(Object.entries(preset));
  const session = {
    get: vi.fn(async key => ({ [key]: store.get(key) })),
    set: vi.fn(async record => {
      for (const [key, value] of Object.entries(record)) store.set(key, value);
    }),
    remove: vi.fn(async key => {
      store.delete(key);
    }),
  };
  const local = {
    get: vi.fn(async () => ({})),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
  return { store, session, local };
}

function createHarness({ backend = createStorageBackend(), disposeSummary = null, streamId = 'stream-secret' } = {}) {
  const calls = [];
  const logger = { info: vi.fn(), warn: vi.fn() };
  const manager = {
    activeLeases: [],
    acquire: vi.fn(async lease => {
      calls.push(['acquire', lease]);
      manager.activeLeases = [lease];
      return true;
    }),
    release: vi.fn(async lease => {
      calls.push(['release', lease]);
      manager.activeLeases = manager.activeLeases.filter(item => item.leaseId !== lease.leaseId);
      return true;
    }),
    ensureDocument: vi.fn(),
    getSnapshot: vi.fn(() => ({ documentExists: true, activeLeases: manager.activeLeases })),
  };
  const sendMessage = vi.fn(async message => {
    calls.push(['message', message]);
    if (message.action === 'LIVE_DUBBING_PREPARE') {
      return {
        success: true,
        ack: 'READY',
        sessionId: message.data.sessionId,
        eventSequence: message.data.eventSequence,
      };
    }
    if (message.action === 'LIVE_DUBBING_CONSUME') {
      return {
        success: true,
        ack: 'MEDIA_ACQUIRED',
        sessionId: message.data.sessionId,
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        eventSequence: message.data.eventSequence,
        captureReady: true,
        inputPipelineReady: true,
        outputPipelineReady: true,
      };
    }
    if (message.action === 'LIVE_DUBBING_CONNECT_PROVIDER') {
      return {
        success: true,
        ack: 'PROVIDER_READY',
        sessionId: message.data.sessionId,
        status: LIVE_DUBBING_STATUS.RUNNING,
        eventSequence: message.data.eventSequence + 1,
        captureReady: true,
        inputPipelineReady: true,
        outputPipelineReady: true,
        setupComplete: true,
      };
    }
    if (message.action === 'LIVE_DUBBING_DISPOSE') {
      return {
        success: true,
        ack: 'DISPOSED',
        sessionId: message.data.sessionId,
        ...(disposeSummary ? { measurementSummary: disposeSummary } : {}),
      };
    }
    if (message.action === 'LIVE_DUBBING_STATUS') {
      return { success: true, active: false, sessionId: message.data.sessionId };
    }
    return { success: true };
  });
  const browserAPI = {
    runtime: {
      id: 'extension-id',
      getURL: (path = '') => `chrome-extension://extension-id/${path}`,
      sendMessage,
    },
    storage: {
      session: backend.session,
      local: backend.local,
    },
    tabs: {
      query: vi.fn(async () => [{ id: 42, url: 'https://example.test' }]),
      get: vi.fn(async id => ({ id, url: 'https://example.test' })),
    },
  };
  const chromeAPI = {
    tabCapture: {
      getMediaStreamId: vi.fn(async () => streamId),
    },
  };

  return {
    backend,
    calls,
    manager,
    browserAPI,
    chromeAPI,
    logger,
    coordinator: new LiveDubbingCoordinator({
      browserAPI,
      chromeAPI,
      leaseManager: manager,
      uuid: () => 'session-1',
      now: () => 123,
      logger,
    }),
  };
}

function measurementLogLines(logger) {
  return logger.info.mock.calls
    .map(([line]) => line)
    .filter(line => typeof line === 'string' && line.startsWith(MEASUREMENT_PREFIX));
}

describe('live dubbing measurement persistence/export (Stage 3)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('sanitizes summaries to the exact scalar allowlist and drops unknowns', () => {
    const dto = sanitizeLiveDubbingMeasurementSummary(baseSummary());
    expect(Object.keys(dto).sort()).toEqual([...EXPECTED_MEASUREMENT_KEYS].sort());
    expect(dto).toMatchObject({
      variant: '100ms',
      runDurationMs: 120_000,
      inputFrameSamples: 1_600,
      terminalCategory: 'PROVIDER_CLOSED',
      playbackAccepted: true,
    });

    const injected = sanitizeLiveDubbingMeasurementSummary({
      ...baseSummary(),
      sessionId: 'session-secret',
      tabId: 42,
      streamId: 'stream-secret',
      apiKey: 'secret-key-value',
      key: 'secret-key-value',
      credential: 'credential-secret',
      url: 'wss://example.test/secret',
      pcm: 'AQIDBA==',
      base64: 'QUJDRA==',
      transcript: 'private transcript words',
      source: { text: 'secret-source' },
      rawError: new Error('secret-error'),
      provider: { name: 'evil' },
      nested: { depth: { value: 1 } },
      error: { message: 'boom-secret' },
    });
    expect(Object.keys(injected).sort()).toEqual([...EXPECTED_MEASUREMENT_KEYS].sort());
    const serialized = JSON.stringify(injected);
    for (const secret of [
      'session-secret',
      'stream-secret',
      'secret-key-value',
      'credential-secret',
      'example.test',
      'AQIDBA==',
      'QUJDRA==',
      'private transcript',
      'secret-source',
      'secret-error',
      'boom-secret',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(injected).not.toHaveProperty('sessionId');
    expect(injected).not.toHaveProperty('tabId');
    expect(injected).not.toHaveProperty('streamId');
    expect(injected).not.toHaveProperty('nested');
    expect(injected).not.toHaveProperty('error');
  });

  it('fails closed for non-measurable candidates and coerces unsafe scalars', () => {
    for (const bad of [
      null,
      undefined,
      42,
      'invalid',
      [],
      new Error('nope'),
      {},
      { variant: '200ms', inputFrameSamples: 1_600 },
      { variant: '100ms', inputFrameSamples: 800 },
      { variant: '100ms ', inputFrameSamples: 1_600 },
    ]) {
      expect(sanitizeLiveDubbingMeasurementSummary(bad)).toBeNull();
      expect(createLiveDubbingMeasurementSummary(bad)).toBeNull();
    }

    expect(createLiveDubbingMeasurementSummary({
      ...baseSummary(),
      inputFrames: -3,
      inputSentFrames: 1.5,
      inputQueuePeakMs: Number.NaN,
      wsBufferedAmountPeak: Number.POSITIVE_INFINITY,
      runDurationMs: -1,
      firstInputToFirstTranslatedAudioMs: Number.NaN,
      firstInputToPlaybackAcceptedMs: undefined,
      terminalCategory: 'bad/category',
      playbackAccepted: 'true',
    })).toEqual({
      ...baseSummary(),
      inputFrames: 0,
      inputSentFrames: 0,
      inputQueuePeakMs: 0,
      wsBufferedAmountPeak: 0,
      runDurationMs: null,
      firstInputToFirstTranslatedAudioMs: null,
      firstInputToPlaybackAcceptedMs: null,
      terminalCategory: null,
      playbackAccepted: false,
    });
  });

  it('persists the dispose-ack summary before lease release with one canonical log line', async () => {
    const summary = baseSummary();
    const harness = createHarness({ disposeSummary: summary });

    const started = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    expect(started.success).toBe(true);
    const stopped = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });
    expect(stopped).toMatchObject({ success: true, stopped: true });

    const stored = harness.backend.store.get(LIVE_DUBBING_MEASUREMENT_HISTORY_KEY);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(sanitizeLiveDubbingMeasurementSummary(summary));
    expect(JSON.stringify(stored)).not.toContain('session-1');

    const sendOrders = harness.browserAPI.runtime.sendMessage.mock.invocationCallOrder;
    const sendCalls = harness.browserAPI.runtime.sendMessage.mock.calls;
    const disposeIndex = sendCalls.findIndex(([message]) => message.action === 'LIVE_DUBBING_DISPOSE');
    expect(disposeIndex).toBeGreaterThanOrEqual(0);

    const setCalls = harness.backend.session.set.mock.calls;
    const setOrders = harness.backend.session.set.mock.invocationCallOrder;
    const measureIndex = setCalls.findIndex(
      ([record]) => record && Object.prototype.hasOwnProperty.call(record, LIVE_DUBBING_MEASUREMENT_HISTORY_KEY),
    );
    expect(measureIndex).toBeGreaterThanOrEqual(0);
    expect(sendOrders[disposeIndex]).toBeLessThan(setOrders[measureIndex]);
    expect(setOrders[measureIndex])
      .toBeLessThan(harness.manager.release.mock.invocationCallOrder[0]);
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'session-1',
    });

    // Exactly one single-string canonical log, no pretty print, no object args.
    expect(harness.logger.info).toHaveBeenCalledTimes(1);
    const [line] = harness.logger.info.mock.calls[0];
    expect(typeof line).toBe('string');
    expect(line).toBe(`${MEASUREMENT_PREFIX}${JSON.stringify(stored[0])}`);
    expect(line).not.toContain('\n');

    // storage.local is never touched.
    expect(harness.backend.local.get).not.toHaveBeenCalled();
    expect(harness.backend.local.set).not.toHaveBeenCalled();
    expect(harness.backend.local.remove).not.toHaveBeenCalled();
  });

  it('records exactly once across duplicate terminal/dispose/stale messages', async () => {
    const harness = createHarness({ disposeSummary: baseSummary({ runDurationMs: 7 }) });
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const sender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    };
    const terminal = { data: { sessionId: 'session-1', event: 'TRACK_ENDED' } };

    await expect(harness.coordinator.handleOffscreenTerminal(terminal, sender))
      .resolves.toMatchObject({ success: true, stopped: true });
    await expect(harness.coordinator.handleOffscreenTerminal(terminal, sender))
      .resolves.toMatchObject({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    await expect(harness.coordinator._recordMeasurementSummary('session-1', baseSummary()))
      .resolves.toBe(false);
    await expect(harness.coordinator.stop({ data: { sessionId: 'session-1' } }))
      .resolves.toMatchObject({ success: true, stopped: false, idempotent: true });
    await harness.coordinator.handleOffscreenTerminal(
      { data: { sessionId: 'session-1', event: 'TRACK_ENDED' } },
    );
    await expect(harness.coordinator.handleOffscreenTerminal(
      { data: { sessionId: 'other-session', event: 'TRACK_ENDED' } },
      sender,
    )).resolves.toMatchObject({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });

    const stored = harness.backend.store.get(LIVE_DUBBING_MEASUREMENT_HISTORY_KEY);
    expect(stored).toHaveLength(1);
    expect(stored[0].runDurationMs).toBe(7);
    expect(measurementLogLines(harness.logger)).toHaveLength(1);
    expect(harness.manager.release).toHaveBeenCalledTimes(1);
  });

  it('bounds history to 20 entries, dropping the oldest', async () => {
    const harness = createHarness();
    for (let index = 0; index < 21; index += 1) {
       
      await expect(harness.coordinator._recordMeasurementSummary(
        `session-${index}`,
        baseSummary({ runDurationMs: index }),
      )).resolves.toBe(true);
    }

    const stored = harness.backend.store.get(LIVE_DUBBING_MEASUREMENT_HISTORY_KEY);
    expect(LIVE_DUBBING_MEASUREMENT_HISTORY_LIMIT).toBe(20);
    expect(stored).toHaveLength(20);
    expect(stored[0].runDurationMs).toBe(1);
    expect(stored[19].runDurationMs).toBe(20);

    const result = await harness.coordinator.getMeasurements();
    expect(result).toEqual({ success: true, measurements: stored });
    expect(result.measurements.map(entry => entry.runDurationMs)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });

  it('reconstructs history in a fresh instance from storage.session', async () => {
    const backend = createStorageBackend();
    const first = createHarness({ backend });
    await first.coordinator._recordMeasurementSummary('session-a', baseSummary({ runDurationMs: 1 }));
    await first.coordinator._recordMeasurementSummary('session-b', baseSummary({ runDurationMs: 2 }));

    const second = createHarness({ backend });
    expect(second.coordinator.recordedMeasurementSessions.size).toBe(0);
    const result = await second.coordinator.getMeasurements();
    expect(result.success).toBe(true);
    expect(result.measurements).toHaveLength(2);
    expect(result.measurements.map(entry => entry.runDurationMs)).toEqual([1, 2]);
  });

  it('recovers safely from corrupt measurement storage', async () => {
    for (const corrupt of [null, {}, 'invalid', 42, true]) {
      const harness = createHarness({
        backend: createStorageBackend({ [LIVE_DUBBING_MEASUREMENT_HISTORY_KEY]: corrupt }),
      });
       
      await expect(harness.coordinator.getMeasurements()).resolves.toEqual({
        success: true,
        measurements: [],
      });
    }

    const malformed = createHarness({
      backend: createStorageBackend({
        [LIVE_DUBBING_MEASUREMENT_HISTORY_KEY]: [
          null,
          42,
          'nope',
          { variant: 'bogus', inputFrameSamples: 1_600 },
          { variant: '100ms', inputFrameSamples: 999 },
          baseSummary({ runDurationMs: 9 }),
        ],
      }),
    });
    const subset = await malformed.coordinator.getMeasurements();
    expect(subset.measurements).toHaveLength(1);
    expect(subset.measurements[0].runDurationMs).toBe(9);

    const failing = createHarness();
    failing.backend.session.get.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(failing.coordinator.getMeasurements()).resolves.toEqual({
      success: true,
      measurements: [],
    });
    await expect(failing.coordinator.clearMeasurements()).resolves.toEqual({
      success: true,
      cleared: true,
    });
  });

  it('never persists or exports session identity, secrets, or nested payloads', async () => {
    const harness = createHarness();
    const accepted = await harness.coordinator._recordMeasurementSummary('ephemeral-session-9', {
      ...baseSummary(),
      sessionId: 'session-secret',
      tabId: 7,
      streamId: 'stream-secret',
      apiKey: 'secret-key-value',
      key: 'secret-key-value',
      credential: 'credential-secret',
      token: 'token-secret',
      url: 'wss://example.test/secret-path',
      pcm: 'AQIDBAUGBwg=',
      base64: 'QUJDREVG',
      transcript: 'private transcript words',
      source: { text: 'secret-source' },
      rawError: new Error('secret-error'),
      rawProvider: { body: 'secret-body' },
      nested: { depth: [1, 2, 3] },
      error: { message: 'boom-secret' },
    });
    expect(accepted).toBe(true);

    const { measurements } = await harness.coordinator.getMeasurements();
    expect(measurements).toHaveLength(1);
    expect(Object.keys(measurements[0]).sort()).toEqual([...EXPECTED_MEASUREMENT_KEYS].sort());

    const serializedStorage = JSON.stringify([...harness.backend.store.values()]);
    const [logLine] = measurementLogLines(harness.logger);
    for (const secret of [
      'ephemeral-session-9',
      'session-secret',
      'stream-secret',
      'secret-key-value',
      'credential-secret',
      'token-secret',
      'example.test',
      'AQIDBAUGBwg=',
      'QUJDREVG',
      'private transcript',
      'secret-source',
      'secret-error',
      'secret-body',
      'boom-secret',
    ]) {
      expect(serializedStorage).not.toContain(secret);
      expect(logLine).not.toContain(secret);
    }
    expect(JSON.parse(logLine.slice(MEASUREMENT_PREFIX.length))).toEqual(measurements[0]);
  });

  it('rejects non-measurable summaries without persisting or logging', async () => {
    const harness = createHarness();
    for (const bad of [
      null,
      'invalid',
      [],
      { variant: '200ms', inputFrameSamples: 1_600 },
      { variant: '100ms', inputFrameSamples: 800 },
    ]) {
       
      await expect(harness.coordinator._recordMeasurementSummary('session-bad', bad)).resolves.toBe(false);
    }
    expect(harness.backend.store.has(LIVE_DUBBING_MEASUREMENT_HISTORY_KEY)).toBe(false);
    expect(harness.logger.info).not.toHaveBeenCalled();
  });

  it('keeps Stop/cleanup semantics when measurement storage fails', async () => {
    const harness = createHarness({ disposeSummary: baseSummary() });
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    harness.backend.session.set.mockImplementation(async record => {
      if (record && Object.prototype.hasOwnProperty.call(record, LIVE_DUBBING_MEASUREMENT_HISTORY_KEY)) {
        throw new Error('measurement quota exceeded');
      }
      for (const [key, value] of Object.entries(record)) harness.backend.store.set(key, value);
    });

    const stopped = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });
    expect(stopped).toMatchObject({ success: true, stopped: true });
    expect(harness.manager.release).toHaveBeenCalledOnce();
    expect(measurementLogLines(harness.logger)).toHaveLength(1);

    const clearing = createHarness();
    clearing.backend.session.remove.mockRejectedValue(new Error('remove failed'));
    clearing.backend.session.set.mockRejectedValue(new Error('set failed'));
    await expect(clearing.coordinator.clearMeasurements()).resolves.toEqual({
      success: true,
      cleared: true,
    });
  });

  it('emits one copy-friendly single-line log per GET call', async () => {
    const harness = createHarness();
    await harness.coordinator._recordMeasurementSummary('session-a', baseSummary({ runDurationMs: 1 }));
    await harness.coordinator._recordMeasurementSummary('session-b', baseSummary({ runDurationMs: 2 }));
    harness.logger.info.mockClear();

    const result = await harness.coordinator.getMeasurements();
    expect(result.success).toBe(true);
    expect(result.measurements.map(entry => entry.runDurationMs)).toEqual([1, 2]);

    expect(harness.logger.info).toHaveBeenCalledTimes(1);
    const [line] = harness.logger.info.mock.calls[0];
    expect(typeof line).toBe('string');
    expect(line).toBe(`${MEASUREMENTS_PREFIX}${JSON.stringify(result.measurements)}`);
    expect(line).not.toContain('\n');
    expect(JSON.parse(line.slice(MEASUREMENTS_PREFIX.length))).toEqual(result.measurements);
    for (const call of harness.logger.info.mock.calls) {
      expect(call).toHaveLength(1);
      expect(typeof call[0]).toBe('string');
    }
  });

  it('clears persisted history while keeping newest-session semantics intact', async () => {
    const harness = createHarness();
    await harness.coordinator._recordMeasurementSummary('session-a', baseSummary());
    await expect(harness.coordinator.clearMeasurements()).resolves.toEqual({
      success: true,
      cleared: true,
    });
    await expect(harness.coordinator.getMeasurements()).resolves.toEqual({
      success: true,
      measurements: [],
    });
  });
});

describe('live dubbing measurement action authorization', () => {
  beforeEach(() => {
    vi.stubGlobal('__BROWSER__', 'chrome');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['popup', { id: 'extension-id', url: 'chrome-extension://extension-id/src/html/popup.html' }],
    ['sidepanel', { id: 'extension-id', url: 'chrome-extension://extension-id/src/html/sidepanel.html' }],
    ['options', { id: 'extension-id', url: 'chrome-extension://extension-id/src/html/options.html' }],
    // Trusted extension pages opened in a normal browser tab carry
    // sender.tab; the exact UI document path still authorizes.
    ['options tab-bound', { id: 'extension-id', url: 'chrome-extension://extension-id/src/html/options.html', tab: { id: 42 } }],
    ['sidepanel tab-bound', { id: 'extension-id', url: 'chrome-extension://extension-id/src/html/sidepanel.html', tab: { id: 7 } }],
    ['popup tab-bound', { id: 'extension-id', url: 'chrome-extension://extension-id/src/html/popup.html', tab: { id: 9 } }],
  ])('delegates %s UI senders to the coordinator', async (name, sender) => {
    const { handleLiveDubbingClearMeasurements, handleLiveDubbingGetMeasurements } = await import('./handlers.js');
    const { liveDubbingCoordinator } = await import('./LiveDubbingCoordinator.js');
    const { default: browser } = await import('webextension-polyfill');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    const get = vi.spyOn(liveDubbingCoordinator, 'getMeasurements')
      .mockResolvedValue({ success: true, measurements: [] });
    const clear = vi.spyOn(liveDubbingCoordinator, 'clearMeasurements')
      .mockResolvedValue({ success: true, cleared: true });

    await expect(handleLiveDubbingGetMeasurements({}, sender))
      .resolves.toEqual({ success: true, measurements: [] });
    await expect(handleLiveDubbingClearMeasurements({}, sender))
      .resolves.toEqual({ success: true, cleared: true });
    expect(get).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
  });

  it.each([
    ['content-script tab-bound', { id: 'extension-id', url: 'https://example.test/page', tab: { id: 42 } }],
    ['wrong runtime id', { id: 'other-extension', url: 'https://example.test/page', tab: { id: 42 } }],
    ['external origin', { id: 'extension-id', url: 'https://example.test/page' }],
    ['arbitrary extension page tab-bound', { id: 'extension-id', url: 'chrome-extension://extension-id/src/html/other.html', tab: { id: 42 } }],
    ['offscreen document', { id: 'extension-id', url: 'chrome-extension://extension-id/src/html/offscreen.html' }],
    ['missing url', { id: 'extension-id' }],
    ['missing sender', undefined],
  ])('rejects %s senders without reaching the coordinator', async (name, sender) => {
    const { handleLiveDubbingClearMeasurements, handleLiveDubbingGetMeasurements } = await import('./handlers.js');
    const { liveDubbingCoordinator } = await import('./LiveDubbingCoordinator.js');
    const { default: browser } = await import('webextension-polyfill');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    const get = vi.spyOn(liveDubbingCoordinator, 'getMeasurements');
    const clear = vi.spyOn(liveDubbingCoordinator, 'clearMeasurements');

    // Rejections are synchronous plain-object returns, matching existing
    // start/stop/status handler behavior.
    expect(handleLiveDubbingGetMeasurements({}, sender))
      .toEqual({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    expect(handleLiveDubbingClearMeasurements({}, sender))
      .toEqual({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    expect(get).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('returns unsupported for measurement actions outside Chrome runtimes', async () => {
    vi.stubGlobal('__BROWSER__', 'firefox');
    const { handleLiveDubbingClearMeasurements, handleLiveDubbingGetMeasurements } = await import('./handlers.js');
    const { liveDubbingCoordinator } = await import('./LiveDubbingCoordinator.js');
    const get = vi.spyOn(liveDubbingCoordinator, 'getMeasurements');
    const clear = vi.spyOn(liveDubbingCoordinator, 'clearMeasurements');
    const sender = { id: 'extension-id', url: 'chrome-extension://extension-id/src/html/popup.html' };

    expect(handleLiveDubbingGetMeasurements({}, sender))
      .toEqual({ success: false, error: 'LIVE_DUBBING_UNSUPPORTED' });
    expect(handleLiveDubbingClearMeasurements({}, sender))
      .toEqual({ success: false, error: 'LIVE_DUBBING_UNSUPPORTED' });
    expect(get).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});
