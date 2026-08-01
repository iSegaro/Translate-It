import { onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function normalizeRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  }
}

export function usePdfRegionSelectionController({ active, onComplete }) {
  const activePageNumber = ref(null)
  const rect = ref(null)
  let pointerId = null
  let surface = null
  let startPoint = null
  let listenersAttached = false
  let mounted = false

  function toPagePoint(event) {
    const bounds = surface?.getBoundingClientRect?.()
    if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null

    return {
      x: clamp(event.clientX - bounds.left, 0, bounds.width),
      y: clamp(event.clientY - bounds.top, 0, bounds.height)
    }
  }

  function releasePointerCapture() {
    if (pointerId === null || typeof surface?.releasePointerCapture !== 'function') return

    try {
      if (typeof surface.hasPointerCapture !== 'function' || surface.hasPointerCapture(pointerId)) {
        surface.releasePointerCapture(pointerId)
      }
    } catch {
      // Surface may have lost capture during browser cancellation.
    }
  }

  function clearOperation() {
    releasePointerCapture()
    pointerId = null
    surface = null
    startPoint = null
    activePageNumber.value = null
    rect.value = null
  }

  function cancel() {
    if (pointerId === null) return false
    clearOperation()
    return true
  }

  function handlePointerDown(pageNumber, event) {
    if (!unref(active) || pointerId !== null || event?.isPrimary === false || event?.button !== 0) return
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return

    surface = event.currentTarget || null
    const point = toPagePoint(event)
    if (!point) {
      surface = null
      return
    }

    pointerId = event.pointerId
    activePageNumber.value = pageNumber
    startPoint = point
    rect.value = normalizeRect(point, point)
    event.preventDefault?.()
    surface.setPointerCapture?.(pointerId)
  }

  function handlePointerMove(pageNumber, event) {
    if (pageNumber !== activePageNumber.value || event?.pointerId !== pointerId) return

    const point = toPagePoint(event)
    if (!point) return
    rect.value = normalizeRect(startPoint, point)
    event.preventDefault?.()
  }

  function handlePointerUp(pageNumber, event) {
    if (pageNumber !== activePageNumber.value || event?.pointerId !== pointerId) return

    const point = toPagePoint(event)
    const completedRect = point ? normalizeRect(startPoint, point) : rect.value
    const completedPageNumber = activePageNumber.value
    clearOperation()

    if (!completedRect || completedRect.width === 0 || completedRect.height === 0) return
    onComplete?.({ pageNumber: completedPageNumber, rect: completedRect })
  }

  function handlePointerCancel(pageNumber, event) {
    if (pageNumber === activePageNumber.value && event?.pointerId === pointerId) cancel()
  }

  function handleLostPointerCapture(pageNumber, event) {
    if (pageNumber === activePageNumber.value && event?.pointerId === pointerId) cancel()
  }

  function handlePageUnmount(pageNumber) {
    if (pageNumber === activePageNumber.value) cancel()
  }

  function handleKeyDown(event) {
    if (event.key !== 'Escape' || pointerId === null) return
    event.preventDefault()
    cancel()
  }

  function handleWindowBlur() {
    cancel()
  }

  function attachListeners() {
    if (listenersAttached || typeof document === 'undefined' || typeof window === 'undefined') return
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('blur', handleWindowBlur)
    listenersAttached = true
  }

  function detachListeners() {
    if (!listenersAttached) return
    document.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('blur', handleWindowBlur)
    listenersAttached = false
  }

  function syncActivation() {
    if (!mounted) return
    if (unref(active)) {
      attachListeners()
      return
    }
    cancel()
    detachListeners()
  }

  watch(() => unref(active), syncActivation)

  onMounted(() => {
    mounted = true
    syncActivation()
  })

  onBeforeUnmount(() => {
    mounted = false
    cancel()
    detachListeners()
  })

  return {
    activePageNumber,
    rect,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleLostPointerCapture,
    handlePageUnmount,
    cancel
  }
}
