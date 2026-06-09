import { defineStore } from 'pinia';
import { ref } from 'vue';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import {
  LIVE_CAPTION_RUNTIME_STATES,
  normalizeLiveCaptionRuntimeState
} from '../constants/liveCaptionRuntimeStates.js';
import { LIVE_CAPTION_DEFAULTS } from '../constants/liveCaptionDefaults.js';
import {
  LIVE_CAPTION_CONSENT_STATES,
  createLiveCaptionPrivacyNotice,
  normalizeLiveCaptionConsentState
} from '../core/LiveCaptionConsentPolicy.js';
import {
  LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT,
  normalizeLiveCaptionCaptionDisplayMode,
  resolveLiveCaptionCaptionLineDisplay,
  selectLiveCaptionCaptionLines
} from '../core/LiveCaptionCaptionDisplayMode.js';

export const useLiveCaptionStore = defineStore('liveCaption', () => {
  const status = ref(LIVE_CAPTION_SESSION_STATES.IDLE);
  const activeSessionState = ref(LIVE_CAPTION_SESSION_STATES.IDLE);
  const runtimeStatus = ref(LIVE_CAPTION_RUNTIME_STATES.IDLE);
  const isEnabled = ref(LIVE_CAPTION_DEFAULTS.ENABLED);
  const overlayVisible = ref(false);
  const consentState = ref(LIVE_CAPTION_CONSENT_STATES.NOT_ASKED);
  const consentAccepted = ref(false);
  const consentNoticeVisible = ref(false);
  const privacyNotice = ref(createLiveCaptionPrivacyNotice());
  const captionDisplayMode = ref(LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT);
  const startupDeniedReason = ref(null);
  const startupDeniedDetails = ref(null);
  const sessionId = ref(null);
  const activeTabId = ref(null);
  const activeVideoFingerprint = ref(null);
  const activeVideoState = ref(null);
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
    activeSessionState.value = LIVE_CAPTION_SESSION_STATES.IDLE;
    runtimeStatus.value = LIVE_CAPTION_RUNTIME_STATES.IDLE;
    isEnabled.value = LIVE_CAPTION_DEFAULTS.ENABLED;
    overlayVisible.value = false;
    consentState.value = LIVE_CAPTION_CONSENT_STATES.NOT_ASKED;
    consentAccepted.value = false;
    consentNoticeVisible.value = false;
    privacyNotice.value = createLiveCaptionPrivacyNotice();
    captionDisplayMode.value = LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT;
    startupDeniedReason.value = null;
    startupDeniedDetails.value = null;
    sessionId.value = null;
    activeTabId.value = null;
    activeVideoFingerprint.value = null;
    activeVideoState.value = null;
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
    activeSessionState.value = nextStatus;
  };

  const setLastError = (error) => {
    lastError.value = error || null;
    if (error) {
      status.value = LIVE_CAPTION_SESSION_STATES.ERROR;
      activeSessionState.value = LIVE_CAPTION_SESSION_STATES.ERROR;
      runtimeStatus.value = LIVE_CAPTION_RUNTIME_STATES.ERROR;
    }
  };

  const setError = (error) => {
    setLastError(error);
  };

  const setOverlayVisible = (visible) => {
    overlayVisible.value = Boolean(visible);
  };

  const setEnabled = (enabled) => {
    isEnabled.value = Boolean(enabled);
    overlayVisible.value = Boolean(enabled);
  };

  const setRuntimeStatus = (nextStatus) => {
    runtimeStatus.value = normalizeLiveCaptionRuntimeState(nextStatus);
  };

  const setActiveSessionState = (nextStatus) => {
    setStatus(nextStatus);
  };

  const setActiveVideoState = (nextState) => {
    activeVideoState.value = nextState ? { ...nextState } : null;
  };

  const clearActiveVideoState = () => {
    activeVideoState.value = null;
  };

  const setPrivacyNotice = (notice) => {
    privacyNotice.value = notice ? { ...notice } : createLiveCaptionPrivacyNotice();
  };

  const setCaptionDisplayMode = (mode) => {
    captionDisplayMode.value = normalizeLiveCaptionCaptionDisplayMode(mode);
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
    isEnabled.value = false;
    overlayVisible.value = false;
    consentNoticeVisible.value = false;
    consentAccepted.value = false;
    captionLines.value = [];
    captionDisplayMode.value = LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT;
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
    activeVideoState.value = null;
    runtimeStatus.value = LIVE_CAPTION_RUNTIME_STATES.IDLE;
    activeSessionState.value = LIVE_CAPTION_SESSION_STATES.IDLE;
  };

  const applyCleanupResult = ({
    sessionStatus = LIVE_CAPTION_SESSION_STATES.IDLE,
    runtimeState = LIVE_CAPTION_RUNTIME_STATES.STOPPED,
    preserveCaptions = false,
    clearCaptions = !preserveCaptions,
    clearSessionIdentity = true,
    clearConsent = true,
    error = null
  } = {}) => {
    isEnabled.value = false;
    overlayVisible.value = false;
    consentNoticeVisible.value = false;
    consentAccepted.value = false;

    if (clearConsent) {
      consentState.value = LIVE_CAPTION_CONSENT_STATES.NOT_ASKED;
    }

    if (clearCaptions) {
      captionLines.value = [];
    }

    if (clearSessionIdentity) {
      sessionId.value = null;
      activeTabId.value = null;
      activeVideoFingerprint.value = null;
      activeVideoState.value = null;
    }

    controlsState.value = {
      canStart: true,
      canStop: false,
      canRetry: false,
      canClearCache: false
    };
    startupDeniedReason.value = null;
    startupDeniedDetails.value = null;
    status.value = sessionStatus;
    activeSessionState.value = sessionStatus;
    runtimeStatus.value = normalizeLiveCaptionRuntimeState(runtimeState);
    lastError.value = error ? { ...error } : null;
  };

  const getCaptionLinesForDisplayMode = (lines = captionLines.value, mode = captionDisplayMode.value) => {
    return selectLiveCaptionCaptionLines(lines, mode);
  };

  const getCaptionLineDisplay = (line, mode = captionDisplayMode.value) => {
    return resolveLiveCaptionCaptionLineDisplay(line, mode);
  };

  return {
    status,
    activeSessionState,
    runtimeStatus,
    isEnabled,
    overlayVisible,
    consentState,
    consentAccepted,
    consentNoticeVisible,
    privacyNotice,
    captionDisplayMode,
    startupDeniedReason,
    startupDeniedDetails,
    sessionId,
    activeTabId,
    activeVideoFingerprint,
    activeVideoState,
    captionLines,
    controlsState,
    lastError,
    reset,
    setStatus,
    setActiveSessionState,
    setRuntimeStatus,
    setLastError,
    setError,
    setOverlayVisible,
    setEnabled,
    setPrivacyNotice,
    setCaptionDisplayMode,
    setStartupDeniedReason,
    clearStartupDeniedReason,
    setContext,
    setActiveVideoState,
    clearActiveVideoState,
    acceptConsent,
    cancelConsent,
    revokeConsent,
    setConsentNoticeVisible,
    setConsentState,
    setCaptions,
    appendFinalizedCaption,
    clearCaptions,
    setControlsState,
    getCaptionLinesForDisplayMode,
    getCaptionLineDisplay,
    applyCleanupResult,
    resetOverlayState
  };
});

export default useLiveCaptionStore;
