import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResponseFormat } from '@/shared/config/translationConstants.js';

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
  getSettingsAsync: vi.fn().mockResolvedValue({}),
  getProviderOptimizationLevelAsync: vi.fn().mockResolvedValue(3),
  TranslationMode: {
    Select_Element: 'select-element'
  }
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

import { WebAIProvider } from './WebAI.js';
import { AIConversationHelper } from './utils/AIConversationHelper.js';
import { getAIConversationHistoryEnabledAsync } from '@/shared/config/config.js';

describe('WebAIProvider history support', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new WebAIProvider();
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
        expectedFormat: ResponseFormat.JSON_OBJECT,
        isBatch: false
      }
    );

    expect(result).toBe('translated');
    expect(AIConversationHelper.claimNextTurn).toHaveBeenCalledWith('session-1', 'WebAI');
    expect(AIConversationHelper.formatCompactHistoryContext).toHaveBeenCalledWith('session-1', 'select-element', { maxChars: 300 });
    expect(AIConversationHelper.updateSessionHistory).toHaveBeenCalledWith('session-1', 'Current text', 'translated');

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
