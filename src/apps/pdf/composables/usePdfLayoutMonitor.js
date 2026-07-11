import { onBeforeUnmount } from 'vue'
import { getElementClientMetrics } from '../utils/pdfGeometryModel.js'

export function usePdfLayoutMonitor({
  viewerRoot,
  scrollContainer,
  isOriginalRole,
  onLayoutChange
} = {}) {
  let lastLayoutWidth = 0
  let lastLayoutHeight = 0
  let resizeObserver = null

  function emitLayoutIfNeeded() {
    if (!isOriginalRole.value) return

    const viewerMetrics = getElementClientMetrics(viewerRoot.value)
    const scrollMetrics = getElementClientMetrics(scrollContainer.value)
    const width = Math.floor(viewerMetrics.width)
    const height = Math.floor(scrollMetrics.height || viewerMetrics.height)

    if (width > 0 && height > 0 && (width !== lastLayoutWidth || height !== lastLayoutHeight)) {
      lastLayoutWidth = width
      lastLayoutHeight = height
      onLayoutChange({ width, height })
    }
  }

  function setupLayoutObservation() {
    disconnectLayoutObservation()

    resizeObserver = new ResizeObserver(() => {
      emitLayoutIfNeeded()
    })

    resizeObserver.observe(viewerRoot.value)
    if (scrollContainer.value) {
      resizeObserver.observe(scrollContainer.value)
    }
  }

  function disconnectLayoutObservation() {
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  onBeforeUnmount(() => {
    disconnectLayoutObservation()
  })

  return {
    emitLayoutIfNeeded,
    setupLayoutObservation,
    disconnectLayoutObservation
  }
}
