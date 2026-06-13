import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STT_PROVIDER_IDS,
  STT_PROVIDER_MANIFEST,
  STT_PROVIDER_MODES,
  STT_PROVIDER_EXECUTION_LOCATIONS,
  getProviderExecutionLocation,
  resolveProviderExecutionHost,
  isProviderOffscreenExecuted,
  STTProviderFactory
} from './stt/index.js';
import {
  LiveCaptionOffscreenBridge,
  LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  LiveCaptionTranscriptEventCoordinator,
  LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES
} from './background/index.js';
import { LiveCaptionOffscreenRuntimeShell, LIVE_CAPTION_RUNTIME_ACTIONS, LIVE_CAPTION_RUNTIME_SHELL_STATES } from '../../html/liveCaptionOffscreenRuntimeShell.js';
import { createLiveCaptionStreamingSttErrorMessage } from './background/liveCaptionOffscreenContracts.js';
import { LiveCaptionCache } from './cache/LiveCaptionCache.js';
import { UnifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

vi.mock('./stt/STTProviderFactory.js', () => ({
  STTProviderFactory: vi.fn()
}));

vi.mock('./cache/LiveCaptionCache.js', () => ({
  LiveCaptionCache: vi.fn()
}));

vi.mock('@/core/services/translation/UnifiedTranslationService.js', () => ({
  UnifiedTranslationService: vi.fn()
}));

describe('live-caption streaming architecture seams', () => {
  class MockMediaRecorder {
    constructor(stream, options) {
      this.stream = stream;
      this.options = options;
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
      this.mimeType = options?.mimeType || 'audio/webm';
      MockMediaRecorder.instances.push(this);
    }

    start(timeslice) {
      this.state = 'recording';
      this.timeslice = timeslice;
    }

    stop() {
      this.state = 'inactive';
      if (typeof this.onstop === 'function') {
        this.onstop({ target: this });
      }
    }

    pause() {
      this.state = 'paused';
    }

    resume() {
      this.state = 'recording';
    }

    static isTypeSupported() {
      return true;
    }
  }

  let mockGetUserMedia;
  let mockTrackStop;
  let mockStream;
  let mockSendMessage;
  let mockClose;

  class MockAudioContext {
    constructor() {
      this.destination = {};
      this.close = mockClose;
    }

    createMediaStreamSource() {
      return {
        connect: vi.fn(),
        disconnect: vi.fn()
      };
    }
  }

  class MockFileReader {
    constructor() {
      this.onloadend = null;
      this.onerror = null;
      this.result = null;
    }

    readAsDataURL(blob) {
      const mimeType = blob?.type || 'audio/webm';
      this.result = `data:${mimeType};base64,${Buffer.from('streaming-architecture-seam').toString('base64')}`;
      if (typeof this.onloadend === 'function') {
        this.onloadend({ target: this });
      }
    }
  }

  beforeEach(() => {
    MockMediaRecorder.instances = [];
    globalThis.MediaRecorder = MockMediaRecorder;
    globalThis.FileReader = MockFileReader;
    globalThis.WebSocket = vi.fn();

    mockTrackStop = vi.fn();
    mockClose = vi.fn().mockResolvedValue(undefined);
    mockStream = {
      getTracks: () => [{ stop: mockTrackStop }]
    };
    mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);

    globalThis.navigator.mediaDevices = {
      getUserMedia: mockGetUserMedia
    };

    mockSendMessage = vi.fn(async (request) => request);

    globalThis.chrome = {
      runtime: {
        sendMessage: mockSendMessage
      },
      tabCapture: {
        capture: vi.fn()
      }
    };

    globalThis.AudioContext = MockAudioContext;
    if (typeof window !== 'undefined') {
      window.AudioContext = MockAudioContext;
      window.webkitAudioContext = MockAudioContext;
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('resolves provider execution hosts without changing batch provider behavior', () => {
    expect(getProviderExecutionLocation(STT_PROVIDER_IDS.OPENAI_WHISPER)).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.BACKGROUND);
    expect(resolveProviderExecutionHost(STT_PROVIDER_IDS.OPENAI_WHISPER)).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.BACKGROUND);
    expect(isProviderOffscreenExecuted(STT_PROVIDER_IDS.OPENAI_WHISPER)).toBe(false);

    const mockManifest = {
      ...STT_PROVIDER_MANIFEST,
      mock_streaming: {
        id: 'mock_streaming',
        displayName: 'Mock Streaming',
        mode: STT_PROVIDER_MODES.STREAMING,
        executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN,
        supported: true
      }
    };

    expect(getProviderExecutionLocation('mock_streaming', mockManifest)).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN);
    expect(resolveProviderExecutionHost('mock_streaming', mockManifest)).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN);
    expect(isProviderOffscreenExecuted('mock_streaming', mockManifest)).toBe(true);
    expect(getProviderExecutionLocation('missing-provider', mockManifest)).toBeNull();
    expect(resolveProviderExecutionHost('missing-provider', mockManifest)).toBeNull();
    expect(isProviderOffscreenExecuted('missing-provider', mockManifest)).toBe(false);
  });

  it('forwards streaming bridge messages and preserves deterministic unavailable handling', async () => {
    const bridge = new LiveCaptionOffscreenBridge();

    await bridge.startStreamingSttSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN
    });
    await bridge.stopStreamingSttSession({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming'
    });
    await bridge.forwardStreamingTranscriptEvent({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      event: {
        eventId: 'event-1',
        eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.PARTIAL,
        providerId: 'deepgram_streaming',
        providerMode: STT_PROVIDER_MODES.STREAMING,
        sessionId: 'session-1',
        tabId: 7,
        videoFingerprint: 'video-a',
        segmentId: 'segment-1',
        revision: 1,
        text: 'streaming partial',
        createdAt: 100
      }
    });
    await bridge.forwardStreamingSttStatus({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      status: 'active'
    });
    await bridge.forwardStreamingSttError({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      error: {
        code: 'streaming_error',
        message: 'socket closed'
      }
    });

    expect(mockSendMessage).toHaveBeenCalledTimes(5);
    expect(mockSendMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION
    }));
    expect(mockSendMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({
      type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT
    }));
    expect(mockSendMessage).toHaveBeenNthCalledWith(4, expect.objectContaining({
      type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS
    }));
    expect(mockSendMessage).toHaveBeenNthCalledWith(5, expect.objectContaining({
      type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR
    }));

    const unavailableBridge = new LiveCaptionOffscreenBridge({ browserApi: { runtime: null } });
    const unavailable = await unavailableBridge.startStreamingSttSession({
      sessionId: 'session-2',
      tabId: 8,
      videoFingerprint: 'video-b',
      providerId: 'deepgram_streaming',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN
    });

    expect(unavailable.success).toBe(false);
    expect(unavailable.ok).toBe(false);
    expect(unavailable.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OFFSCREEN_NOT_READY);
    expect(unavailable.error.reason).toBe('offscreen_unavailable');
  });

  it('recognizes streaming runtime shell messages without creating MediaRecorder state', async () => {
    const shell = new LiveCaptionOffscreenRuntimeShell();

    const startResponse = await shell.handleMessage({
      target: 'offscreen',
      type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN
    }, {});

    const transcriptResponse = await shell.handleMessage({
      target: 'offscreen',
      type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      event: {
        eventId: 'event-1',
        eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.PARTIAL,
        providerId: 'deepgram_streaming',
        providerMode: STT_PROVIDER_MODES.STREAMING,
        sessionId: 'session-1',
        tabId: 7,
        videoFingerprint: 'video-a',
        segmentId: 'segment-1',
        revision: 1,
        text: 'streaming partial',
        createdAt: 100
      }
    }, {});

    const statusResponse = await shell.handleMessage({
      target: 'offscreen',
      type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      status: 'active'
    }, {});

    const errorResponse = await shell.handleMessage({
      target: 'offscreen',
      type: LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      error: {
        code: 'streaming_error',
        message: 'socket closed'
      }
    }, {});

    expect(startResponse.success).toBe(true);
    expect(startResponse.status).toBe('START_NOT_IMPLEMENTED');
    expect(transcriptResponse.success).toBe(true);
    expect(statusResponse.success).toBe(true);
    expect(errorResponse.success).toBe(true);
    expect(shell.captureState).toBe('idle');
    expect(MockMediaRecorder.instances).toHaveLength(0);
    expect(mockGetUserMedia).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('keeps existing capture behavior unchanged', async () => {
    const shell = new LiveCaptionOffscreenRuntimeShell();
    vi.useFakeTimers();

    const startResponse = await shell.handleMessage({
      target: 'offscreen',
      action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
      messageId: 'message-1',
      data: {
        sessionId: 'session-1',
        tabId: 7,
        videoFingerprint: 'video-a',
        streamId: 'mock-stream-id',
        metadata: { chunkTimeslice: 10000 }
      }
    }, {});

    expect(startResponse.success).toBe(true);
    expect(shell.captureState).toBe('capturing');
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
    expect(MockMediaRecorder.instances).toHaveLength(1);

    const stopResponse = await shell.handleMessage({
      target: 'offscreen',
      action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
      data: {
        sessionId: 'session-1',
        tabId: 7,
        videoFingerprint: 'video-a'
      }
    }, {});

    expect(stopResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE);
    expect(shell.captureState).toBe('idle');
  });

  it('normalizes streaming transcript events through the coordinator without side effects', () => {
    const coordinator = new LiveCaptionTranscriptEventCoordinator();

    const partial = coordinator.handleStreamingTranscriptEvent({
      eventId: 'event-1',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.PARTIAL,
      providerId: 'deepgram_streaming',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      segmentId: 'segment-1',
      revision: 1,
      text: 'hello',
      createdAt: 100
    });

    const final = coordinator.handleStreamingTranscriptEvent({
      eventId: 'event-2',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      providerId: 'deepgram_streaming',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      segmentId: 'segment-1',
      revision: 2,
      segmentStartMs: 100,
      segmentEndMs: 200,
      text: 'hello world',
      createdAt: 110
    });

    const correction = coordinator.handleStreamingTranscriptEvent({
      eventId: 'event-3',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      providerId: 'deepgram_streaming',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      segmentId: 'segment-1',
      revision: 3,
      segmentStartMs: 100,
      segmentEndMs: 210,
      supersedesSegmentId: 'segment-1',
      supersedesEventId: 'event-2',
      text: 'hello world updated',
      createdAt: 120
    });

    const transportError = createLiveCaptionStreamingSttErrorMessage({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      error: {
        code: 'streaming_error',
        message: 'socket closed'
      }
    });

    const error = coordinator.handleStreamingTranscriptEvent({
      eventId: 'event-4',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR,
      providerId: 'deepgram_streaming',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      revision: 1,
      error: {
        code: 'provider_error',
        message: 'transcript failed'
      },
      createdAt: 130
    });

    expect(partial).toMatchObject({
      handled: false,
      persisted: false,
      status: 'ignored',
      canonicalEvent: null
    });
    expect(final).toMatchObject({
      handled: true,
      persisted: false,
      status: 'canonical_final',
      canonicalEvent: {
        eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
        isFinal: true
      }
    });
    expect(correction).toMatchObject({
      handled: true,
      persisted: false,
      status: 'canonical_correction',
      canonicalEvent: {
        eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
        isFinal: true,
        supersedesEventId: 'event-2'
      }
    });
    expect(error).toMatchObject({
      handled: true,
      persisted: false,
      status: 'error',
      canonicalEvent: null,
      error: {
        code: 'provider_error',
        message: 'transcript failed'
      }
    });
    expect(transportError.type).toBe(LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR);
    expect(transportError.type).not.toBe(LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR);
  });

  it('does not instantiate provider, translation, or cache layers during streaming seam coverage', () => {
    expect(STTProviderFactory).not.toHaveBeenCalled();
    expect(LiveCaptionCache).not.toHaveBeenCalled();
    expect(UnifiedTranslationService).not.toHaveBeenCalled();
    expect(globalThis.WebSocket).not.toHaveBeenCalled();
  });
});
