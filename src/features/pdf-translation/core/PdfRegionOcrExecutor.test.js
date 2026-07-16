import { describe, expect, it, vi } from 'vitest'
import { PdfRegionOcrExecutor } from './PdfRegionOcrExecutor.js'
import { createPdfRegion } from './PdfRegion.js'

function createCanvas() {
  const widthAssignments = []
  const heightAssignments = []
  let width = 0
  let height = 0

  return {
    get width() {
      return width
    },
    set width(value) {
      width = value
      widthAssignments.push(value)
    },
    get height() {
      return height
    },
    set height(value) {
      height = value
      heightAssignments.push(value)
    },
    widthAssignments,
    heightAssignments,
    getContext: vi.fn(() => ({ fillRect: vi.fn() }))
  }
}

function createViewport({ scale = 2, width = 200, height = 200 } = {}) {
  return {
    width,
    height,
    convertToViewportPoint: vi.fn((x, y) => [x * scale, (100 - y) * scale])
  }
}

function resolvedRenderTask() {
  return { promise: Promise.resolve(), cancel: vi.fn() }
}

function pendingRenderTask() {
  let resolve
  let reject
  const task = {
    promise: new Promise((res, rej) => {
      resolve = res
      reject = rej
    }),
    cancel: vi.fn(() => reject(Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' })))
  }
  return { task, resolve, reject }
}

function createPage({ viewport = createViewport(), renderTask = resolvedRenderTask() } = {}) {
  return {
    getViewport: vi.fn(() => viewport),
    render: vi.fn(() => renderTask),
    cleanup: vi.fn()
  }
}

function createPdfDocument(page = createPage()) {
  return {
    getPage: vi.fn().mockResolvedValue(page),
    pageSessions: new Map(),
    setPageOcrBlocks: vi.fn()
  }
}

function createExecutor({ page, recognize = vi.fn().mockResolvedValue({ text: 'hello', lines: [], confidence: 92 }), canvases = [] } = {}) {
  const pdfDocument = createPdfDocument(page)
  const executor = new PdfRegionOcrExecutor({
    pdfDocument,
    recognize,
    createCanvas: () => {
      const canvas = createCanvas()
      canvases.push(canvas)
      return canvas
    }
  })

  return { executor, pdfDocument, recognize, canvases }
}

const region = createPdfRegion({ pageNumber: 3, left: 10, top: 80, right: 40, bottom: 20 })

describe('PdfRegionOcrExecutor', () => {
  it('executes region OCR and returns the existing OCR engine data contract', async () => {
    const viewport = createViewport()
    const renderTask = resolvedRenderTask()
    const page = createPage({ viewport, renderTask })
    const ocrData = { text: 'selected text', lines: [{ text: 'selected text' }], confidence: 88 }
    const { executor, pdfDocument, recognize, canvases } = createExecutor({
      page,
      recognize: vi.fn().mockResolvedValue(ocrData)
    })

    const { promise } = executor.execute({ region, scale: 2, language: 'eng' })

    await expect(promise).resolves.toEqual({ status: 'recognized', data: ocrData })
    expect(pdfDocument.getPage).toHaveBeenCalledWith(3)
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 2 })
    expect(recognize).toHaveBeenCalledWith(canvases[0], 'eng')
  })

  it.each([
    { language: 'auto', expected: 'eng' },
    { language: 'fa', expected: 'fas' },
    { language: 'eng', expected: 'eng' }
  ])('normalizes OCR language %s to %s', async ({ language, expected }) => {
    const recognize = vi.fn().mockResolvedValue({ text: 'ok', lines: [], confidence: 1 })
    const { executor } = createExecutor({ recognize })

    await executor.execute({ region, scale: 1, language }).promise

    expect(recognize).toHaveBeenCalledWith(expect.any(Object), expected)
  })

  it('rejects invalid region and invalid scale as failed outcomes', async () => {
    const { executor } = createExecutor()

    await expect(executor.execute({ region: { ...region }, scale: 1, language: 'eng' }).promise)
      .resolves.toMatchObject({ status: 'failed', error: expect.any(TypeError) })
    await expect(executor.execute({ region, scale: 0, language: 'eng' }).promise)
      .resolves.toMatchObject({ status: 'failed', error: expect.any(RangeError) })
    await expect(executor.execute({ region, scale: Infinity, language: 'eng' }).promise)
      .resolves.toMatchObject({ status: 'failed', error: expect.any(RangeError) })
  })

  it.each([
    { point: null },
    { point: undefined },
    { point: {} },
    { point: [] },
    { point: [10] },
    { point: [NaN, 10] },
    { point: [10, undefined] },
    { point: [10, 20, 30] }
  ])('returns failed outcome for malformed viewport point $point', async ({ point }) => {
    const viewport = createViewport()
    viewport.convertToViewportPoint.mockReturnValue(point)
    const recognize = vi.fn()
    const canvases = []
    const { executor } = createExecutor({ page: createPage({ viewport }), recognize, canvases })

    const result = await executor.execute({ region, scale: 1, language: 'eng' }).promise

    expect(result).toMatchObject({ status: 'failed', error: expect.any(Error) })
    expect(recognize).not.toHaveBeenCalled()
    expect(canvases).toHaveLength(0)
  })

  it.each([NaN, 0, -1])('returns failed outcome for invalid viewport width %s', async (width) => {
    const recognize = vi.fn()
    const canvases = []
    const { executor } = createExecutor({
      page: createPage({ viewport: createViewport({ width }) }),
      recognize,
      canvases
    })

    const result = await executor.execute({ region, scale: 1, language: 'eng' }).promise

    expect(result.status).toBe('failed')
    expect(recognize).not.toHaveBeenCalled()
    expect(canvases).toHaveLength(0)
  })

  it.each([NaN, 0, -1])('returns failed outcome for invalid viewport height %s', async (height) => {
    const recognize = vi.fn()
    const canvases = []
    const { executor } = createExecutor({
      page: createPage({ viewport: createViewport({ height }) }),
      recognize,
      canvases
    })

    const result = await executor.execute({ region, scale: 1, language: 'eng' }).promise

    expect(result.status).toBe('failed')
    expect(recognize).not.toHaveBeenCalled()
    expect(canvases).toHaveLength(0)
  })

  it('maps all four PDF corners and uses a translated render transform', async () => {
    const viewport = createViewport({ scale: 2, width: 300, height: 300 })
    const renderTask = resolvedRenderTask()
    const page = createPage({ viewport, renderTask })
    const { executor, canvases } = createExecutor({ page })

    await executor.execute({ region, scale: 2, language: 'eng' }).promise

    expect(viewport.convertToViewportPoint.mock.calls).toEqual([
      [10, 80],
      [40, 80],
      [10, 20],
      [40, 20]
    ])
    expect(canvases[0].width).toBe(0)
    expect(canvases[0].height).toBe(0)
    expect(page.render).toHaveBeenCalledWith({
      canvasContext: canvases[0].getContext.mock.results[0].value,
      viewport,
      transform: [1, 0, 0, 1, -20, -40],
      intent: 'display'
    })
  })

  it('allocates only a region-sized destination canvas', async () => {
    const page = createPage({ viewport: createViewport({ scale: 2, width: 1000, height: 1000 }) })
    const { executor, canvases } = createExecutor({ page })

    await executor.execute({ region, scale: 2, language: 'eng' }).promise

    expect(canvases).toHaveLength(1)
    expect(canvases[0].widthAssignments).toContain(60)
    expect(canvases[0].heightAssignments).toContain(120)
    expect(canvases[0].widthAssignments).not.toContain(1000)
    expect(canvases[0].heightAssignments).not.toContain(1000)
    expect(page.render.mock.calls[0][0].canvasContext).toBe(canvases[0].getContext.mock.results[0].value)
  })

  it('returns failed outcome on render or OCR failure', async () => {
    const renderError = new Error('render failed')
    const renderPage = createPage({
      renderTask: { promise: Promise.reject(renderError), cancel: vi.fn() }
    })
    const renderFailure = createExecutor({ page: renderPage })

    await expect(renderFailure.executor.execute({ region, scale: 1, language: 'eng' }).promise)
      .resolves.toEqual({ status: 'failed', error: renderError })

    const ocrError = new Error('ocr failed')
    const ocrFailure = createExecutor({ recognize: vi.fn().mockRejectedValue(ocrError) })

    await expect(ocrFailure.executor.execute({ region, scale: 1, language: 'eng' }).promise)
      .resolves.toEqual({ status: 'failed', error: ocrError })
  })

  it('cancels during render without affecting another operation', async () => {
    const firstRender = pendingRenderTask()
    const secondRender = pendingRenderTask()
    const firstPage = createPage({ renderTask: firstRender.task })
    const secondPage = createPage({ renderTask: secondRender.task })
    const pdfDocument = {
      getPage: vi.fn()
        .mockResolvedValueOnce(firstPage)
        .mockResolvedValueOnce(secondPage)
    }
    const recognize = vi.fn().mockResolvedValue({ text: 'ok', lines: [], confidence: 1 })
    const executor = new PdfRegionOcrExecutor({ pdfDocument, recognize, createCanvas })

    const first = executor.execute({ region, scale: 1, language: 'eng' })
    const second = executor.execute({ region, scale: 1, language: 'eng' })
    await Promise.resolve()
    first.cancel()
    secondRender.resolve()

    await expect(first.promise).resolves.toEqual({ status: 'cancelled' })
    await expect(second.promise).resolves.toEqual({ status: 'recognized', data: { text: 'ok', lines: [], confidence: 1 } })
    expect(firstRender.task.cancel).toHaveBeenCalledOnce()
    expect(secondRender.task.cancel).not.toHaveBeenCalled()
  })

  it('suppresses operation result when cancelled during OCR', async () => {
    let finishOcr
    const recognize = vi.fn(() => new Promise(resolve => {
      finishOcr = resolve
    }))
    const { executor } = createExecutor({ recognize })
    const operation = executor.execute({ region, scale: 1, language: 'eng' })
    await Promise.resolve()
    await Promise.resolve()

    operation.cancel()
    finishOcr({ text: 'late', lines: [], confidence: 1 })

    await expect(operation.promise).resolves.toEqual({ status: 'cancelled' })
  })

  it('cleans owned canvas and never cleans page or mutates page session state', async () => {
    const page = createPage()
    const { executor, pdfDocument, canvases } = createExecutor({ page })

    await executor.execute({ region, scale: 1, language: 'eng' }).promise

    expect(canvases[0]).toMatchObject({ width: 0, height: 0 })
    expect(page.cleanup).not.toHaveBeenCalled()
    expect(pdfDocument.setPageOcrBlocks).not.toHaveBeenCalled()
    expect(pdfDocument.pageSessions.size).toBe(0)
  })
})
