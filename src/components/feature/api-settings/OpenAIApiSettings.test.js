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
    props: ['id', 'label', 'modelValue', 'placeholder', 'type', 'dir'],
    emits: ['update:modelValue'],
    template: '<div><label v-if="label" :for="id">{{ label }}</label><input :id="id" :type="type || \'text\'" :dir="dir" :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></div>',
  },
}))
vi.mock('@/components/base/BaseSelect.vue', () => ({
  default: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    template: '<select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
  },
}))
vi.mock('@/components/feature/api-settings/ModelCatalogPicker.vue', () => ({
  default: {
    name: 'ModelCatalogPicker',
    props: { models: Array, modelValue: String, showPricing: { type: Boolean, default: false } },
    emits: ['update:modelValue'],
    template: '<div data-test="model-catalog-picker"><button data-test="open-picker">Open</button><input aria-label="Search models"><select aria-label="Sort models"><option>API order</option><option>Name</option></select><button data-test="close-picker">Close</button><button v-for="model in models" :key="model.value" :data-value="model.value" :aria-checked="model.value === modelValue" @click="$emit(\'update:modelValue\', model.value)">{{ model.name }}</button></div>',
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
      isSettingDirty: vi.fn(() => false),
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

  it('starts discovery after a key is added and keeps picker browsing non-mutating', async () => {
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
    expect(wrapper.get('[data-test="model-catalog-picker"]').text()).toContain('Friendly Sonnet')
    expect(wrapper.getComponent({ name: 'ModelCatalogPicker' }).props('showPricing')).toBe(false)
    await wrapper.get('[data-test="open-picker"]').trigger('click')
    await wrapper.get('[aria-label="Search models"]').setValue('vendor/')
    await wrapper.get('[aria-label="Sort models"]').setValue('Name')
    await wrapper.get('[data-test="close-picker"]').trigger('click')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_API_MODEL', expect.anything())
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_MODEL_SOURCE', expect.anything())
    wrapper.unmount()
  })

  it('writes catalog selections and derives an empty catalog value after a different curated choice', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.fetchModels.mockResolvedValue([{ value: 'server/model', name: 'Server Model' }])
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    const curatedSelect = wrapper.find('.model-select')
    const picker = wrapper.get('[data-test="model-catalog-picker"]')
    await picker.get('[data-value="server/model"]').trigger('click')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('server/model')
    expect(mocks.settingsStore.settings.OPENAI_MODEL_SOURCE).toBe('catalog')
    expect(curatedSelect.element.value).toBe('server/model')
    expect(picker.get('[data-value="server/model"]').attributes('aria-checked')).toBe('true')
    await curatedSelect.setValue('curated/model-two')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('curated/model-two')
    expect(mocks.settingsStore.settings.OPENAI_MODEL_SOURCE).toBe('curated')
    expect(picker.get('[data-value="server/model"]').attributes('aria-checked')).toBe('false')
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
    expect(wrapper.get('[data-value="custom/edited-model"]').attributes('aria-checked')).toBe('true')
    wrapper.unmount()
  })

  it('preserves Custom selected during the key debounce and still syncs a pre-schedule saved model', async () => {
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(OpenAIApiSettings)
    await wrapper.get('[data-test="api-key"]').setValue('secret-key')
    await wrapper.findAll('select')[0].setValue('custom')
    expect(mocks.settingsStore.settings.OPENAI_MODEL_SOURCE).toBe('custom')
    await vi.advanceTimersByTimeAsync(400)
    pending.resolve([{ value: 'curated/model-one', name: 'Curated One' }])
    await flushPromises()
    expect(wrapper.findAll('select')[0].element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openai_custom_model_placeholder"]').exists()).toBe(true)
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('curated/model-one')
    wrapper.unmount()

    mocks.settingsStore.settings.OPENAI_API_KEY = 'secret-key'
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'server/saved-model'
    mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'legacy'
    const saved = deferred()
    mocks.fetchModels.mockReturnValueOnce(saved.promise)
    const savedWrapper = mount(OpenAIApiSettings)
    await flushPromises()
    saved.resolve([{ value: 'server/saved-model', name: 'Saved Model' }])
    await flushPromises()
    expect(savedWrapper.find('.model-select').element.value).toBe('server/saved-model')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('server/saved-model')
    savedWrapper.unmount()
  })

  it('preserves a missing saved model and shows the localized notice', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'legacy/saved-model'
    mocks.fetchModels.mockResolvedValue([{ value: 'server/model', name: 'Server Model' }])
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    expect(wrapper.text()).toContain('Saved model was not listed by OpenAI.')
    expect(wrapper.findAll('select')[0].findAll('option').map(option => option.element.value)).toContain('legacy/saved-model')
    expect(wrapper.getComponent({ name: 'ModelCatalogPicker' }).props('modelValue')).toBe('legacy/saved-model')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('legacy/saved-model')
    wrapper.unmount()
  })

  it('preserves a saved catalog model and source when a key refresh replaces the catalog', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key-one'
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'server/saved-model'
    mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'catalog'
    mocks.fetchModels.mockResolvedValueOnce([{ value: 'server/saved-model', name: 'Saved Model' }])
      .mockResolvedValueOnce([{ value: 'server/new-model', name: 'New Model' }])
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    await wrapper.get('[data-test="api-key"]').setValue('key-two')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(wrapper.get('[data-test="model-catalog-picker"]').text()).toContain('New Model')
    expect(wrapper.find('[data-value="server/saved-model"]').exists()).toBe(false)
    expect(wrapper.getComponent({ name: 'ModelCatalogPicker' }).props('modelValue')).toBe('server/saved-model')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('server/saved-model')
    expect(mocks.settingsStore.settings.OPENAI_MODEL_SOURCE).toBe('catalog')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_API_MODEL', expect.anything())
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_MODEL_SOURCE', expect.anything())
    wrapper.unmount()
  })

  it('represents a discovered saved model without changing its stored value', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'server/saved-model'
    mocks.fetchModels.mockResolvedValue([{ value: 'server/saved-model', name: 'Saved Model' }])
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    expect(wrapper.find('.model-select').element.value).toBe('server/saved-model')
    expect(wrapper.get('[data-value="server/saved-model"]').attributes('aria-checked')).toBe('true')
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

  it('shows localized loading, failure, and empty states and renders the full catalog', async () => {
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
    expect(capped.get('[data-test="model-catalog-picker"]').findAll('button[data-value]').length).toBe(60)
    capped.unmount()
  })

  it('does not write a model when discovery provides a catalog entry', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.fetchModels.mockResolvedValue(Array.from({ length: 600 }, (_, index) => ({
      value: `model/${index}`, name: `Model ${index}`,
    })))
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    expect(wrapper.get('[data-test="model-catalog-picker"]').findAll('button[data-value]')).toHaveLength(600)
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_API_MODEL', expect.anything())
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
    expect(wrapper.get('[data-test="model-catalog-picker"]').text()).toContain('Latest Model')
    expect(wrapper.get('[data-test="model-catalog-picker"]').text()).not.toContain('Stale Model')
    wrapper.unmount()
    expect(secondSignal.aborted).toBe(true)
  })

  it('announces missing-key, loading, failure, empty, and saved-model warnings to screen readers', async () => {
    const liveStatusFor = (target, text) => {
      const status = target.findAll('[role="status"]').find(node => node.text().includes(text))
      expect(status, `expected a live status announcing "${text}"`).toBeTruthy()
      expect(status.attributes('aria-live')).toBe('polite')
      expect(status.attributes('aria-atomic')).toBe('true')
    }

    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    liveStatusFor(wrapper, 'Add an API key to discover available models.')
    expect(wrapper.text()).not.toContain('Loading model catalog…')

    const pending = deferred()
    mocks.fetchModels.mockReturnValueOnce(pending.promise)
    await wrapper.get('[data-test="api-key"]').setValue('secret-key')
    await nextTick()
    liveStatusFor(wrapper, 'Loading model catalog…')
    await vi.advanceTimersByTimeAsync(400)
    pending.reject(new Error('offline'))
    await flushPromises()
    liveStatusFor(wrapper, 'Could not load OpenAI models.')
    wrapper.unmount()

    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'legacy/missing-model'
    mocks.fetchModels.mockResolvedValueOnce([])
    const empty = mount(OpenAIApiSettings)
    await flushPromises()
    liveStatusFor(empty, 'No models were returned by OpenAI.')
    liveStatusFor(empty, 'Saved model was not listed by OpenAI.')
    empty.unmount()
  })

  it('keeps picker and compatibility information outside discovery live regions', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.fetchModels.mockResolvedValue(Array.from({ length: 60 }, (_, index) => ({
      value: `model/${index}`, name: `Model ${index}`,
    })))
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    const compatibilityWarning = wrapper.findAll('.model-discovery-status').find(node => node.text().includes('Chat Completions compatibility'))
    expect(compatibilityWarning).toBeTruthy()
    expect(compatibilityWarning.element.closest('[role="status"], [aria-live]')).toBeNull()
    const picker = wrapper.get('[data-test="model-catalog-picker"]')
    expect(picker.element.closest('[role="status"], [aria-live]')).toBeNull()
    wrapper.unmount()
  })

  it('keeps the catalog live region mounted from missing key through failure, empty, and settled states', async () => {
    const wrapper = mount(OpenAIApiSettings)
    const catalogRegion = () => wrapper.findAll('[role="status"]')[1]
    expect(catalogRegion().text()).toBe('Add an API key to discover available models.')
    expect(catalogRegion().classes()).not.toContain('ti-sr-only')
    const regionElement = catalogRegion().element

    const pending = deferred()
    mocks.fetchModels.mockReturnValueOnce(pending.promise)
    await wrapper.get('[data-test="api-key"]').setValue('secret-key')
    await nextTick()
    expect(catalogRegion().element).toBe(regionElement)
    expect(catalogRegion().text()).toBe('Loading model catalog…')

    await vi.advanceTimersByTimeAsync(400)
    pending.reject(new Error('offline'))
    await flushPromises()
    expect(catalogRegion().element).toBe(regionElement)
    expect(catalogRegion().text()).toBe('Could not load OpenAI models.')

    mocks.fetchModels.mockResolvedValueOnce([])
    await wrapper.get('[data-test="api-key"]').setValue('key-two')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(catalogRegion().element).toBe(regionElement)
    expect(catalogRegion().text()).toBe('No models were returned by OpenAI.')

    mocks.fetchModels.mockResolvedValueOnce([{ value: 'server/model', name: 'Server Model' }])
    await wrapper.get('[data-test="api-key"]').setValue('key-three')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(catalogRegion().element).toBe(regionElement)
    expect(catalogRegion().text()).toBe('')
    expect(catalogRegion().classes()).toContain('ti-sr-only')
    wrapper.unmount()
  })

  it('keeps the saved-model warning live region mounted until the warning clears', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'legacy/missing-model'
    mocks.fetchModels.mockResolvedValue([{ value: 'server/model', name: 'Server Model' }])
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    const warningRegion = () => wrapper.findAll('[role="status"]')[0]
    expect(warningRegion().text()).toBe('Saved model was not listed by OpenAI.')
    expect(warningRegion().classes()).not.toContain('ti-sr-only')
    const regionElement = warningRegion().element

    mocks.settingsStore.settings.OPENAI_API_MODEL = 'server/model'
    await nextTick()
    expect(warningRegion().element).toBe(regionElement)
    expect(warningRegion().text()).toBe('')
    expect(warningRegion().classes()).toContain('ti-sr-only')
    wrapper.unmount()
  })

  it('preserves saved catalog/custom provenance when reselecting the saved model after failed discovery', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.fetchModels.mockRejectedValue(new Error('offline'))
    for (const [model, source] of [['gpt-4o-mini', 'catalog'], ['my-manual-model', 'custom']]) {
      mocks.settingsStore.settings.OPENAI_API_MODEL = model
      mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = source
      const wrapper = mount(OpenAIApiSettings)
      await flushPromises()
      expect(wrapper.text()).toContain('Could not load OpenAI models.')
      await wrapper.get('.model-select').setValue(model)
      expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe(model)
      // This pair matches the migration-safe catalog/custom cases: no silent remap.
      expect(mocks.settingsStore.settings.OPENAI_MODEL_SOURCE).toBe(source)
      wrapper.unmount()
    }

    mocks.settingsStore.settings.OPENAI_API_MODEL = 'legacy/unknown-model'
    mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'legacy'
    const legacy = mount(OpenAIApiSettings)
    await flushPromises()
    await legacy.get('.model-select').setValue('legacy/unknown-model')
    expect(mocks.settingsStore.settings.OPENAI_MODEL_SOURCE).toBe('legacy')
    legacy.unmount()
  })

  it('does not carry saved provenance onto a different unknown model ID', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'gpt-4o-mini'
    mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'catalog'
    mocks.fetchModels.mockRejectedValue(new Error('offline'))
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    // No unlisted option exists, so the select coerces to ''; provenance must not carry over.
    await wrapper.get('.model-select').setValue('unlisted-model-id')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('')
    expect(mocks.settingsStore.settings.OPENAI_MODEL_SOURCE).toBe('legacy')
    wrapper.unmount()
  })

  it('reconciles external models read-only and preserves a local Custom draft', async () => {
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'curated/model-two'
    await nextTick()
    expect(wrapper.get('.model-select').element.value).toBe('curated/model-two')
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'custom'
    await nextTick()
    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openai_custom_model_placeholder"]').exists()).toBe(true)
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'external/unknown'
    await nextTick()
    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openai_custom_model_placeholder"]').element.value).toBe('external/unknown')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_API_MODEL', expect.anything())
    await wrapper.get('[placeholder="openai_custom_model_placeholder"]').setValue('my-draft')
    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('my-draft')
    expect(mocks.settingsStore.settings.OPENAI_MODEL_SOURCE).toBe('custom')
    wrapper.unmount()
  })

  it('uses external source-only changes to distinguish a catalog ID from Custom without writing', async () => {
    const model = 'vendor/listed-model'
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.settingsStore.settings.OPENAI_API_MODEL = model
    mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'catalog'
    mocks.fetchModels.mockResolvedValue([{ value: model, name: 'Listed Model' }])
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    expect(wrapper.get('.model-select').element.value).toBe(model)

    mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'custom'
    await nextTick()
    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openai_custom_model_placeholder"]').element.value).toBe(model)

    mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'catalog'
    await nextTick()
    expect(wrapper.get('.model-select').element.value).toBe(model)
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_API_MODEL', expect.anything())
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_MODEL_SOURCE', expect.anything())
    wrapper.unmount()
  })

  it.each(['model-first', 'source-first'])('keeps an externally selected catalog-listed ID Custom when source arrives %s', async (order) => {
    const model = 'vendor/listed-model'
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'catalog'
    mocks.fetchModels.mockResolvedValue([{ value: model, name: 'Listed Model' }])
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()

    if (order === 'model-first') {
      mocks.settingsStore.settings.OPENAI_API_MODEL = model
      await nextTick()
      mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'custom'
    } else {
      mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'custom'
      await nextTick()
      mocks.settingsStore.settings.OPENAI_API_MODEL = model
    }
    await nextTick()

    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openai_custom_model_placeholder"]').element.value).toBe(model)
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_API_MODEL', expect.anything())
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_MODEL_SOURCE', expect.anything())
    wrapper.unmount()
  })

  it('does not promote a current external Custom model when deferred discovery later lists it', async () => {
    const model = 'vendor/external-custom'
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    mocks.settingsStore.settings.OPENAI_API_MODEL = model
    mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'custom'
    await nextTick()
    pending.resolve([{ value: model, name: 'Catalog Match' }])
    await flushPromises()

    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openai_custom_model_placeholder"]').element.value).toBe(model)
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_API_MODEL', expect.anything())
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_MODEL_SOURCE', expect.anything())
    wrapper.unmount()
  })

  it('does not let a late discovery result replace a newer external selection', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'curated/model-two'
    await nextTick()
    pending.resolve([{ value: 'curated/model-one', name: 'Old Model' }])
    await flushPromises()
    expect(wrapper.get('.model-select').element.value).toBe('curated/model-two')
    wrapper.unmount()
  })

  it('selects the current external catalog model when deferred discovery advertises it', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'external/catalog-model'
    mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'catalog'
    await nextTick()
    pending.resolve([{ value: 'external/catalog-model', name: 'External Model' }])
    await flushPromises()
    expect(wrapper.get('.model-select').element.value).toBe('external/catalog-model')
    expect(mocks.settingsStore.settings.OPENAI_MODEL_SOURCE).toBe('catalog')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENAI_API_MODEL', 'external/catalog-model')
    wrapper.unmount()
  })

  it('keeps a dirty Custom draft selected when discovery returns the same ID', async () => {
    mocks.settingsStore.settings.OPENAI_API_KEY = 'key'
    mocks.settingsStore.settings.OPENAI_API_MODEL = 'draft/custom-model'
    mocks.settingsStore.settings.OPENAI_MODEL_SOURCE = 'custom'
    mocks.settingsStore.isSettingDirty.mockReturnValue(true)
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(OpenAIApiSettings)
    await flushPromises()
    pending.resolve([{ value: 'draft/custom-model', name: 'Catalog Match' }])
    await flushPromises()
    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openai_custom_model_placeholder"]').element.value).toBe('draft/custom-model')
    expect(mocks.settingsStore.settings.OPENAI_MODEL_SOURCE).toBe('custom')
    wrapper.unmount()
  })

  it('associates the main Model label with its native select and keeps selection working', async () => {
    const wrapper = mount(OpenAIApiSettings)
    const select = wrapper.get('#openai-model-select')
    const label = wrapper.get('label[for="openai-model-select"]')
    expect(label.element.control).toBe(select.element)
    await select.setValue('curated/model-two')
    expect(select.element.value).toBe('curated/model-two')
    const ids = wrapper.findAll('[id]').map(element => element.attributes('id'))
    expect(ids).toHaveLength(new Set(ids).size)
    wrapper.unmount()
  })
})
