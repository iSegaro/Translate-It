import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LIVE_CAPTION_CACHE_DB_NAME,
  LIVE_CAPTION_CACHE_DB_VERSION,
  LIVE_CAPTION_CACHE_STORE_NAMES,
  LIVE_CAPTION_CACHE_STORE_DEFINITIONS,
  createLiveCaptionCacheSchema,
  applyLiveCaptionCacheSchema,
  openLiveCaptionCacheDatabase,
  createLiveCaptionSessionCacheKey,
  createLiveCaptionVideoCacheKey,
  createLiveCaptionSegmentCacheKey,
  createLiveCaptionTranslatedSegmentCacheKey,
  LiveCaptionCache,
  LiveCaptionTranscriptRepository,
  LiveCaptionTranslationRepository
} from './index.js';
import { STTProviderFactory } from '../stt/STTProviderFactory.js';
import { LiveCaptionTranslationAdapter } from '../background/LiveCaptionTranslationAdapter.js';

vi.mock('../stt/STTProviderFactory.js', () => ({
  STTProviderFactory: vi.fn()
}));

vi.mock('../background/LiveCaptionTranslationAdapter.js', () => ({
  LiveCaptionTranslationAdapter: vi.fn()
}));

function createNameList(initial = []) {
  const values = [...new Set(initial)];
  values.contains = (name) => values.includes(name);
  values.add = (name) => {
    if (!values.includes(name)) {
      values.push(name);
    }
  };
  values.delete = (name) => {
    const index = values.indexOf(name);
    if (index !== -1) {
      values.splice(index, 1);
    }
  };
  return values;
}

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createRequest() {
  return {
    onsuccess: null,
    onerror: null,
    result: null,
    error: null
  };
}

function createMockObjectStore(name, { keyPath } = {}) {
  const store = {
    name,
    keyPath,
    records: new Map(),
    indexNames: createNameList(),
    indexes: new Map(),
    createIndex(indexName, indexKeyPath, options = {}) {
      const definition = { name: indexName, keyPath: indexKeyPath, options: { ...options } };
      this.indexes.set(indexName, definition);
      this.indexNames.add(indexName);
      return definition;
    },
    put(value, key) {
      const request = createRequest();
      queueMicrotask(() => {
        try {
          const record = cloneValue(value);
          const primaryKey = this.keyPath ? record[this.keyPath] : key;
          if (primaryKey === undefined || primaryKey === null) {
            throw new Error(`Missing primary key for ${name}`);
          }
          this.records.set(primaryKey, cloneValue(record));
          request.result = primaryKey;
          request.onsuccess?.({ target: { result: primaryKey } });
        } catch (error) {
          request.error = error;
          request.onerror?.({ target: { error } });
        }
      });
      return request;
    },
    get(key) {
      const request = createRequest();
      queueMicrotask(() => {
        request.result = cloneValue(this.records.get(key) ?? null);
        request.onsuccess?.({ target: { result: request.result } });
      });
      return request;
    },
    getAll() {
      const request = createRequest();
      queueMicrotask(() => {
        request.result = [...this.records.values()].map((record) => cloneValue(record));
        request.onsuccess?.({ target: { result: request.result } });
      });
      return request;
    },
    delete(key) {
      const request = createRequest();
      queueMicrotask(() => {
        this.records.delete(key);
        request.result = undefined;
        request.onsuccess?.({ target: { result: undefined } });
      });
      return request;
    },
    clear() {
      const request = createRequest();
      queueMicrotask(() => {
        this.records.clear();
        request.result = undefined;
        request.onsuccess?.({ target: { result: undefined } });
      });
      return request;
    }
  };

  return store;
}

function createMockDatabase(name, version) {
  const stores = new Map();
  const objectStoreNames = createNameList();

  return {
    name,
    version,
    objectStoreNames,
    stores,
    createObjectStore(storeName, options = {}) {
      const store = createMockObjectStore(storeName, options);
      stores.set(storeName, store);
      objectStoreNames.add(storeName);
      return store;
    },
    transaction(storeNames, mode) {
      return {
        mode,
        storeNames,
        objectStore(storeName) {
          if (!stores.has(storeName)) {
            throw new Error(`Missing store: ${storeName}`);
          }
          return stores.get(storeName);
        }
      };
    },
    close() {}
  };
}

