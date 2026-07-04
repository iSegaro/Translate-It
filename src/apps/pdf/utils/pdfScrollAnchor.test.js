import { describe, expect, it } from 'vitest'
import {
  findBestScrollAnchorTarget,
  getPageCanvasElement,
  captureScrollAnchor,
  restoreScrollAnchor,
  capturePdfBackedScrollAnchor,
  restorePdfBackedScrollAnchor
} from './pdfScrollAnchor.js'

const CONTAINER_HEIGHT = 500
const CONTAINER_WIDTH = 300

function buildPageElement(pageNumber, pageStep, scrollTop, { canvasOffset = 24, canvasHeight } = {}) {
  const top = (pageNumber - 1) * pageStep - scrollTop
  const height = pageStep
  const el = document.createElement('div')
  el.dataset.pageNumber = String(pageNumber)
  el.getBoundingClientRect = () => ({
    top, bottom: top + height, left: 0, right: CONTAINER_WIDTH,
    width: CONTAINER_WIDTH, height,
    x: 0, y: top
  })

  const cH = canvasHeight ?? (pageStep - 48)
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => ({
    top: top + canvasOffset, bottom: top + canvasOffset + cH,
    left: 0, right: CONTAINER_WIDTH,
    width: CONTAINER_WIDTH, height: cH,
    x: 0, y: top + canvasOffset
  })
  el.appendChild(canvas)

  return el
}

function buildContainer(scrollTop) {
  const container = document.createElement('div')
  container.scrollTop = scrollTop
  container.getBoundingClientRect = () => ({
    top: 0, bottom: CONTAINER_HEIGHT, left: 0, right: CONTAINER_WIDTH,
    width: CONTAINER_WIDTH, height: CONTAINER_HEIGHT,
    x: 0, y: 0
  })
  container.scrollTo = function ({ top }) {
    this.scrollTop = top
  }
  return container
}

function buildMockViewport() {
  return {
    convertToPdfPoint: (x, y) => [x / 2, y / 2],
    convertToViewportPoint: (x, y) => [x * 2, y * 2]
  }
}

function buildMockPdfSession(pages = {}) {
  pages.__default = pages.__default || buildMockViewport()
  return {
    getPageViewport: (pageNumber) => pages[pageNumber] || pages.__default
  }
}

function renderPages(container, pages) {
  for (const page of pages) {
    container.appendChild(page)
  }
}

describe('findBestScrollAnchorTarget', () => {
  it('returns null for null container', () => {
    expect(findBestScrollAnchorTarget(null, 'div')).toBeNull()
  })

  it('returns null when no pages match selector', () => {
    const container = buildContainer(0)
    expect(findBestScrollAnchorTarget(container, '.page')).toBeNull()
  })

  it('returns the page closest to top of viewport', () => {
    const scrollTop = 200
    const pageStep = 300
    const container = buildContainer(scrollTop)
    const pages = [
      buildPageElement(1, pageStep, scrollTop),
      buildPageElement(2, pageStep, scrollTop),
      buildPageElement(3, pageStep, scrollTop)
    ]
    renderPages(container, pages)

    const result = findBestScrollAnchorTarget(container, 'div')
    expect(result).not.toBeNull()
    expect(result.el).toBe(pages[1])
  })

  it('skips pages entirely above viewport', () => {
    const scrollTop = 700
    const pageStep = 300
    const container = buildContainer(scrollTop)
    const pages = [
      buildPageElement(1, pageStep, scrollTop),
      buildPageElement(2, pageStep, scrollTop),
      buildPageElement(3, pageStep, scrollTop)
    ]
    renderPages(container, pages)

    const result = findBestScrollAnchorTarget(container, 'div')
    expect(result).not.toBeNull()
    expect(result.el).toBe(pages[2])
  })

  it('skips pages entirely below viewport', () => {
    const scrollTop = 0
    const pageStep = 600
    const container = buildContainer(scrollTop)
    const pages = [
      buildPageElement(1, pageStep, scrollTop),
      buildPageElement(2, pageStep, scrollTop)
    ]
    renderPages(container, pages)

    const result = findBestScrollAnchorTarget(container, 'div')
    expect(result).not.toBeNull()
    expect(result.el).toBe(pages[0])
  })

  it('falls back to first visible page when none is closest', () => {
    const scrollTop = 50
    const pageStep = 200
    const container = buildContainer(scrollTop)
    const pages = [
      buildPageElement(1, pageStep, scrollTop),
      buildPageElement(2, pageStep, scrollTop)
    ]
    renderPages(container, pages)

    const result = findBestScrollAnchorTarget(container, 'div')
    expect(result).not.toBeNull()
    expect(result.el).toBe(pages[0])
  })
})

