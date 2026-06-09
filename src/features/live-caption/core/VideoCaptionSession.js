import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import {
  LIVE_CAPTION_CLEANUP_REASONS,
  createLiveCaptionErrorState,
  createLiveCaptionSessionId,
  createVideoCaptionSessionSnapshot
} from './contracts.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'VideoCaptionSession');

let liveCaptionSegmentCounter = 0;

function normalizeSegment(segment, kind) {
  if (!segment || typeof segment !== 'object') {
    throw new TypeError(`VideoCaptionSession.${kind} requires a segment object`);
  }

  const now = Date.now();
  liveCaptionSegmentCounter += 1;
  const normalizedSegment = { ...segment };

  return {
    ...normalizedSegment,
    segmentId: normalizedSegment.segmentId || `live-caption:${kind}:${now.toString(36)}:${liveCaptionSegmentCounter.toString(36)}`,
    text: normalizedSegment.text ?? '',
    startMs: normalizedSegment.startMs ?? null,
    endMs: normalizedSegment.endMs ?? null,
    sourceLanguage: normalizedSegment.sourceLanguage ?? null,
    targetLanguage: normalizedSegment.targetLanguage ?? null,
    provider: normalizedSegment.provider ?? null,
    createdAt: normalizedSegment.createdAt ?? now,
    updatedAt: now
  };
}

/**
 * Lightweight per-video live-caption session model.
 * Owns video fingerprint, segment accumulation, and replay metadata.
 */
export class VideoCaptionSession {
  constructor({ tabId, videoFingerprint, sessionId = createLiveCaptionSessionId('video', tabId) } = {}) {
    if (tabId == null) {
      throw new TypeError('VideoCaptionSession requires a tabId');
    }

    this.tabId = tabId;
    this.sessionId = sessionId;
    this.videoFingerprint = videoFingerprint ?? null;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.lifecycleState = LIVE_CAPTION_SESSION_STATES.IDLE;
    this.chunkState = {
      activeChunkId: null,
      chunks: []
    };
    this.transcriptSegments = [];
    this.translatedCaptionSegments = [];
    this.seekState = null;
    this.lastError = null;
    this.lastCleanupReason = null;

    logger.info('Video session created', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      videoFingerprint: this.videoFingerprint
    });
  }

  touch() {
    this.updatedAt = Date.now();
  }

  setVideoFingerprint(videoFingerprint) {
    this.videoFingerprint = videoFingerprint ?? null;
    this.touch();

    logger.debug('Video fingerprint updated', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      videoFingerprint: this.videoFingerprint
    });

    return this.videoFingerprint;
  }

  start() {
    this.lifecycleState = LIVE_CAPTION_SESSION_STATES.ACTIVE;
    this.touch();

    logger.info('Video session started', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      videoFingerprint: this.videoFingerprint
    });

    return this.lifecycleState;
  }

  stop(reason = LIVE_CAPTION_CLEANUP_REASONS.STOP) {
    this.lifecycleState = LIVE_CAPTION_SESSION_STATES.IDLE;
    this.lastCleanupReason = reason;
    this.touch();

    logger.info('Video session stopped', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      reason,
      videoFingerprint: this.videoFingerprint
    });

    return this.lifecycleState;
  }

  markError(error, reason = LIVE_CAPTION_CLEANUP_REASONS.ERROR) {
    this.lastError = createLiveCaptionErrorState(error, reason);
    this.lifecycleState = LIVE_CAPTION_SESSION_STATES.ERROR;
    this.touch();

    logger.warn('Video session error', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      reason,
      error: this.lastError
    });

    return this.lastError;
  }

  recordChunk(chunk) {
    const normalizedChunk = normalizeSegment(chunk, 'recordChunk');
    this.chunkState.activeChunkId = normalizedChunk.segmentId;
    this.chunkState.chunks = [...this.chunkState.chunks, normalizedChunk];
    this.touch();

    logger.debug('Chunk recorded', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      videoFingerprint: this.videoFingerprint,
      chunkCount: this.chunkState.chunks.length
    });

    return normalizedChunk;
  }

  clearActiveChunk() {
    this.chunkState.activeChunkId = null;
    this.touch();
    return this.chunkState.activeChunkId;
  }

  addTranscriptSegment(segment) {
    const normalizedSegment = normalizeSegment(segment, 'addTranscriptSegment');
    this.transcriptSegments = [...this.transcriptSegments, normalizedSegment];
    this.touch();

    logger.debug('Transcript segment accumulated', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      videoFingerprint: this.videoFingerprint,
      transcriptSegmentCount: this.transcriptSegments.length
    });

    return normalizedSegment;
  }

  addTranslatedCaptionSegment(segment) {
    const normalizedSegment = normalizeSegment(segment, 'addTranslatedCaptionSegment');
    this.translatedCaptionSegments = [...this.translatedCaptionSegments, normalizedSegment];
    this.touch();

    logger.debug('Translated caption segment accumulated', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      videoFingerprint: this.videoFingerprint,
      translatedCaptionSegmentCount: this.translatedCaptionSegments.length
    });

    return normalizedSegment;
  }

  setSeekState(seekState) {
    if (!seekState || typeof seekState !== 'object') {
      this.seekState = null;
      this.touch();
      return this.seekState;
    }

    this.seekState = {
      seekToMs: seekState.seekToMs ?? null,
      direction: seekState.direction ?? null,
      source: seekState.source ?? null,
      at: seekState.at ?? Date.now()
    };
    this.touch();

    logger.debug('Seek state updated', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      videoFingerprint: this.videoFingerprint,
      seekState: this.seekState
    });

    return this.seekState;
  }

  clearSeekState() {
    this.seekState = null;
    this.touch();
    return this.seekState;
  }

  cleanup(reason = LIVE_CAPTION_CLEANUP_REASONS.STOP) {
    const snapshot = this.toSnapshot();

    this.stop(reason);
    this.lastCleanupReason = reason;
    this.clearActiveChunk();
    this.clearSeekState();
    this.lastError = null;
    this.touch();

    logger.info('Video session cleaned up', {
      tabId: this.tabId,
      sessionId: this.sessionId,
      reason,
      videoFingerprint: this.videoFingerprint
    });

    return snapshot;
  }

  getStatus() {
    return {
      tabId: this.tabId,
      sessionId: this.sessionId,
      videoFingerprint: this.videoFingerprint,
      lifecycleState: this.lifecycleState,
      chunkCount: this.chunkState.chunks.length,
      transcriptSegmentCount: this.transcriptSegments.length,
      translatedCaptionSegmentCount: this.translatedCaptionSegments.length,
      hasSeekState: Boolean(this.seekState),
      lastError: this.lastError ? { ...this.lastError } : null,
      lastCleanupReason: this.lastCleanupReason ?? null,
      updatedAt: this.updatedAt
    };
  }

  toSnapshot() {
    return createVideoCaptionSessionSnapshot(this);
  }

  getSnapshot() {
    return this.toSnapshot();
  }
}

export default VideoCaptionSession;
