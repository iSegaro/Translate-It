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
import { LAYOUT_MODE } from '../composables/usePdfViewerMode.js'
import PdfTranslatedBlock from './PdfTranslatedBlock.vue'
import PdfOcrStatus from './PdfOcrStatus.vue'
import './PdfTranslatedPane.scss'

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
  }
})

const emit = defineEmits(['current-page-change'])
const rootEl = ref(null)
let pageIntersectionObserver = null
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
}

function emitCurrentPage(nextVisiblePages) {
  const visiblePages = [...nextVisiblePages].filter((pageNumber) => Number.isFinite(Number(pageNumber)))
  const currentPage = visiblePages.length > 0
    ? Math.min(...visiblePages)
    : (lastCurrentPage || props.translatedPageData[0]?.pageNumber || 0)

  if (currentPage !== lastCurrentPage) {
    lastCurrentPage = currentPage
    emit('current-page-change', currentPage)
  }
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
  if (typeof IntersectionObserver !== 'function') return

  // The scroll container is injected by the layout owner, not discovered via
  // DOM traversal. This keeps PdfTranslatedPane decoupled from the surrounding
  // DOM structure and reusable in embedded contexts (split view, modal, iframe).
  // The layout always provides scrollContainer. The DOM fallback exists
  // only for backward compatibility if the component is used standalone.
  const scrollRoot = props.scrollContainer || rootEl.value.parentElement
  if (!scrollRoot) return

  pageIntersectionObserver = new IntersectionObserver((entries) => {
    const nextVisible = new Set()

    for (const entry of entries) {
      const pageNumber = Number(entry.target?.dataset?.pageNumber)
      if (!pageNumber) continue

      if (entry.isIntersecting) {
        nextVisible.add(pageNumber)
      }
    }

    emitCurrentPage(nextVisible)
  }, {
    root: scrollRoot,
    threshold: 0.25
  })

  refreshObservationTargets()
  emitCurrentPage(new Set())
}

watch(
  () => props.translatedPageData,
  async () => {
    await nextTick()
    refreshObservationTargets()
    emitCurrentPage(new Set())
  }
)

onMounted(() => {
  setupObserver()
})

onBeforeUnmount(() => {
  disconnectObserver()
  lastCurrentPage = 0
})
</script>
