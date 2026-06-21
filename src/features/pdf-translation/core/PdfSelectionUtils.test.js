import { describe, expect, it } from 'vitest'
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

describe('PdfSelectionUtils', () => {
  it('builds text and position for a selection inside the PDF text layer', () => {
    const { selection, viewerRoot } = createSelection()

    expect(isSelectionInsidePdfTextLayer(selection, viewerRoot)).toBe(true)
    expect(buildPdfSelectionText(selection)).toBe('Hello PDF')
    expect(buildPdfSelectionPosition(selection)).toMatchObject({
      x: 34,
      y: 38,
      width: 80,
      height: 18
    })
    expect(buildPdfSelectionPayload(selection, viewerRoot)).toMatchObject({
      text: 'Hello PDF'
    })
  })

  it('rejects selections outside the PDF text layer', () => {
    const { selection, viewerRoot } = createSelection({ insideViewer: false })

    expect(isSelectionInsidePdfTextLayer(selection, viewerRoot)).toBe(false)
    expect(buildPdfSelectionPayload(selection, viewerRoot)).toBeNull()
  })
})
