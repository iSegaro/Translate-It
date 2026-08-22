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

});
