import { describe, expect, it } from 'vitest'
import { OCRBenchmarkEvaluator } from './OCRBenchmarkEvaluator.js'

describe('OCRBenchmarkEvaluator', () => {
  it('returns immutable evaluations in canonical result order', () => {
    const results = Object.freeze([
      Object.freeze({ providerId: 'first', runtime: Object.freeze({ latencyMs: 25 }), output: 'first output' }),
      Object.freeze({ providerId: 'second', runtime: Object.freeze({ latencyMs: 50 }), output: 'second output' })
    ])

    const evaluations = new OCRBenchmarkEvaluator().evaluate(results)

    expect(evaluations).toEqual([
      { providerId: 'first', result: results[0] },
      { providerId: 'second', result: results[1] }
    ])
    expect(Object.isFrozen(evaluations)).toBe(true)
    expect(Object.isFrozen(evaluations[0])).toBe(true)
  })
})
