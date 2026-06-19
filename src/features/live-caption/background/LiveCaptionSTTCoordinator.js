import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { STTProviderFactory } from '../stt/STTProviderFactory.js';
import { STT_PROVIDER_MODES } from '../stt/liveCaptionSTTProviderContracts.js';
import { createSTTProviderError, STT_PROVIDER_ERROR_CODES } from '../stt/BaseSTTProvider.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

import { getLiveCaptionSttProviderAsync } from '@/shared/config/config.js';
import {
  LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES,
  createLiveCaptionTranscriptEvent
} from './liveCaptionTranscriptContracts.js';
import { LiveCaptionTranscriptEventCoordinator } from './LiveCaptionTranscriptEventCoordinator.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionSTTCoordinator');

/**
 * Background-side coordinator for speech-to-text execution pipeline.
 * Manages FIFO queueing, transcription bounds, abort routing, and session state mapping.
 */
export class LiveCaptionSTTCoordinator {
  constructor({
    sessionManager,
    captureCoordinator,
    cache = null,
    sttFactory = null,
    transcriptEventCoordinator = null,
    onTranscriptSegment = null,
    onError = null
  } = {}) {
    if (!sessionManager) {
      throw new TypeError('LiveCaptionSTTCoordinator requires a sessionManager');
    }
    this.sessionManager = sessionManager;
    this.captureCoordinator = captureCoordinator;
    this.cache = cache;
    this.sttFactory = sttFactory || new STTProviderFactory();
    this.transcriptEventCoordinator = transcriptEventCoordinator || new LiveCaptionTranscriptEventCoordinator();
    this.onTranscriptSegment = onTranscriptSegment;
    this.onError = onError;
    this.sessionQueues = new Map();
    this.activeAbortControllers = new Map();
    this.maxPendingChunks = 5;
  }

