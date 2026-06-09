import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  LIVE_CAPTION_CLEANUP_REASONS,
  createLiveCaptionSessionSnapshot
} from './contracts.js';
import {
  LIVE_CAPTION_CLEANUP_RESULT_STATUSES
} from './LiveCaptionCleanupCoordinator.js';
import { PageLiveCaptionSession } from './PageLiveCaptionSession.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionSessionManager');

function normalizeTabId(tabId) {
  if (tabId == null) {
    throw new TypeError('LiveCaptionSessionManager requires a tabId');
  }

  return tabId;
}

/**
 * Registry/coordinator for one live-caption page session per tab.
 * No browser listeners or runtime startup logic are registered here.
 */
export class LiveCaptionSessionManager {
  constructor() {
    this.sessions = new Map();
    this.cleanupMetadataByTab = new Map();
    this.createdAt = Date.now();

    logger.info('Live-caption session manager created', {
      sessionCount: this.sessions.size
    });
  }

  createSession(tabId, options = {}) {
    const normalizedTabId = normalizeTabId(tabId);

    if (this.sessions.has(normalizedTabId)) {
      logger.debug('Duplicate page session prevented', {
        tabId: normalizedTabId,
        sessionId: this.sessions.get(normalizedTabId).sessionId
      });
      return this.sessions.get(normalizedTabId);
    }

    const session = new PageLiveCaptionSession({
      tabId: normalizedTabId,
      ...options
    });

    this.sessions.set(normalizedTabId, session);
    this.cleanupMetadataByTab.delete(normalizedTabId);

    logger.info('Page session registered', {
      tabId: normalizedTabId,
      sessionId: session.sessionId,
      sessionCount: this.sessions.size
    });

    return session;
  }

  getOrCreateSession(tabId, options = {}) {
    return this.createSession(tabId, options);
  }

  getSession(tabId) {
    return this.sessions.get(normalizeTabId(tabId)) ?? null;
  }

  hasSession(tabId) {
    return this.sessions.has(normalizeTabId(tabId));
  }

  removeSession(tabId, reason = LIVE_CAPTION_CLEANUP_REASONS.MANUAL) {
    const normalizedTabId = normalizeTabId(tabId);
    const session = this.sessions.get(normalizedTabId);

    if (!session) {
      return null;
    }

    const snapshot = this.failClosedCleanup(normalizedTabId, reason);

    logger.info('Page session removed', {
      tabId: normalizedTabId,
      sessionId: session.sessionId,
      reason,
      sessionCount: this.sessions.size
    });

    return snapshot;
  }

  cleanupByTabId(tabId, reason = LIVE_CAPTION_CLEANUP_REASONS.MANUAL) {
    return this.removeSession(tabId, reason);
  }

  failClosedCleanup(tabId, reason = LIVE_CAPTION_CLEANUP_REASONS.ERROR, error = null) {
    const normalizedTabId = normalizeTabId(tabId);
    const session = this.sessions.get(normalizedTabId);

    if (!session) {
      return null;
    }

    let snapshot = null;
    let metadata = {
      tabId: normalizedTabId,
      sessionId: session.sessionId,
      reason,
      status: LIVE_CAPTION_CLEANUP_RESULT_STATUSES.COMPLETED,
      error: null,
      snapshot: null,
      updatedAt: Date.now()
    };

    try {
      snapshot = session.cleanup(reason);
      metadata = {
        ...metadata,
        snapshot: snapshot ? { ...snapshot } : null,
        updatedAt: Date.now()
      };
    } catch (cleanupError) {
      logger.warn('Page session cleanup failed; forcing fail-closed removal', {
        tabId: normalizedTabId,
        sessionId: session.sessionId,
        reason,
        error: {
          message: cleanupError?.message || String(cleanupError),
          code: cleanupError?.code ?? null
        }
      });
      snapshot = createLiveCaptionSessionSnapshot(session);
      metadata = {
        ...metadata,
        status: LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED,
        error: {
          name: cleanupError?.name || 'Error',
          message: cleanupError?.message || String(cleanupError),
          code: cleanupError?.code ?? null,
          stack: cleanupError?.stack || null
        },
        snapshot: snapshot ? { ...snapshot } : null,
        updatedAt: Date.now()
      };
    } finally {
      this.sessions.delete(normalizedTabId);
      this.cleanupMetadataByTab.set(normalizedTabId, metadata);
    }

    logger.info('Fail-closed cleanup completed', {
      tabId: normalizedTabId,
      sessionId: session.sessionId,
      reason,
      hadExternalError: Boolean(error)
    });

    return snapshot;
  }

  getSessionStatus(tabId) {
    const session = this.getSession(tabId);
    return session ? session.getStatus() : null;
  }

  getSessionSnapshot(tabId) {
    const session = this.getSession(tabId);
    return session ? session.toSnapshot() : null;
  }

  getSnapshot(tabId) {
    return this.getSessionSnapshot(tabId);
  }

  getCleanupSnapshot(tabId) {
    return this.getSessionCleanupSnapshot(tabId);
  }

  getSessionCleanupSnapshot(tabId) {
    return this.getSessionSnapshot(tabId);
  }

  getSessionCleanupMetadata(tabId) {
    return this.cleanupMetadataByTab.get(normalizeTabId(tabId)) ?? null;
  }

  getAllSessionSnapshots() {
    return Array.from(this.sessions.values()).map((session) => session.toSnapshot());
  }

  clear(reason = LIVE_CAPTION_CLEANUP_REASONS.MANUAL) {
    const snapshots = this.getAllSessionSnapshots();

    for (const tabId of Array.from(this.sessions.keys())) {
      this.failClosedCleanup(tabId, reason);
    }

    logger.info('Live-caption session registry cleared', {
      reason,
      previousSessionCount: snapshots.length
    });

    return snapshots;
  }
}

export default LiveCaptionSessionManager;
