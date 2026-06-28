import { computed, ref } from 'vue'

import {
  PDF_WINDOW_LAYOUT,
  buildPdfDockedWindowStyle,
  buildPdfFloatingWindowStyle,
  buildPdfWindowPositionFromSelection,
  clampPdfWindowPosition,
  getViewportSize
} from '@/apps/pdf/utils/pdfWindowGeometry.js'

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
