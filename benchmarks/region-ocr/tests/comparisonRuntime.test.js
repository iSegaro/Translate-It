import { describe, expect, it } from 'vitest'

import {
  ComparisonRuntimeValidationError,
  compareBenchmarkResults,
  createComparisonEngine
} from '../comparison/index.js'

function runtimeResult(value = 0.5) {
  return {
    sampleScores: [
      { documentId: 'doc-01', regionId: 'region-01', status: 'recognized', metrics: { cer: value }, normalization: {}, diagnostics: {}, metadata: {} },
      { documentId: 'doc-01', regionId: 'region-02', status: 'recognized', metrics: { cer: value }, normalization: {}, diagnostics: {}, metadata: {} }
    ],
    summary: {
      total: 2,
      recognized: 2,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      metrics: { cer: { count: 2, mean: value } }
    },
    normalizationPolicy: { id: 'normalizer', version: '1.0.0', parameters: { locale: 'en', options: { trim: true } } },
    scorer: { id: 'scorer', version: '1.0.0', parameters: { metrics: ['cer'] } }
  }
}

function candidate(label, value = 0.5) {
  const runtimeScoringResult = runtimeResult(value)
  return {
    label,
    runtimeScoringResult,
    normalizationPolicy: structuredClone(runtimeScoringResult.normalizationPolicy),
    scorer: structuredClone(runtimeScoringResult.scorer),
    metadata: { source: label, nested: { retained: true } }
  }
}

function errorsFor(candidates) {
  try {
    compareBenchmarkResults({ candidates })
  } catch (caught) {
    expect(caught).toBeInstanceOf(ComparisonRuntimeValidationError)
    return caught.errors
  }
  throw new Error('Expected comparison validation failure')
}

function addMetric(candidate, metricId, values) {
  candidate.runtimeScoringResult.sampleScores.forEach((sample, index) => {
    sample.metrics[metricId] = values[index]
  })
  candidate.runtimeScoringResult.summary.metrics[metricId] = {
    count: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length
  }
}

function setAllSampleStatuses(candidate, status, metrics = {}) {
  candidate.runtimeScoringResult.sampleScores.forEach((sample) => {
    sample.status = status
    sample.metrics = structuredClone(metrics)
  })
  candidate.runtimeScoringResult.summary.metrics = status === 'recognized'
    ? Object.fromEntries(Object.keys(metrics).map((metricId) => [metricId, { count: 2, mean: metrics[metricId] }]))
    : {}
}

