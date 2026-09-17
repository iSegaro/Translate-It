import { describe, expect, it, vi } from 'vitest';
import {
  OPENAI_REALTIME_EVENTS_CHANNEL,
  OPENAI_REALTIME_TRANSLATIONS_CALLS_ENDPOINT,
  OpenAIRealtimeProviderAdapter,
} from './OpenAIRealtimeProviderAdapter.js';

function createTrack(kind = 'audio') {
  return {
    kind,
    readyState: 'live',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    stop: vi.fn(),
  };
}

function createAudioElement(play = vi.fn(async () => {})) {
  return {
    play,
    pause: vi.fn(),
    srcObject: null,
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

class FakeDataChannel {
  constructor() {
    this.close = vi.fn(() => { this.readyState = 'closed'; });
    this.readyState = 'open';
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }
}

class FakePeerConnection {
  constructor() {
    this.channel = new FakeDataChannel();
    this.addTrack = vi.fn(() => ({ id: 'sender' }));
    this.removeTrack = vi.fn();
    this.createDataChannel = vi.fn(label => {
      this.channel.label = label;
      return this.channel;
    });
    this.createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' }));
    this.setLocalDescription = vi.fn(async description => {
      this.localDescription = description;
    });
    this.setRemoteDescription = vi.fn(async description => {
      this.remoteDescription = description;
    });
    this.close = vi.fn(() => { this.connectionState = 'closed'; });
    this.connectionState = 'connected';
    this.iceConnectionState = 'connected';
    this.localDescription = null;
    this.remoteDescription = null;
    this.ontrack = null;
    this.onconnectionstatechange = null;
    this.oniceconnectionstatechange = null;
  }
}

function createHarness({
  peerConnection = new FakePeerConnection(),
  fetchImpl = vi.fn(async () => ({ ok: true, text: async () => 'answer-sdp' })),
  audioElement = createAudioElement(),
  callbacks = {},
  setupTimeout = 100,
} = {}) {
  const audioTrack = createTrack();
  const videoTrack = createTrack('video');
  const sourceStream = {
    getAudioTracks: vi.fn(() => [audioTrack]),
    getTracks: vi.fn(() => [audioTrack, videoTrack]),
  };
  const adapter = new OpenAIRealtimeProviderAdapter({
    peerConnectionFactory: vi.fn(async () => peerConnection),
    fetchImpl,
    audioElementFactory: vi.fn(() => audioElement),
    setupTimeout,
    ...callbacks,
  });
  const connect = () => adapter.connect({
    bootstrap: { secret: 'ephemeral-client-secret' },
    targetLanguage: 'en-US',
    sourceStream,
  });
  return {
    adapter,
    peerConnection,
    fetchImpl,
    audioElement,
    audioTrack,
    videoTrack,
    sourceStream,
    connect,
  };
}

describe('OpenAIRealtimeProviderAdapter', () => {
  it('completes WebRTC SDP setup and attaches only source audio tracks', async () => {
    const onSetupComplete = vi.fn();
    const harness = createHarness({ callbacks: { onSetupComplete } });

    await expect(harness.connect()).resolves.toBeUndefined();

    expect(harness.peerConnection.createDataChannel).toHaveBeenCalledWith(OPENAI_REALTIME_EVENTS_CHANNEL);
    expect(harness.peerConnection.addTrack).toHaveBeenCalledOnce();
    expect(harness.peerConnection.addTrack).toHaveBeenCalledWith(
      harness.audioTrack,
      harness.sourceStream,
    );
    expect(harness.peerConnection.addTrack).not.toHaveBeenCalledWith(
      harness.videoTrack,
      harness.sourceStream,
    );
    expect(harness.fetchImpl).toHaveBeenCalledWith(OPENAI_REALTIME_TRANSLATIONS_CALLS_ENDPOINT, expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer ephemeral-client-secret',
        'Content-Type': 'application/sdp',
      },
      body: 'offer-sdp',
    }));
    expect(harness.fetchImpl.mock.calls[0][1].signal).toBeDefined();
    expect(harness.peerConnection.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'answer-sdp',
    });
    expect(onSetupComplete).toHaveBeenCalledOnce();
    expect(harness.adapter.getTelemetry()).toMatchObject({
      offerCreated: true,
      answerApplied: true,
    });
  });

  it('plays remote translated audio and accepts playback only after play resolves', async () => {
    let resolvePlay;
    const play = vi.fn(() => new Promise(resolve => { resolvePlay = resolve; }));
    const onPlaybackAccepted = vi.fn();
    const harness = createHarness({
      audioElement: createAudioElement(play),
      callbacks: { onPlaybackAccepted },
    });
    await harness.connect();

    const remoteTrack = createTrack();
    const remoteStream = { id: 'remote-stream' };
    harness.peerConnection.ontrack({ track: remoteTrack, streams: [remoteStream] });

    expect(harness.audioElement.srcObject).toBe(remoteStream);
    expect(play).toHaveBeenCalledOnce();
    expect(onPlaybackAccepted).not.toHaveBeenCalled();

    resolvePlay();
    await Promise.resolve();
    expect(onPlaybackAccepted).toHaveBeenCalledOnce();
    expect(onPlaybackAccepted).toHaveBeenCalledWith({ accepted: true });

    harness.peerConnection.ontrack({ track: remoteTrack, streams: [remoteStream] });
    resolvePlay();
    await Promise.resolve();
    expect(onPlaybackAccepted).toHaveBeenCalledOnce();
  });

  it('counts transcript events as scalar telemetry without retaining text', async () => {
    const harness = createHarness();
    await harness.connect();

    harness.peerConnection.channel.onmessage({
      data: JSON.stringify({ type: 'response.output_transcript.delta', delta: 'private text' }),
    });
    harness.peerConnection.channel.onmessage({ data: JSON.stringify({ type: 'audio.delta' }) });

    const telemetry = harness.adapter.getTelemetry();
    expect(telemetry.transcriptEvents).toBe(1);
    expect(JSON.stringify(telemetry)).not.toContain('private text');
  });

  it('fails bounded setup when SDP succeeds but the peer stays connecting', async () => {
    const onError = vi.fn();
    const harness = createHarness({ setupTimeout: 40, callbacks: { onError } });
    harness.peerConnection.connectionState = 'connecting';
    harness.peerConnection.iceConnectionState = 'checking';
    harness.peerConnection.channel.readyState = 'connecting';

    await expect(harness.connect()).rejects.toMatchObject({ code: 'OPENAI_REALTIME_SETUP_TIMEOUT' });
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'OPENAI_REALTIME_SETUP_TIMEOUT',
    }));
    expect(harness.peerConnection.close).toHaveBeenCalledOnce();
    expect(harness.peerConnection.channel.close).toHaveBeenCalledOnce();
    expect(harness.audioTrack.stop).not.toHaveBeenCalled();
    expect(harness.adapter.active).toBe(false);
  });

  it('requires the events channel itself, not just a connected peer, for viability', async () => {
    const onError = vi.fn();
    const harness = createHarness({ setupTimeout: 40, callbacks: { onError } });
    harness.peerConnection.channel.readyState = 'connecting';

    await expect(harness.connect()).rejects.toMatchObject({ code: 'OPENAI_REALTIME_SETUP_TIMEOUT' });
    expect(onError).toHaveBeenCalledOnce();
    expect(harness.peerConnection.close).toHaveBeenCalledOnce();
    expect(harness.audioTrack.stop).not.toHaveBeenCalled();
  });

  it('terminalizes immediately on non-viable ICE during setup without waiting out the watchdog', async () => {
    const onError = vi.fn();
    let resolveAnswer;
    const fetchImpl = vi.fn(() => new Promise(resolve => { resolveAnswer = resolve; }));
    const harness = createHarness({ fetchImpl, setupTimeout: 500, callbacks: { onError } });
    harness.peerConnection.channel.readyState = 'connecting';
    const connect = harness.connect();
    while (!fetchImpl.mock.calls.length) await Promise.resolve();
    resolveAnswer({ ok: true, text: async () => 'answer-sdp' });
    await new Promise(resolve => setTimeout(resolve, 0));

    harness.peerConnection.iceConnectionState = 'failed';
    harness.peerConnection.oniceconnectionstatechange();

    await expect(connect).rejects.toMatchObject({ code: 'OPENAI_REALTIME_SETUP_CANCELLED' });
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'OPENAI_REALTIME_PROVIDER_UNAVAILABLE',
    }));
    expect(harness.peerConnection.close).toHaveBeenCalledOnce();
    expect(harness.audioTrack.stop).not.toHaveBeenCalled();
  });

  it('resolves setup when the channel opens late and cancels the watchdog', async () => {
    const onError = vi.fn();
    const onSetupComplete = vi.fn();
    const harness = createHarness({ setupTimeout: 60, callbacks: { onError, onSetupComplete } });
    harness.peerConnection.channel.readyState = 'connecting';
    const connect = harness.connect();
    await new Promise(resolve => setTimeout(resolve, 10));
    harness.peerConnection.channel.readyState = 'open';
    harness.peerConnection.channel.onopen?.();

    await expect(connect).resolves.toBeUndefined();
    expect(onSetupComplete).toHaveBeenCalledOnce();

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(onError).not.toHaveBeenCalled();
    expect(harness.adapter.active).toBe(true);
    expect(harness.peerConnection.close).not.toHaveBeenCalled();
    await harness.adapter.dispose();
  });

  it('terminalizes a server error event once with sanitized diagnostics', async () => {
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    await harness.connect();

    harness.peerConnection.channel.onmessage({
      data: JSON.stringify({
        type: 'error',
        error: { message: 'super secret failure transcript', code: 'server_blowup_42', sdp: 'private-sdp' },
      }),
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'OPENAI_REALTIME_PROVIDER_UNAVAILABLE',
    }));
    const serialized = JSON.stringify(onError.mock.calls);
    expect(serialized).not.toContain('super secret');
    expect(serialized).not.toContain('server_blowup_42');
    expect(serialized).not.toContain('private-sdp');
    expect(harness.peerConnection.close).toHaveBeenCalledOnce();
    expect(harness.peerConnection.channel.close).toHaveBeenCalledOnce();
    expect(harness.audioTrack.stop).not.toHaveBeenCalled();
    expect(harness.adapter.active).toBe(false);
  });

  it('ignores non-terminal oai-events without failing', async () => {
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    await harness.connect();

    const events = [
      JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: 'secret words' }),
      JSON.stringify({ type: 'response.output_audio.delta', delta: 'QUJD' }),
      { type: 'session.created', session: { id: 'sess-secret' } },
      { type: 'rate_limits.updated' },
      { type: 'response.done' },
      'not-json{{{',
      {},
    ];
    for (const data of events) harness.peerConnection.channel.onmessage({ data });

    expect(onError).not.toHaveBeenCalled();
    expect(harness.adapter.active).toBe(true);
    expect(JSON.stringify(harness.adapter.getTelemetry())).not.toContain('secret words');
  });

  it('emits a single terminal on raced failure signals', async () => {
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    await harness.connect();
    const iceHandler = harness.peerConnection.oniceconnectionstatechange;
    const messageHandler = harness.peerConnection.channel.onmessage;

    harness.peerConnection.channel.onmessage({ data: JSON.stringify({ type: 'error', error: {} }) });
    harness.peerConnection.iceConnectionState = 'failed';
    iceHandler?.();
    messageHandler?.({ data: JSON.stringify({ type: 'error', error: {} }) });

    expect(onError).toHaveBeenCalledOnce();
    expect(harness.peerConnection.close).toHaveBeenCalledOnce();
  });

  it('ignores a stale viability watchdog after dispose', async () => {
    const onError = vi.fn();
    const harness = createHarness({ setupTimeout: 40, callbacks: { onError } });
    harness.peerConnection.channel.readyState = 'connecting';
    const connect = harness.connect();
    await new Promise(resolve => setTimeout(resolve, 5));

    await expect(harness.adapter.dispose()).resolves.toEqual({ success: true });
    await expect(connect).rejects.toMatchObject({ code: 'OPENAI_REALTIME_SETUP_CANCELLED' });
    expect(onError).not.toHaveBeenCalled();

    await new Promise(resolve => setTimeout(resolve, 80));
    expect(onError).not.toHaveBeenCalled();
    expect(harness.peerConnection.close).toHaveBeenCalledOnce();
    expect(harness.audioTrack.stop).not.toHaveBeenCalled();
  });

  it('ignores old-generation channel and peer events after a new session starts', async () => {
    const onError = vi.fn();
    const firstPeer = new FakePeerConnection();
    const secondPeer = new FakePeerConnection();
    firstPeer.channel.readyState = 'connecting';
    const peerConnectionFactory = vi.fn()
      .mockResolvedValueOnce(firstPeer)
      .mockResolvedValueOnce(secondPeer);
    const adapter = new OpenAIRealtimeProviderAdapter({
      peerConnectionFactory,
      fetchImpl: vi.fn(async () => ({ ok: true, text: async () => 'answer-sdp' })),
      audioElementFactory: vi.fn(() => createAudioElement()),
      setupTimeout: 50,
      callbacks: { onError },
    });
    const audioTrack = createTrack();
    const sourceStream = { getAudioTracks: () => [audioTrack] };
    const options = {
      bootstrap: { secret: 'ephemeral-client-secret' },
      targetLanguage: 'en-US',
      sourceStream,
    };

    const first = adapter.connect(options);
    await new Promise(resolve => setTimeout(resolve, 5));
    const oldOnOpen = firstPeer.channel.onopen;
    const oldOnMessage = firstPeer.channel.onmessage;
    const oldPeerState = firstPeer.onconnectionstatechange;
    await adapter.dispose();
    await expect(first).rejects.toMatchObject({ code: 'OPENAI_REALTIME_SETUP_CANCELLED' });

    await expect(adapter.connect(options)).resolves.toBeUndefined();
    expect(adapter.active).toBe(true);

    firstPeer.channel.readyState = 'open';
    oldOnOpen?.();
    firstPeer.connectionState = 'failed';
    oldPeerState?.();
    oldOnMessage?.({ data: JSON.stringify({ type: 'error', error: {} }) });
    await Promise.resolve();

    expect(onError).not.toHaveBeenCalled();
    expect(adapter.active).toBe(true);
    expect(secondPeer.close).not.toHaveBeenCalled();
    expect(audioTrack.stop).not.toHaveBeenCalled();
    await adapter.dispose();
  });

  it('rejects SDP exchange failures through a sanitized generic error callback', async () => {
    const onError = vi.fn();
    const harness = createHarness({
      fetchImpl: vi.fn(async () => ({ ok: false, status: 500, text: async () => 'private-sdp-error' })),
      callbacks: { onError },
    });

    await expect(harness.connect()).rejects.toMatchObject({
      code: 'OPENAI_REALTIME_SDP_EXCHANGE_FAILED',
    });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'OPENAI_REALTIME_SDP_EXCHANGE_FAILED',
      message: 'OpenAI Realtime SDP exchange failed',
    }));
    expect(JSON.stringify(onError.mock.calls)).not.toContain('ephemeral-client-secret');
    expect(JSON.stringify(onError.mock.calls)).not.toContain('private-sdp-error');
    expect(harness.peerConnection.close).toHaveBeenCalledOnce();
  });

  it('rejects peer setup errors', async () => {
    const peerConnection = new FakePeerConnection();
    peerConnection.createOffer.mockRejectedValueOnce(new Error('private peer detail'));
    const onError = vi.fn();
    const harness = createHarness({ peerConnection, callbacks: { onError } });

    await expect(harness.connect()).rejects.toMatchObject({
      code: 'OPENAI_REALTIME_SDP_EXCHANGE_FAILED',
    });
    expect(onError).toHaveBeenCalledOnce();
    expect(JSON.stringify(onError.mock.calls)).not.toContain('private peer detail');
  });

  it('sanitizes foreign coded errors and provider diagnostics at the adapter boundary', async () => {
    const foreignError = new Error('raw network secret SDP media transcript');
    foreignError.code = 'FOREIGN_RAW_CODE';
    foreignError.secret = 'ephemeral-client-secret';
    foreignError.sdp = 'private-sdp';
    foreignError.providerDiagnostic = {
      code: 'foreign-secret-code',
      stage: 'REMOTE_ERROR',
      closeCode: 1006,
      wasClean: false,
      wsOpen: true,
      setupSent: true,
      setupComplete: false,
      message: 'provider-body-secret',
      media: 'private-media',
      transcript: 'private transcript',
      sdp: 'private-sdp',
    };
    const peerConnection = new FakePeerConnection();
    peerConnection.createOffer.mockRejectedValueOnce(foreignError);
    const onError = vi.fn();
    const harness = createHarness({ peerConnection, callbacks: { onError } });

    await expect(harness.connect()).rejects.toMatchObject({
      code: 'OPENAI_REALTIME_SDP_EXCHANGE_FAILED',
      message: 'OpenAI Realtime SDP exchange failed',
    });

    const [safeError] = onError.mock.calls[0];
    expect(safeError).toEqual(expect.objectContaining({
      name: 'OpenAIRealtimeProviderError',
      code: 'OPENAI_REALTIME_SDP_EXCHANGE_FAILED',
      providerDiagnostic: {
        stage: 'CONNECT_PROVIDER',
        code: null,
        closeCode: 1006,
        wasClean: false,
        terminalCategory: null,
        malformedAt: null,
        wsOpen: true,
        setupSent: true,
        setupComplete: false,
      },
    }));
    expect(safeError).not.toHaveProperty('secret');
    expect(safeError).not.toHaveProperty('sdp');
    expect(JSON.stringify(onError.mock.calls)).not.toContain('raw network secret');
    expect(JSON.stringify(onError.mock.calls)).not.toContain('provider-body-secret');
    expect(JSON.stringify(onError.mock.calls)).not.toContain('private-media');
    expect(JSON.stringify(onError.mock.calls)).not.toContain('private transcript');
    expect(JSON.stringify(onError.mock.calls)).not.toContain('private-sdp');
  });

  it('disposes pending setup, fences late completion, and never stops source tracks', async () => {
    let resolvePeer;
    const peerConnection = new FakePeerConnection();
    const peerConnectionFactory = vi.fn(() => new Promise(resolve => { resolvePeer = resolve; }));
    const onError = vi.fn();
    const adapter = new OpenAIRealtimeProviderAdapter({
      peerConnectionFactory,
      fetchImpl: vi.fn(),
      callbacks: { onError },
    });
    const audioTrack = createTrack();
    const sourceStream = { getAudioTracks: () => [audioTrack] };
    const connect = adapter.connect({
      bootstrap: { secret: 'ephemeral-client-secret' },
      targetLanguage: 'en-US',
      sourceStream,
    });
    await Promise.resolve();

    await expect(adapter.dispose()).resolves.toEqual({ success: true });
    resolvePeer(peerConnection);
    await expect(connect).rejects.toMatchObject({ code: 'OPENAI_REALTIME_SETUP_CANCELLED' });

    expect(peerConnection.close).toHaveBeenCalledOnce();
    expect(audioTrack.stop).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('fences late SDP completion after dispose and makes dispose idempotent', async () => {
    let resolveFetch;
    const fetchImpl = vi.fn(() => new Promise(resolve => { resolveFetch = resolve; }));
    const harness = createHarness({ fetchImpl });
    const connect = harness.connect();
    while (!fetchImpl.mock.calls.length) await Promise.resolve();

    await expect(harness.adapter.dispose()).resolves.toEqual({ success: true });
    await expect(harness.adapter.dispose()).resolves.toEqual({ success: true, idempotent: true });
    resolveFetch({ ok: true, text: async () => 'late-answer-sdp' });
    await expect(connect).rejects.toMatchObject({ code: 'OPENAI_REALTIME_SETUP_CANCELLED' });

    expect(harness.peerConnection.setRemoteDescription).not.toHaveBeenCalled();
    expect(harness.peerConnection.close).toHaveBeenCalledOnce();
    expect(harness.audioTrack.stop).not.toHaveBeenCalled();
    expect(harness.peerConnection.removeTrack).not.toHaveBeenCalled();
  });

  it('aborts the pending SDP fetch when setup times out', async () => {
    let signal;
    const fetchImpl = vi.fn((_, options) => {
      signal = options.signal;
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('raw abort detail')), { once: true });
      });
    });
    const onError = vi.fn();
    const harness = createHarness({ fetchImpl, setupTimeout: 10, callbacks: { onError } });
    const connect = harness.connect();
    while (!fetchImpl.mock.calls.length) await Promise.resolve();

    await expect(connect).rejects.toMatchObject({ code: 'OPENAI_REALTIME_SETUP_TIMEOUT' });
    expect(signal.aborted).toBe(true);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'OPENAI_REALTIME_SETUP_TIMEOUT',
    }));
  });

  it('aborts the pending SDP fetch on dispose without surfacing the abort reason', async () => {
    let signal;
    const fetchImpl = vi.fn((_, options) => {
      signal = options.signal;
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('raw abort secret')), { once: true });
      });
    });
    const onError = vi.fn();
    const harness = createHarness({ fetchImpl, callbacks: { onError } });
    const connect = harness.connect();
    while (!fetchImpl.mock.calls.length) await Promise.resolve();

    await expect(harness.adapter.dispose()).resolves.toEqual({ success: true });
    await expect(connect).rejects.toMatchObject({ code: 'OPENAI_REALTIME_SETUP_CANCELLED' });
    expect(signal.aborted).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports delayed data-channel and playback failures through generic errors', async () => {
    const onError = vi.fn();
    let rejectPlay;
    const harness = createHarness({
      audioElement: createAudioElement(() => new Promise((_, reject) => { rejectPlay = reject; })),
      callbacks: { onError },
    });
    await harness.connect();

    harness.peerConnection.channel.onerror({ message: 'secret data-channel payload' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'OPENAI_REALTIME_DATA_CHANNEL_FAILED',
    }));
    expect(JSON.stringify(onError.mock.calls)).not.toContain('secret data-channel payload');

    // A fresh adapter isolates the playback failure from the first terminal.
    const playbackError = vi.fn();
    const playbackHarness = createHarness({
      audioElement: createAudioElement(() => new Promise((_, reject) => { rejectPlay = reject; })),
      callbacks: { onError: playbackError },
    });
    await playbackHarness.connect();
    playbackHarness.peerConnection.ontrack({ track: createTrack(), streams: [{ id: 'remote' }] });
    rejectPlay(new Error('private playback detail'));
    await Promise.resolve();
    expect(playbackError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'OPENAI_REALTIME_AUDIO_PLAYBACK_FAILED',
    }));
    expect(JSON.stringify(playbackError.mock.calls)).not.toContain('private playback detail');
  });

  it('reports a data-channel close immediately', async () => {
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    await harness.connect();

    harness.peerConnection.channel.onclose();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'OPENAI_REALTIME_DATA_CHANNEL_FAILED',
    }));
    expect(harness.adapter.active).toBe(false);
    expect(harness.audioTrack.stop).not.toHaveBeenCalled();
  });

  it('reports an ICE failure when the peer connection remains connected', async () => {
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    await harness.connect();

    harness.peerConnection.iceConnectionState = 'failed';
    harness.peerConnection.oniceconnectionstatechange();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'OPENAI_REALTIME_PROVIDER_UNAVAILABLE',
    }));
  });

  it('waits three seconds before reporting a persistent disconnected transport', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    try {
      await harness.connect();

      harness.peerConnection.connectionState = 'disconnected';
      harness.peerConnection.iceConnectionState = 'disconnected';
      harness.peerConnection.onconnectionstatechange();

      expect(onError).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2999);
      expect(onError).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);

      expect(onError).toHaveBeenCalledOnce();
      expect(harness.adapter.active).toBe(false);
    } finally {
      await harness.adapter.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('does not cancel the grace timer when connection recovers before ICE', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    try {
      await harness.connect();

      harness.peerConnection.connectionState = 'disconnected';
      harness.peerConnection.iceConnectionState = 'disconnected';
      harness.peerConnection.onconnectionstatechange();
      vi.advanceTimersByTime(1000);

      harness.peerConnection.connectionState = 'connected';
      harness.peerConnection.onconnectionstatechange();
      expect(onError).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1999);
      expect(onError).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);

      expect(onError).toHaveBeenCalledOnce();
      expect(harness.adapter.active).toBe(false);
    } finally {
      await harness.adapter.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('does not cancel the grace timer when ICE connects before the connection', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    try {
      await harness.connect();

      harness.peerConnection.connectionState = 'disconnected';
      harness.peerConnection.iceConnectionState = 'connected';
      harness.peerConnection.onconnectionstatechange();
      expect(onError).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2999);
      expect(onError).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);

      expect(onError).toHaveBeenCalledOnce();
      expect(harness.adapter.active).toBe(false);
    } finally {
      await harness.adapter.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('cancels the grace timer only after both transports recover', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    try {
      await harness.connect();

      harness.peerConnection.connectionState = 'disconnected';
      harness.peerConnection.iceConnectionState = 'disconnected';
      harness.peerConnection.onconnectionstatechange();
      vi.advanceTimersByTime(1000);

      harness.peerConnection.connectionState = 'connected';
      harness.peerConnection.onconnectionstatechange();
      vi.advanceTimersByTime(1000);
      expect(onError).not.toHaveBeenCalled();

      harness.peerConnection.iceConnectionState = 'completed';
      harness.peerConnection.oniceconnectionstatechange();
      vi.advanceTimersByTime(3000);

      expect(onError).not.toHaveBeenCalled();
      expect(harness.adapter.active).toBe(true);
    } finally {
      await harness.adapter.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('reports failed peer state immediately', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    try {
      await harness.connect();

      harness.peerConnection.connectionState = 'failed';
      harness.peerConnection.onconnectionstatechange();

      expect(onError).toHaveBeenCalledOnce();
      expect(harness.adapter.active).toBe(false);
    } finally {
      await harness.adapter.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('reports closed peer state immediately', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    try {
      await harness.connect();

      harness.peerConnection.connectionState = 'closed';
      harness.peerConnection.onconnectionstatechange();

      expect(onError).toHaveBeenCalledOnce();
      expect(harness.adapter.active).toBe(false);
    } finally {
      await harness.adapter.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('reports one failure for duplicate disconnected signals', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    try {
      await harness.connect();

      harness.peerConnection.connectionState = 'disconnected';
      harness.peerConnection.iceConnectionState = 'disconnected';
      harness.peerConnection.onconnectionstatechange();
      harness.peerConnection.oniceconnectionstatechange();
      harness.peerConnection.onconnectionstatechange();
      vi.advanceTimersByTime(3000);

      expect(onError).toHaveBeenCalledOnce();
    } finally {
      await harness.adapter.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('starts a fresh grace timer after recovery and a later disconnect', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    try {
      await harness.connect();

      harness.peerConnection.connectionState = 'disconnected';
      harness.peerConnection.iceConnectionState = 'disconnected';
      harness.peerConnection.onconnectionstatechange();
      vi.advanceTimersByTime(2000);

      harness.peerConnection.connectionState = 'connected';
      harness.peerConnection.onconnectionstatechange();
      harness.peerConnection.iceConnectionState = 'connected';
      harness.peerConnection.oniceconnectionstatechange();
      vi.advanceTimersByTime(2000);
      expect(onError).not.toHaveBeenCalled();

      harness.peerConnection.connectionState = 'disconnected';
      harness.peerConnection.onconnectionstatechange();
      harness.peerConnection.iceConnectionState = 'disconnected';
      harness.peerConnection.oniceconnectionstatechange();
      vi.advanceTimersByTime(2999);
      expect(onError).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);

      expect(onError).toHaveBeenCalledOnce();
    } finally {
      await harness.adapter.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('suppresses a disconnected grace failure after dispose', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    try {
      await harness.connect();

      harness.peerConnection.connectionState = 'disconnected';
      harness.peerConnection.iceConnectionState = 'disconnected';
      harness.peerConnection.onconnectionstatechange();
      await harness.adapter.dispose();
      vi.advanceTimersByTime(3000);

      expect(onError).not.toHaveBeenCalled();
      expect(harness.audioTrack.stop).not.toHaveBeenCalled();
    } finally {
      await harness.adapter.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('fences stale disconnected callbacks and timers across generations', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const firstPeer = new FakePeerConnection();
    const secondPeer = new FakePeerConnection();
    const peerConnectionFactory = vi.fn()
      .mockResolvedValueOnce(firstPeer)
      .mockResolvedValueOnce(secondPeer);
    const adapter = new OpenAIRealtimeProviderAdapter({
      peerConnectionFactory,
      fetchImpl: vi.fn(async () => ({ ok: true, text: async () => 'answer-sdp' })),
      audioElementFactory: vi.fn(() => createAudioElement()),
      callbacks: { onError },
    });
    const audioTrack = createTrack();
    const sourceStream = { getAudioTracks: () => [audioTrack] };
    const options = {
      bootstrap: { secret: 'ephemeral-client-secret' },
      targetLanguage: 'en-US',
      sourceStream,
    };
    try {
      await adapter.connect(options);
      const oldPeerState = firstPeer.onconnectionstatechange;
      firstPeer.connectionState = 'disconnected';
      firstPeer.iceConnectionState = 'disconnected';
      oldPeerState();

      await adapter.dispose();
      await expect(adapter.connect(options)).resolves.toBeUndefined();

      oldPeerState();
      vi.advanceTimersByTime(3000);

      expect(onError).not.toHaveBeenCalled();
      expect(adapter.active).toBe(true);
      expect(secondPeer.close).not.toHaveBeenCalled();
      expect(audioTrack.stop).not.toHaveBeenCalled();
    } finally {
      await adapter.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('ignores late peer-state transitions after disposal', async () => {
    const onError = vi.fn();
    const harness = createHarness({ callbacks: { onError } });
    await harness.connect();
    const lateTransition = harness.peerConnection.oniceconnectionstatechange;

    await harness.adapter.dispose();
    harness.peerConnection.iceConnectionState = 'failed';
    lateTransition();

    expect(onError).not.toHaveBeenCalled();
  });

  it('fences stale remote attachment completion and ended events', async () => {
    const firstPlay = createDeferred();
    const secondPlay = createDeferred();
    const play = vi.fn()
      .mockImplementationOnce(() => firstPlay.promise)
      .mockImplementationOnce(() => secondPlay.promise);
    const onPlaybackAccepted = vi.fn();
    const onError = vi.fn();
    const harness = createHarness({
      audioElement: createAudioElement(play),
      callbacks: { onPlaybackAccepted, onError },
    });
    await harness.connect();

    const firstTrack = createTrack();
    const secondTrack = createTrack();
    harness.peerConnection.ontrack({ track: firstTrack, streams: [{ id: 'first' }] });
    const firstEnded = firstTrack.addEventListener.mock.calls[0][1];
    harness.peerConnection.ontrack({ track: secondTrack, streams: [{ id: 'second' }] });

    expect(firstTrack.removeEventListener).toHaveBeenCalledWith('ended', firstEnded);
    secondPlay.resolve();
    await Promise.resolve();
    expect(onPlaybackAccepted).toHaveBeenCalledOnce();

    firstEnded();
    firstPlay.resolve();
    await Promise.resolve();
    expect(onPlaybackAccepted).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('ignores a stale first play rejection after a newer attachment is accepted', async () => {
    const firstPlay = createDeferred();
    const secondPlay = createDeferred();
    const play = vi.fn()
      .mockImplementationOnce(() => firstPlay.promise)
      .mockImplementationOnce(() => secondPlay.promise);
    const onPlaybackAccepted = vi.fn();
    const onError = vi.fn();
    const harness = createHarness({
      audioElement: createAudioElement(play),
      callbacks: { onPlaybackAccepted, onError },
    });
    await harness.connect();

    harness.peerConnection.ontrack({ track: createTrack(), streams: [{ id: 'first' }] });
    harness.peerConnection.ontrack({ track: createTrack(), streams: [{ id: 'second' }] });
    secondPlay.resolve();
    await Promise.resolve();
    firstPlay.reject(new Error('stale private playback detail'));
    await Promise.resolve();

    expect(onPlaybackAccepted).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});
