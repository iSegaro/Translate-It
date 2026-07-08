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
      :clear-on-unmount="ownsPageRenderLifecycle"
      @render-committed="handleRenderCommitted"
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
import {
  getCanvasScrollTop,
  getElementClientMetrics,
  getPageGeometry,
  getScrollMetrics,
  getScrollSpaceTop
} from '../utils/pdfGeometryModel.js'
import { CURRENT_PAGE_SOURCE } from '../utils/pdfCurrentPageResolver.js'
import { resolveRenderWindow } from '../utils/pdfRenderWindowResolver.js'
import { PdfRenderWindowState } from '../rendering/PdfRenderWindowState.js'
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
  freezeRenderWindowEviction: {
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
const renderWindowState = new PdfRenderWindowState()
const visiblePageNumbers = ref(new Set())
const renderCandidatePageNumbers = ref(new Set())
const highlightedBounds = ref(null)
let intersectionObserver = null
let resizeObserver = null
let scrollRoot = null
let currentPageFrameId = null
let renderWindowFrameId = null
let lastLayoutWidth = 0
let lastLayoutHeight = 0
let lastCurrentPage = 0
let renderWindowEpoch = 0

const isOriginalRole = computed(() => props.viewerRole === VIEWER_ROLE.ORIGINAL)
const ownsPageRenderLifecycle = computed(() => props.viewerRole === VIEWER_ROLE.ORIGINAL)

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

    const geometry = getPageGeometry(rootEl, props.scrollContainer || viewerRoot.value)
    const rect = geometry?.rect
    if (!rect) continue

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
  if (intersectionObserver && rootEl) {
    rootEl.dataset.pageNumber = String(pageNumber)
    intersectionObserver.observe(rootEl)
  }
}

function disconnectObservers() {
  intersectionObserver?.disconnect()
  resizeObserver?.disconnect()
  if (scrollRoot) {
    scrollRoot.removeEventListener('scroll', handleScroll)
    scrollRoot = null
  }
  cancelCurrentPageFrame()
  cancelRenderWindowFrame()
  intersectionObserver = null
  resizeObserver = null
}

function refreshObservationTargets() {
  if (!intersectionObserver) return

  for (const [pageNumber, instance] of pageViews.entries()) {
    const rootEl = getPdfPageRootElement(instance)
    if (!rootEl) continue

    rootEl.dataset.pageNumber = String(pageNumber)
    intersectionObserver.observe(rootEl)
  }
}

function updateVisiblePages(nextVisible) {
  logger.info('[PDF Zoom Trace] updateVisiblePages', {
    nextVisible: [...nextVisible],
    timestamp: Date.now()
  })
  visiblePageNumbers.value = nextVisible

  if (isOriginalRole.value) {
    props.session.updateVisiblePages(nextVisible)
  }

  if (isOriginalRole.value) {
    scheduleCurrentPageUpdate()
  }
}

function updateRenderCandidates(nextRenderable) {
  logger.info('[PDF Zoom Trace] updateRenderCandidates', {
    nextRenderable: [...nextRenderable],
    timestamp: Date.now()
  })
  renderCandidatePageNumbers.value = nextRenderable

  if (isOriginalRole.value) {
    props.session.updateRenderCandidates(nextRenderable)
  }
}

function setsEqual(first, second) {
  if (first.size !== second.size) return false

  for (const value of first) {
    if (!second.has(value)) return false
  }

  return true
}

watch(
  () => props.suppressCurrentPageUpdates,
  (suppress) => {
    if (suppress) {
      cancelCurrentPageFrame()
    }
  }
)

watch(
  () => props.freezeRenderWindowEviction,
  () => {
    renderWindowEpoch += 1
    cancelRenderWindowFrame()
    renderWindowState.update({ frozen: true })
  },
  { flush: 'sync' }
)

function cancelCurrentPageFrame() {
  if (currentPageFrameId != null) {
    cancelAnimationFrame(currentPageFrameId)
    currentPageFrameId = null
  }
}

function cancelRenderWindowFrame() {
  if (renderWindowFrameId != null) {
    cancelAnimationFrame(renderWindowFrameId)
    renderWindowFrameId = null
  }
}

