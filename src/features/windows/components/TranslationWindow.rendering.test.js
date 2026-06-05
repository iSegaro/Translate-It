import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import TranslationWindow from './TranslationWindow.vue';
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue';
import { TranslationMode } from '@/shared/config/config.js';

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    emit: vi.fn(),
  },
  WINDOWS_MANAGER_EVENTS: {
    OPEN_SETTINGS: 'open-settings',
  },
}));

vi.mock('@/composables/shared/useTextDirection.js', () => ({
  useTextDirection: () => ({
    direction: ref('ltr'),
    textAlign: ref('left'),
  }),
}));

vi.mock('@/composables/shared/useFont.js', () => ({
  useFont: () => ({
    fontStyles: ref({}),
    cssVariables: ref({}),
  }),
}));

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => key,
    locale: ref('en'),
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
    isDarkTheme: false,
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

describe('TranslationWindow.vue dictionary rendering', () => {
  const sampleResponse = `表达方式

**UK** : \`/ɪkˈspreʃnz/\`    **US** : \`/ɪkˈspreʃnz/\`

- **名词**: 表达方式, 词语, 表情, 算式
- **同义词**: 词汇, 措辞, 呈现
- **反义词**: 沉默, 隐瞒`;

  const baseProps = {
    id: 'window-rendering-1',
    position: { x: 0, y: 0 },
    selectedText: 'expressions',
    initialTranslatedText: sampleResponse,
    theme: 'light',
    isLoading: false,
    isStreaming: false,
    isError: false,
    errorType: null,
    canRetry: false,
    needsSettings: false,
    initialSize: 'normal',
    targetLanguage: 'zh-CN',
    sourceLanguage: 'en',
    detectedSourceLanguage: 'en',
    provider: 'gemini',
    translationMode: TranslationMode.Dictionary_Translation,
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

  it('renders dictionary markdown output in the in-page window path', async () => {
    const windowWrapper = mount(TranslationWindow, {
      props: baseProps,
    });

    await nextTick();

    const baselineWrapper = mount(TranslationDisplay, {
      props: {
        content: sampleResponse,
        mode: 'sidepanel',
        lastTranslation: {
          source: 'expressions',
          target: sampleResponse,
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          provider: 'gemini',
          mode: TranslationMode.Dictionary_Translation,
          timestamp: 1,
        },
        targetLanguage: 'zh-CN',
        showToolbar: false,
        enableMarkdown: true,
      },
    });

    await nextTick();

    const windowMarkdownRoot = windowWrapper.get('.simple-markdown');
    const baselineMarkdownRoot = baselineWrapper.get('.simple-markdown');
    const windowHtml = windowMarkdownRoot.html();
    const baselineHtml = baselineMarkdownRoot.html();
    const text = windowMarkdownRoot.text();

    expect(text).not.toContain('**UK**');
    expect(text).not.toContain('**US**');
    expect(windowHtml).toContain('<strong>UK</strong>');
    expect(windowHtml).toContain('<strong>US</strong>');
    expect(windowHtml).not.toContain('**US**');
    expect(windowMarkdownRoot.find('ul').exists()).toBe(true);
    expect(windowMarkdownRoot.findAll('li')).toHaveLength(3);
    expect(windowMarkdownRoot.findAll('strong').map((node) => node.text())).toEqual(
      expect.arrayContaining(['UK', 'US', '名词', '同义词', '反义词']),
    );
    expect(windowHtml).toBe(baselineHtml);
  });
});
