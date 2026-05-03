import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamingTimeoutManager } from './StreamingTimeoutManager.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

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

  it('should handle manual cancellation', async () => {
    const messageId = 'msg-7';
    const promise = manager.registerStreamingOperation(messageId, 5000);
    
    manager.cancelStreaming(messageId, 'Cancelled by test');
    
    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.reason).toBe('Cancelled by test');
  });
});
