import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LingvaProvider } from './LingvaProvider.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

vi.mock('webextension-polyfill', () => ({
  default: { storage: { local: { get: vi.fn(), set: vi.fn() } } }
}));
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    init: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()
  })
}));
vi.mock('@/shared/config/config.js', () => ({
  getLingvaApiUrlAsync: vi.fn().mockResolvedValue('https://lingva.test'),
  getProviderOptimizationLevelAsync: vi.fn(() => Promise.resolve('balanced')),
}));
vi.mock('@/shared/config/languageConstants.js', () => ({
  getProviderLanguageCode: vi.fn((lang) => lang),
  GLOBAL_TRUSTED_LANGUAGES: [],
  PROVIDER_LANGUAGE_PAIRS: {},
  PROVIDER_LANGUAGE_MAPPINGS: {}
}));
vi.mock('@/shared/constants/core.js', () => ({
  AUTO_DETECT_VALUE: 'auto'
}));
vi.mock('@/features/translation/core/ProviderConfigurations.js', () => ({
  DEFAULT_TEXT_DELIMITER: '\n[[---]]\n',
  ALTERNATIVE_DELIMITERS: ['[[---]]', '\n\n---\n\n', '\n---\n', '---', '\n\n', '\n'],
  getProviderBatching: vi.fn(() => ({
    strategy: 'character_limit',
    characterLimit: 5000,
    maxChunksPerBatch: 150,
  })),
  getProviderConfiguration: vi.fn(() => ({
    rateLimit: { maxConcurrent: 2, delayBetweenRequests: 100, adaptiveBackoff: { enabled: true } },
    batching: { strategy: 'character_limit', characterLimit: 5000, maxChunksPerBatch: 150 },
  })),
  PROVIDER_CONFIGURATIONS: {},
}));
vi.mock('@/features/translation/core/TranslationStatsManager.js', () => ({
  statsManager: {
    getSessionSummary: vi.fn(() => ({ chars: 100 })),
  },
}));
vi.mock('@/shared/config/translationConstants.js', () => ({
  TRANSLATION_CONSTANTS: { TEXT_DELIMITER: '\n[[---]]\n' },
}));
vi.mock('@/shared/error-management/ErrorMatcher.js', () => ({
  matchErrorToType: vi.fn(() => 'UNKNOWN'),
}));

const TEST_BUDGET = 100;
const TEST_OVERHEAD = 'https://lingva.test/api/v1/en/fa/'.length; // 33
const DELIMITER = LingvaProvider.TEXT_DELIMITER; // '\n\n---\n\n'

function createProvider(budget = TEST_BUDGET) {
  const p = new LingvaProvider();
  vi.spyOn(p, '_getApiPath').mockResolvedValue('https://lingva.test');
  vi.spyOn(p, '_getFullUrlBudget').mockReturnValue(budget);
  return p;
}

/**
 * Extract decoded request text from a captured Lingva URL.
 * Language-parameterized: works for any sl/tl pair.
 */
