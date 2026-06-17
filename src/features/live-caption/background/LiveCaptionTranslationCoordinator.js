import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LiveCaptionTranslationAdapter } from './LiveCaptionTranslationAdapter.js';
import { isCancellationError } from '@/shared/error-management/ErrorMatcher.js';
import { normalizeLiveCaptionTranscriptSegment } from './liveCaptionTranslationContracts.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionTranslationCoordinator');

/**
 * Background-side coordinator for live-caption translation execution pipeline.
 * Manages FIFO queueing, translation request dispatch, abort routing, and session state mapping.
 */
export class LiveCaptionTranslationCoordinator {
  constructor({ sessionManager, captureCoordinator, cache = null, translationAdapter = null, browserApi = null, onError = null } = {}) {
    if (!sessionManager) {
      throw new TypeError('LiveCaptionTranslationCoordinator requires a sessionManager');
    }
    this.sessionManager = sessionManager;
    this.captureCoordinator = captureCoordinator;
    this.cache = cache;
    this.translationAdapter = translationAdapter || new LiveCaptionTranslationAdapter();
    this.browserApi = browserApi || (typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null);
    this.onError = onError;
    this.sessionQueues = new Map();
    this.activeAbortControllers = new Map();
    this.maxPendingSegments = 5;
  }

  getOrCreateQueue(sessionId) {
    if (!this.sessionQueues.has(sessionId)) {
      this.sessionQueues.set(sessionId, {
        segments: [],
        processing: false
      });
    }
    return this.sessionQueues.get(sessionId);
  }

  _normalizeCanonicalIdentity(input) {
    if (!input || typeof input !== 'object') {
      return null;
    }

    const sessionId = typeof input.sessionId === 'string' && input.sessionId.trim().length > 0
      ? input.sessionId.trim()
      : null;
    const tabId = Number(input.tabId);
    const videoFingerprint = typeof input.videoFingerprint === 'string' && input.videoFingerprint.trim().length > 0
      ? input.videoFingerprint.trim()
      : null;
    const segmentId = typeof input.segmentId === 'string' && input.segmentId.trim().length > 0
      ? input.segmentId.trim()
      : null;

    if (!sessionId || !Number.isFinite(tabId) || !videoFingerprint || !segmentId) {
      return null;
    }

    return {
      sessionId,
      tabId,
      videoFingerprint,
      segmentId
    };
  }

  _normalizeRevisionValue(value) {
    if (value == null || value === '') {
      return null;
    }

    const revision = Number(value);
    return Number.isFinite(revision) ? revision : null;
  }

  _normalizeQueuedCanonicalState(segment, tabId = null) {
    if (!segment || typeof segment !== 'object') {
      return null;
    }

    const canonicalIdentity = this._normalizeCanonicalIdentity({
      ...segment,
      tabId: segment?.tabId ?? tabId
    });
    const revision = this._normalizeRevisionValue(segment?.revision);

    if (!canonicalIdentity || revision == null) {
      return null;
    }

    return {
      identity: canonicalIdentity,
      revision,
      key: [
        canonicalIdentity.sessionId,
        canonicalIdentity.tabId,
        canonicalIdentity.videoFingerprint,
        canonicalIdentity.segmentId,
        revision
      ].join('::')
    };
  }

  _findQueuedCanonicalSegmentIndex(queue, segment, tabId = null) {
    const queuedState = this._normalizeQueuedCanonicalState(segment, tabId);
    if (!queuedState || !queue?.segments?.length) {
      return -1;
    }

    return queue.segments.findIndex((queuedSegment) => {
      const candidateState = this._normalizeQueuedCanonicalState(queuedSegment, tabId);
      return Boolean(candidateState && candidateState.key === queuedState.key);
    });
  }

