import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRuntime = vi.hoisted(() => ({
  providerLevels: new Map()
}));

// Mock extension polyfill before anything else
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

// Mock ErrorMatcher
vi.mock('@/shared/error-management/ErrorMatcher.js');

// Mock ValidationPolicy
vi.mock('@/shared/error-management/ValidationPolicy.js', () => ({
  isLocalDeterministicValidationError: vi.fn(() => false)
}));

import { RateLimitManager, TranslationPriority } from './RateLimitManager.js';
import { isFatalError } from '@/shared/error-management/ErrorMatcher.js';
import { isLocalDeterministicValidationError } from '@/shared/error-management/ValidationPolicy.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

// Mock dependencies
vi.mock('@/shared/config/config.js', () => ({
  getProviderOptimizationLevelAsync: vi.fn(async (providerName) => {
    return mockRuntime.providerLevels.get(providerName) ?? 1;
  }),
  getSettingsAsync: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/features/translation/core/ProviderConfigurations.js', () => ({
  PROVIDER_CONFIGURATIONS: {
    TestProvider: {
      rateLimit: { maxConcurrent: 1, delayBetweenRequests: 0 }
    },
    WebAI: {
      rateLimit: {
        maxConcurrent: 2,
        delayBetweenRequests: 0,
        modeOverrides: {
          select_element: {
            maxConcurrent: 2,
          }
        }
      }
    }
  },
  getProviderConfiguration: vi.fn((providerName, level) => {
    const numericLevel = Number(level) || 1;
    const maxConcurrent = providerName === 'WebAI'
      ? (numericLevel >= 5 ? 4 : numericLevel >= 4 ? 3 : 2)
      : (numericLevel >= 5 ? 4 : numericLevel >= 4 ? 3 : 1);

    return {
      rateLimit: {
        maxConcurrent,
        delayBetweenRequests: 0,
        modeOverrides: {
          select_element: {
            maxConcurrent: 8,
          },
        },
      }
    };
  })
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
    mockRuntime.providerLevels.clear();
    mockRuntime.providerLevels.set('TestProvider', 1);
    mockRuntime.providerLevels.set('ConcurrentProvider', 1);
    mockRuntime.providerLevels.set('WebAI', 3);

    // Default mock behavior for ErrorMatcher
    isFatalError.mockImplementation((err) => err.message === 'FATAL');

    // Reset singleton instance for clean tests
    RateLimitManager.instance = null;
    manager = new RateLimitManager();

    // Pre-initialize provider state
    manager._initializeProvider('TestProvider', { maxConcurrent: 1, delayBetweenRequests: 0 });
  });

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    it('preserves HTTP 402 semantic type when opening circuit', async () => {
      const error = Object.assign(new Error('HTTP 402'), {
        type: ErrorTypes.INSUFFICIENT_BALANCE,
        statusCode: 402,
      });
      isFatalError.mockReturnValue(true);

      await expect(manager.executeWithRateLimit(
        'TestProvider',
        () => Promise.reject(error)
      )).rejects.toBe(error);

      expect(manager.providerStates.get('TestProvider').lastCircuitError).toBe(error);
      expect(error.type).toBe(ErrorTypes.INSUFFICIENT_BALANCE);
    });

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

    it('preserves provider identity and original cause on circuit rejection', async () => {
      const state = manager.providerStates.get('TestProvider');
      const serverError = Object.assign(new Error('HTTP 500'), {
        type: 'SERVER_ERROR',
        statusCode: 500,
      });
      state.isCircuitOpen = true;
      state.circuitOpenTime = Date.now();
      state.lastCircuitError = serverError;

      await expect(manager.executeWithRateLimit('TestProvider', () => Promise.resolve('ok')))
        .rejects.toMatchObject({
          type: 'CIRCUIT_BREAKER_OPEN',
          originalType: 'SERVER_ERROR',
          statusCode: 500,
          providerName: 'TestProvider',
        });
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

    it('should refresh runtime concurrency when optimization level changes', async () => {
      manager._initializeProvider('WebAI', { maxConcurrent: 2, delayBetweenRequests: 0 }, {
        isManualConfig: false,
        optimizationLevel: 3,
        configSource: 'fresh-load'
      });

      let activeCount = 0;
      let maxSeenActive = 0;

      const task = async () => {
        activeCount++;
        maxSeenActive = Math.max(maxSeenActive, activeCount);
        await sleep(30);
        activeCount--;
      };

      mockRuntime.providerLevels.set('WebAI', 3);
      const initialRun = Array.from({ length: 4 }, () => manager.executeWithRateLimit('WebAI', task));
      await Promise.all(initialRun);
      expect(maxSeenActive).toBe(2);

      activeCount = 0;
      maxSeenActive = 0;

      mockRuntime.providerLevels.set('WebAI', 5);
      const refreshedRun = Array.from({ length: 5 }, () => manager.executeWithRateLimit('WebAI', task));
      await Promise.all(refreshedRun);
      expect(maxSeenActive).toBe(4);
    });

    it('should enforce provider-level concurrency despite a larger mode override', async () => {
      mockRuntime.providerLevels.set('WebAI', 3);

      let activeCount = 0;
      let maxSeenActive = 0;
      const task = async () => {
        activeCount++;
        maxSeenActive = Math.max(maxSeenActive, activeCount);
        await sleep(20);
        activeCount--;
      };

      await Promise.all(Array.from({ length: 4 }, (_, index) => manager.executeWithRateLimit(
        'WebAI',
        task,
        '',
        TranslationPriority.NORMAL,
        { mode: index % 2 === 0 ? 'select_element' : 'popup' },
      )));

      expect(maxSeenActive).toBe(2);
      expect(manager.providerStates.has('WebAI')).toBe(true);
    });

    it('should share one provider budget across translation modes', async () => {
      mockRuntime.providerLevels.set('WebAI', 3);

      let activeCount = 0;
      let maxSeenActive = 0;
      const task = async () => {
        activeCount++;
        maxSeenActive = Math.max(maxSeenActive, activeCount);
        await sleep(20);
        activeCount--;
      };

      const selectRequests = Array.from({ length: 2 }, () => manager.executeWithRateLimit(
        'WebAI', task, '', TranslationPriority.NORMAL, { mode: 'select_element' }
      ));
      const popupRequests = Array.from({ length: 2 }, () => manager.executeWithRateLimit(
        'WebAI', task, '', TranslationPriority.NORMAL, { mode: 'popup' }
      ));

      await Promise.all([...selectRequests, ...popupRequests]);

      expect(maxSeenActive).toBe(2);
      expect([...manager.providerStates.keys()]).toEqual(['TestProvider', 'WebAI']);
    });

    it('should preserve manual override configs without refreshing them', async () => {
      manager._initializeProvider('ManualProvider', { maxConcurrent: 1, delayBetweenRequests: 0 }, {
        isManualConfig: true,
        optimizationLevel: 3,
        configSource: 'manual'
      });

      mockRuntime.providerLevels.set('ManualProvider', 5);

      let activeCount = 0;
      let maxSeenActive = 0;

      const task = async () => {
        activeCount++;
        maxSeenActive = Math.max(maxSeenActive, activeCount);
        await sleep(20);
        activeCount--;
      };

      const promises = Array.from({ length: 3 }, () => manager.executeWithRateLimit('ManualProvider', task));
      await Promise.all(promises);

      expect(maxSeenActive).toBe(1);
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

  describe('TEXT_TOO_LONG deterministic validation', () => {
    beforeEach(() => {
      isLocalDeterministicValidationError.mockImplementation(
        (err) => err?.type === 'TEXT_TOO_LONG'
      );
    });

    it('rejects TEXT_TOO_LONG to caller', async () => {
      const textTooLongError = Object.assign(new Error('text is too long'), { type: 'TEXT_TOO_LONG' });
      const failingTask = () => Promise.reject(textTooLongError);

      await expect(manager.executeWithRateLimit('TestProvider', failingTask))
        .rejects.toBe(textTooLongError);
    });

    it('does not increment failedRequests for TEXT_TOO_LONG', async () => {
      const state = manager.providerStates.get('TestProvider');
      const textTooLongError = Object.assign(new Error('text is too long'), { type: 'TEXT_TOO_LONG' });

      try {
        await manager.executeWithRateLimit('TestProvider', () => Promise.reject(textTooLongError));
      } catch { /* ignore */ }

      expect(state.performanceStats.failedRequests).toBe(0);
    });

    it('does not increment consecutiveFailures for TEXT_TOO_LONG', async () => {
      const state = manager.providerStates.get('TestProvider');
      const textTooLongError = Object.assign(new Error('text is too long'), { type: 'TEXT_TOO_LONG' });

      try {
        await manager.executeWithRateLimit('TestProvider', () => Promise.reject(textTooLongError));
      } catch { /* ignore */ }

      expect(state.consecutiveFailures).toBe(0);
    });

    it('does not change circuit state for TEXT_TOO_LONG', async () => {
      const state = manager.providerStates.get('TestProvider');
      const textTooLongError = Object.assign(new Error('text is too long'), { type: 'TEXT_TOO_LONG' });

      try {
        await manager.executeWithRateLimit('TestProvider', () => Promise.reject(textTooLongError));
      } catch { /* ignore */ }

      expect(state.isCircuitOpen).toBe(false);
    });

    it('releases active request count after TEXT_TOO_LONG', async () => {
      const state = manager.providerStates.get('TestProvider');
      const textTooLongError = Object.assign(new Error('text is too long'), { type: 'TEXT_TOO_LONG' });

      try {
        await manager.executeWithRateLimit('TestProvider', () => Promise.reject(textTooLongError));
      } catch { /* ignore */ }

      expect(state.activeRequests).toBe(0);
    });

    it('repeated TEXT_TOO_LONG never opens circuit', async () => {
      const state = manager.providerStates.get('TestProvider');
      const textTooLongError = Object.assign(new Error('text is too long'), { type: 'TEXT_TOO_LONG' });

      for (let i = 0; i < 10; i++) {
        try {
          await manager.executeWithRateLimit('TestProvider', () => Promise.reject(textTooLongError));
        } catch { /* ignore */ }
      }

      expect(state.isCircuitOpen).toBe(false);
      expect(state.consecutiveFailures).toBe(0);
      expect(state.performanceStats.failedRequests).toBe(0);
    });

    it('processes queued tasks after TEXT_TOO_LONG rejection', async () => {
      const state = manager.providerStates.get('TestProvider');
      const textTooLongError = Object.assign(new Error('text is too long'), { type: 'TEXT_TOO_LONG' });
      let callCount = 0;

      const task = () => {
        callCount++;
        if (callCount === 1) return Promise.reject(textTooLongError);
        return Promise.resolve('task2-ok');
      };

      const p1 = manager.executeWithRateLimit('TestProvider', task).catch(() => {});
      const p2 = manager.executeWithRateLimit('TestProvider', task);

      await Promise.all([p1, p2]);

      expect(state.activeRequests).toBe(0);
      expect(state.isCircuitOpen).toBe(false);
      expect(state.performanceStats.failedRequests).toBe(0);
      await expect(p2).resolves.toBe('task2-ok');
    });

    it('still increments health counters for NETWORK_ERROR', async () => {
      isLocalDeterministicValidationError.mockReturnValue(false);
      const state = manager.providerStates.get('TestProvider');
      const networkError = Object.assign(new Error('failed to fetch'), { type: 'NETWORK_ERROR' });

      try {
        await manager.executeWithRateLimit('TestProvider', () => Promise.reject(networkError));
      } catch { /* ignore */ }

      expect(state.performanceStats.failedRequests).toBe(1);
      expect(state.consecutiveFailures).toBe(1);
    });

    it('retains existing behavior for SERVER_ERROR', async () => {
      isLocalDeterministicValidationError.mockReturnValue(false);
      const state = manager.providerStates.get('TestProvider');
      const serverError = Object.assign(new Error('internal server error'), { type: 'SERVER_ERROR' });

      try {
        await manager.executeWithRateLimit('TestProvider', () => Promise.reject(serverError));
      } catch { /* ignore */ }

      expect(state.performanceStats.failedRequests).toBe(1);
      expect(state.consecutiveFailures).toBe(1);
    });

    it('retains existing behavior for RATE_LIMIT_REACHED', async () => {
      isLocalDeterministicValidationError.mockReturnValue(false);
      const state = manager.providerStates.get('TestProvider');
      const rateLimitError = Object.assign(new Error('rate limit'), { type: 'RATE_LIMIT_REACHED' });

      try {
        await manager.executeWithRateLimit('TestProvider', () => Promise.reject(rateLimitError));
      } catch { /* ignore */ }

      expect(state.performanceStats.failedRequests).toBe(1);
      expect(state.consecutiveFailures).toBe(1);
    });

    it('retains existing behavior for API_RESPONSE_INVALID', async () => {
      isLocalDeterministicValidationError.mockReturnValue(false);
      const state = manager.providerStates.get('TestProvider');
      const apiError = Object.assign(new Error('invalid response'), { type: 'API_RESPONSE_INVALID' });

      try {
        await manager.executeWithRateLimit('TestProvider', () => Promise.reject(apiError));
      } catch { /* ignore */ }

      expect(state.performanceStats.failedRequests).toBe(1);
      expect(state.consecutiveFailures).toBe(1);
    });
  });
});
