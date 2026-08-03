import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock minimal dependencies
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debugLazy: vi.fn(),
    init: vi.fn(),
    operation: vi.fn(),
    performance: vi.fn(),
  })
}));

// Mock StatsManager early
vi.mock('../core/TranslationStatsManager.js', () => ({
  statsManager: { recordError: vi.fn() }
}));

// Mock ErrorMatcher
vi.mock('@/shared/error-management/ErrorMatcher.js', () => ({
  matchErrorToType: vi.fn(),
  isFatalError: vi.fn(),
  isTransientError: vi.fn(),
  isCancellationError: vi.fn()
}));

import { BaseAIProvider } from './BaseAIProvider.js';
import { ResponseFormat } from '@/shared/config/translationConstants.js';
import { isCancellationError, isFatalError, isTransientError, matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { createTranslationOperation } from '../ir/TranslationOperation.js';
import { TranslationCallPurpose } from './ProviderConstants.js';
import { translationSessionManager } from '../core/TranslationSessionManager.js';

// Mock AIResponseParser
vi.mock("./utils/AIResponseParser.js", () => ({
  AIResponseParser: {
    parseBatchResult: vi.fn((res) => ({ results: res, contractViolation: false })),
    cleanAIResponse: vi.fn((res) => res)
  }
}));

// 4. Concrete implementation for testing
class MockAIProvider extends BaseAIProvider {
  constructor() {
    super('MockAI');
  }
  
  // Override abstract or problematic methods
  async getSupportsStreaming() { return false; }
  async getBatchStrategy() { return 'smart'; }
  async _executeWithRateLimit(task) { return await task({}); }
  async _callAI() { return "Mock Response"; }
  
  // Manual override for prompt preparation to avoid helper dependency
  async _preparePromptAndText(texts) {
    return { systemPrompt: 'Sys', userText: JSON.stringify(texts) };
  }
}

describe('BaseAIProvider', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MockAIProvider();
    vi.mocked(isFatalError).mockReturnValue(false);
    vi.mocked(isTransientError).mockReturnValue(false);
    vi.mocked(matchErrorToType).mockReturnValue('UNKNOWN');
    vi.mocked(isCancellationError).mockReturnValue(false);
    translationSessionManager.sessions.clear();
  });

  describe('explicit batch execution APIs', () => {
    it('executeStructuredBatch returns raw primary response unchanged', async () => {
      provider._callAI = vi.fn().mockResolvedValue('raw structured response');

      const result = await provider.executeStructuredBatch(['source'], 'en', 'fa', {
        translateMode: 'selection',
        expectedFormat: ResponseFormat.JSON_ARRAY,
      });

      expect(result).toBe('raw structured response');
      expect(provider._callAI).toHaveBeenCalledWith('Sys', expect.any(String), expect.objectContaining({
        callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION,
      }));
    });

    it('executeSequentialBatch preserves scalar and array transport results with supplied purpose', async () => {
      provider._callAI = vi.fn()
        .mockResolvedValueOnce('one')
        .mockResolvedValueOnce('two')
        .mockResolvedValueOnce('three');

      await expect(provider.executeSequentialBatch(['one'], 'en', 'fa', {
        translateMode: 'selection',
        callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY,
      })).resolves.toBe('one');
      await expect(provider.executeSequentialBatch(['two', 'three'], 'en', 'fa', {
        translateMode: 'selection',
        callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY,
      })).resolves.toEqual(['two', 'three']);
      expect(provider._callAI.mock.calls.map(([, , options]) => options.callPurpose)).toEqual([
        TranslationCallPurpose.STRUCTURED_RECOVERY,
        TranslationCallPurpose.STRUCTURED_RECOVERY,
        TranslationCallPurpose.STRUCTURED_RECOVERY,
      ]);
    });
  });

  describe('_translateBatch', () => {
    it('should throw on non-fatal AND non-transient error instead of returning original text', async () => {
      provider._callAI = vi.fn().mockRejectedValue(new Error('Non-Fatal-Non-Transient'));
      vi.mocked(isFatalError).mockReturnValue(false);
      vi.mocked(isTransientError).mockReturnValue(false);

      const texts = ['Original 1', 'Original 2'];
      await expect(provider._translateBatch(texts, 'en', 'fa', 'selection', null, null, null, 'session-123'))
        .rejects.toThrow('Non-Fatal-Non-Transient');
    });

    it('should throw and NOT fallback if error is transient', async () => {
      provider._callAI = vi.fn().mockRejectedValue(new Error('Transient Error'));
      vi.mocked(isFatalError).mockReturnValue(false);
      vi.mocked(isTransientError).mockReturnValue(true);

      const texts = ['Original 1'];
      await expect(provider._translateBatch(texts, 'en', 'fa', 'selection'))
        .rejects.toThrow('Transient Error');
    });

    it('should throw immediately if error is fatal', async () => {
      provider._callAI = vi.fn().mockRejectedValue(new Error('FATAL 401'));
      vi.mocked(isFatalError).mockReturnValue(true);

      await expect(provider._translateBatch(['test'], 'en', 'fa', 'selection'))
        .rejects.toThrow('FATAL 401');
    });

    it('should not record a TranslationStatsManager error from the batch boundary (ownership: transport only)', async () => {
      const { statsManager } = await import('../core/TranslationStatsManager.js');
      provider._callAI = vi.fn().mockRejectedValue(new Error('Transport Failure'));

      await expect(provider._translateBatch(['seg1'], 'en', 'fa', 'selection', null, null, null, 'session-1'))
        .rejects.toThrow('Transport Failure');

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(statsManager.recordError).not.toHaveBeenCalled();
    });

    it('should call _callAI with correct parameters', async () => {
      const spy = vi.spyOn(provider, '_callAI');
      const texts = ['Hello'];
      
      await provider._translateBatch(texts, 'en', 'fa', 'selection');

      expect(spy).toHaveBeenCalled();
      const userText = spy.mock.calls[0][1];
      expect(userText).toContain('Hello');
    });

    it('should return parsed results without recovery when contract is honored', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['R1', 'R2'], contractViolation: false });
      const fallbackSpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['F1', 'F2']);

      const texts = ['seg1', 'seg2'];
      const result = await provider._translateBatch(texts, 'en', 'fa', 'selection', null, null, null, 'session-1');

      expect(result).toEqual(['R1', 'R2']);
      expect(fallbackSpy).not.toHaveBeenCalled();
    });

    it('should mark structured calls as primary translation', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['R1'], contractViolation: false });
      const callSpy = vi.spyOn(provider, '_callAI');

      await provider._translateBatch(['seg1'], 'en', 'fa', 'selection');

      expect(callSpy.mock.calls[0][2].callPurpose).toBe(TranslationCallPurpose.PRIMARY_TRANSLATION);
    });

    it('commits one staged valid structured primary response after parser acceptance', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      const response = '{"translations":["translated"]}';
      const session = translationSessionManager.getOrCreateSession('accepted-session', 'MockAI');
      const writeSpy = vi.spyOn((await import('./utils/AIConversationHelper.js')).AIConversationHelper, 'updateSessionHistory');
      provider._callAI = vi.fn(async (_system, userText, options) => {
        options.conversationCommitCandidate.stage({ sessionId: options.sessionId, userContent: userText, assistantContent: response });
        return response;
      });
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['translated'], contractViolation: false });

      try {
        await expect(provider._translateBatch(['source'], 'en', 'fa', 'select-element', null, null, 'm', 'accepted-session', null, ResponseFormat.JSON_ARRAY))
          .resolves.toEqual(['translated']);
        expect(writeSpy).toHaveBeenCalledTimes(1);
        expect(session.batchCount).toBe(1);
        expect(session.history).toHaveLength(2);
      } finally {
        writeSpy.mockRestore();
      }
    });

    it('discards a staged malformed structured primary response before recovery', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      const session = translationSessionManager.getOrCreateSession('rejected-session', 'MockAI');
      const before = structuredClone(session);
      const writeSpy = vi.spyOn((await import('./utils/AIConversationHelper.js')).AIConversationHelper, 'updateSessionHistory');
      provider._callAI = vi.fn(async (_system, userText, options) => {
        options.conversationCommitCandidate.stage({ sessionId: options.sessionId, userContent: userText, assistantContent: 'malformed' });
        return 'malformed';
      });
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['translated']);
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['source'], contractViolation: true });

      try {
        await expect(provider._translateBatch(['source'], 'en', 'fa', 'select-element', null, null, 'm', 'rejected-session', null, ResponseFormat.JSON_ARRAY))
          .resolves.toEqual(['translated']);
        expect(recoverySpy).toHaveBeenCalledTimes(1);
        expect(writeSpy).not.toHaveBeenCalled();
        expect(session).toEqual(before);
      } finally {
        writeSpy.mockRestore();
      }
    });

    it.each([
      ['transport failure', Object.assign(new Error('network'), { type: 'NETWORK_ERROR' })],
      ['cancellation', Object.assign(new Error('cancelled'), { type: 'USER_CANCELLED' })],
    ])('discards a staged structured primary response after %s', async (_label, error) => {
      const session = translationSessionManager.getOrCreateSession(`failed-${_label}`, 'MockAI');
      const before = structuredClone(session);
      const writeSpy = vi.spyOn((await import('./utils/AIConversationHelper.js')).AIConversationHelper, 'updateSessionHistory');
      provider._callAI = vi.fn(async (_system, userText, options) => {
        options.conversationCommitCandidate.stage({ sessionId: options.sessionId, userContent: userText, assistantContent: 'raw' });
        throw error;
      });

      try {
        await expect(provider._translateBatch(['source'], 'en', 'fa', 'select-element', null, null, 'm', session.id, null, ResponseFormat.JSON_ARRAY))
          .rejects.toBe(error);
        expect(writeSpy).not.toHaveBeenCalled();
        expect(session).toEqual(before);
      } finally {
        writeSpy.mockRestore();
      }
    });

    it('keeps staged candidate state local to each structured batch execution', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      const session = translationSessionManager.getOrCreateSession('local-candidates', 'MockAI');
      const writeSpy = vi.spyOn((await import('./utils/AIConversationHelper.js')).AIConversationHelper, 'updateSessionHistory');
      provider._callAI = vi.fn(async (_system, userText, options) => {
        options.conversationCommitCandidate.stage({ sessionId: options.sessionId, userContent: userText, assistantContent: userText });
        return userText;
      });
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['recovered']);
      AIResponseParser.parseBatchResult
        .mockReturnValueOnce({ results: ['source'], contractViolation: true })
        .mockReturnValueOnce({ results: ['accepted'], contractViolation: false });

      try {
        await provider._translateBatch(['discarded'], 'en', 'fa', 'select-element', null, null, 'm1', session.id, null, ResponseFormat.JSON_ARRAY);
        await provider._translateBatch(['accepted'], 'en', 'fa', 'select-element', null, null, 'm2', session.id, null, ResponseFormat.JSON_ARRAY);
        expect(recoverySpy).toHaveBeenCalledTimes(1);
        expect(writeSpy).toHaveBeenCalledTimes(1);
        expect(session.history).toHaveLength(2);
      } finally {
        writeSpy.mockRestore();
      }
    });

    it('should perform exactly one sequential recovery when the contract is violated', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['seg1'], contractViolation: true });
      const structuredSpy = vi.spyOn(provider, 'executeStructuredBatch');
      const sequentialSpy = vi.spyOn(provider, 'executeSequentialBatch');
      const fallbackSpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['F1']);

      const result = await provider._translateBatch(
        ['seg1', 'seg2'], 'en', 'fa', 'selection', null, null, null, 'session-1', { metadata: true }
      );

      expect(fallbackSpy).toHaveBeenCalledTimes(1);
      expect(structuredSpy).toHaveBeenCalledTimes(1);
      expect(sequentialSpy).toHaveBeenCalledTimes(1);
      expect(fallbackSpy).toHaveBeenCalledWith(
        ['seg1', 'seg2'], 'en', 'fa', 'selection', null, null, null, null,
        'session-1', ResponseFormat.STRING, expect.objectContaining({
          metadata: true,
          callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY
        })
      );
      expect(result).toEqual(['F1']);
    });

    it('should retain triggered and successful recovery facts without changing the result', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      const operation = createTranslationOperation('recovery-success');
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['seg1', 'seg2'], contractViolation: true });
      vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['F1', 'F2']);

      const result = await provider._translateBatch(
        ['seg1', 'seg2'], 'en', 'fa', 'selection', null, null, 'recovery-success', 'session-1',
        { executionContext: { operation } }
      );
      const report = operation.finalize();
      const recoveryFacts = report.entries.filter(({ type }) => type.startsWith('RECOVERY_'));

      expect(result).toEqual(['F1', 'F2']);
      expect(recoveryFacts).toEqual([
        expect.objectContaining({
          type: 'RECOVERY_TRIGGERED',
          stage: 'recovery',
          provider: 'MockAI',
          code: 'CONTRACT_VIOLATION',
          count: 2,
          messageId: 'recovery-success'
        }),
        expect.objectContaining({
          type: 'RECOVERY_SUCCEEDED',
          stage: 'recovery',
          provider: 'MockAI',
          messageId: 'recovery-success'
        })
      ]);
      expect(Object.isFrozen(report)).toBe(true);
      expect(Object.isFrozen(report.entries)).toBe(true);
      expect(Object.isFrozen(recoveryFacts[0])).toBe(true);
    });

    it('should retain recovery failure facts and rethrow the original error', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      const operation = createTranslationOperation('recovery-failure');
      const error = Object.assign(new Error('Recovery network failure'), { type: 'NETWORK_ERROR' });
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['seg1'], contractViolation: true });
      vi.spyOn(provider, '_traditionalBatchTranslate').mockRejectedValue(error);

      await expect(provider._translateBatch(
        ['seg1'], 'en', 'fa', 'selection', null, null, 'recovery-failure', 'session-1',
        { executionContext: { operation } }
      )).rejects.toBe(error);

      const recoveryFacts = operation.finalize().entries.filter(({ type }) => type.startsWith('RECOVERY_'));
      expect(recoveryFacts).toEqual([
        expect.objectContaining({ type: 'RECOVERY_TRIGGERED' }),
        expect.objectContaining({
          type: 'RECOVERY_FAILED',
          stage: 'recovery',
          provider: 'MockAI',
          reason: 'Recovery network failure',
          code: 'NETWORK_ERROR'
        })
      ]);
    });

    it('should not record recovery failure for cancellation and rethrow the original error', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      const operation = createTranslationOperation('recovery-cancelled');
      const error = Object.assign(new Error('Translation cancelled by user'), { type: 'USER_CANCELLED' });
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['seg1'], contractViolation: true });
      vi.mocked(isCancellationError).mockReturnValue(true);
      vi.spyOn(provider, '_traditionalBatchTranslate').mockRejectedValue(error);

      await expect(provider._translateBatch(
        ['seg1'], 'en', 'fa', 'selection', null, null, 'recovery-cancelled', 'session-1',
        { executionContext: { operation } }
      )).rejects.toBe(error);

      const recoveryFacts = operation.finalize().entries.filter(({ type }) => type.startsWith('RECOVERY_'));
      expect(recoveryFacts).toHaveLength(1);
      expect(recoveryFacts[0]).toMatchObject({ type: 'RECOVERY_TRIGGERED' });
    });

    it('should emit no per-segment recovery facts for multi-segment recovery', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      const operation = createTranslationOperation('recovery-multi-segment');
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['seg1', 'seg2', 'seg3'], contractViolation: true });
      vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['F1', 'F2', 'F3']);

      const result = await provider._translateBatch(
        ['seg1', 'seg2', 'seg3'], 'en', 'fa', 'selection', null, null, 'recovery-multi-segment', 'session-1',
        { executionContext: { operation } }
      );
      const recoveryFacts = operation.finalize().entries.filter(({ type }) => type.startsWith('RECOVERY_'));

      expect(result).toEqual(['F1', 'F2', 'F3']);
      expect(recoveryFacts).toHaveLength(2);
    });

    it('should use recovery purpose without mutating the original metadata', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      const operation = createTranslationOperation('recovery-purpose');
      const executionContext = { operation };
      const originalMetadata = { executionContext, marker: 'unchanged' };
      const beforeMetadata = { ...originalMetadata };
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['seg1', 'seg2'], contractViolation: true });
      const callSpy = vi.spyOn(provider, '_callAI').mockResolvedValueOnce('structured').mockResolvedValueOnce('F1').mockResolvedValueOnce('F2');

      const result = await provider._translateBatch(
        ['seg1', 'seg2'], 'en', 'fa', 'selection', null, null, 'recovery-purpose', 'session-1',
        originalMetadata, ResponseFormat.JSON_OBJECT
      );

      expect(result).toEqual(['F1', 'F2']);
      expect(callSpy.mock.calls.map(([, , options]) => options.callPurpose)).toEqual([
        TranslationCallPurpose.PRIMARY_TRANSLATION,
        TranslationCallPurpose.STRUCTURED_RECOVERY,
        TranslationCallPurpose.STRUCTURED_RECOVERY
      ]);
      expect(originalMetadata).toEqual(beforeMetadata);
      expect(originalMetadata.callPurpose).toBeUndefined();
      expect(originalMetadata.executionContext).toBe(executionContext);
      expect(operation.finalize().entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'RECOVERY_TRIGGERED' }),
        expect.objectContaining({ type: 'RECOVERY_SUCCEEDED' })
      ]));
    });

    it('should normalize single-segment sequential recovery output to the structured-batch array shape (JSON_OBJECT)', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['Bonjour'], contractViolation: true });
      provider._callAI = vi.fn()
        .mockResolvedValueOnce('structured-response')
        .mockResolvedValueOnce('Bonjour');
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate');

      const result = await provider._translateBatch(
        ['Bonjour'], 'en', 'fa', 'selection', null, null, null, 'session-1', null, ResponseFormat.JSON_OBJECT
      );

      expect(recoverySpy).toHaveBeenCalledTimes(1);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(['Bonjour']);
    });

    it('should keep multi-segment sequential recovery output as a flat array (no nesting)', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['F1', 'F2'], contractViolation: true });
      provider._callAI = vi.fn()
        .mockResolvedValueOnce('structured-response')
        .mockResolvedValueOnce('F1')
        .mockResolvedValueOnce('F2');
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate');

      const result = await provider._translateBatch(
        ['seg1', 'seg2'], 'en', 'fa', 'selection', null, null, null, 'session-1', null, ResponseFormat.JSON_OBJECT
      );

      expect(recoverySpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual(['F1', 'F2']);
      expect(result[0]).not.toBeInstanceOf(Array);
    });
  });

  describe('_shouldUseStreaming', () => {
    it('should not use streaming for PDF mode', async () => {
      const shouldStream = await provider._shouldUseStreaming(['a', 'b'], 'msg-1', { name: 'engine' }, 'pdf-translation');
      expect(shouldStream).toBe(false);
    });
  });

  describe('_traditionalBatchTranslate', () => {
    it('should process segments sequentially', async () => {
      const texts = ['seg1', 'seg2'];
      const spy = vi.spyOn(provider, '_callAI');
      
      await provider._traditionalBatchTranslate(texts, 'en', 'fa', 'selection');

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls.every(([, , options]) => options.callPurpose === TranslationCallPurpose.PRIMARY_TRANSLATION)).toBe(true);
    });
  });
});
