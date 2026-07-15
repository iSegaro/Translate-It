<template>
  <div
    ref="viewerRoot"
    class="pdf-viewer"
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
      :region-selection-active="regionSelectionEnabled"
      :region-selection-rect="regionSelection.activePageNumber.value === page.pageNumber ? regionSelection.rect.value : null"
      @render-started="handleRenderStarted"
      @render-committed="handleRenderCommitted"
      @render-cancelled="handleRenderCancelled"
      @render-failed="handleRenderFailed"
      @region-selection-pointer-down="regionSelection.handlePointerDown"
      @region-selection-pointer-move="regionSelection.handlePointerMove"
      @region-selection-pointer-up="regionSelection.handlePointerUp"
      @region-selection-pointer-cancel="regionSelection.handlePointerCancel"
      @region-selection-lost-pointer-capture="regionSelection.handleLostPointerCapture"
      @region-selection-page-unmounted="regionSelection.handlePageUnmount"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PdfPageView from './PdfPageView.vue'
import { getPdfPageRootElement } from '../utils/pageViewInstance.js'
import { getCanvasScrollTop, getScrollSpaceTop } from '../utils/pdfGeometryModel.js'
import { usePdfRenderPipeline } from '../composables/usePdfRenderPipeline.js'
import { usePdfSelectionBridge } from '../composables/usePdfSelectionBridge.js'
import { usePdfScrollObservation } from '../composables/usePdfScrollObservation.js'
import { usePdfLayoutMonitor } from '../composables/usePdfLayoutMonitor.js'
import { usePdfCurrentPage } from '../composables/usePdfCurrentPage.js'
import { usePdfRegionSelectionController } from '../composables/usePdfRegionSelectionController.js'
import { usePdfRegionOcr } from '../composables/usePdfRegionOcr.js'
import { VIEWER_ROLE } from '../composables/usePdfViewerMode.js'
import { mapPageLocalCssRectToPdfRegion } from '@/features/pdf-translation/core/PdfRegionMapper.js'
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
  },
  regionSelectionActive: {
    type: Boolean,
    default: false
  },
  regionOcrScale: {
    type: Number,
    default: null
  },
  regionOcrLanguage: {
    type: String,
    default: ''
  }
})

const emit = defineEmits([
  'layout-change',
  'current-page-change',
  'visible-pages-change',
  'region-selection-complete',
  'region-ocr-recognized'
])
const viewerRoot = ref(null)
const pageViews = new Map()
let lastEmittedVisiblePages = new Set()
let activeRegionPosition = null

const isOriginalRole = computed(() => props.viewerRole === VIEWER_ROLE.ORIGINAL)
const ownsPageRenderLifecycle = computed(() => props.viewerRole === VIEWER_ROLE.ORIGINAL)
// Engineering-only activation.
// Product-facing activation will be introduced in Region OCR UI phase.
const regionSelectionEnabled = computed(() => isOriginalRole.value && props.regionSelectionActive)
const regionSelection = usePdfRegionSelectionController({
  active: regionSelectionEnabled,
  onComplete: handleRegionSelectionComplete
})
const {
  executeRegionOcr,
  cancelRegionOcr
} = usePdfRegionOcr({
  onRecognized: (data) => {
    const text = typeof data?.text === 'string' ? data.text.trim() : ''
    const position = activeRegionPosition
    activeRegionPosition = null
    if (!text || !position || !isOriginalRole.value) return
    emit('region-ocr-recognized', { text, position })
  }
})

function resolveRegionViewportPosition(pageNumber, rect) {
  const stageRect = pageViews.get(pageNumber)?.getStageEl?.()?.getBoundingClientRect?.()
  if (!stageRect || !rect) return null

  const values = [stageRect.left, stageRect.top, rect.x, rect.y, rect.width, rect.height]
  if (!values.every(Number.isFinite)) return null

  return {
    x: stageRect.left + rect.x,
    y: stageRect.top + rect.y,
    width: rect.width,
    height: rect.height,
    _isViewportRelative: true
  }
}

function handleRegionSelectionComplete(payload) {
  // Interaction event.
  // Emitted whenever the user completes a region selection,
  // regardless of whether OCR starts successfully.
  emit('region-selection-complete', payload)
  
  activeRegionPosition = null
  cancelRegionOcr()
  if (!regionSelectionEnabled.value) return

  const viewport = props.session?.getPageViewport?.(payload?.pageNumber)
  if (!viewport) return

  const position = resolveRegionViewportPosition(payload.pageNumber, payload.rect)
  if (!position) return

  const region = mapPageLocalCssRectToPdfRegion({
    pageNumber: payload.pageNumber,
    rect: payload.rect,
    viewport
  })
  if (!region) return

  activeRegionPosition = position

  executeRegionOcr({
    region,
    pdfDocument: props.session?.pdfDocument,
    scale: props.regionOcrScale,
    language: props.regionOcrLanguage
  })
}

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
  (isFrozen) => {
    onFreezeChange(isFrozen)
  },
  { flush: 'sync' }
)

watch(
  regionSelectionEnabled,
  (enabled) => {
    if (!enabled) {
      activeRegionPosition = null
      cancelRegionOcr()
    }
  }
)

function setupObservers() {
  disconnectObservers()
  if (!viewerRoot.value) return

  setupScrollObservation()

  if (scrollRoot.value) {
    setupLayoutObservation()
  }

  emitLayoutIfNeeded()
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
    applyRenderWindow()
  }
)

onMounted(() => {
  setupObservers()
})

onBeforeUnmount(() => {
  activeRegionPosition = null
  cancelRegionOcr()
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
