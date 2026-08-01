import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  registerPdfTextLayerSelectionShell,
  resetPdfTextLayerSelectionShellForTests,
  unregisterPdfTextLayerSelectionShell
} from './PdfTextLayerSelectionShell.js'

function createTextLayer(texts = ['One', 'Two']) {
  const textLayer = document.createElement('div')
  textLayer.className = 'textLayer'

  for (const text of texts) {
    const span = document.createElement('span')
    span.textContent = text
    textLayer.append(span)
  }

  document.body.append(textLayer)
  return textLayer
}

function selectSpanText(span, start = 0, end = span.textContent.length) {
  const range = document.createRange()
  range.setStart(span.firstChild, start)
  range.setEnd(span.firstChild, end)

  const selection = document.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

afterEach(() => {
  document.getSelection()?.removeAllRanges()
  resetPdfTextLayerSelectionShellForTests()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('PdfTextLayerSelectionShell', () => {
  it('registers one sentinel per text layer and installs one global listener set', () => {
    const documentAddSpy = vi.spyOn(document, 'addEventListener')
    const windowAddSpy = vi.spyOn(window, 'addEventListener')
    const firstLayer = createTextLayer()
    const secondLayer = createTextLayer()

    const firstSentinel = registerPdfTextLayerSelectionShell(firstLayer)
    const secondSentinel = registerPdfTextLayerSelectionShell(secondLayer)

    expect(firstSentinel.classList.contains('endOfContent')).toBe(true)
    expect(secondSentinel.classList.contains('endOfContent')).toBe(true)
    expect(firstLayer.lastElementChild).toBe(firstSentinel)
    expect(secondLayer.lastElementChild).toBe(secondSentinel)
    expect(documentAddSpy).toHaveBeenCalledTimes(4)
    expect(windowAddSpy).toHaveBeenCalledTimes(1)
  })

  it('moves the sentinel to the active selection boundary on selectionchange', () => {
    const textLayer = createTextLayer(['Alpha', 'Beta'])
    const firstSpan = textLayer.querySelector('span')
    const sentinel = registerPdfTextLayerSelectionShell(textLayer)

    selectSpanText(firstSpan, 0, 3)
    document.dispatchEvent(new Event('selectionchange'))

    expect(textLayer.classList.contains('selecting')).toBe(true)
    expect(textLayer.children[1]).toBe(sentinel)
  })

  it('resets the sentinel on pointerup', () => {
    const textLayer = createTextLayer(['Alpha', 'Beta'])
    const firstSpan = textLayer.querySelector('span')
    const sentinel = registerPdfTextLayerSelectionShell(textLayer)

    selectSpanText(firstSpan, 0, 3)
    document.dispatchEvent(new Event('selectionchange'))
    expect(textLayer.children[1]).toBe(sentinel)

    document.dispatchEvent(new Event('pointerup'))

    expect(textLayer.classList.contains('selecting')).toBe(false)
    expect(textLayer.lastElementChild).toBe(sentinel)
  })

  it('unregisters the text layer and removes its sentinel', () => {
    const textLayer = createTextLayer()
    const sentinel = registerPdfTextLayerSelectionShell(textLayer)

    unregisterPdfTextLayerSelectionShell(textLayer)

    expect(sentinel.isConnected).toBe(false)
    expect(textLayer.querySelector('.endOfContent')).toBeNull()
    expect(textLayer.classList.contains('selecting')).toBe(false)
  })
})
