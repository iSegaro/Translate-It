import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import DeepseekApiSettings from './DeepseekApiSettings.vue';

const mocks = vi.hoisted(() => ({
  settingsStore: null,
  models: [
    { value: 'thinking-model', name: 'Thinking Model', supportsThinking: true },
    { value: 'standard-model', name: 'Standard Model', supportsThinking: false },
    { value: 'custom', name: 'Custom Model' },
  ],
  settingsModels: [
    { value: 'thinking-model', name: 'Thinking Model' },
    { value: 'standard-model', name: 'Standard Model', supportsThinking: true },
    { value: 'custom', name: 'Custom Model', supportsThinking: true },
  ],
  fetchModels: vi.fn(),
  getCachedModels: vi.fn(() => null),
}));

const translations = {
  deepseek_catalog_search_label: 'Search DeepSeek models',
  deepseek_catalog_search_placeholder: 'Search by model ID or name',
  deepseek_catalog_results_label: 'Available DeepSeek models',
  deepseek_catalog_no_matches: 'No models match your search.',
  deepseek_models_missing_key: 'Add an API key to discover available models.',
  deepseek_models_loading: 'Loading model catalog…',
  deepseek_models_discovery_failed: 'Could not load DeepSeek models.',
  deepseek_models_empty: 'No models were returned by DeepSeek.',
  deepseek_model_not_listed: 'Saved model was not listed by DeepSeek.',
  deepseek_saved_model_label: 'Saved model',
  deepseek_catalog_showing_count: ({ shown, total }) => `Showing ${shown} of ${total} matching models`,
  deepseek_custom_endpoint_info: 'Using a custom API URL — DeepSeek\'s model catalog is not loaded.',
};

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: vi.fn(() => mocks.settingsStore),
}));

vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    DEEPSEEK_API_MODEL: 'thinking-model',
    DEEPSEEK_API_KEY: '',
    DEEPSEEK_API_URL: 'https://api.deepseek.com/chat/completions',
    DEEPSEEK_MODELS: mocks.models,
    DEEPSEEK_THINKING_MODE_OPTIONS: [
      { value: 'disabled', name: 'Disabled' },
      { value: 'low', name: 'Low' },
      { value: 'high', name: 'High' },
      { value: 'max', name: 'Max' },
    ],
  },
}));

vi.mock('@/features/translation/providers/DeepSeekModelDiscovery.js', () => ({
  fetchDeepSeekModels: mocks.fetchModels,
  getCachedDeepSeekModels: mocks.getCachedModels,
  MissingDeepSeekKeyError: class MissingDeepSeekKeyError extends Error {},
}));

vi.mock('@/composables/ui/useRTLSelect.js', () => ({
  useRTLSelect: vi.fn(() => ({ rtlSelectStyle: {} })),
}));

vi.mock('@/features/translation/providers/ApiKeyManager.js', () => ({
  ApiKeyManager: {
    parseKeys: value => typeof value === 'string' ? value.split('\n').map(key => key.trim()).filter(Boolean) : [],
    testKeysDirect: vi.fn(),
  },
}));

vi.mock('@/features/translation/providers/ProviderConstants.js', () => ({
  ProviderRegistryIds: { DEEPSEEK: 'deepseek' },
}));

vi.mock('@/features/settings/presentation/ProviderSettingsErrorPresenter.js', () => ({
  presentProviderSettingsError: vi.fn(() => ({})),
}));

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({
    t: (key, params) => typeof translations[key] === 'function'
      ? translations[key](params)
      : translations[key] || key,
  })),
}));

vi.mock('./ApiKeyInput.vue', () => ({
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue', 'test'],
    template: '<input data-test="api-key" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
  },
}));

vi.mock('@/components/base/BaseInput.vue', () => ({
  default: {
    props: ['id', 'label', 'modelValue', 'placeholder', 'type'],
    emits: ['update:modelValue'],
    template: '<label v-if="label" :for="id">{{ label }}</label><input :id="id" :type="type || \'text\'" :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
  },
}));

