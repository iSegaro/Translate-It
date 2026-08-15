import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/core/managers/content/FeatureManager.js', () => ({
  FeatureManager: { getInstance: vi.fn() }
}));

import { loadFeatureOnDemand, getFeatureManager } from './lazy-features.js';
import { FeatureManager } from '@/core/managers/content/FeatureManager.js';

describe('loadFeatureOnDemand vue special-case', () => {
  afterEach(() => {
    delete window.translateItContentCore;
    delete window.featureManager;
  });

  it('top-frame core: delegates to loadVueApp, returns vueLoaded, never reaches FeatureManager activation', async () => {
    const loadVueApp = vi.fn().mockResolvedValue(undefined);
    window.translateItContentCore = { loadVueApp, vueLoaded: true };

    const result = await loadFeatureOnDemand('vue');

    expect(loadVueApp).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
    expect(getFeatureManager()).toBeNull();
    expect(FeatureManager.getInstance).not.toHaveBeenCalled();
  });

  it('iframe-like core without loadVueApp: returns null, does not throw, never reaches FeatureManager activation', async () => {
    window.translateItContentCore = {};

    const result = await loadFeatureOnDemand('vue');

    expect(result).toBeNull();
    expect(getFeatureManager()).toBeNull();
    expect(FeatureManager.getInstance).not.toHaveBeenCalled();
  });
});
