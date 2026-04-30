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

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
    
    const mod = await import('./QueueManager.js');
    queueManager = mod.queueManager;
    
    const errMod = await import('@/shared/error-management/ErrorTypes.js');
    ErrorTypes = errMod.ErrorTypes;
    
    queueManager.clearAll();
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
    it('should cancel all pending items for a provider', async () => {
      const mockRequest1 = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('R1'), 1000)));
      const mockRequest2 = vi.fn().mockResolvedValue('R2');
      
      const p1 = queueManager.enqueue('cancel-provider', mockRequest1);
      const p2 = queueManager.enqueue('cancel-provider', mockRequest2);

      await vi.advanceTimersByTimeAsync(150);
      
      const cancelledCount = queueManager.cancelProvider('cancel-provider');
      expect(cancelledCount).toBe(1); 

      await expect(p2).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      
      await vi.advanceTimersByTimeAsync(2000);
      expect(await p1).toBe('R1');
    });
  });
});
