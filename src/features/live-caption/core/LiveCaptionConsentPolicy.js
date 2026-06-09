import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionConsentPolicy');

export const LIVE_CAPTION_CONSENT_STATES = Object.freeze({
  NOT_ASKED: 'not_asked',
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  CANCELED: 'canceled',
  REVOKED: 'revoked'
});

export const LIVE_CAPTION_CONSENT_DECISION_REASONS = Object.freeze({
  CONSENT_REQUIRED: 'consent_required',
  CONSENT_CANCELED: 'consent_canceled',
  CONSENT_REVOKED: 'consent_revoked',
  UNSUPPORTED_BROWSER: 'unsupported_browser',
  UNSUPPORTED_PLATFORM: 'unsupported_platform',
  RECOVERY_FAILURE: 'recovery_failure'
});

export const LIVE_CAPTION_PLATFORM_SUPPORT_REASONS = Object.freeze({
  SUPPORTED: 'supported',
  FIREFOX_UNSUPPORTED: 'firefox_unsupported',
  MOBILE_UNSUPPORTED: 'mobile_unsupported',
  DESKTOP_CHROME_EDGE_ONLY: 'desktop_chrome_edge_only',
  UNKNOWN_BROWSER: 'unknown_browser'
});

export const LIVE_CAPTION_CONSENT_ACTION_RESULTS = Object.freeze({
  ACCEPTED: 'accepted',
  CANCELED: 'canceled'
});

export const LIVE_CAPTION_RECOVERY_FAILURE_ACTIONS = Object.freeze({
  STOP_CAPTURE: 'stop_capture',
  NOTIFY_CONTENT: 'notify_content'
});

function normalizeBrowserName(browserName) {
  return String(browserName || '').trim().toLowerCase();
}

function cloneObject(value) {
  if (!value || typeof value !== 'object') {
    return value ?? null;
  }

  return { ...value };
}

export function createLiveCaptionPlatformSupportResult({
  browserName = 'unknown',
  platform = 'desktop',
  isMobile = false
} = {}) {
  const normalizedBrowser = normalizeBrowserName(browserName);
  const normalizedPlatform = String(platform || 'desktop').trim().toLowerCase();
  const mobileDetected = Boolean(isMobile) || ['android', 'ios', 'mobile'].includes(normalizedPlatform);

  let supported = true;
  let reason = LIVE_CAPTION_PLATFORM_SUPPORT_REASONS.SUPPORTED;
  let message = 'Live Caption is supported on Chrome or Edge desktop.';

  if (mobileDetected) {
    supported = false;
    reason = LIVE_CAPTION_PLATFORM_SUPPORT_REASONS.MOBILE_UNSUPPORTED;
    message = 'Live Caption is not supported on mobile platforms.';
  } else if (normalizedBrowser === 'firefox') {
    supported = false;
    reason = LIVE_CAPTION_PLATFORM_SUPPORT_REASONS.FIREFOX_UNSUPPORTED;
    message = 'Live Caption is not supported on Firefox in the MVP.';
  } else if (!['chrome', 'edge'].includes(normalizedBrowser)) {
    supported = false;
    reason = LIVE_CAPTION_PLATFORM_SUPPORT_REASONS.UNKNOWN_BROWSER;
    message = 'Live Caption is limited to Chrome and Edge desktop in the MVP.';
  }

  return {
    supported,
    reason,
    message,
    browserName: normalizedBrowser || 'unknown',
    platform: normalizedPlatform,
    isMobile: mobileDetected
  };
}

export function createLiveCaptionPrivacyNotice({
  isIncognito = false,
  platformSupport = null,
  browserName = 'unknown',
  platform = 'desktop'
} = {}) {
  const support = platformSupport || createLiveCaptionPlatformSupportResult({ browserName, platform, isMobile: false });
  const isSessionOnly = Boolean(isIncognito);
  const storageLine = isSessionOnly
    ? 'In incognito mode, captions and transcripts stay session-only and are not written to persistent cache.'
    : 'Outside incognito, captions and transcripts may be cached for the same video identity.';

  const message = 'Live Caption captures tab audio to generate final captions. Raw audio is not persisted.';
  const details = [
    storageLine,
    'Audio capture is limited to the active tab and is controlled by your explicit consent.',
    'Only finalized captions are shown in the overlay.'
  ];

  const notice = {
    title: 'Live Caption consent',
    message,
    details,
    acceptLabel: 'Allow',
    cancelLabel: 'Cancel',
    metadata: {
      isIncognito: isSessionOnly,
      storageMode: isSessionOnly ? 'session-only' : 'persistent',
      captureScope: 'active-tab-audio',
      rawAudioPersisted: false,
      captionCachePolicy: isSessionOnly ? 'session-only' : 'persistent',
      platformSupport: cloneObject(support)
    }
  };

  logger.debug(() => ({
    message: 'Built live-caption privacy notice',
    data: {
      isIncognito: notice.metadata.isIncognito,
      storageMode: notice.metadata.storageMode,
      captureScope: notice.metadata.captureScope,
      platformSupportReason: support.reason
    }
  }));

  return notice;
}

