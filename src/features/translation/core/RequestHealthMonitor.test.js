import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create a stable mock logger object
const mockLogger = {
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
};

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => mockLogger
}));

describe('RequestHealthMonitor', () => {
  let healthMonitor;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
    
    const mod = await import('./RequestHealthMonitor.js');
    healthMonitor = mod.requestHealthMonitor;
    
    // Reset singleton state
    healthMonitor.resetAll();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be a singleton', async () => {
    const { requestHealthMonitor } = await import('./RequestHealthMonitor.js');
    const mod2 = await import('./RequestHealthMonitor.js');
    expect(requestHealthMonitor).toBe(mod2.requestHealthMonitor);
  });

  describe('Recording Requests', () => {
    it('should correctly record a successful request', () => {
      healthMonitor.recordSuccess('Google', 200);
      
      const health = healthMonitor.getProviderHealth('Google');
      expect(health.totalRequests).toBe(1);
      expect(health.successfulRequests).toBe(1);
      expect(health.averageResponseTime).toBe(200);
      expect(health.isHealthy).toBe(true);
      expect(healthMonitor.globalStats.totalRequests).toBe(1);
    });

    it('should correctly record a failed request', () => {
      const error = { type: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' };
      healthMonitor.recordFailure('DeepL', error, 150);
      
      const health = healthMonitor.getProviderHealth('DeepL');
      expect(health.totalRequests).toBe(1);
      expect(health.failedRequests).toBe(1);
      expect(health.consecutiveFailures).toBe(1);
      expect(health.errorBreakdown.rateLimit).toBe(1);
      expect(health.isHealthy).toBe(false); // Because error rate is 100%
    });

    it('should reset consecutive failures on success', () => {
      healthMonitor.recordFailure('P1', new Error('Fail'));
      healthMonitor.recordFailure('P1', new Error('Fail'));
      expect(healthMonitor.getProviderHealth('P1').consecutiveFailures).toBe(2);
      
      healthMonitor.recordSuccess('P1', 100);
      expect(healthMonitor.getProviderHealth('P1').consecutiveFailures).toBe(0);
    });
  });

  describe('Health Score and Metrics', () => {
    it('should calculate perfect health score for 100% success with fast response', () => {
      // Need multiple successes to get stable score
      for(let i=0; i<5; i++) {
        healthMonitor.recordSuccess('P1', 100);
      }
      const health = healthMonitor.getProviderHealth('P1');
      // 1.0 - error(0) - response(0) - consecutive(0) + bonus(recent activity)
      expect(health.healthScore).toBeGreaterThanOrEqual(0.9);
      expect(health.isHealthy).toBe(true);
    });

    it('should degrade health score on failures', () => {
      healthMonitor.recordSuccess('P1', 100);
      for(let i=0; i<3; i++) {
        healthMonitor.recordFailure('P1', new Error('Fail'));
      }
      
      const health = healthMonitor.getProviderHealth('P1');
      expect(health.healthScore).toBeLessThan(0.7);
      expect(health.isHealthy).toBe(false);
    });

    it('should detect performance trends', () => {
      // Fill history with failures
      for(let i=0; i<5; i++) healthMonitor.recordFailure('TrendP', new Error('F'));
      // Then successes
      for(let i=0; i<5; i++) healthMonitor.recordSuccess('TrendP', 100);
      
      const health = healthMonitor.getProviderHealth('TrendP');
      expect(health.performanceTrend).toBe('improving');
    });
  });

  describe('Data Cleanup (Sliding Window)', () => {
    it('should respect healthWindowSize (50)', () => {
      for(let i=0; i<60; i++) {
        healthMonitor.recordSuccess('P1', 100);
      }
      
      const health = healthMonitor.providerHealth.get('P1');
      expect(health.requests.length).toBe(50);
    });

    it('should filter old response times based on TTL', () => {
      const now = Date.now();
      healthMonitor.recordSuccess('P1', 100);
      
      // Advance time beyond responseTimeWindowMs (5 mins)
      vi.advanceTimersByTime(6 * 60 * 1000);
      
      // Record new one to trigger cleanup
      healthMonitor.recordSuccess('P1', 200);
      
      const health = healthMonitor.providerHealth.get('P1');
      expect(health.responseTimes.length).toBe(1);
      expect(health.responseTimes[0].duration).toBe(200);
    });
  });

  describe('Recommended Actions', () => {
    it('should recommend switch_provider on quota exhausted', () => {
      const quotaError = { type: 'QUOTA_EXCEEDED', message: 'No more credits' };
      for(let i=0; i<5; i++) {
        healthMonitor.recordFailure('P1', quotaError);
      }
      
      const recommendation = healthMonitor.getRecommendedAction('P1');
      expect(recommendation.action).toBe('switch_provider');
    });

    it('should recommend increase_delays on high error rate', () => {
      healthMonitor.recordSuccess('P1', 100);
      healthMonitor.recordFailure('P1', new Error('E'));
      healthMonitor.recordFailure('P1', new Error('E'));
      
      const recommendation = healthMonitor.getRecommendedAction('P1');
      expect(recommendation.action).toBe('increase_delays');
    });
  });

  describe('Alerts', () => {
    it('should log warning for slow response times', () => {
      // Alert threshold is 10s (10000ms)
      healthMonitor.recordSuccess('SlowP', 11000);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Slow response time'));
    });

    it('should log error for consecutive failures', () => {
      for(let i=0; i<5; i++) {
        healthMonitor.recordFailure('FailP', new Error('F'));
      }
      
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Multiple consecutive failures'));
    });
  });
});
