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
  createLiveCaptionTranslatedSegmentCacheKey
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
  });

  it('exports session contracts without runtime wiring', () => {
    expect(PageLiveCaptionSession).toBeTypeOf('function');
    expect(VideoCaptionSession).toBeTypeOf('function');
    expect(LiveCaptionSessionManager).toBeTypeOf('function');
    expect(BaseSTTProvider).toBeTypeOf('function');
  });
});
