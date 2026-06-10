import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, reactive, computed } from 'vue';
import OptionsNavigation from './OptionsNavigation.vue';
import { storageManager } from '@/shared/storage/core/StorageCore.js';

// Mock vue-router
const pushMock = vi.fn();
const currentRouteName = ref('languages');
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock,
    currentRoute: computed(() => ({ name: currentRouteName.value }))
  })
}));

// Mock useUnifiedI18n composable
vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => key,
    locale: ref('en')
  })
}));

// Mock settings store
const mockValidateSettings = vi.fn();
const mockSaveSettings = vi.fn();
const mockSettingsStore = reactive({
  settings: {
    TRANSLATION_API: 'google',
    MODE_PROVIDERS: {},
    PROMPT_TEMPLATE: 'valid template $_{SOURCE} $_{TARGET} $_{TEXT}'
  },
  validateSettings: mockValidateSettings,
  saveAllSettings: mockSaveSettings
});

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => mockSettingsStore
}));

// Mock safeSendMessage & settingsManager
vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  safeSendMessage: vi.fn()
}));
vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    get: vi.fn(),
    set: vi.fn(),
    refreshSettings: vi.fn()
  }
}));

// Mock storageManager safely
vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    get: vi.fn(),
    set: vi.fn()
  }
}));

describe('OptionsNavigation.vue - Save Validation UX & Partial Save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRouteName.value = 'languages';
    mockSettingsStore.settings = {
      TRANSLATION_API: 'google',
      MODE_PROVIDERS: {},
      PROMPT_TEMPLATE: 'original valid template $_{SOURCE} $_{TARGET} $_{TEXT}'
    };
    
    vi.mocked(storageManager.get).mockResolvedValue({
      PROMPT_TEMPLATE: 'last persisted template $_{SOURCE} $_{TARGET} $_{TEXT}'
    });
    vi.mocked(storageManager.set).mockResolvedValue(true);
    mockSaveSettings.mockResolvedValue(true);
  });

  it('valid settings allows save successfully', async () => {
    mockValidateSettings.mockReturnValue({ isValid: true, errors: [] });
    
    const wrapper = mount(OptionsNavigation, {
      global: {
        stubs: {
          RouterLink: true
        },
        mocks: {
          $route: {
            name: 'languages'
          }
        }
      }
    });

    const saveButton = wrapper.find('#saveSettings');
    expect(saveButton.exists()).toBe(true);
    
    await saveButton.trigger('click');
    await flushPromises();
    
    expect(mockValidateSettings).toHaveBeenCalled();
    expect(mockSaveSettings).toHaveBeenCalled();
    expect(wrapper.find('#status').text()).toBe('OPTIONS_STATUS_SAVED_SUCCESS');
  });

  it('prompt-only validation error triggers partial save and restores draft', async () => {
    // 1. Setup mock validation failure for prompts only
    mockValidateSettings.mockReturnValue({ 
      isValid: false, 
      errors: ['prompt:PROMPT_TEMPLATE:validation_prompt_template_empty'] 
    });

    // Set draft invalid value in local store state
    mockSettingsStore.settings.PROMPT_TEMPLATE = 'invalid draft template';

    const wrapper = mount(OptionsNavigation, {
      global: {
        stubs: {
          RouterLink: true
        },
        mocks: {
          $route: {
            name: 'languages'
          }
        }
      }
    });

    // Monitor the value of the settings during the actual save call
    let valueDuringSave = null;
    mockSaveSettings.mockImplementation(() => {
      valueDuringSave = mockSettingsStore.settings.PROMPT_TEMPLATE;
      return Promise.resolve(true);
    });

    // Setup custom event listener for redirect / validation feedback
    const customEventListener = vi.fn();
    window.addEventListener('options-trigger-validation-feedback', customEventListener);

    const saveButton = wrapper.find('#saveSettings');
    await saveButton.trigger('click');
    await flushPromises();

    // Save should run!
    expect(mockSaveSettings).toHaveBeenCalled();

    // Persisted payload during the save should have reverted to last persisted value
    expect(valueDuringSave).toBe('last persisted template $_{SOURCE} $_{TARGET} $_{TEXT}');

    // UI/Store state should be restored to the user's invalid draft
    expect(mockSettingsStore.settings.PROMPT_TEMPLATE).toBe('invalid draft template');

    // Warning status should be shown
    expect(wrapper.find('#status').text()).toBe('OPTIONS_STATUS_SAVED_WITH_PROMPT_ERRORS');
    expect(wrapper.find('#status').classes()).toContain('status-warning');

    // Redirect to prompt tab and focus should still happen
    expect(pushMock).toHaveBeenCalledWith({ name: 'prompt' });
    expect(customEventListener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { field: 'prompt', promptKey: 'PROMPT_TEMPLATE' }
      })
    );

    window.removeEventListener('options-trigger-validation-feedback', customEventListener);
  });

  it('mixed validation errors (prompt + non-prompt) completely blocks save', async () => {
    // Set current route name to prompt, so redirect to languages is forced to trigger
    currentRouteName.value = 'prompt';

    // Return both prompt error and language error
    mockValidateSettings.mockReturnValue({ 
      isValid: false, 
      errors: [
        'validation_source_language_empty',
        'prompt:PROMPT_TEMPLATE:validation_prompt_template_empty'
      ] 
    });
    
    const wrapper = mount(OptionsNavigation, {
      global: {
        stubs: {
          RouterLink: true
        },
        mocks: {
          $route: {
            name: 'prompt'
          }
        }
      }
    });

    const saveButton = wrapper.find('#saveSettings');
    await saveButton.trigger('click');
    await flushPromises();
    
    // Save should NOT run
    expect(mockSaveSettings).not.toHaveBeenCalled();
    
    // Status should be set to validation_source_language_empty error (non-prompt error)
    expect(wrapper.find('#status').text()).toBe('validation_source_language_empty');
    expect(wrapper.find('#status').classes()).toContain('status-error');

    // Redirect should go to languages tab
    expect(pushMock).toHaveBeenCalledWith({ name: 'languages' });
  });

  it('save failure during temporary swap restores invalid draft values', async () => {
    mockValidateSettings.mockReturnValue({ 
      isValid: false, 
      errors: ['prompt:PROMPT_TEMPLATE:validation_prompt_template_empty'] 
    });

    mockSettingsStore.settings.PROMPT_TEMPLATE = 'invalid draft template';
    
    // Save operation throws an error
    mockSaveSettings.mockRejectedValue(new Error('Save failed'));

    const wrapper = mount(OptionsNavigation, {
      global: {
        stubs: {
          RouterLink: true
        },
        mocks: {
          $route: {
            name: 'languages'
          }
        }
      }
    });

    const saveButton = wrapper.find('#saveSettings');
    await saveButton.trigger('click');
    await flushPromises();

    // Save was attempted
    expect(mockSaveSettings).toHaveBeenCalled();

    // Draft is restored even after save failure
    expect(mockSettingsStore.settings.PROMPT_TEMPLATE).toBe('invalid draft template');
    
    // Status is set to failure
    expect(wrapper.find('#status').text()).toBe('OPTIONS_STATUS_SAVED_FAILED');
    expect(wrapper.find('#status').classes()).toContain('status-error');
  });
});
