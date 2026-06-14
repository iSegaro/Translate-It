import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { LiveCaptionSessionManager } from "../core/LiveCaptionSessionManager.js";
import { VideoCaptionSession } from "../core/VideoCaptionSession.js";
import { LiveCaptionCache } from "../cache/LiveCaptionCache.js";
import {
  LiveCaptionCleanupCoordinator,
  LIVE_CAPTION_CLEANUP_RESULT_STATUSES,
} from "../core/LiveCaptionCleanupCoordinator.js";
import { LiveCaptionCaptureCoordinator } from "./LiveCaptionCaptureCoordinator.js";
import { LiveCaptionOffscreenBridge } from "./LiveCaptionOffscreenBridge.js";
import { LiveCaptionSTTCoordinator } from "./LiveCaptionSTTCoordinator.js";
import { LiveCaptionTranscriptEventCoordinator } from "./LiveCaptionTranscriptEventCoordinator.js";
import { LiveCaptionTranslationCoordinator } from "./LiveCaptionTranslationCoordinator.js";
import {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  normalizeLiveCaptionRuntimeRequest,
  createLiveCaptionRuntimeSuccessResponse,
  createLiveCaptionRuntimeFailClosedResponse,
} from "./liveCaptionRuntimeContracts.js";
import { LIVE_CAPTION_RUNTIME_STATES } from "../constants/liveCaptionRuntimeStates.js";
import { LIVE_CAPTION_SESSION_STATES } from "../constants/liveCaptionSessionStates.js";
import { LIVE_CAPTION_CLEANUP_REASONS } from "../core/contracts.js";
import {
  LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES,
  LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES
} from "./liveCaptionOffscreenContracts.js";
import { LIVE_CAPTION_ACTIONS } from "../constants/liveCaptionActions.js";
import { getLiveCaptionSttProviderAsync, getLiveCaptionQualityProfileAsync } from "@/shared/config/config.js";
import {
  getSTTProviderDefinition,
  resolveProviderExecutionHost
} from "../stt/STTProviderManifest.js";
import {
  STT_PROVIDER_EXECUTION_LOCATIONS,
  STT_PROVIDER_MODES
} from "../stt/liveCaptionSTTProviderContracts.js";

const LOCAL_WHISPER_CHUNK_TIMESLICE_BY_PROFILE = Object.freeze({
  fast: 4000,
  balanced: 6000,
  quality: 10000
});

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

