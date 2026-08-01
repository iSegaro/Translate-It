import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePdfRegionSelectionController } from './usePdfRegionSelectionController.js'

let wrapper

function createSurface({ left = 10, top = 20, width = 100, height = 80 } = {}) {
  const capturedPointers = new Set()
  return {
    getBoundingClientRect: () => ({ left, top, width, height }),
    setPointerCapture: vi.fn((pointerId) => capturedPointers.add(pointerId)),
    hasPointerCapture: vi.fn((pointerId) => capturedPointers.has(pointerId)),
    releasePointerCapture: vi.fn((pointerId) => capturedPointers.delete(pointerId))
  }
}

function pointerEvent(surface, { pointerId = 1, clientX = 30, clientY = 40 } = {}) {
  return {
    button: 0,
    isPrimary: true,
    pointerId,
    clientX,
    clientY,
    currentTarget: surface,
    preventDefault: vi.fn()
  }
}

function mountSelection(activeValue = true) {
  const active = ref(activeValue)
  const onComplete = vi.fn()
  let selection

  wrapper = mount(defineComponent({
    setup() {
      selection = usePdfRegionSelectionController({ active, onComplete })
      return () => h('div')
    }
  }))

  return { active, onComplete, selection }
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

describe('usePdfRegionSelectionController', () => {
  it('installs one Escape listener and one blur listener while active', () => {
    const documentSpy = vi.spyOn(document, 'addEventListener')
    const windowSpy = vi.spyOn(window, 'addEventListener')

    mountSelection()

    expect(documentSpy.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1)
    expect(windowSpy.mock.calls.filter(([type]) => type === 'blur')).toHaveLength(1)
  })

  it('captures one pointer and ignores another active operation', () => {
    const { onComplete, selection } = mountSelection()
    const firstSurface = createSurface()
    const secondSurface = createSurface()

    selection.handlePointerDown(1, pointerEvent(firstSurface, { pointerId: 1 }))
    selection.handlePointerDown(2, pointerEvent(secondSurface, { pointerId: 2 }))
    selection.handlePointerUp(1, pointerEvent(firstSurface, {
      pointerId: 1,
      clientX: 70,
      clientY: 70
    }))

    expect(firstSurface.setPointerCapture).toHaveBeenCalledWith(1)
    expect(secondSurface.setPointerCapture).not.toHaveBeenCalled()
    expect(firstSurface.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('normalizes reverse drag and emits only page-local CSS geometry', () => {
    const { onComplete, selection } = mountSelection()
    const surface = createSurface()

    selection.handlePointerDown(3, pointerEvent(surface, { clientX: 90, clientY: 80 }))
    selection.handlePointerMove(3, pointerEvent(surface, { clientX: 30, clientY: 30 }))

    expect(selection.rect.value).toEqual({ x: 20, y: 10, width: 60, height: 50 })

    selection.handlePointerUp(3, pointerEvent(surface, { clientX: 30, clientY: 30 }))

    expect(onComplete).toHaveBeenCalledWith({
      pageNumber: 3,
      rect: { x: 20, y: 10, width: 60, height: 50 }
    })
    expect(Object.keys(onComplete.mock.calls[0][0])).toEqual(['pageNumber', 'rect'])
  })

  it('clamps drag to the originating page', () => {
    const { onComplete, selection } = mountSelection()
    const surface = createSurface()

    selection.handlePointerDown(2, pointerEvent(surface, { clientX: 60, clientY: 60 }))
    selection.handlePointerUp(2, pointerEvent(surface, { clientX: 200, clientY: -20 }))

    expect(onComplete).toHaveBeenCalledWith({
      pageNumber: 2,
      rect: { x: 50, y: 0, width: 50, height: 40 }
    })
  })

  it.each([
    { end: { clientX: 30, clientY: 70 } },
    { end: { clientX: 70, clientY: 40 } }
  ])('rejects zero-area rectangles', ({ end }) => {
    const { onComplete, selection } = mountSelection()
    const surface = createSurface()

    selection.handlePointerDown(1, pointerEvent(surface))
    selection.handlePointerUp(1, pointerEvent(surface, end))

    expect(onComplete).not.toHaveBeenCalled()
  })

  it.each(['pointercancel', 'lostpointercapture', 'page-unmount'])('cancels without emitting on %s', (reason) => {
    const { onComplete, selection } = mountSelection()
    const surface = createSurface()
    const event = pointerEvent(surface)

    selection.handlePointerDown(1, event)
    if (reason === 'pointercancel') selection.handlePointerCancel(1, event)
    if (reason === 'lostpointercapture') selection.handleLostPointerCapture(1, event)
    if (reason === 'page-unmount') selection.handlePageUnmount(1)

    expect(selection.activePageNumber.value).toBeNull()
    expect(selection.rect.value).toBeNull()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('cancels without emitting on Escape and window blur', () => {
    const { onComplete, selection } = mountSelection()
    const surface = createSurface()

    selection.handlePointerDown(1, pointerEvent(surface))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(selection.activePageNumber.value).toBeNull()

    selection.handlePointerDown(1, pointerEvent(surface))
    window.dispatchEvent(new Event('blur'))
    expect(selection.activePageNumber.value).toBeNull()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('releases capture and listeners during cleanup', () => {
    const removeDocumentSpy = vi.spyOn(document, 'removeEventListener')
    const removeWindowSpy = vi.spyOn(window, 'removeEventListener')
    const { onComplete, selection } = mountSelection()
    const surface = createSurface()

    selection.handlePointerDown(1, pointerEvent(surface))
    wrapper.unmount()
    wrapper = null

    expect(surface.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(removeDocumentSpy.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1)
    expect(removeWindowSpy.mock.calls.filter(([type]) => type === 'blur')).toHaveLength(1)
    expect(onComplete).not.toHaveBeenCalled()
  })
})
