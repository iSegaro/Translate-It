import { describe, expect, it } from 'vitest'

import {
  GroundTruthValidationError,
  OCR_METRICS,
  createOcrMetricRegistry,
  loadBrowserGroundTruthLookup
} from '../scoring/index.js'
import { ARTIFACT_TYPES, validateBenchmarkArtifact } from '../schemas/index.js'

const CREATED_AT = '2026-07-19T00:00:00.000Z'
const HASH = value => `sha256:${value.repeat(64).slice(0, 64)}`

function corpus(regions = [{ id: 'region-01', path: 'truth-01.txt' }]) {
  return {
    manifest: {
      normalizationPolicy: { id: 'unicode-nfc', version: '1.0.0', parameters: {} },
      documents: [{
        id: 'doc-01',
        regions: regions.map(region => ({
          id: region.id,
          language: 'eng',
          groundTruth: { path: region.path }
        }))
      }]
    }
  }
}

function assets(entries = [{ path: 'truth-01.txt', text: 'Café world' }]) {
  return entries.map(entry => ({ kind: 'ground-truth', ...entry }))
}

function rawRun() {
  return {
    schemaVersion: '1.0.0',
    artifactType: ARTIFACT_TYPES.RAW_RUN,
    artifactId: 'raw-run-001',
    contentHash: HASH('1'),
    createdAt: CREATED_AT,
    runId: 'run-001',
    corpusRef: { artifactType: ARTIFACT_TYPES.CORPUS_MANIFEST, artifactId: 'corpus-001', schemaVersion: '1.0.0', contentHash: HASH('a') },
    policy: { id: 'candidate-a', version: '1.0.0', parameters: {} },
    environment: {
      browser: { name: 'chromium', version: '126' },
      os: 'linux',
      pdfjsVersion: '6.0.227',
      tesseractVersion: '7.0.0',
      modelHashes: { eng: HASH('2') }
    },
    execution: { seed: 'seed-001', runModes: ['warm'], repetitions: 1, parallelism: 1 }
  }
}

function rawSample(text) {
  return {
    schemaVersion: '1.0.0',
    artifactType: ARTIFACT_TYPES.RAW_SAMPLE,
    artifactId: 'raw-sample-001',
    contentHash: HASH('3'),
    createdAt: CREATED_AT,
    sampleId: 'raw-sample-001',
    runRef: { artifactType: ARTIFACT_TYPES.RAW_RUN, artifactId: 'raw-run-001', schemaVersion: '1.0.0', contentHash: HASH('1') },
    corpusRef: { artifactType: ARTIFACT_TYPES.CORPUS_MANIFEST, artifactId: 'corpus-001', schemaVersion: '1.0.0', contentHash: HASH('a') },
    caseRef: { documentId: 'doc-01', regionId: 'region-01' },
    policy: { id: 'candidate-a', version: '1.0.0', parameters: {} },
    runMode: 'warm',
    sampleIndex: 0,
    renderPlan: { scale: 1.25 },
    status: 'recognized',
    recognition: { rawOutput: { text } },
    timingMs: { pageResolution: 0, render: 0, ocr: 1, total: 1 },
    raster: { width: 1, height: 1, pixelCount: 1, rgbaBytes: 4 },
    memory: { peakDeltaBytes: null, measurementMethod: null }
  }
}

function descriptor() {
  return {
    artifactId: 'scored-result-001',
    contentHash: HASH('4'),
    createdAt: CREATED_AT,
    scoredResultId: 'scored-result-001',
    normalizationPolicy: { id: 'unicode-nfc', version: '1.0.0', parameters: {} },
    scorer: {
      id: 'region-ocr-metrics',
      version: '1.0.0',
      parameters: { metrics: OCR_METRICS.map(metric => metric.id) }
    }
  }
}

describe('OCR metric registry', () => {
  it('calculates perfect CER, WER, and exact match', () => {
    const metrics = Object.fromEntries(OCR_METRICS.map(metric => [metric.id, metric.calculate({ predicted: 'alpha beta', expected: 'alpha beta' })]))
    expect(metrics).toMatchObject({ cer: 0, wer: 0, exactMatch: 1 })
  })

  it('calculates non-zero CER and WER with failed exact match', () => {
    const metrics = Object.fromEntries(OCR_METRICS.map(metric => [metric.id, metric.calculate({ predicted: 'alpha gamma', expected: 'alpha beta' })]))
    expect(metrics.cer).toBeGreaterThan(0)
    expect(metrics.wer).toBeGreaterThan(0)
    expect(metrics.exactMatch).toBe(0)
  })

  it('loads browser truth and normalizes according to corpus policy', async () => {
    const loadedCorpus = corpus()
    const groundTruthLookup = await loadBrowserGroundTruthLookup({ corpus: loadedCorpus, assets: assets() })
    const registry = createOcrMetricRegistry({ corpus: loadedCorpus, groundTruthLookup })
    const run = rawRun()
    const result = registry.score({
      rawRun: run,
      rawSamples: [rawSample('Cafe\u0301 world')],
      scoredResultDescriptor: descriptor()
    })

    expect(result.runtimeResult.sampleScores[0]).toMatchObject({
      normalization: { predicted: 'Café world', expected: 'Café world' },
      metrics: { cer: 0, wer: 0, exactMatch: 1 }
    })
    expect(result.artifact.samples[0].metrics).toMatchObject({ cer: 0, wer: 0, exactMatch: 1 })
    expect(validateBenchmarkArtifact(result.artifact)).toMatchObject({ valid: true, errors: [] })
  })

  it('reports missing reviewed truth as structured error', async () => {
    await expect(loadBrowserGroundTruthLookup({ corpus: corpus(), assets: [] })).rejects.toMatchObject({
      name: 'GroundTruthValidationError',
      errors: [expect.objectContaining({ code: 'missing_ground_truth' })]
    })
  })

  it('reports duplicate region identities as structured error', async () => {
    await expect(loadBrowserGroundTruthLookup({
      corpus: corpus([{ id: 'region-01', path: 'truth-01.txt' }, { id: 'region-01', path: 'truth-02.txt' }]),
      assets: assets([{ path: 'truth-01.txt', text: 'first' }, { path: 'truth-02.txt', text: 'second' }])
    })).rejects.toMatchObject({
      name: GroundTruthValidationError.name,
      errors: [expect.objectContaining({ code: 'duplicate_ground_truth_key' })]
    })
  })
})
