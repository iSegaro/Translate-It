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

  function emitCurrentPageFromResolver(force = false, triggerType = null) {
    if (!isOriginalRole.value) return
    if (suppressCurrentPageUpdates.value) return

    const container = getContainer() || null
    if (!container) return

    const { scrollTop } = getScrollMetrics(container)
    const pageElements = container.querySelectorAll(PAGE_SELECTOR)
    console.log('[LAYOUT-DIAG][resolver-context]', JSON.stringify({
      scrollTop,
      containerScrollHeight: container.scrollHeight,
      containerClientHeight: container.clientHeight,
      pageElementCount: pageElements.length,
      firstPageNumber: pageElements.length > 0 ? Number(pageElements[0]?.dataset?.pageNumber) : null,
      lastPageNumber: pageElements.length > 0 ? Number(pageElements[pageElements.length - 1]?.dataset?.pageNumber) : null,
      isSuppressed: suppressCurrentPageUpdates.value
    }))
    const currentPage = resolveRenderWindow({
      scrollTop,
      container,
      pageSelector: PAGE_SELECTOR,
      bufferPages: 1
    }).primaryPage
    if (!currentPage) return

    if (currentPage !== lastCurrentPage) {
      const prevPage = lastCurrentPage
      lastCurrentPage = currentPage
      logger.debug(`[PDF Primary Page] ${JSON.stringify({ emittedCurrentPage: currentPage, currentPageSource: CURRENT_PAGE_SOURCE, scrollTop, timestamp: new Date().toISOString() })}`)
      console.log('[LAYOUT-DIAG][current-page]', JSON.stringify({
        previousPage: prevPage,
        newPage: currentPage,
        reason: 'scroll-observer',
        eventSource: 'scroll',
        scrollTop,
        isSuppressed: suppressCurrentPageUpdates.value
      }))
      onCurrentPageChange(currentPage)
    }
  }

  function scheduleCurrentPageUpdate() {
    if (!isOriginalRole.value) return
    if (suppressCurrentPageUpdates.value) {
      console.log('[LAYOUT-DIAG][event-chain]', JSON.stringify({
        source: 'scheduleCurrentPageUpdate',
        reason: 'suppressed-skip',
        triggerType: null
      }))
      return
    }
    if (currentPageFrameId != null) return

    console.log('[LAYOUT-DIAG][event-chain]', JSON.stringify({
      source: 'scheduleCurrentPageUpdate',
      reason: 'scheduled',
      triggerType: 'scroll-or-intersection'
    }))

    currentPageFrameId = requestAnimationFrame(() => {
      currentPageFrameId = null
      console.log('[LAYOUT-DIAG][event-chain]', JSON.stringify({
        source: 'requestAnimationFrame',
        reason: 'current-page RA fires',
        triggerType: 'scroll-or-intersection'
      }))
      emitCurrentPageFromResolver(false, 'scroll')
    })
  }

  function currentPageIfVisible() {
    if (!isOriginalRole.value) return
    if (suppressCurrentPageUpdates.value) {
      console.log('[LAYOUT-DIAG][event-chain]', JSON.stringify({
        source: 'currentPageIfVisible',
        reason: 'suppressed-skip',
        triggerType: null
      }))
      return
    }

    console.log('[LAYOUT-DIAG][event-chain]', JSON.stringify({
      source: 'currentPageIfVisible',
      reason: 'executing',
      triggerType: 'explicit-refresh'
    }))
    emitCurrentPageFromResolver(false, 'explicit-refresh')
  }

  return {
    cancelCurrentPageFrame,
    emitCurrentPageFromResolver,
    scheduleCurrentPageUpdate,
    currentPageIfVisible
  }
}
