<template>
  <div
    ref="viewerRoot"
    class="pdf-viewer"
    :class="{ 'pdf-viewer--targeting': isBlockTargetingActive }"
    @pointermove="handlePointerMove"
    @pointerleave="handlePointerLeave"
    @click="handleClick"
  >
    <PdfPageView
      v-for="page in pages"
      :key="page.pageNumber"
      :ref="(instance) => registerPageView(page.pageNumber, instance)"
      :page="page"
      :session="session"
      :visible="renderCandidatePageNumbers.has(page.pageNumber)"
      :show-overlay="showOverlay"
      :overlay-blocks="getPageOverlayBlocks(page.pageNumber)"
      :handle-navigation-target="handleNavigationTarget"
    />

    <PdfBlockHighlightOverlay
      v-for="page in pages"
      :key="`overlay-${page.pageNumber}`"
      :block-bounds="highlightedBounds"
      :page-number="page.pageNumber"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import PdfPageView from './PdfPageView.vue'
import PdfBlockHighlightOverlay from './PdfBlockHighlightOverlay.vue'
import { getPdfPageRootElement } from '../utils/pageViewInstance.js'
import { getPrimaryPage } from '../utils/pdfViewportPageResolver.js'
import { usePdfSelectionBridge } from '../composables/usePdfSelectionBridge.js'
import { VIEWER_ROLE } from '../composables/usePdfViewerMode.js'
import './PdfViewer.scss'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfViewerPrimaryPageTrace')

const props = defineProps({
  pages: {
    type: Array,
    default: () => []
  },
  session: {
    type: Object,
    required: true
  },
  viewerRole: {
    type: String,
    default: VIEWER_ROLE.ORIGINAL,
    validator: (v) => Object.values(VIEWER_ROLE).includes(v)
  },
  isBlockTargetingActive: {
    type: Boolean,
    default: false
  },
  highlightedBlockId: {
    type: String,
    default: null
  },
  showOverlay: {
    type: Boolean,
    default: false
  },
  overlayPageData: {
    type: Array,
    default: () => []
  },
  handleNavigationTarget: {
    type: Function,
    default: null
  },
  suppressCurrentPageUpdates: {
    type: Boolean,
    default: false
  },
  scrollContainer: {
    type: HTMLElement,
    default: null
  }
})

const emit = defineEmits(['layout-change', 'current-page-change', 'block-pointer-move', 'block-click'])
const viewerRoot = ref(null)
const pageViews = new Map()
const visiblePageNumbers = ref(new Set())
const renderCandidatePageNumbers = ref(new Set())
const highlightedBounds = ref(null)
let intersectionObserver = null
let renderCandidateObserver = null
let resizeObserver = null
let scrollRoot = null
let currentPageFrameId = null
let lastLayoutWidth = 0
let lastLayoutHeight = 0
let lastCurrentPage = 0

const isOriginalRole = computed(() => props.viewerRole === VIEWER_ROLE.ORIGINAL)

if (props.viewerRole === VIEWER_ROLE.ORIGINAL) {
  usePdfSelectionBridge(viewerRoot)
}

function getPageOverlayBlocks(pageNumber) {
  const pageData = props.overlayPageData.find((p) => p.pageNumber === pageNumber)
  return pageData?.blocks || []
}

function resolvePageFromPoint(clientX, clientY) {
  if (!viewerRoot.value) return null

  for (const [pageNumber, instance] of pageViews.entries()) {
    const rootEl = getPdfPageRootElement(instance)
    if (!rootEl) continue

    const rect = rootEl.getBoundingClientRect()
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      const pageMetric = props.pages.find((p) => p.pageNumber === pageNumber)
      const x = clientX - rect.left
      const y = clientY - rect.top

      return {
        pageNumber,
        x: x / (pageMetric?.scale || 1),
        y: y / (pageMetric?.scale || 1)
      }
    }
  }

  return null
}

function handlePointerMove(event) {
  if (!isOriginalRole.value) return
  if (!props.isBlockTargetingActive) return

  const pagePoint = resolvePageFromPoint(event.clientX, event.clientY)
  if (!pagePoint) {
    emit('block-pointer-move', { pageNumber: 0, x: 0, y: 0 })
    return
  }

  emit('block-pointer-move', pagePoint)
}

function handlePointerLeave() {
  if (!isOriginalRole.value) return
  if (!props.isBlockTargetingActive) return

  emit('block-pointer-move', { pageNumber: 0, x: -1, y: -1 })
}

function handleClick(event) {
  if (!isOriginalRole.value) return
  if (!props.isBlockTargetingActive) return

  const pagePoint = resolvePageFromPoint(event.clientX, event.clientY)
  if (!pagePoint) return

  emit('block-click', pagePoint)
}

watch(
  () => props.highlightedBlockId,
  (blockId) => {
    if (!blockId) {
      highlightedBounds.value = null
      return
    }

    highlightedBounds.value = getBlockBounds(blockId)
  }
)

