import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  LiveCaptionCleanupCoordinator,
  LIVE_CAPTION_CLEANUP_REASONS,
  LIVE_CAPTION_CLEANUP_STEP_TYPES,
  LIVE_CAPTION_CLEANUP_RESULT_STATUSES,
  LIVE_CAPTION_CLEANUP_ERROR_CODES,
  createLiveCaptionCleanupPlan,
  createLiveCaptionCleanupResult,
  createLiveCaptionFailClosedCleanupResult,
  normalizeLiveCaptionCleanupError
} from './LiveCaptionCleanupCoordinator.js';
import { PageLiveCaptionSession } from './PageLiveCaptionSession.js';
import { VideoCaptionSession } from './VideoCaptionSession.js';
import { LiveCaptionSessionManager } from './LiveCaptionSessionManager.js';
import useLiveCaptionStore from '../stores/liveCaption.js';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import { LIVE_CAPTION_CONSENT_STATES } from './LiveCaptionConsentPolicy.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('live-caption cleanup coordinator', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('builds deterministic cleanup plans by reason', () => {
    const coordinator = new LiveCaptionCleanupCoordinator();

    const stopPlan = coordinator.createCleanupPlan({
      reason: LIVE_CAPTION_CLEANUP_REASONS.STOP,
      sessionSnapshot: { sessionId: 'page-1', tabId: 1, activeVideoFingerprint: 'video-1' }
    });
    const navigationPlan = createLiveCaptionCleanupPlan({
      reason: LIVE_CAPTION_CLEANUP_REASONS.NAVIGATION,
      sessionSnapshot: { sessionId: 'page-2', tabId: 2, activeVideoFingerprint: 'video-2' }
    });
    const providerPlan = createLiveCaptionCleanupPlan({
      reason: LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR,
      sessionSnapshot: { sessionId: 'page-3', tabId: 3, activeVideoFingerprint: 'video-3' }
    });

    expect(stopPlan.steps.map((step) => step.type)).toEqual([
      LIVE_CAPTION_CLEANUP_STEP_TYPES.STOP_OFFSCREEN_CAPTURE,
      LIVE_CAPTION_CLEANUP_STEP_TYPES.CLEANUP_PAGE_SESSION,
      LIVE_CAPTION_CLEANUP_STEP_TYPES.CLEANUP_VIDEO_SESSION,
      LIVE_CAPTION_CLEANUP_STEP_TYPES.CLEAR_OVERLAY_STATE,
      LIVE_CAPTION_CLEANUP_STEP_TYPES.PRESERVE_OR_CLEAR_CAPTIONS,
      LIVE_CAPTION_CLEANUP_STEP_TYPES.RELEASE_IN_MEMORY_STATE,
      LIVE_CAPTION_CLEANUP_STEP_TYPES.NOTIFY_CONTENT
    ]);
    expect(stopPlan.preserveCaptions).toBe(true);
    expect(stopPlan.clearCaptions).toBe(false);
    expect(stopPlan.clearCache).toBe(false);
    expect(stopPlan.sessionStatus).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);

    expect(navigationPlan.preserveCaptions).toBe(false);
    expect(navigationPlan.clearCaptions).toBe(true);
    expect(navigationPlan.sessionStatus).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);

    expect(providerPlan.preserveCaptions).toBe(true);
    expect(providerPlan.sessionStatus).toBe(LIVE_CAPTION_SESSION_STATES.ERROR);
    expect(providerPlan.status).toBe(LIVE_CAPTION_CLEANUP_RESULT_STATUSES.PLANNED);
  });

  it('only clears per-video cache when explicitly requested', () => {
    const plan = createLiveCaptionCleanupPlan({
      reason: LIVE_CAPTION_CLEANUP_REASONS.STOP,
      clearCache: false
    });
    const explicitPlan = createLiveCaptionCleanupPlan({
      reason: LIVE_CAPTION_CLEANUP_REASONS.STOP,
      clearCache: true
    });

    expect(plan.steps.some((step) => step.type === LIVE_CAPTION_CLEANUP_STEP_TYPES.CLEAR_PER_VIDEO_CACHE)).toBe(false);
    expect(explicitPlan.steps.some((step) => step.type === LIVE_CAPTION_CLEANUP_STEP_TYPES.CLEAR_PER_VIDEO_CACHE)).toBe(true);
  });

  it('normalizes cleanup errors without leaking raw payloads', () => {
    const error = normalizeLiveCaptionCleanupError(new Error('provider failed'), {
      stage: 'provider',
      reason: LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-1',
      shouldStopCapture: true
    });

    expect(error).toMatchObject({
      message: 'provider failed',
      stage: 'provider',
      reason: LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR,
      cleanupReason: LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-1',
      shouldStopCapture: true
    });
    expect(error.code).toBe(LIVE_CAPTION_CLEANUP_ERROR_CODES.CLEANUP_FAILED);
    expect(error.provider).toBe(null);
    expect(error.stack).toContain('provider failed');
  });

  it('returns fail-closed recovery cleanup results', () => {
    const result = createLiveCaptionFailClosedCleanupResult({
      sessionSnapshot: { sessionId: 'session-1', tabId: 7, activeVideoFingerprint: 'video-1' },
      error: new Error('reconcile failed')
    });

    expect(result.status).toBe(LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED);
    expect(result.sessionStatus).toBe(LIVE_CAPTION_SESSION_STATES.ERROR);
    expect(result.preserveCaptions).toBe(false);
    expect(result.clearCaptions).toBe(true);
    expect(result.notifyContent).toBe(true);
    expect(result.steps.map((step) => step.type)).toContain(LIVE_CAPTION_CLEANUP_STEP_TYPES.STOP_OFFSCREEN_CAPTURE);
    expect(result.steps.map((step) => step.type)).toContain(LIVE_CAPTION_CLEANUP_STEP_TYPES.NOTIFY_CONTENT);
    expect(result.error.code).toBe(LIVE_CAPTION_CLEANUP_ERROR_CODES.RECOVERY_RECONCILIATION_FAILED);
  });

  it('supports session cleanup snapshots and manager cleanup snapshots', () => {
    const pageSession = new PageLiveCaptionSession({ tabId: 11, consentAccepted: true });
    const videoSession = new VideoCaptionSession({ tabId: 11, videoFingerprint: 'video-11' });
    const manager = new LiveCaptionSessionManager();

    pageSession.attachVideoSession(videoSession);
    manager.createSession(11);

    expect(pageSession.getCleanupSnapshot()).toMatchObject({
      tabId: 11,
      activeVideoFingerprint: 'video-11'
    });
    expect(videoSession.getCleanupSnapshot()).toMatchObject({
      tabId: 11,
      videoFingerprint: 'video-11'
    });
    expect(manager.getCleanupSnapshot(11)).toMatchObject({
      tabId: 11
    });
  });

  it('applies cleanup results to the live-caption store without runtime side effects', () => {
    const store = useLiveCaptionStore();

    store.setContext({ tabId: 11, videoFingerprint: 'video-11', nextSessionId: 'session-11' });
    store.acceptConsent();
    store.setConsentNoticeVisible(true);
    store.setCaptions([
      {
        sessionId: 'session-11',
        videoFingerprint: 'video-11',
        segmentStartMs: 0,
        segmentEndMs: 100,
        originalText: 'Hello',
        translatedText: 'Hola',
        isFinal: true
      }
    ]);
    store.setOverlayVisible(true);
    store.setStartupDeniedReason('unsupported_browser', { browserName: 'firefox' });

    store.applyCleanupResult({
      sessionStatus: LIVE_CAPTION_SESSION_STATES.IDLE,
      preserveCaptions: true,
      clearSessionIdentity: true,
      error: null
    });

    expect(store.overlayVisible).toBe(false);
    expect(store.captionLines).toHaveLength(1);
    expect(store.consentState).toBe(LIVE_CAPTION_CONSENT_STATES.NOT_ASKED);
    expect(store.sessionId).toBe(null);
    expect(store.activeTabId).toBe(null);
    expect(store.lastError).toBe(null);
    expect(store.status).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);

    store.applyCleanupResult({
      sessionStatus: LIVE_CAPTION_SESSION_STATES.ERROR,
      preserveCaptions: false,
      clearSessionIdentity: true,
      error: {
        code: LIVE_CAPTION_CLEANUP_ERROR_CODES.CLEANUP_FAILED,
        message: 'cleanup failed',
        stage: 'cleanup',
        reason: LIVE_CAPTION_CLEANUP_REASONS.ERROR
      }
    });

    expect(store.captionLines).toEqual([]);
    expect(store.lastError).toMatchObject({
      code: LIVE_CAPTION_CLEANUP_ERROR_CODES.CLEANUP_FAILED,
      message: 'cleanup failed'
    });
    expect(store.status).toBe(LIVE_CAPTION_SESSION_STATES.ERROR);
  });

  it('creates cleanup results without cache clearing unless requested', () => {
    const result = createLiveCaptionCleanupResult({
      reason: LIVE_CAPTION_CLEANUP_REASONS.STOP,
      sessionSnapshot: {
        sessionId: 'session-1',
        tabId: 1,
        activeVideoFingerprint: 'video-1'
      }
    });

    expect(result.clearCache).toBe(false);
    expect(result.steps.some((step) => step.type === LIVE_CAPTION_CLEANUP_STEP_TYPES.CLEAR_PER_VIDEO_CACHE)).toBe(false);
  });
});
