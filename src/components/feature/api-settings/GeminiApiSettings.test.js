import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import GeminiApiSettings from './GeminiApiSettings.vue'
import ApiKeyInput from './ApiKeyInput.vue'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'

const mocks = vi.hoisted(() => ({
  settingsStore: null,
  fetchModels: vi.fn(),
  getCachedModels: vi.fn(() => null),
}))

const translations = {
  gemini_catalog_search_label: 'Search Gemini models',
  gemini_catalog_search_placeholder: 'Search by model ID or name',
  gemini_catalog_results_label: 'Available Gemini models',
  gemini_catalog_no_matches: 'No models match your search.',
  gemini_models_missing_key: 'Add an API key to discover available models.',
  gemini_models_loading: 'Loading model catalog…',
  gemini_models_discovery_failed: 'Could not load Gemini models.',
  gemini_models_empty: 'No models were returned by Gemini.',
  gemini_model_not_listed: 'Saved model was not listed by Gemini.',
  gemini_saved_model_label: 'Saved model',
  gemini_catalog_showing_count: ({ shown, total }) => `Showing ${shown} of ${total} matching models`,
}

vi.mock('@/features/settings/stores/settings.js', () => ({ useSettingsStore: () => mocks.settingsStore }))
vi.mock('@/features/translation/providers/GeminiModelDiscovery.js', () => ({
  fetchGeminiModels: mocks.fetchModels,
  getCachedGeminiModels: mocks.getCachedModels,
  MissingGeminiKeyError: class MissingGeminiKeyError extends Error {},
}))
vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    GEMINI_API_KEY: '',
    GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/curated-one:generateContent',
    GEMINI_MODEL: 'curated-one',
    GEMINI_MODEL_SOURCE: 'legacy',
    GEMINI_MODELS: [
      { value: 'curated-one', name: 'Curated One', url: 'https://generativelanguage.googleapis.com/v1beta/models/curated-one:generateContent', thinking: { minimal: null } },
      { value: 'curated-two', name: 'Curated Two', url: 'https://generativelanguage.googleapis.com/v1beta/models/curated-two:generateContent', thinking: { minimal: null } },
      { value: 'custom', name: 'Custom Model', custom: true },
    ],
    GEMINI_THINKING_MODE: 'default',
  },
}))
vi.mock('@/composables/ui/useRTLSelect.js', () => ({ useRTLSelect: () => ({ rtlSelectStyle: {} }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({
  t: (key, params) => typeof translations[key] === 'function'
    ? translations[key](params)
    : translations[key] || key,
}) }))
vi.mock('@/features/translation/providers/ApiKeyManager.js', () => ({
  ApiKeyManager: {
    parseKeys: value => typeof value === 'string' ? value.split('\n').map(key => key.trim()).filter(Boolean) : [],
    testKeysDirect: vi.fn(),
  },
}))
vi.mock('@/features/translation/providers/ProviderConstants.js', () => ({ ProviderRegistryIds: { GEMINI: 'gemini' } }))
vi.mock('@/features/settings/presentation/ProviderSettingsErrorPresenter.js', () => ({ presentProviderSettingsError: vi.fn() }))
vi.mock('./ApiKeyInput.vue', () => ({
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue', 'test'],
    template: '<input data-test="api-key" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
  },
}))
vi.mock('@/components/base/BaseInput.vue', () => ({
  default: {
    props: ['id', 'label', 'modelValue', 'placeholder', 'type'],
    emits: ['update:modelValue'],
    template: '<label v-if="label" :for="id">{{ label }}</label><input :id="id" :type="type || \'text\'" :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
  },
}))
vi.mock('@/components/base/BaseSelect.vue', () => ({
  inheritAttrs: false,
  default: {
    inheritAttrs: false,
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: '<select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
  },
}))

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('GeminiApiSettings dynamic model catalog', () => {
  afterEach(() => vi.useRealTimers())

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.settingsStore = {
      settings: reactive({
        GEMINI_API_KEY: '',
        GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/curated-one:generateContent',
        GEMINI_MODEL: 'curated-one',
        GEMINI_MODEL_SOURCE: 'legacy',
        GEMINI_THINKING_MODE: 'default',
        GEMINI_MODELS: [
          { value: 'curated-one', name: 'Curated One' },
          { value: 'curated-two', name: 'Curated Two' },
          { value: 'custom', name: 'Custom Model' },
        ],
      }),
      updateSettingLocally: vi.fn((key, value) => { mocks.settingsStore.settings[key] = value }),
    }
    mocks.fetchModels.mockReset()
    mocks.getCachedModels.mockReset().mockReturnValue(null)
    ApiKeyManager.testKeysDirect.mockReset().mockResolvedValue({ allInvalid: true })
  })

  it('keeps curated order and skips discovery without an API key', async () => {
    const wrapper = mount(GeminiApiSettings)
    await flushPromises()
    expect(wrapper.get('.model-select').findAll('option').map(option => option.element.value)).toEqual([
      'curated-one', 'curated-two', 'custom',
    ])
    expect(wrapper.text()).toContain('Add an API key to discover available models.')
    expect(mocks.fetchModels).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('discovers after key entry and searches the catalog by ID and display name', async () => {
    mocks.fetchModels.mockResolvedValue([
      { value: 'gemini-new', name: 'New Gemini' },
      { value: 'gemini-other', name: 'Other Model' },
    ])
    const wrapper = mount(GeminiApiSettings)
    await flushPromises()
    await wrapper.get('[data-test="api-key"]').setValue('key-one')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(mocks.fetchModels).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'key-one', signal: expect.any(AbortSignal) }))
    expect(wrapper.get('.catalog-model-select').findAll('option').map(option => option.element.value)).toEqual(['gemini-new', 'gemini-other'])
    await wrapper.get('#gemini-model-search').setValue('gemini-new')
    expect(wrapper.get('.catalog-model-select').findAll('option').map(option => option.element.value)).toEqual(['gemini-new'])
    await wrapper.get('#gemini-model-search').setValue('new gemini')
    expect(wrapper.get('.catalog-model-select').findAll('option').map(option => option.element.value)).toEqual(['gemini-new'])
    wrapper.unmount()
  })

  it('selects catalog models with a persistent source marker and clears derived selection after curated pick', async () => {
    mocks.settingsStore.settings.GEMINI_API_KEY = 'key'
    mocks.fetchModels.mockResolvedValue([{ value: 'gemini-catalog', name: 'Catalog Gemini' }])
    const wrapper = mount(GeminiApiSettings)
    await flushPromises()
    await wrapper.get('.catalog-model-select').setValue('gemini-catalog')
    expect(mocks.settingsStore.settings.GEMINI_MODEL).toBe('gemini-catalog')
    expect(mocks.settingsStore.settings.GEMINI_MODEL_SOURCE).toBe('catalog')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('GEMINI_API_URL', expect.anything())
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('GEMINI_MODELS', expect.anything())
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('GEMINI_THINKING_MODE', expect.anything())
    await wrapper.get('.model-select').setValue('curated-two')
    expect(mocks.settingsStore.settings.GEMINI_MODEL).toBe('curated-two')
    expect(mocks.settingsStore.settings.GEMINI_MODEL_SOURCE).toBe('curated')
    expect(wrapper.get('.catalog-model-select').element.value).toBe('')
    wrapper.unmount()
  })

  it('preserves custom API URL and legacy unknown-model routing when discovery completes', async () => {
    mocks.settingsStore.settings.GEMINI_API_KEY = 'key'
    mocks.settingsStore.settings.GEMINI_MODEL = 'legacy/model-id'
    mocks.settingsStore.settings.GEMINI_API_URL = 'https://custom.example/v1beta/models/custom-path:generateContent'
    mocks.settingsStore.settings.GEMINI_MODEL_SOURCE = 'legacy'
    mocks.fetchModels.mockResolvedValue([{ value: 'legacy/model-id', name: 'Listed Model' }])
    const wrapper = mount(GeminiApiSettings)
    await flushPromises()
    expect(mocks.settingsStore.settings.GEMINI_API_URL).toBe('https://custom.example/v1beta/models/custom-path:generateContent')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('GEMINI_API_URL', expect.anything())
    expect(wrapper.get('#GEMINI_API_URL').element.value).toBe('https://custom.example/v1beta/models/custom-path:generateContent')
    expect(mocks.settingsStore.settings.GEMINI_MODEL_SOURCE).toBe('legacy')
    wrapper.unmount()
  })

  it('guards a pending API URL edit and preserves the selected custom URL', async () => {
    mocks.settingsStore.settings.GEMINI_API_KEY = 'key'
    // Unknown saved model → custom option, so the API URL input is rendered (pre-existing UX).
    mocks.settingsStore.settings.GEMINI_MODEL = 'my-custom-model'
    mocks.settingsStore.settings.GEMINI_MODEL_SOURCE = 'legacy'
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(GeminiApiSettings)
    await flushPromises()
    const editedUrl = 'https://proxy.example/v1beta/models/custom-route:generateContent'
    await wrapper.get('#GEMINI_API_URL').setValue(editedUrl)
    pending.resolve([{ value: 'catalog/saved-id', name: 'Saved Model' }])
    await flushPromises()
    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(wrapper.get('#GEMINI_API_URL').element.value).toBe(editedUrl)
    expect(mocks.settingsStore.settings.GEMINI_API_URL).toBe(editedUrl)
    expect(mocks.settingsStore.settings.GEMINI_MODEL_SOURCE).toBe('custom')
    wrapper.unmount()
  })

  it('represents a saved catalog selection without writing the model or URL on discovery', async () => {
    mocks.settingsStore.settings.GEMINI_API_KEY = 'key'
    mocks.settingsStore.settings.GEMINI_MODEL = 'catalog/saved-id'
    mocks.settingsStore.settings.GEMINI_MODEL_SOURCE = 'catalog'
    mocks.fetchModels.mockResolvedValue([{ value: 'catalog/saved-id', name: 'Saved Model' }])
    const wrapper = mount(GeminiApiSettings)
    await flushPromises()
    expect(wrapper.get('.model-select').element.value).toBe('catalog/saved-id')
    expect(wrapper.get('.catalog-model-select').element.value).toBe('catalog/saved-id')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('GEMINI_MODEL', 'catalog/saved-id')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('GEMINI_API_URL', expect.anything())
    wrapper.unmount()
  })

  it('preserves a missing saved model and supports legacy custom selections', async () => {
    mocks.settingsStore.settings.GEMINI_API_KEY = 'key'
    mocks.settingsStore.settings.GEMINI_MODEL = 'legacy/missing'
    mocks.settingsStore.settings.GEMINI_MODEL_SOURCE = 'legacy'
    mocks.fetchModels.mockResolvedValue([{ value: 'server/model', name: 'Server Model' }])
    const wrapper = mount(GeminiApiSettings)
    await flushPromises()
    expect(wrapper.text()).toContain('Saved model was not listed by Gemini.')
    expect(wrapper.get('.model-select').findAll('option').map(option => option.element.value)).toContain('legacy/missing')
    expect(mocks.settingsStore.settings.GEMINI_MODEL).toBe('legacy/missing')
    wrapper.unmount()
  })

  it('shows localized loading, failure, empty, and 50-result states; full catalog remains searchable', async () => {
    mocks.settingsStore.settings.GEMINI_API_KEY = 'key'
    const pending = deferred()
    mocks.fetchModels.mockReturnValueOnce(pending.promise)
    const loading = mount(GeminiApiSettings)
    await nextTick()
    expect(loading.text()).toContain('Loading model catalog…')
    pending.reject(new Error('offline'))
    await flushPromises()
    expect(loading.text()).toContain('Could not load Gemini models.')
    loading.unmount()

    mocks.fetchModels.mockResolvedValueOnce([])
    const empty = mount(GeminiApiSettings)
    await flushPromises()
    expect(empty.text()).toContain('No models were returned by Gemini.')
    empty.unmount()

    mocks.fetchModels.mockResolvedValueOnce(Array.from({ length: 600 }, (_, index) => ({ value: `model/${index}`, name: `Model ${index}` })))
    const catalog = mount(GeminiApiSettings)
    await flushPromises()
    expect(catalog.text()).toContain('Showing 50 of 600 matching models')
    expect(catalog.get('.catalog-model-select').findAll('option')).toHaveLength(50)
    await catalog.get('#gemini-model-search').setValue('model/599')
    expect(catalog.get('.catalog-model-select').findAll('option').map(option => option.element.value)).toEqual(['model/599'])
    catalog.unmount()
  })

  it('debounces key changes, ignores stale responses, and aborts on unmount', async () => {
    mocks.settingsStore.settings.GEMINI_API_KEY = 'key-one'
    const first = deferred()
    const second = deferred()
    mocks.fetchModels.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const wrapper = mount(GeminiApiSettings)
    await flushPromises()
    const firstSignal = mocks.fetchModels.mock.calls[0][0].signal
    await wrapper.get('[data-test="api-key"]').setValue('key-two')
    await wrapper.get('[data-test="api-key"]').setValue('key-three')
    expect(firstSignal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(400)
    expect(mocks.fetchModels).toHaveBeenCalledTimes(2)
    expect(mocks.fetchModels.mock.calls[1][0].apiKey).toBe('key-three')
    const secondSignal = mocks.fetchModels.mock.calls[1][0].signal
    second.resolve([{ value: 'latest/model', name: 'Latest Model' }])
    await flushPromises()
    first.resolve([{ value: 'stale/model', name: 'Stale Model' }])
    await flushPromises()
    expect(wrapper.get('.catalog-model-select').text()).toContain('Latest Model')
    expect(wrapper.get('.catalog-model-select').text()).not.toContain('Stale Model')
    wrapper.unmount()
    expect(secondSignal.aborted).toBe(true)
  })

  it('aborts an in-flight catalog request on unmount and ignores its late result', async () => {
    mocks.settingsStore.settings.GEMINI_API_KEY = 'key'
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(GeminiApiSettings)
    await flushPromises()
    const signal = mocks.fetchModels.mock.calls[0][0].signal
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
    pending.resolve([{ value: 'late/model', name: 'Late Model' }])
    await flushPromises()
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('GEMINI_MODEL', 'late/model')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('GEMINI_API_URL', expect.anything())
  })

  it('validates catalog selections against the official Gemini endpoint without mutating settings', async () => {
    mocks.settingsStore.settings.GEMINI_API_KEY = 'key'
    mocks.settingsStore.settings.GEMINI_MODEL = 'gemini-catalog-model'
    mocks.settingsStore.settings.GEMINI_MODEL_SOURCE = 'catalog'
    mocks.settingsStore.settings.GEMINI_API_URL = 'https://custom.example/v1beta/models/other:generateContent'
    mocks.fetchModels.mockResolvedValue([{ value: 'gemini-catalog-model', name: 'Catalog Model' }])
    const wrapper = mount(GeminiApiSettings)
    await flushPromises()
    await wrapper.findComponent(ApiKeyInput).vm.$emit('test', 'gemini')
    await flushPromises()
    expect(ApiKeyManager.testKeysDirect).toHaveBeenCalledWith('key', 'gemini', {
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      apiModel: 'gemini-catalog-model',
    })
    expect(mocks.settingsStore.settings.GEMINI_API_URL).toBe('https://custom.example/v1beta/models/other:generateContent')
    expect(mocks.settingsStore.settings.GEMINI_MODEL).toBe('gemini-catalog-model')
    expect(mocks.settingsStore.settings.GEMINI_MODEL_SOURCE).toBe('catalog')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('GEMINI_API_URL', expect.anything())
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('GEMINI_MODEL', expect.anything())
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('GEMINI_MODEL_SOURCE', expect.anything())
    wrapper.unmount()
  })

  it.each([
    ['custom selection', 'custom', 'custom', 'https://custom.example/v1beta/models/other:generateContent'],
    ['legacy selection', 'legacy-unknown-model', 'legacy', 'https://custom.example/v1beta/models/other:generateContent'],
    ['curated selection', 'curated-one', 'curated', 'https://generativelanguage.googleapis.com/v1beta/models/curated-one:generateContent'],
  ])('validates %s against the stored URL without mutating settings', async (_, model, source, storedUrl) => {
    mocks.settingsStore.settings.GEMINI_API_KEY = 'key'
    mocks.settingsStore.settings.GEMINI_MODEL = model
    mocks.settingsStore.settings.GEMINI_MODEL_SOURCE = source
    mocks.settingsStore.settings.GEMINI_API_URL = storedUrl
    mocks.fetchModels.mockResolvedValue([])
    const wrapper = mount(GeminiApiSettings)
    await flushPromises()
    await wrapper.findComponent(ApiKeyInput).vm.$emit('test', 'gemini')
    await flushPromises()
    expect(ApiKeyManager.testKeysDirect).toHaveBeenCalledWith('key', 'gemini', {
      apiUrl: storedUrl,
      // Legacy unknown saved models map to the custom option (pre-existing selection behavior).
      apiModel: source === 'legacy' ? 'custom' : model,
    })
    expect(mocks.settingsStore.settings.GEMINI_API_URL).toBe(storedUrl)
    expect(mocks.settingsStore.settings.GEMINI_MODEL).toBe(model)
    expect(mocks.settingsStore.settings.GEMINI_MODEL_SOURCE).toBe(source)
    wrapper.unmount()
  })
})
