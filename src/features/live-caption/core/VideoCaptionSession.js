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

function normalizeCanonicalIdentity(input) {
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

function createCanonicalIdentityKey(identity) {
  if (!identity) {
    return null;
  }

  return [
    identity.sessionId,
    String(identity.tabId),
    identity.videoFingerprint,
    identity.segmentId
  ].join('::');
}

function normalizeRevisionValue(value) {
  if (value == null || value === '') {
    return null;
  }

  const revision = Number(value);
  return Number.isFinite(revision) ? revision : null;
}

function createCanonicalSegmentOperationResult({
  status,
  segment = null,
  replaced = false,
  ignored = false,
  reason = null,
  identity = null,
  index = null
} = {}) {
  return Object.freeze({
    status,
    segment: segment ? { ...segment } : null,
    replaced,
    ignored,
    reason,
    identity: identity ? { ...identity } : null,
    index
  });
}

function compareCanonicalRevision(previousSegment, nextSegment) {
  const previousRevision = normalizeRevisionValue(previousSegment?.revision);
  const nextRevision = normalizeRevisionValue(nextSegment?.revision);

  if (previousRevision == null && nextRevision == null) {
    return 0;
  }

  if (previousRevision == null) {
    return -1;
  }

  if (nextRevision == null) {
    return 1;
  }

  if (nextRevision > previousRevision) {
    return 1;
  }

  if (nextRevision < previousRevision) {
    return -1;
  }

  return 0;
}

function toNumberOrNull(value) {
  if (value == null || value === '') {
    return null;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeSegment(segment, kind, mediaAnchorMsInput = null) {
  if (!segment || typeof segment !== 'object') {
    throw new TypeError(`VideoCaptionSession.${kind} requires a segment object`);
  }

  const now = Date.now();
  liveCaptionSegmentCounter += 1;
  const normalizedSegment = { ...segment };

  const rawStart = normalizedSegment.startMs ?? normalizedSegment.segmentStartMs ?? null;
  const rawEnd = normalizedSegment.endMs ?? normalizedSegment.segmentEndMs ?? null;

  const startMs = toNumberOrNull(rawStart);
  const endMs = toNumberOrNull(rawEnd);
  const mediaAnchorMs = toNumberOrNull(mediaAnchorMsInput);

  let mediaStartMs = toNumberOrNull(normalizedSegment.mediaStartMs);
  let mediaEndMs = toNumberOrNull(normalizedSegment.mediaEndMs);

  if (mediaAnchorMs !== null) {
    if (mediaStartMs === null && startMs !== null) {
      mediaStartMs = mediaAnchorMs + startMs;
    }
    if (mediaEndMs === null && endMs !== null) {
      mediaEndMs = mediaAnchorMs + endMs;
    }
  }

  return {
    ...normalizedSegment,
    segmentId: normalizedSegment.segmentId || `live-caption:${kind}:${now.toString(36)}:${liveCaptionSegmentCounter.toString(36)}`,
    text: normalizedSegment.text ?? '',
    startMs: rawStart === null ? null : startMs,
    endMs: rawEnd === null ? null : endMs,
    mediaStartMs,
    mediaEndMs,
    sourceLanguage: normalizedSegment.sourceLanguage ?? null,
    targetLanguage: normalizedSegment.targetLanguage ?? null,
    provider: normalizedSegment.provider ?? null,
    createdAt: normalizedSegment.createdAt ?? now,
    updatedAt: now,
    providerUtteranceId: normalizedSegment.providerUtteranceId ?? null,
    providerSequence: normalizedSegment.providerSequence ?? null,
    providerRevision: normalizedSegment.providerRevision ?? null,
    providerStreamId: normalizedSegment.providerStreamId ?? null,
    providerChannel: normalizedSegment.providerChannel ?? null
  };
}

/**
 * Lightweight per-video live-caption session model.
 * Owns video fingerprint, segment accumulation, and replay metadata.
 */
export class VideoCaptionSession {
  constructor({ tabId, videoFingerprint, sessionId = createLiveCaptionSessionId('video', tabId), mediaAnchorMs = null } = {}) {
    if (tabId == null) {
      throw new TypeError('VideoCaptionSession requires a tabId');
    }

    this.tabId = tabId;
    this.sessionId = sessionId;
    this.videoFingerprint = videoFingerprint ?? null;
    this.mediaAnchorMs = mediaAnchorMs ?? null;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.lifecycleState = LIVE_CAPTION_SESSION_STATES.IDLE;
    this.chunkState = {
      activeChunkId: null,
      chunks: []
    };
    this.transcriptSegments = [];
    this.translatedCaptionSegments = [];
    this.transcriptSegmentIndexByIdentity = new Map();
    this.translatedCaptionSegmentIndexByIdentity = new Map();
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
    const normalizedChunk = normalizeSegment(chunk, 'recordChunk', this.mediaAnchorMs);
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
    const normalizedSegment = normalizeSegment(segment, 'addTranscriptSegment', this.mediaAnchorMs);
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
    const normalizedSegment = normalizeSegment(segment, 'addTranslatedCaptionSegment', this.mediaAnchorMs);
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

  rebuildCanonicalIndexes() {
    this.transcriptSegmentIndexByIdentity.clear();
    this.translatedCaptionSegmentIndexByIdentity.clear();

    const rebuildCollection = (collection, indexByIdentity) => {
      collection.forEach((segment, index) => {
        const identity = normalizeCanonicalIdentity(segment);
        if (!identity) {
          return;
        }

        const identityKey = createCanonicalIdentityKey(identity);
        const existingIndex = indexByIdentity.get(identityKey);

        if (existingIndex == null) {
          indexByIdentity.set(identityKey, index);
          return;
        }

        const existingSegment = collection[existingIndex];
        const comparison = compareCanonicalRevision(existingSegment, segment);

        if (comparison > 0 || (comparison === 0 && index > existingIndex)) {
          indexByIdentity.set(identityKey, index);
        }
      });
    };

    rebuildCollection(this.transcriptSegments, this.transcriptSegmentIndexByIdentity);
    rebuildCollection(this.translatedCaptionSegments, this.translatedCaptionSegmentIndexByIdentity);

    this.touch();

    return {
      transcriptCount: this.transcriptSegments.length,
      translatedCaptionCount: this.translatedCaptionSegments.length,
      indexedTranscriptCount: this.transcriptSegmentIndexByIdentity.size,
      indexedTranslatedCaptionCount: this.translatedCaptionSegmentIndexByIdentity.size
    };
  }

  getCanonicalSegmentIdentity(segmentOrIdentity) {
    return normalizeCanonicalIdentity(segmentOrIdentity);
  }

  _upsertCanonicalSegment({
    kind,
    collectionKey,
    segmentIndexKey,
    segment,
    compareRevision = true,
    forceReplace = false
  }) {
    const identity = normalizeCanonicalIdentity(segment);
    if (!identity) {
      return createCanonicalSegmentOperationResult({
        status: 'ignored',
        ignored: true,
        reason: 'missing_canonical_identity'
      });
    }

    const identityKey = createCanonicalIdentityKey(identity);
    const segments = this[collectionKey];
    const indexByIdentity = this[segmentIndexKey];
    const existingIndex = indexByIdentity.get(identityKey);
    const normalizedSegment = normalizeSegment(
      {
        ...segment,
        ...identity
      },
      kind,
      this.mediaAnchorMs
    );
    const incomingRevision = normalizeRevisionValue(normalizedSegment.revision);

    if (existingIndex == null) {
      if (compareRevision && incomingRevision == null) {
        return createCanonicalSegmentOperationResult({
          status: 'ignored',
          ignored: true,
          reason: 'missing_revision',
          identity
        });
      }

      const insertedIndex = segments.length;
      segments.push(normalizedSegment);
      indexByIdentity.set(identityKey, insertedIndex);
      this.touch();

      return createCanonicalSegmentOperationResult({
        status: 'inserted',
        segment: normalizedSegment,
        replaced: false,
        ignored: false,
        identity,
        index: insertedIndex
      });
    }

    const existingSegment = segments[existingIndex];
    const existingRevision = normalizeRevisionValue(existingSegment?.revision);

    if (!forceReplace && compareRevision) {
      if (incomingRevision == null) {
        return createCanonicalSegmentOperationResult({
          status: 'ignored',
          ignored: true,
          reason: 'missing_revision',
          identity,
          index: existingIndex
        });
      }

      if (existingRevision != null && incomingRevision <= existingRevision) {
        return createCanonicalSegmentOperationResult({
          status: 'ignored',
          ignored: true,
          reason: 'stale_revision',
          identity,
          index: existingIndex,
          segment: existingSegment
        });
      }
    }

    segments[existingIndex] = normalizedSegment;
    indexByIdentity.set(identityKey, existingIndex);
    this.touch();

    return createCanonicalSegmentOperationResult({
      status: 'replaced',
      segment: normalizedSegment,
      replaced: true,
      ignored: false,
      identity,
      index: existingIndex
    });
  }

  _replaceCanonicalSegment({
    kind,
    collectionKey,
    segmentIndexKey,
    identity,
    segment
  }) {
    const normalizedIdentity = normalizeCanonicalIdentity(identity);
    if (!normalizedIdentity) {
      return createCanonicalSegmentOperationResult({
        status: 'ignored',
        ignored: true,
        reason: 'missing_canonical_identity'
      });
    }

    const identityKey = createCanonicalIdentityKey(normalizedIdentity);
    const segments = this[collectionKey];
    const indexByIdentity = this[segmentIndexKey];
    const existingIndex = indexByIdentity.get(identityKey);

    if (existingIndex == null) {
      return createCanonicalSegmentOperationResult({
        status: 'ignored',
        ignored: true,
        reason: 'missing_canonical_segment',
        identity: normalizedIdentity
      });
    }

    const normalizedSegment = normalizeSegment(
      {
        ...segment,
        ...normalizedIdentity
      },
      kind,
      this.mediaAnchorMs
    );

    segments[existingIndex] = normalizedSegment;
    indexByIdentity.set(identityKey, existingIndex);
    this.touch();

    return createCanonicalSegmentOperationResult({
      status: 'replaced',
      segment: normalizedSegment,
      replaced: true,
      ignored: false,
      identity: normalizedIdentity,
      index: existingIndex
    });
  }

  _getCanonicalSegmentByIdentity({
    identity,
    collectionKey,
    segmentIndexKey
  }) {
    const normalizedIdentity = normalizeCanonicalIdentity(identity);
    if (!normalizedIdentity) {
      return null;
    }

    const identityKey = createCanonicalIdentityKey(normalizedIdentity);
    const index = this[segmentIndexKey].get(identityKey);
    if (index == null) {
      return null;
    }

    const segment = this[collectionKey][index];
    return segment ? { ...segment } : null;
  }

  upsertTranscriptSegment(segment, { compareRevision = true } = {}) {
    return this._upsertCanonicalSegment({
      kind: 'addTranscriptSegment',
      collectionKey: 'transcriptSegments',
      segmentIndexKey: 'transcriptSegmentIndexByIdentity',
      segment,
      compareRevision
    });
  }

  replaceTranscriptSegment(identity, segment) {
    return this._replaceCanonicalSegment({
      kind: 'addTranscriptSegment',
      collectionKey: 'transcriptSegments',
      segmentIndexKey: 'transcriptSegmentIndexByIdentity',
      identity,
      segment
    });
  }

  getTranscriptSegmentByIdentity(identity) {
    return this._getCanonicalSegmentByIdentity({
      identity,
      collectionKey: 'transcriptSegments',
      segmentIndexKey: 'transcriptSegmentIndexByIdentity'
    });
  }

  upsertTranslatedCaptionSegment(segment, { compareRevision = true } = {}) {
    return this._upsertCanonicalSegment({
      kind: 'addTranslatedCaptionSegment',
      collectionKey: 'translatedCaptionSegments',
      segmentIndexKey: 'translatedCaptionSegmentIndexByIdentity',
      segment,
      compareRevision
    });
  }

  replaceTranslatedCaptionSegment(identity, segment) {
    return this._replaceCanonicalSegment({
      kind: 'addTranslatedCaptionSegment',
      collectionKey: 'translatedCaptionSegments',
      segmentIndexKey: 'translatedCaptionSegmentIndexByIdentity',
      identity,
      segment
    });
  }

  getTranslatedCaptionSegmentByIdentity(identity) {
    return this._getCanonicalSegmentByIdentity({
      identity,
      collectionKey: 'translatedCaptionSegments',
      segmentIndexKey: 'translatedCaptionSegmentIndexByIdentity'
    });
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

  getCleanupSnapshot() {
    return this.toSnapshot();
  }
}

export default VideoCaptionSession;
