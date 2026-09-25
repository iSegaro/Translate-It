import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, reactive, ref } from 'vue';
import TranslationWindow from './TranslationWindow.vue';

let currentMediaQueryList = null;

const createSettingsStore = () => {
  const store = reactive({
    settings: {
      THEME: 'light',
      WINDOW_IS_PINNED: false,
      WINDOW_DOCK_MODE: 'none',
      WINDOW_DOCKED_WIDTH: 350,
    },
    getSetting: vi.fn(),
    updateSettingAndPersist: vi.fn(),
  });

  store.getSetting = vi.fn((key, fallback) => store.settings[key] ?? fallback);
  // Mirrors the real store: Pinia state applies synchronously, persistence
  // resolves afterwards (and rejects on storage failure).
  store.updateSettingAndPersist = vi.fn(async (key, value) => {
    store.settings[key] = value;
    return true;
  });

  return store;
};

const createMediaQueryList = (matches = false) => {
  const listeners = new Set();

  return {
    media: '(prefers-color-scheme: dark)',
    matches,
    addEventListener: vi.fn((event, handler) => {
      if (event === 'change') {
        listeners.add(handler);
      }
    }),
    removeEventListener: vi.fn((event, handler) => {
      if (event === 'change') {
        listeners.delete(handler);
      }
    }),
    addListener: vi.fn((handler) => {
      listeners.add(handler);
    }),
    removeListener: vi.fn((handler) => {
      listeners.delete(handler);
    }),
    dispatchChange(nextMatches) {
      this.matches = nextMatches;
      listeners.forEach((handler) => handler({ matches: nextMatches, media: this.media }));
    },
  };
};

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    emit: vi.fn(),
  },
  WINDOWS_MANAGER_EVENTS: {
    OPEN_SETTINGS: 'open-settings',
  },
}));

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => key,
  }),
}));

vi.mock('@/composables/ui/usePositioning.js', () => ({
  usePositioning: () => {
    const currentPosition = ref({ x: 0, y: 0 });
    const currentDockMode = ref('none');
    globalThis.__mockCurrentDockMode = currentDockMode;

    return {
      currentPosition,
      isDragging: ref(false),
      currentDockMode,
      positionStyle: ref({}),
      startDrag: vi.fn(),
      updatePosition: vi.fn(),
      updateDockMode: vi.fn(),
      updateDockedWidth: vi.fn(),
      cleanup: vi.fn(),
    };
  },
}));

vi.mock('@/features/tts/composables/useTTSSmart.js', () => ({
  useTTSSmart: () => ({
    stopAll: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/shared/messaging/composables/useMessaging.js', () => ({
  useMessaging: vi.fn(),
}));

const { trackedDisposers } = vi.hoisted(() => ({ trackedDisposers: [] }));

vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({
    trackResource: vi.fn((resourceId, cleanupFn) => {
      trackedDisposers.push(cleanupFn);
    }),
    addEventListener: vi.fn((element, event, handler, options) => {
      element.addEventListener(event, handler, options);
      trackedDisposers.push(() => element.removeEventListener(event, handler));
    }),
    trackTimeout: vi.fn(),
  }),
}));

vi.mock('@/store/modules/mobile.js', () => ({
  useMobileStore: () => ({
    isFullscreen: false,
  }),
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => globalThis.__mockSettingsStore,
}));

// Silent logger; warn is observed by the persistence-failure tests.
const { mockLoggerWarn } = vi.hoisted(() => ({ mockLoggerWarn: vi.fn() }));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: mockLoggerWarn,
    trace: vi.fn(),
    operation: vi.fn(),
  }),
}));

vi.mock('@/core/content-scripts/chunks/lazy-styles.js', () => ({
  windowsUiStyles: '',
}));

vi.mock('@/utils/ui/styleInjector.js', () => ({
  injectStylesToShadowRoot: vi.fn(),
}));

vi.mock('@/components/shared/TranslationDisplay.vue', () => ({
  default: {
    name: 'TranslationDisplay',
    props: {
      content: { type: String, default: '' },
      mode: { type: String, default: '' },
      lastTranslation: { type: Object, default: null },
    },
    template: '<div class="translation-display-stub" />',
  },
}));

vi.mock('@/components/shared/ProviderSelector.vue', () => ({
  default: {
    name: 'ProviderSelector',
    props: {
      modelValue: { type: String, default: '' },
    },
    template: '<div class="provider-selector-stub" />',
  },
}));

