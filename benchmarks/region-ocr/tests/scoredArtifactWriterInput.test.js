import { describe, expect, it } from 'vitest'

import { RegionExecutionStatus } from '../execution-results/index.js'
import {
  ScoredArtifactWriterInputValidationError,
  createScoredResultDescriptor,
  finalizeScoredArtifactWriterInput,
  validateScoredArtifactWriterInput
} from '../scoring/index.js'
import { ARTIFACT_TYPES } from '../schemas/index.js'

const CREATED_AT = '2026-07-15T12:30:45.123Z'

function createRawRun() {
  return {
    schemaVersion: '1.0.0',
    artifactType: ARTIFACT_TYPES.RAW_RUN,
    artifactId: 'raw-run-001',
    contentHash: `sha256:${'1'.repeat(64)}`,
    createdAt: CREATED_AT,
    runId: 'run-001',
    corpusRef: {
      artifactType: ARTIFACT_TYPES.CORPUS_MANIFEST,
      artifactId: 'corpus-artifact',
      schemaVersion: '1.0.0',
      contentHash: `sha256:${'a'.repeat(64)}`
    },
    policy: { id: 'candidate-a', version: '1.0.0', parameters: { stable: true } },
    environment: {
      browser: { name: 'chromium', version: '126' },
      os: 'linux',
      pdfjsVersion: '6.0.227',
      tesseractVersion: '7.0.0',
      modelHashes: { eng: `sha256:${'2'.repeat(64)}` }
    },
    execution: { seed: 'seed-001', runModes: ['warm'], repetitions: 1, parallelism: 1 }
  }
}

function createRawSample(documentId, regionId, status, index, overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    artifactType: ARTIFACT_TYPES.RAW_SAMPLE,
    artifactId: `raw-sample-00${index + 1}`,
    contentHash: `sha256:${String(index + 2).repeat(64).slice(0, 64)}`,
    createdAt: CREATED_AT,
    sampleId: `raw-sample-00${index + 1}`,
    runRef: {
      artifactType: ARTIFACT_TYPES.RAW_RUN,
      artifactId: 'raw-run-001',
      schemaVersion: '1.0.0',
      contentHash: `sha256:${'1'.repeat(64)}`
    },
    corpusRef: {
      artifactType: ARTIFACT_TYPES.CORPUS_MANIFEST,
      artifactId: 'corpus-artifact',
      schemaVersion: '1.0.0',
      contentHash: `sha256:${'a'.repeat(64)}`
    },
    caseRef: { documentId, regionId },
    policy: { id: 'candidate-a', version: '1.0.0', parameters: { stable: true } },
    runMode: 'warm',
    sampleIndex: index,
    renderPlan: { scale: 2 },
    status,
    ...(status === RegionExecutionStatus.RECOGNIZED ? { recognition: { rawOutput: { text: 'recognized text' } } } : {}),
    ...(status === RegionExecutionStatus.FAILED ? { error: { name: 'Error', message: 'failed' } } : {}),
    timingMs: { pageResolution: 1, render: 2, ocr: 3, total: 6 },
    raster: { width: 10, height: 10, pixelCount: 100, rgbaBytes: 400 },
    memory: { peakDeltaBytes: null, measurementMethod: null },
    ...overrides
  }
}

function createRuntimeScoringResult() {
  return {
    sampleScores: [
      {
        documentId: 'doc-01',
        regionId: 'region-01',
        status: 'recognized',
        metrics: { cer: 0.5, wer: 0.25, deletionRate: 0, rtlOrderCorrect: null },
        normalization: { predicted: 'a', expected: 'b' },
        diagnostics: {},
        metadata: { future: { retained: true } }
      },
      {
        documentId: 'doc-01',
        regionId: 'region-02',
        status: 'skipped',
        metrics: {},
        normalization: null,
        diagnostics: {},
        metadata: {}
      }
    ],
    summary: {
      total: 2,
      recognized: 1,
      failed: 0,
      skipped: 1,
      cancelled: 0,
      metrics: { cer: { count: 1, mean: 0.5 } }
    },
    normalizationPolicy: { id: 'normalizer', version: '1.0.0' },
    scorer: { id: 'scorer', version: '1.0.0' }
  }
}