export function createLiveCaptionConsentActionResult(action, context = {}) {
  const normalizedAction = String(action || '').trim().toLowerCase();
  const accepted = normalizedAction === LIVE_CAPTION_CONSENT_ACTION_RESULTS.ACCEPTED;

  const result = {
    action: accepted ? LIVE_CAPTION_CONSENT_ACTION_RESULTS.ACCEPTED : LIVE_CAPTION_CONSENT_ACTION_RESULTS.CANCELED,
    allowed: accepted,
    consentState: accepted ? LIVE_CAPTION_CONSENT_STATES.ACCEPTED : LIVE_CAPTION_CONSENT_STATES.CANCELED,
    reason: accepted ? null : LIVE_CAPTION_CONSENT_DECISION_REASONS.CONSENT_CANCELED,
    sessionScoped: true,
    ...context
  };

  logger.debug(() => ({
    message: 'Live-caption consent action evaluated',
    data: {
      action: result.action,
      allowed: result.allowed,
      consentState: result.consentState
    }
  }));

  return result;
}

export function createLiveCaptionRecoveryFailureResult({
  sessionId = null,
  tabId = null,
  videoFingerprint = null,
  reason = LIVE_CAPTION_CONSENT_DECISION_REASONS.RECOVERY_FAILURE
} = {}) {
  const result = {
    allowed: false,
    reason,
    shouldStopCapture: true,
    notifyContent: true,
    action: LIVE_CAPTION_RECOVERY_FAILURE_ACTIONS.STOP_CAPTURE,
    sessionId,
    tabId,
    videoFingerprint,
    recoveryFailed: true,
    sessionScoped: true
  };

  logger.debug(() => ({
    message: 'Live-caption recovery failure resolved fail-closed',
    data: {
      sessionId,
      tabId,
      videoFingerprint,
      reason
    }
  }));

  return result;
}

export function evaluateLiveCaptionStartEligibility({
  consentState = LIVE_CAPTION_CONSENT_STATES.NOT_ASKED,
  platformSupport = createLiveCaptionPlatformSupportResult(),
  recoveryFailure = null
} = {}) {
  const normalizedState = normalizeLiveCaptionConsentState(consentState);
  const support = cloneObject(platformSupport) || createLiveCaptionPlatformSupportResult();

  if (recoveryFailure && recoveryFailure.allowed === false) {
    const result = {
      allowed: false,
      reason: LIVE_CAPTION_CONSENT_DECISION_REASONS.RECOVERY_FAILURE,
      consentState: normalizedState,
      platformSupport: support,
      recoveryFailure: cloneObject(recoveryFailure),
      shouldStopCapture: true,
      notifyContent: true,
      sessionScoped: true
    };

    logger.debug(() => ({
      message: 'Live-caption start denied by recovery failure',
      data: {
        consentState: normalizedState,
        reason: result.reason,
        platformSupportReason: support.reason
      }
    }));

    return result;
  }

  if (!support.supported) {
    const reason = support.reason === LIVE_CAPTION_PLATFORM_SUPPORT_REASONS.MOBILE_UNSUPPORTED
      ? LIVE_CAPTION_CONSENT_DECISION_REASONS.UNSUPPORTED_PLATFORM
      : LIVE_CAPTION_CONSENT_DECISION_REASONS.UNSUPPORTED_BROWSER;

    const result = {
      allowed: false,
      reason,
      consentState: normalizedState,
      platformSupport: support,
      shouldStopCapture: false,
      notifyContent: true,
      sessionScoped: true
    };

    logger.debug(() => ({
      message: 'Live-caption start denied by platform support',
      data: {
        consentState: normalizedState,
        reason: result.reason,
        platformSupportReason: support.reason
      }
    }));

    return result;
  }

  if (normalizedState === LIVE_CAPTION_CONSENT_STATES.ACCEPTED) {
    const result = {
      allowed: true,
      reason: null,
      consentState: normalizedState,
      platformSupport: support,
      shouldStopCapture: false,
      notifyContent: false,
      sessionScoped: true
    };

    logger.debug(() => ({
      message: 'Live-caption start allowed',
      data: {
        consentState: normalizedState,
        platformSupportReason: support.reason
      }
    }));

    return result;
  }

  const denialReason = normalizedState === LIVE_CAPTION_CONSENT_STATES.REVOKED
    ? LIVE_CAPTION_CONSENT_DECISION_REASONS.CONSENT_REVOKED
    : normalizedState === LIVE_CAPTION_CONSENT_STATES.CANCELED
      ? LIVE_CAPTION_CONSENT_DECISION_REASONS.CONSENT_CANCELED
    : LIVE_CAPTION_CONSENT_DECISION_REASONS.CONSENT_REQUIRED;

  const result = {
    allowed: false,
    reason: denialReason,
    consentState: normalizedState,
    platformSupport: support,
    shouldStopCapture: false,
    notifyContent: true,
    sessionScoped: true
  };

  logger.debug(() => ({
    message: 'Live-caption start denied by consent state',
    data: {
      consentState: normalizedState,
      reason: result.reason,
      platformSupportReason: support.reason
    }
  }));

  return result;
}

export function normalizeLiveCaptionConsentState(value) {
  const normalized = String(value || LIVE_CAPTION_CONSENT_STATES.NOT_ASKED).trim().toLowerCase();
  return Object.values(LIVE_CAPTION_CONSENT_STATES).includes(normalized)
    ? normalized
    : LIVE_CAPTION_CONSENT_STATES.NOT_ASKED;
}

export default {
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
};
