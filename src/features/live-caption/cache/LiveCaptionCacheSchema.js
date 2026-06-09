import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionCacheSchema');

export const LIVE_CAPTION_CACHE_DB_NAME = 'translate_it_live_caption_cache';
export const LIVE_CAPTION_CACHE_DB_VERSION = 1;

export const LIVE_CAPTION_CACHE_STORE_NAMES = Object.freeze({
  SESSION_INDEX: 'session_index',
  TRANSCRIPTS: 'transcripts',
  TRANSLATIONS: 'translations'
});

export const LIVE_CAPTION_CACHE_STORE_DEFINITIONS = Object.freeze({
  [LIVE_CAPTION_CACHE_STORE_NAMES.SESSION_INDEX]: Object.freeze({
    keyPath: 'sessionKey',
    indexes: Object.freeze([
      Object.freeze({ name: 'tabId', keyPath: 'tabId' }),
      Object.freeze({ name: 'sessionId', keyPath: 'sessionId' }),
      Object.freeze({ name: 'videoFingerprint', keyPath: 'videoFingerprint' }),
      Object.freeze({ name: 'createdAt', keyPath: 'createdAt' }),
      Object.freeze({ name: 'updatedAt', keyPath: 'updatedAt' })
    ])
  }),
  [LIVE_CAPTION_CACHE_STORE_NAMES.TRANSCRIPTS]: Object.freeze({
    keyPath: 'entryKey',
    indexes: Object.freeze([
      Object.freeze({ name: 'tabId', keyPath: 'tabId' }),
      Object.freeze({ name: 'sessionId', keyPath: 'sessionId' }),
      Object.freeze({ name: 'videoFingerprint', keyPath: 'videoFingerprint' }),
      Object.freeze({ name: 'segmentStartMs', keyPath: 'segmentStartMs' }),
      Object.freeze({ name: 'segmentEndMs', keyPath: 'segmentEndMs' }),
      Object.freeze({ name: 'segmentTiming', keyPath: ['segmentStartMs', 'segmentEndMs'] }),
      Object.freeze({ name: 'createdAt', keyPath: 'createdAt' }),
      Object.freeze({ name: 'updatedAt', keyPath: 'updatedAt' })
    ])
  }),
  [LIVE_CAPTION_CACHE_STORE_NAMES.TRANSLATIONS]: Object.freeze({
    keyPath: 'entryKey',
    indexes: Object.freeze([
      Object.freeze({ name: 'tabId', keyPath: 'tabId' }),
      Object.freeze({ name: 'sessionId', keyPath: 'sessionId' }),
      Object.freeze({ name: 'videoFingerprint', keyPath: 'videoFingerprint' }),
      Object.freeze({ name: 'segmentStartMs', keyPath: 'segmentStartMs' }),
      Object.freeze({ name: 'segmentEndMs', keyPath: 'segmentEndMs' }),
      Object.freeze({ name: 'segmentTiming', keyPath: ['segmentStartMs', 'segmentEndMs'] }),
      Object.freeze({ name: 'targetLanguage', keyPath: 'targetLanguage' }),
      Object.freeze({ name: 'provider', keyPath: 'provider' }),
      Object.freeze({ name: 'createdAt', keyPath: 'createdAt' }),
      Object.freeze({ name: 'updatedAt', keyPath: 'updatedAt' })
    ])
  })
});

function hasCollectionName(collection, name) {
  if (!collection) {
    return false;
  }

  if (typeof collection.contains === 'function') {
    return collection.contains(name);
  }

  if (typeof collection.has === 'function') {
    return collection.has(name);
  }

  if (Array.isArray(collection)) {
    return collection.includes(name);
  }

  return false;
}

function ensureIndex(store, definition) {
  if (hasCollectionName(store.indexNames, definition.name)) {
    return;
  }

  store.createIndex(definition.name, definition.keyPath, definition.options || {});
}

function ensureStore(db, transaction, storeName, definition) {
  let store = null;

  if (!hasCollectionName(db.objectStoreNames, storeName)) {
    store = db.createObjectStore(storeName, { keyPath: definition.keyPath });
  } else if (transaction && typeof transaction.objectStore === 'function') {
    store = transaction.objectStore(storeName);
  }

  if (!store) {
    return;
  }

  for (const indexDefinition of definition.indexes) {
    ensureIndex(store, indexDefinition);
  }
}

export function applyLiveCaptionCacheSchema(db, transaction = null) {
  if (!db) {
    return db;
  }

  for (const [storeName, definition] of Object.entries(LIVE_CAPTION_CACHE_STORE_DEFINITIONS)) {
    ensureStore(db, transaction, storeName, definition);
  }

  return db;
}

export function createLiveCaptionCacheSchema() {
  return {
    dbName: LIVE_CAPTION_CACHE_DB_NAME,
    version: LIVE_CAPTION_CACHE_DB_VERSION,
    stores: LIVE_CAPTION_CACHE_STORE_DEFINITIONS
  };
}

export function createLiveCaptionCacheUnavailableError(reason = 'IndexedDB is not available for live-caption cache') {
  const error = new Error(reason);
  error.code = 'LIVE_CAPTION_CACHE_UNAVAILABLE';
  return error;
}

export function openLiveCaptionCacheDatabase({
  dbName = LIVE_CAPTION_CACHE_DB_NAME,
  dbVersion = LIVE_CAPTION_CACHE_DB_VERSION
} = {}) {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') {
    return Promise.reject(createLiveCaptionCacheUnavailableError());
  }

  logger.debug(() => ({
    message: 'Opening live-caption cache database',
    data: { dbName, dbVersion }
  }));

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = (event) => {
      try {
        applyLiveCaptionCacheSchema(event.target.result, event.target.transaction || null);
      } catch (error) {
        logger.error('Failed to apply live-caption cache schema', error);
        reject(error);
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = () => {
      const error = request.error || createLiveCaptionCacheUnavailableError('Failed to open live-caption cache database');
      logger.error('Failed to open live-caption cache database', error);
      reject(error);
    };
  });
}

export default {
  LIVE_CAPTION_CACHE_DB_NAME,
  LIVE_CAPTION_CACHE_DB_VERSION,
  LIVE_CAPTION_CACHE_STORE_NAMES,
  LIVE_CAPTION_CACHE_STORE_DEFINITIONS,
  createLiveCaptionCacheSchema,
  applyLiveCaptionCacheSchema,
  createLiveCaptionCacheUnavailableError,
  openLiveCaptionCacheDatabase
};