function getBlockBounds(blockId) {
  for (const [, instance] of pageViews.entries()) {
    const rootEl = getPdfPageRootElement(instance)
    if (!rootEl) continue

    const pageNumber = Number(rootEl.dataset?.pageNumber)
    if (!pageNumber) continue

    const pageSession = props.session.pageSessions?.get(pageNumber)
    if (!pageSession) continue

    const blocks = pageSession.getLogicalBlocks()
    for (const block of blocks) {
      if (block.id === blockId && block.boundingBox) {
        const pageMetric = props.pages.find((p) => p.pageNumber === pageNumber)
        const scale = pageMetric?.scale || 1

        return {
          pageNumber,
          x: block.boundingBox.x * scale,
          y: block.boundingBox.y * scale,
          width: block.boundingBox.width * scale,
          height: block.boundingBox.height * scale
        }
      }
    }
  }

  return null
}

function registerPageView(pageNumber, instance) {
  if (!instance) {
    pageViews.delete(pageNumber)
    return
  }

  pageViews.set(pageNumber, instance)
  const rootEl = getPdfPageRootElement(instance)
  if (intersectionObserver && renderCandidateObserver && rootEl) {
    rootEl.dataset.pageNumber = String(pageNumber)
    intersectionObserver.observe(rootEl)
    renderCandidateObserver.observe(rootEl)
  }
}

function disconnectObservers() {
  intersectionObserver?.disconnect()
  renderCandidateObserver?.disconnect()
  resizeObserver?.disconnect()
  if (scrollRoot) {
    scrollRoot.removeEventListener('scroll', handleScroll)
    scrollRoot = null
  }
  cancelCurrentPageFrame()
  intersectionObserver = null
  renderCandidateObserver = null
  resizeObserver = null
}

function refreshObservationTargets() {
  if (!intersectionObserver || !renderCandidateObserver) return

  for (const [pageNumber, instance] of pageViews.entries()) {
    const rootEl = getPdfPageRootElement(instance)
    if (!rootEl) continue

    rootEl.dataset.pageNumber = String(pageNumber)
    intersectionObserver.observe(rootEl)
    renderCandidateObserver.observe(rootEl)
  }
}

function updateVisiblePages(nextVisible) {
  visiblePageNumbers.value = nextVisible

  if (isOriginalRole.value) {
    props.session.updateVisiblePages(nextVisible)
  }

  if (isOriginalRole.value) {
    scheduleCurrentPageUpdate()
  }
}

watch(
  () => props.suppressCurrentPageUpdates,
  (suppress) => {
    if (suppress) {
      cancelCurrentPageFrame()
    }
  }
)

function cancelCurrentPageFrame() {
  if (currentPageFrameId != null) {
    cancelAnimationFrame(currentPageFrameId)
    currentPageFrameId = null
  }
}

function emitCurrentPageFromResolver(force = false) {
  if (!isOriginalRole.value) return
  if (!force && props.suppressCurrentPageUpdates) return

  const currentPage = getPrimaryPage(scrollRoot || props.scrollContainer || viewerRoot.value || null, '.pdf-page[data-page-number]')
  if (!currentPage) return

  if (currentPage && currentPage !== lastCurrentPage) {
    lastCurrentPage = currentPage
    logger.debug(`[PDF Primary Page] ${JSON.stringify({ emittedCurrentPage: currentPage, scrollTop: scrollRoot?.scrollTop ?? props.scrollContainer?.scrollTop ?? null, timestamp: new Date().toISOString() })}`)
    emit('current-page-change', currentPage)
  }
}

function scheduleCurrentPageUpdate() {
  if (!isOriginalRole.value) return
  if (props.suppressCurrentPageUpdates) return
  if (currentPageFrameId != null) return

  currentPageFrameId = requestAnimationFrame(() => {
    currentPageFrameId = null
    emitCurrentPageFromResolver()
  })
}

function handleScroll() {
  scheduleCurrentPageUpdate()
}

function emitCurrentPageIfVisible() {
  if (!isOriginalRole.value) return
  if (props.suppressCurrentPageUpdates) return

  emitCurrentPageFromResolver()
}

function emitLayoutIfNeeded() {
  if (!isOriginalRole.value) return

  const width = Math.floor(viewerRoot.value?.clientWidth || 0)
  const height = Math.floor(props.scrollContainer?.clientHeight || viewerRoot.value?.clientHeight || 0)

  if (
    width > 0 &&
    height > 0 &&
    (width !== lastLayoutWidth || height !== lastLayoutHeight)
  ) {
    lastLayoutWidth = width
    lastLayoutHeight = height
    emit('layout-change', {
      width,
      height
    })
  }
}

