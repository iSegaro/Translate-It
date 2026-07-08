import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./PdfTextLayerRenderer.js', () => ({
  PdfTextLayerRenderer: class PdfTextLayerRenderer {
    render = vi.fn().mockResolvedValue(undefined)
    clear = vi.fn()
  }
}))

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
    drawImage: vi.fn()
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
    drawImage: vi.fn()
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
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PdfRenderer', () => {
  let renderer
  let pdfDocument
  let deferredRenders

  beforeEach(() => {
    deferredRenders = []
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

    it('renders text layer when PdfTextLayerRenderer is provided and render succeeds', async () => {
      const { PdfTextLayerRenderer } = await import('./PdfTextLayerRenderer.js')
      const canvas = createMockCanvas()
      const metric = { scale: 1 }
      const textLayer = new PdfTextLayerRenderer()

      const promise = renderer.renderPage({ pdfDocument, metric, pageNumber: 1, canvas, textLayerRenderer: textLayer })
      await flushMicrotasks()
      deferredRenders[0].resolve()
      const result = await promise

      expect(result.status).toBe(PDF_RENDER_RESULT_STATUS.SUCCESS)
      expect(textLayer.render).toHaveBeenCalled()
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

  describe('scheduleCleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('cancels all render tasks for pages not in the visible set', () => {
      const canvas1 = createMockCanvas()
      const canvas2 = createMockCanvas()
      const task1 = { cancel: vi.fn(), promise: Promise.resolve() }
      const task2 = { cancel: vi.fn(), promise: Promise.resolve() }

      renderer.renderTasks.set(renderer._taskKey(1, canvas1), task1)
      renderer.renderTasks.set(renderer._taskKey(2, canvas2), task2)

      renderer.scheduleCleanup(new Set([1]))
      vi.advanceTimersByTime(200)

      expect(task1.cancel).not.toHaveBeenCalled()
      expect(task2.cancel).toHaveBeenCalled()
    })

    it('preserves all render tasks when all pages are visible', () => {
      const canvas1 = createMockCanvas()
      const canvas2 = createMockCanvas()
      const task1 = { cancel: vi.fn(), promise: Promise.resolve() }
      const task2 = { cancel: vi.fn(), promise: Promise.resolve() }

      renderer.renderTasks.set(renderer._taskKey(1, canvas1), task1)
      renderer.renderTasks.set(renderer._taskKey(2, canvas2), task2)

      renderer.scheduleCleanup(new Set([1, 2]))
      vi.advanceTimersByTime(200)

      expect(task1.cancel).not.toHaveBeenCalled()
      expect(task2.cancel).not.toHaveBeenCalled()
    })

    it('cancels tasks for all canvases when their page is not visible', () => {
      const canvasA = createMockCanvas()
      const canvasB = createMockCanvas()
      const taskA = { cancel: vi.fn(), promise: Promise.resolve() }
      const taskB = { cancel: vi.fn(), promise: Promise.resolve() }

      renderer.renderTasks.set(renderer._taskKey(2, canvasA), taskA)
      renderer.renderTasks.set(renderer._taskKey(2, canvasB), taskB)

      renderer.scheduleCleanup(new Set([1]))
      vi.advanceTimersByTime(200)

      expect(taskA.cancel).toHaveBeenCalled()
      expect(taskB.cancel).toHaveBeenCalled()
    })

    it('debounces and resets the timer on each call', () => {
      const canvas = createMockCanvas()
      const task = { cancel: vi.fn(), promise: Promise.resolve() }

      renderer.renderTasks.set(renderer._taskKey(1, canvas), task)
      renderer.scheduleCleanup(new Set())
      renderer.scheduleCleanup(new Set([1]))

      vi.advanceTimersByTime(200)
      expect(task.cancel).not.toHaveBeenCalled()

      vi.advanceTimersByTime(200)
      expect(task.cancel).not.toHaveBeenCalled()
    })

    it('calls the onCleanup callback after the cleanup delay', () => {
      const onCleanup = vi.fn()

      renderer.scheduleCleanup(new Set([1]), onCleanup)
      expect(onCleanup).not.toHaveBeenCalled()

      vi.advanceTimersByTime(200)
      expect(onCleanup).toHaveBeenCalledTimes(1)
    })

    it('does not call onCleanup when rescheduled before timeout fires', () => {
      const onCleanup = vi.fn()

      renderer.scheduleCleanup(new Set([1]), onCleanup)
      renderer.scheduleCleanup(new Set([1]))

      vi.advanceTimersByTime(200)
      expect(onCleanup).not.toHaveBeenCalled()
    })

    it('calls onCleanup for the most recent scheduled cleanup', () => {
      const firstCleanup = vi.fn()
      const secondCleanup = vi.fn()

      renderer.scheduleCleanup(new Set([1]), firstCleanup)
      renderer.scheduleCleanup(new Set([1]), secondCleanup)

      vi.advanceTimersByTime(200)
      expect(firstCleanup).not.toHaveBeenCalled()
      expect(secondCleanup).toHaveBeenCalledTimes(1)
    })
  })

  describe('destroy', () => {
    it('cancels scheduled cleanup and all render tasks', () => {
      vi.useFakeTimers()

      const canvas = createMockCanvas()
      const task = { cancel: vi.fn(), promise: Promise.resolve() }

      renderer.renderTasks.set(renderer._taskKey(1, canvas), task)
      renderer.scheduleCleanup(new Set())

      renderer.destroy()

      expect(task.cancel).toHaveBeenCalled()
      expect(renderer.renderTasks.size).toBe(0)

      vi.advanceTimersByTime(200)

      vi.useRealTimers()
    })
  })
})
