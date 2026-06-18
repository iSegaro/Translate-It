import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  FasterWhisperStreamingProvider,
  FASTER_WHISPER_STREAMING_PROVIDER_ID
} from './FasterWhisperStreamingProvider.js';
import {
  STT_STREAMING_PROVIDER_STATES,
  STT_STREAMING_PROVIDER_EVENT_TYPES
} from '../BaseStreamingSTTProvider.js';
import {
  STT_PROVIDER_IDS,
  STT_PROVIDER_MANIFEST,
  STT_PROVIDER_MODES,
  STT_PROVIDER_EXECUTION_LOCATIONS,
  getProviderExecutionLocation,
  resolveProviderExecutionHost,
  isProviderOffscreenExecuted
} from '../STTProviderManifest.js';

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closeCalls = [];
    this.listeners = {
      open: new Set(),
      message: new Set(),
      error: new Set(),
      close: new Set()
    };
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }

  addEventListener(type, handler) {
    this.listeners[type]?.add(handler);
  }

  removeEventListener(type, handler) {
    this.listeners[type]?.delete(handler);
  }

  send(data) {
    this.sent.push(data);
  }

  close(code = 1000, reason = '') {
    this.closeCalls.push({ code, reason });
    this.readyState = 3;
    this._emit('close', {
      type: 'close',
      code,
      reason,
      wasClean: code === 1000,
      target: this
    });
  }

  open() {
    this.readyState = 1;
    this._emit('open', { type: 'open', target: this });
  }

  message(data) {
    this._emit('message', { type: 'message', data, target: this });
  }

  error(error = new Error('socket error')) {
    this._emit('error', error);
  }

  unexpectedClose(event = {}) {
    this.readyState = 3;
    this._emit('close', {
      type: 'close',
      code: event.code ?? 1006,
      reason: event.reason ?? 'unexpected close',
      wasClean: event.wasClean ?? false,
      target: this
    });
  }

  _emit(type, event) {
    for (const handler of this.listeners[type] ?? []) {
      handler(event);
    }

    const propertyHandler = this[`on${type}`];
    if (typeof propertyHandler === 'function') {
      propertyHandler(event);
    }
  }
}

