import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useErrorHandler } from './useErrorHandler.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';

// Mock ErrorHandler
vi.mock('@/shared/error-management/ErrorHandler.js', () => {
  const mockInstance = {
    handle: vi.fn(),
    getErrorForUI: vi.fn().mockResolvedValue({ message: 'Mocked UI Message' })
  };
  return {
    ErrorHandler: {
      getInstance: vi.fn(() => mockInstance)
    }
  };
});

// Mock ErrorMatcher
vi.mock('@/shared/error-management/ErrorMatcher.js', () => ({
  matchErrorToType: vi.fn(() => 'UNKNOWN')
}));

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}));

describe('useErrorHandler', () => {
  let errorHandlerMock;

  beforeEach(() => {
    vi.clearAllMocks();
    errorHandlerMock = ErrorHandler.getInstance();
  });

  it('handleError should call ErrorHandler.handle', async () => {
    const { handleError } = useErrorHandler();
    const error = new Error('Test Error');
    
    await handleError(error, 'test-context', { extra: 'data' });
    
    expect(errorHandlerMock.handle).toHaveBeenCalledWith(error, expect.objectContaining({
      context: 'test-context',
      extra: 'data',
      vue: true
    }));
  });

  it('withErrorHandling should execute function and return result', async () => {
    const { withErrorHandling } = useErrorHandler();
    const mockFn = vi.fn().mockResolvedValue('success');
    
    const result = await withErrorHandling(mockFn);
    
    expect(result).toBe('success');
    expect(errorHandlerMock.handle).not.toHaveBeenCalled();
  });

  it('withErrorHandling should handle errors and return null', async () => {
    const { withErrorHandling } = useErrorHandler();
    const error = new Error('Failed');
    const mockFn = vi.fn().mockRejectedValue(error);
    
    const result = await withErrorHandling(mockFn, 'async-test');
    
    expect(result).toBe(null);
    expect(errorHandlerMock.handle).toHaveBeenCalled();
  });

  it('getErrorForDisplay should call ErrorHandler.getErrorForUI', async () => {
    const { getErrorForDisplay } = useErrorHandler();
    const error = 'some error';
    
    const result = await getErrorForDisplay(error, 'popup');
    
    expect(errorHandlerMock.getErrorForUI).toHaveBeenCalledWith(error, 'popup');
    expect(result.message).toBe('Mocked UI Message');
  });

  it('handleTranslationError should use specific options', async () => {
    const { handleTranslationError } = useErrorHandler();
    const error = 'translation failed';
    
    await handleTranslationError(error, 'content');
    
    expect(errorHandlerMock.handle).toHaveBeenCalledWith(error, expect.objectContaining({
      showToast: false,
      showInUI: true,
      errorLevel: 'simplified'
    }));
  });
});
