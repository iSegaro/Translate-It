import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import TranslationForm from './TranslationForm.vue';

const mockSettingsCallback = vi.fn();
const mockTranslation = {
  sourceText: ref('hello'),
  translatedText: ref('bonjour'),
  isTranslating: ref(false),
  isStreaming: ref(false),
  translationError: ref(''),
  errorType: ref(null),
  canTranslate: ref(true),
  canRetry: ref(false),
  canOpenSettings: ref(false),
  actualSourceLanguage: ref('en'),
  actualTargetLanguage: ref('fr'),
  lastTranslation: ref(null),
  triggerTranslation: vi.fn().mockResolvedValue(true),
  getRetryCallback: vi.fn((retryFunction) => retryFunction),
  getSettingsCallback: vi.fn(() => mockSettingsCallback),
  cancelTranslation: vi.fn(),
  clearTranslation: vi.fn(),
  loadLastTranslation: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/features/translation/composables/useUnifiedTranslation.js', () => ({
  useUnifiedTranslation: () => mockTranslation,
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => ({
    settings: {
      AUTO_TRANSLATE_ON_PASTE: false,
    },
  }),
}));

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({ handleError: vi.fn() }),
}));

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (key) => key }),
}));

vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({ addEventListener: vi.fn() }),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { UI: 'UI' },
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
      canRetry: { type: Boolean, default: false },
      canOpenSettings: { type: Boolean, default: false },
      onRetry: { type: Function, default: null },
      onOpenSettings: { type: Function, default: null },
    },
    template: '<div class="translation-display-stub" />',
  },
}));

describe('TranslationForm.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTranslation.canRetry.value = false;
    mockTranslation.canOpenSettings.value = false;
    mockTranslation.getRetryCallback.mockImplementation((retryFunction) => retryFunction);
    mockTranslation.getSettingsCallback.mockReturnValue(mockSettingsCallback);
  });

  const mountForm = () => mount(TranslationForm, {
    props: {
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      provider: 'openai',
    },
  });

  it('passes public action capabilities to TranslationDisplay', () => {
    mockTranslation.canRetry.value = true;

    const wrapper = mountForm();
    const display = wrapper.findComponent({ name: 'TranslationDisplay' });

    expect(display.props('canRetry')).toBe(true);
    expect(display.props('canOpenSettings')).toBe(false);
    expect(display.props('onRetry')).toEqual(expect.any(Function));
    expect(display.props('onOpenSettings')).toEqual(expect.any(Function));
  });

  it('retries through existing translation request and opens settings through helper', async () => {
    mockTranslation.canRetry.value = true;
    mockTranslation.canOpenSettings.value = true;

    const wrapper = mountForm();
    const display = wrapper.findComponent({ name: 'TranslationDisplay' });

    await display.props('onRetry')();
    await display.props('onOpenSettings')();

    expect(mockTranslation.triggerTranslation).toHaveBeenCalledWith('en', 'fr', 'openai');
    expect(mockTranslation.getRetryCallback).toHaveBeenCalledWith(expect.any(Function));
    expect(mockTranslation.getSettingsCallback).toHaveBeenCalledTimes(1);
    expect(mockSettingsCallback).toHaveBeenCalledTimes(1);
  });
});
