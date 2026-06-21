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
      :visible="visiblePageNumbers.has(page.pageNumber)"
    />
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PdfPageView from './PdfPageView.vue'

const props = defineProps({
  pages: {
    type: Array,
    default: () => []
  },
  session: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['layout-change'])
const viewerRoot = ref(null)
const pageViews = new Map()
const visiblePageNumbers = ref(new Set())
let intersectionObserver = null
let resizeObserver = null
let lastWidth = 0

function registerPageView(pageNumber, instance) {
  if (!instance) {
    pageViews.delete(pageNumber)
    return
  }

  pageViews.set(pageNumber, instance)
  const rootEl = instance.rootEl
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
    const rootEl = instance.rootEl
    if (!rootEl) continue

    rootEl.dataset.pageNumber = String(pageNumber)
    intersectionObserver.observe(rootEl)
  }
}

function updateVisiblePages(nextVisible) {
  visiblePageNumbers.value = nextVisible
  props.session.updateVisiblePages(nextVisible)
}

function emitWidthIfNeeded() {
  const width = Math.floor(viewerRoot.value?.clientWidth || 0)
  if (width > 0 && width !== lastWidth) {
    lastWidth = width
    emit('layout-change', width)
  }
}

function setupObservers() {
  disconnectObservers()
  if (!viewerRoot.value) return

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
    root: viewerRoot.value,
    threshold: 0.25
  })

  resizeObserver = new ResizeObserver(() => {
    emitWidthIfNeeded()
  })

  resizeObserver.observe(viewerRoot.value)
  refreshObservationTargets()
  emitWidthIfNeeded()
}

watch(
  () => props.pages,
  async () => {
    await nextTick()
    refreshObservationTargets()
    emitWidthIfNeeded()
  },
  { deep: true }
)

onMounted(() => {
  setupObservers()
})

onBeforeUnmount(() => {
  disconnectObservers()
  visiblePageNumbers.value = new Set()
  props.session.updateVisiblePages(new Set())
})
</script>

<style scoped lang="scss">
.pdf-viewer {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
}
</style>
