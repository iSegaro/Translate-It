import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedTranslationCoordinator } from './UnifiedTranslationCoordinator.js';
import { streamingTimeoutManager } from './StreamingTimeoutManager.js';
import { sendRegularMessage } from './UnifiedMessaging.js';
import { MessageActions } from './MessageActions.js';

// Mock dependencies
vi.mock('./StreamingTimeoutManager.js', () => ({
  streamingTimeoutManager: {
    shouldContinue: vi.fn().mockReturnValue(true),
    registerStreamingOperation: vi.fn(),
    completeStreaming: vi.fn(),
    cancelStreaming: vi.fn(),
    reportProgress: vi.fn(),
    errorStreaming: vi.fn(),
    cleanup: vi.fn(),
    getStatus: vi.fn()
  }
}));

vi.mock('./UnifiedMessaging.js', () => ({
  sendRegularMessage: vi.fn()
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

describe('UnifiedTranslationCoordinator', () => {
  let coordinator;

  beforeEach(() => {
    vi.clearAllMocks();
    coordinator = new UnifiedTranslationCoordinator();
  });

  describe('coordinateTranslation', () => {
    it('should use regular translation for small texts', async () => {
      const message = { 
        action: MessageActions.TRANSLATE, 
        messageId: '1', 
        data: { text: 'short' } 
      };
      sendRegularMessage.mockResolvedValue({ success: true, text: 'سلام' });

      const result = await coordinator.coordinateTranslation(message);

      expect(sendRegularMessage).toHaveBeenCalledWith(message, {});
      expect(result.success).toBe(true);
      expect(streamingTimeoutManager.registerStreamingOperation).not.toHaveBeenCalled();
    });

    it('should use streaming for long texts in select-element mode', async () => {
      const longText = 'a'.repeat(300);
      const message = { 
        action: MessageActions.TRANSLATE, 
        messageId: 'stream-1', 
        context: 'select-element',
        data: { text: longText, mode: 'select-element' } 
      };
      
      // Initial response indicates streaming started
      sendRegularMessage.mockResolvedValue({ success: true, streaming: true });
      
      // Streaming promise mock
      const streamingResult = { success: true, text: 'translated long text' };
      streamingTimeoutManager.registerStreamingOperation.mockResolvedValue(streamingResult);

      const result = await coordinator.coordinateTranslation(message);

      expect(streamingTimeoutManager.registerStreamingOperation).toHaveBeenCalled();
      expect(result).toEqual(streamingResult);
    });

    it('should fallback to regular translation if streaming is not initiated', async () => {
      const longText = 'a'.repeat(300);
      const message = { 
        action: MessageActions.TRANSLATE, 
        messageId: 'fallback-1', 
        context: 'select-element',
        data: { text: longText } 
      };
      
      // Initial response is just a regular response
      const regularResult = { success: true, text: 'regular translated' };
      sendRegularMessage.mockResolvedValue(regularResult);

      const result = await coordinator.coordinateTranslation(message);

      expect(streamingTimeoutManager.registerStreamingOperation).toHaveBeenCalled();
      expect(result).toEqual(regularResult);
    });
  });

  describe('Timeout Calculation', () => {
    it('should calculate longer timeouts for select-element mode', () => {
      const data = { text: 'a'.repeat(2000), mode: 'select-element' };
      const timeouts = coordinator._calculateStreamingTimeouts(data);
      
      expect(timeouts.initialTimeout).toBeGreaterThanOrEqual(90000);
    });

    it('should calculate appropriate timeouts for regular long text', () => {
      const data = { text: 'a'.repeat(5000) };
      const timeouts = coordinator._calculateStreamingTimeouts(data);
      
      expect(timeouts.initialTimeout).toBeLessThan(300000);
    });
  });

  describe('Cancellation', () => {
    it('should cancel active streaming translation', () => {
      const messageId = 'msg-to-cancel';
      // Manual entry into internal map for test
      coordinator.activeTranslations.set(messageId, { type: 'streaming' });
      
      coordinator.cancelTranslation(messageId, 'Test cancel');
      
      expect(streamingTimeoutManager.cancelStreaming).toHaveBeenCalledWith(messageId, 'Test cancel');
      expect(sendRegularMessage).toHaveBeenCalledWith(expect.objectContaining({
        action: MessageActions.CANCEL_TRANSLATION
      }));
    });
  });
});
