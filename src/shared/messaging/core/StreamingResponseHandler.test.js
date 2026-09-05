import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  afterEach(() => {
    vi.useRealTimers();
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

  it('marks a stream terminal before removing its handler', () => {
    const messageId = 'terminal-order';
    const originalCleanup = handler._cleanupHandler.bind(handler);
    const cleanupSpy = vi.spyOn(handler, '_cleanupHandler').mockImplementation((id) => {
      expect(handler.terminalStreams.has(id)).toBe(true);
      originalCleanup(id);
    });
    handler.registerHandler(messageId);

    expect(handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: { success: true },
    })).toBe(true);

    expect(cleanupSpy).toHaveBeenCalledWith(messageId);
    expect(handler.getHandlerInfo(messageId)).toBeNull();
  });

  it.each([
    ['success', { success: true }],
    ['error', { success: false, error: { message: 'failed', type: 'NETWORK_ERROR' } }],
    ['timeout', { success: false, error: { message: 'timed out', type: 'TRANSLATION_TIMEOUT' } }],
  ])('does not buffer a late chunk after %s terminal state', (_state, data) => {
    const messageId = `late-${_state}`;
    handler.registerHandler(messageId);

    expect(handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data,
    })).toBe(true);
    expect(handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_UPDATE,
      messageId,
      data: { text: 'late' },
    })).toBe(false);

    expect(handler.messageBuffer.has(messageId)).toBe(false);
    expect(handler.terminalStreams.has(messageId)).toBe(true);
  });

  it('promotes acceptance metadata from stream end data', () => {
    const messageId = 'msg-acceptance-end';
    handler.registerHandler(messageId, { onStreamEnd: vi.fn() });

    handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: { success: true, conversationAcceptance: true },
    });

    expect(mockCoordinator.completeStreamingOperation).toHaveBeenCalledWith(messageId, expect.objectContaining({
      conversationAcceptance: true,
      data: expect.objectContaining({ conversationAcceptance: true }),
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
    expect(handler.messageBuffer.has(message.messageId)).toBe(false);
    expect(handler.terminalStreams.has(message.messageId)).toBe(true);
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
    expect(handler.messageBuffer.has(messageId)).toBe(false);
  });

  it('does not buffer messages after local handler cancellation', () => {
    const messageId = 'cancelled-handler';
    handler.registerHandler(messageId);

    expect(handler.cancelHandler(messageId)).toBe(true);
    expect(handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_UPDATE,
      messageId,
      data: { text: 'late' },
    })).toBe(false);

    expect(handler.messageBuffer.has(messageId)).toBe(false);
    expect(handler.terminalStreams.has(messageId)).toBe(true);
  });

  it('clears a terminal tombstone on explicit re-registration', () => {
    const messageId = 're-registered-stream';
    handler.registerHandler(messageId);
    handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: { success: true },
    });

    const onStreamUpdate = vi.fn();
    handler.registerHandler(messageId, { onStreamUpdate });

    expect(handler.terminalStreams.has(messageId)).toBe(false);
    expect(handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_UPDATE,
      messageId,
      data: { text: 'new stream' },
    })).toBe(true);
    expect(onStreamUpdate).toHaveBeenCalledWith({ text: 'new stream' });
  });

  it.each([
    ['duplicate success', { success: true }, { success: true }],
    ['error then success', { success: false, error: { message: 'failed' } }, { success: true }],
    ['success then error', { success: true }, { success: false, error: { message: 'failed' } }],
  ])('does not buffer %s terminal delivery', (_case, firstData, secondData) => {
    const messageId = `duplicate-${_case}`;
    const onStreamEnd = vi.fn();
    handler.registerHandler(messageId, { onStreamEnd });

    expect(handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: firstData,
    })).toBe(true);
    expect(handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: secondData,
    })).toBe(false);

    expect(onStreamEnd).toHaveBeenCalledOnce();
    expect(handler.messageBuffer.has(messageId)).toBe(false);
  });

  it('bounds unknown stream IDs with oldest-first eviction', () => {
    for (let index = 0; index < 101; index++) {
      handler.handleMessage({
        action: MessageActions.TRANSLATION_STREAM_UPDATE,
        messageId: `unknown-${index}`,
        data: { index },
      });
    }

    expect(handler.messageBuffer.size).toBe(100);
    expect(handler.messageBuffer.has('unknown-0')).toBe(false);
    expect(handler.messageBuffer.has('unknown-1')).toBe(true);
    expect(handler.messageBuffer.has('unknown-100')).toBe(true);
  });

  it('keeps the existing 50-message per-ID buffer limit', () => {
    const messageId = 'per-id-limit';

    for (let index = 0; index < 51; index++) {
      handler.handleMessage({
        action: MessageActions.TRANSLATION_STREAM_UPDATE,
        messageId,
        data: { index },
      });
    }

    const buffer = handler.messageBuffer.get(messageId);
    expect(buffer).toHaveLength(50);
    expect(buffer[0].message.data.index).toBe(1);
    expect(buffer.at(-1).message.data.index).toBe(50);
  });

  it('expires buffered unknown messages after 60 seconds', () => {
    vi.useFakeTimers();
    const messageId = 'expired-buffer';
    const onStreamUpdate = vi.fn();

    handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_UPDATE,
      messageId,
      data: { text: 'stale' },
    });
    vi.advanceTimersByTime(60_001);
    handler.registerHandler(messageId, { onStreamUpdate });

    expect(onStreamUpdate).not.toHaveBeenCalled();
    expect(handler.messageBuffer.has(messageId)).toBe(false);
  });

  it('expires terminal tombstones and resumes unknown buffering', () => {
    vi.useFakeTimers();
    const messageId = 'expired-terminal';
    handler.registerHandler(messageId);
    handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: { success: true },
    });

    vi.advanceTimersByTime(60_001);
    expect(handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_UPDATE,
      messageId,
      data: { text: 'after expiry' },
    })).toBe(false);

    expect(handler.terminalStreams.has(messageId)).toBe(false);
    expect(handler.messageBuffer.has(messageId)).toBe(true);
  });

  it('bounds terminal tombstones with oldest-first eviction', () => {
    for (let index = 0; index < 1001; index++) {
      const messageId = `terminal-${index}`;
      handler.registerHandler(messageId);
      handler.handleMessage({
        action: MessageActions.TRANSLATION_STREAM_END,
        messageId,
        data: { success: true },
      });
    }

    expect(handler.terminalStreams.size).toBe(1000);
    expect(handler.terminalStreams.has('terminal-0')).toBe(false);
    expect(handler.terminalStreams.has('terminal-1')).toBe(true);
    expect(handler.terminalStreams.has('terminal-1000')).toBe(true);
  });

  it('clears all streaming state during global cleanup', () => {
    handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_UPDATE,
      messageId: 'buffered-before-cleanup',
      data: { text: 'buffered' },
    });
    handler.registerHandler('active-before-cleanup');
    handler.handleMessage({
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId: 'active-before-cleanup',
      data: { success: true },
    });
    handler.registerHandler('active-handler');

    handler.cleanup();

    expect(handler.activeHandlers.size).toBe(0);
    expect(handler.messageBuffer.size).toBe(0);
    expect(handler.terminalStreams.size).toBe(0);
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
