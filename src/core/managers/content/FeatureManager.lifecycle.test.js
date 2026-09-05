import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exclusionChecker: {
    updateUrl: vi.fn(),
    isFeatureAllowed: vi.fn(),
    refreshSettings: vi.fn(),
    getFeatureStatus: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
  },
  storageManagerOn: vi.fn(),
  storageManagerOff: vi.fn(),
}));

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  ExclusionChecker: {
    getInstance: () => mocks.exclusionChecker,
    resetInstance: vi.fn(),
  },
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    on: mocks.storageManagerOn,
    off: mocks.storageManagerOff,
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    init: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: { getInstance: () => ({ handle: vi.fn() }) },
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({
  ErrorTypes: {},
}));
vi.mock('@/features/windows/managers/WindowsManager.js', () => ({
  WindowsManager: { resetInstance: vi.fn() },
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: vi.fn().mockResolvedValue({ success: true }),
  sendRegularMessage: vi.fn(),
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: { DEACTIVATE_SELECT_ELEMENT_MODE: 'DEACTIVATE_SELECT_ELEMENT_MODE' },
}));

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

import { FeatureManager } from './FeatureManager.js';

describe('FeatureManager lifecycle regressions', () => {
  let manager;
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.exclusionChecker.isFeatureAllowed.mockResolvedValue(true);
    mocks.exclusionChecker.refreshSettings.mockResolvedValue(undefined);
    // reset singleton
    await FeatureManager.resetInstance();
    // need to handle async cleanup from resetInstance
    manager = new FeatureManager();
    manager._lifecycleRevision = 0;
    manager._navigationRevision = 0;
    manager._featureRevisions.clear();
    manager._activationPromises.clear();
    manager._isCleaningUp = false;
    manager._cleanupPromise = null;
    manager._activeEvaluationPromise = null;
    manager._evaluationInProgress = false;
    manager._evaluationQueue = [];
    if (manager._evaluationDebounceTimer) {
      clearTimeout(manager._evaluationDebounceTimer);
      manager._evaluationDebounceTimer = null;
    }
    manager.activeFeatures.clear();
    manager.requestedFeatures.clear();
    manager.featureHandlers.clear();
    manager._selectElementAuthorityCleanupPending = false;
    manager.initialized = true;
    // ensure exclusionChecker is set
    manager.exclusionChecker = mocks.exclusionChecker;
  });

  afterEach(async () => {
    manager.cleanup();
    await FeatureManager.resetInstance();
    vi.restoreAllMocks();
  });

  it('pending activation loses to direct deactivation', async () => {
    const activateDeferred = deferred();
    const handler = {
      activate: vi.fn(() => activateDeferred.promise),
      deactivate: vi.fn().mockResolvedValue(true),
    };
    vi.spyOn(manager, 'loadFeatureHandler').mockResolvedValue(handler);
    vi.spyOn(manager, 'shouldActivateFeature').mockResolvedValue(true);

    const activation = manager.activateFeature('selectElement');
    // ensure handler creation started
    await Promise.resolve();
    await Promise.resolve();

    await manager.deactivateFeature('selectElement');

    activateDeferred.resolve(true);
    await activation;

    // give deactivate a chance to complete
    await Promise.resolve();
    expect(manager.isFeatureActive('selectElement')).toBe(false);
    expect(manager.getFeatureHandler('selectElement')).toBeUndefined();
    expect(handler.deactivate).toHaveBeenCalled();
  });

  it('requests authoritative Select Element shutdown before releasing its handler', async () => {
    const handler = {
      deactivate: vi.fn().mockResolvedValue({ success: true, cleanupCompleted: true }),
    };
    manager.featureHandlers.set('selectElement', handler);
    manager.activeFeatures.add('selectElement');

    await manager.deactivateFeature('selectElement');

    expect(handler.deactivate).toHaveBeenCalledOnce();
    expect(handler.deactivate).toHaveBeenCalledWith({
      reason: 'manual',
      requestGlobalDeactivation: true,
    });
    expect(manager.isFeatureActive('selectElement')).toBe(false);
    expect(manager.getFeatureHandler('selectElement')).toBeUndefined();
  });

  it('concurrent activation dedupes to one effective activation', async () => {
    const activateDeferred = deferred();
    const handler = {
      activate: vi.fn(() => activateDeferred.promise),
      deactivate: vi.fn(),
    };
    let createCount = 0;
    vi.spyOn(manager, 'loadFeatureHandler').mockImplementation(async () => {
      createCount++;
      return handler;
    });
    vi.spyOn(manager, 'shouldActivateFeature').mockResolvedValue(true);

    const a = manager.activateFeature('selectElement');
    const b = manager.activateFeature('selectElement');

    expect(manager._activationPromises.size).toBe(1);

    activateDeferred.resolve(true);
    await Promise.all([a, b]);

    expect(handler.activate).toHaveBeenCalledTimes(1);
    expect(manager.isFeatureActive('selectElement')).toBe(true);
    expect(createCount).toBe(1);
  });

  it('stale A waits for B: new activation serializes after stale cleanup (same singleton)', async () => {
    const order = [];
    const activateDeferredA = deferred();
    const activateDeferredB = deferred();
    let activateCallCount = 0;
    const handler = {
      activate: vi.fn(() => {
        activateCallCount++;
        if (activateCallCount === 1) {
          order.push('activate A start');
          return activateDeferredA.promise.then((v) => { order.push('activate A end'); return v; });
        }
        order.push('activate B start');
        return activateDeferredB.promise.then((v) => { order.push('activate B end'); return v; });
      }),
      deactivate: vi.fn(async () => { order.push('deactivate A'); }),
    };
    vi.spyOn(manager, 'loadFeatureHandler').mockResolvedValue(handler);
    vi.spyOn(manager, 'shouldActivateFeature').mockResolvedValue(true);

    const activationA = manager.activateFeature('selectElement');
    // wait for A to enter activate
    await new Promise(r => setTimeout(r, 0));
    expect(handler.activate).toHaveBeenCalledTimes(1);
    expect(activateCallCount).toBe(1);

    await manager.deactivateFeature('selectElement');
    expect(manager._featureRevisions.get('selectElement')).toBe(1);

    const activationB = manager.activateFeature('selectElement');
    // B must not start second activate yet
    await new Promise(r => setTimeout(r, 0));
    expect(handler.activate).toHaveBeenCalledTimes(1);
    expect(activateCallCount).toBe(1);

    activateDeferredA.resolve(true);
    await activationA;
    // stale A should have called deactivate before B starts
    expect(order).toContain('deactivate A');
    expect(order.indexOf('deactivate A')).toBeLessThan(order.indexOf('activate B start') !== -1 ? order.indexOf('activate B start') : Infinity);
    // allow B to start after A settles
    await new Promise(r => setTimeout(r, 0));
    expect(handler.activate).toHaveBeenCalledTimes(2);

    activateDeferredB.resolve(true);
    await activationB;

    expect(manager.isFeatureActive('selectElement')).toBe(true);
    expect(handler.deactivate).toHaveBeenCalledTimes(1);
    // no stale deactivate after B
    const deactivateAfterB = order.slice(order.indexOf('activate B end') + 1).filter(x => x === 'deactivate A');
    expect(deactivateAfterB.length).toBe(0);
  });

  it('cleanup during pending activation waits and prevents resurrection', async () => {
    const activateDeferred = deferred();
    const handler = {
      activate: vi.fn(() => activateDeferred.promise),
      deactivate: vi.fn().mockResolvedValue(true),
    };
    vi.spyOn(manager, 'loadFeatureHandler').mockResolvedValue(handler);
    vi.spyOn(manager, 'shouldActivateFeature').mockResolvedValue(true);

    const activation = manager.activateFeature('pageTranslation');
    await Promise.resolve();

    const cleanupPromise = manager.cleanupAsync();
    // cleanup should be pending waiting for activation to settle
    expect(manager._isCleaningUp).toBe(true);

    activateDeferred.resolve(true);
    await activation;
    await cleanupPromise;

    expect(manager.isFeatureActive('pageTranslation')).toBe(false);
    expect(manager.initialized).toBe(false);
  });

  it('cleanup waits for initialize and restores lifecycle once', async () => {
    manager.initialized = true;
    const cleanupPromise = manager.cleanupAsync();
    // immediately call initialize
    const initPromise = manager.initialize();
    // initialize should wait for cleanup
    expect(manager._cleanupPromise).not.toBeNull();
    await cleanupPromise;
    await initPromise;
    expect(manager.initialized).toBe(true);
    expect(manager._isCleaningUp).toBe(false);
  });

  it('in-flight reevaluation invalidated by cleanup does not activate', async () => {
    const shouldDeferred = deferred();
    const loadSpy = vi.spyOn(manager, 'loadFeatureHandler').mockResolvedValue({ activate: vi.fn().mockResolvedValue(true), deactivate: vi.fn() });
    mocks.exclusionChecker.isFeatureAllowed.mockImplementation(() => shouldDeferred.promise);
    manager.requestedFeatures.add('selectElement');
    const reeval = manager.reevaluateFeatures('test');
    // deterministically trigger evaluation without waiting for debounce
    if (manager._evaluationDebounceTimer) {
      clearTimeout(manager._evaluationDebounceTimer);
      manager._evaluationDebounceTimer = null;
    }
    manager._processEvaluationQueue();
    await Promise.resolve();
    expect(manager._activeEvaluationPromise).not.toBeNull();
    expect(manager._evaluationInProgress).toBe(true);
    const cleanupPromise = manager.cleanupAsync();
    shouldDeferred.resolve(true);
    await Promise.allSettled([reeval, cleanupPromise]);
    expect(loadSpy).not.toHaveBeenCalled();
    expect(manager.isFeatureActive('selectElement')).toBe(false);
    expect(manager._activeEvaluationPromise).toBeNull();
    // after cleanup, new evaluation should work
    mocks.exclusionChecker.isFeatureAllowed.mockResolvedValue(true);
    vi.spyOn(manager, 'shouldActivateFeature').mockResolvedValue(true);
    await manager.initialize();
    manager.requestedFeatures.add('selectElement');
    const secondLoadSpy = vi.spyOn(manager, 'loadFeatureHandler').mockResolvedValue({ activate: vi.fn().mockResolvedValue(true), deactivate: vi.fn() });
    const reeval2 = manager.reevaluateFeatures('after-cleanup');
    if (manager._evaluationDebounceTimer) {
      clearTimeout(manager._evaluationDebounceTimer);
      manager._evaluationDebounceTimer = null;
    }
    manager._processEvaluationQueue();
    await reeval2;
    expect(secondLoadSpy).toHaveBeenCalled();
  });

  it('evaluation error is owned by request promises without unhandled rejection', async () => {
    const error = new Error('shouldActivate failure');
    vi.spyOn(manager, 'shouldActivateFeature').mockRejectedValue(error);
    manager.requestedFeatures.add('selectElement');
    const reeval = manager.reevaluateFeatures('error-test');
    if (manager._evaluationDebounceTimer) {
      clearTimeout(manager._evaluationDebounceTimer);
      manager._evaluationDebounceTimer = null;
    }
    manager._processEvaluationQueue();
    await expect(reeval).rejects.toBe(error);
    expect(manager._activeEvaluationPromise).toBeNull();
    expect(manager._evaluationInProgress).toBe(false);
    // later reevaluation can run
    vi.spyOn(manager, 'shouldActivateFeature').mockResolvedValue(true);
    vi.spyOn(manager, 'loadFeatureHandler').mockResolvedValue({ activate: vi.fn().mockResolvedValue(true), deactivate: vi.fn() });
    const reeval2 = manager.reevaluateFeatures('after-error');
    if (manager._evaluationDebounceTimer) {
      clearTimeout(manager._evaluationDebounceTimer);
      manager._evaluationDebounceTimer = null;
    }
    manager._processEvaluationQueue();
    await expect(reeval2).resolves.toBeUndefined();
    expect(manager._activeEvaluationPromise).toBeNull();
  });

  it('empty evaluation completes and clears promise', async () => {
    manager.requestedFeatures.clear();
    const reeval = manager.reevaluateFeatures('empty');
    await new Promise(r => setTimeout(r, 150));
    await reeval;
    expect(manager._activeEvaluationPromise).toBeNull();
    expect(manager._evaluationInProgress).toBe(false);
  });
});
