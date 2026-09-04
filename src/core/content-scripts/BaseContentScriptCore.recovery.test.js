import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initializeIntegration: vi.fn(),
  createMessageHandler: vi.fn(),
}));

vi.mock('@/shared/logging/logger.js', () => ({ getScopedLogger: () => ({ error: vi.fn(), warn: vi.fn() }) }));
vi.mock('@/shared/logging/logConstants.js', () => ({ LOG_COMPONENTS: { CONTENT: 'content' } }));
vi.mock('@/core/tabPermissions.js', () => ({ checkContentScriptAccess: () => ({ isAccessible: true }) }));
vi.mock('@/core/extensionContext.js', () => ({ default: { isValidSync: () => true } }));
vi.mock('@/shared/messaging/core/MessageHandler.js', () => ({ createMessageHandler: mocks.createMessageHandler }));
vi.mock('@/shared/messaging/core/ContentScriptIntegration.js', () => ({ initializeContentScriptIntegration: mocks.initializeIntegration }));
vi.mock('@/shared/error-management/windowErrorHandlers.js', () => ({ setupWindowErrorHandlers: vi.fn() }));

describe('BaseContentScriptCore recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete window.translateItContentScriptLoaded;
    delete window.translateItContentScriptInitializing;
    delete window._translateItBootstrapPromise;
  });

  it('leaves document authority uncommitted after messaging failure and recovers once', async () => {
    mocks.initializeIntegration
      .mockRejectedValueOnce(new Error('messaging unavailable'))
      .mockResolvedValueOnce(undefined);
    const handler = { isListenerActive: false, listen: vi.fn(function listen() { this.isListenerActive = true; }), stopListening: vi.fn() };
    mocks.createMessageHandler.mockReturnValue(handler);
    const { BaseContentScriptCore } = await import('./BaseContentScriptCore.js');
    const core = BaseContentScriptCore();

    await expect(core.initializeBase()).resolves.toBe(false);
    expect(window.translateItContentScriptLoaded).toBeUndefined();

    await expect(core.initializeBase()).resolves.toBe(true);
    expect(window.translateItContentScriptLoaded).toBe(true);
    expect(handler.listen).toHaveBeenCalledOnce();
  });
});
