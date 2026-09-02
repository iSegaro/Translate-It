import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamingTimeoutManager } from './StreamingTimeoutManager.js';

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock ErrorHandler and ErrorMatcher using central mocks
vi.mock('@/shared/error-management/ErrorHandler.js');
vi.mock('@/shared/error-management/ErrorMatcher.js');
vi.mock('@/shared/logging/logger.js', () => ({ getScopedLogger: () => loggerMock }));

describe('StreamingTimeoutManager', () => {
  let manager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new StreamingTimeoutManager();
  });

  afterEach(() => {
    manager.cleanup();
    vi.useRealTimers();
  });

  it('should register a streaming operation and return a promise', async () => {
    const messageId = 'msg-1';
    const promise = manager.registerStreamingOperation(messageId, 5000);
    
    expect(manager.isStreaming(messageId)).toBe(true);
    expect(promise).toBeInstanceOf(Promise);
  });

  it('rejects duplicate registration before replacing active state', async () => {
    const messageId = 'duplicate-stream';
    const firstPromise = manager.registerStreamingOperation(messageId, 5000);
    const firstState = manager.activeStreams.get(messageId);
    const firstController = manager.abortControllers.get(messageId);
    const firstTimeouts = manager.timeoutHandles.get(messageId);
    const firstProgress = manager.progressTrackers.get(messageId);

    await expect(manager.registerStreamingOperation(messageId, 5000)).rejects.toMatchObject({
      type: 'already_executing',
    });
    expect(manager.isStreaming(messageId)).toBe(true);
    expect(manager.activeStreams.get(messageId)).toBe(firstState);
    expect(manager.abortControllers.get(messageId)).toBe(firstController);
    expect(manager.timeoutHandles.get(messageId)).toBe(firstTimeouts);
    expect(manager.progressTrackers.get(messageId)).toBe(firstProgress);

    manager.cancelStreaming(messageId);
    await expect(firstPromise).resolves.toMatchObject({ cancelled: true });
  });

  it('should resolve the promise when streaming completes', async () => {
    const messageId = 'msg-2';
    const promise = manager.registerStreamingOperation(messageId, 5000);
    const result = { success: true, text: 'completed' };
    
    manager.completeStreaming(messageId, result);
    
    await expect(promise).resolves.toEqual(result);
    expect(manager.isStreaming(messageId)).toBe(false);
  });

  it('exposes cancellation, timeout, and completion state without collapsing it', async () => {
    const messageId = 'state-query';
    manager.activeStreams.set(messageId, {
      isCancelled: true,
      hasTimedOut: false,
      isCompleted: false,
    });

    expect(manager.getOperationState(messageId)).toEqual({
      isCancelled: true,
      hasTimedOut: false,
      isCompleted: false,
    });

    manager.activeStreams.set(messageId, {
      isCancelled: false,
      hasTimedOut: true,
      isCompleted: false,
    });
    expect(manager.getOperationState(messageId)).toEqual({
      isCancelled: false,
      hasTimedOut: true,
      isCompleted: false,
    });

    manager.activeStreams.set(messageId, {
      isCancelled: false,
      hasTimedOut: false,
      isCompleted: true,
    });
    expect(manager.getOperationState(messageId)).toEqual({
      isCancelled: false,
      hasTimedOut: false,
      isCompleted: true,
    });
  });

  it('settles completion when its observer throws', async () => {
    const onComplete = vi.fn(() => { throw new Error('completion observer failed'); });
    const onTimeout = vi.fn();
    const promise = manager.registerStreamingOperation('complete-observer-error', 5000, { onComplete, onTimeout });
    const result = { success: true, text: 'completed' };

    manager.completeStreaming('complete-observer-error', result);

    await expect(promise).resolves.toEqual(result);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(manager.isStreaming('complete-observer-error')).toBe(false);
    expect(loggerMock.warn).toHaveBeenCalled();
    vi.advanceTimersByTime(6000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('settles error and cancellation results when onError throws', async () => {
    const onError = vi.fn(() => { throw new Error('error observer failed'); });
    const error = new Error('stream failed');
    const failed = manager.registerStreamingOperation('error-observer-error', 5000, { onError });

    manager.errorStreaming('error-observer-error', error);
    await expect(failed).resolves.toMatchObject({ success: false, error });
    expect(manager.isStreaming('error-observer-error')).toBe(false);

    const cancelled = manager.registerStreamingOperation('cancel-observer-error', 5000, { onError });
    manager.cancelStreaming('cancel-observer-error', 'user-cancelled');
    await expect(cancelled).resolves.toMatchObject({ success: false, cancelled: true, reason: 'user-cancelled' });
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it('settles timeout when timeout and error observers throw', async () => {
    const onTimeout = vi.fn(() => { throw new Error('timeout observer failed'); });
    const onError = vi.fn(() => { throw new Error('error observer failed'); });
    const promise = manager.registerStreamingOperation('timeout-observer-error', 5000, { onTimeout, onError });

    vi.advanceTimersByTime(5000);

    await expect(promise).resolves.toMatchObject({ success: false, timedOut: true });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(manager.isStreaming('timeout-observer-error')).toBe(false);
  });

  it('keeps progress reset and terminal callback order when observers throw', async () => {
    const onProgress = vi.fn(() => { throw new Error('progress observer failed'); });
    const order = [];
    const promise = manager.registerStreamingOperation('progress-observer-error', 300000, {
      maxProgressTimeout: 5000,
      onProgress,
      onComplete: () => order.push('callback'),
    });
    promise.then(() => order.push('settled'));

    manager.reportProgress('progress-observer-error');
    vi.advanceTimersByTime(4999);
    expect(manager.isStreaming('progress-observer-error')).toBe(true);
    manager.completeStreaming('progress-observer-error', { success: true });
    await promise;

    expect(order).toEqual(['callback', 'settled']);
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it('isolates a throwing terminal observer from concurrent streams', async () => {
    const failing = manager.registerStreamingOperation('observer-fails', 5000, {
      onComplete: () => { throw new Error('observer failed'); },
    });
    const normal = manager.registerStreamingOperation('observer-normal', 5000);

    manager.completeStreaming('observer-fails', { success: true });
    manager.completeStreaming('observer-normal', { success: true, text: 'normal' });

    await expect(failing).resolves.toMatchObject({ success: true });
    await expect(normal).resolves.toEqual({ success: true, text: 'normal' });
  });

  it('should reject (via resolve with error) when streaming fails', async () => {
    const messageId = 'msg-3';
    const promise = manager.registerStreamingOperation(messageId, 5000);
    const error = new Error('Streaming failed');
    
    manager.errorStreaming(messageId, error);
    
    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
  });

  it('should handle timeout when no progress is made', async () => {
    const messageId = 'msg-4';
    const onTimeout = vi.fn();
    const promise = manager.registerStreamingOperation(messageId, 5000, { onTimeout });
    
    // Advance time past initial timeout
    vi.advanceTimersByTime(6000);
    
    const result = await promise;
    expect(result).toMatchObject({
      success: false,
      timedOut: true,
      cancelled: false,
      type: 'TRANSLATION_TIMEOUT',
      timeoutType: 'FINAL_TIMEOUT'
    });
    expect(onTimeout).toHaveBeenCalled();
  });

  it('should extend timeout with grace period if progress is reported', async () => {
    const messageId = 'msg-5';
    const promise = manager.registerStreamingOperation(messageId, 5000, { 
      gracePeriod: 3000 
    });
    
    // Report progress just before initial timeout
    vi.advanceTimersByTime(4000);
    manager.reportProgress(messageId, { chunk: 'part 1' });
    
    // Advance past initial timeout
    vi.advanceTimersByTime(2000); // Total 6000, initial was 5000
    
    // Should still be streaming due to grace period
    expect(manager.isStreaming(messageId)).toBe(true);
    
    // Advance past grace period
    vi.advanceTimersByTime(2000); // Total 8000, initial+grace was 5000+3000
    
    const result = await promise;
    expect(result.timedOut).toBe(true);
  });

  it('should handle progress timeout if no progress for a long time', async () => {
    const messageId = 'msg-6';
    const promise = manager.registerStreamingOperation(messageId, 60000, { 
      maxProgressTimeout: 5000 
    });
    
    // Wait for progress timeout
    vi.advanceTimersByTime(6000);
    
    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error.type).toBe('TRANSLATION_TIMEOUT');
    expect(result.error.timeoutType).toBe('PROGRESS_TIMEOUT');
    expect(result).toMatchObject({
      timedOut: true,
      cancelled: false,
      type: 'TRANSLATION_TIMEOUT',
      timeoutType: 'PROGRESS_TIMEOUT'
    });
  });

  it('resets progress timeout with the configured long duration', async () => {
    const onTimeout = vi.fn();
    const promise = manager.registerStreamingOperation('progress-long', 300000, {
      maxProgressTimeout: 160000,
      onTimeout,
    });

    manager.reportProgress('progress-long');
    vi.advanceTimersByTime(60000);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100000);
    await expect(promise).resolves.toMatchObject({ timedOut: true });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not timeout a silent structured operation at the former 160-second deadline', async () => {
    const onTimeout = vi.fn();
    const promise = manager.registerStreamingOperation('structured-silent', 330000, {
      maxProgressTimeout: 330000,
      onTimeout,
    });

    vi.advanceTimersByTime(160000);

    expect(manager.isStreaming('structured-silent')).toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(170000);
    await expect(promise).resolves.toMatchObject({
      timedOut: true,
      type: 'TRANSLATION_TIMEOUT',
      timeoutType: 'FINAL_TIMEOUT'
    });
  });

  it('resets progress timeout with the configured short duration', async () => {
    const onTimeout = vi.fn();
    const promise = manager.registerStreamingOperation('progress-short', 300000, {
      maxProgressTimeout: 5000,
      onTimeout,
    });

    manager.reportProgress('progress-short');
    vi.advanceTimersByTime(4999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await expect(promise).resolves.toMatchObject({ timedOut: true });
  });

  it('preserves the default progress timeout after an update', async () => {
    const onTimeout = vi.fn();
    const promise = manager.registerStreamingOperation('progress-default', 300000, { onTimeout });

    manager.reportProgress('progress-default');
    vi.advanceTimersByTime(59999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await expect(promise).resolves.toMatchObject({ timedOut: true });
  });

  it('restarts the configured progress deadline after every update', async () => {
    const onTimeout = vi.fn();
    const promise = manager.registerStreamingOperation('progress-reset', 300000, {
      maxProgressTimeout: 5000,
      onTimeout,
    });

    manager.reportProgress('progress-reset');
    vi.advanceTimersByTime(4000);
    manager.reportProgress('progress-reset');
    vi.advanceTimersByTime(4999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await expect(promise).resolves.toMatchObject({ timedOut: true });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('keeps configured progress timeouts isolated per message', async () => {
    const onShortTimeout = vi.fn();
    const onLongTimeout = vi.fn();
    const short = manager.registerStreamingOperation('stream-short', 300000, { maxProgressTimeout: 5000, onTimeout: onShortTimeout });
    const long = manager.registerStreamingOperation('stream-long', 300000, { maxProgressTimeout: 160000, onTimeout: onLongTimeout });

    manager.reportProgress('stream-short');
    manager.reportProgress('stream-long');
    vi.advanceTimersByTime(5000);
    await expect(short).resolves.toMatchObject({ timedOut: true });
    expect(onLongTimeout).not.toHaveBeenCalled();
    manager.cancelStreaming('stream-long');
    await long;
  });

  it('clears a reset progress timeout on completion and cancellation', async () => {
    const completeTimeout = vi.fn();
    const completed = manager.registerStreamingOperation('progress-complete', 300000, { maxProgressTimeout: 5000, onTimeout: completeTimeout });
    manager.reportProgress('progress-complete');
    manager.completeStreaming('progress-complete', { success: true });
    vi.advanceTimersByTime(5000);
    await completed;
    expect(completeTimeout).not.toHaveBeenCalled();

    const cancelledTimeout = vi.fn();
    const cancelled = manager.registerStreamingOperation('progress-cancel', 300000, { maxProgressTimeout: 5000, onTimeout: cancelledTimeout });
    manager.reportProgress('progress-cancel');
    manager.cancelStreaming('progress-cancel');
    vi.advanceTimersByTime(5000);
    await cancelled;
    expect(cancelledTimeout).not.toHaveBeenCalled();
  });

  it('should handle manual cancellation', async () => {
    const messageId = 'msg-7';
    const promise = manager.registerStreamingOperation(messageId, 5000);
    
    manager.cancelStreaming(messageId, 'user-cancelled');
    
    const result = await promise;
    expect(result).toMatchObject({
      success: false,
      cancelled: true,
      timedOut: false,
      type: 'USER_CANCELLED',
      reason: 'user-cancelled'
    });
    expect(manager.isStreaming(messageId)).toBe(false);
  });

  it('preserves internal lifecycle cancellation provenance', async () => {
    const messageId = 'internal-cleanup';
    const promise = manager.registerStreamingOperation(messageId, 5000);

    manager.cancelStreaming(messageId, 'lifecycle-cleanup');

    const result = await promise;
    expect(result).toMatchObject({
      success: false,
      cancelled: false,
      timedOut: false,
      error: {
        operationAborted: true,
        cancellationReason: 'lifecycle-cleanup',
      },
    });
    expect(result.error.type).not.toBe('USER_CANCELLED');
    expect(manager.isStreaming(messageId)).toBe(false);
  });

  it('should return true for shouldContinue when messageId is unknown', () => {
    expect(manager.shouldContinue('unknown-id')).toBe(true);
  });
});
