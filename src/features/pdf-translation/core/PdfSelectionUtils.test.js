import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildPdfSelectionPayload,
  buildPdfSelectionPosition,
  buildPdfSelectionText,
  isSelectionInsidePdfTextLayer
} from './PdfSelectionUtils.js'

function createSelection({ text = 'Hello PDF', rect = { left: 10, top: 10, width: 80, height: 18, bottom: 28 }, insideViewer = true } = {}) {
  const viewerRoot = document.createElement('div')
  const textLayer = document.createElement('div')
  textLayer.className = 'textLayer'
  const span = document.createElement('span')
  span.textContent = text
  textLayer.append(span)
  viewerRoot.append(textLayer)

  const outsideRoot = document.createElement('div')
  const outsideSpan = document.createElement('span')
  outsideSpan.textContent = text
  outsideRoot.append(outsideSpan)

  const startContainer = insideViewer ? span : outsideSpan
  const endContainer = startContainer

  const selection = {
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({
      startContainer,
      endContainer,
      getBoundingClientRect: () => rect
    }),
    toString: () => text
  }

  return { selection, viewerRoot }
}

function mockPdfViewport({ width = 1024, height = 768, scrollX = 0, scrollY = 0 } = {}) {
  const restoreTargets = []

  const define = (target, property, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, property)
    restoreTargets.push({ target, property, descriptor })
    Object.defineProperty(target, property, {
      configurable: true,
      value
    })
  }

  define(window, 'scrollX', scrollX)
  define(window, 'scrollY', scrollY)
  define(window, 'innerHeight', height)
  define(document.documentElement, 'clientWidth', width)

  return () => {
    for (const { target, property, descriptor } of restoreTargets.reverse()) {
      if (descriptor) {
        Object.defineProperty(target, property, descriptor)
      } else {
        delete target[property]
      }
    }
  }
}

describe('PdfSelectionUtils', () => {
  let restoreViewport

  beforeEach(() => {
    restoreViewport = mockPdfViewport()
  })

  afterEach(() => {
    restoreViewport?.()
    restoreViewport = null
  })

  it('builds text and position for a selection inside the PDF text layer', () => {
    const { selection, viewerRoot } = createSelection()

    expect(isSelectionInsidePdfTextLayer(selection, viewerRoot)).toBe(true)
    expect(buildPdfSelectionText(selection)).toBe('Hello PDF')
    expect(buildPdfSelectionPosition(selection)).toMatchObject({
      x: 38,
      y: 31,
      width: 80,
      height: 18
    })
    expect(buildPdfSelectionPayload(selection, viewerRoot)).toMatchObject({
      text: 'Hello PDF'
    })
  })

  it('clamps the icon near the left viewport edge', () => {
    restoreViewport?.()
    restoreViewport = mockPdfViewport({
      width: 200,
      height: 100,
      scrollX: 0,
      scrollY: 0
    })

    const { selection } = createSelection({
      rect: { left: 2, top: 10, width: 20, height: 18, bottom: 28 }
    })

    expect(buildPdfSelectionPosition(selection)).toMatchObject({
      x: 8,
      y: 31,
      width: 20,
      height: 18
    })
  })

  it('clamps the icon near the right viewport edge', () => {
    restoreViewport?.()
    restoreViewport = mockPdfViewport({
      width: 100,
      height: 100,
      scrollX: 0,
      scrollY: 0
    })

    const { selection } = createSelection({
      rect: { left: 80, top: 10, width: 40, height: 18, bottom: 28 }
    })

    expect(buildPdfSelectionPosition(selection)).toMatchObject({
      x: 68,
      y: 31,
      width: 40,
      height: 18
    })
  })

  it('ignores page scroll when positioning the icon because the icon is viewport-fixed', () => {
    restoreViewport?.()
    restoreViewport = mockPdfViewport({
      width: 200,
      height: 200,
      scrollX: 20,
      scrollY: 30
    })

    const { selection } = createSelection({
      rect: { left: 10, top: 10, width: 80, height: 18, bottom: 28 }
    })

    expect(buildPdfSelectionPosition(selection)).toMatchObject({
      x: 38,
      y: 31,
      width: 80,
      height: 18
    })
  })

  it('positions the icon above the selection when there is not enough room below', () => {
    restoreViewport?.()
    restoreViewport = mockPdfViewport({
      width: 200,
      height: 80,
      scrollX: 0,
      scrollY: 0
    })

    const { selection } = createSelection({
      rect: { left: 40, top: 52, width: 60, height: 18, bottom: 70 }
    })

    expect(buildPdfSelectionPosition(selection)).toMatchObject({
      x: 58,
      y: 25,
      width: 60,
      height: 18
    })
  })

  it('rejects selections outside the PDF text layer', () => {
    const { selection, viewerRoot } = createSelection({ insideViewer: false })

    expect(isSelectionInsidePdfTextLayer(selection, viewerRoot)).toBe(false)
    expect(buildPdfSelectionPayload(selection, viewerRoot)).toBeNull()
  })
})
