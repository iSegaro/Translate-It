import { describe, expect, it } from 'vitest'
import { BenchmarkCriteriaEvaluator } from './BenchmarkCriteriaEvaluator.js'

describe('BenchmarkCriteriaEvaluator', () => {
  it('builds immutable canonical criteria', () => {
    const criteria = new BenchmarkCriteriaEvaluator().evaluate({ latencyMs: 25 })

    expect(criteria).toEqual({
      latency: { value: 25, weight: null },
      quality: { value: null, weight: null },
      cost: { value: null, weight: null }
    })
    expect(Object.isFrozen(criteria)).toBe(true)
    expect(Object.isFrozen(criteria.latency)).toBe(true)
    expect(Object.isFrozen(criteria.quality)).toBe(true)
    expect(Object.isFrozen(criteria.cost)).toBe(true)
  })
})
