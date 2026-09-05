import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import SidepanelMainContent from './SidepanelMainContent.vue';
import { TranslationMode } from '@/shared/config/config.js';

const mockUnifiedTranslation = {
  sourceText: ref('expressions'),
  translatedText: ref('表达方式'),
  sourceLanguage: ref('en'),
  targetLanguage: ref('fa'),
  isTranslating: ref(false),
  isStreaming: ref(false),
  translationError: ref(''),
  errorType: ref(null),
  canTranslate: ref(true),
  canRetry: ref(false),
  canOpenSettings: ref(false),
  actualSourceLanguage: ref('en'),
  actualTargetLanguage: ref('fa'),
  lastTranslation: ref({
    source: 'expressions',
    target: '表达方式',
    sourceLanguage: 'en',
    targetLanguage: 'fa',
    provider: 'gemini',
    mode: TranslationMode.Dictionary_Translation,
    timestamp: 1,
  }),
  triggerTranslation: vi.fn().mockResolvedValue(true),
  getRetryCallback: vi.fn((retryFunction) => retryFunction),
  getSettingsCallback: vi.fn(() => vi.fn()),
  cancelTranslation: vi.fn(),
  clearTranslation: vi.fn(),
  initializeSessionState: vi.fn().mockResolvedValue(undefined),
};

const mockLanguageDefaults = {
  savedSourceLanguage: ref('en'),
  savedTargetLanguage: ref('fa'),
  isReady: ref(true),
  setSourceLanguageAsDefault: vi.fn().mockResolvedValue(true),
  setTargetLanguageAsDefault: vi.fn().mockResolvedValue(true),
};

vi.mock('@/features/translation/composables/useUnifiedTranslation.js', () => ({
  useUnifiedTranslation: () => mockUnifiedTranslation,
}));

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({
    handleError: vi.fn(),
  }),
}));

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => key,
  }),
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => ({
    settings: {
      DEEPL_BETA_LANGUAGES_ENABLED: false,
    },
  }),
}));

vi.mock('@/features/settings/composables/useLanguageDefaults.js', () => ({
  useLanguageDefaults: () => mockLanguageDefaults,
}));

vi.mock('@/components/shared/LanguageSelector.vue', () => ({
  default: {
    name: 'LanguageSelector',
    props: [
      'sourceLanguage',
      'targetLanguage',
      'provider',
      'lastKeyword',
      'beta',
      'showDefaultActions',
      'defaultActionsEnabled',
      'sourceIsSavedDefault',
      'targetIsSavedDefault',
      'sourceDefaultTitle',
      'targetDefaultTitle',
      'sourceTitle',
      'targetTitle',
      'swapTitle',
      'swapAlt',
      'autoDetectLabel'
    ],
    emits: ['set-default-source', 'set-default-target'],
    template: '<div class="language-selector-stub" />',
  },
}));

vi.mock('@/components/shared/ProviderSelector.vue', () => ({
  default: {
    name: 'ProviderSelector',
    template: '<div class="provider-selector-stub" />',
  },
}));

vi.mock('@/components/shared/TranslationInputField.vue', () => ({
  default: {
    name: 'TranslationInputField',
    template: '<div class="translation-input-stub" />',
  },
}));

vi.mock('@/components/shared/TranslationDisplay.vue', () => ({
  default: {
    name: 'TranslationDisplay',
    props: {
      lastTranslation: { type: Object, default: null },
      mode: { type: String, default: '' },
      canRetry: { type: Boolean, default: false },
      canOpenSettings: { type: Boolean, default: false },
      onRetry: { type: Function, default: null },
      onOpenSettings: { type: Function, default: null },
    },
    template: '<div class="translation-display-stub" />',
  },
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: vi.fn((path) => path),
    },
  },
}));

describe('SidepanelMainContent.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('continues to pass dictionary metadata to TranslationDisplay', async () => {
    const wrapper = mount(SidepanelMainContent, {
      props: {
        provider: '',
      },
    });

    const display = wrapper.findComponent({ name: 'TranslationDisplay' });
    expect(display.exists()).toBe(true);
    expect(display.props('mode')).toBe('sidepanel');
    expect(display.props('lastTranslation')).toEqual(expect.objectContaining({
      mode: TranslationMode.Dictionary_Translation,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
    }));
  });

  it('passes default action props and forwards star events', async () => {
    const wrapper = mount(SidepanelMainContent, {
      props: {
        provider: '',
      },
    });

    const selector = wrapper.findComponent({ name: 'LanguageSelector' });
    expect(selector.props('showDefaultActions')).not.toBe(false);
    expect(selector.props('defaultActionsEnabled')).toBe(true);
    expect(selector.props('sourceIsSavedDefault')).toBe(true);
    expect(selector.props('targetIsSavedDefault')).toBe(true);

    selector.vm.$emit('set-default-source');
    selector.vm.$emit('set-default-target');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockLanguageDefaults.setSourceLanguageAsDefault).toHaveBeenCalledWith('en');
    expect(mockLanguageDefaults.setTargetLanguageAsDefault).toHaveBeenCalledWith('fa');
  });

  it('passes public action capabilities and existing callbacks to TranslationDisplay', async () => {
    mockUnifiedTranslation.canRetry.value = true;
    mockUnifiedTranslation.canOpenSettings.value = false;

    const wrapper = mount(SidepanelMainContent, {
      props: {
        provider: 'gemini',
      },
    });

    const display = wrapper.findComponent({ name: 'TranslationDisplay' });
    expect(display.props('canRetry')).toBe(true);
    expect(display.props('canOpenSettings')).toBe(false);

    await display.props('onRetry')();
    expect(mockUnifiedTranslation.triggerTranslation).toHaveBeenCalledWith('en', 'fa', 'gemini');
    expect(mockUnifiedTranslation.getRetryCallback).toHaveBeenCalledWith(expect.any(Function));
    expect(mockUnifiedTranslation.getSettingsCallback).toHaveBeenCalledTimes(1);
  });
});
