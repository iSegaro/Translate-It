import { defineStore } from 'pinia';
import { ref } from 'vue';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import { LIVE_CAPTION_DEFAULTS } from '../constants/liveCaptionDefaults.js';

export const useLiveCaptionStore = defineStore('liveCaption', () => {
  const status = ref(LIVE_CAPTION_SESSION_STATES.IDLE);
  const isEnabled = ref(LIVE_CAPTION_DEFAULTS.ENABLED);
  const overlayVisible = ref(false);
  const consentAccepted = ref(false);
  const consentNoticeVisible = ref(false);
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
    consentAccepted.value = false;
    consentNoticeVisible.value = false;
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

  const setContext = ({ tabId = null, videoFingerprint = null, nextSessionId = null } = {}) => {
    activeTabId.value = tabId;
    activeVideoFingerprint.value = videoFingerprint;
    sessionId.value = nextSessionId;
  };

  const acceptConsent = () => {
    consentAccepted.value = true;
    consentNoticeVisible.value = false;
  };

  const revokeConsent = () => {
    consentAccepted.value = false;
    consentNoticeVisible.value = true;
  };

  const setConsentNoticeVisible = (visible) => {
    consentNoticeVisible.value = Boolean(visible);
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
  };

  return {
    status,
    isEnabled,
    overlayVisible,
    consentAccepted,
    consentNoticeVisible,
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
    setContext,
    acceptConsent,
    revokeConsent,
    setConsentNoticeVisible,
    setCaptions,
    appendFinalizedCaption,
    clearCaptions,
    setControlsState,
    resetOverlayState
  };
});

export default useLiveCaptionStore;
