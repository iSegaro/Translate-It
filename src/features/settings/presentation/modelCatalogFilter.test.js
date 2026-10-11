import { describe, expect, it } from 'vitest'
import { filterModelCatalog } from './modelCatalogFilter.js'

describe('filterModelCatalog', () => {
  it('trims and matches case-insensitively by model ID or name without changing the source', () => {
    const models = [
      { value: 'provider/model-one', name: 'Friendly Model' },
      { value: 'other/model-two', name: 'Another Name' },
    ]
    const original = structuredClone(models)

    expect(filterModelCatalog(models, '  FRIENDLY  ')).toEqual({
      total: 1,
      options: [{ value: 'provider/model-one', label: 'Friendly Model (provider/model-one)' }],
    })
    expect(filterModelCatalog(models, ' MODEL-TWO ').options).toEqual([
      { value: 'other/model-two', label: 'Another Name (other/model-two)' },
    ])
    expect(models).toEqual(original)
  })

  it('counts all matches while limiting ordered options to 50', () => {
    const models = Array.from({ length: 60 }, (_, index) => ({
      value: `model/${index}`,
      name: `Model ${index}`,
    }))

    const result = filterModelCatalog(models, '')

    expect(result.total).toBe(60)
    expect(result.options).toHaveLength(50)
    expect(result.options[0].value).toBe('model/0')
    expect(result.options[49].value).toBe('model/49')
  })
})
