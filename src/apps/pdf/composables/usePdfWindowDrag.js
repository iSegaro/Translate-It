import { ref } from 'vue'
import { clampPdfWindowPosition, getViewportSize, PDF_WINDOW_LAYOUT } from './usePdfWindowPlacement.js'

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
    const currentPosition = dockMode?.value !== 'none'
      ? { x: position.value.x, y: position.value.y }
      : clampPdfWindowPosition(position.value, hostSize.value, viewport)

    if (dockMode?.value !== 'none') {
      onDockModeChange?.('none')
    }

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
      const nextPosition = clampPdfWindowPosition({
        x: nextCoords.x - dragOffset.x,
        y: nextCoords.y - dragOffset.y
      }, hostSize.value, getViewportSize(), PDF_WINDOW_LAYOUT.MARGIN)

      position.value = nextPosition
      onPositionChange?.(nextPosition)
    }

    const handleStop = () => {
      const nextPosition = clampPdfWindowPosition(position.value, hostSize.value, getViewportSize())
      position.value = nextPosition

      clearDragListeners()
      onPersistPosition?.(nextPosition)
      onDragEnd?.(nextPosition)
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
  }

  return {
    isDragging,
    startDrag,
    cleanup
  }
}