describe('getPageCanvasElement', () => {
  it('returns canvas element when present', () => {
    const el = document.createElement('div')
    const canvas = document.createElement('canvas')
    el.appendChild(canvas)
    expect(getPageCanvasElement(el)).toBe(canvas)
  })

  it('returns null when no canvas element', () => {
    const el = document.createElement('div')
    expect(getPageCanvasElement(el)).toBeNull()
  })

  it('returns null for null element', () => {
    expect(getPageCanvasElement(null)).toBeNull()
  })
})

describe('captureScrollAnchor', () => {
  it('returns null for null container', () => {
    expect(captureScrollAnchor(null, 'div')).toBeNull()
  })

  it('returns null for empty container', () => {
    const container = buildContainer(0)
    expect(captureScrollAnchor(container, 'div')).toBeNull()
  })

  it('returns pageNumber and offsetRatio for visible page', () => {
    const scrollTop = 150
    const pageStep = 300
    const container = buildContainer(scrollTop)
    const pages = [
      buildPageElement(1, pageStep, scrollTop),
      buildPageElement(2, pageStep, scrollTop)
    ]
    renderPages(container, pages)

    const result = captureScrollAnchor(container, 'div')
    expect(result).toEqual({
      pageNumber: 1,
      offsetRatio: 0.5
    })
  })

  it('returns null for invalid page number', () => {
    const container = buildContainer(0)
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200, x: 0, y: 0 })
    el.dataset.pageNumber = 'invalid'
    container.appendChild(el)

    expect(captureScrollAnchor(container, 'div')).toBeNull()
  })
})

describe('restoreScrollAnchor', () => {
  it('returns false for null anchor', () => {
    const container = buildContainer(0)
    expect(restoreScrollAnchor(null, container, 'div')).toBe(false)
  })

  it('returns false for null container', () => {
    expect(restoreScrollAnchor({ pageNumber: 1, offsetRatio: 0.5 }, null, 'div')).toBe(false)
  })

  it('returns false when page not found', () => {
    const container = buildContainer(0)
    expect(restoreScrollAnchor({ pageNumber: 99, offsetRatio: 0.5 }, container, 'div')).toBe(false)
  })

  it('restores scroll position from pageNumber and offsetRatio', () => {
    const scrollTop = 0
    const pageStep = 200
    const container = buildContainer(scrollTop)
    const pages = [
      buildPageElement(1, pageStep, scrollTop),
      buildPageElement(2, pageStep, scrollTop)
    ]
    renderPages(container, pages)

    const result = restoreScrollAnchor({ pageNumber: 2, offsetRatio: 0.25 }, container, 'div')
    expect(result).toBe(true)
    expect(container.scrollTop).toBe(250)
  })
})

