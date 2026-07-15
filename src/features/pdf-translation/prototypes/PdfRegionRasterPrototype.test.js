import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderPdfRegionPrototype } from './PdfRegionRasterPrototype.js'

function buildPdf(objects) {
  let body = '%PDF-1.7\n'
  const offsets = [0]
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(body)
}

async function createPage() {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream'
  ])
  const loadingTask = getDocument({ data, disableWorker: true })
  const document = await loadingTask.promise
  const page = await document.getPage(1)
  return { loadingTask, page }
}

function createCanvas() {
  return { width: 0, height: 0 }
}

function completedRender() {
  return { promise: Promise.resolve(), cancel: vi.fn() }
}

async function render({ rotation = 0, currentScale = 1, targetScale = 2, rect, minimumSize, isCurrent } = {}) {
  const { loadingTask, page } = await createPage()
  const currentViewport = page.getViewport({ scale: currentScale, rotation })
  const renderSpy = vi.spyOn(page, 'render').mockImplementation(completedRender)
  const canvases = []
  const operation = renderPdfRegionPrototype({
    page,
    currentViewport,
    rect: rect || { x: 100, y: 150, width: 200, height: 100 },
    targetScale,
    minimumSize,
    isCurrent,
    createCanvas: () => {
      const canvas = createCanvas()
      canvases.push(canvas)
      return canvas
    },
    now: (() => {
      let value = 0
      return () => value += 5
    })()
  })

  try {
    return { result: await operation.promise, operation, currentViewport, renderSpy, canvases }
  } finally {
    await loadingTask.destroy()
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PdfRegionRasterPrototype', () => {
  it.each([0, 90, 180, 270])('maps and renders rotation %i with real pdf.js viewports', async (rotation) => {
    const { result, renderSpy, canvases } = await render({ rotation })

    expect(result.diagnostics.rotation).toBe(rotation)
    expect(result.diagnostics.targetCanvasWidth).toBe(400)
    expect(result.diagnostics.targetCanvasHeight).toBe(200)
    expect(result.diagnostics.targetPixelCount).toBe(80000)
    expect(result.diagnostics.fullPagePixelCount).toBe(612 * 2 * 792 * 2)
    expect(canvases).toHaveLength(1)
    expect(renderSpy).toHaveBeenCalledWith(expect.objectContaining({
      canvas: result.canvas,
      transform: [1, 0, 0, 1, -result.diagnostics.mappedBounds.x, -result.diagnostics.mappedBounds.y]
    }))
    result.release()
    expect(result.canvas).toMatchObject({ width: 0, height: 0 })
  })

  it.each([
    { currentScale: 0.5, targetScale: 1.5 },
    { currentScale: 2, targetScale: 1 }
  ])('maps zoom $currentScale to target scale $targetScale', async ({ currentScale, targetScale }) => {
    const { result } = await render({ currentScale, targetScale })
    const ratio = targetScale / currentScale

    expect(result.diagnostics.targetCanvasWidth).toBe(Math.ceil(200 * ratio))
    expect(result.diagnostics.targetCanvasHeight).toBe(Math.ceil(100 * ratio))
  })

  it('uses floor origin and ceil far edge for fractional bounds', async () => {
    const { result } = await render({
      currentScale: 1,
      targetScale: 1.5,
      rect: { x: 10.25, y: 20.5, width: 30.25, height: 40.25 }
    })

    expect(result.diagnostics.mappedBounds).toMatchObject({ x: 15, y: 30, width: 46, height: 62 })
  })

  it('clamps regions touching or extending beyond page bounds', async () => {
    const edge = await render({ rect: { x: 600, y: 780, width: 12, height: 12 }, targetScale: 1 })
    expect(edge.result.diagnostics.inputRect).toEqual({ x: 600, y: 780, width: 12, height: 12 })
    expect(edge.result.diagnostics.targetCanvasWidth).toBe(12)
    expect(edge.result.diagnostics.targetCanvasHeight).toBe(12)

    const outside = await render({ rect: { x: -20, y: -10, width: 50, height: 40 }, targetScale: 1 })
    expect(outside.result.diagnostics.inputRect).toEqual({ x: 0, y: 0, width: 30, height: 30 })
  })

  it('rejects a tiny region when caller supplies minimum policy', async () => {
    await expect(render({
      rect: { x: 10, y: 10, width: 9, height: 9 },
      minimumSize: { width: 10, height: 10 }
    })).rejects.toThrow('below minimum selection size')
  })

  it('allocates a fresh region-sized canvas for repeated renders', async () => {
    const first = await render({ rect: { x: 0, y: 0, width: 20, height: 30 }, targetScale: 3 })
    const second = await render({ rect: { x: 0, y: 0, width: 20, height: 30 }, targetScale: 3 })

    expect(first.result.canvas).not.toBe(second.result.canvas)
    expect(first.result.canvas).toMatchObject({ width: 60, height: 90 })
    expect(second.result.canvas).toMatchObject({ width: 60, height: 90 })
  })

  it('exposes render-task cancellation', async () => {
    const { loadingTask, page } = await createPage()
    const currentViewport = page.getViewport({ scale: 1 })
    let rejectRender
    const cancel = vi.fn(() => rejectRender(Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' })))
    vi.spyOn(page, 'render').mockReturnValue({
      promise: new Promise((_, reject) => { rejectRender = reject }),
      cancel
    })
    const canvas = createCanvas()
    const operation = renderPdfRegionPrototype({
      page,
      currentViewport,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      targetScale: 1,
      createCanvas: () => canvas
    })

    operation.cancel()
    await expect(operation.promise).rejects.toMatchObject({ name: 'RenderingCancelledException' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(canvas).toMatchObject({ width: 0, height: 0 })
    await loadingTask.destroy()
  })

  it('suppresses a result after document replacement', async () => {
    let current = true
    const { loadingTask, page } = await createPage()
    const currentViewport = page.getViewport({ scale: 1 })
    let finishRender
    vi.spyOn(page, 'render').mockReturnValue({
      promise: new Promise(resolve => { finishRender = resolve }),
      cancel: vi.fn()
    })
    const canvas = createCanvas()
    const operation = renderPdfRegionPrototype({
      page,
      currentViewport,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      targetScale: 1,
      createCanvas: () => canvas,
      isCurrent: () => current
    })

    current = false
    finishRender()
    await expect(operation.promise).rejects.toThrow('became stale')
    expect(canvas).toMatchObject({ width: 0, height: 0 })
    await loadingTask.destroy()
  })
})
