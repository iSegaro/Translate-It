import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as sass from 'sass'
import ModelCatalogPicker from './ModelCatalogPicker.vue'

// Compiled once for the cascade tests below (the component SCSS uses the `@/`
// alias, so it needs a small importer; same sass usage as the repo's
// LiveDubbingControlScss.test.js convention).
const compiledPickerCss = sass.compile(
  resolve(process.cwd(), 'src/components/feature/api-settings/ModelCatalogPicker.scss'),
  {
    importers: [{
      findFileUrl(url) {
        if (!url.startsWith('@/')) return null
        return pathToFileURL(resolve(process.cwd(), 'src', url.slice(2)))
      },
    }],
  },
).css

const translations = {
  model_catalog_search_label: 'Search models',
  model_catalog_search_placeholder: 'Search by model name or ID',
  model_catalog_results_label: 'Available models',
  model_catalog_showing_count: ({ shown, total }) => `Showing ${shown} of ${total} matching models`,
  // model_catalog_browse, model_catalog_column_model, model_catalog_no_matches,
  // model_catalog_free, model_catalog_unavailable, model_catalog_variable,
  // model_catalog_input_price, model_catalog_output_price,
  // model_catalog_base_rates_note and model_catalog_per_million are
  // intentionally untranslated: the mock echoes the key for them (exactly
  // like real vue-i18n), so the component's key-echo fallback branch runs.
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key, params) => {
      const value = translations[key]
      // Real vue-i18n echoes the key when a message is missing.
      if (value === undefined) return key
      return typeof value === 'function' ? value(params) : value
    },
  }),
}))

const mountPicker = (props = {}, options = {}) => mount(ModelCatalogPicker, {
  props: {
    models: [],
    modelValue: '',
    ...props,
  },
  attachTo: document.body,
  ...options,
})

const openPicker = async (props = {}, options = {}) => {
  const wrapper = mountPicker(props, options)
  await wrapper.get('.model-catalog-picker__trigger').trigger('click')
  await nextTick()
  return wrapper
}

const radioValues = wrapper => wrapper.findAll('input[type="radio"]').map(radio => radio.element.value)
const searchField = wrapper => wrapper.get('input[type="search"]')
const headerCells = wrapper => wrapper.findAll('[role="columnheader"]')
const sortButtons = wrapper => wrapper.get('.model-catalog-picker__header').findAll('button')
// Header order with showPricing: 0 = Model, 1 = Input, 2 = Output.
const clickHeader = async (wrapper, index) => {
  await sortButtons(wrapper)[index].trigger('click')
  await nextTick()
}
const rowText = (wrapper, value) => wrapper
  .findAll('.model-catalog-picker__row')
  .find(row => row.get('input[type="radio"]').element.value === value)
  .text()
  .replace(/\s+/g, ' ')

const sortModels = [
  { value: 'm/alpha', name: 'Alpha', pricing: { prompt: 0.000003, completion: 0.000015, variable: false } },
  { value: 'm/beta', name: 'beta', pricing: { prompt: 0.000001, completion: null } },
  { value: 'm/gamma', name: 'Gamma', pricing: null },
  { value: 'm/delta', name: 'Delta', pricing: { prompt: Number.NaN, completion: Infinity } },
  { value: 'm/epsilon', name: 'Epsilon', pricing: { prompt: -1, completion: 0.000002 } },
  { value: 'm/zeta', name: 'Zeta', pricing: { prompt: 0.000001, completion: 0.000015 } },
]
const apiOrder = ['m/alpha', 'm/beta', 'm/gamma', 'm/delta', 'm/epsilon', 'm/zeta']

const pricingModels = [
  { value: 'p/free', name: 'Free Model', pricing: { prompt: 0, completion: 0 } },
  { value: 'p/null', name: 'Null Model', pricing: null },
  { value: 'p/invalid', name: 'Invalid Model', pricing: { prompt: Number.NaN, completion: -1 } },
  { value: 'p/tiny', name: 'Tiny Model', pricing: { prompt: 2.5e-9, completion: 1e-9 } },
  { value: 'p/grouped', name: 'Grouped Model', pricing: { prompt: 0.0012345, completion: 0, variable: true } },
]

