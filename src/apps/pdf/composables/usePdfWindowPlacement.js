import { computed, ref } from 'vue'

export const PDF_WINDOW_LAYOUT = {
  MARGIN: 12,
  FLOATING_WIDTH: 380,
  FLOATING_HEIGHT: 240,
  MIN_FLOATING_WIDTH: 280,
  MIN_DOCKED_WIDTH: 280,
  MAX_DOCKED_WIDTH_PERCENT: 0.8,
  Z_INDEX: 2147483647,
  DEFAULT_GLOBAL_POSITION: { x: 72, y: 72 }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function getViewportSize() {
  return {
    width: document.documentElement?.clientWidth || window.innerWidth || 0,
    height: window.innerHeight || 0
  }
}

export function normalizePdfWindowPosition(position) {
  if (!position) return null

  if (position._isViewportRelative) {
    return {
      x: Number(position.x ?? position.left ?? 0),
      y: Number(position.y ?? position.top ?? 0)
    }
  }

  return {
    x: Number(position.x ?? position.left ?? 0) - (window.scrollX || 0),
    y: Number(position.y ?? position.top ?? 0) - (window.scrollY || 0)
  }
}

export function clampPdfWindowPosition(position, dimensions = {}, viewport = getViewportSize(), margin = PDF_WINDOW_LAYOUT.MARGIN) {
  const maxWidth = Math.max(PDF_WINDOW_LAYOUT.MIN_FLOATING_WIDTH, (viewport.width || PDF_WINDOW_LAYOUT.FLOATING_WIDTH) - (margin * 2))
  const maxHeight = Math.max(120, (viewport.height || PDF_WINDOW_LAYOUT.FLOATING_HEIGHT) - (margin * 2))
  const width = clamp(
    Number(dimensions.width) || PDF_WINDOW_LAYOUT.FLOATING_WIDTH,
    PDF_WINDOW_LAYOUT.MIN_FLOATING_WIDTH,
    maxWidth
  )
  const height = clamp(
    Number(dimensions.height) || PDF_WINDOW_LAYOUT.FLOATING_HEIGHT,
    120,
    maxHeight
  )

  const x = clamp(Number(position?.x) || 0, margin, Math.max(margin, viewport.width - width - margin))
  const y = clamp(Number(position?.y) || 0, margin, Math.max(margin, viewport.height - height - margin))

  return { x, y }
}

export function buildPdfWindowPositionFromSelection(selectionPosition, dimensions = {}, viewport = getViewportSize(), margin = PDF_WINDOW_LAYOUT.MARGIN) {
  const rect = normalizePdfWindowPosition(selectionPosition)
  if (!rect) {
    return clampPdfWindowPosition(PDF_WINDOW_LAYOUT.DEFAULT_GLOBAL_POSITION, dimensions, viewport, margin)
  }

  const width = clamp(
    Number(dimensions.width) || PDF_WINDOW_LAYOUT.FLOATING_WIDTH,
    PDF_WINDOW_LAYOUT.MIN_FLOATING_WIDTH,
    Math.max(PDF_WINDOW_LAYOUT.MIN_FLOATING_WIDTH, (viewport.width || PDF_WINDOW_LAYOUT.FLOATING_WIDTH) - (margin * 2))
  )
  const height = clamp(
    Number(dimensions.height) || PDF_WINDOW_LAYOUT.FLOATING_HEIGHT,
    120,
    Math.max(120, (viewport.height || PDF_WINDOW_LAYOUT.FLOATING_HEIGHT) - (margin * 2))
  )
  const anchorX = rect.x + (Number(selectionPosition?.width) || 0) / 2
  const anchorBelowY = rect.y + (Number(selectionPosition?.height) || 0) + margin
  const anchorAboveY = rect.y - height - margin

  let left = anchorX - (width / 2)
  let top = anchorBelowY

  left = clamp(left, margin, Math.max(margin, viewport.width - width - margin))
  if (top + height + margin > viewport.height) {
    top = Math.max(margin, anchorAboveY)
  }

  return clampPdfWindowPosition({ x: left, y: top }, { width, height }, viewport, margin)
}

export function clampPdfDockedWidth(width, viewportWidth = getViewportSize().width, options = {}) {
  const minWidth = Number(options.minWidth) || PDF_WINDOW_LAYOUT.MIN_DOCKED_WIDTH
  const maxWidthPercent = Number(options.maxWidthPercent) || PDF_WINDOW_LAYOUT.MAX_DOCKED_WIDTH_PERCENT
  const maxWidth = Math.max(minWidth, Math.floor((viewportWidth || 0) * maxWidthPercent))
  return clamp(Number(width) || minWidth, minWidth, maxWidth)
}

export function buildPdfFloatingWindowStyle(position, dimensions = {}, viewport = getViewportSize(), margin = PDF_WINDOW_LAYOUT.MARGIN) {
  const clamped = clampPdfWindowPosition(position, dimensions, viewport, margin)
  const width = clamp(
    Number(dimensions.width) || PDF_WINDOW_LAYOUT.FLOATING_WIDTH,
    PDF_WINDOW_LAYOUT.MIN_FLOATING_WIDTH,
    Math.max(PDF_WINDOW_LAYOUT.MIN_FLOATING_WIDTH, (viewport.width || PDF_WINDOW_LAYOUT.FLOATING_WIDTH) - (margin * 2))
  )

  return {
    position: 'fixed',
    left: `${clamped.x}px`,
    top: `${clamped.y}px`,
    width: `${width}px`,
    zIndex: PDF_WINDOW_LAYOUT.Z_INDEX
  }
}

export function buildPdfDockedWindowStyle(dockMode, dockedWidth, viewport = getViewportSize(), margin = PDF_WINDOW_LAYOUT.MARGIN) {
  const width = clampPdfDockedWidth(dockedWidth, viewport.width)
  const baseStyle = {
    position: 'fixed',
    top: `${margin}px`,
    width: `${width}px`,
    zIndex: PDF_WINDOW_LAYOUT.Z_INDEX,
    maxHeight: `calc(100vh - ${margin * 2}px)`
  }

  if (dockMode === 'left') {
    return {
      ...baseStyle,
      left: `${margin}px`
    }
  }

  if (dockMode === 'right') {
    return {
      ...baseStyle,
      right: `${margin}px`
    }
  }

  return {}
}

export function usePdfWindowPlacement() {
  const hostSize = ref({
    width: PDF_WINDOW_LAYOUT.FLOATING_WIDTH,
    height: PDF_WINDOW_LAYOUT.FLOATING_HEIGHT
  })

  const position = ref({ ...PDF_WINDOW_LAYOUT.DEFAULT_GLOBAL_POSITION })
  const manualPosition = ref(false)
  const selectionPosition = ref(null)

  const isPositionedManually = computed(() => manualPosition.value)

  function measureHostSize(hostEl) {
    if (!hostEl?.getBoundingClientRect) return hostSize.value

    const rect = hostEl.getBoundingClientRect()
    const width = Math.round(rect.width || hostSize.value.width || PDF_WINDOW_LAYOUT.FLOATING_WIDTH)
    const height = Math.round(rect.height || hostSize.value.height || PDF_WINDOW_LAYOUT.FLOATING_HEIGHT)

    hostSize.value = {
      width: Math.max(PDF_WINDOW_LAYOUT.MIN_FLOATING_WIDTH, width),
      height: Math.max(120, height)
    }

    return hostSize.value
  }

  function setFloatingPosition(nextPosition, { markManual = true } = {}) {
    const viewport = getViewportSize()
    position.value = clampPdfWindowPosition(nextPosition, hostSize.value, viewport)
    if (markManual) {
      manualPosition.value = true
    }
    return position.value
  }

  function setSelectionPosition(nextSelectionPosition, { followSelection = true } = {}) {
    selectionPosition.value = nextSelectionPosition || null

    if (!followSelection || manualPosition.value) {
      return position.value
    }

    const viewport = getViewportSize()
    position.value = buildPdfWindowPositionFromSelection(selectionPosition.value, hostSize.value, viewport)
    return position.value
  }

  function resetManualPosition() {
    manualPosition.value = false
  }

  function markManualPosition() {
    manualPosition.value = true
  }

  function buildCurrentStyle({ dockMode = 'none', dockedWidth = PDF_WINDOW_LAYOUT.FLOATING_WIDTH } = {}) {
    const viewport = getViewportSize()

    if (dockMode !== 'none') {
      return buildPdfDockedWindowStyle(dockMode, dockedWidth, viewport)
    }

    const nextPosition = manualPosition.value
      ? position.value
      : buildPdfWindowPositionFromSelection(selectionPosition.value || position.value, hostSize.value, viewport)

    position.value = clampPdfWindowPosition(nextPosition, hostSize.value, viewport)
    return buildPdfFloatingWindowStyle(position.value, hostSize.value, viewport)
  }

  function ensurePositionWithinViewport() {
    position.value = clampPdfWindowPosition(position.value, hostSize.value)
    return position.value
  }

  return {
    hostSize,
    position,
    selectionPosition,
    manualPosition,
    isPositionedManually,
    measureHostSize,
    setFloatingPosition,
    setSelectionPosition,
    resetManualPosition,
    markManualPosition,
    buildCurrentStyle,
    ensurePositionWithinViewport
  }
}
