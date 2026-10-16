import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import DeepLApiSettings from './DeepLApiSettings.vue';
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js';
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js';
import { getDeepLLanguageIdentity, normalizeDeepLLanguageCatalog } from '@/features/translation/providers/DeepLLanguageDiscovery.js';

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
    parseKeys: (value) => typeof value === 'string' && value.trim()
      ? value.split(/[\n,]+/).map((key) => key.trim()).filter(Boolean)
      : [],
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
      settings: reactive({ DEEPL_API_KEY: 'draft-key', DEEPL_API_TIER: 'pro', TARGET_LANGUAGE: 'fr', DEEPL_FORMALITY: 'more' }),
      deepLLanguageCapabilities: { status: 'idle', identity: null, catalog: null, fetchedAt: null },
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

  it('removes the beta toggle and reports unknown formality metadata without resetting the preference', () => {
    const wrapper = mount(DeepLApiSettings);
    expect(wrapper.text()).not.toContain('deepl_beta_languages_label');
    expect(wrapper.find('.formality-select').exists()).toBe(true);
    expect(wrapper.text()).toContain('deepl_formality_unverified');
    expect(mocks.settingsStore.settings.DEEPL_FORMALITY).toBe('more');
    wrapper.unmount();
  });

  it('distinguishes unsupported target formality from unknown metadata and preserves preference', () => {
    mocks.settingsStore.deepLLanguageCapabilities = {
      status: 'ready', identity: getDeepLLanguageIdentity('draft-key', 'pro'), fetchedAt: Date.now(),
      catalog: normalizeDeepLLanguageCatalog([
        { lang: 'fr', name: 'French', usable_as_source: true, usable_as_target: true, status: 'stable', features: {} }
      ])
    };
    const wrapper = mount(DeepLApiSettings);
    expect(wrapper.text()).toContain('deepl_formality_unavailable');
    expect(mocks.settingsStore.settings.DEEPL_FORMALITY).toBe('more');
    wrapper.unmount();

    mocks.settingsStore.deepLLanguageCapabilities = {
      ...mocks.settingsStore.deepLLanguageCapabilities,
      catalog: normalizeDeepLLanguageCatalog([
        { lang: 'fr', name: 'French', usable_as_source: true, usable_as_target: true, status: 'stable', features: { formality: { status: 'future' } } }
      ])
    };
    const unknown = mount(DeepLApiSettings);
    expect(unknown.text()).toContain('deepl_formality_unverified');
    expect(mocks.settingsStore.settings.DEEPL_FORMALITY).toBe('more');
    unknown.unmount();
  });

  it('uses the target alias catalog entry for formality support', () => {
    mocks.settingsStore.settings.TARGET_LANGUAGE = 'zh-cn';
    mocks.settingsStore.deepLLanguageCapabilities = {
      status: 'ready', identity: getDeepLLanguageIdentity('draft-key', 'pro'), fetchedAt: Date.now(),
      catalog: normalizeDeepLLanguageCatalog([
        { lang: 'zh-Hans', name: 'Chinese (Simplified)', usable_as_source: false, usable_as_target: true, status: 'beta', features: { formality: { status: 'stable' } } }
      ])
    };
    const wrapper = mount(DeepLApiSettings);
    expect(wrapper.text()).not.toContain('deepl_formality_unavailable');
    expect(wrapper.text()).not.toContain('deepl_formality_unverified');
    expect(mocks.settingsStore.settings.DEEPL_FORMALITY).toBe('more');
    wrapper.unmount();
  });

  it('accepts fresh formality metadata from a later eligible key after failover', () => {
    mocks.settingsStore.settings.DEEPL_API_KEY = 'draft-key\nfallback-key';
    mocks.settingsStore.deepLLanguageCapabilities = {
      status: 'ready', identity: getDeepLLanguageIdentity('fallback-key', 'pro'), fetchedAt: Date.now(),
      catalog: normalizeDeepLLanguageCatalog([
        { lang: 'fr', name: 'French', usable_as_source: true, usable_as_target: true, status: 'stable', features: { formality: { status: 'stable' } } }
      ])
    };
    const wrapper = mount(DeepLApiSettings);
    expect(wrapper.text()).toContain('deepl_formality_description');
    expect(wrapper.text()).not.toContain('deepl_formality_unverified');
    wrapper.unmount();
  });

  it('reports formality as unverified when the snapshot key is removed or expired', () => {
    const ready = {
      status: 'ready', identity: getDeepLLanguageIdentity('fallback-key', 'pro'), fetchedAt: Date.now(),
      catalog: normalizeDeepLLanguageCatalog([
        { lang: 'fr', name: 'French', usable_as_source: true, usable_as_target: true, status: 'stable', features: { formality: { status: 'stable' } } }
      ])
    };
    mocks.settingsStore.deepLLanguageCapabilities = ready;
    const removed = mount(DeepLApiSettings);
    expect(removed.text()).toContain('deepl_formality_unverified');
    removed.unmount();

    mocks.settingsStore.settings.DEEPL_API_KEY = 'draft-key\nfallback-key';
    mocks.settingsStore.deepLLanguageCapabilities = { ...ready, fetchedAt: Date.now() - 300000 };
    const expired = mount(DeepLApiSettings);
    expect(expired.text()).toContain('deepl_formality_unverified');
    expired.unmount();
  });
});
