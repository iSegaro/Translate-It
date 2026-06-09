import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  LIVE_CAPTION_CAPTURE_STATES,
  LIVE_CAPTION_OFFSCREEN_ERROR_CODES,
  LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES,
  createLiveCaptionCaptureErrorMessage,
  createLiveCaptionFinalizedChunkMessage,
  createLiveCaptionFailClosedResponse,
  createLiveCaptionOffscreenSnapshotResponse,
  createLiveCaptionStartCaptureRequest,
  createLiveCaptionStatusRequest,
  createLiveCaptionStopCaptureRequest,
  normalizeLiveCaptionOffscreenResponse
} from './liveCaptionOffscreenContracts.js';
import {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  createLiveCaptionRuntimeNotImplementedResponse,
  createLiveCaptionRuntimeUnavailableResponse,
  normalizeLiveCaptionRuntimeResponse
} from './liveCaptionRuntimeContracts.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionOffscreenBridge');

/**
 * Background-side offscreen bridge contract.
 * Defines message construction, validation, and response normalization only.
 */
export class LiveCaptionOffscreenBridge {
  constructor() {
    this.status = LIVE_CAPTION_CAPTURE_STATES.IDLE;
    this.runtimeState = 'idle';
    this.lastRequest = null;
    this.lastResponse = null;
    this.lastRuntimeRequest = null;
    this.lastRuntimeResponse = null;
    this.lastSnapshot = null;
    this.lastUpdatedAt = Date.now();

    logger.debug('Live-caption offscreen bridge initialized', {
      status: this.status
    });
  }

  touch() {
    this.lastUpdatedAt = Date.now();
  }

  setStatus(status, details = {}) {
    this.status = status;
    this.touch();

    logger.debug('Live-caption offscreen bridge status updated', {
      status,
      ...details
    });

    return this.status;
  }

  setRuntimeState(runtimeState, details = {}) {
    this.runtimeState = runtimeState;
    this.touch();

    logger.debug('Live-caption offscreen runtime state updated', {
      runtimeState,
      ...details
    });

    return this.runtimeState;
  }

  createStartCaptureRequest(options = {}) {
    const request = createLiveCaptionStartCaptureRequest(options);
    this.lastRequest = request;
    this.setStatus(LIVE_CAPTION_CAPTURE_STATES.STARTING, {
      requestType: request.type,
      sessionId: request.sessionId,
      tabId: request.tabId
    });
    return request;
  }

  createStopCaptureRequest(options = {}) {
    const request = createLiveCaptionStopCaptureRequest(options);
    this.lastRequest = request;
    this.setStatus(LIVE_CAPTION_CAPTURE_STATES.STOPPING, {
      requestType: request.type,
      sessionId: request.sessionId,
      tabId: request.tabId
    });
    return request;
  }

  createStatusRequest(options = {}) {
    const request = createLiveCaptionStatusRequest(options);
    this.lastRequest = request;
    logger.debug('Live-caption status request created', {
      sessionId: request.sessionId,
      tabId: request.tabId,
      videoFingerprint: request.videoFingerprint
    });
    return request;
  }

  createSnapshotResponse(options = {}) {
    return createLiveCaptionOffscreenSnapshotResponse(options);
  }

  createFinalizedChunkMessage(options = {}) {
    const message = createLiveCaptionFinalizedChunkMessage(options);
    this.lastRequest = message;
    this.setStatus(LIVE_CAPTION_CAPTURE_STATES.ACTIVE, {
      requestType: message.type,
      sessionId: message.sessionId,
      tabId: message.tabId
    });
    return message;
  }

  createCaptureErrorMessage(options = {}) {
    const message = createLiveCaptionCaptureErrorMessage(options);
    this.lastRequest = message;
    this.setStatus(LIVE_CAPTION_CAPTURE_STATES.ERROR, {
      requestType: message.type,
      sessionId: message.sessionId,
      tabId: message.tabId,
      errorCode: message.error?.code ?? LIVE_CAPTION_OFFSCREEN_ERROR_CODES.INVALID_RESPONSE
    });
    return message;
  }

  createFailClosedResponse(options = {}) {
    return createLiveCaptionFailClosedResponse(options);
  }

  createRuntimeStartResponse(options = {}) {
    const response = createLiveCaptionRuntimeNotImplementedResponse(LIVE_CAPTION_RUNTIME_ACTIONS.START, options);
    this.lastRuntimeRequest = {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
      ...options
    };
    this.lastRuntimeResponse = response;
    this.setRuntimeState(options.runtimeState ?? response.runtimeState ?? 'starting', {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
      status: response.status
    });
    return response;
  }

  createRuntimeStopResponse(options = {}) {
    const response = createLiveCaptionRuntimeNotImplementedResponse(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, options);
    this.lastRuntimeRequest = {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
      ...options
    };
    this.lastRuntimeResponse = response;
    this.setRuntimeState(options.runtimeState ?? response.runtimeState ?? 'idle', {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
      status: response.status
    });
    return response;
  }

