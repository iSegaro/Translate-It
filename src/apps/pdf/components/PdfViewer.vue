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
      :render-allowed="isRenderAllowed(page.pageNumber)"
      :render-priority="getRenderPriority(page.pageNumber)"
      :render-priority-group="getRenderPriorityGroup(page.pageNumber)"
      :show-overlay="showOverlay"
      :overlay-blocks="getPageOverlayBlocks(page.pageNumber)"
      :handle-navigation-target="handleNavigationTarget"
      :clear-on-unmount="ownsPageRenderLifecycle"
      @render-started="handleRenderStarted"
      @render-committed="handleRenderCommitted"
      @render-cancelled="handleRenderCancelled"
      @render-failed="handleRenderFailed"
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
import PdfPageView from './PdfPageView.vue'
import PdfBlockHighlightOverlay from './PdfBlockHighlightOverlay.vue'
import { getPdfPageRootElement } from '../utils/pageViewInstance.js'
import { getCanvasScrollTop, getPageGeometry, getScrollSpaceTop } from '../utils/pdfGeometryModel.js'
import { usePdfRenderPipeline } from '../composables/usePdfRenderPipeline.js'
import { usePdfSelectionBridge } from '../composables/usePdfSelectionBridge.js'
import { usePdfScrollObservation } from '../composables/usePdfScrollObservation.js'
import { usePdfLayoutMonitor } from '../composables/usePdfLayoutMonitor.js'
import { usePdfCurrentPage } from '../composables/usePdfCurrentPage.js'
import { VIEWER_ROLE } from '../composables/usePdfViewerMode.js'
import './PdfViewer.scss'

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

const emit = defineEmits(['layout-change', 'current-page-change', 'visible-pages-change', 'block-pointer-move', 'block-click'])
const viewerRoot = ref(null)
const pageViews = new Map()
const highlightedBounds = ref(null)
let lastEmittedVisiblePages = new Set()

const isOriginalRole = computed(() => props.viewerRole === VIEWER_ROLE.ORIGINAL)
const ownsPageRenderLifecycle = computed(() => props.viewerRole === VIEWER_ROLE.ORIGINAL)

const {
  renderCandidatePageNumbers,
  getRenderPriority,
  getRenderPriorityGroup,
  isRenderAllowed,
  applyRenderWindow,
  scheduleRenderWindowUpdate,
  cancelRenderWindowFrame,
  handleRenderStarted,
  handleRenderCommitted,
  handleRenderCancelled,
  handleRenderFailed,
  onFreezeChange,
  reset: resetRenderPipeline
} = usePdfRenderPipeline({
  isOriginalRole,
  freezeRenderWindowEviction: computed(() => props.freezeRenderWindowEviction),
  getContainer: () => scrollRoot.value || props.scrollContainer || viewerRoot.value || null,
  getPageView: (pageNumber) => pageViews.get(pageNumber),
  onVisiblePagesChange: (nextVisible) => {
    props.session.updateVisiblePages(nextVisible)
    emitVisiblePagesIfChanged(nextVisible)
  },
  onRenderCandidatesChange: (nextRenderable) => {
    props.session.updateRenderCandidates(nextRenderable)
  }
})

const {
  cancelCurrentPageFrame,
  emitCurrentPageFromResolver,
  scheduleCurrentPageUpdate,
  currentPageIfVisible
} = usePdfCurrentPage({
  isOriginalRole,
  suppressCurrentPageUpdates: computed(() => props.suppressCurrentPageUpdates),
  getContainer: () => scrollRoot.value || props.scrollContainer || viewerRoot.value || null,
  onCurrentPageChange: (page) => emit('current-page-change', page)
})

const {
  emitLayoutIfNeeded,
  setupLayoutObservation,
  disconnectLayoutObservation
} = usePdfLayoutMonitor({
  viewerRoot,
  scrollContainer: computed(() => props.scrollContainer),
  isOriginalRole,
  onLayoutChange: (layout) => emit('layout-change', layout)
})

const {
  scrollRoot,
  setupScrollObservation,
  disconnectScrollObservation,
  refreshObservationTargets,
  observePageView,
  unregisterPageView
} = usePdfScrollObservation({
  viewerRoot,
  scrollContainer: computed(() => props.scrollContainer),
  onScroll: () => {
    const cnt = scrollRoot.value || props.scrollContainer
    console.log('[TRACE]', JSON.stringify({
      t: Date.now(),
      site: 'PdfViewer_onScroll',
      origST: cnt?.scrollTop,
      role: props.viewerRole
    }))
    scheduleRenderWindowUpdate()
    scheduleCurrentPageUpdate()
  },
  getPageViews: () => pageViews
})

if (props.viewerRole === VIEWER_ROLE.ORIGINAL) {
  usePdfSelectionBridge(viewerRoot)
}

function getPageOverlayBlocks(pageNumber) {
  const pageData = props.overlayPageData.find((p) => p.pageNumber === pageNumber)
  return pageData?.blocks || []
}

function arePageSetsEqual(first, second) {
  if (first.size !== second.size) return false
  for (const pageNumber of first) {
    if (!second.has(pageNumber)) return false
  }
  return true
}

function emitVisiblePagesIfChanged(nextVisible) {
  const nextSet = new Set(nextVisible || [])
  if (arePageSetsEqual(lastEmittedVisiblePages, nextSet)) return

  lastEmittedVisiblePages = nextSet
  emit('visible-pages-change', new Set(nextSet))
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
    unregisterPageView(pageNumber)
    pageViews.delete(pageNumber)
    return
  }

  pageViews.set(pageNumber, instance)
  observePageView(pageNumber, instance)
}

function disconnectObservers() {
  disconnectScrollObservation()
  disconnectLayoutObservation()
  cancelCurrentPageFrame()
  cancelRenderWindowFrame()
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
    onFreezeChange()
  },
  { flush: 'sync' }
)

function setupObservers() {
  disconnectObservers()
  if (!viewerRoot.value) return

  setupScrollObservation()

  if (scrollRoot.value) {
    setupLayoutObservation()
  }

  emitLayoutIfNeeded()
  applyRenderWindow()
  currentPageIfVisible()
}

watch(
  () => props.pages,
  async () => {
    await nextTick()
    refreshObservationTargets()
    applyRenderWindow()

    if (isOriginalRole.value) {
      emitLayoutIfNeeded()
      currentPageIfVisible()
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
  resetRenderPipeline()
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
