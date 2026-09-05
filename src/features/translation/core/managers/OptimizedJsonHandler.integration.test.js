import { describe, it, expect, vi, beforeEach } from 'vitest';

// Seam-level regression: OptimizedJsonHandler → real BaseProvider.translate →
// real ProviderCoordinator.execute → real LanguageSwappingService →
// LanguageDetectionService. The only stubs are the leaf boundaries that the
// production system does not own deterministically:
//   - OperationSourceLanguageResolver gate result (denied AUTO path)
//   - LanguageDetectionService.detect return value (browser/statistical leaf)
// provider.translate and ProviderCoordinator.execute are NOT mocked, so the
// swap/detect guard under test runs through its real control flow.

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } },
    tabs: { sendMessage: vi.fn() },
  },
}));

vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: {
    fetch: vi.fn(),
    setConfig: vi.fn(),
    testConnection: vi.fn(),
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    init: vi.fn(),
    debug: vi.fn(),
    debugLazy: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/features/translation/core/TranslationStatsManager.js', () => ({
  statsManager: {
    getSessionSummary: vi.fn(() => ({ chars: 100, originalChars: 80 })),
    printSummary: vi.fn(),
    recordRequest: vi.fn(() => ({ globalCallId: 1, sessionCallId: 1 })),
    recordSuccess: vi.fn(),
    recordError: vi.fn(),
  },
}));

const resolveOperationSourceLanguage = vi.hoisted(() => vi.fn());

vi.mock('@/features/translation/core/OperationSourceLanguageResolver.js', () => ({
  resolveOperationSourceLanguage,
}));

vi.mock('@/shared/config/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // Bilingual toggles are mutable so each test pins its own state.
    getBilingualTranslationEnabledAsync: vi.fn(),
    getBilingualTranslationModesAsync: vi.fn(),
    getAIConversationHistoryEnabledAsync: vi.fn().mockResolvedValue(false),
    getProviderOptimizationLevelAsync: vi.fn().mockResolvedValue(3),
  };
});

import { OptimizedJsonHandler } from './OptimizedJsonHandler.js';
import { BaseProvider } from '@/features/translation/providers/BaseProvider.js';
import { queueManager } from '@/features/translation/core/QueueManager.js';
import { rateLimitManager } from '@/features/translation/core/RateLimitManager.js';
import { LanguageSwappingService } from '@/features/translation/providers/LanguageSwappingService.js';
import { LanguageDetectionService } from '@/shared/services/LanguageDetectionService.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { TranslationMode, getBilingualTranslationEnabledAsync, getBilingualTranslationModesAsync } from '@/shared/config/config.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

// 'select-element' is the real MessageContexts.SELECT_ELEMENT value that
// TranslationMode.Select_Element maps to.
const SELECT_ELEMENT_MODE = 'select-element';

class RecordingProvider extends BaseProvider {
  static batchStrategy = 'none';
  static isAI = false;

  constructor() {
    super('IntegrationProvider');
    this.batchCalls = [];
  }

  async _batchTranslate(texts, sourceLang, targetLang) {
    this.batchCalls.push([sourceLang, targetLang, texts.slice()]);
    return texts.map((text) => `[tr]${typeof text === 'object' ? (text.t ?? text.text) : text}`);
  }
}

// Real provider reaching the fetch boundary. _batchTranslate executes through the
// real ProviderRequestEngine (executeRequest → executeApiCall → proxyManager.fetch)
// so a timeout's shared abort signal can be observed at the physical HTTP seam.
class FetchSignalProvider extends BaseProvider {
  static batchStrategy = 'json';
  static isAI = true;

  constructor() {
    super('FetchSignalProvider');
  }

  async _batchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat, options = {}) {
    return this._executeRequest({
      url: 'https://fetch-signal.test/translate',
      fetchOptions: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
      },
      extractResponse: (data) => data.results || [],
      context: 'structured-batch',
      abortController,
      sessionId,
      callPurpose: options.callPurpose,
    });
  }
}

class CircuitFailureProvider extends BaseProvider {
  static batchStrategy = 'none';
  static isAI = false;

