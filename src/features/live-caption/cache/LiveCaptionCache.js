import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LIVE_CAPTION_DEFAULTS } from '../constants/liveCaptionDefaults.js';
import { createLiveCaptionSessionCacheKey } from './LiveCaptionCacheKeys.js';
import {
  LIVE_CAPTION_CACHE_DB_NAME,
  LIVE_CAPTION_CACHE_DB_VERSION,
  LIVE_CAPTION_CACHE_STORE_NAMES,
  createLiveCaptionCacheUnavailableError,
  openLiveCaptionCacheDatabase
} from './LiveCaptionCacheSchema.js';
import {
  LiveCaptionTranscriptRepository,
  normalizeLiveCaptionTranscriptSegment
} from './LiveCaptionTranscriptRepository.js';
import {
  LiveCaptionTranslationRepository,
  normalizeLiveCaptionTranslationSegment
} from './LiveCaptionTranslationRepository.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionCache');

function cloneSegment(segment) {
  return {
    ...segment,
    segmentTiming: Array.isArray(segment.segmentTiming) ? [...segment.segmentTiming] : [segment.segmentStartMs, segment.segmentEndMs]
  };
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function estimateBytes(value) {
  return JSON.stringify(value).length;
}

function normalizeCountLimit(value, fallback) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue > 0 ? Math.floor(nextValue) : fallback;
}

function normalizeByteLimit(value, fallback) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue > 0 ? Math.floor(nextValue) : fallback;
}

