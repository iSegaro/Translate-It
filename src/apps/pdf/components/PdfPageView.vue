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
import { PDF_RENDER_RESULT_STATUS } from '@/features/pdf-translation/core/PdfRenderer.js'
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
  renderAllowed: {
    type: Boolean,
    default: true
  },
  renderPriority: {
    type: Number,
    default: null
  },
  renderPriorityGroup: {
    type: String,
    default: ''
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
  },
  clearOnUnmount: {
    type: Boolean,
    default: true
  }
})
const emit = defineEmits(['render-started', 'render-committed', 'render-cancelled', 'render-failed'])

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

function cancelRender() {
  if (!canvasEl.value) return
  props.session.cancelRenderPage(props.page.pageNumber, canvasEl.value)
}

defineExpose({
  getRootEl: () => rootEl.value,
  getCanvasEl: () => canvasEl.value,
  getTextLayerEl: () => textLayerEl.value,
  rootEl,
  canvasEl,
  textLayerEl,
  cancelRender
})

function ensureTextLayerRenderer() {
  if (!textLayerRenderer && textLayerEl.value) {
    textLayerRenderer = new PdfTextLayerRenderer(textLayerEl.value)
  }

  return textLayerRenderer
}

async function renderPage() {
  if (!props.visible || !props.renderAllowed || !canvasEl.value) return

  await nextTick()
  if (!props.visible || !props.renderAllowed || !canvasEl.value) return
  const renderer = ensureTextLayerRenderer()
  if (!renderer) return

  emit('render-started', props.page.pageNumber)
  const result = await props.session.renderPage(props.page.pageNumber, canvasEl.value, renderer)

  if (props.visible && props.renderAllowed && canvasEl.value) {
    if (result?.status === PDF_RENDER_RESULT_STATUS.SUCCESS) {
      emit('render-committed', props.page.pageNumber)
    } else if (result?.status === PDF_RENDER_RESULT_STATUS.CANCELLED) {
      emit('render-cancelled', props.page.pageNumber)
    } else {
      emit('render-failed', props.page.pageNumber)
    }
  }

}

function clearPage() {
  props.session.clearPage(props.page.pageNumber, canvasEl.value, textLayerRenderer)
}

watch(
  () => [props.visible, props.renderAllowed],
  async ([visible, renderAllowed], oldState = []) => {
    const [oldVisible] = oldState
    if (visible && renderAllowed) {
      await renderPage()
      return
    }

    if (!visible && oldVisible === true) {
      clearPage()
    }
  },
  { immediate: true, flush: 'post' }
)

watch(
  () => [props.page.scale, props.page.width, props.page.height],
  async () => {
    if (props.visible && props.renderAllowed) {
      await renderPage()
    }
  },
  { flush: 'post' }
)

onBeforeUnmount(() => {
  if (props.clearOnUnmount) {
    clearPage()
  }
  textLayerRenderer?.destroy()
  textLayerRenderer = null
})
</script>
