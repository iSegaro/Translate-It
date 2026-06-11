import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import {
  LIVE_CAPTION_CLEANUP_REASONS,
  createLiveCaptionErrorState,
  createLiveCaptionSessionId,
  createLiveCaptionSessionSnapshot
} from './contracts.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'PageLiveCaptionSession');

function isPageLikeVideoSession(session) {
  return Boolean(session && typeof session === 'object' && 'videoFingerprint' in session);
}

/**
 * Lightweight tab-scoped session model for live captioning.
 * Owns the active video session reference and page-level lifecycle state.
 */
export class PageLiveCaptionSession {
  constructor({ tabId, sessionId = createLiveCaptionSessionId('page', tabId), isIncognito = false } = {}) {
    if (tabId == null) {
      throw new TypeError('PageLiveCaptionSession requires a tabId');
    }

    this.tabId = tabId;
    this.sessionId = sessionId;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.lifecycleState = LIVE_CAPTION_SESSION_STATES.IDLE;
    this.isIncognito = Boolean(isIncognito);
    this.activeVideoSession = null;
    this.activeVideoSessionId = null;
    this.activeVideoFingerprint = null;
    this.lastError = null;
    this.lastCleanupReason = null;

    logger.info('Page session created', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      isIncognito: this.isIncognito
    });
  }

  touch() {
    this.updatedAt = Date.now();
  }



  start() {
    this.lifecycleState = LIVE_CAPTION_SESSION_STATES.ACTIVE;
    this.touch();

    if (this.activeVideoSession && typeof this.activeVideoSession.start === 'function') {
      this.activeVideoSession.start();
    }

    logger.info('Page session started', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      lifecycleState: this.lifecycleState
    });

    return this.lifecycleState;
  }

  stop(reason = LIVE_CAPTION_CLEANUP_REASONS.STOP) {
    this.lifecycleState = LIVE_CAPTION_SESSION_STATES.IDLE;
    this.lastCleanupReason = reason;
    this.touch();

    if (this.activeVideoSession && typeof this.activeVideoSession.stop === 'function') {
      this.activeVideoSession.stop(reason);
    }

    logger.info('Page session stopped', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      reason,
      lifecycleState: this.lifecycleState
    });

    return this.lifecycleState;
  }

  markError(error, reason = LIVE_CAPTION_CLEANUP_REASONS.ERROR) {
    this.lastError = createLiveCaptionErrorState(error, reason);
    this.lifecycleState = LIVE_CAPTION_SESSION_STATES.ERROR;
    this.touch();

    if (this.activeVideoSession && typeof this.activeVideoSession.markError === 'function') {
      this.activeVideoSession.markError(error, reason);
    }

    logger.warn('Page session error', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      reason,
      error: this.lastError
    });

    return this.lastError;
  }

  attachVideoSession(videoSession) {
    if (!isPageLikeVideoSession(videoSession)) {
      throw new TypeError('PageLiveCaptionSession.attachVideoSession requires a video session');
    }

    const previousSession = this.activeVideoSession;

    if (previousSession && previousSession !== videoSession) {
      this.clearVideoSession(LIVE_CAPTION_CLEANUP_REASONS.VIDEO_CHANGED);
    }

    this.activeVideoSession = videoSession;
    this.activeVideoSessionId = videoSession.sessionId;
    this.activeVideoFingerprint = videoSession.videoFingerprint;
    this.touch();

    logger.info('Video session attached', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      activeVideoSessionId: this.activeVideoSessionId,
      activeVideoFingerprint: this.activeVideoFingerprint
    });

    return previousSession;
  }

  replaceVideoSession(videoSession, reason = LIVE_CAPTION_CLEANUP_REASONS.VIDEO_CHANGED) {
    const previousSession = this.activeVideoSession;
    if (previousSession && typeof previousSession.stop === 'function') {
      previousSession.stop(reason);
    }

    this.activeVideoSession = null;
    this.activeVideoSessionId = null;
    this.activeVideoFingerprint = null;

    if (videoSession) {
      this.attachVideoSession(videoSession);
    }

    this.touch();

    logger.info('Video session replaced', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      reason,
      hasActiveVideoSession: Boolean(this.activeVideoSession)
    });

    return previousSession;
  }

  clearVideoSession(reason = LIVE_CAPTION_CLEANUP_REASONS.MANUAL, shouldStop = true) {
    const previousSession = this.activeVideoSession;

    if (shouldStop && previousSession && typeof previousSession.stop === 'function') {
      previousSession.stop(reason);
    }

    this.activeVideoSession = null;
    this.activeVideoSessionId = null;
    this.activeVideoFingerprint = null;
    this.touch();

    logger.debug('Video session cleared', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      reason
    });

    return previousSession;
  }

  cleanup(reason = LIVE_CAPTION_CLEANUP_REASONS.STOP) {
    const snapshot = this.toSnapshot();

    const isError = reason === LIVE_CAPTION_CLEANUP_REASONS.ERROR || 
                    reason === LIVE_CAPTION_CLEANUP_REASONS.PROVIDER_ERROR ||
                    reason === LIVE_CAPTION_CLEANUP_REASONS.RECOVERY_FAILURE;

    this.stop(reason);
    

    this.clearVideoSession(reason, false);
    this.lastError = null;
    this.lastCleanupReason = reason;
    this.touch();

    logger.info('Page session cleaned up', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      reason
    });

    return snapshot;
  }

  getStatus() {
    return {
      tabId: this.tabId,
      sessionId: this.sessionId,
      lifecycleState: this.lifecycleState,
      isIncognito: this.isIncognito,
      activeVideoSessionId: this.activeVideoSessionId,
      activeVideoFingerprint: this.activeVideoFingerprint,
      hasActiveVideoSession: Boolean(this.activeVideoSession),
      lastError: this.lastError ? { ...this.lastError } : null,
      lastCleanupReason: this.lastCleanupReason ?? null,
      updatedAt: this.updatedAt
    };
  }

  toSnapshot() {
    return createLiveCaptionSessionSnapshot(this);
  }

  getSnapshot() {
    return this.toSnapshot();
  }

  getCleanupSnapshot() {
    return this.toSnapshot();
  }
}

export default PageLiveCaptionSession;
