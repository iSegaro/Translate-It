import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, onBeforeMount } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { useDesktopFabVisibility } from './useDesktopFabVisibility.js';

const mocks = vi.hoisted(() => ({
  storageChanged: new Set(),
  getFresh: vi.fn(),
  eventListeners: new Map(),
  runtimeMessageListeners: new Set(),
  runtimeId: 'test-runtime-id',
  logger: { error: vi.fn() },
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: { onChanged: {
      addListener: callback => mocks.storageChanged.add(callback),
      removeListener: callback => mocks.storageChanged.delete(callback),
    } },
    runtime: {
      id: mocks.runtimeId,
      onMessage: {
        addListener: callback => mocks.runtimeMessageListeners.add(callback),
        removeListener: callback => mocks.runtimeMessageListeners.delete(callback),
      },
    },
  },
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageCore: {
    getFresh: (...args) => mocks.getFresh(...args),
    on: (event, callback) => mocks.storageChanged.add(callback),
    off: (event, callback) => mocks.storageChanged.delete(callback),
  },
}));

vi.mock('@/features/desktop-fab/desktopFabExclusions.js', () => ({
  getDesktopFabExclusionKey: (scope, url) => `${scope}:${url}`,
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    on: (event, callback) => {
      mocks.eventListeners.set(callback, event);
    },
    off: (event, callback) => mocks.eventListeners.delete(callback),
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => mocks.logger,
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { CONTENT_APP: 'content-app' },
}));

