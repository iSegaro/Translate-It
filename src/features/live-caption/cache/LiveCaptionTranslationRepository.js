import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  createLiveCaptionVideoCacheKey,
  createLiveCaptionTranslatedSegmentCacheKey
} from './LiveCaptionCacheKeys.js';
import {
  LIVE_CAPTION_CACHE_DB_NAME,
  LIVE_CAPTION_CACHE_DB_VERSION,
  LIVE_CAPTION_CACHE_STORE_NAMES,
  createLiveCaptionCacheUnavailableError,
  openLiveCaptionCacheDatabase
} from './LiveCaptionCacheSchema.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionTranslationRepository');

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
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

function normalizeRevisionValue(value) {
  if (value == null || value === '') {
    return null;
  }

  const revision = Number(value);
  return Number.isFinite(revision) ? revision : null;
}

function normalizeSourceTimelineType(value) {
  if (value == null || value === '') {
    return null;
  }

  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : String(value).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return ['capture', 'provider', 'media', 'unknown'].includes(normalized) ? normalized : 'unknown';
}

function normalizeOptionalSourceResetId(value) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalSourceClockId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalProjectedMediaTime(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeTimelineProjectionStatus(value) {
  if (value == null || value === '') {
    return null;
  }

  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase()
    : String(value).trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return ['mapped', 'unmapped', 'boundary_crossing', 'invalid'].includes(normalized) ? normalized : null;
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

function cloneSegment(segment) {
  return {
    ...segment,
    segmentTiming: Array.isArray(segment.segmentTiming) ? [...segment.segmentTiming] : [segment.segmentStartMs, segment.segmentEndMs]
  };
}

function normalizeTranslationSegment(segment) {
  if (!segment || typeof segment !== 'object') {
    throw new Error('Translated caption segment must be an object');
  }

  const tabId = segment.tabId;
  const videoFingerprint = segment.videoFingerprint;
  const sessionId = segment.sessionId;
  const segmentStartMs = Number(segment.segmentStartMs);
  const segmentEndMs = Number(segment.segmentEndMs);
  const originalText = String(segment.originalText ?? '').trim();
  const translatedText = String(segment.translatedText ?? '').trim();
  const sourceLanguage = segment.sourceLanguage ?? null;
  const targetLanguage = segment.targetLanguage ?? null;
  const provider = segment.providerId ?? segment.provider ?? null;

  if (!hasValue(tabId) || !hasValue(videoFingerprint) || !hasValue(sessionId)) {
    throw new Error('Translated caption segment requires tabId, videoFingerprint, and sessionId');
  }

  if (!Number.isFinite(segmentStartMs) || !Number.isFinite(segmentEndMs)) {
    throw new Error('Translated caption segment requires numeric segment timing');
  }

  if (!originalText || !translatedText) {
    throw new Error('Translated caption segment requires original and translated text');
  }

  const now = segment.createdAt || Date.now();
  const sessionKey = createLiveCaptionVideoCacheKey(tabId, videoFingerprint);

  const mediaStartMs = segment.mediaStartMs != null && Number.isFinite(Number(segment.mediaStartMs))
    ? Number(segment.mediaStartMs)
    : null;
  const mediaEndMs = segment.mediaEndMs != null && Number.isFinite(Number(segment.mediaEndMs))
    ? Number(segment.mediaEndMs)
    : null;
  const sourceStartMs = segment.sourceStartMs != null && Number.isFinite(Number(segment.sourceStartMs))
    ? Number(segment.sourceStartMs)
    : null;
  const sourceEndMs = segment.sourceEndMs != null && Number.isFinite(Number(segment.sourceEndMs))
    ? Number(segment.sourceEndMs)
    : null;

  return {
    entryKey: segment.entryKey ?? createLiveCaptionTranslatedSegmentCacheKey({
      tabId,
      videoFingerprint,
      segmentStartMs,
      segmentEndMs,
      targetLanguage,
      providerId: provider
    }),
    sessionKey,
    tabId,
    sessionId,
    videoFingerprint,
    segmentStartMs,
    segmentEndMs,
    mediaStartMs,
    mediaEndMs,
    sourceTimelineType: normalizeSourceTimelineType(segment.sourceTimelineType),
    sourceStartMs,
    sourceEndMs,
    sourceClockId: normalizeOptionalSourceClockId(segment.sourceClockId),
    sourceSequence: segment.sourceSequence != null && Number.isFinite(Number(segment.sourceSequence))
      ? Number(segment.sourceSequence)
      : null,
    sourceResetId: normalizeOptionalSourceResetId(segment.sourceResetId),
    projectedMediaStartMs: normalizeOptionalProjectedMediaTime(segment.projectedMediaStartMs),
    projectedMediaEndMs: normalizeOptionalProjectedMediaTime(segment.projectedMediaEndMs),
    timelineProjectionStatus: normalizeTimelineProjectionStatus(segment.timelineProjectionStatus),
    timelineProjectionAnchorId: normalizeOptionalString(segment.timelineProjectionAnchorId),
    timelineProjectionReason: normalizeOptionalString(segment.timelineProjectionReason),
    segmentTiming: [segmentStartMs, segmentEndMs],
    originalText,
    translatedText,
    sourceLanguage,
    targetLanguage,
    provider,
    segmentId: segment.segmentId ?? null,
    revision: normalizeRevisionValue(segment.revision),
    isFinal: segment.isFinal !== false,
    createdAt: now,
    updatedAt: now,
    providerUtteranceId: segment.providerUtteranceId ?? null,
    providerSequence: segment.providerSequence ?? null,
    providerRevision: segment.providerRevision ?? null,
    providerStreamId: segment.providerStreamId ?? null,
    providerChannel: segment.providerChannel ?? null
  };
}

async function writeNormalizedTranslationRecord(db, record) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([LIVE_CAPTION_CACHE_STORE_NAMES.TRANSLATIONS], 'readwrite');
    const store = transaction.objectStore(LIVE_CAPTION_CACHE_STORE_NAMES.TRANSLATIONS);
    const request = store.put(record);

    request.onsuccess = () => resolve(cloneSegment(record));
    request.onerror = () => reject(request.error || createLiveCaptionCacheUnavailableError('Failed to persist translated caption segment'));
  });
}

