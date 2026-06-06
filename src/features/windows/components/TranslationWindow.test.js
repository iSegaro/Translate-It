import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
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
  store.updateSettingAndPersist = vi.fn((key, value) => {
    store.settings[key] = value;
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

vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({
    trackResource: vi.fn(),
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
});
