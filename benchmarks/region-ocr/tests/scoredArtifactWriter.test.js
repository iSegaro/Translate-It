import { describe, expect, it } from 'vitest'

import { RegionExecutionStatus } from '../execution-results/index.js'
import {
  ScoredArtifactWriterInputValidationError,
  createScoredResultArtifact,
  writeScoredArtifact
} from '../scoring/index.js'
import {
  ARTIFACT_TYPES,
  validateBenchmarkArtifact
} from '../schemas/index.js'

const CREATED_AT = '2026-07-15T12:30:45.123Z'
const METRICS = Object.freeze({ wer: 0, cer: 0, deletionRate: 0, rtlOrderCorrect: null })

function clone(value) {
  return structuredClone(value)
}

function artifactRef(artifact) {
  return {
    artifactType: artifact.artifactType,
    artifactId: artifact.artifactId,
    schemaVersion: artifact.schemaVersion,
    contentHash: artifact.contentHash
  }
}

function rawRun() {
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

function rawSample(documentId, regionId, status, index) {
  return {
    schemaVersion: '1.0.0',
    artifactType: ARTIFACT_TYPES.RAW_SAMPLE,
    artifactId: `raw-sample-00${index + 1}`,
    contentHash: `sha256:${String(index + 3).repeat(64).slice(0, 64)}`,
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
    memory: { peakDeltaBytes: null, measurementMethod: null }
  }
}

function sampleScore(documentId, regionId, status) {
  return {
    documentId,
    regionId,
    status,
    metrics: status === RegionExecutionStatus.RECOGNIZED ? clone(METRICS) : {},
    normalization: status === RegionExecutionStatus.RECOGNIZED ? { predicted: 'a', expected: 'b' } : null,
    diagnostics: {},
    metadata: {}
  }
}

function inputFor(statuses = [RegionExecutionStatus.RECOGNIZED]) {
  const run = rawRun()
  const rawSamples = statuses.map((status, index) => rawSample('doc-01', `region-0${index + 1}`, status, index))
  const sampleScores = statuses.map((status, index) => sampleScore('doc-01', `region-0${index + 1}`, status))
  return {
    runtimeScoringResult: {
      sampleScores,
      summary: {},
      normalizationPolicy: { id: 'normalizer', version: '1.0.0', parameters: { mode: 'strict' } },
      scorer: { id: 'scorer', version: '1.0.0', parameters: { metrics: ['cer'] } }
    },
    rawRun: run,
    rawSamples,
    scoredResultDescriptor: {
      artifactId: 'scored-result-001',
      contentHash: `sha256:${'9'.repeat(64)}`,
      createdAt: CREATED_AT,
      scoredResultId: 'scored-result-001',
      normalizationPolicy: { id: 'normalizer', version: '1.0.0', parameters: { mode: 'strict' } },
      scorer: { id: 'scorer', version: '1.0.0', parameters: { metrics: ['cer'] } },
      futureDescriptorField: { retained: true }
    }
  }
}

describe('Region OCR scored artifact writer', () => {
  it.each([
    RegionExecutionStatus.RECOGNIZED,
    RegionExecutionStatus.FAILED,
    RegionExecutionStatus.CANCELLED,
    RegionExecutionStatus.SKIPPED
  ])('writes %s sample artifacts', (status) => {
    const input = inputFor([status])
    const artifact = createScoredResultArtifact(input)

    expect(artifact.samples).toEqual([{ sampleRef: artifactRef(input.rawSamples[0]), status, metrics: input.runtimeScoringResult.sampleScores[0].metrics }])
    expect(validateBenchmarkArtifact(artifact)).toMatchObject({ valid: true, errors: [] })
  })

  it('writes mixed statuses preserving runtime order', () => {
    const input = inputFor([
      RegionExecutionStatus.SKIPPED,
      RegionExecutionStatus.RECOGNIZED,
      RegionExecutionStatus.FAILED,
      RegionExecutionStatus.CANCELLED
    ])
    const artifact = createScoredResultArtifact(input)

    expect(artifact.samples.map(({ status }) => status)).toEqual(['skipped', 'recognized', 'failed', 'cancelled'])
    expect(artifact.samples.map(({ sampleRef }) => sampleRef.artifactId)).toEqual([
      'raw-sample-001',
      'raw-sample-002',
      'raw-sample-003',
      'raw-sample-004'
    ])
  })

  it('resolves sampleRef by runtime document and region identity', () => {
    const input = inputFor([RegionExecutionStatus.RECOGNIZED, RegionExecutionStatus.SKIPPED])
    input.rawSamples.reverse()

    expect(() => createScoredResultArtifact(input)).toThrow(ScoredArtifactWriterInputValidationError)
  })

  it('preserves descriptor-owned fields and unknown descriptor fields', () => {
    const input = inputFor()
    const artifact = createScoredResultArtifact(input)

    expect(artifact).toMatchObject({
      artifactId: input.scoredResultDescriptor.artifactId,
      contentHash: input.scoredResultDescriptor.contentHash,
      createdAt: input.scoredResultDescriptor.createdAt,
      scoredResultId: input.scoredResultDescriptor.scoredResultId,
      normalizationPolicy: input.scoredResultDescriptor.normalizationPolicy,
      scorer: input.scoredResultDescriptor.scorer,
      futureDescriptorField: { retained: true }
    })
    expect(Object.isFrozen(artifact.futureDescriptorField)).toBe(true)
  })

  it('derives rawRunRef and corpusRef', () => {
    const input = inputFor()
    const artifact = writeScoredArtifact(input)

    expect(artifact.rawRunRef).toEqual(artifactRef(input.rawRun))
    expect(artifact.corpusRef).toEqual(input.rawRun.corpusRef)
  })

  it('deep-freezes returned artifact and preserves runtime metric values', () => {
    const input = inputFor()
    const metrics = input.runtimeScoringResult.sampleScores[0].metrics
    const artifact = createScoredResultArtifact(input)

    expect(Object.isFrozen(artifact)).toBe(true)
    expect(Object.isFrozen(artifact.samples)).toBe(true)
    expect(Object.isFrozen(artifact.samples[0])).toBe(true)
    expect(Object.isFrozen(artifact.samples[0].metrics)).toBe(true)
    expect(artifact.samples[0].metrics).toEqual(metrics)
  })

  it('aborts when writer input validation fails', () => {
    const input = inputFor()
    input.scoredResultDescriptor.contentHash = 'bad'

    expect(() => createScoredResultArtifact(input)).toThrow(ScoredArtifactWriterInputValidationError)
  })

  it('aborts runtime metric incompatibility during writer input validation', () => {
    const input = inputFor()
    input.runtimeScoringResult.sampleScores[0].metrics = { cer: 0 }

    expect(() => createScoredResultArtifact(input)).toThrow(ScoredArtifactWriterInputValidationError)
  })

  it('does not mutate inputs', () => {
    const input = inputFor()
    const before = clone(input)

    createScoredResultArtifact(input)

    expect(input).toEqual(before)
  })

  it('produces deterministic output', () => {
    const input = inputFor([RegionExecutionStatus.RECOGNIZED, RegionExecutionStatus.SKIPPED])

    expect(createScoredResultArtifact(clone(input))).toEqual(createScoredResultArtifact(clone(input)))
  })
})
