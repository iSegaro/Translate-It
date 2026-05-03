import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock extension polyfill before anything else
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

// Mock ErrorMatcher
vi.mock('@/shared/error-management/ErrorMatcher.js');

import { RateLimitManager, TranslationPriority } from './RateLimitManager.js';
import { isFatalError } from '@/shared/error-management/ErrorMatcher.js';

// Mock dependencies
vi.mock('@/shared/config/config.js', () => ({
  getProviderOptimizationLevelAsync: vi.fn().mockResolvedValue(1),
  getSettingsAsync: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/features/translation/core/ProviderConfigurations.js', () => ({
  PROVIDER_CONFIGURATIONS: {
    TestProvider: {
      rateLimit: { maxConcurrent: 1, delayBetweenRequests: 0 }
    }
  },
  getProviderConfiguration: vi.fn(() => ({
    rateLimit: { maxConcurrent: 1, delayBetweenRequests: 0 }
  }))
}));

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

describe('RateLimitManager', () => {
  let manager;
  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock behavior for ErrorMatcher
    isFatalError.mockImplementation((err) => err.message === 'FATAL');

    // Reset singleton instance for clean tests
    RateLimitManager.instance = null;
    manager = new RateLimitManager();

    // Pre-initialize provider state
    manager._initializeProvider('TestProvider', { maxConcurrent: 1, delayBetweenRequests: 0 });
  });

  describe('Priority Queueing', () => {
    it('should execute HIGH priority tasks before NORMAL and LOW', async () => {
      const executionOrder = [];
      manager._initializeProvider('TestProvider', { maxConcurrent: 1, delayBetweenRequests: 0 });

      // 1. Block the queue with a long-running task
      let resolveBlocker;
      const blockerTask = () => new Promise(resolve => { resolveBlocker = resolve; });
      const blockerPromise = manager.executeWithRateLimit('TestProvider', blockerTask, '', TranslationPriority.NORMAL);

      // Give a tiny bit of time for the blocker to actually start and set resolveBlocker
      await new Promise(r => setTimeout(r, 10));

      // 2. Enqueue others while blocked
      const results = [];
      const addTask = (name, priority) => {
        manager.executeWithRateLimit('TestProvider', async () => {
          executionOrder.push(name);
          return name;
        }, '', priority).then(res => results.push(res));
      };

      addTask('LOW_TASK', TranslationPriority.LOW);
      addTask('NORMAL_TASK', TranslationPriority.NORMAL);
      addTask('HIGH_TASK', TranslationPriority.HIGH);

      // 3. Unblock and wait
      resolveBlocker();
      await blockerPromise;
      
      // Wait for all tasks to finish
      await new Promise(r => setTimeout(r, 100));

      // Order should be: Blocker (not in executionOrder) -> HIGH -> NORMAL -> LOW
      expect(executionOrder).toEqual(['HIGH_TASK', 'NORMAL_TASK', 'LOW_TASK']);
    });
  });

  describe('Circuit Breaker', () => {
    it('should open the circuit after 5 consecutive failures', async () => {
      const failingTask = () => Promise.reject(new Error('API Error'));
      
      // Send 5 failing requests
      for (let i = 0; i < 5; i++) {
        try {
          await manager.executeWithRateLimit('TestProvider', failingTask);
        } catch {
          // Ignore planned errors
        }
      }

      // 6th request should fail immediately with Circuit Breaker error
      await expect(manager.executeWithRateLimit('TestProvider', () => Promise.resolve('ok')))
        .rejects.toThrow(/Circuit breaker open/);
    });

    it('should open circuit immediately on fatal errors', async () => {
      // Circuit breaker is already opened by the previous failure if we set consecutiveFailures correctly
      // But for this test, let's just use a fresh error that is marked as fatal
      try {
        await manager.executeWithRateLimit('TestProvider', () => Promise.reject(new Error('FATAL')));
      } catch {
        // ignore
      }

      await expect(manager.executeWithRateLimit('TestProvider', () => Promise.resolve('ok')))
        .rejects.toThrow(/Circuit breaker open/);
    });
  });

  describe('Concurrency Control', () => {
    it('should respect maxConcurrent limit', async () => {
      manager._initializeProvider('ConcurrentProvider', { maxConcurrent: 2, delayBetweenRequests: 0 });
      
      let activeCount = 0;
      let maxSeenActive = 0;

      const task = async () => {
        activeCount++;
        maxSeenActive = Math.max(maxSeenActive, activeCount);
        await new Promise(r => setTimeout(r, 50)); // Hold request
        activeCount--;
      };

      // Start 5 requests
      const promises = Array(5).fill(0).map(() => 
        manager.executeWithRateLimit('ConcurrentProvider', task)
      );

      await Promise.all(promises);
      expect(maxSeenActive).toBe(2);
    });
  });

  describe('Adaptive Backoff', () => {
    it('should increase delay multiplier on 429 error', async () => {
      const state = manager.providerStates.get('TestProvider');
      expect(state.currentBackoffMultiplier).toBe(1);

      try {
        await manager.executeWithRateLimit('TestProvider', () => Promise.reject(new Error('Error 429: Too Many Requests')));
      } catch {
        // ignore
      }

      expect(state.currentBackoffMultiplier).toBe(2);
    });
  });
});