function createIndexedDbMock() {
  const databases = new Map();
  const open = vi.fn((name, version = 1) => {
    const request = createRequest();

    queueMicrotask(() => {
      let db = databases.get(name);
      const needsUpgrade = !db || version > db.version;

      if (!db) {
        db = createMockDatabase(name, version);
        databases.set(name, db);
      }

      if (needsUpgrade) {
        db.version = version;
        request.result = db;
        request.onupgradeneeded?.({
          target: {
            result: db,
            transaction: db.transaction([], 'versionchange')
          }
        });
      }

      queueMicrotask(() => {
        request.result = db;
        request.onsuccess?.({ target: { result: db } });
      });
    });

    return request;
  });

  return { open, databases };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const canonicalIdentity = {
  sessionId: 'session-canonical',
  tabId: 21,
  videoFingerprint: 'video-canonical',
  segmentId: 'segment-1'
};

function createTranscriptCanonicalSegment(overrides = {}) {
  return {
    ...canonicalIdentity,
    segmentStartMs: 10,
    segmentEndMs: 20,
    originalText: 'Hello',
    sourceLanguage: 'en',
    revision: 1,
    ...overrides
  };
}

function createTranslatedCanonicalSegment(overrides = {}) {
  return {
    ...canonicalIdentity,
    segmentStartMs: 10,
    segmentEndMs: 20,
    originalText: 'Hello',
    translatedText: 'سلام',
    sourceLanguage: 'en',
    targetLanguage: 'fa',
    provider: 'openai',
    revision: 1,
    ...overrides
  };
}

function getDatabase(mockIndexedDb, dbName = LIVE_CAPTION_CACHE_DB_NAME) {
  return mockIndexedDb.databases.get(dbName);
}

function getStore(mockIndexedDb, storeName, dbName = LIVE_CAPTION_CACHE_DB_NAME) {
  return getDatabase(mockIndexedDb, dbName)?.stores.get(storeName);
}

describe('live-caption cache layer', () => {
  let indexedDbMock;

  beforeEach(() => {
    vi.clearAllMocks();
    indexedDbMock = createIndexedDbMock();
    vi.stubGlobal('indexedDB', indexedDbMock);
    vi.stubGlobal('chrome', {
      tabCapture: {
        capture: vi.fn()
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defines the indexeddb schema and store indexes', () => {
    const schema = createLiveCaptionCacheSchema();

    expect(schema.dbName).toBe(LIVE_CAPTION_CACHE_DB_NAME);
    expect(schema.version).toBe(LIVE_CAPTION_CACHE_DB_VERSION);
    expect(schema.stores).toBe(LIVE_CAPTION_CACHE_STORE_DEFINITIONS);
    expect(LIVE_CAPTION_CACHE_STORE_NAMES.SESSION_INDEX).toBe('session_index');
    expect(applyLiveCaptionCacheSchema).toBeTypeOf('function');
    expect(LIVE_CAPTION_CACHE_STORE_DEFINITIONS.session_index.keyPath).toBe('sessionKey');
    expect(LIVE_CAPTION_CACHE_STORE_DEFINITIONS.transcripts.indexes.map((index) => index.name)).toEqual([
      'tabId',
      'sessionId',
      'videoFingerprint',
      'segmentStartMs',
      'segmentEndMs',
      'segmentTiming',
      'createdAt',
      'updatedAt'
    ]);
    expect(LIVE_CAPTION_CACHE_STORE_DEFINITIONS.translations.indexes.map((index) => index.name)).toEqual([
      'tabId',
      'sessionId',
      'videoFingerprint',
      'segmentStartMs',
      'segmentEndMs',
      'segmentTiming',
      'targetLanguage',
      'provider',
      'createdAt',
      'updatedAt'
    ]);
  });

  it('creates the stores and indexes on upgrade', async () => {
    const db = await openLiveCaptionCacheDatabase();
    await flush();

    expect(db.objectStoreNames.contains('session_index')).toBe(true);
    expect(db.objectStoreNames.contains('transcripts')).toBe(true);
    expect(db.objectStoreNames.contains('translations')).toBe(true);
    expect(getStore(indexedDbMock, 'transcripts').indexNames.contains('segmentTiming')).toBe(true);
    expect(getStore(indexedDbMock, 'translations').indexNames.contains('provider')).toBe(true);
  });

  it('stores transcript records separately and strips raw audio fields', async () => {
    const repository = new LiveCaptionTranscriptRepository();
    const result = await repository.appendSegment({
      tabId: 1,
      videoFingerprint: 'video-a',
      sessionId: 'session-a',
      segmentStartMs: 100,
      segmentEndMs: 250,
      originalText: 'Hello',
      sourceLanguage: 'en',
      audio: new Uint8Array([1, 2, 3]),
      stream: { id: 'raw-stream' },
      providerUtteranceId: 'utt-123',
      providerSequence: 12,
      providerRevision: 3,
      providerStreamId: 'stream-xyz',
      providerChannel: 2
    });

    await flush();

    expect(result).toMatchObject({
      tabId: 1,
      videoFingerprint: 'video-a',
      sessionId: 'session-a',
      originalText: 'Hello',
      providerUtteranceId: 'utt-123',
      providerSequence: 12,
      providerRevision: 3,
      providerStreamId: 'stream-xyz',
      providerChannel: 2
    });
    expect(result.audio).toBeUndefined();
    expect(result.stream).toBeUndefined();

    const store = getStore(indexedDbMock, 'transcripts');
    const persisted = [...store.records.values()][0];
    expect(persisted.audio).toBeUndefined();
    expect(persisted.stream).toBeUndefined();
    expect(persisted.providerUtteranceId).toBe('utt-123');
    expect(persisted.providerSequence).toBe(12);
    expect(persisted.providerRevision).toBe(3);
    expect(persisted.providerStreamId).toBe('stream-xyz');
    expect(persisted.providerChannel).toBe(2);

    const records = await repository.getByVideo({ tabId: 1, videoFingerprint: 'video-a' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      originalText: 'Hello',
      sourceLanguage: 'en',
      providerUtteranceId: 'utt-123',
      providerSequence: 12,
      providerRevision: 3,
      providerStreamId: 'stream-xyz',
      providerChannel: 2
    });

    await repository.clearVideo({ tabId: 1, videoFingerprint: 'video-a' });
    await flush();
    expect(await repository.getByVideo({ tabId: 1, videoFingerprint: 'video-a' })).toEqual([]);
  });

  it('stores translated caption records separately from transcripts', async () => {
    const transcriptRepository = new LiveCaptionTranscriptRepository();
    const translationRepository = new LiveCaptionTranslationRepository();

    await transcriptRepository.appendSegment({
      tabId: 1,
      videoFingerprint: 'video-b',
      sessionId: 'session-b',
      segmentStartMs: 10,
      segmentEndMs: 20,
      originalText: 'Original',
      sourceLanguage: 'en'
    });

    await translationRepository.appendSegment({
      tabId: 1,
      videoFingerprint: 'video-b',
      sessionId: 'session-b',
      segmentStartMs: 10,
      segmentEndMs: 20,
      originalText: 'Original',
      translatedText: 'ترجمه',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'openai',
      providerUtteranceId: 'utt-456',
      providerSequence: 13,
      providerRevision: 4,
      providerStreamId: 'stream-wxy',
      providerChannel: 3
    });

    await flush();

    const tRecords = await translationRepository.getByVideo({ tabId: 1, videoFingerprint: 'video-b' });
    expect(tRecords).toHaveLength(1);
    expect(tRecords[0]).toMatchObject({
      originalText: 'Original',
      translatedText: 'ترجمه',
      providerUtteranceId: 'utt-456',
      providerSequence: 13,
      providerRevision: 4,
      providerStreamId: 'stream-wxy',
      providerChannel: 3
    });

    expect(await transcriptRepository.getByVideo({ tabId: 1, videoFingerprint: 'video-b' })).toHaveLength(1);
    expect(getStore(indexedDbMock, 'transcripts').records.size).toBe(1);
    expect(getStore(indexedDbMock, 'translations').records.size).toBe(1);

    await translationRepository.clearVideo({ tabId: 1, videoFingerprint: 'video-b' });
    await flush();
    expect(await translationRepository.getByVideo({ tabId: 1, videoFingerprint: 'video-b' })).toEqual([]);
  });

  it('supports canonical transcript upsert by identity without changing append behavior', async () => {
    const repository = new LiveCaptionTranscriptRepository();

    const inserted = await repository.upsertTranscriptSegmentByIdentity(createTranscriptCanonicalSegment({
      revision: 1
    }));
    const replaced = await repository.upsertTranscriptSegmentByIdentity(createTranscriptCanonicalSegment({
      segmentStartMs: 30,
      segmentEndMs: 40,
      originalText: 'Hello updated',
      revision: 2
    }));
    const stale = await repository.upsertTranscriptSegmentByIdentity(createTranscriptCanonicalSegment({
      segmentStartMs: 50,
      segmentEndMs: 60,
      originalText: 'Hello stale',
      revision: 2
    }));
    const missingIdentity = await repository.upsertTranscriptSegmentByIdentity({
      tabId: 21,
      videoFingerprint: 'video-canonical',
      sessionId: 'session-canonical',
      segmentStartMs: 10,
      segmentEndMs: 20,
      originalText: 'Missing identity',
      revision: 1
    });

    await flush();

    expect(inserted).toMatchObject({ status: 'inserted', ignored: false, replaced: false });
    expect(replaced).toMatchObject({ status: 'replaced', ignored: false, replaced: true });
    expect(stale).toMatchObject({ status: 'ignored', ignored: true, reason: 'stale_revision' });
    expect(missingIdentity).toMatchObject({
      status: 'ignored',
      ignored: true,
      reason: 'missing_canonical_identity'
    });

    const current = await repository.getTranscriptSegmentByIdentity(canonicalIdentity);
    expect(current).toMatchObject({
      originalText: 'Hello updated',
      segmentStartMs: 30,
      segmentEndMs: 40,
      revision: 2
    });
    expect(getStore(indexedDbMock, 'transcripts').records.size).toBe(1);
  });

  it('supports canonical translated caption upsert by identity without changing append behavior', async () => {
    const repository = new LiveCaptionTranslationRepository();

    const inserted = await repository.upsertTranslatedCaptionSegmentByIdentity(createTranslatedCanonicalSegment({
      revision: 1
    }));
    const replaced = await repository.upsertTranslatedCaptionSegmentByIdentity(createTranslatedCanonicalSegment({
      segmentStartMs: 30,
      segmentEndMs: 40,
      originalText: 'Hello updated',
      translatedText: 'سلامِ جدید',
      revision: 2
    }));
    const stale = await repository.upsertTranslatedCaptionSegmentByIdentity(createTranslatedCanonicalSegment({
      segmentStartMs: 50,
      segmentEndMs: 60,
      originalText: 'Hello stale',
      translatedText: 'سلامِ قدیمی',
      revision: 2
    }));
    const missingIdentity = await repository.upsertTranslatedCaptionSegmentByIdentity({
      tabId: 21,
      videoFingerprint: 'video-canonical',
      sessionId: 'session-canonical',
      segmentStartMs: 10,
      segmentEndMs: 20,
      originalText: 'Hello',
      translatedText: 'سلام',
      targetLanguage: 'fa',
      provider: 'openai',
      revision: 1
    });
    const missingTarget = await repository.upsertTranslatedCaptionSegmentByIdentity({
      ...createTranslatedCanonicalSegment({ revision: 1 }),
      targetLanguage: null
    });

    await flush();

    expect(inserted).toMatchObject({ status: 'inserted', ignored: false, replaced: false });
    expect(replaced).toMatchObject({ status: 'replaced', ignored: false, replaced: true });
    expect(stale).toMatchObject({ status: 'ignored', ignored: true, reason: 'stale_revision' });
    expect(missingIdentity).toMatchObject({
      status: 'ignored',
      ignored: true,
      reason: 'missing_canonical_identity'
    });
    expect(missingTarget).toMatchObject({
      status: 'ignored',
      ignored: true,
      reason: 'missing_translation_identity'
    });

    const current = await repository.getTranslatedCaptionSegmentByIdentity({
      ...canonicalIdentity,
      targetLanguage: 'fa',
      providerId: 'openai'
    });
    expect(current).toMatchObject({
      originalText: 'Hello updated',
      translatedText: 'سلامِ جدید',
      segmentStartMs: 30,
      segmentEndMs: 40,
      revision: 2
    });
    expect(getStore(indexedDbMock, 'translations').records.size).toBe(1);
  });

  it('supports session cache append get clear and per-video keying', async () => {
    const cache = new LiveCaptionCache();
    const firstKey = createLiveCaptionSessionCacheKey(11, 'video-11');
    const secondKey = createLiveCaptionVideoCacheKey(11, 'video-12');

    expect(firstKey).not.toBe(secondKey);
    expect(createLiveCaptionSegmentCacheKey({
      tabId: 11,
      videoFingerprint: 'video-11',
      segmentStartMs: 5,
      segmentEndMs: 10
    })).toContain('segment:5-10');
    expect(createLiveCaptionTranslatedSegmentCacheKey({
      tabId: 11,
      videoFingerprint: 'video-11',
      segmentStartMs: 5,
      segmentEndMs: 10,
      targetLanguage: 'fa',
      providerId: 'openai'
    })).toContain('target:fa');

    await cache.appendTranscriptSegment({
      tabId: 11,
      videoFingerprint: 'video-11',
      sessionId: 'session-11',
      segmentStartMs: 5,
      segmentEndMs: 10,
      originalText: 'First',
      sourceLanguage: 'en'
    });
    await cache.appendTranslatedCaptionSegment({
      tabId: 11,
      videoFingerprint: 'video-11',
      sessionId: 'session-11',
      segmentStartMs: 5,
      segmentEndMs: 10,
      originalText: 'First',
      translatedText: 'اول',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'openai'
    });
    await cache.appendTranscriptSegment({
      tabId: 11,
      videoFingerprint: 'video-12',
      sessionId: 'session-12',
      segmentStartMs: 20,
      segmentEndMs: 30,
      originalText: 'Second',
      sourceLanguage: 'en'
    });

    await flush();

    expect(await cache.getTranscriptSegments({ tabId: 11, videoFingerprint: 'video-11' })).toHaveLength(1);
    expect(await cache.getTranslatedCaptionSegments({ tabId: 11, videoFingerprint: 'video-11' })).toHaveLength(1);
    expect(await cache.getTranscriptSegments({ tabId: 11, videoFingerprint: 'video-12' })).toHaveLength(1);
    expect(cache.getSnapshot().videoCount).toBe(2);

    await cache.clearVideo({ tabId: 11, videoFingerprint: 'video-11' });
    await flush();
    expect(await cache.getTranscriptSegments({ tabId: 11, videoFingerprint: 'video-11' })).toEqual([]);
    expect(await cache.getTranslatedCaptionSegments({ tabId: 11, videoFingerprint: 'video-11' })).toEqual([]);
  });

  it('supports canonical transcript and translated caption upserts through the cache facade', async () => {
    const cache = new LiveCaptionCache();

    const transcriptInserted = await cache.upsertTranscriptSegmentByIdentity(createTranscriptCanonicalSegment({
      revision: 1
    }));
    const transcriptReplaced = await cache.upsertTranscriptSegmentByIdentity(createTranscriptCanonicalSegment({
      segmentStartMs: 40,
      segmentEndMs: 55,
      originalText: 'Hello updated',
      revision: 2
    }));
    const transcriptIgnored = await cache.upsertTranscriptSegmentByIdentity(createTranscriptCanonicalSegment({
      segmentStartMs: 60,
      segmentEndMs: 70,
      originalText: 'Hello stale',
      revision: 2
    }));

    const translationInserted = await cache.upsertTranslatedCaptionSegmentByIdentity(createTranslatedCanonicalSegment({
      revision: 1
    }));
    const translationReplaced = await cache.upsertTranslatedCaptionSegmentByIdentity(createTranslatedCanonicalSegment({
      segmentStartMs: 40,
      segmentEndMs: 55,
      originalText: 'Hello updated',
      translatedText: 'سلامِ جدید',
      revision: 2
    }));
    const translationIgnored = await cache.upsertTranslatedCaptionSegmentByIdentity(createTranslatedCanonicalSegment({
      segmentStartMs: 60,
      segmentEndMs: 70,
      originalText: 'Hello stale',
      translatedText: 'سلامِ قدیمی',
      revision: 2
    }));

    await flush();

    expect(transcriptInserted).toMatchObject({ status: 'inserted', ignored: false, replaced: false });
    expect(transcriptReplaced).toMatchObject({ status: 'replaced', ignored: false, replaced: true });
    expect(transcriptIgnored).toMatchObject({ status: 'ignored', ignored: true, reason: 'stale_revision' });
    expect(translationInserted).toMatchObject({ status: 'inserted', ignored: false, replaced: false });
    expect(translationReplaced).toMatchObject({ status: 'replaced', ignored: false, replaced: true });
    expect(translationIgnored).toMatchObject({ status: 'ignored', ignored: true, reason: 'stale_revision' });

    expect(await cache.getTranscriptSegmentByIdentity(canonicalIdentity)).toMatchObject({
      originalText: 'Hello updated',
      segmentStartMs: 40,
      segmentEndMs: 55,
      revision: 2
    });
    expect(await cache.getTranslatedCaptionSegmentByIdentity({
      ...canonicalIdentity,
      targetLanguage: 'fa',
      providerId: 'openai'
    })).toMatchObject({
      originalText: 'Hello updated',
      translatedText: 'سلامِ جدید',
      segmentStartMs: 40,
      segmentEndMs: 55,
      revision: 2
    });
    expect(await cache.getTranscriptSegments({ tabId: 21, videoFingerprint: 'video-canonical' })).toHaveLength(1);
    expect(await cache.getTranslatedCaptionSegments({ tabId: 21, videoFingerprint: 'video-canonical' })).toHaveLength(1);
  });

  it('clears all session and persistent cache data', async () => {
    const cache = new LiveCaptionCache();

    await cache.appendTranscriptSegment({
      tabId: 2,
      videoFingerprint: 'video-clear',
      sessionId: 'session-clear',
      segmentStartMs: 1,
      segmentEndMs: 2,
      originalText: 'Clear me',
      sourceLanguage: 'en'
    });
    await cache.appendTranslatedCaptionSegment({
      tabId: 2,
      videoFingerprint: 'video-clear',
      sessionId: 'session-clear',
      segmentStartMs: 1,
      segmentEndMs: 2,
      originalText: 'Clear me',
      translatedText: 'پاک',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'openai'
    });

    await flush();
    await cache.clearAll();
    await flush();

    expect(cache.getSnapshot().videoCount).toBe(0);
    expect(getStore(indexedDbMock, 'session_index').records.size).toBe(0);
    expect(getStore(indexedDbMock, 'transcripts').records.size).toBe(0);
    expect(getStore(indexedDbMock, 'translations').records.size).toBe(0);
  });

  it('keeps incognito sessions session-only and skips persistent writes', async () => {
    const cache = new LiveCaptionCache({ isIncognito: true });

    await cache.appendTranscriptSegment({
      tabId: 99,
      videoFingerprint: 'incognito-video',
      sessionId: 'session-incognito',
      segmentStartMs: 1,
      segmentEndMs: 3,
      originalText: 'Secret',
      sourceLanguage: 'en'
    });

    await flush();

    expect(indexedDbMock.open).not.toHaveBeenCalled();
    expect(await cache.getTranscriptSegments({ tabId: 99, videoFingerprint: 'incognito-video' })).toHaveLength(1);
    expect(cache.getSnapshot().storageMode).toBe('session-only');
    expect(getStore(indexedDbMock, 'transcripts')).toBeUndefined();
  });

  it('supports per-bucket incognito state within a persistent cache instance', async () => {
    const cache = new LiveCaptionCache({ isIncognito: false });

    // Normal segment
    await cache.appendTranscriptSegment({
      tabId: 10,
      videoFingerprint: 'normal-video',
      sessionId: 'session-normal',
      segmentStartMs: 1,
      segmentEndMs: 2,
      originalText: 'Normal',
      sourceLanguage: 'en',
      isIncognito: false
    });

    // Incognito segment
    await cache.appendTranscriptSegment({
      tabId: 11,
      videoFingerprint: 'incognito-video',
      sessionId: 'session-incognito',
      segmentStartMs: 1,
      segmentEndMs: 2,
      originalText: 'Secret',
      sourceLanguage: 'en',
      isIncognito: true
    });

    await flush();

    expect(await cache.getTranscriptSegments({ tabId: 10, videoFingerprint: 'normal-video' })).toHaveLength(1);
    expect(await cache.getTranscriptSegments({ tabId: 11, videoFingerprint: 'incognito-video', isIncognito: true })).toHaveLength(1);

    const store = getStore(indexedDbMock, 'transcripts');
    expect(store.records.size).toBe(1); // Only normal segment persisted
    expect([...store.records.values()][0].originalText).toBe('Normal');
  });

  it('does not invoke capture stt translation or overlay layers', async () => {
    const cache = new LiveCaptionCache();

    await cache.appendTranscriptSegment({
      tabId: 7,
      videoFingerprint: 'video-no-runtime',
      sessionId: 'session-no-runtime',
      segmentStartMs: 1,
      segmentEndMs: 4,
      originalText: 'Runtime',
      sourceLanguage: 'en'
    });

    await flush();

    expect(globalThis.chrome.tabCapture.capture).not.toHaveBeenCalled();
    expect(STTProviderFactory).not.toHaveBeenCalled();
    expect(LiveCaptionTranslationAdapter).not.toHaveBeenCalled();
  });
});