async function readAllSegments(db, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(Array.isArray(request.result) ? request.result.map(cloneSegment) : []);
    };

    request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
  });
}

async function deleteMatchingSegments(db, storeName, predicate) {
  const records = await readAllSegments(db, storeName);
  const matching = records.filter(predicate);

  if (matching.length === 0) {
    return 0;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    let deleted = 0;
    let settled = false;

    const finish = () => {
      if (!settled) {
        settled = true;
        resolve(deleted);
      }
    };

    transaction.onerror = () => {
      if (!settled) {
        settled = true;
        reject(transaction.error || new Error('IndexedDB clear failed'));
      }
    };

    for (const record of matching) {
      const request = store.delete(record.entryKey);
      request.onsuccess = () => {
        deleted += 1;
        if (deleted === matching.length) {
          finish();
        }
      };
      request.onerror = () => {
        if (!settled) {
          settled = true;
          reject(request.error || new Error('IndexedDB delete failed'));
        }
      };
    }
  });
}

export class LiveCaptionTranslationRepository {
  constructor({
    isIncognito = false,
    dbName = LIVE_CAPTION_CACHE_DB_NAME,
    dbVersion = LIVE_CAPTION_CACHE_DB_VERSION
  } = {}) {
    this.isIncognito = Boolean(isIncognito);
    this.dbName = dbName;
    this.dbVersion = dbVersion;
    this._dbPromise = null;
  }

  async _getDb() {
    if (this.isIncognito) {
      return null;
    }

    if (!this._dbPromise) {
      this._dbPromise = openLiveCaptionCacheDatabase({
        dbName: this.dbName,
        dbVersion: this.dbVersion
      });
    }

    return this._dbPromise;
  }

  async appendSegment(segment) {
    if (this.isIncognito) {
      return cloneSegment(normalizeTranslationSegment(segment));
    }

    const db = await this._getDb();
    const record = normalizeTranslationSegment(segment);

    logger.debug(() => ({
      message: 'Persisting translated caption segment',
      data: {
        sessionKey: record.sessionKey,
        tabId: record.tabId,
        videoFingerprint: record.videoFingerprint,
        segmentStartMs: record.segmentStartMs,
        segmentEndMs: record.segmentEndMs,
        targetLanguage: record.targetLanguage,
        provider: record.provider,
        storageMode: 'persistent'
      }
    }));

    return writeNormalizedTranslationRecord(db, record);
  }

  async saveNormalizedSegment(record) {
    if (this.isIncognito) {
      return cloneSegment(record);
    }

    const db = await this._getDb();
    return writeNormalizedTranslationRecord(db, record);
  }

