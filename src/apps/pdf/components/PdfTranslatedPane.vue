<template>
  <div
    ref="rootEl"
    class="pdf-translated-pane"
  >
    <div
      v-if="!hasTranslatedData"
      class="pdf-translated-pane__empty"
    >
      <p class="pdf-translated-pane__empty-title">
        No translations yet
      </p>
      <p class="pdf-translated-pane__empty-text">
        Click "Translate Visible Pages" to see translated content here.
      </p>
    </div>

    <div
      v-else
      class="pdf-translated-pane__pages"
    >
      <div
        v-for="page in translatedPageData"
        :key="page.pageNumber"
        class="pdf-translated-page"
        :data-page-number="page.pageNumber"
      >
        <div class="pdf-translated-page__header">
          Page {{ page.pageNumber }}
        </div>

        <div
          class="pdf-translated-page__body"
          :style="getPageBodyStyle(page.pageNumber)"
        >
          <div
            v-if="page.blocks.length === 0"
            class="pdf-translated-page__empty"
          >
            <PdfOcrStatus
              :is-scanned-candidate="page.isScannedCandidate"
              :is-ocr-complete="page.isOcrComplete"
              :ocr-error="page.ocrError"
            />
            <span v-if="!page.isScannedCandidate && !page.isOcrComplete">No text blocks on this page</span>
          </div>

          <div
            v-else
            class="pdf-translated-page__blocks"
          >
            <PdfTranslatedBlock
              v-for="block in page.blocks"
              :key="block.id"
              :block="block"
              :translation-state="block.translationState"
              :highlighted="block.id === highlightedBlockId"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { LAYOUT_MODE } from '../composables/usePdfViewerMode.js'
import { getScrollMetrics } from '../utils/pdfGeometryModel.js'
import { CURRENT_PAGE_SOURCE } from '../utils/pdfCurrentPageResolver.js'
import { resolveRenderWindow } from '../utils/pdfRenderWindowResolver.js'
import PdfTranslatedBlock from './PdfTranslatedBlock.vue'
import PdfOcrStatus from './PdfOcrStatus.vue'
import './PdfTranslatedPane.scss'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfTranslatedPanePrimaryPageTrace')

const props = defineProps({
  translatedPageData: {
    type: Array,
    default: () => []
  },
  highlightedBlockId: {
    type: String,
    default: null
  },
  pageMetrics: {
    type: Array,
    default: () => []
  },
  layoutMode: {
    type: String,
    default: LAYOUT_MODE.SINGLE
  },
  scrollContainer: {
    type: HTMLElement,
    default: null
  },
  suppressCurrentPageUpdates: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['current-page-change'])
const rootEl = ref(null)
let pageIntersectionObserver = null
let scrollRoot = null
let currentPageFrameId = null
let lastCurrentPage = 0

const hasTranslatedData = computed(() => {
  return props.translatedPageData.some(page => page.blocks.length > 0)
})

const isSideBySide = computed(() => props.layoutMode === LAYOUT_MODE.SIDE_BY_SIDE)

function getPageBodyStyle(pageNumber) {
  if (!isSideBySide.value) return {}

  const metric = props.pageMetrics.find((page) => page.pageNumber === pageNumber)
  const minHeight = Math.max(0, Math.floor(Number(metric?.height) || 0))

  if (!minHeight) return {}

  return {
    minHeight: `${minHeight}px`
  }
}

function disconnectObserver() {
  pageIntersectionObserver?.disconnect()
  pageIntersectionObserver = null
  if (scrollRoot) {
    scrollRoot.removeEventListener('scroll', handleScroll)
    scrollRoot = null
  }
  cancelCurrentPageFrame()
}

function cancelCurrentPageFrame() {
  if (currentPageFrameId != null) {
    cancelAnimationFrame(currentPageFrameId)
    currentPageFrameId = null
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

function emitCurrentPage() {
  if (props.suppressCurrentPageUpdates) return

  const container = scrollRoot || props.scrollContainer || rootEl.value?.parentElement || null
  const { scrollTop } = getScrollMetrics(container)
  const currentPage = resolveRenderWindow({
    scrollTop,
    container,
    pageSelector: '.pdf-translated-page[data-page-number]',
    bufferPages: 1
  }).primaryPage
  if (!currentPage) return

  if (currentPage !== lastCurrentPage) {
    lastCurrentPage = currentPage
    logger.debug(`[PDF Primary Page] ${JSON.stringify({ emittedCurrentPage: currentPage, currentPageSource: CURRENT_PAGE_SOURCE, scrollTop, timestamp: new Date().toISOString() })}`)
    emit('current-page-change', currentPage)
  }
}

function scheduleCurrentPageUpdate() {
  if (props.suppressCurrentPageUpdates) return
  if (currentPageFrameId != null) return

  currentPageFrameId = requestAnimationFrame(() => {
    currentPageFrameId = null
    emitCurrentPage()
  })
}

function handleScroll() {
  scheduleCurrentPageUpdate()
}

function refreshObservationTargets() {
  if (!pageIntersectionObserver || !rootEl.value) return

  const pages = rootEl.value.querySelectorAll('.pdf-translated-page')
  for (const pageEl of pages) {
    pageIntersectionObserver.observe(pageEl)
  }
}

function setupObserver() {
  disconnectObserver()
  if (!rootEl.value) return

  // The scroll container is injected by the layout owner, not discovered via
  // DOM traversal. This keeps PdfTranslatedPane decoupled from the surrounding
  // DOM structure and reusable in embedded contexts (split view, modal, iframe).
  // The layout always provides scrollContainer. The DOM fallback exists
  // only for backward compatibility if the component is used standalone.
  scrollRoot = props.scrollContainer || rootEl.value.parentElement
  if (!scrollRoot) return

  scrollRoot.addEventListener('scroll', handleScroll, { passive: true })

  if (typeof IntersectionObserver !== 'function') {
    emitCurrentPage()
    return
  }

  pageIntersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const pageNumber = Number(entry.target?.dataset?.pageNumber)
      if (!pageNumber) continue
    }

    emitCurrentPage()
  }, {
    root: scrollRoot,
    threshold: 0.25
  })

  refreshObservationTargets()
  emitCurrentPage()
}

watch(
  () => props.translatedPageData,
  async () => {
    await nextTick()
    refreshObservationTargets()
    emitCurrentPage()
  }
)

onMounted(() => {
  setupObserver()
})

onBeforeUnmount(() => {
  disconnectObserver()
  lastCurrentPage = 0
})

defineExpose({
  refreshCurrentPage: () => emitCurrentPage(true)
})
</script>
