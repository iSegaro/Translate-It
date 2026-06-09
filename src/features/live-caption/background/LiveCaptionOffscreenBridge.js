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
  createLiveCaptionStopCaptureRequest,
  createLiveCaptionStatusRequest,
  normalizeLiveCaptionOffscreenResponse
} from './liveCaptionOffscreenContracts.js';
import {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  createLiveCaptionRuntimeStartRequest,
  createLiveCaptionRuntimeStopRequest,
  createLiveCaptionRuntimeStatusRequest,
  createLiveCaptionRuntimePauseRequest,
  createLiveCaptionRuntimeResumeRequest,
  createLiveCaptionRuntimeUnavailableResponse,
  normalizeLiveCaptionRuntimeResponse
} from './liveCaptionRuntimeContracts.js';
import { LIVE_CAPTION_RUNTIME_STATES } from '../constants/liveCaptionRuntimeStates.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionOffscreenBridge');

function resolveBrowserApi(browserApi = null) {
  if (browserApi) {
    return browserApi;
  }

  const candidateApis = [globalThis.chrome ?? null, globalThis.browser ?? null];
  return candidateApis.find((api) => api?.runtime?.sendMessage) ?? candidateApis.find(Boolean) ?? null;
}

/**
 * Background-side offscreen bridge contract.
 * Defines request construction, offscreen transport, validation, and response normalization.
 */
