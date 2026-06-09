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
