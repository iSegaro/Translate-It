import { describe, it, expect, vi } from 'vitest';
import { ErrorClassifier } from './ErrorClassifier.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  })
}));

describe('ErrorClassifier', () => {
  describe('isDeterministicError', () => {
    it('should return true for known deterministic ErrorTypes', () => {
      expect(ErrorClassifier.isDeterministicError({ type: ErrorTypes.API_KEY_INVALID })).toBe(true);
      expect(ErrorClassifier.isDeterministicError({ type: ErrorTypes.TEXT_EMPTY })).toBe(true);
      expect(ErrorClassifier.isDeterministicError({ type: ErrorTypes.API_KEY_MISSING })).toBe(true);
    });

    it('should return true for messages matching deterministic ErrorTypes', () => {
      expect(ErrorClassifier.isDeterministicError(ErrorTypes.API_KEY_INVALID)).toBe(true);
      expect(ErrorClassifier.isDeterministicError(new Error(ErrorTypes.TEXT_EMPTY))).toBe(true);
    });

    it('should return true for patterns matching deterministic errors', () => {
      expect(ErrorClassifier.isDeterministicError('API Key not found')).toBe(true);
      expect(ErrorClassifier.isDeterministicError('Language not supported')).toBe(true);
      expect(ErrorClassifier.isDeterministicError('Error 401')).toBe(true);
    });

    it('should return false for retryable or unknown errors', () => {
      expect(ErrorClassifier.isDeterministicError({ type: ErrorTypes.NETWORK_ERROR })).toBe(false);
      expect(ErrorClassifier.isDeterministicError('Some random error')).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for known retryable ErrorTypes', () => {
      expect(ErrorClassifier.isRetryableError({ type: ErrorTypes.NETWORK_ERROR })).toBe(true);
      expect(ErrorClassifier.isRetryableError({ type: ErrorTypes.RATE_LIMIT_REACHED })).toBe(true);
      expect(ErrorClassifier.isRetryableError({ type: ErrorTypes.QUOTA_EXCEEDED })).toBe(true);
    });

    it('should return true for patterns matching retryable errors', () => {
      expect(ErrorClassifier.isRetryableError('Connection timeout')).toBe(true);
      expect(ErrorClassifier.isRetryableError('Error 429')).toBe(true);
      expect(ErrorClassifier.isRetryableError('Service Unavailable')).toBe(true);
      expect(ErrorClassifier.isRetryableError('503 Service Temp Unavailable')).toBe(true);
    });

    it('should return false for deterministic errors', () => {
      expect(ErrorClassifier.isRetryableError({ type: ErrorTypes.API_KEY_INVALID })).toBe(false);
    });
  });

  describe('getRecommendedAction', () => {
    it('should return fast-fail for deterministic errors', () => {
      const error = { type: ErrorTypes.API_KEY_INVALID };
      expect(ErrorClassifier.getRecommendedAction(error)).toBe('fast-fail');
    });

    it('should return rate-limit for retryable errors', () => {
      const error = { type: ErrorTypes.NETWORK_ERROR };
      expect(ErrorClassifier.getRecommendedAction(error)).toBe('rate-limit');
    });

    it('should default to rate-limit for unknown errors', () => {
      expect(ErrorClassifier.getRecommendedAction('Unknown mystery error')).toBe('rate-limit');
    });
  });

  describe('analyzeErrors', () => {
    it('should correctly analyze a collection of errors', () => {
      const errors = [
        { type: ErrorTypes.API_KEY_INVALID },
        { type: ErrorTypes.NETWORK_ERROR },
        { type: ErrorTypes.NETWORK_ERROR },
        'Some unknown error'
      ];
      
      const stats = ErrorClassifier.analyzeErrors(errors);
      
      expect(stats.total).toBe(4);
      expect(stats.deterministic).toBe(1);
      expect(stats.retryable).toBe(3); // 2 network + 1 unknown (defaults to rate-limit)
    });
  });
});
