import { describe, it, expect } from 'vitest';
import { MessageActions } from './MessageActions.js';
import { MessageContexts } from './MessagingConstants.js';

describe('Live caption messaging constants', () => {
  it('registers live-caption actions', () => {
    expect(MessageActions.LIVE_CAPTION_START_REQUEST).toBe('LIVE_CAPTION_START_REQUEST');
    expect(MessageActions.LIVE_CAPTION_AUDIO_CHUNK).toBe('LIVE_CAPTION_AUDIO_CHUNK');
    expect(MessageActions.LIVE_CAPTION_TRANSLATE_RESULT).toBe('LIVE_CAPTION_TRANSLATE_RESULT');
    expect(MessageActions.isValidAction(MessageActions.LIVE_CAPTION_STATUS)).toBe(true);
  });

  it('registers a live-caption message context', () => {
    expect(MessageContexts.LIVE_CAPTION).toBe('live-caption');
  });
});
