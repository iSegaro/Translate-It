import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import useLiveCaptionStore from './liveCaption.js';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import { LIVE_CAPTION_RUNTIME_STATES } from '../constants/liveCaptionRuntimeStates.js';
import { LIVE_CAPTION_CAPTION_DISPLAY_MODES } from '../core/LiveCaptionCaptionDisplayMode.js';

describe('live-caption store shell', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with shell defaults', () => {
    const store = useLiveCaptionStore();

    expect(store.status).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(store.activeSessionState).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(store.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.IDLE);
    expect(store.isEnabled).toBe(false);
    expect(store.overlayVisible).toBe(false);
    expect(store.captionDisplayMode).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY);
    expect(store.sessionId).toBe(null);
    expect(store.activeVideoState).toBe(null);
    expect(store.captionLines).toEqual([]);
    expect(store.controlsState).toEqual({
      canStart: true,
      canStop: false,
      canRetry: false,
      canPause: false,
      canResume: false,
      canClearCache: false
    });
  });

  it('resets shell state without runtime behavior', () => {
    const store = useLiveCaptionStore();
    store.setStatus(LIVE_CAPTION_SESSION_STATES.ACTIVE);
    store.setRuntimeStatus(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
    store.setActiveVideoState({
      videoFingerprint: 'video-1',
      handoffAction: 'create_new_video_session'
    });
    store.setOverlayVisible(true);
    store.setContext({ tabId: 1, videoFingerprint: 'video-1', nextSessionId: 'session-1' });
    store.setLastError(new Error('boom'));
    store.setCaptions([{ sessionId: 'session-1', originalText: 'Hi', translatedText: 'سلام' }]);
    store.setControlsState({ canStop: true, canRetry: true });

    store.reset();

    expect(store.status).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(store.activeSessionState).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(store.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.IDLE);
    expect(store.overlayVisible).toBe(false);
    expect(store.sessionId).toBe(null);
    expect(store.activeTabId).toBe(null);
    expect(store.activeVideoFingerprint).toBe(null);
    expect(store.activeVideoState).toBe(null);
    expect(store.lastError).toBe(null);
    expect(store.isEnabled).toBe(false);
    expect(store.captionLines).toEqual([]);
    expect(store.captionDisplayMode).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY);
    expect(store.controlsState).toEqual({
      canStart: true,
      canStop: false,
      canRetry: false,
      canPause: false,
      canResume: false,
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

  it('tracks runtime lifecycle state and active video metadata', () => {
    const store = useLiveCaptionStore();

    store.setEnabled(true);
    expect(store.isEnabled).toBe(true);
    expect(store.overlayVisible).toBe(true);

    store.setRuntimeStatus(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
    expect(store.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);

    store.setActiveSessionState(LIVE_CAPTION_SESSION_STATES.ACTIVE);
    expect(store.status).toBe(LIVE_CAPTION_SESSION_STATES.ACTIVE);
    expect(store.activeSessionState).toBe(LIVE_CAPTION_SESSION_STATES.ACTIVE);

    store.setActiveVideoState({
      videoFingerprint: 'video-1',
      videoSessionId: 'session-1',
      handoffAction: 'create_new_video_session'
    });

    expect(store.activeVideoState).toMatchObject({
      videoFingerprint: 'video-1',
      videoSessionId: 'session-1',
      handoffAction: 'create_new_video_session'
    });

    store.clearActiveVideoState();
    expect(store.activeVideoState).toBe(null);
  });

  it('controls overlay reset state', () => {
    const store = useLiveCaptionStore();

    store.setCaptionDisplayMode(LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL);
    store.resetOverlayState();
    expect(store.overlayVisible).toBe(false);
    expect(store.runtimeStatus).toBe(LIVE_CAPTION_RUNTIME_STATES.IDLE);
    expect(store.activeSessionState).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(store.isEnabled).toBe(false);
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
});
