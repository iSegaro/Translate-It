import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LiveCaptionSessionManager } from '../core/LiveCaptionSessionManager.js';
import { LiveCaptionCleanupCoordinator, LIVE_CAPTION_CLEANUP_RESULT_STATUSES } from '../core/LiveCaptionCleanupCoordinator.js';
import { LiveCaptionCaptureCoordinator } from './LiveCaptionCaptureCoordinator.js';
import { LiveCaptionOffscreenBridge } from './LiveCaptionOffscreenBridge.js';
import {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  normalizeLiveCaptionRuntimeRequest,
  createLiveCaptionRuntimeSuccessResponse,
  createLiveCaptionRuntimeFailClosedResponse
} from './liveCaptionRuntimeContracts.js';
import { LIVE_CAPTION_RUNTIME_STATES } from '../constants/liveCaptionRuntimeStates.js';
import { LIVE_CAPTION_CLEANUP_REASONS } from '../core/contracts.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionBackgroundController');

function normalizeTabId(tabId) {
  if (tabId == null) {
    throw new TypeError('Live-caption runtime controller requires a tabId');
  }

  return tabId;
}

/**
 * Background runtime controller shell for Live Caption.
 * Registers runtime routing actions and coordinates shell-level state only.
 */
export class LiveCaptionBackgroundController {
  constructor({
    sessionManager = new LiveCaptionSessionManager(),
    cleanupCoordinator = new LiveCaptionCleanupCoordinator(),
    captureCoordinator = new LiveCaptionCaptureCoordinator(),
    offscreenBridge = new LiveCaptionOffscreenBridge()
  } = {}) {
    this.sessionManager = sessionManager;
    this.cleanupCoordinator = cleanupCoordinator;
    this.captureCoordinator = captureCoordinator;
    this.offscreenBridge = offscreenBridge;
    this.messageHandler = null;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.lastAction = null;
    this.lastRequest = null;
    this.lastResponse = null;

    logger.debug('Live-caption background controller created', {
      createdAt: this.createdAt
    });
  }

  touch() {
    this.updatedAt = Date.now();
  }

  registerHandlers(messageHandler) {
    if (!messageHandler) {
      throw new TypeError('LiveCaptionBackgroundController.registerHandlers requires a message handler');
    }

    this.messageHandler = messageHandler;

    messageHandler.registerHandler(LIVE_CAPTION_RUNTIME_ACTIONS.START, this.handleRuntimeStart.bind(this));
    messageHandler.registerHandler(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, this.handleRuntimeStop.bind(this));
    messageHandler.registerHandler(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS, this.handleRuntimeStatus.bind(this));
    messageHandler.registerHandler(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE, this.handleRuntimePause.bind(this));
    messageHandler.registerHandler(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME, this.handleRuntimeResume.bind(this));

    logger.info('Live-caption runtime handlers registered', {
      actions: Object.values(LIVE_CAPTION_RUNTIME_ACTIONS)
    });

    return this.getSnapshot();
  }

  _normalizeRequest(message, sender, action) {
    const normalizedMessage = normalizeLiveCaptionRuntimeRequest(message, {
      action,
      senderTabId: sender?.tab?.id ?? null,
      messageId: message?.messageId ?? null,
      timestamp: message?.timestamp ?? null
    });

    this.lastRequest = normalizedMessage;
    this.lastAction = action;
    this.touch();

    logger.debug('Live-caption runtime request received', {
      action,
      sessionId: normalizedMessage.data.sessionId,
      tabId: normalizedMessage.data.tabId,
      videoFingerprint: normalizedMessage.data.videoFingerprint
    });

    return normalizedMessage;
  }

  _buildShellResponse({
    action,
    status,
    runtimeState = LIVE_CAPTION_RUNTIME_STATES.IDLE,
    session,
    captureSnapshot = null,
    offscreenResponse = null,
    message = null,
    details = null,
    requestId = null,
    tabId = null,
    videoFingerprint = null
  } = {}) {
    const sessionSnapshot = session?.getSnapshot?.() ?? session?.getCleanupSnapshot?.() ?? null;
    const offscreenSnapshot = this.offscreenBridge.getSnapshot();

    const response = createLiveCaptionRuntimeSuccessResponse({
      action,
      status,
      runtimeState,
      sessionId: session?.sessionId ?? sessionSnapshot?.sessionId ?? null,
      tabId: tabId ?? session?.tabId ?? sessionSnapshot?.tabId ?? null,
      videoFingerprint: videoFingerprint ?? sessionSnapshot?.activeVideoFingerprint ?? null,
      requestId,
      message,
      details,
      sessionSnapshot,
      captureSnapshot,
      offscreenSnapshot: offscreenResponse ? {
        ...offscreenResponse,
        bridgeSnapshot: offscreenSnapshot
      } : offscreenSnapshot,
      offscreenStatus: offscreenResponse?.offscreenStatus ?? offscreenSnapshot?.runtimeState ?? null,
      captureStatus: offscreenResponse?.captureStatus ?? this.captureCoordinator.runtimeState ?? null
    });

    this.lastResponse = response;
    this.touch();

    logger.debug('Live-caption runtime response generated', {
      action,
      status,
      runtimeState: response.runtimeState,
      sessionId: response.sessionId,
      tabId: response.tabId,
      videoFingerprint: response.videoFingerprint
    });

    return response;
  }

