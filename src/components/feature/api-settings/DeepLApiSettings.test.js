import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import DeepLApiSettings from './DeepLApiSettings.vue';
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js';
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js';

const mocks = vi.hoisted(() => ({
  settingsStore: null,
  testKeysDirect: vi.fn(),
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: vi.fn(() => mocks.settingsStore),
}));

vi.mock('@/features/translation/providers/ApiKeyManager.js', () => ({
  ApiKeyManager: {
    testKeysDirect: mocks.testKeysDirect,
  },
}));

vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    DEEPL_API_TIER_OPTIONS: [],
  },
}));

vi.mock('@/composables/ui/useRTLSelect.js', () => ({
  useRTLSelect: vi.fn(() => ({ rtlSelectStyle: {} })),
}));

vi.mock('@/features/settings/presentation/ProviderSettingsErrorPresenter.js', () => ({
  presentProviderSettingsError: vi.fn(() => ({})),
}));

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({ t: vi.fn((key) => key) })),
}));

vi.mock('./ApiKeyInput.vue', () => ({
  default: {
    name: 'ApiKeyInput',
    props: ['providerId'],
    emits: ['test'],
    template: '<button data-test="test-provider" @click="$emit(\'test\', providerId)">test</button>',
  },
}));

vi.mock('@/components/base/BaseSelect.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('@/components/base/BaseCheckbox.vue', () => ({
  default: { template: '<div />' },
}));

describe('DeepLApiSettings', () => {
  beforeEach(() => {
    mocks.settingsStore = {
      settings: reactive({ DEEPL_API_KEY: 'draft-key', DEEPL_API_TIER: 'pro' }),
      updateSettingLocally: vi.fn(),
    };
    mocks.testKeysDirect.mockReset().mockResolvedValue({
      allInvalid: true,
      messageKey: 'api_test_result_all_invalid',
      params: { count: 1 },
      reorderedString: 'draft-key',
    });
  });

  it('passes current unsaved DeepL tier to direct validation', async () => {
    const wrapper = mount(DeepLApiSettings);

    await wrapper.get('[data-test="test-provider"]').trigger('click');

    expect(ApiKeyManager.testKeysDirect).toHaveBeenCalledWith(
      'draft-key',
      ProviderRegistryIds.DEEPL,
      { apiTier: 'pro' },
    );
    wrapper.unmount();
  });
});
