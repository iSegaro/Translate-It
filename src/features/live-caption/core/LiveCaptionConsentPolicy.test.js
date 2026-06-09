import { describe, it, expect, vi } from 'vitest';
import {
  LIVE_CAPTION_CONSENT_STATES,
  LIVE_CAPTION_CONSENT_DECISION_REASONS,
  LIVE_CAPTION_PLATFORM_SUPPORT_REASONS,
  LIVE_CAPTION_CONSENT_ACTION_RESULTS,
  LIVE_CAPTION_RECOVERY_FAILURE_ACTIONS,
  createLiveCaptionPlatformSupportResult,
  createLiveCaptionPrivacyNotice,
  createLiveCaptionConsentActionResult,
  createLiveCaptionRecoveryFailureResult,
  evaluateLiveCaptionStartEligibility,
  normalizeLiveCaptionConsentState
} from './LiveCaptionConsentPolicy.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('live-caption consent policy', () => {
  it('requires consent before start', () => {
    const support = createLiveCaptionPlatformSupportResult({ browserName: 'chrome', platform: 'desktop' });
    const result = evaluateLiveCaptionStartEligibility({
      consentState: LIVE_CAPTION_CONSENT_STATES.NOT_ASKED,
      platformSupport: support
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(LIVE_CAPTION_CONSENT_DECISION_REASONS.CONSENT_REQUIRED);
    expect(result.sessionScoped).toBe(true);
  });

  it('accepting consent allows start', () => {
    const support = createLiveCaptionPlatformSupportResult({ browserName: 'edge', platform: 'desktop' });
    const result = evaluateLiveCaptionStartEligibility({
      consentState: LIVE_CAPTION_CONSENT_STATES.ACCEPTED,
      platformSupport: support
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe(null);
    expect(result.platformSupport.supported).toBe(true);
  });

  it('canceled and revoked consent deny start', () => {
    const support = createLiveCaptionPlatformSupportResult({ browserName: 'chrome', platform: 'desktop' });

    const canceled = evaluateLiveCaptionStartEligibility({
      consentState: LIVE_CAPTION_CONSENT_STATES.CANCELED,
      platformSupport: support
    });
    const revoked = evaluateLiveCaptionStartEligibility({
      consentState: LIVE_CAPTION_CONSENT_STATES.REVOKED,
      platformSupport: support
    });

    expect(canceled.allowed).toBe(false);
    expect(canceled.reason).toBe(LIVE_CAPTION_CONSENT_DECISION_REASONS.CONSENT_CANCELED);
    expect(revoked.allowed).toBe(false);
    expect(revoked.reason).toBe(LIVE_CAPTION_CONSENT_DECISION_REASONS.CONSENT_REVOKED);
  });

  it('keeps consent session scoped and not persisted', () => {
    const acceptResult = createLiveCaptionConsentActionResult(LIVE_CAPTION_CONSENT_ACTION_RESULTS.ACCEPTED);
    const cancelResult = createLiveCaptionConsentActionResult(LIVE_CAPTION_CONSENT_ACTION_RESULTS.CANCELED);
    const notice = createLiveCaptionPrivacyNotice();

    expect(acceptResult.sessionScoped).toBe(true);
    expect(cancelResult.sessionScoped).toBe(true);
    expect(notice.metadata.rawAudioPersisted).toBe(false);
    expect(normalizeLiveCaptionConsentState('revoked')).toBe(LIVE_CAPTION_CONSENT_STATES.REVOKED);
  });

  it('describes tab audio and raw-audio persistence behavior', () => {
    const notice = createLiveCaptionPrivacyNotice();

    expect(notice.message).toContain('tab audio');
    expect(notice.message).toContain('Raw audio is not persisted');
    expect(notice.details.join(' ')).toContain('may be cached');
  });

  it('describes incognito session-only cache behavior', () => {
    const notice = createLiveCaptionPrivacyNotice({ isIncognito: true });

    expect(notice.metadata.storageMode).toBe('session-only');
    expect(notice.details.join(' ')).toContain('session-only');
  });

  it('reports unsupported browser and mobile platforms deterministically', () => {
    const firefox = createLiveCaptionPlatformSupportResult({ browserName: 'firefox', platform: 'desktop' });
    const mobile = createLiveCaptionPlatformSupportResult({ browserName: 'chrome', isMobile: true, platform: 'android' });

    expect(firefox.supported).toBe(false);
    expect(firefox.reason).toBe(LIVE_CAPTION_PLATFORM_SUPPORT_REASONS.FIREFOX_UNSUPPORTED);
    expect(mobile.supported).toBe(false);
    expect(mobile.reason).toBe(LIVE_CAPTION_PLATFORM_SUPPORT_REASONS.MOBILE_UNSUPPORTED);
  });

  it('returns fail-closed recovery failure results', () => {
    const result = createLiveCaptionRecoveryFailureResult({
      sessionId: 'session-1',
      tabId: 1,
      videoFingerprint: 'video-1'
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(LIVE_CAPTION_CONSENT_DECISION_REASONS.RECOVERY_FAILURE);
    expect(result.shouldStopCapture).toBe(true);
    expect(result.notifyContent).toBe(true);
    expect(result.action).toBe(LIVE_CAPTION_RECOVERY_FAILURE_ACTIONS.STOP_CAPTURE);
  });
});
