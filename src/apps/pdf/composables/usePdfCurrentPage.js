import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { getScrollMetrics } from '../utils/pdfGeometryModel.js'
import { CURRENT_PAGE_SOURCE } from '../utils/pdfCurrentPageResolver.js'
import { resolveRenderWindow } from '../utils/pdfRenderWindowResolver.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfViewerPrimaryPageTrace')

export function usePdfCurrentPage({
  isOriginalRole,
  suppressCurrentPageUpdates,
  getContainer,
  onCurrentPageChange
} = {}) {
  let lastCurrentPage = 0
  let currentPageFrameId = null
  const PAGE_SELECTOR = '.pdf-page[data-page-number]'

  function cancelCurrentPageFrame() {
    if (currentPageFrameId != null) {
      cancelAnimationFrame(currentPageFrameId)
      currentPageFrameId = null
    }
  }

  function emitCurrentPageFromResolver() {
    if (!isOriginalRole.value) return
    if (suppressCurrentPageUpdates.value) return

    const container = getContainer() || null
    if (!container) return

    const { scrollTop } = getScrollMetrics(container)
    const currentPage = resolveRenderWindow({
      scrollTop,
      container,
      pageSelector: PAGE_SELECTOR,
      bufferPages: 1
    }).primaryPage
    if (!currentPage) return

    if (currentPage !== lastCurrentPage) {
      lastCurrentPage = currentPage
      logger.debug(`[PDF Primary Page] ${JSON.stringify({ emittedCurrentPage: currentPage, currentPageSource: CURRENT_PAGE_SOURCE, scrollTop, timestamp: new Date().toISOString() })}`)
      onCurrentPageChange(currentPage)
    }
  }

  function scheduleCurrentPageUpdate() {
    if (!isOriginalRole.value) return
    if (suppressCurrentPageUpdates.value) return
    if (currentPageFrameId != null) return

    currentPageFrameId = requestAnimationFrame(() => {
      currentPageFrameId = null
      emitCurrentPageFromResolver()
    })
  }

  function currentPageIfVisible() {
    if (!isOriginalRole.value) return
    if (suppressCurrentPageUpdates.value) return

    emitCurrentPageFromResolver()
  }

  return {
    cancelCurrentPageFrame,
    emitCurrentPageFromResolver,
    scheduleCurrentPageUpdate,
    currentPageIfVisible
  }
}