describe('useDesktopFabVisibility', () => {
  let wrapper;
  let visibility;
  let environment;
  let beforeMountNavigation;

  const Harness = defineComponent({
    setup() {
      visibility = useDesktopFabVisibility({ getEnvironment: () => environment });
      onBeforeMount(() => beforeMountNavigation?.());
      return () => null;
    },
  });

  const mountComposable = () => {
    wrapper = mount(Harness);
  };

  const currentKeys = () => [`page:${window.location.href}`, `site:${window.location.href}`];
  const emitStorageChange = (key, newValue) => {
    for (const listener of mocks.storageChanged) {
      listener({ key, newValue });
    }
  };
  const emitFeatureChange = () => {
    for (const [callback, event] of mocks.eventListeners) {
      if (event === 'FEATURE_STATUS_CHANGED') callback();
    }
  };
  const emitSpaNavigation = (data = {}, sender = { id: mocks.runtimeId }) => {
    for (const listener of mocks.runtimeMessageListeners) {
      listener({ action: 'SPA_NAVIGATION', data }, sender);
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageChanged.clear();
    mocks.eventListeners.clear();
    mocks.runtimeMessageListeners.clear();
    beforeMountNavigation = null;
    window.history.replaceState({}, '', '/desktop-fab-test');
    environment = { isTopFrame: true, extensionEnabled: true, showDesktopFab: true };
    mocks.getFresh.mockImplementation(async keys => Object.fromEntries(keys.map(key => [key, false])));
  });

  afterEach(() => wrapper?.unmount());

  it('fails closed until the initial fresh exclusion read resolves', async () => {
    let resolveRead;
    mocks.getFresh.mockReturnValueOnce(new Promise(resolve => { resolveRead = resolve; }));
    mountComposable();

    expect(visibility.isReady.value).toBe(false);
    expect(visibility.isDismissed.value).toBe(true);
    expect(mocks.storageChanged.size).toBe(1);

    resolveRead({});
    await flushPromises();
    expect(visibility.isReady.value).toBe(true);
    expect(visibility.isDismissed.value).toBe(false);
  });

  it('uses the current href when navigation occurs between setup and mount', async () => {
    beforeMountNavigation = () => window.history.replaceState({}, '', '/changed-before-mount');
    mountComposable();
    await flushPromises();

    expect(mocks.getFresh.mock.calls[0][0]).toEqual([
      `page:${window.location.href}`,
      `site:${window.location.href}`,
    ]);
    expect(visibility.isReady.value).toBe(true);
  });

  it('fences stale reads and resets temporary dismissal only when full href changes', async () => {
    let resolveOld;
    mocks.getFresh
      .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockImplementation(async keys => Object.fromEntries(keys.map(key => [key, false])));
    mountComposable();
    visibility.dismiss({ scope: 'temporary' });

    window.history.pushState({}, '', '/desktop-fab-test?query=changed');
    emitFeatureChange();
    await flushPromises();
    expect(visibility.isDismissed.value).toBe(false);

    resolveOld({ [currentKeys()[0]]: true });
    await flushPromises();
    expect(visibility.isDismissed.value).toBe(false);

    visibility.dismiss({ scope: 'temporary' });
    window.history.replaceState({}, '', '/desktop-fab-test?query=changed#hash');
    emitFeatureChange();
    await flushPromises();
    expect(visibility.isDismissed.value).toBe(false);

    visibility.dismiss({ scope: 'temporary' });
    window.history.replaceState({}, '', '/desktop-fab-test?query=changed#hash');
    emitFeatureChange();
    expect(visibility.isDismissed.value).toBe(true);
  });

  it('restores visibility on cross-tab removal and keeps temporary dismissal local', async () => {
    mountComposable();
    await flushPromises();
    const [pageKey] = currentKeys();
    mocks.getFresh.mockResolvedValue({ [pageKey]: true });
    emitStorageChange(pageKey, true);
    await flushPromises();
    expect(visibility.isDismissed.value).toBe(true);

    mocks.getFresh.mockResolvedValue({ [pageKey]: false });
    emitStorageChange(pageKey, undefined);
    await flushPromises();
    expect(visibility.isDismissed.value).toBe(false);

    visibility.dismiss({ scope: 'temporary' });
    expect(mocks.getFresh).toHaveBeenCalledTimes(3);
    expect(mocks.storageChanged.size).toBe(1);
    expect(visibility.isDismissed.value).toBe(true);
  });

  it('refreshes after persisted page/site dismissal without writing global settings', async () => {
    mountComposable();
    await flushPromises();
    visibility.dismiss({ scope: 'site' });
    await flushPromises();
    expect(mocks.getFresh).toHaveBeenCalledTimes(2);
    expect(visibility.isDismissed.value).toBe(false);
  });

  it.each(['page', 'site'])('reconciles a successful %s dismissal with its durable exclusion', async (scope) => {
    const [pageKey, siteKey] = currentKeys();
    const exclusionKey = scope === 'page' ? pageKey : siteKey;
    mocks.getFresh.mockResolvedValue({ [exclusionKey]: true });
    mountComposable();
    await flushPromises();
    visibility.setChildPresence(true);
    expect(visibility.getStatus()).toMatchObject({ status: 'hidden', reason: 'excluded' });

    expect(visibility.setOverride({ expectedUrl: window.location.href, override: 'show' }))
      .toMatchObject({ success: true, status: 'visible' });

    let finishRead;
    mocks.getFresh.mockReturnValueOnce(new Promise(resolve => { finishRead = resolve; }));
    visibility.dismiss({ scope });
    expect(visibility.isDismissed.value).toBe(true);
    expect(visibility.getStatus()).toMatchObject({ status: 'hidden', reason: 'override-hide' });
    expect(visibility.setOverride({ expectedUrl: window.location.href, override: 'show' }))
      .toMatchObject({ success: false, reason: 'exclusion-reconciling' });

    finishRead({ [exclusionKey]: true });
    await flushPromises();
    expect(visibility.getStatus()).toMatchObject({ status: 'hidden', reason: 'excluded' });

    mocks.getFresh.mockResolvedValue({ [pageKey]: false, [siteKey]: false });
    emitStorageChange(exclusionKey, undefined);
    await flushPromises();
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
  });

  it('does not apply a persistent hide override when no successful dismiss event arrives', async () => {
    mountComposable();
    await flushPromises();
    visibility.setChildPresence(true);
    visibility.setOverride({ expectedUrl: window.location.href, override: 'show' });

    // A failed persistent write emits no dismiss event, so the parent does not call dismiss().
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
    expect(mocks.getFresh).toHaveBeenCalledTimes(1);
  });

  it('does not pin persistent hide after reconciliation fails and a later read succeeds', async () => {
    mountComposable();
    await flushPromises();
    visibility.setChildPresence(true);
    visibility.setOverride({ expectedUrl: window.location.href, override: 'show' });

    mocks.getFresh.mockRejectedValueOnce(new Error('storage unavailable'));
    visibility.dismiss({ scope: 'site' });
    expect(visibility.isDismissed.value).toBe(true);
    await flushPromises();
    expect(visibility.isReady.value).toBe(false);
    expect(visibility.isDismissed.value).toBe(true);

    const [pageKey, siteKey] = currentKeys();
    mocks.getFresh.mockResolvedValue({ [pageKey]: false, [siteKey]: false });
    emitStorageChange(siteKey, undefined);
    await flushPromises();
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
  });

  it('does not let a stale persistent-dismiss read affect the accepted next URL', async () => {
    let finishOldRead;
    mocks.getFresh
      .mockImplementationOnce(async keys => Object.fromEntries(keys.map(key => [key, false])))
      .mockReturnValueOnce(new Promise(resolve => { finishOldRead = resolve; }))
      .mockImplementation(async keys => Object.fromEntries(keys.map(key => [key, false])));
    mountComposable();
    await flushPromises();
    visibility.setChildPresence(true);
    visibility.dismiss({ scope: 'page' });
    expect(visibility.isDismissed.value).toBe(true);

    const oldPageKey = currentKeys()[0];
    window.history.pushState({}, '', '/accepted-next-route');
    emitFeatureChange();
    await flushPromises();
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });

    finishOldRead({ [oldPageKey]: true });
    await flushPromises();
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
  });

  it('enforces override precedence without writing exclusions or settings', async () => {
    const [pageKey, siteKey] = currentKeys();
    mocks.getFresh.mockResolvedValue({ [pageKey]: true, [siteKey]: false });
    mountComposable();
    await flushPromises();
    expect(visibility.getStatus()).toMatchObject({ status: 'hidden', reason: 'excluded' });

    expect(visibility.setOverride({ expectedUrl: window.location.href, override: 'show' }))
      .toMatchObject({ success: true, status: 'loading' });
    visibility.setChildPresence(true);
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
    expect(visibility.setOverride({ expectedUrl: window.location.href, override: 'hide' }))
      .toMatchObject({ success: true, status: 'hidden', reason: 'override-hide' });
    expect(visibility.setOverride({ expectedUrl: window.location.href, override: 'show' }))
      .toMatchObject({ success: true, status: 'visible' });
    visibility.dismiss({ scope: 'temporary' });
    expect(visibility.getStatus()).toMatchObject({ status: 'hidden', reason: 'override-hide' });
    expect(visibility.setOverride({ expectedUrl: window.location.href, override: 'show' }))
      .toMatchObject({ success: true, status: 'visible' });
    expect(mocks.getFresh).toHaveBeenCalledTimes(1);
  });

  it('rejects stale/global-disabled override and reports child readiness/fullscreen', async () => {
    mountComposable();
    await flushPromises();
    expect(visibility.setOverride({ expectedUrl: 'https://old.example/', override: 'show' }))
      .toMatchObject({ success: false, reason: 'stale-url' });

    environment.extensionEnabled = false;
    expect(visibility.setOverride({ expectedUrl: window.location.href, override: 'show' }))
      .toMatchObject({ success: false, reason: 'global-disabled' });
    environment.extensionEnabled = true;
    expect(visibility.getStatus()).toMatchObject({ status: 'loading', reason: 'fab-settling' });
    visibility.setChildPresence(true);
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
    environment.isFullscreen = true;
    expect(visibility.getStatus()).toMatchObject({ status: 'unavailable', reason: 'fullscreen' });
    visibility.setChildPresence(false);
  });

  it.each([
    ['mobile UI', { isMobileUI: true }, 'mobile-ui'],
    ['fullscreen', { isFullscreen: true }, 'fullscreen'],
    ['restricted frame', { isRestricted: true }, 'restricted-context'],
    ['non-top frame', { isTopFrame: false }, 'restricted-context'],
    ['settings loading', { isInitialized: false }, 'settings-loading'],
    ['extension disabled', { extensionEnabled: false }, 'global-disabled'],
    ['global FAB disabled', { showDesktopFab: false }, 'global-disabled'],
  ])('does not accept either override while %s', async (_label, unavailableEnvironment, reason) => {
    mountComposable();
    await flushPromises();
    visibility.setChildPresence(true);
    Object.assign(environment, unavailableEnvironment);
    expect(visibility.getStatus()).toMatchObject({ status: expect.any(String), reason });

    for (const nextOverride of ['show', 'hide']) {
      expect(visibility.setOverride({ expectedUrl: window.location.href, override: nextOverride }))
        .toMatchObject({ success: false, status: 'unavailable', reason });
    }

    Object.assign(environment, {
      isMobileUI: false,
      isFullscreen: false,
      isRestricted: false,
      isTopFrame: true,
      isInitialized: true,
      extensionEnabled: true,
      showDesktopFab: true,
    });
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
  });

  it('rejects overrides while exclusion state is loading without retaining them', async () => {
    let finishRead;
    mocks.getFresh.mockReturnValueOnce(new Promise(resolve => { finishRead = resolve; }));
    mountComposable();
    for (const nextOverride of ['show', 'hide']) {
      expect(visibility.setOverride({ expectedUrl: window.location.href, override: nextOverride }))
        .toMatchObject({ success: false, status: 'unavailable', reason: 'exclusions-loading' });
    }

    const [pageKey] = currentKeys();
    finishRead({ [pageKey]: true });
    await flushPromises();
    visibility.setChildPresence(true);
    expect(visibility.getStatus()).toMatchObject({ status: 'hidden', reason: 'excluded' });
  });

  it('fails closed after an exclusion refresh read fails, including against a show override', async () => {
    mountComposable();
    await flushPromises();
    visibility.setChildPresence(true);
    expect(visibility.setOverride({ expectedUrl: window.location.href, override: 'show' }).success).toBe(true);

    mocks.getFresh.mockRejectedValueOnce(new Error('storage unavailable'));
    emitStorageChange(currentKeys()[0], true);
    await flushPromises();
    expect(visibility.isReady.value).toBe(false);
    expect(visibility.isDismissed.value).toBe(true);
    expect(visibility.getStatus()).toMatchObject({ status: 'loading', reason: 'exclusions-loading' });
    expect(visibility.setOverride({ expectedUrl: window.location.href, override: 'show' }))
      .toMatchObject({ success: false, status: 'unavailable', reason: 'exclusions-loading' });
    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it('keeps the same-url exclusion refresh from unmounting an already visible child', async () => {
    mountComposable();
    await flushPromises();
    visibility.setChildPresence(true);
    expect(visibility.getStatus().status).toBe('visible');

    let finishRefresh;
    mocks.getFresh.mockReturnValueOnce(new Promise(resolve => { finishRefresh = resolve; }));
    emitStorageChange(currentKeys()[0], true);
    expect(visibility.isReady.value).toBe(true);
    expect(visibility.getStatus().status).toBe('visible');

    finishRefresh({});
    await flushPromises();
    expect(visibility.getStatus().status).toBe('visible');
  });

  it('does not report or mutate visibility for a URL before accepted navigation arrives', async () => {
    mountComposable();
    await flushPromises();
    visibility.setChildPresence(true);
    window.history.pushState({}, '', '/pending-route');

    expect(visibility.getStatus()).toMatchObject({ status: 'loading', reason: 'navigation-pending' });
    expect(visibility.setOverride({ expectedUrl: window.location.href, override: 'show' }))
      .toMatchObject({ success: false, reason: 'stale-url' });

    emitFeatureChange();
    await flushPromises();
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
  });

  it('cleans up listeners and ignores late reads after unmount', async () => {
    let resolveRead;
    mocks.getFresh.mockReturnValueOnce(new Promise(resolve => { resolveRead = resolve; }));
    mountComposable();
    wrapper.unmount();

    expect(mocks.storageChanged.size).toBe(0);
    expect(mocks.eventListeners.size).toBe(0);
    resolveRead({});
    await nextTick();
    expect(visibility.isReady.value).toBe(false);
  });

  it('follows SPA URL changes via history/hash signals when FEATURE_STATUS_CHANGED never fires', async () => {
    mountComposable();
    await flushPromises();
    visibility.setChildPresence(true);
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });

    visibility.dismiss({ scope: 'temporary' });
    expect(visibility.getStatus()).toMatchObject({ status: 'hidden', reason: 'override-hide' });

    const readsBefore = mocks.getFresh.mock.calls.length;
    window.history.pushState({}, '', '/fallback-route');
    expect(visibility.getStatus()).toMatchObject({ status: 'loading', reason: 'navigation-pending' });

    // No FEATURE_STATUS_CHANGED emitted: the native fallback must accept the navigation.
    window.dispatchEvent(new Event('popstate'));
    await flushPromises();

    expect(mocks.getFresh.mock.calls.length).toBe(readsBefore + 1);
    expect(mocks.getFresh.mock.calls[readsBefore][0]).toEqual([
      `page:${window.location.href}`,
      `site:${window.location.href}`,
    ]);
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
    expect(visibility.setOverride({ expectedUrl: window.location.href, override: 'hide' }))
      .toMatchObject({ success: true, status: 'hidden', reason: 'override-hide' });
  });

  it('ignores same-href history events and dedupes dual navigation signals', async () => {
    mountComposable();
    await flushPromises();
    visibility.setChildPresence(true);
    const readsBefore = mocks.getFresh.mock.calls.length;

    window.dispatchEvent(new Event('popstate'));
    window.dispatchEvent(new Event('hashchange'));
    await flushPromises();
    expect(mocks.getFresh).toHaveBeenCalledTimes(readsBefore);
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });

    // Native signal and FEATURE_STATUS_CHANGED fire for one navigation:
    // only a single fail-closed re-read happens.
    window.history.pushState({}, '', '/deduped-route');
    window.dispatchEvent(new Event('hashchange'));
    emitFeatureChange();
    await flushPromises();
    expect(mocks.getFresh).toHaveBeenCalledTimes(readsBefore + 1);
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
  });

  it('removes window navigation listeners on unmount and ignores late fallback reads', async () => {    const removeSpy = vi.spyOn(window, 'removeEventListener');
    let resolveRead;
    mocks.getFresh.mockReturnValueOnce(new Promise(resolve => { resolveRead = resolve; }));
    mountComposable();
    const readsBefore = mocks.getFresh.mock.calls.length;
    wrapper.unmount();

    expect(removeSpy).toHaveBeenCalledWith('popstate', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
    removeSpy.mockRestore();

    window.history.pushState({}, '', '/late-route');
    window.dispatchEvent(new Event('popstate'));
    resolveRead({});
    await flushPromises();
    expect(mocks.getFresh).toHaveBeenCalledTimes(readsBefore);
    expect(visibility.isReady.value).toBe(false);
  });

  it('follows pushState navigation via SPA_NAVIGATION message when tracking is unavailable', async () => {
    mountComposable();
    await flushPromises();
    visibility.setChildPresence(true);
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
    expect(mocks.runtimeMessageListeners.size).toBe(1);

    visibility.dismiss({ scope: 'temporary' });
    expect(visibility.getStatus()).toMatchObject({ status: 'hidden', reason: 'override-hide' });

    const readsBefore = mocks.getFresh.mock.calls.length;
    window.history.pushState({}, '', '/spa-push-route');
    expect(visibility.getStatus()).toMatchObject({ status: 'loading', reason: 'navigation-pending' });

    // pushState fires no popstate/hashchange and FEATURE_STATUS_CHANGED never
    // fires; the background always forwards SPA_NAVIGATION (here with
    // navigationUnavailable, which page-translation tracking drops).
    emitSpaNavigation({ navigationUnavailable: true });
    await flushPromises();

    expect(mocks.getFresh.mock.calls.length).toBe(readsBefore + 1);
    expect(mocks.getFresh.mock.calls[readsBefore][0]).toEqual([
      `page:${window.location.href}`,
      `site:${window.location.href}`,
    ]);
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
    expect(visibility.setOverride({ expectedUrl: window.location.href, override: 'hide' }))
      .toMatchObject({ success: true, status: 'hidden', reason: 'override-hide' });
  });

  it('ignores untrusted and same-href SPA_NAVIGATION messages', async () => {
    mountComposable();
    await flushPromises();
    visibility.setChildPresence(true);
    const readsBefore = mocks.getFresh.mock.calls.length;

    emitSpaNavigation({ navigationUnavailable: true }, { id: 'other-extension' });
    emitSpaNavigation({ navigationUnavailable: true }, { id: mocks.runtimeId, tab: { id: 7 } });
    emitSpaNavigation({ navigationUnavailable: true }, undefined);
    for (const listener of mocks.runtimeMessageListeners) {
      listener({ action: 'SOMETHING_ELSE' }, { id: mocks.runtimeId });
    }
    emitSpaNavigation({ navigationUnavailable: true });
    await flushPromises();

    expect(mocks.getFresh).toHaveBeenCalledTimes(readsBefore);
    expect(visibility.getStatus()).toMatchObject({ status: 'visible' });
  });

  it('removes the runtime message listener on unmount and ignores late navigation messages', async () => {
    let resolveRead;
    mocks.getFresh.mockReturnValueOnce(new Promise(resolve => { resolveRead = resolve; }));
    mountComposable();
    const readsBefore = mocks.getFresh.mock.calls.length;
    wrapper.unmount();

    expect(mocks.runtimeMessageListeners.size).toBe(0);
    window.history.pushState({}, '', '/late-spa-route');
    emitSpaNavigation({ navigationUnavailable: true });
    resolveRead({});
    await flushPromises();
    expect(mocks.getFresh).toHaveBeenCalledTimes(readsBefore);
    expect(visibility.isReady.value).toBe(false);
  });
});
