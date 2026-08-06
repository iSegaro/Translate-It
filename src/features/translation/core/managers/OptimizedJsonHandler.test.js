import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { isFatalError, matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { appendTranslationDiagnostic } from '@/features/translation/ir/TranslationOperation.js';
import { getProviderConfiguration } from '@/features/translation/core/ProviderConfigurations.js';
import { TranslationBatcher } from '@/features/translation/core/utils/TranslationBatcher.js';
import { createManifestView, createRequestUnitManifest } from '@/features/translation/ir/RequestUnitManifest.js';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
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

    // Default mock behavior for ErrorMatcher
    isFatalError.mockImplementation((err) => err?.isFatal || false);
    matchErrorToType.mockImplementation((err) => err?.type || 'UNKNOWN_ERROR');

    handler = new OptimizedJsonHandler();

    mockAbortController = {
      signal: { 
        aborted: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      },
      abort: vi.fn(function() { this.signal.aborted = true; })
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
      mockAbortController.signal.aborted = true;
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
      mockAbortController.signal.aborted = true;
      secondBatch.resolve({ translatedText: ['t2'] });

      const result = await execution;

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.USER_CANCELLED);
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
      mockAbortController.signal.aborted = true;
      secondBatch.resolve({ translatedText: ['t2'] });

      const result = await execution;

      expect(result.success).toBe(false);
      expect(result.error.type).toBe(ErrorTypes.USER_CANCELLED);
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
        await vi.advanceTimersByTimeAsync(300000);

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

      mockAbortController.abort();
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

    it('should correctly scale and batch for Level 5 (Turbo) in an end-to-end flow', async () => {
      mockEngine.createIntelligentBatches = (segments, size, chars) => TranslationBatcher.createIntelligentBatches(segments, size, chars);

      // Mock a realistic AI provider config scaled to Level 5 (Turbo)
      // At Level 5, multiplier is 0.3
      // Scaled mode override: optimalSize: Math.max(5, Math.round(25 * 0.3)) = 8
      // Scaled characterLimit: Math.max(500, Math.round(3500 * 0.3)) = 1050
      getProviderConfiguration.mockReturnValueOnce({
        batching: {
          optimalSize: 6, // scaled base
          characterLimit: 5000,
          modeOverrides: {
            select_element: {
              optimalSize: 8, // scaled override
              characterLimit: 1050 // scaled override
            }
          }
        },
        rateLimit: { maxConcurrent: 2 }
      });

      // Prepare a larger set of segments (e.g., 20 segments of ~10 chars each)
      const testSegments = Array.from({ length: 20 }, (_, index) => ({
        t: `Segment ${index} text content.`,
        i: `uid-${index}`
      }));

      const customMockData = {
        ...mockData,
        text: JSON.stringify(testSegments)
      };

      // Mock translate responses for the expected number of batches (20 segments / 8 size = 3 batches)
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: testSegments.slice(0, 8).map(s => s.t) })
        .mockResolvedValueOnce({ translatedText: testSegments.slice(8, 16).map(s => s.t) })
        .mockResolvedValueOnce({ translatedText: testSegments.slice(16, 20).map(s => s.t) });

      const result = await handler.execute(mockEngine, customMockData, mockProvider, 'en', 'fa', 'msg-1', mockSender);

      expect(result.success).toBe(true);
      expect(mockProvider.translate).toHaveBeenCalledTimes(3); // 3 batches (8, 8, 4)
    });

    it('should correctly scale and batch for Level 1 (Economy) in an end-to-end flow', async () => {
      mockEngine.createIntelligentBatches = (segments, size, chars) => TranslationBatcher.createIntelligentBatches(segments, size, chars);

      // Mock a realistic AI provider config scaled to Level 1 (Economy)
      // At Level 1, multiplier is 2.5
      // Scaled mode override: optimalSize: Math.max(5, Math.round(25 * 2.5)) = 62
      // Scaled characterLimit: Math.max(500, Math.round(3500 * 2.5)) = 8750
      getProviderConfiguration.mockReturnValueOnce({
        batching: {
          optimalSize: 50, // scaled base
          characterLimit: 5000,
          modeOverrides: {
            select_element: {
              optimalSize: 62, // scaled override
              characterLimit: 8750 // scaled override
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

      // Mock translate response for 1 batch (20 segments < 62 optimalSize)
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
        expect(updates[0].data.data).toEqual([{ t: 'Translated one. Translated two.', text: 'Translated one. Translated two.', blockId: 'g1', i: 'g1', role: 'paragraph' }]);
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
        expect(updates[0].data.data[0].i).toBe('g1');
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
        expect(result.error.type).not.toBe(ErrorTypes.USER_CANCELLED);
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
        expect(result.error.type).not.toBe(ErrorTypes.USER_CANCELLED);
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
        expect(result.error.type).not.toBe(ErrorTypes.USER_CANCELLED);
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
        expect(updates[1].data.data[0].i).toBe('g1');
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
        expect(result.error.type).not.toBe(ErrorTypes.USER_CANCELLED);
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

        mockAbortController.signal.aborted = true;
        firstBatch.resolve({ translatedText: ['Hello.'] });

        const result = await execution;
        expect(result.success).toBe(false);
        expect(result.error.type).toBe(ErrorTypes.USER_CANCELLED);
      });
    });
  });
});
