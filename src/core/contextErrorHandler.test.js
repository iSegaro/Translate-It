import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@/core/contextCore.js');

const runtime = vi.hoisted(() => ({
  id: 'extension-id',
  getURL: vi.fn(() => 'chrome-extension://extension-id/test'),
}));

vi.mock('webextension-polyfill', () => ({
  default: { runtime },
}));

vi.mock('@/core/managers/core/NotificationManager.js', () => ({
  default: class NotificationManager {
    show() {}
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({ debug: vi.fn() })),
}));

import { contextState } from './contextCore.js';
import { handleContextError } from './contextErrorHandler.js';

describe('contextErrorHandler', () => {
  beforeEach(() => {
    contextState.isInvalidated = false;
    contextState.notificationShown = false;
  });

  it('does not permanently invalidate context for transient receiver failures', () => {
    const result = handleContextError(new Error('Receiving end does not exist'), 'test');

    expect(result.handled).toBe(true);
    expect(contextState.isInvalidated).toBe(false);
  });

  it('invalidates context for extension reload failures', () => {
    handleContextError(new Error('Extension context invalidated'), 'test');

    expect(contextState.isInvalidated).toBe(true);
  });
});
