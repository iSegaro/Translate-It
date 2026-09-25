import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OpenAISpikeDevOffscreenHandler,
  installOpenAISpikeDevOffscreenListener,
} from './spikeDevOffscreen.js';
import { OPENAI_SPIKE_DEV_ACTIONS, OPENAI_SPIKE_DEV_TARGET } from './spikeDevContract.js';

const BOOTSTRAP = { secret: 'ek_test_secret', targetLanguage: 'es', model: 'gpt-realtime-translate' };

function createTrack(overrides = {}) {
  return { kind: 'audio', readyState: 'live', stop: vi.fn(), ...overrides };
}

function createStream(tracks) {
  const list = tracks ?? [createTrack()];
  return { getTracks: vi.fn(() => list), getAudioTracks: vi.fn(() => list) };
}

function startMessage(overrides = {}) {
  return {
    target: OPENAI_SPIKE_DEV_TARGET,
    action: OPENAI_SPIKE_DEV_ACTIONS.START,
    data: {
      transactionId: 'tx-1',
      targetLanguage: 'es',
      streamId: 'stream-secret-1',
      bootstrap: { ...BOOTSTRAP },
    },
    ...overrides,
  };
}

function createTransportDouble(startImpl) {
  return {
    start: vi.fn(startImpl || (async (input) => ({ success: true, targetLanguage: input?.targetLanguage || 'es' }))),
    dispose: vi.fn(async () => ({ success: true })),
    getTelemetry: vi.fn(() => ({ offerCreated: true, transcriptEvents: 0 })),
  };
}

function createHandler({ consumeImpl, transport, isAuthorizedSender } = {}) {
  const adopted = transport || createTransportDouble();
  const handler = new OpenAISpikeDevOffscreenHandler({
    getUserMedia: consumeImpl,
    transport: adopted,
    isAuthorizedSender: isAuthorizedSender || (() => true),
    logger: { debug: () => {}, warn: () => {}, error: () => {} },
  });
  return { handler, transport: adopted };
}