function createInput() {
  return {
    runtimeScoringResult: createRuntimeScoringResult(),
    rawRun: createRawRun(),
    rawSamples: [
      createRawSample('doc-01', 'region-01', 'recognized', 0),
      createRawSample('doc-01', 'region-02', 'skipped', 1)
    ],
    scoredResultDescriptor: createScoredResultDescriptor({
      artifactId: 'scored-result-001',
      contentHash: `sha256:${'9'.repeat(64)}`,
      createdAt: CREATED_AT,
      scoredResultId: 'scored-result-001',
      normalizationPolicy: { id: 'normalizer', version: '1.0.0', parameters: {} },
      scorer: { id: 'scorer', version: '1.0.0', parameters: {} },
      futureDescriptorField: { retained: true }
    })
  }
}

describe('Region OCR scored artifact writer input contract', () => {
  it('accepts valid writer input', () => {
    expect(validateScoredArtifactWriterInput(createInput())).toMatchObject({ valid: true, errors: [] })
  })

  it('rejects missing, invalid, and wrong-type RAW_RUN artifacts', () => {
    const missing = createInput()
    delete missing.rawRun
    expect(validateScoredArtifactWriterInput(missing).errors).toContainEqual(expect.objectContaining({
      code: 'invalid_artifact',
      path: '$.rawRun'
    }))

    const wrongType = createInput()
    wrongType.rawRun.artifactType = ARTIFACT_TYPES.RAW_SAMPLE
    expect(validateScoredArtifactWriterInput(wrongType).errors).toContainEqual(expect.objectContaining({
      code: 'invalid_artifact_type',
      path: '$.rawRun.artifactType'
    }))

    const invalid = createInput()
    invalid.rawRun.contentHash = 'bad'
    const invalidErrors = validateScoredArtifactWriterInput(invalid).errors
    expect(invalidErrors).toContainEqual(expect.objectContaining({
      code: 'invalid_pattern',
      path: '$.rawRun.contentHash'
    }))
    expect(invalidErrors.map(({ code }) => code)).not.toContain('incompatible_run_reference')
    expect(invalidErrors.map(({ code }) => code)).not.toContain('incompatible_corpus_reference')
    expect(invalidErrors.map(({ code }) => code)).not.toContain('incompatible_policy')
  })

  it('rejects missing descriptor fields', () => {
    const input = createInput()
    delete input.scoredResultDescriptor.createdAt

    expect(validateScoredArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'missing_required_field',
      path: '$.scoredResultDescriptor.createdAt'
    }))
  })

  it('rejects invalid hashes and timestamps', () => {
    const input = createInput()
    input.scoredResultDescriptor.contentHash = 'bad'
    input.scoredResultDescriptor.createdAt = '2026-02-30T12:00:00Z'

    expect(validateScoredArtifactWriterInput(input).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_hash', path: '$.scoredResultDescriptor.contentHash' }),
      expect.objectContaining({ code: 'invalid_timestamp', path: '$.scoredResultDescriptor.createdAt' })
    ]))
  })

  it('rejects runtime metadata that differs from descriptor metadata', () => {
    const input = createInput()
    input.runtimeScoringResult.normalizationPolicy = { id: 'other', version: '1.0.0', parameters: {} }
    input.runtimeScoringResult.scorer = { id: 'scorer', version: '2.0.0', parameters: {} }

    expect(validateScoredArtifactWriterInput(input).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'normalization_policy_mismatch', path: '$.runtimeScoringResult.normalizationPolicy' }),
      expect.objectContaining({ code: 'scorer_mismatch', path: '$.runtimeScoringResult.scorer' })
    ]))
  })

  it('compares descriptor parameters canonically while preserving array order', () => {
    const equivalent = createInput()
    equivalent.runtimeScoringResult.normalizationPolicy.parameters = {
      nested: { b: 2, a: 1 },
      values: [1, 2]
    }
    equivalent.scoredResultDescriptor.normalizationPolicy.parameters = {
      values: [1, 2],
      nested: { a: 1, b: 2 }
    }
    equivalent.runtimeScoringResult.scorer.parameters = { b: 2, a: 1 }
    equivalent.scoredResultDescriptor.scorer.parameters = { a: 1, b: 2 }

    expect(validateScoredArtifactWriterInput(equivalent)).toMatchObject({ valid: true, errors: [] })

    const arrayOrder = createInput()
    arrayOrder.runtimeScoringResult.scorer.parameters = { values: [1, 2] }
    arrayOrder.scoredResultDescriptor.scorer.parameters = { values: [2, 1] }
    expect(validateScoredArtifactWriterInput(arrayOrder).errors).toContainEqual(expect.objectContaining({
      code: 'scorer_mismatch'
    }))

    const differentValue = createInput()
    differentValue.runtimeScoringResult.normalizationPolicy.parameters = { value: 1 }
    differentValue.scoredResultDescriptor.normalizationPolicy.parameters = { value: 2 }
    expect(validateScoredArtifactWriterInput(differentValue).errors).toContainEqual(expect.objectContaining({
      code: 'normalization_policy_mismatch'
    }))
  })

  it('rejects duplicate RAW_SAMPLE identities', () => {
    const input = createInput()
    input.rawSamples[1].caseRef = { ...input.rawSamples[0].caseRef }

    expect(validateScoredArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_raw_sample_identity',
      path: '$.rawSamples[1]'
    }))
  })

  it('rejects RAW_SAMPLE provenance that does not match supplied RAW_RUN', () => {
    const runRef = createInput()
    runRef.rawSamples[0].runRef = {
      ...runRef.rawSamples[0].runRef,
      artifactId: 'another-run'
    }
    expect(validateScoredArtifactWriterInput(runRef).errors).toContainEqual(expect.objectContaining({
      code: 'incompatible_run_reference',
      path: '$.rawSamples[0].runRef'
    }))

    const corpusRef = createInput()
    corpusRef.rawSamples[0].corpusRef = {
      ...corpusRef.rawSamples[0].corpusRef,
      contentHash: `sha256:${'f'.repeat(64)}`
    }
    expect(validateScoredArtifactWriterInput(corpusRef).errors).toContainEqual(expect.objectContaining({
      code: 'incompatible_corpus_reference',
      path: '$.rawSamples[0].corpusRef'
    }))

    const policy = createInput()
    policy.rawSamples[0].policy = { ...policy.rawSamples[0].policy, id: 'candidate-b' }
    expect(validateScoredArtifactWriterInput(policy).errors).toContainEqual(expect.objectContaining({
      code: 'incompatible_policy',
      path: '$.rawSamples[0].policy'
    }))
  })

  it('accepts structurally equivalent reordered references and policies', () => {
    const input = createInput()
    input.rawSamples[0].runRef = {
      contentHash: input.rawRun.contentHash,
      schemaVersion: input.rawRun.schemaVersion,
      artifactId: input.rawRun.artifactId,
      artifactType: input.rawRun.artifactType
    }
    input.rawSamples[0].corpusRef = {
      contentHash: input.rawRun.corpusRef.contentHash,
      artifactId: input.rawRun.corpusRef.artifactId,
      artifactType: input.rawRun.corpusRef.artifactType,
      schemaVersion: input.rawRun.corpusRef.schemaVersion
    }
    input.rawRun.policy.parameters = { stable: true, nested: { a: 1, b: 2 } }
    input.rawSamples.forEach((sample) => {
      sample.policy = {
        version: input.rawRun.policy.version,
        parameters: { nested: { b: 2, a: 1 }, stable: true },
        id: input.rawRun.policy.id
      }
    })

    expect(validateScoredArtifactWriterInput(input)).toMatchObject({ valid: true, errors: [] })
  })

  it('rejects duplicate RAW_SAMPLE artifactId and sampleId independently', () => {
    const input = createInput()
    input.rawSamples[1].artifactId = input.rawSamples[0].artifactId
    input.rawSamples[1].sampleId = input.rawSamples[0].sampleId

    expect(validateScoredArtifactWriterInput(input).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate_artifact_id', path: '$.rawSamples[1].artifactId' }),
      expect.objectContaining({ code: 'duplicate_sample_id', path: '$.rawSamples[1].sampleId' })
    ]))
  })

  it('validates every RAW_SAMPLE artifact and prefixes schema error paths', () => {
    const input = createInput()
    input.rawSamples[0].contentHash = 'bad'
    input.rawSamples[0].sampleIndex = -1
    input.rawSamples[1].status = 'unknown'
    delete input.rawSamples[1].raster

    const errors = validateScoredArtifactWriterInput(input).errors
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_pattern', path: '$.rawSamples[0].contentHash' }),
      expect.objectContaining({ code: 'number_below_minimum', path: '$.rawSamples[0].sampleIndex' }),
      expect.objectContaining({ code: 'invalid_enum', path: '$.rawSamples[1].status' }),
      expect.objectContaining({ code: 'missing_required_field', path: '$.rawSamples[1].raster' })
    ]))
  })

  it('rejects runtime sample status mismatch against RAW_SAMPLE', () => {
    const input = createInput()
    input.runtimeScoringResult.sampleScores[1] = {
      ...input.runtimeScoringResult.sampleScores[1],
      status: 'failed'
    }

    expect(validateScoredArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'sample_status_mismatch',
      path: '$.runtimeScoringResult.sampleScores[1].status'
    }))
  })

  it('accepts recognized runtime metrics matching SCORED_RESULT requirements', () => {
    const input = createInput()

    expect(validateScoredArtifactWriterInput(input)).toMatchObject({ valid: true, errors: [] })
  })

  it.each(['cer', 'wer', 'deletionRate', 'rtlOrderCorrect'])('rejects recognized runtime metrics missing %s', (metricId) => {
    const input = createInput()
    delete input.runtimeScoringResult.sampleScores[0].metrics[metricId]

    expect(validateScoredArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'incompatible_scored_metrics',
      path: '$.runtimeScoringResult.sampleScores[0].metrics'
    }))
  })

  it.each([
    ['failed', RegionExecutionStatus.FAILED],
    ['cancelled', RegionExecutionStatus.CANCELLED],
    ['skipped', RegionExecutionStatus.SKIPPED]
  ])('rejects %s runtime metrics when populated', (_, status) => {
    const input = createInput()
    input.rawSamples[1].status = status
    if (status === RegionExecutionStatus.FAILED) input.rawSamples[1].error = { name: 'Error', message: 'failed' }
    input.runtimeScoringResult.sampleScores[1].status = status
    input.runtimeScoringResult.sampleScores[1].metrics = { cer: 0 }

    expect(validateScoredArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'incompatible_scored_metrics',
      path: '$.runtimeScoringResult.sampleScores[1].metrics'
    }))
  })

  it('rejects runtime and RAW_SAMPLE identity mismatches', () => {
    const input = createInput()
    input.runtimeScoringResult.sampleScores[1] = {
      ...input.runtimeScoringResult.sampleScores[1],
      regionId: 'wrong-region'
    }

    expect(validateScoredArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'runtime_artifact_identity_mismatch',
      path: '$.runtimeScoringResult.sampleScores[1]'
    }))
  })

  it('validates identity separately from ordering', () => {
    const input = createInput()
    input.rawSamples.reverse()

    const errors = validateScoredArtifactWriterInput(input).errors
    expect(errors).toContainEqual(expect.objectContaining({
      code: 'sample_order_mismatch',
      path: '$.runtimeScoringResult.sampleScores[0]'
    }))
    expect(errors).not.toContainEqual(expect.objectContaining({
      code: 'runtime_artifact_identity_mismatch'
    }))
  })

  it('rejects forbidden derived references in descriptor', () => {
    const input = createInput()
    input.scoredResultDescriptor.rawRunRef = { forbidden: true }

    expect(validateScoredArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'forbidden_field',
      path: '$.scoredResultDescriptor.rawRunRef'
    }))
  })

  it('preserves unknown descriptor fields and deeply freezes finalized input', () => {
    const input = createInput()
    const finalized = finalizeScoredArtifactWriterInput(input)

    expect(finalized.scoredResultDescriptor.futureDescriptorField.retained).toBe(true)
    expect(Object.isFrozen(finalized.scoredResultDescriptor.futureDescriptorField)).toBe(true)
    expect(() => {
      finalized.scoredResultDescriptor.futureDescriptorField.retained = false
    }).toThrow(TypeError)
  })

  it('returns deterministic validation errors', () => {
    const input = createInput()
    input.scoredResultDescriptor.contentHash = 'bad'
    input.rawSamples[0].sampleId = '../bad'

    const first = validateScoredArtifactWriterInput(structuredClone(input)).errors
    const second = validateScoredArtifactWriterInput(structuredClone(input)).errors

    expect(second).toEqual(first)
    expect(first.map(({ path }) => path)).toEqual([...first.map(({ path }) => path)].sort())
  })

  it('rejects malformed runtime and raw sample counts', () => {
    const input = createInput()
    input.rawSamples.pop()

    expect(validateScoredArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'sample_count_mismatch',
      path: '$.rawSamples'
    }))
  })

  it('rejects invalid normalization/scorer metadata', () => {
    const input = createInput()
    input.scoredResultDescriptor.normalizationPolicy = { id: 'bad id', version: '1.0.0', parameters: {} }

    expect(validateScoredArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'invalid_identifier',
      path: '$.scoredResultDescriptor.normalizationPolicy.id'
    }))
  })

  it('throws structured validation errors on finalize for invalid input', () => {
    const input = createInput()
    delete input.scoredResultDescriptor.scorer

    expect(() => finalizeScoredArtifactWriterInput(input)).toThrow(ScoredArtifactWriterInputValidationError)
  })
})
