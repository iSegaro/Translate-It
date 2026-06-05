import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import TranslationWindow from './TranslationWindow.vue';
import { TranslationMode } from '@/shared/config/config.js';

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
  useSettingsStore: () => ({
    settings: {
      WINDOW_IS_PINNED: false,
      WINDOW_DOCK_MODE: 'none',
      WINDOW_DOCKED_WIDTH: 350,
    },
    getSetting: vi.fn((key, fallback) => fallback),
    updateSettingAndPersist: vi.fn(),
  }),
}));

vi.mock('@/core/content-scripts/chunks/lazy-styles.js', () => ({
  windowsUiStyles: '',
}));

vi.mock('@/utils/ui/styleInjector.js', () => ({
  injectStylesToShadowRoot: vi.fn(),
}));

vi.mock('@/components/shared/TranslationDisplay.vue', () => ({
  default: defineComponent({
    name: 'TranslationDisplay',
    props: {
      content: { type: String, default: '' },
      mode: { type: String, default: '' },
      lastTranslation: { type: Object, default: null },
    },
    template: '<div class="translation-display-stub" />',
  }),
}));

vi.mock('@/components/shared/ProviderSelector.vue', () => ({
  default: defineComponent({
    name: 'ProviderSelector',
    template: '<div class="provider-selector-stub" />',
    props: ['modelValue'],
  }),
}));

vi.mock('@/components/base/LoadingSpinner.vue', () => ({
  default: defineComponent({
    name: 'LoadingSpinner',
    template: '<div class="loading-spinner-stub" />',
    props: ['size'],
  }),
}));

vi.mock('@/components/shared/TTSButton.vue', () => ({
  default: defineComponent({
    name: 'TTSButton',
    template: '<button class="tts-button-stub" />',
    props: ['text', 'language', 'isDictionary'],
  }),
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
    window.windowsManagerInstance = {
      state: {
        setPinned: vi.fn(),
        setDockMode: vi.fn(),
      },
    };
  });

  it('forwards dictionary metadata to TranslationDisplay in the in-page window path', async () => {
    const wrapper = mount(TranslationWindow, {
      props: {
        ...baseProps,
        translationMode: TranslationMode.Dictionary_Translation,
      },
    });

    const display = wrapper.findComponent({ name: 'TranslationDisplay' });
    expect(display.exists()).toBe(true);
    expect(display.props('mode')).toBe('compact');
    expect(display.props('lastTranslation')).toEqual({
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: 'gemini',
      mode: TranslationMode.Dictionary_Translation,
    });
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
});
