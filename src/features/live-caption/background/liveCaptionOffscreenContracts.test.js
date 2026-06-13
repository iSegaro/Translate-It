import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIVE_CAPTION_CAPTURE_STATES,
  LIVE_CAPTION_OFFSCREEN_ERROR_CODES,
  LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES,
  LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES,
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  LIVE_CAPTION_RUNTIME_SHELL_STATES,
  LiveCaptionOffscreenBridge,
  LiveCaptionCaptureCoordinator,
  createLiveCaptionStartCaptureRequest,
  createLiveCaptionStopCaptureRequest,
  createLiveCaptionStatusRequest,
  createLiveCaptionFinalizedChunkMessage,
  createLiveCaptionCaptureErrorMessage,
  createLiveCaptionStartStreamingSttSessionRequest,
  createLiveCaptionStopStreamingSttSessionRequest,
  createLiveCaptionStreamingSttTranscriptEventMessage,
  createLiveCaptionStreamingSttStatusMessage,
  createLiveCaptionStreamingSttErrorMessage,
  createLiveCaptionOffscreenSnapshotResponse,
  createLiveCaptionFailClosedResponse,
  normalizeLiveCaptionOffscreenResponse,
  createLiveCaptionRuntimeShellResponse
} from './index.js';
import { BROWSER_SPEECH_PROBE_ACTION } from '@/html/liveCaptionBrowserSpeechProbe.js';
import { LiveCaptionCache } from '@/features/live-caption/cache/LiveCaptionCache.js';
import { BaseSTTProvider } from '@/features/live-caption/stt/BaseSTTProvider.js';
import {
  STT_PROVIDER_EXECUTION_LOCATIONS,
  STT_PROVIDER_MODES
} from '@/features/live-caption/stt/liveCaptionSTTProviderContracts.js';
import {
  LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES,
  normalizeLiveCaptionTranscriptEvent
} from './liveCaptionTranscriptContracts.js';
import { UnifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';

vi.mock('@/features/live-caption/cache/LiveCaptionCache.js', () => ({
  LiveCaptionCache: vi.fn()
}));

vi.mock('@/features/live-caption/stt/BaseSTTProvider.js', () => ({
  BaseSTTProvider: vi.fn()
}));

vi.mock('@/core/services/translation/UnifiedTranslationService.js', () => ({
  UnifiedTranslationService: vi.fn()
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('live-caption offscreen contracts', () => {
  beforeEach(() => {
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async (request) => {
          if (request.action === BROWSER_SPEECH_PROBE_ACTION) {
            return {
              runtime: 'offscreen',
              hasSpeechRecognition: true,
              hasWebkitSpeechRecognition: false,
              canConstruct: true,
              canStart: true,
              errorName: null,
              errorMessage: null,
              userAgent: 'test-agent'
            };
          }

          return createLiveCaptionRuntimeShellResponse(request.action, {
            sessionId: request.data?.sessionId ?? null,
            tabId: request.data?.tabId ?? null,
            videoFingerprint: request.data?.videoFingerprint ?? null,
            requestId: request.messageId ?? null,
            status: request.action === LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE
              ? LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL
              : request.action === LIVE_CAPTION_RUNTIME_ACTIONS.STOP
                ? LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE
                : LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
            runtimeState: request.action === LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE
              ? 'paused'
              : request.action === LIVE_CAPTION_RUNTIME_ACTIONS.STOP
                ? 'idle'
                : 'running',
            message: 'Live-caption offscreen shell response'
          });
        })
      },
      tabCapture: {
        capture: vi.fn()
      }
    };
  });

  it('creates and validates start/stop/status request payloads', () => {
    const start = createLiveCaptionStartCaptureRequest({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      captureOptions: { audio: true }
    });
    const stop = createLiveCaptionStopCaptureRequest({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      reason: 'user'
    });
    const status = createLiveCaptionStatusRequest({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    expect(start.type).toBe(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.START_CAPTURE_REQUEST);
    expect(start.captureOptions).toEqual({ audio: true });
    expect(stop.type).toBe(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.STOP_CAPTURE_REQUEST);
    expect(stop.reason).toBe('user');
    expect(status.type).toBe(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.STATUS_REQUEST);
    expect(() => createLiveCaptionStartCaptureRequest({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      captureOptions: { rawStream: {} }
    })).toThrow('Raw stream handoff is not allowed');
    expect(() => createLiveCaptionStartCaptureRequest({ tabId: 7, videoFingerprint: 'video-a' })).toThrow();
    expect(() => createLiveCaptionStopCaptureRequest({ sessionId: 'session-1', tabId: 7 })).toThrow();
    expect(() => createLiveCaptionStatusRequest({ sessionId: 'session-1', videoFingerprint: 'video-a' })).toThrow();
  });

  it('creates and validates streaming session and transcript event payloads', () => {
    const transcriptEvent = normalizeLiveCaptionTranscriptEvent({
      eventId: 'event-1',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      providerId: 'deepgram_streaming',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      segmentId: 'segment-1',
      revision: 1,
      segmentStartMs: 1000,
      segmentEndMs: 1400,
      text: 'hello world',
      createdAt: 100
    });

    const start = createLiveCaptionStartStreamingSttSessionRequest({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      providerOptions: {
        endpoint: 'wss://example.invalid'
      },
      metadata: {
        codec: 'opus'
      }
    });
    const stop = createLiveCaptionStopStreamingSttSessionRequest({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      reason: 'user'
    });
    const eventMessage = createLiveCaptionStreamingSttTranscriptEventMessage({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      event: transcriptEvent
    });
    const status = createLiveCaptionStreamingSttStatusMessage({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      status: 'active',
      details: { bufferDepth: 2 }
    });
    const error = createLiveCaptionStreamingSttErrorMessage({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      error: {
        code: 'streaming_error',
        message: 'socket closed'
      }
    });

    expect(start.type).toBe(LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION);
    expect(start.providerMode).toBe(STT_PROVIDER_MODES.STREAMING);
    expect(start.executionLocation).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN);
    expect(start.providerOptions).toEqual({ endpoint: 'wss://example.invalid' });
    expect(start.metadata).toEqual({ codec: 'opus' });
    expect(stop.type).toBe(LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STOP_STREAMING_STT_SESSION);
    expect(eventMessage.type).toBe(LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT);
    expect(eventMessage.event).toEqual(transcriptEvent);
    expect(status.type).toBe(LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS);
    expect(error.type).toBe(LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR);

    expect(() => createLiveCaptionStartStreamingSttSessionRequest({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      providerMode: 'batch',
      executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN
    })).toThrow(/providerMode/i);

    expect(() => createLiveCaptionStartStreamingSttSessionRequest({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      providerId: 'deepgram_streaming',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.BACKGROUND
    })).toThrow(/executionLocation/i);

    expect(() => createLiveCaptionStreamingSttTranscriptEventMessage({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      event: {}
    })).toThrow(/eventType/i);
  });

  it('creates finalized chunk DTOs and rejects raw stream-like payloads', () => {
    const chunk = createLiveCaptionFinalizedChunkMessage({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 1000,
      chunkEndMs: 2500,
      mimeType: 'audio/webm',
      chunkPayload: 'blob:chunk-1'
    });

    expect(chunk.type).toBe(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK);
    expect(chunk.chunkStartMs).toBe(1000);
    expect(chunk.chunkEndMs).toBe(2500);
    expect(chunk.mimeType).toBe('audio/webm');

    expect(() => createLiveCaptionFinalizedChunkMessage({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 2500,
      chunkEndMs: 1000,
      mimeType: 'audio/webm',
      chunkPayload: 'blob:chunk-1'
    })).toThrow();

    expect(() => createLiveCaptionFinalizedChunkMessage({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 1000,
      chunkEndMs: 2500,
      mimeType: 'audio/webm',
      chunkPayload: {
        getTracks: vi.fn()
      }
    })).toThrow('Raw stream handoff is not allowed');

    expect(() => createLiveCaptionFinalizedChunkMessage({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      chunkStartMs: 1000,
      chunkEndMs: 2500,
      chunkPayload: 'blob:chunk-1'
    })).toThrow();
  });

  it('normalizes status and snapshot responses', () => {
    const response = createLiveCaptionOffscreenSnapshotResponse({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      status: LIVE_CAPTION_CAPTURE_STATES.ACTIVE,
      sessionSnapshot: { sessionId: 'session-1' }
    });
    const statusResponse = normalizeLiveCaptionOffscreenResponse({
      type: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.STATUS_RESPONSE,
      ok: true,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      status: LIVE_CAPTION_CAPTURE_STATES.ACTIVE
    });
    const normalized = normalizeLiveCaptionOffscreenResponse(response);
    const invalid = normalizeLiveCaptionOffscreenResponse(null, {
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    expect(statusResponse.ok).toBe(true);
    expect(statusResponse.type).toBe(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.STATUS_RESPONSE);
    expect(normalized.ok).toBe(true);
    expect(normalized.status).toBe(LIVE_CAPTION_CAPTURE_STATES.ACTIVE);
    expect(invalid.ok).toBe(false);
    expect(invalid.failClosed).toBe(true);
    expect(invalid.error.code).toBe(LIVE_CAPTION_OFFSCREEN_ERROR_CODES.INVALID_RESPONSE);
  });

  it('creates capture error and fail-closed responses', () => {
    const errorMessage = createLiveCaptionCaptureErrorMessage({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      code: LIVE_CAPTION_OFFSCREEN_ERROR_CODES.MISSING_PAYLOAD,
      message: 'missing payload'
    });
    const failClosed = createLiveCaptionFailClosedResponse({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      reason: 'reconciliation_failed'
    });

    expect(errorMessage.type).toBe(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.CAPTURE_ERROR);
    expect(errorMessage.error.code).toBe(LIVE_CAPTION_OFFSCREEN_ERROR_CODES.MISSING_PAYLOAD);
    expect(failClosed.failClosed).toBe(true);
    expect(failClosed.error.reason).toBe('reconciliation_failed');
  });

  it('models coordinator start/stop and fail-closed behavior without capture side effects', () => {
    const bridge = new LiveCaptionOffscreenBridge();
    const coordinator = new LiveCaptionCaptureCoordinator({ bridge });

    const startRequest = coordinator.startCapture({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      captureOptions: { audio: true }
    });
    const stopRequest = coordinator.stopCapture({
      reason: 'user'
    });
    const statusRequest = coordinator.requestStatus();
    const failClosed = coordinator.failClosed('reconciliation_failed', new Error('bad state'));

    expect(startRequest.type).toBe(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.START_CAPTURE_REQUEST);
    expect(stopRequest.type).toBe(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.STOP_CAPTURE_REQUEST);
    expect(statusRequest.type).toBe(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.STATUS_REQUEST);
    expect(coordinator.getSnapshot().status).toBe(LIVE_CAPTION_CAPTURE_STATES.ERROR);
    expect(failClosed.failClosed).toBe(true);
    expect(failClosed.error.reason).toBe('reconciliation_failed');
    expect(globalThis.chrome.tabCapture.capture).not.toHaveBeenCalled();
  });

  it('routes runtime shell requests through the offscreen bridge', async () => {
    const bridge = new LiveCaptionOffscreenBridge();

    const startResponse = await bridge.requestRuntimeStart({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });
    const statusResponse = await bridge.requestRuntimeStatus({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });
    const pauseResponse = await bridge.requestRuntimePause({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });
    const resumeResponse = await bridge.requestRuntimeResume({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });
    const stopResponse = await bridge.requestRuntimeStop({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledTimes(5);
    expect(startResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL);
    expect(statusResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL);
    expect(pauseResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL);
    expect(resumeResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL);
    expect(stopResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE);
  });

  it('routes browser speech probe requests through the offscreen bridge', async () => {
    const bridge = new LiveCaptionOffscreenBridge();

    const response = await bridge.requestBrowserSpeechProbe({
      timeoutMs: 50
    });

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: BROWSER_SPEECH_PROBE_ACTION,
      target: 'offscreen',
      forwardedFromBackground: true
    }));
    expect(response).toEqual(expect.objectContaining({
      runtime: 'offscreen',
      hasSpeechRecognition: true,
      hasWebkitSpeechRecognition: false,
      canConstruct: true,
      canStart: true,
      errorName: null,
      errorMessage: null
    }));
  });

  it('fails closed when offscreen runtime messaging is unavailable', async () => {
    const bridge = new LiveCaptionOffscreenBridge({
      browserApi: {
        runtime: {}
      }
    });

    const response = await bridge.requestRuntimeStart({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    expect(response.success).toBe(false);
    expect(response.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OFFSCREEN_NOT_READY);
    expect(response.error.code).toBe(LIVE_CAPTION_OFFSCREEN_ERROR_CODES.OFFSCREEN_UNAVAILABLE);
  });

  it('does not route through STT, translation, or cache layers', () => {
    const bridge = new LiveCaptionOffscreenBridge();
    const coordinator = new LiveCaptionCaptureCoordinator({ bridge });

    coordinator.startCapture({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });
    coordinator.createFinalizedChunkMessage({
      chunkStartMs: 100,
      chunkEndMs: 200,
      mimeType: 'audio/webm',
      chunkPayload: 'blob:chunk-1'
    });
    coordinator.stopCapture({
      reason: 'stop'
    });

    expect(globalThis.chrome.tabCapture.capture).not.toHaveBeenCalled();
    expect(LiveCaptionCache).not.toHaveBeenCalled();
    expect(BaseSTTProvider).not.toHaveBeenCalled();
    expect(UnifiedTranslationService).not.toHaveBeenCalled();
  });
});
