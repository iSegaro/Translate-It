import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LIVE_CAPTION_RUNTIME_STATES } from '../constants/liveCaptionRuntimeStates.js';
import {
  LIVE_CAPTION_CAPTURE_STATES,
  LIVE_CAPTION_OFFSCREEN_ERROR_CODES,
  createLiveCaptionFailClosedResponse
} from './liveCaptionOffscreenContracts.js';
import { LiveCaptionOffscreenBridge } from './LiveCaptionOffscreenBridge.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionCaptureCoordinator');

/**
 * Coordination shell for future live-caption capture requests.
 * Models status transitions and request construction only.
 */
export class LiveCaptionCaptureCoordinator {
  constructor({ bridge = new LiveCaptionOffscreenBridge() } = {}) {
    this.bridge = bridge;
    this.status = LIVE_CAPTION_CAPTURE_STATES.IDLE;
    this.runtimeState = LIVE_CAPTION_RUNTIME_STATES.IDLE;
    this.sessionId = null;
    this.tabId = null;
    this.videoFingerprint = null;
    this.lastError = null;
    this.lastSnapshot = null;
    this.lastRequest = null;
    this.lastRuntimeRequest = null;
    this.lastRuntimeResponse = null;
    this.lastUpdatedAt = Date.now();

    logger.debug('Live-caption capture coordinator initialized', {
      status: this.status
    });
  }

  touch() {
    this.lastUpdatedAt = Date.now();
  }

  setSessionContext({ sessionId, tabId, videoFingerprint } = {}) {
    this.sessionId = sessionId ?? this.sessionId;
    this.tabId = tabId ?? this.tabId;
    this.videoFingerprint = videoFingerprint ?? this.videoFingerprint;
    this.touch();
    return this.getSnapshot();
  }

  setStatus(status, details = {}) {
    this.status = status;
    this.touch();

    logger.debug('Live-caption capture coordinator status updated', {
      status,
      ...details
    });

    return this.status;
  }

  setRuntimeState(runtimeState, details = {}) {
    this.runtimeState = runtimeState;
    this.touch();

    logger.debug('Live-caption capture coordinator runtime state updated', {
      runtimeState,
      ...details
    });

    return this.runtimeState;
  }

  startCapture({ sessionId, tabId, videoFingerprint, captureOptions = {} } = {}) {
    this.setSessionContext({ sessionId, tabId, videoFingerprint });
    const request = this.bridge.createStartCaptureRequest({
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint,
      captureOptions
    });

    this.lastRequest = request;
    this.setStatus(LIVE_CAPTION_CAPTURE_STATES.STARTING, {
      requestType: request.type
    });

    return request;
  }

  stopCapture({ sessionId = this.sessionId, tabId = this.tabId, videoFingerprint = this.videoFingerprint, reason = 'stop' } = {}) {
    const request = this.bridge.createStopCaptureRequest({
      sessionId,
      tabId,
      videoFingerprint,
      reason
    });

    this.lastRequest = request;
    this.setStatus(LIVE_CAPTION_CAPTURE_STATES.STOPPING, {
      requestType: request.type,
      reason
    });

    return request;
  }

  requestStatus({ sessionId = this.sessionId, tabId = this.tabId, videoFingerprint = this.videoFingerprint } = {}) {
    const request = this.bridge.createStatusRequest({
      sessionId,
      tabId,
      videoFingerprint
    });

    this.lastRequest = request;
    return request;
  }

  startRuntime({ sessionId = this.sessionId, tabId = this.tabId, videoFingerprint = this.videoFingerprint, reason = 'start' } = {}) {
    this.setSessionContext({ sessionId, tabId, videoFingerprint });
    this.lastRuntimeRequest = {
      action: 'start',
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint,
      reason
    };
    this.setRuntimeState(LIVE_CAPTION_RUNTIME_STATES.STARTING, {
      action: 'start',
      reason
    });
    return this.getSnapshot();
  }

  pauseRuntime({ reason = 'pause' } = {}) {
    this.lastRuntimeRequest = {
      action: 'pause',
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint,
      reason
    };
    this.setRuntimeState(LIVE_CAPTION_RUNTIME_STATES.PAUSED, {
      action: 'pause',
      reason
    });
    return this.getSnapshot();
  }

  resumeRuntime({ reason = 'resume' } = {}) {
    this.lastRuntimeRequest = {
      action: 'resume',
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint,
      reason
    };
    this.setRuntimeState(LIVE_CAPTION_RUNTIME_STATES.RUNNING, {
      action: 'resume',
      reason
    });
    return this.getSnapshot();
  }

  stopRuntime({ reason = 'stop' } = {}) {
    this.lastRuntimeRequest = {
      action: 'stop',
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint,
      reason
    };
    this.setRuntimeState(LIVE_CAPTION_RUNTIME_STATES.STOPPING, {
      action: 'stop',
      reason
    });
    this.setRuntimeState(LIVE_CAPTION_RUNTIME_STATES.IDLE, {
      action: 'stop',
      reason
    });
    return this.getSnapshot();
  }

