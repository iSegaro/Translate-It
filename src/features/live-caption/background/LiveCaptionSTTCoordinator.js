import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { STTProviderFactory } from '../stt/STTProviderFactory.js';
import { createSTTProviderError, STT_PROVIDER_ERROR_CODES } from '../stt/BaseSTTProvider.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionSTTCoordinator');

/**
 * Background-side coordinator for speech-to-text execution pipeline.
 * Manages FIFO queueing, transcription bounds, abort routing, and session state mapping.
 */
export class LiveCaptionSTTCoordinator {
  constructor({ sessionManager, captureCoordinator, cache = null, sttFactory = null, onTranscriptSegment = null } = {}) {
    if (!sessionManager) {
      throw new TypeError('LiveCaptionSTTCoordinator requires a sessionManager');
    }
    this.sessionManager = sessionManager;
    this.captureCoordinator = captureCoordinator;
    this.cache = cache;
    this.sttFactory = sttFactory || new STTProviderFactory();
    this.onTranscriptSegment = onTranscriptSegment;
    this.sessionQueues = new Map();
    this.activeAbortControllers = new Map();
    this.maxPendingChunks = 5;
  }

  getOrCreateQueue(sessionId) {
    if (!this.sessionQueues.has(sessionId)) {
      this.sessionQueues.set(sessionId, {
        chunks: [],
        processing: false
      });
    }
    return this.sessionQueues.get(sessionId);
  }

  async handleFinalizedChunk(chunk) {
    const { sessionId, tabId, videoFingerprint, chunkStartMs, chunkEndMs } = chunk;

    // Reconcile and validate session state
    const pageSession = this.sessionManager.getSession(tabId);
    if (!pageSession || pageSession.sessionId !== sessionId) {
      logger.warn('Ignoring chunk for inactive/invalid page session', { sessionId, tabId });
      return;
    }

    const videoSession = pageSession.activeVideoSession;
    if (!videoSession || videoSession.videoFingerprint !== videoFingerprint) {
      logger.warn('Ignoring chunk for inactive/invalid video session', { sessionId, videoFingerprint });
      return;
    }

    const queue = this.getOrCreateQueue(sessionId);

    // Bounded Queue Check
    if (queue.chunks.length >= this.maxPendingChunks) {
      const errorMsg = `Queue overflow: pending chunks count reached limit of ${this.maxPendingChunks}`;
      logger.error(errorMsg, { sessionId, tabId });
      
      const error = createSTTProviderError(
        STT_PROVIDER_ERROR_CODES.INVALID_AUDIO_CHUNK,
        errorMsg,
        {
          providerId: 'openai_whisper',
          providerName: 'OpenAI Whisper',
          stage: 'transcription',
          type: ErrorTypes.API_RESPONSE_INVALID,
          retryable: false
        }
      );

      this.failClosed(sessionId, tabId, error);
      throw error;
    }

    queue.chunks.push(chunk);
    logger.debug('Chunk added to STT queue', {
      sessionId,
      tabId,
      queueDepth: queue.chunks.length,
      chunkStartMs,
      chunkEndMs
    });

    if (!queue.processing) {
      this._processQueue(sessionId, tabId, videoFingerprint).catch((err) => {
        logger.error('Unhandled queue processing exception', { sessionId, error: err.message });
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
      while (queue.chunks.length > 0) {
        const chunk = queue.chunks[0];
        
        // Re-validate session state before executing request
        const pageSession = this.sessionManager.getSession(tabId);
        if (!pageSession || pageSession.sessionId !== sessionId) {
          logger.warn('Stopping queue process: session is no longer active', { sessionId });
          this._clearQueue(sessionId);
          break;
        }

        const abortController = new AbortController();
        this.activeAbortControllers.set(sessionId, abortController);

        logger.debug('Starting Whisper dispatch for chunk', {
          sessionId,
          chunkStartMs: chunk.chunkStartMs,
          chunkEndMs: chunk.chunkEndMs
        });

        let provider;
        try {
          provider = await this.sttFactory.getProvider();
        } catch (factoryError) {
          this.failClosed(sessionId, tabId, factoryError);
          throw factoryError;
        }

        try {
          const result = await provider.transcribeChunk(chunk.chunkPayload, {
            signal: abortController.signal,
            sessionId,
            tabId,
            videoFingerprint,
            chunkStartMs: chunk.chunkStartMs,
            chunkEndMs: chunk.chunkEndMs,
            mimeType: chunk.mimeType
          });

          // Produce transcript segment
          const segment = {
            segmentId: `live-caption:transcript:${Date.now()}:${Math.random().toString(36).substring(2, 9)}`,
            sessionId,
            tabId,
            videoFingerprint,
            startMs: chunk.chunkStartMs,
            endMs: chunk.chunkEndMs,
            text: result?.text || '',
            providerId: provider.providerId,
            createdAt: Date.now()
          };

          // Attach to active video session state
          const activeVideoSession = pageSession.activeVideoSession;
          if (activeVideoSession && activeVideoSession.videoFingerprint === videoFingerprint) {
            activeVideoSession.addTranscriptSegment(segment);
          }

          // Persist to cache
          if (this.cache) {
            this.cache.appendTranscriptSegment({
              ...segment,
              segmentStartMs: segment.startMs,
              segmentEndMs: segment.endMs,
              originalText: segment.text,
              isIncognito: pageSession.isIncognito
            }).catch((err) => {
              logger.warn('Failed to persist transcript segment to cache', {
                sessionId,
                error: err.message
              });
            });
          }

          if (this.onTranscriptSegment) {
            this.onTranscriptSegment(segment, { tabId }).catch((err) => {
              logger.error('Error invoking onTranscriptSegment callback', { sessionId, error: err.message });
            });
          }

          logger.info('Whisper chunk transcription completed and recorded', {
            sessionId,
            chunkStartMs: chunk.chunkStartMs,
            chunkEndMs: chunk.chunkEndMs,
            charCount: (segment.text || '').length
          });

        } catch (transcriptionError) {
          if (abortController.signal.aborted || transcriptionError.name === 'AbortError') {
            logger.debug('In-flight transcription aborted cleanly', { sessionId });
            break;
          }

          this.failClosed(sessionId, tabId, transcriptionError);
          throw transcriptionError;
        } finally {
          this.activeAbortControllers.delete(sessionId);
        }

        // Dequeue processed chunk
        queue.chunks.shift();
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
    logger.debug('STT Coordinator session stopped and cleaned up', { sessionId });
  }

  pauseSession(sessionId) {
    this._abortInFlight(sessionId);
    this._clearQueue(sessionId);
    logger.debug('STT Coordinator session paused and queue cleared', { sessionId });
  }

  _abortInFlight(sessionId) {
    const controller = this.activeAbortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeAbortControllers.delete(sessionId);
      logger.debug('Aborted in-flight STT request', { sessionId });
    }
  }

  _clearQueue(sessionId) {
    const queue = this.sessionQueues.get(sessionId);
    if (queue) {
      queue.chunks = [];
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
      this.captureCoordinator.failClosed('stt_transcription_failure', error);
    }
  }
}

export default LiveCaptionSTTCoordinator;
