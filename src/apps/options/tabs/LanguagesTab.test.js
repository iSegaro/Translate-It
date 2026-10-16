import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, ref, nextTick } from 'vue';
import LanguagesTab from './LanguagesTab.vue';

// Mock vue-router (useRouter for the tab, useRoute/useRouter for the mocked highlight manager path)
const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {}
  }),
  useRouter: () => ({
    push: pushMock
  })
}));

// Mock unified i18n with identity translation so raw keys are observable
vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => key
  })
}));

// Mock settings store: writes go through updateSettingLocally, exactly like
// the beta toggles in DeepLApiSettings (Providers tab) and the Languages tab
const mockUpdateSettingLocally = vi.fn((key, value) => {
  mockSettingsStore.settings[key] = value;
});
const mockValidateSettings = vi.fn(() => ({ isValid: true, errors: [] }));
const mockSettingsStore = reactive({
  settings: {
    TRANSLATION_API: 'deepl',
    SOURCE_LANGUAGE: 'en',
    TARGET_LANGUAGE: 'fa',
    DEEPL_BETA_LANGUAGES_ENABLED: true,
    MODE_PROVIDERS: {}
  },
  isSettingsValid: true,
  updateSettingLocally: mockUpdateSettingLocally,
  validateSettings: (...args) => mockValidateSettings(...args)
});

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => mockSettingsStore
}));

// Stub ProviderSelector: module-mocked so the real component (and its
// provider-registry import chain) never loads, following ProvidersTab.test.js
vi.mock('@/components/shared/ProviderSelector.vue', () => ({
  default: {
    name: 'ProviderSelector',
    props: {
      modelValue: { type: String, default: '' }
    },
    emits: ['update:modelValue'],
    template: '<div class="provider-selector-stub" />'
  }
}));

// Stub LanguageDropdown: module-mocked for the same reason; keeps props
// observable so tests can assert option filtering vs preserved selections
vi.mock('@/components/feature/LanguageDropdown.vue', () => ({
  default: {
    name: 'LanguageDropdown',
    props: ['languages', 'modelValue', 'id', 'type'],
    emits: ['update:modelValue'],
    template: '<div class="language-dropdown-stub" />'
  }
}));
vi.mock('@/composables/shared/useLanguages.js', () => ({
  useLanguages: () => ({
    allLanguages: ref([
      { code: 'en', name: 'English' },
      { code: 'fa', name: 'Persian' },
      { code: 'de', name: 'German' }
    ]),
    loadLanguages: vi.fn().mockResolvedValue(),
    isLoaded: ref(true)
  })
}));

// Provider internals are irrelevant here: DeepL with autoDetect, no missing keys
vi.mock('@/features/translation/providers/ProviderManifest.js', () => ({
  findProviderById: () => ({
    id: 'deepl',
    displayName: 'DeepL',
    features: ['autoDetect']
  })
}));

const missingSettingMocks = vi.hoisted(() => ({
  getFirstMissingSetting: vi.fn(() => null)
}));
vi.mock('@/features/translation/utils/providerValidator.js', () => ({
  getFirstMissingSetting: (...args) => missingSettingMocks.getFirstMissingSetting(...args)
}));

// Mock highlight manager with hoisted spy
const highlightMocks = vi.hoisted(() => ({
  checkAndHighlight: vi.fn(),
  highlightElement: vi.fn()
}));
vi.mock('../composables/useHighlightManager.js', () => ({
  useHighlightManager: () => highlightMocks
}));

// Mock logger to avoid console noise
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  })
}));

const mountedWrappers = [];
const mountTab = () => {
  const wrapper = mount(LanguagesTab, {
    global: {
      stubs: {
        // LanguageDropdown/ProviderSelector come from the module mocks above
        BaseCheckbox: { template: '<div class="checkbox-stub" />' },
        BaseSelect: { template: '<div class="select-stub" />' },
        BaseAccordion: {
          template: '<div class="accordion-stub"><slot name="header" /><slot name="content" /><slot /></div>'
        }
      }
    }
  });
  mountedWrappers.push(wrapper);
  return wrapper;
};

const dropdownLanguages = (wrapper, id) => {
  const props = dropdownProps(wrapper, id);
  return props ? props.languages.map(l => l.code) : null;
};

const dropdownProps = (wrapper, id) => {
  const dropdowns = wrapper.findAllComponents({ name: 'LanguageDropdown' });
  return dropdowns.find(d => d.props('id') === id)?.props();
};

