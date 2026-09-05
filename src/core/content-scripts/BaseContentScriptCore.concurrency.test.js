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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('BaseContentScriptCore document ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.initializeIntegration.mockReset();
    mocks.createMessageHandler.mockReset();
    vi.resetModules();
    delete window.translateItContentScriptLoaded;
    delete window.translateItContentScriptInitializing;
    delete window._translateItBootstrapPromise;
    delete window._translateItWindowErrorHandlersModule;
  });

  it('two independent cores race: second does not create duplicate listener', async () => {
    const integrationDeferred = deferred();
    mocks.initializeIntegration.mockImplementation(() => integrationDeferred.promise);
    const handlerA = { isListenerActive: false, listen: vi.fn(function listen() { this.isListenerActive = true; }), stopListening: vi.fn() };
    const handlerB = { isListenerActive: false, listen: vi.fn(function listen() { this.isListenerActive = true; }), stopListening: vi.fn() };
    mocks.createMessageHandler.mockImplementationOnce(() => handlerA).mockImplementationOnce(() => handlerB);

    const { BaseContentScriptCore } = await import('./BaseContentScriptCore.js');
    const coreA = BaseContentScriptCore();
    const coreB = BaseContentScriptCore();

    const promiseA = coreA.initializeBase();
    // A has acquired ownership, B starts while A pending
    const promiseB = coreB.initializeBase();

    // B must not have created a second handler while A is initializing
    expect(mocks.createMessageHandler).toHaveBeenCalledTimes(0);
    expect(window.translateItContentScriptInitializing).toBe(true);

    integrationDeferred.resolve();
    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    expect(resultA).toBe(true);
    expect(resultB).toBe(false);
    expect(window.translateItContentScriptLoaded).toBe(true);
    expect(window.translateItContentScriptInitializing).toBe(false);
    expect(handlerA.listen).toHaveBeenCalledTimes(1);
    expect(handlerB.listen).not.toHaveBeenCalled();
    expect(coreA.baseInitialized).toBe(true);
    expect(coreB.baseInitialized).toBe(false);
  });

  it('owner failure releases reservation and allows retry', async () => {
    mocks.initializeIntegration.mockRejectedValueOnce(new Error('messaging unavailable')).mockResolvedValueOnce(undefined);
    const handlerSuccess = { isListenerActive: false, listen: vi.fn(function listen() { this.isListenerActive = true; }), stopListening: vi.fn() };
    mocks.createMessageHandler.mockReturnValue(handlerSuccess);

    const { BaseContentScriptCore } = await import('./BaseContentScriptCore.js');
    const coreA = BaseContentScriptCore();
    const resultA = await coreA.initializeBase();

    expect(resultA).toBe(false);
    expect(window.translateItContentScriptLoaded).toBeUndefined();
    expect(window.translateItContentScriptInitializing).toBe(false);
    expect(window._translateItBootstrapPromise).toBeFalsy();

    const coreB = BaseContentScriptCore();
    const resultB = await coreB.initializeBase();

    expect(resultB).toBe(true);
    expect(window.translateItContentScriptLoaded).toBe(true);
    expect(handlerSuccess.listen).toHaveBeenCalledTimes(1);
  });

  it('same instance concurrent calls dedupe to one handler', async () => {
    const integrationDeferred = deferred();
    mocks.initializeIntegration.mockImplementation(() => integrationDeferred.promise);
    const handler = { isListenerActive: false, listen: vi.fn(function listen() { this.isListenerActive = true; }), stopListening: vi.fn() };
    mocks.createMessageHandler.mockReturnValue(handler);

    const { BaseContentScriptCore } = await import('./BaseContentScriptCore.js');
    const core = BaseContentScriptCore();

    const p1 = core.initializeBase();
    const p2 = core.initializeBase();

    expect(mocks.createMessageHandler).toHaveBeenCalledTimes(0);

    integrationDeferred.resolve();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(mocks.createMessageHandler).toHaveBeenCalledTimes(1);
    expect(handler.listen).toHaveBeenCalledTimes(1);
  });
});
