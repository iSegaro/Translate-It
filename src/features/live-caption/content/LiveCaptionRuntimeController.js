import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LIVE_CAPTION_RUNTIME_STATES } from '../constants/liveCaptionRuntimeStates.js';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import {
  LIVE_CAPTION_CLEANUP_REASONS,
  createLiveCaptionErrorState
} from '../core/contracts.js';
import {
  LIVE_CAPTION_CONSENT_STATES,
  createLiveCaptionPlatformSupportResult,
  evaluateLiveCaptionStartEligibility
} from '../core/LiveCaptionConsentPolicy.js';
import {
  rankActiveVideoCandidates
} from '../core/ActiveVideoDetector.js';
import { createVideoFingerprint } from '../core/VideoFingerprint.js';
import { VideoCaptionSession } from '../core/VideoCaptionSession.js';
import { LiveCaptionSessionManager } from '../core/LiveCaptionSessionManager.js';
import {
  LiveCaptionVideoHandoffCoordinator,
  LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS
} from '../core/LiveCaptionVideoHandoffCoordinator.js';
import {
  LiveCaptionCleanupCoordinator,
  LIVE_CAPTION_CLEANUP_RESULT_STATUSES
} from '../core/LiveCaptionCleanupCoordinator.js';
import { LIVE_CAPTION_ACTIONS } from '../constants/liveCaptionActions.js';
import {
  createLiveCaptionRuntimeStartRequest,
  createLiveCaptionRuntimeStopRequest,
  createLiveCaptionRuntimeStatusRequest,
  createLiveCaptionRuntimePauseRequest,
  createLiveCaptionRuntimeResumeRequest,
  normalizeLiveCaptionRuntimeResponse,
  createLiveCaptionRuntimeFailClosedResponse
} from '../background/liveCaptionRuntimeContracts.js';
import { useLiveCaptionStore } from '../stores/liveCaption.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionRuntimeController');

const requestFrame = typeof globalThis.requestAnimationFrame === 'function'
  ? globalThis.requestAnimationFrame.bind(globalThis)
  : (callback) => setTimeout(callback, 0);

const cancelFrame = typeof globalThis.cancelAnimationFrame === 'function'
  ? globalThis.cancelAnimationFrame.bind(globalThis)
  : (frameId) => clearTimeout(frameId);

function detectBrowserName(windowRef = typeof window !== 'undefined' ? window : null) {
  const userAgent = String(windowRef?.navigator?.userAgent || '').toLowerCase();

  if (userAgent.includes('firefox')) {
    return 'firefox';
  }

  if (userAgent.includes('edg/')) {
    return 'edge';
  }

  if (userAgent.includes('chrome') || userAgent.includes('chromium')) {
    return 'chrome';
  }

  return 'unknown';
}

function detectPlatform(windowRef = typeof window !== 'undefined' ? window : null) {
  return String(windowRef?.navigator?.userAgentData?.platform || windowRef?.navigator?.platform || 'desktop').toLowerCase();
}

function detectIsMobile(windowRef = typeof window !== 'undefined' ? window : null) {
  const ua = String(windowRef?.navigator?.userAgent || '').toLowerCase();
  const platform = detectPlatform(windowRef);
  return /android|iphone|ipad|ipod|mobile/.test(ua) || ['android', 'ios', 'mobile'].includes(platform);
}

function isVideoElement(value) {
  return Boolean(value && typeof value === 'object' && String(value.tagName || '').toLowerCase() === 'video');
}

function markVideoInteraction(video, at = Date.now()) {
  if (!isVideoElement(video)) {
    return false;
  }

  try {
    if (video.dataset) {
      video.dataset.liveCaptionLastInteractionAt = String(at);
    }

    if (typeof video.setAttribute === 'function') {
      video.setAttribute('data-live-caption-last-interaction-at', String(at));
    }

    video.__liveCaptionLastInteractionAt = at;
    return true;
  } catch {
    return false;
  }
}

function resolveActiveCandidateSummary(candidate = null) {
  if (!candidate) {
    return null;
  }

  return {
    domIndex: candidate.domIndex ?? null,
    playing: Boolean(candidate.playing),
    visible: Boolean(candidate.visible),
    audible: Boolean(candidate.audible),
    visibleArea: Number(candidate.visibleArea ?? 0),
    lastInteractionAt: Number(candidate.lastInteractionAt ?? 0),
    viewport: candidate.viewport ? { ...candidate.viewport } : null
  };
}

function buildActiveVideoState({
  tabId = null,
  sessionId = null,
  videoSession = null,
  candidate = null,
  fingerprint = null,
  handoffPlan = null,
  runtimeStatus = LIVE_CAPTION_RUNTIME_STATES.IDLE
} = {}) {
  return {
    tabId,
    sessionId,
    videoSessionId: videoSession?.sessionId ?? null,
    videoFingerprint: fingerprint ?? videoSession?.videoFingerprint ?? null,
    runtimeStatus,
    active: Boolean(videoSession || fingerprint),
    candidate: resolveActiveCandidateSummary(candidate),
    handoffAction: handoffPlan?.action ?? LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.NO_OP,
    preserveCacheIdentity: Boolean(handoffPlan?.preserveCacheIdentity),
    clearOverlayState: Boolean(handoffPlan?.clearOverlayState),
    reason: handoffPlan?.reason ?? null,
    updatedAt: Date.now()
  };
}

