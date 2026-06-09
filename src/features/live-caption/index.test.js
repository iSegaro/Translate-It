import { describe, it, expect } from 'vitest';
import {
  LiveCaptionFeature,
  LIVE_CAPTION_ACTIONS,
  LIVE_CAPTION_SETTINGS_KEYS,
  LIVE_CAPTION_DEFAULTS,
  LIVE_CAPTION_SESSION_STATES,
  LIVE_CAPTION_CLEANUP_REASONS,
  createLiveCaptionSessionSnapshot,
  createVideoCaptionSessionSnapshot,
  PageLiveCaptionSession,
  VideoCaptionSession,
  LiveCaptionSessionManager,
  BaseSTTProvider,
  useLiveCaptionStore,
  ActiveVideoDetector,
  VideoFingerprint,
  LiveCaptionCacheKeys,
  createLiveCaptionVideoCacheKey,
  createLiveCaptionSegmentCacheKey,
  createLiveCaptionTranslatedSegmentCacheKey,
  LiveCaptionOffscreenBridge,
  LiveCaptionCaptureCoordinator,
  LIVE_CAPTION_CAPTURE_STATES,
  LIVE_CAPTION_OFFSCREEN_ERROR_CODES,
  LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES,
  createLiveCaptionStartCaptureRequest,
  createLiveCaptionStopCaptureRequest,
  createLiveCaptionStatusRequest,
  createLiveCaptionFinalizedChunkMessage,
  createLiveCaptionCaptureErrorMessage,
  createLiveCaptionOffscreenSnapshotResponse,
  createLiveCaptionFailClosedResponse,
  normalizeLiveCaptionOffscreenResponse
} from './index.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { CONFIG } from '@/shared/config/config.js';

describe('live-caption feature shell', () => {
  it('exports constants and contracts from the public entry point', () => {
    expect(LiveCaptionFeature.actions).toBe(LIVE_CAPTION_ACTIONS);
    expect(LIVE_CAPTION_ACTIONS.START_REQUEST).toBe(MessageActions.LIVE_CAPTION_START_REQUEST);
    expect(LIVE_CAPTION_SETTINGS_KEYS.ENABLED).toBe('LIVE_CAPTION_ENABLED');
    expect(LIVE_CAPTION_DEFAULTS.ENABLED).toBe(CONFIG.LIVE_CAPTION_ENABLED);
    expect(LIVE_CAPTION_DEFAULTS.OPENAI_API_KEY_SETTING).toBe('OPENAI_API_KEY');
    expect(LIVE_CAPTION_SESSION_STATES.IDLE).toBe('idle');
    expect(LIVE_CAPTION_CLEANUP_REASONS.STOP).toBe('stop');
    expect(LiveCaptionFeature.store).toBe(useLiveCaptionStore);
    expect(LiveCaptionFeature.cleanupReasons).toBe(LIVE_CAPTION_CLEANUP_REASONS);
    expect(LiveCaptionFeature.contracts.createLiveCaptionSessionSnapshot).toBe(createLiveCaptionSessionSnapshot);
    expect(LiveCaptionFeature.contracts.createVideoCaptionSessionSnapshot).toBe(createVideoCaptionSessionSnapshot);
    expect(ActiveVideoDetector).toBe(LiveCaptionFeature.contracts.ActiveVideoDetector);
    expect(VideoFingerprint).toBe(LiveCaptionFeature.contracts.VideoFingerprint);
    expect(LiveCaptionCacheKeys).toBe(LiveCaptionFeature.contracts.LiveCaptionCacheKeys);
    expect(createLiveCaptionVideoCacheKey).toBe(LiveCaptionFeature.contracts.createLiveCaptionVideoCacheKey);
    expect(createLiveCaptionSegmentCacheKey).toBe(LiveCaptionFeature.contracts.createLiveCaptionSegmentCacheKey);
    expect(createLiveCaptionTranslatedSegmentCacheKey).toBe(LiveCaptionFeature.contracts.createLiveCaptionTranslatedSegmentCacheKey);
    expect(LiveCaptionOffscreenBridge).toBe(LiveCaptionFeature.contracts.LiveCaptionOffscreenBridge);
    expect(LiveCaptionCaptureCoordinator).toBe(LiveCaptionFeature.contracts.LiveCaptionCaptureCoordinator);
    expect(LIVE_CAPTION_CAPTURE_STATES).toBe(LiveCaptionFeature.contracts.LIVE_CAPTION_CAPTURE_STATES);
    expect(LIVE_CAPTION_OFFSCREEN_ERROR_CODES).toBe(LiveCaptionFeature.contracts.LIVE_CAPTION_OFFSCREEN_ERROR_CODES);
    expect(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES).toBe(LiveCaptionFeature.contracts.LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES);
    expect(createLiveCaptionStartCaptureRequest).toBe(LiveCaptionFeature.contracts.createLiveCaptionStartCaptureRequest);
    expect(createLiveCaptionStopCaptureRequest).toBe(LiveCaptionFeature.contracts.createLiveCaptionStopCaptureRequest);
    expect(createLiveCaptionStatusRequest).toBe(LiveCaptionFeature.contracts.createLiveCaptionStatusRequest);
    expect(createLiveCaptionFinalizedChunkMessage).toBe(LiveCaptionFeature.contracts.createLiveCaptionFinalizedChunkMessage);
    expect(createLiveCaptionCaptureErrorMessage).toBe(LiveCaptionFeature.contracts.createLiveCaptionCaptureErrorMessage);
    expect(createLiveCaptionOffscreenSnapshotResponse).toBe(LiveCaptionFeature.contracts.createLiveCaptionOffscreenSnapshotResponse);
    expect(createLiveCaptionFailClosedResponse).toBe(LiveCaptionFeature.contracts.createLiveCaptionFailClosedResponse);
    expect(normalizeLiveCaptionOffscreenResponse).toBe(LiveCaptionFeature.contracts.normalizeLiveCaptionOffscreenResponse);
  });

  it('exports session contracts without runtime wiring', () => {
    expect(PageLiveCaptionSession).toBeTypeOf('function');
    expect(VideoCaptionSession).toBeTypeOf('function');
    expect(LiveCaptionSessionManager).toBeTypeOf('function');
    expect(BaseSTTProvider).toBeTypeOf('function');
  });
});
