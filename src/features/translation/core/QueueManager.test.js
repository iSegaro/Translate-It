import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock extension polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    init: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

describe('QueueManager', () => {
  let queueManager;
  let ErrorTypes;

  const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    return { promise, resolve, reject };
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
    
    const mod = await import('./QueueManager.js');
    queueManager = mod.queueManager;
    
    const errMod = await import('@/shared/error-management/ErrorTypes.js');
    ErrorTypes = errMod.ErrorTypes;
    
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // Predictable jitter (0.75x)
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be a singleton', async () => {
    const { QueueManager } = await import('./QueueManager.js');
    const instance1 = new QueueManager();
    const instance2 = new QueueManager();
    expect(instance1).toBe(instance2);
  });

  describe('Enqueue and Execution', () => {
    it('should execute a request immediately if queue is empty', async () => {
      const mockRequest = vi.fn().mockResolvedValue('Success');
      const promise = queueManager.enqueue('test-provider', mockRequest);
      
      await vi.advanceTimersByTimeAsync(150); // Buffer for loop
      
      const result = await promise;
      expect(result).toBe('Success');
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('should process items in priority order', async () => {
      const results = [];
      const createRequest = (id, delay) => async () => {
        await new Promise(resolve => setTimeout(resolve, delay));
        results.push(id);
        return id;
      };

      const p1 = queueManager.enqueue('test-provider', createRequest('low', 100), 0);
      await vi.advanceTimersByTimeAsync(150); 
      
      const p2 = queueManager.enqueue('test-provider', createRequest('high', 10), 10);
      const p3 = queueManager.enqueue('test-provider', createRequest('medium', 10), 5);

      await vi.advanceTimersByTimeAsync(200);
      await p1;

      await vi.advanceTimersByTimeAsync(200);
      await Promise.all([p2, p3]);

      expect(results).toEqual(['low', 'high', 'medium']);
    });
  });

  describe('Retry Logic', () => {
    it('should retry a failed request with exponential backoff', async () => {
      // RATE_LIMIT_REACHED: baseDelay 2000. Jittered (0.75x) = 1500ms.
      const mockError = { type: ErrorTypes.RATE_LIMIT_REACHED, message: 'Rate limit' };
      
      const mockRequest = vi.fn()
        .mockRejectedValueOnce(mockError)
        .mockRejectedValueOnce(mockError)
        .mockResolvedValue('Success');

      const promise = queueManager.enqueue('retry-provider', mockRequest);

      // 1st attempt
      await vi.advanceTimersByTimeAsync(150);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Wait for 1st retry (1500ms + buffer)
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockRequest).toHaveBeenCalledTimes(2);

      // Wait for 2nd retry (3000ms + buffer)
      await vi.advanceTimersByTimeAsync(4000);
      expect(mockRequest).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result).toBe('Success');
    });

    it('should fail permanently after max retries', async () => {
      const mockError = new Error('Network');
      mockError.type = ErrorTypes.NETWORK_ERROR;
      
      // NETWORK_ERROR: maxRetries 4.
      const mockRequest = vi.fn().mockRejectedValue(mockError);

      const promise = queueManager.enqueue('fail-provider', mockRequest);
      // Catch early to satisfy Vitest's unhandled rejection checker
      promise.catch(() => {});

      // Advance long enough for all retries
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(10000);
      }

      await expect(promise).rejects.toThrow('Network');
      expect(mockRequest).toHaveBeenCalledTimes(4);
    });
  });

  describe('Cancellation', () => {
    it('does not retry a cancellation-shaped rejection', async () => {
      const cancellation = Object.assign(new Error('Request cancelled'), {
        type: ErrorTypes.USER_CANCELLED,
        isCancelled: true,
      });
      const request = vi.fn().mockRejectedValue(cancellation);
      const executionContext = { operation: { appendDiagnostic: vi.fn() } };
      const promise = queueManager.enqueue('cancel-error-provider', request, 0, 'context', { executionContext });

      await expect(promise).rejects.toBe(cancellation);
      await vi.advanceTimersByTimeAsync(10000);

      expect(request).toHaveBeenCalledTimes(1);
      expect(queueManager.retryTimeouts.size).toBe(0);
      expect(queueManager.getQueueStatus('cancel-error-provider').total).toBe(0);
      expect(executionContext.operation.appendDiagnostic).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'QUEUE_RETRY' }));
    });

    it('keeps a cancelled running item terminal after late resolution', async () => {
      const deferred = createDeferred();
      const promise = queueManager.enqueue('late-resolve-provider', () => deferred.promise, 0, 'context', { messageId: 'late-resolve' });
      await Promise.resolve();
      const item = queueManager.queues.get('late-resolve-provider')[0];

      queueManager.cancelByMessageId('late-resolve');
      await expect(promise).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      deferred.resolve('late result');
      await Promise.resolve();

      expect(item.status).toBe('failed');
      expect(queueManager.retryTimeouts.size).toBe(0);
      expect(queueManager.getQueueStatus('late-resolve-provider').total).toBe(0);
    });

    it('does not retry a cancelled running item after late rejection', async () => {
      const deferred = createDeferred();
      const promise = queueManager.enqueue('late-reject-provider', () => deferred.promise, 0, 'context', { messageId: 'late-reject' });
      await Promise.resolve();

      queueManager.cancelByMessageId('late-reject');
      await expect(promise).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      const error = Object.assign(new Error('network failed'), { type: ErrorTypes.NETWORK_ERROR });
      deferred.reject(error);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10000);

      expect(queueManager.retryTimeouts.size).toBe(0);
      expect(queueManager.getQueueStatus('late-reject-provider').total).toBe(0);
    });

    it('clears retry delay when the message is cancelled', async () => {
      const retryable = Object.assign(new Error('network failed'), { type: ErrorTypes.NETWORK_ERROR });
      const request = vi.fn().mockRejectedValue(retryable);
      const promise = queueManager.enqueue('retry-cancel-provider', request, 0, 'context', { messageId: 'retry-cancel' });
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(100);

      expect(queueManager.retryTimeouts.size).toBe(1);
      queueManager.cancelByMessageId('retry-cancel');
      await expect(promise).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      await vi.advanceTimersByTimeAsync(10000);

      expect(request).toHaveBeenCalledTimes(1);
      expect(queueManager.retryTimeouts.size).toBe(0);
    });

    it('should cancel all items (including processing) for a provider', async () => {
      const mockRequest1 = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('R1'), 1000)));
      const mockRequest2 = vi.fn().mockResolvedValue('R2');
      
      const p1 = queueManager.enqueue('cancel-provider', mockRequest1);
      const p2 = queueManager.enqueue('cancel-provider', mockRequest2);

      await vi.advanceTimersByTimeAsync(150);
      
      const cancelledCount = queueManager.cancelProvider('cancel-provider');
      expect(cancelledCount).toBe(2); 

      await expect(p1).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      await expect(p2).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
    });

    it('should cancel items by UI context', async () => {
      const mockRequest1 = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('R1'), 1000)));
      const mockRequest2 = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('R2'), 1000)));
      
      const p1 = queueManager.enqueue('p1', mockRequest1, 0, 'context', { uiContext: 'popup' });
      const p2 = queueManager.enqueue('p2', mockRequest2, 0, 'context', { uiContext: 'sidepanel' });

      await vi.advanceTimersByTimeAsync(150);
      
      const cancelledCount = queueManager.cancelByUiContext('popup');
      expect(cancelledCount).toBe(1);

      await expect(p1).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      
      // p2 should still be processing/pending
      await vi.advanceTimersByTimeAsync(1000);
      expect(await p2).toBe('R2');
    });

    it('should cancel items by messageId', async () => {
      const mockRequest = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('R'), 1000)));
      const p1 = queueManager.enqueue('p', mockRequest, 0, 'context', { messageId: 'm1' });
      
      await vi.advanceTimersByTimeAsync(150);
      
      const cancelledCount = queueManager.cancelByMessageId('m1');
      expect(cancelledCount).toBe(1);

      await expect(p1).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
    });
  });

  describe('Parallel queue lane', () => {
    it('should dispatch all pending parallel-queue requests without serializing them', async () => {
      const first = createDeferred();
      const second = createDeferred();
      const mockRequest1 = vi.fn().mockImplementation(() => first.promise);
      const mockRequest2 = vi.fn().mockImplementation(() => second.promise);

      const p1 = queueManager.enqueue('test-provider::parallel', mockRequest1, 0, 'select_element', {
        messageId: 'parallel-msg'
      });
      const p2 = queueManager.enqueue('test-provider::parallel', mockRequest2, 0, 'select_element', {
        messageId: 'parallel-msg'
      });

      await Promise.resolve();

      expect(mockRequest1).toHaveBeenCalledTimes(1);
      expect(mockRequest2).toHaveBeenCalledTimes(1);

      first.resolve('R1');
      second.resolve('R2');

      await expect(p1).resolves.toBe('R1');
      await expect(p2).resolves.toBe('R2');
    });

    it('should cancel in-flight parallel-queue requests by messageId', async () => {
      const first = createDeferred();
      const second = createDeferred();
      const mockRequest1 = vi.fn().mockImplementation(() => first.promise);
      const mockRequest2 = vi.fn().mockImplementation(() => second.promise);

      const p1 = queueManager.enqueue('test-provider::parallel', mockRequest1, 0, 'select_element', {
        messageId: 'parallel-cancel'
      });
      const p2 = queueManager.enqueue('test-provider::parallel', mockRequest2, 0, 'select_element', {
        messageId: 'parallel-cancel'
      });

      await Promise.resolve();

      const cancelledCount = queueManager.cancelByMessageId('parallel-cancel');
      expect(cancelledCount).toBe(2);
      expect(queueManager.getQueueStatus('test-provider::parallel').total).toBe(0);

      await expect(p1).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      await expect(p2).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });

      first.resolve('R1');
      second.resolve('R2');
      await Promise.resolve();
    });

    it('should remove cancelled pending parallel-queue items', async () => {
      const processSpy = vi.spyOn(queueManager, '_processQueue').mockImplementation(() => {});
      const mockRequest = vi.fn().mockResolvedValue('R1');

      try {
        const p1 = queueManager.enqueue('pending-provider::parallel', mockRequest, 0, 'select_element', {
          messageId: 'pending-cancel'
        });

        expect(queueManager.getQueueStatus('pending-provider::parallel').total).toBe(1);

        const cancelledCount = queueManager.cancelByMessageId('pending-cancel');
        expect(cancelledCount).toBe(1);
        expect(queueManager.getQueueStatus('pending-provider::parallel').total).toBe(0);

        await expect(p1).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      } finally {
        processSpy.mockRestore();
      }
    });

    it('should keep retrying parallel-queue items until retry completes', async () => {
      const mockError = { type: ErrorTypes.RATE_LIMIT_REACHED, message: 'Rate limit' };
      const mockRequest = vi.fn()
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce('R1');

      const promise = queueManager.enqueue('retry-parallel::parallel', mockRequest, 0, 'select_element', {
        messageId: 'retry-parallel'
      });

      await vi.advanceTimersByTimeAsync(50);
      expect(queueManager.getQueueStatus('retry-parallel::parallel').status.retrying).toBe(1);
      expect(queueManager.getQueueStatus('retry-parallel::parallel').total).toBe(1);

      await vi.advanceTimersByTimeAsync(2500);
      await expect(promise).resolves.toBe('R1');
      expect(queueManager.getQueueStatus('retry-parallel::parallel').total).toBe(0);
    });
  });
});
