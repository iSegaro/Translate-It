import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STTProviderFactory } from './STTProviderFactory.js';
import { OpenAIWhisperProvider } from './providers/OpenAIWhisperProvider.js';
import { BrowserSpeechSTTProvider } from './providers/BrowserSpeechSTTProvider.js';
import { STT_PROVIDER_IDS } from './STTProviderManifest.js';
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
  getOpenAIApiKeyAsync: vi.fn().mockResolvedValue('test-openai-key'),
  IsDebug: vi.fn().mockResolvedValue(false)
}));

vi.mock('@/features/translation/providers/ProviderFactory.js', () => ({
  ProviderFactory: vi.fn()
}));

describe('STTProviderFactory', () => {
  let factory;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.SpeechRecognition = undefined;
    globalThis.webkitSpeechRecognition = undefined;
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

  it('rejects browser speech in unsupported browsers', async () => {
    globalThis.SpeechRecognition = undefined;
    globalThis.webkitSpeechRecognition = undefined;

    await expect(factory.getProvider(STT_PROVIDER_IDS.BROWSER_SPEECH)).rejects.toMatchObject({
      code: STT_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND
    });
  });

  it('allows browser speech only in debug mode when supported', async () => {
    globalThis.SpeechRecognition = class MockSpeechRecognition {};
    const { IsDebug } = await import('@/shared/config/config.js');
    IsDebug.mockResolvedValue(true);

    const provider = await factory.getProvider(STT_PROVIDER_IDS.BROWSER_SPEECH);
    expect(provider).toBeInstanceOf(BrowserSpeechSTTProvider);
    expect(await factory.getProvider(STT_PROVIDER_IDS.BROWSER_SPEECH)).not.toBe(provider);
  });
});