  _pruneQueuedSegments(queue, pageSession, tabId, videoFingerprint) {
    if (!queue?.segments?.length) {
      return {
        prunedCount: 0,
        duplicateCount: 0
      };
    }

    const activeVideoSession = pageSession?.activeVideoSession;
    if (!activeVideoSession || activeVideoSession.videoFingerprint !== videoFingerprint) {
      return {
        prunedCount: 0,
        duplicateCount: 0
      };
    }

    const prunedSegments = [];
    const seenCanonicalKeys = new Set();
    let prunedCount = 0;
    let duplicateCount = 0;

    for (const queuedSegment of queue.segments) {
      const queuedState = this._normalizeQueuedCanonicalState(queuedSegment, tabId);
      if (!queuedState) {
        prunedSegments.push(queuedSegment);
        continue;
      }

      const currentTranscript = activeVideoSession.getTranscriptSegmentByIdentity?.(queuedState.identity);
      if (!currentTranscript) {
        prunedCount += 1;
        logger.debug('Dropped queued canonical segment because current transcript is missing', {
          sessionId: queuedState.identity.sessionId,
          tabId: queuedState.identity.tabId,
          videoFingerprint: queuedState.identity.videoFingerprint,
          segmentId: queuedState.identity.segmentId,
          revision: queuedState.revision
        });
        continue;
      }

      const currentRevision = this._normalizeRevisionValue(currentTranscript.revision);
      if (currentRevision == null || currentRevision > queuedState.revision) {
        prunedCount += 1;
        logger.debug('Dropped stale queued canonical segment before translation', {
          sessionId: queuedState.identity.sessionId,
          tabId: queuedState.identity.tabId,
          videoFingerprint: queuedState.identity.videoFingerprint,
          segmentId: queuedState.identity.segmentId,
          queuedRevision: queuedState.revision,
          currentRevision
        });
        continue;
      }

      if (seenCanonicalKeys.has(queuedState.key)) {
        duplicateCount += 1;
        logger.debug('Dropped duplicate queued canonical segment before translation', {
          sessionId: queuedState.identity.sessionId,
          tabId: queuedState.identity.tabId,
          videoFingerprint: queuedState.identity.videoFingerprint,
          segmentId: queuedState.identity.segmentId,
          revision: queuedState.revision
        });
        continue;
      }

      seenCanonicalKeys.add(queuedState.key);
      prunedSegments.push(queuedSegment);
    }

    if (prunedCount > 0 || duplicateCount > 0) {
      queue.segments = prunedSegments;
    }

    return {
      prunedCount,
      duplicateCount
    };
  }

  _dropOldestQueuedSegment(queue, {
    sessionId = null,
    tabId = null,
    videoFingerprint = null,
    reason = 'queue_overflow'
  } = {}) {
    if (!queue?.segments?.length) {
      return null;
    }

    const evictionIndex = queue.processing && queue.segments.length > 1 ? 1 : 0;
    const [droppedSegment] = queue.segments.splice(evictionIndex, 1);

    if (droppedSegment) {
      logger.warn('Dropped queued transcript segment to preserve bounded backpressure', {
        sessionId,
        tabId,
        videoFingerprint,
        reason,
        droppedSegmentId: droppedSegment.segmentId ?? null,
        droppedRevision: droppedSegment.revision ?? null,
        queueDepth: queue.segments.length
      });
    }

    return droppedSegment ?? null;
  }

  _getCurrentCanonicalTranscriptState(pageSession, sourceSegment, tabId) {
    const activeVideoSession = pageSession?.activeVideoSession;
    if (!activeVideoSession) {
      return {
        status: 'missing_video_session'
      };
    }

    const canonicalIdentity = this._normalizeCanonicalIdentity({
      ...sourceSegment,
      tabId: sourceSegment?.tabId ?? tabId
    });
    const revision = this._normalizeRevisionValue(sourceSegment?.revision);

    if (!canonicalIdentity || revision == null) {
      return null;
    }

    if (typeof activeVideoSession.getTranscriptSegmentByIdentity !== 'function') {
      return {
        status: 'missing_lookup',
        identity: canonicalIdentity,
        revision
      };
    }

    const currentTranscript = activeVideoSession.getTranscriptSegmentByIdentity(canonicalIdentity);

    if (!currentTranscript) {
      return {
        status: 'missing_transcript',
        identity: canonicalIdentity,
        revision
      };
    }

    const currentRevision = this._normalizeRevisionValue(currentTranscript.revision);
    if (currentRevision == null) {
      return {
        status: 'missing_transcript_revision',
        identity: canonicalIdentity,
        revision
      };
    }

    if (currentRevision > revision) {
      return {
        status: 'stale',
        identity: canonicalIdentity,
        revision,
        currentRevision
      };
    }

    return {
      status: 'current',
      identity: canonicalIdentity,
      revision,
      currentRevision
    };
  }

