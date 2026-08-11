import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomProvider } from './CustomProvider.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getCustomApiKeysAsync } from '@/shared/config/config.js';
import { TranslationCallPurpose } from './ProviderConstants.js';
import { AIConversationHelper } from './utils/AIConversationHelper.js';
import { CompletionTermination } from '@/features/translation/ir/CompletionContract.js';
import { createTranslationOperation } from '@/features/translation/ir/TranslationOperation.js';

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
    getCustomApiKeysAsync: vi.fn().mockResolvedValue(['test-key']),
    getCustomApiUrlAsync: vi.fn().mockResolvedValue('https://custom-api.com/v1/chat/completions'),
    getCustomApiModelAsync: vi.fn().mockResolvedValue('custom-model'),
    getSettingsAsync: vi.fn().mockResolvedValue({}),
  };
});

const CUSTOM_RAW_RESPONSE_FIXTURES = Object.freeze({
  contentOnly: Object.freeze({
    choices: [{ message: { content: 'Custom AI Result' } }],
  }),
  metadataRich: Object.freeze({
    id: 'custom-completion-1',
    model: 'custom-model',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content: 'Custom translated text' },
    }],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 10,
      total_tokens: 30,
      completion_tokens_details: { reasoning_tokens: 4 },
    },
  }),
  truncated: Object.freeze({
    choices: [{ finish_reason: 'length', message: { content: 'Custom truncated' } }],
  }),
  policy: Object.freeze({
    choices: [{ finish_reason: 'content_filter', message: { content: 'Custom filtered' } }],
  }),
  unknownTermination: Object.freeze({
    choices: [{ finish_reason: 'custom_nonstandard_reason', message: { content: 'Custom unknown' } }],
  }),
  partialUsage: Object.freeze({
    choices: [{ finish_reason: 'stop', message: { content: 'Custom partial' } }],
    usage: { prompt_tokens: 5 },
  }),
  customMetadata: Object.freeze({
    choices: [{ finish_reason: 'stop', message: { content: 'Custom ignored metadata' } }],
    token_count: 99,
    metadata: { reasoning_tokens: 88 },
  }),
  modelAbsent: Object.freeze({
    id: 'custom-no-model',
    choices: [{ finish_reason: 'stop', message: { content: 'Custom no model' } }],
  }),
  idAbsent: Object.freeze({
    model: 'custom-model-2',
    choices: [{ finish_reason: 'stop', message: { content: 'Custom no id' } }],
  }),
  idAndRequestId: Object.freeze({
    id: 'custom-id',
    request_id: 'custom-req-id',
    choices: [{ finish_reason: 'stop', message: { content: 'Custom req id test' } }],
  }),
  emptyChoices: Object.freeze({
    choices: [],
  }),
  errorEnvelope: Object.freeze({
    error: { message: 'Internal Model Error', code: 'model_error' },
  }),
});

