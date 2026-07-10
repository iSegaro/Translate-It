import { onBeforeUnmount, ref } from 'vue'
import { getPdfPageRootElement } from '../utils/pageViewInstance.js'

export function usePdfScrollObservation({
  viewerRoot,
  scrollContainer,
  onScroll,
  getPageViews
} = {}) {
  const scrollRoot = ref(null)
  let intersectionObserver = null
  let _scrollEventId = 0

  function intersectionCallback(entries) {
    const entryDetails = entries.map((entry) => ({
      pageNumber: Number(entry.target?.dataset?.pageNumber ?? 0),
      isIntersecting: entry.isIntersecting,
      intersectionRatio: Math.round(entry.intersectionRatio * 100) / 100,
      boundingClientRect: entry.boundingClientRect ? {
        top: Math.round(entry.boundingClientRect.top),
        bottom: Math.round(entry.boundingClientRect.bottom),
        height: Math.round(entry.boundingClientRect.height)
      } : null
    }))
    _scrollEventId += 1
    console.log('[LAYOUT-DIAG][event-chain]', JSON.stringify({
      source: 'IntersectionObserver',
      eventId: _scrollEventId,
      entries: entryDetails,
      rootScrollTop: scrollRoot.value?.scrollTop ?? 0,
      rootScrollHeight: scrollRoot.value?.scrollHeight ?? 0
    }))
    onScroll()
  }

  function scrollCallback() {
    _scrollEventId += 1
    console.log('[LAYOUT-DIAG][event-chain]', JSON.stringify({
      source: 'scroll',
      eventId: _scrollEventId,
      scrollTop: scrollRoot.value?.scrollTop ?? 0,
      scrollHeight: scrollRoot.value?.scrollHeight ?? 0,
      clientHeight: scrollRoot.value?.clientHeight ?? 0
    }))
    onScroll()
  }

  function disconnectScrollObservation() {
    intersectionObserver?.disconnect()
    if (scrollRoot.value) {
      scrollRoot.value.removeEventListener('scroll', scrollCallback)
      scrollRoot.value = null
    }
    intersectionObserver = null
  }

  function refreshObservationTargets() {
    if (!intersectionObserver) return
    if (!getPageViews) return

    for (const [pageNumber, instance] of getPageViews().entries()) {
      const rootEl = getPdfPageRootElement(instance)
      if (!rootEl) continue
      rootEl.dataset.pageNumber = String(pageNumber)
      intersectionObserver.observe(rootEl)
    }
  }

  function observePageView(pageNumber, instance) {
    const rootEl = getPdfPageRootElement(instance)
    if (intersectionObserver && rootEl) {
      rootEl.dataset.pageNumber = String(pageNumber)
      intersectionObserver.observe(rootEl)
    }
  }

  function unregisterPageView(_pageNumber) {
  }

  function setupScrollObservation() {
    disconnectScrollObservation()
    if (!viewerRoot.value) return

    scrollRoot.value = scrollContainer.value || null

    if (scrollRoot.value) {
      scrollRoot.value.addEventListener('scroll', scrollCallback, { passive: true })
    }

    intersectionObserver = new IntersectionObserver(intersectionCallback, {
      root: scrollRoot.value,
      threshold: 0
    })

    refreshObservationTargets()
  }

  onBeforeUnmount(() => {
    disconnectScrollObservation()
  })

  return {
    scrollRoot,
    setupScrollObservation,
    disconnectScrollObservation,
    refreshObservationTargets,
    observePageView,
    unregisterPageView
  }
}