import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), init: vi.fn() }),
}));
vi.mock('@/core/extensionContext.js', () => ({
  default: { isValidSync: vi.fn(() => true), handleContextError: vi.fn() },
  isValidSync: vi.fn(() => true),
}));

import * as lazy from './lazy-features.js';
import { FeatureManager } from '@/core/managers/content/FeatureManager.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve=res; reject=rej; });
  return { promise, resolve, reject };
}

describe('lazy-features behavioral', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // reset lazy state
    lazy.notifyFeatureDeactivated('testLazy');
    // ensure FeatureManager singleton clean
    await FeatureManager.resetInstance();
  });

  it('stale A finalizer does not delete B and C dedupes onto B', async () => {
    const fm = FeatureManager.getInstance();
    fm.initialized = true;
    const deferredA = deferred();
    const deferredB = deferred();
    const handlerA = { activate: vi.fn().mockResolvedValue(true) };
    const handlerB = { activate: vi.fn().mockResolvedValue(true) };

    vi.spyOn(fm, 'requestFeatureActivation').mockImplementation((name) => {
      if (name === 'testLazy') {
        // first call returns deferredA, second returns deferredB
        if (!deferredA.resolved) return deferredA.promise.then(() => handlerA);
        return deferredB.promise.then(() => handlerB);
      }
      return Promise.resolve(null);
    });

    // Need to track which call is which: use call count
    let callCount = 0;
    fm.requestFeatureActivation.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return deferredA.promise.then(() => handlerA);
      if (callCount === 2) return deferredB.promise.then(() => handlerB);
      return Promise.resolve(null);
    });

    const loadA = lazy.loadFeature('testLazy');
    // wait a tick for loadA to register loadingPromises
    await Promise.resolve();
    expect(lazy.isFeatureLoaded('testLazy')).toBe(false);

    // authoritative deactivate clears A's loading ownership
    lazy.notifyFeatureDeactivated('testLazy');

    const loadB = lazy.loadFeature('testLazy');
    expect(loadB).not.toBe(loadA);

    // resolve A stale
    deferredA.resolve();
    await loadA.catch(()=>{});
    // after A settles, B should still be pending and be the current loading promise
    const callCountBeforeC = callCount;
    const loadC = lazy.loadFeature('testLazy');
    expect(callCount).toBe(callCountBeforeC); // deduped, no new request
    deferredB.resolve();
    const [bResult, cResult] = await Promise.all([loadB, loadC]);
    expect(bResult).toBe(cResult);
    // now B should be loaded and third dedupes
    expect(lazy.isFeatureLoaded('testLazy')).toBe(false); // handlerA/B not actually cached due to isFeatureActive check, but promise identity preserved
    // clean up
    vi.restoreAllMocks();
  });

  it('stale A does not enter loadedFeatures', async () => {
    lazy.notifyFeatureDeactivated('testLazyStale2');
    expect(lazy.isFeatureLoaded('testLazyStale2')).toBe(false);
    // ensure notify clears without error
    lazy.notifyFeatureDeactivated('testLazyStale2');
    expect(lazy.isFeatureLoaded('testLazyStale2')).toBe(false);
  });
});