function extractRequestText(url, sourceLang = 'en', targetLang = 'fa') {
  const marker = `/api/v1/${sourceLang}/${targetLang}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) throw new Error(`Marker "${marker}" not found in URL: ${url}`);
  return decodeURIComponent(url.slice(idx + marker.length));
}

describe('LingvaProvider', () => {
  let provider;

  beforeEach(() => {
    provider = createProvider();
  });

  // ── URL Builder ────────────────────────────────────────────────────────

  describe('_buildRequestUrl', () => {
    it('builds correct URL shape', () => {
      const url = provider._buildRequestUrl('https://lingva.test', 'en', 'fa', 'hello');
      expect(url).toBe('https://lingva.test/api/v1/en/fa/hello');
    });

    it('encodes text exactly once', () => {
      const url = provider._buildRequestUrl('https://lingva.test', 'en', 'fa', 'a b');
      expect(url).toContain('a%20b');
      expect(url).not.toContain('%25');
    });

    it('preserves language codes in URL', () => {
      const url = provider._buildRequestUrl('https://lingva.test', 'de', 'ja', 'x');
      expect(url).toContain('/api/v1/de/ja/');
    });

    it('full URL length reflects encoded text, not raw text', () => {
      const text = 'این متن فارسی است';
      const url = provider._buildRequestUrl('https://lingva.test', 'en', 'fa', text);
      expect(url.length).toBeGreaterThan(text.length);
    });
  });

  // ── Endpoint Normalization ─────────────────────────────────────────────

  describe('_normalizeApiPath', () => {
    it('strips trailing slashes', () => {
      expect(provider._normalizeApiPath('https://lingva.test/')).toBe('https://lingva.test');
      expect(provider._normalizeApiPath('https://lingva.test///')).toBe('https://lingva.test');
    });

    it('preserves custom base path', () => {
      expect(provider._normalizeApiPath('https://my.host/lingva')).toBe('https://my.host/lingva');
    });

    it('rejects query endpoint', () => {
      expect(() => provider._normalizeApiPath('https://host?x=1')).toThrow(/query or hash/);
    });

    it('rejects hash endpoint', () => {
      expect(() => provider._normalizeApiPath('https://host#section')).toThrow(/query or hash/);
    });
  });

  // ── Response Contract ──────────────────────────────────────────────────

  describe('response contract', () => {
    const translate = async (response, texts = ['source']) => {
      vi.spyOn(provider, '_executeRequest').mockImplementation(
        async (options) => options.extractResponse(response)
      );
      return provider._translateChunk(texts, 'en', 'fa', 'selection');
    };

    it('accepts valid source-equal output', async () => {
      await expect(translate({ translation: 'URL' }, ['URL'])).resolves.toBe('URL');
    });

    it.each([undefined, {}, { translation: '' }, { translation: '   ' }])(
      'rejects invalid response %p',
      async (response) => {
        await expect(translate(response)).rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
      }
    );

    it('preserves output longer than source', async () => {
      await expect(translate({ translation: 'یک ترجمه بسیار طولانی' }, ['Hi']))
        .resolves.toBe('یک ترجمه بسیار طولانی');
    });

    it('rejects blank mapped output for a nonblank source', async () => {
      const response = 'A2' + DELIMITER + '' + DELIMITER + 'C2';
      await expect(translate({ translation: response }, ['A', 'B', 'C']))
        .rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
    });

    it.each(['   ', '\n\t'])('rejects %j mapped output for a nonblank source', async (blankTranslation) => {
      const response = 'A2' + DELIMITER + blankTranslation + DELIMITER + 'C2';
      await expect(translate({ translation: response }, ['A', 'B', 'C']))
        .rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
    });

    it('preserves blank source positions', async () => {
      const response = '' + DELIMITER + 'A2';
      await expect(translate({ translation: response }, ['', 'A'])).resolves.toBe(response);
      await expect(translate({ translation: response }, ['   ', 'A'])).resolves.toBe(response);
    });

    it('preserves valid multi-item mapping order', async () => {
      const response = 'A2' + DELIMITER + 'B2' + DELIMITER + 'C2';
      await expect(translate({ translation: response }, ['A', 'B', 'C'])).resolves.toBe(response);
    });
  });

  // ── Budget Partitioning ────────────────────────────────────────────────

  describe('budget partitioning', () => {
    it('single item within budget produces one request', async () => {
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk(['hello'], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(1);
    });

    it('two items within budget produce one request', async () => {
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk(['a'.repeat(26), 'b'.repeat(26)], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(1);
    });

    it('two items exceeding budget produce two requests', async () => {
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk(['a'.repeat(27), 'b'.repeat(27)], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(2);
    });

    it('three items: first two fit, third forces new subgroup', async () => {
      const item = 'a'.repeat(26);
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk([item, item, item], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(2);
    });

    it('every subgroup URL is within budget', async () => {
      const item = 'a'.repeat(27);
      const urls = [];
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        urls.push(opts.url);
        return 'ok';
      });
      await provider._translateChunk([item, item], 'en', 'fa', 'selection');
      for (const url of urls) {
        expect(url.length).toBeLessThanOrEqual(TEST_BUDGET);
      }
    });

    it('delimiter encoded overhead participates in budget decision', async () => {
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk(['a'.repeat(60), 'b'], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(2);
    });

    it('longer custom API path reduces payload room', async () => {
      vi.spyOn(provider, '_getApiPath').mockResolvedValue('https://very-long-custom-domain.example.com/lingva');
      const item = 'x'.repeat(30);
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk([item, item], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalled();
    });

    it('Persian text partitions based on encoded URL, not raw length', async () => {
      const persianItem = 'ع'.repeat(10);
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk([persianItem, persianItem], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(2);
    });

    it('emoji text uses full encoded URL measurement', async () => {
      const emojiItem = '😀'.repeat(5);
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk([emojiItem], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(1);
    });

    it('exact budget boundary fits one request', async () => {
      const textLen = TEST_BUDGET - TEST_OVERHEAD;
      const text = 'a'.repeat(textLen);
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk([text], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(1);
      const url = exec.mock.calls[0][0].url;
      expect(url.length).toBe(TEST_BUDGET);
    });

    it('one byte over budget as single item throws TEXT_TOO_LONG', async () => {
      const oversized = 'a'.repeat(TEST_BUDGET - TEST_OVERHEAD + 1);
      const exec = vi.spyOn(provider, '_executeRequest');
      await expect(provider._translateChunk([oversized], 'en', 'fa', 'selection'))
        .rejects.toMatchObject({ type: ErrorTypes.TEXT_TOO_LONG });
      expect(exec).not.toHaveBeenCalled();
    });

    it('non-default language codes use correct URL marker', async () => {
      let capturedUrl;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        capturedUrl = opts.url;
        return 'ok';
      });
      await provider._translateChunk(['hello'], 'de', 'ja', 'selection');
      expect(extractRequestText(capturedUrl, 'de', 'ja')).toBe('hello');
    });
  });

  // ── Sequential Ordering ────────────────────────────────────────────────

  describe('sequential ordering', () => {
    it('subgroup requests execute sequentially, not concurrently', async () => {
      const item = 'a'.repeat(27);
      const callOrder = [];
      const deferreds = [];

      vi.spyOn(provider, '_executeRequest').mockImplementation(async () => {
        const idx = callOrder.length;
        callOrder.push('start-' + idx);
        const d = {};
        d.promise = new Promise((resolve) => { d.resolve = resolve; });
        deferreds.push(d);
        await d.promise;
        return 'ok-' + idx;
      });

      const promise = provider._translateChunk([item, item], 'en', 'fa', 'selection');

      // Proof: only 1 call started, second hasn't begun
      await vi.waitFor(() => expect(callOrder).toHaveLength(1));
      expect(callOrder[0]).toBe('start-0');
      expect(deferreds).toHaveLength(1);

      // Resolve first → second starts only after first completes
      deferreds[0].resolve();
      await vi.waitFor(() => expect(callOrder).toHaveLength(2));
      expect(callOrder[1]).toBe('start-1');

      deferreds[1].resolve();
      await promise;
      expect(callOrder).toEqual(['start-0', 'start-1']);
    });

    it('three subgroups produce responses joined in source order', async () => {
      const items = ['a'.repeat(27), 'b'.repeat(27), 'c'.repeat(27)];
      vi.spyOn(provider, '_executeRequest')
        .mockResolvedValueOnce('R1')
        .mockResolvedValueOnce('R2')
        .mockResolvedValueOnce('R3');

      const result = await provider._translateChunk(items, 'en', 'fa', 'selection');
      expect(result).toBe(['R1', 'R2', 'R3'].join(DELIMITER));
    });
  });

  // ── Single Oversized Item ──────────────────────────────────────────────

  describe('single oversized item', () => {
    it('throws TEXT_TOO_LONG for single item exceeding budget', async () => {
      const oversized = 'a'.repeat(TEST_BUDGET - TEST_OVERHEAD + 10);
      const exec = vi.spyOn(provider, '_executeRequest');
      await expect(provider._translateChunk([oversized], 'en', 'fa', 'selection'))
        .rejects.toMatchObject({ type: ErrorTypes.TEXT_TOO_LONG });
      expect(exec).not.toHaveBeenCalled();
    });

    it('throws TEXT_TOO_LONG for middle oversized item', async () => {
      const ok = 'a'.repeat(10);
      const oversized = 'b'.repeat(TEST_BUDGET - TEST_OVERHEAD + 10);
      const exec = vi.spyOn(provider, '_executeRequest');
      await expect(provider._translateChunk([ok, oversized, ok], 'en', 'fa', 'selection'))
        .rejects.toMatchObject({ type: ErrorTypes.TEXT_TOO_LONG });
      expect(exec).not.toHaveBeenCalled();
    });

    it('throws TEXT_TOO_LONG for last oversized item', async () => {
      const ok = 'a'.repeat(10);
      const oversized = 'b'.repeat(TEST_BUDGET - TEST_OVERHEAD + 10);
      const exec = vi.spyOn(provider, '_executeRequest');
      await expect(provider._translateChunk([ok, oversized], 'en', 'fa', 'selection'))
        .rejects.toMatchObject({ type: ErrorTypes.TEXT_TOO_LONG });
      expect(exec).not.toHaveBeenCalled();
    });

    it('no request sent for any plan containing an oversized item', async () => {
      const oversized = 'a'.repeat(TEST_BUDGET - TEST_OVERHEAD + 10);
      const exec = vi.spyOn(provider, '_executeRequest');
      try { await provider._translateChunk([oversized], 'en', 'fa', 'selection'); } catch { /* */ }
      expect(exec).not.toHaveBeenCalled();
    });
  });

  // ── Blank Items: Exact Request Text ────────────────────────────────────

  describe('blank items — exact request text', () => {
    it('leading blank', async () => {
      let capturedUrl;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        capturedUrl = opts.url;
        return 'ok';
      });
      await provider._translateChunk(['', 'hello'], 'en', 'fa', 'selection');
      expect(extractRequestText(capturedUrl)).toBe(['', 'hello'].join(DELIMITER));
    });

    it('trailing blank', async () => {
      let capturedUrl;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        capturedUrl = opts.url;
        return 'ok';
      });
      await provider._translateChunk(['hello', ''], 'en', 'fa', 'selection');
      expect(extractRequestText(capturedUrl)).toBe(['hello', ''].join(DELIMITER));
    });

    it('middle blank', async () => {
      let capturedUrl;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        capturedUrl = opts.url;
        return 'ok';
      });
      await provider._translateChunk(['hello', '', 'world'], 'en', 'fa', 'selection');
      expect(extractRequestText(capturedUrl)).toBe(['hello', '', 'world'].join(DELIMITER));
    });

    it('multiple blanks', async () => {
      let capturedUrl;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        capturedUrl = opts.url;
        return 'ok';
      });
      await provider._translateChunk(['a', '', 'b', '', 'c'], 'en', 'fa', 'selection');
      expect(extractRequestText(capturedUrl)).toBe(['a', '', 'b', '', 'c'].join(DELIMITER));
    });

    it('whitespace-only blank: preserved as whitespace in request (not normalized)', async () => {
      let capturedUrl;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        capturedUrl = opts.url;
        return 'ok';
      });
      await provider._translateChunk(['   ', 'hello'], 'en', 'fa', 'selection');
      // getTextInfo('   ') → { text: '   ' }. normalize: '   '.replace(/\//g,' ') → '   '.
      // URL-encoded '   ' is '%20%20%20'. decodeURIComponent → '   '.
      // Downstream mapper .trim() on this produces '', but request construction preserves whitespace.
      const decoded = extractRequestText(capturedUrl);
      expect(decoded).toBe(['   ', 'hello'].join(DELIMITER));
      expect(decoded.split(DELIMITER)).toHaveLength(2);
      // The first segment contains the original whitespace, not an empty string
      expect(decoded.split(DELIMITER)[0]).toBe('   ');
    });
  });

  // ── Blank Items: Request Count and Subgroup Composition ────────────────

  describe('blank items — request count and subgroup composition', () => {
    it('["", "hello"] → exactly 1 request', async () => {
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk(['', 'hello'], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(1);
    });

    it('["hello", ""] → exactly 1 request', async () => {
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk(['hello', ''], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(1);
    });

    it('["a", "", "b", "", "c"] → exactly 1 request', async () => {
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk(['a', '', 'b', '', 'c'], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(1);
    });

    it('blank adds delimiter overhead: forces split', async () => {
      const item = 'a'.repeat(27);
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk([item, '', item], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(2);
    });

    it('blank at subgroup boundary: exact subgroup decoded text', async () => {
      const item = 'a'.repeat(27);
      const urls = [];
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        urls.push(opts.url);
        return 'ok';
      });
      await provider._translateChunk([item, '', item], 'en', 'fa', 'selection');
      expect(urls).toHaveLength(2);
      expect(extractRequestText(urls[0]).split(DELIMITER)).toEqual([item, '']);
      expect(extractRequestText(urls[1]).split(DELIMITER)).toEqual([item]);
    });
  });

  // ── All-Blank Items ────────────────────────────────────────────────────

  describe('all-blank items — preserved legacy behavior', () => {
    it('[""] → 1 request with empty decoded text', async () => {
      let capturedUrl;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        capturedUrl = opts.url;
        return 'ok';
      });
      await provider._translateChunk([''], 'en', 'fa', 'selection');
      expect(extractRequestText(capturedUrl)).toBe('');
    });

    it('["   "] → 1 request with whitespace preserved', async () => {
      let capturedUrl;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        capturedUrl = opts.url;
        return 'ok';
      });
      await provider._translateChunk(['   '], 'en', 'fa', 'selection');
      expect(extractRequestText(capturedUrl)).toBe('   ');
    });

    it('["", "   ", ""] → 1 request with correct delimiter structure', async () => {
      let capturedUrl;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        capturedUrl = opts.url;
        return 'ok';
      });
      await provider._translateChunk(['', '   ', ''], 'en', 'fa', 'selection');
      const decoded = extractRequestText(capturedUrl);
      expect(decoded).toBe(['', '   ', ''].join(DELIMITER));
      expect(decoded.split(DELIMITER)).toHaveLength(3);
    });

    it('blank Lingva response for nonblank content → API_RESPONSE_INVALID', async () => {
      vi.spyOn(provider, '_executeRequest').mockImplementation(
        async (opts) => opts.extractResponse({ translation: '' })
      );
      await expect(provider._translateChunk(['hello'], 'en', 'fa', 'selection'))
        .rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
    });
  });

  // ── Real Provider/Mapper Integration ───────────────────────────────────
  //
  // These tests exercise the ACTUAL call chain:
  //   BaseTranslateProvider._traditionalBatchTranslate()
  //   → LingvaProvider._translateChunk()
  //   → joined Lingva response string
  //   → TranslationSegmentMapper.mapTranslationToOriginalSegments()
  //   → final positional array
  //
  // They use the real TranslationSegmentMapper (not mocked).
  // Only the physical Lingva request boundary (_executeRequest) is mocked.

  describe('provider/mapper integration — real BaseTranslateProvider path', () => {
    /**
     * Helper: run the real _traditionalBatchTranslate path.
     * Mocks _executeRequest to return a joined Lingva response string,
     * then exercises the full BaseTranslateProvider → mapper pipeline.
     */
    async function runBatchTranslate(sourceTexts, lingvaResponse) {
      vi.spyOn(provider, '_executeRequest').mockImplementation(
        async (opts) => opts.extractResponse({ translation: lingvaResponse })
      );
      return provider._traditionalBatchTranslate(
        sourceTexts, 'en', 'fa', 'popup', null, null, null, 1, 'session-1'
      );
    }

    it('["A", "", "B"] with correct delimiter response → ["TA", "", "TB"]', async () => {
      const response = 'TA' + DELIMITER + '' + DELIMITER + 'TB';
      const result = await runBatchTranslate(['A', '', 'B'], response);
      expect(result).toEqual(['TA', '', 'TB']);
    });

    it('["", "A"] with correct delimiter response → ["", "TA"]', async () => {
      const response = '' + DELIMITER + 'TA';
      const result = await runBatchTranslate(['', 'A'], response);
      expect(result).toEqual(['', 'TA']);
    });

    it('["A", ""] with correct delimiter response → ["TA", ""]', async () => {
      const response = 'TA' + DELIMITER + '';
      const result = await runBatchTranslate(['A', ''], response);
      expect(result).toEqual(['TA', '']);
    });

    it('["", "A", ""] with correct delimiter response → ["", "TA", ""]', async () => {
      const response = '' + DELIMITER + 'TA' + DELIMITER + '';
      const result = await runBatchTranslate(['', 'A', ''], response);
      expect(result).toEqual(['', 'TA', '']);
    });

    it('["A", "", "B"] with missing blank (2 segments) → ["TA", "", "TB"] (safe fallback)', async () => {
      // Response has 2 segments instead of 3 — blank was dropped by provider.
      // Source-aware blank reconstruction matches 2 parts to 2 nonblank originals.
      const response = 'TA' + DELIMITER + 'TB';
      const result = await runBatchTranslate(['A', '', 'B'], response);
      expect(result).toEqual(['TA', '', 'TB']);
    });

    it('result count always equals source count', async () => {
      const sources = ['A', '', 'B', '', 'C'];
      const response = 'TA' + DELIMITER + '' + DELIMITER + 'TB' + DELIMITER + '' + DELIMITER + 'TC';
      const result = await runBatchTranslate(sources, response);
      expect(result.length).toBe(sources.length);
    });
  });

  // ── Failure Atomicity ──────────────────────────────────────────────────

  describe('failure atomicity', () => {
    it('first subgroup failure rejects whole chunk, no later requests', async () => {
      const item = 'a'.repeat(27);
      let callCount = 0;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('fail-1');
        return 'ok';
      });

      await expect(provider._translateChunk([item, item], 'en', 'fa', 'selection'))
        .rejects.toThrow('fail-1');
      expect(callCount).toBe(1);
    });

    it('middle subgroup failure discards earlier results', async () => {
      const item = 'a'.repeat(27);
      let callCount = 0;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async () => {
        callCount++;
        if (callCount === 2) throw new Error('fail-2');
        return 'ok-' + callCount;
      });

      await expect(provider._translateChunk([item, item, item], 'en', 'fa', 'selection'))
        .rejects.toThrow('fail-2');
      expect(callCount).toBe(2);
    });

    it('last subgroup failure discards all earlier results', async () => {
      const item = 'a'.repeat(27);
      let callCount = 0;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async () => {
        callCount++;
        if (callCount === 3) throw new Error('fail-3');
        return 'ok-' + callCount;
      });

      await expect(provider._translateChunk([item, item, item], 'en', 'fa', 'selection'))
        .rejects.toThrow('fail-3');
      expect(callCount).toBe(3);
    });

    it('no partial result escapes after subgroup failure', async () => {
      const item = 'a'.repeat(27);
      let callCount = 0;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async () => {
        callCount++;
        if (callCount === 2) throw new Error('fail');
        return 'translated-' + callCount;
      });

      const result = await provider._translateChunk([item, item, item], 'en', 'fa', 'selection')
        .catch(() => null);
      expect(result).toBeNull();
    });

    it.each([
      [ErrorTypes.NETWORK_ERROR, 'fetch failed'],
      [ErrorTypes.USER_CANCELLED, 'cancelled'],
      [ErrorTypes.TRANSLATION_TIMEOUT, 'timeout'],
      [ErrorTypes.API_RESPONSE_INVALID, 'bad response']
    ])('preserves error type %s', async (type, message) => {
      const err = new Error(message);
      err.type = type;
      vi.spyOn(provider, '_executeRequest').mockRejectedValue(err);

      await expect(provider._translateChunk(['hello'], 'en', 'fa', 'selection'))
        .rejects.toMatchObject({ type });
    });
  });

  // ── Pre-Patch Regression Proof ─────────────────────────────────────────

  describe('pre-patch regression proof', () => {
    it('raw length under 1200 but encoded URL over budget is rejected locally', () => {
      const encodedBytesPerChar = encodeURIComponent('ع').length;
      const textLen = Math.floor((TEST_BUDGET - TEST_OVERHEAD + 100) / encodedBytesPerChar);
      const text = 'ع'.repeat(textLen);

      expect(text.length).toBeLessThan(1200);
      const fullUrl = provider._buildRequestUrl('https://lingva.test', 'en', 'fa', text);
      expect(fullUrl.length).toBeGreaterThan(TEST_BUDGET);
    });

    it('single item under old guard but over budget throws TEXT_TOO_LONG', async () => {
      const encodedBytesPerChar = encodeURIComponent('ع').length;
      const textLen = Math.floor((TEST_BUDGET - TEST_OVERHEAD + 100) / encodedBytesPerChar);
      const text = 'ع'.repeat(textLen);

      expect(text.length).toBeLessThan(1200);

      const exec = vi.spyOn(provider, '_executeRequest');
      await expect(provider._translateChunk([text], 'en', 'fa', 'selection'))
        .rejects.toMatchObject({ type: ErrorTypes.TEXT_TOO_LONG });
      expect(exec).not.toHaveBeenCalled();
    });

    it('multi-item joined URL over budget is partitioned safely', async () => {
      const item = 'a'.repeat(27);
      const exec = vi.spyOn(provider, '_executeRequest').mockResolvedValue('ok');
      await provider._translateChunk([item, item], 'en', 'fa', 'selection');
      expect(exec).toHaveBeenCalledTimes(2);
      for (const call of exec.mock.calls) {
        expect(call[0].url.length).toBeLessThanOrEqual(TEST_BUDGET);
      }
    });
  });

  // ── Rebatched + Mapper Integration (Real _traditionalBatchTranslate Path) ─

  describe('rebatched integration — real _traditionalBatchTranslate path', () => {
    it('rejects invalid mapped output in later subgroup without partial result', async () => {
      const item = 'a'.repeat(26);
      let callCount = 0;
      const exec = vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        callCount++;
        const translation = callCount === 1
          ? 'TA' + DELIMITER + 'TB'
          : 'TC' + DELIMITER + '   ';
        return opts.extractResponse({ translation });
      });

      let result;
      let error;
      try {
        result = await provider._translateChunk([item, item, item, item], 'en', 'fa', 'selection');
      } catch (caughtError) {
        error = caughtError;
      }

      expect(error).toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
      expect(result).toBeUndefined();
      expect(callCount).toBe(2);
      expect(exec).toHaveBeenCalledTimes(2);
    });

    /**
     * Helper: run the real _traditionalBatchTranslate → _translateChunk → mapper path.
     * Only _executeRequest is mocked. Mapper, chunking, and rate limit are real.
     */
    async function runBatchTranslate(sourceTexts, mockPerSubgroup) {
      let callIdx = 0;
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        callIdx++;
        const translation = mockPerSubgroup(callIdx, opts);
        return opts.extractResponse({ translation });
      });
      return provider._traditionalBatchTranslate(
        sourceTexts, 'en', 'fa', 'popup', null, null, null, 1, 'session-1'
      );
    }

    it('["large1", "", "large2"] → 2 physical requests → ["TA", "", "TB"]', async () => {
      const large1 = 'a'.repeat(30);
      const large2 = 'b'.repeat(30);
      // 2 subgroups: [large1, ''] and [large2]. Exact decoded texts are asserted below.
      const result = await runBatchTranslate([large1, '', large2], (callIdx) => {
        return callIdx === 1 ? 'TA' : 'TB';
      });
      expect(result).toEqual(['TA', '', 'TB']);
      expect(result.length).toBe(3);
    });

    it('request texts are exactly correct for each subgroup', async () => {
      const large1 = 'a'.repeat(30);
      const large2 = 'b'.repeat(30);
      const capturedTexts = [];
      await runBatchTranslate([large1, '', large2], (callIdx, opts) => {
        capturedTexts.push(extractRequestText(opts.url));
        return callIdx === 1 ? 'TA' : 'TB';
      });
      expect(capturedTexts).toHaveLength(2);
      expect(capturedTexts[0]).toBe([large1, ''].join(DELIMITER));
      expect(capturedTexts[1]).toBe(large2);
    });

    it('no source fallback, no fabricated blank translations', async () => {
      const large1 = 'a'.repeat(30);
      const large2 = 'b'.repeat(30);
      const result = await runBatchTranslate([large1, '', large2], (callIdx) => {
        return callIdx === 1 ? 'TA' : 'TB';
      });
      // No segment should contain the original source text
      expect(result).not.toContain(large1);
      expect(result).not.toContain(large2);
      // Blank at index 1 must be exactly ''
      expect(result[1]).toBe('');
    });

    it('incomplete cardinality → rejects with API_RESPONSE_INVALID', async () => {
      // Source: 3 nonblank items, all fit in one subgroup (budget=100, overhead=33).
      // Mock returns a single response containing the structural Lingva delimiter
      // ('\n\n---\n\n') but only 2 translated parts for 3 originals → mapper throws
      // INCOMPLETE_CARDINALITY → BaseTranslateProvider converts to API_RESPONSE_INVALID.
      await expect(runBatchTranslate(['A', 'B', 'C'], () => {
        return 'TA' + DELIMITER + 'TB';
      })).rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
    });
  });

  // ── Regression ─────────────────────────────────────────────────────────

  describe('regression', () => {
    it('valid under-budget request works normally', async () => {
      vi.spyOn(provider, '_executeRequest').mockResolvedValue('result');
      const result = await provider._translateChunk(['short text'], 'en', 'fa', 'selection');
      expect(result).toBe('result');
    });

    it('output longer than source is preserved', async () => {
      vi.spyOn(provider, '_executeRequest').mockResolvedValue('یک ترجمه بسیار طولانی');
      await expect(provider._translateChunk(['Hi'], 'en', 'fa', 'selection'))
        .resolves.toBe('یک ترجمه بسیار طولانی');
    });
  });
});
