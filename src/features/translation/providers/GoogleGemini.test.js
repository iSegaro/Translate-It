import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from './GoogleGemini.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { TranslationCallPurpose } from './ProviderConstants.js';
import { AIConversationHelper } from './utils/AIConversationHelper.js';

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
    const executionContext = { operation: { appendDiagnostic: vi.fn() } };
    const result = await provider._callAI('system', 'text', {
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
    expect(executeRequest.mock.calls[1][0].executionContext).toBeUndefined();
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
