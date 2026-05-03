import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Setup Mocks
vi.mock('@/core/managers/core/NotificationManager.js', () => ({
  default: class {
    show = vi.fn();
  }
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isValidSync: vi.fn(() => true),
    isContextError: vi.fn(() => false),
    handleContextError: vi.fn(),
    safeI18nOperation: vi.fn((op) => op())
  },
  isContextError: vi.fn(() => false),
  __esModule: true
}));

vi.mock('./ErrorMatcher.js', () => ({
  matchErrorToType: vi.fn(() => 'UNKNOWN'),
  isSilentError: vi.fn(() => false),
  shouldSuppressConsole: vi.fn(() => false),
  needsSettings: vi.fn(() => false),
  CRITICAL_CONFIG_ERRORS: new Set(['API_KEY_INVALID', 'API_KEY_MISSING']),
  FATAL_ERRORS: new Set(['NETWORK_ERROR']),
  __esModule: true
}));

vi.mock('./ErrorMessages.js', () => ({
  getErrorMessage: vi.fn((type) => `Generic message for ${type}`),
  __esModule: true
}));

vi.mock('./ErrorDisplayStrategies.js', () => ({
  getErrorDisplayStrategy: vi.fn(() => ({
    showToast: true,
    showInUI: false,
    errorLevel: 'detailed'
  })),
  getErrorToastType: vi.fn(() => 'error'),
  shouldShowRetry: vi.fn(() => false),
  __esModule: true
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn()
  })),
  __esModule: true
}));

// 2. Import everything
import { ErrorHandler } from './ErrorHandler.js';
import NotificationManager from '@/core/managers/core/NotificationManager.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import * as ErrorMatcher from './ErrorMatcher.js';
import * as ErrorDisplayStrategies from './ErrorDisplayStrategies.js';
import { ErrorTypes } from './ErrorTypes.js';

describe('ErrorHandler', () => {
  let errorHandler;
  let mockNotifier;

  beforeEach(() => {
    vi.clearAllMocks();
    errorHandler = ErrorHandler.getInstance();
    mockNotifier = errorHandler.notifier;
    errorHandler.displayedErrors.clear();
    errorHandler.errorListeners.clear();
    errorHandler.handling = false;
    
    // Reset mocks to default behavior
    ErrorMatcher.matchErrorToType.mockReturnValue('UNKNOWN');
    ErrorMatcher.isSilentError.mockReturnValue(false);
    ExtensionContextManager.isValidSync.mockReturnValue(true);
    ExtensionContextManager.isContextError.mockReturnValue(false);
  });

  it('should be a singleton', () => {
    const instance1 = ErrorHandler.getInstance();
    const instance2 = new ErrorHandler();
    expect(instance1).toBe(instance2);
  });

  describe('handle', () => {
    it('should show generic message for critical errors', async () => {
      const error = new Error('Original technical error');
      ErrorMatcher.matchErrorToType.mockReturnValue('API_KEY_INVALID');
      
      await errorHandler.handle(error, { context: 'test' });
      
      expect(mockNotifier.show).toHaveBeenCalledWith(
        expect.stringContaining('Generic message for API_KEY_INVALID'),
        'error',
        undefined,
        expect.anything()
      );
    });

    it('should show raw message for non-critical errors if descriptive enough', async () => {
      const error = new Error('Something specifically went wrong');
      ErrorMatcher.matchErrorToType.mockReturnValue('UNKNOWN');
      
      await errorHandler.handle(error, { context: 'test' });
      
      expect(mockNotifier.show).toHaveBeenCalledWith(
        'Something specifically went wrong',
        'error',
        undefined,
        expect.anything()
      );
    });

    it('should redact API keys from raw messages', async () => {
      const error = new Error('Failed with key=AIzaSy12345678901234567890123456789012345');
      ErrorMatcher.matchErrorToType.mockReturnValue('UNKNOWN');
      
      await errorHandler.handle(error, { context: 'test' });
      
      const [msg] = mockNotifier.show.mock.calls[0];
      expect(msg).not.toContain('AIzaSy1234567890');
      expect(msg).toContain('key=***');
    });

    it('should handle silent errors without showing notification', async () => {
      const error = new Error('Silent error');
      ErrorMatcher.matchErrorToType.mockReturnValue('USER_CANCELLED');
      ErrorMatcher.isSilentError.mockReturnValue(true);
      
      await errorHandler.handle(error, { context: 'test' });
      
      expect(mockNotifier.show).not.toHaveBeenCalled();
    });

    it('should handle context errors via ExtensionContextManager', async () => {
      const error = new Error('extension context invalidated');
      ExtensionContextManager.isContextError.mockReturnValue(true);
      
      await errorHandler.handle(error, { context: 'test' });
      
      expect(ExtensionContextManager.handleContextError).toHaveBeenCalled();
      expect(mockNotifier.show).not.toHaveBeenCalled();
    });

    it('should notify UI listeners if showInUI is true', async () => {
      const listener = vi.fn();
      errorHandler.addUIErrorListener(listener);
      
      ErrorDisplayStrategies.getErrorDisplayStrategy.mockReturnValue({
        showToast: false,
        showInUI: true,
        errorLevel: 'detailed'
      });
      
      ErrorMatcher.matchErrorToType.mockReturnValue('UI_ERROR');
      ErrorMatcher.isSilentError.mockReturnValue(false);
      
      await errorHandler.handle('Some UI Error', { context: 'popup' });
      
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Some UI Error',
        context: 'popup'
      }));
    });
  });

  describe('getErrorForUI', () => {
    it('should return formatted error object for UI', async () => {
      const error = new Error('Technical detail');
      ErrorMatcher.matchErrorToType.mockReturnValue('API_KEY_MISSING');
      
      const result = await errorHandler.getErrorForUI(error, 'popup');
      
      expect(result).toEqual(expect.objectContaining({
        message: 'Generic message for API_KEY_MISSING',
        type: 'API_KEY_MISSING',
        context: 'popup'
      }));
    });
  });
});
