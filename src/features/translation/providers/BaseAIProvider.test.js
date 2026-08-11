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
import { createTranslationOperation, recordProviderCompletion } from '../ir/TranslationOperation.js';
import { createCompletionRecord, CompletionTermination } from '../ir/CompletionContract.js';
import { TranslationCallPurpose } from './ProviderConstants.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { translationSessionManager } from '../core/TranslationSessionManager.js';
import { AIResponseParser } from './utils/AIResponseParser.js';

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

function createGate() {
  const holders = [];
  return {
    defer() {
      return new Promise((resolve) => holders.push(resolve));
    },
    release() {
      holders.splice(0).forEach((resolve) => resolve());
    },
  };
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
    it('accepts the normalized WebAI structured response without recovery', async () => {
      const { AIResponseParser: realParser } = await vi.importActual('./utils/AIResponseParser.js');
      AIResponseParser.parseBatchResult.mockImplementation(realParser.parseBatchResult.bind(realParser));
      provider._callAI = vi.fn().mockResolvedValue(
        JSON.parse('{"response":"{\\"translations\\":[{\\"id\\":\\"0\\",\\"text\\":\\"AA\\"},{\\"id\\":\\"1\\",\\"text\\":\\"BB\\"}]}"}').response
      );
      const recovery = vi.spyOn(provider, 'executeSequentialBatch');

      const result = await provider._translateBatch(
        ['A', 'B'], 'en', 'fa', 'select-element', null, null, null, null, null, ResponseFormat.JSON_OBJECT
      );

      expect(result).toEqual(['AA', 'BB']);
      expect(recovery).not.toHaveBeenCalled();
    });

    it('does not recover for harmless complete surplus output', async () => {
      const { AIResponseParser: realParser } = await vi.importActual('./utils/AIResponseParser.js');
      AIResponseParser.parseBatchResult.mockImplementation(realParser.parseBatchResult.bind(realParser));
      provider._callAI = vi.fn().mockResolvedValue(
        '[{"id":"0","text":"AA"},{"id":"1","text":"BB"},{"id":"99","text":"unused"}]'
      );
      const recovery = vi.spyOn(provider, 'executeSequentialBatch');

      const result = await provider._translateBatch(
        ['A', 'B'], 'en', 'fa', 'select-element', null, null, null, null, null, ResponseFormat.JSON_OBJECT
      );

      expect(result).toEqual(['AA', 'BB']);
      expect(recovery).not.toHaveBeenCalled();
    });

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

    it('discards the staged candidate and rejects with USER_CANCELLED when the signal aborts immediately before commit', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      const abortController = new AbortController();
      const session = translationSessionManager.getOrCreateSession('late-abort-session', 'MockAI');
      const writeSpy = vi.spyOn((await import('./utils/AIConversationHelper.js')).AIConversationHelper, 'updateSessionHistory');
      let commitSpy;
      let discardSpy;
      provider._callAI = vi.fn(async (_system, userText, options) => {
        const candidate = options.conversationCommitCandidate;
        commitSpy = vi.spyOn(candidate, 'commit');
        discardSpy = vi.spyOn(candidate, 'discard');
        candidate.stage({ sessionId: options.sessionId, userContent: userText, assistantContent: 'raw' });
        abortController.abort();
        return 'raw';
      });
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['translated'], contractViolation: false });

      try {
        await expect(
          provider._translateBatch(['source'], 'en', 'fa', 'select-element', abortController, null, 'm', 'late-abort-session', null, ResponseFormat.JSON_ARRAY)
        ).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
        expect(commitSpy).not.toHaveBeenCalled();
        expect(discardSpy).toHaveBeenCalledTimes(1);
        expect(writeSpy).not.toHaveBeenCalled();
        expect(session.history).toHaveLength(0);
      } finally {
        writeSpy.mockRestore();
      }
    });

    it('commits once without discard when the signal is not aborted and the result is accepted', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      const abortController = new AbortController();
      const session = translationSessionManager.getOrCreateSession('normal-accept-session', 'MockAI');
      const writeSpy = vi.spyOn((await import('./utils/AIConversationHelper.js')).AIConversationHelper, 'updateSessionHistory');
      let commitSpy;
      let discardSpy;
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['translated'], contractViolation: false });
      provider._callAI = vi.fn(async (_system, userText, options) => {
        const candidate = options.conversationCommitCandidate;
        commitSpy = vi.spyOn(candidate, 'commit');
        discardSpy = vi.spyOn(candidate, 'discard');
        candidate.stage({ sessionId: options.sessionId, userContent: userText, assistantContent: 'raw' });
        return 'raw';
      });

      try {
        const result = await provider._translateBatch(['source'], 'en', 'fa', 'select-element', abortController, null, 'm', 'normal-accept-session', null, ResponseFormat.JSON_ARRAY);
        expect(result).toEqual(['translated']);
        expect(commitSpy).toHaveBeenCalledTimes(1);
        expect(discardSpy).not.toHaveBeenCalled();
        expect(writeSpy).toHaveBeenCalledTimes(1);
        expect(session.history).toHaveLength(2);
      } finally {
        writeSpy.mockRestore();
      }
    });

    it('throws a typed USER_CANCELLED error when the signal aborts in the sequential pass', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        provider._traditionalBatchTranslate(['seg'], 'en', 'fa', 'selection', null, null, abortController, null, 'recovery-session', null, {})
      ).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
    });

    it('aborting during sequential recovery retains no conversation write and rejects with typed USER_CANCELLED', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      const abortController = new AbortController();
      const session = translationSessionManager.getOrCreateSession('recovery-abort-session', 'MockAI');
      const writeSpy = vi.spyOn((await import('./utils/AIConversationHelper.js')).AIConversationHelper, 'updateSessionHistory');
      let commitSpy;
      provider._callAI = vi.fn(async (_system, userText, options) => {
        if (options.conversationCommitCandidate) {
          commitSpy = vi.spyOn(options.conversationCommitCandidate, 'commit');
        }
        abortController.abort();
        return 'raw';
      });
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['source'], contractViolation: true });

      try {
        await expect(
          provider._translateBatch(['source'], 'en', 'fa', 'selection', abortController, null, 'm', 'recovery-abort-session', null, ResponseFormat.JSON_ARRAY)
        ).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
        expect(commitSpy).toBeDefined();
        expect(commitSpy).not.toHaveBeenCalled();
        expect(writeSpy).not.toHaveBeenCalled();
        expect(session.history).toHaveLength(0);
      } finally {
        writeSpy.mockRestore();
      }
    });

    it('rethrows a network recovery failure with its original error type', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['source'], contractViolation: true });
      const networkError = Object.assign(new Error('network down'), { type: ErrorTypes.NETWORK_ERROR });
      vi.spyOn(provider, '_traditionalBatchTranslate').mockRejectedValue(networkError);

      await expect(
        provider._translateBatch(['source'], 'en', 'fa', 'selection', null, null, null, 'recovery-fail-session', null, ResponseFormat.JSON_ARRAY)
      ).rejects.toBe(networkError);
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

    it('rejects duplicate primary candidate, runs sequential recovery, returns ordered results without parser source-fill escaping', async () => {
      const { AIResponseParser: realParser } = await vi.importActual("./utils/AIResponseParser.js");
      AIResponseParser.parseBatchResult.mockImplementation(realParser.parseBatchResult.bind(realParser));

      provider._callAI = vi.fn().mockResolvedValue('[{"i":"n1","t":"TA"},{"i":"n1","t":"TB"}]');
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['recovered-A', 'recovered-B']);

      const result = await provider._translateBatch(
        [{ i: 'n1', t: 'A' }, { i: 'n2', t: 'B' }], 'en', 'fa', 'select-element', null, null, 'rec-real', 'session-1', null, ResponseFormat.JSON_ARRAY
      );

      expect(AIResponseParser.parseBatchResult).toHaveBeenCalledTimes(1);
      expect(AIResponseParser.parseBatchResult.mock.results[0].value.contractViolation).toBe(true);
      expect(recoverySpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual(['recovered-A', 'recovered-B']);
      expect(result).not.toContain('A');
      expect(result).not.toContain('B');
    });

    it('propagates recovery failure error without returning source-filled parser results', async () => {
      const { AIResponseParser: realParser } = await vi.importActual("./utils/AIResponseParser.js");
      AIResponseParser.parseBatchResult.mockImplementation(realParser.parseBatchResult.bind(realParser));

      const error = Object.assign(new Error('Recovery network failure'), { type: 'NETWORK_ERROR' });
      provider._callAI = vi.fn().mockResolvedValue('[{"i":"n1","t":"TA"},{"i":"n1","t":"TB"}]');
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockRejectedValue(error);

      await expect(provider._translateBatch(
        [{ i: 'n1', t: 'A' }, { i: 'n2', t: 'B' }], 'en', 'fa', 'select-element', null, null, 'rec-fail', 'session-1', null, ResponseFormat.JSON_ARRAY
      )).rejects.toBe(error);
      expect(recoverySpy).toHaveBeenCalledTimes(1);
    });

    it('selectively recovers one reliable invalid middle item and preserves valid results', async () => {
      const { AIResponseParser } = await import('./utils/AIResponseParser.js');
      AIResponseParser.parseBatchResult.mockReturnValue({
        results: ['A', 'invalid', 'C'],
        contractViolation: true,
        invalidUnits: [{ requestIndex: 1, responseId: '1', violationCodes: ['V3_EMPTY_TRANSLATED_INTERVAL'] }],
        mappingFacts: { identityReliable: true, complete: true, ambiguous: false },
        repairContext: {
          reason: 'V3_EMPTY_TRANSLATED_INTERVAL',
          affectedUnits: [{ requestIndex: 1, responseId: '1', markerId: 'n13', sourceText: 'video game publisher' }],
        },
      });
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['B']);

      const result = await provider._translateBatch(['a', 'b', 'c'], 'en', 'fa', 'select-element');

      expect(recoverySpy.mock.calls[0][0]).toEqual(['b']);
      expect(recoverySpy.mock.calls[0][10]).toMatchObject({
        repairContext: expect.objectContaining({ reason: 'V3_EMPTY_TRANSLATED_INTERVAL' }),
      });
      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('selectively recovers multiple indexes in sorted original order', async () => {
      const { AIResponseParser } = await import('./utils/AIResponseParser.js');
      AIResponseParser.parseBatchResult.mockReturnValue({
        results: ['A', 'bad-1', 'C', 'bad-2', 'E'],
        contractViolation: true,
        invalidUnits: [
          { requestIndex: 3, responseId: '3', violationCodes: ['EMPTY_TRANSLATED_TEXT'] },
          { requestIndex: 1, responseId: '1', violationCodes: ['INVALID_TRANSLATED_TEXT'] },
        ],
        mappingFacts: { identityReliable: true, complete: true, ambiguous: false },
      });
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['B', 'D']);

      const result = await provider._translateBatch(['a', 'b', 'c', 'd', 'e'], 'en', 'fa', 'select-element');

      expect(recoverySpy.mock.calls[0][0]).toEqual(['b', 'd']);
      expect(result).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    it.each([
      ['first', ['bad', 'B', 'C'], [0], ['A']],
      ['last', ['A', 'B', 'bad'], [2], ['C']],
    ])('selectively recovers the %s invalid item', async (_label, primary, invalidIndexes, recovered) => {
      const { AIResponseParser } = await import('./utils/AIResponseParser.js');
      AIResponseParser.parseBatchResult.mockReturnValue({
        results: primary,
        contractViolation: true,
        invalidUnits: invalidIndexes.map((requestIndex) => ({ requestIndex, responseId: String(requestIndex), violationCodes: ['EMPTY_TRANSLATED_TEXT'] })),
        mappingFacts: { identityReliable: true, complete: true, ambiguous: false },
      });
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(recovered);

      const result = await provider._translateBatch(['A', 'B', 'C'], 'en', 'fa', 'select-element');

      expect(recoverySpy.mock.calls[0][0]).toEqual(invalidIndexes.map((index) => ['A', 'B', 'C'][index]));
      expect(result).toEqual(['A', 'B', 'C']);
    });

    it.each([
      ['missing facts', { results: ['A', 'bad', 'C'], contractViolation: true }],
      ['ambiguous mapping', {
        results: ['A', 'bad', 'C'],
        contractViolation: true,
        invalidUnits: [{ requestIndex: 1, responseId: '1', violationCodes: ['DUPLICATE_MAPPED_SLOT'] }],
        mappingFacts: { identityReliable: false, complete: false, ambiguous: true },
      }],
      ['invalid request index', {
        results: ['A', 'bad', 'C'],
        contractViolation: true,
        invalidUnits: [{ requestIndex: null, responseId: '1', violationCodes: ['V3_EMPTY_TRANSLATED_INTERVAL'] }],
        mappingFacts: { identityReliable: true, complete: true, ambiguous: false },
      }],
    ])('keeps full-batch recovery for %s', async (_label, parsed) => {
      const { AIResponseParser } = await import('./utils/AIResponseParser.js');
      AIResponseParser.parseBatchResult.mockReturnValue(parsed);
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['A', 'B', 'C']);

      await provider._translateBatch(['a', 'b', 'c'], 'en', 'fa', 'select-element');

      expect(recoverySpy.mock.calls[0][0]).toEqual(['a', 'b', 'c']);
    });

    it('fails selective recovery on result length mismatch without source fallback', async () => {
      const { AIResponseParser } = await import('./utils/AIResponseParser.js');
      AIResponseParser.parseBatchResult.mockReturnValue({
        results: ['A', 'source-value', 'C'],
        contractViolation: true,
        invalidUnits: [
          { requestIndex: 1, responseId: '1', violationCodes: ['V3_EMPTY_TRANSLATED_INTERVAL'] },
          { requestIndex: 2, responseId: '2', violationCodes: ['EMPTY_TRANSLATED_TEXT'] },
        ],
        mappingFacts: { identityReliable: true, complete: true, ambiguous: false },
      });
      vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['B']);

      await expect(provider._translateBatch(['a', 'b', 'c'], 'en', 'fa', 'select-element'))
        .rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
    });

    it('fails selective recovery when the recovery request throws', async () => {
      const { AIResponseParser } = await import('./utils/AIResponseParser.js');
      const error = Object.assign(new Error('subset failed'), { type: 'NETWORK_ERROR' });
      AIResponseParser.parseBatchResult.mockReturnValue({
        results: ['A', 'bad', 'C'],
        contractViolation: true,
        invalidUnits: [{ requestIndex: 1, responseId: '1', violationCodes: ['EMPTY_TRANSLATED_TEXT'] }],
        mappingFacts: { identityReliable: true, complete: true, ambiguous: false },
      });
      vi.spyOn(provider, '_traditionalBatchTranslate').mockRejectedValue(error);

      await expect(provider._translateBatch(['a', 'b', 'c'], 'en', 'fa', 'select-element'))
        .rejects.toBe(error);
    });

    it('keeps full-batch recovery when every item is invalid', async () => {
      const { AIResponseParser } = await import('./utils/AIResponseParser.js');
      AIResponseParser.parseBatchResult.mockReturnValue({
        results: ['bad-a', 'bad-b', 'bad-c'],
        contractViolation: true,
        invalidUnits: [0, 1, 2].map((requestIndex) => ({ requestIndex, responseId: String(requestIndex), violationCodes: ['INVALID_TRANSLATED_TEXT'] })),
        mappingFacts: { identityReliable: true, complete: true, ambiguous: false },
      });
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['A', 'B', 'C']);

      await provider._translateBatch(['a', 'b', 'c'], 'en', 'fa', 'select-element');

      expect(recoverySpy.mock.calls[0][0]).toEqual(['a', 'b', 'c']);
    });
  });

  describe('_translateBatch completion correlation (ADR-016 P3)', () => {
    it('passes the NORMAL completion recorded by the adapter to the parser', async () => {
      const { AIResponseParser: realParser } = await vi.importActual('./utils/AIResponseParser.js');
      AIResponseParser.parseBatchResult.mockImplementation(realParser.parseBatchResult.bind(realParser));
      const operation = createTranslationOperation('p3-stop');
      const record = createCompletionRecord({ provider: 'MockAI', termination: CompletionTermination.NORMAL, responseId: 'resp-1' });
      let stored = null;
      provider._callAI = vi.fn().mockImplementation(async (_sys, _text, options) => {
        stored = recordProviderCompletion(options.executionContext, record);
        return '[{"id":"0","text":"AA"},{"id":"1","text":"BB"}]';
      });

      const result = await provider._translateBatch(
        ['A', 'B'], 'en', 'fa', 'select-element', null, null, 'p3-stop', 'session-1',
        { executionContext: { operation } }
      );

      expect(result).toEqual(['AA', 'BB']);
      expect(AIResponseParser.parseBatchResult.mock.calls.at(-1)[7]).toBe(stored);
      expect(AIResponseParser.parseBatchResult.mock.calls.at(-1)[7]).not.toBe(record);
      expect(operation.snapshotCompletions()).toEqual([stored]);
    });

    it('attaches TRUNCATED classification while preserving full recovery behavior', async () => {
      const { AIResponseParser: realParser } = await vi.importActual('./utils/AIResponseParser.js');
      AIResponseParser.parseBatchResult.mockImplementation(realParser.parseBatchResult.bind(realParser));
      const operation = createTranslationOperation('p4-truncated-parse');
      const record = createCompletionRecord({
        provider: 'MockAI',
        termination: CompletionTermination.TRUNCATED,
        responseId: 'resp-truncated',
      });
      let calls = 0;
      provider._callAI = vi.fn().mockImplementation(async (_sys, _text, options) => {
        calls += 1;
        if (calls === 1) {
          recordProviderCompletion(options.executionContext, record);
          return '{"translations":';
        }
        return 'recovered';
      });

      const result = await provider._translateBatch(
        ['source'], 'en', 'fa', 'select-element', null, null, 'p4-truncated-parse', 'session-1',
        { executionContext: { operation } }, ResponseFormat.JSON_OBJECT
      );
      const trigger = operation.finalize().entries.find(({ type }) => type === 'RECOVERY_TRIGGERED');

      expect(result).toEqual(['recovered']);
      expect(provider._callAI).toHaveBeenCalledTimes(2);
      expect(trigger).toMatchObject({ classification: 'TRUNCATED_RESPONSE' });
    });

    it('passes a TRUNCATED completion through with identical behavior to NORMAL', async () => {
      const { AIResponseParser: realParser } = await vi.importActual('./utils/AIResponseParser.js');
      AIResponseParser.parseBatchResult.mockImplementation(realParser.parseBatchResult.bind(realParser));
      const operation = createTranslationOperation('p3-truncated');
      const truncRecord = createCompletionRecord({ provider: 'MockAI', termination: CompletionTermination.TRUNCATED, responseId: 'resp-t' });
      const normRecord = createCompletionRecord({ provider: 'MockAI', termination: CompletionTermination.NORMAL, responseId: 'resp-n' });
      const completions = [];
      provider._callAI = vi.fn().mockImplementation(async (_sys, _text, options) => {
        const stored = recordProviderCompletion(options.executionContext, completions.length ? normRecord : truncRecord);
        completions.push(stored);
        return '[{"id":"0","text":"X"}]';
      });

      const truncatedResult = await provider._translateBatch(
        ['a'], 'en', 'fa', 'select-element', null, null, 'p3-trunc', 'session-1',
        { executionContext: { operation } }
      );
      const normalResult = await provider._translateBatch(
        ['a'], 'en', 'fa', 'select-element', null, null, 'p3-trunc', 'session-1',
        { executionContext: { operation } }
      );

      expect(truncatedResult).toEqual(normalResult);
      expect(AIResponseParser.parseBatchResult.mock.calls.at(-2)[7]).toBe(completions[0]);
      expect(AIResponseParser.parseBatchResult.mock.calls.at(-1)[7]).toBe(completions[1]);
      expect(completions[0].termination).toBe(CompletionTermination.TRUNCATED);
      expect(completions[1].termination).toBe(CompletionTermination.NORMAL);
    });

    it('correlates each parallel batch with its own per-call completion slot', async () => {
      const { AIResponseParser: realParser } = await vi.importActual('./utils/AIResponseParser.js');
      AIResponseParser.parseBatchResult.mockImplementation(realParser.parseBatchResult.bind(realParser));
      const operation = createTranslationOperation('p3-parallel');
      const recordA = createCompletionRecord({ provider: 'MockAI', termination: CompletionTermination.NORMAL, responseId: 'resp-a' });
      const recordB = createCompletionRecord({ provider: 'MockAI', termination: CompletionTermination.TRUNCATED, responseId: 'resp-b' });
      const stored = [];
      const gate = createGate();
      provider._callAI = vi.fn().mockImplementation(async (_sys, text, options) => {
        const record = text.includes('resp-a-target') ? recordA : recordB;
        stored.push(recordProviderCompletion(options.executionContext, record));
        await gate.defer();
        return `[{"id":"0","text":"${record.responseId}"}]`;
      });

      const promiseA = provider._translateBatch(['resp-a-target'], 'en', 'fa', 'select-element', null, null, 'p3-par', 'session-1', { executionContext: { operation } });
      const promiseB = provider._translateBatch(['resp-b-target'], 'en', 'fa', 'select-element', null, null, 'p3-par', 'session-1', { executionContext: { operation } });
      await vi.waitFor(() => expect(provider._callAI).toHaveBeenCalledTimes(2));
      gate.release();
      const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

      expect(resultA).toEqual(['resp-a']);
      expect(resultB).toEqual(['resp-b']);
      expect(AIResponseParser.parseBatchResult.mock.calls.at(-2)[7]).toBe(stored.find(({ responseId }) => responseId === 'resp-a'));
      expect(AIResponseParser.parseBatchResult.mock.calls.at(-1)[7]).toBe(stored.find(({ responseId }) => responseId === 'resp-b'));
      expect(operation.snapshotCompletions()).toHaveLength(2);
    });

    it('records the primary completion on the primary slot and the recovery completion on the operation', async () => {
      const operation = createTranslationOperation('p3-primary-recovery');
      const primary = createCompletionRecord({ provider: 'MockAI', termination: CompletionTermination.TRUNCATED, responseId: 'resp-primary' });
      const recovery = createCompletionRecord({ provider: 'MockAI', termination: CompletionTermination.NORMAL, responseId: 'resp-recovery' });
      const primaryStored = [];
      const recoveryStored = [];
      AIResponseParser.parseBatchResult.mockReturnValue({
        results: ['bad-a'],
        contractViolation: true,
        invalidUnits: [{ requestIndex: 0, responseId: '0', violationCodes: ['EMPTY_TRANSLATED_TEXT'] }],
        mappingFacts: { identityReliable: true, complete: true, ambiguous: false },
      });
      provider._callAI = vi.fn().mockImplementation(async (_sys, _text, options) => {
        if (options.callPurpose === TranslationCallPurpose.STRUCTURED_RECOVERY) {
          recoveryStored.push(recordProviderCompletion(options.executionContext, recovery));
          return 'recovered-A';
        }
        primaryStored.push(recordProviderCompletion(options.executionContext, primary));
        return '[{"id":"0","text":"bad-a"}]';
      });

      const result = await provider._translateBatch(
        ['A'], 'en', 'fa', 'select-element', null, null, 'p3-prim', 'session-1',
        { executionContext: { operation } }, ResponseFormat.JSON_ARRAY
      );

      expect(result).toEqual(['recovered-A']);
      expect(AIResponseParser.parseBatchResult.mock.calls.at(-1)[7]).toBe(primaryStored[0]);
      expect(operation.snapshotCompletions()).toHaveLength(2);
      expect(operation.snapshotCompletions().map(({ responseId }) => responseId)).toEqual(['resp-primary', 'resp-recovery']);
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
