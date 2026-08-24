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

  it('reconstructs stream-end errors with canonical identity on Error', () => {
    const messageId = 'msg-stream-error';
    handler.registerHandler(messageId);
    const errorData = {
      message: 'Provider failed',
      type: 'PROVIDER_ERROR',
      originalType: 'HTTP_ERROR',
      statusCode: 502,
      context: 'stream',
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'UPSTREAM_FAILURE',
      errorCode: 'E_UPSTREAM',
      cause: 'private',
      arbitrary: { ignored: true }
    };

    handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: { success: false, error: errorData }
    });

    const error = mockCoordinator.handleStreamingError.mock.calls[0][1];
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      message: 'Provider failed',
      type: 'PROVIDER_ERROR',
      originalType: 'HTTP_ERROR',
      statusCode: 502,
      context: 'stream',
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'UPSTREAM_FAILURE',
      errorCode: 'E_UPSTREAM'
    });
    expect(error).not.toHaveProperty('cause');
    expect(error).not.toHaveProperty('arbitrary');
    expect(error.streamData.error).toEqual(errorData);
  });

  it('prefers canonical errorDetails over legacy error on stream end', () => {
    const messageId = 'msg-details-wins';
    handler.registerHandler(messageId);

    handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: {
        success: false,
        error: { message: 'legacy failure', type: 'LEGACY_ERROR' },
        errorDetails: { message: 'canonical failure', type: 'MODEL_NOT_FOUND' }
      }
    });

    const error = mockCoordinator.handleStreamingError.mock.calls[0][1];
    expect(error).toMatchObject({ message: 'canonical failure', type: 'MODEL_NOT_FOUND' });
  });

  it('falls back to legacy error when errorDetails is malformed on stream end', () => {
    const messageId = 'msg-malformed-details';
    handler.registerHandler(messageId);

    handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: {
        success: false,
        error: { message: 'legacy failure', type: 'LEGACY_ERROR' },
        errorDetails: { arbitrary: true }
      }
    });

    const error = mockCoordinator.handleStreamingError.mock.calls[0][1];
    expect(error).toMatchObject({ message: 'legacy failure', type: 'LEGACY_ERROR' });
  });

  it('returns true when active handler accepts TRANSLATION_RESULT_UPDATE', () => {
    const messageId = 'msg-4';
    const onTranslationResult = vi.fn();
    handler.registerHandler(messageId, { onTranslationResult });
    
    const message = { action: MessageActions.TRANSLATION_RESULT_UPDATE, messageId, data: { success: true, text: 'final' } };
    const handled = handler.handleMessage(message);
    
    expect(handled).toBe(true);
    expect(onTranslationResult).toHaveBeenCalledWith(message.data);
    expect(mockCoordinator.completeStreamingOperation).toHaveBeenCalledWith(messageId, expect.objectContaining({
      success: true,
      type: 'translation_result'
    }));
  });

  it('keeps successful streaming acknowledgements non-terminal', () => {
    const messageId = 'msg-streaming-ack';
    const onTranslationResult = vi.fn();
    handler.registerHandler(messageId, { onTranslationResult });

    handler.handleMessage({
      action: MessageActions.TRANSLATION_RESULT_UPDATE,
      messageId,
      data: { success: true, streaming: true },
    });

    expect(onTranslationResult).toHaveBeenCalledOnce();
    expect(mockCoordinator.completeStreamingOperation).not.toHaveBeenCalled();
    expect(mockCoordinator.handleStreamingError).not.toHaveBeenCalled();
    expect(handler.getHandlerInfo(messageId)).not.toBeNull();
  });

  it('treats failed streaming result as terminal and cleans handler', () => {
    const messageId = 'msg-streaming-failure';
    const onTranslationResult = vi.fn();
    handler.registerHandler(messageId, { onTranslationResult });

    handler.handleMessage({
      action: MessageActions.TRANSLATION_RESULT_UPDATE,
      messageId,
      data: {
        success: false,
        streaming: true,
        error: { message: 'stream failed', type: 'NETWORK_ERROR' },
      },
    });

    expect(onTranslationResult).toHaveBeenCalledOnce();
    expect(mockCoordinator.handleStreamingError).toHaveBeenCalledOnce();
    expect(mockCoordinator.completeStreamingOperation).not.toHaveBeenCalled();
    expect(handler.getHandlerInfo(messageId)).toBeNull();
  });

  it('preserves typed internal abort provenance on terminal streaming result', () => {
    const messageId = 'msg-streaming-typed-abort';
    handler.registerHandler(messageId);

    handler.handleMessage({
      action: MessageActions.TRANSLATION_RESULT_UPDATE,
      messageId,
      data: {
        success: false,
        streaming: true,
        errorDetails: {
          message: 'timed out',
          type: 'TRANSLATION_TIMEOUT',
          operationAborted: true,
          cancellationReason: 'operation-abort',
        },
      },
    });

    const error = mockCoordinator.handleStreamingError.mock.calls[0][1];
    expect(error).toMatchObject({
      type: 'TRANSLATION_TIMEOUT',
      operationAborted: true,
      cancellationReason: 'operation-abort',
    });
    expect(handler.getHandlerInfo(messageId)).toBeNull();
  });

  it('buffers result when no active handler exists and replays after registration', () => {
    const message = {
      action: MessageActions.TRANSLATION_RESULT_UPDATE,
      messageId: 'unknown-result',
      data: { success: true },
    };

    expect(handler.handleMessage(message)).toBe(false);

    const onTranslationResult = vi.fn();
    handler.registerHandler(message.messageId, { onTranslationResult });

    expect(onTranslationResult).toHaveBeenCalledWith(message.data);
  });

  it('returns false when completed handler receives duplicate result', () => {
    const messageId = 'completed-result';
    handler.registerHandler(messageId);
    const message = {
      action: MessageActions.TRANSLATION_RESULT_UPDATE,
      messageId,
      data: { success: true },
    };

    expect(handler.handleMessage(message)).toBe(true);
    expect(handler.handleMessage(message)).toBe(false);
  });

  it('reconstructs translation-result errors with canonical identity on Error', () => {
    const messageId = 'msg-result-error';
    handler.registerHandler(messageId);

    handler.handleMessage({
      action: MessageActions.TRANSLATION_RESULT_UPDATE,
      messageId,
      data: {
        success: false,
        error: {
          message: 'Invalid response',
          type: 'VALIDATION',
          originalType: 'PROVIDER_ERROR',
          statusCode: 422,
          context: 'translation-result',
          providerName: 'Provider',
          providerId: 'provider-id',
          code: 'INVALID_RESULT',
          errorCode: 'E_RESULT'
        }
      }
    });

    const error = mockCoordinator.handleStreamingError.mock.calls[0][1];
    expect(error).toMatchObject({
      message: 'Invalid response',
      type: 'VALIDATION',
      originalType: 'PROVIDER_ERROR',
      statusCode: 422,
      context: 'translation-result',
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'INVALID_RESULT',
      errorCode: 'E_RESULT'
    });
    expect(error.translationData.error).toEqual(expect.objectContaining({ type: 'VALIDATION' }));
  });

  it('prefers canonical errorDetails over legacy error on translation result', () => {
    const messageId = 'msg-result-details';
    handler.registerHandler(messageId);

    handler.handleMessage({
      action: MessageActions.TRANSLATION_RESULT_UPDATE,
      messageId,
      data: {
        success: false,
        error: { message: 'legacy failure', type: 'LEGACY_ERROR' },
        errorDetails: { message: 'canonical failure', type: 'MODEL_NOT_FOUND' }
      }
    });

    const error = mockCoordinator.handleStreamingError.mock.calls[0][1];
    expect(error).toMatchObject({ message: 'canonical failure', type: 'MODEL_NOT_FOUND' });
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