describe('Region OCR comparison runtime', () => {
  it('compares two identical candidates without ranking', () => {
    const result = compareBenchmarkResults({ candidates: [candidate('A'), candidate('B')] })

    expect(result.metrics.cer.candidateValues).toEqual([
      { label: 'A', count: 2, value: 0.5 },
      { label: 'B', count: 2, value: 0.5 }
    ])
    expect(result.comparisonMatrix.A.B.metrics.cer).toBe(0)
    expect(result).not.toHaveProperty('winner')
    expect(result).not.toHaveProperty('ranking')
  })

  it('reports left minus right metric differences', () => {
    const result = compareBenchmarkResults({ candidates: [candidate('A', 0.2), candidate('B', 0.7)] })

    expect(result.metrics.cer.pairwiseDifferences.A.B).toBeCloseTo(-0.5)
    expect(result.metrics.cer.pairwiseDifferences.B.A).toBeCloseTo(0.5)
    expect(result.comparisonMatrix.A.B.metrics.cer).toBe(result.metrics.cer.pairwiseDifferences.A.B)
  })

  it('supports three candidates and preserves input ordering', () => {
    const result = compareBenchmarkResults({ candidates: [candidate('C', 0.3), candidate('A', 0.1), candidate('B', 0.2)] })

    expect(result.candidates.map(({ label }) => label)).toEqual(['C', 'A', 'B'])
    expect(result.metrics.cer.candidateValues.map(({ label }) => label)).toEqual(['C', 'A', 'B'])
    expect(Object.keys(result.comparisonMatrix)).toEqual(['C', 'A', 'B'])
    expect(Object.keys(result.comparisonMatrix.C)).toEqual(['C', 'A', 'B'])
  })

  it('builds a complete matrix for more than three candidates', () => {
    const candidates = Array.from({ length: 10 }, (_, index) => candidate(`candidate-${index + 1}`, index / 10))
    const result = compareBenchmarkResults({ candidates })

    expect(Object.keys(result.comparisonMatrix)).toHaveLength(10)
    Object.values(result.comparisonMatrix).forEach((row) => expect(Object.keys(row)).toHaveLength(10))
  })

  it('keeps diagonal zero and pairwise differences antisymmetric', () => {
    const labels = ['A', 'B', 'C']
    const result = compareBenchmarkResults({ candidates: labels.map((label, index) => candidate(label, index * 0.2)) })

    labels.forEach((left) => {
      labels.forEach((right) => {
        const forward = result.comparisonMatrix[left][right].metrics.cer
        const reverse = result.comparisonMatrix[right][left].metrics.cer
        if (left === right) expect(forward).toBe(0)
        else expect(forward).toBe(-reverse)
      })
    })
  })

  it('returns sample comparisons without scoring source data', () => {
    const result = compareBenchmarkResults({ candidates: [candidate('A', 0.2), candidate('B', 0.4)] })

    expect(result.sampleComparisons[0]).toEqual({
      documentId: 'doc-01',
      regionId: 'region-01',
      status: 'recognized',
      candidateResults: [
        { label: 'A', status: 'recognized', metrics: { cer: 0.2 } },
        { label: 'B', status: 'recognized', metrics: { cer: 0.4 } }
      ]
    })
    expect(result.sampleComparisons[0]).not.toHaveProperty('normalization')
  })

  it('creates an engine facade', () => {
    const result = createComparisonEngine().compare([candidate('A'), candidate('B')])

    expect(result.diagnostics.candidateCount).toBe(2)
  })

  it('rejects invalid candidate collections and runtime results', () => {
    expect(errorsFor([])).toContainEqual(expect.objectContaining({ code: 'invalid_candidates', path: '$.candidates' }))
    const invalid = candidate('A')
    invalid.runtimeScoringResult = null
    expect(errorsFor([invalid, candidate('B')])).toContainEqual(expect.objectContaining({
      code: 'invalid_runtime_result',
      path: '$.candidates[0].runtimeScoringResult'
    }))
  })

  it('rejects duplicate candidate labels', () => {
    expect(errorsFor([candidate('same'), candidate('same')])).toContainEqual(expect.objectContaining({
      code: 'duplicate_candidate_label',
      path: '$.candidates[1].label'
    }))
  })

  it('compares descriptor parameters canonically and preserves array order', () => {
    const equivalent = candidate('B')
    equivalent.normalizationPolicy.parameters = { options: { trim: true }, locale: 'en' }
    equivalent.runtimeScoringResult.normalizationPolicy = structuredClone(equivalent.normalizationPolicy)
    expect(() => compareBenchmarkResults({ candidates: [candidate('A'), equivalent] })).not.toThrow()

    const mismatch = candidate('B')
    mismatch.scorer.parameters.metrics = ['wer', 'cer']
    mismatch.runtimeScoringResult.scorer = structuredClone(mismatch.scorer)
    expect(errorsFor([candidate('A'), mismatch])).toContainEqual(expect.objectContaining({ code: 'scorer_mismatch' }))
  })

  it('rejects normalization policy mismatch', () => {
    const mismatch = candidate('B')
    mismatch.normalizationPolicy.parameters.locale = 'fa'
    mismatch.runtimeScoringResult.normalizationPolicy = structuredClone(mismatch.normalizationPolicy)

    expect(errorsFor([candidate('A'), mismatch])).toContainEqual(expect.objectContaining({ code: 'normalization_policy_mismatch' }))
  })

  it('rejects missing or additional metric IDs', () => {
    const mismatch = candidate('B')
    mismatch.runtimeScoringResult.sampleScores.forEach((sample) => { sample.metrics.wer = 0.1 })
    mismatch.runtimeScoringResult.summary.metrics.wer = { count: 2, mean: 0.1 }

    expect(errorsFor([candidate('A'), mismatch])).toContainEqual(expect.objectContaining({ code: 'metric_set_mismatch' }))
  })

  it('rejects summary metric IDs absent from recognized samples', () => {
    const mismatch = candidate('B')
    mismatch.runtimeScoringResult.summary.metrics.futureMetric = { count: 0, mean: 0 }

    expect(errorsFor([candidate('A'), mismatch])).toContainEqual(expect.objectContaining({
      code: 'metric_set_mismatch',
      path: '$.candidates[1].runtimeScoringResult.summary.metrics'
    }))
  })

  it('rejects recognized metric IDs absent from runtime summary', () => {
    const mismatch = candidate('B')
    mismatch.runtimeScoringResult.sampleScores.forEach((sample) => { sample.metrics.wer = 0.1 })

    expect(errorsFor([candidate('A'), mismatch])).toContainEqual(expect.objectContaining({
      code: 'metric_set_mismatch',
      path: '$.candidates[1].runtimeScoringResult.summary.metrics'
    }))
  })

  it('accepts summaries consistent with recognized sample metrics', () => {
    const left = candidate('A')
    const right = candidate('B')
    left.runtimeScoringResult.sampleScores[0].metrics.cer = 0.1
    left.runtimeScoringResult.sampleScores[1].metrics.cer = 0.2
    left.runtimeScoringResult.summary.metrics.cer.mean = 0.15
    right.runtimeScoringResult.sampleScores[0].metrics.cer = 0.1
    right.runtimeScoringResult.sampleScores[1].metrics.cer = 0.2
    right.runtimeScoringResult.summary.metrics.cer.mean = 0.15

    expect(() => compareBenchmarkResults({ candidates: [left, right] })).not.toThrow()
  })

  it('rejects incorrect runtime summary metric counts', () => {
    const mismatch = candidate('B')
    mismatch.runtimeScoringResult.summary.metrics.cer.count = 1

    expect(errorsFor([candidate('A'), mismatch])).toContainEqual(expect.objectContaining({
      code: 'metric_count_mismatch',
      path: '$.candidates[1].runtimeScoringResult.summary.metrics.cer.count',
      details: { expected: 2, received: 1 }
    }))
  })

  it('rejects incorrect runtime summary metric means', () => {
    const mismatch = candidate('B')
    mismatch.runtimeScoringResult.summary.metrics.cer.mean = 0.6

    expect(errorsFor([candidate('A'), mismatch])).toContainEqual(expect.objectContaining({
      code: 'metric_mean_mismatch',
      path: '$.candidates[1].runtimeScoringResult.summary.metrics.cer.mean',
      details: { expected: 0.5, received: 0.6 }
    }))
  })

  it('accepts identical recognized and summary metric sets containing multiple metrics', () => {
    const left = candidate('A')
    const right = candidate('B')
    addMetric(left, 'wer', [0.2, 0.4])
    addMetric(right, 'wer', [0.3, 0.5])
    const result = compareBenchmarkResults({ candidates: [left, right] })

    expect(Object.keys(result.metrics)).toEqual(['cer', 'wer'])
    expect(result.metrics.wer.candidateValues).toEqual([
      { label: 'A', count: 2, value: 0.30000000000000004 },
      { label: 'B', count: 2, value: 0.4 }
    ])
  })

  it('accepts zero recognized samples with empty summaries', () => {
    const left = candidate('A')
    const right = candidate('B')
    setAllSampleStatuses(left, 'skipped')
    setAllSampleStatuses(right, 'skipped')

    const result = compareBenchmarkResults({ candidates: [left, right] })
    expect(result.metrics).toEqual({})
    expect(result.sampleComparisons.every(({ status }) => status === 'skipped')).toBe(true)
  })

  it('rejects zero-count summary metrics absent from recognized samples', () => {
    const left = candidate('A')
    const right = candidate('B')
    setAllSampleStatuses(left, 'skipped')
    setAllSampleStatuses(right, 'skipped')
    left.runtimeScoringResult.summary.metrics.cer = { count: 0, mean: 0 }
    right.runtimeScoringResult.summary.metrics.cer = { count: 0, mean: 0 }

    expect(errorsFor([left, right])).toContainEqual(expect.objectContaining({
      code: 'metric_set_mismatch',
      path: '$.candidates[0].runtimeScoringResult.summary.metrics'
    }))
  })

  it.each([
    ['nonzero', 1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY]
  ])('rejects zero-count summary metrics with %s mean', (_, mean) => {
    const left = candidate('A')
    const right = candidate('B')
    setAllSampleStatuses(left, 'skipped')
    setAllSampleStatuses(right, 'skipped')
    left.runtimeScoringResult.summary.metrics.cer = { count: 0, mean: 0 }
    right.runtimeScoringResult.summary.metrics.cer = { count: 0, mean }

    expect(errorsFor([left, right])).toContainEqual(expect.objectContaining({
      code: 'metric_mean_mismatch',
      path: '$.candidates[1].runtimeScoringResult.summary.metrics.cer.mean',
      details: { expected: 0, received: mean }
    }))
  })

  it.each(['failed', 'cancelled', 'skipped'])('accepts %s samples with empty metrics', (status) => {
    const left = candidate('A')
    const right = candidate('B')
    setAllSampleStatuses(left, status)
    setAllSampleStatuses(right, status)

    expect(() => compareBenchmarkResults({ candidates: [left, right] })).not.toThrow()
  })

  it.each(['failed', 'cancelled', 'skipped'])('rejects %s samples with populated metrics', (status) => {
    const left = candidate('A')
    const right = candidate('B')
    setAllSampleStatuses(left, status, { cer: 0.5 })
    setAllSampleStatuses(right, status, { cer: 0.5 })

    expect(errorsFor([left, right])).toContainEqual(expect.objectContaining({
      code: 'incompatible_status_metrics',
      path: '$.candidates[0].runtimeScoringResult.sampleScores[0].metrics'
    }))
  })

  it('rejects invalid metric values', () => {
    const invalid = candidate('B')
    invalid.runtimeScoringResult.summary.metrics.cer.mean = Number.NaN

    expect(errorsFor([candidate('A'), invalid])).toContainEqual(expect.objectContaining({
      code: 'invalid_metric_value',
      path: '$.candidates[1].runtimeScoringResult.summary.metrics.cer.mean'
    }))
  })

  it('rejects duplicate sample identities within a candidate', () => {
    const duplicate = candidate('B')
    duplicate.runtimeScoringResult.sampleScores[1].regionId = 'region-01'

    expect(errorsFor([candidate('A'), duplicate])).toContainEqual(expect.objectContaining({
      code: 'duplicate_sample_identity',
      path: '$.candidates[1].runtimeScoringResult.sampleScores[1]'
    }))
  })

  it('reports sample identity mismatch', () => {
    const mismatch = candidate('B')
    mismatch.runtimeScoringResult.sampleScores[1].regionId = 'region-03'

    expect(errorsFor([candidate('A'), mismatch])).toContainEqual(expect.objectContaining({ code: 'sample_identity_mismatch' }))
  })

  it('reports ordering mismatch separately from identity mismatch', () => {
    const reordered = candidate('B')
    reordered.runtimeScoringResult.sampleScores.reverse()
    const errors = errorsFor([candidate('A'), reordered])

    expect(errors).toContainEqual(expect.objectContaining({ code: 'sample_order_mismatch' }))
    expect(errors).not.toContainEqual(expect.objectContaining({ code: 'sample_identity_mismatch' }))
  })

  it('rejects sample status mismatch without inventing metric values', () => {
    const mismatch = candidate('B')
    mismatch.runtimeScoringResult.sampleScores[0].status = 'skipped'
    mismatch.runtimeScoringResult.sampleScores[0].metrics = {}

    expect(errorsFor([candidate('A'), mismatch])).toContainEqual(expect.objectContaining({ code: 'sample_status_mismatch' }))
  })

  it('produces deterministic output and deterministic errors', () => {
    const candidates = [candidate('A', 0.1), candidate('B', 0.2)]
    expect(compareBenchmarkResults({ candidates: structuredClone(candidates) })).toEqual(
      compareBenchmarkResults({ candidates: structuredClone(candidates) })
    )

    const invalid = candidate('B')
    invalid.runtimeScoringResult.sampleScores.reverse()
    invalid.scorer.id = 'other'
    invalid.runtimeScoringResult.scorer.id = 'other'
    const first = errorsFor([candidate('A'), structuredClone(invalid)])
    const second = errorsFor([candidate('A'), structuredClone(invalid)])
    expect(second).toEqual(first)
    expect(first.map(({ path }) => path)).toEqual([...first.map(({ path }) => path)].sort())
  })

  it('keeps validation failures typed and propagates unexpected exceptions', () => {
    expect(() => compareBenchmarkResults({ candidates: [] })).toThrow(ComparisonRuntimeValidationError)

    const malformed = candidate('A')
    const internal = new Error('unexpected internal failure')
    Object.defineProperty(malformed, 'runtimeScoringResult', {
      get() { throw internal }
    })

    expect(() => compareBenchmarkResults({ candidates: [malformed, candidate('B')] })).toThrow(internal)
  })

  it('deep-freezes output and preserved metadata', () => {
    const result = compareBenchmarkResults({ candidates: [candidate('A'), candidate('B')] })

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.candidates[0])).toBe(true)
    expect(Object.isFrozen(result.candidates[0].metadata.nested)).toBe(true)
    expect(Object.isFrozen(result.metrics.cer.candidateValues)).toBe(true)
    expect(Object.isFrozen(result.sampleComparisons[0].candidateResults)).toBe(true)
    expect(Object.isFrozen(result.comparisonMatrix.A.B.metrics)).toBe(true)
    expect(Object.isFrozen(result.diagnostics)).toBe(true)
  })

  it('does not mutate caller input values', () => {
    const candidates = [candidate('A'), candidate('B')]
    const before = structuredClone(candidates)

    compareBenchmarkResults({ candidates })

    expect(candidates).toEqual(before)
    expect(Object.isFrozen(candidates[0].metadata)).toBe(false)
    expect(Object.isFrozen(candidates[0].runtimeScoringResult.summary)).toBe(false)
  })
})
