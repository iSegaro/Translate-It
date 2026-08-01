import { describe, expect, it } from 'vitest'
import {
  findPrimaryPageGeometry,
  getCanvasScrollTop,
  getElementClientMetrics,
  getPageGeometry,
  getPageGeometries,
  getPageRatio,
  getScrollMetrics,
  getScrollSpaceTop,
  resolvePageFromScroll
} from './pdfGeometryModel.js'

const CONTAINER_HEIGHT = 500
const CONTAINER_WIDTH = 300

function buildRect(top, height, width = CONTAINER_WIDTH, left = 0) {
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

function buildContainer({ scrollTop = 0, scrollHeight = 1200, clientHeight = CONTAINER_HEIGHT } = {}) {
  const container = document.createElement('div')
  container.scrollTop = scrollTop
  Object.defineProperty(container, 'scrollHeight', {
    configurable: true,
    value: scrollHeight
  })
  Object.defineProperty(container, 'clientHeight', {
    configurable: true,
    value: clientHeight
  })
  container.getBoundingClientRect = () => buildRect(0, clientHeight)
  return container
}

function buildPage(pageNumber, top, height = 200) {
  const page = document.createElement('article')
  page.dataset.pageNumber = String(pageNumber)
  page.className = 'pdf-page'
  page.getBoundingClientRect = () => buildRect(top, height)
  return page
}

describe('pdfGeometryModel', () => {
  it('returns scroll metrics with bounded max scroll top', () => {
    const container = buildContainer({ scrollTop: 120, scrollHeight: 900, clientHeight: 300 })

    expect(getScrollMetrics(container)).toEqual({
      scrollTop: 120,
      scrollHeight: 900,
      clientHeight: 300,
      maxScrollTop: 600
    })
  })

  it('returns element client metrics', () => {
    const container = buildContainer({ clientHeight: 320 })
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 640
    })

    expect(getElementClientMetrics(container)).toEqual({
      width: 640,
      height: 320
    })
  })

  it('returns page geometry in scroll space', () => {
    const container = buildContainer({ scrollTop: 100 })
    const page = buildPage(2, 50, 250)

    expect(getPageGeometry(page, container)).toMatchObject({
      pageNumber: 2,
      top: 150,
      bottom: 400,
      height: 250,
      width: 300,
      centerY: 275,
      visibilityHint: 1
    })
  })

  it('collects page geometries for selector matches only', () => {
    const container = buildContainer()
    container.appendChild(buildPage(1, 0))
    container.appendChild(document.createElement('div'))
    container.appendChild(buildPage(2, 220))

    expect(getPageGeometries(container, '.pdf-page').map((page) => page.pageNumber)).toEqual([1, 2])
  })

  it('resolves page deterministically from sorted page geometries', () => {
    const pages = [
      { pageNumber: 1, top: 0, height: 200 },
      { pageNumber: 2, top: 220, height: 200 },
      { pageNumber: 3, top: 440, height: 200 }
    ]

    expect(resolvePageFromScroll(0, pages).pageNumber).toBe(1)
    expect(resolvePageFromScroll(221, pages).pageNumber).toBe(2)
    expect(resolvePageFromScroll(999, pages).pageNumber).toBe(3)
  })

  it('returns clamped page ratio', () => {
    const page = { top: 100, height: 200 }

    expect(getPageRatio(150, page)).toBe(0.25)
    expect(getPageRatio(0, page)).toBe(0)
    expect(getPageRatio(400, page)).toBe(1)
  })

  it('maps element and canvas coordinates into scroll space', () => {
    const container = buildContainer({ scrollTop: 80 })
    const element = buildPage(1, 20, 200)

    expect(getScrollSpaceTop(element, container)).toBe(100)
    expect(getCanvasScrollTop(element, container, 42)).toBe(142)
  })

  it('finds same primary visible page policy as legacy resolver', () => {
    const container = buildContainer({ scrollTop: 200 })
    const pages = [
      buildPage(1, -200, 300),
      buildPage(2, 100, 300),
      buildPage(3, 400, 300)
    ]
    pages.forEach((page) => container.appendChild(page))

    const result = findPrimaryPageGeometry(container, '.pdf-page')

    expect(result.pageNumber).toBe(2)
    expect(result.el).toBe(pages[1])
  })
})
