<template>
  <article
    ref="rootEl"
    class="pdf-page"
    :style="pageStyle"
  >
    <div class="pdf-page__label">
      Page {{ page.pageNumber }}
    </div>
    <div
      class="pdf-page__stage"
      :style="stageStyle"
    >
      <canvas ref="canvasEl" />
      <div
        ref="textLayerEl"
        class="pdf-page__text-layer"
        :style="textLayerStyle"
      />
      <PdfLinkOverlay
        :session="session"
        :page-number="page.pageNumber"
        :visible="visible"
        :handle-navigation-target="handleNavigationTarget"
      />
      <PdfOverlayLayer
        v-if="showOverlay"
        :blocks="overlayBlocks"
        :page-metric="page"
        :visible="visible"
        :canvas="canvasEl"
        :page-mask-model="pageMaskModel"
      />
    </div>
  </article>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { PdfTextLayerRenderer } from '@/features/pdf-translation/core/PdfTextLayerRenderer.js'
import PdfOverlayLayer from './PdfOverlayLayer.vue'
import PdfLinkOverlay from './PdfLinkOverlay.vue'
import './PdfPageView.scss'

const props = defineProps({
  page: {
    type: Object,
    required: true
  },
  session: {
    type: Object,
    required: true
  },
  visible: {
    type: Boolean,
    default: false
  },
  showOverlay: {
    type: Boolean,
    default: false
  },
  overlayBlocks: {
    type: Array,
    default: () => []
  },
  handleNavigationTarget: {
    type: Function,
    default: null
  }
})

const rootEl = ref(null)
const canvasEl = ref(null)
const textLayerEl = ref(null)
let textLayerRenderer = null

const pageStyle = computed(() => ({
  width: `${Math.floor(props.page.width)}px`
}))

const stageStyle = computed(() => ({
  width: `${Math.floor(props.page.width)}px`,
  height: `${Math.floor(props.page.height)}px`
}))

const textLayerStyle = computed(() => ({
  '--total-scale-factor': String(props.page.scale || 1)
}))

const pageMaskModel = computed(() => {
  return props.session?.getPageMaskModel?.() || null
})

defineExpose({
  getRootEl: () => rootEl.value,
  getCanvasEl: () => canvasEl.value,
  getTextLayerEl: () => textLayerEl.value,
  rootEl,
  canvasEl,
  textLayerEl
})

function ensureTextLayerRenderer() {
  if (!textLayerRenderer && textLayerEl.value) {
    textLayerRenderer = new PdfTextLayerRenderer(textLayerEl.value)
  }

  return textLayerRenderer
}

async function renderPage() {
  if (!props.visible || !canvasEl.value) return

  await nextTick()
  const renderer = ensureTextLayerRenderer()
  if (!renderer) return

  await props.session.renderPage(props.page.pageNumber, canvasEl.value, renderer)
}

function clearPage() {
  props.session.clearPage(props.page.pageNumber, canvasEl.value, textLayerRenderer)
}

watch(
  () => [props.visible, props.page.pageNumber, props.page.scale, props.page.width, props.page.height],
  async ([visible]) => {
    if (!visible) {
      clearPage()
      return
    }

    await renderPage()
  },
  { immediate: true, flush: 'post' }
)

onBeforeUnmount(() => {
  clearPage()
  textLayerRenderer?.destroy()
  textLayerRenderer = null
})
</script>
