import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamingResponseHandler } from './StreamingResponseHandler.js';
import { MessageActions } from './MessageActions.js';

describe('StreamingResponseHandler', () => {
  let handler;
  let mockCoordinator;

  beforeEach(() => {
    mockCoordinator = {
      reportStreamingProgress: vi.fn(),
      completeStreamingOperation: vi.fn(),
      handleStreamingError: vi.fn()
    };
    handler = new StreamingResponseHandler(mockCoordinator);
  });

  it('should register a handler and process buffered messages', () => {
    const messageId = 'msg-1';
    const bufferedMessage = { action: MessageActions.TRANSLATION_STREAM_UPDATE, messageId, data: { text: 'buff' } };
    
    // Buffer a message before registration
    handler.handleMessage(bufferedMessage);
    
    const onStreamUpdate = vi.fn();
    handler.registerHandler(messageId, { onStreamUpdate });
    
    expect(onStreamUpdate).toHaveBeenCalledWith(bufferedMessage.data);
    expect(mockCoordinator.reportStreamingProgress).toHaveBeenCalled();
  });

  it('should handle TRANSLATION_STREAM_UPDATE messages', () => {
    const messageId = 'msg-2';
    const onStreamUpdate = vi.fn();
    handler.registerHandler(messageId, { onStreamUpdate });
    
    const message = { action: MessageActions.TRANSLATION_STREAM_UPDATE, messageId, data: { text: 'chunk' } };
    handler.handleMessage(message);
    
    expect(onStreamUpdate).toHaveBeenCalledWith(message.data);
    expect(mockCoordinator.reportStreamingProgress).toHaveBeenCalledWith(messageId, expect.objectContaining({
      type: 'stream_update'
    }));
  });

  it('should handle TRANSLATION_STREAM_END messages', () => {
    const messageId = 'msg-3';
    const onStreamEnd = vi.fn();
    handler.registerHandler(messageId, { onStreamEnd });
    
    const message = { action: MessageActions.TRANSLATION_STREAM_END, messageId, data: { success: true } };
    handler.handleMessage(message);
    
    expect(onStreamEnd).toHaveBeenCalledWith(message.data);
    expect(mockCoordinator.completeStreamingOperation).toHaveBeenCalledWith(messageId, expect.objectContaining({
      success: true,
      type: 'stream_end'
    }));
  });

  it('should handle TRANSLATION_RESULT_UPDATE messages', () => {
    const messageId = 'msg-4';
    const onTranslationResult = vi.fn();
    handler.registerHandler(messageId, { onTranslationResult });
    
    const message = { action: MessageActions.TRANSLATION_RESULT_UPDATE, messageId, data: { success: true, text: 'final' } };
    handler.handleMessage(message);
    
    expect(onTranslationResult).toHaveBeenCalledWith(message.data);
    expect(mockCoordinator.completeStreamingOperation).toHaveBeenCalledWith(messageId, expect.objectContaining({
      success: true,
      type: 'translation_result'
    }));
  });

  it('should handle errors in handlers gracefully', () => {
    const messageId = 'msg-5';
    const onStreamUpdate = vi.fn(() => { throw new Error('Callback failed'); });
    handler.registerHandler(messageId, { onStreamUpdate });
    
    const message = { action: MessageActions.TRANSLATION_STREAM_UPDATE, messageId, data: {} };
    handler.handleMessage(message);
    
    expect(onStreamUpdate).toHaveBeenCalled();
    // Coordinator should still have received progress before the callback threw
    expect(mockCoordinator.reportStreamingProgress).toHaveBeenCalled();
  });
});
