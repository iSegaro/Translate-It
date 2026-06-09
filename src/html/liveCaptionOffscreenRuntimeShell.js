import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_ERROR_CODES,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  LIVE_CAPTION_RUNTIME_SHELL_STATES,
  createLiveCaptionRuntimeFailClosedResponse,
  createLiveCaptionRuntimeShellResponse,
  normalizeLiveCaptionRuntimeRequest
} from '@/features/live-caption/background/liveCaptionRuntimeContracts.js';
import { LIVE_CAPTION_RUNTIME_STATES } from '@/features/live-caption/constants/liveCaptionRuntimeStates.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionOffscreenRuntimeShell');

function cloneSessionContext(context = {}) {
  return {
    sessionId: context.sessionId ?? null,
    tabId: context.tabId ?? null,
    videoFingerprint: context.videoFingerprint ?? null
  };
}

function createInconsistentSessionError(request, state, action) {
  return new Error(
    `Live-caption offscreen shell rejected ${action} for inconsistent session: ${request.data.sessionId} != ${state.sessionId}`
  );
}

export class LiveCaptionOffscreenRuntimeShell {
  constructor() {
    this.status = LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE;
    this.runtimeState = LIVE_CAPTION_RUNTIME_STATES.IDLE;
    this.sessionId = null;
    this.tabId = null;
    this.videoFingerprint = null;
    this.lastRequest = null;
    this.lastResponse = null;
    this.lastUpdatedAt = Date.now();
  }

  touch() {
    this.lastUpdatedAt = Date.now();
  }

  _setState({ status = this.status, runtimeState = this.runtimeState } = {}, details = {}) {
    this.status = status;
    this.runtimeState = runtimeState;
    this.touch();

    logger.debug('Live-caption offscreen shell state updated', {
      status,
      runtimeState,
      ...details
    });
  }

  _setSessionContext({ sessionId, tabId, videoFingerprint } = {}) {
    this.sessionId = sessionId ?? this.sessionId;
    this.tabId = tabId ?? this.tabId;
    this.videoFingerprint = videoFingerprint ?? this.videoFingerprint;
    this.touch();
  }

  _clearSessionContext() {
    this.sessionId = null;
    this.tabId = null;
    this.videoFingerprint = null;
    this.touch();
  }

  _ensureConsistency(request, action) {
    if (this.sessionId == null) {
      return null;
    }

    if (request.data.sessionId !== this.sessionId) {
      return createInconsistentSessionError(request, this, action);
    }

    return null;
  }

  _buildFailClosed(action, error, context = {}) {
    const response = createLiveCaptionRuntimeFailClosedResponse(action, error, {
      ...cloneSessionContext(context),
      code: context.code ?? LIVE_CAPTION_RUNTIME_ERROR_CODES.INCONSISTENT_SESSION,
      reason: context.reason ?? 'inconsistent_session',
      runtimeState: context.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.ERROR,
      status: context.status ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED,
      message: context.message ?? error?.message ?? 'Live-caption offscreen shell failed closed'
    });

    this.lastResponse = response;
    this._setState({
      status: LIVE_CAPTION_RUNTIME_SHELL_STATES.ERROR,
      runtimeState: LIVE_CAPTION_RUNTIME_STATES.ERROR
    }, {
      action,
      reason: response.error?.reason ?? context.reason ?? 'offscreen_failure'
    });

    logger.warn('Live-caption offscreen shell failed closed', {
      action,
      code: response.error?.code ?? null,
      reason: response.error?.reason ?? null,
      sessionId: response.error?.sessionId ?? null,
      tabId: response.error?.tabId ?? null,
      videoFingerprint: response.error?.videoFingerprint ?? null
    });

    return response;
  }

  _normalizeRequest(message, sender, action) {
    const request = normalizeLiveCaptionRuntimeRequest(message, {
      action,
      senderTabId: sender?.tab?.id ?? null,
      messageId: message?.messageId ?? null,
      timestamp: message?.timestamp ?? null
    });

    this.lastRequest = request;
    this.touch();

    logger.debug('Live-caption offscreen shell request normalized', {
      action,
      sessionId: request.data.sessionId,
      tabId: request.data.tabId,
      videoFingerprint: request.data.videoFingerprint
    });

    return request;
  }

