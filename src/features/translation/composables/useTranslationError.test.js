import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from 'vue';
import { useTranslationError } from './useTranslationError.js';
import * as ErrorDisplayStrategies from '@/shared/error-management/ErrorDisplayStrategies.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { mockErrorHandlerInstance } from '@/shared/error-management/ErrorHandler.js';

// --- Shared Mock Objects ---
const mockUseErrorHandler = {
  handleTranslationError: vi.fn(),
  getErrorForDisplay: vi.fn(),
  isRetryableError: vi.fn()
};

// --- Mocks ---

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { UI: 'UI' }
}));

vi.mock('@/shared/error-management/ErrorHandler.js');

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: vi.fn(() => mockUseErrorHandler)
}));

vi.mock('@/shared/error-management/ErrorDisplayStrategies.js');
vi.mock('@/shared/error-management/ErrorMatcher.js');

// Helper to test composables
function withSetup(composable) {
  let result;
  const app = createApp({
    setup() {
      result = composable();
      return () => {};
    },
  });
  app.mount(document.createElement('div'));
  return [result, app];
}

describe('useTranslationError', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock behaviors
    mockUseErrorHandler.getErrorForDisplay.mockResolvedValue({
      message: 'Displayed Error',
      timestamp: 12345
    });
    
    ErrorDisplayStrategies.getErrorDisplayStrategy.mockReturnValue({
      showToast: false,
      showInUI: true,
      errorLevel: 'detailed'
    });
    
    ErrorDisplayStrategies.shouldShowRetry.mockReturnValue(true);
    ErrorDisplayStrategies.shouldShowSettings.mockReturnValue(false);
    
    matchErrorToType.mockReturnValue('API_ERROR');
    
    // Ensure mock implementation for addUIErrorListener returns a function
    mockErrorHandlerInstance.addUIErrorListener.mockReturnValue(vi.fn());
  });

  it('should initialize with default state', () => {
    const [composable] = withSetup(() => useTranslationError('popup'));

    expect(composable.hasError.value).toBe(false);
    expect(composable.errorMessage.value).toBe('');
    expect(composable.errorType.value).toBe('');
    expect(composable.canRetry.value).toBe(false);
    expect(composable.canOpenSettings.value).toBe(false);
    expect(mockErrorHandlerInstance.addUIErrorListener).toHaveBeenCalled();
  });

  it('should handle error and update state', async () => {
    const [composable] = withSetup(() => useTranslationError('popup'));
    const testError = new Error('Test Error');

    await composable.handleError(testError);

    expect(composable.hasError.value).toBe(true);
    expect(composable.errorMessage.value).toBe('Displayed Error');
    expect(composable.errorType.value).toBe('API_ERROR');
    expect(composable.canRetry.value).toBe(true);
    expect(composable.errorTimestamp.value).toBe(12345);
    
    expect(mockUseErrorHandler.handleTranslationError).toHaveBeenCalledWith(
      testError,
      'popup',
      expect.objectContaining({ showInUI: true })
    );
  });

  it('should ignore user cancellation errors', async () => {
    const [composable] = withSetup(() => useTranslationError('popup'));
    matchErrorToType.mockReturnValue('USER_CANCELLED');
    
    await composable.handleError(new Error('cancelled'));

    expect(composable.hasError.value).toBe(false);
    expect(mockUseErrorHandler.handleTranslationError).not.toHaveBeenCalled();
  });

  it('should clear error state', async () => {
    const [composable] = withSetup(() => useTranslationError('popup'));
    
    // Set some error state
    await composable.handleError(new Error('fail'));
    expect(composable.hasError.value).toBe(true);

    composable.clearError();

    expect(composable.hasError.value).toBe(false);
    expect(composable.errorMessage.value).toBe('');
    expect(composable.errorType.value).toBe('');
    expect(composable.canRetry.value).toBe(false);
  });

  it('should execute retry callback', async () => {
    const [composable] = withSetup(() => useTranslationError('popup'));
    const retryFn = vi.fn().mockResolvedValue();
    
    // Set error state first so canRetry is true
    await composable.handleError(new Error('fail'));
    
    const retryCallback = composable.getRetryCallback(retryFn);
    await retryCallback();

    expect(composable.hasError.value).toBe(false); // Cleared before retry
    expect(retryFn).toHaveBeenCalled();
  });

  it('should execute settings callback', async () => {
    const [composable] = withSetup(() => useTranslationError('popup'));
    
    // Mock strategy to allow settings
    ErrorDisplayStrategies.shouldShowSettings.mockReturnValue(true);
    await composable.handleError(new Error('fail'));
    
    const settingsCallback = composable.getSettingsCallback();
    settingsCallback();

    expect(mockErrorHandlerInstance.openOptionsPageCallback).toHaveBeenCalled();
  });

  it('should update state from UI error listener', async () => {
    const [composable] = withSetup(() => useTranslationError('popup'));
    
    // Get the listener that was registered
    const listener = mockErrorHandlerInstance.addUIErrorListener.mock.calls[0][0];
    
    const errorData = {
      context: ['popup'],
      message: 'Listener Error',
      type: 'NETWORK_ERROR',
      timestamp: 999
    };
    
    listener(errorData);

    expect(composable.errorMessage.value).toBe('Listener Error');
    expect(composable.errorType.value).toBe('NETWORK_ERROR');
  });

  it('should cleanup listener on unmount', () => {
    const unsubscribe = vi.fn();
    mockErrorHandlerInstance.addUIErrorListener.mockReturnValue(unsubscribe);
    
    const [, app] = withSetup(() => useTranslationError('popup'));
    
    app.unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