describe('OpenAISpikeDevOffscreenHandler (SPIKE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('consumes first, then runs the transport on the consumed stream', async () => {
    const stream = createStream();
    const getUserMedia = vi.fn(async () => stream);
    const { handler, transport } = createHandler({ consumeImpl: getUserMedia });

    const ack = await handler.handleDevMessage(startMessage(), {});

    expect(getUserMedia).toHaveBeenCalledOnce();
    const constraints = getUserMedia.mock.calls[0][0];
    expect(constraints.audio.mandatory.chromeMediaSourceId).toBe('stream-secret-1');
    expect(transport.start).toHaveBeenCalledOnce();
    const input = transport.start.mock.calls[0][0];
    expect(input.sourceStream).toBe(stream);
    expect(input).not.toHaveProperty('streamId');
    expect(input.bootstrap).toEqual(BOOTSTRAP);
    expect(ack).toEqual({ success: true, transactionId: 'tx-1', targetLanguage: 'es' });
  });

  it('rejects unauthenticated, malformed, and mistargeted messages', async () => {
    const { handler, transport } = createHandler({ isAuthorizedSender: () => false });
    await expect(handler.handleDevMessage(startMessage(), {}))
      .resolves.toEqual({ success: false, error: 'UNAUTHORIZED' });
    expect(transport.start).not.toHaveBeenCalled();

    const open = createHandler().handler;
    await expect(open.handleDevMessage({ target: OPENAI_SPIKE_DEV_TARGET, action: 'NOPE' }, {}))
      .resolves.toBeNull();
    await expect(open.handleDevMessage({ target: 'offscreen', action: OPENAI_SPIKE_DEV_ACTIONS.START }, {}))
      .resolves.toBeNull();
    await expect(open.handleDevMessage(startMessage({ data: null }), {}))
      .resolves.toEqual({ success: false, error: 'INVALID_START' });
    await expect(open.handleDevMessage(startMessage({
      data: { transactionId: 'tx-1', targetLanguage: '!!', streamId: 's', bootstrap: { ...BOOTSTRAP } },
    }), {})).resolves.toEqual({ success: false, transactionId: 'tx-1', error: 'INVALID_TARGET_LANGUAGE' });
    await expect(open.handleDevMessage(startMessage({
      data: {
        transactionId: 'tx-1',
        targetLanguage: 'es',
        streamId: 's',
        bootstrap: { ...BOOTSTRAP, targetLanguage: 'fr' },
      },
    }), {})).resolves.toEqual({ success: false, transactionId: 'tx-1', error: 'LANGUAGE_MISMATCH' });
  });

  it('fences a concurrent START while busy', async () => {
    let resolveConsume;
    const { handler, transport } = createHandler({
      consumeImpl: () => new Promise((resolve) => { resolveConsume = resolve; }),
    });

    const first = handler.handleDevMessage(startMessage(), {});
    await vi.waitFor(() => expect(handler.pending).not.toBeNull());
    await expect(handler.handleDevMessage(startMessage(), {}))
      .resolves.toEqual({ success: false, transactionId: 'tx-1', error: 'ALREADY_STARTED' });

    resolveConsume(createStream());
    await expect(first).resolves.toMatchObject({ success: true });
    await expect(handler.handleDevMessage(startMessage(), {}))
      .resolves.toEqual({ success: false, transactionId: 'tx-1', error: 'ALREADY_STARTED' });
    expect(transport.start).toHaveBeenCalledOnce();
  });

  it('fails consume without touching the transport', async () => {
    const { handler, transport } = createHandler({
      consumeImpl: vi.fn(async () => { throw Object.assign(new Error('denied'), { code: 'NOT_ALLOWED' }); }),
    });

    await expect(handler.handleDevMessage(startMessage(), {}))
      .resolves.toEqual({ success: false, transactionId: 'tx-1', error: 'NOT_ALLOWED' });
    expect(transport.start).not.toHaveBeenCalled();

    const missing = new OpenAISpikeDevOffscreenHandler({
      mediaDevices: {},
      transport: createTransportDouble(),
      isAuthorizedSender: () => true,
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });
    await expect(missing.handleDevMessage(startMessage(), {}))
      .resolves.toEqual({ success: false, transactionId: 'tx-1', error: 'CAPTURE_UNAVAILABLE' });
  });

  it('stops owned tracks when the transport fails', async () => {
    const stream = createStream();
    const transport = createTransportDouble(async () => ({ success: false, error: 'SDP_EXCHANGE_FAILED' }));
    const { handler } = createHandler({ consumeImpl: async () => stream, transport });

    await expect(handler.handleDevMessage(startMessage(), {}))
      .resolves.toEqual({ success: false, transactionId: 'tx-1', error: 'SDP_EXCHANGE_FAILED' });
    expect(stream.getTracks()[0].stop).toHaveBeenCalledOnce();
  });

  it('tears down only the matching session on STOP', async () => {
    const stream = createStream();
    const { handler, transport } = createHandler({ consumeImpl: async () => stream });

    await handler.handleDevMessage(startMessage(), {});
    // Stale STOP for another transaction must not touch the live session.
    await expect(handler.handleDevMessage({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STOP,
      data: { transactionId: 'tx-STALE' },
    }, {})).resolves.toEqual({ success: true, transactionId: 'tx-STALE', ignored: true });
    expect(transport.dispose).not.toHaveBeenCalled();
    expect(stream.getTracks()[0].stop).not.toHaveBeenCalled();

    await expect(handler.handleDevMessage({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STOP,
      data: { transactionId: 'tx-1' },
    }, {})).resolves.toEqual({ success: true, transactionId: 'tx-1' });
    expect(transport.dispose).toHaveBeenCalledOnce();
    expect(stream.getTracks()[0].stop).toHaveBeenCalledOnce();

    // Unknown STOP while idle stays a quiet success.
    await expect(handler.handleDevMessage({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STOP,
      data: { transactionId: 'tx-9' },
    }, {})).resolves.toEqual({ success: true, transactionId: 'tx-9', ignored: true });
  });

  it('ignores a stale STOP during pending consume; the run still completes', async () => {
    let resolveConsume;
    const { handler, transport } = createHandler({
      consumeImpl: () => new Promise((resolve) => { resolveConsume = resolve; }),
    });

    const first = handler.handleDevMessage(startMessage(), {});
    await vi.waitFor(() => expect(handler.pending).not.toBeNull());
    // Foreign STOP is a true no-op: pending untouched, no cleanup at all.
    await expect(handler.handleDevMessage({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STOP,
      data: { transactionId: 'tx-STALE' },
    }, {})).resolves.toEqual({ success: true, transactionId: 'tx-STALE', ignored: true });
    expect(handler.pending?.transactionId).toBe('tx-1');
    expect(transport.dispose).not.toHaveBeenCalled();

    resolveConsume(createStream());
    await expect(first).resolves.toMatchObject({ success: true, transactionId: 'tx-1' });
    expect(transport.start).toHaveBeenCalledOnce();
    expect(handler.session?.transactionId).toBe('tx-1');
  });

  it('ignores a stale STOP during pending transport start; the run still completes', async () => {
    let resolveTransport;
    const transport = createTransportDouble(() => new Promise((resolve) => { resolveTransport = resolve; }));
    const { handler } = createHandler({ consumeImpl: async () => createStream(), transport });

    const first = handler.handleDevMessage(startMessage(), {});
    await vi.waitFor(() => expect(transport.start).toHaveBeenCalledOnce());
    await expect(handler.handleDevMessage({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STOP,
      data: { transactionId: 'tx-STALE' },
    }, {})).resolves.toEqual({ success: true, transactionId: 'tx-STALE', ignored: true });
    expect(handler.pending?.transactionId).toBe('tx-1');
    expect(transport.dispose).not.toHaveBeenCalled();

    resolveTransport({ success: true, targetLanguage: 'es' });
    await expect(first).resolves.toMatchObject({ success: true, transactionId: 'tx-1' });
    expect(handler.session?.transactionId).toBe('tx-1');
  });

  it('abandons a late consume on STOP without publishing', async () => {
    let resolveConsume;
    const { handler, transport } = createHandler({
      consumeImpl: () => new Promise((resolve) => { resolveConsume = resolve; }),
    });

    const first = handler.handleDevMessage(startMessage(), {});
    await vi.waitFor(() => expect(handler.pending).not.toBeNull());
    await handler.handleDevMessage({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STOP,
      data: { transactionId: 'tx-1' },
    }, {});

    const lateStream = createStream();
    resolveConsume(lateStream);
    await expect(first).resolves.toEqual({ success: false, transactionId: 'tx-1', error: 'START_CANCELLED' });
    expect(lateStream.getTracks()[0].stop).toHaveBeenCalledOnce();
    expect(transport.start).not.toHaveBeenCalled();
  });

  it('abandons a late transport completion on STOP', async () => {
    const stream = createStream();
    let resolveTransport;
    const transport = createTransportDouble(() => new Promise((resolve) => { resolveTransport = resolve; }));
    const { handler } = createHandler({ consumeImpl: async () => stream, transport });

    const first = handler.handleDevMessage(startMessage(), {});
    await vi.waitFor(() => expect(transport.start).toHaveBeenCalledOnce());
    await handler.handleDevMessage({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STOP,
      data: { transactionId: 'tx-1' },
    }, {});

    // Matching STOP fences the transport while its START is still setting
    // up, so the late completion can neither publish nor leak.
    expect(transport.dispose).toHaveBeenCalledOnce();

    resolveTransport({ success: true, targetLanguage: 'es' });
    await expect(first).resolves.toEqual({ success: false, transactionId: 'tx-1', error: 'START_CANCELLED' });
    expect(stream.getTracks()[0].stop).toHaveBeenCalledOnce();
    expect(handler.session).toBeNull();
  });

  it('answers STATUS for the current transaction only', async () => {
    const { handler } = createHandler({ consumeImpl: async () => createStream() });

    await handler.handleDevMessage(startMessage(), {});
    await expect(handler.handleDevMessage({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STATUS,
      data: { transactionId: 'tx-1' },
    }, {})).resolves.toMatchObject({
      success: true,
      transactionId: 'tx-1',
      active: true,
      targetLanguage: 'es',
      captureReady: true,
    });
    await expect(handler.handleDevMessage({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STATUS,
      data: { transactionId: 'tx-STALE' },
    }, {})).resolves.toMatchObject({ success: true, active: false, telemetry: null });
  });

  it('sanitizes poisoned transport telemetry in STATUS', async () => {
    const transport = createTransportDouble();
    transport.getTelemetry.mockReturnValue({
      offerCreated: true,
      transcriptEvents: 4,
      transcript: 'hola mundo secreto',
      secret: 'ek_live_secret',
      sdp: 'v=0\r\no=evil',
      streamId: 'stream-secret-1',
      nested: { deep: ['x'] },
      milestones: { start: 100, firstTranscriptEvent: Number.NaN, injected: 'x' },
    });
    const { handler } = createHandler({ consumeImpl: async () => createStream(), transport });

    await handler.handleDevMessage(startMessage(), {});
    const ack = await handler.handleDevMessage({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STATUS,
      data: { transactionId: 'tx-1' },
    }, {});
    expect(ack.telemetry).toEqual({
      offerCreated: true,
      answerApplied: false,
      transcriptEvents: 4,
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
    const exposed = JSON.stringify(ack);
    expect(exposed).not.toContain('hola mundo secreto');
    expect(exposed).not.toContain('ek_live_secret');
    expect(exposed).not.toContain('stream-secret-1');
    expect(exposed).not.toContain('v=0');
  });

  it('restarts with a fresh transaction after STOP', async () => {
    const firstStream = createStream();
    const secondStream = createStream();
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(firstStream)
      .mockResolvedValueOnce(secondStream);
    const { handler, transport } = createHandler({ consumeImpl: getUserMedia });

    const second = (transactionId) => startMessage({ data: {
      transactionId,
      targetLanguage: 'es',
      streamId: 'stream-2',
      bootstrap: { ...BOOTSTRAP },
    } });

    await expect(handler.handleDevMessage(startMessage(), {}))
      .resolves.toMatchObject({ success: true });
    await handler.handleDevMessage({
      target: OPENAI_SPIKE_DEV_TARGET,
      action: OPENAI_SPIKE_DEV_ACTIONS.STOP,
      data: { transactionId: 'tx-1' },
    }, {});
    await expect(handler.handleDevMessage(second('tx-2'), {}))
      .resolves.toMatchObject({ success: true, transactionId: 'tx-2' });

    expect(transport.start).toHaveBeenCalledTimes(2);
    expect(transport.start.mock.calls[1][0].sourceStream).toBe(secondStream);
    expect(firstStream.getTracks()[0].stop).toHaveBeenCalledOnce();
    expect(secondStream.getTracks()[0].stop).not.toHaveBeenCalled();
  });

  it('installs an internal listener that ignores production traffic', async () => {
    const listeners = [];
    const sendResponse = vi.fn();
    const runtime = {
      onMessage: {
        addListener: vi.fn((listener) => { listeners.push(listener); }),
        removeListener: vi.fn((listener) => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        }),
      },
    };
    const previousChrome = globalThis.chrome;
    globalThis.chrome = { ...(previousChrome || {}), runtime };
    try {
      const { installed, unsubscribe } = installOpenAISpikeDevOffscreenListener({
        getUserMedia: async () => createStream(),
        transport: createTransportDouble(),
        isAuthorizedSender: () => true,
        logger: { debug: () => {}, warn: () => {}, error: () => {} },
      });

      expect(installed).toBe(true);
      expect(listeners).toHaveLength(1);
      expect(globalThis.__translateItOpenAIRealtimeSpike).toBeUndefined();

      expect(listeners[0]({ target: 'offscreen', action: 'TTS_SPEAK' }, {}, sendResponse)).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();

      expect(listeners[0](startMessage(), {}, sendResponse)).toBe(true);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());
      expect(sendResponse.mock.calls[0][0]).toMatchObject({ success: true, transactionId: 'tx-1' });

      unsubscribe();
      expect(listeners).toHaveLength(0);
    } finally {
      if (previousChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = previousChrome;
    }
  });

  it('keeps Offscreen-side modules free of key, capture, and hook dependencies', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const offscreenSources = [
      'spikeDevOffscreen.js',
      'spikeDevContract.js',
      'OpenAIRealtimeTranslationTransport.js',
      'spikeTargetLanguage.js',
    ];

    const violations = [];
    for (const file of offscreenSources) {
      const source = await readFile(join(
        process.cwd(),
        'src/features/live-dubbing/spikes/openai',
        file,
      ), 'utf8');
      for (const forbidden of [
        'ApiKeyManager',
        'OpenAIRealtimeBootstrapService',
        'OPENAI_API_KEY',
        'mintClientSecret',
        'getKeys',
        'tabCapture',
        'getMediaStreamId',
        '__translateItOpenAIRealtimeSpike',
      ]) {
        if (source.includes(forbidden)) violations.push(`${file} contains ${forbidden}`);
      }
    }
    expect(violations).toEqual([]);

    const listenerSource = await readFile(join(
      process.cwd(),
      'src/features/live-dubbing/spikes/openai/spikeDevOffscreen.js',
    ), 'utf8');
    expect(listenerSource).toContain('OpenAIRealtimeTranslationTransport');
  });
});