function createBucketMeta({ tabId, videoFingerprint, isIncognito = false }) {
  return {
    sessionKey: createLiveCaptionSessionCacheKey(tabId, videoFingerprint),
    tabId,
    videoFingerprint,
    isIncognito,
    transcripts: [],
    translations: [],
    transcriptBytes: 0,
    translationBytes: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function totalBucketBytes(bucket) {
  return bucket.transcriptBytes + bucket.translationBytes;
}

function totalBucketItems(bucket) {
  return bucket.transcripts.length + bucket.translations.length;
}

function recordToMemoryEntry(record) {
  const bytes = estimateBytes(record);
  return {
    record: cloneSegment(record),
    bytes
  };
}

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

function createCanonicalTranscriptEntryKey(identity) {
  return [
    'live-caption',
    'canonical-transcript',
    `session:${encodeURIComponent(identity.sessionId)}`,
    `tab:${encodeURIComponent(String(identity.tabId))}`,
    `video:${encodeURIComponent(identity.videoFingerprint)}`,
    `segment:${encodeURIComponent(identity.segmentId)}`
  ].join('|');
}

function createCanonicalTranslationEntryKey(identity) {
  return [
    'live-caption',
    'canonical-translation',
    `session:${encodeURIComponent(identity.sessionId)}`,
    `tab:${encodeURIComponent(String(identity.tabId))}`,
    `video:${encodeURIComponent(identity.videoFingerprint)}`,
    `segment:${encodeURIComponent(identity.segmentId)}`
  ].join('|');
}

function createCanonicalTranslationQualifiedEntryKey(identity, targetLanguage, providerId) {
  return `${createCanonicalTranslationEntryKey(identity)}|target:${encodeURIComponent(String(targetLanguage))}|provider:${encodeURIComponent(String(providerId))}`;
}

function normalizeTranslationCanonicalIdentity(input) {
  const identity = normalizeCanonicalIdentity(input);
  if (!identity) {
    return null;
  }

  const targetLanguage = typeof input.targetLanguage === 'string' && input.targetLanguage.trim().length > 0
    ? input.targetLanguage.trim()
    : null;
  const providerId = typeof input.providerId === 'string' && input.providerId.trim().length > 0
    ? input.providerId.trim()
    : (typeof input.provider === 'string' && input.provider.trim().length > 0 ? input.provider.trim() : null);

  if (!targetLanguage || !providerId) {
    return null;
  }

  return {
    ...identity,
    targetLanguage,
    providerId
  };
}

function normalizeRevisionValue(value) {
  if (value == null || value === '') {
    return null;
  }

  const revision = Number(value);
  return Number.isFinite(revision) ? revision : null;
}

function compareCanonicalRevision(existingRecord, nextRecord) {
  const existingRevision = normalizeRevisionValue(existingRecord?.revision);
  const nextRevision = normalizeRevisionValue(nextRecord?.revision);

  if (existingRevision == null && nextRevision == null) {
    return 0;
  }

  if (existingRevision == null) {
    return -1;
  }

  if (nextRevision == null) {
    return 1;
  }

  if (nextRevision > existingRevision) {
    return 1;
  }

  if (nextRevision < existingRevision) {
    return -1;
  }

  return 0;
}

function createCanonicalOperationResult({
  status,
  replaced = false,
  ignored = false,
  reason = null,
  record = null
} = {}) {
  return {
    status,
    replaced,
    ignored,
    reason,
    record: record ? cloneSegment(record) : null
  };
}

function canonicalTranscriptIdentityMatches(record, identity) {
  return record?.sessionId === identity.sessionId
    && Number(record?.tabId) === identity.tabId
    && record?.videoFingerprint === identity.videoFingerprint
    && record?.segmentId === identity.segmentId;
}

function canonicalTranslationIdentityMatches(record, identity) {
  return canonicalTranscriptIdentityMatches(record, identity)
    && record?.targetLanguage === identity.targetLanguage
    && (record?.providerId ?? record?.provider ?? null) === identity.providerId;
}

function findBestCanonicalEntryIndex(entries, identity, matcher) {
  let bestIndex = null;

  entries.forEach((entry, index) => {
    const record = entry?.record;
    if (!record || !matcher(record, identity)) {
      return;
    }

    if (bestIndex == null) {
      bestIndex = index;
      return;
    }

    const comparison = compareCanonicalRevision(entries[bestIndex].record, record);
    if (comparison > 0 || (comparison === 0 && index > bestIndex)) {
      bestIndex = index;
    }
  });

  return bestIndex;
}

function replaceBucketEntry(bucket, collectionKey, index, record) {
  const entries = bucket[collectionKey];
  const previousEntry = entries[index] ?? null;
  const nextEntry = recordToMemoryEntry(record);

  if (previousEntry) {
    const byteDelta = nextEntry.bytes - previousEntry.bytes;
    if (collectionKey === 'transcripts') {
      bucket.transcriptBytes += byteDelta;
    } else {
      bucket.translationBytes += byteDelta;
    }
  } else if (collectionKey === 'transcripts') {
    bucket.transcriptBytes += nextEntry.bytes;
  } else {
    bucket.translationBytes += nextEntry.bytes;
  }

  entries[index] = nextEntry;
  return nextEntry;
}

function upsertBucketEntry(bucket, collectionKey, identity, record, { compareRevision = true, matcher }) {
  const entries = bucket[collectionKey];
  const existingIndex = findBestCanonicalEntryIndex(entries, identity, matcher);

  if (existingIndex == null) {
    const nextEntry = recordToMemoryEntry(record);
    entries.push(nextEntry);
    if (collectionKey === 'transcripts') {
      bucket.transcriptBytes += nextEntry.bytes;
    } else {
      bucket.translationBytes += nextEntry.bytes;
    }
    return {
      status: 'inserted',
      replaced: false,
      ignored: false,
      reason: null,
      record: nextEntry.record
    };
  }

  if (compareRevision) {
    const existingRecord = entries[existingIndex].record;
    const incomingRevision = normalizeRevisionValue(record.revision);
    const existingRevision = normalizeRevisionValue(existingRecord.revision);

    if (incomingRevision == null) {
      return {
        status: 'ignored',
        replaced: false,
        ignored: true,
        reason: 'missing_revision',
        record: cloneSegment(existingRecord)
      };
    }

    if (existingRevision != null && incomingRevision <= existingRevision) {
      return {
        status: 'ignored',
        replaced: false,
        ignored: true,
        reason: 'stale_revision',
        record: cloneSegment(existingRecord)
      };
    }
  }

  const nextEntry = replaceBucketEntry(bucket, collectionKey, existingIndex, record);
  return {
    status: 'replaced',
    replaced: true,
    ignored: false,
    reason: null,
    record: nextEntry.record
  };
}

function selectOldestEntry(bucket) {
  const transcriptEntry = bucket.transcripts[0] || null;
  const translationEntry = bucket.translations[0] || null;

  if (!transcriptEntry && !translationEntry) {
    return null;
  }

  if (!transcriptEntry) {
    return { kind: 'translation', entry: translationEntry };
  }

  if (!translationEntry) {
    return { kind: 'transcript', entry: transcriptEntry };
  }

  const transcriptCreatedAt = transcriptEntry.record.createdAt ?? 0;
  const translationCreatedAt = translationEntry.record.createdAt ?? 0;

  if (transcriptCreatedAt <= translationCreatedAt) {
    return { kind: 'transcript', entry: transcriptEntry };
  }

  return { kind: 'translation', entry: translationEntry };
}

function trimBucket(bucket, maxItems, maxBytes) {
  while (totalBucketItems(bucket) > maxItems || totalBucketBytes(bucket) > maxBytes) {
    const oldest = selectOldestEntry(bucket);
    if (!oldest) {
      break;
    }

    if (oldest.kind === 'transcript') {
      const [removed] = bucket.transcripts.splice(0, 1);
      bucket.transcriptBytes -= removed.bytes;
    } else {
      const [removed] = bucket.translations.splice(0, 1);
      bucket.translationBytes -= removed.bytes;
    }
  }

  bucket.updatedAt = Date.now();
  return bucket;
}

function cloneBucket(bucket) {
  if (!bucket) {
    return null;
  }

  return {
    sessionKey: bucket.sessionKey,
    tabId: bucket.tabId,
    videoFingerprint: bucket.videoFingerprint,
    transcripts: bucket.transcripts.map(({ record }) => cloneSegment(record)),
    translations: bucket.translations.map(({ record }) => cloneSegment(record)),
    transcriptBytes: bucket.transcriptBytes,
    translationBytes: bucket.translationBytes,
    createdAt: bucket.createdAt,
    updatedAt: bucket.updatedAt
  };
}

function validateSegmentContext(segment, kind) {
  if (!segment || typeof segment !== 'object') {
    throw new Error(`${kind} segment must be an object`);
  }

  if (!hasValue(segment.tabId) || !hasValue(segment.videoFingerprint) || !hasValue(segment.sessionId)) {
    throw new Error(`${kind} segment requires tabId, videoFingerprint, and sessionId`);
  }

  if (!hasValue(segment.segmentStartMs) || !hasValue(segment.segmentEndMs)) {
    throw new Error(`${kind} segment requires segment timing`);
  }
}

function createSessionIndexRecord(bucket) {
  return {
    sessionKey: bucket.sessionKey,
    tabId: bucket.tabId,
    sessionId: bucket.sessionId ?? null,
    videoFingerprint: bucket.videoFingerprint,
    transcriptCount: bucket.transcripts.length,
    translationCount: bucket.translations.length,
    totalBytes: totalBucketBytes(bucket),
    createdAt: bucket.createdAt,
    updatedAt: bucket.updatedAt,
    lastSegmentStartMs: bucket.lastSegmentStartMs ?? null,
    lastSegmentEndMs: bucket.lastSegmentEndMs ?? null
  };
}

async function persistSessionIndexRecord(bucket, { isIncognito, dbName, dbVersion }) {
  if (isIncognito) {
    return;
  }

  const db = await openLiveCaptionCacheDatabase({ dbName, dbVersion });

  await new Promise((resolve, reject) => {
    const transaction = db.transaction([LIVE_CAPTION_CACHE_STORE_NAMES.SESSION_INDEX], 'readwrite');
    const store = transaction.objectStore(LIVE_CAPTION_CACHE_STORE_NAMES.SESSION_INDEX);
    const request = store.put(createSessionIndexRecord(bucket));

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || createLiveCaptionCacheUnavailableError('Failed to persist live-caption session index'));
  });
}

async function deleteSessionIndexRecord(sessionKey, { isIncognito, dbName, dbVersion }) {
  if (isIncognito) {
    return;
  }

  const db = await openLiveCaptionCacheDatabase({ dbName, dbVersion });

  await new Promise((resolve, reject) => {
    const transaction = db.transaction([LIVE_CAPTION_CACHE_STORE_NAMES.SESSION_INDEX], 'readwrite');
    const store = transaction.objectStore(LIVE_CAPTION_CACHE_STORE_NAMES.SESSION_INDEX);
    const request = store.delete(sessionKey);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || createLiveCaptionCacheUnavailableError('Failed to clear live-caption session index'));
  });
}

