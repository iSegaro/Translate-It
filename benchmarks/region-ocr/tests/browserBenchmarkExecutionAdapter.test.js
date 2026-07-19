import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/screen-capture/services/ocrEngine.js', () => ({
  prepareOCREngine: vi.fn(),
  recognizeStructured: vi.fn()
}))

vi.mock('@/features/screen-capture/utils/ocrLanguageMap.js', () => ({
  toTesseractLanguageCode: language => language
}))

vi.mock('@/features/pdf-translation/core/pdfjs.js', () => ({
  ensurePdfJsConfigured: vi.fn()
}))

import { createBenchmarkCorpusModel } from '../corpus/corpusModel.js'
import { BrowserBenchmarkExecutionAdapter } from '../browser/BrowserBenchmarkExecutionAdapter.js'

const CREATED_AT = '2026-07-19T00:00:00.000Z'
const HASH = `sha256:${'a'.repeat(64)}`

function createCorpus() {
  return createBenchmarkCorpusModel({
    schemaVersion: '1.0.0',
    artifactType: 'corpus-manifest',
    artifactId: 'browser-corpus',
    contentHash: HASH,
    createdAt: CREATED_AT,
    corpusId: 'browser-corpus',
    corpusVersion: '1.0.0',
    normalizationPolicy: { id: 'unicode-nfc', version: '1.0.0', parameters: {} },
    documents: [{
      id: 'fixture-pdf',
      file: 'fixtures/test.pdf',
      contentHash: HASH,
      documentType: 'vector',
      regions: [
        {
          id: 'first-region', pageNumber: 1, language: 'eng', rotation: 0,
          pdfRegion: { left: 10, top: 40, right: 90, bottom: 10 },
          groundTruth: { path: 'truth/first.txt', contentHash: HASH }
        },
        {
          id: 'second-region', pageNumber: 1, language: 'eng', rotation: 0,
          pdfRegion: { left: 10, top: 80, right: 90, bottom: 50 },
          groundTruth: { path: 'truth/second.txt', contentHash: HASH }
        }
      ]
    }]
  })
}

function runDescriptor() {
  return {
    artifactId: 'browser-run', contentHash: HASH, createdAt: CREATED_AT, runId: 'browser-run',
    policy: { id: 'scale-125-eng', version: '1.0.0', parameters: { scale: 1.25, language: 'eng' } },
    environment: {
      browser: { name: 'chromium', version: '1.0.0' }, os: 'test', pdfjsVersion: '1.0.0', tesseractVersion: '1.0.0', modelHashes: { eng: HASH }
    },
    execution: { seed: 'fixed', runModes: ['warm'], repetitions: 1, parallelism: 1 }
  }
}

function sampleMetadata({ sampleIndex }) {
  return { artifactId: `browser-sample-${sampleIndex}`, contentHash: HASH, createdAt: CREATED_AT }
}

function canvas() {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({}))
  }
}

describe('BrowserBenchmarkExecutionAdapter', () => {
  it('opens each fixture once, executes canonical regions, and writes a raw artifact', async () => {
    const document = { destroy: vi.fn() }
    const loadingTask = { destroy: vi.fn() }
    const createPdfDocument = vi.fn(async () => ({ document, loadingTask }))
    const execute = vi.fn(({ region, scale, language }) => {
      return {
        promise: Promise.resolve({ status: 'recognized', data: { text: `${region.left}:${scale}:${language}`, confidence: 90, lines: [] } }),
        cancel: vi.fn()
      }
    })
    const createExecutor = vi.fn(({ createCanvas }) => ({
      execute: (input) => {
        const measuredCanvas = createCanvas()
        measuredCanvas.width = 120
        measuredCanvas.height = 40
        return execute(input)
      }
    }))
    const adapter = new BrowserBenchmarkExecutionAdapter({
      corpus: createCorpus(),
      assets: [{ kind: 'document', path: 'fixtures/test.pdf', bytes: new Uint8Array([1, 2, 3]) }],
      candidate: { scale: 1.25, language: 'eng' },
      runDescriptor: runDescriptor(),
      createSampleArtifactMetadata: sampleMetadata,
      createPdfDocument,
      createExecutor,
      createCanvas: canvas
    })

    const { runResult, artifacts } = await adapter.run().promise

    expect(createPdfDocument).toHaveBeenCalledOnce()
    expect(createExecutor).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      region: expect.objectContaining({ pageNumber: 1, left: 10, top: 40, right: 90, bottom: 10 }),
      scale: 1.25,
      language: 'eng'
    }))
    expect(runResult.recognizedRegions).toBe(2)
    expect(artifacts.samples).toHaveLength(2)
    expect(artifacts.samples[0]).toMatchObject({
      status: 'recognized',
      raster: { width: 120, height: 40, pixelCount: 4800, rgbaBytes: 19200 },
      recognition: { rawOutput: expect.objectContaining({ confidence: 90 }) }
    })
    expect(document.destroy).toHaveBeenCalledOnce()
    expect(loadingTask.destroy).toHaveBeenCalledOnce()
  })

  it('records executor failures in the raw artifact', async () => {
    const createExecutor = vi.fn(() => ({
      execute: () => ({ promise: Promise.resolve({ status: 'failed', error: new Error('render failed') }), cancel: vi.fn() })
    }))
    const adapter = new BrowserBenchmarkExecutionAdapter({
      corpus: createBenchmarkCorpusModel({ ...createCorpus().manifest, documents: [createCorpus().manifest.documents[0]] }),
      assets: [{ kind: 'document', path: 'fixtures/test.pdf', bytes: new Uint8Array([1]) }],
      candidate: { scale: 1.25, language: 'eng' },
      runDescriptor: runDescriptor(),
      createSampleArtifactMetadata: sampleMetadata,
      createPdfDocument: async () => ({ document: { destroy: vi.fn() }, loadingTask: { destroy: vi.fn() } }),
      createExecutor,
      createCanvas: canvas
    })

    const { artifacts } = await adapter.run().promise

    expect(artifacts.samples[0]).toMatchObject({ status: 'failed', error: { message: 'render failed' } })
  })

  it('cancels active executor work and releases opened documents', async () => {
    let resolve
    const cancel = vi.fn(() => resolve({ status: 'cancelled' }))
    const document = { destroy: vi.fn() }
    const createExecutor = vi.fn(() => ({
      execute: () => ({ promise: new Promise(resolvePromise => { resolve = resolvePromise }), cancel })
    }))
    const controller = new AbortController()
    const adapter = new BrowserBenchmarkExecutionAdapter({
      corpus: createCorpus(),
      assets: [{ kind: 'document', path: 'fixtures/test.pdf', bytes: new Uint8Array([1]) }],
      candidate: { scale: 1.25, language: 'eng' },
      runDescriptor: runDescriptor(),
      createSampleArtifactMetadata: sampleMetadata,
      createPdfDocument: async () => ({ document, loadingTask: { destroy: vi.fn() } }),
      createExecutor,
      createCanvas: canvas
    })

    const operation = adapter.run({ signal: controller.signal })
    await vi.waitFor(() => expect(createExecutor).toHaveBeenCalledOnce())
    controller.abort()
    await operation.promise

    expect(cancel).toHaveBeenCalledOnce()
    expect(document.destroy).toHaveBeenCalledOnce()
  })
})
