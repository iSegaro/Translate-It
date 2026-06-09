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
    expect(store.consentNoticeVisible).toBe(false);
    expect(store.sessionId).toBe(null);
    expect(store.isEnabled).toBe(false);
    expect(store.captionLines).toEqual([]);
    expect(store.controlsState).toEqual({
      canStart: true,
      canStop: false,
      canRetry: false,
      canClearCache: false
    });
  });

  it('resets shell state without runtime behavior', () => {
    const store = useLiveCaptionStore();
    store.setStatus(LIVE_CAPTION_SESSION_STATES.ACTIVE);
    store.setOverlayVisible(true);
    store.acceptConsent();
    store.setContext({ tabId: 1, videoFingerprint: 'video-1', nextSessionId: 'session-1' });
    store.setLastError(new Error('boom'));
    store.setCaptions([{ sessionId: 'session-1', originalText: 'Hi', translatedText: 'سلام' }]);
    store.setControlsState({ canStop: true, canRetry: true });

    store.reset();

    expect(store.status).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(store.overlayVisible).toBe(false);
    expect(store.consentAccepted).toBe(false);
    expect(store.consentNoticeVisible).toBe(false);
    expect(store.sessionId).toBe(null);
    expect(store.activeTabId).toBe(null);
    expect(store.activeVideoFingerprint).toBe(null);
    expect(store.lastError).toBe(null);
    expect(store.isEnabled).toBe(false);
    expect(store.captionLines).toEqual([]);
    expect(store.controlsState).toEqual({
      canStart: true,
      canStop: false,
      canRetry: false,
      canClearCache: false
    });
  });

  it('appends and clears finalized captions without runtime side effects', () => {
    const store = useLiveCaptionStore();

    store.appendFinalizedCaption({
      sessionId: 'session-1',
      videoFingerprint: 'video-1',
      segmentStartMs: 100,
      segmentEndMs: 200,
      originalText: 'Hello',
      translatedText: 'سلام',
      isFinal: true
    });

    expect(store.captionLines).toHaveLength(1);
    expect(store.captionLines[0]).toMatchObject({
      sessionId: 'session-1',
      originalText: 'Hello',
      translatedText: 'سلام',
      isFinal: true
    });

    store.clearCaptions();
    expect(store.captionLines).toEqual([]);
  });

  it('controls consent visibility and overlay reset state', () => {
    const store = useLiveCaptionStore();

    store.setConsentNoticeVisible(true);
    expect(store.consentNoticeVisible).toBe(true);

    store.acceptConsent();
    expect(store.consentAccepted).toBe(true);
    expect(store.consentNoticeVisible).toBe(false);

    store.revokeConsent();
    expect(store.consentAccepted).toBe(false);
    expect(store.consentNoticeVisible).toBe(true);

    store.resetOverlayState();
    expect(store.overlayVisible).toBe(false);
    expect(store.consentAccepted).toBe(false);
    expect(store.consentNoticeVisible).toBe(false);
    expect(store.captionLines).toEqual([]);
    expect(store.lastError).toBe(null);
  });
});