async function clearSessionIndexStore({ isIncognito, dbName, dbVersion }) {
  if (isIncognito) {
    return;
  }

  const db = await openLiveCaptionCacheDatabase({ dbName, dbVersion });

  await new Promise((resolve, reject) => {
    const transaction = db.transaction([LIVE_CAPTION_CACHE_STORE_NAMES.SESSION_INDEX], 'readwrite');
    const store = transaction.objectStore(LIVE_CAPTION_CACHE_STORE_NAMES.SESSION_INDEX);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || createLiveCaptionCacheUnavailableError('Failed to clear live-caption session index store'));
  });
}

export class LiveCaptionCache {
  constructor({
    isIncognito = false,
    transcriptRepository = null,
    translationRepository = null,
    maxItems = LIVE_CAPTION_DEFAULTS.CACHE_MAX_ITEMS,
    maxBytes = LIVE_CAPTION_DEFAULTS.CACHE_MAX_BYTES,
    dbName = LIVE_CAPTION_CACHE_DB_NAME,
    dbVersion = LIVE_CAPTION_CACHE_DB_VERSION
  } = {}) {
    this.isIncognito = Boolean(isIncognito);
    this.transcriptRepository = transcriptRepository || new LiveCaptionTranscriptRepository({ isIncognito: this.isIncognito });
    this.translationRepository = translationRepository || new LiveCaptionTranslationRepository({ isIncognito: this.isIncognito });
    this.transcriptRepository.isIncognito = this.isIncognito;
    this.translationRepository.isIncognito = this.isIncognito;
    this.maxItems = normalizeCountLimit(maxItems, LIVE_CAPTION_DEFAULTS.CACHE_MAX_ITEMS);
    this.maxBytes = normalizeByteLimit(maxBytes, LIVE_CAPTION_DEFAULTS.CACHE_MAX_BYTES);
    this.dbName = dbName;
    this.dbVersion = dbVersion;
    this._buckets = new Map();
  }