  _buildFailClosedResponse(action, error, context = {}) {
    const response = createLiveCaptionRuntimeFailClosedResponse(action, error, {
      ...context,
      sessionId: context.sessionId ?? null,
      tabId: context.tabId ?? null,
      videoFingerprint: context.videoFingerprint ?? null,
      runtimeState: context.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.ERROR
    });

    this.lastResponse = response;
    this.touch();

    logger.warn('Live-caption runtime request failed closed', {
      action,
      code: response.error?.code ?? null,
      sessionId: response.error?.sessionId ?? null,
      tabId: response.error?.tabId ?? null,
      videoFingerprint: response.error?.videoFingerprint ?? null
    });

    return response;
  }

  handleRuntimeStart(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.START);
      const tabId = normalizeTabId(request.data.tabId);
      const session = this.sessionManager.getOrCreateSession(tabId, {
        consentAccepted: Boolean(request.data.consentAccepted)
      });

      session.setConsentAccepted(Boolean(request.data.consentAccepted));
      session.start();

      this.captureCoordinator.startRuntime({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        reason: request.data.reason ?? 'start'
      });
      this.captureCoordinator.setRuntimeState(LIVE_CAPTION_RUNTIME_STATES.RUNNING, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        reason: request.data.reason ?? 'start'
      });

      const offscreenResponse = this.offscreenBridge.createRuntimeStartResponse({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        requestId: request.messageId,
        runtimeState: this.captureCoordinator.runtimeState,
        message: 'Live-caption runtime shell only'
      });

      const response = this._buildShellResponse({
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        status: offscreenResponse.status,
        runtimeState: this.captureCoordinator.runtimeState,
        session,
        offscreenResponse,
        requestId: request.messageId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        message: offscreenResponse.message
      });

      logger.info('Live-caption runtime start routed', {
        tabId,
        sessionId: session.sessionId,
        runtimeState: response.runtimeState,
        status: response.status
      });

      return response;
    } catch (error) {
      return this._buildFailClosedResponse(LIVE_CAPTION_RUNTIME_ACTIONS.START, error, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START
      });
    }
  }

  handleRuntimeStop(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.STOP);
      const tabId = normalizeTabId(request.data.tabId);
      const session = this.sessionManager.getOrCreateSession(tabId, {
        consentAccepted: Boolean(request.data.consentAccepted)
      });
      const sessionSnapshot = session.getCleanupSnapshot?.() ?? session.getSnapshot?.() ?? null;
      const cleanupPlan = this.cleanupCoordinator.createCleanupPlan({
        reason: request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP,
        session,
        sessionSnapshot,
        notifyContent: request.data.notifyContent !== false,
        clearCache: Boolean(request.data.clearCache)
      });

      this.captureCoordinator.stopRuntime({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        reason: request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP
      });
      this.captureCoordinator.setRuntimeState(LIVE_CAPTION_RUNTIME_STATES.IDLE, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
        reason: request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP
      });

      const offscreenResponse = this.offscreenBridge.createRuntimeStopResponse({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        requestId: request.messageId,
        runtimeState: this.captureCoordinator.runtimeState,
        message: 'Live-caption runtime shell only'
      });

      this.sessionManager.cleanupByTabId(tabId, request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP);
      const sessionCleanupMetadata = this.sessionManager.getSessionCleanupMetadata(tabId) ?? null;
      const cleanupResult = this.cleanupCoordinator.createCleanupResult({
        plan: cleanupPlan,
        status: sessionCleanupMetadata?.status ?? null,
        error: sessionCleanupMetadata?.error ?? null,
        sessionSnapshot: sessionCleanupMetadata?.snapshot ?? sessionSnapshot ?? null
      });

      const hasCleanupFailure = [
        LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAILED,
        LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED
      ].includes(cleanupResult.status);

      if (hasCleanupFailure) {
        this.captureCoordinator.setRuntimeState(LIVE_CAPTION_RUNTIME_STATES.ERROR, {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
          reason: cleanupResult.reason ?? request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP,
          cleanupStatus: cleanupResult.status
        });
      }

      const response = cleanupResult.status === LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED
        || cleanupResult.status === LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAILED
        ? this._buildFailClosedResponse(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, cleanupResult.error || new Error('Live-caption cleanup failed'), {
            action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
            sessionId: session.sessionId,
            tabId,
            videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
            runtimeState: this.captureCoordinator.runtimeState,
            message: offscreenResponse.message,
            reason: request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP
          })
        : this._buildShellResponse({
            action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
            status: offscreenResponse.status,
            runtimeState: this.captureCoordinator.runtimeState,
            session,
            offscreenResponse,
            captureSnapshot: this.captureCoordinator.getSnapshot(),
            requestId: request.messageId,
            tabId,
            videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
            message: offscreenResponse.message,
            details: {
              cleanupPlan,
              cleanupResult,
              sessionCleanupMetadata
            }
          });

      logger.info('Live-caption runtime stop routed', {
        tabId,
        sessionId: session.sessionId,
        runtimeState: response.runtimeState,
        status: response.status
      });

      return response;
    } catch (error) {
      return this._buildFailClosedResponse(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, error, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP
      });
    }
  }

  handleRuntimeStatus(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.STATUS);
      const tabId = normalizeTabId(request.data.tabId);
      const session = this.sessionManager.getOrCreateSession(tabId, {
        consentAccepted: Boolean(request.data.consentAccepted)
      });
      const offscreenResponse = this.offscreenBridge.createRuntimeStatusResponse({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        requestId: request.messageId,
        runtimeState: this.captureCoordinator.runtimeState,
        message: 'Live-caption runtime shell only'
      });

      const response = this._buildShellResponse({
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
        status: offscreenResponse.status,
        runtimeState: this.captureCoordinator.runtimeState,
        session,
        offscreenResponse,
        captureSnapshot: this.captureCoordinator.getSnapshot(),
        requestId: request.messageId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        message: offscreenResponse.message,
        details: {
          sessionManagerSnapshot: this.sessionManager.getSessionCleanupSnapshot(tabId)
        }
      });

      logger.debug('Live-caption runtime status routed', {
        tabId,
        sessionId: session.sessionId,
        runtimeState: response.runtimeState,
        status: response.status
      });

      return response;
    } catch (error) {
      return this._buildFailClosedResponse(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS, error, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS
      });
    }
  }

  handleRuntimePause(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE);
      const tabId = normalizeTabId(request.data.tabId);
      const session = this.sessionManager.getOrCreateSession(tabId, {
        consentAccepted: Boolean(request.data.consentAccepted)
      });

      this.captureCoordinator.pauseRuntime({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        reason: request.data.reason ?? 'pause'
      });
      const offscreenResponse = this.offscreenBridge.createRuntimePauseResponse({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        requestId: request.messageId,
        runtimeState: this.captureCoordinator.runtimeState,
        message: 'Live-caption runtime shell only'
      });

      const response = this._buildShellResponse({
        action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
        status: offscreenResponse.status,
        runtimeState: this.captureCoordinator.runtimeState,
        session,
        offscreenResponse,
        captureSnapshot: this.captureCoordinator.getSnapshot(),
        requestId: request.messageId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        message: offscreenResponse.message
      });

      logger.info('Live-caption runtime pause routed', {
        tabId,
        sessionId: session.sessionId,
        runtimeState: response.runtimeState,
        status: response.status
      });

      return response;
    } catch (error) {
      return this._buildFailClosedResponse(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE, error, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE
      });
    }
  }

  handleRuntimeResume(message, sender) {
    try {
      const request = this._normalizeRequest(message, sender, LIVE_CAPTION_RUNTIME_ACTIONS.RESUME);
      const tabId = normalizeTabId(request.data.tabId);
      const session = this.sessionManager.getOrCreateSession(tabId, {
        consentAccepted: Boolean(request.data.consentAccepted)
      });

      this.captureCoordinator.resumeRuntime({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        reason: request.data.reason ?? 'resume'
      });
      const offscreenResponse = this.offscreenBridge.createRuntimeResumeResponse({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        requestId: request.messageId,
        runtimeState: this.captureCoordinator.runtimeState,
        message: 'Live-caption runtime shell only'
      });

      const response = this._buildShellResponse({
        action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
        status: offscreenResponse.status,
        runtimeState: this.captureCoordinator.runtimeState,
        session,
        offscreenResponse,
        captureSnapshot: this.captureCoordinator.getSnapshot(),
        requestId: request.messageId,
        tabId,
        videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
        message: offscreenResponse.message
      });

      logger.info('Live-caption runtime resume routed', {
        tabId,
        sessionId: session.sessionId,
        runtimeState: response.runtimeState,
        status: response.status
      });

      return response;
    } catch (error) {
      return this._buildFailClosedResponse(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME, error, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME
      });
    }
  }

  getSnapshot() {
    return {
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastAction: this.lastAction,
      lastRequest: this.lastRequest ? { ...this.lastRequest } : null,
      lastResponse: this.lastResponse ? { ...this.lastResponse } : null,
      sessionManagerSnapshot: this.sessionManager.getAllSessionSnapshots(),
      captureCoordinatorSnapshot: this.captureCoordinator.getSnapshot(),
      offscreenBridgeSnapshot: this.offscreenBridge.getSnapshot()
    };
  }
}

export default LiveCaptionBackgroundController;
