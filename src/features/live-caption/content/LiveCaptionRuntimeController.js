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

    this.store?.setControlsState?.({
      canStart,
      canStop,
      canRetry,
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

  async stop(reason = LIVE_CAPTION_CLEANUP_REASONS.STOP, { notifyContent = true, clearCache = false } = {}) {
    if (this.destroyed && !this.pageSession) {
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
    const plannedCleanupResult = this.cleanupCoordinator.createCleanupResult({
      plan: cleanupPlan
    });

    let sessionCleanupMetadata = null;
    if (this.tabId != null) {
      try {
        this.sessionManager.cleanupByTabId(this.tabId, reason);
      } catch (cleanupError) {
        sessionCleanupMetadata = {
          tabId: this.tabId,
          sessionId: this.pageSession?.sessionId ?? null,
          reason,
          status: LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED,
          error: this.cleanupCoordinator.normalizeError(cleanupError, {
            stage: 'session_manager_cleanup',
            reason,
            cleanupReason: reason,
            sessionId: this.pageSession?.sessionId ?? null,
            tabId: this.tabId,
            videoFingerprint: this.currentVideoFingerprint,
            shouldStopCapture: false,
            notifyContent,
            clearVolatileState: true
          }),
          snapshot: sessionSnapshot,
          updatedAt: Date.now()
        };
      }
      sessionCleanupMetadata = sessionCleanupMetadata
        ?? this.sessionManager.getSessionCleanupMetadata?.(this.tabId)
        ?? null;
    }

    this._teardownObservers();
    this.currentVideoElement = null;
    this.currentVideoFingerprint = null;
    this.currentVideoCandidate = null;
    this.pageSession = null;
    this.started = false;
    this.paused = false;
    const cleanupResult = this._reconcileCleanupResult(plannedCleanupResult, sessionCleanupMetadata);
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
      lastScanReason: this.lastScanReason ?? null
    };
  }
}

export default LiveCaptionRuntimeController;
