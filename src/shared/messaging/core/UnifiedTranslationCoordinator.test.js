import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedTranslationCoordinator } from './UnifiedTranslationCoordinator.js';
import { streamingTimeoutManager } from './StreamingTimeoutManager.js';
import { sendRegularMessage } from './UnifiedMessaging.js';
import { MessageActions } from './MessageActions.js';
import { TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS } from '@/shared/constants/translation.js';

// Mock dependencies
vi.mock('./StreamingTimeoutManager.js', () => ({
  streamingTimeoutManager: {
    shouldContinue: vi.fn().mockReturnValue(true),
    getOperationState: vi.fn().mockReturnValue(null),
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
    it('preserves explicit user cancellation identity before coordination', async () => {
      streamingTimeoutManager.shouldContinue.mockReturnValue(false);
      streamingTimeoutManager.getOperationState.mockReturnValue({
        isCancelled: true,
        hasTimedOut: false,
        isCompleted: false
      });

      try {
        await expect(coordinator.coordinateTranslation({
          action: MessageActions.TRANSLATE,
          messageId: 'cancelled-before-start',
          data: { text: 'short' }
        })).rejects.toMatchObject({
          message: 'Translation cancelled by user',
          type: 'USER_CANCELLED'
        });
      } finally {
        streamingTimeoutManager.shouldContinue.mockReturnValue(true);
        streamingTimeoutManager.getOperationState.mockReturnValue(null);
      }
    });

    it('preserves timeout identity before coordination', async () => {
      streamingTimeoutManager.shouldContinue.mockReturnValue(false);
      streamingTimeoutManager.getOperationState.mockReturnValue({
        isCancelled: false,
        hasTimedOut: true,
        isCompleted: false
      });

      try {
        await expect(coordinator.coordinateTranslation({
          action: MessageActions.TRANSLATE,
          messageId: 'timed-out-before-start',
          data: { text: 'short' }
        })).rejects.toMatchObject({ type: 'TRANSLATION_TIMEOUT' });
      } finally {
        streamingTimeoutManager.shouldContinue.mockReturnValue(true);
        streamingTimeoutManager.getOperationState.mockReturnValue(null);
      }
    });

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

    it('preserves acceptance metadata from the initial streaming response', async () => {
      const message = {
        action: MessageActions.TRANSLATE,
        messageId: 'stream-acceptance',
        context: 'select-element',
        data: { text: 'a'.repeat(300), mode: 'select-element' },
      };
      sendRegularMessage.mockResolvedValue({
        success: true,
        streaming: true,
        conversationAcceptance: true,
      });
      const streamingResult = { success: true, type: 'stream_end', data: { success: true } };
      streamingTimeoutManager.registerStreamingOperation.mockResolvedValue(streamingResult);

      const result = await coordinator.coordinateTranslation(message);

      expect(result).toEqual({ ...streamingResult, conversationAcceptance: true });
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
    // Structured Content transport allowance is local to messaging/transport
    // policy (see UnifiedTranslationCoordinator). The watchdog must derive to
    // canonical batch execution budget + allowance.
    const STRUCTURED_TRANSPORT_ALLOWANCE_MS = 30000;

    it('keeps structured Select Element watchdog beyond the batch deadline', () => {
      const data = {
        text: JSON.stringify(Array.from({ length: 23 }, (_, index) => ({ t: `segment-${index}` }))),
        mode: 'select-element',
        options: { rawJsonPayload: true }
      };
      const timeouts = coordinator._calculateStreamingTimeouts(data);

      expect(timeouts).toEqual({
        initialTimeout: TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS + STRUCTURED_TRANSPORT_ALLOWANCE_MS,
        progressTimeout: TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS + STRUCTURED_TRANSPORT_ALLOWANCE_MS,
        gracePeriod: STRUCTURED_TRANSPORT_ALLOWANCE_MS,
        estimatedSegments: 23
      });
    });

    it('does not let custom transport timeout undercut structured execution budget', () => {
      const data = {
        text: JSON.stringify([{ t: 'segment' }]),
        mode: 'select_element',
        options: { rawJsonPayload: true }
      };

      expect(coordinator._calculateStreamingTimeouts(data, 90000)).toMatchObject({
        initialTimeout: TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS + STRUCTURED_TRANSPORT_ALLOWANCE_MS,
        progressTimeout: TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS + STRUCTURED_TRANSPORT_ALLOWANCE_MS,
        gracePeriod: STRUCTURED_TRANSPORT_ALLOWANCE_MS
      });
    });

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

    it('does not alter non-structured Select Element streaming policy', () => {
      const timeouts = coordinator._calculateStreamingTimeouts({
        text: 'a'.repeat(2000),
        mode: 'select-element'
      });

      expect(timeouts.progressTimeout).toBe(160000);
      expect(timeouts.initialTimeout).toBe(200000);
    });
  });

  describe('Cancellation', () => {
    it('should cancel active streaming translation', () => {
      const messageId = 'msg-to-cancel';
      // Manual entry into internal map for test
      coordinator.activeTranslations.set(messageId, { type: 'streaming' });
      
      coordinator.cancelTranslation(messageId, 'Test cancel');
      
      expect(streamingTimeoutManager.cancelStreaming).toHaveBeenCalledWith(messageId, 'Test cancel', false);
      expect(sendRegularMessage).toHaveBeenCalledWith(expect.objectContaining({
        action: MessageActions.CANCEL_TRANSLATION
      }));
    });

    it('turns a streaming timeout into exact-ID timeout cancellation', () => {
      const messageId = 'msg-timeout';
      coordinator.activeTranslations.set(messageId, { type: 'streaming' });

      coordinator._handleStreamingTimeout(messageId, { timeoutType: 'PROGRESS_TIMEOUT' });

      expect(streamingTimeoutManager.cancelStreaming).toHaveBeenCalledWith(messageId, 'Streaming translation timed out', true, 'PROGRESS_TIMEOUT');
      expect(sendRegularMessage).toHaveBeenCalledWith(expect.objectContaining({
        action: MessageActions.CANCEL_TRANSLATION,
        data: expect.objectContaining({ messageId, timeout: true, timeoutType: 'PROGRESS_TIMEOUT' })
      }));
      expect(coordinator.activeTranslations.has(messageId)).toBe(false);
    });
  });
});