vi.mock('@/components/base/BaseSelect.vue', () => ({
  default: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
  },
}));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('DeepseekApiSettings thinking mode eligibility', () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    vi.useFakeTimers();
    const settings = reactive({
      DEEPSEEK_API_KEY: '',
      DEEPSEEK_API_MODEL: 'thinking-model',
      DEEPSEEK_MODELS: mocks.settingsModels,
      DEEPSEEK_THINKING_MODE: 'high',
    });
    mocks.settingsStore = {
      settings,
      updateSettingLocally: vi.fn((key, value) => { settings[key] = value; }),
    };
    mocks.fetchModels.mockReset();
    mocks.getCachedModels.mockReset().mockReturnValue(null);
  });

  it('shows thinking mode only for CONFIG model metadata with supportsThinking true', async () => {
    const wrapper = mount(DeepseekApiSettings);

    expect(wrapper.find('.thinking-mode-select').exists()).toBe(true);

    await wrapper.get('.model-select').setValue('standard-model');
    expect(wrapper.find('.thinking-mode-select').exists()).toBe(false);

    await wrapper.get('.model-select').setValue('custom');
    expect(mocks.settingsStore.settings.DEEPSEEK_MODEL_SOURCE).toBe('custom');
    expect(wrapper.find('.thinking-mode-select').exists()).toBe(false);

    wrapper.unmount();
  });

  it('keeps curated Thinking eligibility and never infers it for catalog-only models', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    mocks.settingsStore.settings.DEEPSEEK_API_MODEL = 'catalog-thinking-model';
    mocks.fetchModels.mockResolvedValue([
      { value: 'catalog-thinking-model', name: 'Thinking Model' },
      { value: 'catalog-standard-model', name: 'Standard Model' },
    ]);
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();

    expect(wrapper.find('.thinking-mode-select').exists()).toBe(false);
    expect(wrapper.find('.model-select').element.value).toBe('catalog-thinking-model');
    expect(mocks.settingsStore.settings.DEEPSEEK_THINKING_MODE).toBe('high');
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('DEEPSEEK_THINKING_MODE', expect.anything());

    await wrapper.get('.model-select').setValue('thinking-model');
    expect(wrapper.find('.thinking-mode-select').exists()).toBe(true);
    await wrapper.get('.model-select').setValue('custom');
    expect(wrapper.find('.thinking-mode-select').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows missing-key state without fetching and retains the custom model path', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_MODEL = 'custom/model-id';
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    expect(wrapper.text()).toContain('Add an API key to discover available models.');
    expect(wrapper.text()).not.toContain('Could not load DeepSeek models.');
    expect(wrapper.find('.thinking-mode-select').exists()).toBe(false);
    expect(mocks.fetchModels).not.toHaveBeenCalled();
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('DEEPSEEK_MODELS', expect.anything());
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('DEEPSEEK_THINKING_MODE', expect.anything());
    wrapper.unmount();
  });

  it('searches IDs and names and caps the visible catalog at 50 models', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    mocks.fetchModels.mockResolvedValue(Array.from({ length: 60 }, (_, index) => ({
      value: `model/${index}`, name: index === 59 ? 'Late Friendly Model' : `Model ${index}`,
    })));
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    expect(wrapper.text()).toContain('Showing 50 of 60 matching models');
    expect(wrapper.get('.catalog-model-select').findAll('option')).toHaveLength(50);
    await wrapper.get('#deepseek-model-search').setValue('model/59');
    expect(wrapper.get('.catalog-model-select').findAll('option').map(option => option.element.value)).toEqual(['model/59']);
    await wrapper.get('#deepseek-model-search').setValue('late friendly');
    expect(wrapper.get('.catalog-model-select').findAll('option').map(option => option.element.value)).toEqual(['model/59']);
    wrapper.unmount();
  });

  it('derives catalog selection, clears it after curated changes, and never writes Thinking mode', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    mocks.fetchModels.mockResolvedValue([{ value: 'catalog/model', name: 'Catalog Model' }]);
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    const curatedSelect = wrapper.get('.model-select');
    const catalogSelect = wrapper.get('.catalog-model-select');
    await catalogSelect.setValue('catalog/model');
    expect(mocks.settingsStore.settings.DEEPSEEK_API_MODEL).toBe('catalog/model');
    expect(mocks.settingsStore.settings.DEEPSEEK_MODEL_SOURCE).toBe('catalog');
    expect(catalogSelect.element.value).toBe('catalog/model');
    await curatedSelect.setValue('thinking-model');
    expect(mocks.settingsStore.settings.DEEPSEEK_API_MODEL).toBe('thinking-model');
    expect(mocks.settingsStore.settings.DEEPSEEK_MODEL_SOURCE).toBe('curated');
    expect(catalogSelect.element.value).toBe('');
    expect(mocks.settingsStore.settings.DEEPSEEK_THINKING_MODE).toBe('high');
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('DEEPSEEK_THINKING_MODE', expect.anything());
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('DEEPSEEK_MODELS', expect.anything());
    wrapper.unmount();
  });

  it('protects a custom edit from a pending catalog and preserves missing saved models', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    mocks.settingsStore.settings.DEEPSEEK_API_MODEL = 'legacy/custom-model';
    const pending = deferred();
    mocks.fetchModels.mockReturnValue(pending.promise);
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    await wrapper.get('[placeholder="deepseek_custom_model_placeholder"]').setValue('custom/edited-model');
    pending.resolve([{ value: 'custom/edited-model', name: 'Catalog Match' }]);
    await flushPromises();
    expect(wrapper.find('.model-select').element.value).toBe('custom');
    expect(wrapper.get('[placeholder="deepseek_custom_model_placeholder"]').element.value).toBe('custom/edited-model');
    expect(mocks.settingsStore.settings.DEEPSEEK_API_MODEL).toBe('custom/edited-model');
    expect(mocks.settingsStore.settings.DEEPSEEK_MODEL_SOURCE).toBe('custom');
    expect(mocks.settingsStore.settings.DEEPSEEK_THINKING_MODE).toBe('high');
    wrapper.unmount();

    mocks.settingsStore.settings.DEEPSEEK_API_MODEL = 'missing/saved-model';
    mocks.fetchModels.mockResolvedValue([{ value: 'catalog/model', name: 'Catalog Model' }]);
    const legacy = mount(DeepseekApiSettings);
    await flushPromises();
    expect(legacy.text()).toContain('Saved model was not listed by DeepSeek.');
    expect(legacy.find('.model-select').findAll('option').map(option => option.element.value)).toContain('missing/saved-model');
    expect(mocks.settingsStore.settings.DEEPSEEK_API_MODEL).toBe('missing/saved-model');
    legacy.unmount();
  });

  it('preserves Custom selected during the key debounce and still syncs a pre-schedule saved model', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = '';
    const pending = deferred();
    mocks.fetchModels.mockReturnValueOnce(pending.promise);
    const wrapper = mount(DeepseekApiSettings);
    await wrapper.get('[data-test="api-key"]').setValue('secret-key');
    await wrapper.get('.model-select').setValue('custom');
    await vi.advanceTimersByTimeAsync(400);
    pending.resolve([{ value: 'thinking-model', name: 'Thinking Model' }]);
    await flushPromises();
    expect(wrapper.get('.model-select').element.value).toBe('custom');
    expect(wrapper.get('[placeholder="deepseek_custom_model_placeholder"]').exists()).toBe(true);
    expect(mocks.settingsStore.settings.DEEPSEEK_API_MODEL).toBe('thinking-model');
    wrapper.unmount();

    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'secret-key';
    mocks.settingsStore.settings.DEEPSEEK_API_MODEL = 'server/saved-model';
    const saved = deferred();
    mocks.fetchModels.mockReturnValueOnce(saved.promise);
    const savedWrapper = mount(DeepseekApiSettings);
    await flushPromises();
    saved.resolve([{ value: 'server/saved-model', name: 'Saved Model' }]);
    await flushPromises();
    expect(savedWrapper.get('.model-select').element.value).toBe('server/saved-model');
    expect(mocks.settingsStore.settings.DEEPSEEK_API_MODEL).toBe('server/saved-model');
    savedWrapper.unmount();
  });

  it('shows localized discovery failure and empty-result states', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    const pending = deferred();
    mocks.fetchModels.mockReturnValueOnce(pending.promise);
    const failure = mount(DeepseekApiSettings);
    await nextTick();
    expect(failure.text()).toContain('Loading model catalog…');
    pending.reject(new Error('offline'));
    await flushPromises();
    expect(failure.text()).toContain('Could not load DeepSeek models.');
    failure.unmount();

    mocks.fetchModels.mockResolvedValueOnce([]);
    const empty = mount(DeepseekApiSettings);
    await flushPromises();
    expect(empty.text()).toContain('No models were returned by DeepSeek.');
    empty.unmount();
  });

  it('debounces rapid key changes, ignores stale responses, and aborts on unmount', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'key-one';
    const first = deferred();
    const second = deferred();
    mocks.fetchModels.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    const firstSignal = mocks.fetchModels.mock.calls[0][0].signal;
    await wrapper.get('[data-test="api-key"]').setValue('key-two');
    await wrapper.get('[data-test="api-key"]').setValue('key-three');
    expect(firstSignal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(mocks.fetchModels).toHaveBeenCalledTimes(2);
    expect(mocks.fetchModels.mock.calls[1][0].apiKey).toBe('key-three');
    const secondSignal = mocks.fetchModels.mock.calls[1][0].signal;
    second.resolve([{ value: 'latest/model', name: 'Latest Model' }]);
    await flushPromises();
    first.resolve([{ value: 'stale/model', name: 'Stale Model' }]);
    await flushPromises();
    expect(wrapper.get('.catalog-model-select').text()).toContain('Latest Model');
    expect(wrapper.get('.catalog-model-select').text()).not.toContain('Stale Model');
    wrapper.unmount();
    expect(secondSignal.aborted).toBe(true);
  });

  it('aborts a pending request on unmount and ignores its late completion', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    const pending = deferred();
    mocks.fetchModels.mockReturnValue(pending.promise);
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    const signal = mocks.fetchModels.mock.calls[0][0].signal;
    wrapper.unmount();
    expect(signal.aborted).toBe(true);
    pending.resolve([{ value: 'late/model', name: 'Late Model' }]);
    await flushPromises();
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('DEEPSEEK_API_MODEL', 'late/model');
  });

  it('never reads the cache or fetches for a custom endpoint even when the cache is warm', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    mocks.settingsStore.settings.DEEPSEEK_API_URL = 'https://proxy.example/chat/completions';
    mocks.getCachedModels.mockReturnValue([{ value: 'cached/model', name: 'Cached Model' }]);
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    expect(mocks.getCachedModels).not.toHaveBeenCalled();
    expect(mocks.fetchModels).not.toHaveBeenCalled();
    expect(wrapper.find('.catalog-model-select').exists()).toBe(false);
    expect(wrapper.text()).toContain('Using a custom API URL — DeepSeek\'s model catalog is not loaded.');
    expect(wrapper.text()).not.toContain('Add an API key to discover available models.');
    expect(wrapper.text()).not.toContain('Cached Model');
    wrapper.unmount();
  });

  it('aborts a pending official request when the endpoint turns custom and ignores the late result', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    const pending = deferred();
    mocks.fetchModels.mockReturnValue(pending.promise);
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    const signal = mocks.fetchModels.mock.calls[0][0].signal;
    mocks.settingsStore.settings.DEEPSEEK_API_URL = 'https://proxy.example/chat/completions';
    expect(signal.aborted).toBe(true);
    pending.resolve([{ value: 'late/model', name: 'Late Model' }]);
    await flushPromises();
    expect(wrapper.find('.catalog-model-select').exists()).toBe(false);
    expect(wrapper.text()).toContain('Using a custom API URL — DeepSeek\'s model catalog is not loaded.');
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('DEEPSEEK_API_MODEL', 'late/model');
    wrapper.unmount();
  });

  it('resumes official discovery from cache after switching back from a custom endpoint', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    mocks.settingsStore.settings.DEEPSEEK_API_URL = 'https://proxy.example/chat/completions';
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    expect(mocks.fetchModels).not.toHaveBeenCalled();
    mocks.getCachedModels.mockReturnValue([{ value: 'cached/model', name: 'Cached Model' }]);
    mocks.settingsStore.settings.DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    expect(mocks.fetchModels).not.toHaveBeenCalled();
    expect(mocks.getCachedModels).toHaveBeenCalledWith('deepseek-key');
    expect(wrapper.get('.catalog-model-select').text()).toContain('Cached Model');
    wrapper.unmount();
  });

  it('debounces endpoint and key changes so only the latest official combination fetches', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'key-one';
    mocks.settingsStore.settings.DEEPSEEK_API_URL = 'https://proxy.example/chat/completions';
    mocks.fetchModels.mockResolvedValue([{ value: 'fresh/model', name: 'Fresh Model' }]);
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    expect(mocks.fetchModels).not.toHaveBeenCalled();
    mocks.settingsStore.settings.DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
    await wrapper.get('[data-test="api-key"]').setValue('key-two');
    await wrapper.get('[data-test="api-key"]').setValue('key-three');
    await vi.advanceTimersByTimeAsync(399);
    expect(mocks.fetchModels).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(mocks.fetchModels).toHaveBeenCalledTimes(1);
    expect(mocks.fetchModels.mock.calls[0][0].apiKey).toBe('key-three');
    expect(wrapper.get('.catalog-model-select').text()).toContain('Fresh Model');
    wrapper.unmount();
  });

  it('keeps an empty persistent live region mounted from initial render and updates only its contents', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    mocks.getCachedModels.mockReturnValue([{ value: 'cached/model', name: 'Cached Model' }]);
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    const region = wrapper.get('.model-discovery-status-live');
    expect(region.attributes('role')).toBe('status');
    expect(region.attributes('aria-live')).toBe('polite');
    expect(region.attributes('aria-atomic')).toBe('true');
    expect(region.text()).toBe('');
    expect(region.classes()).toContain('model-discovery-status--absent');
    expect(wrapper.find('.catalog-model-select').exists()).toBe(true);
    await wrapper.get('[data-test="api-key"]').setValue('');
    expect(wrapper.get('.model-discovery-status-live').element).toBe(region.element);
    expect(region.text()).toBe('Add an API key to discover available models.');
    expect(region.classes()).not.toContain('model-discovery-status--absent');
    expect(wrapper.find('.catalog-model-select').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the live region identity through the loading→failure transition', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    const pending = deferred();
    mocks.fetchModels.mockReturnValueOnce(pending.promise);
    const wrapper = mount(DeepseekApiSettings);
    await nextTick();
    const region = wrapper.get('.model-discovery-status-live');
    expect(region.text()).toBe('Loading model catalog…');
    pending.reject(new Error('offline'));
    await flushPromises();
    expect(wrapper.get('.model-discovery-status-live').element).toBe(region.element);
    expect(region.text()).toBe('Could not load DeepSeek models.');
    wrapper.unmount();
  });

  it('keeps the live region identity across a custom→official endpoint transition', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_URL = 'https://proxy.example/chat/completions';
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    const region = wrapper.get('.model-discovery-status-live');
    expect(region.text()).toBe('Using a custom API URL — DeepSeek\'s model catalog is not loaded.');
    expect(region.classes()).not.toContain('model-discovery-status--absent');
    mocks.settingsStore.settings.DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
    await nextTick();
    expect(wrapper.get('.model-discovery-status-live').element).toBe(region.element);
    expect(region.text()).toBe('Add an API key to discover available models.');
    wrapper.unmount();
  });

  it('keeps the live region identity through loading to the empty-catalog message', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    const pending = deferred();
    mocks.fetchModels.mockReturnValueOnce(pending.promise);
    const wrapper = mount(DeepseekApiSettings);
    await nextTick();
    const region = wrapper.get('.model-discovery-status-live');
    expect(region.text()).toBe('Loading model catalog…');
    pending.resolve([]);
    await flushPromises();
    expect(wrapper.get('.model-discovery-status-live').element).toBe(region.element);
    expect(region.text()).toBe('No models were returned by DeepSeek.');
    expect(wrapper.find('.catalog-model-select').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the saved-model warning region mounted and updates its contents after discovery', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    mocks.settingsStore.settings.DEEPSEEK_API_MODEL = 'missing/saved-model';
    const pending = deferred();
    mocks.fetchModels.mockReturnValueOnce(pending.promise);
    const wrapper = mount(DeepseekApiSettings);
    await nextTick();
    const warning = wrapper.get('.model-discovery-status-warning');
    expect(warning.attributes('role')).toBe('status');
    expect(warning.attributes('aria-live')).toBe('polite');
    expect(warning.attributes('aria-atomic')).toBe('true');
    expect(warning.text()).toBe('');
    expect(warning.classes()).toContain('model-discovery-status--absent');
    pending.resolve([{ value: 'catalog/model', name: 'Catalog Model' }]);
    await flushPromises();
    expect(wrapper.get('.model-discovery-status-warning').element).toBe(warning.element);
    expect(warning.text()).toBe('Saved model was not listed by DeepSeek.');
    expect(mocks.settingsStore.settings.DEEPSEEK_API_MODEL).toBe('missing/saved-model');
    wrapper.unmount();
  });

  it('keeps per-keystroke search feedback outside the live region', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    mocks.fetchModels.mockResolvedValue(Array.from({ length: 60 }, (_, index) => ({ value: `model/${index}`, name: `Model ${index}` })));
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    const region = wrapper.get('.model-discovery-status-live');
    expect(region.text()).toBe('');
    const showing = wrapper.findAll('.model-discovery-status').find(node => node.text().startsWith('Showing'));
    expect(showing.attributes('role')).toBeUndefined();
    expect(showing.attributes('aria-live')).toBeUndefined();
    expect(region.element.contains(showing.element)).toBe(false);
    await wrapper.get('#deepseek-model-search').setValue('zzz-no-match');
    expect(wrapper.get('.model-discovery-status-live').element).toBe(region.element);
    expect(region.text()).toBe('');
    const noMatch = wrapper.findAll('.model-discovery-status').find(node => node.text() === 'No models match your search.');
    expect(noMatch.attributes('role')).toBeUndefined();
    expect(region.element.contains(noMatch.element)).toBe(false);
    wrapper.unmount();
  });

  it('preserves saved catalog/custom provenance when reselecting the saved model after failed discovery', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    mocks.fetchModels.mockRejectedValue(new Error('offline'));
    for (const [model, source] of [['deepseek-chat', 'catalog'], ['my-manual-model', 'custom']]) {
      mocks.settingsStore.settings.DEEPSEEK_API_MODEL = model;
      mocks.settingsStore.settings.DEEPSEEK_MODEL_SOURCE = source;
      const wrapper = mount(DeepseekApiSettings);
      await flushPromises();
      expect(wrapper.text()).toContain('Could not load DeepSeek models.');
      await wrapper.get('.model-select').setValue(model);
      expect(mocks.settingsStore.settings.DEEPSEEK_API_MODEL).toBe(model);
      // This pair matches the migration-safe catalog/custom cases: no silent remap.
      expect(mocks.settingsStore.settings.DEEPSEEK_MODEL_SOURCE).toBe(source);
      wrapper.unmount();
    }

    mocks.settingsStore.settings.DEEPSEEK_API_MODEL = 'legacy/unknown-model';
    mocks.settingsStore.settings.DEEPSEEK_MODEL_SOURCE = 'legacy';
    const legacy = mount(DeepseekApiSettings);
    await flushPromises();
    await legacy.get('.model-select').setValue('legacy/unknown-model');
    expect(mocks.settingsStore.settings.DEEPSEEK_MODEL_SOURCE).toBe('legacy');
    legacy.unmount();
  });

  it('does not carry saved provenance onto a different unknown model ID', async () => {
    mocks.settingsStore.settings.DEEPSEEK_API_KEY = 'deepseek-key';
    mocks.settingsStore.settings.DEEPSEEK_API_MODEL = 'deepseek-chat';
    mocks.settingsStore.settings.DEEPSEEK_MODEL_SOURCE = 'catalog';
    mocks.fetchModels.mockRejectedValue(new Error('offline'));
    const wrapper = mount(DeepseekApiSettings);
    await flushPromises();
    // No unlisted option exists, so the select coerces to ''; provenance must not carry over.
    await wrapper.get('.model-select').setValue('unlisted-model-id');
    expect(mocks.settingsStore.settings.DEEPSEEK_API_MODEL).toBe('');
    expect(mocks.settingsStore.settings.DEEPSEEK_MODEL_SOURCE).toBe('legacy');
    wrapper.unmount();
  });
});
