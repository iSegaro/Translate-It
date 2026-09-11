import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import ThemeSelector from './ThemeSelector.vue';
import browser from 'webextension-polyfill';

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key) => key
  })
}));

// Mock settings store: updateSettingLocally applies Pinia state synchronously
// (mirrors the real store); updateSettingAndPersist is controllable per test.
const mockUpdateSettingAndPersist = vi.fn();
const mockUpdateSettingLocally = vi.fn((key, value) => {
  mockSettingsStore.settings[key] = value;
});
const mockSettingsStore = reactive({
  settings: {
    THEME: 'auto'
  },
  updateSettingLocally: mockUpdateSettingLocally,
  updateSettingAndPersist: mockUpdateSettingAndPersist
});

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => mockSettingsStore
}));

// Mock resource tracker (no DOM listeners needed here)
vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({
    addEventListener: vi.fn()
  })
}));

// Mock logger to observe warn/debug without console noise
const { mockLoggerWarn, mockLoggerDebug } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
  mockLoggerDebug: vi.fn()
}));
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: mockLoggerDebug,
    warn: mockLoggerWarn
  })
}));

describe('ThemeSelector.vue - Latest-wins theme persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsStore.settings.THEME = 'auto';

    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));

    // Default: persistence resolves at once (state already applied locally).
    mockUpdateSettingAndPersist.mockImplementation(async () => true);
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({});
  });

  const clickCycleButton = async (wrapper) => {
    await wrapper.find('.theme-cycle-btn').trigger('click');
  };

  it('applies a single click locally, persists, and broadcasts after settle', async () => {
    const wrapper = mount(ThemeSelector);

    await clickCycleButton(wrapper);
    await flushPromises();

    expect(mockUpdateSettingLocally).toHaveBeenCalledWith('THEME', 'light');
    expect(mockSettingsStore.settings.THEME).toBe('light');
    expect(mockUpdateSettingAndPersist).toHaveBeenCalledTimes(1);
    expect(mockUpdateSettingAndPersist).toHaveBeenCalledWith('THEME', 'light');
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'THEME_CHANGED',
      payload: { theme: 'light' }
    });
  });

  it('does not broadcast before persistence settles', async () => {
    let resolvePersist;
    mockUpdateSettingAndPersist.mockImplementationOnce(
      () => new Promise((resolve) => { resolvePersist = resolve; })
    );
    const wrapper = mount(ThemeSelector);

    await clickCycleButton(wrapper);
    await flushPromises();

    // Local state applied at once, but no broadcast while persistence pending.
    expect(mockSettingsStore.settings.THEME).toBe('light');
    expect(mockUpdateSettingAndPersist).toHaveBeenCalledWith('THEME', 'light');
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();

    resolvePersist(true);
    await flushPromises();

    expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'THEME_CHANGED',
      payload: { theme: 'light' }
    });
  });

  it('three rapid clicks apply locally at once, persist latest, never broadcast stale', async () => {
    const resolvers = [];
    mockUpdateSettingAndPersist.mockImplementation(
      () => new Promise((resolve) => { resolvers.push(resolve); })
    );
    const wrapper = mount(ThemeSelector);

    // Persistence blocked: every click still computes from the latest local
    // state — auto -> light -> dark -> auto — before anything resolves.
    await clickCycleButton(wrapper);
    expect(mockSettingsStore.settings.THEME).toBe('light');
    await clickCycleButton(wrapper);
    expect(mockSettingsStore.settings.THEME).toBe('dark');
    await clickCycleButton(wrapper);
    expect(mockSettingsStore.settings.THEME).toBe('auto');

    // No concurrent writes: only the first (then-latest) write started.
    expect(mockUpdateSettingAndPersist).toHaveBeenCalledTimes(1);
    expect(mockUpdateSettingAndPersist).toHaveBeenCalledWith('THEME', 'light');
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();

    resolvers[0](true);
    await flushPromises();

    // light was superseded mid-flight: coalesced straight to latest (auto);
    // the stale light broadcast is suppressed.
    expect(mockUpdateSettingAndPersist).toHaveBeenCalledTimes(2);
    expect(mockUpdateSettingAndPersist).toHaveBeenNthCalledWith(2, 'THEME', 'auto');
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();

    resolvers[1](true);
    await flushPromises();

    // Only the final selection is ever broadcast.
    expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'THEME_CHANGED',
      payload: { theme: 'auto' }
    });
    expect(mockSettingsStore.settings.THEME).toBe('auto');
  });

  it('rejection is handled, latest is still attempted, worker stays reusable', async () => {
    const failures = [];
    const onUnhandled = (reason) => failures.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const gates = [];
      mockUpdateSettingAndPersist.mockImplementation(
        () => new Promise((resolve, reject) => { gates.push({ resolve, reject }); })
      );
      const wrapper = mount(ThemeSelector);

      await clickCycleButton(wrapper);
      expect(mockSettingsStore.settings.THEME).toBe('light');
      await clickCycleButton(wrapper);
      expect(mockSettingsStore.settings.THEME).toBe('dark');
      expect(mockUpdateSettingAndPersist).toHaveBeenCalledTimes(1);

      // First (stale) write fails: logged, no rollback, latest still attempted.
      gates[0].reject(new Error('storage failed'));
      await flushPromises();

      expect(mockLoggerWarn).toHaveBeenCalled();
      expect(mockSettingsStore.settings.THEME).toBe('dark');
      expect(mockUpdateSettingAndPersist).toHaveBeenCalledTimes(2);
      expect(mockUpdateSettingAndPersist).toHaveBeenNthCalledWith(2, 'THEME', 'dark');
      expect(browser.runtime.sendMessage).not.toHaveBeenCalled();

      gates[1].resolve(true);
      await flushPromises();

      expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'THEME_CHANGED',
        payload: { theme: 'dark' }
      });

      // Worker reusable after failure: next click persists and broadcasts.
      await clickCycleButton(wrapper);
      expect(mockSettingsStore.settings.THEME).toBe('auto');
      await flushPromises();

      expect(mockUpdateSettingAndPersist).toHaveBeenCalledTimes(3);
      expect(mockUpdateSettingAndPersist).toHaveBeenNthCalledWith(3, 'THEME', 'auto');

      gates[2].resolve(true);
      await flushPromises();

      expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(2);
      expect(browser.runtime.sendMessage).toHaveBeenNthCalledWith(2, {
        action: 'THEME_CHANGED',
        payload: { theme: 'auto' }
      });

      // Let any unhandled rejection surface.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(failures).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('preserves cycle order auto -> light -> dark -> auto', async () => {
    const wrapper = mount(ThemeSelector);

    await clickCycleButton(wrapper);
    await flushPromises();
    await clickCycleButton(wrapper);
    await flushPromises();
    await clickCycleButton(wrapper);
    await flushPromises();

    expect(mockUpdateSettingLocally).toHaveBeenNthCalledWith(1, 'THEME', 'light');
    expect(mockUpdateSettingLocally).toHaveBeenNthCalledWith(2, 'THEME', 'dark');
    expect(mockUpdateSettingLocally).toHaveBeenNthCalledWith(3, 'THEME', 'auto');
    expect(mockSettingsStore.settings.THEME).toBe('auto');
  });
});
