import { describe, it, expect, vi } from 'vitest';
import { 
  getErrorDisplayStrategy, 
  getErrorToastType, 
  shouldShowRetry, 
  shouldShowSettings
} from './ErrorDisplayStrategies.js';
import { ErrorTypes } from './ErrorTypes.js';

// Mock ErrorMatcher for isSilentError and needsSettings
vi.mock('./ErrorMatcher.js', () => ({
  isSilentError: vi.fn((type) => [
    ErrorTypes.USER_CANCELLED,
    ErrorTypes.CONTEXT
  ].includes(type)),
  needsSettings: vi.fn((type) => [
    ErrorTypes.API_KEY_MISSING,
    ErrorTypes.API_KEY_INVALID,
    ErrorTypes.QUOTA_EXCEEDED
  ].includes(type))
}));

describe('ErrorDisplayStrategies', () => {
  describe('getErrorDisplayStrategy', () => {
    it('should return content strategy for content context', () => {
      const strategy = getErrorDisplayStrategy('content', ErrorTypes.UNKNOWN);
      expect(strategy.showToast).toBe(true);
      expect(strategy.showInUI).toBe(false);
    });

    it('should return popup strategy for popup context', () => {
      const strategy = getErrorDisplayStrategy('popup', ErrorTypes.UNKNOWN);
      expect(strategy.showToast).toBe(false);
      expect(strategy.showInUI).toBe(true);
    });

    it('should override showToast for critical errors in popup', () => {
      // API_KEY_INVALID is in CriticalErrorTypes
      const strategy = getErrorDisplayStrategy('popup', ErrorTypes.API_KEY_INVALID);
      expect(strategy.showToast).toBe(true);
      expect(strategy.showInUI).toBe(true);
    });

    it('should disable display for silent errors', () => {
      const strategy = getErrorDisplayStrategy('content', ErrorTypes.USER_CANCELLED);
      expect(strategy.showToast).toBe(false);
      expect(strategy.showInUI).toBe(false);
    });

    it('should handle unknown context by falling back to background', () => {
      const strategy = getErrorDisplayStrategy('unknown-context', ErrorTypes.UNKNOWN);
      expect(strategy.showToast).toBe(true);
      expect(strategy.showInUI).toBe(false);
    });

    it('should set supportRetry for network errors', () => {
      const strategy = getErrorDisplayStrategy('popup', ErrorTypes.NETWORK_ERROR);
      expect(strategy.supportRetry).toBe(true);
    });
  });

  describe('getErrorToastType', () => {
    it('should return "warning" for specific types', () => {
      expect(getErrorToastType(ErrorTypes.NETWORK_ERROR)).toBe('warning');
      expect(getErrorToastType(ErrorTypes.API_KEY_MISSING)).toBe('warning');
      expect(getErrorToastType(ErrorTypes.RATE_LIMIT_REACHED)).toBe('warning');
    });

    it('should return "error" for other types', () => {
      expect(getErrorToastType(ErrorTypes.UNKNOWN)).toBe('error');
      expect(getErrorToastType(ErrorTypes.SERVER_ERROR)).toBe('error');
    });
  });

  describe('shouldShowRetry', () => {
    it('should return true if strategy supports retry and error is retryable', () => {
      const strategy = { supportRetry: true };
      expect(shouldShowRetry(ErrorTypes.NETWORK_ERROR, strategy)).toBe(true);
      expect(shouldShowRetry(ErrorTypes.SERVER_ERROR, strategy)).toBe(true);
    });

    it('should return false if strategy does not support retry', () => {
      const strategy = { supportRetry: false };
      expect(shouldShowRetry(ErrorTypes.NETWORK_ERROR, strategy)).toBe(false);
    });

    it('should return false for non-retryable error types', () => {
      const strategy = { supportRetry: true };
      expect(shouldShowRetry(ErrorTypes.API_KEY_INVALID, strategy)).toBe(false);
    });
  });

  describe('shouldShowSettings', () => {
    it('should return true if error needs settings and strategy allows it', () => {
      const strategy = { supportSettings: true };
      expect(shouldShowSettings(ErrorTypes.API_KEY_MISSING, strategy)).toBe(true);
    });

    it('should return false if strategy explicitly disables settings', () => {
      const strategy = { supportSettings: false };
      expect(shouldShowSettings(ErrorTypes.API_KEY_MISSING, strategy)).toBe(false);
    });
  });
});
