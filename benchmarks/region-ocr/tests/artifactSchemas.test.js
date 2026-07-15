import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_SCHEMAS,
  ARTIFACT_TYPES,
  BenchmarkArtifactValidationError,
  CONTENT_HASH_CONTRACT,
  SCHEMA_VERSIONS,
  finalizeBenchmarkArtifact,
  getBenchmarkArtifactSchema,
  getCurrentSchemaVersion,
  validateBenchmarkArtifact,
  validateBenchmarkArtifactBundle
} from '../schemas/index.js'

const HASHES = Object.freeze({
  corpus: `sha256:${'1'.repeat(64)}`,
  run: `sha256:${'2'.repeat(64)}`,
  sample: `sha256:${'3'.repeat(64)}`,
  scored: `sha256:${'4'.repeat(64)}`,
  comparison: `sha256:${'5'.repeat(64)}`,
  report: `sha256:${'6'.repeat(64)}`,
  pdf: `sha256:${'7'.repeat(64)}`,
  truth: `sha256:${'8'.repeat(64)}`,
  model: `sha256:${'9'.repeat(64)}`,
  reportFile: `sha256:${'a'.repeat(64)}`
})

const CREATED_AT = '2026-07-15T12:30:45.123Z'

function artifactBase(artifactType, artifactId, contentHash) {
  return {
    schemaVersion: SCHEMA_VERSIONS[artifactType],
    artifactType,
    artifactId,
    contentHash,
    createdAt: CREATED_AT,
    extensions: { futureField: { retained: true } }
  }
}

function reference(artifact) {
  return {
    artifactType: artifact.artifactType,
    artifactId: artifact.artifactId,
    schemaVersion: artifact.schemaVersion,
    contentHash: artifact.contentHash
  }
}