  _normalizeCommittedTranslatedCaptionSegment({ captionSegment, sourceSegment, tabId }) {
    const canonicalIdentity = this._normalizeCanonicalIdentity({
      ...sourceSegment,
      tabId: sourceSegment?.tabId ?? tabId
    });
    const revision = this._normalizeRevisionValue(sourceSegment?.revision);

    if (!canonicalIdentity || revision == null) {
      return null;
    }

    return {
      ...captionSegment,
      sessionId: sourceSegment.sessionId ?? captionSegment.sessionId ?? null,
      tabId: sourceSegment.tabId ?? tabId ?? captionSegment.tabId ?? null,
      videoFingerprint: sourceSegment.videoFingerprint ?? captionSegment.videoFingerprint ?? null,
      segmentId: canonicalIdentity.segmentId,
      revision,
      sourceLanguage: captionSegment.sourceLanguage ?? sourceSegment.sourceLanguage ?? null,
      targetLanguage: captionSegment.targetLanguage ?? sourceSegment.targetLanguage ?? null,
      providerId: captionSegment.providerId ?? captionSegment.provider ?? sourceSegment.provider ?? null,
      provider: captionSegment.provider ?? sourceSegment.provider ?? null
    };
  }

  async _commitTranslatedCaptionSegment({ pageSession, tabId, sourceSegment, captionSegment }) {
    const activeVideoSession = pageSession?.activeVideoSession;
    if (!activeVideoSession || activeVideoSession.videoFingerprint !== sourceSegment.videoFingerprint) {
      return {
        status: 'missing_video_session'
      };
    }

    const canonicalState = this._getCurrentCanonicalTranscriptState(pageSession, sourceSegment, tabId);

    if (!canonicalState) {
      const committedCaptionSegment = {
        ...captionSegment
      };

      if (typeof activeVideoSession.addTranslatedCaptionSegment === 'function') {
        activeVideoSession.addTranslatedCaptionSegment(committedCaptionSegment);
      }

      if (this.cache) {
        this.cache.appendTranslatedCaptionSegment({
          ...committedCaptionSegment,
          sessionId: sourceSegment.sessionId,
          tabId,
          videoFingerprint: sourceSegment.videoFingerprint,
          isIncognito: pageSession.isIncognito
        }).catch((err) => {
          logger.warn('Failed to persist translated caption segment to cache', {
            sessionId: sourceSegment.sessionId,
            error: err.message
          });
        });
      }

      if (tabId && this.browserApi?.tabs?.sendMessage) {
        try {
          this.browserApi.tabs.sendMessage(tabId, {
            action: 'LIVE_CAPTION_TRANSLATE_RESULT',
            payload: {
              sessionId: sourceSegment.sessionId,
              videoFingerprint: sourceSegment.videoFingerprint,
              segment: committedCaptionSegment
            }
          }).catch((err) => {
            logger.debug('Failed to send translate result message to tab', { tabId, error: err.message });
          });
        } catch (err) {
          logger.debug('Synchronous error broadcasting translate result to tab', { tabId, error: err.message });
        }
      }

      return {
        status: 'committed_batch'
      };
    }

    if (canonicalState.status === 'stale') {
      return canonicalState;
    }

    if (canonicalState.status === 'missing_transcript'
      || canonicalState.status === 'missing_transcript_revision'
      || canonicalState.status === 'missing_lookup') {
      return canonicalState;
    }

    const committedCaptionSegment = this._normalizeCommittedTranslatedCaptionSegment({
      captionSegment,
      sourceSegment,
      tabId
    });

    if (!committedCaptionSegment) {
      return {
        status: 'missing_canonical_identity'
      };
    }

    if (typeof activeVideoSession.upsertTranslatedCaptionSegment === 'function') {
      activeVideoSession.upsertTranslatedCaptionSegment(committedCaptionSegment, {
        compareRevision: false
      });
    } else if (typeof activeVideoSession.addTranslatedCaptionSegment === 'function') {
      activeVideoSession.addTranslatedCaptionSegment(committedCaptionSegment);
    }

    if (this.cache?.upsertTranslatedCaptionSegmentByIdentity) {
      this.cache.upsertTranslatedCaptionSegmentByIdentity({
        ...committedCaptionSegment,
        isIncognito: pageSession.isIncognito
      }, {
        compareRevision: false
      }).catch((err) => {
        logger.warn('Failed to persist canonical translated caption segment to cache', {
          sessionId: sourceSegment.sessionId,
          error: err.message
        });
      });
    } else if (this.cache) {
      this.cache.appendTranslatedCaptionSegment({
        ...committedCaptionSegment,
        sessionId: sourceSegment.sessionId,
        tabId,
        videoFingerprint: sourceSegment.videoFingerprint,
        isIncognito: pageSession.isIncognito
      }).catch((err) => {
        logger.warn('Failed to persist translated caption segment to cache', {
          sessionId: sourceSegment.sessionId,
          error: err.message
        });
      });
    }

    if (tabId && this.browserApi?.tabs?.sendMessage) {
      try {
        this.browserApi.tabs.sendMessage(tabId, {
          action: 'LIVE_CAPTION_TRANSLATE_RESULT',
          payload: {
            sessionId: sourceSegment.sessionId,
            videoFingerprint: sourceSegment.videoFingerprint,
            segment: committedCaptionSegment
          }
        }).catch((err) => {
          logger.debug('Failed to send translate result message to tab', { tabId, error: err.message });
        });
      } catch (err) {
        logger.debug('Synchronous error broadcasting translate result to tab', { tabId, error: err.message });
      }
    }

    return {
      status: 'committed_canonical',
      identity: canonicalState.identity,
      revision: canonicalState.revision
    };
  }

