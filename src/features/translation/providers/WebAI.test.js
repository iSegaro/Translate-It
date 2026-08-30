import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResponseFormat } from '@/shared/config/translationConstants.js';
import { TranslationCallPurpose } from './ProviderConstants.js';

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

vi.mock('@/shared/config/config.js', () => ({
  getWebAIApiUrlAsync: vi.fn().mockResolvedValue('https://webai.example/api'),
  getWebAIApiModelAsync: vi.fn().mockResolvedValue('webai-model'),
  getAIConversationHistoryEnabledAsync: vi.fn().mockResolvedValue(true),
  getProviderOptimizationLevelAsync: vi.fn().mockResolvedValue(3),
  TranslationMode: {
    Select_Element: 'select-element'
  }
}));

vi.mock('@/shared/proxy/ProxySettings.js', () => ({
  getProxySettingsAsync: vi.fn().mockResolvedValue({})
}));

vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: {
    fetch: vi.fn(),
    setConfig: vi.fn(),
    testConnection: vi.fn()
  }
}));

vi.mock('./utils/AIConversationHelper.js', () => ({
  AIConversationHelper: {
    getConversationParticipation: vi.fn().mockResolvedValue(false),
    claimNextTurn: vi.fn().mockResolvedValue(7),
    formatCompactHistoryContext: vi.fn().mockResolvedValue('Previous translation context:\nOriginal:\nPrevious original text\n\nTranslated:\nPrevious translated text'),
    updateSessionHistory: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    init: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debugLazy: vi.fn()
  })
}));

vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({}));

vi.mock('@/features/translation/core/ProviderCoordinator.js', () => ({
  providerCoordinator: {
    execute: vi.fn()
  }
}));

const WEBAI_RAW_RESPONSE_FIXTURES = Object.freeze({
  success: Object.freeze({ response: 'WebAI Result' }),
  missingResponse: Object.freeze({}),
});

import { WebAIProvider } from './WebAI.js';
import { AIConversationHelper } from './utils/AIConversationHelper.js';
import { getAIConversationHistoryEnabledAsync } from '@/shared/config/config.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { CompletionTermination } from '@/features/translation/ir/CompletionContract.js';
import { createTranslationOperation } from '@/features/translation/ir/TranslationOperation.js';