  getSnapshot() {
    return {
      status: this.status,
      runtimeState: this.runtimeState,
      sessionId: this.sessionId,
      tabId: this.tabId,
      videoFingerprint: this.videoFingerprint,
      lastRequest: this.lastRequest ? { ...this.lastRequest } : null,
      lastResponse: this.lastResponse ? { ...this.lastResponse } : null,
      lastUpdatedAt: this.lastUpdatedAt
    };
  }

  handleRuntimeStart(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.START);
      const sessionError = this._ensureConsistency(request, LIVE_CAPTION_RUNTIME_ACTIONS.START);
      if (sessionError) {
        return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.START, sessionError, {
          sessionId: request.data.sessionId,
          tabId: request.data.tabId,
          videoFingerprint: request.data.videoFingerprint,
          reason: 'inconsistent_session'
        });
      }

      this._setSessionContext(request.data);
      this._setState({
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.STARTING,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.STARTING
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        sessionId: request.data.sessionId,
        tabId: request.data.tabId
      });
      this._setState({
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.RUNNING
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        sessionId: request.data.sessionId,
        tabId: request.data.tabId,
        videoFingerprint: request.data.videoFingerprint
      });

      const response = createLiveCaptionRuntimeShellResponse(LIVE_CAPTION_RUNTIME_ACTIONS.START, {
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        requestId: request.messageId,
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.RUNNING,
        message: 'Live-caption offscreen shell running'
      });

      this.lastResponse = response;
      logger.info('Live-caption offscreen shell start handled', {
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        status: response.status
      });
      return response;
    } catch (error) {
      return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.START, error, {
        sessionId: message?.data?.sessionId ?? null,
        tabId: message?.data?.tabId ?? null,
        videoFingerprint: message?.data?.videoFingerprint ?? null,
        code: LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
        reason: 'invalid_payload'
      });
    }
  }

  handleRuntimeStatus(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.STATUS);
      const sessionError = this._ensureConsistency(request, LIVE_CAPTION_RUNTIME_ACTIONS.STATUS);
      if (sessionError) {
        return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS, sessionError, {
          sessionId: request.data.sessionId,
          tabId: request.data.tabId,
          videoFingerprint: request.data.videoFingerprint,
          reason: 'inconsistent_session'
        });
      }

      const response = createLiveCaptionRuntimeShellResponse(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS, {
        sessionId: this.sessionId ?? request.data.sessionId,
        tabId: this.tabId ?? request.data.tabId,
        videoFingerprint: this.videoFingerprint ?? request.data.videoFingerprint,
        requestId: request.messageId,
        status: this.status,
        runtimeState: this.runtimeState,
        message: 'Live-caption offscreen shell status'
      });

      this.lastResponse = response;
      this._setState({
        status: this.status,
        runtimeState: this.runtimeState
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
        sessionId: response.sessionId,
        tabId: response.tabId
      });

      logger.debug('Live-caption offscreen shell status handled', {
        sessionId: response.sessionId,
        tabId: response.tabId,
        status: response.status,
        runtimeState: response.runtimeState
      });

      return response;
    } catch (error) {
      return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS, error, {
        sessionId: message?.data?.sessionId ?? null,
        tabId: message?.data?.tabId ?? null,
        videoFingerprint: message?.data?.videoFingerprint ?? null,
        code: LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
        reason: 'invalid_payload'
      });
    }
  }

  handleRuntimePause(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE);
      const sessionError = this._ensureConsistency(request, LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE);
      if (sessionError) {
        return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE, sessionError, {
          sessionId: request.data.sessionId,
          tabId: request.data.tabId,
          videoFingerprint: request.data.videoFingerprint,
          reason: 'inconsistent_session'
        });
      }

      this._setState({
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.PAUSED
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
        sessionId: request.data.sessionId,
        tabId: request.data.tabId
      });

      const response = createLiveCaptionRuntimeShellResponse(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE, {
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        requestId: request.messageId,
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.PAUSED,
        message: 'Live-caption offscreen shell paused'
      });

      this.lastResponse = response;
      logger.info('Live-caption offscreen shell pause handled', {
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        status: response.status
      });
      return response;
    } catch (error) {
      return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE, error, {
        sessionId: message?.data?.sessionId ?? null,
        tabId: message?.data?.tabId ?? null,
        videoFingerprint: message?.data?.videoFingerprint ?? null,
        code: LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
        reason: 'invalid_payload'
      });
    }
  }

  handleRuntimeResume(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.RESUME);
      const sessionError = this._ensureConsistency(request, LIVE_CAPTION_RUNTIME_ACTIONS.RESUME);
      if (sessionError) {
        return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME, sessionError, {
          sessionId: request.data.sessionId,
          tabId: request.data.tabId,
          videoFingerprint: request.data.videoFingerprint,
          reason: 'inconsistent_session'
        });
      }

      this._setState({
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.RUNNING
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
        sessionId: request.data.sessionId,
        tabId: request.data.tabId
      });

      const response = createLiveCaptionRuntimeShellResponse(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME, {
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        requestId: request.messageId,
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.RUNNING,
        message: 'Live-caption offscreen shell resumed'
      });

      this.lastResponse = response;
      logger.info('Live-caption offscreen shell resume handled', {
        sessionId: this.sessionId,
        tabId: this.tabId,
        videoFingerprint: this.videoFingerprint,
        status: response.status
      });
      return response;
    } catch (error) {
      return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME, error, {
        sessionId: message?.data?.sessionId ?? null,
        tabId: message?.data?.tabId ?? null,
        videoFingerprint: message?.data?.videoFingerprint ?? null,
        code: LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
        reason: 'invalid_payload'
      });
    }
  }

  handleRuntimeStop(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.STOP);
      const sessionError = this._ensureConsistency(request, LIVE_CAPTION_RUNTIME_ACTIONS.STOP);
      if (sessionError) {
        return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, sessionError, {
          sessionId: request.data.sessionId,
          tabId: request.data.tabId,
          videoFingerprint: request.data.videoFingerprint,
          reason: 'inconsistent_session'
        });
      }

      this._setState({
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.STOPPING,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.STOPPING
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
        sessionId: request.data.sessionId,
        tabId: request.data.tabId
      });
      this._clearSessionContext();
      this._setState({
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.IDLE
      }, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP
      });

      const response = createLiveCaptionRuntimeShellResponse(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, {
        sessionId: request.data.sessionId,
        tabId: request.data.tabId,
        videoFingerprint: request.data.videoFingerprint,
        requestId: request.messageId,
        status: LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE,
        runtimeState: LIVE_CAPTION_RUNTIME_STATES.IDLE,
        message: 'Live-caption offscreen shell stopped'
      });

      this.lastResponse = response;
      logger.info('Live-caption offscreen shell stop handled', {
        sessionId: request.data.sessionId,
        tabId: request.data.tabId,
        videoFingerprint: request.data.videoFingerprint,
        status: response.status
      });
      return response;
    } catch (error) {
      return this._buildFailClosed(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, error, {
        sessionId: message?.data?.sessionId ?? null,
        tabId: message?.data?.tabId ?? null,
        videoFingerprint: message?.data?.videoFingerprint ?? null,
        code: LIVE_CAPTION_RUNTIME_ERROR_CODES.INVALID_PAYLOAD,
        reason: 'invalid_payload'
      });
    }
  }

  handleMessage(message, sender) {
    const action = message?.action ?? null;

    switch (action) {
      case LIVE_CAPTION_RUNTIME_ACTIONS.START:
        return this.handleRuntimeStart(message, sender);
      case LIVE_CAPTION_RUNTIME_ACTIONS.STATUS:
        return this.handleRuntimeStatus(message, sender);
      case LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE:
        return this.handleRuntimePause(message, sender);
      case LIVE_CAPTION_RUNTIME_ACTIONS.RESUME:
        return this.handleRuntimeResume(message, sender);
      case LIVE_CAPTION_RUNTIME_ACTIONS.STOP:
        return this.handleRuntimeStop(message, sender);
      default:
        return this._buildFailClosed(action, new TypeError(`Unknown live-caption offscreen runtime action: ${String(action)}`), {
          code: LIVE_CAPTION_RUNTIME_ERROR_CODES.UNKNOWN_ACTION,
          reason: 'unknown_action',
          status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED
        });
    }
  }
}

export {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_ERROR_CODES,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  LIVE_CAPTION_RUNTIME_SHELL_STATES,
  LIVE_CAPTION_RUNTIME_STATES,
  createLiveCaptionRuntimeFailClosedResponse,
  createLiveCaptionRuntimeShellResponse,
  normalizeLiveCaptionRuntimeRequest
} from '@/features/live-caption/background/liveCaptionRuntimeContracts.js';

export default LiveCaptionOffscreenRuntimeShell;
