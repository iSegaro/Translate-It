import { defineStore } from 'pinia';
import { ref } from 'vue';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import {
  LIVE_CAPTION_RUNTIME_STATES,
  normalizeLiveCaptionRuntimeState
} from '../constants/liveCaptionRuntimeStates.js';
import { LIVE_CAPTION_DEFAULTS } from '../constants/liveCaptionDefaults.js';
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
  const captionDisplayMode = ref(LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT);
  const sessionId = ref(null);
  const activeTabId = ref(null);
  const activeVideoFingerprint = ref(null);
  const activeVideoState = ref(null);
  const captionLines = ref([]);
  const controlsState = ref({
    canStart: true,
    canStop: false,
    canRetry: false,
    canPause: false,
    canResume: false,
    canClearCache: false
  });
  const lastError = ref(null);
  const mediaTimelineMappingStatus = ref('invalid');

  const reset = () => {
    mediaTimelineMappingStatus.value = 'invalid';
    status.value = LIVE_CAPTION_SESSION_STATES.IDLE;
    activeSessionState.value = LIVE_CAPTION_SESSION_STATES.IDLE;
    runtimeStatus.value = LIVE_CAPTION_RUNTIME_STATES.IDLE;
    isEnabled.value = LIVE_CAPTION_DEFAULTS.ENABLED;
    overlayVisible.value = false;
    captionDisplayMode.value = LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT;
    sessionId.value = null;
    activeTabId.value = null;
    activeVideoFingerprint.value = null;
    activeVideoState.value = null;
    captionLines.value = [];
    controlsState.value = {
      canStart: true,
      canStop: false,
      canRetry: false,
      canPause: false,
      canResume: false,
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
    if (enabled) {
      overlayVisible.value = true;
    }
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

  const setCaptionDisplayMode = (mode) => {
    captionDisplayMode.value = normalizeLiveCaptionCaptionDisplayMode(mode);
  };

  const setContext = ({ tabId = null, videoFingerprint = null, nextSessionId = null } = {}) => {
    activeTabId.value = tabId;
    activeVideoFingerprint.value = videoFingerprint;
    sessionId.value = nextSessionId;
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
    captionLines.value = [];
    captionDisplayMode.value = LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT;
    controlsState.value = {
      canStart: true,
      canStop: false,
      canRetry: false,
      canPause: false,
      canResume: false,
      canClearCache: false
    };
    mediaTimelineMappingStatus.value = 'invalid';
    lastError.value = null;
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
    error = null
  } = {}) => {
    const hasError = Boolean(error);
    isEnabled.value = false;
    overlayVisible.value = hasError;

    if (clearCaptions) {
      captionLines.value = [];
    }

    if (clearSessionIdentity) {
      sessionId.value = null;
      activeTabId.value = null;
      activeVideoFingerprint.value = null;
      activeVideoState.value = null;
    }

    mediaTimelineMappingStatus.value = 'invalid';

    controlsState.value = {
      canStart: true,
      canStop: Boolean(error),
      canRetry: Boolean(error),
      canPause: false,
      canResume: false,
      canClearCache: false
    };
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

  const setMediaTimelineMappingStatus = (val) => {
    mediaTimelineMappingStatus.value = val === 'valid' ? 'valid' : 'invalid';
  };

  return {
    status,
    activeSessionState,
    runtimeStatus,
    isEnabled,
    overlayVisible,
    captionDisplayMode,
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
    setCaptionDisplayMode,
    setContext,
    setActiveVideoState,
    clearActiveVideoState,
    setCaptions,
    appendFinalizedCaption,
    clearCaptions,
    setControlsState,
    getCaptionLinesForDisplayMode,
    getCaptionLineDisplay,
    applyCleanupResult,
    resetOverlayState,
    mediaTimelineMappingStatus,
    setMediaTimelineMappingStatus
  };
});

export default useLiveCaptionStore;