describe('WebAIProvider history support', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new WebAIProvider();
  });

  it('uses current response fixture and preserves absent completion metadata', async () => {
    const executeRequest = vi.spyOn(provider, '_executeRequest')
      .mockImplementation(async ({ extractResponse }) => extractResponse(WEBAI_RAW_RESPONSE_FIXTURES.success));

    await expect(provider._callAI('system', 'text')).resolves.toBe('WebAI Result');

    executeRequest.mockImplementation(async ({ extractResponse }) => extractResponse(WEBAI_RAW_RESPONSE_FIXTURES.missingResponse));
    await expect(provider._callAI('system', 'text')).resolves.toBeUndefined();
  });

  it('forwards call purpose outside the provider payload', async () => {
    const executeRequest = vi.spyOn(provider, '_executeRequest').mockResolvedValue('translated');
    await provider._callAI('system', 'text', { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
    const request = executeRequest.mock.calls[0][0];
    expect(request).toMatchObject({ callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
    expect(request.fetchOptions.headers).not.toHaveProperty('callPurpose');
    expect(JSON.parse(request.fetchOptions.body)).not.toHaveProperty('callPurpose');
  });

  it('does not read or write normal history for structured recovery', async () => {
    getAIConversationHistoryEnabledAsync.mockResolvedValue(true);
    vi.spyOn(provider, '_executeRequest').mockResolvedValue('translated');
    await provider._callAI('system', 'current segment', {
      sessionId: 'session-1',
      mode: 'select-element',
      callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY
    });

    expect(AIConversationHelper.claimNextTurn).not.toHaveBeenCalled();
    expect(AIConversationHelper.formatCompactHistoryContext).not.toHaveBeenCalled();
    expect(AIConversationHelper.updateSessionHistory).not.toHaveBeenCalled();
  });

  it('stages an eligible Select Element primary candidate', async () => {
    getAIConversationHistoryEnabledAsync.mockResolvedValue(true);
    const candidate = { stage: vi.fn() };
    const update = vi.spyOn(AIConversationHelper, 'updateSessionHistory').mockResolvedValue();
    vi.spyOn(provider, '_executeRequest').mockResolvedValue('translated');
    try {
      await provider._callAI('system', 'source', { sessionId: 'session-1', mode: 'select-element', callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, conversationParticipates: true, conversationCommitCandidate: candidate });
      expect(candidate.stage).toHaveBeenCalledWith({ sessionId: 'session-1', userContent: 'source', assistantContent: 'translated' });
      expect(update).not.toHaveBeenCalled();
    } finally { update.mockRestore(); }
  });

  it('writes history for eligible Select Element primary calls without a candidate', async () => {
    getAIConversationHistoryEnabledAsync.mockResolvedValue(true);
    const update = vi.spyOn(AIConversationHelper, 'updateSessionHistory').mockResolvedValue();
    vi.spyOn(provider, '_executeRequest').mockResolvedValue('translated');
    try {
      await provider._callAI('system', 'source', { sessionId: 'session-1', mode: 'select-element', callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, conversationParticipates: true });
      expect(update).toHaveBeenCalledWith('session-1', 'source', 'translated', expect.objectContaining({ callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, conversationParticipates: true }));
    } finally { update.mockRestore(); }
  });

  it('injects compact Select Element history and keeps a single message payload when history is enabled', async () => {
    getAIConversationHistoryEnabledAsync.mockResolvedValue(true);

    let capturedRequest = null;
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (params) => {
      capturedRequest = params;
      return 'translated';
    });

    const result = await provider._callAI(
      'System prompt',
      'Current text',
      {
        sessionId: 'session-1',
        mode: 'select-element',
         callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION,
         conversationParticipates: true,
         expectedFormat: ResponseFormat.JSON_OBJECT,
        isBatch: false
      }
    );

    expect(result).toBe('translated');
     expect(AIConversationHelper.claimNextTurn).toHaveBeenCalledWith(
       'session-1',
       'WebAI',
       expect.objectContaining({
         callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION,
         conversationParticipates: true,
       })
     );
     expect(AIConversationHelper.formatCompactHistoryContext).toHaveBeenCalledWith(
       'session-1',
       'select-element',
       expect.objectContaining({
         callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION,
         conversationParticipates: true,
       })
     );
     expect(AIConversationHelper.updateSessionHistory).toHaveBeenCalledWith(
       'session-1',
       'Current text',
       'translated',
       expect.objectContaining({
         callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION,
         conversationParticipates: true,
       })
     );

    const body = JSON.parse(capturedRequest.fetchOptions.body);
    expect(body).toEqual(expect.objectContaining({
      message: expect.any(String),
      model: 'webai-model',
      response_format: { type: 'json_object' }
    }));
    expect(body).not.toHaveProperty('messages');
    expect(body.message).toContain('System prompt');
    expect(body.message).toContain('Previous translation context:');
    expect(body.message).toContain('Previous original text');
    expect(body.message).toContain('Previous translated text');
    expect(body.message).toContain('Text to translate:');
    expect(body.message).toContain('Current text');
  });

  it('remains stateless when history is disabled', async () => {
    getAIConversationHistoryEnabledAsync.mockResolvedValue(false);

    let capturedRequest = null;
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (params) => {
      capturedRequest = params;
      return 'translated';
    });

    await provider._callAI(
      'System prompt',
      'Current text',
      {
        sessionId: 'session-2',
        mode: 'select-element',
        expectedFormat: ResponseFormat.STRING,
        isBatch: false
      }
    );

    expect(AIConversationHelper.claimNextTurn).not.toHaveBeenCalled();
    expect(AIConversationHelper.formatCompactHistoryContext).not.toHaveBeenCalled();
    expect(AIConversationHelper.updateSessionHistory).not.toHaveBeenCalled();

    const body = JSON.parse(capturedRequest.fetchOptions.body);
    expect(body.message).toBe('System prompt\n\nText to translate:\nCurrent text');
    expect(body).not.toHaveProperty('messages');
  });

  it('does not consume or store history for non-Select Element modes', async () => {
    getAIConversationHistoryEnabledAsync.mockResolvedValue(true);

    let capturedRequest = null;
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (params) => {
      capturedRequest = params;
      return 'translated';
    });

    await provider._callAI(
      'System prompt',
      'Current text',
      {
        sessionId: 'session-3',
        mode: 'content',
        expectedFormat: ResponseFormat.STRING,
        isBatch: false
      }
    );

    expect(AIConversationHelper.claimNextTurn).not.toHaveBeenCalled();
    expect(AIConversationHelper.formatCompactHistoryContext).not.toHaveBeenCalled();
    expect(AIConversationHelper.updateSessionHistory).not.toHaveBeenCalled();

    const body = JSON.parse(capturedRequest.fetchOptions.body);
    expect(body.message).toBe('System prompt\n\nText to translate:\nCurrent text');
    expect(body.message).not.toContain('Previous translation context:');
  });
});