async function resolveRuntimeStartMetadata(metadata = {}, providerId = null) {
  const normalizedMetadata = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  const resolvedProviderId = providerId ?? await getLiveCaptionSttProviderAsync();

  if (resolvedProviderId === 'local_whisper') {
    const qualityProfile = await getLiveCaptionQualityProfileAsync();
    normalizedMetadata.chunkTimeslice = LOCAL_WHISPER_CHUNK_TIMESLICE_BY_PROFILE[
      typeof qualityProfile === 'string' ? qualityProfile.trim().toLowerCase() : ''
    ] ?? LOCAL_WHISPER_CHUNK_TIMESLICE_BY_PROFILE.balanced;
  }

  return normalizedMetadata;
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
    cache = null,
    sttCoordinator = null,
    transcriptEventCoordinator = null,
    translationCoordinator = null,
  } = {}) {
    this.sessionManager = sessionManager;
    this.cache = cache || new LiveCaptionCache();
    this.cleanupCoordinator = cleanupCoordinator;
    this.captureCoordinator = captureCoordinator;
    this.offscreenBridge = offscreenBridge;
    this.transcriptEventCoordinator =
      transcriptEventCoordinator || new LiveCaptionTranscriptEventCoordinator();
    this.translationCoordinator =
      translationCoordinator ||
      new LiveCaptionTranslationCoordinator({
        sessionManager,
        captureCoordinator,
        cache: this.cache,
        browserApi: offscreenBridge.browserApi,
        onError: (error, context) => this.handleCoordinatorError(error, context)
      });
    this.sttCoordinator =
      sttCoordinator ||
      new LiveCaptionSTTCoordinator({
        sessionManager,
        captureCoordinator,
        cache: this.cache,
        transcriptEventCoordinator: this.transcriptEventCoordinator,
        onTranscriptSegment: (segment, context) => this._routeTranscriptSegmentToTranslation(segment, context),
        onError: (error, context) => this.handleCoordinatorError(error, context)
      });
    this.messageHandler = null;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.lastAction = null;
    this.lastRequest = null;
    this.lastResponse = null;
    this.activeStreamingSession = null;

    this._startHealthMonitor();

    logger.debug("Live-caption background controller created", {
      createdAt: this.createdAt,
    });
  }

  touch() {
    this.updatedAt = Date.now();
  }

  async _resolveRuntimeStartMetadata(metadata = {}, providerId = null) {
    return resolveRuntimeStartMetadata(metadata, providerId);
  }

  _setActiveStreamingSession(context = null) {
    this.activeStreamingSession = context ? { ...context } : null;
    return this.activeStreamingSession;
  }

  _clearActiveStreamingSession() {
    this.activeStreamingSession = null;
    return this.activeStreamingSession;
  }

  _stopCaptureCoordinatorOnFailClose({
    sessionId = null,
    tabId = null,
    videoFingerprint = null,
    reason = LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR,
  } = {}) {
    try {
      this.captureCoordinator.stopRuntime({
        sessionId,
        tabId,
        videoFingerprint,
        reason,
      });
      this.captureCoordinator.setRuntimeState(LIVE_CAPTION_RUNTIME_STATES.IDLE, {
        action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
        reason,
        failClosed: true,
      });
    } catch (error) {
      logger.warn('Failed to unwind capture coordinator on fail-close', {
        sessionId,
        tabId,
        videoFingerprint,
        reason,
        error: error?.message ?? String(error)
      });
    }
  }

  async _resolveSelectedStreamingProvider() {
    const providerId = await getLiveCaptionSttProviderAsync();
    const definition = getSTTProviderDefinition(providerId);
    const executionLocation = definition?.executionLocation ?? resolveProviderExecutionHost(providerId);
    const mode = definition?.mode ?? null;

    return {
      providerId,
      definition,
      mode,
      executionLocation,
      isStreamingOffscreen:
        mode === STT_PROVIDER_MODES.STREAMING &&
        executionLocation === STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN,
    };
  }

  async _startActiveStreamingSession({
    session,
    request,
    providerRuntime
  }) {
    if (!providerRuntime?.isStreamingOffscreen) {
      this._clearActiveStreamingSession();
      return null;
    }

    const streamingStartResponse = await this.offscreenBridge.startStreamingSttSession({
      sessionId: session.sessionId,
      tabId: session.tabId,
      videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
      providerId: providerRuntime.providerId,
      providerMode: providerRuntime.mode,
      executionLocation: providerRuntime.executionLocation,
      sourceLanguage: request.data.sourceLanguage ?? null,
      targetLanguage: request.data.targetLanguage ?? null,
      providerOptions: request.data.providerOptions ?? {},
      metadata: request.data.metadata ?? {},
      requestId: request.messageId,
      runtimeState: this.captureCoordinator.runtimeState,
      message: 'Live-caption streaming provider start'
    });

    if (
      streamingStartResponse?.success === false ||
      streamingStartResponse?.ok === false
    ) {
      const startError = streamingStartResponse?.error || new Error('Live-caption streaming provider start failed');
      this._clearActiveStreamingSession();
      throw startError;
    }

    this._setActiveStreamingSession({
      sessionId: session.sessionId,
      tabId: session.tabId,
      videoFingerprint: request.data.videoFingerprint ?? session.activeVideoFingerprint ?? null,
      providerId: providerRuntime.providerId,
      providerMode: providerRuntime.mode,
      executionLocation: providerRuntime.executionLocation,
      requestId: request.messageId,
      startedAt: Date.now(),
      state: 'active'
    });

    return streamingStartResponse;
  }

  async _stopActiveStreamingSession({
    reason = LIVE_CAPTION_CLEANUP_REASONS.STOP,
    requestId = null,
    sessionId = null,
    tabId = null,
    videoFingerprint = null,
  } = {}) {
    const activeStreamingSession = this.activeStreamingSession;
    if (!activeStreamingSession) {
      return null;
    }

    this._clearActiveStreamingSession();

    try {
      return await this.offscreenBridge.stopStreamingSttSession({
        sessionId: sessionId ?? activeStreamingSession.sessionId,
        tabId: tabId ?? activeStreamingSession.tabId,
        videoFingerprint: videoFingerprint ?? activeStreamingSession.videoFingerprint,
        providerId: activeStreamingSession.providerId,
        requestId: requestId ?? activeStreamingSession.requestId ?? null,
        reason
      });
    } catch (error) {
      logger.warn('Failed to stop active streaming provider session', {
        sessionId: sessionId ?? activeStreamingSession.sessionId,
        tabId: tabId ?? activeStreamingSession.tabId,
        videoFingerprint: videoFingerprint ?? activeStreamingSession.videoFingerprint,
        providerId: activeStreamingSession.providerId,
        error: error?.message ?? String(error)
      });
      return null;
    }
  }

  _startHealthMonitor() {
    if (this._healthInterval) return;
    this._healthInterval = setInterval(() => this._performHealthCheck(), 15000);
  }

  destroy() {
    if (this._healthInterval) {
      clearInterval(this._healthInterval);
      this._healthInterval = null;
    }

    void this._stopActiveStreamingSession({
      reason: LIVE_CAPTION_CLEANUP_REASONS.MANUAL,
    });
    this._stopCaptureCoordinatorOnFailClose({
      reason: LIVE_CAPTION_CLEANUP_REASONS.MANUAL,
    });
    this._clearActiveStreamingSession();
    this.transcriptEventCoordinator?.destroy?.();
  }

  async _performHealthCheck() {
    const activeSessions = Array.from(this.sessionManager.sessions.values());
    if (activeSessions.length === 0) return;

    for (const session of activeSessions) {
      if (session.lifecycleState !== LIVE_CAPTION_SESSION_STATES.ACTIVE) continue;

      let timeoutId;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Health check timeout")), 5000);
        });

        const offscreenResponse = await Promise.race([
          this.offscreenBridge.requestRuntimeStatus({
            sessionId: session.sessionId,
            tabId: session.tabId,
            videoFingerprint: session.activeVideoFingerprint,
            message: "Health check"
          }),
          timeoutPromise
        ]);

        if (!offscreenResponse || offscreenResponse.ok === false || offscreenResponse.status === LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OFFSCREEN_NOT_READY) {
          throw new Error("Offscreen health check failed");
        }
      } catch (error) {
        logger.error("Live-caption health check failed, failing closed", { 
          tabId: session.tabId, 
          sessionId: session.sessionId, 
          error: error.message 
        });

        void this._stopActiveStreamingSession({
          reason: LIVE_CAPTION_CLEANUP_REASONS.RECOVERY_FAILURE,
          sessionId: session.sessionId,
          tabId: session.tabId,
          videoFingerprint: session.activeVideoFingerprint
        });
        this._stopCaptureCoordinatorOnFailClose({
          reason: LIVE_CAPTION_CLEANUP_REASONS.RECOVERY_FAILURE,
          sessionId: session.sessionId,
          tabId: session.tabId,
          videoFingerprint: session.activeVideoFingerprint
        });

        this.offscreenBridge.requestRuntimeStop({
          sessionId: session.sessionId, 
          tabId: session.tabId, 
          videoFingerprint: session.activeVideoFingerprint, 
          reason: "health_check_failure"
        }).catch(() => {});

        this.transcriptEventCoordinator?.clearSession?.(session.sessionId);
        this.sessionManager.failClosedCleanup(session.tabId, LIVE_CAPTION_CLEANUP_REASONS.RECOVERY_FAILURE);

        if (this.offscreenBridge.browserApi?.tabs?.sendMessage) {
          this.offscreenBridge.browserApi.tabs.sendMessage(session.tabId, {
            action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
            payload: {
              sessionId: session.sessionId,
              videoFingerprint: session.activeVideoFingerprint,
              reason: "health_check_failure"
            }
          }).catch(() => {});
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }
  }

  handleCoordinatorError(error, { sessionId, tabId, videoFingerprint }) {
    // 1. Guard against mismatching session (if session still exists)
    const currentSession = this.sessionManager.getSession(tabId);
    if (currentSession && sessionId && currentSession.sessionId !== sessionId) {
      logger.debug("Ignoring coordinator error for mismatching session", { 
        tabId, 
        sessionId,
        currentSessionId: currentSession.sessionId 
      });
      return;
    }

    logger.error("Live-caption coordinator error, failing closed", {
      tabId,
      sessionId,
      errorCode: error?.code,
      errorType: error?.type,
      message: error?.message
    });

    if (sessionId) {
      if (tabId != null && videoFingerprint) {
        this.transcriptEventCoordinator?.clearVideoSession?.({
          sessionId,
          tabId,
          videoFingerprint
        });
      } else {
        this.transcriptEventCoordinator?.clearSession?.(sessionId);
      }
    }

    // 2. Notify content script IMMEDIATELY before we destroy the session state
    if (this.offscreenBridge.browserApi?.tabs?.sendMessage) {
      const targetTabId = Number(tabId);
      logger.debug("Sending error notification to content tab", { targetTabId, sessionId });
      
      this.offscreenBridge.browserApi.tabs.sendMessage(targetTabId, {
        action: LIVE_CAPTION_ACTIONS.RUNTIME_STOP, // Use standard action constant
        payload: {
          sessionId,
          videoFingerprint,
          reason: LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR,
          error: {
            code: error?.code || "unknown_error",
            message: error?.message || "Live Caption transcription failed",
            type: error?.type || "unknown",
            providerId: error?.providerId || null
          }
        }
      }).then(() => {
        logger.debug("Error notification delivered to content tab", { targetTabId });
      }).catch((err) => {
        logger.warn("Failed to send error notification to content tab", {
          tabId: targetTabId,
          error: err.message
        });
      });
    }

    // 3. Perform internal cleanup
    void this._stopActiveStreamingSession({
      reason: LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR,
      sessionId,
      tabId,
      videoFingerprint
    });
    this._stopCaptureCoordinatorOnFailClose({
      sessionId,
      tabId,
      videoFingerprint,
      reason: LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR,
    });
    this.sessionManager.failClosedCleanup(tabId, LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR, error);

    // 4. Stop offscreen capture
    this.offscreenBridge.requestRuntimeStop({
      sessionId,
      tabId,
      videoFingerprint,
      reason: "coordinator_error"
    }).catch(() => {});
  }

  _routeTranscriptSegmentToTranslation(segment, context = {}) {
    return Promise.resolve().then(() => this.translationCoordinator.handleTranscriptSegment(segment, context));
  }

  _recordTranscriptSegmentForTranslation(segment, pageSession) {
    if (!segment || typeof segment !== 'object' || !pageSession) {
      return null;
    }

    const activeVideoSession = pageSession.activeVideoSession;
    if (!activeVideoSession || activeVideoSession.videoFingerprint !== segment.videoFingerprint) {
      return null;
    }

    const isCanonicalTranscriptSegment =
      segment.sessionId != null
      && segment.tabId != null
      && segment.videoFingerprint != null
      && segment.segmentId != null
      && segment.revision != null;

    if (isCanonicalTranscriptSegment && typeof activeVideoSession.upsertTranscriptSegment === 'function') {
      activeVideoSession.upsertTranscriptSegment(segment);
    } else {
      activeVideoSession.addTranscriptSegment(segment);
    }

    if (this.cache) {
      const cacheSegment = {
        ...segment,
        segmentStartMs: segment.startMs,
        segmentEndMs: segment.endMs,
        originalText: segment.text,
        isIncognito: pageSession.isIncognito
      };

      const persistTranscriptSegment = isCanonicalTranscriptSegment && this.cache.upsertTranscriptSegmentByIdentity
        ? this.cache.upsertTranscriptSegmentByIdentity(cacheSegment)
        : this.cache.appendTranscriptSegment(cacheSegment);

      persistTranscriptSegment.catch((err) => {
        logger.warn('Failed to persist transcript segment to cache', {
          sessionId: segment.sessionId,
          error: err.message
        });
      });
    }

    return segment;
  }

  _createTranscriptSegmentFromCanonicalEvent(event, fallbackContext = {}) {
    if (!event || typeof event !== 'object') {
      return null;
    }

    return {
      segmentId: event.segmentId ?? fallbackContext.segmentId ?? null,
      sessionId: event.sessionId ?? fallbackContext.sessionId ?? null,
      tabId: event.tabId ?? fallbackContext.tabId ?? null,
      videoFingerprint: event.videoFingerprint ?? fallbackContext.videoFingerprint ?? null,
      startMs: event.segmentStartMs ?? fallbackContext.startMs ?? null,
      endMs: event.segmentEndMs ?? fallbackContext.endMs ?? null,
      text: event.text ?? '',
      providerId: event.providerId ?? null,
      sourceLanguage: event.sourceLanguage ?? null,
      targetLanguage: event.targetLanguage ?? null,
      confidence: event.confidence ?? null,
      revision: event.revision ?? null,
      createdAt: event.createdAt ?? Date.now(),
      isFinal: event.isFinal ?? true
    };
  }

  async _reconcileOrphanedSession(chunk) {
    const { tabId, sessionId, videoFingerprint } = chunk;
    logger.info("Attempting to reconcile orphaned live-caption session", { tabId, sessionId, videoFingerprint });

    try {
      if (this.offscreenBridge.browserApi?.tabs?.get) {
        try {
          const tab = await this.offscreenBridge.browserApi.tabs.get(tabId);
          if (!tab) throw new Error("Target tab is missing or closed");
        } catch (err) {
          throw new Error("Target tab verification failed");
        }
      }

      const offscreenResponse = await this.offscreenBridge.requestRuntimeStatus({
        sessionId,
        tabId,
        videoFingerprint,
        message: "Reconciliation check"
      });

      if (!offscreenResponse || offscreenResponse.ok === false) {
        throw new Error("Offscreen document unavailable or reported error");
      }

      const snapshot = offscreenResponse.sessionSnapshot;
      if (!snapshot || snapshot.sessionId !== sessionId || snapshot.tabId !== tabId) {
        throw new Error("Offscreen session mismatch or inactive");
      }

      if (snapshot.activeVideoFingerprint && snapshot.activeVideoFingerprint !== videoFingerprint) {
        throw new Error("Offscreen video fingerprint mismatch");
      }

      let isIncognito = false;
      if (this.offscreenBridge.browserApi?.tabs?.get) {
         try {
           const tab = await this.offscreenBridge.browserApi.tabs.get(tabId);
           isIncognito = Boolean(tab.incognito);
         } catch(e) {}
      }

      const recoveredSession = this.sessionManager.getOrCreateSession(tabId, {
        isIncognito
      });
      recoveredSession.sessionId = sessionId;

      const videoSession = new VideoCaptionSession({ tabId, videoFingerprint });
      recoveredSession.attachVideoSession(videoSession);

      if (this.cache) {
        try {
          const [transcripts, translations] = await Promise.all([
            this.cache.getTranscriptSegments({ tabId, videoFingerprint, isIncognito }),
            this.cache.getTranslatedCaptionSegments({ tabId, videoFingerprint, isIncognito })
          ]);
            transcripts.forEach(s => videoSession.addTranscriptSegment(s));
            translations.forEach(s => videoSession.addTranslatedCaptionSegment(s));
            videoSession.rebuildCanonicalIndexes();
            logger.info("Reconciled session hydrated from cache", { tabId, transcriptCount: transcripts.length });
          } catch (err) {
            logger.warn("Cache hydration failed during reconciliation", { error: err.message });
        }
      }

      recoveredSession.start();
      this.captureCoordinator.setRuntimeState(LIVE_CAPTION_RUNTIME_STATES.RUNNING);

      logger.info("Successfully reconciled orphaned live-caption session", { tabId, sessionId });
      return recoveredSession;

    } catch (error) {
      logger.error("Failed to reconcile orphaned live-caption session, failing closed", { tabId, sessionId, error: error.message });

      this.transcriptEventCoordinator?.clearSession?.(sessionId);
      this.sessionManager.failClosedCleanup(tabId, LIVE_CAPTION_CLEANUP_REASONS.RECOVERY_FAILURE);
      this.offscreenBridge.requestRuntimeStop({
        sessionId, tabId, videoFingerprint, reason: "recovery_failure"
      }).catch(() => {});

      if (this.offscreenBridge.browserApi?.tabs?.sendMessage) {
        this.offscreenBridge.browserApi.tabs.sendMessage(tabId, {
          action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP,
          payload: {
             sessionId,
             videoFingerprint,
             reason: "recovery_failure"
          }
        }).catch(() => {});
      }

      throw error;
    }
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
      LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED,
      this.handleVideoChanged.bind(this),
    );
    messageHandler.registerHandler(
      LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK,
      this.handleFinalizedChunk.bind(this),
    );
    messageHandler.registerHandler(
      LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.CAPTURE_ERROR,
      this.handleCaptureError.bind(this),
    );
    messageHandler.registerHandler(
      LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
      this.handleStreamingTranscriptEvent.bind(this),
    );
    messageHandler.registerHandler(
      LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS,
      this.handleStreamingStatus.bind(this),
    );
    messageHandler.registerHandler(
      LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR,
      this.handleStreamingError.bind(this),
    );
    messageHandler.registerHandler(
      LIVE_CAPTION_ACTIONS.GET_TAB_ID,
      async (message, sender) => {
        const tabId = sender?.tab?.id ?? null;
        logger.debug("Resolved sender tabId:", tabId);
        return { success: true, tabId };
      }
    );
    messageHandler.registerHandler(
      'LIVE_CAPTION_OPEN_POPUP',
      async () => {
        const browserApi = this.offscreenBridge.browserApi;
        if (browserApi?.action?.openPopup) {
          try {
            await browserApi.action.openPopup();
            return { success: true };
          } catch (err) {
            logger.warn("chrome.action.openPopup failed:", err);
            return { success: false, error: err.message };
          }
        }
        return { success: false, error: "openPopup_unsupported" };
      }
    );

    logger.info("Live-caption runtime handlers registered", {
      actions: [
        ...Object.values(LIVE_CAPTION_RUNTIME_ACTIONS),
        LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK,
        LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.CAPTURE_ERROR,
        LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT,
        LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS,
        LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR,
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
        const errMsg = captureError?.message || String(captureError);
        const isActiveTabError = errMsg.includes("activeTab") || errMsg.includes("Extension has not been invoked");
        return this._buildFailClosedResponse(
          LIVE_CAPTION_RUNTIME_ACTIONS.START,
          captureError,
          {
            tabId,
            sessionId: data.sessionId ?? null,
            videoFingerprint: data.videoFingerprint ?? null,
            code: isActiveTabError ? "active_tab_permission_required" : "tab_capture_failed",
            reason: isActiveTabError ? "active_tab_permission_required" : "tab_capture_failure",
            message: isActiveTabError 
              ? "To start Live Caption, please click the extension icon in the toolbar and start it from there to grant tab access." 
              : errMsg
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
      const providerRuntime = await this._resolveSelectedStreamingProvider();
      const streamingMetadata = await this._resolveRuntimeStartMetadata(
        request.data.metadata,
        providerRuntime.providerId
      );

      // 3. Ensure the offscreen document is open before messaging it
      await this.offscreenBridge.ensureOffscreenDocument();

      const session = this.sessionManager.getOrCreateSession(tabId, {
        sessionId: request.data.sessionId,
        isIncognito: Boolean(sender?.tab?.incognito)
      });

      // Hydrate video session if fingerprint is provided
      const videoFingerprint = request.data.videoFingerprint ?? session.activeVideoFingerprint;
      if (videoFingerprint) {
        if (!session.activeVideoSession || session.activeVideoSession.videoFingerprint !== videoFingerprint) {
          const videoSession = new VideoCaptionSession({ tabId, videoFingerprint });
          session.attachVideoSession(videoSession);
        }

        const activeVideoSession = session.activeVideoSession;
        if (
          activeVideoSession &&
          activeVideoSession.transcriptSegments.length === 0 &&
          activeVideoSession.translatedCaptionSegments.length === 0
        ) {
          try {
            const [transcripts, translations] = await Promise.all([
              this.cache.getTranscriptSegments({ tabId, videoFingerprint, isIncognito: session.isIncognito }),
              this.cache.getTranslatedCaptionSegments({ tabId, videoFingerprint, isIncognito: session.isIncognito })
            ]);

            transcripts.forEach(s => activeVideoSession.addTranscriptSegment(s));
            translations.forEach(s => activeVideoSession.addTranslatedCaptionSegment(s));
            activeVideoSession.rebuildCanonicalIndexes();

            logger.info('Live-caption session hydrated from cache', {
              tabId,
              videoFingerprint,
              transcriptCount: transcripts.length,
              translationCount: translations.length
            });
          } catch (cacheError) {
            logger.warn('Failed to hydrate live-caption session from cache', {
              tabId,
              videoFingerprint,
              error: cacheError.message
            });
          }
        }
      }

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
        metadata: streamingMetadata,
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

      let streamingStartResponse = null;
      if (providerRuntime.isStreamingOffscreen) {
        try {
          streamingStartResponse = await this._startActiveStreamingSession({
            session,
            request,
            providerRuntime
          });
        } catch (streamingStartError) {
          this.handleCoordinatorError(streamingStartError, {
            sessionId: session.sessionId,
            tabId,
            videoFingerprint:
              request.data.videoFingerprint ??
              session.activeVideoFingerprint ??
              null,
          });

          return this._buildFailClosedResponse(
            LIVE_CAPTION_RUNTIME_ACTIONS.START,
            streamingStartError,
            {
              action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
              sessionId: session.sessionId,
              tabId,
              videoFingerprint:
                request.data.videoFingerprint ??
                session.activeVideoFingerprint ??
                null,
              runtimeState: this.captureCoordinator.runtimeState,
              message: streamingStartResponse?.message,
              reason:
                streamingStartError?.reason ??
                "streaming_provider_start_failed",
              code:
                streamingStartError?.code ??
                "streaming_provider_start_failed",
            }
          );
        }
      } else {
        this._clearActiveStreamingSession();
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
      const session = this.sessionManager.getOrCreateSession(tabId);
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

      await this._stopActiveStreamingSession({
        reason: request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP,
        requestId: request.messageId,
        sessionId: session.sessionId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
      });

      // Stop/abort STT and translation sessions
      await this.sttCoordinator.stopSession(session.sessionId);
      this.translationCoordinator.stopSession(session.sessionId);
      this.transcriptEventCoordinator?.clearSession?.(session.sessionId);

      this.sessionManager.cleanupByTabId(
        tabId,
        request.data.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP,
      );

      // Clear persistent cache if requested
      if (request.data.clearCache && this.cache) {
        const videoFingerprint = request.data.videoFingerprint ?? sessionSnapshot?.activeVideoFingerprint;
        if (videoFingerprint) {
          this.cache.clearVideo({ tabId, videoFingerprint }).catch((err) => {
            logger.warn('Failed to clear live-caption cache on stop', {
              tabId,
              videoFingerprint,
              error: err.message
            });
          });
        }
      }

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
      void this._stopActiveStreamingSession({
        reason: LIVE_CAPTION_CLEANUP_REASONS.STOP,
        sessionId: message?.data?.sessionId ?? null,
        tabId: message?.data?.tabId ?? null,
        videoFingerprint: message?.data?.videoFingerprint ?? null,
      });
      this._stopCaptureCoordinatorOnFailClose({
        sessionId: message?.data?.sessionId ?? null,
        tabId: message?.data?.tabId ?? null,
        videoFingerprint: message?.data?.videoFingerprint ?? null,
        reason: message?.data?.reason ?? LIVE_CAPTION_CLEANUP_REASONS.STOP,
      });
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
      const session = this.sessionManager.getOrCreateSession(tabId);
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
      const session = this.sessionManager.getOrCreateSession(tabId);

      this.captureCoordinator.pauseRuntime({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint:
          request.data.videoFingerprint ??
          session.activeVideoFingerprint ??
          null,
        reason: request.data.reason ?? "pause",
      });

      // Pause/abort STT and translation sessions
      await this.sttCoordinator.pauseSession(session.sessionId);
      this.translationCoordinator.pauseSession(session.sessionId);
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
      const session = this.sessionManager.getOrCreateSession(tabId);

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

  async handleVideoChanged(message, sender) {
    const data = message?.data || {};
    const senderTabId = sender?.tab?.id ?? null;
    const tabId = data.tabId ?? senderTabId ?? null;

    if (tabId == null) {
      return this._buildFailClosedResponse(
        LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED,
        new TypeError("Live-caption video changed requires tabId"),
        {
          sessionId: data.sessionId ?? null,
          tabId: null,
          videoFingerprint: data.videoFingerprint ?? null,
          code: "missing_tab_id",
          reason: "invalid_payload",
        },
      );
    }

    try {
      const request = this._normalizeRequest(
        message,
        sender,
        LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED,
      );

      const session = this.sessionManager.getSession(tabId);
      if (!session) {
        return this._buildFailClosedResponse(
          LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED,
          new Error("No active page session found for tab to retarget video"),
          {
            sessionId: data.sessionId ?? null,
            tabId,
            videoFingerprint: data.videoFingerprint ?? null,
            code: "no_active_session",
            reason: "no_active_session",
          }
        );
      }

      const videoFingerprint = request.data.videoFingerprint;
      const offscreenResponse = await this.offscreenBridge.requestVideoChanged({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint,
        requestId: request.messageId,
        message: "Live-caption active video changed"
      });

      if (!offscreenResponse || offscreenResponse.ok !== true) {
        return this._buildFailClosedResponse(
          LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED,
          offscreenResponse?.error || new Error("Live-caption offscreen video retarget failed"),
          {
            sessionId: session.sessionId,
            tabId,
            videoFingerprint,
            code: "offscreen_retarget_failed",
            reason: "offscreen_retarget_failed",
            runtimeState: this.captureCoordinator.runtimeState,
            status: offscreenResponse?.status ?? LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED,
            message: offscreenResponse?.message ?? "Live-caption offscreen video retarget failed"
          }
        );
      }

      if (videoFingerprint) {
        if (!session.activeVideoSession || session.activeVideoSession.videoFingerprint !== videoFingerprint) {
          logger.info("Retargeting active video session in background", {
            tabId,
            sessionId: session.sessionId,
            oldFingerprint: session.activeVideoFingerprint,
            newFingerprint: videoFingerprint
          });
          if (session.activeVideoFingerprint) {
            this.transcriptEventCoordinator?.clearVideoSession?.({
              sessionId: session.sessionId,
              tabId,
              videoFingerprint: session.activeVideoFingerprint
            });
          }
          const videoSession = new VideoCaptionSession({ tabId, videoFingerprint });
          session.replaceVideoSession(videoSession, LIVE_CAPTION_CLEANUP_REASONS.VIDEO_CHANGED);
          session.start();

          // Hydrate from cache
          try {
            const [transcripts, translations] = await Promise.all([
              this.cache.getTranscriptSegments({ tabId, videoFingerprint, isIncognito: session.isIncognito }),
              this.cache.getTranslatedCaptionSegments({ tabId, videoFingerprint, isIncognito: session.isIncognito })
            ]);

            transcripts.forEach(s => videoSession.addTranscriptSegment(s));
            translations.forEach(s => videoSession.addTranslatedCaptionSegment(s));
            videoSession.rebuildCanonicalIndexes();

            logger.info('Live-caption handoff session hydrated from cache', {
              tabId,
              videoFingerprint,
              transcriptCount: transcripts.length,
              translationCount: translations.length
            });
          } catch (cacheError) {
            logger.warn('Failed to hydrate handoff session from cache', {
              tabId,
              videoFingerprint,
              error: cacheError.message
            });
          }
        }
      }

      this.captureCoordinator.setSessionContext({
        sessionId: session.sessionId,
        tabId,
        videoFingerprint
      });

      const sessionSnapshot = session.getSnapshot();
      const successResponse = createLiveCaptionRuntimeSuccessResponse({
        action: LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED,
        sessionId: session.sessionId,
        tabId,
        videoFingerprint,
        runtimeState: this.captureCoordinator.runtimeState,
        sessionSnapshot
      });

      this.lastResponse = successResponse;
      this.touch();
      return successResponse;
    } catch (error) {
      logger.error('handleVideoChanged caught error', {
        error: error.message,
        stack: error.stack,
        code: error.code
      });
      return this._buildFailClosedResponse(
        LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED,
        error,
        {
          sessionId: data.sessionId ?? null,
          tabId,
          videoFingerprint: data.videoFingerprint ?? null,
          code: "handoff_failed",
          reason: "handoff_failure"
        }
      );
    }
  }

  async handleFinalizedChunk(message, sender, sendResponse) {
    try {
      const normalized = this.offscreenBridge.normalizeResponse(message, {
        expectedType: LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK,
      });

      if (!normalized.ok) {
        // Check if this is likely a late chunk after intentional stop
        const { tabId, sessionId } = normalized;
        if (tabId != null && sessionId) {
          const cleanupMetadata = this.sessionManager.cleanupMetadataByTab.get(tabId);
          if (cleanupMetadata && cleanupMetadata.sessionId === sessionId) {
            logger.debug("Ignoring late finalized chunk for recently cleaned up session", { tabId, sessionId });
            const response = { success: true, message: "Ignored late chunk" };
            if (sendResponse) sendResponse(response);
            return response;
          }
        }
        throw normalized.error || new Error("Invalid chunk response");
      }

      // Validate metadata fields explicitly
      const { tabId, sessionId, videoFingerprint } = normalized;
      if (
        !sessionId ||
        !tabId ||
        !videoFingerprint ||
        normalized.chunkStartMs == null ||
        normalized.chunkEndMs == null ||
        !normalized.mimeType
      ) {
        throw new TypeError(
          "Missing required metadata fields in finalized chunk",
        );
      }

      let session = this.sessionManager.getSession(tabId);
      if (!session || session.sessionId !== sessionId) {
        // Check cleanup metadata before attempting reconciliation
        const cleanupMetadata = this.sessionManager.cleanupMetadataByTab.get(tabId);
        if (cleanupMetadata && cleanupMetadata.sessionId === sessionId) {
          logger.debug("Ignoring late finalized chunk (session mismatch) for recently cleaned up session", { tabId, sessionId });
          const response = { success: true, message: "Ignored late chunk" };
          if (sendResponse) sendResponse(response);
          return response;
        }

        session = await this._reconcileOrphanedSession(normalized);
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

      // Dispatch to STT coordinator
      await this.sttCoordinator.handleFinalizedChunk(normalized);

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

  _isActiveStreamingSession(message) {
    if (!message || typeof message !== "object") {
      return false;
    }

    const tabId = Number(message.tabId);
    if (!Number.isFinite(tabId)) {
      return false;
    }

    const session = this.sessionManager.getSession(tabId);
    if (!session || session.sessionId !== message.sessionId) {
      return false;
    }

    const activeVideoSession = session.activeVideoSession;
    if (!activeVideoSession || activeVideoSession.videoFingerprint !== message.videoFingerprint) {
      return false;
    }

    return true;
  }

  _buildStreamingAckResponse(message, acknowledgement = "streaming_event_received") {
    return {
      success: true,
      message: acknowledgement,
      sessionId: message?.sessionId ?? null,
      tabId: message?.tabId ?? null,
      videoFingerprint: message?.videoFingerprint ?? null,
    };
  }

  async handleStreamingTranscriptEvent(message, sender, sendResponse) {
    try {
      if (!this._isActiveStreamingSession(message)) {
        const response = this._buildStreamingAckResponse(message, "streaming_stale_session");
        if (sendResponse) {
          sendResponse(response);
        }
        return response;
      }

      const pageSession = this.sessionManager.getSession(Number(message.tabId));
      const transcriptResult = await Promise.resolve(
        this.transcriptEventCoordinator.handleStreamingTranscriptEvent(message.event)
      );

      if ((transcriptResult?.status === "canonical_final" || transcriptResult?.status === "canonical_correction")
        && transcriptResult.canonicalEvent) {
        const transcriptSegment = this._createTranscriptSegmentFromCanonicalEvent(
          transcriptResult.canonicalEvent,
          {
            segmentId: transcriptResult.canonicalEvent.segmentId ?? message.event?.segmentId ?? null,
            sessionId: message.sessionId,
            tabId: message.tabId,
            videoFingerprint: message.videoFingerprint
          }
        );

        if (transcriptSegment) {
          const accumulatedSegment = this._recordTranscriptSegmentForTranslation(transcriptSegment, pageSession);
          if (!accumulatedSegment) {
            logger.warn("Skipping streaming transcript translation because active video session is unavailable", {
              sessionId: message.sessionId,
              tabId: message.tabId,
              videoFingerprint: message.videoFingerprint
            });
            const response = this._buildStreamingAckResponse(message, "streaming_transcript_event_received");
            if (sendResponse) {
              sendResponse(response);
            }
            return response;
          }

          this._routeTranscriptSegmentToTranslation(accumulatedSegment, { tabId: message.tabId }).catch((error) => {
            logger.error("Error routing canonical streaming transcript segment to translation", {
              sessionId: message.sessionId,
              tabId: message.tabId,
              videoFingerprint: message.videoFingerprint,
              error: error.message
            });
          });
        }
      }

      logger.info("Live-caption streaming transcript event routed in background", {
        sessionId: message.sessionId,
        tabId: message.tabId,
        videoFingerprint: message.videoFingerprint,
        eventType:
          transcriptResult?.canonicalEvent?.eventType ??
          transcriptResult?.normalizedEvent?.eventType ??
          message.event?.eventType ??
          null,
        status: transcriptResult?.status ?? null,
      });

      const response = this._buildStreamingAckResponse(message, "streaming_transcript_event_received");
      if (sendResponse) {
        sendResponse(response);
      }
      return response;
    } catch (error) {
      logger.error("Failed to handle streaming transcript event in background:", error);
      const response = { success: false, error: error.message };
      if (sendResponse) {
        sendResponse(response);
      }
      return response;
    }
  }

  async handleStreamingStatus(message, sender, sendResponse) {
    try {
      if (!this._isActiveStreamingSession(message)) {
        const response = this._buildStreamingAckResponse(message, "streaming_stale_session");
        if (sendResponse) {
          sendResponse(response);
        }
        return response;
      }

      logger.debug("Live-caption streaming status routed in background", {
        sessionId: message.sessionId,
        tabId: message.tabId,
        videoFingerprint: message.videoFingerprint,
        status: message.status ?? null,
        providerId: message.providerId ?? null,
      });

      const response = this._buildStreamingAckResponse(message, "streaming_status_received");
      if (sendResponse) {
        sendResponse(response);
      }
      return response;
    } catch (error) {
      logger.error("Failed to handle streaming status in background:", error);
      const response = { success: false, error: error.message };
      if (sendResponse) {
        sendResponse(response);
      }
      return response;
    }
  }

  async handleStreamingError(message, sender, sendResponse) {
    try {
      if (!this._isActiveStreamingSession(message)) {
        const response = this._buildStreamingAckResponse(message, "streaming_stale_session");
        if (sendResponse) {
          sendResponse(response);
        }
        return response;
      }

      logger.warn("Live-caption streaming error routed through fail-close path", {
        sessionId: message.sessionId,
        tabId: message.tabId,
        videoFingerprint: message.videoFingerprint,
        providerId: message.providerId ?? null,
        errorCode: message.error?.code ?? null,
        errorMessage: message.error?.message ?? null,
      });

      this.handleCoordinatorError(message.error || new Error(message.error?.message || "Streaming provider error"), {
        sessionId: message.sessionId,
        tabId: message.tabId,
        videoFingerprint: message.videoFingerprint,
      });

      const response = this._buildStreamingAckResponse(message, "streaming_error_handled");
      if (sendResponse) {
        sendResponse(response);
      }
      return response;
    } catch (error) {
      logger.error("Failed to handle streaming error in background:", error);
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
      translationCoordinatorSnapshot: {
        activeAbortControllers: Array.from(this.translationCoordinator.activeAbortControllers.keys()),
        sessionQueues: Array.from(this.translationCoordinator.sessionQueues.entries()).map(([k, v]) => ({
          sessionId: k,
          queueDepth: v.segments.length,
          processing: v.processing
        }))
      }
    };
  }
}

export default LiveCaptionBackgroundController;
