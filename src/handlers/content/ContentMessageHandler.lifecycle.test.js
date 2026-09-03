import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentMessageHandler } from './ContentMessageHandler.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), init: vi.fn() }),
}));
vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class { trackResource() {} trackInterval() { return 1; } addEventListener() {} cleanup() {} },
}));
vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: { getInstance: () => ({ handle: vi.fn() }) },
}));
vi.mock('@/features/element-selection/utils/activationError.js', () => ({
  getSelectElementActivationErrorMessage: vi.fn(() => Promise.resolve('err')),
}));

function createFakeMessageHandler() {
  const handlers = new Map();
  return {
    handlers,
    isListenerActive: true,
    registerHandler: vi.fn((action, fn) => { handlers.set(action, fn); }),
    unregisterHandler: vi.fn((action) => { handlers.delete(action); }),
    listen: vi.fn(),
    stopListening: vi.fn(),
  };
}

describe('ContentMessageHandler atomic activation behavioral', () => {
  let handler;
  let fakeHandler;
  beforeEach(() => {
    ContentMessageHandler.resetInstance();
    handler = new ContentMessageHandler();
    fakeHandler = createFakeMessageHandler();
    globalThis.window = globalThis.window || {};
    globalThis.window.translateItContentCore = { messageHandler: fakeHandler };
  });

  it('rolls back partial registrations on failure and retries cleanly', async () => {
    let callCount = 0;
    fakeHandler.registerHandler.mockImplementation((action, fn) => {
      callCount++;
      if (callCount === 2) throw new Error('register fail');
      fakeHandler.handlers.set(action, fn);
    });
    const first = await handler.activate();
    expect(first).toBe(false);
    expect(handler.isActive).toBe(false);
    expect(handler._externallyRegistered).toBe(false);
    expect(fakeHandler.unregisterHandler).toHaveBeenCalled();
    expect(handler._registeredActions.size).toBe(0);
    // after rollback, fake handler should have no owned actions
    expect(fakeHandler.handlers.size).toBe(0);

    fakeHandler.registerHandler.mockClear();
    fakeHandler.unregisterHandler.mockClear();
    fakeHandler.registerHandler.mockImplementation((action, fn) => { fakeHandler.handlers.set(action, fn); });
    const second = await handler.activate();
    expect(second).toBe(true);
    expect(handler.isActive).toBe(true);
    expect(handler._registeredActions.size).toBeGreaterThan(0);
  });

  it('activate -> deactivate -> activate restores exactly once', async () => {
    const okHandler = createFakeMessageHandler();
    globalThis.window.translateItContentCore.messageHandler = okHandler;
    expect(await handler.activate()).toBe(true);
    const firstSize = okHandler.handlers.size;
    expect(firstSize).toBeGreaterThan(0);
    await handler.deactivate();
    expect(handler.isActive).toBe(false);
    expect(okHandler.handlers.size).toBe(0);
    // reset for second activate (need to clear _handlersPrepared? deactivate keeps it, so second activate will reuse)
    expect(await handler.activate()).toBe(true);
    expect(okHandler.handlers.size).toBe(firstSize);
  });
});