function applyRenderWindow({ epoch = renderWindowEpoch, force = false } = {}) {
  if (props.freezeRenderWindowEviction) {
    renderWindowState.update({ frozen: true })
    return
  }

  if (!force && epoch !== renderWindowEpoch) {
    return
  }

  const container = scrollRoot || props.scrollContainer || viewerRoot.value || null
  const renderWindow = resolveRenderWindow({
    container,
    pageSelector: '.pdf-page[data-page-number]',
    bufferPages: 1
  })

  const scrollTop = container?.scrollTop ?? 0
  logger.info('[PDF Zoom Trace] applyRenderWindow', {
    scrollTop,
    primaryPage: renderWindow.primaryPage,
    visiblePages: renderWindow.visiblePages,
    renderPages: renderWindow.renderPages,
    candidateCount: renderCandidatePageNumbers.value.size,
    timestamp: Date.now()
  })

  updateVisiblePages(new Set(renderWindow.visiblePages))
  renderWindowState.update({
    visiblePages: renderWindow.visiblePages,
    renderPages: renderWindow.renderPages,
    primaryPage: renderWindow.primaryPage,
    frozen: props.freezeRenderWindowEviction
  })
  updateRenderCandidates(renderWindowState.getEffectiveCandidates())
}

function handleRenderCommitted(pageNumber) {
  if (!isOriginalRole.value) return
  if (!renderWindowState.hasPending()) return

  const previousCandidates = renderWindowState.getEffectiveCandidates()
  renderWindowState.markRendered(pageNumber)
  const nextCandidates = renderWindowState.getEffectiveCandidates()

  if (!setsEqual(previousCandidates, nextCandidates)) {
    updateRenderCandidates(nextCandidates)
  }
}

function scheduleRenderWindowUpdate() {
  if (renderWindowFrameId != null) return

  const epoch = renderWindowEpoch
  renderWindowFrameId = requestAnimationFrame(() => {
    renderWindowFrameId = null
    applyRenderWindow({ epoch })
  })
}

function emitCurrentPageFromResolver(force = false) {
  if (!isOriginalRole.value) return
  if (!force && props.suppressCurrentPageUpdates) return

  const container = scrollRoot || props.scrollContainer || viewerRoot.value || null
  const { scrollTop } = getScrollMetrics(container)
  const currentPage = resolveRenderWindow({
    scrollTop,
    container,
    pageSelector: '.pdf-page[data-page-number]',
    bufferPages: 1
  }).primaryPage
  if (!currentPage) return

  if (currentPage && currentPage !== lastCurrentPage) {
    lastCurrentPage = currentPage
    logger.debug(`[PDF Primary Page] ${JSON.stringify({ emittedCurrentPage: currentPage, currentPageSource: CURRENT_PAGE_SOURCE, scrollTop, timestamp: new Date().toISOString() })}`)
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
  scheduleRenderWindowUpdate()
  scheduleCurrentPageUpdate()
}

function emitCurrentPageIfVisible() {
  if (!isOriginalRole.value) return
  if (props.suppressCurrentPageUpdates) return

  emitCurrentPageFromResolver()
}

function emitLayoutIfNeeded() {
  if (!isOriginalRole.value) return

  const viewerMetrics = getElementClientMetrics(viewerRoot.value)
  const scrollMetrics = getElementClientMetrics(props.scrollContainer)
  const width = Math.floor(viewerMetrics.width)
  const height = Math.floor(scrollMetrics.height || viewerMetrics.height)

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

  intersectionObserver = new IntersectionObserver(() => {
    scheduleRenderWindowUpdate()
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
  applyRenderWindow()
  emitCurrentPageIfVisible()
}

watch(
  () => props.pages,
  async () => {
    const epoch = renderWindowEpoch
    await nextTick()
    if (epoch !== renderWindowEpoch) return
    refreshObservationTargets()
    applyRenderWindow({ epoch })

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
  renderWindowState.reset()

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

    const targetScrollTop = getScrollSpaceTop(pageEl, container)
    if (!Number.isFinite(targetScrollTop)) return

    container.scrollTo({
      top: targetScrollTop,
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

  const targetScrollTop = getCanvasScrollTop(canvasEl, container, cssY)
  if (!Number.isFinite(targetScrollTop)) return

  container.scrollTo({
    top: targetScrollTop,
    behavior: options.behavior === 'instant' ? 'auto' : 'smooth'
  })
}

defineExpose({
  collectCanvasDataUrls,
  scrollToPage,
  getScrollContainer,
  getPageElement,
  refreshRenderWindow: () => applyRenderWindow({ force: true }),
  refreshCurrentPage: () => emitCurrentPageFromResolver(true)
})
</script>
