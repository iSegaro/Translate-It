import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GEMINI_LIVE_AUDIO_MIME_TYPE,
  GEMINI_LIVE_MODEL,
  GEMINI_LIVE_SETUP_TIMEOUT,
  GEMINI_LIVE_WEBSOCKET_ENDPOINT,
  GeminiLiveProviderAdapter,
} from './GeminiLiveProviderAdapter.js';

class FakeWebSocket {
  static OPEN = 1;

  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  send(payload) {
    this.sent.push(payload);
  }

  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  close(code = 1000) {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, wasClean: code === 1000 });
  }
}

FakeWebSocket.instances = [];

function createClient(callbacks = {}) {
  return new GeminiLiveProviderAdapter({
    WebSocket: FakeWebSocket,
    ...callbacks,
  });
}

function encodeJson(message) {
  return new TextEncoder().encode(JSON.stringify(message)).buffer;
}

async function connectReady(client, targetLanguage = 'fr') {
  const connection = client.connect({
    bootstrap: { apiKey: 'short-lived-secret' },
    targetLanguage,
  });
  const socket = FakeWebSocket.instances.at(-1);
  socket.open();
  socket.receive({ setupComplete: {} });
  await connection;
  return socket;
}

describe('GeminiLiveProviderAdapter', () => {
  afterEach(() => {
    FakeWebSocket.instances = [];
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('builds the authenticated setup payload and waits for setupComplete', async () => {
    const onSetupComplete = vi.fn();
    const client = createClient({ onSetupComplete });
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'zh-CN' });
    const socket = FakeWebSocket.instances[0];

    expect(socket.binaryType).toBe('arraybuffer');
    socket.open();
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      setup: {
        model: GEMINI_LIVE_MODEL,
        generationConfig: {
          responseModalities: ['AUDIO'],
          translationConfig: {
            targetLanguageCode: 'zh-Hans',
            echoTargetLanguage: false,
          },
        },
      },
    });
    expect(onSetupComplete).not.toHaveBeenCalled();

    socket.receive({ setupComplete: {}, usageMetadata: { promptTokenCount: 1 } });
    await expect(connection).resolves.toBeUndefined();
    expect(onSetupComplete).toHaveBeenCalledOnce();
    expect(socket.url).toBe(`${GEMINI_LIVE_WEBSOCKET_ENDPOINT}?key=short-lived-secret`);
    expect(client._socketContext).toEqual({ targetLanguage: 'zh-Hans' });
  });

  it('accepts ArrayBuffer JSON for setupComplete', async () => {
    const client = createClient();
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });
    const socket = FakeWebSocket.instances[0];

    socket.open();
    socket.onmessage({ data: encodeJson({ setupComplete: {} }) });

    await expect(connection).resolves.toBeUndefined();
  });

  it('continues setup when the socket rejects the binaryType hint', async () => {
    const socket = new FakeWebSocket('');
    Object.defineProperty(socket, 'binaryType', {
      configurable: true,
      set() {
        throw new Error('binaryType is unsupported');
      },
    });
    const client = new GeminiLiveProviderAdapter({
      webSocketFactory: () => socket,
    });
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });

    socket.open();
    socket.receive({ setupComplete: {} });
    await expect(connection).resolves.toBeUndefined();
    client.close();
  });

  it('accepts ArrayBuffer JSON serverContent audio', async () => {
    const onAudio = vi.fn();
    const client = createClient({ onAudio });
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });
    const socket = FakeWebSocket.instances[0];

    socket.open();
    socket.onmessage({ data: encodeJson({ setupComplete: {} }) });
    await connection;

    socket.onmessage({ data: encodeJson({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AQ==' } }],
        },
      },
    }) });

    expect(onAudio).toHaveBeenCalledWith(new Uint8Array([1]));
  });

  it('decodes only validated 24k PCM output before invoking playback callbacks', async () => {
    const onAudio = vi.fn();
    const onError = vi.fn();
    const client = createClient({ onAudio, onError });
    const socket = await connectReady(client);

    socket.receive({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000;foo=bar', data: 'AAH/' } }],
        },
      },
    });

    expect(onAudio).toHaveBeenCalledWith(new Uint8Array([0, 1, 255]));
    client.close();

    const nextConnection = client.connect({ bootstrap: { apiKey: 'next-secret' }, targetLanguage: 'fr' });
    const nextSocket = FakeWebSocket.instances.at(-1);
    nextSocket.open();
    nextSocket.receive({ setupComplete: {} });
    await expect(nextConnection).resolves.toBeUndefined();
    nextSocket.receive({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { mimeType: 'audio/pcm;rate=16000', data: 'AQ==' } }],
        },
      },
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'LIVE_DUBBING_INVALID_OUTPUT_AUDIO',
      name: 'GeminiLiveOutputAudioError',
      providerReason: 'INVALID_OUTPUT_AUDIO',
      providerDiagnostic: expect.objectContaining({
        terminalCategory: 'INVALID_OUTPUT_AUDIO',
        closeCode: null,
        wasClean: null,
        malformedAt: null,
      }),
    }));
    expect(onError).toHaveBeenCalledOnce();
  });

  it.each([
    ['empty inline data', {}],
    ['missing MIME type', { data: 'AQ==' }],
    ['empty MIME type', { mimeType: '', data: 'AQ==' }],
    ['missing data', { mimeType: 'audio/pcm;rate=24000' }],
    ['empty data', { mimeType: 'audio/pcm;rate=24000', data: '' }],
    ['non-PCM MIME type', { mimeType: 'audio/wav', data: 'AQ==' }],
  ])('fails closed for %s inline audio shape', async (_label, inlineData) => {
    const onError = vi.fn();
    const client = createClient({ onError });
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({ setupComplete: {} });
    await connection;

    socket.receive({ serverContent: { modelTurn: { parts: [{ inlineData }] } } });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      providerDiagnostic: expect.objectContaining({
        terminalCategory: 'MALFORMED_MESSAGE',
        malformedAt: 'INLINE_AUDIO_SHAPE',
      }),
    }));
  });

  it('normalizes syntactically valid PCM base64 decode failures', async () => {
    const onError = vi.fn();
    const client = createClient({ onError });
    const socket = await connectReady(client);
    vi.stubGlobal('atob', () => {
      throw new Error('decoder-secret');
    });

    socket.receive({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AQ==' } }],
        },
      },
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'LIVE_DUBBING_OUTPUT_AUDIO_ERROR',
      name: 'GeminiLiveOutputAudioError',
      providerReason: 'OUTPUT_AUDIO_ERROR',
      providerDiagnostic: expect.objectContaining({
        closeCode: null,
        wasClean: null,
        terminalCategory: 'OUTPUT_AUDIO_ERROR',
      }),
    }));
    expect(JSON.stringify(onError.mock.calls)).not.toContain('decoder-secret');
  });

  it('ignores empty serverContent and continues with subsequent 24k PCM audio', async () => {
    const onAudio = vi.fn();
    const onError = vi.fn();
    const onClose = vi.fn();
    const onEvent = vi.fn();
    const onInterrupted = vi.fn();
    const onGenerationComplete = vi.fn();
    const onTurnComplete = vi.fn();
    const client = createClient({
      onAudio,
      onError,
      onClose,
      onEvent,
      onInterrupted,
      onGenerationComplete,
      onTurnComplete,
    });
    const socket = await connectReady(client);
    const beforeMetrics = client.getMetrics();
    const beforeTelemetry = client.getTelemetry();

    socket.receive({ serverContent: {} });

    expect(client.phase).toBe('ready');
    expect(client.getMetrics()).toEqual(beforeMetrics);
    expect(client.getTelemetry()).toEqual(beforeTelemetry);
    expect(onAudio).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    expect(onInterrupted).not.toHaveBeenCalled();
    expect(onGenerationComplete).not.toHaveBeenCalled();
    expect(onTurnComplete).not.toHaveBeenCalled();

    socket.receive({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AQ==' } }],
        },
      },
    });

    expect(onAudio).toHaveBeenCalledOnce();
    expect(onAudio).toHaveBeenCalledWith(new Uint8Array([1]));
    expect(client.phase).toBe('ready');
  });

  it('fails closed for invalid binary UTF-8', async () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const client = createClient({ onError, onEvent });
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });
    const socket = FakeWebSocket.instances[0];

    socket.open();
    socket.onmessage({ data: new Uint8Array([0xc3, 0x28]).buffer });

    await expect(connection).rejects.toMatchObject({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      providerDiagnostic: expect.objectContaining({ malformedAt: 'BINARY_UTF8_DECODE' }),
    });
    expect(JSON.stringify(onError.mock.calls)).not.toContain('c3');
    expect(JSON.stringify(onEvent.mock.calls)).not.toContain('c3');
  });

  it('fails closed for Blob messages without reading their contents', async () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const client = createClient({ onError, onEvent });
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });
    const socket = FakeWebSocket.instances[0];

    socket.open();
    socket.onmessage({ data: new Blob([JSON.stringify({ secret: 'blob-secret' })]) });

    await expect(connection).rejects.toMatchObject({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      providerDiagnostic: expect.objectContaining({ malformedAt: 'BINARY_BLOB_MESSAGE' }),
    });
    expect(JSON.stringify(onError.mock.calls)).not.toContain('blob-secret');
    expect(JSON.stringify(onEvent.mock.calls)).not.toContain('blob-secret');
  });

  it('keeps other non-plain record messages as envelope failures', async () => {
    const client = createClient();
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });
    const socket = FakeWebSocket.instances[0];

    socket.open();
    socket.onmessage({ data: new Uint8Array() });

    await expect(connection).rejects.toMatchObject({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      providerDiagnostic: expect.objectContaining({ malformedAt: 'MESSAGE_ENVELOPE' }),
    });
  });

  it('gates audio until setup and sends only base64 16k PCM audio', async () => {
    const client = createClient();
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'en' });
    const socket = FakeWebSocket.instances[0];

    expect(client.sendAudio(new Uint8Array([0, 1, 255]))).toBe(false);
    socket.open();
    expect(client.sendAudio(new Uint8Array([0, 1, 255]))).toBe(false);
    socket.receive({ setupComplete: {} });
    await connection;

    expect(client.sendAudio(new Uint8Array([0, 1, 255]))).toBe(true);
    expect(JSON.parse(socket.sent[1])).toEqual({
      realtimeInput: {
        audio: {
          mimeType: GEMINI_LIVE_AUDIO_MIME_TYPE,
          data: 'AAH/',
        },
      },
    });
  });

  it('reports bounded WebSocket backpressure without dropping the caller queue', async () => {
    const client = createClient();
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'en' });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({ setupComplete: {} });
    await connection;

    socket.bufferedAmount = 64 * 1024;
    expect(client.sendAudio(new Uint8Array([0, 1]))).toBe(false);
    expect(client.getSendState()).toEqual({ lastReason: 'BACKPRESSURE' });
    expect(client.getMetrics()).toMatchObject({ backpressureEvents: 1, sentAudioChunks: 0 });
  });

  it('rejects setup on the feature timeout and closes the socket', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const client = createClient({ onError });
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });
    const socket = FakeWebSocket.instances[0];
    socket.open();

    vi.advanceTimersByTime(GEMINI_LIVE_SETUP_TIMEOUT);
    await expect(connection).rejects.toMatchObject({ code: 'GEMINI_LIVE_SETUP_TIMEOUT' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GEMINI_LIVE_SETUP_TIMEOUT',
    }));
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('emits every translated inlineData part and informational server events', async () => {
    const onAudio = vi.fn();
    const onInterrupted = vi.fn();
    const onGenerationComplete = vi.fn();
    const onTurnComplete = vi.fn();
    const client = createClient({
      onAudio,
      onInterrupted,
      onGenerationComplete,
      onTurnComplete,
    });
    const socket = await connectReady(client);

    socket.receive({
      serverContent: {
        modelTurn: {
          parts: [
            { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AQ==' } },
            { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'Ag==' } },
          ],
        },
        interrupted: true,
        generationComplete: true,
        turnComplete: true,
      },
    });

    expect(onAudio).toHaveBeenNthCalledWith(1, new Uint8Array([1]));
    expect(onAudio).toHaveBeenNthCalledWith(2, new Uint8Array([2]));
    expect(onInterrupted).toHaveBeenCalledOnce();
    expect(onGenerationComplete).toHaveBeenCalledOnce();
    expect(onTurnComplete).toHaveBeenCalledOnce();
  });

  it('ignores the documented server metadata allowlist and top-level usage metadata', async () => {
    const onAudio = vi.fn();
    const onEvent = vi.fn();
    const onError = vi.fn();
    const client = createClient({ onAudio, onEvent, onError });
    const socket = await connectReady(client);

    socket.receive({
      serverContent: {
        inputTranscription: { text: 'do-not-forward', finished: false },
        interimInputTranscription: { text: 'do-not-forward' },
        outputTranscription: { text: 'do-not-forward', finished: true },
        speechState: 'FUTURE_PROVIDER_STATE',
        waitingForInput: true,
        interactionStatus: 'ACTIVE',
        groundingMetadata: { groundingChunks: [] },
        urlContextMetadata: { urlMetadata: [] },
      },
      usageMetadata: { promptTokenCount: 2, responseTokenCount: 3 },
    });
    socket.receive({ usageMetadata: { totalTokenCount: 5 } });

    expect(onAudio).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(client.phase).toBe('ready');
    expect(JSON.stringify(client.getTelemetry())).not.toContain('do-not-forward');
    expect(JSON.stringify(client.getTelemetry())).not.toContain('FUTURE_PROVIDER_STATE');
  });

  it('ignores valid server control frames and usage metadata without forwarding control values', async () => {
    const onError = vi.fn();
    const onClose = vi.fn();
    const onEvent = vi.fn();
    const client = createClient({ onError, onClose, onEvent });
    const socket = await connectReady(client);

    socket.receive({
      sessionResumptionUpdate: {
        newHandle: 'resume-secret',
        resumable: true,
      },
      usageMetadata: { promptTokenCount: 1 },
    });
    socket.receive({
      toolCallCancellation: { ids: ['cancel-secret'] },
      usageMetadata: { responseTokenCount: 1 },
    });

    expect(onError).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    expect(client.phase).toBe('ready');
    const observed = JSON.stringify({
      callbacks: [onError.mock.calls, onClose.mock.calls, onEvent.mock.calls],
      telemetry: client.getTelemetry(),
    });
    expect(observed).not.toContain('resume-secret');
    expect(observed).not.toContain('cancel-secret');
  });

  it('keeps setup pending while accepting a full session resumption update', async () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const client = createClient({ onError, onEvent });
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({
      sessionResumptionUpdate: {
        newHandle: 'resume-secret',
        resumable: true,
      },
    });

    let resolved = false;
    void connection.then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(client.phase).toBe('open');
    expect(onError).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();

    socket.receive({ setupComplete: {} });
    await expect(connection).resolves.toBeUndefined();
    const observed = JSON.stringify({
      callbacks: [onError.mock.calls, onEvent.mock.calls],
      telemetry: client.getTelemetry(),
    });
    expect(observed).not.toContain('resume-secret');
  });

  it.each([
    [
      'session resumption',
      {
        sessionResumptionUpdate: {
          newHandle: 42,
          leaked: 'resume-secret',
        },
      },
      'SESSION_RESUMPTION_SHAPE',
    ],
    [
      'tool call cancellation',
      {
        toolCallCancellation: {
          ids: ['cancel-secret', 42],
        },
      },
      'TOOL_CALL_CANCELLATION_SHAPE',
    ],
    [
      'tool call',
      {
        toolCall: {
          functionCalls: { name: 'tool-secret' },
        },
      },
      'TOOL_CALL_SHAPE',
    ],
  ])('rejects invalid %s control frames as sanitized malformed messages', async (
    _label,
    message,
    malformedAt,
  ) => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const client = createClient({ onError, onEvent });
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive(message);

    await expect(connection).rejects.toMatchObject({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      providerDiagnostic: expect.objectContaining({
        closeCode: 1002,
        terminalCategory: 'MALFORMED_MESSAGE',
        malformedAt,
      }),
    });
    expect(JSON.stringify(onError.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(onEvent.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(client.getTelemetry())).not.toContain('secret');
  });

  it('terminalizes valid tool calls without exposing tool payloads', async () => {
    const onError = vi.fn();
    const onClose = vi.fn();
    const onEvent = vi.fn();
    const client = createClient({ onError, onClose, onEvent });
    const socket = await connectReady(client);
    const secret = 'tool-secret';

    socket.receive({
      toolCall: {
        functionCalls: [{
          name: secret,
          id: secret,
          args: { secret },
        }],
      },
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GEMINI_LIVE_UNSUPPORTED_TOOL_CALL',
      providerDiagnostic: {
        stage: 'CONNECT_PROVIDER',
        code: 'GEMINI_LIVE_UNSUPPORTED_TOOL_CALL',
        closeCode: 1003,
        wasClean: false,
        terminalCategory: 'UNSUPPORTED_TOOL_CALL',
        malformedAt: null,
        wsOpen: true,
        setupSent: true,
        setupComplete: true,
      },
    }));
    expect(onClose.mock.calls[0][1]).toEqual(expect.objectContaining({
      code: 'GEMINI_LIVE_UNSUPPORTED_TOOL_CALL',
      malformedAt: null,
    }));
    expect(JSON.stringify(onError.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(onClose.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(onEvent.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(client.getTelemetry())).not.toContain(secret);
    expect(client.getTelemetry()).toMatchObject({
      providerTerminalCategory: 'UNSUPPORTED_TOOL_CALL',
    });
  });

  it.each([
    [
      'unknown union frame',
      {
        serverContent: {},
        unknownFrame: { secret: 'unknown-secret' },
      },
      'UNKNOWN_TOP_LEVEL_FIELD',
    ],
    [
      'multiple union frames',
      {
        sessionResumptionUpdate: {},
        toolCallCancellation: { ids: ['cancel-secret'] },
      },
      'MULTIPLE_TOP_LEVEL_FIELDS',
    ],
    ['empty frame', {}, 'EMPTY_MESSAGE_OBJECT'],
  ])('keeps %s as a private malformed message', async (_label, message, malformedAt) => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    const client = createClient({ onError, onEvent });
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive(message);

    await expect(connection).rejects.toMatchObject({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      providerDiagnostic: expect.objectContaining({
        malformedAt,
      }),
    });
    expect(JSON.stringify(onError.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(onEvent.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(client.getTelemetry())).not.toContain('secret');
  });

  it('rejects unknown server metadata and normalizes audio decode failures', async () => {
    const onError = vi.fn();
    const client = createClient({ onError });
    const socket = await connectReady(client);

    socket.receive({ serverContent: { unsupportedMetadata: {} } });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      providerDiagnostic: expect.objectContaining({ malformedAt: 'SERVER_CONTENT_FIELDS' }),
    }));

    const nextConnection = client.connect({ bootstrap: { apiKey: 'next-secret' }, targetLanguage: 'fr' });
    const nextSocket = FakeWebSocket.instances.at(-1);
    nextSocket.open();
    nextSocket.receive({ setupComplete: {} });
    await nextConnection;
    nextSocket.receive({ serverContent: {
      modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'not-base64!' } }] },
    } });
    expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      providerDiagnostic: expect.objectContaining({
        terminalCategory: 'MALFORMED_MESSAGE',
        malformedAt: 'INLINE_AUDIO_SHAPE',
      }),
    }));
  });

  it('keeps lifecycle events scalar-only and records same-context milestones', async () => {
    let now = 0;
    const onEvent = vi.fn();
    const client = createClient({ onEvent, performanceNow: () => ++now });
    const socket = await connectReady(client);

    socket.bufferedAmount = 321;
    expect(client.sendAudio(new Uint8Array([0, 1]))).toBe(true);
    socket.receive({ serverContent: {
      modelTurn: {
        parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AQ==' } }],
      },
      interrupted: true,
    } });
    const eventPayload = JSON.stringify(onEvent.mock.calls);
    expect(eventPayload).not.toContain('AQ==');
    expect(eventPayload).not.toContain('data');
    expect(client.getTelemetry()).toMatchObject({
      milestones: {
        wsOpen: expect.any(Number),
        setupSent: expect.any(Number),
        setupComplete: expect.any(Number),
        firstInputSent: expect.any(Number),
        firstTranslatedAudioReceived: expect.any(Number),
      },
      wsBufferedAmountPeak: 321,
      interruptions: 1,
    });
    expect(client.getTelemetry().milestones.wsOpen)
      .toBeLessThan(client.getTelemetry().milestones.setupSent);
    expect(client.getTelemetry().milestones.setupSent)
      .toBeLessThan(client.getTelemetry().milestones.setupComplete);

    socket.receive({ error: { message: 'provider-body-secret' } });
    expect(JSON.stringify(onEvent.mock.calls)).not.toContain('provider-body-secret');
    expect(client.getTelemetry()).toMatchObject({ providerTerminalCategory: 'REMOTE_ERROR' });
    expect(client.getTelemetry().milestones.cleanupStart).not.toBeNull();
    expect(client.getTelemetry().milestones.cleanupComplete).not.toBeNull();
  });

  it('rejects malformed messages before setup with one fenced terminal lifecycle', async () => {
    const onError = vi.fn();
    const onClose = vi.fn();
    const onEvent = vi.fn();
    const client = createClient({ onError, onClose, onEvent });
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    onError.mockImplementation(() => {
      expect(client.close()).toBe(false);
    });

    socket.receive({ serverContent: { unsupportedMetadata: {} } });

    await expect(connection).rejects.toMatchObject({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
    });
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      providerDiagnostic: expect.objectContaining({
        stage: 'CONNECT_PROVIDER',
        closeCode: 1002,
        terminalCategory: 'MALFORMED_MESSAGE',
        malformedAt: 'SERVER_CONTENT_FIELDS',
      }),
    }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose.mock.calls[0][1]).toEqual(expect.objectContaining({
      stage: 'CONNECT_PROVIDER',
      malformedAt: 'SERVER_CONTENT_FIELDS',
    }));
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(client.getTelemetry()).toMatchObject({
      providerTerminalCategory: 'MALFORMED_MESSAGE',
    });
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('fences terminal generation before re-entrant callbacks and resets reused telemetry', async () => {
    const onError = vi.fn();
    const onClose = vi.fn();
    const client = createClient({ onError, onClose });
    const socket = await connectReady(client);

    onError.mockImplementation(() => client.close());
    socket.receive({ goAway: { timeLeft: '10s' } });
    expect(onError).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();

    const connection = client.connect({ bootstrap: { apiKey: 'another-secret' }, targetLanguage: 'fr' });
    const nextSocket = FakeWebSocket.instances.at(-1);
    nextSocket.open();
    nextSocket.receive({ setupComplete: {} });
    await connection;
    expect(client.getTelemetry().milestones.wsOpen).not.toBeNull();
    expect(client.getTelemetry().providerTerminalCategory).toBeNull();
  });

  it('terminalizes GoAway and ignores malformed callbacks from the closed generation', async () => {
    const onGoAway = vi.fn();
    const onError = vi.fn();
    const onClose = vi.fn();
    const callbacks = [];
    onGoAway.mockImplementation(() => callbacks.push({
      type: 'goAway',
      phase: client.phase,
      socket: client._socket,
    }));
    onError.mockImplementation(() => callbacks.push({ type: 'error' }));
    onClose.mockImplementation(() => callbacks.push({ type: 'close' }));
    const client = createClient({ onGoAway, onError, onClose });
    const socket = await connectReady(client);

    socket.receive({ goAway: { timeLeft: '10s' } });
    socket.receive({ serverContent: { modelTurn: { parts: [{ inlineData: {} }] } } });
    socket.receive('{not-json');

    expect(onGoAway).toHaveBeenCalledWith(expect.objectContaining({
      timeLeft: '10s',
      providerDiagnostic: {
        stage: 'CONNECT_PROVIDER',
        code: 'GEMINI_LIVE_GO_AWAY',
        closeCode: 1000,
        wasClean: false,
        terminalCategory: 'GO_AWAY',
        malformedAt: null,
        wsOpen: true,
        setupSent: true,
        setupComplete: true,
      },
    }));
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'GEMINI_LIVE_GO_AWAY' }));
    expect(callbacks.map(({ type }) => type)).toEqual(['goAway', 'error', 'close']);
    expect(callbacks[0]).toMatchObject({ phase: 'idle', socket: null });
  });

  it('attaches a flat provider diagnostic to pre-setup terminal callbacks and rejection', async () => {
    const onError = vi.fn();
    const onClose = vi.fn();
    const onEvent = vi.fn();
    const client = createClient({ onError, onClose, onEvent });
    const connection = client.connect({ bootstrap: { apiKey: 'short-lived-secret' }, targetLanguage: 'fr' });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({ error: { message: 'provider-body-secret' } });

    await expect(connection).rejects.toMatchObject({
      code: 'GEMINI_LIVE_REMOTE_ERROR',
      providerDiagnostic: {
        stage: 'CONNECT_PROVIDER',
        code: 'GEMINI_LIVE_REMOTE_ERROR',
        closeCode: 1011,
        wasClean: false,
        terminalCategory: 'REMOTE_ERROR',
        wsOpen: true,
        setupSent: true,
        setupComplete: false,
      },
    });
    expect(onError.mock.calls[0][0].providerDiagnostic).toEqual(
      expect.objectContaining({ stage: 'CONNECT_PROVIDER', setupComplete: false }),
    );
    expect(onClose.mock.calls[0][0]).toEqual({ code: 1011, wasClean: false });
    expect(onClose.mock.calls[0][1]).toEqual(
      expect.objectContaining({ stage: 'CONNECT_PROVIDER', closeCode: 1011 }),
    );
    expect(onEvent).toHaveBeenCalledWith({ type: 'close', code: 1011, wasClean: false });
    expect(onEvent.mock.calls.some(([event]) => event?.providerDiagnostic)).toBe(false);
    expect(JSON.stringify(onError.mock.calls)).not.toContain('provider-body-secret');
  });

  it('redacts the key and URL from connection errors', async () => {
    const apiKey = 'short-lived-secret';
    const onError = vi.fn();
    const client = new GeminiLiveProviderAdapter({
      onError,
      webSocketFactory: url => {
        throw new Error(`failed to open ${url}`);
      },
    });

    const connection = client.connect({ bootstrap: { apiKey }, targetLanguage: 'fr' });
    await expect(connection).rejects.toMatchObject({ code: 'GEMINI_LIVE_CONNECT_FAILED' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.not.stringContaining(apiKey),
    }));
    expect(onError.mock.calls[0][0].message).not.toContain(GEMINI_LIVE_WEBSOCKET_ENDPOINT);
  });

  it('rejects positional and top-level key connection arguments', async () => {
    const client = createClient();

    await expect(client.connect('short-lived-secret', 'fr')).rejects.toThrow(
      'connect requires a nested bootstrap object',
    );
    await expect(client.connect({ apiKey: 'short-lived-secret', targetLanguage: 'fr' })).rejects.toThrow(
      'connect requires a nested bootstrap object',
    );
    await expect(client.connect({
      bootstrap: { apiKey: 'short-lived-secret' },
      targetLanguage: 'fr',
      extra: true,
    })).rejects.toThrow('connect requires a nested bootstrap object');
  });

  it('ignores callbacks from a closed generation', async () => {
    const onAudio = vi.fn();
    const client = createClient({ onAudio });
    const oldSocket = await connectReady(client);
    client.close();

    oldSocket.receive({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AQ==' } }],
        },
      },
    });
    expect(onAudio).not.toHaveBeenCalled();

    const nextConnection = client.connect({ bootstrap: { apiKey: 'another-secret' }, targetLanguage: 'fr' });
    const nextSocket = FakeWebSocket.instances.at(-1);
    nextSocket.open();
    oldSocket.onmessage?.({
      data: JSON.stringify({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'Ag==' } }],
          },
        },
      }),
    });
    expect(onAudio).not.toHaveBeenCalled();
    nextSocket.receive({ setupComplete: {} });
    await nextConnection;
  });
});
