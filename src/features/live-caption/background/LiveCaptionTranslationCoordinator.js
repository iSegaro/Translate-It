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

    // Bounded Queue Check
    if (queue.segments.length >= this.maxPendingSegments) {
      const errorMsg = `Translation queue overflow: pending segments count reached limit of ${this.maxPendingSegments}`;
      logger.error(errorMsg, { sessionId, tabId });
      const error = new Error(errorMsg);
      error.code = 'translation_queue_overflow';
      this.failClosed(sessionId, tabId, error);
      throw error;
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
        const segment = queue.segments[0];

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

          // Attach to active video session state
          const activeVideoSession = pageSession.activeVideoSession;
          if (activeVideoSession && activeVideoSession.videoFingerprint === videoFingerprint) {
            activeVideoSession.addTranslatedCaptionSegment(captionSegment);

            // Persist to cache
            if (this.cache) {
              this.cache.appendTranslatedCaptionSegment({
                ...captionSegment,
                sessionId,
                tabId,
                videoFingerprint,
                isIncognito: pageSession.isIncognito
              }).catch((err) => {
                logger.warn('Failed to persist translated caption segment to cache', {
                  sessionId,
                  error: err.message
                });
              });
            }

            // Broadcast translate result to the content script in the target tab
            if (tabId && this.browserApi?.tabs?.sendMessage) {
              try {
                this.browserApi.tabs.sendMessage(tabId, {
                  action: 'LIVE_CAPTION_TRANSLATE_RESULT',
                  payload: {
                    sessionId,
                    videoFingerprint,
                    segment: captionSegment
                  }
                }).catch((err) => {
                  logger.debug('Failed to send translate result message to tab', { tabId, error: err.message });
                });
              } catch (err) {
                logger.debug('Synchronous error broadcasting translate result to tab', { tabId, error: err.message });
              }
            }
          }

          logger.info('Translation segment completed and recorded', {
            sessionId,
            startMs: segment.startMs,
            endMs: segment.endMs,
            provider: captionSegment.provider,
            translatedLength: (captionSegment.translatedText || '').length
          });

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