  async handleTranscriptSegment(segment, { tabId } = {}) {
    let normalized;
    try {
      normalized = normalizeLiveCaptionTranscriptSegment(segment);
    } catch (validationError) {
      this.failClosed(segment?.sessionId, tabId, validationError);
      throw validationError;
    }

    const { sessionId, videoFingerprint, segmentStartMs, segmentEndMs, originalText } = normalized;
    const startMs = segmentStartMs;
    const endMs = segmentEndMs;

    // Validate page session
    const pageSession = this.sessionManager.getSession(tabId);
    if (!pageSession || pageSession.sessionId !== sessionId) {
      logger.warn('Ignoring transcript segment for inactive/invalid page session', { sessionId, tabId });
      return;
    }

    // Validate active video session
    const videoSession = pageSession.activeVideoSession;
    if (!videoSession || videoSession.videoFingerprint !== videoFingerprint) {
      logger.warn('Ignoring transcript segment for inactive/invalid video session', { sessionId, videoFingerprint });
      return;
    }

    const queue = this.getOrCreateQueue(sessionId);
    this._pruneQueuedSegments(queue, pageSession, tabId, videoFingerprint);

    const incomingQueuedState = this._normalizeQueuedCanonicalState(segment, tabId);
    if (incomingQueuedState && this._findQueuedCanonicalSegmentIndex(queue, segment, tabId) !== -1) {
      logger.debug('Dropping duplicate queued canonical transcript segment before translation', {
        sessionId,
        tabId,
        videoFingerprint,
        segmentId: incomingQueuedState.identity.segmentId,
        revision: incomingQueuedState.revision
      });
      return;
    }

    // Bounded Queue Check
    if (queue.segments.length >= this.maxPendingSegments) {
      this._dropOldestQueuedSegment(queue, {
        sessionId,
        tabId,
        videoFingerprint,
        reason: 'queue_overflow_soft_eviction'
      });
    }

    queue.segments.push(segment);
    logger.debug('Transcript segment added to translation queue', {
      sessionId,
      tabId,
      queueDepth: queue.segments.length,
      startMs,
      endMs,
      textLength: (originalText || '').length
    });

    if (!queue.processing) {
      this._processQueue(sessionId, tabId, videoFingerprint).catch((err) => {
        logger.error('Unhandled translation queue processing exception', { sessionId, error: err.message });
      });
    }
  }