describe('WebAIProvider Completion Recording (ADR-016)', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new WebAIProvider();
  });

  it('records content-only completion with absent metadata', async () => {
    const operation = createTranslationOperation('webai-completion');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(WEBAI_RAW_RESPONSE_FIXTURES.success),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'text', { executionContext: { operation } });
    const [record] = operation.snapshotCompletions();

    expect(result).toBe('WebAI Result');
    expect(record).toEqual({
      provider: 'WebAI',
      model: null,
      termination: CompletionTermination.UNKNOWN,
      responseId: null,
      usage: null,
    });
  });

  it('does not record a completion for a missing response', async () => {
    const operation = createTranslationOperation('webai-missing');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(WEBAI_RAW_RESPONSE_FIXTURES.missingResponse),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text', { executionContext: { operation } }))
      .rejects.toThrow();
    expect(operation.snapshotCompletions()).toEqual([]);
  });

  it('does not copy requested model into the completion record', async () => {
    const operation = createTranslationOperation('webai-model-not-inferred');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(WEBAI_RAW_RESPONSE_FIXTURES.success),
      clone: function() { return this; }
    });

    await provider._callAI('system', 'text', { executionContext: { operation } });
    expect(operation.snapshotCompletions()[0].model).toBe(null);
  });

  it('does not infer termination from request max_tokens', async () => {
    const operation = createTranslationOperation('webai-no-termination-inference');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(WEBAI_RAW_RESPONSE_FIXTURES.success),
      clone: function() { return this; }
    });

    await provider._callAI('system', 'text', { executionContext: { operation } });
    expect(operation.snapshotCompletions()[0].termination).toBe(CompletionTermination.UNKNOWN);
  });

  it('records nothing and returns normally without executionContext', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(WEBAI_RAW_RESPONSE_FIXTURES.success),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'text');
    expect(result).toBe('WebAI Result');
  });

  it('records two physical responses in order', async () => {
    const operation = createTranslationOperation('webai-multiple');
    proxyManager.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(WEBAI_RAW_RESPONSE_FIXTURES.success),
        clone: function() { return this; }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ response: 'WebAI second result' }),
        clone: function() { return this; }
      });

    await provider._callAI('system', 'first', { executionContext: { operation } });
    await provider._callAI('system', 'second', { executionContext: { operation } });

    const records = operation.snapshotCompletions();
    expect(records).toHaveLength(2);
    expect(records.map(({ termination, model, responseId, usage }) => ({ termination, model, responseId, usage }))).toEqual([
      { termination: CompletionTermination.UNKNOWN, model: null, responseId: null, usage: null },
      { termination: CompletionTermination.UNKNOWN, model: null, responseId: null, usage: null },
    ]);
  });

  it('does not leak raw response or request fields into the completion record', async () => {
    const operation = createTranslationOperation('webai-privacy');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({ ...WEBAI_RAW_RESPONSE_FIXTURES.success, request_id: 'request-namespace', created: 123 }),
      clone: function() { return this; }
    });

    await provider._callAI('system', 'text', { executionContext: { operation } });
    const record = operation.snapshotCompletions()[0];

    expect(record).not.toHaveProperty('response');
    expect(record.model).toBe(null);
    expect(record).not.toHaveProperty('max_tokens');
    expect(record).not.toHaveProperty('request_id');
    expect(record).not.toHaveProperty('created');
    expect(record).not.toHaveProperty('images');
    expect(record).not.toHaveProperty('x-request-id');
    expect(record).not.toHaveProperty('message');
    expect(record).not.toHaveProperty('content');
    expect(record).not.toHaveProperty('finish_reason');
    expect(record).not.toHaveProperty('usage_details');
    expect(record).not.toHaveProperty('reasoning_tokens');
  });
});
