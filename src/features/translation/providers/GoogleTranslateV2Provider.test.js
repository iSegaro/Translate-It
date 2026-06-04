import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleTranslateV2Provider } from './GoogleTranslateV2Provider.js';
import { BaseTranslateProvider } from './BaseTranslateProvider.js';

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
    operation: vi.fn(),
    performance: vi.fn()
  })
}));

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    Page: 'page',
    Select_Element: 'select-element',
    Dictionary_Translation: 'dictionary'
  },
  getProviderOptimizationLevelAsync: vi.fn(() => Promise.resolve('balanced')),
  getGoogleTranslateV2UrlAsync: vi.fn(() => Promise.resolve('https://translate.google.com/translate_a/single')),
  getDictionaryShowPronunciationAsync: vi.fn(() => Promise.resolve(false)),
  getDictionaryShowPosAsync: vi.fn(() => Promise.resolve(false)),
  getDictionaryShowDefinitionsAsync: vi.fn(() => Promise.resolve(false)),
  getDictionaryShowExamplesAsync: vi.fn(() => Promise.resolve(false)),
  getSettingsAsync: vi.fn(() => Promise.resolve({}))
}));

vi.mock('@/features/translation/core/ProviderConfigurations.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProviderBatching: vi.fn(() => ({
    strategy: 'character_limit',
    characterLimit: 5000,
    maxChunksPerBatch: 150
  }))
}));

vi.mock('@/features/translation/core/TranslationStatsManager.js', () => ({
  statsManager: {
    getSessionSummary: vi.fn(() => null)
  }
}));

vi.mock('@/features/translation/core/StreamingManager.js', () => ({
  streamingManager: {
    initializeStream: vi.fn()
  }
}));

vi.mock('./utils/TraditionalStreamManager.js', () => ({
  TraditionalStreamManager: {
    streamChunkResults: vi.fn(),
    streamChunkError: vi.fn(),
    sendStreamEnd: vi.fn()
  }
}));

vi.mock('@/utils/browser/compatibility.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getBrowserInfoSync: vi.fn(() => ({ isFirefox: false, isMobile: false }))
}));

vi.mock('@/utils/i18n/i18n.js', () => ({
  getTranslationString: vi.fn(() => Promise.resolve(''))
}));

vi.mock('@/utils/translation/TranslationSegmentMapper.js', () => ({
  TranslationSegmentMapper: {
    mapTranslationToOriginalSegments: vi.fn((joined, originalTexts) =>
      originalTexts.map((_, index) => joined.split('|||')[index] || '')
    )
  }
}));

describe('GoogleTranslateV2Provider paragraph chunk isolation', () => {
  let provider;
  let baseCreateChunksSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GoogleTranslateV2Provider();
    baseCreateChunksSpy = vi.spyOn(BaseTranslateProvider.prototype, '_createChunks');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isolates paragraph-bearing items inside mixed multi-segment chunks', async () => {
    baseCreateChunksSpy.mockResolvedValue([
      { texts: ['A', 'B\n\nC', 'D'], charCount: 5 }
    ]);

    const chunks = await provider._createChunks(['A', 'B\n\nC', 'D']);

    expect(chunks.map(chunk => chunk.texts)).toEqual([
      ['A'],
      ['B\n\nC'],
      ['D']
    ]);
  });

  it('sends paragraph-bearing items to _translateChunk as single-item chunks', async () => {
    baseCreateChunksSpy.mockResolvedValue([
      { texts: ['A', 'B\n\nC', 'D'], charCount: 5 }
    ]);
    vi.spyOn(provider, '_executeWithRateLimit').mockImplementation(async (fn) => fn({}));
    const translateChunkSpy = vi.spyOn(provider, '_translateChunk').mockImplementation(async (texts) =>
      texts.map(text => `translated:${text}`)
    );

    const result = await provider._traditionalBatchTranslate(
      ['A', 'B\n\nC', 'D'],
      'en',
      'fa',
      'select-element',
      null,
      null,
      null,
      'high',
      'session-1',
      'STRING'
    );

    expect(translateChunkSpy.mock.calls.map(call => call[0])).toEqual([
      ['A'],
      ['B\n\nC'],
      ['D']
    ]);
    expect(result).toEqual([
      'translated:A',
      'translated:B\n\nC',
      'translated:D'
    ]);
  });

  it('keeps non-paragraph multi-segment chunks unchanged', async () => {
    const originalChunk = { texts: ['A', 'B', 'C'], charCount: 3 };
    baseCreateChunksSpy.mockResolvedValue([originalChunk]);

    const chunks = await provider._createChunks(['A', 'B', 'C']);

    expect(chunks).toEqual([originalChunk]);
  });

  it('preserves result order across isolated and batched chunks', async () => {
    baseCreateChunksSpy.mockResolvedValue([
      { texts: ['A', 'B\n\nC', 'D', 'E'], charCount: 7 }
    ]);
    vi.spyOn(provider, '_executeWithRateLimit').mockImplementation(async (fn) => fn({}));
    vi.spyOn(provider, '_translateChunk').mockImplementation(async (texts) =>
      texts.map(text => `translated:${text}`)
    );

    const result = await provider._traditionalBatchTranslate(
      ['A', 'B\n\nC', 'D', 'E'],
      'en',
      'fa',
      'select-element',
      null,
      null,
      null,
      'high',
      'session-1',
      'STRING'
    );

    expect(result).toEqual([
      'translated:A',
      'translated:B\n\nC',
      'translated:D',
      'translated:E'
    ]);
  });

  it('isolates paragraph-bearing Select Element object payloads without changing their identity', async () => {
    const first = { i: 'n1', t: 'A' };
    const paragraph = { i: 'n2', t: 'B\n\nC' };
    const last = { i: 'n3', t: 'D' };
    baseCreateChunksSpy.mockResolvedValue([
      { texts: [first, paragraph, last], charCount: 5 }
    ]);

    const chunks = await provider._createChunks([first, paragraph, last]);

    expect(chunks.map(chunk => chunk.texts)).toEqual([
      [first],
      [paragraph],
      [last]
    ]);
    expect(chunks[1].texts[0]).toBe(paragraph);
  });
});
