import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, onBeforeMount } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { useDesktopFabVisibility } from './useDesktopFabVisibility.js';

const mocks = vi.hoisted(() => ({
  storageChanged: new Set(),
  getFresh: vi.fn(),
  eventListeners: new Map(),
  logger: { error: vi.fn() },
}));

vi.mock('webextension-polyfill', () => ({
  default: { storage: { onChanged: {
    addListener: callback => mocks.storageChanged.add(callback),
    removeListener: callback => mocks.storageChanged.delete(callback),
  } } },
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

  const mountComposable = () => {
    const Harness = defineComponent({
      setup() {
        visibility = useDesktopFabVisibility();
        return () => null;
      },
    });
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

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageChanged.clear();
    mocks.eventListeners.clear();
    window.history.replaceState({}, '', '/desktop-fab-test');
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
    const Harness = defineComponent({
      setup() {
        visibility = useDesktopFabVisibility();
        onBeforeMount(() => window.history.replaceState({}, '', '/changed-before-mount'));
        return () => null;
      },
    });
    wrapper = mount(Harness);
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
});
