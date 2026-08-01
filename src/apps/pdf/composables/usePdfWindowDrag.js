import { ref } from 'vue'
import {
  clampPdfWindowPosition,
  getViewportSize,
  getPdfDockedWindowPosition,
  PDF_DOCK_LAYOUT,
  PDF_WINDOW_LAYOUT
} from '@/apps/pdf/utils/pdfWindowGeometry.js'

function getPointerCoordinates(event) {
  return {
    x: Number(event?.clientX) || 0,
    y: Number(event?.clientY) || 0
  }
}

export function usePdfWindowDrag({
  tracker,
  hostRef,
  position,
  hostSize,
  dockMode,
  manualPosition,
  onDockModeChange = null,
  onPositionChange = null,
  onPersistPosition = null,
  onDragStart = null,
  onDragEnd = null
} = {}) {
  const isDragging = ref(false)
  let dragOffset = { x: 0, y: 0 }
  let dragOriginMode = 'none'
  let cleanupListeners = null

  function clearDragListeners() {
    if (cleanupListeners) {
      cleanupListeners()
      cleanupListeners = null
    }

    isDragging.value = false
    document.body.style.userSelect = ''
  }

  function startDrag(event) {
    if (!event || (typeof event.button === 'number' && event.button !== 0)) {
      return false
    }

    if (!hostRef?.value) {
      return false
    }

    const viewport = getViewportSize()
    const coords = getPointerCoordinates(event)
    const dockedPosition = dockMode?.value !== 'none'
      ? getPdfDockedWindowPosition(dockMode.value, hostSize.value.width, viewport, PDF_WINDOW_LAYOUT.MARGIN)
      : null
    const currentPosition = dockedPosition
      ? { x: dockedPosition.x, y: dockedPosition.y }
      : clampPdfWindowPosition(position.value, hostSize.value, viewport)

    dragOriginMode = dockMode?.value || 'none'

    manualPosition.value = true
    dragOffset = {
      x: coords.x - currentPosition.x,
      y: coords.y - currentPosition.y
    }

    const handleMove = (moveEvent) => {
      if (moveEvent.cancelable) {
        moveEvent.preventDefault()
      }

      const nextCoords = getPointerCoordinates(moveEvent)
      const viewport = getViewportSize()
      // Mirror the web window behavior: snap when the pointer approaches an edge
      // and break away from a dock when the pointer moves back into the page.
      const edgeThreshold = PDF_DOCK_LAYOUT.SNAP_THRESHOLD
      const breakThreshold = PDF_DOCK_LAYOUT.BREAK_THRESHOLD

      if (dockMode?.value === 'none') {
        if (nextCoords.x < edgeThreshold) {
          onDockModeChange?.('left')
          return
        }

        if (nextCoords.x > viewport.width - edgeThreshold) {
          onDockModeChange?.('right')
          return
        }

        const nextPosition = clampPdfWindowPosition({
          x: nextCoords.x - dragOffset.x,
          y: nextCoords.y - dragOffset.y
        }, hostSize.value, viewport, PDF_WINDOW_LAYOUT.MARGIN)

        position.value = nextPosition
        onPositionChange?.(nextPosition)
        return
      }

      const shouldUndock = (
        (dragOriginMode === 'left' || dockMode.value === 'left')
        && nextCoords.x > breakThreshold
      ) || (
        (dragOriginMode === 'right' || dockMode.value === 'right')
        && nextCoords.x < viewport.width - breakThreshold
      )

      if (!shouldUndock) {
        return
      }

      onDockModeChange?.('none')

      const nextPosition = clampPdfWindowPosition({
        x: nextCoords.x - dragOffset.x,
        y: nextCoords.y - dragOffset.y
      }, hostSize.value, viewport, PDF_WINDOW_LAYOUT.MARGIN)

      position.value = nextPosition
      onPositionChange?.(nextPosition)
    }

    const handleStop = () => {
      const viewport = getViewportSize()
      const nextPosition = clampPdfWindowPosition(position.value, hostSize.value, viewport)
      position.value = nextPosition

      clearDragListeners()
      if (dockMode?.value === 'none') {
        onPersistPosition?.(nextPosition)
      }
      onDragEnd?.(nextPosition)
      dragOriginMode = 'none'
    }

    document.addEventListener('pointermove', handleMove, { capture: true })
    document.addEventListener('pointerup', handleStop, { capture: true })
    document.addEventListener('pointercancel', handleStop, { capture: true })

    cleanupListeners = () => {
      document.removeEventListener('pointermove', handleMove, { capture: true })
      document.removeEventListener('pointerup', handleStop, { capture: true })
      document.removeEventListener('pointercancel', handleStop, { capture: true })
    }

    tracker?.trackResource?.('pdf-window-drag-listeners', cleanupListeners)
    isDragging.value = true
    document.body.style.userSelect = 'none'
    onDragStart?.()
    return true
  }

  function cleanup() {
    clearDragListeners()
    dragOriginMode = 'none'
  }

  return {
    isDragging,
    startDrag,
    cleanup
  }
}
