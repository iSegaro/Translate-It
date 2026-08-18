import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shortcutManager: {
    initialized: false,
    initialize: vi.fn(),
    cleanup: vi.fn(),
    handleKeyboardEvent: vi.fn(),
  },
  detectPlatform: vi.fn(() => 'LINUX'),
  errorHandler: { handle: vi.fn() },
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    constructor() {}
    cleanup() {}
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
  })),
}));

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: {
    getBrowserUtils: vi.fn(() => Promise.resolve({ detectPlatform: mocks.detectPlatform })),
  },
}));

vi.mock('@/core/managers/content/shortcuts/ShortcutManager.js', () => ({
  shortcutManager: mocks.shortcutManager,
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: { getInstance: vi.fn(() => mocks.errorHandler) },
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({
  ErrorTypes: { SERVICE: 'SERVICE' },
}));

import { ShortcutHandler } from './ShortcutHandler.js';

describe('ShortcutHandler lifecycle and delegation', () => {
  let handler;

  beforeEach(() => {
    vi.clearAllMocks();
    window.__shortcutHandlerDisabled = false;
    mocks.shortcutManager.initialized = false;
    handler = new ShortcutHandler({ featureManager: 'feature-manager' });
  });

  it('activates by initializing ShortcutManager', async () => {
    await expect(handler.activate()).resolves.toBe(true);

    expect(mocks.shortcutManager.initialize).toHaveBeenCalledWith({
      featureManager: 'feature-manager',
    });
    expect(handler.isActive).toBe(true);
  });

  it('delegates keyboard events to active ShortcutManager', async () => {
    handler.isActive = true;
    mocks.shortcutManager.initialized = true;
    mocks.shortcutManager.handleKeyboardEvent.mockResolvedValue('handled');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });

    await expect(handler.handleKeyboardEvent(event)).resolves.toBe('handled');
    expect(mocks.shortcutManager.handleKeyboardEvent).toHaveBeenCalledWith(event);
  });

  it('deactivates safely and cleans ShortcutManager', async () => {
    await handler.activate();
    mocks.shortcutManager.initialized = true;

    await expect(handler.deactivate()).resolves.toBe(true);

    expect(mocks.shortcutManager.cleanup).toHaveBeenCalledTimes(1);
    expect(handler.isActive).toBe(false);
  });
});