describe('capturePdfBackedScrollAnchor', () => {
  it('returns null when no visible pages', () => {
    const container = buildContainer(0)
    const pdfSession = buildMockPdfSession()
    expect(capturePdfBackedScrollAnchor(container, 'div', pdfSession)).toBeNull()
  })

  it('returns null when canvas is missing', () => {
    const container = buildContainer(100)
    const el = document.createElement('div')
    el.dataset.pageNumber = '1'
    el.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200, x: 0, y: 0 })
    container.appendChild(el)

    const pdfSession = buildMockPdfSession()
    expect(capturePdfBackedScrollAnchor(container, 'div', pdfSession)).toBeNull()
  })

  it('returns anchor with pdfPoint for visible page', () => {
    const scrollTop = 200
    const pageStep = 300
    const container = buildContainer(scrollTop)
    const pages = [
      buildPageElement(1, pageStep, scrollTop),
      buildPageElement(2, pageStep, scrollTop)
    ]
    renderPages(container, pages)

    const pdfSession = buildMockPdfSession()
    const result = capturePdfBackedScrollAnchor(container, 'div', pdfSession)

    expect(result).not.toBeNull()
    expect(result.pageNumber).toBe(2)
    expect(result.pdfPoint).toEqual({ x: 75, y: -62 })
    expect(typeof result.offsetRatio).toBe('number')
    expect(result.owner).toBeUndefined()
  })

  it('returns null when pdfSession is null', () => {
    const scrollTop = 100
    const pageStep = 200
    const container = buildContainer(scrollTop)
    const pages = [buildPageElement(1, pageStep, scrollTop)]
    renderPages(container, pages)

    expect(capturePdfBackedScrollAnchor(container, 'div', null)).toBeNull()
  })

  it('handles cssY computation from canvas offset', () => {
    const scrollTop = 0
    const pageStep = 400
    const container = buildContainer(scrollTop)
    const pages = [buildPageElement(1, pageStep, scrollTop)]
    renderPages(container, pages)

    const pdfSession = buildMockPdfSession()
    const result = capturePdfBackedScrollAnchor(container, 'div', pdfSession)

    expect(result).not.toBeNull()
    expect(result.pdfPoint).toEqual({ x: 75, y: -12 })
    expect(result.owner).toBeUndefined()
  })
})

describe('restorePdfBackedScrollAnchor', () => {
  it('returns false for anchor without pdfPoint', () => {
    const container = buildContainer(0)
    const pdfSession = buildMockPdfSession()
    expect(restorePdfBackedScrollAnchor({ pageNumber: 1 }, container, 'div', pdfSession)).toBe(false)
  })

  it('returns false for null container', () => {
    const pdfSession = buildMockPdfSession()
    expect(restorePdfBackedScrollAnchor(
      { pageNumber: 1, pdfPoint: { x: 100, y: 50 } }, null, 'div', pdfSession
    )).toBe(false)
  })

  it('returns false when page not found', () => {
    const container = buildContainer(0)
    const pdfSession = buildMockPdfSession()
    expect(restorePdfBackedScrollAnchor(
      { pageNumber: 99, pdfPoint: { x: 100, y: 50 } }, container, 'div', pdfSession
    )).toBe(false)
  })

  it('returns false when canvas not found', () => {
    const container = buildContainer(0)
    const el = document.createElement('div')
    el.dataset.pageNumber = '1'
    el.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200, x: 0, y: 0 })
    container.appendChild(el)

    const pdfSession = buildMockPdfSession({ 1: buildMockViewport() })
    expect(restorePdfBackedScrollAnchor(
      { pageNumber: 1, pdfPoint: { x: 100, y: 50 } }, container, 'div', pdfSession
    )).toBe(false)
  })

  it('returns false when pdfSession is null', () => {
    const scrollTop = 0
    const pageStep = 200
    const container = buildContainer(scrollTop)
    const pages = [buildPageElement(1, pageStep, scrollTop)]
    renderPages(container, pages)

    expect(restorePdfBackedScrollAnchor(
      { pageNumber: 1, pdfPoint: { x: 100, y: 50 } }, container, 'div', null
    )).toBe(false)
  })

  it('restores scroll from pdfPoint using viewport conversion', () => {
    const scrollTop = 0
    const pageStep = 400
    const canvasOffset = 24
    const container = buildContainer(scrollTop)
    const pages = [buildPageElement(1, pageStep, scrollTop, { canvasOffset })]
    renderPages(container, pages)

    const mockViewport = {
      convertToViewportPoint: (x, y) => [x * 2, y * 2]
    }
    const pdfSession = { getPageViewport: () => mockViewport }

    const result = restorePdfBackedScrollAnchor(
      { pageNumber: 1, pdfPoint: { x: 75, y: 18 } }, container, 'div', pdfSession
    )

    expect(result).toBe(true)
    expect(container.scrollTop).toBe(canvasOffset + 36)
  })
})