describe('ModelCatalogPicker open and close', () => {
  it('shows Browse models when nothing is selected and toggles the panel without emitting', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: '' })
    const trigger = wrapper.get('.model-catalog-picker__trigger')
    expect(trigger.text()).toContain('Browse models')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)

    await trigger.trigger('click')
    await nextTick()
    const panel = wrapper.get('.model-catalog-picker__panel')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(panel.attributes('id')).toBe(trigger.attributes('aria-controls'))
    // Focus lands on the search field for immediate typing.
    expect(document.activeElement).toBe(searchField(wrapper).element)

    await trigger.trigger('click')
    await nextTick()
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)
    // Open and close are pure view state — never a selection write.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows the selected model name and id on the trigger, falling back to the raw id', async () => {
    const listed = mountPicker({ models: sortModels, modelValue: 'm/zeta' })
    const listedTrigger = listed.get('.model-catalog-picker__trigger')
    expect(listedTrigger.text()).toContain('Zeta')
    expect(listedTrigger.text()).toContain('m/zeta')
    listed.unmount()

    const unlisted = mountPicker({ models: sortModels, modelValue: 'not/listed' })
    expect(unlisted.get('.model-catalog-picker__trigger').text()).toContain('not/listed')
    unlisted.unmount()
  })

  it('uses a native button trigger, so Enter and Space activate it without custom key handling', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: 'm/alpha' })
    const trigger = wrapper.get('.model-catalog-picker__trigger')
    expect(trigger.element.tagName).toBe('BUTTON')
    expect(trigger.element.getAttribute('type')).toBe('button')
    // Per the test-utils forms guide, buttons are exercised with click().
    await trigger.trigger('click')
    await nextTick()
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    expect(document.activeElement).toBe(searchField(wrapper).element)

    await wrapper.get('.model-catalog-picker__panel').trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.model-catalog-picker__trigger').element)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('closes on an outside click without emitting', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker search', () => {
  it('matches names and ids case-insensitively without emitting', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })

    await searchField(wrapper).setValue('ALPHA')
    expect(radioValues(wrapper)).toEqual(['m/alpha'])

    await searchField(wrapper).setValue('M/BETA')
    expect(radioValues(wrapper)).toEqual(['m/beta'])

    await searchField(wrapper).setValue('gamma')
    expect(radioValues(wrapper)).toEqual(['m/gamma'])

    await searchField(wrapper).setValue('nothing-matches')
    expect(radioValues(wrapper)).toEqual([])
    expect(wrapper.text()).toContain('No models match your search.')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('clears the search when the panel closes so each open starts fresh', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    await searchField(wrapper).setValue('alpha')
    expect(radioValues(wrapper)).toEqual(['m/alpha'])

    await wrapper.get('.model-catalog-picker__trigger').trigger('click')
    await nextTick()
    await wrapper.get('.model-catalog-picker__trigger').trigger('click')
    await nextTick()
    expect(radioValues(wrapper)).toEqual(apiOrder)
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker header sorting', () => {
  it('cycles the Model header asc, desc, then back to API order, reflecting it in aria-sort', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })
    const modelHeader = () => headerCells(wrapper)[0]
    expect(modelHeader().attributes('aria-sort')).toBe('none')
    expect(radioValues(wrapper)).toEqual(apiOrder)

    // localeCompare orders "beta" before "Delta" (case-insensitive primary level),
    // unlike a naive code-point sort that would put "Delta" first.
    await clickHeader(wrapper, 0)
    expect(modelHeader().attributes('aria-sort')).toBe('ascending')
    expect(radioValues(wrapper)).toEqual(['m/alpha', 'm/beta', 'm/delta', 'm/epsilon', 'm/gamma', 'm/zeta'])

    await clickHeader(wrapper, 0)
    expect(modelHeader().attributes('aria-sort')).toBe('descending')
    expect(radioValues(wrapper)).toEqual(['m/zeta', 'm/gamma', 'm/epsilon', 'm/delta', 'm/beta', 'm/alpha'])

    // Third click on the active header resets to API order.
    await clickHeader(wrapper, 0)
    expect(modelHeader().attributes('aria-sort')).toBe('none')
    expect(radioValues(wrapper)).toEqual(apiOrder)
    wrapper.unmount()
  })

  it('sorts by input price with missing/invalid always last and stable ties in both directions', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })

    await clickHeader(wrapper, 1)
    expect(headerCells(wrapper)[1].attributes('aria-sort')).toBe('ascending')
    // beta and zeta tie at 0.000001 (API order kept); invalid prompts (missing, NaN, -1)
    // stay last in API order.
    expect(radioValues(wrapper)).toEqual(['m/beta', 'm/zeta', 'm/alpha', 'm/gamma', 'm/delta', 'm/epsilon'])

    await clickHeader(wrapper, 1)
    expect(headerCells(wrapper)[1].attributes('aria-sort')).toBe('descending')
    // Ties and invalids keep API order in descending too — invalids never float up.
    expect(radioValues(wrapper)).toEqual(['m/alpha', 'm/beta', 'm/zeta', 'm/gamma', 'm/delta', 'm/epsilon'])
    wrapper.unmount()
  })

  it('sorts by output price with missing/invalid always last and stable ties in both directions', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })

    await clickHeader(wrapper, 2)
    expect(headerCells(wrapper)[2].attributes('aria-sort')).toBe('ascending')
    // Valid: epsilon 0.000002, then alpha/zeta tie 0.000015 (API order).
    // Invalid: beta, gamma, delta (missing/Infinity → null, API order kept).
    expect(radioValues(wrapper)).toEqual(['m/epsilon', 'm/alpha', 'm/zeta', 'm/beta', 'm/gamma', 'm/delta'])

    await clickHeader(wrapper, 2)
    expect(headerCells(wrapper)[2].attributes('aria-sort')).toBe('descending')
    expect(radioValues(wrapper)).toEqual(['m/alpha', 'm/zeta', 'm/epsilon', 'm/beta', 'm/gamma', 'm/delta'])
    wrapper.unmount()
  })

  it('applies search before sort and caps the results at 50 with a localized count', async () => {
    const models = Array.from({ length: 60 }, (_, i) => ({
      value: `m/${String(i).padStart(3, '0')}`,
      name: `Model ${String(i).padStart(3, '0')}`,
      pricing: null,
    }))
    const wrapper = await openPicker({ models, modelValue: 'm/000' })

    expect(radioValues(wrapper)).toHaveLength(50)
    expect(wrapper.text()).toContain('Showing 50 of 60 matching models')

    await searchField(wrapper).setValue('model 05')
    expect(radioValues(wrapper)).toEqual([
      'm/050', 'm/051', 'm/052', 'm/053', 'm/054', 'm/055', 'm/056', 'm/057', 'm/058', 'm/059',
    ])
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker pricing display', () => {
  it('renders free, unavailable, invalid, tiny and grouped prices with the variable indicator', async () => {
    const wrapper = await openPicker({ models: pricingModels, modelValue: 'p/free', showPricing: true })

    expect(rowText(wrapper, 'p/free')).toContain('Input: Free')
    expect(rowText(wrapper, 'p/free')).toContain('Output: Free')

    expect(rowText(wrapper, 'p/null')).toContain('Input: N/A')
    expect(rowText(wrapper, 'p/null')).toContain('Output: N/A')

    expect(rowText(wrapper, 'p/invalid')).toContain('Input: N/A')
    expect(rowText(wrapper, 'p/invalid')).toContain('Output: N/A')

    const tiny = rowText(wrapper, 'p/tiny')
    // 2.5e-9/token -> $0.0025 per 1M, 1e-9/token -> $0.001 per 1M — never collapsed to $0.00.
    expect(tiny).toContain('0.0025')
    expect(tiny).toContain('0.001')

    const grouped = rowText(wrapper, 'p/grouped')
    expect(grouped).toContain('1,234.5')
    expect(grouped).toContain('Free')
    expect(grouped).toContain('Variable pricing')

    // Unit context lives in the column headers; the note carries the full caveat.
    expect(wrapper.text()).toContain('/ 1M tokens')
    expect(wrapper.text()).toContain('Base rates in USD per 1M tokens; pricing may vary and additional fees may apply.')
    expect(rowText(wrapper, 'p/free')).not.toContain('Variable pricing')
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
    const wrapper = await openPicker({ models, modelValue: 'v/ok', showPricing: true })

    for (const value of ['v/bool', 'v/space']) {
      const text = rowText(wrapper, value)
      expect(text).toContain('Input: N/A')
      expect(text).toContain('Output: N/A')
      expect(text).not.toContain('Free')
    }

    // Invalid values sort last in BOTH directions for both price columns.
    for (const [header, clicks] of [[1, 2], [2, 2]]) {
      for (let i = 0; i < clicks; i++) {
        await clickHeader(wrapper, header)
        expect(radioValues(wrapper)).toEqual(['v/ok', 'v/bool', 'v/space'])
      }
    }
    wrapper.unmount()
  })

  it('hides every price trace and both price columns when showPricing is false', async () => {
    const wrapper = await openPicker({ models: pricingModels, modelValue: 'p/free' })

    expect(headerCells(wrapper)).toHaveLength(1)
    const text = wrapper.text()
    // Fixture names contain "Free"/"Invalid", so assert on price-only phrasing.
    expect(text).not.toContain('Input:')
    expect(text).not.toContain('Output:')
    expect(text).not.toContain('N/A')
    expect(text).not.toContain('Variable pricing')
    expect(text).not.toContain('/ 1M tokens')
    expect(text).not.toContain('Base rates')
    wrapper.unmount()
  })

  it('falls back to API order when pricing is hidden while a price sort is active', async () => {
    const wrapper = await openPicker({ models: pricingModels, modelValue: 'p/free', showPricing: true })

    await clickHeader(wrapper, 1)
    expect(headerCells(wrapper)[1].attributes('aria-sort')).toBe('ascending')

    await wrapper.setProps({ showPricing: false })
    await nextTick()
    expect(headerCells(wrapper)).toHaveLength(1)
    expect(headerCells(wrapper)[0].attributes('aria-sort')).toBe('none')
    expect(radioValues(wrapper)).toEqual(['p/free', 'p/null', 'p/invalid', 'p/tiny', 'p/grouped'])
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker selection contract', () => {
  it('emits once and closes on explicit selection, but never on open/close/filter/prop refresh', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })

    // Search, sorting and prop refreshes must stay silent.
    await searchField(wrapper).setValue('alpha')
    await clickHeader(wrapper, 0)
    await wrapper.setProps({ modelValue: 'm/alpha' })
    await wrapper.setProps({ models: [...sortModels] })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await searchField(wrapper).setValue('')
    await nextTick()
    const target = wrapper.findAll('input[type="radio"]').find(radio => radio.element.value === 'm/beta')
    await target.setValue()
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['m/beta'])
    // Selecting closes the panel and hands focus back to the trigger.
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.model-catalog-picker__trigger').element)
    wrapper.unmount()
  })

  it('keeps the selected id through searching, sorting and model data arrival', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/zeta' })
    expect(wrapper.get('input[value="m/zeta"]').element.checked).toBe(true)

    await searchField(wrapper).setValue('alpha')
    expect(radioValues(wrapper)).toEqual(['m/alpha'])
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await searchField(wrapper).setValue('')
    await clickHeader(wrapper, 0)
    await clickHeader(wrapper, 0)
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

  it('does not mutate the models prop across search and every header sort', async () => {
    const models = sortModels.map(model => ({
      ...model,
      pricing: model.pricing && { ...model.pricing },
    }))
    const snapshot = models.map(model => ({ ...model, pricing: model.pricing && { ...model.pricing } }))

    const wrapper = await openPicker({ models, modelValue: 'm/alpha', showPricing: true })
    for (const header of [0, 0, 0, 1, 1, 1, 2, 2, 2]) {
      await clickHeader(wrapper, header)
    }
    await searchField(wrapper).setValue('m/')
    await nextTick()

    expect(models).toEqual(snapshot)
    expect(models[0].value).toBe('m/alpha')
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker structure', () => {
  it('uses one native radio group with labels, an accessible table label, and sortable column headers', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })

    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(sortModels.length)
    expect(new Set(radios.map(radio => radio.element.name)).size).toBe(1)
    // Every radio sits inside its label; native Tab/arrow behavior needs no script.
    radios.forEach((radio) => {
      expect(radio.element.closest('label')).not.toBeNull()
    })

    // The former <caption> role is carried by the grid's aria-label.
    expect(wrapper.get('[role="table"]').attributes('aria-label')).toBe('Available models')
    const headers = headerCells(wrapper)
    expect(headers).toHaveLength(3)
    headers.forEach((header) => {
      expect(header.attributes('role')).toBe('columnheader')
      expect(header.attributes('aria-sort')).toBeTruthy()
    })

    const trigger = wrapper.get('.model-catalog-picker__trigger')
    expect(wrapper.get('.model-catalog-picker__panel').attributes('id')).toBe(trigger.attributes('aria-controls'))
    wrapper.unmount()
  })

  it('keeps names dir=auto and ids dir=ltr in trigger and rows, with no select remaining', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })

    const trigger = wrapper.get('.model-catalog-picker__trigger')
    expect(trigger.find('.model-catalog-picker__trigger-name').attributes('dir')).toBe('auto')
    expect(trigger.find('.model-catalog-picker__trigger-id').attributes('dir')).toBe('ltr')

    wrapper.findAll('.model-catalog-picker__name').forEach(span => expect(span.attributes('dir')).toBe('auto'))
    wrapper.findAll('.model-catalog-picker__id').forEach(span => expect(span.attributes('dir')).toBe('ltr'))

    // The sort select is gone; column headers replaced it, so no select needs RTL styling.
    expect(wrapper.findAll('select')).toHaveLength(0)
    wrapper.unmount()
  })

  it('keeps selection state on native radios when the checked model changes via props', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    expect(wrapper.get('input[value="m/alpha"]').element.checked).toBe(true)

    await wrapper.setProps({ modelValue: 'm/gamma' })
    await nextTick()
    expect(wrapper.get('input[value="m/gamma"]').element.checked).toBe(true)
    expect(wrapper.get('input[value="m/alpha"]').element.checked).toBe(false)
    wrapper.unmount()
  })

  it('keeps visible count and no-match hints outside the live region and renders one announcer', async () => {
    const models = Array.from({ length: 60 }, (_, i) => ({
      value: `m/${String(i).padStart(3, '0')}`,
      name: `Model ${String(i).padStart(3, '0')}`,
      pricing: null,
    }))
    const wrapper = await openPicker({ models, modelValue: 'm/000' })

    // Count hint: visible text, no [role="status"] / [aria-live] ancestor.
    const countHint = wrapper.findAll('.model-catalog-picker__status').find(node => node.text().startsWith('Showing'))
    expect(countHint).toBeDefined()
    expect(countHint.text()).toBe('Showing 50 of 60 matching models')
    expect(countHint.element.closest('[role="status"]')).toBeNull()
    expect(countHint.element.closest('[aria-live]')).toBeNull()

    // No-match hint: same treatment.
    await searchField(wrapper).setValue('no-such-model')
    const noMatchHint = wrapper.get('.model-catalog-picker__status')
    expect(noMatchHint.text()).toBe('No models match your search.')
    expect(noMatchHint.element.closest('[role="status"]')).toBeNull()
    expect(noMatchHint.element.closest('[aria-live]')).toBeNull()

    // The picker renders exactly ONE live region: the persistent announcer
    // (its text is asserted under fake timers in the announcements suite).
    const regions = wrapper.findAll('[role="status"]')
    expect(regions).toHaveLength(1)
    expect(regions[0].attributes('aria-live')).toBe('polite')
    expect(regions[0].attributes('aria-atomic')).toBe('true')
    expect(regions[0].classes()).toContain('ti-sr-only')
    expect(regions[0].element.contains(noMatchHint.element)).toBe(false)
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker shared header (narrow-screen sorting)', () => {
  it('keeps Model/Input/Output sorting reachable through the header row both layouts share', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })
    const header = wrapper.get('.model-catalog-picker__header')
    expect(header.attributes('role')).toBe('row')
    // The header sits outside the results scroll wrapper, so narrow screens
    // that stack row cells still expose these same controls (the media query
    // only compresses this markup; jsdom cannot evaluate media queries).
    expect(wrapper.get('.model-catalog-picker__results').find('.model-catalog-picker__header').exists()).toBe(false)

    const buttons = header.findAll('button')
    expect(buttons).toHaveLength(3)
    // Price headers render two explicit lines in order: label, then the unit
    // (both exercised through the `t(key) || fallback` path).
    const headerLines = buttons.map(button => button
      .findAll('.model-catalog-picker__header-text > span')
      .map(span => span.text()))
    expect(headerLines).toEqual([
      ['Model'],
      ['Input', '/ 1M tokens'],
      ['Output', '/ 1M tokens'],
    ])

    // The three-state cycle backing both layouts: asc -> desc -> API order.
    await clickHeader(wrapper, 1)
    expect(headerCells(wrapper)[1].attributes('aria-sort')).toBe('ascending')
    await clickHeader(wrapper, 1)
    expect(headerCells(wrapper)[1].attributes('aria-sort')).toBe('descending')
    await clickHeader(wrapper, 1)
    expect(headerCells(wrapper)[1].attributes('aria-sort')).toBe('none')
    expect(radioValues(wrapper)).toEqual(apiOrder)

    // showPricing=false keeps name-sort only.
    await wrapper.setProps({ showPricing: false })
    await nextTick()
    expect(header.findAll('button')).toHaveLength(1)
    expect(headerCells(wrapper)).toHaveLength(1)
    await clickHeader(wrapper, 0)
    expect(headerCells(wrapper)[0].attributes('aria-sort')).toBe('ascending')
    expect(radioValues(wrapper)).toEqual(['m/alpha', 'm/beta', 'm/delta', 'm/epsilon', 'm/gamma', 'm/zeta'])
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker results-only scroll', () => {
  it('scrolls only the results wrapper, keeping search, header, note and count outside it', async () => {
    const models = Array.from({ length: 60 }, (_, i) => ({
      value: `m/${String(i).padStart(3, '0')}`,
      name: `Model ${String(i).padStart(3, '0')}`,
      pricing: null,
    }))
    const wrapper = await openPicker({ models, modelValue: 'm/000', showPricing: true })
    const panel = wrapper.get('.model-catalog-picker__panel')
    const results = wrapper.get('.model-catalog-picker__results')
    expect(results.element).not.toBe(panel.element)
    // The pure positioning math is wired onto the panel as inline style.
    expect(panel.attributes('style')).toContain('width')

    // Rows scroll inside the results wrapper (still capped at 50)...
    expect(results.findAll('.model-catalog-picker__row')).toHaveLength(50)
    // ...while search and the sortable header stay outside it (fixed)...
    expect(results.element.contains(searchField(wrapper).element)).toBe(false)
    expect(results.find('.model-catalog-picker__header').exists()).toBe(false)
    expect(panel.find('.model-catalog-picker__header').exists()).toBe(true)
    // ...and the note and count stay readable outside the scroll area,
    // so there is exactly one scrollable region (no nested-scroll traps).
    expect(results.find('.model-catalog-picker__note').exists()).toBe(false)
    expect(panel.find('.model-catalog-picker__note').exists()).toBe(true)
    expect(results.find('.model-catalog-picker__status').exists()).toBe(false)
    expect(panel.find('.model-catalog-picker__status').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps search, sort headers and results reachable at constrained heights', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })
    const panel = wrapper.get('.model-catalog-picker__panel')
    // One fixed flex column: search first (never shrinks), then the grid
    // holding header + scrolling results, then the note/count (which yield
    // last in tight viewports).
    const grid = panel.get('.model-catalog-picker__grid')
    expect(panel.find('.model-catalog-picker__search').exists()).toBe(true)
    expect(grid.find('.model-catalog-picker__header').exists()).toBe(true)
    expect(grid.find('.model-catalog-picker__results').exists()).toBe(true)
    expect(grid.element.contains(searchField(wrapper).element)).toBe(false)

    // A single scroll container — constrained heights compress, never nest.
    expect(wrapper.findAll('.model-catalog-picker__results')).toHaveLength(1)
    // All three interactive pieces are structurally present and wired:
    // a focusable search input...
    expect(searchField(wrapper).attributes('type')).toBe('search')
    // ...clickable sort controls...
    expect(sortButtons(wrapper)).toHaveLength(3)
    // ...and the rows inside the results scroller.
    expect(wrapper.get('.model-catalog-picker__results').findAll('.model-catalog-picker__row'))
      .toHaveLength(sortModels.length)

    // The clamped height comes from the pure math (real gap, no floor).
    const style = wrapper.vm.computePanelPosition(
      { top: 40, bottom: 232, left: 100, right: 400, width: 300 },
      { width: 800, height: 300 },
    )
    expect(parseFloat(style.maxHeight)).toBeLessThanOrEqual(300 - 232 - 4 - 8)
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker panel positioning', () => {
  // jsdom performs no layout (getBoundingClientRect is all zeros), so the
  // positioning math is a pure function of rects/viewport, tested directly.
  const triggerRect = over => ({ top: 100, bottom: 140, left: 200, right: 500, width: 300, ...over })

  it('opens below and sizes max-height from the space below when there is room', () => {
    const wrapper = mountPicker()
    const style = wrapper.vm.computePanelPosition(triggerRect({}), { width: 1024, height: 768 })
    expect(style).toEqual({
      width: '300px',
      maxHeight: '460px',
      left: '200px',
      top: '144px',
    })
    // Within bounds: top + maxHeight <= viewport height - padding.
    expect(parseFloat(style.top) + parseFloat(style.maxHeight)).toBeLessThanOrEqual(768 - 8)
    wrapper.unmount()
  })

  it('opens above, sizing max-height from the space above, when below is tighter', () => {
    const wrapper = mountPicker()
    const style = wrapper.vm.computePanelPosition(
      triggerRect({ top: 600, bottom: 640 }),
      { width: 1024, height: 680 },
    )
    expect(style).toEqual({
      width: '300px',
      maxHeight: '460px',
      left: '200px',
      bottom: '84px',
    })
    // Within bounds: the panel's top edge stays >= padding.
    expect(680 - parseFloat(style.bottom) - parseFloat(style.maxHeight)).toBeGreaterThanOrEqual(8)
    wrapper.unmount()
  })

  it('constrains max-height to the chosen side on short viewports, with no floor', () => {
    const wrapper = mountPicker()
    // 188px available above beats 58px below -> open above at that height.
    const short = wrapper.vm.computePanelPosition(
      triggerRect({ top: 200, bottom: 250, left: 100, right: 400 }),
      { width: 800, height: 320 },
    )
    expect(short.maxHeight).toBe('188px')
    expect(short.bottom).toBe('124px')
    expect(short.top).toBeUndefined()

    // Degenerate viewport: only 28px above — clamped to that real space
    // instead of being floored past it (which would overflow the viewport).
    const cramped = wrapper.vm.computePanelPosition(
      triggerRect({ top: 40, bottom: 70, left: 100, right: 400 }),
      { width: 800, height: 100 },
    )
    expect(cramped.maxHeight).toBe('28px')
    expect(cramped.bottom).toBe('64px')
    expect(100 - parseFloat(cramped.bottom) - parseFloat(cramped.maxHeight)).toBeGreaterThanOrEqual(8)
    wrapper.unmount()
  })

  it('fits a space below the old 96px floor without overflowing the viewport', () => {
    const wrapper = mountPicker()
    // 56px below beats 28px above -> open down, capped at the real 56px gap.
    const style = wrapper.vm.computePanelPosition(
      triggerRect({ top: 40, bottom: 232, left: 100, right: 400 }),
      { width: 800, height: 300 },
    )
    expect(style.maxHeight).toBe('56px')
    expect(parseFloat(style.maxHeight)).toBeLessThan(96)
    // Within bounds: top + maxHeight <= viewport height - padding.
    expect(parseFloat(style.top) + parseFloat(style.maxHeight)).toBeLessThanOrEqual(300 - 8)
    wrapper.unmount()
  })

  it('clamps horizontally for RTL to the viewport without emitting a left offset', () => {
    const wrapper = mountPicker()
    // Aligned with the trigger's inline end: right offset 400 - 380 = 20.
    const aligned = wrapper.vm.computePanelPosition(
      triggerRect({ left: 80, right: 380 }),
      { width: 400, height: 768 },
      { isRtl: true },
    )
    expect(aligned.right).toBe('20px')
    expect(aligned.left).toBeUndefined()

    // Trigger near the far edge: the panel is pushed back inside the viewport.
    const clamped = wrapper.vm.computePanelPosition(
      triggerRect({ left: -200, right: 100 }),
      { width: 400, height: 768 },
      { isRtl: true },
    )
    expect(clamped.right).toBe('92px')
    expect(clamped.left).toBeUndefined()
    wrapper.unmount()
  })

  it('fits narrow viewports by shrinking the width and clamping the left edge', () => {
    const wrapper = mountPicker()
    const style = wrapper.vm.computePanelPosition(
      triggerRect({ left: -10, right: 490, width: 500, top: 50, bottom: 90 }),
      { width: 320, height: 568 },
    )
    // width = min(max(500, 300), 560, 320 - 16) = 304, left clamped to padding.
    expect(style.width).toBe('304px')
    expect(style.left).toBe('8px')
    expect(style.top).toBe('94px')
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker visualViewport listeners', () => {
  const stubVisualViewport = () => {
    const original = window.visualViewport
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    window.visualViewport = { addEventListener, removeEventListener }
    return {
      addEventListener,
      removeEventListener,
      restore: () => {
        if (original === undefined) delete window.visualViewport
        else window.visualViewport = original
      },
    }
  }

  it('attaches visualViewport resize+scroll while open and removes both on close and unmount', async () => {
    const stub = stubVisualViewport()
    try {
      const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
      expect(stub.addEventListener).toHaveBeenCalledTimes(2)
      const attached = Object.fromEntries(stub.addEventListener.mock.calls.map(call => [call[0], call[1]]))
      expect(Object.keys(attached).sort()).toEqual(['resize', 'scroll'])
      expect(typeof attached.resize).toBe('function')
      expect(typeof attached.scroll).toBe('function')

      // Closing removes the exact handlers that were added.
      await wrapper.get('.model-catalog-picker__trigger').trigger('click')
      await nextTick()
      expect(stub.removeEventListener).toHaveBeenCalledTimes(2)
      const removed = stub.removeEventListener.mock.calls.map(call => [call[0], call[1]])
      expect(removed).toEqual([
        ['resize', attached.resize],
        ['scroll', attached.scroll],
      ])

      // Reopening re-attaches; unmount removes both again.
      await wrapper.get('.model-catalog-picker__trigger').trigger('click')
      await nextTick()
      expect(stub.addEventListener).toHaveBeenCalledTimes(4)
      wrapper.unmount()
      expect(stub.removeEventListener).toHaveBeenCalledTimes(4)
      expect(stub.removeEventListener.mock.calls.slice(2)).toEqual([
        ['resize', attached.resize],
        ['scroll', attached.scroll],
      ])
    } finally {
      stub.restore()
    }
  })

  it('repositions on visualViewport scroll alone when offsets change (no resize)', async () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const original = window.visualViewport
    window.visualViewport = {
      width: 1024,
      height: 400,
      offsetLeft: 0,
      offsetTop: 0,
      addEventListener,
      removeEventListener,
    }
    try {
      const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
      const panel = wrapper.get('.model-catalog-picker__panel')
      // Visible space below (offsets 0): 400 - 4 - 8 = 388.
      expect(panel.attributes('style')).toContain('max-height: 388px')

      const scrollHandler = addEventListener.mock.calls.find(call => call[0] === 'scroll')?.[1]
      expect(typeof scrollHandler).toBe('function')

      // Offsets change WITHOUT any resize event...
      window.visualViewport.offsetTop = 150
      scrollHandler()
      await nextTick()

      // ...and the panel repositions from the new offsets:
      // (150 + 400) - 4 - 8 = 538, capped at the preferred 460.
      expect(panel.attributes('style')).toContain('max-height: 460px')
      expect(panel.attributes('style')).not.toContain('max-height: 388px')
      wrapper.unmount()
    } finally {
      if (original === undefined) delete window.visualViewport
      else window.visualViewport = original
    }
  })

  it('keeps positioning and the open/close lifecycle working without visualViewport', async () => {
    const original = window.visualViewport
    delete window.visualViewport
    expect(window.visualViewport).toBeUndefined()
    try {
      const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
      // Falls back to window dimensions for the pure math wiring.
      expect(wrapper.get('.model-catalog-picker__panel').attributes('style')).toContain('width')
      await wrapper.get('.model-catalog-picker__trigger').trigger('click')
      await nextTick()
      expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)
      wrapper.unmount() // cleanup path without visualViewport must not throw
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    } finally {
      if (original !== undefined) window.visualViewport = original
    }
  })
})

describe('ModelCatalogPicker whole-panel scroll fallback', () => {
  // Forces a tiny available height in positionPanel (visualViewport absent ->
  // innerHeight is read; trigger rect is all zeros in jsdom).
  const stubViewportHeight = (height) => {
    const hadOwn = Object.prototype.hasOwnProperty.call(window, 'innerHeight')
    const ownDescriptor = hadOwn ? Object.getOwnPropertyDescriptor(window, 'innerHeight') : undefined
    const originalViewport = window.visualViewport
    delete window.visualViewport
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
    return () => {
      if (ownDescriptor) Object.defineProperty(window, 'innerHeight', ownDescriptor)
      else delete window.innerHeight
      if (originalViewport !== undefined) window.visualViewport = originalViewport
    }
  }

  it('keeps results-only scrolling in a normal viewport (fallback off)', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })
    const panel = wrapper.get('.model-catalog-picker__panel')
    const grid = wrapper.get('.model-catalog-picker__grid')
    const results = wrapper.get('.model-catalog-picker__results')

    expect(getComputedStyle(panel.element).overflowY).toBe('hidden')
    expect(getComputedStyle(grid.element).flex).toBe('1 1 auto')
    expect(getComputedStyle(results.element).overflowY).toBe('auto')
    // Footers are non-shrinking via SCSS in both regimes (proven against the
    // compiled stylesheet in the cascade test) — no inline regime override.
    expect(wrapper.get('.model-catalog-picker__note').attributes('style')).toBeUndefined()
    wrapper.unmount()
  })

  it('switches to one whole-panel scroller when the height cannot fit the fixed column', async () => {
    const models = Array.from({ length: 60 }, (_, i) => ({
      value: `m/${String(i).padStart(3, '0')}`,
      name: `Model ${String(i).padStart(3, '0')}`,
      pricing: null,
    }))
    const restore = stubViewportHeight(100)
    try {
      const wrapper = await openPicker({ models, modelValue: 'm/000', showPricing: true })
      const panel = wrapper.get('.model-catalog-picker__panel')
      // max-height = 100 - gap 4 - padding 8 = 88 < the 240px fixed-column
      // need -> fallback engages (computePanelPosition bounds unchanged).
      expect(panel.attributes('style')).toContain('max-height: 88px')
      expect(getComputedStyle(panel.element).overflowY).toBe('auto')

      // Inner regions stop shrinking and stop being scroll containers, so
      // there is exactly ONE scroll region (no nested-scroll trap)...
      const grid = wrapper.get('.model-catalog-picker__grid')
      const results = wrapper.get('.model-catalog-picker__results')
      expect(getComputedStyle(grid.element).flex).toBe('0 0 auto')
      expect(getComputedStyle(results.element).flex).toBe('0 0 auto')
      expect(getComputedStyle(results.element).overflowY).toBe('visible')

      // ...and footers stay reachable as direct children of the panel scroller
      // (their non-shrinking flex rule is stylesheet-owned — jsdom loads no
      // stylesheet, so the computed rule is asserted in the cascade test).
      const note = wrapper.get('.model-catalog-picker__note')
      const status = wrapper.get('.model-catalog-picker__status')
      expect(note.element.parentElement).toBe(panel.element)
      expect(status.element.parentElement).toBe(panel.element)
      expect(note.text()).toContain('Base rates in USD per 1M tokens')
      expect(status.text()).toBe('Showing 50 of 60 matching models')

      // Every interactive control lives inside the single scroller, in the
      // natural tab order: search -> sort buttons -> radios, with no
      // tabindex overrides (jsdom cannot simulate the Tab key itself; see
      // the verification note in the PR/report).
      const focusables = [...panel.element.querySelectorAll('input, button')]
      expect(focusables).toHaveLength(1 + 3 + 50)
      expect(focusables[0].type).toBe('search')
      expect(focusables.slice(1, 4).every(el => el.classList.contains('model-catalog-picker__sort-button'))).toBe(true)
      expect(focusables.slice(4).every(el => el.type === 'radio')).toBe(true)
      expect(focusables.every(el => !el.hasAttribute('tabindex'))).toBe(true)
      focusables.forEach(el => expect(panel.element.contains(el)).toBe(true))
      wrapper.unmount()
    } finally {
      restore()
    }
  })
})

