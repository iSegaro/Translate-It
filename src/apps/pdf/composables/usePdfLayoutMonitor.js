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
  let _resizeEventId = 0

  function emitLayoutIfNeeded() {
    if (!isOriginalRole.value) return

    const viewerMetrics = getElementClientMetrics(viewerRoot.value)
    const scrollMetrics = getElementClientMetrics(scrollContainer.value)
    const width = Math.floor(viewerMetrics.width)
    const height = Math.floor(scrollMetrics.height || viewerMetrics.height)

    if (width > 0 && height > 0 && (width !== lastLayoutWidth || height !== lastLayoutHeight)) {
      const previousWidth = lastLayoutWidth
      const previousHeight = lastLayoutHeight
      lastLayoutWidth = width
      lastLayoutHeight = height
      console.log('[LAYOUT-DIAG][event-chain]', JSON.stringify({
        source: 'emitLayoutIfNeeded',
        eventId: _resizeEventId,
        previousLayout: { width: previousWidth, height: previousHeight },
        currentLayout: { width, height },
        changed: true,
        deduplicated: false
      }))
      onLayoutChange({ width, height })
    }
  }

  function setupLayoutObservation() {
    disconnectLayoutObservation()

    resizeObserver = new ResizeObserver((entries) => {
      const entryDetails = entries.map((entry) => {
        const cr = entry.contentRect
        return {
          targetClass: entry.target?.className?.slice(0, 40) ?? '',
          targetWidth: Math.floor(cr?.width ?? 0),
          targetHeight: Math.floor(cr?.height ?? 0)
        }
      })
      _resizeEventId += 1
      const prevWidth = lastLayoutWidth
      const prevHeight = lastLayoutHeight
      console.log('[LAYOUT-DIAG][event-chain]', JSON.stringify({
        source: 'ResizeObserver',
        eventId: _resizeEventId,
        entries: entryDetails,
        previousLayout: { width: prevWidth, height: prevHeight },
        newMetrics: null
      }))
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
