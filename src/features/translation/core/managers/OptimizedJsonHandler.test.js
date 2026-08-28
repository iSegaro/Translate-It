import { describe, it, expect, vi, beforeEach } from 'vitest';

const loggerDebug = vi.hoisted(() => vi.fn());
const resolveOperationSourceLanguage = vi.hoisted(() => vi.fn());
const queueCancelMock = vi.hoisted(() => vi.fn());

// Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      sendMessage: vi.fn().mockResolvedValue(true)
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(true)
      }
    },
    runtime: {
      getManifest: () => ({ version: '1.0.0' })
    }
  }
}));

vi.mock('@/shared/error-management/ErrorMatcher.js');

import { OptimizedJsonHandler } from './OptimizedJsonHandler.js';
import { ErrorMatcher, isFatalError, matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { appendTranslationDiagnostic } from '@/features/translation/ir/TranslationOperation.js';
import { getProviderConfiguration } from '@/features/translation/core/ProviderConfigurations.js';
import { TranslationBatcher } from '@/features/translation/core/utils/TranslationBatcher.js';
import { createManifestView, createRequestUnitManifest } from '@/features/translation/ir/RequestUnitManifest.js';
import { TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS } from '@/shared/constants/translation.js';
import { TranslationCallPurpose } from '@/features/translation/providers/ProviderConstants.js';
import { AIResponseParser } from '@/features/translation/providers/utils/AIResponseParser.js';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: loggerDebug,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('@/features/translation/core/TranslationStatsManager.js', () => ({
  statsManager: {
    getSessionSummary: vi.fn(() => ({ chars: 100, originalChars: 80 })),
    printSummary: vi.fn()
  }
}));

vi.mock('@/features/translation/core/OperationSourceLanguageResolver.js', () => ({
  resolveOperationSourceLanguage,
}));

vi.mock('@/features/translation/ir/TranslationOperation.js', () => ({
  appendTranslationDiagnostic: vi.fn()
}));

// Partial mocks for dynamic imports
vi.mock('@/features/translation/core/ProviderConfigurations.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getProviderConfiguration: vi.fn(() => ({
      batching: { optimalSize: 2, maxChars: 1000 },
      rateLimit: { maxConcurrent: 2 }
    }))
  };
});

vi.mock('@/features/translation/core/QueueManager.js', () => ({
  queueManager: { cancelByMessageId: queueCancelMock }
}));

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    Select_Element: 'select_element',
    PDF: 'pdf-translation'
  },
  getAIConversationHistoryEnabledAsync: vi.fn().mockResolvedValue(false),
  getProviderOptimizationLevelAsync: vi.fn().mockResolvedValue(3)
}));

