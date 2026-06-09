import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  createLiveCaptionVideoCacheKey,
  createLiveCaptionSegmentCacheKey
} from './LiveCaptionCacheKeys.js';
import {
  LIVE_CAPTION_CACHE_DB_NAME,
  LIVE_CAPTION_CACHE_DB_VERSION,
  LIVE_CAPTION_CACHE_STORE_NAMES,
  createLiveCaptionCacheUnavailableError,
  openLiveCaptionCacheDatabase
} from './LiveCaptionCacheSchema.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionTranscriptRepository');

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function cloneSegment(segment) {
  return {
    ...segment,
    segmentTiming: Array.isArray(segment.segmentTiming) ? [...segment.segmentTiming] : [segment.segmentStartMs, segment.segmentEndMs]
  };
}

function normalizeTranscriptSegment(segment) {
  if (!segment || typeof segment !== 'object') {
    throw new Error('Transcript segment must be an object');
  }

  const tabId = segment.tabId;
  const videoFingerprint = segment.videoFingerprint;
  const sessionId = segment.sessionId;
  const segmentStartMs = Number(segment.segmentStartMs);
  const segmentEndMs = Number(segment.segmentEndMs);
  const originalText = String(segment.originalText ?? '').trim();

  if (!hasValue(tabId) || !hasValue(videoFingerprint) || !hasValue(sessionId)) {
    throw new Error('Transcript segment requires tabId, videoFingerprint, and sessionId');
  }

  if (!Number.isFinite(segmentStartMs) || !Number.isFinite(segmentEndMs)) {
    throw new Error('Transcript segment requires numeric segment timing');
  }

  if (!originalText) {
    throw new Error('Transcript segment requires originalText');
  }

  const now = segment.createdAt || Date.now();
  const sessionKey = createLiveCaptionVideoCacheKey(tabId, videoFingerprint);

  return {
    entryKey: createLiveCaptionSegmentCacheKey({ tabId, videoFingerprint, segmentStartMs, segmentEndMs }),
    sessionKey,
    tabId,
    sessionId,
    videoFingerprint,
    segmentStartMs,
    segmentEndMs,
    segmentTiming: [segmentStartMs, segmentEndMs],
    originalText,
    sourceLanguage: segment.sourceLanguage ?? null,
    isFinal: segment.isFinal !== false,
    createdAt: now,
    updatedAt: now
  };
}

async function writeNormalizedTranscriptRecord(db, record) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([LIVE_CAPTION_CACHE_STORE_NAMES.TRANSCRIPTS], 'readwrite');
    const store = transaction.objectStore(LIVE_CAPTION_CACHE_STORE_NAMES.TRANSCRIPTS);
    const request = store.put(record);

    request.onsuccess = () => resolve(cloneSegment(record));
    request.onerror = () => reject(request.error || createLiveCaptionCacheUnavailableError('Failed to persist transcript segment'));
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

export class LiveCaptionTranscriptRepository {
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
      return cloneSegment(normalizeTranscriptSegment(segment));
    }

    const db = await this._getDb();
    const record = normalizeTranscriptSegment(segment);

    logger.debug(() => ({
      message: 'Persisting transcript segment',
      data: {
        sessionKey: record.sessionKey,
        tabId: record.tabId,
        videoFingerprint: record.videoFingerprint,
        segmentStartMs: record.segmentStartMs,
        segmentEndMs: record.segmentEndMs,
        storageMode: 'persistent'
      }
    }));

    return writeNormalizedTranscriptRecord(db, record);
  }

  async saveNormalizedSegment(record) {
    if (this.isIncognito) {
      return cloneSegment(record);
    }

    const db = await this._getDb();
    return writeNormalizedTranscriptRecord(db, record);
  }

  async getByVideo({ tabId, videoFingerprint }) {
    if (this.isIncognito) {
      return [];
    }

    const db = await this._getDb();
    const sessionKey = createLiveCaptionVideoCacheKey(tabId, videoFingerprint);
    const records = await readAllSegments(db, LIVE_CAPTION_CACHE_STORE_NAMES.TRANSCRIPTS);
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
    const records = await readAllSegments(db, LIVE_CAPTION_CACHE_STORE_NAMES.TRANSCRIPTS);
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
    return deleteMatchingSegments(db, LIVE_CAPTION_CACHE_STORE_NAMES.TRANSCRIPTS, (record) => record.sessionKey === sessionKey);
  }

  async clearAll() {
    if (this.isIncognito) {
      return;
    }

    const db = await this._getDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([LIVE_CAPTION_CACHE_STORE_NAMES.TRANSCRIPTS], 'readwrite');
      const store = transaction.objectStore(LIVE_CAPTION_CACHE_STORE_NAMES.TRANSCRIPTS);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('IndexedDB clear failed'));
    });
  }
}

export function normalizeLiveCaptionTranscriptSegment(segment) {
  return normalizeTranscriptSegment(segment);
}

export default LiveCaptionTranscriptRepository;
