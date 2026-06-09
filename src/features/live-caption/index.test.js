import { describe, it, expect } from 'vitest';
import {
  LiveCaptionFeature,
  LIVE_CAPTION_ACTIONS,
  LIVE_CAPTION_SETTINGS_KEYS,
  LIVE_CAPTION_DEFAULTS,
  LIVE_CAPTION_SESSION_STATES,
  PageLiveCaptionSession,
  VideoCaptionSession,
  LiveCaptionSessionManager,
  BaseSTTProvider,
  useLiveCaptionStore
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
    expect(LiveCaptionFeature.store).toBe(useLiveCaptionStore);
  });

  it('exports placeholder contracts without side effects', () => {
    expect(PageLiveCaptionSession).toBeTypeOf('function');
    expect(VideoCaptionSession).toBeTypeOf('function');
    expect(LiveCaptionSessionManager).toBeTypeOf('function');
    expect(BaseSTTProvider).toBeTypeOf('function');
  });
});
