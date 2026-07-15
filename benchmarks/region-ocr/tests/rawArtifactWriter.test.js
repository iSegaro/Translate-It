import { describe, expect, it } from 'vitest'

import { createBenchmarkCorpusModel } from '../corpus/index.js'
import { RegionExecutionStatus } from '../execution-results/index.js'
import {
  createRawRunArtifact,
  createRawSampleArtifact,
  writeRawArtifacts
} from '../raw-artifacts/index.js'
import { ARTIFACT_TYPES, BenchmarkArtifactValidationError, validateBenchmarkArtifact } from '../schemas/index.js'

const CREATED_AT = '2026-07-15T12:30:45.123Z'
const HASHES = Object.freeze({
  corpus: `sha256:${'a'.repeat(64)}`,
  run: `sha256:${'b'.repeat(64)}`,
  recognized: `sha256:${'c'.repeat(64)}`,
  failed: `sha256:${'d'.repeat(64)}`,
  cancelled: `sha256:${'e'.repeat(64)}`,
  skipped: `sha256:${'f'.repeat(64)}`,
  model: `sha256:${'1'.repeat(64)}`
})

function executionResult(documentId, regionId, status, payload) {
  return { documentId, regionId, status, payload }
}

function createInput() {
  const corpus = createBenchmarkCorpusModel({
    schemaVersion: '1.0.0',
    artifactType: ARTIFACT_TYPES.CORPUS_MANIFEST,
    artifactId: 'corpus-artifact',
    contentHash: HASHES.corpus,
    createdAt: CREATED_AT,
    corpusId: 'corpus-01',
    corpusVersion: '1.0.0',
    normalizationPolicy: { id: 'unicode-nfc', version: '1.0.0', parameters: {} },
    documents: []
  })
  const regionResults = [
    executionResult('doc-01', 'region-01', RegionExecutionStatus.RECOGNIZED, { text: 'raw text', lines: [] }),
    executionResult('doc-01', 'region-02', RegionExecutionStatus.FAILED, {
      reason: { name: 'Error', message: 'engine failed', code: 'engine_failed' },
      raw: { retained: true }
    }),
    executionResult('doc-02', 'region-01', RegionExecutionStatus.CANCELLED, { cancelledBy: 'executor' }),
    executionResult('doc-02', 'region-02', RegionExecutionStatus.SKIPPED, { reason: 'fixture-disabled' })
  ]
  const runResult = {
    status: 'completed',
    totalRegions: 4,
    recognizedRegions: 1,
    failedRegions: 1,
    skippedRegions: 1,
    cancelledRegions: 1,
    runCancelledRegions: 0,
    unscheduledRegions: 0,
    regionResults
  }
  const runDescriptor = {
    artifactId: 'raw-run-001',
    contentHash: HASHES.run,
    createdAt: CREATED_AT,
    runId: 'run-001',
    policy: { id: 'candidate-a', version: '1.0.0', parameters: { ownedByCaller: true } },
    environment: {
      browser: { name: 'chromium', version: '126.0.0' },
      os: 'linux',
      pdfjsVersion: '6.0.227',
      tesseractVersion: '7.0.0',
      modelHashes: { eng: HASHES.model }
    },
    execution: { seed: 'seed-001', runModes: ['warm'], repetitions: 1, parallelism: 1 },
    futureRunDescriptor: { retained: true }
  }
  const hashes = [HASHES.recognized, HASHES.failed, HASHES.cancelled, HASHES.skipped]
  const sampleDescriptors = regionResults.map((result, index) => ({
    artifactId: `raw-sample-00${index + 1}`,
    contentHash: hashes[index],
    createdAt: CREATED_AT,
    executionResult: result,
    runMode: 'warm',
    sampleIndex: index,
    renderPlan: { scale: 2, source: 'descriptor' },
    timingMs: { pageResolution: 1, render: 2, ocr: 3, total: 6 },
    raster: { width: 100, height: 50, pixelCount: 5000, rgbaBytes: 20000 },
    memory: { peakDeltaBytes: null, measurementMethod: null },
    futureSampleDescriptor: { retained: true }
  }))
  sampleDescriptors[0].recognition = { rawOutput: { opaqueRuntimeShape: regionResults[0].payload } }
  sampleDescriptors[1].error = { name: 'DescriptorFailure', message: 'descriptor owned', code: 'descriptor_failed' }

  return { corpus, runResult, runDescriptor, sampleDescriptors }
}

function refOf(artifact) {
  return {
    artifactType: artifact.artifactType,
    artifactId: artifact.artifactId,
    schemaVersion: artifact.schemaVersion,
    contentHash: artifact.contentHash
  }
}

