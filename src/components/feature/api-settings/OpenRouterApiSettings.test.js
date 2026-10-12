import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import OpenRouterApiSettings from './OpenRouterApiSettings.vue'

const mocks = vi.hoisted(() => ({
  settingsStore: null,
  fetchModels: vi.fn(),
  getCachedModels: vi.fn(() => null),
}))

const translations = {
  openrouter_catalog_search_label: 'Search OpenRouter models',
  openrouter_catalog_search_placeholder: 'Search by model ID or name',
  openrouter_catalog_results_label: 'Available OpenRouter models',
  openrouter_catalog_no_matches: 'No models match your search.',
  openrouter_models_loading: 'Loading model catalog…',
  openrouter_models_discovery_failed: 'Could not load OpenRouter models.',
  openrouter_models_empty: 'No models were returned by OpenRouter.',
  openrouter_model_not_listed: 'Saved model was not listed by OpenRouter.',
  openrouter_saved_model_label: 'Saved model',
  openrouter_catalog_showing_count: ({ shown, total }) => `Showing ${shown} of ${total} matching models`,
}

vi.mock('@/features/settings/stores/settings.js', () => ({ useSettingsStore: () => mocks.settingsStore }))
vi.mock('@/features/translation/providers/OpenRouterModelDiscovery.js', () => ({
  fetchOpenRouterModels: mocks.fetchModels,
  getCachedOpenRouterModels: mocks.getCachedModels,
}))
vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    OPENROUTER_API_MODEL: 'curated/model-one',
    OPENROUTER_MODELS: [
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
vi.mock('@/features/translation/providers/ProviderConstants.js', () => ({ ProviderRegistryIds: { OPENROUTER: 'openrouter' } }))
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
vi.mock('@/components/feature/api-settings/ModelCatalogPicker.vue', () => ({
  default: {
    name: 'ModelCatalogPicker',
    props: ['models', 'modelValue', 'showPricing'],
    emits: ['update:modelValue'],
    template: '<div data-test="model-catalog-picker"><input aria-label="Search models"><select aria-label="Sort models"><option>API order</option><option>Name</option></select><button v-for="model in models" :key="model.value" :data-value="model.value" :aria-checked="model.value === modelValue" @click="$emit(\'update:modelValue\', model.value)">{{ model.name }}</button></div>',
  },
}))

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('OpenRouterApiSettings model catalog', () => {
  afterEach(() => vi.useRealTimers())

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.settingsStore = {
      settings: reactive({ OPENROUTER_API_KEY: 'key-one', OPENROUTER_API_MODEL: 'curated/model-one' }),
      isSettingDirty: vi.fn(() => false),
      updateSettingLocally: vi.fn((key, value) => { mocks.settingsStore.settings[key] = value }),
    }
    mocks.fetchModels.mockReset()
    mocks.getCachedModels.mockReset().mockReturnValue(null)
  })

  it('keeps curated models first and writes a catalog choice only after explicit picker selection', async () => {
    mocks.fetchModels.mockResolvedValue([
      { value: 'vendor/claude', name: 'Friendly Sonnet', pricing: null },
      { value: 'provider/other', name: 'Other Model', pricing: null },
    ])
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    const curatedSelect = wrapper.find('select')
    expect(curatedSelect.findAll('option').map(option => option.element.value)).toEqual([
      'curated/model-one', 'curated/model-two', 'custom',
    ])
    expect(wrapper.get('[data-test="model-catalog-picker"]').text()).toContain('Friendly Sonnet')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENROUTER_API_MODEL', expect.anything())
    await wrapper.get('[aria-label="Search models"]').setValue('something')
    await wrapper.get('[aria-label="Sort models"]').setValue('Name')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENROUTER_API_MODEL', expect.anything())
    await wrapper.get('[data-value="provider/other"]').trigger('click')
    expect(mocks.settingsStore.updateSettingLocally).toHaveBeenCalledWith('OPENROUTER_API_MODEL', 'provider/other')
    expect(mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE).toBe('catalog')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENROUTER_MODELS', expect.anything())
    wrapper.unmount()
  })

  it('derives catalog selection from the effective model across catalog and curated choices', async () => {
    mocks.fetchModels.mockResolvedValue([
      { value: 'server/model', name: 'Server Model', pricing: null },
      { value: 'server/other', name: 'Other Server Model', pricing: null },
    ])
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    const curatedSelect = wrapper.find('select')
    const picker = wrapper.get('[data-test="model-catalog-picker"]')

    await picker.get('[data-value="server/model"]').trigger('click')
    expect(mocks.settingsStore.settings.OPENROUTER_API_MODEL).toBe('server/model')
    expect(mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE).toBe('catalog')
    expect(picker.get('[data-value="server/model"]').attributes('aria-checked')).toBe('true')
    expect(curatedSelect.element.value).toBe('server/model')

    await curatedSelect.setValue('curated/model-two')
    expect(mocks.settingsStore.settings.OPENROUTER_API_MODEL).toBe('curated/model-two')
    expect(mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE).toBe('curated')
    expect(curatedSelect.element.value).toBe('curated/model-two')
    expect(picker.get('[data-value="server/model"]').attributes('aria-checked')).toBe('false')
    wrapper.unmount()
  })

  it('clears catalog selection in Custom mode while custom editing still updates the saved model', async () => {
    mocks.fetchModels.mockResolvedValue([{ value: 'server/model', name: 'Server Model', pricing: null }])
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    const curatedSelect = wrapper.find('select')
    await curatedSelect.setValue('custom')
    expect(mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE).toBe('custom')
    expect(wrapper.get('[data-value="server/model"]').attributes('aria-checked')).toBe('false')
    await wrapper.get('[placeholder="openrouter_custom_model_placeholder"]').setValue('custom/model-id')
    expect(mocks.settingsStore.settings.OPENROUTER_API_MODEL).toBe('custom/model-id')
    expect(mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE).toBe('custom')
    expect(wrapper.get('[data-value="server/model"]').attributes('aria-checked')).toBe('false')
    wrapper.unmount()
  })

  it('preserves saved selection and provenance when a new catalog replaces the current one', async () => {
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'server/saved-model'
    mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE = 'catalog'
    mocks.fetchModels.mockResolvedValueOnce([
      { value: 'server/saved-model', name: 'Saved Catalog Model', pricing: null },
      { value: 'server/another-model', name: 'Another Catalog Model', pricing: null },
    ]).mockResolvedValueOnce([
      { value: 'server/new-model', name: 'New Catalog Model', pricing: null },
    ])
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    expect(wrapper.get('[data-value="server/saved-model"]').attributes('aria-checked')).toBe('true')
    await wrapper.get('[data-test="api-key"]').setValue('key-two')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(mocks.fetchModels).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-test="model-catalog-picker"]').text()).toContain('New Catalog Model')
    expect(wrapper.find('[data-value="server/saved-model"]').exists()).toBe(false)
    expect(mocks.settingsStore.settings.OPENROUTER_API_MODEL).toBe('server/saved-model')
    expect(mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE).toBe('catalog')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENROUTER_API_MODEL', expect.anything())
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENROUTER_MODEL_SOURCE', expect.anything())
    wrapper.unmount()
  })

  it('preserves a saved non-catalog model and custom model editing', async () => {
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'legacy/provider-model'
    mocks.fetchModels.mockResolvedValue([{ value: 'new/model', name: 'New Model', pricing: null }])
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    expect(wrapper.text()).toContain('Saved model was not listed by OpenRouter.')
    expect(wrapper.findAll('select')[0].element.value).toBe('custom')
    expect(wrapper.findAll('select')[0].findAll('option').map(option => option.element.value)).toEqual([
      'curated/model-one', 'curated/model-two', 'legacy/provider-model', 'custom',
    ])
    expect(wrapper.get('[placeholder="openrouter_custom_model_placeholder"]').element.value).toBe('legacy/provider-model')
    wrapper.unmount()
  })

  it.each([
    ['curated model advertised', 'curated/model-one', ['curated/model-one'], false],
    ['curated model missing from server', 'curated/model-one', ['server/model'], true],
    ['arbitrary custom model missing from server', 'custom/provider-model', ['server/model'], true],
    ['saved model found in catalog', 'server/model', ['server/model'], false],
  ])('shows saved-model notice when appropriate: %s', async (_label, savedModel, catalog, noticeExpected) => {
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = savedModel
    mocks.fetchModels.mockResolvedValue(catalog.map(value => ({ value, name: value, pricing: null })))
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    expect(wrapper.text().includes('Saved model was not listed by OpenRouter.')).toBe(noticeExpected)
    expect(mocks.settingsStore.settings.OPENROUTER_API_MODEL).toBe(savedModel)
    wrapper.unmount()
  })

  it('uses the per-key in-memory cache on mount', async () => {
    mocks.getCachedModels.mockReturnValue([{ value: 'cached/model', name: 'Cached Model', pricing: null }])
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    expect(mocks.fetchModels).not.toHaveBeenCalled()
    expect(wrapper.get('[data-test="model-catalog-picker"]').text()).toContain('Cached Model')
    wrapper.unmount()
  })

  it('keeps custom edits made during discovery and never auto-replaces the model', async () => {
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'my-custom-model'
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    await wrapper.get('[placeholder="openrouter_custom_model_placeholder"]').setValue('vendor/custom-in-catalog')
    pending.resolve([{ value: 'vendor/custom-in-catalog', name: 'Listed Model', pricing: null }])
    await flushPromises()
    expect(wrapper.find('select').element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openrouter_custom_model_placeholder"]').element.value).toBe('vendor/custom-in-catalog')
    expect(mocks.settingsStore.settings.OPENROUTER_API_MODEL).toBe('vendor/custom-in-catalog')
    wrapper.unmount()
  })

  it('shows localized loading, failure, and empty states while rendering discovered results', async () => {
    const pending = deferred()
    mocks.fetchModels.mockReturnValueOnce(pending.promise)
    const loading = mount(OpenRouterApiSettings)
    await nextTick()
    expect(loading.text()).toContain('Loading model catalog…')
    pending.reject(new Error('offline'))
    await flushPromises()
    expect(loading.text()).toContain('Could not load OpenRouter models.')
    loading.unmount()

    mocks.fetchModels.mockResolvedValueOnce([])
    const empty = mount(OpenRouterApiSettings)
    await flushPromises()
    expect(empty.text()).toContain('No models were returned by OpenRouter.')
    empty.unmount()

    mocks.fetchModels.mockResolvedValueOnce(Array.from({ length: 60 }, (_, index) => ({
      value: `model/${index}`, name: `Model ${index}`, pricing: null,
    })))
    const capped = mount(OpenRouterApiSettings)
    await flushPromises()
    expect(capped.get('[data-test="model-catalog-picker"]').findAll('button')).toHaveLength(60)
    capped.unmount()
  })

  it('does not write a model when a response adds a catalog entry', async () => {
    mocks.fetchModels.mockResolvedValue(Array.from({ length: 600 }, (_, index) => ({
      value: `model/${index}`, name: `Model ${index}`, pricing: null,
    })))
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    expect(wrapper.get('[data-test="model-catalog-picker"]').findAll('button')).toHaveLength(600)
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENROUTER_API_MODEL', expect.anything())
    wrapper.unmount()
  })

  it('debounces key changes, ignores stale responses, and aborts in-flight discovery on change and unmount', async () => {
    const first = deferred()
    const second = deferred()
    mocks.fetchModels.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    const firstSignal = mocks.fetchModels.mock.calls[0][0].signal
    await wrapper.get('[data-test="api-key"]').setValue('key-two')
    await flushPromises()
    expect(firstSignal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(400)
    expect(mocks.fetchModels).toHaveBeenCalledTimes(2)
    const secondSignal = mocks.fetchModels.mock.calls[1][0].signal
    second.resolve([{ value: 'new/key-two-model', name: 'Latest', pricing: null }])
    await flushPromises()
    first.resolve([{ value: 'stale/key-one-model', name: 'Stale', pricing: null }])
    await flushPromises()
    expect(wrapper.get('[data-test="model-catalog-picker"]').text()).toContain('Latest')
    expect(wrapper.get('[data-test="model-catalog-picker"]').text()).not.toContain('Stale')
    wrapper.unmount()
    expect(secondSignal.aborted).toBe(true)
  })

  it('aborts pending discovery on unmount and ignores its late result', async () => {
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    const signal = mocks.fetchModels.mock.calls[0][0].signal
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
    pending.resolve([{ value: 'late/model', name: 'Late Model', pricing: null }])
    await flushPromises()
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENROUTER_API_MODEL', 'late/model')
  })

  it('announces catalog loading, failure, empty, and saved-model warnings to screen readers', async () => {
    const liveStatusFor = (target, text) => {
      const status = target.findAll('[role="status"]').find(node => node.text().includes(text))
      expect(status, `expected a live status announcing "${text}"`).toBeTruthy()
      expect(status.attributes('aria-live')).toBe('polite')
      expect(status.attributes('aria-atomic')).toBe('true')
    }

    const pending = deferred()
    mocks.fetchModels.mockReturnValueOnce(pending.promise)
    const wrapper = mount(OpenRouterApiSettings)
    await nextTick()
    liveStatusFor(wrapper, 'Loading model catalog…')
    pending.reject(new Error('offline'))
    await flushPromises()
    liveStatusFor(wrapper, 'Could not load OpenRouter models.')
    wrapper.unmount()

    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'legacy/missing-model'
    mocks.fetchModels.mockResolvedValueOnce([])
    const empty = mount(OpenRouterApiSettings)
    await flushPromises()
    liveStatusFor(empty, 'No models were returned by OpenRouter.')
    liveStatusFor(empty, 'Saved model was not listed by OpenRouter.')
    empty.unmount()
  })

  it('keeps the catalog live region mounted while its text moves through loading, failure, empty, and settled states', async () => {
    const pending = deferred()
    mocks.fetchModels.mockReturnValueOnce(pending.promise)
    const wrapper = mount(OpenRouterApiSettings)
    const catalogRegion = () => wrapper.findAll('[role="status"]')[1]
    expect(catalogRegion().text()).toBe('')
    expect(catalogRegion().classes()).toContain('ti-sr-only')
    const regionElement = catalogRegion().element

    await nextTick()
    expect(catalogRegion().element).toBe(regionElement)
    expect(catalogRegion().text()).toBe('Loading model catalog…')
    expect(catalogRegion().classes()).not.toContain('ti-sr-only')

    pending.reject(new Error('offline'))
    await flushPromises()
    expect(catalogRegion().element).toBe(regionElement)
    expect(catalogRegion().text()).toBe('Could not load OpenRouter models.')

    mocks.fetchModels.mockResolvedValueOnce([])
    await wrapper.get('[data-test="api-key"]').setValue('key-two')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(catalogRegion().element).toBe(regionElement)
    expect(catalogRegion().text()).toBe('No models were returned by OpenRouter.')

    mocks.fetchModels.mockResolvedValueOnce([{ value: 'server/model', name: 'Server Model', pricing: null }])
    await wrapper.get('[data-test="api-key"]').setValue('key-three')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(catalogRegion().element).toBe(regionElement)
    expect(catalogRegion().text()).toBe('')
    expect(catalogRegion().classes()).toContain('ti-sr-only')
    wrapper.unmount()
  })

  it('keeps the saved-model warning live region mounted until the warning clears', async () => {
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'legacy/missing-model'
    mocks.fetchModels.mockResolvedValue([{ value: 'server/model', name: 'Server Model', pricing: null }])
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    const warningRegion = () => wrapper.findAll('[role="status"]')[0]
    expect(warningRegion().text()).toBe('Saved model was not listed by OpenRouter.')
    expect(warningRegion().classes()).not.toContain('ti-sr-only')
    const regionElement = warningRegion().element

    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'server/model'
    await nextTick()
    expect(warningRegion().element).toBe(regionElement)
    expect(warningRegion().text()).toBe('')
    expect(warningRegion().classes()).toContain('ti-sr-only')
    wrapper.unmount()
  })

  it('preserves saved catalog/custom provenance when reselecting the saved model after failed discovery', async () => {
    mocks.fetchModels.mockRejectedValue(new Error('offline'))
    for (const [model, source] of [['google/gemini-2.5-flash', 'catalog'], ['my-manual-model', 'custom']]) {
      mocks.settingsStore.settings.OPENROUTER_API_MODEL = model
      mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE = source
      const wrapper = mount(OpenRouterApiSettings)
      await flushPromises()
      expect(wrapper.text()).toContain('Could not load OpenRouter models.')
      await wrapper.get('.model-select').setValue(model)
      expect(mocks.settingsStore.settings.OPENROUTER_API_MODEL).toBe(model)
      // This pair matches the migration-safe catalog/custom cases: no silent remap.
      expect(mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE).toBe(source)
      wrapper.unmount()
    }

    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'legacy/unknown-model'
    mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE = 'legacy'
    const legacy = mount(OpenRouterApiSettings)
    await flushPromises()
    await legacy.get('.model-select').setValue('legacy/unknown-model')
    expect(mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE).toBe('legacy')
    legacy.unmount()
  })

  it('does not carry saved provenance onto a different unknown model ID', async () => {
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'google/gemini-2.5-flash'
    mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE = 'catalog'
    mocks.fetchModels.mockRejectedValue(new Error('offline'))
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    // No unlisted option exists, so the select coerces to ''; provenance must not carry over.
    await wrapper.get('.model-select').setValue('unlisted-model-id')
    expect(mocks.settingsStore.settings.OPENROUTER_API_MODEL).toBe('')
    expect(mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE).toBe('legacy')
    wrapper.unmount()
  })

  it('reconciles external models read-only and keeps Custom input drafts selected', async () => {
    mocks.fetchModels.mockResolvedValue([])
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'curated/model-two'
    await nextTick()
    expect(wrapper.get('.model-select').element.value).toBe('curated/model-two')
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'custom'
    await nextTick()
    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openrouter_custom_model_placeholder"]').exists()).toBe(true)
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'external/unknown'
    await nextTick()
    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openrouter_custom_model_placeholder"]').element.value).toBe('external/unknown')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENROUTER_API_MODEL', expect.anything())
    await wrapper.get('[placeholder="openrouter_custom_model_placeholder"]').setValue('local-draft')
    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(mocks.settingsStore.settings.OPENROUTER_API_MODEL).toBe('local-draft')
    wrapper.unmount()
  })

  it('does not let a late discovery result replace a newer external selection', async () => {
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'curated/model-two'
    await nextTick()
    pending.resolve([{ value: 'curated/model-one', name: 'Old Model', pricing: null }])
    await flushPromises()
    expect(wrapper.get('.model-select').element.value).toBe('curated/model-two')
    wrapper.unmount()
  })

  it('selects the current external catalog model when deferred discovery advertises it', async () => {
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = 'external/catalog-model'
    mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE = 'catalog'
    await nextTick()
    pending.resolve([{ value: 'external/catalog-model', name: 'External Model', pricing: null }])
    await flushPromises()
    expect(wrapper.get('.model-select').element.value).toBe('external/catalog-model')
    expect(mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE).toBe('catalog')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENROUTER_API_MODEL', 'external/catalog-model')
    wrapper.unmount()
  })

  it.each(['fetched', 'cached'])('keeps an explicitly Custom saved model selected when it appears in the %s catalog', async (path) => {
    const model = 'vendor/custom-model'
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = model
    mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE = 'custom'
    if (path === 'cached') {
      mocks.getCachedModels.mockReturnValue([{ value: model, name: 'Same ID', pricing: null }])
    } else {
      mocks.fetchModels.mockResolvedValue([{ value: model, name: 'Same ID', pricing: null }])
    }

    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()

    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openrouter_custom_model_placeholder"]').element.value).toBe(model)
    expect(mocks.settingsStore.settings.OPENROUTER_API_MODEL).toBe(model)
    expect(mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE).toBe('custom')
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENROUTER_API_MODEL', model)
    expect(mocks.settingsStore.updateSettingLocally).not.toHaveBeenCalledWith('OPENROUTER_MODEL_SOURCE', 'catalog')
    wrapper.unmount()
  })

  it('keeps a dirty Custom draft selected when discovery returns the same ID', async () => {
    const model = 'vendor/custom-draft'
    mocks.settingsStore.settings.OPENROUTER_API_MODEL = model
    mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE = 'custom'
    mocks.settingsStore.isSettingDirty.mockReturnValue(true)
    const pending = deferred()
    mocks.fetchModels.mockReturnValue(pending.promise)
    const wrapper = mount(OpenRouterApiSettings)
    await flushPromises()
    pending.resolve([{ value: model, name: 'Catalog Match', pricing: null }])
    await flushPromises()
    expect(wrapper.get('.model-select').element.value).toBe('custom')
    expect(wrapper.get('[placeholder="openrouter_custom_model_placeholder"]').element.value).toBe(model)
    expect(mocks.settingsStore.settings.OPENROUTER_MODEL_SOURCE).toBe('custom')
    wrapper.unmount()
  })
})