/**
 * Content-side runtime controller for Live Caption.
 * Owns active-video observation, handoff planning, and local session/store coordination only.
 */
export class LiveCaptionRuntimeController extends ResourceTracker {
  constructor({
    store = useLiveCaptionStore(),
    sessionManager = new LiveCaptionSessionManager(),
    handoffCoordinator = new LiveCaptionVideoHandoffCoordinator(),
    cleanupCoordinator = new LiveCaptionCleanupCoordinator(),
    documentRef = typeof document !== 'undefined' ? document : null,
    windowRef = typeof window !== 'undefined' ? window : null,
    browserApi = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null,
    platformSupport = null
  } = {}) {
    super('live-caption-runtime-controller');

    this.store = store;
    this.sessionManager = sessionManager;
    this.handoffCoordinator = handoffCoordinator;
    this.cleanupCoordinator = cleanupCoordinator;
    this.documentRef = documentRef;
    this.windowRef = windowRef;
    this.browserApi = browserApi;
    this.platformSupport = platformSupport;

    this.pageSession = null;
    this.tabId = store?.activeTabId ?? null;
    this.currentVideoElement = null;
    this.currentVideoFingerprint = null;
    this.currentVideoCandidate = null;
    this.lastHandoffPlan = null;
    this.lastCleanupResult = null;
    this.lastError = null;
    this.lastRuntimeRequest = null;
    this.lastRuntimeResponse = null;
    this.lastScanReason = null;
    this.runtimeStatus = LIVE_CAPTION_RUNTIME_STATES.IDLE;
    this.started = false;
    this.paused = false;
    this.destroyed = false;
    this.startPromise = null;
    this.scanFrameId = null;
    this.mutationObserver = null;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;

    if (this.browserApi?.runtime?.onMessage) {
      const handleMessage = (message) => {
        if (!message) return;

        // Handle LIVE_CAPTION_TRANSLATE_RESULT action
        if (message.action === 'LIVE_CAPTION_TRANSLATE_RESULT') {
          const { sessionId, videoFingerprint, segment } = message.payload || {};
          this.handleTranslateResult({ sessionId, videoFingerprint, segment });
        } else if (message.action === LIVE_CAPTION_ACTIONS.RUNTIME_STOP) {
          const { reason } = message.payload || {};
          logger.warn('Live-caption runtime forcefully stopped by background', { reason });
          this.stop(reason, { notifyContent: false, forceLocal: true }).catch(() => {});
        }
      };

      this.browserApi.runtime.onMessage.addListener(handleMessage);

      this.trackResource('live-caption-runtime-message-listener', () => {
        this.browserApi.runtime.onMessage.removeListener(handleMessage);
      });
    }

    logger.info('Live-caption runtime controller created', {
      createdAt: this.createdAt
    });
  }

  touch() {
    this.updatedAt = Date.now();
  }

  isReady() {
    return !this.destroyed;
  }

  resolvePlatformSupport() {
    if (this.platformSupport) {
      return this.platformSupport;
    }

    return createLiveCaptionPlatformSupportResult({
      browserName: detectBrowserName(this.windowRef),
      platform: detectPlatform(this.windowRef),
      isMobile: detectIsMobile(this.windowRef)
    });
  }

  async resolveTabId(explicitTabId = null) {
    if (explicitTabId != null) {
      return explicitTabId;
    }

    if (this.tabId != null) {
      return this.tabId;
    }

    if (this.store?.activeTabId != null) {
      return this.store.activeTabId;
    }

    // Try requesting active tab ID from background if running inside a content script
    const browserRuntime = this.browserApi?.runtime;
    if (browserRuntime?.sendMessage) {
      try {
        const response = await browserRuntime.sendMessage({
          action: LIVE_CAPTION_ACTIONS.GET_TAB_ID,
          messageId: `msg-${Date.now()}`,
          timestamp: Date.now()
        });
        if (response && response.tabId != null) {
          return response.tabId;
        }
      } catch (err) {
        logger.debug('Failed to get tab info from background:', err);
      }
    }

    if (!this.browserApi?.tabs?.query) {
      return null;
    }

    try {
      const tabs = await this.browserApi.tabs.query({ active: true, currentWindow: true });
      const [activeTab] = Array.isArray(tabs) ? tabs : [];
      return activeTab?.id ?? null;
    } catch (error) {
      logger.debug('Unable to resolve active tab for live caption runtime', {
        error: error?.message || String(error)
      });
      return null;
    }
  }

  _setRuntimeStatus(runtimeStatus, details = {}) {
    this.runtimeStatus = runtimeStatus;
    this.store?.setRuntimeStatus?.(runtimeStatus);
    this.touch();

    logger.debug('Live-caption runtime status updated', {
      runtimeStatus,
      ...details
    });

    this._syncControlState();
    return this.runtimeStatus;
  }

