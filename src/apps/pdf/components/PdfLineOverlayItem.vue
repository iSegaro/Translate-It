<template>
  <div
    class="pdf-line-overlay-item"
    :style="lineStyle"
    :dir="textDirection"
  >
    <span
      ref="textRef"
      class="pdf-line-overlay-item__text"
    >{{ lineText }}</span>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { resolveFontFamily, computeLineHeight, detectTextDirection, buildOverlayBaseStyle, buildOverlayPositionStyle } from '../utils/pdfOverlayTypography.js'

const BASE_STYLE = buildOverlayBaseStyle()
const MIN_FONT_SCALE = 0.6
const FIT_DECREMENT = 0.05

const props = defineProps({
  lineText: {
    type: String,
    required: true
  },
  boundingBox: {
    type: Object,
    required: true
  },
  scale: {
    type: Number,
    default: 1
  },
  fontSize: {
    type: Number,
    default: 12
  },
  fontFamily: {
    type: String,
    default: null
  },
  ascent: {
    type: Number,
    default: null
  },
  descent: {
    type: Number,
    default: null
  }
})

const textRef = ref(null)
const currentFontScale = ref(1)

const textDirection = computed(() => detectTextDirection(props.lineText))

const resolvedFontSize = computed(() => props.fontSize * props.scale * currentFontScale.value)

const lineStyle = computed(() => ({
  ...buildOverlayPositionStyle(props.boundingBox, props.scale),
  ...BASE_STYLE,
  fontSize: `${resolvedFontSize.value}px`,
  fontFamily: resolveFontFamily(props.fontFamily),
  lineHeight: `${computeLineHeight(props.ascent, props.descent)}`
}))

async function fitTextToBox() {
  await nextTick()
  if (!textRef.value) return

  const bbox = props.boundingBox
  if (!bbox) return

  const containerWidth = bbox.width * props.scale
  const containerHeight = bbox.height * props.scale

  if (containerWidth <= 0 || containerHeight <= 0) return

  const el = textRef.value
  const measured = el.getBoundingClientRect()
  if (measured.width <= 0 || measured.height <= 0) return

  if (measured.width <= containerWidth && measured.height <= containerHeight) {
    return
  }

  let fontScale = 1
  while (fontScale > MIN_FONT_SCALE) {
    fontScale -= FIT_DECREMENT
    currentFontScale.value = fontScale
    await nextTick()

    const newMeasured = el.getBoundingClientRect()
    if (newMeasured.width <= containerWidth && newMeasured.height <= containerHeight) {
      return
    }
  }

  currentFontScale.value = MIN_FONT_SCALE
}

onMounted(() => {
  fitTextToBox()
})

watch(
  () => [props.lineText, props.scale, props.fontSize, props.boundingBox?.width, props.boundingBox?.height],
  () => {
    currentFontScale.value = 1
    fitTextToBox()
  }
)
</script>

<style scoped>
.pdf-line-overlay-item__text {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