function createArtifacts() {
  const corpus = {
    ...artifactBase(ARTIFACT_TYPES.CORPUS_MANIFEST, 'corpus-v1', HASHES.corpus),
    corpusId: 'region-ocr-corpus',
    corpusVersion: '1.0.0',
    normalizationPolicy: { id: 'unicode-nfc', version: '1.0.0', parameters: {} },
    documents: [{
      id: 'vector-en-01',
      file: 'pdfs/vector-en-01.pdf',
      contentHash: HASHES.pdf,
      documentType: 'vector',
      tags: ['english', 'vector'],
      regions: [{
        id: 'paragraph-01',
        pageNumber: 1,
        language: 'eng',
        rotation: 0,
        regionCategory: 'medium',
        pdfRegion: { left: 10.25, top: 200.5, right: 300.75, bottom: 100.125 },
        groundTruth: {
          path: 'ground-truth/vector-en-01/paragraph-01.txt',
          contentHash: HASHES.truth
        },
        tags: ['paragraph']
      }]
    }]
  }

  const run = {
    ...artifactBase(ARTIFACT_TYPES.RAW_RUN, 'run-001', HASHES.run),
    runId: 'run-001',
    corpusRef: reference(corpus),
    policy: { id: 'candidate-a', version: '1.0.0', parameters: { opaque: true } },
    environment: {
      browser: { name: 'chromium', version: '126.0.0' },
      os: 'linux',
      cpu: 'test-cpu',
      memoryBytes: 16_000_000_000,
      commit: 'abcdef1234567',
      pdfjsVersion: '6.0.227',
      tesseractVersion: '7.0.0',
      modelHashes: { eng: HASHES.model }
    },
    execution: {
      seed: 'seed-001',
      runModes: ['cold', 'warm'],
      repetitions: 3,
      parallelism: 1
    }
  }

  const sample = {
    ...artifactBase(ARTIFACT_TYPES.RAW_SAMPLE, 'sample-001', HASHES.sample),
    sampleId: 'sample-001',
    runRef: reference(run),
    corpusRef: reference(corpus),
    caseRef: { documentId: 'vector-en-01', regionId: 'paragraph-01' },
    policy: { id: 'candidate-a', version: '1.0.0', parameters: { opaque: true } },
    runMode: 'warm',
    sampleIndex: 0,
    renderPlan: { candidateDefinedValue: 2 },
    status: 'recognized',
    recognition: {
      rawOutput: {
        text: 'Exact OCR output\n',
        lines: [],
        confidence: 95
      }
    },
    timingMs: { pageResolution: 1, render: 2, ocr: 3, total: 6 },
    raster: { width: 100, height: 50, pixelCount: 5000, rgbaBytes: 20000 },
    memory: { peakDeltaBytes: null, measurementMethod: null }
  }
  const scored = {
    ...artifactBase(ARTIFACT_TYPES.SCORED_RESULT, 'score-001', HASHES.scored),
    scoredResultId: 'score-001',
    rawRunRef: reference(run),
    corpusRef: reference(corpus),
    normalizationPolicy: { id: 'unicode-nfc', version: '1.0.0', parameters: {} },
    scorer: { id: 'edit-distance', version: '1.0.0', parameters: {} },
    samples: [{
      sampleRef: reference(sample),
      status: 'recognized',
      metrics: { cer: 0, wer: 0, deletionRate: 0, rtlOrderCorrect: null }
    }]
  }

  const comparison = {
    ...artifactBase(ARTIFACT_TYPES.COMPARISON_RESULT, 'comparison-001', HASHES.comparison),
    comparisonId: 'comparison-001',
    leftRef: reference(scored),
    rightRef: reference(scored),
    comparisonAxes: ['policy'],
    compatibility: 'compatible',
    entries: [{
      caseId: 'vector-en-01/paragraph-01',
      metricId: 'cer',
      left: 0,
      right: 0,
      absoluteDelta: 0,
      relativeDelta: null
    }]
  }

  const report = {
    ...artifactBase(ARTIFACT_TYPES.REPORT_MANIFEST, 'report-001', HASHES.report),
    reportId: 'report-001',
    sourceRefs: [reference(comparison)],
    generatedBy: { id: 'markdown-reporter', version: '1.0.0', parameters: {} },
    files: [{
      format: 'markdown',
      path: 'reports/comparison-001.md',
      contentHash: HASHES.reportFile
    }]
  }

  return { corpus, run, sample, scored, comparison, report }
}