  _syncControlState() {
    const canStart = ![
      LIVE_CAPTION_RUNTIME_STATES.STARTING,
      LIVE_CAPTION_RUNTIME_STATES.RUNNING,
      LIVE_CAPTION_RUNTIME_STATES.DESTROYED
    ].includes(this.runtimeStatus);

    const canStop = [
      LIVE_CAPTION_RUNTIME_STATES.STARTING,
      LIVE_CAPTION_RUNTIME_STATES.RUNNING,
      LIVE_CAPTION_RUNTIME_STATES.PAUSED
    ].includes(this.runtimeStatus);

    const canRetry = [
      LIVE_CAPTION_RUNTIME_STATES.ERROR,
      LIVE_CAPTION_RUNTIME_STATES.PAUSED,
      LIVE_CAPTION_RUNTIME_STATES.STOPPED
    ].includes(this.runtimeStatus);

    const canPause = [
      LIVE_CAPTION_RUNTIME_STATES.STARTING,
      LIVE_CAPTION_RUNTIME_STATES.RUNNING
    ].includes(this.runtimeStatus);

    const canResume = [
      LIVE_CAPTION_RUNTIME_STATES.PAUSED
    ].includes(this.runtimeStatus);

    this.store?.setControlsState?.({
      canStart,
      canStop,
      canRetry,
      canPause,
      canResume,
      canClearCache: false
    });
  }

  _setStoreContext(tabId, videoFingerprint = null, sessionId = null) {
    this.store?.setContext?.({
      tabId,
      videoFingerprint,
      nextSessionId: sessionId
    });
  }

  _applyActiveVideoState({
    candidate = null,
    videoSession = null,
    fingerprint = null,
    handoffPlan = null
  } = {}) {
    this.currentVideoElement = candidate?.element ?? null;
    this.currentVideoCandidate = candidate ?? null;
    this.currentVideoFingerprint = fingerprint ?? videoSession?.videoFingerprint ?? null;

    this.store?.setActiveVideoState?.(buildActiveVideoState({
      tabId: this.tabId,
      sessionId: this.pageSession?.sessionId ?? null,
      videoSession,
      candidate,
      fingerprint: this.currentVideoFingerprint,
      handoffPlan,
      runtimeStatus: this.runtimeStatus
    }));

    this._setStoreContext(this.tabId, this.currentVideoFingerprint, this.pageSession?.sessionId ?? null);
  }

  _markVideoInteractionFromEvent(event) {
    const target = event?.target;
    const video = isVideoElement(target) ? target : target?.closest?.('video') || null;

    if (!isVideoElement(video)) {
      return;
    }

    markVideoInteraction(video);
  }

  _scheduleScan(reason = 'scan') {
    if (this.destroyed || !this.started || this.paused) {
      return;
    }

    this.lastScanReason = reason;

    if (this.scanFrameId != null) {
      return;
    }

    this.scanFrameId = requestFrame(() => {
      this.scanFrameId = null;
      void this.syncActiveVideo(this.lastScanReason || reason);
    });
  }

  _clearScheduledScan() {
    if (this.scanFrameId != null) {
      cancelFrame(this.scanFrameId);
      this.scanFrameId = null;
    }
  }

