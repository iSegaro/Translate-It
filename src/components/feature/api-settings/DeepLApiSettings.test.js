import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
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
    // Fully reactive so snapshot updates recomputing formality feedback are
    // tracked, like the real Pinia-backed store.
    mocks.settingsStore = reactive({
      settings: { TRANSLATION_API: 'google', DEEPL_API_KEY: 'draft-key', DEEPL_API_TIER: 'pro', TARGET_LANGUAGE: 'fr', DEEPL_FORMALITY: 'more' },
      deepLLanguageCapabilities: { status: 'idle', identity: null, catalog: null, fetchedAt: null },
      refreshDeepLLanguageCapabilities: vi.fn(),
      updateSettingLocally: vi.fn(),
    });
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

  it('refreshes DeepL capabilities for the panel even when another provider is primary', async () => {
    mocks.settingsStore.refreshDeepLLanguageCapabilities.mockResolvedValue(undefined);
    const wrapper = mount(DeepLApiSettings);
    await flushPromises();
    expect(mocks.settingsStore.refreshDeepLLanguageCapabilities).toHaveBeenCalledWith({ forProvider: ProviderRegistryIds.DEEPL });

    // Draft credential change (unsaved settings text) triggers another refresh
    mocks.settingsStore.settings.DEEPL_API_KEY = 'draft-key-2';
    await nextTick();
    await flushPromises();
    expect(mocks.settingsStore.refreshDeepLLanguageCapabilities).toHaveBeenCalledTimes(2);

    // A tier draft change refreshes too
    mocks.settingsStore.settings.DEEPL_API_TIER = 'free';
    await nextTick();
    await flushPromises();
    expect(mocks.settingsStore.refreshDeepLLanguageCapabilities).toHaveBeenCalledTimes(3);
    wrapper.unmount();

    mocks.settingsStore.settings.DEEPL_API_KEY = 'after-unmount-key';
    await nextTick();
    await flushPromises();
    expect(mocks.settingsStore.refreshDeepLLanguageCapabilities).toHaveBeenCalledTimes(3);
  });

  it('refreshes after a batched proxy draft correction and updates formality from the fresh catalog', async () => {
    mocks.settingsStore.settings = {
      ...mocks.settingsStore.settings,
      PROXY_ENABLED: true,
      PROXY_TYPE: 'http',
      PROXY_HOST: 'broken.saved.proxy',
      PROXY_PORT: 1,
      PROXY_USERNAME: '',
      PROXY_PASSWORD: '',
    };
    mocks.settingsStore.deepLLanguageCapabilities = { status: 'error', identity: null, catalog: null, fetchedAt: null };
    mocks.settingsStore.refreshDeepLLanguageCapabilities.mockImplementation(() => {
      if (mocks.settingsStore.settings.PROXY_HOST === 'corrected.draft.proxy') {
        mocks.settingsStore.deepLLanguageCapabilities = {
          status: 'ready',
          identity: getDeepLLanguageIdentity('draft-key', 'pro'),
          fetchedAt: Date.now(),
          catalog: normalizeDeepLLanguageCatalog([
            { lang: 'fr', name: 'French', usable_as_source: true, usable_as_target: true, status: 'stable', features: { formality: { status: 'stable' } } }
          ]),
        };
      }
      return Promise.resolve();
    });

    const wrapper = mount(DeepLApiSettings);
    await flushPromises();
    expect(wrapper.text()).toContain('deepl_formality_unverified');
    mocks.settingsStore.refreshDeepLLanguageCapabilities.mockClear();

    Object.assign(mocks.settingsStore.settings, {
      PROXY_ENABLED: true,
      PROXY_TYPE: 'http',
      PROXY_HOST: 'corrected.draft.proxy',
      PROXY_PORT: 8443,
      PROXY_USERNAME: 'draft-user',
      PROXY_PASSWORD: 'draft-password',
    });
    await nextTick();
    await flushPromises();

    expect(mocks.settingsStore.refreshDeepLLanguageCapabilities).toHaveBeenCalledTimes(1);
    expect(mocks.settingsStore.refreshDeepLLanguageCapabilities).toHaveBeenCalledWith({ forProvider: ProviderRegistryIds.DEEPL });
    expect(wrapper.text()).toContain('deepl_formality_description');
    expect(wrapper.text()).not.toContain('deepl_formality_unverified');
    wrapper.unmount();
  });

  it('does not request a catalog refresh without eligible DeepL credentials', async () => {
    mocks.settingsStore.settings.DEEPL_API_KEY = '';
    const wrapper = mount(DeepLApiSettings);
    await flushPromises();
    expect(mocks.settingsStore.refreshDeepLLanguageCapabilities).not.toHaveBeenCalled();

    // Providing eligible credentials starts requesting again (tier is 'pro')
    mocks.settingsStore.settings.DEEPL_API_KEY = 'draft-key';
    await nextTick();
    await flushPromises();
    expect(mocks.settingsStore.refreshDeepLLanguageCapabilities).toHaveBeenCalledWith({ forProvider: ProviderRegistryIds.DEEPL });

    // A free-tier key (:fx suffix) is ineligible while Pro is selected
    mocks.settingsStore.settings.DEEPL_API_KEY = 'free-key:fx';
    await nextTick();
    await flushPromises();
    expect(mocks.settingsStore.refreshDeepLLanguageCapabilities).toHaveBeenCalledTimes(1);

    // Selecting the Free tier makes it eligible again
    mocks.settingsStore.settings.DEEPL_API_TIER = 'free';
    await nextTick();
    await flushPromises();
    expect(mocks.settingsStore.refreshDeepLLanguageCapabilities).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('updates formality feedback after the explicit panel refresh resolves', async () => {
    let resolveRefresh;
    mocks.settingsStore.refreshDeepLLanguageCapabilities.mockReturnValue(new Promise((resolve) => {
      resolveRefresh = () => {
        mocks.settingsStore.deepLLanguageCapabilities = {
          status: 'ready', identity: getDeepLLanguageIdentity('draft-key', 'pro'), fetchedAt: Date.now(),
          catalog: normalizeDeepLLanguageCatalog([
            { lang: 'fr', name: 'French', usable_as_source: true, usable_as_target: true, status: 'stable', features: { formality: { status: 'stable' } } }
          ])
        };
        resolve();
      };
    }));
    const wrapper = mount(DeepLApiSettings);
    expect(wrapper.text()).toContain('deepl_formality_unverified');
    resolveRefresh();
    await flushPromises();
    expect(wrapper.text()).toContain('deepl_formality_description');
    expect(wrapper.text()).not.toContain('deepl_formality_unverified');
    expect(mocks.settingsStore.settings.DEEPL_FORMALITY).toBe('more');
    wrapper.unmount();
  });

  it('tolerates a failed panel refresh and keeps the formality unverified', async () => {
    mocks.settingsStore.refreshDeepLLanguageCapabilities.mockRejectedValue(new Error('offline'));
    const wrapper = mount(DeepLApiSettings);
    await flushPromises();
    expect(wrapper.text()).toContain('deepl_formality_unverified');
    expect(mocks.settingsStore.settings.DEEPL_FORMALITY).toBe('more');
    wrapper.unmount();
  });
});