describe('Region OCR benchmark artifact schemas', () => {
  it('publishes one explicit current version for every artifact schema', () => {
    expect(Object.keys(ARTIFACT_SCHEMAS).sort()).toEqual(Object.values(ARTIFACT_TYPES).sort())
    for (const artifactType of Object.values(ARTIFACT_TYPES)) {
      expect(getCurrentSchemaVersion(artifactType)).toBe('1.0.0')
      expect(getBenchmarkArtifactSchema(artifactType, '1.0.0').additionalProperties).toBe(true)
      expect(Object.isFrozen(getBenchmarkArtifactSchema(artifactType, '1.0.0'))).toBe(true)
    }
  })

  it('defines contentHash canonical input without implementing hashing', () => {
    expect(CONTENT_HASH_CONTRACT).toEqual({
      field: 'contentHash',
      algorithm: 'sha256',
      canonicalSerialization: {
        deterministic: true,
        excludedRootFields: ['contentHash'],
        nestedContentHashFieldsIncluded: true,
        artifactReferenceHashesIncluded: true,
        provenanceHashesIncluded: true,
        includeCreatedAt: true,
        includeUnknownFields: true,
        serializerVersioning: 'schema-evolution'
      }
    })
    expect(CONTENT_HASH_CONTRACT.canonicalSerialization.excludedRootFields).not.toContain('createdAt')
  })

  it('limits contentHash exclusion to the root artifact field', () => {
    const artifact = {
      contentHash: HASHES.run,
      corpusRef: {
        artifactId: 'corpus-v1',
        contentHash: HASHES.corpus
      }
    }
    const contract = CONTENT_HASH_CONTRACT.canonicalSerialization

    expect(contract.excludedRootFields).toEqual(['contentHash'])
    expect(contract.nestedContentHashFieldsIncluded).toBe(true)
    expect(contract.artifactReferenceHashesIncluded).toBe(true)
    expect(contract.provenanceHashesIncluded).toBe(true)
    expect({ path: '$.contentHash', value: artifact.contentHash }).toMatchObject({ path: '$.contentHash' })
    expect({ path: '$.corpusRef.contentHash', value: artifact.corpusRef.contentHash }).toMatchObject({
      path: '$.corpusRef.contentHash',
      value: HASHES.corpus
    })
  })

  it('accepts valid artifacts for all six contracts', () => {
    for (const artifact of Object.values(createArtifacts())) {
      expect(validateBenchmarkArtifact(artifact)).toMatchObject({ valid: true, errors: [] })
    }
  })

  it.each(['recognized', 'failed', 'cancelled', 'skipped'])('accepts RAW_SAMPLE status %s', (status) => {
    const { sample } = createArtifacts()
    sample.status = status
    delete sample.recognition
    delete sample.error
    if (status === 'recognized') {
      sample.recognition = { rawOutput: { text: 'recognized text' } }
    }
    if (status === 'failed') {
      sample.error = { name: 'Error', message: 'failed' }
    }

    expect(validateBenchmarkArtifact(sample)).toMatchObject({ valid: true, errors: [] })
  })

  it('accepts skipped RAW_SAMPLE without recognition or error payload', () => {
    const { sample } = createArtifacts()
    sample.status = 'skipped'
    delete sample.recognition
    delete sample.error

    expect(validateBenchmarkArtifact(sample)).toMatchObject({
      valid: true,
      errors: []
    })
  })

  it('accepts SCORED_RESULT recognized sample with populated metrics', () => {
    const { scored } = createArtifacts()

    expect(validateBenchmarkArtifact(scored)).toMatchObject({ valid: true, errors: [] })
  })

  it('rejects SCORED_RESULT recognized sample with empty metrics', () => {
    const { scored } = createArtifacts()
    scored.samples[0].metrics = {}

    expect(validateBenchmarkArtifact(scored).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_required_field', path: '$.samples[0].metrics.cer' }),
      expect.objectContaining({ code: 'missing_required_field', path: '$.samples[0].metrics.wer' }),
      expect.objectContaining({ code: 'missing_required_field', path: '$.samples[0].metrics.deletionRate' }),
      expect.objectContaining({ code: 'missing_required_field', path: '$.samples[0].metrics.rtlOrderCorrect' })
    ]))
  })

  it.each(['failed', 'cancelled', 'skipped'])('accepts SCORED_RESULT %s sample with empty metrics', (status) => {
    const { scored } = createArtifacts()
    scored.samples[0].status = status
    scored.samples[0].metrics = {}

    expect(validateBenchmarkArtifact(scored)).toMatchObject({ valid: true, errors: [] })
  })

  it.each(['failed', 'cancelled', 'skipped'])('rejects SCORED_RESULT %s sample with populated metrics', (status) => {
    const { scored } = createArtifacts()
    scored.samples[0].status = status

    expect(validateBenchmarkArtifact(scored).errors).toContainEqual(expect.objectContaining({
      code: 'incompatible_status_metrics',
      path: '$.samples[0].metrics'
    }))
  })

  it('keeps RAW_RUN independently finalizable without RAW_SAMPLE references', () => {
    const { run } = createArtifacts()
    const schema = getBenchmarkArtifactSchema(ARTIFACT_TYPES.RAW_RUN, '1.0.0')

    expect(schema.required).not.toContain('sampleRefs')
    expect(schema.properties).not.toHaveProperty('sampleRefs')
    expect(run).not.toHaveProperty('sampleRefs')
    expect(validateBenchmarkArtifact(run)).toMatchObject({ valid: true, errors: [] })
    expect(finalizeBenchmarkArtifact(run)).toBe(run)
  })

  it('rejects missing required fields with structured errors', () => {
    const { corpus } = createArtifacts()
    delete corpus.documents

    expect(validateBenchmarkArtifact(corpus)).toMatchObject({
      valid: false,
      errors: [expect.objectContaining({
        code: 'missing_required_field',
        path: '$.documents'
      })]
    })
  })

  it.each([
    ['contentHash', 'sha256:abc'],
    ['contentHash', `sha256:${'A'.repeat(64)}`],
    ['contentHash', 'md5:00000000000000000000000000000000']
  ])('rejects malformed hash in %s', (field, value) => {
    const { corpus } = createArtifacts()
    corpus[field] = value

    expect(validateBenchmarkArtifact(corpus).errors).toContainEqual(expect.objectContaining({
      code: 'invalid_pattern',
      path: `$.${field}`
    }))
  })

  it('distinguishes malformed and unsupported schema versions', () => {
    const malformed = createArtifacts().corpus
    malformed.schemaVersion = 'v1'
    expect(validateBenchmarkArtifact(malformed).errors).toContainEqual(expect.objectContaining({
      code: 'invalid_pattern',
      path: '$.schemaVersion'
    }))

    const unsupported = createArtifacts().corpus
    unsupported.schemaVersion = '2.0.0'
    expect(validateBenchmarkArtifact(unsupported).errors).toContainEqual(expect.objectContaining({
      code: 'unsupported_schema_version',
      path: '$.schemaVersion'
    }))
  })

  it.each([
    ['createdAt', '2026-07-15'],
    ['createdAt', 'not-a-date'],
    ['createdAt', '2026-02-30T12:00:00Z']
  ])('rejects malformed timestamp in %s', (field, value) => {
    const { run } = createArtifacts()
    run[field] = value

    expect(validateBenchmarkArtifact(run).errors).toContainEqual(expect.objectContaining({
      code: expect.stringMatching(/invalid_(pattern|timestamp)/),
      path: `$.${field}`
    }))
  })

  it('rejects invalid enums and canonical region bounds', () => {
    const { corpus, sample, report } = createArtifacts()
    corpus.documents[0].documentType = 'unknown'
    corpus.documents[0].regions[0].pdfRegion.left = 400
    sample.status = 'unknown'
    report.files[0].format = 'pdf'

    expect(validateBenchmarkArtifact(corpus).errors.map(({ code }) => code)).toEqual([
      'invalid_enum',
      'invalid_region_bounds'
    ])
    expect(validateBenchmarkArtifact(sample).errors).toContainEqual(expect.objectContaining({ code: 'invalid_enum' }))
    expect(validateBenchmarkArtifact(report).errors).toContainEqual(expect.objectContaining({ code: 'invalid_enum' }))
  })

  it('rejects duplicate identifiers deterministically', () => {
    const { corpus, scored } = createArtifacts()
    corpus.documents.push(structuredClone(corpus.documents[0]))
    scored.samples.push(structuredClone(scored.samples[0]))

    expect(validateBenchmarkArtifact(corpus).errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_identifier',
      path: '$.documents[1]'
    }))
    expect(validateBenchmarkArtifact(scored).errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_identifier',
      path: '$.samples[1]'
    }))
  })

  it('rejects status data and reference types incompatible with artifact contracts', () => {
    const { sample } = createArtifacts()
    sample.status = 'failed'
    sample.runRef.artifactType = ARTIFACT_TYPES.CORPUS_MANIFEST

    const errors = validateBenchmarkArtifact(sample).errors
    expect(errors).toContainEqual(expect.objectContaining({ code: 'missing_failure', path: '$.error' }))
    expect(errors).toContainEqual(expect.objectContaining({
      code: 'incompatible_reference_type',
      path: '$.runRef.artifactType'
    }))
    expect(errors).toContainEqual(expect.objectContaining({
      code: 'incompatible_status_data',
      path: '$.recognition'
    }))
  })

  it('validates bundle references and duplicate artifact IDs', () => {
    const artifacts = createArtifacts()
    const validBundle = Object.values(artifacts)
    expect(validateBenchmarkArtifactBundle(validBundle)).toMatchObject({ valid: true, errors: [] })

    const broken = createArtifacts()
    broken.sample.runRef.contentHash = HASHES.report
    broken.report.artifactId = broken.comparison.artifactId
    const result = validateBenchmarkArtifactBundle(Object.values(broken))

    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'incompatible_reference' }))
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'duplicate_artifact_id' }))
  })

  it('rejects unresolved bundle references', () => {
    const { sample } = createArtifacts()
    const result = validateBenchmarkArtifactBundle([sample])

    expect(result.errors.filter(({ code }) => code === 'unresolved_reference')).toHaveLength(2)
  })

  it('preserves unknown fields and deeply freezes finalized artifacts', () => {
    const { corpus } = createArtifacts()
    corpus.futureTopLevel = { nested: { retained: true } }

    const validation = validateBenchmarkArtifact(corpus)
    expect(validation.valid).toBe(true)
    expect(validation.value).toBe(corpus)
    expect(validation.value.futureTopLevel.nested.retained).toBe(true)

    const finalized = finalizeBenchmarkArtifact(corpus)
    expect(finalized).toBe(corpus)
    expect(Object.isFrozen(finalized)).toBe(true)
    expect(Object.isFrozen(finalized.futureTopLevel.nested)).toBe(true)
    expect(() => {
      finalized.futureTopLevel.nested.retained = false
    }).toThrow(TypeError)
  })

  it('preserves hash-participating unknown fields on finalized artifacts', () => {
    const { run } = createArtifacts()
    run.futureHashInput = { includedByContract: true }

    const validation = validateBenchmarkArtifact(run)
    expect(validation.valid).toBe(true)
    expect(validation.value.futureHashInput.includedByContract).toBe(true)
    expect(CONTENT_HASH_CONTRACT.canonicalSerialization.includeUnknownFields).toBe(true)

    const finalized = finalizeBenchmarkArtifact(run)
    expect(Object.isFrozen(finalized.futureHashInput)).toBe(true)
  })

  it('keeps schema assumptions compatible with contentHash canonical input', () => {
    for (const artifactType of Object.values(ARTIFACT_TYPES)) {
      const schema = getBenchmarkArtifactSchema(artifactType, '1.0.0')
      expect(schema.required).toEqual(expect.arrayContaining(['contentHash', 'createdAt']))
      expect(schema.additionalProperties).toBe(true)
    }

    expect(CONTENT_HASH_CONTRACT.canonicalSerialization.excludedRootFields).toEqual(['contentHash'])
    expect(CONTENT_HASH_CONTRACT.canonicalSerialization.nestedContentHashFieldsIncluded).toBe(true)
    expect(CONTENT_HASH_CONTRACT.canonicalSerialization.includeCreatedAt).toBe(true)
  })

  it('throws structured validation errors instead of freezing invalid artifacts', () => {
    const { corpus } = createArtifacts()
    corpus.contentHash = 'invalid'

    expect(() => finalizeBenchmarkArtifact(corpus)).toThrow(BenchmarkArtifactValidationError)
    try {
      finalizeBenchmarkArtifact(corpus)
    } catch (caught) {
      expect(caught.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_pattern', path: '$.contentHash' })
      ]))
      expect(Object.isFrozen(corpus)).toBe(false)
    }
  })

  it('returns deterministic validation errors', () => {
    const artifact = {
      artifactType: ARTIFACT_TYPES.RAW_SAMPLE,
      schemaVersion: 'bad',
      contentHash: 'bad'
    }

    const first = validateBenchmarkArtifact(structuredClone(artifact)).errors
    const second = validateBenchmarkArtifact(structuredClone(artifact)).errors
    expect(second).toEqual(first)
    expect(first.map(({ path }) => path)).toEqual([...first.map(({ path }) => path)].sort())
  })
})