  _setupMutationObserver() {
    if (!this.documentRef || typeof globalThis.MutationObserver !== 'function' || this.mutationObserver) {
      return;
    }

    const observer = new MutationObserver(() => {
      this._scheduleScan('mutation');
    });

    const root = this.documentRef.documentElement || this.documentRef.body;
    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'muted', 'volume', 'paused', 'controls', 'playsinline', 'poster']
      });

      this.mutationObserver = observer;
      this.trackResource('live-caption-runtime-mutation-observer', () => {
        observer.disconnect();
      });
    }
  }

  _teardownMutationObserver() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  _setupObservers() {
    if (!this.documentRef) {
      return;
    }

    const documentEvents = [
      'play',
      'pause',
      'volumechange',
      'seeked',
      'seeking',
      'ended',
      'loadedmetadata',
      'loadeddata',
      'canplay',
      'playing',
      'ratechange',
      'timeupdate',
      'emptied'
    ];

    for (const eventName of documentEvents) {
      this.addEventListener(this.documentRef, eventName, (event) => {
        this._markVideoInteractionFromEvent(event);
        this._scheduleScan(eventName);
      }, true);
    }

    const interactionEvents = ['pointerdown', 'click', 'keydown', 'touchstart', 'focusin'];
    for (const eventName of interactionEvents) {
      this.addEventListener(this.documentRef, eventName, (event) => {
        this._markVideoInteractionFromEvent(event);
        this._scheduleScan(eventName);
      }, true);
    }

    if (this.windowRef) {
      this.addEventListener(this.windowRef, 'scroll', () => {
        this._scheduleScan('scroll');
      }, true);

      this.addEventListener(this.windowRef, 'resize', () => {
        this._scheduleScan('resize');
      }, true);

      this.addEventListener(this.windowRef, 'pagehide', () => {
        if (!this.destroyed) {
          void this.stop(LIVE_CAPTION_CLEANUP_REASONS.NAVIGATION, { notifyContent: false });
        }
      }, true);
    }

    this._setupMutationObserver();
  }

  _teardownObservers() {
    this._teardownMutationObserver();
    this._clearScheduledScan();
    this.cleanup();
  }

  _createVideoSession(videoFingerprint) {
    if (this.tabId == null) {
      return null;
    }

    return new VideoCaptionSession({
      tabId: this.tabId,
      videoFingerprint
    });
  }

  _applyHandoffPlan(plan, { candidate = null, nextVideoSession = null, fingerprint = null } = {}) {
    this.lastHandoffPlan = plan;

    if (!plan) {
      return null;
    }

    let activeVideoSession = this.pageSession?.activeVideoSession ?? null;

    if (plan.action === LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.NO_OP) {
      if (this.pageSession && this.pageSession.lifecycleState !== LIVE_CAPTION_SESSION_STATES.ACTIVE) {
        this.pageSession.start();
      }
    } else if (plan.action === LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.CREATE_NEW_VIDEO_SESSION) {
      if (nextVideoSession && this.pageSession) {
        this.pageSession.attachVideoSession(nextVideoSession);
        this.pageSession.start();
        activeVideoSession = this.pageSession.activeVideoSession;
      }
    } else if (plan.action === LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.REPLACE_ACTIVE_VIDEO) {
      if (nextVideoSession && this.pageSession) {
        this.pageSession.replaceVideoSession(nextVideoSession, plan.reason);
        this.pageSession.start();
        activeVideoSession = this.pageSession.activeVideoSession;
      }
    } else if (plan.action === LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.CLEANUP_OLD_VIDEO_SESSION) {
      if (this.pageSession?.activeVideoSession) {
        this.pageSession.clearVideoSession(plan.reason, true);
        activeVideoSession = null;
      }
    }

    this._applyActiveVideoState({
      candidate,
      videoSession: activeVideoSession,
      fingerprint: fingerprint ?? activeVideoSession?.videoFingerprint ?? null,
      handoffPlan: plan
    });

    logger.debug('Live-caption active video handoff applied', {
      action: plan.action,
      reason: plan.reason,
      sessionId: this.pageSession?.sessionId ?? null,
      tabId: this.tabId,
      currentVideoFingerprint: this.currentVideoFingerprint
    });

    return {
      plan,
      activeVideoSession
    };
  }

  _reconcileCleanupResult(cleanupResult, sessionCleanupMetadata = null) {
    if (!cleanupResult || !sessionCleanupMetadata) {
      return cleanupResult;
    }

    const metadataStatus = sessionCleanupMetadata.status ?? null;
    const hasFailure = [
      LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAILED,
      LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED
    ].includes(metadataStatus);

    if (!hasFailure) {
      return cleanupResult;
    }

    const reconciledStatus = metadataStatus;
    const reconciledError = sessionCleanupMetadata.error ?? cleanupResult.error ?? null;
    const reconciledResult = this.cleanupCoordinator.createCleanupResult({
      reason: cleanupResult.reason,
      status: reconciledStatus,
      sessionSnapshot: cleanupResult.sessionSnapshot,
      error: reconciledError,
      clearCache: cleanupResult.clearCache,
      notifyContent: cleanupResult.notifyContent
    });

    return {
      ...reconciledResult,
      sessionStatus: LIVE_CAPTION_SESSION_STATES.ERROR,
      preserveCaptions: false,
      clearCaptions: true,
      notifyContent: true
    };
  }

  _normalizeConsentEligibility(eligibility = null) {
    if (eligibility) {
      return eligibility;
    }

    return evaluateLiveCaptionStartEligibility({
      consentState: this.store?.consentState ?? LIVE_CAPTION_CONSENT_STATES.NOT_ASKED,
      platformSupport: this.resolvePlatformSupport()
    });
  }

  handleTranslateResult({ sessionId, videoFingerprint, segment }) {
    if (this.destroyed || !this.started || this.paused) {
      return;
    }

    if (!segment || typeof segment !== 'object') {
      return;
    }

    // Ignore incomplete or empty segments
    const text = segment.translatedText || segment.originalText || '';
    if (!text.trim()) {
      logger.debug('Ignoring empty translated caption segment', { sessionId });
      return;
    }

    const currentVideoSession = this.pageSession?.activeVideoSession ?? null;
    if (
      this.pageSession &&
      this.pageSession.sessionId === sessionId &&
      currentVideoSession &&
      currentVideoSession.videoFingerprint === videoFingerprint
    ) {
      currentVideoSession.addTranslatedCaptionSegment(segment);
      this.store?.setCaptions(currentVideoSession.translatedCaptionSegments);

      logger.debug('Overlay caption updated with new translated segment', {
        sessionId,
        videoFingerprint,
        lineCount: currentVideoSession.translatedCaptionSegments.length,
        segmentTiming: segment.segmentStartMs != null || segment.startMs != null
          ? `${segment.segmentStartMs ?? segment.startMs}ms - ${segment.segmentEndMs ?? segment.endMs}ms`
          : 'none'
      });
    } else {
      logger.debug('Ignoring translate result for non-active video session', {
        sessionId,
        videoFingerprint,
        activeFingerprint: currentVideoSession?.videoFingerprint
      });
    }
  }

  _applyStartupDenial(denial) {
    this.store?.setOverlayVisible?.(true);
    this.store?.setConsentNoticeVisible?.(true);
    this.store?.setStartupDeniedReason?.(denial?.reason ?? 'consent_required', {
      consentState: denial?.consentState ?? this.store?.consentState ?? LIVE_CAPTION_CONSENT_STATES.NOT_ASKED,
      platformSupport: denial?.platformSupport ?? null,
      recoveryFailure: denial?.recoveryFailure ?? null
    });
    this.store?.setRuntimeStatus?.(LIVE_CAPTION_RUNTIME_STATES.IDLE);
    this._setRuntimeStatus(LIVE_CAPTION_RUNTIME_STATES.IDLE, {
      reason: denial?.reason ?? 'consent_required'
    });

    this.lastError = null;

    logger.debug('Live-caption runtime start denied', {
      reason: denial?.reason ?? null,
      consentState: denial?.consentState ?? null,
      platformSupportReason: denial?.platformSupport?.reason ?? null
    });

    return denial;
  }

  _buildRuntimeRequest(action, data = {}, messageId = null) {
    const requestBuilders = {
      [LIVE_CAPTION_ACTIONS.RUNTIME_START]: createLiveCaptionRuntimeStartRequest,
      [LIVE_CAPTION_ACTIONS.RUNTIME_STOP]: createLiveCaptionRuntimeStopRequest,
      [LIVE_CAPTION_ACTIONS.RUNTIME_STATUS]: createLiveCaptionRuntimeStatusRequest,
      [LIVE_CAPTION_ACTIONS.RUNTIME_PAUSE]: createLiveCaptionRuntimePauseRequest,
      [LIVE_CAPTION_ACTIONS.RUNTIME_RESUME]: createLiveCaptionRuntimeResumeRequest
    };

    const buildRequest = requestBuilders[action];
    if (!buildRequest) {
      throw new TypeError(`Unsupported live-caption runtime action: ${action}`);
    }

    return buildRequest({
      ...data,
      requestSource: 'content',
      metadata: {
        source: 'LiveCaptionRuntimeController'
      }
    }, messageId);
  }

  async _sendRuntimeRequest(action, data = {}) {
    const browserRuntime = this.browserApi?.runtime;

    if (!browserRuntime?.sendMessage) {
      const unavailable = createLiveCaptionRuntimeFailClosedResponse(action, new Error('Live-caption runtime background is unavailable'), {
        code: 'background_unavailable',
        reason: 'background_unavailable',
        sessionId: data.sessionId ?? this.pageSession?.sessionId ?? null,
        tabId: data.tabId ?? this.tabId ?? null,
        videoFingerprint: data.videoFingerprint ?? this.currentVideoFingerprint ?? null
      });

      this.lastRuntimeRequest = this._buildRuntimeRequest(action, data);
      this.lastRuntimeResponse = unavailable;
      logger.warn('Live-caption runtime request could not be sent', {
        action,
        sessionId: data.sessionId ?? this.pageSession?.sessionId ?? null,
        tabId: data.tabId ?? this.tabId ?? null
      });
      return unavailable;
    }

    const request = this._buildRuntimeRequest(action, data);
    this.lastRuntimeRequest = request;

    try {
      const response = await browserRuntime.sendMessage(request);
      const normalized = normalizeLiveCaptionRuntimeResponse(response, {
        action,
        requestId: request.messageId,
        sessionId: data.sessionId ?? this.pageSession?.sessionId ?? null,
        tabId: data.tabId ?? this.tabId ?? null,
        videoFingerprint: data.videoFingerprint ?? this.currentVideoFingerprint ?? null,
        runtimeState: this.runtimeStatus
      });

      this.lastRuntimeResponse = normalized;
      this._applyRuntimeResponse(normalized);
      logger.debug('Live-caption runtime request completed', {
        action,
        status: normalized.status,
        runtimeState: normalized.runtimeState,
        sessionId: normalized.sessionId,
        tabId: normalized.tabId,
        videoFingerprint: normalized.videoFingerprint
      });

      return normalized;
    } catch (error) {
      const failed = createLiveCaptionRuntimeFailClosedResponse(action, error, {
        sessionId: data.sessionId ?? this.pageSession?.sessionId ?? null,
        tabId: data.tabId ?? this.tabId ?? null,
        videoFingerprint: data.videoFingerprint ?? this.currentVideoFingerprint ?? null,
        runtimeState: this.runtimeStatus
      });

      this.lastRuntimeResponse = failed;
      logger.warn('Live-caption runtime request failed closed', {
        action,
        sessionId: failed.error?.sessionId ?? null,
        tabId: failed.error?.tabId ?? null,
        videoFingerprint: failed.error?.videoFingerprint ?? null,
        code: failed.error?.code ?? null
      });

      return failed;
    }
  }

  _applyRuntimeResponse(response) {
    if (!response || !response.ok) {
      return;
    }

    const snapshot = response.sessionSnapshot;
    if (snapshot && snapshot.activeVideoSession) {
      const translatedSegments = snapshot.activeVideoSession.translatedCaptionSegments || [];
      const transcriptSegments = snapshot.activeVideoSession.transcriptSegments || [];
      
      // Merge for store display if needed, or just set if translated exist
      // Usually captionLines in store is driven by translated segments if available
      // but if only transcripts exist, we should show them.
      if (translatedSegments.length > 0 || transcriptSegments.length > 0) {
        // Merge translated and transcript segments safely
        // translatedSegments already contain originalText.
        // Append transcriptSegments that don't have a corresponding translatedSegment.
        const translatedTimes = new Set(
          translatedSegments.map((s) => `${s.segmentStartMs}-${s.segmentEndMs}`)
        );

        const unmergedTranscripts = transcriptSegments.filter(
          (s) => !translatedTimes.has(`${s.segmentStartMs}-${s.segmentEndMs}`)
        );

        const displaySegments = [...translatedSegments, ...unmergedTranscripts].sort(
          (a, b) => (a.segmentStartMs ?? 0) - (b.segmentStartMs ?? 0)
        );

        this.store?.setCaptions(displaySegments);

        // Synchronize local video session segments if fingerprints match
        const localVideoSession = this.pageSession?.activeVideoSession;
        if (
          localVideoSession &&
          localVideoSession.videoFingerprint === snapshot.activeVideoFingerprint
        ) {
          if (localVideoSession.translatedCaptionSegments.length === 0) {
            translatedSegments.forEach((s) => localVideoSession.addTranslatedCaptionSegment(s));
          }
          if (localVideoSession.transcriptSegments.length === 0) {
            transcriptSegments.forEach((s) => localVideoSession.addTranscriptSegment(s));
          }
          
          logger.debug('Local video session hydrated from runtime response', {
            tabId: this.tabId,
            videoFingerprint: snapshot.activeVideoFingerprint,
            captionCount: displaySegments.length,
            hasTranslations: translatedSegments.length > 0
          });
        }
      }
    }
  }

  async requestRuntimeStatus(reason = 'status') {
    const tabId = await this.resolveTabId();
    if (tabId == null) {
      const failure = createLiveCaptionRuntimeFailClosedResponse(LIVE_CAPTION_ACTIONS.RUNTIME_STATUS, new Error('Unable to resolve tab id for live-caption runtime status'), {
        code: 'missing_tab_id',
        reason: 'missing_tab_id',
        sessionId: this.pageSession?.sessionId ?? null,
        tabId: null,
        videoFingerprint: this.currentVideoFingerprint ?? null
      });

      this.lastRuntimeResponse = failure;
      return failure;
    }

    return this._sendRuntimeRequest(LIVE_CAPTION_ACTIONS.RUNTIME_STATUS, {
      tabId,
      sessionId: this.pageSession?.sessionId ?? null,
      videoFingerprint: this.currentVideoFingerprint ?? null,
      reason
    });
  }

  async start(options = {}) {
    if (this.destroyed) {
      return this.getSnapshot();
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    if (this.started && !this.paused) {
      logger.debug('Duplicate live-caption runtime start ignored', {
        tabId: this.tabId,
        sessionId: this.pageSession?.sessionId ?? null
      });
      return this.getSnapshot();
    }

    if (this.paused) {
      return this.resume(options);
    }

    const startTask = (async () => {
      const eligibility = this._normalizeConsentEligibility(options.startEligibility);
      if (!eligibility.allowed) {
        this._applyStartupDenial(eligibility);
        return this.getSnapshot();
      }

      const tabId = await this.resolveTabId(options.tabId);
      if (tabId == null) {
        const error = createLiveCaptionErrorState(
          new Error('Unable to resolve active tab for live caption runtime'),
          LIVE_CAPTION_CLEANUP_REASONS.ERROR
        );
        this.lastError = error;
        this.store?.setError?.(error);
        this._setRuntimeStatus(LIVE_CAPTION_RUNTIME_STATES.ERROR, {
          reason: 'missing_tab_id'
        });
        logger.warn('Live-caption runtime start failed: missing tab id');
        return this.getSnapshot();
      }

      this.tabId = tabId;
      this.pageSession = this.sessionManager.getOrCreateSession(tabId, {
        consentAccepted: Boolean(this.store?.consentAccepted)
      });
      this.pageSession.setConsentAccepted(Boolean(this.store?.consentAccepted));
      this.pageSession.start();

      this.store?.clearStartupDeniedReason?.();
      this.store?.setOverlayVisible?.(true);
      this.store?.setEnabled?.(true);
      this._setStoreContext(tabId, this.currentVideoFingerprint, this.pageSession.sessionId);
      this.store?.setStatus?.(this.pageSession.lifecycleState);
      this.store?.setActiveSessionState?.(this.pageSession.lifecycleState);
      this.store?.setConsentNoticeVisible?.(!this.store?.consentAccepted);

      this.started = true;
      this.paused = false;
      this.lastError = null;
      this.lastCleanupResult = null;
      this._setRuntimeStatus(LIVE_CAPTION_RUNTIME_STATES.STARTING, {
        tabId,
        sessionId: this.pageSession.sessionId
      });

      this._setupObservers();
      await this.syncActiveVideo('start');
      this._setRuntimeStatus(LIVE_CAPTION_RUNTIME_STATES.RUNNING, {
        tabId,
        sessionId: this.pageSession.sessionId,
        activeVideoFingerprint: this.currentVideoFingerprint
      });

      await this._sendRuntimeRequest(LIVE_CAPTION_ACTIONS.RUNTIME_START, {
        tabId,
        sessionId: this.pageSession.sessionId,
        videoFingerprint: this.currentVideoFingerprint,
        reason: 'start',
        consentAccepted: Boolean(this.store?.consentAccepted)
      });

      logger.info('Live-caption runtime started', {
        tabId,
        sessionId: this.pageSession.sessionId,
        activeVideoFingerprint: this.currentVideoFingerprint
      });

      return this.getSnapshot();
    })();

    this.startPromise = startTask;

    try {
      return await startTask;
    } finally {
      if (this.startPromise === startTask) {
        this.startPromise = null;
      }
    }
  }

  async pause(reason = 'pause') {
    if (this.destroyed || !this.started || this.paused) {
      return this.getSnapshot();
    }

    this.paused = true;
    this._teardownMutationObserver();
    this._clearScheduledScan();
    this.cleanup();
    this._setRuntimeStatus(LIVE_CAPTION_RUNTIME_STATES.PAUSED, {
      tabId: this.tabId,
      sessionId: this.pageSession?.sessionId ?? null,
      reason
    });

    await this._sendRuntimeRequest(LIVE_CAPTION_ACTIONS.RUNTIME_PAUSE, {
      tabId: this.tabId,
      sessionId: this.pageSession?.sessionId ?? null,
      videoFingerprint: this.currentVideoFingerprint,
      reason
    });

    logger.info('Live-caption runtime paused', {
      tabId: this.tabId,
      sessionId: this.pageSession?.sessionId ?? null,
      reason
    });

    return this.getSnapshot();
  }

  async resume(options = {}) {
    if (this.destroyed) {
      return this.getSnapshot();
    }

    if (!this.started) {
      return this.start(options);
    }

    if (!this.paused) {
      return this.getSnapshot();
    }

    this.paused = false;
    this._setupObservers();
    this._scheduleScan('resume');
    this._setRuntimeStatus(LIVE_CAPTION_RUNTIME_STATES.RUNNING, {
      tabId: this.tabId,
      sessionId: this.pageSession?.sessionId ?? null
    });

    await this._sendRuntimeRequest(LIVE_CAPTION_ACTIONS.RUNTIME_RESUME, {
      tabId: this.tabId,
      sessionId: this.pageSession?.sessionId ?? null,
      videoFingerprint: this.currentVideoFingerprint,
      reason: 'resume'
    });

    logger.info('Live-caption runtime resumed', {
      tabId: this.tabId,
      sessionId: this.pageSession?.sessionId ?? null
    });

    return this.getSnapshot();
  }

  async syncActiveVideo(reason = 'scan') {
    if (this.destroyed || !this.started || this.paused) {
      return this.getSnapshot();
    }

    if (!this.documentRef) {
      return this.getSnapshot();
    }

    const candidates = rankActiveVideoCandidates(this.documentRef);
    const selectedCandidate = candidates[0] ?? null;
    const selectedVideo = selectedCandidate?.element ?? null;
    const selectedFingerprint = selectedVideo
      ? createVideoFingerprint(selectedVideo, {
          baseUrl: this.documentRef.location?.origin || this.windowRef?.location?.origin || 'about:blank'
        })
      : null;
    const currentVideoSession = this.pageSession?.activeVideoSession ?? null;
    const currentFingerprint = currentVideoSession?.videoFingerprint ?? null;

    if (selectedFingerprint && currentFingerprint === selectedFingerprint) {
      this._applyHandoffPlan(
        this.handoffCoordinator.createHandoffPlan({
          currentVideoSession,
          nextVideoSession: currentVideoSession,
          reason
        }),
        {
          candidate: selectedCandidate,
          nextVideoSession: currentVideoSession,
          fingerprint: selectedFingerprint
        }
      );

      logger.debug('Live-caption active video unchanged', {
        reason,
        tabId: this.tabId,
        videoFingerprint: selectedFingerprint
      });

      return this.getSnapshot();
    }

    const nextVideoSession = selectedFingerprint
      ? this._createVideoSession(selectedFingerprint)
      : null;

    const handoffPlan = this.handoffCoordinator.createHandoffPlan({
      currentVideoSession,
      currentVideoSnapshot: currentVideoSession?.getCleanupSnapshot?.() ?? null,
      nextVideoSession,
      nextVideoSnapshot: nextVideoSession?.getCleanupSnapshot?.() ?? null,
      reason: selectedFingerprint ? LIVE_CAPTION_CLEANUP_REASONS.VIDEO_CHANGED : LIVE_CAPTION_CLEANUP_REASONS.VIDEO_CHANGED
    });

    this._applyHandoffPlan(handoffPlan, {
      candidate: selectedCandidate,
      nextVideoSession,
      fingerprint: selectedFingerprint
    });

    return this.getSnapshot();
  }

  async stop(reason = LIVE_CAPTION_CLEANUP_REASONS.STOP, { notifyContent = true, clearCache = false, forceLocal = false } = {}) {
    if ((this.destroyed && !this.pageSession) || (!this.started && !this.pageSession && !this.currentVideoElement)) {
      return this.getSnapshot();
    }

    const sessionSnapshot = this.pageSession?.getCleanupSnapshot?.()
      ?? this.sessionManager.getSessionCleanupSnapshot?.(this.tabId)
      ?? null;

    const cleanupPlan = this.cleanupCoordinator.createCleanupPlan({
      reason,
      session: this.pageSession,
      sessionSnapshot,
      notifyContent,
      clearCache
    });

    if (!forceLocal) {
      await this._sendRuntimeRequest(LIVE_CAPTION_ACTIONS.RUNTIME_STOP, {
        tabId: this.tabId,
        sessionId: this.pageSession?.sessionId ?? null,
        videoFingerprint: this.currentVideoFingerprint,
        reason,
        notifyContent,
        clearCache
      });
    }

    if (this.tabId != null) {
      this.sessionManager.cleanupByTabId(this.tabId, reason);
    }

    const sessionCleanupMetadata = this.tabId != null
      ? this.sessionManager.getSessionCleanupMetadata?.(this.tabId) ?? null
      : null;
    const cleanupResult = this.cleanupCoordinator.createCleanupResult({
      plan: cleanupPlan,
      status: sessionCleanupMetadata?.status ?? null,
      error: sessionCleanupMetadata?.error ?? null,
      sessionSnapshot: sessionCleanupMetadata?.snapshot ?? sessionSnapshot ?? null
    });

    this._teardownObservers();
    this.currentVideoElement = null;
    this.currentVideoFingerprint = null;
    this.currentVideoCandidate = null;
    this.pageSession = null;
    this.started = false;
    this.paused = false;
    this.lastCleanupResult = cleanupResult;

    this.store?.applyCleanupResult?.({
      sessionStatus: cleanupResult.sessionStatus,
      runtimeState: cleanupResult.status === LIVE_CAPTION_CLEANUP_RESULT_STATUSES.COMPLETED
        ? LIVE_CAPTION_RUNTIME_STATES.STOPPED
        : LIVE_CAPTION_RUNTIME_STATES.ERROR,
      preserveCaptions: cleanupResult.preserveCaptions,
      clearCaptions: cleanupResult.clearCaptions,
      clearSessionIdentity: true,
      clearConsent: true,
      error: cleanupResult.error
    });

    this.store?.setOverlayVisible?.(false);
    this.store?.setEnabled?.(false);
    this.store?.clearActiveVideoState?.();
    this.store?.setRuntimeStatus?.(
      cleanupResult.status === LIVE_CAPTION_CLEANUP_RESULT_STATUSES.COMPLETED
        ? LIVE_CAPTION_RUNTIME_STATES.STOPPED
        : LIVE_CAPTION_RUNTIME_STATES.ERROR
    );
    this.store?.setStatus?.(cleanupResult.sessionStatus);
    this.store?.setActiveSessionState?.(cleanupResult.sessionStatus);
    this.store?.setContext?.({ tabId: null, videoFingerprint: null, nextSessionId: null });
    this._setRuntimeStatus(
      cleanupResult.status === LIVE_CAPTION_CLEANUP_RESULT_STATUSES.COMPLETED
        ? LIVE_CAPTION_RUNTIME_STATES.STOPPED
        : LIVE_CAPTION_RUNTIME_STATES.ERROR,
      {
        reason,
        cleanupStatus: cleanupResult.status
      }
    );

    logger.info('Live-caption runtime stopped', {
      reason,
      status: cleanupResult.status,
      tabId: cleanupResult.tabId,
      sessionId: cleanupResult.sessionId,
      videoFingerprint: cleanupResult.videoFingerprint
    });

    return cleanupResult;
  }

  async destroy(reason = LIVE_CAPTION_CLEANUP_REASONS.MANUAL) {
    if (this.destroyed) {
      return this.getSnapshot();
    }

    await this.stop(reason, { notifyContent: false });
    this.destroyed = true;
    this._teardownObservers();
    this.store?.setEnabled?.(false);
    this._setRuntimeStatus(LIVE_CAPTION_RUNTIME_STATES.DESTROYED, {
      reason,
      tabId: this.tabId,
      sessionId: this.pageSession?.sessionId ?? null
    });

    logger.info('Live-caption runtime destroyed', {
      reason,
      tabId: this.tabId,
      sessionId: this.pageSession?.sessionId ?? null
    });

    return this.getSnapshot();
  }

  getSnapshot() {
    const pageSessionSnapshot = this.pageSession?.getSnapshot?.() ?? null;
    const videoSessionSnapshot = this.pageSession?.activeVideoSession?.getSnapshot?.() ?? null;

    return {
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      tabId: this.tabId,
      runtimeStatus: this.runtimeStatus,
      started: this.started,
      paused: this.paused,
      destroyed: this.destroyed,
      sessionId: this.pageSession?.sessionId ?? null,
      pageSessionSnapshot,
      videoSessionSnapshot,
      currentVideoFingerprint: this.currentVideoFingerprint,
      currentVideoState: this.store?.activeVideoState ? { ...this.store.activeVideoState } : null,
      currentVideoCandidate: resolveActiveCandidateSummary(this.currentVideoCandidate),
      lastHandoffPlan: this.lastHandoffPlan ? { ...this.lastHandoffPlan } : null,
      lastCleanupResult: this.lastCleanupResult ? { ...this.lastCleanupResult } : null,
      lastError: this.lastError ? { ...this.lastError } : null,
      lastRuntimeRequest: this.lastRuntimeRequest ? { ...this.lastRuntimeRequest } : null,
      lastRuntimeResponse: this.lastRuntimeResponse ? { ...this.lastRuntimeResponse } : null,
      lastScanReason: this.lastScanReason ?? null
    };
  }
}

export default LiveCaptionRuntimeController;
