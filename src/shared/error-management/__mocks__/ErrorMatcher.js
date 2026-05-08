import { vi } from 'vitest';

export const matchErrorToType = vi.fn(() => 'UNKNOWN');
export const isFatalError = vi.fn(() => false);
export const isTransientError = vi.fn(() => false);
export const isConfigError = vi.fn(() => false);
export const isCancellationError = vi.fn(() => false);
export const getProviderErrorPattern = vi.fn(() => null);
export const isRetryableError = vi.fn(() => true);
export const isSilentError = vi.fn(() => false);
export const needsSettings = vi.fn(() => false);
export const shouldSuppressConsole = vi.fn(() => false);

export const CRITICAL_CONFIG_ERRORS = new Set();
export const FATAL_ERRORS = new Set();
export const TRANSIENT_ERRORS = new Set();

export const ErrorMatcher = {
  matchErrorToType,
  isFatal: isFatalError,
  isTransient: isTransientError,
  isConfig: isConfigError,
  isSilent: isSilentError,
  isCancellation: isCancellationError,
  needsSettings,
  shouldSuppressConsole
};
