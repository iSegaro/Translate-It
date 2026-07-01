import { ref, computed, nextTick, watch } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { NavigationTargetType } from '@/features/pdf-translation/core/NavigationModels.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfNavigation')

export function usePdfNavigation(viewerRef) {
  const currentPage = ref(0)
  const isNavigating = ref(false)
  const outline = ref(null)
  const activeOutlineDest = ref(null)

  const hasOutline = computed(() => Array.isArray(outline.value) && outline.value.length > 0)

  let _session = null
  let _flatNodes = []
  const _pageCache = new Map()

  // ── Flatten ──────────────────────────────────────────────

  function flattenNodes(nodes, depth = 0) {
    const result = []
    for (const node of nodes) {
      result.push({ node, depth })
      if (Array.isArray(node.items) && node.items.length > 0) {
        result.push(...flattenNodes(node.items, depth + 1))
      }
    }
    return result
  }

  function rebuildFlatNodes() {
    _flatNodes = outline.value ? flattenNodes(outline.value) : []
  }

  // ── Lazy Resolution ──────────────────────────────────────

  function destKey(dest) {
    return typeof dest === 'string' ? dest : JSON.stringify(dest)
  }

  async function resolvePageNumber(dest) {
    if (!dest || !_session) return null

    const key = destKey(dest)
    if (_pageCache.has(key)) {
      return _pageCache.get(key)
    }

    try {
      const target = await _session.resolveDestination(dest)
      if (target?.type === NavigationTargetType.PAGE) {
        _pageCache.set(key, target.pageNumber)
        return target.pageNumber
      }
    } catch {
      // resolution failed — cache nothing, retry next time
    }

    return null
  }

  // ── Active Node ──────────────────────────────────────────

  let _activeGeneration = 0

  async function updateActiveOutline() {
    const generation = ++_activeGeneration
    const page = currentPage.value

    if (page < 1 || _flatNodes.length === 0) {
      activeOutlineDest.value = null
      return
    }

    const seen = new Set()
    const unresolvedDests = []
    for (const entry of _flatNodes) {
      if (!entry.node.dest) continue
      const key = destKey(entry.node.dest)
      if (!_pageCache.has(key) && !seen.has(key)) {
        seen.add(key)
        unresolvedDests.push(entry.node.dest)
      }
    }

    if (unresolvedDests.length > 0) {
      await Promise.all(unresolvedDests.map((d) => resolvePageNumber(d)))
    }

    if (generation !== _activeGeneration) return

    let best = null
    for (const entry of _flatNodes) {
      if (!entry.node.dest) continue
      const key = destKey(entry.node.dest)
      const resolved = _pageCache.get(key)
      if (resolved !== undefined && resolved <= page) {
        best = entry.node.dest
      }
    }

    activeOutlineDest.value = best
  }

  watch(currentPage, () => {
    void updateActiveOutline()
  })

  // ── Navigation ───────────────────────────────────────────

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

  // ── Lifecycle ────────────────────────────────────────────

  async function attachDocument(documentSession) {
    _session = documentSession
    _pageCache.clear()
    _flatNodes = []
    activeOutlineDest.value = null

    try {
      const loadedOutline = await documentSession.loadOutline()

      if (_session !== documentSession) {
        return
      }

      outline.value = loadedOutline
      rebuildFlatNodes()
      void updateActiveOutline()
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
    activeOutlineDest.value = null
    _flatNodes = []
    _pageCache.clear()
  }

  return {
    currentPage,
    isNavigating,
    outline,
    hasOutline,
    activeOutlineDest,
    navigateToPage,
    navigateToDestination,
    attachDocument,
    detachDocument
  }
}
