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
      :visible="visiblePageNumbers.has(page.pageNumber)"
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
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PdfPageView from './PdfPageView.vue'
import PdfBlockHighlightOverlay from './PdfBlockHighlightOverlay.vue'
import { getPdfPageRootElement } from '../utils/pageViewInstance.js'
import { usePdfSelectionBridge } from '../composables/usePdfSelectionBridge.js'
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
  scrollContainer: {
    type: HTMLElement,
    default: null
  }
})

const emit = defineEmits(['layout-change', 'current-page-change', 'block-pointer-move', 'block-click'])
const viewerRoot = ref(null)
const pageViews = new Map()
const visiblePageNumbers = ref(new Set())
const highlightedBounds = ref(null)
let intersectionObserver = null
let resizeObserver = null
let lastLayoutWidth = 0
let lastLayoutHeight = 0
let lastCurrentPage = 0

usePdfSelectionBridge(viewerRoot)

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
  if (!props.isBlockTargetingActive) return

  const pagePoint = resolvePageFromPoint(event.clientX, event.clientY)
  if (!pagePoint) {
    emit('block-pointer-move', { pageNumber: 0, x: 0, y: 0 })
    return
  }

  emit('block-pointer-move', pagePoint)
}

function handlePointerLeave() {
  if (!props.isBlockTargetingActive) return

  emit('block-pointer-move', { pageNumber: 0, x: -1, y: -1 })
}

function handleClick(event) {
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
  visiblePageNumbers.value = nextVisible
  props.session.updateVisiblePages(nextVisible)
  emitCurrentPage(nextVisible)
}

function emitCurrentPage(nextVisible) {
  const visiblePages = [...nextVisible].filter((pageNumber) => Number.isFinite(Number(pageNumber)))
  const currentPage = visiblePages.length > 0
    ? Math.min(...visiblePages)
    : (lastCurrentPage || props.pages[0]?.pageNumber || 0)

  if (currentPage && currentPage !== lastCurrentPage) {
    lastCurrentPage = currentPage
    emit('current-page-change', currentPage)
  }

  if (!currentPage && lastCurrentPage !== 0) {
    lastCurrentPage = 0
    emit('current-page-change', 0)
  }
}

function emitLayoutIfNeeded() {
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
  const root = props.scrollContainer || null

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
    root,
    threshold: 0.25
  })

  resizeObserver = new ResizeObserver(() => {
    emitLayoutIfNeeded()
  })

  resizeObserver.observe(viewerRoot.value)
  if (root) {
    resizeObserver.observe(root)
  }
  refreshObservationTargets()
  emitLayoutIfNeeded()
}

watch(
  () => props.pages,
  async () => {
    await nextTick()
    refreshObservationTargets()
    emitLayoutIfNeeded()
    emitCurrentPage(visiblePageNumbers.value)
  }
)

onMounted(() => {
  setupObservers()
  emitCurrentPage(visiblePageNumbers.value)
})

onBeforeUnmount(() => {
  disconnectObservers()
  visiblePageNumbers.value = new Set()
  props.session.updateVisiblePages(new Set())
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

  const [cssX, cssY] = viewport.convertToViewportPoint(
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
  getPageElement
})
</script>

