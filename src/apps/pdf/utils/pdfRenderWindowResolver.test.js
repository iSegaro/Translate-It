import { describe, expect, it } from 'vitest'
import { computeVisiblePages, expandRenderWindow, resolveRenderWindow } from './pdfRenderWindowResolver.js'

function buildRect(top, height, width = 300) {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: width,
    width,
    height,
    x: 0,
    y: top
  }
}

function buildContainer({ scrollTop = 0, height = 500 } = {}) {
  const container = document.createElement('div')
  container.scrollTop = scrollTop
  Object.defineProperty(container, 'clientHeight', {
    configurable: true,
    value: height
  })
  container.getBoundingClientRect = () => buildRect(0, height)
  return container
}

function appendPage(container, pageNumber, top, height = 200) {
  const page = document.createElement('article')
  page.className = 'page'
  page.dataset.pageNumber = String(pageNumber)
  page.getBoundingClientRect = () => buildRect(top, height)
  container.appendChild(page)
}

describe('pdfRenderWindowResolver', () => {
  it('computes visible pages by geometry overlap', () => {
    expect(computeVisiblePages({
      scrollTop: 100,
      viewportHeight: 300,
      pageGeometries: [
        { pageNumber: 1, top: 0, bottom: 99 },
        { pageNumber: 2, top: 100, bottom: 250 },
        { pageNumber: 3, top: 260, bottom: 500 },
        { pageNumber: 4, top: 500, bottom: 700 }
      ]
    })).toEqual([2, 3])
  })

  it('expands render window with page buffer', () => {
    expect(expandRenderWindow({
      visiblePages: [3, 4],
      pageGeometries: [
        { pageNumber: 1 },
        { pageNumber: 2 },
        { pageNumber: 3 },
        { pageNumber: 4 },
        { pageNumber: 5 }
      ],
      bufferPages: 1
    })).toEqual([2, 3, 4, 5])
  })

  it('resolves visible pages, render pages, and primary page from container geometry', () => {
    const container = buildContainer({ scrollTop: 100, height: 300 })
    appendPage(container, 1, -100, 150)
    appendPage(container, 2, 60, 150)
    appendPage(container, 3, 220, 150)
    appendPage(container, 4, 390, 150)

    expect(resolveRenderWindow({
      container,
      pageSelector: '.page',
      bufferPages: 1
    })).toEqual({
      visiblePages: [1, 2, 3],
      renderPages: [1, 2, 3, 4],
      primaryPage: 2
    })
  })

  it('returns empty window for missing container', () => {
    expect(resolveRenderWindow({ container: null, pageSelector: '.page' })).toEqual({
      visiblePages: [],
      renderPages: [],
      primaryPage: null
    })
  })
})
