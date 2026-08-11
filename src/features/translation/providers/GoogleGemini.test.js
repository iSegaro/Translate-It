import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from './GoogleGemini.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { TranslationCallPurpose } from './ProviderConstants.js';
import { AIConversationHelper } from './utils/AIConversationHelper.js';
import { createTranslationOperation } from '../ir/TranslationOperation.js';
import { CompletionTermination } from '../ir/CompletionContract.js';

// Mock Dependencies
vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: {
    fetch: vi.fn(),
    setConfig: vi.fn(),
    testConnection: vi.fn()
  }
}));

vi.mock('@/shared/config/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGeminiApiKeysAsync: vi.fn().mockResolvedValue(['test-key']),
    getGeminiModelAsync: vi.fn().mockResolvedValue('gemini-1.5-flash'),
    getGeminiThinkingEnabledAsync: vi.fn().mockResolvedValue(false),
    getGeminiApiUrlAsync: vi.fn().mockResolvedValue('https://generativelanguage.googleapis.com/v1beta/models'),
    getSettingsAsync: vi.fn().mockResolvedValue({}),
    getPromptBASEScreenCaptureAsync: vi.fn().mockResolvedValue('Translate this image to {targetLanguage}'),
  };
});

describe('GeminiProvider Error Handling', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GeminiProvider();
  });

  it('should handle successful translation', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'سلام دنیا' }] } }]
      }),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'Hello World');
    expect(result).toBe('سلام دنیا');
  });

  it('threads recovery purpose through Gemini conversation helpers', async () => {
    const claim = vi.spyOn(AIConversationHelper, 'claimNextTurn').mockResolvedValue(1);
    const history = vi.spyOn(AIConversationHelper, 'getConversationHistory').mockResolvedValue([]);
    const update = vi.spyOn(AIConversationHelper, 'updateSessionHistory').mockResolvedValue();
    vi.spyOn(provider, '_executeRequest').mockResolvedValue('translated');
    await provider._callAI('system', 'current segment', {
      sessionId: 'session-1',
      mode: 'select-element',
      callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY
    });
    expect(claim).toHaveBeenCalledWith('session-1', 'Gemini', { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
    expect(history).toHaveBeenCalledWith('session-1', 'select-element', expect.objectContaining({ maxTurns: 2, callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY }));
    expect(update).toHaveBeenCalledWith('session-1', 'current segment', 'translated', { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
    claim.mockRestore(); history.mockRestore(); update.mockRestore();
  });

  it('stages a normal primary candidate instead of writing history directly', async () => {
    const candidate = { stage: vi.fn() };
    const update = vi.spyOn(AIConversationHelper, 'updateSessionHistory').mockResolvedValue();
    vi.spyOn(provider, '_executeRequest').mockResolvedValue('translated');
    try {
      await provider._callAI('system', 'source', { sessionId: 'session-1', callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, conversationCommitCandidate: candidate });
      expect(candidate.stage).toHaveBeenCalledWith({ sessionId: 'session-1', userContent: 'source', assistantContent: 'translated' });
      expect(update).not.toHaveBeenCalled();
    } finally { update.mockRestore(); }
  });

  it('keeps direct history writes for primary calls without a candidate', async () => {
    const update = vi.spyOn(AIConversationHelper, 'updateSessionHistory').mockResolvedValue();
    vi.spyOn(provider, '_executeRequest').mockResolvedValue('translated');
    try {
      await provider._callAI('system', 'source', { sessionId: 'session-1', callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION });
      expect(update).toHaveBeenCalledWith('session-1', 'source', 'translated', { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION });
    } finally { update.mockRestore(); }
  });

  it('should detect API_ERROR wrapped in 200 OK response', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'API Key not valid', status: 'INVALID_ARGUMENT' }
      }),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text'))
      .rejects.toThrow('API_ERROR: API Key not valid');
  });

  it('should detect SAFETY filter block', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        candidates: [{ finishReason: 'SAFETY' }]
      }),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text'))
      .rejects.toThrow('API_ERROR: Content blocked by Gemini safety filters');
  });

  it('should handle HTTP 429 Too Many Requests', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Quota exceeded' }
      }),
      clone: function() { return this; }
    });

    try {
      await provider._callAI('system', 'text');
    } catch (error) {
      expect(error.type).toBe(ErrorTypes.RATE_LIMIT_REACHED);
      expect(error.statusCode).toBe(429);
    }
  });

  it('should handle thinking config fallback', async () => {
    // 1. First call fails with 400 because of thinking_config
    proxyManager.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Invalid field: thinking_config' }
      }),
      clone: function() { return this; }
    });

    // 2. Second call (retry) succeeds
    proxyManager.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'fallback result' }] } }]
      }),
      clone: function() { return this; }
    });

    // Mock config to enable thinking so fallback is triggered
    const { getGeminiThinkingEnabledAsync, getGeminiModelAsync } = await import('@/shared/config/config.js');
    getGeminiThinkingEnabledAsync.mockResolvedValue(true);
    getGeminiModelAsync.mockResolvedValue('gemini-2.0-flash-thinking-exp');

    const executeRequest = vi.spyOn(provider, '_executeRequest');
    const executionContext = { operation: { appendDiagnostic: vi.fn(), recordCompletion: vi.fn() } };
    const abortController = new AbortController();
    const result = await provider._callAI('system', 'text', {
      sessionId: 'session-1',
      abortController,
      callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY,
      executionContext
    });
    expect(result).toBe('fallback result');
    expect(executeRequest).toHaveBeenCalledTimes(2);
    expect(executeRequest.mock.calls.map(([request]) => request.callPurpose)).toEqual([
      TranslationCallPurpose.STRUCTURED_RECOVERY,
      TranslationCallPurpose.STRUCTURED_RECOVERY
    ]);
    expect(executeRequest.mock.calls[0][0].executionContext).toBe(executionContext);
    expect(executeRequest.mock.calls[1][0].executionContext).toBe(executionContext);
    expect(executeRequest.mock.calls[1][0]).toMatchObject({ sessionId: 'session-1', abortController });
    const [initialRequest, fallbackRequest] = executeRequest.mock.calls.map(([request]) => request);
    expect(initialRequest.originalCharCount).toBe('text'.length);
    expect(fallbackRequest.originalCharCount).toBe('text'.length);
    expect(initialRequest.charCount).toBe(initialRequest.fetchOptions.body.length);
    expect(fallbackRequest.charCount).toBe(fallbackRequest.fetchOptions.body.length);
    expect(JSON.parse(initialRequest.fetchOptions.body).generationConfig.thinking_config).toEqual({ include_thoughts: false });
    expect(JSON.parse(fallbackRequest.fetchOptions.body).generationConfig.thinking_config).toBeUndefined();
    expect(fallbackRequest.charCount).toBeLessThan(initialRequest.charCount);
    expect(JSON.parse(fallbackRequest.fetchOptions.body)).not.toHaveProperty('originalCharCount');
    expect(JSON.parse(fallbackRequest.fetchOptions.body)).not.toHaveProperty('charCount');
    expect(JSON.parse(fallbackRequest.fetchOptions.body)).not.toHaveProperty('executionContext');
    expect(JSON.parse(fallbackRequest.fetchOptions.body)).not.toHaveProperty('callPurpose');
    expect(fallbackRequest.fetchOptions.headers).not.toHaveProperty('executionContext');
    expect(fallbackRequest.fetchOptions.headers).not.toHaveProperty('callPurpose');
    expect(proxyManager.fetch).toHaveBeenCalledTimes(2);
  });

  it('stages a successful thinking fallback for structured primary validation', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ error: { message: 'Invalid field: thinking_config' } }),
        clone: function() { return this; }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'fallback result' }] } }] }),
        clone: function() { return this; }
      });
    const { getGeminiThinkingEnabledAsync, getGeminiModelAsync } = await import('@/shared/config/config.js');
    getGeminiThinkingEnabledAsync.mockResolvedValue(true);
    getGeminiModelAsync.mockResolvedValue('gemini-2.0-flash-thinking-exp');
    const conversationCommitCandidate = { stage: vi.fn() };

    const result = await provider._callAI('system', 'text', {
      sessionId: 'session-1',
      callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION,
      conversationCommitCandidate
    });

    expect(result).toBe('fallback result');
    expect(conversationCommitCandidate.stage).toHaveBeenCalledTimes(1);
    expect(conversationCommitCandidate.stage).toHaveBeenCalledWith({
      sessionId: 'session-1',
      userContent: 'text',
      assistantContent: 'fallback result'
    });
  });
});

