import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  matchErrorToType, 
  isSilentError, 
  isFatalError, 
  isRetryableError, 
  isCancellationError,
  needsSettings,
  ErrorMatcher
} from './ErrorMatcher.js';
import { ErrorTypes } from './ErrorTypes.js';

// Mock ExtensionContextManager
vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isValidSync: vi.fn(() => true)
  },
  __esModule: true
}));

import ExtensionContextManager from '@/core/extensionContext.js';

describe('ErrorMatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ExtensionContextManager.isValidSync.mockReturnValue(true);
  });

  describe('matchErrorToType', () => {
    it('should match AbortError to USER_CANCELLED', () => {
      const error = { name: 'AbortError' };
      expect(matchErrorToType(error)).toBe(ErrorTypes.USER_CANCELLED);
    });

    it('should respect explicit .type in error object', () => {
      const error = { type: ErrorTypes.API_KEY_INVALID };
      expect(matchErrorToType(error)).toBe(ErrorTypes.API_KEY_INVALID);
    });

    it('should handle HTTP status codes correctly', () => {
      expect(matchErrorToType({ statusCode: 401 })).toBe(ErrorTypes.API_KEY_INVALID);
      expect(matchErrorToType({ statusCode: 402 })).toBe(ErrorTypes.INSUFFICIENT_BALANCE);
      expect(matchErrorToType({ statusCode: 403 })).toBe(ErrorTypes.FORBIDDEN_ERROR);
      expect(matchErrorToType({ statusCode: 429 })).toBe(ErrorTypes.RATE_LIMIT_REACHED);
      expect(matchErrorToType({ statusCode: 456 })).toBe(ErrorTypes.DEEPL_QUOTA_EXCEEDED);
      expect(matchErrorToType({ statusCode: 500 })).toBe(ErrorTypes.SERVER_ERROR);
      expect(matchErrorToType({ statusCode: 503 })).toBe(ErrorTypes.SERVER_ERROR);
    });

    it('should match specific messages for HTTP 400', () => {
      expect(matchErrorToType({ statusCode: 400, message: 'invalid api key' })).toBe(ErrorTypes.API_KEY_INVALID);
      expect(matchErrorToType({ statusCode: 400, message: 'text is empty' })).toBe(ErrorTypes.TEXT_EMPTY);
      expect(matchErrorToType({ statusCode: 400, message: 'too long' })).toBe(ErrorTypes.TEXT_TOO_LONG);
    });

    it('should match specific messages for HTTP 404', () => {
      expect(matchErrorToType({ statusCode: 404, message: 'model not found' })).toBe(ErrorTypes.MODEL_MISSING);
      expect(matchErrorToType({ statusCode: 404, message: 'chrome translator' })).toBe(ErrorTypes.BROWSER_API_UNAVAILABLE);
      expect(matchErrorToType({ statusCode: 404, message: 'endpoint' })).toBe(ErrorTypes.API_URL_MISSING);
    });

    it('should match string messages to ErrorTypes', () => {
      expect(matchErrorToType('quota exceeded')).toBe(ErrorTypes.QUOTA_EXCEEDED);
      expect(matchErrorToType('api key is missing')).toBe(ErrorTypes.API_KEY_MISSING);
      expect(matchErrorToType('failed to fetch')).toBe(ErrorTypes.NETWORK_ERROR);
      expect(matchErrorToType('extension context invalidated')).toBe(ErrorTypes.EXTENSION_CONTEXT_INVALIDATED);
    });

    it('should match complex provider-specific messages', () => {
      expect(matchErrorToType('resource has been exhausted')).toBe(ErrorTypes.QUOTA_EXCEEDED); // Gemini
      expect(matchErrorToType('location is not supported')).toBe(ErrorTypes.GEMINI_QUOTA_REGION); // Gemini Region
      expect(matchErrorToType('the model is overloaded')).toBe(ErrorTypes.MODEL_OVERLOADED); // OpenAI/Gemini
      expect(matchErrorToType('deepl character limit')).toBe(ErrorTypes.DEEPL_QUOTA_EXCEEDED); // DeepL
    });

    it('should return UNKNOWN for unrecognized errors', () => {
      expect(matchErrorToType('some weird error')).toBe(ErrorTypes.UNKNOWN);
      expect(matchErrorToType(null)).toBe(ErrorTypes.UNKNOWN);
      expect(matchErrorToType({})).toBe(ErrorTypes.UNKNOWN);
    });
  });

  describe('Classification Functions', () => {
    it('isSilentError should return true for silent types', () => {
      expect(isSilentError(ErrorTypes.USER_CANCELLED)).toBe(true);
      expect(isSilentError(ErrorTypes.TAB_RESTRICTED)).toBe(true);
      expect(isSilentError(ErrorTypes.API_KEY_INVALID)).toBe(false);
    });

    it('isSilentError should return true if context is invalidated', () => {
      ExtensionContextManager.isValidSync.mockReturnValue(false);
      expect(isSilentError(ErrorTypes.API_KEY_INVALID)).toBe(true);
    });

    it('isFatalError should identify fatal errors', () => {
      expect(isFatalError(ErrorTypes.API_KEY_INVALID)).toBe(true);
      expect(isFatalError(ErrorTypes.NETWORK_ERROR)).toBe(true);
      expect(isFatalError({ statusCode: 429 })).toBe(true);
      expect(isFatalError(ErrorTypes.VALIDATION)).toBe(false);
    });

    it('isRetryableError should be the opposite of isFatalError for standard types', () => {
      expect(isRetryableError(ErrorTypes.VALIDATION)).toBe(true);
      expect(isRetryableError(ErrorTypes.API_KEY_INVALID)).toBe(false);
    });

    it('needsSettings should identify errors requiring configuration', () => {
      expect(needsSettings(ErrorTypes.API_KEY_MISSING)).toBe(true);
      expect(needsSettings(ErrorTypes.QUOTA_EXCEEDED)).toBe(true);
      expect(needsSettings(ErrorTypes.NETWORK_ERROR)).toBe(false);
    });

    it('isCancellationError should detect various cancellation forms', () => {
      expect(isCancellationError({ isCancelled: true })).toBe(true);
      expect(isCancellationError(ErrorTypes.USER_CANCELLED)).toBe(true);
      expect(isCancellationError(new Error('cancelled by user'))).toBe(true);
      expect(isCancellationError(ErrorTypes.NETWORK_ERROR)).toBe(false);
    });
  });

  describe('ErrorMatcher Class', () => {
    it('should expose static methods correctly', () => {
      expect(ErrorMatcher.matchErrorToType('quota exceeded')).toBe(ErrorTypes.QUOTA_EXCEEDED);
      expect(ErrorMatcher.isFatal(ErrorTypes.API_KEY_INVALID)).toBe(true);
      expect(ErrorMatcher.isSilent(ErrorTypes.USER_CANCELLED)).toBe(true);
    });
  });
});
