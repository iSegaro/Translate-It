import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { syncScroll as syncScrollViaGeometry } from '../utils/pdfGeometrySyncEngine.js'

const SCROLL_POSITION_EPSILON = 1
const SCROLL_SYNC_PANE = Object.freeze({
  ORIGINAL: 'original',
  TRANSLATED: 'translated'
})

export { SCROLL_SYNC_PANE }

const PAGE_SELECTOR = '[data-page-number]'

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function getScrollableRange(element) {
  return Math.max(0, Number(element?.scrollHeight || 0) - Number(element?.clientHeight || 0))
}

function pageHeightResolver(geometry) {
  const el = geometry.element
  if (!el) return geometry.height

  const body = el.querySelector('.pdf-translated-page__body')
  if (!body) return geometry.height

  const bodyRect = body.getBoundingClientRect()
  return Number(bodyRect.height) || geometry.height
}

function syncByRatio(sourcePane, targetPane, setSuppression) {
  const sourceRange = getScrollableRange(sourcePane)
  const targetRange = getScrollableRange(targetPane)

  if (sourceRange <= 0 || targetRange <= 0) return

  const ratio = clampRatio(Number(sourcePane.scrollTop || 0) / sourceRange)
  const nextScrollTop = Math.round(ratio * targetRange)

  if (Math.abs(Number(targetPane.scrollTop || 0) - nextScrollTop) <= SCROLL_POSITION_EPSILON) {
    return
  }

  setSuppression(targetPane)
  targetPane.scrollTop = nextScrollTop
}

export function usePdfScrollSync(originalPaneRef, translatedPaneRef, enabledRef) {
  const isEnabled = computed(() => Boolean(enabledRef?.value))
  const isScrollSyncSuppressed = ref(false)

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

  function setScrollSyncSuppressed(value) {
    isScrollSyncSuppressed.value = Boolean(value)
    if (isScrollSyncSuppressed.value) {
      cancelFrame()
    }
  }

  function clearSuppression() {
    suppressSource = null
  }

  function detachListeners() {
    cleanupListeners()
    cleanupListeners = () => {}
  }

  function scheduleSync(sourcePane, targetPane) {
    pendingSource = { sourcePane, targetPane }

    if (frameId != null) return

    frameId = requestAnimationFrame(() => {
      frameId = null
      const pending = pendingSource
      pendingSource = null

      if (!pending || !isEnabled.value || isScrollSyncSuppressed.value) return

      runSync(pending.sourcePane, pending.targetPane)
    })
  }

  function handleOriginalScroll() {
    const sourcePane = originalPaneRef.value
    const targetPane = translatedPaneRef.value
    if (!isEnabled.value || isScrollSyncSuppressed.value || !sourcePane || !targetPane) return
    if (suppressSource === sourcePane) {
      clearSuppression()
      return
    }

    scheduleSync(sourcePane, targetPane)
  }

  function handleTranslatedScroll() {
    const sourcePane = translatedPaneRef.value
    const targetPane = originalPaneRef.value
    if (!isEnabled.value || isScrollSyncSuppressed.value || !sourcePane || !targetPane) return
    if (suppressSource === sourcePane) {
      clearSuppression()
      return
    }

    scheduleSync(sourcePane, targetPane)
  }

  function runSync(sourcePane, targetPane) {
    const result = syncScrollViaGeometry({
      sourceScrollTop: Number(sourcePane.scrollTop || 0),
      sourceContainer: sourcePane,
      targetContainer: targetPane,
      pageSelector: PAGE_SELECTOR,
      heightResolver: pageHeightResolver
    })

    if (
      result
      && Number.isFinite(result.targetScrollTop)
      && result.sourceGeometry?.height > 0
    ) {
      const nextScrollTop = Math.round(result.targetScrollTop)

      if (Math.abs(Number(targetPane.scrollTop || 0) - nextScrollTop) <= SCROLL_POSITION_EPSILON) {
        return
      }

      suppressSource = targetPane
      targetPane.scrollTop = nextScrollTop
      return
    }

    syncByRatio(sourcePane, targetPane, (pane) => {
      suppressSource = pane
    })
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

    // Controlled view/layout transitions restore their authoritative anchor and
    // then explicitly choose the sync direction. Avoid heuristic initial writes
    // here so setup cannot overwrite that restored owner.
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

  function syncFromPane(owner) {
    if (!isEnabled.value || isScrollSyncSuppressed.value) return

    const original = originalPaneRef.value
    const translated = translatedPaneRef.value
    if (!original || !translated) return

    suppressSource = null
    if (owner === SCROLL_SYNC_PANE.TRANSLATED) {
      runSync(translated, original)
      return
    }

    runSync(original, translated)
  }

  function syncNow() {
    syncFromPane(SCROLL_SYNC_PANE.ORIGINAL)
  }

  return { syncFromPane, syncNow, setScrollSyncSuppressed }
}
