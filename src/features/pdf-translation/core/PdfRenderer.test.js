import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./PdfTextLayerRenderer.js', () => ({
  PdfTextLayerRenderer: class PdfTextLayerRenderer {
    render = vi.fn().mockResolvedValue(undefined)
    clear = vi.fn()
  }
}))

const { resolvePdfRasterPlanMock } = vi.hoisted(() => ({
  resolvePdfRasterPlanMock: vi.fn()
}))

vi.mock('./PdfRasterPlan.js', () => ({
  resolvePdfRasterPlan: resolvePdfRasterPlanMock
}))

// Mock createImageBitmap globally
const mockCreateImageBitmap = vi.fn().mockResolvedValue({
  width: 100,
  height: 100,
  close: vi.fn()
})
vi.stubGlobal('createImageBitmap', mockCreateImageBitmap)

const { PdfRenderer, PDF_RENDER_RESULT_STATUS } = await import('./PdfRenderer.js')

function createMockPage(pageNumber, deferredStore) {
  const state = { cancelled: false }

  const page = {
    pageNumber,
    cleanup: vi.fn(),
    getViewport: vi.fn(({ scale }) => ({
      width: 600 * scale,
      height: 800 * scale
    })),
    render: vi.fn(() => {
      state.cancelled = false
      const cancel = vi.fn(() => {
        state.cancelled = true
      })
      let resolve, reject
      const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      // Resolve function checks for cancellation before settling
      state.resolve = () => {
        if (state.cancelled) {
          reject(Object.assign(new Error('Rendering cancelled'), { name: 'RenderingCancelledException' }))
        } else {
          resolve()
        }
      }
      state.promise = promise
      return { cancel, promise }
    })
  }

  if (deferredStore) {
    deferredStore.push(state)
  }

  return page
}

function createMockCanvas(initialWidth = 0, initialHeight = 0) {
  const style = {}
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn()
  }
  return {
    width: initialWidth,
    height: initialHeight,
    style,
    getContext: vi.fn(() => context)
  }
}

async function flushMicrotasks() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function createMockTempCanvas() {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn()
  }
  return {
    width: 0,
    height: 0,
    style: {},
    getContext: vi.fn(() => context)
  }
}