function setupObservers() {
  disconnectObservers()
  if (!viewerRoot.value) return

  // The scroll container is injected by the layout owner, not discovered via
  // DOM traversal. This keeps PdfViewer decoupled from the surrounding DOM
  // structure and reusable in embedded contexts (split view, modal, iframe).
  scrollRoot = props.scrollContainer || null

  if (scrollRoot) {
    scrollRoot.addEventListener('scroll', handleScroll, { passive: true })
  }

  intersectionObserver = new IntersectionObserver((entries) => {
    const nextVisible = new Set(visiblePageNumbers.value)

    for (const entry of entries) {
      const pageNumber = Number(entry.target?.dataset?.pageNumber)
      if (!pageNumber) continue

      if (entry.isIntersecting) {
        nextVisible.add(pageNumber)
      } else {
        nextVisible.delete(pageNumber)
      }
    }

    updateVisiblePages(nextVisible)
  }, {
    root: scrollRoot,
    threshold: 0
  })

  renderCandidateObserver = new IntersectionObserver((entries) => {
    const nextRenderable = new Set(renderCandidatePageNumbers.value)

    for (const entry of entries) {
      const pageNumber = Number(entry.target?.dataset?.pageNumber)
      if (!pageNumber) continue

      if (entry.isIntersecting) {
        nextRenderable.add(pageNumber)
      } else {
        nextRenderable.delete(pageNumber)
      }
    }

    renderCandidatePageNumbers.value = nextRenderable

    if (isOriginalRole.value) {
      props.session.updateRenderCandidates(nextRenderable)
    }
  }, {
    root: scrollRoot,
    threshold: 0
  })

  resizeObserver = new ResizeObserver(() => {
    emitLayoutIfNeeded()
  })

  resizeObserver.observe(viewerRoot.value)
  if (scrollRoot) {
    resizeObserver.observe(scrollRoot)
  }
  refreshObservationTargets()
  emitLayoutIfNeeded()
  emitCurrentPageIfVisible()
}

watch(
  () => props.pages,
  async () => {
    await nextTick()
    refreshObservationTargets()

    if (isOriginalRole.value) {
      emitLayoutIfNeeded()
      emitCurrentPageIfVisible()
    }
  }
)

watch(
  () => props.scrollContainer,
  async () => {
    await nextTick()
    setupObservers()
  }
)

onMounted(() => {
  setupObservers()
})

onBeforeUnmount(() => {
  disconnectObservers()
  visiblePageNumbers.value = new Set()
  renderCandidatePageNumbers.value = new Set()

  if (isOriginalRole.value) {
    props.session.updateVisiblePages(new Set())
    props.session.updateRenderCandidates(new Set())
  }
})

function collectCanvasDataUrls() {
  const dataUrls = new Map()
  for (const [pageNumber, instance] of pageViews.entries()) {
    try {
      const canvasEl = instance.getCanvasEl?.()
      if (canvasEl && canvasEl.width > 0 && canvasEl.height > 0) {
        dataUrls.set(pageNumber, canvasEl.toDataURL('image/jpeg', 0.85))
      }
    } catch {
      // Canvas may be tainted or unavailable — skip silently
    }
  }
  return dataUrls
}

function getScrollContainer() {
  return props.scrollContainer || null
}

function getPageElement(pageNumber) {
  const instance = pageViews.get(pageNumber)
  return getPdfPageRootElement(instance) || null
}

function isFiniteCoordinate(v) {
  return v != null && Number.isFinite(Number(v))
}

function scrollToPage(pageNumber, options = {}) {
  const num = Number(pageNumber)
  if (!Number.isInteger(num) || num < 1) return

  const instance = pageViews.get(num)
  if (!instance) return

  const container = getScrollContainer()
  if (!container) return

  const hasPosition = isFiniteCoordinate(options.top) || isFiniteCoordinate(options.left)

  if (!hasPosition) {
    const pageEl = getPdfPageRootElement(instance)
    if (!pageEl) return

    const containerRect = container.getBoundingClientRect()
    const pageRect = pageEl.getBoundingClientRect()

    container.scrollTo({
      top: pageRect.top - containerRect.top + container.scrollTop,
      behavior: options.behavior === 'instant' ? 'auto' : 'smooth'
    })
    return
  }

  const canvasEl = instance.getCanvasEl?.()
  if (!canvasEl) return

  const viewport = props.session.getPageViewport(num)
  if (!viewport) return

  const [, cssY] = viewport.convertToViewportPoint(
    Number(options.left) || 0,
    Number(options.top) || 0
  )

  const canvasRect = canvasEl.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()

  const canvasOffsetY = canvasRect.top - containerRect.top + container.scrollTop

  container.scrollTo({
    top: canvasOffsetY + cssY,
    behavior: options.behavior === 'instant' ? 'auto' : 'smooth'
  })
}

defineExpose({
  collectCanvasDataUrls,
  scrollToPage,
  getScrollContainer,
  getPageElement,
  refreshCurrentPage: () => emitCurrentPageFromResolver(true)
})
</script>
