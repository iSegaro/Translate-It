import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mapPageLocalCssRectToPdfRegion } from './PdfRegionMapper.js'

function buildPdf(objects) {
  let body = '%PDF-1.7\n'
  const offsets = [0]

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }

  const xrefOffset = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new TextEncoder().encode(body)
}

function cssRectForPdfRegion(viewport, region) {
  const points = [
    viewport.convertToViewportPoint(region.left, region.top),
    viewport.convertToViewportPoint(region.right, region.top),
    viewport.convertToViewportPoint(region.left, region.bottom),
    viewport.convertToViewportPoint(region.right, region.bottom)
  ]
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)

  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y
  }
}

describe('mapPageLocalCssRectToPdfRegion', () => {
  it('maps all four corners and normalizes mapped PDF axes', () => {
    const convertToPdfPoint = vi.fn()
      .mockReturnValueOnce([8, 3])
      .mockReturnValueOnce([2, 9])
      .mockReturnValueOnce([6, -4])
      .mockReturnValueOnce([-1, 5])

    const region = mapPageLocalCssRectToPdfRegion({
      pageNumber: 3,
      rect: { x: 10, y: 20, width: 30, height: 40 },
      viewport: { convertToPdfPoint }
    })

    expect(convertToPdfPoint).toHaveBeenCalledTimes(4)
    expect(convertToPdfPoint.mock.calls).toEqual([
      [10, 20],
      [40, 20],
      [10, 60],
      [40, 60]
    ])
    expect(region).toEqual({
      pageNumber: 3,
      left: -1,
      top: 9,
      right: 8,
      bottom: -4
    })
  })

  it('preserves fractional CSS coordinates and PDF y-axis semantics', () => {
    const viewport = {
      convertToPdfPoint: (x, y) => [x / 2, 100 - (y / 2)]
    }

    expect(mapPageLocalCssRectToPdfRegion({
      pageNumber: 1,
      rect: { x: 10.25, y: 20.5, width: 30.75, height: 40.25 },
      viewport
    })).toEqual({
      pageNumber: 1,
      left: 5.125,
      top: 89.75,
      right: 20.5,
      bottom: 69.625
    })
  })

  it.each([
    { x: 0, y: 0, width: 0, height: 10 },
    { x: 0, y: 0, width: 10, height: 0 },
    { x: 0, y: 0, width: -1, height: 10 },
    { x: 0, y: 0, width: 10, height: -1 }
  ])('rejects an empty or negative CSS rectangle: $rect', (rect) => {
    expect(mapPageLocalCssRectToPdfRegion({
      pageNumber: 1,
      rect,
      viewport: { convertToPdfPoint: vi.fn() }
    })).toBeNull()
  })

  it.each(['x', 'y', 'width', 'height'])('rejects a non-finite CSS %s value', (field) => {
    expect(mapPageLocalCssRectToPdfRegion({
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 10, height: 10, [field]: Infinity },
      viewport: { convertToPdfPoint: vi.fn() }
    })).toBeNull()
  })

  it('rejects a missing viewport conversion method', () => {
    expect(mapPageLocalCssRectToPdfRegion({
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      viewport: {}
    })).toBeNull()
  })

  it('rejects invalid page numbers through the mapper contract', () => {
    expect(mapPageLocalCssRectToPdfRegion({
      pageNumber: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      viewport: { convertToPdfPoint: (x, y) => [x, y] }
    })).toBeNull()
  })

  it.each([
    { point: [NaN, 10] },
    { point: [10, NaN] },
    { point: [undefined, 10] },
    { point: [10, undefined] }
  ])('rejects malformed viewport conversion output $point', ({ point }) => {
    expect(mapPageLocalCssRectToPdfRegion({
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      viewport: { convertToPdfPoint: () => point }
    })).toBeNull()
  })

  it('returns only a frozen canonical PdfRegion', () => {
    const region = mapPageLocalCssRectToPdfRegion({
      pageNumber: 2,
      rect: { x: 10, y: 20, width: 30, height: 40 },
      viewport: { convertToPdfPoint: (x, y) => [x, 100 - y] }
    })

    expect(Object.isFrozen(region)).toBe(true)
    expect(Object.keys(region)).toEqual(['pageNumber', 'left', 'top', 'right', 'bottom'])
    expect(region).not.toHaveProperty('rect')
    expect(region).not.toHaveProperty('viewport')
    expect(region).not.toHaveProperty('zoom')
    expect(region).not.toHaveProperty('canvas')
    expect(region).not.toHaveProperty('ocr')
    expect(region).not.toHaveProperty('feature')
  })
})

describe('mapPageLocalCssRectToPdfRegion with real pdf.js viewports', () => {
  let loadingTask
  let page

  beforeAll(async () => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = buildPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>',
      '<< /Length 0 >>\nstream\n\nendstream'
    ])
    loadingTask = getDocument({ data, disableWorker: true })
    const document = await loadingTask.promise
    page = await document.getPage(1)
  })

  afterAll(async () => {
    await loadingTask.destroy()
  })

  it.each([
    { rotation: 0, scale: 1 },
    { rotation: 90, scale: 1 },
    { rotation: 180, scale: 1 },
    { rotation: 270, scale: 1 },
    { rotation: 0, scale: 0.5 },
    { rotation: 0, scale: 2 }
  ])('preserves canonical geometry at rotation $rotation and zoom $scale', ({ rotation, scale }) => {
    const expected = {
      pageNumber: 1,
      left: 100,
      top: 500,
      right: 300,
      bottom: 200
    }
    const viewport = page.getViewport({ scale, rotation })
    const rect = cssRectForPdfRegion(viewport, expected)
    const region = mapPageLocalCssRectToPdfRegion({ pageNumber: 1, rect, viewport })

    expect(region.pageNumber).toBe(expected.pageNumber)
    expect(region.left).toBeCloseTo(expected.left)
    expect(region.top).toBeCloseTo(expected.top)
    expect(region.right).toBeCloseTo(expected.right)
    expect(region.bottom).toBeCloseTo(expected.bottom)
  })
})
