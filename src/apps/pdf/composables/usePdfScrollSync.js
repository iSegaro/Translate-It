import { computed, onBeforeUnmount, watch } from 'vue'

const SCROLL_POSITION_EPSILON = 1

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function getScrollableRange(element) {
  return Math.max(0, Number(element?.scrollHeight || 0) - Number(element?.clientHeight || 0))
}

function getPageNumber(element) {
  return Number(element?.dataset?.pageNumber)
}

function getPageElements(pane) {
  return pane?.querySelectorAll?.('[data-page-number]') || []
}

function getPageBodyElement(pageElement) {
  return pageElement?.querySelector?.('.pdf-translated-page__body') || pageElement
}

function getElementTopRelativeToPane(element, pane) {
  if (!element || !pane) return 0
  const elementRect = element.getBoundingClientRect()
  const paneRect = pane.getBoundingClientRect()
  return elementRect.top - paneRect.top + pane.scrollTop
}

function findPageForScrollTop(pane, scrollTop) {
  const pages = [...getPageElements(pane)]
    .map((pageElement) => {
      const rect = pageElement.getBoundingClientRect()
      return {
        pageElement,
        pageNumber: getPageNumber(pageElement),
        top: getElementTopRelativeToPane(pageElement, pane),
        height: rect.height
      }
    })
    .filter((page) => Number.isFinite(page.pageNumber))

  if (!pages.length) return null

  let bestPage = pages[0]
  for (const page of pages) {
    if (page.top <= scrollTop) {
      bestPage = page
      continue
    }

    break
  }

  return bestPage
}

function getEffectivePageHeight(pageElement, pane, paneKind) {
  if (!pageElement || !pane) return 0

  if (paneKind === 'translated') {
    const body = getPageBodyElement(pageElement)
    const bodyRect = body?.getBoundingClientRect?.()
    if (bodyRect && Number(bodyRect.height) > 0) {
      return Number(bodyRect.height)
    }
  }

  const rect = pageElement.getBoundingClientRect()
  return Number(rect.height || 0)
}

function getPageOffsetTop(pageElement, pane) {
  if (!pageElement || !pane) return 0
  return getElementTopRelativeToPane(pageElement, pane)
}

function syncByPageBoundary(sourcePane, targetPane, sourceKind, targetKind, setSuppression) {
  const sourceScrollTop = Number(sourcePane.scrollTop || 0)
  const sourcePage = findPageForScrollTop(sourcePane, sourceScrollTop)
  if (!sourcePage?.pageElement || !Number.isFinite(sourcePage.pageNumber)) return false

  const targetPage = [...getPageElements(targetPane)].find((pageElement) => {
    return getPageNumber(pageElement) === sourcePage.pageNumber
  })
  if (!targetPage) return false

  const sourceHeight = getEffectivePageHeight(sourcePage.pageElement, sourcePane, sourceKind)
  const targetHeight = getEffectivePageHeight(targetPage, targetPane, targetKind)
  if (sourceHeight <= 0 || targetHeight <= 0) return false

  const sourceOffsetTop = getPageOffsetTop(sourcePage.pageElement, sourcePane)
  const targetOffsetTop = getPageOffsetTop(targetPage, targetPane)
  const ratio = clampRatio((sourceScrollTop - sourceOffsetTop) / sourceHeight)
  const nextScrollTop = Math.round(targetOffsetTop + (ratio * targetHeight))

  if (Math.abs(Number(targetPane.scrollTop || 0) - nextScrollTop) <= SCROLL_POSITION_EPSILON) {
    return true
  }

  setSuppression(targetPane)
  targetPane.scrollTop = nextScrollTop
  return true
}

export function usePdfScrollSync(originalPaneRef, translatedPaneRef, enabledRef) {
  const isEnabled = computed(() => Boolean(enabledRef?.value))

  let frameId = null
  let pendingSource = null
  let suppressSource = null
  let cleanupListeners = () => {}

  function cancelFrame() {
    if (frameId != null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }

    pendingSource = null
  }

  function clearSuppression() {
    suppressSource = null
  }

  function detachListeners() {
    cleanupListeners()
    cleanupListeners = () => {}
  }

  function syncScroll(sourcePane, targetPane) {
    const sourceRange = getScrollableRange(sourcePane)
    const targetRange = getScrollableRange(targetPane)

    if (sourceRange <= 0 || targetRange <= 0) return

    const ratio = clampRatio(Number(sourcePane.scrollTop || 0) / sourceRange)
    const nextScrollTop = Math.round(ratio * targetRange)

    if (Math.abs(Number(targetPane.scrollTop || 0) - nextScrollTop) <= SCROLL_POSITION_EPSILON) {
      return
    }

    suppressSource = targetPane
    targetPane.scrollTop = nextScrollTop
  }

  function scheduleSync(sourcePane, targetPane) {
    pendingSource = { sourcePane, targetPane }

    if (frameId != null) return

    frameId = requestAnimationFrame(() => {
      frameId = null
      const pending = pendingSource
      pendingSource = null

      if (!pending || !isEnabled.value) return

      runSync(pending.sourcePane, pending.targetPane)
    })
  }

  function handleOriginalScroll() {
    const sourcePane = originalPaneRef.value
    const targetPane = translatedPaneRef.value
    if (!isEnabled.value || !sourcePane || !targetPane) return
    if (suppressSource === sourcePane) {
      clearSuppression()
      return
    }

    scheduleSync(sourcePane, targetPane)
  }

  function handleTranslatedScroll() {
    const sourcePane = translatedPaneRef.value
    const targetPane = originalPaneRef.value
    if (!isEnabled.value || !sourcePane || !targetPane) return
    if (suppressSource === sourcePane) {
      clearSuppression()
      return
    }

    scheduleSync(sourcePane, targetPane)
  }

  function runSync(sourcePane, targetPane) {
    const sourceKind = sourcePane === originalPaneRef.value ? 'original' : 'translated'
    const targetKind = targetPane === originalPaneRef.value ? 'original' : 'translated'

    if (syncByPageBoundary(sourcePane, targetPane, sourceKind, targetKind, (pane) => {
      suppressSource = pane
    })) {
      return
    }

    syncScroll(sourcePane, targetPane)
  }

  function setupListeners() {
    detachListeners()
    cancelFrame()
    clearSuppression()

    const originalPane = originalPaneRef.value
    const translatedPane = translatedPaneRef.value

    if (!isEnabled.value || !originalPane || !translatedPane) return

    originalPane.addEventListener('scroll', handleOriginalScroll, { passive: true })
    translatedPane.addEventListener('scroll', handleTranslatedScroll, { passive: true })

    cleanupListeners = () => {
      originalPane.removeEventListener('scroll', handleOriginalScroll)
      translatedPane.removeEventListener('scroll', handleTranslatedScroll)
    }

    runSync(originalPane, translatedPane)
  }

  watch(
    () => [isEnabled.value, originalPaneRef.value, translatedPaneRef.value],
    setupListeners,
    { immediate: true, flush: 'post' }
  )

  onBeforeUnmount(() => {
    detachListeners()
    cancelFrame()
    clearSuppression()
  })

  function syncNow() {
    if (!isEnabled.value) return

    const original = originalPaneRef.value
    const translated = translatedPaneRef.value
    if (!original || !translated) return

    suppressSource = null
    runSync(original, translated)
  }

  return { syncNow }
}
