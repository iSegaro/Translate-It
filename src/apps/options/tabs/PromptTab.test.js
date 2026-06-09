import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PromptTab from './PromptTab.vue';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';

// Mock dependencies
vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: vi.fn((key) => key)
  })
}));

vi.mock('../composables/useTabSettings.js', () => ({
  useTabSettings: () => ({
    createSetting: vi.fn((key, defaultValue) => ref(defaultValue))
  })
}));

vi.mock('@/core/validation.js', () => ({
  useValidation: () => ({
    validatePromptTemplate: vi.fn().mockResolvedValue(true),
    getFirstError: vi.fn(),
    getFirstErrorTranslated: vi.fn(),
    clearErrors: vi.fn()
  })
}));

vi.mock('../composables/useHighlightManager.js', () => ({
  useHighlightManager: () => ({
    highlightElement: vi.fn()
  })
}));

vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    PROMPT_TEMPLATE: 'GENERAL',
    PROMPT_TEMPLATE_AUTO: 'AUTO'
  },
  TranslationMode: {
    Field: 'field',
    Popup_Translate: 'popup',
    Selection: 'selection',
    Select_Element: 'select_element',
    Dictionary_Translation: 'dictionary',
    Page: 'page',
    ScreenCapture: 'screen_capture'
  },
  getPromptBASESelectAsync: vi.fn().mockResolvedValue('BASE_SELECT $_{PROMPT_INSTRUCTIONS} $_{TEXT}'),
  getPromptPopupTranslateAsync: vi.fn().mockResolvedValue('BASE_POPUP $_{PROMPT_INSTRUCTIONS} $_{TEXT}'),
  getPromptBASEFieldAsync: vi.fn().mockResolvedValue('BASE_FIELD $_{PROMPT_INSTRUCTIONS} $_{TEXT}'),
  getPromptBASEFieldAutoAsync: vi.fn().mockResolvedValue('BASE_FIELD_AUTO $_{PROMPT_INSTRUCTIONS} $_{TEXT}'),
  getPromptBASEScreenCaptureAsync: vi.fn().mockResolvedValue('BASE_CAPTURE $_{PROMPT_INSTRUCTIONS} $_{TEXT}'),
  getPromptBASEBatchAsync: vi.fn().mockResolvedValue('BASE_BATCH $_{PROMPT_INSTRUCTIONS} $_{TEXT}'),
  getPromptBASEAIBatchAsync: vi.fn().mockResolvedValue('BASE_AI_BATCH $_{PROMPT_INSTRUCTIONS} $_{TEXT}'),
  getPromptBASEAIBatchAutoAsync: vi.fn().mockResolvedValue('BASE_AI_BATCH_AUTO $_{PROMPT_INSTRUCTIONS} $_{TEXT}'),
  getEnableDictionaryAsync: vi.fn().mockResolvedValue(false),
  getPromptDictionaryAsync: vi.fn().mockResolvedValue('BASE_DICT $_{TEXT}'),
  getSourceLanguageAsync: vi.fn().mockResolvedValue('en')
}));

vi.mock('@/shared/config/languageConstants.js', () => ({
  getLanguageNameFromCode: vi.fn((code) => code),
  getCanonicalCode: vi.fn((code) => code)
}));

// Mock Pinia store
vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => ({
    settings: {
      SOURCE_LANGUAGE: 'en',
      TARGET_LANGUAGE: 'fa'
    }
  })
}));

// Mock NewlineManager
vi.mock('@/features/translation/utils/NewlineManager.js', () => ({
  NewlineManager: {
    protect: vi.fn((text) => text)
  }
}));

describe('PromptTab', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    
    // Mock URL.createObjectURL for any potential calls
    global.URL.createObjectURL = vi.fn();
  });

  it('switches between General and Auto templates', async () => {
    const wrapper = mount(PromptTab);
    
    // Default is General
    expect(wrapper.vm.currentPromptKey).toBe('PROMPT_TEMPLATE');
    expect(wrapper.vm.activeTemplateValue).toBe('GENERAL');

    // Switch to Auto
    const buttons = wrapper.findAll('.selector-btn');
    const autoButton = buttons.find(b => b.text().includes('Auto Template') || b.text().includes('prompt_type_auto'));
    await autoButton.trigger('click');

    expect(wrapper.vm.currentPromptKey).toBe('PROMPT_TEMPLATE_AUTO');
    expect(wrapper.vm.activeTemplateValue).toBe('AUTO');
  });

  it('resets only the active template', async () => {
    const wrapper = mount(PromptTab);
    
    // Modify General
    wrapper.vm.activeTemplateValue = 'MODIFIED GENERAL';
    
    // Switch to Auto and modify
    wrapper.vm.currentPromptKey = 'PROMPT_TEMPLATE_AUTO';
    wrapper.vm.activeTemplateValue = 'MODIFIED AUTO';
    
    // Reset Auto
    await wrapper.find('.button-inline').trigger('click');
    
    expect(wrapper.vm.activeTemplateValue).toBe('AUTO');
    
    // Switch back to General, should still be modified
    wrapper.vm.currentPromptKey = 'PROMPT_TEMPLATE';
    expect(wrapper.vm.activeTemplateValue).toBe('MODIFIED GENERAL');
  });

  it('preview uses the active template value', async () => {
    const wrapper = mount(PromptTab);
    
    // Modify General
    wrapper.vm.activeTemplateValue = 'CUSTOM GENERAL $_{TEXT}';
    
    // Switch to Auto and modify
    wrapper.vm.currentPromptKey = 'PROMPT_TEMPLATE_AUTO';
    wrapper.vm.activeTemplateValue = 'CUSTOM AUTO $_{TEXT}';
    
    // Refresh preview
    await wrapper.find('#PROMPT_PREVIEW_BUTTON').trigger('click');
    
    // Check if promptExamples contain CUSTOM AUTO
    // Note: promptExamples generation is async
    await vi.waitFor(() => {
      expect(wrapper.vm.promptExamples.length).toBeGreaterThan(0);
    });

    const example = wrapper.vm.promptExamples[0];
    expect(example.prompt).toContain('CUSTOM AUTO');
    expect(example.prompt).not.toContain('CUSTOM GENERAL');

    // Switch back to General and preview
    wrapper.vm.currentPromptKey = 'PROMPT_TEMPLATE';
    await wrapper.find('#PROMPT_PREVIEW_BUTTON').trigger('click');

    await vi.waitFor(() => {
      const exampleGen = wrapper.vm.promptExamples[0];
      expect(exampleGen.prompt).toContain('CUSTOM GENERAL');
      expect(exampleGen.prompt).not.toContain('CUSTOM AUTO');
    });
  });
});
