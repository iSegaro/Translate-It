import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TraditionalStreamManager } from './TraditionalStreamManager.js';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock("@/features/translation/core/StreamingManager.js", () => ({
  streamingManager: {
    streamBatchResults: vi.fn().mockResolvedValue(true),
    streamBatchError: vi.fn().mockResolvedValue(true),
    completeStream: vi.fn().mockResolvedValue(true)
  }
}));

describe('TraditionalStreamManager', () => {
  const messageId = 'msg-trad-123';
  const provider = 'Google';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('streamChunkResults', () => {
    it('should delegate streaming to streamingManager with correct arguments', async () => {
      const { streamingManager } = await import("@/features/translation/core/StreamingManager.js");
      const results = ['translated'];
      const originals = ['original'];

      await TraditionalStreamManager.streamChunkResults(
        provider, results, originals, 0, messageId, 'en', 'fa', 10, 8
      );

      expect(streamingManager.streamBatchResults).toHaveBeenCalledWith(
        messageId,
        results,
        originals,
        0,
        'en',
        'fa',
        10,
        8
      );
    });

    it('should handle errors gracefully without throwing', async () => {
      const { streamingManager } = await import("@/features/translation/core/StreamingManager.js");
      streamingManager.streamBatchResults.mockRejectedValue(new Error('Network error'));

      await expect(TraditionalStreamManager.streamChunkResults(
        provider, [], [], 0, messageId
      )).resolves.not.toThrow();
    });
  });

  describe('streamChunkError', () => {
    it('suppresses operation-abort chunk errors', async () => {
      const { streamingManager } = await import("@/features/translation/core/StreamingManager.js");
      const error = Object.assign(new Error('operation stopped'), {
        name: 'AbortError',
        operationAborted: true,
        cancellationReason: 'operation-abort',
      });

      await TraditionalStreamManager.streamChunkError(provider, error, 1, messageId);

      expect(streamingManager.streamBatchError).not.toHaveBeenCalled();
    });

    it('should delegate error streaming to streamingManager', async () => {
      const { streamingManager } = await import("@/features/translation/core/StreamingManager.js");
      const error = new Error('Chunk failed');

      await TraditionalStreamManager.streamChunkError(provider, error, 1, messageId);

      expect(streamingManager.streamBatchError).toHaveBeenCalledWith(
        messageId,
        error,
        1
      );
    });
  });

  describe('sendStreamEnd', () => {
    it('suppresses terminal publication for operation-abort error', async () => {
      const { streamingManager } = await import("@/features/translation/core/StreamingManager.js");
      const error = Object.assign(new Error('operation stopped'), {
        name: 'AbortError',
        operationAborted: true,
        cancellationReason: 'operation-abort',
      });

      await TraditionalStreamManager.sendStreamEnd(provider, messageId, { error });

      expect(streamingManager.completeStream).not.toHaveBeenCalled();
    });

    it('should delegate stream completion to streamingManager', async () => {
      const { streamingManager } = await import("@/features/translation/core/StreamingManager.js");
      const options = { targetLanguage: 'fa' };

      await TraditionalStreamManager.sendStreamEnd(provider, messageId, options);

      expect(streamingManager.completeStream).toHaveBeenCalledWith(
        messageId,
        true, // success
        options
      );
    });

    it('should indicate failure if error option is provided', async () => {
      const { streamingManager } = await import("@/features/translation/core/StreamingManager.js");
      const options = { error: new Error('Fatal') };

      await TraditionalStreamManager.sendStreamEnd(provider, messageId, options);

      const streamEndOptions = streamingManager.completeStream.mock.calls[0][2];
      expect(streamingManager.completeStream).toHaveBeenCalledWith(
        messageId,
        false, // success is false because error exists
        streamEndOptions
      );
      expect(streamEndOptions.error).toEqual(streamEndOptions.errorDetails);
      expect(streamEndOptions.error).toMatchObject({
        message: 'Fatal',
        type: 'TRANSLATION_ERROR',
        providerName: provider,
      });
      expect(streamEndOptions.error).not.toHaveProperty('cause');
      expect(streamEndOptions.error).not.toHaveProperty('arbitrary');
    });

    it('preserves rich canonical identity in both terminal error fields', async () => {
      const { streamingManager } = await import("@/features/translation/core/StreamingManager.js");
      const error = Object.assign(new Error('Provider failed'), {
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'popup',
        providerName: 'Upstream Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true },
        cause: new Error('private'),
        arbitrary: { ignored: true },
      });

      await TraditionalStreamManager.sendStreamEnd(provider, messageId, { error });

      const streamEndOptions = streamingManager.completeStream.mock.calls[0][2];
      expect(streamEndOptions.error).toBe(streamEndOptions.errorDetails);
      expect(streamEndOptions.error).toMatchObject({
        message: 'Provider failed',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'popup',
        providerName: 'Upstream Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true },
      });
      expect(streamEndOptions.error).not.toHaveProperty('cause');
      expect(streamEndOptions.error).not.toHaveProperty('arbitrary');
    });

    it('should handle stream-end delivery errors without throwing', async () => {
      const { streamingManager } = await import("@/features/translation/core/StreamingManager.js");
      streamingManager.completeStream.mockRejectedValue(new Error('Network error'));

      await expect(TraditionalStreamManager.sendStreamEnd(provider, messageId)).resolves.not.toThrow();
    });
  });
});
