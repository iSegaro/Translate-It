import { defineStore } from 'pinia';
import { ref } from 'vue';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import { LIVE_CAPTION_DEFAULTS } from '../constants/liveCaptionDefaults.js';
import {
  LIVE_CAPTION_CONSENT_STATES,
  createLiveCaptionPrivacyNotice,
  normalizeLiveCaptionConsentState
} from '../core/LiveCaptionConsentPolicy.js';

export const useLiveCaptionStore = defineStore('liveCaption', () => {
  const status = ref(LIVE_CAPTION_SESSION_STATES.IDLE);
  const isEnabled = ref(LIVE_CAPTION_DEFAULTS.ENABLED);
  const overlayVisible = ref(false);
  const consentState = ref(LIVE_CAPTION_CONSENT_STATES.NOT_ASKED);
  const consentAccepted = ref(false);
  const consentNoticeVisible = ref(false);
  const privacyNotice = ref(createLiveCaptionPrivacyNotice());
  const startupDeniedReason = ref(null);
  const startupDeniedDetails = ref(null);
  const sessionId = ref(null);
  const activeTabId = ref(null);
  const activeVideoFingerprint = ref(null);
  const captionLines = ref([]);
  const controlsState = ref({
    canStart: true,
    canStop: false,
    canRetry: false,
    canClearCache: false
  });
  const lastError = ref(null);

  const reset = () => {
    status.value = LIVE_CAPTION_SESSION_STATES.IDLE;
    isEnabled.value = LIVE_CAPTION_DEFAULTS.ENABLED;
    overlayVisible.value = false;
    consentState.value = LIVE_CAPTION_CONSENT_STATES.NOT_ASKED;
    consentAccepted.value = false;
    consentNoticeVisible.value = false;
    privacyNotice.value = createLiveCaptionPrivacyNotice();
    startupDeniedReason.value = null;
    startupDeniedDetails.value = null;
    sessionId.value = null;
    activeTabId.value = null;
    activeVideoFingerprint.value = null;
    captionLines.value = [];
    controlsState.value = {
      canStart: true,
      canStop: false,
      canRetry: false,
      canClearCache: false
    };
    lastError.value = null;
  };

  const setStatus = (nextStatus) => {
    status.value = nextStatus;
  };

  const setLastError = (error) => {
    lastError.value = error || null;
    status.value = error ? LIVE_CAPTION_SESSION_STATES.ERROR : status.value;
  };

  const setError = (error) => {
    setLastError(error);
  };

  const setOverlayVisible = (visible) => {
    overlayVisible.value = Boolean(visible);
  };

  const setPrivacyNotice = (notice) => {
    privacyNotice.value = notice ? { ...notice } : createLiveCaptionPrivacyNotice();
  };

  const setStartupDeniedReason = (reason, details = null) => {
    startupDeniedReason.value = reason || null;
    startupDeniedDetails.value = details ? { ...details } : null;
  };

  const clearStartupDeniedReason = () => {
    startupDeniedReason.value = null;
    startupDeniedDetails.value = null;
  };

  const setContext = ({ tabId = null, videoFingerprint = null, nextSessionId = null } = {}) => {
    activeTabId.value = tabId;
    activeVideoFingerprint.value = videoFingerprint;
    sessionId.value = nextSessionId;
  };

  const acceptConsent = () => {
    consentState.value = LIVE_CAPTION_CONSENT_STATES.ACCEPTED;
    consentAccepted.value = true;
    consentNoticeVisible.value = false;
    clearStartupDeniedReason();
  };

  const cancelConsent = () => {
    consentState.value = LIVE_CAPTION_CONSENT_STATES.CANCELED;
    consentAccepted.value = false;
    consentNoticeVisible.value = false;
  };

  const revokeConsent = () => {
    consentState.value = LIVE_CAPTION_CONSENT_STATES.REVOKED;
    consentAccepted.value = false;
    consentNoticeVisible.value = true;
  };

  const setConsentNoticeVisible = (visible) => {
    consentNoticeVisible.value = Boolean(visible);
    if (visible && consentState.value === LIVE_CAPTION_CONSENT_STATES.NOT_ASKED) {
      consentState.value = LIVE_CAPTION_CONSENT_STATES.PENDING;
    }
  };

  const setConsentState = (nextState) => {
    const normalizedState = normalizeLiveCaptionConsentState(nextState);
    consentState.value = normalizedState;

    if (normalizedState === LIVE_CAPTION_CONSENT_STATES.ACCEPTED) {
      consentAccepted.value = true;
      consentNoticeVisible.value = false;
    } else if (
      normalizedState === LIVE_CAPTION_CONSENT_STATES.CANCELED ||
      normalizedState === LIVE_CAPTION_CONSENT_STATES.REVOKED
    ) {
      consentAccepted.value = false;
    }
  };

  const setCaptions = (lines = []) => {
    captionLines.value = Array.isArray(lines) ? lines.map((line) => ({ ...line })) : [];
  };

  const appendFinalizedCaption = (line = {}) => {
    captionLines.value = [...captionLines.value, { ...line }];
  };

  const clearCaptions = () => {
    captionLines.value = [];
  };

  const setControlsState = (nextState = {}) => {
    controlsState.value = {
      ...controlsState.value,
      ...nextState
    };
  };

  const resetOverlayState = () => {
    overlayVisible.value = false;
    consentNoticeVisible.value = false;
    consentAccepted.value = false;
    captionLines.value = [];
    controlsState.value = {
      canStart: true,
      canStop: false,
      canRetry: false,
      canClearCache: false
    };
    lastError.value = null;
    consentState.value = LIVE_CAPTION_CONSENT_STATES.NOT_ASKED;
    startupDeniedReason.value = null;
    startupDeniedDetails.value = null;
  };

  return {
    status,
    isEnabled,
    overlayVisible,
    consentState,
    consentAccepted,
    consentNoticeVisible,
    privacyNotice,
    startupDeniedReason,
    startupDeniedDetails,
    sessionId,
    activeTabId,
    activeVideoFingerprint,
    captionLines,
    controlsState,
    lastError,
    reset,
    setStatus,
    setLastError,
    setError,
    setOverlayVisible,
    setPrivacyNotice,
    setStartupDeniedReason,
    clearStartupDeniedReason,
    setContext,
    acceptConsent,
    cancelConsent,
    revokeConsent,
    setConsentNoticeVisible,
    setConsentState,
    setCaptions,
    appendFinalizedCaption,
    clearCaptions,
    setControlsState,
    resetOverlayState
  };
});

export default useLiveCaptionStore;
