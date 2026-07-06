import { describe, expect, it } from 'vitest'
import { buildSyncState, mapAnchorToTargetScroll, syncScroll } from './pdfGeometrySyncEngine.js'

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

function buildContainer({ scrollTop = 0, height = 500 } = {}) {
  const container = document.createElement('div')
  container.scrollTop = scrollTop
  container.getBoundingClientRect = () => buildRect(0, height)
  return container
}

function appendPage(container, pageNumber, top, height, className = 'page') {
  const page = document.createElement('article')
  page.className = className
  page.dataset.pageNumber = String(pageNumber)
  page.getBoundingClientRect = () => buildRect(top, height)
  container.appendChild(page)
  return page
}

describe('pdfGeometrySyncEngine', () => {
  it('builds sync state from source geometry', () => {
    const source = buildContainer({ scrollTop: 250 })
    const target = buildContainer()
    appendPage(source, 1, -250, 200)
    appendPage(source, 2, -250, 400)
    appendPage(target, 2, 100, 800)

    const state = buildSyncState({
      sourceScrollTop: 250,
      sourceContainer: source,
      targetContainer: target,
      pageSelector: '.page'
    })

    expect(state.pageNumber).toBe(2)
    expect(state.pageRatio).toBe(0.625)
    expect(state.sourceAnchor).toEqual({
      pageNumber: 2,
      pageRatio: 0.625,
      source: 'geometry'
    })
  })

  it('maps canonical anchor to target scroll position', () => {
    const targetGeometries = [
      { pageNumber: 1, top: 0, height: 300 },
      { pageNumber: 2, top: 400, height: 800 }
    ]

    expect(mapAnchorToTargetScroll({
      canonicalAnchor: { pageNumber: 2, pageRatio: 0.25, source: 'geometry' },
      targetGeometryModel: targetGeometries
    })).toBe(600)
  })

  it('computes target scroll without mutating target container', () => {
    const source = buildContainer({ scrollTop: 250 })
    const target = buildContainer({ scrollTop: 10 })
    appendPage(source, 1, -250, 200)
    appendPage(source, 2, -250, 400)
    appendPage(target, 1, 0, 300)
    appendPage(target, 2, 390, 800)

    const result = syncScroll({
      sourceScrollTop: 250,
      sourceContainer: source,
      targetContainer: target,
      pageSelector: '.page'
    })

    expect(result.pageNumber).toBe(2)
    expect(result.targetScrollTop).toBe(900)
    expect(target.scrollTop).toBe(10)
  })

  it('returns null target scroll when source page is missing in target', () => {
    const source = buildContainer({ scrollTop: 250 })
    const target = buildContainer()
    appendPage(source, 2, 0, 400)
    appendPage(target, 1, 0, 300)

    const result = syncScroll({
      sourceScrollTop: 250,
      sourceContainer: source,
      targetContainer: target,
      pageSelector: '.page'
    })

    expect(result.pageNumber).toBe(2)
    expect(result.targetScrollTop).toBeNull()
  })

  it('returns empty state when source geometry is unavailable', () => {
    const target = buildContainer()

    const result = syncScroll({
      sourceScrollTop: 100,
      sourceContainer: null,
      targetContainer: target,
      pageSelector: '.page'
    })

    expect(result.sourceAnchor).toBeNull()
    expect(result.pageNumber).toBeNull()
    expect(result.targetScrollTop).toBeNull()
  })
})
