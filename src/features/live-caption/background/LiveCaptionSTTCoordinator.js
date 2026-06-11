import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { STTProviderFactory } from '../stt/STTProviderFactory.js';
import { createSTTProviderError, STT_PROVIDER_ERROR_CODES } from '../stt/BaseSTTProvider.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { STT_PROVIDER_MODES } from '../stt/STTProviderManifest.js';

import { getLiveCaptionSttProviderAsync } from '@/shared/config/config.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionSTTCoordinator');

/**
 * Background-side coordinator for speech-to-text execution pipeline.
 * Manages FIFO queueing, transcription bounds, abort routing, and session state mapping.
 */
export class LiveCaptionSTTCoordinator {
  constructor({ sessionManager, captureCoordinator, cache = null, sttFactory = null, onTranscriptSegment = null, onError = null } = {}) {
    if (!sessionManager) {
      throw new TypeError('LiveCaptionSTTCoordinator requires a sessionManager');
    }
    this.sessionManager = sessionManager;
    this.captureCoordinator = captureCoordinator;
    this.cache = cache;
    this.sttFactory = sttFactory || new STTProviderFactory();
    this.onTranscriptSegment = onTranscriptSegment;
    this.onError = onError;
    this.sessionQueues = new Map();
    this.activeAbortControllers = new Map();
    this.sessionProviders = new Map();
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

  _getSessionProviderEntry(sessionId) {
    return this.sessionProviders.get(sessionId) ?? null;
  }

  async _removeSessionProvider(sessionId, action = 'stop') {
    const entry = this.sessionProviders.get(sessionId);
    if (!entry) {
      return null;
    }

    this.sessionProviders.delete(sessionId);

    try {
      const lifecycleMethod = action === 'abort'
        ? 'abortSession'
        : (entry.paused ? null : 'stopSession');

      if (entry.provider && lifecycleMethod && typeof entry.provider[lifecycleMethod] === 'function') {
        await entry.provider[lifecycleMethod]({
          sessionId: entry.sessionId,
          tabId: entry.tabId,
          videoFingerprint: entry.videoFingerprint,
          reason: action
        });
      }
    } catch (error) {
      logger.warn('Failed to clean up browser speech session provider', {
        sessionId,
        providerId: entry.providerId,
        action,
        error: error.message
      });
    }

    if (entry.provider && typeof entry.provider.dispose === 'function' && action === 'stop') {
      try {
        await entry.provider.dispose();
      } catch (error) {
        logger.warn('Failed to dispose browser speech session provider', {
          sessionId,
          providerId: entry.providerId,
          error: error.message
        });
      }
    }

    return entry;
  }

  async startSession(sessionId, context = {}) {
    const tabId = context.tabId ?? null;
    const pageSession = tabId != null ? this.sessionManager.getSession(tabId) : null;
    if (!pageSession || pageSession.sessionId !== sessionId) {
      logger.debug('Skipping STT session start for inactive page session', { sessionId, tabId });
      return null;
    }

    const providerId = context.providerId ?? await getLiveCaptionSttProviderAsync();
    const definition = this.sttFactory.getProviderDefinition(providerId);
    if (!definition) {
      return null;
    }

    if (definition.mode !== STT_PROVIDER_MODES.SESSION) {
      await this._removeSessionProvider(sessionId, 'stop');
      return null;
    }

    const existingEntry = this._getSessionProviderEntry(sessionId);
    if (existingEntry?.providerId === providerId && existingEntry.provider?.state === 'transcribing') {
      return existingEntry.provider.getStatus();
    }

    if (existingEntry && existingEntry.providerId !== providerId) {
      await this._removeSessionProvider(sessionId, 'stop');
    }

    const provider = existingEntry?.providerId === providerId
      ? existingEntry.provider
      : await this.sttFactory.getProvider(providerId, { memoize: false });
    if (typeof provider.startSession !== 'function') {
      throw createSTTProviderError(
        STT_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND,
        `STT provider '${providerId}' does not support session mode`,
        {
          providerId,
          providerName: definition.displayName,
          stage: 'startup',
          retryable: false,
          type: ErrorTypes.API_CONFIG_INVALID
        }
      );
    }

    const entry = {
      provider,
      providerId,
      sessionId,
      tabId,
      videoFingerprint: context.videoFingerprint ?? pageSession.activeVideoFingerprint ?? null,
      startedAt: Date.now(),
      lastSegmentEndMs: 0,
      paused: false
    };

    this.sessionProviders.set(sessionId, entry);

    try {
      const status = await provider.startSession({
        sessionId,
        tabId,
        videoFingerprint: entry.videoFingerprint,
        language: context.language ?? context.lang ?? null,
        onTranscriptResult: (result, providerContext) => this._handleSessionTranscriptResult(sessionId, result, providerContext),
        onError: (error, providerContext) => this.failClosed(sessionId, tabId, error, providerContext),
        onStatusChange: (statusSnapshot) => {
          logger.debug('Browser speech STT session status updated', {
            sessionId,
            providerId,
            state: statusSnapshot?.state ?? null,
            ready: statusSnapshot?.ready ?? null
          });
        }
      });

      entry.lastStartedStatus = status;
      logger.info('Browser speech STT session started', {
        sessionId,
        tabId,
        providerId
      });
      return status;
    } catch (error) {
      this.sessionProviders.delete(sessionId);
      throw error;
    }
  }

  async _handleSessionTranscriptResult(sessionId, result, providerContext = {}) {
    const entry = this._getSessionProviderEntry(sessionId);
    if (!entry) {
      return;
    }

    const tabId = providerContext?.tabId ?? entry.tabId;
    const videoFingerprint = providerContext?.videoFingerprint ?? entry.videoFingerprint;
    const pageSession = this.sessionManager.getSession(tabId);
    if (!pageSession || pageSession.sessionId !== sessionId) {
      logger.warn('Ignoring browser speech transcript for inactive page session', {
        sessionId,
        tabId
      });
      return;
    }

    const activeVideoSession = pageSession.activeVideoSession;
    if (!activeVideoSession || activeVideoSession.videoFingerprint !== videoFingerprint) {
      logger.warn('Ignoring browser speech transcript for inactive video session', {
        sessionId,
        videoFingerprint
      });
      return;
    }

    const startMs = Number(result?.segmentStartMs ?? result?.startTime ?? entry.lastSegmentEndMs ?? 0);
    const endMsCandidate = Number(result?.segmentEndMs ?? result?.endTime ?? startMs);
    const endMs = Number.isFinite(endMsCandidate) && endMsCandidate >= startMs ? endMsCandidate : startMs;
    entry.lastSegmentEndMs = endMs;

    const segment = {
      segmentId: `live-caption:browser-speech:${sessionId}:${startMs}:${endMs}:${Date.now()}`,
      sessionId,
      tabId,
      videoFingerprint,
      startMs,
      endMs,
      text: result?.text ?? '',
      providerId: entry.providerId,
      provider: entry.providerId,
      sourceLanguage: result?.detectedLanguage ?? null,
      isFinal: true,
      createdAt: Date.now()
    };

    activeVideoSession.addTranscriptSegment(segment);

    if (this.cache) {
      this.cache.appendTranscriptSegment({
        ...segment,
        segmentStartMs: startMs,
        segmentEndMs: endMs,
        originalText: segment.text,
        isIncognito: pageSession.isIncognito
      }).catch((error) => {
        logger.warn('Failed to persist browser speech transcript to cache', {
          sessionId,
          error: error.message
        });
      });
    }

    if (this.onTranscriptSegment) {
      this.onTranscriptSegment(segment, { tabId }).catch((error) => {
        logger.error('Error invoking browser speech transcript callback', {
          sessionId,
          error: error.message
        });
      });
    }

    logger.info('Browser speech transcript recorded', {
      providerId: entry.providerId,
      sessionId,
      tabId,
      charCount: (segment.text || '').length,
      segmentStartMs: startMs,
      segmentEndMs: endMs
    });
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

    if (this.sessionProviders.has(sessionId)) {
      logger.debug('Skipping batch chunk because browser speech session provider is active', {
        sessionId,
        tabId,
        videoFingerprint
      });
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

          logger.info('Chunk transcription completed and recorded', {
            providerId: provider.providerId,
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

  async stopSession(sessionId) {
    await this._removeSessionProvider(sessionId, 'stop');
    this._abortInFlight(sessionId);
    this._clearQueue(sessionId);
    logger.debug('STT Coordinator session stopped and cleaned up', { sessionId });
  }

  async pauseSession(sessionId) {
    const entry = this._getSessionProviderEntry(sessionId);
    if (entry) {
      try {
        if (typeof entry.provider.abortSession === 'function') {
          await entry.provider.abortSession({
            sessionId: entry.sessionId,
            tabId: entry.tabId,
            videoFingerprint: entry.videoFingerprint,
            reason: 'pause'
          });
        } else if (typeof entry.provider.stopSession === 'function') {
          await entry.provider.stopSession({
            sessionId: entry.sessionId,
            tabId: entry.tabId,
            videoFingerprint: entry.videoFingerprint,
            reason: 'pause'
          });
        }
        entry.paused = true;
      } catch (error) {
        logger.warn('Failed to pause browser speech session provider', {
          sessionId,
          providerId: entry.providerId,
          error: error.message
        });
      }
    }

    this._abortInFlight(sessionId);
    this._clearQueue(sessionId);
    logger.debug('STT Coordinator session paused and queue cleared', { sessionId });
  }

  async abortSession(sessionId) {
    await this._removeSessionProvider(sessionId, 'abort');
    this._abortInFlight(sessionId);
    this._clearQueue(sessionId);
    logger.debug('STT Coordinator session aborted and cleaned up', { sessionId });
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
    this._removeSessionProvider(sessionId, 'abort').catch(() => {});
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
