import { describe, it, expect, afterEach } from 'vitest';

import { ContentScriptCore } from './ContentScriptCore.js';
import { IFrameContentScriptCore } from './IFrameContentScriptCore.js';

describe('Vue infrastructure frame contract', () => {
  afterEach(() => {
    delete window.translateItContentCore;
    delete window.featureManager;
  });

  it('main content core exposes Vue infrastructure loading', () => {
    const core = ContentScriptCore();
    expect(typeof core.loadVueApp).toBe('function');
    expect(core.vueLoaded).toBe(false);
  });

  it('iframe content core does not expose Vue loading', () => {
    const core = IFrameContentScriptCore();
    expect(core.loadVueApp).toBeUndefined();
    expect(core.vueLoaded).toBe(false);
  });

  it('iframe loadFeature("vue") resolves null without mounting Vue', async () => {
    const iframeCore = IFrameContentScriptCore();
    window.translateItContentCore = iframeCore;

    const result = await iframeCore.loadFeature('vue');

    expect(result).toBeNull();
  });
});
