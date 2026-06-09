import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIWhisperProvider } from './OpenAIWhisperProvider.js';
import { STT_PROVIDER_ERROR_CODES, STT_PROVIDER_STATUS } from '../BaseSTTProvider.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

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
    LIVE_CAPTION_RETRY_LIMIT: 2
  }
}));

describe('OpenAIWhisperProvider', () => {
  let requestImpl;

  beforeEach(() => {
    requestImpl = vi.fn();
  });

  it('requires an OpenAI API key at startup', () => {
    expect(() => new OpenAIWhisperProvider({ apiKey: '' })).toThrow(/OpenAI API key is required/i);
  });

  it('normalizes a successful mocked transcription result', async () => {
    requestImpl.mockResolvedValue({
      text: 'سلام دنیا',
      language: 'fa',
      confidence: 0.93
    });

    const provider = new OpenAIWhisperProvider({
      apiKey: 'test-key',
      requestImpl
    });

    const result = await provider.transcribeChunk(new Blob(['audio'], { type: 'audio/webm' }), {
      sessionId: 'session-1',
      videoFingerprint: 'video-1',
      chunkStartMs: 100,
      chunkEndMs: 250
    });

    expect(requestImpl).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      text: 'سلام دنیا',
      detectedLanguage: 'fa',
      confidence: 0.93,
      startTime: 100,
      endTime: 250,
      isFinal: true,
      provider: 'openai_whisper'
    });
    expect(provider.state).toBe(STT_PROVIDER_STATUS.READY);
  });

  it('normalizes invalid credential errors from the provider response', async () => {
    requestImpl.mockRejectedValue(Object.assign(new Error('Unauthorized'), {
      statusCode: 401
    }));

    const provider = new OpenAIWhisperProvider({
      apiKey: 'test-key',
      requestImpl
    });

    await expect(provider.transcribeChunk(new Blob(['audio'], { type: 'audio/webm' })))
      .rejects.toMatchObject({
        code: STT_PROVIDER_ERROR_CODES.INVALID_API_KEY,
        type: ErrorTypes.API_KEY_INVALID
      });
    expect(requestImpl).toHaveBeenCalledTimes(1);
  });

  it('retries transient transcription failures and eventually succeeds', async () => {
    requestImpl
      .mockRejectedValueOnce(Object.assign(new TypeError('NetworkError'), { type: ErrorTypes.NETWORK_ERROR }))
      .mockRejectedValueOnce(Object.assign(new TypeError('NetworkError'), { type: ErrorTypes.NETWORK_ERROR }))
      .mockResolvedValue({ text: 'retry success', language: 'en' });

    const provider = new OpenAIWhisperProvider({
      apiKey: 'test-key',
      requestImpl,
      retryLimit: 2
    });

    const result = await provider.transcribeChunk(new Blob(['audio'], { type: 'audio/webm' }));

    expect(requestImpl).toHaveBeenCalledTimes(3);
    expect(result.text).toBe('retry success');
    expect(result.provider).toBe('openai_whisper');
  });

  it('surfaces a deterministic exhaustion error after retry exhaustion', async () => {
    requestImpl.mockRejectedValue(Object.assign(new TypeError('NetworkError'), { type: ErrorTypes.NETWORK_ERROR }));

    const provider = new OpenAIWhisperProvider({
      apiKey: 'test-key',
      requestImpl,
      retryLimit: 1
    });

    await expect(provider.transcribeChunk(new Blob(['audio'], { type: 'audio/webm' })))
      .rejects.toMatchObject({
        code: STT_PROVIDER_ERROR_CODES.RETRY_EXHAUSTED
      });
    expect(requestImpl).toHaveBeenCalledTimes(2);
  });
});
