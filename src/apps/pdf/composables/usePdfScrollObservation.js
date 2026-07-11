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

  function disconnectScrollObservation() {
    intersectionObserver?.disconnect()
    if (scrollRoot.value) {
      scrollRoot.value.removeEventListener('scroll', onScroll)
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
      scrollRoot.value.addEventListener('scroll', onScroll, { passive: true })
    }

    intersectionObserver = new IntersectionObserver(() => {
      onScroll()
    }, {
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