  getOrCreateQueue(sessionId) {
    if (!this.sessionQueues.has(sessionId)) {
      this.sessionQueues.set(sessionId, {
        chunks: [],
        processing: false,
        consecutiveLocalWhisperFailures: 0
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
      
      // Use configured provider for accurate error attribution.
      // Note: At this early stage (ingestion), we haven't fetched the provider instance yet,
      // so we rely on the global configuration from the factory.
      const providerId = this.sttFactory.getDefaultProviderId();
      const definition = this.sttFactory.getProviderDefinition(providerId);

      const error = createSTTProviderError(
        STT_PROVIDER_ERROR_CODES.INVALID_AUDIO_CHUNK,
        errorMsg,
        {
          providerId: providerId,
          providerName: definition?.displayName || providerId,
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

        let provider;
        try {
          const configuredProviderId = await getLiveCaptionSttProviderAsync();
          provider = await this.sttFactory.getProvider(configuredProviderId);
        } catch (factoryError) {
          this.failClosed(sessionId, tabId, factoryError);
          throw factoryError;
        }

        logger.debug('Starting transcription dispatch for chunk', {
          providerId: provider.providerId,
          sessionId,
          chunkStartMs: chunk.chunkStartMs,
          chunkEndMs: chunk.chunkEndMs
        });

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

          const eventStamp = Date.now();
          const eventSuffix = Math.random().toString(36).substring(2, 9);
          const segmentId = `live-caption:transcript:${eventStamp}:${eventSuffix}`;
          const eventId = `live-caption:transcript-event:${eventStamp}:${eventSuffix}`;

          const transcriptEvent = createLiveCaptionTranscriptEvent({
            eventId,
            eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
            providerId: provider.providerId,
            providerMode: STT_PROVIDER_MODES.BATCH,
            sessionId,
            tabId,
            videoFingerprint,
            segmentId,
            revision: 1,
            segmentStartMs: chunk.chunkStartMs,
            segmentEndMs: chunk.chunkEndMs,
            sourceTimelineType: 'capture',
            sourceStartMs: chunk.chunkStartMs,
            sourceEndMs: chunk.chunkEndMs,
            sourceClockId: sessionId,
            text: result?.text || '',
            sourceLanguage: result?.sourceLanguage ?? null,
            targetLanguage: result?.targetLanguage ?? null,
            confidence: result?.confidence ?? null,
            createdAt: Date.now(),
            metadata: {
              chunkStartMs: chunk.chunkStartMs,
              chunkEndMs: chunk.chunkEndMs,
              mimeType: chunk.mimeType
            }
          });

          const transcriptResult = await Promise.resolve(
            this.transcriptEventCoordinator.handleTranscriptEvent(transcriptEvent)
          );
          const normalizedTranscriptEvent = transcriptResult?.canonicalEvent
            || transcriptResult?.normalizedEvent
            || transcriptEvent;

          // Produce transcript segment
          let segment = {
            segmentId: normalizedTranscriptEvent.segmentId || segmentId,
            sessionId: normalizedTranscriptEvent.sessionId || sessionId,
            tabId: normalizedTranscriptEvent.tabId ?? tabId,
            videoFingerprint: normalizedTranscriptEvent.videoFingerprint || videoFingerprint,
            startMs: normalizedTranscriptEvent.segmentStartMs ?? chunk.chunkStartMs,
            endMs: normalizedTranscriptEvent.segmentEndMs ?? chunk.chunkEndMs,
            text: normalizedTranscriptEvent.text || '',
            providerId: normalizedTranscriptEvent.providerId || provider.providerId,
            sourceTimelineType: normalizedTranscriptEvent.sourceTimelineType ?? null,
            sourceStartMs: normalizedTranscriptEvent.sourceStartMs ?? null,
            sourceEndMs: normalizedTranscriptEvent.sourceEndMs ?? null,
            sourceClockId: normalizedTranscriptEvent.sourceClockId ?? null,
            sourceSequence: normalizedTranscriptEvent.sourceSequence ?? null,
            sourceResetId: normalizedTranscriptEvent.sourceResetId ?? null,
            projectedMediaStartMs: normalizedTranscriptEvent.projectedMediaStartMs ?? null,
            projectedMediaEndMs: normalizedTranscriptEvent.projectedMediaEndMs ?? null,
            timelineProjectionStatus: normalizedTranscriptEvent.timelineProjectionStatus ?? null,
            timelineProjectionAnchorId: normalizedTranscriptEvent.timelineProjectionAnchorId ?? null,
            timelineProjectionReason: normalizedTranscriptEvent.timelineProjectionReason ?? null,
            createdAt: normalizedTranscriptEvent.createdAt || Date.now()
          };

          // Attach to active video session state
          const activeVideoSession = pageSession.activeVideoSession;
          if (activeVideoSession && activeVideoSession.videoFingerprint === videoFingerprint) {
            const storedSegment = activeVideoSession.addTranscriptSegment(segment);
            if (storedSegment) {
              segment = storedSegment;
            }
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

          logger.info('Chunk transcription completed and recorded', {
            providerId: provider.providerId,
            sessionId,
            chunkStartMs: chunk.chunkStartMs,
            chunkEndMs: chunk.chunkEndMs,
            charCount: (segment.text || '').length
          });

          if (provider.providerId === 'local_whisper') {
            queue.consecutiveLocalWhisperFailures = 0;
          }

        } catch (transcriptionError) {
          if (abortController.signal.aborted || transcriptionError.name === 'AbortError') {
            logger.debug('In-flight transcription aborted cleanly', { sessionId });
            break;
          }

          if (provider.providerId === 'local_whisper') {
            queue.consecutiveLocalWhisperFailures = (queue.consecutiveLocalWhisperFailures || 0) + 1;
            const consecutiveFailureCount = queue.consecutiveLocalWhisperFailures;

            logger.warn('Local Whisper chunk transcription failed; skipping chunk', {
              providerId: provider.providerId,
              sessionId,
              tabId,
              videoFingerprint,
              chunkStartMs: chunk.chunkStartMs,
              chunkEndMs: chunk.chunkEndMs,
              consecutiveFailureCount
            });

            queue.chunks.shift();

            if (consecutiveFailureCount >= 3) {
              this.failClosed(sessionId, tabId, transcriptionError);
              throw transcriptionError;
            }

            continue;
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

  async stopSession(sessionId) {
    this._abortInFlight(sessionId);
    this._clearQueue(sessionId);
    logger.debug('STT Coordinator session stopped and cleaned up', { sessionId });
  }

  async pauseSession(sessionId) {
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

    if (this.onError) {
      this.onError(error, { 
        sessionId, 
        tabId, 
        videoFingerprint: pageSession?.activeVideoFingerprint || this.captureCoordinator?.videoFingerprint 
      });
    }
  }
}

export default LiveCaptionSTTCoordinator;
