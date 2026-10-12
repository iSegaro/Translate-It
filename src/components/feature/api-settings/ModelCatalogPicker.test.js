import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ModelCatalogPicker from './ModelCatalogPicker.vue'

const translations = {
  model_catalog_search_label: 'Search models',
  model_catalog_search_placeholder: 'Search by model name or ID',
  model_catalog_sort_label: 'Sort models',
  model_catalog_sort_api: 'API order',
  model_catalog_sort_name_asc: 'Name (A to Z)',
  model_catalog_sort_name_desc: 'Name (Z to A)',
  model_catalog_sort_input_asc: 'Input price (low to high)',
  model_catalog_sort_input_desc: 'Input price (high to low)',
  model_catalog_sort_output_asc: 'Output price (low to high)',
  model_catalog_sort_output_desc: 'Output price (high to low)',
  model_catalog_results_label: 'Available models',
  model_catalog_showing_count: ({ shown, total }) => `Showing ${shown} of ${total} matching models`,
  // model_catalog_no_matches, model_catalog_free, model_catalog_unavailable,
  // model_catalog_variable, model_catalog_base_rates_note and model_catalog_per_million
  // are intentionally untranslated to exercise the `t(key) || fallback` path.
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key, params) => {
      const value = translations[key]
      if (value === undefined) return undefined
      return typeof value === 'function' ? value(params) : value
    },
  }),
}))

vi.mock('@/composables/ui/useRTLSelect.js', () => ({
  useRTLSelect: () => ({ rtlSelectStyle: { direction: 'rtl' } }),
}))

const mountPicker = (props = {}) => mount(ModelCatalogPicker, {
  props: {
    models: [],
    modelValue: '',
    ...props,
  },
})

const radioValues = (wrapper) => wrapper.findAll('input[type="radio"]').map(radio => radio.element.value)

const selectWrapper = wrapper => wrapper.get('select')

const sortModels = [
  { value: 'm/alpha', name: 'Alpha', pricing: { prompt: 0.000003, completion: 0.000015, variable: false } },
  { value: 'm/beta', name: 'beta', pricing: { prompt: 0.000001, completion: null } },
  { value: 'm/gamma', name: 'Gamma', pricing: null },
  { value: 'm/delta', name: 'Delta', pricing: { prompt: Number.NaN, completion: Infinity } },
  { value: 'm/epsilon', name: 'Epsilon', pricing: { prompt: -1, completion: 0.000002 } },
  { value: 'm/zeta', name: 'Zeta', pricing: { prompt: 0.000001, completion: 0.000015 } },
]

const pricingModels = [
  { value: 'p/free', name: 'Free Model', pricing: { prompt: 0, completion: 0 } },
  { value: 'p/null', name: 'Null Model', pricing: null },
  { value: 'p/invalid', name: 'Invalid Model', pricing: { prompt: Number.NaN, completion: -1 } },
  { value: 'p/tiny', name: 'Tiny Model', pricing: { prompt: 2.5e-9, completion: 1e-9 } },
  { value: 'p/grouped', name: 'Grouped Model', pricing: { prompt: 0.0012345, completion: 0, variable: true } },
]

