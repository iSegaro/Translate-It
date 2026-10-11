import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import OpenAIApiSettings from './OpenAIApiSettings.vue'

const mocks = vi.hoisted(() => ({
  settingsStore: null,
  fetchModels: vi.fn(),
  getCachedModels: vi.fn(() => null),
}))

const translations = {
  openai_catalog_search_label: 'Search OpenAI models',
  openai_catalog_search_placeholder: 'Search by model ID or name',
  openai_catalog_results_label: 'Available OpenAI models',
  openai_catalog_no_matches: 'No models match your search.',
  openai_catalog_compatibility_notice: 'Catalog does not show Chat Completions compatibility; listed models may not all support it.',
  openai_models_missing_key: 'Add an API key to discover available models.',
  openai_models_loading: 'Loading model catalog…',
  openai_models_discovery_failed: 'Could not load OpenAI models.',
  openai_models_empty: 'No models were returned by OpenAI.',
  openai_model_not_listed: 'Saved model was not listed by OpenAI.',
  openai_saved_model_label: 'Saved model',
  openai_catalog_showing_count: ({ shown, total }) => `Showing ${shown} of ${total} matching models`,
}

vi.mock('@/features/settings/stores/settings.js', () => ({ useSettingsStore: () => mocks.settingsStore }))
vi.mock('@/features/translation/providers/OpenAIModelDiscovery.js', () => ({
  fetchOpenAIModels: mocks.fetchModels,
  getCachedOpenAIModels: mocks.getCachedModels,
  MissingOpenAIKeyError: class MissingOpenAIKeyError extends Error {},
}))
vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    OPENAI_API_MODEL: 'curated/model-one',
    OPENAI_MODELS: [
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
vi.mock('@/features/translation/providers/ApiKeyManager.js', () => ({
  ApiKeyManager: {
    parseKeys: value => typeof value === 'string' ? value.split('\n').map(key => key.trim()).filter(Boolean) : [],
    testKeysDirect: vi.fn(),
  },
}))
vi.mock('@/features/translation/providers/ProviderConstants.js', () => ({ ProviderRegistryIds: { OPENAI: 'openai' } }))
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

describe('OpenAIApiSettings model catalog', () => {
  afterEach(() => vi.useRealTimers())

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.settingsStore = {
      settings: reactive({ OPENAI_API_KEY: '', OPENAI_API_MODEL: 'curated/model-one' }),
      updateSettingLocally: vi.fn((key, value) => { mocks.settingsStore.settings[key] = value }),
    }
    mocks.fetchModels.mockReset()
    mocks.getCachedModels.mockReset().mockReturnValue(null)
  })

  it('keeps curated models first and shows a localized missing-key state without requesting', async () => {
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    expect(wrapper.findAll('select')[0].findAll('option').map(option => option.element.value)).toEqual([
      'curated/model-one', 'curated/model-two', 'custom',
    ])
    expect(wrapper.text()).toContain('Add an API key to discover available models.')
    expect(wrapper.text()).toContain('Catalog does not show Chat Completions compatibility; listed models may not all support it.')
    expect(wrapper.text()).not.toContain('Could not load OpenAI models.')
    expect(mocks.fetchModels).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('starts discovery after a key is added and searches IDs and names', async () => {
    mocks.fetchModels.mockResolvedValue([
      { value: 'vendor/claude', name: 'Friendly Sonnet' },
      { value: 'provider/other', name: 'Other Model' },
    ])
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    await wrapper.get('[data-test="api-key"]').setValue('secret-key')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(mocks.fetchModels).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'secret-key', signal: expect.any(AbortSignal) }))
    expect(wrapper.findAll('select')[1].findAll('option').map(option => option.element.value)).toEqual(['vendor/claude', 'provider/other'])
    await wrapper.get('#openai-model-search').setValue('vendor/')
    expect(wrapper.findAll('select')[1].findAll('option').map(option => option.element.value)).toEqual(['vendor/claude'])
    await wrapper.get('#openai-model-search').setValue('friendly sonnet')
    expect(wrapper.findAll('select')[1].findAll('option').map(option => option.element.value)).toEqual(['vendor/claude'])
    wrapper.unmount()
  })

  it('writes catalog selections and derives an empty catalog value after a different curated choice', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.fetchModels.mockResolvedValue([{ value: 'server/model', name: 'Server Model' }])
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    const [curatedSelect, catalogSelect] = wrapper.findAll('select')
    await catalogSelect.setValue('server/model')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('server/model')
    expect(curatedSelect.element.value).toBe('server/model')
    expect(catalogSelect.element.value).toBe('server/model')
    await curatedSelect.setValue('curated/model-two')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('curated/model-two')
    expect(catalogSelect.element.value).toBe('')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_MODELS', expect.anything())
    wrapper.unmount()
  })

  it('keeps custom edits made during discovery and guardedly represents saved catalog models', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'custom/saved-model'
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    await wrapper.get('[placeholder="openai_custom_model_placeholder"]').setValue('custom/edited-model')
    pending.resolve([{ value: 'custom/edited-model', name: 'Edited Model' }])
    await flushPromises()
    expect(wrapper.findAll('select')[0].element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openai_custom_model_placeholder"]').element.value).toBe('custom/edited-model')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('custom/edited-model')
    expect(wrapper.findAll('select')[1].element.value).toBe('custom/edited-model')
    wrapper.unmount()
  })

  it('preserves a missing saved model and shows the localized notice', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'legacy/saved-model'
    mocks.fetchModels.mockResolvedValue([{ value: 'server/model', name: 'Server Model' }])
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    expect(wrapper.text()).toContain('Saved model was not listed by OpenAI.')
    expect(wrapper.findAll('select')[0].findAll('option').map(option => option.element.value)).toContain('legacy/saved-model')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('legacy/saved-model')
    wrapper.unmount()
  })

  it('represents a discovered saved model without changing its stored value', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'server/saved-model'
    mocks.fetchModels.mockResolvedValue([{ value: 'server/saved-model', name: 'Saved Model' }])
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    expect(wrapper.findAll('select')[0].element.value).toBe('server/saved-model')
    expect(wrapper.findAll('select')[1].element.value).toBe('server/saved-model')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('server/saved-model')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_API_MODEL', 'server/saved-model')
    wrapper.unmount()
  })

  it('aborts discovery on unmount and ignores its late result', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    const signal = mocks.fetchModels.mock.calls[0][0].signal
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
    pending.resolve([{ value: 'late/model', name: 'Late Model' }])
    await flushPromises()
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_API_MODEL', 'late/model')
  })

  it('shows localized loading, failure, empty, and rendered-count states', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    const pending = deferred()
    mocks.fetchModels.mockReturnValueOnce(pending.promise)
    const loading = mount(OpenAIApiSettings)
    await nextTick()
    expect(loading.text()).toContain('Loading model catalog…')
    pending.reject(new Error('offline'))
    await flushPromises()
    expect(loading.text()).toContain('Could not load OpenAI models.')
    loading.unmount()

    mocks.fetchModels.mockResolvedValueOnce([])
    const empty = mount(OpenAIApiSettings)
    await flushPromises()
    expect(empty.text()).toContain('No models were returned by OpenAI.')
    empty.unmount()

    mocks.fetchModels.mockResolvedValueOnce(Array.from({ length: 60 }, (_, index) => ({
      value: `model/${index}`, name: `Model ${index}`,
    })))
    const capped = mount(OpenAIApiSettings)
    await flushPromises()
    expect(capped.text()).toContain('Showing 50 of 60 matching models')
    expect(capped.findAll('select')[1].findAll('option')).toHaveLength(50)
    capped.unmount()
  })

  it('searches the full uncapped catalog, including a late model', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.fetchModels.mockResolvedValue(Array.from({ length: 600 }, (_, index) => ({
      value: `model/${index}`, name: `Model ${index}`,
    })))
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    expect(wrapper.findAll('select')[1].findAll('option')).toHaveLength(50)
    await wrapper.get('#openai-model-search').setValue('model/599')
    expect(wrapper.findAll('select')[1].findAll('option').map(option => option.element.value)).toEqual(['model/599'])
    wrapper.unmount()
  })

  it('aborts stale requests after rapid key changes and on unmount', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key-one'
    const first = deferred()
    const second = deferred()
    mocks.fetchModels.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const wrapper = mount(OpenAIApiSettings)
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
    expect(wrapper.findAll('select')[1].text()).toContain('latest/model')
    expect(wrapper.findAll('select')[1].text()).not.toContain('stale/model')
    wrapper.unmount()
    expect(secondSignal.aborted).toBe(true)
  })
})
