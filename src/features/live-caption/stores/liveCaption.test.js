import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import useLiveCaptionStore from './liveCaption.js';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import { LIVE_CAPTION_CONSENT_STATES } from '../core/LiveCaptionConsentPolicy.js';
import { LIVE_CAPTION_CAPTION_DISPLAY_MODES } from '../core/LiveCaptionCaptionDisplayMode.js';

describe('live-caption store shell', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with shell defaults', () => {
    const store = useLiveCaptionStore();

    expect(store.status).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(store.isEnabled).toBe(false);
    expect(store.overlayVisible).toBe(false);
    expect(store.consentState).toBe(LIVE_CAPTION_CONSENT_STATES.NOT_ASKED);
    expect(store.consentAccepted).toBe(false);
    expect(store.consentNoticeVisible).toBe(false);
    expect(store.privacyNotice).toMatchObject({
      title: expect.stringContaining('Live Caption'),
      message: expect.stringContaining('tab audio')
    });
    expect(store.captionDisplayMode).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY);
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
    store.setPrivacyNotice({
      title: 'Notice',
      message: 'Custom notice',
      details: []
    });
    store.setStartupDeniedReason('unsupported_browser', { browserName: 'firefox' });
    store.setContext({ tabId: 1, videoFingerprint: 'video-1', nextSessionId: 'session-1' });
    store.setLastError(new Error('boom'));
    store.setCaptions([{ sessionId: 'session-1', originalText: 'Hi', translatedText: 'سلام' }]);
    store.setControlsState({ canStop: true, canRetry: true });

    store.reset();

    expect(store.status).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(store.overlayVisible).toBe(false);
    expect(store.consentState).toBe(LIVE_CAPTION_CONSENT_STATES.NOT_ASKED);
    expect(store.consentAccepted).toBe(false);
    expect(store.consentNoticeVisible).toBe(false);
    expect(store.startupDeniedReason).toBe(null);
    expect(store.startupDeniedDetails).toBe(null);
    expect(store.sessionId).toBe(null);
    expect(store.activeTabId).toBe(null);
    expect(store.activeVideoFingerprint).toBe(null);
    expect(store.lastError).toBe(null);
    expect(store.isEnabled).toBe(false);
    expect(store.captionLines).toEqual([]);
    expect(store.captionDisplayMode).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY);
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

    store.setCaptionDisplayMode(LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL);
    store.setConsentNoticeVisible(true);
    expect(store.consentNoticeVisible).toBe(true);
    expect(store.consentState).toBe(LIVE_CAPTION_CONSENT_STATES.PENDING);

    store.acceptConsent();
    expect(store.consentAccepted).toBe(true);
    expect(store.consentNoticeVisible).toBe(false);
    expect(store.consentState).toBe(LIVE_CAPTION_CONSENT_STATES.ACCEPTED);

    store.cancelConsent();
    expect(store.consentAccepted).toBe(false);
    expect(store.consentState).toBe(LIVE_CAPTION_CONSENT_STATES.CANCELED);

    store.revokeConsent();
    expect(store.consentAccepted).toBe(false);
    expect(store.consentNoticeVisible).toBe(true);
    expect(store.consentState).toBe(LIVE_CAPTION_CONSENT_STATES.REVOKED);

    store.resetOverlayState();
    expect(store.overlayVisible).toBe(false);
    expect(store.consentAccepted).toBe(false);
    expect(store.consentNoticeVisible).toBe(false);
    expect(store.consentState).toBe(LIVE_CAPTION_CONSENT_STATES.NOT_ASKED);
    expect(store.captionLines).toEqual([]);
    expect(store.captionDisplayMode).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY);
    expect(store.lastError).toBe(null);
  });

  it('normalizes and exposes display-mode aware caption helpers', () => {
    const store = useLiveCaptionStore();

    store.setCaptionDisplayMode(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSCRIPT_ONLY);

    expect(store.captionDisplayMode).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSCRIPT_ONLY);

    const display = store.getCaptionLineDisplay({
      originalText: 'Hello',
      translatedText: 'سلام'
    });

    expect(display.mode).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSCRIPT_ONLY);
    expect(display.rows).toHaveLength(1);
    expect(display.rows[0]).toMatchObject({
      kind: 'original',
      text: 'Hello'
    });

    const lines = store.getCaptionLinesForDisplayMode([
      {
        originalText: 'Hello',
        translatedText: 'سلام'
      }
    ], LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL);

    expect(lines[0].display.mode).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL);
    expect(lines[0].display.rows).toHaveLength(2);
  });

  it('tracks startup denial reasons without runtime behavior', () => {
    const store = useLiveCaptionStore();

    store.setStartupDeniedReason('unsupported_browser', { browserName: 'firefox' });

    expect(store.startupDeniedReason).toBe('unsupported_browser');
    expect(store.startupDeniedDetails).toEqual({ browserName: 'firefox' });

    store.clearStartupDeniedReason();
    expect(store.startupDeniedReason).toBe(null);
    expect(store.startupDeniedDetails).toBe(null);
  });
});