  async _processQueue(sessionId, tabId, videoFingerprint) {
    const queue = this.sessionQueues.get(sessionId);
    if (!queue || queue.processing) {
      return;
    }

    queue.processing = true;

    try {
      while (queue.segments.length > 0) {
        // Re-validate session state before executing request
        const pageSession = this.sessionManager.getSession(tabId);
        if (!pageSession || pageSession.sessionId !== sessionId) {
          logger.warn('Stopping translation queue process: session is no longer active', { sessionId });
          this._clearQueue(sessionId);
          break;
        }

        const videoSession = pageSession.activeVideoSession;
        if (!videoSession || videoSession.videoFingerprint !== videoFingerprint) {
          logger.warn('Stopping translation queue process: video session is no longer active', { sessionId, videoFingerprint });
          this._clearQueue(sessionId);
          break;
        }

        this._pruneQueuedSegments(queue, pageSession, tabId, videoFingerprint);

        if (queue.segments.length === 0) {
          break;
        }

        const segment = queue.segments[0];
        const abortController = new AbortController();
        this.activeAbortControllers.set(sessionId, abortController);

        logger.debug('Starting translation dispatch for segment', {
          sessionId,
          startMs: segment.startMs,
          endMs: segment.endMs
        });

        try {
          const captionSegment = await this.translationAdapter.translateFinalizedSegment(segment, {
            signal: abortController.signal,
            sessionId,
            videoFingerprint,
            tabId
          });

          const commitResult = await this._commitTranslatedCaptionSegment({
            pageSession,
            tabId,
            sourceSegment: segment,
            captionSegment
          });

          if (commitResult.status === 'stale') {
            logger.warn('Suppressed stale canonical translated caption segment', {
              sessionId,
              tabId,
              videoFingerprint,
              segmentId: commitResult.identity?.segmentId ?? segment.segmentId ?? null,
              originatingRevision: commitResult.revision,
              currentRevision: commitResult.currentRevision
            });
          } else if (commitResult.status === 'missing_transcript'
            || commitResult.status === 'missing_transcript_revision'
            || commitResult.status === 'missing_lookup'
            || commitResult.status === 'missing_video_session') {
            logger.warn('Suppressed canonical translated caption segment because current transcript state is unavailable', {
              sessionId,
              tabId,
              videoFingerprint,
              segmentId: segment.segmentId ?? null,
              originatingRevision: segment.revision ?? null,
              status: commitResult.status
            });
          }

          logger.info(
            commitResult.status === 'committed_batch' || commitResult.status === 'committed_canonical'
              ? 'Translation segment completed and recorded'
              : 'Translation segment processed without committing translated caption output',
            {
              sessionId,
              startMs: segment.startMs,
              endMs: segment.endMs,
              provider: captionSegment.provider,
              translatedLength: (captionSegment.translatedText || '').length,
              commitStatus: commitResult.status
            }
          );

        } catch (translationError) {
          if (abortController.signal.aborted || isCancellationError(translationError)) {
            logger.debug('In-flight translation aborted cleanly', { sessionId });
            break;
          }

          this.failClosed(sessionId, tabId, translationError);
          throw translationError;
        } finally {
          this.activeAbortControllers.delete(sessionId);
        }

        // Dequeue processed segment
        queue.segments.shift();
      }
    } finally {
      if (queue) {
        queue.processing = false;
      }
    }
  }

  stopSession(sessionId) {
    this._abortInFlight(sessionId);
    this._clearQueue(sessionId);
    logger.debug('Translation Coordinator session stopped and cleaned up', { sessionId });
  }

  pauseSession(sessionId) {
    this._abortInFlight(sessionId);
    this._clearQueue(sessionId);
    logger.debug('Translation Coordinator session paused and queue cleared', { sessionId });
  }

  _abortInFlight(sessionId) {
    const controller = this.activeAbortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeAbortControllers.delete(sessionId);
      logger.debug('Aborted in-flight translation request', { sessionId });
    }
  }

  _clearQueue(sessionId) {
    const queue = this.sessionQueues.get(sessionId);
    if (queue) {
      queue.segments = [];
      queue.processing = false;
      this.sessionQueues.delete(sessionId);
    }
  }

  failClosed(sessionId, tabId, error) {
    this._abortInFlight(sessionId);
    this._clearQueue(sessionId);

    // Propagate state to session manager and capture coordinator
    const pageSession = this.sessionManager.getSession(tabId);
    if (pageSession && pageSession.sessionId === sessionId) {
      pageSession.markError(error);
    }

    if (this.captureCoordinator && this.captureCoordinator.sessionId === sessionId) {
      this.captureCoordinator.failClosed('translation_failure', error);
    }

    if (this.onError) {
      this.onError(error, { 
        sessionId, 
        tabId, 
        videoFingerprint: pageSession?.activeVideoFingerprint || this.captureCoordinator?.videoFingerprint 
      });
    }
  }

  getStatus(sessionId) {
    const queue = this.sessionQueues.get(sessionId);
    return {
      queueDepth: queue ? queue.segments.length : 0,
      processing: queue ? queue.processing : false,
      hasActiveAbortController: this.activeAbortControllers.has(sessionId)
    };
  }
}

export default LiveCaptionTranslationCoordinator;
