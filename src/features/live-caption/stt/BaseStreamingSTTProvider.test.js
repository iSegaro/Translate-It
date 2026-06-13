import { describe, expect, it, vi } from 'vitest';
import {
  BaseSTTProvider,
  BaseStreamingSTTProvider,
  STT_STREAMING_PROVIDER_STATES,
  STT_STREAMING_PROVIDER_EVENT_TYPES,
  normalizeStreamingProviderEventEnvelope
} from './index.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debugLazy: vi.fn()
  })
}));

class MockStreamingProvider extends BaseStreamingSTTProvider {
  constructor(options = {}) {
    super('mock_streaming', options);
  }
}

class InvalidStreamingProvider extends BaseStreamingSTTProvider {
  constructor(providerId, options = {}) {
    super(providerId, options);
  }
}

describe('BaseStreamingSTTProvider', () => {
  it('treats the base class as abstract and validates provider identity', () => {
    expect(() => new BaseStreamingSTTProvider('mock_streaming')).toThrow(/not implemented yet/i);
    expect(() => new InvalidStreamingProvider('', { eventSink: { emit: vi.fn() } })).toThrow(/providerId/i);
  });

  it('starts a session and transitions through the expected lifecycle state', async () => {
    const eventSink = { emit: vi.fn() };
    const provider = new MockStreamingProvider({ eventSink });

    const snapshot = await provider.startSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      providerOptions: { endpointUrl: 'wss://example.invalid' },
      metadata: { codec: 'opus' }
    });

    expect(provider.state).toBe(STT_STREAMING_PROVIDER_STATES.ACTIVE);
    expect(snapshot.state).toBe(STT_STREAMING_PROVIDER_STATES.ACTIVE);
    expect(snapshot.session).toMatchObject({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      sourceLanguage: 'en',
      targetLanguage: 'fa'
    });
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS,
      providerId: 'mock_streaming',
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      state: STT_STREAMING_PROVIDER_STATES.STARTING
    }));
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS,
      providerId: 'mock_streaming',
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    }));
  });

  it('stops idempotently and emits closed events once', async () => {
    const eventSink = { emit: vi.fn() };
    const provider = new MockStreamingProvider({ eventSink });

    await provider.startSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    const firstStop = await provider.stopSession({ reason: 'stop' });
    const secondStop = await provider.stopSession({ reason: 'stop' });

    expect(firstStop.state).toBe(STT_STREAMING_PROVIDER_STATES.CLOSED);
    expect(secondStop.state).toBe(STT_STREAMING_PROVIDER_STATES.CLOSED);
    expect(provider.state).toBe(STT_STREAMING_PROVIDER_STATES.CLOSED);
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS,
      state: STT_STREAMING_PROVIDER_STATES.CLOSED
    }));
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.CLOSED,
      reason: 'stop'
    }));
    expect(eventSink.emit.mock.calls.some(([event]) => event?.type === STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR)).toBe(false);
  });

  it('destroys idempotently and leaves the provider in the destroyed state', async () => {
    const eventSink = { emit: vi.fn() };
    const provider = new MockStreamingProvider({ eventSink });

    await provider.startSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    const firstDestroy = await provider.destroy({ reason: 'destroy' });
    const secondDestroy = await provider.destroy({ reason: 'destroy' });

    expect(firstDestroy.state).toBe(STT_STREAMING_PROVIDER_STATES.DESTROYED);
    expect(secondDestroy.state).toBe(STT_STREAMING_PROVIDER_STATES.DESTROYED);
    expect(provider.state).toBe(STT_STREAMING_PROVIDER_STATES.DESTROYED);
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS,
      state: STT_STREAMING_PROVIDER_STATES.DESTROYED
    }));
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.CLOSED,
      reason: 'destroy'
    }));
    expect(eventSink.emit.mock.calls.some(([event]) => event?.type === STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR)).toBe(false);
  });

  it('emits normalized status, transcript, error, and closed envelopes', async () => {
    const eventSink = { emit: vi.fn() };
    const provider = new MockStreamingProvider({ eventSink });

    await provider.startSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    const statusEvent = provider.emitStatusEvent({ state: 'ready', details: { ready: true } });
    const transcriptEvent = provider.emitTranscriptEvent({
      event: {
        eventId: 'event-1',
        eventType: 'final',
        providerId: 'mock_streaming',
        providerMode: 'streaming',
        sessionId: 'session-1',
        tabId: 7,
        videoFingerprint: 'video-a',
        segmentId: 'segment-1',
        revision: 1,
        segmentStartMs: 100,
        segmentEndMs: 200,
        text: 'hello world',
        createdAt: 123
      }
    });
    const errorEvent = provider.emitErrorEvent({
      error: {
        code: 'streaming_error',
        message: 'socket closed',
        retryable: false
      }
    });
    const closedEvent = provider.emitClosedEvent({ reason: 'stop' });

    expect(statusEvent).toMatchObject({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS,
      providerId: 'mock_streaming',
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      state: 'ready',
      details: { ready: true }
    });
    expect(transcriptEvent).toMatchObject({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.TRANSCRIPT,
      providerId: 'mock_streaming',
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      event: {
        eventId: 'event-1',
        eventType: 'final',
        text: 'hello world'
      }
    });
    expect(errorEvent).toMatchObject({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR,
      providerId: 'mock_streaming',
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      state: STT_STREAMING_PROVIDER_STATES.ERROR,
      error: {
        code: 'streaming_error',
        message: 'socket closed',
        retryable: false
      }
    });
    expect(closedEvent).toMatchObject({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.CLOSED,
      providerId: 'mock_streaming',
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      reason: 'stop'
    });
    expect(eventSink.emit).toHaveBeenCalledTimes(6);
  });

  it('does not throw when eventSink is missing and handleAudioChunk remains an explicit unsupported no-op', async () => {
    const provider = new MockStreamingProvider();

    await expect(provider.startSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    })).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    });

    await expect(provider.handleAudioChunk(new Blob(['chunk']))).resolves.toMatchObject({
      handled: false,
      status: 'unsupported',
      reason: 'audio_chunk_not_supported',
      providerId: 'mock_streaming'
    });

    await expect(provider.stopSession()).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.CLOSED
    });

    await expect(provider.destroy()).resolves.toMatchObject({
      state: STT_STREAMING_PROVIDER_STATES.DESTROYED
    });
  });

  it('keeps batch BaseSTTProvider behavior unchanged', () => {
    expect(() => new BaseSTTProvider('base')).toThrow(/not implemented yet/i);
    expect(normalizeStreamingProviderEventEnvelope(STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS, {
      providerId: 'mock_streaming',
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    })).toMatchObject({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS,
      providerId: 'mock_streaming',
      sessionId: 'session-1'
    });
  });
});