export class LiveCaptionOffscreenBridge {
  constructor({ browserApi = null } = {}) {
    this.browserApi = resolveBrowserApi(browserApi);
    this.status = LIVE_CAPTION_CAPTURE_STATES.IDLE;
    this.runtimeState = LIVE_CAPTION_RUNTIME_STATES.IDLE;
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

  getBrowserRuntime() {
    return this.browserApi?.runtime ?? null;
  }

  async ensureOffscreenDocument() {
    const chrome = this.browserApi;
    if (!chrome?.offscreen) {
      return;
    }

    try {
      const hasDoc = await chrome.offscreen.hasDocument().catch(() => false);
      if (hasDoc) {
        logger.debug('Recreating offscreen document to ensure USER_MEDIA reason...');
        await chrome.offscreen.closeDocument().catch(() => {});
      }

      logger.debug('Creating new offscreen document...');
      await chrome.offscreen.createDocument({
        url: 'src/html/offscreen.html',
        reasons: ['AUDIO_PLAYBACK', 'USER_MEDIA'],
        justification: 'Live caption capture and TTS playback'
      });
    } catch (error) {
      logger.error('Failed to ensure offscreen document:', error);
      throw error;
    }
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

  _buildRuntimeRequest(action, options = {}) {
    const requestBuilders = {
      [LIVE_CAPTION_RUNTIME_ACTIONS.START]: createLiveCaptionRuntimeStartRequest,
      [LIVE_CAPTION_RUNTIME_ACTIONS.STOP]: createLiveCaptionRuntimeStopRequest,
      [LIVE_CAPTION_RUNTIME_ACTIONS.STATUS]: createLiveCaptionRuntimeStatusRequest,
      [LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE]: createLiveCaptionRuntimePauseRequest,
      [LIVE_CAPTION_RUNTIME_ACTIONS.RESUME]: createLiveCaptionRuntimeResumeRequest
    };

    const buildRequest = requestBuilders[action];
    if (!buildRequest) {
      throw new TypeError(`Unsupported live-caption runtime action: ${action}`);
    }

    const request = {
      ...buildRequest(options),
      target: 'offscreen',
      forwardedFromBackground: true
    };

    this.lastRuntimeRequest = request;
    return request;
  }

  async _sendRuntimeRequest(action, options = {}) {
    const runtime = this.getBrowserRuntime();
    const request = this._buildRuntimeRequest(action, options);

    if (!runtime?.sendMessage) {
      const unavailable = createLiveCaptionRuntimeUnavailableResponse(action, {
        ...options,
        code: LIVE_CAPTION_OFFSCREEN_ERROR_CODES.OFFSCREEN_UNAVAILABLE,
        reason: 'offscreen_unavailable',
        message: 'Live-caption offscreen bridge is unavailable',
        runtimeState: options.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.ERROR
      });

      this.lastRuntimeResponse = unavailable;
      this.setStatus(LIVE_CAPTION_CAPTURE_STATES.UNAVAILABLE, {
        action,
        status: unavailable.status
      });
      this.setRuntimeState(unavailable.runtimeState, {
        action,
        status: unavailable.status
      });
      logger.warn('Live-caption offscreen bridge unavailable', {
        action,
        sessionId: request.data?.sessionId ?? null,
        tabId: request.data?.tabId ?? null,
        videoFingerprint: request.data?.videoFingerprint ?? null
      });
      return unavailable;
    }

    this.setRuntimeState(options.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.STARTING, {
      action,
      status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OFFSCREEN_NOT_READY
    });

    try {
      const response = await runtime.sendMessage(request);
      const normalized = normalizeLiveCaptionRuntimeResponse(response, {
        action,
        requestId: request.messageId,
        sessionId: request.data?.sessionId ?? null,
        tabId: request.data?.tabId ?? null,
        videoFingerprint: request.data?.videoFingerprint ?? null,
        runtimeState: options.runtimeState ?? this.runtimeState,
        message: options.message ?? null
      });

      this.lastRuntimeResponse = normalized;

      if (normalized.success === false || normalized.ok === false) {
        this.setStatus(LIVE_CAPTION_CAPTURE_STATES.ERROR, {
          action,
          status: normalized.status
        });
        this.setRuntimeState(normalized.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.ERROR, {
          action,
          status: normalized.status,
          reason: normalized.error?.reason || 'runtime_failure'
        });
        logger.warn('Live-caption offscreen runtime request failed closed', {
          action,
          status: normalized.status,
          code: normalized.error?.code ?? null,
          reason: normalized.error?.reason ?? null,
          sessionId: normalized.error?.sessionId ?? null,
          tabId: normalized.error?.tabId ?? null,
          videoFingerprint: normalized.error?.videoFingerprint ?? null
        });
        return normalized;
      }

      this.setStatus(normalized.status ?? this.status, {
        action,
        sessionId: normalized.sessionId ?? null,
        tabId: normalized.tabId ?? null
      });
      this.setRuntimeState(normalized.runtimeState ?? this.runtimeState, {
        action,
        status: normalized.status,
        sessionId: normalized.sessionId ?? null,
        tabId: normalized.tabId ?? null
      });

      logger.debug('Live-caption offscreen runtime request completed', {
        action,
        status: normalized.status,
        runtimeState: normalized.runtimeState,
        sessionId: normalized.sessionId,
        tabId: normalized.tabId,
        videoFingerprint: normalized.videoFingerprint
      });

      return normalized;
    } catch (error) {
      const unavailable = createLiveCaptionRuntimeUnavailableResponse(action, {
        ...options,
        code: LIVE_CAPTION_OFFSCREEN_ERROR_CODES.OFFSCREEN_UNAVAILABLE,
        reason: 'offscreen_unavailable',
        message: error?.message ?? 'Live-caption offscreen bridge is unavailable',
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.ERROR
      });

      this.lastRuntimeResponse = unavailable;
      this.setStatus(LIVE_CAPTION_CAPTURE_STATES.UNAVAILABLE, {
        action,
        status: unavailable.status
      });
      this.setRuntimeState(unavailable.runtimeState, {
        action,
        status: unavailable.status,
        reason: unavailable.error?.reason ?? 'offscreen_unavailable'
      });
      logger.warn('Live-caption offscreen runtime request threw', {
        action,
        code: unavailable.error?.code ?? null,
        reason: unavailable.error?.reason ?? null,
        sessionId: unavailable.error?.sessionId ?? null,
        tabId: unavailable.error?.tabId ?? null,
        videoFingerprint: unavailable.error?.videoFingerprint ?? null
      });
      return unavailable;
    }
  }

  requestRuntimeStart(options = {}) {
    this.setStatus(LIVE_CAPTION_CAPTURE_STATES.STARTING, {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
      sessionId: options.sessionId ?? null,
      tabId: options.tabId ?? null
    });
    return this._sendRuntimeRequest(LIVE_CAPTION_RUNTIME_ACTIONS.START, {
      ...options,
      runtimeState: LIVE_CAPTION_RUNTIME_STATES.STARTING
    });
  }

  requestRuntimeStop(options = {}) {
    this.setStatus(LIVE_CAPTION_CAPTURE_STATES.STOPPING, {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
      sessionId: options.sessionId ?? null,
      tabId: options.tabId ?? null
    });
    return this._sendRuntimeRequest(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, {
      ...options,
      runtimeState: LIVE_CAPTION_RUNTIME_STATES.STOPPING
    });
  }

  requestRuntimeStatus(options = {}) {
    return this._sendRuntimeRequest(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS, {
      ...options,
      runtimeState: options.runtimeState ?? this.runtimeState
    });
  }

  requestRuntimePause(options = {}) {
    this.setStatus(LIVE_CAPTION_CAPTURE_STATES.ACTIVE, {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
      sessionId: options.sessionId ?? null,
      tabId: options.tabId ?? null
    });
    return this._sendRuntimeRequest(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE, {
      ...options,
      runtimeState: LIVE_CAPTION_RUNTIME_STATES.PAUSED
    });
  }

  requestRuntimeResume(options = {}) {
    this.setStatus(LIVE_CAPTION_CAPTURE_STATES.ACTIVE, {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
      sessionId: options.sessionId ?? null,
      tabId: options.tabId ?? null
    });
    return this._sendRuntimeRequest(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME, {
      ...options,
      runtimeState: LIVE_CAPTION_RUNTIME_STATES.RUNNING
    });
  }

  createRuntimeStartResponse(options = {}) {
    return this.requestRuntimeStart(options);
  }

  createRuntimeStopResponse(options = {}) {
    return this.requestRuntimeStop(options);
  }

  createRuntimeStatusResponse(options = {}) {
    return this.requestRuntimeStatus(options);
  }

  createRuntimePauseResponse(options = {}) {
    return this.requestRuntimePause(options);
  }

  createRuntimeResumeResponse(options = {}) {
    return this.requestRuntimeResume(options);
  }

  createRuntimeUnavailableResponse(action, options = {}) {
    const response = createLiveCaptionRuntimeUnavailableResponse(action, options);
    this.lastRuntimeRequest = {
      action,
      ...options
    };
    this.lastRuntimeResponse = response;
    this.setRuntimeState(options.runtimeState ?? response.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.ERROR, {
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
      this.setRuntimeState(normalized.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.ERROR, {
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
