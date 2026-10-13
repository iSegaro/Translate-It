import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const featureManagerMock = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  checkForUrlChange: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/core/managers/content/FeatureManager.js', () => ({
  FeatureManager: { getInstance: () => featureManagerMock },
}));

import { ContentScriptCore } from './ContentScriptCore.js';
import { IFrameContentScriptCore } from './IFrameContentScriptCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

describe('Vue infrastructure frame contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

    const navigationCursor = { documentEpoch: 1, routeRevision: 2, url: 'https://example.com/new-route' };
    await registration[1]({ data: { navigationCursor } });

    expect(featureManagerMock.initialize).toHaveBeenCalledOnce();
    expect(featureManagerMock.checkForUrlChange).toHaveBeenCalledExactlyOnceWith({
      navigationCursor, navigationUnavailable: undefined,
    });
  });

  it('registers Desktop FAB status and override handlers only on the main-frame core', async () => {
    const core = ContentScriptCore();
    const messageHandler = { registerHandler: vi.fn() };
    core.messageHandler = messageHandler;
    await core.registerCoreHandlers();

    const handlers = new Map(messageHandler.registerHandler.mock.calls);
    const getStatus = handlers.get(MessageActions.DESKTOP_FAB_GET_STATUS);
    const setOverride = handlers.get(MessageActions.DESKTOP_FAB_SET_OVERRIDE);
    expect(getStatus).toBeTypeOf('function');
    expect(setOverride).toBeTypeOf('function');
    expect(await getStatus()).toEqual({
      success: true, status: 'unavailable', url: window.location.href, reason: 'ui-absent',
    });

    const controller = {
      getStatus: vi.fn().mockResolvedValue({ success: true, status: 'visible', url: window.location.href }),
      setOverride: vi.fn().mockResolvedValue({ success: true, status: 'hidden', url: window.location.href }),
    };
    core.desktopFabController = controller;
    expect(await getStatus()).toMatchObject({ status: 'visible' });
    const data = { expectedUrl: window.location.href, override: 'hide' };
    expect(await setOverride({ data })).toMatchObject({ status: 'hidden' });
    expect(controller.setOverride).toHaveBeenCalledWith(data);
    expect(await setOverride({ data: { ...data, expectedUrl: 'https://stale.example/' } }))
      .toEqual({
        success: false, status: 'unavailable', url: window.location.href, reason: 'stale-url',
      });
    expect(controller.setOverride).toHaveBeenCalledOnce();

    const iframe = IFrameContentScriptCore();
    const iframeHandler = { registerHandler: vi.fn() };
    iframe.messageHandler = iframeHandler;
    iframe.registerCoreHandlers();
    expect(iframeHandler.registerHandler).not.toHaveBeenCalledWith(MessageActions.DESKTOP_FAB_GET_STATUS, expect.any(Function));
    expect(iframeHandler.registerHandler).not.toHaveBeenCalledWith(MessageActions.DESKTOP_FAB_SET_OVERRIDE, expect.any(Function));
  });

  it('iframe content core does not expose Vue loading', () => {
    const core = IFrameContentScriptCore();
    expect(core.loadVueApp).toBeUndefined();
    expect(core.vueLoaded).toBe(false);
  });

  it('iframe content core registers and handles SPA navigation locally', async () => {
    const core = IFrameContentScriptCore();
    const messageHandler = { registerHandler: vi.fn() };
    core.messageHandler = messageHandler;

    core.registerCoreHandlers();

    const registration = messageHandler.registerHandler.mock.calls.find(
      ([action]) => action === 'SPA_NAVIGATION'
    );
    expect(registration).toBeDefined();

    const navigationCursor = { documentEpoch: 2, routeRevision: 1, url: 'https://frame.example.com/#two' };
    await registration[1]({ data: { navigationCursor } });

    expect(featureManagerMock.initialize).toHaveBeenCalledOnce();
    expect(featureManagerMock.checkForUrlChange).toHaveBeenCalledExactlyOnceWith({
      navigationCursor, navigationUnavailable: undefined,
    });
  });

  it('iframe loadFeature("vue") resolves null without mounting Vue', async () => {
    const iframeCore = IFrameContentScriptCore();
    window.translateItContentCore = iframeCore;

    const result = await iframeCore.loadFeature('vue');

    expect(result).toBeNull();
  });
});
