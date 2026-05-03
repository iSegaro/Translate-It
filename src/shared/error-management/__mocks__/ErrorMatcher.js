import { vi } from 'vitest';

export const matchErrorToType = vi.fn(() => 'UNKNOWN');
export const isFatalError = vi.fn(() => false);
export const isCancellationError = vi.fn(() => false);
export const getProviderErrorPattern = vi.fn(() => null);
