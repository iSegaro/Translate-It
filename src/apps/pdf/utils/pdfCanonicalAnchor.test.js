import { describe, expect, it } from 'vitest'
import {
  ANCHOR_SOURCE,
  createCanonicalAnchor,
  normalizeCanonicalAnchor,
  resolveDOMScrollFromAnchor,
  resolvePDFPointFromAnchor,
  toCanonicalAnchorFromDOM,
  toCanonicalAnchorFromPDF,
  toLegacyScrollAnchor
} from './pdfCanonicalAnchor.js'

function buildRect(top, height, width = 300, left = 0) {
  return {
    top,
    bottom: top + height,
    left,
    right: left + width,
    width,
    height,
    x: left,
    y: top
  }
}

function buildContainer({ scrollTop = 0, scrollLeft = 0, height = 500, width = 300 } = {}) {
  const container = document.createElement('div')
  container.scrollTop = scrollTop
  container.scrollLeft = scrollLeft
  Object.defineProperty(container, 'scrollHeight', {
    configurable: true,
    value: 1000
  })
  Object.defineProperty(container, 'clientHeight', {
    configurable: true,
    value: height
  })
  container.getBoundingClientRect = () => buildRect(0, height, width)
  return container
}

function buildPage(pageNumber, top, height = 200, left = 0) {
  const page = document.createElement('article')
  page.dataset.pageNumber = String(pageNumber)
  page.getBoundingClientRect = () => buildRect(top, height, 300, left)
  return page
}

function buildViewport() {
  return {
    height: 400,
    convertToViewportPoint: (x, y) => [x * 2, y * 2],
    convertToPdfPoint: (x, y) => [x / 2, y / 2]
  }
}

describe('pdfCanonicalAnchor', () => {
  it('creates normalized canonical anchors', () => {
    expect(createCanonicalAnchor({ pageNumber: 2, pageRatio: 1.4, source: 'invalid' })).toEqual({
      pageNumber: 2,
      pageRatio: 1,
      source: ANCHOR_SOURCE.GEOMETRY
    })
  })

  it('returns null for invalid page number', () => {
    expect(createCanonicalAnchor({ pageNumber: 0 })).toBeNull()
  })

  it('converts DOM page geometry to canonical anchor', () => {
    const container = buildContainer({ scrollTop: 150, scrollLeft: 10 })
    const page = buildPage(3, -50, 200, 20)

    expect(toCanonicalAnchorFromDOM(page, container)).toEqual({
      pageNumber: 3,
      pageRatio: 0.25,
      source: ANCHOR_SOURCE.DOM,
      domOffset: {
        top: 100,
        left: 30
      }
    })
  })

  it('converts PDF point to canonical anchor', () => {
    const anchor = toCanonicalAnchorFromPDF({ x: 50, y: 100 }, 4, buildViewport())

    expect(anchor).toEqual({
      pageNumber: 4,
      pageRatio: 0.5,
      source: ANCHOR_SOURCE.PDF,
      pdfPoint: {
        x: 50,
        y: 100
      }
    })
  })

  it('resolves DOM scroll target from page geometry', () => {
    const anchor = createCanonicalAnchor({ pageNumber: 2, pageRatio: 0.25 })
    const geometry = { pageNumber: 2, top: 300, height: 400 }

    expect(resolveDOMScrollFromAnchor(anchor, geometry)).toBe(400)
  })

  it('falls back to DOM offset when page geometry is missing', () => {
    const anchor = createCanonicalAnchor({
      pageNumber: 2,
      pageRatio: 0.25,
      domOffset: { top: 123, left: 0 }
    })

    expect(resolveDOMScrollFromAnchor(anchor, null)).toBe(123)
  })

  it('resolves PDF point from precise anchor first', () => {
    const anchor = createCanonicalAnchor({
      pageNumber: 1,
      pageRatio: 0.5,
      pdfPoint: { x: 10, y: 20 }
    })

    expect(resolvePDFPointFromAnchor(anchor, buildViewport())).toEqual({ x: 10, y: 20 })
  })

  it('derives PDF point from page ratio when precise point is absent', () => {
    const anchor = createCanonicalAnchor({
      pageNumber: 1,
      pageRatio: 0.5,
      domOffset: { top: 0, left: 40 }
    })

    expect(resolvePDFPointFromAnchor(anchor, buildViewport())).toEqual({ x: 20, y: 100 })
  })

  it('normalizes legacy DOM and PDF anchor shapes', () => {
    expect(normalizeCanonicalAnchor({ pageNumber: 1, offsetRatio: 0.2 })).toEqual({
      pageNumber: 1,
      pageRatio: 0.2,
      source: ANCHOR_SOURCE.DOM
    })

    expect(normalizeCanonicalAnchor({ pageNumber: 1, offsetRatio: 0.2, pdfPoint: { x: 1, y: 2 } })).toEqual({
      pageNumber: 1,
      pageRatio: 0.2,
      source: ANCHOR_SOURCE.PDF,
      pdfPoint: { x: 1, y: 2 }
    })
  })

  it('converts canonical anchor to legacy scroll anchor shape', () => {
    expect(toLegacyScrollAnchor({
      pageNumber: 5,
      pageRatio: 0.75,
      source: ANCHOR_SOURCE.PDF,
      pdfPoint: { x: 10, y: 20 }
    })).toEqual({
      pageNumber: 5,
      offsetRatio: 0.75,
      pdfPoint: { x: 10, y: 20 }
    })
  })
})
