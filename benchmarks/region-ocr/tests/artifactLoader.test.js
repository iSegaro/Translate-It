import { describe, expect, it } from 'vitest'

import { createBenchmarkCorpusModel } from '../corpus/index.js'
import { RegionExecutionStatus } from '../execution-results/index.js'
import {
  BenchmarkArtifactLoaderValidationError,
  createBenchmarkArtifactLoader,
  loadBenchmarkArtifact,
  loadBenchmarkArtifactBundle,
  validateLoadedArtifact
} from '../artifacts/index.js'
import { writeRawArtifacts } from '../raw-artifacts/index.js'
import { ARTIFACT_TYPES } from '../schemas/index.js'

const CREATED_AT = '2026-07-15T12:30:45.123Z'
const HASHES = Object.freeze({
  corpus: `sha256:${'a'.repeat(64)}`,
  run: `sha256:${'b'.repeat(64)}`,
  sample1: `sha256:${'c'.repeat(64)}`,
  sample2: `sha256:${'d'.repeat(64)}`,
  model: `sha256:${'1'.repeat(64)}`
})

function executionResult(documentId, regionId, status, payload = {}) {
  return { documentId, regionId, status, payload }
}

function createArtifacts() {
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
  return writeRawArtifacts({
    corpus,
    runResult,
    runDescriptor: {
      artifactId: 'raw-run-001',
      contentHash: HASHES.run,
      createdAt: CREATED_AT,
      runId: 'run-001',
      policy: { id: 'candidate-a', version: '1.0.0', parameters: {} },
      environment: {
        browser: { name: 'chromium', version: '126.0.0' },
        os: 'linux',
        pdfjsVersion: '6.0.227',
        tesseractVersion: '7.0.0',
        modelHashes: { eng: HASHES.model }
      },
      execution: { seed: 'seed-001', runModes: ['warm'], repetitions: 1, parallelism: 1 }
    },
    sampleDescriptors: regionResults.map((result, index) => ({
      artifactId: `raw-sample-00${index + 1}`,
      contentHash: index === 0 ? HASHES.sample1 : HASHES.sample2,
      createdAt: CREATED_AT,
      executionResult: result,
      runMode: 'warm',
      sampleIndex: index,
      renderPlan: { scale: 2 },
      timingMs: { pageResolution: 1, render: 2, ocr: 3, total: 6 },
      raster: { width: 100, height: 50, pixelCount: 5000, rgbaBytes: 20000 },
      memory: { peakDeltaBytes: null, measurementMethod: null },
      ...(index === 0 ? { recognition: { rawOutput: { text: 'raw' } } } : {})
    }))
  })
}

function clone(value) {
  return structuredClone(value)
}