beforeEach(() => {
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'canvas') return createMockTempCanvas()
    throw new Error(`Unexpected document.createElement('${tag}')`)
  })
  mockCreateImageBitmap.mockReset()
  mockCreateImageBitmap.mockResolvedValue({
    width: 100,
    height: 100,
    close: vi.fn()
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function createMockPlan(overrides = {}) {
  const logicalWidth = overrides.logicalWidth ?? 900
  const logicalHeight = overrides.logicalHeight ?? 1200
  const backingWidth = overrides.backingWidth ?? logicalWidth
  const backingHeight = overrides.backingHeight ?? logicalHeight
  return Object.freeze({
    logicalWidth,
    logicalHeight,
    rasterOutputScale: overrides.rasterOutputScale ?? 1,
    backingWidth,
    backingHeight,
    rasterScaleX: overrides.rasterScaleX ?? (backingWidth / logicalWidth),
    rasterScaleY: overrides.rasterScaleY ?? (backingHeight / logicalHeight),
    rasterPixels: backingWidth * backingHeight,
    estimatedBytes: backingWidth * backingHeight * 4,
    degraded: overrides.degraded ?? false,
    renderable: overrides.renderable ?? true
  })
}

describe('PdfRenderer', () => {
  let renderer
  let pdfDocument
  let deferredRenders

  beforeEach(() => {
    deferredRenders = []
    resolvePdfRasterPlanMock.mockReset()
    resolvePdfRasterPlanMock.mockImplementation(
      ({ logicalWidth, logicalHeight }) => createMockPlan({ logicalWidth, logicalHeight })
    )
    renderer = new PdfRenderer()
    pdfDocument = {
      getPage: vi.fn(async (pageNumber) => createMockPage(pageNumber, deferredRenders))
    }
  })

  describe('_getCanvasId', () => {
    it('assigns incremental IDs to canvas elements', () => {
      const a = createMockCanvas()
      const b = createMockCanvas()

      expect(renderer._getCanvasId(a)).toBe('1')
      expect(renderer._getCanvasId(b)).toBe('2')
      expect(renderer._getCanvasId(a)).toBe('1')
      expect(renderer._getCanvasId(b)).toBe('2')
    })

    it('returns empty string for null/undefined canvas', () => {
      expect(renderer._getCanvasId(null)).toBe('')
      expect(renderer._getCanvasId(undefined)).toBe('')
    })
  })

  describe('_taskKey', () => {
    it('produces a composite key from page number and canvas id', () => {
      const canvas = createMockCanvas()
      const key = renderer._taskKey(3, canvas)
      expect(key).toBe('3:1')
    })
  })

  describe('_parsePageNumber', () => {
    it('extracts the page number from a composite key', () => {
      expect(PdfRenderer._parsePageNumber('3:1')).toBe(3)
      expect(PdfRenderer._parsePageNumber('12:5')).toBe(12)
    })

    it('returns NaN for keys without a colon', () => {
      expect(Number.isNaN(PdfRenderer._parsePageNumber('invalid'))).toBe(true)
    })
  })

  describe('renderPage', () => {
    it('renders a page to a canvas element', async () => {
      const canvas = createMockCanvas()
      const metric = { scale: 1.5 }

      // Start render and wait for it to reach the deferred promise
      const promise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: null })
      await flushMicrotasks()
      // Resolve the deferred render
      deferredRenders[0].resolve()
      const result = await promise

      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.SUCCESS)
      expect(pdfDocument.getPage).toHaveBeenCalledWith(1)
      expect(canvas.width).toBe(900)
      expect(canvas.height).toBe(1200)
    })

    it('returns failed result when pdfDocument is missing', async () => {
      const result = await renderer.renderPage({ pdfDocument: null, metric: { scale: 1 }, pageNumber: 1, canvas: createMockCanvas(), textLayerRenderer: null })
      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.FAILED)
    })

    it('returns failed result when canvas is missing', async () => {
      const result = await renderer.renderPage({ pdfDocument, metric: { scale: 1 }, pageNumber: 1, canvas: null, textLayerRenderer: null })
      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.FAILED)
    })

    it('returns failed result when metric is missing', async () => {
      const result = await renderer.renderPage({ pdfDocument, metric: null, pageNumber: 1, canvas: createMockCanvas(), textLayerRenderer: null })
      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.FAILED)
    })

    it('cancels previous render for the same canvas and page before starting new one', async () => {
      const canvas = createMockCanvas()
      const metric = { scale: 1 }

      // Start first render and let it store its task
      const firstPromise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: null })
      await flushMicrotasks()

      const key = renderer._taskKey(1, canvas)
      const firstTask = renderer.renderTasks.get(key)
      expect(firstTask).toBeDefined()

      // Start second render for the same page+canvas — this cancels the first
      const secondPromise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: null })
      await flushMicrotasks()

      // First task was cancelled
      expect(firstTask.cancel).toHaveBeenCalled()

      // Second task replaced the first in the map
      const secondTask = renderer.renderTasks.get(key)
      expect(secondTask).toBeDefined()
      expect(secondTask).not.toBe(firstTask)

      // Let both renders complete
      // First render's deferred promise checks cancelled flag before settling
      // Since the first was cancelled, its resolve will reject with RenderingCancelledException
      deferredRenders[0].resolve()
      deferredRenders[1].resolve()

      const [r1, r2] = await Promise.all([firstPromise, secondPromise])
      expect(r1.status).toBe(PDF_RENDER_RESULT_STATUS.CANCELLED)
      expect(r2.status).toBe(PDF_RENDER_RESULT_STATUS.SUCCESS)
    })

    it('does not render the text layer during canvas rendering', async () => {
      const { PdfTextLayerRenderer } = await import('./PdfTextLayerRenderer.js')
      const canvas = createMockCanvas()
      const metric = { scale: 1 }
      const textLayer = new PdfTextLayerRenderer()

      const promise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: textLayer })
      await flushMicrotasks()
      deferredRenders[0].resolve()
      const result = await promise

      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.SUCCESS)
      expect(textLayer.render).not.toHaveBeenCalled()
    })

    it('renders directly to visible canvas when canvas has no existing content', async () => {
      const canvas = createMockCanvas()
      const metric = { scale: 2 }

      const promise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: null })
      await flushMicrotasks()

      const ctx = canvas.getContext.mock.results[0].value
      expect(canvas.width).toBe(1200)
      expect(canvas.height).toBe(1600)
      expect(ctx.drawImage).not.toHaveBeenCalled()

      deferredRenders[0].resolve()
      const result = await promise
      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.SUCCESS)
    })

    it('uses temp canvas and blit when canvas has existing content', async () => {
      const canvas = createMockCanvas(800, 600)
      const metric = { scale: 2 }

      const promise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: null })
      await flushMicrotasks()

      expect(canvas.width).toBe(800)
      expect(canvas.height).toBe(600)
      expect(canvas.style.width).toBe('1200px')
      expect(canvas.style.height).toBe('1600px')

      deferredRenders[0].resolve()
      const result = await promise

      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.SUCCESS)
      expect(canvas.width).toBe(1200)
      expect(canvas.height).toBe(1600)

      const ctx = canvas.getContext.mock.results[0].value
      expect(ctx.drawImage).toHaveBeenCalled()
    })

    it('preserves visible canvas content when temp render is cancelled', async () => {
      const canvas = createMockCanvas(800, 600)
      const metric = { scale: 2 }

      const promise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: null })
      await flushMicrotasks()

      expect(canvas.width).toBe(800)
      expect(canvas.height).toBe(600)

      renderer.cancelAll()

      expect(canvas.width).toBe(800)
      expect(canvas.height).toBe(600)

      deferredRenders[0].resolve()
      const result = await promise
      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.CANCELLED)
    })

    it('returns bitmap and identity raster plan on successful render', async () => {
      const mockBitmap = { width: 900, height: 1200, close: vi.fn() }
      mockCreateImageBitmap.mockResolvedValueOnce(mockBitmap)

      const canvas = createMockCanvas()
      const metric = { scale: 1.5 }

      const promise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: null })
      await flushMicrotasks()
      deferredRenders[0].resolve()
      const result = await promise

      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.SUCCESS)
      expect(result.bitmap).toBe(mockBitmap)
      expect(mockCreateImageBitmap).toHaveBeenCalled()
      expect(result.raster).toBeDefined()
      expect(Object.isFrozen(result.raster)).toBe(true)
      expect(result.raster.logicalWidth).toBe(900)
      expect(result.raster.logicalHeight).toBe(1200)
      expect(result.raster.backingWidth).toBe(900)
      expect(result.raster.backingHeight).toBe(1200)
      expect(result.raster.rasterScaleX).toBe(1)
      expect(result.raster.rasterScaleY).toBe(1)
      expect(result.raster.degraded).toBe(false)
      expect(result.raster.renderable).toBe(true)
    })

    it('returns no bitmap when createImageBitmap fails', async () => {
      mockCreateImageBitmap.mockRejectedValueOnce(new Error('bitmap creation failed'))

      const canvas = createMockCanvas()
      const metric = { scale: 1 }

      const promise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: null })
      await flushMicrotasks()
      deferredRenders[0].resolve()
      const result = await promise

      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.SUCCESS)
      expect(result.bitmap).toBeUndefined()
    })

    it('returns no bitmap on cancelled render', async () => {
      const canvas = createMockCanvas()
      const metric = { scale: 1 }

      const promise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: null })
      await flushMicrotasks()
      renderer.cancelAll()
      deferredRenders[0].resolve()
      const result = await promise

      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.CANCELLED)
      expect(result.bitmap).toBeUndefined()
      expect(mockCreateImageBitmap).not.toHaveBeenCalled()
    })

    it('returns no bitmap on failed render', async () => {
      const canvas = createMockCanvas()
      const metric = { scale: 1 }

      const result = await renderer.renderPage({ pdfDocument: null, metric, pageNumber: 1, canvas, textLayerRenderer: null })

      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.FAILED)
      expect(result.bitmap).toBeUndefined()
    })

    it('omits transform for identity raster plan', async () => {
      const canvas = createMockCanvas()
      const metric = { scale: 1.5 }

      const promise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: null })
      await flushMicrotasks()
      deferredRenders[0].resolve()
      await promise

      const page = await pdfDocument.getPage.mock.results[0].value
      expect(page.render).toHaveBeenCalled()
      const renderCall = page.render.mock.calls[0][0]
      expect(renderCall.transform).toBeUndefined()
    })

    it('supplies exact transform for degraded raster plan', async () => {
      resolvePdfRasterPlanMock.mockReturnValueOnce(createMockPlan({
        logicalWidth: 600,
        logicalHeight: 800,
        backingWidth: 300,
        backingHeight: 400,
        rasterScaleX: 0.5,
        rasterScaleY: 0.5,
        degraded: true
      }))

      const canvas = createMockCanvas()
      const metric = { scale: 1 }

      const promise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: null })
      await flushMicrotasks()
      deferredRenders[0].resolve()
      await promise

      const page = await pdfDocument.getPage.mock.results[0].value
      const renderCall = page.render.mock.calls[0][0]
      expect(renderCall.canvasContext).toBeDefined()
      expect(renderCall.viewport).toBeDefined()
      expect(renderCall.intent).toBe('display')
      expect(renderCall.transform).toEqual([0.5, 0, 0, 0.5, 0, 0])
    })

    it('returns FAILED with raster plan and skips render when plan is unrenderable', async () => {
      resolvePdfRasterPlanMock.mockReturnValueOnce(createMockPlan({ renderable: false }))

      const canvas = createMockCanvas()
      const metric = { scale: 1 }

      const result = await renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: null })

      expect(resolvePdfRasterPlanMock).toHaveBeenCalled()
      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.FAILED)
      expect(result.raster).toBeDefined()
      expect(result.raster.renderable).toBe(false)
      expect(result.bitmap).toBeNull()
      expect(mockCreateImageBitmap).not.toHaveBeenCalled()
      expect(pdfDocument.getPage).toHaveBeenCalled()
      const page = await pdfDocument.getPage.mock.results[0].value
      expect(page.render).not.toHaveBeenCalled()
    })
  })

  describe('two canvases rendering the same page', () => {
    it('both complete without cancelling each other', async () => {
      const canvasA = createMockCanvas()
      const canvasB = createMockCanvas()
      const metric = { scale: 1 }

      // Start both renders concurrently (as the two viewers would)
      // The key difference from the old code: now each canvas gets its own task key
      const promiseA = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas: canvasA, textLayerRenderer: null })
      const promiseB = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas: canvasB, textLayerRenderer: null })
      await flushMicrotasks()

      // Both should have created their render tasks without cancelling each other
      expect(renderer.renderTasks.size).toBe(2)

      // Resolve both renders
      deferredRenders[0].resolve()
      deferredRenders[1].resolve()

      const [resultA, resultB] = await Promise.all([promiseA, promiseB])
      expect(resultA.status).toBe(PDF_RENDER_RESULT_STATUS.SUCCESS)
      expect(resultB.status).toBe(PDF_RENDER_RESULT_STATUS.SUCCESS)

      // Both tasks cleaned up in finally blocks
      expect(renderer.renderTasks.size).toBe(0)
    })

    it('clearing one canvas does not cancel the other or remove its render task', async () => {
      const canvasA = createMockCanvas()
      const canvasB = createMockCanvas()
      const metric = { scale: 1 }

      // Start both renders
      renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas: canvasA, textLayerRenderer: null })
      renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas: canvasB, textLayerRenderer: null })
      await flushMicrotasks()

      // Both tasks stored independently
      expect(renderer.renderTasks.size).toBe(2)

      // Clear only canvasA's task
      renderer.clearPage(1, canvasA, null)

      // One task remains (canvasB's is untouched)
      expect(renderer.renderTasks.size).toBe(1)

      const remainingKey = [...renderer.renderTasks.keys()][0]
      expect(remainingKey.endsWith(renderer._getCanvasId(canvasB))).toBe(true)
    })
  })

  describe('clearPage', () => {
    it('cancels and removes only the matching canvas render task', () => {
      const canvasA = createMockCanvas()
      const canvasB = createMockCanvas()
      const taskA = { cancel: vi.fn(), promise: Promise.resolve() }
      const taskB = { cancel: vi.fn(), promise: Promise.resolve() }

      renderer.renderTasks.set(renderer._taskKey(1, canvasA), taskA)
      renderer.renderTasks.set(renderer._taskKey(1, canvasB), taskB)

      renderer.clearPage(1, canvasA, null)

      expect(taskA.cancel).toHaveBeenCalled()
      expect(taskB.cancel).not.toHaveBeenCalled()
      expect(renderer.renderTasks.size).toBe(1)
    })

    it('does nothing when no render task exists for the given page/canvas', () => {
      const canvas = createMockCanvas()
      expect(() => renderer.clearPage(99, canvas, null)).not.toThrow()
    })

    it('clears the canvas dimensions and content', () => {
      const canvas = createMockCanvas()
      canvas.width = 600
      canvas.height = 800

      renderer.clearPage(1, canvas, null)

      expect(canvas.width).toBe(0)
      expect(canvas.height).toBe(0)
    })
  })

  describe('cancelAll', () => {
    it('cancels every active render task and clears the map', () => {
      const canvasA = createMockCanvas()
      const canvasB = createMockCanvas()
      const taskA = { cancel: vi.fn(), promise: Promise.resolve() }
      const taskB = { cancel: vi.fn(), promise: Promise.resolve() }

      renderer.renderTasks.set(renderer._taskKey(1, canvasA), taskA)
      renderer.renderTasks.set(renderer._taskKey(2, canvasB), taskB)

      renderer.cancelAll()

      expect(taskA.cancel).toHaveBeenCalled()
      expect(taskB.cancel).toHaveBeenCalled()
      expect(renderer.renderTasks.size).toBe(0)
    })
  })

  describe('destroy', () => {
    it('cancels all render tasks', () => {
      const canvas = createMockCanvas()
      const task = { cancel: vi.fn(), promise: Promise.resolve() }

      renderer.renderTasks.set(renderer._taskKey(1, canvas), task)

      renderer.destroy()

      expect(task.cancel).toHaveBeenCalled()
      expect(renderer.renderTasks.size).toBe(0)
    })
  })
})
