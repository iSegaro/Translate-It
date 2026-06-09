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

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionOffscreenBridge');

/**
 * Background-side offscreen bridge contract.
 * Defines message construction, validation, and response normalization only.
 */
export class LiveCaptionOffscreenBridge {
  constructor() {
    this.status = LIVE_CAPTION_CAPTURE_STATES.IDLE;
    this.lastRequest = null;
    this.lastResponse = null;
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

  getSnapshot() {
    return {
      status: this.status,
      lastRequest: this.lastRequest ? { ...this.lastRequest } : null,
      lastResponse: this.lastResponse ? { ...this.lastResponse } : null,
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

export default LiveCaptionOffscreenBridge;
