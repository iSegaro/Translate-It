import { computed, ref } from 'vue'
import { clampPdfDockedWidth, PDF_WINDOW_LAYOUT } from '@/apps/pdf/utils/pdfWindowGeometry.js'

function normalizeDockMode(mode) {
  if (mode === 'left' || mode === 'right') return mode
  return 'none'
}

export function usePdfWindowDocking({
  initialPinned = false,
  initialDockMode = 'none',
  initialDockedWidth = PDF_WINDOW_LAYOUT.FLOATING_WIDTH
} = {}) {
  const isPinned = ref(!!initialPinned)
  const dockMode = ref(normalizeDockMode(initialDockMode))
  const dockedWidth = ref(clampPdfDockedWidth(initialDockedWidth))
  const isDocked = computed(() => dockMode.value !== 'none')
  const isResizing = ref(false)

  let resizeCleanup = null

  function setPinned(nextPinned) {
    isPinned.value = !!nextPinned
    return isPinned.value
  }

  function togglePin() {
    return setPinned(!isPinned.value)
  }

  function setDockMode(nextMode) {
    dockMode.value = normalizeDockMode(nextMode)
    return dockMode.value
  }

  function toggleDockMode(nextMode) {
    if (dockMode.value === nextMode) {
      return setDockMode('none')
    }

    return setDockMode(nextMode)
  }

  function setDockedWidth(nextWidth, viewportWidth = window.innerWidth) {
    dockedWidth.value = clampPdfDockedWidth(nextWidth, viewportWidth)
    return dockedWidth.value
  }

  function cleanupResizeListeners() {
    if (!resizeCleanup) return

    resizeCleanup()
    resizeCleanup = null
    isResizing.value = false
    document.body.style.userSelect = ''
  }

  function startResize(event, {
    onResize = null,
    onResizeEnd = null
  } = {}) {
    if (!isDocked.value) return false

    const startX = Number(event?.clientX) || 0
    const startWidth = dockedWidth.value
    const startMode = dockMode.value

    const handleMove = (moveEvent) => {
      if (moveEvent.cancelable) {
        moveEvent.preventDefault()
      }

      const deltaX = (Number(moveEvent.clientX) || 0) - startX
      const viewportWidth = document.documentElement?.clientWidth || window.innerWidth || 0

      let nextWidth
      if (startMode === 'left') {
        nextWidth = startWidth + deltaX
      } else {
        nextWidth = startWidth - deltaX
      }

      dockedWidth.value = clampPdfDockedWidth(nextWidth, viewportWidth)
      onResize?.(dockedWidth.value)
    }

    const handleStop = () => {
      cleanupResizeListeners()
      onResizeEnd?.(dockedWidth.value)
    }

    document.addEventListener('pointermove', handleMove, { capture: true })
    document.addEventListener('pointerup', handleStop, { capture: true })
    document.addEventListener('pointercancel', handleStop, { capture: true })

    resizeCleanup = () => {
      document.removeEventListener('pointermove', handleMove, { capture: true })
      document.removeEventListener('pointerup', handleStop, { capture: true })
      document.removeEventListener('pointercancel', handleStop, { capture: true })
    }

    isResizing.value = true
    document.body.style.userSelect = 'none'
    return true
  }

  return {
    isPinned,
    dockMode,
    dockedWidth,
    isDocked,
    isResizing,
    setPinned,
    togglePin,
    setDockMode,
    toggleDockMode,
    setDockedWidth,
    startResize,
    cleanupResizeListeners
  }
}
