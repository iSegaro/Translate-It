import { describe, expect, it } from 'vitest'

import { createBenchmarkCorpusModel } from '../corpus/index.js'
import { RegionExecutionStatus } from '../execution-results/index.js'
import {
  RawArtifactWriterInputValidationError,
  createRawRunDescriptor,
  createRawSampleDescriptor,
  finalizeRawArtifactWriterInput,
  validateRawArtifactWriterInput
} from '../raw-artifacts/index.js'

const CREATED_AT = '2026-07-15T12:30:45.123Z'
const HASHES = Object.freeze({
  run: `sha256:${'1'.repeat(64)}`,
  sample1: `sha256:${'2'.repeat(64)}`,
  sample2: `sha256:${'3'.repeat(64)}`
})

function executionResult(documentId, regionId, status = RegionExecutionStatus.RECOGNIZED, payload = {}) {
  return { documentId, regionId, status, payload }
}

function createInput() {
  const corpus = createBenchmarkCorpusModel({
    artifactId: 'corpus-artifact',
    corpusId: 'corpus-01',
    corpusVersion: '1.0.0',
    schemaVersion: '1.0.0',
    contentHash: `sha256:${'a'.repeat(64)}`,
    documents: []
  })
  const regionResults = [
    executionResult('doc-01', 'region-01', RegionExecutionStatus.RECOGNIZED, { text: 'raw' }),
    executionResult('doc-01', 'region-02', RegionExecutionStatus.SKIPPED, { reason: 'fixture' })
  ]
  const runResult = {
    status: 'completed',
    totalRegions: 2,
    recognizedRegions: 1,
    failedRegions: 0,
    skippedRegions: 1,
    cancelledRegions: 0,
    runCancelledRegions: 0,
    unscheduledRegions: 0,
    regionResults
  }
  const runDescriptor = createRawRunDescriptor({
    artifactId: 'raw-run-001',
    contentHash: HASHES.run,
    createdAt: CREATED_AT,
    runId: 'run-001',
    policy: { id: 'candidate-a', version: '1.0.0', parameters: { ownedByCaller: true } },
    environment: { browser: { name: 'chromium', version: '126' } },
    execution: { seed: 'seed-001', runModes: ['warm'], repetitions: 1, parallelism: 1 }
  })
  const sampleDescriptors = regionResults.map((result, index) => createRawSampleDescriptor({
    artifactId: `raw-sample-00${index + 1}`,
    contentHash: index === 0 ? HASHES.sample1 : HASHES.sample2,
    createdAt: CREATED_AT,
    executionResult: result,
    runMode: 'warm',
    sampleIndex: index,
    renderPlan: { scale: 2 },
    timingMs: { pageResolution: 1, render: 2, ocr: 3, total: 6 },
    raster: { width: 100, height: 50, pixelCount: 5000, rgbaBytes: 20000 },
    memory: { peakDeltaBytes: null, measurementMethod: null }
  }))

  return { corpus, runResult, runDescriptor, sampleDescriptors }
}