describe('OptimizedJsonHandler', () => {
  let handler;
  let mockEngine;
  let mockProvider;
  let mockAbortController;

  const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    return { promise, resolve, reject };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    loggerDebug.mockClear();
    queueCancelMock.mockClear();
    resolveOperationSourceLanguage.mockResolvedValue({
      canBypassSequentialGate: false,
      bypassReason: 'LOW_CONFIDENCE',
    });

    // Default mock behavior for ErrorMatcher
    isFatalError.mockImplementation((err) => err?.isFatal || false);
    matchErrorToType.mockImplementation((err) => err?.type || 'UNKNOWN_ERROR');
    ErrorMatcher.matchErrorToType.mockImplementation((err) => (
      err?.operationAborted ? ErrorTypes.TRANSLATION_ERROR : err?.type || 'UNKNOWN_ERROR'
    ));

    handler = new OptimizedJsonHandler();

    mockAbortController = {
      signal: { 
        aborted: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      },
       abort: vi.fn(function(reason) {
         this.signal.aborted = true;
         this.signal.reason = reason;
       })
    };

    mockEngine = {
      lifecycleRegistry: {
        getAbortController: vi.fn(() => mockAbortController),
        registerRequest: vi.fn(() => mockAbortController),
        unregisterRequest: vi.fn()
      },
      createIntelligentBatches: vi.fn((segments) => [
        [segments[0]], 
        [segments[1]]
      ]),
      isCancelled: vi.fn(() => false)
    };

    mockProvider = {
      providerName: 'TestProvider',
      constructor: { batchStrategy: 'json', isAI: true },
      translate: vi.fn()
    };
  });

  describe('_mapResults', () => {
    it('should map array results back to segments', () => {
      const original = ['s1', 's2'];
      const translated = ['t1', 't2'];
      const result = handler._mapResults(original, translated);
      expect(result).toEqual(['t1', 't2']);
    });

    it('characterizes traditional Select Element positional mapping for same-cardinality results', () => {
      const original = [
        { t: 'A', i: 'n1', blockId: 'b1' },
        { t: 'B', i: 'n2', blockId: 'b2' },
        { t: 'C', i: 'n3', blockId: 'b3' },
      ];

      expect(handler._mapResults(original, ['TA', 'TB', 'TC'])).toEqual([
        { t: 'TA', text: 'TA', i: 'n1', blockId: 'b1' },
        { t: 'TB', text: 'TB', i: 'n2', blockId: 'b2' },
        { t: 'TC', text: 'TC', i: 'n3', blockId: 'b3' },
      ]);
    });

    it('characterizes shuffled traditional results as weak positional ownership', () => {
      const original = [
        { t: 'A', i: 'n1', blockId: 'b1' },
        { t: 'B', i: 'n2', blockId: 'b2' },
        { t: 'C', i: 'n3', blockId: 'b3' },
      ];

      expect(handler._mapResults(original, ['TA', 'TC', 'TB'])).toEqual([
        { t: 'TA', text: 'TA', i: 'n1', blockId: 'b1' },
        { t: 'TC', text: 'TC', i: 'n2', blockId: 'b2' },
        { t: 'TB', text: 'TB', i: 'n3', blockId: 'b3' },
      ]);
    });

    it('restores Select Element AI positional-wire IDs before positional reattachment', async () => {
      mockEngine.createIntelligentBatches = vi.fn((segments) => [segments]);
      mockProvider.translate.mockImplementation(async (texts) => {
        const parsed = AIResponseParser.parseBatchResult(
          JSON.stringify([
            { id: 2, text: 'TC' },
            { id: 0, text: 'TA' },
            { id: 1, text: 'TB' },
          ]),
          texts.length,
          texts,
        );
        return { translatedText: parsed.results };
      });

      const result = await handler.execute(
        mockEngine,
        {
          text: JSON.stringify([
            { t: 'A', i: 'n1', blockId: 'b1' },
            { t: 'B', i: 'n2', blockId: 'b2' },
            { t: 'C', i: 'n3', blockId: 'b3' },
          ]),
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          mode: 'select_element',
          options: {},
        },
        mockProvider,
        'en',
        'fa',
        'select-element-wire-order',
        { tab: { id: 123 } },
      );

      expect(result.results).toEqual([
        { t: 'TA', text: 'TA', i: 'n1', blockId: 'b1' },
        { t: 'TB', text: 'TB', i: 'n2', blockId: 'b2' },
        { t: 'TC', text: 'TC', i: 'n3', blockId: 'b3' },
      ]);
    });

    it('characterizes ID-less AI responses as positional fallback', async () => {
      mockEngine.createIntelligentBatches = vi.fn((segments) => [segments]);
      mockProvider.translate.mockImplementation(async (texts) => {
        const parsed = AIResponseParser.parseBatchResult(
          JSON.stringify([{ text: 'TC' }, { text: 'TA' }, { text: 'TB' }]),
          texts.length,
          texts,
        );
        return { translatedText: parsed.results };
      });

      const result = await handler.execute(
        mockEngine,
        {
          text: JSON.stringify([
            { t: 'A', i: 'n1', blockId: 'b1' },
            { t: 'B', i: 'n2', blockId: 'b2' },
            { t: 'C', i: 'n3', blockId: 'b3' },
          ]),
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          mode: 'select_element',
          options: {},
        },
        mockProvider,
        'en',
        'fa',
        'select-element-idless-order',
        { tab: { id: 123 } },
      );

      expect(result.results).toEqual([
        { t: 'TC', text: 'TC', i: 'n1', blockId: 'b1' },
        { t: 'TA', text: 'TA', i: 'n2', blockId: 'b2' },
        { t: 'TB', text: 'TB', i: 'n3', blockId: 'b3' },
      ]);
    });

    it('rejects Select Element traditional under-return without shifting later units', () => {
      const original = [
        { t: 'A', i: 'n1', blockId: 'b1' },
        { t: 'B', i: 'n2', blockId: 'b2' },
        { t: 'C', i: 'n3', blockId: 'b3' },
      ];

      expect(() => handler._mapResults(original, ['TA', 'TB'])).toThrow(/Segment count mismatch/);
    });

    it('rejects Select Element traditional over-return without attaching an extra unit', () => {
      const original = [
        { t: 'A', i: 'n1', blockId: 'b1' },
        { t: 'B', i: 'n2', blockId: 'b2' },
        { t: 'C', i: 'n3', blockId: 'b3' },
      ];

      expect(() => handler._mapResults(original, ['TA', 'TB', 'TC', 'TD']))
        .toThrow(/Segment count mismatch/);
    });

    it('should reject malformed JSON-like strings as a typed failure with a preserved diagnostic', () => {
      const original = ['s1'];
      // A string that:
      // 1. Starts with {" or ["
      // 2. Fails JSON.parse (malformed)
      // 3. Contains ": or ",
      // 4. Is longer than 20 chars
      const malformedJson = '{"this is malformed": and fails parse ", but has markers and is long enough }';
      
      expect(() => handler._mapResults(original, malformedJson)).toThrow(/RAW_JSON_RESULT/);
      const rawJsonDiagnostic = appendTranslationDiagnostic.mock.calls.find(call => call[1]?.code === 'RAW_JSON_RESULT');
      expect(rawJsonDiagnostic).toBeDefined();
      expect(rawJsonDiagnostic[1]).toMatchObject({ type: 'STRUCTURED_RESULT_REJECTED', code: 'RAW_JSON_RESULT' });
    });

    it('should throw a fatal validation error on segment count mismatch', () => {
      const original = ['s1', 's2'];
      const translated = ['t1'];
      try {
        handler._mapResults(original, translated);
        throw new Error('Expected mapping to fail');
      } catch (error) {
        expect(error).toMatchObject({ type: ErrorTypes.VALIDATION, isFatal: true });
        expect(error.message).toMatch(/Segment count mismatch/);
      }
    });

    it('should throw a typed failure when a mapped item is null', () => {
      expect(() => handler._mapResults(['s1'], [null])).toThrow(/NULL_TRANSLATION_RESULT/);
    });

    it('should throw a typed failure when a mapped item is undefined', () => {
      expect(() => handler._mapResults(['s1'], [undefined])).toThrow(/NULL_TRANSLATION_RESULT/);
    });

    it('should throw a typed failure when translated text is missing from an object item', () => {
      expect(() => handler._mapResults(['s1'], [{}])).toThrow(/MISSING_TRANSLATION_TEXT/);
      expect(() => handler._mapResults(['s1'], [{ t: undefined }])).toThrow(/MISSING_TRANSLATION_TEXT/);
      expect(() => handler._mapResults(['s1'], [{ text: undefined }])).toThrow(/MISSING_TRANSLATION_TEXT/);
    });

    it('should throw a typed failure for blank translated text with a nonblank source', () => {
      expect(() => handler._mapResults(['s1'], [''])).toThrow(/EMPTY_TRANSLATION_RESULT/);
      expect(() => handler._mapResults(['s1'], [{ t: '' }])).toThrow(/EMPTY_TRANSLATION_RESULT/);
      expect(() => handler._mapResults(['s1'], [{ text: '' }])).toThrow(/EMPTY_TRANSLATION_RESULT/);
    });

    it('should throw a typed failure for whitespace translated text with a nonblank source', () => {
      expect(() => handler._mapResults(['s1'], ['   '])).toThrow(/EMPTY_TRANSLATION_RESULT/);
      expect(() => handler._mapResults(['s1'], [{ t: '   ' }])).toThrow(/EMPTY_TRANSLATION_RESULT/);
    });

    it('should surface every invalid result family as a typed fatal validation error', () => {
      const expectTypedFailure = (attempt) => {
        try {
          attempt();
          throw new Error('Expected mapping to fail');
        } catch (error) {
          expect(error).toMatchObject({ type: ErrorTypes.VALIDATION, isFatal: true });
        }
      };

      expectTypedFailure(() => handler._mapResults(['s1'], [null]));
      expectTypedFailure(() => handler._mapResults(['s1'], [undefined]));
      expectTypedFailure(() => handler._mapResults(['s1'], [{}]));
      expectTypedFailure(() => handler._mapResults(['s1'], [{ t: undefined }]));
      expectTypedFailure(() => handler._mapResults(['s1'], ['']));
      expectTypedFailure(() => handler._mapResults(['s1'], ['   ']));
      expectTypedFailure(() => handler._mapResults(['s1'], ['{"this is malformed": and fails parse ", but has markers and is long enough }']));
    });

    it('should accept blank translated text for a blank source position', () => {
      expect(handler._mapResults([''], [''])).toEqual(['']);
      expect(handler._mapResults([{ t: '', i: 'blank' }], [{ t: '' }])).toEqual([{ t: '', text: '', i: 'blank' }]);
    });

    it('should keep an explicit source-equal translation as a valid result', () => {
      expect(handler._mapResults(['URL'], ['URL'])).toEqual(['URL']);
      expect(handler._mapResults(['URL'], [{ t: 'URL' }])).toEqual(['URL']);
    });
  });

  describe('V3 marker contract validation', () => {
    const MARKER = '@@TI_SEG_s1_e1_n1@@';
    const mockSender = { tab: { id: 123 } };
    const mockData = {
      text: JSON.stringify(['s1', 's2']),
      sourceLanguage: 'auto',
      targetLanguage: 'fa',
      mode: 'select_element',
      messageId: 'msg-1',
      sessionId: 'sess-1'
    };

    it('accepts equal V3 marker count and order in non-fragment items', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const source = `Text ${MARKER} with marker`;
      const payload = [{ t: source, i: 'n1' }];
      mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: [`Translated ${MARKER} text`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
        mockProvider, 'en', 'fa', 'msg-v3-accept', mockSender
      );

      expect(result.success).toBe(true);
      expect(result.results[0].t).toBe(`Translated ${MARKER} text`);
    });

    it('rejects extra V3 marker in AI response (g3 case)', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const source = `Text ${MARKER} with marker`;
      const payload = [{ t: source, i: 'n1' }];
      mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: [`Translated ${MARKER} ${MARKER} text`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
        mockProvider, 'en', 'fa', 'msg-v3-extra', mockSender
      );

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('V3 marker contract violation');
      expect(result.error.message).toContain('MARKER_COUNT_MISMATCH');
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(0);
    });

    it('rejects missing V3 marker in AI response', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const source = `Text ${MARKER} with marker`;
      const payload = [{ t: source, i: 'n1' }];
      mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: [`Translated text without marker`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
        mockProvider, 'en', 'fa', 'msg-v3-missing', mockSender
      );

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('MARKER_COUNT_MISMATCH');
      expect(result.error.type).toBe(ErrorTypes.VALIDATION);
    });

    it('rejects reordered V3 markers', async () => {
      const marker1 = '@@TI_SEG_s1_e1_n1@@';
      const marker2 = '@@TI_SEG_s1_e1_n2@@';

      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const source = `${marker1}${marker2}text`;
      const payload = [{ t: source, i: 'n1' }];
      mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: [`text${marker2}${marker1}`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
        mockProvider, 'en', 'fa', 'msg-v3-reorder', mockSender
      );

      expect(result.success).toBe(false);
       expect(result.error.message).toContain('MARKER_SEQUENCE_MISMATCH');
    });

    it('rejects duplicate V3 markers in translated text', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const source = `${MARKER}text`;
      const payload = [{ t: source, i: 'n1' }];
      mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: [`text${MARKER}${MARKER}`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
        mockProvider, 'en', 'fa', 'msg-v3-dup', mockSender
      );

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('MARKER_COUNT_MISMATCH');
    });

    it('single V3 fragment with no markers passes without marker validation', async () => {
      const fragment = { t: 'A.', i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 1, fragmentJoinerBefore: '' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment]]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Translated.'] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'Hello.', blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-frag-skip', mockSender
      );

      expect(result.success).toBe(true);
      expect(result.results[0].__sourceT).toBeUndefined();
    });

    it('valid two-fragment parent with markers spanning fragments', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`A${m2}B`] })
        .mockResolvedValueOnce({ translatedText: [`${m3}C`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: `A${m2}B ${m3}C`, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-multifrag-ok', mockSender
      );

      expect(result.success).toBe(true);
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(1);
      expect(updates[0].data.data[0].t).toBe(`A${m2}B ${m3}C`);
      expect(result.results[0].__sourceT).toBeUndefined();
    });

    it('rejects extra marker in second fragment of two-fragment parent', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`A${m2}B`] })
        .mockResolvedValueOnce({ translatedText: [`${m3}${m3}C`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: `A${m2}B ${m3}C`, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-multifrag-extra', mockSender
      );

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.VALIDATION);
      const diagnostic = appendTranslationDiagnostic.mock.calls.find(call => call[1]?.type === 'V3_MARKER_CONTRACT_REJECTED');
      expect(diagnostic).toBeDefined();
      expect(diagnostic[1]).toMatchObject({
        type: 'V3_MARKER_CONTRACT_REJECTED',
        expectedMarkerCount: 2,
        actualMarkerCount: 3,
        reason: 'MARKER_COUNT_MISMATCH',
        parentId: 'g1',
      });
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(0);
    });

    it('rejects missing marker across fragment boundary', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`A${m2}B`] })
        .mockResolvedValueOnce({ translatedText: [`C`] })
        .mockResolvedValueOnce({ translatedText: [`C`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: `A${m2}B ${m3}C`, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-multifrag-missing', mockSender
      );

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('MARKER_COUNT_MISMATCH');
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(0);
    });

    it('repairs a 39-unit fragmented parent after two successful provider batches', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      // Production ErrorMatcher does not treat VALIDATION as fatal solely from isFatal.
      isFatalError.mockReturnValue(false);

      const marker = (index) => `@@TI_SEG_s1_e1_n${index}@@`;
      const unit = (index) => `Unit ${index}${marker(index)}`;
      const firstFragment = Array.from({ length: 20 }, (_, index) => unit(index + 1)).join(' ');
      const secondFragment = Array.from({ length: 19 }, (_, index) => unit(index + 21)).join(' ');
      const source = `${firstFragment} ${secondFragment}`;
      const fragment0 = {
        t: firstFragment,
        i: 'n1',
        blockId: 'g1',
        isV3Fragment: true,
        parentId: 'g1',
        fragmentIndex: 0,
        fragmentCount: 2,
        fragmentJoinerBefore: ''
      };
      const fragment1 = {
        t: secondFragment,
        i: 'n1',
        blockId: 'g1',
        isV3Fragment: true,
        parentId: 'g1',
        fragmentIndex: 1,
        fragmentCount: 2,
        fragmentJoinerBefore: ' '
      };
      const translatedFragment0 = firstFragment.replace(/Unit /g, 'Translated ');
      const translatedFragment1 = secondFragment
        .replace(/Unit 39@@TI_SEG_s1_e1_n39@@/, 'Translated 39')
        .replace(/Unit /g, 'Translated ');
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [translatedFragment0] })
        .mockResolvedValueOnce({ translatedText: [translatedFragment1] })
        .mockImplementation((texts, _source, _target, options) => {
          if (options.callPurpose === TranslationCallPurpose.PARENT_RECOVERY) {
            return Promise.resolve({ translatedText: texts.map((item) => ({ id: item.i, text: item.text.replace(marker(39), '') })) });
          }
          return Promise.resolve({ translatedText: texts });
        });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: source, blockId: 'g1', i: 'n1' }]) },
        mockProvider,
        'en',
        'fa',
        'msg-v3-39-unit-mismatch',
        mockSender
      );

      const recoveryCalls = mockProvider.translate.mock.calls.filter(
        call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY
      );
       expect(mockProvider.translate).toHaveBeenCalledTimes(3);
       expect(recoveryCalls).toHaveLength(1);
       const recoveryInput = recoveryCalls[0][0];
       expect(recoveryInput.every(({ intervalId, i, text }) => typeof (intervalId ?? i) === 'string' && typeof text === 'string')).toBe(true);
       expect(new Set(recoveryInput.map(({ intervalId, i }) => intervalId ?? i)).size).toBe(recoveryInput.length);
       expect(recoveryInput.some(({ text }) => text.includes('@@TI_SEG_'))).toBe(false);
       expect(result).toMatchObject({ success: true });
       expect(result.error).toBeNull();
      expect(result.results).toHaveLength(1);

      const diagnostic = appendTranslationDiagnostic.mock.calls.find(
        (call) => call[1]?.type === 'V3_MARKER_CONTRACT_REJECTED'
      );
      expect(diagnostic?.[1]).toMatchObject({
        parentId: 'g1',
        expectedMarkerCount: 39,
        actualMarkerCount: 38,
        reason: 'MARKER_COUNT_MISMATCH'
      });
       expect(appendTranslationDiagnostic).toHaveBeenCalledWith(null, expect.objectContaining({
         type: 'PARENT_RECOVERY_STARTED',
         parentId: 'g1',
         recoveryStage: 1,
         recoveryFragmentLimit: 750,
         primaryFragmentCount: 2,
         recoveryFragmentCount: 1,
         callPurpose: TranslationCallPurpose.PARENT_RECOVERY,
       }));

      const messages = browser.tabs.sendMessage.mock.calls.map(([, message]) => message);
      const updates = messages.filter((message) => message.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      const ends = messages.filter((message) => message.action === MessageActions.TRANSLATION_STREAM_END);
      expect(updates).toHaveLength(1);
      expect(ends).toHaveLength(1);
      expect(ends[0].data).toMatchObject({ success: true });
      expect(JSON.stringify(messages)).toContain(marker(39));
    });

    it('rejects reordered markers across fragments', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `A${m2}`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`A${m3}`] })
        .mockResolvedValueOnce({ translatedText: [`${m2}B`] })
        .mockResolvedValueOnce({ translatedText: [`A${m3}`] })
        .mockResolvedValueOnce({ translatedText: [`${m2}B`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: `A${m2} ${m3}B`, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-multifrag-reorder', mockSender
      );

      expect(result.success).toBe(false);
       expect(result.error.message).toContain('MARKER_SEQUENCE_MISMATCH');
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(0);
    });

    it('recovers one invalid V3 parent with isolated parent recovery calls', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const source = `A${m2}B ${m3}C`;
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`A${m2}B`] })
        .mockResolvedValueOnce({ translatedText: [`${m3}${m3}C`] })
        .mockResolvedValueOnce({ translatedText: [
          { id: 'parent-1-0', i: 'parent-1-0', text: 'A' },
          { id: 'parent-1-1', i: 'parent-1-1', text: 'B' },
          { id: 'parent-1-2', i: 'parent-1-2', text: 'C' },
        ] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: source, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-parent-recovery', mockSender
      );

      expect(result.success).toBe(true);
      expect(mockProvider.translate).toHaveBeenCalledTimes(3);
      expect(mockProvider.translate.mock.calls.slice(2).map(call => call[3].callPurpose))
        .toEqual([TranslationCallPurpose.PARENT_RECOVERY]);
      expect(mockProvider.translate.mock.calls[2][3].contextMetadata.conversationParticipates).toBe(false);
      expect(mockProvider.translate.mock.calls[2][3].contextMetadata.useParentConversationLifecycle).toBe(false);
      expect(mockProvider.translate.mock.calls[2][3].executionContext.deadlineAt)
        .toBe(mockProvider.translate.mock.calls[0][3].executionContext.deadlineAt);
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, message]) => message)
        .filter(message => message.action === MessageActions.TRANSLATION_STREAM_UPDATE);
       expect(updates).toHaveLength(1);
       expect(updates[0].data.data[0].t).toBe(source);
       expect(updates[0].data.data[0]).toMatchObject({ i: 'n1', blockId: 'g1', text: source });
       expect(updates[0].data.data[0]).not.toHaveProperty('fragment');
       expect(updates[0].data.data[0]).not.toHaveProperty('mapped');
       expect(updates[0].data.data[0]).not.toHaveProperty('recoveryFragmentIndex');
       expect(updates[0].data.data[0]).not.toHaveProperty('intervalId');
       expect(JSON.stringify(updates[0].data.data[0])).not.toContain('v3:g1');
      expect(appendTranslationDiagnostic).toHaveBeenCalledWith(null, expect.objectContaining({ type: 'PARENT_RECOVERY_STARTED', parentId: 'g1' }));
      expect(appendTranslationDiagnostic).toHaveBeenCalledWith(null, expect.objectContaining({ type: 'PARENT_RECOVERY_SUCCEEDED', parentId: 'g1' }));
    });

    it('makes PARENT_RECOVERY inherit the pair resolved by the first AUTO batch', async () => {
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const source = `A${m2}B ${m3}C`;
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`A${m2}B`], detectedLanguage: 'en' })
        .mockResolvedValueOnce({ translatedText: [`${m3}${m3}C`] })
        .mockResolvedValueOnce({ translatedText: [
          { id: 'parent-1-0', i: 'parent-1-0', text: 'A' },
          { id: 'parent-1-1', i: 'parent-1-1', text: 'B' },
          { id: 'parent-1-2', i: 'parent-1-2', text: 'C' },
        ] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, text: JSON.stringify([{ t: source, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'auto', 'fa', 'msg-v3-auto-recovery', mockSender
      );

      expect(result.success).toBe(true);
      expect(mockProvider.translate).toHaveBeenCalledTimes(3);

      // First batch runs unresolved; it proves 'en' via detectedLanguage.
      expect(mockProvider.translate.mock.calls[0].slice(1, 3)).toEqual(['auto', 'fa']);
      expect(mockProvider.translate.mock.calls[0][3].languagePairResolved).toBeUndefined();

      // Second batch inherits the resolved pair.
      expect(mockProvider.translate.mock.calls[1].slice(1, 3)).toEqual(['en', 'fa']);
      expect(mockProvider.translate.mock.calls[1][3].languagePairResolved).toBe(true);

      // PARENT_RECOVERY inherits the parent batch's resolved pair and skips
      // semantic swap/detection, without re-running the bypass decision.
      const recoveryCall = mockProvider.translate.mock.calls[2];
      expect(recoveryCall[3].callPurpose).toBe(TranslationCallPurpose.PARENT_RECOVERY);
      expect(recoveryCall.slice(1, 3)).toEqual(['en', 'fa']);
      expect(recoveryCall[3].languagePairResolved).toBe(true);
    });

    it('keeps PARENT_RECOVERY unresolved when the operation source never resolves', async () => {
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const source = `A${m2}B ${m3}C`;
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`A${m2}B`], detectedLanguage: 'auto' })
        .mockResolvedValueOnce({ translatedText: [`${m3}${m3}C`] })
        .mockResolvedValueOnce({ translatedText: [
          { id: 'parent-1-0', i: 'parent-1-0', text: 'A' },
          { id: 'parent-1-1', i: 'parent-1-1', text: 'B' },
          { id: 'parent-1-2', i: 'parent-1-2', text: 'C' },
        ] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, text: JSON.stringify([{ t: source, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'auto', 'fa', 'msg-v3-auto-unresolved-recovery', mockSender
      );

      expect(result.success).toBe(true);
      const recoveryCall = mockProvider.translate.mock.calls.find(
        (call) => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY
      );
      expect(recoveryCall).toBeDefined();
      expect(recoveryCall.slice(1, 3)).toEqual(['auto', 'fa']);
      expect(recoveryCall[3].languagePairResolved).toBeUndefined();
    });

    it('emits bounded provider, mapped, reassembled, and empty-interval diagnostics', async () => {
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const source = `A${m2}${'word '.repeat(180)}${m3}C`;
      const fragment0 = { t: `A${m2}${'word '.repeat(90)}`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${'word '.repeat(90)}${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`A${m2}B`] })
        .mockResolvedValueOnce({ translatedText: [`${m3}${m3}C`] })
        .mockImplementation((texts, _source, _target, options) => {
          if (options.callPurpose === TranslationCallPurpose.PARENT_RECOVERY) {
            return Promise.resolve({ translatedText: texts.map((text) => ({ id: text.i, text: text.text })) });
          }
          return Promise.resolve({ translatedText: texts });
        });

      await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: source, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-recovery-diagnostics', mockSender
      );

      const debugCalls = loggerDebug.mock.calls;
      const providerSummary = debugCalls.find(([message, data]) => message.includes('provider response summary') && data?.recoveryStage === 1);
      const mappedSummary = debugCalls.find(([, data]) => data?.recoveryFragmentIndex !== undefined && data?.translatedLength !== undefined);
      const reassembledSummary = debugCalls.find(([, data]) => data?.sourceIntervalCount !== undefined);
       const emptyInterval = debugCalls.find(([, data]) => data?.intervalIndex !== undefined && data?.sourcePreview !== undefined);

      expect(providerSummary?.[1]).toMatchObject({ parentId: 'g1', recoveryFragmentIndex: 0 });
      expect(mappedSummary?.[1]).toMatchObject({ parentId: 'g1', recoveryFragmentIndex: expect.any(Number) });
      expect(reassembledSummary?.[1]).toMatchObject({ parentId: 'g1', sourceIntervalCount: expect.any(Number), translatedIntervalCount: expect.any(Number) });
      expect(emptyInterval).toBeUndefined();
      expect(debugCalls.some(([, data]) => typeof data?.sourceText === 'string' || typeof data?.translatedText === 'string')).toBe(false);
    });

    it.each([
      ['provider omits leading text', '@@TI_SEG_e_s_n1@@translated', 0],
      ['provider preserves leading text', 'The@@TI_SEG_e_s_n1@@translated', 3],
    ])('attributes leading interval to provider output: %s', async (_label, recoveryText, expectedProviderLength) => {
      const marker = '@@TI_SEG_e_s_n1@@';
      const source = `The${marker}rest`;
      const first = { t: `The${marker}`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const second = { t: 'rest', i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: '' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[first], [second]]);
      let primaryCalls = 0;
      mockProvider.translate.mockImplementation((texts, _source, _target, options) => {
        if (options.callPurpose === TranslationCallPurpose.PARENT_RECOVERY) {
          return Promise.resolve({ translatedText: texts.map((item, index) => ({
            id: item.i,
            text: index === 0 && expectedProviderLength === 0 ? item.text.slice(3) : item.text,
          })) });
        }
        primaryCalls += 1;
        return Promise.resolve({ translatedText: [primaryCalls === 1 ? `The${marker}` : `${marker}${marker}rest`] });
      });

      await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: source, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', `leading-seam-${expectedProviderLength}`, mockSender
      );

      const seam = loggerDebug.mock.calls.find(([message, data]) => (
        message.includes('leading interval seam') && data?.recoveryStage === 1
      ));
      expect(seam?.[1]).toMatchObject({
        sourceLeadingIntervalLength: 3,
        providerLeadingIntervalLength: expectedProviderLength,
        firstMarkerId: 'TI_SEG_e_s_n1',
      });
       expect(seam?.[1]).not.toHaveProperty('sourceLeadingPreview');
       expect(seam?.[1]).not.toHaveProperty('providerLeadingPreview');
    });

    it.each([
      ['non-recoverable validation', 'validation'],
      ['provider rejection', 'provider'],
      ['timeout', 'timeout'],
      ['cancellation', 'cancelled'],
    ])('does not start Stage 2 after Stage 1 %s', async (_label, outcome) => {
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const source = `A${m2}B ${m3}C`;
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      let primaryCall = 0;
      mockProvider.translate.mockImplementation((texts, _source, _target, options) => {
        if (options.callPurpose !== TranslationCallPurpose.PARENT_RECOVERY) {
          primaryCall += 1;
          return Promise.resolve({ translatedText: primaryCall === 2 ? [`${m3}${m3}C`] : ['A@@TI_SEG_e_s_n2@@B'] });
        }
        if (outcome === 'validation') return Promise.resolve({ translatedText: [`${source}@@`] });
        if (outcome === 'timeout') return Promise.reject(Object.assign(new Error('stage timeout'), { type: ErrorTypes.TRANSLATION_TIMEOUT }));
        if (outcome === 'cancelled') return Promise.reject(Object.assign(new Error('stage cancelled'), { name: 'AbortError' }));
        return Promise.reject(Object.assign(new Error('stage provider failure'), { type: ErrorTypes.NETWORK_ERROR }));
      });

      const execution = handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: source, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', `stage-1-terminal-${outcome}`, mockSender
      );
      await execution.catch(() => {});

      const recoveryCalls = mockProvider.translate.mock.calls.filter(
        call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY
      );
      expect(recoveryCalls).toHaveLength(1);
      expect(appendTranslationDiagnostic.mock.calls.filter(([, diagnostic]) => (
        diagnostic?.type === 'PARENT_RECOVERY_STARTED' && diagnostic.recoveryStage === 2
      ))).toHaveLength(0);
    });

    it('preserves the original validation failure when parent recovery fails', async () => {
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`A${m2}B`] })
        .mockResolvedValueOnce({ translatedText: [`${m3}${m3}C`] })
        .mockResolvedValueOnce({ translatedText: [`${m3}${m3}C`] })
        .mockResolvedValueOnce({ translatedText: [`${m3}${m3}C`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: `A${m2}B ${m3}C`, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-parent-recovery-fail', mockSender
      );

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.VALIDATION);
       expect(result.error.message).toContain('MARKER_COUNT_MISMATCH');
      expect(result.results).toEqual([]);
      expect(appendTranslationDiagnostic).toHaveBeenCalledWith(null, expect.objectContaining({ type: 'PARENT_RECOVERY_FAILED', parentId: 'g1' }));
    });

    it('does not retry parent recovery recursively after one failed pass', async () => {
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`A${m2}B`] })
        .mockResolvedValueOnce({ translatedText: [`${m3}${m3}C`] })
        .mockResolvedValueOnce({ translatedText: [`${m3}${m3}C`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: `A${m2}B ${m3}C`, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-parent-recovery-once', mockSender
      );

      expect(result.success).toBe(false);
      expect(mockProvider.translate).toHaveBeenCalledTimes(3);
      expect(mockProvider.translate.mock.calls.filter(call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY)).toHaveLength(1);
    });

    it('preserves a valid same-batch prefix when parent recovery fails (Case A)', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `X${m2}Y`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}Z`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      const manifest = createRequestUnitManifest(['Hello', `X${m2}Y ${m3}Z`]);
      const onTerminalUnitsAccepted = vi.fn();
      const executionContext = {
        manifestView: createManifestView(manifest),
        onTerminalUnitsAccepted,
      };
      mockEngine.createIntelligentBatches = vi.fn(() => [[
        { t: 'Hello', i: 'a', blockId: 'a' },
        fragment0,
        fragment1,
      ]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['Hello', `X${m2}Y`, `${m3}${m3}Z`] })
        .mockResolvedValueOnce({ translatedText: [
          { i: 'parent-1-0', text: 'X' },
          { i: 'parent-1-1', text: 'Y' },
          { i: 'parent-1-2', text: `Z${m3}` },
        ] })
        .mockResolvedValueOnce({ translatedText: [
          { i: 'parent-2-0', text: 'X' },
          { i: 'parent-2-1', text: 'Y' },
          { i: 'parent-2-2', text: `Z${m3}` },
        ] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([
          { t: 'Hello', i: 'a', blockId: 'a' },
          { t: `X${m2}Y ${m3}Z`, i: 'n1', blockId: 'b1' },
        ]) },
        mockProvider, 'en', 'fa', 'msg-case-a-prefix-preserved', mockSender, 'unknown', executionContext
      );

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.VALIDATION);
      expect(mockProvider.translate.mock.calls.filter(call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY)).toHaveLength(2);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({ i: 'a', t: 'Hello' });
      // Canonical positional manifest acceptance: only the surviving prefix A
      // reaches terminal observation, exactly once; the failed parent B never does.
      expect(onTerminalUnitsAccepted).toHaveBeenCalledTimes(1);
      expect(onTerminalUnitsAccepted.mock.calls[0][0]).toEqual([manifest.units[0]]);
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(1);
      expect(updates[0].data.data).toHaveLength(1);
      expect(updates[0].data.data[0].i).toBe('a');
    });

    it('preserves a valid same-batch suffix after successful parent recovery (Case B)', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `X${m2}Y`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}Z`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      const manifest = createRequestUnitManifest(['Hello', `X${m2}Y ${m3}Z`, 'Goodbye']);
      const onTerminalUnitsAccepted = vi.fn();
      const executionContext = {
        manifestView: createManifestView(manifest),
        onTerminalUnitsAccepted,
      };
      mockEngine.createIntelligentBatches = vi.fn(() => [[
        { t: 'Hello', i: 'a', blockId: 'a' },
        fragment0,
        fragment1,
        { t: 'Goodbye', i: 'c', blockId: 'c' },
      ]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['Hello', `X${m2}Y`, `${m3}${m3}Z`, 'Goodbye'] })
        .mockResolvedValueOnce({ translatedText: [
          { i: 'parent-1-0', text: 'X' },
          { i: 'parent-1-1', text: 'Y' },
          { i: 'parent-1-2', text: 'Z' },
        ] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([
          { t: 'Hello', i: 'a', blockId: 'a' },
          { t: `X${m2}Y ${m3}Z`, i: 'n1', blockId: 'b1' },
          { t: 'Goodbye', i: 'c', blockId: 'c' },
        ]) },
        mockProvider, 'en', 'fa', 'msg-case-b-suffix-preserved', mockSender, 'unknown', executionContext
      );

      expect(result.success).toBe(true);
      expect(mockProvider.translate.mock.calls.filter(call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY)).toHaveLength(1);
      expect(result.results.map(r => r.i)).toEqual(['a', 'n1', 'c']);
      expect(result.results[1].t).toBe(`X${m2}Y ${m3}Z`);
      // Canonical positional manifest acceptance: A, the recovered B, and C each
      // reach terminal observation exactly once, with no duplicate acceptance.
      expect(onTerminalUnitsAccepted).toHaveBeenCalledTimes(1);
      const acceptedUnits = onTerminalUnitsAccepted.mock.calls[0][0];
      expect(acceptedUnits).toEqual([manifest.units[0], manifest.units[1], manifest.units[2]]);
      expect(new Set(acceptedUnits).size).toBe(acceptedUnits.length);
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(1);
      expect(updates[0].data.data.map(d => d.i)).toEqual(['a', 'n1', 'c']);
    });

    it('recovers two invalid parents and publishes the physical batch once', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const b0 = { t: `X${m2}Y`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const b1 = { t: `${m3}Z`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      const d0 = { t: `P${m2}Q`, i: 'n2', blockId: 'd1', isV3Fragment: true, parentId: 'd1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const d1 = { t: `${m3}R`, i: 'n2', blockId: 'd1', isV3Fragment: true, parentId: 'd1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      const manifest = createRequestUnitManifest(['Hello', `X${m2}Y ${m3}Z`, 'Goodbye', `P${m2}Q ${m3}R`, 'End']);
      const onTerminalUnitsAccepted = vi.fn();
      const executionContext = {
        manifestView: createManifestView(manifest),
        onTerminalUnitsAccepted,
      };
      mockEngine.createIntelligentBatches = vi.fn(() => [[
        { t: 'Hello', i: 'a', blockId: 'a' },
        b0,
        b1,
        { t: 'Goodbye', i: 'c', blockId: 'c' },
        d0,
        d1,
        { t: 'End', i: 'e', blockId: 'e' },
      ]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['Hello', `X${m2}Y`, `${m3}${m3}Z`, 'Goodbye', `P${m2}Q`, `${m3}${m3}R`, 'End'] })
        .mockImplementation((texts, _source, _target, options) => {
          if (options.callPurpose === TranslationCallPurpose.PARENT_RECOVERY) {
            return Promise.resolve({ translatedText: texts.map((item) => ({ i: item.i, text: item.text })) });
          }
          return Promise.resolve({ translatedText: texts });
        });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([
          { t: 'Hello', i: 'a', blockId: 'a' },
          { t: `X${m2}Y ${m3}Z`, i: 'n1', blockId: 'b1' },
          { t: 'Goodbye', i: 'c', blockId: 'c' },
          { t: `P${m2}Q ${m3}R`, i: 'n2', blockId: 'd1' },
        ]) },
        mockProvider, 'en', 'fa', 'msg-multiple-invalid', mockSender, 'unknown', executionContext
      );

      expect(result.success).toBe(true);
      const recoveryCalls = mockProvider.translate.mock.calls.filter(call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY);
      expect(recoveryCalls).toHaveLength(2);
      expect(recoveryCalls.map(call => call[3].executionContext.deadlineAt))
        .toEqual([mockProvider.translate.mock.calls[0][3].executionContext.deadlineAt, mockProvider.translate.mock.calls[0][3].executionContext.deadlineAt]);
      expect(recoveryCalls.every(call => call[3].abortController === mockAbortController)).toBe(true);
      expect(result.results.map(r => r.i)).toEqual(['a', 'n1', 'c', 'n2', 'e']);
      expect(new Set(result.results.map(r => r.i)).size).toBe(result.results.length);
      expect(onTerminalUnitsAccepted).toHaveBeenCalledTimes(1);
      expect(onTerminalUnitsAccepted.mock.calls[0][0]).toEqual(manifest.units);
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(1);
      expect(updates[0].data.data.map(d => d.i)).toEqual(['a', 'n1', 'c', 'n2', 'e']);
      const ends = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_END);
      expect(ends).toHaveLength(1);
      expect(ends[0].data.success).toBe(true);
    });

    it('preserves results when the second parent recovery fails', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      isFatalError.mockReturnValue(false);
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const b0 = { t: `X${m2}Y`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const b1 = { t: `${m3}Z`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      const d0 = { t: `P${m2}Q`, i: 'n2', blockId: 'd1', isV3Fragment: true, parentId: 'd1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const d1 = { t: `${m3}R`, i: 'n2', blockId: 'd1', isV3Fragment: true, parentId: 'd1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      const manifest = createRequestUnitManifest(['Hello', `X${m2}Y ${m3}Z`, 'Goodbye', `P${m2}Q ${m3}R`, 'End']);
      const onTerminalUnitsAccepted = vi.fn();
      const executionContext = {
        manifestView: createManifestView(manifest),
        onTerminalUnitsAccepted,
      };
      mockEngine.createIntelligentBatches = vi.fn(() => [[
        { t: 'Hello', i: 'a', blockId: 'a' },
        b0,
        b1,
        { t: 'Goodbye', i: 'c', blockId: 'c' },
        d0,
        d1,
        { t: 'End', i: 'e', blockId: 'e' },
      ]]);
      let recoveryCall = 0;
      mockProvider.translate.mockImplementation((texts, _source, _target, options) => {
        if (options.callPurpose === TranslationCallPurpose.PARENT_RECOVERY) {
          recoveryCall++;
          const isValidRecovery = recoveryCall === 1;
          return Promise.resolve({ translatedText: texts.map((item) => ({
            i: item.i,
            text: isValidRecovery ? item.text : `${item.text}${m2}`,
          })) });
        }
        return Promise.resolve({ translatedText: ['Hello', `X${m2}Y`, `${m3}${m3}Z`, 'Goodbye', `P${m2}Q`, `${m3}${m3}R`, 'End'] });
      });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([
          { t: 'Hello', i: 'a', blockId: 'a' },
          { t: `X${m2}Y ${m3}Z`, i: 'n1', blockId: 'b1' },
          { t: 'Goodbye', i: 'c', blockId: 'c' },
          { t: `P${m2}Q ${m3}R`, i: 'n2', blockId: 'd1' },
          { t: 'End', i: 'e', blockId: 'e' },
        ]) },
        mockProvider, 'en', 'fa', 'msg-second-recovery-fail', mockSender, 'unknown', executionContext
      );

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.VALIDATION);
      expect(result.error.message).toContain('fragmented parent d1');
      expect(result.results.map(r => r.i)).toEqual(['a', 'n1', 'c']);
      expect(result.results).not.toEqual(expect.arrayContaining([{ i: 'n2' }, { i: 'e' }]));
      expect(mockProvider.translate.mock.calls.filter(call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY)).toHaveLength(3);
      expect(onTerminalUnitsAccepted).toHaveBeenCalledTimes(1);
      expect(onTerminalUnitsAccepted.mock.calls[0][0]).toEqual(manifest.units.slice(0, 3));
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(1);
      expect(updates[0].data.data.map(d => d.i)).toEqual(['a', 'n1', 'c']);
      const ends = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_END);
      expect(ends).toHaveLength(1);
      expect(ends[0].data.success).toBe(false);
    });

    it('stops after two parent recovery lifecycles and preserves the accumulated prefix', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const makeFragments = (parentId, itemId, first, second) => [
        { t: `${first}${m2}${second}`, i: itemId, blockId: parentId, isV3Fragment: true, parentId, fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' },
        { t: `${m3}${second}`, i: itemId, blockId: parentId, isV3Fragment: true, parentId, fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' },
      ];
      const b = makeFragments('b1', 'n1', 'B', 'Y');
      const d = makeFragments('d1', 'n2', 'D', 'Q');
      const f = makeFragments('f1', 'n3', 'F', 'S');
      mockEngine.createIntelligentBatches = vi.fn(() => [[
        { t: 'A', i: 'a', blockId: 'a' },
        ...b,
        { t: 'C', i: 'c', blockId: 'c' },
        ...d,
        { t: 'E', i: 'e', blockId: 'e' },
        ...f,
        { t: 'G', i: 'g', blockId: 'g' },
      ]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [
          'A', `B${m2}Y`, `${m3}${m3}Y`, 'C', `D${m2}Q`, `${m3}${m3}Q`, 'E', `F${m2}S`, `${m3}${m3}S`, 'G'
        ] })
        .mockImplementation((texts, _source, _target, options) => {
          if (options.callPurpose === TranslationCallPurpose.PARENT_RECOVERY) {
            return Promise.resolve({ translatedText: texts.map((item) => ({ i: item.i, text: item.text })) });
          }
          return Promise.resolve({ translatedText: texts });
        });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([
          { t: 'A', i: 'a', blockId: 'a' },
          { t: `B${m2}Y ${m3}Y`, i: 'n1', blockId: 'b1' },
          { t: 'C', i: 'c', blockId: 'c' },
          { t: `D${m2}Q ${m3}Q`, i: 'n2', blockId: 'd1' },
          { t: 'E', i: 'e', blockId: 'e' },
          { t: `F${m2}S ${m3}S`, i: 'n3', blockId: 'f1' },
          { t: 'G', i: 'g', blockId: 'g' },
        ]) },
        mockProvider, 'en', 'fa', 'msg-recovery-cap', mockSender
      );

      expect(result.success).toBe(false);
      expect(mockProvider.translate.mock.calls.filter(call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY)).toHaveLength(2);
      expect(result.results.map(r => r.i)).toEqual(['a', 'n1', 'c', 'n2', 'e']);
      expect(result.results.some(r => r.i === 'n3' || r.i === 'g')).toBe(false);
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(1);
      expect(updates[0].data.data.map(d => d.i)).toEqual(['a', 'n1', 'c', 'n2', 'e']);
    });

    it('preserves the prefix in results without streaming when skipStreaming is set (PDF)', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `X${m2}Y`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}Z`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      const manifest = createRequestUnitManifest(['Hello', `X${m2}Y ${m3}Z`]);
      const onTerminalUnitsAccepted = vi.fn();
      const executionContext = {
        manifestView: createManifestView(manifest),
        onTerminalUnitsAccepted,
      };
      mockEngine.createIntelligentBatches = vi.fn(() => [[
        { t: 'Hello', i: 'a', blockId: 'a' },
        fragment0,
        fragment1,
      ]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['Hello', `X${m2}Y`, `${m3}${m3}Z`] })
        .mockResolvedValueOnce({ translatedText: [
          { i: 'parent-1-0', text: 'X' },
          { i: 'parent-1-1', text: 'Y' },
          { i: 'parent-1-2', text: `Z${m3}` },
        ] })
        .mockResolvedValueOnce({ translatedText: [
          { i: 'parent-2-0', text: 'X' },
          { i: 'parent-2-1', text: 'Y' },
          { i: 'parent-2-2', text: `Z${m3}` },
        ] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, mode: 'pdf-translation', sourceLanguage: 'en', text: JSON.stringify([
          { t: 'Hello', i: 'a', blockId: 'a' },
          { t: `X${m2}Y ${m3}Z`, i: 'n1', blockId: 'b1' },
        ]) },
        mockProvider, 'en', 'fa', 'msg-skipstream-prefix', mockSender, 'unknown', executionContext
      );

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.VALIDATION);
      expect(result.error.message).toContain('MARKER_COUNT_MISMATCH');
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({ i: 'a', t: 'Hello' });
      expect(mockProvider.translate.mock.calls.filter(call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY)).toHaveLength(2);
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(0);
      // Canonical terminal observation is mode-gated: structured PDF never reaches
      // onTerminalUnitsAccepted (existing PDF exclusion), so preservation must not
      // introduce acceptance where the contract forbids it.
      expect(onTerminalUnitsAccepted).not.toHaveBeenCalled();
    });

    it('recovers a parent with an empty prefix snapshot and keeps the suffix', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `X${m2}Y`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}Z`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[
        fragment0,
        fragment1,
        { t: 'Goodbye', i: 'c', blockId: 'c' },
      ]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`X${m2}Y`, `${m3}${m3}Z`, 'Goodbye'] })
        .mockResolvedValueOnce({ translatedText: [
          { i: 'parent-1-0', text: 'X' },
          { i: 'parent-1-1', text: 'Y' },
          { i: 'parent-1-2', text: 'Z' },
        ] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([
          { t: `X${m2}Y ${m3}Z`, i: 'n1', blockId: 'b1' },
          { t: 'Goodbye', i: 'c', blockId: 'c' },
        ]) },
        mockProvider, 'en', 'fa', 'msg-no-prefix-resume', mockSender
      );

      expect(result.success).toBe(true);
      expect(mockProvider.translate.mock.calls.filter(call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY)).toHaveLength(1);
      expect(result.results.map(r => r.i)).toEqual(['n1', 'c']);
      expect(result.results[0].t).toBe(`X${m2}Y ${m3}Z`);
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(1);
      expect(updates[0].data.data.map(d => d.i)).toEqual(['n1', 'c']);
    });

    it('does not leak recovered parent fragment state into later batches', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const b0 = { t: `X${m2}Y`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const b1 = { t: `${m3}Z`, i: 'n1', blockId: 'b1', isV3Fragment: true, parentId: 'b1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      const d0 = { t: `P${m2}Q`, i: 'n2', blockId: 'd1', isV3Fragment: true, parentId: 'd1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const d1 = { t: `${m3}R`, i: 'n2', blockId: 'd1', isV3Fragment: true, parentId: 'd1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[b0, b1], [d0, d1]]);
      mockProvider.translate.mockImplementation((texts, _source, _target, options) => {
        if (options.callPurpose === TranslationCallPurpose.PARENT_RECOVERY) {
          return Promise.resolve({ translatedText: [
            { i: 'parent-1-0', text: 'X' },
            { i: 'parent-1-1', text: 'Y' },
            { i: 'parent-1-2', text: 'Z' },
          ] });
        }
        const first = Array.isArray(texts) ? (texts[0]?.t ?? texts[0]) : '';
        if (String(first).startsWith('P')) {
          return Promise.resolve({ translatedText: [`P${m2}Q`, `${m3}R`] });
        }
        return Promise.resolve({ translatedText: [`X${m2}Y`, `${m3}${m3}Z`] });
      });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([
          { t: `X${m2}Y ${m3}Z`, i: 'n1', blockId: 'b1' },
          { t: `P${m2}Q ${m3}R`, i: 'n2', blockId: 'd1' },
        ]) },
        mockProvider, 'en', 'fa', 'msg-fragment-cleanup', mockSender
      );

      expect(result.success).toBe(true);
      expect(mockProvider.translate.mock.calls.filter(call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY)).toHaveLength(1);
      expect(result.results.map(r => r.i)).toEqual(['n1', 'n2']);
      expect(result.results[0].t).toBe(`X${m2}Y ${m3}Z`);
      expect(result.results[1].t).toBe(`P${m2}Q ${m3}R`);
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(2);
      const streamedIds = updates.flatMap(u => u.data.data.map(d => d.i)).sort();
      expect(streamedIds).toEqual(['n1', 'n2']);
    });

    it('does not start parent recovery when its inherited deadline is expired', async () => {
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: [`A${m2}B`] });

      await expect(handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: `A${m2}B ${m3}C`, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-parent-recovery-expired', mockSender, 'unknown', { deadlineAt: Date.now() - 1 }
      )).rejects.toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });
      expect(mockProvider.translate).not.toHaveBeenCalled();
    });

    it('freshly fragments oversized parent recovery input', async () => {
      const marker = '@@TI_SEG_s1_e1_n1@@';
      const source = `${'word '.repeat(260)}${marker}`;
      const fragment = { t: source, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 1, fragmentJoinerBefore: '' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['word '.repeat(260)] })
        .mockImplementation((texts) => Promise.resolve({ translatedText: texts.map(item => ({ id: item.i, text: item.text })) }));

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: source, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-parent-recovery-fragments', mockSender
      );

      expect(result.success).toBe(true);
      expect(mockProvider.translate.mock.calls.filter(call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY).length).toBe(1);
      const recoveryInputs = mockProvider.translate.mock.calls
        .filter(call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY)
        .map(call => call[0][0]);
      expect(recoveryInputs[0]).toEqual(expect.objectContaining({ text: expect.any(String) }));
    });

    it('derives smaller recovery fragments from the real primary V3 split limit', async () => {
      getProviderConfiguration.mockReturnValueOnce({
        batching: {
          optimalSize: 1000,
          characterLimit: 5000,
          modeOverrides: {
            select_element: { optimalSize: 1000, characterLimit: 3500 },
          },
        },
        rateLimit: { maxConcurrent: 4 },
      });
      mockEngine.createIntelligentBatches = (segments, size, chars) => TranslationBatcher.createIntelligentBatches(segments, size, chars);
      const marker = (index) => `@@TI_SEG_s1_e1_n${index}@@`;
      const source = Array.from({ length: 120 }, (_, index) => `${'word '.repeat(8)}${marker(index + 1)}`).join(' ');
      const sourceParent = { t: source, i: 'n1', blockId: 'g1' };
      const primaryBatches = TranslationBatcher.createIntelligentBatches([sourceParent], 1000, 3500);
      const primaryFragments = primaryBatches.flat();
      let primaryCall = 0;
      mockProvider.translate.mockImplementation((texts, _source, _target, options) => {
        if (options.callPurpose === TranslationCallPurpose.PARENT_RECOVERY) {
          return Promise.resolve({ translatedText: texts.map(item => ({ id: item.i, text: item.text })) });
        }
        const translated = primaryCall++ === primaryFragments.length - 1
          ? texts.map(text => text.replace(marker(120), ''))
          : texts;
        return Promise.resolve({ translatedText: translated });
      });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([sourceParent]) },
        mockProvider, 'en', 'fa', 'msg-real-primary-sizing', mockSender
      );

      const recoveryCalls = mockProvider.translate.mock.calls.filter(
        call => call[3].callPurpose === TranslationCallPurpose.PARENT_RECOVERY
      );
       const recoveryFragments = recoveryCalls.map(call => call[0][0]);
       const recoveryIntervals = recoveryFragments.flat();
      expect(result.success).toBe(true);
      expect(primaryFragments.length).toBeGreaterThan(1);
       expect(recoveryFragments.length).toBeGreaterThanOrEqual(1);
      expect(Math.max(...primaryFragments.map(fragment => fragment.t.length))).toBeLessThanOrEqual(3500);
       expect(Math.max(...recoveryFragments.map(fragment => Array.isArray(fragment)
         ? fragment.reduce((sum, item) => sum + item.text.length, 0)
         : 0))).toBeLessThanOrEqual(2625);
       expect(recoveryIntervals.every(({ intervalId, i, text }) => typeof (intervalId ?? i) === 'string' && typeof text === 'string')).toBe(true);
       expect(new Set(recoveryIntervals.map(({ intervalId, i }) => intervalId ?? i)).size).toBe(recoveryIntervals.length);
       expect(recoveryIntervals.some(({ text }) => text.includes('@@TI_SEG_'))).toBe(false);
       expect(recoveryIntervals.reduce((sum, item) => sum + item.text.length, 0)).toBeGreaterThan(0);
      expect(appendTranslationDiagnostic).toHaveBeenCalledWith(null, expect.objectContaining({
        type: 'PARENT_RECOVERY_STARTED',
        primaryFragmentLimit: 3500,
         recoveryStage: 1,
         recoveryFragmentLimit: 2625,
        primaryFragmentCount: primaryFragments.length,
        recoveryFragmentCount: recoveryFragments.length,
      }));
    });

    it('aborts in-flight parent recovery at shared deadline and suppresses late settlement', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const recovery = createDeferred();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      getAIConversationHistoryEnabledAsync.mockResolvedValue(true);
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0, fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`A${m2}B`, `${m3}${m3}C`] })
        .mockImplementationOnce(() => recovery.promise);

      try {
        const execution = handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: `A${m2}B ${m3}C`, blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'en', 'fa', 'msg-v3-recovery-timeout', mockSender, 'unknown', { deadlineAt: Date.now() + 50 }
        );
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));
        expect(mockProvider.translate.mock.calls[1][3].callPurpose).toBe(TranslationCallPurpose.PARENT_RECOVERY);
        // Recovery call shares the same abort signal/controller as the operation.
        expect(mockProvider.translate.mock.calls[1][3].abortController).toBe(mockAbortController);
        await new Promise(resolve => setTimeout(resolve, 60));
         await expect(execution).rejects.toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });
        expect(mockAbortController.abort).toHaveBeenCalledTimes(1);
        recovery.resolve({ translatedText: [`A${m2}B ${m3}C`] });
        await Promise.resolve();
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, message]) => message)
          .filter(message => message.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(0);
        // No late recovery terminal either.
        expect(browser.tabs.sendMessage.mock.calls
          .map(([, message]) => message)
          .filter(message => message.action === MessageActions.TRANSLATION_STREAM_END)).toHaveLength(0);
        // No second recovery stage starts after timeout; the late recovery
        // settlement publishes nothing.
        expect(mockProvider.translate).toHaveBeenCalledTimes(2);
        // Owned recovery-stage abort listener removed and request unregistered.
        expect(mockAbortController.signal.removeEventListener).toHaveBeenCalled();
        expect(mockEngine.lifecycleRegistry.unregisterRequest).toHaveBeenCalledWith('msg-v3-recovery-timeout');
      } finally {
        recovery.resolve({ translatedText: ['late'] });
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
      }
    });

    it('reconstructs full parent from out-of-order fragment arrival', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      const d0 = createDeferred();
      const d1 = createDeferred();
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockImplementationOnce(() => d0.promise)
        .mockImplementationOnce(() => d1.promise);

      const execution = handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: `A${m2}B ${m3}C`, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-multifrag-ooo', mockSender
      );

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

      d1.resolve({ translatedText: [`${m3}C`] });
      await Promise.resolve();
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();

      d0.resolve({ translatedText: [`A${m2}B`] });
      const result = await execution;

      expect(result.success).toBe(true);
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(1);
      expect(updates[0].data.data[0].t).toBe(`A${m2}B ${m3}C`);
    });

    it('preserves fragmentJoinerBefore semantics in source reconstruction', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const m2 = '@@TI_SEG_e_s_n2@@';
      const marker = '@@TI_SEG_e_s_n3@@';
      const joiner = '\n';
      const fragment0 = { t: `Line1 ${m2}`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${marker}Line3`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: joiner };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: [`Line1 ${m2}`] })
        .mockResolvedValueOnce({ translatedText: [`${marker}Line3`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: `Line1 ${m2}\n${marker}Line3`, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-joiner', mockSender
      );

      expect(result.success).toBe(true);
    });

    it('rejects an ownership-invalid parent before stream visibility', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const source = 'Purchases@@TI_SEG_e1_s1_n13@@video game publisher@@TI_SEG_e1_s1_n14@@Electronic Arts';
      const translated = 'خرید@@TI_SEG_e1_s1_n13@@ @@TI_SEG_e1_s1_n14@@الکترونیک آرتس';
      const payload = [{ t: source, i: 'g5' }];
      mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: [translated] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
        mockProvider, 'en', 'fa', 'msg-v3-ownership-invalid', mockSender,
      );

      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, message]) => message)
        .filter((message) => message.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      const diagnostic = appendTranslationDiagnostic.mock.calls.find(([, value]) => value?.type === 'V3_MARKER_CONTRACT_REJECTED');

      expect(result.success).toBe(false);
      expect(updates).toHaveLength(0);
      expect(diagnostic?.[1]).toMatchObject({ reason: 'V3_EMPTY_TRANSLATED_INTERVAL', parentId: 'g5' });
    });

    it('rejects a foreign marker identity before stream visibility', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const source = 'A@@TI_SEG_e1_s1_n13@@B';
      const translated = 'الف@@TI_SEG_e1_s1_N13@@ب';
      const payload = [{ t: source, i: 'g5' }];
      mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: [translated] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
        mockProvider, 'en', 'fa', 'msg-v3-foreign-identity', mockSender,
      );

      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, message]) => message)
        .filter((message) => message.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      const diagnostic = appendTranslationDiagnostic.mock.calls.find(([, value]) => value?.type === 'V3_MARKER_CONTRACT_REJECTED');

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.VALIDATION);
      expect(updates).toHaveLength(0);
      expect(diagnostic?.[1]).toMatchObject({ reason: 'MARKER_SEQUENCE_MISMATCH', parentId: 'g5' });
    });

    it('rejects V3 markers stripped entirely from translated output (source-side gating)', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const m2 = '@@TI_SEG_e_s_n2@@';
      const m3 = '@@TI_SEG_e_s_n3@@';
      const fragment0 = { t: `A${m2}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${m3}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['ترجمه کامل بدون'] })
        .mockResolvedValueOnce({ translatedText: ['هیچ marker'] })
        .mockResolvedValueOnce({ translatedText: ['ترجمه کامل بدون'] })
        .mockResolvedValueOnce({ translatedText: ['هیچ marker'] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: `A${m2}B ${m3}C`, blockId: 'g1', i: 'n1' }]) },
        mockProvider, 'en', 'fa', 'msg-v3-stripped', mockSender
      );

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.VALIDATION);
      expect(result.error.message).toContain('MARKER_COUNT_MISMATCH');
      const diagnostic = appendTranslationDiagnostic.mock.calls.find(call => call[1]?.type === 'V3_MARKER_CONTRACT_REJECTED');
      expect(diagnostic).toBeDefined();
      expect(diagnostic[1]).toMatchObject({
        type: 'V3_MARKER_CONTRACT_REJECTED',
        expectedMarkerCount: 2,
        actualMarkerCount: 0,
        reason: 'MARKER_COUNT_MISMATCH',
        parentId: 'g1',
      });
      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, m]) => m)
        .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(0);
    });

    it('does not validate V2-only text without @@TI_SEG_ markers', async () => {
      const payload = [{ t: 'Plain text', i: 'n1' }];
      mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Plain translated'] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
        mockProvider, 'en', 'fa', 'msg-v2-no-marker', mockSender
      );

      expect(result.success).toBe(true);
    });

    it('tolerates internal whitespace in V3 markers', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const marker = '@@TI_SEG_s1_e1_n1@@';
      const whitespaceMarker = '@@ TI _ SEG _ s1_e1_n1@@';
      const source = `${marker}text`;
      const payload = [{ t: source, i: 'n1' }];
      mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: [`text${whitespaceMarker}translated`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
        mockProvider, 'en', 'fa', 'msg-v3-ws', mockSender
      );

      expect(result.success).toBe(true);
    });
  });

  describe('manifest membership', () => {
    it('constructs views from carried manifest records and keeps provider payload unchanged', async () => {
      const segments = ['same', 'same'];
      const manifest = createRequestUnitManifest(segments);
      const executionContext = { manifestView: createManifestView(manifest) };
      mockEngine.createIntelligentMembershipBatches = vi.fn((items, manifestUnits) => (
        items.map((payload, index) => [{ payload, manifestUnit: manifestUnits[index] }])
      ));
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['first'] })
        .mockResolvedValueOnce({ translatedText: ['second'] });

      await handler.execute(
        mockEngine,
        { text: JSON.stringify(segments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element', messageId: 'manifest-1' },
        mockProvider,
        'en',
        'fa',
        'manifest-1',
        { tab: { id: 123 } },
        'unknown',
        executionContext,
      );

      expect(mockProvider.translate.mock.calls.map(([payload]) => payload)).toEqual([['same'], ['same']]);
      const batchView = handler._createBatchExecutionContext(executionContext, [{ payload: 'same', manifestUnit: manifest.units[1] }]).manifestView;
      expect(batchView.units[0]).toBe(manifest.units[1]);
    });

    it('skips manifest observation for split batch members', () => {
      const manifest = createRequestUnitManifest(['source']);
      const executionContext = { manifestView: createManifestView(manifest) };
      const batchContext = handler._createBatchExecutionContext(executionContext, [{ payload: 'fragment', manifestUnit: null, isSplitFragment: true }]);

      expect(batchContext.manifestView).toBeNull();
    });

    it('rejects missing non-split membership as an invalid view', () => {
      const manifest = createRequestUnitManifest(['source']);
      const executionContext = { manifestView: createManifestView(manifest) };
      const batchContext = handler._createBatchExecutionContext(executionContext, [{ payload: 'source', manifestUnit: null, isSplitFragment: false }]);

      expect(batchContext.manifestView).toBeNull();
    });

    it('forwards terminally accepted manifest unit references without mapping unitIds', async () => {
      const segments = ['same', 'same'];
      const manifest = createRequestUnitManifest(segments);
      const onTerminalUnitsAccepted = vi.fn();
      const executionContext = {
        manifestView: createManifestView(manifest),
        onTerminalUnitsAccepted,
      };
      mockEngine.createIntelligentMembershipBatches = vi.fn((items, manifestUnits) => (
        items.map((payload, index) => [{ payload, manifestUnit: manifestUnits[index] }])
      ));
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['first'] })
        .mockResolvedValueOnce({ translatedText: ['second'] });

      await handler.execute(
        mockEngine,
        { text: JSON.stringify(segments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element', messageId: 'manifest-units-1' },
        mockProvider,
        'en',
        'fa',
        'manifest-units-1',
        { tab: { id: 123 } },
        'unknown',
        executionContext,
      );

      expect(onTerminalUnitsAccepted).toHaveBeenCalledTimes(2);
      const firstBatchUnits = onTerminalUnitsAccepted.mock.calls[0][0];
      const secondBatchUnits = onTerminalUnitsAccepted.mock.calls[1][0];
      expect(firstBatchUnits).toHaveLength(1);
      expect(firstBatchUnits[0]).toBe(manifest.units[0]);
      expect(secondBatchUnits[0]).toBe(manifest.units[1]);
      expect(typeof firstBatchUnits[0]).toBe('object');
    });

    it('never invokes terminal observation for structured PDF', async () => {
      const segments = ['same', 'same'];
      const manifest = createRequestUnitManifest(segments);
      const onTerminalUnitsAccepted = vi.fn();
      const executionContext = {
        manifestView: createManifestView(manifest),
        onTerminalUnitsAccepted,
      };
      mockEngine.createIntelligentMembershipBatches = vi.fn((items, manifestUnits) => (
        items.map((payload, index) => [{ payload, manifestUnit: manifestUnits[index] }])
      ));
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['first'] })
        .mockResolvedValueOnce({ translatedText: ['second'] });

      await handler.execute(
        mockEngine,
        { text: JSON.stringify(segments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'pdf-translation', messageId: 'pdf-observe-1' },
        mockProvider,
        'en',
        'fa',
        'pdf-observe-1',
        { tab: { id: 123 } },
        'unknown',
        executionContext,
      );

      expect(onTerminalUnitsAccepted).not.toHaveBeenCalled();
    });

    it('never invokes terminal observation for traditional Select providers', async () => {
      const segments = ['same', 'same'];
      const manifest = createRequestUnitManifest(segments);
      const onTerminalUnitsAccepted = vi.fn();
      const executionContext = {
        manifestView: createManifestView(manifest),
        onTerminalUnitsAccepted,
      };
      mockEngine.createIntelligentMembershipBatches = vi.fn((items, manifestUnits) => (
        items.map((payload, index) => [{ payload, manifestUnit: manifestUnits[index] }])
      ));
      const traditionalProvider = {
        ...mockProvider,
        constructor: { batchStrategy: 'string', isAI: false },
      };
      traditionalProvider.translate
        .mockResolvedValueOnce({ translatedText: ['first'] })
        .mockResolvedValueOnce({ translatedText: ['second'] });

      await handler.execute(
        mockEngine,
        { text: JSON.stringify(segments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element', messageId: 'traditional-observe-1' },
        traditionalProvider,
        'en',
        'fa',
        'traditional-observe-1',
        { tab: { id: 123 } },
        'unknown',
        executionContext,
      );

      expect(onTerminalUnitsAccepted).not.toHaveBeenCalled();
    });

    it('never invokes terminal observation for split batch members', async () => {
      const segments = ['same', 'same'];
      const manifest = createRequestUnitManifest(segments);
      const onTerminalUnitsAccepted = vi.fn();
      const executionContext = {
        manifestView: createManifestView(manifest),
        onTerminalUnitsAccepted,
      };
      mockEngine.createIntelligentMembershipBatches = vi.fn(() => ([
        [{ payload: 'frag-a', manifestUnit: null, isSplitFragment: true }],
        [{ payload: 'frag-b', manifestUnit: null, isSplitFragment: true }],
      ]));
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['first'] })
        .mockResolvedValueOnce({ translatedText: ['second'] });

      await handler.execute(
        mockEngine,
        { text: JSON.stringify(segments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element', messageId: 'split-observe-1' },
        mockProvider,
        'en',
        'fa',
        'split-observe-1',
        { tab: { id: 123 } },
        'unknown',
        executionContext,
      );

      expect(onTerminalUnitsAccepted).not.toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    const mockData = {
      text: JSON.stringify(['s1', 's2']),
      sourceLanguage: 'auto',
      targetLanguage: 'fa',
      mode: 'select_element',
      messageId: 'msg-1',
      sessionId: 'sess-1'
    };
    const mockSender = { tab: { id: 123 } };

    it('should execute translation batches and update detected language', async () => {
      // Mock first call with detectedLanguage
      mockProvider.translate
        .mockResolvedValueOnce({ 
          translatedText: ['t1'], 
          detectedLanguage: 'fr' 
        })
        .mockResolvedValueOnce({ 
          translatedText: ['t2'] 
        });

      await handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-1', mockSender);

      expect(mockProvider.translate).toHaveBeenCalledTimes(2);
      // Second call should use 'fr'
      expect(mockProvider.translate.mock.calls[1][1]).toBe('fr');
    });

    it('should keep the history-enabled lane ordered', async () => {
      vi.useRealTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      getAIConversationHistoryEnabledAsync.mockResolvedValue(true);

      const firstBatch = createDeferred();
      const secondBatch = createDeferred();
      const data = { ...mockData, sourceLanguage: 'en' };

      mockProvider.translate
        .mockImplementationOnce(() => firstBatch.promise)
        .mockImplementationOnce(() => secondBatch.promise);

      const execution = handler.execute(mockEngine, data, mockProvider, 'en', 'fa', 'msg-ordered', mockSender);

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));

      firstBatch.resolve({ translatedText: ['t1'] });
      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

      secondBatch.resolve({ translatedText: ['t2'] });
      await execution;
    });

    it('should dispatch history-disabled batches in parallel when source language is explicit', async () => {
      vi.useRealTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      getAIConversationHistoryEnabledAsync.mockResolvedValue(false);

      const firstBatch = createDeferred();
      const secondBatch = createDeferred();
      const data = { ...mockData, sourceLanguage: 'en' };

      mockProvider.translate
        .mockImplementationOnce(() => firstBatch.promise)
        .mockImplementationOnce(() => secondBatch.promise);

      const execution = handler.execute(mockEngine, data, mockProvider, 'en', 'fa', 'msg-parallel', mockSender);

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

      firstBatch.resolve({ translatedText: ['t1'] });
      secondBatch.resolve({ translatedText: ['t2'] });

      await execution;
    });

    it('should run the first batch before the rest when history is disabled and source is auto', async () => {
      vi.useRealTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      getAIConversationHistoryEnabledAsync.mockResolvedValue(false);

      const firstBatch = createDeferred();
      const secondBatch = createDeferred();
      const data = { ...mockData, sourceLanguage: 'auto' };

      mockProvider.translate
        .mockImplementationOnce(() => firstBatch.promise)
        .mockImplementationOnce(() => secondBatch.promise);

      const execution = handler.execute(mockEngine, data, mockProvider, 'auto', 'fa', 'msg-auto', mockSender);

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));

      firstBatch.resolve({ translatedText: ['t1'], detectedLanguage: 'fr' });
      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));
      expect(mockProvider.translate.mock.calls[1][1]).toBe('fr');

      secondBatch.resolve({ translatedText: ['t2'] });
      await execution;
    });

    it('should dispatch all stateless AUTO batches immediately for a bypass-safe resolution', async () => {
      const firstBatch = createDeferred();
      const secondBatch = createDeferred();
      resolveOperationSourceLanguage.mockResolvedValueOnce({
        canBypassSequentialGate: true,
        bypassReason: 'HIGH_CONFIDENCE_STATISTICAL',
        effectiveSourceLanguage: 'en',
        effectiveTargetLanguage: 'fa',
        detection: { confidence: 'high', provenance: 'statistical' },
      });
      mockProvider.translate
        .mockImplementationOnce(() => firstBatch.promise)
        .mockImplementationOnce(() => secondBatch.promise);

      const execution = handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-auto-bypass', mockSender);

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));
      expect(resolveOperationSourceLanguage).toHaveBeenCalledTimes(1);
      expect(mockProvider.translate.mock.calls[0][1]).toBe('en');
      expect(mockProvider.translate.mock.calls[0][2]).toBe('fa');
      expect(mockProvider.translate.mock.calls[1][1]).toBe('en');
      expect(mockProvider.translate.mock.calls[1][2]).toBe('fa');

      secondBatch.resolve({ translatedText: ['t2'] });
      firstBatch.resolve({ translatedText: ['t1'], detectedLanguage: 'de' });
      const result = await execution;

      expect(result.results).toEqual(['t1', 't2']);
      expect(result.results).not.toContain('de');
    });

    it('should propagate one swapped source/target pair to every bypassed batch', async () => {
      const firstBatch = createDeferred();
      const secondBatch = createDeferred();
      resolveOperationSourceLanguage.mockResolvedValueOnce({
        canBypassSequentialGate: true,
        bypassReason: 'LANGUAGE_SPECIFIC_DETERMINISTIC',
        effectiveSourceLanguage: 'fa',
        effectiveTargetLanguage: 'en',
        detection: { confidence: 'high', provenance: 'deterministic-script' },
      });
      mockProvider.translate
        .mockImplementationOnce(() => firstBatch.promise)
        .mockImplementationOnce(() => secondBatch.promise);

      const execution = handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-auto-swap', mockSender);

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));
      expect(mockProvider.translate.mock.calls[0].slice(1, 3)).toEqual(['fa', 'en']);
      expect(mockProvider.translate.mock.calls[1].slice(1, 3)).toEqual(['fa', 'en']);
      expect(mockProvider.translate.mock.calls[0][3].languagePairResolved).toBe(true);
      expect(mockProvider.translate.mock.calls[1][3].languagePairResolved).toBe(true);

      firstBatch.resolve({ translatedText: ['t1'] });
      secondBatch.resolve({ translatedText: ['t2'] });
      await execution;
    });

    it('should propagate authoritative pair semantics to every high-confidence AUTO batch', async () => {
      const segments = ['s1', 's2', 's3', 's4'];
      mockEngine.createIntelligentBatches = vi.fn((items) => items.map((item) => [item]));
      resolveOperationSourceLanguage.mockResolvedValueOnce({
        canBypassSequentialGate: true,
        bypassReason: 'HIGH_CONFIDENCE_STATISTICAL',
        effectiveSourceLanguage: 'en',
        effectiveTargetLanguage: 'fa',
        detection: { language: 'en', confidence: 'high', provenance: 'statistical' },
      });
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['t1'] })
        .mockResolvedValueOnce({ translatedText: ['t2'] })
        .mockResolvedValueOnce({ translatedText: ['t3'] })
        .mockResolvedValueOnce({ translatedText: ['t4'] });

      await handler.execute(
        mockEngine,
        { ...mockData, text: JSON.stringify(segments), sourceLanguage: 'auto' },
        mockProvider,
        'auto',
        'fa',
        'msg-auto-authoritative',
        mockSender,
      );

      expect(mockProvider.translate).toHaveBeenCalledTimes(4);
      expect(mockProvider.translate.mock.calls.map(([, source, target]) => [source, target])).toEqual([
        ['en', 'fa'],
        ['en', 'fa'],
        ['en', 'fa'],
        ['en', 'fa'],
      ]);
      expect(mockProvider.translate.mock.calls.map((call) => call[3].languagePairResolved)).toEqual([
        true,
        true,
        true,
        true,
      ]);
    });

    it.each([
      ['EXACT_CACHE_NOT_VERIFIED'],
      ['MIXED_LANGUAGE_RISK'],
    ])('should retain first-batch fallback for denied AUTO resolution: %s', async (bypassReason) => {
      const firstBatch = createDeferred();
      const secondBatch = createDeferred();
      resolveOperationSourceLanguage.mockResolvedValueOnce({
        canBypassSequentialGate: false,
        bypassReason,
      });
      mockProvider.translate
        .mockImplementationOnce(() => firstBatch.promise)
        .mockImplementationOnce(() => secondBatch.promise);

      const execution = handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', `msg-auto-${bypassReason}`, mockSender);

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));
      expect(mockProvider.translate.mock.calls[0].slice(1, 3)).toEqual(['auto', 'fa']);
      expect(mockProvider.translate.mock.calls[0][3].languagePairResolved).toBeUndefined();
      firstBatch.resolve({ translatedText: ['t1'], detectedLanguage: 'en' });
      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

      // Batch 1 resolved the semantic pair; later batches inherit the resolved
      // source/target and skip ProviderCoordinator swap/detection.
      expect(mockProvider.translate.mock.calls[1].slice(1, 3)).toEqual(['en', 'fa']);
      expect(mockProvider.translate.mock.calls[1][3].languagePairResolved).toBe(true);
      secondBatch.resolve({ translatedText: ['t2'] });
      await execution;
    });

    it('keeps later batches unresolved when the first batch cannot confirm a source', async () => {
      const firstBatch = createDeferred();
      const secondBatch = createDeferred();
      resolveOperationSourceLanguage.mockResolvedValueOnce({
        canBypassSequentialGate: false,
        bypassReason: 'HEURISTIC_RESULT',
      });
      mockProvider.translate
        .mockImplementationOnce(() => firstBatch.promise)
        .mockImplementationOnce(() => secondBatch.promise);

      const execution = handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-auto-still-unresolved', mockSender);

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));
      // Response keeps source unresolved ('auto'): no concrete resolution was
      // proven, so later batches must retain per-batch AUTO behavior.
      firstBatch.resolve({ translatedText: ['t1'], detectedLanguage: 'auto' });
      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));
      expect(mockProvider.translate.mock.calls[1].slice(1, 3)).toEqual(['auto', 'fa']);
      expect(mockProvider.translate.mock.calls[1][3].languagePairResolved).toBeUndefined();
      secondBatch.resolve({ translatedText: ['t2'] });
      await execution;
    });

    it('keeps later batches unresolved when the first batch returns no detection', async () => {
      const firstBatch = createDeferred();
      const secondBatch = createDeferred();
      mockProvider.translate
        .mockImplementationOnce(() => firstBatch.promise)
        .mockImplementationOnce(() => secondBatch.promise);

      const execution = handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-auto-no-detection', mockSender);

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));
      firstBatch.resolve({ translatedText: ['t1'] });
      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));
      expect(mockProvider.translate.mock.calls[1].slice(1, 3)).toEqual(['auto', 'fa']);
      expect(mockProvider.translate.mock.calls[1][3].languagePairResolved).toBeUndefined();
      secondBatch.resolve({ translatedText: ['t2'] });
      await execution;
    });

    it('should keep high-confidence AUTO operations sequential when history is enabled', async () => {
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      getAIConversationHistoryEnabledAsync.mockResolvedValue(true);
      resolveOperationSourceLanguage.mockResolvedValueOnce({
        canBypassSequentialGate: true,
        effectiveSourceLanguage: 'en',
        effectiveTargetLanguage: 'fa',
      });
      const firstBatch = createDeferred();
      const secondBatch = createDeferred();
      mockProvider.translate
        .mockImplementationOnce(() => firstBatch.promise)
        .mockImplementationOnce(() => secondBatch.promise);

      const execution = handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-auto-history', mockSender);

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));
      expect(resolveOperationSourceLanguage).not.toHaveBeenCalled();
      expect(mockProvider.translate.mock.calls[0][3].languagePairResolved).toBeUndefined();
      firstBatch.resolve({ translatedText: ['t1'] });
      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));
      secondBatch.resolve({ translatedText: ['t2'] });
      await execution;
      getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
    });

    it('should abort in-flight siblings when a bypassed batch fails fatally', async () => {
      const fatalError = new Error('429 Too Many Requests');
      fatalError.isFatal = true;
      const siblingBatch = createDeferred();
      resolveOperationSourceLanguage.mockResolvedValueOnce({
        canBypassSequentialGate: true,
        bypassReason: 'HIGH_CONFIDENCE_STATISTICAL',
        effectiveSourceLanguage: 'en',
        effectiveTargetLanguage: 'fa',
        detection: { confidence: 'high', provenance: 'statistical' },
      });
      mockProvider.translate
        .mockRejectedValueOnce(fatalError)
        .mockImplementationOnce(() => siblingBatch.promise);

      const execution = handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-auto-fatal', mockSender);
      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));
      siblingBatch.resolve({ translatedText: ['late-sibling'] });

      const result = await execution;

      expect(mockAbortController.abort).toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.results).not.toContain('late-sibling');
    });

    it('should ignore late parallel batch completions after response resolution cancellation', async () => {
      vi.useRealTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      const browser = (await import('webextension-polyfill')).default;
      getAIConversationHistoryEnabledAsync.mockResolvedValue(false);

      const firstBatch = createDeferred();
      const secondBatch = createDeferred();
      const data = { ...mockData, sourceLanguage: 'en' };

      mockProvider.translate
        .mockImplementationOnce(() => firstBatch.promise)
        .mockImplementationOnce(() => secondBatch.promise);

      browser.tabs.sendMessage.mockClear();

      const execution = handler.execute(mockEngine, data, mockProvider, 'en', 'fa', 'msg-cancel', mockSender);

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

      firstBatch.resolve({ translatedText: ['t1'] });
       mockAbortController.abort('user-cancelled');
      secondBatch.resolve({ translatedText: ['t2'] });

      const result = await execution;

      expect(result.success).toBe(false);
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle fatal errors by aborting other batches', async () => {
      const fatalError = new Error('429');
      fatalError.isFatal = true;

      mockProvider.translate.mockRejectedValueOnce(fatalError);

      await handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-1', mockSender);

      expect(mockAbortController.abort).toHaveBeenCalled();
    });

    it('preserves parallel provider failure when sibling observes internal cancellation', async () => {
      const circuitError = Object.assign(new Error('Circuit open'), {
        type: ErrorTypes.CIRCUIT_BREAKER_OPEN,
        originalType: ErrorTypes.SERVER_ERROR,
        isFatal: true,
      });
      const data = { ...mockData, sourceLanguage: 'en' };

      mockProvider.translate
        .mockRejectedValueOnce(circuitError)
        .mockResolvedValueOnce({ translatedText: ['late sibling'] });

      const result = await handler.execute(mockEngine, data, mockProvider, 'en', 'fa', 'msg-provider-failure', mockSender);

      expect(result).toMatchObject({
        success: false,
        error: {
          type: ErrorTypes.CIRCUIT_BREAKER_OPEN,
          originalType: ErrorTypes.SERVER_ERROR,
        },
      });
      expect(result.success).not.toBe(true);
      expect(result.error.type).not.toBe(ErrorTypes.USER_CANCELLED);
      expect(result.error.type).not.toBe(ErrorTypes.TRANSLATION_CANCELLED);
      expect(queueCancelMock).not.toHaveBeenCalled();
    });

    it('genuine cancellation after a non-fatal error returns USER_CANCELLED (not lastError)', async () => {
      vi.useRealTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      getAIConversationHistoryEnabledAsync.mockResolvedValue(false);

      const firstBatch = createDeferred();
      const secondBatch = createDeferred();
      const data = { ...mockData, sourceLanguage: 'en' };

      mockProvider.translate
        .mockImplementationOnce(() => firstBatch.promise)
        .mockImplementationOnce(() => secondBatch.promise);

      const execution = handler.execute(mockEngine, data, mockProvider, 'en', 'fa', 'msg-cancel-after-err', mockSender);

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

      // First batch fails with non-fatal error
      firstBatch.reject(Object.assign(new Error('Non-fatal'), { type: 'TRANSLATION_FAILED' }));
      await Promise.resolve();

      // User cancels after error
      mockAbortController.abort('user-cancelled');
      secondBatch.resolve({ translatedText: ['t2'] });

      const result = await execution;

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.USER_CANCELLED);
      expect(queueCancelMock).not.toHaveBeenCalled();
    });

    it('genuine cancellation with no earlier error returns USER_CANCELLED', async () => {
      vi.useRealTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      getAIConversationHistoryEnabledAsync.mockResolvedValue(false);

      const firstBatch = createDeferred();
      const secondBatch = createDeferred();
      const data = { ...mockData, sourceLanguage: 'en' };

      mockProvider.translate
        .mockImplementationOnce(() => firstBatch.promise)
        .mockImplementationOnce(() => secondBatch.promise);

      const execution = handler.execute(mockEngine, data, mockProvider, 'en', 'fa', 'msg-cancel-no-err', mockSender);

      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

      firstBatch.resolve({ translatedText: ['t1'] });

      // User cancels before second batch settles
      mockAbortController.abort('user-cancelled');
      secondBatch.resolve({ translatedText: ['t2'] });

      const result = await execution;

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.USER_CANCELLED);
    });

    it('treats lifecycle tombstone without signal reason as operation abort', async () => {
      mockEngine.isCancelled.mockReturnValue(true);

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en' },
        mockProvider,
        'en',
        'fa',
        'msg-tombstone-stop',
        mockSender,
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatchObject({
        operationAborted: true,
        cancellationReason: 'operation-abort',
      });
      expect(result.error.type).not.toBe(ErrorTypes.USER_CANCELLED);
      expect(result.error.isCancelled).not.toBe(true);
      expect(mockProvider.translate).not.toHaveBeenCalled();
    });

    it('keeps parent recovery tombstone as operation abort', async () => {
      const marker = '@@TI_SEG_e_s_n1@@';
      const source = `A${marker}B ${marker}C`;
      const fragment0 = { t: `A${marker}B`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' };
      const fragment1 = { t: `${marker}C`, i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' };
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0, fragment1]]);
      mockEngine.isCancelled
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValue(true);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: [`A${marker}B`, `${marker}${marker}C`] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: source, blockId: 'g1', i: 'n1' }]) },
        mockProvider,
        'en',
        'fa',
        'msg-parent-tombstone',
        mockSender,
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatchObject({
        operationAborted: true,
        cancellationReason: 'operation-abort',
      });
      expect(result.error.type).not.toBe(ErrorTypes.USER_CANCELLED);
      expect(result.error.isCancelled).not.toBe(true);
    });

    it.each([
      [undefined, 'lifecycle-cleanup'],
      [ErrorTypes.TRANSLATION_ERROR, 'operation-abort'],
      [ErrorTypes.UNKNOWN, 'document-replaced'],
    ])('keeps generic operation abort control for %s', async (type, cancellationReason) => {
      mockEngine.createIntelligentBatches = vi.fn(() => [[{ t: 'abort me' }]]);
      mockProvider.translate.mockImplementationOnce(() => {
        mockAbortController.signal.aborted = true;
        mockAbortController.signal.reason = cancellationReason;
        return Promise.reject(Object.assign(new Error('operation aborted'), {
          name: 'AbortError',
          ...(type ? { type } : {}),
          operationAborted: true,
          cancellationReason,
        }));
      });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'abort me' }]) },
        mockProvider,
        'en',
        'fa',
        `msg-generic-abort-${type || 'none'}`,
        mockSender,
      );

      expect(result).toMatchObject({
        success: false,
        streaming: true,
        error: {
          type: ErrorTypes.TRANSLATION_ERROR,
          operationAborted: true,
          cancellationReason,
        },
        errorDetails: {
          type: ErrorTypes.TRANSLATION_ERROR,
          operationAborted: true,
          cancellationReason,
        },
      });
      expect(result.error).not.toHaveProperty('isCancelled', true);
      expect(result.error).not.toHaveProperty('type', ErrorTypes.TRANSLATION_TIMEOUT);
      expect(result.error).not.toHaveProperty('type', ErrorTypes.USER_CANCELLED);
    });

    it.each(['lifecycle-cleanup', 'document-replaced'])(
      'serializes generic operation abort when signal remains live: %s',
      async (cancellationReason) => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();
        mockEngine.createIntelligentBatches = vi.fn(() => [[{ t: 'abort me' }]]);
        mockProvider.translate.mockRejectedValueOnce(Object.assign(new Error('operation aborted'), {
          name: 'AbortError',
          operationAborted: true,
          cancellationReason,
        }));

        expect(mockAbortController.signal.aborted).toBe(false);
        expect(mockEngine.isCancelled('msg-live-generic-abort')).toBe(false);

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'abort me' }]) },
          mockProvider,
          'en',
          'fa',
          'msg-live-generic-abort',
          mockSender,
        );

        expect(mockAbortController.signal.aborted).toBe(true);
        expect(result).toMatchObject({
          success: false,
          streaming: true,
          error: {
            type: ErrorTypes.TRANSLATION_ERROR,
            operationAborted: true,
            cancellationReason,
          },
          errorDetails: {
            type: ErrorTypes.TRANSLATION_ERROR,
            operationAborted: true,
            cancellationReason,
          },
        });
        expect(result.error.type).not.toBe(ErrorTypes.USER_CANCELLED);
        expect(result.error.type).not.toBe(ErrorTypes.TRANSLATION_TIMEOUT);
        expect(browser.tabs.sendMessage.mock.calls.filter(([, message]) => (
          message.action === MessageActions.TRANSLATION_STREAM_END
            && message.data?.success === true
        ))).toHaveLength(0);
      },
    );

    it('preserves explicit user cancellation result shape', async () => {
      mockEngine.createIntelligentBatches = vi.fn(() => [[{ t: 'cancel me' }]]);
      mockAbortController.signal.aborted = true;
      mockAbortController.signal.reason = 'user-cancelled';
      mockProvider.translate.mockRejectedValueOnce(Object.assign(new Error('Cancelled by user'), {
        name: 'AbortError',
        type: ErrorTypes.USER_CANCELLED,
        isCancelled: true,
      }));

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'cancel me' }]) },
        mockProvider,
        'en',
        'fa',
        'msg-user-cancel-shape',
        mockSender,
      );

      expect(result).toMatchObject({
        success: false,
        streaming: true,
        error: {
          type: ErrorTypes.USER_CANCELLED,
          isCancelled: true,
        },
      });
      expect(result).not.toHaveProperty('errorDetails');
    });

    it.each([
      ErrorTypes.TRANSLATION_TIMEOUT,
      ErrorTypes.NETWORK_ERROR,
      ErrorTypes.API_KEY_INVALID,
    ])('keeps strong typed %s failure with operation abort provenance', async (type) => {
      mockEngine.createIntelligentBatches = vi.fn(() => [[{ t: 'typed abort' }]]);
      mockProvider.translate.mockRejectedValueOnce(Object.assign(new Error(`${type} failure`), {
        name: 'AbortError',
        type,
        operationAborted: true,
        cancellationReason: 'operation-abort',
      }));

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'typed abort' }]) },
        mockProvider,
        'en',
        'fa',
        `msg-strong-abort-${type}`,
        mockSender,
      );

      expect(result).toMatchObject({
        success: false,
        error: {
          type,
          operationAborted: true,
          cancellationReason: 'operation-abort',
        },
        errorDetails: {
          type,
          operationAborted: true,
          cancellationReason: 'operation-abort',
        },
      });
      expect(result.error.type).not.toBe(ErrorTypes.USER_CANCELLED);
      expect(result.error.type).not.toBe(ErrorTypes.TRANSLATION_CANCELLED);

      const browser = (await import('webextension-polyfill')).default;
      expect(browser.tabs.sendMessage.mock.calls.filter(([, message]) => (
        message.action === MessageActions.TRANSLATION_STREAM_END
          && message.data?.success === false
      ))).toHaveLength(0);
    });

    it('preserves canonical type on typed AbortError', async () => {
      mockEngine.createIntelligentBatches = vi.fn(() => [[{ t: 'timeout me' }]]);
      matchErrorToType.mockImplementation(() => {
        throw new Error('typed canonical errors must bypass matcher');
      });
      mockProvider.translate.mockRejectedValueOnce(Object.assign(new Error('typed timeout'), {
        name: 'AbortError',
        type: ErrorTypes.TRANSLATION_TIMEOUT,
      }));

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'timeout me' }]) },
        mockProvider,
        'en',
        'fa',
        'msg-typed-abort-timeout',
        mockSender,
      );

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.TRANSLATION_TIMEOUT);
      expect(result.error.operationAborted).not.toBe(true);
      expect(result.error.type).not.toBe(ErrorTypes.USER_CANCELLED);
    });

    it('keeps diagnostic classification for untyped non-abort failures', async () => {
      matchErrorToType.mockImplementation((error) => (
        error?.message === 'ordinary failure' ? ErrorTypes.NETWORK_ERROR : error?.type || 'UNKNOWN_ERROR'
      ));
      mockEngine.createIntelligentBatches = vi.fn(() => [[{ t: 'ordinary failure' }]]);
      mockProvider.translate.mockRejectedValueOnce(new Error('ordinary failure'));

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'ordinary failure' }]) },
        mockProvider,
        'en',
        'fa',
        'msg-diagnostic-classification',
        mockSender,
      );

      expect(result.success).toBe(false);
      expect(appendTranslationDiagnostic).toHaveBeenCalledWith(null, expect.objectContaining({
        type: 'STRUCTURED_BATCH_FAILURE',
        code: ErrorTypes.NETWORK_ERROR,
      }));
    });

    it('fatal validation error preserves original error type through abort', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const payload = [{ i: 'n1', t: 'A.' }, { i: 'n1', t: 'B.' }];
      mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: ['TA.', 'TB.'] });

      const result = await handler.execute(
        mockEngine,
        { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
        mockProvider, 'en', 'fa', 'msg-validation-abort', mockSender
      );

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.VALIDATION);
    });

    it('should never stream original content for a failed batch', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const failure = new Error('Non-fatal batch failure');
      failure.type = 'TRANSLATION_FAILED';

      mockProvider.translate
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({ translatedText: ['t2'] });

      const result = await handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-fail-1', mockSender);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      const messages = browser.tabs.sendMessage.mock.calls.map(c => c[1]);
      const updates = messages.filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(1);
      updates.forEach((update) => {
        expect(JSON.stringify(update.data.data)).not.toContain('s1');
      });
    });

    it('should emit a failing stream end when a batch fails', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const failure = new Error('Non-fatal batch failure');
      failure.type = 'TRANSLATION_FAILED';

      mockProvider.translate
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({ translatedText: ['t2'] });

      const result = await handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-fail-2', mockSender);

      expect(result.success).toBe(false);

      const messages = browser.tabs.sendMessage.mock.calls.map(c => c[1]);
      const ends = messages.filter(m => m.action === MessageActions.TRANSLATION_STREAM_END);
      expect(ends).toHaveLength(1);
      expect(ends[0].data.success).toBe(false);
      expect(ends[0].data.error).toBeDefined();
    });

    it('should fail the batch and emit no stream update when a mapped item is null', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      mockProvider.translate.mockResolvedValueOnce({ translatedText: [null] });

      const result = await handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-null', mockSender);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      const messages = browser.tabs.sendMessage.mock.calls.map(c => c[1]);
      expect(messages.filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE)).toHaveLength(0);
    });

    it('should fail the batch and emit no stream update when a mapped item is undefined', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      mockProvider.translate.mockResolvedValueOnce({ translatedText: [undefined] });

      const result = await handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-undef', mockSender);

      expect(result.success).toBe(false);
      const messages = browser.tabs.sendMessage.mock.calls.map(c => c[1]);
      expect(messages.filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE)).toHaveLength(0);
    });

    it('should reject RAW_JSON_RESULT with a preserved diagnostic and no stream update', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      appendTranslationDiagnostic.mockClear();

      const malformedJson = '{"this is malformed": and fails parse ", but has markers and is long enough }';
      mockProvider.translate.mockResolvedValueOnce({ translatedText: [malformedJson] });

      const result = await handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-rawjson', mockSender);

      expect(result.success).toBe(false);
      const rawJsonDiagnostic = appendTranslationDiagnostic.mock.calls.find(call => call[1]?.code === 'RAW_JSON_RESULT');
      expect(rawJsonDiagnostic).toBeDefined();
      expect(rawJsonDiagnostic[1]).toMatchObject({ type: 'STRUCTURED_RESULT_REJECTED', code: 'RAW_JSON_RESULT' });
      const messages = browser.tabs.sendMessage.mock.calls.map(c => c[1]);
      expect(messages.filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE)).toHaveLength(0);
    });

    it('should keep streaming successful batches unchanged', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['t1'] })
        .mockResolvedValueOnce({ translatedText: ['t2'] });

      const result = await handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-ok', mockSender);

      expect(result.success).toBe(true);

      const messages = browser.tabs.sendMessage.mock.calls.map(c => c[1]);
      const updates = messages.filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(2);
      expect(updates.map(u => u.data.data)).toEqual([['t1'], ['t2']]);

      const ends = messages.filter(m => m.action === MessageActions.TRANSLATION_STREAM_END);
      expect(ends).toHaveLength(1);
      expect(ends[0].data.success).toBe(true);
    });

    it('should abort other batches on fatal error without streaming original content', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      const fatalError = new Error('429 Too Many Requests');
      fatalError.isFatal = true;

      mockProvider.translate
        .mockRejectedValueOnce(fatalError)
        .mockResolvedValueOnce({ translatedText: ['t2'] });

      const result = await handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-fatal', mockSender);

      expect(mockAbortController.abort).toHaveBeenCalled();
      expect(result.success).toBe(false);

      const messages = browser.tabs.sendMessage.mock.calls.map(c => c[1]);
      const updates = messages.filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      updates.forEach((update) => {
        expect(JSON.stringify(update.data.data)).not.toContain('s1');
      });
    });

    it('should abort and propagate a canonical timeout without starting the next sequential batch', async () => {
      vi.useFakeTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      const firstBatch = createDeferred();
      let execution;

      try {
        getAIConversationHistoryEnabledAsync.mockResolvedValue(true);
        mockProvider.translate
          .mockImplementationOnce(() => firstBatch.promise)
          .mockResolvedValue({ translatedText: ['t2'] });

        execution = handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-timeout', mockSender);
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));
        await vi.advanceTimersByTimeAsync(TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS);

        expect(mockAbortController.abort).toHaveBeenCalledTimes(1);
        await expect(execution).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });
        expect(mockProvider.translate).toHaveBeenCalledTimes(1);

      } finally {
        firstBatch.resolve({ translatedText: ['late'] });
        await execution?.catch(() => {});
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        vi.useRealTimers();
      }
    });

    it('shares one absolute deadline across sequential batches', async () => {
      vi.useFakeTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      const firstBatch = createDeferred();
      const secondBatch = createDeferred();

      try {
        getAIConversationHistoryEnabledAsync.mockResolvedValue(true);
        mockProvider.translate
          .mockImplementationOnce(() => firstBatch.promise)
          .mockImplementationOnce(() => secondBatch.promise);

        const execution = handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-shared-deadline', mockSender);
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));

        await vi.advanceTimersByTimeAsync(TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS - 1000);
        firstBatch.resolve({ translatedText: ['t1'] });
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

        await vi.advanceTimersByTimeAsync(1000);
        await expect(execution).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });
        expect(mockAbortController.abort).toHaveBeenCalledTimes(1);
        expect(mockProvider.translate).toHaveBeenCalledTimes(2);
      } finally {
        firstBatch.resolve({ translatedText: ['late'] });
        secondBatch.resolve({ translatedText: ['late'] });
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        vi.useRealTimers();
      }
    });

    it('shares one absolute deadline across auto-detection and remaining batches', async () => {
      vi.useFakeTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      const firstBatch = createDeferred();
      const secondBatch = createDeferred();

      try {
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        mockProvider.translate
          .mockImplementationOnce(() => firstBatch.promise)
          .mockImplementationOnce(() => secondBatch.promise);

        const execution = handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-auto-deadline', mockSender);
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));

        await vi.advanceTimersByTimeAsync(TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS - 1000);
        firstBatch.resolve({ translatedText: ['t1'], detectedLanguage: 'en' });
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

        await vi.advanceTimersByTimeAsync(1000);
        await expect(execution).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });
        expect(mockAbortController.abort).toHaveBeenCalledTimes(1);
      } finally {
        firstBatch.resolve({ translatedText: ['late'] });
        secondBatch.resolve({ translatedText: ['late'] });
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        vi.useRealTimers();
      }
    });

    it('uses one absolute deadline for parallel batches', async () => {
      vi.useFakeTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      const firstBatch = createDeferred();
      const secondBatch = createDeferred();

      try {
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        mockProvider.translate
          .mockImplementationOnce(() => firstBatch.promise)
          .mockImplementationOnce(() => secondBatch.promise);

        const execution = handler.execute(mockEngine, { ...mockData, sourceLanguage: 'en' }, mockProvider, 'en', 'fa', 'msg-parallel-deadline', mockSender);
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));
        expect(mockProvider.translate.mock.calls[0][3].executionContext.deadlineAt)
          .toBe(mockProvider.translate.mock.calls[1][3].executionContext.deadlineAt);

        await vi.advanceTimersByTimeAsync(TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS);
        await expect(execution).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });
        expect(mockAbortController.abort).toHaveBeenCalledTimes(1);
      } finally {
        firstBatch.resolve({ translatedText: ['late'] });
        secondBatch.resolve({ translatedText: ['late'] });
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        vi.useRealTimers();
      }
    });

    it('does not start a batch when the operation deadline already expired', async () => {
      vi.useFakeTimers();
      const executionContext = { deadlineAt: Date.now() - 1 };

      try {
        const execution = handler.execute(
          mockEngine,
          mockData,
          mockProvider,
          'en',
          'fa',
          'msg-expired-deadline',
          mockSender,
          'unknown',
          executionContext
        );

        await expect(execution).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });
        expect(mockProvider.translate).not.toHaveBeenCalled();
        expect(mockAbortController.abort).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('preserves an earlier supplied deadline', async () => {
      vi.useFakeTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      const deferred = createDeferred();
      const suppliedDeadlineAt = Date.now() + 50000;

      try {
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        mockProvider.translate.mockImplementationOnce(() => deferred.promise);

        const execution = handler.execute(
          mockEngine,
          mockData,
          mockProvider,
          'en',
          'fa',
          'msg-earlier-deadline',
          mockSender,
          'unknown',
          { deadlineAt: suppliedDeadlineAt }
        );
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));
        expect(mockProvider.translate.mock.calls[0][3].executionContext.deadlineAt).toBe(suppliedDeadlineAt);

        await vi.advanceTimersByTimeAsync(Math.max(0, suppliedDeadlineAt - Date.now() - 1));
        expect(mockAbortController.abort).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await expect(execution).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });
        expect(mockAbortController.abort).toHaveBeenCalledTimes(1);
      } finally {
        deferred.resolve({ translatedText: ['late'] });
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        vi.useRealTimers();
      }
    });

    it('clamps a later supplied deadline to the canonical operation budget', async () => {
      vi.useFakeTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      const deferred = createDeferred();
      const localStart = Date.now();
      const suppliedDeadlineAt = localStart + 600000;

      try {
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        mockProvider.translate.mockImplementationOnce(() => deferred.promise);

        const execution = handler.execute(
          mockEngine,
          mockData,
          mockProvider,
          'en',
          'fa',
          'msg-later-deadline',
          mockSender,
          'unknown',
          { deadlineAt: suppliedDeadlineAt }
        );
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));
        expect(mockProvider.translate.mock.calls[0][3].executionContext.deadlineAt)
          .toBe(localStart + TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS);

        await vi.advanceTimersByTimeAsync(TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS);
        await expect(execution).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });
        expect(mockAbortController.abort).toHaveBeenCalledTimes(1);
      } finally {
        deferred.resolve({ translatedText: ['late'] });
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        vi.useRealTimers();
      }
    });

    it('falls back to the canonical budget for malformed deadline metadata', async () => {
      vi.useFakeTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      const deferred = createDeferred();
      const localStart = Date.now();

      try {
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        mockProvider.translate.mockImplementationOnce(() => deferred.promise);

        const execution = handler.execute(
          mockEngine,
          mockData,
          mockProvider,
          'en',
          'fa',
          'msg-invalid-deadline',
          mockSender,
          'unknown',
          { deadlineAt: Number.NaN }
        );
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));
        expect(mockProvider.translate.mock.calls[0][3].executionContext.deadlineAt)
          .toBe(localStart + TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS);
        expect(mockAbortController.abort).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS);
        await expect(execution).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });
      } finally {
        deferred.resolve({ translatedText: ['late'] });
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        vi.useRealTimers();
      }
    });

    it('should clear successful batch deadlines without appending a late timeout diagnostic', async () => {
      vi.useFakeTimers();
      try {
        mockProvider.translate
          .mockResolvedValueOnce({ translatedText: ['t1'] })
          .mockResolvedValueOnce({ translatedText: ['t2'] });

        const execution = handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-cleanup', mockSender);
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));
        await vi.advanceTimersByTimeAsync(50);
        await expect(execution).resolves.toMatchObject({ success: true });
        await vi.advanceTimersByTimeAsync(300000);

        expect(mockAbortController.abort).not.toHaveBeenCalled();
        expect(appendTranslationDiagnostic).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ type: 'BATCH_TIMEOUT' })
        );
        expect(mockAbortController.signal.removeEventListener).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should suppress late provider settlement after a timeout', async () => {
      vi.useFakeTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      const browser = (await import('webextension-polyfill')).default;
      const firstBatch = createDeferred();

      try {
        getAIConversationHistoryEnabledAsync.mockResolvedValue(true);
        mockProvider.translate.mockImplementationOnce(() => firstBatch.promise);
        browser.tabs.sendMessage.mockClear();

        const execution = handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-late', mockSender);
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));
        await vi.advanceTimersByTimeAsync(300000);
        await expect(execution).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });

        firstBatch.resolve({ translatedText: ['late'] });
        await Promise.resolve();

        expect(mockProvider.translate).toHaveBeenCalledTimes(1);
        expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
      } finally {
        firstBatch.resolve({ translatedText: ['late'] });
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        vi.useRealTimers();
      }
    });

    it('should settle immediately when abort occurs at listener registration', async () => {
      const browser = (await import('webextension-polyfill')).default;
      const pending = createDeferred();

      mockAbortController.signal.addEventListener.mockImplementation(() => {
        mockAbortController.signal.aborted = true;
      });
      mockProvider.translate.mockImplementation(() => pending.promise);
      browser.tabs.sendMessage.mockClear();

      const execution = handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-abort-registration', mockSender);
      const result = await execution;

       expect(result).toMatchObject({
         success: false,
         error: {
           operationAborted: true,
           cancellationReason: 'operation-abort',
         }
       });
       expect(result.error.type).not.toBe(ErrorTypes.USER_CANCELLED);
       expect(result.error.isCancelled).not.toBe(true);
      expect(mockProvider.translate).not.toHaveBeenCalled();
      expect(mockEngine.lifecycleRegistry.unregisterRequest).toHaveBeenCalledWith('msg-abort-registration');
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();

      pending.resolve({ translatedText: ['late'] });
      await Promise.resolve();
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('should detach a non-cooperative parallel sibling after timeout', async () => {
      vi.useFakeTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      const sibling = createDeferred();
      const abortListeners = new Set();
      const browser = (await import('webextension-polyfill')).default;

      try {
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        mockAbortController.signal.addEventListener.mockImplementation((_type, listener) => {
          abortListeners.add(listener);
        });
        mockAbortController.signal.removeEventListener.mockImplementation((_type, listener) => {
          abortListeners.delete(listener);
        });
        mockAbortController.abort.mockImplementation(() => {
          mockAbortController.signal.aborted = true;
          for (const listener of abortListeners) listener();
        });
        mockProvider.translate
          .mockResolvedValueOnce({ translatedText: ['first'] })
          .mockImplementationOnce(() => sibling.promise);
        browser.tabs.sendMessage.mockClear();

        const execution = handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-parallel-timeout', mockSender);
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

        await vi.advanceTimersByTimeAsync(TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS);
        await expect(execution).rejects.toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });
        expect(mockEngine.lifecycleRegistry.unregisterRequest).toHaveBeenCalledWith('msg-parallel-timeout');
        expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(1);

        sibling.resolve({ translatedText: ['late sibling'] });
        await Promise.resolve();
        await Promise.resolve();

        const messages = browser.tabs.sendMessage.mock.calls.map(([, message]) => message);
        expect(messages).not.toContainEqual(expect.objectContaining({
          data: expect.objectContaining({ data: ['late sibling'] })
        }));
        expect(appendTranslationDiagnostic).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ type: 'STRUCTURED_BATCH_FAILURE', reason: 'late sibling' })
        );
      } finally {
        sibling.resolve({ translatedText: ['late sibling'] });
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        vi.useRealTimers();
      }
    });

    it('consumes a detached sibling rejection after timeout without a second terminal outcome', async () => {
      vi.useFakeTimers();
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      const sibling = createDeferred();
      const abortListeners = new Set();

      try {
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        mockAbortController.signal.addEventListener.mockImplementation((_type, listener) => {
          abortListeners.add(listener);
        });
        mockAbortController.signal.removeEventListener.mockImplementation((_type, listener) => {
          abortListeners.delete(listener);
        });
        mockAbortController.abort.mockImplementation(() => {
          mockAbortController.signal.aborted = true;
          for (const listener of abortListeners) listener();
        });
        mockProvider.translate
          .mockResolvedValueOnce({ translatedText: ['first'] })
          .mockImplementationOnce(() => sibling.promise);

        const execution = handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-parallel-reject', mockSender);
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

        await vi.advanceTimersByTimeAsync(TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS);
        await expect(execution).rejects.toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });
        const unregisterCalls = mockEngine.lifecycleRegistry.unregisterRequest.mock.calls.length;

        sibling.reject(new Error('late sibling failure'));
        await Promise.resolve();
        await Promise.resolve();

        expect(mockEngine.lifecycleRegistry.unregisterRequest).toHaveBeenCalledTimes(unregisterCalls);
        expect(appendTranslationDiagnostic).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ type: 'STRUCTURED_BATCH_FAILURE', reason: 'late sibling failure' })
        );
      } finally {
        sibling.resolve({ translatedText: ['late sibling'] });
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
        vi.useRealTimers();
      }
    });

    it('should emit one assembled V2 node after all fragments succeed', async () => {
      const browser = (await import('webextension-polyfill')).default;
      const fragments = [
        { t: 'Part one.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' },
        { t: 'Part two.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' }
      ];
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragments[0]], [fragments[1]]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['Translated one.'] })
        .mockResolvedValueOnce({ translatedText: ['Translated two.'] });
      browser.tabs.sendMessage.mockClear();

      const result = await handler.execute(
        mockEngine,
        { text: JSON.stringify(fragments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element' },
        mockProvider,
        'en',
        'fa',
        'fragment-success',
        mockSender
      );

      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, message]) => message)
        .filter(message => message.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(1);
      expect(updates[0].data.data).toEqual([{ t: 'Translated one. Translated two.', text: 'Translated one. Translated two.', i: 'n7' }]);
      expect(result.results).toEqual(updates[0].data.data);
    });

    it('should assemble out-of-order V2 fragments by fragment index', async () => {
      const browser = (await import('webextension-polyfill')).default;
      const first = createDeferred();
      const second = createDeferred();
      const fragments = [
        { t: 'Part one.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' },
        { t: 'Part two.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' }
      ];
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragments[0]], [fragments[1]]]);
      mockProvider.translate
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise);
      browser.tabs.sendMessage.mockClear();

      const execution = handler.execute(
        mockEngine,
        { text: JSON.stringify(fragments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element' },
        mockProvider,
        'en',
        'fa',
        'fragment-order',
        mockSender
      );
      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

      second.resolve({ translatedText: ['Translated two.'] });
      await Promise.resolve();
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();

      first.resolve({ translatedText: ['Translated one.'] });
      await execution;

      const update = browser.tabs.sendMessage.mock.calls
        .map(([, message]) => message)
        .find(message => message.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(update.data.data[0].t).toBe('Translated one. Translated two.');
    });

    it('should ignore duplicate fragments before and after parent emission', async () => {
      const browser = (await import('webextension-polyfill')).default;
      const fragments = [
        { t: 'Part one.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' },
        { t: 'Part two.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' }
      ];
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragments[0]], [fragments[0]], [fragments[1]], [fragments[0]]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['First accepted.'] })
        .mockResolvedValueOnce({ translatedText: ['Duplicate before completion.'] })
        .mockResolvedValueOnce({ translatedText: ['Second part.'] })
        .mockResolvedValueOnce({ translatedText: ['Duplicate after completion.'] });
      browser.tabs.sendMessage.mockClear();

      const result = await handler.execute(
        mockEngine,
        { text: JSON.stringify(fragments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element' },
        mockProvider,
        'en',
        'fa',
        'fragment-duplicate',
        mockSender
      );

      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, message]) => message)
        .filter(message => message.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(1);
      expect(updates[0].data.data[0].t).toBe('First accepted. Second part.');
      expect(result.results).toHaveLength(1);
    });

    it('should not emit a V2 node when one fragment fails', async () => {
      const browser = (await import('webextension-polyfill')).default;
      const fragments = [
        { t: 'Part one.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' },
        { t: 'Part two.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' }
      ];
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragments[0]], [fragments[1]]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['Translated one.'] })
        .mockRejectedValueOnce(Object.assign(new Error('fragment failed'), { type: 'TRANSLATION_FAILED' }));
      browser.tabs.sendMessage.mockClear();

      const result = await handler.execute(
        mockEngine,
        { text: JSON.stringify(fragments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element' },
        mockProvider,
        'en',
        'fa',
        'fragment-failure',
        mockSender
      );

      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, message]) => message)
        .filter(message => message.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(0);
      expect(result).toMatchObject({ success: false, results: [] });
    });

    it.each([0, 1, 2])('should suppress a three-fragment parent when fragment %i fails while independent nodes continue', async (failedIndex) => {
      const browser = (await import('webextension-polyfill')).default;
      const fragments = [0, 1, 2].map(fragmentIndex => ({
        t: `Part ${fragmentIndex}.`,
        i: 'n7',
        isV2Unit: true,
        isSplitFragment: true,
        parentId: 'n7',
        fragmentIndex,
        fragmentCount: 3,
        fragmentJoinerBefore: fragmentIndex === 0 ? '' : ' '
      }));
      const independent = { t: 'Independent.', i: 'n8', isV2Unit: true };
      mockEngine.createIntelligentBatches = vi.fn(() => [...fragments.map(fragment => [fragment]), [independent]]);
      mockProvider.translate.mockImplementation(([text]) => {
        if (text === `Part ${failedIndex}.`) {
          return Promise.reject(Object.assign(new Error('fragment failed'), { type: 'TRANSLATION_FAILED' }));
        }
        return Promise.resolve({ translatedText: [`Translated ${text}`] });
      });
      browser.tabs.sendMessage.mockClear();

      const result = await handler.execute(
        mockEngine,
        { text: JSON.stringify([...fragments, independent]), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element' },
        mockProvider,
        'en',
        'fa',
        `fragment-failure-${failedIndex}`,
        mockSender
      );

      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, message]) => message)
        .filter(message => message.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates).toHaveLength(1);
      expect(updates[0].data.data).toEqual([{ t: 'Translated Independent.', text: 'Translated Independent.', i: 'n8', isV2Unit: true }]);
      expect(result).toMatchObject({ success: false, results: updates[0].data.data });
    });

    it('should discard buffered fragments after timeout and ignore late settlement', async () => {
      vi.useFakeTimers();
      const browser = (await import('webextension-polyfill')).default;
      const pending = createDeferred();
      const fragments = [
        { t: 'Part one.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' },
        { t: 'Part two.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' }
      ];
      try {
        mockEngine.createIntelligentBatches = vi.fn(() => [[fragments[0]], [fragments[1]]]);
        mockProvider.translate
          .mockResolvedValueOnce({ translatedText: ['Translated one.'] })
          .mockImplementationOnce(() => pending.promise);
        browser.tabs.sendMessage.mockClear();

        const execution = handler.execute(
          mockEngine,
          { text: JSON.stringify(fragments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element' },
          mockProvider,
          'en',
          'fa',
          'fragment-timeout',
          mockSender
        );
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));
        await vi.advanceTimersByTimeAsync(300000);

        await expect(execution).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });
        expect(browser.tabs.sendMessage).not.toHaveBeenCalled();

        pending.resolve({ translatedText: ['Translated two.'] });
        await Promise.resolve();
        expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
      } finally {
        pending.resolve({ translatedText: ['Translated two.'] });
        vi.useRealTimers();
      }
    });

    it('should ignore a late fragment failure after timeout without retrying', async () => {
      vi.useFakeTimers();
      const pending = createDeferred();
      const fragments = [
        { t: 'Part one.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' },
        { t: 'Part two.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' }
      ];
      try {
        mockEngine.createIntelligentBatches = vi.fn(() => [[fragments[0]], [fragments[1]]]);
        mockProvider.translate
          .mockResolvedValueOnce({ translatedText: ['Translated one.'] })
          .mockImplementationOnce(() => pending.promise);

        const execution = handler.execute(
          mockEngine,
          { text: JSON.stringify(fragments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element' },
          mockProvider,
          'en',
          'fa',
          'fragment-late-failure',
          mockSender
        );
        execution.catch(() => {});
        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));
        await vi.advanceTimersByTimeAsync(300000);
        await expect(execution).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });

        pending.reject(new Error('late provider failure'));
        await Promise.resolve();
        expect(mockProvider.translate).toHaveBeenCalledTimes(2);
      } finally {
        pending.resolve({ translatedText: ['ignored'] });
        vi.useRealTimers();
      }
    });

    it('should discard buffered fragments after cancellation and ignore late success', async () => {
      const browser = (await import('webextension-polyfill')).default;
      const pending = createDeferred();
      const fragments = [
        { t: 'Part one.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' },
        { t: 'Part two.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' }
      ];
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragments[0]], [fragments[1]]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['Translated one.'] })
        .mockImplementationOnce(() => pending.promise);
      browser.tabs.sendMessage.mockClear();

      const execution = handler.execute(
        mockEngine,
        { text: JSON.stringify(fragments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element' },
        mockProvider,
        'en',
        'fa',
        'fragment-cancel',
        mockSender
      );
      await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

       mockAbortController.abort('user-cancelled');
      pending.resolve({ translatedText: ['Translated two.'] });

      await expect(execution).resolves.toMatchObject({ success: false, error: { type: 'USER_CANCELLED' } });
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('should isolate same parent IDs across separate requests', async () => {
      const browser = (await import('webextension-polyfill')).default;
      const fragments = [
        { t: 'Part one.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 0, fragmentCount: 2, fragmentJoinerBefore: '' },
        { t: 'Part two.', i: 'n7', isV2Unit: true, isSplitFragment: true, parentId: 'n7', fragmentIndex: 1, fragmentCount: 2, fragmentJoinerBefore: ' ' }
      ];
      mockEngine.createIntelligentBatches = vi.fn(() => [[fragments[0]], [fragments[1]]]);
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['Request one.'] })
        .mockResolvedValueOnce({ translatedText: ['Complete.'] })
        .mockResolvedValueOnce({ translatedText: ['Request two.'] })
        .mockResolvedValueOnce({ translatedText: ['Complete.'] });
      browser.tabs.sendMessage.mockClear();

      await handler.execute(mockEngine, { text: JSON.stringify(fragments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element' }, mockProvider, 'en', 'fa', 'fragment-isolation-one', mockSender);
      await handler.execute(mockEngine, { text: JSON.stringify(fragments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element' }, mockProvider, 'en', 'fa', 'fragment-isolation-two', mockSender);

      const updates = browser.tabs.sendMessage.mock.calls
        .map(([, message]) => message)
        .filter(message => message.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      expect(updates.map(update => update.data.data[0].t)).toEqual(['Request one. Complete.', 'Request two. Complete.']);
    });

    it('should abort execution and bubble validation error on count mismatch', async () => {
      mockProvider.translate.mockResolvedValueOnce({
        translatedText: []
      });

      const result = await handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-1', mockSender);

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Segment count mismatch');
      expect(mockAbortController.abort).toHaveBeenCalled();
    });

    it('should respect select_element overrides from provider configurations', async () => {
      getProviderConfiguration.mockReturnValueOnce({
        batching: {
          optimalSize: 10,
          characterLimit: 2000,
          modeOverrides: {
            select_element: {
              optimalSize: 15,
              characterLimit: 1200
            }
          }
        },
        rateLimit: { maxConcurrent: 2 }
      });

      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['t1'] })
        .mockResolvedValueOnce({ translatedText: ['t2'] });

      await handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-1', mockSender);

      expect(mockEngine.createIntelligentBatches).toHaveBeenCalledWith(
        expect.any(Array),
        15, // override.optimalSize
        1200 // override.characterLimit
      );
    });

    it('should forward original source language metadata to provider translate calls', async () => {
      mockEngine.createIntelligentBatches = vi.fn((segments) => [segments]);

      mockProvider.translate.mockResolvedValueOnce({
        translatedText: ['t1', 't2'],
        detectedLanguage: 'fa'
      });

      await handler.execute(mockEngine, mockData, mockProvider, 'de', 'fa', 'msg-1', mockSender);

      expect(mockProvider.translate).toHaveBeenCalledTimes(1);
      expect(mockProvider.translate).toHaveBeenCalledWith(
        expect.any(Array),
        'auto',
        'fa',
        expect.objectContaining({
          originalSourceLang: 'de',
          originalTargetLang: 'fa'
        })
      );
    });

    it('should correctly batch for Level 5 (Turbo) in an end-to-end flow with the pinned Select Element mode override', async () => {
      mockEngine.createIntelligentBatches = (segments, size, chars) => TranslationBatcher.createIntelligentBatches(segments, size, chars);

      // Mock a realistic AI provider config at Level 5 (Turbo).
      // The Select Element mode override is pinned (optimalSize 25, characterLimit 3500)
      // and must not be scaled by optimization level.
      getProviderConfiguration.mockReturnValueOnce({
        batching: {
          optimalSize: 6, // scaled base (non-Select Element modes)
          characterLimit: 5000,
          modeOverrides: {
            select_element: {
              optimalSize: 25, // pinned override — never scaled
              characterLimit: 3500 // pinned override — never scaled
            }
          }
        },
        rateLimit: { maxConcurrent: 2 }
      });

      // Prepare 60 segments (each ~24 chars) so the pinned optimalSize of 25 yields 3 batches
      const testSegments = Array.from({ length: 60 }, (_, index) => ({
        t: `Segment ${index} text content.`,
        i: `uid-${index}`
      }));

      const customMockData = {
        ...mockData,
        text: JSON.stringify(testSegments)
      };

      // Mock translate responses for the expected number of batches (60 segments / 25 size = 3 batches)
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: testSegments.slice(0, 25).map(s => s.t) })
        .mockResolvedValueOnce({ translatedText: testSegments.slice(25, 50).map(s => s.t) })
        .mockResolvedValueOnce({ translatedText: testSegments.slice(50, 60).map(s => s.t) });

      const result = await handler.execute(mockEngine, customMockData, mockProvider, 'en', 'fa', 'msg-1', mockSender);

      expect(result.success).toBe(true);
      expect(mockProvider.translate).toHaveBeenCalledTimes(3); // 3 batches (25, 25, 10)
    });

    it('should correctly batch for Level 1 (Economy) in an end-to-end flow with the pinned Select Element mode override', async () => {
      mockEngine.createIntelligentBatches = (segments, size, chars) => TranslationBatcher.createIntelligentBatches(segments, size, chars);

      // Mock a realistic AI provider config at Level 1 (Economy).
      // The Select Element mode override is pinned (optimalSize 25, characterLimit 3500)
      // and must not be scaled by optimization level.
      getProviderConfiguration.mockReturnValueOnce({
        batching: {
          optimalSize: 50, // scaled base (non-Select Element modes)
          characterLimit: 5000,
          modeOverrides: {
            select_element: {
              optimalSize: 25, // pinned override — never scaled
              characterLimit: 3500 // pinned override — never scaled
            }
          }
        },
        rateLimit: { maxConcurrent: 1 }
      });

      // Prepare 20 segments
      const testSegments = Array.from({ length: 20 }, (_, index) => ({
        t: `Segment ${index} text content.`,
        i: `uid-${index}`
      }));

      const customMockData = {
        ...mockData,
        text: JSON.stringify(testSegments)
      };

      // Mock translate response for 1 batch (20 segments < 25 pinned optimalSize)
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: testSegments.map(s => s.t) });

      const result = await handler.execute(mockEngine, customMockData, mockProvider, 'en', 'fa', 'msg-1', mockSender);

      expect(result.success).toBe(true);
      expect(mockProvider.translate).toHaveBeenCalledTimes(1); // 1 single batch
    });

    it('should skip tab streaming for PDF mode and return results directly', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      mockEngine.createIntelligentBatches = vi.fn((segments) => [segments]);

      const pdfData = {
        text: JSON.stringify([{ t: 'Hello', blockId: 'b1' }, { t: 'World', blockId: 'b2' }]),
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        mode: 'pdf-translation',
        messageId: 'pdf-msg-1',
        sessionId: 'pdf-sess-1'
      };

      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['سلام', 'دنیا'] });

      const result = await handler.execute(mockEngine, pdfData, mockProvider, 'en', 'fa', 'pdf-msg-1', mockSender);

      expect(result.success).toBe(true);
      expect(result.results).toBeDefined();
      expect(result.results).toHaveLength(2);
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('should still stream for Select Element mode', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['t1'] })
        .mockResolvedValueOnce({ translatedText: ['t2'] });

      await handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-1', mockSender);

      expect(browser.tabs.sendMessage).toHaveBeenCalled();
    });

    describe('V3 BlockGroup fragment aggregation', () => {
      const makeV3Fragments = (blockId, unitId, texts, joiners) => texts.map((t, i) => ({
        t,
        blockId,
        i: unitId,
        role: 'paragraph',
        isV3Fragment: true,
        parentId: blockId,
        fragmentIndex: i,
        fragmentCount: texts.length,
        fragmentJoinerBefore: joiners[i] ?? '',
      }));

      it('reassembles in-order V3 fragments into one logical unit', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const fragments = makeV3Fragments('g1', 'n1', ['Translated one.', 'Translated two.'], ['', ' ']);
        mockEngine.createIntelligentBatches = vi.fn(() => [fragments]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Translated one.', 'Translated two.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, text: JSON.stringify([{ t: 'Hello world.', blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'auto', 'fa', 'msg-v3-inorder', mockSender
        );

        expect(result.success).toBe(true);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(1);
         expect(updates[0].data.data).toEqual([{ t: 'Translated one. Translated two.', text: 'Translated one. Translated two.', blockId: 'g1', i: 'n1', role: 'paragraph' }]);
      });

      it('reassembles V3 fragments by fragmentIndex regardless of batch completion order', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const fragments = makeV3Fragments('g1', 'n1', ['Translated one.', 'Translated two.'], ['', ' ']);
        const fragment0 = fragments[0];
        const fragment1 = fragments[1];
        const deferred0 = createDeferred();
        const deferred1 = createDeferred();

        // Batch 0 contains fragment1 (index 1), batch 1 contains fragment0 (index 0)
        // Completion order: batch 1 (fragment0) first, then batch 0 (fragment1)
        mockEngine.createIntelligentBatches = vi.fn(() => [[fragment1], [fragment0]]);
        mockProvider.translate
          .mockImplementationOnce(() => deferred1.promise) // batch 0 → fragment1
          .mockImplementationOnce(() => deferred0.promise); // batch 1 → fragment0

        const execution = handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'Hello world.', blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'en', 'fa', 'msg-v3-outoforder', mockSender
        );

        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

        // Resolve the batch containing fragment0 (index 0) first
        deferred0.resolve({ translatedText: ['Translated one.'] });
        await Promise.resolve();

        // Parent incomplete — no stream update yet
        let updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(0);

        // Now resolve the batch containing fragment1 (index 1)
        deferred1.resolve({ translatedText: ['Translated two.'] });
        await execution;

        // Parent fully assembled — one stream update with correct order
        updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(1);
        expect(updates[0].data.data[0].t).toBe('Translated one. Translated two.');
      });

      it('reassembles three or more V3 fragments correctly', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const fragments = makeV3Fragments('g1', 'n1', ['Alpha.', 'Beta.', 'Gamma.'], ['', ' ', ' ']);
        mockEngine.createIntelligentBatches = vi.fn(() => [fragments]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Alpha.', 'Beta.', 'Gamma.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, text: JSON.stringify([{ t: 'Hello world here.', blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'auto', 'fa', 'msg-v3-three', mockSender
        );

        expect(result.success).toBe(true);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates[0].data.data[0].t).toBe('Alpha. Beta. Gamma.');
      });

      it('preserves boundary whitespace between V3 fragments', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const fragments = makeV3Fragments('g1', 'n1', ['Line one.', 'Line two.'], ['', '\n']);
        mockEngine.createIntelligentBatches = vi.fn(() => [fragments]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Line one.', 'Line two.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, text: JSON.stringify([{ t: 'First line.\nSecond line.', blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'auto', 'fa', 'msg-v3-ws', mockSender
        );

        expect(result.success).toBe(true);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates[0].data.data[0].t).toBe('Line one.\nLine two.');
      });

      it('preserves marker text byte-for-byte after V3 reassembly', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const marker = '@@TI_SEG_s1_e1_n1@@';
        const fragments = makeV3Fragments('g1', 'n1', [`${marker}Hello`, 'World'], ['', ' ']);
        mockEngine.createIntelligentBatches = vi.fn(() => [fragments]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: [`${marker}Hello`, 'World'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, text: JSON.stringify([{ t: `Hello${marker}World`, blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'auto', 'fa', 'msg-v3-marker', mockSender
        );

        expect(result.success).toBe(true);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates[0].data.data[0].t).toBe(`${marker}Hello World`);
      });

      it('preserves parent blockId identity in assembled V3 result', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const fragments = makeV3Fragments('g1', 'n1', ['Translated one.', 'Translated two.'], ['', ' ']);
        mockEngine.createIntelligentBatches = vi.fn(() => [fragments]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Translated one.', 'Translated two.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, text: JSON.stringify([{ t: 'Hello world.', blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'auto', 'fa', 'msg-v3-identity', mockSender
        );

        expect(result.success).toBe(true);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates[0].data.data[0].i).toBe('n1');
        expect(updates[0].data.data[0].blockId).toBe('g1');
      });

      it('never includes raw V3 fragments in final results', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const fragments = makeV3Fragments('g1', 'n1', ['Translated one.', 'Translated two.'], ['', ' ']);
        mockEngine.createIntelligentBatches = vi.fn(() => [fragments]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Translated one.', 'Translated two.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, text: JSON.stringify([{ t: 'Hello world.', blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'auto', 'fa', 'msg-v3-no-raw', mockSender
        );

        expect(result.success).toBe(true);
        expect(result.results).toBeDefined();
        result.results.forEach((item) => {
          expect(item.isV3Fragment).toBeUndefined();
          expect(item.fragmentIndex).toBeUndefined();
          expect(item.fragmentCount).toBeUndefined();
          expect(item.fragmentJoinerBefore).toBeUndefined();
          expect(item.isSplit).toBeUndefined();
          expect(item.partIndex).toBeUndefined();
          expect(item.__sourceT).toBeUndefined();
        });
      });

      describe('failure matrix (first/middle/last)', () => {
        it('suppresses V3 parent when first fragment fails', async () => {
          const browser = (await import('webextension-polyfill')).default;

          const fragments = makeV3Fragments('g1', 'n1', ['A.', 'B.', 'C.'], ['', ' ', ' ']);
          const d0 = createDeferred();
          const d1 = createDeferred();
          const d2 = createDeferred();

          mockEngine.createIntelligentBatches = vi.fn(() => [[fragments[0]], [fragments[1]], [fragments[2]]]);
          mockProvider.translate
            .mockImplementationOnce(() => d0.promise)
            .mockImplementationOnce(() => d1.promise)
            .mockImplementationOnce(() => d2.promise);

          const execution = handler.execute(
            mockEngine,
            { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'A B C.', blockId: 'g1', i: 'n1' }]) },
            mockProvider, 'en', 'fa', 'msg-v3-fail-first', mockSender
          );

          await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(3));

          d0.reject(Object.assign(new Error('first failed'), { type: 'TRANSLATION_FAILED' }));
          d1.resolve({ translatedText: ['B.'] });
          d2.resolve({ translatedText: ['C.'] });

          const result = await execution;

          expect(result.success).toBe(false);
          const updates = browser.tabs.sendMessage.mock.calls
            .map(([, m]) => m)
            .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
          expect(updates).toHaveLength(0);
        });

        it('suppresses V3 parent when middle fragment fails', async () => {
          const browser = (await import('webextension-polyfill')).default;

          const fragments = makeV3Fragments('g1', 'n1', ['A.', 'B.', 'C.'], ['', ' ', ' ']);
          const d0 = createDeferred();
          const d1 = createDeferred();
          const d2 = createDeferred();

          mockEngine.createIntelligentBatches = vi.fn(() => [[fragments[0]], [fragments[1]], [fragments[2]]]);
          mockProvider.translate
            .mockImplementationOnce(() => d0.promise)
            .mockImplementationOnce(() => d1.promise)
            .mockImplementationOnce(() => d2.promise);

          const execution = handler.execute(
            mockEngine,
            { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'A B C.', blockId: 'g1', i: 'n1' }]) },
            mockProvider, 'en', 'fa', 'msg-v3-fail-middle', mockSender
          );

          await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(3));

          d0.resolve({ translatedText: ['A.'] });
          d1.reject(Object.assign(new Error('middle failed'), { type: 'TRANSLATION_FAILED' }));
          d2.resolve({ translatedText: ['C.'] });

          const result = await execution;

          expect(result.success).toBe(false);
          const updates = browser.tabs.sendMessage.mock.calls
            .map(([, m]) => m)
            .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
          expect(updates).toHaveLength(0);
        });

        it('suppresses V3 parent when last fragment fails', async () => {
          const browser = (await import('webextension-polyfill')).default;

          const fragments = makeV3Fragments('g1', 'n1', ['A.', 'B.', 'C.'], ['', ' ', ' ']);
          const d0 = createDeferred();
          const d1 = createDeferred();
          const d2 = createDeferred();

          mockEngine.createIntelligentBatches = vi.fn(() => [[fragments[0]], [fragments[1]], [fragments[2]]]);
          mockProvider.translate
            .mockImplementationOnce(() => d0.promise)
            .mockImplementationOnce(() => d1.promise)
            .mockImplementationOnce(() => d2.promise);

          const execution = handler.execute(
            mockEngine,
            { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'A B C.', blockId: 'g1', i: 'n1' }]) },
            mockProvider, 'en', 'fa', 'msg-v3-fail-last', mockSender
          );

          await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(3));

          d0.resolve({ translatedText: ['A.'] });
          d1.resolve({ translatedText: ['B.'] });
          d2.reject(Object.assign(new Error('last failed'), { type: 'TRANSLATION_FAILED' }));

          const result = await execution;

          expect(result.success).toBe(false);
          const updates = browser.tabs.sendMessage.mock.calls
            .map(([, m]) => m)
            .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
          expect(updates).toHaveLength(0);
        });
      });

      it('keeps independent units flowing when V3 parent fails', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const normalA = { t: 'Hello.', i: 'na' };
        const fragments = makeV3Fragments('g1', 'n1', ['World.', '!'], ['', ' ']);
        const normalC = { t: 'Done.', i: 'nc' };
        mockEngine.createIntelligentBatches = vi.fn(() => [[normalA], fragments, [normalC]]);
        mockProvider.translate
          .mockResolvedValueOnce({ translatedText: ['Hola.'] })
          .mockRejectedValueOnce(Object.assign(new Error('V3 failed'), { type: 'TRANSLATION_FAILED' }))
          .mockResolvedValueOnce({ translatedText: ['Listo.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, text: JSON.stringify([normalA, { t: 'Hello world!', blockId: 'g1', i: 'n1' }, normalC]) },
          mockProvider, 'auto', 'fa', 'msg-v3-mixed', mockSender
        );

        expect(result.success).toBe(false);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(2);
        expect(updates[0].data.data[0].t).toBe('Hola.');
        expect(updates[1].data.data[0].t).toBe('Listo.');
      });

      it('keeps first value on duplicate V3 fragment index before completion', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const fragment0 = makeV3Fragments('g1', 'n1', ['A.', 'B.'], ['', ' '])[0];
        const fragment1 = makeV3Fragments('g1', 'n1', ['A.', 'B.'], ['', ' '])[1];
        const duplicate0 = { ...fragment0, t: 'DUPLICATE.' };

        const d0 = createDeferred();
        const d1 = createDeferred();
        const d2 = createDeferred();

        mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [duplicate0], [fragment1]]);
        mockProvider.translate
          .mockImplementationOnce(() => d0.promise)
          .mockImplementationOnce(() => d1.promise)
          .mockImplementationOnce(() => d2.promise);

        const execution = handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'A B.', blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'en', 'fa', 'msg-v3-dup', mockSender
        );

        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(3));

        // fragment0 succeeds first
        d0.resolve({ translatedText: ['A.'] });
        await Promise.resolve();

        // duplicate fragment0 arrives — first value must survive
        d1.resolve({ translatedText: ['DUPLICATE.'] });
        await Promise.resolve();

        // fragment1 succeeds — parent should now complete
        d2.resolve({ translatedText: ['B.'] });
        const result = await execution;

        expect(result.success).toBe(true);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(1);
        expect(updates[0].data.data[0].t).toBe('A. B.');
      });

      it('does not emit V3 parent twice on duplicate after completion', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const fragments = makeV3Fragments('g1', 'n1', ['A.', 'B.'], ['', ' ']);
        const fragment0 = fragments[0];
        const fragment1 = fragments[1];
        const duplicate0 = { ...fragment0, t: 'Duplicate.' };

        const d0 = createDeferred();
        const d1 = createDeferred();
        const d2 = createDeferred();

        mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [fragment1], [duplicate0]]);
        mockProvider.translate
          .mockImplementationOnce(() => d0.promise)
          .mockImplementationOnce(() => d1.promise)
          .mockImplementationOnce(() => d2.promise);

        const execution = handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'A B.', blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'en', 'fa', 'msg-v3-late-dup', mockSender
        );

        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(3));

        // Fragments 0 and 1 succeed — parent should complete and emit
        d0.resolve({ translatedText: ['A.'] });
        d1.resolve({ translatedText: ['B.'] });

        // Wait for parent to complete and stream update emitted
        await vi.waitFor(() => {
          const updates = browser.tabs.sendMessage.mock.calls
            .map(([, m]) => m)
            .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
          expect(updates).toHaveLength(1);
        });

        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates[0].data.data[0].t).toBe('A. B.');

        // Late duplicate fragment — should be ignored
        d2.resolve({ translatedText: ['Duplicate.'] });
        await execution;

        const updatesAfter = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updatesAfter).toHaveLength(1);
      });

      it('ignores late V3 success after parent failure', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const fragment0 = makeV3Fragments('g1', 'n1', ['A.', 'B.'], ['', ' '])[0];
        const late0 = { ...fragment0, t: 'Late.' };

        const d0 = createDeferred();
        const d1 = createDeferred();

        mockEngine.createIntelligentBatches = vi.fn(() => [[fragment0], [late0]]);
        mockProvider.translate
          .mockImplementationOnce(() => d0.promise)
          .mockImplementationOnce(() => d1.promise);

        const execution = handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ t: 'A B.', blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'en', 'fa', 'msg-v3-late-fail', mockSender
        );

        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(2));

        d0.reject(Object.assign(new Error('failed'), { type: 'TRANSLATION_FAILED' }));
        d1.resolve({ translatedText: ['Late B.'] });
        const result = await execution;

        expect(result.success).toBe(false);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(0);
      });

      it('request-local isolation for reused parent ID across execute() calls', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        // First request: g1 with 2 fragments → success
        const fragments1 = makeV3Fragments('g1', 'n1', ['A.', 'B.'], ['', ' ']);
        mockEngine.createIntelligentBatches = vi.fn(() => [fragments1]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['A.', 'B.'] });

        const result1 = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', messageId: 'req-1', text: JSON.stringify([{ t: 'A B.', blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'en', 'fa', 'req-1', mockSender
        );

        // Second request: g1 (reused id) with 3 fragments → success
        const fragments2 = makeV3Fragments('g1', 'n1', ['C.', 'D.', 'E.'], ['', ' ', ' ']);
        mockEngine.createIntelligentBatches = vi.fn(() => [fragments2]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['C.', 'D.', 'E.'] });

        const result2 = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', messageId: 'req-2', text: JSON.stringify([{ t: 'C D E.', blockId: 'g1', i: 'n1' }]) },
          mockProvider, 'en', 'fa', 'req-2', mockSender
        );

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);

        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(2);
        expect(updates[0].data.data[0].t).toBe('A. B.');
        expect(updates[1].data.data[0].t).toBe('C. D. E.');
      });

      it('stream integration: complete + V3 fragmented + complete emits assembled result', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const normalA = { t: 'Hello.', i: 'na' };
        const v3Fragments = makeV3Fragments('g1', 'n1', ['World.', '!'], ['', ' ']);
        const normalC = { t: 'Done.', i: 'nc' };
        mockEngine.createIntelligentBatches = vi.fn(() => [[normalA], v3Fragments, [normalC]]);
        mockProvider.translate
          .mockResolvedValueOnce({ translatedText: ['Hola.'] })
          .mockResolvedValueOnce({ translatedText: ['Mundo.', '!'] })
          .mockResolvedValueOnce({ translatedText: ['Listo.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, text: JSON.stringify([normalA, { t: 'Hello world!', blockId: 'g1', i: 'n1' }, normalC]) },
          mockProvider, 'auto', 'fa', 'msg-v3-stream', mockSender
        );

        expect(result.success).toBe(true);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(3);
        expect(updates[0].data.data[0].t).toBe('Hola.');
        expect(updates[1].data.data[0].t).toBe('Mundo. !');
        expect(updates[2].data.data[0].t).toBe('Listo.');
      });

      it('stream integration: V3 fragment failure leaves independent units translated', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const normalA = { t: 'Hello.', i: 'na' };
        const v3Fragments = makeV3Fragments('g1', 'n1', ['World.', '!'], ['', ' ']);
        const normalC = { t: 'Done.', i: 'nc' };
        mockEngine.createIntelligentBatches = vi.fn(() => [[normalA], v3Fragments, [normalC]]);
        mockProvider.translate
          .mockResolvedValueOnce({ translatedText: ['Hola.'] })
          .mockRejectedValueOnce(Object.assign(new Error('V3 fragment failed'), { type: 'TRANSLATION_FAILED' }))
          .mockResolvedValueOnce({ translatedText: ['Listo.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, text: JSON.stringify([normalA, { t: 'Hello world!', blockId: 'g1', i: 'n1' }, normalC]) },
          mockProvider, 'auto', 'fa', 'msg-v3-stream-fail', mockSender
        );

        expect(result.success).toBe(false);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(2);
        expect(updates[0].data.data[0].t).toBe('Hola.');
        expect(updates[1].data.data[0].t).toBe('Listo.');
      });
    });

    describe('abbreviated Select Element payload (b key) fragmentation', () => {
      const mockSender = { tab: { id: 123 } };
      const M = (n) => `@@TI_SEG_e1_a1_n${n}@@`;
      const SOURCE = `Alpha beta gamma delta${M(2)}Epsilon zeta eta theta${M(3)}Iota kappa lambda mu${M(4)}Nu xi omicron pi`;
      const toTranslated = (src) => src
        .split(/(@@TI_SEG_[a-z0-9_]+@@)/g)
        .map((part) => (part.startsWith('@@TI_SEG_') ? part : part.replace(/[a-zA-Z]+/g, 'x')))
        .join('');
      const streamUpdates = async () => {
        const browser = (await import('webextension-polyfill')).default;
        return browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      };

      it('real batcher tags abbreviated-payload fragments as V3 (regression path sanity)', () => {
        const batches = TranslationBatcher.createIntelligentBatches(
          [{ t: SOURCE, i: 'g1', b: 'g1', r: 'content' }],
          2,
          50
        );

        expect(batches.length).toBe(3);
        batches.forEach((batch) => {
          expect(batch).toHaveLength(1);
          const part = batch[0];
          expect(part.isV3Fragment).toBe(true);
          expect(part.parentId).toBe('g1');
          expect(part.isSplit).toBe(true);
        });
        const indexes = batches.map(([part]) => part.fragmentIndex);
        expect(indexes).toEqual([0, 1, 2]);
        batches.forEach(([part]) => expect(part.fragmentCount).toBe(3));
      });

      it('buffers abbreviated V3 fragments and emits the assembled parent once (auto bypass, out-of-order)', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        // Real Select Element payload: abbreviated i/b/r keys, no full blockId.
        const payload = [{ t: SOURCE, i: 'g1', b: 'g1', r: 'content' }];
        mockEngine.createIntelligentBatches = vi.fn(() => TranslationBatcher.createIntelligentBatches(payload, 2, 50));

        const calls = [];
        mockProvider.translate.mockImplementation((texts) => {
          const deferred = createDeferred();
          calls.push({ texts, resolve: deferred.resolve });
          return deferred.promise;
        });
        resolveOperationSourceLanguage.mockResolvedValueOnce({
          canBypassSequentialGate: true,
          bypassReason: 'HIGH_CONFIDENCE_STATISTICAL',
          effectiveSourceLanguage: 'en',
          effectiveTargetLanguage: 'fa',
          detection: { confidence: 'high', provenance: 'statistical' },
        });

        const execution = handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'auto', text: JSON.stringify(payload) },
          mockProvider, 'auto', 'fa', 'msg-abbrev-v3', mockSender
        );

        // High-confidence operation resolution starts all fragments together.
        await vi.waitFor(() => expect(calls.length).toBe(3));
        expect(calls[0].texts).toEqual([expect.stringContaining(M(2))]);

        let updates = await streamUpdates();
        expect(updates).toHaveLength(0);

        // Out-of-order completion: fragment 2 and fragment 0 resolve first.
        calls[2].resolve({ translatedText: [toTranslated(calls[2].texts[0])] });
        calls[0].resolve({ translatedText: [toTranslated(calls[0].texts[0])] });
        await Promise.resolve();
        updates = await streamUpdates();
        expect(updates).toHaveLength(0);

        calls[1].resolve({ translatedText: [toTranslated(calls[1].texts[0])] });
        const result = await execution;

        expect(result.success).toBe(true);
        updates = await streamUpdates();
        expect(updates).toHaveLength(1);

        const parent = updates[0].data.data[0];
        expect(updates[0].data.data).toHaveLength(1);
        expect(parent.i).toBe('g1');
        expect(parent.isV3Fragment).toBeUndefined();
        expect(parent.fragmentIndex).toBeUndefined();
        expect(parent.fragmentCount).toBeUndefined();
        expect(parent.parentId).toBeUndefined();

        // Complete parent: all markers present once, in order, plus all three chunks.
        expect(parent.t.match(/@@TI_SEG_\w+@@/g)).toEqual([M(2), M(3), M(4)]);
        expect(parent.t).toBe(calls.map((call) => toTranslated(call.texts[0])).join(' '));

        // Exactly one accepted logical parent; raw fragments never surface.
        expect(result.results).toHaveLength(1);
        expect(result.results[0]).toMatchObject({ i: 'g1', t: parent.t });
      });
    });

    describe('non-fragment duplicate identity', () => {
      const mockSender = { tab: { id: 123 } };

      it('same-batch duplicate uid fails with typed error (not USER_CANCELLED)', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const payload = [{ i: 'n1', t: 'A.' }, { i: 'n1', t: 'B.' }];
        mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['TA.', 'TB.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
          mockProvider, 'en', 'fa', 'msg-dup-same-batch', mockSender
        );

        expect(result.success).toBe(false);
        expect(result.error.type).toBe(ErrorTypes.VALIDATION);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(0);
      });

      it('same-batch duplicate uid with different text still fails (typed error)', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const payload = [{ i: 'n1', t: 'A.' }, { i: 'n1', t: 'C.' }];
        mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['TA.', 'TC.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
          mockProvider, 'en', 'fa', 'msg-dup-different-text', mockSender
        );

        expect(result.success).toBe(false);
        expect(result.error.type).toBe(ErrorTypes.VALIDATION);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(0);
      });

      it('same-batch duplicate numeric ID 0 fails (typed error)', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const payload = [{ i: 0, t: 'A.' }, { i: 0, t: 'B.' }];
        mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['TA.', 'TB.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
          mockProvider, 'en', 'fa', 'msg-dup-numeric-zero', mockSender
        );

        expect(result.success).toBe(false);
        expect(result.error.type).toBe(ErrorTypes.VALIDATION);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(0);
      });

      it('different IDs both stream and return successfully', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const payload = [{ i: 'n1', t: 'A.' }, { i: 'n2', t: 'B.' }];
        mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['TA.', 'TB.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
          mockProvider, 'en', 'fa', 'msg-diff-ids', mockSender
        );

        expect(result.success).toBe(true);
        expect(result.results).toHaveLength(2);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(1);
        expect(updates[0].data.data).toHaveLength(2);
      });

      it('cross-batch duplicate suppresses second and final results contain one item', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        mockEngine.createIntelligentBatches = vi.fn(() => [[{ i: 'n1', t: 'A.' }], [{ i: 'n1', t: 'A.' }]]);
        mockProvider.translate
          .mockResolvedValueOnce({ translatedText: ['TA.'] })
          .mockResolvedValueOnce({ translatedText: ['TA2.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ i: 'n1', t: 'A.' }, { i: 'n1', t: 'A.' }]) },
          mockProvider, 'en', 'fa', 'msg-cross-batch-dup', mockSender
        );

        expect(result.success).toBe(true);
        expect(result.results).toHaveLength(1);
        expect(result.results[0].t).toBe('TA.');
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(1);
        expect(updates[0].data.data).toHaveLength(1);
      });

      it('cross-batch duplicate with different text: first-wins', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        mockEngine.createIntelligentBatches = vi.fn(() => [[{ i: 'n1', t: 'A.' }], [{ i: 'n1', t: 'A.' }]]);
        mockProvider.translate
          .mockResolvedValueOnce({ translatedText: ['First.'] })
          .mockResolvedValueOnce({ translatedText: ['Second.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ i: 'n1', t: 'A.' }, { i: 'n1', t: 'A.' }]) },
          mockProvider, 'en', 'fa', 'msg-cross-batch-text', mockSender
        );

        expect(result.success).toBe(true);
        expect(result.results).toHaveLength(1);
        expect(result.results[0].t).toBe('First.');
      });

      it('same identity in separate execute() calls: both requests succeed independently', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        mockEngine.createIntelligentBatches = vi.fn(() => [[{ i: 'n1', t: 'A.' }]]);
        mockProvider.translate.mockResolvedValue({ translatedText: ['TA.'] });

        const payload = [{ i: 'n1', t: 'A.' }];

        const result1 = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
          mockProvider, 'en', 'fa', 'msg-indep-1', mockSender
        );

        const result2 = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
          mockProvider, 'en', 'fa', 'msg-indep-2', mockSender
        );

        expect(result1.success).toBe(true);
        expect(result1.results[0].t).toBe('TA.');
        expect(result2.success).toBe(true);
        expect(result2.results[0].t).toBe('TA.');
      });

      it('V3 parent identity and plain item identity do not collide (separate namespaces)', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const v3Fragment = { i: 'n1', t: 'A.', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 1, fragmentJoinerBefore: '' };
        const plainItem = { i: 'n1', t: 'B.' };
        mockEngine.createIntelligentBatches = vi.fn(() => [[plainItem], [v3Fragment]]);
        mockProvider.translate
          .mockResolvedValueOnce({ translatedText: ['TB.'] })
          .mockResolvedValueOnce({ translatedText: ['TA.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify(plainItem) },
          mockProvider, 'en', 'fa', 'msg-collision', mockSender
        );

        expect(result.success).toBe(true);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(2);
        expect(updates[0].data.data[0].t).toBe('TB.');
        expect(updates[1].data.data[0].t).toBe('TA.');
        expect(updates[0].data.data[0].i).toBe('n1');
        expect(updates[1].data.data[0].i).toBe('n1');
      });

      it('preserves separate generic identities when direct items share blockId', async () => {
        const first = { i: 'n1', blockId: 'b1', t: 'First.' };
        const second = { i: 'n2', blockId: 'b1', t: 'Second.' };
        mockEngine.createIntelligentBatches = vi.fn(() => [[first, second]]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Translated first.', 'Translated second.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify([first, second]) },
          mockProvider, 'en', 'fa', 'msg-shared-generic-block', mockSender
        );

        expect(result.success).toBe(true);
        expect(result.results.map(({ i, blockId }) => ({ i, blockId }))).toEqual([
          { i: 'n1', blockId: 'b1' },
          { i: 'n2', blockId: 'b1' },
        ]);
      });

      it('cross-batch duplicate: onTerminalUnitsAccepted only called for first occurrence', async () => {
        const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);

        const segments = [{ i: 'same', t: 'A.' }, { i: 'same', t: 'B.' }];
        const manifest = createRequestUnitManifest(segments);
        const onTerminalUnitsAccepted = vi.fn();
        const executionContext = {
          manifestView: createManifestView(manifest),
          onTerminalUnitsAccepted,
        };
        mockEngine.createIntelligentMembershipBatches = vi.fn((items, manifestUnits) =>
          items.map((payload, index) => [{ payload, manifestUnit: manifestUnits[index] }])
        );
        mockProvider.translate
          .mockResolvedValueOnce({ translatedText: ['first A.'] })
          .mockResolvedValueOnce({ translatedText: ['first B.'] });

        const result = await handler.execute(
          mockEngine,
          { text: JSON.stringify(segments), sourceLanguage: 'en', targetLanguage: 'fa', mode: 'select_element', messageId: 'terminal-accounting' },
          mockProvider, 'en', 'fa', 'terminal-accounting', { tab: { id: 123 } }, 'unknown', executionContext
        );

        expect(result.success).toBe(true);
        expect(result.results).toHaveLength(1);
        expect(result.results[0].t).toBe('first A.');
        expect(onTerminalUnitsAccepted).toHaveBeenCalledTimes(1);
        expect(onTerminalUnitsAccepted.mock.calls[0][0]).toHaveLength(1);
      });

      it('structured PDF cells with same blockId but different cellId are NOT duplicates', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const cellA = { i: 'sched-1', b: 'sched-1', blockId: 'sched-1', cellId: 'c-a', lineIndex: 0, cellIndex: 0, t: 'Mon' };
        const cellB = { i: 'sched-1', b: 'sched-1', blockId: 'sched-1', cellId: 'c-b', lineIndex: 0, cellIndex: 1, t: 'Tue' };
        mockEngine.createIntelligentBatches = vi.fn(() => [[cellA, cellB]]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['دوشنبه', 'سه‌شنبه'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', mode: 'pdf-translation', text: JSON.stringify([cellA, cellB]) },
          mockProvider, 'en', 'fa', 'msg-pdf-diff-cellid', mockSender
        );

        expect(result.success).toBe(true);
        expect(result.results).toHaveLength(2);
        expect(result.results.map((r) => r.cellId)).toEqual(['c-a', 'c-b']);
      });

      it('structured PDF fallback child identities survive provider mapping', async () => {
        const cellA = { i: 'sched-fallback', b: 'sched-fallback', blockId: 'sched-fallback', cellId: 'sched-fallback|line:0|cell:0', lineIndex: 0, cellIndex: 0, t: 'A' };
        const cellB = { i: 'sched-fallback', b: 'sched-fallback', blockId: 'sched-fallback', cellId: 'sched-fallback|line:0|cell:1', lineIndex: 0, cellIndex: 1, t: 'B' };
        mockEngine.createIntelligentBatches = vi.fn(() => [[cellA, cellB]]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['TA', 'TB'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', mode: 'pdf-translation', text: JSON.stringify([cellA, cellB]) },
          mockProvider, 'en', 'fa', 'msg-pdf-fallback-cellid', mockSender
        );

        expect(result.success).toBe(true);
        expect(result.results.map((item) => item.cellId)).toEqual([
          'sched-fallback|line:0|cell:0',
          'sched-fallback|line:0|cell:1'
        ]);
      });

      it('structured PDF duplicate cellId still fails with typed error', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const cellA = { i: 'sched-1', b: 'sched-1', blockId: 'sched-1', cellId: 'c-x', lineIndex: 0, cellIndex: 0, t: 'Mon' };
        const cellB = { i: 'sched-1', b: 'sched-1', blockId: 'sched-1', cellId: 'c-x', lineIndex: 0, cellIndex: 1, t: 'Tue' };
        mockEngine.createIntelligentBatches = vi.fn(() => [[cellA, cellB]]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['دوشن', 'سه‌شنبه'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', mode: 'pdf-translation', text: JSON.stringify([cellA, cellB]) },
          mockProvider, 'en', 'fa', 'msg-pdf-dup-cellid', mockSender
        );

        expect(result.success).toBe(false);
        expect(result.error.type).toBe(ErrorTypes.VALIDATION);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(0);
      });

      it('structured PDF numeric cellId 0 is valid (nullish, not falsy fallback)', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const cellA = { i: 'sched-2', b: 'sched-2', blockId: 'sched-2', cellId: 0, lineIndex: 0, cellIndex: 0, t: 'Mon' };
        const cellB = { i: 'sched-2', b: 'sched-2', blockId: 'sched-2', cellId: 1, lineIndex: 0, cellIndex: 1, t: 'Tue' };
        mockEngine.createIntelligentBatches = vi.fn(() => [[cellA, cellB]]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['دوشنبه', 'سه‌شنبه'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', mode: 'pdf-translation', text: JSON.stringify([cellA, cellB]) },
          mockProvider, 'en', 'fa', 'msg-pdf-zero-cellid', mockSender
        );

        expect(result.success).toBe(true);
        expect(result.results).toHaveLength(2);
      });

      it('non-PDF items without cellId keep prior identity policy (i-based dedup)', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const payload = [{ i: 'n1', t: 'A.', blockId: 'b1' }, { i: 'n2', t: 'B.', blockId: 'b2' }];
        mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['TA.', 'TB.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', mode: 'select_element', text: JSON.stringify(payload) },
          mockProvider, 'en', 'fa', 'msg-nonpdf-no-cellid', mockSender
        );

        expect(result.success).toBe(true);
        expect(result.results).toHaveLength(2);
      });

      it('non-PDF duplicate uid (no cellId) still fails with typed error', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const payload = [{ i: 'n1', t: 'A.', blockId: 'b1' }, { i: 'n1', t: 'C.', blockId: 'b1' }];
        mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['TA.', 'TC.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
          mockProvider, 'en', 'fa', 'msg-nonpdf-dup-uid', mockSender
        );

        expect(result.success).toBe(false);
        expect(result.error.type).toBe(ErrorTypes.VALIDATION);
      });
    });

    describe('missing and unknown identity edge cases', () => {
      const mockSender = { tab: { id: 123 } };

      it('item with missing identity falls back to positional mapping (no dedup conflict)', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        mockEngine.createIntelligentBatches = vi.fn(() => [[{ t: 'A.' }, { t: 'B.' }]]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['TA.', 'TB.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, text: JSON.stringify([{ t: 'A.' }, { t: 'B.' }]) },
          mockProvider, 'en', 'fa', 'msg-no-id', mockSender
        );

        expect(result.success).toBe(true);
        expect(result.results).toHaveLength(2);
      });

      it('item with numeric ID 0 is handled correctly (not falsy fallback)', async () => {
        mockEngine.createIntelligentBatches = vi.fn(() => [[{ i: 0, t: 'A.' }]]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['TA.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, text: JSON.stringify([{ i: 0, t: 'A.' }]) },
          mockProvider, 'en', 'fa', 'msg-id-zero', mockSender
        );

        expect(result.success).toBe(true);
        expect(result.results).toHaveLength(1);
      });

      it('same-batch duplicate uid 0 with nullish semantics still detected', async () => {
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();

        const payload = [{ i: 0, t: 'A.' }, { i: 0, t: 'B.' }];
        mockEngine.createIntelligentBatches = vi.fn(() => [payload]);
        mockProvider.translate.mockResolvedValueOnce({ translatedText: ['TA.', 'TB.'] });

        const result = await handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify(payload) },
          mockProvider, 'en', 'fa', 'msg-zero-dup', mockSender
        );

        expect(result.success).toBe(false);
        expect(result.error.type).toBe(ErrorTypes.VALIDATION);
        const updates = browser.tabs.sendMessage.mock.calls
          .map(([, m]) => m)
          .filter(m => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
        expect(updates).toHaveLength(0);
      });

      it('genuine cancellation returns USER_CANCELLED (not masked by validation error)', async () => {
        vi.useRealTimers();
        const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
        const browser = (await import('webextension-polyfill')).default;
        browser.tabs.sendMessage.mockClear();
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);

        const firstBatch = createDeferred();
        mockEngine.createIntelligentBatches = vi.fn(() => [[{ i: 'n1', t: 'Hello.' }]]);
        mockProvider.translate.mockImplementationOnce(() => firstBatch.promise);

        const execution = handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ i: 'n1', t: 'Hello.' }]) },
          mockProvider, 'en', 'fa', 'msg-cancel-validation', mockSender
        );

        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));

         mockAbortController.abort('user-cancelled');
        firstBatch.resolve({ translatedText: ['Hello.'] });

        const result = await execution;
        expect(result.success).toBe(false);
        expect(result.error.type).toBe(ErrorTypes.USER_CANCELLED);
      });
    });

    describe('timeout/abort lifecycle hardening', () => {
      it('emits exactly one terminal on timeout and unregisters owned resources', async () => {
        vi.useFakeTimers();
        const browser = (await import('webextension-polyfill')).default;
        const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
        const firstBatch = createDeferred();
        const unregister = vi.fn();
        mockEngine.lifecycleRegistry = { ...mockEngine.lifecycleRegistry, unregisterRequest: unregister };

        const timeoutDiagnostics = () => appendTranslationDiagnostic.mock.calls
          .filter(([, diagnostic]) => diagnostic?.type === 'BATCH_TIMEOUT');

        try {
          getAIConversationHistoryEnabledAsync.mockResolvedValue(true);
          mockProvider.translate.mockImplementationOnce(() => firstBatch.promise);
          browser.tabs.sendMessage.mockClear();

          const execution = handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-exact-terminal', mockSender);
          execution.catch(() => {});
          await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));

          // Real timer-driven timeout (not a manual signal.aborted flag).
          await vi.advanceTimersByTimeAsync(TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS);
          await expect(execution).rejects.toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });
          expect(mockAbortController.abort).toHaveBeenCalledTimes(1);

          // Owned per-batch abort listener removed and request unregistered.
          expect(mockAbortController.signal.removeEventListener).toHaveBeenCalled();
          expect(unregister).toHaveBeenCalledWith('msg-exact-terminal');

          // Late provider settlement must not publish any stream/terminal message.
          firstBatch.resolve({ translatedText: ['late'] });
          await Promise.resolve();
          await Promise.resolve();

          const actions = browser.tabs.sendMessage.mock.calls.map(([, m]) => m?.action);
          expect(actions).toHaveLength(0);
          expect(actions).not.toContain(MessageActions.TRANSLATION_STREAM_UPDATE);
          expect(actions).not.toContain(MessageActions.TRANSLATION_STREAM_END);

          // No later callback fires after completion.
          await vi.advanceTimersByTimeAsync(300000);
          expect(mockAbortController.abort).toHaveBeenCalledTimes(1);
          expect(timeoutDiagnostics()).toHaveLength(1);
        } finally {
          firstBatch.resolve({ translatedText: ['late'] });
          getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
          vi.useRealTimers();
        }
      });

      it('unregisters the request and removes listeners on cancellation', async () => {
        vi.useRealTimers();
        const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
        getAIConversationHistoryEnabledAsync.mockResolvedValue(false);

        const unregister = vi.fn();
        mockEngine.lifecycleRegistry = { ...mockEngine.lifecycleRegistry, unregisterRequest: unregister };
        const firstBatch = createDeferred();
        mockEngine.createIntelligentBatches = vi.fn(() => [[{ i: 'n1', t: 'Hello.' }]]);
        mockProvider.translate.mockImplementationOnce(() => firstBatch.promise);

        const execution = handler.execute(
          mockEngine,
          { ...mockData, sourceLanguage: 'en', text: JSON.stringify([{ i: 'n1', t: 'Hello.' }]) },
          mockProvider, 'en', 'fa', 'msg-cancel-cleanup', mockSender
        );

        await vi.waitFor(() => expect(mockProvider.translate).toHaveBeenCalledTimes(1));
         mockAbortController.abort('user-cancelled');
        firstBatch.resolve({ translatedText: ['Hello.'] });

        const result = await execution;
        expect(result.success).toBe(false);
        expect(result.error.type).toBe(ErrorTypes.USER_CANCELLED);
        expect(unregister).toHaveBeenCalledWith('msg-cancel-cleanup');
        expect(mockAbortController.signal.removeEventListener).toHaveBeenCalled();
      });
    });
  });

  describe('frame-targeted streaming routing', () => {
    const mockData = {
      text: JSON.stringify([{ i: 'n1', t: 'Hello.' }]),
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      mode: 'select_element',
      messageId: 'msg-1',
      sessionId: 'sess-1'
    };

    it('targets the originating iframe for update and end sends', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      mockEngine.createIntelligentBatches = vi.fn(() => [[{ i: 'n1', t: 'Hello.' }]]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Bonjour.'] });

      const result = await handler.execute(
        mockEngine,
        mockData,
        mockProvider, 'en', 'fa', 'msg-frame-3', { tab: { id: 123 }, frameId: 3 }
      );

      expect(result.success).toBe(true);
      const calls = browser.tabs.sendMessage.mock.calls;
      const update = calls.find(([, m]) => m.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      const end = calls.find(([, m]) => m.action === MessageActions.TRANSLATION_STREAM_END);
      expect(update).toEqual([123, expect.objectContaining({ action: MessageActions.TRANSLATION_STREAM_UPDATE }), { frameId: 3 }]);
      expect(end).toEqual([123, expect.objectContaining({ action: MessageActions.TRANSLATION_STREAM_END }), { frameId: 3 }]);
    });

    it('propagates acceptance metadata through optimized stream and final result', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      mockEngine.createIntelligentBatches = vi.fn(() => [[{ i: 'n1', t: 'Hello.' }]]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Bonjour.'] });

      const result = await handler.execute(
        mockEngine,
        mockData,
        mockProvider,
        'en',
        'fa',
        'msg-optimized-acceptance',
        { tab: { id: 123 } },
        'unknown',
        { conversationAcceptanceRegistered: true }
      );

      const messages = browser.tabs.sendMessage.mock.calls.map(([, message]) => message);
      const update = messages.find(message => message.action === MessageActions.TRANSLATION_STREAM_UPDATE);
      const end = messages.find(message => message.action === MessageActions.TRANSLATION_STREAM_END);
      expect(update.data).toHaveProperty('conversationAcceptance', true);
      expect(end.data).toHaveProperty('conversationAcceptance', true);
      expect(result).toHaveProperty('conversationAcceptance', true);
    });

    it('omits acceptance metadata from optimized streams without registration', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      mockEngine.createIntelligentBatches = vi.fn(() => [[{ i: 'n1', t: 'Hello.' }]]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Bonjour.'] });

      const result = await handler.execute(
        mockEngine,
        mockData,
        mockProvider,
        'en',
        'fa',
        'msg-optimized-no-acceptance',
        { tab: { id: 123 } },
        'unknown',
        { conversationAcceptanceRegistered: false }
      );

      const messages = browser.tabs.sendMessage.mock.calls.map(([, message]) => message);
      expect(messages.every(message => !Object.hasOwn(message.data, 'conversationAcceptance'))).toBe(true);
      expect(result).not.toHaveProperty('conversationAcceptance');
    });

    it('targets the originating iframe for error sends', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      mockEngine.createIntelligentBatches = vi.fn(() => [[{ i: 'n1', t: 'Hello.' }]]);
      const error = new Error('provider down');
      error.type = 'NETWORK_ERROR';
      mockProvider.translate.mockRejectedValueOnce(error);

      const result = await handler.execute(
        mockEngine,
        mockData,
        mockProvider, 'en', 'fa', 'msg-frame-err', { tab: { id: 123 }, frameId: 3 }
      );

      expect(result.success).toBe(false);
      expect(result.errorDetails).toEqual(result.error);
      expect(result.errorDetails).toMatchObject({ message: 'provider down', type: 'NETWORK_ERROR' });
      const calls = browser.tabs.sendMessage.mock.calls;
      const end = calls.find(([, m]) => m.action === MessageActions.TRANSLATION_STREAM_END);
      expect(end).toEqual([123, expect.objectContaining({ action: MessageActions.TRANSLATION_STREAM_END }), { frameId: 3 }]);
    });

    it('serializes optimized stream errors with canonical identity fields', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();
      const error = new Error('structured provider failure');
      Object.assign(error, {
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'select-element-stream',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        cause: new Error('private cause'),
        arbitrary: { ignored: true }
      });

      await handler._sendStreamError(123, 'msg-optimized-error', error, 'fa', 'en', 'select_element');

      const message = browser.tabs.sendMessage.mock.calls[0][1];
      expect(message).toMatchObject({
        action: MessageActions.TRANSLATION_STREAM_END,
        data: {
          success: false,
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          translationMode: 'select_element',
          error: {
            message: 'structured provider failure',
            type: 'PROVIDER_ERROR',
            originalType: 'HTTP_ERROR',
            statusCode: 503,
            context: 'select-element-stream',
            providerName: 'Provider',
            providerId: 'provider-id',
            code: 'UPSTREAM_FAILURE',
            errorCode: 'E_UPSTREAM'
          }
        }
      });
      expect(message.data.error).not.toHaveProperty('cause');
      expect(message.data.error).not.toHaveProperty('arbitrary');
      expect(message.data.errorDetails).toEqual(message.data.error);
      expect(message.data.errorDetails).toMatchObject({
        message: 'structured provider failure',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'select-element-stream',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM'
      });
    });

    it('targets the top frame explicitly with frameId 0', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      mockEngine.createIntelligentBatches = vi.fn(() => [[{ i: 'n1', t: 'Hello.' }]]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Bonjour.'] });

      const result = await handler.execute(
        mockEngine,
        mockData,
        mockProvider, 'en', 'fa', 'msg-frame-0', { tab: { id: 123 }, frameId: 0 }
      );

      expect(result.success).toBe(true);
      const calls = browser.tabs.sendMessage.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every(([, , options]) => options && options.frameId === 0)).toBe(true);
    });

    it('keeps broadcast behavior when frameId is unavailable', async () => {
      const browser = (await import('webextension-polyfill')).default;
      browser.tabs.sendMessage.mockClear();

      mockEngine.createIntelligentBatches = vi.fn(() => [[{ i: 'n1', t: 'Hello.' }]]);
      mockProvider.translate.mockResolvedValueOnce({ translatedText: ['Bonjour.'] });

      const result = await handler.execute(
        mockEngine,
        mockData,
        mockProvider, 'en', 'fa', 'msg-no-frame', { tab: { id: 123 } }
      );

      expect(result.success).toBe(true);
      const calls = browser.tabs.sendMessage.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      calls.forEach((call) => expect(call).toHaveLength(2));
    });
  });
});
