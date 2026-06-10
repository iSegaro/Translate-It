import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STTProviderFactory } from './STTProviderFactory.js';
import { STT_PROVIDER_IDS } from './STTProviderManifest.js';
import { CONFIG } from '@/shared/config/config.js';
import OpenAIWhisperProvider from './providers/OpenAIWhisperProvider.js';
import MockSTTProvider from './providers/MockSTTProvider.js';

// Mock Config
vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    DEBUG_MODE: false,
    LIVE_CAPTION_STT_PROVIDER: 'openai_whisper'
  },
  getOpenAIApiKeyAsync: vi.fn().mockResolvedValue('test-key'),
  IsDebug: vi.fn().mockResolvedValue(false)
}));

describe('STT Provider Routing', () => {
  let factory;

  beforeEach(async () => {
    vi.clearAllMocks();
    factory = new STTProviderFactory();
    const { IsDebug, CONFIG } = await import('@/shared/config/config.js');
    CONFIG.DEBUG_MODE = false;
    CONFIG.LIVE_CAPTION_STT_PROVIDER = 'openai_whisper';
    IsDebug.mockResolvedValue(false);
  });

  it('should default to OpenAI Whisper when configuration is missing', async () => {
    CONFIG.LIVE_CAPTION_STT_PROVIDER = null;
    const provider = await factory.getProvider();
    expect(provider).toBeInstanceOf(OpenAIWhisperProvider);
    expect(provider.providerId).toBe(STT_PROVIDER_IDS.OPENAI_WHISPER);
  });

  it('should resolve Mock STT when IsDebug() is true and explicitly configured', async () => {
    const { IsDebug, CONFIG } = await import('@/shared/config/config.js');
    IsDebug.mockResolvedValue(true);
    CONFIG.LIVE_CAPTION_STT_PROVIDER = 'mock_stt';
    
    const provider = await factory.getProvider();
    expect(provider).toBeInstanceOf(MockSTTProvider);
    expect(provider.providerId).toBe(STT_PROVIDER_IDS.MOCK);
  });

  it('should throw error when Mock STT is configured but IsDebug() is false', async () => {
    const { IsDebug, CONFIG } = await import('@/shared/config/config.js');
    IsDebug.mockResolvedValue(false);
    CONFIG.LIVE_CAPTION_STT_PROVIDER = 'mock_stt';
    
    await expect(factory.getProvider()).rejects.toThrow(/restricted to debug mode/);
  });

  it('should respect IsDebug() even if CONFIG.DEBUG_MODE differs', async () => {
    const { IsDebug, CONFIG } = await import('@/shared/config/config.js');
    
    // Case 1: CONFIG is true, but persisted IsDebug is false -> should fail
    CONFIG.DEBUG_MODE = true;
    IsDebug.mockResolvedValue(false);
    CONFIG.LIVE_CAPTION_STT_PROVIDER = 'mock_stt';
    await expect(factory.getProvider()).rejects.toThrow(/restricted to debug mode/);
    
    factory.resetProviders();
    
    // Case 2: CONFIG is false, but persisted IsDebug is true -> should succeed
    CONFIG.DEBUG_MODE = false;
    IsDebug.mockResolvedValue(true);
    const provider = await factory.getProvider();
    expect(provider).toBeInstanceOf(MockSTTProvider);
  });

  it('should throw error for unsupported provider id', async () => {
    CONFIG.LIVE_CAPTION_STT_PROVIDER = 'invalid_provider';
    
    await expect(factory.getProvider()).rejects.toThrow(/not registered/);
  });

  it('should successfully instantiate multiple providers and respect memoization', async () => {
    const { IsDebug } = await import('@/shared/config/config.js');
    IsDebug.mockResolvedValue(true);
    
    const whisper = await factory.getProvider(STT_PROVIDER_IDS.OPENAI_WHISPER);
    const mock = await factory.getProvider(STT_PROVIDER_IDS.MOCK);
    
    expect(whisper).toBeInstanceOf(OpenAIWhisperProvider);
    expect(mock).toBeInstanceOf(MockSTTProvider);
    
    // Test memoization
    const whisper2 = await factory.getProvider(STT_PROVIDER_IDS.OPENAI_WHISPER);
    expect(whisper2).toBe(whisper);
  });

  it('should enforce API key requirement for OpenAI Whisper but not for Mock', async () => {
    const { getOpenAIApiKeyAsync, IsDebug } = await import('@/shared/config/config.js');
    getOpenAIApiKeyAsync.mockResolvedValue(null);

    // OpenAI should fail
    await expect(factory.getProvider(STT_PROVIDER_IDS.OPENAI_WHISPER)).rejects.toThrow(/API key is required/);

    // Mock should succeed (in debug mode)
    IsDebug.mockResolvedValue(true);
    const mock = await factory.getProvider(STT_PROVIDER_IDS.MOCK);
    expect(mock).toBeInstanceOf(MockSTTProvider);
  });
});
