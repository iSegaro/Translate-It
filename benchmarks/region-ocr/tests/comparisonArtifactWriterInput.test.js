import { describe, expect, it } from 'vitest'

import { compareBenchmarkResults } from '../comparison/index.js'
import {
  ComparisonArtifactWriterInputValidationError,
  createComparisonResultDescriptor,
  finalizeComparisonArtifactWriterInput,
  validateComparisonArtifactWriterInput
} from '../comparison/index.js'
import { ARTIFACT_TYPES } from '../schemas/index.js'

const CREATED_AT = '2026-07-15T12:30:45.123Z'

function scoredResultRef(artifact) {
  return {
    artifactType: artifact.artifactType,
    artifactId: artifact.artifactId,
    schemaVersion: artifact.schemaVersion,
    contentHash: artifact.contentHash
  }
}

function scoredResult(artifactId, label, mean = 0.1) {
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

function runtimeResult() {
  return compareBenchmarkResults({ candidates: [
    {
      label: 'candidate-a',
      runtimeScoringResult: {
        sampleScores: [{ documentId: 'doc-01', regionId: 'region-01', status: 'recognized', metrics: { cer: 0.1 }, normalization: {}, diagnostics: {}, metadata: {} }],
        summary: { total: 1, recognized: 1, failed: 0, cancelled: 0, skipped: 0, metrics: { cer: { count: 1, mean: 0.1 } } },
        normalizationPolicy: { id: 'normalizer', version: '1.0.0', parameters: { locale: 'en' } },
        scorer: { id: 'scorer', version: '1.0.0', parameters: { mode: 'strict' } }
      },
      normalizationPolicy: { id: 'normalizer', version: '1.0.0', parameters: { locale: 'en' } },
      scorer: { id: 'scorer', version: '1.0.0', parameters: { mode: 'strict' } },
      metadata: { kept: true }
    },
    {
      label: 'candidate-b',
      runtimeScoringResult: {
        sampleScores: [{ documentId: 'doc-01', regionId: 'region-01', status: 'recognized', metrics: { cer: 0.2 }, normalization: {}, diagnostics: {}, metadata: {} }],
        summary: { total: 1, recognized: 1, failed: 0, cancelled: 0, skipped: 0, metrics: { cer: { count: 1, mean: 0.2 } } },
        normalizationPolicy: { id: 'normalizer', version: '1.0.0', parameters: { locale: 'en' } },
        scorer: { id: 'scorer', version: '1.0.0', parameters: { mode: 'strict' } }
      },
      normalizationPolicy: { id: 'normalizer', version: '1.0.0', parameters: { locale: 'en' } },
      scorer: { id: 'scorer', version: '1.0.0', parameters: { mode: 'strict' } },
      metadata: { kept: true }
    }
  ] })
}

function validInput() {
  const runtime = structuredClone(runtimeResult())
  const scoredA = scoredResult('scored-a', 'candidate-a', 0.1)
  const scoredB = scoredResult('scored-b', 'candidate-b', 0.2)
  return {
    comparisonRuntimeResult: runtime,
    comparisonResultDescriptor: createComparisonResultDescriptor({
      artifactId: 'comparison-001',
      contentHash: `sha256:${'9'.repeat(64)}`,
      createdAt: CREATED_AT,
      comparisonResultId: 'comparison-001',
      comparisonPolicy: { id: 'compare', version: '1.0.0', parameters: { locale: 'en' } },
      candidateRefs: [
        { label: 'candidate-a', scoredResultRef: scoredResultRef(scoredA) },
        { label: 'candidate-b', scoredResultRef: scoredResultRef(scoredB) },
      ],
      futureField: { retained: true }
    }),
    scoredResults: [scoredA, scoredB]
  }
}

describe('Comparison artifact writer input', () => {
  it('accepts valid input', () => {
    expect(validateComparisonArtifactWriterInput(validInput())).toMatchObject({ valid: true, errors: [] })
  })

  it('accepts reverse scoredResults ordering while resolving by reference', () => {
    const input = validInput()
    input.scoredResults.reverse()
    expect(validateComparisonArtifactWriterInput(input)).toMatchObject({ valid: true, errors: [] })
  })

  it('rejects missing descriptor fields', () => {
    const input = validInput()
    delete input.comparisonResultDescriptor.createdAt
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'missing_required_field',
      path: '$.comparisonResultDescriptor.createdAt'
    }))
  })

  it('rejects invalid hash and timestamp', () => {
    const input = validInput()
    input.comparisonResultDescriptor.contentHash = 'bad'
    input.comparisonResultDescriptor.createdAt = 'not-a-date'
    const errors = validateComparisonArtifactWriterInput(input).errors
    expect(errors).toContainEqual(expect.objectContaining({ code: 'invalid_hash', path: '$.comparisonResultDescriptor.contentHash' }))
    expect(errors).toContainEqual(expect.objectContaining({ code: 'invalid_timestamp', path: '$.comparisonResultDescriptor.createdAt' }))
  })

  it('rejects invalid comparison policy', () => {
    const input = validInput()
    input.comparisonResultDescriptor.comparisonPolicy = null
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'invalid_comparison_policy',
      path: '$.comparisonResultDescriptor.comparisonPolicy'
    }))
  })

  it('rejects duplicate candidate labels', () => {
    const input = validInput()
    input.comparisonResultDescriptor.candidateRefs[1].label = 'candidate-a'
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_candidate_label',
      path: '$.comparisonResultDescriptor.candidateRefs[1].label'
    }))
  })

  it('rejects duplicate candidate refs resolving to same SCORED_RESULT', () => {
    const input = validInput()
    input.comparisonResultDescriptor.candidateRefs[1].scoredResultRef = structuredClone(input.comparisonResultDescriptor.candidateRefs[0].scoredResultRef)
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_candidate_reference',
      path: '$.comparisonResultDescriptor.candidateRefs[1].scoredResultRef'
    }))
  })

  it('rejects duplicate scored-result identities', () => {
    const input = validInput()
    input.scoredResults[1].artifactId = input.scoredResults[0].artifactId
    input.scoredResults[1].contentHash = input.scoredResults[0].contentHash
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_scored_result_identity',
      path: '$.scoredResults[1]'
    }))
  })

  it('rejects candidate count mismatch', () => {
    const input = validInput()
    input.comparisonRuntimeResult.candidates.pop()
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'candidate_count_mismatch',
      path: '$.comparisonRuntimeResult.candidates'
    }))
  })

  it('rejects scoredResults count mismatch', () => {
    const input = validInput()
    input.scoredResults.pop()
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'candidate_count_mismatch',
      path: '$.scoredResults'
    }))
  })

  it('rejects candidate label mismatch', () => {
    const input = validInput()
    input.comparisonResultDescriptor.candidateRefs[1].label = 'candidate-c'
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'candidate_label_mismatch',
      path: '$.comparisonResultDescriptor.candidateRefs[1].label'
    }))
  })

  it('rejects candidate ordering mismatch', () => {
    const input = validInput()
    input.comparisonResultDescriptor.candidateRefs.reverse()
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'candidate_ordering_mismatch',
      path: '$.comparisonResultDescriptor.candidateRefs'
    }))
  })

  it('rejects unresolved scoredResultRef', () => {
    const input = validInput()
    input.comparisonResultDescriptor.candidateRefs[1].scoredResultRef.contentHash = `sha256:${'0'.repeat(64)}`
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'unresolved_scored_result_reference',
      path: '$.comparisonResultDescriptor.candidateRefs[1].scoredResultRef'
    }))
  })

  it('rejects wrong artifact type', () => {
    const input = validInput()
    input.scoredResults[0].artifactType = ARTIFACT_TYPES.RAW_SAMPLE
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'invalid_artifact_type',
      path: '$.scoredResults[0].artifactType'
    }))
  })

  it('rejects invalid scored artifact', () => {
    const input = validInput()
    input.scoredResults[0].samples[0].metrics = {}
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'missing_required_field',
      path: '$.scoredResults[0].samples[0].metrics.cer'
    }))
  })

  it('rejects normalization mismatch', () => {
    const input = validInput()
    input.comparisonRuntimeResult.candidates[0].normalizationPolicy.parameters.locale = 'fr'
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'normalization_policy_mismatch'
    }))
  })

  it('rejects scorer mismatch', () => {
    const input = validInput()
    input.scoredResults[0].scorer.version = '2.0.0'
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'scorer_mismatch'
    }))
  })

  it('rejects forbidden derived fields', () => {
    const input = validInput()
    input.comparisonResultDescriptor.schemaVersion = '1.0.0'
    expect(validateComparisonArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'forbidden_field',
      path: '$.comparisonResultDescriptor.schemaVersion'
    }))
  })

  it('preserves unknown fields and deeply freezes finalized input', () => {
    const input = validInput()
    const finalized = finalizeComparisonArtifactWriterInput(input)
    expect(finalized.comparisonResultDescriptor.futureField.retained).toBe(true)
    expect(Object.isFrozen(finalized.comparisonResultDescriptor.futureField)).toBe(true)
    expect(Object.isFrozen(finalized.comparisonResultDescriptor.candidateRefs[0])).toBe(true)
    expect(Object.isFrozen(finalized.scoredResults[0])).toBe(true)
    expect(Object.isFrozen(finalized.comparisonRuntimeResult.candidates[0].metadata)).toBe(true)
  })

  it('returns deterministic validation errors', () => {
    const input = validInput()
    input.comparisonResultDescriptor.createdAt = 'bad'
    input.scoredResults[0].contentHash = 'bad'
    const first = validateComparisonArtifactWriterInput(structuredClone(input)).errors
    const second = validateComparisonArtifactWriterInput(structuredClone(input)).errors
    expect(second).toEqual(first)
    expect(first.map(({ path }) => path)).toEqual([...first.map(({ path }) => path)].sort())
  })

  it('invalid input remains unfrozen', () => {
    const input = validInput()
    input.comparisonResultDescriptor.contentHash = 'bad'
    expect(() => finalizeComparisonArtifactWriterInput(input)).toThrow(ComparisonArtifactWriterInputValidationError)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.comparisonResultDescriptor)).toBe(false)
  })

  it('does not require summary-to-SCORED_RESULT validation', () => {
    const input = validInput()
    input.comparisonRuntimeResult.candidates[0].summary.metrics.cer.mean = 9
    expect(validateComparisonArtifactWriterInput(input)).toMatchObject({ valid: true, errors: [] })
  })
})