describe('FasterWhisperStreamingProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores injected dependencies without opening a socket', () => {
    const websocketFactory = vi.fn();
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory,
      logger: { debug: vi.fn() }
    });

    expect(provider.providerId).toBe(FASTER_WHISPER_STREAMING_PROVIDER_ID);
    expect(provider.websocketFactory).toBe(websocketFactory);
    expect(provider.state).toBe(STT_STREAMING_PROVIDER_STATES.IDLE);
    expect(websocketFactory).not.toHaveBeenCalled();
  });

  it('calls websocketFactory only during startSession and sends the init payload on open', async () => {
    const socket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const websocketFactory = vi.fn(() => socket);
    const provider = new FasterWhisperStreamingProvider({
      websocketFactory
    });

    const startPromise = provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      audioFormat: 'pcm16-mono-16khz',
      selectedAudioFormat: 'pcm16-mono-16khz',
      preferredAudioInputFormat: 'pcm16-mono-16khz',
      fallbackAudioInputFormat: 'webm-opus',
      audioSourceType: 'audio_worklet_pcm16',
      audioInputFormats: ['pcm16-mono-16khz', 'webm-opus'],
      sampleRate: 16000,
      channelCount: 1,
      bitDepth: 16,
      providerOptions: {
        endpointUrl: 'ws://example.invalid/stream',
        model: 'base'
      }
    }, {
      providerOptions: {
        sampleRate: 16000,
        protocolVersion: 1
      }
    });

    expect(websocketFactory).toHaveBeenCalledTimes(1);
    expect(websocketFactory).toHaveBeenCalledWith('ws://example.invalid/stream');
    expect(socket.sent).toHaveLength(0);

    socket.open();

    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: 'start',
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a',
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      audioFormat: 'pcm16-mono-16khz',
      selectedAudioFormat: 'pcm16-mono-16khz',
      preferredAudioInputFormat: 'pcm16-mono-16khz',
      fallbackAudioInputFormat: 'webm-opus',
      audioSourceType: 'audio_worklet_pcm16',
      audioInputFormats: ['pcm16-mono-16khz', 'webm-opus'],
      sampleRate: 16000,
      channelCount: 1,
      bitDepth: 16,
      protocolVersion: 1,
      options: {
        endpointUrl: 'ws://example.invalid/stream',
        model: 'base',
        sampleRate: 16000
      },
      metadata: {
        protocolVersion: 1,
        audioFormat: 'pcm16-mono-16khz',
        selectedAudioFormat: 'pcm16-mono-16khz',
        preferredAudioInputFormat: 'pcm16-mono-16khz',
        fallbackAudioInputFormat: 'webm-opus',
        audioSourceType: 'audio_worklet_pcm16',
        audioInputFormats: ['pcm16-mono-16khz', 'webm-opus'],
        sampleRate: 16000,
        channelCount: 1,
        bitDepth: 16
      }
    });

    socket.message(JSON.stringify({
      type: 'ready',
      sessionId: 'session-1',
      ready: true
    }));

    await expect(startPromise).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE,
      session: {
        sessionId: 'session-1',
        tabId: 12,
        videoFingerprint: 'video-a'
      }
    });
    expect(provider.state).toBe(STT_STREAMING_PROVIDER_STATES.ACTIVE);
  });

  it('emits a ready status event before resolving startSession', async () => {
    const socket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory: vi.fn(() => socket)
    });

    const startPromise = provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a'
    }, {
      readyTimeoutMs: 500
    });

    socket.open();
    socket.message(JSON.stringify({
      type: 'ready',
      sessionId: 'session-1',
      serverReady: true
    }));

    await expect(startPromise).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    });
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS,
      state: 'ready',
      details: expect.objectContaining({
        readyPayload: expect.objectContaining({
          type: 'ready',
          sessionId: 'session-1',
          serverReady: true
        })
      })
    }));
  });

  it('rejects startSession on ready timeout and emits a single error through the base path', async () => {
    vi.useFakeTimers();
    const socket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory: vi.fn(() => socket)
    });

    const startPromise = provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a'
    }, {
      readyTimeoutMs: 20
    });
    startPromise.catch(() => undefined);

    socket.open();
    await vi.advanceTimersByTimeAsync(25);

    await expect(startPromise).rejects.toMatchObject({
      code: 'ready_timeout'
    });
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR,
      error: expect.objectContaining({
        code: 'ready_timeout'
      })
    }));
    expect(eventSink.emit.mock.calls.filter(([event]) => event?.type === STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR)).toHaveLength(1);
    expect(socket.closeCalls).toHaveLength(1);
  });

  it('rejects startSession when no websocketFactory or global WebSocket is available', async () => {
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = undefined;

    try {
      const eventSink = { emit: vi.fn() };
      const provider = new FasterWhisperStreamingProvider({ eventSink });

      await expect(provider.startSession({
        sessionId: 'session-1',
        tabId: 12,
        videoFingerprint: 'video-a'
      })).rejects.toMatchObject({
        code: 'websocket_unavailable'
      });

      expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
        type: STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR,
        error: expect.objectContaining({
          code: 'websocket_unavailable'
        })
      }));
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it('stops and destroys idempotently without emitting errors', async () => {
    const socket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory: vi.fn(() => socket)
    });

    const startPromise = provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a'
    });

    socket.open();
    socket.message(JSON.stringify({ type: 'ready', sessionId: 'session-1' }));
    await expect(startPromise).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    });

    const firstStop = await provider.stopSession({ reason: 'stop' });
    const secondStop = await provider.stopSession({ reason: 'stop' });
    const firstDestroy = await provider.destroy({ reason: 'destroy' });
    const secondDestroy = await provider.destroy({ reason: 'destroy' });

    expect(firstStop.state).toBe(STT_STREAMING_PROVIDER_STATES.CLOSED);
    expect(secondStop.state).toBe(STT_STREAMING_PROVIDER_STATES.CLOSED);
    expect(firstDestroy.state).toBe(STT_STREAMING_PROVIDER_STATES.DESTROYED);
    expect(secondDestroy.state).toBe(STT_STREAMING_PROVIDER_STATES.DESTROYED);
    expect(socket.closeCalls).toHaveLength(1);
    expect(eventSink.emit.mock.calls.some(([event]) => event?.type === STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR)).toBe(false);
  });

  it('emits an error when the socket closes unexpectedly after activation', async () => {
    const socket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory: vi.fn(() => socket)
    });

    const startPromise = provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a'
    });

    socket.open();
    socket.message(JSON.stringify({ type: 'ready', sessionId: 'session-1' }));
    await expect(startPromise).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    });

    socket.unexpectedClose({
      code: 1006,
      reason: 'boom',
      wasClean: false
    });

    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR,
      error: expect.objectContaining({
        code: 'socket_closed'
      })
    }));
    expect(provider.state).toBe(STT_STREAMING_PROVIDER_STATES.ERROR);
  });

  it('maps final server messages to canonical transcript events', async () => {
    const socket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory: vi.fn(() => socket)
    });

    const startPromise = provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a',
      sourceLanguage: 'en'
    });

    socket.open();
    socket.message(JSON.stringify({ type: 'ready', sessionId: 'session-1' }));
    await expect(startPromise).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    });

    socket.message(JSON.stringify({
      type: 'final',
      sessionId: 'session-1',
      text: 'hello world',
      startMs: 100,
      endMs: 420,
      confidence: 0.93,
      segmentId: 'server-segment-1'
    }));

    const transcriptCall = eventSink.emit.mock.calls.find(([event]) => event?.type === STT_STREAMING_PROVIDER_EVENT_TYPES.TRANSCRIPT);
    expect(transcriptCall).toBeTruthy();
    expect(transcriptCall[0]).toMatchObject({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.TRANSCRIPT,
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a',
      event: expect.objectContaining({
        eventType: 'final',
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
        providerMode: 'streaming',
        sessionId: 'session-1',
        tabId: 12,
        videoFingerprint: 'video-a',
        segmentId: 'server-segment-1',
        revision: 1,
        segmentStartMs: 100,
        segmentEndMs: 420,
        sourceTimelineType: 'provider',
        sourceStartMs: 100,
        sourceEndMs: 420,
        sourceClockId: 'session-1',
        sourceSequence: 1,
        text: 'hello world',
        sourceLanguage: 'en',
        confidence: 0.93,
        metadata: expect.objectContaining({
          providerProtocol: 'faster_whisper_streaming_ws'
        })
      })
    });
    expect(transcriptCall[0].event.eventId).toBe('session-1:1');
    expect(transcriptCall[0].event.metadata.rawServerPayload).toMatchObject({
      type: 'final',
      sessionId: 'session-1',
      text: 'hello world'
    });
  });

  it('ignores finals with missing, empty, or whitespace text without emitting transcript or error events', async () => {
    const socket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory: vi.fn(() => socket)
    });

    const startPromise = provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a'
    });

    socket.open();
    socket.message(JSON.stringify({ type: 'ready', sessionId: 'session-1' }));
    await expect(startPromise).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    });

    const missingTextResult = socket.message(JSON.stringify({
      type: 'final',
      sessionId: 'session-1',
      startMs: 100,
      endMs: 200
    }));
    const emptyTextResult = socket.message(JSON.stringify({
      type: 'final',
      sessionId: 'session-1',
      text: ''
    }));
    const whitespaceTextResult = socket.message(JSON.stringify({
      type: 'final',
      sessionId: 'session-1',
      text: '   '
    }));

    expect(missingTextResult).toBeUndefined();
    expect(emptyTextResult).toBeUndefined();
    expect(whitespaceTextResult).toBeUndefined();
    expect(eventSink.emit.mock.calls.some(([event]) => event?.type === STT_STREAMING_PROVIDER_EVENT_TYPES.TRANSCRIPT)).toBe(false);
    expect(eventSink.emit.mock.calls.some(([event]) => event?.type === STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR)).toBe(false);
    expect(socket.closeCalls).toHaveLength(0);
  });

  it('generates stable provider-local ids and falls back to session source language and null confidence', async () => {
    const socket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory: vi.fn(() => socket)
    });

    const startPromise = provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a',
      sourceLanguage: 'de'
    });

    socket.open();
    socket.message(JSON.stringify({ type: 'ready', sessionId: 'session-1' }));
    await expect(startPromise).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    });

    socket.message(JSON.stringify({
      type: 'final',
      sessionId: 'session-1',
      text: 'eins'
    }));
    socket.message(JSON.stringify({
      type: 'final',
      sessionId: 'session-1',
      text: 'zwei'
    }));

    const transcriptEvents = eventSink.emit.mock.calls
      .map(([event]) => event)
      .filter((event) => event?.type === STT_STREAMING_PROVIDER_EVENT_TYPES.TRANSCRIPT)
      .map((event) => event.event);

    expect(transcriptEvents).toHaveLength(2);
    expect(transcriptEvents[0]).toMatchObject({
      eventId: 'session-1:1',
      segmentId: 'session-1:1',
      sourceLanguage: 'de',
      confidence: null
    });
    expect(transcriptEvents[1]).toMatchObject({
      eventId: 'session-1:2',
      segmentId: 'session-1:2',
      sourceLanguage: 'de',
      confidence: null
    });
  });

  it('ignores stale session finals without emitting transcript or error events', async () => {
    const socket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory: vi.fn(() => socket)
    });

    const startPromise = provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a'
    });

    socket.open();
    socket.message(JSON.stringify({ type: 'ready', sessionId: 'session-1' }));
    await expect(startPromise).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    });

    const staleResult = socket.message(JSON.stringify({
      type: 'final',
      sessionId: 'stale-session',
      text: 'ignored'
    }));

    expect(staleResult).toBeUndefined();
    expect(eventSink.emit.mock.calls.some(([event]) => event?.type === STT_STREAMING_PROVIDER_EVENT_TYPES.TRANSCRIPT)).toBe(false);
    expect(eventSink.emit.mock.calls.some(([event]) => event?.type === STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR)).toBe(false);
  });

  it('emits error and closes the socket on server error and unknown protocol messages without reconnecting', async () => {
    const socket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const websocketFactory = vi.fn(() => socket);
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory
    });

    const startPromise = provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a'
    });

    socket.open();
    socket.message(JSON.stringify({ type: 'ready', sessionId: 'session-1' }));
    await expect(startPromise).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    });

    socket.message(JSON.stringify({
      type: 'error',
      sessionId: 'session-1',
      code: 'server_error',
      message: 'transcription failed',
      retryable: false,
      details: {}
    }));

    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR,
      error: expect.objectContaining({
        code: 'server_error',
        message: 'transcription failed',
        retryable: false
      })
    }));
    expect(socket.closeCalls[socket.closeCalls.length - 1]).toMatchObject({
      code: 1011,
      reason: 'server error'
    });

    const unknownSocket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const unknownFactory = vi.fn(() => unknownSocket);
    const unknownEventSink = { emit: vi.fn() };
    const unknownProvider = new FasterWhisperStreamingProvider({
      eventSink: unknownEventSink,
      websocketFactory: unknownFactory
    });

    const unknownStart = unknownProvider.startSession({
      sessionId: 'session-2',
      tabId: 13,
      videoFingerprint: 'video-b'
    });

    unknownSocket.open();
    unknownSocket.message(JSON.stringify({ type: 'ready', sessionId: 'session-2' }));
    await expect(unknownStart).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    });

    unknownSocket.message(JSON.stringify({
      type: 'mystery',
      sessionId: 'session-2'
    }));

    expect(unknownSocket.closeCalls.length).toBeGreaterThan(0);
    expect(unknownFactory).toHaveBeenCalledTimes(1);
    expect(unknownEventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR,
      error: expect.objectContaining({
        code: 'protocol_error'
      })
    }));
  });

  it('sends binary audio chunks for Blob, ArrayBuffer, and Uint8Array inputs', async () => {
    const socket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const websocketFactory = vi.fn(() => socket);
    const provider = new FasterWhisperStreamingProvider({
      websocketFactory
    });

    const startPromise = provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a'
    });

    socket.open();
    socket.message(JSON.stringify({ type: 'ready', sessionId: 'session-1' }));
    await expect(startPromise).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    });

    const blobResult = await provider.handleAudioChunk(new Blob([new Uint8Array([1, 2, 3])]));
    const arrayBufferResult = await provider.handleAudioChunk(new Uint8Array([4, 5, 6]).buffer);
    const uint8ArrayResult = await provider.handleAudioChunk(new Uint8Array([7, 8, 9]));

    expect(blobResult).toMatchObject({
      handled: true,
      status: 'sent',
      bytes: 3
    });
    expect(arrayBufferResult).toMatchObject({
      handled: true,
      status: 'sent',
      bytes: 3
    });
    expect(uint8ArrayResult).toMatchObject({
      handled: true,
      status: 'sent',
      bytes: 3
    });
    expect(socket.sent).toHaveLength(4);
    expect(socket.sent.slice(1).every((payload) => payload instanceof Uint8Array)).toBe(true);
    expect(socket.sent.slice(1).every((payload) => typeof payload !== 'string')).toBe(true);
    expect(Array.from(socket.sent[1])).toEqual([1, 2, 3]);
    expect(Array.from(socket.sent[2])).toEqual([4, 5, 6]);
    expect(Array.from(socket.sent[3])).toEqual([7, 8, 9]);
    expect(websocketFactory).toHaveBeenCalledTimes(1);
  });

  it('returns not_ready before ready and on closed sockets without emitting errors', async () => {
    const socket = new FakeWebSocket('ws://127.0.0.1:8765/v1/audio/transcriptions/stream');
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory: vi.fn(() => socket)
    });

    const startPromise = provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a'
    });
    startPromise.catch(() => undefined);

    socket.open();

    await expect(provider.handleAudioChunk(new Uint8Array([1, 2, 3]))).resolves.toMatchObject({
      handled: false,
      status: 'not_ready'
    });

    await provider.stopSession({ reason: 'stop' });

    await expect(provider.handleAudioChunk(new Uint8Array([4, 5, 6]))).resolves.toMatchObject({
      handled: false,
      status: 'not_ready'
    });
    expect(eventSink.emit.mock.calls.some(([event]) => event?.type === STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR)).toBe(false);
  });

  it('registers metadata for the offscreen streaming skeleton', () => {
    const provider = STT_PROVIDER_MANIFEST[STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING];

    expect(provider).toMatchObject({
      id: STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING,
      mode: STT_PROVIDER_MODES.STREAMING,
      executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN,
      supportsPartialResults: false,
      supportsCorrections: false,
      supportsReconnect: false,
      requiresPersistentConnection: true
    });
    expect(getProviderExecutionLocation(STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING)).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN);
    expect(resolveProviderExecutionHost(STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING)).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN);
    expect(isProviderOffscreenExecuted(STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING)).toBe(true);
  });
});
