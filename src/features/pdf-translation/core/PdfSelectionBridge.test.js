import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const emitMock = vi.fn()
const settingsGetMock = vi.fn((key, defaultValue) => defaultValue)
const getSelectionMock = vi.fn()

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    emit: emitMock
  }
}))

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  default: {
    get: settingsGetMock
  }
}))

const { PdfSelectionBridge } = await import('./PdfSelectionBridge.js')

function createSelection(text = 'PDF text') {
  const viewerRoot = document.createElement('div')
  const textLayer = document.createElement('div')
  textLayer.className = 'textLayer'
  const span = document.createElement('span')
  span.textContent = text
  textLayer.append(span)
  viewerRoot.append(textLayer)

  const selection = {
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({
      startContainer: span,
      endContainer: span,
      getBoundingClientRect: () => ({ left: 20, top: 24, width: 90, height: 18, bottom: 42 })
    }),
    toString: () => text
  }

  return { viewerRoot, selection }
}

describe('PdfSelectionBridge', () => {
  let documentAddSpy
  let documentRemoveSpy
  let windowAddSpy
  let windowRemoveSpy

  beforeEach(() => {
    emitMock.mockClear()
    settingsGetMock.mockClear()
    getSelectionMock.mockClear()

    documentAddSpy = vi.spyOn(document, 'addEventListener').mockImplementation(() => {})
    documentRemoveSpy = vi.spyOn(document, 'removeEventListener').mockImplementation(() => {})
    windowAddSpy = vi.spyOn(window, 'addEventListener').mockImplementation(() => {})
    windowRemoveSpy = vi.spyOn(window, 'removeEventListener').mockImplementation(() => {})
    vi.spyOn(document, 'getSelection').mockImplementation(getSelectionMock)
  })

  afterEach(() => {
    documentAddSpy?.mockRestore()
    documentRemoveSpy?.mockRestore()
    windowAddSpy?.mockRestore()
    windowRemoveSpy?.mockRestore()
    vi.restoreAllMocks()
  })

  it('emits the shared selection event for PDF text-layer selections', () => {
    const { viewerRoot, selection } = createSelection()
    getSelectionMock.mockReturnValue(selection)
    const bridge = new PdfSelectionBridge(ref(viewerRoot))

    bridge.handleSelectionChange()

    expect(emitMock).toHaveBeenCalledWith('global-selection-change', expect.objectContaining({
      text: 'PDF text',
      position: expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number)
      }),
      context: expect.objectContaining({
        source: 'pdf-viewer',
        isPdf: true
      })
    }))
  })

  it('registers and removes selection listeners on stop/destroy', () => {
    const { viewerRoot } = createSelection('Destroy me')
    const bridge = new PdfSelectionBridge(ref(viewerRoot))

    bridge.start()

    expect(documentAddSpy).toHaveBeenCalledWith('selectionchange', bridge.handleSelectionChange, { capture: true })
    expect(windowAddSpy).toHaveBeenCalledWith('blur', bridge.handleSelectionChange, { capture: true })

    bridge.destroy()

    expect(documentRemoveSpy).toHaveBeenCalledWith('selectionchange', bridge.handleSelectionChange, { capture: true })
    expect(windowRemoveSpy).toHaveBeenCalledWith('blur', bridge.handleSelectionChange, { capture: true })
    expect(bridge.isStarted).toBe(false)
  })
})