describe('ModelCatalogPicker search', () => {
  it('matches names and ids case-insensitively without emitting', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: 'm/alpha' })

    await wrapper.get('input[type="search"]').setValue('ALPHA')
    expect(radioValues(wrapper)).toEqual(['m/alpha'])

    await wrapper.get('input[type="search"]').setValue('M/BETA')
    expect(radioValues(wrapper)).toEqual(['m/beta'])

    await wrapper.get('input[type="search"]').setValue('gamma')
    expect(radioValues(wrapper)).toEqual(['m/gamma'])

    await wrapper.get('input[type="search"]').setValue('nothing-matches')
    expect(radioValues(wrapper)).toEqual([])
    expect(wrapper.text()).toContain('No models match your search.')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker sorting', () => {
  const setSort = async (wrapper, key) => {
    await selectWrapper(wrapper).setValue(key)
    await nextTick()
  }

  it('keeps API order by default and sorts names locale-aware in both directions', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })
    expect(radioValues(wrapper)).toEqual(['m/alpha', 'm/beta', 'm/gamma', 'm/delta', 'm/epsilon', 'm/zeta'])

    await setSort(wrapper, 'name_asc')
    // localeCompare orders "beta" before "Delta" (case-insensitive primary level),
    // unlike a naive code-point sort that would put "Delta" first.
    expect(radioValues(wrapper)).toEqual(['m/alpha', 'm/beta', 'm/delta', 'm/epsilon', 'm/gamma', 'm/zeta'])

    await setSort(wrapper, 'name_desc')
    expect(radioValues(wrapper)).toEqual(['m/zeta', 'm/gamma', 'm/epsilon', 'm/delta', 'm/beta', 'm/alpha'])
    wrapper.unmount()
  })

  it('sorts by input price with missing/invalid always last and stable ties in both directions', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })

    await setSort(wrapper, 'input_asc')
    // beta and zeta tie at 0.000001 (API order kept); invalid prompts (missing, NaN, -1)
    // stay last in API order.
    expect(radioValues(wrapper)).toEqual(['m/beta', 'm/zeta', 'm/alpha', 'm/gamma', 'm/delta', 'm/epsilon'])

    await setSort(wrapper, 'input_desc')
    // Ties and invalids keep API order in descending too — invalids never float up.
    expect(radioValues(wrapper)).toEqual(['m/alpha', 'm/beta', 'm/zeta', 'm/gamma', 'm/delta', 'm/epsilon'])
    wrapper.unmount()
  })

  it('sorts by output price with missing/invalid always last and stable ties in both directions', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })

    await setSort(wrapper, 'output_asc')
    // Valid: epsilon 0.000002, then alpha/zeta tie 0.000015 (API order).
    // Invalid: beta, gamma, delta (missing/Infinity → null, API order kept).
    expect(radioValues(wrapper)).toEqual(['m/epsilon', 'm/alpha', 'm/zeta', 'm/beta', 'm/gamma', 'm/delta'])

    await setSort(wrapper, 'output_desc')
    expect(radioValues(wrapper)).toEqual(['m/alpha', 'm/zeta', 'm/epsilon', 'm/beta', 'm/gamma', 'm/delta'])
    wrapper.unmount()
  })

  it('applies search before sort and caps the list at 50 with a localized count', async () => {
    const models = Array.from({ length: 60 }, (_, i) => ({
      value: `m/${String(i).padStart(3, '0')}`,
      name: `Model ${String(i).padStart(3, '0')}`,
      pricing: null,
    }))
    const wrapper = mountPicker({ models, modelValue: 'm/000' })

    expect(radioValues(wrapper)).toHaveLength(50)
    expect(wrapper.text()).toContain('Showing 50 of 60 matching models')

    await wrapper.get('input[type="search"]').setValue('model 05')
    expect(radioValues(wrapper)).toEqual([
      'm/050', 'm/051', 'm/052', 'm/053', 'm/054', 'm/055', 'm/056', 'm/057', 'm/058', 'm/059',
    ])
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker pricing display', () => {
  const optionText = (wrapper, value) => wrapper
    .findAll('.model-catalog-picker__option')
    .find(label => label.get('input[type="radio"]').element.value === value)
    .text()

  it('renders free, unavailable, invalid, tiny and grouped prices with the variable indicator', async () => {
    const wrapper = mountPicker({ models: pricingModels, modelValue: 'p/free', showPricing: true })

    const free = optionText(wrapper, 'p/free')
    expect(free).toContain('Input: Free')
    expect(free).toContain('Output: Free')

    const missing = optionText(wrapper, 'p/null')
    expect(missing).toContain('Input: N/A')
    expect(missing).toContain('Output: N/A')

    const invalid = optionText(wrapper, 'p/invalid')
    expect(invalid).toContain('Input: N/A')
    expect(invalid).toContain('Output: N/A')

    const tiny = optionText(wrapper, 'p/tiny')
    // 2.5e-9/token -> $0.0025 per 1M, 1e-9/token -> $0.001 per 1M — never collapsed to $0.00.
    expect(tiny).toContain('0.0025')
    expect(tiny).toContain('0.001')

    const grouped = optionText(wrapper, 'p/grouped')
    expect(grouped).toContain('1,234.5')
    expect(grouped).toContain('Free')
    expect(grouped).toContain('Variable pricing')

    // Prices and unit stay screen-readable; the base-rate note and unit use fallbacks.
    expect(wrapper.text()).toContain('per 1M tokens')
    expect(wrapper.text()).toContain('Base rates in USD per 1M tokens; pricing may vary and additional fees may apply.')
    expect(optionText(wrapper, 'p/free')).not.toContain('Variable pricing')
    wrapper.unmount()
  })

  it('rejects boolean and whitespace-only prices as unavailable, never Free, and sorts them last', async () => {
    const models = [
      { value: 'v/ok', name: 'Ok Model', pricing: { prompt: 0.000002, completion: 0.000003 } },
      // Booleans must not coerce through Number(false) === 0 (would display Free);
      // whitespace-only strings must not coerce through Number('   ') === 0 either.
      { value: 'v/bool', name: 'Boolean Model', pricing: { prompt: false, completion: true } },
      { value: 'v/space', name: 'Whitespace Model', pricing: { prompt: '   ', completion: '' } },
    ]
    const wrapper = mountPicker({ models, modelValue: 'v/ok', showPricing: true })

    for (const value of ['v/bool', 'v/space']) {
      const text = optionText(wrapper, value)
      expect(text).toContain('Input: N/A')
      expect(text).toContain('Output: N/A')
      expect(text).not.toContain('Free')
    }

    // Invalid values sort last in BOTH directions for both price kinds.
    for (const sortKey of ['input_asc', 'input_desc', 'output_asc', 'output_desc']) {
      await selectWrapper(wrapper).setValue(sortKey)
      expect(radioValues(wrapper)).toEqual(['v/ok', 'v/bool', 'v/space'])
    }
    wrapper.unmount()
  })

  it('hides every price trace and price sort option when showPricing is false', async () => {
    const wrapper = mountPicker({ models: pricingModels, modelValue: 'p/free' })

    const text = wrapper.text()
    // Fixture names contain "Free"/"Invalid", so assert on price-only phrasing.
    expect(text).not.toContain('Input:')
    expect(text).not.toContain('Output:')
    expect(text).not.toContain('N/A')
    expect(text).not.toContain('Variable pricing')
    expect(text).not.toContain('per 1M tokens')
    expect(text).not.toContain('Base rates')

    const options = selectWrapper(wrapper).findAll('option')
    expect(options.map(option => option.element.value)).toEqual(['api', 'name_asc', 'name_desc'])
    wrapper.unmount()
  })

  it('falls back to API order when pricing is hidden while a price sort is active', async () => {
    const wrapper = mountPicker({ models: pricingModels, modelValue: 'p/free', showPricing: true })

    await selectWrapper(wrapper).setValue('input_asc')
    expect(selectWrapper(wrapper).element.value).toBe('input_asc')

    await wrapper.setProps({ showPricing: false })
    await nextTick()
    expect(selectWrapper(wrapper).element.value).toBe('api')
    expect(selectWrapper(wrapper).findAll('option')).toHaveLength(3)
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker selection contract', () => {
  it('emits update:modelValue only on an explicit radio change', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: 'm/alpha' })
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    // Search, sort and prop changes must stay silent.
    await wrapper.get('input[type="search"]').setValue('alpha')
    await selectWrapper(wrapper).setValue('name_desc')
    await wrapper.setProps({ modelValue: 'm/beta' })
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    // An explicit change on an unchecked native radio emits exactly once.
    // (VTU setValue is a no-op when already checked, matching browser behavior.)
    await wrapper.get('input[type="search"]').setValue('')
    await wrapper.setProps({ modelValue: 'm/alpha' })
    await nextTick()
    const target = wrapper.findAll('input[type="radio"]').find(radio => radio.element.value === 'm/beta')
    await target.setValue()
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['m/beta'])
    wrapper.unmount()
  })

  it('keeps the selected id through searching, sorting and model data arrival', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: 'm/zeta' })
    await nextTick()
    expect(wrapper.get('input[value="m/zeta"]').element.checked).toBe(true)

    await wrapper.get('input[type="search"]').setValue('alpha')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.get('input[type="search"]').setValue('')
    await selectWrapper(wrapper).setValue('name_desc')
    await nextTick()
    expect(wrapper.get('input[value="m/zeta"]').element.checked).toBe(true)

    // Data arrival: refreshed/extended catalog must not touch the selection.
    await wrapper.setProps({
      models: [{ value: 'm/new', name: 'Newcomer', pricing: null }, ...sortModels],
      modelValue: 'm/zeta',
    })
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('input[value="m/zeta"]').element.checked).toBe(true)
    wrapper.unmount()
  })

  it('does not mutate the models prop across search and every sort direction', async () => {
    const models = sortModels.map(model => ({
      ...model,
      pricing: model.pricing && { ...model.pricing },
    }))
    const snapshot = models.map(model => ({ ...model, pricing: model.pricing && { ...model.pricing } }))

    const wrapper = mountPicker({ models, modelValue: 'm/alpha', showPricing: true })
    for (const key of ['name_asc', 'name_desc', 'input_asc', 'input_desc', 'output_asc', 'output_desc', 'api']) {
      await selectWrapper(wrapper).setValue(key)
    }
    await wrapper.get('input[type="search"]').setValue('m/')
    await nextTick()

    expect(models).toEqual(snapshot)
    expect(models[0].value).toBe('m/alpha')
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker accessibility structure', () => {
  it('uses a fieldset with legend, one native radio group and associated labels', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: 'm/alpha' })

    const fieldset = wrapper.get('fieldset')
    expect(fieldset.get('legend').text()).toBe('Available models')

    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(sortModels.length)
    const names = new Set(radios.map(radio => radio.element.name))
    expect(names.size).toBe(1)
    expect(radios.every(radio => radio.element.type === 'radio')).toBe(true)
    // Every radio sits inside its label; native Tab/arrow behavior needs no script.
    radios.forEach((radio) => {
      expect(radio.element.closest('label')).not.toBeNull()
    })

    // Model names follow page direction, ids stay LTR.
    const namesSpans = wrapper.findAll('.model-catalog-picker__name')
    const idSpans = wrapper.findAll('.model-catalog-picker__id')
    expect(namesSpans).toHaveLength(sortModels.length)
    expect(idSpans).toHaveLength(sortModels.length)
    namesSpans.forEach(span => expect(span.attributes('dir')).toBe('auto'))
    idSpans.forEach(span => expect(span.attributes('dir')).toBe('ltr'))

    expect(fieldset.get('.model-catalog-picker__list').attributes('role')).toBeUndefined()
    wrapper.unmount()
  })

  it('labels the search field and the sort select', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: 'm/alpha' })

    expect(wrapper.text()).toContain('Search models')
    expect(wrapper.get('input[type="search"]').attributes('placeholder')).toBe('Search by model name or ID')
    expect(wrapper.text()).toContain('Sort models')
    const sortId = selectWrapper(wrapper).attributes('id')
    expect(sortId).toBeTruthy()
    expect(wrapper.get(`label[for="${sortId}"]`).text()).toBe('Sort models')
    wrapper.unmount()
  })

  it('keeps selection state on native radios when the checked model changes via props', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: 'm/alpha' })
    await nextTick()
    expect(wrapper.get('input[value="m/alpha"]').element.checked).toBe(true)

    await wrapper.setProps({ modelValue: 'm/gamma' })
    await nextTick()
    expect(wrapper.get('input[value="m/gamma"]').element.checked).toBe(true)
    expect(wrapper.get('input[value="m/alpha"]').element.checked).toBe(false)
    wrapper.unmount()
  })

  it('keeps catalog count and no-match hints outside live regions', async () => {
    const models = Array.from({ length: 60 }, (_, i) => ({
      value: `m/${String(i).padStart(3, '0')}`,
      name: `Model ${String(i).padStart(3, '0')}`,
      pricing: null,
    }))
    const wrapper = mountPicker({ models, modelValue: 'm/000' })

    // Count hint: visible text, no [role="status"] / [aria-live] ancestor.
    const countHint = wrapper.findAll('.model-catalog-picker__status').find(node => node.text().startsWith('Showing'))
    expect(countHint).toBeDefined()
    expect(countHint.text()).toBe('Showing 50 of 60 matching models')
    expect(countHint.element.closest('[role="status"]')).toBeNull()
    expect(countHint.element.closest('[aria-live]')).toBeNull()

    // No-match hint: same treatment.
    await wrapper.get('input[type="search"]').setValue('no-such-model')
    const noMatchHint = wrapper.get('.model-catalog-picker__status')
    expect(noMatchHint.text()).toBe('No models match your search.')
    expect(noMatchHint.element.closest('[role="status"]')).toBeNull()
    expect(noMatchHint.element.closest('[aria-live]')).toBeNull()

    // And the picker renders no live region at all.
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.find('[aria-live]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('binds the RTL select style onto the sort BaseSelect only', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: 'm/alpha' })
    // Mocked useRTLSelect returns { direction: 'rtl' }; it must reach the rendered <select>.
    expect(selectWrapper(wrapper).attributes('style')).toContain('direction: rtl')
    wrapper.unmount()
  })
})
