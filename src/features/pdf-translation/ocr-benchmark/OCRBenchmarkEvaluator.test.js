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

  function createGroundTruthProvider(referenceText) {
    return { getReferenceText: vi.fn(() => referenceText) }
  }

  it.each([
    ['identical OCR text', 'recognized text', 'recognized text', { editDistance: 0, referenceCharacterCount: 15, characterErrorRate: 0 }],
    ['a substitution', 'recognized text', 'recognised text', { editDistance: 1, referenceCharacterCount: 15, characterErrorRate: 1 / 15 }],
    ['structured provider output', 'text', { text: 'text' }, { editDistance: 0, referenceCharacterCount: 4, characterErrorRate: 0 }]
  ])('evaluates %s', (_scenario, referenceText, output, characterErrorRate) => {
    const benchmarkResult = createResult('provider', output)
    const groundTruthProvider = createGroundTruthProvider(referenceText)
    const evaluations = new OCRBenchmarkEvaluator().evaluate(Object.freeze([benchmarkResult]), { groundTruthProvider })

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

    expect(() => new OCRBenchmarkEvaluator().evaluate(results, { groundTruthProvider: createGroundTruthProvider('text') }))
      .toThrow('OCR provider output must contain text')
  })

  it('propagates invalid reference text', () => {
    const results = Object.freeze([createResult('provider', 'text')])

    expect(() => new OCRBenchmarkEvaluator().evaluate(results, { groundTruthProvider: createGroundTruthProvider(null) }))
      .toThrow('TextNormalizer requires a string input')
  })

  it('resolves ground truth once and forwards evaluation context', () => {
    const results = Object.freeze([createResult('first', 'text'), createResult('second', 'text')])
    const context = Object.freeze({ source: 'test' })
    const groundTruthProvider = createGroundTruthProvider('text')

    new OCRBenchmarkEvaluator().evaluate(results, { groundTruthProvider, context })

    expect(groundTruthProvider.getReferenceText).toHaveBeenCalledOnce()
    expect(groundTruthProvider.getReferenceText).toHaveBeenCalledWith(context)
  })

  it('propagates ground truth provider errors', () => {
    const error = new Error('reference unavailable')
    const groundTruthProvider = { getReferenceText: () => { throw error } }

    expect(() => new OCRBenchmarkEvaluator().evaluate(Object.freeze([]), { groundTruthProvider })).toThrow(error)
  })
})