describe('GeminiProvider Completion Recording (ADR-016 P2)', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GeminiProvider();
  });

  function mockGeminiResponse(body) {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(body),
      clone: function() { return this; }
    });
  }

  it('records one normalized completion for a normal STOP response', async () => {
    const operation = createTranslationOperation('p2-normal');
    const executionContext = { operation };

    mockGeminiResponse({
      candidates: [{
        content: { parts: [{ text: 'سلام دنیا' }] },
        finishReason: 'STOP'
      }],
      modelVersion: 'gemini-2.5-flash',
      responseId: 'resp-1',
      usageMetadata: {
        promptTokenCount: 1017,
        candidatesTokenCount: 318,
        thoughtsTokenCount: 7860,
        totalTokenCount: 9195
      }
    });

    const result = await provider._callAI('system', 'Hello World', { executionContext });

    expect(result).toBe('سلام دنیا');
    const completions = operation.snapshotCompletions();
    expect(completions).toHaveLength(1);
    expect(completions[0]).toEqual({
      provider: 'Gemini',
      model: 'gemini-2.5-flash',
      termination: CompletionTermination.NORMAL,
      responseId: 'resp-1',
      usage: {
        inputTokens: 1017,
        outputTokens: 318,
        reasoningTokens: 7860,
        totalTokens: 9195
      }
    });
  });

  it('records TRUNCATED for MAX_TOKENS while leaving translation unchanged', async () => {
    const operation = createTranslationOperation('p2-truncated');
    const executionContext = { operation };

    mockGeminiResponse({
      candidates: [{
        content: { parts: [{ text: 'partial result' }] },
        finishReason: 'MAX_TOKENS'
      }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
    });

    const result = await provider._callAI('system', 'text', { executionContext });

    expect(result).toBe('partial result');
    const completions = operation.snapshotCompletions();
    expect(completions).toHaveLength(1);
    expect(completions[0].termination).toBe(CompletionTermination.TRUNCATED);
    expect(completions[0].usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      reasoningTokens: null,
      totalTokens: 15
    });
  });

  it('records POLICY on SAFETY while preserving the existing throw', async () => {
    const operation = createTranslationOperation('p2-safety');
    const executionContext = { operation };

    mockGeminiResponse({
      candidates: [{ finishReason: 'SAFETY' }],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 0, totalTokenCount: 4 }
    });

    await expect(provider._callAI('system', 'text', { executionContext }))
      .rejects.toThrow('API_ERROR: Content blocked by Gemini safety filters');

    const completions = operation.snapshotCompletions();
    expect(completions).toHaveLength(1);
    expect(completions[0].termination).toBe(CompletionTermination.POLICY);
  });

  it('records UNKNOWN for an unrecognized finishReason without leaking the raw value', async () => {
    const operation = createTranslationOperation('p2-unknown');
    const executionContext = { operation };

    mockGeminiResponse({
      candidates: [{
        content: { parts: [{ text: 'result text' }] },
        finishReason: 'BLOCKLIST'
      }]
    });

    const result = await provider._callAI('system', 'text', { executionContext });

    expect(result).toBe('result text');
    const completions = operation.snapshotCompletions();
    expect(completions).toHaveLength(1);
    expect(completions[0].termination).toBe(CompletionTermination.UNKNOWN);
    expect(completions[0]).not.toHaveProperty('BLOCKLIST');
  });

  it('records a valid completion with null usage when usageMetadata is absent', async () => {
    const operation = createTranslationOperation('p2-no-usage');
    const executionContext = { operation };

    mockGeminiResponse({
      candidates: [{
        content: { parts: [{ text: 'ok' }] },
        finishReason: 'STOP'
      }]
    });

    const result = await provider._callAI('system', 'text', { executionContext });

    expect(result).toBe('ok');
    const completions = operation.snapshotCompletions();
    expect(completions).toHaveLength(1);
    expect(completions[0].usage).toBeNull();
    expect(completions[0].termination).toBe(CompletionTermination.NORMAL);
  });

  it('records null model and responseId when response metadata is absent', async () => {
    const operation = createTranslationOperation('p2-no-model');
    const executionContext = { operation };

    mockGeminiResponse({
      candidates: [{
        content: { parts: [{ text: 'ok' }] },
        finishReason: 'STOP'
      }]
    });

    await provider._callAI('system', 'text', { executionContext });

    const completions = operation.snapshotCompletions();
    expect(completions).toHaveLength(1);
    expect(completions[0].model).toBeNull();
    expect(completions[0].responseId).toBeNull();
  });

  it('records ordered completions for two physical Gemini responses in one operation', async () => {
    const operation = createTranslationOperation('p2-multi');
    const executionContext = { operation };

    proxyManager.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'first' }] }, finishReason: 'MAX_TOKENS' }]
        }),
        clone: function() { return this; }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'second' }] }, finishReason: 'STOP' }]
        }),
        clone: function() { return this; }
      });

    const first = await provider._callAI('system', 'a', { executionContext });
    const second = await provider._callAI('system', 'b', { executionContext });

    expect(first).toBe('first');
    expect(second).toBe('second');
    expect(operation.snapshotCompletions().map((c) => c.termination)).toEqual([
      CompletionTermination.TRUNCATED,
      CompletionTermination.NORMAL
    ]);
  });

  it('keeps raw Gemini fields out of the normalized completion record', async () => {
    const operation = createTranslationOperation('p2-privacy');
    const executionContext = { operation };

    mockGeminiResponse({
      candidates: [{
        content: { parts: [{ text: 'سلام دنیا' }] },
        finishReason: 'STOP'
      }],
      modelVersion: 'gemini-2.5-flash',
      responseId: 'resp-1',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 },
      apiKey: 'super-secret-key'
    });

    await provider._callAI('system', 'text', { executionContext });

    const [record] = operation.snapshotCompletions();
    for (const forbidden of ['candidates', 'content', 'parts', 'text', 'prompt', 'body', 'usageMetadata', 'finishReason', 'modelVersion', 'apiKey', 'sourceText', 'translatedText']) {
      expect(record).not.toHaveProperty(forbidden);
    }
    expect(Object.keys(record).sort()).toEqual(['model', 'provider', 'responseId', 'termination', 'usage']);
    expect(Object.keys(record.usage).sort()).toEqual(['inputTokens', 'outputTokens', 'reasoningTokens', 'totalTokens']);
  });

  it('records nothing when no candidate exists in the response body', async () => {
    const operation = createTranslationOperation('p2-no-candidate');
    const executionContext = { operation };

    mockGeminiResponse({ error: { message: 'Some API error' } });

    await expect(provider._callAI('system', 'text', { executionContext }))
      .rejects.toThrow('API_ERROR: Some API error');

    expect(operation.snapshotCompletions()).toEqual([]);
  });

  it('records nothing for an empty candidates array and keeps the invalid-response throw', async () => {
    const operation = createTranslationOperation('p2-empty-candidates');
    const executionContext = { operation };

    mockGeminiResponse({ candidates: [] });

    await expect(provider._callAI('system', 'text', { executionContext }))
      .rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });

    expect(operation.snapshotCompletions()).toEqual([]);
  });

  it('records nothing when candidates is missing entirely and keeps the invalid-response throw', async () => {
    const operation = createTranslationOperation('p2-missing-candidates');
    const executionContext = { operation };

    mockGeminiResponse({ usageMetadata: { promptTokenCount: 7 } });

    await expect(provider._callAI('system', 'text', { executionContext }))
      .rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });

    expect(operation.snapshotCompletions()).toEqual([]);
  });

  it('is null-safe when no executionContext is supplied', async () => {
    mockGeminiResponse({
      candidates: [{
        content: { parts: [{ text: 'سلام دنیا' }] },
        finishReason: 'STOP'
      }],
      modelVersion: 'gemini-2.5-flash'
    });

    const result = await provider._callAI('system', 'Hello World');
    expect(result).toBe('سلام دنیا');
  });
});