describe('Region OCR raw artifact writer input contract', () => {
  it('accepts a valid descriptor set', () => {
    expect(validateRawArtifactWriterInput(createInput())).toMatchObject({ valid: true, errors: [] })
  })

  it('rejects duplicate artifact IDs across run and sample descriptors', () => {
    const input = createInput()
    input.sampleDescriptors[0].artifactId = input.runDescriptor.artifactId

    expect(validateRawArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_artifact_id',
      path: '$.sampleDescriptors[0].artifactId'
    }))
  })

  it('rejects duplicate sample indexes', () => {
    const input = createInput()
    input.sampleDescriptors[1].sampleIndex = input.sampleDescriptors[0].sampleIndex

    expect(validateRawArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_sample_index',
      path: '$.sampleDescriptors[1].sampleIndex'
    }))
  })

  it('rejects mismatched sample count', () => {
    const input = createInput()
    input.sampleDescriptors.pop()

    expect(validateRawArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'sample_count_mismatch',
      path: '$.sampleDescriptors'
    }))
  })

  it('reports ordering violations without using order for identity matching', () => {
    const input = createInput()
    input.sampleDescriptors.reverse()

    const errors = validateRawArtifactWriterInput(input).errors
    expect(errors).toContainEqual(expect.objectContaining({
      code: 'execution_result_order_mismatch',
      path: '$.sampleDescriptors[0].executionResult'
    }))
    expect(errors).toContainEqual(expect.objectContaining({
      code: 'execution_result_order_mismatch',
      path: '$.sampleDescriptors[1].executionResult'
    }))
    expect(errors).not.toContainEqual(expect.objectContaining({ code: 'execution_result_not_found' }))
    expect(errors).not.toContainEqual(expect.objectContaining({ code: 'execution_result_mismatch' }))
  })

  it('rejects descriptor execution identities missing from runResult', () => {
    const input = createInput()
    input.sampleDescriptors[0].executionResult = executionResult('doc-99', 'region-99')

    expect(validateRawArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'execution_result_not_found',
      path: '$.sampleDescriptors[0].executionResult'
    }))
  })

  it('rejects descriptor execution status mismatch by identity', () => {
    const input = createInput()
    input.sampleDescriptors[0].executionResult = executionResult('doc-01', 'region-01', RegionExecutionStatus.FAILED)

    expect(validateRawArtifactWriterInput(input).errors).toContainEqual(expect.objectContaining({
      code: 'execution_result_mismatch',
      path: '$.sampleDescriptors[0].executionResult'
    }))
  })

  it('rejects duplicate execution identities in runResult and sample descriptors', () => {
    const input = createInput()
    input.runResult.regionResults[1] = executionResult('doc-01', 'region-01')
    input.sampleDescriptors[1].executionResult = executionResult('doc-01', 'region-01')

    const errors = validateRawArtifactWriterInput(input).errors
    expect(errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_execution_identity',
      path: '$.runResult.regionResults[1]'
    }))
    expect(errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_execution_identity',
      path: '$.sampleDescriptors[1].executionResult'
    }))
  })

  it('rejects invalid BenchmarkRunResult accounting summaries', () => {
    const input = createInput()
    input.runResult.recognizedRegions = 2
    input.runResult.unscheduledRegions = 1

    const errors = validateRawArtifactWriterInput(input).errors
    expect(errors).toContainEqual(expect.objectContaining({
      code: 'counter_mismatch',
      path: '$.runResult.recognizedRegions'
    }))
    expect(errors).toContainEqual(expect.objectContaining({
      code: 'accounting_invariant_failed',
      path: '$.runResult'
    }))
  })

  it('rejects caller-provided references that the writer must derive', () => {
    const input = createInput()
    input.runDescriptor.corpusRef = { forbidden: true }
    input.sampleDescriptors[0].runRef = { forbidden: true }
    input.sampleDescriptors[0].corpusRef = { forbidden: true }

    expect(validateRawArtifactWriterInput(input).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'forbidden_field', path: '$.runDescriptor.corpusRef' }),
      expect.objectContaining({ code: 'forbidden_field', path: '$.sampleDescriptors[0].runRef' }),
      expect.objectContaining({ code: 'forbidden_field', path: '$.sampleDescriptors[0].corpusRef' })
    ]))
  })

  it('validates hash, timestamp, run mode, and required metadata', () => {
    const input = createInput()
    input.runDescriptor.contentHash = 'bad'
    input.runDescriptor.createdAt = '2026-02-30T12:00:00Z'
    input.sampleDescriptors[0].runMode = 'hot'
    delete input.sampleDescriptors[0].renderPlan

    expect(validateRawArtifactWriterInput(input).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_hash', path: '$.runDescriptor.contentHash' }),
      expect.objectContaining({ code: 'invalid_timestamp', path: '$.runDescriptor.createdAt' }),
      expect.objectContaining({ code: 'invalid_run_mode', path: '$.sampleDescriptors[0].runMode' }),
      expect.objectContaining({ code: 'missing_required_field', path: '$.sampleDescriptors[0].renderPlan' })
    ]))
  })

  it('preserves unknown fields and deeply freezes finalized descriptors', () => {
    const input = createInput()
    input.runDescriptor.futureRunMetadata = { retained: true }
    input.sampleDescriptors[0].futureSampleMetadata = { retained: true }

    const finalized = finalizeRawArtifactWriterInput(input)

    expect(finalized).toBe(input)
    expect(finalized.runDescriptor.futureRunMetadata.retained).toBe(true)
    expect(finalized.sampleDescriptors[0].futureSampleMetadata.retained).toBe(true)
    expect(Object.isFrozen(finalized.runDescriptor.futureRunMetadata)).toBe(true)
    expect(Object.isFrozen(finalized.sampleDescriptors[0].futureSampleMetadata)).toBe(true)
    expect(() => {
      finalized.sampleDescriptors[0].futureSampleMetadata.retained = false
    }).toThrow(TypeError)
  })

  it('throws structured errors instead of freezing invalid descriptors', () => {
    const input = createInput()
    input.sampleDescriptors[0].artifactId = '../bad'

    expect(() => finalizeRawArtifactWriterInput(input)).toThrow(RawArtifactWriterInputValidationError)
    try {
      finalizeRawArtifactWriterInput(input)
    } catch (caught) {
      expect(caught.errors).toContainEqual(expect.objectContaining({
        code: 'invalid_identifier',
        path: '$.sampleDescriptors[0].artifactId'
      }))
      expect(Object.isFrozen(input)).toBe(false)
    }
  })

  it('returns deterministic validation errors', () => {
    const input = createInput()
    input.sampleDescriptors[0].artifactId = '../bad'
    input.sampleDescriptors[0].contentHash = 'bad'
    input.sampleDescriptors[0].runMode = 'hot'

    const first = validateRawArtifactWriterInput(structuredClone(input)).errors
    const second = validateRawArtifactWriterInput(structuredClone(input)).errors

    expect(second).toEqual(first)
    expect(first.map(({ path }) => path)).toEqual([...first.map(({ path }) => path)].sort())
  })
})
