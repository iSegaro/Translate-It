import { describe, expect, it } from 'vitest'

import { ComparisonArtifactWriterInputValidationError, writeComparisonArtifact } from '../comparison/index.js'
import { ARTIFACT_TYPES, validateBenchmarkArtifact } from '../schemas/index.js'

const CREATED_AT = '2026-07-15T12:30:45.123Z'

function scoredResult(artifactId, label, mean) {
  return {
    schemaVersion: '1.0.0',
    artifactType: ARTIFACT_TYPES.SCORED_RESULT,
    artifactId,
    contentHash: `sha256:${String(mean).replace('.', '').padEnd(64, '0').slice(0, 64)}`,
    createdAt: CREATED_AT,
    scoredResultId: artifactId,
    rawRunRef: {
      artifactType: ARTIFACT_TYPES.RAW_RUN,
      artifactId: 'raw-run-001',
      schemaVersion: '1.0.0',
      contentHash: `sha256:${'1'.repeat(64)}`
    },
    corpusRef: {
      artifactType: ARTIFACT_TYPES.CORPUS_MANIFEST,
      artifactId: 'corpus-001',
      schemaVersion: '1.0.0',
      contentHash: `sha256:${'2'.repeat(64)}`
    },
    normalizationPolicy: { id: 'normalizer', version: '1.0.0', parameters: { locale: 'en' } },
    scorer: { id: 'scorer', version: '1.0.0', parameters: { mode: 'strict' } },
    samples: [{
      sampleRef: {
        artifactType: ARTIFACT_TYPES.RAW_SAMPLE,
        artifactId: `raw-sample-${label}`,
        schemaVersion: '1.0.0',
        contentHash: `sha256:${'3'.repeat(64)}`
      },
      status: 'recognized',
      metrics: { cer: mean, wer: 0, deletionRate: 0, rtlOrderCorrect: null }
    }]
  }
}

function metricSummary(mean) {
  return {
    count: 1,
    mean
  }
}

function comparisonInput() {
  const candidateA = {
    label: 'candidate-a',
    normalizationPolicy: { id: 'normalizer', version: '1.0.0', parameters: { locale: 'en' } },
    scorer: { id: 'scorer', version: '1.0.0', parameters: { mode: 'strict' } },
    summary: {
      total: 1,
      recognized: 1,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      metrics: {
        cer: metricSummary(0.1),
        wer: metricSummary(0.2),
        deletionRate: metricSummary(0.3),
        rtlOrderCorrect: metricSummary(1)
      }
    },
    metadata: { kept: true }
  }
  const candidateB = {
    label: 'candidate-b',
    normalizationPolicy: { id: 'normalizer', version: '1.0.0', parameters: { locale: 'en' } },
    scorer: { id: 'scorer', version: '1.0.0', parameters: { mode: 'strict' } },
    summary: {
      total: 1,
      recognized: 1,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      metrics: {
        cer: metricSummary(0.2),
        wer: metricSummary(0.4),
        deletionRate: metricSummary(0.5),
        rtlOrderCorrect: metricSummary(0)
      }
    },
    metadata: { kept: true }
  }

  const comparisonRuntimeResult = {
    candidates: [candidateA, candidateB],
    metrics: {
      cer: {
        candidateValues: [
          { label: 'candidate-a', count: 1, value: 0.1 },
          { label: 'candidate-b', count: 1, value: 0.2 }
        ],
        pairwiseDifferences: {
          'candidate-a': { 'candidate-a': 0, 'candidate-b': -0.1 },
          'candidate-b': { 'candidate-a': 0.1, 'candidate-b': 0 }
        }
      },
      wer: {
        candidateValues: [
          { label: 'candidate-a', count: 1, value: 0.2 },
          { label: 'candidate-b', count: 1, value: 0.4 }
        ],
        pairwiseDifferences: {
          'candidate-a': { 'candidate-a': 0, 'candidate-b': -0.2 },
          'candidate-b': { 'candidate-a': 0.2, 'candidate-b': 0 }
        }
      },
      deletionRate: {
        candidateValues: [
          { label: 'candidate-a', count: 1, value: 0.3 },
          { label: 'candidate-b', count: 1, value: 0.5 }
        ],
        pairwiseDifferences: {
          'candidate-a': { 'candidate-a': 0, 'candidate-b': -0.2 },
          'candidate-b': { 'candidate-a': 0.2, 'candidate-b': 0 }
        }
      },
      rtlOrderCorrect: {
        candidateValues: [
          { label: 'candidate-a', count: 1, value: 1 },
          { label: 'candidate-b', count: 1, value: 0 }
        ],
        pairwiseDifferences: {
          'candidate-a': { 'candidate-a': 0, 'candidate-b': 1 },
          'candidate-b': { 'candidate-a': -1, 'candidate-b': 0 }
        }
      }
    },
    sampleComparisons: [{
      documentId: 'doc-01',
      regionId: 'region-01',
      status: 'recognized',
      candidateResults: [
        { label: 'candidate-a', status: 'recognized', metrics: { cer: 0.1, wer: 0.2, deletionRate: 0.3, rtlOrderCorrect: true } },
        { label: 'candidate-b', status: 'recognized', metrics: { cer: 0.2, wer: 0.4, deletionRate: 0.5, rtlOrderCorrect: false } }
      ]
    }],
    comparisonMatrix: {
      'candidate-a': {
        'candidate-a': { metrics: { cer: 0, wer: 0, deletionRate: 0, rtlOrderCorrect: 0 } },
        'candidate-b': { metrics: { cer: -0.1, wer: -0.2, deletionRate: -0.2, rtlOrderCorrect: 1 } }
      },
      'candidate-b': {
        'candidate-a': { metrics: { cer: 0.1, wer: 0.2, deletionRate: 0.2, rtlOrderCorrect: -1 } },
        'candidate-b': { metrics: { cer: 0, wer: 0, deletionRate: 0, rtlOrderCorrect: 0 } }
      }
    },
    diagnostics: { candidateCount: 2, metricCount: 4, sampleCount: 1, pairwiseDifference: 'leftValue - rightValue' }
  }

  const scoredA = scoredResult('scored-a', 'candidate-a', 0.1)
  const scoredB = scoredResult('scored-b', 'candidate-b', 0.2)

  return {
    comparisonRuntimeResult,
    comparisonResultDescriptor: {
      artifactId: 'comparison-001',
      contentHash: `sha256:${'9'.repeat(64)}`,
      createdAt: CREATED_AT,
      comparisonResultId: 'comparison-001',
      comparisonPolicy: { id: 'compare', version: '1.0.0', parameters: { locale: 'en' } },
      candidateRefs: [
        { label: 'candidate-a', scoredResultRef: {
          artifactType: scoredA.artifactType,
          artifactId: scoredA.artifactId,
          schemaVersion: scoredA.schemaVersion,
          contentHash: scoredA.contentHash
        } },
        { label: 'candidate-b', scoredResultRef: {
          artifactType: scoredB.artifactType,
          artifactId: scoredB.artifactId,
          schemaVersion: scoredB.schemaVersion,
          contentHash: scoredB.contentHash
        } }
      ],
      futureField: { retained: true }
    },
    scoredResults: [scoredA, scoredB]
  }
}