describe('CustomProvider Error Handling', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CustomProvider();
  });

  it('should handle successful translation', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.contentOnly),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'Hello World');
    expect(result).toBe('Custom AI Result');
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
    const claim = vi
      .spyOn(AIConversationHelper, 'claimNextTurn')
      .mockResolvedValue(1);
    const messages = vi
      .spyOn(AIConversationHelper, 'getConversationMessages')
      .mockResolvedValue({
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'current recovery segment' },
        ],
        session: null,
      });
    const update = vi
      .spyOn(AIConversationHelper, 'updateSessionHistory')
      .mockResolvedValue();
    const execute = vi
      .spyOn(provider, '_executeRequest')
      .mockResolvedValue('translated');
    try {
      const result = await provider._callAI(
        'system prompt',
        'current recovery segment',
        {
          sessionId: 'session-1',
          mode: 'select-element',
          callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY,
        }
      );
      expect(claim).toHaveBeenCalledWith(
        'session-1', provider.providerName,
        { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY }
      );
      expect(messages).toHaveBeenCalledWith(
        'session-1', provider.providerName,
        'current recovery segment', 'system prompt', 'select-element',
        { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY }
      );
      expect(update).toHaveBeenCalledWith(
        'session-1', 'current recovery segment', 'translated',
        { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY }
      );
      const request = execute.mock.calls[0][0];
      expect(request).toMatchObject({ callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
      expect(request.fetchOptions.headers).not.toHaveProperty('callPurpose');
      expect(JSON.parse(request.fetchOptions.body)).not.toHaveProperty('callPurpose');
      expect(result).toBe('translated');
    } finally {
      claim.mockRestore();
      messages.mockRestore();
      update.mockRestore();
      execute.mockRestore();
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

  it('should allow anonymous OpenAI-compatible requests without an API key', async () => {
    vi.mocked(getCustomApiKeysAsync).mockResolvedValueOnce([]);

    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Anonymous Custom AI Result' } }]
      }),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'Hello World');
    const fetchOptions = proxyManager.fetch.mock.calls[0][1];

    expect(result).toBe('Anonymous Custom AI Result');
    expect(fetchOptions.headers.Authorization).toBeUndefined();
  });

  it('should detect API_ERROR wrapped in 200 OK response', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.errorEnvelope),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text'))
      .rejects.toThrow('API_ERROR: Internal Model Error');
  });

  it('should handle HTTP 503 Service Unavailable', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Server is overloaded' }
      }),
      clone: function() { return this; }
    });

    try {
      await provider._callAI('system', 'text');
    } catch (error) {
      expect(error.type).toBe(ErrorTypes.MODEL_OVERLOADED);
    }
  });

  it('records completion with null metadata for content-only responses', async () => {
    const operation = createTranslationOperation('custom-content-only');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.contentOnly),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'text', { executionContext: { operation } });
    const [record] = operation.snapshotCompletions();

    expect(result).toBe('Custom AI Result');
    expect(record).toEqual({
      provider: 'Custom',
      model: null,
      termination: CompletionTermination.UNKNOWN,
      responseId: null,
      usage: null,
    });
  });

  it('records normalized metadata from OpenAI-compatible response', async () => {
    const operation = createTranslationOperation('custom-metadata-rich');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.metadataRich),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'text', { executionContext: { operation } });
    const [record] = operation.snapshotCompletions();

    expect(result).toBe('Custom translated text');
    expect(record).toEqual({
      provider: 'Custom',
      model: 'custom-model',
      termination: CompletionTermination.NORMAL,
      responseId: 'custom-completion-1',
      usage: {
        inputTokens: 20,
        outputTokens: 10,
        reasoningTokens: 4,
        totalTokens: 30,
      },
    });
    expect(record).not.toHaveProperty('choices');
    expect(record).not.toHaveProperty('message');
    expect(record).not.toHaveProperty('content');
    expect(record).not.toHaveProperty('finish_reason');
    expect(record).not.toHaveProperty('token_count');
    expect(record).not.toHaveProperty('metadata');
  });

  it.each([
    ['TRUNCATED', CUSTOM_RAW_RESPONSE_FIXTURES.truncated, CompletionTermination.TRUNCATED],
    ['POLICY', CUSTOM_RAW_RESPONSE_FIXTURES.policy, CompletionTermination.POLICY],
    ['unknown termination', CUSTOM_RAW_RESPONSE_FIXTURES.unknownTermination, CompletionTermination.UNKNOWN],
  ])('normalizes %s termination without changing text', async (_label, fixture, termination) => {
    const operation = createTranslationOperation(`custom-${_label}`);
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(fixture),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text', { executionContext: { operation } }))
      .resolves.toBe(fixture.choices[0].message.content);
    expect(operation.snapshotCompletions()[0].termination).toBe(termination);
  });

  it('preserves partial usage without deriving values', async () => {
    const operation = createTranslationOperation('custom-partial-usage');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.partialUsage),
      clone: function() { return this; }
    });

    await provider._callAI('system', 'text', { executionContext: { operation } });
    expect(operation.snapshotCompletions()[0].usage).toEqual({
      inputTokens: 5,
      outputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
    });
  });

  it('ignores non-standard custom metadata fields', async () => {
    const operation = createTranslationOperation('custom-ignored-metadata');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.customMetadata),
      clone: function() { return this; }
    });

    await provider._callAI('system', 'text', { executionContext: { operation } });
    const record = operation.snapshotCompletions()[0];

    expect(record).not.toHaveProperty('token_count');
    expect(record).not.toHaveProperty('metadata');
    expect(record.usage).toBe(null);
    expect(record.termination).toBe(CompletionTermination.NORMAL);
  });

  it('keeps missing model absent', async () => {
    const operation = createTranslationOperation('custom-model-absent');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.modelAbsent),
      clone: function() { return this; }
    });

    await provider._callAI('system', 'text', { executionContext: { operation } });
    expect(operation.snapshotCompletions()[0]).toMatchObject({ model: null });
  });

  it('keeps null responseId when absent', async () => {
    const operation = createTranslationOperation('custom-id-absent');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.idAbsent),
      clone: function() { return this; }
    });

    await provider._callAI('system', 'text', { executionContext: { operation } });
    expect(operation.snapshotCompletions()[0].responseId).toBe(null);
  });

  it('uses data.id and not request_id for responseId', async () => {
    const operation = createTranslationOperation('custom-request-id');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.idAndRequestId),
      clone: function() { return this; }
    });

    await provider._callAI('system', 'text', { executionContext: { operation } });
    expect(operation.snapshotCompletions()[0].responseId).toBe('custom-id');
    expect(operation.snapshotCompletions()[0]).not.toHaveProperty('request_id');
  });

  it('returns translation normally without executionContext', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.metadataRich),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'text');
    expect(result).toBe('Custom translated text');
  });

  it('records two physical responses in order', async () => {
    const operation = createTranslationOperation('custom-multiple');
    proxyManager.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ ...CUSTOM_RAW_RESPONSE_FIXTURES.truncated, id: 'custom-1' }),
        clone: function() { return this; }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ ...CUSTOM_RAW_RESPONSE_FIXTURES.metadataRich, id: 'custom-2' }),
        clone: function() { return this; }
      });

    await provider._callAI('system', 'first', { executionContext: { operation } });
    await provider._callAI('system', 'second', { executionContext: { operation } });

    expect(operation.snapshotCompletions().map(({ responseId, termination }) => ({ responseId, termination }))).toEqual([
      { responseId: 'custom-1', termination: CompletionTermination.TRUNCATED },
      { responseId: 'custom-2', termination: CompletionTermination.NORMAL },
    ]);
  });

  it('does not create a completion record for an error envelope', async () => {
    const operation = createTranslationOperation('custom-error');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.errorEnvelope),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text', { executionContext: { operation } }))
      .rejects.toThrow('API_ERROR: Internal Model Error');
    expect(operation.snapshotCompletions()).toEqual([]);
  });

  it('does not create a completion record for a choice-less response', async () => {
    const operation = createTranslationOperation('custom-empty-choices');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.emptyChoices),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text', { executionContext: { operation } }))
      .rejects.toThrow();
    expect(operation.snapshotCompletions()).toEqual([]);
  });

  it('does not leak raw provider fields into the completion record', async () => {
    const operation = createTranslationOperation('custom-privacy');
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve(CUSTOM_RAW_RESPONSE_FIXTURES.customMetadata),
      clone: function() { return this; }
    });

    await provider._callAI('system', 'text', { executionContext: { operation } });
    const record = operation.snapshotCompletions()[0];

    expect(record).not.toHaveProperty('choices');
    expect(record).not.toHaveProperty('message');
    expect(record).not.toHaveProperty('content');
    expect(record).not.toHaveProperty('finish_reason');
    expect(record).not.toHaveProperty('token_count');
    expect(record).not.toHaveProperty('metadata');
    expect(record).not.toHaveProperty('request_id');
  });
});
