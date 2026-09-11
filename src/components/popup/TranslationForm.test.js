import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
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
  revertTranslation: vi.fn(),
};

const mockUpdateSettingAndPersist = vi.fn();
const mockFormLoggerWarn = vi.fn();
const mockTrackerAddEventListener = vi.fn();

vi.mock('@/features/translation/composables/useUnifiedTranslation.js', () => ({
  useUnifiedTranslation: () => mockTranslation,
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => ({
    settings: {
      AUTO_TRANSLATE_ON_PASTE: false,
    },
    updateSettingAndPersist: mockUpdateSettingAndPersist,
  }),
}));

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({ handleError: vi.fn() }),
}));

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (key) => key }),
}));

vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({ addEventListener: mockTrackerAddEventListener }),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: mockFormLoggerWarn,
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
    mockUpdateSettingAndPersist.mockResolvedValue(true);
    mockTranslation.revertTranslation.mockReset();
  });

  const mountForm = () => mount(TranslationForm, {
    props: {
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      provider: 'openai',
      translation: mockTranslation,
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

  describe('revert persistence failure handling', () => {
    const getRevertHandler = () => mockTrackerAddEventListener.mock.calls.find(
      ([, event]) => event === 'revert-translation'
    )[2];

    const collectUnhandledRejections = () => {
      const failures = [];
      const onUnhandled = (reason) => failures.push(reason);
      process.on('unhandledRejection', onUnhandled);
      return {
        failures,
        release: () => process.off('unhandledRejection', onUnhandled),
      };
    };

    it('revert updates UI/local immediately and persists both languages', async () => {
      mockTranslation.revertTranslation.mockReturnValue({ sourceLanguage: 'fa', targetLanguage: 'en' });
      mountForm();
      const revertHandler = getRevertHandler();

      revertHandler();
      // Immediate local revert runs synchronously, before any persistence settles.
      expect(mockTranslation.revertTranslation).toHaveBeenCalledTimes(1);

      await flushPromises();

      expect(mockUpdateSettingAndPersist).toHaveBeenCalledWith('SOURCE_LANGUAGE', 'fa');
      expect(mockUpdateSettingAndPersist).toHaveBeenCalledWith('TARGET_LANGUAGE', 'en');
      expect(mockFormLoggerWarn).not.toHaveBeenCalled();
    });

    it('handles SOURCE rejection independently; TARGET is still attempted', async () => {
      const { failures, release } = collectUnhandledRejections();
      try {
        mockTranslation.revertTranslation.mockReturnValue({ sourceLanguage: 'fa', targetLanguage: 'en' });
        mockUpdateSettingAndPersist.mockImplementationOnce(
          async () => { throw new Error('storage failed'); }
        );
        mountForm();

        getRevertHandler()();
        await flushPromises();
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Both independent writes attempted despite one rejecting.
        expect(mockUpdateSettingAndPersist).toHaveBeenCalledWith('SOURCE_LANGUAGE', 'fa');
        expect(mockUpdateSettingAndPersist).toHaveBeenCalledWith('TARGET_LANGUAGE', 'en');
        expect(mockFormLoggerWarn).toHaveBeenCalledTimes(1);
        expect(failures).toHaveLength(0);
      } finally {
        release();
      }
    });

    it('handles TARGET rejection; SOURCE still succeeds silently', async () => {
      const { failures, release } = collectUnhandledRejections();
      try {
        mockTranslation.revertTranslation.mockReturnValue({ sourceLanguage: 'fa', targetLanguage: 'en' });
        mockUpdateSettingAndPersist.mockImplementationOnce(async () => true);
        mockUpdateSettingAndPersist.mockImplementationOnce(
          async () => { throw new Error('storage failed'); }
        );
        mountForm();

        getRevertHandler()();
        await flushPromises();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockUpdateSettingAndPersist).toHaveBeenNthCalledWith(1, 'SOURCE_LANGUAGE', 'fa');
        expect(mockUpdateSettingAndPersist).toHaveBeenNthCalledWith(2, 'TARGET_LANGUAGE', 'en');
        expect(mockFormLoggerWarn).toHaveBeenCalledTimes(1);
        expect(failures).toHaveLength(0);
      } finally {
        release();
      }
    });
  });
});