  _getBucket(tabId, videoFingerprint, isIncognito = false) {
    const sessionKey = createLiveCaptionSessionCacheKey(tabId, videoFingerprint);
    if (!this._buckets.has(sessionKey)) {
      this._buckets.set(sessionKey, createBucketMeta({ tabId, videoFingerprint, isIncognito }));
    }
    return this._buckets.get(sessionKey);
  }

  _touchBucket(bucket, segment) {
    bucket.sessionId = segment.sessionId;
    bucket.lastSegmentStartMs = segment.segmentStartMs;
    bucket.lastSegmentEndMs = segment.segmentEndMs;
    bucket.updatedAt = Date.now();
    return bucket;
  }

  async _hydrateBucketFromPersistence(tabId, videoFingerprint, isIncognito = false) {
    if (this.isIncognito || isIncognito) {
      return this._getBucket(tabId, videoFingerprint, isIncognito);
    }

    const sessionKey = createLiveCaptionSessionCacheKey(tabId, videoFingerprint);
    const bucket = this._getBucket(tabId, videoFingerprint, isIncognito);

    if (bucket.transcripts.length > 0 || bucket.translations.length > 0) {
      return bucket;
    }

    const [transcripts, translations] = await Promise.all([
      this.transcriptRepository.getByVideo({ tabId, videoFingerprint }),
      this.translationRepository.getByVideo({ tabId, videoFingerprint })
    ]);

    bucket.transcripts = transcripts.map(recordToMemoryEntry);
    bucket.transcriptBytes = bucket.transcripts.reduce((total, entry) => total + entry.bytes, 0);
    bucket.translations = translations.map(recordToMemoryEntry);
    bucket.translationBytes = bucket.translations.reduce((total, entry) => total + entry.bytes, 0);
    bucket.updatedAt = Date.now();
    logger.debug(() => ({
      message: 'Hydrated live-caption cache bucket',
      data: {
        sessionKey,
        tabId,
        videoFingerprint,
        transcriptCount: bucket.transcripts.length,
        translationCount: bucket.translations.length,
        storageMode: this.isIncognito ? 'session-only' : 'persistent'
      }
    }));

    return bucket;
  }

  async _syncPersistentBucket(bucket) {
    if (this.isIncognito || bucket.isIncognito) {
      return;
    }

    await Promise.all([
      this.transcriptRepository.clearVideo({
        tabId: bucket.tabId,
        videoFingerprint: bucket.videoFingerprint
      }),
      this.translationRepository.clearVideo({
        tabId: bucket.tabId,
        videoFingerprint: bucket.videoFingerprint
      })
    ]);

    for (const entry of bucket.transcripts) {
      await this.transcriptRepository.saveNormalizedSegment(cloneSegment(entry.record));
    }

    for (const entry of bucket.translations) {
      await this.translationRepository.saveNormalizedSegment(cloneSegment(entry.record));
    }

    await persistSessionIndexRecord(bucket, {
      isIncognito: this.isIncognito,
      dbName: this.dbName,
      dbVersion: this.dbVersion
    });
  }

