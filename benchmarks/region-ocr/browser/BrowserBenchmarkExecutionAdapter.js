import { PdfRegionOcrExecutor } from '../../../src/features/pdf-translation/core/PdfRegionOcrExecutor.js'
import { createPdfRegion } from '../../../src/features/pdf-translation/core/PdfRegion.js'
import { ensurePdfJsConfigured } from '../../../src/features/pdf-translation/core/pdfjs.js'
import { RegionExecutionStatus } from '../execution-results/index.js'
import { writeRawArtifacts } from '../raw-artifacts/index.js'
import { runBenchmark } from '../runner/index.js'

function errorPayload(error) {
  const payload = {
    name: error?.name || 'Error',
    message: error?.message || String(error)
  }
  if (error?.code) payload.code = error.code
  return payload
}

function createMeasuredCanvas(createCanvas, telemetry) {
  const canvas = createCanvas()
  return {
    get width() {
      return canvas.width
    },
    set width(value) {
      canvas.width = value
      telemetry.rasterWidth = Math.max(telemetry.rasterWidth, Number(value) || 0)
    },
    get height() {
      return canvas.height
    },
    set height(value) {
      canvas.height = value
      telemetry.rasterHeight = Math.max(telemetry.rasterHeight, Number(value) || 0)
    },
    getContext(...args) {
      return canvas.getContext(...args)
    }
  }
}

async function openPdfDocument(bytes) {
  const pdfjs = ensurePdfJsConfigured()
  const loadingTask = pdfjs.getDocument({ data: bytes })
  return { document: await loadingTask.promise, loadingTask }
}

function executionResult(documentId, regionId, outcome) {
  if (outcome?.status === RegionExecutionStatus.RECOGNIZED) {
    return {
      documentId,
      regionId,
      status: RegionExecutionStatus.RECOGNIZED,
      payload: outcome.data
    }
  }
  if (outcome?.status === RegionExecutionStatus.CANCELLED) {
    return {
      documentId,
      regionId,
      status: RegionExecutionStatus.CANCELLED,
      payload: { cancelledBy: 'executor' }
    }
  }
  return {
    documentId,
    regionId,
    status: RegionExecutionStatus.FAILED,
    payload: { reason: errorPayload(outcome?.error) }
  }
}

function defaultClock() {
  return globalThis.performance?.now?.() ?? Date.now()
}

export class BrowserBenchmarkExecutionAdapter {
  constructor({
    corpus,
    assets,
    candidate,
    runDescriptor,
    createSampleArtifactMetadata,
    createPdfDocument = openPdfDocument,
    createExecutor = options => new PdfRegionOcrExecutor(options),
    createCanvas = () => document.createElement('canvas'),
    clock = defaultClock
  } = {}) {
    if (!corpus) throw new TypeError('BrowserBenchmarkExecutionAdapter requires corpus')
    if (!Array.isArray(assets)) throw new TypeError('BrowserBenchmarkExecutionAdapter requires assets')
    if (!candidate?.scale || !candidate?.language) throw new TypeError('BrowserBenchmarkExecutionAdapter requires candidate scale and language')
    if (!runDescriptor) throw new TypeError('BrowserBenchmarkExecutionAdapter requires runDescriptor')
    if (typeof createSampleArtifactMetadata !== 'function') throw new TypeError('BrowserBenchmarkExecutionAdapter requires createSampleArtifactMetadata')

    this.corpus = corpus
    this.assets = assets
    this.candidate = candidate
    this.runDescriptor = runDescriptor
    this.createSampleArtifactMetadata = createSampleArtifactMetadata
    this.createPdfDocument = createPdfDocument
    this.createExecutor = createExecutor
    this.createCanvas = createCanvas
    this.clock = clock
    this.documents = new Map()
    this.telemetry = new Map()
    this.operation = null
  }

  async getDocument(document) {
    if (!this.documents.has(document.id)) {
      const asset = this.assets.find(item => item.kind === 'document' && item.path === document.file)
      if (!asset?.bytes) throw new Error(`Missing PDF fixture asset: ${document.file}`)
      this.documents.set(document.id, this.createPdfDocument(asset.bytes))
    }
    return this.documents.get(document.id)
  }

