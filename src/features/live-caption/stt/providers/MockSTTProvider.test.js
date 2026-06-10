import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockSTTProvider, MOCK_STT_PROVIDER_ID } from './MockSTTProvider.js';
import mockData from './mock-transcripts.json';
import { STT_PROVIDER_ERROR_CODES } from '../BaseSTTProvider.js';

// Avoid console noise during tests
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('MockSTTProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('initializes with success scenario by default and returns normalized STT result', async () => {
    const provider = new MockSTTProvider();
    
    // audioChunk payload is ignored by the mock provider, so passing null is safe.
    const chunkPromise = provider.transcribeChunk(null, {
      chunkStartMs: 100,
      chunkEndMs: 1100
    });
    
    await vi.runAllTimersAsync();
    const result = await chunkPromise;

    expect(result.text).toBe(mockData.success[0]);
    expect(result.startTime).toBe(100);
    expect(result.endTime).toBe(1100);
    expect(result.isFinal).toBe(true);
    expect(result.provider).toBe(MOCK_STT_PROVIDER_ID);
  });

  it('loops back to the first transcript when success array is exhausted', async () => {
    const provider = new MockSTTProvider();
    const sequenceLength = mockData.success.length;
    
    // Process all chunks in the success array
    for (let i = 0; i < sequenceLength; i++) {
      const promise = provider.transcribeChunk(null);
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.text).toBe(mockData.success[i]);
    }

    // Process one more chunk to verify loop
    const promise = provider.transcribeChunk(null);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.text).toBe(mockData.success[0]);
  });

  it('returns empty text for the empty scenario', async () => {
    const provider = new MockSTTProvider({ scenario: 'empty' });
    
    const promise = provider.transcribeChunk(null);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.text).toBe('');
    expect(result.isFinal).toBe(true);
    expect(result.provider).toBe(MOCK_STT_PROVIDER_ID);
  });

  it('rejects with normalized STT provider error for the error scenario', async () => {
    const provider = new MockSTTProvider({ scenario: 'error' });
    
    // Catch the error immediately to prevent unhandled rejection warnings during timer advance
    const promise = provider.transcribeChunk(null).catch(e => e);
    await vi.runAllTimersAsync();
    
    const error = await promise;

    expect(error).toMatchObject({
      code: STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED,
      providerId: MOCK_STT_PROVIDER_ID,
      retryable: false,
      message: mockData.error.message
    });
  });

  it('allows dynamic scenario switching', async () => {
    const provider = new MockSTTProvider();
    
    // First chunk in success scenario
    const p1 = provider.transcribeChunk(null);
    await vi.runAllTimersAsync();
    const r1 = await p1;
    expect(r1.text).toBe(mockData.success[0]);

    // Switch to empty scenario
    provider.setScenario('empty');
    
    const p2 = provider.transcribeChunk(null);
    await vi.runAllTimersAsync();
    const r2 = await p2;
    expect(r2.text).toBe('');
  });
});
