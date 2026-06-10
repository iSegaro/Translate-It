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
  let mainHost;

  beforeEach(() => {
    vi.clearAllMocks();
    window.pageEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      once: vi.fn()
    };
    
    // Create the dummy host element that the code expects to find
    mainHost = document.createElement('div');
    mainHost.id = 'translate-it-host-main';
    document.body.appendChild(mainHost);
  });

  afterEach(() => {
    if (mainHost) {
      mainHost.remove();
      mainHost = null;
    }
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
    expect(applyThemeMock).toHaveBeenCalledWith('dark', mainHost);
    expect(settingsStore.settings.THEME).toBe('dark');

    applyThemeMock.mockClear();
    settingsStore.isDarkTheme = true;
    await flushPromises();
    await nextTick();

    expect(applyThemeMock).toHaveBeenCalledWith('dark', mainHost);

    applyThemeMock.mockClear();
    settingsStore.isDarkTheme = false;
    await flushPromises();
    await nextTick();

    expect(applyThemeMock).toHaveBeenCalledWith('light', mainHost);
  });
});

describe('Container styling and theme isolation', () => {
  it('verify injected host element has correct inline styles before insertion', async () => {
    const { loadVueApp } = await import('@/core/content-scripts/chunks/lazy-vue-app.js');
    
    // Clean up any existing host to force creation
    const existing = document.getElementById('translate-it-host-main');
    if (existing) existing.remove();
    
    const mockCore = {
      vueLoaded: false,
      dispatchEvent: vi.fn()
    };
    
    await loadVueApp(mockCore);
    
    const insertedHost = document.getElementById('translate-it-host-main');
    expect(insertedHost).not.toBeNull();
    
    // Check that inline styles match the non-intrusive flow layout
    expect(insertedHost.style.position).toBe('fixed');
    expect(insertedHost.style.width).toBe('0px');
    expect(insertedHost.style.height).toBe('0px');
    expect(insertedHost.style.overflow).toBe('visible');
    expect(insertedHost.style.top).toBe('0px');
    expect(insertedHost.style.left).toBe('0px');
    expect(insertedHost.style.zIndex).toBe('2147483647');
    expect(insertedHost.style.margin).toBe('0px');
    expect(insertedHost.style.padding).toBe('0px');
    expect(['', 'none', 'medium', 'medium none']).toContain(insertedHost.style.border); // empty/none/medium depending on JSDOM/HappyDOM
    expect(insertedHost.style.pointerEvents).toBe('none');
    
    // Clean up
    if (insertedHost) insertedHost.remove();
  });
});
