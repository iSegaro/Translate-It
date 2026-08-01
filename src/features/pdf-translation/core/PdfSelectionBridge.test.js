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

function createSelection(text = 'PDF text', rect = { left: 20, top: 24, width: 90, height: 18, bottom: 42 }) {
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
      getBoundingClientRect: () => rect
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

  it('defers selection emission while the pointer is down and flushes after pointer up', () => {
    const { viewerRoot, selection } = createSelection()
    getSelectionMock.mockReturnValue(selection)
    const bridge = new PdfSelectionBridge(ref(viewerRoot))

    bridge.handlePointerDown({ target: viewerRoot.firstChild })
    bridge.handleSelectionChange()

    expect(emitMock).not.toHaveBeenCalled()

    bridge.handlePointerUp()

    expect(emitMock).toHaveBeenCalledWith('global-selection-change', expect.objectContaining({
      text: 'PDF text',
      context: expect.objectContaining({
        source: 'pdf-viewer',
        isPdf: true
      })
    }))
  })

  it('emits the interaction anchor for pointer-originated paragraph selections', () => {
    const { viewerRoot, selection } = createSelection('Triple click paragraph', {
      left: 220,
      top: 300,
      width: 420,
      height: 24,
      bottom: 324
    })
    getSelectionMock.mockReturnValue(selection)
    const bridge = new PdfSelectionBridge(ref(viewerRoot))

    bridge.handlePointerDown({ target: viewerRoot.firstChild })
    bridge.handleSelectionChange()
    bridge.handlePointerUp({ clientX: 260, clientY: 310, pointerType: 'mouse' })

    expect(emitMock).toHaveBeenCalledWith('global-selection-change', expect.objectContaining({
      text: 'Triple click paragraph',
      position: expect.objectContaining({
        x: 260,
        y: 322,
        width: 420,
        height: 24
      })
    }))
    expect(emitMock.mock.calls[0][1]).not.toHaveProperty('interactionAnchor')
  })

  it('uses the pointerup position for drag selections', () => {
    const { viewerRoot, selection } = createSelection('Dragged PDF text')
    getSelectionMock.mockReturnValue(selection)
    const bridge = new PdfSelectionBridge(ref(viewerRoot))

    bridge.handlePointerDown({ target: viewerRoot.firstChild })
    bridge.handleSelectionChange()
    bridge.handlePointerUp({ clientX: 480, clientY: 520, pointerType: 'mouse' })

    expect(emitMock).toHaveBeenCalledWith('global-selection-change', expect.objectContaining({
      position: expect.objectContaining({
        x: 480,
        y: 532
      })
    }))
  })

  it('does not emit while pointer selection is canceled', () => {
    const { viewerRoot, selection } = createSelection()
    getSelectionMock.mockReturnValue(selection)
    const bridge = new PdfSelectionBridge(ref(viewerRoot))

    bridge.handlePointerDown({ target: viewerRoot.firstChild })
    bridge.handleSelectionChange()
    bridge.handlePointerCancel()

    expect(emitMock).not.toHaveBeenCalled()
    expect(bridge.isPointerDown).toBe(false)
    expect(bridge.hasPendingSelectionChange).toBe(false)
  })

  it('defers clearing an active PDF selection until pointer up finalizes selection', () => {
    const { viewerRoot, selection } = createSelection()
    getSelectionMock.mockReturnValue(selection)
    const bridge = new PdfSelectionBridge(ref(viewerRoot))

    bridge.handleSelectionChange()
    emitMock.mockClear()

    getSelectionMock.mockReturnValue({
      isCollapsed: true,
      rangeCount: 0,
      toString: () => ''
    })

    bridge.handlePointerDown({ target: document.body })
    bridge.handleSelectionChange()

    expect(emitMock).not.toHaveBeenCalled()

    bridge.handlePointerUp()

    expect(emitMock).toHaveBeenCalledWith('global-selection-clear', expect.objectContaining({
      reason: 'selection-empty',
      context: expect.objectContaining({
        source: 'pdf-viewer',
        isPdf: true
      })
    }))
  })

  it('tracks pointer lifecycle independently from selection dedupe signature', () => {
    const { viewerRoot } = createSelection()
    const bridge = new PdfSelectionBridge(ref(viewerRoot))
    bridge.hasActiveSelection = true
    bridge.lastSelectionSignature = ''

    bridge.handlePointerDown({ target: document.body })

    expect(bridge.isPointerDown).toBe(true)
  })

  it('clears pending pointer selection on blur without emitting', () => {
    const { viewerRoot, selection } = createSelection()
    getSelectionMock.mockReturnValue(selection)
    const bridge = new PdfSelectionBridge(ref(viewerRoot))

    bridge.handlePointerDown({ target: viewerRoot.firstChild })
    bridge.handleSelectionChange()
    bridge.handleWindowBlur()

    expect(emitMock).not.toHaveBeenCalled()
    expect(bridge.isPointerDown).toBe(false)
    expect(bridge.hasPendingSelectionChange).toBe(false)
  })

  it('emits a window-blur reason when clearing an active PDF selection on blur', () => {
    const { viewerRoot, selection } = createSelection()
    getSelectionMock.mockReturnValue(selection)
    const bridge = new PdfSelectionBridge(ref(viewerRoot))

    bridge.handleSelectionChange()
    bridge.handleWindowBlur()

    expect(emitMock).toHaveBeenCalledWith('global-selection-clear', expect.objectContaining({
      reason: 'window-blur',
      context: expect.objectContaining({
        source: 'pdf-viewer',
        isPdf: true
      })
    }))
  })

  it('still emits immediately for keyboard or other non-pointer selection changes', () => {
    const { viewerRoot, selection } = createSelection()
    getSelectionMock.mockReturnValue(selection)
    const bridge = new PdfSelectionBridge(ref(viewerRoot))

    bridge.handleSelectionChange()

    expect(emitMock).toHaveBeenCalledWith('global-selection-change', expect.objectContaining({
      text: 'PDF text',
      position: expect.objectContaining({
        x: 53,
        y: 45
      }),
      context: expect.objectContaining({
        source: 'pdf-viewer',
        isPdf: true
      })
    }))
  })

  it('discards the interaction anchor on selection clear', () => {
    const { viewerRoot, selection } = createSelection('Pointer selection')
    getSelectionMock.mockReturnValue(selection)
    const bridge = new PdfSelectionBridge(ref(viewerRoot))

    bridge.handlePointerDown({ target: viewerRoot.firstChild })
    bridge.handleSelectionChange()
    bridge.handlePointerUp({ clientX: 320, clientY: 360, pointerType: 'mouse' })

    expect(bridge.interactionAnchor).not.toBeNull()

    bridge.clearSelection('selection-empty')

    expect(bridge.interactionAnchor).toBeNull()
  })

  it('does not leak a previous interaction anchor into a new pointer interaction', () => {
    const first = createSelection('First selection')
    getSelectionMock.mockReturnValue(first.selection)
    const bridge = new PdfSelectionBridge(ref(first.viewerRoot))

    bridge.handlePointerDown({ target: first.viewerRoot.firstChild })
    bridge.handleSelectionChange()
    bridge.handlePointerUp({ clientX: 300, clientY: 340, pointerType: 'mouse' })
    expect(emitMock.mock.calls[0][1].position).toMatchObject({ x: 300, y: 352 })

    emitMock.mockClear()
    getSelectionMock.mockReturnValue({
      ...first.selection,
      toString: () => 'Second selection'
    })
    bridge.handlePointerDown({ target: first.viewerRoot.firstChild })
    bridge.handleSelectionChange()
    bridge.handlePointerUp()

    expect(emitMock).toHaveBeenCalledWith('global-selection-change', expect.objectContaining({
      text: 'Second selection',
      position: expect.objectContaining({
        x: 53,
        y: 45
      })
    }))
  })

  it('registers and removes selection listeners on stop/destroy', () => {
    const { viewerRoot } = createSelection('Destroy me')
    const bridge = new PdfSelectionBridge(ref(viewerRoot))

    bridge.start()

    expect(documentAddSpy).toHaveBeenCalledWith('selectionchange', bridge.handleSelectionChange, { capture: true })
    expect(documentAddSpy).toHaveBeenCalledWith('pointerdown', bridge.handlePointerDown, { capture: true })
    expect(documentAddSpy).toHaveBeenCalledWith('pointerup', bridge.handlePointerUp, { capture: true })
    expect(documentAddSpy).toHaveBeenCalledWith('pointercancel', bridge.handlePointerCancel, { capture: true })
    expect(windowAddSpy).toHaveBeenCalledWith('blur', bridge.handleWindowBlur, { capture: true })

    bridge.destroy()

    expect(documentRemoveSpy).toHaveBeenCalledWith('selectionchange', bridge.handleSelectionChange, { capture: true })
    expect(documentRemoveSpy).toHaveBeenCalledWith('pointerdown', bridge.handlePointerDown, { capture: true })
    expect(documentRemoveSpy).toHaveBeenCalledWith('pointerup', bridge.handlePointerUp, { capture: true })
    expect(documentRemoveSpy).toHaveBeenCalledWith('pointercancel', bridge.handlePointerCancel, { capture: true })
    expect(windowRemoveSpy).toHaveBeenCalledWith('blur', bridge.handleWindowBlur, { capture: true })
    expect(bridge.isStarted).toBe(false)
  })
})
