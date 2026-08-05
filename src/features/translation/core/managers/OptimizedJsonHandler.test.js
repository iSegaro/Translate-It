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
        expect(error).toMatchObject({ type: ErrorTypes.VALIDATION_ERROR, isFatal: true });
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
          expect(error).toMatchObject({ type: ErrorTypes.VALIDATION_ERROR, isFatal: true });
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
  });
});
