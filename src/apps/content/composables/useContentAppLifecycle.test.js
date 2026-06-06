import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { useContentAppLifecycle } from './useContentAppLifecycle.js';

const { applyThemeMock } = vi.hoisted(() => ({
  applyThemeMock: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: (() => {
    const runtimeOnMessage = {};
    globalThis.__runtimeOnMessage = runtimeOnMessage;

    return {
      runtime: {
        onMessage: runtimeOnMessage,
        sendMessage: vi.fn(),
      },
    };
  })(),
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
    globalThis.__runtimeOnMessage = null;
    globalThis.__mediaQuery = null;
    window.pageEventBus = {};
    window.matchMedia = vi.fn(() => {
      const mediaQuery = {
        addEventListener: vi.fn((event, handler) => {
          if (event === 'change') {
            globalThis.__mediaQueryChangeListener = handler;
          }
        }),
        removeEventListener: vi.fn(),
        addListener: vi.fn((handler) => {
          globalThis.__mediaQueryChangeListener = handler;
        }),
        removeListener: vi.fn(),
        matches: false,
      };
      globalThis.__mediaQuery = mediaQuery;
      return mediaQuery;
    });
    globalThis.__runtimeMessageListener = null;
    globalThis.__mediaQueryChangeListener = null;
  });

  it('syncs content theme from runtime updates and system auto changes', async () => {
    const settingsStore = {
      isInitialized: true,
      settings: {
        THEME: 'light',
      },
      loadSettings: vi.fn().mockResolvedValue(undefined),
      updateSettingLocally: vi.fn((key, value) => {
        settingsStore.settings[key] = value;
      }),
    };

    const tracker = {
      addEventListener: vi.fn((target, eventName, handler) => {
        if (eventName === 'addListener') {
          globalThis.__runtimeMessageListener = handler;
        }

        if (target === globalThis.__mediaQuery && eventName === 'change') {
          globalThis.__mediaQueryChangeListener = handler;
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

    expect(applyThemeMock).toHaveBeenCalledWith('light');

    globalThis.__runtimeMessageListener({
      action: 'THEME_CHANGED',
      payload: { theme: 'dark' },
    });

    expect(settingsStore.updateSettingLocally).toHaveBeenCalledWith('THEME', 'dark');
    expect(applyThemeMock).toHaveBeenCalledWith('dark');
    expect(settingsStore.settings.THEME).toBe('dark');

    settingsStore.settings.THEME = 'auto';
    globalThis.__mediaQueryChangeListener({ matches: true });

    expect(applyThemeMock).toHaveBeenCalledWith('auto');
  });
});
