import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import RequestyApiSettings from './RequestyApiSettings.vue'

const mocks = vi.hoisted(() => ({
  settingsStore: null,
  fetchModels: vi.fn(),
  getCachedModels: vi.fn(() => null),
}))

const translations = {
  requesty_catalog_search_label: 'Search Requesty models',
  requesty_catalog_search_placeholder: 'Search by model ID or name',
  requesty_catalog_results_label: 'Available Requesty models',
  requesty_catalog_no_matches: 'No models match your search.',
  requesty_models_loading: 'Loading model catalog…',
  requesty_models_discovery_failed: 'Could not load Requesty models.',
  requesty_models_empty: 'No models were returned by Requesty.',
  requesty_model_not_listed: 'Saved model was not listed by Requesty.',
  requesty_saved_model_label: 'Saved model',
  requesty_catalog_showing_count: ({ shown, total }) => `Showing ${shown} of ${total} matching models`,
}

vi.mock('@/features/settings/stores/settings.js', () => ({ useSettingsStore: () => mocks.settingsStore }))
vi.mock('@/features/translation/providers/RequestyModelDiscovery.js', () => ({
  fetchRequestyModels: mocks.fetchModels,
  getCachedRequestyModels: mocks.getCachedModels,
}))
vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    REQUESTY_API_MODEL: 'curated/model-one',
    REQUESTY_MODELS: [
      { value: 'curated/model-one', name: 'Curated One' },
      { value: 'curated/model-two', name: 'Curated Two' },
      { value: 'custom', name: 'Custom Model' },
    ],
  },
}))
vi.mock('@/composables/ui/useRTLSelect.js', () => ({ useRTLSelect: () => ({ rtlSelectStyle: {} }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({
  t: (key, params) => typeof translations[key] === 'function'
    ? translations[key](params)
    : translations[key] || key,
}) }))
vi.mock('@/features/translation/providers/ApiKeyManager.js', () => ({ ApiKeyManager: { testKeysDirect: vi.fn() } }))
vi.mock('@/features/translation/providers/ProviderConstants.js', () => ({ ProviderRegistryIds: { REQUESTY: 'requesty' } }))
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
  default: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
  },
}))

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('RequestyApiSettings model catalog', () => {
  afterEach(() => vi.useRealTimers())

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.settingsStore = {
      settings: reactive({ REQUESTY_API_KEY: 'key-one', REQUESTY_API_MODEL: 'curated/model-one' }),
      updateSettingLocally: vi.fn((key, value) => { mocks.settingsStore.settings[key] = value }),
    }
    mocks.fetchModels.mockReset()
    mocks.getCachedModels.mockReset().mockReturnValue(null)
  })

  it('preserves curated order and searches the full catalog by ID and name', async () => {
    mocks.fetchModels.mockResolvedValue([
      { value: 'vendor/claude', name: 'Friendly Sonnet' },
      { value: 'provider/other', name: 'Other Model' },
    ])
    const wrapper = mount(RequestyApiSettings)
    await flushPromises()
    const selects = wrapper.findAll('select')
    expect(selects[0].findAll('option').map(option => option.element.value)).toEqual([
      'curated/model-one', 'curated/model-two', 'custom',
    ])
    expect(selects[1].findAll('option').map(option => option.element.value)).toEqual(['vendor/claude', 'provider/other'])
    await wrapper.get('#requesty-model-search').setValue('vendor/')
    expect(wrapper.findAll('select')[1].findAll('option').map(option => option.element.value)).toEqual(['vendor/claude'])
    await wrapper.get('#requesty-model-search').setValue('friendly sonnet')
    expect(wrapper.findAll('select')[1].findAll('option').map(option => option.element.value)).toEqual(['vendor/claude'])
    wrapper.unmount()
  })

  it('writes a selected catalog model, then clears the catalog value when a curated model is selected', async () => {
    mocks.fetchModels.mockResolvedValue([
      { value: 'server/model', name: 'Server Model' },
      { value: 'server/other', name: 'Other Server Model' },
    ])
    const wrapper = mount(RequestyApiSettings)
    await flushPromises()
    const [curatedSelect, catalogSelect] = wrapper.findAll('select')
    await catalogSelect.setValue('server/model')
    expect(mocks.settingsStore.settings.REQUESTY_API_MODEL).toBe('server/model')
    expect(curatedSelect.element.value).toBe('server/model')
    expect(catalogSelect.element.value).toBe('server/model')
    await curatedSelect.setValue('curated/model-two')
    expect(mocks.settingsStore.settings.REQUESTY_API_MODEL).toBe('curated/model-two')
    expect(catalogSelect.element.value).toBe('')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('REQUESTY_MODELS', expect.anything())
    wrapper.unmount()
  })

  it('derives a saved model selection from the filtered catalog and preserves saved models missing from it', async () => {
    mocks.settingsStore.settings.REQUESTY_API_MODEL = 'server/saved-model'
    mocks.fetchModels.mockResolvedValue([
      { value: 'server/saved-model', name: 'Saved Server Model' },
      { value: 'server/another-model', name: 'Another Server Model' },
    ])
    const wrapper = mount(RequestyApiSettings)
    await flushPromises()
    expect(wrapper.findAll('select')[0].element.value).toBe('server/saved-model')
    const catalogSelect = wrapper.findAll('select')[1]
    expect(catalogSelect.element.value).toBe('server/saved-model')
    await wrapper.get('#requesty-model-search').setValue('another-model')
    expect(catalogSelect.element.value).toBe('')
    expect(mocks.settingsStore.settings.REQUESTY_API_MODEL).toBe('server/saved-model')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('REQUESTY_API_MODEL', 'server/saved-model')
    wrapper.unmount()

    mocks.settingsStore.settings.REQUESTY_API_MODEL = 'legacy/provider-model'
    mocks.fetchModels.mockResolvedValue([{ value: 'server/model', name: 'Server Model' }])
    const legacy = mount(RequestyApiSettings)
    await flushPromises()
    expect(legacy.text()).toContain('Saved model was not listed by Requesty.')
    expect(legacy.findAll('select')[0].findAll('option').map(option => option.element.value)).toContain('legacy/provider-model')
    expect(mocks.settingsStore.settings.REQUESTY_API_MODEL).toBe('legacy/provider-model')
    legacy.unmount()
  })

  it('clears catalog selection for Custom and preserves custom edits made while discovery is pending', async () => {
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(RequestyApiSettings)
    await flushPromises()
    const curatedSelect = wrapper.findAll('select')[0]
    await curatedSelect.setValue('custom')
    await wrapper.get('[placeholder="requesty_custom_model_placeholder"]').setValue('custom/model-entered')
    expect(mocks.settingsStore.settings.REQUESTY_API_MODEL).toBe('custom/model-entered')
    pending.resolve([{ value: 'server/model', name: 'Server Model' }])
    await flushPromises()
    expect(curatedSelect.element.value).toBe('custom')
    expect(wrapper.get('[placeholder="requesty_custom_model_placeholder"]').element.value).toBe('custom/model-entered')
    expect(wrapper.findAll('select')[1].element.value).toBe('')
    wrapper.unmount()
  })

  it('synchronizes saved catalog models without writing the setting and honors user interaction during discovery', async () => {
    mocks.settingsStore.settings.REQUESTY_API_MODEL = 'server/model'
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(RequestyApiSettings)
    await flushPromises()
    await wrapper.findAll('select')[0].setValue('custom')
    pending.resolve([{ value: 'server/model', name: 'Server Model' }])
    await flushPromises()
    expect(wrapper.findAll('select')[0].element.value).toBe('custom')
    expect(mocks.settingsStore.settings.REQUESTY_API_MODEL).toBe('server/model')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('REQUESTY_API_MODEL', 'server/model')
    wrapper.unmount()
  })

  it('uses cached models and shows localized loading, failure, empty, and 50-result states', async () => {
    mocks.getCachedModels.mockReturnValue([{ value: 'cached/model', name: 'Cached Model' }])
    const cached = mount(RequestyApiSettings)
    await flushPromises()
    expect(mocks.fetchModels).not.toHaveBeenCalled()
    expect(cached.findAll('select')[1].text()).toContain('Cached Model')
    cached.unmount()

    mocks.getCachedModels.mockReturnValue(null)
    const pending = deferred()
    mocks.fetchModels.mockReturnValueOnce(pending.promise)
    const loading = mount(RequestyApiSettings)
    await nextTick()
    expect(loading.text()).toContain('Loading model catalog…')
    pending.reject(new Error('offline'))
    await flushPromises()
    expect(loading.text()).toContain('Could not load Requesty models.')
    loading.unmount()

    mocks.fetchModels.mockResolvedValueOnce([])
    const empty = mount(RequestyApiSettings)
    await flushPromises()
    expect(empty.text()).toContain('No models were returned by Requesty.')
    empty.unmount()

    mocks.fetchModels.mockResolvedValueOnce(Array.from({ length: 60 }, (_, index) => ({
      value: `model/${index}`, name: `Model ${index}`,
    })))
    const capped = mount(RequestyApiSettings)
    await flushPromises()
    expect(capped.text()).toContain('Showing 50 of 60 matching models')
    expect(capped.findAll('select')[1].findAll('option')).toHaveLength(50)
    capped.unmount()
  })

  it('searches the full 600-model catalog including its final entry', async () => {
    mocks.fetchModels.mockResolvedValue(Array.from({ length: 600 }, (_, index) => ({
      value: `model/${index}`, name: `Model ${index}`,
    })))
    const wrapper = mount(RequestyApiSettings)
    await flushPromises()
    expect(wrapper.findAll('select')[1].findAll('option')).toHaveLength(50)
    await wrapper.get('#requesty-model-search').setValue('model/599')
    expect(wrapper.findAll('select')[1].findAll('option').map(option => option.element.value)).toEqual(['model/599'])
    wrapper.unmount()
  })

  it('debounces rapid credential changes, ignores stale responses, and aborts on unmount', async () => {
    const first = deferred()
    const second = deferred()
    mocks.fetchModels.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const wrapper = mount(RequestyApiSettings)
    await flushPromises()
    const firstSignal = mocks.fetchModels.mock.calls[0][0].signal
    await wrapper.get('[data-test="api-key"]').setValue('key-two')
    await wrapper.get('[data-test="api-key"]').setValue('key-three')
    await flushPromises()
    expect(firstSignal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(400)
    expect(mocks.fetchModels).toHaveBeenCalledTimes(2)
    expect(mocks.fetchModels.mock.calls[1][0].apiKey).toBe('key-three')
    const secondSignal = mocks.fetchModels.mock.calls[1][0].signal
    second.resolve([{ value: 'latest/model', name: 'Latest Model' }])
    await flushPromises()
    first.resolve([{ value: 'stale/model', name: 'Stale Model' }])
    await flushPromises()
    expect(wrapper.findAll('select')[1].text()).toContain('Latest Model')
    expect(wrapper.findAll('select')[1].text()).not.toContain('Stale Model')
    wrapper.unmount()
    expect(secondSignal.aborted).toBe(true)
  })
})
