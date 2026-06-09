import { defineStore } from 'pinia';
import { ref } from 'vue';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import { LIVE_CAPTION_DEFAULTS } from '../constants/liveCaptionDefaults.js';

export const useLiveCaptionStore = defineStore('liveCaption', () => {
  const status = ref(LIVE_CAPTION_SESSION_STATES.IDLE);
  const isEnabled = ref(LIVE_CAPTION_DEFAULTS.ENABLED);
  const overlayVisible = ref(false);
  const consentAccepted = ref(false);
  const sessionId = ref(null);
  const activeTabId = ref(null);
  const activeVideoFingerprint = ref(null);
  const lastError = ref(null);

  const reset = () => {
    status.value = LIVE_CAPTION_SESSION_STATES.IDLE;
    isEnabled.value = LIVE_CAPTION_DEFAULTS.ENABLED;
    overlayVisible.value = false;
    consentAccepted.value = false;
    sessionId.value = null;
    activeTabId.value = null;
    activeVideoFingerprint.value = null;
    lastError.value = null;
  };

  const setStatus = (nextStatus) => {
    status.value = nextStatus;
  };

  const setLastError = (error) => {
    lastError.value = error || null;
    status.value = error ? LIVE_CAPTION_SESSION_STATES.ERROR : status.value;
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
  };

  return {
    status,
    isEnabled,
    overlayVisible,
    consentAccepted,
    sessionId,
    activeTabId,
    activeVideoFingerprint,
    lastError,
    reset,
    setStatus,
    setLastError,
    setOverlayVisible,
    setContext,
    acceptConsent
  };
});

export default useLiveCaptionStore;
