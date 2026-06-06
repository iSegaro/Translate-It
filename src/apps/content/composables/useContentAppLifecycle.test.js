import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, nextTick, reactive, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { useContentAppLifecycle } from './useContentAppLifecycle.js';

const { applyThemeMock } = vi.hoisted(() => ({
  applyThemeMock: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onMessage: {},
      sendMessage: vi.fn(),
    },
  },
}));

vi.mock('@/utils/ui/theme.js', () => ({
  applyTheme: (...args) => applyThemeMock(...args),
}));

vi.mock('@/shared/toast/ToastIntegration.js', () => ({
  ToastIntegration: {
    createSingleton: vi.fn(() => ({
      initialize: vi.fn(),
      shutdown: vi.fn(),
    })),
  },
}));

vi.mock('@/core/managers/core/NotificationManager.js', () => ({
  default: vi.fn(),
}));

vi.mock('@/features/element-selection/SelectElementNotificationManager.js', () => ({
  getSelectElementNotificationManager: vi.fn().mockResolvedValue({
    cleanup: vi.fn(),
  }),
  SelectElementNotificationManager: {
    clearInstance: vi.fn(),
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('useContentAppLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.pageEventBus = {};
  });

  it('syncs content theme from runtime updates and store-driven theme changes', async () => {
    const settingsStore = reactive({
      isInitialized: true,
      settings: {
        THEME: 'light',
      },
      isDarkTheme: ref(false),
      loadSettings: vi.fn().mockResolvedValue(undefined),
      updateSettingLocally: vi.fn((key, value) => {
        settingsStore.settings[key] = value;
      }),
    });
    const updateSettingSpy = vi.spyOn(settingsStore, 'updateSettingLocally');

    const tracker = {
      addEventListener: vi.fn((target, eventName, handler) => {
        if (eventName === 'addListener') {
          tracker.runtimeListener = handler;
        }
      }),
    };

    const Harness = defineComponent({
      setup() {
        useContentAppLifecycle({
          settingsStore,
          tracker,
          updateToastRTL: vi.fn().mockResolvedValue(undefined),
          onNavigationCleanup: vi.fn(),
        });

        return () => null;
      },
    });

    mount(Harness);
    await flushPromises();
    await nextTick();

    expect(tracker.runtimeListener).toBeTypeOf('function');

    tracker.runtimeListener({
      action: 'THEME_CHANGED',
      payload: { theme: 'dark' },
    });

    expect(updateSettingSpy).toHaveBeenCalledWith('THEME', 'dark');
    expect(applyThemeMock).toHaveBeenCalledWith('dark');
    expect(settingsStore.settings.THEME).toBe('dark');

    applyThemeMock.mockClear();
    settingsStore.isDarkTheme = true;
    await flushPromises();
    await nextTick();

    expect(applyThemeMock).toHaveBeenCalledWith('dark');

    applyThemeMock.mockClear();
    settingsStore.isDarkTheme = false;
    await flushPromises();
    await nextTick();

    expect(applyThemeMock).toHaveBeenCalledWith('light');
  });
});
