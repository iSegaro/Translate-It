import { describe, expect, it, vi } from 'vitest'
import { BenchmarkEvaluator } from './BenchmarkEvaluator.js'

describe('BenchmarkEvaluator', () => {
  const result = Object.freeze({
    candidateId: 'scale-1-eng',
    configuration: Object.freeze({ scale: 1, language: 'eng' }),
    runtime: Object.freeze({ latencyMs: 12 }),
    output: Object.freeze({ status: 'recognized', data: Object.freeze({ text: 'hello' }) })
  })

  it('attaches immutable CER evaluation when ground truth is supplied', () => {
    const evaluator = new BenchmarkEvaluator()
    const evaluated = evaluator.evaluate([result], { groundTruth: 'hallo' })

    expect(evaluated).toEqual([{
      ...result,
      evaluation: {
        cer: { editDistance: 1, referenceCharacterCount: 5, characterErrorRate: 0.2 },
        normalizedGroundTruth: 'hallo',
        normalizedOutput: 'hello'
      }
    }])
    expect(Object.isFrozen(evaluated)).toBe(true)
    expect(Object.isFrozen(evaluated[0])).toBe(true)
    expect(Object.isFrozen(evaluated[0].evaluation)).toBe(true)
    expect(Object.isFrozen(evaluated[0].evaluation.cer)).toBe(true)
    expect(result).not.toHaveProperty('evaluation')
  })

  it('preserves results without evaluation when ground truth is absent', () => {
    const results = Object.freeze([result])
    const evaluated = new BenchmarkEvaluator().evaluate(results)

    expect(evaluated).toBe(results)
    expect(evaluated[0]).toBe(result)
    expect(evaluated[0]).not.toHaveProperty('evaluation')
  })

  it('wires output normalization and CER calculation', () => {
    const outputNormalizer = { normalize: vi.fn(() => ({ text: 'recognized' })) }
    const textNormalizer = { normalize: vi.fn(text => `normalized:${text}`) }
    const cerCalculator = { calculate: vi.fn(() => Object.freeze({ characterErrorRate: 0 })) }
    const evaluator = new BenchmarkEvaluator({ outputNormalizer, textNormalizer, cerCalculator })

    evaluator.evaluate([result], { groundTruth: 'reference' })

    expect(outputNormalizer.normalize).toHaveBeenCalledWith(result.output.data)
    expect(textNormalizer.normalize).toHaveBeenNthCalledWith(1, 'reference')
    expect(textNormalizer.normalize).toHaveBeenNthCalledWith(2, 'recognized')
    expect(cerCalculator.calculate).toHaveBeenCalledWith('normalized:reference', 'normalized:recognized')
  })
})