  executeRegion({ document, region }) {
    let activeOperation = null
    let cancelled = false
    const telemetry = { rasterWidth: 0, rasterHeight: 0, startedAt: this.clock(), completedAt: 0 }
    const key = `${document.id}:${region.id}`
    this.telemetry.set(key, telemetry)

    const promise = (async () => {
      try {
        const loaded = await this.getDocument(document)
        if (cancelled) return executionResult(document.id, region.id, { status: RegionExecutionStatus.CANCELLED })

        const canonicalRegion = createPdfRegion({ pageNumber: region.pageNumber, ...region.pdfRegion })
        if (!canonicalRegion) throw new Error('Corpus region is not canonical')
        const executor = this.createExecutor({
          pdfDocument: loaded.document,
          createCanvas: () => createMeasuredCanvas(this.createCanvas, telemetry)
        })
        activeOperation = executor.execute({
          region: canonicalRegion,
          scale: this.candidate.scale,
          language: this.candidate.language
        })
        if (cancelled) activeOperation.cancel()
        const outcome = await activeOperation.promise
        return executionResult(document.id, region.id, outcome)
      } catch (error) {
        return executionResult(document.id, region.id, { status: RegionExecutionStatus.FAILED, error })
      } finally {
        telemetry.completedAt = this.clock()
      }
    })()

    return {
      promise,
      cancel() {
        cancelled = true
        activeOperation?.cancel?.()
      }
    }
  }

  createSampleDescriptors(runResult) {
    return runResult.regionResults.map((result, sampleIndex) => {
      const telemetry = this.telemetry.get(`${result.documentId}:${result.regionId}`) || {}
      const metadata = this.createSampleArtifactMetadata({ result, sampleIndex })
      const total = Math.max(0, (telemetry.completedAt || this.clock()) - (telemetry.startedAt || this.clock()))
      const descriptor = {
        ...metadata,
        executionResult: result,
        runMode: 'warm',
        sampleIndex,
        renderPlan: { source: 'browser-benchmark-execution-adapter', scale: this.candidate.scale },
        timingMs: { pageResolution: 0, render: 0, ocr: 0, total },
        raster: {
          width: telemetry.rasterWidth || 0,
          height: telemetry.rasterHeight || 0,
          pixelCount: (telemetry.rasterWidth || 0) * (telemetry.rasterHeight || 0),
          rgbaBytes: (telemetry.rasterWidth || 0) * (telemetry.rasterHeight || 0) * 4
        },
        memory: { peakDeltaBytes: null, measurementMethod: null }
      }
      if (result.status === RegionExecutionStatus.RECOGNIZED) descriptor.recognition = { rawOutput: result.payload }
      if (result.status === RegionExecutionStatus.FAILED) descriptor.error = errorPayload(result.payload?.reason)
      return descriptor
    })
  }

  async dispose() {
    const documents = await Promise.allSettled(this.documents.values())
    await Promise.all(documents.map(async ({ value }) => {
      await value?.document?.destroy?.()
      await value?.loadingTask?.destroy?.()
    }))
    this.documents.clear()
  }

  run({ onProgress, signal } = {}) {
    if (this.operation) throw new Error('Browser benchmark execution already active')
    const benchmark = runBenchmark({
      corpus: this.corpus,
      runId: this.runDescriptor.runId,
      executeRegion: item => this.executeRegion(item),
      onProgress
    })
    const abort = () => benchmark.cancel()
    signal?.addEventListener?.('abort', abort, { once: true })

    const promise = benchmark.promise.then(runResult => {
      const artifacts = writeRawArtifacts({
        corpus: this.corpus,
        runResult,
        runDescriptor: this.runDescriptor,
        sampleDescriptors: this.createSampleDescriptors(runResult)
      })
      return Object.freeze({ runResult, artifacts })
    }).finally(async () => {
      signal?.removeEventListener?.('abort', abort)
      await this.dispose()
      this.operation = null
    })

    this.operation = Object.freeze({ promise, cancel: benchmark.cancel, context: benchmark.context })
    return this.operation
  }
}
