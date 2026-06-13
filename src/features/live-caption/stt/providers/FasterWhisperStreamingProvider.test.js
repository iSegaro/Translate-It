import { describe, it, expect, vi } from 'vitest';
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

describe('FasterWhisperStreamingProvider', () => {
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

  it('performs the base lifecycle without attempting network activity', async () => {
    const websocketFactory = vi.fn();
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory
    });

    const snapshot = await provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a',
      sourceLanguage: 'en',
      targetLanguage: 'fa'
    });

    expect(snapshot.state).toBe(STT_STREAMING_PROVIDER_STATES.ACTIVE);
    expect(provider.state).toBe(STT_STREAMING_PROVIDER_STATES.ACTIVE);
    expect(websocketFactory).not.toHaveBeenCalled();

    const stopSnapshot = await provider.stopSession({ reason: 'stop' });
    const destroySnapshot = await provider.destroy({ reason: 'destroy' });

    expect(stopSnapshot.state).toBe(STT_STREAMING_PROVIDER_STATES.CLOSED);
    expect(destroySnapshot.state).toBe(STT_STREAMING_PROVIDER_STATES.DESTROYED);
    expect(provider.state).toBe(STT_STREAMING_PROVIDER_STATES.DESTROYED);
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS,
      state: STT_STREAMING_PROVIDER_STATES.ACTIVE
    }));
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.CLOSED,
      reason: 'stop'
    }));
    expect(eventSink.emit.mock.calls.some(([event]) => event?.type === STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR)).toBe(false);
  });

  it('keeps stop and destroy idempotent', async () => {
    const provider = new FasterWhisperStreamingProvider({
      websocketFactory: vi.fn()
    });

    await provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a'
    });

    const firstStop = await provider.stopSession({ reason: 'stop' });
    const secondStop = await provider.stopSession({ reason: 'stop' });
    const firstDestroy = await provider.destroy({ reason: 'destroy' });
    const secondDestroy = await provider.destroy({ reason: 'destroy' });

    expect(firstStop.state).toBe(STT_STREAMING_PROVIDER_STATES.CLOSED);
    expect(secondStop.state).toBe(STT_STREAMING_PROVIDER_STATES.CLOSED);
    expect(firstDestroy.state).toBe(STT_STREAMING_PROVIDER_STATES.DESTROYED);
    expect(secondDestroy.state).toBe(STT_STREAMING_PROVIDER_STATES.DESTROYED);
  });

  it('exposes placeholder methods without protocol behavior', async () => {
    const provider = new FasterWhisperStreamingProvider({
      websocketFactory: vi.fn()
    });

    expect(provider._connect).toBeTypeOf('function');
    expect(provider._disconnect).toBeTypeOf('function');
    expect(provider._handleMessage).toBeTypeOf('function');
    expect(provider._handleError).toBeTypeOf('function');

    await expect(provider._connect()).resolves.toMatchObject({
      handled: false,
      status: 'not_implemented',
      reason: 'streaming_protocol_not_implemented',
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID
    });

    await expect(provider._disconnect()).resolves.toMatchObject({
      handled: false,
      status: 'not_implemented',
      reason: 'streaming_protocol_not_implemented',
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID
    });

    await expect(provider._handleMessage()).resolves.toMatchObject({
      handled: false,
      status: 'not_implemented',
      reason: 'streaming_protocol_not_implemented',
      providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID
    });

    await expect(provider._handleError(new Error('boom'))).resolves.toMatchObject({
      message: 'boom'
    });
  });

  it('emits status, transcript, error, and closed envelopes through the inherited base contract', async () => {
    const eventSink = { emit: vi.fn() };
    const provider = new FasterWhisperStreamingProvider({
      eventSink,
      websocketFactory: vi.fn()
    });

    await provider.startSession({
      sessionId: 'session-1',
      tabId: 12,
      videoFingerprint: 'video-a'
    });

    provider.emitStatusEvent({ state: 'ready' });
    provider.emitTranscriptEvent({
      event: {
        eventId: 'event-1',
        eventType: 'final',
        providerId: FASTER_WHISPER_STREAMING_PROVIDER_ID,
        providerMode: 'streaming',
        sessionId: 'session-1',
        tabId: 12,
        videoFingerprint: 'video-a',
        segmentId: 'segment-1',
        revision: 1,
        segmentStartMs: 10,
        segmentEndMs: 20,
        text: 'hello',
        createdAt: 1
      }
    });
    provider.emitErrorEvent({
      error: {
        code: 'streaming_error',
        message: 'socket closed',
        retryable: false
      }
    });
    provider.emitClosedEvent({ reason: 'stop' });

    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS,
      state: 'ready'
    }));
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.TRANSCRIPT,
      event: expect.objectContaining({
        eventType: 'final',
        text: 'hello'
      })
    }));
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR,
      error: expect.objectContaining({
        code: 'streaming_error',
        message: 'socket closed'
      })
    }));
    expect(eventSink.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: STT_STREAMING_PROVIDER_EVENT_TYPES.CLOSED,
      reason: 'stop'
    }));
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
