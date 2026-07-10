import { ref, computed, nextTick, watch } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { NavigationTargetType, destKey } from '@/features/pdf-translation/core/NavigationModels.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfNavigation')

export function usePdfNavigation(viewerRef) {
  const currentPage = ref(0)
  const isNavigating = ref(false)
  const outline = ref(null)
  const activeOutlineDest = ref(null)
  const expandedDests = ref(new Set())

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

  // ── Ancestor Path ────────────────────────────────────────

  function computeExpandedDests(activeDest, activeIndex = -1) {
    if (!activeDest || _flatNodes.length === 0) {
      return new Set()
    }

    if (activeIndex < 0) {
      for (let i = _flatNodes.length - 1; i >= 0; i--) {
        if (_flatNodes[i].node.dest === activeDest) {
          activeIndex = i
          break
        }
      }
    }

    if (activeIndex < 0) {
      return new Set()
    }

    const expanded = new Set()
    expanded.add(destKey(activeDest))

    let currentDepth = _flatNodes[activeIndex].depth

    for (let i = activeIndex - 1; i >= 0 && currentDepth > 0; i--) {
      const entry = _flatNodes[i]
      if (entry.depth === currentDepth - 1) {
        if (entry.node.dest) {
          expanded.add(destKey(entry.node.dest))
        }
        currentDepth = entry.depth
      }
    }

    return expanded
  }

  function setsEqual(a, b) {
    if (a === b) return true
    if (a.size !== b.size) return false
    for (const val of a) {
      if (!b.has(val)) return false
    }
    return true
  }

  // ── Lazy Resolution ──────────────────────────────────────

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

    const unresolvedDests = []
    const seen = new Set()
    const evaluatedKeys = new Set()
    let best = null
    let bestIndex = -1
    let bestPage = 0

    for (let i = 0; i < _flatNodes.length; i++) {
      const entry = _flatNodes[i]
      if (!entry.node.dest) continue

      const key = destKey(entry.node.dest)
      const resolved = _pageCache.get(key)

      if (resolved === undefined) {
        if (!seen.has(key)) {
          seen.add(key)
          unresolvedDests.push(entry.node.dest)
        }
        continue
      }

      evaluatedKeys.add(key)
      if (resolved != null && resolved <= page && resolved >= bestPage) {
        best = entry.node.dest
        bestIndex = i
        bestPage = resolved
      }
    }

    if (unresolvedDests.length > 0) {
      await Promise.all(unresolvedDests.map((d) => resolvePageNumber(d)))

      if (generation !== _activeGeneration) return

      for (let i = 0; i < _flatNodes.length; i++) {
        const entry = _flatNodes[i]
        if (!entry.node.dest) continue

        const key = destKey(entry.node.dest)
        if (evaluatedKeys.has(key)) continue

        const resolved = _pageCache.get(key)
        if (resolved != null && resolved <= page && resolved >= bestPage) {
          best = entry.node.dest
          bestIndex = i
          bestPage = resolved
        }
      }
    }

    activeOutlineDest.value = best

    const nextExpanded = computeExpandedDests(best, bestIndex)
    if (!setsEqual(expandedDests.value, nextExpanded)) {
      expandedDests.value = nextExpanded
    }
  }

  watch(currentPage, (newPage, oldPage) => {
    console.log('[LAYOUT-DIAG][current-page]', JSON.stringify({
      previousPage: oldPage,
      newPage,
      reason: 'currentPage ref changed',
      eventSource: 'unknown(usePdfNavigation watch)'
    }))
    void updateActiveOutline()
  })

  // ── Validation ───────────────────────────────────────────

  const ALLOWED_PROTOCOLS = Object.freeze(['http:', 'https:', 'mailto:', 'tel:'])
  const REJECTED_PROTOCOLS = Object.freeze(['javascript:', 'data:', 'vbscript:'])

  function isValidNavigationUrl(url) {
    try {
      const parsed = new URL(url, window.location.href)
      if (REJECTED_PROTOCOLS.includes(parsed.protocol)) return false
      if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) return false
      return true
    } catch {
      return false
    }
  }

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
    const previousPage = currentPage.value
    currentPage.value = num

    console.log('[LAYOUT-DIAG][current-page]', JSON.stringify({
      previousPage,
      newPage: num,
      reason: 'explicit navigation',
      eventSource: 'navigateToPage'
    }))

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
        navigateToPage(target.pageNumber, {
          left: target.left,
          top: target.top,
          zoom: target.zoom
        })
        return
      }

      logger.info('Non-page target type ignored for now:', target.type)
    } catch (error) {
      logger.warn('Failed to navigate to destination:', error)
    }
  }

  function handleNavigationTarget(target) {
    if (!target) {
      return
    }

    switch (target.type) {
      case NavigationTargetType.PAGE:
        navigateToDestination(target.dest)
        break

      case NavigationTargetType.URI: {
        if (!isValidNavigationUrl(target.url)) {
          logger.warn('Rejected unsafe URL:', target.url)
          return
        }

        const openedWindow = window.open(
          target.url,
          '_blank',
          'noopener,noreferrer'
        )

        if (!openedWindow) {
          logger.warn('Failed to open URL — popup may have been blocked:', target.url)
        }
        break
      }

      case NavigationTargetType.ACTION:
        logger.warn('Named action not yet implemented:', target.action)
        break

      case NavigationTargetType.EXTERNAL_FILE:
        logger.warn('External file navigation not supported:', target.fileName)
        break

      case NavigationTargetType.UNSUPPORTED:
        logger.warn('Unsupported navigation target:', target.reason)
        break
    }
  }

  // ── Lifecycle ────────────────────────────────────────────

  async function attachDocument(documentSession) {
    _session = documentSession
    _pageCache.clear()
    _flatNodes = []
    activeOutlineDest.value = null
    expandedDests.value = new Set()

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
    expandedDests.value = new Set()
    _flatNodes = []
    _pageCache.clear()
  }

  return {
    currentPage,
    isNavigating,
    outline,
    hasOutline,
    activeOutlineDest,
    expandedDests,
    navigateToPage,
    navigateToDestination,
    handleNavigationTarget,
    attachDocument,
    detachDocument
  }
}
