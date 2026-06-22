<template>
  <article
    ref="rootEl"
    class="pdf-page"
    :style="pageStyle"
  >
    <div class="pdf-page__label">
      Page {{ page.pageNumber }}
    </div>
    <div class="pdf-page__stage">
      <canvas ref="canvasEl" />
      <div
        ref="textLayerEl"
        class="pdf-page__text-layer"
      />
    </div>
  </article>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { PdfTextLayerRenderer } from '@/features/pdf-translation/core/PdfTextLayerRenderer.js'

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
  }
})

const rootEl = ref(null)
const canvasEl = ref(null)
const textLayerEl = ref(null)
let textLayerRenderer = null

const pageStyle = computed(() => ({
  width: `${props.page.width}px`,
  minHeight: `${props.page.height}px`
}))

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

<style scoped lang="scss">
.pdf-page {
  position: relative;
  border-radius: 16px;
  padding: 16px;
  background: #f5f7fb;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  color: #11161d;
}

.pdf-page__label {
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 700;
  color: rgba(17, 22, 29, 0.68);
}

.pdf-page__stage {
  position: relative;
  display: grid;
}

.pdf-page__stage canvas,
.pdf-page__text-layer {
  grid-area: 1 / 1;
}

.pdf-page__text-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  transform-origin: 0 0;
}
</style>

<style lang="scss">
.pdf-page__text-layer .textLayer {
  position: absolute;
  inset: 0;
  overflow: clip;
  z-index: 0;
  transform-origin: 0 0;
  caret-color: CanvasText;
}

.pdf-page__text-layer .textLayer span {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  -webkit-user-select: text;
  user-select: text;
}
</style>
