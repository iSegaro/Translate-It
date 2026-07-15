import { describe, expect, it } from 'vitest'

import {
  ScoringRuntimeValidationError,
  createScoringEngine,
  scoreBenchmark
} from '../scoring/index.js'

function scoringCase(status, overrides = {}) {
  return {
    documentId: overrides.documentId || 'doc-01',
    regionId: overrides.regionId || `region-${status}`,
    status,
    recognizedText: status === 'recognized' ? 'recognized text' : null,
    groundTruthText: 'ground truth text',
    language: 'eng',
    direction: 'ltr',
    metadata: { future: { retained: true } },
    ...overrides
  }
}

const normalizer = (item) => ({
  predicted: item.recognizedText.toUpperCase(),
  expected: item.groundTruthText.toUpperCase(),
  diagnostics: { normalized: true }
})

const metrics = [{
  id: 'distance',
  calculate({ predicted, expected }) {
    return Math.abs(predicted.length - expected.length)
  }
}, {
  id: 'exact-match',
  calculate({ predicted, expected }) {
    return predicted === expected ? 1 : 0
  }
}]

describe('Region OCR scoring runtime foundation', () => {
  it('scores recognized cases with injected normalization and metrics', () => {
    const result = scoreBenchmark({
      scoringCases: [scoringCase('recognized')],
      normalize: normalizer,
      metrics,
      normalizationPolicy: { id: 'test-normalizer', version: '1.0.0' },
      scorer: { id: 'test-scorer', version: '1.0.0' }
    })

    expect(result.sampleScores[0]).toMatchObject({
      documentId: 'doc-01',
      status: 'recognized',
      metrics: { distance: 2, 'exact-match': 0 },
      normalization: { predicted: 'RECOGNIZED TEXT', expected: 'GROUND TRUTH TEXT' },
      diagnostics: { normalized: true }
    })
    expect(result.summary.metrics).toEqual({
      distance: { count: 1, mean: 2 },
      'exact-match': { count: 1, mean: 0 }
    })
  })

  it.each(['failed', 'cancelled', 'skipped'])('passes through %s cases without normalization or metrics', (status) => {
    let normalizeCalls = 0
    const result = scoreBenchmark({
      scoringCases: [scoringCase(status)],
      normalize() {
        normalizeCalls += 1
        return { predicted: '', expected: '' }
      },
      metrics
    })

    expect(normalizeCalls).toBe(0)
    expect(result.sampleScores[0]).toMatchObject({
      status,
      metrics: {},
      normalization: null
    })
    expect(result.summary[status]).toBe(1)
  })

  it('aggregates counts and metric means across recognized samples', () => {
    const result = scoreBenchmark({
      scoringCases: [
        scoringCase('recognized', { regionId: 'r1', recognizedText: 'a', groundTruthText: 'aaa' }),
        scoringCase('recognized', { regionId: 'r2', recognizedText: 'aa', groundTruthText: 'aaa' }),
        scoringCase('failed')
      ],
      normalize: (item) => ({ predicted: item.recognizedText, expected: item.groundTruthText }),
      metrics: [{
        id: 'length-delta',
        calculate({ predicted, expected }) {
          return expected.length - predicted.length
        }
      }]
    })

    expect(result.summary).toMatchObject({
      total: 3,
      recognized: 2,
      failed: 1,
      skipped: 0,
      cancelled: 0,
      metrics: { 'length-delta': { count: 2, mean: 1.5 } }
    })
  })

  it('uses canonical metric ordering without mutating caller registry', () => {
    const alpha = { id: 'alpha', calculate: () => 1 }
    const beta = { id: 'beta', calculate: () => 2 }
    const cases = [scoringCase('recognized')]
    const forward = [alpha, beta]
    const reverse = [beta, alpha]

    const first = scoreBenchmark({ scoringCases: cases, normalize: normalizer, metrics: forward })
    const second = scoreBenchmark({ scoringCases: cases, normalize: normalizer, metrics: reverse })

    expect(first.summary.metrics).toEqual(second.summary.metrics)
    expect(Object.keys(first.sampleScores[0].metrics)).toEqual(['alpha', 'beta'])
    expect(reverse.map(({ id }) => id)).toEqual(['beta', 'alpha'])
  })

  it('rejects duplicate metric IDs deterministically', () => {
    expect(() => scoreBenchmark({
      scoringCases: [],
      normalize: normalizer,
      metrics: [metrics[0], metrics[0]]
    })).toThrow(ScoringRuntimeValidationError)
  })

  it('rejects invalid normalization output', () => {
    expect(() => scoreBenchmark({
      scoringCases: [scoringCase('recognized')],
      normalize: () => ({ predicted: null, expected: 'ok' }),
      metrics
    })).toThrow(ScoringRuntimeValidationError)
  })

  it('rejects invalid metric output', () => {
    expect(() => scoreBenchmark({
      scoringCases: [scoringCase('recognized')],
      normalize: normalizer,
      metrics: [{ id: 'bad', calculate: () => Number.NaN }]
    })).toThrow(ScoringRuntimeValidationError)
  })

  it('rejects unsupported sample status with structured deterministic errors', () => {
    const input = [scoringCase('unknown'), scoringCase('recognized', { recognizedText: 'x' })]
    const first = (() => {
      try { scoreBenchmark({ scoringCases: input, normalize: () => ({ predicted: 1, expected: '' }), metrics }) } catch (caught) { return caught.errors }
    })()
    const second = (() => {
      try { scoreBenchmark({ scoringCases: input, normalize: () => ({ predicted: 1, expected: '' }), metrics }) } catch (caught) { return caught.errors }
    })()

    expect(second).toEqual(first)
    expect(first.map(({ path }) => path)).toEqual([...first.map(({ path }) => path)].sort())
  })

  it('returns deeply immutable runtime scoring results preserving metadata', () => {
    const result = scoreBenchmark({
      scoringCases: [scoringCase('recognized')],
      normalize: normalizer,
      metrics
    })

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.sampleScores[0].metadata.future)).toBe(true)
    expect(() => {
      result.sampleScores[0].metadata.future.retained = false
    }).toThrow(TypeError)
  })

  it('creates an injectable scoring engine facade', () => {
    const engine = createScoringEngine({ normalize: normalizer, metrics })
    expect(engine.score([scoringCase('recognized')]).sampleScores).toHaveLength(1)
  })
})