  constructor() {
    super('CircuitIntegrationProvider');
    this.physicalAttempts = 0;
  }

  async _batchTranslate(_texts, _sourceLang, _targetLang, _mode, _engine, messageId, abortController, priority, sessionId) {
    return this._executeWithRateLimit(
      async () => {
        this.physicalAttempts++;
        throw Object.assign(new Error('HTTP 500'), {
          type: ErrorTypes.SERVER_ERROR,
          statusCode: 500,
        });
      },
      'circuit-integration',
      priority,
      { messageId, abortController, sessionId },
    );
  }
}

function buildHarness() {
  const provider = new RecordingProvider();
  const abortController = {
    signal: {
      aborted: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    abort: vi.fn(function () {
      this.signal.aborted = true;
    }),
  };

  const engine = {
    lifecycleRegistry: {
      getAbortController: vi.fn(() => abortController),
      registerRequest: vi.fn(() => abortController),
      unregisterRequest: vi.fn(),
    },
    createIntelligentBatches: vi.fn((segments) => [[segments[0]], [segments[1]]]),
    isCancelled: vi.fn(() => false),
  };

  // Keep real implementations; only count and force a deterministic leaf result.
  const swapSpy = vi.spyOn(LanguageSwappingService, 'applyLanguageSwapping');
  const detectSpy = vi.spyOn(LanguageDetectionService, 'detect').mockResolvedValue('en');
  const translateSpy = vi.spyOn(provider, 'translate');

  return {
    provider,
    handler: new OptimizedJsonHandler(),
    engine,
    swapSpy,
    detectSpy,
    translateSpy,
  };
}

function runOperation({ provider, handler, engine }) {
  return handler.execute(
    engine,
    {
      text: JSON.stringify(['hello world one', 'hello world two']),
      sourceLanguage: 'auto',
      targetLanguage: 'fa',
      mode: TranslationMode.Select_Element,
      messageId: 'msg-integration',
      sessionId: 'sess-integration',
      options: {},
    },
    provider,
    'auto',
    'fa',
    'msg-integration',
    {},
  );
}

describe('OptimizedJsonHandler → ProviderCoordinator integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resolveOperationSourceLanguage.mockResolvedValue({
      canBypassSequentialGate: false,
      bypassReason: 'HEURISTIC_RESULT',
    });
    getBilingualTranslationEnabledAsync.mockResolvedValue(false);
    getBilingualTranslationModesAsync.mockResolvedValue({});
  });

  it('runs LanguageSwappingService and its detection only on batch 1 when bilingual is enabled', async () => {
    // Bilingual ON with the Select Element mode active: LanguageSwappingService
    // performs its internal detection on batch 1 (detected 'en' != target 'fa',
    // so no swap occurs and ProviderCoordinator's auto-detect fallback runs
    // too). The flag then suppresses BOTH swap entry and detection on batch 2.
    getBilingualTranslationEnabledAsync.mockResolvedValue(true);
    getBilingualTranslationModesAsync.mockResolvedValue({ [SELECT_ELEMENT_MODE]: true });

    const { provider, handler, engine, swapSpy, detectSpy, translateSpy } = buildHarness();
    const result = await runOperation({ provider, handler, engine });

    expect(result.success).toBe(true);

    // Batch 1 entered the provider unresolved (AUTO); batch 2 inherited the
    // pair resolved by batch 1's response lifecycle.
    expect(translateSpy).toHaveBeenCalledTimes(2);
    expect(translateSpy.mock.calls[0].slice(1, 3)).toEqual(['auto', 'fa']);
    expect(translateSpy.mock.calls[0][3].languagePairResolved).toBeUndefined();
    expect(translateSpy.mock.calls[1].slice(1, 3)).toEqual(['en', 'fa']);
    expect(translateSpy.mock.calls[1][3].languagePairResolved).toBe(true);

    // LanguageSwappingService ran on batch 1 only. Pre-fix, batch 2 would
    // re-enter it (swapSpy === 2).
    expect(swapSpy).toHaveBeenCalledTimes(1);

    // Batch 1 performs two detection entries with bilingual enabled: the swap's
    // internal detect plus ProviderCoordinator's auto-detect fallback (source
    // is still 'auto' after a no-swap). Both belong to batch 1 — the flag
    // removed batch 2's repetition entirely. Pre-fix total is 4.
    expect(detectSpy).toHaveBeenCalledTimes(2);
    expect(detectSpy.mock.invocationCallOrder.every((order) => order < translateSpy.mock.invocationCallOrder[1])).toBe(true);

    // Both provider executions ultimately received the resolved source/target.
    expect(provider.batchCalls).toHaveLength(2);
    provider.batchCalls.forEach(([source, target]) => {
      expect(source).toBe('en');
      expect(target).toBe('fa');
    });
  });

  it('runs one swap entry and one detect entry on batch 1 when bilingual is disabled', async () => {
    // Bilingual OFF: swap entry still runs on batch 1 but early-returns without
    // internal detection; ProviderCoordinator performs the single auto-detect
    // fallback. Covers the swap-only suppression contract.
    getBilingualTranslationEnabledAsync.mockResolvedValue(false);
    getBilingualTranslationModesAsync.mockResolvedValue({});

    const { provider, handler, engine, swapSpy, detectSpy, translateSpy } = buildHarness();
    const result = await runOperation({ provider, handler, engine });

    expect(result.success).toBe(true);

    expect(translateSpy).toHaveBeenCalledTimes(2);
    expect(translateSpy.mock.calls[0].slice(1, 3)).toEqual(['auto', 'fa']);
    expect(translateSpy.mock.calls[0][3].languagePairResolved).toBeUndefined();
    expect(translateSpy.mock.calls[1].slice(1, 3)).toEqual(['en', 'fa']);
    expect(translateSpy.mock.calls[1][3].languagePairResolved).toBe(true);

    expect(swapSpy).toHaveBeenCalledTimes(1);
    expect(detectSpy).toHaveBeenCalledTimes(1);

    expect(provider.batchCalls).toHaveLength(2);
    provider.batchCalls.forEach(([source, target]) => {
      expect(source).toBe('en');
      expect(target).toBe('fa');
    });
  });
});

