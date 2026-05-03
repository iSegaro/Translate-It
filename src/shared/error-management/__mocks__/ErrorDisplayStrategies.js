import { vi } from 'vitest';

export const getErrorDisplayStrategy = vi.fn(() => ({
  type: 'TOAST',
  severity: 'error'
}));

export const processErrorMessage = vi.fn((msg) => msg);
export const shouldShowRetry = vi.fn(() => false);
export const shouldShowSettings = vi.fn(() => false);
export const getErrorIcon = vi.fn(() => 'error');
