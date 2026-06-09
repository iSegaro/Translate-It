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
    PROMPT_TEMPLATE_AUTO: 'AUTO',
    PROMPT_BASE_FIELD: 'BASE_FIELD',
    PROMPT_BASE_FIELD_AUTO: 'BASE_FIELD_AUTO',
    PROMPT_BASE_POPUP_TRANSLATE: 'BASE_POPUP',
    PROMPT_BASE_DICTIONARY: 'BASE_DICTIONARY',
    PROMPT_BASE_SCREEN_CAPTURE: 'BASE_SCREEN_CAPTURE'
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

  it('dropdown lists only editable prompts from registry', async () => {
    const wrapper = mount(PromptTab);
    const select = wrapper.find('select');
    const options = select.findAll('option');
    
    const optionValues = options.map(o => o.element.value);
    
    // Basic prompts
    expect(optionValues).toContain('PROMPT_TEMPLATE');
    expect(optionValues).toContain('PROMPT_TEMPLATE_AUTO');
    
    // Editable advanced prompts
    expect(optionValues).toContain('PROMPT_BASE_FIELD');
    expect(optionValues).toContain('PROMPT_BASE_DICTIONARY');
    
    // Locked prompts (should NOT be present)
    expect(optionValues).not.toContain('PROMPT_BASE_SELECT');
    expect(optionValues).not.toContain('PROMPT_BASE_AI_BATCH');
  });

  it('switches between Basic and Advanced templates using dropdown', async () => {
    const wrapper = mount(PromptTab);
    const select = wrapper.find('select');
    
    // Default is PROMPT_TEMPLATE
    expect(wrapper.vm.currentPromptKey).toBe('PROMPT_TEMPLATE');
    expect(wrapper.vm.activeTemplateValue).toBe('GENERAL');

    // Switch to PROMPT_BASE_FIELD
    await select.setValue('PROMPT_BASE_FIELD');
    expect(wrapper.vm.currentPromptKey).toBe('PROMPT_BASE_FIELD');
    expect(wrapper.vm.activeTemplateValue).toBe('BASE_FIELD');
    
    // Switch to PROMPT_BASE_DICTIONARY
    await select.setValue('PROMPT_BASE_DICTIONARY');
    expect(wrapper.vm.currentPromptKey).toBe('PROMPT_BASE_DICTIONARY');
    expect(wrapper.vm.activeTemplateValue).toBe('BASE_DICTIONARY');
  });

  it('shows risk warning and disables preview for advanced prompts', async () => {
    const wrapper = mount(PromptTab);
    const select = wrapper.find('select');
    
    // General (SAFE, USER category)
    expect(wrapper.find('.prompt-risk-banner').exists()).toBe(false);
    expect(wrapper.find('#PROMPT_PREVIEW_BUTTON').exists()).toBe(true);

    // Dictionary (MEDIUM risk, SYSTEM category)
    await select.setValue('PROMPT_BASE_DICTIONARY');
    expect(wrapper.find('.prompt-risk-banner').exists()).toBe(true);
    expect(wrapper.find('.preview-disabled-note').exists()).toBe(true);
    expect(wrapper.find('#PROMPT_PREVIEW_BUTTON').exists()).toBe(false);
  });

  it('clears stale preview when switching from Basic to Advanced', async () => {
    const wrapper = mount(PromptTab);
    const select = wrapper.find('select');
    
    // 1. Show preview for Basic
    await wrapper.find('#PROMPT_PREVIEW_BUTTON').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.vm.promptExamples.length).toBeGreaterThan(0);
    });
    expect(wrapper.vm.showPreview).toBe(true);

    // 2. Switch to Advanced
    await select.setValue('PROMPT_BASE_FIELD');
    
    // 3. Preview should be hidden and cleared
    expect(wrapper.vm.showPreview).toBe(false);
    expect(wrapper.vm.promptExamples.length).toBe(0);
  });

  it('handles invalid currentPromptKey gracefully without crashing', async () => {
    const wrapper = mount(PromptTab);
    
    // Manually set to invalid key
    wrapper.vm.currentPromptKey = 'INVALID_KEY';
    
    // These should not crash and return safe fallbacks
    expect(wrapper.vm.currentPromptMetadata).toBeDefined();
    expect(wrapper.vm.activeTemplateValue).toBe('');
    
    // Risk check should be safe
    expect(wrapper.vm.hasRiskWarning).toBe(false);
  });

  it('resets selected advanced prompt', async () => {
    const wrapper = mount(PromptTab);
    const select = wrapper.find('select');
    
    // Select and modify Field prompt
    await select.setValue('PROMPT_BASE_FIELD');
    wrapper.vm.activeTemplateValue = 'MODIFIED FIELD';
    
    // Reset
    await wrapper.find('.button-inline').trigger('click');
    
    expect(wrapper.vm.activeTemplateValue).toBe('BASE_FIELD');
  });

  it('preview works for basic prompts', async () => {
    const wrapper = mount(PromptTab);
    const select = wrapper.find('select');
    
    // Modify General
    wrapper.vm.activeTemplateValue = 'CUSTOM GENERAL $_{TEXT}';
    
    // Refresh preview
    await wrapper.find('#PROMPT_PREVIEW_BUTTON').trigger('click');
    
    await vi.waitFor(() => {
      expect(wrapper.vm.promptExamples.length).toBeGreaterThan(0);
    });

    const example = wrapper.vm.promptExamples[0];
    expect(example.prompt).toContain('CUSTOM GENERAL');

    // Switch to Auto
    await select.setValue('PROMPT_TEMPLATE_AUTO');
    wrapper.vm.activeTemplateValue = 'CUSTOM AUTO $_{TEXT}';
    await wrapper.find('#PROMPT_PREVIEW_BUTTON').trigger('click');

    await vi.waitFor(() => {
      const exampleGen = wrapper.vm.promptExamples[0];
      expect(exampleGen.prompt).toContain('CUSTOM AUTO');
    });
  });
});
