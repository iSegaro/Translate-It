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
      providerOptions: {
        endpointUrl: 'ws://example.invalid/stream',
        model: 'base'
      }
    }, {
      providerOptions: {
        sampleRate: 16000
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
      options: {
        endpointUrl: 'ws://example.invalid/stream',
        model: 'base',
        sampleRate: 16000
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

  it('does not attempt reconnect and does not send audio chunks yet', async () => {
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

    await expect(provider.handleAudioChunk(new Blob(['audio']))).resolves.toMatchObject({
      handled: false,
      status: 'unsupported',
      reason: 'audio_chunk_not_supported',
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID
    });
    expect(socket.sent).toHaveLength(1);
    expect(websocketFactory).toHaveBeenCalledTimes(1);
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
