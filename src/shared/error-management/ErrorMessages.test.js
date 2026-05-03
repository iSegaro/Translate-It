import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorTypes } from './ErrorTypes.js';

// 1. Mock EVERYTHING before importing the module under test
vi.mock('@/core/extensionContext.js', () => {
  const Mock = {
    isContextError: vi.fn(() => false),
    getContextErrorMessage: vi.fn((type) => `Context Error: ${type}`),
    safeI18nOperation: vi.fn((op) => op()),
    getActiveEnvironment: vi.fn(() => 'popup')
  };
  return {
    default: Mock,
    isContextError: Mock.isContextError,
    handleContextError: vi.fn(),
    __esModule: true
  };
});

vi.mock('./ErrorMatcher.js', () => ({
  matchErrorToType: vi.fn((err) => {
    if (typeof err === 'string' && err.includes('quota')) return 'QUOTA_EXCEEDED';
    if (err && err.type) return err.type;
    if (err && err.message && err.message.includes('quota')) return 'QUOTA_EXCEEDED';
    return 'UNKNOWN';
  }),
  isSilentError: vi.fn(() => false),
  isFatalError: vi.fn(() => false),
  needsSettings: vi.fn(() => false),
  shouldSuppressConsole: vi.fn(() => false),
  CRITICAL_CONFIG_ERRORS: new Set(),
  FATAL_ERRORS: new Set()
}));

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: {
    getI18nUtils: vi.fn().mockResolvedValue({
      getTranslationString: vi.fn((key) => {
        if (key === 'ERRORS_UNKNOWN') return ''; // Force fallback
        return `Translated: ${key}`;
      })
    })
  }
}));

// 2. Now import the module under test
import { 
  getErrorMessage, 
  translateErrorMessage,
  errorMessages
} from './ErrorMessages.js';

import ExtensionContextManager from '@/core/extensionContext.js';

describe('ErrorMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock behavior
    ExtensionContextManager.isContextError.mockReturnValue(false);
    ExtensionContextManager.safeI18nOperation.mockImplementation((op) => op());
  });

  describe('getErrorMessage', () => {
    it('should return i18n translation if available', async () => {
      const msg = await getErrorMessage('API_KEY_INVALID');
      expect(msg).toBe('Translated: ERRORS_API_KEY_INVALID');
    });

    it('should handle context errors specifically', async () => {
      // For this test, we want isContextError to return true
      ExtensionContextManager.isContextError.mockReturnValue(true);
      const msg = await getErrorMessage('EXTENSION_CONTEXT_INVALIDATED');
      expect(msg).toBe(errorMessages[ErrorTypes.EXTENSION_CONTEXT_INVALIDATED]);
    });

    it('should return fallback message if i18n fails', async () => {
      // Mock safeI18nOperation to return the fallback
      ExtensionContextManager.safeI18nOperation.mockImplementation((op, id, fallback) => fallback);
      
      const msg = await getErrorMessage('API_KEY_INVALID');
      expect(msg).toBe(errorMessages['API_KEY_INVALID']);
    });
  });

  describe('translateErrorMessage', () => {
    it('should translate known error types via matchErrorToType', async () => {
      const msg = await translateErrorMessage('some quota error');
      expect(msg).toBe('Translated: ERRORS_QUOTA_EXCEEDED');
    });

    it('should return generic unknown message for unknown Error objects', async () => {
      const error = new Error('Very specific technical error');
      const msg = await translateErrorMessage(error);
      expect(msg).toBe(errorMessages[ErrorTypes.UNKNOWN]);
    });

    it('should return generic unknown message for custom objects without type', async () => {
      const msg = await translateErrorMessage({ message: 'Custom object message' });
      expect(msg).toBe(errorMessages[ErrorTypes.UNKNOWN]);
    });
  });
});