describe('Region OCR raw artifact writer', () => {
  it('generates a validated immutable RAW_RUN artifact with derived corpusRef', () => {
    const input = createInput()
    const run = createRawRunArtifact({ corpus: input.corpus, runDescriptor: input.runDescriptor })

    expect(run).toMatchObject({
      artifactType: ARTIFACT_TYPES.RAW_RUN,
      artifactId: 'raw-run-001',
      runId: 'run-001',
      corpusRef: refOf(input.corpus.manifest)
    })
    expect(run).not.toHaveProperty('sampleRefs')
    expect(validateBenchmarkArtifact(run)).toMatchObject({ valid: true, errors: [] })
    expect(Object.isFrozen(run.futureRunDescriptor)).toBe(true)
  })

  it('generates validated RAW_SAMPLE artifacts with derived runRef and corpusRef', () => {
    const input = createInput()
    const run = createRawRunArtifact({ corpus: input.corpus, runDescriptor: input.runDescriptor })
    const sample = createRawSampleArtifact({
      corpus: input.corpus,
      rawRun: run,
      sampleDescriptor: input.sampleDescriptors[0]
    })

    expect(sample).toMatchObject({
      artifactType: ARTIFACT_TYPES.RAW_SAMPLE,
      artifactId: 'raw-sample-001',
      sampleId: 'raw-sample-001',
      runRef: refOf(run),
      corpusRef: refOf(input.corpus.manifest),
      caseRef: { documentId: 'doc-01', regionId: 'region-01' },
      status: 'recognized'
    })
    expect(sample).not.toHaveProperty('executionResult')
    expect(sample).not.toHaveProperty('payload')
    expect(validateBenchmarkArtifact(sample)).toMatchObject({ valid: true, errors: [] })
    expect(Object.isFrozen(sample.futureSampleDescriptor)).toBe(true)
  })

  it('copies descriptor-owned recognition and error without interpreting runtime payload', () => {
    const { samples } = writeRawArtifacts(createInput())

    expect(samples.map(({ status }) => status)).toEqual(['recognized', 'failed', 'cancelled', 'skipped'])
    expect(samples[0].recognition).toEqual({ rawOutput: { opaqueRuntimeShape: { text: 'raw text', lines: [] } } })
    expect(samples[1].error).toEqual({ name: 'DescriptorFailure', message: 'descriptor owned', code: 'descriptor_failed' })
    expect(samples[0]).not.toHaveProperty('executionResult')
    expect(samples[0]).not.toHaveProperty('payload')
    expect(samples[1]).not.toHaveProperty('executionResult')
    expect(samples[1]).not.toHaveProperty('payload')
    expect(samples[2]).not.toHaveProperty('recognition')
    expect(samples[2]).not.toHaveProperty('error')
    expect(samples[2]).not.toHaveProperty('executionResult')
    expect(samples[2]).not.toHaveProperty('payload')
    expect(samples[3]).not.toHaveProperty('recognition')
    expect(samples[3]).not.toHaveProperty('error')
    expect(samples[3]).not.toHaveProperty('executionResult')
    expect(samples[3]).not.toHaveProperty('payload')
  })

  it('rejects invalid descriptors before artifact creation', () => {
    const input = createInput()
    delete input.sampleDescriptors[0].recognition

    expect(() => writeRawArtifacts(input)).toThrow('Raw artifact writer input validation failed')
  })

  it('preserves descriptor ordering without sorting', () => {
    const input = createInput()
    input.runResult.regionResults.reverse()
    input.sampleDescriptors.reverse()

    const { samples } = writeRawArtifacts(input)

    expect(samples.map(({ artifactId }) => artifactId)).toEqual([
      'raw-sample-004',
      'raw-sample-003',
      'raw-sample-002',
      'raw-sample-001'
    ])
  })

  it('returns immutable artifacts and immutable output container', () => {
    const output = writeRawArtifacts(createInput())

    expect(Object.isFrozen(output)).toBe(true)
    expect(Object.isFrozen(output.run)).toBe(true)
    expect(Object.isFrozen(output.samples)).toBe(true)
    expect(Object.isFrozen(output.samples[0].recognition.rawOutput)).toBe(true)
    expect(() => {
      output.samples[0].recognition.rawOutput.opaqueRuntimeShape.text = 'mutated'
    }).toThrow(TypeError)
  })

  it('propagates artifact validation failures deterministically', () => {
    const input = createInput()
    delete input.runDescriptor.environment.pdfjsVersion

    expect(() => writeRawArtifacts(input)).toThrow(BenchmarkArtifactValidationError)
  })
})
