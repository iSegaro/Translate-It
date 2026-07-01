import { ref, computed, nextTick } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { NavigationTargetType } from '@/features/pdf-translation/core/NavigationModels.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfNavigation')

export function usePdfNavigation(viewerRef) {
  const currentPage = ref(0)
  const isNavigating = ref(false)
  const outline = ref(null)

  const hasOutline = computed(() => Array.isArray(outline.value) && outline.value.length > 0)

  let _session = null

  function navigateToPage(pageNumber, options = {}) {
    if (!_session) {
      logger.warn('navigateToPage called without attached document')
      return
    }

    const num = Number(pageNumber)
    if (!Number.isInteger(num) || num < 1 || num > _session.totalPages) {
      logger.warn('Invalid page number for navigation:', pageNumber)
      return
    }

    isNavigating.value = true
    currentPage.value = num

    const viewer = viewerRef?.value
    if (viewer?.scrollToPage) {
      viewer.scrollToPage(num, options)
    }

    void nextTick(() => {
      isNavigating.value = false
    })

    logger.info('Navigation executed:', { pageNumber: num })
  }

  async function navigateToDestination(dest) {
    if (!_session) {
      logger.warn('navigateToDestination called without attached document')
      return
    }

    try {
      const target = await _session.resolveDestination(dest)

      if (!target) {
        logger.warn('Destination could not be resolved:', dest)
        return
      }

      if (target.type === NavigationTargetType.PAGE) {
        navigateToPage(target.pageNumber)
        return
      }

      logger.info('Non-page target type ignored for now:', target.type)
    } catch (error) {
      logger.warn('Failed to navigate to destination:', error)
    }
  }

  async function attachDocument(documentSession) {
    _session = documentSession

    try {
      const loadedOutline = await documentSession.loadOutline()

      if (_session !== documentSession) {
        return
      }

      outline.value = loadedOutline
    } catch (error) {
      if (_session !== documentSession) {
        return
      }

      logger.warn('Failed to load outline on attach:', error)
      outline.value = null
    }
  }

  function detachDocument() {
    _session = null
    currentPage.value = 0
    isNavigating.value = false
    outline.value = null
  }

  return {
    currentPage,
    isNavigating,
    outline,
    hasOutline,
    navigateToPage,
    navigateToDestination,
    attachDocument,
    detachDocument
  }
}
