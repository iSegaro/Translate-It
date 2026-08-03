import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterProvider } from './OpenRouter.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
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
    getOpenRouterApiKeysAsync: vi.fn().mockResolvedValue(['test-key']),
    getOpenRouterApiModelAsync: vi.fn().mockResolvedValue('openai/gpt-3.5-turbo'),
    getSettingsAsync: vi.fn().mockResolvedValue({}),
  };
});

describe('OpenRouterProvider Error Handling', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenRouterProvider();
  });

  it('should handle successful translation', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        choices: [{ message: { content: 'OpenRouter Result' } }]
      }),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'Hello World');
    expect(result).toBe('OpenRouter Result');
  });

  it('forwards call purpose outside the provider payload', async () => {
    const executeRequest = vi.spyOn(provider, '_executeRequest').mockResolvedValue('translated');
    await provider._callAI('system', 'text', { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
    const request = executeRequest.mock.calls[0][0];
    expect(request).toMatchObject({ callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
    expect(request.fetchOptions.headers).not.toHaveProperty('callPurpose');
    expect(JSON.parse(request.fetchOptions.body)).not.toHaveProperty('callPurpose');
  });

  it('threads recovery purpose through all conversation helpers', async () => {
    const claim = vi.spyOn(AIConversationHelper, 'claimNextTurn').mockResolvedValue(1);
    const messages = vi.spyOn(AIConversationHelper, 'getConversationMessages').mockResolvedValue({ messages: [{ role: 'system', content: 'system prompt' }, { role: 'user', content: 'current recovery segment' }], session: null });
    const update = vi.spyOn(AIConversationHelper, 'updateSessionHistory').mockResolvedValue();
    const execute = vi.spyOn(provider, '_executeRequest').mockResolvedValue('translated');
    try {
      const result = await provider._callAI('system prompt', 'current recovery segment', { sessionId: 'session-1', mode: 'select-element', callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
      expect(claim).toHaveBeenCalledWith('session-1', provider.providerName, { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
      expect(messages).toHaveBeenCalledWith('session-1', provider.providerName, 'current recovery segment', 'system prompt', 'select-element', { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
      expect(update).toHaveBeenCalledWith('session-1', 'current recovery segment', 'translated', { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
      const request = execute.mock.calls[0][0];
      expect(request).toMatchObject({ callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
      expect(request.fetchOptions.headers).not.toHaveProperty('callPurpose');
      expect(JSON.parse(request.fetchOptions.body)).not.toHaveProperty('callPurpose');
      expect(result).toBe('translated');
    } finally {
      claim.mockRestore(); messages.mockRestore(); update.mockRestore(); execute.mockRestore();
    }
  });

  it('stages a primary candidate instead of writing history directly', async () => {
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

  it('should detect API_ERROR wrapped in 200 OK response (OpenRouter style)', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Provider timeout', metadata: { raw: 'Gateway Timeout' } }
      }),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text'))
      .rejects.toThrow('API_ERROR: Provider timeout');
  });

  it('should detect error when it is the only field (common in OpenRouter)', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Model not found' }
      }),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text'))
      .rejects.toThrow('API_ERROR: Model not found');
  });
});
