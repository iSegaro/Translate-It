import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, reactive, computed } from 'vue';
import OptionsNavigation from './OptionsNavigation.vue';

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
    MODE_PROVIDERS: {}
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

describe('OptionsNavigation.vue - Save Validation UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRouteName.value = 'languages';
    mockSettingsStore.settings = {
      TRANSLATION_API: 'google',
      MODE_PROVIDERS: {}
    };
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

  it('invalid prompt template blocks save, sets error status, and triggers redirect', async () => {
    // Return prompt validation error
    mockValidateSettings.mockReturnValue({ 
      isValid: false, 
      errors: ['prompt:PROMPT_TEMPLATE:validation_prompt_template_empty'] 
    });
    
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

    // Setup custom event listener to verify options-trigger-validation-feedback event is fired
    const customEventListener = vi.fn();
    window.addEventListener('options-trigger-validation-feedback', customEventListener);

    const saveButton = wrapper.find('#saveSettings');
    await saveButton.trigger('click');
    await flushPromises();
    
    // Save should NOT be called
    expect(mockValidateSettings).toHaveBeenCalled();
    expect(mockSaveSettings).not.toHaveBeenCalled();
    
    // Status should be set to validation_prompt_template_empty error
    expect(wrapper.find('#status').text()).toBe('validation_prompt_template_empty');
    expect(wrapper.find('#status').classes()).toContain('status-error');

    // Route should change to prompt tab
    expect(pushMock).toHaveBeenCalledWith({ name: 'prompt' });
    
    // Window validation feedback event should be dispatched
    expect(customEventListener).toHaveBeenCalled();
    
    // Clean up event listener
    window.removeEventListener('options-trigger-validation-feedback', customEventListener);
  });
});
