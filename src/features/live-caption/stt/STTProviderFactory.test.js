import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STTProviderFactory } from './STTProviderFactory.js';
import { OpenAIWhisperProvider } from './providers/OpenAIWhisperProvider.js';
import { STT_PROVIDER_ERROR_CODES } from './BaseSTTProvider.js';
import { ProviderFactory as TranslationProviderFactory } from '@/features/translation/providers/ProviderFactory.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debugLazy: vi.fn()
  })
}));

vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    LIVE_CAPTION_RETRY_LIMIT: 2,
    LIVE_CAPTION_STT_PROVIDER: 'openai_whisper'
  },
  getOpenAIApiKeyAsync: vi.fn().mockResolvedValue('test-openai-key')
}));

vi.mock('@/features/translation/providers/ProviderFactory.js', () => ({
  ProviderFactory: vi.fn()
}));

describe('STTProviderFactory', () => {
  let factory;

  beforeEach(() => {
    vi.clearAllMocks();
    factory = new STTProviderFactory();
  });

  it('resolves the default OpenAI Whisper provider', async () => {
    const provider = await factory.getProvider();

    expect(provider).toBeInstanceOf(OpenAIWhisperProvider);
    expect(provider.apiKey).toBe('test-openai-key');
    expect(await factory.getProvider()).toBe(provider);
  });

  it('throws a clear error for unknown provider ids', async () => {
    await expect(factory.getProvider('unknown-provider')).rejects.toMatchObject({
      code: STT_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND
    });
    expect(TranslationProviderFactory).not.toHaveBeenCalled();
  });

  it('does not fall back to another STT provider', async () => {
    await expect(factory.getProvider('unknown-provider')).rejects.toThrow(/not registered|not found/i);
    expect(factory.providerInstances.size).toBe(0);
    expect(factory.loadingInstances.size).toBe(0);
  });
});