  async upsertTranslatedCaptionSegmentByIdentity(segment, { compareRevision = true } = {}) {
    const identity = normalizeCanonicalIdentity(segment);
    const targetLanguage = typeof segment?.targetLanguage === 'string' && segment.targetLanguage.trim().length > 0
      ? segment.targetLanguage.trim()
      : null;
    const providerId = typeof segment?.providerId === 'string' && segment.providerId.trim().length > 0
      ? segment.providerId.trim()
      : (typeof segment?.provider === 'string' && segment.provider.trim().length > 0
        ? segment.provider.trim()
        : null);

    if (!identity) {
      return createCanonicalOperationResult({
        status: 'ignored',
        ignored: true,
        reason: 'missing_canonical_identity'
      });
    }

    if (!targetLanguage || !providerId) {
      return createCanonicalOperationResult({
        status: 'ignored',
        ignored: true,
        reason: 'missing_translation_identity'
      });
    }

    const record = normalizeTranslationSegment({
      ...segment,
      ...identity,
      targetLanguage,
      provider: providerId,
      entryKey: createCanonicalTranslationQualifiedEntryKey(identity, targetLanguage, providerId)
    });
    const db = await this._getDb();
    const existingRecord = await this.getTranslatedCaptionSegmentByIdentity({
      ...identity,
      targetLanguage,
      provider: providerId
    });

    if (existingRecord) {
      if (compareRevision) {
        const incomingRevision = normalizeRevisionValue(record.revision);
        const existingRevision = normalizeRevisionValue(existingRecord.revision);

        if (incomingRevision == null) {
          return createCanonicalOperationResult({
            status: 'ignored',
            ignored: true,
            reason: 'missing_revision',
            record: existingRecord
          });
        }

        if (existingRevision != null && incomingRevision <= existingRevision) {
          return createCanonicalOperationResult({
            status: 'ignored',
            ignored: true,
            reason: 'stale_revision',
            record: existingRecord
          });
        }
      }

      const persistedRecord = await writeNormalizedTranslationRecord(db, record);
      return createCanonicalOperationResult({
        status: 'replaced',
        replaced: true,
        ignored: false,
        record: persistedRecord
      });
    }

    if (compareRevision && normalizeRevisionValue(record.revision) == null) {
      return createCanonicalOperationResult({
        status: 'ignored',
        ignored: true,
        reason: 'missing_revision'
      });
    }

    const persistedRecord = await writeNormalizedTranslationRecord(db, record);
    return createCanonicalOperationResult({
      status: 'inserted',
      replaced: false,
      ignored: false,
      record: persistedRecord
    });
  }

  async getTranslatedCaptionSegmentByIdentity(identity, options = {}) {
    const normalizedIdentity = normalizeCanonicalIdentity(identity);
    const targetLanguage = typeof identity?.targetLanguage === 'string' && identity.targetLanguage.trim().length > 0
      ? identity.targetLanguage.trim()
      : null;
    const providerId = typeof identity?.providerId === 'string' && identity.providerId.trim().length > 0
      ? identity.providerId.trim()
      : (typeof identity?.provider === 'string' && identity.provider.trim().length > 0 ? identity.provider.trim() : null);

    if (!normalizedIdentity || !targetLanguage || !providerId || options?.skipPersistence) {
      return null;
    }

    if (this.isIncognito) {
      return null;
    }

    const db = await this._getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([LIVE_CAPTION_CACHE_STORE_NAMES.TRANSLATIONS], 'readonly');
      const store = transaction.objectStore(LIVE_CAPTION_CACHE_STORE_NAMES.TRANSLATIONS);
      const request = store.get(createCanonicalTranslationQualifiedEntryKey(normalizedIdentity, targetLanguage, providerId));

      request.onsuccess = () => {
        resolve(request.result ? cloneSegment(request.result) : null);
      };

      request.onerror = () => reject(request.error || createLiveCaptionCacheUnavailableError('Failed to read translated caption segment'));
    });
  }

  async getByVideo({ tabId, videoFingerprint }) {
    if (this.isIncognito) {
      return [];
    }

    const db = await this._getDb();
    const sessionKey = createLiveCaptionVideoCacheKey(tabId, videoFingerprint);
    const records = await readAllSegments(db, LIVE_CAPTION_CACHE_STORE_NAMES.TRANSLATIONS);
    return records
      .filter((record) => record.sessionKey === sessionKey)
      .sort((left, right) => left.segmentStartMs - right.segmentStartMs || left.segmentEndMs - right.segmentEndMs || left.createdAt - right.createdAt)
      .map(cloneSegment);
  }

  async getBySession(sessionId) {
    if (this.isIncognito) {
      return [];
    }

    const db = await this._getDb();
    const records = await readAllSegments(db, LIVE_CAPTION_CACHE_STORE_NAMES.TRANSLATIONS);
    return records
      .filter((record) => record.sessionId === sessionId)
      .sort((left, right) => left.segmentStartMs - right.segmentStartMs || left.segmentEndMs - right.segmentEndMs || left.createdAt - right.createdAt)
      .map(cloneSegment);
  }

  async clearVideo({ tabId, videoFingerprint }) {
    if (this.isIncognito) {
      return 0;
    }

    const db = await this._getDb();
    const sessionKey = createLiveCaptionVideoCacheKey(tabId, videoFingerprint);
    return deleteMatchingSegments(db, LIVE_CAPTION_CACHE_STORE_NAMES.TRANSLATIONS, (record) => record.sessionKey === sessionKey);
  }

  async clearAll() {
    if (this.isIncognito) {
      return;
    }

    const db = await this._getDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([LIVE_CAPTION_CACHE_STORE_NAMES.TRANSLATIONS], 'readwrite');
      const store = transaction.objectStore(LIVE_CAPTION_CACHE_STORE_NAMES.TRANSLATIONS);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('IndexedDB clear failed'));
    });
  }
}

export function normalizeLiveCaptionTranslationSegment(segment) {
  return normalizeTranslationSegment(segment);
}

export default LiveCaptionTranslationRepository;