  requestRuntimeStatus({ reason = 'status' } = {}) {
    this.lastRuntimeRequest = {
      action: 'status',
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint,
      reason
    };
    this.lastRuntimeResponse = {
      success: true,
      status: this.runtimeState,
      runtimeState: this.runtimeState,
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint,
      reason
    };
    this.touch();
    return this.getSnapshot();
  }

  createFinalizedChunkMessage({
    sessionId = this.sessionId,
    tabId = this.tabId,
    videoFingerprint = this.videoFingerprint,
    chunkStartMs,
    chunkEndMs,
    mimeType,
    chunkPayload,
    payloadKind = 'blob'
  } = {}) {
    const message = this.bridge.createFinalizedChunkMessage({
      sessionId,
      tabId,
      videoFingerprint,
      chunkStartMs,
      chunkEndMs,
      mimeType,
      chunkPayload,
      payloadKind
    });

    this.lastRequest = message;
    this.setStatus(LIVE_CAPTION_CAPTURE_STATES.ACTIVE, {
      requestType: message.type
    });
    return message;
  }

  createCaptureErrorMessage({
    sessionId = this.sessionId,
    tabId = this.tabId,
    videoFingerprint = this.videoFingerprint,
    code = LIVE_CAPTION_OFFSCREEN_ERROR_CODES.INVALID_RESPONSE,
    message = 'Live caption capture error',
    details = null
  } = {}) {
    const errorMessage = this.bridge.createCaptureErrorMessage({
      sessionId,
      tabId,
      videoFingerprint,
      code,
      message,
      details
    });

    this.lastRequest = errorMessage;
    this.lastError = errorMessage.error;
    this.setStatus(LIVE_CAPTION_CAPTURE_STATES.ERROR, {
      requestType: errorMessage.type,
      errorCode: errorMessage.error?.code ?? code
    });
    return errorMessage;
  }

  applyOffscreenResponse(response, context = {}) {
    const normalized = this.bridge.normalizeResponse(response, {
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint,
      ...context
    });

    this.lastSnapshot = normalized;
    this.touch();

    if (normalized?.ok === false || normalized?.failClosed === true) {
      this.status = LIVE_CAPTION_CAPTURE_STATES.ERROR;
      this.lastError = normalized.error || null;
      return normalized;
    }

    if (normalized?.status) {
      this.status = normalized.status;
    }

    return normalized;
  }

  recordSnapshot(snapshot) {
    this.lastSnapshot = snapshot ? { ...snapshot } : null;
    if (snapshot?.status) {
      this.status = snapshot.status;
    }
    this.touch();
    return this.getSnapshot();
  }

  markActive(snapshot = null) {
    this.status = LIVE_CAPTION_CAPTURE_STATES.ACTIVE;
    if (snapshot) {
      this.recordSnapshot(snapshot);
    }
    this.touch();
    return this.getSnapshot();
  }

  markUnavailable(reason = 'offscreen_unavailable', details = null) {
    this.lastError = {
      code: LIVE_CAPTION_OFFSCREEN_ERROR_CODES.OFFSCREEN_UNAVAILABLE,
      message: 'Live caption offscreen capture is unavailable',
      reason,
      details
    };
    this.status = LIVE_CAPTION_CAPTURE_STATES.UNAVAILABLE;
    this.runtimeState = LIVE_CAPTION_RUNTIME_STATES.ERROR;
    this.touch();
    logger.debug('Live-caption offscreen unavailable', {
      reason,
      details
    });
    return this.getSnapshot();
  }

  failClosed(reason = 'reconciliation_failed', error = null, details = null) {
    const response = createLiveCaptionFailClosedResponse({
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint,
      reason,
      code: error?.code ?? LIVE_CAPTION_OFFSCREEN_ERROR_CODES.INVALID_RESPONSE,
      message: error?.message || 'Live caption capture failed closed',
      details: details ?? error
    });

    this.lastError = response.error;
    this.status = LIVE_CAPTION_CAPTURE_STATES.ERROR;
    this.runtimeState = LIVE_CAPTION_RUNTIME_STATES.ERROR;
    this.touch();

    logger.warn('Live-caption capture coordinator fail-closed', {
      reason,
      code: response.error?.code,
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint
    });

    return response;
  }

  getSnapshot() {
    return {
      status: this.status,
      runtimeState: this.runtimeState,
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint,
      lastError: this.lastError ? { ...this.lastError } : null,
      lastRequest: this.lastRequest ? { ...this.lastRequest } : null,
      lastRuntimeRequest: this.lastRuntimeRequest ? { ...this.lastRuntimeRequest } : null,
      lastRuntimeResponse: this.lastRuntimeResponse ? { ...this.lastRuntimeResponse } : null,
      lastSnapshot: this.lastSnapshot ? { ...this.lastSnapshot } : null,
      lastUpdatedAt: this.lastUpdatedAt
    };
  }
}

export {
  LIVE_CAPTION_CAPTURE_STATES,
  LIVE_CAPTION_OFFSCREEN_ERROR_CODES,
  createLiveCaptionFailClosedResponse
} from './liveCaptionOffscreenContracts.js';

export default LiveCaptionCaptureCoordinator;
