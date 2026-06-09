import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { LiveCaptionSessionManager } from "../core/LiveCaptionSessionManager.js";
import {
  LiveCaptionCleanupCoordinator,
  LIVE_CAPTION_CLEANUP_RESULT_STATUSES,
} from "../core/LiveCaptionCleanupCoordinator.js";
import { LiveCaptionCaptureCoordinator } from "./LiveCaptionCaptureCoordinator.js";
import { LiveCaptionOffscreenBridge } from "./LiveCaptionOffscreenBridge.js";
import {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  normalizeLiveCaptionRuntimeRequest,
  createLiveCaptionRuntimeSuccessResponse,
  createLiveCaptionRuntimeFailClosedResponse,
} from "./liveCaptionRuntimeContracts.js";
import { LIVE_CAPTION_RUNTIME_STATES } from "../constants/liveCaptionRuntimeStates.js";
import { LIVE_CAPTION_CLEANUP_REASONS } from "../core/contracts.js";
import { LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES } from "./liveCaptionOffscreenContracts.js";

const logger = getScopedLogger(
  LOG_COMPONENTS.LIVE_CAPTION,
  "LiveCaptionBackgroundController",
);

function normalizeTabId(tabId) {
  if (tabId == null) {
    throw new TypeError("Live-caption runtime controller requires a tabId");
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
    offscreenBridge = new LiveCaptionOffscreenBridge(),
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

    logger.debug("Live-caption background controller created", {
      createdAt: this.createdAt,
    });
  }

  touch() {
    this.updatedAt = Date.now();
  }

  registerHandlers(messageHandler) {
    if (!messageHandler) {
      throw new TypeError(
        "LiveCaptionBackgroundController.registerHandlers requires a message handler",
      );
    }

    this.messageHandler = messageHandler;

    messageHandler.registerHandler(
      LIVE_CAPTION_RUNTIME_ACTIONS.START,
      this.handleRuntimeStart.bind(this),
    );
    messageHandler.registerHandler(
      LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
      this.handleRuntimeStop.bind(this),
    );
    messageHandler.registerHandler(
      LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
      this.handleRuntimeStatus.bind(this),
    );
    messageHandler.registerHandler(
      LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
      this.handleRuntimePause.bind(this),
    );
    messageHandler.registerHandler(
      LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
      this.handleRuntimeResume.bind(this),
    );
    messageHandler.registerHandler(
      LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK,
      this.handleFinalizedChunk.bind(this),
    );
    messageHandler.registerHandler(
      LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.CAPTURE_ERROR,
      this.handleCaptureError.bind(this),
    );

    logger.info("Live-caption runtime handlers registered", {
      actions: [
        ...Object.values(LIVE_CAPTION_RUNTIME_ACTIONS),
        LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK,
        LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.CAPTURE_ERROR,
      ],
    });

    return this.getSnapshot();
  }

  _normalizeRequest(message, sender, action) {
    const normalizedMessage = normalizeLiveCaptionRuntimeRequest(message, {
      action,
      senderTabId: sender?.tab?.id ?? null,
      messageId: message?.messageId ?? null,
      timestamp: message?.timestamp ?? null,
    });

    this.lastRequest = normalizedMessage;
    this.lastAction = action;
    this.touch();

    logger.debug("Live-caption runtime request received", {
      action,
      sessionId: normalizedMessage.data.sessionId,
      tabId: normalizedMessage.data.tabId,
      videoFingerprint: normalizedMessage.data.videoFingerprint,
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
    videoFingerprint = null,
  } = {}) {
    const sessionSnapshot =
      session?.getSnapshot?.() ?? session?.getCleanupSnapshot?.() ?? null;
    const offscreenSnapshot = this.offscreenBridge.getSnapshot();

    const response = createLiveCaptionRuntimeSuccessResponse({
      action,
      status,
      runtimeState,
      sessionId: session?.sessionId ?? sessionSnapshot?.sessionId ?? null,
      tabId: tabId ?? session?.tabId ?? sessionSnapshot?.tabId ?? null,
      videoFingerprint:
        videoFingerprint ?? sessionSnapshot?.activeVideoFingerprint ?? null,
      requestId,
      message,
      details,
      sessionSnapshot,
      captureSnapshot,
      offscreenSnapshot: offscreenResponse
        ? {
            ...offscreenResponse,
            bridgeSnapshot: offscreenSnapshot,
          }
        : offscreenSnapshot,
      offscreenStatus:
        offscreenResponse?.offscreenStatus ??
        offscreenSnapshot?.runtimeState ??
        null,
      captureStatus:
        offscreenResponse?.captureStatus ??
        this.captureCoordinator.runtimeState ??
        null,
    });

    this.lastResponse = response;
    this.touch();

    logger.debug("Live-caption runtime response generated", {
      action,
      status,
      runtimeState: response.runtimeState,
      sessionId: response.sessionId,
      tabId: response.tabId,
      videoFingerprint: response.videoFingerprint,
    });

    return response;
  }

  _buildFailClosedResponse(action, error, context = {}) {
    const response = createLiveCaptionRuntimeFailClosedResponse(action, error, {
      ...context,
      sessionId: context.sessionId ?? null,
      tabId: context.tabId ?? null,
      videoFingerprint: context.videoFingerprint ?? null,
      runtimeState: context.runtimeState ?? LIVE_CAPTION_RUNTIME_STATES.ERROR,
    });

    this.lastResponse = response;
    this.touch();

    logger.warn("Live-caption runtime request failed closed", {
      action,
      code: response.error?.code ?? null,
      sessionId: response.error?.sessionId ?? null,
      tabId: response.error?.tabId ?? null,
      videoFingerprint: response.error?.videoFingerprint ?? null,
    });

    return response;
  }

  async handleRuntimeStart(message, sender) {
    // 1. Resolve tabId synchronously first to preserve gesture context
    const data = message?.data || {};
    const senderTabId = sender?.tab?.id ?? null;
    const tabId = data.tabId ?? senderTabId ?? null;

    if (tabId == null) {
      return this._buildFailClosedResponse(
        LIVE_CAPTION_RUNTIME_ACTIONS.START,
        new TypeError("Live-caption runtime start requires tabId"),
        {
          sessionId: data.sessionId ?? null,
          tabId: null,
          videoFingerprint: data.videoFingerprint ?? null,
          code: "missing_tab_id",
          reason: "invalid_payload",
        },
      );
    }

    // 2. Query tabCapture streamId synchronously
    let streamId = null;
    const browserApi = this.offscreenBridge.browserApi;
    if (browserApi?.tabCapture?.getMediaStreamId) {
      try {
        streamId = await new Promise((resolve, reject) => {
          browserApi.tabCapture.getMediaStreamId(
            { targetTabId: Number(tabId) },
            (id) => {
              if (browserApi.runtime?.lastError) {
                reject(new Error(browserApi.runtime.lastError.message));
              } else if (!id) {
                reject(new Error("No stream ID returned by tabCapture"));
              } else {
                resolve(id);
              }
            },
          );
        });
      } catch (captureError) {
        logger.error("Failed to capture media stream ID:", captureError);
        return this._buildFailClosedResponse(
          LIVE_CAPTION_RUNTIME_ACTIONS.START,
          captureError,
          {
            tabId,
            sessionId: data.sessionId ?? null,
            videoFingerprint: data.videoFingerprint ?? null,
            code: "tab_capture_failed",
            reason: "tab_capture_failure",
          },
        );
      }
    } else {
      logger.warn("chrome.tabCapture.getMediaStreamId is not available");
      // If running inside Chrome/Edge context where tabCapture is expected but missing:
      if (globalThis.chrome && !browserApi?.tabCapture?.getMediaStreamId) {
        return this._buildFailClosedResponse(
          LIVE_CAPTION_RUNTIME_ACTIONS.START,
          new Error(
            "chrome.tabCapture is not available on this browser/platform",
          ),
          {
            tabId,
            sessionId: data.sessionId ?? null,
            videoFingerprint: data.videoFingerprint ?? null,
            code: "tab_capture_unsupported",
            reason: "tab_capture_unsupported",
          },
        );
      }
    }

    try {
      const request = this._normalizeRequest(
        message,
        sender,
        LIVE_CAPTION_RUNTIME_ACTIONS.START,
      );

      // 3. Ensure the offscreen document is open before messaging it
      await this.offscreenBridge.ensureOffscreenDocument();

      const session = this.sessionManager.getOrCreateSession(tabId, {
        consentAccepted: Boolean(request.data.consentAccepted),
      });

      session.setConsentAccepted(Boolean(request.data.consentAccepted));
      session.start();

      this.captureCoordinator.startRuntime({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
        reason: request.data.reason ?? "start",
      });
      this.captureCoordinator.setRuntimeState(
        LIVE_CAPTION_RUNTIME_STATES.RUNNING,
        {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
          reason: request.data.reason ?? "start",
        },
      );

      const offscreenResponse = await this.offscreenBridge.requestRuntimeStart({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
        requestId: request.messageId,
        runtimeState: this.captureCoordinator.runtimeState,
        streamId, // Forward the stream ID!
        message: "Live-caption runtime start",
      });

      const normalizedOffscreenResponse =
        this.captureCoordinator.applyOffscreenResponse(offscreenResponse, {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
          reason: request.data.reason ?? "start",
        });

      if (
        normalizedOffscreenResponse.success === false ||
        normalizedOffscreenResponse.ok === false
      ) {
        return this._buildFailClosedResponse(
          LIVE_CAPTION_RUNTIME_ACTIONS.START,
          normalizedOffscreenResponse.error ||
            new Error("Live-caption offscreen start failed"),
          {
            action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
            sessionId: session.sessionId,
            tabId,
            videoFingerprint:
              request.data.videoFingerprint ??
              session.activeVideoFingerprint ??
              null,
            runtimeState: this.captureCoordinator.runtimeState,
            message: normalizedOffscreenResponse.message,
            reason:
              normalizedOffscreenResponse.error?.reason ??
              request.data.reason ??
              "offscreen_failure",
          },
        );
      }

      const response = this._buildShellResponse({
        action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
        status: normalizedOffscreenResponse.status,
        runtimeState: this.captureCoordinator.runtimeState,
        session,
        offscreenResponse: normalizedOffscreenResponse,
        requestId: request.messageId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
        message: normalizedOffscreenResponse.message,
      });

      logger.info("Live-caption runtime start routed", {
        tabId,
        sessionId: session.sessionId,
        runtimeState: response.runtimeState,
        status: response.status,
      });

      return response;
    } catch (error) {
      return this._buildFailClosedResponse(
        LIVE_CAPTION_RUNTIME_ACTIONS.START,
        error,
        {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
          tabId,
          sessionId: data.sessionId ?? null,
          videoFingerprint: data.videoFingerprint ?? null,
        },
      );
    }
  }

  async handleRuntimeStop(message, sender) {
    try {
      const request = this._normalizeRequest(
        message,
        sender,
        LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
      );
      const tabId = normalizeTabId(request.data.tabId);
      const session = this.sessionManager.getOrCreateSession(tabId, {
        consentAccepted: Boolean(request.data.consentAccepted),
      });
      const sessionSnapshot =
        session.getCleanupSnapshot?.() ?? session.getSnapshot?.() ?? null;
      const cleanupPlan = this.cleanupCoordinator.createCleanupPlan({
        reason: request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP,
        session,
        sessionSnapshot,
        notifyContent: request.data.notifyContent !== false,
        clearCache: Boolean(request.data.clearCache),
      });

      this.captureCoordinator.stopRuntime({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
        reason: request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP,
      });
      this.captureCoordinator.setRuntimeState(
        LIVE_CAPTION_RUNTIME_STATES.IDLE,
        {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
          reason: request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP,
        },
      );

      const offscreenResponse = await this.offscreenBridge.requestRuntimeStop({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
        requestId: request.messageId,
        runtimeState: this.captureCoordinator.runtimeState,
        message: "Live-caption runtime shell only",
      });
      const normalizedOffscreenResponse =
        this.captureCoordinator.applyOffscreenResponse(offscreenResponse, {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
          reason: request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP,
        });

      this.sessionManager.cleanupByTabId(
        tabId,
        request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP,
      );
      const sessionCleanupMetadata =
        this.sessionManager.getSessionCleanupMetadata(tabId) ?? null;
      const cleanupResult = this.cleanupCoordinator.createCleanupResult({
        plan: cleanupPlan,
        status: sessionCleanupMetadata?.status ?? null,
        error: sessionCleanupMetadata?.error ?? null,
        sessionSnapshot:
          sessionCleanupMetadata?.snapshot ?? sessionSnapshot ?? null,
      });

      const hasCleanupFailure = [
        LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAILED,
        LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED,
      ].includes(cleanupResult.status);

      if (hasCleanupFailure) {
        this.captureCoordinator.setRuntimeState(
          LIVE_CAPTION_RUNTIME_STATES.ERROR,
          {
            action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
            reason:
              cleanupResult.reason ??
              request.data.reason ??
              LIVE_CAPTION_CLEANUP_REASONS.STOP,
            cleanupStatus: cleanupResult.status,
          },
        );
      }

      const response =
        cleanupResult.status ===
          LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED ||
        cleanupResult.status === LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAILED ||
        normalizedOffscreenResponse.success === false ||
        normalizedOffscreenResponse.ok === false
          ? this._buildFailClosedResponse(
              LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
              cleanupResult.error ||
                normalizedOffscreenResponse.error ||
                new Error("Live-caption cleanup failed"),
              {
                action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
                sessionId: session.sessionId,
                tabId,
                videoFingerprint:
                  request.data.videoFingerprint ??
                  session.activeVideoFingerprint ??
                  null,
                runtimeState: this.captureCoordinator.runtimeState,
                message: normalizedOffscreenResponse.message,
                reason:
                  normalizedOffscreenResponse.error?.reason ??
                  request.data.reason ??
                  LIVE_CAPTION_CLEANUP_REASONS.STOP,
              },
            )
          : this._buildShellResponse({
              action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
              status: normalizedOffscreenResponse.status,
              runtimeState: this.captureCoordinator.runtimeState,
              session,
              offscreenResponse: normalizedOffscreenResponse,
              captureSnapshot: this.captureCoordinator.getSnapshot(),
              requestId: request.messageId,
              tabId,
              videoFingerprint:
                request.data.videoFingerprint ??
                session.activeVideoFingerprint ??
                null,
              message: normalizedOffscreenResponse.message,
              details: {
                cleanupPlan,
                cleanupResult,
                sessionCleanupMetadata,
              },
            });

      logger.info("Live-caption runtime stop routed", {
        tabId,
        sessionId: session.sessionId,
        runtimeState: response.runtimeState,
        status: response.status,
      });

      return response;
    } catch (error) {
      return this._buildFailClosedResponse(
        LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
        error,
        {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
        },
      );
    }
  }

  async handleRuntimeStatus(message, sender) {
    try {
      const request = this._normalizeRequest(
        message,
        sender,
        LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
      );
      const tabId = normalizeTabId(request.data.tabId);
      const session = this.sessionManager.getOrCreateSession(tabId, {
        consentAccepted: Boolean(request.data.consentAccepted),
      });
      const offscreenResponse = await this.offscreenBridge.requestRuntimeStatus(
        {
          sessionId: session.sessionId,
          tabId,
          videoFingerprint:
            request.data.videoFingerprint ??
            session.activeVideoFingerprint ??
            null,
          requestId: request.messageId,
          runtimeState: this.captureCoordinator.runtimeState,
          message: "Live-caption runtime shell only",
        },
      );
      const normalizedOffscreenResponse =
        this.captureCoordinator.applyOffscreenResponse(offscreenResponse, {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
          reason: request.data.reason ?? "status",
        });

      if (
        normalizedOffscreenResponse.success === false ||
        normalizedOffscreenResponse.ok === false
      ) {
        return this._buildFailClosedResponse(
          LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
          normalizedOffscreenResponse.error ||
            new Error("Live-caption offscreen status failed"),
          {
            action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
            sessionId: session.sessionId,
            tabId,
            videoFingerprint:
              request.data.videoFingerprint ??
              session.activeVideoFingerprint ??
              null,
            runtimeState: this.captureCoordinator.runtimeState,
            message: normalizedOffscreenResponse.message,
            reason:
              normalizedOffscreenResponse.error?.reason ?? "offscreen_failure",
          },
        );
      }

      const response = this._buildShellResponse({
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
        status: normalizedOffscreenResponse.status,
        runtimeState: this.captureCoordinator.runtimeState,
        session,
        offscreenResponse: normalizedOffscreenResponse,
        captureSnapshot: this.captureCoordinator.getSnapshot(),
        requestId: request.messageId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
        message: normalizedOffscreenResponse.message,
        details: {
          sessionManagerSnapshot:
            this.sessionManager.getSessionCleanupSnapshot(tabId),
        },
      });

      logger.debug("Live-caption runtime status routed", {
        tabId,
        sessionId: session.sessionId,
        runtimeState: response.runtimeState,
        status: response.status,
      });

      return response;
    } catch (error) {
      return this._buildFailClosedResponse(
        LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
        error,
        {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
        },
      );
    }
  }

  async handleRuntimePause(message, sender) {
    try {
      const request = this._normalizeRequest(
        message,
        sender,
        LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
      );
      const tabId = normalizeTabId(request.data.tabId);
      const session = this.sessionManager.getOrCreateSession(tabId, {
        consentAccepted: Boolean(request.data.consentAccepted),
      });

      this.captureCoordinator.pauseRuntime({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
        reason: request.data.reason ?? "pause",
      });
      const offscreenResponse = await this.offscreenBridge.requestRuntimePause({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
        requestId: request.messageId,
        runtimeState: this.captureCoordinator.runtimeState,
        message: "Live-caption runtime shell only",
      });
      const normalizedOffscreenResponse =
        this.captureCoordinator.applyOffscreenResponse(offscreenResponse, {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
          reason: request.data.reason ?? "pause",
        });

      if (
        normalizedOffscreenResponse.success === false ||
        normalizedOffscreenResponse.ok === false
      ) {
        return this._buildFailClosedResponse(
          LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
          normalizedOffscreenResponse.error ||
            new Error("Live-caption offscreen pause failed"),
          {
            action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
            sessionId: session.sessionId,
            tabId,
            videoFingerprint:
              request.data.videoFingerprint ??
              session.activeVideoFingerprint ??
              null,
            runtimeState: this.captureCoordinator.runtimeState,
            message: normalizedOffscreenResponse.message,
            reason:
              normalizedOffscreenResponse.error?.reason ?? "offscreen_failure",
          },
        );
      }

      const response = this._buildShellResponse({
        action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
        status: normalizedOffscreenResponse.status,
        runtimeState: this.captureCoordinator.runtimeState,
        session,
        offscreenResponse: normalizedOffscreenResponse,
        captureSnapshot: this.captureCoordinator.getSnapshot(),
        requestId: request.messageId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
        message: normalizedOffscreenResponse.message,
      });

      logger.info("Live-caption runtime pause routed", {
        tabId,
        sessionId: session.sessionId,
        runtimeState: response.runtimeState,
        status: response.status,
      });

      return response;
    } catch (error) {
      return this._buildFailClosedResponse(
        LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
        error,
        {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
        },
      );
    }
  }

  async handleRuntimeResume(message, sender) {
    try {
      const request = this._normalizeRequest(
        message,
        sender,
        LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
      );
      const tabId = normalizeTabId(request.data.tabId);
      const session = this.sessionManager.getOrCreateSession(tabId, {
        consentAccepted: Boolean(request.data.consentAccepted),
      });

      this.captureCoordinator.resumeRuntime({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
        reason: request.data.reason ?? "resume",
      });
      const offscreenResponse = await this.offscreenBridge.requestRuntimeResume(
        {
          sessionId: session.sessionId,
          tabId,
          videoFingerprint:
            request.data.videoFingerprint ??
            session.activeVideoFingerprint ??
            null,
          requestId: request.messageId,
          runtimeState: this.captureCoordinator.runtimeState,
          message: "Live-caption runtime shell only",
        },
      );
      const normalizedOffscreenResponse =
        this.captureCoordinator.applyOffscreenResponse(offscreenResponse, {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
          reason: request.data.reason ?? "resume",
        });

      if (
        normalizedOffscreenResponse.success === false ||
        normalizedOffscreenResponse.ok === false
      ) {
        return this._buildFailClosedResponse(
          LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
          normalizedOffscreenResponse.error ||
            new Error("Live-caption offscreen resume failed"),
          {
            action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
            sessionId: session.sessionId,
            tabId,
            videoFingerprint:
              request.data.videoFingerprint ??
              session.activeVideoFingerprint ??
              null,
            runtimeState: this.captureCoordinator.runtimeState,
            message: normalizedOffscreenResponse.message,
            reason:
              normalizedOffscreenResponse.error?.reason ?? "offscreen_failure",
          },
        );
      }

      const response = this._buildShellResponse({
        action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
        status: normalizedOffscreenResponse.status,
        runtimeState: this.captureCoordinator.runtimeState,
        session,
        offscreenResponse: normalizedOffscreenResponse,
        captureSnapshot: this.captureCoordinator.getSnapshot(),
        requestId: request.messageId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
        message: normalizedOffscreenResponse.message,
      });

      logger.info("Live-caption runtime resume routed", {
        tabId,
        sessionId: session.sessionId,
        runtimeState: response.runtimeState,
        status: response.status,
      });

      return response;
    } catch (error) {
      return this._buildFailClosedResponse(
        LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
        error,
        {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME,
        },
      );
    }
  }

  async handleFinalizedChunk(message, sender, sendResponse) {
    try {
      const normalized = this.offscreenBridge.normalizeResponse(message, {
        expectedType: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK,
      });

      if (!normalized.ok) {
        throw normalized.error || new Error("Invalid chunk response");
      }

      // Validate metadata fields explicitly
      if (
        !normalized.sessionId ||
        !normalized.tabId ||
        !normalized.videoFingerprint ||
        normalized.chunkStartMs == null ||
        normalized.chunkEndMs == null ||
        !normalized.mimeType
      ) {
        throw new TypeError(
          "Missing required metadata fields in finalized chunk",
        );
      }

      logger.info("Live-caption finalized chunk received in background", {
        sessionId: normalized.sessionId,
        tabId: normalized.tabId,
        videoFingerprint: normalized.videoFingerprint,
        chunkStartMs: normalized.chunkStartMs,
        chunkEndMs: normalized.chunkEndMs,
        mimeType: normalized.mimeType,
        sizeBytes:
          normalized.chunkPayload?.size ?? normalized.chunkPayload?.length ?? 0,
      });

      // Update capture coordinator state with the normalized response
      this.captureCoordinator.recordSnapshot(normalized);

      const response = { success: true, message: "Chunk received" };
      if (sendResponse) {
        sendResponse(response);
      }
      return response;
    } catch (error) {
      logger.error("Failed to handle finalized chunk in background:", error);
      const response = { success: false, error: error.message };
      if (sendResponse) {
        sendResponse(response);
      }
      return response;
    }
  }

  async handleCaptureError(message, sender, sendResponse) {
    try {
      const normalized = this.offscreenBridge.normalizeResponse(message, {
        expectedType: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.CAPTURE_ERROR,
      });

      logger.warn(
        "Live-caption capture error received in background:",
        normalized.error,
      );

      // Record snapshot/error in capture coordinator
      this.captureCoordinator.failClosed(
        normalized.error?.reason || "capture_error",
        normalized.error,
      );

      const response = { success: true };
      if (sendResponse) {
        sendResponse(response);
      }
      return response;
    } catch (error) {
      logger.error("Failed to handle capture error message:", error);
      const response = { success: false, error: error.message };
      if (sendResponse) {
        sendResponse(response);
      }
      return response;
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
      offscreenBridgeSnapshot: this.offscreenBridge.getSnapshot(),
    };
  }
}

export default LiveCaptionBackgroundController;