describe('Comparison artifact writer', () => {
  it('builds validated immutable COMPARISON_RESULT artifact', () => {
    const input = comparisonInput()
    const artifact = writeComparisonArtifact(input)

    expect(artifact).toMatchObject({
      schemaVersion: '1.0.0',
      artifactType: ARTIFACT_TYPES.COMPARISON_RESULT,
      artifactId: 'comparison-001',
      contentHash: `sha256:${'9'.repeat(64)}`,
      createdAt: CREATED_AT,
      comparisonResultId: 'comparison-001',
      comparisonPolicy: { id: 'compare', version: '1.0.0', parameters: { locale: 'en' } }
    })
    expect(artifact.futureField.retained).toBe(true)
    expect(artifact.candidates.map(({ label }) => label)).toEqual(['candidate-a', 'candidate-b'])
    expect(artifact.candidates.map(({ scoredResultRef }) => scoredResultRef.artifactId)).toEqual(['scored-a', 'scored-b'])
    expect(artifact.samples).toHaveLength(1)
    expect(artifact.samples[0].candidateResults.map(({ label }) => label)).toEqual(['candidate-a', 'candidate-b'])
    expect(artifact.metrics).toBe(input.comparisonRuntimeResult.metrics)
    expect(artifact.samples).toBe(input.comparisonRuntimeResult.sampleComparisons)
    expect(artifact.comparisonMatrix).toBe(input.comparisonRuntimeResult.comparisonMatrix)
    expect(artifact.diagnostics).toBe(input.comparisonRuntimeResult.diagnostics)
    expect(validateBenchmarkArtifact(artifact)).toMatchObject({ valid: true, errors: [] })
    expect(Object.isFrozen(artifact)).toBe(true)
  })

  it('preserves runtime-owned fields and candidate ordering', () => {
    const input = comparisonInput()
    const artifact = writeComparisonArtifact(input)

    expect(artifact.diagnostics).toEqual({ candidateCount: 2, metricCount: 4, sampleCount: 1, pairwiseDifference: 'leftValue - rightValue' })
    expect(artifact.candidates.map(({ label }) => label)).toEqual(['candidate-a', 'candidate-b'])
    expect(artifact.samples.map(({ status }) => status)).toEqual(input.comparisonRuntimeResult.sampleComparisons.map(({ status }) => status))
  })

  it('freezes nested output and rejects invalid input through existing boundary', () => {
    const artifact = writeComparisonArtifact(comparisonInput())

    expect(Object.isFrozen(artifact.candidates[0])).toBe(true)
    expect(Object.isFrozen(artifact.samples[0])).toBe(true)
    expect(Object.isFrozen(artifact.metrics.cer.candidateValues)).toBe(true)
    expect(Object.isFrozen(artifact.comparisonMatrix['candidate-a']['candidate-b'])).toBe(true)

    const input = comparisonInput()
    input.comparisonResultDescriptor.contentHash = 'bad'
    expect(() => writeComparisonArtifact(input)).toThrow(ComparisonArtifactWriterInputValidationError)
  })

  it('preserves empty sampleComparisons by reference', () => {
    const input = comparisonInput()
    input.comparisonRuntimeResult.sampleComparisons = []

    const artifact = writeComparisonArtifact(input)

    expect(artifact.samples).toBe(input.comparisonRuntimeResult.sampleComparisons)
    expect(artifact.samples).toEqual([])
    expect(validateBenchmarkArtifact(artifact)).toMatchObject({ valid: true, errors: [] })
    expect(Object.isFrozen(artifact)).toBe(true)
    expect(artifact.candidates.map(({ label }) => label)).toEqual(['candidate-a', 'candidate-b'])
    expect(artifact.metrics).toBe(input.comparisonRuntimeResult.metrics)
    expect(artifact.comparisonMatrix).toBe(input.comparisonRuntimeResult.comparisonMatrix)
    expect(artifact.diagnostics).toBe(input.comparisonRuntimeResult.diagnostics)
  })
})