describe('OptimizedJsonHandler physical abort propagation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    proxyManager.fetch.mockReset();
    proxyManager.setConfig.mockReset();
    proxyManager.testConnection.mockReset();
    resolveOperationSourceLanguage.mockResolvedValue({
      canBypassSequentialGate: false,
      bypassReason: 'HEURISTIC_RESULT',
    });
    getBilingualTranslationEnabledAsync.mockResolvedValue(false);
    getBilingualTranslationModesAsync.mockResolvedValue({});
  });

  it('timeout aborts the physical fetch through the shared AbortController signal', async () => {
    const provider = new FetchSignalProvider();
    const abortController = {
      signal: {
        aborted: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      abort: vi.fn(function () {
        this.signal.aborted = true;
      }),
    };

    const engine = {
      lifecycleRegistry: {
        getAbortController: vi.fn(() => abortController),
        registerRequest: vi.fn(() => abortController),
        unregisterRequest: vi.fn(),
      },
      createIntelligentBatches: vi.fn((segments) => segments.map((segment) => [segment])),
      isCancelled: vi.fn(() => false),
    };
    const handler = new OptimizedJsonHandler();

    // Leaf network boundary hangs; the request can only terminate via the
    // shared abort signal reaching this fetch call.
    proxyManager.fetch.mockImplementation(() => new Promise(() => {}));

    const execution = handler.execute(
      engine,
      {
        text: JSON.stringify(['hello world']),
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        mode: TranslationMode.Select_Element,
        messageId: 'msg-fetch-abort',
        sessionId: 'sess-fetch-abort',
        options: {},
      },
      provider,
      'en',
      'fa',
      'msg-fetch-abort',
      { tab: { id: 1 }, frameId: 0 },
      'unknown',
      { deadlineAt: Date.now() + 500 }
    );
    execution.catch(() => {});

    await vi.waitFor(() => expect(proxyManager.fetch).toHaveBeenCalledTimes(1));
    expect(proxyManager.fetch.mock.calls[0][1].signal).toBe(abortController.signal);
    expect(abortController.signal.aborted).toBe(false);

    await expect(execution).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });

    // The same signal object handed to fetch transitioned to aborted.
    expect(proxyManager.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(engine.lifecycleRegistry.unregisterRequest).toHaveBeenCalledWith('msg-fetch-abort');
  });

  it('keeps timeout canonical when physical fetch rejects from shared abort', async () => {
    const provider = new FetchSignalProvider();
    const abortController = new AbortController();
    const engine = {
      lifecycleRegistry: {
        getAbortController: vi.fn(() => abortController),
        registerRequest: vi.fn(() => abortController),
        unregisterRequest: vi.fn(),
      },
      createIntelligentBatches: vi.fn((segments) => segments.map((segment) => [segment])),
      isCancelled: vi.fn(() => false),
    };

    proxyManager.fetch.mockImplementation((_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));

    const execution = new OptimizedJsonHandler().execute(
      engine,
      {
        text: JSON.stringify(['timeout me']),
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        mode: TranslationMode.Select_Element,
        messageId: 'msg-timeout-abort-race',
        sessionId: 'sess-timeout-abort-race',
        options: {},
      },
      provider,
      'en',
      'fa',
      'msg-timeout-abort-race',
      { tab: { id: 1 }, frameId: 0 },
      'unknown',
      { deadlineAt: Date.now() + 25 },
    );

    await expect(execution).rejects.toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });
    expect(abortController.signal.reason?.name).toBe('AbortError');
  });

  it('preserves circuit root cause and stops QueueManager retries after fail-fast abort', async () => {
    vi.useFakeTimers();
    const provider = new CircuitFailureProvider();
    const abortController = new AbortController();
    const providerName = provider.providerName;
    const queueName = `${providerName}::parallel`;
    const state = rateLimitManager._initializeProvider(providerName, { maxConcurrent: 3, delayBetweenRequests: 0 });
    state.isManualConfig = true;
    state.circuitBreakThreshold = 5;
    state.circuitRecoveryTime = 30000;

    const engine = {
      lifecycleRegistry: {
        getAbortController: vi.fn(() => abortController),
        registerRequest: vi.fn(() => abortController),
        unregisterRequest: vi.fn(),
      },
      createIntelligentBatches: vi.fn((segments) => segments.map((segment) => [segment])),
      isCancelled: vi.fn(() => false),
    };
    const handler = new OptimizedJsonHandler();
    const execution = handler.execute(
      engine,
      {
        text: JSON.stringify(['one', 'two', 'three']),
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        mode: TranslationMode.Select_Element,
        messageId: 'msg-circuit-integration',
        sessionId: 'sess-circuit-integration',
        options: {},
      },
      provider,
      'en',
      'fa',
      'msg-circuit-integration',
      { tab: { id: 1 }, frameId: 0 },
    );
    execution.catch(() => {});

    try {
      for (let attempt = 0; attempt < 10; attempt++) {
        await vi.advanceTimersByTimeAsync(10000);
        await Promise.resolve();
      }

      const result = await execution;
      expect(result).toMatchObject({
        success: false,
        error: {
          type: ErrorTypes.CIRCUIT_BREAKER_OPEN,
          originalType: ErrorTypes.SERVER_ERROR,
          statusCode: 500,
        },
      });
      expect(result.success).not.toBe(true);

      const attemptsAtTerminality = provider.physicalAttempts;
      await vi.advanceTimersByTimeAsync(60000);
      expect(provider.physicalAttempts).toBe(attemptsAtTerminality);
      expect(abortController.signal.aborted).toBe(true);
      expect(queueManager.retryTimeouts.size).toBe(0);
    } finally {
      queueManager.retryTimeouts.forEach((timeout) => clearTimeout(timeout));
      queueManager.retryTimeouts.clear();
      queueManager.queues.delete(queueName);
      queueManager.processing.delete(queueName);
      rateLimitManager.providerStates.delete(providerName);
      vi.useRealTimers();
    }
  });
});
