import { describe, it, expect, afterEach, vi } from 'vitest';

const featureManagerMock = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  checkForUrlChange: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/core/managers/content/FeatureManager.js', () => ({
  FeatureManager: { getInstance: () => featureManagerMock },
}));

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

  it('registers SPA navigation in core messaging', async () => {
    const core = ContentScriptCore();
    const messageHandler = { registerHandler: vi.fn() };
    core.messageHandler = messageHandler;

    await core.registerCoreHandlers();

    const registration = messageHandler.registerHandler.mock.calls.find(
      ([action]) => action === 'SPA_NAVIGATION'
    );
    expect(registration).toBeDefined();

    await registration[1]();

    expect(featureManagerMock.initialize).toHaveBeenCalledOnce();
    expect(featureManagerMock.checkForUrlChange).toHaveBeenCalledOnce();
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