describe('ModelCatalogPicker trigger hover styling', () => {
  it('keeps the trigger on the neutral theme styling hook with no inline border/background override', async () => {
    const wrapper = mountPicker({ models: sortModels, modelValue: 'm/alpha' })
    const trigger = wrapper.get('.model-catalog-picker__trigger')
    // The class is the hook where the stylesheet applies the resting
    // --color-border border and the --color-background-hover fill.
    expect(trigger.classes()).toContain('model-catalog-picker__trigger')
    expect(trigger.element.tagName).toBe('BUTTON')
    // Nothing inline fights the theme: the normal border and the subtle hover
    // fill both come from the stylesheet. (jsdom has no stylesheet or hover
    // state, so the painted :hover itself cannot be observed here — browser
    // verification only; see the verification note in the report.)
    expect(trigger.attributes('style')).toBeUndefined()
    expect(trigger.element.style.borderColor).toBe('')
    expect(trigger.element.style.backgroundColor).toBe('')
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker sort-header stability', () => {
  const headerShape = wrapper => sortButtons(wrapper).map(button => ({
    text: button.text().replace(/\s+/g, ' '),
    nodes: button.element.children.length,
    icons: button.findAll('.model-catalog-picker__sort-icon').length,
    // Number of explicit text lines inside the header text wrapper.
    lines: button.findAll('.model-catalog-picker__header-text > span').length,
  }))

  it('keeps an identical icon slot, line structure and text across inactive, ascending and descending states', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })
    const icons = () => wrapper.findAll('.model-catalog-picker__sort-icon')

    // Inactive: every header already reserves one icon slot, and price
    // headers already render both text lines (label + unit).
    const initial = headerShape(wrapper)
    expect(initial.map(header => header.icons)).toEqual([1, 1, 1])
    expect(initial.map(header => header.nodes)).toEqual([2, 2, 2])
    expect(initial.map(header => header.lines)).toEqual([1, 2, 2])
    icons().forEach((icon) => {
      expect(icon.classes()).not.toContain('is-active')
      // Decorative: aria-sort on the columnheader carries the state.
      expect(icon.attributes('aria-hidden')).toBe('true')
    })

    // Activating sorts changes nothing structural — same text, node count,
    // line count and icon-slot count; only state classes and aria-sort differ.
    await clickHeader(wrapper, 0) // name ascending
    expect(headerShape(wrapper)).toEqual(initial)
    expect(icons()[0].classes()).toEqual(expect.arrayContaining(['is-active', 'is-asc']))
    expect(icons()[1].classes()).not.toContain('is-active')
    expect(headerCells(wrapper)[0].attributes('aria-sort')).toBe('ascending')

    await clickHeader(wrapper, 0) // name descending
    expect(headerShape(wrapper)).toEqual(initial)
    expect(icons()[0].classes()).toEqual(expect.arrayContaining(['is-active']))
    expect(icons()[0].classes()).not.toContain('is-asc')
    expect(headerCells(wrapper)[0].attributes('aria-sort')).toBe('descending')

    await clickHeader(wrapper, 1) // input ascending (name back to inactive)
    expect(headerShape(wrapper)).toEqual(initial)
    expect(icons()[0].classes()).not.toContain('is-active')
    expect(icons()[1].classes()).toEqual(expect.arrayContaining(['is-active', 'is-asc']))
    expect(headerCells(wrapper)[1].attributes('aria-sort')).toBe('ascending')

    await clickHeader(wrapper, 1) // input descending
    expect(headerShape(wrapper)).toEqual(initial)
    expect(icons()[1].classes()).not.toContain('is-asc')

    await clickHeader(wrapper, 1) // third click -> API order, icons all muted
    expect(headerShape(wrapper)).toEqual(initial)
    expect(icons().every(icon => !icon.classes().includes('is-active'))).toBe(true)
    expect(headerCells(wrapper)[1].attributes('aria-sort')).toBe('none')
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker row cascade under global Options styles', () => {
  // vitest runs css: false (no stylesheet pipeline), so the real cascade is
  // reproduced manually: the compiled picker SCSS is injected FIRST and
  // faithful excerpts of the global sources LAST — worst-case source order,
  // so only specificity can make the picker win (jsdom honors specificity
  // over order; verified). Excerpts of the four rules that hit picker rows
  // inside `.options-tab-content > .setting-group`:
  const GLOBAL_ROW_FIXTURE = `
.setting-group label { display: block; font-size: 12px; font-weight: 500; color: #111; margin-bottom: 4px; }
.setting-group label { width: auto !important; flex: 1 !important; max-width: none !important; margin-bottom: 0 !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.options-tab-content .setting-group label { font-size: 14px; font-weight: 500; color: #111; }
input[type="radio"] { width: 18px; height: 18px; margin-inline-end: 16px; cursor: pointer; vertical-align: middle; }
`

  const injectCascade = () => {
    const style = document.createElement('style')
    style.textContent = `${compiledPickerCss}\n${GLOBAL_ROW_FIXTURE}`
    document.head.appendChild(style)
    const container = document.createElement('div')
    container.className = 'options-tab-content'
    const group = document.createElement('div')
    group.className = 'setting-group'
    container.appendChild(group)
    document.body.appendChild(container)
    return {
      group,
      cleanup: () => {
        style.remove()
        container.remove()
      },
    }
  }

  it('row label and radio out-specify the global label/radio rules at worst-case source order', async () => {
    const { group, cleanup } = injectCascade()
    try {
      const wrapper = await openPicker(
        { models: sortModels, modelValue: 'm/alpha', showPricing: true },
        { attachTo: group },
      )

      const label = getComputedStyle(wrapper.get('.model-catalog-picker__row-label').element)
      // Without the picker's (0,3,0) rule the fixture would yield block +
      // nowrap + ellipsis (radio above the name, no wrapping).
      expect(label.display).toBe('flex')
      expect(label.flexDirection).toBe('row')
      expect(label.whiteSpace).toBe('normal')
      expect(label.overflow).toBe('visible')
      expect(label.textOverflow).toBe('clip')
      expect(label.marginBottom).toBe('0px')

      // Footer chrome is non-shrinking in the normal results-only layout
      // (stylesheet-owned — proven here where the compiled CSS is live).
      expect(getComputedStyle(wrapper.get('.model-catalog-picker__note').element).flex).toBe('0 0 auto')

      const radio = getComputedStyle(wrapper.get('.model-catalog-picker__radio').element)
      // The global 16px end-margin is reset; the row label's gap supplies
      // the single spacing between radio and metadata in both directions.
      expect(radio.marginInlineEnd).toBe('0px')
      // Control: the fixture still sizes the radio, proving the global
      // stylesheet was live and only the claimed properties were overridden.
      expect(radio.width).toBe('18px')
      wrapper.unmount()
    } finally {
      cleanup()
    }
  })

  it('keeps the radio-first row structure and class hooks the layout relies on', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })
    const rows = wrapper.findAll('.model-catalog-picker__row')
    expect(rows).toHaveLength(sortModels.length)
    rows.forEach((row) => {
      const label = row.get('.model-catalog-picker__row-label')
      expect(label.classes()).toContain('model-catalog-picker__row-label')
      // DOM order is direction-independent: radio first, metadata second —
      // flex-direction: row plus logical spacing flip it for RTL.
      const children = [...label.element.children]
      expect(children).toHaveLength(2)
      expect(children[0].classList.contains('model-catalog-picker__radio')).toBe(true)
      expect(children[1].classList.contains('model-catalog-picker__meta')).toBe(true)
      // Long names/IDs keep their wrap hooks next to the radio.
      expect(children[1].querySelector('.model-catalog-picker__name').getAttribute('dir')).toBe('auto')
      expect(children[1].querySelector('.model-catalog-picker__id').getAttribute('dir')).toBe('ltr')
    })
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker keyboard browsing vs pointer selection', () => {
  // Semantics under test: EVERY change emits (checked radio = selection);
  // only the close trigger differs — arrow-driven changes stay open with
  // focus on the radio, pointer changes close as before.
  it('keeps the panel open with focus on the radio for arrow-driven changes (still emitting)', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    const radio = wrapper.get('input[value="m/beta"]')
    radio.element.focus()
    await radio.trigger('keydown', { key: 'ArrowDown' })
    // jsdom has no native radio arrow navigation; setValue() stands in for
    // the native change browsers fire right after the arrow keydown.
    await radio.setValue()

    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['m/beta'])
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(true)
    expect(document.activeElement).toBe(radio.element)
    wrapper.unmount()
  })

  it('still emits once and closes for pointer-driven changes', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    await wrapper.get('input[value="m/beta"]').setValue()
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.model-catalog-picker__trigger').element)
    wrapper.unmount()
  })

  it('clears the pending arrow flag on keyup so a no-change arrow cannot strand later selections open', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    const radio = wrapper.get('input[value="m/beta"]')
    // Edge-of-group arrow: keydown fires, but no native change follows.
    await radio.trigger('keydown', { key: 'ArrowDown' })
    await radio.trigger('keyup', { key: 'ArrowDown' })
    await radio.setValue()
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not carry a stale arrow flag across close and reopen (Escape before keyup)', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    // Arrow keydown on a radio with NO follow-up change...
    await wrapper.get('input[value="m/beta"]').trigger('keydown', { key: 'ArrowDown' })
    // ...then the panel closes via Escape before any keyup.
    await wrapper.get('.model-catalog-picker__panel').trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)

    // Reopen: the stale flag must be gone, so a pointer selection closes again.
    await wrapper.get('.model-catalog-picker__trigger').trigger('click')
    await nextTick()
    await wrapper.get('input[value="m/beta"]').setValue()
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['m/beta'])
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.model-catalog-picker__trigger').element)
    wrapper.unmount()
  })

  it('ignores arrow keydown outside radios so search-cursor arrows never block a pointer close', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    const search = searchField(wrapper)
    search.element.focus()
    await search.trigger('keydown', { key: 'ArrowDown' })
    await wrapper.get('input[value="m/beta"]').setValue()
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('Enter confirms on the checked radio: closes and restores focus, without new writes', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    const checked = wrapper.get('input[value="m/alpha"]')
    checked.element.focus()
    await checked.trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.model-catalog-picker__trigger').element)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('Space closes on the checked radio but never from search or a sort button', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })
    // Space typed into search must keep the panel open (queries contain spaces).
    const search = searchField(wrapper)
    search.element.focus()
    await search.trigger('keydown', { key: ' ' })
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(true)
    // Enter on a sort button must keep the panel open (it cycles instead).
    await sortButtons(wrapper)[0].trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(true)

    const checked = wrapper.get('input[value="m/alpha"]')
    checked.element.focus()
    await checked.trigger('keydown', { key: ' ' })
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('Enter on an unchecked radio does not close (nothing confirmed yet)', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    const unchecked = wrapper.get('input[value="m/beta"]')
    unchecked.element.focus()
    await unchecked.trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker focus leaving the picker', () => {
  const focusOut = (root, relatedTarget) => root.dispatchEvent(
    new FocusEvent('focusout', { bubbles: true, relatedTarget }),
  )

  it('closes silently when focus moves outside, without stealing focus back', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    try {
      expect(document.activeElement).toBe(searchField(wrapper).element)
      focusOut(wrapper.get('.model-catalog-picker').element, outside)
      await nextTick()
      expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(false)
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      // No focus steal: the close did not move focus to the trigger.
      expect(document.activeElement).not.toBe(wrapper.get('.model-catalog-picker__trigger').element)
    } finally {
      outside.remove()
      wrapper.unmount()
    }
  })

  it('stays open when focus moves within the picker or focusout carries no related target', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    const root = wrapper.get('.model-catalog-picker').element

    focusOut(root, wrapper.get('input[value="m/alpha"]').element)
    await nextTick()
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(true)

    focusOut(root, null)
    await nextTick()
    expect(wrapper.find('.model-catalog-picker__panel').exists()).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker zoom/visual-viewport positioning', () => {
  const triggerRect = over => ({ top: 300, bottom: 340, left: 400, right: 700, width: 300, ...over })

  it('places an upward panel against the LAYOUT edge under pinch zoom (Greptile repro)', () => {
    const wrapper = mountPicker()
    // Reproduced pre-fix: bottom = 400 - 300 + 4 = 104 -> fixed positioning
    // measures from the layout edge: 800 - 104 = 696 instead of top - gap = 296.
    const style = wrapper.vm.computePanelPosition(
      triggerRect({}),
      { width: 1024, height: 400 }, // visible viewport
      { layoutWidth: 1024, layoutHeight: 800 },
    )
    expect(style.bottom).toBe('504px') // 800 - 300 + 4
    expect(800 - parseFloat(style.bottom)).toBe(296) // lower edge lands above the trigger
    expect(style.maxHeight).toBe('288px') // fits the visible space above
    expect(style.top).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps a downward panel on its direct layout rect under zoom', () => {
    const wrapper = mountPicker()
    // Visual viewport scrolled to offsetY 200 -> more room below than above.
    const style = wrapper.vm.computePanelPosition(
      triggerRect({}),
      { width: 1024, height: 400 },
      { layoutWidth: 1024, layoutHeight: 800, offsetY: 200 },
    )
    expect(style.top).toBe('344px') // rect.bottom + gap, no conversion
    expect(style.maxHeight).toBe('248px') // (200 + 400) - 340 - 4 - 8
    expect(style.bottom).toBeUndefined()
    wrapper.unmount()
  })

  it('measures available space inside an offset visual viewport', () => {
    const wrapper = mountPicker()
    const style = wrapper.vm.computePanelPosition(
      triggerRect({}),
      { width: 1024, height: 400 },
      { layoutWidth: 1024, layoutHeight: 800, offsetY: 100 },
    )
    // Above = 300 - 100 - 4 - 8 = 188 (not 288): the offset narrows the fit.
    expect(style.maxHeight).toBe('188px')
    expect(style.bottom).toBe('504px') // layout conversion is offset-independent
    wrapper.unmount()
  })

  it('clamps RTL panels inside the zoomed visual viewport, then converts right to layout coords', () => {
    const wrapper = mountPicker()
    // Visual viewport spans layout [100, 500]; layout width 1024.
    const inRange = wrapper.vm.computePanelPosition(
      triggerRect({ right: 450, left: 150 }),
      { width: 400, height: 768 },
      { isRtl: true, layoutWidth: 1024, offsetX: 100 },
    )
    expect(inRange.right).toBe('574px') // 1024 - 450
    expect(inRange.left).toBeUndefined()

    // Trigger at the visual left edge: the panel is pushed inside the visual
    // viewport (rightEdge >= 100 + 300 + 8 = 408) before conversion.
    const clamped = wrapper.vm.computePanelPosition(
      triggerRect({ right: 300, left: 0 }),
      { width: 400, height: 768 },
      { isRtl: true, layoutWidth: 1024, offsetX: 100 },
    )
    expect(clamped.right).toBe('616px') // 1024 - 408
    wrapper.unmount()
  })

  it('keeps prior behavior when no visual-viewport context is provided', () => {
    const wrapper = mountPicker()
    const implicit = wrapper.vm.computePanelPosition(triggerRect({}), { width: 1024, height: 768 })
    const explicit = wrapper.vm.computePanelPosition(
      triggerRect({}),
      { width: 1024, height: 768 },
      { layoutWidth: 1024, layoutHeight: 768, offsetX: 0, offsetY: 0 },
    )
    expect(implicit).toEqual(explicit)
    wrapper.unmount()
  })
})

describe('ModelCatalogPicker translation fallback (key echo)', () => {
  it('uses real translations when present and the fallback when vue-i18n echoes the key', async () => {
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha', showPricing: true })
    // Present in the translations map -> the real translation wins.
    expect(searchField(wrapper).attributes('placeholder')).toBe('Search by model name or ID')
    expect(wrapper.text()).toContain('Search models')
    expect(wrapper.get('[role="table"]').attributes('aria-label')).toBe('Available models')
    // Absent from the map -> the mock echoes the key; tr() must fall back.
    expect(wrapper.text()).toContain('/ 1M tokens')
    expect(wrapper.text()).toContain('Base rates in USD per 1M tokens; pricing may vary and additional fees may apply.')
    expect(rowText(wrapper, 'm/gamma')).toContain('N/A')
    expect(wrapper.text()).toContain('Model')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()

    const none = mountPicker({ models: sortModels, modelValue: '' })
    expect(none.get('.model-catalog-picker__trigger').text()).toContain('Browse models')
    none.unmount()
  })
})

describe('ModelCatalogPicker search result announcements', () => {
  const ANNOUNCE_DEBOUNCE_MS = 300

  afterEach(() => vi.useRealTimers())

  const announcer = wrapper => wrapper.get('[role="status"]')
  const settle = async () => {
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE_MS)
    await nextTick()
  }

  it('renders one persistent polite region while open, silent on open and on sort change', async () => {
    vi.useFakeTimers()
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    const region = announcer(wrapper)
    expect(region.attributes('role')).toBe('status')
    expect(region.attributes('aria-live')).toBe('polite')
    expect(region.attributes('aria-atomic')).toBe('true')
    expect(region.classes()).toContain('ti-sr-only')
    expect(region.text()).toBe('')

    // Opening settles without any announcement...
    await settle()
    expect(region.text()).toBe('')

    // ...and so does a sort change (match counts are untouched).
    await clickHeader(wrapper, 0)
    await settle()
    expect(region.text()).toBe('')
    expect(announcer(wrapper).element).toBe(region.element)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    // The region lives only while the panel is open.
    await wrapper.get('.model-catalog-picker__trigger').trigger('click')
    await nextTick()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('announces no-match, results available again, and match-count changes; visible hints unchanged', async () => {
    vi.useFakeTimers()
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    const region = announcer(wrapper)
    const regionElement = region.element

    // Typing stays silent until the debounce settles, then one no-match
    // announcement...
    await searchField(wrapper).setValue('nothing-matches')
    expect(region.text()).toBe('')
    await settle()
    expect(region.text()).toBe('No models match your search.')
    // ...while the visible no-match hint is unchanged and outside the region.
    const noMatchHint = wrapper.get('.model-catalog-picker__status')
    expect(noMatchHint.text()).toBe('No models match your search.')
    expect(noMatchHint.element.closest('[role="status"]')).toBeNull()
    expect(noMatchHint.element.closest('[aria-live]')).toBeNull()

    // Results available again -> count announcement on the SAME region element
    // (total is the filtered match count, mirroring the visible hint's copy).
    await searchField(wrapper).setValue('alpha')
    await settle()
    expect(region.text()).toBe('Showing 1 of 1 matching models')
    expect(announcer(wrapper).element).toBe(regionElement)

    // Clearing the search announces the full match count.
    await searchField(wrapper).setValue('')
    await settle()
    expect(region.text()).toBe('Showing 6 of 6 matching models')
    expect(announcer(wrapper).element).toBe(regionElement)

    // Sorting after a settled announcement must not re-announce.
    await clickHeader(wrapper, 0)
    await settle()
    expect(region.text()).toBe('Showing 6 of 6 matching models')

    // Announcements never emit a selection.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('collapses keystroke spam into one settled announcement and skips same-count re-queries', async () => {
    vi.useFakeTimers()
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    const region = announcer(wrapper)

    // A burst of keystrokes stays silent and announces only its settled state.
    await searchField(wrapper).setValue('a')
    await searchField(wrapper).setValue('al')
    await searchField(wrapper).setValue('alp')
    expect(region.text()).toBe('')
    await settle()
    expect(region.text()).toBe('Showing 1 of 1 matching models')

    // From here on, observe DOM mutations of the region (= announcements).
    const records = []
    const observer = new MutationObserver(batch => records.push(...batch))
    observer.observe(region.element, { childList: true, characterData: true, subtree: true })
    const flushRecords = () => records.push(...observer.takeRecords())
    try {
      // Same-count re-query: identical message -> zero mutations, no re-announce.
      await searchField(wrapper).setValue('alpha')
      await settle()
      flushRecords()
      expect(records).toHaveLength(0)
      expect(region.text()).toBe('Showing 1 of 1 matching models')

      // Another burst: silent mid-burst, then exactly one settled transition.
      await searchField(wrapper).setValue('x')
      await searchField(wrapper).setValue('xx')
      flushRecords()
      expect(records).toHaveLength(0)
      await settle()
      flushRecords()
      expect(records).toHaveLength(1)
      expect(region.text()).toBe('No models match your search.')
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    } finally {
      observer.disconnect()
      wrapper.unmount()
    }
  })

  it('restarts the debounce on every keystroke while the zero count is unchanged', async () => {
    vi.useFakeTimers()
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    const region = announcer(wrapper)

    // 'x' matches nothing -> no-match announcement scheduled...
    await searchField(wrapper).setValue('x')
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(region.text()).toBe('')

    // ...but 'xy' keeps the same ZERO count: the window must restart, so at
    // 400ms after the first keystroke (200ms since the last) nothing is read
    // aloud yet — the old count-derived watcher announced here, mid-typing.
    await searchField(wrapper).setValue('xy')
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(region.text()).toBe('')

    // Still silent at 299ms of inactivity; announced exactly at 300ms.
    await searchField(wrapper).setValue('xyz')
    vi.advanceTimersByTime(299)
    await nextTick()
    expect(region.text()).toBe('')
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(region.text()).toBe('No models match your search.')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('restarts the debounce on count-preserving queries with matches and never re-announces an identical message', async () => {
    vi.useFakeTimers()
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    const region = announcer(wrapper)

    // 'z' narrows to a single match -> count announcement scheduled.
    await searchField(wrapper).setValue('z')
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(region.text()).toBe('')

    // 'ze' keeps the same single match; the pending window must restart.
    await searchField(wrapper).setValue('ze')
    vi.advanceTimersByTime(200)
    await nextTick()
    expect(region.text()).toBe('')

    // Announced only after 300ms without typing.
    await searchField(wrapper).setValue('zet')
    vi.advanceTimersByTime(299)
    await nextTick()
    expect(region.text()).toBe('')
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(region.text()).toBe('Showing 1 of 1 matching models')

    // A settled, identical message: further count-preserving typing restarts
    // the debounce but must not mutate (re-announce) the region.
    const records = []
    const observer = new MutationObserver(batch => records.push(...batch))
    observer.observe(region.element, { childList: true, characterData: true, subtree: true })
    try {
      await searchField(wrapper).setValue('zeta')
      await settle()
      records.push(...observer.takeRecords())
      expect(records).toHaveLength(0)
      expect(region.text()).toBe('Showing 1 of 1 matching models')
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    } finally {
      observer.disconnect()
      wrapper.unmount()
    }
  })

  it('drops a pending announcement on close so reopening starts silent', async () => {
    vi.useFakeTimers()
    const wrapper = await openPicker({ models: sortModels, modelValue: 'm/alpha' })
    await searchField(wrapper).setValue('nothing-matches')
    // Close before the debounce fires.
    await wrapper.get('.model-catalog-picker__trigger').trigger('click')
    await nextTick()
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE_MS * 2)
    await nextTick()
    // Reopen: a fresh empty region, and the closed panel must not replay.
    await wrapper.get('.model-catalog-picker__trigger').trigger('click')
    await nextTick()
    const region = announcer(wrapper)
    expect(region.text()).toBe('')
    await settle()
    expect(region.text()).toBe('')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})