describe('Region OCR benchmark artifact loader', () => {
  it('loads and freezes a single RAW_RUN artifact', () => {
    const { run } = createArtifacts()
    const loaded = loadBenchmarkArtifact(clone(run))

    expect(loaded).toMatchObject({ artifactType: ARTIFACT_TYPES.RAW_RUN, artifactId: 'raw-run-001' })
    expect(Object.isFrozen(loaded)).toBe(true)
  })

  it('loads and freezes a single RAW_SAMPLE artifact preserving unknown fields', () => {
    const { samples } = createArtifacts()
    const sample = clone(samples[0])
    sample.futureField = { retained: true }
    const loaded = loadBenchmarkArtifact(sample)

    expect(loaded.futureField.retained).toBe(true)
    expect(Object.isFrozen(loaded.futureField)).toBe(true)
  })

  it('loads RAW_RUN plus RAW_SAMPLE bundle deterministically', () => {
    const { run, samples } = createArtifacts()
    const bundle = loadBenchmarkArtifactBundle([clone(run), clone(samples[1]), clone(samples[0])])

    expect(bundle.artifacts.map(({ artifactId }) => artifactId)).toEqual([
      'raw-run-001',
      'raw-sample-002',
      'raw-sample-001'
    ])
    expect(Object.isFrozen(bundle)).toBe(true)
    expect(Object.isFrozen(bundle.artifacts)).toBe(true)
    expect(Object.isFrozen(bundle.artifacts[1])).toBe(true)
  })

  it('loads RAW_RUN-only bundle when no samples completed', () => {
    const { run } = createArtifacts()
    const bundle = loadBenchmarkArtifactBundle([clone(run)])

    expect(bundle.artifacts).toHaveLength(1)
    expect(bundle.artifacts[0]).toMatchObject({ artifactType: ARTIFACT_TYPES.RAW_RUN })
    expect(Object.isFrozen(bundle.artifacts[0])).toBe(true)
  })

  it('compares corpusRef structurally without property-order dependence', () => {
    const { run, samples } = createArtifacts()
    const sample = clone(samples[0])
    sample.corpusRef = {
      contentHash: run.corpusRef.contentHash,
      schemaVersion: run.corpusRef.schemaVersion,
      artifactId: run.corpusRef.artifactId,
      artifactType: run.corpusRef.artifactType
    }

    expect(() => loadBenchmarkArtifactBundle([clone(run), sample])).not.toThrow()
  })

  it('rejects duplicate artifact IDs and duplicate sample IDs', () => {
    const { run, samples } = createArtifacts()
    const duplicateArtifact = clone(samples[1])
    duplicateArtifact.artifactId = samples[0].artifactId
    duplicateArtifact.sampleId = samples[0].sampleId

    expect(() => loadBenchmarkArtifactBundle([clone(run), clone(samples[0]), duplicateArtifact])).toThrow(
      BenchmarkArtifactLoaderValidationError
    )
    try {
      loadBenchmarkArtifactBundle([clone(run), clone(samples[0]), duplicateArtifact])
    } catch (caught) {
      expect(caught.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate_artifact_id' }),
        expect.objectContaining({ code: 'duplicate_sample_id' })
      ]))
    }
  })

  it('rejects duplicate document/region/sample identities', () => {
    const { run, samples } = createArtifacts()
    const duplicate = clone(samples[1])
    duplicate.caseRef = clone(samples[0].caseRef)
    duplicate.sampleIndex = samples[0].sampleIndex

    expect(() => loadBenchmarkArtifactBundle([clone(run), clone(samples[0]), duplicate])).toThrow(
      BenchmarkArtifactLoaderValidationError
    )
  })

  it('rejects unsupported schema versions', () => {
    const { run } = createArtifacts()
    const invalid = clone(run)
    invalid.schemaVersion = '2.0.0'

    expect(validateLoadedArtifact(invalid).errors).toContainEqual(expect.objectContaining({
      code: 'unsupported_schema_version',
      path: '$.schemaVersion'
    }))
  })

  it('rejects incompatible artifact combinations', () => {
    const { run, samples } = createArtifacts()
    const report = {
      schemaVersion: '1.0.0',
      artifactType: ARTIFACT_TYPES.REPORT_MANIFEST,
      artifactId: 'report-001',
      contentHash: `sha256:${'e'.repeat(64)}`,
      createdAt: CREATED_AT,
      reportId: 'report-001',
      sourceRefs: [{ artifactType: run.artifactType, artifactId: run.artifactId, schemaVersion: run.schemaVersion, contentHash: run.contentHash }],
      generatedBy: { id: 'reporter', version: '1.0.0', parameters: {} },
      files: [{ format: 'json', path: 'reports/report.json', contentHash: `sha256:${'f'.repeat(64)}` }]
    }

    expect(() => loadBenchmarkArtifactBundle([clone(run), clone(samples[0]), report])).toThrow(
      BenchmarkArtifactLoaderValidationError
    )
  })

  it('rejects missing or multiple RAW_RUN artifacts', () => {
    const { run, samples } = createArtifacts()

    expect(() => loadBenchmarkArtifactBundle([clone(samples[0])])).toThrow(BenchmarkArtifactLoaderValidationError)
    expect(() => loadBenchmarkArtifactBundle([clone(run), clone(run), clone(samples[0])])).toThrow(
      BenchmarkArtifactLoaderValidationError
    )
  })

  it('rejects samples referencing a different RAW_RUN or corpusRef', () => {
    const { run, samples } = createArtifacts()
    const badRunRef = clone(samples[0])
    badRunRef.runRef.contentHash = `sha256:${'9'.repeat(64)}`
    const badCorpusRef = clone(samples[1])
    badCorpusRef.corpusRef.contentHash = `sha256:${'8'.repeat(64)}`

    expect(() => loadBenchmarkArtifactBundle([clone(run), badRunRef, badCorpusRef])).toThrow(
      BenchmarkArtifactLoaderValidationError
    )
  })

  it('accepts samples with policy structurally matching RAW_RUN policy', () => {
    const { run, samples } = createArtifacts()
    const sample = clone(samples[0])
    sample.policy = {
      version: run.policy.version,
      parameters: { ...run.policy.parameters },
      id: run.policy.id
    }

    expect(() => loadBenchmarkArtifactBundle([clone(run), sample])).not.toThrow()
  })

  it.each([
    ['id', (policy) => ({ ...policy, id: 'candidate-b' })],
    ['version', (policy) => ({ ...policy, version: '2.0.0' })],
    ['parameters', (policy) => ({ ...policy, parameters: { different: true } })]
  ])('rejects sample policy mismatch by %s', (_, mutatePolicy) => {
    const { run, samples } = createArtifacts()
    const sample = clone(samples[0])
    sample.policy = mutatePolicy(sample.policy)

    expect(() => loadBenchmarkArtifactBundle([clone(run), sample])).toThrow(BenchmarkArtifactLoaderValidationError)
    try {
      loadBenchmarkArtifactBundle([clone(run), sample])
    } catch (caught) {
      expect(caught.errors).toContainEqual(expect.objectContaining({
        code: 'incompatible_policy',
        path: '$[1].policy'
      }))
    }
  })

  it('returns deterministic loader errors', () => {
    const { run, samples } = createArtifacts()
    const invalid = [clone(run), clone(run), clone(samples[0])]

    const first = (() => {
      try { loadBenchmarkArtifactBundle(clone(invalid)) } catch (caught) { return caught.errors }
    })()
    const second = (() => {
      try { loadBenchmarkArtifactBundle(clone(invalid)) } catch (caught) { return caught.errors }
    })()

    expect(second).toEqual(first)
    expect(first.map(({ path }) => path)).toEqual([...first.map(({ path }) => path)].sort())
  })

  it('creates an injectable loader facade', () => {
    const loader = createBenchmarkArtifactLoader()
    const { run } = createArtifacts()

    expect(loader.loadArtifact(clone(run))).toMatchObject({ artifactId: 'raw-run-001' })
  })
})
