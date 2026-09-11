import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, ref } from 'vue';
import ProvidersTab from './ProvidersTab.vue';

// Mock vue-router (useRoute for the tab, useRouter for useHighlightManager)
const currentRouteQuery = ref({});
vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: currentRouteQuery.value
  }),
  useRouter: () => ({
    push: vi.fn()
  })
}));

// Mock unified i18n with identity translation so raw keys are observable
vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => key
  })
}));

// Mock settings store: config-panel selection only, global API fixed
const mockUpdateSettingLocally = vi.fn();
const mockSettingsStore = reactive({
  settings: {
    TRANSLATION_API: 'googlev2',
    HIDDEN_PROVIDERS: []
  },
  activeConfigProvider: 'test-provider',
  updateSettingLocally: mockUpdateSettingLocally
});

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => mockSettingsStore
}));

// Stub ProviderSelector: v-model passthrough without provider internals
vi.mock('@/components/shared/ProviderSelector.vue', () => ({
  default: {
    name: 'ProviderSelector',
    props: {
      modelValue: { type: String, default: '' }
    },
    emits: ['update:modelValue'],
    template: '<select class="provider-selector-stub" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option value="test-provider">test</option><option value="other-provider">other</option></select>'
  }
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

describe('ProvidersTab.vue - Config-panel selector labeling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRouteQuery.value = {};
    mockSettingsStore.settings.TRANSLATION_API = 'googlev2';
    mockSettingsStore.settings.HIDDEN_PROVIDERS = [];
    mockSettingsStore.activeConfigProvider = 'test-provider';
  });

  it('renders the ProvidersTab-specific label key, not the shared global key', () => {
    const wrapper = mount(ProvidersTab);

    const label = wrapper.find('.primary-service-selection label');
    expect(label.exists()).toBe(true);
    expect(label.text()).toBe('providers_configure_label');
    expect(label.text()).not.toBe('translation_api_label');
  });

  it('selector change updates activeConfigProvider and leaves TRANSLATION_API untouched', async () => {
    const wrapper = mount(ProvidersTab);

    await wrapper.find('.provider-selector-stub').setValue('other-provider');
    await flushPromises();

    expect(mockSettingsStore.activeConfigProvider).toBe('other-provider');
    expect(mockSettingsStore.settings.TRANSLATION_API).toBe('googlev2');
  });

  it('computed selector reflects the store-managed config provider', async () => {
    const wrapper = mount(ProvidersTab);

    expect(wrapper.find('.provider-selector-stub').element.value).toBe('test-provider');

    mockSettingsStore.activeConfigProvider = 'other-provider';
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.provider-selector-stub').element.value).toBe('other-provider');
    expect(mockSettingsStore.settings.TRANSLATION_API).toBe('googlev2');
  });
});
