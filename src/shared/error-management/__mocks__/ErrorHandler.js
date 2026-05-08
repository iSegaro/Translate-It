import { vi } from 'vitest';

export const mockErrorHandlerInstance = {
  handle: vi.fn().mockImplementation((error) => Promise.resolve(error)),
  getErrorForUI: vi.fn().mockResolvedValue({ message: 'Mocked UI Message' }),
  reset: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addUIErrorListener: vi.fn(() => vi.fn()), // returns unsubscribe function
  openOptionsPageCallback: vi.fn(),
};

export const ErrorHandler = vi.fn().mockImplementation(function() {
  return mockErrorHandlerInstance;
});
ErrorHandler.getInstance = vi.fn(() => mockErrorHandlerInstance);

export const handleUIError = vi.fn().mockResolvedValue(null);
