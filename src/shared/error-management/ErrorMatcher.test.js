import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  matchErrorToType, 
  isSilentError, 
  isFatalError, 
  isTransientError,
  isRetryableError, 
  isCancellationError,
  needsSettings,
  isProviderRequestSizeError,
  isDeterministicClientHttpError,
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
    it('should classify bare AbortError as a generic translation error', () => {
      const error = { name: 'AbortError' };
      expect(matchErrorToType(error)).toBe(ErrorTypes.TRANSLATION_ERROR);
      expect(matchErrorToType(error)).not.toBe(ErrorTypes.USER_CANCELLED);
    });

    it('should preserve canonical type over AbortError name', () => {
      expect(matchErrorToType({
        name: 'AbortError',
        type: ErrorTypes.API_ERROR,
      })).toBe(ErrorTypes.API_ERROR);

      expect(matchErrorToType({
        name: 'AbortError',
        type: ErrorTypes.TRANSLATION_TIMEOUT,
      })).toBe(ErrorTypes.TRANSLATION_TIMEOUT);
    });

    it('should refine generic type from status code', () => {
      expect(matchErrorToType({
        type: ErrorTypes.TRANSLATION_ERROR,
        statusCode: 429,
      })).toBe(ErrorTypes.RATE_LIMIT_REACHED);
    });

    it('should refine UNKNOWN type from recognizable message', () => {
      expect(matchErrorToType({
        type: ErrorTypes.UNKNOWN,
        message: 'Too many requests',
      })).toBe(ErrorTypes.RATE_LIMIT_REACHED);
    });

    it('should keep generic typed AbortError generic without stronger evidence', () => {
      expect(matchErrorToType({
        name: 'AbortError',
        type: ErrorTypes.TRANSLATION_ERROR,
      })).toBe(ErrorTypes.TRANSLATION_ERROR);
    });

    it('should keep operation aborts generic regardless of cancellation metadata', () => {
      const error = {
        name: 'AbortError',
        operationAborted: true,
        cancellationReason: 'operation-abort',
        isCancelled: true,
      };

      expect(matchErrorToType(error)).toBe(ErrorTypes.TRANSLATION_ERROR);
      expect(isCancellationError(error)).toBe(false);
      expect(isFatalError(error)).toBe(false);
      expect(isTransientError(error)).toBe(false);
      expect(isRetryableError(error)).toBe(false);
    });

    it('should preserve explicit user cancellation', () => {
      expect(matchErrorToType({ type: ErrorTypes.USER_CANCELLED })).toBe(ErrorTypes.USER_CANCELLED);
      expect(matchErrorToType({ isCancelled: true })).toBe(ErrorTypes.USER_CANCELLED);
    });

    it.each(['Translation cancelled', 'Operation cancelled', 'Request cancelled'])(
      'should not infer user cancellation from ambiguous message: %s',
      (message) => {
        expect(matchErrorToType(new Error(message))).not.toBe(ErrorTypes.USER_CANCELLED);
      },
    );

    it('should classify a DOM-style AbortError as generic', () => {
      const error = new DOMException('Aborted', 'AbortError');
      expect(matchErrorToType(error)).toBe(ErrorTypes.TRANSLATION_ERROR);
    });

    it('should preserve recognizable message classification over AbortError name', () => {
      const error = Object.assign(new Error('Too many requests'), { name: 'AbortError' });
      expect(matchErrorToType(error)).toBe(ErrorTypes.RATE_LIMIT_REACHED);
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

    it.each([
      [{ statusCode: 503, message: 'Service Unavailable' }, ErrorTypes.SERVER_ERROR],
      [{ statusCode: 503, message: 'Server is overloaded' }, ErrorTypes.SERVER_ERROR],
      [{ statusCode: 500, message: 'Service busy' }, ErrorTypes.SERVER_ERROR],
      [{ statusCode: 504, message: 'Upstream unavailable' }, ErrorTypes.SERVER_ERROR],
      [{ message: 'The model is overloaded' }, ErrorTypes.MODEL_OVERLOADED],
      [{ statusCode: 503, message: 'The model is overloaded' }, ErrorTypes.MODEL_OVERLOADED],
      [{ statusCode: 429, message: 'High demand' }, ErrorTypes.RATE_LIMIT_REACHED],
      [{ type: ErrorTypes.SERVER_ERROR, message: 'The model is overloaded' }, ErrorTypes.SERVER_ERROR],
    ])('keeps generic server failures distinct from explicit model overload: %o', (error, expectedType) => {
      expect(matchErrorToType(error)).toBe(expectedType);
    });

    it('should match specific messages for HTTP 400', () => {
      expect(matchErrorToType({ statusCode: 400, message: 'invalid api key' })).toBe(ErrorTypes.API_KEY_INVALID);
      expect(matchErrorToType({ statusCode: 400, message: 'text is empty' })).toBe(ErrorTypes.TEXT_EMPTY);
      expect(matchErrorToType({ statusCode: 400, message: 'too long' })).toBe(ErrorTypes.HTTP_ERROR);
      expect(matchErrorToType({ statusCode: 422, message: 'maximum length exceeded' })).toBe(ErrorTypes.HTTP_ERROR);
      expect(matchErrorToType({ statusCode: 413, message: 'Payload Too Large' })).toBe(ErrorTypes.HTTP_ERROR);
      expect(matchErrorToType({ statusCode: 400, message: 'rate limit for this parameter' })).toBe(ErrorTypes.HTTP_ERROR);
    });

    it('should match specific messages for HTTP 404', () => {
      expect(matchErrorToType({ statusCode: 404, message: 'model not found' })).toBe(ErrorTypes.MODEL_MISSING);
      expect(matchErrorToType({ statusCode: 404, message: 'chrome translator' })).toBe(ErrorTypes.BROWSER_API_UNAVAILABLE);
      expect(matchErrorToType({ statusCode: 404, message: 'endpoint' })).toBe(ErrorTypes.API_URL_MISSING);
    });

    it('should keep generic AI HTTP 404 neutral despite model wording', () => {
      expect(matchErrorToType({
        providerType: 'ai',
        statusCode: 404,
        message: 'model not found',
      })).toBe(ErrorTypes.HTTP_ERROR);
    });

    it.each([400, 401, 403, 429, 500])('should preserve non-404 AI status classification for %s', (statusCode) => {
      expect(matchErrorToType({ providerType: 'ai', statusCode })).toBe(
        statusCode === 400
          ? ErrorTypes.HTTP_ERROR
          : statusCode === 401
            ? ErrorTypes.API_KEY_INVALID
            : statusCode === 403
              ? ErrorTypes.FORBIDDEN_ERROR
              : statusCode === 429
                ? ErrorTypes.RATE_LIMIT_REACHED
                : ErrorTypes.SERVER_ERROR,
      );
    });

    it('should match string messages to ErrorTypes', () => {
      expect(matchErrorToType('quota exceeded')).toBe(ErrorTypes.QUOTA_EXCEEDED);
      expect(matchErrorToType('api key is missing')).toBe(ErrorTypes.API_KEY_MISSING);
      expect(matchErrorToType('failed to fetch')).toBe(ErrorTypes.NETWORK_ERROR);
      expect(matchErrorToType('extension context invalidated')).toBe(ErrorTypes.EXTENSION_CONTEXT_INVALIDATED);
    });

    it.each([
      'Receiving end does not exist',
      'Could not establish connection',
      'Message port closed',
      'Message channel closed',
    ])('classifies %s as transport loss', (message) => {
      expect(matchErrorToType(message)).toBe(ErrorTypes.CONNECTION_LOST);
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
    it.each([
      [{ type: ErrorTypes.HTTP_ERROR, statusCode: 400 }, true],
      [{ type: ErrorTypes.HTTP_ERROR, statusCode: '404' }, true],
      [{ type: ErrorTypes.HTTP_ERROR, statusCode: 422 }, true],
      [{ type: ErrorTypes.HTTP_ERROR, statusCode: 409 }, false],
      [{ type: ErrorTypes.HTTP_ERROR, statusCode: 500 }, false],
      [{ type: ErrorTypes.HTTP_ERROR }, false],
      [{ type: ErrorTypes.SERVER_ERROR, statusCode: 400 }, false],
      [{ type: ErrorTypes.INVALID_REQUEST, statusCode: 400 }, false],
    ])('identifies deterministic client HTTP failures narrowly', (error, expected) => {
      expect(isDeterministicClientHttpError(error)).toBe(expected);
    });

    it.each([
      [{ type: ErrorTypes.HTTP_ERROR, statusCode: 413 }, true],
      [{ type: ErrorTypes.HTTP_ERROR, statusCode: 400, message: 'request is too long' }, true],
      [{ type: ErrorTypes.HTTP_ERROR, statusCode: 422, message: 'maximum context length exceeded' }, true],
      [{ type: ErrorTypes.HTTP_ERROR, statusCode: 400, message: 'rate limit for this parameter' }, false],
      [{ type: ErrorTypes.HTTP_ERROR, statusCode: 500, message: 'request is too long' }, false],
      [{ type: ErrorTypes.HTTP_ERROR, statusCode: 400, message: 'bad request' }, false],
    ])('should identify provider request-size failures narrowly', (error, expected) => {
      expect(isProviderRequestSizeError(error)).toBe(expected);
    });

    it('keeps unqualified TEXT_TOO_LONG message classification unchanged', () => {
      expect(matchErrorToType('text is too long')).toBe(ErrorTypes.TEXT_TOO_LONG);
    });

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
      expect(isFatalError(ErrorTypes.API_ENDPOINT_INVALID)).toBe(true);
      expect(isFatalError(ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED)).toBe(true);
      expect(isFatalError(ErrorTypes.NETWORK_ERROR)).toBe(false); // Changed: Network is now transient
      expect(isFatalError({ statusCode: 429 })).toBe(false); // Changed: Rate limit is now transient
      expect(isFatalError({ statusCode: 401 })).toBe(true);
      expect(isFatalError(ErrorTypes.VALIDATION)).toBe(false);
    });

    it('isTransientError should identify transient errors', () => {
      expect(isTransientError(ErrorTypes.NETWORK_ERROR)).toBe(true);
      expect(isTransientError(ErrorTypes.SERVER_ERROR)).toBe(true);
      expect(isTransientError({ statusCode: 429 })).toBe(true);
      expect(isTransientError(ErrorTypes.API_KEY_INVALID)).toBe(false);
    });

    it('isRetryableError should include transient errors and non-fatal errors', () => {
      expect(isRetryableError(ErrorTypes.VALIDATION)).toBe(true);
      expect(isRetryableError(ErrorTypes.NETWORK_ERROR)).toBe(true);
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

    it('should keep explicit provider types authoritative over cancellation wording', () => {
      const error = Object.assign(new Error('Request cancelled by upstream provider'), {
        type: ErrorTypes.NETWORK_ERROR,
      });

      expect(isCancellationError(error)).toBe(false);
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
