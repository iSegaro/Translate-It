import { describe, it, expect, vi, beforeEach } from 'vitest';

// Seam-level regression: OptimizedJsonHandler → real BaseProvider.translate →
// real ProviderCoordinator.execute → real LanguageSwappingService →
// LanguageDetectionService. The only stubs are the leaf boundaries that the
// production system does not own deterministically:
//   - OperationSourceLanguageResolver gate result (denied AUTO path)
//   - LanguageDetectionService.detect return value (browser/statistical leaf)
// provider.translate and ProviderCoordinator.execute are NOT mocked, so the
// swap/detect guard under test runs through its real control flow.

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    init: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/features/translation/core/TranslationStatsManager.js', () => ({
  statsManager: {
    getSessionSummary: vi.fn(() => ({ chars: 100, originalChars: 80 })),
    printSummary: vi.fn(),
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
    getSettingsAsync: vi.fn().mockResolvedValue({}),
  };
});

import { OptimizedJsonHandler } from './OptimizedJsonHandler.js';
import { BaseProvider } from '@/features/translation/providers/BaseProvider.js';
import { LanguageSwappingService } from '@/features/translation/providers/LanguageSwappingService.js';
import { LanguageDetectionService } from '@/shared/services/LanguageDetectionService.js';
import { TranslationMode, getBilingualTranslationEnabledAsync, getBilingualTranslationModesAsync } from '@/shared/config/config.js';

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