import { computed, onBeforeUnmount, watch } from 'vue'

const SCROLL_POSITION_EPSILON = 1

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function getScrollableRange(element) {
  return Math.max(0, Number(element?.scrollHeight || 0) - Number(element?.clientHeight || 0))
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

      syncScroll(pending.sourcePane, pending.targetPane)
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
}
