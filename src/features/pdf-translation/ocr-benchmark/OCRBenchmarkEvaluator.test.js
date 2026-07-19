import { describe, expect, it } from 'vitest'
import { OCRBenchmarkEvaluator } from './OCRBenchmarkEvaluator.js'

describe('OCRBenchmarkEvaluator', () => {
  function createResult(providerId, output) {
    return Object.freeze({
      providerId,
      runtime: Object.freeze({ latencyMs: 25 }),
      output
    })
  }

  it.each([
    ['identical OCR text', 'recognized text', 'recognized text', { editDistance: 0, referenceCharacterCount: 15, characterErrorRate: 0 }],
    ['a substitution', 'recognized text', 'recognised text', { editDistance: 1, referenceCharacterCount: 15, characterErrorRate: 1 / 15 }],
    ['structured provider output', 'text', { text: 'text' }, { editDistance: 0, referenceCharacterCount: 4, characterErrorRate: 0 }]
  ])('evaluates %s', (_scenario, referenceText, output, characterErrorRate) => {
    const benchmarkResult = createResult('provider', output)
    const evaluations = new OCRBenchmarkEvaluator().evaluate(Object.freeze([benchmarkResult]), { referenceText })

    expect(evaluations).toEqual([
      {
        providerId: 'provider',
        benchmarkResult,
        normalizedOutput: { text: typeof output === 'string' ? output : output.text },
        metrics: { characterErrorRate }
      }
    ])
    expect(Object.isFrozen(evaluations)).toBe(true)
    expect(Object.isFrozen(evaluations[0])).toBe(true)
    expect(Object.isFrozen(evaluations[0].metrics)).toBe(true)
  })

  it('propagates invalid provider output', () => {
    const results = Object.freeze([createResult('provider', { data: { text: 'text' } })])

    expect(() => new OCRBenchmarkEvaluator().evaluate(results, { referenceText: 'text' }))
      .toThrow('OCR provider output must contain text')
  })

  it('propagates invalid reference text', () => {
    const results = Object.freeze([createResult('provider', 'text')])

    expect(() => new OCRBenchmarkEvaluator().evaluate(results, { referenceText: null }))
      .toThrow('TextNormalizer requires a string input')
  })
})