  async appendTranscriptSegment(segment) {
    validateSegmentContext(segment, 'Transcript');
    const bucket = this._getBucket(segment.tabId, segment.videoFingerprint, segment.isIncognito);
    const record = normalizeLiveCaptionTranscriptSegment(segment);
    const memoryEntry = recordToMemoryEntry(record);

    bucket.transcripts.push(memoryEntry);
    bucket.transcriptBytes += memoryEntry.bytes;
    bucket.sessionId = record.sessionId;
    bucket.lastSegmentStartMs = record.segmentStartMs;
    bucket.lastSegmentEndMs = record.segmentEndMs;
    bucket.updatedAt = Date.now();
    trimBucket(bucket, this.maxItems, this.maxBytes);
    await this._syncPersistentBucket(bucket);

    logger.debug(() => ({
      message: 'Appended live-caption transcript segment',
      data: {
        sessionKey: bucket.sessionKey,
        tabId: bucket.tabId,
        videoFingerprint: bucket.videoFingerprint,
        transcriptCount: bucket.transcripts.length,
        totalBytes: totalBucketBytes(bucket),
        storageMode: this.isIncognito ? 'session-only' : 'persistent'
      }
    }));

    return cloneSegment(record);
  }

  async appendTranslatedCaptionSegment(segment) {
    validateSegmentContext(segment, 'Translated caption');
    const bucket = this._getBucket(segment.tabId, segment.videoFingerprint, segment.isIncognito);
    const record = normalizeLiveCaptionTranslationSegment(segment);
    const memoryEntry = recordToMemoryEntry(record);

    bucket.translations.push(memoryEntry);
    bucket.translationBytes += memoryEntry.bytes;
    bucket.sessionId = record.sessionId;
    bucket.lastSegmentStartMs = record.segmentStartMs;
    bucket.lastSegmentEndMs = record.segmentEndMs;
    bucket.updatedAt = Date.now();
    trimBucket(bucket, this.maxItems, this.maxBytes);
    await this._syncPersistentBucket(bucket);

    logger.debug(() => ({
      message: 'Appended live-caption translated caption segment',
      data: {
        sessionKey: bucket.sessionKey,
        tabId: bucket.tabId,
        videoFingerprint: bucket.videoFingerprint,
        translationCount: bucket.translations.length,
        totalBytes: totalBucketBytes(bucket),
        storageMode: this.isIncognito ? 'session-only' : 'persistent'
      }
    }));

    return cloneSegment(record);
  }

  async upsertTranscriptSegmentByIdentity(segment, { compareRevision = true } = {}) {
    const identity = normalizeCanonicalIdentity(segment);
    if (!identity) {
      return createCanonicalOperationResult({
        status: 'ignored',
        ignored: true,
        reason: 'missing_canonical_identity'
      });
    }

    validateSegmentContext(segment, 'Transcript');
    const bucket = await this._hydrateBucketFromPersistence(segment.tabId, segment.videoFingerprint, segment.isIncognito);
    const record = normalizeLiveCaptionTranscriptSegment({
      ...segment,
      ...identity,
      entryKey: createCanonicalTranscriptEntryKey(identity)
    });
    const result = upsertBucketEntry(bucket, 'transcripts', identity, record, {
      compareRevision,
      matcher: canonicalTranscriptIdentityMatches
    });

    if (result.ignored) {
      return result;
    }

    bucket.sessionId = record.sessionId;
    bucket.lastSegmentStartMs = record.segmentStartMs;
    bucket.lastSegmentEndMs = record.segmentEndMs;
    bucket.updatedAt = Date.now();
    trimBucket(bucket, this.maxItems, this.maxBytes);
    await this._syncPersistentBucket(bucket);

    return createCanonicalOperationResult(result);
  }

  async getTranscriptSegmentByIdentity(identity, options = {}) {
    const normalizedIdentity = normalizeCanonicalIdentity(identity);
    if (!normalizedIdentity) {
      return null;
    }

    const bucket = await this._hydrateBucketFromPersistence(normalizedIdentity.tabId, normalizedIdentity.videoFingerprint, options.isIncognito ?? false);
    const index = findBestCanonicalEntryIndex(bucket.transcripts, normalizedIdentity, canonicalTranscriptIdentityMatches);
    return index == null ? null : cloneSegment(bucket.transcripts[index].record);
  }