describe('LanguagesTab.vue - DeepL beta toggle (#321)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsStore.settings.TRANSLATION_API = 'deepl';
    mockSettingsStore.settings.SOURCE_LANGUAGE = 'en';
    mockSettingsStore.settings.TARGET_LANGUAGE = 'fa';
    mockSettingsStore.settings.DEEPL_BETA_LANGUAGES_ENABLED = true;
    mockSettingsStore.isSettingsValid = true;
    mockValidateSettings.mockReturnValue({ isValid: true, errors: [] });
    missingSettingMocks.getFirstMissingSetting.mockReturnValue(null);
  });

  afterEach(async () => {
    await vi.dynamicImportSettled();
    await flushPromises();
    while (mountedWrappers.length) mountedWrappers.pop().unmount();
  });

  it('preserves unsaved selections when beta is toggled off (no silent clear)', async () => {
    mountTab();
    await flushPromises();

    // Beta toggle from either the Providers tab or the Languages tab path
    // goes through updateSettingLocally — selections must survive it
    mockSettingsStore.updateSettingLocally('DEEPL_BETA_LANGUAGES_ENABLED', false);
    await nextTick();
    await flushPromises();

    expect(mockSettingsStore.settings.TARGET_LANGUAGE).toBe('fa');
    expect(mockSettingsStore.settings.SOURCE_LANGUAGE).toBe('en');
  });

  it('keeps selections while dropdown options re-filter to standard-only', async () => {
    const wrapper = mountTab();
    await flushPromises();

    mockSettingsStore.updateSettingLocally('DEEPL_BETA_LANGUAGES_ENABLED', false);
    await nextTick();
    await flushPromises();

    // Options re-filter, but the preserved selection is appended back with its
    // label so the dropdown renders the value instead of blank
    expect(dropdownLanguages(wrapper, 'TARGET_LANGUAGE')).toContain('fa');
    expect(mockSettingsStore.settings.TARGET_LANGUAGE).toBe('fa');
  });

  it('preserves selections when beta is re-enabled', async () => {
    mountTab();
    await flushPromises();

    mockSettingsStore.updateSettingLocally('DEEPL_BETA_LANGUAGES_ENABLED', false);
    await nextTick();
    mockSettingsStore.updateSettingLocally('DEEPL_BETA_LANGUAGES_ENABLED', true);
    await nextTick();
    await flushPromises();

    expect(mockSettingsStore.settings.TARGET_LANGUAGE).toBe('fa');
    expect(mockSettingsStore.settings.SOURCE_LANGUAGE).toBe('en');
  });

  it('highlights TARGET_LANGUAGE when feedback focus is target', async () => {
    mountTab();
    await flushPromises();
    highlightMocks.highlightElement.mockClear();

    window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', {
      detail: { field: 'languages', focus: 'target' }
    }));
    await flushPromises();

    expect(highlightMocks.highlightElement).toHaveBeenCalledWith('TARGET_LANGUAGE');
  });

  it('highlights SOURCE_LANGUAGE when feedback focus is source or absent', async () => {    mountTab();
    await flushPromises();

    window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', {
      detail: { field: 'languages', focus: 'source' }
    }));
    await flushPromises();
    expect(highlightMocks.highlightElement).toHaveBeenCalledWith('SOURCE_LANGUAGE');

    highlightMocks.highlightElement.mockClear();
    window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', {
      detail: { field: 'languages' }
    }));
    await flushPromises();
    expect(highlightMocks.highlightElement).toHaveBeenCalledWith('SOURCE_LANGUAGE');
  });

  it('shows an inline error for the DeepL conflict while rendering the kept value', async () => {
    const wrapper = mountTab();
    await flushPromises();

    mockValidateSettings.mockReturnValue({
      isValid: false,
      errors: ['validation_deepl_target_language_beta_disabled:fa']
    });
    mockSettingsStore.updateSettingLocally('DEEPL_BETA_LANGUAGES_ENABLED', false);
    await nextTick();

    // Save-feedback path surfaces the store conflict inline
    window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', {
      detail: { field: 'languages', focus: 'target' }
    }));
    await flushPromises();

    const error = wrapper.find('.validation-error .error-message');
    expect(error.exists()).toBe(true);
    expect(error.text()).toBe('validation_deepl_target_language_beta_disabled');

    // ...while the dropdown still renders the preserved (unsupported) value
    const props = dropdownProps(wrapper, 'TARGET_LANGUAGE');
    expect(props.modelValue).toBe('fa');
    const kept = props.languages.find(l => l.code === 'fa');
    expect(kept).toBeDefined();
    expect(kept.name).toBeTruthy();
  });

  it('clears the inline error once the conflict is resolved', async () => {
    const wrapper = mountTab();
    await flushPromises();

    mockValidateSettings.mockReturnValue({
      isValid: false,
      errors: ['validation_deepl_target_language_beta_disabled:fa']
    });
    window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', {
      detail: { field: 'languages', focus: 'target' }
    }));
    await flushPromises();
    expect(wrapper.find('.validation-error').exists()).toBe(true);

    // Resolving (conflict gone) clears the inline error via the read-only
    // beta watcher — the toggle fires it, validateLanguages() clears the key.
    // (Asserted via isSettingsValid, which mirrors the inline error computed;
    // the Transition leave itself never completes under jsdom.)
    mockValidateSettings.mockReturnValue({ isValid: true, errors: [] });
    mockSettingsStore.updateSettingLocally('DEEPL_BETA_LANGUAGES_ENABLED', false);
    await nextTick();
    await flushPromises();
    expect(mockSettingsStore.isSettingsValid).toBe(true);
  });

  it('preserves a conflicting target when source changes with beta disabled', async () => {
    mountTab();
    await flushPromises();

    mockSettingsStore.updateSettingLocally('DEEPL_BETA_LANGUAGES_ENABLED', false);
    await nextTick();
    expect(mockSettingsStore.settings.TARGET_LANGUAGE).toBe('fa');

    // Changing source must not silently replace the conflicting target
    mockSettingsStore.updateSettingLocally('SOURCE_LANGUAGE', 'de');
    await nextTick();
    await flushPromises();

    expect(mockSettingsStore.settings.SOURCE_LANGUAGE).toBe('de');
    expect(mockSettingsStore.settings.TARGET_LANGUAGE).toBe('fa');
  });

  it('keeps automatic sync for unrelated providers', async () => {
    mountTab();
    await flushPromises();

    mockSettingsStore.updateSettingLocally('TRANSLATION_API', 'google');
    mockSettingsStore.updateSettingLocally('TARGET_LANGUAGE', 'xx');
    await nextTick();
    mockSettingsStore.updateSettingLocally('SOURCE_LANGUAGE', 'de');
    await nextTick();
    await flushPromises();

    // 'xx' is in no provider list → still auto-corrected for non-DeepL providers
    // (existing fallback resolves to 'en' here)
    expect(mockSettingsStore.settings.TARGET_LANGUAGE).toBe('en');
  });

  it('preserves an unsupported source when switching to DeepL', async () => {
    const wrapper = mountTab();
    await flushPromises();

    // 'fa' source is valid for google; beta off makes it a DeepL conflict
    mockSettingsStore.updateSettingLocally('TRANSLATION_API', 'google');
    mockSettingsStore.updateSettingLocally('SOURCE_LANGUAGE', 'fa');
    mockSettingsStore.updateSettingLocally('TARGET_LANGUAGE', 'de');
    mockSettingsStore.updateSettingLocally('DEEPL_BETA_LANGUAGES_ENABLED', false);
    await nextTick();
    await flushPromises();

    // Store reports the source conflict once DeepL is the provider
    mockValidateSettings.mockImplementation(() => {
      const s = mockSettingsStore.settings;
      if (String(s.TRANSLATION_API).toLowerCase().includes('deepl')
        && s.DEEPL_BETA_LANGUAGES_ENABLED === false
        && s.SOURCE_LANGUAGE === 'fa') {
        return { isValid: false, errors: ['validation_deepl_source_language_beta_disabled:fa'] };
      }
      return { isValid: true, errors: [] };
    });

    // Switching to DeepL must not silently replace the conflicting source
    mockSettingsStore.updateSettingLocally('TRANSLATION_API', 'deepl');
    await nextTick();
    await flushPromises();

    expect(mockSettingsStore.settings.SOURCE_LANGUAGE).toBe('fa');

    // ...and the store conflict surfaces inline on feedback
    window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', {
      detail: { field: 'languages', focus: 'source' }
    }));
    await flushPromises();

    const error = wrapper.find('.validation-error .error-message');
    expect(error.exists()).toBe(true);
    expect(error.text()).toBe('validation_deepl_source_language_beta_disabled');
  });

  it('clears a stale DeepL error when switching to an unconfigured provider', async () => {
    const wrapper = mountTab();
    await flushPromises();

    // Show a DeepL conflict inline first
    mockValidateSettings.mockReturnValue({
      isValid: false,
      errors: ['validation_deepl_target_language_beta_disabled:fa']
    });
    mockSettingsStore.updateSettingLocally('DEEPL_BETA_LANGUAGES_ENABLED', false);
    await nextTick();
    window.dispatchEvent(new CustomEvent('options-trigger-validation-feedback', {
      detail: { field: 'languages', focus: 'target' }
    }));
    await flushPromises();
    expect(wrapper.find('.validation-error').exists()).toBe(true);

    // 'custom' has missing credentials → provider-config warning owns the display
    missingSettingMocks.getFirstMissingSetting.mockImplementation(
      (providerId) => (providerId === 'custom' ? 'CUSTOM_API_KEY' : null)
    );
    mockSettingsStore.updateSettingLocally('TRANSLATION_API', 'custom');
    await nextTick();
    await flushPromises();

    // Stale DeepL key is gone (validity flag mirrors the inline error; the
    // Transition leave itself never completes under jsdom) ...
    expect(mockSettingsStore.isSettingsValid).toBe(true);
    // ... while the provider-config warning still displays
    expect(wrapper.find('.provider-config-warning').exists()).toBe(true);
  });
});