vi.mock('@/components/base/LoadingSpinner.vue', () => ({
  default: {
    name: 'LoadingSpinner',
    props: {
      size: { type: String, default: '' },
    },
    template: '<div class="loading-spinner-stub" />',
  },
}));

vi.mock('@/components/shared/TTSButton.vue', () => ({
  default: {
    name: 'TTSButton',
    props: {
      text: { type: String, default: '' },
      language: { type: String, default: '' },
      isDictionary: { type: Boolean, default: false },
    },
    template: '<button class="tts-button-stub" />',
  },
}));

describe('TranslationWindow.vue', () => {
  const baseProps = {
    id: 'window-1',
    position: { x: 0, y: 0 },
    selectedText: 'expressions',
    initialTranslatedText: '表达方式',
    theme: 'light',
    isLoading: false,
    isStreaming: false,
    isError: false,
    errorType: null,
    canRetry: false,
    needsSettings: false,
    initialSize: 'normal',
    targetLanguage: 'fa',
    sourceLanguage: 'en',
    detectedSourceLanguage: 'en',
    provider: 'gemini',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    trackedDisposers.length = 0;
    vi.stubGlobal('requestAnimationFrame', (cb) => cb());
    globalThis.__mockSettingsStore = createSettingsStore();
    currentMediaQueryList = createMediaQueryList(false);
    vi.stubGlobal('matchMedia', vi.fn(() => currentMediaQueryList));
    window.windowsManagerInstance = {
      state: {
        setPinned: vi.fn(),
        setDockMode: vi.fn(),
      },
    };
  });

  it('keeps compact window rendering unchanged when translation is not dictionary mode', async () => {
    const wrapper = mount(TranslationWindow, {
      props: {
        ...baseProps,
        translationMode: null,
      },
    });

    const display = wrapper.findComponent({ name: 'TranslationDisplay' });
    expect(display.exists()).toBe(true);
    expect(display.props('mode')).toBe('compact');
    expect(display.props('lastTranslation')).toBeNull();
  });

  it('updates the open window shell when the settings theme changes', async () => {
    const wrapper = mount(TranslationWindow, {
      props: baseProps,
    });

    const windowRoot = wrapper.find('.translation-window');

    expect(windowRoot.classes()).toContain('light');
    expect(windowRoot.classes()).not.toContain('dark');

    globalThis.__mockSettingsStore.settings.THEME = 'dark';
    await nextTick();

    expect(windowRoot.classes()).toContain('dark');
    expect(windowRoot.classes()).not.toContain('light');
  });

  it('keeps pinned and docked classes intact while using live theme state', async () => {
    globalThis.__mockSettingsStore.settings.WINDOW_IS_PINNED = true;
    globalThis.__mockSettingsStore.settings.WINDOW_DOCK_MODE = 'left';

    const wrapper = mount(TranslationWindow, {
      props: baseProps,
    });

    const windowRoot = wrapper.find('.translation-window');

    expect(windowRoot.classes()).toContain('light');
    expect(windowRoot.classes()).toContain('is-pinned');
    expect(windowRoot.classes()).toContain('is-docked');
    expect(windowRoot.classes()).toContain('dock-left');
  });

  it('renders the extracted shared toolbar controls with the existing handlers', () => {
    const wrapper = mount(TranslationWindow, {
      props: baseProps,
    });

    expect(wrapper.findComponent({ name: 'TranslationWindowToolbar' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'ProviderSelector' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'TTSButton' }).exists()).toBe(true);
    expect(wrapper.find('.ti-action-btn[title="window_pin"]').exists()).toBe(true);
    expect(wrapper.find('.ti-action-btn[title="window_copy_translation"]').exists()).toBe(true);
    expect(wrapper.find('.ti-action-btn[title="window_show_original"]').exists()).toBe(true);
    expect(wrapper.find('.ti-detected-language-label').text()).toBe('English');
    expect(wrapper.find('.ti-action-btn[title="window_close"]').exists()).toBe(true);
  });

  it('uses system theme for auto mode and updates without remounting', async () => {
    globalThis.__mockSettingsStore.settings.THEME = 'auto';

    const wrapper = mount(TranslationWindow, {
      props: baseProps,
    });

    const windowRoot = wrapper.find('.translation-window');

    expect(windowRoot.classes()).toContain('light');
    expect(windowRoot.classes()).not.toContain('dark');

    currentMediaQueryList.dispatchChange(true);
    await nextTick();

    expect(windowRoot.classes()).toContain('dark');
    expect(windowRoot.classes()).not.toContain('light');

    currentMediaQueryList.dispatchChange(false);
    await nextTick();

    expect(windowRoot.classes()).toContain('light');
    expect(windowRoot.classes()).not.toContain('dark');
  });

  // Shared persistence-failure helpers (used by the resize lifecycle and the
  // persistence failure handling suites).
  const collectUnhandledRejections = () => {
    const failures = [];
    const onUnhandled = (reason) => failures.push(reason);
    process.on('unhandledRejection', onUnhandled);
    return {
      failures,
      release: () => process.off('unhandledRejection', onUnhandled),
    };
  };

  // Mirrors the real store: state applies synchronously, persistence rejects.
  const rejectPersistOnce = () => {
    globalThis.__mockSettingsStore.updateSettingAndPersist.mockImplementationOnce(
      async (key, value) => {
        globalThis.__mockSettingsStore.settings[key] = value;
        throw new Error('storage failed');
      }
    );
  };

  describe('docked window resize lifecycle', () => {
    const mountDocked = () => {
      globalThis.__mockSettingsStore.settings.WINDOW_DOCK_MODE = 'left';
      globalThis.__mockSettingsStore.settings.WINDOW_DOCKED_WIDTH = 350;
      return mount(TranslationWindow, { props: baseProps });
    };

    const dispatchTouchOnDocument = (type, clientX) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: [{ clientX, clientY: 100 }] });
      document.dispatchEvent(event);
    };

    it('stops resizing when a touch is cancelled', async () => {
      const wrapper = mountDocked();
      const handle = wrapper.find('.ti-dock-resize-handle');
      await handle.trigger('touchstart', { touches: [{ clientX: 100, clientY: 100 }] });
      dispatchTouchOnDocument('touchmove', 150);
      await nextTick();
      expect(wrapper.find('.translation-window').attributes('style')).toContain('width: 400px');

      dispatchTouchOnDocument('touchcancel', 150);
      await nextTick();
      expect(document.body.style.userSelect).toBe('');

      dispatchTouchOnDocument('touchmove', 250);
      await nextTick();
      expect(wrapper.find('.translation-window').attributes('style')).toContain('width: 400px');
    });

    it('removes document listeners on unmount during an active resize', async () => {
      const wrapper = mountDocked();
      const handle = wrapper.find('.ti-dock-resize-handle');
      await handle.trigger('touchstart', { touches: [{ clientX: 100, clientY: 100 }] });
      dispatchTouchOnDocument('touchmove', 150);
      await nextTick();
      expect(wrapper.find('.translation-window').attributes('style')).toContain('width: 400px');

      wrapper.unmount();
      trackedDisposers.forEach((cleanupFn) => cleanupFn());

      dispatchTouchOnDocument('touchmove', 250);
      dispatchTouchOnDocument('touchend', 250);
      expect(globalThis.__mockSettingsStore.updateSettingAndPersist).not.toHaveBeenCalledWith(
        'WINDOW_DOCKED_WIDTH',
        expect.any(Number)
      );
    });

    it('keeps a single set of document listeners across repeated resize sessions', async () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const wrapper = mountDocked();
      const handle = wrapper.find('.ti-dock-resize-handle');
      await handle.trigger('touchstart', { touches: [{ clientX: 100, clientY: 100 }] });
      dispatchTouchOnDocument('touchmove', 150);
      dispatchTouchOnDocument('touchend', 150);
      await nextTick();
      await handle.trigger('touchstart', { touches: [{ clientX: 100, clientY: 100 }] });
      dispatchTouchOnDocument('touchmove', 160);
      await nextTick();

      const countByType = (spy, type) => spy.mock.calls.filter((call) => call[0] === type).length;
      for (const type of ['mousemove', 'mouseup', 'touchmove', 'touchend', 'touchcancel']) {
        expect(countByType(addSpy, type) - countByType(removeSpy, type)).toBe(1);
      }
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('handles persistence rejection on resize stop without interrupting interaction', async () => {
      const { failures, release } = collectUnhandledRejections();
      try {
        const wrapper = mountDocked();
        const handle = wrapper.find('.ti-dock-resize-handle');
        await handle.trigger('touchstart', { touches: [{ clientX: 100, clientY: 100 }] });
        dispatchTouchOnDocument('touchmove', 150);
        await nextTick();

        rejectPersistOnce();
        dispatchTouchOnDocument('touchend', 150);
        await flushPromises();
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Resize completes normally with the resized width staged in state.
        expect(globalThis.__mockSettingsStore.updateSettingAndPersist).toHaveBeenCalledWith(
          'WINDOW_DOCKED_WIDTH',
          400
        );
        expect(globalThis.__mockSettingsStore.settings.WINDOW_DOCKED_WIDTH).toBe(400);
        expect(wrapper.find('.translation-window').attributes('style')).toContain('width: 400px');
        // Failure is logged, not thrown: no unhandled rejection.
        expect(mockLoggerWarn).toHaveBeenCalled();
        expect(failures).toHaveLength(0);

        // Event cleanup still happens: further moves are ignored, body restored.
        expect(document.body.style.userSelect).toBe('');
        dispatchTouchOnDocument('touchmove', 250);
        await nextTick();
        expect(wrapper.find('.translation-window').attributes('style')).toContain('width: 400px');

        // Interaction uninterrupted: a new resize session still persists.
        await handle.trigger('touchstart', { touches: [{ clientX: 100, clientY: 100 }] });
        dispatchTouchOnDocument('touchmove', 160);
        dispatchTouchOnDocument('touchend', 160);
        await flushPromises();
        expect(globalThis.__mockSettingsStore.updateSettingAndPersist).toHaveBeenCalledWith(
          'WINDOW_DOCKED_WIDTH',
          460
        );
      } finally {
        release();
      }
    });
  });

  describe('settings persistence failure handling', () => {
    it('pin toggle applies immediately and handles persistence rejection without rollback', async () => {
      const { failures, release } = collectUnhandledRejections();
      try {
        const wrapper = mount(TranslationWindow, { props: baseProps });
        rejectPersistOnce();

        await wrapper.find('.ti-action-btn[title="window_pin"]').trigger('click');
        await flushPromises();
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Runtime (local + manager) updates stay immediate and are kept.
        expect(globalThis.__mockSettingsStore.settings.WINDOW_IS_PINNED).toBe(true);
        expect(window.windowsManagerInstance.state.setPinned).toHaveBeenCalledWith(true);
        // Failure is logged, not thrown: no unhandled rejection, no rollback.
        expect(mockLoggerWarn).toHaveBeenCalled();
        expect(failures).toHaveLength(0);
        expect(globalThis.__mockSettingsStore.settings.WINDOW_IS_PINNED).toBe(true);
        expect(window.windowsManagerInstance.state.setPinned).toHaveBeenCalledWith(true);
      } finally {
        release();
      }
    });

    it('dock-mode change applies immediately and handles persistence rejection without rollback', async () => {
      const { failures, release } = collectUnhandledRejections();
      try {
        mount(TranslationWindow, { props: baseProps });
        rejectPersistOnce();

        globalThis.__mockCurrentDockMode.value = 'left';
        await nextTick();
        await flushPromises();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(globalThis.__mockSettingsStore.settings.WINDOW_DOCK_MODE).toBe('left');
        expect(window.windowsManagerInstance.state.setDockMode).toHaveBeenCalledWith('left');
        expect(mockLoggerWarn).toHaveBeenCalled();
        expect(failures).toHaveLength(0);
        expect(globalThis.__mockSettingsStore.settings.WINDOW_DOCK_MODE).toBe('left');
      } finally {
        release();
      }
    });

    it('a later change still persists after a persistence failure', async () => {
      const { failures, release } = collectUnhandledRejections();
      try {
        const wrapper = mount(TranslationWindow, { props: baseProps });
        rejectPersistOnce();

        await wrapper.find('.ti-action-btn[title="window_pin"]').trigger('click');
        await flushPromises();

        // Title flips while pinned; toggle back with the updated selector.
        await wrapper.find('.ti-action-btn[title="window_unpin"]').trigger('click');
        await flushPromises();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const persist = globalThis.__mockSettingsStore.updateSettingAndPersist;
        expect(persist).toHaveBeenCalledTimes(2);
        expect(persist).toHaveBeenNthCalledWith(2, 'WINDOW_IS_PINNED', false);
        expect(globalThis.__mockSettingsStore.settings.WINDOW_IS_PINNED).toBe(false);
        expect(failures).toHaveLength(0);
      } finally {
        release();
      }
    });
  });
});
