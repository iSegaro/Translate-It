import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock streamingManager
vi.mock('@/features/translation/core/StreamingManager.js', () => ({
  streamingManager: {
    streamBatchResults: vi.fn().mockResolvedValue(true),
    completeStream: vi.fn().mockResolvedValue(true),
    streamBatchError: vi.fn().mockResolvedValue(true)
  }
}));

import { AIStreamManager } from './AIStreamManager.js';
import { streamingManager } from '@/features/translation/core/StreamingManager.js';

// 2. Mock Logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

describe('AIStreamManager', () => {
  let mockEngine;
  const messageId = 'test-msg-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockEngine = {}; // Engine is passed but not directly used by new AIStreamManager
  });

  describe('streamBatchResults', () => {
    it('should delegate to streamingManager.streamBatchResults', async () => {
      const batchResults = ['Translated text'];
      const originalBatch = ['Original text'];

      await AIStreamManager.streamBatchResults(
        'Gemini', batchResults, originalBatch, 0, messageId, mockEngine, 'en', 'fa'
      );

      expect(streamingManager.streamBatchResults).toHaveBeenCalledWith(
        messageId,
        batchResults,
        originalBatch,
        0,
        'en',
        'fa'
      );
    });

    it('should log warning if messageId is missing', async () => {
      await AIStreamManager.streamBatchResults('Gemini', [], [], 0, null, mockEngine);
      expect(streamingManager.streamBatchResults).not.toHaveBeenCalled();
    });
  });

  describe('sendStreamEnd', () => {
    it('should delegate to streamingManager.completeStream when translation completes', async () => {
      await AIStreamManager.sendStreamEnd('Gemini', messageId, mockEngine, { targetLanguage: 'fa' });

      expect(streamingManager.completeStream).toHaveBeenCalledWith(
        messageId,
        true,
        expect.objectContaining({
          targetLanguage: 'fa'
        })
      );
    });

    it('should pass success=false to completeStream if error is provided', async () => {
      const error = Object.assign(new Error('Quota Exceeded'), {
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'translation',
        providerName: 'Upstream Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true },
        cause: new Error('private'),
        arbitrary: { secret: true },
      });
      await AIStreamManager.sendStreamEnd('Gemini', messageId, mockEngine, { error });

      const streamEndOptions = streamingManager.completeStream.mock.calls[0][2];
      expect(streamingManager.completeStream).toHaveBeenCalledWith(
        messageId,
        false,
        expect.objectContaining({
          error: streamEndOptions.error,
          errorDetails: streamEndOptions.errorDetails,
        })
      );
      expect(streamEndOptions.error).toBe(streamEndOptions.errorDetails);
      expect(streamEndOptions.error).toMatchObject({
        message: 'Quota Exceeded',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'translation',
        providerName: 'Upstream Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true },
      });
      expect(streamEndOptions.error).not.toHaveProperty('cause');
      expect(streamEndOptions.error).not.toHaveProperty('arbitrary');
    });
  });

  describe('streamErrorResults', () => {
    it('should delegate to streamingManager.streamBatchError', async () => {
      const error = new Error('Partial failure');
      
      await AIStreamManager.streamErrorResults('Gemini', error, 2, messageId, mockEngine);

      expect(streamingManager.streamBatchError).toHaveBeenCalledWith(
        messageId,
        error,
        2
      );
    });
  });
});
