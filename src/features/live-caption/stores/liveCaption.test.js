import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import useLiveCaptionStore from './liveCaption.js';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';

describe('live-caption store shell', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with shell defaults', () => {
    const store = useLiveCaptionStore();

    expect(store.status).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(store.isEnabled).toBe(false);
    expect(store.overlayVisible).toBe(false);
    expect(store.consentAccepted).toBe(false);
    expect(store.sessionId).toBe(null);
    expect(store.isEnabled).toBe(false);
  });

  it('resets shell state without runtime behavior', () => {
    const store = useLiveCaptionStore();
    store.setStatus(LIVE_CAPTION_SESSION_STATES.ACTIVE);
    store.setOverlayVisible(true);
    store.acceptConsent();
    store.setContext({ tabId: 1, videoFingerprint: 'video-1', nextSessionId: 'session-1' });
    store.setLastError(new Error('boom'));

    store.reset();

    expect(store.status).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(store.overlayVisible).toBe(false);
    expect(store.consentAccepted).toBe(false);
    expect(store.sessionId).toBe(null);
    expect(store.activeTabId).toBe(null);
    expect(store.activeVideoFingerprint).toBe(null);
    expect(store.lastError).toBe(null);
    expect(store.isEnabled).toBe(false);
  });
});
