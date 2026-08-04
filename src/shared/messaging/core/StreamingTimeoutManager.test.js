import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamingTimeoutManager } from './StreamingTimeoutManager.js';

// Mock ErrorHandler and ErrorMatcher using central mocks
vi.mock('@/shared/error-management/ErrorHandler.js');
vi.mock('@/shared/error-management/ErrorMatcher.js');

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

  it('should resolve the promise when streaming completes', async () => {
    const messageId = 'msg-2';
    const promise = manager.registerStreamingOperation(messageId, 5000);
    const result = { success: true, text: 'completed' };
    
    manager.completeStreaming(messageId, result);
    
    await expect(promise).resolves.toEqual(result);
    expect(manager.isStreaming(messageId)).toBe(false);
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
    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
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
    expect(result.error.type).toBe('PROGRESS_TIMEOUT');
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
    
    manager.cancelStreaming(messageId, 'Cancelled by test');
    
    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.reason).toBe('Cancelled by test');
  });

  it('should return true for shouldContinue when messageId is unknown', () => {
    expect(manager.shouldContinue('unknown-id')).toBe(true);
  });
});
