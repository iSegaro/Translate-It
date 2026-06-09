import { describe, it, expect, vi } from 'vitest';
import {
  BaseSTTProvider,
  normalizeSTTResult,
  createSTTProviderStatus,
  createSTTProviderError,
  STT_PROVIDER_STATUS,
  STT_PROVIDER_ERROR_CODES
} from './BaseSTTProvider.js';

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

class MockSTTProvider extends BaseSTTProvider {
  constructor() {
    super('mock_stt', { providerName: 'Mock STT' });
  }
}

describe('BaseSTTProvider', () => {
  it('treats the base class as abstract', () => {
    expect(() => new BaseSTTProvider('base')).toThrow(/not implemented yet/i);
  });

  it('exposes the abstract contract on subclasses', async () => {
    const provider = new MockSTTProvider();

    await expect(provider.transcribeChunk()).rejects.toThrow(/not implemented yet/i);
    await expect(provider.getStatus()).rejects.toThrow(/not implemented yet/i);
  });

  it('normalizes STT results into the approved shape', () => {
    const result = normalizeSTTResult({
      text: 'Hello',
      language: 'fa',
      confidence: '0.91',
      start: 10,
      end: 20
    }, 'openai_whisper');

    expect(result).toEqual({
      text: 'Hello',
      detectedLanguage: 'fa',
      confidence: 0.91,
      startTime: 10,
      endTime: 20,
      isFinal: true,
      provider: 'openai_whisper'
    });
  });

  it('creates status snapshots with provider identity and state', () => {
    const status = createSTTProviderStatus('openai_whisper', STT_PROVIDER_STATUS.READY, {
      retryCount: 1,
      ready: true,
      sessionId: 'session-1',
      videoFingerprint: 'video-1'
    });

    expect(status).toEqual({
      providerId: 'openai_whisper',
      state: STT_PROVIDER_STATUS.READY,
      retryCount: 1,
      ready: true,
      lastError: null,
      lastUpdatedAt: expect.any(Number),
      sessionId: 'session-1',
      videoFingerprint: 'video-1'
    });
  });

  it('creates structured provider errors', () => {
    const error = createSTTProviderError(STT_PROVIDER_ERROR_CODES.MISSING_API_KEY, 'missing');

    expect(error.code).toBe(STT_PROVIDER_ERROR_CODES.MISSING_API_KEY);
    expect(error.type).toBe('UNKNOWN');
    expect(error.message).toBe('missing');
    expect(error.name).toBe('LiveCaptionSTTProviderError');
  });

  it('disposes through the shared contract', async () => {
    const provider = new MockSTTProvider();

    const status = await provider.dispose();

    expect(status.state).toBe(STT_PROVIDER_STATUS.DISPOSED);
    expect(status.ready).toBe(false);
  });
});