  async upsertTranslatedCaptionSegmentByIdentity(segment, { compareRevision = true } = {}) {
    const identity = normalizeTranslationCanonicalIdentity(segment);
    if (!identity) {
      if (!normalizeCanonicalIdentity(segment)) {
        return createCanonicalOperationResult({
          status: 'ignored',
          ignored: true,
          reason: 'missing_canonical_identity'
        });
      }

      return createCanonicalOperationResult({
        status: 'ignored',
        ignored: true,
        reason: 'missing_translation_identity'
      });
    }

    validateSegmentContext(segment, 'Translated caption');
    const bucket = await this._hydrateBucketFromPersistence(segment.tabId, segment.videoFingerprint, segment.isIncognito);
    const record = normalizeLiveCaptionTranslationSegment({
      ...segment,
      ...identity,
      provider: identity.providerId,
      entryKey: createCanonicalTranslationQualifiedEntryKey(identity, identity.targetLanguage, identity.providerId)
    });
    const result = upsertBucketEntry(bucket, 'translations', identity, record, {
      compareRevision,
      matcher: canonicalTranslationIdentityMatches
    });

    if (result.ignored) {
      return result;
    }

    bucket.sessionId = record.sessionId;
    bucket.lastSegmentStartMs = record.segmentStartMs;
    bucket.lastSegmentEndMs = record.segmentEndMs;
    bucket.updatedAt = Date.now();
    trimBucket(bucket, this.maxItems, this.maxBytes);
    await this._syncPersistentBucket(bucket);

    return createCanonicalOperationResult(result);
  }

  async getTranslatedCaptionSegmentByIdentity(identity, options = {}) {
    const normalizedIdentity = normalizeTranslationCanonicalIdentity(identity);
    if (!normalizedIdentity) {
      return null;
    }

    const bucket = await this._hydrateBucketFromPersistence(normalizedIdentity.tabId, normalizedIdentity.videoFingerprint, options.isIncognito ?? false);
    const index = findBestCanonicalEntryIndex(bucket.translations, normalizedIdentity, canonicalTranslationIdentityMatches);
    return index == null ? null : cloneSegment(bucket.translations[index].record);
  }

  async getTranscriptSegments({ tabId, videoFingerprint, isIncognito = false }) {
    const bucket = await this._hydrateBucketFromPersistence(tabId, videoFingerprint, isIncognito);
    return bucket.transcripts.map(({ record }) => cloneSegment(record));
  }

  async getTranslatedCaptionSegments({ tabId, videoFingerprint, isIncognito = false }) {
    const bucket = await this._hydrateBucketFromPersistence(tabId, videoFingerprint, isIncognito);
    return bucket.translations.map(({ record }) => cloneSegment(record));
  }

  async clearVideo({ tabId, videoFingerprint }) {
    const sessionKey = createLiveCaptionSessionCacheKey(tabId, videoFingerprint);
    this._buckets.delete(sessionKey);

    await Promise.all([
      this.transcriptRepository.clearVideo({ tabId, videoFingerprint }),
      this.translationRepository.clearVideo({ tabId, videoFingerprint }),
      deleteSessionIndexRecord(sessionKey, {
        isIncognito: this.isIncognito,
        dbName: this.dbName,
        dbVersion: this.dbVersion
      })
    ]);

    logger.debug(() => ({
      message: 'Cleared live-caption cache for video',
      data: {
        sessionKey,
        tabId,
        videoFingerprint,
        storageMode: this.isIncognito ? 'session-only' : 'persistent'
      }
    }));
  }

  async clearAll() {
    this._buckets.clear();

    await Promise.all([
      this.transcriptRepository.clearAll(),
      this.translationRepository.clearAll(),
      clearSessionIndexStore({
        isIncognito: this.isIncognito,
        dbName: this.dbName,
        dbVersion: this.dbVersion
      })
    ]);

    logger.debug(() => ({
      message: 'Cleared live-caption cache',
      data: {
        storageMode: this.isIncognito ? 'session-only' : 'persistent'
      }
    }));
  }

  getSnapshot() {
    return {
      storageMode: this.isIncognito ? 'session-only' : 'persistent',
      maxItems: this.maxItems,
      maxBytes: this.maxBytes,
      videoCount: this._buckets.size,
      videos: Array.from(this._buckets.values()).map(cloneBucket)
    };
  }
}

export default LiveCaptionCache;
