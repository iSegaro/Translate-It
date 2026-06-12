import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalWhisperSTTProvider } from './LocalWhisperSTTProvider.js';
import { STT_PROVIDER_ERROR_CODES, STT_PROVIDER_STATUS } from '../BaseSTTProvider.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debugLazy: vi.fn()
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => logger
}));

vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    LIVE_CAPTION_RETRY_LIMIT: 2
  }
}));

describe('LocalWhisperSTTProvider', () => {
  let requestImpl;

  beforeEach(() => {
    requestImpl = vi.fn();
    logger.debug.mockClear();
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
    logger.debugLazy.mockClear();
  });

  it('does not require an API key at startup', () => {
    expect(() => new LocalWhisperSTTProvider()).not.toThrow();
  });

  it('builds a multipart request with the expected fields', async () => {
    requestImpl.mockResolvedValue({
      text: 'hello local whisper',
      language: 'en',
      duration: 1.25,
      segments: [
        { start: 0, end: 0.5, text: 'hello' },
        { start: 0.5, end: 1.25, text: 'local whisper' }
      ]
    });

    const provider = new LocalWhisperSTTProvider({
      requestImpl
    });

    const result = await provider.transcribeChunk(new Blob(['audio'], { type: 'audio/webm' }), {
      sessionId: 'session-1',
      videoFingerprint: 'video-1',
      chunkStartMs: 100,
      chunkEndMs: 250,
      language: 'en'
    });

    expect(requestImpl).toHaveBeenCalledTimes(1);
    const request = requestImpl.mock.calls[0][0];
    expect(request.url).toBe('http://127.0.0.1:8765/v1/audio/transcriptions');
    expect(request.method).toBe('POST');
    expect(request.body).toBeInstanceOf(FormData);
    expect(request.body.get('task')).toBe('transcribe');
    expect(request.body.get('response_format')).toBe('json');
    expect(request.body.get('language')).toBe('en');
    const file = request.body.get('file');
    expect(file).toBeInstanceOf(Blob);
    expect(file.type).toBe('audio/webm');
    expect(file.name).toBe('chunk.webm');
    expect(result).toMatchObject({
      text: 'hello local whisper',
      detectedLanguage: 'en',
      duration: 1.25,
      isFinal: true,
      provider: 'local_whisper'
    });
    expect(result.segments).toHaveLength(2);
    expect(provider.state).toBe(STT_PROVIDER_STATUS.READY);
  });

  it('omits language when the source language is auto', async () => {
    requestImpl.mockResolvedValue({ text: 'translated later' });

    const provider = new LocalWhisperSTTProvider({
      requestImpl
    });

    await provider.transcribeChunk(new Blob(['audio'], { type: 'audio/webm' }), {
      sourceLanguage: 'auto'
    });

    const request = requestImpl.mock.calls[0][0];
    expect(request.body.has('language')).toBe(false);
  });

  it('normalizes OpenAI-compatible response payloads', async () => {
    requestImpl.mockResolvedValue({
      transcript: 'normalized text',
      language: 'fa',
      duration: 3.5,
      segments: [
        { start: 0, end: 1.5, text: 'normalized' },
        { start: 1.5, end: 3.5, text: 'text' }
      ]
    });

    const provider = new LocalWhisperSTTProvider({
      requestImpl
    });

    const result = await provider.transcribeChunk(new Blob(['audio'], { type: 'audio/webm' }), {
      chunkStartMs: 10,
      chunkEndMs: 20
    });

    expect(result).toMatchObject({
      text: 'normalized text',
      detectedLanguage: 'fa',
      duration: 3.5,
      startTime: 10,
      endTime: 20,
      provider: 'local_whisper'
    });
    expect(result.segments).toHaveLength(2);
  });

  it('maps HTTP failures to STT provider errors', async () => {
    requestImpl.mockRejectedValue(Object.assign(new Error('Service unavailable'), {
      statusCode: 503,
      retryable: true
    }));

    const provider = new LocalWhisperSTTProvider({
      requestImpl,
      retryLimit: 0
    });

    await expect(provider.transcribeChunk(new Blob(['audio'], { type: 'audio/webm' })))
      .rejects.toMatchObject({
        code: STT_PROVIDER_ERROR_CODES.RETRY_EXHAUSTED,
        type: ErrorTypes.SERVER_ERROR
      });
  });

  it('maps network failures to STT provider errors', async () => {
    requestImpl.mockRejectedValue(Object.assign(new TypeError('NetworkError'), {
      type: ErrorTypes.NETWORK_ERROR,
      retryable: true
    }));

    const provider = new LocalWhisperSTTProvider({
      requestImpl,
      retryLimit: 0
    });

    await expect(provider.transcribeChunk(new Blob(['audio'], { type: 'audio/webm' })))
      .rejects.toMatchObject({
        code: STT_PROVIDER_ERROR_CODES.RETRY_EXHAUSTED,
        type: ErrorTypes.NETWORK_ERROR
      });
  });

  it('logs metadata only on transcription failure', async () => {
    requestImpl.mockRejectedValue(Object.assign(new Error('Service unavailable'), {
      statusCode: 503,
      retryable: true
    }));

    const provider = new LocalWhisperSTTProvider({
      requestImpl,
      retryLimit: 0
    });

    await expect(provider.transcribeChunk(new Blob(['audio'], { type: 'audio/webm' }), {
      sessionId: 'session-1',
      videoFingerprint: 'video-1',
      chunkStartMs: 10,
      chunkEndMs: 20
    })).rejects.toMatchObject({
      code: STT_PROVIDER_ERROR_CODES.RETRY_EXHAUSTED
    });

    const failureLog = logger.warn.mock.calls.find(([message]) => message === '[Local Whisper] Final transcription failure');
    expect(failureLog).toBeTruthy();
    const [, metadata] = failureLog;
    expect(metadata).toMatchObject({
      providerId: 'local_whisper',
      endpointHost: '127.0.0.1:8765',
      sessionId: 'session-1',
      videoFingerprint: 'video-1',
      chunkStartMs: 10,
      chunkEndMs: 20,
      audioSizeBytes: 5,
      audioMimeType: 'audio/webm',
      statusCode: 503,
      retryable: false,
      originalRetryable: true,
      attemptCount: 1,
      retryLimit: 0
    });
    expect(Object.keys(metadata)).not.toContain('text');
    expect(Object.keys(metadata)).not.toContain('transcript');
  });
});
