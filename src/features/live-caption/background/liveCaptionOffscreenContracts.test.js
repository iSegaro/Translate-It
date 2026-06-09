import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIVE_CAPTION_CAPTURE_STATES,
  LIVE_CAPTION_OFFSCREEN_ERROR_CODES,
  LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES,
  LiveCaptionOffscreenBridge,
  LiveCaptionCaptureCoordinator,
  createLiveCaptionStartCaptureRequest,
  createLiveCaptionStopCaptureRequest,
  createLiveCaptionStatusRequest,
  createLiveCaptionFinalizedChunkMessage,
  createLiveCaptionCaptureErrorMessage,
  createLiveCaptionOffscreenSnapshotResponse,
  createLiveCaptionFailClosedResponse,
  normalizeLiveCaptionOffscreenResponse
} from './index.js';
import { LiveCaptionCache } from '@/features/live-caption/cache/LiveCaptionCache.js';
import { BaseSTTProvider } from '@/features/live-caption/stt/BaseSTTProvider.js';
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