  createRuntimeStatusResponse(options = {}) {
    const response = createLiveCaptionRuntimeNotImplementedResponse(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS, {
      ...options,
      runtimeState: options.runtimeState ?? this.runtimeState
    });
    this.lastRuntimeRequest = {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
      ...options
    };
    this.lastRuntimeResponse = response;
    this.setRuntimeState(options.runtimeState ?? response.runtimeState ?? this.runtimeState, {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
      status: response.status
    });
    return response;
  }

  createRuntimePauseResponse(options = {}) {
    const response = createLiveCaptionRuntimeNotImplementedResponse(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE, options);
    this.lastRuntimeRequest = {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
      ...options
    };
    this.lastRuntimeResponse = response;
    this.setRuntimeState(options.runtimeState ?? response.runtimeState ?? 'paused', {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
      status: response.status
    });
    return response;
  }

  createRuntimeResumeResponse(options = {}) {
    const response = createLiveCaptionRuntimeNotImplementedResponse(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME, options);
    this.lastRuntimeRequest = {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
      ...options
    };
    this.lastRuntimeResponse = response;
    this.setRuntimeState(options.runtimeState ?? response.runtimeState ?? 'running', {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
      status: response.status
    });
    return response;
  }

  createRuntimeUnavailableResponse(action, options = {}) {
    const response = createLiveCaptionRuntimeUnavailableResponse(action, options);
    this.lastRuntimeRequest = {
      action,
      ...options
    };
    this.lastRuntimeResponse = response;
    this.setRuntimeState(options.runtimeState ?? response.runtimeState ?? 'error', {
      action,
      status: response.status
    });
    return response;
  }

  normalizeResponse(response, context = {}) {
    const normalized = normalizeLiveCaptionOffscreenResponse(response, context);
    this.lastResponse = normalized;
    this.touch();

    if (normalized?.ok === false || normalized?.failClosed === true) {
      this.setStatus(LIVE_CAPTION_CAPTURE_STATES.ERROR, {
        reason: normalized.error?.reason || context.reason || 'offscreen_failure'
      });
      return normalized;
    }

    if (normalized?.status) {
      this.setStatus(normalized.status, {
        requestId: normalized.requestId ?? null,
        sessionId: normalized.sessionId ?? null,
        tabId: normalized.tabId ?? null
      });
    }

    if (normalized?.type === LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.SNAPSHOT_RESPONSE) {
      this.lastSnapshot = normalized;
    }

    logger.debug('Live-caption offscreen response normalized', {
      status: normalized?.status ?? null,
      type: normalized?.type ?? null,
      ok: normalized?.ok !== false
    });

    return normalized;
  }

  normalizeRuntimeResponse(response, context = {}) {
    const normalized = normalizeLiveCaptionRuntimeResponse(response, context);
    this.lastRuntimeResponse = normalized;
    this.touch();

    if (normalized?.success === false || normalized?.ok === false) {
      this.setRuntimeState(normalized.runtimeState ?? 'error', {
        reason: normalized.error?.reason || context.reason || 'runtime_failure'
      });
      return normalized;
    }

    if (normalized?.runtimeState) {
      this.setRuntimeState(normalized.runtimeState, {
        requestId: normalized.requestId ?? null,
        sessionId: normalized.sessionId ?? null,
        tabId: normalized.tabId ?? null
      });
    }

    logger.debug('Live-caption runtime response normalized in offscreen bridge shell', {
      action: normalized?.action ?? context.action ?? null,
      status: normalized?.status ?? null,
      runtimeState: normalized?.runtimeState ?? null,
      success: normalized?.success !== false
    });

    return normalized;
  }

  getSnapshot() {
    return {
      status: this.status,
      runtimeState: this.runtimeState,
      lastRequest: this.lastRequest ? { ...this.lastRequest } : null,
      lastResponse: this.lastResponse ? { ...this.lastResponse } : null,
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
  LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES,
  createLiveCaptionStartCaptureRequest,
  createLiveCaptionStopCaptureRequest,
  createLiveCaptionStatusRequest,
  createLiveCaptionFinalizedChunkMessage,
  createLiveCaptionCaptureErrorMessage,
  createLiveCaptionOffscreenSnapshotResponse,
  createLiveCaptionFailClosedResponse,
  normalizeLiveCaptionOffscreenResponse
} from './liveCaptionOffscreenContracts.js';
export {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  createLiveCaptionRuntimeSuccessResponse,
  createLiveCaptionRuntimeNotImplementedResponse,
  createLiveCaptionRuntimeUnavailableResponse,
  createLiveCaptionRuntimeFailClosedResponse,
  normalizeLiveCaptionRuntimeResponse
} from './liveCaptionRuntimeContracts.js';

export default LiveCaptionOffscreenBridge;
