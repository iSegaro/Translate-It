import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleTranslateV2Provider } from './GoogleTranslateV2Provider.js';
import { BaseTranslateProvider } from './BaseTranslateProvider.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import {
  getDictionaryShowPronunciationAsync,
  getDictionaryShowPosAsync,
  getDictionaryShowDefinitionsAsync,
  getDictionaryShowExamplesAsync
} from '@/shared/config/config.js';
import { getTranslationString } from '@/utils/i18n/i18n.js';

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

describe('GoogleTranslateV2Provider newline chunk isolation', () => {
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

  it('isolates newline-bearing items inside mixed multi-segment chunks', async () => {
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

  it('isolates line-break-bearing items inside mixed multi-segment chunks', async () => {
    baseCreateChunksSpy.mockResolvedValue([
      { texts: ['A', 'B\nC', 'D'], charCount: 5 }
    ]);

    const chunks = await provider._createChunks(['A', 'B\nC', 'D']);

    expect(chunks.map(chunk => chunk.texts)).toEqual([
      ['A'],
      ['B\nC'],
      ['D']
    ]);
  });

  it('does not isolate whitespace-padded wrapper newlines', async () => {
    const originalChunk = { texts: ['A', '\n      Pinned\n    ', 'C'], charCount: 3 };
    baseCreateChunksSpy.mockResolvedValue([originalChunk]);

    const chunks = await provider._createChunks(['A', '\n      Pinned\n    ', 'C']);

    expect(chunks).toEqual([originalChunk]);
  });

  it('does not isolate indentation-only wrapper newlines around one content line', async () => {
    const first = { i: 'n1', t: 'A' };
    const wrapped = { i: 'n2', t: '\n        Webchat to API (Gemini)\n      ' };
    const last = { i: 'n3', t: 'C' };
    baseCreateChunksSpy.mockResolvedValue([
      { texts: [first, wrapped, last], charCount: 3 }
    ]);

    const chunks = await provider._createChunks([first, wrapped, last]);

    expect(chunks).toEqual([
      { texts: [first, wrapped, last], charCount: 3 }
    ]);
    expect(chunks[0].texts[1]).toBe(wrapped);
  });

  describe('_formatDictionaryAsMarkdown', () => {
    beforeEach(() => {
      vi.mocked(getDictionaryShowPronunciationAsync).mockResolvedValue(true);
      vi.mocked(getDictionaryShowPosAsync).mockResolvedValue(true);
      vi.mocked(getDictionaryShowDefinitionsAsync).mockResolvedValue(true);
      vi.mocked(getDictionaryShowExamplesAsync).mockResolvedValue(true);
      vi.mocked(getTranslationString).mockResolvedValue('');
    });

    it('formats legacy string candidates as the current Markdown contract', async () => {
      const result = await provider._formatDictionaryAsMarkdown(
        'Noun*Phrase: test, experiment\nVerb_(rare): try, attempt'
      );

      expect(result).toBe('**Noun\\*Phrase**: test, experiment\n**Verb\\_\\(rare\\)**: try, attempt');
    });

    it('formats dj=1 JSON candidates as the current Markdown contract', async () => {
      vi.mocked(getTranslationString).mockImplementation(async (key) => {
        const labels = {
          dict_pronunciation: 'Pronou[nce](ment)*',
          dict_definitions: 'Defi[nitions](set)*',
          dict_examples: 'Exam[ples](list)*'
        };

        return labels[key] || '';
      });

      const result = await provider._formatDictionaryAsMarkdown({
        dict: [{ pos: 'Noun*Phrase', terms: ['test', 'experiment'] }],
        sentences: [{ src_translit: 'tɛst*' }],
        definitions: [{ pos: 'noun', entry: [{ gloss: 'a *test* (example)' }] }],
        examples: { example: [{ text: 'This *is* a [test]' }] }
      });

      expect(result).toBe(
        '**Noun\\*Phrase**: test, experiment\n\n**Pronou\\[nce\\]\\(ment\\)\\***: /tɛst*/\n\n**Defi\\[nitions\\]\\(set\\)\\***:\n- (noun) a *test* (example)\n\n**Exam\\[ples\\]\\(list\\)\\***:\n- This *is* a [test]'
      );
    });

    it('returns an empty string for malformed or empty candidate data', async () => {
      expect(await provider._formatDictionaryAsMarkdown(null)).toBe('');
      expect(await provider._formatDictionaryAsMarkdown('')).toBe('');
      expect(await provider._formatDictionaryAsMarkdown({})).toBe('');
    });
  });

  describe('_translateChunk', () => {
    beforeEach(() => {
      vi.mocked(getDictionaryShowPronunciationAsync).mockResolvedValue(true);
      vi.mocked(getDictionaryShowPosAsync).mockResolvedValue(true);
      vi.mocked(getDictionaryShowDefinitionsAsync).mockResolvedValue(true);
      vi.mocked(getDictionaryShowExamplesAsync).mockResolvedValue(true);
      vi.mocked(getTranslationString).mockResolvedValue('');
    });

    it('returns translation only when dictionary data is absent', async () => {
      vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
        opts.extractResponse({
          sentences: [{ trans: 'translated text' }],
          src: 'en'
        })
      );

      const result = await provider._translateChunk(
        ['hello'],
        'en',
        'fa',
        'page',
        null,
        0,
        1,
        0,
        1,
        {}
      );

      expect(result).toBe('translated text');
    });

    it.each([
      ['empty response', {}],
      ['empty modern result', { sentences: [] }],
      ['invalid legacy result', { 0: {} }],
    ])('throws API_RESPONSE_INVALID for %s', async (_label, response) => {
      vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) => opts.extractResponse(response));

      await expect(provider._translateChunk(['source'], 'en', 'fa', 'page', null, 0, 1, 0, 1, {}))
        .rejects.toMatchObject({ type: 'API_RESPONSE_INVALID' });
    });

    it('appends single-segment dictionary output using the current Markdown contract', async () => {
      vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
        opts.extractResponse({
          sentences: [{ trans: 'translated text', src_translit: 'tɛst*' }],
          src: 'en',
          dict: [{ pos: 'Noun*Phrase', terms: ['test', 'experiment'] }],
          definitions: [{ pos: 'noun', entry: [{ gloss: 'a test' }] }],
          examples: { example: [{ text: 'This is a test' }] }
        })
      );

      const result = await provider._translateChunk(
        ['hello'],
        'en',
        'fa',
        'dictionary',
        null,
        0,
        1,
        0,
        1,
        {}
      );

      expect(result).toBe(
        'translated text\n\n**Noun\\*Phrase**: test, experiment\n\n**Pronunciation**: /tɛst*/\n\n**Definitions**:\n- (noun) a test\n\n**Examples**:\n- This is a test'
      );
    });
  });

  it('sends newline-bearing items to _translateChunk as single-item chunks', async () => {
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

  it('preserves Select Element object identity for line-break-bearing payloads', async () => {
    const first = { i: 'n1', t: 'A' };
    const lineBreak = { i: 'n2', t: 'B\nC' };
    const last = { i: 'n3', t: 'D' };
    baseCreateChunksSpy.mockResolvedValue([
      { texts: [first, lineBreak, last], charCount: 5 }
    ]);

    const chunks = await provider._createChunks([first, lineBreak, last]);

    expect(chunks.map(chunk => chunk.texts)).toEqual([
      [first],
      [lineBreak],
      [last]
    ]);
    expect(chunks[1].texts[0]).toBe(lineBreak);
  });

  it('isolates real single internal newlines', async () => {
    baseCreateChunksSpy.mockResolvedValue([
      { texts: ['A', 'Photo: Aryamhar\nBio: constitutional monarchist', 'C'], charCount: 3 }
    ]);

    const chunks = await provider._createChunks(['A', 'Photo: Aryamhar\nBio: constitutional monarchist', 'C']);

    expect(chunks.map(chunk => chunk.texts)).toEqual([
      ['A'],
      ['Photo: Aryamhar\nBio: constitutional monarchist'],
      ['C']
    ]);
  });

  it('isolates paragraph double newlines', async () => {
    baseCreateChunksSpy.mockResolvedValue([
      { texts: ['A', 'Paragraph one\n\nParagraph two', 'C'], charCount: 3 }
    ]);

    const chunks = await provider._createChunks(['A', 'Paragraph one\n\nParagraph two', 'C']);

    expect(chunks.map(chunk => chunk.texts)).toEqual([
      ['A'],
      ['Paragraph one\n\nParagraph two'],
      ['C']
    ]);
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

  it('isolates newline-bearing Select Element object payloads without changing their identity', async () => {
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

  it('normalizes duplicated slash-dash artifacts in the single-segment sentences parser', async () => {
    const sourceText = '+ /-';
    const apiResponse = {
      sentences: [
        { trans: '+ //-', orig: sourceText }
      ]
    };

    vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) => opts.extractResponse(apiResponse));

    const result = await provider._translateChunk(
      [sourceText],
      'en',
      'fa',
      'select-element',
      null,
      0,
      1,
      0,
      1,
      {}
    );

    expect(result).toBe('+ /-');
  });
});

describe('GoogleTranslateV2Provider delimiter classification', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GoogleTranslateV2Provider();
  });

  it('1. recognizes a structural delimiter even when trans is nonblank', async () => {
    vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
      opts.extractResponse([
        [
          ['ترجمه اول', 'A'],
          ['[[---]]\n ', '[[---]]\n '],
          ['ترجمه دوم', 'B']
        ]
      ])
    );

    const result = await provider._translateChunk(
      ['A', 'B'], 'en', 'fa', 'page', null, 0, 2, 0, 1, {}
    );

    expect(result).toEqual(['ترجمه اول', 'ترجمه دوم']);
  });

  it('2. preserves leading punctuation row (. ) as content', async () => {
    vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
      opts.extractResponse([
        [
          ['. ', '. '],
          ['مک اندرو', 'Macandrew']
        ]
      ])
    );

    const result = await provider._translateChunk(
      ['. Macandrew'], 'en', 'fa', 'page', null, 0, 1, 0, 1, {}
    );

    expect(result).toBe('. مک اندرو');
  });

  it('3. preserves comma punctuation as content', async () => {
    vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
      opts.extractResponse([
        [
          [', ', ', '],
          ['رهبری آن', 'leading it']
        ]
      ])
    );

    const result = await provider._translateChunk(
      [', leading it'], 'en', 'fa', 'page', null, 0, 1, 0, 1, {}
    );

    expect(result).toBe(', رهبری آن');
  });

  it('4. preserves (EP) as content', async () => {
    vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
      opts.extractResponse([
        [
          ['(EP)', '(EP)']
        ]
      ])
    );

    const result = await provider._translateChunk(
      ['(EP)'], 'en', 'fa', 'page', null, 0, 1, 0, 1, {}
    );

    expect(result).toBe('(EP)');
  });

  it('5. preserves 2PM as source-equal translation content', async () => {
    vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
      opts.extractResponse([
        [
          ['2PM', '2PM']
        ]
      ])
    );

    const result = await provider._translateChunk(
      ['2PM'], 'en', 'fa', 'page', null, 0, 1, 0, 1, {}
    );

    expect(result).toBe('2PM');
  });

  it('6. preserves "before [[---]] after" as content, not delimiter', async () => {
    vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
      opts.extractResponse([
        [
          ['قبل [[---]] بعد', 'before [[---]] after']
        ]
      ])
    );

    const result = await provider._translateChunk(
      ['before [[---]] after'], 'en', 'fa', 'page', null, 0, 1, 0, 1, {}
    );

    expect(result).toBe('قبل [[---]] بعد');
  });

  it('7. preserves "foo---bar" as normal content', async () => {
    vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
      opts.extractResponse([
        [
          ['فو---بار', 'foo---bar']
        ]
      ])
    );

    const result = await provider._translateChunk(
      ['foo---bar'], 'en', 'fa', 'page', null, 0, 1, 0, 1, {}
    );

    expect(result).toBe('فو---بار');
  });

  it('8. advances index exactly once per real delimiter zone', async () => {
    vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
      opts.extractResponse([
        [
          ['ترجمه اول', 'A'],
          ['', '\n[[---]]\n'],
          ['', '[[---]]\n'],
          ['ترجمه دوم', 'B']
        ]
      ])
    );

    const result = await provider._translateChunk(
      ['A', 'B'], 'en', 'fa', 'page', null, 0, 2, 0, 1, {}
    );

    expect(result).toEqual(['ترجمه اول', 'ترجمه دوم']);
  });

  it('9. handles Wikipedia-style split rows with nonblank trans delimiter without index drift', async () => {
    vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
      opts.extractResponse([
        [
          ['. ', '. '],
          ['فرماندهی مک اندرو', 'Macandrew assumed command of the'],
          ['[[---]]\n ', '[[---]]\n '],
          ['لشکر دوم سواره نظام هند', '2nd Indian Cavalry Division']
        ]
      ])
    );

    const result = await provider._translateChunk(
      ['. Macandrew assumed command of the', '2nd Indian Cavalry Division'],
      'en',
      'fa',
      'page',
      null,
      0,
      2,
      0,
      1,
      {}
    );

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('فرماندهی مک اندرو');
    expect(result[0]).toContain('.');
    expect(result[1]).toBe('لشکر دوم سواره نظام هند');
  });

  it('10. reconstructs exact N non-missing outputs for N source items', async () => {
    vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
      opts.extractResponse([
        [
          ['یک', 'One'],
          ['[[---]]', '[[---]]'],
          ['دو', 'Two'],
          ['[[---]]', '[[---]]'],
          ['سه', 'Three']
        ]
      ])
    );

    const result = await provider._translateChunk(
      ['One', 'Two', 'Three'], 'en', 'fa', 'page', null, 0, 3, 0, 1, {}
    );

    expect(result).toEqual(['یک', 'دو', 'سه']);
  });

  it('11. still rejects truly missing/omitted segments with API_RESPONSE_INVALID', async () => {
    vi.spyOn(provider, '_executeApiCall').mockImplementation(async (opts) =>
      // Response contains translation for 'first' only, missing 'second'
      opts.extractResponse([
        [
          ['تنها اولی', 'first']
        ]
      ])
    );

    let caughtError;
    try {
      await provider._translateChunk(['first', 'second'], 'en', 'fa', 'page', null, 0, 2, 0, 1, {});
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.type).toBe(ErrorTypes.API_RESPONSE_INVALID);
    expect(caughtError.message).toBe('Google V2 response omitted a translated segment');
  });
});
