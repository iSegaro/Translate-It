import { describe, it, expect, vi } from 'vitest';
import { calculateDynamicTimeout, DEFAULT_TIMEOUT_CONFIG } from './timeoutCalculator.js';

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('timeoutCalculator', () => {
  it('should calculate timeout correctly for a standard number of segments', () => {
    // 60000 + (10 * 5000) = 110000
    const timeout = calculateDynamicTimeout(10);
    expect(timeout).toBe(110000);
  });

  it('should return MIN_TIMEOUT if calculated value is too small', () => {
    // 60000 + (0 * 5000) = 60000 (equal to MIN_TIMEOUT)
    // Actually, calculateDynamicTimeout handles <= 0 separately.
    // Let's try 1 segment: 60000 + 5000 = 65000
    const timeout = calculateDynamicTimeout(1);
    expect(timeout).toBe(65000);
  });

  it('should respect MAX_TIMEOUT constraint', () => {
    // 60000 + (1000 * 5000) = 5,060,000 -> should be capped at 1,800,000
    const timeout = calculateDynamicTimeout(1000);
    expect(timeout).toBe(DEFAULT_TIMEOUT_CONFIG.MAX_TIMEOUT);
  });

  it('should return FALLBACK_TIMEOUT for invalid inputs', () => {
    expect(calculateDynamicTimeout(0)).toBe(DEFAULT_TIMEOUT_CONFIG.FALLBACK_TIMEOUT);
    expect(calculateDynamicTimeout(-5)).toBe(DEFAULT_TIMEOUT_CONFIG.FALLBACK_TIMEOUT);
    expect(calculateDynamicTimeout('invalid')).toBe(DEFAULT_TIMEOUT_CONFIG.FALLBACK_TIMEOUT);
    expect(calculateDynamicTimeout(null)).toBe(DEFAULT_TIMEOUT_CONFIG.FALLBACK_TIMEOUT);
    expect(calculateDynamicTimeout(10.5)).toBe(DEFAULT_TIMEOUT_CONFIG.FALLBACK_TIMEOUT);
  });

  it('should allow custom configuration', () => {
    const customConfig = {
      BASE_TIMEOUT: 10000,
      TIME_PER_SEGMENT: 1000,
      MIN_TIMEOUT: 5000,
      MAX_TIMEOUT: 50000
    };

    // 10000 + (5 * 1000) = 15000
    const timeout = calculateDynamicTimeout(5, customConfig);
    expect(timeout).toBe(15000);
  });

  it('should use default values for missing parts of custom config', () => {
    const incompleteConfig = {
      BASE_TIMEOUT: 20000
    };

    // 20000 + (2 * 5000) = 30000 -> but MIN_TIMEOUT is 60000
    const timeout = calculateDynamicTimeout(2, incompleteConfig);
    expect(timeout).toBe(60000); 
  });
});
