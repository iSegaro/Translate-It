import { describe, it, expect, vi, afterEach } from 'vitest';
import { UnifiedTranslationCoordinator } from './UnifiedTranslationCoordinator.js';
import { streamingTimeoutManager } from './StreamingTimeoutManager.js';

vi.mock('./UnifiedMessaging.js', () => ({
  sendRegularMessage: vi.fn().mockResolvedValue({ success: true }),
}));

describe('UnifiedTranslationCoordinator cancellation boundary', () => {
  afterEach(() => {
    streamingTimeoutManager.cleanup();
  });

  it('keeps coordinator cleanup internal at StreamingTimeoutManager boundary', async () => {
    const messageId = 'coordinator-cleanup-stream';
    const streamPromise = streamingTimeoutManager.registerStreamingOperation(messageId, 5000);
    const coordinator = new UnifiedTranslationCoordinator();

    coordinator.activeTranslations.set(messageId, { type: 'streaming', message: { messageId } });
    coordinator.streamingOperations.add(messageId);
    coordinator.cleanup();

    const result = await streamPromise;
    expect(result.error).toMatchObject({
      operationAborted: true,
      cancellationReason: 'System cleanup',
    });
    expect(result.error.type).not.toBe('USER_CANCELLED');
    expect(streamingTimeoutManager.isStreaming(messageId)).toBe(false);
  });
});
